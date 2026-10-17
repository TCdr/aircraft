//! Engine and APU fire detection (also the A380 main landing gear bay), shared by the aircraft.
//!
//! Each protected zone has two identical detection loops (A and B) mounted in parallel and a fire detection unit (FDU)
//! that processes their signals (same principle on the A320 and the A380). The FDU follows the A320 fire detection and
//! detection fault logic. A fire warning appears if:
//! - both loops A and B send a fire signal, or
//! - one loop sends a fire signal and the other one is failed, or
//! - breaks occur in both loops within 5 s of each other (flame effect), or
//! - a test is performed on the FIRE panel.
//!
//! The FDU of each zone can fail ([`FailureType::FireDetectionUnit`]): a failed FDU gives the loop fault caution, and
//! the FIRE DET FAULT alert triggers when both loops or the FDU are inoperative. A failed FDU gives no fire warning for
//! its zone (it is the FDU that processes the loop signals), whatever its loops detect. The aircraft that model it map
//! the failure.
//!
//! The aircraft give the zones, the electrical supply of each loop and the extinguishing bottles; this module also
//! holds the [`SetOnFireModule`], which sets a zone on fire from a flyPad failure (and, on the aircraft that give it,
//! from the simulator's own fire) and puts it out again. The loops sense that fire alone, so the fire warning goes out
//! when the fire is out, as the FIRE lights of both aircraft do.

use std::time::Duration;

pub mod cargo_fire_extinguishing;
pub mod smoke_detection;

use crate::{
    failures::{Failure, FailureType},
    shared::{
        DelayedTrueLogicGate, ElectricalBusType, ElectricalBuses, FireDetectionLoopID,
        FireDetectionZone, LgciuWeightOnWheels,
    },
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

/// How the fire detection unit sees a detection loop that loses its electrical supply.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum FireLoopPowerLoss {
    /// The loss of supply is seen as a loop break during the update in which it happens only. A simultaneous loss of
    /// both loops of a zone therefore looks like the flame effect; afterwards the unpowered loop neither detects a fire
    /// nor is failed. Kept for the A380X, whose model was written this way.
    TransientBreak,
    /// A320: a fault in one loop (break or loss of supply) leaves the other loop protecting the zone. The unpowered
    /// loop is failed for as long as it has no supply. A loss of supply is not a break: it does not count for the
    /// flame effect fire warning (breaks in both loops within 5 s).
    LoopFault,
}

/// One protected zone of a [`FireDetectionUnit`].
pub struct FireDetectionZoneConfig {
    pub zone: FireDetectionZone,
    pub loop_a_powered_by: ElectricalBusType,
    pub loop_b_powered_by: ElectricalBusType,
}

/// The fire detection unit of the zones, with their two detection loops.
pub struct FireDetectionUnit<const N: usize> {
    fire_detection_loop: [FireDetectionLoop<N>; 2],
    /// The failure of the FDU channel of each zone
    unit_failures: [Failure; N],

    fire_detected_id: [VariableIdentifier; N],

    fire_detected: [bool; N],
    fire_detection_zones: [FireDetectionZone; N],
    interval_between_loop_failures: [Duration; N],
    apu_fire_on_ground: bool,
    should_extinguish_apu_fire: DelayedTrueLogicGate,
}

impl<const N: usize> FireDetectionUnit<N> {
    /// The longest time between the breaks of the two loops of a zone that gives a fire warning (flame effect)
    const FLAME_EFFECT_INTERVAL: Duration = Duration::from_secs(5);

    /// `apu_auto_extinguishing_delay`: the time between an APU fire detected on the ground and the automatic discharge
    /// of the APU fire extinguisher bottle.
    pub fn new(
        context: &mut InitContext,
        zones: [FireDetectionZoneConfig; N],
        power_loss: FireLoopPowerLoss,
        apu_auto_extinguishing_delay: Duration,
    ) -> Self {
        let fire_detection_zones = zones.each_ref().map(|config| config.zone);

        Self {
            fire_detection_loop: [
                FireDetectionLoop::new(
                    context,
                    FireDetectionLoopID::A,
                    &zones,
                    zones.each_ref().map(|config| config.loop_a_powered_by),
                    power_loss,
                ),
                FireDetectionLoop::new(
                    context,
                    FireDetectionLoopID::B,
                    &zones,
                    zones.each_ref().map(|config| config.loop_b_powered_by),
                    power_loss,
                ),
            ],
            unit_failures: fire_detection_zones
                .map(|zone| Failure::new(FailureType::FireDetectionUnit(zone))),

            fire_detected_id: fire_detection_zones.map(|zone| Self::init_identifier(context, zone)),

            fire_detected: [false; N],
            fire_detection_zones,
            interval_between_loop_failures: [Duration::ZERO; N],
            apu_fire_on_ground: false,
            should_extinguish_apu_fire: DelayedTrueLogicGate::new(apu_auto_extinguishing_delay),
        }
    }

    fn init_identifier(
        context: &mut InitContext,
        zone_id: FireDetectionZone,
    ) -> VariableIdentifier {
        if matches!(zone_id, FireDetectionZone::Engine(_)) {
            context.get_identifier(format!("FIRE_DETECTED_ENG{}", zone_id))
        } else {
            context.get_identifier(format!("FIRE_DETECTED_{}", zone_id))
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        fire_test_pushbutton_is_pressed: bool,
        lgciu: [&impl LgciuWeightOnWheels; 2],
    ) {
        self.interval_between_loop_failures = self.calculate_interval_between_failures(context);

        self.fire_detected = self.fire_detection_determination(fire_test_pushbutton_is_pressed);

        self.fire_detection_loop
            .iter_mut()
            .for_each(|l| l.update_was_powered());

        // If a fire is detected in the APU while the aircraft is on the ground, the extinguishing system is
        // automatically activated after a delay
        self.apu_fire_on_ground = self.fire_detected(FireDetectionZone::Apu)
            && !fire_test_pushbutton_is_pressed
            && lgciu.iter().all(|a| a.left_and_right_gear_compressed(true));
        self.should_extinguish_apu_fire
            .update(context, self.apu_fire_on_ground);
    }

    fn fire_detection_determination(&self, fire_test_pb: bool) -> [bool; N] {
        let mut fire_detected = [false; N];
        for (((&zone, &interval_between_loop_failures), unit_failure), fire_detected) in self
            .fire_detection_zones
            .iter()
            .zip(&self.interval_between_loop_failures)
            .zip(&self.unit_failures)
            .zip(&mut fire_detected)
        {
            // A failed FDU processes nothing: no fire warning from its zone
            *fire_detected = !unit_failure.is_active()
                && ((self.fire_detection_loop[0].fire_detected_in_loop(zone, fire_test_pb)
                    && self.fire_detection_loop[1].fire_detected_in_loop(zone, fire_test_pb))
                    || (self
                        .fire_detection_loop
                        .iter()
                        .any(|l| l.fire_detected_in_loop(zone, fire_test_pb))
                        && self
                            .fire_detection_loop
                            .iter()
                            .any(|l| l.loop_has_failed(zone)))
                    || (self
                        .fire_detection_loop
                        .iter()
                        .all(|l| l.loop_is_broken(zone))
                        && interval_between_loop_failures < Self::FLAME_EFFECT_INTERVAL
                        && zone != FireDetectionZone::Mlg));
        }
        fire_detected
    }

    /// The time since the first loop of each zone broke, frozen when the second one breaks too
    fn calculate_interval_between_failures(&self, context: &UpdateContext) -> [Duration; N] {
        let mut interval = [Duration::ZERO; N];
        for ((&zone, &interval_between_loop_failures), interval) in self
            .fire_detection_zones
            .iter()
            .zip(&self.interval_between_loop_failures)
            .zip(&mut interval)
        {
            *interval = if self
                .fire_detection_loop
                .iter()
                .all(|l| !l.loop_is_broken(zone))
            {
                Duration::ZERO
            } else if self
                .fire_detection_loop
                .iter()
                .all(|l| l.loop_is_broken(zone))
            {
                interval_between_loop_failures
            } else {
                interval_between_loop_failures + context.delta()
            }
        }
        interval
    }

    /// Whether the FDU gives a fire warning for the zone (false for a zone it does not protect)
    pub fn fire_detected(&self, zone: FireDetectionZone) -> bool {
        self.fire_detection_zones
            .iter()
            .position(|&z| z == zone)
            .is_some_and(|index| self.fire_detected[index])
    }

    /// Whether a detection loop of the zone is failed (break or, with [`FireLoopPowerLoss::LoopFault`], no supply)
    pub fn loop_has_failed(&self, loop_id: FireDetectionLoopID, zone: FireDetectionZone) -> bool {
        let detection_loop = match loop_id {
            FireDetectionLoopID::A => &self.fire_detection_loop[0],
            FireDetectionLoopID::B => &self.fire_detection_loop[1],
        };
        detection_loop.loop_has_failed(zone)
    }

    /// Whether the FDU channel of the zone is failed (false for a zone it does not protect)
    pub fn unit_has_failed(&self, zone: FireDetectionZone) -> bool {
        self.fire_detection_zones
            .iter()
            .position(|&z| z == zone)
            .is_some_and(|index| self.unit_failures[index].is_active())
    }

    pub fn should_extinguish_apu_fire(&self) -> bool {
        self.should_extinguish_apu_fire.output()
    }

    pub fn apu_fire_on_ground(&self) -> bool {
        self.apu_fire_on_ground
    }
}

impl<const N: usize> SimulationElement for FireDetectionUnit<N> {
    fn write(&self, writer: &mut SimulatorWriter) {
        for (id, fire_detected) in self.fire_detected_id.iter().zip(self.fire_detected) {
            writer.write(id, fire_detected);
        }
    }

    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.fire_detection_loop, visitor);
        accept_iterable!(self.unit_failures, visitor);

        visitor.visit(self);
    }
}

/// One detection loop (A or B) through all the zones. Each zone part of the loop has its own failure and its own
/// electrical supply.
struct FireDetectionLoop<const N: usize> {
    zones: [FireDetectionZone; N],
    powered_by: [ElectricalBusType; N],
    power_loss: FireLoopPowerLoss,
    is_powered: [bool; N],
    was_powered_before: [bool; N],
    failures: [Failure; N],

    fire_detectors: [FireDetector; N],
}

impl<const N: usize> FireDetectionLoop<N> {
    fn new(
        context: &mut InitContext,
        loop_id: FireDetectionLoopID,
        zones: &[FireDetectionZoneConfig; N],
        powered_by: [ElectricalBusType; N],
        power_loss: FireLoopPowerLoss,
    ) -> Self {
        Self {
            zones: zones.each_ref().map(|config| config.zone),
            powered_by,
            power_loss,
            is_powered: [false; N],
            was_powered_before: [false; N],
            failures: zones
                .each_ref()
                .map(|config| Failure::new(FailureType::FireDetectionLoop(loop_id, config.zone))),

            fire_detectors: zones
                .each_ref()
                .map(|config| FireDetector::new(context, config.zone)),
        }
    }

    fn zone_index(&self, zone: FireDetectionZone) -> usize {
        self.zones
            .iter()
            .position(|&z| z == zone)
            .expect("The fire detection loop does not protect this zone")
    }

    fn fire_detected_in_loop(
        &self,
        fire_detection_zone: FireDetectionZone,
        fire_test_pushbutton_is_pressed: bool,
    ) -> bool {
        let index = self.zone_index(fire_detection_zone);

        !self.failures[index].is_active()
            && self.is_powered[index]
            && (self.fire_detectors[index].fire_detected() || fire_test_pushbutton_is_pressed)
    }

    /// A break of the loop: its failure, or (A380X model) the update in which it loses its supply
    fn loop_is_broken(&self, fire_detection_zone: FireDetectionZone) -> bool {
        let index = self.zone_index(fire_detection_zone);

        self.failures[index].is_active()
            || (self.power_loss == FireLoopPowerLoss::TransientBreak
                && !self.is_powered[index]
                && self.was_powered_before[index])
    }

    fn loop_has_failed(&self, fire_detection_zone: FireDetectionZone) -> bool {
        let index = self.zone_index(fire_detection_zone);

        self.loop_is_broken(fire_detection_zone)
            || (self.power_loss == FireLoopPowerLoss::LoopFault && !self.is_powered[index])
    }

    /// This is to avoid a fire detection on initial load
    fn update_was_powered(&mut self) {
        self.was_powered_before = self.is_powered
    }
}

impl<const N: usize> SimulationElement for FireDetectionLoop<N> {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.failures, visitor);
        accept_iterable!(self.fire_detectors, visitor);
        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        for (is_powered, &bus) in self.is_powered.iter_mut().zip(&self.powered_by) {
            *is_powered = buses.is_powered(bus);
        }
    }
}

/// The "zone burning" variable of a zone, written by the [`SetOnFireModule`] and sensed by the [`FireDetector`]s:
/// ENG_<n>_ON_FIRE for an engine, <zone>_ON_FIRE otherwise (APU_ON_FIRE, MLG_ON_FIRE).
fn zone_burning_variable_name(zone: FireDetectionZone) -> String {
    match zone {
        FireDetectionZone::Engine(number) => format!("ENG_{}_ON_FIRE", number),
        _ => format!("{}_ON_FIRE", zone),
    }
}

/// Fire sensing elements. There are multiple sensing elements in each engine (pylon nacelle, engine core, fan section)
/// and one in the APU compartment. For simplicity here we simulate just one detection zone per engine, when we have
/// deep engine simulation we can modify this accordingly.
///
/// The sensing elements feel the fire that burns in the zone: the "zone burning" variable of the [`SetOnFireModule`]
/// (L:A32NX_ENG_<n>_ON_FIRE, L:A32NX_<zone>_ON_FIRE), and nothing else. That variable already includes the simulator's
/// own fire on the aircraft that give it, and goes off when an agent puts the fire out. Reading a simulator fire
/// variable here as well (ENG ON FIRE:n, which MSFS keeps on after its failure-menu fire, or the A380X copy of the
/// L:var in it) would keep the fire warning after the fire is out.
struct FireDetector {
    zone_burning_id: VariableIdentifier,
    fire_detected: bool,
}

impl FireDetector {
    fn new(context: &mut InitContext, zone: FireDetectionZone) -> Self {
        Self {
            zone_burning_id: context.get_identifier(zone_burning_variable_name(zone)),
            fire_detected: false,
        }
    }

    fn fire_detected(&self) -> bool {
        self.fire_detected
    }
}

impl SimulationElement for FireDetector {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.fire_detected = reader.read(&self.zone_burning_id);
    }
}

/// Sets each zone on fire and puts it out again: the fire that burns in the zone, as opposed to its detection (the
/// [`FireDetectionUnit`] sees the fire through the detection loops). The zone is on fire (L:A32NX_ENG_<n>_ON_FIRE,
/// L:A32NX_<zone>_ON_FIRE) from the moment one of its ignition sources comes on:
/// - the flyPad fire failure of the zone, or
/// - the simulator's own fire of the zone (MSFS failures menu), for the aircraft that give it with
///   [`SetOnFireModule::with_simulator_fire_sources`].
///
/// The fire is out again when all its ignition sources are off, or when a new discharge of a fire extinguisher bottle
/// of the zone puts it out, with a chance of 1/2 per bottle (the ENG FIRE procedures of both aircraft discharge AGENT 2
/// when the fire is still there 30 s after AGENT 1). A fire put out by an agent stays out while its sources stay on:
/// only a new rising edge of a source sets the zone on fire again, so a simulator variable stuck on cannot relight it.
///
/// This is the one "the zone is burning" signal: the fire detection loops (their fire detectors) and the fire visual
/// effects of the exterior models read it alone. The variable is only written when it changes, so a test or a tool
/// that writes it directly still sets a zone on fire.
pub struct SetOnFireModule<const N: usize, const B: usize> {
    fire_id: [VariableIdentifier; N],

    fire: [Failure; N],
    /// The simulator's own fire variable of each zone, for the zones that take it as a second ignition source
    simulator_fire_id: [Option<VariableIdentifier>; N],
    simulator_fire: [bool; N],
    /// The index of the zone of each fire extinguisher bottle
    zone_of_bottle: [usize; B],
    should_set_zone_on_fire: [bool; N],
    should_extinguish_zone: [bool; N],
    // We use this to avoid having a previously discharged bottle extinguish a fire
    bottle_already_discharged: [bool; B],
    /// Whether an ignition source of each zone was on in the previous update: the zone is set on fire on the rising
    /// edge and put out on the falling edge
    ignition_was_on: [bool; N],
}

impl<const N: usize, const B: usize> SetOnFireModule<N, B> {
    /// `zone_of_bottle`: for each fire extinguisher bottle, its zone as an index in `zones`.
    pub fn new(
        context: &mut InitContext,
        zones: [FireDetectionZone; N],
        zone_of_bottle: [usize; B],
    ) -> Self {
        Self {
            fire_id: zones.map(|zone| context.get_identifier(zone_burning_variable_name(zone))),

            fire: zones.map(|zone| Failure::new(FailureType::SetOnFire(zone))),
            simulator_fire_id: [None; N],
            simulator_fire: [false; N],
            zone_of_bottle,
            should_set_zone_on_fire: [false; N],
            should_extinguish_zone: [false; N],
            bottle_already_discharged: [false; B],
            ignition_was_on: [false; N],
        }
    }

    /// Adds the simulator's own fire of each zone as a second ignition source, by variable name (`None`: none for that
    /// zone). Only for a variable that the aircraft does not write itself: a copy of this module's fire in a simulator
    /// variable, read back here, would keep the zone burning after the failure is removed.
    pub fn with_simulator_fire_sources(
        mut self,
        context: &mut InitContext,
        names: [Option<&str>; N],
    ) -> Self {
        self.simulator_fire_id =
            names.map(|name| name.map(|name| context.get_identifier(name.to_owned())));
        self
    }

    /// `bottle_discharge`: whether each fire extinguisher bottle is discharged
    pub fn update(&mut self, bottle_discharge: [bool; B]) {
        let ignition_is_on: [bool; N] =
            std::array::from_fn(|id| self.fire[id].is_active() || self.simulator_fire[id]);

        for (id, should_set_zone_on_fire) in self.should_set_zone_on_fire.iter_mut().enumerate() {
            *should_set_zone_on_fire = ignition_is_on[id] && !self.ignition_was_on[id];
        }

        self.should_extinguish_zone =
            self.zone_extinguishing_determination(bottle_discharge, ignition_is_on);
        self.bottle_already_discharged = bottle_discharge;
        self.ignition_was_on = ignition_is_on;
    }

    /// We check any "new" bottle discharges and then add a random factor on whether it should extinguish a fire
    /// We also use this function to "extinguish" a fire when all its ignition sources go off (failure deselected by the
    /// user, simulator fire cleared)
    fn zone_extinguishing_determination(
        &self,
        bottle_discharge: [bool; B],
        ignition_is_on: [bool; N],
    ) -> [bool; N] {
        let mut should_extinguish_zone = [false; N];
        for (zone, should_extinguish) in should_extinguish_zone.iter_mut().enumerate() {
            let new_discharge_in_zone = self
                .zone_of_bottle
                .iter()
                .zip(bottle_discharge.iter().zip(&self.bottle_already_discharged))
                .any(|(&bottle_zone, (&discharge, &already_discharged))| {
                    bottle_zone == zone && discharge && !already_discharged
                });

            *should_extinguish = (new_discharge_in_zone && rand::random())
                || (self.ignition_was_on[zone] && !ignition_is_on[zone]);
        }
        should_extinguish_zone
    }
}

impl<const N: usize, const B: usize> SimulationElement for SetOnFireModule<N, B> {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.fire, visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        for (simulator_fire, id) in self.simulator_fire.iter_mut().zip(&self.simulator_fire_id) {
            *simulator_fire = match id {
                Some(id) => reader.read(id),
                None => false,
            };
        }
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        for (id, zone) in self.fire_id.iter().enumerate() {
            if self.should_set_zone_on_fire[id] {
                writer.write(zone, true)
            } else if self.should_extinguish_zone[id] {
                writer.write(zone, false)
            }
        }
    }
}
