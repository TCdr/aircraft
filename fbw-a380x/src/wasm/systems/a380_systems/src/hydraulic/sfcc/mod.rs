use crate::systems::shared::arinc429::{Arinc429Word, SignStatus};
use systems::accept_iterable;
use systems::failures::{Failure, FailureType};
use systems::hydraulic::command_sensor_unit::CSU;
use systems::hydraulic::flap_slat::ValveBlock;
use systems::shared::{AdirsMeasurementOutputs, PositionPickoffUnit};

use systems::simulation::{
    InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
    VariableIdentifier, Write,
};

use uom::si::{angle::degree, f64::*, length::foot, velocity::knot};

mod flaps_channel;
mod flaps_lever;
mod slats_channel;
mod system_control;
mod wing_tip_brakes;
use flaps_channel::FlapsChannel;
use flaps_lever::FlapsLeverInput;
use slats_channel::SlatsChannel;
use wing_tip_brakes::WingTipBrakes;

#[derive(Debug, Copy, Clone, PartialEq)]
pub enum FlapsConf {
    Conf0,
    Conf1,
    Conf1F,
    Conf2,
    Conf2S,
    Conf3,
    ConfFull,
}

pub struct SlatFlapControlComputerMisc {}
impl SlatFlapControlComputerMisc {
    const POSITIONING_THRESHOLD_DEGREE: f64 = 6.69;
    const TARGET_THRESHOLD_DEGREE: f64 = 0.18;

    pub fn in_positioning_threshold_range(position: Angle, target_position: Angle) -> bool {
        let tolerance = Angle::new::<degree>(Self::POSITIONING_THRESHOLD_DEGREE);
        position > (target_position - tolerance) && position < (target_position + tolerance)
    }

    pub fn in_target_threshold_range(position: Angle, target_position: Angle) -> bool {
        let tolerance = Angle::new::<degree>(Self::TARGET_THRESHOLD_DEGREE);
        position > (target_position - tolerance) && position < (target_position + tolerance)
    }
}

struct SlatFlapControlComputer {
    flaps_conf_index_id: VariableIdentifier,
    slat_flap_system_status_word_id: VariableIdentifier,
    slat_flap_component_status_word_id: VariableIdentifier,
    slat_flap_actual_position_word_id: VariableIdentifier,
    slat_actual_position_word_id: VariableIdentifier,
    flap_actual_position_word_id: VariableIdentifier,

    flaps_channel: FlapsChannel,
    slats_channel: SlatsChannel,

    flaps_conf: FlapsConf,
    flap_load_relief_active: bool,
    cruise_baulk_active: bool,
    alpha_speed_lock_active: bool,

    lever: FlapsLeverInput,
}

impl SlatFlapControlComputer {
    const HANDLE_ONE_CONF_AIRSPEED_THRESHOLD_KNOTS: f64 = 205.;
    const CONF1F_TO_CONF1_AIRSPEED_THRESHOLD_KNOTS: f64 = 212.;
    const CRUISE_BAULK_AIRSPEED_THRESHOLD_KNOTS: f64 = 265.5;
    const CRUISE_BAULK_ALTITUDE_THRESHOLD_FEET: f64 = 22000.;
    const ALPHA_SPEED_LOCK_IN_AIRSPEED_THRESHOLD_KNOTS: f64 = 155.;
    const ALPHA_SPEED_LOCK_OUT_AIRSPEED_THRESHOLD_KNOTS: f64 = 161.;
    const ALPHA_SPEED_LOCK_IN_AOA_THRESHOLD_DEGREES: f64 = 9.5;
    const ALPHA_SPEED_LOCK_OUT_AOA_THRESHOLD_DEGREES: f64 = 9.2;

    const FLRS_CONFFULL_TO_CONF3_AIRSPEED_THRESHOLD_KNOTS: f64 = 184.5;
    const FLRS_CONF3_TO_CONF2S_AIRSPEED_THRESHOLD_KNOTS: f64 = 198.5;
    const FLRS_CONF2_TO_CONF1F_AIRSPEED_THRESHOLD_KNOTS: f64 = 222.5;
    const FLRS_CONF1F_TO_CONF2_AIRSPEED_THRESHOLD_KNOTS: f64 = 217.5;
    const FLRS_CONF2S_TO_CONF3_AIRSPEED_THRESHOLD_KNOTS: f64 = 193.5;
    const FLRS_CONF3_TO_CONFFULL_AIRSPEED_THRESHOLD_KNOTS: f64 = 179.5;

    fn new(context: &mut InitContext, num: u8) -> Self {
        Self {
            flaps_conf_index_id: context.get_identifier("FLAPS_CONF_INDEX".to_owned()),
            slat_flap_system_status_word_id: context
                .get_identifier(format!("SFCC_{num}_SLAT_FLAP_SYSTEM_STATUS_WORD")),
            slat_flap_component_status_word_id: context
                .get_identifier(format!("SFCC_{num}_SLAT_FLAP_COMPONENT_STATUS_WORD")),
            slat_flap_actual_position_word_id: context
                .get_identifier(format!("SFCC_{num}_SLAT_FLAP_ACTUAL_POSITION_WORD")),
            slat_actual_position_word_id: context
                .get_identifier(format!("SFCC_{num}_SLAT_ACTUAL_POSITION_WORD")),
            flap_actual_position_word_id: context
                .get_identifier(format!("SFCC_{num}_FLAP_ACTUAL_POSITION_WORD")),

            flaps_channel: FlapsChannel::new(num as usize),
            slats_channel: SlatsChannel::new(num as usize),

            flaps_conf: FlapsConf::Conf0,
            flap_load_relief_active: false,
            cruise_baulk_active: false,
            alpha_speed_lock_active: false,

            lever: FlapsLeverInput::new(context, num as usize),
        }
    }

    fn generate_configuration(
        &self,
        context: &UpdateContext,
        adirs: &impl AdirsMeasurementOutputs,
    ) -> FlapsConf {
        // Ignored `CSU::OutOfDetent` and `CSU::Fault` positions due to simplified SFCC.
        match (
            self.lever.previous_detent(),
            self.lever.current_detent(),
        ) {
            (CSU::Conf0 | CSU::Conf1, CSU::Conf1)
                if context.indicated_airspeed().get::<knot>()
                    < Self::HANDLE_ONE_CONF_AIRSPEED_THRESHOLD_KNOTS
                    || context.is_on_ground() =>
            {
                FlapsConf::Conf1F
            }
            (CSU::Conf0 | CSU::Conf1, CSU::Conf1)
                // If we're not already in Conf0, then we've oversped Conf1 instead of explicitly moving the flaps handle
                if self.flaps_conf == FlapsConf::Conf0
                    && (context.indicated_airspeed().get::<knot>()
                    > Self::CRUISE_BAULK_AIRSPEED_THRESHOLD_KNOTS
                    // FIXME use ADRs
                    || context.pressure_altitude().get::<foot>()
                        > Self::CRUISE_BAULK_ALTITUDE_THRESHOLD_FEET) =>
            {
                FlapsConf::Conf0
            }
            (CSU::Conf0, CSU::Conf1) => FlapsConf::Conf1,
            (CSU::Conf1, CSU::Conf1)
                if context.indicated_airspeed().get::<knot>()
                    > Self::CONF1F_TO_CONF1_AIRSPEED_THRESHOLD_KNOTS =>
            {
                FlapsConf::Conf1
            }
            (CSU::Conf1, CSU::Conf1) => self.flaps_conf,
            (_, CSU::Conf1)
                if context.indicated_airspeed().get::<knot>()
                    <= Self::CONF1F_TO_CONF1_AIRSPEED_THRESHOLD_KNOTS =>
            {
                FlapsConf::Conf1F
            }
            (_, CSU::Conf1) => FlapsConf::Conf1,
            (_, CSU::Conf0) if context.is_in_flight() && self.alpha_speed_lock_active => {
                if context.indicated_airspeed().get::<knot>()
                    > Self::ALPHA_SPEED_LOCK_OUT_AIRSPEED_THRESHOLD_KNOTS
                    || self
                        .angle_of_attack(adirs)
                        .unwrap_or_default()
                        .get::<degree>()
                        < Self::ALPHA_SPEED_LOCK_OUT_AOA_THRESHOLD_DEGREES
                {
                    FlapsConf::Conf0
                } else {
                    self.flaps_conf
                }
            }
            (CSU::Conf1, CSU::Conf0)
            | (CSU::Conf2, CSU::Conf0)
            | (CSU::Conf3, CSU::Conf0)
            | (CSU::ConfFull, CSU::Conf0)
                if context.is_in_flight()
                    && (context.indicated_airspeed().get::<knot>()
                        < Self::ALPHA_SPEED_LOCK_IN_AIRSPEED_THRESHOLD_KNOTS
                        || self
                            .angle_of_attack(adirs)
                            .unwrap_or_default()
                            .get::<degree>()
                            > Self::ALPHA_SPEED_LOCK_IN_AOA_THRESHOLD_DEGREES) =>
            {
                FlapsConf::Conf1F
            }
            (_, CSU::Conf0) => FlapsConf::Conf0,
            (CSU::Conf1 | CSU::Conf2, CSU::Conf2)
                if context.indicated_airspeed().get::<knot>()
                    > Self::FLRS_CONF2_TO_CONF1F_AIRSPEED_THRESHOLD_KNOTS =>
            {
                FlapsConf::Conf1F
            }
            (CSU::Conf2, CSU::Conf2) if self.flaps_conf == FlapsConf::Conf1F => {
                if context.indicated_airspeed().get::<knot>()
                    < Self::FLRS_CONF1F_TO_CONF2_AIRSPEED_THRESHOLD_KNOTS
                {
                    FlapsConf::Conf2
                } else {
                    FlapsConf::Conf1F
                }
            }
            (CSU::Conf2 | CSU::Conf3, CSU::Conf3)
                if context.indicated_airspeed().get::<knot>()
                    > Self::FLRS_CONF3_TO_CONF2S_AIRSPEED_THRESHOLD_KNOTS =>
            {
                FlapsConf::Conf2S
            }
            (CSU::Conf3, CSU::Conf3) if self.flaps_conf == FlapsConf::Conf2S => {
                if context.indicated_airspeed().get::<knot>()
                    < Self::FLRS_CONF2S_TO_CONF3_AIRSPEED_THRESHOLD_KNOTS
                {
                    FlapsConf::Conf3
                } else {
                    FlapsConf::Conf2S
                }
            }
            (CSU::Conf3 | CSU::ConfFull, CSU::ConfFull)
                if context.indicated_airspeed().get::<knot>()
                    > Self::FLRS_CONFFULL_TO_CONF3_AIRSPEED_THRESHOLD_KNOTS =>
            {
                FlapsConf::Conf3
            }
            (CSU::ConfFull, CSU::ConfFull) if self.flaps_conf == FlapsConf::Conf3 => {
                if context.indicated_airspeed().get::<knot>()
                    < Self::FLRS_CONF3_TO_CONFFULL_AIRSPEED_THRESHOLD_KNOTS
                {
                    FlapsConf::ConfFull
                } else {
                    FlapsConf::Conf3
                }
            }
            (from, CSU::Conf2) if from != CSU::Conf2 => FlapsConf::Conf2,
            (from, CSU::Conf3) if from != CSU::Conf3 => FlapsConf::Conf3,
            (from, CSU::ConfFull) if from != CSU::ConfFull => FlapsConf::ConfFull,
            (_, _) => self.flaps_conf,
        }
    }

    fn flap_load_relief_active(&self) -> bool {
        let handle_position = self.lever.current_detent();
        handle_position == CSU::Conf2 && self.flaps_conf != FlapsConf::Conf2
            || handle_position == CSU::Conf3 && self.flaps_conf != FlapsConf::Conf3
            || handle_position == CSU::ConfFull && self.flaps_conf != FlapsConf::ConfFull
    }

    fn cruise_baulk_active(&self) -> bool {
        let handle_position = self.lever.current_detent();
        handle_position == CSU::Conf1 && self.flaps_conf == FlapsConf::Conf0
    }

    fn alpha_speed_lock_active(&self) -> bool {
        let handle_position = self.lever.current_detent();
        handle_position == CSU::Conf0
            && (self.flaps_conf == FlapsConf::Conf1 || self.flaps_conf == FlapsConf::Conf1F)
    }

    // FIXME This is not the correct ADR input selection yet, due to missing references
    fn angle_of_attack(&self, adirs: &impl AdirsMeasurementOutputs) -> Option<Angle> {
        [1, 2, 3]
            .iter()
            .find_map(|&adiru_number| adirs.angle_of_attack(adiru_number).normal_value())
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        adirs: &impl AdirsMeasurementOutputs,
        flaps_feedback: &impl PositionPickoffUnit,
        slats_feedback: &impl PositionPickoffUnit,
        lever_jammed_out_of_detent: bool,
    ) {
        self.lever.update(context, lever_jammed_out_of_detent);
        let lever_position_received = self.lever.position_received();
        self.flaps_channel
            .control_mut()
            .set_lever_position_received(lever_position_received);
        self.slats_channel
            .control_mut()
            .set_lever_position_received(lever_position_received);

        self.flaps_conf = self.generate_configuration(context, adirs);
        self.flap_load_relief_active = self.flap_load_relief_active();
        self.cruise_baulk_active = self.cruise_baulk_active();
        self.alpha_speed_lock_active = self.alpha_speed_lock_active();

        self.flaps_channel.update(self.flaps_conf, flaps_feedback);
        self.slats_channel.update(self.flaps_conf, slats_feedback);
    }

    fn slat_flap_system_status_word(&self) -> Arinc429Word<u32> {
        let flaps_handle_position = self.lever.current_detent();
        let mut word = Arinc429Word::new(0, SignStatus::NormalOperation);

        // Slat fault and flap fault: the system no longer drives its motor (channel failure, or both control units
        // failed). The FWS raises F/CTL SLAT(FLAP) SYS 1(2) FAULT, or SLAT(FLAP) SYS 1+2 FAULT with both
        word.set_bit(11, self.slats_channel.is_failed());
        word.set_bit(12, self.flaps_channel.is_failed());
        word.set_bit(13, false);
        word.set_bit(14, false);
        // Slat and flap wing tip brakes engaged: F/CTL SLATS(FLAPS) LOCKED
        word.set_bit(15, self.slats_channel.control().wing_tip_brakes_engaged());
        word.set_bit(16, self.flaps_channel.control().wing_tip_brakes_engaged());
        word.set_bit(17, flaps_handle_position == CSU::Conf0);
        word.set_bit(18, flaps_handle_position == CSU::Conf1);
        word.set_bit(19, flaps_handle_position == CSU::Conf2);
        word.set_bit(20, flaps_handle_position == CSU::Conf3);
        word.set_bit(21, flaps_handle_position == CSU::ConfFull);
        word.set_bit(22, self.flap_load_relief_active);
        word.set_bit(23, false);
        word.set_bit(24, self.alpha_speed_lock_active);
        word.set_bit(25, self.cruise_baulk_active);
        word.set_bit(
            26,
            self.flaps_conf == FlapsConf::Conf1 || self.cruise_baulk_active,
        );
        // F/CTL FLAPS LEVER OUT OF DETENT
        word.set_bit(27, self.lever.out_of_detent_confirmed());
        word.set_bit(28, true);
        word.set_bit(29, true);

        word
    }

    /// Design choice: the faults of the SFCC parts read by the FWS that have no free bit in the system status word
    fn slat_flap_component_status_word(&self) -> Arinc429Word<u32> {
        let mut word = Arinc429Word::new(0, SignStatus::NormalOperation);
        // F/CTL SLAT(FLAP) CTL 1(2) FAULT
        word.set_bit(11, self.slats_channel.control().control_unit_failed());
        word.set_bit(12, self.flaps_channel.control().control_unit_failed());
        // F/CTL FLAPS LEVER SYS 1(2) FAULT
        word.set_bit(13, !self.lever.position_received());

        word
    }

    fn slat_flap_actual_position_word(&self) -> Arinc429Word<u32> {
        let flaps_fppu_angle = self.flaps_channel.get_feedback_angle();
        let slats_fppu_angle = self.slats_channel.get_feedback_angle();
        let mut word = Arinc429Word::new(0, SignStatus::NormalOperation);

        // NOTE: This arinc word is an adaptation of label 047 in the A320 SFCC
        // to A380 FLAPS/SLATS FPPU positions. In the future this can be improved,
        // but it requires changes to all the readers.

        word.set_bit(11, true);
        // Slats retracted
        word.set_bit(
            12,
            slats_fppu_angle > Angle::new::<degree>(-16.304)
                && slats_fppu_angle <= Angle::new::<degree>(9.580),
        );
        // Slats >= 20°
        word.set_bit(
            13,
            slats_fppu_angle >= Angle::new::<degree>(276.900)
                && slats_fppu_angle <= Angle::new::<degree>(343.695),
        );
        // Slats >= 23°
        word.set_bit(
            14,
            slats_fppu_angle >= Angle::new::<degree>(317.810)
                && slats_fppu_angle <= Angle::new::<degree>(343.695),
        );
        // Slats extended 23°
        word.set_bit(
            15,
            slats_fppu_angle >= Angle::new::<degree>(317.810)
                && slats_fppu_angle <= Angle::new::<degree>(343.695),
        );
        word.set_bit(16, self.slats_channel.control().wing_tip_brakes_engaged());
        word.set_bit(17, false);
        word.set_bit(18, true);
        // Flaps retracted
        word.set_bit(
            19,
            flaps_fppu_angle > Angle::new::<degree>(-10.504)
                && flaps_fppu_angle <= Angle::new::<degree>(10.063),
        );
        // Flaps >= 8°
        word.set_bit(
            20,
            flaps_fppu_angle >= Angle::new::<degree>(208.033)
                && flaps_fppu_angle <= Angle::new::<degree>(349.495),
        );
        // Flaps >= 17°
        word.set_bit(
            21,
            flaps_fppu_angle >= Angle::new::<degree>(251.633)
                && flaps_fppu_angle <= Angle::new::<degree>(349.495),
        );
        // Flaps >= 26°
        word.set_bit(
            22,
            flaps_fppu_angle >= Angle::new::<degree>(289.943)
                && flaps_fppu_angle <= Angle::new::<degree>(349.495),
        );
        // Flaps extended 33°
        word.set_bit(
            23,
            flaps_fppu_angle >= Angle::new::<degree>(331.343)
                && flaps_fppu_angle <= Angle::new::<degree>(349.495),
        );
        word.set_bit(24, self.flaps_channel.control().wing_tip_brakes_engaged());
        word.set_bit(25, false);
        word.set_bit(26, false);
        word.set_bit(27, false);
        word.set_bit(28, false);
        word.set_bit(29, false);

        word
    }

    fn slat_actual_position_word(&self) -> Arinc429Word<f64> {
        let fppu_slats_angle = self.slats_channel.get_feedback_angle();
        Arinc429Word::new(
            fppu_slats_angle.get::<degree>(),
            SignStatus::NormalOperation,
        )
    }

    fn flap_actual_position_word(&self) -> Arinc429Word<f64> {
        let fppu_flaps_angle = self.flaps_channel.get_feedback_angle();
        Arinc429Word::new(
            fppu_flaps_angle.get::<degree>(),
            SignStatus::NormalOperation,
        )
    }
}

impl SimulationElement for SlatFlapControlComputer {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.lever.accept(visitor);
        self.flaps_channel.accept(visitor);
        self.slats_channel.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        // Both SFCCs write the same variable: one without the lever position keeps a stale configuration and leaves
        // it to the other
        if self.lever.position_received() {
            writer.write(&self.flaps_conf_index_id, self.flaps_conf as u8);
        }

        writer.write(
            &self.slat_flap_system_status_word_id,
            self.slat_flap_system_status_word(),
        );
        writer.write(
            &self.slat_flap_component_status_word_id,
            self.slat_flap_component_status_word(),
        );
        writer.write(
            &self.slat_flap_actual_position_word_id,
            self.slat_flap_actual_position_word(),
        );
        writer.write(
            &self.slat_actual_position_word_id,
            self.slat_actual_position_word(),
        );
        writer.write(
            &self.flap_actual_position_word_id,
            self.flap_actual_position_word(),
        );
    }
}

pub struct SlatFlapComplex {
    sfcc: [SlatFlapControlComputer; 2],
    lever_out_of_detent: Failure,
    slat_wing_tip_brakes: WingTipBrakes,
    flap_wing_tip_brakes: WingTipBrakes,
}

impl SlatFlapComplex {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            sfcc: [
                SlatFlapControlComputer::new(context, 1),
                SlatFlapControlComputer::new(context, 2),
            ],
            lever_out_of_detent: Failure::new(FailureType::FlapsLeverOutOfDetent),
            slat_wing_tip_brakes: WingTipBrakes::new(FailureType::SlatTransmissionAsymmetry),
            flap_wing_tip_brakes: WingTipBrakes::new(FailureType::FlapTransmissionAsymmetry),
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        adirs: &impl AdirsMeasurementOutputs,
        flaps_feedback: &impl PositionPickoffUnit,
        slats_feedback: &impl PositionPickoffUnit,
    ) {
        let lever_jammed_out_of_detent = self.lever_out_of_detent.is_active();
        for sfcc in self.sfcc.iter_mut() {
            sfcc.update(
                context,
                adirs,
                flaps_feedback,
                slats_feedback,
                lever_jammed_out_of_detent,
            );
        }

        let [sfcc1, sfcc2] = &mut self.sfcc;
        Self::share_control_unit_states(sfcc1, sfcc2);
        Self::share_control_unit_states(sfcc2, sfcc1);

        self.update_wing_tip_brakes(context);
    }

    /// The control unit of a system drives the motor of the other system when the other control unit is failed
    fn share_control_unit_states(
        sfcc: &mut SlatFlapControlComputer,
        other_sfcc: &SlatFlapControlComputer,
    ) {
        sfcc.flaps_channel
            .control_mut()
            .set_other_control_unit_failed(
                other_sfcc.flaps_channel.control().control_unit_failed(),
            );
        sfcc.slats_channel
            .control_mut()
            .set_other_control_unit_failed(
                other_sfcc.slats_channel.control().control_unit_failed(),
            );
    }

    fn update_wing_tip_brakes(&mut self, context: &UpdateContext) {
        let slats_driven = self
            .sfcc
            .iter()
            .any(|sfcc| sfcc.slats_channel.get_command_status().is_some());
        let flaps_driven = self
            .sfcc
            .iter()
            .any(|sfcc| sfcc.flaps_channel.get_command_status().is_some());
        let both_slat_control_units_monitor = self
            .sfcc
            .iter()
            .all(|sfcc| !sfcc.slats_channel.control().control_unit_failed());
        let both_flap_control_units_monitor = self
            .sfcc
            .iter()
            .all(|sfcc| !sfcc.flaps_channel.control().control_unit_failed());

        self.slat_wing_tip_brakes.update(
            slats_driven,
            both_slat_control_units_monitor,
            context.is_on_ground(),
        );
        self.flap_wing_tip_brakes.update(
            flaps_driven,
            both_flap_control_units_monitor,
            context.is_on_ground(),
        );

        for sfcc in self.sfcc.iter_mut() {
            sfcc.slats_channel
                .control_mut()
                .set_wing_tip_brakes_engaged(self.slat_wing_tip_brakes.is_engaged());
            sfcc.flaps_channel
                .control_mut()
                .set_wing_tip_brakes_engaged(self.flap_wing_tip_brakes.is_engaged());
        }
    }

    pub fn flap_pcu(&self, idx: usize) -> &impl ValveBlock {
        &self.sfcc[idx].flaps_channel
    }

    pub fn slat_pcu(&self, idx: usize) -> &impl ValveBlock {
        &self.sfcc[idx].slats_channel
    }
}
impl SimulationElement for SlatFlapComplex {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.sfcc, visitor);
        self.lever_out_of_detent.accept(visitor);
        self.slat_wing_tip_brakes.accept(visitor);
        self.flap_wing_tip_brakes.accept(visitor);
        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use systems::failures::FailureType;
    use systems::hydraulic::flap_slat::{ChannelCommand, SolenoidStatus};
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft, Read, SimulatorReader,
    };

    use more_asserts::*;
    use uom::si::{angular_velocity::degree_per_second, pressure::psi};

    struct SlatFlapGear {
        current_angle: Angle,
        speed: AngularVelocity,
        max_angle: Angle,
        left_position_percent_id: VariableIdentifier,
        right_position_percent_id: VariableIdentifier,
        left_position_angle_id: VariableIdentifier,
        right_position_angle_id: VariableIdentifier,
    }
    impl PositionPickoffUnit for SlatFlapGear {
        fn angle(&self) -> Angle {
            self.current_angle
        }
    }

    impl SlatFlapGear {
        const ANGLE_DELTA_DEGREE: f64 = 0.01;

        fn new(
            context: &mut InitContext,
            speed: AngularVelocity,
            max_angle: Angle,
            surface_type: &str,
        ) -> Self {
            Self {
                current_angle: Angle::new::<degree>(0.),
                speed,
                max_angle,

                left_position_percent_id: context
                    .get_identifier(format!("LEFT_{}_POSITION_PERCENT", surface_type)),
                right_position_percent_id: context
                    .get_identifier(format!("RIGHT_{}_POSITION_PERCENT", surface_type)),

                left_position_angle_id: context
                    .get_identifier(format!("LEFT_{}_ANGLE", surface_type)),
                right_position_angle_id: context
                    .get_identifier(format!("RIGHT_{}_ANGLE", surface_type)),
            }
        }

        fn update(
            &mut self,
            context: &UpdateContext,
            demanded_angle: Option<Angle>,
            hydraulic_pressure_left_side: Pressure,
            hydraulic_pressure_right_side: Pressure,
        ) {
            if hydraulic_pressure_left_side.get::<psi>() > 1500.
                || hydraulic_pressure_right_side.get::<psi>() > 1500.
            {
                if let Some(demanded_angle) = demanded_angle {
                    let actual_minus_target_ffpu = demanded_angle - self.angle();

                    let fppu_angle = self.angle();

                    if actual_minus_target_ffpu.get::<degree>().abs() > Self::ANGLE_DELTA_DEGREE {
                        self.current_angle += Angle::new::<degree>(
                            actual_minus_target_ffpu.get::<degree>().signum()
                                * self.speed.get::<degree_per_second>()
                                * context.delta_as_secs_f64(),
                        );
                        self.current_angle = self.current_angle.max(Angle::new::<degree>(0.));

                        let new_ffpu_angle = self.angle();
                        // If demand was crossed between two frames: fixing to demand
                        if new_ffpu_angle > demanded_angle && fppu_angle < demanded_angle
                            || new_ffpu_angle < demanded_angle && fppu_angle > demanded_angle
                        {
                            self.current_angle = demanded_angle;
                        }
                    }
                }
            }
        }
    }
    impl SimulationElement for SlatFlapGear {
        fn write(&self, writer: &mut SimulatorWriter) {
            writer.write(
                &self.left_position_percent_id,
                self.current_angle / self.max_angle,
            );
            writer.write(
                &self.right_position_percent_id,
                self.current_angle / self.max_angle,
            );
            writer.write(&self.left_position_angle_id, self.current_angle);
            writer.write(&self.right_position_angle_id, self.current_angle);
        }
    }

    struct A380FlapsTestAircraft {
        green_hydraulic_pressure_id: VariableIdentifier,
        blue_hydraulic_pressure_id: VariableIdentifier,
        yellow_hydraulic_pressure_id: VariableIdentifier,

        flap_gear: SlatFlapGear,
        slat_gear: SlatFlapGear,
        slat_flap_complex: SlatFlapComplex,

        green_pressure: Pressure,
        blue_pressure: Pressure,
        yellow_pressure: Pressure,

        adirs: TestAdirs,
        // The aircraft updates the slat/flap complex twice per frame
        updates_per_frame: usize,
    }

    impl A380FlapsTestAircraft {
        const EQUAL_ANGLE_DELTA_DEGREE: f64 = 0.177;

        fn new(context: &mut InitContext) -> Self {
            Self {
                green_hydraulic_pressure_id: context
                    .get_identifier("HYD_GREEN_PRESSURE".to_owned()),
                blue_hydraulic_pressure_id: context.get_identifier("HYD_BLUE_PRESSURE".to_owned()),
                yellow_hydraulic_pressure_id: context
                    .get_identifier("HYD_YELLOW_PRESSURE".to_owned()),

                flap_gear: SlatFlapGear::new(
                    context,
                    AngularVelocity::new::<degree_per_second>(11.5),
                    Angle::new::<degree>(338.99),
                    "FLAPS",
                ),
                slat_gear: SlatFlapGear::new(
                    context,
                    AngularVelocity::new::<degree_per_second>(11.5),
                    Angle::new::<degree>(327.39),
                    "SLATS",
                ),

                slat_flap_complex: SlatFlapComplex::new(context),

                green_pressure: Pressure::new::<psi>(0.),
                blue_pressure: Pressure::new::<psi>(0.),
                yellow_pressure: Pressure::new::<psi>(0.),

                adirs: TestAdirs::new(),
                updates_per_frame: 1,
            }
        }

        fn set_angle_of_attack(&mut self, v: Angle) {
            self.adirs.set_angle_of_attack(v);
        }

        fn surface_movement_required(demanded_angle: Angle, feedback_angle: Angle) -> bool {
            (demanded_angle - feedback_angle).get::<degree>().abs() > Self::EQUAL_ANGLE_DELTA_DEGREE
        }

        fn signal_demanded_angle(&self, idx: usize, surface_type: &str) -> Option<Angle> {
            let sfcc = &self.slat_flap_complex.sfcc[idx];
            match surface_type {
                "FLAPS"
                    if Self::surface_movement_required(
                        sfcc.flaps_channel.get_demanded_angle(),
                        sfcc.flaps_channel.get_feedback_angle(),
                    ) =>
                {
                    Some(sfcc.flaps_channel.get_demanded_angle())
                }
                "SLATS"
                    if Self::surface_movement_required(
                        sfcc.slats_channel.get_demanded_angle(),
                        sfcc.slats_channel.get_feedback_angle(),
                    ) =>
                {
                    Some(sfcc.slats_channel.get_demanded_angle())
                }
                "FLAPS" | "SLATS" => None,
                _ => panic!("Not a valid slat/flap surface"),
            }
        }
    }

    impl Aircraft for A380FlapsTestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            for _ in 0..self.updates_per_frame {
                self.slat_flap_complex.update(
                    context,
                    &self.adirs,
                    &self.flap_gear,
                    &self.slat_gear,
                );
            }
            let flaps_demanded_angle = self.signal_demanded_angle(0, "FLAPS");
            self.flap_gear.update(
                context,
                flaps_demanded_angle,
                self.green_pressure,
                self.yellow_pressure,
            );
            let slats_demanded_angle = self.signal_demanded_angle(0, "SLATS");
            self.slat_gear.update(
                context,
                slats_demanded_angle,
                self.blue_pressure,
                self.green_pressure,
            );
        }
    }

    impl SimulationElement for A380FlapsTestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.slat_flap_complex.accept(visitor);
            self.flap_gear.accept(visitor);
            self.slat_gear.accept(visitor);
            visitor.visit(self);
        }

        fn read(&mut self, reader: &mut SimulatorReader) {
            self.green_pressure = reader.read(&self.green_hydraulic_pressure_id);
            self.blue_pressure = reader.read(&self.blue_hydraulic_pressure_id);
            self.yellow_pressure = reader.read(&self.yellow_hydraulic_pressure_id);
        }
    }

    struct TestAdirs {
        is_aligned: bool,
        latitude: Arinc429Word<Angle>,
        longitude: Arinc429Word<Angle>,
        heading: Arinc429Word<Angle>,
        vertical_speed: Arinc429Word<Velocity>,
        altitude: Arinc429Word<Length>,
        angle_of_attack: Arinc429Word<Angle>,
        computed_airspeed: Arinc429Word<Velocity>,
    }
    impl TestAdirs {
        fn new() -> Self {
            Self {
                is_aligned: false,
                latitude: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
                longitude: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
                heading: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
                vertical_speed: Arinc429Word::new(Velocity::default(), SignStatus::FailureWarning),
                altitude: Arinc429Word::new(Length::default(), SignStatus::FailureWarning),
                angle_of_attack: Arinc429Word::new(Angle::default(), SignStatus::NormalOperation),
                computed_airspeed: Arinc429Word::new(
                    Velocity::default(),
                    SignStatus::FailureWarning,
                ),
            }
        }

        fn set_angle_of_attack(&mut self, v: Angle) {
            self.angle_of_attack = Arinc429Word::new(v, SignStatus::NormalOperation);
        }
    }
    impl AdirsMeasurementOutputs for TestAdirs {
        fn is_fully_aligned(&self, _adiru_number: usize) -> bool {
            self.is_aligned
        }

        fn latitude(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
            self.latitude
        }

        fn longitude(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
            self.longitude
        }

        fn heading(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
            self.heading
        }

        fn true_heading(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
            self.heading
        }

        fn vertical_speed(&self, _adiru_number: usize) -> Arinc429Word<Velocity> {
            self.vertical_speed
        }

        fn altitude(&self, _adiru_number: usize) -> Arinc429Word<Length> {
            self.altitude
        }

        fn angle_of_attack(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
            self.angle_of_attack
        }

        fn computed_airspeed(&self, _adiru_number: usize) -> Arinc429Word<Velocity> {
            self.computed_airspeed
        }
    }
    struct A380FlapsTestBed {
        test_bed: SimulationTestBed<A380FlapsTestAircraft>,
    }

    impl A380FlapsTestBed {
        const HYD_TIME_STEP_MILLIS: u64 = 33;

        fn new() -> Self {
            Self {
                test_bed: SimulationTestBed::new(A380FlapsTestAircraft::new),
            }
        }

        fn run_one_tick(mut self) -> Self {
            self.test_bed
                .run_with_delta(Duration::from_millis(Self::HYD_TIME_STEP_MILLIS));
            self
        }

        fn run_waiting_for(mut self, delta: Duration) -> Self {
            self.test_bed.run_multiple_frames(delta);
            self
        }

        fn set_flaps_handle_position(mut self, pos: u8) -> Self {
            self.write_by_name("FLAPS_HANDLE_INDEX", pos as f64);
            self
        }

        fn read_flaps_handle_position(&mut self) -> u8 {
            self.read_by_name("FLAPS_HANDLE_INDEX")
        }

        fn read_slat_flap_system_status_word(&mut self, num: u8) -> Arinc429Word<u32> {
            self.read_by_name(&format!("SFCC_{num}_SLAT_FLAP_SYSTEM_STATUS_WORD"))
        }

        fn read_slat_flap_actual_position_word(&mut self, num: u8) -> Arinc429Word<u32> {
            self.read_by_name(&format!("SFCC_{num}_SLAT_FLAP_ACTUAL_POSITION_WORD"))
        }

        fn read_slat_flap_component_status_word(&mut self, num: u8) -> Arinc429Word<u32> {
            self.read_by_name(&format!("SFCC_{num}_SLAT_FLAP_COMPONENT_STATUS_WORD"))
        }

        fn flap_command(&self, idx: usize) -> Option<ChannelCommand> {
            self.query(|a| a.slat_flap_complex.flap_pcu(idx).get_command_status())
        }

        fn slat_command(&self, idx: usize) -> Option<ChannelCommand> {
            self.query(|a| a.slat_flap_complex.slat_pcu(idx).get_command_status())
        }

        fn set_indicated_airspeed(mut self, indicated_airspeed: f64) -> Self {
            self.write_by_name("AIRSPEED INDICATED", indicated_airspeed);
            self
        }

        fn set_angle_of_attack(mut self, angle_of_attack: Angle) -> Self {
            self.command(|a| a.set_angle_of_attack(angle_of_attack));
            self
        }

        fn set_on_ground(mut self, on_ground: bool) -> Self {
            self.write_by_name("SIM ON GROUND", on_ground);
            self
        }

        fn set_green_hyd_pressure(mut self) -> Self {
            self.write_by_name("HYD_GREEN_PRESSURE", 2500.);
            self
        }

        fn set_blue_hyd_pressure(mut self) -> Self {
            self.write_by_name("HYD_BLUE_PRESSURE", 2500.);
            self
        }

        fn set_yellow_hyd_pressure(mut self) -> Self {
            self.write_by_name("HYD_YELLOW_PRESSURE", 2500.);
            self
        }

        fn get_flaps_demanded_angle(&self, idx: usize) -> f64 {
            self.query(|a| {
                a.slat_flap_complex.sfcc[idx]
                    .flaps_channel
                    .get_demanded_angle()
                    .get::<degree>()
            })
        }

        fn get_slats_demanded_angle(&self, idx: usize) -> f64 {
            self.query(|a| {
                a.slat_flap_complex.sfcc[idx]
                    .slats_channel
                    .get_demanded_angle()
                    .get::<degree>()
            })
        }

        fn get_flaps_conf(&self, num: usize) -> FlapsConf {
            self.query(|a| a.slat_flap_complex.sfcc[num].flaps_conf)
        }

        fn get_flaps_fppu_feedback(&self) -> f64 {
            self.query(|a| a.flap_gear.angle().get::<degree>())
        }

        fn get_slats_fppu_feedback(&self) -> f64 {
            self.query(|a| a.slat_gear.angle().get::<degree>())
        }

        fn get_is_approaching_position(
            &self,
            demanded_angle: Angle,
            feedback_angle: Angle,
        ) -> bool {
            SlatFlapControlComputerMisc::in_positioning_threshold_range(
                demanded_angle,
                feedback_angle,
            )
        }

        fn test_flap_conf(
            &mut self,
            handle_pos: u8,
            flaps_demanded_angle: f64,
            slats_demanded_angle: f64,
            conf: FlapsConf,
            angle_delta: f64,
        ) {
            assert_eq!(self.read_flaps_handle_position(), handle_pos);
            assert_lt!(
                (self.get_flaps_demanded_angle(0) - flaps_demanded_angle).abs(),
                angle_delta
            );
            assert_lt!(
                (self.get_flaps_demanded_angle(1) - flaps_demanded_angle).abs(),
                angle_delta
            );
            assert_lt!(
                (self.get_slats_demanded_angle(0) - slats_demanded_angle).abs(),
                angle_delta
            );
            assert_lt!(
                (self.get_slats_demanded_angle(1) - slats_demanded_angle).abs(),
                angle_delta
            );
            assert_eq!(self.get_flaps_conf(0), conf);
            assert_eq!(self.get_flaps_conf(1), conf);
        }
    }
    impl TestBed for A380FlapsTestBed {
        type Aircraft = A380FlapsTestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<A380FlapsTestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<A380FlapsTestAircraft> {
            &mut self.test_bed
        }
    }

    fn test_bed() -> A380FlapsTestBed {
        A380FlapsTestBed::new()
    }

    fn test_bed_with() -> A380FlapsTestBed {
        test_bed()
    }

    #[test]
    fn flaps_simvars() {
        let test_bed = test_bed_with().run_one_tick();

        assert!(test_bed.contains_variable_with_name("LEFT_FLAPS_ANGLE"));
        assert!(test_bed.contains_variable_with_name("RIGHT_FLAPS_ANGLE"));
        assert!(test_bed.contains_variable_with_name("LEFT_FLAPS_POSITION_PERCENT"));
        assert!(test_bed.contains_variable_with_name("RIGHT_FLAPS_POSITION_PERCENT"));

        assert!(test_bed.contains_variable_with_name("LEFT_SLATS_ANGLE"));
        assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_ANGLE"));
        assert!(test_bed.contains_variable_with_name("LEFT_SLATS_POSITION_PERCENT"));
        assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_POSITION_PERCENT"));

        assert!(test_bed.contains_variable_with_name("FLAPS_CONF_INDEX"));

        assert!(test_bed.contains_variable_with_name("SFCC_1_FLAP_ACTUAL_POSITION_WORD"));
        assert!(test_bed.contains_variable_with_name("SFCC_2_FLAP_ACTUAL_POSITION_WORD"));

        assert!(test_bed.contains_variable_with_name("SFCC_1_SLAT_ACTUAL_POSITION_WORD"));
        assert!(test_bed.contains_variable_with_name("SFCC_2_SLAT_ACTUAL_POSITION_WORD"));

        assert!(test_bed.contains_variable_with_name("SFCC_1_SLAT_FLAP_ACTUAL_POSITION_WORD"));
        assert!(test_bed.contains_variable_with_name("SFCC_2_SLAT_FLAP_ACTUAL_POSITION_WORD"));

        assert!(test_bed.contains_variable_with_name("SFCC_1_SLAT_FLAP_SYSTEM_STATUS_WORD"));
        assert!(test_bed.contains_variable_with_name("SFCC_2_SLAT_FLAP_SYSTEM_STATUS_WORD"));
    }

    #[test]
    fn flaps_approaching_position() {
        let test_bed = test_bed_with().run_one_tick();
        let angle_tolerance = Angle::new::<degree>(6.69);
        let demanded_angle = Angle::new::<degree>(251.);

        let feedback_angle = Angle::new::<degree>(251.);
        assert!(test_bed.get_is_approaching_position(demanded_angle, feedback_angle));

        let feedback_angle = Angle::new::<degree>(250.9) - angle_tolerance;
        assert!(!test_bed.get_is_approaching_position(demanded_angle, feedback_angle));

        let feedback_angle = Angle::new::<degree>(251.1) + angle_tolerance;
        assert!(!test_bed.get_is_approaching_position(demanded_angle, feedback_angle));
    }

    #[test]
    fn flaps_test_correct_bus_output_clean_config() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_yellow_hyd_pressure()
            .set_blue_hyd_pressure()
            .set_indicated_airspeed(160.)
            .set_flaps_handle_position(0)
            .run_one_tick();

        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(17));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(18));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(19));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(20));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(21));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(26));

        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(17));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(18));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(19));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(20));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(21));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(26));

        test_bed = test_bed.run_waiting_for(Duration::from_secs(10));

        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(12));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(13));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(14));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(15));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(19));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(20));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(21));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(22));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(23));

        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(12));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(13));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(14));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(15));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(19));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(20));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(21));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(22));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(23));
    }

    #[test]
    fn flaps_test_correct_bus_output_config_1() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_yellow_hyd_pressure()
            .set_blue_hyd_pressure()
            .set_indicated_airspeed(215.)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(17));
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(18));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(19));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(20));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(21));
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(26));

        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(17));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(18));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(19));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(20));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(21));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(26));

        test_bed = test_bed.run_waiting_for(Duration::from_secs(60));

        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(12));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(13));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(14));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(15));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(19));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(20));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(21));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(22));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(23));

        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(12));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(13));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(14));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(15));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(19));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(20));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(21));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(22));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(23));
    }

    #[test]
    fn flaps_test_correct_bus_output_config_1_plus_f() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_yellow_hyd_pressure()
            .set_blue_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(17));
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(18));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(19));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(20));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(21));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(26));

        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(17));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(18));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(19));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(20));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(21));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(26));

        test_bed = test_bed.run_waiting_for(Duration::from_secs(60));

        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(12));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(13));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(14));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(15));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(19));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(20));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(21));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(22));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(23));

        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(12));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(13));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(14));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(15));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(19));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(20));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(21));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(22));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(23));
    }

    #[test]
    fn flaps_test_correct_bus_output_config_2() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_yellow_hyd_pressure()
            .set_blue_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_flaps_handle_position(2)
            .run_one_tick();

        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(17));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(18));
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(19));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(20));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(21));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(26));

        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(17));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(18));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(19));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(20));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(21));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(26));

        test_bed = test_bed.run_waiting_for(Duration::from_secs(60));

        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(12));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(13));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(14));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(15));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(19));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(20));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(21));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(22));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(23));

        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(12));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(13));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(14));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(15));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(19));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(20));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(21));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(22));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(23));
    }

    #[test]
    fn flaps_test_correct_bus_output_config_3() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_yellow_hyd_pressure()
            .set_blue_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_flaps_handle_position(3)
            .run_one_tick();

        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(17));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(18));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(19));
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(20));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(21));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(26));

        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(17));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(18));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(19));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(20));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(21));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(26));

        test_bed = test_bed.run_waiting_for(Duration::from_secs(60));

        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(12));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(13));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(14));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(15));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(19));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(20));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(21));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(22));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(23));

        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(12));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(13));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(14));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(15));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(19));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(20));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(21));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(22));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(23));
    }

    #[test]
    fn flaps_test_correct_bus_output_config_full() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_yellow_hyd_pressure()
            .set_blue_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_flaps_handle_position(4)
            .run_one_tick();

        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(17));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(18));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(19));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(20));
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(21));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(26));

        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(17));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(18));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(19));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(20));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(21));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(26));

        test_bed = test_bed.run_waiting_for(Duration::from_secs(60));

        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(12));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(13));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(14));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(15));
        assert!(!test_bed.read_slat_flap_actual_position_word(1).get_bit(19));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(20));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(21));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(22));
        assert!(test_bed.read_slat_flap_actual_position_word(1).get_bit(23));

        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(12));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(13));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(14));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(15));
        assert!(!test_bed.read_slat_flap_actual_position_word(2).get_bit(19));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(20));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(21));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(22));
        assert!(test_bed.read_slat_flap_actual_position_word(2).get_bit(23));
    }

    // Tests flaps configuration and angles for regular
    // increasing handle transitions, i.e 0->1->2->3->4 in sequence
    // below 205 knots
    #[test]
    fn flaps_test_regular_handle_increase_transitions_flaps_target_airspeed_below_205() {
        let angle_delta: f64 = 0.1;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(160.)
            .run_one_tick();

        test_bed.test_flap_conf(0, 0., 0., FlapsConf::Conf0, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();

        test_bed.test_flap_conf(1, 215.68, 286.48, FlapsConf::Conf1F, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(2).run_one_tick();

        test_bed.test_flap_conf(2, 259.28, 286.48, FlapsConf::Conf2, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();

        test_bed.test_flap_conf(3, 297.59, 327.39, FlapsConf::Conf3, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();

        test_bed.test_flap_conf(4, 338.99, 327.39, FlapsConf::ConfFull, angle_delta);
    }

    // Tests flaps configuration and angles for regular
    // increasing handle transitions, i.e 0->1->2->3->4 in sequence
    // above 205 knots
    #[test]
    fn flaps_test_regular_handle_increase_transitions_flaps_target_airspeed_above_205() {
        let angle_delta: f64 = 0.1;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(215.)
            .run_one_tick();

        test_bed.test_flap_conf(0, 0., 0., FlapsConf::Conf0, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();

        test_bed.test_flap_conf(1, 0., 286.48, FlapsConf::Conf1, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(2).run_one_tick();

        test_bed.test_flap_conf(2, 259.28, 286.48, FlapsConf::Conf2, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();

        test_bed.test_flap_conf(3, 259.28, 327.39, FlapsConf::Conf2S, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();

        test_bed.test_flap_conf(4, 297.59, 327.39, FlapsConf::Conf3, angle_delta);
    }

    //Tests regular transition 2->1 below and above 212 knots
    #[test]
    fn flaps_test_regular_handle_transition_pos_2_to_1() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(150.)
            .set_flaps_handle_position(2)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed
            .set_indicated_airspeed(220.)
            .set_flaps_handle_position(2)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);
    }

    //Tests transition between Conf1F to Conf1 above 212 knots
    #[test]
    fn flaps_test_regular_handle_transition_pos_1_to_1() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(50.)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed.set_indicated_airspeed(150.).run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed.set_indicated_airspeed(220.).run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);
    }

    // Tests flaps configuration and angles for regular
    // decreasing handle transitions, i.e 4->3->2->1->0 in sequence
    // below 212 knots
    #[test]
    fn flaps_test_regular_decrease_handle_transition_flaps_target_airspeed_below_212() {
        let angle_delta: f64 = 0.1;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(160.)
            .run_one_tick();

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();

        test_bed.test_flap_conf(4, 338.99, 327.39, FlapsConf::ConfFull, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();

        test_bed.test_flap_conf(3, 297.59, 327.39, FlapsConf::Conf3, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(2).run_one_tick();

        test_bed.test_flap_conf(2, 259.28, 286.48, FlapsConf::Conf2, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();

        test_bed.test_flap_conf(1, 215.68, 286.48, FlapsConf::Conf1F, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();

        test_bed.test_flap_conf(0, 0., 0., FlapsConf::Conf0, angle_delta);
    }

    // Tests flaps configuration and angles for regular
    // decreasing handle transitions, i.e 4->3->2->1->0 in sequence
    // above 210 knots
    #[test]
    fn flaps_test_regular_decrease_handle_transition_flaps_target_airspeed_above_212() {
        let angle_delta: f64 = 0.1;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(220.)
            .run_one_tick();

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();

        test_bed.test_flap_conf(4, 338.99, 327.39, FlapsConf::ConfFull, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();

        test_bed.test_flap_conf(3, 297.59, 327.39, FlapsConf::Conf3, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(2).run_one_tick();

        test_bed.test_flap_conf(2, 259.28, 286.48, FlapsConf::Conf2, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();

        test_bed.test_flap_conf(1, 0., 286.48, FlapsConf::Conf1, angle_delta);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();

        test_bed.test_flap_conf(0, 0., 0., FlapsConf::Conf0, angle_delta);
    }

    //The few tests that follow test irregular transitions
    //e.g. direct from 0 to 3 or direct from 4 to 0.
    //This is possible in the simulator, but obviously
    //not possible in real life. An irregular transition from x = 2,3,4
    // to y = 0,1 should behave like a sequential transition.
    #[test]
    fn flaps_test_irregular_handle_transition_init_pos_0() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_flaps_handle_position(0)
            .run_one_tick();

        test_bed = test_bed.set_flaps_handle_position(2).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F); // alpha lock
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F); // alpha lock

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F); // alpha lock
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F); // alpha lock

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed
            .set_indicated_airspeed(160.)
            .set_flaps_handle_position(0)
            .run_one_tick();

        test_bed = test_bed.set_flaps_handle_position(2).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf0);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf0);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed
            .set_indicated_airspeed(220.)
            .set_flaps_handle_position(0)
            .run_one_tick();

        test_bed = test_bed.set_flaps_handle_position(2).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf0);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf0);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);
    }

    #[test]
    fn flaps_test_irregular_handle_transition_init_pos_1() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(210.)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(205.)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(220.)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);

        test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(220.)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);
    }

    #[test]
    fn flaps_test_irregular_handle_transition_init_pos_2() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_flaps_handle_position(2)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed.set_flaps_handle_position(2).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_flaps_handle_position(2)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F); // alpha lock
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F); // alpha lock

        test_bed = test_bed.set_flaps_handle_position(2).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);
    }

    #[test]
    fn flaps_test_irregular_handle_transition_init_pos_3() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(205.)
            .set_flaps_handle_position(3)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(220.)
            .set_flaps_handle_position(3)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_flaps_handle_position(3)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F); // alpha lock
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F); // alpha lock

        test_bed = test_bed.set_flaps_handle_position(3).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);
    }

    #[test]
    fn flaps_test_irregular_handle_transition_init_pos_4() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(205.)
            .set_flaps_handle_position(4)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(220.)
            .set_flaps_handle_position(4)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed.set_flaps_handle_position(1).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_flaps_handle_position(4)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F); // alpha lock
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F); // alpha lock

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);

        test_bed = test_bed.set_flaps_handle_position(2).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed.set_flaps_handle_position(4).run_one_tick();
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::ConfFull);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::ConfFull);
    }

    #[test]
    fn flaps_test_movement_0_to_1f() {
        let angle_delta = 0.2;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(0)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf0);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);

        test_bed = test_bed
            .set_flaps_handle_position(1)
            .run_waiting_for(Duration::from_secs(20));

        assert!(
            (test_bed.get_flaps_fppu_feedback() - test_bed.get_flaps_demanded_angle(0)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_flaps_fppu_feedback() - test_bed.get_flaps_demanded_angle(1)).abs()
                <= angle_delta
        );
    }

    #[test]
    fn flaps_test_movement_1f_to_2() {
        let angle_delta = 0.2;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(35));

        assert!(
            (test_bed.get_flaps_fppu_feedback() - test_bed.get_flaps_demanded_angle(0)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_flaps_fppu_feedback() - test_bed.get_flaps_demanded_angle(1)).abs()
                <= angle_delta
        );
    }

    #[test]
    fn flaps_test_movement_2_to_3() {
        let angle_delta = 0.2;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(2)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed
            .set_flaps_handle_position(3)
            .run_waiting_for(Duration::from_secs(30));

        assert!(
            (test_bed.get_flaps_fppu_feedback() - test_bed.get_flaps_demanded_angle(0)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_flaps_fppu_feedback() - test_bed.get_flaps_demanded_angle(1)).abs()
                <= angle_delta
        );
    }

    #[test]
    fn flaps_test_movement_3_to_full() {
        let angle_delta = 0.2;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(3)
            .run_waiting_for(Duration::from_secs(20));

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed
            .set_flaps_handle_position(4)
            .run_waiting_for(Duration::from_secs(20));

        assert!(
            (test_bed.get_flaps_fppu_feedback() - test_bed.get_flaps_demanded_angle(0)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_flaps_fppu_feedback() - test_bed.get_flaps_demanded_angle(1)).abs()
                <= angle_delta
        );
    }

    #[test]
    fn slats_test_movement_0_to_1f() {
        let angle_delta = 0.2;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(0)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf0);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);

        test_bed = test_bed
            .set_flaps_handle_position(1)
            .run_waiting_for(Duration::from_secs(60));

        assert!(
            (test_bed.get_slats_fppu_feedback() - test_bed.get_slats_demanded_angle(0)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_slats_fppu_feedback() - test_bed.get_slats_demanded_angle(1)).abs()
                <= angle_delta
        );
    }

    #[test]
    fn slats_and_flaps_test_movement_0_to_1() {
        let angle_delta = 0.2;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_blue_hyd_pressure()
            .set_indicated_airspeed(220.)
            .set_flaps_handle_position(0)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf0);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);

        test_bed = test_bed
            .set_flaps_handle_position(1)
            .run_waiting_for(Duration::from_secs(60));

        assert!(
            (test_bed.get_flaps_fppu_feedback() - test_bed.get_flaps_demanded_angle(0)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_flaps_fppu_feedback() - test_bed.get_flaps_demanded_angle(1)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_slats_fppu_feedback() - test_bed.get_slats_demanded_angle(0)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_slats_fppu_feedback() - test_bed.get_slats_demanded_angle(1)).abs()
                <= angle_delta
        );
    }

    #[test]
    fn slats_test_movement_1f_to_2() {
        let angle_delta = 0.2;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);

        test_bed = test_bed
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(60));

        assert!(
            (test_bed.get_slats_fppu_feedback() - test_bed.get_slats_demanded_angle(0)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_slats_fppu_feedback() - test_bed.get_slats_demanded_angle(1)).abs()
                <= angle_delta
        );
    }

    #[test]
    fn slats_test_movement_2_to_3() {
        let angle_delta = 0.2;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(2)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2);

        test_bed = test_bed
            .set_flaps_handle_position(3)
            .run_waiting_for(Duration::from_secs(60));

        assert!(
            (test_bed.get_slats_fppu_feedback() - test_bed.get_slats_demanded_angle(0)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_slats_fppu_feedback() - test_bed.get_slats_demanded_angle(1)).abs()
                <= angle_delta
        );
    }

    #[test]
    fn slats_test_movement_3_to_full() {
        let angle_delta = 0.2;
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(3)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);

        test_bed = test_bed
            .set_flaps_handle_position(4)
            .run_waiting_for(Duration::from_secs(50));

        assert!(
            (test_bed.get_slats_fppu_feedback() - test_bed.get_slats_demanded_angle(0)).abs()
                <= angle_delta
        );
        assert!(
            (test_bed.get_slats_fppu_feedback() - test_bed.get_slats_demanded_angle(1)).abs()
                <= angle_delta
        );
    }

    #[test]
    fn config_test_flrs_full() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(186.)
            .set_flaps_handle_position(0)
            .run_one_tick();

        test_bed = test_bed
            .set_flaps_handle_position(4)
            .run_waiting_for(Duration::from_secs(50));

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf3);
    }

    #[test]
    fn config_test_flrs_3() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(200.)
            .set_flaps_handle_position(0)
            .run_one_tick();

        test_bed = test_bed
            .set_flaps_handle_position(3)
            .run_waiting_for(Duration::from_secs(50));

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf2S);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf2S);
    }

    #[test]
    fn config_test_flrs_2() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(224.)
            .set_flaps_handle_position(0)
            .run_one_tick();

        test_bed = test_bed
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(50));

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);
    }

    #[test]
    fn config_test_cruise_baulk() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(280.)
            .set_on_ground(false)
            .set_flaps_handle_position(0)
            .run_one_tick();

        test_bed = test_bed
            .set_flaps_handle_position(1)
            .run_waiting_for(Duration::from_secs(20));

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf0);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(25));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(25));
    }

    #[test]
    fn config_test_no_cruise_baulk_when_overspeed_conf1() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(220.)
            .set_on_ground(false)
            .set_flaps_handle_position(1)
            .run_one_tick();

        test_bed = test_bed
            .set_indicated_airspeed(270.)
            .run_waiting_for(Duration::from_secs(20));

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1);
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(25));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(25));
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(26));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(26));
    }

    #[test]
    fn config_test_alpha_lock_speed() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(130.)
            .set_angle_of_attack(Angle::new::<degree>(5.))
            .set_on_ground(false)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(24));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(24));

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(24));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(24));

        test_bed = test_bed.set_indicated_airspeed(200.).run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf0);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(24));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(24));
    }

    #[test]
    fn config_test_alpha_lock_aoa() {
        let mut test_bed = test_bed_with()
            .set_green_hyd_pressure()
            .set_indicated_airspeed(200.)
            .set_angle_of_attack(Angle::new::<degree>(10.))
            .set_on_ground(false)
            .set_flaps_handle_position(1)
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(24));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(24));

        test_bed = test_bed.set_flaps_handle_position(0).run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(24));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(24));

        test_bed = test_bed
            .set_angle_of_attack(Angle::new::<degree>(9.1))
            .run_one_tick();

        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf0);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(24));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(24));
    }

    // F/CTL FLAP SYS 1(2) FAULT and SLAT SYS 1(2) FAULT: the failed channel no longer drives its motor, the other SFCC
    // still does (half speed), and the SFCC reports the fault in its status word (label 046 bit 12 flaps, bit 11 slats)
    // that the FWS reads.
    #[test]
    fn flap_channel_failure_stops_its_motor_and_reports_a_flap_fault() {
        let mut test_bed = test_bed_with()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(0)
            .run_one_tick();
        test_bed.fail(FailureType::SlatFlapControlComputerFlapChannel(2));
        test_bed = test_bed
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(1));

        assert_eq!(
            test_bed.query(|a| a.slat_flap_complex.flap_pcu(1).get_command_status()),
            None
        );
        assert_eq!(
            test_bed.query(|a| a.slat_flap_complex.flap_pcu(1).get_pob_status()),
            SolenoidStatus::DeEnergised
        );
        assert_eq!(
            test_bed.query(|a| a.slat_flap_complex.flap_pcu(0).get_command_status()),
            Some(ChannelCommand::Extend)
        );
        assert_eq!(
            test_bed.query(|a| a.slat_flap_complex.slat_pcu(1).get_command_status()),
            Some(ChannelCommand::Extend)
        );

        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(12));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(11));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(12));
    }

    #[test]
    fn slat_channel_failure_stops_its_motor_and_reports_a_slat_fault() {
        let mut test_bed = test_bed_with()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(0)
            .run_one_tick();
        test_bed.fail(FailureType::SlatFlapControlComputerSlatChannel(1));
        test_bed = test_bed
            .set_flaps_handle_position(1)
            .run_waiting_for(Duration::from_secs(1));

        assert_eq!(
            test_bed.query(|a| a.slat_flap_complex.slat_pcu(0).get_command_status()),
            None
        );
        assert_eq!(
            test_bed.query(|a| a.slat_flap_complex.slat_pcu(0).get_pob_status()),
            SolenoidStatus::DeEnergised
        );
        assert_eq!(
            test_bed.query(|a| a.slat_flap_complex.slat_pcu(1).get_command_status()),
            Some(ChannelCommand::Extend)
        );

        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(11));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(12));
        assert!(!test_bed.read_slat_flap_system_status_word(2).get_bit(11));
    }

    #[test]
    fn no_slat_or_flap_fault_without_a_channel_failure() {
        let mut test_bed = test_bed_with()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(1));

        for num in 1..=2 {
            assert!(!test_bed.read_slat_flap_system_status_word(num).get_bit(11));
            assert!(!test_bed.read_slat_flap_system_status_word(num).get_bit(12));
        }
        assert_eq!(
            test_bed.query(|a| a.slat_flap_complex.flap_pcu(1).get_command_status()),
            Some(ChannelCommand::Extend)
        );
    }

    fn on_ground_with_flaps_lever_at(position: u8) -> A380FlapsTestBed {
        test_bed_with()
            .set_indicated_airspeed(0.)
            .set_on_ground(true)
            .set_flaps_handle_position(position)
            .run_one_tick()
    }

    // F/CTL FLAP(SLAT) CTL 1(2) FAULT: the other control unit drives both motors, the surfaces keep their normal speed
    #[test]
    fn flap_control_unit_failure_lets_the_other_unit_drive_both_flap_motors() {
        let mut test_bed = on_ground_with_flaps_lever_at(0);
        test_bed.fail(FailureType::SlatFlapControlComputerFlapControlUnit(1));
        test_bed = test_bed
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(1));

        assert_eq!(test_bed.flap_command(0), Some(ChannelCommand::Extend));
        assert_eq!(test_bed.flap_command(1), Some(ChannelCommand::Extend));
        assert!(test_bed.read_slat_flap_component_status_word(1).get_bit(12));
        assert!(!test_bed.read_slat_flap_component_status_word(1).get_bit(11));
        assert!(!test_bed.read_slat_flap_component_status_word(2).get_bit(12));
        for num in 1..=2 {
            assert!(!test_bed.read_slat_flap_system_status_word(num).get_bit(12));
        }
    }

    #[test]
    fn slat_control_unit_failure_lets_the_other_unit_drive_both_slat_motors() {
        let mut test_bed = on_ground_with_flaps_lever_at(0);
        test_bed.fail(FailureType::SlatFlapControlComputerSlatControlUnit(2));
        test_bed = test_bed
            .set_flaps_handle_position(1)
            .run_waiting_for(Duration::from_secs(1));

        assert_eq!(test_bed.slat_command(0), Some(ChannelCommand::Extend));
        assert_eq!(test_bed.slat_command(1), Some(ChannelCommand::Extend));
        assert!(test_bed.read_slat_flap_component_status_word(2).get_bit(11));
        assert!(!test_bed.read_slat_flap_component_status_word(1).get_bit(11));
        for num in 1..=2 {
            assert!(!test_bed.read_slat_flap_system_status_word(num).get_bit(11));
        }
    }

    // F/CTL FLAP SYS 1+2 FAULT: both flap control units are failed
    #[test]
    fn both_flap_control_units_failed_stop_the_flaps_and_report_both_flap_faults() {
        let mut test_bed = on_ground_with_flaps_lever_at(0);
        test_bed.fail(FailureType::SlatFlapControlComputerFlapControlUnit(1));
        test_bed.fail(FailureType::SlatFlapControlComputerFlapControlUnit(2));
        test_bed = test_bed
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(1));

        assert_eq!(test_bed.flap_command(0), None);
        assert_eq!(test_bed.flap_command(1), None);
        assert_eq!(test_bed.slat_command(0), Some(ChannelCommand::Extend));
        for num in 1..=2 {
            assert!(test_bed.read_slat_flap_system_status_word(num).get_bit(12));
        }
    }

    // F/CTL FLAPS LEVER SYS 1(2) FAULT: the slat and flap systems of that SFCC stop, the other SFCC moves the
    // surfaces at half speed
    #[test]
    fn flaps_lever_link_failure_stops_the_slat_and_flap_systems_of_that_sfcc() {
        let mut test_bed = on_ground_with_flaps_lever_at(0);
        test_bed.fail(FailureType::FlapsLeverLink(1));
        test_bed = test_bed
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(1));

        assert_eq!(test_bed.flap_command(0), None);
        assert_eq!(test_bed.slat_command(0), None);
        assert_eq!(test_bed.flap_command(1), Some(ChannelCommand::Extend));
        assert_eq!(test_bed.slat_command(1), Some(ChannelCommand::Extend));
        assert!(test_bed.read_slat_flap_component_status_word(1).get_bit(13));
        assert!(!test_bed.read_slat_flap_component_status_word(2).get_bit(13));

        let sfcc1_status = test_bed.read_slat_flap_system_status_word(1);
        assert!((17..=21).all(|lever_bit| !sfcc1_status.get_bit(lever_bit)));
        assert!(!sfcc1_status.get_bit(11));
        assert!(!sfcc1_status.get_bit(12));
        assert!(test_bed.read_slat_flap_system_status_word(2).get_bit(19));
    }

    #[test]
    fn flaps_conf_index_follows_the_sfcc_that_receives_the_lever() {
        let mut test_bed = on_ground_with_flaps_lever_at(0);
        test_bed.fail(FailureType::FlapsLeverLink(2));
        test_bed = test_bed
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(1));

        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf0);
        let flaps_conf_index: u8 = test_bed.read_by_name("FLAPS_CONF_INDEX");
        assert_eq!(flaps_conf_index, FlapsConf::Conf2 as u8);
    }

    #[test]
    fn flaps_lever_out_of_detent_time_counts_each_frame_once_when_updated_twice_per_frame() {
        let mut test_bed = on_ground_with_flaps_lever_at(1);
        test_bed.command(|a| a.updates_per_frame = 2);
        test_bed.fail(FailureType::FlapsLeverOutOfDetent);

        test_bed = test_bed.run_waiting_for(Duration::from_secs(6));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(27));

        test_bed = test_bed.run_waiting_for(Duration::from_secs(5));
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(27));
    }

    // F/CTL FLAPS LEVER OUT OF DETENT: reported after 10 s between two detents, the SFCCs keep their configuration
    #[test]
    fn flaps_lever_out_of_detent_holds_the_configuration_and_is_reported_after_10_s() {
        let mut test_bed = on_ground_with_flaps_lever_at(1).run_waiting_for(Duration::from_secs(1));
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);

        test_bed.fail(FailureType::FlapsLeverOutOfDetent);
        test_bed = test_bed
            .set_flaps_handle_position(3)
            .run_waiting_for(Duration::from_secs(5));
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf1F);
        assert_eq!(test_bed.get_flaps_conf(1), FlapsConf::Conf1F);
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(27));

        test_bed = test_bed.run_waiting_for(Duration::from_secs(6));
        for num in 1..=2 {
            assert!(test_bed.read_slat_flap_system_status_word(num).get_bit(27));
        }

        test_bed.unfail(FailureType::FlapsLeverOutOfDetent);
        test_bed = test_bed.run_one_tick();
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(27));
        assert_eq!(test_bed.get_flaps_conf(0), FlapsConf::Conf3);
    }

    // F/CTL FLAPS (SLATS) LOCKED: the wing tip brakes lock the surfaces while they are driven with an asymmetry
    #[test]
    fn flap_asymmetry_locks_the_flaps_until_on_ground_without_asymmetry() {
        let mut test_bed = on_ground_with_flaps_lever_at(0).set_on_ground(false);
        test_bed.fail(FailureType::FlapTransmissionAsymmetry);
        test_bed = test_bed
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(1));

        assert_eq!(test_bed.flap_command(0), None);
        assert_eq!(test_bed.flap_command(1), None);
        assert_eq!(test_bed.slat_command(0), Some(ChannelCommand::Extend));
        for num in 1..=2 {
            assert!(test_bed.read_slat_flap_system_status_word(num).get_bit(16));
            assert!(!test_bed.read_slat_flap_system_status_word(num).get_bit(15));
            assert!(test_bed
                .read_slat_flap_actual_position_word(num)
                .get_bit(24));
            assert!(!test_bed.read_slat_flap_system_status_word(num).get_bit(12));
        }

        test_bed.unfail(FailureType::FlapTransmissionAsymmetry);
        test_bed = test_bed.run_waiting_for(Duration::from_secs(1));
        assert!(test_bed.read_slat_flap_system_status_word(1).get_bit(16));

        test_bed = test_bed
            .set_on_ground(true)
            .run_waiting_for(Duration::from_secs(1));
        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(16));
        assert_eq!(test_bed.flap_command(0), Some(ChannelCommand::Extend));
    }

    #[test]
    fn slat_asymmetry_engages_the_slat_wing_tip_brakes() {
        let mut test_bed = on_ground_with_flaps_lever_at(0);
        test_bed.fail(FailureType::SlatTransmissionAsymmetry);
        test_bed = test_bed
            .set_flaps_handle_position(1)
            .run_waiting_for(Duration::from_secs(1));

        assert_eq!(test_bed.slat_command(0), None);
        assert_eq!(test_bed.slat_command(1), None);
        for num in 1..=2 {
            assert!(test_bed.read_slat_flap_system_status_word(num).get_bit(15));
            assert!(test_bed
                .read_slat_flap_actual_position_word(num)
                .get_bit(16));
        }
    }

    #[test]
    fn asymmetry_does_not_engage_the_wing_tip_brakes_with_one_flap_control_unit_failed() {
        let mut test_bed = on_ground_with_flaps_lever_at(0);
        test_bed.fail(FailureType::SlatFlapControlComputerFlapControlUnit(2));
        test_bed.fail(FailureType::FlapTransmissionAsymmetry);
        test_bed = test_bed
            .set_flaps_handle_position(2)
            .run_waiting_for(Duration::from_secs(1));

        assert!(!test_bed.read_slat_flap_system_status_word(1).get_bit(16));
        assert_eq!(test_bed.flap_command(0), Some(ChannelCommand::Extend));
    }

    #[test]
    fn no_component_fault_without_a_failure() {
        let mut test_bed =
            on_ground_with_flaps_lever_at(2).run_waiting_for(Duration::from_secs(11));

        for num in 1..=2 {
            let component_status = test_bed.read_slat_flap_component_status_word(num);
            assert!((11..=13).all(|bit| !component_status.get_bit(bit)));
            let system_status = test_bed.read_slat_flap_system_status_word(num);
            assert!(!system_status.get_bit(15));
            assert!(!system_status.get_bit(16));
            assert!(!system_status.get_bit(27));
        }
    }
}
