//! The FADEC start sequence and ignition of an engine, and the engine start and ignition failures
//! (ATA 74 IGNITION, ATA 80 STARTING).
//!
//! The FBW FADEC (C++) runs the engine model (engine states OFF, ON, STARTING, RESTARTING,
//! SHUTTING; N1, N2, EGT, fuel flow). What a real FADEC also does during a start is modelled here,
//! where it can be tested:
//! - the igniters it energizes: one igniter for a first automatic start on the ground, alternated
//!   between starts, both for a new attempt, a manual start and an in-flight start; continuous
//!   ignition; igniter failures (an igniter that has failed does not light the engine);
//! - the light-up: on the ground the engine fuel stays cut (MSFS valve in series, see
//!   `engine_failure`) until an energized igniter that works and the fuel (HP valve) are there;
//! - the start faults it detects (no light up, stall, EGT over limit, hung start, starter fault,
//!   low starter air pressure, thrust lever not at idle, starter time exceeded, jammed N1 rotor);
//! - the automatic abort of an automatic start on the ground, the dry crank that follows, the new
//!   attempts with both igniters, and the final abort (ENG FAULT light);
//! - the ENG MAN START pushbutton: manual start, dry crank and wet crank;
//! - the start valve command of these functions, and the start valve failures (stuck closed, stuck
//!   open) with their detection (start valve position disagrees with its command).
//!
//! The A320 and the A380 FADECs have the same functions with different numbers: each aircraft
//! gives its own [`EngineStartSchedule`].
//!
//! What the FADEC (C++) does with the outputs (each one is an L:var of the engine):
//! - `ENGINE_n_STARTER_MOTORING`: it keeps the MSFS starter engaged although the engine fuel is cut
//!   or the ENG MASTER is OFF (crank, start attempt not lit yet), so MSFS turns the core without
//!   combustion;
//! - `ENGINE_n_START_PHASE`: no EGT rise while the start sequence keeps the fuel cut;
//! - `ENGINE_n_START_N2_HANG`, `ENGINE_n_START_EGT_OVERSHOOT`: the core speed hangs below idle
//!   (hung start, stall), the EGT overshoots (hot start, stall);
//! - `ENGINE_n_STARTER_FAILED`: the starter does not turn the engine.

use crate::{
    failures::{Failure, FailureType},
    pneumatic::{EngineModeSelector, EngineState},
    shared::InternationalStandardAtmosphere,
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};
use std::time::Duration;
use uom::si::{
    f64::{Length, Ratio, ThermodynamicTemperature},
    ratio::percent,
};

/// The numbers of the start sequence of an aircraft.
#[derive(Clone, Copy, Debug)]
pub struct EngineStartSchedule {
    /// Automatic start on the ground: the ignition comes on at this N2.
    pub ground_ignition_on_n2: Ratio,
    /// Automatic start: the ignition goes off at this N2.
    pub automatic_start_ignition_off_n2: Ratio,
    /// Manual start: both igniters from the ENG MASTER ON until this N2.
    pub manual_start_ignition_off_n2: Ratio,
    /// The HP fuel valve opens at this N2: with ignition, the engine lights up.
    pub fuel_on_n2: Ratio,
    /// The start valve closes at this N2 (end of the starter assistance).
    pub start_valve_close_n2: Ratio,
    /// On the ground, an automatic start is not aborted above this N2.
    pub start_abort_inhibition_n2: Ratio,
    /// The engine must light up within this time after the ignition starts.
    pub no_light_up_time: Duration,
    /// In flight, an engine relight must light up within this time after the ENG MASTER ON (NO
    /// LIGHT UP in flight).
    pub in_flight_no_light_up_time: Duration,
    /// The FADEC reports a start valve open without starter air (NO STARTER AIR PRESSURE) during a
    /// start in flight too, not only on the ground.
    pub monitors_in_flight_start_air: bool,
    /// The EGT limit of a start on the ground.
    pub start_egt_limit: ThermodynamicTemperature,
    /// In flight, the EGT limit of an engine relight: above it the FADEC reports EGT OVERLIMIT
    /// until the ENG MASTER is set OFF. None: the relight EGT is not monitored.
    pub relight_egt_limit: Option<ThermodynamicTemperature>,
    /// An automatic start on the ground makes up to this number of attempts.
    pub automatic_start_attempts: u8,
    /// The dry crank after an aborted attempt lasts this long.
    pub automatic_crank_time: Duration,
    /// The FADEC monitors the time the starter runs, if the aircraft has a limit.
    pub starter_time_limit: Option<Duration>,
    /// The continuous ignition uses both igniters; otherwise one igniter, and both if it has failed.
    pub continuous_ignition_uses_both_igniters: bool,
    /// Manual start: the HP fuel valve opens with the ENG MASTER ON, and the engine lights up once
    /// its core turns at least at this N2 (instead of [`Self::fuel_on_n2`] of the automatic start).
    pub manual_start_fuel_on_n2: Ratio,
    /// Automatic start on the ground: after a stall or an EGT over limit the FADEC runs a new start
    /// at once (reduced fuel schedule), and the dry crank comes only once no new start is left.
    /// Otherwise these faults are handled as a no light up: dry crank first, then a new start.
    pub stall_or_egt_restart_before_crank: bool,
    /// In flight, the FADEC reports a starter that does not turn the core during a relight
    /// (starter fault), and keeps the fault for the rest of the flight.
    pub starter_fault_detected_in_flight: bool,
    /// Automatic start on the ground: the longest pre-start motoring (dry crank before the
    /// ignition) of a hot engine (bow rotor protection), for
    /// [`EngineStartInputs::engine_thermal_state`] 1. Zero: no pre-start motoring.
    pub max_pre_start_motoring_time: Duration,
    /// First automatic start attempt on the ground of a cold engine (no residual heat,
    /// [`EngineStartInputs::engine_thermal_state`] 0) or above this pressure altitude: the FADEC
    /// adds the second igniter once the engine has lit up. None: the single igniter stays alone.
    pub second_igniter_at_light_up_cold_or_above: Option<Length>,
    /// The starter can only engage while the core turns at or below this N2 (no "running
    /// engagement" above it): a start valve that is not open yet stays closed above it. Once
    /// engaged, the starter turns the core up to [`Self::start_valve_close_n2`]. None: no limit.
    pub starter_engagement_max_n2: Option<Ratio>,
    /// On the ground, the quick relight of the FADEC: the ENG MASTER set back to ON within a short
    /// time of being set to OFF with the core still fast is no start sequence (the FADEC gives the
    /// fuel at once). None: only a core above [`Self::automatic_start_ignition_off_n2`] skips the
    /// start sequence.
    pub ground_quick_relight: Option<QuickRelightSchedule>,
    /// An automatic start on the ground is also aborted for an abnormal start valve position (dry
    /// crank, then the new attempts) and for the starter time exceedance (no further attempt).
    pub aborts_for_start_valve_and_starter_time: bool,
}

/// The quick relight function of a FADEC: the ENG MASTER cycled from ON to OFF and back to ON
/// within [`Self::max_master_off_time`] while the engine was running, with the core above
/// [`Self::min_core_speed`].
#[derive(Clone, Copy, Debug)]
pub struct QuickRelightSchedule {
    pub max_master_off_time: Duration,
    pub min_core_speed: Ratio,
}

/// The phase of the start sequence, written as ENGINE_n_START_PHASE.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EngineStartPhase {
    /// No start sequence on the ground.
    None = 0,
    /// The starter turns the core without fuel: dry crank (ENG MODE CRANK, MAN START ON, ENG MASTER
    /// OFF), or a manual start before the ENG MASTER is set ON (IGN/START, MAN START ON).
    Motoring = 1,
    /// A start attempt, automatic or manual.
    Starting = 2,
    /// The automatic dry crank after an aborted attempt of an automatic start.
    AutomaticCrank = 3,
    /// The start is over without success: fuel, ignition and start valve stay off until the ENG
    /// MASTER is set OFF.
    Aborted = 4,
    /// Wet crank: ENG MODE CRANK, MAN START ON, ENG MASTER ON. Fuel without ignition.
    WetCrank = 5,
}

/// The start fault the FADEC reports to the warning system, written as ENGINE_n_START_FAULT.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EngineStartFault {
    None = 0,
    /// The engine does not light up after the ignition start (A320 IGNITION FAULT, A380 NO LIGHT UP).
    NoLightUp = 1,
    Stall = 2,
    EgtOverlimit = 3,
    HungStart = 4,
    /// The starter does not turn the core although it gets air (A320neo STARTER SHAFT SHEAR, A380
    /// LOW N2).
    StarterFault = 5,
    /// The start valve is open but the starter gets no air pressure.
    LowStartAirPressure = 6,
    ThrustLeverNotAtIdle = 7,
    StarterTimeExceeded = 8,
    /// The fan (N1 rotor) does not turn while the core accelerates in a start (A380 LOW N1).
    N1RotorJam = 9,
}
impl EngineStartFault {
    /// The faults after which an automatic start on the ground is aborted: a hot start, a hung
    /// start, a stall or no light up; on the A380 also a starter failure, then without further
    /// attempt.
    fn aborts_an_automatic_start(self) -> bool {
        matches!(
            self,
            EngineStartFault::NoLightUp
                | EngineStartFault::Stall
                | EngineStartFault::EgtOverlimit
                | EngineStartFault::HungStart
                | EngineStartFault::StarterFault
                | EngineStartFault::N1RotorJam
        )
    }
}

/// The command of the FADEC to the start valve, written as ENGINE_n_START_VALVE_COMMAND and read by
/// the start valve controller of the aircraft pneumatic system.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartValveCommand {
    /// The start valve follows the schedule of the engine states that the pneumatic system already
    /// has (open while STARTING or RESTARTING below the start valve closing N2).
    FadecSchedule = 0,
    Open = 1,
    Closed = 2,
}
impl From<f64> for StartValveCommand {
    fn from(value: f64) -> Self {
        match value as u8 {
            1 => StartValveCommand::Open,
            2 => StartValveCommand::Closed,
            _ => StartValveCommand::FadecSchedule,
        }
    }
}

/// The igniters A and B of an engine.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Igniters {
    pub a: bool,
    pub b: bool,
}
impl Igniters {
    const NONE: Igniters = Igniters { a: false, b: false };
    const BOTH: Igniters = Igniters { a: true, b: true };

    fn single(igniter_b: bool) -> Self {
        Self {
            a: !igniter_b,
            b: igniter_b,
        }
    }

    pub fn any(&self) -> bool {
        self.a || self.b
    }

    fn only_one(&self) -> bool {
        self.a != self.b
    }

    /// 1 = A, 2 = B, 3 = both
    fn bits(&self) -> u8 {
        (self.a as u8) | ((self.b as u8) << 1)
    }
}

/// The starter may be engaged this update: it already is (it stays engaged up to the start valve
/// closing), or the core turns at or below the engagement limit of the schedule
/// ([`EngineStartSchedule::starter_engagement_max_n2`]). On the A380 the starter cannot engage
/// on a core that turns above 25 % N2.
pub fn starter_can_engage(
    already_engaged: bool,
    core_speed: Ratio,
    engagement_max_core_speed: Option<Ratio>,
) -> bool {
    already_engaged || engagement_max_core_speed.is_none_or(|max| core_speed <= max)
}

/// What the aircraft knows about one engine, read from its own variables.
#[derive(Clone, Copy, Debug)]
pub struct EngineStartInputs {
    pub master_switch_is_on: bool,
    pub mode_selector: EngineModeSelector,
    /// ENG MAN START pushbutton ON
    pub manual_start_is_on: bool,
    /// ENG FIRE pushbutton released: the FADEC is no longer supplied
    pub fire_push_button_is_released: bool,
    pub engine_state: EngineState,
    /// The core speed (N2; the HP N3 of the A380X Trent) the FADEC shows
    pub core_speed: Ratio,
    pub egt: ThermodynamicTemperature,
    pub start_valve_is_open: bool,
    pub starter_air_pressurized: bool,
    pub thrust_lever_at_idle: bool,
    /// The aircraft presets start the engines at once: no start sequence.
    pub preset_quick_mode: bool,
    /// In flight, the engine waits for a relight (flamed out or seized, see `engine_failure`).
    pub relight_pending: bool,
    /// See `EngineFailure::crew_relight_without_light_up`; the FADEC automatic relight is not one.
    pub crew_relight_without_light_up: bool,
    /// The aircraft conditions for which the FADEC selects the continuous ignition by itself, in
    /// flight and on the ground (e.g. the A320 engine anti-ice valve open).
    pub automatic_continuous_ignition: bool,
    /// The HP fuel valve is stuck closed (`hp_fuel_valve_failure`): the fuel does not reach the
    /// engine, which does not light up.
    pub hp_fuel_valve_stuck_closed: bool,
    /// The other conditions of the ENG FAULT light, from the aircraft (HP fuel valve position
    /// abnormal, thrust control malfunction). The start sequence adds the abort of an automatic
    /// start.
    pub other_fault_light_conditions: bool,
    /// The residual heat of the engine core, from 0 (cold) to 1 (just shut down): it sets the
    /// pre-start motoring time ([`EngineStartSchedule::max_pre_start_motoring_time`]).
    pub engine_thermal_state: f64,
    /// The FADEC detects an abnormal start valve position: its position disagrees with its command
    /// (`EngineStartValveSupervision`, START VLV FAULT).
    pub start_valve_position_abnormal: bool,
}

pub struct EngineStartSequence {
    igniter_a_failure: Failure,
    igniter_b_failure: Failure,
    hot_start_failure: Failure,
    hung_start_failure: Failure,
    start_stall_failure: Failure,
    starter_failure: Failure,

    phase_id: VariableIdentifier,
    attempt_id: VariableIdentifier,
    manual_id: VariableIdentifier,
    fault_id: VariableIdentifier,
    fault_light_id: VariableIdentifier,
    starter_motoring_id: VariableIdentifier,
    starter_failed_id: VariableIdentifier,
    n2_hang_id: VariableIdentifier,
    egt_overshoot_id: VariableIdentifier,
    igniter_a_fault_id: VariableIdentifier,
    igniter_b_fault_id: VariableIdentifier,
    igniters_id: VariableIdentifier,
    continuous_ignition_id: VariableIdentifier,
    start_valve_command_id: VariableIdentifier,

    /// None until the first update, so that a flight loaded with the master ON is no transition.
    previous_master_switch_is_on: Option<bool>,
    /// How long the ENG MASTER has been OFF (the quick relight of [`EngineStartSchedule::ground_quick_relight`]).
    master_off_time: Duration,
    /// The ENG MASTER was set to OFF while the engine was running (quick relight).
    master_off_while_running: bool,
    /// A quick relight of the FADEC on the ground is in progress (see [`Self::is_quick_relight`]):
    /// from the ENG MASTER back ON until the engine runs again (FBW engine state ON), the ENG
    /// MASTER OFF, the ENG FIRE pb released or the lift-off.
    ground_quick_relight: bool,
    /// The engine was running (FBW engine state ON) in the previous update.
    engine_was_running: bool,
    /// The start sequence has engaged the starter (start valve commanded open): it stays engaged up
    /// to the start valve closing N2 although the core passes the engagement limit
    /// ([`EngineStartSchedule::starter_engagement_max_n2`]).
    starter_engaged: bool,
    phase: EngineStartPhase,
    /// The attempt of the current start (1 for the first one).
    attempt: u8,
    manual_start: bool,

    /// The engine lit up during the current attempt.
    lit: bool,
    since_light_up: Duration,
    /// The time since the ignition of the current attempt started (None before).
    since_ignition: Option<Duration>,
    /// Hung start detection: the core speed at the beginning of the current window.
    hung_window_start_speed: Ratio,
    hung_window_time: Duration,
    starter_without_rotation_time: Duration,
    /// How long the fan has stood still while the core is past the check speed.
    fan_without_rotation_time: Duration,
    /// The fan speed (N1) the FADEC measures; None where the aircraft does not monitor it.
    fan_speed: Option<Ratio>,
    /// The FADEC makes an automatic relight attempt after a flameout (see
    /// [`Self::set_fadec_relight_attempt`]).
    fadec_relight_attempt: bool,
    valve_open_without_air_time: Duration,
    starter_time: Duration,
    in_flight_no_light_up_time: Duration,
    /// In flight: how long a relight has had starter air while the starter has failed.
    in_flight_starter_fault_time: Duration,
    /// In flight: the EGT went above the relight EGT limit during a relight (until MASTER OFF).
    in_flight_egt_overlimit: bool,
    automatic_crank_time: Duration,
    /// None until the first update.
    previous_on_ground: Option<bool>,

    /// The fault of the current start, kept until the ENG MASTER OFF or a successful start.
    start_fault: EngineStartFault,
    /// The fault of a condition that does not abort the start, while the condition lasts.
    condition_fault: EngineStartFault,
    fault_light: bool,
    /// The ENG FAULT light conditions of the aircraft
    /// ([`EngineStartInputs::other_fault_light_conditions`]).
    other_fault_light: bool,
    /// The pre-start motoring of the current automatic start still to run before the ignition.
    pre_start_motoring_remaining: Duration,
    /// The current attempt has reached the point where the FADEC opens the HP fuel valve (ignition
    /// on and light-up speed), lit or not.
    attempt_fuel_on: bool,

    /// The FADEC alternates the igniter of the first automatic start attempt on the ground.
    ground_start_uses_igniter_b: bool,
    single_igniter_used: bool,
    /// The current automatic start is one of a cold engine or above the altitude of
    /// [`EngineStartSchedule::second_igniter_at_light_up_cold_or_above`], decided when the start
    /// begins (the engine heats up once it has lit).
    second_igniter_at_light_up: bool,
    continuous_ignition_armed: bool,
    continuous_ignition: bool,
    igniters: Igniters,
    /// The igniters whose electrical supply is powered (see [`Self::set_powered_igniters`]).
    powered_igniters: Igniters,
    /// See [`Self::set_start_commands_lost`].
    start_commands_lost: bool,

    fuel_cut: bool,
    starter_motoring: bool,
    n2_hang: bool,
    egt_overshoot: bool,
    start_valve_command: StartValveCommand,
}
impl EngineStartSequence {
    /// Design choice, no published value: the stall of a start is detected this long after the
    /// light-up (the FADEC detects it from the compressor pressure, which the FBW engine model has
    /// not).
    const STALL_DETECTION_TIME: Duration = Duration::from_secs(3);
    /// Design choice, no published value: a hung start is a core speed that rises by less than 1 %
    /// in 20 s after the light-up, below the end of the start, while the starter has its air (a
    /// core without starter air is LOW START AIR, not a hung start). A slow but healthy MSFS
    /// spool-up (0.08 %/s, 1.6 % in 20 s) is never one.
    const HUNG_START_WINDOW: Duration = Duration::from_secs(20);
    const HUNG_START_MIN_RISE_PERCENT: f64 = 1.;
    /// Design choice, no published value: a starter that gets air but leaves the core below 5 % N2
    /// for 10 s has failed (starter shaft shear).
    const STARTER_FAULT_MAX_N2_PERCENT: f64 = 5.;
    const STARTER_FAULT_DETECTION_TIME: Duration = Duration::from_secs(10);
    /// Design choice, no published value: with the core past 30 % (the starter engages up to 25 %
    /// on the A380) a turning fan is above 1 % N1 (the FBW start N1 is about 4 % there). A fan
    /// that stays below it for 3 s is a jammed N1 rotor.
    const N1_ROTATION_CHECK_CORE_SPEED_PERCENT: f64 = 30.;
    const N1_ROTATION_MIN_FAN_SPEED_PERCENT: f64 = 1.;
    const N1_ROTOR_JAM_DETECTION_TIME: Duration = Duration::from_secs(3);
    /// Design choice, no published value: the start valve is open and the starter has had no air
    /// for 10 s.
    const LOW_START_AIR_DETECTION_TIME: Duration = Duration::from_secs(10);

    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        let id = |context: &mut InitContext, name: &str| {
            context.get_identifier(format!("ENGINE_{}_{}", engine_number, name))
        };
        Self {
            igniter_a_failure: Failure::new(FailureType::EngineIgniterA(engine_number)),
            igniter_b_failure: Failure::new(FailureType::EngineIgniterB(engine_number)),
            hot_start_failure: Failure::new(FailureType::EngineHotStart(engine_number)),
            hung_start_failure: Failure::new(FailureType::EngineHungStart(engine_number)),
            start_stall_failure: Failure::new(FailureType::EngineStartStall(engine_number)),
            starter_failure: Failure::new(FailureType::EngineStarter(engine_number)),

            phase_id: id(context, "START_PHASE"),
            attempt_id: id(context, "START_ATTEMPT"),
            manual_id: id(context, "START_MANUAL"),
            fault_id: id(context, "START_FAULT"),
            fault_light_id: id(context, "FAULT_LIGHT"),
            starter_motoring_id: id(context, "STARTER_MOTORING"),
            starter_failed_id: id(context, "STARTER_FAILED"),
            n2_hang_id: id(context, "START_N2_HANG"),
            egt_overshoot_id: id(context, "START_EGT_OVERSHOOT"),
            igniter_a_fault_id: id(context, "IGNITER_A_FAULT"),
            igniter_b_fault_id: id(context, "IGNITER_B_FAULT"),
            igniters_id: id(context, "IGNITERS"),
            continuous_ignition_id: id(context, "CONTINUOUS_IGNITION"),
            start_valve_command_id: id(context, "START_VALVE_COMMAND"),

            previous_master_switch_is_on: None,
            master_off_time: Duration::ZERO,
            master_off_while_running: false,
            ground_quick_relight: false,
            engine_was_running: false,
            starter_engaged: false,
            phase: EngineStartPhase::None,
            attempt: 0,
            manual_start: false,
            lit: false,
            since_light_up: Duration::ZERO,
            since_ignition: None,
            hung_window_start_speed: Ratio::default(),
            hung_window_time: Duration::ZERO,
            starter_without_rotation_time: Duration::ZERO,
            fan_without_rotation_time: Duration::ZERO,
            fan_speed: None,
            fadec_relight_attempt: false,
            valve_open_without_air_time: Duration::ZERO,
            starter_time: Duration::ZERO,
            in_flight_no_light_up_time: Duration::ZERO,
            in_flight_starter_fault_time: Duration::ZERO,
            in_flight_egt_overlimit: false,
            automatic_crank_time: Duration::ZERO,
            previous_on_ground: None,
            start_fault: EngineStartFault::None,
            condition_fault: EngineStartFault::None,
            fault_light: false,
            other_fault_light: false,
            pre_start_motoring_remaining: Duration::ZERO,
            attempt_fuel_on: false,
            ground_start_uses_igniter_b: false,
            single_igniter_used: false,
            second_igniter_at_light_up: false,
            continuous_ignition_armed: false,
            continuous_ignition: false,
            igniters: Igniters::NONE,
            powered_igniters: Igniters::BOTH,
            start_commands_lost: false,
            fuel_cut: false,
            starter_motoring: false,
            n2_hang: false,
            egt_overshoot: false,
            start_valve_command: StartValveCommand::FadecSchedule,
        }
    }

    /// Updates the start sequence. Call [`Self::update_starter_motoring`] once the total fuel cut of
    /// the engine is known.
    pub fn update(
        &mut self,
        context: &UpdateContext,
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
    ) {
        let on_ground = context.is_on_ground();
        let master_turned_on =
            inputs.master_switch_is_on && self.previous_master_switch_is_on == Some(false);
        let master_turned_off =
            !inputs.master_switch_is_on && self.previous_master_switch_is_on == Some(true);
        self.previous_master_switch_is_on = Some(inputs.master_switch_is_on);
        if master_turned_off {
            self.master_off_time = Duration::ZERO;
            self.master_off_while_running =
                self.engine_was_running || inputs.engine_state == EngineState::On;
        } else if !inputs.master_switch_is_on {
            self.master_off_time += context.delta();
        }
        self.engine_was_running = inputs.engine_state == EngineState::On;
        let touched_down = on_ground && self.previous_on_ground == Some(false);
        self.previous_on_ground = Some(on_ground);

        if touched_down && self.start_fault == EngineStartFault::StarterFault {
            // Design choice: the starter fault found in flight ends with the flight; on the ground
            // the start sequence monitors the starter again at the next start.
            self.start_fault = EngineStartFault::None;
        }

        if self.start_commands_lost || !on_ground {
            // Without its start commands the FADEC no longer sees the ENG MASTER: no start, and a
            // start in progress ends.
            // The start sequence, its automatic abort and the cranks are ground functions. In flight
            // the A320 FADEC always commands a starter-assisted air start and the A380 FADEC does
            // not abort an automatic start: see engine_failure for the relight.
            // A starter fault found in flight stays (see update_in_flight_starter_fault).
            self.end_start(self.start_fault == EngineStartFault::StarterFault);
            self.phase = EngineStartPhase::None;
        } else if master_turned_off {
            // The ENG MASTER OFF closes the LP and HP fuel shutoff valves, stops the ignition and
            // closes the start valve; it also confirms the abort of an automatic start (A320) and
            // resets the FADEC (A380).
            self.end_start(false);
            self.phase = Self::phase_with_master_off(inputs);
        } else if master_turned_on {
            self.begin_start(schedule, inputs);
            self.second_igniter_at_light_up =
                Self::second_igniter_at_light_up(context, schedule, inputs);
        } else {
            self.continue_phase(context, schedule, inputs);
        }
        self.ground_quick_relight = on_ground
            && !self.start_commands_lost
            && inputs.master_switch_is_on
            && !inputs.fire_push_button_is_released
            && inputs.engine_state != EngineState::On
            && (self.ground_quick_relight
                || (master_turned_on && self.is_quick_relight(schedule, inputs)));

        self.other_fault_light = inputs.other_fault_light_conditions;
        self.update_in_flight_light_up(context, inputs, on_ground);
        self.update_in_flight_starter_fault(context, schedule, inputs, on_ground);
        self.update_in_flight_egt_overlimit(schedule, inputs, on_ground);
        self.update_condition_faults(context, schedule, inputs, on_ground);
        self.igniters = self.energized_igniters(schedule, inputs, on_ground);
        self.continuous_ignition = self.continuous_ignition_is_on(inputs, on_ground);

        self.fuel_cut = on_ground
            && !inputs.preset_quick_mode
            && (self.start_impossible(inputs)
                || match self.phase {
                    EngineStartPhase::Starting => !self.lit,
                    EngineStartPhase::AutomaticCrank
                    | EngineStartPhase::Aborted
                    | EngineStartPhase::WetCrank => true,
                    EngineStartPhase::None | EngineStartPhase::Motoring => false,
                });

        let lit_start = self.phase == EngineStartPhase::Starting && self.lit;
        self.n2_hang = lit_start
            && (self.hung_start_failure.is_active() || self.start_stall_failure.is_active());
        self.egt_overshoot = lit_start
            && (self.hot_start_failure.is_active() || self.start_stall_failure.is_active());

        // The start valve opens with the start (ENG MASTER ON, or the ENG MAN START pb ON before it)
        // and closes at the end of the starter assistance (above 50 % N2 on the A320). The start
        // sequence commands it from the first
        // frame of its phase: the engine state of the FADEC (the schedule of the pneumatic system)
        // follows one frame later, and a start valve closed for a frame would release the starter.
        let below_start_valve_closing = inputs.core_speed < schedule.start_valve_close_n2;
        let starter_can_engage = starter_can_engage(
            self.starter_engaged,
            inputs.core_speed,
            schedule.starter_engagement_max_n2,
        );
        self.start_valve_command = match self.phase {
            _ if self.start_commands_lost => StartValveCommand::Closed,
            EngineStartPhase::None => StartValveCommand::FadecSchedule,
            EngineStartPhase::Motoring
            | EngineStartPhase::Starting
            | EngineStartPhase::WetCrank
            | EngineStartPhase::AutomaticCrank
                if below_start_valve_closing && starter_can_engage =>
            {
                StartValveCommand::Open
            }
            EngineStartPhase::Motoring
            | EngineStartPhase::Starting
            | EngineStartPhase::WetCrank
            | EngineStartPhase::AutomaticCrank
            | EngineStartPhase::Aborted => StartValveCommand::Closed,
        };
        self.starter_engaged = self.start_valve_command == StartValveCommand::Open;

        // On the ground the continuous ignition needs the ENG MODE selector set to NORM then back to
        // IGN/START after the start (see continuous_ignition_is_on).
        if inputs.engine_state != EngineState::On {
            self.continuous_ignition_armed = false;
        } else if inputs.mode_selector != EngineModeSelector::Ignition {
            self.continuous_ignition_armed = true;
        }
    }

    /// The starter turns the core without combustion: on the ground, start valve open with air, and
    /// the engine fuel cut or the ENG MASTER OFF (crank, start attempt not lit yet, a start valve
    /// stuck open). The FADEC then keeps the MSFS starter engaged. In flight a windmilling engine
    /// is governed by `engine_failure`.
    pub fn update_starter_motoring(
        &mut self,
        context: &UpdateContext,
        engine_fuel_is_cut: bool,
        inputs: &EngineStartInputs,
    ) {
        self.starter_motoring = context.is_on_ground()
            && inputs.start_valve_is_open
            && inputs.starter_air_pressurized
            && !self.starter_failure.is_active()
            && (engine_fuel_is_cut || !inputs.master_switch_is_on);
    }

    /// In flight, the starter turns the core of a starter assisted relight before its fuel comes on.
    /// For an aircraft whose FADEC opens the HP fuel valve above an N2 in flight (15 % on the A320);
    /// the aircraft calls it after
    /// [`Self::update_starter_motoring`], with `relight_waiting` while the engine waits for its relight
    /// (flamed out, core not seized). The starter motors the core while the ENG MASTER is ON, the start
    /// valve is open with starter air, the starter works and the engine fuel is still cut. Aircraft
    /// that do not call it keep the ground-only motoring.
    pub fn update_in_flight_relight_motoring(
        &mut self,
        context: &UpdateContext,
        engine_fuel_is_cut: bool,
        inputs: &EngineStartInputs,
        relight_waiting: bool,
    ) {
        if !context.is_on_ground()
            && relight_waiting
            && inputs.master_switch_is_on
            && inputs.start_valve_is_open
            && inputs.starter_air_pressurized
            && !self.starter_failure.is_active()
            && engine_fuel_is_cut
        {
            self.starter_motoring = true;
        }
    }

    /// The ENG MASTER is OFF on the ground: the starter turns the core with the ENG MAN START pb ON,
    /// at CRANK (dry crank) or IGN/START (manual start, before the ENG MASTER ON).
    fn phase_with_master_off(inputs: &EngineStartInputs) -> EngineStartPhase {
        let motoring = inputs.manual_start_is_on
            && matches!(
                inputs.mode_selector,
                EngineModeSelector::Crank | EngineModeSelector::Ignition
            );
        if motoring {
            EngineStartPhase::Motoring
        } else {
            EngineStartPhase::None
        }
    }

    /// The ENG MASTER is set ON on the ground.
    fn begin_start(&mut self, schedule: &EngineStartSchedule, inputs: &EngineStartInputs) {
        // An engine that runs, or still turns fast after a MASTER OFF (the FADEC quick relight of a
        // spinning-down engine), is no start sequence. Design choice: "fast" is above the end of the
        // ignition of an automatic start.
        let no_start_sequence = inputs.engine_state == EngineState::On
            || inputs.core_speed >= schedule.automatic_start_ignition_off_n2
            || self.is_quick_relight(schedule, inputs)
            || inputs.preset_quick_mode;
        self.phase = if no_start_sequence {
            EngineStartPhase::None
        } else {
            match inputs.mode_selector {
                // Manual start = IGN/START, MAN START ON, ENG MASTER ON; otherwise the automatic
                // start.
                EngineModeSelector::Ignition => {
                    self.manual_start = inputs.manual_start_is_on;
                    self.begin_attempt(1);
                    self.pre_start_motoring_remaining = if self.manual_start {
                        Duration::ZERO
                    } else {
                        Self::pre_start_motoring_time(schedule, inputs)
                    };
                    EngineStartPhase::Starting
                }
                // Wet crank: selector at CRANK, MAN START ON, then ENG MASTER ON gives fuel without
                // ignition.
                EngineModeSelector::Crank if inputs.manual_start_is_on => {
                    EngineStartPhase::WetCrank
                }
                _ => EngineStartPhase::None,
            }
        };
    }

    /// The ENG MASTER is set back to ON for a quick relight of the FADEC: on the A380, an ENG MASTER
    /// cycled ON-OFF-ON within 30 s with the engine running and N2 above 45 % makes the FADEC select
    /// the continuous ignition with both igniters and open the fuel metering valve at once. The
    /// fuel comes at once (the HP fuel valve of the aircraft), with no start sequence.
    fn is_quick_relight(&self, schedule: &EngineStartSchedule, inputs: &EngineStartInputs) -> bool {
        schedule.ground_quick_relight.is_some_and(|quick_relight| {
            self.master_off_while_running
                && self.master_off_time <= quick_relight.max_master_off_time
                && inputs.core_speed > quick_relight.min_core_speed
        })
    }

    /// The pre-start motoring (dry crank) of an automatic start on the ground, from the residual
    /// heat of the engine: on the A320 the FADEC can motor the engine for up to 60 s before the
    /// ignition, depending on its thermal state, to keep the core below the bow rotor critical speed
    /// (bow rotor protection). Design choice: the time is proportional to the thermal state (no
    /// published schedule), and the manual start has none (the crew sets the ENG MASTER ON at the
    /// light-up speed).
    fn pre_start_motoring_time(
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
    ) -> Duration {
        schedule
            .max_pre_start_motoring_time
            .mul_f64(inputs.engine_thermal_state.clamp(0., 1.))
    }

    /// A320 automatic ground start of a cold engine or above 10 000 ft: one igniter first, then the
    /// second one once the ignition is detected. Design choice: the engine is cold
    /// when it has no residual heat (thermal state 0, the one of a cold and dark aircraft), and
    /// the altitude is the ISA pressure altitude of the static pressure, as in `engine_failure`.
    fn second_igniter_at_light_up(
        context: &UpdateContext,
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
    ) -> bool {
        schedule
            .second_igniter_at_light_up_cold_or_above
            .is_some_and(|altitude| {
                let pressure_altitude = InternationalStandardAtmosphere::altitude_from_pressure(
                    context.ambient_pressure(),
                );
                inputs.engine_thermal_state <= 0. || pressure_altitude > altitude
            })
    }

    fn begin_attempt(&mut self, attempt: u8) {
        self.attempt = attempt;
        self.attempt_fuel_on = false;
        self.lit = false;
        self.since_light_up = Duration::ZERO;
        self.since_ignition = None;
        self.hung_window_time = Duration::ZERO;
        self.starter_without_rotation_time = Duration::ZERO;
        self.fan_without_rotation_time = Duration::ZERO;
    }

    /// The start sequence is over (MASTER OFF, success, or flight): the next first automatic start
    /// uses the other igniter if this one used a single igniter.
    fn end_start(&mut self, keep_fault: bool) {
        if self.single_igniter_used {
            self.ground_start_uses_igniter_b = !self.ground_start_uses_igniter_b;
            self.single_igniter_used = false;
        }
        self.attempt = 0;
        self.manual_start = false;
        self.pre_start_motoring_remaining = Duration::ZERO;
        self.attempt_fuel_on = false;
        self.lit = false;
        self.since_ignition = None;
        self.automatic_crank_time = Duration::ZERO;
        self.starter_time = Duration::ZERO;
        if !keep_fault {
            self.start_fault = EngineStartFault::None;
        }
        self.fault_light = false;
    }

    fn continue_phase(
        &mut self,
        context: &UpdateContext,
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
    ) {
        match self.phase {
            EngineStartPhase::None | EngineStartPhase::Motoring => {
                if !inputs.master_switch_is_on {
                    self.phase = Self::phase_with_master_off(inputs);
                }
            }
            EngineStartPhase::Starting => {
                if inputs.engine_state == EngineState::On {
                    self.end_start(false);
                    self.phase = EngineStartPhase::None;
                } else {
                    self.monitor_attempt(context, schedule, inputs);
                }
            }
            EngineStartPhase::AutomaticCrank => {
                self.automatic_crank_time += context.delta();
                if self.automatic_crank_time >= schedule.automatic_crank_time {
                    self.automatic_crank_time = Duration::ZERO;
                    if self.attempt < schedule.automatic_start_attempts {
                        // After a failed attempt the FADEC starts a new attempt with both igniters
                        // energized. The ECAM shows NEW START IN PROGRESS.
                        self.begin_attempt(self.attempt + 1);
                        self.phase = EngineStartPhase::Starting;
                    } else {
                        self.abort_start();
                    }
                }
            }
            EngineStartPhase::Aborted => {}
            EngineStartPhase::WetCrank => {
                // The selector back at NORM stops the wet crank. Design choice: the fuel then stays off until the ENG MASTER OFF.
                if inputs.mode_selector == EngineModeSelector::Norm {
                    self.phase = EngineStartPhase::Aborted;
                }
            }
        }
    }

    /// The FADEC start protection: it watches the start attempt and aborts an automatic start on
    /// the ground.
    fn monitor_attempt(
        &mut self,
        context: &UpdateContext,
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
    ) {
        let delta = context.delta();
        if inputs.start_valve_is_open && inputs.starter_air_pressurized {
            self.pre_start_motoring_remaining =
                self.pre_start_motoring_remaining.saturating_sub(delta);
        }
        let energized = self.ground_start_igniters(schedule, inputs);
        let sparking = self.working(energized);
        // The restart gives no fuel while the EGT still shows the overlimit of the previous stage,
        // since a light-up at once would trip the limit again.
        let waiting_for_egt_to_fall = schedule.stall_or_egt_restart_before_crank
            && !self.manual_start
            && !self.lit
            && inputs.egt > schedule.start_egt_limit;
        if energized.any() && !waiting_for_egt_to_fall {
            self.since_ignition = Some(self.since_ignition.unwrap_or_default() + delta);
            if energized.only_one() {
                self.single_igniter_used = true;
            }
        }

        // The engine lights up once fuel (HP valve) and a working igniter are there. In a manual
        // start the FADEC opens the HP valve and energizes both igniters at the ENG MASTER ON, which
        // the A320 crew sets at 22 % N2 or the maximum motoring speed (20 % minimum): the manual
        // start has its own light-up speed.
        let light_up_n2 = if self.manual_start {
            schedule.manual_start_fuel_on_n2
        } else {
            schedule.fuel_on_n2
        };
        // The FADEC opens the HP fuel valve with the ignition at the light-up speed; a valve stuck
        // closed gives the engine no fuel (hp_fuel_valve_failure).
        let fuel_on =
            energized.any() && inputs.core_speed >= light_up_n2 && !waiting_for_egt_to_fall;
        self.attempt_fuel_on = self.attempt_fuel_on || fuel_on;
        if !self.lit && fuel_on && sparking.any() && !inputs.hp_fuel_valve_stuck_closed {
            self.lit = true;
            self.since_light_up = Duration::ZERO;
            self.hung_window_start_speed = inputs.core_speed;
            self.hung_window_time = Duration::ZERO;
        } else if self.lit {
            self.since_light_up += delta;
        }

        let fault = self.detect_start_fault(delta, schedule, inputs);
        // The A380 FADEC also aborts an automatic start for an abnormal start valve position, then
        // cranks and makes two further attempts, as for the other faults. The START VLV
        // FAULT alert has its own variable (EngineStartValveSupervision): no start fault is reported.
        // A valve stuck closed stays abnormal through the crank, so the new attempts end at once and
        // the third one aborts the start.
        let start_valve_abnormal = schedule.aborts_for_start_valve_and_starter_time
            && inputs.start_valve_position_abnormal;
        if fault == EngineStartFault::None && !start_valve_abnormal {
            return;
        }
        if fault != EngineStartFault::None {
            self.start_fault = fault;
        }

        // On the ground, an automatic start is not aborted once the core is past the end of the
        // start (A380: N2 above 58.4 %; A320 manual start: 50 % N2).
        if inputs.core_speed >= schedule.start_abort_inhibition_n2 {
            return;
        }
        if self.manual_start {
            // The FADEC aborts a manual start on the ground only for the start EGT limit exceeded
            // before 50 % N2 (both aircraft). Design choice: no ENG FAULT light, which comes on for
            // the abort of an automatic start.
            if fault == EngineStartFault::EgtOverlimit {
                self.phase = EngineStartPhase::Aborted;
            }
        } else if matches!(
            fault,
            EngineStartFault::StarterFault | EngineStartFault::N1RotorJam
        ) {
            // A starter failure or a jammed N1 rotor aborts the start without further attempt
            // (A380).
            self.abort_start();
        } else if schedule.stall_or_egt_restart_before_crank
            && matches!(
                fault,
                EngineStartFault::Stall | EngineStartFault::EgtOverlimit
            )
        {
            // A320 ENG 1(2) STALL, ENG 1(2) EGT OVERLIMIT in an automatic ground start: the FADEC
            // reduces the fuel schedule in stages (NEW START IN PROGRESS); when no restart is left it
            // cuts the fuel and the ignition, then a dry crank follows (AUTO CRANK IN PROGRESS), then
            // ENG MASTER OFF. Design choice:
            // each stage is a new attempt (one frame without fuel, then the light-up again with both
            // igniters), up to the attempts of the automatic start; the last one ends in the dry
            // crank and the abort.
            if self.attempt < schedule.automatic_start_attempts {
                self.begin_attempt(self.attempt + 1);
            } else {
                self.phase = EngineStartPhase::AutomaticCrank;
                self.automatic_crank_time = Duration::ZERO;
            }
        } else if fault.aborts_an_automatic_start() || start_valve_abnormal {
            // A dry crank follows every unsuccessful attempt, then the next attempt (two further
            // attempts on the A380).
            self.phase = EngineStartPhase::AutomaticCrank;
            self.automatic_crank_time = Duration::ZERO;
        }
    }

    /// The automatic start is aborted: fuel metering valve and start valve closed, both igniters
    /// off, ENG FAULT light on.
    fn abort_start(&mut self) {
        self.phase = EngineStartPhase::Aborted;
        self.fault_light = true;
    }

    fn detect_start_fault(
        &mut self,
        delta: Duration,
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
    ) -> EngineStartFault {
        // The starter gets air but the core does not turn.
        if inputs.start_valve_is_open
            && inputs.starter_air_pressurized
            && inputs.core_speed.get::<percent>() < Self::STARTER_FAULT_MAX_N2_PERCENT
        {
            self.starter_without_rotation_time += delta;
        } else {
            self.starter_without_rotation_time = Duration::ZERO;
        }
        if self.starter_without_rotation_time >= Self::STARTER_FAULT_DETECTION_TIME {
            return EngineStartFault::StarterFault;
        }

        // The core accelerates but the fan does not turn: N1 rotor jamming.
        let fan_stands_still = self.fan_speed.is_some_and(|fan_speed| {
            fan_speed.get::<percent>() < Self::N1_ROTATION_MIN_FAN_SPEED_PERCENT
        });
        if fan_stands_still
            && inputs.start_valve_is_open
            && inputs.core_speed.get::<percent>() >= Self::N1_ROTATION_CHECK_CORE_SPEED_PERCENT
        {
            self.fan_without_rotation_time += delta;
        } else {
            self.fan_without_rotation_time = Duration::ZERO;
        }
        if self.fan_without_rotation_time >= Self::N1_ROTOR_JAM_DETECTION_TIME {
            return EngineStartFault::N1RotorJam;
        }

        if !self.lit {
            // No light up: the engine has not started within the time after the ignition start
            // (18 s on the A320).
            let no_light_up = self
                .since_ignition
                .is_some_and(|time| time >= schedule.no_light_up_time);
            return if no_light_up {
                EngineStartFault::NoLightUp
            } else {
                EngineStartFault::None
            };
        }

        if self.start_stall_failure.is_active() && self.since_light_up >= Self::STALL_DETECTION_TIME
        {
            return EngineStartFault::Stall;
        }

        // Start EGT overtemperature (above 725 °C on the A320).
        if inputs.egt > schedule.start_egt_limit {
            return EngineStartFault::EgtOverlimit;
        }

        if !inputs.starter_air_pressurized {
            // the window starts again once the starter has its air back
            self.hung_window_start_speed = inputs.core_speed;
            self.hung_window_time = Duration::ZERO;
            return EngineStartFault::None;
        }
        self.hung_window_time += delta;
        if self.hung_window_time >= Self::HUNG_START_WINDOW {
            let rise = inputs.core_speed - self.hung_window_start_speed;
            self.hung_window_start_speed = inputs.core_speed;
            self.hung_window_time = Duration::ZERO;
            if inputs.core_speed < schedule.start_valve_close_n2
                && rise.get::<percent>() < Self::HUNG_START_MIN_RISE_PERCENT
            {
                return EngineStartFault::HungStart;
            }
        }

        EngineStartFault::None
    }

    /// In flight the FADEC does not abort a start, but reports an engine that does not light up
    /// (A320 IGNITION FAULT, whose in-flight action is the ENG MASTER OFF; the A380 FADEC raises the
    /// matching ECAM alerts). In flight the ignition starts at once with the ENG MASTER ON.
    fn update_in_flight_light_up(
        &mut self,
        context: &UpdateContext,
        inputs: &EngineStartInputs,
        on_ground: bool,
    ) {
        if Self::is_in_flight_start(inputs, on_ground) && inputs.crew_relight_without_light_up {
            self.in_flight_no_light_up_time += context.delta();
        } else {
            self.in_flight_no_light_up_time = Duration::ZERO;
        }
    }

    /// In flight, the FADEC starts an engine that waits for a relight once its ENG MASTER is ON.
    fn is_in_flight_start(inputs: &EngineStartInputs, on_ground: bool) -> bool {
        !on_ground
            && inputs.master_switch_is_on
            && inputs.relight_pending
            && inputs.engine_state != EngineState::On
    }

    /// In flight the starter fault is detected during a relight: the ENG MASTER is ON, the engine
    /// waits for its relight, the starter has its air, but it does not turn the core: the A320neo
    /// ENG 1(2) START FAULT STARTER SHAFT SHEAR, which has an in-flight branch and the STATUS line
    /// ENG (AFFECTED) WINDMILL START ONLY. Design choice: in flight the FBW engine model does not motor the core with the
    /// starter, so the FADEC detection is the starter failure itself once the starter has had its
    /// air for [`Self::STARTER_FAULT_DETECTION_TIME`] (the ground detection time). The fault then
    /// stays for the rest of the flight.
    fn update_in_flight_starter_fault(
        &mut self,
        context: &UpdateContext,
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
        on_ground: bool,
    ) {
        let starter_fails_in_relight = schedule.starter_fault_detected_in_flight
            && !on_ground
            && inputs.master_switch_is_on
            && inputs.relight_pending
            && inputs.engine_state != EngineState::On
            && inputs.starter_air_pressurized
            && self.starter_failure.is_active();
        if starter_fails_in_relight {
            self.in_flight_starter_fault_time += context.delta();
        } else {
            self.in_flight_starter_fault_time = Duration::ZERO;
        }
        if self.in_flight_starter_fault_time >= Self::STARTER_FAULT_DETECTION_TIME {
            self.start_fault = EngineStartFault::StarterFault;
        }
    }

    /// In flight the FADEC watches the EGT of a relight against the relight EGT limit (865 °C on the
    /// A380). The relight lasts from the ENG MASTER ON of an engine that waits for its relight until
    /// the engine runs (idle reached, ENG AVAIL). Above the limit the FADEC reports EGT OVERLIMIT,
    /// whose in-flight action is the ENG MASTER OFF: the fault stays until then.
    fn update_in_flight_egt_overlimit(
        &mut self,
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
        on_ground: bool,
    ) {
        if on_ground || !inputs.master_switch_is_on {
            self.in_flight_egt_overlimit = false;
            return;
        }
        let relighting = inputs.relight_pending
            || matches!(
                inputs.engine_state,
                EngineState::Starting | EngineState::Restarting
            );
        if relighting
            && schedule
                .relight_egt_limit
                .is_some_and(|limit| inputs.egt > limit)
        {
            self.in_flight_egt_overlimit = true;
        }
    }

    /// The faults of conditions that do not abort the start: they last as long as the condition.
    fn update_condition_faults(
        &mut self,
        context: &UpdateContext,
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
        on_ground: bool,
    ) {
        let starting = on_ground && self.phase == EngineStartPhase::Starting;
        // The A380 ENG START FAULT NO STARTER AIR PRESSURE has an in-flight branch (MIN SPEED FOR
        // WINDML RELIGHT, WINDMILL START INITIATED). The
        // in-flight start has no start sequence phase (see `update`), so it is the relight start.
        let starting_in_flight =
            schedule.monitors_in_flight_start_air && Self::is_in_flight_start(inputs, on_ground);

        // The start valve is open, the starter has no air (A320 LO START AIR PRESS, A380 NO
        // STARTER AIR PRESSURE).
        if (starting || starting_in_flight)
            && inputs.start_valve_is_open
            && !inputs.starter_air_pressurized
        {
            self.valve_open_without_air_time += context.delta();
        } else {
            self.valve_open_without_air_time = Duration::ZERO;
        }

        // A380 starter limit: more than 5 min of continuous starter-on time triggers ENG x START
        // FAULT STARTER TIME EXCEEDED. The starter-on time runs from the ENG MASTER ON until the
        // starter disengages (58.4 % N2), and only resets with the ENG MASTER OFF.
        if starting && inputs.core_speed < schedule.start_valve_close_n2 {
            self.starter_time += context.delta();
        }
        if schedule
            .starter_time_limit
            .is_some_and(|limit| self.starter_time > limit)
            && self.start_fault == EngineStartFault::None
        {
            self.start_fault = EngineStartFault::StarterTimeExceeded;
            // The A380 FADEC aborts an automatic start for a starter engagement time exceedance.
            // Design choice: without further attempt. The starter-on time only resets with the ENG
            // MASTER OFF, so a
            // new attempt would exceed it at once, and the ECAM procedure of STARTER TIME EXCEEDED
            // ends with the ENG MASTER OFF without NEW START IN PROGRESS.
            let automatic_start_abortable = starting
                && !self.manual_start
                && inputs.core_speed < schedule.start_abort_inhibition_n2;
            if schedule.aborts_for_start_valve_and_starter_time && automatic_start_abortable {
                self.abort_start();
            }
        }

        self.condition_fault = if self.in_flight_egt_overlimit {
            EngineStartFault::EgtOverlimit
        } else if self.in_flight_no_light_up_time >= schedule.in_flight_no_light_up_time {
            EngineStartFault::NoLightUp
        } else if self.valve_open_without_air_time >= Self::LOW_START_AIR_DETECTION_TIME {
            EngineStartFault::LowStartAirPressure
        } else if starting && !inputs.thrust_lever_at_idle {
            // A320 START FAULT for a thrust lever not at idle.
            EngineStartFault::ThrustLeverNotAtIdle
        } else {
            EngineStartFault::None
        };
    }

    /// The igniters of a start attempt on the ground.
    fn ground_start_igniters(
        &self,
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
    ) -> Igniters {
        if self.phase != EngineStartPhase::Starting || inputs.fire_push_button_is_released {
            return Igniters::NONE;
        }
        if self.pre_start_motoring_remaining > Duration::ZERO {
            // The pre-start motoring is a dry crank: no ignition, no fuel.
            return Igniters::NONE;
        }
        if self.manual_start {
            // A manual start supplies both igniters from the ENG MASTER ON until about 50 % N2.
            return if inputs.core_speed < schedule.manual_start_ignition_off_n2 {
                Igniters::BOTH
            } else {
                Igniters::NONE
            };
        }
        // Automatic start: the first attempt uses one igniter, alternated between starts, a new
        // attempt both. The ignition is on from 16 % to 50 % N2 on the A320 (A380 alike).
        let ignition_window = inputs.core_speed >= schedule.ground_ignition_on_n2
            && inputs.core_speed < schedule.automatic_start_ignition_off_n2;
        if !ignition_window {
            Igniters::NONE
        } else if self.attempt <= 1 && !(self.lit && self.second_igniter_at_light_up) {
            // A cold engine or a start above 10 000 ft gets the second igniter once lit up (see
            // second_igniter_at_light_up).
            Igniters::single(self.ground_start_uses_igniter_b)
        } else {
            Igniters::BOTH
        }
    }

    /// The igniters the FADEC energizes.
    fn energized_igniters(
        &self,
        schedule: &EngineStartSchedule,
        inputs: &EngineStartInputs,
        on_ground: bool,
    ) -> Igniters {
        if inputs.fire_push_button_is_released || !inputs.master_switch_is_on {
            return Igniters::NONE;
        }
        if self.start_impossible(inputs) {
            return Igniters::NONE;
        }
        if on_ground && self.phase != EngineStartPhase::None {
            return self.ground_start_igniters(schedule, inputs);
        }
        let starting = matches!(
            inputs.engine_state,
            EngineState::Starting | EngineState::Restarting
        );
        if !on_ground && starting {
            // An in-flight start supplies both igniters once the ENG MASTER is ON (both aircraft).
            return Igniters::BOTH;
        }
        if self.continuous_ignition_is_on(inputs, on_ground) {
            return self.continuous_ignition_igniters(schedule);
        }
        Igniters::NONE
    }

    /// Without the start commands an engine that does not run can neither start nor relight.
    fn start_impossible(&self, inputs: &EngineStartInputs) -> bool {
        self.start_commands_lost && inputs.engine_state != EngineState::On
    }

    /// Manual selection: in flight the continuous ignition is on with the ENG MODE selector at
    /// IGN/START and the engine running. On the ground the ignition cuts off by itself after the
    /// start, so the crew sets the selector to NORM then back to IGN/START to turn it on.
    ///
    /// The continuous ignition can also be selected automatically to keep the engine combustion;
    /// the conditions of the automatic selection come from the aircraft ([`EngineStartInputs::automatic_continuous_ignition`]). They need no
    /// NORM then IGN/START on the ground.
    fn continuous_ignition_is_on(&self, inputs: &EngineStartInputs, on_ground: bool) -> bool {
        // The ENG MODE selector reaches the FADEC with the start commands.
        let manual_selection = !self.start_commands_lost
            && inputs.mode_selector == EngineModeSelector::Ignition
            && (!on_ground || self.continuous_ignition_armed);
        let engine_runs = inputs.engine_state == EngineState::On
            && (manual_selection || inputs.automatic_continuous_ignition);
        let fadec_relight =
            self.fadec_relight_attempt && !on_ground && !self.start_impossible(inputs);
        inputs.master_switch_is_on
            && !inputs.fire_push_button_is_released
            && (engine_runs || fadec_relight)
    }

    /// The A320 continuous ignition uses one igniter, and both if it does not work (design choice:
    /// igniter A); the A380 continuous ignition uses both igniters.
    fn continuous_ignition_igniters(&self, schedule: &EngineStartSchedule) -> Igniters {
        if schedule.continuous_ignition_uses_both_igniters || !self.igniter_a_works() {
            Igniters::BOTH
        } else {
            Igniters::single(false)
        }
    }

    /// An igniter works when it has not failed and its electrical supply is powered.
    fn igniter_a_works(&self) -> bool {
        self.powered_igniters.a && !self.igniter_a_failure.is_active()
    }

    fn igniter_b_works(&self) -> bool {
        self.powered_igniters.b && !self.igniter_b_failure.is_active()
    }

    fn working(&self, igniters: Igniters) -> Igniters {
        Igniters {
            a: igniters.a && self.igniter_a_works(),
            b: igniters.b && self.igniter_b_works(),
        }
    }

    /// The FADEC is making its automatic relight attempt after a flameout in flight: it selects the
    /// continuous ignition by itself, whatever the ENG MODE selector position, although the engine
    /// no longer runs. Call it before [`Self::update`].
    pub fn set_fadec_relight_attempt(&mut self, attempt_in_progress: bool) {
        self.fadec_relight_attempt = attempt_in_progress;
    }

    /// The fan speed (N1) the FADEC measures. Call it before [`Self::update`] on an aircraft whose
    /// FADEC detects a jammed N1 rotor during a start (A380); without it nothing is monitored.
    pub fn set_fan_speed(&mut self, fan_speed: Ratio) {
        self.fan_speed = Some(fan_speed);
    }

    /// The igniters whose electrical supply is powered (both until the aircraft sets them). An
    /// igniter without power does not light the engine, as a failed one, but it is no IGN FAULT.
    pub fn set_powered_igniters(&mut self, powered: Igniters) {
        self.powered_igniters = powered;
    }

    /// The FADEC no longer receives the start commands of the aircraft (ENG MASTER, ENG MODE
    /// selector, ENG MAN START), which reach it through the A320 Engine Interface Unit (ENG EIU
    /// FAULT: the start of the engine is lost), or the FADEC has no power (no channel supplied, or
    /// both channels failed). Call it before [`Self::update`]. No start sequence, no quick relight
    /// and no relight: the start valve stays closed, the fuel of an engine that does not run stays
    /// cut on the ground and no igniter is energized; the manual continuous ignition is lost. A
    /// running engine keeps running. An ENG MASTER set ON meanwhile starts nothing once the
    /// commands are back: the start needs the next ENG MASTER ON.
    pub fn set_start_commands_lost(&mut self, lost: bool) {
        self.start_commands_lost = lost;
    }

    /// The fuel of the engine is cut by the start sequence (start not lit yet, crank, abort).
    pub fn fuel_is_cut(&self) -> bool {
        self.fuel_cut
    }

    /// On the ground, the start sequence commands the HP fuel valve open: a start attempt from its
    /// light-up point (lit or not), or a wet crank. False outside a start sequence.
    pub fn fuel_is_commanded(&self) -> bool {
        match self.phase {
            EngineStartPhase::Starting => self.attempt_fuel_on,
            EngineStartPhase::WetCrank => true,
            EngineStartPhase::None
            | EngineStartPhase::Motoring
            | EngineStartPhase::AutomaticCrank
            | EngineStartPhase::Aborted => false,
        }
    }

    /// The pre-start motoring of the current automatic start still runs.
    pub fn pre_start_motoring_in_progress(&self) -> bool {
        self.phase == EngineStartPhase::Starting
            && self.pre_start_motoring_remaining > Duration::ZERO
    }

    /// At least one igniter works and the FADEC receives the start commands: an in-flight relight
    /// can light up.
    pub fn ignition_is_available(&self) -> bool {
        !self.start_commands_lost && (self.igniter_a_works() || self.igniter_b_works())
    }

    /// The starter does not turn the engine: no starter-assisted relight in flight.
    pub fn starter_has_failed(&self) -> bool {
        self.starter_failure.is_active()
    }

    pub fn igniters(&self) -> Igniters {
        self.igniters
    }

    pub fn phase(&self) -> EngineStartPhase {
        self.phase
    }

    /// On the ground, the FADEC quick relight of [`EngineStartSchedule::ground_quick_relight`] is
    /// in progress: the ENG MASTER is back ON and the engine does not run yet. The FADEC selects
    /// the continuous ignition with both igniters and relights the engine without a start sequence.
    pub fn ground_quick_relight_in_progress(&self) -> bool {
        self.ground_quick_relight
    }

    /// The start fault reported to the warning system.
    pub fn fault(&self) -> EngineStartFault {
        if self.start_fault != EngineStartFault::None {
            self.start_fault
        } else {
            self.condition_fault
        }
    }

    /// The ENG FAULT light: the abort of an automatic start, or the other conditions of the
    /// aircraft.
    pub fn fault_light_is_on(&self) -> bool {
        self.fault_light || self.other_fault_light
    }

    pub fn start_valve_command(&self) -> StartValveCommand {
        self.start_valve_command
    }

    pub fn attempt(&self) -> u8 {
        self.attempt
    }
}
impl SimulationElement for EngineStartSequence {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.igniter_a_failure.accept(visitor);
        self.igniter_b_failure.accept(visitor);
        self.hot_start_failure.accept(visitor);
        self.hung_start_failure.accept(visitor);
        self.start_stall_failure.accept(visitor);
        self.starter_failure.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.phase_id, self.phase as u8 as f64);
        writer.write(&self.attempt_id, self.attempt as f64);
        writer.write(&self.manual_id, self.manual_start);
        writer.write(&self.fault_id, self.fault() as u8 as f64);
        writer.write(&self.fault_light_id, self.fault_light_is_on());
        writer.write(&self.starter_motoring_id, self.starter_motoring);
        writer.write(&self.starter_failed_id, self.starter_failure.is_active());
        writer.write(&self.n2_hang_id, self.n2_hang);
        writer.write(&self.egt_overshoot_id, self.egt_overshoot);
        // ENG 1(2) IGN FAULT is either ignition circuit A or B failed: the FADEC monitors both
        // circuits.
        writer.write(&self.igniter_a_fault_id, self.igniter_a_failure.is_active());
        writer.write(&self.igniter_b_fault_id, self.igniter_b_failure.is_active());
        writer.write(&self.igniters_id, self.igniters.bits() as f64);
        writer.write(&self.continuous_ignition_id, self.continuous_ignition);
        writer.write(
            &self.start_valve_command_id,
            self.start_valve_command as u8 as f64,
        );
    }
}

/// The fault of the start valve that the FADEC detects: its position disagrees with its command.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartValveFault {
    None = 0,
    /// A320 ENG 1(2) START VALVE FAULT, START VALVE NOT OPEN.
    NotOpen = 1,
    /// START VALVE NOT CLOSED.
    NotClosed = 2,
}

/// The start valve of an engine as the aircraft pneumatic system sees it: the FADEC command, the
/// stuck failures and the position monitoring. A320 ENG 1(2) START VALVE FAULT: the start valve is
/// stuck closed or open. A380 ENG START VLV FAULT: NOT CLOSED for a valve failed open, NOT OPEN for
/// a valve that cannot open.
pub struct EngineStartValveSupervision {
    stuck_closed: Failure,
    stuck_open: Failure,
    command_id: VariableIdentifier,
    fault_id: VariableIdentifier,
    command: StartValveCommand,
    disagreement_time: Duration,
    fault: StartValveFault,
}
impl EngineStartValveSupervision {
    /// Design choice, no published value: the position must disagree with the command for 5 s,
    /// longer than the travel of the valve.
    const DISAGREEMENT_CONFIRMATION_TIME: Duration = Duration::from_secs(5);

    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            stuck_closed: Failure::new(FailureType::EngineStartValveStuckClosed(engine_number)),
            stuck_open: Failure::new(FailureType::EngineStartValveStuckOpen(engine_number)),
            command_id: context
                .get_identifier(format!("ENGINE_{}_START_VALVE_COMMAND", engine_number)),
            fault_id: context.get_identifier(format!("ENGINE_{}_START_VALVE_FAULT", engine_number)),
            command: StartValveCommand::FadecSchedule,
            disagreement_time: Duration::ZERO,
            fault: StartValveFault::None,
        }
    }

    /// Whether the FADEC commands the start valve open, given its schedule of the engine states.
    pub fn commanded_open(&self, fadec_schedule_open: bool) -> bool {
        match self.command {
            StartValveCommand::FadecSchedule => fadec_schedule_open,
            StartValveCommand::Open => true,
            StartValveCommand::Closed => false,
        }
    }

    /// Whether the valve is open: its command, unless it is stuck.
    pub fn position_open(&self, commanded_open: bool) -> bool {
        if self.stuck_closed.is_active() {
            false
        } else if self.stuck_open.is_active() {
            true
        } else {
            commanded_open
        }
    }

    /// Monitors the valve position against its command.
    pub fn monitor(&mut self, delta: Duration, commanded_open: bool, is_open: bool) {
        if commanded_open != is_open {
            self.disagreement_time += delta;
        } else {
            self.disagreement_time = Duration::ZERO;
        }
        self.fault = if self.disagreement_time < Self::DISAGREEMENT_CONFIRMATION_TIME {
            StartValveFault::None
        } else if commanded_open {
            StartValveFault::NotOpen
        } else {
            StartValveFault::NotClosed
        };
    }

    pub fn fault(&self) -> StartValveFault {
        self.fault
    }
}
impl SimulationElement for EngineStartValveSupervision {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.stuck_closed.accept(visitor);
        self.stuck_open.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        let command: f64 = reader.read(&self.command_id);
        self.command = StartValveCommand::from(command);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.fault_id, self.fault as u8 as f64);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };
    use uom::si::{length::foot, thermodynamic_temperature::degree_celsius};

    /// An A320-like schedule (the A320 numbers).
    fn schedule() -> EngineStartSchedule {
        EngineStartSchedule {
            ground_ignition_on_n2: Ratio::new::<percent>(16.),
            automatic_start_ignition_off_n2: Ratio::new::<percent>(50.),
            manual_start_ignition_off_n2: Ratio::new::<percent>(50.),
            fuel_on_n2: Ratio::new::<percent>(22.),
            start_valve_close_n2: Ratio::new::<percent>(50.),
            start_abort_inhibition_n2: Ratio::new::<percent>(50.),
            no_light_up_time: Duration::from_secs(18),
            in_flight_no_light_up_time: Duration::from_secs(18),
            monitors_in_flight_start_air: false,
            start_egt_limit: ThermodynamicTemperature::new::<degree_celsius>(725.),
            relight_egt_limit: None,
            automatic_start_attempts: 3,
            automatic_crank_time: Duration::from_secs(30),
            starter_time_limit: None,
            continuous_ignition_uses_both_igniters: false,
            manual_start_fuel_on_n2: Ratio::new::<percent>(22.),
            stall_or_egt_restart_before_crank: false,
            starter_fault_detected_in_flight: false,
            max_pre_start_motoring_time: Duration::from_secs(60),
            second_igniter_at_light_up_cold_or_above: None,
            starter_engagement_max_n2: None,
            ground_quick_relight: None,
            aborts_for_start_valve_and_starter_time: false,
        }
    }

    /// The A380 rules on top of the A320-like schedule: no running engagement of the starter
    /// above 25 % N2, the ground quick relight (30 s, 45 % N2), and the abort for the start
    /// valve and the starter time, with the 5 min starter time limit.
    fn with_a380_rules(schedule: &mut EngineStartSchedule) {
        schedule.starter_engagement_max_n2 = Some(Ratio::new::<percent>(25.));
        schedule.ground_quick_relight = Some(QuickRelightSchedule {
            max_master_off_time: Duration::from_secs(30),
            min_core_speed: Ratio::new::<percent>(45.),
        });
        schedule.aborts_for_start_valve_and_starter_time = true;
        schedule.starter_time_limit = Some(Duration::from_secs(5 * 60));
    }

    struct TestAircraft {
        sequence: EngineStartSequence,
        schedule: EngineStartSchedule,
        inputs: EngineStartInputs,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                sequence: EngineStartSequence::new(context, 1),
                schedule: schedule(),
                inputs: EngineStartInputs {
                    master_switch_is_on: false,
                    mode_selector: EngineModeSelector::Norm,
                    manual_start_is_on: false,
                    fire_push_button_is_released: false,
                    engine_state: EngineState::Off,
                    core_speed: Ratio::default(),
                    egt: ThermodynamicTemperature::new::<degree_celsius>(15.),
                    start_valve_is_open: false,
                    starter_air_pressurized: true,
                    thrust_lever_at_idle: true,
                    preset_quick_mode: false,
                    relight_pending: false,
                    crew_relight_without_light_up: false,
                    automatic_continuous_ignition: false,
                    hp_fuel_valve_stuck_closed: false,
                    other_fault_light_conditions: false,
                    engine_thermal_state: 0.,
                    start_valve_position_abnormal: false,
                },
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.sequence.update(context, &self.schedule, &self.inputs);
            let fuel_cut = self.sequence.fuel_is_cut();
            self.sequence
                .update_starter_motoring(context, fuel_cut, &self.inputs);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.sequence.accept(visitor);
            visitor.visit(self);
        }
    }

    struct StartTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl StartTestBed {
        /// On the ground, engine 1 off, ENG MODE NORM, starter air available (APU bleed).
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            test_bed.set_on_ground(true);
            test_bed.and_run()
        }

        fn in_flight(mut self) -> Self {
            self.set_on_ground(false);
            self
        }

        fn with(mut self, change: impl FnOnce(&mut EngineStartInputs)) -> Self {
            self.command(|a: &mut TestAircraft| change(&mut a.inputs));
            self
        }

        fn with_schedule(mut self, change: impl FnOnce(&mut EngineStartSchedule)) -> Self {
            self.command(|a: &mut TestAircraft| change(&mut a.schedule));
            self
        }

        fn and_run(mut self) -> Self {
            self.run_with_delta(Duration::from_millis(100));
            self
        }

        fn and_run_for(mut self, duration: Duration) -> Self {
            let step = Duration::from_millis(100);
            let mut elapsed = Duration::ZERO;
            while elapsed < duration {
                self.run_with_delta(step);
                elapsed += step;
            }
            self
        }

        fn n2(self, percent_value: f64) -> Self {
            self.with(|inputs| inputs.core_speed = Ratio::new::<percent>(percent_value))
        }

        fn egt(self, celsius: f64) -> Self {
            self.with(|inputs| {
                inputs.egt = ThermodynamicTemperature::new::<degree_celsius>(celsius)
            })
        }

        fn engine_state(self, state: EngineState) -> Self {
            self.with(|inputs| inputs.engine_state = state)
        }

        fn selector(self, position: EngineModeSelector) -> Self {
            self.with(|inputs| inputs.mode_selector = position)
        }

        fn master(self, on: bool) -> Self {
            self.with(|inputs| inputs.master_switch_is_on = on)
                .and_run()
        }

        fn manual_start(self, on: bool) -> Self {
            self.with(|inputs| inputs.manual_start_is_on = on).and_run()
        }

        /// The start valve position (the pneumatic system follows the command).
        fn valve_open(self, open: bool) -> Self {
            self.with(|inputs| inputs.start_valve_is_open = open)
        }

        /// IGN/START, ENG MASTER ON: an automatic start; the start valve opens, N2 at 10 %.
        fn automatic_start(self) -> Self {
            self.selector(EngineModeSelector::Ignition)
                .master(true)
                .engine_state(EngineState::Starting)
                .valve_open(true)
                .n2(10.)
                .and_run()
        }

        /// The core speed reaches the ignition and the HP valve N2.
        fn core_at_light_up_speed(self) -> Self {
            self.n2(25.).and_run()
        }

        fn failing(mut self, failure: FailureType) -> Self {
            self.fail(failure);
            self.and_run()
        }

        fn powered_igniters(mut self, powered: Igniters) -> Self {
            self.command(|a: &mut TestAircraft| a.sequence.set_powered_igniters(powered));
            self
        }

        fn fadec_relight_attempt(mut self, in_progress: bool) -> Self {
            self.command(|a: &mut TestAircraft| a.sequence.set_fadec_relight_attempt(in_progress));
            self
        }

        fn fan_speed(mut self, percent_value: f64) -> Self {
            self.command(|a: &mut TestAircraft| {
                a.sequence
                    .set_fan_speed(Ratio::new::<percent>(percent_value))
            });
            self
        }

        fn start_commands_lost(mut self, lost: bool) -> Self {
            self.command(|a: &mut TestAircraft| a.sequence.set_start_commands_lost(lost));
            self
        }

        fn ignition_is_available(&self) -> bool {
            self.query(|a| a.sequence.ignition_is_available())
        }

        fn phase(&self) -> EngineStartPhase {
            self.query(|a| a.sequence.phase())
        }

        fn fault(&self) -> EngineStartFault {
            self.query(|a| a.sequence.fault())
        }

        fn igniters(&self) -> Igniters {
            self.query(|a| a.sequence.igniters())
        }

        fn attempt(&self) -> u8 {
            self.query(|a| a.sequence.attempt())
        }

        fn fuel_is_cut(&self) -> bool {
            self.query(|a| a.sequence.fuel_is_cut())
        }

        fn valve_command(&self) -> StartValveCommand {
            self.query(|a| a.sequence.start_valve_command())
        }

        fn ground_quick_relight(&self) -> bool {
            self.query(|a| a.sequence.ground_quick_relight_in_progress())
        }

        fn flag(&mut self, name: &str) -> bool {
            self.read_by_name(&format!("ENGINE_1_{}", name))
        }

        fn number(&mut self, name: &str) -> f64 {
            self.read_by_name(&format!("ENGINE_1_{}", name))
        }

        fn fault_light(&mut self) -> bool {
            self.flag("FAULT_LIGHT")
        }

        fn motoring(&mut self) -> bool {
            self.flag("STARTER_MOTORING")
        }
    }
    impl TestBed for StartTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    const IGNITER_A: Igniters = Igniters { a: true, b: false };
    const IGNITER_B: Igniters = Igniters { a: false, b: true };

    #[test]
    fn an_automatic_start_opens_the_start_valve_and_waits_for_the_ignition() {
        let mut test_bed = StartTestBed::new().automatic_start();

        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert_eq!(test_bed.number("START_PHASE"), 2.);
        assert_eq!(test_bed.valve_command(), StartValveCommand::Open);
        // below 16 % N2: no ignition yet, no fuel
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert!(test_bed.fuel_is_cut());
        // the starter turns the core while the fuel is off
        assert!(test_bed.motoring());
    }

    #[test]
    fn a_first_automatic_start_lights_up_with_one_igniter() {
        let mut test_bed = StartTestBed::new().automatic_start().n2(18.).and_run();
        assert_eq!(test_bed.igniters(), IGNITER_A);
        assert_eq!(test_bed.number("IGNITERS"), 1.);
        // ignition but no HP fuel below 22 %
        assert!(test_bed.fuel_is_cut());

        test_bed = test_bed.core_at_light_up_speed();
        assert!(!test_bed.fuel_is_cut());
        assert!(!test_bed.motoring());
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn an_igniter_without_supply_does_not_light_the_engine() {
        let mut test_bed = StartTestBed::new()
            .powered_igniters(IGNITER_B)
            .automatic_start()
            .n2(18.)
            .and_run();
        // The first automatic start commands igniter A, which has no supply. The command stays in
        // L:A32NX_ENGINE_n_IGNITERS: the A380 FADEC hides an unsupplied igniter on the SD itself.
        assert_eq!(test_bed.igniters(), IGNITER_A);
        assert_eq!(test_bed.number("IGNITERS"), 1.);

        test_bed = test_bed.core_at_light_up_speed();
        assert!(test_bed.fuel_is_cut());
        assert!(test_bed.ignition_is_available());
    }

    #[test]
    fn no_ignition_is_available_without_the_supply_of_both_igniters() {
        let test_bed = StartTestBed::new().powered_igniters(Igniters::NONE);
        assert!(!test_bed.ignition_is_available());
    }

    /// The A320 rule of the second igniter, no pre-start motoring.
    fn with_second_igniter_rule(test_bed: StartTestBed) -> StartTestBed {
        test_bed.with_schedule(|schedule| {
            schedule.second_igniter_at_light_up_cold_or_above = Some(Length::new::<foot>(10_000.));
            schedule.max_pre_start_motoring_time = Duration::ZERO;
        })
    }

    #[test]
    fn a_cold_engine_gets_the_second_igniter_once_it_has_lit_up() {
        let mut test_bed = with_second_igniter_rule(StartTestBed::new())
            .with(|inputs| inputs.engine_thermal_state = 0.)
            .automatic_start()
            .n2(18.)
            .and_run();
        // One igniter first
        assert_eq!(test_bed.igniters(), IGNITER_A);

        // The second igniter once the ignition is detected
        test_bed = test_bed.core_at_light_up_speed();
        assert!(!test_bed.fuel_is_cut());
        assert_eq!(test_bed.igniters(), Igniters::BOTH);
        assert_eq!(test_bed.number("IGNITERS"), 3.);

        // The engine heats up once lit: the second igniter stays until the end of the ignition.
        test_bed = test_bed
            .with(|inputs| inputs.engine_thermal_state = 1.)
            .n2(40.)
            .and_run();
        assert_eq!(test_bed.igniters(), Igniters::BOTH);
        test_bed = test_bed.n2(52.).and_run();
        assert_eq!(test_bed.igniters(), Igniters::NONE);
    }

    #[test]
    fn a_warm_engine_at_a_low_airfield_keeps_a_single_igniter() {
        let test_bed = with_second_igniter_rule(StartTestBed::new())
            .with(|inputs| inputs.engine_thermal_state = 0.5)
            .automatic_start()
            .core_at_light_up_speed()
            .n2(30.)
            .and_run();
        assert!(!test_bed.fuel_is_cut());
        assert_eq!(test_bed.igniters(), IGNITER_A);
    }

    #[test]
    fn a_warm_engine_above_10000_ft_gets_the_second_igniter_once_it_has_lit_up() {
        let mut test_bed = with_second_igniter_rule(StartTestBed::new());
        test_bed.set_pressure_altitude(Length::new::<foot>(11_000.));
        let mut test_bed = test_bed
            .with(|inputs| inputs.engine_thermal_state = 0.5)
            .automatic_start()
            .n2(18.)
            .and_run();
        assert_eq!(test_bed.igniters(), IGNITER_A);

        test_bed = test_bed.core_at_light_up_speed();
        assert_eq!(test_bed.igniters(), Igniters::BOTH);
    }

    #[test]
    fn a_cold_engine_that_does_not_light_up_keeps_its_single_igniter() {
        // The second igniter comes with the detected ignition only: a failed igniter gives no
        // light-up, and the first attempt stays on that igniter until its NO LIGHT UP.
        let test_bed = with_second_igniter_rule(StartTestBed::new())
            .failing(FailureType::EngineIgniterA(1))
            .with(|inputs| inputs.engine_thermal_state = 0.)
            .automatic_start()
            .core_at_light_up_speed()
            .and_run_for(Duration::from_secs(5));
        assert!(test_bed.fuel_is_cut());
        assert_eq!(test_bed.igniters(), IGNITER_A);
    }

    #[test]
    fn without_the_second_igniter_rule_a_cold_engine_keeps_a_single_igniter() {
        // The A380: only one igniter operates for an automatic start.
        let test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.max_pre_start_motoring_time = Duration::ZERO)
            .with(|inputs| inputs.engine_thermal_state = 0.)
            .automatic_start()
            .core_at_light_up_speed()
            .n2(30.)
            .and_run();
        assert!(!test_bed.fuel_is_cut());
        assert_eq!(test_bed.igniters(), IGNITER_A);
    }

    #[test]
    fn the_ignition_stops_at_50_percent_n2_and_the_start_valve_closes() {
        let test_bed = StartTestBed::new()
            .automatic_start()
            .core_at_light_up_speed()
            .n2(52.)
            .and_run();

        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert_eq!(test_bed.valve_command(), StartValveCommand::Closed);
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn the_next_automatic_start_uses_the_other_igniter() {
        let mut test_bed = StartTestBed::new()
            .automatic_start()
            .core_at_light_up_speed()
            .n2(68.)
            .engine_state(EngineState::On)
            .and_run();
        assert_eq!(test_bed.phase(), EngineStartPhase::None);

        test_bed = test_bed
            .master(false)
            .engine_state(EngineState::Off)
            .n2(0.)
            .and_run()
            .automatic_start()
            .n2(18.)
            .and_run();
        assert_eq!(test_bed.igniters(), IGNITER_B);
    }

    #[test]
    fn a_failed_igniter_gives_no_light_up_then_a_new_start_with_both_igniters() {
        let mut test_bed = StartTestBed::new()
            .failing(FailureType::EngineIgniterA(1))
            .automatic_start()
            .core_at_light_up_speed();
        // igniter A is energized but does not light the engine
        assert_eq!(test_bed.igniters(), IGNITER_A);
        assert!(test_bed.fuel_is_cut());
        assert!(test_bed.motoring());

        test_bed = test_bed.and_run_for(Duration::from_secs(17));
        assert_eq!(test_bed.fault(), EngineStartFault::None);
        test_bed = test_bed.and_run_for(Duration::from_secs(2));
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);
        assert_eq!(test_bed.number("START_FAULT"), 1.);

        // the automatic dry crank: no fuel, no ignition, start valve open
        assert_eq!(test_bed.phase(), EngineStartPhase::AutomaticCrank);
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert!(test_bed.fuel_is_cut());
        assert_eq!(test_bed.valve_command(), StartValveCommand::Open);
        assert!(test_bed.motoring());
        assert!(!test_bed.fault_light());

        // after 30 s, a new attempt with both igniters: igniter B lights the engine
        test_bed = test_bed.and_run_for(Duration::from_secs(30));
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert_eq!(test_bed.attempt(), 2);
        assert_eq!(test_bed.igniters(), Igniters::BOTH);
        assert!(!test_bed.fuel_is_cut());

        // the engine runs: the start fault goes away
        test_bed = test_bed.n2(68.).engine_state(EngineState::On).and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn with_both_igniters_failed_the_automatic_start_aborts_after_three_attempts() {
        let mut test_bed = StartTestBed::new()
            .failing(FailureType::EngineIgniterA(1))
            .failing(FailureType::EngineIgniterB(1))
            .automatic_start()
            .core_at_light_up_speed()
            .and_run_for(Duration::from_secs(3 * (18 + 30) + 2));

        assert_eq!(test_bed.phase(), EngineStartPhase::Aborted);
        assert_eq!(test_bed.attempt(), 3);
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);
        assert!(test_bed.fault_light());
        assert!(test_bed.fuel_is_cut());
        assert_eq!(test_bed.valve_command(), StartValveCommand::Closed);

        // ENG MASTER OFF confirms the abort
        test_bed = test_bed.master(false);
        assert_eq!(test_bed.phase(), EngineStartPhase::None);
        assert!(!test_bed.fault_light());
        assert!(!test_bed.fuel_is_cut());
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn a_hot_start_aborts_the_attempt_above_the_start_egt_limit() {
        let mut test_bed = StartTestBed::new()
            .failing(FailureType::EngineHotStart(1))
            .automatic_start()
            .core_at_light_up_speed();
        assert!(test_bed.flag("START_EGT_OVERSHOOT"));

        test_bed = test_bed.n2(35.).egt(700.).and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::None);
        test_bed = test_bed.egt(730.).and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::EgtOverlimit);
        assert_eq!(test_bed.phase(), EngineStartPhase::AutomaticCrank);
        assert!(test_bed.fuel_is_cut());
    }

    #[test]
    fn a_hung_start_is_detected_when_the_core_speed_stops_rising() {
        let mut test_bed = StartTestBed::new()
            .failing(FailureType::EngineHungStart(1))
            .automatic_start()
            .core_at_light_up_speed();
        assert!(test_bed.flag("START_N2_HANG"));
        assert!(!test_bed.flag("START_EGT_OVERSHOOT"));

        test_bed = test_bed.n2(40.).and_run_for(Duration::from_secs(39));
        assert_eq!(test_bed.fault(), EngineStartFault::None);
        test_bed = test_bed.and_run_for(Duration::from_secs(2));
        assert_eq!(test_bed.fault(), EngineStartFault::HungStart);
        assert_eq!(test_bed.phase(), EngineStartPhase::AutomaticCrank);
    }

    #[test]
    fn a_normal_start_is_not_a_hung_start() {
        let mut test_bed = StartTestBed::new()
            .automatic_start()
            .core_at_light_up_speed();
        for step in 0..24 {
            test_bed = test_bed
                .n2(25. + step as f64)
                .and_run_for(Duration::from_secs(1));
        }
        assert_eq!(test_bed.fault(), EngineStartFault::None);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
    }

    #[test]
    fn a_slow_but_steady_spool_up_is_not_a_hung_start() {
        // 0.08 %/s: a slow MSFS spool-up (low starter air) that still rises
        let mut test_bed = StartTestBed::new()
            .automatic_start()
            .core_at_light_up_speed();
        for step in 0..1200 {
            test_bed = test_bed
                .n2(25. + step as f64 * 0.008)
                .and_run_for(Duration::from_millis(100));
        }
        assert_eq!(test_bed.fault(), EngineStartFault::None);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
    }

    #[test]
    fn a_core_without_starter_air_is_not_a_hung_start() {
        // the starter air drops after the light-up: the core stops rising for lack of air, not by a hung start
        let mut test_bed = StartTestBed::new()
            .automatic_start()
            .core_at_light_up_speed()
            .n2(30.)
            .with(|inputs| inputs.starter_air_pressurized = false)
            .and_run_for(Duration::from_secs(45));
        assert_ne!(test_bed.fault(), EngineStartFault::HungStart);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);

        // the air is back and the core still does not rise: hung start after 20 s
        test_bed = test_bed
            .with(|inputs| inputs.starter_air_pressurized = true)
            .and_run_for(Duration::from_secs(21));
        assert_eq!(test_bed.fault(), EngineStartFault::HungStart);
    }

    #[test]
    fn a_start_stall_is_detected_after_the_light_up() {
        let mut test_bed = StartTestBed::new()
            .failing(FailureType::EngineStartStall(1))
            .automatic_start()
            .core_at_light_up_speed();
        assert!(test_bed.flag("START_N2_HANG"));
        assert!(test_bed.flag("START_EGT_OVERSHOOT"));

        test_bed = test_bed.and_run_for(Duration::from_secs(4));
        assert_eq!(test_bed.fault(), EngineStartFault::Stall);
        assert_eq!(test_bed.phase(), EngineStartPhase::AutomaticCrank);
    }

    fn a380_start_with_the_core_at(core_speed: f64, fan_speed: f64) -> StartTestBed {
        StartTestBed::new()
            .with_schedule(with_a380_rules)
            .automatic_start()
            .with(|inputs| inputs.starter_air_pressurized = true)
            .fan_speed(fan_speed)
            .n2(core_speed)
            .and_run()
    }

    #[test]
    fn a_jammed_n1_rotor_aborts_the_automatic_start_without_a_new_attempt() {
        let mut test_bed = a380_start_with_the_core_at(35., 0.).and_run_for(Duration::from_secs(4));
        assert_eq!(test_bed.fault(), EngineStartFault::N1RotorJam);
        assert_eq!(test_bed.phase(), EngineStartPhase::Aborted);
        assert!(test_bed.fault_light());
        assert_eq!(test_bed.attempt(), 1);
    }

    #[test]
    fn the_fadec_relight_attempt_after_a_flameout_selects_the_continuous_ignition_by_itself() {
        let mut test_bed = StartTestBed::new()
            .in_flight()
            .with(|inputs| {
                inputs.master_switch_is_on = true;
                inputs.engine_state = EngineState::Shutting;
            })
            .and_run();
        assert!(!test_bed.flag("CONTINUOUS_IGNITION"));

        test_bed = test_bed.fadec_relight_attempt(true).and_run();
        assert!(test_bed.flag("CONTINUOUS_IGNITION"));
        assert_ne!(test_bed.igniters(), Igniters::NONE);

        test_bed = test_bed.fadec_relight_attempt(false).and_run();
        assert!(!test_bed.flag("CONTINUOUS_IGNITION"));
    }

    #[test]
    fn the_fadec_relight_attempt_needs_the_master_and_the_fadec_start_commands() {
        let mut test_bed = StartTestBed::new()
            .in_flight()
            .with(|inputs| inputs.engine_state = EngineState::Shutting)
            .fadec_relight_attempt(true)
            .and_run();
        assert!(!test_bed.flag("CONTINUOUS_IGNITION"));

        test_bed = test_bed
            .with(|inputs| inputs.master_switch_is_on = true)
            .start_commands_lost(true)
            .and_run();
        assert!(!test_bed.flag("CONTINUOUS_IGNITION"));
    }

    #[test]
    fn a_turning_n1_rotor_is_no_fault() {
        let test_bed = a380_start_with_the_core_at(35., 4.).and_run_for(Duration::from_secs(10));
        assert_ne!(test_bed.fault(), EngineStartFault::N1RotorJam);
    }

    #[test]
    fn the_n1_rotor_is_only_checked_once_the_core_is_past_the_check_speed() {
        let test_bed = a380_start_with_the_core_at(20., 0.).and_run_for(Duration::from_secs(10));
        assert_ne!(test_bed.fault(), EngineStartFault::N1RotorJam);
    }

    #[test]
    fn an_aircraft_that_gives_no_fan_speed_has_no_n1_rotor_monitoring() {
        let test_bed = StartTestBed::new()
            .automatic_start()
            .with(|inputs| inputs.starter_air_pressurized = true)
            .n2(35.)
            .and_run_for(Duration::from_secs(10));
        assert_ne!(test_bed.fault(), EngineStartFault::N1RotorJam);
    }

    #[test]
    fn a_failed_starter_aborts_the_automatic_start_without_a_new_attempt() {
        let mut test_bed = StartTestBed::new()
            .failing(FailureType::EngineStarter(1))
            .automatic_start()
            .n2(0.)
            .and_run();
        assert!(test_bed.flag("STARTER_FAILED"));
        assert!(!test_bed.motoring());

        test_bed = test_bed.and_run_for(Duration::from_secs(11));
        assert_eq!(test_bed.fault(), EngineStartFault::StarterFault);
        assert_eq!(test_bed.phase(), EngineStartPhase::Aborted);
        assert!(test_bed.fault_light());
    }

    #[test]
    fn a_start_without_starter_air_reports_low_start_air_pressure_without_abort() {
        let mut test_bed = StartTestBed::new()
            .with(|inputs| inputs.starter_air_pressurized = false)
            .automatic_start()
            .n2(0.)
            .and_run_for(Duration::from_secs(11));

        assert_eq!(test_bed.fault(), EngineStartFault::LowStartAirPressure);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert!(!test_bed.fault_light());

        // the crew supplies air: the alert goes away and the start goes on
        test_bed = test_bed
            .with(|inputs| inputs.starter_air_pressurized = true)
            .n2(10.)
            .and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn a_thrust_lever_not_at_idle_is_reported_during_the_start() {
        let test_bed = StartTestBed::new()
            .automatic_start()
            .with(|inputs| inputs.thrust_lever_at_idle = false)
            .and_run();

        assert_eq!(test_bed.fault(), EngineStartFault::ThrustLeverNotAtIdle);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
    }

    #[test]
    fn the_starter_time_is_monitored_when_the_aircraft_has_a_limit() {
        let mut test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.starter_time_limit = Some(Duration::from_secs(60)))
            .automatic_start()
            .core_at_light_up_speed();
        // a slow start: the core keeps rising, no hung start
        for step in 0..58 {
            test_bed = test_bed
                .n2(25. + step as f64 * 0.4)
                .and_run_for(Duration::from_secs(1));
        }
        assert_eq!(test_bed.fault(), EngineStartFault::None);

        test_bed = test_bed.n2(49.).and_run_for(Duration::from_secs(3));
        assert_eq!(test_bed.fault(), EngineStartFault::StarterTimeExceeded);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
    }

    /// A380: the starter engagement time exceedance aborts
    /// an automatic start on the ground, without further attempt (see update_condition_faults).
    #[test]
    fn the_starter_time_exceedance_aborts_an_automatic_start_without_new_attempt() {
        let mut test_bed = StartTestBed::new()
            .with_schedule(with_a380_rules)
            .automatic_start()
            .core_at_light_up_speed();
        // a slow start that keeps rising (no hung start) below the start valve closing, for 5 min
        for step in 0..300 {
            test_bed = test_bed
                .n2(25. + step as f64 * 0.08)
                .and_run_for(Duration::from_secs(1));
        }
        test_bed = test_bed.and_run_for(Duration::from_secs(3));

        assert_eq!(test_bed.fault(), EngineStartFault::StarterTimeExceeded);
        assert_eq!(test_bed.phase(), EngineStartPhase::Aborted);
        assert_eq!(test_bed.valve_command(), StartValveCommand::Closed);
        assert!(test_bed.fuel_is_cut());
        assert!(test_bed.fault_light());
        assert_eq!(test_bed.attempt(), 1);
    }

    /// A380: an abnormal start valve position interrupts the start, which is cranked and attempted twice more, then aborted.
    #[test]
    fn an_abnormal_start_valve_position_cranks_then_aborts_after_the_new_attempts() {
        let mut test_bed = StartTestBed::new()
            .with_schedule(with_a380_rules)
            .automatic_start()
            // the valve stays closed although commanded open (START VLV FAULT NOT OPEN)
            .valve_open(false)
            .n2(0.)
            .with(|inputs| inputs.start_valve_position_abnormal = true)
            .and_run();
        assert_eq!(test_bed.phase(), EngineStartPhase::AutomaticCrank);
        assert!(!test_bed.fault_light());

        test_bed = test_bed.and_run_for(Duration::from_secs(31));
        assert_eq!(test_bed.attempt(), 2);
        assert_eq!(test_bed.phase(), EngineStartPhase::AutomaticCrank);

        test_bed = test_bed.and_run_for(Duration::from_secs(62));
        assert_eq!(test_bed.phase(), EngineStartPhase::Aborted);
        assert!(test_bed.fault_light());
    }

    #[test]
    fn an_abnormal_start_valve_position_does_not_abort_without_the_a380_rule() {
        let test_bed = StartTestBed::new()
            .automatic_start()
            .valve_open(false)
            .n2(0.)
            .with(|inputs| inputs.start_valve_position_abnormal = true)
            .and_run_for(Duration::from_secs(5));
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
    }

    /// A380 starter limit: no running engagement of the starter above 25 % N2.
    #[test]
    fn the_starter_does_not_engage_while_the_core_turns_above_25_percent() {
        let mut test_bed = StartTestBed::new()
            .with_schedule(with_a380_rules)
            .selector(EngineModeSelector::Ignition)
            .n2(30.)
            .master(true)
            .engine_state(EngineState::Starting)
            .and_run();
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert_eq!(test_bed.valve_command(), StartValveCommand::Closed);

        // the core runs down to 25 %: the starter engages, and stays engaged above 25 %
        test_bed = test_bed.n2(25.).and_run();
        assert_eq!(test_bed.valve_command(), StartValveCommand::Open);
        test_bed = test_bed.n2(40.).and_run();
        assert_eq!(test_bed.valve_command(), StartValveCommand::Open);
    }

    #[test]
    fn a_start_from_a_stopped_core_engages_the_starter_with_the_engagement_limit() {
        let test_bed = StartTestBed::new()
            .with_schedule(with_a380_rules)
            .automatic_start();
        assert_eq!(test_bed.valve_command(), StartValveCommand::Open);
    }

    #[test]
    fn the_engagement_limit_is_a_pure_rule() {
        let limit = Some(Ratio::new::<percent>(25.));
        assert!(starter_can_engage(false, Ratio::new::<percent>(25.), limit));
        assert!(!starter_can_engage(
            false,
            Ratio::new::<percent>(25.1),
            limit
        ));
        assert!(starter_can_engage(true, Ratio::new::<percent>(40.), limit));
        assert!(starter_can_engage(false, Ratio::new::<percent>(40.), None));
    }

    /// Engine running at IGN START, the ENG MASTER set to OFF, the core spinning down to `n2`, then
    /// the ENG MASTER set back to ON after `master_off`.
    fn master_cycled(master_off: Duration, n2: f64) -> StartTestBed {
        StartTestBed::new()
            .with_schedule(with_a380_rules)
            .selector(EngineModeSelector::Ignition)
            .engine_state(EngineState::On)
            .n2(70.)
            .master(true)
            .master(false)
            .engine_state(EngineState::Shutting)
            .n2(n2)
            .and_run_for(master_off)
            .master(true)
    }

    /// A380 quick relight: ENG MASTER ON to OFF then back to ON within 30 s, N2 above 45 %: the
    /// FADEC opens the fuel metering valve at once.
    #[test]
    fn a_quick_relight_on_the_ground_gives_the_fuel_at_once_without_start_sequence() {
        // 48 %: above the 45 % of the quick relight, below the end of the ignition (50 % in this
        // schedule), which alone skipped the start sequence before
        let test_bed = master_cycled(Duration::from_secs(10), 48.);
        assert_eq!(test_bed.phase(), EngineStartPhase::None);
        assert!(!test_bed.fuel_is_cut());
        assert_eq!(test_bed.valve_command(), StartValveCommand::FadecSchedule);
    }

    #[test]
    fn no_quick_relight_after_30_s_or_below_45_percent_n2() {
        let test_bed = master_cycled(Duration::from_secs(35), 48.);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);

        let test_bed = master_cycled(Duration::from_secs(10), 44.);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
    }

    /// The quick relight selects the continuous ignition with both igniters. Measured in the sim:
    /// without it the FADEC kept a ground quick relight at NORM in its shutdown.
    #[test]
    fn a_ground_quick_relight_lasts_until_the_engine_runs_again() {
        let test_bed = master_cycled(Duration::from_secs(2), 60.);
        assert!(test_bed.ground_quick_relight());

        let test_bed = test_bed.engine_state(EngineState::Restarting).and_run();
        assert!(test_bed.ground_quick_relight());

        let test_bed = test_bed.engine_state(EngineState::On).and_run();
        assert!(!test_bed.ground_quick_relight());
    }

    #[test]
    fn no_ground_quick_relight_without_the_start_commands() {
        let test_bed = StartTestBed::new()
            .with_schedule(with_a380_rules)
            .selector(EngineModeSelector::Ignition)
            .engine_state(EngineState::On)
            .n2(70.)
            .master(true)
            .master(false)
            .engine_state(EngineState::Shutting)
            .n2(60.)
            .start_commands_lost(true)
            .and_run_for(Duration::from_secs(2))
            .master(true);
        assert!(!test_bed.ground_quick_relight());
    }

    #[test]
    fn no_ground_quick_relight_after_30_s_below_45_percent_n2_in_flight_or_without_schedule() {
        assert!(!master_cycled(Duration::from_secs(35), 60.).ground_quick_relight());
        assert!(!master_cycled(Duration::from_secs(2), 44.).ground_quick_relight());

        let test_bed = master_cycled(Duration::from_secs(2), 60.).master(false);
        assert!(!test_bed.ground_quick_relight());

        let test_bed = master_cycled(Duration::from_secs(2), 60.)
            .in_flight()
            .and_run();
        assert!(!test_bed.ground_quick_relight());

        // the A320 schedule has no ground quick relight
        let test_bed = StartTestBed::new()
            .engine_state(EngineState::On)
            .n2(70.)
            .master(true)
            .master(false)
            .engine_state(EngineState::Shutting)
            .n2(60.)
            .and_run_for(Duration::from_secs(2))
            .master(true);
        assert!(!test_bed.ground_quick_relight());
    }

    #[test]
    fn no_automatic_abort_above_the_abort_inhibition_core_speed() {
        let test_bed = StartTestBed::new()
            .failing(FailureType::EngineHotStart(1))
            .automatic_start()
            .core_at_light_up_speed()
            .n2(55.)
            .egt(760.)
            .and_run();

        assert_eq!(test_bed.fault(), EngineStartFault::EgtOverlimit);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
    }

    #[test]
    fn a_manual_start_motors_the_engine_before_the_master_on() {
        let mut test_bed = StartTestBed::new()
            .selector(EngineModeSelector::Ignition)
            .manual_start(true)
            .valve_open(true)
            .and_run();

        assert_eq!(test_bed.phase(), EngineStartPhase::Motoring);
        assert_eq!(test_bed.valve_command(), StartValveCommand::Open);
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert!(test_bed.motoring());

        // ENG MASTER ON at 22 %: both igniters, the engine lights up
        test_bed = test_bed.n2(22.).master(true).and_run();
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert_eq!(test_bed.igniters(), Igniters::BOTH);
        assert!(!test_bed.fuel_is_cut());
        assert!(test_bed.flag("START_MANUAL"));
    }

    #[test]
    fn the_man_start_pb_off_stops_the_manual_start_before_the_master_on() {
        let test_bed = StartTestBed::new()
            .selector(EngineModeSelector::Ignition)
            .manual_start(true)
            .manual_start(false);

        assert_eq!(test_bed.phase(), EngineStartPhase::None);
        assert_eq!(test_bed.valve_command(), StartValveCommand::FadecSchedule);
    }

    #[test]
    fn a_manual_start_is_not_aborted_without_light_up() {
        let mut test_bed = StartTestBed::new()
            .failing(FailureType::EngineIgniterA(1))
            .failing(FailureType::EngineIgniterB(1))
            .selector(EngineModeSelector::Ignition)
            .manual_start(true)
            .valve_open(true)
            .n2(22.)
            .master(true)
            .and_run_for(Duration::from_secs(20));

        // the FADEC reports the fault, the crew aborts
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert!(!test_bed.fault_light());
    }

    #[test]
    fn a_manual_start_is_aborted_above_the_start_egt_limit() {
        let mut test_bed = StartTestBed::new()
            .selector(EngineModeSelector::Ignition)
            .manual_start(true)
            .valve_open(true)
            .n2(22.)
            .master(true)
            .n2(30.)
            .egt(740.)
            .and_run();

        assert_eq!(test_bed.fault(), EngineStartFault::EgtOverlimit);
        assert_eq!(test_bed.phase(), EngineStartPhase::Aborted);
        assert!(test_bed.fuel_is_cut());
        assert!(!test_bed.fault_light());
    }

    #[test]
    fn a_dry_crank_motors_the_engine_without_fuel_until_the_man_start_pb_off() {
        let mut test_bed = StartTestBed::new()
            .selector(EngineModeSelector::Crank)
            .manual_start(true)
            .valve_open(true)
            .n2(20.)
            .and_run();

        assert_eq!(test_bed.phase(), EngineStartPhase::Motoring);
        assert_eq!(test_bed.valve_command(), StartValveCommand::Open);
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert!(test_bed.motoring());

        test_bed = test_bed.manual_start(false);
        assert_eq!(test_bed.phase(), EngineStartPhase::None);
    }

    #[test]
    fn a_wet_crank_gives_fuel_without_ignition_until_norm() {
        let mut test_bed = StartTestBed::new()
            .selector(EngineModeSelector::Crank)
            .manual_start(true)
            .valve_open(true)
            .n2(20.)
            .master(true);

        assert_eq!(test_bed.phase(), EngineStartPhase::WetCrank);
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        // no ignition: the engine must not light up
        assert!(test_bed.fuel_is_cut());
        assert!(test_bed.motoring());

        test_bed = test_bed.selector(EngineModeSelector::Norm).and_run();
        assert_eq!(test_bed.phase(), EngineStartPhase::Aborted);
        assert!(!test_bed.fault_light());
        assert_eq!(test_bed.valve_command(), StartValveCommand::Closed);
    }

    #[test]
    fn a_start_valve_stuck_open_motors_the_engine_with_the_master_off() {
        let mut test_bed = StartTestBed::new().valve_open(true).and_run();

        assert_eq!(test_bed.phase(), EngineStartPhase::None);
        assert!(test_bed.motoring());
    }

    #[test]
    fn in_flight_a_windmilling_engine_with_the_master_off_is_left_to_the_airflow() {
        // A flamed out engine in flight, ENG MASTER set OFF before a relight, start valve open with air: the start sequence
        // neither motors it (no MSFS starter, no FADEC crank) nor commands its start valve; the windmill N2 is the
        // engine_failure / FADEC business.
        let mut test_bed = StartTestBed::new()
            .in_flight()
            .selector(EngineModeSelector::Ignition)
            .master(true)
            .engine_state(EngineState::Shutting)
            .n2(12.)
            .valve_open(true)
            .with(|inputs| inputs.relight_pending = true)
            .master(false)
            .and_run_for(Duration::from_secs(40));

        assert_eq!(test_bed.phase(), EngineStartPhase::None);
        assert!(!test_bed.motoring());
        assert!(!test_bed.fuel_is_cut());
        assert_eq!(test_bed.valve_command(), StartValveCommand::FadecSchedule);
    }

    #[test]
    fn a_running_engine_is_not_motored() {
        let mut test_bed = StartTestBed::new()
            .master(true)
            .engine_state(EngineState::On)
            .n2(68.)
            .valve_open(true)
            .and_run();

        assert!(!test_bed.motoring());
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn a_master_on_of_a_spinning_engine_is_no_start_sequence() {
        // the FADEC relights an engine that still turns fast (quick relight on the ground)
        let test_bed = StartTestBed::new()
            .selector(EngineModeSelector::Ignition)
            .engine_state(EngineState::Shutting)
            .n2(60.)
            .master(true);

        assert_eq!(test_bed.phase(), EngineStartPhase::None);
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn the_preset_quick_mode_has_no_start_sequence() {
        let test_bed = StartTestBed::new()
            .with(|inputs| inputs.preset_quick_mode = true)
            .automatic_start();

        assert_eq!(test_bed.phase(), EngineStartPhase::None);
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn in_flight_there_is_no_start_sequence_and_both_igniters_are_used() {
        let test_bed = StartTestBed::new()
            .in_flight()
            .selector(EngineModeSelector::Norm)
            .master(true)
            .engine_state(EngineState::Restarting)
            .n2(10.)
            .and_run();

        assert_eq!(test_bed.phase(), EngineStartPhase::None);
        assert!(!test_bed.fuel_is_cut());
        assert_eq!(test_bed.igniters(), Igniters::BOTH);
        assert_eq!(test_bed.valve_command(), StartValveCommand::FadecSchedule);
    }

    #[test]
    fn in_flight_an_engine_that_does_not_relight_is_reported() {
        let mut test_bed = StartTestBed::new()
            .in_flight()
            .with(|inputs| {
                inputs.relight_pending = true;
                inputs.crew_relight_without_light_up = true;
            })
            .engine_state(EngineState::Restarting)
            .master(true)
            .and_run_for(Duration::from_secs(17));
        assert_eq!(test_bed.fault(), EngineStartFault::None);

        test_bed = test_bed.and_run_for(Duration::from_secs(2));
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);

        // the engine relights: the alert goes away
        test_bed = test_bed
            .with(|inputs| inputs.relight_pending = false)
            .and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn in_flight_the_no_light_up_fault_needs_a_crew_relight_attempt() {
        let mut test_bed = StartTestBed::new()
            .with_schedule(|schedule| {
                schedule.in_flight_no_light_up_time = Duration::from_secs(30);
            })
            .in_flight()
            .with(|inputs| inputs.relight_pending = true)
            .engine_state(EngineState::Restarting)
            .master(true)
            .and_run_for(Duration::from_secs(40));
        assert_eq!(test_bed.fault(), EngineStartFault::None);

        test_bed = test_bed
            .with(|inputs| inputs.crew_relight_without_light_up = true)
            .and_run_for(Duration::from_secs(29));
        assert_eq!(test_bed.fault(), EngineStartFault::None);

        test_bed = test_bed.and_run_for(Duration::from_secs(2));
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);
    }

    #[test]
    fn in_flight_the_no_light_up_fault_stays_while_the_crew_relight_has_not_lit_up() {
        let mut test_bed = StartTestBed::new()
            .with_schedule(|schedule| {
                schedule.in_flight_no_light_up_time = Duration::from_secs(30);
            })
            .in_flight()
            .with(|inputs| {
                inputs.relight_pending = true;
                inputs.crew_relight_without_light_up = true;
            })
            .engine_state(EngineState::Restarting)
            .master(true)
            .and_run_for(Duration::from_secs(31));
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);

        // the flag stays true after the attempt window: the fault holds
        test_bed = test_bed.and_run_for(Duration::from_secs(5));
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);

        test_bed = test_bed
            .with(|inputs| inputs.crew_relight_without_light_up = false)
            .and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn in_flight_the_no_light_up_time_is_the_one_of_the_relight() {
        // An A380 in-flight relight must light up within 30 s, while the ground start of the
        // same aircraft has 20 s
        let mut test_bed = StartTestBed::new()
            .with_schedule(|schedule| {
                schedule.no_light_up_time = Duration::from_secs(20);
                schedule.in_flight_no_light_up_time = Duration::from_secs(30);
            })
            .in_flight()
            .with(|inputs| {
                inputs.relight_pending = true;
                inputs.crew_relight_without_light_up = true;
            })
            .engine_state(EngineState::Restarting)
            .master(true)
            .and_run_for(Duration::from_secs(29));
        assert_eq!(test_bed.fault(), EngineStartFault::None);

        test_bed = test_bed.and_run_for(Duration::from_secs(2));
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);
    }

    /// In flight, ENG MASTER ON of an engine that waits for a relight, with an 865 °C relight EGT
    /// limit (A380).
    fn in_flight_relight_with_egt_limit() -> StartTestBed {
        StartTestBed::new()
            .with_schedule(|schedule| {
                schedule.relight_egt_limit =
                    Some(ThermodynamicTemperature::new::<degree_celsius>(865.));
                schedule.in_flight_no_light_up_time = Duration::from_secs(30);
            })
            .in_flight()
            .with(|inputs| inputs.relight_pending = true)
            .engine_state(EngineState::Restarting)
            .master(true)
    }

    #[test]
    fn in_flight_a_relight_below_the_relight_egt_limit_is_no_fault() {
        // above the 745 °C of the A380 ground start, below the 865 °C of the relight
        let test_bed = in_flight_relight_with_egt_limit()
            .with(|inputs| inputs.relight_pending = false)
            .egt(850.)
            .and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn in_flight_a_relight_above_the_relight_egt_limit_is_egt_overlimit_until_master_off() {
        // A380 relight max EGT 865 °C; above it ENG START FAULT EGT OVERLIMIT, whose in-flight
        // action is the ENG MASTER OFF
        let mut test_bed = in_flight_relight_with_egt_limit()
            .with(|inputs| inputs.relight_pending = false)
            .egt(870.)
            .and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::EgtOverlimit);

        // the EGT comes back down and the engine reaches idle: the fault stays
        test_bed = test_bed
            .egt(600.)
            .engine_state(EngineState::On)
            .and_run_for(Duration::from_secs(5));
        assert_eq!(test_bed.fault(), EngineStartFault::EgtOverlimit);

        test_bed = test_bed.master(false);
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn in_flight_a_running_engine_is_not_watched_against_the_relight_egt_limit() {
        let test_bed = StartTestBed::new()
            .with_schedule(|schedule| {
                schedule.relight_egt_limit =
                    Some(ThermodynamicTemperature::new::<degree_celsius>(865.));
            })
            .in_flight()
            .engine_state(EngineState::On)
            .master(true)
            .egt(900.)
            .and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn without_a_relight_egt_limit_the_relight_egt_is_not_watched() {
        let test_bed = StartTestBed::new()
            .in_flight()
            .with(|inputs| inputs.relight_pending = true)
            .engine_state(EngineState::Restarting)
            .master(true)
            .egt(900.)
            .and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    /// In flight, ENG MASTER ON of an engine that waits for a relight, start valve open, no air.
    fn in_flight_start_without_air(monitors_in_flight_start_air: bool) -> StartTestBed {
        StartTestBed::new()
            .with_schedule(|schedule| {
                schedule.monitors_in_flight_start_air = monitors_in_flight_start_air;
                schedule.in_flight_no_light_up_time = Duration::from_secs(30);
            })
            .in_flight()
            .with(|inputs| {
                inputs.relight_pending = true;
                inputs.starter_air_pressurized = false;
            })
            .engine_state(EngineState::Restarting)
            .valve_open(true)
            .master(true)
            .and_run_for(Duration::from_secs(11))
    }

    #[test]
    fn in_flight_a_start_valve_open_without_air_is_reported_when_the_aircraft_monitors_it() {
        // A380 ENG START FAULT NO STARTER AIR PRESSURE has an in-flight branch: min speed for a
        // windmill relight 260 kt, windmill start initiated
        let mut test_bed = in_flight_start_without_air(true);
        assert_eq!(test_bed.fault(), EngineStartFault::LowStartAirPressure);

        // the crew supplies air: the alert goes away
        test_bed = test_bed
            .with(|inputs| inputs.starter_air_pressurized = true)
            .and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn in_flight_a_start_valve_open_without_air_is_not_reported_otherwise() {
        let test_bed = in_flight_start_without_air(false);
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn continuous_ignition_in_flight_uses_one_igniter_and_both_if_it_fails() {
        let mut test_bed = StartTestBed::new()
            .in_flight()
            .master(true)
            .engine_state(EngineState::On)
            .n2(80.)
            .selector(EngineModeSelector::Ignition)
            .and_run();
        assert_eq!(test_bed.igniters(), IGNITER_A);
        assert!(test_bed.flag("CONTINUOUS_IGNITION"));

        test_bed = test_bed.failing(FailureType::EngineIgniterA(1));
        assert_eq!(test_bed.igniters(), Igniters::BOTH);
    }

    #[test]
    fn continuous_ignition_of_an_aircraft_with_both_igniters() {
        let test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.continuous_ignition_uses_both_igniters = true)
            .in_flight()
            .master(true)
            .engine_state(EngineState::On)
            .n2(80.)
            .selector(EngineModeSelector::Ignition)
            .and_run();

        assert_eq!(test_bed.igniters(), Igniters::BOTH);
    }

    #[test]
    fn continuous_ignition_on_the_ground_needs_norm_then_ign_after_the_start() {
        let mut test_bed = StartTestBed::new()
            .automatic_start()
            .core_at_light_up_speed()
            .n2(68.)
            .engine_state(EngineState::On)
            .and_run();
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert!(!test_bed.flag("CONTINUOUS_IGNITION"));

        test_bed = test_bed
            .selector(EngineModeSelector::Norm)
            .and_run()
            .selector(EngineModeSelector::Ignition)
            .and_run();
        assert_eq!(test_bed.igniters(), IGNITER_A);
    }

    #[test]
    fn the_igniter_faults_are_reported_at_once() {
        let mut test_bed = StartTestBed::new().failing(FailureType::EngineIgniterB(1));

        assert!(!test_bed.flag("IGNITER_A_FAULT"));
        assert!(test_bed.flag("IGNITER_B_FAULT"));
        assert!(test_bed.query(|a| a.sequence.ignition_is_available()));

        test_bed = test_bed.failing(FailureType::EngineIgniterA(1));
        assert!(!test_bed.query(|a| a.sequence.ignition_is_available()));
    }

    #[test]
    fn the_fire_pb_cuts_the_ignition() {
        let test_bed = StartTestBed::new()
            .automatic_start()
            .n2(18.)
            .with(|inputs| inputs.fire_push_button_is_released = true)
            .and_run();

        assert_eq!(test_bed.igniters(), Igniters::NONE);
    }

    #[test]
    fn a_stall_gives_a_new_start_at_once_then_the_dry_crank_after_the_last_attempt() {
        let mut test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.stall_or_egt_restart_before_crank = true)
            .failing(FailureType::EngineStartStall(1))
            .automatic_start()
            .core_at_light_up_speed()
            .n2(35.)
            .and_run_for(Duration::from_secs(4));

        // NEW START IN PROGRESS first: no dry crank, the second attempt runs with both igniters
        assert_eq!(test_bed.fault(), EngineStartFault::Stall);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert_eq!(test_bed.attempt(), 2);
        assert_eq!(test_bed.igniters(), Igniters::BOTH);
        assert!(!test_bed.fuel_is_cut());

        // the third attempt stalls too: restart not possible, AUTO CRANK IN PROGRESS
        test_bed = test_bed.and_run_for(Duration::from_secs(8));
        assert_eq!(test_bed.attempt(), 3);
        assert_eq!(test_bed.phase(), EngineStartPhase::AutomaticCrank);
        assert!(test_bed.fuel_is_cut());

        // then the abort: ENG MASTER OFF
        test_bed = test_bed.and_run_for(Duration::from_secs(31));
        assert_eq!(test_bed.phase(), EngineStartPhase::Aborted);
        assert!(test_bed.fault_light());
    }

    #[test]
    fn an_egt_over_limit_gives_a_new_start_at_once() {
        let test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.stall_or_egt_restart_before_crank = true)
            .failing(FailureType::EngineHotStart(1))
            .automatic_start()
            .core_at_light_up_speed()
            .n2(35.)
            .egt(730.)
            .and_run()
            .egt(600.)
            .and_run();

        assert_eq!(test_bed.fault(), EngineStartFault::EgtOverlimit);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert_eq!(test_bed.attempt(), 2);
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn an_egt_over_limit_restart_waits_for_the_egt_to_fall_below_the_limit() {
        let mut test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.stall_or_egt_restart_before_crank = true)
            .failing(FailureType::EngineHotStart(1))
            .automatic_start()
            .core_at_light_up_speed()
            .n2(35.)
            .egt(730.)
            .and_run();
        assert_eq!(test_bed.attempt(), 2);

        // the engine is still hot: the new attempt gets no fuel and uses up no further attempt
        test_bed = test_bed.and_run_for(Duration::from_secs(2));
        assert_eq!(test_bed.attempt(), 2);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert!(test_bed.fuel_is_cut());

        // the long wait is no NO LIGHT UP either
        test_bed = test_bed.and_run_for(Duration::from_secs(20));
        assert_eq!(test_bed.attempt(), 2);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert_eq!(test_bed.fault(), EngineStartFault::EgtOverlimit);

        test_bed = test_bed.egt(600.).and_run_for(Duration::from_secs(1));
        assert_eq!(test_bed.attempt(), 2);
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn a_no_light_up_still_cranks_before_the_new_start() {
        let test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.stall_or_egt_restart_before_crank = true)
            .failing(FailureType::EngineIgniterA(1))
            .failing(FailureType::EngineIgniterB(1))
            .automatic_start()
            .core_at_light_up_speed()
            .and_run_for(Duration::from_secs(19));

        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);
        assert_eq!(test_bed.phase(), EngineStartPhase::AutomaticCrank);
    }

    #[test]
    fn a_manual_start_lights_up_at_the_maximum_motoring_speed_of_its_schedule() {
        // ENG MASTER ON at 21 % (maximum motoring speed, 20 % minimum)
        let test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.manual_start_fuel_on_n2 = Ratio::new::<percent>(20.))
            .selector(EngineModeSelector::Ignition)
            .manual_start(true)
            .valve_open(true)
            .n2(21.)
            .master(true)
            .and_run();

        assert_eq!(test_bed.igniters(), Igniters::BOTH);
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn a_manual_start_does_not_light_up_below_its_light_up_speed() {
        let test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.manual_start_fuel_on_n2 = Ratio::new::<percent>(20.))
            .selector(EngineModeSelector::Ignition)
            .manual_start(true)
            .valve_open(true)
            .n2(18.)
            .master(true)
            .and_run();

        assert!(test_bed.fuel_is_cut());
    }

    #[test]
    fn an_automatic_start_keeps_the_automatic_light_up_speed() {
        let test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.manual_start_fuel_on_n2 = Ratio::new::<percent>(20.))
            .automatic_start()
            .n2(21.)
            .and_run();

        assert!(test_bed.fuel_is_cut());
    }

    /// In flight, engine 1 flamed out, IGN, ENG MASTER ON for a relight, starter air available.
    fn in_flight_relight_with_starter_air(detected_in_flight: bool) -> StartTestBed {
        StartTestBed::new()
            .with_schedule(|schedule| {
                schedule.starter_fault_detected_in_flight = detected_in_flight
            })
            .in_flight()
            .selector(EngineModeSelector::Ignition)
            .with(|inputs| inputs.relight_pending = true)
            .engine_state(EngineState::Restarting)
            .valve_open(true)
            .n2(8.)
            .master(true)
    }

    #[test]
    fn in_flight_a_failed_starter_is_reported_during_a_relight_until_the_touchdown() {
        let mut test_bed = in_flight_relight_with_starter_air(true)
            .failing(FailureType::EngineStarter(1))
            .and_run_for(Duration::from_secs(9));
        assert_ne!(test_bed.fault(), EngineStartFault::StarterFault);

        test_bed = test_bed.and_run_for(Duration::from_secs(2));
        assert_eq!(test_bed.fault(), EngineStartFault::StarterFault);

        // the crew ends the relight: the fault (WINDMILL START ONLY) stays for the flight
        test_bed = test_bed.master(false).and_run_for(Duration::from_secs(60));
        assert_eq!(test_bed.fault(), EngineStartFault::StarterFault);

        test_bed.set_on_ground(true);
        test_bed = test_bed.and_run();
        assert_eq!(test_bed.fault(), EngineStartFault::None);
    }

    #[test]
    fn in_flight_a_working_starter_is_no_starter_fault() {
        let test_bed =
            in_flight_relight_with_starter_air(true).and_run_for(Duration::from_secs(15));

        assert_ne!(test_bed.fault(), EngineStartFault::StarterFault);
    }

    #[test]
    fn in_flight_no_starter_fault_without_the_in_flight_detection() {
        let test_bed = in_flight_relight_with_starter_air(false)
            .failing(FailureType::EngineStarter(1))
            .and_run_for(Duration::from_secs(15));

        assert_ne!(test_bed.fault(), EngineStartFault::StarterFault);
    }

    #[test]
    fn the_automatic_continuous_ignition_works_at_norm_in_flight_and_on_the_ground() {
        let mut test_bed = StartTestBed::new()
            .in_flight()
            .master(true)
            .engine_state(EngineState::On)
            .n2(80.)
            .selector(EngineModeSelector::Norm)
            .and_run();
        assert!(!test_bed.flag("CONTINUOUS_IGNITION"));

        test_bed = test_bed
            .with(|inputs| inputs.automatic_continuous_ignition = true)
            .and_run();
        assert!(test_bed.flag("CONTINUOUS_IGNITION"));
        assert_eq!(test_bed.igniters(), IGNITER_A);

        // on the ground no NORM then IGN/START is needed for the automatic selection
        test_bed.set_on_ground(true);
        test_bed = test_bed.and_run();
        assert!(test_bed.flag("CONTINUOUS_IGNITION"));

        test_bed = test_bed
            .with(|inputs| inputs.automatic_continuous_ignition = false)
            .and_run();
        assert!(!test_bed.flag("CONTINUOUS_IGNITION"));
        assert_eq!(test_bed.igniters(), Igniters::NONE);
    }

    #[test]
    fn the_automatic_continuous_ignition_needs_a_running_engine() {
        let mut test_bed = StartTestBed::new()
            .in_flight()
            .master(true)
            .engine_state(EngineState::Shutting)
            .n2(10.)
            .with(|inputs| inputs.automatic_continuous_ignition = true)
            .and_run();

        assert!(!test_bed.flag("CONTINUOUS_IGNITION"));
    }

    /// A320 ENG 1(2) HP FUEL VALVE: a valve failed closed gives no fuel to the
    /// engine, which does not light up.
    #[test]
    fn an_hp_fuel_valve_stuck_closed_gives_no_light_up_although_the_fadec_commands_the_fuel() {
        let mut test_bed = StartTestBed::new()
            .with(|inputs| inputs.hp_fuel_valve_stuck_closed = true)
            .automatic_start();
        assert!(!test_bed.query(|a| a.sequence.fuel_is_commanded()));

        test_bed = test_bed.core_at_light_up_speed();
        // the FADEC commands the HP fuel valve open (ignition on, light-up speed), the engine stays dry
        assert!(test_bed.query(|a| a.sequence.fuel_is_commanded()));
        assert!(test_bed.fuel_is_cut());

        test_bed = test_bed.and_run_for(Duration::from_secs(19));
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);
        // the dry crank commands no fuel
        assert_eq!(test_bed.phase(), EngineStartPhase::AutomaticCrank);
        assert!(!test_bed.query(|a| a.sequence.fuel_is_commanded()));
    }

    /// A320: the ENG FAULT light also comes on for an abnormal HP fuel
    /// valve position or a thrust control malfunction, which the aircraft gives the start sequence.
    #[test]
    fn the_fault_light_also_follows_the_other_conditions_of_the_aircraft() {
        let mut test_bed = StartTestBed::new()
            .with(|inputs| inputs.other_fault_light_conditions = true)
            .and_run();
        assert!(test_bed.fault_light());
        assert!(test_bed.query(|a| a.sequence.fault_light_is_on()));

        test_bed = test_bed
            .with(|inputs| inputs.other_fault_light_conditions = false)
            .and_run();
        assert!(!test_bed.fault_light());
    }

    /// A320 dry cranking: a hot engine gets up to 60 s of pre-start
    /// motoring before the ignition.
    #[test]
    fn a_hot_engine_gets_a_pre_start_motoring_before_the_ignition() {
        let mut test_bed = StartTestBed::new()
            .with(|inputs| inputs.engine_thermal_state = 1.)
            .automatic_start()
            .core_at_light_up_speed();
        assert!(test_bed.query(|a| a.sequence.pre_start_motoring_in_progress()));
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert!(test_bed.fuel_is_cut());
        assert!(test_bed.motoring());

        test_bed = test_bed.and_run_for(Duration::from_secs(58));
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        // no NO LIGHT UP while the motoring runs: the ignition has not started
        assert_eq!(test_bed.fault(), EngineStartFault::None);

        test_bed = test_bed.and_run_for(Duration::from_secs(2));
        assert!(!test_bed.query(|a| a.sequence.pre_start_motoring_in_progress()));
        assert_eq!(test_bed.igniters(), IGNITER_A);
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn the_pre_start_motoring_time_follows_the_thermal_state() {
        let test_bed = StartTestBed::new()
            .with(|inputs| inputs.engine_thermal_state = 0.5)
            .automatic_start()
            .core_at_light_up_speed()
            .and_run_for(Duration::from_secs(29));
        assert!(test_bed.query(|a| a.sequence.pre_start_motoring_in_progress()));

        let test_bed = test_bed.and_run_for(Duration::from_secs(2));
        assert!(!test_bed.query(|a| a.sequence.pre_start_motoring_in_progress()));
        assert_eq!(test_bed.igniters(), IGNITER_A);
    }

    #[test]
    fn a_cold_engine_or_a_manual_start_has_no_pre_start_motoring() {
        let cold = StartTestBed::new()
            .with(|inputs| inputs.engine_thermal_state = 0.)
            .automatic_start()
            .core_at_light_up_speed();
        assert!(!cold.query(|a| a.sequence.pre_start_motoring_in_progress()));
        assert!(!cold.fuel_is_cut());

        let manual = StartTestBed::new()
            .with(|inputs| inputs.engine_thermal_state = 1.)
            .selector(EngineModeSelector::Ignition)
            .manual_start(true)
            .valve_open(true)
            .n2(22.)
            .master(true)
            .engine_state(EngineState::Starting)
            .and_run();
        assert!(!manual.query(|a| a.sequence.pre_start_motoring_in_progress()));
        assert_eq!(manual.igniters(), Igniters::BOTH);
    }

    #[test]
    fn an_aircraft_without_pre_start_motoring_starts_a_hot_engine_at_once() {
        let test_bed = StartTestBed::new()
            .with_schedule(|schedule| schedule.max_pre_start_motoring_time = Duration::ZERO)
            .with(|inputs| inputs.engine_thermal_state = 1.)
            .automatic_start()
            .core_at_light_up_speed();
        assert!(!test_bed.query(|a| a.sequence.pre_start_motoring_in_progress()));
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn an_unpowered_igniter_gives_no_light_up_and_no_ignition_fault() {
        let mut test_bed = StartTestBed::new()
            .powered_igniters(IGNITER_B)
            .automatic_start()
            .core_at_light_up_speed();
        // the first attempt energizes igniter A, which has no power: no light up
        assert_eq!(test_bed.igniters(), IGNITER_A);
        assert!(test_bed.fuel_is_cut());
        assert!(!test_bed.flag("IGNITER_A_FAULT"));

        test_bed = test_bed.and_run_for(Duration::from_secs(19));
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);

        // the new attempt with both igniters lights up with igniter B
        test_bed = test_bed.and_run_for(Duration::from_secs(30));
        assert_eq!(test_bed.attempt(), 2);
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn the_continuous_ignition_uses_both_igniters_when_igniter_a_has_no_power() {
        let test_bed = StartTestBed::new()
            .in_flight()
            .powered_igniters(IGNITER_B)
            .master(true)
            .engine_state(EngineState::On)
            .n2(80.)
            .selector(EngineModeSelector::Ignition)
            .and_run();
        assert_eq!(test_bed.igniters(), Igniters::BOTH);
    }

    #[test]
    fn without_a_powered_igniter_no_relight_is_available() {
        let mut test_bed = StartTestBed::new().in_flight().and_run();
        assert!(test_bed.ignition_is_available());
        test_bed = test_bed.powered_igniters(IGNITER_A).and_run();
        assert!(test_bed.ignition_is_available());
        test_bed = test_bed.powered_igniters(Igniters::NONE).and_run();
        assert!(!test_bed.ignition_is_available());
    }

    #[test]
    fn without_the_start_commands_the_engine_does_not_start_on_the_ground() {
        let mut test_bed = StartTestBed::new()
            .start_commands_lost(true)
            .automatic_start()
            .core_at_light_up_speed();
        assert_eq!(test_bed.phase(), EngineStartPhase::None);
        assert_eq!(test_bed.valve_command(), StartValveCommand::Closed);
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert!(test_bed.fuel_is_cut());

        // the start commands come back: the next ENG MASTER ON starts the engine
        test_bed = test_bed
            .start_commands_lost(false)
            .master(false)
            .automatic_start();
        assert_eq!(test_bed.phase(), EngineStartPhase::Starting);
        assert_eq!(test_bed.valve_command(), StartValveCommand::Open);
    }

    #[test]
    fn a_start_in_progress_ends_when_the_start_commands_are_lost() {
        let test_bed = StartTestBed::new()
            .automatic_start()
            .n2(18.)
            .and_run()
            .start_commands_lost(true)
            .and_run();
        assert_eq!(test_bed.phase(), EngineStartPhase::None);
        assert_eq!(test_bed.valve_command(), StartValveCommand::Closed);
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert!(test_bed.fuel_is_cut());
    }

    #[test]
    fn without_the_start_commands_there_is_no_relight_in_flight() {
        let test_bed = StartTestBed::new()
            .in_flight()
            .start_commands_lost(true)
            .master(true)
            .engine_state(EngineState::Restarting)
            .n2(10.)
            .and_run();
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert_eq!(test_bed.valve_command(), StartValveCommand::Closed);
        assert!(!test_bed.ignition_is_available());
    }

    #[test]
    fn without_the_start_commands_a_running_engine_keeps_running_and_its_automatic_ignition() {
        let mut test_bed = StartTestBed::new()
            .in_flight()
            .start_commands_lost(true)
            .master(true)
            .engine_state(EngineState::On)
            .n2(80.)
            .selector(EngineModeSelector::Ignition)
            .and_run();
        // the FADEC no longer sees the ENG MODE selector at IGN: no manual continuous ignition
        assert!(!test_bed.fuel_is_cut());
        assert_eq!(test_bed.igniters(), Igniters::NONE);
        assert!(!test_bed.flag("CONTINUOUS_IGNITION"));

        test_bed = test_bed
            .with(|inputs| inputs.automatic_continuous_ignition = true)
            .and_run();
        assert_eq!(test_bed.igniters(), IGNITER_A);
        assert!(test_bed.flag("CONTINUOUS_IGNITION"));

        // on the ground too, the fuel of the running engine is not cut
        test_bed.set_on_ground(true);
        test_bed = test_bed.and_run();
        assert!(!test_bed.fuel_is_cut());
    }

    mod start_valve {
        use super::*;

        struct ValveAircraft {
            supervision: EngineStartValveSupervision,
            fadec_schedule_open: bool,
            is_open: bool,
        }
        impl ValveAircraft {
            fn new(context: &mut InitContext) -> Self {
                Self {
                    supervision: EngineStartValveSupervision::new(context, 1),
                    fadec_schedule_open: false,
                    is_open: false,
                }
            }
        }
        impl Aircraft for ValveAircraft {
            fn update_after_power_distribution(&mut self, context: &UpdateContext) {
                let commanded_open = self.supervision.commanded_open(self.fadec_schedule_open);
                self.is_open = self.supervision.position_open(commanded_open);
                self.supervision
                    .monitor(context.delta(), commanded_open, self.is_open);
            }
        }
        impl SimulationElement for ValveAircraft {
            fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
                self.supervision.accept(visitor);
                visitor.visit(self);
            }
        }

        fn run_for(test_bed: &mut SimulationTestBed<ValveAircraft>, seconds: u64) {
            for _ in 0..seconds * 10 {
                test_bed.run_with_delta(Duration::from_millis(100));
            }
        }

        #[test]
        fn the_valve_follows_the_fadec_schedule_and_the_start_sequence_command() {
            let mut test_bed = SimulationTestBed::new(ValveAircraft::new);
            test_bed.command(|a| a.fadec_schedule_open = true);
            test_bed.run();
            assert!(test_bed.query(|a| a.is_open));

            test_bed.write_by_name("ENGINE_1_START_VALVE_COMMAND", 2.);
            test_bed.run();
            assert!(!test_bed.query(|a| a.is_open));

            test_bed.command(|a| a.fadec_schedule_open = false);
            test_bed.write_by_name("ENGINE_1_START_VALVE_COMMAND", 1.);
            test_bed.run();
            assert!(test_bed.query(|a| a.is_open));
        }

        #[test]
        fn a_valve_stuck_closed_is_detected_when_commanded_open() {
            let mut test_bed = SimulationTestBed::new(ValveAircraft::new);
            test_bed.fail(FailureType::EngineStartValveStuckClosed(1));
            test_bed.command(|a| a.fadec_schedule_open = true);
            run_for(&mut test_bed, 4);
            assert!(!test_bed.query(|a| a.is_open));
            assert_eq!(
                test_bed.query(|a| a.supervision.fault()),
                StartValveFault::None
            );

            run_for(&mut test_bed, 2);
            assert_eq!(
                test_bed.query(|a| a.supervision.fault()),
                StartValveFault::NotOpen
            );
            let written: f64 = test_bed.read_by_name("ENGINE_1_START_VALVE_FAULT");
            assert_eq!(written, 1.);
        }

        #[test]
        fn a_valve_stuck_open_is_detected_when_commanded_closed() {
            let mut test_bed = SimulationTestBed::new(ValveAircraft::new);
            test_bed.fail(FailureType::EngineStartValveStuckOpen(1));
            run_for(&mut test_bed, 6);

            assert!(test_bed.query(|a| a.is_open));
            assert_eq!(
                test_bed.query(|a| a.supervision.fault()),
                StartValveFault::NotClosed
            );
        }

        #[test]
        fn a_healthy_valve_has_no_fault() {
            let mut test_bed = SimulationTestBed::new(ValveAircraft::new);
            test_bed.command(|a| a.fadec_schedule_open = true);
            run_for(&mut test_bed, 10);

            assert_eq!(
                test_bed.query(|a| a.supervision.fault()),
                StartValveFault::None
            );
        }
    }
}
