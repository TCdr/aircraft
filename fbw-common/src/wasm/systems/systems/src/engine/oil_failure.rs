//! Engine oil system failures: an oil leak, a clogged oil filter and an oil overheat.
//!
//! This element only publishes which oil failures are active on each engine. The engine oil
//! quantity, pressure and temperature are computed by the FADEC of each aircraft, which reads
//! these variables and applies the physical effect (the shared rules are in
//! `fadec_common/src/EngineOilFailures.hpp`). The flight warning system raises the ECAM alerts
//! from the oil parameters the FADEC computes, and from the clogged filter.
//!
//! - Oil leak: the engine loses oil overboard. Its oil quantity falls, and once the oil tank is
//!   nearly empty the oil pressure falls (A320 FCOM PRO-ABN-ENG ENG 1(2) OIL LO PR, A380 FCOM
//!   PRO-ABN-ECAM-10-70 ENG 1(2)(3)(4) OIL PRESS LO).
//! - Oil filter clog: the pressure loss across the oil filter is excessive (A320 FCOM
//!   DSC-70-90-40 OIL FILTER CLOG INDICATION, A380 FCOM ENG 1(2)(3)(4) OIL FILTER CLOGGED): an
//!   indication and a crew awareness alert.
//! - Oil overheat (design choice, the FCOMs give no cause): the oil is no longer cooled enough and
//!   its temperature rises with the engine thrust (A320 ENG 1(2) OIL HI TEMP, A380 ENG
//!   1(2)(3)(4) OIL TEMP HI).
//!
//! Written variables, per engine n:
//! - `ENGINE_n_OIL_LEAK`, `ENGINE_n_OIL_FILTER_CLOGGED`, `ENGINE_n_OIL_OVERHEAT`: booleans.

use crate::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};

/// The oil failures of one engine.
pub struct EngineOilFailure {
    leak: Failure,
    filter_clog: Failure,
    overheat: Failure,

    leak_id: VariableIdentifier,
    filter_clogged_id: VariableIdentifier,
    overheat_id: VariableIdentifier,
}
impl EngineOilFailure {
    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            leak: Failure::new(FailureType::EngineOilLeak(engine_number)),
            filter_clog: Failure::new(FailureType::EngineOilFilterClog(engine_number)),
            overheat: Failure::new(FailureType::EngineOilOverheat(engine_number)),
            leak_id: context.get_identifier(format!("ENGINE_{}_OIL_LEAK", engine_number)),
            filter_clogged_id: context
                .get_identifier(format!("ENGINE_{}_OIL_FILTER_CLOGGED", engine_number)),
            overheat_id: context.get_identifier(format!("ENGINE_{}_OIL_OVERHEAT", engine_number)),
        }
    }

    pub fn is_leaking(&self) -> bool {
        self.leak.is_active()
    }

    pub fn filter_is_clogged(&self) -> bool {
        self.filter_clog.is_active()
    }

    pub fn is_overheating(&self) -> bool {
        self.overheat.is_active()
    }
}
impl SimulationElement for EngineOilFailure {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.leak.accept(visitor);
        self.filter_clog.accept(visitor);
        self.overheat.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.leak_id, self.is_leaking());
        writer.write(&self.filter_clogged_id, self.filter_is_clogged());
        writer.write(&self.overheat_id, self.is_overheating());
    }
}

/// The oil failures of the N engines of an aircraft, numbered from 1.
pub struct EngineOilFailures<const N: usize> {
    engines: [EngineOilFailure; N],
}
impl<const N: usize> EngineOilFailures<N> {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            engines: std::array::from_fn(|index| EngineOilFailure::new(context, index + 1)),
        }
    }

    /// The oil failures of engine `engine_number` (1 to N).
    pub fn engine(&self, engine_number: usize) -> &EngineOilFailure {
        &self.engines[engine_number - 1]
    }
}
impl<const N: usize> SimulationElement for EngineOilFailures<N> {
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
        oil_failures: EngineOilFailures<4>,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                oil_failures: EngineOilFailures::new(context),
            }
        }
    }
    impl Aircraft for TestAircraft {}
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.oil_failures.accept(visitor);
            visitor.visit(self);
        }
    }

    fn test_bed() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.run();
        test_bed
    }

    fn written(test_bed: &mut SimulationTestBed<TestAircraft>, name: &str) -> bool {
        test_bed.read_by_name(name)
    }

    #[test]
    fn no_oil_failure_is_written_without_failures() {
        let mut test_bed = test_bed();
        for engine in 1..=4 {
            assert!(!written(
                &mut test_bed,
                &format!("ENGINE_{}_OIL_LEAK", engine)
            ));
            assert!(!written(
                &mut test_bed,
                &format!("ENGINE_{}_OIL_FILTER_CLOGGED", engine)
            ));
            assert!(!written(
                &mut test_bed,
                &format!("ENGINE_{}_OIL_OVERHEAT", engine)
            ));
        }
    }

    #[test]
    fn an_oil_leak_is_written_for_its_engine_only() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::EngineOilLeak(3));
        test_bed.run();

        assert!(written(&mut test_bed, "ENGINE_3_OIL_LEAK"));
        assert!(!written(&mut test_bed, "ENGINE_2_OIL_LEAK"));
        assert!(!written(&mut test_bed, "ENGINE_3_OIL_FILTER_CLOGGED"));
        assert!(!written(&mut test_bed, "ENGINE_3_OIL_OVERHEAT"));
        assert!(test_bed.query(|a| a.oil_failures.engine(3).is_leaking()));
    }

    #[test]
    fn an_oil_filter_clog_is_written_for_its_engine_only() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::EngineOilFilterClog(1));
        test_bed.run();

        assert!(written(&mut test_bed, "ENGINE_1_OIL_FILTER_CLOGGED"));
        assert!(!written(&mut test_bed, "ENGINE_4_OIL_FILTER_CLOGGED"));
        assert!(!written(&mut test_bed, "ENGINE_1_OIL_LEAK"));
    }

    #[test]
    fn an_oil_overheat_is_written_for_its_engine_only() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::EngineOilOverheat(2));
        test_bed.run();

        assert!(written(&mut test_bed, "ENGINE_2_OIL_OVERHEAT"));
        assert!(!written(&mut test_bed, "ENGINE_1_OIL_OVERHEAT"));
    }

    #[test]
    fn a_cleared_oil_failure_is_no_longer_written() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::EngineOilLeak(1));
        test_bed.run();
        test_bed.unfail(FailureType::EngineOilLeak(1));
        test_bed.run();

        assert!(!written(&mut test_bed, "ENGINE_1_OIL_LEAK"));
    }
}
