//! The engine shutdowns that the FADEC of an A380 engine commands by itself: FADEC overheat and
//! overthrust protection (ENG 1(2)(3)(4) FAIL, where the FADEC shows the reason).
//!
//! - FADEC overheat (flyPad "Engine n FADEC overheat (engine shutdown)"): the FADEC shuts the engine
//!   down (FADEC OVHT). It is not the FADEC TEMP HI of the flyPad "Engine n FADEC overheat" failure
//!   (crew awareness, no shutdown, engine_control_failure.rs).
//! - Overthrust (flyPad "Engine n overthrust (thrust control lost)"): the engine thrust is above the
//!   commanded thrust. The FADEC shuts the engine down on the ground with the levers in the IDLE
//!   detent or in reverse (e.g. an overthrust at touchdown or during a rejected takeoff), and
//!   reduces its thrust in flight below 15 000 ft; there is no protection above 15 000 ft or above
//!   M 0.4. The shutdown is the ENG FAIL "THRUST CTL LOST" case, and the in-flight thrust reduction
//!   the CTL SYS FAULT fuel cutback, which also lights the ENG MASTER FAULT light.
//!
//! The shutdown cuts the engine fuel ([`systems::engine::engine_failure::EngineFailure`]): the FADEC
//! makes no automatic relight on a cut engine (the ENG FAIL procedure of these cases has no auto
//! relight and ends with the ENG MASTER OFF).
//!
//! Design choices (no published figure):
//! - A shutdown stays (latched) until the failure is removed and the ENG MASTER is OFF: the engine
//!   does not relight while the cause is there, and the crew restarts it with a MASTER OFF then ON.
//! - The overthrust itself (the excess thrust) is not modelled: the failure is the FADEC detecting
//!   it. In flight below 15 000 ft and M 0.4 the FADEC reduces the thrust to the commanded thrust,
//!   which leaves the modelled thrust as it is and gives the CTL SYS FAULT fuel cutback; above, the
//!   protection does nothing.
//! - The protection acts only on a running engine; the levers in the IDLE detent or in reverse are
//!   the TLA at or below 1 degree, as the A380 start sequence takes the idle.

use systems::{
    failures::{Failure, FailureType},
    shared::InternationalStandardAtmosphere,
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};
use uom::si::{f64::Length, length::foot};

/// Why the FADEC shut the engine down (`ENGINE_n_FADEC_SHUTDOWN`, FWS EngineMonitoringAlerts.ts
/// FadecShutdownReason).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FadecShutdownReason {
    None = 0,
    FadecOverheat = 1,
    ThrustControlLost = 2,
}

/// What the FADEC knows of its engine and of the aircraft.
#[derive(Clone, Copy, Debug)]
pub struct FadecShutdownInputs {
    pub engine_is_running: bool,
    pub master_switch_is_on: bool,
    pub thrust_lever_angle_degrees: f64,
}

pub struct FadecAutomaticShutdown {
    overheat: Failure,
    overthrust: Failure,
    reason_id: VariableIdentifier,
    overthrust_cutback_id: VariableIdentifier,
    reason: FadecShutdownReason,
    overthrust_cutback: bool,
}
impl FadecAutomaticShutdown {
    /// No overthrust protection above 15 000 ft or above M 0.4
    const OVERTHRUST_PROTECTION_MAX_ALTITUDE_FEET: f64 = 15_000.;
    const OVERTHRUST_PROTECTION_MAX_MACH: f64 = 0.4;
    /// The thrust levers in the IDLE detent or in the reverse range (design choice, see the module)
    const LEVER_AT_IDLE_MAX_ANGLE_DEGREES: f64 = 1.;

    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            overheat: Failure::new(FailureType::FadecOverheatShutdown(engine_number)),
            overthrust: Failure::new(FailureType::EngineOverthrust(engine_number)),
            reason_id: context.get_identifier(format!("ENGINE_{}_FADEC_SHUTDOWN", engine_number)),
            overthrust_cutback_id: context
                .get_identifier(format!("ENGINE_{}_OVERTHRUST_CUTBACK", engine_number)),
            reason: FadecShutdownReason::None,
            overthrust_cutback: false,
        }
    }

    pub fn update(&mut self, context: &UpdateContext, inputs: &FadecShutdownInputs) {
        let failure_active = self.overheat.is_active() || self.overthrust.is_active();
        if self.reason != FadecShutdownReason::None
            && !failure_active
            && !inputs.master_switch_is_on
        {
            self.reason = FadecShutdownReason::None;
        }

        let pressure_altitude =
            InternationalStandardAtmosphere::altitude_from_pressure(context.ambient_pressure());
        let protection_in_flight = !context.is_on_ground()
            && pressure_altitude
                < Length::new::<foot>(Self::OVERTHRUST_PROTECTION_MAX_ALTITUDE_FEET)
            && context.mach_number().0 <= Self::OVERTHRUST_PROTECTION_MAX_MACH;
        let levers_at_idle_or_reverse =
            inputs.thrust_lever_angle_degrees <= Self::LEVER_AT_IDLE_MAX_ANGLE_DEGREES;

        if inputs.engine_is_running && self.reason == FadecShutdownReason::None {
            if self.overheat.is_active() {
                self.reason = FadecShutdownReason::FadecOverheat;
            } else if self.overthrust.is_active()
                && context.is_on_ground()
                && levers_at_idle_or_reverse
            {
                self.reason = FadecShutdownReason::ThrustControlLost;
            }
        }

        self.overthrust_cutback = self.overthrust.is_active()
            && inputs.engine_is_running
            && self.reason == FadecShutdownReason::None
            && protection_in_flight;
    }

    /// The FADEC has shut the engine down: its fuel stays cut.
    pub fn fuel_is_cut(&self) -> bool {
        self.reason != FadecShutdownReason::None
    }

    /// The overthrust protection has shut the engine down: the ENG MASTER FAULT light.
    pub fn overthrust_shutdown(&self) -> bool {
        self.reason == FadecShutdownReason::ThrustControlLost
    }
}
impl SimulationElement for FadecAutomaticShutdown {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.overheat.accept(visitor);
        self.overthrust.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.reason_id, self.reason as u8 as f64);
        writer.write(&self.overthrust_cutback_id, self.overthrust_cutback);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };

    struct TestAircraft {
        shutdown: FadecAutomaticShutdown,
        inputs: FadecShutdownInputs,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                shutdown: FadecAutomaticShutdown::new(context, 2),
                inputs: FadecShutdownInputs {
                    engine_is_running: true,
                    master_switch_is_on: true,
                    thrust_lever_angle_degrees: 0.,
                },
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.shutdown.update(context, &self.inputs);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.shutdown.accept(visitor);
            visitor.visit(self);
        }
    }

    fn test_bed(on_ground: bool, altitude_feet: f64, mach: f64) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.set_on_ground(on_ground);
        test_bed.set_pressure_altitude(Length::new::<foot>(altitude_feet));
        test_bed.write_by_name("AIRSPEED MACH", mach);
        test_bed.run();
        test_bed
    }

    fn reason(test_bed: &mut SimulationTestBed<TestAircraft>) -> f64 {
        test_bed.read_by_name("ENGINE_2_FADEC_SHUTDOWN")
    }

    fn cutback(test_bed: &mut SimulationTestBed<TestAircraft>) -> bool {
        test_bed.read_by_name("ENGINE_2_OVERTHRUST_CUTBACK")
    }

    fn set_inputs(test_bed: &mut SimulationTestBed<TestAircraft>, inputs: FadecShutdownInputs) {
        test_bed.command(|aircraft| aircraft.inputs = inputs);
    }

    #[test]
    fn no_shutdown_without_failure() {
        let mut test_bed = test_bed(false, 30_000., 0.85);
        test_bed.run();
        assert_eq!(reason(&mut test_bed), 0.);
        assert!(!cutback(&mut test_bed));
        assert!(!test_bed.query(|aircraft| aircraft.shutdown.fuel_is_cut()));
    }

    #[test]
    fn a_fadec_overheat_shuts_the_engine_down_in_flight_and_on_ground() {
        for on_ground in [false, true] {
            let mut test_bed = test_bed(on_ground, 30_000., 0.85);
            test_bed.fail(FailureType::FadecOverheatShutdown(2));
            test_bed.run();
            assert_eq!(reason(&mut test_bed), 1.);
            assert!(test_bed.query(|aircraft| aircraft.shutdown.fuel_is_cut()));
            assert!(!test_bed.query(|aircraft| aircraft.shutdown.overthrust_shutdown()));
        }
    }

    #[test]
    fn the_overthrust_protection_shuts_the_engine_down_on_ground_with_the_lever_at_idle_or_reverse()
    {
        for lever in [0., -10.] {
            let mut test_bed = test_bed(true, 0., 0.1);
            test_bed.fail(FailureType::EngineOverthrust(2));
            set_inputs(
                &mut test_bed,
                FadecShutdownInputs {
                    engine_is_running: true,
                    master_switch_is_on: true,
                    thrust_lever_angle_degrees: lever,
                },
            );
            test_bed.run();
            assert_eq!(reason(&mut test_bed), 2.);
            assert!(test_bed.query(|aircraft| aircraft.shutdown.overthrust_shutdown()));
            assert!(!cutback(&mut test_bed));
        }
    }

    #[test]
    fn no_overthrust_shutdown_on_ground_with_the_lever_above_idle() {
        let mut test_bed = test_bed(true, 0., 0.1);
        test_bed.fail(FailureType::EngineOverthrust(2));
        set_inputs(
            &mut test_bed,
            FadecShutdownInputs {
                engine_is_running: true,
                master_switch_is_on: true,
                thrust_lever_angle_degrees: 45.,
            },
        );
        test_bed.run();
        assert_eq!(reason(&mut test_bed), 0.);

        // The rejected takeoff: the levers back to idle
        set_inputs(
            &mut test_bed,
            FadecShutdownInputs {
                engine_is_running: true,
                master_switch_is_on: true,
                thrust_lever_angle_degrees: 0.,
            },
        );
        test_bed.run();
        assert_eq!(reason(&mut test_bed), 2.);
    }

    #[test]
    fn in_flight_below_15000_ft_and_m_0_4_the_overthrust_protection_reduces_the_thrust() {
        let mut test_bed = test_bed(false, 5_000., 0.3);
        test_bed.fail(FailureType::EngineOverthrust(2));
        test_bed.run();
        assert!(cutback(&mut test_bed));
        assert_eq!(reason(&mut test_bed), 0.);
        assert!(!test_bed.query(|aircraft| aircraft.shutdown.fuel_is_cut()));
    }

    #[test]
    fn no_overthrust_protection_above_15000_ft_or_m_0_4() {
        for (altitude, mach) in [(20_000., 0.3), (5_000., 0.5)] {
            let mut test_bed = test_bed(false, altitude, mach);
            test_bed.fail(FailureType::EngineOverthrust(2));
            test_bed.run();
            assert!(!cutback(&mut test_bed));
            assert_eq!(reason(&mut test_bed), 0.);
        }
    }

    #[test]
    fn the_shutdown_stays_until_the_failure_is_removed_and_the_master_is_off() {
        let mut test_bed = test_bed(false, 30_000., 0.85);
        test_bed.fail(FailureType::FadecOverheatShutdown(2));
        test_bed.run();
        // The engine stops; the MASTER OFF alone does not end the shutdown
        set_inputs(
            &mut test_bed,
            FadecShutdownInputs {
                engine_is_running: false,
                master_switch_is_on: false,
                thrust_lever_angle_degrees: 0.,
            },
        );
        test_bed.run();
        assert_eq!(reason(&mut test_bed), 1.);

        test_bed.unfail(FailureType::FadecOverheatShutdown(2));
        test_bed.run();
        assert_eq!(reason(&mut test_bed), 0.);
        assert!(!test_bed.query(|aircraft| aircraft.shutdown.fuel_is_cut()));
    }

    #[test]
    fn the_failure_removed_with_the_master_on_keeps_the_shutdown() {
        let mut test_bed = test_bed(true, 0., 0.);
        test_bed.fail(FailureType::FadecOverheatShutdown(2));
        test_bed.run();
        test_bed.unfail(FailureType::FadecOverheatShutdown(2));
        test_bed.run();
        assert_eq!(reason(&mut test_bed), 1.);
    }
}
