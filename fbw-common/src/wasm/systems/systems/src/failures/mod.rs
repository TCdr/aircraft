use crate::air_conditioning::{
    acs_controller::AcscId, cabin_pressure_controller::CpcId, Channel, VcmId, ZoneType,
};
use crate::air_conditioning::{FdacId, OcsmId};
use crate::engine::engine_monitoring_fault::EngineMonitoringFaultKind;
use crate::integrated_modular_avionics::core_processing_input_output_module::CpiomId;
use crate::shared::{
    AirbusElectricPumpId, AirbusEngineDrivenPumpId, ElectricalBusType, FireDetectionLoopID,
    FireDetectionZone, GearActuatorId, HydraulicColor, LgciuId, ProximityDetectorId,
    SmokeDetectionZone,
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
    /// A320 aft cargo ventilation: both isolation valves stuck closed
    AftCargoIsolationValvesStuckClosed,
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
    /// A380: pack flow valve n (1 and 2 on pack 1, 3 and 4 on pack 2) no longer follows its controller: it stays
    /// where it is (a380_systems pneumatic::PackComplex)
    PackFlowValveJammed(usize),
    /// A380: the outlet air of pack n overheats while the pack has an air flow (pack outlet above 95 deg C)
    PackOverheat(usize),
    /// A380: pack n is in bypass mode, its performance is degraded (AIR PACK n REGUL FAULT)
    PackRegulation(usize),
    /// A380: one air cycle machine of pack n is failed, the other one keeps the pack available (AIR PACK 1+2 REGUL
    /// REDUNDANCY LOST once both packs have one)
    PackAirCycleMachine(usize),
    /// A380: the blowing fan that ventilates the bay of pack n on ground is failed (AIR PACK BAY n VENT FAULT)
    PackBayBlowingFan(usize),
    /// A380: the emergency RAM air inlet n is no longer controlled by the RAM AIR pb (COND RAM AIR n FAULT)
    RamAirInlet(usize),
    /// A380: the air pressure in the mixer unit is abnormally high (COND MIXER PRESS REGUL FAULT)
    MixerUnitPressureHigh,
    /// A380: the air pressure in the mixer unit is abnormally low (COND MIXER PRESS REGUL FAULT)
    MixerUnitPressureLow,
    /// A380: the cabin temperature selected on the flight attendant panel is no longer transmitted (COND PURSER TEMP
    /// SEL FAULT): the purser selection stays where it was
    PurserTemperatureSelection,
    /// A380: cabin pressure sensor n (1 to 4) is failed (CAB PRESS SENSORS FAULT with two or three failed)
    CabinPressureSensor(usize),
    /// A380: the bulk cargo heater keeps heating whenever it is on: the bulk cargo duct air goes above 70 deg C
    BulkCargoDuctOverheat,
    /// A380: the cabin air extract valve is failed and stays where it is
    CabinAirExtractValve,
    /// A380: the manual cabin pressurization mode of the outflow valve controllers is failed
    CabinPressureManualControl,
    // ATA24
    Generator(usize),
    ApuGenerator(usize),
    TransformerRectifier(usize),
    StaticInverter,
    ElectricalBus(ElectricalBusType),
    /// Battery n has an internal cell short: its voltage drops and, once on charge, its charging
    /// current keeps rising (thermal runaway, see electrical::battery)
    Battery(usize),
    /// The battery charge limiter (BCL) of battery n has failed: it keeps the battery contactor
    /// open (electrical::battery_charge_limiter)
    BatteryChargeLimiter(usize),
    /// The integrated drive generator (IDG) of engine n loses its oil: low oil pressure, then an
    /// oil overheat (electrical::engine_generator)
    IntegratedDriveGeneratorOilLeak(usize),
    /// The oil cooling of the IDG of engine n is lost: its oil outlet temperature rises
    /// (electrical::engine_generator)
    IntegratedDriveGeneratorOilOverheat(usize),
    /// External power unit n, or its generator control unit, is failed: it cannot supply the network
    ExternalPower(usize),
    /// The emergency generator (A380: the RAT generator) gives no output
    EmergencyGenerator,
    /// The disconnection function of engine generator drive n failed: its DRIVE pb no longer
    /// disconnects the generator from the engine
    GeneratorDriveDisconnect(usize),
    // ATA26
    SetOnFire(FireDetectionZone),
    FireDetectionLoop(FireDetectionLoopID, FireDetectionZone),
    /// The fire detection unit (FDU) channel of one zone is inoperative: no fire warning from that zone
    FireDetectionUnit(FireDetectionZone),
    // ATA27 slats and flaps (a320_systems / a380_systems hydraulic::sfcc)
    /// The flap channel of SFCC n no longer controls its flap motor: the flaps move at half speed on the
    /// other motor, and the SFCC reports a flap fault (F/CTL FLAP SYS n FAULT)
    SlatFlapControlComputerFlapChannel(usize),
    /// The slat channel of SFCC n no longer controls its slat motor: the slats move at half speed on the
    /// other motor, and the SFCC reports a slat fault (F/CTL SLAT SYS n FAULT)
    SlatFlapControlComputerSlatChannel(usize),
    /// Smoke in a compartment: the smoke detectors of the compartment sense it (fire_protection::smoke_detection)
    Smoke(SmokeDetectionZone),
    /// Smoke detector n of a compartment is failed (fire_protection::smoke_detection)
    SmokeDetector(SmokeDetectionZone, usize),
    /// The smoke detection unit of the aircraft is failed (A380 Smoke Detection Function of the CIDS): it reports
    /// neither smoke nor a detector fault in any compartment (fire_protection::smoke_detection)
    SmokeDetectionFunction,
    /// Cargo fire extinguisher bottle n loses its agent: low pressure (A320 SMOKE CRG BTL FAULT, A380 SMOKE CARGO
    /// BOTTLES FAULT)
    CargoFireBottleLowPressure(usize),
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
    /// Channel n (1 or 2) of the A320 brake and steering control unit (BSCU). The A320 brake model also uses
    /// BrakeNormalBraking (normal braking equipment) and NoseWheelSteeringNormal (nose wheel steering system).
    BrakeSteeringControlUnitChannel(usize),
    /// The A320 alternate braking control unit (ABCU): no alternate braking, parking brake only as back-up
    AlternateBrakingControlUnit,
    /// The A320 brake normal selector valve is failed open: full green pressure at the entry of the normal servovalves
    /// (WHEEL HYD SEL FAULT)
    BrakeNormalSelectorValve,
    /// Tyre n is deflated (A320 TPIS: 1 to 4 the main wheels from left to right, 5 and 6 the left and right nose wheels)
    TyreDeflated(usize),
    // ATA30 (ice_rain_protection)
    /// The engine anti-ice valve of engine n stays closed
    EngineAntiIceValveStuckClosed(usize),
    /// The engine anti-ice valve of engine n stays open
    EngineAntiIceValveStuckOpen(usize),
    /// Both wing anti-ice valves of wing n (1 left, 2 right) stay closed (A380: a380_systems ice_rain_protection.rs)
    WingAntiIceValvesStuckClosed(usize),
    /// The outer wing anti-ice valve of wing n (1 left, 2 right) stays open and no longer regulates (A380)
    WingAntiIceOuterValveStuckOpen(usize),
    /// Probe heat computer n (1 CAPT, 2 F/O, 3 STBY) is failed (A320: a320_systems probe_window_heat.rs)
    ProbeHeatComputer(usize),
    /// The heater of probe p (1 pitot, 2 L static, 3 R static, 4 AOA, 5 TAT) of probe heat computer n is failed
    ProbeHeater(usize, usize),
    /// The heating of windshield n (1 left, 2 right) is failed
    WindshieldHeat(usize),
    /// The heating of cockpit side window n (1 left, 2 right) is failed
    WindowHeat(usize),
    // ATA35 (A380: a380_systems oxygen.rs)
    /// The cockpit oxygen bottle leaks: its pressure falls
    CockpitOxygenBottleLeak,
    /// The cabin oxygen bottles leak: their pressure falls
    CabinOxygenBottleLeak,
    /// A cabin oxygen regulator supply valve stays closed
    CabinOxygenValveStuckClosed,
    // ATA36 (A320: a320_systems pneumatic.rs)
    /// The bleed (pressure regulating) valve of engine n stays closed
    EngineBleedValveStuckClosed(usize),
    /// The bleed (pressure regulating) valve of engine n stays fully open: no pressure regulation
    EngineBleedValveStuckOpen(usize),
    /// The HP valve of engine n stays closed
    EngineHpValveStuckClosed(usize),
    /// The fan air valve of the precooler of engine n stays closed: the bleed air is not cooled
    EngineFanAirValveStuckClosed(usize),
    /// The fan air valve of the precooler of engine n stays fully open: the bleed air is overcooled
    EngineFanAirValveStuckOpen(usize),
    /// The crossbleed valve stays closed
    CrossBleedValveStuckClosed,
    /// The crossbleed valve stays open
    CrossBleedValveStuckOpen,
    /// The APU bleed valve stays closed
    ApuBleedValveStuckClosed,
    /// The APU bleed valve stays open
    ApuBleedValveStuckOpen,
    /// Hot air leaks from the bleed duct of engine n in its pylon
    EngineBleedLeak(usize),
    /// Hot air leaks from the bleed duct of wing n (1 left, 2 right)
    WingBleedLeak(usize),
    /// Hot air leaks from the APU bleed duct
    ApuBleedLeak,
    /// Hot air leaks from the bleed ducts in the bay of pack n, downstream of its pack valves (A380)
    PackBayLeak(usize),
    /// Hot air leaks from a hot-air duct of the hot-air valve n (A380)
    HotAirDuctLeak(usize),
    /// Hot air leaks from the forward cargo bleed duct (A380, on the hot-air valve 1)
    FwdCargoBleedDuctLeak,
    /// The pylon leak detection loop of engine n is inoperative
    EngineLeakDetectionLoop(usize),
    /// Leak detection loop A (1) or B (2) of wing n (1 left, 2 right) is inoperative
    WingLeakDetectionLoop(usize, usize),
    /// The APU leak detection loop is inoperative
    ApuLeakDetectionLoop,
    /// The bleed monitoring computer n is failed
    BleedMonitoringComputer(usize),
    /// The normal braking hydraulic equipment of all wheel groups (A380 BCS normal braking)
    BrakeNormalBraking,
    /// The alternate braking under brake control system control, all wheel groups (A380 BCS alternate braking)
    BrakeAlternateBraking,
    /// The emergency brake control unit (A380 EBCU): no emergency braking
    BrakeEmergencyBraking,
    /// The autobrake function cannot be armed (A320 BSCU autobrake, A380 BRAKES AUTO BRK FAULT)
    Autobrake,
    /// The normal mode of the nose wheel steering (A380 normal NWS)
    NoseWheelSteeringNormal,
    /// The alternate mode of the nose wheel steering (A380 steering LEHGS)
    NoseWheelSteeringAlternate,
    /// The body wheel steering stays centred and locked (A380 BWS)
    BodyWheelSteering,
    /// Steering control system n (A380 SCS 1 or 2)
    SteeringControlSystem(usize),
    // ATA34
    RadioAltimeter(usize),
    RadioAntennaInterrupted(usize),
    RadioAntennaDirectCoupling(usize),
    EnhancedGroundProximityWarningSystemComputer,
    /// The GPS receiver of MMR 1 or 2
    Gps(usize),
    /// The ILS receiver of MMR 1 or 2: no localiser and glideslope (navigation::ils)
    IlsReceiver(usize),
    /// The total pressure (pitot) input of ADR n is erroneous: its airspeed and Mach read low, with a valid status.
    /// The ADR does not see it; only a comparison with the other air data sources (PRIM monitoring) can detect it.
    AdrAirspeedErroneous(usize),
    /// The angle of attack probe of ADR n is erroneous: its angle of attack reads high, with a valid status
    AdrAngleOfAttackErroneous(usize),
    /// The air data reference part of ADIRU n fails: its outputs are lost (failure warning) and its FAULT light comes
    /// on (navigation::adirs)
    AdrFault(usize),
    /// The inertial reference part of ADIRU n fails: its outputs are lost (failure warning) and its FAULT light comes
    /// on steady (navigation::adirs)
    IrFault(usize),
    /// The heading of IR n is erroneous: its magnetic and true headings are offset, with a valid status
    IrHeadingErroneous(usize),
    // ATA42 integrated modular avionics (systems::integrated_modular_avionics)
    /// AFDX switch n (A380: 1 to 7 and 9 on network A, 11 to 17 and 19 on network B) is failed: it no
    /// longer routes the network messages
    AvionicsFullDuplexSwitch(u8),
    /// The input/output module named by its letter and number (A380: A1 to A8) is failed
    InputOutputModule(char, u8),
    /// The core processing input/output module named by its letter and number (A380: A1 to G4) is
    /// failed, with all its hosted applications
    CoreProcessingInputOutputModule(char, u8),
    // ATA72
    /// The flame of engine n goes out once; the crew can relight it (engine::engine_failure)
    EngineFlameout(usize),
    /// The core of engine n seizes: no relight while the failure is active (engine::engine_failure)
    EngineSeizure(usize),
    /// The fan (N1 rotor) of engine n is blocked: no N1 rotation during a start on the ground
    /// (A320 ENG 1(2) LOW N1, see a320_systems engine_failure)
    EngineFanBlocked(usize),
    // ATA79
    /// Engine n loses oil overboard: its oil quantity falls, then its oil pressure (engine::oil_failure)
    EngineOilLeak(usize),
    /// The oil filter of engine n is clogged: a crew awareness indication (engine::oil_failure)
    EngineOilFilterClog(usize),
    /// The oil of engine n is no longer cooled enough: its temperature rises with thrust (engine::oil_failure)
    EngineOilOverheat(usize),
    // ATA74
    /// Igniter A (B) of engine n does not light the engine (engine::engine_start)
    EngineIgniterA(usize),
    EngineIgniterB(usize),
    // ATA80
    /// The start valve of engine n stays closed (engine::engine_start)
    EngineStartValveStuckClosed(usize),
    /// The start valve of engine n stays open (engine::engine_start)
    EngineStartValveStuckOpen(usize),
    /// The EGT of engine n overshoots during a start on the ground (engine::engine_start)
    EngineHotStart(usize),
    /// The core speed of engine n hangs below idle during a start on the ground (engine::engine_start)
    EngineHungStart(usize),
    /// Engine n stalls during a start on the ground (engine::engine_start)
    EngineStartStall(usize),
    /// The starter of engine n does not turn the engine (engine::engine_start)
    EngineStarter(usize),
    // ATA72 and ATA77: the engine keeps running (engine::engine_malfunction)
    /// Engine n stalls above a thrust threshold: thrust loss, EGT rise, fluctuating N1 and N2
    EngineCompressorStall(usize),
    /// The EGT of engine n is too high, more so at high thrust
    EngineEgtOvertemperature(usize),
    /// The N1 and N2 indications of engine n run above their values, more so at high thrust
    EngineOverspeed(usize),
    /// The N1 and N2 rotors of engine n vibrate above the advisory at high thrust
    EngineHighVibration(usize),
    // ATA73 FADEC and thrust lever (stage A5/B5, see a320_systems / a380_systems engine_control_failure)
    /// FADEC channel A of engine n is lost
    FadecChannelA(usize),
    /// FADEC channel B of engine n is lost
    FadecChannelB(usize),
    /// The FADEC of engine n detects a high temperature
    FadecOverheat(usize),
    /// The FADEC of engine n overheats and shuts the engine down (A380 ENG FAIL "FADEC OVHT")
    FadecOverheatShutdown(usize),
    /// The FADEC of engine n detects an overthrust (A380 overthrust protection: ENG FAIL "THRUST
    /// CTL LOST" on ground, CTL SYS FAULT fuel cutback in flight)
    EngineOverthrust(usize),
    /// The FADEC of engine n cannot communicate via the avionics networks (A380 ENG FADEC FAULT)
    FadecNetworkLink(usize),
    /// A FADEC failure of engine n affects the engine control (A380 ENG FADEC SYS FAULT)
    FadecSystem(usize),
    /// Both resolvers of thrust lever n are lost (ENG THR LEVER FAULT)
    ThrustLeverResolvers(usize),
    /// The two resolvers of thrust lever n disagree (A320 ENG THR LEVER DISAGREE)
    ThrustLeverResolverDisagree(usize),
    /// The fuel filter of engine n is clogged: a crew awareness indication (engine::fuel_filter_failure)
    EngineFuelFilterClog(usize),
    /// The HP fuel shutoff valve of engine n sticks in its position (engine::hp_fuel_valve_failure)
    EngineHpFuelValveStuck(usize),
    /// A fault the FADEC of engine n detects and reports, with no effect on the engine model
    /// (engine::engine_monitoring_fault)
    EngineMonitoringFault(usize, EngineMonitoringFaultKind),
    /// The LP fuel valve of engine n is jammed in its position: it no longer follows the ENG MASTER
    /// and the ENG FIRE pushbutton (fuel::engine_lp_valve)
    EngineLpValveJammed(usize),
    /// The APU LP fuel valve is jammed in its position: it no longer follows the APU MASTER SW and
    /// the APU FIRE pushbutton (A320 a320_systems fuel/apu_lp_valve.rs)
    ApuLpValveJammed,
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
    /// The FADEC of engine n detects a reverser failure that does not impair the reverser
    /// operation (A380 REVERSER MINOR FAULT): alert only
    ReverserMinorFault(usize),
    /// The thrust reverser of engine n is inhibited by maintenance action: it does not deploy (A380
    /// REVERSER INHIBITED)
    ReverserInhibited(usize),
    // ATA49: the APU electronic control box (ECB) shuts the APU down (apu::electronic_control_box)
    /// The APU ECB is failed
    ApuElectronicControlBox,
    /// The APU overspeeds
    ApuOverspeed,
    /// The APU oil pressure is low
    ApuOilLowPressure,
    /// The APU oil temperature is high
    ApuOilHighTemperature,
    /// The APU air intake flap is failed closed: it closes whatever its command (apu::air_intake_flap)
    ApuAirIntakeFlapFailedClosed,
    /// The APU oil level is low: the ECB detects it on the ground with the APU not running (A320 SD APU page LOW OIL
    /// LEVEL), the APU still runs
    ApuOilLevelLow,
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
