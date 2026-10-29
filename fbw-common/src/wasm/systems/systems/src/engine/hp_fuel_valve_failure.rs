//! HP fuel shutoff valve stuck failure of an engine, and the FADEC detection of an abnormal valve
//! position.
//!
//! The failure sticks the valve in the position it has when the failure comes: closed for an
//! engine that is shut down, open for a running engine. The FADEC compares the valve position with
//! its command:
//! - A320 ENG 1(2) HP FUEL VALVE: the valve is failed closed or open. Failed closed with the
//!   engine below idle: HP FUEL VALVE NOT OPEN; failed open with the engine below idle: HP FUEL POS
//!   SWT FAULT. The ENG FAULT light comes on for an abnormal valve position.
//! - A380 ENG 1(2)(3)(4) HP FUEL VLV FAULT: the valve is failed closed or open. During an engine
//!   start: HP FUEL VALVE NOT OPEN; during an engine shutdown: HP FUEL VALVE NOT CLOSED, and the
//!   engine shuts down by the closure of the LP fuel valve. The ENG MASTER FAULT light comes on for
//!   an abnormal valve position.
//!
//! Effects on the engine (the aircraft crates apply them):
//! - stuck closed: no fuel reaches the engine, which does not light up (start, relight);
//! - stuck open: none. The engine still shuts down at the ENG MASTER OFF, by the LP fuel valve
//!   (A380) and the fuel metering valve the FADEC closes (on the A320 the ENG MASTER OFF makes the
//!   FADEC close the LP and HP fuel shutoff valves).
//!
//! Design choice, no published value: the FADEC detects the abnormal position when it lasts 2 s (the
//! travel time of the valve).
//!
//! Written variable, per engine n: `ENGINE_n_HP_FUEL_VALVE_FAULT` ([`HpFuelValveFault`]).

use crate::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};
use std::time::Duration;

/// The abnormal position of the HP fuel valve the FADEC detects, written as
/// `ENGINE_n_HP_FUEL_VALVE_FAULT`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HpFuelValveFault {
    None = 0,
    /// The valve is closed while the FADEC commands it open.
    NotOpen = 1,
    /// The valve is open while the FADEC commands it closed.
    NotClosed = 2,
}

/// The HP fuel shutoff valve of one engine: its stuck failure and the FADEC position monitoring.
pub struct HpFuelValveFailure {
    stuck: Failure,
    fault_id: VariableIdentifier,

    /// The position the valve sticks in while the failure is active (true: open).
    stuck_position_open: Option<bool>,
    position_open: bool,
    abnormal_position_time: Duration,
    fault: HpFuelValveFault,
}
impl HpFuelValveFailure {
    /// Design choice, see the module comment.
    const DETECTION_TIME: Duration = Duration::from_secs(2);

    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            stuck: Failure::new(FailureType::EngineHpFuelValveStuck(engine_number)),
            fault_id: context
                .get_identifier(format!("ENGINE_{}_HP_FUEL_VALVE_FAULT", engine_number)),
            stuck_position_open: None,
            position_open: false,
            abnormal_position_time: Duration::ZERO,
            fault: HpFuelValveFault::None,
        }
    }

    /// `commanded_open`: the FADEC commands the valve open (the aircraft rules of its command).
    pub fn update(&mut self, delta: Duration, commanded_open: bool) {
        if self.stuck.is_active() {
            // The valve sticks where it is when the failure comes.
            let stuck_open = *self.stuck_position_open.get_or_insert(self.position_open);
            self.position_open = stuck_open;
        } else {
            self.stuck_position_open = None;
            self.position_open = commanded_open;
        }

        if self.position_open == commanded_open {
            self.abnormal_position_time = Duration::ZERO;
            self.fault = HpFuelValveFault::None;
        } else {
            self.abnormal_position_time += delta;
            if self.abnormal_position_time >= Self::DETECTION_TIME {
                self.fault = if commanded_open {
                    HpFuelValveFault::NotOpen
                } else {
                    HpFuelValveFault::NotClosed
                };
            }
        }
    }

    /// The valve is stuck closed: no fuel reaches the engine.
    pub fn is_stuck_closed(&self) -> bool {
        self.stuck_position_open == Some(false)
    }

    pub fn is_open(&self) -> bool {
        self.position_open
    }

    /// The abnormal position the FADEC has detected.
    pub fn fault(&self) -> HpFuelValveFault {
        self.fault
    }

    /// The FADEC has detected an abnormal valve position (ENG FAULT light).
    pub fn position_is_abnormal(&self) -> bool {
        self.fault != HpFuelValveFault::None
    }
}
impl SimulationElement for HpFuelValveFailure {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.stuck.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.fault_id, self.fault as u8 as f64);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed},
        Aircraft, UpdateContext,
    };

    struct TestAircraft {
        valve: HpFuelValveFailure,
        commanded_open: bool,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                valve: HpFuelValveFailure::new(context, 2),
                commanded_open: false,
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.valve.update(context.delta(), self.commanded_open);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.valve.accept(visitor);
            visitor.visit(self);
        }
    }

    struct ValveTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl ValveTestBed {
        fn new() -> Self {
            Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            }
        }

        fn command(mut self, open: bool) -> Self {
            self.test_bed
                .command(|a: &mut TestAircraft| a.commanded_open = open);
            self
        }

        fn stuck(mut self) -> Self {
            self.test_bed.fail(FailureType::EngineHpFuelValveStuck(2));
            self
        }

        fn released(mut self) -> Self {
            self.test_bed.unfail(FailureType::EngineHpFuelValveStuck(2));
            self
        }

        fn run_for(mut self, duration: Duration) -> Self {
            let step = Duration::from_millis(100);
            let mut elapsed = Duration::ZERO;
            while elapsed < duration {
                self.test_bed.run_with_delta(step);
                elapsed += step;
            }
            self
        }

        fn fault(&self) -> HpFuelValveFault {
            self.test_bed.query(|a| a.valve.fault())
        }

        fn written_fault(&mut self) -> f64 {
            self.test_bed.read_by_name("ENGINE_2_HP_FUEL_VALVE_FAULT")
        }

        fn is_open(&self) -> bool {
            self.test_bed.query(|a| a.valve.is_open())
        }

        fn is_stuck_closed(&self) -> bool {
            self.test_bed.query(|a| a.valve.is_stuck_closed())
        }
    }

    #[test]
    fn a_working_valve_follows_its_command_without_fault() {
        let mut test_bed = ValveTestBed::new()
            .command(true)
            .run_for(Duration::from_secs(5));
        assert!(test_bed.is_open());
        assert_eq!(test_bed.fault(), HpFuelValveFault::None);

        test_bed = test_bed.command(false).run_for(Duration::from_secs(5));
        assert!(!test_bed.is_open());
        assert_eq!(test_bed.written_fault(), 0.);
    }

    #[test]
    fn a_valve_stuck_closed_at_the_start_is_detected_not_open_after_2_s() {
        let mut test_bed = ValveTestBed::new()
            .stuck()
            .run_for(Duration::from_secs(1))
            .command(true)
            .run_for(Duration::from_millis(1500));
        assert!(!test_bed.is_open());
        assert!(test_bed.is_stuck_closed());
        assert_eq!(test_bed.fault(), HpFuelValveFault::None);

        test_bed = test_bed.run_for(Duration::from_secs(1));
        assert_eq!(test_bed.fault(), HpFuelValveFault::NotOpen);
        assert_eq!(test_bed.written_fault(), 1.);
    }

    #[test]
    fn a_valve_stuck_open_on_a_running_engine_is_detected_not_closed_at_the_shutdown() {
        let mut test_bed = ValveTestBed::new()
            .command(true)
            .run_for(Duration::from_secs(1))
            .stuck()
            .run_for(Duration::from_secs(5));
        // stuck open while commanded open: nothing to see, and the fuel still flows
        assert_eq!(test_bed.fault(), HpFuelValveFault::None);
        assert!(!test_bed.is_stuck_closed());

        test_bed = test_bed.command(false).run_for(Duration::from_secs(3));
        assert!(test_bed.is_open());
        assert_eq!(test_bed.fault(), HpFuelValveFault::NotClosed);
        assert_eq!(test_bed.written_fault(), 2.);
    }

    #[test]
    fn the_fault_ends_when_the_command_agrees_with_the_stuck_position() {
        let test_bed = ValveTestBed::new()
            .stuck()
            .run_for(Duration::from_secs(1))
            .command(true)
            .run_for(Duration::from_secs(3))
            .command(false)
            .run_for(Duration::from_millis(200));
        assert_eq!(test_bed.fault(), HpFuelValveFault::None);
    }

    #[test]
    fn a_cleared_failure_gives_the_valve_back_to_its_command() {
        let test_bed = ValveTestBed::new()
            .stuck()
            .run_for(Duration::from_secs(1))
            .command(true)
            .run_for(Duration::from_secs(3))
            .released()
            .run_for(Duration::from_millis(200));
        assert!(test_bed.is_open());
        assert!(!test_bed.is_stuck_closed());
        assert_eq!(test_bed.fault(), HpFuelValveFault::None);
    }
}
