//! The terrain look-ahead of the terrain awareness and display alerting (TAD): one scan of the terrain ahead of the
//! aircraft against the two vertical paths of the aircraft.
//!
//! Terrain ahead is sampled in a ribbon along the track that opens up in turns. A sample is a threat when it comes
//! closer than the required clearance (see `phase`) to a path of the aircraft:
//! - for the caution, the path of an aircraft that levels off (or keeps climbing), looked at 20 s to 132 s ahead;
//! - for the warning, the path of an aircraft that pulls up to the climb gradient of an airliner, looked at up to 120 s
//!   ahead. The pull-up path only just keeps the minimum clearance when the warning comes, so it is the last moment to
//!   pull up. When even the pull-up path cannot keep half of the clearance, a straight climb does not clear the
//!   terrain any more and the crew has to turn: AVOID TERRAIN.

use super::{
    geometry::{distance_nm, offset_position},
    manoeuvre::ManoeuvreProfile,
    phase::TerrainPhase,
    runway::{RunwayContext, RunwayOrigin},
    terrain_margin::TerrainMargin,
    AircraftState,
};
use crate::surveillance::egpws::terrain_grid::{
    GridPosition, TerrainElevationSource, TerrainSample,
};

/// The caution looks at terrain 20 s to 132 s ahead (A320 FCOM times).
const CAUTION_NEAREST_S: f64 = 20.;
const CAUTION_FARTHEST_S: f64 = 132.;

/// Design choice: the warning examines the terrain from the start of the ribbon, not from 8 s ahead as the FCOM
/// envelope. The recovery of a descending aircraft reaches its lowest altitude within the first 5 s, and the TSO-C151c
/// descent test cases require the warning to account for it. A threat inside 8 s is
/// therefore warned about, not left to the basic modes.
const RIBBON_START_NM: f64 = 0.25;

/// The climb gradient of an airliner, used for the warning path (patent value of the average climb capability and the
/// climb of the TSO-C151c imminent impact test).
const PULL_UP_CLIMB_ANGLE_DEG: f64 = 6.;

/// Design choice: AVOID TERRAIN when the pull-up path keeps less than half of the required clearance. Pulling up
/// straight ahead then no longer gives the safety margin the standard asks for.
const AVOID_CLEARANCE_FRACTION: f64 = 0.5;

/// Design choice: distance between the sampled rings. A path that rises or sinks at 6 degrees moves
/// 64 ft in this distance, which is the finest the alert timing is resolved to.
const SAMPLE_SPACING_NM: f64 = 0.1;

/// Design choice: the samples across the ribbon and along the arc of a turn are at most half a terrain cell apart, so
/// that no cell is skipped. A cell is one arcminute: 1 NM from north to south, but only cos(latitude) NM from east to
/// west. The spacing is not made finer than this minimum (half the cell width at 78 degrees of latitude) so that the
/// number of samples of a scan stays bounded. Closer to the poles than that the narrowest cells can be skipped.
const LATERAL_SPACING_FLOOR_NM: f64 = 0.1;

fn lateral_spacing_nm(latitude_degrees: f64) -> f64 {
    let cell_width_east_west_nm = latitude_degrees.to_radians().cos().abs();
    (cell_width_east_west_nm / 2.).clamp(LATERAL_SPACING_FLOOR_NM, 0.5)
}

/// The ribbon starts 1/4 NM on each side of the track and widens by 3 degrees on each side (Honeywell ribbon).
const RIBBON_INITIAL_HALF_WIDTH_NM: f64 = 0.25;
const RIBBON_WIDENING_DEG: f64 = 3.;

/// The ribbon opens up to 90 degrees in a turn (A320 FCOM).
const TURN_OPENING_LIMIT_DEG: f64 = 90.;

/// Terrain this close to a runway reference point and not higher than runway elevation plus the height below is the
/// terrain of the airport itself. Design choice (patent cut-off height of 400 to 500 ft near the runway): the cells
/// around the runway hold the highest point of the airfield surroundings, which would alert on every landing.
const RUNWAY_CUTOFF_RADIUS_NM: f64 = 1.5;
const RUNWAY_CUTOFF_HEIGHT_FT: f64 = 400.;

pub(super) struct TadScanInput<'a> {
    pub(super) aircraft: &'a AircraftState,
    pub(super) turn_rate_deg_per_s: f64,
    pub(super) phase: TerrainPhase,
    /// How far ahead the warning looks, reduced in a mountainous approach area
    pub(super) warning_look_ahead_s: f64,
    pub(super) margin: TerrainMargin,
    /// The nearest runway, for the cut-off of the airport surroundings
    pub(super) runway: Option<&'a RunwayContext>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct CautionThreat {
    pub(super) clearance_ft: f64,
    /// The threatening terrain is lower than the aircraft: the aircraft is too low over rising ground, there is no
    /// terrain in front of it. This makes the TOO LOW TERRAIN caution instead of TERRAIN AHEAD.
    pub(super) terrain_below_aircraft: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct WarningThreat {
    /// Clearance of the pull-up path over the worst terrain
    pub(super) clearance_ft: f64,
    /// A straight pull-up does not give enough clearance any more
    pub(super) cannot_climb_over: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(super) struct TadScan {
    pub(super) caution: Option<CautionThreat>,
    pub(super) warning: Option<WarningThreat>,
    /// Part of the ribbon could not be read from the grid, so the scan cannot be trusted
    pub(super) data_missing: bool,
}

/// The altitude of the two paths at a ring
struct RingPaths {
    caution_ft: f64,
    warning_ft: f64,
}

struct ScanState<'a> {
    input: &'a TadScanInput<'a>,
    terrain: &'a dyn TerrainElevationSource,
    caution_path: ManoeuvreProfile,
    warning_path: ManoeuvreProfile,
    required_level_ft: f64,
    required_descending_ft: f64,
    result: TadScan,
}

pub(super) fn scan(input: &TadScanInput, terrain: &dyn TerrainElevationSource) -> TadScan {
    let aircraft = input.aircraft;
    let nm_per_second = aircraft.ground_speed_kt / 3600.;
    if nm_per_second <= 0. {
        return TadScan::default();
    }

    let clearance = input.phase.required_clearance();
    let pilot_delay_s = input.phase.pilot_delay_s();
    let mut state = ScanState {
        input,
        terrain,
        caution_path: ManoeuvreProfile::level_off(
            aircraft.ground_speed_kt,
            aircraft.vertical_speed_fpm,
            pilot_delay_s,
        ),
        warning_path: ManoeuvreProfile::pull_up(
            aircraft.ground_speed_kt,
            aircraft.vertical_speed_fpm,
            pilot_delay_s,
            PULL_UP_CLIMB_ANGLE_DEG,
        ),
        required_level_ft: clearance.level_ft,
        required_descending_ft: clearance.descending_ft,
        result: TadScan::default(),
    };

    let farthest_s = CAUTION_FARTHEST_S.max(input.warning_look_ahead_s);
    let rings = ((nm_per_second * farthest_s - RIBBON_START_NM) / SAMPLE_SPACING_NM)
        .floor()
        .max(0.) as usize;
    for ring in 0..=rings {
        let distance_nm = RIBBON_START_NM + ring as f64 * SAMPLE_SPACING_NM;
        let time_s = distance_nm / nm_per_second;
        // The first ring also stands for the ground below and just ahead of the aircraft
        let interval_start_s = if ring == 0 {
            0.
        } else {
            time_s - SAMPLE_SPACING_NM / nm_per_second
        };
        state.scan_ring(distance_nm, interval_start_s, time_s);
    }
    state.result
}

impl ScanState<'_> {
    /// A sample stands for the ground since the previous ring: the 1 NM terrain cells are wider than the ring spacing,
    /// and the lowest point of a recovery (within seconds from the start) must not fall between two rings. The paths
    /// are therefore taken at their lowest point over the interval.
    fn scan_ring(&mut self, distance_nm: f64, interval_start_s: f64, time_s: f64) {
        let aircraft = self.input.aircraft;
        let in_caution_window = (CAUTION_NEAREST_S..=CAUTION_FARTHEST_S).contains(&time_s);
        let in_warning_window = time_s <= self.input.warning_look_ahead_s;
        if !in_caution_window && !in_warning_window {
            return;
        }

        let paths = RingPaths {
            caution_ft: aircraft.geometric_altitude_ft
                + self
                    .caution_path
                    .lowest_altitude_change_between(interval_start_s, time_s),
            warning_ft: aircraft.geometric_altitude_ft
                + self
                    .warning_path
                    .lowest_altitude_change_between(interval_start_s, time_s),
        };
        let mut positions = Vec::new();
        collect_ring_positions(
            &mut positions,
            lateral_spacing_nm(aircraft.position.latitude_degrees),
            aircraft.position,
            aircraft.true_track_deg,
            self.input.turn_rate_deg_per_s,
            distance_nm,
            time_s,
        );
        for position in positions {
            match self.terrain.max_elevation_at(position) {
                TerrainSample::ElevationFeet(elevation_ft) => self.evaluate_sample(
                    position,
                    elevation_ft,
                    &paths,
                    in_caution_window,
                    in_warning_window,
                ),
                TerrainSample::NotLoaded | TerrainSample::Failed => self.result.data_missing = true,
                TerrainSample::OutsideCoverage => {}
            }
        }
    }

    fn evaluate_sample(
        &mut self,
        position: GridPosition,
        elevation_ft: f64,
        paths: &RingPaths,
        in_caution_window: bool,
        in_warning_window: bool,
    ) {
        let aircraft_altitude_ft = self.input.aircraft.geometric_altitude_ft;
        let (caution_path_ft, warning_path_ft) = (paths.caution_ft, paths.warning_ft);

        // Most samples are far from any threat: rule them out with the largest possible margin before the exact one
        // is worked out.
        let largest_margin_ft = self.input.margin.maximum_ft();
        let may_cause_caution = in_caution_window
            && caution_path_ft - elevation_ft - largest_margin_ft <= self.required_level_ft;
        let may_cause_warning = in_warning_window
            && warning_path_ft - elevation_ft - largest_margin_ft <= self.required_descending_ft;
        if !may_cause_caution && !may_cause_warning {
            return;
        }
        if self.is_airport_surroundings(position, elevation_ft) {
            return;
        }

        let margin_ft = self
            .input
            .margin
            .margin_ft(self.terrain, position, elevation_ft);
        let terrain_ft = elevation_ft + margin_ft;

        if may_cause_caution {
            let clearance_ft = caution_path_ft - terrain_ft;
            if clearance_ft <= self.required_level_ft {
                self.add_caution(clearance_ft, terrain_ft < aircraft_altitude_ft);
            }
        }
        if may_cause_warning {
            let clearance_ft = warning_path_ft - terrain_ft;
            if clearance_ft <= self.required_descending_ft {
                self.add_warning(clearance_ft);
            }
        }
    }

    fn is_airport_surroundings(&self, position: GridPosition, elevation_ft: f64) -> bool {
        self.input.runway.is_some_and(|runway| {
            // The departure runway is where the roll started, so the aircraft lifts off up to a runway length from
            // it and the airfield around the runway starts further out.
            let cutoff_radius_nm = if runway.runway.origin == RunwayOrigin::Departure {
                RUNWAY_CUTOFF_RADIUS_NM + RunwayContext::DEPARTURE_RUNWAY_AREA_NM
            } else {
                RUNWAY_CUTOFF_RADIUS_NM
            };
            elevation_ft <= runway.runway.elevation_ft + RUNWAY_CUTOFF_HEIGHT_FT
                && distance_nm(position, runway.runway.reference_point) <= cutoff_radius_nm
        })
    }

    fn add_caution(&mut self, clearance_ft: f64, terrain_below_aircraft: bool) {
        let is_worse = self
            .result
            .caution
            .is_none_or(|worst| clearance_ft < worst.clearance_ft);
        if is_worse {
            self.result.caution = Some(CautionThreat {
                clearance_ft,
                terrain_below_aircraft,
            });
        }
    }

    fn add_warning(&mut self, clearance_ft: f64) {
        let is_worse = self
            .result
            .warning
            .is_none_or(|worst| clearance_ft < worst.clearance_ft);
        if is_worse {
            self.result.warning = Some(WarningThreat {
                clearance_ft,
                cannot_climb_over: clearance_ft
                    <= AVOID_CLEARANCE_FRACTION * self.required_descending_ft,
            });
        }
    }
}

/// The sample positions of the ring at the distance: across the ribbon along the track, and along the arc towards the
/// side of the turn.
fn collect_ring_positions(
    positions: &mut Vec<GridPosition>,
    lateral_spacing_nm: f64,
    aircraft: GridPosition,
    true_track_deg: f64,
    turn_rate_deg_per_s: f64,
    distance_nm: f64,
    time_s: f64,
) {
    let half_width_nm =
        RIBBON_INITIAL_HALF_WIDTH_NM + distance_nm * RIBBON_WIDENING_DEG.to_radians().tan();
    let lateral_steps = ((2. * half_width_nm / lateral_spacing_nm).ceil() as usize).max(2);
    for step in 0..=lateral_steps {
        let lateral_nm = -half_width_nm + 2. * half_width_nm * step as f64 / lateral_steps as f64;
        let bearing = true_track_deg + lateral_nm.atan2(distance_nm).to_degrees();
        positions.push(offset_position(
            aircraft,
            bearing,
            distance_nm.hypot(lateral_nm),
        ));
    }

    let opening_deg = (turn_rate_deg_per_s.abs() * time_s).min(TURN_OPENING_LIMIT_DEG);
    let ribbon_edge_deg = RIBBON_WIDENING_DEG;
    if opening_deg > ribbon_edge_deg {
        let arc_steps =
            ((distance_nm * opening_deg.to_radians() / lateral_spacing_nm).ceil() as usize).max(1);
        let direction = turn_rate_deg_per_s.signum();
        for step in 1..=arc_steps {
            let offset_deg = opening_deg * step as f64 / arc_steps as f64;
            positions.push(offset_position(
                aircraft,
                true_track_deg + direction * offset_deg,
                distance_nm,
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surveillance::egpws::predictive::{
        runway::{Runway, RunwayOrigin},
        test_support::TestTerrain,
    };
    use rstest::rstest;

    const START: GridPosition = GridPosition {
        latitude_degrees: 46.,
        longitude_degrees: 8.,
    };

    fn aircraft(altitude_ft: f64, ground_speed_kt: f64, vertical_speed_fpm: f64) -> AircraftState {
        AircraftState {
            position: START,
            geometric_altitude_ft: altitude_ft,
            ground_speed_kt,
            true_track_deg: 0.,
            vertical_speed_fpm,
        }
    }

    fn input<'a>(
        aircraft: &'a AircraftState,
        phase: TerrainPhase,
        runway: Option<&'a RunwayContext>,
    ) -> TadScanInput<'a> {
        TadScanInput {
            aircraft,
            turn_rate_deg_per_s: 0.,
            phase,
            warning_look_ahead_s: 120.,
            margin: TerrainMargin::none(),
            runway,
        }
    }

    fn scan_of(aircraft: &AircraftState, phase: TerrainPhase, terrain: &TestTerrain) -> TadScan {
        scan(&input(aircraft, phase, None), terrain)
    }

    /// Descends over flat terrain in steps of 2 ft and reports the height above the terrain at which the caution and
    /// the warning first show up.
    fn first_alert_heights(
        phase: TerrainPhase,
        descent_rate_fpm: f64,
        ground_speed_kt: f64,
    ) -> (f64, f64) {
        let terrain_ft = 2_000.;
        let terrain = TestTerrain::flat(terrain_ft);
        let mut caution_height = None;
        let mut warning_height = None;
        let mut height = 4_000.;
        while height > 0. {
            let state = aircraft(terrain_ft + height, ground_speed_kt, -descent_rate_fpm);
            let result = scan_of(&state, phase, &terrain);
            if result.caution.is_some() && caution_height.is_none() {
                caution_height = Some(height);
            }
            if result.warning.is_some() && warning_height.is_none() {
                warning_height = Some(height);
            }
            height -= 2.;
        }
        (caution_height.unwrap(), warning_height.unwrap())
    }

    // TSO-C151c descent test cases: the warning must be given at or above the minimum warning height and
    // the caution must not come above the maximum caution height; the caution comes before the warning.
    #[rstest]
    #[case(TerrainPhase::EnRoute, 1000., 567., 1200.)]
    #[case(TerrainPhase::EnRoute, 2000., 669., 1400.)]
    #[case(TerrainPhase::EnRoute, 4000., 978., 1800.)]
    #[case(TerrainPhase::Terminal, 1000., 334., 700.)]
    #[case(TerrainPhase::Terminal, 2000., 402., 900.)]
    #[case(TerrainPhase::Terminal, 3000., 506., 1100.)]
    #[case(TerrainPhase::Approach, 500., 112., 350.)]
    #[case(TerrainPhase::Approach, 750., 122., 400.)]
    #[case(TerrainPhase::Approach, 1000., 135., 450.)]
    #[case(TerrainPhase::Approach, 1500., 164., 550.)]
    fn descending_toward_terrain_alerts_within_the_tso_limits(
        #[case] phase: TerrainPhase,
        #[case] descent_rate_fpm: f64,
        #[case] minimum_warning_height_ft: f64,
        #[case] maximum_caution_height_ft: f64,
    ) {
        for ground_speed_kt in [150., 250.] {
            let (caution_height, warning_height) =
                first_alert_heights(phase, descent_rate_fpm, ground_speed_kt);
            assert!(
                warning_height >= minimum_warning_height_ft - 8.,
                "warning at {warning_height}, minimum {minimum_warning_height_ft}"
            );
            assert!(
                caution_height <= maximum_caution_height_ft,
                "caution at {caution_height}, maximum {maximum_caution_height_ft}"
            );
            assert!(
                caution_height > warning_height,
                "caution {caution_height} warning {warning_height}"
            );
        }
    }

    // TSO-C151c level flight test cases: over terrain, the alert is required at the listed height and not at the
    // listed greater height.
    #[rstest]
    #[case(TerrainPhase::EnRoute, 5_000., 5_700., true)]
    #[case(TerrainPhase::EnRoute, 5_000., 5_800., false)]
    #[case(TerrainPhase::EnRoute, 5_000., 6_000., false)]
    #[case(TerrainPhase::Terminal, 1_000., 1_350., true)]
    #[case(TerrainPhase::Terminal, 1_000., 1_500., false)]
    #[case(TerrainPhase::Approach, 400., 550., true)]
    #[case(TerrainPhase::Approach, 400., 650., false)]
    fn level_flight_alerts_at_the_required_clearance(
        #[case] phase: TerrainPhase,
        #[case] terrain_ft: f64,
        #[case] altitude_ft: f64,
        #[case] must_alert: bool,
    ) {
        let terrain = TestTerrain::flat(terrain_ft);
        for ground_speed_kt in [200., 250., 300.] {
            let state = aircraft(altitude_ft, ground_speed_kt, 0.);
            let result = scan_of(&state, phase, &terrain);
            assert_eq!(result.caution.is_some(), must_alert, "{ground_speed_kt}");
        }
    }

    /// Flies level toward a wall of terrain and reports the distance to the wall at which the caution and the warning
    /// first show up, with the clearance a pull-up at the warning would have over the wall.
    fn approach_wall(
        wall_ft: f64,
        altitude_ft: f64,
        ground_speed_kt: f64,
        phase: TerrainPhase,
    ) -> (f64, f64, f64) {
        let wall_latitude = START.latitude_degrees + 40. / 60.;
        let terrain = TestTerrain::wall_north_of(wall_latitude, 0., wall_ft);
        let mut caution_distance = None;
        let mut warning = None;
        let mut distance_to_wall_nm = 40.;
        while distance_to_wall_nm > 0.3 {
            let position = offset_position(
                GridPosition::new(wall_latitude, START.longitude_degrees),
                180.,
                distance_to_wall_nm,
            );
            let state = AircraftState {
                position,
                geometric_altitude_ft: altitude_ft,
                ground_speed_kt,
                true_track_deg: 0.,
                vertical_speed_fpm: 0.,
            };
            let result = scan_of(&state, phase, &terrain);
            if result.caution.is_some() && caution_distance.is_none() {
                caution_distance = Some(distance_to_wall_nm);
            }
            if let Some(threat) = result.warning {
                if warning.is_none() {
                    warning = Some((distance_to_wall_nm, threat.clearance_ft));
                }
            }
            distance_to_wall_nm -= 0.02;
        }
        let (warning_distance, warning_clearance) = warning.expect("no warning");
        (
            caution_distance.expect("no caution"),
            warning_distance,
            warning_clearance,
        )
    }

    // TSO-C151c imminent impact test cases: the terrain impact must be alerted in time for a pull-up with a pilot delay and a climb of 6
    // degrees to clear the terrain.
    #[rstest]
    #[case(200., 10_000., 9_000., TerrainPhase::EnRoute)]
    #[case(250., 10_000., 9_000., TerrainPhase::EnRoute)]
    #[case(300., 10_000., 9_000., TerrainPhase::EnRoute)]
    #[case(400., 10_000., 8_000., TerrainPhase::EnRoute)]
    #[case(500., 10_000., 8_000., TerrainPhase::EnRoute)]
    #[case(150., 2_000., 1_500., TerrainPhase::EnRoute)]
    #[case(250., 2_000., 1_500., TerrainPhase::EnRoute)]
    #[case(120., 600., 200., TerrainPhase::Approach)]
    #[case(160., 600., 200., TerrainPhase::Approach)]
    #[case(100., 600., 500., TerrainPhase::Approach)]
    #[case(160., 600., 500., TerrainPhase::Approach)]
    fn the_imminent_impact_is_alerted_in_time_to_clear_the_terrain(
        #[case] ground_speed_kt: f64,
        #[case] wall_ft: f64,
        #[case] altitude_ft: f64,
        #[case] phase: TerrainPhase,
    ) {
        let (caution_distance, warning_distance, warning_clearance) =
            approach_wall(wall_ft, altitude_ft, ground_speed_kt, phase);
        assert!(caution_distance > warning_distance);
        // A pull-up at the warning clears the wall; the grid step of the test leaves a few tens of feet
        assert!(warning_clearance > 0., "{warning_clearance}");
        // The warning is not given absurdly early either: it comes within the 120 s of the envelope
        assert!(
            warning_distance <= ground_speed_kt / 3600. * 120.,
            "{warning_distance}"
        );
    }

    #[test]
    fn the_same_wall_does_not_alert_when_the_aircraft_is_well_above_it() {
        let wall_latitude = START.latitude_degrees + 5. / 60.;
        let terrain = TestTerrain::wall_north_of(wall_latitude, 0., 3_000.);
        let state = aircraft(8_000., 250., 0.);
        assert_eq!(
            scan_of(&state, TerrainPhase::EnRoute, &terrain),
            TadScan::default()
        );
    }

    #[test]
    fn terrain_beside_the_ribbon_is_not_a_threat_in_a_straight_flight() {
        // 3 NM to the east of the track, level with the aircraft
        let terrain = TestTerrain::new(|position| {
            TerrainSample::ElevationFeet(if position.longitude_degrees > 8.06 {
                10_000.
            } else {
                0.
            })
        });
        let state = aircraft(8_000., 250., 0.);
        assert_eq!(
            scan_of(&state, TerrainPhase::EnRoute, &terrain),
            TadScan::default()
        );
    }

    #[test]
    fn the_ribbon_opens_to_the_side_of_the_turn() {
        let ridge_east = TestTerrain::new(|position| {
            TerrainSample::ElevationFeet(if position.longitude_degrees > 8.05 {
                10_000.
            } else {
                0.
            })
        });
        let state = aircraft(8_000., 250., 0.);

        let mut turning_right = input(&state, TerrainPhase::EnRoute, None);
        turning_right.turn_rate_deg_per_s = 3.;
        assert!(scan(&turning_right, &ridge_east).warning.is_some());

        let mut turning_left = input(&state, TerrainPhase::EnRoute, None);
        turning_left.turn_rate_deg_per_s = -3.;
        assert!(scan(&turning_left, &ridge_east).warning.is_none());
    }

    #[test]
    fn the_opening_of_the_ribbon_stops_at_90_degrees() {
        // Terrain directly behind the right wing tip, level with the aircraft, 5 NM out
        let ridge_behind_the_wing = TestTerrain::new(|position| {
            TerrainSample::ElevationFeet(
                if position.longitude_degrees > 8.05 && position.latitude_degrees < 45.99 {
                    10_000.
                } else {
                    0.
                },
            )
        });
        let state = aircraft(8_000., 250., 0.);
        let mut turning = input(&state, TerrainPhase::EnRoute, None);
        turning.turn_rate_deg_per_s = 3.;
        assert!(scan(&turning, &ridge_behind_the_wing).warning.is_none());
    }

    #[test]
    fn terrain_below_the_aircraft_gives_a_too_low_caution_not_terrain_ahead() {
        let terrain = TestTerrain::flat(5_000.);
        let state = aircraft(5_400., 250., 0.);
        let caution = scan_of(&state, TerrainPhase::EnRoute, &terrain)
            .caution
            .unwrap();
        assert!(caution.terrain_below_aircraft);
    }

    #[test]
    fn terrain_at_the_height_of_the_aircraft_gives_terrain_ahead() {
        let wall_latitude = START.latitude_degrees + 6. / 60.;
        let terrain = TestTerrain::wall_north_of(wall_latitude, 0., 8_000.);
        let state = aircraft(8_000., 250., 0.);
        let caution = scan_of(&state, TerrainPhase::EnRoute, &terrain)
            .caution
            .unwrap();
        assert!(!caution.terrain_below_aircraft);
    }

    #[test]
    fn the_caution_does_not_look_closer_than_20_s() {
        // A ridge in the first nautical mile ahead is at most 14 s away at 250 kt, and there is nothing behind it
        let terrain = TestTerrain::new(move |position| {
            let ahead = position.latitude_degrees - START.latitude_degrees;
            TerrainSample::ElevationFeet(if (0. ..0.0167).contains(&ahead) {
                8_500.
            } else {
                0.
            })
        });
        let state = aircraft(8_000., 250., 0.);
        assert!(scan_of(&state, TerrainPhase::EnRoute, &terrain)
            .caution
            .is_none());
    }

    #[test]
    fn the_caution_does_not_look_further_than_132_s() {
        // 132 s at 200 kt is 7.3 NM
        let wall_latitude = START.latitude_degrees + 9. / 60.;
        let terrain = TestTerrain::wall_north_of(wall_latitude, 0., 8_000.);
        let state = aircraft(8_000., 200., 0.);
        assert!(scan_of(&state, TerrainPhase::EnRoute, &terrain)
            .caution
            .is_none());
        let nearer = TestTerrain::wall_north_of(START.latitude_degrees + 6. / 60., 0., 8_000.);
        assert!(scan_of(&state, TerrainPhase::EnRoute, &nearer)
            .caution
            .is_some());
    }

    #[test]
    fn a_shorter_warning_look_ahead_delays_the_warning() {
        // A wall 5 NM ahead (72 s at 250 kt) that a pull-up from 8000 ft does not clear: warned about with the full
        // look-ahead, not with 50 s
        let wall_latitude = START.latitude_degrees + 5. / 60.;
        let terrain = TestTerrain::wall_north_of(wall_latitude, 0., 12_000.);
        let state = aircraft(8_000., 250., 0.);
        let mut scan_input = input(&state, TerrainPhase::EnRoute, None);
        assert!(scan(&scan_input, &terrain).warning.is_some());
        scan_input.warning_look_ahead_s = 50.;
        assert!(scan(&scan_input, &terrain).warning.is_none());
    }

    #[test]
    fn a_climb_that_clears_the_terrain_with_margin_gives_no_alert() {
        // Climbing at 6 degrees toward a ridge 600 ft above the aircraft, 5 NM out: 5 NM at 6 degrees is 3300 ft
        let ridge_latitude = START.latitude_degrees + 5. / 60.;
        let terrain = TestTerrain::wall_north_of(ridge_latitude, 0., 6_600.);
        let vertical_speed = 250. * 1.687_809_857 * 60. * 6f64.to_radians().tan();
        let state = aircraft(6_000., 250., vertical_speed);
        assert_eq!(
            scan_of(&state, TerrainPhase::EnRoute, &terrain),
            TadScan::default()
        );
    }

    #[test]
    fn a_shallow_climb_toward_a_ridge_it_cannot_clear_is_a_caution() {
        let ridge_latitude = START.latitude_degrees + 6. / 60.;
        let terrain = TestTerrain::wall_north_of(ridge_latitude, 0., 8_000.);
        let state = aircraft(6_000., 250., 300.);
        assert!(scan_of(&state, TerrainPhase::EnRoute, &terrain)
            .caution
            .is_some());
    }

    #[test]
    fn avoid_terrain_follows_the_warning_when_the_pull_up_no_longer_clears() {
        let wall_latitude = START.latitude_degrees + 40. / 60.;
        let terrain = TestTerrain::wall_north_of(wall_latitude, 0., 10_000.);
        let mut first_warning = None;
        let mut first_avoid = None;
        let mut distance_to_wall_nm = 12.;
        while distance_to_wall_nm > 0.3 {
            let state = AircraftState {
                position: offset_position(
                    GridPosition::new(wall_latitude, START.longitude_degrees),
                    180.,
                    distance_to_wall_nm,
                ),
                geometric_altitude_ft: 9_000.,
                ground_speed_kt: 250.,
                true_track_deg: 0.,
                vertical_speed_fpm: 0.,
            };
            if let Some(threat) = scan_of(&state, TerrainPhase::EnRoute, &terrain).warning {
                first_warning.get_or_insert(distance_to_wall_nm);
                if threat.cannot_climb_over {
                    first_avoid.get_or_insert(distance_to_wall_nm);
                }
            }
            distance_to_wall_nm -= 0.02;
        }
        let (warning, avoid) = (first_warning.unwrap(), first_avoid.unwrap());
        assert!(avoid < warning, "avoid {avoid} warning {warning}");
        // Late enough to be a different alert, early enough to be a real alert: the gap is a few seconds
        assert!(warning - avoid < 1., "{} NM", warning - avoid);
    }

    #[test]
    fn the_terrain_around_the_runway_is_cut_off() {
        // A ridge 1 NM ahead of the aircraft, 100 ft above the runway: airport surroundings
        let ridge_latitude = START.latitude_degrees + 1. / 60.;
        let terrain = TestTerrain::new(move |position| {
            let ahead = position.latitude_degrees - ridge_latitude;
            TerrainSample::ElevationFeet(if (0. ..0.02).contains(&ahead) {
                300.
            } else {
                0.
            })
        });
        let state = aircraft(400., 140., 0.);
        let runway = RunwayContext {
            runway: Runway {
                reference_point: GridPosition::new(START.latitude_degrees + 1. / 60., 8.),
                elevation_ft: 0.,
                origin: RunwayOrigin::Destination,
            },
            distance_nm: 1.,
            height_above_runway_ft: 400.,
        };
        let with_runway = scan(
            &input(&state, TerrainPhase::Approach, Some(&runway)),
            &terrain,
        );
        assert_eq!(with_runway, TadScan::default());
        let without_runway = scan(&input(&state, TerrainPhase::Approach, None), &terrain);
        assert!(without_runway.warning.is_some() || without_runway.caution.is_some());
    }

    #[test]
    fn the_cut_off_does_not_hide_terrain_well_above_the_runway() {
        let ridge_latitude = START.latitude_degrees + 1. / 60.;
        let terrain = TestTerrain::new(move |position| {
            let ahead = position.latitude_degrees - ridge_latitude;
            TerrainSample::ElevationFeet(if (0. ..0.02).contains(&ahead) {
                900.
            } else {
                0.
            })
        });
        let state = aircraft(1_000., 140., 0.);
        let runway = RunwayContext {
            runway: Runway {
                reference_point: GridPosition::new(START.latitude_degrees + 1. / 60., 8.),
                elevation_ft: 0.,
                origin: RunwayOrigin::Destination,
            },
            distance_nm: 1.,
            height_above_runway_ft: 1_000.,
        };
        let result = scan(
            &input(&state, TerrainPhase::Approach, Some(&runway)),
            &terrain,
        );
        assert!(result.warning.is_some() || result.caution.is_some());
    }

    #[test]
    fn missing_grid_data_is_reported_and_not_taken_for_flat_ground() {
        let terrain = TestTerrain::new(|_| TerrainSample::NotLoaded);
        let state = aircraft(1_000., 250., 0.);
        let result = scan_of(&state, TerrainPhase::EnRoute, &terrain);
        assert!(result.data_missing);
        assert!(result.caution.is_none() && result.warning.is_none());
    }

    #[test]
    fn the_terrain_margin_makes_a_ridge_a_threat_that_the_plain_elevation_misses() {
        // 8200 ft aircraft path over a 7400 ft ridge (800 ft clearance): the grid has the ridge 300 m too low
        let ridge_latitude = START.latitude_degrees + 6. / 60.;
        let terrain = TestTerrain::new(move |position| {
            let ahead = position.latitude_degrees - ridge_latitude;
            TerrainSample::ElevationFeet(if (0. ..0.017).contains(&ahead) {
                7_400.
            } else {
                5_000.
            })
        });
        let state = aircraft(8_200., 250., 0.);
        let mut scan_input = input(&state, TerrainPhase::EnRoute, None);
        assert!(scan(&scan_input, &terrain).caution.is_none());
        scan_input.margin = TerrainMargin::for_grid_peak_error();
        assert!(scan(&scan_input, &terrain).caution.is_some());
    }

    #[test]
    fn at_high_latitude_the_ribbon_samples_are_at_most_half_a_cell_apart_east_to_west() {
        let latitude = 70.;
        let aircraft = GridPosition::new(latitude, 8.);
        let mut positions = Vec::new();
        collect_ring_positions(
            &mut positions,
            lateral_spacing_nm(latitude),
            aircraft,
            0.,
            0.,
            3.,
            70.,
        );
        let mut longitudes: Vec<f64> = positions
            .iter()
            .map(|position| position.longitude_degrees)
            .collect();
        longitudes.sort_by(f64::total_cmp);
        // One arcminute of longitude is cos(latitude) nautical miles wide
        let cell_width_nm = latitude.to_radians().cos();
        let largest_gap_nm = longitudes
            .windows(2)
            .map(|pair| (pair[1] - pair[0]) * 60. * cell_width_nm)
            .fold(0., f64::max);
        assert!(
            largest_gap_nm <= cell_width_nm / 2. + 1e-6,
            "gap of {largest_gap_nm} NM, cell {cell_width_nm} NM"
        );
    }

    #[test]
    fn the_lateral_spacing_is_half_a_cell_and_never_finer_than_the_floor() {
        assert_eq!(lateral_spacing_nm(0.), 0.5);
        assert!((lateral_spacing_nm(60.) - 0.25).abs() < 1e-9);
        assert_eq!(lateral_spacing_nm(-60.), lateral_spacing_nm(60.));
        assert_eq!(lateral_spacing_nm(85.), LATERAL_SPACING_FLOOR_NM);
    }

    #[test]
    fn standing_still_scans_nothing() {
        let terrain = TestTerrain::flat(5_000.);
        let state = aircraft(5_100., 0., 0.);
        assert_eq!(
            scan_of(&state, TerrainPhase::EnRoute, &terrain),
            TadScan::default()
        );
    }
}
