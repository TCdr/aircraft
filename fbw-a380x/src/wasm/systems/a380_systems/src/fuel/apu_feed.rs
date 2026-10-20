//! The APU feed line of the A380: the APU LP valve and the APU isolation valve, which the
//! systems-host FQMS (CpiomF/FuelApuFeed) opens with the APU MASTER pb-sw and closes with it OFF
//! or the APU FIRE pb pushed.
//!
//! A feed valve closed while the APU MASTER pb-sw is ON (a jammed valve: FUEL APU FEED FAULT)
//! leaves the APU without fuel pressure: it cannot start, and a running APU shuts down on its fuel
//! low pressure fault. The fuel left in the line downstream of the valves keeps a running APU
//! going through its normal shutdown (cool-down, fire), so a commanded closure starves nothing.

use systems::simulation::{
    InitContext, Read, SimulationElement, SimulatorReader, VariableIdentifier,
};

pub(super) struct ApuFeedLine {
    abnormally_closed_id: VariableIdentifier,
    abnormally_closed: bool,
}
impl ApuFeedLine {
    pub(super) fn new(context: &mut InitContext) -> Self {
        Self {
            abnormally_closed_id: context
                .get_unprefixed_identifier("A380X_FUEL_APU_FEED_ABNORMALLY_CLOSED".to_owned()),
            abnormally_closed: false,
        }
    }

    /// Fuel reaches the APU from feed tank 4 through the feed line.
    pub(super) fn supplies_fuel(&self, feed_tank_4_has_fuel: bool) -> bool {
        feed_tank_4_has_fuel && !self.abnormally_closed
    }
}
impl SimulationElement for ApuFeedLine {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.abnormally_closed = reader.read(&self.abnormally_closed_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::simulation::{
        test::{SimulationTestBed, TestBed, WriteByName},
        Aircraft, SimulationElementVisitor,
    };

    struct TestAircraft {
        apu_feed: ApuFeedLine,
    }
    impl Aircraft for TestAircraft {}
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.apu_feed.accept(visitor);
            visitor.visit(self);
        }
    }

    fn test_bed(abnormally_closed: bool) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(|context| TestAircraft {
            apu_feed: ApuFeedLine::new(context),
        });
        test_bed.write_by_name("A380X_FUEL_APU_FEED_ABNORMALLY_CLOSED", abnormally_closed);
        test_bed.run();
        test_bed
    }

    #[test]
    fn supplies_the_apu_with_the_feed_valves_open() {
        let test_bed = test_bed(false);
        assert!(test_bed.query(|a| a.apu_feed.supplies_fuel(true)));
    }

    #[test]
    fn a_feed_valve_closed_with_the_apu_master_on_starves_the_apu() {
        let test_bed = test_bed(true);
        assert!(!test_bed.query(|a| a.apu_feed.supplies_fuel(true)));
    }

    #[test]
    fn no_fuel_without_fuel_in_feed_tank_4() {
        let test_bed = test_bed(false);
        assert!(!test_bed.query(|a| a.apu_feed.supplies_fuel(false)));
    }
}
