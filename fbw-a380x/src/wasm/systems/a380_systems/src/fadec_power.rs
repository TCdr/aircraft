//! The electrical supply of the four A380 FADECs and of their EEC channels, and the other engine
//! loads of the aircraft network: igniters, HP fuel valve closure, engine monitoring unit (EMU).
//!
//! Each FADEC has one EEC with two fully redundant channels A and B. One channel controls the
//! engine, the other one takes over when it fails, and the channel in control changes at each
//! engine start. Design choice: channel A controls the engine at the first power-up. One failed
//! channel is ENG 1(2)(3)(4) MINOR FAULT, a crew awareness alert after flight: the crew sees no
//! other sign of the channels.
//!
//! The FADEC alternator, driven by the accessory gearbox, supplies the FADEC above 12.5 % N2; the
//! aircraft network supplies it below 10.5 % N2, or when the alternator is failed (between the two
//! speeds the supply does not change). The documented N2 is the FBW Trent N3. The network supplies
//! channel A from AC ESS and channel B from AC 3 (engines 1 and 3) or AC 2 (engines 2 and 4),
//! through the engine interface and power management unit (EIPM). There is one EIPM for two
//! engines: EIPM 1 for engines 2 and 4, EIPM 2 for engines 1 and 3, as named by their reset
//! buttons.
//!
//! The EIPM switches the network to the FADEC:
//! - on the ground for 15 min at aircraft power-up and for 10 min after the FADEC GND PWR pb: the
//!   SD instrument runs these timers whatever page it shows (SD FadecGroundPower.ts) and writes
//!   their result, `ENGINE_n_FADEC_GND_SUPPLY`;
//! - never with the ENG FIRE pb released.
//!
//! Design choices, the source gives no other condition: the network also supplies the FADEC in
//! flight (a relight needs it), for an engine start or a crank (ENG MASTER ON, ENG START selector
//! at IGN START or CRANK), and while any engine is not OFF (the ENG SD page rule this model
//! replaces).
//!
//! The other engine loads: igniter A on AC ESS, igniter B on AC 3 (engines 1 and 3) or AC 2
//! (engines 2 and 4); the HP fuel valves close with AC ESS; the EMU, which measures the rotor
//! vibrations, on AC 4 (engines 1 and 3) or AC 2 (engines 2 and 4).
//!
//! In this electrical model AC ESS (400XP) is `AlternatingCurrentEssentialShed`.

use systems::{
    engine::{engine_monitoring_fault::EngineMonitoringFaultKind, engine_start::Igniters},
    failures::{Failure, FailureType},
    pneumatic::EngineState,
    shared::{ElectricalBusType, ElectricalBuses},
    simulation::{
        InitContext, Read, Reader, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

const AC_ESS: ElectricalBusType = ElectricalBusType::AlternatingCurrentEssentialShed;

/// The EEC channel that controls the engine, written as `ENGINE_n_FADEC_CHANNEL_IN_CONTROL`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum EecChannel {
    /// No channel works: the FADEC is not powered or both channels are failed.
    #[default]
    None = 0,
    A = 1,
    B = 2,
}
impl EecChannel {
    fn other(self) -> Self {
        match self {
            EecChannel::A => EecChannel::B,
            EecChannel::B | EecChannel::None => EecChannel::A,
        }
    }
}

/// What the electrical supply gives the start sequence and the HP fuel valve of one engine
/// (engine_failure.rs).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EngineElectricalSupply {
    /// A channel of the FADEC is powered and works: the FADEC can start the engine.
    pub fadec_powered: bool,
    pub igniters: Igniters,
    pub hp_valve_closure_powered: bool,
}
#[cfg(test)]
impl Default for EngineElectricalSupply {
    fn default() -> Self {
        Self {
            fadec_powered: true,
            igniters: Igniters { a: true, b: true },
            hp_valve_closure_powered: true,
        }
    }
}

/// What the supply of one FADEC depends on, for one update.
#[derive(Clone, Copy, Debug)]
struct FadecSupplyInputs {
    /// N3, the documented N2
    core_speed_percent: f64,
    /// The EIPM switches the aircraft network to the FADEC.
    network_switched: bool,
    channel_a_bus_powered: bool,
    channel_b_bus_powered: bool,
    channel_a_failed: bool,
    channel_b_failed: bool,
    /// The engine is starting (FBW engine state Starting or Restarting).
    engine_starting: bool,
}

/// The supply of one FADEC and the channel in control.
#[derive(Debug, Default)]
struct FadecSupply {
    alternator_supplies: bool,
    engine_was_starting: bool,
    /// The channel that controlled the engine last, None before the first power-up.
    last_in_control: EecChannel,
    in_control: EecChannel,
}
impl FadecSupply {
    const ALTERNATOR_SUPPLY_ON_N2_PERCENT: f64 = 12.5;
    const ALTERNATOR_SUPPLY_OFF_N2_PERCENT: f64 = 10.5;

    fn update(&mut self, inputs: &FadecSupplyInputs) {
        if inputs.core_speed_percent > Self::ALTERNATOR_SUPPLY_ON_N2_PERCENT {
            self.alternator_supplies = true;
        } else if inputs.core_speed_percent < Self::ALTERNATOR_SUPPLY_OFF_N2_PERCENT {
            self.alternator_supplies = false;
        }

        let channel_works = |bus_powered: bool, failed: bool| {
            !failed && (self.alternator_supplies || (inputs.network_switched && bus_powered))
        };
        let channel_a_works = channel_works(inputs.channel_a_bus_powered, inputs.channel_a_failed);
        let channel_b_works = channel_works(inputs.channel_b_bus_powered, inputs.channel_b_failed);
        let works = |channel: EecChannel| match channel {
            EecChannel::A => channel_a_works,
            EecChannel::B => channel_b_works,
            EecChannel::None => false,
        };

        let start_begins = inputs.engine_starting && !self.engine_was_starting;
        self.engine_was_starting = inputs.engine_starting;
        let preferred = match self.last_in_control {
            EecChannel::None => EecChannel::A,
            last if start_begins => last.other(),
            last => last,
        };

        self.in_control = if works(preferred) {
            preferred
        } else if works(preferred.other()) {
            preferred.other()
        } else {
            EecChannel::None
        };
        if self.in_control != EecChannel::None {
            self.last_in_control = self.in_control;
        }
    }

    fn is_powered(&self) -> bool {
        self.in_control != EecChannel::None
    }
}

/// The FADEC of one engine: its supply, its channel failures and the variables they read.
struct A380FadecPower {
    channel_a_failure: Failure,
    channel_b_failure: Failure,
    /// ENG 1(2)(3)(4) MINOR FAULT of the flyPad (some internal engine sensors failed); the FADEC
    /// also reports one failed channel with it.
    minor_fault_failure: Failure,

    /// Channel B and igniter B
    channel_b_bus: ElectricalBusType,
    emu_bus: ElectricalBusType,
    ac_ess_powered: bool,
    channel_b_bus_powered: bool,
    emu_powered: bool,

    core_speed_id: VariableIdentifier,
    engine_state_id: VariableIdentifier,
    master_switch_id: VariableIdentifier,
    fire_push_button_id: VariableIdentifier,
    ground_supply_id: VariableIdentifier,

    fadec_powered_id: VariableIdentifier,
    self_powered_id: VariableIdentifier,
    channel_in_control_id: VariableIdentifier,
    igniters_supplied_id: VariableIdentifier,
    emu_supplied_id: VariableIdentifier,
    minor_fault_id: VariableIdentifier,

    core_speed_percent: f64,
    engine_state: EngineState,
    master_switch_is_on: bool,
    fire_push_button_is_released: bool,
    ground_supply_timer_runs: bool,

    supply: FadecSupply,
}
impl A380FadecPower {
    fn new(context: &mut InitContext, engine_number: usize) -> Self {
        let engines_1_and_3 = !engine_number.is_multiple_of(2);
        let mut id = |name: &str| context.get_identifier(format!("ENGINE_{engine_number}_{name}"));
        let ground_supply_id = id("FADEC_GND_SUPPLY");
        let self_powered_id = id("FADEC_SELF_POWERED");
        let channel_in_control_id = id("FADEC_CHANNEL_IN_CONTROL");
        let igniters_supplied_id = id("IGNITERS_SUPPLIED");
        let emu_supplied_id = id("EMU_SUPPLIED");
        let minor_fault_id = id(EngineMonitoringFaultKind::MinorFault.variable_name());
        Self {
            channel_a_failure: Failure::new(FailureType::FadecChannelA(engine_number)),
            channel_b_failure: Failure::new(FailureType::FadecChannelB(engine_number)),
            minor_fault_failure: Failure::new(FailureType::EngineMonitoringFault(
                engine_number,
                EngineMonitoringFaultKind::MinorFault,
            )),

            channel_b_bus: ElectricalBusType::AlternatingCurrent(if engines_1_and_3 {
                3
            } else {
                2
            }),
            emu_bus: ElectricalBusType::AlternatingCurrent(if engines_1_and_3 { 4 } else { 2 }),
            ac_ess_powered: false,
            channel_b_bus_powered: false,
            emu_powered: false,

            core_speed_id: context.get_identifier(format!("ENGINE_N3:{engine_number}")),
            engine_state_id: context.get_identifier(format!("ENGINE_STATE:{engine_number}")),
            master_switch_id: context
                .get_identifier(format!("FUELSYSTEM VALVE SWITCH:{engine_number}")),
            fire_push_button_id: context.get_identifier(format!("FIRE_BUTTON_ENG{engine_number}")),
            ground_supply_id,

            // The FADEC powered variable the FBW engine publisher reads
            fadec_powered_id: context.get_identifier(format!("FADEC_POWERED_ENG{engine_number}")),
            self_powered_id,
            channel_in_control_id,
            igniters_supplied_id,
            emu_supplied_id,
            minor_fault_id,

            core_speed_percent: 0.,
            engine_state: EngineState::Off,
            master_switch_is_on: false,
            fire_push_button_is_released: false,
            ground_supply_timer_runs: false,

            supply: FadecSupply::default(),
        }
    }

    fn engine_is_not_off(&self) -> bool {
        self.engine_state != EngineState::Off
    }

    fn update(&mut self, conditions: &NetworkSupplyConditions, eipm_failed: bool) {
        let start_or_crank = self.master_switch_is_on || conditions.start_selector_out_of_norm;
        let network_switched = !eipm_failed
            && !self.fire_push_button_is_released
            && (self.ground_supply_timer_runs
                || !conditions.on_ground
                || start_or_crank
                || conditions.any_engine_not_off);
        self.supply.update(&FadecSupplyInputs {
            core_speed_percent: self.core_speed_percent,
            network_switched,
            channel_a_bus_powered: self.ac_ess_powered,
            channel_b_bus_powered: self.channel_b_bus_powered,
            channel_a_failed: self.channel_a_failure.is_active(),
            channel_b_failed: self.channel_b_failure.is_active(),
            engine_starting: matches!(
                self.engine_state,
                EngineState::Starting | EngineState::Restarting
            ),
        });
    }

    fn igniter_supply(&self) -> Igniters {
        Igniters {
            a: self.ac_ess_powered,
            b: self.channel_b_bus_powered,
        }
    }

    fn one_channel_failed(&self) -> bool {
        self.channel_a_failure.is_active() != self.channel_b_failure.is_active()
    }
}
impl SimulationElement for A380FadecPower {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.channel_a_failure.accept(visitor);
        self.channel_b_failure.accept(visitor);
        self.minor_fault_failure.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.core_speed_percent = reader.read(&self.core_speed_id);
        self.engine_state = reader.read_discrete_or_fallback(
            &self.engine_state_id,
            "EngineState",
            EngineState::Off,
        );
        self.master_switch_is_on = reader.read(&self.master_switch_id);
        self.fire_push_button_is_released = reader.read(&self.fire_push_button_id);
        self.ground_supply_timer_runs = reader.read(&self.ground_supply_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        let igniters = self.igniter_supply();
        writer.write(&self.fadec_powered_id, self.supply.is_powered());
        writer.write(&self.self_powered_id, self.supply.alternator_supplies);
        writer.write(
            &self.channel_in_control_id,
            self.supply.in_control as u8 as f64,
        );
        writer.write(
            &self.igniters_supplied_id,
            (igniters.a as u8 | (igniters.b as u8) << 1) as f64,
        );
        writer.write(&self.emu_supplied_id, self.emu_powered);
        writer.write(
            &self.minor_fault_id,
            self.minor_fault_failure.is_active() || self.one_channel_failed(),
        );
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.ac_ess_powered = buses.is_powered(AC_ESS);
        self.channel_b_bus_powered = buses.is_powered(self.channel_b_bus);
        self.emu_powered = buses.is_powered(self.emu_bus);
    }
}

/// The aircraft conditions of the EIPM network supply, shared by the four FADECs.
struct NetworkSupplyConditions {
    on_ground: bool,
    /// The ENG START selector (one for the four engines) is at CRANK or IGN START.
    start_selector_out_of_norm: bool,
    /// An engine is running, starting or shutting down.
    any_engine_not_off: bool,
}

/// The four FADECs and the two EIPMs.
pub struct A380FadecPowerSupplies {
    fadecs: [A380FadecPower; 4],
    /// EIPM 1 (engines 2 and 4) and EIPM 2 (engines 1 and 3)
    eipm_failures: [Failure; 2],
    engine_start_selector_id: VariableIdentifier,
    /// 0 CRANK, 1 NORM, 2 IGN START
    engine_start_selector: f64,
    hp_valve_closure_powered: bool,
}
impl A380FadecPowerSupplies {
    const ENGINE_START_SELECTOR_NORM: f64 = 1.;

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            fadecs: [1, 2, 3, 4].map(|number| A380FadecPower::new(context, number)),
            eipm_failures: [1, 2]
                .map(|number| Failure::new(FailureType::EngineInterfacePowerManagement(number))),
            engine_start_selector_id: context.get_identifier("XMLVAR_ENG_MODE_SEL".to_owned()),
            engine_start_selector: Self::ENGINE_START_SELECTOR_NORM,
            hp_valve_closure_powered: false,
        }
    }

    /// The index in `eipm_failures` of the EIPM of an engine (1 to 4).
    fn eipm_index(engine_number: usize) -> usize {
        if engine_number.is_multiple_of(2) {
            0
        } else {
            1
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        let conditions = NetworkSupplyConditions {
            on_ground: context.is_on_ground(),
            start_selector_out_of_norm: (self.engine_start_selector
                - Self::ENGINE_START_SELECTOR_NORM)
                .abs()
                > 0.5,
            any_engine_not_off: self.fadecs.iter().any(|fadec| fadec.engine_is_not_off()),
        };
        for (index, fadec) in self.fadecs.iter_mut().enumerate() {
            let eipm_failed = self.eipm_failures[Self::eipm_index(index + 1)].is_active();
            fadec.update(&conditions, eipm_failed);
        }
    }

    /// The supply of the four engines, engine 1 first.
    pub fn engine_supplies(&self) -> [EngineElectricalSupply; 4] {
        self.fadecs.each_ref().map(|fadec| EngineElectricalSupply {
            fadec_powered: fadec.supply.is_powered(),
            igniters: fadec.igniter_supply(),
            hp_valve_closure_powered: self.hp_valve_closure_powered,
        })
    }

    /// The EIPM of the engine (1 to 4) is failed: it supplies neither the FADEC nor the thrust
    /// reverser power unit.
    pub fn eipm_failed(&self, engine_number: usize) -> bool {
        self.eipm_failures[Self::eipm_index(engine_number)].is_active()
    }
}
impl SimulationElement for A380FadecPowerSupplies {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for fadec in &mut self.fadecs {
            fadec.accept(visitor);
        }
        for failure in &mut self.eipm_failures {
            failure.accept(visitor);
        }

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.engine_start_selector = reader.read(&self.engine_start_selector_id);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.hp_valve_closure_powered = buses.is_powered(AC_ESS);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use systems::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        shared::PotentialOrigin,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft,
        },
    };
    use uom::si::{electric_potential::volt, f64::ElectricPotential};

    fn powered_inputs() -> FadecSupplyInputs {
        FadecSupplyInputs {
            core_speed_percent: 0.,
            network_switched: true,
            channel_a_bus_powered: true,
            channel_b_bus_powered: true,
            channel_a_failed: false,
            channel_b_failed: false,
            engine_starting: false,
        }
    }

    fn supply_after(steps: &[FadecSupplyInputs]) -> FadecSupply {
        let mut supply = FadecSupply::default();
        for inputs in steps {
            supply.update(inputs);
        }
        supply
    }

    #[test]
    fn channel_a_controls_the_engine_at_the_first_power_up() {
        let supply = supply_after(&[powered_inputs()]);
        assert_eq!(supply.in_control, EecChannel::A);
    }

    #[test]
    fn the_channel_in_control_changes_at_each_engine_start() {
        let idle = powered_inputs();
        let starting = FadecSupplyInputs {
            engine_starting: true,
            ..idle
        };
        let mut supply = supply_after(&[idle, starting]);
        assert_eq!(supply.in_control, EecChannel::B);
        // the whole start and the running engine keep the channel
        supply.update(&starting);
        supply.update(&idle);
        assert_eq!(supply.in_control, EecChannel::B);

        supply.update(&starting);
        assert_eq!(supply.in_control, EecChannel::A);
    }

    #[test]
    fn the_standby_channel_takes_over_when_the_channel_in_control_fails_and_keeps_control() {
        let healthy = powered_inputs();
        let a_failed = FadecSupplyInputs {
            channel_a_failed: true,
            ..healthy
        };
        let mut supply = supply_after(&[healthy, a_failed]);
        assert_eq!(supply.in_control, EecChannel::B);
        assert!(supply.is_powered());

        supply.update(&healthy);
        assert_eq!(supply.in_control, EecChannel::B);
    }

    #[test]
    fn an_engine_start_keeps_the_only_working_channel() {
        let a_failed = FadecSupplyInputs {
            channel_a_failed: true,
            ..powered_inputs()
        };
        let starting = FadecSupplyInputs {
            engine_starting: true,
            ..a_failed
        };
        let supply = supply_after(&[a_failed, a_failed, starting]);
        assert_eq!(supply.in_control, EecChannel::B);
    }

    #[test]
    fn no_channel_controls_the_engine_with_both_channels_failed() {
        let supply = supply_after(&[FadecSupplyInputs {
            channel_a_failed: true,
            channel_b_failed: true,
            ..powered_inputs()
        }]);
        assert_eq!(supply.in_control, EecChannel::None);
        assert!(!supply.is_powered());
    }

    #[test]
    fn the_alternator_supplies_the_fadec_above_12_5_and_the_network_below_10_5_percent_n2() {
        let without_network = FadecSupplyInputs {
            network_switched: false,
            ..powered_inputs()
        };
        let at = |percent: f64| FadecSupplyInputs {
            core_speed_percent: percent,
            ..without_network
        };

        let mut supply = supply_after(&[at(12.)]);
        assert!(!supply.alternator_supplies);
        assert!(!supply.is_powered());

        supply.update(&at(12.6));
        assert!(supply.alternator_supplies);
        assert!(supply.is_powered());

        // between the two speeds the alternator keeps the supply
        supply.update(&at(11.));
        assert!(supply.is_powered());

        supply.update(&at(10.4));
        assert!(!supply.alternator_supplies);
        assert!(!supply.is_powered());
    }

    #[test]
    fn the_network_supplies_each_channel_from_its_own_bus() {
        let only_channel_b_bus = FadecSupplyInputs {
            channel_a_bus_powered: false,
            ..powered_inputs()
        };
        let supply = supply_after(&[only_channel_b_bus]);
        assert_eq!(supply.in_control, EecChannel::B);

        let no_bus = FadecSupplyInputs {
            channel_b_bus_powered: false,
            ..only_channel_b_bus
        };
        assert!(!supply_after(&[no_bus]).is_powered());
    }

    #[test]
    fn a_self_powered_fadec_does_not_need_the_network() {
        let supply = supply_after(&[FadecSupplyInputs {
            core_speed_percent: 60.,
            network_switched: false,
            channel_a_bus_powered: false,
            channel_b_bus_powered: false,
            ..powered_inputs()
        }]);
        assert!(supply.is_powered());
    }

    /// The four FADECs with AC ESS, AC 2, AC 3 and AC 4 each powered or not.
    struct TestAircraft {
        fadecs: A380FadecPowerSupplies,
        source: TestElectricitySource,
        buses: [ElectricalBus; 4],
        powered: [bool; 4],
    }
    impl TestAircraft {
        const AC_ESS_INDEX: usize = 0;
        const AC_2_INDEX: usize = 1;
        const AC_4_INDEX: usize = 3;

        fn new(context: &mut InitContext) -> Self {
            Self {
                fadecs: A380FadecPowerSupplies::new(context),
                source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),
                buses: [
                    ElectricalBus::new(context, AC_ESS),
                    ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(2)),
                    ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(3)),
                    ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(4)),
                ],
                powered: [true; 4],
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            self.source
                .power_with_potential(ElectricPotential::new::<volt>(115.));
            electricity.supplied_by(&self.source);
            for (bus, powered) in self.buses.iter().zip(self.powered) {
                if powered {
                    electricity.flow(&self.source, bus);
                }
            }
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.fadecs.update(context);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.fadecs.accept(visitor);
            for bus in &mut self.buses {
                bus.accept(visitor);
            }
            visitor.visit(self);
        }
    }

    struct FadecPowerTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl FadecPowerTestBed {
        /// On the ground, engines off, ENG START selector NORM, all buses powered, no FADEC
        /// supply timer running.
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            test_bed.set_on_ground(true);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 1.);
            test_bed
        }

        fn run(mut self) -> Self {
            self.run_with_delta(Duration::from_millis(100));
            self
        }

        fn write(mut self, name: &str, value: f64) -> Self {
            self.write_by_name(name, value);
            self
        }

        fn unpowered(mut self, bus_index: usize) -> Self {
            self.command(|a| a.powered[bus_index] = false);
            self
        }

        fn failed(mut self, failure: FailureType) -> Self {
            self.fail(failure);
            self
        }

        fn fadec_powered(&mut self, engine: usize) -> bool {
            self.read_by_name(&format!("FADEC_POWERED_ENG{engine}"))
        }

        fn number(&mut self, name: &str) -> f64 {
            self.read_by_name(name)
        }

        fn flag(&mut self, name: &str) -> bool {
            self.read_by_name(name)
        }
    }
    impl TestBed for FadecPowerTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    #[test]
    fn on_the_ground_the_fadec_is_not_supplied_without_timer_start_or_running_engine() {
        let mut test_bed = FadecPowerTestBed::new().run();
        for engine in 1..=4 {
            assert!(!test_bed.fadec_powered(engine));
            assert_eq!(
                test_bed.number(&format!("ENGINE_{engine}_FADEC_CHANNEL_IN_CONTROL")),
                0.
            );
        }
    }

    #[test]
    fn the_sd_timer_the_master_on_or_the_start_selector_switches_the_network_to_the_fadec() {
        let mut test_bed = FadecPowerTestBed::new()
            .write("ENGINE_1_FADEC_GND_SUPPLY", 1.)
            .write("FUELSYSTEM VALVE SWITCH:2", 1.)
            .run();
        assert!(test_bed.fadec_powered(1));
        assert!(test_bed.fadec_powered(2));
        assert!(!test_bed.fadec_powered(3));
        assert_eq!(test_bed.number("ENGINE_1_FADEC_CHANNEL_IN_CONTROL"), 1.);

        let mut test_bed = FadecPowerTestBed::new()
            .write("XMLVAR_ENG_MODE_SEL", 2.)
            .run();
        assert!((1..=4).all(|engine| test_bed.fadec_powered(engine)));
    }

    #[test]
    fn on_the_ground_an_engine_not_off_keeps_the_network_supply_of_all_fadecs() {
        let mut test_bed = FadecPowerTestBed::new()
            .write("ENGINE_STATE:1", 1.)
            .write("ENGINE_N3:1", 60.)
            .run();
        assert!((1..=4).all(|engine| test_bed.fadec_powered(engine)));
    }

    #[test]
    fn the_fire_pb_cuts_the_network_supply_but_not_the_alternator() {
        let mut test_bed = FadecPowerTestBed::new()
            .write("XMLVAR_ENG_MODE_SEL", 2.)
            .write("FIRE_BUTTON_ENG1", 1.)
            .write("FIRE_BUTTON_ENG2", 1.)
            .write("ENGINE_N3:2", 60.)
            .run();
        assert!(!test_bed.fadec_powered(1));
        assert!(test_bed.fadec_powered(2));
        assert!(test_bed.flag("ENGINE_2_FADEC_SELF_POWERED"));
    }

    #[test]
    fn a_failed_eipm_no_longer_supplies_its_two_fadecs() {
        let mut test_bed = FadecPowerTestBed::new()
            .write("XMLVAR_ENG_MODE_SEL", 2.)
            .failed(FailureType::EngineInterfacePowerManagement(1))
            .run();
        assert!(test_bed.fadec_powered(1));
        assert!(!test_bed.fadec_powered(2));
        assert!(test_bed.fadec_powered(3));
        assert!(!test_bed.fadec_powered(4));
        assert!(test_bed.query(|a| a.fadecs.eipm_failed(2) && !a.fadecs.eipm_failed(3)));
    }

    #[test]
    fn channel_b_of_engines_1_and_3_is_on_ac_3_and_of_engines_2_and_4_on_ac_2() {
        let mut test_bed = FadecPowerTestBed::new()
            .write("XMLVAR_ENG_MODE_SEL", 2.)
            .unpowered(TestAircraft::AC_ESS_INDEX)
            .unpowered(TestAircraft::AC_2_INDEX)
            .run();
        assert!(test_bed.fadec_powered(1));
        assert!(!test_bed.fadec_powered(2));
        assert!(test_bed.fadec_powered(3));
        assert!(!test_bed.fadec_powered(4));
        assert_eq!(test_bed.number("ENGINE_1_FADEC_CHANNEL_IN_CONTROL"), 2.);
        // igniter A on AC ESS, igniter B with channel B
        assert_eq!(test_bed.number("ENGINE_1_IGNITERS_SUPPLIED"), 2.);
        assert_eq!(test_bed.number("ENGINE_2_IGNITERS_SUPPLIED"), 0.);
        assert!(!test_bed.query(|a| a.fadecs.engine_supplies()[0].hp_valve_closure_powered));
    }

    #[test]
    fn the_emu_of_engines_1_and_3_is_on_ac_4_and_of_engines_2_and_4_on_ac_2() {
        let mut test_bed = FadecPowerTestBed::new()
            .unpowered(TestAircraft::AC_4_INDEX)
            .run();
        assert!(!test_bed.flag("ENGINE_1_EMU_SUPPLIED"));
        assert!(test_bed.flag("ENGINE_2_EMU_SUPPLIED"));
        assert!(!test_bed.flag("ENGINE_3_EMU_SUPPLIED"));
        assert!(test_bed.flag("ENGINE_4_EMU_SUPPLIED"));
    }

    #[test]
    fn one_failed_channel_is_a_minor_fault_both_failed_channels_unpower_the_fadec() {
        let mut test_bed = FadecPowerTestBed::new()
            .write("XMLVAR_ENG_MODE_SEL", 2.)
            .failed(FailureType::FadecChannelA(3))
            .run();
        assert!(test_bed.flag("ENGINE_3_MINOR_FAULT"));
        assert!(!test_bed.flag("ENGINE_1_MINOR_FAULT"));
        assert_eq!(test_bed.number("ENGINE_3_FADEC_CHANNEL_IN_CONTROL"), 2.);

        let mut test_bed = test_bed.failed(FailureType::FadecChannelB(3)).run();
        assert!(!test_bed.fadec_powered(3));
        assert!(!test_bed.flag("ENGINE_3_MINOR_FAULT"));
    }

    #[test]
    fn the_minor_fault_failure_still_raises_the_alert() {
        let mut test_bed = FadecPowerTestBed::new()
            .failed(FailureType::EngineMonitoringFault(
                2,
                EngineMonitoringFaultKind::MinorFault,
            ))
            .run();
        assert!(test_bed.flag("ENGINE_2_MINOR_FAULT"));
    }

    #[test]
    fn in_flight_the_network_supplies_the_fadecs() {
        let mut test_bed = FadecPowerTestBed::new();
        test_bed.set_on_ground(false);
        let mut test_bed = test_bed.run();
        assert!((1..=4).all(|engine| test_bed.fadec_powered(engine)));
    }
}
