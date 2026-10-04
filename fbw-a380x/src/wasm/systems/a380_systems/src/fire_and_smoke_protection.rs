use std::time::Duration;

use systems::{
    accept_iterable,
    fire_protection::{
        FireDetectionUnit, FireDetectionZoneConfig, FireLoopPowerLoss, SetOnFireModule,
    },
    overhead::{FirePushButton, MomentaryPushButton},
    shared::{
        arinc429::{Arinc429Word, SignStatus},
        DelayedFalseLogicGate, DelayedTrueLogicGate, ElectricalBusType, ElectricalBuses,
        EngineFirePushButtons, FireDetectionLoopID, FireDetectionZone, LgciuWeightOnWheels,
    },
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

// The tests below set failures by their type
#[cfg(test)]
use systems::failures::FailureType;

/// The A380 fire zones: ENG 1 to 4, APU, MLG bay
const A380_FIRE_ZONES: [FireDetectionZone; 6] = [
    FireDetectionZone::Engine(1),
    FireDetectionZone::Engine(2),
    FireDetectionZone::Engine(3),
    FireDetectionZone::Engine(4),
    FireDetectionZone::Apu,
    FireDetectionZone::Mlg,
];

pub(super) struct A380FireAndSmokeProtection {
    a380_fire_protection_system: FireProtectionSystem,
    // a380_smoke_detection_function
    set_zone_on_fire: SetOnFireModule<6, 9>,
}

impl A380FireAndSmokeProtection {
    pub(super) fn new(context: &mut InitContext) -> Self {
        Self {
            a380_fire_protection_system: FireProtectionSystem::new(context),

            // The 9 bottles of the FireExtinguishingSystem: two for each engine and one for the APU (zone 4). The MLG
            // bay (zone 5) does not have a fire extinguishing system.
            set_zone_on_fire: SetOnFireModule::new(
                context,
                A380_FIRE_ZONES,
                [0, 0, 1, 1, 2, 2, 3, 3, 4],
            ),
        }
    }

    pub(super) fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        lgciu: [&impl LgciuWeightOnWheels; 2],
    ) {
        self.a380_fire_protection_system
            .update(context, engine_fire_push_buttons, lgciu);

        self.set_zone_on_fire
            .update(self.a380_fire_protection_system.bottle_discharge());
    }

    pub fn apu_fire_on_ground(&self) -> bool {
        self.a380_fire_protection_system.apu_fire_on_ground()
    }
}

impl SimulationElement for A380FireAndSmokeProtection {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.a380_fire_protection_system.accept(visitor);
        self.set_zone_on_fire.accept(visitor);

        visitor.visit(self);
    }
}

struct FireProtectionSystem {
    fire_detection_unit: FireDetectionUnit<6>,
    fire_extinguishing_system: FireExtinguishingSystem,

    // The FDU sends discrete signals to the overhead panel and arinc signals to the FWS
    // Fixme: We assume a discrete word is sent, validate with references
    discrete_word_id: VariableIdentifier,
    discrete_word: Arinc429Word<u32>,

    fire_test_pushbutton_id: VariableIdentifier,
    fire_test_pushbutton_is_pressed: bool,
    fire_test_pushbutton_signal: DelayedTrueLogicGate,

    // flyPad Realism setting (not aircraft behaviour): the test goes on for a few seconds after the pb is released, so
    // that the crew can check the warnings and lights without holding the pb
    fire_test_extend_id: VariableIdentifier,
    fire_test_extend: bool,
    fire_test_extension: DelayedFalseLogicGate,
    // The test pb, extended when the setting is on: for the FWS
    fire_test_active_id: VariableIdentifier,
    fire_test_active: bool,
}

impl FireProtectionSystem {
    const DELAY_FIRE_TEST_MILLIS: Duration = Duration::from_millis(500);
    const FIRE_TEST_EXTENSION: Duration = Duration::from_secs(7);
    const DELAY_APU_FIRE_EXTINGUISHING: Duration = Duration::from_secs(10);

    fn new(context: &mut InitContext) -> Self {
        // Loop A is supplied by the DC ESS bus and loop B by the DC 2 bus, in every zone
        let zones = A380_FIRE_ZONES.map(|zone| FireDetectionZoneConfig {
            zone,
            loop_a_powered_by: ElectricalBusType::DirectCurrentEssential,
            loop_b_powered_by: ElectricalBusType::DirectCurrent(2),
            additional_fire_source: None,
        });

        Self {
            fire_detection_unit: FireDetectionUnit::new(
                context,
                zones,
                FireLoopPowerLoss::TransientBreak,
                Self::DELAY_APU_FIRE_EXTINGUISHING,
            ),
            fire_extinguishing_system: FireExtinguishingSystem::new(context),

            discrete_word_id: context.get_identifier("FIRE_FDU_DISCRETE_WORD".to_owned()),
            discrete_word: Arinc429Word::new(0, SignStatus::NoComputedData),

            fire_test_pushbutton_id: context
                .get_identifier("OVHD_FIRE_TEST_PB_IS_PRESSED".to_owned()),
            fire_test_pushbutton_is_pressed: false,
            fire_test_pushbutton_signal: DelayedTrueLogicGate::new(Self::DELAY_FIRE_TEST_MILLIS),

            fire_test_extend_id: context.get_identifier("FIRE_TEST_EXTEND".to_owned()),
            fire_test_extend: false,
            fire_test_extension: DelayedFalseLogicGate::new(Self::FIRE_TEST_EXTENSION),
            fire_test_active_id: context.get_identifier("FIRE_TEST_ACTIVE".to_owned()),
            fire_test_active: false,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        lgciu: [&impl LgciuWeightOnWheels; 2],
    ) {
        self.fire_test_extension
            .update(context, self.fire_test_pushbutton_is_pressed);
        self.fire_test_active = if self.fire_test_extend {
            self.fire_test_extension.output()
        } else {
            self.fire_test_pushbutton_is_pressed
        };

        // We add a delay between button press and response based on references
        self.fire_test_pushbutton_signal
            .update(context, self.fire_test_active);
        self.fire_detection_unit
            .update(context, self.fire_test_pushbutton_signal.output(), lgciu);
        self.update_discrete_word();
        self.fire_extinguishing_system.update(
            context,
            engine_fire_push_buttons,
            self.fire_test_pushbutton_signal.output(),
            self.fire_detection_unit.should_extinguish_apu_fire(),
        )
    }

    fn update_discrete_word(&mut self) {
        // TODO: Add electrical supply for FDU, when not powered it should return NCD
        self.discrete_word = Arinc429Word::new(0, SignStatus::NormalOperation);

        // Fixme: The bit order is assumed as no references
        // Bits 11 to 16: FIRE ENG 1, ENG 2, ENG 3, ENG 4, APU, MLG
        for (bit, &zone) in (11..).zip(&A380_FIRE_ZONES) {
            self.discrete_word
                .set_bit(bit, self.fire_detection_unit.fire_detected(zone));
        }
        // Bits 18 to 29: ENG 1 LOOP A has failed, ENG 1 LOOP B has failed, ENG 2 LOOP A, ..., MLG LOOP B
        for (loop_a_bit, &zone) in (18..).step_by(2).zip(&A380_FIRE_ZONES) {
            self.discrete_word.set_bit(
                loop_a_bit,
                self.fire_detection_unit
                    .loop_has_failed(FireDetectionLoopID::A, zone),
            );
            self.discrete_word.set_bit(
                loop_a_bit + 1,
                self.fire_detection_unit
                    .loop_has_failed(FireDetectionLoopID::B, zone),
            );
        }
    }

    fn apu_fire_on_ground(&self) -> bool {
        self.fire_detection_unit.apu_fire_on_ground()
    }

    fn bottle_discharge(&self) -> [bool; 9] {
        self.fire_extinguishing_system.bottle_discharge()
    }
}

impl SimulationElement for FireProtectionSystem {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.fire_test_pushbutton_is_pressed = reader.read(&self.fire_test_pushbutton_id);
        self.fire_test_extend = reader.read(&self.fire_test_extend_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.fire_test_active_id, self.fire_test_active);
        writer.write(&self.discrete_word_id, self.discrete_word);
    }

    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.fire_detection_unit.accept(visitor);
        self.fire_extinguishing_system.accept(visitor);

        visitor.visit(self);
    }
}

struct FireExtinguishingSystem {
    fire_extinguishing_bottles: [ExtinguishingAgentBottle; 9],

    apu_fire_push_button: FirePushButton,
}

impl FireExtinguishingSystem {
    fn new(context: &mut InitContext) -> Self {
        let powered_by = [
            ElectricalBusType::DirectCurrentHot(1),
            ElectricalBusType::DirectCurrentEssential,
        ];
        Self {
            fire_extinguishing_bottles: [
                ExtinguishingAgentBottle::new(context, "1_ENG_1", powered_by),
                ExtinguishingAgentBottle::new(context, "2_ENG_1", powered_by),
                ExtinguishingAgentBottle::new(context, "1_ENG_2", powered_by),
                ExtinguishingAgentBottle::new(context, "2_ENG_2", powered_by),
                ExtinguishingAgentBottle::new(context, "1_ENG_3", powered_by),
                ExtinguishingAgentBottle::new(context, "2_ENG_3", powered_by),
                ExtinguishingAgentBottle::new(context, "1_ENG_4", powered_by),
                ExtinguishingAgentBottle::new(context, "2_ENG_4", powered_by),
                ExtinguishingAgentBottle::new(context, "1_APU_1", powered_by),
            ],

            apu_fire_push_button: FirePushButton::new(context, "APU"),
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        fire_test_pushbutton_is_pressed: bool,
        should_extinguish_apu_fire: bool,
    ) {
        self.fire_extinguishing_bottles[..2]
            .iter_mut()
            .for_each(|bottle| {
                bottle.update(
                    context,
                    engine_fire_push_buttons.is_released(1),
                    fire_test_pushbutton_is_pressed,
                    None,
                )
            });
        self.fire_extinguishing_bottles[2..4]
            .iter_mut()
            .for_each(|bottle| {
                bottle.update(
                    context,
                    engine_fire_push_buttons.is_released(2),
                    fire_test_pushbutton_is_pressed,
                    None,
                )
            });
        self.fire_extinguishing_bottles[4..6]
            .iter_mut()
            .for_each(|bottle| {
                bottle.update(
                    context,
                    engine_fire_push_buttons.is_released(3),
                    fire_test_pushbutton_is_pressed,
                    None,
                )
            });
        self.fire_extinguishing_bottles[6..8]
            .iter_mut()
            .for_each(|bottle| {
                bottle.update(
                    context,
                    engine_fire_push_buttons.is_released(4),
                    fire_test_pushbutton_is_pressed,
                    None,
                )
            });
        self.fire_extinguishing_bottles[8].update(
            context,
            self.apu_fire_push_button.is_released(),
            fire_test_pushbutton_is_pressed,
            Some(should_extinguish_apu_fire),
        );
    }

    /// The array of 9 bottles represents two bottles for ENG1-4 and one for the APU
    fn bottle_discharge(&self) -> [bool; 9] {
        self.fire_extinguishing_bottles
            .iter()
            .map(|bottle| bottle.bottle_discharge())
            .collect::<Vec<bool>>()
            .try_into()
            .unwrap_or_else(|v: Vec<bool>| {
                panic!("Expected a Vec of length {} but it was {}", 9, v.len())
            })
    }
}

impl SimulationElement for FireExtinguishingSystem {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.apu_fire_push_button.accept(visitor);
        accept_iterable!(self.fire_extinguishing_bottles, visitor);

        visitor.visit(self);
    }
}

/// This struct represents the physical bottle of Halon 1301, and its possible states of armed, disarmed, full and empty
/// There are two squibs per bottle, but for simplicity we simulate a "single" squib with two possible power sources
struct ExtinguishingAgentBottle {
    squib_armed_id: VariableIdentifier,
    bottle_discharged_id: VariableIdentifier,
    agent_pb: MomentaryPushButton,

    squib_is_armed: bool,
    bottle_is_discharged: bool,
    system_test: bool,

    timer: Duration,
    powered_by: [ElectricalBusType; 2],
    is_powered: bool,
}

impl ExtinguishingAgentBottle {
    fn new(context: &mut InitContext, id: &str, powered_by: [ElectricalBusType; 2]) -> Self {
        Self {
            squib_armed_id: context.get_identifier(format!("FIRE_SQUIB_{}_IS_ARMED", id)),
            bottle_discharged_id: context
                .get_identifier(format!("FIRE_SQUIB_{}_IS_DISCHARGED", id)),
            agent_pb: MomentaryPushButton::new(context, &format!("FIRE_AGENT_{}", id)),

            squib_is_armed: false,
            bottle_is_discharged: false,
            system_test: false,

            timer: Duration::ZERO,
            powered_by,
            is_powered: false,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_button_is_pressed: bool,
        fire_test_pushbutton_is_pressed: bool,
        should_extinguish_fire: Option<bool>,
    ) {
        self.system_test = fire_test_pushbutton_is_pressed && self.is_powered;
        self.squib_is_armed = self.is_powered && engine_fire_push_button_is_pressed;
        if self.is_powered
            && ((self.squib_is_armed || should_extinguish_fire.unwrap_or(false))
                && self.timer >= Duration::from_secs(1))
        {
            // Once the bottle is discharged, it can't be recharged
            self.bottle_is_discharged = true
        } else if self.is_powered
            && (((self.squib_is_armed)
                && (self.agent_pb.is_pressed() || self.timer > Duration::ZERO))
                || should_extinguish_fire.unwrap_or(false))
            && self.timer <= Duration::from_secs(1)
        {
            self.timer += context.delta()
        } else {
            self.timer = Duration::ZERO
        };
    }

    fn bottle_discharge(&self) -> bool {
        self.bottle_is_discharged
    }
}

impl SimulationElement for ExtinguishingAgentBottle {
    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.squib_armed_id,
            self.squib_is_armed || self.system_test,
        );
        writer.write(
            &self.bottle_discharged_id,
            self.bottle_is_discharged || self.system_test,
        );
    }

    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.agent_pb.accept(visitor);

        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = self.powered_by.iter().any(|&p| buses.is_powered(p));
    }
}

#[cfg(test)]
mod a380_fire_and_smoke_protection_tests {
    use systems::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        engine::EngineFireOverheadPanel,
        shared::PotentialOrigin,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft, SimulationElement, SimulationElementVisitor, UpdateContext,
        },
    };

    use super::*;

    struct TestLgciu {
        compressed: bool,
    }
    impl TestLgciu {
        fn new(compressed: bool) -> Self {
            Self { compressed }
        }

        fn set_on_ground(&mut self, on_ground: bool) {
            self.compressed = on_ground;
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

    struct TestAircraft {
        a380_fire_and_smoke_protection: A380FireAndSmokeProtection,
        engine_fire_overhead_panel: EngineFireOverheadPanel<4>,
        lgciu1: TestLgciu,
        lgciu2: TestLgciu,

        powered_dc_source_ess: TestElectricitySource,
        powered_dc_source_2: TestElectricitySource,
        powered_dc_hot: TestElectricitySource,
        dc_ess_bus: ElectricalBus,
        dc_2_bus: ElectricalBus,
        dc_hot_bus: ElectricalBus,
    }

    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                a380_fire_and_smoke_protection: A380FireAndSmokeProtection::new(context),
                engine_fire_overhead_panel: EngineFireOverheadPanel::new(context),
                lgciu1: TestLgciu::new(false),
                lgciu2: TestLgciu::new(false),

                powered_dc_source_ess: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EmergencyGenerator,
                ),
                powered_dc_source_2: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::Battery(2),
                ),
                powered_dc_hot: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::Battery(1),
                ),
                dc_ess_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentEssential),
                dc_2_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(2)),
                dc_hot_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentHot(1)),
            }
        }

        fn set_on_ground(&mut self, on_ground: bool) {
            self.lgciu1.set_on_ground(on_ground);
            self.lgciu2.set_on_ground(on_ground);
        }

        fn power_dc_ess_bus(&mut self) {
            self.powered_dc_source_ess.power();
        }

        fn unpower_dc_ess_bus(&mut self) {
            self.powered_dc_source_ess.unpower();
        }

        fn power_dc_2_bus(&mut self) {
            self.powered_dc_source_2.power();
        }

        fn unpower_dc_2_bus(&mut self) {
            self.powered_dc_source_2.unpower();
        }

        fn unpower_dc_hot_bus(&mut self) {
            self.powered_dc_hot.unpower();
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _context: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            electricity.supplied_by(&self.powered_dc_source_2);
            electricity.supplied_by(&self.powered_dc_source_ess);
            electricity.supplied_by(&self.powered_dc_hot);
            electricity.flow(&self.powered_dc_source_2, &self.dc_2_bus);
            electricity.flow(&self.powered_dc_source_ess, &self.dc_ess_bus);
            electricity.flow(&self.powered_dc_hot, &self.dc_hot_bus);
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.a380_fire_and_smoke_protection.update(
                context,
                &self.engine_fire_overhead_panel,
                [&self.lgciu1, &self.lgciu2],
            )
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<V: SimulationElementVisitor>(&mut self, visitor: &mut V) {
            self.a380_fire_and_smoke_protection.accept(visitor);
            self.engine_fire_overhead_panel.accept(visitor);

            visitor.visit(self);
        }
    }

    struct FireProtectionTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl FireProtectionTestBed {
        fn new() -> Self {
            Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            }
        }

        fn with(self) -> Self {
            self
        }

        fn and(self) -> Self {
            self
        }

        fn then(self) -> Self {
            self
        }

        fn and_run(mut self) -> Self {
            self.run();
            self
        }

        fn and_double_run(mut self) -> Self {
            self.run();
            self.run();
            self
        }

        fn run_with_delta_of(mut self, delta: Duration) -> Self {
            self.run_with_delta(delta);
            self
        }

        fn run_with_no_delta(mut self) -> Self {
            self.run_with_delta(Duration::ZERO);
            self
        }

        fn set_on_ground(mut self, on_ground: bool) -> Self {
            self.command(|a| a.set_on_ground(on_ground));
            self
        }

        fn set_engine_on_fire(mut self, engine_number: usize) -> Self {
            self.write_by_name(&format!("ENG ON FIRE:{}", engine_number), true);
            self
        }

        fn set_engine_on_fire_through_failure(mut self, engine_number: usize) -> Self {
            self.fail(FailureType::SetOnFire(FireDetectionZone::Engine(
                engine_number,
            )));
            // Because tests don't write to the Aircraft Vars we write this manually here
            self.write_by_name(&format!("ENG ON FIRE:{}", engine_number), true);
            self
        }

        fn resolve_engine_on_fire_through_failure(mut self, engine_number: usize) -> Self {
            self.unfail(FailureType::SetOnFire(FireDetectionZone::Engine(
                engine_number,
            )));
            // Because tests don't write to the Aircraft Vars we write this manually here
            self.write_by_name(&format!("ENG ON FIRE:{}", engine_number), false);
            self
        }

        fn set_engine_fire_extinguished(mut self, engine_number: usize) -> Self {
            self.write_by_name(&format!("ENG ON FIRE:{}", engine_number), false);
            self
        }

        fn set_engine_fire_pb_released(mut self, engine_number: usize, released: bool) -> Self {
            self.write_by_name(&format!("FIRE_BUTTON_ENG{}", engine_number), released);
            self
        }

        fn set_apu_on_fire(mut self) -> Self {
            self.write_by_name("APU_ON_FIRE", true);
            self
        }

        fn set_mlg_on_fire(mut self) -> Self {
            self.write_by_name("MLG_ON_FIRE", true);
            self
        }

        fn set_test_pushbutton(mut self, test_pb: bool) -> Self {
            self.write_by_name("OVHD_FIRE_TEST_PB_IS_PRESSED", test_pb);
            self
        }

        fn set_fire_test_extend(mut self, extend: bool) -> Self {
            self.write_by_name("FIRE_TEST_EXTEND", extend);
            self
        }

        fn fire_test_active(&mut self) -> bool {
            self.read_by_name("FIRE_TEST_ACTIVE")
        }

        fn set_agent_pb(mut self, engine_number: usize, released: bool) -> Self {
            self.write_by_name(
                &format!("OVHD_FIRE_AGENT_1_ENG_{}_IS_PRESSED", engine_number),
                released,
            );
            self
        }

        fn set_loop_failure(mut self, engine_number: usize, loop_id: FireDetectionLoopID) -> Self {
            self.fail(FailureType::FireDetectionLoop(
                loop_id,
                FireDetectionZone::Engine(engine_number),
            ));
            self
        }

        fn powered_dc_ess_bus(mut self) -> Self {
            self.command(|a| a.power_dc_ess_bus());
            self
        }

        fn unpowered_dc_ess_bus(mut self) -> Self {
            self.command(|a| a.unpower_dc_ess_bus());
            self
        }

        fn powered_dc_2_bus(mut self) -> Self {
            self.command(|a| a.power_dc_2_bus());
            self
        }

        fn unpowered_dc_2_bus(mut self) -> Self {
            self.command(|a| a.unpower_dc_2_bus());
            self
        }

        fn unpowered_dc_hot_bus(mut self) -> Self {
            self.command(|a| a.unpower_dc_hot_bus());
            self
        }

        fn engine_on_fire_detected(&mut self, engine_number: usize) -> bool {
            self.read_by_name(&format!("FIRE_DETECTED_ENG{}", engine_number))
        }

        fn apu_on_fire_detected(&mut self) -> bool {
            self.read_by_name("FIRE_DETECTED_APU")
        }

        fn mlg_on_fire_detected(&mut self) -> bool {
            self.read_by_name("FIRE_DETECTED_MLG")
        }

        fn squib_engine_is_armed(&mut self, engine_number: usize) -> bool {
            self.read_by_name(&format!("FIRE_SQUIB_1_ENG_{}_IS_ARMED", engine_number))
        }

        fn squib_apu_is_armed(&mut self) -> bool {
            self.read_by_name("FIRE_SQUIB_1_APU_1_IS_ARMED")
        }

        fn squib_engine_is_discharged(&mut self, engine_number: usize) -> bool {
            self.read_by_name(&format!("FIRE_SQUIB_1_ENG_{}_IS_DISCHARGED", engine_number))
        }

        fn squib_apu_is_discharged(&mut self) -> bool {
            self.read_by_name("FIRE_SQUIB_1_APU_1_IS_DISCHARGED")
        }
    }
    impl TestBed for FireProtectionTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    fn test_bed() -> FireProtectionTestBed {
        FireProtectionTestBed::new()
    }

    mod a380_fire_protection_tests {
        use super::*;

        #[test]
        fn when_an_engine_is_on_fire_the_detection_system_works() {
            let mut test_bed = test_bed().with().set_engine_on_fire(1).and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn when_an_engine_is_on_fire_the_detection_works_if_only_one_loop_unpowered() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .unpowered_dc_ess_bus()
                .set_engine_on_fire(1)
                .and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn when_an_engine_is_on_fire_the_detection_system_does_not_work_if_unpowered() {
            // If both loops are unpowered at the same time the fire warning will trigger
            // We need to add a delay between the two unpowering systems
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .unpowered_dc_ess_bus()
                .run_with_delta_of(Duration::from_secs(6))
                .unpowered_dc_2_bus()
                .set_engine_on_fire(1)
                .and_run();

            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn returning_power_to_loop_makes_it_operational() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .unpowered_dc_ess_bus()
                .run_with_delta_of(Duration::from_secs(6))
                .unpowered_dc_2_bus()
                .set_engine_on_fire(1)
                .and_run();

            assert!(!test_bed.engine_on_fire_detected(1));

            test_bed = test_bed.powered_dc_ess_bus().powered_dc_2_bus().and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn unpowering_both_loops_simultaneously_triggers_fire_detection() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .unpowered_dc_ess_bus()
                .unpowered_dc_2_bus()
                .and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn after_power_triggering_returning_power_clears_fire_detection() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .unpowered_dc_ess_bus()
                .unpowered_dc_2_bus()
                .and_run();

            assert!(test_bed.engine_on_fire_detected(1));

            test_bed = test_bed.powered_dc_ess_bus().powered_dc_2_bus().and_run();

            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn fire_detection_works_for_apu_and_mlg() {
            let mut test_bed = test_bed()
                .with()
                .set_apu_on_fire()
                .and()
                .set_mlg_on_fire()
                .and_run();

            assert!(test_bed.apu_on_fire_detected());
            assert!(test_bed.mlg_on_fire_detected());
        }

        #[test]
        fn all_zones_detect_fire_when_test_pressed() {
            let mut test_bed = test_bed().with().set_test_pushbutton(true).and_run();

            assert!(test_bed.engine_on_fire_detected(1));
            assert!(test_bed.apu_on_fire_detected());
            assert!(test_bed.mlg_on_fire_detected());
        }

        #[test]
        fn test_stops_when_pushbutton_released_without_extension() {
            let mut test_bed = test_bed()
                .with()
                .set_test_pushbutton(true)
                .and_run()
                .then()
                .set_test_pushbutton(false)
                .run_with_delta_of(Duration::from_secs(1));

            assert!(!test_bed.fire_test_active());
            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn extended_test_goes_on_after_pushbutton_released() {
            let mut test_bed = test_bed()
                .with()
                .set_fire_test_extend(true)
                .set_test_pushbutton(true)
                .and_run()
                .then()
                .set_test_pushbutton(false)
                .run_with_delta_of(Duration::from_secs(5));

            assert!(test_bed.fire_test_active());
            assert!(test_bed.engine_on_fire_detected(1));
            assert!(test_bed.apu_on_fire_detected());

            test_bed = test_bed.run_with_delta_of(Duration::from_secs(3));

            assert!(!test_bed.fire_test_active());
            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn test_does_not_trigger_immidatelly() {
            let mut test_bed = test_bed()
                .with()
                .set_test_pushbutton(true)
                .and()
                .run_with_no_delta();

            assert!(!test_bed.engine_on_fire_detected(1));
            assert!(!test_bed.apu_on_fire_detected());
            assert!(!test_bed.mlg_on_fire_detected());
        }

        #[test]
        fn fire_detection_disappears_when_fire_extinguished() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_on_fire(1)
                .and_run()
                .set_engine_fire_extinguished(1)
                .and_run();

            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn fire_is_detected_when_triggered_through_failures() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_on_fire_through_failure(1)
                .and_double_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn fire_is_not_detected_when_failure_resolved() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_on_fire_through_failure(1)
                .and_double_run();

            assert!(test_bed.engine_on_fire_detected(1));

            test_bed = test_bed
                .resolve_engine_on_fire_through_failure(1)
                .and_double_run();

            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn when_an_engine_is_on_fire_the_detection_works_if_only_one_loop_has_failed() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .set_loop_failure(1, FireDetectionLoopID::A)
                .set_engine_on_fire(1)
                .and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn when_an_engine_is_on_fire_the_detection_system_does_not_work_if_both_loops_failed() {
            // If both loops fail at the same time the fire warning will trigger
            // We need to add a delay between the two failing systems
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .set_loop_failure(1, FireDetectionLoopID::A)
                .run_with_delta_of(Duration::from_secs(6))
                .set_loop_failure(1, FireDetectionLoopID::B)
                .set_engine_on_fire(1)
                .and_run();

            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn failing_both_loops_simultaneously_triggers_fire_detection() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .set_loop_failure(1, FireDetectionLoopID::A)
                .set_loop_failure(1, FireDetectionLoopID::B)
                .and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }
    }

    mod a380_fire_extinguishing_tests {
        use super::*;

        #[test]
        fn squibs_start_disarmed() {
            let mut test_bed = test_bed().and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn releasing_the_fire_pb_arms_the_squibs() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run();

            assert!(test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn unreleasing_the_fire_pb_disarms_the_squibs() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_engine_fire_pb_released(1, false)
                .and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn pressing_the_agent_button_does_not_do_anything_if_unarmed() {
            let mut test_bed = test_bed().with().set_agent_pb(1, true).and_run().and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
            assert!(!test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn pressing_the_agent_button_when_armed_does_not_discharge_immediately() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_run();

            assert!(test_bed.squib_engine_is_armed(1));
            assert!(!test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn pressing_the_agent_button_when_armed_discharges_bottle_after_delay() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_double_run();

            assert!(test_bed.squib_engine_is_armed(1));
            assert!(test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn depressing_the_agent_button_does_not_stop_discharge() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_run()
                .set_agent_pb(1, false)
                .and_run();

            assert!(test_bed.squib_engine_is_armed(1));
            assert!(test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn bottle_stays_discharged_after_fire_pb_is_reset() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_run()
                .set_agent_pb(1, false)
                .and_run()
                .then()
                .set_engine_fire_pb_released(1, false)
                .and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
            assert!(test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn when_on_ground_apu_bottle_automatically_discharges() {
            let mut test_bed = test_bed()
                .set_on_ground(true)
                .with()
                .set_apu_on_fire()
                .run_with_delta_of(Duration::from_secs(10))
                .and_double_run();

            assert!(!test_bed.squib_apu_is_armed());
            assert!(test_bed.squib_apu_is_discharged());
        }

        #[test]
        fn apu_bottle_does_not_discharge_on_ground_when_testing() {
            let mut test_bed = test_bed()
                .set_on_ground(true)
                .set_test_pushbutton(true)
                .run_with_delta_of(Duration::from_secs(10))
                .and_double_run()
                .then()
                .set_test_pushbutton(false)
                .and_double_run();

            assert!(!test_bed.squib_apu_is_armed());
            assert!(!test_bed.squib_apu_is_discharged());
        }

        #[test]
        fn apu_bottle_starts_charged_on_ground() {
            let mut test_bed = test_bed().set_on_ground(true).and_double_run();

            assert!(!test_bed.squib_apu_is_armed());
            assert!(!test_bed.squib_apu_is_discharged());
        }

        #[test]
        fn apu_bottle_starts_charged_in_flight() {
            let mut test_bed = test_bed().set_on_ground(false).and_double_run();

            assert!(!test_bed.squib_apu_is_armed());
            assert!(!test_bed.squib_apu_is_discharged());
        }

        #[test]
        fn when_in_flight_apu_bottle_does_not_automatically_discharge() {
            let mut test_bed = test_bed()
                .set_on_ground(false)
                .with()
                .set_apu_on_fire()
                .run_with_delta_of(Duration::from_secs(10))
                .and_double_run();

            assert!(!test_bed.squib_apu_is_armed());
            assert!(!test_bed.squib_apu_is_discharged());
        }

        #[test]
        fn squibs_arm_even_if_one_squib_unpowered() {
            let mut test_bed = test_bed()
                .with()
                .unpowered_dc_hot_bus()
                .set_engine_fire_pb_released(1, true)
                .and_run();

            assert!(test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn squibs_dont_arm_if_both_unpowered() {
            let mut test_bed = test_bed()
                .with()
                .unpowered_dc_hot_bus()
                .unpowered_dc_ess_bus()
                .set_engine_fire_pb_released(1, true)
                .and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn squibs_show_armed_and_discharged_when_test() {
            let mut test_bed = test_bed().with().set_test_pushbutton(true).and_run();

            assert!(test_bed.squib_engine_is_armed(1));
            assert!(test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn squibs_dont_show_armed_and_discharged_when_test_if_unpowered() {
            let mut test_bed = test_bed()
                .with()
                .unpowered_dc_hot_bus()
                .unpowered_dc_ess_bus()
                .set_test_pushbutton(true)
                .and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
            assert!(!test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn discharging_bottle_when_fire_active_has_the_chance_to_put_it_out() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_on_fire(1)
                .and_double_run()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_double_run()
                .and_double_run();

            assert!(test_bed.squib_engine_is_armed(1));
            assert!(test_bed.squib_engine_is_discharged(1));
            print!(
                "Engine fire was put out: {}",
                !test_bed.engine_on_fire_detected(1)
            );
        }
    }
}
