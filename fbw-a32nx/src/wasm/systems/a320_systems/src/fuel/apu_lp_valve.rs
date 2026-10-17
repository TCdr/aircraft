//! APU low-pressure (LP) fuel valve of the A320.
//!
//! The APU MASTER SW ON opens the APU fuel isolation valve; the APU FIRE pb, pushed and released,
//! closes the LP fuel valve.
//!
//! FUEL APU LP VALVE FAULT triggers when the valve position disagrees with the selected position.
//! This module simulates the valve with its jam failure (flyPad failure "APU LP fuel valve jammed
//! in place") and tells the FWC the disagreement (L:A32NX_FUEL_APU_LP_VALVE_FAULT). A valve jammed
//! closed while the APU needs fuel starves the APU: its fuel pressure switch sees no pressure and
//! the ECB shuts the APU down (APU FAULT).
//!
//! Design choices (no published value): the valve travels in the 3 s of the MSFS APU valve
//! (flight_model.cfg Valve.8 OpeningTime), and the position monitoring reports a valve that is
//! still not where it is commanded 1 s after its travel time (as the engine LP valves,
//! systems::fuel::engine_lp_valve).

use std::time::Duration;
use systems::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

pub struct ApuLpFuelValve {
    master_switch_id: VariableIdentifier,
    fire_button_released_id: VariableIdentifier,
    open_percentage_id: VariableIdentifier,
    fault_id: VariableIdentifier,

    jammed: Failure,

    master_switch_is_on: bool,
    fire_button_is_released: bool,

    /// 0 (closed) to 1 (open), None before the first update.
    position: Option<f64>,
    /// How long the valve position has disagreed with its command without a break.
    disagreement_duration: Duration,
}
impl ApuLpFuelValve {
    const TRAVEL_TIME: Duration = Duration::from_secs(3);
    const DISAGREEMENT_MARGIN: Duration = Duration::from_secs(1);

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            master_switch_id: context.get_identifier("OVHD_APU_MASTER_SW_PB_IS_ON".to_owned()),
            fire_button_released_id: context.get_identifier("FIRE_BUTTON_APU".to_owned()),
            open_percentage_id: context
                .get_identifier("FUEL_APU_LP_VALVE_OPEN_PERCENTAGE".to_owned()),
            fault_id: context.get_identifier("FUEL_APU_LP_VALVE_FAULT".to_owned()),
            jammed: Failure::new(FailureType::ApuLpValveJammed),
            master_switch_is_on: false,
            fire_button_is_released: false,
            position: None,
            disagreement_duration: Duration::ZERO,
        }
    }

    /// The valve is commanded open by the APU MASTER SW and closed by the APU FIRE pb.
    fn is_commanded_open(&self) -> bool {
        self.master_switch_is_on && !self.fire_button_is_released
    }

    pub fn update(&mut self, context: &UpdateContext) {
        let target = if self.is_commanded_open() { 1. } else { 0. };
        let position = match self.position {
            // A flight loaded with the APU running starts with the valve where it is commanded.
            None => target,
            Some(position) if self.jammed.is_active() => position,
            Some(position) => {
                let travel = context.delta().as_secs_f64() / Self::TRAVEL_TIME.as_secs_f64();
                if target > position {
                    (position + travel).min(target)
                } else {
                    (position - travel).max(target)
                }
            }
        };
        self.position = Some(position);

        self.disagreement_duration = if (position - target).abs() > f64::EPSILON {
            self.disagreement_duration + context.delta()
        } else {
            Duration::ZERO
        };
    }

    /// The valve position has disagreed with its command for longer than its travel time.
    pub fn has_fault(&self) -> bool {
        self.disagreement_duration > Self::TRAVEL_TIME + Self::DISAGREEMENT_MARGIN
    }

    /// The valve stays closed while the APU MASTER SW asks for fuel: no fuel reaches the APU.
    pub fn blocks_apu_fuel(&self) -> bool {
        self.is_commanded_open() && self.has_fault() && self.position.unwrap_or(1.) <= 0.
    }
}
impl SimulationElement for ApuLpFuelValve {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.jammed.accept(visitor);
        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.master_switch_is_on = reader.read(&self.master_switch_id);
        self.fire_button_is_released = reader.read(&self.fire_button_released_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.open_percentage_id, self.position.unwrap_or(0.) * 100.);
        writer.write(&self.fault_id, self.has_fault());
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
        valve: ApuLpFuelValve,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                valve: ApuLpFuelValve::new(context),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.valve.update(context);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.valve.accept(visitor);
            visitor.visit(self);
        }
    }

    struct ApuValveTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl ApuValveTestBed {
        /// Cold and dark: APU MASTER SW OFF, the valve closed.
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            test_bed.run_for(Duration::from_secs(1));
            test_bed
        }

        fn master_switch(&mut self, on: bool) {
            self.write_by_name("OVHD_APU_MASTER_SW_PB_IS_ON", on);
        }

        fn fire_button_released(&mut self, released: bool) {
            self.write_by_name("FIRE_BUTTON_APU", released);
        }

        fn run_for(&mut self, duration: Duration) {
            let step = Duration::from_millis(100);
            let mut elapsed = Duration::ZERO;
            while elapsed < duration {
                self.run_with_delta(step);
                elapsed += step;
            }
        }

        fn open_percentage(&mut self) -> f64 {
            self.read_by_name("FUEL_APU_LP_VALVE_OPEN_PERCENTAGE")
        }

        fn fault(&mut self) -> bool {
            self.read_by_name("FUEL_APU_LP_VALVE_FAULT")
        }

        fn blocks_apu_fuel(&self) -> bool {
            self.query(|a| a.valve.blocks_apu_fuel())
        }
    }
    impl TestBed for ApuValveTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    #[test]
    fn the_master_switch_opens_the_valve_in_its_travel_time_without_a_fault() {
        let mut test_bed = ApuValveTestBed::new();
        assert_eq!(test_bed.open_percentage(), 0.);

        test_bed.master_switch(true);
        test_bed.run_for(Duration::from_millis(1500));
        assert!((test_bed.open_percentage() - 50.).abs() < 5.);

        test_bed.run_for(Duration::from_secs(10));
        assert_eq!(test_bed.open_percentage(), 100.);
        assert!(!test_bed.fault());
        assert!(!test_bed.blocks_apu_fuel());
    }

    #[test]
    fn the_apu_fire_pushbutton_closes_the_valve() {
        let mut test_bed = ApuValveTestBed::new();
        test_bed.master_switch(true);
        test_bed.run_for(Duration::from_secs(5));

        test_bed.fire_button_released(true);
        test_bed.run_for(Duration::from_secs(5));

        assert_eq!(test_bed.open_percentage(), 0.);
        assert!(!test_bed.fault());
    }

    #[test]
    fn a_valve_jammed_closed_gives_a_fault_and_starves_the_apu_when_the_master_switch_is_on() {
        let mut test_bed = ApuValveTestBed::new();
        test_bed.fail(FailureType::ApuLpValveJammed);
        test_bed.master_switch(true);

        test_bed.run_for(Duration::from_secs(3));
        assert!(
            !test_bed.fault(),
            "not before the travel time and its margin"
        );

        test_bed.run_for(Duration::from_secs(2));
        assert!(test_bed.fault());
        assert!(test_bed.blocks_apu_fuel());
        assert_eq!(test_bed.open_percentage(), 0.);
    }

    #[test]
    fn a_valve_jammed_open_gives_a_fault_when_the_master_switch_is_off() {
        let mut test_bed = ApuValveTestBed::new();
        test_bed.master_switch(true);
        test_bed.run_for(Duration::from_secs(5));
        test_bed.fail(FailureType::ApuLpValveJammed);

        test_bed.master_switch(false);
        test_bed.run_for(Duration::from_secs(5));

        assert!(test_bed.fault());
        assert_eq!(test_bed.open_percentage(), 100.);
        assert!(
            !test_bed.blocks_apu_fuel(),
            "the APU is not asking for fuel"
        );
    }

    #[test]
    fn the_fault_clears_once_the_valve_agrees_again() {
        let mut test_bed = ApuValveTestBed::new();
        test_bed.fail(FailureType::ApuLpValveJammed);
        test_bed.master_switch(true);
        test_bed.run_for(Duration::from_secs(5));
        assert!(test_bed.fault());

        test_bed.master_switch(false);
        test_bed.run_for(Duration::from_millis(200));

        assert!(!test_bed.fault());
    }
}
