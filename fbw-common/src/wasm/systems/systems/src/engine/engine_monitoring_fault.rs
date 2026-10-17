//! Engine faults that the FADEC detects and reports to the flight warning system, and that have no
//! effect on the engine model: each one is a flyPad failure that only raises its ECAM alert.
//!
//! Each aircraft lists its own faults (see the aircraft crates); the faults of both aircraft are in
//! [`EngineMonitoringFaultKind`]. Each alert is crew awareness (or a procedure without engine model
//! effect):
//! - A320: ENG 1(2) FADEC ALTERNATOR, OVSPD PROT FAULT, PROBES FAULT, SENSOR FAULT, ONE TLA FAULT,
//!   REV SWITCH FAULT.
//! - A380: ENG 1(2)(3)(4) FUEL STRAINER CLOGGED, FUEL FILTER MONITORING FAULT, OIL CHIP DETECTED,
//!   MINOR FAULT, OVERTHRUST PROT LOST, SENSOR FAULT.
//!
//! Written variable, per engine n and fault: `ENGINE_n_<fault>` (boolean, see
//! [`EngineMonitoringFaultKind::variable_name`]).

use crate::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};

/// A fault the FADEC of an engine detects and reports, without effect on the engine model.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum EngineMonitoringFaultKind {
    /// A320 ENG 1(2) FADEC ALTERNATOR: the FADEC loses its own electrical supply and is then
    /// supplied by the aircraft network.
    FadecAlternator,
    /// A320 ENG 1(2) OVSPD PROT FAULT: the overspeed protection is lost.
    OverspeedProtection,
    /// A320 ENG 1(2) PROBES FAULT: T12, P0 or PT2 data unavailable on both channels.
    InletProbes,
    /// A320 ENG 1(2) SENSOR FAULT: PS3, T25, T3, N1 or N2 data unavailable on both channels; A380
    /// ENG 1(2)(3)(4) SENSOR FAULT: an engine total pressure, total temperature or static
    /// temperature probe failed.
    Sensors,
    /// A320 ENG 1(2) ONE TLA FAULT: one of the two resolvers of the thrust lever is failed (no
    /// published triggering condition; both resolvers failed is ENG THR LEVER FAULT).
    OneThrustLeverResolver,
    /// A320 ENG 1(2) REV SWITCH FAULT: the reverser permission switch is failed.
    ReverserPermissionSwitch,
    /// A380 ENG 1(2)(3)(4) FUEL STRAINER CLOGGED: the pressure drop across the fuel strainer is
    /// above 12 PSI.
    FuelStrainerClog,
    /// A380 ENG 1(2)(3)(4) FUEL FILTER MONITORING FAULT: the fuel filter is no longer monitored.
    FuelFilterMonitoring,
    /// A380 ENG 1(2)(3)(4) OIL CHIP DETECTED: metallic particles in the engine oil system.
    OilChip,
    /// A380 ENG 1(2)(3)(4) MINOR FAULT: some internal engine sensors or one FADEC channel failed.
    MinorFault,
    /// A380 ENG 1(2)(3)(4) OVERTHRUST PROT LOST: the overthrust protection is lost.
    OverthrustProtection,
}
impl EngineMonitoringFaultKind {
    /// The end of the variable name `ENGINE_n_<name>` of the fault.
    pub fn variable_name(&self) -> &'static str {
        match self {
            EngineMonitoringFaultKind::FadecAlternator => "FADEC_ALTERNATOR_FAULT",
            EngineMonitoringFaultKind::OverspeedProtection => "OVERSPEED_PROTECTION_FAULT",
            EngineMonitoringFaultKind::InletProbes => "PROBES_FAULT",
            EngineMonitoringFaultKind::Sensors => "SENSOR_FAULT",
            EngineMonitoringFaultKind::OneThrustLeverResolver => "ONE_TLA_FAULT",
            EngineMonitoringFaultKind::ReverserPermissionSwitch => "REVERSER_SWITCH_FAULT",
            EngineMonitoringFaultKind::FuelStrainerClog => "FUEL_STRAINER_CLOGGED",
            EngineMonitoringFaultKind::FuelFilterMonitoring => "FUEL_FILTER_MONITORING_FAULT",
            EngineMonitoringFaultKind::OilChip => "OIL_CHIP_DETECTED",
            EngineMonitoringFaultKind::MinorFault => "MINOR_FAULT",
            EngineMonitoringFaultKind::OverthrustProtection => "OVERTHRUST_PROTECTION_LOST",
        }
    }
}

/// One fault of one engine: its flyPad failure and the variable it writes.
struct EngineMonitoringFault {
    kind: EngineMonitoringFaultKind,
    failure: Failure,
    id: VariableIdentifier,
}
impl SimulationElement for EngineMonitoringFault {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.id, self.failure.is_active());
    }
}

/// The FADEC monitoring faults of the N engines of an aircraft, numbered from 1.
pub struct EngineMonitoringFaults<const N: usize> {
    /// Per engine, the faults in the order of the aircraft list.
    engines: [Vec<EngineMonitoringFault>; N],
}
impl<const N: usize> EngineMonitoringFaults<N> {
    /// `kinds`: the faults the real aircraft has.
    pub fn new(context: &mut InitContext, kinds: &[EngineMonitoringFaultKind]) -> Self {
        Self {
            engines: std::array::from_fn(|index| {
                let engine_number = index + 1;
                kinds
                    .iter()
                    .map(|&kind| EngineMonitoringFault {
                        kind,
                        failure: Failure::new(FailureType::EngineMonitoringFault(
                            engine_number,
                            kind,
                        )),
                        id: context.get_identifier(format!(
                            "ENGINE_{}_{}",
                            engine_number,
                            kind.variable_name()
                        )),
                    })
                    .collect()
            }),
        }
    }

    /// The fault `kind` of engine `engine_number` (1 to N) is active. False for a fault that is not
    /// in the list of the aircraft.
    pub fn is_active(&self, engine_number: usize, kind: EngineMonitoringFaultKind) -> bool {
        self.engines[engine_number - 1]
            .iter()
            .any(|fault| fault.kind == kind && fault.failure.is_active())
    }
}
impl<const N: usize> SimulationElement for EngineMonitoringFaults<N> {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for engine in &mut self.engines {
            for fault in engine.iter_mut() {
                fault.accept(visitor);
            }
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

    const KINDS: [EngineMonitoringFaultKind; 2] = [
        EngineMonitoringFaultKind::OilChip,
        EngineMonitoringFaultKind::Sensors,
    ];

    struct TestAircraft {
        faults: EngineMonitoringFaults<4>,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                faults: EngineMonitoringFaults::new(context, &KINDS),
            }
        }
    }
    impl Aircraft for TestAircraft {}
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.faults.accept(visitor);
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
    fn no_fault_is_written_without_failure() {
        let mut test_bed = test_bed();
        for engine_number in 1..=4 {
            assert!(!written(
                &mut test_bed,
                &format!("ENGINE_{}_OIL_CHIP_DETECTED", engine_number)
            ));
            assert!(!written(
                &mut test_bed,
                &format!("ENGINE_{}_SENSOR_FAULT", engine_number)
            ));
        }
    }

    #[test]
    fn a_fault_is_written_for_its_engine_and_kind_only() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::EngineMonitoringFault(
            3,
            EngineMonitoringFaultKind::OilChip,
        ));
        test_bed.run();

        assert!(written(&mut test_bed, "ENGINE_3_OIL_CHIP_DETECTED"));
        assert!(!written(&mut test_bed, "ENGINE_3_SENSOR_FAULT"));
        assert!(!written(&mut test_bed, "ENGINE_2_OIL_CHIP_DETECTED"));
        assert!(test_bed.query(|a| a.faults.is_active(3, EngineMonitoringFaultKind::OilChip)));
        assert!(!test_bed.query(|a| a.faults.is_active(3, EngineMonitoringFaultKind::Sensors)));
    }

    #[test]
    fn a_fault_the_aircraft_does_not_list_is_never_active() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::EngineMonitoringFault(
            1,
            EngineMonitoringFaultKind::FadecAlternator,
        ));
        test_bed.run();

        assert!(!test_bed.query(|a| a
            .faults
            .is_active(1, EngineMonitoringFaultKind::FadecAlternator)));
    }

    #[test]
    fn a_cleared_fault_is_no_longer_written() {
        let mut test_bed = test_bed();
        let failure = FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::Sensors);
        test_bed.fail(failure);
        test_bed.run();
        test_bed.unfail(failure);
        test_bed.run();

        assert!(!written(&mut test_bed, "ENGINE_2_SENSOR_FAULT"));
    }

    #[test]
    fn every_kind_has_its_own_variable() {
        let kinds = [
            EngineMonitoringFaultKind::FadecAlternator,
            EngineMonitoringFaultKind::OverspeedProtection,
            EngineMonitoringFaultKind::InletProbes,
            EngineMonitoringFaultKind::Sensors,
            EngineMonitoringFaultKind::OneThrustLeverResolver,
            EngineMonitoringFaultKind::ReverserPermissionSwitch,
            EngineMonitoringFaultKind::FuelStrainerClog,
            EngineMonitoringFaultKind::FuelFilterMonitoring,
            EngineMonitoringFaultKind::OilChip,
            EngineMonitoringFaultKind::MinorFault,
            EngineMonitoringFaultKind::OverthrustProtection,
        ];
        let mut names: Vec<&str> = kinds.iter().map(|kind| kind.variable_name()).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), kinds.len());
    }
}
