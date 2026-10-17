//! Engine compressor stall, EGT overtemperature and high vibration failures of the A380 (flyPad ATA
//! 72 / 77).
//!
//! The failure logic is the aircraft-independent `systems::engine::engine_malfunction`; this
//! module gives it the A380 values and reads the A380 variables. The FADEC (fadec_a380x) adds the
//! EGT, N1 and N3 offsets to its indications, the flight controls computer (fbw_a380) lowers the
//! N1 of a stalled engine, the FWS raises ENG 1(2)(3)(4) STALL and EGT OVER LIMIT, and the ENGINE
//! SD page shows the vibrations.
//!
//! FBW models the Trent 972 (N1, N2 = IP, N3 = HP); the Airbus documentation describes the GP7270
//! (N1, N2 = HP): its N2 is the FBW N3, as in `engine_failure`. Every value below is a design
//! choice; the documentation gives the symptoms and the limits:
//! - ENG STALL: fluctuating performance parameters, sluggish thrust lever response, high EGT. The
//!   engine stalls when the N1 command is at or above 60 % (above the approach thrust) and recovers
//!   below 57 % (the procedure sets the thrust lever to idle). The stall EGT rise (150 degC) is a
//!   high EGT that stays below the EGT limits: the stalled engine runs at a lower N1 than the
//!   healthy one, whose EGT is at most about 720 degC in climb and 850 degC at takeoff (recorded
//!   values below), so at most 870 degC in climb (EGT limit 970 degC) and 1 000 degC at takeoff
//!   (red line 1 002 degC). The stall gives ENG STALL, not EGT OVER LIMIT.
//! - ENG EGT OVER LIMIT triggers above the EGT limit (970 degC) at or below MCT and above the red
//!   line (1 002 degC) at takeoff thrust; during takeoff the red indication is at or above
//!   1 022 degC, or 1 002 degC for more than 20 s (EWD EgtLimits.ts). The EGT overtemperature
//!   failure is tuned on the raw FADEC EGT recorded on a healthy A380X engine: about 720 degC at N1
//!   76 % (climb), about 820-850 degC at N1 85-88 % (takeoff); 120 degC at 100 % N1 left the failed
//!   engine at 900-940 degC, below the limits. Design choice, as for the A32NX overspeed: 350 degC
//!   at 100 % N1, proportional to the N1, so that
//!   - in climb (N1 76 %) the EGT is about 720 + 266 = 986 degC: amber, above the 970 degC limit
//!     (ENG EGT OVER LIMIT), below the 1 002 degC red line;
//!   - at takeoff (N1 85-88 %) it is about 820 + 298 = 1 118 degC to 850 + 308 = 1 158 degC: red at
//!     once, above the 1 022 degC of the takeoff rule;
//!   - with the thrust reduced to N1 70 % (the procedure reduces the thrust below the EGT limit)
//!     the offset is 245 degC and the EGT below 720 + 245 = 965 degC (the healthy EGT at N1 70 % is
//!     lower than the 720 degC at N1 76 %): back below the EGT limit.
//!   - the amber band at climb thrust is narrow (about 1 % N1 each side of N1 76 %, the EGT grows
//!     by about 14 degC per % N1 with the failure): a higher climb or MCT N1 may show red, which
//!     is still above the limit and gives the same alert.
//! - ENG HI VIBRATIONS: the vibration advisory is N1, N2 above 5 units. The high vibration failure
//!   (N1 7 units at 100 % N1, N3 6 units at 100 % N3, with the square of the rotor speed) is above
//!   the advisory at climb and cruise thrust, below it at reduced thrust and clearly below it at
//!   idle. The advisory is per rotor: each indication pulses on its own above 5 units. At a low
//!   cruise power (FL200, N1 about 60 %, N3 about 81 %) the N1 stays just below it (4.7) and the N3
//!   is above it (5.3): the fan turns at a much lower fraction of its full speed than the HP rotor,
//!   so the same law gives it less vibration. This is intended: the failure does give the advisory
//!   at cruise power (on the HP rotor), high HP vibrations can occur without airframe vibrations,
//!   and the procedure (reduce the thrust of the affected engine above the advisory) brings the N3
//!   back below it.
//! - No overspeed failure: the red limits (N1 111 %, N2 118.7 %) are about 25 % above the TOGA N1
//!   of the FBW engine, so the N1/N2 OVER LIMIT alert is not reachable by an indication offset of a
//!   credible size.

use systems::{
    engine::engine_malfunction::{
        EngineMalfunction, EngineMalfunctionInputs, EngineMalfunctionParameters,
    },
    pneumatic::EngineState,
    simulation::{
        InitContext, Read, Reader, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};
use uom::si::{f64::Ratio, ratio::percent};

pub const A380_ENGINE_MALFUNCTION_PARAMETERS: EngineMalfunctionParameters =
    EngineMalfunctionParameters {
        core_speed_name: "N3",
        stall_threshold_n1_percent: 60.,
        stall_threshold_hysteresis_percent: 3.,
        stall_n1_loss_percent: 15.,
        stall_egt_rise_degrees_celsius: 150.,
        stall_n1_fluctuation_percent: 3.,
        stall_core_fluctuation_percent: 1.5,
        stall_n1_vibration_units: 2.,
        // Tuned on the EGT limits and the recorded EGT (see the module comment).
        overtemperature_egt_rise_at_full_n1_degrees_celsius: 350.,
        // No overspeed failure on the A380 (see the module comment).
        overspeed_n1_fraction: 0.,
        overspeed_core_fraction: 0.,
        overspeed_n1_ceiling_percent: None,
        overspeed_core_ceiling_percent: None,
        high_vibration_n1_units_at_full_speed: 7.,
        high_vibration_core_units_at_full_speed: 6.,
        // MSFS gives one vibration per engine; the HP rotor is shown at 60 % of it.
        normal_core_to_n1_vibration_ratio: 0.6,
    };

/// The malfunctions of one A380 engine and the variables they read.
struct A380EngineMalfunction {
    malfunction: EngineMalfunction,

    engine_state_id: VariableIdentifier,
    n1_id: VariableIdentifier,
    n3_id: VariableIdentifier,
    commanded_n1_id: VariableIdentifier,
    vibration_id: VariableIdentifier,
    n2_vibration_id: VariableIdentifier,

    inputs: EngineMalfunctionInputs,
}
impl A380EngineMalfunction {
    fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            malfunction: EngineMalfunction::new(
                context,
                engine_number,
                A380_ENGINE_MALFUNCTION_PARAMETERS,
            ),
            engine_state_id: context.get_identifier(format!("ENGINE_STATE:{}", engine_number)),
            // The MSFS engine, without the offsets that the FADEC adds to its indications. The MSFS
            // N2 is the FBW N3 (fadec_a380x).
            n1_id: context.get_identifier(format!("TURB ENG N1:{}", engine_number)),
            n3_id: context.get_identifier(format!("TURB ENG N2:{}", engine_number)),
            commanded_n1_id: context
                .get_identifier(format!("AUTOTHRUST_N1_COMMANDED:{}", engine_number)),
            vibration_id: context.get_identifier(format!("TURB ENG VIBRATION:{}", engine_number)),
            n2_vibration_id: context
                .get_identifier(format!("ENGINE_{}_N2_VIBRATION", engine_number)),
            inputs: EngineMalfunctionInputs::default(),
        }
    }

    fn update(&mut self, context: &UpdateContext) {
        self.malfunction.update(context, self.inputs);
    }

    /// Design choice: the IP rotor (N2) vibration of the Trent is the mean of the N1 and N3 ones.
    fn n2_vibration(&self) -> f64 {
        (self.malfunction.n1_vibration() + self.malfunction.core_vibration()) / 2.
    }
}
impl SimulationElement for A380EngineMalfunction {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.malfunction.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        let engine_state: EngineState = reader.read_discrete_or_fallback(
            &self.engine_state_id,
            "EngineState",
            EngineState::Off,
        );
        self.inputs = EngineMalfunctionInputs {
            engine_is_running: engine_state == EngineState::On,
            n1: Ratio::new::<percent>(reader.read(&self.n1_id)),
            core_speed: Ratio::new::<percent>(reader.read(&self.n3_id)),
            commanded_n1: Ratio::new::<percent>(reader.read(&self.commanded_n1_id)),
            msfs_vibration: reader.read(&self.vibration_id),
        };
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.n2_vibration_id, self.n2_vibration());
    }
}

/// The stall, EGT overtemperature and high vibration failures of the four engines.
pub struct A380EngineMalfunctions {
    engines: [A380EngineMalfunction; 4],
}
impl A380EngineMalfunctions {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            engines: [1, 2, 3, 4].map(|number| A380EngineMalfunction::new(context, number)),
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        for engine in &mut self.engines {
            engine.update(context);
        }
    }
}
impl SimulationElement for A380EngineMalfunctions {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for engine in &mut self.engines {
            engine.accept(visitor);
        }

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use systems::{
        failures::FailureType,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft,
        },
    };

    struct TestAircraft {
        malfunctions: A380EngineMalfunctions,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                malfunctions: A380EngineMalfunctions::new(context),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.malfunctions.update(context);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.malfunctions.accept(visitor);
            visitor.visit(self);
        }
    }

    /// Four engines running at climb thrust: 85 % N1 (commanded 85 %), 95 % N3.
    fn engines_at_climb_thrust() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.set_on_ground(false);
        for engine_number in 1..=4 {
            test_bed.write_by_name(&format!("ENGINE_STATE:{}", engine_number), 1.);
            test_bed.write_by_name(&format!("TURB ENG N1:{}", engine_number), 85.);
            test_bed.write_by_name(&format!("TURB ENG N2:{}", engine_number), 95.);
            test_bed.write_by_name(&format!("AUTOTHRUST_N1_COMMANDED:{}", engine_number), 85.);
            test_bed.write_by_name(&format!("TURB ENG VIBRATION:{}", engine_number), 1.);
        }
        test_bed
    }

    fn run_for(test_bed: &mut SimulationTestBed<TestAircraft>, duration: Duration) {
        let step = Duration::from_millis(50);
        let mut elapsed = Duration::ZERO;
        while elapsed < duration {
            test_bed.run_with_delta(step);
            elapsed += step;
        }
    }

    #[test]
    fn an_engine_3_stall_at_climb_thrust_loses_n1_on_engine_3_only() {
        let mut test_bed = engines_at_climb_thrust();
        test_bed.fail(FailureType::EngineCompressorStall(3));
        run_for(&mut test_bed, Duration::from_secs(10));

        for engine_number in 1..=4 {
            let stalled: bool = test_bed.read_by_name(&format!("ENGINE_{}_STALL", engine_number));
            let loss: f64 =
                test_bed.read_by_name(&format!("ENGINE_{}_STALL_N1_LOSS", engine_number));
            let egt_offset: f64 =
                test_bed.read_by_name(&format!("ENGINE_{}_EGT_OFFSET", engine_number));
            assert_eq!(stalled, engine_number == 3);
            assert_eq!(loss > 14., engine_number == 3);
            assert_eq!(egt_offset > 140., engine_number == 3);
        }
    }

    #[test]
    fn the_core_offset_is_written_for_n3() {
        let mut test_bed = engines_at_climb_thrust();
        test_bed.fail(FailureType::EngineCompressorStall(1));
        run_for(&mut test_bed, Duration::from_secs(5));

        // The stall fluctuation of the core speed goes to the FBW N3.
        let mut moved = false;
        for _ in 0..40 {
            run_for(&mut test_bed, Duration::from_millis(100));
            let n3_offset: f64 = test_bed.read_by_name("ENGINE_1_N3_OFFSET");
            moved |= n3_offset.abs() > 0.5;
        }
        assert!(moved);
    }

    #[test]
    fn no_overspeed_on_the_a380() {
        let mut test_bed = engines_at_climb_thrust();
        test_bed.fail(FailureType::EngineOverspeed(1));
        run_for(&mut test_bed, Duration::from_secs(30));

        let n1_offset: f64 = test_bed.read_by_name("ENGINE_1_N1_OFFSET");
        assert!(n1_offset.abs() < 1e-9);
    }

    /// The raw FADEC EGT of a healthy A380X engine (recorded): about 720 degC at N1 76 % in
    /// climb, about 820-850 degC at N1 85-88 % at takeoff.
    const CLIMB_N1_PERCENT: f64 = 76.;
    const CLIMB_HEALTHY_EGT: f64 = 720.;
    const TAKEOFF_N1_AND_HEALTHY_EGT: [(f64, f64); 2] = [(85., 820.), (88., 850.)];
    /// The EGT limits (EWD EgtLimits.ts).
    const EGT_LIMIT: f64 = 970.;
    const EGT_RED_LINE: f64 = 1002.;
    const EGT_TAKEOFF_RED: f64 = 1022.;

    /// The EGT offset of engine 1 with a failure, after 40 s at the given N1 (N1 command alike).
    fn egt_offset_with(failure: FailureType, n1: f64) -> f64 {
        let mut test_bed = engines_at_climb_thrust();
        test_bed.write_by_name("TURB ENG N1:1", n1);
        test_bed.write_by_name("AUTOTHRUST_N1_COMMANDED:1", n1);
        test_bed.fail(failure);
        run_for(&mut test_bed, Duration::from_secs(40));
        test_bed.read_by_name("ENGINE_1_EGT_OFFSET")
    }

    #[test]
    fn the_egt_overtemperature_is_amber_at_climb_thrust() {
        let egt = CLIMB_HEALTHY_EGT
            + egt_offset_with(FailureType::EngineEgtOvertemperature(1), CLIMB_N1_PERCENT);
        assert!(egt > EGT_LIMIT && egt < EGT_RED_LINE, "climb EGT {}", egt);
    }

    #[test]
    fn the_egt_overtemperature_is_red_at_once_at_takeoff_thrust() {
        for (n1, healthy_egt) in TAKEOFF_N1_AND_HEALTHY_EGT {
            let egt = healthy_egt + egt_offset_with(FailureType::EngineEgtOvertemperature(1), n1);
            assert!(egt >= EGT_TAKEOFF_RED, "takeoff EGT {} at N1 {}", egt, n1);
        }
    }

    #[test]
    fn reducing_the_thrust_brings_the_egt_overtemperature_below_the_limit() {
        // The healthy EGT at N1 70 % is below the 720 degC of N1 76 %: an upper bound.
        let egt =
            CLIMB_HEALTHY_EGT + egt_offset_with(FailureType::EngineEgtOvertemperature(1), 70.);
        assert!(egt < EGT_LIMIT, "EGT {} at N1 70 %", egt);
    }

    /// The stalled engine loses N1, so the healthy EGT at the N1 before the stall is an upper
    /// bound: the stall gives a high EGT, below the limits (ENG STALL, not EGT OVER LIMIT).
    #[test]
    fn the_stall_egt_stays_below_the_limits() {
        let climb_egt =
            CLIMB_HEALTHY_EGT + egt_offset_with(FailureType::EngineCompressorStall(1), 76.);
        assert!(climb_egt < EGT_LIMIT, "climb EGT {}", climb_egt);
        let (n1, healthy_egt) = TAKEOFF_N1_AND_HEALTHY_EGT[1];
        let takeoff_egt = healthy_egt + egt_offset_with(FailureType::EngineCompressorStall(1), n1);
        assert!(takeoff_egt < EGT_RED_LINE, "takeoff EGT {}", takeoff_egt);
    }

    #[test]
    fn the_high_vibration_is_above_the_5_units_advisory_at_climb_thrust_on_n1_n2_and_n3() {
        let mut test_bed = engines_at_climb_thrust();
        test_bed.fail(FailureType::EngineHighVibration(2));
        run_for(&mut test_bed, Duration::from_secs(40));

        let n1: f64 = test_bed.read_by_name("ENGINE_2_N1_VIBRATION");
        let n2: f64 = test_bed.read_by_name("ENGINE_2_N2_VIBRATION");
        let n3: f64 = test_bed.read_by_name("ENGINE_2_N3_VIBRATION");
        let other_n1: f64 = test_bed.read_by_name("ENGINE_1_N1_VIBRATION");
        assert!(n1 > 5. && n2 > 5. && n3 > 5.);
        assert!(other_n1 < 5.);
    }

    /// Like the A320 measured in the sim (N2 vibration above its advisory at idle): at flight idle
    /// (N1 28 %, N3 65 %, MSFS vibration 2.2 as recorded) N1, N2 and N3 are clearly below the
    /// 5 units advisory.
    #[test]
    fn at_idle_the_high_vibration_is_clearly_below_the_advisory() {
        let mut test_bed = engines_at_climb_thrust();
        test_bed.fail(FailureType::EngineHighVibration(2));
        test_bed.write_by_name("TURB ENG N1:2", 28.);
        test_bed.write_by_name("TURB ENG N2:2", 65.);
        test_bed.write_by_name("AUTOTHRUST_N1_COMMANDED:2", 28.);
        test_bed.write_by_name("TURB ENG VIBRATION:2", 2.2);
        run_for(&mut test_bed, Duration::from_secs(40));

        let n1: f64 = test_bed.read_by_name("ENGINE_2_N1_VIBRATION");
        let n2: f64 = test_bed.read_by_name("ENGINE_2_N2_VIBRATION");
        let n3: f64 = test_bed.read_by_name("ENGINE_2_N3_VIBRATION");
        assert!(
            n1 < 4. && n2 < 4. && n3 < 4.,
            "N1 {} N2 {} N3 {}",
            n1,
            n2,
            n3
        );
    }

    /// A low cruise power (FL200, N1 60 %, N3 81.5 %, MSFS vibration 2.2): the advisory shows on
    /// the HP rotor (N3 5.3) while the N1 stays just below it (4.7), see the module comment.
    #[test]
    fn at_a_low_cruise_power_the_high_vibration_advisory_shows_on_n3() {
        let mut test_bed = engines_at_climb_thrust();
        test_bed.fail(FailureType::EngineHighVibration(2));
        test_bed.write_by_name("TURB ENG N1:2", 60.);
        test_bed.write_by_name("TURB ENG N2:2", 81.5);
        test_bed.write_by_name("AUTOTHRUST_N1_COMMANDED:2", 60.);
        test_bed.write_by_name("TURB ENG VIBRATION:2", 2.2);
        run_for(&mut test_bed, Duration::from_secs(40));

        let n1: f64 = test_bed.read_by_name("ENGINE_2_N1_VIBRATION");
        let n3: f64 = test_bed.read_by_name("ENGINE_2_N3_VIBRATION");
        assert!(n3 > 5. && n1 < 5., "N1 {} N3 {}", n1, n3);
    }

    #[test]
    fn the_high_vibration_goes_below_the_advisory_at_reduced_thrust() {
        let mut test_bed = engines_at_climb_thrust();
        test_bed.fail(FailureType::EngineHighVibration(2));
        test_bed.write_by_name("TURB ENG N1:2", 55.);
        test_bed.write_by_name("TURB ENG N2:2", 70.);
        run_for(&mut test_bed, Duration::from_secs(40));

        let n1: f64 = test_bed.read_by_name("ENGINE_2_N1_VIBRATION");
        let n3: f64 = test_bed.read_by_name("ENGINE_2_N3_VIBRATION");
        assert!(n1 < 5. && n3 < 5.);
    }
}
