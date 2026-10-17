/// Destructures a `VariablesToObject::write()` (or similarly shaped) `values: Vec<f64>` into one
/// named `f64` binding per element, in the same order as the `variables()` list being read.
///
/// This exists because every `VariablesToObject` impl in this crate reads its `write()` inputs by
/// raw position (`values[0]`, `values[1]`, ...), with nothing tying that position back to the
/// `Variable` it came from other than the programmer keeping two separately-declared lists in
/// sync by hand. Destructuring through this macro instead gives every value a name at the point it
/// is unpacked, so the correspondence to `variables()` is visible right there, and a mismatched
/// count fails loudly (a panic) instead of silently reading the wrong input.
macro_rules! unpack_values {
    ($values:expr, [$($name:ident),+ $(,)?]) => {
        let &[$($name),+] = $values else {
            panic!(
                "unpack_values!: expected {} values, got {}",
                [$(stringify!($name)),+].len(),
                $values.len()
            );
        };
    };
}

mod ailerons;
mod autobrakes;
mod brakes;
mod elevators;
mod flaps;
mod gear;
mod nose_wheel_steering;
mod payload;
mod reversers;
mod rudder;
mod spoilers;
mod trimmable_horizontal_stabilizer;

use a320_systems::A320;
use ailerons::ailerons;
use autobrakes::autobrakes;
use brakes::brakes;
use elevators::elevators;
use flaps::flaps;
use gear::gear;
use nose_wheel_steering::nose_wheel_steering;
use payload::payload;
use reversers::reversers;
use rudder::rudder;
use spoilers::spoilers;
use std::error::Error;
use systems::air_conditioning::{
    acs_controller::AcscId, cabin_pressure_controller::CpcId, Channel, ZoneType,
};
use systems::engine::engine_monitoring_fault::EngineMonitoringFaultKind;
use systems::failures::FailureType;
use systems::shared::{
    report_diagnostic, AirbusElectricPumpId, AirbusEngineDrivenPumpId, ElectricalBusType,
    FireDetectionLoopID, FireDetectionZone, GearActuatorId, HydraulicColor, LgciuId,
    ProximityDetectorId, SmokeDetectionZone,
};
use systems_wasm::aspects::ExecuteOn;
use systems_wasm::{MsfsSimulationBuilder, Variable};
use trimmable_horizontal_stabilizer::trimmable_horizontal_stabilizer;

#[msfs::gauge(name=systems)]
async fn systems(mut gauge: msfs::Gauge) -> Result<(), Box<dyn Error>> {
    // The default panic output is lost when the WASM instance aborts, so print the
    // panic message and location to the MSFS console before the trap happens.
    std::panic::set_hook(Box::new(|panic_info| {
        println!("A32NX_SYSTEMS PANIC: {panic_info}");
        report_diagnostic(&format!("A32NX_SYSTEMS PANIC: {panic_info}"));
    }));

    let mut sim_connect = gauge.open_simconnect("systems")?;

    let key_prefix = "A32NX_";
    let (mut simulation, mut handler) = MsfsSimulationBuilder::new(
        key_prefix,
        Variable::named(&format!("{}START_STATE", key_prefix)),
        sim_connect.as_mut().get_mut(),
    )
    .with_electrical_buses([
        (ElectricalBusType::AlternatingCurrent(1), 2),
        (ElectricalBusType::AlternatingCurrent(2), 3),
        (ElectricalBusType::AlternatingCurrentEssential, 4),
        (ElectricalBusType::AlternatingCurrentEssentialShed, 5),
        (ElectricalBusType::AlternatingCurrentStaticInverter, 6),
        (ElectricalBusType::AlternatingCurrentGndFltService, 14),
        (ElectricalBusType::DirectCurrent(1), 7),
        (ElectricalBusType::DirectCurrent(2), 8),
        (ElectricalBusType::DirectCurrentEssential, 9),
        (ElectricalBusType::DirectCurrentEssentialShed, 10),
        (ElectricalBusType::DirectCurrentBattery, 11),
        (ElectricalBusType::DirectCurrentHot(1), 12),
        (ElectricalBusType::DirectCurrentHot(2), 13),
        (ElectricalBusType::DirectCurrentGndFltService, 15),
    ])?
    .with_auxiliary_power_unit(Variable::named("OVHD_APU_START_PB_IS_AVAILABLE"), 8, 7)?
    // The MSFS engine anti-ice follows the engine anti-ice valves (a320_systems pneumatic.rs)
    .with_engine_anti_ice_valves(2)?
    .with_wing_anti_ice()?
    // The engine fuel is cut when the engine starves (its LP fuel valve is closed and the fuel left
    // downstream of it is burned, FCOM PRO-ABN-ENG, see a320_systems fuel/engine_lp_valve.rs), and
    // by a flameout or seizure failure until a relight lights it up (a320_systems engine_failure.rs).
    // Fuel valves 13 and 14 of flight_model.cfg feed the engines in series with their MSFS engine
    // valves 1 and 2: closing them stops the MSFS combustion exactly when the fuel is cut.
    .with_fuel_valves_closed_while([
        (Variable::named("ENGINE_1_FUEL_CUT"), 13),
        (Variable::named("ENGINE_2_FUEL_CUT"), 14),
    ])?
    .with_failures([
        (
            21_000,
            FailureType::Acsc(AcscId::Acsc1(Channel::ChannelOne)),
        ),
        (
            21_001,
            FailureType::Acsc(AcscId::Acsc1(Channel::ChannelTwo)),
        ),
        (
            21_002,
            FailureType::Acsc(AcscId::Acsc2(Channel::ChannelOne)),
        ),
        (
            21_003,
            FailureType::Acsc(AcscId::Acsc2(Channel::ChannelTwo)),
        ),
        (21_004, FailureType::HotAir(1)),
        (21_005, FailureType::TrimAirHighPressure),
        (21_006, FailureType::TrimAirFault(ZoneType::Cockpit)),
        (21_007, FailureType::TrimAirFault(ZoneType::Cabin(1))),
        (21_008, FailureType::TrimAirFault(ZoneType::Cabin(2))),
        (21_009, FailureType::TrimAirOverheat(ZoneType::Cockpit)),
        (21_010, FailureType::TrimAirOverheat(ZoneType::Cabin(1))),
        (21_011, FailureType::TrimAirOverheat(ZoneType::Cabin(2))),
        (21_012, FailureType::CabinFan(1)),
        (21_013, FailureType::CabinFan(2)),
        (21_014, FailureType::GalleyFans),
        (21_015, FailureType::CpcFault(CpcId::Cpc1)),
        (21_016, FailureType::CpcFault(CpcId::Cpc2)),
        (21_017, FailureType::OutflowValveFault),
        (21_018, FailureType::SafetyValveFault),
        (21_019, FailureType::RapidDecompression),
        (21_026, FailureType::AftCargoIsolationValvesStuckClosed),
        (24_000, FailureType::TransformerRectifier(1)),
        (24_001, FailureType::TransformerRectifier(2)),
        (24_002, FailureType::TransformerRectifier(3)),
        (24_004, FailureType::StaticInverter),
        (24_010, FailureType::Battery(1)),
        (24_011, FailureType::Battery(2)),
        (24_012, FailureType::BatteryChargeLimiter(1)),
        (24_013, FailureType::BatteryChargeLimiter(2)),
        (24_020, FailureType::Generator(1)),
        (24_021, FailureType::Generator(2)),
        (24_022, FailureType::IntegratedDriveGeneratorOilLeak(1)),
        (24_023, FailureType::IntegratedDriveGeneratorOilLeak(2)),
        (24_024, FailureType::IntegratedDriveGeneratorOilOverheat(1)),
        (24_025, FailureType::IntegratedDriveGeneratorOilOverheat(2)),
        (24_030, FailureType::ApuGenerator(1)),
        (
            24_100,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrent(1)),
        ),
        (
            24_101,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrent(2)),
        ),
        (
            24_102,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrentEssential),
        ),
        (
            24_103,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrentEssentialShed),
        ),
        (
            24_104,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrentStaticInverter),
        ),
        (
            24_105,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrentGndFltService),
        ),
        (
            24_106,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrent(1)),
        ),
        (
            24_107,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrent(2)),
        ),
        (
            24_108,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentEssential),
        ),
        (
            24_109,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentEssentialShed),
        ),
        (
            24_110,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentBattery),
        ),
        (
            24_111,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentHot(1)),
        ),
        (
            24_112,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentHot(2)),
        ),
        (
            24_113,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentGndFltService),
        ),
        (26_000, FailureType::SetOnFire(FireDetectionZone::Engine(1))),
        (26_001, FailureType::SetOnFire(FireDetectionZone::Engine(2))),
        (26_002, FailureType::SetOnFire(FireDetectionZone::Apu)),
        (
            26_003,
            FailureType::FireDetectionLoop(FireDetectionLoopID::A, FireDetectionZone::Engine(1)),
        ),
        (
            26_004,
            FailureType::FireDetectionLoop(FireDetectionLoopID::B, FireDetectionZone::Engine(1)),
        ),
        (
            26_005,
            FailureType::FireDetectionLoop(FireDetectionLoopID::A, FireDetectionZone::Engine(2)),
        ),
        (
            26_006,
            FailureType::FireDetectionLoop(FireDetectionLoopID::B, FireDetectionZone::Engine(2)),
        ),
        (
            26_007,
            FailureType::FireDetectionLoop(FireDetectionLoopID::A, FireDetectionZone::Apu),
        ),
        (
            26_008,
            FailureType::FireDetectionLoop(FireDetectionLoopID::B, FireDetectionZone::Apu),
        ),
        (
            26_009,
            FailureType::FireDetectionUnit(FireDetectionZone::Engine(1)),
        ),
        (
            26_010,
            FailureType::FireDetectionUnit(FireDetectionZone::Engine(2)),
        ),
        (
            26_011,
            FailureType::FireDetectionUnit(FireDetectionZone::Apu),
        ),
        // SFCC flap and slat channels (hydraulic::sfcc): F/CTL FLAP(SLAT) SYS 1(2) FAULT
        (27_010, FailureType::SlatFlapControlComputerFlapChannel(1)),
        (27_011, FailureType::SlatFlapControlComputerFlapChannel(2)),
        (27_012, FailureType::SlatFlapControlComputerSlatChannel(1)),
        (27_013, FailureType::SlatFlapControlComputerSlatChannel(2)),
        (26_012, FailureType::Smoke(SmokeDetectionZone::ForwardCargo)),
        (26_013, FailureType::Smoke(SmokeDetectionZone::AftCargo)),
        (
            26_014,
            FailureType::SmokeDetector(SmokeDetectionZone::ForwardCargo, 1),
        ),
        (
            26_015,
            FailureType::SmokeDetector(SmokeDetectionZone::ForwardCargo, 2),
        ),
        (
            26_016,
            FailureType::SmokeDetector(SmokeDetectionZone::AftCargo, 1),
        ),
        (
            26_017,
            FailureType::SmokeDetector(SmokeDetectionZone::AftCargo, 2),
        ),
        (26_018, FailureType::Smoke(SmokeDetectionZone::Avionics)),
        (
            26_019,
            FailureType::SmokeDetector(SmokeDetectionZone::Avionics, 1),
        ),
        (26_020, FailureType::CargoFireBottleLowPressure(1)),
        (29_000, FailureType::ReservoirLeak(HydraulicColor::Green)),
        (29_001, FailureType::ReservoirLeak(HydraulicColor::Blue)),
        (29_002, FailureType::ReservoirLeak(HydraulicColor::Yellow)),
        (29_003, FailureType::ReservoirAirLeak(HydraulicColor::Green)),
        (29_004, FailureType::ReservoirAirLeak(HydraulicColor::Blue)),
        (
            29_005,
            FailureType::ReservoirAirLeak(HydraulicColor::Yellow),
        ),
        (
            29_006,
            FailureType::ReservoirReturnLeak(HydraulicColor::Green),
        ),
        (
            29_007,
            FailureType::ReservoirReturnLeak(HydraulicColor::Blue),
        ),
        (
            29_008,
            FailureType::ReservoirReturnLeak(HydraulicColor::Yellow),
        ),
        (
            29_009,
            FailureType::EnginePumpOverheat(AirbusEngineDrivenPumpId::Green),
        ),
        (
            29_010,
            FailureType::ElecPumpOverheat(AirbusElectricPumpId::Blue),
        ),
        (
            29_011,
            FailureType::EnginePumpOverheat(AirbusEngineDrivenPumpId::Yellow),
        ),
        (
            29_012,
            FailureType::ElecPumpOverheat(AirbusElectricPumpId::Yellow),
        ),
        (32_000, FailureType::LgciuPowerSupply(LgciuId::Lgciu1)),
        (32_001, FailureType::LgciuPowerSupply(LgciuId::Lgciu2)),
        (32_002, FailureType::LgciuInternalError(LgciuId::Lgciu1)),
        (32_003, FailureType::LgciuInternalError(LgciuId::Lgciu2)),
        (
            32_004,
            FailureType::GearProxSensorDamage(ProximityDetectorId::UplockGearNose1),
        ),
        (
            32_005,
            FailureType::GearProxSensorDamage(ProximityDetectorId::DownlockGearNose2),
        ),
        (
            32_006,
            FailureType::GearProxSensorDamage(ProximityDetectorId::UplockGearRight1),
        ),
        (
            32_007,
            FailureType::GearProxSensorDamage(ProximityDetectorId::DownlockGearRight2),
        ),
        (
            32_008,
            FailureType::GearProxSensorDamage(ProximityDetectorId::UplockGearLeft2),
        ),
        (
            32_009,
            FailureType::GearProxSensorDamage(ProximityDetectorId::DownlockGearLeft1),
        ),
        (
            32_010,
            FailureType::GearProxSensorDamage(ProximityDetectorId::UplockDoorNose1),
        ),
        (
            32_011,
            FailureType::GearProxSensorDamage(ProximityDetectorId::DownlockDoorNose2),
        ),
        (
            32_012,
            FailureType::GearProxSensorDamage(ProximityDetectorId::UplockDoorRight2),
        ),
        (
            32_013,
            FailureType::GearProxSensorDamage(ProximityDetectorId::DownlockDoorRight1),
        ),
        (
            32_014,
            FailureType::GearProxSensorDamage(ProximityDetectorId::UplockDoorLeft2),
        ),
        (
            32_015,
            FailureType::GearProxSensorDamage(ProximityDetectorId::DownlockDoorLeft1),
        ),
        (
            32_020,
            FailureType::GearActuatorJammed(GearActuatorId::GearNose),
        ),
        (
            32_021,
            FailureType::GearActuatorJammed(GearActuatorId::GearLeft),
        ),
        (
            32_022,
            FailureType::GearActuatorJammed(GearActuatorId::GearRight),
        ),
        (
            32_023,
            FailureType::GearActuatorJammed(GearActuatorId::GearDoorNose),
        ),
        (
            32_024,
            FailureType::GearActuatorJammed(GearActuatorId::GearDoorLeft),
        ),
        (
            32_025,
            FailureType::GearActuatorJammed(GearActuatorId::GearDoorRight),
        ),
        (
            32_100,
            FailureType::BrakeHydraulicLeak(HydraulicColor::Green),
        ),
        (
            32_101,
            FailureType::BrakeHydraulicLeak(HydraulicColor::Yellow),
        ),
        (32_150, FailureType::BrakeAccumulatorGasLeak),
        (32_200, FailureType::BrakeSteeringControlUnitChannel(1)),
        (32_201, FailureType::BrakeSteeringControlUnitChannel(2)),
        (32_202, FailureType::AlternateBrakingControlUnit),
        (32_203, FailureType::BrakeNormalBraking),
        (32_204, FailureType::Autobrake),
        (32_205, FailureType::NoseWheelSteeringNormal),
        (32_210, FailureType::BrakeNormalSelectorValve),
        (32_300, FailureType::TyreDeflated(1)),
        (32_301, FailureType::TyreDeflated(2)),
        (32_302, FailureType::TyreDeflated(3)),
        (32_303, FailureType::TyreDeflated(4)),
        (32_304, FailureType::TyreDeflated(5)),
        (32_305, FailureType::TyreDeflated(6)),
        (32_306, FailureType::TyreBurst(1)),
        (32_307, FailureType::TyreBurst(2)),
        (32_308, FailureType::TyreBurst(3)),
        (32_309, FailureType::TyreBurst(4)),
        (32_310, FailureType::TyreBurst(5)),
        (32_311, FailureType::TyreBurst(6)),
        (34_000, FailureType::RadioAltimeter(1)),
        (34_001, FailureType::RadioAltimeter(2)),
        (34_010, FailureType::RadioAntennaInterrupted(1)),
        (34_011, FailureType::RadioAntennaInterrupted(2)),
        (34_020, FailureType::RadioAntennaDirectCoupling(1)),
        (34_021, FailureType::RadioAntennaDirectCoupling(2)),
        (34_040, FailureType::Gps(1)),
        (34_041, FailureType::Gps(2)),
        // ADIRS (systems navigation/adirs.rs)
        (34_070, FailureType::AdrFault(1)),
        (34_071, FailureType::AdrFault(2)),
        (34_072, FailureType::AdrFault(3)),
        (34_080, FailureType::IrFault(1)),
        (34_081, FailureType::IrFault(2)),
        (34_082, FailureType::IrFault(3)),
        (34_090, FailureType::AdrAirspeedErroneous(1)),
        (34_091, FailureType::AdrAirspeedErroneous(2)),
        (34_092, FailureType::AdrAirspeedErroneous(3)),
        (34_100, FailureType::AdrAngleOfAttackErroneous(1)),
        (34_101, FailureType::AdrAngleOfAttackErroneous(2)),
        (34_102, FailureType::AdrAngleOfAttackErroneous(3)),
        (34_110, FailureType::IrHeadingErroneous(1)),
        (34_111, FailureType::IrHeadingErroneous(2)),
        (34_112, FailureType::IrHeadingErroneous(3)),
        // ILS receivers of the MMRs (systems navigation/ils.rs)
        (34_160, FailureType::IlsReceiver(1)),
        (34_161, FailureType::IlsReceiver(2)),
        (72_000, FailureType::EngineFlameout(1)),
        (72_001, FailureType::EngineFlameout(2)),
        (72_010, FailureType::EngineSeizure(1)),
        (72_011, FailureType::EngineSeizure(2)),
        (72_020, FailureType::EngineFanBlocked(1)),
        (72_021, FailureType::EngineFanBlocked(2)),
        (79_000, FailureType::EngineOilLeak(1)),
        (79_001, FailureType::EngineOilLeak(2)),
        (79_020, FailureType::EngineOilFilterClog(1)),
        (79_021, FailureType::EngineOilFilterClog(2)),
        (79_030, FailureType::EngineOilOverheat(1)),
        (79_031, FailureType::EngineOilOverheat(2)),
        (74_000, FailureType::EngineIgniterA(1)),
        (74_001, FailureType::EngineIgniterA(2)),
        (74_010, FailureType::EngineIgniterB(1)),
        (74_011, FailureType::EngineIgniterB(2)),
        // ATA 30 engine anti-ice valves (systems ice_rain_protection, in a320_systems pneumatic.rs)
        (30_000, FailureType::EngineAntiIceValveStuckClosed(1)),
        (30_001, FailureType::EngineAntiIceValveStuckClosed(2)),
        (30_010, FailureType::EngineAntiIceValveStuckOpen(1)),
        (30_011, FailureType::EngineAntiIceValveStuckOpen(2)),
        // ATA 30 probe and window heat (a320_systems probe_window_heat.rs)
        (30_100, FailureType::ProbeHeatComputer(1)),
        (30_101, FailureType::ProbeHeatComputer(2)),
        (30_102, FailureType::ProbeHeatComputer(3)),
        (30_110, FailureType::ProbeHeater(1, 1)),
        (30_111, FailureType::ProbeHeater(1, 2)),
        (30_112, FailureType::ProbeHeater(1, 3)),
        (30_113, FailureType::ProbeHeater(1, 4)),
        (30_114, FailureType::ProbeHeater(1, 5)),
        (30_120, FailureType::ProbeHeater(2, 1)),
        (30_121, FailureType::ProbeHeater(2, 2)),
        (30_122, FailureType::ProbeHeater(2, 3)),
        (30_123, FailureType::ProbeHeater(2, 4)),
        (30_124, FailureType::ProbeHeater(2, 5)),
        (30_130, FailureType::ProbeHeater(3, 1)),
        (30_131, FailureType::ProbeHeater(3, 2)),
        (30_132, FailureType::ProbeHeater(3, 3)),
        (30_133, FailureType::ProbeHeater(3, 4)),
        (30_200, FailureType::WindshieldHeat(1)),
        (30_201, FailureType::WindshieldHeat(2)),
        (30_210, FailureType::WindowHeat(1)),
        (30_211, FailureType::WindowHeat(2)),
        // ATA 35 oxygen (a320_systems oxygen.rs)
        (35_000, FailureType::CockpitOxygenBottleLeak),
        // ATA 36 pneumatic (a320_systems pneumatic.rs)
        (36_000, FailureType::EngineBleedValveStuckClosed(1)),
        (36_001, FailureType::EngineBleedValveStuckClosed(2)),
        (36_010, FailureType::EngineBleedValveStuckOpen(1)),
        (36_011, FailureType::EngineBleedValveStuckOpen(2)),
        (36_020, FailureType::EngineHpValveStuckClosed(1)),
        (36_021, FailureType::EngineHpValveStuckClosed(2)),
        (36_030, FailureType::EngineFanAirValveStuckClosed(1)),
        (36_031, FailureType::EngineFanAirValveStuckClosed(2)),
        (36_040, FailureType::EngineFanAirValveStuckOpen(1)),
        (36_041, FailureType::EngineFanAirValveStuckOpen(2)),
        (36_050, FailureType::CrossBleedValveStuckClosed),
        (36_051, FailureType::CrossBleedValveStuckOpen),
        (36_060, FailureType::ApuBleedValveStuckClosed),
        (36_061, FailureType::ApuBleedValveStuckOpen),
        (36_070, FailureType::EngineBleedLeak(1)),
        (36_071, FailureType::EngineBleedLeak(2)),
        (36_072, FailureType::WingBleedLeak(1)),
        (36_073, FailureType::WingBleedLeak(2)),
        (36_074, FailureType::ApuBleedLeak),
        (36_080, FailureType::EngineLeakDetectionLoop(1)),
        (36_081, FailureType::EngineLeakDetectionLoop(2)),
        (36_082, FailureType::WingLeakDetectionLoop(1, 1)),
        (36_083, FailureType::WingLeakDetectionLoop(1, 2)),
        (36_084, FailureType::WingLeakDetectionLoop(2, 1)),
        (36_085, FailureType::WingLeakDetectionLoop(2, 2)),
        (36_086, FailureType::ApuLeakDetectionLoop),
        (36_090, FailureType::BleedMonitoringComputer(1)),
        (36_091, FailureType::BleedMonitoringComputer(2)),
        (49_000, FailureType::ApuElectronicControlBox),
        (49_001, FailureType::ApuOverspeed),
        (49_002, FailureType::ApuOilLowPressure),
        (49_003, FailureType::ApuOilHighTemperature),
        (49_004, FailureType::ApuAirIntakeFlapFailedClosed),
        (49_005, FailureType::ApuOilLevelLow),
        (80_000, FailureType::EngineStartValveStuckClosed(1)),
        (80_001, FailureType::EngineStartValveStuckClosed(2)),
        (80_010, FailureType::EngineStartValveStuckOpen(1)),
        (80_011, FailureType::EngineStartValveStuckOpen(2)),
        (80_020, FailureType::EngineHotStart(1)),
        (80_021, FailureType::EngineHotStart(2)),
        (80_030, FailureType::EngineHungStart(1)),
        (80_031, FailureType::EngineHungStart(2)),
        (80_040, FailureType::EngineStartStall(1)),
        (80_041, FailureType::EngineStartStall(2)),
        (80_050, FailureType::EngineStarter(1)),
        (80_051, FailureType::EngineStarter(2)),
        // Stage A4: the engine keeps running (a320_systems engine_malfunction.rs)
        (72_100, FailureType::EngineCompressorStall(1)),
        (72_101, FailureType::EngineCompressorStall(2)),
        (72_110, FailureType::EngineEgtOvertemperature(1)),
        (72_111, FailureType::EngineEgtOvertemperature(2)),
        (72_120, FailureType::EngineOverspeed(1)),
        (72_121, FailureType::EngineOverspeed(2)),
        (77_000, FailureType::EngineHighVibration(1)),
        (77_001, FailureType::EngineHighVibration(2)),
        // Engine failures stage A5: FADEC and thrust lever (ATA 73), thrust reversers (ATA 78)
        (73_010, FailureType::FadecChannelA(1)),
        (73_011, FailureType::FadecChannelA(2)),
        (73_020, FailureType::FadecChannelB(1)),
        (73_021, FailureType::FadecChannelB(2)),
        (73_030, FailureType::FadecOverheat(1)),
        (73_031, FailureType::FadecOverheat(2)),
        (73_040, FailureType::ThrustLeverResolvers(1)),
        (73_041, FailureType::ThrustLeverResolvers(2)),
        (73_050, FailureType::ThrustLeverResolverDisagree(1)),
        (73_051, FailureType::ThrustLeverResolverDisagree(2)),
        (28_007, FailureType::EngineLpValveJammed(1)),
        (28_008, FailureType::EngineLpValveJammed(2)),
        // FCOM PRO-ABN-FUEL FUEL APU LP VALVE FAULT (a320_systems fuel/apu_lp_valve.rs)
        (28_011, FailureType::ApuLpValveJammed),
        (73_100, FailureType::EngineFuelFilterClog(1)),
        (73_101, FailureType::EngineFuelFilterClog(2)),
        // FCOM PRO-ABN-ENG ENG 1(2) HP FUEL VALVE (systems engine/hp_fuel_valve_failure.rs)
        (73_200, FailureType::EngineHpFuelValveStuck(1)),
        (73_201, FailureType::EngineHpFuelValveStuck(2)),
        // The FADEC faults without engine model effect (systems engine/engine_monitoring_fault.rs)
        (
            73_210,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::FadecAlternator),
        ),
        (
            73_211,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::FadecAlternator),
        ),
        (
            73_220,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::OverspeedProtection),
        ),
        (
            73_221,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::OverspeedProtection),
        ),
        (
            73_230,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::InletProbes),
        ),
        (
            73_231,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::InletProbes),
        ),
        (
            73_240,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::Sensors),
        ),
        (
            73_241,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::Sensors),
        ),
        (
            73_060,
            FailureType::EngineMonitoringFault(
                1,
                EngineMonitoringFaultKind::OneThrustLeverResolver,
            ),
        ),
        (
            73_061,
            FailureType::EngineMonitoringFault(
                2,
                EngineMonitoringFaultKind::OneThrustLeverResolver,
            ),
        ),
        (
            78_030,
            FailureType::EngineMonitoringFault(
                1,
                EngineMonitoringFaultKind::ReverserPermissionSwitch,
            ),
        ),
        (
            78_031,
            FailureType::EngineMonitoringFault(
                2,
                EngineMonitoringFaultKind::ReverserPermissionSwitch,
            ),
        ),
        // FCOM PRO-ABN-ENG FUEL CTL FAULT, FUEL RETURN VALVE, CTL VALVE FAULT, COMPRESSOR VANE, BLEED
        // STATUS FAULT, REV INHIBITED (stops the reverser deployment), REV ISOL FAULT
        (
            73_250,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::FuelMeteringValve),
        ),
        (
            73_251,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::FuelMeteringValve),
        ),
        (
            73_260,
            FailureType::EngineMonitoringFault(
                1,
                EngineMonitoringFaultKind::FuelReturnValveFailedClosed,
            ),
        ),
        (
            73_261,
            FailureType::EngineMonitoringFault(
                2,
                EngineMonitoringFaultKind::FuelReturnValveFailedClosed,
            ),
        ),
        (
            73_270,
            FailureType::EngineMonitoringFault(
                1,
                EngineMonitoringFaultKind::FuelReturnValveFailedOpen,
            ),
        ),
        (
            73_271,
            FailureType::EngineMonitoringFault(
                2,
                EngineMonitoringFaultKind::FuelReturnValveFailedOpen,
            ),
        ),
        (
            73_280,
            FailureType::EngineMonitoringFault(
                1,
                EngineMonitoringFaultKind::ClearanceControlValves,
            ),
        ),
        (
            73_281,
            FailureType::EngineMonitoringFault(
                2,
                EngineMonitoringFaultKind::ClearanceControlValves,
            ),
        ),
        (
            73_290,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::CompressorVanes),
        ),
        (
            73_291,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::CompressorVanes),
        ),
        (
            73_300,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::CompressorVaneChannel),
        ),
        (
            73_301,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::CompressorVaneChannel),
        ),
        (
            73_310,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::BleedValveStatus),
        ),
        (
            73_311,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::BleedValveStatus),
        ),
        (
            78_040,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::ReverserInhibited),
        ),
        (
            78_041,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::ReverserInhibited),
        ),
        (
            78_050,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::ReverserShutoffValve),
        ),
        (
            78_051,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::ReverserShutoffValve),
        ),
        (78_000, FailureType::ReverserFault(1)),
        (78_001, FailureType::ReverserFault(2)),
        (78_010, FailureType::ReverserUnlocked(1)),
        (78_011, FailureType::ReverserUnlocked(2)),
        (78_020, FailureType::ReverserPressurized(1)),
        (78_021, FailureType::ReverserPressurized(2)),
        (
            34_030,
            FailureType::EnhancedGroundProximityWarningSystemComputer,
        ),
    ])
    .provides_aircraft_variable("ACCELERATION BODY X", "feet per second squared", 0)?
    .provides_aircraft_variable("ACCELERATION BODY Y", "feet per second squared", 0)?
    .provides_aircraft_variable("ACCELERATION BODY Z", "feet per second squared", 0)?
    .provides_aircraft_variable("AIRSPEED INDICATED", "Knots", 0)?
    .provides_aircraft_variable("AIRSPEED MACH", "Mach", 0)?
    .provides_aircraft_variable("AIRSPEED TRUE", "Knots", 0)?
    .provides_aircraft_variable("AMBIENT DENSITY", "Slugs per cubic feet", 0)?
    .provides_aircraft_variable("AMBIENT IN CLOUD", "Bool", 0)?
    .provides_aircraft_variable("AMBIENT PRECIP RATE", "millimeters of water", 0)?
    .provides_aircraft_variable("AMBIENT PRESSURE", "inHg", 0)?
    .provides_aircraft_variable("AMBIENT TEMPERATURE", "celsius", 0)?
    .provides_aircraft_variable("AMBIENT WIND DIRECTION", "Degrees", 0)?
    .provides_aircraft_variable("AMBIENT WIND VELOCITY", "Knots", 0)?
    .provides_aircraft_variable("AMBIENT WIND X", "meter per second", 0)?
    .provides_aircraft_variable("AMBIENT WIND Y", "meter per second", 0)?
    .provides_aircraft_variable("AMBIENT WIND Z", "meter per second", 0)?
    .provides_aircraft_variable("ANTISKID BRAKES ACTIVE", "Bool", 0)?
    .provides_aircraft_variable("APU ON FIRE DETECTED", "Bool", 0)?
    .provides_aircraft_variable("CONTACT POINT COMPRESSION", "Percent", 0)?
    .provides_aircraft_variable("CONTACT POINT COMPRESSION", "Percent", 1)?
    .provides_aircraft_variable("CONTACT POINT COMPRESSION", "Percent", 2)?
    .provides_aircraft_variable("ENG ON FIRE", "Bool", 1)?
    .provides_aircraft_variable("ENG ON FIRE", "Bool", 2)?
    .provides_aircraft_variable("FUEL TANK CENTER QUANTITY", "gallons", 0)?
    .provides_aircraft_variable("FUEL TANK LEFT MAIN QUANTITY", "gallons", 0)?
    .provides_aircraft_variable("FUEL TANK LEFT AUX QUANTITY", "gallons", 0)?
    .provides_aircraft_variable("FUEL TANK RIGHT MAIN QUANTITY", "gallons", 0)?
    .provides_aircraft_variable("FUEL TANK RIGHT AUX QUANTITY", "gallons", 0)?
    .provides_aircraft_variable("FUELSYSTEM LINE FUEL FLOW", "gallons per hour", 18)?
    .provides_aircraft_variable_range("FUELSYSTEM PUMP ACTIVE", "Bool", 1..=7)?
    .provides_aircraft_variable("FUELSYSTEM VALVE SWITCH", "Bool", 1)?
    .provides_aircraft_variable("FUELSYSTEM VALVE SWITCH", "Bool", 2)?
    // The fuel X FEED valve (gravity feed ceiling, a320_systems fuel/gravity_feed.rs)
    .provides_aircraft_variable("FUELSYSTEM VALVE OPEN", "Percent over 100", 3)?
    .provides_aircraft_variable("GEAR ANIMATION POSITION", "Percent", 0)?
    .provides_aircraft_variable("GEAR ANIMATION POSITION", "Percent", 1)?
    .provides_aircraft_variable("GEAR ANIMATION POSITION", "Percent", 2)?
    .provides_aircraft_variable("GEAR CENTER POSITION", "Percent", 0)?
    .provides_aircraft_variable("GEAR LEFT POSITION", "Percent", 0)?
    .provides_aircraft_variable("GEAR RIGHT POSITION", "Percent", 0)?
    .provides_aircraft_variable("GENERAL ENG STARTER ACTIVE", "Bool", 1)?
    .provides_aircraft_variable("GENERAL ENG STARTER ACTIVE", "Bool", 2)?
    .provides_aircraft_variable("GPS GROUND SPEED", "Knots", 0)?
    .provides_aircraft_variable("GPS GROUND MAGNETIC TRACK", "Degrees", 0)?
    .provides_aircraft_variable("GPS GROUND TRUE TRACK", "Degrees", 0)?
    .provides_aircraft_variable("PLANE ALTITUDE", "Feet", 0)?
    .provides_aircraft_variable("INDICATED ALTITUDE", "Feet", 0)?
    .provides_aircraft_variable("INTERACTIVE POINT OPEN:0", "Percent", 0)?
    .provides_aircraft_variable("INTERACTIVE POINT OPEN", "Percent", 1)?
    .provides_aircraft_variable("INTERACTIVE POINT OPEN", "Percent", 2)?
    .provides_aircraft_variable("INTERACTIVE POINT OPEN", "Percent", 3)?
    .provides_aircraft_variable("KOHLSMAN SETTING MB", "Millibars", 1)?
    .provides_aircraft_variable("LIGHT BEACON", "Bool", 0)?
    .provides_aircraft_variable("LIGHT BEACON ON", "Bool", 0)?
    .provides_aircraft_variable("PLANE ALT ABOVE GROUND", "Feet", 0)?
    .provides_aircraft_variable("PLANE PITCH DEGREES", "Degrees", 0)?
    .provides_aircraft_variable("PLANE BANK DEGREES", "Degrees", 0)?
    .provides_aircraft_variable("PLANE HEADING DEGREES MAGNETIC", "Degrees", 0)?
    .provides_aircraft_variable("PLANE HEADING DEGREES TRUE", "Degrees", 0)?
    .provides_aircraft_variable("PLANE LATITUDE", "degree latitude", 0)?
    .provides_aircraft_variable("PLANE LONGITUDE", "degree longitude", 0)?
    .provides_aircraft_variable("PRESSURE ALTITUDE", "Feet", 0)?
    .provides_aircraft_variable("PUSHBACK STATE", "Enum", 0)?
    .provides_aircraft_variable("PUSHBACK ANGLE", "Radians", 0)?
    .provides_aircraft_variable("SEA LEVEL PRESSURE", "Millibars", 0)?
    .provides_aircraft_variable("SIM ON GROUND", "Bool", 0)?
    .provides_aircraft_variable("TOTAL AIR TEMPERATURE", "celsius", 0)?
    .provides_aircraft_variable("TRAILING EDGE FLAPS LEFT PERCENT", "Percent", 0)?
    .provides_aircraft_variable("TRAILING EDGE FLAPS RIGHT PERCENT", "Percent", 0)?
    .provides_aircraft_variable("TURB ENG CORRECTED N1", "Percent", 1)?
    .provides_aircraft_variable("TURB ENG CORRECTED N1", "Percent", 2)?
    .provides_aircraft_variable("TURB ENG CORRECTED N2", "Percent", 1)?
    .provides_aircraft_variable("TURB ENG CORRECTED N2", "Percent", 2)?
    .provides_aircraft_variable("TURB ENG JET THRUST", "Pounds", 1)?
    .provides_aircraft_variable("TURB ENG JET THRUST", "Pounds", 2)?
    .provides_aircraft_variable("TURB ENG IGNITION SWITCH EX1", "Enum", 1)?
    .provides_aircraft_variable("TURB ENG IGNITION SWITCH EX1", "Enum", 2)?
    // The engine anti-ice valves: automatic continuous ignition (a320_systems engine_failure.rs)
    .provides_aircraft_variable("ENG ANTI ICE", "Bool", 1)?
    .provides_aircraft_variable("ENG ANTI ICE", "Bool", 2)?
    // The MSFS engine speeds and vibration (a320_systems engine_malfunction.rs)
    .provides_aircraft_variable("TURB ENG N1", "Percent", 1)?
    .provides_aircraft_variable("TURB ENG N1", "Percent", 2)?
    .provides_aircraft_variable("TURB ENG N2", "Percent", 1)?
    .provides_aircraft_variable("TURB ENG N2", "Percent", 2)?
    .provides_aircraft_variable("TURB ENG VIBRATION", "Number", 1)?
    .provides_aircraft_variable("TURB ENG VIBRATION", "Number", 2)?
    .provides_aircraft_variable("UNLIMITED FUEL", "Bool", 0)?
    .provides_aircraft_variable("VELOCITY BODY X", "feet per second", 0)?
    .provides_aircraft_variable("VELOCITY BODY Y", "feet per second", 0)?
    .provides_aircraft_variable("VELOCITY BODY Z", "feet per second", 0)?
    .provides_aircraft_variable("VELOCITY WORLD Y", "feet per minute", 0)?
    .provides_aircraft_variable("WHEEL RPM", "RPM", 1)?
    .provides_aircraft_variable("WHEEL RPM", "RPM", 2)?
    .provides_aircraft_variable("INCIDENCE ALPHA", "degree", 0)?
    .provides_aircraft_variable("ROTATION VELOCITY BODY X", "degree per second", 0)?
    .provides_aircraft_variable("ROTATION VELOCITY BODY Y", "degree per second", 0)?
    .provides_aircraft_variable("ROTATION VELOCITY BODY Z", "degree per second", 0)?
    .provides_aircraft_variable("TOTAL WEIGHT", "Pounds", 0)?
    .provides_aircraft_variable("TOTAL WEIGHT YAW MOI", "Slugs feet squared", 0)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 1)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 2)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 3)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 4)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 5)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 6)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 7)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 8)?
    .provides_aircraft_variable("IS SLEW ACTIVE", "Bool", 0)?
    // the ILS receivers of MMR 1 (NAV 3) and MMR 2 (NAV 4)
    .provides_aircraft_variable_range("NAV HAS NAV", "Bool", 3..=4)?
    .provides_aircraft_variable_range("NAV HAS LOCALIZER", "Bool", 3..=4)?
    .provides_aircraft_variable_range("NAV HAS GLIDE SLOPE", "Bool", 3..=4)?
    .provides_aircraft_variable("NAV MAGVAR", "degree", 3)?
    .provides_aircraft_variable_range("NAV RADIAL ERROR", "degree", 3..=4)?
    .provides_aircraft_variable_range("NAV GLIDE SLOPE ERROR", "degree", 3..=4)?
    .provides_aircraft_variable_range("NAV FREQUENCY", "Hz", 3..=4)?
    .provides_named_variable("FSDT_GSX_BOARDING_STATE")?
    .provides_named_variable("FSDT_GSX_DEBOARDING_STATE")?
    .provides_named_variable("FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL")?
    .provides_named_variable("FSDT_GSX_NUMPASSENGERS_DEBOARDING_TOTAL")?
    .provides_named_variable("FSDT_GSX_BOARDING_CARGO_PERCENT")?
    .provides_named_variable("FSDT_GSX_DEBOARDING_CARGO_PERCENT")?
    .provides_named_variable("FSDT_GSX_BYPASS_PIN")?
    .provides_named_variable("SIAI_PUSHBACK_ACTIVE")?
    .provides_aircraft_variable(
        "ROTATION ACCELERATION BODY X",
        "radian per second squared",
        0,
    )?
    .provides_aircraft_variable(
        "ROTATION ACCELERATION BODY Y",
        "radian per second squared",
        0,
    )?
    .provides_aircraft_variable(
        "ROTATION ACCELERATION BODY Z",
        "radian per second squared",
        0,
    )?
    .with_aspect(|builder| {
        builder.copy(
            Variable::aircraft("APU GENERATOR SWITCH", "Bool", 0),
            Variable::aspect("OVHD_ELEC_APU_GEN_PB_IS_ON"),
        );
        builder.copy(
            Variable::named("EXT_PWR_AVAIL:1"),
            Variable::aspect("OVHD_ELEC_EXT_PWR_PB_IS_AVAILABLE"),
        );

        builder.copy(
            Variable::aircraft("GENERAL ENG MASTER ALTERNATOR", "Bool", 1),
            Variable::aspect("OVHD_ELEC_ENG_GEN_1_PB_IS_ON"),
        );
        builder.copy(
            Variable::aircraft("GENERAL ENG MASTER ALTERNATOR", "Bool", 2),
            Variable::aspect("OVHD_ELEC_ENG_GEN_2_PB_IS_ON"),
        );

        builder.map(
            ExecuteOn::PreTick,
            Variable::aircraft("INTERACTIVE POINT OPEN", "Position", 5),
            |value| if value > 0. { 1. } else { 0. },
            Variable::aspect("FWD_DOOR_CARGO_OPEN_REQ"),
        );

        Ok(())
    })?
    .with_aspect(brakes)?
    .with_aspect(autobrakes)?
    .with_aspect(nose_wheel_steering)?
    .with_aspect(flaps)?
    .with_aspect(spoilers)?
    .with_aspect(ailerons)?
    .with_aspect(elevators)?
    .with_aspect(reversers)?
    .with_aspect(rudder)?
    .with_aspect(gear)?
    .with_aspect(payload)?
    .with_aspect(trimmable_horizontal_stabilizer)?
    .build(A320::new)?;

    while let Some(event) = gauge.next_event().await {
        handler.handle(event, &mut simulation, sim_connect.as_mut().get_mut())?;
    }

    Ok(())
}
