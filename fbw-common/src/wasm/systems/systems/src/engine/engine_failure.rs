//! Engine flameout and seizure failures, the crew relight and the fuel cut that stops the engine.
//!
//! An engine stops when its fuel is cut. While [`EngineFailure::fuel_is_cut`] is true the aircraft
//! closes an MSFS fuel valve in series with the engine feed (the valve that the LP fuel valve
//! starvation already uses, see `fuel::engine_lp_valve`), so MSFS stops the combustion, and its
//! FADEC handles the engine as one without fuel. The fuel cut is the LP valve starvation OR a
//! failure OR an in-flight relight that has not lit up.
//!
//! - Flameout failure: when it is activated the flame goes out, and it stays out (latched). The
//!   FADEC does not relight it by itself. The crew relights it with the ENG MASTER OFF then ON
//!   (A320 FCOM PRO-ABN-ENG [QRH] ENG RELIGHT IN FLIGHT) inside the relight envelope of the
//!   aircraft; the engine then runs normally while the failure stays listed. Deactivating then
//!   activating the failure gives a new flameout.
//! - Seizure failure: the core stops. No relight lights up while the failure is active; once it
//!   is cleared the engine can be relit by the same procedure.
//! - In flight, every relight of an engine that is not running (after a flameout, a seizure or a
//!   crew shutdown) obeys the relight envelope: MSFS would relight the engine anywhere as soon as
//!   fuel and the starter are back, so the fuel stays cut until the envelope lets the engine
//!   light up. On the ground a failed engine lights up with starter air (a normal start).
//!
//! The envelope, and the windmilling speeds of an engine without combustion, are aircraft data:
//! each aircraft implements [`EngineRelightEnvelope`] from its own FCOM.

use crate::{
    failures::{Failure, FailureType},
    shared::InternationalStandardAtmosphere,
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};
use std::time::Duration;
use uom::si::{
    f64::{Length, Ratio, Velocity},
    ratio::percent,
};

/// The flight conditions of a relight attempt.
#[derive(Clone, Copy, Debug)]
pub struct RelightConditions {
    pub on_ground: bool,
    pub indicated_airspeed: Velocity,
    pub pressure_altitude: Length,
    /// The ENG MODE selector is at IGN/START: the FADEC runs its automatic start sequence
    /// (start valve, both igniters in flight).
    pub ignition_selected: bool,
    /// Air pressure is available at the starter (APU bleed, cross bleed or ground air).
    pub starter_air_pressurized: bool,
    /// The core speed (N2) of the engine, as the FADEC shows it.
    pub core_speed: Ratio,
    /// How long the ENG MASTER stayed OFF before the MASTER ON of the attempt (quick relight).
    pub master_off_duration: Duration,
}

/// The relight envelope and the windmilling speeds of an aircraft's engine.
pub trait EngineRelightEnvelope {
    /// Whether an engine in these conditions lights up during a relight attempt.
    fn engine_lights_up(&self, conditions: &RelightConditions) -> bool;

    /// The fan speed (N1) of an engine without combustion windmilling at this airspeed and
    /// pressure altitude.
    fn windmill_n1(&self, indicated_airspeed: Velocity, pressure_altitude: Length) -> Ratio;

    /// The core speed (N2) of an engine without combustion windmilling at this airspeed and
    /// pressure altitude.
    fn windmill_n2(&self, indicated_airspeed: Velocity, pressure_altitude: Length) -> Ratio;
}

/// What the aircraft knows about one engine, read from its own variables.
#[derive(Clone, Copy, Debug)]
pub struct EngineFailureInputs {
    pub master_switch_is_on: bool,
    pub ignition_selected: bool,
    pub starter_air_pressurized: bool,
    /// The FADEC reports the engine running (ENGINE_STATE On).
    pub engine_is_running: bool,
    pub core_speed: Ratio,
    /// The LP fuel valve is closed and the fuel downstream of it is burned.
    pub lp_valve_starved: bool,
    /// The start sequence on the ground keeps the fuel off: start not lit yet, crank, abort (see
    /// `engine_start`).
    pub start_sequence_fuel_cut: bool,
    /// At least one igniter works: without, no relight lights up (ignition failures, see
    /// `engine_start`).
    pub ignition_available: bool,
}

pub struct EngineFailure {
    flameout: Failure,
    seizure: Failure,

    fuel_cut_id: VariableIdentifier,
    flamed_out_id: VariableIdentifier,
    seized_id: VariableIdentifier,
    windmill_n1_id: VariableIdentifier,
    windmill_n2_id: VariableIdentifier,
    relight_ignition_id: VariableIdentifier,

    /// None until the first update, so that a flight loaded with the master ON is no transition.
    previous_master_switch_is_on: Option<bool>,
    /// How long the ENG MASTER has been OFF, or stayed OFF before its last MASTER ON.
    master_off_duration: Duration,
    flameout_was_active: bool,
    /// The engine has no flame and its fuel stays cut until a relight lights it up.
    flamed_out: bool,
    /// The time since the ENG MASTER was set ON for a relight, while the attempt lasts.
    relight_attempt_time: Option<Duration>,
    fuel_cut: bool,
    relight_ignition: bool,
    windmill_n1: Ratio,
    windmill_n2: Ratio,
}
impl EngineFailure {
    /// A320 FCOM PRO-ABN-ENG [QRH] ENG RELIGHT IN FLIGHT (a320_fcom.txt l.78293): "Engine light up
    /// should be achieved within 30 s after fuel flow increases". An attempt that has not lit up within
    /// 30 s of the MASTER ON has failed: the crew sets the MASTER OFF and tries again (design
    /// choice: the attempt window starts at the MASTER ON).
    const RELIGHT_ATTEMPT_DURATION: Duration = Duration::from_secs(30);

    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            flameout: Failure::new(FailureType::EngineFlameout(engine_number)),
            seizure: Failure::new(FailureType::EngineSeizure(engine_number)),
            fuel_cut_id: context.get_identifier(format!("ENGINE_{}_FUEL_CUT", engine_number)),
            flamed_out_id: context.get_identifier(format!("ENGINE_{}_FLAMED_OUT", engine_number)),
            seized_id: context.get_identifier(format!("ENGINE_{}_SEIZED", engine_number)),
            windmill_n1_id: context.get_identifier(format!("ENGINE_{}_WINDMILL_N1", engine_number)),
            windmill_n2_id: context.get_identifier(format!("ENGINE_{}_WINDMILL_N2", engine_number)),
            relight_ignition_id: context
                .get_identifier(format!("ENGINE_{}_RELIGHT_IGNITION", engine_number)),
            previous_master_switch_is_on: None,
            master_off_duration: Duration::ZERO,
            flameout_was_active: false,
            flamed_out: false,
            relight_attempt_time: None,
            fuel_cut: false,
            relight_ignition: false,
            windmill_n1: Ratio::default(),
            windmill_n2: Ratio::default(),
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        envelope: &impl EngineRelightEnvelope,
        inputs: EngineFailureInputs,
    ) {
        let on_ground = context.is_on_ground();
        let seized = self.seizure.is_active();
        // The pressure altitude is the ISA altitude of the static pressure.
        let pressure_altitude =
            InternationalStandardAtmosphere::altitude_from_pressure(context.ambient_pressure());

        // The flameout latches on the activation of the failure; the seizure holds while active.
        let flameout_is_active = self.flameout.is_active();
        if (flameout_is_active && !self.flameout_was_active) || seized {
            self.flamed_out = true;
            self.relight_attempt_time = None;
        }
        self.flameout_was_active = flameout_is_active;

        let master_switch_turned_on =
            inputs.master_switch_is_on && self.previous_master_switch_is_on == Some(false);
        if !inputs.master_switch_is_on {
            if self.previous_master_switch_is_on != Some(false) {
                self.master_off_duration = Duration::ZERO;
            }
            self.master_off_duration += context.delta();
        }
        self.previous_master_switch_is_on = Some(inputs.master_switch_is_on);

        if master_switch_turned_on {
            // In flight the MASTER ON of an engine that is not running is a relight, which the
            // envelope governs as much as the relight of a failed engine.
            if !on_ground && !inputs.engine_is_running {
                self.flamed_out = true;
            }
            if self.flamed_out && !seized {
                self.relight_attempt_time = Some(Duration::ZERO);
            }
        }
        if !inputs.master_switch_is_on {
            self.relight_attempt_time = None;
        }

        if let Some(attempt_time) = self.relight_attempt_time {
            let conditions = RelightConditions {
                on_ground,
                indicated_airspeed: context.indicated_airspeed(),
                pressure_altitude,
                ignition_selected: inputs.ignition_selected,
                starter_air_pressurized: inputs.starter_air_pressurized,
                core_speed: inputs.core_speed,
                master_off_duration: self.master_off_duration,
            };
            if inputs.ignition_available && envelope.engine_lights_up(&conditions) {
                self.flamed_out = false;
                self.relight_attempt_time = None;
            } else {
                let attempt_time = attempt_time + context.delta();
                self.relight_attempt_time = if attempt_time < Self::RELIGHT_ATTEMPT_DURATION {
                    Some(attempt_time)
                } else {
                    None
                };
            }
        }

        self.fuel_cut =
            inputs.lp_valve_starved || seized || self.flamed_out || inputs.start_sequence_fuel_cut;

        // An in-flight relight that lights up (fuel no longer cut, master ON, engine not running yet)
        // has its igniters supplied whatever the ENG MODE selector position. A320 FCOM DSC-70-80-30
        // (a320_fcom.txt l.63481): "In case of start attempt in flight, when the ENG MASTER sw is
        // ON, both igniters are supplied"; the windmilling quick relight works "regardless of the
        // rotary selector position" (l.63538-63541).
        self.relight_ignition =
            !on_ground && inputs.master_switch_is_on && !self.fuel_cut && !inputs.engine_is_running;

        // A windmilling engine turns with the airflow; on the ground it does not.
        let airspeed = if on_ground {
            Velocity::default()
        } else {
            context.indicated_airspeed()
        };
        self.windmill_n1 = envelope.windmill_n1(airspeed, pressure_altitude);
        self.windmill_n2 = envelope.windmill_n2(airspeed, pressure_altitude);
    }

    /// The engine fuel is cut: the engine must not burn.
    pub fn fuel_is_cut(&self) -> bool {
        self.fuel_cut
    }

    /// The engine has no flame and waits for a relight.
    pub fn is_flamed_out(&self) -> bool {
        self.flamed_out
    }

    /// The core is seized: no relight lights up.
    pub fn is_seized(&self) -> bool {
        self.seizure.is_active()
    }

    /// A relight attempt is in progress (MASTER ON, not lit up yet, within its 30 s).
    /// An in-flight relight is lighting up: the igniters are supplied at any ENG MODE position.
    pub fn relight_ignition(&self) -> bool {
        self.relight_ignition
    }

    pub fn relight_attempt_in_progress(&self) -> bool {
        self.relight_attempt_time.is_some()
    }
}
impl SimulationElement for EngineFailure {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.flameout.accept(visitor);
        self.seizure.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.fuel_cut_id, self.fuel_cut);
        writer.write(&self.flamed_out_id, self.flamed_out);
        writer.write(&self.seized_id, self.is_seized());
        writer.write(&self.windmill_n1_id, self.windmill_n1.get::<percent>());
        writer.write(&self.windmill_n2_id, self.windmill_n2.get::<percent>());
        writer.write(&self.relight_ignition_id, self.relight_ignition);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed},
        Aircraft,
    };
    use uom::si::{length::foot, velocity::knot};

    /// A test envelope: lights up above 250 kt below 20 000 ft with ignition, or with starter
    /// air at any speed below 20 000 ft, or anywhere after a MASTER OFF of less than 10 s with N2
    /// above 50 % (a quick relight); the windmill N2 is 4 % per 100 kt.
    struct TestEnvelope;
    impl EngineRelightEnvelope for TestEnvelope {
        fn engine_lights_up(&self, conditions: &RelightConditions) -> bool {
            if conditions.on_ground {
                return conditions.starter_air_pressurized;
            }
            let quick_relight = conditions.master_off_duration < Duration::from_secs(10)
                && conditions.core_speed.get::<percent>() > 50.;
            let below_ceiling = conditions.pressure_altitude.get::<foot>() <= 20_000.;
            quick_relight
                || below_ceiling
                    && ((conditions.ignition_selected
                        && conditions.indicated_airspeed.get::<knot>() >= 250.)
                        || conditions.starter_air_pressurized)
        }

        fn windmill_n1(&self, indicated_airspeed: Velocity, _: Length) -> Ratio {
            Ratio::new::<percent>(6. * indicated_airspeed.get::<knot>() / 100.)
        }

        fn windmill_n2(&self, indicated_airspeed: Velocity, _: Length) -> Ratio {
            Ratio::new::<percent>(4. * indicated_airspeed.get::<knot>() / 100.)
        }
    }

    struct TestAircraft {
        engine_failure: EngineFailure,
        inputs: EngineFailureInputs,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                engine_failure: EngineFailure::new(context, 1),
                inputs: EngineFailureInputs {
                    master_switch_is_on: true,
                    ignition_selected: false,
                    starter_air_pressurized: false,
                    engine_is_running: true,
                    core_speed: Ratio::new::<percent>(80.),
                    lp_valve_starved: false,
                    start_sequence_fuel_cut: false,
                    ignition_available: true,
                },
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.engine_failure
                .update(context, &TestEnvelope, self.inputs);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.engine_failure.accept(visitor);
            visitor.visit(self);
        }
    }

    struct EngineFailureTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl EngineFailureTestBed {
        /// In flight at 300 kt and FL 100, engine 1 running with its master ON.
        fn new() -> Self {
            Self::not_run_yet().and_run()
        }

        /// As new(), before the first frame of the flight.
        fn not_run_yet() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            test_bed.set_on_ground(false);
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(300.));
            test_bed.set_pressure_altitude(Length::new::<foot>(10_000.));
            test_bed
        }

        fn with(mut self, change: impl FnOnce(&mut EngineFailureInputs)) -> Self {
            self.command(|a: &mut TestAircraft| change(&mut a.inputs));
            self
        }

        fn and_run(mut self) -> Self {
            self.run_with_delta(Duration::from_millis(50));
            self
        }

        fn and_run_for(mut self, duration: Duration) -> Self {
            let step = Duration::from_millis(50);
            let mut elapsed = Duration::ZERO;
            while elapsed < duration {
                self.run_with_delta(step);
                elapsed += step;
            }
            self
        }

        /// The engine stops: the FADEC reports it not running and its N2 windmills.
        fn engine_stops(self) -> Self {
            self.with(|inputs| {
                inputs.engine_is_running = false;
                inputs.core_speed = Ratio::new::<percent>(10.);
            })
        }

        fn master_off_then_on(self) -> Self {
            self.with(|inputs| inputs.master_switch_is_on = false)
                .and_run()
                .with(|inputs| inputs.master_switch_is_on = true)
                .and_run()
        }

        fn airspeed_knots(mut self, knots: f64) -> Self {
            self.set_indicated_airspeed(Velocity::new::<knot>(knots));
            self
        }

        fn altitude_feet(mut self, feet: f64) -> Self {
            self.set_pressure_altitude(Length::new::<foot>(feet));
            self
        }

        fn fuel_is_cut(&mut self) -> bool {
            self.read_by_name("ENGINE_1_FUEL_CUT")
        }

        fn flamed_out(&mut self) -> bool {
            self.read_by_name("ENGINE_1_FLAMED_OUT")
        }

        fn seized(&mut self) -> bool {
            self.read_by_name("ENGINE_1_SEIZED")
        }

        fn windmill_n2(&mut self) -> f64 {
            self.read_by_name("ENGINE_1_WINDMILL_N2")
        }

        fn relight_ignition(&mut self) -> bool {
            self.read_by_name("ENGINE_1_RELIGHT_IGNITION")
        }
    }
    impl TestBed for EngineFailureTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    fn flamed_out_engine() -> EngineFailureTestBed {
        let mut test_bed = EngineFailureTestBed::new();
        test_bed.fail(FailureType::EngineFlameout(1));
        test_bed.and_run().engine_stops().and_run()
    }

    #[test]
    fn a_running_engine_has_its_fuel() {
        let mut test_bed = EngineFailureTestBed::new().and_run();

        assert!(!test_bed.fuel_is_cut());
        assert!(!test_bed.flamed_out());
    }

    #[test]
    fn a_flameout_cuts_the_fuel_and_latches() {
        let mut test_bed = flamed_out_engine();
        assert!(test_bed.fuel_is_cut());
        assert!(test_bed.flamed_out());

        // The FADEC does not relight it: the fuel stays cut with the master ON.
        test_bed = test_bed.and_run_for(Duration::from_secs(120));
        assert!(test_bed.fuel_is_cut());
    }

    #[test]
    fn a_relight_inside_the_envelope_lights_up_the_engine() {
        let mut test_bed = flamed_out_engine()
            .with(|inputs| inputs.ignition_selected = true)
            .master_off_then_on();

        assert!(!test_bed.fuel_is_cut());
        assert!(!test_bed.flamed_out());
    }

    #[test]
    fn no_relight_lights_up_without_a_working_igniter() {
        let mut test_bed = flamed_out_engine()
            .with(|inputs| {
                inputs.ignition_selected = true;
                inputs.ignition_available = false;
            })
            .master_off_then_on()
            .and_run_for(Duration::from_secs(5));

        assert!(test_bed.fuel_is_cut());
        assert!(test_bed.flamed_out());
    }

    #[test]
    fn the_start_sequence_cuts_the_fuel_of_a_running_engine() {
        let mut test_bed = EngineFailureTestBed::new()
            .with(|inputs| inputs.start_sequence_fuel_cut = true)
            .and_run();

        assert!(test_bed.fuel_is_cut());
        assert!(!test_bed.flamed_out());
    }

    #[test]
    fn the_flameout_stays_relit_while_the_failure_stays_active() {
        let mut test_bed = flamed_out_engine()
            .with(|inputs| inputs.ignition_selected = true)
            .master_off_then_on()
            .with(|inputs| {
                inputs.engine_is_running = true;
                inputs.core_speed = Ratio::new::<percent>(80.);
            })
            .and_run_for(Duration::from_secs(60));

        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn a_new_activation_of_the_flameout_gives_a_new_flameout() {
        let mut test_bed = flamed_out_engine()
            .with(|inputs| inputs.ignition_selected = true)
            .master_off_then_on()
            .with(|inputs| inputs.engine_is_running = true)
            .and_run();
        test_bed.unfail(FailureType::EngineFlameout(1));
        test_bed = test_bed.and_run();
        assert!(!test_bed.fuel_is_cut());

        test_bed.fail(FailureType::EngineFlameout(1));
        test_bed = test_bed.and_run();
        assert!(test_bed.fuel_is_cut());
    }

    #[test]
    fn a_relight_outside_the_envelope_does_not_light_up() {
        let mut test_bed = flamed_out_engine()
            .altitude_feet(35_000.)
            .with(|inputs| inputs.ignition_selected = true)
            .master_off_then_on()
            .and_run_for(Duration::from_secs(5));

        assert!(test_bed.fuel_is_cut());
        assert!(test_bed.flamed_out());
    }

    #[test]
    fn entering_the_envelope_within_30_s_of_the_master_on_lights_up() {
        let mut test_bed = flamed_out_engine()
            .airspeed_knots(200.)
            .with(|inputs| inputs.ignition_selected = true)
            .master_off_then_on()
            .and_run_for(Duration::from_secs(10))
            // the start valve opens: starter air
            .with(|inputs| inputs.starter_air_pressurized = true)
            .and_run();

        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn an_attempt_that_has_not_lit_up_within_30_s_has_failed() {
        let mut test_bed = flamed_out_engine()
            .airspeed_knots(200.)
            .with(|inputs| inputs.ignition_selected = true)
            .master_off_then_on()
            .and_run_for(Duration::from_secs(31))
            .with(|inputs| inputs.starter_air_pressurized = true)
            .and_run();
        assert!(test_bed.fuel_is_cut());

        // A new attempt (MASTER OFF then ON) lights up.
        test_bed = test_bed.master_off_then_on();
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn the_quick_relight_knows_how_long_the_master_stayed_off() {
        let quick_cycle = |seconds_off: u64| {
            let mut test_bed = EngineFailureTestBed::new().altitude_feet(35_000.);
            test_bed.fail(FailureType::EngineFlameout(1));
            test_bed = test_bed
                .and_run()
                .with(|inputs| {
                    inputs.engine_is_running = false;
                    inputs.core_speed = Ratio::new::<percent>(60.);
                    inputs.master_switch_is_on = false;
                })
                .and_run_for(Duration::from_secs(seconds_off))
                .with(|inputs| inputs.master_switch_is_on = true)
                .and_run();
            test_bed.fuel_is_cut()
        };

        assert!(!quick_cycle(2));
        assert!(quick_cycle(15));
    }

    #[test]
    fn a_quick_relight_with_the_selector_at_norm_gets_its_ignition_until_the_engine_runs() {
        let mut test_bed = EngineFailureTestBed::new().altitude_feet(35_000.);
        test_bed.fail(FailureType::EngineFlameout(1));
        test_bed = test_bed
            .and_run()
            .with(|inputs| {
                inputs.engine_is_running = false;
                inputs.core_speed = Ratio::new::<percent>(60.);
                inputs.ignition_selected = false;
            })
            .and_run();
        // flamed out: no ignition while the fuel is cut
        assert!(!test_bed.relight_ignition());

        test_bed = test_bed
            .with(|inputs| inputs.master_switch_is_on = false)
            .and_run_for(Duration::from_secs(2))
            .with(|inputs| inputs.master_switch_is_on = true)
            .and_run();
        assert!(!test_bed.fuel_is_cut());
        assert!(test_bed.relight_ignition());

        // the engine runs: back to the selector
        test_bed = test_bed
            .with(|inputs| inputs.engine_is_running = true)
            .and_run();
        assert!(!test_bed.relight_ignition());
    }

    #[test]
    fn no_relight_ignition_on_the_ground_nor_with_the_master_off() {
        let mut test_bed = EngineFailureTestBed::new()
            .engine_stops()
            .with(|inputs| inputs.master_switch_is_on = false)
            .and_run();
        assert!(!test_bed.relight_ignition());

        test_bed.set_on_ground(true);
        test_bed = test_bed
            .with(|inputs| inputs.master_switch_is_on = true)
            .and_run();
        assert!(!test_bed.relight_ignition());
    }

    #[test]
    fn a_relight_needs_the_master_off_then_on() {
        // Inside the envelope with ignition, but without the MASTER cycle.
        let mut test_bed = flamed_out_engine()
            .with(|inputs| inputs.ignition_selected = true)
            .and_run_for(Duration::from_secs(10));

        assert!(test_bed.fuel_is_cut());
    }

    #[test]
    fn a_seized_engine_never_relights() {
        let mut test_bed = EngineFailureTestBed::new();
        test_bed.fail(FailureType::EngineSeizure(1));
        test_bed = test_bed
            .and_run()
            .engine_stops()
            .with(|inputs| {
                inputs.ignition_selected = true;
                inputs.starter_air_pressurized = true;
            })
            .master_off_then_on()
            .and_run_for(Duration::from_secs(5));

        assert!(test_bed.fuel_is_cut());
        assert!(test_bed.seized());
    }

    #[test]
    fn a_cleared_seizure_can_be_relit() {
        let mut test_bed = EngineFailureTestBed::new();
        test_bed.fail(FailureType::EngineSeizure(1));
        test_bed = test_bed.and_run().engine_stops().and_run();
        test_bed.unfail(FailureType::EngineSeizure(1));
        test_bed = test_bed.and_run();
        // still out: it needs a relight
        assert!(test_bed.fuel_is_cut());
        assert!(!test_bed.seized());

        test_bed = test_bed
            .with(|inputs| inputs.ignition_selected = true)
            .master_off_then_on();
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn the_lp_valve_starvation_cuts_the_fuel() {
        let mut test_bed = EngineFailureTestBed::new()
            .with(|inputs| inputs.lp_valve_starved = true)
            .and_run();

        assert!(test_bed.fuel_is_cut());
        assert!(!test_bed.flamed_out());
    }

    #[test]
    fn an_in_flight_restart_after_a_crew_shutdown_obeys_the_envelope() {
        let mut test_bed = EngineFailureTestBed::new()
            .altitude_feet(35_000.)
            .with(|inputs| inputs.master_switch_is_on = false)
            .and_run()
            .engine_stops()
            .and_run()
            .with(|inputs| {
                inputs.ignition_selected = true;
                inputs.master_switch_is_on = true;
            })
            .and_run();
        assert!(test_bed.fuel_is_cut());

        test_bed = test_bed.altitude_feet(10_000.).master_off_then_on();
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn a_ground_start_is_not_governed_by_the_envelope() {
        let mut test_bed = EngineFailureTestBed::new();
        test_bed.set_on_ground(true);
        test_bed.set_indicated_airspeed(Velocity::default());
        test_bed = test_bed
            .with(|inputs| inputs.master_switch_is_on = false)
            .and_run()
            .engine_stops()
            .with(|inputs| inputs.master_switch_is_on = true)
            .and_run();

        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn a_flamed_out_engine_on_the_ground_lights_up_with_starter_air() {
        let mut test_bed = EngineFailureTestBed::new();
        test_bed.set_on_ground(true);
        test_bed.fail(FailureType::EngineFlameout(1));
        test_bed = test_bed.and_run().engine_stops().master_off_then_on();
        assert!(test_bed.fuel_is_cut());

        test_bed = test_bed
            .with(|inputs| inputs.starter_air_pressurized = true)
            .and_run();
        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn a_flight_loaded_with_the_master_on_is_no_relight() {
        // The FADEC has not reported the engine running yet on the first frames of a flight.
        let mut test_bed = EngineFailureTestBed::not_run_yet()
            .with(|inputs| inputs.engine_is_running = false)
            .and_run()
            .and_run();

        assert!(!test_bed.fuel_is_cut());
    }

    #[test]
    fn the_windmill_speed_follows_the_airspeed_in_flight_only() {
        let mut test_bed = EngineFailureTestBed::new().airspeed_knots(250.).and_run();
        assert!((test_bed.windmill_n2() - 10.).abs() < 1e-6);

        test_bed.set_on_ground(true);
        test_bed = test_bed.and_run();
        assert!(test_bed.windmill_n2().abs() < 1e-6);
    }
}
