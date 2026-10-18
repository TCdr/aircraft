//! Engine flameout and seizure failures of the A380 and its in-flight relight envelope.
//!
//! The failure logic is the aircraft-independent `systems::engine::engine_failure::EngineFailure`;
//! this module gives it the A380 relight envelope and windmilling speeds, and the A380 variables.
//! The FADEC reads the fuel cut it computes in place of the LP valve starvation.
//!
//! HP fuel valve: the MSFS fuel valves 60 to 63, after the Extra tanks (see a380_systems_wasm), are the
//! HP fuel valves (`HpFuelValve`). The ENG MASTER alone only closes the MSFS LP valve upstream of the
//! Extra tank, and MSFS keeps the combustion and the idle N2 of a shut down engine for 20 to 60 s
//! (measured in the sim): a restart in that time skipped the start sequence. Closing the HP valve
//! stops the burn at once, as on the aircraft, where the master OFF closes both fuel valves.
//!
//! This module decides whether a relight lights up; MSFS then has to burn. MSFS only burns above
//! 20 % N2 and its starter only turns with the MSFS APU bleed, so once the fuel cut is released in
//! flight the FADEC brings the MSFS core to its light-up speed (fadec_a380x RelightStart_A380X.hpp).
//!
//! The Airbus documentation describes the GP7270 (N1 and N2); FBW models the Trent 972 (three
//! spools). Its N2 is the HP core speed, the Trent N3 here: the "core speed" of the shared module
//! is the FADEC N3 (`ENGINE_N3`), and its windmill "N2" output is the windmilling N3.
//!
//! Relight envelope (IAS, flight level), read off the in-flight relight envelope chart:
//! - (1) starter assisted relight (APU available below FL200): 150 to 220 kt up to FL200, and
//!   185 to 260 kt from FL200 to FL250.
//! - (2) starter assisted relight, or windmilling quick relight if N2 > 45 %: 220 to 260 kt up to
//!   FL200.
//! - (3) windmilling start: 260 to 340 kt up to FL300.
//!
//! Relight procedure limits: one engine out, 30 000 ft maximum and 260 kt minimum for a windmill
//! relight; several engines out, 28 000 ft and 250 kt (design choice: from two engines not running).
//! A relight needs the ENG START selector at IGN START, except the quick relight, and the engine must
//! light up within 30 s after the fuel flow increases (the attempt time of the shared module).
//!
//! How each zone lights up the engine:
//! - The FADEC opens the start valve (starter assisted start) when N2 is below 11 % or the CAS below
//!   260 kt; otherwise it is a windmilling start with the start valve closed. Zones 1 and 2 light
//!   up with starter air (APU bleed or the bleed of the other engines), zone 3 by windmilling.
//! - Quick relight: a master cycled ON-OFF-ON within 30 s on a running engine gets continuous
//!   ignition with both igniters if N2 is above 45 %: zone 2, at any ENG START selector position.
//!   Design choice: also in zone 3, where the windmill alone lights the engine.
//! - On the ground a failed engine starts again as a normal start, with starter air.
//! - During a windmilling start the FADEC off-loads both hydraulic pumps of that engine to widen the
//!   envelope: this module reports it (`ENGINE_n_WINDMILL_START`) and the pump controllers
//!   depressurise them (design choice: the ENG PUMPS DISC clutch is not used, it cannot be undone in
//!   flight).

use std::time::Duration;
use systems::{
    engine::{
        engine_failure::{
            EngineFailure, EngineFailureInputs, EngineRelightEnvelope, RelightConditions,
        },
        engine_start::{
            EngineStartInputs, EngineStartPhase, EngineStartSchedule, EngineStartSequence,
        },
    },
    pneumatic::{EngineModeSelector, EngineState},
    simulation::{
        InitContext, Read, Reader, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};
use uom::si::{
    f64::{Length, Ratio, ThermodynamicTemperature, Velocity},
    length::foot,
    ratio::percent,
    thermodynamic_temperature::degree_celsius,
    velocity::knot,
};

/// The in-flight relight envelope of the A380, for one or for several engines out.
pub struct A380RelightEnvelope {
    /// Two or more engines are not running: the multiple-engine limits of the procedure apply.
    multiple_engines_out: bool,
}
impl A380RelightEnvelope {
    /// Zones 1 and 2, starter assisted relight
    const STARTER_ASSISTED_MIN_CAS_KNOTS: f64 = 150.;
    const STARTER_ASSISTED_MAX_CAS_KNOTS: f64 = 260.;
    const STARTER_ASSISTED_LOW_CEILING_FEET: f64 = 20_000.;
    const STARTER_ASSISTED_HIGH_BAND_MIN_CAS_KNOTS: f64 = 185.;
    const STARTER_ASSISTED_HIGH_BAND_CEILING_FEET: f64 = 25_000.;
    /// Zone 3, windmilling start
    const WINDMILL_MIN_CAS_KNOTS: f64 = 260.;
    const MULTIPLE_ENGINES_WINDMILL_MIN_CAS_KNOTS: f64 = 250.;
    const WINDMILL_CEILING_FEET: f64 = 30_000.;
    const MULTIPLE_ENGINES_CEILING_FEET: f64 = 28_000.;
    const MAX_CAS_KNOTS: f64 = 340.;
    /// Zone 2 (and 3, design choice), windmilling quick relight if N2 > 45 %. The same limits are
    /// used by the HP fuel valve and the ground quick relight of the start schedule.
    const QUICK_RELIGHT_MIN_CAS_KNOTS: f64 = 220.;
    const QUICK_RELIGHT_MAX_MASTER_OFF: Duration = Duration::from_secs(30);
    const QUICK_RELIGHT_MIN_N2_PERCENT: f64 = 45.;

    /// The FADEC opens the start valve of an in-flight start when the core speed is below 11 % or
    /// the CAS below 260 kt; otherwise it is a windmilling start.
    const STARTER_ASSISTED_START_BELOW_N2_PERCENT: f64 = 11.;
    const STARTER_ASSISTED_START_BELOW_CAS_KNOTS: f64 = 260.;

    /// Design choice: the windmilling core speed is proportional to the airspeed, 11 % at 260 kt
    /// (12.7 % at 300 kt) at any altitude, so that 260 kt and above gives a windmilling start while
    /// the FADEC still selects a starter assisted start below 11 %.
    const WINDMILL_N2_PERCENT_AT_260_KNOTS: f64 = 11.;
    /// Design choice: the fan windmills at 1.5 times the core speed (as the A32NX).
    const WINDMILL_N1_TO_N2_RATIO: f64 = 1.5;

    pub fn new(multiple_engines_out: bool) -> Self {
        Self {
            multiple_engines_out,
        }
    }

    /// The FADEC selects a starter assisted in-flight start (start valve open), rather than a
    /// windmilling start (start valve closed).
    pub fn in_flight_start_is_starter_assisted(
        core_speed: Ratio,
        calibrated_airspeed: Velocity,
    ) -> bool {
        core_speed.get::<percent>() < Self::STARTER_ASSISTED_START_BELOW_N2_PERCENT
            || calibrated_airspeed.get::<knot>() < Self::STARTER_ASSISTED_START_BELOW_CAS_KNOTS
    }

    fn windmill_min_cas_knots(&self) -> f64 {
        if self.multiple_engines_out {
            Self::MULTIPLE_ENGINES_WINDMILL_MIN_CAS_KNOTS
        } else {
            Self::WINDMILL_MIN_CAS_KNOTS
        }
    }

    fn ceiling_feet(&self) -> f64 {
        if self.multiple_engines_out {
            Self::MULTIPLE_ENGINES_CEILING_FEET
        } else {
            Self::WINDMILL_CEILING_FEET
        }
    }

    /// Zones 1 and 2 of the chart.
    fn is_in_starter_assisted_zone(&self, cas_knots: f64, altitude_feet: f64) -> bool {
        if altitude_feet > self.ceiling_feet() {
            false
        } else if altitude_feet <= Self::STARTER_ASSISTED_LOW_CEILING_FEET {
            (Self::STARTER_ASSISTED_MIN_CAS_KNOTS..=Self::STARTER_ASSISTED_MAX_CAS_KNOTS)
                .contains(&cas_knots)
        } else {
            altitude_feet <= Self::STARTER_ASSISTED_HIGH_BAND_CEILING_FEET
                && (Self::STARTER_ASSISTED_HIGH_BAND_MIN_CAS_KNOTS
                    ..=Self::STARTER_ASSISTED_MAX_CAS_KNOTS)
                    .contains(&cas_knots)
        }
    }

    /// Zone 3 of the chart.
    fn is_in_windmill_zone(&self, cas_knots: f64, altitude_feet: f64) -> bool {
        altitude_feet <= self.ceiling_feet()
            && (self.windmill_min_cas_knots()..=Self::MAX_CAS_KNOTS).contains(&cas_knots)
    }

    /// Zone 2 of the chart, and zone 3 (design choice).
    fn is_in_quick_relight_zone(&self, cas_knots: f64, altitude_feet: f64) -> bool {
        let zone_2 = altitude_feet <= Self::STARTER_ASSISTED_LOW_CEILING_FEET
            && (Self::QUICK_RELIGHT_MIN_CAS_KNOTS..Self::WINDMILL_MIN_CAS_KNOTS)
                .contains(&cas_knots);
        zone_2 || self.is_in_windmill_zone(cas_knots, altitude_feet)
    }
}
impl EngineRelightEnvelope for A380RelightEnvelope {
    fn engine_lights_up(&self, conditions: &RelightConditions) -> bool {
        if conditions.on_ground {
            return conditions.starter_air_pressurized;
        }

        let cas_knots = conditions.indicated_airspeed.get::<knot>();
        let altitude_feet = conditions.pressure_altitude.get::<foot>();
        let quick_relight = self.is_in_quick_relight_zone(cas_knots, altitude_feet)
            && conditions.master_off_duration < Self::QUICK_RELIGHT_MAX_MASTER_OFF
            && conditions.core_speed.get::<percent>() > Self::QUICK_RELIGHT_MIN_N2_PERCENT;

        if conditions.ignition_selected {
            self.is_in_windmill_zone(cas_knots, altitude_feet)
                || (self.is_in_starter_assisted_zone(cas_knots, altitude_feet)
                    && conditions.starter_air_pressurized)
                || quick_relight
        } else {
            quick_relight
        }
    }

    fn windmill_n1(&self, indicated_airspeed: Velocity, pressure_altitude: Length) -> Ratio {
        self.windmill_n2(indicated_airspeed, pressure_altitude) * Self::WINDMILL_N1_TO_N2_RATIO
    }

    fn windmill_n2(&self, indicated_airspeed: Velocity, _: Length) -> Ratio {
        Ratio::new::<percent>(
            Self::WINDMILL_N2_PERCENT_AT_260_KNOTS * indicated_airspeed.get::<knot>().max(0.)
                / Self::WINDMILL_MIN_CAS_KNOTS,
        )
    }
}

/// The A380 start sequence numbers. The documented "N2" is the HP spool of the GP7270: on the
/// A380X (Trent 900) it is the FBW N3, as for the start valve and the relight envelope.
pub fn a380_engine_start_schedule() -> EngineStartSchedule {
    EngineStartSchedule {
        // Ignition, FMV and HP fuel valve at 20 % N2. Design choice: the 20 % rule rather than the
        // "20 s after 20 % N2" of the igniter description, as the igniter indication of the FADEC.
        ground_ignition_on_n2: Ratio::new::<percent>(20.),
        // The automatic start ignition stops at about 58 % N2.
        automatic_start_ignition_off_n2: Ratio::new::<percent>(58.),
        // The manual start ignition stops at about 56 % N2.
        manual_start_ignition_off_n2: Ratio::new::<percent>(56.),
        fuel_on_n2: Ratio::new::<percent>(20.),
        // The start valve closes above 58.4 % N2.
        start_valve_close_n2: Ratio::new::<percent>(58.4),
        // On the ground an automatic start is no longer aborted above 58.4 % N2.
        start_abort_inhibition_n2: Ratio::new::<percent>(58.4),
        // Design choice: no light-up time is given for the automatic start; the manual start
        // procedure checks N1 and EGT rising within 20 s of the MASTER ON.
        no_light_up_time: Duration::from_secs(20),
        // An in-flight relight must light up within 30 s after the fuel flow increases.
        in_flight_no_light_up_time: Duration::from_secs(30),
        // NO STARTER AIR PRESSURE is also monitored in flight.
        monitors_in_flight_start_air: true,
        // EGT limit during the ground start.
        start_egt_limit: ThermodynamicTemperature::new::<degree_celsius>(745.),
        // EGT limit during an in-flight relight.
        relight_egt_limit: Some(ThermodynamicTemperature::new::<degree_celsius>(865.)),
        // Two more automatic attempts after a crank; after the third the start is aborted.
        automatic_start_attempts: 3,
        // Design choice: the dry crank that clears the fuel vapours after a start fault lasts 30 s.
        automatic_crank_time: Duration::from_secs(30),
        // Starter time: above 5 min of continuous operation, START FAULT STARTER TIME EXCEEDED.
        starter_time_limit: Some(Duration::from_secs(5 * 60)),
        // The continuous ignition uses both igniters.
        continuous_ignition_uses_both_igniters: true,
        // A380X behaviour kept as it was before the A32NX start changes: the manual start lights up
        // at the automatic light-up speed, every start fault cranks before the next attempt, and no
        // starter fault is detected in flight.
        manual_start_fuel_on_n2: Ratio::new::<percent>(20.),
        stall_or_egt_restart_before_crank: false,
        starter_fault_detected_in_flight: false,
    }
}

/// What the HP fuel valve of an engine depends on, for one update.
struct HpFuelValveInputs {
    on_ground: bool,
    master_switch_is_on: bool,
    /// The engine fuel is cut (`EngineFailure::fuel_is_cut`).
    fuel_is_cut: bool,
    /// On the ground, the FADEC start sequence gives the engine its fuel (see
    /// `A380EngineFailure::ground_start_fuel_on`).
    ground_start_fuel_on: bool,
    /// The core speed (FADEC N3, the documented N2).
    core_speed: Ratio,
    /// The aircraft presets start the engines at once, without start sequence.
    preset_quick_mode: bool,
}

/// The HP fuel valve of one engine: MSFS fuel valve 60 to 63 (see a380_systems_wasm), which feeds
/// the engine after its Extra tank, so MSFS burns exactly while it is open.
///
/// - The master OFF closes it.
/// - On the ground the start sequence opens it at 20 % N2, after the ENG START selector was set to
///   IGN START; at NORM the MASTER ON starts nothing (measured in the sim: without this, the MSFS
///   starter, which follows the lever, turned the core and MSFS lit it at 22 % N2 with no FADEC start).
/// - The quick relight (master ON-OFF-ON within 30 s, N2 above 45 %) opens it at once.
///
/// The valve opens, ENG MASTER ON and fuel not cut, for:
/// - in flight, any engine: the in-flight relight logic (relight envelope, quick relight, starter
///   assisted and windmilling starts) keeps the fuel cut until the engine may light up;
/// - on the ground, the FADEC start sequence at its fuel-on point, the quick relight, the aircraft
///   presets, and a flight loaded with the master ON (engine running).
///
/// It then stays open until the master OFF or a fuel cut: a running engine keeps its fuel when the
/// selector is set back to NORM, and its auto relight has fuel.
struct HpFuelValve {
    is_open: bool,
    /// None until the first update: a flight loaded with the master ON is a running engine.
    previous_master_switch_is_on: Option<bool>,
    /// How long the ENG MASTER has been OFF, or stayed OFF before its last MASTER ON.
    master_off_duration: Duration,
}
impl HpFuelValve {
    fn new() -> Self {
        Self {
            is_open: false,
            previous_master_switch_is_on: None,
            master_off_duration: Duration::ZERO,
        }
    }

    fn update(&mut self, delta: Duration, inputs: &HpFuelValveInputs) {
        let flight_loaded_with_master_on =
            self.previous_master_switch_is_on.is_none() && inputs.master_switch_is_on;
        if !inputs.master_switch_is_on {
            if self.previous_master_switch_is_on != Some(false) {
                self.master_off_duration = Duration::ZERO;
            }
            self.master_off_duration += delta;
        }
        self.previous_master_switch_is_on = Some(inputs.master_switch_is_on);

        let quick_relight = self.master_off_duration
            <= A380RelightEnvelope::QUICK_RELIGHT_MAX_MASTER_OFF
            && inputs.core_speed.get::<percent>()
                > A380RelightEnvelope::QUICK_RELIGHT_MIN_N2_PERCENT;
        let opens = !inputs.on_ground
            || inputs.ground_start_fuel_on
            || quick_relight
            || inputs.preset_quick_mode
            || flight_loaded_with_master_on;

        self.is_open = inputs.master_switch_is_on && !inputs.fuel_is_cut && (self.is_open || opens);
    }

    fn is_closed(&self) -> bool {
        !self.is_open
    }
}

/// The engine failures, start sequence and ignition faults of one A380 engine and the variables
/// they read.
struct A380EngineFailure {
    failure: EngineFailure,
    start: EngineStartSequence,
    manual_start_id: VariableIdentifier,
    fire_push_button_id: VariableIdentifier,
    egt_id: VariableIdentifier,
    start_valve_open_id: VariableIdentifier,
    thrust_lever_angle_id: VariableIdentifier,
    preset_quick_mode_id: VariableIdentifier,
    manual_start_is_on: bool,
    fire_push_button_is_released: bool,
    egt: ThermodynamicTemperature,
    start_valve_is_open: bool,
    thrust_lever_angle_degrees: f64,
    preset_quick_mode: bool,

    master_switch_id: VariableIdentifier,
    engine_start_selector_id: VariableIdentifier,
    starter_pressurized_id: VariableIdentifier,
    engine_state_id: VariableIdentifier,
    core_speed_id: VariableIdentifier,
    relight_attempt_id: VariableIdentifier,
    windmill_start_id: VariableIdentifier,
    hp_fuel_valve_closed_id: VariableIdentifier,

    hp_fuel_valve: HpFuelValve,

    master_switch_is_on: bool,
    /// The ENG START selector (one for the four engines): 0 CRANK, 1 NORM, 2 IGN START.
    engine_start_selector: f64,
    starter_air_pressurized: bool,
    engine_state: EngineState,
    core_speed: Ratio,
    windmill_start: bool,
}
impl A380EngineFailure {
    const ENGINE_START_SELECTOR_IGN_START: f64 = 2.;

    fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            failure: EngineFailure::new(context, engine_number),
            start: EngineStartSequence::new(context, engine_number),
            manual_start_id: context.get_identifier(format!("ENGMANSTART{}_TOGGLE", engine_number)),
            fire_push_button_id: context
                .get_identifier(format!("FIRE_BUTTON_ENG{}", engine_number)),
            egt_id: context.get_identifier(format!("ENGINE_EGT:{}", engine_number)),
            start_valve_open_id: context
                .get_identifier(format!("PNEU_ENG_{}_STARTER_VALVE_OPEN", engine_number)),
            thrust_lever_angle_id: context
                .get_identifier(format!("AUTOTHRUST_TLA:{}", engine_number)),
            preset_quick_mode_id: context.get_identifier("AIRCRAFT_PRESET_QUICK_MODE".to_owned()),
            manual_start_is_on: false,
            fire_push_button_is_released: false,
            egt: ThermodynamicTemperature::default(),
            start_valve_is_open: false,
            thrust_lever_angle_degrees: 0.,
            preset_quick_mode: false,
            // The ENG MASTER lever drives the MSFS engine valve 1 to 4 (and the MSFS starter).
            master_switch_id: context
                .get_identifier(format!("FUELSYSTEM VALVE SWITCH:{}", engine_number)),
            // The selector position, not the MSFS ignition switch of the engine: the FADEC sets the
            // latter to IGN during an in-flight relight (FADEC A380X, relight ignition).
            engine_start_selector_id: context.get_identifier("XMLVAR_ENG_MODE_SEL".to_owned()),
            starter_pressurized_id: context
                .get_identifier(format!("PNEU_ENG_{}_STARTER_PRESSURIZED", engine_number)),
            engine_state_id: context.get_identifier(format!("ENGINE_STATE:{}", engine_number)),
            core_speed_id: context.get_identifier(format!("ENGINE_N3:{}", engine_number)),
            relight_attempt_id: context
                .get_identifier(format!("ENGINE_{}_RELIGHT_ATTEMPT", engine_number)),
            windmill_start_id: context
                .get_identifier(format!("ENGINE_{}_WINDMILL_START", engine_number)),
            hp_fuel_valve_closed_id: context
                .get_identifier(format!("ENGINE_{}_HP_FUEL_VALVE_CLOSED", engine_number)),
            hp_fuel_valve: HpFuelValve::new(),
            master_switch_is_on: false,
            engine_start_selector: 1.,
            starter_air_pressurized: false,
            engine_state: EngineState::Off,
            core_speed: Ratio::default(),
            windmill_start: false,
        }
    }

    fn is_running(&self) -> bool {
        self.engine_state == EngineState::On
    }

    /// On the ground the FADEC start sequence (IGN START, then the MASTER ON) keeps the fuel cut
    /// until its fuel-on point at 20 % N2, so the HP fuel valve opens there.
    fn ground_start_fuel_on(&self) -> bool {
        self.start.phase() == EngineStartPhase::Starting
    }

    /// Design choice: the thrust lever is at idle within 1 degree of the IDLE detent (TLA 0).
    const THRUST_LEVER_IDLE_MAX_ANGLE_DEGREES: f64 = 1.;

    fn engine_start_selector(&self) -> EngineModeSelector {
        match self.engine_start_selector.round() as i64 {
            0 => EngineModeSelector::Crank,
            2 => EngineModeSelector::Ignition,
            _ => EngineModeSelector::Norm,
        }
    }

    fn start_inputs(&self) -> EngineStartInputs {
        EngineStartInputs {
            master_switch_is_on: self.master_switch_is_on,
            mode_selector: self.engine_start_selector(),
            manual_start_is_on: self.manual_start_is_on,
            fire_push_button_is_released: self.fire_push_button_is_released,
            engine_state: self.engine_state,
            core_speed: self.core_speed,
            egt: self.egt,
            start_valve_is_open: self.start_valve_is_open,
            starter_air_pressurized: self.starter_air_pressurized,
            thrust_lever_at_idle: self.thrust_lever_angle_degrees.abs()
                <= Self::THRUST_LEVER_IDLE_MAX_ANGLE_DEGREES,
            preset_quick_mode: self.preset_quick_mode,
            relight_pending: self.failure.is_flamed_out() || self.failure.is_seized(),
            // Not modelled on the A380X (its continuous ignition of the FADEC AUTO RELIGHT is in
            // the FADEC, EngineIgnition_A380X.hpp).
            automatic_continuous_ignition: false,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        envelope: &A380RelightEnvelope,
        lp_valve_starved: bool,
        start_schedule: &EngineStartSchedule,
    ) {
        let start_inputs = self.start_inputs();
        self.start.update(context, start_schedule, &start_inputs);

        self.failure.update(
            context,
            envelope,
            EngineFailureInputs {
                master_switch_is_on: self.master_switch_is_on,
                ignition_selected: self.engine_start_selector
                    == Self::ENGINE_START_SELECTOR_IGN_START,
                // A starter that has failed gives no starter assisted relight.
                starter_air_pressurized: self.starter_air_pressurized
                    && !self.start.starter_has_failed(),
                engine_is_running: self.is_running(),
                core_speed: self.core_speed,
                lp_valve_starved,
                start_sequence_fuel_cut: self.start.fuel_is_cut(),
                ignition_available: self.start.ignition_is_available(),
                automatic_continuous_ignition: false,
            },
        );

        self.start
            .update_starter_motoring(context, self.failure.fuel_is_cut(), &start_inputs);

        self.hp_fuel_valve.update(
            context.delta(),
            &HpFuelValveInputs {
                on_ground: context.is_on_ground(),
                master_switch_is_on: self.master_switch_is_on,
                fuel_is_cut: self.failure.fuel_is_cut(),
                ground_start_fuel_on: self.ground_start_fuel_on(),
                core_speed: self.core_speed,
                preset_quick_mode: self.preset_quick_mode,
            },
        );

        // A windmilling start: an in-flight start (the FADEC is starting the engine with the
        // master ON) that the FADEC does not assist with the starter.
        let starting = matches!(
            self.engine_state,
            EngineState::Starting | EngineState::Restarting
        );
        self.windmill_start = !context.is_on_ground()
            && self.master_switch_is_on
            && starting
            && !self.failure.is_seized()
            && !A380RelightEnvelope::in_flight_start_is_starter_assisted(
                self.core_speed,
                context.indicated_airspeed(),
            );
    }
}
impl SimulationElement for A380EngineFailure {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);
        self.start.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.master_switch_is_on = reader.read(&self.master_switch_id);
        self.engine_start_selector = reader.read(&self.engine_start_selector_id);
        self.starter_air_pressurized = reader.read(&self.starter_pressurized_id);
        self.engine_state = reader.read_discrete_or_fallback(
            &self.engine_state_id,
            "EngineState",
            EngineState::Off,
        );
        self.core_speed = Ratio::new::<percent>(reader.read(&self.core_speed_id));
        self.manual_start_is_on = reader.read(&self.manual_start_id);
        self.fire_push_button_is_released = reader.read(&self.fire_push_button_id);
        self.egt = reader.read(&self.egt_id);
        self.start_valve_is_open = reader.read(&self.start_valve_open_id);
        self.thrust_lever_angle_degrees = reader.read(&self.thrust_lever_angle_id);
        self.preset_quick_mode = reader.read(&self.preset_quick_mode_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        // The FADEC runs its in-flight start sequence (start valve, igniters) from the MASTER ON
        // of a relight attempt, while the fuel stays cut until the engine lights up.
        writer.write(
            &self.relight_attempt_id,
            self.failure.relight_attempt_in_progress(),
        );
        writer.write(&self.windmill_start_id, self.windmill_start);
        writer.write(
            &self.hp_fuel_valve_closed_id,
            self.hp_fuel_valve.is_closed(),
        );
    }
}

/// The engine flameout and seizure failures, start sequences and ignition faults of the four engines.
pub struct A380EngineFailures {
    engines: [A380EngineFailure; 4],
    start_schedule: EngineStartSchedule,
}
impl A380EngineFailures {
    /// From two engines not running the multiple-engine relight limits apply.
    const MULTIPLE_ENGINES_OUT: usize = 2;

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            engines: [1, 2, 3, 4].map(|number| A380EngineFailure::new(context, number)),
            start_schedule: a380_engine_start_schedule(),
        }
    }

    /// After the fuel system, whose LP valve starvation (one per engine, engine 1 first) also cuts
    /// the fuel.
    pub fn update(&mut self, context: &UpdateContext, lp_valves_starved: [bool; 4]) {
        let engines_out = self
            .engines
            .iter()
            .filter(|engine| !engine.is_running())
            .count();
        let envelope = A380RelightEnvelope::new(engines_out >= Self::MULTIPLE_ENGINES_OUT);

        for (engine, starved) in self.engines.iter_mut().zip(lp_valves_starved) {
            engine.update(context, &envelope, starved, &self.start_schedule);
        }
    }
}
impl SimulationElement for A380EngineFailures {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for engine in &mut self.engines {
            engine.accept(visitor);
        }

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conditions(cas_knots: f64, altitude_feet: f64) -> RelightConditions {
        RelightConditions {
            on_ground: false,
            indicated_airspeed: Velocity::new::<knot>(cas_knots),
            pressure_altitude: Length::new::<foot>(altitude_feet),
            ignition_selected: true,
            starter_air_pressurized: false,
            core_speed: Ratio::new::<percent>(10.),
            master_off_duration: Duration::from_secs(60),
        }
    }

    fn lights_up(conditions: RelightConditions) -> bool {
        A380RelightEnvelope::new(false).engine_lights_up(&conditions)
    }

    fn lights_up_with_multiple_engines_out(conditions: RelightConditions) -> bool {
        A380RelightEnvelope::new(true).engine_lights_up(&conditions)
    }

    fn with_starter_air(mut conditions: RelightConditions) -> RelightConditions {
        conditions.starter_air_pressurized = true;
        conditions
    }

    fn with_starter_air_lights_up(cas_knots: f64, altitude_feet: f64) -> bool {
        lights_up(with_starter_air(conditions(cas_knots, altitude_feet)))
    }

    fn quick_cycle(cas_knots: f64, altitude_feet: f64) -> RelightConditions {
        let mut quick = conditions(cas_knots, altitude_feet);
        quick.ignition_selected = false;
        quick.core_speed = Ratio::new::<percent>(50.);
        quick.master_off_duration = Duration::from_secs(5);
        quick
    }

    #[test]
    fn windmilling_start_in_zone_3_from_260_to_340_kt_up_to_fl300() {
        assert!(lights_up(conditions(260., 0.)));
        assert!(lights_up(conditions(300., 29_000.)));
        assert!(lights_up(conditions(340., 30_000.)));
    }

    #[test]
    fn no_windmilling_start_outside_zone_3() {
        assert!(!lights_up(conditions(255., 10_000.)));
        assert!(!lights_up(conditions(345., 10_000.)));
        assert!(!lights_up(conditions(300., 31_000.)));
        assert!(!lights_up(conditions(280., 38_000.)));
    }

    #[test]
    fn starter_assisted_relight_in_zones_1_and_2_with_starter_air() {
        // zone 1
        assert!(with_starter_air_lights_up(150., 5_000.));
        assert!(with_starter_air_lights_up(210., 19_000.));
        // zone 2
        assert!(with_starter_air_lights_up(240., 15_000.));
        // the FL200-FL250 band, 185 to 260 kt
        assert!(with_starter_air_lights_up(190., 24_000.));
        assert!(with_starter_air_lights_up(255., 25_000.));
        // no starter air: no light-up below the windmill zone
        assert!(!lights_up(conditions(200., 10_000.)));
    }

    #[test]
    fn no_starter_assisted_relight_outside_zones_1_and_2() {
        assert!(!with_starter_air_lights_up(145., 5_000.));
        // 150 to 185 kt is not in the envelope above FL200
        assert!(!with_starter_air_lights_up(170., 22_000.));
        assert!(!with_starter_air_lights_up(200., 26_000.));
    }

    #[test]
    fn quick_relight_in_zone_2_within_30_s_above_45_percent_n2_at_any_selector_position() {
        assert!(lights_up(quick_cycle(240., 15_000.)));

        let mut slow_cycle = quick_cycle(240., 15_000.);
        slow_cycle.master_off_duration = Duration::from_secs(31);
        assert!(!lights_up(slow_cycle));

        let mut low_n2 = quick_cycle(240., 15_000.);
        low_n2.core_speed = Ratio::new::<percent>(44.);
        assert!(!lights_up(low_n2));

        // zone 1 and above zone 2 have no quick relight
        assert!(!lights_up(quick_cycle(200., 15_000.)));
        assert!(!lights_up(quick_cycle(240., 21_000.)));
    }

    #[test]
    fn quick_relight_also_in_the_windmill_zone() {
        assert!(lights_up(quick_cycle(300., 29_000.)));
        assert!(!lights_up(quick_cycle(300., 32_000.)));
    }

    #[test]
    fn without_ign_start_only_the_quick_relight_lights_up() {
        let mut windmill = conditions(300., 10_000.);
        windmill.ignition_selected = false;
        assert!(!lights_up(windmill));
        assert!(!lights_up(with_starter_air(windmill)));
    }

    #[test]
    fn multiple_engines_out_lower_the_ceiling_to_28000_ft_and_the_windmill_speed_to_250_kt() {
        assert!(!lights_up(conditions(255., 10_000.)));
        assert!(lights_up_with_multiple_engines_out(conditions(
            255., 10_000.
        )));

        assert!(lights_up(conditions(300., 29_000.)));
        assert!(!lights_up_with_multiple_engines_out(conditions(
            300., 29_000.
        )));
        assert!(lights_up_with_multiple_engines_out(conditions(
            300., 28_000.
        )));
    }

    #[test]
    fn on_the_ground_a_start_needs_starter_air() {
        let mut ground = conditions(0., 0.);
        ground.on_ground = true;
        assert!(!lights_up(ground));
        assert!(lights_up(with_starter_air(ground)));
    }

    #[test]
    fn the_fadec_assists_an_in_flight_start_below_11_percent_n2_or_260_kt() {
        let assisted = |n2: f64, cas: f64| {
            A380RelightEnvelope::in_flight_start_is_starter_assisted(
                Ratio::new::<percent>(n2),
                Velocity::new::<knot>(cas),
            )
        };
        assert!(assisted(10., 300.));
        assert!(assisted(15., 250.));
        assert!(!assisted(12., 270.));
    }

    fn windmill_n2_percent(cas_knots: f64, altitude_feet: f64) -> f64 {
        A380RelightEnvelope::new(false)
            .windmill_n2(
                Velocity::new::<knot>(cas_knots),
                Length::new::<foot>(altitude_feet),
            )
            .get::<percent>()
    }

    #[test]
    fn the_windmill_core_speed_is_11_percent_at_260_knots() {
        assert!((windmill_n2_percent(260., 10_000.) - 11.).abs() < 1e-9);
        assert!((windmill_n2_percent(130., 0.) - 5.5).abs() < 1e-9);
        assert!((windmill_n2_percent(300., 35_000.) - windmill_n2_percent(300., 0.)).abs() < 1e-9);
    }

    #[test]
    fn the_windmill_n1_is_one_and_a_half_times_the_windmill_core_speed() {
        let n1 = A380RelightEnvelope::new(false)
            .windmill_n1(Velocity::new::<knot>(260.), Length::new::<foot>(0.));
        assert!((n1.get::<percent>() - 16.5).abs() < 1e-9);
    }

    mod aircraft {
        use super::super::*;
        use systems::{
            failures::FailureType,
            simulation::{
                test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
                Aircraft,
            },
        };

        struct TestAircraft {
            engine_failures: A380EngineFailures,
            lp_valves_starved: [bool; 4],
        }
        impl TestAircraft {
            fn new(context: &mut InitContext) -> Self {
                Self {
                    engine_failures: A380EngineFailures::new(context),
                    lp_valves_starved: [false; 4],
                }
            }
        }
        impl Aircraft for TestAircraft {
            fn update_after_power_distribution(&mut self, context: &UpdateContext) {
                self.engine_failures.update(context, self.lp_valves_starved);
            }
        }
        impl SimulationElement for TestAircraft {
            fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
                self.engine_failures.accept(visitor);
                visitor.visit(self);
            }
        }

        fn run(test_bed: &mut SimulationTestBed<TestAircraft>) {
            test_bed.run_with_delta(Duration::from_millis(50));
        }

        /// In flight at 300 kt and FL 100, all four engines running, ENG START selector NORM.
        fn flying_test_bed() -> SimulationTestBed<TestAircraft> {
            let mut test_bed = SimulationTestBed::new(TestAircraft::new);
            test_bed.set_on_ground(false);
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(300.));
            test_bed.set_pressure_altitude(Length::new::<foot>(10_000.));
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 1.);
            for engine_number in 1..=4 {
                test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), true);
                test_bed.write_by_name(&format!("ENGINE_STATE:{}", engine_number), 1.);
                test_bed.write_by_name(&format!("ENGINE_N3:{}", engine_number), 80.);
            }
            run(&mut test_bed);
            test_bed
        }

        fn fuel_is_cut(
            test_bed: &mut SimulationTestBed<TestAircraft>,
            engine_number: usize,
        ) -> bool {
            test_bed.read_by_name(&format!("ENGINE_{}_FUEL_CUT", engine_number))
        }

        /// The flameout of an engine: the FADEC then reports it shutting down, windmilling.
        fn flame_out(test_bed: &mut SimulationTestBed<TestAircraft>, engine_number: usize) {
            test_bed.fail(FailureType::EngineFlameout(engine_number));
            run(test_bed);
            test_bed.write_by_name(&format!("ENGINE_STATE:{}", engine_number), 4.);
            test_bed.write_by_name(&format!("ENGINE_N3:{}", engine_number), 12.);
            run(test_bed);
        }

        fn master_off_then_on(
            test_bed: &mut SimulationTestBed<TestAircraft>,
            engine_number: usize,
        ) {
            test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), false);
            run(test_bed);
            test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), true);
            run(test_bed);
        }

        #[test]
        fn the_flameout_of_engine_3_cuts_its_fuel_only() {
            let mut test_bed = flying_test_bed();
            flame_out(&mut test_bed, 3);

            for engine_number in [1, 2, 4] {
                assert!(!fuel_is_cut(&mut test_bed, engine_number));
            }
            assert!(fuel_is_cut(&mut test_bed, 3));
        }

        #[test]
        fn engine_4_relights_with_ign_start_and_the_master_off_then_on_in_the_windmill_zone() {
            let mut test_bed = flying_test_bed();
            flame_out(&mut test_bed, 4);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:4", false);
            run(&mut test_bed);
            assert!(fuel_is_cut(&mut test_bed, 4));

            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:4", true);
            run(&mut test_bed);
            assert!(!fuel_is_cut(&mut test_bed, 4));
        }

        #[test]
        fn the_ign_start_position_is_read_from_the_eng_start_selector() {
            // The MSFS ignition switch of the engine at IGN is not the selector (the FADEC sets it
            // during a relight): with the selector at NORM there is no IGN START relight.
            let mut test_bed = flying_test_bed();
            flame_out(&mut test_bed, 2);
            test_bed.write_by_name("TURB ENG IGNITION SWITCH EX1:2", 2.);
            test_bed.write_by_name("ENGINE_N3:2", 12.);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", false);
            for _ in 0..(35 * 20) {
                run(&mut test_bed);
            }
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", true);
            run(&mut test_bed);

            assert!(fuel_is_cut(&mut test_bed, 2));
        }

        #[test]
        fn a_starter_assisted_relight_reads_the_starter_air_of_its_engine() {
            let mut test_bed = flying_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(200.));
            flame_out(&mut test_bed, 1);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            master_off_then_on(&mut test_bed, 1);
            assert!(fuel_is_cut(&mut test_bed, 1));
            let attempt: bool = test_bed.read_by_name("ENGINE_1_RELIGHT_ATTEMPT");
            assert!(
                attempt,
                "the FADEC runs its start sequence during the attempt"
            );

            test_bed.write_by_name("PNEU_ENG_2_STARTER_PRESSURIZED", true);
            run(&mut test_bed);
            assert!(fuel_is_cut(&mut test_bed, 1));

            test_bed.write_by_name("PNEU_ENG_1_STARTER_PRESSURIZED", true);
            run(&mut test_bed);
            assert!(!fuel_is_cut(&mut test_bed, 1));
            let attempt: bool = test_bed.read_by_name("ENGINE_1_RELIGHT_ATTEMPT");
            assert!(!attempt);
        }

        #[test]
        fn a_quick_relight_at_norm_lights_up_with_the_fadec_core_speed_5_s_after_the_flameout() {
            // FL150, 240 kt (zone 2), ENG START NORM, MASTER OFF then ON within about 5 s. The FADEC
            // holds N3 for 1.8 s, then it decays at 8.2 %/s (Polynomial_A380X::shutdownN3):
            // 80 % * exp(-0.08183 * 3.2) = 62 % at 5 s.
            let mut test_bed = flying_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(240.));
            test_bed.set_pressure_altitude(Length::new::<foot>(15_000.));
            test_bed.fail(FailureType::EngineFlameout(4));
            run(&mut test_bed);
            test_bed.write_by_name("ENGINE_STATE:4", 4.);
            test_bed.write_by_name("ENGINE_N3:4", 62.);
            master_off_then_on(&mut test_bed, 4);

            assert!(!fuel_is_cut(&mut test_bed, 4));
            let relight_ignition: bool = test_bed.read_by_name("ENGINE_4_RELIGHT_IGNITION");
            assert!(relight_ignition, "the FADEC sets the igniters at NORM");
        }

        #[test]
        fn a_cleared_seizure_relights_by_windmilling_at_300_kt() {
            let mut test_bed = flying_test_bed();
            test_bed.fail(FailureType::EngineSeizure(2));
            run(&mut test_bed);
            test_bed.write_by_name("ENGINE_STATE:2", 4.);
            test_bed.write_by_name("ENGINE_N3:2", 0.);
            run(&mut test_bed);
            test_bed.unfail(FailureType::EngineSeizure(2));
            // the FADEC windmills the core again
            test_bed.write_by_name("ENGINE_N3:2", 12.7);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            master_off_then_on(&mut test_bed, 2);

            assert!(!fuel_is_cut(&mut test_bed, 2));
        }

        #[test]
        fn two_engines_out_use_the_multiple_engine_windmill_speed() {
            let mut test_bed = flying_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(255.));
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);

            // one engine out: 255 kt is below the single engine windmill speed
            flame_out(&mut test_bed, 1);
            master_off_then_on(&mut test_bed, 1);
            assert!(fuel_is_cut(&mut test_bed, 1));

            // two engines out: 250 kt
            flame_out(&mut test_bed, 2);
            master_off_then_on(&mut test_bed, 1);
            assert!(!fuel_is_cut(&mut test_bed, 1));
        }

        #[test]
        fn the_lp_valve_starvation_still_cuts_the_fuel() {
            let mut test_bed = flying_test_bed();
            test_bed.command(|a| a.lp_valves_starved = [false, false, true, false]);
            run(&mut test_bed);

            assert!(fuel_is_cut(&mut test_bed, 3));
            assert!(!fuel_is_cut(&mut test_bed, 1));
        }

        /// On the ground, all engines off, APU bleed air at the starters, ENG START IGN START.
        fn ground_test_bed() -> SimulationTestBed<TestAircraft> {
            let mut test_bed = SimulationTestBed::new(TestAircraft::new);
            test_bed.set_on_ground(true);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            for engine_number in 1..=4 {
                test_bed.write_by_name(
                    &format!("PNEU_ENG_{}_STARTER_PRESSURIZED", engine_number),
                    true,
                );
            }
            run(&mut test_bed);
            test_bed
        }

        /// ENG MASTER ON: the FADEC starts the engine, whose start valve opens; N3 at the light-up.
        fn automatic_start(test_bed: &mut SimulationTestBed<TestAircraft>, engine_number: usize) {
            test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), true);
            run(test_bed);
            test_bed.write_by_name(&format!("ENGINE_STATE:{}", engine_number), 2.);
            test_bed.write_by_name(
                &format!("PNEU_ENG_{}_STARTER_VALVE_OPEN", engine_number),
                true,
            );
            test_bed.write_by_name(&format!("ENGINE_N3:{}", engine_number), 22.);
            run(test_bed);
        }

        fn run_for_seconds(test_bed: &mut SimulationTestBed<TestAircraft>, seconds: u64) {
            for _ in 0..seconds * 20 {
                run(test_bed);
            }
        }

        #[test]
        fn a_ground_start_of_engine_4_lights_up_with_a_working_igniter() {
            let mut test_bed = ground_test_bed();
            automatic_start(&mut test_bed, 4);

            assert!(!fuel_is_cut(&mut test_bed, 4));
            let igniters: f64 = test_bed.read_by_name("ENGINE_4_IGNITERS");
            assert_eq!(igniters, 1.);
        }

        #[test]
        fn a_ground_start_without_working_igniter_is_aborted_after_three_attempts() {
            let mut test_bed = ground_test_bed();
            test_bed.fail(FailureType::EngineIgniterA(2));
            test_bed.fail(FailureType::EngineIgniterB(2));
            automatic_start(&mut test_bed, 2);
            assert!(fuel_is_cut(&mut test_bed, 2));

            // 20 s without light up, then the 30 s dry crank, three times
            run_for_seconds(&mut test_bed, 21);
            let fault: f64 = test_bed.read_by_name("ENGINE_2_START_FAULT");
            assert_eq!(fault, 1.);
            run_for_seconds(&mut test_bed, 3 * 50);
            let phase: f64 = test_bed.read_by_name("ENGINE_2_START_PHASE");
            assert_eq!(phase, 4.);
            let fault_light: bool = test_bed.read_by_name("ENGINE_2_FAULT_LIGHT");
            assert!(fault_light);
            assert!(!fuel_is_cut(&mut test_bed, 1));
        }

        #[test]
        fn a_start_longer_than_5_minutes_exceeds_the_starter_time() {
            let mut test_bed = ground_test_bed();
            automatic_start(&mut test_bed, 1);
            // a slow but rising start, below the 58.4 % end of the starter assistance
            for second in 0..302 {
                test_bed.write_by_name("ENGINE_N3:1", 22. + second as f64 * 0.12);
                run_for_seconds(&mut test_bed, 1);
            }
            let fault: f64 = test_bed.read_by_name("ENGINE_1_START_FAULT");
            assert_eq!(fault, 8.);
        }

        #[test]
        fn the_a380_start_schedule_has_the_a380_start_values() {
            let schedule = a380_engine_start_schedule();
            assert_eq!(schedule.ground_ignition_on_n2.get::<percent>(), 20.);
            assert_eq!(schedule.start_valve_close_n2.get::<percent>(), 58.4);
            assert_eq!(schedule.start_abort_inhibition_n2.get::<percent>(), 58.4);
            assert_eq!(schedule.start_egt_limit.get::<degree_celsius>(), 745.);
            // 865 °C in a relight
            let relight_egt_limit = schedule
                .relight_egt_limit
                .map_or(0., |limit| limit.get::<degree_celsius>());
            assert!((relight_egt_limit - 865.).abs() < 1e-6);
            assert_eq!(schedule.automatic_start_attempts, 3);
            assert_eq!(schedule.starter_time_limit, Some(Duration::from_secs(300)));
            assert!(schedule.continuous_ignition_uses_both_igniters);
            // 30 s for an in-flight relight, and NO STARTER AIR PRESSURE is monitored in flight
            assert_eq!(schedule.in_flight_no_light_up_time, Duration::from_secs(30));
            assert!(schedule.monitors_in_flight_start_air);
        }

        #[test]
        fn in_flight_no_light_up_comes_after_the_30_s_of_the_relight() {
            let mut test_bed = flying_test_bed();
            test_bed.fail(FailureType::EngineIgniterA(1));
            test_bed.fail(FailureType::EngineIgniterB(1));
            flame_out(&mut test_bed, 1);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            master_off_then_on(&mut test_bed, 1);

            run_for_seconds(&mut test_bed, 25);
            let fault: f64 = test_bed.read_by_name("ENGINE_1_START_FAULT");
            assert_eq!(fault, 0.);
            run_for_seconds(&mut test_bed, 6);
            let fault: f64 = test_bed.read_by_name("ENGINE_1_START_FAULT");
            assert_eq!(fault, 1.);
        }

        #[test]
        fn in_flight_a_start_valve_open_without_starter_air_is_no_starter_air_pressure() {
            // 250 kt: a starter assisted relight; no bleed air at the starter
            let mut test_bed = flying_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(250.));
            flame_out(&mut test_bed, 1);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            test_bed.write_by_name("PNEU_ENG_1_STARTER_PRESSURIZED", false);
            test_bed.write_by_name("PNEU_ENG_1_STARTER_VALVE_OPEN", true);
            master_off_then_on(&mut test_bed, 1);

            run_for_seconds(&mut test_bed, 11);
            let fault: f64 = test_bed.read_by_name("ENGINE_1_START_FAULT");
            assert_eq!(fault, 6.);
        }

        #[test]
        fn without_a_working_igniter_no_relight_lights_up_in_flight() {
            let mut test_bed = flying_test_bed();
            test_bed.fail(FailureType::EngineIgniterA(1));
            test_bed.fail(FailureType::EngineIgniterB(1));
            flame_out(&mut test_bed, 1);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            master_off_then_on(&mut test_bed, 1);

            assert!(fuel_is_cut(&mut test_bed, 1));
        }

        #[test]
        fn a_windmilling_start_is_reported_for_the_hydraulic_pumps() {
            let mut test_bed = flying_test_bed();
            flame_out(&mut test_bed, 1);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            master_off_then_on(&mut test_bed, 1);
            // the FADEC starts the engine: 300 kt and N3 12 %, no start valve
            test_bed.write_by_name("ENGINE_STATE:1", 3.);
            run(&mut test_bed);
            let windmill_start: bool = test_bed.read_by_name("ENGINE_1_WINDMILL_START");
            assert!(windmill_start);

            // below 260 kt it is a starter assisted start
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(250.));
            run(&mut test_bed);
            let windmill_start: bool = test_bed.read_by_name("ENGINE_1_WINDMILL_START");
            assert!(!windmill_start);

            // the engine runs
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(300.));
            test_bed.write_by_name("ENGINE_STATE:1", 1.);
            run(&mut test_bed);
            let windmill_start: bool = test_bed.read_by_name("ENGINE_1_WINDMILL_START");
            assert!(!windmill_start);
        }

        /// On the ground, all four engines running at idle, ENG START selector IGN START.
        fn engines_at_ground_idle_test_bed() -> SimulationTestBed<TestAircraft> {
            let mut test_bed = SimulationTestBed::new(TestAircraft::new);
            test_bed.set_on_ground(true);
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(0.));
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            for engine_number in 1..=4 {
                test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), true);
                test_bed.write_by_name(&format!("ENGINE_STATE:{}", engine_number), 1.);
                test_bed.write_by_name(&format!("ENGINE_N3:{}", engine_number), 63.);
            }
            run(&mut test_bed);
            test_bed
        }

        fn hp_fuel_valve_is_closed(
            test_bed: &mut SimulationTestBed<TestAircraft>,
            engine_number: usize,
        ) -> bool {
            test_bed.read_by_name(&format!("ENGINE_{}_HP_FUEL_VALVE_CLOSED", engine_number))
        }

        #[test]
        fn the_hp_fuel_valves_of_running_engines_are_open() {
            let mut test_bed = engines_at_ground_idle_test_bed();

            for engine_number in 1..=4 {
                assert!(!hp_fuel_valve_is_closed(&mut test_bed, engine_number));
            }
        }

        #[test]
        fn the_eng_master_off_closes_the_hp_fuel_valve_of_its_engine_at_once() {
            // Measured in the sim: after the master OFF on the ground MSFS kept the combustion and
            // 63 % N2 for 34 s, and a restart in that time skipped the start sequence. The master OFF
            // closes the fuel valves.
            let mut test_bed = engines_at_ground_idle_test_bed();
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", false);
            run(&mut test_bed);

            assert!(hp_fuel_valve_is_closed(&mut test_bed, 2));
            for engine_number in [1, 3, 4] {
                assert!(!hp_fuel_valve_is_closed(&mut test_bed, engine_number));
            }
            // The FADEC shuts the engine down from the master itself: no fuel cut, which it would
            // handle as an engine that cannot be restarted.
            assert!(!fuel_is_cut(&mut test_bed, 2));
        }

        #[test]
        fn the_hp_fuel_valve_stays_closed_while_the_engine_spins_down_with_the_master_off() {
            let mut test_bed = engines_at_ground_idle_test_bed();
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", false);
            run(&mut test_bed);
            test_bed.write_by_name("ENGINE_STATE:2", 4.);
            for n3 in [55., 30., 9.2] {
                test_bed.write_by_name("ENGINE_N3:2", n3);
                run(&mut test_bed);
                assert!(hp_fuel_valve_is_closed(&mut test_bed, 2));
            }
        }

        #[test]
        fn a_crew_shutdown_in_flight_closes_the_hp_fuel_valve() {
            let mut test_bed = flying_test_bed();
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:3", false);
            run(&mut test_bed);

            assert!(hp_fuel_valve_is_closed(&mut test_bed, 3));
        }

        /// On the ground, engine 2 shut down and at rest (ENG MASTER OFF for 2 min), the three other
        /// engines running, ENG START selector at the given position.
        fn engine_2_shut_down_test_bed(selector: f64) -> SimulationTestBed<TestAircraft> {
            let mut test_bed = engines_at_ground_idle_test_bed();
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", false);
            run(&mut test_bed);
            test_bed.write_by_name("ENGINE_STATE:2", 0.);
            test_bed.write_by_name("ENGINE_N3:2", 0.);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", selector);
            for _ in 0..(120 * 20) {
                run(&mut test_bed);
            }
            test_bed
        }

        #[test]
        fn on_the_ground_a_master_on_at_norm_leaves_the_hp_fuel_valve_closed() {
            // Measured in the sim: MASTER ON at NORM, the MSFS starter turned the core and MSFS lit
            // it at 22 % N2 without a FADEC start.
            let mut test_bed = engine_2_shut_down_test_bed(1.);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", true);
            run(&mut test_bed);
            assert!(hp_fuel_valve_is_closed(&mut test_bed, 2));

            // the MSFS starter turns the core up to 25 %
            for second in 0..30 {
                test_bed.write_by_name("ENGINE_N3:2", (second as f64).min(25.));
                for _ in 0..20 {
                    run(&mut test_bed);
                }
                assert!(hp_fuel_valve_is_closed(&mut test_bed, 2));
            }
            for engine_number in [1, 3, 4] {
                assert!(!hp_fuel_valve_is_closed(&mut test_bed, engine_number));
            }
        }

        /// IGN START, then ENG MASTER 2 ON: the FADEC starts the engine with APU air at the open
        /// start valve; N3 at the light-up.
        fn start_engine_2(test_bed: &mut SimulationTestBed<TestAircraft>) {
            test_bed.write_by_name("PNEU_ENG_2_STARTER_PRESSURIZED", true);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", true);
            run(test_bed);
            test_bed.write_by_name("ENGINE_STATE:2", 2.);
            test_bed.write_by_name("PNEU_ENG_2_STARTER_VALVE_OPEN", true);
            test_bed.write_by_name("ENGINE_N3:2", 22.);
            run(test_bed);
        }

        #[test]
        fn on_the_ground_the_ign_start_start_opens_the_hp_fuel_valve() {
            let mut test_bed = engine_2_shut_down_test_bed(2.);
            start_engine_2(&mut test_bed);

            assert!(!hp_fuel_valve_is_closed(&mut test_bed, 2));
        }

        #[test]
        fn a_started_engine_keeps_its_hp_fuel_valve_open_with_the_selector_back_at_norm() {
            let mut test_bed = engine_2_shut_down_test_bed(2.);
            start_engine_2(&mut test_bed);
            test_bed.write_by_name("ENGINE_STATE:2", 1.);
            test_bed.write_by_name("ENGINE_N3:2", 63.);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 1.);
            for _ in 0..(60 * 20) {
                run(&mut test_bed);
            }

            assert!(!hp_fuel_valve_is_closed(&mut test_bed, 2));
        }

        #[test]
        fn on_the_ground_the_quick_relight_at_norm_opens_the_hp_fuel_valve_within_30_s() {
            // Quick relight: MASTER OFF then ON within 30 s, N2 above 45 %
            let mut test_bed = engines_at_ground_idle_test_bed();
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 1.);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:3", false);
            for _ in 0..(5 * 20) {
                run(&mut test_bed);
            }
            test_bed.write_by_name("ENGINE_STATE:3", 4.);
            test_bed.write_by_name("ENGINE_N3:3", 55.);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:3", true);
            run(&mut test_bed);

            assert!(!hp_fuel_valve_is_closed(&mut test_bed, 3));
        }

        #[test]
        fn on_the_ground_no_quick_relight_after_30_s_with_the_master_off() {
            let mut test_bed = engines_at_ground_idle_test_bed();
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 1.);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:3", false);
            for _ in 0..(31 * 20) {
                run(&mut test_bed);
            }
            test_bed.write_by_name("ENGINE_STATE:3", 4.);
            test_bed.write_by_name("ENGINE_N3:3", 50.);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:3", true);
            run(&mut test_bed);

            assert!(hp_fuel_valve_is_closed(&mut test_bed, 3));
        }

        #[test]
        fn the_aircraft_presets_open_the_hp_fuel_valve_at_norm() {
            let mut test_bed = engine_2_shut_down_test_bed(1.);
            test_bed.write_by_name("AIRCRAFT_PRESET_QUICK_MODE", true);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", true);
            run(&mut test_bed);

            assert!(!hp_fuel_valve_is_closed(&mut test_bed, 2));
        }

        #[test]
        fn an_in_flight_quick_relight_at_norm_opens_the_hp_fuel_valve_once_it_lights_up() {
            let mut test_bed = flying_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(240.));
            test_bed.set_pressure_altitude(Length::new::<foot>(15_000.));
            test_bed.fail(FailureType::EngineFlameout(4));
            run(&mut test_bed);
            assert!(hp_fuel_valve_is_closed(&mut test_bed, 4));
            test_bed.write_by_name("ENGINE_STATE:4", 4.);
            test_bed.write_by_name("ENGINE_N3:4", 62.);
            master_off_then_on(&mut test_bed, 4);

            assert!(!hp_fuel_valve_is_closed(&mut test_bed, 4));
        }

        #[test]
        fn an_in_flight_windmilling_relight_at_ign_start_opens_the_hp_fuel_valve() {
            let mut test_bed = flying_test_bed();
            flame_out(&mut test_bed, 1);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            master_off_then_on(&mut test_bed, 1);

            assert!(!hp_fuel_valve_is_closed(&mut test_bed, 1));
        }

        #[test]
        fn an_in_flight_relight_outside_the_envelope_keeps_the_hp_fuel_valve_closed() {
            let mut test_bed = flying_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(200.));
            flame_out(&mut test_bed, 1);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            master_off_then_on(&mut test_bed, 1);

            // no starter air at 200 kt
            assert!(hp_fuel_valve_is_closed(&mut test_bed, 1));
        }

        #[test]
        fn on_the_ground_the_hp_fuel_valve_opens_at_the_fuel_on_point_of_the_start_sequence() {
            // MASTER ON, the start valve opens, and at 20 % N2 the FMV and the HP fuel valve open
            let mut test_bed = ground_test_bed();
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", true);
            run(&mut test_bed);
            test_bed.write_by_name("ENGINE_STATE:2", 2.);
            test_bed.write_by_name("PNEU_ENG_2_STARTER_VALVE_OPEN", true);
            for n3 in [2., 10., 18.] {
                test_bed.write_by_name("ENGINE_N3:2", n3);
                run(&mut test_bed);
                assert!(hp_fuel_valve_is_closed(&mut test_bed, 2));
            }

            test_bed.write_by_name("ENGINE_N3:2", 22.);
            run(&mut test_bed);
            assert!(!hp_fuel_valve_is_closed(&mut test_bed, 2));
        }

        #[test]
        fn on_the_ground_ign_start_selected_after_the_master_on_at_norm_starts_nothing() {
            // Measured in the sim: the automatic start needs IGN START before the MASTER ON
            let mut test_bed = ground_test_bed();
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 1.);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", true);
            run(&mut test_bed);
            test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", 2.);
            test_bed.write_by_name("ENGINE_STATE:2", 3.);
            test_bed.write_by_name("ENGINE_N3:2", 22.);
            for _ in 0..(10 * 20) {
                run(&mut test_bed);
            }

            assert!(hp_fuel_valve_is_closed(&mut test_bed, 2));
        }

        #[test]
        fn a_fuel_cut_closes_the_hp_fuel_valve_with_the_master_on() {
            let mut test_bed = flying_test_bed();
            flame_out(&mut test_bed, 1);

            assert!(hp_fuel_valve_is_closed(&mut test_bed, 1));
            assert!(!hp_fuel_valve_is_closed(&mut test_bed, 2));
        }
    }
}
