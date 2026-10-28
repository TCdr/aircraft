mod ailerons;
mod autobrakes;
mod body_wheel_steering;
mod brakes;
mod cargo_doors;
mod elevators;
mod fire;
mod flaps;
mod fuel;
mod gear;
mod nose_wheel_steering;
mod payload;
mod reversers;
mod rudder;
mod spoilers;
mod trimmable_horizontal_stabilizer;

use a380_systems::A380;
use ailerons::ailerons;
use autobrakes::autobrakes;
use body_wheel_steering::body_wheel_steering;
use brakes::brakes;
use cargo_doors::cargo_doors;
use elevators::elevators;
use fire::fire;
use flaps::flaps;
use fuel::fuel;
use gear::gear;
use nose_wheel_steering::nose_wheel_steering;
use payload::payload;
use reversers::reversers;
use rudder::rudder;
use spoilers::spoilers;
use std::error::Error;
use systems::air_conditioning::{Channel, FdacId, OcsmId, VcmId, ZoneType};
use systems::engine::engine_monitoring_fault::EngineMonitoringFaultKind;
use systems::failures::FailureType;
use systems::integrated_modular_avionics::core_processing_input_output_module::CpiomId;
use systems::shared::{
    report_diagnostic, AirbusElectricPumpId, AirbusEngineDrivenPumpId, ElectricalBusType,
    FireDetectionLoopID, FireDetectionZone, FlightControlSurface, GearActuatorId, HydraulicColor,
    LgciuId, ProximityDetectorId, SmokeDetectionZone,
};

use systems_wasm::{MsfsSimulationBuilder, Variable};
use trimmable_horizontal_stabilizer::trimmable_horizontal_stabilizer;

#[msfs::gauge(name=systems)]
async fn systems(mut gauge: msfs::Gauge) -> Result<(), Box<dyn Error>> {
    // The default panic output is lost when the WASM instance aborts, so print the
    // panic message and location to the MSFS console before the trap happens.
    std::panic::set_hook(Box::new(|panic_info| {
        println!("A380X_SYSTEMS PANIC: {panic_info}");
        report_diagnostic(&format!("A380X_SYSTEMS PANIC: {panic_info}"));
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
        (ElectricalBusType::AlternatingCurrent(3), 4),
        (ElectricalBusType::AlternatingCurrent(4), 5),
        (ElectricalBusType::AlternatingCurrentEssential, 6),
        (ElectricalBusType::AlternatingCurrentEssentialShed, 7),
        (ElectricalBusType::AlternatingCurrentGndFltService, 16),
        (ElectricalBusType::DirectCurrent(1), 8),
        (ElectricalBusType::DirectCurrent(2), 9),
        (ElectricalBusType::DirectCurrentEssential, 10),
        (ElectricalBusType::DirectCurrentNamed("309PP"), 11),
        (ElectricalBusType::DirectCurrentHot(1), 12),
        (ElectricalBusType::DirectCurrentHot(2), 13),
        (ElectricalBusType::DirectCurrentHot(3), 14),
        (ElectricalBusType::DirectCurrentHot(4), 15),
        (ElectricalBusType::DirectCurrentGndFltService, 17),
    ])?
    .with_auxiliary_power_unit(Variable::named("OVHD_APU_START_PB_IS_AVAILABLE"), 8, 21)?
    // The MSFS engine anti-ice follows the engine anti-ice valves, the MSFS structural deice the wing anti-ice valves
    // (a380_systems ice_rain_protection.rs)
    .with_engine_anti_ice_valves(4)?
    .with_wing_anti_ice()?
    .with_fuel_pumps(1..=21)?
    // Fuel valves 60 to 63 of flight_model.cfg feed the engines 1 to 4 in series after their Extra
    // tanks: they are the engine HP fuel valves, and closing one stops the MSFS combustion at once.
    // The HP fuel valve is closed (a380_systems engine_failure.rs) while the ENG MASTER is OFF (the
    // master OFF closes the LP and HP fuel valves) and while the engine fuel is cut: the engine
    // starves (its LP fuel valve is closed and the fuel left downstream of it is burned, see
    // a380_systems fuel/engine_lp_valves.rs), or a flameout or seizure failure until a relight lights
    // it up. The ENG MASTER valves 1 to 4 (the LP valves) are upstream of the Extra tanks, which MSFS
    // does not burn: closing them alone left MSFS burning for 20 to 60 s.
    .with_fuel_valves_closed_while([
        (Variable::named("ENGINE_1_HP_FUEL_VALVE_CLOSED"), 60),
        (Variable::named("ENGINE_2_HP_FUEL_VALVE_CLOSED"), 61),
        (Variable::named("ENGINE_3_HP_FUEL_VALVE_CLOSED"), 62),
        (Variable::named("ENGINE_4_HP_FUEL_VALVE_CLOSED"), 63),
    ])?
    .with_failures([
        (21_000, FailureType::RapidDecompression),
        (21_001, FailureType::CabinFan(1)),
        (21_002, FailureType::CabinFan(2)),
        (21_003, FailureType::CabinFan(3)),
        (21_004, FailureType::CabinFan(4)),
        (21_005, FailureType::HotAir(1)),
        (21_006, FailureType::HotAir(2)),
        (21_007, FailureType::FwdIsolValve),
        (21_008, FailureType::FwdExtractFan),
        (21_009, FailureType::BulkIsolValve),
        (21_010, FailureType::BulkExtractFan),
        (21_011, FailureType::CargoHeater),
        (21_012, FailureType::Fdac(FdacId::One, Channel::ChannelOne)),
        (21_013, FailureType::Fdac(FdacId::One, Channel::ChannelTwo)),
        (21_014, FailureType::Fdac(FdacId::Two, Channel::ChannelOne)),
        (21_015, FailureType::Fdac(FdacId::Two, Channel::ChannelTwo)),
        (21_016, FailureType::Tadd(Channel::ChannelOne)),
        (21_017, FailureType::Tadd(Channel::ChannelTwo)),
        (21_018, FailureType::Vcm(VcmId::Fwd, Channel::ChannelOne)),
        (21_019, FailureType::Vcm(VcmId::Fwd, Channel::ChannelTwo)),
        (21_020, FailureType::Vcm(VcmId::Aft, Channel::ChannelOne)),
        (21_021, FailureType::Vcm(VcmId::Aft, Channel::ChannelTwo)),
        (21_022, FailureType::OcsmAutoPartition(OcsmId::One)),
        (21_023, FailureType::OcsmAutoPartition(OcsmId::Two)),
        (21_024, FailureType::OcsmAutoPartition(OcsmId::Three)),
        (21_025, FailureType::OcsmAutoPartition(OcsmId::Four)),
        (21_026, FailureType::Ocsm(OcsmId::One, Channel::ChannelOne)),
        (21_027, FailureType::Ocsm(OcsmId::One, Channel::ChannelTwo)),
        (21_028, FailureType::Ocsm(OcsmId::Two, Channel::ChannelOne)),
        (21_029, FailureType::Ocsm(OcsmId::Two, Channel::ChannelTwo)),
        (
            21_030,
            FailureType::Ocsm(OcsmId::Three, Channel::ChannelOne),
        ),
        (
            21_031,
            FailureType::Ocsm(OcsmId::Three, Channel::ChannelTwo),
        ),
        (21_032, FailureType::Ocsm(OcsmId::Four, Channel::ChannelOne)),
        (21_033, FailureType::Ocsm(OcsmId::Four, Channel::ChannelTwo)),
        (21_034, FailureType::AgsApp(CpiomId::B1)),
        (21_035, FailureType::AgsApp(CpiomId::B2)),
        (21_036, FailureType::AgsApp(CpiomId::B3)),
        (21_037, FailureType::AgsApp(CpiomId::B4)),
        (21_038, FailureType::TcsApp(CpiomId::B1)),
        (21_039, FailureType::TcsApp(CpiomId::B2)),
        (21_040, FailureType::TcsApp(CpiomId::B3)),
        (21_041, FailureType::TcsApp(CpiomId::B4)),
        (21_042, FailureType::VcsApp(CpiomId::B1)),
        (21_043, FailureType::VcsApp(CpiomId::B2)),
        (21_044, FailureType::VcsApp(CpiomId::B3)),
        (21_045, FailureType::VcsApp(CpiomId::B4)),
        (21_046, FailureType::CpcsApp(CpiomId::B1)),
        (21_047, FailureType::CpcsApp(CpiomId::B2)),
        (21_048, FailureType::CpcsApp(CpiomId::B3)),
        (21_049, FailureType::CpcsApp(CpiomId::B4)),
        // Trim air: one zone per case of the COND DUCT OVHT procedure (CKPT, CABIN on each deck, FWD
        // CARGO) and the COND FWD CARGO TEMP REGUL FAULT cargo trim air valve. The bulk cargo is left
        // out: its duct temperature comes from the bulk heater, not from its trim air valve.
        // TrimAirHighPressure is not mapped: no A380 system reads the trim air outlet pressure.
        (21_050, FailureType::TrimAirFault(ZoneType::Cockpit)),
        (21_051, FailureType::TrimAirFault(ZoneType::Cabin(11))), // MAIN_DECK_1
        (21_052, FailureType::TrimAirFault(ZoneType::Cabin(21))), // UPPER_DECK_1
        (21_053, FailureType::TrimAirFault(ZoneType::Cargo(1))),  // CARGO_FWD
        (21_054, FailureType::TrimAirOverheat(ZoneType::Cockpit)),
        (21_055, FailureType::TrimAirOverheat(ZoneType::Cabin(11))), // MAIN_DECK_1
        (21_056, FailureType::TrimAirOverheat(ZoneType::Cabin(21))), // UPPER_DECK_1
        (21_057, FailureType::TrimAirOverheat(ZoneType::Cargo(1))),  // CARGO_FWD
        // Pack flow valves 1 and 2 are on pack 1, valves 3 and 4 on pack 2
        (21_058, FailureType::PackFlowValveJammed(1)),
        (21_059, FailureType::PackFlowValveJammed(2)),
        (21_060, FailureType::PackFlowValveJammed(3)),
        (21_061, FailureType::PackFlowValveJammed(4)),
        (21_062, FailureType::PackOverheat(1)),
        (21_063, FailureType::PackOverheat(2)),
        (21_064, FailureType::PackRegulation(1)),
        (21_065, FailureType::PackRegulation(2)),
        (21_066, FailureType::BulkCargoDuctOverheat),
        (21_067, FailureType::CabinAirExtractValve),
        (21_068, FailureType::CabinPressureManualControl),
        (24_000, FailureType::TransformerRectifier(1)),
        (24_001, FailureType::TransformerRectifier(2)),
        (24_002, FailureType::TransformerRectifier(3)),
        (24_003, FailureType::TransformerRectifier(4)),
        (24_004, FailureType::StaticInverter),
        (24_020, FailureType::Generator(1)),
        (24_021, FailureType::Generator(2)),
        (24_022, FailureType::Generator(3)),
        (24_023, FailureType::Generator(4)),
        (24_030, FailureType::ApuGenerator(1)),
        (24_031, FailureType::ApuGenerator(2)),
        (24_040, FailureType::Battery(1)),
        (24_041, FailureType::Battery(2)),
        (24_042, FailureType::Battery(3)), // BAT ESS
        (24_043, FailureType::Battery(4)), // APU BAT
        (24_050, FailureType::ExternalPower(1)),
        (24_051, FailureType::ExternalPower(2)),
        (24_052, FailureType::ExternalPower(3)),
        (24_053, FailureType::ExternalPower(4)),
        (24_060, FailureType::EmergencyGenerator), // RAT generator
        (24_080, FailureType::GeneratorDriveDisconnect(1)),
        (24_081, FailureType::GeneratorDriveDisconnect(2)),
        (24_082, FailureType::GeneratorDriveDisconnect(3)),
        (24_083, FailureType::GeneratorDriveDisconnect(4)),
        (24_084, FailureType::IntegratedDriveGeneratorOilLeak(1)),
        (24_085, FailureType::IntegratedDriveGeneratorOilLeak(2)),
        (24_086, FailureType::IntegratedDriveGeneratorOilLeak(3)),
        (24_087, FailureType::IntegratedDriveGeneratorOilLeak(4)),
        (24_088, FailureType::IntegratedDriveGeneratorOilOverheat(1)),
        (24_089, FailureType::IntegratedDriveGeneratorOilOverheat(2)),
        (24_090, FailureType::IntegratedDriveGeneratorOilOverheat(3)),
        (24_091, FailureType::IntegratedDriveGeneratorOilOverheat(4)),
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
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrent(3)),
        ),
        (
            24_103,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrent(4)),
        ),
        (
            24_104,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrentEssential),
        ),
        (
            24_105,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrentEssentialShed),
        ),
        (
            24_106,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrentNamed("247XP")),
        ),
        (
            24_107,
            FailureType::ElectricalBus(ElectricalBusType::AlternatingCurrentGndFltService),
        ),
        (
            24_108,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrent(1)),
        ),
        (
            24_109,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrent(2)),
        ),
        (
            24_110,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentEssential),
        ),
        (
            24_111,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentNamed("247PP")),
        ),
        (
            24_112,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentNamed("309PP")),
        ),
        (
            24_113,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentHot(1)),
        ),
        (
            24_114,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentHot(2)),
        ),
        (
            24_115,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentHot(3)),
        ),
        (
            24_116,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentHot(4)),
        ),
        (
            24_117,
            FailureType::ElectricalBus(ElectricalBusType::DirectCurrentGndFltService),
        ),
        (24_200, FailureType::ElectricalPrimarySupplyCentre(1)),
        (24_201, FailureType::ElectricalPrimarySupplyCentre(2)),
        (24_202, FailureType::ElectricalNetworkManagementUnit(1)),
        (24_203, FailureType::ElectricalNetworkManagementUnit(2)),
        (24_204, FailureType::ElectricalLoadManagementUnit),
        (26_001, FailureType::SetOnFire(FireDetectionZone::Engine(1))),
        (26_002, FailureType::SetOnFire(FireDetectionZone::Engine(2))),
        (26_003, FailureType::SetOnFire(FireDetectionZone::Engine(3))),
        (26_004, FailureType::SetOnFire(FireDetectionZone::Engine(4))),
        (26_005, FailureType::SetOnFire(FireDetectionZone::Apu)),
        (26_006, FailureType::SetOnFire(FireDetectionZone::Mlg)),
        (
            26_007,
            FailureType::FireDetectionLoop(FireDetectionLoopID::A, FireDetectionZone::Engine(1)),
        ),
        (
            26_008,
            FailureType::FireDetectionLoop(FireDetectionLoopID::B, FireDetectionZone::Engine(1)),
        ),
        (
            26_009,
            FailureType::FireDetectionLoop(FireDetectionLoopID::A, FireDetectionZone::Engine(2)),
        ),
        (
            26_010,
            FailureType::FireDetectionLoop(FireDetectionLoopID::B, FireDetectionZone::Engine(2)),
        ),
        (
            26_011,
            FailureType::FireDetectionLoop(FireDetectionLoopID::A, FireDetectionZone::Engine(3)),
        ),
        (
            26_012,
            FailureType::FireDetectionLoop(FireDetectionLoopID::B, FireDetectionZone::Engine(3)),
        ),
        (
            26_013,
            FailureType::FireDetectionLoop(FireDetectionLoopID::A, FireDetectionZone::Engine(4)),
        ),
        (
            26_014,
            FailureType::FireDetectionLoop(FireDetectionLoopID::B, FireDetectionZone::Engine(4)),
        ),
        (
            26_015,
            FailureType::FireDetectionLoop(FireDetectionLoopID::A, FireDetectionZone::Apu),
        ),
        (
            26_016,
            FailureType::FireDetectionLoop(FireDetectionLoopID::B, FireDetectionZone::Apu),
        ),
        (
            26_017,
            FailureType::FireDetectionLoop(FireDetectionLoopID::A, FireDetectionZone::Mlg),
        ),
        (
            26_018,
            FailureType::FireDetectionLoop(FireDetectionLoopID::B, FireDetectionZone::Mlg),
        ),
        // SFCC flap and slat channels (hydraulic::sfcc): F/CTL FLAP(SLAT) SYS 1(2) FAULT
        (27_010, FailureType::SlatFlapControlComputerFlapChannel(1)),
        (27_011, FailureType::SlatFlapControlComputerFlapChannel(2)),
        (27_012, FailureType::SlatFlapControlComputerSlatChannel(1)),
        (27_013, FailureType::SlatFlapControlComputerSlatChannel(2)),
        // SFCC control units, FLAPS lever and wing tip brakes (hydraulic::sfcc): F/CTL FLAP(SLAT) CTL 1(2) FAULT,
        // FLAPS LEVER SYS 1(2) FAULT, FLAPS LEVER OUT OF DETENT, FLAPS (SLATS) LOCKED
        (
            27_200,
            FailureType::SlatFlapControlComputerFlapControlUnit(1),
        ),
        (
            27_201,
            FailureType::SlatFlapControlComputerFlapControlUnit(2),
        ),
        (
            27_202,
            FailureType::SlatFlapControlComputerSlatControlUnit(1),
        ),
        (
            27_203,
            FailureType::SlatFlapControlComputerSlatControlUnit(2),
        ),
        (27_204, FailureType::FlapsLeverLink(1)),
        (27_205, FailureType::FlapsLeverLink(2)),
        (27_206, FailureType::FlapsLeverOutOfDetent),
        (27_207, FailureType::FlapTransmissionAsymmetry),
        (27_208, FailureType::SlatTransmissionAsymmetry),
        (26_019, FailureType::Smoke(SmokeDetectionZone::ForwardCargo)),
        (26_020, FailureType::Smoke(SmokeDetectionZone::AftCargo)),
        (26_021, FailureType::Smoke(SmokeDetectionZone::BulkCargo)),
        (
            26_022,
            FailureType::Smoke(SmokeDetectionZone::LeftMainAvionics),
        ),
        (
            26_023,
            FailureType::Smoke(SmokeDetectionZone::RightMainAvionics),
        ),
        (
            26_024,
            FailureType::Smoke(SmokeDetectionZone::LeftUpperAvionics),
        ),
        (
            26_025,
            FailureType::Smoke(SmokeDetectionZone::RightUpperAvionics),
        ),
        (26_026, FailureType::Smoke(SmokeDetectionZone::AftAvionics)),
        (
            26_027,
            FailureType::Smoke(SmokeDetectionZone::InFlightEntertainmentBay),
        ),
        (
            26_028,
            FailureType::SmokeDetector(SmokeDetectionZone::ForwardCargo, 1),
        ),
        (
            26_029,
            FailureType::SmokeDetector(SmokeDetectionZone::ForwardCargo, 2),
        ),
        (
            26_030,
            FailureType::SmokeDetector(SmokeDetectionZone::AftCargo, 1),
        ),
        (
            26_031,
            FailureType::SmokeDetector(SmokeDetectionZone::AftCargo, 2),
        ),
        (
            26_032,
            FailureType::SmokeDetector(SmokeDetectionZone::BulkCargo, 1),
        ),
        (
            26_033,
            FailureType::SmokeDetector(SmokeDetectionZone::BulkCargo, 2),
        ),
        (
            26_034,
            FailureType::SmokeDetector(SmokeDetectionZone::LeftMainAvionics, 1),
        ),
        (
            26_035,
            FailureType::SmokeDetector(SmokeDetectionZone::LeftMainAvionics, 2),
        ),
        (
            26_036,
            FailureType::SmokeDetector(SmokeDetectionZone::RightMainAvionics, 1),
        ),
        (
            26_037,
            FailureType::SmokeDetector(SmokeDetectionZone::RightMainAvionics, 2),
        ),
        (
            26_038,
            FailureType::SmokeDetector(SmokeDetectionZone::LeftUpperAvionics, 1),
        ),
        (
            26_039,
            FailureType::SmokeDetector(SmokeDetectionZone::LeftUpperAvionics, 2),
        ),
        (
            26_040,
            FailureType::SmokeDetector(SmokeDetectionZone::RightUpperAvionics, 1),
        ),
        (
            26_041,
            FailureType::SmokeDetector(SmokeDetectionZone::RightUpperAvionics, 2),
        ),
        (
            26_042,
            FailureType::SmokeDetector(SmokeDetectionZone::AftAvionics, 1),
        ),
        (
            26_043,
            FailureType::SmokeDetector(SmokeDetectionZone::AftAvionics, 2),
        ),
        (
            26_044,
            FailureType::SmokeDetector(SmokeDetectionZone::InFlightEntertainmentBay, 1),
        ),
        (
            26_045,
            FailureType::SmokeDetector(SmokeDetectionZone::InFlightEntertainmentBay, 2),
        ),
        (26_046, FailureType::CargoFireBottleLowPressure(1)),
        (26_047, FailureType::CargoFireBottleLowPressure(2)),
        (26_048, FailureType::SmokeDetectionFunction),
        (
            26_049,
            FailureType::Smoke(SmokeDetectionZone::NetworkServerSystem),
        ),
        (
            26_050,
            FailureType::SmokeDetector(SmokeDetectionZone::NetworkServerSystem, 1),
        ),
        (
            26_051,
            FailureType::SmokeDetector(SmokeDetectionZone::NetworkServerSystem, 2),
        ),
        // Primary flight control actuators (hydraulic::flight_control_actuator_failures): actuator 1 and 2 of each surface
        (
            27_100,
            FailureType::FlightControlActuator(FlightControlSurface::LeftOuterAileron, 1),
        ),
        (
            27_101,
            FailureType::FlightControlActuator(FlightControlSurface::LeftOuterAileron, 2),
        ),
        (
            27_102,
            FailureType::FlightControlActuator(FlightControlSurface::LeftMidAileron, 1),
        ),
        (
            27_103,
            FailureType::FlightControlActuator(FlightControlSurface::LeftMidAileron, 2),
        ),
        (
            27_104,
            FailureType::FlightControlActuator(FlightControlSurface::LeftInnerAileron, 1),
        ),
        (
            27_105,
            FailureType::FlightControlActuator(FlightControlSurface::LeftInnerAileron, 2),
        ),
        (
            27_106,
            FailureType::FlightControlActuator(FlightControlSurface::RightInnerAileron, 1),
        ),
        (
            27_107,
            FailureType::FlightControlActuator(FlightControlSurface::RightInnerAileron, 2),
        ),
        (
            27_108,
            FailureType::FlightControlActuator(FlightControlSurface::RightMidAileron, 1),
        ),
        (
            27_109,
            FailureType::FlightControlActuator(FlightControlSurface::RightMidAileron, 2),
        ),
        (
            27_110,
            FailureType::FlightControlActuator(FlightControlSurface::RightOuterAileron, 1),
        ),
        (
            27_111,
            FailureType::FlightControlActuator(FlightControlSurface::RightOuterAileron, 2),
        ),
        (
            27_112,
            FailureType::FlightControlActuator(FlightControlSurface::LeftOuterElevator, 1),
        ),
        (
            27_113,
            FailureType::FlightControlActuator(FlightControlSurface::LeftOuterElevator, 2),
        ),
        (
            27_114,
            FailureType::FlightControlActuator(FlightControlSurface::LeftInnerElevator, 1),
        ),
        (
            27_115,
            FailureType::FlightControlActuator(FlightControlSurface::LeftInnerElevator, 2),
        ),
        (
            27_116,
            FailureType::FlightControlActuator(FlightControlSurface::RightInnerElevator, 1),
        ),
        (
            27_117,
            FailureType::FlightControlActuator(FlightControlSurface::RightInnerElevator, 2),
        ),
        (
            27_118,
            FailureType::FlightControlActuator(FlightControlSurface::RightOuterElevator, 1),
        ),
        (
            27_119,
            FailureType::FlightControlActuator(FlightControlSurface::RightOuterElevator, 2),
        ),
        (
            27_120,
            FailureType::FlightControlActuator(FlightControlSurface::UpperRudder, 1),
        ),
        (
            27_121,
            FailureType::FlightControlActuator(FlightControlSurface::UpperRudder, 2),
        ),
        (
            27_122,
            FailureType::FlightControlActuator(FlightControlSurface::LowerRudder, 1),
        ),
        (
            27_123,
            FailureType::FlightControlActuator(FlightControlSurface::LowerRudder, 2),
        ),
        (
            27_124,
            FailureType::FlightControlActuatorElectricalPart(FlightControlSurface::UpperRudder, 1),
        ),
        (
            27_125,
            FailureType::FlightControlActuatorElectricalPart(FlightControlSurface::UpperRudder, 2),
        ),
        (
            27_126,
            FailureType::FlightControlActuatorElectricalPart(FlightControlSurface::LowerRudder, 1),
        ),
        (
            27_127,
            FailureType::FlightControlActuatorElectricalPart(FlightControlSurface::LowerRudder, 2),
        ),
        (
            27_128,
            FailureType::FlightControlActuator(FlightControlSurface::Stabilizer, 1),
        ),
        (
            27_129,
            FailureType::FlightControlActuator(FlightControlSurface::Stabilizer, 2),
        ),
        (27_130, FailureType::StabilizerJammed),
        (
            26_052,
            FailureType::Smoke(SmokeDetectionZone::MainDeckLavatory),
        ),
        (
            26_053,
            FailureType::SmokeDetector(SmokeDetectionZone::MainDeckLavatory, 1),
        ),
        (
            26_054,
            FailureType::Smoke(SmokeDetectionZone::UpperDeckLavatory),
        ),
        (
            26_055,
            FailureType::SmokeDetector(SmokeDetectionZone::UpperDeckLavatory, 1),
        ),
        (
            26_056,
            FailureType::Smoke(SmokeDetectionZone::LowerDeckLavatory),
        ),
        (
            26_057,
            FailureType::SmokeDetector(SmokeDetectionZone::LowerDeckLavatory, 1),
        ),
        (
            26_058,
            FailureType::Smoke(SmokeDetectionZone::FlightCrewRest1),
        ),
        (
            26_059,
            FailureType::SmokeDetector(SmokeDetectionZone::FlightCrewRest1, 1),
        ),
        (
            26_060,
            FailureType::SmokeDetector(SmokeDetectionZone::FlightCrewRest1, 2),
        ),
        (
            26_061,
            FailureType::Smoke(SmokeDetectionZone::FlightCrewRest2),
        ),
        (
            26_062,
            FailureType::SmokeDetector(SmokeDetectionZone::FlightCrewRest2, 1),
        ),
        (
            26_063,
            FailureType::SmokeDetector(SmokeDetectionZone::FlightCrewRest2, 2),
        ),
        (
            26_064,
            FailureType::Smoke(SmokeDetectionZone::AftLowerDeckCabinCrewRest),
        ),
        (
            26_065,
            FailureType::SmokeDetector(SmokeDetectionZone::AftLowerDeckCabinCrewRest, 1),
        ),
        (
            26_066,
            FailureType::SmokeDetector(SmokeDetectionZone::AftLowerDeckCabinCrewRest, 2),
        ),
        (26_067, FailureType::CrewRestFireBottle(1)),
        (26_068, FailureType::CrewRestFireBottle(2)),
        (
            26_069,
            FailureType::Smoke(SmokeDetectionZone::MainDeck1LCabinWorkStation),
        ),
        (
            26_070,
            FailureType::SmokeDetector(SmokeDetectionZone::MainDeck1LCabinWorkStation, 1),
        ),
        (
            26_071,
            FailureType::SmokeDetector(SmokeDetectionZone::MainDeck1LCabinWorkStation, 2),
        ),
        (
            26_072,
            FailureType::Smoke(SmokeDetectionZone::UpperDeck1LCabinWorkStation),
        ),
        (
            26_073,
            FailureType::SmokeDetector(SmokeDetectionZone::UpperDeck1LCabinWorkStation, 1),
        ),
        (
            26_074,
            FailureType::SmokeDetector(SmokeDetectionZone::UpperDeck1LCabinWorkStation, 2),
        ),
        (
            26_075,
            FailureType::Smoke(SmokeDetectionZone::UpperDeck3RRemoteControlCenter),
        ),
        (
            26_076,
            FailureType::SmokeDetector(SmokeDetectionZone::UpperDeck3RRemoteControlCenter, 1),
        ),
        (
            26_077,
            FailureType::SmokeDetector(SmokeDetectionZone::UpperDeck3RRemoteControlCenter, 2),
        ),
        (26_078, FailureType::CargoFireDiverterValvePosition(1)),
        (26_079, FailureType::CargoFireDiverterValvePosition(2)),
        (26_080, FailureType::CargoFireBottleControl),
        (26_081, FailureType::SmokeDetectionFacilities),
        (26_082, FailureType::SmokeDetectionSafetyTestOverdue),
        (29_000, FailureType::ReservoirLeak(HydraulicColor::Green)),
        (29_001, FailureType::ReservoirLeak(HydraulicColor::Yellow)),
        (29_002, FailureType::ReservoirAirLeak(HydraulicColor::Green)),
        (
            29_003,
            FailureType::ReservoirAirLeak(HydraulicColor::Yellow),
        ),
        (
            29_004,
            FailureType::ReservoirReturnLeak(HydraulicColor::Green),
        ),
        (
            29_005,
            FailureType::ReservoirReturnLeak(HydraulicColor::Yellow),
        ),
        (
            29_006,
            FailureType::ElecPumpOverheat(AirbusElectricPumpId::GreenA),
        ),
        (
            29_007,
            FailureType::ElecPumpOverheat(AirbusElectricPumpId::GreenB),
        ),
        (
            29_008,
            FailureType::ElecPumpOverheat(AirbusElectricPumpId::YellowA),
        ),
        (
            29_009,
            FailureType::ElecPumpOverheat(AirbusElectricPumpId::YellowB),
        ),
        (
            29_010,
            FailureType::EnginePumpOverheat(AirbusEngineDrivenPumpId::Edp1a),
        ),
        (
            29_011,
            FailureType::EnginePumpOverheat(AirbusEngineDrivenPumpId::Edp1b),
        ),
        (
            29_012,
            FailureType::EnginePumpOverheat(AirbusEngineDrivenPumpId::Edp2a),
        ),
        (
            29_013,
            FailureType::EnginePumpOverheat(AirbusEngineDrivenPumpId::Edp2b),
        ),
        (
            29_014,
            FailureType::EnginePumpOverheat(AirbusEngineDrivenPumpId::Edp3a),
        ),
        (
            29_015,
            FailureType::EnginePumpOverheat(AirbusEngineDrivenPumpId::Edp3b),
        ),
        (
            29_016,
            FailureType::EnginePumpOverheat(AirbusEngineDrivenPumpId::Edp4a),
        ),
        (
            29_017,
            FailureType::EnginePumpOverheat(AirbusEngineDrivenPumpId::Edp4b),
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
        // L/G and steering monitoring (a380_systems hydraulic/gear_steering_monitoring.rs and the
        // SCS of brake_steer_faults.rs)
        (32_030, FailureType::GearUplockClosed(1)),
        (32_031, FailureType::GearUplockClosed(2)),
        (32_032, FailureType::GearUplockClosed(3)),
        (32_033, FailureType::GearBogiePosition),
        (32_034, FailureType::GearGravityExtension),
        (32_210, FailureType::BodyWheelSteeringLock(1)),
        (32_211, FailureType::BodyWheelSteeringLock(2)),
        (32_212, FailureType::PedalSteeringControl),
        // Brakes: the model feeds the NORM circuit from the GREEN system and the ALTN circuit (with
        // its accumulator) from the YELLOW system. On the real aircraft the ALTN brakes use the LEHGS
        // and accumulators.
        (
            32_100,
            FailureType::BrakeHydraulicLeak(HydraulicColor::Green),
        ),
        (
            32_101,
            FailureType::BrakeHydraulicLeak(HydraulicColor::Yellow),
        ),
        (32_150, FailureType::BrakeAccumulatorGasLeak),
        // Braking and steering control faults (hydraulic/brake_steer_faults.rs)
        (32_110, FailureType::BrakeNormalBraking),
        (32_111, FailureType::BrakeAlternateBraking),
        (32_112, FailureType::BrakeEmergencyBraking),
        (32_113, FailureType::Autobrake),
        // Gear group and brake pair faults of the BCS (hydraulic/brake_anti_skid_faults.rs)
        (32_120, FailureType::BrakingControlSystem(1)),
        (32_121, FailureType::BrakingControlSystem(2)),
        (
            32_122,
            FailureType::BrakeRemoteDataConcentratorChannel(1, 1),
        ),
        (
            32_123,
            FailureType::BrakeRemoteDataConcentratorChannel(1, 2),
        ),
        (
            32_124,
            FailureType::BrakeRemoteDataConcentratorChannel(2, 1),
        ),
        (
            32_125,
            FailureType::BrakeRemoteDataConcentratorChannel(2, 2),
        ),
        (
            32_126,
            FailureType::BrakeRemoteDataConcentratorChannel(3, 1),
        ),
        (
            32_127,
            FailureType::BrakeRemoteDataConcentratorChannel(3, 2),
        ),
        (32_160, FailureType::BrakePairTachometer(1)),
        (32_161, FailureType::BrakePairTachometer(2)),
        (32_162, FailureType::BrakePairTachometer(3)),
        (32_163, FailureType::BrakePairTachometer(4)),
        (32_164, FailureType::BrakePairTachometer(5)),
        (32_165, FailureType::BrakePairTachometer(6)),
        (32_166, FailureType::BrakePairTachometer(7)),
        (32_167, FailureType::BrakePairTachometer(8)),
        (32_170, FailureType::BrakePairServoValveLeak(1)),
        (32_171, FailureType::BrakePairServoValveLeak(2)),
        (32_172, FailureType::BrakePairServoValveLeak(3)),
        (32_173, FailureType::BrakePairServoValveLeak(4)),
        (32_174, FailureType::BrakePairServoValveLeak(5)),
        (32_175, FailureType::BrakePairServoValveLeak(6)),
        (32_176, FailureType::BrakePairServoValveLeak(7)),
        (32_177, FailureType::BrakePairServoValveLeak(8)),
        (32_200, FailureType::NoseWheelSteeringNormal),
        (32_201, FailureType::NoseWheelSteeringAlternate),
        (32_202, FailureType::BodyWheelSteering),
        (32_203, FailureType::SteeringControlSystem(1)),
        (32_204, FailureType::SteeringControlSystem(2)),
        // ATA 30 wing and engine anti-ice valves (a380_systems ice_rain_protection.rs)
        (30_000, FailureType::WingAntiIceValvesStuckClosed(1)),
        (30_001, FailureType::WingAntiIceValvesStuckClosed(2)),
        (30_010, FailureType::WingAntiIceOuterValveStuckOpen(1)),
        (30_011, FailureType::WingAntiIceOuterValveStuckOpen(2)),
        (30_100, FailureType::EngineAntiIceValveStuckClosed(1)),
        (30_101, FailureType::EngineAntiIceValveStuckClosed(2)),
        (30_102, FailureType::EngineAntiIceValveStuckClosed(3)),
        (30_103, FailureType::EngineAntiIceValveStuckClosed(4)),
        (30_110, FailureType::EngineAntiIceValveStuckOpen(1)),
        (30_111, FailureType::EngineAntiIceValveStuckOpen(2)),
        (30_112, FailureType::EngineAntiIceValveStuckOpen(3)),
        (30_113, FailureType::EngineAntiIceValveStuckOpen(4)),
        (30_120, FailureType::EngineAntiIceValveMonitoring(1)),
        (30_121, FailureType::EngineAntiIceValveMonitoring(2)),
        (30_122, FailureType::EngineAntiIceValveMonitoring(3)),
        (30_123, FailureType::EngineAntiIceValveMonitoring(4)),
        (30_200, FailureType::AntiIceControlUnitChannel(1, 1)),
        (30_201, FailureType::AntiIceControlUnitChannel(1, 2)),
        (30_202, FailureType::AntiIceControlUnitChannel(2, 1)),
        (30_203, FailureType::AntiIceControlUnitChannel(2, 2)),
        (30_210, FailureType::IceDetector(1)),
        (30_211, FailureType::IceDetector(2)),
        (30_300, FailureType::ProbeHeatComputer(1)),
        (30_301, FailureType::ProbeHeatComputer(2)),
        (30_302, FailureType::ProbeHeatComputer(3)),
        (30_310, FailureType::ProbeHeater(1, 1)),
        (30_311, FailureType::ProbeHeater(2, 1)),
        (30_312, FailureType::ProbeHeater(3, 1)),
        (30_320, FailureType::ProbeHeater(1, 2)),
        (30_321, FailureType::ProbeHeater(2, 2)),
        (30_322, FailureType::ProbeHeater(3, 2)),
        (30_330, FailureType::ProbeHeater(1, 3)),
        (30_331, FailureType::ProbeHeater(2, 3)),
        (30_332, FailureType::ProbeHeater(3, 3)),
        (30_340, FailureType::ProbeHeater(1, 6)),
        (30_341, FailureType::ProbeHeater(2, 6)),
        (30_342, FailureType::ProbeHeater(3, 6)),
        (30_350, FailureType::ProbeHeater(4, 1)),
        (30_351, FailureType::ProbeHeater(4, 2)),
        (30_400, FailureType::WindshieldHeat(1)),
        (30_401, FailureType::WindshieldHeat(2)),
        (30_410, FailureType::WindowHeat(1)),
        (30_411, FailureType::WindowHeat(2)),
        (30_420, FailureType::WindowHeat(3)),
        (30_421, FailureType::WindowHeat(4)),
        (30_500, FailureType::DrainMastHeat),
        // ATA 35 oxygen bottles and cabin valves (a380_systems oxygen.rs)
        (35_000, FailureType::CockpitOxygenBottleLeak),
        (35_001, FailureType::CabinOxygenBottleLeak),
        (35_010, FailureType::CabinOxygenValveStuckClosed),
        (34_000, FailureType::RadioAltimeter(1)),
        (34_001, FailureType::RadioAltimeter(2)),
        (34_002, FailureType::RadioAltimeter(3)),
        (34_010, FailureType::RadioAntennaInterrupted(1)),
        (34_011, FailureType::RadioAntennaInterrupted(2)),
        (34_012, FailureType::RadioAntennaInterrupted(3)),
        (34_020, FailureType::RadioAntennaDirectCoupling(1)),
        (34_021, FailureType::RadioAntennaDirectCoupling(2)),
        (34_022, FailureType::RadioAntennaDirectCoupling(3)),
        (34_040, FailureType::Gps(1)),
        (34_041, FailureType::Gps(2)),
        (34_050, FailureType::AdrAirspeedErroneous(1)),
        (34_051, FailureType::AdrAirspeedErroneous(2)),
        (34_052, FailureType::AdrAirspeedErroneous(3)),
        (34_060, FailureType::AdrAngleOfAttackErroneous(1)),
        (34_061, FailureType::AdrAngleOfAttackErroneous(2)),
        (34_062, FailureType::AdrAngleOfAttackErroneous(3)),
        // ATA 36 (a380_systems pneumatic.rs): wing zone n is the wing section of engine n
        (36_000, FailureType::EngineBleedValveStuckClosed(1)),
        (36_001, FailureType::EngineBleedValveStuckClosed(2)),
        (36_002, FailureType::EngineBleedValveStuckClosed(3)),
        (36_003, FailureType::EngineBleedValveStuckClosed(4)),
        // The APU bleed valve (a380_systems apu_bleed_air_valve.rs, AIR APU BLEED FAULT)
        (36_060, FailureType::ApuBleedValveStuckClosed),
        (36_061, FailureType::ApuBleedValveStuckOpen),
        (36_010, FailureType::EngineBleedValveStuckOpen(1)),
        (36_011, FailureType::EngineBleedValveStuckOpen(2)),
        (36_012, FailureType::EngineBleedValveStuckOpen(3)),
        (36_013, FailureType::EngineBleedValveStuckOpen(4)),
        (36_070, FailureType::EngineBleedLeak(1)),
        (36_071, FailureType::EngineBleedLeak(2)),
        (36_072, FailureType::EngineBleedLeak(3)),
        (36_073, FailureType::EngineBleedLeak(4)),
        (36_074, FailureType::WingBleedLeak(1)),
        (36_075, FailureType::WingBleedLeak(2)),
        (36_076, FailureType::WingBleedLeak(3)),
        (36_077, FailureType::WingBleedLeak(4)),
        // The leaks of the APU duct, the pack bays, the hot-air ducts and the forward cargo duct
        (36_080, FailureType::ApuBleedLeak),
        (36_081, FailureType::PackBayLeak(1)),
        (36_082, FailureType::PackBayLeak(2)),
        (36_083, FailureType::HotAirDuctLeak(1)),
        (36_084, FailureType::HotAirDuctLeak(2)),
        (36_085, FailureType::FwdCargoBleedDuctLeak),
        // The HP valves, the fan air valves and the crossbleed valves (1 left, 2 center, 3 right)
        (36_020, FailureType::EngineHpValveStuckClosed(1)),
        (36_021, FailureType::EngineHpValveStuckClosed(2)),
        (36_022, FailureType::EngineHpValveStuckClosed(3)),
        (36_023, FailureType::EngineHpValveStuckClosed(4)),
        (36_040, FailureType::EngineFanAirValveStuckOpen(1)),
        (36_041, FailureType::EngineFanAirValveStuckOpen(2)),
        (36_042, FailureType::EngineFanAirValveStuckOpen(3)),
        (36_043, FailureType::EngineFanAirValveStuckOpen(4)),
        (36_050, FailureType::CrossBleedValveNumberStuckClosed(1)),
        (36_051, FailureType::CrossBleedValveNumberStuckClosed(2)),
        (36_052, FailureType::CrossBleedValveNumberStuckClosed(3)),
        (36_055, FailureType::CrossBleedValveNumberStuckOpen(1)),
        (36_056, FailureType::CrossBleedValveNumberStuckOpen(2)),
        (36_057, FailureType::CrossBleedValveNumberStuckOpen(3)),
        // The bleed leak detection: the dual loop of each duct zone, and the two detection systems
        (36_090, FailureType::EngineLeakDetectionDualLoop(1)),
        (36_091, FailureType::EngineLeakDetectionDualLoop(2)),
        (36_092, FailureType::EngineLeakDetectionDualLoop(3)),
        (36_093, FailureType::EngineLeakDetectionDualLoop(4)),
        (36_094, FailureType::WingLeakDetectionDualLoop(1)),
        (36_095, FailureType::WingLeakDetectionDualLoop(2)),
        (36_096, FailureType::WingLeakDetectionDualLoop(3)),
        (36_097, FailureType::WingLeakDetectionDualLoop(4)),
        (36_100, FailureType::ApuLeakDetectionDualLoop),
        (36_101, FailureType::PackBayLeakDetectionDualLoop(1)),
        (36_102, FailureType::PackBayLeakDetectionDualLoop(2)),
        (36_103, FailureType::HotAirLeakDetectionDualLoop(1)),
        (36_104, FailureType::HotAirLeakDetectionDualLoop(2)),
        (36_105, FailureType::FwdCargoLeakDetectionDualLoop),
        (36_106, FailureType::AftCargoLeakDetectionDualLoop),
        (36_110, FailureType::BleedLeakDetectionSystem(1)),
        (36_111, FailureType::BleedLeakDetectionSystem(2)),
        (34_070, FailureType::AdrFault(1)),
        (34_071, FailureType::AdrFault(2)),
        (34_072, FailureType::AdrFault(3)),
        (34_080, FailureType::IrFault(1)),
        (34_081, FailureType::IrFault(2)),
        (34_082, FailureType::IrFault(3)),
        // MMR n as a whole (its ILS and GPS receivers), and its ILS receiver alone (navigation::ils, gnss)
        (34_100, FailureType::MultiModeReceiver(1)),
        (34_101, FailureType::MultiModeReceiver(2)),
        (34_102, FailureType::IlsReceiver(1)),
        (34_103, FailureType::IlsReceiver(2)),
        // Avionics network (systems::integrated_modular_avionics): AFDX switches by their number,
        // IOMs A1-A8 as 42_101-42_108, CPIOMs as 42_2xy (x = letter A..G as 0..6, y = number), the cables between the
        // switches as 42_301-42_330
        (42_001, FailureType::AvionicsFullDuplexSwitch(1)),
        (42_002, FailureType::AvionicsFullDuplexSwitch(2)),
        (42_003, FailureType::AvionicsFullDuplexSwitch(3)),
        (42_004, FailureType::AvionicsFullDuplexSwitch(4)),
        (42_005, FailureType::AvionicsFullDuplexSwitch(5)),
        (42_006, FailureType::AvionicsFullDuplexSwitch(6)),
        (42_007, FailureType::AvionicsFullDuplexSwitch(7)),
        (42_009, FailureType::AvionicsFullDuplexSwitch(9)),
        (42_011, FailureType::AvionicsFullDuplexSwitch(11)),
        (42_012, FailureType::AvionicsFullDuplexSwitch(12)),
        (42_013, FailureType::AvionicsFullDuplexSwitch(13)),
        (42_014, FailureType::AvionicsFullDuplexSwitch(14)),
        (42_015, FailureType::AvionicsFullDuplexSwitch(15)),
        (42_016, FailureType::AvionicsFullDuplexSwitch(16)),
        (42_017, FailureType::AvionicsFullDuplexSwitch(17)),
        (42_019, FailureType::AvionicsFullDuplexSwitch(19)),
        (42_101, FailureType::InputOutputModule('A', 1)),
        (42_102, FailureType::InputOutputModule('A', 2)),
        (42_103, FailureType::InputOutputModule('A', 3)),
        (42_104, FailureType::InputOutputModule('A', 4)),
        (42_105, FailureType::InputOutputModule('A', 5)),
        (42_106, FailureType::InputOutputModule('A', 6)),
        (42_107, FailureType::InputOutputModule('A', 7)),
        (42_108, FailureType::InputOutputModule('A', 8)),
        (42_301, FailureType::AvionicsNetworkCable(1)),
        (42_302, FailureType::AvionicsNetworkCable(2)),
        (42_303, FailureType::AvionicsNetworkCable(3)),
        (42_304, FailureType::AvionicsNetworkCable(4)),
        (42_305, FailureType::AvionicsNetworkCable(5)),
        (42_306, FailureType::AvionicsNetworkCable(6)),
        (42_307, FailureType::AvionicsNetworkCable(7)),
        (42_308, FailureType::AvionicsNetworkCable(8)),
        (42_309, FailureType::AvionicsNetworkCable(9)),
        (42_310, FailureType::AvionicsNetworkCable(10)),
        (42_311, FailureType::AvionicsNetworkCable(11)),
        (42_312, FailureType::AvionicsNetworkCable(12)),
        (42_313, FailureType::AvionicsNetworkCable(13)),
        (42_314, FailureType::AvionicsNetworkCable(14)),
        (42_315, FailureType::AvionicsNetworkCable(15)),
        (42_316, FailureType::AvionicsNetworkCable(16)),
        (42_317, FailureType::AvionicsNetworkCable(17)),
        (42_318, FailureType::AvionicsNetworkCable(18)),
        (42_319, FailureType::AvionicsNetworkCable(19)),
        (42_320, FailureType::AvionicsNetworkCable(20)),
        (42_321, FailureType::AvionicsNetworkCable(21)),
        (42_322, FailureType::AvionicsNetworkCable(22)),
        (42_323, FailureType::AvionicsNetworkCable(23)),
        (42_324, FailureType::AvionicsNetworkCable(24)),
        (42_325, FailureType::AvionicsNetworkCable(25)),
        (42_326, FailureType::AvionicsNetworkCable(26)),
        (42_327, FailureType::AvionicsNetworkCable(27)),
        (42_328, FailureType::AvionicsNetworkCable(28)),
        (42_329, FailureType::AvionicsNetworkCable(29)),
        (42_330, FailureType::AvionicsNetworkCable(30)),
        (42_201, FailureType::CoreProcessingInputOutputModule('A', 1)),
        (42_202, FailureType::CoreProcessingInputOutputModule('A', 2)),
        (42_203, FailureType::CoreProcessingInputOutputModule('A', 3)),
        (42_204, FailureType::CoreProcessingInputOutputModule('A', 4)),
        (42_211, FailureType::CoreProcessingInputOutputModule('B', 1)),
        (42_212, FailureType::CoreProcessingInputOutputModule('B', 2)),
        (42_213, FailureType::CoreProcessingInputOutputModule('B', 3)),
        (42_214, FailureType::CoreProcessingInputOutputModule('B', 4)),
        (42_221, FailureType::CoreProcessingInputOutputModule('C', 1)),
        (42_222, FailureType::CoreProcessingInputOutputModule('C', 2)),
        (42_231, FailureType::CoreProcessingInputOutputModule('D', 1)),
        (42_233, FailureType::CoreProcessingInputOutputModule('D', 3)),
        (42_241, FailureType::CoreProcessingInputOutputModule('E', 1)),
        (42_242, FailureType::CoreProcessingInputOutputModule('E', 2)),
        (42_251, FailureType::CoreProcessingInputOutputModule('F', 1)),
        (42_252, FailureType::CoreProcessingInputOutputModule('F', 2)),
        (42_253, FailureType::CoreProcessingInputOutputModule('F', 3)),
        (42_254, FailureType::CoreProcessingInputOutputModule('F', 4)),
        (42_261, FailureType::CoreProcessingInputOutputModule('G', 1)),
        (42_262, FailureType::CoreProcessingInputOutputModule('G', 2)),
        (42_263, FailureType::CoreProcessingInputOutputModule('G', 3)),
        (42_264, FailureType::CoreProcessingInputOutputModule('G', 4)),
        (49_000, FailureType::ApuElectronicControlBox),
        (49_001, FailureType::ApuOverspeed),
        (49_002, FailureType::ApuOilLowPressure),
        (49_003, FailureType::ApuOilHighTemperature),
        (49_005, FailureType::ApuOilLevelLow),
        (72_000, FailureType::EngineFlameout(1)),
        (72_001, FailureType::EngineFlameout(2)),
        (72_002, FailureType::EngineFlameout(3)),
        (72_003, FailureType::EngineFlameout(4)),
        (72_010, FailureType::EngineSeizure(1)),
        (72_011, FailureType::EngineSeizure(2)),
        (72_012, FailureType::EngineSeizure(3)),
        (72_013, FailureType::EngineSeizure(4)),
        (72_020, FailureType::EngineFanBlocked(1)),
        (72_021, FailureType::EngineFanBlocked(2)),
        (72_022, FailureType::EngineFanBlocked(3)),
        (72_023, FailureType::EngineFanBlocked(4)),
        (79_000, FailureType::EngineOilLeak(1)),
        (79_001, FailureType::EngineOilLeak(2)),
        (79_002, FailureType::EngineOilLeak(3)),
        (79_003, FailureType::EngineOilLeak(4)),
        (79_020, FailureType::EngineOilFilterClog(1)),
        (79_021, FailureType::EngineOilFilterClog(2)),
        (79_022, FailureType::EngineOilFilterClog(3)),
        (79_023, FailureType::EngineOilFilterClog(4)),
        (79_030, FailureType::EngineOilOverheat(1)),
        (79_031, FailureType::EngineOilOverheat(2)),
        (79_032, FailureType::EngineOilOverheat(3)),
        (79_033, FailureType::EngineOilOverheat(4)),
        (74_000, FailureType::EngineIgniterA(1)),
        (74_001, FailureType::EngineIgniterA(2)),
        (74_002, FailureType::EngineIgniterA(3)),
        (74_003, FailureType::EngineIgniterA(4)),
        (74_010, FailureType::EngineIgniterB(1)),
        (74_011, FailureType::EngineIgniterB(2)),
        (74_012, FailureType::EngineIgniterB(3)),
        (74_013, FailureType::EngineIgniterB(4)),
        (80_000, FailureType::EngineStartValveStuckClosed(1)),
        (80_001, FailureType::EngineStartValveStuckClosed(2)),
        (80_002, FailureType::EngineStartValveStuckClosed(3)),
        (80_003, FailureType::EngineStartValveStuckClosed(4)),
        (80_010, FailureType::EngineStartValveStuckOpen(1)),
        (80_011, FailureType::EngineStartValveStuckOpen(2)),
        (80_012, FailureType::EngineStartValveStuckOpen(3)),
        (80_013, FailureType::EngineStartValveStuckOpen(4)),
        (80_020, FailureType::EngineHotStart(1)),
        (80_021, FailureType::EngineHotStart(2)),
        (80_022, FailureType::EngineHotStart(3)),
        (80_023, FailureType::EngineHotStart(4)),
        (80_030, FailureType::EngineHungStart(1)),
        (80_031, FailureType::EngineHungStart(2)),
        (80_032, FailureType::EngineHungStart(3)),
        (80_033, FailureType::EngineHungStart(4)),
        (80_040, FailureType::EngineStartStall(1)),
        (80_041, FailureType::EngineStartStall(2)),
        (80_042, FailureType::EngineStartStall(3)),
        (80_043, FailureType::EngineStartStall(4)),
        (80_050, FailureType::EngineStarter(1)),
        (80_051, FailureType::EngineStarter(2)),
        (80_052, FailureType::EngineStarter(3)),
        (80_053, FailureType::EngineStarter(4)),
        // The engine keeps running (a380_systems engine_malfunction.rs)
        (72_100, FailureType::EngineCompressorStall(1)),
        (72_101, FailureType::EngineCompressorStall(2)),
        (72_102, FailureType::EngineCompressorStall(3)),
        (72_103, FailureType::EngineCompressorStall(4)),
        (72_110, FailureType::EngineEgtOvertemperature(1)),
        (72_111, FailureType::EngineEgtOvertemperature(2)),
        (72_112, FailureType::EngineEgtOvertemperature(3)),
        (72_113, FailureType::EngineEgtOvertemperature(4)),
        // The HMU shuts the engine down (a380_systems fadec_automatic_shutdown.rs)
        (72_120, FailureType::EngineOverspeed(1)),
        (72_121, FailureType::EngineOverspeed(2)),
        (72_122, FailureType::EngineOverspeed(3)),
        (72_123, FailureType::EngineOverspeed(4)),
        (
            72_200,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::LpShaftProtection),
        ),
        (
            72_201,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::LpShaftProtection),
        ),
        (
            72_202,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::LpShaftProtection),
        ),
        (
            72_203,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::LpShaftProtection),
        ),
        (77_000, FailureType::EngineHighVibration(1)),
        (77_001, FailureType::EngineHighVibration(2)),
        (77_002, FailureType::EngineHighVibration(3)),
        (77_003, FailureType::EngineHighVibration(4)),
        // FADEC and thrust lever (ATA 73), thrust reversers 2 and 3 (ATA 78)
        (73_010, FailureType::FadecNetworkLink(1)),
        (73_011, FailureType::FadecNetworkLink(2)),
        (73_012, FailureType::FadecNetworkLink(3)),
        (73_013, FailureType::FadecNetworkLink(4)),
        (73_020, FailureType::FadecSystem(1)),
        (73_021, FailureType::FadecSystem(2)),
        (73_022, FailureType::FadecSystem(3)),
        (73_023, FailureType::FadecSystem(4)),
        (73_030, FailureType::FadecOverheat(1)),
        (73_031, FailureType::FadecOverheat(2)),
        (73_032, FailureType::FadecOverheat(3)),
        (73_033, FailureType::FadecOverheat(4)),
        // The EEC channels and the EIPMs of a380_systems fadec_power.rs
        (73_400, FailureType::FadecChannelA(1)),
        (73_401, FailureType::FadecChannelA(2)),
        (73_402, FailureType::FadecChannelA(3)),
        (73_403, FailureType::FadecChannelA(4)),
        (73_410, FailureType::FadecChannelB(1)),
        (73_411, FailureType::FadecChannelB(2)),
        (73_412, FailureType::FadecChannelB(3)),
        (73_413, FailureType::FadecChannelB(4)),
        (73_420, FailureType::EngineInterfacePowerManagement(1)),
        (73_421, FailureType::EngineInterfacePowerManagement(2)),
        // The FADEC shutdowns of a380_systems fadec_automatic_shutdown.rs (ENG FAIL FADEC OVHT / THRUST CTL LOST)
        (73_310, FailureType::FadecOverheatShutdown(1)),
        (73_311, FailureType::FadecOverheatShutdown(2)),
        (73_312, FailureType::FadecOverheatShutdown(3)),
        (73_313, FailureType::FadecOverheatShutdown(4)),
        (73_320, FailureType::EngineOverthrust(1)),
        (73_321, FailureType::EngineOverthrust(2)),
        (73_322, FailureType::EngineOverthrust(3)),
        (73_323, FailureType::EngineOverthrust(4)),
        (73_040, FailureType::ThrustLeverResolvers(1)),
        (73_041, FailureType::ThrustLeverResolvers(2)),
        (73_042, FailureType::ThrustLeverResolvers(3)),
        (73_043, FailureType::ThrustLeverResolvers(4)),
        (28_040, FailureType::EngineLpValveJammed(1)),
        (28_041, FailureType::EngineLpValveJammed(2)),
        (28_042, FailureType::EngineLpValveJammed(3)),
        (28_043, FailureType::EngineLpValveJammed(4)),
        // Fuel quantity measurement (a380_systems fuel): the tank failures follow the A380FuelTankType
        // order (L OUTER, FEED 1, L MID, L INNER, FEED 2, FEED 3, R INNER, R MID, FEED 4, R OUTER, TRIM)
        (28_100, FailureType::FuelQuantityDataConcentrator(1)),
        (28_101, FailureType::FuelQuantityDataConcentrator(2)),
        (28_102, FailureType::FuelQuantityManagementSystem(1)),
        (28_103, FailureType::FuelQuantityManagementSystem(2)),
        (28_104, FailureType::FuelAlternateGaugingProcessor(1)),
        (28_105, FailureType::FuelAlternateGaugingProcessor(2)),
        (28_110, FailureType::FuelQuantityIndication(0)),
        (28_111, FailureType::FuelQuantityIndication(1)),
        (28_112, FailureType::FuelQuantityIndication(2)),
        (28_113, FailureType::FuelQuantityIndication(3)),
        (28_114, FailureType::FuelQuantityIndication(4)),
        (28_115, FailureType::FuelQuantityIndication(5)),
        (28_116, FailureType::FuelQuantityIndication(6)),
        (28_117, FailureType::FuelQuantityIndication(7)),
        (28_118, FailureType::FuelQuantityIndication(8)),
        (28_119, FailureType::FuelQuantityIndication(9)),
        (28_120, FailureType::FuelQuantityIndication(10)),
        (28_121, FailureType::FuelGaugingDegraded(0)),
        (28_122, FailureType::FuelGaugingDegraded(1)),
        (28_123, FailureType::FuelGaugingDegraded(2)),
        (28_124, FailureType::FuelGaugingDegraded(3)),
        (28_125, FailureType::FuelGaugingDegraded(4)),
        (28_126, FailureType::FuelGaugingDegraded(5)),
        (28_127, FailureType::FuelGaugingDegraded(6)),
        (28_128, FailureType::FuelGaugingDegraded(7)),
        (28_129, FailureType::FuelGaugingDegraded(8)),
        (28_130, FailureType::FuelGaugingDegraded(9)),
        (28_131, FailureType::FuelGaugingDegraded(10)),
        (73_100, FailureType::EngineFuelFilterClog(1)),
        (73_101, FailureType::EngineFuelFilterClog(2)),
        (73_102, FailureType::EngineFuelFilterClog(3)),
        (73_103, FailureType::EngineFuelFilterClog(4)),
        // ENG HP FUEL VLV FAULT (systems engine/hp_fuel_valve_failure.rs)
        (73_200, FailureType::EngineHpFuelValveStuck(1)),
        (73_201, FailureType::EngineHpFuelValveStuck(2)),
        (73_202, FailureType::EngineHpFuelValveStuck(3)),
        (73_203, FailureType::EngineHpFuelValveStuck(4)),
        // The FADEC faults without engine model effect (systems engine/engine_monitoring_fault.rs)
        (
            73_110,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::FuelStrainerClog),
        ),
        (
            73_111,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::FuelStrainerClog),
        ),
        (
            73_112,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::FuelStrainerClog),
        ),
        (
            73_113,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::FuelStrainerClog),
        ),
        (
            73_120,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::FuelFilterMonitoring),
        ),
        (
            73_121,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::FuelFilterMonitoring),
        ),
        (
            73_122,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::FuelFilterMonitoring),
        ),
        (
            73_123,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::FuelFilterMonitoring),
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
            73_242,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::Sensors),
        ),
        (
            73_243,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::Sensors),
        ),
        (
            73_250,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::OverthrustProtection),
        ),
        (
            73_251,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::OverthrustProtection),
        ),
        (
            73_252,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::OverthrustProtection),
        ),
        (
            73_253,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::OverthrustProtection),
        ),
        (
            73_260,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::MinorFault),
        ),
        (
            73_261,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::MinorFault),
        ),
        (
            73_262,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::MinorFault),
        ),
        (
            73_263,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::MinorFault),
        ),
        (
            79_040,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::OilChip),
        ),
        (
            79_041,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::OilChip),
        ),
        (
            79_042,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::OilChip),
        ),
        (
            79_043,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::OilChip),
        ),
        // More FADEC faults without engine model effect (engine_monitoring_fault.rs): CTL SYS FAULT,
        // CTL VLV FAULT, FADEC IDENT FAULT, FUEL SYS CONTAMINATION, OIL SYS CONTAMINATION, ENG TYPE
        // DISAGREE
        (
            73_270,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::ControlSystem),
        ),
        (
            73_271,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::ControlSystem),
        ),
        (
            73_272,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::ControlSystem),
        ),
        (
            73_273,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::ControlSystem),
        ),
        (
            73_280,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::ControlValve),
        ),
        (
            73_281,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::ControlValve),
        ),
        (
            73_282,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::ControlValve),
        ),
        (
            73_283,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::ControlValve),
        ),
        (
            73_290,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::FadecIdent),
        ),
        (
            73_291,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::FadecIdent),
        ),
        (
            73_292,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::FadecIdent),
        ),
        (
            73_293,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::FadecIdent),
        ),
        (
            73_130,
            FailureType::EngineMonitoringFault(
                1,
                EngineMonitoringFaultKind::FuelSystemContamination,
            ),
        ),
        (
            73_131,
            FailureType::EngineMonitoringFault(
                2,
                EngineMonitoringFaultKind::FuelSystemContamination,
            ),
        ),
        (
            73_132,
            FailureType::EngineMonitoringFault(
                3,
                EngineMonitoringFaultKind::FuelSystemContamination,
            ),
        ),
        (
            73_133,
            FailureType::EngineMonitoringFault(
                4,
                EngineMonitoringFaultKind::FuelSystemContamination,
            ),
        ),
        (
            79_050,
            FailureType::EngineMonitoringFault(
                1,
                EngineMonitoringFaultKind::OilSystemContamination,
            ),
        ),
        (
            79_051,
            FailureType::EngineMonitoringFault(
                2,
                EngineMonitoringFaultKind::OilSystemContamination,
            ),
        ),
        (
            79_052,
            FailureType::EngineMonitoringFault(
                3,
                EngineMonitoringFaultKind::OilSystemContamination,
            ),
        ),
        (
            79_053,
            FailureType::EngineMonitoringFault(
                4,
                EngineMonitoringFaultKind::OilSystemContamination,
            ),
        ),
        (
            73_300,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::ThrustRatingDisagree),
        ),
        (
            73_301,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::ThrustRatingDisagree),
        ),
        (
            73_302,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::ThrustRatingDisagree),
        ),
        (
            73_303,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::ThrustRatingDisagree),
        ),
        (
            79_060,
            FailureType::EngineMonitoringFault(1, EngineMonitoringFaultKind::OilFilterMonitoring),
        ),
        (
            79_061,
            FailureType::EngineMonitoringFault(2, EngineMonitoringFaultKind::OilFilterMonitoring),
        ),
        (
            79_062,
            FailureType::EngineMonitoringFault(3, EngineMonitoringFaultKind::OilFilterMonitoring),
        ),
        (
            79_063,
            FailureType::EngineMonitoringFault(4, EngineMonitoringFaultKind::OilFilterMonitoring),
        ),
        (78_001, FailureType::ReverserFault(2)),
        (78_002, FailureType::ReverserFault(3)),
        (78_011, FailureType::ReverserUnlocked(2)),
        (78_012, FailureType::ReverserUnlocked(3)),
        (78_021, FailureType::ReverserPressurized(2)),
        (78_022, FailureType::ReverserPressurized(3)),
        (78_031, FailureType::ReverserLocked(2)),
        (78_032, FailureType::ReverserLocked(3)),
        (78_041, FailureType::ReverserControlFault(2)),
        (78_042, FailureType::ReverserControlFault(3)),
        (78_051, FailureType::ReverserMinorFault(2)),
        (78_052, FailureType::ReverserMinorFault(3)),
        (78_061, FailureType::ReverserInhibited(2)),
        (78_062, FailureType::ReverserInhibited(3)),
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
    .provides_aircraft_variable("CENTER WHEEL ROTATION ANGLE", "Degrees", 0)?
    .provides_aircraft_variable("CONTACT POINT COMPRESSION", "Percent", 0)?
    .provides_aircraft_variable("CONTACT POINT COMPRESSION", "Percent", 1)?
    .provides_aircraft_variable("CONTACT POINT COMPRESSION", "Percent", 2)?
    .provides_aircraft_variable("CONTACT POINT COMPRESSION", "Percent", 3)?
    .provides_aircraft_variable("CONTACT POINT COMPRESSION", "Percent", 4)?
    .provides_aircraft_variable("ENG ON FIRE", "Bool", 1)?
    .provides_aircraft_variable("ENG ON FIRE", "Bool", 2)?
    .provides_aircraft_variable("ENG ON FIRE", "Bool", 3)?
    .provides_aircraft_variable("ENG ON FIRE", "Bool", 4)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 1)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 2)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 3)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 4)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 5)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 6)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 7)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 8)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 9)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 10)?
    .provides_aircraft_variable("FUELSYSTEM TANK QUANTITY", "gallons", 11)?
    .provides_aircraft_variable("FUELSYSTEM LINE FUEL FLOW", "gallons per hour", 141)?
    .provides_aircraft_variable_range("FUELSYSTEM VALVE SWITCH", "Bool", 1..=4)?
    .provides_aircraft_variable("GEAR ANIMATION POSITION", "Percent", 0)?
    .provides_aircraft_variable("GEAR ANIMATION POSITION", "Percent", 1)?
    .provides_aircraft_variable("GEAR ANIMATION POSITION", "Percent", 2)?
    .provides_aircraft_variable("GEAR ANIMATION POSITION", "Percent", 3)?
    .provides_aircraft_variable("GEAR ANIMATION POSITION", "Percent", 4)?
    .provides_aircraft_variable("GEAR CENTER POSITION", "Percent", 0)?
    .provides_aircraft_variable("GEAR LEFT POSITION", "Percent", 0)?
    .provides_aircraft_variable("GEAR RIGHT POSITION", "Percent", 0)?
    .provides_aircraft_variable("GENERAL ENG STARTER ACTIVE", "Bool", 1)?
    .provides_aircraft_variable("GENERAL ENG STARTER ACTIVE", "Bool", 2)?
    .provides_aircraft_variable("GPS GROUND SPEED", "Knots", 0)?
    .provides_aircraft_variable("GPS GROUND MAGNETIC TRACK", "Degrees", 0)?
    .provides_aircraft_variable("GPS GROUND TRUE TRACK", "Degrees", 0)?
    // the ILS receivers of MMR 1 (NAV 3) and MMR 2 (NAV 4)
    .provides_aircraft_variable_range("NAV HAS NAV", "Bool", 3..=4)?
    .provides_aircraft_variable_range("NAV HAS LOCALIZER", "Bool", 3..=4)?
    .provides_aircraft_variable_range("NAV HAS GLIDE SLOPE", "Bool", 3..=4)?
    .provides_aircraft_variable_range("NAV RADIAL ERROR", "degree", 3..=4)?
    .provides_aircraft_variable_range("NAV GLIDE SLOPE ERROR", "degree", 3..=4)?
    .provides_aircraft_variable_range("NAV FREQUENCY", "Hz", 3..=4)?
    .provides_aircraft_variable("PLANE ALTITUDE", "Feet", 0)?
    .provides_aircraft_variable("INCIDENCE ALPHA", "Degrees", 0)?
    .provides_aircraft_variable("INDICATED ALTITUDE", "Feet", 0)?
    .provides_aircraft_variable("INTERACTIVE POINT OPEN:0", "Percent", 0)?
    .provides_aircraft_variable("INTERACTIVE POINT OPEN", "Percent", 2)?
    .provides_aircraft_variable("INTERACTIVE POINT OPEN", "Percent", 3)?
    .provides_aircraft_variable("INTERACTIVE POINT OPEN", "Percent", 10)?
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
    .provides_aircraft_variable("SURFACE TYPE", "Enum", 0)?
    .provides_aircraft_variable("TOTAL AIR TEMPERATURE", "celsius", 0)?
    .provides_aircraft_variable("TOTAL WEIGHT", "Pounds", 0)?
    .provides_aircraft_variable("TOTAL WEIGHT YAW MOI", "Slugs feet squared", 0)?
    .provides_aircraft_variable("TOTAL WEIGHT PITCH MOI", "Slugs feet squared", 0)?
    .provides_aircraft_variable("TRAILING EDGE FLAPS LEFT PERCENT", "Percent", 0)?
    .provides_aircraft_variable("TRAILING EDGE FLAPS RIGHT PERCENT", "Percent", 0)?
    .provides_aircraft_variable("TURB ENG CORRECTED N1", "Percent", 1)?
    .provides_aircraft_variable("TURB ENG CORRECTED N1", "Percent", 2)?
    .provides_aircraft_variable("TURB ENG CORRECTED N1", "Percent", 3)?
    .provides_aircraft_variable("TURB ENG CORRECTED N1", "Percent", 4)?
    .provides_aircraft_variable("TURB ENG CORRECTED N2", "Percent", 1)?
    .provides_aircraft_variable("TURB ENG CORRECTED N2", "Percent", 2)?
    .provides_aircraft_variable("TURB ENG CORRECTED N2", "Percent", 3)?
    .provides_aircraft_variable("TURB ENG CORRECTED N2", "Percent", 4)?
    .provides_aircraft_variable("TURB ENG IGNITION SWITCH EX1", "Enum", 1)?
    .provides_aircraft_variable("TURB ENG JET THRUST", "Pounds", 1)?
    .provides_aircraft_variable("TURB ENG JET THRUST", "Pounds", 2)?
    .provides_aircraft_variable("TURB ENG JET THRUST", "Pounds", 3)?
    .provides_aircraft_variable("TURB ENG JET THRUST", "Pounds", 4)?
    // The MSFS engine speeds and vibration (a380_systems engine_malfunction.rs)
    .provides_aircraft_variable("TURB ENG N1", "Percent", 1)?
    .provides_aircraft_variable("TURB ENG N1", "Percent", 2)?
    .provides_aircraft_variable("TURB ENG N1", "Percent", 3)?
    .provides_aircraft_variable("TURB ENG N1", "Percent", 4)?
    .provides_aircraft_variable("TURB ENG N2", "Percent", 1)?
    .provides_aircraft_variable("TURB ENG N2", "Percent", 2)?
    .provides_aircraft_variable("TURB ENG N2", "Percent", 3)?
    .provides_aircraft_variable("TURB ENG N2", "Percent", 4)?
    .provides_aircraft_variable("TURB ENG VIBRATION", "Number", 1)?
    .provides_aircraft_variable("TURB ENG VIBRATION", "Number", 2)?
    .provides_aircraft_variable("TURB ENG VIBRATION", "Number", 3)?
    .provides_aircraft_variable("TURB ENG VIBRATION", "Number", 4)?
    .provides_aircraft_variable("UNLIMITED FUEL", "Bool", 0)?
    .provides_aircraft_variable("VELOCITY BODY X", "feet per second", 0)?
    .provides_aircraft_variable("VELOCITY BODY Y", "feet per second", 0)?
    .provides_aircraft_variable("VELOCITY BODY Z", "feet per second", 0)?
    .provides_aircraft_variable("VELOCITY WORLD Y", "feet per minute", 0)?
    .provides_aircraft_variable("WHEEL RPM", "RPM", 1)?
    .provides_aircraft_variable("WHEEL RPM", "RPM", 2)?
    .provides_aircraft_variable("ROTATION VELOCITY BODY X", "degree per second", 0)?
    .provides_aircraft_variable("ROTATION VELOCITY BODY Y", "degree per second", 0)?
    .provides_aircraft_variable("ROTATION VELOCITY BODY Z", "degree per second", 0)?
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
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 1)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 2)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 3)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 4)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 5)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 6)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 7)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 8)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 9)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 10)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 11)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 12)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 13)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 14)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 15)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 16)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 17)?
    .provides_aircraft_variable("PAYLOAD STATION WEIGHT", "Pounds", 18)?
    // The ENG START selector position (0 CRANK, 1 NORM, 2 IGN START): an in-flight relight needs IGN START
    .provides_named_variable("XMLVAR_ENG_MODE_SEL")?
    .provides_named_variable("FSDT_GSX_BOARDING_STATE")?
    .provides_named_variable("FSDT_GSX_DEBOARDING_STATE")?
    .provides_named_variable("FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL")?
    .provides_named_variable("FSDT_GSX_NUMPASSENGERS_DEBOARDING_TOTAL")?
    .provides_named_variable("FSDT_GSX_BOARDING_CARGO_PERCENT")?
    .provides_named_variable("FSDT_GSX_DEBOARDING_CARGO_PERCENT")?
    .provides_named_variable("FSDT_GSX_BYPASS_PIN")?
    .provides_named_variable("SIAI_PUSHBACK_ACTIVE")?
    .with_aspect(|builder| {
        for i in 1..=2 {
            builder.copy(
                Variable::aircraft("APU GENERATOR SWITCH", "Bool", i),
                Variable::aspect(&format!("OVHD_ELEC_APU_GEN_{i}_PB_IS_ON")),
            );
        }

        for i in 1..=4 {
            builder.copy(
                Variable::named(&format!("EXT_PWR_AVAIL:{i}")),
                Variable::aspect(&format!("OVHD_ELEC_EXT_PWR_{i}_PB_IS_AVAILABLE")),
            );

            builder.copy(
                Variable::aircraft("GENERAL ENG MASTER ALTERNATOR", "Bool", i),
                Variable::aspect(&format!("OVHD_ELEC_ENG_GEN_{i}_PB_IS_ON")),
            );
        }

        Ok(())
    })?
    .with_aspect(reversers)?
    .with_aspect(brakes)?
    .with_aspect(cargo_doors)?
    .with_aspect(autobrakes)?
    .with_aspect(nose_wheel_steering)?
    .with_aspect(body_wheel_steering)?
    .with_aspect(fire)?
    .with_aspect(flaps)?
    .with_aspect(spoilers)?
    .with_aspect(ailerons)?
    .with_aspect(elevators)?
    .with_aspect(rudder)?
    .with_aspect(gear)?
    .with_aspect(payload)?
    .with_aspect(fuel)?
    .with_aspect(trimmable_horizontal_stabilizer)?
    .build(A380::new)?;

    while let Some(event) = gauge.next_event().await {
        handler.handle(event, &mut simulation, sim_connect.as_mut().get_mut())?;
    }

    Ok(())
}
