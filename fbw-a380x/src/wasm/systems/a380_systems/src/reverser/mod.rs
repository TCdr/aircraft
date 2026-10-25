use std::fmt::Debug;

use systems::{
    accept_iterable,
    engine::{
        reverser::{A380ReverserAssembly, ElecReverserInterface, ReverserFeedback},
        Engine,
    },
    failures::{Failure, FailureType},
    shared::{ElectricalBusType, ElectricalBuses, LgciuWeightOnWheels, ReverserPosition},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

use uom::si::{
    angle::degree,
    f64::*,
    ratio::{percent, ratio},
};

#[derive(Clone, Copy, Debug, PartialEq)]
enum ReverserControlState {
    StowedOff,
    StowedOn,
    TransitOpening,
    TransitClosing,
    FullyOpened,
}

pub struct A380ReverserController {
    throttle_lever_angle_id: VariableIdentifier,

    throttle_lever_angle: Angle,

    /// The reverse switch of the throttle assembly (second line of defense).
    reverse_switch_id: VariableIdentifier,
    reverse_switch_closed: bool,
    /// The reverse lever signal of each PRIM that controls the third line of defense of this
    /// engine (a PRIM that is off, failed or not in charge of the engine does not give it).
    prim_reverse_selected_ids: [VariableIdentifier; 3],
    prim_reverse_selected: [bool; 3],

    state: ReverserControlState,

    primary_lock_from_prim_should_unlock: bool,
    secondary_lock_from_prim_should_unlock: bool,
    tertiary_lock_from_prim_should_unlock: bool,

    /// flyPad "Reverser N fault (does not deploy)": ENG 2(3) REVERSER FAULT, INOP SYS ENG 2(3)
    /// REVERSER.
    fault: Failure,
    /// flyPad "Reverser N control fault (ETRAC)": ENG 2(3) REVERSER CTL FAULT, the reverser is
    /// inoperative.
    control_fault: Failure,
    /// flyPad "Reverser N failed locked": ENG 2(3) REVERSER LOCKED (a primary or the tertiary lock
    /// failed locked): the locks are not released, the reverser does not deploy.
    locked: Failure,
    /// flyPad "Reverser N energized (tertiary lock unlocked)": ENG 2(3) REVERSER ENERGIZED (on ground
    /// energized without deployment order, in flight energized with the tertiary lock failed not
    /// locked). Design choice: the tertiary lock stays released, the two primary locks hold the cowls
    /// stowed.
    energized: Failure,
    /// flyPad "Reverser N minor fault (alert only)": ENG 2(3) REVERSER MINOR FAULT, shown after landing
    /// for a failure that does not impair the reverser: it operates normally.
    minor_fault: Failure,
    /// flyPad "Reverser N inhibited (maintenance)": ENG 2(3) REVERSER INHIBITED by maintenance action:
    /// the locks are not released, the reverser does not deploy.
    inhibited: Failure,
    /// The FADEC no longer commands a deployment (thrust lever fault: INOP SYS ENG 2(3) REVERSER).
    /// Set by the engine control failures (engine_control_failure.rs).
    deployment_inhibited: bool,

    /// The ETRAC, the reverser controller: DC 1 for engine 2, DC 2 for engine 3.
    etrac_bus: ElectricalBusType,
    etrac_powered: bool,
    /// The EIPM of the engine is failed (fadec_power.rs): it no longer supplies the thrust reverser
    /// power unit (TRPU) when the second line of defense is cleared, so neither the second primary
    /// lock nor the cowls move.
    eipm_failed: bool,
}
impl A380ReverserController {
    const FIRST_LINE_OF_DEFENCE_TLA_ANGLE_DEGREE: f64 = -3.;

    const OPENING_AUTHORIZATION_TLA_ANGLE_DEGREE: f64 = -4.3;
    const MIN_N2_ENGINE_TO_ALLOW_OPENING_PCT: f64 = 50.;

    const POSITION_FEEDBACK_THRESHOLD_FOR_REPORTING_STOWED: f64 = 0.1;

    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            throttle_lever_angle_id: context
                .get_identifier(format!("AUTOTHRUST_TLA:{}", engine_number)),

            throttle_lever_angle: Angle::default(),
            reverse_switch_id: context
                .get_identifier(format!("THR_LEVER_{}_REVERSE_SWITCH", engine_number)),
            reverse_switch_closed: false,
            prim_reverse_selected_ids: [1, 2, 3].map(|prim_number| {
                context.get_identifier(format!(
                    "PRIM_{}_THR_REVERSE_SELECTED:{}",
                    prim_number, engine_number
                ))
            }),
            prim_reverse_selected: [false; 3],
            state: ReverserControlState::StowedOff,

            primary_lock_from_prim_should_unlock: false,
            secondary_lock_from_prim_should_unlock: false,
            tertiary_lock_from_prim_should_unlock: false,

            fault: Failure::new(FailureType::ReverserFault(engine_number)),
            control_fault: Failure::new(FailureType::ReverserControlFault(engine_number)),
            locked: Failure::new(FailureType::ReverserLocked(engine_number)),
            energized: Failure::new(FailureType::ReverserPressurized(engine_number)),
            minor_fault: Failure::new(FailureType::ReverserMinorFault(engine_number)),
            inhibited: Failure::new(FailureType::ReverserInhibited(engine_number)),
            deployment_inhibited: false,

            etrac_bus: ElectricalBusType::DirectCurrent(if engine_number == 2 { 1 } else { 2 }),
            etrac_powered: false,
            eipm_failed: false,
        }
    }

    pub fn set_eipm_failed(&mut self, failed: bool) {
        self.eipm_failed = failed;
    }

    pub fn set_deployment_inhibited(&mut self, inhibited: bool) {
        self.deployment_inhibited = inhibited;
    }

    /// The flight crew commands a deployment (the controller opens or holds the reverser open).
    pub fn deploy_is_commanded(&self) -> bool {
        self.state == ReverserControlState::TransitOpening
            || self.state == ReverserControlState::FullyOpened
    }

    /// The controller drives a stowage after a deployment.
    pub fn stow_is_commanded(&self) -> bool {
        self.state == ReverserControlState::TransitClosing
    }

    pub fn has_fault(&self) -> bool {
        self.fault.is_active()
    }

    pub fn has_control_fault(&self) -> bool {
        self.control_fault.is_active()
    }

    pub fn is_failed_locked(&self) -> bool {
        self.locked.is_active()
    }

    pub fn is_energized_by_failure(&self) -> bool {
        self.energized.is_active()
    }

    pub fn has_minor_fault(&self) -> bool {
        self.minor_fault.is_active()
    }

    pub fn is_inhibited_by_maintenance(&self) -> bool {
        self.inhibited.is_active()
    }

    fn first_line_of_defense_condition_should_unlock(
        &self,
        lgciu: &impl LgciuWeightOnWheels,
    ) -> bool {
        self.throttle_lever_angle.get::<degree>() <= Self::FIRST_LINE_OF_DEFENCE_TLA_ANGLE_DEGREE
            && lgciu.left_and_right_gear_compressed(false)
    }

    fn second_line_of_defense_condition_should_unlock(
        &self,
        lgciu: &impl LgciuWeightOnWheels,
    ) -> bool {
        self.reverse_switch_closed
            && lgciu.left_and_right_gear_compressed(false)
            && !self.eipm_failed
    }

    /// Third line of defense: the tertiary lock is released only with the throttle in reverse and the
    /// aircraft on the ground (in flight a lever in reverse must not release it).
    fn third_line_of_defense_condition_should_unlock(
        &self,
        lgciu: &impl LgciuWeightOnWheels,
    ) -> bool {
        self.prim_reverse_selected.iter().any(|selected| *selected)
            && lgciu.left_and_right_gear_compressed(false)
    }

    pub fn update(
        &mut self,
        engine: &impl Engine,
        lgciu: &impl LgciuWeightOnWheels,
        reverser_feedback: &impl ReverserFeedback,
    ) {
        let is_confirmed_stowed_available_for_deploy =
            reverser_feedback.position_sensor().get::<ratio>()
                <= Self::POSITION_FEEDBACK_THRESHOLD_FOR_REPORTING_STOWED
                && reverser_feedback.proximity_sensor_all_stowed();

        let deploy_authorized = engine.corrected_n2().get::<percent>()
            > Self::MIN_N2_ENGINE_TO_ALLOW_OPENING_PCT
            && lgciu.left_and_right_gear_compressed(false)
            && !self.fault.is_active()
            && !self.control_fault.is_active()
            && !self.inhibited.is_active()
            && !self.deployment_inhibited
            && self.etrac_powered
            && !self.eipm_failed;

        let command_opening = self.throttle_lever_angle.get::<degree>()
            <= Self::OPENING_AUTHORIZATION_TLA_ANGLE_DEGREE;

        // A failed locked or inhibited reverser keeps its locks; an energized one keeps its tertiary
        // lock released.
        let locks_can_release = !self.locked.is_active() && !self.inhibited.is_active();
        self.primary_lock_from_prim_should_unlock =
            self.first_line_of_defense_condition_should_unlock(lgciu) && locks_can_release;
        self.secondary_lock_from_prim_should_unlock =
            self.second_line_of_defense_condition_should_unlock(lgciu) && locks_can_release;
        self.tertiary_lock_from_prim_should_unlock =
            (self.third_line_of_defense_condition_should_unlock(lgciu) && locks_can_release)
                || self.energized.is_active();

        self.state = match self.state {
            ReverserControlState::StowedOff => {
                if deploy_authorized && is_confirmed_stowed_available_for_deploy {
                    ReverserControlState::StowedOn
                } else {
                    self.state
                }
            }
            ReverserControlState::StowedOn => {
                if command_opening {
                    ReverserControlState::TransitOpening
                } else {
                    self.state
                }
            }
            ReverserControlState::TransitOpening => {
                if reverser_feedback.proximity_sensor_all_deployed() {
                    ReverserControlState::FullyOpened
                } else if !deploy_authorized || !command_opening {
                    ReverserControlState::TransitClosing
                } else {
                    self.state
                }
            }
            ReverserControlState::TransitClosing => {
                if reverser_feedback.proximity_sensor_all_stowed() {
                    ReverserControlState::StowedOff
                } else if command_opening && deploy_authorized {
                    ReverserControlState::TransitOpening
                } else {
                    self.state
                }
            }
            ReverserControlState::FullyOpened => {
                if !deploy_authorized || !command_opening {
                    ReverserControlState::TransitClosing
                } else {
                    self.state
                }
            }
        };
    }
}
impl SimulationElement for A380ReverserController {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.fault.accept(visitor);
        self.control_fault.accept(visitor);
        self.locked.accept(visitor);
        self.energized.accept(visitor);
        self.minor_fault.accept(visitor);
        self.inhibited.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.throttle_lever_angle = reader.read(&self.throttle_lever_angle_id);
        self.reverse_switch_closed = reader.read(&self.reverse_switch_id);
        for (selected, id) in self
            .prim_reverse_selected
            .iter_mut()
            .zip(&self.prim_reverse_selected_ids)
        {
            *selected = reader.read(id);
        }
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.etrac_powered = buses.is_powered(self.etrac_bus);
    }
}
impl ElecReverserInterface for A380ReverserController {
    fn should_unlock_first(&self) -> bool {
        self.primary_lock_from_prim_should_unlock
    }

    fn should_unlock_second(&self) -> bool {
        self.secondary_lock_from_prim_should_unlock
    }

    fn should_unlock_third(&self) -> bool {
        self.tertiary_lock_from_prim_should_unlock
    }

    fn should_deploy_reverser(&self) -> bool {
        self.state == ReverserControlState::TransitOpening
            || self.state == ReverserControlState::FullyOpened
    }
}
impl Debug for A380ReverserController {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "\nREV Controller => STATE: {:?}/ should_unlock {:?}/{:?}/{:?} / should_deploy_reverser{:?}",
                self.state, self.should_unlock_first(),self.should_unlock_second(),self.should_unlock_third(),
                self.should_deploy_reverser(),
        )
    }
}

pub struct A380Reversers {
    reverser_2_position_id: VariableIdentifier,
    reverser_3_position_id: VariableIdentifier,

    reverser_2_in_transition_id: VariableIdentifier,
    reverser_3_in_transition_id: VariableIdentifier,

    reverser_2_deployed_id: VariableIdentifier,
    reverser_3_deployed_id: VariableIdentifier,

    reversers: [A380ReverserAssembly; 2],

    reversers_in_transition: [bool; 2],
    reversers_deployed: [bool; 2],

    /// flyPad "Reverser N unlocked (engine at idle)": ENG 2(3) REVERSER UNLOCKED, a reverser not fully
    /// locked while not commanded deployed. Design choice: the cowls stay in the stowed position (no
    /// reverse thrust, no buffet); the FADEC sets the engine at idle (ENG 2(3) IDLE ONLY).
    unlocked: [Failure; 2],

    reverser_unlocked_ids: [VariableIdentifier; 2],
    reverser_fault_ids: [VariableIdentifier; 2],
    reverser_control_fault_ids: [VariableIdentifier; 2],
    reverser_locked_ids: [VariableIdentifier; 2],
    reverser_energized_ids: [VariableIdentifier; 2],
    reverser_minor_fault_ids: [VariableIdentifier; 2],
    reverser_inhibited_ids: [VariableIdentifier; 2],

    monitoring: [A380ReverserMonitoring; 2],
}
impl A380Reversers {
    // Design choice: the supply table gives no bus for the actuation power that the EIPM switches
    // to the reverser power unit; the buses of the tertiary lock system of the same reverser.
    const REVERSER_2_ACTUATION_SUPPLY_POWER_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrent(2);
    const REVERSER_3_ACTUATION_SUPPLY_POWER_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrent(4);

    const REVERSER_2_TERTIARY_LOCK_SUPPLY_POWER_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrent(2);
    const REVERSER_3_TERTIARY_LOCK_SUPPLY_POWER_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrent(4);

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            reverser_2_position_id: context.get_identifier("REVERSER_2_POSITION".to_owned()),
            reverser_3_position_id: context.get_identifier("REVERSER_3_POSITION".to_owned()),

            reverser_2_in_transition_id: context.get_identifier("REVERSER_2_DEPLOYING".to_owned()),
            reverser_3_in_transition_id: context.get_identifier("REVERSER_3_DEPLOYING".to_owned()),

            reverser_2_deployed_id: context.get_identifier("REVERSER_2_DEPLOYED".to_owned()),
            reverser_3_deployed_id: context.get_identifier("REVERSER_3_DEPLOYED".to_owned()),

            reversers: [
                A380ReverserAssembly::new(
                    Self::REVERSER_2_ACTUATION_SUPPLY_POWER_BUS,
                    Self::REVERSER_2_TERTIARY_LOCK_SUPPLY_POWER_BUS,
                ),
                A380ReverserAssembly::new(
                    Self::REVERSER_3_ACTUATION_SUPPLY_POWER_BUS,
                    Self::REVERSER_3_TERTIARY_LOCK_SUPPLY_POWER_BUS,
                ),
            ],
            reversers_in_transition: [false, false],
            reversers_deployed: [false, false],

            unlocked: [
                Failure::new(FailureType::ReverserUnlocked(2)),
                Failure::new(FailureType::ReverserUnlocked(3)),
            ],

            reverser_unlocked_ids: [2, 3]
                .map(|number| context.get_identifier(format!("REVERSER_{}_UNLOCKED", number))),
            reverser_fault_ids: [2, 3]
                .map(|number| context.get_identifier(format!("REVERSER_{}_FAULT", number))),
            reverser_control_fault_ids: [2, 3]
                .map(|number| context.get_identifier(format!("REVERSER_{}_CTL_FAULT", number))),
            reverser_locked_ids: [2, 3]
                .map(|number| context.get_identifier(format!("REVERSER_{}_LOCKED", number))),
            reverser_energized_ids: [2, 3]
                .map(|number| context.get_identifier(format!("REVERSER_{}_ENERGIZED", number))),
            reverser_minor_fault_ids: [2, 3]
                .map(|number| context.get_identifier(format!("REVERSER_{}_MINOR_FAULT", number))),
            reverser_inhibited_ids: [2, 3]
                .map(|number| context.get_identifier(format!("REVERSER_{}_INHIBITED", number))),

            monitoring: [A380ReverserMonitoring::default(); 2],
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        reverser_controllers: &[A380ReverserController; 2],
    ) {
        self.reversers[0].update(context, &reverser_controllers[0]);

        self.reversers[1].update(context, &reverser_controllers[1]);

        self.update_sensors_state();
        self.update_monitoring(reverser_controllers);
    }

    /// The cowl position switches: an unlocked reverser is not stowed.
    fn stowed_and_locked(&self, idx: usize) -> bool {
        self.reversers[idx].proximity_sensor_all_stowed() && !self.unlocked[idx].is_active()
    }

    fn update_sensors_state(&mut self) {
        for idx in 0..self.reversers.len() {
            let all_deployed = self.reversers[idx].proximity_sensor_all_deployed();
            self.reversers_deployed[idx] = all_deployed;

            self.reversers_in_transition[idx] = !all_deployed && !self.stowed_and_locked(idx);
        }
    }

    /// The reverser status the FADEC reports to the FWS and uses for its idle protection.
    fn update_monitoring(&mut self, reverser_controllers: &[A380ReverserController; 2]) {
        for (idx, controller) in reverser_controllers.iter().enumerate() {
            let no_deploy_order =
                !controller.deploy_is_commanded() && !controller.stow_is_commanded();

            self.monitoring[idx] = A380ReverserMonitoring {
                in_operation: !no_deploy_order,
                fully_deployed: self.reversers_deployed[idx],
                unlocked: !self.stowed_and_locked(idx) && no_deploy_order,
                fault: controller.has_fault(),
                control_fault: controller.has_control_fault(),
                locked: controller.is_failed_locked(),
                energized: controller.is_energized_by_failure() && no_deploy_order,
                minor_fault: controller.has_minor_fault(),
                inhibited: controller.is_inhibited_by_maintenance(),
            };
        }
    }

    /// The status of the reversers of engines 2 and 3.
    pub fn monitoring(&self) -> [A380ReverserMonitoring; 2] {
        self.monitoring
    }

    pub fn reverser_feedback(&self, reverser_index: usize) -> &impl ReverserFeedback {
        &self.reversers[reverser_index]
    }

    pub fn reversers_position(&self) -> &[impl ReverserPosition] {
        &self.reversers[..]
    }
}
impl SimulationElement for A380Reversers {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.reversers, visitor);
        accept_iterable!(self.unlocked, visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.reverser_2_position_id,
            self.reversers[0].reverser_position().get::<ratio>(),
        );
        writer.write(
            &self.reverser_3_position_id,
            self.reversers[1].reverser_position().get::<ratio>(),
        );

        writer.write(
            &self.reverser_2_in_transition_id,
            self.reversers_in_transition[0],
        );
        writer.write(
            &self.reverser_3_in_transition_id,
            self.reversers_in_transition[1],
        );

        writer.write(&self.reverser_2_deployed_id, self.reversers_deployed[0]);
        writer.write(&self.reverser_3_deployed_id, self.reversers_deployed[1]);

        for (idx, monitoring) in self.monitoring.iter().enumerate() {
            writer.write(&self.reverser_unlocked_ids[idx], monitoring.unlocked);
            writer.write(&self.reverser_fault_ids[idx], monitoring.fault);
            writer.write(
                &self.reverser_control_fault_ids[idx],
                monitoring.control_fault,
            );
            writer.write(&self.reverser_locked_ids[idx], monitoring.locked);
            writer.write(&self.reverser_energized_ids[idx], monitoring.energized);
            writer.write(&self.reverser_minor_fault_ids[idx], monitoring.minor_fault);
            writer.write(&self.reverser_inhibited_ids[idx], monitoring.inhibited);
        }
    }
}

/// The status of one thrust reverser (engine 2 or 3), as its FADEC monitors it.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct A380ReverserMonitoring {
    /// The thrust reverser operates: a deployment or stowage the crew commands, or a deployed
    /// reverser (the auto-idle protection of the outboard engines, engine_control_failure.rs).
    pub in_operation: bool,
    /// The cowls are deployed: the deployment is completed (reverse thrust above reverse idle).
    pub fully_deployed: bool,
    /// ENG 2(3) REVERSER UNLOCKED
    pub unlocked: bool,
    /// ENG 2(3) REVERSER FAULT
    pub fault: bool,
    /// ENG 2(3) REVERSER CTL FAULT
    pub control_fault: bool,
    /// ENG 2(3) REVERSER LOCKED
    pub locked: bool,
    /// ENG 2(3) REVERSER ENERGIZED
    pub energized: bool,
    /// ENG 2(3) REVERSER MINOR FAULT
    pub minor_fault: bool,
    /// ENG 2(3) REVERSER INHIBITED
    pub inhibited: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use systems::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        engine::trent_engine::TrentEngine,
        failures::FailureType,
        shared::{update_iterator::FixedStepLoop, PotentialOrigin},
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft,
        },
    };
    use uom::si::electric_potential::volt;

    struct TestLgciu {
        compressed: bool,
    }
    impl LgciuWeightOnWheels for TestLgciu {
        fn left_and_right_gear_compressed(&self, _: bool) -> bool {
            self.compressed
        }
        fn right_gear_compressed(&self, _: bool) -> bool {
            self.compressed
        }
        fn right_gear_extended(&self, _: bool) -> bool {
            !self.compressed
        }
        fn left_gear_compressed(&self, _: bool) -> bool {
            self.compressed
        }
        fn left_gear_extended(&self, _: bool) -> bool {
            !self.compressed
        }
        fn left_and_right_gear_extended(&self, _: bool) -> bool {
            !self.compressed
        }
        fn nose_gear_compressed(&self, _: bool) -> bool {
            self.compressed
        }
        fn nose_gear_extended(&self, _: bool) -> bool {
            !self.compressed
        }
    }

    /// The reversers of engines 2 and 3 with their controllers, both engines running, AC 2, AC 4,
    /// DC 1 and DC 2 powered.
    struct TestAircraft {
        updater_fixed_step: FixedStepLoop,
        engine_2: TrentEngine,
        engine_3: TrentEngine,
        lgciu: TestLgciu,
        controllers: [A380ReverserController; 2],
        reversers: A380Reversers,
        powered_source_ac: TestElectricitySource,
        ac_2_bus: ElectricalBus,
        ac_4_bus: ElectricalBus,
        dc_1_bus: ElectricalBus,
        dc_2_bus: ElectricalBus,
        dc_powered: bool,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                updater_fixed_step: FixedStepLoop::new(Duration::from_millis(10)),
                engine_2: TrentEngine::new(context, 2),
                engine_3: TrentEngine::new(context, 3),
                lgciu: TestLgciu { compressed: true },
                controllers: [
                    A380ReverserController::new(context, 2),
                    A380ReverserController::new(context, 3),
                ],
                reversers: A380Reversers::new(context),
                powered_source_ac: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(2),
                ),
                ac_2_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(2)),
                ac_4_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(4)),
                dc_1_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
                dc_2_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(2)),
                dc_powered: true,
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            self.powered_source_ac
                .power_with_potential(ElectricPotential::new::<volt>(115.));
            electricity.supplied_by(&self.powered_source_ac);
            electricity.flow(&self.powered_source_ac, &self.ac_2_bus);
            electricity.flow(&self.powered_source_ac, &self.ac_4_bus);
            if self.dc_powered {
                electricity.flow(&self.powered_source_ac, &self.dc_1_bus);
                electricity.flow(&self.powered_source_ac, &self.dc_2_bus);
            }
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.updater_fixed_step.update(context);
            for cur_time_step in &mut self.updater_fixed_step {
                let context = context.with_delta(cur_time_step);
                self.controllers[0].update(
                    &self.engine_2,
                    &self.lgciu,
                    self.reversers.reverser_feedback(0),
                );
                self.controllers[1].update(
                    &self.engine_3,
                    &self.lgciu,
                    self.reversers.reverser_feedback(1),
                );
                self.reversers.update(&context, &self.controllers);
            }
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.engine_2.accept(visitor);
            self.engine_3.accept(visitor);
            accept_iterable!(self.controllers, visitor);
            self.reversers.accept(visitor);
            visitor.visit(self);
        }
    }

    struct ReverserTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl ReverserTestBed {
        /// On the ground, engines 2 and 3 running, levers at idle
        fn new() -> Self {
            let mut test_bed = SimulationTestBed::new(TestAircraft::new);
            for engine in [2, 3] {
                test_bed.write_by_name(&format!("TURB ENG CORRECTED N2:{}", engine), 80.);
                test_bed.write_by_name(&format!("AUTOTHRUST_TLA:{}", engine), 0.);
            }
            Self { test_bed }
        }

        fn in_flight(mut self) -> Self {
            self.test_bed.command(|a| a.lgciu.compressed = false);
            self
        }

        fn failed(mut self, failure: FailureType) -> Self {
            self.test_bed.fail(failure);
            self
        }

        /// The levers move to the angle: the reverse switches follow, and the PRIMs that control
        /// the third line of defense of each engine (2 and 3 for engine 2, 1 and 2 for engine 3)
        /// give their reverse signal when the angle is in the reverse sector.
        fn levers(mut self, tla_deg: f64) -> Self {
            let in_reverse = tla_deg <= -4.;
            for engine in [2, 3] {
                self.test_bed
                    .write_by_name(&format!("AUTOTHRUST_TLA:{}", engine), tla_deg);
                self.test_bed
                    .write_by_name(&format!("THR_LEVER_{}_REVERSE_SWITCH", engine), in_reverse);
                for prim in 1..=3 {
                    let controls_engine = if engine == 2 { prim != 1 } else { prim != 3 };
                    self.test_bed.write_by_name(
                        &format!("PRIM_{}_THR_REVERSE_SELECTED:{}", prim, engine),
                        in_reverse && controls_engine,
                    );
                }
            }
            self
        }

        fn reverse_switch_open(mut self, engine: usize) -> Self {
            self.test_bed
                .write_by_name(&format!("THR_LEVER_{}_REVERSE_SWITCH", engine), false);
            self
        }

        fn only_prim_gives_the_reverse_signal(mut self, engine: usize, only_prim: usize) -> Self {
            for prim in 1..=3 {
                self.test_bed.write_by_name(
                    &format!("PRIM_{}_THR_REVERSE_SELECTED:{}", prim, engine),
                    prim == only_prim,
                );
            }
            self
        }

        fn run_for(mut self, seconds: f64) -> Self {
            self.test_bed
                .run_with_delta(Duration::from_secs_f64(seconds));
            self
        }

        fn position(&self, idx: usize) -> f64 {
            self.test_bed.query(|a| {
                a.reversers.reversers[idx]
                    .reverser_position()
                    .get::<ratio>()
            })
        }

        fn flag(&mut self, name: &str) -> bool {
            self.test_bed.read_by_name(name)
        }
    }

    #[test]
    fn reversers_deploy_on_ground_with_no_alert() {
        let mut test_bed = ReverserTestBed::new().levers(-20.).run_for(4.);
        assert!(test_bed.position(0) > 0.99);
        assert!(test_bed.position(1) > 0.99);
        for name in [
            "REVERSER_2_UNLOCKED",
            "REVERSER_2_FAULT",
            "REVERSER_2_CTL_FAULT",
            "REVERSER_2_LOCKED",
            "REVERSER_2_ENERGIZED",
        ] {
            assert!(!test_bed.flag(name), "{}", name);
        }

        test_bed = test_bed.levers(0.).run_for(5.);
        assert!(test_bed.position(0) < 0.01);
        assert!(!test_bed.flag("REVERSER_2_UNLOCKED"));
        assert!(!test_bed.flag("REVERSER_2_DEPLOYING"));
    }

    #[test]
    fn reverser_without_etrac_supply_does_not_deploy() {
        let mut test_bed = ReverserTestBed::new();
        test_bed.test_bed.command(|a| a.dc_powered = false);
        let test_bed = test_bed.levers(-20.).run_for(4.);
        assert!(test_bed.position(0) < 0.01);
        assert!(test_bed.position(1) < 0.01);
    }

    /// The EIPM supplies the thrust reverser power unit when the second line of defense is cleared.
    #[test]
    fn reverser_of_a_failed_eipm_neither_releases_its_second_lock_nor_deploys() {
        let mut test_bed = ReverserTestBed::new();
        test_bed
            .test_bed
            .command(|a| a.controllers[0].set_eipm_failed(true));
        let test_bed = test_bed.levers(-20.).run_for(4.);
        assert!(test_bed.position(0) < 0.01);
        assert!(test_bed.position(1) > 0.99);
        assert!(!test_bed
            .test_bed
            .query(|a| a.controllers[0].should_unlock_second()));
        assert!(test_bed
            .test_bed
            .query(|a| a.controllers[1].should_unlock_second()));
    }

    #[test]
    fn faulty_reverser_does_not_deploy() {
        let mut test_bed = ReverserTestBed::new()
            .failed(FailureType::ReverserFault(2))
            .levers(-20.)
            .run_for(4.);
        assert!(test_bed.position(0) < 0.01);
        assert!(test_bed.position(1) > 0.99);
        assert!(test_bed.flag("REVERSER_2_FAULT"));
        assert!(!test_bed.flag("REVERSER_3_FAULT"));
        assert!(test_bed
            .test_bed
            .query(|a| a.reversers.monitoring()[0].fault));
    }

    #[test]
    fn reverser_with_a_control_fault_does_not_deploy() {
        let mut test_bed = ReverserTestBed::new()
            .failed(FailureType::ReverserControlFault(3))
            .levers(-20.)
            .run_for(4.);
        assert!(test_bed.position(1) < 0.01);
        assert!(test_bed.flag("REVERSER_3_CTL_FAULT"));
    }

    #[test]
    fn failed_locked_reverser_does_not_deploy() {
        let mut test_bed = ReverserTestBed::new()
            .failed(FailureType::ReverserLocked(2))
            .levers(-20.)
            .run_for(4.);
        assert!(test_bed.position(0) < 0.01);
        assert!(test_bed.flag("REVERSER_2_LOCKED"));
    }

    #[test]
    fn inhibited_reverser_does_not_deploy() {
        let mut test_bed = ReverserTestBed::new();
        test_bed
            .test_bed
            .command(|a| a.controllers[1].set_deployment_inhibited(true));
        let test_bed = test_bed.levers(-20.).run_for(4.);
        assert!(test_bed.position(0) > 0.99);
        assert!(test_bed.position(1) < 0.01);
    }

    /// Third line of defense: the tertiary lock is released with the throttle in reverse on the
    /// ground only.
    #[test]
    fn third_line_of_defense_is_cleared_on_ground_only() {
        let test_bed = ReverserTestBed::new().levers(-20.).run_for(1.);
        assert!(test_bed
            .test_bed
            .query(|a| a.controllers[0].should_unlock_third()));

        let test_bed = ReverserTestBed::new().in_flight().levers(-20.).run_for(1.);
        assert!(!test_bed
            .test_bed
            .query(|a| a.controllers[0].should_unlock_third()));
        assert!(!test_bed
            .test_bed
            .query(|a| a.controllers[1].should_unlock_third()));
    }

    /// Second line of defense: the reverse switch of the throttle assembly, not the lever angle.
    #[test]
    fn second_line_of_defense_needs_the_reverse_switch() {
        let test_bed = ReverserTestBed::new().levers(-20.).run_for(1.);
        assert!(test_bed
            .test_bed
            .query(|a| a.controllers[0].should_unlock_second()));

        let test_bed = ReverserTestBed::new()
            .levers(-20.)
            .reverse_switch_open(2)
            .run_for(1.);
        assert!(!test_bed
            .test_bed
            .query(|a| a.controllers[0].should_unlock_second()));
        assert!(test_bed
            .test_bed
            .query(|a| a.controllers[1].should_unlock_second()));
    }

    /// Third line of defense: the PRIM reverse signal, not the lever angle the FADEC reads.
    #[test]
    fn third_line_of_defense_needs_a_prim_reverse_signal() {
        let test_bed = ReverserTestBed::new()
            .levers(-20.)
            .only_prim_gives_the_reverse_signal(2, 3)
            .run_for(1.);
        assert!(test_bed
            .test_bed
            .query(|a| a.controllers[0].should_unlock_third()));

        let test_bed = ReverserTestBed::new()
            .levers(-20.)
            .only_prim_gives_the_reverse_signal(2, 0)
            .run_for(1.);
        assert!(!test_bed
            .test_bed
            .query(|a| a.controllers[0].should_unlock_third()));
        assert!(test_bed
            .test_bed
            .query(|a| a.controllers[1].should_unlock_third()));
    }

    /// The reverser deploys only when the three lines of defense are cleared.
    #[test]
    fn reverser_does_not_deploy_when_a_line_of_defense_is_not_cleared() {
        let test_bed = ReverserTestBed::new()
            .levers(-20.)
            .only_prim_gives_the_reverse_signal(2, 0)
            .run_for(4.);
        assert!(test_bed.position(0) < 0.01);
        assert!(test_bed.position(1) > 0.99);
    }

    /// ENG 2(3) REVERSER MINOR FAULT: the reverser still operates.
    #[test]
    fn reverser_with_a_minor_fault_deploys_and_is_reported() {
        let mut test_bed = ReverserTestBed::new()
            .failed(FailureType::ReverserMinorFault(2))
            .levers(-20.)
            .run_for(4.);
        assert!(test_bed.position(0) > 0.99);
        assert!(test_bed.flag("REVERSER_2_MINOR_FAULT"));
        assert!(!test_bed.flag("REVERSER_3_MINOR_FAULT"));
    }

    /// ENG 2(3) REVERSER INHIBITED by maintenance action: the reverser does not deploy and its locks
    /// stay locked.
    #[test]
    fn reverser_inhibited_by_maintenance_does_not_deploy() {
        let mut test_bed = ReverserTestBed::new()
            .failed(FailureType::ReverserInhibited(3))
            .levers(-20.)
            .run_for(4.);
        assert!(test_bed.position(0) > 0.99);
        assert!(test_bed.position(1) < 0.01);
        assert!(test_bed.flag("REVERSER_3_INHIBITED"));
        assert!(!test_bed.flag("REVERSER_2_INHIBITED"));
        assert!(!test_bed
            .test_bed
            .query(|a| a.controllers[1].should_unlock_third()));
    }

    #[test]
    fn energized_reverser_is_reported_without_a_deploy_order_and_stays_stowed() {
        let mut test_bed = ReverserTestBed::new()
            .in_flight()
            .failed(FailureType::ReverserPressurized(3))
            .run_for(1.);
        assert!(test_bed.flag("REVERSER_3_ENERGIZED"));
        assert!(!test_bed.flag("REVERSER_2_ENERGIZED"));
        assert!(test_bed.position(1) < 0.01);
    }

    #[test]
    fn unlocked_reverser_is_reported_unlocked_in_transit_without_deploying() {
        let mut test_bed = ReverserTestBed::new()
            .in_flight()
            .failed(FailureType::ReverserUnlocked(2))
            .run_for(1.);
        assert!(test_bed.flag("REVERSER_2_UNLOCKED"));
        assert!(test_bed.flag("REVERSER_2_DEPLOYING"));
        assert!(!test_bed.flag("REVERSER_3_UNLOCKED"));
        assert!(test_bed.position(0) < 0.01);
        // an unlocked reverser is no reverser operation (auto-idle of the outboard engines)
        assert!(!test_bed
            .test_bed
            .query(|a| a.reversers.monitoring()[0].in_operation));
    }

    /// Auto-idle protection: the FADECs of the outboard engines read the reverser operation.
    #[test]
    fn the_reverser_operation_lasts_from_the_deploy_order_to_the_end_of_the_stowage() {
        let test_bed = ReverserTestBed::new().run_for(1.);
        assert!(!test_bed
            .test_bed
            .query(|a| a.reversers.monitoring()[0].in_operation));

        let test_bed = test_bed.levers(-20.).run_for(4.);
        assert!(test_bed.test_bed.query(|a| a
            .reversers
            .monitoring()
            .iter()
            .all(|r| r.in_operation)));

        let test_bed = test_bed.levers(0.).run_for(5.);
        assert!(!test_bed.test_bed.query(|a| a
            .reversers
            .monitoring()
            .iter()
            .any(|r| r.in_operation)));
    }
}
