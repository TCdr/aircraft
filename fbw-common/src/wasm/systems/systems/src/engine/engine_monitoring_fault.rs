//! Engine faults that the FADEC detects and reports to the flight warning system, and that have no
//! effect on the engine model: each one is a flyPad failure that only raises its ECAM alert.
//!
//! Each aircraft lists the faults of the real aircraft (see the aircraft crates); the faults of
//! both aircraft are in [`EngineMonitoringFaultKind`]. Each alert is crew awareness, or a procedure
//! without effect on the engine model:
//! - A320: ENG 1(2) FADEC ALTERNATOR, OVSPD PROT FAULT, PROBES FAULT, SENSOR FAULT, ONE TLA FAULT,
//!   REV SWITCH FAULT, FUEL CTL FAULT, FUEL RETURN VALVE, CTL VALVE FAULT, COMPRESSOR VANE, ENG 1+2
//!   COMPRESSOR VANE, BLEED STATUS FAULT, REV INHIBITED (the aircraft also stops the reverser
//!   deployment), REV ISOL FAULT; the N1, N2, EGT and FF discrepancies the DMC finds between the
//!   FADEC data and the displayed value (amber CHECK on the E/WD).
//! - A380: ENG 1(2)(3)(4) FUEL STRAINER CLOGGED, FUEL FILTER MONITORING FAULT, OIL CHIP DETECTED,
//!   MINOR FAULT, OVERTHRUST PROT LOST, SENSOR FAULT, CTL SYS FAULT, CTL VLV FAULT, FADEC IDENT
//!   FAULT, FUEL SYS CONTAMINATION, OIL SYS CONTAMINATION, ENG TYPE DISAGREE, OIL FILTER MONITORING
//!   FAULT, LP SHAFT PROT LOST.
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
    /// A320 ENG 1(2) FUEL CTL FAULT: the fuel metering valve (FMV) position, command or position
    /// feedback is failed.
    FuelMeteringValve,
    /// A320 ENG 1(2) FUEL RETURN VALVE, VALVE NOT OPEN: the valve is failed closed.
    FuelReturnValveFailedClosed,
    /// A320 ENG 1(2) FUEL RETURN VALVE, VALVE NOT CLOSED: the valve is failed open.
    FuelReturnValveFailedOpen,
    /// A320 ENG 1(2) CTL VALVE FAULT: the burner staging valve (BSV), the HP turbine clearance
    /// (HPTC) or the rotor active clearance control (RACC) system is failed.
    ClearanceControlValves,
    /// A320 ENG 1(2) COMPRESSOR VANE: the variable bleed valve (VBV) or variable stator vane (VSV)
    /// is failed.
    CompressorVanes,
    /// A320 ENG 1+2 COMPRESSOR VANE: the compressor vane (VBV, VSV) control has lost its
    /// redundancy (one channel faulty) on both engines. This fault is one channel of the vane
    /// control of this engine; the alert needs it on both engines.
    CompressorVaneChannel,
    /// A320 ENG 1(2) BLEED STATUS FAULT: the FADEC active channel no longer receives the status of
    /// a bleed, pack, wing or engine anti-ice, or cross-bleed valve.
    BleedValveStatus,
    /// A320 ENG 1(2) REV INHIBITED: the reverser is inhibited by a maintenance action.
    /// Unlike the other faults it has an effect, given by the aircraft: the reverser does not deploy.
    ReverserInhibited,
    /// A320 ENG 1(2) REV ISOL FAULT: the thrust reverser shutoff valve is failed open. That valve
    /// lets hydraulic pressure to the HCU; the HCU still keeps the reverser actuators
    /// unpressurized, so no other effect.
    ReverserShutoffValve,
    /// A320 ENG 1(2) N1 DISCREPANCY: the N1 the DMC displays differs from the FADEC-DMC bus value.
    N1Discrepancy,
    /// A320 ENG 1(2) N2 DISCREPANCY: the N2 the DMC displays differs from the FADEC-DMC bus value.
    N2Discrepancy,
    /// A320 ENG 1(2) EGT DISCREPANCY: the EGT the DMC displays differs from the FADEC-DMC bus value.
    EgtDiscrepancy,
    /// A320 ENG 1(2) FF DISCREPANCY: the fuel flow the DMC displays differs from the FADEC-DMC bus
    /// value.
    FuelFlowDiscrepancy,
    /// A380 ENG 1(2)(3)(4) FUEL STRAINER CLOGGED: pressure drop across the fuel strainer above
    /// 12 PSI.
    FuelStrainerClog,
    /// A380 ENG 1(2)(3)(4) FUEL FILTER MONITORING FAULT: the fuel filter is no longer monitored.
    FuelFilterMonitoring,
    /// A380 ENG 1(2)(3)(4) OIL CHIP DETECTED: metallic particles in the engine oil system.
    OilChip,
    /// A380 ENG 1(2)(3)(4) OIL FILTER MONITORING FAULT: the engine oil filter monitoring system is
    /// failed.
    OilFilterMonitoring,
    /// A380 ENG 1(2)(3)(4) LP SHAFT PROT LOST: the FADEC protection of the LP shaft is lost.
    LpShaftProtection,
    /// A380 ENG 1(2)(3)(4) MINOR FAULT: some internal engine sensors or one FADEC channel failed.
    MinorFault,
    /// A380 ENG 1(2)(3)(4) OVERTHRUST PROT LOST: the overthrust protection is lost.
    OverthrustProtection,
    /// A380 ENG 1(2)(3)(4) CTL SYS FAULT: a failure keeps the FADEC from controlling the engine
    /// properly (P30, N1, N2 sensor or fuel regulation (HMU) failure). Design choice: the engine
    /// model keeps its normal control (the procedure has a separate branch for a degraded engine
    /// control).
    ControlSystem,
    /// A380 ENG 1(2)(3)(4) CTL VLV FAULT: one control valve of the engine is failed (cooling, HP
    /// turbine or compressor discharge valve not open).
    ControlValve,
    /// A380 ENG 1(2)(3)(4) FADEC IDENT FAULT: the FADEC cannot identify the engine configuration,
    /// crew awareness.
    FadecIdent,
    /// A380 ENG 1(2)(3)(4) FUEL SYS CONTAMINATION: the bypass valve of the fuel filter is open,
    /// crew awareness.
    FuelSystemContamination,
    /// A380 ENG 1(2)(3)(4) OIL SYS CONTAMINATION: the oil filter in the return line is clogged and
    /// its bypass valve is open.
    OilSystemContamination,
    /// A380 ENG TYPE DISAGREE: the engine thrust ratings differ between the engines, crew
    /// awareness: the failure gives this engine a thrust rating that differs.
    ThrustRatingDisagree,
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
            EngineMonitoringFaultKind::FuelMeteringValve => "FUEL_CTL_FAULT",
            EngineMonitoringFaultKind::FuelReturnValveFailedClosed => {
                "FUEL_RETURN_VALVE_FAILED_CLOSED"
            }
            EngineMonitoringFaultKind::FuelReturnValveFailedOpen => "FUEL_RETURN_VALVE_FAILED_OPEN",
            EngineMonitoringFaultKind::ClearanceControlValves => "CTL_VALVE_FAULT",
            EngineMonitoringFaultKind::CompressorVanes => "COMPRESSOR_VANE_FAULT",
            EngineMonitoringFaultKind::CompressorVaneChannel => "COMPRESSOR_VANE_CHANNEL_FAULT",
            EngineMonitoringFaultKind::BleedValveStatus => "BLEED_STATUS_FAULT",
            EngineMonitoringFaultKind::ReverserInhibited => "REVERSER_INHIBITED",
            EngineMonitoringFaultKind::ReverserShutoffValve => "REVERSER_SHUTOFF_VALVE_FAULT",
            EngineMonitoringFaultKind::N1Discrepancy => "N1_DISCREPANCY",
            EngineMonitoringFaultKind::N2Discrepancy => "N2_DISCREPANCY",
            EngineMonitoringFaultKind::EgtDiscrepancy => "EGT_DISCREPANCY",
            EngineMonitoringFaultKind::FuelFlowDiscrepancy => "FF_DISCREPANCY",
            EngineMonitoringFaultKind::FuelStrainerClog => "FUEL_STRAINER_CLOGGED",
            EngineMonitoringFaultKind::FuelFilterMonitoring => "FUEL_FILTER_MONITORING_FAULT",
            EngineMonitoringFaultKind::OilChip => "OIL_CHIP_DETECTED",
            EngineMonitoringFaultKind::OilFilterMonitoring => "OIL_FILTER_MONITORING_FAULT",
            EngineMonitoringFaultKind::LpShaftProtection => "LP_SHAFT_PROTECTION_LOST",
            EngineMonitoringFaultKind::MinorFault => "MINOR_FAULT",
            EngineMonitoringFaultKind::OverthrustProtection => "OVERTHRUST_PROTECTION_LOST",
            EngineMonitoringFaultKind::ControlSystem => "CTL_SYS_FAULT",
            EngineMonitoringFaultKind::ControlValve => "CTL_VLV_FAULT",
            EngineMonitoringFaultKind::FadecIdent => "FADEC_IDENT_FAULT",
            EngineMonitoringFaultKind::FuelSystemContamination => "FUEL_SYS_CONTAMINATION",
            EngineMonitoringFaultKind::OilSystemContamination => "OIL_SYS_CONTAMINATION",
            EngineMonitoringFaultKind::ThrustRatingDisagree => "TYPE_DISAGREE",
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

    const KINDS: [EngineMonitoringFaultKind; 4] = [
        EngineMonitoringFaultKind::OilChip,
        EngineMonitoringFaultKind::Sensors,
        EngineMonitoringFaultKind::OilFilterMonitoring,
        EngineMonitoringFaultKind::LpShaftProtection,
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
    fn the_oil_filter_monitoring_and_lp_shaft_protection_faults_are_written_per_engine() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::EngineMonitoringFault(
            2,
            EngineMonitoringFaultKind::OilFilterMonitoring,
        ));
        test_bed.fail(FailureType::EngineMonitoringFault(
            4,
            EngineMonitoringFaultKind::LpShaftProtection,
        ));
        test_bed.run();

        assert!(written(
            &mut test_bed,
            "ENGINE_2_OIL_FILTER_MONITORING_FAULT"
        ));
        assert!(written(&mut test_bed, "ENGINE_4_LP_SHAFT_PROTECTION_LOST"));
        assert!(!written(
            &mut test_bed,
            "ENGINE_4_OIL_FILTER_MONITORING_FAULT"
        ));
        assert!(!written(&mut test_bed, "ENGINE_2_LP_SHAFT_PROTECTION_LOST"));
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
            EngineMonitoringFaultKind::FuelMeteringValve,
            EngineMonitoringFaultKind::FuelReturnValveFailedClosed,
            EngineMonitoringFaultKind::FuelReturnValveFailedOpen,
            EngineMonitoringFaultKind::ClearanceControlValves,
            EngineMonitoringFaultKind::CompressorVanes,
            EngineMonitoringFaultKind::CompressorVaneChannel,
            EngineMonitoringFaultKind::BleedValveStatus,
            EngineMonitoringFaultKind::ReverserInhibited,
            EngineMonitoringFaultKind::ReverserShutoffValve,
            EngineMonitoringFaultKind::N1Discrepancy,
            EngineMonitoringFaultKind::N2Discrepancy,
            EngineMonitoringFaultKind::EgtDiscrepancy,
            EngineMonitoringFaultKind::FuelFlowDiscrepancy,
            EngineMonitoringFaultKind::FuelStrainerClog,
            EngineMonitoringFaultKind::FuelFilterMonitoring,
            EngineMonitoringFaultKind::OilChip,
            EngineMonitoringFaultKind::OilFilterMonitoring,
            EngineMonitoringFaultKind::LpShaftProtection,
            EngineMonitoringFaultKind::MinorFault,
            EngineMonitoringFaultKind::OverthrustProtection,
            EngineMonitoringFaultKind::ControlSystem,
            EngineMonitoringFaultKind::ControlValve,
            EngineMonitoringFaultKind::FadecIdent,
            EngineMonitoringFaultKind::FuelSystemContamination,
            EngineMonitoringFaultKind::OilSystemContamination,
            EngineMonitoringFaultKind::ThrustRatingDisagree,
        ];
        let mut names: Vec<&str> = kinds.iter().map(|kind| kind.variable_name()).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), kinds.len());
    }
}
