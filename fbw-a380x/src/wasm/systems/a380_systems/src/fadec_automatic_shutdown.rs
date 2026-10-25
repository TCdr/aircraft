//! The engine shutdowns that the FADEC of an A380 engine commands by itself: FADEC overheat and
//! overthrust protection (A380 FCOM ENG 1(2)(3)(4) FAIL, a380_fcom.txt l.171719-171720: "In the
//! case of FADEC overheat or overthrust protection activation, the FADEC indicates the reason of
//! the failure").
//!
//! - FADEC overheat (flyPad "Engine n FADEC overheat (engine shutdown)"): "In the case of a FADEC
//!   OVHT : The FADEC automatically shuts down the engine." (l.171781-171782). It is not the FADEC
//!   TEMP HI of the flyPad "Engine n FADEC overheat" failure (l.171683-171693, crew awareness, no
//!   shutdown, engine_control_failure.rs).
//! - Overthrust (flyPad "Engine n overthrust (thrust control lost)"): the engine thrust is above the
//!   commanded thrust. DSC-70-20-20 OVERTHRUST PROTECTION (l.111447-111462): "If FADEC detects an
//!   overthrust on an engine: - The FADEC shuts down the affected engine, when the aircraft is on
//!   ground and the throttle levers are in IDLE detent or in the reverser position (e.g. if the
//!   overthrust is detected at touchdown or during a rejected takeoff) - The FADEC reduces the thrust
//!   of the affected engine, when the aircraft is in flight below 15 000 ft. There is no overthrust
//!   protection above 15 000 ft, or when the aircraft speed is above M 0.4." The shutdown is the ENG
//!   FAIL "THRUST CTL LOST" case (l.171797-171800), and with the in-flight thrust reduction it is
//!   the CTL SYS FAULT "Fuel cutback following overthrust detection" (l.171321, DSC-70-90
//!   l.112856-112858), which also lights the ENG MASTER FAULT light (l.112856).
//!
//! - Engine overspeed (flyPad "Engine n overspeed (HMU shutdown)"): the rotors run away and the
//!   hydromechanical metering unit protects the engine by closing the HP shutoff valve, which is
//!   independent of the FADEC control loops. The engine shuts down in flight and on ground; there
//!   is no ECAM alert of its own, the crew gets the ENG FAIL of any shutdown engine.
//!
//! The shutdown cuts the engine fuel ([`systems::engine::engine_failure::EngineFailure`]): the FADEC
//! makes no automatic relight on a cut engine (the ENG FAIL procedure of these cases has no AUTO
//! RELIGHT line and ends with ENG MASTER OFF, l.171783-171808).
//!
//! Design choices (the FCOM gives no figure):
//! - The overspeed trip: the documentation gives no overspeed threshold. The runaway is shown by
//!   the rising N1 and N3 indications of `engine_malfunction.rs` (the MSFS rotor speeds cannot be
//!   raised), and the HMU trips 5 s after the runaway starts, before the indications settle.
//! - A shutdown stays (latched) until the failure is removed and the ENG MASTER is OFF: the engine
//!   does not relight while the cause is there, and the crew restarts it with a MASTER OFF then ON.
//! - The overthrust itself (the excess thrust) is not modelled: the failure is the FADEC detecting
//!   it. In flight below 15 000 ft and M 0.4 the FADEC reduces the thrust to the commanded thrust,
//!   which leaves the modelled thrust as it is and gives the CTL SYS FAULT fuel cutback; above, the
//!   protection does nothing.
//! - The protection acts only on a running engine; the levers "in IDLE detent or in the reverser
//!   position" are the TLA at or below 1 degree, as the A380 start sequence takes the idle.

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
    /// The HMU closed the HP shutoff valve of an overspeeding engine
    HmuOverspeed = 3,
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
    overspeed: Failure,
    reason_id: VariableIdentifier,
    overthrust_cutback_id: VariableIdentifier,
    reason: FadecShutdownReason,
    overthrust_cutback: bool,
    overspeed_seconds: f64,
}
impl FadecAutomaticShutdown {
    /// Design choice: the time the rotors run away before the HMU closes the HP shutoff valve
    const OVERSPEED_TRIP_DELAY_SECONDS: f64 = 5.;
    /// "There is no overthrust protection above 15 000 ft, or when the aircraft speed is above M 0.4"
    const OVERTHRUST_PROTECTION_MAX_ALTITUDE_FEET: f64 = 15_000.;
    const OVERTHRUST_PROTECTION_MAX_MACH: f64 = 0.4;
    /// The thrust levers in the IDLE detent or in the reverse range (design choice, see the module)
    const LEVER_AT_IDLE_MAX_ANGLE_DEGREES: f64 = 1.;

    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            overheat: Failure::new(FailureType::FadecOverheatShutdown(engine_number)),
            overthrust: Failure::new(FailureType::EngineOverthrust(engine_number)),
            overspeed: Failure::new(FailureType::EngineOverspeed(engine_number)),
            reason_id: context.get_identifier(format!("ENGINE_{}_FADEC_SHUTDOWN", engine_number)),
            overthrust_cutback_id: context
                .get_identifier(format!("ENGINE_{}_OVERTHRUST_CUTBACK", engine_number)),
            reason: FadecShutdownReason::None,
            overthrust_cutback: false,
            overspeed_seconds: 0.,
        }
    }

    pub fn update(&mut self, context: &UpdateContext, inputs: &FadecShutdownInputs) {
        let failure_active =
            self.overheat.is_active() || self.overthrust.is_active() || self.overspeed.is_active();
        if self.reason != FadecShutdownReason::None
            && !failure_active
            && !inputs.master_switch_is_on
        {
            self.reason = FadecShutdownReason::None;
        }

        self.overspeed_seconds = if self.overspeed.is_active() && inputs.engine_is_running {
            self.overspeed_seconds + context.delta_as_secs_f64()
        } else {
            0.
        };

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
            } else if self.overspeed_seconds >= Self::OVERSPEED_TRIP_DELAY_SECONDS {
                self.reason = FadecShutdownReason::HmuOverspeed;
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

    /// The overthrust protection has shut the engine down: the ENG MASTER FAULT light (DSC-70-90
    /// l.112856-112858, "The overthrust protection is active and the FADEC automatically shut downs
    /// the engine").
    pub fn overthrust_shutdown(&self) -> bool {
        self.reason == FadecShutdownReason::ThrustControlLost
    }
}
impl SimulationElement for FadecAutomaticShutdown {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.overheat.accept(visitor);
        self.overthrust.accept(visitor);
        self.overspeed.accept(visitor);

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
    use std::time::Duration;
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
    fn an_overspeed_shuts_the_engine_down_after_the_runaway_in_flight_and_on_ground() {
        for on_ground in [false, true] {
            let mut test_bed = test_bed(on_ground, 30_000., 0.85);
            test_bed.fail(FailureType::EngineOverspeed(2));
            test_bed.run_with_delta(Duration::from_secs(4));
            assert_eq!(reason(&mut test_bed), 0.);
            assert!(!test_bed.query(|aircraft| aircraft.shutdown.fuel_is_cut()));

            test_bed.run_with_delta(Duration::from_secs(2));
            assert_eq!(reason(&mut test_bed), 3.);
            assert!(test_bed.query(|aircraft| aircraft.shutdown.fuel_is_cut()));
            assert!(!test_bed.query(|aircraft| aircraft.shutdown.overthrust_shutdown()));
        }
    }

    #[test]
    fn the_overspeed_runaway_restarts_when_the_failure_is_removed_before_the_trip() {
        let mut test_bed = test_bed(false, 30_000., 0.85);
        test_bed.fail(FailureType::EngineOverspeed(2));
        test_bed.run_with_delta(Duration::from_secs(4));
        test_bed.unfail(FailureType::EngineOverspeed(2));
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.fail(FailureType::EngineOverspeed(2));
        test_bed.run_with_delta(Duration::from_secs(4));
        assert_eq!(reason(&mut test_bed), 0.);
    }

    #[test]
    fn the_overspeed_of_an_engine_that_is_not_running_does_not_trip() {
        let mut test_bed = test_bed(true, 0., 0.);
        set_inputs(
            &mut test_bed,
            FadecShutdownInputs {
                engine_is_running: false,
                master_switch_is_on: false,
                thrust_lever_angle_degrees: 0.,
            },
        );
        test_bed.fail(FailureType::EngineOverspeed(2));
        test_bed.run_with_delta(Duration::from_secs(10));
        assert_eq!(reason(&mut test_bed), 0.);
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
