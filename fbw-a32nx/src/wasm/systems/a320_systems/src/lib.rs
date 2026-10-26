extern crate systems;

mod air_conditioning;
mod airframe;
mod cargo_ventilation;
mod electrical;
mod engine_control_failure;
mod engine_failure;
mod engine_malfunction;
mod fire_protection;
mod fuel;
pub mod hydraulic;
mod navigation;
mod oxygen;
mod payload;
mod pneumatic;
mod power_consumption;
mod probe_window_heat;
mod surveillance;
mod tyre_pressure;

use self::{
    air_conditioning::A320AirConditioning,
    cargo_ventilation::A320AftCargoVentilation,
    engine_control_failure::A320EngineControlFailures,
    engine_failure::A320EngineFailures,
    engine_malfunction::A320EngineMalfunctions,
    fire_protection::A320FireProtection,
    fuel::A320Fuel,
    oxygen::A320Oxygen,
    payload::A320Payload,
    pneumatic::{A320Pneumatic, A320PneumaticOverheadPanel},
    probe_window_heat::A320ProbeWindowHeat,
    surveillance::{unavailable_terrain_grid, A320EgpwsElectricalHarness, A320PredictiveTerrain},
    tyre_pressure::A320TyrePressureIndicatingSystem,
};
use airframe::A320Airframe;
use electrical::{
    A320Electrical, A320ElectricalOverheadPanel, A320EmergencyElectricalOverheadPanel,
    APU_START_MOTOR_BUS_TYPE,
};
use hydraulic::{A320Hydraulic, A320HydraulicOverheadPanel};
use navigation::{A320AirDataInertialReferenceSystemBuilder, A320RadioAltimeters};
use power_consumption::A320PowerConsumption;
use systems::navigation::gnss::GpsReceiver;
use systems::navigation::gpirs::Gpirs;
use systems::navigation::ils::MultiModeReceiverShim;
use systems::{
    enhanced_gpwc::{EnhancedGroundProximityWarningComputer, PredictiveFunctionsLink},
    surveillance::{
        egpws::{
            terrain_grid::TerrainGrid, EgpwsElectricalHarness,
            EnhancedGroundProximityWarningComputer as EnhancedGroundProximityWarningComputer2,
        },
        taws::TerrainAwarenessWarningSystemDiscreteOutput,
    },
};
use systems::{hydraulic::brake::BrakeFanPanel, simulation::InitContext};
use uom::si::{f64::Length, length::nautical_mile};

use systems::{
    air_starter_unit::AirStarterUnit,
    apu::{
        Aps3200ApuGenerator, Aps3200Constants, Aps3200StartMotor, AuxiliaryPowerUnit,
        AuxiliaryPowerUnitFactory, AuxiliaryPowerUnitFireOverheadPanel,
        AuxiliaryPowerUnitOverheadPanel,
    },
    electrical::{Electricity, ElectricitySource, ExternalPowerSource},
    engine::{
        engine_monitoring_fault::{EngineMonitoringFaultKind, EngineMonitoringFaults},
        fuel_filter_failure::EngineFuelFilterFailures,
        leap_engine::LeapEngine,
        oil_failure::EngineOilFailures,
        reverser_thrust::ReverserForce,
        EngineFireOverheadPanel,
    },
    hydraulic::brake_circuit::AutobrakePanel,
    landing_gear::{LandingGear, LandingGearControlInterfaceUnitSet},
    navigation::adirs::{
        AirDataInertialReferenceSystem, AirDataInertialReferenceSystemOverheadPanel,
    },
    pneumatic::EngineState,
    shared::{ElectricalBusType, EngineStartState, LgciuWeightOnWheels, PackFlowValveState},
    simulation::{Aircraft, SimulationElement, SimulationElementVisitor, UpdateContext},
};

/// The FADEC faults of the A320 FCOM that have no engine model effect (PRO-ABN-ENG, a320_fcom.txt):
/// ENG 1(2) FADEC ALTERNATOR, OVSPD PROT FAULT, PROBES FAULT, SENSOR FAULT, ONE TLA FAULT, REV SWITCH
/// FAULT (see systems::engine::engine_monitoring_fault and the FWC Logic/EngineMonitoringAlerts.ts),
/// and FUEL CTL FAULT, FUEL RETURN VALVE, CTL VALVE FAULT, COMPRESSOR VANE (ENG 1(2) and ENG 1+2),
/// BLEED STATUS FAULT, REV INHIBITED, REV ISOL FAULT (FWC Logic/EngineFadecFaultAlerts.ts). REV
/// INHIBITED also stops the reverser deployment (see `reversers_deployment_inhibited`).
const A320_ENGINE_MONITORING_FAULTS: [EngineMonitoringFaultKind; 15] = [
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
];

pub struct A320 {
    adirs: AirDataInertialReferenceSystem,
    adirs_overhead: AirDataInertialReferenceSystemOverheadPanel,
    air_conditioning: A320AirConditioning,
    aft_cargo_ventilation: A320AftCargoVentilation,
    apu: AuxiliaryPowerUnit<Aps3200ApuGenerator, Aps3200StartMotor, Aps3200Constants, 1>,
    asu: AirStarterUnit,
    apu_fire_overhead: AuxiliaryPowerUnitFireOverheadPanel,
    apu_overhead: AuxiliaryPowerUnitOverheadPanel,
    pneumatic_overhead: A320PneumaticOverheadPanel,
    electrical_overhead: A320ElectricalOverheadPanel,
    emergency_electrical_overhead: A320EmergencyElectricalOverheadPanel,
    payload: A320Payload,
    airframe: A320Airframe,
    fuel: A320Fuel,
    engine_1: LeapEngine,
    engine_2: LeapEngine,
    engine_fire_overhead: EngineFireOverheadPanel<2>,
    engine_failures: A320EngineFailures,
    /// Oil leak, oil filter clog and oil overheat of each engine, applied by the FADEC
    engine_oil_failures: EngineOilFailures<2>,
    /// Fuel filter clog of each engine: SD ENGINE indication and FWC caution only
    engine_fuel_filter_failures: EngineFuelFilterFailures<2>,
    /// The FADEC faults without engine model effect of each engine: FWC alerts only
    engine_monitoring_faults: EngineMonitoringFaults<2>,
    engine_malfunctions: A320EngineMalfunctions,
    engine_control_failures: A320EngineControlFailures,
    fire_protection: A320FireProtection,
    electrical: A320Electrical,
    power_consumption: A320PowerConsumption,
    ext_pwr: ExternalPowerSource,
    lgcius: LandingGearControlInterfaceUnitSet,
    hydraulic: A320Hydraulic,
    hydraulic_overhead: A320HydraulicOverheadPanel,
    autobrake_panel: AutobrakePanel,
    brake_fan_panel: BrakeFanPanel,
    landing_gear: LandingGear,
    pneumatic: A320Pneumatic,
    oxygen: A320Oxygen,
    probe_window_heat: A320ProbeWindowHeat,
    tyre_pressure: A320TyrePressureIndicatingSystem,
    radio_altimeters: A320RadioAltimeters,
    egpwc: EnhancedGroundProximityWarningComputer,
    egpwc_2: EnhancedGroundProximityWarningComputer2,
    egpws_electrical_harness: A320EgpwsElectricalHarness,
    predictive_terrain: A320PredictiveTerrain,
    /// ILS 1 (NAV 3), for PFD 1 and the EGPWS
    mmr_1: MultiModeReceiverShim,
    /// ILS 2 (NAV 4), for PFD 2
    mmr_2: MultiModeReceiverShim,
    gps_1: GpsReceiver,
    gps_2: GpsReceiver,
    gpirs: Gpirs,
    reverse_thrust: ReverserForce,
}
impl A320 {
    pub fn new(context: &mut InitContext) -> A320 {
        Self::new_with_terrain_grid(context, unavailable_terrain_grid())
    }

    /// The A320 with the terrain grid its predictive terrain functions read. Without one (`new`) the predictive
    /// functions stay off and the EGPWC is in terrain standby.
    pub fn new_with_terrain_grid(
        context: &mut InitContext,
        terrain_grid: Box<dyn TerrainGrid>,
    ) -> A320 {
        A320 {
            adirs: A320AirDataInertialReferenceSystemBuilder::build(context),
            adirs_overhead: AirDataInertialReferenceSystemOverheadPanel::new(context),
            air_conditioning: A320AirConditioning::new(context),
            aft_cargo_ventilation: A320AftCargoVentilation::new(context),
            apu: AuxiliaryPowerUnitFactory::new_aps3200(
                context,
                1,
                APU_START_MOTOR_BUS_TYPE,
                ElectricalBusType::DirectCurrentBattery,
                ElectricalBusType::DirectCurrentBattery,
            ),
            asu: AirStarterUnit::new(context),
            apu_fire_overhead: AuxiliaryPowerUnitFireOverheadPanel::new(context),
            apu_overhead: AuxiliaryPowerUnitOverheadPanel::new(context),
            pneumatic_overhead: A320PneumaticOverheadPanel::new(context),
            electrical_overhead: A320ElectricalOverheadPanel::new(context),
            emergency_electrical_overhead: A320EmergencyElectricalOverheadPanel::new(context),
            payload: A320Payload::new(context),
            airframe: A320Airframe::new(context),
            fuel: A320Fuel::new(context),
            engine_1: LeapEngine::new(context, 1),
            engine_2: LeapEngine::new(context, 2),
            engine_fire_overhead: EngineFireOverheadPanel::new(context),
            engine_failures: A320EngineFailures::new(context),
            engine_oil_failures: EngineOilFailures::new(context),
            engine_fuel_filter_failures: EngineFuelFilterFailures::new(context),
            engine_monitoring_faults: EngineMonitoringFaults::new(
                context,
                &A320_ENGINE_MONITORING_FAULTS,
            ),
            engine_malfunctions: A320EngineMalfunctions::new(context),
            engine_control_failures: A320EngineControlFailures::new(context),
            fire_protection: A320FireProtection::new(context),
            electrical: A320Electrical::new(context),
            power_consumption: A320PowerConsumption::new(context),
            ext_pwr: ExternalPowerSource::new(context, 1),
            lgcius: LandingGearControlInterfaceUnitSet::new(
                context,
                ElectricalBusType::DirectCurrentEssential,
                ElectricalBusType::DirectCurrentGndFltService,
            ),
            hydraulic: A320Hydraulic::new(context),
            hydraulic_overhead: A320HydraulicOverheadPanel::new(context),
            autobrake_panel: AutobrakePanel::new(context),
            brake_fan_panel: BrakeFanPanel::new(context),
            landing_gear: LandingGear::new(context, false),
            pneumatic: A320Pneumatic::new(context),
            oxygen: A320Oxygen::new(context),
            probe_window_heat: A320ProbeWindowHeat::new(context),
            tyre_pressure: A320TyrePressureIndicatingSystem::new(context),
            radio_altimeters: A320RadioAltimeters::new(context),
            // The GPS receivers of MMR 1 and 2. The FCOM gives no power supply: MMR 1 on AC ESS and MMR 2 on AC 2,
            // as the other side 1 / side 2 navigation receivers (design choice)
            gps_1: GpsReceiver::new(context, 1, ElectricalBusType::AlternatingCurrentEssential),
            gps_2: GpsReceiver::new(context, 2, ElectricalBusType::AlternatingCurrent(2)),
            gpirs: Gpirs::new(context),
            egpwc: EnhancedGroundProximityWarningComputer::new(
                context,
                ElectricalBusType::AlternatingCurrent(1),
                vec![
                    Length::new::<nautical_mile>(10.0),
                    Length::new::<nautical_mile>(20.0),
                    Length::new::<nautical_mile>(40.0),
                    Length::new::<nautical_mile>(80.0),
                    Length::new::<nautical_mile>(160.0),
                    Length::new::<nautical_mile>(320.0),
                ],
                0,
            )
            // TERR STBY deselects the TERR ON ND pb-sws (FCOM DSC-34-SURV-40-40, a320_fcom.txt l.55563-55566)
            .with_terrain_display_deselection_on_standby(),
            egpwc_2: EnhancedGroundProximityWarningComputer2::new(
                context,
                ElectricalBusType::AlternatingCurrent(1),
            ),
            egpws_electrical_harness: A320EgpwsElectricalHarness::new(context),
            predictive_terrain: A320PredictiveTerrain::new(context, terrain_grid),
            mmr_1: MultiModeReceiverShim::new(context, 1),
            mmr_2: MultiModeReceiverShim::new(context, 2),
            reverse_thrust: ReverserForce::new(context),
        }
    }

    /// Per engine, the reverser does not deploy: the FADEC no longer commands it (thrust lever
    /// fault, FADEC fault) or it is inhibited by maintenance action (ENG 1(2) REV INHIBITED, A320
    /// FCOM PRO-ABN-ENG l.80700 "the reverser is inhibited by maintenance action", STATUS INOP SYS
    /// REVERSER 1(2) l.80711-80715).
    fn reversers_deployment_inhibited(&self) -> [bool; 2] {
        let fadec_inhibited = self
            .engine_control_failures
            .reversers_deployment_inhibited();
        [1, 2].map(|engine_number| {
            fadec_inhibited[engine_number - 1]
                || self
                    .engine_monitoring_faults
                    .is_active(engine_number, EngineMonitoringFaultKind::ReverserInhibited)
        })
    }
}
impl Aircraft for A320 {
    fn update_before_power_distribution(
        &mut self,
        context: &UpdateContext,
        electricity: &mut Electricity,
    ) {
        // The APU speed governing (A320 FCOM l.60473-60476) knows the air conditioning demand: a pack takes air
        self.apu.update_air_conditioning_demand(
            (1..=2).any(|pack_id| self.pneumatic.pack_flow_valve_is_open(pack_id)),
        );
        self.apu.update_before_electrical(
            context,
            &self.apu_overhead,
            self.fire_protection.apu_fire_on_ground(),
            &self.apu_fire_overhead,
            self.pneumatic_overhead.apu_bleed_is_on(),
            // This will be replaced when integrating the whole electrical system.
            // For now we use the same logic as found in the JavaScript code; ignoring whether or not
            // the engine generators are supplying electricity.
            self.electrical_overhead.apu_generator_is_on()
                && !(self.electrical_overhead.external_power_is_on()
                    && self.electrical_overhead.external_power_is_available()),
            self.pneumatic.apu_bleed_air_valve(),
            // The APU LP fuel valve jammed closed starves the APU (fuel/apu_lp_valve.rs)
            self.fuel.apu_has_fuel(),
        );

        self.electrical.update(
            context,
            electricity,
            &self.ext_pwr,
            &self.electrical_overhead,
            &self.emergency_electrical_overhead,
            &mut self.apu,
            &self.apu_overhead,
            &self.engine_fire_overhead,
            [&self.engine_1, &self.engine_2],
            &self.hydraulic,
            self.lgcius.lgciu1(),
            &self.adirs,
        );

        self.electrical_overhead
            .update_after_electrical(&self.electrical, electricity, &self.apu);
        self.emergency_electrical_overhead
            .update_after_electrical(context, &self.electrical);
        self.payload.update(context);
        self.airframe
            .update(&self.fuel, &self.payload, &self.payload);
    }

    fn update_after_power_distribution(&mut self, context: &UpdateContext) {
        self.apu.update_after_power_distribution(
            &[&self.engine_1, &self.engine_2],
            [self.lgcius.lgciu1(), self.lgcius.lgciu2()],
        );
        self.apu_overhead.update_after_apu(&self.apu);

        self.asu.update();

        self.fuel.update(
            context,
            &self.engine_fire_overhead,
            [&self.engine_1, &self.engine_2],
        );
        // The thrust control malfunctions of the previous update (the engine control failures
        // update after the reversers, below), for the ENG FAULT light.
        self.engine_failures.update(
            context,
            &self.fuel,
            self.engine_control_failures.thrust_control_malfunctions(),
        );
        self.engine_malfunctions.update(context);

        self.lgcius.update(
            context,
            &self.landing_gear,
            self.hydraulic.gear_system(),
            self.ext_pwr.output_potential().is_powered(),
            self.hydraulic.nose_wheel_steering_centered(),
        );

        self.fire_protection
            .update(context, [self.lgcius.lgciu1(), self.lgcius.lgciu2()]);
        self.aft_cargo_ventilation
            .update(self.fire_protection.aft_cargo_smoke_detected());

        self.radio_altimeters.update(context);
        self.gps_1.update(context);
        self.gps_2.update(context);
        self.gpirs.update();

        // The FADECs' reverser inhibitions of the previous update (thrust lever fault, FADEC fault)
        // and the maintenance inhibition (ENG 1(2) REV INHIBITED)
        self.hydraulic
            .set_reversers_deployment_inhibited(self.reversers_deployment_inhibited());
        self.hydraulic.update(
            context,
            &self.engine_1,
            &self.engine_2,
            &self.hydraulic_overhead,
            &self.autobrake_panel,
            &self.brake_fan_panel,
            &self.engine_fire_overhead,
            &self.lgcius,
            &self.emergency_electrical_overhead,
            &self.electrical,
            &self.pneumatic,
            &self.adirs,
        );

        self.reverse_thrust.update(
            context,
            [&self.engine_1, &self.engine_2],
            self.hydraulic.reversers_position(),
        );

        // The thrust lever angle the FADECs use, from the reverser state and the FADEC / thrust
        // lever failures (engine_control_failure.rs). On the ground as the FADEC model of the
        // flight computers sees it: both main gears compressed.
        self.engine_control_failures.update(
            context,
            self.lgcius.lgciu1().left_and_right_gear_compressed(false)
                || self.lgcius.lgciu2().left_and_right_gear_compressed(false),
            self.hydraulic.reversers_monitoring(),
        );

        self.pneumatic.update_hydraulic_reservoir_spatial_volumes(
            self.hydraulic.green_reservoir(),
            self.hydraulic.blue_reservoir(),
            self.hydraulic.yellow_reservoir(),
        );

        self.hydraulic_overhead.update(&self.hydraulic);
        self.brake_fan_panel.update(self.hydraulic.brakes_hot());

        self.adirs.update(context, &self.adirs_overhead);
        self.adirs_overhead.update(context, &self.adirs);

        self.power_consumption.update(context);

        self.pneumatic.update(
            context,
            [&self.engine_1, &self.engine_2],
            &self.pneumatic_overhead,
            &self.engine_fire_overhead,
            &self.apu,
            &self.asu,
            &self.air_conditioning,
            [self.lgcius.lgciu1(), self.lgcius.lgciu2()],
        );
        self.pneumatic_overhead.update_fault_lights(&self.pneumatic);
        self.air_conditioning
            .mix_packs_air_update(self.pneumatic.packs());
        self.air_conditioning.update(
            context,
            &self.adirs,
            [&self.engine_1, &self.engine_2],
            &self.engine_fire_overhead,
            &self.payload,
            &self.pneumatic,
            [self.lgcius.lgciu1(), self.lgcius.lgciu2()],
        );

        self.oxygen.update(context);
        self.tyre_pressure.update(context);
        // Probes and windows heated with an engine running or in flight (FCOM DSC-30-40-10, DSC-30-50-10)
        let lgcius = [self.lgcius.lgciu1(), self.lgcius.lgciu2()];
        self.probe_window_heat.update(
            [1, 2]
                .iter()
                .any(|&engine| self.pneumatic.engine_state(engine) == EngineState::On),
            lgcius[0].left_gear_extended(false) || lgcius[1].right_gear_extended(false),
        );

        self.egpws_electrical_harness.update(self.lgcius.lgciu1());
        self.predictive_terrain.update(
            context,
            &self.gps_1,
            self.adirs.ir_bus(1),
            self.adirs.adr_bus(1),
            self.lgcius.lgciu1(),
            self.radio_altimeters.radio_altimeter_1(),
            self.radio_altimeters.radio_altimeter_2(),
            self.egpws_electrical_harness.discrete_inputs(),
        );
        self.egpwc_2
            .set_predictive_outputs(*self.predictive_terrain.outputs());
        self.egpwc_2.update(
            context,
            &self.egpws_electrical_harness,
            self.radio_altimeters.radio_altimeter_1(),
            self.radio_altimeters.radio_altimeter_2(),
            self.adirs.adr_bus(1),
            self.adirs.ir_bus(1),
            &self.mmr_1,
        );
        // After the EGPWS: no terrain on the NDs with the TERR pb-sw OFF or TERR FAULT
        self.egpwc.update_with_predictive_functions(
            &self.adirs,
            self.lgcius.lgciu1(),
            self.egpws_electrical_harness
                .terrain_functions_available(&self.egpwc_2),
            PredictiveFunctionsLink {
                inputs_available: self.predictive_terrain.outputs().inputs_available,
                automatic_terrain_display: self
                    .egpwc_2
                    .discrete_outputs()
                    .capt_terrain_display_active,
            },
        );
    }
}
impl SimulationElement for A320 {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.adirs.accept(visitor);
        self.adirs_overhead.accept(visitor);
        self.air_conditioning.accept(visitor);
        self.aft_cargo_ventilation.accept(visitor);
        self.apu.accept(visitor);
        self.asu.accept(visitor);
        self.apu_fire_overhead.accept(visitor);
        self.apu_overhead.accept(visitor);
        self.payload.accept(visitor);
        self.airframe.accept(visitor);
        self.electrical_overhead.accept(visitor);
        self.emergency_electrical_overhead.accept(visitor);
        self.fuel.accept(visitor);
        self.pneumatic_overhead.accept(visitor);
        self.engine_1.accept(visitor);
        self.engine_2.accept(visitor);
        self.engine_fire_overhead.accept(visitor);
        self.engine_failures.accept(visitor);
        self.engine_oil_failures.accept(visitor);
        self.engine_fuel_filter_failures.accept(visitor);
        self.engine_monitoring_faults.accept(visitor);
        self.engine_malfunctions.accept(visitor);
        self.engine_control_failures.accept(visitor);
        self.fire_protection.accept(visitor);
        self.electrical.accept(visitor);
        self.power_consumption.accept(visitor);
        self.ext_pwr.accept(visitor);
        self.lgcius.accept(visitor);
        self.radio_altimeters.accept(visitor);
        self.gps_1.accept(visitor);
        self.gps_2.accept(visitor);
        self.gpirs.accept(visitor);
        self.autobrake_panel.accept(visitor);
        self.brake_fan_panel.accept(visitor);
        self.hydraulic.accept(visitor);
        self.hydraulic_overhead.accept(visitor);
        self.landing_gear.accept(visitor);
        self.pneumatic.accept(visitor);
        self.oxygen.accept(visitor);
        self.probe_window_heat.accept(visitor);
        self.tyre_pressure.accept(visitor);
        self.egpwc.accept(visitor);
        self.egpws_electrical_harness.accept(visitor);
        self.predictive_terrain.accept(visitor);
        self.egpwc_2.accept(visitor);
        self.mmr_1.accept(visitor);
        self.mmr_2.accept(visitor);
        self.reverse_thrust.accept(visitor);

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::time::Duration;
    use systems::failures::FailureType;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        InitContext,
    };
    use systems::surveillance::egpws::terrain_grid::{
        GridPosition, TerrainElevationSource, TerrainGrid, TerrainSample,
    };

    /// The whole aircraft on the ground, both engines running at ground idle (FADEC fuel flow at
    /// sea level, ISA: 298.6 kg/h).
    fn aircraft_with_engines_at_idle() -> SimulationTestBed<A320> {
        let mut test_bed = SimulationTestBed::new(|context: &mut InitContext| A320::new(context));
        test_bed.set_on_ground(true);
        for engine_number in 1..=2 {
            test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), true);
            test_bed.write_by_name(&format!("ENGINE_FF:{}", engine_number), 298.6);
            test_bed.write_by_name(&format!("ENGINE_STATE:{}", engine_number), 1.);
            test_bed.write_by_name(&format!("ENGINE_N2:{}", engine_number), 68.);
        }
        test_bed.run_with_delta(Duration::from_millis(50));
        test_bed
    }

    /// FCOM PRO-ABN-ENG: with the ENG FIRE pb pushed the engine shuts down "after a time delay" once
    /// the fuel between the LP valve and the nozzles is burned (fuel/engine_lp_valve.rs: about 99 s
    /// at a sea-level idle). The starvation must still cut the engine fuel (MSFS valve 13/14 and the
    /// FADEC) now that the engine failures share that cut (engine_failure.rs).
    #[test]
    fn the_eng_fire_pb_cuts_the_engine_fuel_after_the_residual_fuel_is_burned() {
        let mut test_bed = aircraft_with_engines_at_idle();
        test_bed.write_by_name("FIRE_BUTTON_ENG1", true);

        for _ in 0..(95 * 20) {
            test_bed.run_with_delta(Duration::from_millis(50));
        }
        let cut_before: bool = test_bed.read_by_name("ENGINE_1_FUEL_CUT");
        assert!(!cut_before, "the engine runs on its residual fuel");

        for _ in 0..(10 * 20) {
            test_bed.run_with_delta(Duration::from_millis(50));
        }
        let starved: bool = test_bed.read_by_name("FUEL_ENG_1_STARVED");
        let cut: bool = test_bed.read_by_name("ENGINE_1_FUEL_CUT");
        let other_cut: bool = test_bed.read_by_name("ENGINE_2_FUEL_CUT");
        assert!(starved);
        assert!(cut);
        assert!(!other_cut);
    }

    /// The fuel temperature model (fuel/fuel_temperature.rs) gets the engines of the aircraft: with
    /// both engines at idle on the ground, the IDG cooling fuel return warms the outer cells above
    /// the inner cells, and the wing cell temperatures are written for the SD and the FWC.
    #[test]
    fn the_idg_return_of_the_running_engines_warms_the_outer_cells() {
        let mut test_bed = aircraft_with_engines_at_idle();
        for (tank, gallons) in [
            ("LEFT MAIN", 1500.),
            ("RIGHT MAIN", 1500.),
            ("LEFT AUX", 228.),
            ("RIGHT AUX", 228.),
        ] {
            test_bed.write_by_name(&format!("FUEL TANK {} QUANTITY", tank), gallons);
        }
        // The four wing tank pumps run: the engines are not fed by gravity (which inhibits the return)
        for pump in [2, 3, 5, 6] {
            test_bed.write_by_name(&format!("FUELSYSTEM PUMP ACTIVE:{}", pump), true);
        }
        for _ in 0..(30 * 60) {
            test_bed.run_with_delta(Duration::from_secs(1));
        }

        for side in ["LEFT", "RIGHT"] {
            let outer: f64 =
                test_bed.read_by_name(&format!("FUEL_{}_OUTER_TANK_TEMPERATURE", side));
            let inner: f64 =
                test_bed.read_by_name(&format!("FUEL_{}_INNER_TANK_TEMPERATURE", side));
            assert!(
                outer > inner + 5.,
                "{} outer {} inner {}",
                side,
                outer,
                inner
            );
        }
    }

    /// FCOM PRO-ABN-FUEL FUEL APU LP VALVE FAULT: the flyPad failure 28011 (a320_systems_wasm) jams
    /// the APU LP fuel valve (fuel/apu_lp_valve.rs); jammed closed with the APU MASTER SW ON, it
    /// gives the fault and no fuel reaches the APU.
    #[test]
    fn the_apu_lp_valve_jammed_closed_gives_a_fault_and_starves_the_apu() {
        let mut test_bed = aircraft_with_engines_at_idle();
        test_bed.write_by_name("FUEL TANK LEFT MAIN QUANTITY", 1500.);
        test_bed.fail(FailureType::ApuLpValveJammed);
        test_bed.write_by_name("OVHD_APU_MASTER_SW_PB_IS_ON", true);
        for _ in 0..(5 * 20) {
            test_bed.run_with_delta(Duration::from_millis(50));
        }

        let fault: bool = test_bed.read_by_name("FUEL_APU_LP_VALVE_FAULT");
        assert!(fault);
        assert!(!test_bed.query(|a| a.fuel.apu_has_fuel()));
    }

    /// A320 FCOM DSC-49-10-20 FUEL SYSTEM (a320_fcom.txt l.60437-60439): the left fuel feed line supplies the APU,
    /// with the pressure of the tank pumps or else of the APU fuel pump (fuel/apu_fuel_feed.rs). Without electrical
    /// power neither runs: tank content alone does not feed the APU.
    #[test]
    fn without_a_powered_pump_the_apu_has_no_fuel_pressure_despite_the_tank_content() {
        let mut test_bed = SimulationTestBed::new(|context: &mut InitContext| A320::new(context));
        test_bed.set_on_ground(true);
        test_bed.write_by_name("FUEL TANK LEFT MAIN QUANTITY", 1500.);
        test_bed.write_by_name("OVHD_APU_MASTER_SW_PB_IS_ON", true);
        for _ in 0..(3 * 20) {
            test_bed.run_with_delta(Duration::from_millis(50));
        }

        assert!(test_bed.query(|a| a.fuel.left_inner_tank_has_fuel_remaining()));
        assert!(!test_bed.query(|a| a.fuel.apu_fuel_pump_runs()));
        assert!(!test_bed.query(|a| a.fuel.apu_has_fuel()));
    }

    /// The APU fuel pump starts with the APU MASTER SW ON when no tank pump runs (a320_fcom.txt l.60439, l.60560),
    /// powered by the AC ESS SHED bus or the static inverter (electrical/alternating_current.rs)
    #[test]
    fn with_the_tank_pumps_off_the_apu_fuel_pump_feeds_the_apu() {
        let mut test_bed = aircraft_with_engines_at_idle();
        test_bed.write_by_name("FUEL TANK LEFT MAIN QUANTITY", 1500.);
        test_bed.write_by_name("OVHD_APU_MASTER_SW_PB_IS_ON", true);
        for _ in 0..(3 * 20) {
            test_bed.run_with_delta(Duration::from_millis(50));
        }

        assert!(test_bed.query(|a| a.fuel.apu_fuel_pump_runs()));
        assert!(test_bed.query(|a| a.fuel.apu_has_fuel()));

        // A running left tank pump takes over: the APU fuel pump stops
        test_bed.write_by_name("FUELSYSTEM PUMP ACTIVE:2", true);
        for _ in 0..(3 * 20) {
            test_bed.run_with_delta(Duration::from_millis(50));
        }
        assert!(!test_bed.query(|a| a.fuel.apu_fuel_pump_runs()));
        assert!(test_bed.query(|a| a.fuel.apu_has_fuel()));
    }

    /// The flyPad oil failures 79000-79031 (a320_systems_wasm) reach the FADEC through the oil
    /// failure variables of each engine (systems::engine::oil_failure).
    #[test]
    fn the_engine_oil_failures_are_written_for_the_fadec() {
        let mut test_bed = aircraft_with_engines_at_idle();
        test_bed.fail(FailureType::EngineOilLeak(1));
        test_bed.fail(FailureType::EngineOilFilterClog(2));
        test_bed.fail(FailureType::EngineOilOverheat(2));
        test_bed.run_with_delta(Duration::from_millis(50));

        let read = |test_bed: &mut SimulationTestBed<A320>, name: &str| -> bool {
            test_bed.read_by_name(name)
        };
        assert!(read(&mut test_bed, "ENGINE_1_OIL_LEAK"));
        assert!(!read(&mut test_bed, "ENGINE_2_OIL_LEAK"));
        assert!(read(&mut test_bed, "ENGINE_2_OIL_FILTER_CLOGGED"));
        assert!(!read(&mut test_bed, "ENGINE_1_OIL_FILTER_CLOGGED"));
        assert!(read(&mut test_bed, "ENGINE_2_OIL_OVERHEAT"));
        assert!(!read(&mut test_bed, "ENGINE_1_OIL_OVERHEAT"));
    }

    /// The FADEC faults of the FCOM gap batch T2-37 (A320 FCOM PRO-ABN-ENG FUEL CTL FAULT, FUEL
    /// RETURN VALVE, CTL VALVE FAULT, COMPRESSOR VANE, BLEED STATUS FAULT, REV INHIBITED, REV ISOL
    /// FAULT) are A320 faults: each flyPad failure writes the variable of its engine for the FWC.
    #[test]
    fn the_t2_37_fadec_faults_are_written_for_the_fwc() {
        let kinds = [
            EngineMonitoringFaultKind::FuelMeteringValve,
            EngineMonitoringFaultKind::FuelReturnValveFailedClosed,
            EngineMonitoringFaultKind::FuelReturnValveFailedOpen,
            EngineMonitoringFaultKind::ClearanceControlValves,
            EngineMonitoringFaultKind::CompressorVanes,
            EngineMonitoringFaultKind::CompressorVaneChannel,
            EngineMonitoringFaultKind::BleedValveStatus,
            EngineMonitoringFaultKind::ReverserInhibited,
            EngineMonitoringFaultKind::ReverserShutoffValve,
        ];
        for kind in kinds {
            let mut test_bed = aircraft_with_engines_at_idle();
            test_bed.fail(FailureType::EngineMonitoringFault(2, kind));
            test_bed.run_with_delta(Duration::from_millis(50));

            let failed: bool = test_bed.read_by_name(&format!("ENGINE_2_{}", kind.variable_name()));
            let other: bool = test_bed.read_by_name(&format!("ENGINE_1_{}", kind.variable_name()));
            assert!(failed, "{:?}", kind);
            assert!(!other, "{:?}", kind);
        }
    }

    /// ENG 1(2) REV INHIBITED (A320 FCOM PRO-ABN-ENG l.80700): the reverser inhibited by
    /// maintenance action gets the deployment inhibition of the hydraulic A320ReverserController
    /// (its deploy authorization, tested in hydraulic), the other reverser does not.
    #[test]
    fn the_reverser_inhibited_by_maintenance_gets_the_deployment_inhibition() {
        let mut test_bed = aircraft_with_engines_at_idle();
        assert_eq!(
            test_bed.query(|a| a.reversers_deployment_inhibited()),
            [false, false]
        );

        test_bed.fail(FailureType::EngineMonitoringFault(
            1,
            EngineMonitoringFaultKind::ReverserInhibited,
        ));
        test_bed.run_with_delta(Duration::from_millis(50));
        assert_eq!(
            test_bed.query(|a| a.reversers_deployment_inhibited()),
            [true, false]
        );
    }

    /// The flyPad fuel filter clog failures 73100-73101 (a320_systems_wasm) reach the SD ENGINE page
    /// and the FWC through the fuel filter variable of each engine (systems::engine::fuel_filter_failure).
    #[test]
    fn the_engine_fuel_filter_clog_is_written_for_the_sd_and_the_fwc() {
        let mut test_bed = aircraft_with_engines_at_idle();
        test_bed.fail(FailureType::EngineFuelFilterClog(2));
        test_bed.run_with_delta(Duration::from_millis(50));

        let clogged_2: bool = test_bed.read_by_name("ENGINE_2_FUEL_FILTER_CLOGGED");
        let clogged_1: bool = test_bed.read_by_name("ENGINE_1_FUEL_FILTER_CLOGGED");
        assert!(clogged_2);
        assert!(!clogged_1);
    }

    /// The A320 engine malfunctions (engine_malfunction.rs) are part of the aircraft: a stall of
    /// engine 1 at climb thrust is detected and loses N1 on engine 1 only, and the vibration
    /// failure takes the N1 vibration above the 6 units of the VIB advisory at climb thrust.
    #[test]
    fn an_engine_1_stall_at_climb_thrust_loses_n1_on_engine_1_only() {
        let mut test_bed = aircraft_with_engines_at_idle();
        for engine_number in 1..=2 {
            test_bed.write_by_name(&format!("TURB ENG N1:{}", engine_number), 88.);
            test_bed.write_by_name(&format!("TURB ENG N2:{}", engine_number), 97.);
            test_bed.write_by_name(&format!("AUTOTHRUST_N1_COMMANDED:{}", engine_number), 88.);
        }
        test_bed.fail(FailureType::EngineCompressorStall(1));
        test_bed.fail(FailureType::EngineHighVibration(1));
        for _ in 0..(30 * 20) {
            test_bed.run_with_delta(Duration::from_millis(50));
        }

        let stall_1: bool = test_bed.read_by_name("ENGINE_1_STALL");
        let stall_2: bool = test_bed.read_by_name("ENGINE_2_STALL");
        let loss_1: f64 = test_bed.read_by_name("ENGINE_1_STALL_N1_LOSS");
        let loss_2: f64 = test_bed.read_by_name("ENGINE_2_STALL_N1_LOSS");
        let vibration_1: f64 = test_bed.read_by_name("ENGINE_1_N1_VIBRATION");
        let vibration_2: f64 = test_bed.read_by_name("ENGINE_2_N1_VIBRATION");
        assert!(stall_1);
        assert!(!stall_2);
        assert!(loss_1 > 14.);
        assert!(loss_2 < 0.01);
        assert!(vibration_1 >= 6.);
        assert!(vibration_2 < 6.);
    }

    /// A terrain grid that records the aircraft positions it is advanced with.
    struct RecordingTerrainGrid {
        positions: Rc<RefCell<Vec<GridPosition>>>,
    }
    impl TerrainElevationSource for RecordingTerrainGrid {
        fn max_elevation_at(&self, _position: GridPosition) -> TerrainSample {
            TerrainSample::NotLoaded
        }
    }
    impl TerrainGrid for RecordingTerrainGrid {
        fn update(&mut self, _delta: Duration, aircraft: GridPosition) {
            self.positions.borrow_mut().push(aircraft);
        }
    }

    /// The terrain grid cache only loads blocks around the aircraft when it is advanced every update with the GPS
    /// position, and the position is only known once the GPS and the inertial reference are valid.
    #[test]
    fn the_terrain_grid_is_advanced_every_update_with_the_valid_gps_position() {
        let positions = Rc::new(RefCell::new(Vec::new()));
        let grid_positions = Rc::clone(&positions);
        let mut test_bed = SimulationTestBed::new(move |context: &mut InitContext| {
            A320::new_with_terrain_grid(
                context,
                Box::new(RecordingTerrainGrid {
                    positions: Rc::clone(&grid_positions),
                }),
            )
        });
        test_bed.set_on_ground(true);
        test_bed.run_with_delta(Duration::from_millis(50));
        assert!(positions.borrow().is_empty());

        test_bed.write_by_name("EXT_PWR_AVAIL:1", true);
        test_bed.write_by_name("OVHD_ELEC_EXT_PWR_PB_IS_ON", true);
        test_bed.write_by_name("PLANE LATITUDE", 35.55);
        test_bed.write_by_name("PLANE LONGITUDE", 139.76);
        test_bed.write_by_name("PLANE ALTITUDE", 20.);
        for ir in 1..=3 {
            test_bed.write_by_name(&format!("OVHD_ADIRS_IR_{ir}_MODE_SELECTOR_KNOB"), 1.);
        }
        for _ in 0..600 {
            test_bed.run_with_delta(Duration::from_secs(1));
        }
        let updates_before_last_cycle = positions.borrow().len();
        test_bed.run_with_delta(Duration::from_secs(1));

        let positions = positions.borrow();
        assert_eq!(positions.len(), updates_before_last_cycle + 1);
        let last = positions.last().expect("the grid was advanced");
        assert!((last.latitude_degrees - 35.55).abs() < 0.01);
        assert!((last.longitude_degrees - 139.76).abs() < 0.01);
    }

    /// PFD1 shows ILS1 (MMR 1, sim NAV 3), PFD2 shows ILS2 (MMR 2, sim NAV 4): A320 FCOM
    /// DSC-34-NAV-30-20 (a320_fcom.txt l.53282-53289).
    #[test]
    fn each_mmr_writes_the_deviations_of_its_own_ils_receiver() {
        let mut test_bed = SimulationTestBed::new(|context: &mut InitContext| A320::new(context));
        test_bed.set_on_ground(true);
        test_bed.write_by_name("NAV HAS GLIDE SLOPE:3", false);
        test_bed.write_by_name("NAV GLIDE SLOPE ERROR:3", 0.);
        test_bed.write_by_name("NAV HAS GLIDE SLOPE:4", true);
        test_bed.write_by_name("NAV GLIDE SLOPE ERROR:4", 0.25);
        test_bed.run_with_delta(Duration::from_millis(50));

        let mmr_1_valid: bool = test_bed.read_by_name("MMR_1_GS_IS_VALID");
        let mmr_2_valid: bool = test_bed.read_by_name("MMR_2_GS_IS_VALID");
        let mmr_2_deviation: f64 = test_bed.read_by_name("MMR_2_GS_DEVIATION");
        assert!(!mmr_1_valid);
        assert!(mmr_2_valid);
        assert!((mmr_2_deviation - 0.25).abs() < 1e-9);
    }
}
