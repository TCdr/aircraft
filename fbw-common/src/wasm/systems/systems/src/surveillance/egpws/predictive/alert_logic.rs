//! From the threats of a terrain scan to what the crew gets: the aural words, the lights and the automatic terrain
//! display.
//!
//! - Caution, terrain ahead: TERRAIN AHEAD, said again every 7 s, amber GPWS light.
//! - Caution, terrain below the aircraft: TOO LOW TERRAIN instead, every 7 s too, amber GPWS light, no terrain display.
//! - Warning: TERRAIN AHEAD once, then PULL UP over and over for as long as the warning lasts, red PULL UP light.
//! - Warning, the aircraft cannot climb over: AVOID TERRAIN over and over for as long as it lasts, red PULL UP light.
//! - Obstacles have the same alerts with OBSTACLE AHEAD and AVOID OBSTACLE as the words (PULL UP is shared) and
//!   OBST AHEAD on the NDs; there is no TOO LOW variant. When terrain and an obstacle threaten at the same level,
//!   the terrain words are said.
//!
//! The voice output is a train of pulses: it is a word for a short while and None in between. The sound player of the
//! cockpit plays a word when the output changes, so a word that would stay on the output would be said only once.
//!
//! A warning takes over from a caution. Once AVOID TERRAIN (or AVOID OBSTACLE) has been said, PULL UP does not come back
//! during the same warning.

use super::tad_scan::TadScan;
use std::time::Duration;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PredictiveVoice {
    #[default]
    None,
    TerrainAhead,
    TooLowTerrain,
    PullUp,
    AvoidTerrain,
    ObstacleAhead,
    AvoidObstacle,
}

impl PredictiveVoice {
    /// The words of a warning rank above those of a caution.
    pub fn is_warning(&self) -> bool {
        matches!(
            self,
            Self::PullUp | Self::AvoidTerrain | Self::AvoidObstacle
        )
    }
}

/// The TERR AHEAD (or OBST AHEAD) message of the NDs: amber for the caution, red for the warning (PULL UP or AVOID
/// TERRAIN / OBSTACLE). The caution for terrain below the aircraft (TOO LOW TERRAIN) has none.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TerrainAheadMessage {
    #[default]
    None = 0,
    Caution = 1,
    Warning = 2,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) struct TadAlertOutputs {
    pub(super) voice: PredictiveVoice,
    pub(super) warning_light: bool,
    pub(super) caution_light: bool,
    pub(super) automatic_terrain_display: bool,
    pub(super) nd_message: TerrainAheadMessage,
    /// AVOID TERRAIN or AVOID OBSTACLE: the warning areas are crosshatched
    pub(super) avoid_terrain: bool,
    /// The alert on the ND is about an obstacle: the message reads OBST AHEAD
    pub(super) obstacle_ahead: bool,
}

pub(super) struct TadAlertLogic {
    caution_hold: Duration,
    warning_hold: Duration,
    last_caution_below_aircraft: bool,
    last_caution_is_obstacle: bool,
    last_warning_cannot_climb_over: bool,
    last_warning_is_obstacle: bool,
    avoid_terrain_latched: bool,
    time_since_warning_word: Duration,
    warning_word_period: Duration,
    warning_word: Option<PredictiveVoice>,
    warning_word_remaining: Duration,
    time_since_caution_word: Duration,
    caution_word_remaining: Duration,
}

impl TadAlertLogic {
    /// Design choice: the alerts stay on for a short while after the threat is gone, so that a sample at the edge of
    /// the ribbon cannot make the lights and words flicker.
    const HOLD: Duration = Duration::from_secs(2);

    /// "TERRAIN AHEAD" and "TOO LOW TERRAIN" are repeated every 7 s while the caution lasts.
    const CAUTION_REPEAT: Duration = Duration::from_secs(7);

    /// Design choice: a word stays on the output for 0.5 s, well under the 1.1 s after which the MCDU's sound manager
    /// says a word again while it still sees it, so each one is said once.
    const WORD_HOLD: Duration = Duration::from_millis(500);

    /// Design choice: PULL UP and AVOID TERRAIN (sounds of about 1 s) start again every 1.5 s, which leaves 1 s of
    /// None after a word held for 0.5 s. The gap is long enough for the sound player to see the output drop to None.
    const WARNING_REPEAT: Duration = Duration::from_millis(1500);

    /// Design choice: the sound of TERRAIN AHEAD lasts 1.5 s, so the PULL UP after it waits for 2 s: it is not lost
    /// because the previous sound is still playing.
    const WARNING_REPEAT_AFTER_TERRAIN_AHEAD: Duration = Duration::from_millis(2000);

    /// Design choice: the sound of OBSTACLE AHEAD lasts 1.8 s, so the PULL UP after it waits for 2.3 s for the same
    /// reason.
    const WARNING_REPEAT_AFTER_OBSTACLE_AHEAD: Duration = Duration::from_millis(2300);

    /// Design choice: the first AVOID TERRAIN waits 2.5 s after a TERRAIN AHEAD or PULL UP. Those come from the sound
    /// bank, which the MCDU starts some time after it sees the output, and last about 1.1 s; AVOID TERRAIN is a clip the
    /// sim starts the moment the output changes. After 1.5 s the two were heard at the same time in the sim. The same
    /// goes for AVOID OBSTACLE after OBSTACLE AHEAD or PULL UP.
    const AVOID_TERRAIN_AFTER_SOUND_BANK_WORD: Duration = Duration::from_millis(2500);

    pub(super) fn new() -> Self {
        Self {
            caution_hold: Duration::ZERO,
            warning_hold: Duration::ZERO,
            last_caution_below_aircraft: false,
            last_caution_is_obstacle: false,
            last_warning_cannot_climb_over: false,
            last_warning_is_obstacle: false,
            avoid_terrain_latched: false,
            time_since_warning_word: Self::WARNING_REPEAT,
            warning_word_period: Self::WARNING_REPEAT,
            warning_word: None,
            warning_word_remaining: Duration::ZERO,
            time_since_caution_word: Self::CAUTION_REPEAT,
            caution_word_remaining: Duration::ZERO,
        }
    }

    /// The functions are off: every alert and the hold of it end at once.
    pub(super) fn reset(&mut self) {
        *self = Self::new();
    }

    pub(super) fn update(&mut self, delta: Duration, scan: &TadScan) -> TadAlertOutputs {
        self.hold_threats(scan);
        self.caution_hold = self.caution_hold.saturating_sub(delta);
        self.warning_hold = self.warning_hold.saturating_sub(delta);

        let warning_active = !self.warning_hold.is_zero();
        let caution_active = !self.caution_hold.is_zero() && !warning_active;

        self.update_avoid_latch(warning_active);
        self.update_warning_words(delta, warning_active);
        self.update_caution_words(delta, caution_active);

        let voice = if warning_active {
            self.warning_word_voice()
        } else if caution_active && !self.caution_word_remaining.is_zero() {
            if self.last_caution_below_aircraft {
                PredictiveVoice::TooLowTerrain
            } else if self.last_caution_is_obstacle {
                PredictiveVoice::ObstacleAhead
            } else {
                PredictiveVoice::TerrainAhead
            }
        } else {
            PredictiveVoice::None
        };

        let caution_ahead = caution_active && !self.last_caution_below_aircraft;
        TadAlertOutputs {
            voice,
            warning_light: warning_active,
            caution_light: caution_active,
            automatic_terrain_display: warning_active || caution_ahead,
            nd_message: if warning_active {
                TerrainAheadMessage::Warning
            } else if caution_ahead {
                TerrainAheadMessage::Caution
            } else {
                TerrainAheadMessage::None
            },
            avoid_terrain: warning_active && self.avoid_terrain_latched,
            obstacle_ahead: (warning_active && self.last_warning_is_obstacle)
                || (caution_ahead && self.last_caution_is_obstacle),
        }
    }

    /// A threat in the scan restarts the hold; the nature of the last threat is what the held alert shows. Design
    /// choice: when terrain and an obstacle threaten at the same level the alert is the terrain one, because the aural
    /// priorities of the system put the terrain words before the obstacle words.
    fn hold_threats(&mut self, scan: &TadScan) {
        if let Some(caution) = scan.caution.or(scan.obstacle_caution) {
            self.caution_hold = Self::HOLD;
            self.last_caution_below_aircraft = caution.terrain_below_aircraft;
            self.last_caution_is_obstacle = scan.caution.is_none();
        }
        if scan.warning.is_some() || scan.obstacle_warning.is_some() {
            self.warning_hold = Self::HOLD;
            // Either threat can be one that a straight pull-up does not clear
            self.last_warning_cannot_climb_over = scan
                .warning
                .into_iter()
                .chain(scan.obstacle_warning)
                .any(|warning| warning.cannot_climb_over);
            self.last_warning_is_obstacle = scan.warning.is_none();
        }
    }

    fn update_avoid_latch(&mut self, warning_active: bool) {
        if !warning_active {
            self.avoid_terrain_latched = false;
        } else if self.last_warning_cannot_climb_over {
            self.avoid_terrain_latched = true;
        }
    }

    fn update_warning_words(&mut self, delta: Duration, warning_active: bool) {
        self.warning_word_remaining = self.warning_word_remaining.saturating_sub(delta);
        if !warning_active {
            // The next warning starts at once
            self.time_since_warning_word = Self::WARNING_REPEAT;
            self.warning_word_period = Self::WARNING_REPEAT;
            self.warning_word = None;
            self.warning_word_remaining = Duration::ZERO;
            return;
        }
        self.time_since_warning_word += delta;
        let after_sound_bank_word = matches!(
            self.warning_word,
            Some(
                PredictiveVoice::TerrainAhead
                    | PredictiveVoice::ObstacleAhead
                    | PredictiveVoice::PullUp
            )
        );
        let period = if self.avoid_terrain_latched && after_sound_bank_word {
            self.warning_word_period
                .max(Self::AVOID_TERRAIN_AFTER_SOUND_BANK_WORD)
        } else {
            self.warning_word_period
        };
        if self.time_since_warning_word >= period {
            let word = self.next_warning_word();
            self.time_since_warning_word = Duration::ZERO;
            self.warning_word_period = match word {
                PredictiveVoice::TerrainAhead => Self::WARNING_REPEAT_AFTER_TERRAIN_AHEAD,
                PredictiveVoice::ObstacleAhead => Self::WARNING_REPEAT_AFTER_OBSTACLE_AHEAD,
                _ => Self::WARNING_REPEAT,
            };
            self.warning_word = Some(word);
            self.warning_word_remaining = Self::WORD_HOLD;
        }
    }

    /// A word that is being said is not changed halfway: the latch of AVOID TERRAIN takes effect with the next word.
    fn next_warning_word(&self) -> PredictiveVoice {
        let is_obstacle = self.last_warning_is_obstacle;
        if self.avoid_terrain_latched {
            if is_obstacle {
                PredictiveVoice::AvoidObstacle
            } else {
                PredictiveVoice::AvoidTerrain
            }
        } else if self.warning_word.is_none() {
            // TERRAIN AHEAD (or OBSTACLE AHEAD), then PULL UP
            if is_obstacle {
                PredictiveVoice::ObstacleAhead
            } else {
                PredictiveVoice::TerrainAhead
            }
        } else {
            PredictiveVoice::PullUp
        }
    }

    fn warning_word_voice(&self) -> PredictiveVoice {
        match self.warning_word {
            Some(word) if !self.warning_word_remaining.is_zero() => word,
            _ => PredictiveVoice::None,
        }
    }

    fn update_caution_words(&mut self, delta: Duration, caution_active: bool) {
        self.caution_word_remaining = self.caution_word_remaining.saturating_sub(delta);
        if !caution_active {
            // The next caution is announced at once
            self.time_since_caution_word = Self::CAUTION_REPEAT;
            self.caution_word_remaining = Duration::ZERO;
            return;
        }
        self.time_since_caution_word += delta;
        if self.time_since_caution_word >= Self::CAUTION_REPEAT {
            self.time_since_caution_word = Duration::ZERO;
            self.caution_word_remaining = Self::WORD_HOLD;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surveillance::egpws::predictive::tad_scan::{CautionThreat, WarningThreat};
    use rstest::rstest;

    const STEP: Duration = Duration::from_millis(500);

    fn caution(terrain_below_aircraft: bool) -> TadScan {
        TadScan {
            caution: Some(CautionThreat {
                clearance_ft: 300.,
                terrain_below_aircraft,
            }),
            ..Default::default()
        }
    }

    fn warning(cannot_climb_over: bool) -> TadScan {
        TadScan {
            warning: Some(WarningThreat {
                clearance_ft: 300.,
                cannot_climb_over,
            }),
            ..Default::default()
        }
    }

    fn run(logic: &mut TadAlertLogic, scan: &TadScan, seconds: f64) -> TadAlertOutputs {
        let steps = (seconds / STEP.as_secs_f64()).round() as usize;
        let mut outputs = TadAlertOutputs::default();
        for _ in 0..steps {
            outputs = logic.update(STEP, scan);
        }
        outputs
    }

    #[test]
    fn nothing_without_a_threat() {
        let mut logic = TadAlertLogic::new();
        assert_eq!(
            run(&mut logic, &TadScan::default(), 5.),
            TadAlertOutputs::default()
        );
    }

    #[test]
    fn a_caution_ahead_says_terrain_ahead_with_the_amber_light_and_the_terrain_display() {
        let mut logic = TadAlertLogic::new();
        let outputs = logic.update(STEP, &caution(false));
        assert_eq!(outputs.voice, PredictiveVoice::TerrainAhead);
        assert!(outputs.caution_light);
        assert!(!outputs.warning_light);
        assert!(outputs.automatic_terrain_display);
    }

    #[test]
    fn terrain_ahead_is_said_every_7_s() {
        let mut logic = TadAlertLogic::new();
        let mut word_starts = Vec::new();
        let mut previous = PredictiveVoice::None;
        for step in 0..60 {
            let voice = logic.update(STEP, &caution(false)).voice;
            if voice != PredictiveVoice::None && previous == PredictiveVoice::None {
                word_starts.push(step as f64 * 0.5);
            }
            previous = voice;
        }
        assert_eq!(word_starts, vec![0., 7., 14., 21., 28.]);
    }

    #[test]
    fn the_nd_shows_terr_ahead_amber_for_a_caution_ahead_and_red_for_a_warning() {
        assert_eq!(
            TadAlertLogic::new()
                .update(STEP, &caution(false))
                .nd_message,
            TerrainAheadMessage::Caution
        );
        assert_eq!(
            TadAlertLogic::new()
                .update(STEP, &warning(false))
                .nd_message,
            TerrainAheadMessage::Warning
        );
        assert_eq!(
            TadAlertLogic::new().update(STEP, &warning(true)).nd_message,
            TerrainAheadMessage::Warning
        );
    }

    #[test]
    fn the_crosshatch_goes_with_avoid_terrain() {
        assert!(
            TadAlertLogic::new()
                .update(STEP, &warning(true))
                .avoid_terrain
        );
        assert!(
            !TadAlertLogic::new()
                .update(STEP, &warning(false))
                .avoid_terrain
        );
        assert!(
            !TadAlertLogic::new()
                .update(STEP, &caution(false))
                .avoid_terrain
        );
    }

    #[test]
    fn too_low_terrain_has_no_nd_message() {
        assert_eq!(
            TadAlertLogic::new().update(STEP, &caution(true)).nd_message,
            TerrainAheadMessage::None
        );
    }

    #[test]
    fn the_nd_message_goes_with_the_alert_after_the_hold() {
        let mut logic = TadAlertLogic::new();
        logic.update(STEP, &warning(false));
        assert_eq!(
            run(&mut logic, &TadScan::default(), 3.).nd_message,
            TerrainAheadMessage::None
        );
    }

    #[test]
    fn a_caution_below_says_too_low_terrain_without_the_terrain_display() {
        let mut logic = TadAlertLogic::new();
        let outputs = logic.update(STEP, &caution(true));
        assert_eq!(outputs.voice, PredictiveVoice::TooLowTerrain);
        assert!(outputs.caution_light);
        assert!(!outputs.automatic_terrain_display);
    }

    /// The longest time a word stays on the voice output, on fine steps
    fn longest_word(scan: &TadScan) -> Duration {
        let step = Duration::from_millis(50);
        let mut logic = TadAlertLogic::new();
        let (mut longest, mut current) = (Duration::ZERO, Duration::ZERO);
        for _ in 0..200 {
            if logic.update(step, scan).voice == PredictiveVoice::None {
                current = Duration::ZERO;
            } else {
                current += step;
                longest = longest.max(current);
            }
        }
        longest
    }

    #[test]
    fn each_word_leaves_the_output_well_before_the_sound_player_says_it_again() {
        // The MCDU's sound manager says a word again after 1.1 s while it still sees it on the output, and sees the
        // output every 75 ms or more: a word held close to 1.1 s is sometimes said twice, the second time over the
        // next word.
        let well_before = Duration::from_millis(600);
        for scan in [caution(false), caution(true), warning(false), warning(true)] {
            assert!(
                longest_word(&scan) <= well_before,
                "{:?}",
                longest_word(&scan)
            );
        }
    }

    #[test]
    fn a_warning_says_terrain_ahead_then_pull_up_with_the_red_light() {
        let mut logic = TadAlertLogic::new();
        let first = logic.update(STEP, &warning(false));
        assert_eq!(first.voice, PredictiveVoice::TerrainAhead);
        assert!(first.warning_light);
        assert!(!first.caution_light);
        assert!(first.automatic_terrain_display);
        let mut logic = TadAlertLogic::new();
        // The sound of TERRAIN AHEAD lasts 1.5 s, PULL UP waits until it is over
        let words = word_starts(&mut logic, &warning(false), 4.);
        assert_eq!(words[1], (2., PredictiveVoice::PullUp));
    }

    /// The start time (seconds from the first update of the run) and the word of every pulse of the voice output, and
    /// whether the output went back to None between two pulses.
    fn word_starts(
        logic: &mut TadAlertLogic,
        scan: &TadScan,
        seconds: f64,
    ) -> Vec<(f64, PredictiveVoice)> {
        let mut starts = Vec::new();
        let mut previous = PredictiveVoice::None;
        for step in 0..(seconds / STEP.as_secs_f64()) as usize {
            let voice = logic.update(STEP, scan).voice;
            if voice != PredictiveVoice::None && voice != previous {
                starts.push((step as f64 * STEP.as_secs_f64(), voice));
            }
            previous = voice;
        }
        starts
    }

    #[test]
    fn avoid_terrain_leaves_room_after_the_last_sound_bank_word() {
        // PULL UP comes from the sound bank, started by the MCDU some time after the output; AVOID TERRAIN is a clip
        // started at once: the first AVOID TERRAIN waits longer, so that the two are not said at the same time.
        let step = Duration::from_millis(50);
        let mut logic = TadAlertLogic::new();
        let mut starts: Vec<(f64, PredictiveVoice)> = Vec::new();
        let mut previous = PredictiveVoice::None;
        for i in 0..200 {
            let scan = if i < 80 {
                warning(false)
            } else {
                warning(true)
            };
            let voice = logic.update(step, &scan).voice;
            if voice != PredictiveVoice::None && voice != previous {
                starts.push((i as f64 * 0.05, voice));
            }
            previous = voice;
        }
        let first_avoid = starts
            .iter()
            .position(|(_, word)| *word == PredictiveVoice::AvoidTerrain)
            .unwrap();
        let (last_pull_up_s, last_word) = starts[first_avoid - 1];
        assert_eq!(last_word, PredictiveVoice::PullUp);
        assert!(starts[first_avoid].0 - last_pull_up_s >= 2.5 - 1e-9);
        // then the usual rhythm
        assert!((starts[first_avoid + 1].0 - starts[first_avoid].0 - 1.5).abs() < 1e-9);
    }

    #[test]
    fn a_warning_repeats_its_words_for_as_long_as_it_lasts() {
        let mut logic = TadAlertLogic::new();
        let words = word_starts(&mut logic, &warning(false), 30.);
        assert_eq!(words[0], (0., PredictiveVoice::TerrainAhead));
        assert!(words[1..]
            .iter()
            .all(|(_, word)| *word == PredictiveVoice::PullUp));
        // Every pulse starts within 2 s of the one before, up to the end of the run, and the output is None between
        let times: Vec<f64> = words.iter().map(|(time, _)| *time).collect();
        assert!(times.windows(2).all(|pair| pair[1] - pair[0] <= 2.));
        assert!(*times.last().unwrap() >= 28.);
    }

    #[test]
    fn the_voice_output_returns_to_none_between_the_words_of_a_warning() {
        let mut logic = TadAlertLogic::new();
        let mut none_steps = 0;
        for _ in 0..60 {
            if logic.update(STEP, &warning(false)).voice == PredictiveVoice::None {
                none_steps += 1;
            }
        }
        // 1.5 s period with 1 s words: a third of the time is silent
        assert!(none_steps >= 15, "{none_steps}");
    }

    #[test]
    fn avoid_terrain_repeats_for_as_long_as_the_warning_lasts() {
        let mut logic = TadAlertLogic::new();
        let words = word_starts(&mut logic, &warning(true), 30.);
        assert!(words
            .iter()
            .all(|(_, word)| *word == PredictiveVoice::AvoidTerrain));
        let times: Vec<f64> = words.iter().map(|(time, _)| *time).collect();
        assert_eq!(times[0], 0.);
        assert!(times.windows(2).all(|pair| pair[1] - pair[0] <= 2.));
        assert!(*times.last().unwrap() >= 28.);
    }

    #[test]
    fn avoid_terrain_that_became_sufficient_again_keeps_repeating_instead_of_sticking() {
        let mut logic = TadAlertLogic::new();
        word_starts(&mut logic, &warning(false), 4.);
        word_starts(&mut logic, &warning(true), 1.);
        run(&mut logic, &warning(false), 2.);
        let words = word_starts(&mut logic, &warning(false), 30.);
        assert!(words
            .iter()
            .all(|(_, word)| *word == PredictiveVoice::AvoidTerrain));
        assert!(words.len() >= 18, "{words:?}");
    }

    #[test]
    fn a_warning_that_cannot_be_climbed_over_says_avoid_terrain() {
        let mut logic = TadAlertLogic::new();
        let outputs = logic.update(STEP, &warning(true));
        assert_eq!(outputs.voice, PredictiveVoice::AvoidTerrain);
        assert!(outputs.warning_light);
    }

    #[test]
    fn avoid_terrain_follows_pull_up_and_stays_for_the_rest_of_the_warning() {
        let mut logic = TadAlertLogic::new();
        run(&mut logic, &warning(false), 3.);
        let words = word_starts(&mut logic, &warning(true), 3.);
        assert_eq!(words[0].1, PredictiveVoice::AvoidTerrain);
        // The pilot's turn makes the pull-up sufficient again, but the avoid stays until the warning is over
        let words = word_starts(&mut logic, &warning(false), 3.);
        assert!(words
            .iter()
            .all(|(_, word)| *word == PredictiveVoice::AvoidTerrain));
        run(&mut logic, &TadScan::default(), 3.);
        assert_eq!(
            logic.update(STEP, &warning(false)).voice,
            PredictiveVoice::TerrainAhead
        );
    }

    #[test]
    fn a_warning_takes_over_from_a_caution() {
        let mut logic = TadAlertLogic::new();
        run(&mut logic, &caution(false), 3.);
        let scan = TadScan {
            caution: caution(false).caution,
            warning: warning(false).warning,
            ..Default::default()
        };
        let outputs = logic.update(STEP, &scan);
        assert!(outputs.warning_light);
        assert!(!outputs.caution_light);
        assert!(outputs.voice.is_warning() || outputs.voice == PredictiveVoice::TerrainAhead);
    }

    #[test]
    fn the_alert_is_held_for_two_seconds_after_the_threat_is_gone() {
        let mut logic = TadAlertLogic::new();
        logic.update(STEP, &warning(false));
        assert!(run(&mut logic, &TadScan::default(), 1.).warning_light);
        assert!(!run(&mut logic, &TadScan::default(), 1.).warning_light);
    }

    #[test]
    fn a_reset_ends_the_alert_at_once_without_the_hold() {
        let mut logic = TadAlertLogic::new();
        logic.update(STEP, &warning(false));
        logic.reset();
        assert_eq!(
            logic.update(STEP, &TadScan::default()),
            TadAlertOutputs::default()
        );
    }

    #[test]
    fn the_next_caution_is_announced_at_once() {
        let mut logic = TadAlertLogic::new();
        run(&mut logic, &caution(false), 3.);
        run(&mut logic, &TadScan::default(), 3.);
        assert_eq!(
            logic.update(STEP, &caution(false)).voice,
            PredictiveVoice::TerrainAhead
        );
    }

    #[test]
    fn the_words_of_a_warning_rank_above_those_of_a_caution() {
        assert!(PredictiveVoice::PullUp.is_warning());
        assert!(PredictiveVoice::AvoidTerrain.is_warning());
        assert!(!PredictiveVoice::TerrainAhead.is_warning());
        assert!(!PredictiveVoice::TooLowTerrain.is_warning());
    }

    fn obstacle_caution() -> TadScan {
        TadScan {
            obstacle_caution: caution(false).caution,
            ..Default::default()
        }
    }

    fn obstacle_warning(cannot_climb_over: bool) -> TadScan {
        TadScan {
            obstacle_warning: warning(cannot_climb_over).warning,
            ..Default::default()
        }
    }

    /// The times (s) at which each word starts, flying a warning that becomes one to avoid after 4 s
    fn word_starts_into_avoid(warning: fn(bool) -> TadScan) -> Vec<(f64, PredictiveVoice)> {
        let step = Duration::from_millis(50);
        let mut logic = TadAlertLogic::new();
        let mut starts: Vec<(f64, PredictiveVoice)> = Vec::new();
        let mut previous = PredictiveVoice::None;
        for i in 0..200 {
            let voice = logic.update(step, &warning(i >= 80)).voice;
            if voice != PredictiveVoice::None && voice != previous {
                starts.push((i as f64 * 0.05, voice));
            }
            previous = voice;
        }
        starts
    }

    #[rstest]
    #[case(warning, PredictiveVoice::AvoidTerrain)]
    #[case(obstacle_warning, PredictiveVoice::AvoidObstacle)]
    fn avoid_terrain_leaves_room_after_the_last_sound_bank_word(
        #[case] warning: fn(bool) -> TadScan,
        #[case] avoid: PredictiveVoice,
    ) {
        // PULL UP comes from the sound bank, started by the MCDU some time after the output; AVOID TERRAIN and AVOID
        // OBSTACLE are clips started at once: the first one waits longer, so that the two are not said at the same time.
        let starts = word_starts_into_avoid(warning);
        let first_avoid = starts.iter().position(|(_, word)| *word == avoid).unwrap();
        let (last_pull_up_s, last_word) = starts[first_avoid - 1];
        assert_eq!(last_word, PredictiveVoice::PullUp);
        assert!(starts[first_avoid].0 - last_pull_up_s >= 2.5 - 1e-9);
        // then the usual rhythm
        assert!((starts[first_avoid + 1].0 - starts[first_avoid].0 - 1.5).abs() < 1e-9);
    }

    #[test]
    fn an_obstacle_caution_says_obstacle_ahead_every_7_s_with_the_amber_light() {
        let mut logic = TadAlertLogic::new();
        let first = logic.update(STEP, &obstacle_caution());
        assert_eq!(first.voice, PredictiveVoice::ObstacleAhead);
        assert!(first.caution_light);
        assert!(!first.warning_light);
        assert!(first.automatic_terrain_display);
        assert!(first.obstacle_ahead);
        assert_eq!(first.nd_message, TerrainAheadMessage::Caution);

        let mut logic = TadAlertLogic::new();
        let words = word_starts(&mut logic, &obstacle_caution(), 30.);
        assert_eq!(
            words,
            vec![
                (0., PredictiveVoice::ObstacleAhead),
                (7., PredictiveVoice::ObstacleAhead),
                (14., PredictiveVoice::ObstacleAhead),
                (21., PredictiveVoice::ObstacleAhead),
                (28., PredictiveVoice::ObstacleAhead),
            ]
        );
    }

    #[test]
    fn an_obstacle_warning_says_obstacle_ahead_then_pull_up_after_the_longer_sound() {
        let mut logic = TadAlertLogic::new();
        let first = logic.update(STEP, &obstacle_warning(false));
        assert_eq!(first.voice, PredictiveVoice::ObstacleAhead);
        assert!(first.warning_light);
        assert!(first.obstacle_ahead);
        assert_eq!(first.nd_message, TerrainAheadMessage::Warning);

        let mut logic = TadAlertLogic::new();
        let words = word_starts(&mut logic, &obstacle_warning(false), 30.);
        assert_eq!(words[0], (0., PredictiveVoice::ObstacleAhead));
        // The sound of OBSTACLE AHEAD lasts 1.8 s, PULL UP waits for 2.3 s
        assert_eq!(words[1], (2.5, PredictiveVoice::PullUp));
        assert!(words[1..]
            .iter()
            .all(|(_, word)| *word == PredictiveVoice::PullUp));
        assert!(words
            .windows(2)
            .skip(1)
            .all(|pair| pair[1].0 - pair[0].0 <= 2.));
    }

    #[test]
    fn an_obstacle_warning_that_cannot_be_climbed_over_says_avoid_obstacle_with_the_crosshatch() {
        let mut logic = TadAlertLogic::new();
        let outputs = logic.update(STEP, &obstacle_warning(true));
        assert_eq!(outputs.voice, PredictiveVoice::AvoidObstacle);
        assert!(outputs.warning_light);
        assert!(outputs.avoid_terrain);
        assert!(outputs.obstacle_ahead);

        let mut logic = TadAlertLogic::new();
        let words = word_starts(&mut logic, &obstacle_warning(true), 30.);
        assert!(words
            .iter()
            .all(|(_, word)| *word == PredictiveVoice::AvoidObstacle));
        assert!(words.len() >= 18, "{words:?}");
    }

    #[test]
    fn avoid_obstacle_stays_for_the_rest_of_the_warning() {
        let mut logic = TadAlertLogic::new();
        run(&mut logic, &obstacle_warning(false), 4.);
        let words = word_starts(&mut logic, &obstacle_warning(true), 3.);
        assert_eq!(words[0].1, PredictiveVoice::AvoidObstacle);
        let words = word_starts(&mut logic, &obstacle_warning(false), 3.);
        assert!(words
            .iter()
            .all(|(_, word)| *word == PredictiveVoice::AvoidObstacle));
    }

    #[test]
    fn the_words_of_an_obstacle_warning_rank_above_those_of_a_caution() {
        assert!(PredictiveVoice::AvoidObstacle.is_warning());
        assert!(!PredictiveVoice::ObstacleAhead.is_warning());
    }

    #[test]
    fn terrain_words_take_priority_when_terrain_and_an_obstacle_threaten_together() {
        let mut both_cautions = caution(false);
        both_cautions.obstacle_caution = obstacle_caution().obstacle_caution;
        let outputs = TadAlertLogic::new().update(STEP, &both_cautions);
        assert_eq!(outputs.voice, PredictiveVoice::TerrainAhead);
        assert!(!outputs.obstacle_ahead);

        let mut both_warnings = warning(true);
        both_warnings.obstacle_warning = obstacle_warning(true).obstacle_warning;
        let outputs = TadAlertLogic::new().update(STEP, &both_warnings);
        assert_eq!(outputs.voice, PredictiveVoice::AvoidTerrain);
        assert!(!outputs.obstacle_ahead);
    }

    #[test]
    fn the_obstacle_speaks_when_only_its_level_has_the_higher_alert() {
        // A terrain caution with an obstacle warning: the warning is the obstacle's
        let mut scan = caution(false);
        scan.obstacle_warning = obstacle_warning(false).obstacle_warning;
        let outputs = TadAlertLogic::new().update(STEP, &scan);
        assert_eq!(outputs.voice, PredictiveVoice::ObstacleAhead);
        assert!(outputs.warning_light);
        assert!(outputs.obstacle_ahead);

        // A terrain warning with an obstacle caution: the warning is the terrain's
        let mut scan = warning(false);
        scan.obstacle_caution = obstacle_caution().obstacle_caution;
        let outputs = TadAlertLogic::new().update(STEP, &scan);
        assert_eq!(outputs.voice, PredictiveVoice::TerrainAhead);
        assert!(!outputs.obstacle_ahead);
    }

    #[test]
    fn the_obstacle_message_is_held_with_the_alert_and_goes_with_it() {
        let mut logic = TadAlertLogic::new();
        logic.update(STEP, &obstacle_caution());
        assert!(run(&mut logic, &TadScan::default(), 1.).obstacle_ahead);
        let gone = run(&mut logic, &TadScan::default(), 1.5);
        assert!(!gone.obstacle_ahead);
        assert_eq!(gone.nd_message, TerrainAheadMessage::None);
    }

    #[test]
    fn a_terrain_alert_after_an_obstacle_alert_is_not_taken_for_an_obstacle() {
        let mut logic = TadAlertLogic::new();
        run(&mut logic, &obstacle_caution(), 1.);
        let outputs = run(&mut logic, &caution(false), 1.);
        assert!(!outputs.obstacle_ahead);
    }
}
