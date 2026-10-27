//! The vertical paths the terrain look-ahead compares with the terrain: what the aircraft does if the pilot levels off
//! and later climbs gently (caution), and if the pilot pulls up to the climb gradient the airliner can hold (warning).
//!
//! Both are the pilot model of the TSO-C151c test conditions: a pilot delay, then a constant incremental load factor
//! that bends the flight path to its target. Horizontally the aircraft keeps its ground speed.

const GRAVITY_FEET_PER_SECOND_SQUARED: f64 = 32.174;
const FEET_PER_SECOND_PER_KNOT: f64 = 1.687_809_857;
const PROFILE_TIME_STEP_S: f64 = 0.25;

/// Design choice: long enough for the far edge of the caution envelope (132 s).
const PROFILE_DURATION_S: f64 = 140.;

/// The recovery of the TSO-C151c test conditions: 0.25 g incremental load factor.
pub(super) const RECOVERY_LOAD_FACTOR_INCREMENT: f64 = 0.25;

#[derive(Clone, Copy)]
struct LaterClimb {
    start_s: f64,
    /// Height gained per distance flown
    slope: f64,
}

/// Altitude change of the aircraft against the time after the start of the manoeuvre.
pub(super) struct ManoeuvreProfile {
    altitude_change_ft: Vec<f64>,
    /// Climb rate after the profile ends, to extend it
    final_climb_rate_fps: f64,
}

impl ManoeuvreProfile {
    /// The pilot levels the aircraft off (a descent is flattened to level flight, a level or climbing flight path is
    /// continued), then from `climb_start_s` on climbs at the climb angle, or keeps a steeper climb that already exists.
    pub(super) fn level_off_then_climb(
        ground_speed_kt: f64,
        vertical_speed_fpm: f64,
        pilot_delay_s: f64,
        climb_start_s: f64,
        climb_angle_deg: f64,
    ) -> Self {
        let initial_slope = Self::slope(ground_speed_kt, vertical_speed_fpm);
        Self::new(
            ground_speed_kt,
            initial_slope,
            pilot_delay_s,
            initial_slope.max(0.),
            Some(LaterClimb {
                start_s: climb_start_s,
                slope: climb_angle_deg.to_radians().tan(),
            }),
        )
    }

    /// The pilot pulls up to the climb angle, or keeps a steeper climb that already exists.
    pub(super) fn pull_up(
        ground_speed_kt: f64,
        vertical_speed_fpm: f64,
        pilot_delay_s: f64,
        climb_angle_deg: f64,
    ) -> Self {
        let initial_slope = Self::slope(ground_speed_kt, vertical_speed_fpm);
        Self::new(
            ground_speed_kt,
            initial_slope,
            pilot_delay_s,
            initial_slope.max(climb_angle_deg.to_radians().tan()),
            None,
        )
    }

    /// Height gained per distance flown.
    fn slope(ground_speed_kt: f64, vertical_speed_fpm: f64) -> f64 {
        (vertical_speed_fpm / 60.) / (ground_speed_kt * FEET_PER_SECOND_PER_KNOT).max(1.)
    }

    /// After the pilot delay the slope changes at a constant rate towards the target. The rate is that of a constant
    /// vertical acceleration of 0.25 g, which is what the TSO test cases assume (altitude lost = vertical speed squared
    /// over twice the acceleration).
    fn new(
        ground_speed_kt: f64,
        initial_slope: f64,
        pilot_delay_s: f64,
        target_slope: f64,
        later_climb: Option<LaterClimb>,
    ) -> Self {
        let ground_speed_fps = (ground_speed_kt * FEET_PER_SECOND_PER_KNOT).max(1.);
        let slope_rate =
            RECOVERY_LOAD_FACTOR_INCREMENT * GRAVITY_FEET_PER_SECOND_SQUARED / ground_speed_fps;

        let steps = (PROFILE_DURATION_S / PROFILE_TIME_STEP_S) as usize;
        let mut altitude_change_ft = Vec::with_capacity(steps + 1);
        altitude_change_ft.push(0.);

        let mut slope = initial_slope;
        let mut altitude_change = 0.;
        for step in 0..steps {
            let time = step as f64 * PROFILE_TIME_STEP_S;
            let slope_before = slope;
            if time >= pilot_delay_s {
                let target_slope = match later_climb {
                    Some(climb) if time >= climb.start_s => target_slope.max(climb.slope),
                    _ => target_slope,
                };
                let maximum_change = slope_rate * PROFILE_TIME_STEP_S;
                slope += (target_slope - slope).clamp(-maximum_change, maximum_change);
            }
            altitude_change += ground_speed_fps * (slope_before + slope) / 2. * PROFILE_TIME_STEP_S;
            altitude_change_ft.push(altitude_change);
        }

        Self {
            altitude_change_ft,
            final_climb_rate_fps: ground_speed_fps * slope,
        }
    }

    pub(super) fn altitude_change_after(&self, seconds: f64) -> f64 {
        if seconds <= 0. {
            return 0.;
        }
        let position = seconds / PROFILE_TIME_STEP_S;
        let index = position as usize;
        match (
            self.altitude_change_ft.get(index),
            self.altitude_change_ft.get(index + 1),
        ) {
            (Some(before), Some(after)) => before + (after - before) * (position - index as f64),
            _ => {
                let end = self.altitude_change_ft.len() - 1;
                self.altitude_change_ft[end]
                    + self.final_climb_rate_fps * (seconds - end as f64 * PROFILE_TIME_STEP_S)
            }
        }
    }

    /// The lowest altitude change between two times after the start, the ends included.
    pub(super) fn lowest_altitude_change_between(&self, from_s: f64, to_s: f64) -> f64 {
        let first = (from_s / PROFILE_TIME_STEP_S).ceil().max(0.) as usize;
        let last = (to_s / PROFILE_TIME_STEP_S).floor().max(0.) as usize;
        let inside = (first..=last)
            .filter_map(|index| self.altitude_change_ft.get(index))
            .copied()
            .fold(f64::MAX, f64::min);
        inside
            .min(self.altitude_change_after(from_s))
            .min(self.altitude_change_after(to_s))
    }

    /// The most altitude the aircraft gives up on the way.
    #[cfg(test)]
    pub(super) fn lowest_altitude_change(&self) -> f64 {
        self.altitude_change_ft.iter().copied().fold(0., f64::min)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rstest::rstest;

    // Altitude lost until the aircraft is level in the TSO-C151c descent test cases (the pilot
    // delay plus the 0.25 g recovery). The speed does not matter for the loss.
    #[rstest]
    #[case(3., 1000., 67.)]
    #[case(3., 2000., 169.)]
    #[case(3., 4000., 478.)]
    #[case(1., 1000., 34.)]
    #[case(1., 3000., 206.)]
    #[case(1., 500., 12.)]
    #[case(1., 1500., 64.)]
    fn level_off_loses_the_altitude_of_the_tso_tables(
        #[case] pilot_delay_s: f64,
        #[case] descent_rate_fpm: f64,
        #[case] expected_loss_ft: f64,
    ) {
        let profile =
            ManoeuvreProfile::level_off_then_climb(250., -descent_rate_fpm, pilot_delay_s, 20., 3.);
        let loss = -profile.lowest_altitude_change();
        assert!(
            (loss - expected_loss_ft).abs() < 8.,
            "{loss} vs {expected_loss_ft}"
        );
    }

    #[test]
    fn level_off_then_climb_stays_level_until_the_climb_starts_then_climbs_at_the_angle() {
        let profile = ManoeuvreProfile::level_off_then_climb(250., 0., 3., 20., 3.);
        assert_eq!(profile.altitude_change_after(20.), 0.);
        let rise_per_second =
            profile.altitude_change_after(81.) - profile.altitude_change_after(80.);
        let expected = 250. * FEET_PER_SECOND_PER_KNOT * 3f64.to_radians().tan();
        assert!((rise_per_second - expected).abs() < 1., "{rise_per_second}");
    }

    #[test]
    fn level_off_then_climb_keeps_a_steeper_existing_climb() {
        let profile = ManoeuvreProfile::level_off_then_climb(250., 2000., 3., 20., 3.);
        let rise_per_second =
            profile.altitude_change_after(81.) - profile.altitude_change_after(80.);
        assert!(rise_per_second > 2000. / 60. * 0.99);
    }

    #[test]
    fn level_off_of_a_climb_keeps_climbing() {
        let profile = ManoeuvreProfile::level_off_then_climb(250., 1500., 3., 20., 3.);
        assert!(profile.altitude_change_after(60.) > 1500. * 0.9);
        assert_eq!(profile.lowest_altitude_change(), 0.);
    }

    #[test]
    fn pull_up_ends_on_the_climb_angle() {
        let profile = ManoeuvreProfile::pull_up(250., 0., 1., 6.);
        let rise_per_second =
            profile.altitude_change_after(131.) - profile.altitude_change_after(130.);
        let expected = 250. * FEET_PER_SECOND_PER_KNOT * 6f64.to_radians().tan();
        assert!((rise_per_second - expected).abs() < 1., "{rise_per_second}");
    }

    #[test]
    fn pull_up_waits_for_the_pilot_delay() {
        let profile = ManoeuvreProfile::pull_up(250., -1000., 3., 6.);
        // Still descending at the initial rate during the delay
        assert!((profile.altitude_change_after(2.) + 2. * 1000. / 60.).abs() < 1.);
    }

    #[test]
    fn pull_up_keeps_a_steeper_existing_climb() {
        let profile = ManoeuvreProfile::pull_up(250., 4000., 1., 6.);
        let rise_per_second =
            profile.altitude_change_after(101.) - profile.altitude_change_after(100.);
        assert!(rise_per_second > 4000. / 60. * 0.99);
    }

    #[test]
    fn the_lowest_altitude_between_two_times_finds_the_dip_and_the_ends() {
        let profile = ManoeuvreProfile::level_off_then_climb(250., -1000., 3., 20., 3.);
        let before_the_recovery = profile.lowest_altitude_change_between(0., 3.);
        assert!(
            (before_the_recovery + 50.).abs() < 2.,
            "{before_the_recovery}"
        );
        let around_the_dip = profile.lowest_altitude_change_between(4., 6.);
        assert!((around_the_dip + 67.).abs() < 8., "{around_the_dip}");
        // A climb is lowest where the interval starts
        let climb = ManoeuvreProfile::pull_up(250., 0., 1., 6.);
        assert_eq!(
            climb.lowest_altitude_change_between(10., 20.),
            climb.altitude_change_after(10.)
        );
    }

    #[test]
    fn the_profile_is_extended_beyond_its_end() {
        let profile = ManoeuvreProfile::pull_up(250., 0., 1., 6.);
        let end = profile.altitude_change_after(PROFILE_DURATION_S);
        assert!(profile.altitude_change_after(PROFILE_DURATION_S + 10.) > end + 100.);
    }
}
