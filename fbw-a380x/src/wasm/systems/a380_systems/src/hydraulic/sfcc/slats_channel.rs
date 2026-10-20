use systems::{
    failures::{Failure, FailureType},
    hydraulic::flap_slat::{ChannelCommand, SolenoidStatus, ValveBlock},
    shared::PositionPickoffUnit,
    simulation::{SimulationElement, SimulationElementVisitor},
};
use uom::si::{angle::degree, f64::*};

use super::{system_control::SystemControl, FlapsConf, SlatFlapControlComputerMisc};

pub(super) struct SlatsChannel {
    demanded_angle: Angle,
    feedback_angle: Angle,

    /// The flyPad failure of this slat channel: the slat system is failed, only one slat motor remains and the slats
    /// operate at half speed (F/CTL SLAT SYS 1(2) FAULT)
    motor_control_failure: Failure,
    control: SystemControl,
}
impl SlatsChannel {
    pub(super) fn new(num: usize) -> Self {
        Self {
            demanded_angle: Angle::new::<degree>(0.),
            feedback_angle: Angle::new::<degree>(0.),
            motor_control_failure: Failure::new(FailureType::SlatFlapControlComputerSlatChannel(
                num,
            )),
            control: SystemControl::new(FailureType::SlatFlapControlComputerSlatControlUnit(num)),
        }
    }

    /// The slat system no longer drives its motor: the channel lost the control of the motor (flyPad failure), or both
    /// slat control units are failed. It keeps sending its labels and reports the fault in the slat/flap system
    /// status word (label 046 bit 11), read by the FWS (FwsCore slatSys1(2)Fault).
    pub(super) fn is_failed(&self) -> bool {
        self.motor_control_failure.is_active() || self.control.no_control_unit_left()
    }

    pub(super) fn control(&self) -> &SystemControl {
        &self.control
    }

    pub(super) fn control_mut(&mut self) -> &mut SystemControl {
        &mut self.control
    }

    fn drives_its_motor(&self) -> bool {
        !self.is_failed() && !self.control.stops_the_motor()
    }

    // Returns a slat demanded angle in FPPU reference degree (feedback sensor)
    // Interpolated from A320 FPPU references, assuming we're using the A320 FPPU
    fn demanded_slats_fppu_angle_from_conf(flap_conf: FlapsConf) -> Angle {
        match flap_conf {
            FlapsConf::Conf0 => Angle::new::<degree>(0.),
            FlapsConf::Conf1 => Angle::new::<degree>(286.48),
            FlapsConf::Conf1F => Angle::new::<degree>(286.48),
            FlapsConf::Conf2 => Angle::new::<degree>(286.48),
            FlapsConf::Conf2S => Angle::new::<degree>(327.39),
            FlapsConf::Conf3 => Angle::new::<degree>(327.39),
            FlapsConf::ConfFull => Angle::new::<degree>(327.39),
        }
    }

    pub(super) fn update(
        &mut self,
        flaps_conf: FlapsConf,
        feedback_position: &impl PositionPickoffUnit,
    ) {
        self.demanded_angle = Self::demanded_slats_fppu_angle_from_conf(flaps_conf);
        self.feedback_angle = feedback_position.angle();
    }

    pub(super) fn get_demanded_angle(&self) -> Angle {
        self.demanded_angle
    }

    pub(super) fn get_feedback_angle(&self) -> Angle {
        self.feedback_angle
    }
}
// When the POB (Pressure OFF Brake) solenoid is energised, then the hydraulic motors are allowed to move.
// When the POB solenoid is de-energised (due to SFCC command or no SFCC power), then the hydraulic motors
// are held in position and can't move.
impl ValveBlock for SlatsChannel {
    fn get_pob_status(&self) -> SolenoidStatus {
        if !self.drives_its_motor() {
            return SolenoidStatus::DeEnergised;
        }

        let demanded_angle = self.get_demanded_angle();
        let feedback_angle = self.get_feedback_angle();
        let in_target_position =
            SlatFlapControlComputerMisc::in_target_threshold_range(demanded_angle, feedback_angle);
        match in_target_position {
            true => SolenoidStatus::DeEnergised,
            false => SolenoidStatus::Energised,
        }
    }

    fn get_command_status(&self) -> Option<ChannelCommand> {
        if !self.drives_its_motor() {
            return None;
        }

        let demanded_angle = self.get_demanded_angle();
        let feedback_angle = self.get_feedback_angle();
        let in_target_position = SlatFlapControlComputerMisc::in_positioning_threshold_range(
            demanded_angle,
            feedback_angle,
        );
        if in_target_position {
            None
        } else if demanded_angle > feedback_angle {
            Some(ChannelCommand::Extend)
        } else {
            Some(ChannelCommand::Retract)
        }
    }
}
impl SimulationElement for SlatsChannel {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.motor_control_failure.accept(visitor);
        self.control.accept(visitor);
        visitor.visit(self);
    }
}
