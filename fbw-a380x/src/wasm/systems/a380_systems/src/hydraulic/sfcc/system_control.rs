use systems::{
    failures::{Failure, FailureType},
    simulation::{SimulationElement, SimulationElementVisitor},
};

/// What lets the control unit of a slat (flap) system drive the motor of that system. Each SFCC holds the slat and the
/// flap control unit of system 1 (2). A control unit can also drive the motor of the other system when the other
/// control unit fails, so the surfaces keep their normal speed. It needs the FLAPS lever position, and the wing tip
/// brakes hold the whole transmission when they are engaged.
pub(super) struct SystemControl {
    control_unit_failure: Failure,
    other_control_unit_failed: bool,
    lever_position_received: bool,
    wing_tip_brakes_engaged: bool,
}

impl SystemControl {
    pub(super) fn new(control_unit_failure: FailureType) -> Self {
        Self {
            control_unit_failure: Failure::new(control_unit_failure),
            other_control_unit_failed: false,
            lever_position_received: true,
            wing_tip_brakes_engaged: false,
        }
    }

    pub(super) fn control_unit_failed(&self) -> bool {
        self.control_unit_failure.is_active()
    }

    pub(super) fn set_lever_position_received(&mut self, received: bool) {
        self.lever_position_received = received;
    }

    pub(super) fn set_other_control_unit_failed(&mut self, failed: bool) {
        self.other_control_unit_failed = failed;
    }

    pub(super) fn set_wing_tip_brakes_engaged(&mut self, engaged: bool) {
        self.wing_tip_brakes_engaged = engaged;
    }

    pub(super) fn wing_tip_brakes_engaged(&self) -> bool {
        self.wing_tip_brakes_engaged
    }

    /// Both control units of the surfaces are failed: no one drives the motor of this system, the SFCC reports the
    /// system fault (F/CTL FLAP(SLAT) SYS 1+2 FAULT with both systems)
    pub(super) fn no_control_unit_left(&self) -> bool {
        self.control_unit_failed() && self.other_control_unit_failed
    }

    /// The control unit has no lever position, or the wing tip brakes hold the transmission
    pub(super) fn stops_the_motor(&self) -> bool {
        !self.lever_position_received || self.wing_tip_brakes_engaged
    }
}

impl SimulationElement for SystemControl {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.control_unit_failure.accept(visitor);
        visitor.visit(self);
    }
}
