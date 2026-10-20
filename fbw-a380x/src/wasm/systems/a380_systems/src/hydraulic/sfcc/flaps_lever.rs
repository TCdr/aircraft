use std::time::Duration;

use systems::{
    failures::{Failure, FailureType},
    hydraulic::command_sensor_unit::{CSUMonitor, CSU},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorReader, UpdateContext,
    },
};

/// The FLAPS lever position as one SFCC sees it, from the command sensor unit (CSU) of the lever. Without the lever
/// position, the SFCC keeps the configuration it had and its slat and flap systems no longer drive their motors.
pub(super) struct FlapsLeverInput {
    csu_monitor: CSUMonitor,
    link_failure: Failure,
    current_detent: CSU,
    previous_detent: CSU,
    out_of_detent_duration: Duration,
    /// The SFCCs are updated more than once per frame: the previous detent and the out of detent time move on the
    /// first update of a frame only, as the CSU monitor reads the lever once per frame
    first_update_of_frame: bool,
}

impl FlapsLeverInput {
    /// The lever is reported out of detent once it stays between two detents that long, so that a lever moved from
    /// one detent to the next is not reported (the same as the A320 SFCC status word)
    const OUT_OF_DETENT_CONFIRMATION: Duration = Duration::from_secs(10);

    pub(super) fn new(context: &mut InitContext, num: usize) -> Self {
        Self {
            csu_monitor: CSUMonitor::new(context),
            link_failure: Failure::new(FailureType::FlapsLeverLink(num)),
            current_detent: CSU::Conf0,
            previous_detent: CSU::Conf0,
            out_of_detent_duration: Duration::ZERO,
            first_update_of_frame: false,
        }
    }

    /// * `lever_jammed_out_of_detent` - the lever stays between two detents: both CSU tracks give an out of detent
    ///   pattern
    pub(super) fn update(&mut self, context: &UpdateContext, lever_jammed_out_of_detent: bool) {
        self.csu_monitor.update(context);

        let detent = if self.link_failure.is_active() {
            CSU::Fault
        } else if lever_jammed_out_of_detent {
            CSU::OutOfDetent
        } else {
            self.csu_monitor.get_current_detent()
        };

        if self.first_update_of_frame {
            self.first_update_of_frame = false;
            self.previous_detent = self.current_detent;
            if detent == CSU::OutOfDetent {
                self.out_of_detent_duration += context.delta();
            } else {
                self.out_of_detent_duration = Duration::ZERO;
            }
        }
        self.current_detent = detent;
    }

    pub(super) fn current_detent(&self) -> CSU {
        self.current_detent
    }

    pub(super) fn previous_detent(&self) -> CSU {
        self.previous_detent
    }

    /// The SFCC receives the lever position (in a detent or between two)
    pub(super) fn position_received(&self) -> bool {
        self.current_detent != CSU::Fault
    }

    pub(super) fn out_of_detent_confirmed(&self) -> bool {
        self.out_of_detent_duration >= Self::OUT_OF_DETENT_CONFIRMATION
    }
}

impl SimulationElement for FlapsLeverInput {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.csu_monitor.accept(visitor);
        self.link_failure.accept(visitor);
        visitor.visit(self);
    }

    fn read(&mut self, _reader: &mut SimulatorReader) {
        self.first_update_of_frame = true;
    }
}
