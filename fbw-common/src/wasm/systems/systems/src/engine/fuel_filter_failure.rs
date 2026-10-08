//! Engine fuel filter clog failure.
//!
//! This element only publishes which engine fuel filters are clogged. The SD ENGINE page shows
//! the clog indication and the flight warning system raises the crew awareness caution from it.
//!
//! - A320 FCOM DSC-70-90-40 FUEL FILTER CLOG INDICATION (a320_fcom.txt l.64497-64499): "Indicates
//!   that the pressure loss across the fuel filter is excessive." PRO-ABN-ENG ENG 1(2) FUEL FILTER
//!   CLOG (l.80166-80185): "Crew awareness. Maintenance action is due. The fuel filter is bypassed
//!   and short term engine operation is not affected."
//! - A380 FCOM DSC-70-90 FUEL FLOW (a380_fcom.txt l.113330-113332): "Fuel filter is clogged.
//!   Associated with the ECAM alert ENG 1(2)(3)(4) FUEL FILTER CLOGGED", PRO-ABN-ECAM-10-70
//!   (l.171982-172004): "The pressure drop across the fuel filter is higher than 35 PSI", crew
//!   awareness.
//!
//! Design choice, from the FCOMs: no effect on the engine (the filter is bypassed and short term
//! engine operation is not affected). The A380 ENG FUEL SYS CONTAMINATION alert of a pressure drop
//! above 60 PSI is not modelled.
//!
//! Written variable, per engine n: `ENGINE_n_FUEL_FILTER_CLOGGED` (boolean).

use crate::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};

/// The fuel filter of one engine.
pub struct EngineFuelFilterFailure {
    clog: Failure,
    clogged_id: VariableIdentifier,
}
impl EngineFuelFilterFailure {
    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            clog: Failure::new(FailureType::EngineFuelFilterClog(engine_number)),
            clogged_id: context
                .get_identifier(format!("ENGINE_{}_FUEL_FILTER_CLOGGED", engine_number)),
        }
    }

    pub fn is_clogged(&self) -> bool {
        self.clog.is_active()
    }
}
impl SimulationElement for EngineFuelFilterFailure {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.clog.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.clogged_id, self.is_clogged());
    }
}

/// The fuel filters of the N engines of an aircraft, numbered from 1.
pub struct EngineFuelFilterFailures<const N: usize> {
    engines: [EngineFuelFilterFailure; N],
}
impl<const N: usize> EngineFuelFilterFailures<N> {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            engines: std::array::from_fn(|index| EngineFuelFilterFailure::new(context, index + 1)),
        }
    }

    /// The fuel filter of engine `engine_number` (1 to N).
    pub fn engine(&self, engine_number: usize) -> &EngineFuelFilterFailure {
        &self.engines[engine_number - 1]
    }
}
impl<const N: usize> SimulationElement for EngineFuelFilterFailures<N> {
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
    use crate::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed},
        Aircraft,
    };

    struct TestAircraft {
        fuel_filters: EngineFuelFilterFailures<4>,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                fuel_filters: EngineFuelFilterFailures::new(context),
            }
        }
    }
    impl Aircraft for TestAircraft {}
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.fuel_filters.accept(visitor);
            visitor.visit(self);
        }
    }

    fn test_bed() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.run();
        test_bed
    }

    fn clogged(test_bed: &mut SimulationTestBed<TestAircraft>, engine_number: usize) -> bool {
        test_bed.read_by_name(&format!("ENGINE_{}_FUEL_FILTER_CLOGGED", engine_number))
    }

    #[test]
    fn no_fuel_filter_is_clogged_without_failure() {
        let mut test_bed = test_bed();
        for engine_number in 1..=4 {
            assert!(!clogged(&mut test_bed, engine_number));
        }
    }

    #[test]
    fn a_fuel_filter_clog_is_written_for_its_engine_only() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::EngineFuelFilterClog(3));
        test_bed.run();

        assert!(clogged(&mut test_bed, 3));
        assert!(!clogged(&mut test_bed, 1));
        assert!(!clogged(&mut test_bed, 4));
        assert!(test_bed.query(|a| a.fuel_filters.engine(3).is_clogged()));
    }

    #[test]
    fn a_cleared_fuel_filter_clog_is_no_longer_written() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::EngineFuelFilterClog(1));
        test_bed.run();
        test_bed.unfail(FailureType::EngineFuelFilterClog(1));
        test_bed.run();

        assert!(!clogged(&mut test_bed, 1));
    }
}
