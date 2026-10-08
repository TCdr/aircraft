//! Engine compressor stall, EGT overtemperature and high vibration failures of the A380 (flyPad ATA
//! 72 / 77).
//!
//! The failure logic is the aircraft-independent `systems::engine::engine_malfunction`; this
//! module gives it the A380 values and reads the A380 variables. The FADEC (fadec_a380x) adds the
//! EGT, N1 and N3 offsets to its indications, the flight controls computer (fbw_a380) lowers the
//! N1 of a stalled engine, the FWS raises ENG 1(2)(3)(4) STALL and EGT OVER LIMIT, and the ENGINE
//! SD page shows the vibrations.
//!
//! FBW models the Trent 972 (N1, N2 = IP, N3 = HP); the A380 FCOM is written for the GP7270 (N1,
//! N2 = HP): the FCOM N2 is the FBW N3, as in `engine_failure`. Every value below is a design
//! choice; the FCOM gives the symptoms and the limits (A380 FCOM PRO-ABN-ECAM-10-70, a380_fcom.txt):
//! - ENG STALL (l.172812-172821): fluctuating performance parameters, sluggish thrust lever
//!   response, high EGT. The engine stalls when the N1 command is at or above 60 % (above the
//!   approach thrust) and recovers below 57 % ("THR LEVER ... IDLE", l.172842).
//! - ENG EGT OVER LIMIT (l.171488-171494) triggers above the EGT limit at or below MCT and above
//!   the red line at takeoff thrust. FBW shows its own Trent EGT limits on the EWD (850 / 900 degC,
//!   EWD EgtLimits.ts) instead of the GP7270 970 / 1002 degC: the EGT overtemperature (120 degC at
//!   100 % N1) takes a climb EGT above that EGT limit.
//! - ENG HI VIBRATIONS (l.174816): the vibration advisory is N1, N2 above 5 units (also
//!   DSC-70-90, l.113396). The high vibration failure (N1 7 units at 100 % N1, N3 6 units
//!   at 100 % N3) is above the advisory at climb and cruise thrust and below it at reduced thrust.
//! - No overspeed failure: the FCOM red limits (N1 111 %, N2 118.7 %, DSC-70-90 l.113079,
//!   113301) are about 25 % above the TOGA N1 of the FBW engine, so the N1/N2 OVER LIMIT alert is
//!   not reachable by an indication offset of a credible size.

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
        overtemperature_egt_rise_at_full_n1_degrees_celsius: 120.,
        // No overspeed failure on the A380 (see the module comment).
        overspeed_n1_fraction: 0.,
        overspeed_core_fraction: 0.,
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
