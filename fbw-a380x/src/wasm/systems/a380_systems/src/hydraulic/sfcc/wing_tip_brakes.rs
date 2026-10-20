use systems::failures::{Failure, FailureType};
use systems::simulation::{SimulationElement, SimulationElementVisitor};

/// The wing tip brakes of the slat or of the flap transmission. They lock the surfaces where they are, whatever the
/// lever position, when both control units of these surfaces see an asymmetry between the two wings while the
/// surfaces are driven. The other surfaces (flaps or slats) still work.
///
/// They cannot be released in flight. Design choice: they are released on the ground once the asymmetry is gone
/// (the flyPad failure cleared), as a maintenance reset would.
pub(super) struct WingTipBrakes {
    asymmetry: Failure,
    engaged: bool,
}

impl WingTipBrakes {
    pub(super) fn new(asymmetry: FailureType) -> Self {
        Self {
            asymmetry: Failure::new(asymmetry),
            engaged: false,
        }
    }

    /// * `surfaces_driven` - a control unit commands the surfaces to move: the asymmetry shows only then
    /// * `both_control_units_monitor` - the lock needs both control units of the surfaces to detect the asymmetry
    pub(super) fn update(
        &mut self,
        surfaces_driven: bool,
        both_control_units_monitor: bool,
        on_ground: bool,
    ) {
        let asymmetry = self.asymmetry.is_active();
        if asymmetry && surfaces_driven && both_control_units_monitor {
            self.engaged = true;
        } else if !asymmetry && on_ground {
            self.engaged = false;
        }
    }

    pub(super) fn is_engaged(&self) -> bool {
        self.engaged
    }
}

impl SimulationElement for WingTipBrakes {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.asymmetry.accept(visitor);
        visitor.visit(self);
    }
}
