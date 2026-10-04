//! Engine and APU fire detection (also the A380 main landing gear bay), shared by the aircraft.
//!
//! Each protected zone has two identical detection loops (A and B) mounted in parallel and a fire detection unit (FDU)
//! that processes their signals (A320 FCOM DSC-26-20-10 "FIRE DETECTION"; the A380 has the same principle). The FDU
//! logic is the one of the A320 FCOM DSC-26-20-10 "FIRE DETECTION AND DETECTION FAULT LOGIC". A fire warning appears if:
//! - both loops A and B send a fire signal, or
//! - one loop sends a fire signal and the other one is failed, or
//! - breaks occur in both loops within 5 s of each other (flame effect), or
//! - a test is performed on the FIRE panel.
//!
//! The aircraft give the zones, the electrical supply of each loop and the extinguishing bottles; this module also
//! holds the [`SetOnFireModule`], which sets a zone on fire from a flyPad failure.

use std::time::Duration;

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
    /// nor is failed. This is the A380X model as it was written, kept unchanged.
    TransientBreak,
    /// A320 FCOM DSC-26-20-10: "A fault in one loop (break or loss of electrical supply) does not affect the warning
    /// system and the unaffected loop still protects the aircraft". The unpowered loop is failed for as long as it has
    /// no supply. A loss of supply is not a break: it does not count for the "breaks occur in both loops within 5 s of
    /// each other (flame effect)" fire warning.
    LoopFault,
}

/// One protected zone of a [`FireDetectionUnit`].
pub struct FireDetectionZoneConfig<'a> {
    pub zone: FireDetectionZone,
    pub loop_a_powered_by: ElectricalBusType,
    pub loop_b_powered_by: ElectricalBusType,
    /// A second variable that, when true, also heats the sensing elements of the zone (for example the simulator's own
    /// fire of that zone, next to the flyPad failure variable).
    pub additional_fire_source: Option<&'a str>,
}

/// The fire detection unit of the zones, with their two detection loops.
pub struct FireDetectionUnit<const N: usize> {
    fire_detection_loop: [FireDetectionLoop<N>; 2],

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
        for ((&zone, &interval_between_loop_failures), fire_detected) in self
            .fire_detection_zones
            .iter()
            .zip(&self.interval_between_loop_failures)
            .zip(&mut fire_detected)
        {
            *fire_detected = (self.fire_detection_loop[0]
                .fire_detected_in_loop(zone, fire_test_pb)
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
                    && zone != FireDetectionZone::Mlg);
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

            fire_detectors: zones.each_ref().map(|config| {
                FireDetector::new(context, config.zone, config.additional_fire_source)
            }),
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

/// Fire sensing elements. There are multiple sensing elements in each engine (pylon nacelle, engine core, fan section)
/// and one in the APU compartment. For simplicity here we simulate just one detection zone per engine, when we have
/// deep engine simulation we can modify this accordingly.
struct FireDetector {
    fire_detection_id: VariableIdentifier,
    additional_fire_detection_id: Option<VariableIdentifier>,
    fire_detected: bool,
}

impl FireDetector {
    const ENGINE_ON_FIRE: &'static str = "ENG ON FIRE:";

    fn new(
        context: &mut InitContext,
        fire_zone_id: FireDetectionZone,
        additional_fire_source: Option<&str>,
    ) -> Self {
        Self {
            fire_detection_id: Self::init_identifier(context, fire_zone_id),
            additional_fire_detection_id: additional_fire_source
                .map(|name| context.get_identifier(name.to_owned())),
            fire_detected: false,
        }
    }

    fn init_identifier(
        context: &mut InitContext,
        zone_id: FireDetectionZone,
    ) -> VariableIdentifier {
        if matches!(zone_id, FireDetectionZone::Engine(_)) {
            context.get_identifier(format!("{}{}", Self::ENGINE_ON_FIRE, zone_id))
        } else {
            context.get_identifier(format!("{}_ON_FIRE", zone_id))
        }
    }

    fn fire_detected(&self) -> bool {
        self.fire_detected
    }
}

impl SimulationElement for FireDetector {
    fn read(&mut self, reader: &mut SimulatorReader) {
        let additional_fire = match &self.additional_fire_detection_id {
            Some(id) => reader.read(id),
            None => false,
        };
        self.fire_detected = reader.read(&self.fire_detection_id) || additional_fire;
    }
}

/// Small module that sets each zone on fire when the failure is triggered. This is independent to the system
/// implementation. A discharged fire extinguisher bottle of the zone has the chance to put the fire out.
pub struct SetOnFireModule<const N: usize, const B: usize> {
    fire_id: [VariableIdentifier; N],

    fire: [Failure; N],
    /// The index of the zone of each fire extinguisher bottle
    zone_of_bottle: [usize; B],
    should_set_zone_on_fire: [bool; N],
    should_extinguish_zone: [bool; N],
    // We use this to avoid having a previously discharged bottle extinguish a fire
    bottle_already_discharged: [bool; B],
    // We use this to know when to cancel the fire command when the failure is resolved
    was_on_fire: [bool; N],
}

impl<const N: usize, const B: usize> SetOnFireModule<N, B> {
    /// `zone_of_bottle`: for each fire extinguisher bottle, its zone as an index in `zones`.
    pub fn new(
        context: &mut InitContext,
        zones: [FireDetectionZone; N],
        zone_of_bottle: [usize; B],
    ) -> Self {
        Self {
            fire_id: zones.map(|zone| match zone {
                FireDetectionZone::Engine(number) => {
                    context.get_identifier(format!("ENG_{}_ON_FIRE", number))
                }
                _ => context.get_identifier(format!("{}_ON_FIRE", zone)),
            }),

            fire: zones.map(|zone| Failure::new(FailureType::SetOnFire(zone))),
            zone_of_bottle,
            should_set_zone_on_fire: [false; N],
            should_extinguish_zone: [false; N],
            bottle_already_discharged: [false; B],
            was_on_fire: [false; N],
        }
    }

    /// `bottle_discharge`: whether each fire extinguisher bottle is discharged
    pub fn update(&mut self, bottle_discharge: [bool; B]) {
        for id in 0..N {
            self.should_set_zone_on_fire[id] = self.fire[id].is_active()
                && !self.should_set_zone_on_fire[id]
                && !self.was_on_fire[id]
        }

        self.should_extinguish_zone = self.zone_extinguishing_determination(bottle_discharge);
        self.bottle_already_discharged = bottle_discharge;
        self.was_on_fire = self.fire.each_ref().map(|f| f.is_active());
    }

    /// We check any "new" bottle discharges and then add a random factor on whether it should extinguish a fire
    /// We also use this function to "extinguish" a fire if the user deselects the failure
    fn zone_extinguishing_determination(&self, bottle_discharge: [bool; B]) -> [bool; N] {
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
                || (self.was_on_fire[zone] && !self.fire[zone].is_active());
        }
        should_extinguish_zone
    }
}

impl<const N: usize, const B: usize> SimulationElement for SetOnFireModule<N, B> {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.fire, visitor);

        visitor.visit(self);
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
