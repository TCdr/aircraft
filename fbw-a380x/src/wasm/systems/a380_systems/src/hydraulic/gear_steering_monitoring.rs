//! Landing gear and steering monitoring of the A380 that the LGCIUs and the hydraulic model do not cover: the L/G
//! retraction configuration (L/G RETRACTION FAULT), the uplock, bogie position and gravity extension faults of the
//! LGCIS, and the nose wheel steering angle limit.
//!
//! The model has one nose gear and one main gear assembly per side (each stands for its wing and body gears), so the
//! uplock faults exist three times and the bogie position fault once.

use systems::{
    failures::{Failure, FailureType},
    hydraulic::landing_gear::GearGravityExtension,
    shared::{LgciuGearExtension, LgciuWeightOnWheels},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};
use uom::si::{angle::degree, f64::*};

/// The gears of the uplock faults: nose, left main and right main gear groups
const UPLOCK_GEARS: usize = 3;

pub struct A380GearSteeringMonitoring {
    uplock_fault_id: VariableIdentifier,
    bogie_position_fault_id: VariableIdentifier,
    gravity_extension_fault_id: VariableIdentifier,
    retraction_inhibited_id: VariableIdentifier,
    retraction_fault_id: VariableIdentifier,
    nose_wheel_angle_limit_exceeded_id: VariableIdentifier,

    uplock_closed_failures: [Failure; UPLOCK_GEARS],
    bogie_position_failure: Failure,
    gravity_extension_failure: Failure,

    uplock_fault: bool,
    bogie_position_fault: bool,
    retraction_inhibited: bool,
    retraction_fault: bool,
    nose_wheel_angle_limit_exceeded: bool,
}
impl A380GearSteeringMonitoring {
    /// Design choice: no published tolerance. Above the 6 degrees that the rudder pedals and the autopilot can command,
    /// so that the pedal steering left in the model after lift-off never inhibits the retraction.
    const NOSE_WHEEL_CENTRED_MAX_ANGLE_DEGREES: f64 = 7.;

    /// The nose wheel steering angle limit of the towing (N/W STEER ANGLE LIMIT EXCEEDED)
    const NOSE_WHEEL_ANGLE_LIMIT_DEGREES: f64 = 73.5;

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            uplock_fault_id: context.get_identifier("LG_UPLOCK_FAULT".to_owned()),
            bogie_position_fault_id: context.get_identifier("LG_BOGIE_POSITION_FAULT".to_owned()),
            gravity_extension_fault_id: context.get_identifier("LG_GRVTY_EXTN_FAULT".to_owned()),
            retraction_inhibited_id: context.get_identifier("LG_RETRACTION_INHIBITED".to_owned()),
            retraction_fault_id: context.get_identifier("LG_RETRACTION_FAULT".to_owned()),
            nose_wheel_angle_limit_exceeded_id: context
                .get_identifier("STEERING_NWS_ANGLE_LIMIT_EXCEEDED".to_owned()),

            uplock_closed_failures: [1, 2, 3]
                .map(|gear| Failure::new(FailureType::GearUplockClosed(gear))),
            bogie_position_failure: Failure::new(FailureType::GearBogiePosition),
            gravity_extension_failure: Failure::new(FailureType::GearGravityExtension),

            uplock_fault: false,
            bogie_position_fault: false,
            retraction_inhibited: false,
            retraction_fault: false,
            nose_wheel_angle_limit_exceeded: false,
        }
    }

    /// `gear_lever_down`: the position of the gear lever itself (not the one the LGCIUs take while the retraction is
    /// inhibited)
    pub fn update(
        &mut self,
        lgciu: &(impl LgciuGearExtension + LgciuWeightOnWheels),
        gear_lever_down: bool,
        nose_wheel_angle: Angle,
        body_wheel_steering_locked: bool,
    ) {
        let main_gears_downlocked = lgciu.main_down_and_locked();
        let gears_downlocked = [
            lgciu.nose_down_and_locked(),
            main_gears_downlocked,
            main_gears_downlocked,
        ];
        self.uplock_fault = self
            .uplock_closed_failures
            .iter()
            .zip(gears_downlocked)
            .any(|(failure, downlocked)| failure.is_active() && downlocked);
        // Design choice: a gear down since the start counts as extended, so the fault shows on the ground as well
        self.bogie_position_fault =
            self.bogie_position_failure.is_active() && main_gears_downlocked;

        let in_retraction_configuration = Self::in_retraction_configuration(
            lgciu.left_and_right_gear_extended(false) && lgciu.nose_gear_extended(false),
            nose_wheel_angle,
            body_wheel_steering_locked,
            self.bogie_position_fault || self.uplock_fault,
        );
        self.retraction_inhibited = Self::retraction_inhibited(
            self.retraction_inhibited,
            gear_lever_down,
            lgciu.all_down_and_locked(),
            in_retraction_configuration,
        );
        self.retraction_fault = Self::retraction_fault(
            self.retraction_fault,
            self.retraction_inhibited,
            lgciu.all_up_and_locked(),
            lgciu.left_and_right_gear_compressed(false),
        );

        self.nose_wheel_angle_limit_exceeded =
            nose_wheel_angle.get::<degree>().abs() > Self::NOSE_WHEEL_ANGLE_LIMIT_DEGREES;
    }

    /// The normal retraction configuration of the gears: shock absorbers fully extended, nose wheel centred, body wheel
    /// steering locked and the wing and body gears tilted (no bogie position fault); an uplock closed behind its gear
    /// also prevents the retraction.
    fn in_retraction_configuration(
        shock_absorbers_extended: bool,
        nose_wheel_angle: Angle,
        body_wheel_steering_locked: bool,
        bogie_or_uplock_fault: bool,
    ) -> bool {
        shock_absorbers_extended
            && nose_wheel_angle.get::<degree>().abs() <= Self::NOSE_WHEEL_CENTRED_MAX_ANGLE_DEGREES
            && body_wheel_steering_locked
            && !bogie_or_uplock_fault
    }

    /// The LGCIS do not start a retraction out of the retraction configuration. Once inhibited the retraction stays
    /// inhibited until the gear lever is down again: a lever recycle is a new retraction attempt.
    fn retraction_inhibited(
        inhibited: bool,
        gear_lever_down: bool,
        all_gears_downlocked: bool,
        in_retraction_configuration: bool,
    ) -> bool {
        !gear_lever_down && (inhibited || (all_gears_downlocked && !in_retraction_configuration))
    }

    /// Design choice: L/G RETRACTION FAULT stays after the lever is set down again (its recycle and L/G : KEEP DOWN)
    /// until the gears are locked up or the aircraft is on ground.
    fn retraction_fault(
        fault: bool,
        retraction_inhibited: bool,
        all_gears_uplocked: bool,
        main_gears_compressed: bool,
    ) -> bool {
        (fault || retraction_inhibited) && !all_gears_uplocked && !main_gears_compressed
    }

    pub fn is_retraction_inhibited(&self) -> bool {
        self.retraction_inhibited
    }

    pub fn gravity_extension<'a, T: GearGravityExtension>(
        &self,
        gravity_extension: &'a T,
    ) -> LgersGravityExtension<'a, T> {
        LgersGravityExtension {
            gravity_extension,
            failed: self.gravity_extension_failure.is_active(),
        }
    }
}
impl SimulationElement for A380GearSteeringMonitoring {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for failure in &mut self.uplock_closed_failures {
            failure.accept(visitor);
        }
        self.bogie_position_failure.accept(visitor);
        self.gravity_extension_failure.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.uplock_fault_id, self.uplock_fault);
        writer.write(&self.bogie_position_fault_id, self.bogie_position_fault);
        writer.write(
            &self.gravity_extension_fault_id,
            self.gravity_extension_failure.is_active(),
        );
        writer.write(&self.retraction_inhibited_id, self.retraction_inhibited);
        writer.write(&self.retraction_fault_id, self.retraction_fault);
        writer.write(
            &self.nose_wheel_angle_limit_exceeded_id,
            self.nose_wheel_angle_limit_exceeded,
        );
    }
}

/// The gravity extension as the gear hydraulic controller gets it: with the LGERS failed the L/G GRVTY sw commands
/// nothing (no cut-out valve, no uplock release).
pub struct LgersGravityExtension<'a, T: GearGravityExtension> {
    gravity_extension: &'a T,
    failed: bool,
}
impl<T: GearGravityExtension> GearGravityExtension for LgersGravityExtension<'_, T> {
    fn extension_handle_number_of_turns(&self) -> u8 {
        if self.failed {
            0
        } else {
            self.gravity_extension.extension_handle_number_of_turns()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn angle(degrees: f64) -> Angle {
        Angle::new::<degree>(degrees)
    }

    #[test]
    fn gears_are_in_retraction_configuration_with_extended_shock_absorbers_and_centred_steering() {
        // 6 degrees: the most the rudder pedals command
        assert!(A380GearSteeringMonitoring::in_retraction_configuration(
            true,
            angle(6.),
            true,
            false
        ));
    }

    #[test]
    fn retraction_needs_extended_shocks_centred_nose_locked_bws_and_no_fault() {
        let not_in_configuration = [
            (false, angle(0.), true, false),
            (true, angle(10.), true, false),
            (true, angle(-10.), true, false),
            (true, angle(0.), false, false),
            (true, angle(0.), true, true),
        ];
        for (extended, nose_angle, bws_locked, fault) in not_in_configuration {
            assert!(!A380GearSteeringMonitoring::in_retraction_configuration(
                extended, nose_angle, bws_locked, fault
            ));
        }
    }

    #[test]
    fn lever_up_out_of_retraction_configuration_inhibits_the_retraction() {
        assert!(A380GearSteeringMonitoring::retraction_inhibited(
            false, false, true, false
        ));
        // In the retraction configuration the gears retract
        assert!(!A380GearSteeringMonitoring::retraction_inhibited(
            false, false, true, true
        ));
    }

    #[test]
    fn retraction_stays_inhibited_until_the_lever_is_down_again() {
        // The configuration came back but the lever was not recycled
        assert!(A380GearSteeringMonitoring::retraction_inhibited(
            true, false, true, true
        ));
        assert!(!A380GearSteeringMonitoring::retraction_inhibited(
            true, true, true, false
        ));
    }

    #[test]
    fn a_retraction_in_progress_is_not_stopped() {
        // The gears left their downlocks: the configuration is no longer monitored
        assert!(!A380GearSteeringMonitoring::retraction_inhibited(
            false, false, false, false
        ));
    }

    #[test]
    fn retraction_fault_stays_with_the_lever_down_until_gears_up_or_on_ground() {
        let fault = A380GearSteeringMonitoring::retraction_fault(false, true, false, false);
        assert!(fault);
        // Lever down again: the retraction is no longer inhibited but the fault stays
        assert!(A380GearSteeringMonitoring::retraction_fault(
            fault, false, false, false
        ));
        assert!(!A380GearSteeringMonitoring::retraction_fault(
            fault, false, true, false
        ));
        assert!(!A380GearSteeringMonitoring::retraction_fault(
            fault, false, false, true
        ));
    }

    struct TestGravityExtension;
    impl GearGravityExtension for TestGravityExtension {
        fn extension_handle_number_of_turns(&self) -> u8 {
            3
        }
    }

    #[test]
    fn failed_lgers_releases_no_uplock() {
        let gravity_extension = TestGravityExtension;
        let failed = LgersGravityExtension {
            gravity_extension: &gravity_extension,
            failed: true,
        };
        let working = LgersGravityExtension {
            gravity_extension: &gravity_extension,
            failed: false,
        };

        assert_eq!(failed.extension_handle_number_of_turns(), 0);
        assert_eq!(working.extension_handle_number_of_turns(), 3);
    }
}
