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
//!   low starter air pressure, thrust lever not at idle, starter time exceeded);
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
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};
use std::time::Duration;
use uom::si::{
    f64::{Ratio, ThermodynamicTemperature},
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
    /// The aircraft conditions for which the FADEC selects the continuous ignition by itself, in
    /// flight and on the ground (e.g. the A320 engine anti-ice valve open).
    pub automatic_continuous_ignition: bool,
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
    valve_open_without_air_time: Duration,
    starter_time: Duration,
    in_flight_no_light_up_time: Duration,
    /// In flight: how long a relight has had starter air while the starter has failed.
    in_flight_starter_fault_time: Duration,
    automatic_crank_time: Duration,
    /// None until the first update.
    previous_on_ground: Option<bool>,

    /// The fault of the current start, kept until the ENG MASTER OFF or a successful start.
    start_fault: EngineStartFault,
    /// The fault of a condition that does not abort the start, while the condition lasts.
    condition_fault: EngineStartFault,
    fault_light: bool,

    /// The FADEC alternates the igniter of the first automatic start attempt on the ground.
    ground_start_uses_igniter_b: bool,
    single_igniter_used: bool,
    continuous_ignition_armed: bool,
    continuous_ignition: bool,
    igniters: Igniters,

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
            phase: EngineStartPhase::None,
            attempt: 0,
            manual_start: false,
            lit: false,
            since_light_up: Duration::ZERO,
            since_ignition: None,
            hung_window_start_speed: Ratio::default(),
            hung_window_time: Duration::ZERO,
            starter_without_rotation_time: Duration::ZERO,
            valve_open_without_air_time: Duration::ZERO,
            starter_time: Duration::ZERO,
            in_flight_no_light_up_time: Duration::ZERO,
            in_flight_starter_fault_time: Duration::ZERO,
            automatic_crank_time: Duration::ZERO,
            previous_on_ground: None,
            start_fault: EngineStartFault::None,
            condition_fault: EngineStartFault::None,
            fault_light: false,
            ground_start_uses_igniter_b: false,
            single_igniter_used: false,
            continuous_ignition_armed: false,
            continuous_ignition: false,
            igniters: Igniters::NONE,
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
        let touched_down = on_ground && self.previous_on_ground == Some(false);
        self.previous_on_ground = Some(on_ground);

        if touched_down && self.start_fault == EngineStartFault::StarterFault {
            // Design choice: the starter fault found in flight ends with the flight; on the ground
            // the start sequence monitors the starter again at the next start.
            self.start_fault = EngineStartFault::None;
        }

        if !on_ground {
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
        } else {
            self.continue_phase(context, schedule, inputs);
        }

        self.update_in_flight_light_up(context, inputs, on_ground);
        self.update_in_flight_starter_fault(context, schedule, inputs, on_ground);
        self.update_condition_faults(context, schedule, inputs, on_ground);
        self.igniters = self.energized_igniters(schedule, inputs, on_ground);
        self.continuous_ignition = self.continuous_ignition_is_on(inputs, on_ground);

        self.fuel_cut = on_ground
            && !inputs.preset_quick_mode
            && match self.phase {
                EngineStartPhase::Starting => !self.lit,
                EngineStartPhase::AutomaticCrank
                | EngineStartPhase::Aborted
                | EngineStartPhase::WetCrank => true,
                EngineStartPhase::None | EngineStartPhase::Motoring => false,
            };

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
        self.start_valve_command = match self.phase {
            EngineStartPhase::None => StartValveCommand::FadecSchedule,
            EngineStartPhase::Motoring
            | EngineStartPhase::Starting
            | EngineStartPhase::WetCrank
            | EngineStartPhase::AutomaticCrank
                if below_start_valve_closing =>
            {
                StartValveCommand::Open
            }
            EngineStartPhase::Motoring
            | EngineStartPhase::Starting
            | EngineStartPhase::WetCrank
            | EngineStartPhase::AutomaticCrank
            | EngineStartPhase::Aborted => StartValveCommand::Closed,
        };

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

    fn begin_attempt(&mut self, attempt: u8) {
        self.attempt = attempt;
        self.lit = false;
        self.since_light_up = Duration::ZERO;
        self.since_ignition = None;
        self.hung_window_time = Duration::ZERO;
        self.starter_without_rotation_time = Duration::ZERO;
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
        let energized = self.ground_start_igniters(schedule, inputs);
        let sparking = self.working(energized);
        if energized.any() {
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
        if !self.lit && sparking.any() && inputs.core_speed >= light_up_n2 {
            self.lit = true;
            self.since_light_up = Duration::ZERO;
            self.hung_window_start_speed = inputs.core_speed;
            self.hung_window_time = Duration::ZERO;
        } else if self.lit {
            self.since_light_up += delta;
        }

        let fault = self.detect_start_fault(delta, schedule, inputs);
        if fault == EngineStartFault::None {
            return;
        }
        self.start_fault = fault;

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
        } else if fault == EngineStartFault::StarterFault {
            // A starter failure aborts the start without further attempt (A380).
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
        } else if fault.aborts_an_automatic_start() {
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
        if Self::is_in_flight_start(inputs, on_ground) {
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
        }

        self.condition_fault =
            if self.in_flight_no_light_up_time >= schedule.in_flight_no_light_up_time {
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
        } else if self.attempt <= 1 {
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

    /// Manual selection: in flight the continuous ignition is on with the ENG MODE selector at
    /// IGN/START and the engine running. On the ground the ignition cuts off by itself after the
    /// start, so the crew sets the selector to NORM then back to IGN/START to turn it on.
    ///
    /// The continuous ignition can also be selected automatically to keep the engine combustion;
    /// the conditions of the automatic selection come from the aircraft ([`EngineStartInputs::automatic_continuous_ignition`]). They need no
    /// NORM then IGN/START on the ground.
    fn continuous_ignition_is_on(&self, inputs: &EngineStartInputs, on_ground: bool) -> bool {
        let manual_selection = inputs.mode_selector == EngineModeSelector::Ignition
            && (!on_ground || self.continuous_ignition_armed);
        inputs.master_switch_is_on
            && !inputs.fire_push_button_is_released
            && inputs.engine_state == EngineState::On
            && (manual_selection || inputs.automatic_continuous_ignition)
    }

    /// The A320 continuous ignition uses one igniter, and both if it has failed (design choice:
    /// igniter A); the A380 continuous ignition uses both igniters.
    fn continuous_ignition_igniters(&self, schedule: &EngineStartSchedule) -> Igniters {
        if schedule.continuous_ignition_uses_both_igniters || self.igniter_a_failure.is_active() {
            Igniters::BOTH
        } else {
            Igniters::single(false)
        }
    }

    fn working(&self, igniters: Igniters) -> Igniters {
        Igniters {
            a: igniters.a && !self.igniter_a_failure.is_active(),
            b: igniters.b && !self.igniter_b_failure.is_active(),
        }
    }

    /// The fuel of the engine is cut by the start sequence (start not lit yet, crank, abort).
    pub fn fuel_is_cut(&self) -> bool {
        self.fuel_cut
    }

    /// At least one igniter works: an in-flight relight can light up.
    pub fn ignition_is_available(&self) -> bool {
        !(self.igniter_a_failure.is_active() && self.igniter_b_failure.is_active())
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

    /// The start fault reported to the warning system.
    pub fn fault(&self) -> EngineStartFault {
        if self.start_fault != EngineStartFault::None {
            self.start_fault
        } else {
            self.condition_fault
        }
    }

    pub fn fault_light_is_on(&self) -> bool {
        self.fault_light
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
        writer.write(&self.fault_light_id, self.fault_light);
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
    use uom::si::thermodynamic_temperature::degree_celsius;

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
            automatic_start_attempts: 3,
            automatic_crank_time: Duration::from_secs(30),
            starter_time_limit: None,
            continuous_ignition_uses_both_igniters: false,
            manual_start_fuel_on_n2: Ratio::new::<percent>(22.),
            stall_or_egt_restart_before_crank: false,
            starter_fault_detected_in_flight: false,
        }
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
                    automatic_continuous_ignition: false,
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
            .with(|inputs| inputs.relight_pending = true)
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
    fn in_flight_the_no_light_up_time_is_the_one_of_the_relight() {
        // An A380 in-flight relight must light up within 30 s, while the ground start of the
        // same aircraft has 20 s
        let mut test_bed = StartTestBed::new()
            .with_schedule(|schedule| {
                schedule.no_light_up_time = Duration::from_secs(20);
                schedule.in_flight_no_light_up_time = Duration::from_secs(30);
            })
            .in_flight()
            .with(|inputs| inputs.relight_pending = true)
            .engine_state(EngineState::Restarting)
            .master(true)
            .and_run_for(Duration::from_secs(29));
        assert_eq!(test_bed.fault(), EngineStartFault::None);

        test_bed = test_bed.and_run_for(Duration::from_secs(2));
        assert_eq!(test_bed.fault(), EngineStartFault::NoLightUp);
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
