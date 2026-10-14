//! Engine faults that the FADEC detects and reports to the flight warning system, and that have no
//! effect on the engine model: each one is a flyPad failure that only raises its ECAM alert.
//!
//! Each aircraft lists the faults its FCOM has (see the aircraft crates); the faults of both FCOMs
//! are in [`EngineMonitoringFaultKind`]. The FCOM says what each one is and that its alert is crew
//! awareness (or a procedure without engine model effect):
//! - A320 FCOM PRO-ABN-ENG (a320_fcom.txt): ENG 1(2) FADEC ALTERNATOR (l.79588-79615), OVSPD PROT
//!   FAULT (l.80627-80659), PROBES FAULT (l.80660-80689), SENSOR FAULT (l.81012-81055), ONE TLA
//!   FAULT (l.80603-80626), REV SWITCH FAULT (l.80820-80847), FUEL CTL FAULT (l.80112-80165), FUEL
//!   RETURN VALVE (l.80197-80232), CTL VALVE FAULT (l.79445-79486), COMPRESSOR VANE
//!   (l.79396-79444), ENG 1+2 COMPRESSOR VANE (l.79366-79395), BLEED STATUS FAULT
//!   (l.79241-79365), REV INHIBITED (l.80690-80726, the aircraft also stops the reverser
//!   deployment), REV ISOL FAULT (l.80727-80754).
//! - A380 FCOM PRO-ABN-ECAM-10-70 (a380_fcom.txt): ENG 1(2)(3)(4) FUEL STRAINER CLOGGED
//!   (l.172106-172132), FUEL FILTER MONITORING FAULT (l.172018-172043), OIL CHIP DETECTED
//!   (l.172378-172406), MINOR FAULT (l.172307-172334), OVERTHRUST PROT LOST (l.172639-172666),
//!   SENSOR FAULT (l.172667-172692), CTL SYS FAULT (l.171310-171330), CTL VLV FAULT
//!   (l.171454-171470), FADEC IDENT FAULT (l.171629-171637), FUEL SYS CONTAMINATION
//!   (l.172133-172150), OIL SYS CONTAMINATION (l.172517-172530), ENG TYPE DISAGREE
//!   (l.175642-175650).
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
    /// A320 ENG 1(2) FADEC ALTERNATOR: "the electrical auto supply for the FADEC system is lost"
    /// (l.79598). The FADEC is then supplied by the aircraft network.
    FadecAlternator,
    /// A320 ENG 1(2) OVSPD PROT FAULT: "the overspeed protection is lost" (l.80637).
    OverspeedProtection,
    /// A320 ENG 1(2) PROBES FAULT: "T12, P0, or PT2 data are unavailable on both channels"
    /// (l.80670).
    InletProbes,
    /// A320 ENG 1(2) SENSOR FAULT: "PS3 or T25 or T3 or N1 or N2 data is unavailable on both
    /// channels" (l.81022); A380 ENG 1(2)(3)(4) SENSOR FAULT: "Engine total pressure probe or total
    /// temperature probe or static temperature probe is failed" (l.172673).
    Sensors,
    /// A320 ENG 1(2) ONE TLA FAULT: one of the two resolvers of the thrust lever is failed (the
    /// FCOM gives no triggering condition, l.80603-80626; both resolvers failed is ENG THR LEVER
    /// FAULT, l.81802).
    OneThrustLeverResolver,
    /// A320 ENG 1(2) REV SWITCH FAULT: "the reverser permission switch is failed" (l.80830).
    ReverserPermissionSwitch,
    /// A320 ENG 1(2) FUEL CTL FAULT: "The Fuel Metering Valve (FMV) position is failed, or The FMV
    /// command is failed, or The FMV position feedback is failed" (l.80122-80126).
    FuelMeteringValve,
    /// A320 ENG 1(2) FUEL RETURN VALVE, VALVE NOT OPEN: "The valve is failed closed" (l.80213-80214).
    FuelReturnValveFailedClosed,
    /// A320 ENG 1(2) FUEL RETURN VALVE, VALVE NOT CLOSED: "The valve is failed open" (l.80217-80219).
    FuelReturnValveFailedOpen,
    /// A320 ENG 1(2) CTL VALVE FAULT: "The Burner Staging Valve (BSV) is failed, or The HP Turbine
    /// Clearance (HPTC) system is failed, or The Rotor Active Clearance Control (RACC) system is
    /// failed" (l.79455-79459).
    ClearanceControlValves,
    /// A320 ENG 1(2) COMPRESSOR VANE: "either Variable Bleed Valve (VBV) or Variable Stator Vane
    /// (VSV) is failed" (l.79406-79407).
    CompressorVanes,
    /// A320 ENG 1+2 COMPRESSOR VANE: "loss of the redundancy (i.e. one channel is detected faulty)
    /// of the compressor vane (i.e. VBV, VSV) control system on both engines" (l.79376-79378): one
    /// channel of the vane control of this engine; the alert needs it on both engines.
    CompressorVaneChannel,
    /// A320 ENG 1(2) BLEED STATUS FAULT: "the status of one of the following valves is not received
    /// by the FADEC active channel: Bleed valves, Pack valves, Wing and engine anti ice valves,
    /// Cross-bleed valve" (l.79252-79257).
    BleedValveStatus,
    /// A320 ENG 1(2) REV INHIBITED: "the reverser is inhibited by maintenance action" (l.80700).
    /// Unlike the other faults it has an effect, given by the aircraft: the reverser does not deploy.
    ReverserInhibited,
    /// A320 ENG 1(2) REV ISOL FAULT: "the thrust reverser shut off valve is failed in open
    /// position" (l.80737). It is the valve that "allows hydraulic pressure to the HCU" (DSC-70-70
    /// l.63289); the HCU still keeps the reverser actuators unpressurized, so no other effect.
    ReverserShutoffValve,
    /// A380 ENG 1(2)(3)(4) FUEL STRAINER CLOGGED: "The pressure drop across the fuel strainer is
    /// higher than 12 PSI" (l.172113).
    FuelStrainerClog,
    /// A380 ENG 1(2)(3)(4) FUEL FILTER MONITORING FAULT: "The fuel filter is no longer monitored"
    /// (l.172024).
    FuelFilterMonitoring,
    /// A380 ENG 1(2)(3)(4) OIL CHIP DETECTED: "Metallic particles are detected in the engine oil
    /// system" (l.172384).
    OilChip,
    /// A380 ENG 1(2)(3)(4) MINOR FAULT: "Some internal engine sensors or one FADEC channel are
    /// failed" (l.172313).
    MinorFault,
    /// A380 ENG 1(2)(3)(4) OVERTHRUST PROT LOST: "The overthrust protection is lost" (l.172645).
    OverthrustProtection,
    /// A380 ENG 1(2)(3)(4) CTL SYS FAULT: "A failure preventing the FADEC for satisfactorily
    /// controlling the engine has occurred" (l.171316: P30, N1, N2 sensor or fuel regulation (HMU)
    /// failure). Design choice: the engine model keeps its normal control (the FCOM procedure
    /// covers the case "If engine control is degraded").
    ControlSystem,
    /// A380 ENG 1(2)(3)(4) CTL VLV FAULT: "One control valve of the applicable engine is failed"
    /// (l.171460: cooling, HP turbine or compressor discharge valve not open).
    ControlValve,
    /// A380 ENG 1(2)(3)(4) FADEC IDENT FAULT: "The FADEC cannot identify the engine configuration"
    /// (l.171637), crew awareness.
    FadecIdent,
    /// A380 ENG 1(2)(3)(4) FUEL SYS CONTAMINATION: "The bypass valve of the fuel filter is open"
    /// (l.172139), crew awareness.
    FuelSystemContamination,
    /// A380 ENG 1(2)(3)(4) OIL SYS CONTAMINATION: "The oil filter in the return line is clogged and
    /// the bypass valve is open" (l.172525).
    OilSystemContamination,
    /// A380 ENG TYPE DISAGREE: "The engine thrust ratings are not similar on all engines"
    /// (l.175648), crew awareness: the failure gives this engine a thrust rating that differs.
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
            EngineMonitoringFaultKind::FuelStrainerClog => "FUEL_STRAINER_CLOGGED",
            EngineMonitoringFaultKind::FuelFilterMonitoring => "FUEL_FILTER_MONITORING_FAULT",
            EngineMonitoringFaultKind::OilChip => "OIL_CHIP_DETECTED",
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
    /// `kinds`: the faults the FCOM of the aircraft has.
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
            EngineMonitoringFaultKind::FuelMeteringValve,
            EngineMonitoringFaultKind::FuelReturnValveFailedClosed,
            EngineMonitoringFaultKind::FuelReturnValveFailedOpen,
            EngineMonitoringFaultKind::ClearanceControlValves,
            EngineMonitoringFaultKind::CompressorVanes,
            EngineMonitoringFaultKind::CompressorVaneChannel,
            EngineMonitoringFaultKind::BleedValveStatus,
            EngineMonitoringFaultKind::ReverserInhibited,
            EngineMonitoringFaultKind::ReverserShutoffValve,
            EngineMonitoringFaultKind::FuelStrainerClog,
            EngineMonitoringFaultKind::FuelFilterMonitoring,
            EngineMonitoringFaultKind::OilChip,
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
