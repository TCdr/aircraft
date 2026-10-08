//! Engine compressor stall, EGT overtemperature, overspeed and high vibration failures.
//!
//! Unlike a flameout or a seizure (see `engine_failure`), these failures keep the engine running.
//! This module computes their effect on the engine and writes it as variables that the FADEC and
//! the flight controls computer of the aircraft apply:
//! - `ENGINE_n_STALL`: the FADEC detects a stall of engine n (the ENG STALL alert).
//! - `ENGINE_n_STALL_N1_LOSS`: the N1 that the stalled engine loses. The thrust control loop of
//!   the flight controls computer aims that much lower, so the MSFS engine gives less thrust.
//! - `ENGINE_n_EGT_OFFSET`: degrees Celsius added to the EGT that the FADEC computes.
//! - `ENGINE_n_N1_OFFSET` and `ENGINE_n_<core>_OFFSET`: percent added to the N1 and core speed
//!   indications of the FADEC (the core is N2 on the A320, N3 on the A380).
//! - `ENGINE_n_N1_VIBRATION` and `ENGINE_n_<core>_VIBRATION`: the rotor vibrations, in units,
//!   shown on the ENGINE SD page.
//!
//! What each failure does is a design choice: the FCOM describes the symptoms (A320 FCOM
//! PRO-ABN-ENG ENG 1(2) STALL, a320_fcom.txt l.81322-81326: "fluctuating performance parameters,
//! vibration, sluggish or no thrust lever response, high EGT and/or a rapid EGT rise when thrust
//! lever is advanced"; A380 FCOM PRO-ABN-ECAM-10-70 ENG STALL, a380_fcom.txt l.172810-172816) but
//! no values. Each aircraft gives its own values in [`EngineMalfunctionParameters`].
//! - Compressor stall: the engine stalls while the FADEC N1 command is at or above a stall
//!   threshold, and recovers when the command goes below it (the crew sets the thrust lever to
//!   IDLE): the QRH procedure "Reduce thrust and operate below the thrust threshold where stall
//!   recurs" (a320_fcom.txt l.78864). The stalled engine loses N1 (thrust), its EGT rises,
//!   its N1 and core speed fluctuate and its N1 vibrates.
//! - EGT overtemperature: the EGT is higher by an amount proportional to the N1, so that reducing
//!   the thrust reduces the EGT (ENG N1/N2/EGT OVER LIMIT: "THR LEVER ... BELOW LIMIT").
//! - Overspeed: the N1 and core speed indications are higher by a fraction of their value, so that
//!   they exceed their limits at high thrust only. The thrust follows the MSFS engine and does
//!   not change.
//! - High vibration: the N1 and core vibrations are higher by an amount proportional to the
//!   rotor speed, so that reducing the thrust brings them below the advisory (QRH HIGH ENGINE
//!   VIBRATION, a320_fcom.txt l.78975: "THRUST (affected engine) ... REDUCE BELOW ADVISORY
//!   THRESHOLD").
//!
//! The values change gradually (first order lags) so that the indications move like engine
//! parameters do, not in steps.

use crate::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};
use std::f64::consts::PI;
use uom::si::{f64::Ratio, ratio::percent};

/// The effect of the failures on one engine type. All values are design choices of the aircraft.
#[derive(Clone, Copy, Debug)]
pub struct EngineMalfunctionParameters {
    /// The name of the core speed in the variable names: "N2" (A320) or "N3" (A380).
    pub core_speed_name: &'static str,
    /// A stall occurs while the FADEC N1 command is at or above this N1.
    pub stall_threshold_n1_percent: f64,
    /// The stall ends when the N1 command goes this far below the threshold.
    pub stall_threshold_hysteresis_percent: f64,
    /// The N1 (thrust) that a fully developed stall loses.
    pub stall_n1_loss_percent: f64,
    /// The EGT rise of a fully developed stall.
    pub stall_egt_rise_degrees_celsius: f64,
    /// The amplitudes of the N1 and core speed fluctuations of a fully developed stall.
    pub stall_n1_fluctuation_percent: f64,
    pub stall_core_fluctuation_percent: f64,
    /// The N1 vibration added by a fully developed stall.
    pub stall_n1_vibration_units: f64,
    /// The EGT rise of the overtemperature failure at 100 % N1, proportional to the N1.
    pub overtemperature_egt_rise_at_full_n1_degrees_celsius: f64,
    /// The fractions of the N1 and of the core speed that the overspeed failure adds to them.
    pub overspeed_n1_fraction: f64,
    pub overspeed_core_fraction: f64,
    /// The vibrations added by the high vibration failure at 100 % N1 (core speed), proportional
    /// to the rotor speed.
    pub high_vibration_n1_units_at_full_speed: f64,
    pub high_vibration_core_units_at_full_speed: f64,
    /// The normal core vibration as a fraction of the MSFS engine vibration, which is the normal
    /// N1 vibration (MSFS has one vibration value per engine).
    pub normal_core_to_n1_vibration_ratio: f64,
}

/// What the aircraft knows about one engine, read from its own variables.
#[derive(Clone, Copy, Debug, Default)]
pub struct EngineMalfunctionInputs {
    /// The FADEC reports the engine running (ENGINE_STATE On).
    pub engine_is_running: bool,
    /// The N1 and core speed of the MSFS engine, without the offsets of this module.
    pub n1: Ratio,
    pub core_speed: Ratio,
    /// The N1 that the FADEC commands (thrust lever or A/THR).
    pub commanded_n1: Ratio,
    /// The vibration of the MSFS engine (TURB ENG VIBRATION).
    pub msfs_vibration: f64,
}

/// A first order lag: the value moves towards its target with the given time constant.
fn first_order_lag(value: f64, target: f64, time_constant_seconds: f64, delta_seconds: f64) -> f64 {
    value + (target - value) * (1. - (-delta_seconds / time_constant_seconds).exp())
}

pub struct EngineMalfunction {
    parameters: EngineMalfunctionParameters,

    compressor_stall: Failure,
    egt_overtemperature: Failure,
    overspeed: Failure,
    high_vibration: Failure,

    stall_id: VariableIdentifier,
    stall_n1_loss_id: VariableIdentifier,
    egt_offset_id: VariableIdentifier,
    n1_offset_id: VariableIdentifier,
    core_offset_id: VariableIdentifier,
    n1_vibration_id: VariableIdentifier,
    core_vibration_id: VariableIdentifier,

    /// The FADEC detects a stall.
    stalled: bool,
    /// 0 without stall, 1 for a fully developed stall.
    stall_intensity: f64,
    /// The time base of the stall fluctuations.
    stall_time_seconds: f64,
    overtemperature_egt_rise: f64,
    overspeed_n1_percent: f64,
    overspeed_core_percent: f64,
    high_vibration_n1_units: f64,
    high_vibration_core_units: f64,

    egt_offset: f64,
    n1_offset: f64,
    core_offset: f64,
    n1_vibration: f64,
    core_vibration: f64,
}
impl EngineMalfunction {
    /// Design choice: a stall develops in about 1 s (time constant) and the engine recovers in
    /// about 3 s once the thrust is below the stall threshold.
    const STALL_ONSET_TIME_CONSTANT_SECONDS: f64 = 1.;
    const STALL_RECOVERY_TIME_CONSTANT_SECONDS: f64 = 3.;
    /// Design choice: the overtemperature, overspeed and vibration build up and go away in about
    /// 5 s (time constant), like a slowly drifting parameter.
    const DRIFT_TIME_CONSTANT_SECONDS: f64 = 5.;
    /// Design choice: the stall fluctuations are two sine waves of 0.9 Hz and 0.37 Hz, so that
    /// they do not look periodic.
    const STALL_FLUCTUATION_FAST_HZ: f64 = 0.9;
    const STALL_FLUCTUATION_SLOW_HZ: f64 = 0.37;

    pub fn new(
        context: &mut InitContext,
        engine_number: usize,
        parameters: EngineMalfunctionParameters,
    ) -> Self {
        let core = parameters.core_speed_name;
        Self {
            parameters,
            compressor_stall: Failure::new(FailureType::EngineCompressorStall(engine_number)),
            egt_overtemperature: Failure::new(FailureType::EngineEgtOvertemperature(engine_number)),
            overspeed: Failure::new(FailureType::EngineOverspeed(engine_number)),
            high_vibration: Failure::new(FailureType::EngineHighVibration(engine_number)),
            stall_id: context.get_identifier(format!("ENGINE_{}_STALL", engine_number)),
            stall_n1_loss_id: context
                .get_identifier(format!("ENGINE_{}_STALL_N1_LOSS", engine_number)),
            egt_offset_id: context.get_identifier(format!("ENGINE_{}_EGT_OFFSET", engine_number)),
            n1_offset_id: context.get_identifier(format!("ENGINE_{}_N1_OFFSET", engine_number)),
            core_offset_id: context
                .get_identifier(format!("ENGINE_{}_{}_OFFSET", engine_number, core)),
            n1_vibration_id: context
                .get_identifier(format!("ENGINE_{}_N1_VIBRATION", engine_number)),
            core_vibration_id: context
                .get_identifier(format!("ENGINE_{}_{}_VIBRATION", engine_number, core)),
            stalled: false,
            stall_intensity: 0.,
            stall_time_seconds: 0.,
            overtemperature_egt_rise: 0.,
            overspeed_n1_percent: 0.,
            overspeed_core_percent: 0.,
            high_vibration_n1_units: 0.,
            high_vibration_core_units: 0.,
            egt_offset: 0.,
            n1_offset: 0.,
            core_offset: 0.,
            n1_vibration: 0.,
            core_vibration: 0.,
        }
    }

    pub fn update(&mut self, context: &UpdateContext, inputs: EngineMalfunctionInputs) {
        let delta = context.delta_as_secs_f64();
        let parameters = self.parameters;
        let n1_percent = inputs.n1.get::<percent>().max(0.);
        let core_percent = inputs.core_speed.get::<percent>().max(0.);

        self.update_stall(inputs, delta);

        let running = inputs.engine_is_running;
        let overtemperature_target = if running && self.egt_overtemperature.is_active() {
            parameters.overtemperature_egt_rise_at_full_n1_degrees_celsius * n1_percent / 100.
        } else {
            0.
        };
        let (overspeed_n1_target, overspeed_core_target) = if running && self.overspeed.is_active()
        {
            (
                parameters.overspeed_n1_fraction * n1_percent,
                parameters.overspeed_core_fraction * core_percent,
            )
        } else {
            (0., 0.)
        };
        // A damaged engine vibrates whenever its rotors turn, also when windmilling.
        let (vibration_n1_target, vibration_core_target) = if self.high_vibration.is_active() {
            (
                parameters.high_vibration_n1_units_at_full_speed * n1_percent / 100.,
                parameters.high_vibration_core_units_at_full_speed * core_percent / 100.,
            )
        } else {
            (0., 0.)
        };
        let tau = Self::DRIFT_TIME_CONSTANT_SECONDS;
        self.overtemperature_egt_rise = first_order_lag(
            self.overtemperature_egt_rise,
            overtemperature_target,
            tau,
            delta,
        );
        self.overspeed_n1_percent =
            first_order_lag(self.overspeed_n1_percent, overspeed_n1_target, tau, delta);
        self.overspeed_core_percent = first_order_lag(
            self.overspeed_core_percent,
            overspeed_core_target,
            tau,
            delta,
        );
        self.high_vibration_n1_units = first_order_lag(
            self.high_vibration_n1_units,
            vibration_n1_target,
            tau,
            delta,
        );
        self.high_vibration_core_units = first_order_lag(
            self.high_vibration_core_units,
            vibration_core_target,
            tau,
            delta,
        );

        let (n1_fluctuation, core_fluctuation) = self.stall_fluctuations();
        self.egt_offset = self.stall_intensity * parameters.stall_egt_rise_degrees_celsius
            + self.overtemperature_egt_rise;
        self.n1_offset = n1_fluctuation + self.overspeed_n1_percent;
        self.core_offset = core_fluctuation + self.overspeed_core_percent;

        let normal_vibration = inputs.msfs_vibration.max(0.);
        self.n1_vibration = normal_vibration
            + self.high_vibration_n1_units
            + self.stall_intensity * parameters.stall_n1_vibration_units;
        self.core_vibration = normal_vibration * parameters.normal_core_to_n1_vibration_ratio
            + self.high_vibration_core_units;
    }

    fn update_stall(&mut self, inputs: EngineMalfunctionInputs, delta: f64) {
        let parameters = self.parameters;
        let commanded_n1_percent = inputs.commanded_n1.get::<percent>();
        let stall_end_n1_percent =
            parameters.stall_threshold_n1_percent - parameters.stall_threshold_hysteresis_percent;

        self.stalled = if !self.compressor_stall.is_active() || !inputs.engine_is_running {
            false
        } else if self.stalled {
            commanded_n1_percent >= stall_end_n1_percent
        } else {
            commanded_n1_percent >= parameters.stall_threshold_n1_percent
        };

        let (target, time_constant) = if self.stalled {
            (1., Self::STALL_ONSET_TIME_CONSTANT_SECONDS)
        } else {
            (0., Self::STALL_RECOVERY_TIME_CONSTANT_SECONDS)
        };
        self.stall_intensity = first_order_lag(self.stall_intensity, target, time_constant, delta);
        // Below 1 % the stall is over: its fluctuations stop.
        if self.stall_intensity < 0.01 && !self.stalled {
            self.stall_intensity = 0.;
            self.stall_time_seconds = 0.;
        } else {
            self.stall_time_seconds += delta;
        }
    }

    /// The N1 and core speed fluctuations of the stall, in percent.
    fn stall_fluctuations(&self) -> (f64, f64) {
        if self.stall_intensity <= 0. {
            return (0., 0.);
        }
        let t = self.stall_time_seconds;
        // Between -1 and 1.
        let wave = 0.6 * (2. * PI * Self::STALL_FLUCTUATION_FAST_HZ * t).sin()
            + 0.4 * (2. * PI * Self::STALL_FLUCTUATION_SLOW_HZ * t + 1.).sin();
        (
            self.stall_intensity * self.parameters.stall_n1_fluctuation_percent * wave,
            self.stall_intensity * self.parameters.stall_core_fluctuation_percent * wave,
        )
    }

    /// The FADEC detects a stall of the engine.
    pub fn is_stalled(&self) -> bool {
        self.stalled
    }

    /// The N1 that the stalled engine loses, in percent.
    pub fn stall_n1_loss_percent(&self) -> f64 {
        self.stall_intensity * self.parameters.stall_n1_loss_percent
    }

    pub fn egt_offset_degrees_celsius(&self) -> f64 {
        self.egt_offset
    }

    pub fn n1_offset_percent(&self) -> f64 {
        self.n1_offset
    }

    pub fn core_offset_percent(&self) -> f64 {
        self.core_offset
    }

    pub fn n1_vibration(&self) -> f64 {
        self.n1_vibration
    }

    pub fn core_vibration(&self) -> f64 {
        self.core_vibration
    }
}
impl SimulationElement for EngineMalfunction {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.compressor_stall.accept(visitor);
        self.egt_overtemperature.accept(visitor);
        self.overspeed.accept(visitor);
        self.high_vibration.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.stall_id, self.stalled);
        writer.write(&self.stall_n1_loss_id, self.stall_n1_loss_percent());
        writer.write(&self.egt_offset_id, self.egt_offset);
        writer.write(&self.n1_offset_id, self.n1_offset);
        writer.write(&self.core_offset_id, self.core_offset);
        writer.write(&self.n1_vibration_id, self.n1_vibration);
        writer.write(&self.core_vibration_id, self.core_vibration);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed},
        Aircraft,
    };
    use ntest::assert_about_eq;
    use std::time::Duration;

    const PARAMETERS: EngineMalfunctionParameters = EngineMalfunctionParameters {
        core_speed_name: "N2",
        stall_threshold_n1_percent: 60.,
        stall_threshold_hysteresis_percent: 3.,
        stall_n1_loss_percent: 15.,
        stall_egt_rise_degrees_celsius: 150.,
        stall_n1_fluctuation_percent: 3.,
        stall_core_fluctuation_percent: 1.5,
        stall_n1_vibration_units: 2.,
        overtemperature_egt_rise_at_full_n1_degrees_celsius: 120.,
        overspeed_n1_fraction: 0.07,
        overspeed_core_fraction: 0.06,
        high_vibration_n1_units_at_full_speed: 8.,
        high_vibration_core_units_at_full_speed: 5.,
        normal_core_to_n1_vibration_ratio: 0.6,
    };

    struct TestAircraft {
        malfunction: EngineMalfunction,
        inputs: EngineMalfunctionInputs,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                malfunction: EngineMalfunction::new(context, 1, PARAMETERS),
                inputs: EngineMalfunctionInputs {
                    engine_is_running: true,
                    n1: Ratio::new::<percent>(85.),
                    core_speed: Ratio::new::<percent>(95.),
                    commanded_n1: Ratio::new::<percent>(85.),
                    msfs_vibration: 1.,
                },
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.malfunction.update(context, self.inputs);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.malfunction.accept(visitor);
            visitor.visit(self);
        }
    }

    struct MalfunctionTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl MalfunctionTestBed {
        /// Engine 1 running at 85 % N1 (commanded 85 %), 95 % N2.
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            test_bed.set_on_ground(false);
            test_bed
        }

        fn with(mut self, change: impl FnOnce(&mut EngineMalfunctionInputs)) -> Self {
            self.command(|a: &mut TestAircraft| change(&mut a.inputs));
            self
        }

        fn failed(mut self, failure: FailureType) -> Self {
            self.fail(failure);
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

        fn stalled(&mut self) -> bool {
            self.read_by_name("ENGINE_1_STALL")
        }

        fn stall_n1_loss(&mut self) -> f64 {
            self.read_by_name("ENGINE_1_STALL_N1_LOSS")
        }

        fn egt_offset(&mut self) -> f64 {
            self.read_by_name("ENGINE_1_EGT_OFFSET")
        }

        fn n1_offset(&mut self) -> f64 {
            self.read_by_name("ENGINE_1_N1_OFFSET")
        }

        fn n2_offset(&mut self) -> f64 {
            self.read_by_name("ENGINE_1_N2_OFFSET")
        }

        fn n1_vibration(&mut self) -> f64 {
            self.read_by_name("ENGINE_1_N1_VIBRATION")
        }

        fn n2_vibration(&mut self) -> f64 {
            self.read_by_name("ENGINE_1_N2_VIBRATION")
        }
    }
    impl TestBed for MalfunctionTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    #[test]
    fn a_healthy_engine_has_no_offsets() {
        let mut test_bed = MalfunctionTestBed::new().and_run_for(Duration::from_secs(5));

        assert!(!test_bed.stalled());
        assert_about_eq!(test_bed.stall_n1_loss(), 0.);
        assert_about_eq!(test_bed.egt_offset(), 0.);
        assert_about_eq!(test_bed.n1_offset(), 0.);
        assert_about_eq!(test_bed.n2_offset(), 0.);
    }

    #[test]
    fn a_healthy_engine_shows_the_msfs_vibration_on_n1_and_a_part_of_it_on_n2() {
        let mut test_bed = MalfunctionTestBed::new().and_run_for(Duration::from_secs(1));

        assert_about_eq!(test_bed.n1_vibration(), 1.);
        assert_about_eq!(test_bed.n2_vibration(), 0.6);
    }

    #[test]
    fn a_stall_above_the_threshold_loses_thrust_and_raises_the_egt() {
        let mut test_bed = MalfunctionTestBed::new()
            .failed(FailureType::EngineCompressorStall(1))
            .and_run_for(Duration::from_secs(10));

        assert!(test_bed.stalled());
        assert!((test_bed.stall_n1_loss() - 15.).abs() < 0.1);
        assert!((test_bed.egt_offset() - 150.).abs() < 1.);
        assert!(test_bed.n1_vibration() > 2.9);
    }

    #[test]
    fn a_stall_makes_n1_and_n2_fluctuate() {
        let mut test_bed = MalfunctionTestBed::new()
            .failed(FailureType::EngineCompressorStall(1))
            .and_run_for(Duration::from_secs(5));

        let mut n1_offsets = vec![];
        for _ in 0..40 {
            test_bed = test_bed.and_run_for(Duration::from_millis(100));
            n1_offsets.push(test_bed.n1_offset());
            assert!(test_bed.n1_offset().abs() <= 3.);
            assert!(test_bed.n2_offset().abs() <= 1.5);
        }
        let highest = n1_offsets.iter().cloned().fold(f64::MIN, f64::max);
        let lowest = n1_offsets.iter().cloned().fold(f64::MAX, f64::min);
        assert!(highest > 1. && lowest < -1.);
    }

    #[test]
    fn no_stall_below_the_threshold() {
        let mut test_bed = MalfunctionTestBed::new()
            .with(|inputs| inputs.commanded_n1 = Ratio::new::<percent>(55.))
            .failed(FailureType::EngineCompressorStall(1))
            .and_run_for(Duration::from_secs(5));

        assert!(!test_bed.stalled());
        assert_about_eq!(test_bed.stall_n1_loss(), 0.);
    }

    #[test]
    fn thrust_lever_to_idle_ends_the_stall_and_it_recurs_above_the_threshold() {
        let mut test_bed = MalfunctionTestBed::new()
            .failed(FailureType::EngineCompressorStall(1))
            .and_run_for(Duration::from_secs(5))
            .with(|inputs| inputs.commanded_n1 = Ratio::new::<percent>(20.))
            .and_run_for(Duration::from_secs(20));

        assert!(!test_bed.stalled());
        assert!(test_bed.stall_n1_loss() < 0.1);
        assert!(test_bed.egt_offset() < 1.);
        assert_about_eq!(test_bed.n1_offset(), 0.);

        test_bed = test_bed
            .with(|inputs| inputs.commanded_n1 = Ratio::new::<percent>(62.))
            .and_run_for(Duration::from_secs(1));
        assert!(test_bed.stalled());
    }

    #[test]
    fn the_stall_ends_only_below_the_hysteresis() {
        let mut test_bed = MalfunctionTestBed::new()
            .failed(FailureType::EngineCompressorStall(1))
            .and_run_for(Duration::from_secs(1))
            .with(|inputs| inputs.commanded_n1 = Ratio::new::<percent>(58.))
            .and_run_for(Duration::from_secs(1));
        assert!(test_bed.stalled());

        test_bed = test_bed
            .with(|inputs| inputs.commanded_n1 = Ratio::new::<percent>(56.))
            .and_run_for(Duration::from_secs(1));
        assert!(!test_bed.stalled());
    }

    #[test]
    fn an_engine_that_does_not_run_does_not_stall() {
        let mut test_bed = MalfunctionTestBed::new()
            .with(|inputs| inputs.engine_is_running = false)
            .failed(FailureType::EngineCompressorStall(1))
            .and_run_for(Duration::from_secs(5));

        assert!(!test_bed.stalled());
    }

    #[test]
    fn the_egt_overtemperature_is_proportional_to_n1() {
        let mut test_bed = MalfunctionTestBed::new()
            .failed(FailureType::EngineEgtOvertemperature(1))
            .and_run_for(Duration::from_secs(40));
        // 120 degrees at 100 % N1
        assert!((test_bed.egt_offset() - 102.).abs() < 0.5);

        test_bed = test_bed
            .with(|inputs| inputs.n1 = Ratio::new::<percent>(50.))
            .and_run_for(Duration::from_secs(40));
        assert!((test_bed.egt_offset() - 60.).abs() < 0.5);
    }

    #[test]
    fn the_egt_overtemperature_builds_up_gradually() {
        let mut test_bed = MalfunctionTestBed::new()
            .failed(FailureType::EngineEgtOvertemperature(1))
            .and_run_for(Duration::from_secs(1));

        let offset = test_bed.egt_offset();
        assert!(offset > 5. && offset < 50.);
    }

    #[test]
    fn the_overspeed_raises_n1_and_n2_by_a_fraction_of_their_value() {
        let mut test_bed = MalfunctionTestBed::new()
            .failed(FailureType::EngineOverspeed(1))
            .and_run_for(Duration::from_secs(40));

        assert!((test_bed.n1_offset() - 0.07 * 85.).abs() < 0.05);
        assert!((test_bed.n2_offset() - 0.06 * 95.).abs() < 0.05);
        // The thrust does not change
        assert_about_eq!(test_bed.stall_n1_loss(), 0.);
    }

    #[test]
    fn the_high_vibration_is_proportional_to_the_rotor_speed() {
        let mut test_bed = MalfunctionTestBed::new()
            .failed(FailureType::EngineHighVibration(1))
            .and_run_for(Duration::from_secs(40));

        assert!((test_bed.n1_vibration() - (1. + 8. * 0.85)).abs() < 0.05);
        assert!((test_bed.n2_vibration() - (0.6 + 5. * 0.95)).abs() < 0.05);

        test_bed = test_bed
            .with(|inputs| {
                inputs.n1 = Ratio::new::<percent>(40.);
                inputs.core_speed = Ratio::new::<percent>(70.);
            })
            .and_run_for(Duration::from_secs(40));
        assert!((test_bed.n1_vibration() - (1. + 8. * 0.4)).abs() < 0.05);
    }

    #[test]
    fn a_cleared_failure_goes_away_gradually() {
        let mut test_bed = MalfunctionTestBed::new()
            .failed(FailureType::EngineEgtOvertemperature(1))
            .and_run_for(Duration::from_secs(40));
        test_bed.unfail(FailureType::EngineEgtOvertemperature(1));
        test_bed = test_bed.and_run_for(Duration::from_secs(1));
        assert!(test_bed.egt_offset() > 50.);

        test_bed = test_bed.and_run_for(Duration::from_secs(40));
        assert!(test_bed.egt_offset() < 0.5);
    }
}
