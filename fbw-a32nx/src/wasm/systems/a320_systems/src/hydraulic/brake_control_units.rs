//! The A320 brake control units: the two channels of the Brake and Steering Control Unit (BSCU) and the Alternate
//! Braking Control Unit (ABCU), with their power supplies and failures, and the autobrake fault monitoring.
//!
//! In normal operation the dual channel BSCU controls the normal braking and the antiskid. The alternate braking is
//! controlled by the ABCU, with the antiskid from the BSCU, or fully by the ABCU without antiskid.

use systems::{
    failures::{Failure, FailureType},
    shared::{AdirsMeasurementOutputs, ElectricalBusType, ElectricalBuses},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};

/// The BSCU channels, the ABCU and the brake system failures.
pub(super) struct A320BrakeControlUnits {
    bscu_channel_fault_ids: [VariableIdentifier; 2],
    bscu_active_channel_id: VariableIdentifier,
    altn_brk_fault_id: VariableIdentifier,
    norm_brk_fault_id: VariableIdentifier,
    nw_strg_fault_id: VariableIdentifier,
    auto_brk_fault_id: VariableIdentifier,
    hyd_sel_fault_id: VariableIdentifier,
    wheel_released_id: VariableIdentifier,
    altn_released_ids: [VariableIdentifier; 2],
    nw_strg_minor_fault_id: VariableIdentifier,

    bscu_channel_failures: [Failure; 2],
    bscu_channel_powered: [bool; 2],
    abcu_failure: Failure,
    abcu_powered: bool,
    /// The normal braking equipment (normal servovalves, normal selector valve) of all the wheels
    normal_braking_failure: Failure,
    nose_wheel_steering_failure: Failure,
    /// The autobrake function of the BSCU
    autobrake_failure: Failure,
    /// The brake normal selector valve failed open (WHEEL HYD SEL FAULT). The model feeds the normal servovalves with
    /// the green pressure at all times, so the failure has no other effect: as long as the antiskid works, the normal
    /// servovalves regulate the brake pressure.
    normal_selector_valve_failure: Failure,
    /// The brake of one main wheel (1 to 4 from left to right) no longer applies with the normal braking
    wheel_brake_released_failures: [Failure; 4],
    /// The brakes of one main gear (left, right) no longer apply with the alternate braking
    alternate_gear_brake_released_failures: [Failure; 2],
    /// The BSCU loses the rudder pedal steering orders (BRAKES-N/WS MINOR FAULT), the hand wheel works
    nose_wheel_steering_pedal_failure: Failure,
    normal_braking_in_use: bool,
    alternate_braking_in_use: bool,

    /// The BSCU channel in control (1 or 2), None with both channels lost
    active_bscu_channel: Option<usize>,
    gear_handle_was_down: bool,

    any_adiru_available: bool,
    autobrake_failed_after_armed: bool,
}
impl A320BrakeControlUnits {
    /// Power supplies of the BSCU channels, as the electrical bus fault STATUS shows them (see the FWC
    /// ElecBusAlerts): BRK SYS 1 is lost with AC BUS 1 or DC BUS 1, BRK SYS 2 with AC BUS 2 or DC BUS 2.
    const BSCU_CHANNEL_POWER_SUPPLIES: [[ElectricalBusType; 2]; 2] = [
        [
            ElectricalBusType::AlternatingCurrent(1),
            ElectricalBusType::DirectCurrent(1),
        ],
        [
            ElectricalBusType::AlternatingCurrent(2),
            ElectricalBusType::DirectCurrent(2),
        ],
    ];

    /// Power supply of the ABCU: ALTN BRK is lost with the DC ESS BUS (DC ESS BUS FAULT).
    const ABCU_POWER_SUPPLY: ElectricalBusType = ElectricalBusType::DirectCurrentEssential;

    const ADIRU_COUNT: usize = 3;

    pub(super) fn new(context: &mut InitContext) -> Self {
        Self {
            bscu_channel_fault_ids: [1, 2]
                .map(|channel| context.get_identifier(format!("BRAKES_BSCU_{channel}_FAULT"))),
            bscu_active_channel_id: context.get_identifier("BRAKES_BSCU_ACTIVE_CHANNEL".to_owned()),
            altn_brk_fault_id: context.get_identifier("BRAKES_ALTN_BRK_FAULT".to_owned()),
            norm_brk_fault_id: context.get_identifier("BRAKES_NORM_BRK_FAULT".to_owned()),
            nw_strg_fault_id: context.get_identifier("BRAKES_NW_STRG_FAULT".to_owned()),
            auto_brk_fault_id: context.get_identifier("BRAKES_AUTO_BRK_FAULT".to_owned()),
            hyd_sel_fault_id: context.get_identifier("BRAKES_HYD_SEL_FAULT".to_owned()),
            wheel_released_id: context.get_identifier("BRAKES_WHEEL_RELEASED".to_owned()),
            altn_released_ids: ["L", "R"]
                .map(|side| context.get_identifier(format!("BRAKES_ALTN_{side}_RELEASED"))),
            nw_strg_minor_fault_id: context.get_identifier("BRAKES_NW_STRG_MINOR_FAULT".to_owned()),

            bscu_channel_failures: [1, 2]
                .map(|channel| Failure::new(FailureType::BrakeSteeringControlUnitChannel(channel))),
            bscu_channel_powered: [false; 2],
            abcu_failure: Failure::new(FailureType::AlternateBrakingControlUnit),
            abcu_powered: false,
            normal_braking_failure: Failure::new(FailureType::BrakeNormalBraking),
            nose_wheel_steering_failure: Failure::new(FailureType::NoseWheelSteeringNormal),
            autobrake_failure: Failure::new(FailureType::Autobrake),
            normal_selector_valve_failure: Failure::new(FailureType::BrakeNormalSelectorValve),
            wheel_brake_released_failures: [1, 2, 3, 4]
                .map(|wheel| Failure::new(FailureType::MainWheelBrakeReleased(wheel))),
            alternate_gear_brake_released_failures: [1, 2]
                .map(|gear| Failure::new(FailureType::AlternateGearBrakeReleased(gear))),
            nose_wheel_steering_pedal_failure: Failure::new(
                FailureType::NoseWheelSteeringPedalOrders,
            ),
            normal_braking_in_use: false,
            alternate_braking_in_use: false,

            active_bscu_channel: Some(1),
            gear_handle_was_down: true,

            any_adiru_available: false,
            autobrake_failed_after_armed: false,
        }
    }

    /// ## Parameters
    /// `gear_handle_is_down` - the landing gear lever is DOWN
    /// `autobrake_is_armed` - the autobrake is armed (state of the previous update, before this update disarms it)
    /// `sim_is_ready` - the simulation runs (a flight being loaded can set an armed mode before the ADIRUs exist)
    pub(super) fn update(
        &mut self,
        gear_handle_is_down: bool,
        adirs: &impl AdirsMeasurementOutputs,
        autobrake_is_armed: bool,
        sim_is_ready: bool,
    ) {
        self.update_active_channel(gear_handle_is_down);

        // The BSCU uses the horizontal acceleration of ADIRU 1, 2 or 3. Autobrake arming needs at least one ADIRU
        // available.
        self.any_adiru_available = (1..=Self::ADIRU_COUNT)
            .any(|adiru_number| adirs.heading(adiru_number).is_normal_operation());

        // BRAKES AUTO BRK FAULT triggers when the autobrake fails after being armed: latched when the autobrake
        // function fails while armed, until the autobrake function is recovered.
        if !self.autobrake_function_failed() {
            self.autobrake_failed_after_armed = false;
        } else if autobrake_is_armed && sim_is_ready {
            self.autobrake_failed_after_armed = true;
        }
    }

    /// The two BSCU channels change over at each DOWN landing gear lever selection, or when one channel fails.
    fn update_active_channel(&mut self, gear_handle_is_down: bool) {
        let gear_down_selected = gear_handle_is_down && !self.gear_handle_was_down;
        self.gear_handle_was_down = gear_handle_is_down;

        let other_channel = |channel: usize| 3 - channel;
        self.active_bscu_channel = match self.active_bscu_channel {
            Some(channel)
                if self.bscu_channel_operative(channel)
                    && !(gear_down_selected
                        && self.bscu_channel_operative(other_channel(channel))) =>
            {
                Some(channel)
            }
            Some(channel) if self.bscu_channel_operative(other_channel(channel)) => {
                Some(other_channel(channel))
            }
            _ => (1..=2).find(|&channel| self.bscu_channel_operative(channel)),
        };
    }

    fn bscu_channel_operative(&self, channel: usize) -> bool {
        self.bscu_channel_powered[channel - 1]
            && !self.bscu_channel_failures[channel - 1].is_active()
    }

    /// At least one BSCU channel works
    pub(super) fn bscu_operative(&self) -> bool {
        self.active_bscu_channel.is_some()
    }

    /// The antiskid is electrically available: it is lost with the A/SKID & N/W STRG switch OFF, a power supply
    /// failure or a BSCU failure
    pub(super) fn anti_skid_available(&self, anti_skid_switch_on: bool) -> bool {
        anti_skid_switch_on && self.bscu_operative()
    }

    /// The normal braking can be used, hydraulic power apart: it is electrically controlled through the BSCU and
    /// needs the normal braking equipment working (BRAKES NORM BRK FAULT).
    pub(super) fn normal_braking_available(&self) -> bool {
        self.bscu_operative() && !self.normal_braking_failure.is_active()
    }

    /// The ABCU works: alternate braking possible. Without it only the parking brake is left (BRAKES NORM + ALTN
    /// FAULT).
    pub(super) fn alternate_braking_available(&self) -> bool {
        self.abcu_powered && !self.abcu_failure.is_active()
    }

    /// The brake mode of the current update: the green normal braking or the yellow alternate braking applies the brakes
    pub(super) fn set_braking_mode_in_use(&mut self, normal: bool, alternate: bool) {
        self.normal_braking_in_use = normal;
        self.alternate_braking_in_use = alternate;
    }

    /// The share (0 or 1) of the normal braking force that main wheel 1 to 4 (left to right) still applies
    pub(super) fn normal_wheel_brake_factor(&self, wheel_index: usize) -> f64 {
        if self.wheel_brake_released_failures[wheel_index].is_active() {
            0.
        } else {
            1.
        }
    }

    /// The share (0 or 1) of the alternate braking force that the left (0) or right (1) main gear still applies
    pub(super) fn alternate_gear_brake_factor(&self, gear_index: usize) -> f64 {
        if self.alternate_gear_brake_released_failures[gear_index].is_active() {
            0.
        } else {
            1.
        }
    }

    /// The BSCU passes the rudder pedal steering orders (autopilot rollout orders come the same way)
    pub(super) fn nose_wheel_steering_pedal_orders_available(&self) -> bool {
        !self.nose_wheel_steering_pedal_failure.is_active()
    }

    /// The BSCU commands the nose wheel steering, lost with a failure of the nose wheel steering system or of both
    /// BSCU channels
    pub(super) fn nose_wheel_steering_available(&self) -> bool {
        self.bscu_operative() && !self.nose_wheel_steering_failure.is_active()
    }

    /// WHEEL HYD SEL FAULT triggers when the brake normal selector valve has failed.
    /// Design choice: the BSCU monitors the valve, so the fault is reported while a BSCU channel works (without both
    /// channels, BRAKES A/SKID N/WS FAULT shows the loss).
    fn normal_selector_valve_fault_detected(&self) -> bool {
        self.bscu_operative() && self.normal_selector_valve_failure.is_active()
    }

    fn autobrake_function_failed(&self) -> bool {
        self.autobrake_failure.is_active() || !self.any_adiru_available
    }

    /// The BSCU part of the autobrake arming conditions: no failure in the braking system and at least one ADIRU
    /// available. The green pressure and the antiskid are checked by the caller.
    pub(super) fn autobrake_arming_allowed(&self) -> bool {
        self.normal_braking_available() && !self.autobrake_function_failed()
    }
}
impl SimulationElement for A320BrakeControlUnits {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.bscu_channel_failures
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.abcu_failure.accept(visitor);
        self.normal_braking_failure.accept(visitor);
        self.nose_wheel_steering_failure.accept(visitor);
        self.autobrake_failure.accept(visitor);
        self.normal_selector_valve_failure.accept(visitor);
        self.wheel_brake_released_failures
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.alternate_gear_brake_released_failures
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.nose_wheel_steering_pedal_failure.accept(visitor);
        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        for (powered, supplies) in self
            .bscu_channel_powered
            .iter_mut()
            .zip(Self::BSCU_CHANNEL_POWER_SUPPLIES)
        {
            *powered = supplies.iter().all(|&bus| buses.is_powered(bus));
        }
        self.abcu_powered = buses.is_powered(Self::ABCU_POWER_SUPPLY);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        for (channel, id) in self.bscu_channel_fault_ids.iter().enumerate() {
            writer.write(id, !self.bscu_channel_operative(channel + 1));
        }
        writer.write(
            &self.bscu_active_channel_id,
            self.active_bscu_channel.unwrap_or(0) as f64,
        );
        writer.write(&self.altn_brk_fault_id, !self.alternate_braking_available());
        writer.write(
            &self.norm_brk_fault_id,
            self.normal_braking_failure.is_active(),
        );
        writer.write(
            &self.nw_strg_fault_id,
            self.nose_wheel_steering_failure.is_active(),
        );
        writer.write(&self.auto_brk_fault_id, self.autobrake_failed_after_armed);
        writer.write(
            &self.hyd_sel_fault_id,
            self.normal_selector_valve_fault_detected(),
        );
        // A released brake is detected while the brake mode that applies it is in use
        writer.write(
            &self.wheel_released_id,
            self.normal_braking_in_use
                && self
                    .wheel_brake_released_failures
                    .iter()
                    .any(|failure| failure.is_active()),
        );
        for (id, failure) in self
            .altn_released_ids
            .iter()
            .zip(&self.alternate_gear_brake_released_failures)
        {
            writer.write(id, self.alternate_braking_in_use && failure.is_active());
        }
        writer.write(
            &self.nw_strg_minor_fault_id,
            self.bscu_operative() && self.nose_wheel_steering_pedal_failure.is_active(),
        );
    }
}
