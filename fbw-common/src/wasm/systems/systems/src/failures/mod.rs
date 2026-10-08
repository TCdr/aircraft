use crate::air_conditioning::{
    acs_controller::AcscId, cabin_pressure_controller::CpcId, Channel, VcmId, ZoneType,
};
use crate::air_conditioning::{FdacId, OcsmId};
use crate::integrated_modular_avionics::core_processing_input_output_module::CpiomId;
use crate::shared::{
    AirbusElectricPumpId, AirbusEngineDrivenPumpId, ElectricalBusType, FireDetectionLoopID,
    FireDetectionZone, GearActuatorId, HydraulicColor, LgciuId, ProximityDetectorId,
};
use crate::simulation::SimulationElement;
use rustc_hash::FxHashSet;

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum FailureType {
    // ATA21
    Acsc(AcscId),
    CabinFan(usize),
    HotAir(usize),
    TrimAirOverheat(ZoneType),
    TrimAirFault(ZoneType),
    TrimAirHighPressure,
    GalleyFans,
    CpcFault(CpcId),
    OutflowValveFault,
    SafetyValveFault,
    RapidDecompression,
    Fdac(FdacId, Channel),
    Tadd(Channel),
    Vcm(VcmId, Channel),
    OcsmAutoPartition(OcsmId),
    Ocsm(OcsmId, Channel),
    AgsApp(CpiomId),
    TcsApp(CpiomId),
    VcsApp(CpiomId),
    CpcsApp(CpiomId),
    FwdIsolValve,
    FwdExtractFan,
    BulkIsolValve,
    BulkExtractFan,
    CargoHeater,
    // ATA24
    Generator(usize),
    ApuGenerator(usize),
    TransformerRectifier(usize),
    StaticInverter,
    ElectricalBus(ElectricalBusType),
    // ATA26
    SetOnFire(FireDetectionZone),
    FireDetectionLoop(FireDetectionLoopID, FireDetectionZone),
    /// The fire detection unit (FDU) channel of one zone is inoperative: no fire warning from that zone
    FireDetectionUnit(FireDetectionZone),
    // ATA29
    ReservoirLeak(HydraulicColor),
    ReservoirAirLeak(HydraulicColor),
    ReservoirReturnLeak(HydraulicColor),
    EnginePumpOverheat(AirbusEngineDrivenPumpId),
    ElecPumpOverheat(AirbusElectricPumpId),
    // ATA32
    LgciuPowerSupply(LgciuId),
    LgciuInternalError(LgciuId),
    GearProxSensorDamage(ProximityDetectorId),
    GearActuatorJammed(GearActuatorId),
    BrakeHydraulicLeak(HydraulicColor),
    BrakeAccumulatorGasLeak,
    // ATA34
    RadioAltimeter(usize),
    RadioAntennaInterrupted(usize),
    RadioAntennaDirectCoupling(usize),
    EnhancedGroundProximityWarningSystemComputer,
    /// The GPS receiver of MMR 1 or 2
    Gps(usize),
    // ATA72
    /// The flame of engine n goes out once; the crew can relight it (engine::engine_failure)
    EngineFlameout(usize),
    /// The core of engine n seizes: no relight while the failure is active (engine::engine_failure)
    EngineSeizure(usize),
    // ATA73 FADEC and thrust lever (stage A5/B5, see a320_systems / a380_systems engine_control_failure)
    /// FADEC channel A of engine n is lost
    FadecChannelA(usize),
    /// FADEC channel B of engine n is lost
    FadecChannelB(usize),
    /// The FADEC of engine n detects a high temperature
    FadecOverheat(usize),
    /// The FADEC of engine n cannot communicate via the avionics networks (A380 ENG FADEC FAULT)
    FadecNetworkLink(usize),
    /// A FADEC failure of engine n affects the engine control (A380 ENG FADEC SYS FAULT)
    FadecSystem(usize),
    /// Both resolvers of thrust lever n are lost (ENG THR LEVER FAULT)
    ThrustLeverResolvers(usize),
    /// The two resolvers of thrust lever n disagree (A320 ENG THR LEVER DISAGREE)
    ThrustLeverResolverDisagree(usize),
    // ATA78 thrust reversers (engine n)
    /// The thrust reverser of engine n is failed: it does not deploy
    ReverserFault(usize),
    /// The thrust reverser of engine n is unlocked: it leaves its stowed and locked position
    ReverserUnlocked(usize),
    /// The thrust reverser of engine n is pressurized (A320) / energized (A380) without a deploy order
    ReverserPressurized(usize),
    /// The thrust reverser of engine n is failed locked: it does not unlock (A380 REVERSER LOCKED)
    ReverserLocked(usize),
    /// The thrust reverser control system of engine n is failed: the reverser is inoperative (A380
    /// REVERSER CTL FAULT)
    ReverserControlFault(usize),
}

pub struct Failure {
    failure_type: FailureType,
    is_active: bool,
}
impl Failure {
    pub fn new(failure_type: FailureType) -> Self {
        Self {
            failure_type,
            is_active: false,
        }
    }

    pub fn is_active(&self) -> bool {
        self.is_active
    }

    pub fn failure_type(&self) -> FailureType {
        self.failure_type
    }
}
impl SimulationElement for Failure {
    fn receive_failure(&mut self, active_failures: &FxHashSet<FailureType>) {
        self.is_active = active_failures.contains(&self.failure_type);
    }
}

#[cfg(test)]
mod tests {
    use crate::simulation::test::{SimulationTestBed, TestBed};

    use super::*;

    #[test]
    fn starts_in_a_non_failed_state() {
        let failure = Failure::new(FailureType::TransformerRectifier(1));
        assert!(!failure.is_active());
    }

    #[test]
    fn becomes_failed_when_matching_failure_indicated() {
        let mut test_bed =
            SimulationTestBed::from(Failure::new(FailureType::TransformerRectifier(1)));
        test_bed.fail(FailureType::TransformerRectifier(1));
        test_bed.run();

        assert!(test_bed.query_element(|el| el.is_active()));
    }

    #[test]
    fn does_not_become_failed_when_non_matching_failure_indicated() {
        let mut test_bed =
            SimulationTestBed::from(Failure::new(FailureType::TransformerRectifier(1)));
        test_bed.fail(FailureType::TransformerRectifier(2));
        test_bed.run();

        assert!(test_bed.query_element(|el| !el.is_active()));
    }
}
