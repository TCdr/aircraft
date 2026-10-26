//! The terrain clearance floor (TCF): a floor above the terrain around a runway that rises with the distance from the
//! runway. An aircraft that descends below it gets TOO LOW TERRAIN, whatever its configuration.
//!
//! The floor numbers are not published, only the labels of the figure of the Honeywell guide. The shape below is
//! reconstructed from those labels and is consistent with the slope of the terrain floor of the Honeywell patent and
//! with the examples of the later patent (a design choice, not a published curve).
//!
//! The runway field clearance floor (RFCF) is the part of the function that protects the field itself: a floor over
//! the destination runway that works from the geometric altitude instead of the radio altitude, so that it also
//! catches an aircraft that is too low over a field where the radio altitude is high (a valley approach).

use std::time::Duration;

/// Design choice: the floor is only applied within the distance where the figure of the guide ends (15 NM). Further
/// out the runways of other airports would have to take over, and the aircraft only knows its destination and
/// departure runways. A floor extended to infinity would alert on every low flight past another airport.
const FLOOR_RADIUS_NM: f64 = 15.;

/// Envelope bias factor (high integrity position data): the floor starts this far from the runway. The distance is
/// measured to the nearest point of the runway, which adds half the runway length to the bias around its centre.
const BIAS_NM: f64 = 0.25;

/// Floor labels of the Honeywell figure: 30 ft at the runway side, 400 ft at 4 NM, 400 ft out to 12 NM, 700 ft at
/// 15 NM.
const FLOOR_AT_RUNWAY_FT: f64 = 30.;
const FLOOR_PLATEAU_FT: f64 = 400.;
const PLATEAU_START_NM: f64 = 4.;
const PLATEAU_END_NM: f64 = 12.;
const FLOOR_AT_OUTER_EDGE_FT: f64 = 700.;

/// RFCF labels: it starts at the runway elevation `RFCF_OFFSET_NM` from the runway, rises to 300 ft over 1.5 NM, stays
/// there out to 5 NM.
const RFCF_OFFSET_NM: f64 = 1.;
const RFCF_RISE_DISTANCE_NM: f64 = 1.5;
const RFCF_CEILING_FT: f64 = 300.;
const RFCF_OUTER_LIMIT_NM: f64 = 5.;

/// TOO LOW TERRAIN is said again for each further decrease of 20 % in height.
const REPEAT_HEIGHT_DECREASE_FRACTION: f64 = 0.2;

/// Design choice: once the alert is on, it ends only when the aircraft is this far above the floor. A radio altitude
/// over uneven ground and the steps of the floor would otherwise start and end the alert, and say the word again, on
/// every pass of an aircraft that hovers around the floor.
const EXIT_MARGIN_FT: f64 = 20.;

/// Design choice: the word is held shorter than the sound is played back for (one second), so it is said once.
const VOICE_HOLD: Duration = Duration::from_millis(1000);

fn floor_height_ft(distance_nm: f64) -> f64 {
    let distance_from_start_nm = distance_nm - BIAS_NM;
    if distance_from_start_nm <= 0. {
        return 0.;
    }
    if distance_from_start_nm <= PLATEAU_START_NM {
        return FLOOR_AT_RUNWAY_FT
            + (FLOOR_PLATEAU_FT - FLOOR_AT_RUNWAY_FT) * distance_from_start_nm / PLATEAU_START_NM;
    }
    if distance_from_start_nm <= PLATEAU_END_NM {
        return FLOOR_PLATEAU_FT;
    }
    let outer_edge_distance_nm = FLOOR_RADIUS_NM - BIAS_NM;
    let rise_fraction = ((distance_from_start_nm - PLATEAU_END_NM)
        / (outer_edge_distance_nm - PLATEAU_END_NM))
        .min(1.);
    FLOOR_PLATEAU_FT + (FLOOR_AT_OUTER_EDGE_FT - FLOOR_PLATEAU_FT) * rise_fraction
}

fn field_clearance_floor_ft(distance_nm: f64) -> f64 {
    if distance_nm <= RFCF_OFFSET_NM || distance_nm > RFCF_OUTER_LIMIT_NM {
        return 0.;
    }
    RFCF_CEILING_FT * ((distance_nm - RFCF_OFFSET_NM) / RFCF_RISE_DISTANCE_NM).min(1.)
}

pub(super) struct FloorEvaluation {
    /// None when the radio altimeter is not valid
    pub(super) radio_altitude_ft: Option<f64>,
    pub(super) height_above_runway_ft: f64,
    pub(super) distance_to_runway_nm: f64,
    /// The field floor protects the destination runway only
    pub(super) is_destination_runway: bool,
}

impl FloorEvaluation {
    /// The height by which the aircraft is measured against the floor it is under, None when it is above both. The
    /// floors are raised by `exit_margin_ft` where they exist.
    fn height_under_floor_ft(&self, exit_margin_ft: f64) -> Option<f64> {
        if self.distance_to_runway_nm > FLOOR_RADIUS_NM {
            return None;
        }
        // Where a floor is zero there is no floor: on and next to the runway the radio altimeter reads a little below
        // zero, and the geometric height can be below the runway elevation
        let is_under =
            |height_ft: f64, floor_ft: f64| floor_ft > 0. && height_ft < floor_ft + exit_margin_ft;
        let under_clearance_floor = self.radio_altitude_ft.filter(|radio_altitude_ft| {
            is_under(
                *radio_altitude_ft,
                floor_height_ft(self.distance_to_runway_nm),
            )
        });
        let under_field_floor = (self.is_destination_runway
            && is_under(
                self.height_above_runway_ft,
                field_clearance_floor_ft(self.distance_to_runway_nm),
            ))
        .then_some(self.height_above_runway_ft);
        under_clearance_floor.or(under_field_floor)
    }
}

#[derive(Default)]
pub(super) struct TerrainClearanceFloor {
    in_alert: bool,
    height_at_last_word_ft: f64,
    word_remaining: Duration,
}

impl TerrainClearanceFloor {
    /// `evaluation` is None while the function is inhibited or has no runway.
    pub(super) fn update(&mut self, delta: Duration, evaluation: Option<&FloorEvaluation>) {
        self.word_remaining = self.word_remaining.saturating_sub(delta);

        let exit_margin_ft = if self.in_alert { EXIT_MARGIN_FT } else { 0. };
        let height_under_floor =
            evaluation.and_then(|evaluation| evaluation.height_under_floor_ft(exit_margin_ft));
        match height_under_floor {
            None => self.in_alert = false,
            Some(height_ft) => {
                // The height can be negative for the field floor (below the runway elevation), where a ratio of the
                // height would turn around: the decrease is taken from the size of the height
                let repeat_below_ft = self.height_at_last_word_ft
                    - REPEAT_HEIGHT_DECREASE_FRACTION * self.height_at_last_word_ft.abs();
                let new_word = !self.in_alert || height_ft < repeat_below_ft;
                if new_word {
                    self.word_remaining = VOICE_HOLD;
                    self.height_at_last_word_ft = height_ft;
                }
                self.in_alert = true;
            }
        }
    }

    /// The amber light stays on until the aircraft is out of the envelope.
    pub(super) fn is_alerting(&self) -> bool {
        self.in_alert
    }

    pub(super) fn is_saying_too_low_terrain(&self) -> bool {
        self.in_alert && !self.word_remaining.is_zero()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STEP: Duration = Duration::from_millis(100);

    fn at(radio_altitude_ft: f64, distance_nm: f64) -> FloorEvaluation {
        FloorEvaluation {
            radio_altitude_ft: Some(radio_altitude_ft),
            height_above_runway_ft: 5_000.,
            distance_to_runway_nm: distance_nm,
            is_destination_runway: true,
        }
    }

    #[test]
    fn the_floor_follows_the_labels_of_the_figure() {
        assert_eq!(floor_height_ft(0.), 0.);
        assert_eq!(floor_height_ft(BIAS_NM), 0.);
        assert!((floor_height_ft(BIAS_NM + 0.0001) - 30.).abs() < 0.1);
        assert!((floor_height_ft(BIAS_NM + 4.) - 400.).abs() < 0.001);
        assert_eq!(floor_height_ft(BIAS_NM + 8.), 400.);
        assert_eq!(floor_height_ft(BIAS_NM + 12.), 400.);
        assert!((floor_height_ft(15.) - 700.).abs() < 0.001);
    }

    #[test]
    fn the_floor_rises_between_the_labels() {
        let midway = floor_height_ft(BIAS_NM + 2.);
        assert!(midway > 30. && midway < 400.);
        let outer = floor_height_ft(BIAS_NM + 13.5);
        assert!(outer > 400. && outer < 700.);
    }

    #[test]
    fn the_field_floor_rises_from_the_offset_to_the_ceiling() {
        assert_eq!(field_clearance_floor_ft(0.5), 0.);
        assert_eq!(field_clearance_floor_ft(RFCF_OFFSET_NM), 0.);
        assert!((field_clearance_floor_ft(RFCF_OFFSET_NM + 0.75) - 150.).abs() < 0.001);
        assert_eq!(field_clearance_floor_ft(3.), 300.);
        assert_eq!(field_clearance_floor_ft(5.), 300.);
        assert_eq!(field_clearance_floor_ft(5.1), 0.);
    }

    #[test]
    fn below_the_floor_alerts_and_above_it_does_not() {
        let mut floor = TerrainClearanceFloor::default();
        floor.update(STEP, Some(&at(450., 6.)));
        assert!(!floor.is_alerting());
        floor.update(STEP, Some(&at(300., 6.)));
        assert!(floor.is_alerting());
    }

    #[test]
    fn the_floor_is_higher_further_from_the_runway() {
        let mut near = TerrainClearanceFloor::default();
        near.update(STEP, Some(&at(200., 2.)));
        let mut far = TerrainClearanceFloor::default();
        far.update(STEP, Some(&at(200., 8.)));
        assert!(!near.is_alerting());
        assert!(far.is_alerting());
    }

    #[test]
    fn nothing_applies_beyond_the_radius_of_the_figure() {
        let mut floor = TerrainClearanceFloor::default();
        floor.update(STEP, Some(&at(50., 15.5)));
        assert!(!floor.is_alerting());
    }

    #[test]
    fn a_missing_radio_altitude_leaves_only_the_field_floor() {
        let mut floor = TerrainClearanceFloor::default();
        let mut evaluation = at(0., 8.);
        evaluation.radio_altitude_ft = None;
        floor.update(STEP, Some(&evaluation));
        assert!(!floor.is_alerting());

        evaluation.distance_to_runway_nm = 3.;
        evaluation.height_above_runway_ft = 100.;
        floor.update(STEP, Some(&evaluation));
        assert!(floor.is_alerting());
    }

    #[test]
    fn the_field_floor_alerts_on_the_geometric_height_when_the_radio_altitude_is_high() {
        let mut floor = TerrainClearanceFloor::default();
        let evaluation = FloorEvaluation {
            radio_altitude_ft: Some(2_000.),
            height_above_runway_ft: 200.,
            distance_to_runway_nm: 3.,
            is_destination_runway: true,
        };
        floor.update(STEP, Some(&evaluation));
        assert!(floor.is_alerting());
    }

    #[test]
    fn the_field_floor_does_not_apply_to_the_departure_runway() {
        let mut floor = TerrainClearanceFloor::default();
        let evaluation = FloorEvaluation {
            radio_altitude_ft: Some(2_000.),
            height_above_runway_ft: 200.,
            distance_to_runway_nm: 3.,
            is_destination_runway: false,
        };
        floor.update(STEP, Some(&evaluation));
        assert!(!floor.is_alerting());
    }

    #[test]
    fn a_radio_altitude_below_zero_where_there_is_no_floor_does_not_alert() {
        // The radio altimeter reads a little below zero on the runway, and still does at the moment of lift-off
        let mut floor = TerrainClearanceFloor::default();
        floor.update(STEP, Some(&at(-0.12, 0.01)));
        assert!(!floor.is_alerting());
    }

    #[test]
    fn a_height_below_the_runway_where_there_is_no_field_floor_does_not_alert() {
        let mut floor = TerrainClearanceFloor::default();
        let evaluation = FloorEvaluation {
            radio_altitude_ft: None,
            height_above_runway_ft: -10.,
            distance_to_runway_nm: RFCF_OFFSET_NM / 2.,
            is_destination_runway: true,
        };
        floor.update(STEP, Some(&evaluation));
        assert!(!floor.is_alerting());
    }

    #[test]
    fn too_low_terrain_is_said_once_at_the_entry() {
        let mut floor = TerrainClearanceFloor::default();
        floor.update(STEP, Some(&at(300., 6.)));
        assert!(floor.is_saying_too_low_terrain());
        for _ in 0..15 {
            floor.update(STEP, Some(&at(300., 6.)));
        }
        assert!(floor.is_alerting());
        assert!(!floor.is_saying_too_low_terrain());
    }

    #[test]
    fn too_low_terrain_is_said_again_for_each_20_percent_decrease() {
        let mut floor = TerrainClearanceFloor::default();
        floor.update(STEP, Some(&at(300., 6.)));
        for _ in 0..15 {
            floor.update(STEP, Some(&at(300., 6.)));
        }
        floor.update(STEP, Some(&at(250., 6.)));
        assert!(!floor.is_saying_too_low_terrain(), "only 17 % lower");
        floor.update(STEP, Some(&at(239., 6.)));
        assert!(floor.is_saying_too_low_terrain(), "20 % lower");

        for _ in 0..15 {
            floor.update(STEP, Some(&at(239., 6.)));
        }
        floor.update(STEP, Some(&at(200., 6.)));
        assert!(
            !floor.is_saying_too_low_terrain(),
            "20 % of the second word height not reached"
        );
        floor.update(STEP, Some(&at(190., 6.)));
        assert!(floor.is_saying_too_low_terrain());
    }

    #[test]
    fn leaving_the_envelope_and_entering_again_says_it_again() {
        let mut floor = TerrainClearanceFloor::default();
        floor.update(STEP, Some(&at(300., 6.)));
        for _ in 0..15 {
            floor.update(STEP, Some(&at(300., 6.)));
        }
        floor.update(STEP, Some(&at(900., 6.)));
        assert!(!floor.is_alerting());
        floor.update(STEP, Some(&at(300., 6.)));
        assert!(floor.is_saying_too_low_terrain());
    }

    #[test]
    fn an_aircraft_hovering_around_the_floor_gets_one_word_and_a_steady_light() {
        // The floor 6 NM from the runway is 400 ft
        let mut floor = TerrainClearanceFloor::default();
        floor.update(STEP, Some(&at(395., 6.)));
        let mut words = 1;
        let mut was_saying = floor.is_saying_too_low_terrain();
        assert!(was_saying);
        for step in 0..60 {
            let altitude_ft = if step % 2 == 0 { 405. } else { 395. };
            floor.update(STEP, Some(&at(altitude_ft, 6.)));
            assert!(floor.is_alerting(), "the light flickers at step {step}");
            let saying = floor.is_saying_too_low_terrain();
            if saying && !was_saying {
                words += 1;
            }
            was_saying = saying;
        }
        assert_eq!(words, 1);
    }

    #[test]
    fn the_alert_ends_once_the_aircraft_is_clearly_above_the_floor() {
        let mut floor = TerrainClearanceFloor::default();
        floor.update(STEP, Some(&at(395., 6.)));
        floor.update(STEP, Some(&at(430., 6.)));
        assert!(!floor.is_alerting());
    }

    #[test]
    fn the_word_is_not_repeated_while_the_height_stays_negative_and_steady() {
        // Below the runway elevation, 2 NM out, the field floor is 100 ft: a ratio of a negative height would put
        // -110 ft "20 % below" -100 ft
        let mut floor = TerrainClearanceFloor::default();
        let evaluation = |height_ft: f64| FloorEvaluation {
            radio_altitude_ft: None,
            height_above_runway_ft: height_ft,
            distance_to_runway_nm: RFCF_OFFSET_NM + 0.5,
            is_destination_runway: true,
        };
        floor.update(STEP, Some(&evaluation(-100.)));
        for _ in 0..15 {
            floor.update(STEP, Some(&evaluation(-100.)));
        }
        floor.update(STEP, Some(&evaluation(-110.)));
        assert!(!floor.is_saying_too_low_terrain(), "only 10 % lower");
        floor.update(STEP, Some(&evaluation(-125.)));
        assert!(floor.is_saying_too_low_terrain(), "25 % lower");
    }

    #[test]
    fn inhibiting_the_function_ends_the_alert() {
        let mut floor = TerrainClearanceFloor::default();
        floor.update(STEP, Some(&at(300., 6.)));
        floor.update(STEP, None);
        assert!(!floor.is_alerting());
        assert!(!floor.is_saying_too_low_terrain());
    }
}
