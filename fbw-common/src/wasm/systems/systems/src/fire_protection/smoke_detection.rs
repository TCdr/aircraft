//! Smoke detection of a compartment, shared by the aircraft: the A320 Smoke Detection Control Unit (SDCU) of the cargo
//! compartments and the smoke detector of the avionics ventilation duct, the A380 Smoke Detection Function (SDF) of the
//! CIDS for the cargo compartments and the avionics bays.
//!
//! Each compartment has one or more smoke detectors; the detection logic is the dual loop principle, the same on both
//! aircraft: the SMOKE warning triggers when both detectors detect smoke, or when one detects smoke and the other is
//! inoperative.
//!
//! The detector fault differs between the aircraft, see [`SmokeDetectionFaultLogic`].
//!
//! The smoke itself comes from a flyPad failure of the compartment ([`FailureType::Smoke`]); each detector can fail
//! ([`FailureType::SmokeDetector`]) or lose its electrical supply, which makes it inoperative.

use std::time::Duration;

use crate::{
    failures::{Failure, FailureType},
    shared::{DelayedTrueLogicGate, ElectricalBusType, ElectricalBuses, SmokeDetectionZone},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};

/// When the smoke detection of a compartment reports a detector fault.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SmokeDetectionFaultLogic {
    /// A320 (dual loop principle): one inoperative detector is tolerated. The detection of the compartment is failed
    /// (SMOKE FWD (AFT) CRG DET FAULT) when all its detectors are inoperative.
    AllDetectorsInoperative,
    /// A380: the SMOKE DET FAULT caution triggers when one detector fails, or when only one detector detects smoke.
    /// Design choice: not while the SMOKE warning of the compartment is on (one detector failed and the other detects
    /// smoke), the warning already covers it.
    AnyDetectorInoperativeOrDisagreeing,
}

/// The configuration of the smoke detection of one compartment with `D` smoke detectors.
pub struct SmokeDetectionZoneConfig<const D: usize> {
    pub zone: SmokeDetectionZone,
    /// The electrical supply of each detector (its detection channel)
    pub detectors_powered_by: [ElectricalBusType; D],
    /// How long the smoke must be detected before the warning (A320 avionics: 5 s)
    pub confirmation_time: Duration,
    pub fault_logic: SmokeDetectionFaultLogic,
}

struct SmokeDetector {
    powered_by: ElectricalBusType,
    is_powered: bool,
    failure: Failure,
}

impl SmokeDetector {
    fn new(zone: SmokeDetectionZone, number: usize, powered_by: ElectricalBusType) -> Self {
        Self {
            powered_by,
            is_powered: false,
            failure: Failure::new(FailureType::SmokeDetector(zone, number)),
        }
    }

    /// The detector is failed or has no electrical supply
    fn is_inoperative(&self) -> bool {
        self.failure.is_active() || !self.is_powered
    }

    fn detects_smoke(&self, smoke_in_compartment: bool) -> bool {
        smoke_in_compartment && !self.is_inoperative()
    }
}

impl SimulationElement for SmokeDetector {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);

        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }
}

/// The smoke detection of one compartment: writes L:A32NX_SMOKE_<zone>_DETECTED (the SMOKE warning and lights) and
/// L:A32NX_SMOKE_<zone>_DET_FAULT (the detector fault caution).
pub struct SmokeDetection<const D: usize> {
    smoke_detected_id: VariableIdentifier,
    detection_fault_id: VariableIdentifier,

    smoke: Failure,
    detectors: [SmokeDetector; D],
    fault_logic: SmokeDetectionFaultLogic,
    smoke_confirmation: DelayedTrueLogicGate,
    detection_fault: bool,
}

impl<const D: usize> SmokeDetection<D> {
    pub fn new(context: &mut InitContext, config: SmokeDetectionZoneConfig<D>) -> Self {
        let zone = config.zone;
        let mut number = 0;
        Self {
            smoke_detected_id: context.get_identifier(format!("SMOKE_{}_DETECTED", zone)),
            detection_fault_id: context.get_identifier(format!("SMOKE_{}_DET_FAULT", zone)),

            smoke: Failure::new(FailureType::Smoke(zone)),
            detectors: config.detectors_powered_by.map(|powered_by| {
                number += 1;
                SmokeDetector::new(zone, number, powered_by)
            }),
            fault_logic: config.fault_logic,
            smoke_confirmation: DelayedTrueLogicGate::new(config.confirmation_time),
            detection_fault: false,
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        self.update_with_detection_unit(context, true);
    }

    /// Like [`Self::update`], for a compartment whose detectors report to a smoke detection unit that can fail (the
    /// A380 Smoke Detection Function, [`FailureType::SmokeDetectionFunction`]): without the unit, the compartment
    /// reports neither smoke nor a detector fault.
    pub fn update_with_detection_unit(
        &mut self,
        context: &UpdateContext,
        detection_unit_available: bool,
    ) {
        let smoke_in_compartment = self.smoke.is_active();
        let detecting = self
            .detectors
            .iter()
            .filter(|detector| detector.detects_smoke(smoke_in_compartment))
            .count();
        let inoperative = self
            .detectors
            .iter()
            .filter(|detector| detector.is_inoperative())
            .count();

        // Every detector either detects the smoke or is inoperative, and at least one detects it
        let smoke_signal =
            detection_unit_available && detecting > 0 && detecting + inoperative == D;
        self.smoke_confirmation.update(context, smoke_signal);

        let detector_fault = match self.fault_logic {
            SmokeDetectionFaultLogic::AllDetectorsInoperative => inoperative == D,
            SmokeDetectionFaultLogic::AnyDetectorInoperativeOrDisagreeing => {
                let only_some_detect = detecting > 0 && detecting + inoperative < D;
                !smoke_signal && (inoperative > 0 || only_some_detect)
            }
        };
        self.detection_fault = detection_unit_available && detector_fault;
    }

    /// The SMOKE warning of the compartment
    pub fn smoke_detected(&self) -> bool {
        self.smoke_confirmation.output()
    }

    /// The detector fault caution of the compartment, see [`SmokeDetectionFaultLogic`]
    pub fn detection_fault(&self) -> bool {
        self.detection_fault
    }
}

impl<const D: usize> SimulationElement for SmokeDetection<D> {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.smoke.accept(visitor);
        accept_iterable!(self.detectors, visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.smoke_detected_id, self.smoke_detected());
        writer.write(&self.detection_fault_id, self.detection_fault());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        shared::PotentialOrigin,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed},
            Aircraft,
        },
    };

    struct TestAircraft {
        dual_detection: SmokeDetection<2>,
        single_detection: SmokeDetection<1>,

        dc_1_source: TestElectricitySource,
        dc_2_source: TestElectricitySource,
        dc_1_bus: ElectricalBus,
        dc_2_bus: ElectricalBus,

        /// The smoke detection unit of the dual detection compartment works
        detection_unit_available: bool,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                // A380 style: two detectors, any detector fault is reported
                dual_detection: SmokeDetection::new(
                    context,
                    SmokeDetectionZoneConfig {
                        zone: SmokeDetectionZone::ForwardCargo,
                        detectors_powered_by: [
                            ElectricalBusType::DirectCurrent(1),
                            ElectricalBusType::DirectCurrent(2),
                        ],
                        confirmation_time: Duration::ZERO,
                        fault_logic: SmokeDetectionFaultLogic::AnyDetectorInoperativeOrDisagreeing,
                    },
                ),
                // A320 avionics style: one detector, 5 s confirmation
                single_detection: SmokeDetection::new(
                    context,
                    SmokeDetectionZoneConfig {
                        zone: SmokeDetectionZone::Avionics,
                        detectors_powered_by: [ElectricalBusType::DirectCurrent(1)],
                        confirmation_time: Duration::from_secs(5),
                        fault_logic: SmokeDetectionFaultLogic::AllDetectorsInoperative,
                    },
                ),

                dc_1_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::TransformerRectifier(1),
                ),
                dc_2_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::TransformerRectifier(2),
                ),
                dc_1_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
                dc_2_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(2)),

                detection_unit_available: true,
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _context: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            electricity.supplied_by(&self.dc_1_source);
            electricity.supplied_by(&self.dc_2_source);
            electricity.flow(&self.dc_1_source, &self.dc_1_bus);
            electricity.flow(&self.dc_2_source, &self.dc_2_bus);
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.dual_detection
                .update_with_detection_unit(context, self.detection_unit_available);
            self.single_detection.update(context);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<V: SimulationElementVisitor>(&mut self, visitor: &mut V) {
            self.dual_detection.accept(visitor);
            self.single_detection.accept(visitor);

            visitor.visit(self);
        }
    }

    fn test_bed() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.run();
        test_bed
    }

    fn smoke_detected(test_bed: &mut SimulationTestBed<TestAircraft>, zone: &str) -> bool {
        test_bed.read_by_name(&format!("SMOKE_{}_DETECTED", zone))
    }

    fn detection_fault(test_bed: &mut SimulationTestBed<TestAircraft>, zone: &str) -> bool {
        test_bed.read_by_name(&format!("SMOKE_{}_DET_FAULT", zone))
    }

    #[test]
    fn no_smoke_warning_and_no_fault_when_healthy() {
        let mut test_bed = test_bed();

        assert!(!smoke_detected(&mut test_bed, "FWD_CARGO"));
        assert!(!detection_fault(&mut test_bed, "FWD_CARGO"));
        assert!(!smoke_detected(&mut test_bed, "AVIONICS"));
        assert!(!detection_fault(&mut test_bed, "AVIONICS"));
    }

    #[test]
    fn smoke_detected_by_both_detectors_gives_the_smoke_warning() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed.run();

        assert!(smoke_detected(&mut test_bed, "FWD_CARGO"));
        assert!(!detection_fault(&mut test_bed, "FWD_CARGO"));
    }

    #[test]
    fn smoke_in_one_compartment_is_not_detected_in_another() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed.run_with_delta(Duration::from_secs(10));

        assert!(!smoke_detected(&mut test_bed, "AVIONICS"));
    }

    #[test]
    fn smoke_with_one_detector_failed_gives_the_smoke_warning_from_the_other_one() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::SmokeDetector(
            SmokeDetectionZone::ForwardCargo,
            1,
        ));
        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed.run();

        assert!(smoke_detected(&mut test_bed, "FWD_CARGO"));
        // The warning covers the detector fault
        assert!(!detection_fault(&mut test_bed, "FWD_CARGO"));
    }

    #[test]
    fn smoke_with_both_detectors_failed_is_not_detected() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::SmokeDetector(
            SmokeDetectionZone::ForwardCargo,
            1,
        ));
        test_bed.fail(FailureType::SmokeDetector(
            SmokeDetectionZone::ForwardCargo,
            2,
        ));
        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed.run();

        assert!(!smoke_detected(&mut test_bed, "FWD_CARGO"));
        assert!(detection_fault(&mut test_bed, "FWD_CARGO"));
    }

    #[test]
    fn one_failed_detector_gives_a_detector_fault_with_any_detector_logic() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::SmokeDetector(
            SmokeDetectionZone::ForwardCargo,
            2,
        ));
        test_bed.run();

        assert!(detection_fault(&mut test_bed, "FWD_CARGO"));
        assert!(!smoke_detected(&mut test_bed, "FWD_CARGO"));
    }

    #[test]
    fn a_detector_without_electrical_supply_is_inoperative() {
        let mut test_bed = test_bed();
        test_bed.command(|a| a.dc_2_source.unpower());
        test_bed.run();

        assert!(detection_fault(&mut test_bed, "FWD_CARGO"));

        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed.run();

        assert!(smoke_detected(&mut test_bed, "FWD_CARGO"));
    }

    #[test]
    fn the_smoke_warning_waits_for_the_confirmation_time() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::Avionics));
        test_bed.run_with_delta(Duration::from_millis(4_900));

        assert!(!smoke_detected(&mut test_bed, "AVIONICS"));

        test_bed.run_with_delta(Duration::from_millis(200));

        assert!(smoke_detected(&mut test_bed, "AVIONICS"));
    }

    #[test]
    fn the_smoke_warning_ends_when_the_smoke_is_gone() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed.run();
        test_bed.unfail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed.run();

        assert!(!smoke_detected(&mut test_bed, "FWD_CARGO"));
    }

    #[test]
    fn a_failed_detection_unit_reports_neither_smoke_nor_a_detector_fault() {
        // A380 SMOKE DET FAULT of a failed detection function: the smoke detection is lost
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed.run();
        assert!(smoke_detected(&mut test_bed, "FWD_CARGO"));

        test_bed.command(|a| a.detection_unit_available = false);
        test_bed.run();
        assert!(!smoke_detected(&mut test_bed, "FWD_CARGO"));

        test_bed.unfail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed.fail(FailureType::SmokeDetector(
            SmokeDetectionZone::ForwardCargo,
            2,
        ));
        test_bed.run();
        assert!(!detection_fault(&mut test_bed, "FWD_CARGO"));
    }

    #[test]
    fn the_failed_single_detector_is_a_detection_fault_with_all_detectors_logic() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::SmokeDetector(SmokeDetectionZone::Avionics, 1));
        test_bed.run();

        assert!(detection_fault(&mut test_bed, "AVIONICS"));
    }
}
