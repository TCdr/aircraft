use core::panic;
use std::{f64::consts::PI, time::Duration};

use uom::si::{
    f64::*,
    mass_rate::kilogram_per_second,
    pressure::psi,
    ratio::{percent, ratio},
    thermodynamic_temperature::degree_celsius,
    volume::{cubic_meter, gallon},
};

use systems::{
    accept_iterable,
    air_conditioning::PackFlowControllers,
    engine::engine_start::{starter_can_engage, EngineStartValveSupervision},
    failures::{Failure, FailureType},
    overhead::{AutoOffFaultPushButton, OnOffFaultPushButton},
    pneumatic::{
        valve::*, BleedMonitoringComputerIsAliveSignal, CompressionChamber,
        ControllablePneumaticValve, CrossBleedValveSelectorKnob, CrossBleedValveSelectorMode,
        DifferentialPressureTransducer, EngineCompressionChamberController, EngineModeSelector,
        EngineState, PneumaticContainer, PneumaticPipe, PneumaticValveSignal, Precooler,
        PressureTransducer, PressurisedReservoirWithExhaustValve, PressurizeableReservoir,
        TargetPressureTemperatureSignal, VariableVolumeContainer,
    },
    shared::{
        pid::PidController, update_iterator::MaxStepLoop, ControllerSignal, DelayedFalseLogicGate,
        DelayedTrueLogicGate, ElectricalBusType, ElectricalBuses, EngineBleedPushbutton,
        EngineCorrectedN1, EngineCorrectedN2, EngineFirePushButtons, EngineStartState,
        HydraulicColor, PackFlowValveState, PneumaticBleed, PneumaticValve, ReservoirAirPressure,
    },
    simulation::{
        InitContext, Read, Reader, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

use crate::{air_conditioning::A380AirConditioning, engine_failure::A380RelightEnvelope};

macro_rules! valve_signal_implementation {
    ($signal_type: ty) => {
        impl PneumaticValveSignal for $signal_type {
            fn new(target_open_amount: Ratio) -> Self {
                Self { target_open_amount }
            }

            fn target_open_amount(&self) -> Ratio {
                self.target_open_amount
            }
        }
    };
}

struct HighPressureValveSignal {
    target_open_amount: Ratio,
}

struct PressureRegulatingValveSignal {
    target_open_amount: Ratio,
}

struct EngineStarterValveSignal {
    target_open_amount: Ratio,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum CrossBleedValveSignalType {
    Manual,
    Automatic,
}

struct CrossBleedValveSignal {
    target_open_amount: Ratio,
    signal_type: CrossBleedValveSignalType,
}
impl CrossBleedValveSignal {
    fn new(target_open_amount: Ratio, signal_type: CrossBleedValveSignalType) -> Self {
        Self {
            target_open_amount,
            signal_type,
        }
    }

    fn target_open_amount(&self) -> Ratio {
        self.target_open_amount
    }

    fn new_open(signal_type: CrossBleedValveSignalType) -> Self {
        Self::new(Ratio::new::<ratio>(1.), signal_type)
    }

    fn new_closed(signal_type: CrossBleedValveSignalType) -> Self {
        Self::new(Ratio::new::<ratio>(0.), signal_type)
    }
}

struct FanAirValveSignal {
    target_open_amount: Ratio,
}

/// The command of the APU isolation valve (see A380Pneumatic::update_physics)
struct ApuIsolationValveSignal {
    target_open_amount: Ratio,
}

valve_signal_implementation!(HighPressureValveSignal);
valve_signal_implementation!(PressureRegulatingValveSignal);
valve_signal_implementation!(EngineStarterValveSignal);
valve_signal_implementation!(FanAirValveSignal);
valve_signal_implementation!(ApuIsolationValveSignal);

pub struct A380Pneumatic {
    physics_updater: MaxStepLoop,

    apu_bleed_air_valve_open_id: VariableIdentifier,
    apu_bleed_air_pressure_id: VariableIdentifier,

    core_processing_input_output_module_a: CoreProcessingInputOutputModuleA,
    engine_systems: [EngineBleedAirSystem; 4],
    leak_detection: BleedLeakDetection,
    /// The CPIOM-A bleed monitoring of each engine (CoreProcessingInputOutputModuleAUnit)
    overheat_ids: [VariableIdentifier; 4],
    overpressure_ids: [VariableIdentifier; 4],
    bleed_valve_disagree_ids: [VariableIdentifier; 4],

    cross_bleed_valves: [CrossBleedValve; 3],
    /// The CPIOM-A1 to A4 are available (avionics network): the crossbleed valves follow the X
    /// BLEED AUTO logic of their CPIOM-A pair (cross_bleed_valve_command)
    cpiom_a_available: [bool; 4],
    /// The left, center and right crossbleed valves no longer get the AUTO logic: both CPIOM-A of
    /// their pair are lost (AIR XBLEED FAULT, "Is no longer controlled automatically by the bleed
    /// controller", PRO-ABN a380_fcom.txt l.169012-169022)
    cross_bleed_valve_automatic_control_lost: [bool; 3],
    cross_bleed_valve_automatic_control_lost_ids: [VariableIdentifier; 3],

    fadec: FullAuthorityDigitalEngineControl,
    engine_starter_valve_controllers: [EngineStarterValveController; 4],

    apu_compression_chamber: CompressionChamber,
    apu_bleed_air_valve: DefaultValve,
    /// flyPad failure: hot air leaks from the APU bleed duct (AIR APU BLEED LEAK)
    apu_bleed_leak: Failure,

    /// The HP ground air (A380 FCOM DSC-36-10-40, a380_fcom.txt l.94031-94039): the ground cart
    /// on the HP ground connectors (flyPad ground services, L:A32NX_ASU_TURNED_ON) feeds the bleed
    /// ducts through the non-return valve of its connector
    hp_ground_air_compression_chamber: CompressionChamber,
    hp_ground_air_non_return_valve: PurelyPneumaticValve,

    /// flyPad failures: hot air leaks from the hot-air ducts of the hot-air valve 1 and 2, and from
    /// the forward cargo duct (on HOT AIR 1). The ducts are in the air conditioning model: the leak
    /// only blows the air of the open hot-air valve on its detection loops (the lost air is not
    /// simulated).
    hot_air_duct_leaks: [Failure; 2],
    fwd_cargo_duct_leak: Failure,
    /// The hot-air valves 1 and 2 are open (the air conditioning, previous update)
    hot_air_valves_open: [bool; 2],

    hydraulic_reservoir_bleed_air_valves: [PurelyPneumaticValve; 2],
    hydraulic_reservoir_bleed_air_pipe: PneumaticPipe,

    green_hydraulic_reservoir_with_valve:
        PressurisedReservoirWithExhaustValve<VariableVolumeContainer>,
    yellow_hydraulic_reservoir_with_valve:
        PressurisedReservoirWithExhaustValve<VariableVolumeContainer>,

    packs: [PackComplex; 2],
}
impl A380Pneumatic {
    const PNEUMATIC_SIM_MAX_TIME_STEP: Duration = Duration::from_millis(100);

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            physics_updater: MaxStepLoop::new(Self::PNEUMATIC_SIM_MAX_TIME_STEP),
            apu_bleed_air_valve_open_id: context
                .get_identifier("APU_BLEED_AIR_VALVE_OPEN".to_owned()),
            apu_bleed_air_pressure_id: context
                .get_identifier("PNEU_APU_BLEED_CONTAINER_PRESSURE".to_owned()),
            core_processing_input_output_module_a: CoreProcessingInputOutputModuleA::new(
                ElectricalBusType::DirectCurrentEssential, // TTM 2
            ),
            engine_systems: [
                EngineBleedAirSystem::new(context, 1, ElectricalBusType::DirectCurrent(1)),
                EngineBleedAirSystem::new(context, 2, ElectricalBusType::DirectCurrent(1)),
                EngineBleedAirSystem::new(context, 3, ElectricalBusType::DirectCurrent(2)),
                EngineBleedAirSystem::new(context, 4, ElectricalBusType::DirectCurrent(2)),
            ],
            leak_detection: BleedLeakDetection::new(context),
            overheat_ids: [1, 2, 3, 4]
                .map(|engine| context.get_identifier(format!("PNEU_ENG_{}_OVERHEAT", engine))),
            overpressure_ids: [1, 2, 3, 4]
                .map(|engine| context.get_identifier(format!("PNEU_ENG_{}_OVERPRESSURE", engine))),
            bleed_valve_disagree_ids: [1, 2, 3, 4].map(|engine| {
                context.get_identifier(format!("PNEU_ENG_{}_PR_VALVE_DISAGREE", engine))
            }),
            cross_bleed_valves: [
                CrossBleedValve::new(context.get_identifier("PNEU_XBLEED_VALVE_L_OPEN".to_owned())),
                CrossBleedValve::new(context.get_identifier("PNEU_XBLEED_VALVE_C_OPEN".to_owned())),
                CrossBleedValve::new(context.get_identifier("PNEU_XBLEED_VALVE_R_OPEN".to_owned())),
            ],
            cpiom_a_available: [true; 4],
            cross_bleed_valve_automatic_control_lost: [false; 3],
            cross_bleed_valve_automatic_control_lost_ids: ["L", "C", "R"].map(|valve| {
                context.get_identifier(format!("PNEU_XBLEED_VALVE_{}_AUTO_CONTROL_LOST", valve))
            }),
            fadec: FullAuthorityDigitalEngineControl::new(context),
            engine_starter_valve_controllers: [
                EngineStarterValveController::new(context, 1),
                EngineStarterValveController::new(context, 2),
                EngineStarterValveController::new(context, 3),
                EngineStarterValveController::new(context, 4),
            ],
            apu_compression_chamber: CompressionChamber::new(Volume::new::<cubic_meter>(5.)),
            apu_bleed_air_valve: DefaultValve::new_closed(),
            apu_bleed_leak: Failure::new(FailureType::ApuBleedLeak),
            // Design choice: the volume of the APU compression chamber
            hp_ground_air_compression_chamber: CompressionChamber::new(Volume::new::<cubic_meter>(
                5.,
            )),
            hp_ground_air_non_return_valve: PurelyPneumaticValve::new(),
            hot_air_duct_leaks: [1, 2]
                .map(|number| Failure::new(FailureType::HotAirDuctLeak(number))),
            fwd_cargo_duct_leak: Failure::new(FailureType::FwdCargoBleedDuctLeak),
            hot_air_valves_open: [false; 2],
            hydraulic_reservoir_bleed_air_valves: [
                PurelyPneumaticValve::new(),
                PurelyPneumaticValve::new(),
            ],
            hydraulic_reservoir_bleed_air_pipe: PneumaticPipe::new(
                Volume::new::<cubic_meter>(0.2),
                Pressure::new::<psi>(14.7),
                ThermodynamicTemperature::new::<degree_celsius>(15.),
            ),
            green_hydraulic_reservoir_with_valve: PressurisedReservoirWithExhaustValve::new(
                context,
                HydraulicColor::Green,
                VariableVolumeContainer::new(
                    Volume::new::<gallon>(14.),
                    Pressure::new::<psi>(65.3),
                    ThermodynamicTemperature::new::<degree_celsius>(15.),
                ),
                Pressure::new::<psi>(75.42),
                6e-2,
            ),
            yellow_hydraulic_reservoir_with_valve: PressurisedReservoirWithExhaustValve::new(
                context,
                HydraulicColor::Yellow,
                VariableVolumeContainer::new(
                    Volume::new::<gallon>(14.),
                    Pressure::new::<psi>(65.),
                    ThermodynamicTemperature::new::<degree_celsius>(15.),
                ),
                Pressure::new::<psi>(75.42),
                6e-2,
            ),
            packs: [PackComplex::new(context, 1), PackComplex::new(context, 2)],
        }
    }

    pub(crate) fn update(
        &mut self,
        context: &UpdateContext,
        engines: [&(impl EngineCorrectedN1 + EngineCorrectedN2); 4],
        pneumatic_overhead_panel: &A380PneumaticOverheadPanel,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        apu: &impl ControllerSignal<TargetPressureTemperatureSignal>,
        hp_ground_air: &impl ControllerSignal<TargetPressureTemperatureSignal>,
        pack_flow_valve_signals: &impl PackFlowControllers,
        cpiom_a_available: [bool; 4],
        hot_air_valves_open: [bool; 2],
    ) {
        self.cpiom_a_available = cpiom_a_available;
        self.hot_air_valves_open = hot_air_valves_open;
        self.physics_updater.update(context);

        for cur_time_step in self.physics_updater {
            self.update_physics(
                &context.with_delta(cur_time_step),
                engines,
                pneumatic_overhead_panel,
                engine_fire_push_buttons,
                apu,
                hp_ground_air,
                pack_flow_valve_signals,
            );
        }
    }

    pub(crate) fn update_physics(
        &mut self,
        context: &UpdateContext,
        engines: [&(impl EngineCorrectedN1 + EngineCorrectedN2); 4],
        overhead_panel: &A380PneumaticOverheadPanel,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        apu: &impl ControllerSignal<TargetPressureTemperatureSignal>,
        hp_ground_air: &impl ControllerSignal<TargetPressureTemperatureSignal>,
        pack_flow_valve_signals: &impl PackFlowControllers,
    ) {
        self.apu_compression_chamber.update(apu);
        self.hp_ground_air_compression_chamber.update(hp_ground_air);

        // The start valve commands come first: the crossbleed AUTO control opens the crossbleed
        // valves for an engine start in the same step (see CoreProcessingInputOutputModuleAUnit)
        for controller in self.engine_starter_valve_controllers.iter_mut() {
            controller.update(context, &self.fadec);
        }
        let engine_start_valves_commanded_open = self
            .engine_starter_valve_controllers
            .each_ref()
            .map(|controller| controller.is_commanded_open());

        self.leak_detection
            .update(&self.engine_systems, overhead_panel);
        // The air a hot-air duct leak blows: the hot-air valve n takes the bleed air of the side of
        // pack n (engines 1-2, 3-4), and its ducts are pressurised while it is open
        let hot_air_valves_open = self.hot_air_valves_open;
        let engine_systems = &self.engine_systems;
        let hot_air_duct_air = |number: usize, leak: &Failure| {
            if leak.is_active() && hot_air_valves_open[number - 1] {
                side_bleed_air_temperature(
                    context,
                    [
                        &engine_systems[2 * number - 2],
                        &engine_systems[2 * number - 1],
                    ],
                )
            } else {
                None
            }
        };
        let hot_air_duct_leaking_air =
            [1, 2].map(|number| hot_air_duct_air(number, &self.hot_air_duct_leaks[number - 1]));
        let fwd_cargo_duct_leaking_air = hot_air_duct_air(1, &self.fwd_cargo_duct_leak);
        self.leak_detection.update_other_zones(
            overhead_panel,
            leaking_air_temperature(
                context,
                self.apu_bleed_leak.is_active() && self.apu_bleed_air_valve.is_open(),
                &self.apu_compression_chamber,
            ),
            self.packs
                .each_ref()
                .map(|pack| pack.bay_leaking_air_temperature()),
            hot_air_duct_leaking_air,
            fwd_cargo_duct_leaking_air,
        );

        // The APU isolation valve "operates simultaneously with the APU bleed valve" (A380 FCOM
        // DSC-36-10-30, a380_fcom.txt l.93986-93988): the model has one valve for both, that the APU
        // ECB commands. An APU bleed leak closes them (l.94205-94207): the ECB closes the APU bleed
        // valve (lib.rs), and the isolation valve closes here.
        if self.leak_detection.apu_leak() {
            self.apu_bleed_air_valve
                .update_open_amount::<ApuIsolationValveSignal, _>(&FixedValveCommand(
                    Ratio::default(),
                ));
        }

        let cross_bleed_valves_open = self
            .cross_bleed_valves
            .each_ref()
            .map(|valve| valve.is_open());
        self.core_processing_input_output_module_a.update(
            context,
            &self.engine_systems,
            &self.apu_bleed_air_valve,
            overhead_panel,
            engine_fire_push_buttons,
            engine_start_valves_commanded_open,
            &self.leak_detection,
            cross_bleed_valves_open,
        );

        let cross_bleed_valves_closed_by_leak = self.leak_detection.cross_bleed_valves_to_close();
        for (index, (cross_bleed_valve, closed_by_leak)) in self
            .cross_bleed_valves
            .iter_mut()
            .zip(cross_bleed_valves_closed_by_leak)
            .enumerate()
        {
            let (signal, automatic_control_lost) = cross_bleed_valve_command(
                &self.core_processing_input_output_module_a.units,
                self.cpiom_a_available,
                index,
                overhead_panel.cross_bleed_mode(),
            );
            self.cross_bleed_valve_automatic_control_lost[index] = automatic_control_lost;
            cross_bleed_valve
                .update_open_amount(&CrossBleedValveCommand::new(signal, closed_by_leak))
        }

        for (index, (engine_system, cpiom_unit)) in self
            .engine_systems
            .iter_mut()
            .zip(&self.core_processing_input_output_module_a.units)
            .enumerate()
        {
            engine_system.update(
                context,
                cpiom_unit,
                cpiom_unit,
                &self.engine_starter_valve_controllers[index],
                cpiom_unit,
                engines[index],
            );
        }

        let [engine_1_system, engine_2_system, engine_3_system, engine_4_system] =
            &mut self.engine_systems;
        self.apu_bleed_air_valve.update_move_fluid(
            context,
            &mut self.apu_compression_chamber,
            engine_1_system,
        );
        // Design choice (the FCOM gives no duct layout): the HP ground connectors join the bleed
        // system where the APU duct does, on the engine 1 duct of the model. The ground air start
        // procedure starts "ENGINE 1 OR 2" first (PRO-SUP-70-10, a380_fcom.txt l.180938-180950);
        // the crossbleed valves open at AUTO for the start of any engine on the ground.
        self.hp_ground_air_non_return_valve.update_move_fluid(
            context,
            &mut self.hp_ground_air_compression_chamber,
            engine_1_system,
        );

        // Hydraulic reservoir pressurization.
        // G+Y are pressurized through a pipe that is shared between engine 1 and engine 4 systems (downstream the bleed valve)
        // G+Y are also pressurized very directly:
        // Green is pressurized from upstream engine 1 HP valve
        // Yellow is pressurized from upstream engine 4 HP valve
        self.hydraulic_reservoir_bleed_air_valves[0].update_move_fluid(
            context,
            engine_1_system,
            &mut self.hydraulic_reservoir_bleed_air_pipe,
        );
        self.hydraulic_reservoir_bleed_air_valves[1].update_move_fluid(
            context,
            engine_4_system,
            &mut self.hydraulic_reservoir_bleed_air_pipe,
        );

        self.green_hydraulic_reservoir_with_valve
            .update_flow_through_valve(context, &mut self.hydraulic_reservoir_bleed_air_pipe);
        self.yellow_hydraulic_reservoir_with_valve
            .update_flow_through_valve(context, &mut self.hydraulic_reservoir_bleed_air_pipe);

        self.green_hydraulic_reservoir_with_valve
            .update_flow_through_valve(
                context,
                &mut engine_1_system.high_pressure_compression_chamber,
            );
        self.yellow_hydraulic_reservoir_with_valve
            .update_flow_through_valve(
                context,
                &mut engine_4_system.high_pressure_compression_chamber,
            );

        let [left_cross_bleed_valve, center_cross_bleed_valve, right_cross_bleed_valve] =
            &mut self.cross_bleed_valves;

        left_cross_bleed_valve.update_move_fluid(context, engine_1_system, engine_2_system);
        center_cross_bleed_valve.update_move_fluid(context, engine_1_system, engine_4_system);
        right_cross_bleed_valve.update_move_fluid(context, engine_3_system, engine_4_system);

        // PACKS
        let [pack_1, pack_2] = &mut self.packs;
        pack_1.update(
            context,
            engine_1_system,
            engine_2_system,
            pack_flow_valve_signals,
        );
        pack_2.update(
            context,
            engine_3_system,
            engine_4_system,
            pack_flow_valve_signals,
        );

        // The bleed duct of an engine that is not running, with no air source connected to it,
        // empties (see engine_ducts_without_air_source)
        let engine_running =
            [1, 2, 3, 4].map(|number| self.fadec.engine_state(number) == EngineState::On);
        let cross_bleed_valves_open = self
            .cross_bleed_valves
            .each_ref()
            .map(|valve| valve.is_open());
        // The APU and the HP ground air both feed the engine 1 duct
        let ducts_to_vent = engine_ducts_without_air_source(
            engine_running,
            self.apu_bleed_air_valve.is_open() || self.hp_ground_air_non_return_valve.is_open(),
            cross_bleed_valves_open,
        );
        for (engine_system, vent) in self.engine_systems.iter_mut().zip(ducts_to_vent) {
            if vent {
                engine_system.vent_bleed_duct(context);
            }
        }
    }

    // TODO: Returning a mutable reference here is not great. I was running into an issue with the update order:
    // - The APU turbine must know about the bleed valve being open as soon as possible to update EGT properly
    // - To open the bleed valve, we need a signal from the ecb
    // - To get a signal from the ECB to open the bleed valve, we have to update the APU.
    // For now, we just pass over control of the bleed valve to the APU, so it can be updated after the ECB update but before the turbine update.
    pub fn apu_bleed_air_valve(&mut self) -> &mut impl ControllablePneumaticValve {
        &mut self.apu_bleed_air_valve
    }

    pub fn update_hydraulic_reservoir_spatial_volumes(
        &mut self,
        green_hydraulic_reservoir: &impl PressurizeableReservoir,
        yellow_hydraulic_reservoir: &impl PressurizeableReservoir,
    ) {
        self.green_hydraulic_reservoir_with_valve
            .change_spatial_volume(green_hydraulic_reservoir.available_volume());
        self.yellow_hydraulic_reservoir_with_valve
            .change_spatial_volume(yellow_hydraulic_reservoir.available_volume());
    }

    pub fn packs(&mut self) -> &mut [PackComplex; 2] {
        &mut self.packs
    }

    /// The FAULT light of the ENG 1(2)(3)(4) BLEED pb-sw (FCOM DSC-36-20 l.94277-94291)
    pub fn engine_bleed_fault(&self, engine_number: usize) -> bool {
        self.core_processing_input_output_module_a.units[engine_number - 1].has_fault()
    }

    /// A leak is detected in the APU bleed duct: the APU bleed valve closes (the APU ECB input,
    /// lib.rs) and the APU BLEED pb-sw FAULT light comes on (AIR APU BLEED LEAK, PRO-ABN
    /// a380_fcom.txt l.167752-167796)
    pub fn apu_bleed_leak(&self) -> bool {
        self.leak_detection.apu_leak()
    }

    /// The bleed duct pressure of engine n (from 1), downstream of its precooler: the air of the wing anti-ice
    /// (ice_rain_protection.rs)
    pub fn bleed_duct_pressure(&self, engine_number: usize) -> Pressure {
        self.engine_systems[engine_number - 1].pressure()
    }

    /// The HP compressor pressure of engine n (from 1): the air of its engine anti-ice (ice_rain_protection.rs)
    pub fn high_pressure_compressor_pressure(&self, engine_number: usize) -> Pressure {
        self.engine_systems[engine_number - 1]
            .high_pressure_compression_chamber
            .pressure()
    }
}
impl PneumaticBleed for A380Pneumatic {
    fn apu_bleed_is_on(&self) -> bool {
        self.apu_bleed_air_valve.is_open()
    }
    fn engine_crossbleed_is_on(&self) -> bool {
        // TODO: Change this interface. The air conditioning system needs to know the crossbleed valve state. I don't know how it works in the 380.
        self.cross_bleed_valves[1].is_open()
    }
    fn pack_valves_closed_by_leak(&self, pack_number: usize) -> bool {
        self.leak_detection.pack_leak(pack_number)
    }
    fn hot_air_valve_closed_by_leak(&self, hot_air_number: usize) -> bool {
        self.leak_detection.hot_air_leak(hot_air_number)
    }
}
impl EngineStartState for A380Pneumatic {
    fn engine_state(&self, engine_number: usize) -> EngineState {
        self.fadec.engine_state(engine_number)
    }
    fn engine_mode_selector(&self) -> EngineModeSelector {
        self.fadec.engine_mode_selector()
    }
}
impl PackFlowValveState for A380Pneumatic {
    // fcv_id: 1, 2, 3 or 4
    fn pack_flow_valve_is_open(&self, fcv_id: usize) -> bool {
        let id = A380AirConditioning::fcv_to_pack_id(fcv_id);
        if fcv_id.is_multiple_of(2) {
            self.packs[id].right_pack_flow_valve_is_open()
        } else {
            self.packs[id].left_pack_flow_valve_is_open()
        }
    }
    fn pack_flow_valve_air_flow(&self, fcv_id: usize) -> MassRate {
        let id = A380AirConditioning::fcv_to_pack_id(fcv_id);
        if fcv_id.is_multiple_of(2) {
            self.packs[id].right_pack_flow_valve_air_flow()
        } else {
            self.packs[id].left_pack_flow_valve_air_flow()
        }
    }
    fn pack_flow_valve_inlet_pressure(&self, fcv_id: usize) -> Option<Pressure> {
        let id = A380AirConditioning::fcv_to_pack_id(fcv_id);
        if fcv_id.is_multiple_of(2) {
            self.packs[id].right_pack_flow_valve_inlet_pressure()
        } else {
            self.packs[id].left_pack_flow_valve_inlet_pressure()
        }
    }
}
impl SimulationElement for A380Pneumatic {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.fadec.accept(visitor);

        accept_iterable!(self.engine_starter_valve_controllers, visitor);
        accept_iterable!(self.cross_bleed_valves, visitor);
        accept_iterable!(self.engine_systems, visitor);
        accept_iterable!(self.packs, visitor);
        self.leak_detection.accept(visitor);
        self.apu_bleed_leak.accept(visitor);
        accept_iterable!(self.hot_air_duct_leaks, visitor);
        self.fwd_cargo_duct_leak.accept(visitor);

        self.yellow_hydraulic_reservoir_with_valve.accept(visitor);
        self.green_hydraulic_reservoir_with_valve.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.apu_bleed_air_valve_open_id,
            self.apu_bleed_air_valve.is_open(),
        );
        writer.write(
            &self.apu_bleed_air_pressure_id,
            self.apu_compression_chamber.pressure(),
        );
        for (index, unit) in self
            .core_processing_input_output_module_a
            .units
            .iter()
            .enumerate()
        {
            writer.write(&self.overheat_ids[index], unit.has_overheat());
            writer.write(&self.overpressure_ids[index], unit.has_overpressure());
            writer.write(
                &self.bleed_valve_disagree_ids[index],
                unit.bleed_valve_position_disagrees(),
            );
        }
        for (id, lost) in self
            .cross_bleed_valve_automatic_control_lost_ids
            .iter()
            .zip(self.cross_bleed_valve_automatic_control_lost)
        {
            writer.write(id, lost);
        }
    }
}
impl ReservoirAirPressure for A380Pneumatic {
    fn green_reservoir_pressure(&self) -> Pressure {
        self.green_hydraulic_reservoir_with_valve.pressure()
    }

    fn blue_reservoir_pressure(&self) -> Pressure {
        Pressure::default()
    }

    fn yellow_reservoir_pressure(&self) -> Pressure {
        self.yellow_hydraulic_reservoir_with_valve.pressure()
    }
}

/// A command that holds a valve at a fixed opening (stuck valve failures)
struct FixedValveCommand(Ratio);
impl<T: PneumaticValveSignal> ControllerSignal<T> for FixedValveCommand {
    fn signal(&self) -> Option<T> {
        Some(T::new(self.0))
    }
}

/// The opening at which a stuck valve stays: closed, fully open, or None when the valve is not stuck.
/// Design choice (no FCOM value, as the A320 model): a stuck valve stays fully closed or fully open.
/// An electro-pneumatic valve only takes it while its solenoid bus is powered; without power it
/// still follows its pneumatic spring, as without the failure.
fn stuck_valve_open_amount(stuck_closed: &Failure, stuck_open: &Failure) -> Option<Ratio> {
    if stuck_closed.is_active() {
        Some(Ratio::new::<ratio>(0.))
    } else if stuck_open.is_active() {
        Some(Ratio::new::<ratio>(1.))
    } else {
        None
    }
}

/// A detection that holds while the ENG BLEED pb-sw is in AUTO, and follows its condition while
/// the pb-sw is OFF. A380 FCOM DSC-36-20 (a380_fcom.txt l.94290-94291): "The FAULT light goes off,
/// when the flight crew selects OFF, and the applicable failure disappears". Design choice (as the
/// A320 model): the automatic closure of the bleed holds with the light.
fn held_detection(held: bool, detected: bool, bleed_pb_is_off: bool) -> bool {
    if bleed_pb_is_off {
        detected
    } else {
        held || detected
    }
}

/// Bleed air overtemperature, seen by the CPIOM-A downstream of the engine bleed valve. A380 FCOM
/// DSC-36-10-20 (a380_fcom.txt l.93867-93871 for the HP valve, l.93943-93947 for the bleed valve):
/// "The temperature downstream of the bleed valve exceeds: 260 °C, with a bleed pressure lower or
/// equal to 45 PSI, during more than 55 s; 245 °C, with a bleed pressure greater than 45 PSI,
/// during more than 55 s". Design choice: the temperature is the bleed temperature downstream of
/// the precooler (the regulated temperature; upstream of it the air is the compressor air).
struct BleedOverheatMonitor {
    over_limit: DelayedTrueLogicGate,
}
impl BleedOverheatMonitor {
    const PRESSURE_LIMIT_PSIG: f64 = 45.;
    const LOW_PRESSURE_TEMPERATURE_LIMIT_CELSIUS: f64 = 260.;
    const HIGH_PRESSURE_TEMPERATURE_LIMIT_CELSIUS: f64 = 245.;
    const CONFIRMATION_TIME: Duration = Duration::from_secs(55);

    fn new() -> Self {
        Self {
            over_limit: DelayedTrueLogicGate::new(Self::CONFIRMATION_TIME),
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        temperature: ThermodynamicTemperature,
        pressure: Pressure,
    ) {
        let limit_celsius = if pressure.get::<psi>() <= Self::PRESSURE_LIMIT_PSIG {
            Self::LOW_PRESSURE_TEMPERATURE_LIMIT_CELSIUS
        } else {
            Self::HIGH_PRESSURE_TEMPERATURE_LIMIT_CELSIUS
        };
        self.over_limit
            .update(context, temperature.get::<degree_celsius>() > limit_celsius);
    }

    fn has_overheat(&self) -> bool {
        self.over_limit.output()
    }
}

/// Bleed air overpressure, seen by the CPIOM-A downstream of the engine bleed valve. A380 FCOM
/// DSC-36-10-20 (a380_fcom.txt l.93934-93939): "The pressure downstream of the bleed valve exceeds:
/// 60 PSI, with a bleed temperature lower or equal to 245 °C, during more than 15 s. 45 PSI, with a
/// bleed temperature greater than 245 °C, during more than 15 s."
///
/// Design choice (no FCOM value): a closure of the overpressure valve in the last 10 s counts as a
/// pressure above the limit. That valve (l.93886-93888) cycles the pressure of a failed regulation
/// between 55 and 85 PSI: each dip below 60 PSI restarted the 15 s and the overpressure (AIR ENG
/// BLEED FAULT) was never detected. The pressure itself is not filtered: at high power the model's
/// regulation can leave a duct at 55-75 PSI (one bleed feeding the crossbled ducts), which must not
/// add up to an overpressure.
struct BleedOverpressureMonitor {
    over_limit: DelayedTrueLogicGate,
    /// The overpressure valve closed in the last OVERPRESSURE_VALVE_CLOSURE_MEMORY
    overpressure_valve_closed_recently: DelayedFalseLogicGate,
}
impl BleedOverpressureMonitor {
    const TEMPERATURE_LIMIT_CELSIUS: f64 = 245.;
    const LOW_TEMPERATURE_PRESSURE_LIMIT_PSIG: f64 = 60.;
    const HIGH_TEMPERATURE_PRESSURE_LIMIT_PSIG: f64 = 45.;
    const CONFIRMATION_TIME: Duration = Duration::from_secs(15);
    const OVERPRESSURE_VALVE_CLOSURE_MEMORY: Duration = Duration::from_secs(10);

    fn new() -> Self {
        Self {
            over_limit: DelayedTrueLogicGate::new(Self::CONFIRMATION_TIME),
            overpressure_valve_closed_recently: DelayedFalseLogicGate::new(
                Self::OVERPRESSURE_VALVE_CLOSURE_MEMORY,
            ),
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        pressure: Pressure,
        temperature: ThermodynamicTemperature,
        overpressure_valve_closed: bool,
    ) {
        let limit_psig = if temperature.get::<degree_celsius>() <= Self::TEMPERATURE_LIMIT_CELSIUS {
            Self::LOW_TEMPERATURE_PRESSURE_LIMIT_PSIG
        } else {
            Self::HIGH_TEMPERATURE_PRESSURE_LIMIT_PSIG
        };
        self.overpressure_valve_closed_recently
            .update(context, overpressure_valve_closed);
        self.over_limit.update(
            context,
            pressure.get::<psi>() > limit_psig || self.overpressure_valve_closed_recently.output(),
        );
    }

    fn has_overpressure(&self) -> bool {
        self.over_limit.output()
    }
}

/// Hot air leaking from a duct reaches its leak detection loop while the duct is pressurised.
/// Design choice (no FCOM value, as the A320 model): above 2 PSI over the ambient pressure.
const LEAK_MIN_DUCT_PRESSURE_PSIG: f64 = 2.;

/// The air that a leak blows on its detection loop: the air of the leaking duct while it is
/// pressurised.
fn leaking_air_temperature(
    context: &UpdateContext,
    is_leaking: bool,
    duct: &impl PneumaticContainer,
) -> Option<ThermodynamicTemperature> {
    if is_leaking
        && (duct.pressure() - context.ambient_pressure()).get::<psi>() > LEAK_MIN_DUCT_PRESSURE_PSIG
    {
        Some(duct.temperature())
    } else {
        None
    }
}

/// The bleed air that a duct taking its air from the two engine ducts of one side gets: the hottest
/// of them that is pressurised. Design choice: the pack bay and hot-air ducts get the air of the
/// side ducts (pack 1 and HOT AIR 1: engines 1 and 2, pack 2 and HOT AIR 2: engines 3 and 4).
fn side_bleed_air_temperature(
    context: &UpdateContext,
    side_ducts: [&impl PneumaticContainer; 2],
) -> Option<ThermodynamicTemperature> {
    side_ducts
        .iter()
        .filter(|duct| {
            (duct.pressure() - context.ambient_pressure()).get::<psi>()
                > LEAK_MIN_DUCT_PRESSURE_PSIG
        })
        .map(|duct| duct.temperature())
        .reduce(|hottest, temperature| hottest.max(temperature))
}

/// The CPIOM-A units (from 0) that drive each crossbleed valve: left, center, right. FBW team note
/// from the A380 TTM (no FCOM source): "There is a relay system that connects the 4 CPIOM units
/// (PADS application) to the 3 crossbleed valves and the APU isolation valve. CPIOM-A1+A2 control
/// left xbleed and APU isolation valve, CPIOM-A3+A4 control center and right xbleed valve". The
/// FCOM (a380_fcom.txt l.93810, l.94916-94919) has the bleed controller functions in CPIOM A.
const CROSS_BLEED_VALVE_CPIOM_A_UNITS: [[usize; 2]; 3] = [[0, 1], [2, 3], [2, 3]];

/// The command of crossbleed valve n (0 left, 1 center, 2 right), and whether its automatic control
/// is lost.
///
/// The first available CPIOM-A of the pair of the valve sends its command. All units compute the
/// same X BLEED logic, so the valves still open and close "automatically, and at the same time"
/// (FCOM DSC-36-10-50, a380_fcom.txt l.94076-94079) while each pair has one unit.
///
/// Design choice (no FCOM detail): with both CPIOM-A of its pair lost the valve gets no AUTO command
/// and stays where it is; the XBLEED selector OPEN or CLOSE still moves it (its manual motor, as
/// the dual motor valve of the A320), so the crew keeps control of it. "In case of a CPIOM failure,
/// the ECAM will not trigger a specific CPIOM alert. Aircraft systems, monitored and controlled by
/// this failed CPIOM, may be affected" (DSC-42-20, l.95060-95066).
fn cross_bleed_valve_command(
    units: &[CoreProcessingInputOutputModuleAUnit; 4],
    cpiom_a_available: [bool; 4],
    valve_index: usize,
    selector: CrossBleedValveSelectorMode,
) -> (Option<CrossBleedValveSignal>, bool) {
    match CROSS_BLEED_VALVE_CPIOM_A_UNITS[valve_index]
        .iter()
        .find(|&&unit| cpiom_a_available[unit])
    {
        Some(&unit) => (
            ControllerSignal::<CrossBleedValveSignal>::signal(&units[unit]),
            false,
        ),
        None => (
            match selector {
                CrossBleedValveSelectorMode::Shut => Some(CrossBleedValveSignal::new_closed(
                    CrossBleedValveSignalType::Manual,
                )),
                CrossBleedValveSelectorMode::Open => Some(CrossBleedValveSignal::new_open(
                    CrossBleedValveSignalType::Manual,
                )),
                CrossBleedValveSelectorMode::Auto => None,
            },
            true,
        ),
    }
}

/// The opening of a bleed duct with a leak failure. Design choice (no FCOM value, as the A320
/// model): the hole empties an isolated duct in a few seconds, while the duct stays pressurised as
/// long as its bleed valve feeds it.
fn new_leak_exhaust() -> PneumaticExhaust {
    const LEAK_EXHAUST_SPEED: f64 = 0.5;
    PneumaticExhaust::new(
        LEAK_EXHAUST_SPEED,
        LEAK_EXHAUST_SPEED,
        Pressure::new::<psi>(0.),
    )
}

/// The bleed leak detection of the engine and wing ducts. A380 FCOM DSC-36-10-60
/// (a380_fcom.txt l.94099-94130): dual detection loops along the ducts of the engines (in the
/// pylons) and of the outer and inner wings; "An overheat is detected, when the ambient temperature
/// near the bleed ducts is above: 180 deg C for the engine pylon ducts, 124 deg C for all other
/// ducts". The wing zones follow the engines: zone 1 left outer wing, 2 left inner, 3 right inner,
/// 4 right outer (the ENG BLEED pb-sw FAULT light: "A leak is detected in the applicable engine or
/// inner (outer) wing", DSC-36-20 l.94284).
///
/// A leak holds while the ENG BLEED pb-sw of its engine is in AUTO (held_detection, DSC-36-20
/// l.94290-94291 and the leak procedures "If the ENG 1(4) BLEED pb-sw is set to ON, the FAULT light
/// remains. If the ENG 1(4) BLEED pb-sw is off, the FAULT light goes off when the overheat due to
/// the bleed leak disappears", PRO-ABN l.168662-168664).
///
/// The other zones of DSC-36-10-60 (l.94101-94107: "APU, Pack bays, Air conditioning hot-air
/// system"), and the forward cargo duct of AIR FWD CARGO DUCT LEAK (PRO-ABN l.168341-168360), are
/// detected above 124 deg C too ("all other ducts", l.94124-94125). Their isolation (l.94127-94132,
/// l.94205-94237): an APU duct leak closes the APU bleed and isolation valves; a pack bay leak the
/// two pack valves of the pack and the hot-air valve of its side; a hot-air duct leak its hot-air
/// valve, and the forward cargo duct leak the hot-air valve 1 ("If the hot-air valve 1 did not
/// close automatically: HOT AIR 1 OFF", l.168359-168360). Each holds as the engine zones do, while
/// its pb-sw is ON: APU BLEED ("If the APU BLEED pb-sw is set to ON, the FAULT light remains",
/// l.167794-167796), PACK 1(2) and HOT AIR 1(2) (design choice: the same rule for the pb-sw of the
/// valves that the leak closes).
///
/// Not simulated: the two loops of a zone and their failures (AIR LEAK DET FAULT).
struct BleedLeakDetection {
    pylon_leak: [bool; 4],
    wing_leak: [bool; 4],
    pylon_leak_ids: [VariableIdentifier; 4],
    wing_leak_ids: [VariableIdentifier; 4],

    apu_leak: bool,
    pack_leak: [bool; 2],
    hot_air_leak: [bool; 2],
    fwd_cargo_leak: bool,
    apu_leak_id: VariableIdentifier,
    pack_leak_ids: [VariableIdentifier; 2],
    hot_air_leak_ids: [VariableIdentifier; 2],
    fwd_cargo_leak_id: VariableIdentifier,
    /// The PACK 1(2) and HOT AIR 1(2) pb-sw of the air conditioning panel, that hold their leaks
    pack_pb_is_on_ids: [VariableIdentifier; 2],
    hot_air_pb_is_on_ids: [VariableIdentifier; 2],
    pack_pb_is_on: [bool; 2],
    hot_air_pb_is_on: [bool; 2],
}
impl BleedLeakDetection {
    const PYLON_DETECTION_CELSIUS: f64 = 180.;
    const WING_DETECTION_CELSIUS: f64 = 124.;
    /// "124 deg C for all other ducts" (l.94124-94125)
    const OTHER_DUCTS_DETECTION_CELSIUS: f64 = 124.;
    /// The wing zone of each engine, as the LVar names give them
    const WING_ZONE_NAMES: [&str; 4] = ["L_OUTR", "L_INR", "R_INR", "R_OUTR"];

    fn new(context: &mut InitContext) -> Self {
        Self {
            pylon_leak: [false; 4],
            wing_leak: [false; 4],
            pylon_leak_ids: [1, 2, 3, 4]
                .map(|engine| context.get_identifier(format!("PNEU_ENG_{}_BLEED_LEAK", engine))),
            wing_leak_ids: Self::WING_ZONE_NAMES
                .map(|zone| context.get_identifier(format!("PNEU_{}_WING_LEAK", zone))),

            apu_leak: false,
            pack_leak: [false; 2],
            hot_air_leak: [false; 2],
            fwd_cargo_leak: false,
            apu_leak_id: context.get_identifier("PNEU_APU_BLEED_LEAK".to_owned()),
            pack_leak_ids: [1, 2]
                .map(|pack| context.get_identifier(format!("PNEU_PACK_{}_LEAK", pack))),
            hot_air_leak_ids: [1, 2]
                .map(|number| context.get_identifier(format!("PNEU_HOT_AIR_{}_LEAK", number))),
            fwd_cargo_leak_id: context.get_identifier("PNEU_FWD_CARGO_DUCT_LEAK".to_owned()),
            pack_pb_is_on_ids: [1, 2]
                .map(|pack| context.get_identifier(format!("OVHD_COND_PACK_{}_PB_IS_ON", pack))),
            hot_air_pb_is_on_ids: [1, 2].map(|number| {
                context.get_identifier(format!("OVHD_COND_HOT_AIR_{}_PB_IS_ON", number))
            }),
            pack_pb_is_on: [true; 2],
            hot_air_pb_is_on: [true; 2],
        }
    }

    /// The leaks of the APU duct, the pack bays, the hot-air ducts and the forward cargo duct, from
    /// the air each leak blows on its loops (None without a leak or with its duct empty)
    fn update_other_zones(
        &mut self,
        overhead_panel: &A380PneumaticOverheadPanel,
        apu_leaking_air: Option<ThermodynamicTemperature>,
        pack_bay_leaking_air: [Option<ThermodynamicTemperature>; 2],
        hot_air_duct_leaking_air: [Option<ThermodynamicTemperature>; 2],
        fwd_cargo_duct_leaking_air: Option<ThermodynamicTemperature>,
    ) {
        let detects = |temperature: Option<ThermodynamicTemperature>| {
            temperature
                .is_some_and(|t| t.get::<degree_celsius>() > Self::OTHER_DUCTS_DETECTION_CELSIUS)
        };
        self.apu_leak = held_detection(
            self.apu_leak,
            detects(apu_leaking_air),
            !overhead_panel.apu_bleed_is_on(),
        );
        for index in 0..2 {
            self.pack_leak[index] = held_detection(
                self.pack_leak[index],
                detects(pack_bay_leaking_air[index]),
                !self.pack_pb_is_on[index],
            );
            self.hot_air_leak[index] = held_detection(
                self.hot_air_leak[index],
                detects(hot_air_duct_leaking_air[index]),
                !self.hot_air_pb_is_on[index],
            );
        }
        self.fwd_cargo_leak = held_detection(
            self.fwd_cargo_leak,
            detects(fwd_cargo_duct_leaking_air),
            !self.hot_air_pb_is_on[0],
        );
    }

    fn apu_leak(&self) -> bool {
        self.apu_leak
    }

    /// A pack bay leak of pack n (from 1): its pack valves and the hot-air valve n close
    fn pack_leak(&self, pack_number: usize) -> bool {
        self.pack_leak[pack_number - 1]
    }

    /// A leak of the hot-air ducts of the hot-air valve n (from 1), or of the forward cargo duct for
    /// the hot-air valve 1: that hot-air valve closes
    fn hot_air_leak(&self, hot_air_number: usize) -> bool {
        self.hot_air_leak[hot_air_number - 1] || (hot_air_number == 1 && self.fwd_cargo_leak)
    }

    fn update(
        &mut self,
        engine_systems: &[EngineBleedAirSystem; 4],
        overhead_panel: &A380PneumaticOverheadPanel,
    ) {
        let detects = |temperature: Option<ThermodynamicTemperature>, limit_celsius: f64| {
            temperature.is_some_and(|t| t.get::<degree_celsius>() > limit_celsius)
        };
        for (index, engine_system) in engine_systems.iter().enumerate() {
            let bleed_pb_is_off = !overhead_panel.engine_bleed_pb_is_auto(index + 1);
            self.pylon_leak[index] = held_detection(
                self.pylon_leak[index],
                detects(
                    engine_system.pylon_leaking_air_temperature(),
                    Self::PYLON_DETECTION_CELSIUS,
                ),
                bleed_pb_is_off,
            );
            self.wing_leak[index] = held_detection(
                self.wing_leak[index],
                detects(
                    engine_system.wing_leaking_air_temperature(),
                    Self::WING_DETECTION_CELSIUS,
                ),
                bleed_pb_is_off,
            );
        }
    }

    /// A leak of the engine (pylon) duct or of the wing zone of the engine: the engine bleed valve
    /// closes and the ENG BLEED pb-sw FAULT light comes on
    fn zone_leak(&self, engine_number: usize) -> bool {
        self.pylon_leak[engine_number - 1] || self.wing_leak[engine_number - 1]
    }

    /// The crossbleed valves that a leak closes at AUTO, left, center and right. A380 FCOM
    /// DSC-36-10-60 (a380_fcom.txt l.94147-94155, l.94185-94194): an outer engine or outer wing leak
    /// closes "The crossbleed valve on the side of the affected engine, The center crossbleed
    /// valve"; an inner one "The crossbleed valve on the side of the affected engine".
    fn cross_bleed_valves_to_close(&self) -> [bool; 3] {
        let leak = |engine_number: usize| self.zone_leak(engine_number);
        [leak(1) || leak(2), leak(1) || leak(4), leak(3) || leak(4)]
    }
}
impl SimulationElement for BleedLeakDetection {
    fn read(&mut self, reader: &mut SimulatorReader) {
        for index in 0..2 {
            self.pack_pb_is_on[index] = reader.read(&self.pack_pb_is_on_ids[index]);
            self.hot_air_pb_is_on[index] = reader.read(&self.hot_air_pb_is_on_ids[index]);
        }
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        for index in 0..4 {
            writer.write(&self.pylon_leak_ids[index], self.pylon_leak[index]);
            writer.write(&self.wing_leak_ids[index], self.wing_leak[index]);
        }
        writer.write(&self.apu_leak_id, self.apu_leak);
        for index in 0..2 {
            writer.write(&self.pack_leak_ids[index], self.pack_leak[index]);
            writer.write(&self.hot_air_leak_ids[index], self.hot_air_leak[index]);
        }
        writer.write(&self.fwd_cargo_leak_id, self.fwd_cargo_leak);
    }
}

/// The command of one crossbleed valve: the CPIOM-A command, closed at AUTO by a leak
/// (BleedLeakDetection::cross_bleed_valves_to_close)
struct CrossBleedValveCommand {
    signal: Option<CrossBleedValveSignal>,
}
impl CrossBleedValveCommand {
    fn new(cpiom_signal: Option<CrossBleedValveSignal>, closed_by_leak: bool) -> Self {
        Self {
            signal: match cpiom_signal {
                Some(signal)
                    if closed_by_leak
                        && signal.signal_type == CrossBleedValveSignalType::Automatic =>
                {
                    Some(CrossBleedValveSignal::new_closed(
                        CrossBleedValveSignalType::Automatic,
                    ))
                }
                other => other,
            },
        }
    }
}
impl ControllerSignal<CrossBleedValveSignal> for CrossBleedValveCommand {
    fn signal(&self) -> Option<CrossBleedValveSignal> {
        self.signal
            .as_ref()
            .map(|signal| CrossBleedValveSignal::new(signal.target_open_amount, signal.signal_type))
    }
}

/// The engines whose bleed duct has no air source and empties (vented), engine 1 first.
///
/// Design choice, no FCOM value: the bleed duct of an engine that is not running is fed only by
/// the APU bleed or the HP ground air (connected to the engine 1 duct) and, through open crossbleed
/// valves, by the ducts of running engines (left crossbleed valve: engines 1-2, center: 1-4, right:
/// 3-4, as the model
/// connects them). Without such a source the air trapped in the duct after the engine stopped (its
/// bleed valve closes below 15 PSI, FCOM DSC-36 a380_fcom.txt l.93916-93922) leaks away, so that a
/// starter assisted relight finds no air in the duct: a starter needs a real air source (APU,
/// crossbleed). Without this the trapped air pressurized the starter for 5 to 15 s and a relight
/// was granted with no APU or crossbleed air.
fn engine_ducts_without_air_source(
    engine_running: [bool; 4],
    external_air_on_engine_1_duct: bool,
    cross_bleed_valves_open: [bool; 3],
) -> [bool; 4] {
    // The group of each engine duct: the ducts joined by open crossbleed valves share one group
    let mut group = [0, 1, 2, 3];
    let [left_open, center_open, right_open] = cross_bleed_valves_open;
    let links = [(0, 1, left_open), (0, 3, center_open), (2, 3, right_open)];
    // Three links: three passes join every connected group
    for _ in 0..links.len() {
        for (a, b, open) in links {
            if open {
                let joined = group[a].min(group[b]);
                group[a] = joined;
                group[b] = joined;
            }
        }
    }

    let group_has_source = |g: usize| {
        (external_air_on_engine_1_duct && group[0] == g)
            || (0..4).any(|engine| engine_running[engine] && group[engine] == g)
    };
    [0, 1, 2, 3].map(|engine| !engine_running[engine] && !group_has_source(group[engine]))
}

/// The FADEC control of the engine start valve. The start sequence on the ground (engine_failure.rs,
/// systems::engine::engine_start) commands it for the start, the cranks and the abort; the schedule
/// below covers the in-flight starts. The valve can be stuck (flyPad failures) and the FADEC detects
/// a valve that does not follow its command (ENG START VLV FAULT).
struct EngineStarterValveController {
    number: usize,
    /// The start valve schedule of the engine states opens the valve (in-flight starts; the start
    /// sequence commands it on the ground)
    schedule_open: bool,
    /// The FADEC commands the start valve open (start, crank, relight), whatever its position
    commanded_open: bool,
    should_open: bool,
    supervision: EngineStartValveSupervision,
}
impl ControllerSignal<EngineStarterValveSignal> for EngineStarterValveController {
    fn signal(&self) -> Option<EngineStarterValveSignal> {
        if self.should_open {
            Some(EngineStarterValveSignal::new_open())
        } else {
            Some(EngineStarterValveSignal::new_closed())
        }
    }
}
impl EngineStarterValveController {
    /// FCOM N2 (the HP spool of the GP7270), read on the Trent N3
    const START_VALVE_CLOSING_N3_PERCENT: f64 = 58.4;
    /// LIM-70 STARTER (l.189735), FCOM N2 read on the Trent N3 (as the start sequence,
    /// engine_failure.rs a380_engine_start_schedule)
    const STARTER_ENGAGEMENT_MAX_N3_PERCENT: f64 = 25.;

    fn new(context: &mut InitContext, number: usize) -> Self {
        Self {
            number,
            schedule_open: false,
            commanded_open: false,
            should_open: false,
            supervision: EngineStartValveSupervision::new(context, number),
        }
    }

    fn is_commanded_open(&self) -> bool {
        self.commanded_open
    }

    /// A380 FCOM DSC-70-30 (a380_fcom.txt l.113548-113576), at the ENG MASTER ON of a start
    /// (STARTING), or of the restart of an engine that has not run down to OFF yet (RESTARTING):
    /// - on the ground (l.113552): "Engine start valve opens";
    /// - in flight (l.113567-113570): "Engine start valve opens if N2 is below 11 %, or if the
    ///   aircraft airspeed (CAS) is below 260 kt. Note: The engine start valve remains closed in the
    ///   case of a windmilling start sequence";
    /// - in both cases (l.113558-113559, l.113574-113576): "When N2 above 58.4 %: Engine start valve
    ///   closes".
    fn update(&mut self, context: &UpdateContext, fadec: &FullAuthorityDigitalEngineControl) {
        let core_speed = fadec.engine_core_speed(self.number);
        let starting = matches!(
            fadec.engine_state(self.number),
            EngineState::Starting | EngineState::Restarting
        );
        let starter_assisted = context.is_on_ground()
            || A380RelightEnvelope::in_flight_start_is_starter_assisted(
                core_speed,
                context.indicated_airspeed(),
            );

        // LIM-70 STARTER (l.189735): "If the N2 is above 25 %, no running engagement of the starter
        // is possible": the schedule opens the valve of a start whose core turns at or below 25 %
        // N2, and keeps it open once open (see engine_start::starter_can_engage).
        let schedule_open = starting
            && starter_assisted
            && core_speed.get::<percent>() <= Self::START_VALVE_CLOSING_N3_PERCENT
            && starter_can_engage(
                self.schedule_open,
                core_speed,
                Some(Ratio::new::<percent>(
                    Self::STARTER_ENGAGEMENT_MAX_N3_PERCENT,
                )),
            );
        self.schedule_open = schedule_open;
        self.commanded_open = self.supervision.commanded_open(schedule_open);
        self.should_open = self.supervision.position_open(self.commanded_open);
        self.supervision
            .monitor(context.delta(), self.commanded_open, self.should_open);
    }
}
impl SimulationElement for EngineStarterValveController {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.supervision.accept(visitor);

        visitor.visit(self);
    }
}

/**
 * The CPIOM A. It consists of four individual units
 */
struct CoreProcessingInputOutputModuleA {
    units: [CoreProcessingInputOutputModuleAUnit; 4],
    powered_by: ElectricalBusType,
    is_powered: bool,
}
impl CoreProcessingInputOutputModuleA {
    fn new(powered_by: ElectricalBusType) -> Self {
        Self {
            units: [
                CoreProcessingInputOutputModuleAUnit::new(1),
                CoreProcessingInputOutputModuleAUnit::new(2),
                CoreProcessingInputOutputModuleAUnit::new(3),
                CoreProcessingInputOutputModuleAUnit::new(4),
            ],
            powered_by,
            is_powered: true,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        sensors: &[EngineBleedAirSystem; 4],
        apu_bleed_valve: &impl PneumaticValve,
        pneumatic_overhead_panel: &A380PneumaticOverheadPanel,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        engine_start_valves_commanded_open: [bool; 4],
        leak_detection: &BleedLeakDetection,
        cross_bleed_valves_open: [bool; 3],
    ) {
        self.update_same_side_flow_balancing(context, sensors, cross_bleed_valves_open);

        // "On ground, at engine start" (FCOM DSC-36-10-50, see the crossbleed signal): any engine
        // whose start valve the FADEC commands open
        let engine_start_on_ground =
            context.is_on_ground() && engine_start_valves_commanded_open.contains(&true);
        for (unit, sensor) in self.units.iter_mut().zip(sensors) {
            unit.update(
                context,
                sensor,
                engine_fire_push_buttons.is_released(unit.engine_number),
                apu_bleed_valve,
                pneumatic_overhead_panel,
                engine_start_on_ground,
                leak_detection.zone_leak(unit.engine_number),
            );
        }

        // "In case any engine bleed system fails" the crossbleed valves open at AUTO (see the
        // crossbleed signal)
        let any_engine_bleed_failed = self.units.iter().any(|unit| unit.engine_bleed_failed());
        for unit in self.units.iter_mut() {
            unit.is_any_engine_bleed_failed = any_engine_bleed_failed;
        }
    }

    /// A380 FCOM DSC-36-10-20 (a380_fcom.txt l.93882-93885): the bleed valve "maintains the bleed
    /// supply pressure at about 40 PSI ... The pressure depends on the bleed airflow. The engine
    /// bleed valve regulates the airflow, to balance the pressure of the air bled from the two
    /// engines that are on the same side."
    ///
    /// Design choice (the FCOM gives no law): each bleed valve of a side (engines 1-2, 3-4) moves its
    /// pressure target away from 40 PSI until both deliver the same airflow: the engine that
    /// delivers more lowers its target, the other raises it. Only while the crossbleed valve of the
    /// side joins their ducts and both bleed valves deliver air: with separate ducts each bleed only
    /// feeds its own pack valve, whose flow the FDAC sets.
    fn update_same_side_flow_balancing(
        &mut self,
        context: &UpdateContext,
        sensors: &[EngineBleedAirSystem; 4],
        cross_bleed_valves_open: [bool; 3],
    ) {
        // The engines of each side and the crossbleed valve that joins their ducts (left, right)
        const SIDES: [(usize, usize, usize); 2] = [(0, 1, 0), (2, 3, 2)];
        for (first, second, side_cross_bleed_valve) in SIDES {
            let balancing = cross_bleed_valves_open[side_cross_bleed_valve]
                && sensors[first].bleed_air_flows()
                && sensors[second].bleed_air_flows();
            if balancing {
                let first_flow = sensors[first].bleed_valve_air_flow();
                let second_flow = sensors[second].bleed_valve_air_flow();
                self.units[first].update_flow_balancing(context, second_flow - first_flow);
                self.units[second].update_flow_balancing(context, first_flow - second_flow);
            } else {
                self.units[first].reset_flow_balancing();
                self.units[second].reset_flow_balancing();
            }
        }
    }

    fn is_powered(&self) -> bool {
        self.is_powered
    }
}
impl SimulationElement for CoreProcessingInputOutputModuleA {
    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by)
    }
}
impl ControllerSignal<BleedMonitoringComputerIsAliveSignal> for CoreProcessingInputOutputModuleA {
    fn signal(&self) -> Option<BleedMonitoringComputerIsAliveSignal> {
        if self.is_powered() {
            Some(BleedMonitoringComputerIsAliveSignal)
        } else {
            None
        }
    }
}

struct CoreProcessingInputOutputModuleAUnit {
    engine_number: usize,
    pressure_regulating_valve_is_closed: bool,
    intermediate_pressure_compressor_pressure: Pressure,
    high_pressure_compressor_pressure: Pressure,
    transfer_pressure: Pressure,
    engine_starter_valve_is_open: bool,
    is_engine_bleed_pushbutton_auto: bool,
    is_engine_fire_pushbutton_released: bool,
    is_apu_bleed_valve_open: bool,
    is_apu_bleed_on: bool,
    is_any_bleed_pushbutton_off: bool,
    /// On the ground, the FADEC commands the start valve of an engine open
    is_engine_start_on_ground: bool,
    overheat_monitor: BleedOverheatMonitor,
    overpressure_monitor: BleedOverpressureMonitor,
    /// The overtemperature and overpressure detections, held with the FAULT light while the ENG
    /// BLEED pb-sw is in AUTO (held_detection). They close the bleed valve.
    overheat_latched: bool,
    overpressure_latched: bool,
    /// A leak of the engine (pylon) duct or of the wing zone of this engine (BleedLeakDetection)
    zone_leak: bool,
    /// Any engine bleed system has failed (overtemperature or overpressure)
    is_any_engine_bleed_failed: bool,
    /// The engine bleed valve is not in the position this unit commands (FAULT light, BLEED page)
    bleed_valve_position_disagrees: DelayedTrueLogicGate,
    /// The opening command sent to the bleed valve at the previous update, that the valve position
    /// read now follows
    bleed_valve_commanded_open: bool,
    high_pressure_valve_pid: PidController,
    pressure_regulating_valve_pid: PidController,
    /// The offset of the bleed valve pressure target that balances the airflow with the other
    /// engine of the side (CoreProcessingInputOutputModuleA::update_same_side_flow_balancing)
    flow_balancing_target_offset_psi: f64,
    fan_air_valve_pid: PidController,
    cross_bleed_valve_selector: CrossBleedValveSelectorMode,
}
impl CoreProcessingInputOutputModuleAUnit {
    const PRESSURE_REGULATING_VALVE_TARGET_PSI: f64 = 40.; // FCOM
    /// Design choices (no FCOM value): how fast the flow balancing moves the pressure target (PSI
    /// per second for each kg/s of airflow difference), and how far it may move it ("about 40 PSI")
    const FLOW_BALANCING_GAIN_PSI_PER_KG: f64 = 10.;
    const FLOW_BALANCING_MAX_OFFSET_PSI: f64 = 5.;
    /// Design choice, no FCOM value (as the A320 model): the bleed valve must stay out of its
    /// commanded position for 10 s before the FAULT light comes on.
    const BLEED_VALVE_POSITION_DISAGREE_CONFIRMATION: Duration = Duration::from_secs(10);

    fn new(engine_number: usize) -> Self {
        Self {
            engine_number,
            pressure_regulating_valve_is_closed: false,
            intermediate_pressure_compressor_pressure: Pressure::new::<psi>(0.),
            high_pressure_compressor_pressure: Pressure::new::<psi>(0.),
            transfer_pressure: Pressure::new::<psi>(0.),
            engine_starter_valve_is_open: false,
            is_engine_bleed_pushbutton_auto: true,
            is_engine_fire_pushbutton_released: false,
            is_apu_bleed_valve_open: false,
            is_apu_bleed_on: false,
            is_any_bleed_pushbutton_off: false,
            is_engine_start_on_ground: false,
            overheat_monitor: BleedOverheatMonitor::new(),
            overpressure_monitor: BleedOverpressureMonitor::new(),
            overheat_latched: false,
            overpressure_latched: false,
            zone_leak: false,
            is_any_engine_bleed_failed: false,
            bleed_valve_position_disagrees: DelayedTrueLogicGate::new(
                Self::BLEED_VALVE_POSITION_DISAGREE_CONFIRMATION,
            ),
            bleed_valve_commanded_open: false,
            high_pressure_valve_pid: PidController::new(0.05, 0.05, 0., 0., 1., 50., 1.),
            pressure_regulating_valve_pid: PidController::new(
                0.1,
                0.05,
                0.,
                0.,
                1.,
                Self::PRESSURE_REGULATING_VALVE_TARGET_PSI,
                1.,
            ),
            flow_balancing_target_offset_psi: 0.,
            fan_air_valve_pid: PidController::new(-0.005, -0.001, 0., 0., 1., 200., 1.),
            cross_bleed_valve_selector: CrossBleedValveSelectorMode::Auto,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        sensors: &EngineBleedAirSystem,
        is_engine_fire_pushbutton_released: bool,
        apu_bleed_valve: &impl PneumaticValve,
        pneumatic_overhead_panel: &A380PneumaticOverheadPanel,
        is_engine_start_on_ground: bool,
        zone_leak: bool,
    ) {
        self.is_engine_start_on_ground = is_engine_start_on_ground;
        self.intermediate_pressure_compressor_pressure = sensors.intermediate_pressure();
        self.high_pressure_compressor_pressure = sensors.high_pressure();
        self.transfer_pressure = sensors.transfer_pressure();

        self.pressure_regulating_valve_is_closed = !sensors.pressure_regulating_valve_is_open();

        if let Some(transfer_pressure_signal) = sensors.transfer_pressure_transducer_pressure() {
            self.high_pressure_valve_pid
                .next_control_output(transfer_pressure_signal.get::<psi>(), Some(context.delta()));
        }

        if let Some(regulated_pressure_signal) = sensors.regulated_pressure_transducer_pressure() {
            self.pressure_regulating_valve_pid.next_control_output(
                regulated_pressure_signal.get::<psi>(),
                Some(context.delta()),
            );
        }

        self.fan_air_valve_pid.next_control_output(
            sensors
                .precooler_outlet_temperature()
                .get::<degree_celsius>(),
            Some(context.delta()),
        );

        self.engine_starter_valve_is_open = sensors.engine_starter_valve_is_open();

        self.is_engine_bleed_pushbutton_auto =
            pneumatic_overhead_panel.engine_bleed_pb_is_auto(self.engine_number);
        self.is_engine_fire_pushbutton_released = is_engine_fire_pushbutton_released;

        self.is_any_bleed_pushbutton_off =
            (1..=4).any(|e| !pneumatic_overhead_panel.engine_bleed_pb_is_auto(e));

        self.is_apu_bleed_valve_open = apu_bleed_valve.is_open();
        self.is_apu_bleed_on = pneumatic_overhead_panel.apu_bleed_is_on();

        self.cross_bleed_valve_selector = pneumatic_overhead_panel.cross_bleed_mode();

        self.update_fault_monitoring(context, sensors, zone_leak);
    }

    /// The bleed monitoring of the CPIOM-A: overtemperature, overpressure, leak and bleed valve
    /// position (FCOM DSC-36-10-20 l.93931-93950, DSC-36-20 l.94277-94291)
    fn update_fault_monitoring(
        &mut self,
        context: &UpdateContext,
        sensors: &EngineBleedAirSystem,
        zone_leak: bool,
    ) {
        if let Some(regulated_pressure) = sensors.regulated_pressure_transducer_pressure() {
            let bleed_temperature = sensors.precooler_outlet_temperature();
            self.overheat_monitor
                .update(context, bleed_temperature, regulated_pressure);
            self.overpressure_monitor.update(
                context,
                regulated_pressure,
                bleed_temperature,
                sensors.overpressure_valve_closed(),
            );
        }

        let bleed_pb_is_off = !self.is_engine_bleed_pushbutton_auto;
        self.overheat_latched = held_detection(
            self.overheat_latched,
            self.overheat_monitor.has_overheat(),
            bleed_pb_is_off,
        );
        self.overpressure_latched = held_detection(
            self.overpressure_latched,
            self.overpressure_monitor.has_overpressure(),
            bleed_pb_is_off,
        );
        self.zone_leak = zone_leak;

        // "The engine bleed position disagrees with the requested position" (DSC-36-20 l.94280):
        // the request is the opening this unit sent to the valve. The valve position read here
        // follows the command of the previous update (the valves move after this unit).
        self.bleed_valve_position_disagrees.update(
            context,
            self.bleed_valve_commanded_open != sensors.pressure_regulating_valve_is_open(),
        );
        self.bleed_valve_commanded_open =
            ControllerSignal::<PressureRegulatingValveSignal>::signal(self)
                .is_some_and(|signal| signal.target_open_amount() > Ratio::default());
    }

    /// The other engine of the side delivers more airflow than this one by `flow_excess_of_other`
    /// (negative: less): the pressure target of this bleed valve rises (falls) to take more (less)
    fn update_flow_balancing(&mut self, context: &UpdateContext, flow_excess_of_other: MassRate) {
        self.flow_balancing_target_offset_psi = (self.flow_balancing_target_offset_psi
            + Self::FLOW_BALANCING_GAIN_PSI_PER_KG
                * flow_excess_of_other.get::<kilogram_per_second>()
                * context.delta_as_secs_f64())
        .clamp(
            -Self::FLOW_BALANCING_MAX_OFFSET_PSI,
            Self::FLOW_BALANCING_MAX_OFFSET_PSI,
        );
        self.pressure_regulating_valve_pid.change_setpoint(
            Self::PRESSURE_REGULATING_VALVE_TARGET_PSI + self.flow_balancing_target_offset_psi,
        );
    }

    fn reset_flow_balancing(&mut self) {
        self.flow_balancing_target_offset_psi = 0.;
        self.pressure_regulating_valve_pid
            .change_setpoint(Self::PRESSURE_REGULATING_VALVE_TARGET_PSI);
    }

    fn should_close_pressure_regulating_valve_because_apu_bleed_is_on(&self) -> bool {
        self.is_apu_bleed_on && self.is_apu_bleed_valve_open
    }

    /// The engine bleed supply is lost by an overtemperature or an overpressure (AIR ENG 1(2)(3)(4)
    /// BLEED FAULT, PRO-ABN l.167912-167928)
    fn engine_bleed_failed(&self) -> bool {
        self.overheat_latched || self.overpressure_latched
    }

    fn has_overheat(&self) -> bool {
        self.overheat_latched
    }

    fn has_overpressure(&self) -> bool {
        self.overpressure_latched
    }

    fn bleed_valve_position_disagrees(&self) -> bool {
        self.bleed_valve_position_disagrees.output()
    }

    /// The FAULT light of the ENG BLEED pb-sw. A380 FCOM DSC-36-20 (a380_fcom.txt l.94277-94284):
    /// "The engine bleed position disagrees with the requested position, or An overpressure is
    /// detected, or An engine bleed overheat is detected", "A leak is detected in the applicable
    /// engine or inner (outer) wing".
    fn has_fault(&self) -> bool {
        self.overheat_latched
            || self.overpressure_latched
            || self.zone_leak
            || self.bleed_valve_position_disagrees.output()
    }
}
impl ControllerSignal<HighPressureValveSignal> for CoreProcessingInputOutputModuleAUnit {
    fn signal(&self) -> Option<HighPressureValveSignal> {
        // FCOM DSC-36-10-20 (a380_fcom.txt l.93859-93871): the HP valve closes for a high IP stage
        // pressure, a low HP stage pressure, the bleed valve closed, and a bleed overtemperature
        if self.pressure_regulating_valve_is_closed
            || self.overheat_latched
            || self.high_pressure_compressor_pressure < Pressure::new::<psi>(15.)
            || self.intermediate_pressure_compressor_pressure > Pressure::new::<psi>(33.5)
        {
            Some(HighPressureValveSignal::new_closed())
        } else {
            Some(HighPressureValveSignal::new(Ratio::new::<ratio>(
                self.high_pressure_valve_pid.output(),
            )))
        }
    }
}
impl ControllerSignal<PressureRegulatingValveSignal> for CoreProcessingInputOutputModuleAUnit {
    fn signal(&self) -> Option<PressureRegulatingValveSignal> {
        if self.transfer_pressure < Pressure::new::<psi>(15.)
            || (!self.is_engine_bleed_pushbutton_auto || self.is_engine_fire_pushbutton_released)
            || self.should_close_pressure_regulating_valve_because_apu_bleed_is_on()
            || self.engine_starter_valve_is_open
            // FCOM DSC-36-10-20 l.93931-93950: "In case of associated bleed malfunctions: Bleed air
            // overpressure, Bleed air overtemperature, A leak detection in the surrounding area"
            || self.overheat_latched
            || self.overpressure_latched
            || self.zone_leak
        {
            Some(PressureRegulatingValveSignal::new_closed())
        } else {
            Some(PressureRegulatingValveSignal::new(Ratio::new::<ratio>(
                self.pressure_regulating_valve_pid.output(),
            )))
        }
    }
}
impl ControllerSignal<FanAirValveSignal> for CoreProcessingInputOutputModuleAUnit {
    fn signal(&self) -> Option<FanAirValveSignal> {
        Some(FanAirValveSignal::new(Ratio::new::<ratio>(
            self.fan_air_valve_pid.output(),
        )))
    }
}
/// The X BLEED selector at AUTO. A380 FCOM DSC-36-10-50 (a380_fcom.txt l.94076-94079): the
/// crossbleed valves "are normally closed. They open automatically, and at the same time: On
/// ground, at engine start; When the APU bleed valve is selected open; In case any engine bleed
/// system fails."
///
/// - Engine start: the crossbleed engine start of PRO-SUP-70-10 (l.180984-180988, l.181024-181029:
///   "ALL ENG BLEEDS ... ON, X BLEED ... AUTO, SECOND ENG ... START") gets the starter air of the
///   running engines through these valves. Design choice, the FCOM gives no opening or closing
///   point: "at engine start" is while the FADEC commands the start valve of any engine open, from
///   the ENG MASTER ON (or MAN START ON, crank) to the start valve closing at 58.4 % N2 (DSC-70-30
///   l.113558) or the end/abort of the start. All three valves together ("at the same time"). The
///   valves then close again, unless another condition keeps them open; the FCOM APU BLEED OFF
///   after the start (PRO-NOR-SOP l.119903-119907): "All crossbleed valves close".
/// - An engine bleed failure: an ENG BLEED pb OFF, or an engine bleed lost by an overtemperature or
///   an overpressure with its pb ON (CoreProcessingInputOutputModuleAUnit::engine_bleed_failed).
///
/// A leak closes some of the valves at AUTO (BleedLeakDetection::cross_bleed_valves_to_close).
impl ControllerSignal<CrossBleedValveSignal> for CoreProcessingInputOutputModuleAUnit {
    fn signal(&self) -> Option<CrossBleedValveSignal> {
        match self.cross_bleed_valve_selector {
            CrossBleedValveSelectorMode::Shut => Some(CrossBleedValveSignal::new_closed(
                CrossBleedValveSignalType::Manual,
            )),
            CrossBleedValveSelectorMode::Open => Some(CrossBleedValveSignal::new_open(
                CrossBleedValveSignalType::Manual,
            )),
            CrossBleedValveSelectorMode::Auto => {
                if self.is_apu_bleed_valve_open
                    || self.is_any_bleed_pushbutton_off
                    || self.is_any_engine_bleed_failed
                    || self.is_engine_start_on_ground
                {
                    Some(CrossBleedValveSignal::new_open(
                        CrossBleedValveSignalType::Automatic,
                    ))
                } else {
                    Some(CrossBleedValveSignal::new_closed(
                        CrossBleedValveSignalType::Automatic,
                    ))
                }
            }
        }
    }
}

struct EngineBleedAirSystem {
    high_pressure_id: VariableIdentifier,
    starter_container_pressure_id: VariableIdentifier,
    intermediate_temperature_id: VariableIdentifier,
    high_temperature_id: VariableIdentifier,
    transfer_temperature_id: VariableIdentifier,
    precooler_inlet_temperature_id: VariableIdentifier,
    precooler_outlet_temperature_id: VariableIdentifier,
    starter_container_temperature_id: VariableIdentifier,
    intermediate_pressure_valve_open_id: VariableIdentifier,
    high_pressure_valve_open_id: VariableIdentifier,
    pressure_regulating_valve_open_id: VariableIdentifier,
    starter_valve_open_id: VariableIdentifier,
    starter_pressurized_id: VariableIdentifier,
    intermediate_pressure_transducer_pressure_id: VariableIdentifier,
    transfer_pressure_transducer_pressure_id: VariableIdentifier,
    regulated_pressure_transducer_pressure_id: VariableIdentifier,
    differential_pressure_transducer_pressure_id: VariableIdentifier,

    fan_compression_chamber_controller: EngineCompressionChamberController, // Controls pressure just behind the main fan
    intermediate_pressure_compression_chamber_controller: EngineCompressionChamberController,
    high_pressure_compression_chamber_controller: EngineCompressionChamberController,
    fan_compression_chamber: CompressionChamber,
    intermediate_pressure_compression_chamber: CompressionChamber,
    high_pressure_compression_chamber: CompressionChamber,
    intermediate_pressure_valve: PurelyPneumaticValve,
    high_pressure_valve: ElectroPneumaticValve,
    pressure_regulating_valve: ElectroPneumaticValve,
    /// The overpressure valve downstream of the bleed valve (update_overpressure_valve)
    overpressure_valve_closed: bool,
    overpressure_valve_closed_id: VariableIdentifier,
    transfer_pressure_pipe: PneumaticPipe,
    precooler_inlet_pipe: PneumaticPipe,
    precooler_outlet_pipe: PneumaticPipe,
    precooler_supply_pipe: PneumaticPipe,
    engine_starter_exhaust: PneumaticExhaust,
    engine_starter_container: PneumaticPipe,
    engine_starter_valve: DefaultValve,
    /// Empty the duct of an engine without an air source (engine_ducts_without_air_source)
    precooler_inlet_vent: PneumaticExhaust,
    precooler_outlet_vent: PneumaticExhaust,
    /// Air pressure turns the pneumatic starter (APU, the other engines or ground air): a starter
    /// assisted relight can light up (engine_failure.rs)
    engine_starter_pressurized: bool,
    fan_air_valve: ElectroPneumaticValve,
    precooler: Precooler,
    /// flyPad ATA 36 failures (as the A320 model): the bleed valve stuck. A stuck open valve no
    /// longer regulates the pressure: at high power the bleed overpressure and overheat follow.
    bleed_valve_stuck_closed: Failure,
    bleed_valve_stuck_open: Failure,
    /// A leak of the engine duct in the pylon, downstream of the bleed valve: the bleed valve
    /// closure isolates it
    pylon_leak: Failure,
    pylon_leak_exhaust: PneumaticExhaust,
    pylon_leaking_air_temperature: Option<ThermodynamicTemperature>,
    /// A leak of the duct in the wing zone of this engine, downstream of the precooler
    wing_leak: Failure,
    wing_leak_exhaust: PneumaticExhaust,
    wing_leaking_air_temperature: Option<ThermodynamicTemperature>,

    intermediate_pressure_transducer: PressureTransducer,
    transfer_pressure_transducer: PressureTransducer,
    regulated_pressure_transducer: PressureTransducer,
    differential_pressure_transducer: DifferentialPressureTransducer,
}
impl EngineBleedAirSystem {
    const MIN_ENGINE_START_CONTAINER_PRESSURE_PSIG_HIGH: f64 = 10.;
    const MIN_ENGINE_START_CONTAINER_PRESSURE_PSIG_LOW: f64 = 5.;
    /// How fast the starter turbine vents the starter duct overboard (1/s). Design choice, no FCOM
    /// value. The A380 FCOM DSC-70-30 (a380_fcom.txt l.113555-113559) only says that the start
    /// valve is "fully closed after approximately 10 s": the starter gets no more air after that.
    /// The former 3e-2 kept the duct pressurized for about 45 s after the start valve closed
    /// (STARTER_PRESSURIZED stayed 1), so a ground relight in that time lit up without APU or
    /// crossbleed air. The A320 model raised its own value for the same reason when it introduced
    /// STARTER_PRESSURIZED (#8066: 10 / s, with a 0.3 m3 duct); the A380 start valve cannot keep
    /// its 0.5 m3 duct above 10 PSIG at that rate. 0.5 / s keeps about 21 PSIG with the APU bleed
    /// and empties the duct below 5 PSIG within about 3 s of the start valve closing.
    const ENGINE_STARTER_EXHAUST_SPEED: f64 = 0.5;
    /// How fast the duct of an engine without an air source empties (1/s, engine_ducts_without_air_source).
    /// Design choice, no FCOM value: the trapped air is gone within about 3 s.
    const ISOLATED_DUCT_VENT_SPEED: f64 = 1.;
    /// A380 FCOM DSC-36-10-20 (a380_fcom.txt l.93886-93888): "In case pressure regulation fails, an
    /// OverPressure Valve (OPV) protects the bleed system. This valve automatically closes, if the
    /// bleed pressure downstream of the engine bleed valve exceeds 85 PSI. It automatically opens
    /// again, when pressure goes below 55 PSI."
    const OVERPRESSURE_VALVE_CLOSING_PSIG: f64 = 85.;
    const OVERPRESSURE_VALVE_OPENING_PSIG: f64 = 55.;

    fn new(context: &mut InitContext, number: usize, powered_by: ElectricalBusType) -> Self {
        Self {
            high_pressure_id: context.get_identifier(format!("PNEU_ENG_{}_HP_PRESSURE", number)),
            starter_container_pressure_id: context
                .get_identifier(format!("PNEU_ENG_{}_STARTER_CONTAINER_PRESSURE", number)),
            intermediate_temperature_id: context
                .get_identifier(format!("PNEU_ENG_{}_IP_TEMPERATURE", number)),
            high_temperature_id: context
                .get_identifier(format!("PNEU_ENG_{}_HP_TEMPERATURE", number)),
            transfer_temperature_id: context
                .get_identifier(format!("PNEU_ENG_{}_TRANSFER_TEMPERATURE", number)),
            precooler_inlet_temperature_id: context
                .get_identifier(format!("PNEU_ENG_{}_PRECOOLER_INLET_TEMPERATURE", number)),
            precooler_outlet_temperature_id: context
                .get_identifier(format!("PNEU_ENG_{}_PRECOOLER_OUTLET_TEMPERATURE", number)),
            starter_container_temperature_id: context
                .get_identifier(format!("PNEU_ENG_{}_STARTER_CONTAINER_TEMPERATURE", number)),
            intermediate_pressure_valve_open_id: context
                .get_identifier(format!("PNEU_ENG_{}_IP_VALVE_OPEN", number)),
            high_pressure_valve_open_id: context
                .get_identifier(format!("PNEU_ENG_{}_HP_VALVE_OPEN", number)),
            pressure_regulating_valve_open_id: context
                .get_identifier(format!("PNEU_ENG_{}_PR_VALVE_OPEN", number)),
            starter_valve_open_id: context
                .get_identifier(format!("PNEU_ENG_{}_STARTER_VALVE_OPEN", number)),
            starter_pressurized_id: context
                .get_identifier(format!("PNEU_ENG_{}_STARTER_PRESSURIZED", number)),
            intermediate_pressure_transducer_pressure_id: context.get_identifier(format!(
                "PNEU_ENG_{}_INTERMEDIATE_TRANSDUCER_PRESSURE",
                number
            )),
            transfer_pressure_transducer_pressure_id: context
                .get_identifier(format!("PNEU_ENG_{}_TRANSFER_TRANSDUCER_PRESSURE", number)),
            regulated_pressure_transducer_pressure_id: context
                .get_identifier(format!("PNEU_ENG_{}_REGULATED_TRANSDUCER_PRESSURE", number)),
            differential_pressure_transducer_pressure_id: context.get_identifier(format!(
                "PNEU_ENG_{}_DIFFERENTIAL_TRANSDUCER_PRESSURE",
                number
            )),
            // TODO: These constants are copied from the A320
            fan_compression_chamber_controller: EngineCompressionChamberController::new(2., 0.),
            intermediate_pressure_compression_chamber_controller:
                EngineCompressionChamberController::new(2.77366, 0.0667803),
            high_pressure_compression_chamber_controller: EngineCompressionChamberController::new(
                2.40411, 1.61386,
            ),
            fan_compression_chamber: CompressionChamber::new(Volume::new::<cubic_meter>(1.)),
            intermediate_pressure_compression_chamber: CompressionChamber::new(Volume::new::<
                cubic_meter,
            >(1.)),
            high_pressure_compression_chamber: CompressionChamber::new(Volume::new::<cubic_meter>(
                1.,
            )),
            intermediate_pressure_valve: PurelyPneumaticValve::new(),
            high_pressure_valve: ElectroPneumaticValve::new(powered_by),
            pressure_regulating_valve: ElectroPneumaticValve::new(powered_by),
            overpressure_valve_closed: false,
            overpressure_valve_closed_id: context
                .get_identifier(format!("PNEU_ENG_{}_OVERPRESSURE_VALVE_CLOSED", number)),
            fan_air_valve: ElectroPneumaticValve::new(powered_by),
            transfer_pressure_pipe: PneumaticPipe::new(
                Volume::new::<cubic_meter>(1.),
                Pressure::new::<psi>(14.7),
                ThermodynamicTemperature::new::<degree_celsius>(15.),
            ),
            precooler_inlet_pipe: PneumaticPipe::new(
                Volume::new::<cubic_meter>(0.5),
                Pressure::new::<psi>(14.7),
                ThermodynamicTemperature::new::<degree_celsius>(15.),
            ),
            precooler_outlet_pipe: PneumaticPipe::new(
                Volume::new::<cubic_meter>(2.5),
                Pressure::new::<psi>(14.7),
                ThermodynamicTemperature::new::<degree_celsius>(15.),
            ),
            precooler_supply_pipe: PneumaticPipe::new(
                Volume::new::<cubic_meter>(1.),
                Pressure::new::<psi>(14.7),
                ThermodynamicTemperature::new::<degree_celsius>(15.),
            ),
            engine_starter_container: PneumaticPipe::new(
                Volume::new::<cubic_meter>(0.5),
                Pressure::new::<psi>(14.7),
                ThermodynamicTemperature::new::<degree_celsius>(15.),
            ),
            engine_starter_exhaust: PneumaticExhaust::new(
                Self::ENGINE_STARTER_EXHAUST_SPEED,
                Self::ENGINE_STARTER_EXHAUST_SPEED,
                Pressure::new::<psi>(0.),
            ),
            engine_starter_valve: DefaultValve::new_closed(),
            precooler_inlet_vent: PneumaticExhaust::new(
                Self::ISOLATED_DUCT_VENT_SPEED,
                Self::ISOLATED_DUCT_VENT_SPEED,
                Pressure::new::<psi>(0.),
            ),
            precooler_outlet_vent: PneumaticExhaust::new(
                Self::ISOLATED_DUCT_VENT_SPEED,
                Self::ISOLATED_DUCT_VENT_SPEED,
                Pressure::new::<psi>(0.),
            ),
            engine_starter_pressurized: false,
            precooler: Precooler::new(180. * 2.),
            bleed_valve_stuck_closed: Failure::new(FailureType::EngineBleedValveStuckClosed(
                number,
            )),
            bleed_valve_stuck_open: Failure::new(FailureType::EngineBleedValveStuckOpen(number)),
            pylon_leak: Failure::new(FailureType::EngineBleedLeak(number)),
            pylon_leak_exhaust: new_leak_exhaust(),
            pylon_leaking_air_temperature: None,
            wing_leak: Failure::new(FailureType::WingBleedLeak(number)),
            wing_leak_exhaust: new_leak_exhaust(),
            wing_leaking_air_temperature: None,
            intermediate_pressure_transducer: PressureTransducer::new(powered_by),
            transfer_pressure_transducer: PressureTransducer::new(powered_by),
            regulated_pressure_transducer: PressureTransducer::new(powered_by),
            differential_pressure_transducer: DifferentialPressureTransducer::new(powered_by),
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        high_pressure_valve_controller: &impl ControllerSignal<HighPressureValveSignal>,
        pressure_regulating_valve_controller: &impl ControllerSignal<PressureRegulatingValveSignal>,
        engine_starter_valve_controller: &impl ControllerSignal<EngineStarterValveSignal>,
        fan_air_valve_controller: &impl ControllerSignal<FanAirValveSignal>,
        engine: &(impl EngineCorrectedN1 + EngineCorrectedN2),
    ) {
        // Update engines
        self.fan_compression_chamber_controller
            .update(context, engine);
        self.intermediate_pressure_compression_chamber_controller
            .update(context, engine);
        self.high_pressure_compression_chamber_controller
            .update(context, engine);

        self.fan_compression_chamber
            .update(&self.fan_compression_chamber_controller);
        self.intermediate_pressure_compression_chamber
            .update(&self.intermediate_pressure_compression_chamber_controller);
        self.high_pressure_compression_chamber
            .update(&self.high_pressure_compression_chamber_controller);

        self.high_pressure_valve
            .update_open_amount(high_pressure_valve_controller);
        match stuck_valve_open_amount(&self.bleed_valve_stuck_closed, &self.bleed_valve_stuck_open)
        {
            Some(open_amount) => self
                .pressure_regulating_valve
                .update_open_amount::<PressureRegulatingValveSignal, _>(&FixedValveCommand(
                    open_amount,
                )),
            None => self
                .pressure_regulating_valve
                .update_open_amount(pressure_regulating_valve_controller),
        }
        self.engine_starter_valve
            .update_open_amount(engine_starter_valve_controller);
        self.fan_air_valve
            .update_open_amount(fan_air_valve_controller);

        self.intermediate_pressure_valve.update_move_fluid(
            context,
            &mut self.intermediate_pressure_compression_chamber,
            &mut self.transfer_pressure_pipe,
        );
        self.high_pressure_valve.update_move_fluid(
            context,
            &mut self.high_pressure_compression_chamber,
            &mut self.transfer_pressure_pipe,
        );
        self.fan_air_valve.update_move_fluid(
            context,
            &mut self.fan_compression_chamber,
            &mut self.precooler_supply_pipe,
        );
        // The overpressure valve is in series with the bleed valve: closed, no air flows through
        // either, whatever the bleed valve position
        self.update_overpressure_valve(context);
        if !self.overpressure_valve_closed {
            self.pressure_regulating_valve.update_move_fluid(
                context,
                &mut self.transfer_pressure_pipe,
                &mut self.precooler_inlet_pipe,
            );
        }
        self.precooler.update(
            context,
            &mut self.precooler_inlet_pipe,
            &mut self.precooler_supply_pipe,
            &mut self.precooler_outlet_pipe,
        );
        self.engine_starter_valve.update_move_fluid(
            context,
            &mut self.precooler_inlet_pipe,
            &mut self.engine_starter_container,
        );
        self.engine_starter_exhaust
            .update_move_fluid(context, &mut self.engine_starter_container);

        self.update_leaks(context);

        self.intermediate_pressure_transducer
            .update(context, &self.intermediate_pressure_compression_chamber);
        self.transfer_pressure_transducer
            .update(context, &self.transfer_pressure_pipe);
        self.regulated_pressure_transducer
            .update(context, &self.precooler_inlet_pipe);
        self.differential_pressure_transducer
            .update(&self.precooler_inlet_pipe, &self.precooler_outlet_pipe);

        self.update_engine_start_pressurization(context);
    }

    /// The overpressure valve, a pneumatic valve that senses the pressure downstream of the bleed
    /// valve (the regulated pressure, precooler inlet): closed above 85 PSI, open again below 55 PSI
    /// (OVERPRESSURE_VALVE_CLOSING_PSIG). Pressures are gauge pressures, as the 40 PSI of the bleed
    /// regulation.
    fn update_overpressure_valve(&mut self, context: &UpdateContext) {
        let downstream_pressure_psig =
            (self.precooler_inlet_pipe.pressure() - context.ambient_pressure()).get::<psi>();
        self.overpressure_valve_closed = if self.overpressure_valve_closed {
            downstream_pressure_psig > Self::OVERPRESSURE_VALVE_OPENING_PSIG
        } else {
            downstream_pressure_psig > Self::OVERPRESSURE_VALVE_CLOSING_PSIG
        };
    }

    /// Bleed air flows from the engine compressor into the bleed duct: the bleed valve is open and
    /// the overpressure valve is not closed
    fn bleed_air_flows(&self) -> bool {
        self.pressure_regulating_valve.is_open() && !self.overpressure_valve_closed
    }

    /// The overpressure valve is closed (update_overpressure_valve)
    fn overpressure_valve_closed(&self) -> bool {
        self.overpressure_valve_closed
    }

    /// The airflow through the bleed valve (the flow of the previous update)
    fn bleed_valve_air_flow(&self) -> MassRate {
        self.pressure_regulating_valve.fluid_flow()
    }

    /// The starter container gauge pressure, with a hysteresis. The A380 FCOM gives no value: the
    /// 10 / 5 PSI (gauge) of the A320 pneumatic model (a320_systems pneumatic.rs) are used.
    fn update_engine_start_pressurization(&mut self, context: &UpdateContext) {
        let starter_container_pressure_psig =
            (self.engine_starter_container.pressure() - context.ambient_pressure()).get::<psi>();

        self.engine_starter_pressurized = if self.engine_starter_pressurized {
            starter_container_pressure_psig > Self::MIN_ENGINE_START_CONTAINER_PRESSURE_PSIG_LOW
        } else {
            starter_container_pressure_psig > Self::MIN_ENGINE_START_CONTAINER_PRESSURE_PSIG_HIGH
        };
    }

    /// The leak failures blow the duct air out, and on their detection loops while the duct is
    /// pressurised. Design choice (as the A320 model): while the bleed valve lets air through, the
    /// pylon leak blows air at the temperature of the compressor air (transfer duct).
    fn update_leaks(&mut self, context: &UpdateContext) {
        if self.pylon_leak.is_active() {
            self.pylon_leak_exhaust
                .update_move_fluid(context, &mut self.precooler_inlet_pipe);
        }
        if self.wing_leak.is_active() {
            self.wing_leak_exhaust
                .update_move_fluid(context, &mut self.precooler_outlet_pipe);
        }
        let bleed_air_flows = self.bleed_air_flows();
        let transfer_temperature = self.transfer_pressure_pipe.temperature();
        self.pylon_leaking_air_temperature = leaking_air_temperature(
            context,
            self.pylon_leak.is_active(),
            &self.precooler_inlet_pipe,
        )
        .map(|inlet_temperature| {
            if bleed_air_flows {
                inlet_temperature.max(transfer_temperature)
            } else {
                inlet_temperature
            }
        });
        self.wing_leaking_air_temperature = leaking_air_temperature(
            context,
            self.wing_leak.is_active(),
            &self.precooler_outlet_pipe,
        );
    }

    /// The air a pylon leak blows on the pylon leak detection loops
    fn pylon_leaking_air_temperature(&self) -> Option<ThermodynamicTemperature> {
        self.pylon_leaking_air_temperature
    }

    /// The air a wing leak blows on the wing leak detection loops
    fn wing_leaking_air_temperature(&self) -> Option<ThermodynamicTemperature> {
        self.wing_leaking_air_temperature
    }

    /// The duct of this engine has no air source: its trapped air leaks away
    /// (engine_ducts_without_air_source).
    fn vent_bleed_duct(&mut self, context: &UpdateContext) {
        self.precooler_inlet_vent
            .update_move_fluid(context, &mut self.precooler_inlet_pipe);
        self.precooler_outlet_vent
            .update_move_fluid(context, &mut self.precooler_outlet_pipe);
    }

    fn intermediate_pressure(&self) -> Pressure {
        self.intermediate_pressure_compression_chamber.pressure()
    }

    fn high_pressure(&self) -> Pressure {
        self.high_pressure_compression_chamber.pressure()
    }

    fn transfer_pressure(&self) -> Pressure {
        self.transfer_pressure_pipe.pressure()
    }

    #[cfg(test)]
    fn precooler_inlet_pressure(&self) -> Pressure {
        self.precooler_inlet_pipe.pressure()
    }

    #[cfg(test)]
    fn precooler_outlet_pressure(&self) -> Pressure {
        self.precooler_outlet_pipe.pressure()
    }

    fn intermediate_temperature(&self) -> ThermodynamicTemperature {
        self.intermediate_pressure_compression_chamber.temperature()
    }

    fn high_temperature(&self) -> ThermodynamicTemperature {
        self.high_pressure_compression_chamber.temperature()
    }

    fn transfer_temperature(&self) -> ThermodynamicTemperature {
        self.transfer_pressure_pipe.temperature()
    }

    fn precooler_inlet_temperature(&self) -> ThermodynamicTemperature {
        self.precooler_inlet_pipe.temperature()
    }

    fn precooler_outlet_temperature(&self) -> ThermodynamicTemperature {
        self.precooler_outlet_pipe.temperature()
    }

    fn engine_starter_valve_is_open(&self) -> bool {
        self.engine_starter_valve.is_open()
    }

    fn pressure_regulating_valve_is_open(&self) -> bool {
        self.pressure_regulating_valve.is_open()
    }

    fn intermediate_pressure_transducer_pressure(&self) -> Option<Pressure> {
        self.intermediate_pressure_transducer.signal()
    }

    fn transfer_pressure_transducer_pressure(&self) -> Option<Pressure> {
        self.transfer_pressure_transducer.signal()
    }

    fn regulated_pressure_transducer_pressure(&self) -> Option<Pressure> {
        self.regulated_pressure_transducer.signal()
    }

    fn differential_pressure_transducer_pressure(&self) -> Option<Pressure> {
        self.differential_pressure_transducer.signal()
    }
}
impl SimulationElement for EngineBleedAirSystem {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.high_pressure_valve.accept(visitor);
        self.pressure_regulating_valve.accept(visitor);
        self.fan_air_valve.accept(visitor);

        self.intermediate_pressure_transducer.accept(visitor);
        self.transfer_pressure_transducer.accept(visitor);
        self.regulated_pressure_transducer.accept(visitor);
        self.differential_pressure_transducer.accept(visitor);

        self.bleed_valve_stuck_closed.accept(visitor);
        self.bleed_valve_stuck_open.accept(visitor);
        self.pylon_leak.accept(visitor);
        self.wing_leak.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.intermediate_pressure_transducer_pressure_id,
            self.intermediate_pressure_transducer_pressure()
                .map_or(-1., |p| p.get::<psi>()),
        );
        writer.write(&self.high_pressure_id, self.high_pressure());
        writer.write(
            &self.transfer_pressure_transducer_pressure_id,
            self.transfer_pressure_transducer_pressure()
                .map_or(-1., |p| p.get::<psi>()),
        );
        writer.write(
            &self.regulated_pressure_transducer_pressure_id,
            self.regulated_pressure_transducer_pressure()
                .map_or(-1., |p| p.get::<psi>()),
        );
        writer.write(
            &self.differential_pressure_transducer_pressure_id,
            self.differential_pressure_transducer_pressure()
                .map_or(-1., |p| p.get::<psi>()),
        );
        writer.write(
            &self.starter_container_pressure_id,
            self.engine_starter_container.pressure(),
        );
        writer.write(
            &self.intermediate_temperature_id,
            self.intermediate_temperature(),
        );
        writer.write(&self.high_temperature_id, self.high_temperature());
        writer.write(&self.transfer_temperature_id, self.transfer_temperature());
        writer.write(
            &self.precooler_inlet_temperature_id,
            self.precooler_inlet_temperature(),
        );
        writer.write(
            &self.precooler_outlet_temperature_id,
            self.precooler_outlet_temperature(),
        );
        writer.write(
            &self.starter_container_temperature_id,
            self.engine_starter_container.temperature(),
        );
        writer.write(
            &self.intermediate_pressure_valve_open_id,
            self.intermediate_pressure_valve.is_open(),
        );
        writer.write(
            &self.high_pressure_valve_open_id,
            self.high_pressure_valve.is_open(),
        );
        writer.write(
            &self.pressure_regulating_valve_open_id,
            self.pressure_regulating_valve.is_open(),
        );
        writer.write(
            &self.overpressure_valve_closed_id,
            self.overpressure_valve_closed,
        );
        writer.write(
            &self.starter_valve_open_id,
            self.engine_starter_valve.is_open(),
        );
        writer.write(
            &self.starter_pressurized_id,
            self.engine_starter_pressurized,
        );
    }
}
impl PneumaticContainer for EngineBleedAirSystem {
    fn pressure(&self) -> Pressure {
        self.precooler_outlet_pipe.pressure()
    }

    fn volume(&self) -> Volume {
        self.precooler_outlet_pipe.volume()
    }

    fn temperature(&self) -> ThermodynamicTemperature {
        self.precooler_outlet_pipe.temperature()
    }

    fn mass(&self) -> Mass {
        self.precooler_outlet_pipe.mass()
    }

    fn change_fluid_amount(
        &mut self,
        fluid_amount: Mass,
        fluid_temperature: ThermodynamicTemperature,
        fluid_pressure: Pressure,
    ) {
        self.precooler_outlet_pipe.change_fluid_amount(
            fluid_amount,
            fluid_temperature,
            fluid_pressure,
        )
    }

    fn update_temperature(&mut self, temperature: TemperatureInterval) {
        self.precooler_outlet_pipe.update_temperature(temperature);
    }
}

pub struct A380PneumaticOverheadPanel {
    apu_bleed: OnOffFaultPushButton,
    cross_bleed: CrossBleedValveSelectorKnob,
    engine_1_bleed: AutoOffFaultPushButton,
    engine_2_bleed: AutoOffFaultPushButton,
    engine_3_bleed: AutoOffFaultPushButton,
    engine_4_bleed: AutoOffFaultPushButton,
}
impl A380PneumaticOverheadPanel {
    pub fn new(context: &mut InitContext) -> Self {
        A380PneumaticOverheadPanel {
            apu_bleed: OnOffFaultPushButton::new_on(context, "PNEU_APU_BLEED"),
            cross_bleed: CrossBleedValveSelectorKnob::new_auto(context),
            engine_1_bleed: AutoOffFaultPushButton::new_auto(context, "PNEU_ENG_1_BLEED"),
            engine_2_bleed: AutoOffFaultPushButton::new_auto(context, "PNEU_ENG_2_BLEED"),
            engine_3_bleed: AutoOffFaultPushButton::new_auto(context, "PNEU_ENG_3_BLEED"),
            engine_4_bleed: AutoOffFaultPushButton::new_auto(context, "PNEU_ENG_4_BLEED"),
        }
    }

    pub fn apu_bleed_is_on(&self) -> bool {
        self.apu_bleed.is_on()
    }

    pub fn cross_bleed_mode(&self) -> CrossBleedValveSelectorMode {
        self.cross_bleed.mode()
    }

    pub fn engine_bleed_pb_is_auto(&self, engine_number: usize) -> bool {
        match engine_number {
            1 => self.engine_1_bleed.is_auto(),
            2 => self.engine_2_bleed.is_auto(),
            3 => self.engine_3_bleed.is_auto(),
            4 => self.engine_4_bleed.is_auto(),
            _ => panic!("Invalid engine number"),
        }
    }

    /// The FAULT lights of the ENG 1(2)(3)(4) BLEED pb-sw (FCOM DSC-36-20 l.94277-94291)
    pub fn update_fault_lights(&mut self, pneumatic: &A380Pneumatic) {
        self.engine_1_bleed
            .set_fault(pneumatic.engine_bleed_fault(1));
        self.engine_2_bleed
            .set_fault(pneumatic.engine_bleed_fault(2));
        self.engine_3_bleed
            .set_fault(pneumatic.engine_bleed_fault(3));
        self.engine_4_bleed
            .set_fault(pneumatic.engine_bleed_fault(4));
        // AIR APU BLEED LEAK (PRO-ABN a380_fcom.txt l.167794-167796)
        self.apu_bleed.set_fault(pneumatic.apu_bleed_leak());
    }
}
impl EngineBleedPushbutton<4> for A380PneumaticOverheadPanel {
    fn engine_bleed_pushbuttons_are_auto(&self) -> [bool; 4] {
        [
            self.engine_1_bleed.is_auto(),
            self.engine_2_bleed.is_auto(),
            self.engine_3_bleed.is_auto(),
            self.engine_4_bleed.is_auto(),
        ]
    }
}
impl SimulationElement for A380PneumaticOverheadPanel {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.apu_bleed.accept(visitor);
        self.cross_bleed.accept(visitor);
        self.engine_1_bleed.accept(visitor);
        self.engine_2_bleed.accept(visitor);
        self.engine_3_bleed.accept(visitor);
        self.engine_4_bleed.accept(visitor);

        visitor.visit(self);
    }
}

/// We use this simply as an interface to engine parameter simvars. It should probably not be part of the pneumatic system.
pub struct FullAuthorityDigitalEngineControl {
    engine_1_state_id: VariableIdentifier,
    engine_2_state_id: VariableIdentifier,
    engine_3_state_id: VariableIdentifier,
    engine_4_state_id: VariableIdentifier,

    engine_1_state: EngineState,
    engine_2_state: EngineState,
    engine_3_state: EngineState,
    engine_4_state: EngineState,

    engine_mode_selector1_id: VariableIdentifier,
    engine_mode_selector1_position: EngineModeSelector,

    /// The core speed of each engine: the FADEC N3 (the GP7270 N2 of the A380 FCOM)
    engine_core_speed_ids: [VariableIdentifier; 4],
    engine_core_speeds: [Ratio; 4],
}
impl FullAuthorityDigitalEngineControl {
    fn new(context: &mut InitContext) -> Self {
        Self {
            engine_1_state_id: context.get_identifier("ENGINE_STATE:1".to_owned()),
            engine_2_state_id: context.get_identifier("ENGINE_STATE:2".to_owned()),
            engine_3_state_id: context.get_identifier("ENGINE_STATE:3".to_owned()),
            engine_4_state_id: context.get_identifier("ENGINE_STATE:4".to_owned()),
            engine_1_state: EngineState::Off,
            engine_2_state: EngineState::Off,
            engine_3_state: EngineState::Off,
            engine_4_state: EngineState::Off,
            engine_mode_selector1_id: context
                .get_identifier("TURB ENG IGNITION SWITCH EX1:1".to_owned()),
            engine_mode_selector1_position: EngineModeSelector::Norm,
            engine_core_speed_ids: [1, 2, 3, 4]
                .map(|number| context.get_identifier(format!("ENGINE_N3:{}", number))),
            engine_core_speeds: [Ratio::default(); 4],
        }
    }

    fn engine_core_speed(&self, number: usize) -> Ratio {
        self.engine_core_speeds[number - 1]
    }

    fn engine_state(&self, number: usize) -> EngineState {
        match number {
            1 => self.engine_1_state,
            2 => self.engine_2_state,
            3 => self.engine_3_state,
            4 => self.engine_4_state,
            _ => panic!("Invalid engine number"),
        }
    }

    fn engine_mode_selector(&self) -> EngineModeSelector {
        self.engine_mode_selector1_position
    }
}
impl SimulationElement for FullAuthorityDigitalEngineControl {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.engine_1_state = reader.read_discrete_or_fallback(
            &self.engine_1_state_id,
            "EngineState1",
            EngineState::Off,
        );
        self.engine_2_state = reader.read_discrete_or_fallback(
            &self.engine_2_state_id,
            "EngineState2",
            EngineState::Off,
        );
        self.engine_3_state = reader.read_discrete_or_fallback(
            &self.engine_3_state_id,
            "EngineState3",
            EngineState::Off,
        );
        self.engine_4_state = reader.read_discrete_or_fallback(
            &self.engine_4_state_id,
            "EngineState4",
            EngineState::Off,
        );
        self.engine_mode_selector1_position = reader.read_discrete_or_fallback(
            &self.engine_mode_selector1_id,
            "EngineModeSelector",
            EngineModeSelector::Norm,
        );
        for (core_speed, id) in self
            .engine_core_speeds
            .iter_mut()
            .zip(&self.engine_core_speed_ids)
        {
            *core_speed = Ratio::new::<percent>(reader.read(id));
        }
    }
}

/// A struct to hold all the pack related components
pub struct PackComplex {
    pack_number: usize,
    left_pack_flow_valve_id: VariableIdentifier,
    right_pack_flow_valve_id: VariableIdentifier,
    left_pack_flow_valve_flow_rate_id: VariableIdentifier,
    right_pack_flow_valve_flow_rate_id: VariableIdentifier,
    pack_container: PneumaticPipe,
    exhaust: PneumaticExhaust,
    left_pack_flow_valve: ElectroPneumaticValve,
    right_pack_flow_valve: ElectroPneumaticValve,
    left_inlet_pressure_sensor: PressureTransducer,
    right_inlet_pressure_sensor: PressureTransducer,
    // flyPad failures: a jammed pack flow valve no longer follows its controller (left = valve 1, right = valve 2)
    left_pack_flow_valve_jam: Failure,
    right_pack_flow_valve_jam: Failure,
    /// flyPad failure: hot air leaks from the ducts of the pack bay, downstream of the pack valves
    /// (AIR PACK 1(2) LEAK): closing the pack valves isolates it
    bay_leak: Failure,
    bay_leak_exhaust: PneumaticExhaust,
    bay_leaking_air_temperature: Option<ThermodynamicTemperature>,
}
impl PackComplex {
    fn new(context: &mut InitContext, pack_number: usize) -> Self {
        Self {
            pack_number,
            left_pack_flow_valve_id: context
                .get_identifier(format!("COND_PACK_{}_FLOW_VALVE_1_IS_OPEN", pack_number)),
            right_pack_flow_valve_id: context
                .get_identifier(format!("COND_PACK_{}_FLOW_VALVE_2_IS_OPEN", pack_number)),
            left_pack_flow_valve_flow_rate_id: context
                .get_identifier(format!("PNEU_PACK_{}_FLOW_VALVE_1_FLOW_RATE", pack_number)),
            right_pack_flow_valve_flow_rate_id: context
                .get_identifier(format!("PNEU_PACK_{}_FLOW_VALVE_2_FLOW_RATE", pack_number)),
            pack_container: PneumaticPipe::new(
                Volume::new::<cubic_meter>(2.),
                Pressure::new::<psi>(14.7),
                ThermodynamicTemperature::new::<degree_celsius>(15.),
            ),
            exhaust: PneumaticExhaust::new(0.3, 0.3, Pressure::new::<psi>(0.)),
            // These valves are pneumatically operated but will fall closed in case of reverse flow.
            // They can also be electrically closed by DC ESS BUS.
            left_pack_flow_valve: ElectroPneumaticValve::new(
                ElectricalBusType::DirectCurrentEssential,
            ),
            right_pack_flow_valve: ElectroPneumaticValve::new(
                ElectricalBusType::DirectCurrentEssential,
            ),
            left_inlet_pressure_sensor: PressureTransducer::new(
                ElectricalBusType::DirectCurrentEssential, // TODO: This is almost definitely not correct, just copied from the A320
            ),
            right_inlet_pressure_sensor: PressureTransducer::new(
                ElectricalBusType::DirectCurrentEssential, // TODO: This is almost definitely not correct, just copied from the A320
            ),
            // Pack flow valves 1 and 2 are on pack 1, valves 3 and 4 on pack 2 (fcv ids of the FDACs)
            left_pack_flow_valve_jam: Failure::new(FailureType::PackFlowValveJammed(
                1 + ((pack_number == 2) as usize * 2),
            )),
            right_pack_flow_valve_jam: Failure::new(FailureType::PackFlowValveJammed(
                2 + ((pack_number == 2) as usize * 2),
            )),
            bay_leak: Failure::new(FailureType::PackBayLeak(pack_number)),
            bay_leak_exhaust: new_leak_exhaust(),
            bay_leaking_air_temperature: None,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        left_input: &mut impl PneumaticContainer,
        right_input: &mut impl PneumaticContainer,
        pack_flow_valve_signals: &impl PackFlowControllers,
    ) {
        // A jammed valve keeps the open amount it had when it jammed (simplification: a jammed, unpowered valve
        // still moves with the pressure difference, as the healthy valves)
        if !self.left_pack_flow_valve_jam.is_active() {
            self.left_pack_flow_valve.update_open_amount(
                pack_flow_valve_signals
                    .pack_flow_controller(1 + ((self.pack_number == 2) as usize * 2)),
            );
        }

        if !self.right_pack_flow_valve_jam.is_active() {
            self.right_pack_flow_valve.update_open_amount(
                pack_flow_valve_signals
                    .pack_flow_controller(2 + ((self.pack_number == 2) as usize * 2)),
            );
        }

        self.left_pack_flow_valve
            .update_move_fluid(context, left_input, &mut self.pack_container);

        self.right_pack_flow_valve.update_move_fluid(
            context,
            right_input,
            &mut self.pack_container,
        );

        self.exhaust
            .update_move_fluid(context, &mut self.pack_container);

        self.update_bay_leak(
            context,
            [left_input.temperature(), right_input.temperature()],
        );
    }

    /// The bay leak blows the pack inlet air out, and on the pack bay detection loops while the
    /// pack inlet is pressurised. Design choice: the air is the hottest bleed air that the open
    /// pack valves let in (the pack inlet pipe of the model is cooler than that bleed air).
    fn update_bay_leak(
        &mut self,
        context: &UpdateContext,
        side_duct_temperatures: [ThermodynamicTemperature; 2],
    ) {
        if self.bay_leak.is_active() {
            self.bay_leak_exhaust
                .update_move_fluid(context, &mut self.pack_container);
        }
        let pack_valve_open = [
            self.left_pack_flow_valve.is_open(),
            self.right_pack_flow_valve.is_open(),
        ];
        self.bay_leaking_air_temperature =
            leaking_air_temperature(context, self.bay_leak.is_active(), &self.pack_container).map(
                |pack_inlet_temperature| {
                    side_duct_temperatures
                        .into_iter()
                        .zip(pack_valve_open)
                        .filter(|(_, open)| *open)
                        .fold(pack_inlet_temperature, |hottest, (temperature, _)| {
                            hottest.max(temperature)
                        })
                },
            );
    }

    /// The air a bay leak blows on the pack bay leak detection loops
    fn bay_leaking_air_temperature(&self) -> Option<ThermodynamicTemperature> {
        self.bay_leaking_air_temperature
    }

    fn left_pack_flow_valve_is_open(&self) -> bool {
        self.left_pack_flow_valve.is_open()
    }

    fn right_pack_flow_valve_is_open(&self) -> bool {
        self.right_pack_flow_valve.is_open()
    }

    fn left_pack_flow_valve_air_flow(&self) -> MassRate {
        self.left_pack_flow_valve.fluid_flow()
    }

    fn right_pack_flow_valve_air_flow(&self) -> MassRate {
        self.right_pack_flow_valve.fluid_flow()
    }

    fn left_pack_flow_valve_inlet_pressure(&self) -> Option<Pressure> {
        self.left_inlet_pressure_sensor.signal()
    }

    fn right_pack_flow_valve_inlet_pressure(&self) -> Option<Pressure> {
        self.right_inlet_pressure_sensor.signal()
    }
}
impl PneumaticContainer for PackComplex {
    fn pressure(&self) -> Pressure {
        self.pack_container.pressure()
    }

    fn volume(&self) -> Volume {
        self.pack_container.volume()
    }

    fn temperature(&self) -> ThermodynamicTemperature {
        self.pack_container.temperature()
    }

    fn mass(&self) -> Mass {
        self.pack_container.mass()
    }

    fn change_fluid_amount(
        &mut self,
        fluid_amount: Mass,
        fluid_temperature: ThermodynamicTemperature,
        fluid_pressure: Pressure,
    ) {
        self.pack_container
            .change_fluid_amount(fluid_amount, fluid_temperature, fluid_pressure);
    }

    fn update_temperature(&mut self, temperature_change: TemperatureInterval) {
        self.pack_container.update_temperature(temperature_change);
    }
}
impl SimulationElement for PackComplex {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T)
    where
        Self: Sized,
    {
        self.left_pack_flow_valve.accept(visitor);
        self.right_pack_flow_valve.accept(visitor);

        self.left_inlet_pressure_sensor.accept(visitor);
        self.right_inlet_pressure_sensor.accept(visitor);

        self.left_pack_flow_valve_jam.accept(visitor);
        self.right_pack_flow_valve_jam.accept(visitor);
        self.bay_leak.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.left_pack_flow_valve_id,
            self.left_pack_flow_valve_is_open(),
        );
        writer.write(
            &self.right_pack_flow_valve_id,
            self.right_pack_flow_valve_is_open(),
        );
        writer.write(
            &self.left_pack_flow_valve_flow_rate_id,
            self.left_pack_flow_valve.fluid_flow(),
        );
        writer.write(
            &self.right_pack_flow_valve_flow_rate_id,
            self.right_pack_flow_valve.fluid_flow(),
        );
    }
}

/// This is a unique valve (and specific to the A320 probably) because it is controlled by two motors. One for manual control and one for automatic control
pub struct CrossBleedValve {
    valve_id: VariableIdentifier,

    open_amount: Ratio,
    connector: PneumaticContainerConnector,
    is_powered_for_manual_control: bool,
    is_powered_for_automatic_control: bool,
}
impl CrossBleedValve {
    const SPRING_CHARACTERISTIC: f64 = 1.;

    pub fn new(valve_id: VariableIdentifier) -> Self {
        Self {
            valve_id,
            open_amount: Ratio::new::<ratio>(0.),
            connector: PneumaticContainerConnector::new(),
            is_powered_for_manual_control: false,
            is_powered_for_automatic_control: false,
        }
    }

    pub fn update_move_fluid(
        &mut self,
        context: &UpdateContext,
        container_one: &mut impl PneumaticContainer,
        container_two: &mut impl PneumaticContainer,
    ) {
        if !self.is_powered_for_manual_control && !self.is_powered_for_automatic_control {
            self.set_open_amount_from_pressure_difference(
                container_one.pressure() - container_two.pressure(),
            )
        }

        self.connector
            .with_transfer_speed_factor(self.open_amount)
            .update_move_fluid(context, container_one, container_two);
    }

    fn set_open_amount_from_pressure_difference(&mut self, pressure_difference: Pressure) {
        self.open_amount = Ratio::new::<ratio>(
            2. / PI
                * (pressure_difference.get::<psi>() * Self::SPRING_CHARACTERISTIC)
                    .atan()
                    .max(0.),
        );
    }

    fn update_open_amount(&mut self, controller: &impl ControllerSignal<CrossBleedValveSignal>) {
        if let Some(signal) = controller.signal() {
            if signal.signal_type == CrossBleedValveSignalType::Manual
                && self.is_powered_for_manual_control
                || signal.signal_type == CrossBleedValveSignalType::Automatic
                    && self.is_powered_for_automatic_control
            {
                self.open_amount = signal.target_open_amount()
            }
        }
    }
}
impl PneumaticValve for CrossBleedValve {
    fn is_open(&self) -> bool {
        self.open_amount.get::<ratio>() > 0.
    }
}
impl SimulationElement for CrossBleedValve {
    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        // A380 FCOM DSC-36-30 (a380_fcom.txt:94500-94505): each crossbleed valve is supplied by DC 1/2 or DC ESS.
        // The manual control uses the DC ESS supply (the A320 DC ESS SHED busbar does not exist on the A380).
        self.is_powered_for_manual_control =
            buses.is_powered(ElectricalBusType::DirectCurrentEssential);
        self.is_powered_for_automatic_control =
            buses.is_powered(ElectricalBusType::DirectCurrent(2));
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.valve_id, self.is_open());
    }
}

#[cfg(test)]
mod tests {
    use more_asserts::*;
    use ntest::assert_about_eq;
    use rstest::rstest;
    use systems::{
        air_conditioning::{AdirsToAirCondInterface, PackFlowControllers},
        air_starter_unit::AirStarterUnit,
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        engine::trent_engine::TrentEngine,
        failures::FailureType,
        integrated_modular_avionics::AvionicsDataCommunicationNetwork,
        payload::NumberOfPassengers,
        pneumatic::{
            ControllablePneumaticValve, CrossBleedValveSelectorMode, EngineState,
            PneumaticContainer, PneumaticValveSignal, TargetPressureTemperatureSignal,
        },
        shared::{
            arinc429::{Arinc429Word, SignStatus},
            ApuBleedAirValveSignal, CargoDoorLocked, ControllerSignal, ElectricalBusType,
            ElectricalBuses, EmergencyElectricalState, EngineBleedPushbutton, EngineCorrectedN1,
            EngineFirePushButtons, EngineStartState, HydraulicColor,
            InternationalStandardAtmosphere, LgciuWeightOnWheels, MachNumber, PackFlowValveState,
            PneumaticBleed, PneumaticValve, PotentialOrigin,
        },
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft, InitContext, SimulationElement, SimulationElementVisitor, UpdateContext,
        },
    };

    use std::{fs, fs::File, time::Duration};

    use uom::si::{
        f64::*, length::foot, mass_rate::kilogram_per_second, pressure::psi, ratio::ratio,
        thermodynamic_temperature::degree_celsius, velocity::knot,
    };

    use crate::{
        air_conditioning::{A380AirConditioning, A380PressurizationOverheadPanel},
        avionics_data_communication_network::A380AvionicsDataCommunicationNetwork,
        engine_failure::A380EngineFailures,
    };

    use super::{A380Pneumatic, A380PneumaticOverheadPanel};

    struct TestAirConditioning {
        air_conditioning: A380AirConditioning,
        adcn: A380AvionicsDataCommunicationNetwork,
        adirs: TestAdirs,
        dsms: TestDsms,
        payload: TestPayload,
        pressurization_overhead: A380PressurizationOverheadPanel,
    }
    impl TestAirConditioning {
        fn new(context: &mut InitContext) -> Self {
            Self {
                air_conditioning: A380AirConditioning::new(context),
                adcn: A380AvionicsDataCommunicationNetwork::new(context),
                adirs: TestAdirs::new(),
                dsms: TestDsms {},
                payload: TestPayload {},
                pressurization_overhead: A380PressurizationOverheadPanel::new(context),
            }
        }
        fn update(
            &mut self,
            context: &UpdateContext,
            engines: [&impl EngineCorrectedN1; 4],
            engine_fire_push_buttons: &impl EngineFirePushButtons,
            pneumatic: &(impl EngineStartState + PackFlowValveState + PneumaticBleed),
            pneumatic_overhead: &impl EngineBleedPushbutton<4>,
            lgciu: [&impl LgciuWeightOnWheels; 2],
        ) {
            self.air_conditioning.update(
                context,
                &self.adirs,
                &self.dsms,
                &self.adcn,
                engines,
                engine_fire_push_buttons,
                &self.payload,
                pneumatic,
                pneumatic_overhead,
                &self.pressurization_overhead,
                lgciu,
            );
        }
    }
    impl PackFlowControllers for TestAirConditioning {
        type PackFlowControllerSignal =
            <A380AirConditioning as PackFlowControllers>::PackFlowControllerSignal;

        fn pack_flow_controller(&self, fcv_id: usize) -> &Self::PackFlowControllerSignal {
            self.air_conditioning.pack_flow_controller(fcv_id)
        }
    }
    impl SimulationElement for TestAirConditioning {
        fn accept<V: SimulationElementVisitor>(&mut self, visitor: &mut V) {
            self.air_conditioning.accept(visitor);
            self.adcn.accept(visitor);

            visitor.visit(self);
        }
    }

    struct TestAdirs {
        ground_speed: Velocity,
    }
    impl TestAdirs {
        fn new() -> Self {
            Self {
                ground_speed: Velocity::default(),
            }
        }
    }
    impl AdirsToAirCondInterface for TestAdirs {
        fn ground_speed(&self, _adiru_number: usize) -> Arinc429Word<Velocity> {
            Arinc429Word::new(self.ground_speed, SignStatus::NormalOperation)
        }
        fn true_airspeed(&self, _adiru_number: usize) -> Arinc429Word<Velocity> {
            Arinc429Word::new(Velocity::default(), SignStatus::NoComputedData)
        }
        fn baro_correction(&self, _adiru_number: usize) -> Arinc429Word<Pressure> {
            Arinc429Word::new(Pressure::default(), SignStatus::NoComputedData)
        }
        fn ambient_static_pressure(&self, _adiru_number: usize) -> Arinc429Word<Pressure> {
            Arinc429Word::new(Pressure::default(), SignStatus::NoComputedData)
        }
    }

    struct TestDsms {}

    impl CargoDoorLocked for TestDsms {
        fn aft_cargo_door_locked(&self) -> bool {
            true
        }
        fn fwd_cargo_door_locked(&self) -> bool {
            true
        }
    }

    struct TestPayload;
    impl NumberOfPassengers for TestPayload {
        fn number_of_passengers(&self, _ps: usize) -> i8 {
            0
        }
    }

    struct TestLgciu {
        compressed: bool,
    }
    impl TestLgciu {
        fn new(compressed: bool) -> Self {
            Self { compressed }
        }
    }
    impl LgciuWeightOnWheels for TestLgciu {
        fn left_and_right_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            self.compressed
        }
        fn right_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            true
        }
        fn right_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            false
        }
        fn left_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            true
        }
        fn left_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            false
        }
        fn left_and_right_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            false
        }
        fn nose_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            true
        }
        fn nose_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            false
        }
    }

    struct TestApu {
        bleed_air_valve_signal: ApuBleedAirValveSignal,
        bleed_air_pressure: Pressure,
        bleed_air_temperature: ThermodynamicTemperature,
    }
    impl TestApu {
        fn new() -> Self {
            Self {
                bleed_air_valve_signal: ApuBleedAirValveSignal::new_closed(),
                bleed_air_pressure: Pressure::new::<psi>(14.7),
                bleed_air_temperature: ThermodynamicTemperature::new::<degree_celsius>(15.),
            }
        }

        fn update(&self, bleed_valve: &mut impl ControllablePneumaticValve) {
            bleed_valve.update_open_amount::<ApuBleedAirValveSignal, Self>(self);
        }

        fn set_bleed_air_pressure(&mut self, pressure: Pressure) {
            self.bleed_air_pressure = pressure;
        }

        fn set_bleed_air_temperature(&mut self, temperature: ThermodynamicTemperature) {
            self.bleed_air_temperature = temperature;
        }

        fn set_bleed_air_valve_signal(&mut self, signal: ApuBleedAirValveSignal) {
            self.bleed_air_valve_signal = signal;
        }
    }
    impl ControllerSignal<ApuBleedAirValveSignal> for TestApu {
        fn signal(&self) -> Option<ApuBleedAirValveSignal> {
            Some(self.bleed_air_valve_signal)
        }
    }
    impl ControllerSignal<TargetPressureTemperatureSignal> for TestApu {
        fn signal(&self) -> Option<TargetPressureTemperatureSignal> {
            Some(TargetPressureTemperatureSignal::new(
                self.bleed_air_pressure,
                self.bleed_air_temperature,
            ))
        }
    }

    struct TestEngineFirePushButtons {
        is_released: [bool; 4],
    }
    impl TestEngineFirePushButtons {
        fn new() -> Self {
            Self {
                is_released: [false; 4],
            }
        }

        fn release(&mut self, engine_number: usize) {
            self.is_released[engine_number - 1] = true;
        }
    }
    impl EngineFirePushButtons for TestEngineFirePushButtons {
        fn is_released(&self, engine_number: usize) -> bool {
            self.is_released[engine_number - 1]
        }
    }

    struct A380TestElectrical {
        airspeed: Velocity,
        all_ac_lost: bool,
    }
    impl A380TestElectrical {
        pub fn new() -> Self {
            A380TestElectrical {
                airspeed: Velocity::new::<knot>(100.),
                all_ac_lost: false,
            }
        }

        fn update(&mut self, context: &UpdateContext) {
            self.airspeed = context.indicated_airspeed();
        }
    }
    impl EmergencyElectricalState for A380TestElectrical {
        fn is_in_emergency_elec(&self) -> bool {
            self.all_ac_lost && self.airspeed >= Velocity::new::<knot>(100.)
        }
    }
    impl SimulationElement for A380TestElectrical {
        fn receive_power(&mut self, buses: &impl ElectricalBuses) {
            self.all_ac_lost = !buses.is_powered(ElectricalBusType::AlternatingCurrent(1))
                && !buses.is_powered(ElectricalBusType::AlternatingCurrent(2));
        }
    }

    struct PneumaticTestAircraft {
        pneumatic: A380Pneumatic,
        air_conditioning: TestAirConditioning,
        lgciu: TestLgciu,
        apu: TestApu,
        asu: AirStarterUnit,
        engine_1: TrentEngine,
        engine_2: TrentEngine,
        engine_3: TrentEngine,
        engine_4: TrentEngine,
        pneumatic_overhead_panel: A380PneumaticOverheadPanel,
        fire_pushbuttons: TestEngineFirePushButtons,
        /// The relight of a failed engine reads the starter air pressure (engine_failure.rs)
        engine_failures: A380EngineFailures,
        electrical: A380TestElectrical,
        powered_source: TestElectricitySource,
        dc_1_bus: ElectricalBus,
        dc_2_bus: ElectricalBus,
        dc_ess_bus: ElectricalBus,
        /// The bus of the CPIOM-A2 and A3 (avionics_data_communication_network.rs)
        dc_108ph_bus: ElectricalBus,
        ac_1_bus: ElectricalBus,
        ac_2_bus: ElectricalBus,
        ac_4_bus: ElectricalBus,
        // Electric buses states to be able to kill them dynamically
        is_dc_1_powered: bool,
        is_dc_2_powered: bool,
        is_dc_ess_powered: bool,
        is_ac_1_powered: bool,
        is_ac_2_powered: bool,
    }
    impl PneumaticTestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                pneumatic: A380Pneumatic::new(context),
                air_conditioning: TestAirConditioning::new(context),
                lgciu: TestLgciu::new(true),
                apu: TestApu::new(),
                asu: AirStarterUnit::new(context),
                engine_1: TrentEngine::new(context, 1),
                engine_2: TrentEngine::new(context, 2),
                engine_3: TrentEngine::new(context, 3),
                engine_4: TrentEngine::new(context, 4),
                pneumatic_overhead_panel: A380PneumaticOverheadPanel::new(context),
                fire_pushbuttons: TestEngineFirePushButtons::new(),
                engine_failures: A380EngineFailures::new(context),
                electrical: A380TestElectrical::new(),
                powered_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),
                dc_1_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
                dc_2_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(2)),
                dc_ess_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentEssential),
                dc_108ph_bus: ElectricalBus::new(
                    context,
                    ElectricalBusType::DirectCurrentNamed("108PH"),
                ),
                ac_1_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(1)),
                ac_2_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(2)),
                ac_4_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(4)),
                is_dc_1_powered: true,
                is_dc_2_powered: true,
                is_dc_ess_powered: true,
                is_ac_1_powered: true,
                is_ac_2_powered: true,
            }
        }

        fn set_dc_ess_bus_power(&mut self, is_powered: bool) {
            self.is_dc_ess_powered = is_powered;
        }

        fn set_dc_2_bus_power(&mut self, is_powered: bool) {
            self.is_dc_2_powered = is_powered;
        }
    }
    impl Aircraft for PneumaticTestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _context: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            electricity.supplied_by(&self.powered_source);

            if self.is_dc_1_powered {
                electricity.flow(&self.powered_source, &self.dc_1_bus);
            }

            if self.is_dc_2_powered {
                electricity.flow(&self.powered_source, &self.dc_2_bus);
            }

            if self.is_dc_ess_powered {
                electricity.flow(&self.powered_source, &self.dc_ess_bus);
            }
            electricity.flow(&self.powered_source, &self.dc_108ph_bus);

            if self.is_ac_1_powered {
                electricity.flow(&self.powered_source, &self.ac_1_bus);
            }

            if self.is_ac_2_powered {
                electricity.flow(&self.powered_source, &self.ac_2_bus);
                electricity.flow(&self.powered_source, &self.ac_4_bus);
            }
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.electrical.update(context);

            self.apu.update(self.pneumatic.apu_bleed_air_valve());
            self.asu.update();
            let cpiom_a_available = ["A1", "A2", "A3", "A4"]
                .map(|cpiom| self.air_conditioning.adcn.get_cpiom(cpiom).is_available());
            let hot_air_valves_open = [1, 2].map(|hot_air| {
                self.air_conditioning
                    .air_conditioning
                    .hot_air_valve_is_open(hot_air)
            });
            self.pneumatic.update(
                context,
                [
                    &self.engine_1,
                    &self.engine_2,
                    &self.engine_3,
                    &self.engine_4,
                ],
                &self.pneumatic_overhead_panel,
                &self.fire_pushbuttons,
                &self.apu,
                &self.asu,
                &self.air_conditioning,
                cpiom_a_available,
                hot_air_valves_open,
            );
            self.pneumatic_overhead_panel
                .update_fault_lights(&self.pneumatic);
            self.engine_failures.update(context, [false; 4]);
            self.air_conditioning.update(
                context,
                [
                    &self.engine_1,
                    &self.engine_2,
                    &self.engine_3,
                    &self.engine_4,
                ],
                &self.fire_pushbuttons,
                &self.pneumatic,
                &self.pneumatic_overhead_panel,
                [&self.lgciu; 2],
            )
        }
    }
    impl SimulationElement for PneumaticTestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.electrical.accept(visitor);
            self.pneumatic.accept(visitor);
            self.asu.accept(visitor);
            self.engine_1.accept(visitor);
            self.engine_2.accept(visitor);
            self.engine_3.accept(visitor);
            self.engine_4.accept(visitor);
            self.pneumatic_overhead_panel.accept(visitor);
            self.air_conditioning.accept(visitor);
            self.engine_failures.accept(visitor);

            visitor.visit(self);
        }
    }
    struct PneumaticTestBed {
        test_bed: SimulationTestBed<PneumaticTestAircraft>,
    }
    impl TestBed for PneumaticTestBed {
        type Aircraft = PneumaticTestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<PneumaticTestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<PneumaticTestAircraft> {
            &mut self.test_bed
        }
    }
    impl PneumaticTestBed {
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::<PneumaticTestAircraft>::new(|context| {
                    PneumaticTestAircraft::new(context)
                }),
            };
            test_bed.command_pack_flow_selector_position(1);

            test_bed
        }

        fn and_run(mut self) -> Self {
            self.run();

            self
        }

        fn and_stabilize(mut self) -> Self {
            self.test_bed.run_multiple_frames(Duration::from_secs(16));

            self
        }

        fn mach_number(mut self, mach: MachNumber) -> Self {
            self.write_by_name("AIRSPEED MACH", mach);

            self
        }

        fn in_isa_atmosphere(mut self, altitude: Length) -> Self {
            self.set_pressure_altitude(altitude);
            self.set_ambient_pressure(InternationalStandardAtmosphere::pressure_at_altitude(
                altitude,
            ));
            self.set_ambient_temperature(InternationalStandardAtmosphere::temperature_at_altitude(
                altitude,
            ));

            self
        }

        fn idle_eng1(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:1", true);
            self.write_by_name("TURB ENG CORRECTED N2:1", Ratio::new::<ratio>(0.55));
            self.write_by_name("TURB ENG CORRECTED N1:1", Ratio::new::<ratio>(0.2));
            self.write_by_name("ENGINE_STATE:1", EngineState::On);

            self
        }

        fn idle_eng2(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:2", true);
            self.write_by_name("TURB ENG CORRECTED N2:2", Ratio::new::<ratio>(0.55));
            self.write_by_name("TURB ENG CORRECTED N1:2", Ratio::new::<ratio>(0.2));
            self.write_by_name("ENGINE_STATE:2", EngineState::On);

            self
        }

        fn idle_eng3(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:3", true);
            self.write_by_name("TURB ENG CORRECTED N2:3", Ratio::new::<ratio>(0.55));
            self.write_by_name("TURB ENG CORRECTED N1:3", Ratio::new::<ratio>(0.2));
            self.write_by_name("ENGINE_STATE:3", EngineState::On);

            self
        }

        fn idle_eng4(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:4", true);
            self.write_by_name("TURB ENG CORRECTED N2:4", Ratio::new::<ratio>(0.55));
            self.write_by_name("TURB ENG CORRECTED N1:4", Ratio::new::<ratio>(0.2));
            self.write_by_name("ENGINE_STATE:4", EngineState::On);

            self
        }

        fn toga_eng1(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:1", true);
            self.write_by_name("TURB ENG CORRECTED N2:1", Ratio::new::<ratio>(0.65));
            self.write_by_name("TURB ENG CORRECTED N1:1", Ratio::new::<ratio>(0.5));
            self.write_by_name("ENGINE_STATE:1", EngineState::On);

            self
        }

        fn toga_eng2(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:2", true);
            self.write_by_name("TURB ENG CORRECTED N2:2", Ratio::new::<ratio>(0.65));
            self.write_by_name("TURB ENG CORRECTED N1:2", Ratio::new::<ratio>(0.5));
            self.write_by_name("ENGINE_STATE:2", EngineState::On);

            self
        }

        fn toga_eng3(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:3", true);
            self.write_by_name("TURB ENG CORRECTED N2:3", Ratio::new::<ratio>(0.65));
            self.write_by_name("TURB ENG CORRECTED N1:3", Ratio::new::<ratio>(0.5));
            self.write_by_name("ENGINE_STATE:3", EngineState::On);

            self
        }

        fn toga_eng4(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:4", true);
            self.write_by_name("TURB ENG CORRECTED N2:4", Ratio::new::<ratio>(0.65));
            self.write_by_name("TURB ENG CORRECTED N1:4", Ratio::new::<ratio>(0.5));
            self.write_by_name("ENGINE_STATE:4", EngineState::On);

            self
        }

        fn stop_eng1(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:1", false);
            self.write_by_name("TURB ENG CORRECTED N2:1", Ratio::new::<ratio>(0.));
            self.write_by_name("TURB ENG CORRECTED N1:1", Ratio::new::<ratio>(0.));
            self.write_by_name("ENGINE_STATE:1", EngineState::Off);

            self
        }

        fn stop_eng2(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:2", false);
            self.write_by_name("TURB ENG CORRECTED N2:2", Ratio::new::<ratio>(0.));
            self.write_by_name("TURB ENG CORRECTED N1:2", Ratio::new::<ratio>(0.));
            self.write_by_name("ENGINE_STATE:2", EngineState::Off);

            self
        }

        fn stop_eng3(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:3", false);
            self.write_by_name("TURB ENG CORRECTED N2:3", Ratio::new::<ratio>(0.));
            self.write_by_name("TURB ENG CORRECTED N1:3", Ratio::new::<ratio>(0.));
            self.write_by_name("ENGINE_STATE:3", EngineState::Off);

            self
        }

        fn stop_eng4(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:4", false);
            self.write_by_name("TURB ENG CORRECTED N2:4", Ratio::new::<ratio>(0.));
            self.write_by_name("TURB ENG CORRECTED N1:4", Ratio::new::<ratio>(0.));
            self.write_by_name("ENGINE_STATE:4", EngineState::Off);

            self
        }

        fn eng1_n1(mut self, n1: f64) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:1", true);
            self.write_by_name("TURB ENG CORRECTED N1:1", Ratio::new::<ratio>(n1));
            self.write_by_name("ENGINE_STATE:1", EngineState::On);

            self
        }

        fn eng2_n1(mut self, n1: f64) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:2", true);
            self.write_by_name("TURB ENG CORRECTED N1:2", Ratio::new::<ratio>(n1));
            self.write_by_name("ENGINE_STATE:2", EngineState::On);

            self
        }

        fn eng3_n1(mut self, n1: f64) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:3", true);
            self.write_by_name("TURB ENG CORRECTED N1:3", Ratio::new::<ratio>(n1));
            self.write_by_name("ENGINE_STATE:3", EngineState::On);

            self
        }

        fn eng4_n1(mut self, n1: f64) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:4", true);
            self.write_by_name("TURB ENG CORRECTED N1:4", Ratio::new::<ratio>(n1));
            self.write_by_name("ENGINE_STATE:4", EngineState::On);

            self
        }

        fn eng1_n2(mut self, n2: f64) -> Self {
            self.write_by_name("TURB ENG CORRECTED N2:1", Ratio::new::<ratio>(n2));

            self
        }

        fn eng2_n2(mut self, n2: f64) -> Self {
            self.write_by_name("TURB ENG CORRECTED N2:2", Ratio::new::<ratio>(n2));

            self
        }

        fn eng3_n2(mut self, n2: f64) -> Self {
            self.write_by_name("TURB ENG CORRECTED N2:3", Ratio::new::<ratio>(n2));

            self
        }

        fn eng4_n2(mut self, n2: f64) -> Self {
            self.write_by_name("TURB ENG CORRECTED N2:4", Ratio::new::<ratio>(n2));

            self
        }

        fn start_eng1(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:1", true);
            self.write_by_name("ENGINE_STATE:1", EngineState::Starting);

            self
        }

        fn start_eng2(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:2", true);
            self.write_by_name("ENGINE_STATE:2", EngineState::Starting);

            self
        }

        fn start_eng3(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:3", true);
            self.write_by_name("ENGINE_STATE:3", EngineState::Starting);

            self
        }

        fn start_eng4(mut self) -> Self {
            self.write_by_name("GENERAL ENG STARTER ACTIVE:4", true);
            self.write_by_name("ENGINE_STATE:4", EngineState::Starting);

            self
        }

        fn cross_bleed_valve_selector_knob(mut self, mode: CrossBleedValveSelectorMode) -> Self {
            self.write_by_name("KNOB_OVHD_AIRCOND_XBLEED_Position", mode);

            self
        }

        fn ip_pressure(&self, number: usize) -> Pressure {
            self.query(|a| a.pneumatic.engine_systems[number - 1].intermediate_pressure())
        }

        fn hp_pressure(&self, number: usize) -> Pressure {
            self.query(|a| a.pneumatic.engine_systems[number - 1].high_pressure())
        }

        fn transfer_pressure(&self, number: usize) -> Pressure {
            self.query(|a| a.pneumatic.engine_systems[number - 1].transfer_pressure())
        }

        fn precooler_inlet_pressure(&self, number: usize) -> Pressure {
            self.query(|a| a.pneumatic.engine_systems[number - 1].precooler_inlet_pressure())
        }

        fn precooler_outlet_pressure(&self, number: usize) -> Pressure {
            self.query(|a| a.pneumatic.engine_systems[number - 1].precooler_outlet_pressure())
        }

        fn precooler_supply_pressure(&self, number: usize) -> Pressure {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1]
                    .precooler_supply_pipe
                    .pressure()
            })
        }

        fn engine_starter_container_pressure(&self, number: usize) -> Pressure {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1]
                    .engine_starter_container
                    .pressure()
            })
        }

        fn intermediate_pressure_transducer_pressure(&self, number: usize) -> Option<Pressure> {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1].intermediate_pressure_transducer_pressure()
            })
        }

        fn transfer_pressure_transducer_pressure(&self, number: usize) -> Option<Pressure> {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1].transfer_pressure_transducer_pressure()
            })
        }

        fn regulated_pressure_transducer_pressure(&self, number: usize) -> Option<Pressure> {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1].regulated_pressure_transducer_pressure()
            })
        }

        fn differential_pressure_transducer_pressure(&self, number: usize) -> Option<Pressure> {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1].differential_pressure_transducer_pressure()
            })
        }

        fn ip_temperature(&self, number: usize) -> ThermodynamicTemperature {
            self.query(|a| a.pneumatic.engine_systems[number - 1].intermediate_temperature())
        }

        fn hp_temperature(&self, number: usize) -> ThermodynamicTemperature {
            self.query(|a| a.pneumatic.engine_systems[number - 1].high_temperature())
        }

        fn transfer_temperature(&self, number: usize) -> ThermodynamicTemperature {
            self.query(|a| a.pneumatic.engine_systems[number - 1].transfer_temperature())
        }

        fn precooler_inlet_temperature(&self, number: usize) -> ThermodynamicTemperature {
            self.query(|a| a.pneumatic.engine_systems[number - 1].precooler_inlet_temperature())
        }

        fn precooler_outlet_temperature(&self, number: usize) -> ThermodynamicTemperature {
            self.query(|a| a.pneumatic.engine_systems[number - 1].precooler_outlet_temperature())
        }

        fn precooler_supply_temperature(&self, number: usize) -> ThermodynamicTemperature {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1]
                    .precooler_supply_pipe
                    .temperature()
            })
        }

        fn engine_starter_container_temperature(&self, number: usize) -> ThermodynamicTemperature {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1]
                    .engine_starter_container
                    .temperature()
            })
        }

        fn hp_valve_is_open(&self, number: usize) -> bool {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1]
                    .high_pressure_valve
                    .is_open()
            })
        }

        fn pr_valve_is_open(&self, number: usize) -> bool {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1]
                    .pressure_regulating_valve
                    .is_open()
            })
        }

        fn es_valve_is_open(&self, number: usize) -> bool {
            self.query(|a| a.pneumatic.engine_systems[number - 1].engine_starter_valve_is_open())
        }

        fn apu_bleed_valve_is_open(&self) -> bool {
            self.query(|a| a.pneumatic.apu_bleed_air_valve.is_open())
        }

        fn hp_valve_is_powered(&self, number: usize) -> bool {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1]
                    .high_pressure_valve
                    .is_powered()
            })
        }

        fn pr_valve_is_powered(&self, number: usize) -> bool {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1]
                    .pressure_regulating_valve
                    .is_powered()
            })
        }

        fn fan_air_valve_is_powered(&self, number: usize) -> bool {
            self.query(|a| {
                a.pneumatic.engine_systems[number - 1]
                    .fan_air_valve
                    .is_powered()
            })
        }

        fn set_engine_bleed_push_button_off(mut self, number: usize) -> Self {
            self.write_by_name(&format!("OVHD_PNEU_ENG_{}_BLEED_PB_IS_AUTO", number), false);

            self
        }

        fn set_engine_bleed_push_button_auto(mut self, number: usize) -> Self {
            self.write_by_name(&format!("OVHD_PNEU_ENG_{}_BLEED_PB_IS_AUTO", number), true);

            self
        }

        fn set_apu_bleed_valve_signal(mut self, signal: ApuBleedAirValveSignal) -> Self {
            self.command(|a| a.apu.set_bleed_air_valve_signal(signal));

            self
        }

        fn set_apu_bleed_air_pb(mut self, is_on: bool) -> Self {
            self.write_by_name("OVHD_APU_BLEED_PB_IS_ON", is_on);

            self
        }

        fn set_bleed_air_running(mut self) -> Self {
            self.command(|a| a.apu.set_bleed_air_pressure(Pressure::new::<psi>(42.)));
            self.command(|a| {
                a.apu
                    .set_bleed_air_temperature(ThermodynamicTemperature::new::<degree_celsius>(
                        250.,
                    ))
            });

            self.set_apu_bleed_valve_signal(ApuBleedAirValveSignal::new_open())
                .set_apu_bleed_air_pb(true)
        }

        fn release_fire_pushbutton(mut self, number: usize) -> Self {
            self.command(|a| a.fire_pushbuttons.release(number));

            self
        }

        fn set_engine_state(mut self, number: usize, engine_state: EngineState) -> Self {
            self.write_by_name(&format!("ENGINE_STATE:{}", number), engine_state);

            self
        }

        fn engine_state(&self, number: usize) -> EngineState {
            self.query(|a| a.pneumatic.fadec.engine_state(number))
        }

        fn cross_bleed_valves_are_open(&self) -> bool {
            self.query(|a| {
                a.pneumatic
                    .cross_bleed_valves
                    .iter()
                    .all(|cbv| cbv.is_open())
            })
        }

        fn cross_bleed_valve_selector(&self) -> CrossBleedValveSelectorMode {
            self.query(|a| a.pneumatic_overhead_panel.cross_bleed_mode())
        }

        fn engine_bleed_push_button_is_auto(&self, number: usize) -> bool {
            self.query(|a| a.pneumatic_overhead_panel.engine_bleed_pb_is_auto(number))
        }

        fn green_hydraulic_reservoir_pressure(&self) -> Pressure {
            self.query(|a| a.pneumatic.green_hydraulic_reservoir_with_valve.pressure())
        }

        fn yellow_hydraulic_reservoir_pressure(&self) -> Pressure {
            self.query(|a| a.pneumatic.yellow_hydraulic_reservoir_with_valve.pressure())
        }

        fn set_pack_flow_pb_is_auto(mut self, number: usize, is_auto: bool) -> Self {
            self.write_by_name(&format!("OVHD_COND_PACK_{}_PB_IS_ON", number), is_auto);

            self
        }

        fn left_pack_flow_valve_is_open(&self, pack_number: usize) -> bool {
            self.query(|a| {
                a.pneumatic.packs[pack_number - 1]
                    .left_pack_flow_valve
                    .is_open()
            })
        }

        fn right_pack_flow_valve_is_open(&self, pack_number: usize) -> bool {
            self.query(|a| {
                a.pneumatic.packs[pack_number - 1]
                    .right_pack_flow_valve
                    .is_open()
            })
        }

        fn both_packs_auto(self) -> Self {
            self.set_pack_flow_pb_is_auto(1, true)
                .set_pack_flow_pb_is_auto(2, true)
        }

        fn set_dc_ess_bus_power(mut self, is_powered: bool) -> Self {
            self.command(|a| a.set_dc_ess_bus_power(is_powered));

            self
        }

        fn set_dc_2_bus_power(mut self, is_powered: bool) -> Self {
            self.command(|a| a.set_dc_2_bus_power(is_powered));

            self
        }

        fn left_pack_flow_valve_flow(&self, pack_number: usize) -> MassRate {
            self.query(|a| a.pneumatic.packs[pack_number - 1].left_pack_flow_valve_air_flow())
        }

        fn right_pack_flow_valve_flow(&self, pack_number: usize) -> MassRate {
            self.query(|a| a.pneumatic.packs[pack_number - 1].right_pack_flow_valve_air_flow())
        }

        fn pack_pressure(&self, pack_number: usize) -> Pressure {
            self.query(|a| a.pneumatic.packs[pack_number - 1].pack_container.pressure())
        }

        fn cross_bleed_valves_are_powered_for_automatic_control(&self) -> bool {
            self.query(|a| {
                a.pneumatic
                    .cross_bleed_valves
                    .iter()
                    .all(|cbv| cbv.is_powered_for_automatic_control)
            })
        }

        fn cross_bleed_valves_are_powered_for_manual_control(&self) -> bool {
            self.query(|a| {
                a.pneumatic
                    .cross_bleed_valves
                    .iter()
                    .all(|cbv| cbv.is_powered_for_manual_control)
            })
        }

        fn command_pack_flow_selector_position(&mut self, value: u8) {
            self.write_by_name("KNOB_OVHD_AIRCOND_PACKFLOW_Position", value);
        }
    }

    fn test_bed() -> PneumaticTestBed {
        PneumaticTestBed::new()
    }

    fn test_bed_with() -> PneumaticTestBed {
        test_bed()
    }

    fn pressure_tolerance() -> Pressure {
        Pressure::new::<psi>(0.5)
    }

    fn flow_rate_tolerance() -> MassRate {
        MassRate::new::<kilogram_per_second>(0.1)
    }

    // Just a way for me to plot some graphs
    #[test]
    #[ignore]
    fn full_graphing_test() {
        let alt = Length::new::<foot>(0.);

        let mut test_bed = test_bed_with()
            .idle_eng1()
            .idle_eng2()
            .idle_eng3()
            .idle_eng4()
            .in_isa_atmosphere(alt)
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
            .mach_number(MachNumber(0.))
            .both_packs_auto();

        let mut time_points = Vec::new();
        let mut high_pressures = Vec::new();
        let mut intermediate_pressures = Vec::new();
        let mut transfer_pressures = Vec::new(); // Transfer pressure (before PRV)
        let mut precooler_inlet_pressures = Vec::new(); // Precooler inlet pressure
        let mut precooler_outlet_pressures = Vec::new(); // Precooler outlet pressure
        let mut precooler_supply_pressures = Vec::new(); // Precooler cooling air pressure
        let mut engine_starter_container_pressures = Vec::new(); // Precooler cooling air pressure
        let mut intermediate_pressure_compressor_temperatures = Vec::new();
        let mut high_pressure_compressor_temperatures = Vec::new(); // Transfer temperature (before PRV)
        let mut transfer_temperatures = Vec::new(); // Precooler inlet temperature
        let mut precooler_inlet_temperatures = Vec::new(); // Precooler outlet temperature
        let mut precooler_outlet_temperatures = Vec::new(); // Precooler cooling air temperature
        let mut precooler_supply_temperatures = Vec::new();
        let mut engine_starter_container_temperatures = Vec::new();
        let mut high_pressure_valve_open_amounts = Vec::new();
        let mut pressure_regulating_valve_open_amounts = Vec::new();
        let mut intermediate_pressure_valve_open_amounts = Vec::new();
        let mut engine_starter_valve_open_amounts = Vec::new();
        let mut apu_bleed_valve_open_amounts = Vec::new();
        let mut fan_air_valve_open_amounts = Vec::new();

        for i in 1..2000 {
            time_points.push(i as f64 * 16.);

            high_pressures.push(test_bed.hp_pressure(1).get::<psi>());
            intermediate_pressures.push(test_bed.ip_pressure(1).get::<psi>());
            transfer_pressures.push(test_bed.transfer_pressure(1).get::<psi>());
            precooler_inlet_pressures.push(test_bed.precooler_inlet_pressure(1).get::<psi>());
            precooler_outlet_pressures.push(test_bed.precooler_outlet_pressure(1).get::<psi>());
            precooler_supply_pressures.push(test_bed.precooler_supply_pressure(1).get::<psi>());
            engine_starter_container_pressures
                .push(test_bed.engine_starter_container_pressure(1).get::<psi>());

            intermediate_pressure_compressor_temperatures
                .push(test_bed.ip_temperature(1).get::<degree_celsius>());
            high_pressure_compressor_temperatures
                .push(test_bed.hp_temperature(1).get::<degree_celsius>());
            transfer_temperatures.push(test_bed.transfer_temperature(1).get::<degree_celsius>());
            precooler_inlet_temperatures.push(
                test_bed
                    .precooler_inlet_temperature(1)
                    .get::<degree_celsius>(),
            );
            precooler_outlet_temperatures.push(
                test_bed
                    .precooler_outlet_temperature(1)
                    .get::<degree_celsius>(),
            );
            precooler_supply_temperatures.push(
                test_bed
                    .precooler_supply_temperature(1)
                    .get::<degree_celsius>(),
            );
            engine_starter_container_temperatures.push(
                test_bed
                    .engine_starter_container_temperature(1)
                    .get::<degree_celsius>(),
            );

            high_pressure_valve_open_amounts.push(test_bed.query(|aircraft| {
                aircraft.pneumatic.engine_systems[0]
                    .high_pressure_valve
                    .open_amount()
                    .get::<ratio>()
            }));

            pressure_regulating_valve_open_amounts.push(test_bed.query(|aircraft| {
                aircraft.pneumatic.engine_systems[0]
                    .pressure_regulating_valve
                    .open_amount()
                    .get::<ratio>()
            }));

            intermediate_pressure_valve_open_amounts.push(test_bed.query(|aircraft| {
                aircraft.pneumatic.engine_systems[0]
                    .intermediate_pressure_valve
                    .open_amount()
                    .get::<ratio>()
            }));

            engine_starter_valve_open_amounts.push(test_bed.query(|aircraft| {
                aircraft.pneumatic.engine_systems[0]
                    .engine_starter_valve
                    .open_amount()
                    .get::<ratio>()
            }));

            apu_bleed_valve_open_amounts.push(if test_bed.apu_bleed_valve_is_open() {
                1.
            } else {
                0.
            });

            fan_air_valve_open_amounts.push(test_bed.query(|aircraft| {
                aircraft.pneumatic.engine_systems[0]
                    .fan_air_valve
                    .open_amount()
                    .get::<ratio>()
            }));

            test_bed.run_with_delta(Duration::from_millis(32));
        }

        assert!(test_bed.hp_valve_is_powered(1));
        assert!(test_bed.pr_valve_is_powered(1));
        assert!(test_bed.fan_air_valve_is_powered(1));

        // If anyone is wondering, I am using python to plot pressure curves. This will be removed once the model is complete.
        let data = vec![
            time_points,
            high_pressures,
            intermediate_pressures,
            transfer_pressures,
            precooler_inlet_pressures,
            precooler_outlet_pressures,
            precooler_supply_pressures,
            engine_starter_container_pressures,
            high_pressure_compressor_temperatures,
            intermediate_pressure_compressor_temperatures,
            transfer_temperatures,
            precooler_inlet_temperatures,
            precooler_outlet_temperatures,
            precooler_supply_temperatures,
            engine_starter_container_temperatures,
            high_pressure_valve_open_amounts,
            pressure_regulating_valve_open_amounts,
            intermediate_pressure_valve_open_amounts,
            engine_starter_valve_open_amounts,
            apu_bleed_valve_open_amounts,
            fan_air_valve_open_amounts,
        ];

        if fs::create_dir_all("../a320_pneumatic_simulation_graph_data").is_ok() {
            let mut file = File::create("../a320_pneumatic_simulation_graph_data/generic_data.txt")
                .expect("Could not create file");

            use std::io::Write;

            writeln!(file, "{:?}", data).expect("Could not write file");
        };
    }

    #[test]
    #[ignore]
    fn hydraulic_reservoir_pressurization_graphs() {
        let alt = Length::new::<foot>(0.);

        let mut test_bed = test_bed_with()
            .in_isa_atmosphere(alt)
            .idle_eng1()
            .stop_eng2()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut);

        let mut ts = Vec::new();
        let mut green_pressures = Vec::new();
        let mut yellow_pressures = Vec::new();

        for i in 1..1000 {
            ts.push(i as f64 * 16.);

            green_pressures.push(test_bed.green_hydraulic_reservoir_pressure().get::<psi>());
            yellow_pressures.push(test_bed.yellow_hydraulic_reservoir_pressure().get::<psi>());

            test_bed.run_with_delta(Duration::from_millis(16));
        }

        assert_gt!(
            test_bed.green_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(35.)
        );
        assert_gt!(
            test_bed.yellow_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(35.)
        );

        // If anyone is wondering, I am using python to plot pressure curves. This will be removed once the model is complete.
        let data = vec![ts, green_pressures, yellow_pressures];

        if fs::create_dir_all("../a320_pneumatic_simulation_graph_data").is_ok() {
            let mut file = File::create(
                "../a320_pneumatic_simulation_graph_data/hydraulic_reservoir_pressures_data.txt",
            )
            .expect("Could not create file");

            use std::io::Write;

            writeln!(file, "{:?}", data).expect("Could not write file");
        };
    }

    #[test]
    #[ignore]
    fn pack_pressurization_graphs() {
        let alt = Length::new::<foot>(0.);

        let mut test_bed = test_bed_with()
            .in_isa_atmosphere(alt)
            .stop_eng1()
            .stop_eng2()
            .set_bleed_air_running()
            .both_packs_auto()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Open);

        let mut ts = Vec::new();
        let mut left_pressures = Vec::new();
        let mut right_pressures = Vec::new();

        for i in 1..10000 {
            ts.push(i as f64 * 16.);

            left_pressures.push(test_bed.pack_pressure(1).get::<psi>());
            right_pressures.push(test_bed.pack_pressure(2).get::<psi>());

            test_bed.run_with_delta(Duration::from_millis(16));
        }

        // If anyone is wondering, I am using python to plot pressure curves. This will be removed once the model is complete.
        let data = vec![ts, left_pressures, right_pressures];

        if fs::create_dir_all("../a320_pneumatic_simulation_graph_data").is_ok() {
            let mut file =
                File::create("../a320_pneumatic_simulation_graph_data/pack_pressures_data.txt")
                    .expect("Could not create file");

            use std::io::Write;

            writeln!(file, "{:?}", data).expect("Could not write file");
        };
    }

    #[test]
    fn cold_and_dark_full_state() {
        let altitude = Length::new::<foot>(0.);
        let ambient_pressure = InternationalStandardAtmosphere::pressure_at_altitude(altitude);

        let test_bed = test_bed_with()
            .stop_eng1()
            .stop_eng2()
            .stop_eng3()
            .stop_eng4()
            .in_isa_atmosphere(altitude)
            .mach_number(MachNumber(0.))
            .set_pack_flow_pb_is_auto(1, false)
            .set_pack_flow_pb_is_auto(2, false)
            .and_stabilize();

        for engine_number in 1..=4 {
            assert_about_eq!(
                test_bed.ip_pressure(engine_number).get::<psi>(),
                ambient_pressure.get::<psi>(),
                pressure_tolerance().get::<psi>()
            );
            assert_about_eq!(
                test_bed.hp_pressure(engine_number).get::<psi>(),
                ambient_pressure.get::<psi>(),
                pressure_tolerance().get::<psi>(),
            );
            assert_about_eq!(
                test_bed.transfer_pressure(engine_number).get::<psi>(),
                ambient_pressure.get::<psi>(),
                pressure_tolerance().get::<psi>()
            );
            assert_about_eq!(
                test_bed
                    .precooler_inlet_pressure(engine_number)
                    .get::<psi>(),
                ambient_pressure.get::<psi>(),
                pressure_tolerance().get::<psi>()
            );
            assert_about_eq!(
                test_bed
                    .precooler_outlet_pressure(engine_number)
                    .get::<psi>(),
                ambient_pressure.get::<psi>(),
                pressure_tolerance().get::<psi>()
            );
            assert_about_eq!(
                test_bed
                    .intermediate_pressure_transducer_pressure(engine_number)
                    .unwrap()
                    .get::<psi>(),
                0.,
                pressure_tolerance().get::<psi>()
            );
            assert_about_eq!(
                test_bed
                    .transfer_pressure_transducer_pressure(engine_number)
                    .unwrap()
                    .get::<psi>(),
                0.,
                pressure_tolerance().get::<psi>()
            );
            assert_about_eq!(
                test_bed
                    .regulated_pressure_transducer_pressure(engine_number)
                    .unwrap()
                    .get::<psi>(),
                0.,
                pressure_tolerance().get::<psi>()
            );
            assert_about_eq!(
                test_bed
                    .differential_pressure_transducer_pressure(engine_number)
                    .unwrap()
                    .get::<psi>(),
                0.,
                pressure_tolerance().get::<psi>()
            );

            assert!(!test_bed.hp_valve_is_open(engine_number));
            assert!(!test_bed.pr_valve_is_open(engine_number));
        }

        assert!(!test_bed.cross_bleed_valves_are_open())
    }

    #[test]
    fn single_engine_idle_full_state() {
        let altitude = Length::new::<foot>(0.);
        let test_bed = test_bed_with()
            .idle_eng1()
            .stop_eng2()
            .stop_eng3()
            .stop_eng4()
            .in_isa_atmosphere(altitude)
            .mach_number(MachNumber(0.))
            .and_stabilize();

        let ambient_pressure = InternationalStandardAtmosphere::pressure_at_altitude(altitude);

        assert_gt!(
            test_bed.ip_pressure(1) - ambient_pressure,
            pressure_tolerance()
        );
        assert_about_eq!(
            test_bed.ip_pressure(3).get::<psi>(),
            ambient_pressure.get::<psi>(),
            pressure_tolerance().get::<psi>()
        );

        assert_gt!(
            test_bed.hp_pressure(1) - ambient_pressure,
            pressure_tolerance()
        );
        assert_about_eq!(
            test_bed.hp_pressure(3).get::<psi>(),
            ambient_pressure.get::<psi>(),
            pressure_tolerance().get::<psi>()
        );

        assert_gt!(
            test_bed.transfer_pressure(1) - ambient_pressure,
            pressure_tolerance()
        );
        assert_about_eq!(
            test_bed.transfer_pressure(3).get::<psi>(),
            ambient_pressure.get::<psi>(),
            pressure_tolerance().get::<psi>()
        );

        assert_gt!(
            (test_bed.precooler_inlet_pressure(1) - ambient_pressure),
            pressure_tolerance()
        );
        assert!(!test_bed.precooler_inlet_pressure(3).is_nan());

        assert_gt!(
            (test_bed.precooler_outlet_pressure(1) - ambient_pressure),
            pressure_tolerance()
        );
        assert!(!test_bed.precooler_outlet_pressure(3).is_nan());

        assert!(test_bed.hp_valve_is_open(1));
        assert!(!test_bed.hp_valve_is_open(3));

        assert!(!test_bed.es_valve_is_open(1));
        assert!(!test_bed.es_valve_is_open(3));

        assert!(!test_bed.cross_bleed_valves_are_open());
    }

    #[test]
    fn four_engine_idle_full_state() {
        let altitude = Length::new::<foot>(0.);
        let test_bed = test_bed_with()
            .idle_eng1()
            .idle_eng2()
            .idle_eng3()
            .idle_eng4()
            .in_isa_atmosphere(altitude)
            .mach_number(MachNumber(0.))
            .both_packs_auto()
            .and_stabilize();

        let ambient_pressure = InternationalStandardAtmosphere::pressure_at_altitude(altitude);

        for i in 1..=4 {
            assert!(test_bed.hp_valve_is_powered(i));
            assert!(test_bed.pr_valve_is_powered(i));

            assert_gt!(
                test_bed.ip_pressure(i) - ambient_pressure,
                pressure_tolerance()
            );
            assert_gt!(
                test_bed.hp_pressure(i) - ambient_pressure,
                pressure_tolerance()
            );
            assert_gt!(
                test_bed.transfer_pressure(i) - ambient_pressure,
                pressure_tolerance()
            );
            assert!(
                (test_bed.precooler_inlet_pressure(i) - ambient_pressure) > pressure_tolerance()
            );
            assert!(
                (test_bed.precooler_outlet_pressure(i) - ambient_pressure) > pressure_tolerance()
            );
            assert!(test_bed.hp_valve_is_open(i));
            assert!(!test_bed.es_valve_is_open(i));
        }

        assert!(!test_bed.cross_bleed_valves_are_open());
    }

    #[test]
    fn engine_shutdown() {
        let altitude = Length::new::<foot>(0.);
        let ambient_pressure = InternationalStandardAtmosphere::pressure_at_altitude(altitude);

        let mut test_bed = test_bed_with()
            .idle_eng1()
            .idle_eng2()
            .idle_eng3()
            .idle_eng4()
            .in_isa_atmosphere(altitude)
            .mach_number(MachNumber(0.))
            .and_stabilize();

        assert_gt!(
            test_bed.precooler_outlet_pressure(1) - ambient_pressure,
            pressure_tolerance()
        );
        assert_gt!(
            test_bed.precooler_outlet_pressure(2) - ambient_pressure,
            pressure_tolerance()
        );
        assert_gt!(
            test_bed.precooler_outlet_pressure(3) - ambient_pressure,
            pressure_tolerance()
        );
        assert_gt!(
            test_bed.precooler_outlet_pressure(4) - ambient_pressure,
            pressure_tolerance()
        );

        test_bed = test_bed.set_bleed_air_running();

        assert!(!test_bed.precooler_outlet_pressure(1).get::<psi>().is_nan());
        assert!(!test_bed.precooler_outlet_pressure(2).get::<psi>().is_nan());
        assert!(!test_bed.precooler_outlet_pressure(3).get::<psi>().is_nan());
        assert!(!test_bed.precooler_outlet_pressure(4).get::<psi>().is_nan());
    }

    #[rstest]
    fn starter_valve_opens_on_engine_start(#[values(1, 2, 3, 4)] engine_number: usize) {
        let mut test_bed = test_bed_with().stop_eng1().stop_eng2().and_run();

        assert!(!test_bed.es_valve_is_open(engine_number));

        test_bed = match engine_number {
            1 => test_bed.start_eng1(),
            2 => test_bed.start_eng2(),
            3 => test_bed.start_eng3(),
            4 => test_bed.start_eng4(),
            _ => panic!("Unexpected engine number"),
        }
        .and_run();

        assert!(test_bed.es_valve_is_open(engine_number));
    }

    /// In flight at this airspeed, engine 1 out with its core windmilling at 12 %.
    fn in_flight_with_engine_1_out(airspeed_knots: f64) -> PneumaticTestBed {
        let mut test_bed = test_bed_with()
            .idle_eng2()
            .idle_eng3()
            .idle_eng4()
            .stop_eng1()
            .and_run();
        test_bed.set_on_ground(false);
        test_bed.set_indicated_airspeed(Velocity::new::<knot>(airspeed_knots));
        test_bed.write_by_name("ENGINE_N3:1", 12.);
        test_bed
    }

    #[test]
    fn in_flight_the_start_valve_stays_closed_for_a_windmilling_start() {
        // A380 FCOM DSC-70-30: in flight the start valve opens below 11 % N2 or 260 kt only
        let test_bed = in_flight_with_engine_1_out(300.)
            .set_engine_state(1, EngineState::Starting)
            .and_run();

        assert!(!test_bed.es_valve_is_open(1));
    }

    #[rstest]
    fn in_flight_the_start_valve_opens_for_a_starter_assisted_relight(
        #[values(EngineState::Starting, EngineState::Restarting)] engine_state: EngineState,
    ) {
        let mut test_bed = in_flight_with_engine_1_out(250.)
            .set_engine_state(1, engine_state)
            .and_run();
        assert!(test_bed.es_valve_is_open(1));

        // a stopped core is started with the starter at any airspeed
        test_bed.set_indicated_airspeed(Velocity::new::<knot>(300.));
        test_bed.write_by_name("ENGINE_N3:1", 5.);
        test_bed = test_bed.and_run();
        assert!(test_bed.es_valve_is_open(1));
    }

    #[test]
    fn on_the_ground_the_start_valve_opens_for_the_restart_of_a_spinning_down_engine() {
        // The FADEC restarts (RESTARTING) an engine that has not run down to OFF yet, e.g. after a
        // flameout with the MSFS starter still turning it at 25 %.
        let mut test_bed = test_bed_with().stop_eng1().and_run();
        test_bed.set_on_ground(true);
        test_bed.write_by_name("ENGINE_N3:1", 25.);
        test_bed = test_bed
            .set_engine_state(1, EngineState::Restarting)
            .and_run();

        assert!(test_bed.es_valve_is_open(1));
    }

    #[rstest]
    fn the_start_valve_closes_above_58_4_percent_n3(
        #[values(true, false)] on_ground: bool,
        #[values(EngineState::Starting, EngineState::Restarting)] engine_state: EngineState,
    ) {
        // A380 FCOM DSC-70-30: "When N2 above 58.4 %: Engine start valve closes". The starter
        // engages at or below 25 % (LIM-70 l.189735) and the core accelerates to 58 %.
        let mut test_bed = test_bed_with().stop_eng1().and_run();
        test_bed.set_on_ground(on_ground);
        test_bed.set_indicated_airspeed(Velocity::new::<knot>(200.));
        test_bed.write_by_name("ENGINE_N3:1", 20.);
        test_bed = test_bed.set_engine_state(1, engine_state).and_run();
        test_bed.write_by_name("ENGINE_N3:1", 58.);
        test_bed = test_bed.and_run();
        assert!(test_bed.es_valve_is_open(1));

        test_bed.write_by_name("ENGINE_N3:1", 59.);
        test_bed = test_bed.and_run();
        assert!(!test_bed.es_valve_is_open(1));
    }

    /// A380 FCOM LIM-70 STARTER (l.189735): "If the N2 is above 25 %, no running engagement of the
    /// starter is possible."
    #[rstest]
    fn the_start_valve_does_not_open_for_a_start_above_25_percent_n3(
        #[values(true, false)] on_ground: bool,
    ) {
        let mut test_bed = test_bed_with().stop_eng1().and_run();
        test_bed.set_on_ground(on_ground);
        test_bed.set_indicated_airspeed(Velocity::new::<knot>(200.));
        test_bed.write_by_name("ENGINE_N3:1", 30.);
        test_bed = test_bed
            .set_engine_state(1, EngineState::Restarting)
            .and_run();
        assert!(!test_bed.es_valve_is_open(1));

        // the core runs down to 25 %: the starter engages, and stays engaged as it accelerates
        test_bed.write_by_name("ENGINE_N3:1", 25.);
        test_bed = test_bed.and_run();
        assert!(test_bed.es_valve_is_open(1));
        test_bed.write_by_name("ENGINE_N3:1", 40.);
        test_bed = test_bed.and_run();
        assert!(test_bed.es_valve_is_open(1));
    }

    #[test]
    fn a_start_valve_stuck_closed_does_not_open_and_is_reported() {
        let mut test_bed = test_bed_with().stop_eng3().and_run();
        test_bed.fail(FailureType::EngineStartValveStuckClosed(3));
        test_bed = test_bed.start_eng3().and_run();
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(6));

        assert!(!test_bed.es_valve_is_open(3));
        let fault: f64 = test_bed.read_by_name("ENGINE_3_START_VALVE_FAULT");
        assert_eq!(fault, 1.);
    }

    #[test]
    fn a_start_valve_stuck_open_stays_open_and_is_reported() {
        let mut test_bed = test_bed_with().idle_eng4().and_run();
        test_bed.fail(FailureType::EngineStartValveStuckOpen(4));
        test_bed = test_bed.and_run();
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(6));

        assert!(test_bed.es_valve_is_open(4));
        let fault: f64 = test_bed.read_by_name("ENGINE_4_START_VALVE_FAULT");
        assert_eq!(fault, 2.);
    }

    #[test]
    fn the_start_sequence_opens_the_start_valve_of_an_engine_off_for_a_crank() {
        let mut test_bed = test_bed_with().stop_eng2().and_run();
        test_bed.write_by_name("ENGINE_2_START_VALVE_COMMAND", 1.);
        test_bed = test_bed.and_run();

        assert!(test_bed.es_valve_is_open(2));
    }

    /// Engine 1 has flamed out with its master ON (FADEC SHUTTING), ENG START selector at IGN START.
    fn with_engine_1_flamed_out(mut test_bed: PneumaticTestBed) -> PneumaticTestBed {
        test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
        test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:1", true);
        test_bed.write_by_name("ENGINE_STATE:1", EngineState::On);
        test_bed = test_bed.and_run();
        test_bed.fail(FailureType::EngineFlameout(1));
        test_bed
            .set_engine_state(1, EngineState::Shutting)
            .and_run()
            .and_run()
    }

    /// The crew sets the ENG MASTER OFF then ON: the FADEC restarts the engine (RESTARTING).
    fn with_engine_1_master_off_then_on(mut test_bed: PneumaticTestBed) -> PneumaticTestBed {
        test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:1", false);
        test_bed = test_bed.and_run();
        test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:1", true);
        test_bed.set_engine_state(1, EngineState::Restarting)
    }

    fn engine_1_starter_pressurized_within(
        test_bed: &mut PneumaticTestBed,
        duration: Duration,
    ) -> bool {
        let step = Duration::from_millis(100);
        let mut elapsed = Duration::ZERO;
        while elapsed < duration {
            test_bed.run_with_delta(step);
            elapsed += step;
            let pressurized: bool = test_bed.read_by_name("PNEU_ENG_1_STARTER_PRESSURIZED");
            if pressurized {
                return true;
            }
        }
        false
    }

    fn engine_1_lights_up_within(test_bed: &mut PneumaticTestBed, duration: Duration) -> bool {
        let step = Duration::from_millis(100);
        let mut elapsed = Duration::ZERO;
        while elapsed < duration {
            test_bed.run_with_delta(step);
            elapsed += step;
            let fuel_cut: bool = test_bed.read_by_name("ENGINE_1_FUEL_CUT");
            if !fuel_cut {
                return true;
            }
        }
        false
    }

    #[test]
    fn on_the_ground_a_flamed_out_engine_relights_with_apu_bleed_as_soon_as_it_is_restarted() {
        // Sim test 2026-10-05 (ground): the starter was pressurized only 26 s after the MASTER ON,
        // when the FADEC went from RESTARTING to STARTING, 4 s before the end of the attempt.
        let mut test_bed = test_bed_with()
            .stop_eng2()
            .stop_eng3()
            .stop_eng4()
            .set_bleed_air_running();
        test_bed.set_on_ground(true);
        test_bed.set_indicated_airspeed(Velocity::default());
        test_bed =
            with_engine_1_master_off_then_on(with_engine_1_flamed_out(test_bed.and_stabilize()));
        test_bed.write_by_name("ENGINE_N3:1", 25.);

        assert!(engine_1_lights_up_within(
            &mut test_bed,
            Duration::from_secs(2)
        ));
    }

    #[test]
    fn in_flight_a_starter_assisted_relight_lights_up_with_crossbleed_air_from_the_other_engines() {
        // FCOM ENG RELIGHT IN FLIGHT (a380_fcom.txt l.174908): "XBLEED ... OPEN"; FL150, 210 kt
        let test_bed = in_flight_with_engine_1_out(210.)
            .in_isa_atmosphere(Length::new::<foot>(15_000.))
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Open)
            .and_stabilize();
        let mut test_bed = with_engine_1_master_off_then_on(with_engine_1_flamed_out(test_bed));
        test_bed.write_by_name("ENGINE_N3:1", 9.);

        assert!(engine_1_lights_up_within(
            &mut test_bed,
            Duration::from_secs(2)
        ));
    }

    #[test]
    fn in_flight_no_starter_air_reaches_the_failed_engine_with_the_crossbleed_at_auto_and_no_apu_bleed(
    ) {
        let test_bed = in_flight_with_engine_1_out(210.)
            .in_isa_atmosphere(Length::new::<foot>(15_000.))
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
            .and_stabilize();
        let mut test_bed = with_engine_1_master_off_then_on(with_engine_1_flamed_out(test_bed));
        test_bed.write_by_name("ENGINE_N3:1", 9.);

        assert!(!engine_1_lights_up_within(
            &mut test_bed,
            Duration::from_secs(10)
        ));
    }

    #[test]
    fn the_starter_is_pressurized_by_the_apu_bleed_during_an_in_flight_start() {
        let mut test_bed = in_flight_with_engine_1_out(220.)
            .in_isa_atmosphere(Length::new::<foot>(15_000.))
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
            .set_bleed_air_running()
            .and_stabilize();
        let pressurized: bool = test_bed.read_by_name("PNEU_ENG_1_STARTER_PRESSURIZED");
        assert!(!pressurized, "the start valve is closed");

        test_bed = test_bed
            .set_engine_state(1, EngineState::Restarting)
            .and_stabilize();
        let pressurized: bool = test_bed.read_by_name("PNEU_ENG_1_STARTER_PRESSURIZED");
        assert!(pressurized);
    }

    #[test]
    fn with_all_four_engines_out_the_apu_bleed_relights_two_engines_at_a_time() {
        // ENG ALL ENG FLAME OUT (a380_fcom.txt l.173859-173872): "WHEN APU AVAIL: ALL ENG MASTERS
        // ... OFF, APU BLEED ... ON", then "ENG MASTER (2 AT A TIME) ... ON". FL150, 220 kt (zone 2
        // of the relight envelope: starter assisted), the cores windmilling at 9 %.
        let mut test_bed = test_bed_with()
            .stop_eng1()
            .stop_eng2()
            .stop_eng3()
            .stop_eng4()
            .and_run();
        test_bed.set_on_ground(false);
        test_bed.set_indicated_airspeed(Velocity::new::<knot>(220.));
        test_bed = test_bed
            .in_isa_atmosphere(Length::new::<foot>(15_000.))
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
            .set_bleed_air_running()
            .and_stabilize();

        test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
        for number in 1..=4 {
            test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", number), true);
            test_bed.write_by_name(&format!("ENGINE_STATE:{}", number), EngineState::On);
        }
        test_bed = test_bed.and_run();
        for number in 1..=4 {
            test_bed.fail(FailureType::EngineFlameout(number));
            test_bed.write_by_name(&format!("ENGINE_STATE:{}", number), EngineState::Shutting);
            test_bed.write_by_name(&format!("ENGINE_N3:{}", number), 9.);
            test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", number), false);
        }
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(30));

        // the masters of engines 1 and 4 ON, the others stay OFF
        for number in [1, 4] {
            test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", number), true);
            test_bed.write_by_name(&format!("ENGINE_STATE:{}", number), EngineState::Restarting);
        }
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(2));

        for number in [1, 4] {
            assert!(test_bed.es_valve_is_open(number));
            let fuel_cut: bool = test_bed.read_by_name(&format!("ENGINE_{}_FUEL_CUT", number));
            assert!(!fuel_cut, "engine {} lights up with the APU bleed", number);
        }
        for number in [2, 3] {
            let fuel_cut: bool = test_bed.read_by_name(&format!("ENGINE_{}_FUEL_CUT", number));
            assert!(fuel_cut, "engine {} master OFF", number);
        }
    }

    /// On the ground, engine 1 is started with the APU bleed (the other engines stopped). Once
    /// the start valve has closed above 58.4 % N3, the engine runs at idle, the APU bleed is set OFF
    /// and the frames run for that many seconds.
    fn on_the_ground_after_an_apu_bleed_start_of_engine_1_then_apu_bleed_off(
        seconds_after_the_start_valve_closed: u64,
    ) -> PneumaticTestBed {
        let mut test_bed = test_bed_with()
            .stop_eng1()
            .stop_eng2()
            .stop_eng3()
            .stop_eng4()
            .set_bleed_air_running();
        test_bed.set_on_ground(true);
        test_bed.set_indicated_airspeed(Velocity::default());
        test_bed = test_bed.and_stabilize();

        test_bed.write_by_name("ENGINE_N3:1", 25.);
        test_bed.write_by_name("TURB ENG CORRECTED N2:1", Ratio::new::<ratio>(0.25));
        test_bed = test_bed.start_eng1();
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(3));
        assert!(test_bed.es_valve_is_open(1));
        let pressurized: bool = test_bed.read_by_name("PNEU_ENG_1_STARTER_PRESSURIZED");
        assert!(pressurized, "the APU bleed turns the starter");

        test_bed.write_by_name("ENGINE_N3:1", 70.);
        test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
        test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:1", true);
        test_bed = test_bed
            .idle_eng1()
            .set_apu_bleed_valve_signal(ApuBleedAirValveSignal::new_closed())
            .set_apu_bleed_air_pb(false);
        test_bed.command(|a| a.apu.set_bleed_air_pressure(Pressure::new::<psi>(14.7)));
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(seconds_after_the_start_valve_closed));
        assert!(!test_bed.es_valve_is_open(1));

        test_bed
    }

    #[test]
    fn the_starter_is_no_longer_pressurized_a_few_seconds_after_the_start_valve_closed() {
        // A380 FCOM DSC-70-30 (l.113557-113559): "When N2 above 58.4 %: Engine start valve closes
        // (fully closed after approximately 10 s)". Before the fix the starter duct kept about
        // 20 PSIG for 5 s and above 5 PSIG for about 45 s.
        let mut test_bed = on_the_ground_after_an_apu_bleed_start_of_engine_1_then_apu_bleed_off(5);

        let pressurized: bool = test_bed.read_by_name("PNEU_ENG_1_STARTER_PRESSURIZED");
        assert!(!pressurized);
    }

    #[test]
    fn a_ground_relight_soon_after_a_start_does_not_light_up_without_apu_or_crossbleed_air() {
        // Engine 1 flames out 5 s after its APU bleed start, stops, and is restarted 10 s later
        // (ENG MASTER OFF then ON) with the APU bleed OFF and the crossbleed valves closed: no air
        // turns the starter. Before the fix the starter duct still held about 13 PSIG from the
        // first start and the relight lit up.
        let mut test_bed = with_engine_1_flamed_out(
            on_the_ground_after_an_apu_bleed_start_of_engine_1_then_apu_bleed_off(5),
        );
        test_bed = test_bed
            .stop_eng1()
            .set_engine_state(1, EngineState::Shutting);
        test_bed.write_by_name("ENGINE_N3:1", 0.);
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(10));
        test_bed = with_engine_1_master_off_then_on(test_bed);

        assert!(!engine_1_starter_pressurized_within(
            &mut test_bed,
            Duration::from_secs(30)
        ));
        assert!(!engine_1_lights_up_within(
            &mut test_bed,
            Duration::from_secs(30)
        ));
    }

    #[test]
    fn a_ground_relight_finds_no_air_trapped_in_the_duct_of_the_stopped_engine() {
        // Engine 1 runs for a minute on its own bleed (APU bleed OFF), flames out, stops and is
        // restarted about 2 s later (ENG MASTER OFF then ON). Before the duct vent the air trapped
        // in its own bleed duct (about 28 PSIG) pressurized the starter and the relight lit up with no air source.
        let mut test_bed = with_engine_1_flamed_out(
            on_the_ground_after_an_apu_bleed_start_of_engine_1_then_apu_bleed_off(60),
        );
        test_bed = test_bed
            .stop_eng1()
            .set_engine_state(1, EngineState::Shutting);
        test_bed.write_by_name("ENGINE_N3:1", 0.);
        test_bed = with_engine_1_master_off_then_on(test_bed);

        assert!(!engine_1_starter_pressurized_within(
            &mut test_bed,
            Duration::from_secs(30)
        ));
        assert!(!engine_1_lights_up_within(
            &mut test_bed,
            Duration::from_secs(30)
        ));
    }

    #[test]
    fn a_ground_relight_of_a_stopped_engine_still_lights_up_with_the_apu_bleed() {
        let mut test_bed = with_engine_1_flamed_out(
            on_the_ground_after_an_apu_bleed_start_of_engine_1_then_apu_bleed_off(60),
        );
        test_bed = test_bed
            .stop_eng1()
            .set_engine_state(1, EngineState::Shutting);
        test_bed.write_by_name("ENGINE_N3:1", 0.);
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(30));
        test_bed = test_bed.set_bleed_air_running();
        test_bed = with_engine_1_master_off_then_on(test_bed);
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(3));
        let pressurized: bool = test_bed.read_by_name("PNEU_ENG_1_STARTER_PRESSURIZED");
        assert!(
            pressurized,
            "the APU bleed reaches the starter of the stopped engine"
        );

        // the starter air turns the core (the test bed does not spin it up): the B3 start sequence
        // lights the fuel from 20 % N3
        test_bed.write_by_name("ENGINE_N3:1", 25.);
        assert!(engine_1_lights_up_within(
            &mut test_bed,
            Duration::from_secs(5)
        ));
    }

    #[test]
    fn the_duct_of_an_engine_vents_only_without_an_air_source() {
        use super::engine_ducts_without_air_source;

        let vented = |running: [bool; 4], apu: bool, cross_bleeds: [bool; 3]| {
            engine_ducts_without_air_source(running, apu, cross_bleeds)
        };
        // engine 1 out, crossbleed valves closed, no APU bleed: only its duct vents
        assert_eq!(
            vented([false, true, true, true], false, [false; 3]),
            [true, false, false, false]
        );
        // the left crossbleed valve joins it to engine 2, the center one to engine 4
        assert_eq!(
            vented([false, true, true, true], false, [true, false, false]),
            [false; 4]
        );
        assert_eq!(
            vented([false, true, true, true], false, [false, true, false]),
            [false; 4]
        );
        // engines 3 and 4 out: the right valve alone joins them to no running engine
        assert_eq!(
            vented([true, true, false, false], false, [false, false, true]),
            [false, false, true, true]
        );
        // through the center and right valves engine 3 reaches engine 1
        assert_eq!(
            vented([true, true, false, false], false, [false, true, true]),
            [false; 4]
        );
        // all engines out: the APU bleed (engine 1 duct) feeds the ducts joined to engine 1
        assert_eq!(
            vented([false; 4], true, [true, true, false]),
            [false, false, true, false]
        );
        assert_eq!(vented([false; 4], false, [true; 3]), [true; 4]);
        // a running engine never vents
        assert_eq!(vented([true; 4], false, [false; 3]), [false; 4]);
    }

    #[test]
    fn cross_bleed_valve_opens_when_apu_bleed_valve_opens() {
        let mut test_bed = test_bed_with()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
            .and_run();

        assert!(!test_bed.cross_bleed_valves_are_open());

        test_bed = test_bed
            .set_apu_bleed_valve_signal(ApuBleedAirValveSignal::new_open())
            .and_run();

        assert!(test_bed.cross_bleed_valves_are_open());
    }

    #[test]
    fn cross_bleed_valve_closes_when_apu_bleed_valve_closes() {
        let mut test_bed = test_bed_with()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
            .set_apu_bleed_valve_signal(ApuBleedAirValveSignal::new_open())
            .and_run();

        assert!(test_bed.cross_bleed_valves_are_open());

        test_bed = test_bed
            .set_apu_bleed_valve_signal(ApuBleedAirValveSignal::new_closed())
            .and_run();

        assert!(!test_bed.cross_bleed_valves_are_open());
    }

    /// The crossbleed engine start of PRO-SUP-70-10 (a380_fcom.txt l.181024-181029) on the ground:
    /// engine 1 runs at idle, engines 2 to 4 are stopped, ALL ENG BLEEDS ON, APU bleed OFF, X BLEED
    /// AUTO.
    fn on_the_ground_with_engine_1_running_and_no_apu_bleed() -> PneumaticTestBed {
        let mut test_bed = test_bed_with()
            .idle_eng1()
            .stop_eng2()
            .stop_eng3()
            .stop_eng4()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto);
        test_bed.set_on_ground(true);
        test_bed.set_indicated_airspeed(Velocity::default());
        test_bed.write_by_name("ENGINE_N3:1", 70.);
        test_bed.and_stabilize()
    }

    fn starter_pressurized_within(
        test_bed: &mut PneumaticTestBed,
        engine_number: usize,
        duration: Duration,
    ) -> bool {
        let step = Duration::from_millis(100);
        let mut elapsed = Duration::ZERO;
        while elapsed < duration {
            test_bed.run_with_delta(step);
            elapsed += step;
            let pressurized: bool =
                test_bed.read_by_name(&format!("PNEU_ENG_{}_STARTER_PRESSURIZED", engine_number));
            if pressurized {
                return true;
            }
        }
        false
    }

    #[rstest]
    fn on_the_ground_the_crossbleed_valves_open_at_auto_for_an_engine_start(
        #[values(2, 3, 4)] engine_number: usize,
    ) {
        // FCOM DSC-36-10-50 (l.94076-94077): "They open automatically ... On ground, at engine
        // start". Before the fix AUTO opened only for the APU bleed valve or an ENG BLEED pb OFF:
        // the starter got no air and the start ended in START FAULT (NO STARTER AIR PRESSURE).
        let mut test_bed = on_the_ground_with_engine_1_running_and_no_apu_bleed();
        assert!(!test_bed.cross_bleed_valves_are_open());

        test_bed = test_bed
            .set_engine_state(engine_number, EngineState::Starting)
            .and_run();

        assert!(test_bed.es_valve_is_open(engine_number));
        assert!(test_bed.cross_bleed_valves_are_open());
        assert!(starter_pressurized_within(
            &mut test_bed,
            engine_number,
            Duration::from_secs(5)
        ));
    }

    #[test]
    fn on_the_ground_the_crossbleed_valves_open_at_auto_for_a_crank() {
        // ENG MODE CRANK, MAN START ON: the start sequence commands the start valve open
        let mut test_bed = on_the_ground_with_engine_1_running_and_no_apu_bleed();
        test_bed.write_by_name("ENGINE_2_START_VALVE_COMMAND", 1.);
        test_bed = test_bed.and_run();

        assert!(test_bed.cross_bleed_valves_are_open());
    }

    #[test]
    fn the_crossbleed_valves_close_again_when_the_start_valve_closes() {
        let mut test_bed = on_the_ground_with_engine_1_running_and_no_apu_bleed()
            .set_engine_state(2, EngineState::Starting)
            .and_run();
        assert!(test_bed.cross_bleed_valves_are_open());

        // DSC-70-30 (l.113558): "When N2 above 58.4 %: Engine start valve closes"
        test_bed.write_by_name("ENGINE_N3:2", 60.);
        test_bed = test_bed.and_run();
        assert!(!test_bed.es_valve_is_open(2));
        assert!(!test_bed.cross_bleed_valves_are_open());

        test_bed = test_bed.idle_eng2().and_stabilize();
        assert!(!test_bed.cross_bleed_valves_are_open());
    }

    #[test]
    fn the_crossbleed_valves_stay_closed_with_the_selector_shut_during_an_engine_start() {
        let mut test_bed = on_the_ground_with_engine_1_running_and_no_apu_bleed()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut)
            .set_engine_state(2, EngineState::Starting)
            .and_run();

        assert!(test_bed.es_valve_is_open(2));
        assert!(!test_bed.cross_bleed_valves_are_open());
        assert!(!starter_pressurized_within(
            &mut test_bed,
            2,
            Duration::from_secs(5)
        ));
    }

    #[test]
    fn in_flight_the_crossbleed_valves_stay_closed_at_auto_for_an_engine_start() {
        // "On ground" only: in flight the relight procedure sets X BLEED OPEN (l.174908)
        let test_bed = in_flight_with_engine_1_out(210.)
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
            .set_engine_state(1, EngineState::Starting)
            .and_run();

        assert!(test_bed.es_valve_is_open(1));
        assert!(!test_bed.cross_bleed_valves_are_open());
    }

    #[test]
    fn cross_bleed_valve_manual_overrides_everything() {
        let mut test_bed = test_bed_with()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut)
            .set_apu_bleed_valve_signal(ApuBleedAirValveSignal::new_open())
            .and_run();

        assert!(!test_bed.cross_bleed_valves_are_open());

        test_bed = test_bed
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Open)
            .set_apu_bleed_valve_signal(ApuBleedAirValveSignal::new_closed())
            .and_run();

        assert!(test_bed.cross_bleed_valves_are_open());
    }

    #[rstest]
    fn cross_bleed_valves_open_with_any_bleed_pb_off(#[values(1, 2, 3, 4)] engine_number: usize) {
        let mut test_bed = test_bed_with()
            .idle_eng1()
            .idle_eng2()
            .idle_eng3()
            .idle_eng4()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
            .and_stabilize();

        assert!(!test_bed.cross_bleed_valves_are_open());

        test_bed = test_bed
            .set_engine_bleed_push_button_off(engine_number)
            .and_run();

        assert!(test_bed.cross_bleed_valves_are_open());
    }

    #[test]
    fn vars_initialized_properly() {
        let test_bed = test_bed()
            .in_isa_atmosphere(Length::new::<foot>(0.))
            .and_run();

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_INTERMEDIATE_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_INTERMEDIATE_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_INTERMEDIATE_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_INTERMEDIATE_TRANSDUCER_PRESSURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_HP_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_HP_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_HP_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_HP_PRESSURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_TRANSFER_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_TRANSFER_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_TRANSFER_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_TRANSFER_TRANSDUCER_PRESSURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_REGULATED_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_REGULATED_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_REGULATED_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_REGULATED_TRANSDUCER_PRESSURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_DIFFERENTIAL_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_DIFFERENTIAL_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_DIFFERENTIAL_TRANSDUCER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_DIFFERENTIAL_TRANSDUCER_PRESSURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_STARTER_CONTAINER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_STARTER_CONTAINER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_STARTER_CONTAINER_PRESSURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_STARTER_CONTAINER_PRESSURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_IP_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_IP_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_IP_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_IP_TEMPERATURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_HP_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_HP_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_HP_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_HP_TEMPERATURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_TRANSFER_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_TRANSFER_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_TRANSFER_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_TRANSFER_TEMPERATURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_PRECOOLER_INLET_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_PRECOOLER_INLET_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_PRECOOLER_INLET_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_PRECOOLER_INLET_TEMPERATURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_PRECOOLER_OUTLET_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_PRECOOLER_OUTLET_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_PRECOOLER_OUTLET_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_PRECOOLER_OUTLET_TEMPERATURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_STARTER_CONTAINER_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_STARTER_CONTAINER_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_STARTER_CONTAINER_TEMPERATURE"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_STARTER_CONTAINER_TEMPERATURE"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_IP_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_IP_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_IP_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_IP_VALVE_OPEN"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_HP_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_HP_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_HP_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_HP_VALVE_OPEN"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_PR_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_PR_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_PR_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_PR_VALVE_OPEN"));

        assert!(test_bed.contains_variable_with_name("PNEU_ENG_1_STARTER_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_2_STARTER_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_3_STARTER_VALVE_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_ENG_4_STARTER_VALVE_OPEN"));

        assert!(test_bed.contains_variable_with_name("PNEU_PACK_1_FLOW_VALVE_1_FLOW_RATE"));
        assert!(test_bed.contains_variable_with_name("PNEU_PACK_1_FLOW_VALVE_2_FLOW_RATE"));
        assert!(test_bed.contains_variable_with_name("PNEU_PACK_2_FLOW_VALVE_1_FLOW_RATE"));
        assert!(test_bed.contains_variable_with_name("PNEU_PACK_2_FLOW_VALVE_2_FLOW_RATE"));

        assert!(test_bed.contains_variable_with_name("OVHD_PNEU_ENG_1_BLEED_PB_HAS_FAULT"));
        assert!(test_bed.contains_variable_with_name("OVHD_PNEU_ENG_2_BLEED_PB_HAS_FAULT"));
        assert!(test_bed.contains_variable_with_name("OVHD_PNEU_ENG_3_BLEED_PB_HAS_FAULT"));
        assert!(test_bed.contains_variable_with_name("OVHD_PNEU_ENG_4_BLEED_PB_HAS_FAULT"));

        assert!(test_bed.contains_variable_with_name("OVHD_PNEU_ENG_1_BLEED_PB_IS_AUTO"));
        assert!(test_bed.contains_variable_with_name("OVHD_PNEU_ENG_2_BLEED_PB_IS_AUTO"));
        assert!(test_bed.contains_variable_with_name("OVHD_PNEU_ENG_3_BLEED_PB_IS_AUTO"));
        assert!(test_bed.contains_variable_with_name("OVHD_PNEU_ENG_4_BLEED_PB_IS_AUTO"));

        assert!(test_bed.contains_variable_with_name("PNEU_XBLEED_VALVE_L_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_XBLEED_VALVE_C_OPEN"));
        assert!(test_bed.contains_variable_with_name("PNEU_XBLEED_VALVE_R_OPEN"));
    }

    #[rstest]
    fn pressure_regulating_valve_closes_with_ovhd_engine_bleed_off(
        #[values(1, 2, 3, 4)] engine_number: usize,
    ) {
        let mut test_bed = test_bed()
            .idle_eng1()
            .idle_eng2()
            .idle_eng3()
            .idle_eng4()
            .and_run();

        // We have to run two update ticks for the pressure to propagate through the system.
        test_bed.run_with_delta(Duration::from_secs(5));

        assert!(test_bed.pr_valve_is_open(engine_number));

        test_bed = test_bed
            .set_engine_bleed_push_button_off(engine_number)
            .and_run();

        for i in 1..=4 {
            assert_eq!(test_bed.pr_valve_is_open(i), i != engine_number);
        }
    }

    #[rstest]
    fn pressure_regulating_valve_closes_with_ovhd_engine_fire_pushbutton_released(
        #[values(1, 2, 3, 4)] engine_number: usize,
    ) {
        let mut test_bed = test_bed()
            .idle_eng1()
            .idle_eng2()
            .idle_eng3()
            .idle_eng4()
            .and_run();

        test_bed.run_with_delta(Duration::from_secs(5));

        assert!(test_bed.pr_valve_is_open(1));
        assert!(test_bed.pr_valve_is_open(2));
        assert!(test_bed.pr_valve_is_open(3));
        assert!(test_bed.pr_valve_is_open(4));

        test_bed = test_bed.release_fire_pushbutton(engine_number).and_run();

        for i in 1..=4 {
            assert_eq!(test_bed.pr_valve_is_open(i), i != engine_number);
        }
    }

    #[test]
    fn pressure_regulating_valves_close_with_apu_bleed_on() {
        let mut test_bed = test_bed_with()
            .idle_eng1()
            .idle_eng2()
            .idle_eng3()
            .idle_eng4()
            .and_run();

        test_bed.run_with_delta(Duration::from_secs(5));

        assert!(test_bed.pr_valve_is_open(1));
        assert!(test_bed.pr_valve_is_open(2));
        assert!(test_bed.pr_valve_is_open(3));
        assert!(test_bed.pr_valve_is_open(4));

        test_bed = test_bed.set_bleed_air_running().and_run();

        assert!(!test_bed.pr_valve_is_open(1));
        assert!(!test_bed.pr_valve_is_open(2));
        assert!(!test_bed.pr_valve_is_open(3));
        assert!(!test_bed.pr_valve_is_open(4));
    }

    #[rstest]
    fn pressure_regulating_valve_regulates_to_40_psig() {
        // Set engine parameters to values that will ensure enough upstream pressure,
        // so the desired downstream pressure of 40 psig can be reached.
        let test_bed = test_bed_with()
            .in_isa_atmosphere(Length::new::<foot>(0.))
            .mach_number(MachNumber(0.))
            .eng1_n1(0.7)
            .eng1_n2(0.875)
            .eng2_n1(0.7)
            .eng2_n2(0.875)
            .eng3_n1(0.7)
            .eng3_n2(0.875)
            .eng4_n1(0.7)
            .eng4_n2(0.875)
            .both_packs_auto()
            .and_stabilize();

        for engine_number in 1..=4 {
            assert_about_eq!(
                test_bed
                    .regulated_pressure_transducer_pressure(engine_number)
                    .unwrap()
                    .get::<psi>(),
                40.,
                pressure_tolerance().get::<psi>()
            );
        }
    }

    #[rstest]
    fn fadec_represents_engine_state(#[values(1, 2, 3, 4)] engine: usize) {
        let mut test_bed = test_bed_with().set_engine_state(engine, EngineState::Off);

        assert_eq!(test_bed.engine_state(engine), EngineState::Off);

        test_bed = test_bed
            .set_engine_state(engine, EngineState::Starting)
            .and_run();
        assert_eq!(test_bed.engine_state(engine), EngineState::Starting);

        test_bed = test_bed.set_engine_state(engine, EngineState::On).and_run();
        assert_eq!(test_bed.engine_state(engine), EngineState::On);

        test_bed = test_bed
            .set_engine_state(engine, EngineState::Shutting)
            .and_run();
        assert_eq!(test_bed.engine_state(engine), EngineState::Shutting);
    }

    #[test]
    fn apu_bleed_provides_at_least_30_psi_with_open_cross_bleed_valve() {
        let test_bed = test_bed_with()
            .stop_eng1()
            .stop_eng2()
            .stop_eng3()
            .stop_eng4()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
            .set_bleed_air_running()
            .and_stabilize();

        assert!(test_bed.cross_bleed_valves_are_open());

        assert!(!test_bed.pr_valve_is_open(1));
        assert!(!test_bed.pr_valve_is_open(2));
        assert!(!test_bed.pr_valve_is_open(3));
        assert!(!test_bed.pr_valve_is_open(4));

        assert_gt!(
            test_bed.precooler_outlet_pressure(1),
            Pressure::new::<psi>(30.)
        );
        assert_gt!(
            test_bed.precooler_outlet_pressure(2),
            Pressure::new::<psi>(30.)
        );
        assert_gt!(
            test_bed.precooler_outlet_pressure(3),
            Pressure::new::<psi>(30.)
        );
        assert_gt!(
            test_bed.precooler_outlet_pressure(4),
            Pressure::new::<psi>(30.)
        );
    }

    #[test]
    fn hydraulic_reservoirs_get_pressurized_with_apu() {
        let test_bed = test_bed_with()
            .stop_eng1()
            .stop_eng2()
            .stop_eng3()
            .stop_eng4()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
            .set_bleed_air_running()
            .and_stabilize();

        assert_gt!(
            test_bed.green_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(35.)
        );
        assert_gt!(
            test_bed.yellow_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(35.)
        );
    }

    #[test]
    fn hydraulic_reservoirs_pressurized_by_outboard_engines_hp_pipe() {
        let mut test_bed = test_bed_with()
            .idle_eng1()
            .stop_eng2()
            .stop_eng3()
            .idle_eng4()
            .set_engine_bleed_push_button_off(1)
            .set_engine_bleed_push_button_off(4)
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut);

        // Depressurize reservoirs
        test_bed.fail(FailureType::ReservoirAirLeak(HydraulicColor::Green));
        test_bed.fail(FailureType::ReservoirAirLeak(HydraulicColor::Yellow));
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(16));

        assert_lt!(
            test_bed.green_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(25.)
        );
        assert_lt!(
            test_bed.yellow_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(25.)
        );

        // Make sure bleed valves are closed because reservoirs should be pressurized by HP pipes directly
        assert!(!test_bed.pr_valve_is_open(1));
        assert!(!test_bed.pr_valve_is_open(4));

        test_bed.unfail(FailureType::ReservoirAirLeak(HydraulicColor::Green));
        test_bed.unfail(FailureType::ReservoirAirLeak(HydraulicColor::Yellow));
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(16));

        assert_gt!(
            test_bed.green_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(40.)
        );
        assert_gt!(
            test_bed.yellow_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(40.)
        );
    }

    #[test]
    fn hydraulic_reservoirs_pressurized_by_inboard_engines_system() {
        let mut test_bed = test_bed_with()
            .stop_eng1()
            .toga_eng2()
            .toga_eng3()
            .stop_eng4()
            .set_engine_bleed_push_button_off(1)
            .set_engine_bleed_push_button_off(4)
            // Close pack valves to make sure air does not bypass crossbleed valves through the packs
            .set_pack_flow_pb_is_auto(1, false)
            .set_pack_flow_pb_is_auto(2, false)
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut);

        // Depressurize reservoirs
        test_bed.fail(FailureType::ReservoirAirLeak(HydraulicColor::Green));
        test_bed.fail(FailureType::ReservoirAirLeak(HydraulicColor::Yellow));
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(16));

        assert_lt!(
            test_bed.green_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(20.)
        );
        assert_lt!(
            test_bed.yellow_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(20.)
        );

        // Make sure HP valves are closed because reservoirs should be pressurized by inboard engines system, not the HP pipe directly
        assert!(!test_bed.hp_valve_is_open(2));
        assert!(!test_bed.hp_valve_is_open(3));

        test_bed.unfail(FailureType::ReservoirAirLeak(HydraulicColor::Green));
        test_bed.unfail(FailureType::ReservoirAirLeak(HydraulicColor::Yellow));
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(16));

        // We still expect them not to be pressurized because the crossbleed valves are closed
        assert_lt!(
            test_bed.green_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(20.)
        );
        assert_lt!(
            test_bed.yellow_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(20.)
        );

        test_bed = test_bed
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Open)
            .and_stabilize();

        assert_gt!(
            test_bed.green_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(30.)
        );
        assert_gt!(
            test_bed.yellow_hydraulic_reservoir_pressure(),
            Pressure::new::<psi>(30.)
        );
    }

    #[test]
    fn hydraulic_reservoirs_maintain_pressure_after_bleed_pressure_loss() {
        // We don't run the outboard engines, because they supply HP air immediately
        // This HP air makes the preload pop immediately (which probably should not happnen, TODO)
        // When the preload pops, the pressure is obviously not maintained and the test fails.
        let mut test_bed = test_bed_with()
            .stop_eng1()
            .idle_eng2()
            .idle_eng3()
            .stop_eng4()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut)
            .mach_number(MachNumber(0.))
            .both_packs_auto()
            .and_stabilize();

        let pressure_before_green = test_bed.green_hydraulic_reservoir_pressure();
        let pressure_before_yellow = test_bed.yellow_hydraulic_reservoir_pressure();

        test_bed = test_bed.stop_eng2().stop_eng3().and_stabilize();

        assert_ge!(
            test_bed.green_hydraulic_reservoir_pressure(),
            pressure_before_green
        );
        assert_ge!(
            test_bed.yellow_hydraulic_reservoir_pressure(),
            pressure_before_yellow
        );
    }

    #[test]
    fn cross_bleed_valve_does_not_accept_manual_signal_when_bus_unpowered() {
        let mut test_bed = test_bed_with()
            .stop_eng1()
            .stop_eng2()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut)
            .mach_number(MachNumber(0.))
            .both_packs_auto()
            .set_dc_ess_bus_power(false)
            .and_run();

        assert!(test_bed.cross_bleed_valves_are_powered_for_automatic_control());
        assert!(!test_bed.cross_bleed_valves_are_powered_for_manual_control());
        assert!(!test_bed.cross_bleed_valves_are_open());

        test_bed = test_bed
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Open)
            .and_run();

        assert!(!test_bed.cross_bleed_valves_are_open());
    }

    /// A380 FCOM DSC-36-30 (a380_fcom.txt:94500-94505): the crossbleed valves are also supplied by DC ESS, so the
    /// XBLEED selector still opens them manually with DC 2 lost (before, manual control used the A320 DC ESS SHED
    /// busbar, which the A380 does not have, and was never powered).
    #[test]
    fn cross_bleed_valve_opens_manually_on_dc_ess() {
        let mut test_bed = test_bed_with()
            .stop_eng1()
            .stop_eng2()
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut)
            .mach_number(MachNumber(0.))
            .both_packs_auto()
            .set_dc_2_bus_power(false)
            .and_run();

        assert!(!test_bed.cross_bleed_valves_are_powered_for_automatic_control());
        assert!(test_bed.cross_bleed_valves_are_powered_for_manual_control());
        assert!(!test_bed.cross_bleed_valves_are_open());

        test_bed = test_bed
            .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Open)
            .and_run();

        assert!(test_bed.cross_bleed_valves_are_open());
    }

    #[test]
    fn large_time_step_stability() {
        let mut test_bed = test_bed_with()
            .idle_eng1()
            .idle_eng2()
            .idle_eng3()
            .idle_eng4()
            .mach_number(MachNumber(0.))
            .both_packs_auto()
            .and_stabilize();

        // Introduce perturbation
        test_bed = test_bed.toga_eng1().toga_eng2().toga_eng3().toga_eng4();

        test_bed.run_with_delta(Duration::from_millis(1000));

        assert!(!test_bed.precooler_inlet_pressure(1).is_nan());
        assert!(!test_bed.precooler_inlet_pressure(2).is_nan());
        assert!(!test_bed.precooler_inlet_pressure(3).is_nan());
        assert!(!test_bed.precooler_inlet_pressure(4).is_nan());
    }

    mod overhead {
        use super::*;

        #[test]
        fn ovhd_engine_bleed_push_buttons() {
            let mut test_bed = test_bed().and_run();

            assert!(test_bed.engine_bleed_push_button_is_auto(1));
            assert!(test_bed.engine_bleed_push_button_is_auto(2));

            test_bed = test_bed
                .set_engine_bleed_push_button_off(1)
                .set_engine_bleed_push_button_off(2)
                .and_run();

            assert!(!test_bed.engine_bleed_push_button_is_auto(1));
            assert!(!test_bed.engine_bleed_push_button_is_auto(2));
        }

        #[test]
        fn ovhd_cross_bleed_valve_mode_selector() {
            let mut test_bed = test_bed().and_run();

            assert_eq!(
                test_bed.cross_bleed_valve_selector(),
                CrossBleedValveSelectorMode::Auto
            );

            test_bed = test_bed
                .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Open)
                .and_run();

            assert_eq!(
                test_bed.cross_bleed_valve_selector(),
                CrossBleedValveSelectorMode::Open
            );

            test_bed = test_bed
                .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut)
                .and_run();

            assert_eq!(
                test_bed.cross_bleed_valve_selector(),
                CrossBleedValveSelectorMode::Shut
            );
        }
    }

    mod pack_flow_valve_tests {
        use super::*;

        #[test]
        fn pack_flow_valve_starts_closed() {
            let test_bed = test_bed();

            assert!(!test_bed.left_pack_flow_valve_is_open(1));
            assert!(!test_bed.right_pack_flow_valve_is_open(1));
            assert!(!test_bed.left_pack_flow_valve_is_open(2));
            assert!(!test_bed.right_pack_flow_valve_is_open(2));
        }

        #[test]
        fn pack_flow_valve_opens_when_conditions_met() {
            let test_bed = test_bed_with()
                .idle_eng1()
                .idle_eng2()
                .idle_eng3()
                .idle_eng4()
                .set_pack_flow_pb_is_auto(1, true)
                .set_pack_flow_pb_is_auto(2, true)
                .and_stabilize();

            assert!(test_bed.left_pack_flow_valve_is_open(1));
            assert!(test_bed.right_pack_flow_valve_is_open(1));
            assert!(test_bed.left_pack_flow_valve_is_open(2));
            assert!(test_bed.right_pack_flow_valve_is_open(2));
        }

        #[test]
        fn pack_flow_valve_closes_with_pack_pb_off() {
            let mut test_bed = test_bed_with()
                .idle_eng1()
                .idle_eng2()
                .idle_eng3()
                .idle_eng4()
                .set_pack_flow_pb_is_auto(1, true)
                .set_pack_flow_pb_is_auto(2, false)
                .and_stabilize();

            assert!(test_bed.left_pack_flow_valve_is_open(1));
            assert!(test_bed.right_pack_flow_valve_is_open(1));
            assert!(!test_bed.left_pack_flow_valve_is_open(2));
            assert!(!test_bed.right_pack_flow_valve_is_open(2));

            test_bed = test_bed
                .set_pack_flow_pb_is_auto(1, false)
                .and_run()
                .and_run();

            assert!(!test_bed.left_pack_flow_valve_is_open(1));
            assert!(!test_bed.right_pack_flow_valve_is_open(1));
            assert!(!test_bed.left_pack_flow_valve_is_open(2));
            assert!(!test_bed.right_pack_flow_valve_is_open(2));
        }

        #[test]
        fn jammed_pack_flow_valve_stays_open_when_its_pack_pb_is_set_off() {
            let mut test_bed = test_bed_with()
                .idle_eng1()
                .idle_eng2()
                .idle_eng3()
                .idle_eng4()
                .set_pack_flow_pb_is_auto(1, true)
                .set_pack_flow_pb_is_auto(2, true)
                .and_stabilize();
            assert!(test_bed.left_pack_flow_valve_is_open(1));
            assert!(test_bed.left_pack_flow_valve_is_open(2));

            // Pack flow valve 1 is the left valve of pack 1
            test_bed.fail(FailureType::PackFlowValveJammed(1));
            test_bed = test_bed
                .set_pack_flow_pb_is_auto(1, false)
                .and_run()
                .and_run();

            assert!(test_bed.left_pack_flow_valve_is_open(1));
            assert!(!test_bed.right_pack_flow_valve_is_open(1));
            assert!(test_bed.left_pack_flow_valve_is_open(2));
        }

        #[test]
        fn jammed_pack_flow_valve_stays_closed_when_its_pack_pb_is_set_on() {
            let mut test_bed = test_bed_with()
                .idle_eng1()
                .idle_eng2()
                .idle_eng3()
                .idle_eng4()
                .set_pack_flow_pb_is_auto(1, true)
                .set_pack_flow_pb_is_auto(2, false)
                .and_stabilize();
            assert!(!test_bed.right_pack_flow_valve_is_open(2));

            // Pack flow valve 4 is the right valve of pack 2
            test_bed.fail(FailureType::PackFlowValveJammed(4));
            test_bed = test_bed.set_pack_flow_pb_is_auto(2, true).and_stabilize();

            assert!(test_bed.left_pack_flow_valve_is_open(2));
            assert!(!test_bed.right_pack_flow_valve_is_open(2));
        }

        #[test]
        fn pack_flow_drops_when_valve_is_closed() {
            let mut test_bed = test_bed_with()
                .idle_eng1()
                .idle_eng2()
                .idle_eng3()
                .idle_eng4()
                .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut)
                .mach_number(MachNumber(0.))
                .both_packs_auto()
                .and_stabilize();

            assert_gt!(test_bed.left_pack_flow_valve_flow(1), flow_rate_tolerance());
            assert_gt!(
                test_bed.right_pack_flow_valve_flow(1),
                flow_rate_tolerance()
            );
            assert_gt!(test_bed.left_pack_flow_valve_flow(2), flow_rate_tolerance());
            assert_gt!(
                test_bed.right_pack_flow_valve_flow(2),
                flow_rate_tolerance()
            );

            test_bed = test_bed
                .set_pack_flow_pb_is_auto(1, false)
                .set_pack_flow_pb_is_auto(2, false)
                .and_stabilize();

            assert_lt!(test_bed.left_pack_flow_valve_flow(1), flow_rate_tolerance());
            assert_lt!(
                test_bed.right_pack_flow_valve_flow(1),
                flow_rate_tolerance()
            );
            assert_lt!(test_bed.left_pack_flow_valve_flow(2), flow_rate_tolerance());
            assert_lt!(
                test_bed.right_pack_flow_valve_flow(2),
                flow_rate_tolerance()
            );
        }
    }

    /// The CPIOM-A bleed monitoring: overtemperature, overpressure, leaks, bleed valve position, the
    /// ENG BLEED pb-sw FAULT light (A380 FCOM DSC-36-10-20, DSC-36-10-60, DSC-36-20)
    mod bleed_monitoring {
        use super::*;
        use crate::pneumatic::{BleedOverheatMonitor, BleedOverpressureMonitor};

        fn flag(test_bed: &mut PneumaticTestBed, name: &str) -> bool {
            test_bed.read_by_name(name)
        }

        fn fault_light(test_bed: &mut PneumaticTestBed, engine_number: usize) -> bool {
            flag(
                test_bed,
                &format!("OVHD_PNEU_ENG_{}_BLEED_PB_HAS_FAULT", engine_number),
            )
        }

        fn cross_bleed_valve_is_open(test_bed: &mut PneumaticTestBed, valve: &str) -> bool {
            flag(test_bed, &format!("PNEU_XBLEED_VALVE_{}_OPEN", valve))
        }

        fn run_seconds(test_bed: &mut PneumaticTestBed, seconds: u64) {
            for _ in 0..seconds {
                test_bed.run_with_delta(Duration::from_secs(1));
            }
        }

        fn four_engines_at_idle() -> PneumaticTestBed {
            let mut test_bed = test_bed_with()
                .idle_eng1()
                .idle_eng2()
                .idle_eng3()
                .idle_eng4()
                .both_packs_auto()
                .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
                .and_stabilize();
            run_seconds(&mut test_bed, 10);
            test_bed
        }

        fn four_engines_at_take_off_power() -> PneumaticTestBed {
            let mut test_bed = test_bed_with()
                .toga_eng1()
                .toga_eng2()
                .toga_eng3()
                .toga_eng4()
                .both_packs_auto()
                .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto)
                .and_stabilize();
            run_seconds(&mut test_bed, 10);
            test_bed
        }

        /// Design choice for these tests: N1 90 %, N2 95 %, about the take off thrust of the model,
        /// set from idle (a start from rest at high power over pressurises the ducts)
        fn four_engines_at_high_power() -> PneumaticTestBed {
            let mut test_bed = four_engines_at_idle()
                .eng1_n1(0.9)
                .eng1_n2(0.95)
                .eng2_n1(0.9)
                .eng2_n2(0.95)
                .eng3_n1(0.9)
                .eng3_n2(0.95)
                .eng4_n1(0.9)
                .eng4_n2(0.95)
                .and_stabilize();
            run_seconds(&mut test_bed, 10);
            test_bed
        }

        impl SimulationElement for BleedOverheatMonitor {}
        impl SimulationElement for BleedOverpressureMonitor {}

        fn overheat_after(seconds: u64, temperature_celsius: f64, pressure_psig: f64) -> bool {
            let mut test_bed = SimulationTestBed::from(BleedOverheatMonitor::new());
            test_bed.set_update_after_power_distribution(move |monitor, context| {
                monitor.update(
                    context,
                    ThermodynamicTemperature::new::<degree_celsius>(temperature_celsius),
                    Pressure::new::<psi>(pressure_psig),
                )
            });
            for _ in 0..seconds {
                test_bed.run_with_delta(Duration::from_secs(1));
            }
            test_bed.query_element(|monitor| monitor.has_overheat())
        }

        fn overpressure_after(seconds: u64, pressure_psig: f64, temperature_celsius: f64) -> bool {
            let mut test_bed = SimulationTestBed::from(BleedOverpressureMonitor::new());
            test_bed.set_update_after_power_distribution(move |monitor, context| {
                monitor.update(
                    context,
                    Pressure::new::<psi>(pressure_psig),
                    ThermodynamicTemperature::new::<degree_celsius>(temperature_celsius),
                    false,
                )
            });
            for _ in 0..seconds {
                test_bed.run_with_delta(Duration::from_secs(1));
            }
            test_bed.query_element(|monitor| monitor.has_overpressure())
        }

        /// The overpressure monitor fed for 30 s with a pressure that alternates every 2 s between
        /// `high_psig` and `low_psig`, the overpressure valve being closed during the high phases
        /// when `valve_closes_at_high`
        fn overpressure_with_cycling_pressure(
            high_psig: f64,
            low_psig: f64,
            valve_closes_at_high: bool,
        ) -> bool {
            let mut test_bed = SimulationTestBed::from(BleedOverpressureMonitor::new());
            for second in 0..30 {
                let high = (second / 2) % 2 == 0;
                let pressure_psig = if high { high_psig } else { low_psig };
                let valve_closed = high && valve_closes_at_high;
                test_bed.set_update_after_power_distribution(move |monitor, context| {
                    monitor.update(
                        context,
                        Pressure::new::<psi>(pressure_psig),
                        ThermodynamicTemperature::new::<degree_celsius>(200.),
                        valve_closed,
                    )
                });
                test_bed.run_with_delta(Duration::from_secs(1));
            }
            test_bed.query_element(|monitor| monitor.has_overpressure())
        }

        /// FCOM DSC-36-10-20 l.93943-93947: 260 °C up to 45 PSI, 245 °C above, for more than 55 s
        #[test]
        fn overtemperature_limits_depend_on_the_bleed_pressure() {
            assert!(overheat_after(57, 265., 40.));
            assert!(!overheat_after(57, 255., 40.));
            assert!(overheat_after(57, 250., 50.));
            assert!(!overheat_after(57, 240., 50.));
            assert!(!overheat_after(50, 265., 40.));
        }

        /// FCOM DSC-36-10-20 l.93934-93939: 60 PSI up to 245 °C, 45 PSI above, for more than 15 s
        #[test]
        fn overpressure_limits_depend_on_the_bleed_temperature() {
            assert!(overpressure_after(17, 61., 200.));
            assert!(!overpressure_after(17, 59., 200.));
            assert!(overpressure_after(17, 46., 250.));
            assert!(!overpressure_after(17, 44., 250.));
            assert!(!overpressure_after(10, 61., 200.));
        }

        /// A failed regulation cycled by the overpressure valve between 55 and 85 PSI (FCOM
        /// DSC-36-10-20 l.93886-93888) is an overpressure (BleedOverpressureMonitor)
        #[test]
        fn an_overpressure_cycled_by_the_overpressure_valve_is_detected() {
            assert!(overpressure_with_cycling_pressure(85., 55., true));
        }

        /// A regulated pressure that keeps dipping below 60 PSI, with the overpressure valve open,
        /// is no overpressure ("exceeds 60 PSI ... during more than 15 s", l.93934-93939). With a
        /// filtered pressure the 70/55 PSI swings of the model's regulation at high power (one
        /// bleed feeding the crossbled ducts) added up to an overpressure.
        #[test]
        fn a_pressure_dipping_below_60_psi_without_the_overpressure_valve_is_no_overpressure() {
            assert!(!overpressure_with_cycling_pressure(70., 55., false));
        }

        #[test]
        fn normal_operation_gives_no_bleed_fault_detection() {
            for mut test_bed in [
                four_engines_at_idle(),
                four_engines_at_take_off_power(),
                four_engines_at_high_power(),
            ] {
                run_seconds(&mut test_bed, 70);
                for engine in 1..=4 {
                    for name in [
                        "OVERPRESSURE",
                        "OVERHEAT",
                        "BLEED_LEAK",
                        "PR_VALVE_DISAGREE",
                    ] {
                        assert!(
                            !flag(&mut test_bed, &format!("PNEU_ENG_{engine}_{name}")),
                            "ENG {engine} {name}"
                        );
                    }
                    assert!(!fault_light(&mut test_bed, engine), "ENG {engine} FAULT");
                }
                for zone in ["L_OUTR", "L_INR", "R_INR", "R_OUTR"] {
                    assert!(!flag(&mut test_bed, &format!("PNEU_{zone}_WING_LEAK")));
                }
                assert!(!test_bed.cross_bleed_valves_are_open());
            }
        }

        /// FCOM DSC-36-20 l.94280: "The engine bleed position disagrees with the requested position"
        #[test]
        fn a_bleed_valve_stuck_closed_lights_the_fault_after_the_confirmation_time() {
            let mut test_bed = four_engines_at_idle();

            test_bed.fail(FailureType::EngineBleedValveStuckClosed(2));
            run_seconds(&mut test_bed, 5);
            assert!(!test_bed.pr_valve_is_open(2));
            assert!(!fault_light(&mut test_bed, 2));

            run_seconds(&mut test_bed, 7);
            assert!(flag(&mut test_bed, "PNEU_ENG_2_PR_VALVE_DISAGREE"));
            assert!(fault_light(&mut test_bed, 2));
            assert!(!fault_light(&mut test_bed, 1));
        }

        #[test]
        fn a_bleed_valve_stuck_open_with_the_pb_off_lights_the_fault() {
            let mut test_bed = four_engines_at_idle();

            test_bed.fail(FailureType::EngineBleedValveStuckOpen(3));
            test_bed = test_bed.set_engine_bleed_push_button_off(3);
            run_seconds(&mut test_bed, 12);

            assert!(test_bed.pr_valve_is_open(3));
            assert!(flag(&mut test_bed, "PNEU_ENG_3_PR_VALVE_DISAGREE"));
            assert!(fault_light(&mut test_bed, 3));
        }

        /// The path of AIR ENG 1(2)(3)(4) BLEED FAULT by overpressure (PRO-ABN l.167922-167928): a
        /// bleed valve stuck open no longer regulates, the bleed pressure rises at high power. The
        /// CPIOM-A commands the bleed valve closed (DSC-36-10-20 l.93931-93939), the stuck valve
        /// disagrees, the crossbleed valves open at AUTO ("In case any engine bleed system fails",
        /// DSC-36-10-50 l.94076-94079)
        #[test]
        fn a_bleed_valve_stuck_open_gives_an_overpressure_at_high_power() {
            let mut test_bed = four_engines_at_high_power();
            assert!(!test_bed.cross_bleed_valves_are_open());

            test_bed.fail(FailureType::EngineBleedValveStuckOpen(1));
            // The overpressure valve cycles the pressure between 55 and 85 PSI: its closures count
            // as an overpressure (BleedOverpressureMonitor), confirmed after 15 s
            run_seconds(&mut test_bed, 30);
            assert!(flag(&mut test_bed, "PNEU_ENG_1_OVERPRESSURE"));
            assert!(fault_light(&mut test_bed, 1));
            assert!(test_bed.cross_bleed_valves_are_open());

            // Commanded closed, but stuck open: the disagreement is confirmed 10 s after the
            // overpressure closing command (with the cycling pressure the regulation no longer asks
            // the valve closed before it)
            run_seconds(&mut test_bed, 10);
            assert!(test_bed.pr_valve_is_open(1));
            assert!(flag(&mut test_bed, "PNEU_ENG_1_PR_VALVE_DISAGREE"));
            assert!(!flag(&mut test_bed, "PNEU_ENG_2_OVERPRESSURE"));
            assert!(!fault_light(&mut test_bed, 2));
        }

        /// FCOM DSC-36-20 l.94290-94291: "The FAULT light goes off, when the flight crew selects OFF,
        /// and the applicable failure disappears"; the closure holds with it
        #[test]
        fn an_overpressure_holds_the_bleed_valve_closed_until_the_pb_is_set_off() {
            let mut test_bed = four_engines_at_high_power();
            test_bed.fail(FailureType::EngineBleedValveStuckOpen(1));
            run_seconds(&mut test_bed, 30);
            assert!(flag(&mut test_bed, "PNEU_ENG_1_OVERPRESSURE"));

            test_bed.unfail(FailureType::EngineBleedValveStuckOpen(1));
            run_seconds(&mut test_bed, 30);
            assert!(flag(&mut test_bed, "PNEU_ENG_1_OVERPRESSURE"));
            assert!(fault_light(&mut test_bed, 1));
            assert!(!test_bed.pr_valve_is_open(1));

            test_bed = test_bed.set_engine_bleed_push_button_off(1);
            run_seconds(&mut test_bed, 30);
            assert!(!flag(&mut test_bed, "PNEU_ENG_1_OVERPRESSURE"));
            assert!(!fault_light(&mut test_bed, 1));

            // Back to idle, where the regulation keeps the bleed valve open
            test_bed = test_bed
                .set_engine_bleed_push_button_auto(1)
                .idle_eng1()
                .idle_eng2()
                .idle_eng3()
                .idle_eng4();
            run_seconds(&mut test_bed, 30);
            assert!(test_bed.pr_valve_is_open(1));
            assert!(!flag(&mut test_bed, "PNEU_ENG_1_OVERPRESSURE"));
            assert!(!fault_light(&mut test_bed, 1));
        }

        /// A bleed overtemperature (DSC-36-10-20 l.93867-93871, l.93940-93947): the CPIOM-A closes the
        /// HP valve and the bleed valve, and the FAULT light comes on. The bleed of the model does not
        /// reach 245 deg C without a failure that also over pressurises it: the detection is set here.
        #[test]
        fn an_overheat_closes_the_hp_valve_and_the_bleed_valve() {
            let mut test_bed = four_engines_at_idle();
            assert!(test_bed.pr_valve_is_open(2));

            test_bed.command(|a| {
                a.pneumatic.core_processing_input_output_module_a.units[1].overheat_latched = true
            });
            run_seconds(&mut test_bed, 5);

            assert!(flag(&mut test_bed, "PNEU_ENG_2_OVERHEAT"));
            assert!(fault_light(&mut test_bed, 2));
            assert!(!test_bed.hp_valve_is_open(2));
            assert!(!test_bed.pr_valve_is_open(2));
            assert!(test_bed.cross_bleed_valves_are_open());
        }

        /// AIR ENG 1(4) BLEED LEAK (FCOM DSC-36-10-60 l.94147-94155, PRO-ABN l.168628-168664): the
        /// bleed valve of the engine, the crossbleed valve of its side and the center crossbleed valve
        /// close at AUTO; the FAULT light comes on
        #[test]
        fn an_outer_engine_pylon_leak_closes_its_bleed_and_the_side_and_center_crossbleed_valves() {
            let mut test_bed = four_engines_at_high_power()
                .set_engine_bleed_push_button_off(2)
                .and_stabilize();
            assert!(test_bed.cross_bleed_valves_are_open());

            test_bed.fail(FailureType::EngineBleedLeak(1));
            run_seconds(&mut test_bed, 10);

            assert!(flag(&mut test_bed, "PNEU_ENG_1_BLEED_LEAK"));
            assert!(fault_light(&mut test_bed, 1));
            assert!(!test_bed.pr_valve_is_open(1));
            assert!(!cross_bleed_valve_is_open(&mut test_bed, "L"));
            assert!(!cross_bleed_valve_is_open(&mut test_bed, "C"));
            assert!(cross_bleed_valve_is_open(&mut test_bed, "R"));
            assert!(!fault_light(&mut test_bed, 4));
        }

        /// AIR L INR WING LEAK (FCOM DSC-36-10-60 l.94185-94194, PRO-ABN l.168486-168500): the bleed
        /// valve of the engine and the crossbleed valve of its side close
        #[test]
        fn an_inner_wing_leak_closes_its_bleed_and_the_side_crossbleed_valve() {
            let mut test_bed = four_engines_at_idle()
                .set_engine_bleed_push_button_off(4)
                .and_stabilize();
            assert!(test_bed.cross_bleed_valves_are_open());

            test_bed.fail(FailureType::WingBleedLeak(2));
            run_seconds(&mut test_bed, 10);

            assert!(flag(&mut test_bed, "PNEU_L_INR_WING_LEAK"));
            assert!(!flag(&mut test_bed, "PNEU_ENG_2_BLEED_LEAK"));
            assert!(fault_light(&mut test_bed, 2));
            assert!(!test_bed.pr_valve_is_open(2));
            assert!(!cross_bleed_valve_is_open(&mut test_bed, "L"));
            assert!(cross_bleed_valve_is_open(&mut test_bed, "C"));
            assert!(cross_bleed_valve_is_open(&mut test_bed, "R"));
        }

        /// The XBLEED selector OPEN keeps the valves open: the leak closure is an AUTO function
        /// (DSC-36-10-60 l.94147-94149 "provided that the XBLEED selector position is at AUTO")
        #[test]
        fn a_leak_does_not_close_the_crossbleed_valves_with_the_selector_open() {
            let mut test_bed = four_engines_at_idle()
                .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Open)
                .and_stabilize();

            test_bed.fail(FailureType::WingBleedLeak(4));
            run_seconds(&mut test_bed, 10);

            assert!(flag(&mut test_bed, "PNEU_R_OUTR_WING_LEAK"));
            assert!(test_bed.cross_bleed_valves_are_open());
        }

        /// The gauge pressure, the test bed being at the ISA sea level pressure
        fn gauge_pressure_psi(pressure: Pressure) -> f64 {
            (pressure - InternationalStandardAtmosphere::ground_pressure()).get::<psi>()
        }

        /// The overpressure valve (FCOM DSC-36-10-20 l.93886-93888): "closes, if the bleed pressure
        /// downstream of the engine bleed valve exceeds 85 PSI. It automatically opens again, when
        /// pressure goes below 55 PSI." Without it a bleed valve stuck open at high power let the
        /// duct reach about 141 PSI.
        #[test]
        fn the_overpressure_valve_limits_the_pressure_of_a_bleed_valve_stuck_open() {
            let mut test_bed = four_engines_at_high_power();
            assert!(!flag(&mut test_bed, "PNEU_ENG_1_OVERPRESSURE_VALVE_CLOSED"));

            test_bed.fail(FailureType::EngineBleedValveStuckOpen(1));
            let mut highest_psig: f64 = 0.;
            let mut closings = 0;
            let mut openings = 0;
            let mut was_closed = false;
            let mut overpressure_detected_after_s = None;
            for step in 1..=120 {
                test_bed.run_with_delta(Duration::from_millis(500));
                let pressure = test_bed.precooler_inlet_pressure(1);
                highest_psig = highest_psig.max(gauge_pressure_psi(pressure));
                let closed = flag(&mut test_bed, "PNEU_ENG_1_OVERPRESSURE_VALVE_CLOSED");
                if closed && !was_closed {
                    closings += 1;
                } else if !closed && was_closed {
                    openings += 1;
                }
                was_closed = closed;
                if overpressure_detected_after_s.is_none()
                    && flag(&mut test_bed, "PNEU_ENG_1_OVERPRESSURE")
                {
                    overpressure_detected_after_s = Some(step as f64 / 2.);
                }
            }

            assert!(
                highest_psig > 85. && highest_psig < 95.,
                "highest pressure {highest_psig} PSI"
            );
            assert_ge!(closings, 1);
            assert_ge!(openings, 1);
            assert!(!flag(&mut test_bed, "PNEU_ENG_2_OVERPRESSURE_VALVE_CLOSED"));
            // The bleed regulation failure is still detected (60 PSI for 15 s, the overpressure valve
            // closures included)
            assert!(
                overpressure_detected_after_s.is_some_and(|seconds| seconds <= 30.),
                "overpressure detected after {overpressure_detected_after_s:?} s"
            );
        }

        #[test]
        fn the_overpressure_valve_stays_open_in_normal_operation() {
            for mut test_bed in [four_engines_at_idle(), four_engines_at_high_power()] {
                run_seconds(&mut test_bed, 30);
                for engine in 1..=4 {
                    assert!(!flag(
                        &mut test_bed,
                        &format!("PNEU_ENG_{engine}_OVERPRESSURE_VALVE_CLOSED")
                    ));
                }
            }
        }

        fn bleed_valve_flow(test_bed: &PneumaticTestBed, engine_number: usize) -> f64 {
            test_bed.query(|a| {
                a.pneumatic.engine_systems[engine_number - 1]
                    .bleed_valve_air_flow()
                    .get::<kilogram_per_second>()
            })
        }

        fn flow_balancing_offset(test_bed: &PneumaticTestBed, engine_number: usize) -> f64 {
            test_bed.query(|a| {
                a.pneumatic.core_processing_input_output_module_a.units[engine_number - 1]
                    .flow_balancing_target_offset_psi
            })
        }

        /// FCOM DSC-36-10-20 l.93882-93885: "The engine bleed valve regulates the airflow, to balance
        /// the pressure of the air bled from the two engines that are on the same side." Engine 1 at
        /// take off power, engine 2 at idle, their ducts joined by the left crossbleed valve:
        /// without the balancing engine 1 delivered 0.58 kg/s and engine 2 0.43 kg/s.
        #[test]
        fn the_bleed_valves_of_a_side_balance_their_airflow_through_the_open_crossbleed_valve() {
            let mut test_bed = four_engines_at_idle()
                .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Open)
                .toga_eng1()
                .and_stabilize();
            run_seconds(&mut test_bed, 40);

            let (first, second) = (
                bleed_valve_flow(&test_bed, 1),
                bleed_valve_flow(&test_bed, 2),
            );
            assert_gt!(first, 0.1);
            assert_lt!((first - second).abs() / (first + second), 0.05);
            assert_lt!(flow_balancing_offset(&test_bed, 1), 0.);
            assert_gt!(flow_balancing_offset(&test_bed, 2), 0.);
        }

        /// With the side crossbleed valve closed each bleed only feeds its own pack valve: no
        /// balancing (design choice)
        #[test]
        fn the_bleed_valves_do_not_balance_with_the_side_crossbleed_valve_closed() {
            let mut test_bed = four_engines_at_idle().toga_eng1().and_stabilize();
            run_seconds(&mut test_bed, 20);

            assert!(!test_bed.cross_bleed_valves_are_open());
            for engine in 1..=4 {
                assert_about_eq!(flow_balancing_offset(&test_bed, engine), 0.);
            }
        }

        /// The crossbleed valves are driven by the CPIOM-A1+A2 (left) and A3+A4 (center, right)
        /// (CROSS_BLEED_VALVE_CPIOM_A_UNITS). Before, all three followed the CPIOM-A1 unit only and
        /// a lost CPIOM-A changed nothing.
        #[test]
        fn without_the_cpiom_a3_and_a4_the_center_and_right_crossbleed_valves_lose_their_auto_control(
        ) {
            let mut test_bed = test_bed_with().both_packs_auto();
            test_bed.fail(FailureType::CoreProcessingInputOutputModule('A', 3));
            test_bed.fail(FailureType::CoreProcessingInputOutputModule('A', 4));
            test_bed = test_bed.set_bleed_air_running().and_stabilize();

            assert!(test_bed.apu_bleed_valve_is_open());
            assert!(cross_bleed_valve_is_open(&mut test_bed, "L"));
            assert!(!cross_bleed_valve_is_open(&mut test_bed, "C"));
            assert!(!cross_bleed_valve_is_open(&mut test_bed, "R"));
            assert!(!flag(
                &mut test_bed,
                "PNEU_XBLEED_VALVE_L_AUTO_CONTROL_LOST"
            ));
            assert!(flag(&mut test_bed, "PNEU_XBLEED_VALVE_C_AUTO_CONTROL_LOST"));
            assert!(flag(&mut test_bed, "PNEU_XBLEED_VALVE_R_AUTO_CONTROL_LOST"));

            // The XBLEED selector still moves them (manual control)
            test_bed = test_bed
                .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Open)
                .and_run();
            assert!(test_bed.cross_bleed_valves_are_open());
            test_bed = test_bed
                .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Shut)
                .and_run();
            for valve in ["L", "C", "R"] {
                assert!(!cross_bleed_valve_is_open(&mut test_bed, valve));
            }
        }

        #[rstest]
        fn one_cpiom_a_of_each_pair_keeps_the_crossbleed_valves_automatic(
            #[values(1, 2, 3, 4)] lost_unit: u8,
        ) {
            let mut test_bed = test_bed_with().both_packs_auto();
            test_bed.fail(FailureType::CoreProcessingInputOutputModule('A', lost_unit));
            test_bed = test_bed.set_bleed_air_running().and_stabilize();

            assert!(test_bed.cross_bleed_valves_are_open());
            for valve in ["L", "C", "R"] {
                assert!(!flag(
                    &mut test_bed,
                    &format!("PNEU_XBLEED_VALVE_{valve}_AUTO_CONTROL_LOST")
                ));
            }
        }

        fn with_hp_ground_air(mut test_bed: PneumaticTestBed) -> PneumaticTestBed {
            test_bed.write_by_name("ASU_TURNED_ON", true);
            test_bed
        }

        /// FCOM DSC-36-10-40 l.94031-94039: "An HP ground source can be connected to each HP ground
        /// connector, to supply bleed air to the aircraft". The ground air start procedure checks
        /// "BLEED PRESS > 25 PSI" (PRO-SUP-70-10 l.180945).
        #[test]
        fn the_hp_ground_air_pressurises_the_bleed_duct() {
            let test_bed = test_bed_with().and_stabilize();
            let without_ground_air = gauge_pressure_psi(test_bed.precooler_outlet_pressure(1));
            assert_lt!(without_ground_air, 1.);

            let test_bed = with_hp_ground_air(test_bed_with()).and_stabilize();
            let with_ground_air = gauge_pressure_psi(test_bed.precooler_outlet_pressure(1));
            assert_gt!(with_ground_air, 25.);
            assert!(!test_bed.apu_bleed_valve_is_open());
        }

        /// The engine start with ground pneumatic power (PRO-SUP-70-10 l.180938-180950): the ground
        /// air turns the starter of any engine, the crossbleed valves opening at AUTO for the start
        #[rstest]
        fn an_engine_starts_with_the_hp_ground_air(#[values(1, 2, 3, 4)] engine_number: usize) {
            let mut test_bed = with_hp_ground_air(test_bed_with())
                .stop_eng1()
                .stop_eng2()
                .stop_eng3()
                .stop_eng4()
                .cross_bleed_valve_selector_knob(CrossBleedValveSelectorMode::Auto);
            test_bed.set_on_ground(true);
            test_bed.set_indicated_airspeed(Velocity::default());
            test_bed = test_bed.and_stabilize();
            assert!(!flag(
                &mut test_bed,
                &format!("PNEU_ENG_{engine_number}_STARTER_PRESSURIZED")
            ));

            test_bed = test_bed
                .set_engine_state(engine_number, EngineState::Starting)
                .and_run();
            assert!(test_bed.es_valve_is_open(engine_number));
            assert!(starter_pressurized_within(
                &mut test_bed,
                engine_number,
                Duration::from_secs(5)
            ));
        }

        fn apu_bleed_fault_light(test_bed: &mut PneumaticTestBed) -> bool {
            flag(test_bed, "OVHD_PNEU_APU_BLEED_PB_HAS_FAULT")
        }

        /// AIR APU BLEED LEAK (FCOM DSC-36-10-60 l.94205-94207, PRO-ABN l.167752-167796): "the APU
        /// bleed valve, and the APU isolation valve automatically close. APU bleed is no longer
        /// available"; "If the APU BLEED pb-sw is set to ON, the FAULT light remains. If the APU
        /// BLEED pb-sw is off, the FAULT light goes off when the overheat due to the bleed leak
        /// disappears."
        #[test]
        fn an_apu_bleed_leak_closes_the_apu_bleed_and_holds_until_the_apu_bleed_pb_is_off() {
            let mut test_bed = test_bed_with()
                .both_packs_auto()
                .set_bleed_air_running()
                .and_stabilize();
            assert!(test_bed.apu_bleed_valve_is_open());
            assert!(test_bed.cross_bleed_valves_are_open());
            assert!(!apu_bleed_fault_light(&mut test_bed));

            test_bed.fail(FailureType::ApuBleedLeak);
            run_seconds(&mut test_bed, 5);
            assert!(flag(&mut test_bed, "PNEU_APU_BLEED_LEAK"));
            assert!(apu_bleed_fault_light(&mut test_bed));
            assert!(!test_bed.apu_bleed_valve_is_open());
            // No APU bleed any more: the crossbleed valves close at AUTO
            assert!(!test_bed.cross_bleed_valves_are_open());

            test_bed.unfail(FailureType::ApuBleedLeak);
            run_seconds(&mut test_bed, 10);
            assert!(flag(&mut test_bed, "PNEU_APU_BLEED_LEAK"));
            assert!(!test_bed.apu_bleed_valve_is_open());

            test_bed.write_by_name("OVHD_PNEU_APU_BLEED_PB_IS_ON", false);
            run_seconds(&mut test_bed, 2);
            assert!(!flag(&mut test_bed, "PNEU_APU_BLEED_LEAK"));
            assert!(!apu_bleed_fault_light(&mut test_bed));
        }

        fn hot_air_valve_is_open(test_bed: &PneumaticTestBed, hot_air_number: usize) -> bool {
            test_bed.query(|a| {
                a.air_conditioning
                    .air_conditioning
                    .hot_air_valve_is_open(hot_air_number)
            })
        }

        /// AIR PACK 1(2) LEAK (FCOM DSC-36-10-60 l.94220-94222, PRO-ABN l.168890-168900): "The two
        /// pack valves of the affected pack and the corresponding hot-air valve automatically
        /// close"; the PACK pb FAULT light (DSC-21-10-20 l.5616-5627)
        #[rstest]
        fn a_pack_bay_leak_closes_its_pack_valves_and_its_hot_air_valve(
            #[values(1, 2)] pack: usize,
        ) {
            let other = 3 - pack;
            let mut test_bed = four_engines_at_idle();
            assert!(test_bed.left_pack_flow_valve_is_open(pack));
            assert!(hot_air_valve_is_open(&test_bed, pack));

            test_bed.fail(FailureType::PackBayLeak(pack));
            run_seconds(&mut test_bed, 20);

            assert!(flag(&mut test_bed, &format!("PNEU_PACK_{pack}_LEAK")));
            assert!(flag(
                &mut test_bed,
                &format!("OVHD_COND_PACK_{pack}_PB_HAS_FAULT")
            ));
            assert!(!test_bed.left_pack_flow_valve_is_open(pack));
            assert!(!test_bed.right_pack_flow_valve_is_open(pack));
            assert!(!hot_air_valve_is_open(&test_bed, pack));
            assert!(test_bed.left_pack_flow_valve_is_open(other));
            assert!(test_bed.right_pack_flow_valve_is_open(other));
            assert!(hot_air_valve_is_open(&test_bed, other));
            assert!(!flag(&mut test_bed, &format!("PNEU_PACK_{other}_LEAK")));
            // The hot-air valve closes for the pack leak: no HOT AIR FAULT light (the local light of
            // AIR PACK 1(2) LEAK is the PACK pb)
            assert!(!flag(
                &mut test_bed,
                &format!("OVHD_COND_HOT_AIR_{pack}_PB_HAS_FAULT")
            ));
        }

        /// AIR HOT AIR 1(2) LEAK (FCOM DSC-36-10-60 l.94235-94237, PRO-ABN l.168411-168420): "The
        /// corresponding hot-air valve closes automatically", HOT AIR 1(2) pb local light
        #[rstest]
        fn a_hot_air_duct_leak_closes_its_hot_air_valve(#[values(1, 2)] hot_air: usize) {
            let other = 3 - hot_air;
            let mut test_bed = four_engines_at_idle();
            assert!(hot_air_valve_is_open(&test_bed, hot_air));

            test_bed.fail(FailureType::HotAirDuctLeak(hot_air));
            run_seconds(&mut test_bed, 20);

            assert!(flag(&mut test_bed, &format!("PNEU_HOT_AIR_{hot_air}_LEAK")));
            assert!(flag(
                &mut test_bed,
                &format!("OVHD_COND_HOT_AIR_{hot_air}_PB_HAS_FAULT")
            ));
            assert!(!hot_air_valve_is_open(&test_bed, hot_air));
            assert!(hot_air_valve_is_open(&test_bed, other));
            assert!(test_bed.left_pack_flow_valve_is_open(hot_air));
            assert!(test_bed.right_pack_flow_valve_is_open(hot_air));
        }

        /// AIR FWD CARGO DUCT LEAK (PRO-ABN l.168341-168360): "If the hot-air valve 1 did not close
        /// automatically: HOT AIR 1 OFF"; it holds until the HOT AIR 1 pb is OFF (design choice, as
        /// the other leaks)
        #[test]
        fn a_forward_cargo_duct_leak_closes_the_hot_air_valve_1_until_the_hot_air_1_pb_is_off() {
            let mut test_bed = four_engines_at_idle();
            test_bed.fail(FailureType::FwdCargoBleedDuctLeak);
            run_seconds(&mut test_bed, 20);

            assert!(flag(&mut test_bed, "PNEU_FWD_CARGO_DUCT_LEAK"));
            assert!(flag(&mut test_bed, "OVHD_COND_HOT_AIR_1_PB_HAS_FAULT"));
            assert!(!hot_air_valve_is_open(&test_bed, 1));
            assert!(hot_air_valve_is_open(&test_bed, 2));

            test_bed.unfail(FailureType::FwdCargoBleedDuctLeak);
            run_seconds(&mut test_bed, 10);
            assert!(flag(&mut test_bed, "PNEU_FWD_CARGO_DUCT_LEAK"));

            test_bed.write_by_name("OVHD_COND_HOT_AIR_1_PB_IS_ON", false);
            run_seconds(&mut test_bed, 2);
            assert!(!flag(&mut test_bed, "PNEU_FWD_CARGO_DUCT_LEAK"));
        }

        /// The leak procedures (PRO-ABN l.168662-168664): "If the ENG 1(4) BLEED pb-sw is set to ON,
        /// the FAULT light remains. If the ENG 1(4) BLEED pb-sw is off, the FAULT light goes off when
        /// the overheat due to the bleed leak disappears."
        #[test]
        fn a_wing_leak_holds_until_the_pb_is_off_and_the_duct_is_empty() {
            let mut test_bed = four_engines_at_idle();
            test_bed.fail(FailureType::WingBleedLeak(3));
            run_seconds(&mut test_bed, 10);
            assert!(flag(&mut test_bed, "PNEU_R_INR_WING_LEAK"));

            run_seconds(&mut test_bed, 30);
            assert!(flag(&mut test_bed, "PNEU_R_INR_WING_LEAK"));
            assert!(fault_light(&mut test_bed, 3));

            test_bed = test_bed.set_engine_bleed_push_button_off(3);
            run_seconds(&mut test_bed, 30);
            assert!(!flag(&mut test_bed, "PNEU_R_INR_WING_LEAK"));
            assert!(!fault_light(&mut test_bed, 3));
        }
    }
}
