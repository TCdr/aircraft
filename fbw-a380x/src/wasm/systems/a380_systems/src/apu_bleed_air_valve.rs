//! The APU bleed valve of the A380, opened and closed by the APU ECB (systems::apu), with its stuck
//! failures (flyPad ATA 36 "APU bleed valve stuck closed / open", as the A32NX).
//!
//! AIR APU BLEED FAULT (A380 FCOM PRO-ABN-ECAM-10-36, a380_fcom.txt l.167692-167696): "The APU is
//! running, and: The APU bleed valve is abnormally open(closed)". The valve writes the position the
//! ECB commands (`APU_BLEED_AIR_VALVE_COMMANDED_OPEN`) next to its position
//! (`APU_BLEED_AIR_VALVE_OPEN`): the FWS compares them (ApuBleedFaultAlerts.ts).
//!
//! The model has one valve for the APU bleed valve and the APU isolation valve, which "operates
//! simultaneously with the APU bleed valve" (DSC-36-10-30, l.93988): the stuck failures are those of the
//! APU bleed valve.

use crate::pneumatic::{stuck_valve_open_amount, FixedValveCommand};
use systems::{
    failures::{Failure, FailureType},
    pneumatic::{
        valve::DefaultValve, ControllablePneumaticValve, PneumaticContainer, PneumaticValveSignal,
    },
    shared::{ControllerSignal, PneumaticValve},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};
use uom::si::f64::Ratio;

pub struct A380ApuBleedAirValve {
    valve: DefaultValve,
    stuck_closed: Failure,
    stuck_open: Failure,
    /// The last opening the controllers commanded is not zero (the ECB, or the leak protection
    /// that closes the valve)
    commanded_open: bool,
    commanded_open_id: VariableIdentifier,
}
impl A380ApuBleedAirValve {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            valve: DefaultValve::new_closed(),
            stuck_closed: Failure::new(FailureType::ApuBleedValveStuckClosed),
            stuck_open: Failure::new(FailureType::ApuBleedValveStuckOpen),
            commanded_open: false,
            commanded_open_id: context
                .get_identifier("APU_BLEED_AIR_VALVE_COMMANDED_OPEN".to_owned()),
        }
    }

    pub fn update_move_fluid(
        &mut self,
        context: &UpdateContext,
        container_one: &mut impl PneumaticContainer,
        container_two: &mut impl PneumaticContainer,
    ) {
        self.valve
            .update_move_fluid(context, container_one, container_two);
    }
}
impl PneumaticValve for A380ApuBleedAirValve {
    fn is_open(&self) -> bool {
        self.valve.is_open()
    }
}
impl ControllablePneumaticValve for A380ApuBleedAirValve {
    fn update_open_amount<T: PneumaticValveSignal, U: ControllerSignal<T> + ?Sized>(
        &mut self,
        controller: &U,
    ) {
        // Without a signal (ECB unpowered) the valve stays where it is, and so does the command.
        if let Some(signal) = controller.signal() {
            self.commanded_open = signal.target_open_amount() > Ratio::default();
        }
        match stuck_valve_open_amount(&self.stuck_closed, &self.stuck_open) {
            Some(open_amount) => self
                .valve
                .update_open_amount::<T, _>(&FixedValveCommand(open_amount)),
            None => self.valve.update_open_amount(controller),
        }
    }
}
impl SimulationElement for A380ApuBleedAirValve {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.stuck_closed.accept(visitor);
        self.stuck_open.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.commanded_open_id, self.commanded_open);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed},
        Aircraft,
    };
    use uom::si::ratio::ratio;

    struct TestAircraft {
        valve: A380ApuBleedAirValve,
        command: Option<f64>,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                valve: A380ApuBleedAirValve::new(context),
                command: Some(0.),
            }
        }
    }
    struct Command(Option<f64>);
    impl<T: PneumaticValveSignal> ControllerSignal<T> for Command {
        fn signal(&self) -> Option<T> {
            self.0.map(|amount| T::new(Ratio::new::<ratio>(amount)))
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, _context: &UpdateContext) {
            self.valve
                .update_open_amount::<systems::shared::ApuBleedAirValveSignal, _>(&Command(
                    self.command,
                ));
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.valve.accept(visitor);
            visitor.visit(self);
        }
    }

    fn test_bed(command: Option<f64>) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.command(|aircraft| aircraft.command = command);
        test_bed.run();
        test_bed
    }

    fn is_open(test_bed: &SimulationTestBed<TestAircraft>) -> bool {
        test_bed.query(|aircraft| aircraft.valve.is_open())
    }

    fn commanded_open(test_bed: &mut SimulationTestBed<TestAircraft>) -> bool {
        test_bed.read_by_name("APU_BLEED_AIR_VALVE_COMMANDED_OPEN")
    }

    #[test]
    fn the_valve_follows_the_ecb_and_writes_its_command() {
        let mut test_bed = test_bed(Some(1.));
        assert!(is_open(&test_bed));
        assert!(commanded_open(&mut test_bed));

        test_bed.command(|aircraft| aircraft.command = Some(0.));
        test_bed.run();
        assert!(!is_open(&test_bed));
        assert!(!commanded_open(&mut test_bed));
    }

    #[test]
    fn a_valve_stuck_closed_does_not_open_when_commanded_open() {
        let mut test_bed = test_bed(Some(0.));
        test_bed.fail(FailureType::ApuBleedValveStuckClosed);
        test_bed.command(|aircraft| aircraft.command = Some(1.));
        test_bed.run();
        assert!(!is_open(&test_bed));
        assert!(commanded_open(&mut test_bed));
    }

    #[test]
    fn a_valve_stuck_open_does_not_close_when_commanded_closed() {
        let mut test_bed = test_bed(Some(1.));
        test_bed.fail(FailureType::ApuBleedValveStuckOpen);
        test_bed.command(|aircraft| aircraft.command = Some(0.));
        test_bed.run();
        assert!(is_open(&test_bed));
        assert!(!commanded_open(&mut test_bed));
    }

    #[test]
    fn without_a_signal_the_command_is_kept() {
        let mut test_bed = test_bed(Some(1.));
        test_bed.command(|aircraft| aircraft.command = None);
        test_bed.run();
        assert!(commanded_open(&mut test_bed));
        assert!(is_open(&test_bed));
    }
}
