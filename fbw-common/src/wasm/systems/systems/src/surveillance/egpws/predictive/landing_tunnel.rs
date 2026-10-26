//! The runway convergence inhibit of the predictive alerts. On entering the approach sector of the runway the aircraft
//! is expected to get close to the terrain around the runway, so the alerts are inhibited as long as three criteria
//! hold: the aircraft is configured for landing, it is inside the landing tunnel above the approach path, and its
//! track converges on the runway.
//!
//! With the runway known the tunnel is the generic one of the airports that are not flagged as terrain challenging:
//! - seen from the side, its floor is the runway elevation out to 0.96 NM before the threshold, then a plane rising at
//!   2.6 degrees; its ceiling is 5000 ft above the far end of the runway, then a plane rising at 8 degrees;
//! - seen from above, it is up to 0.52 NM either side of the runway centre line, and from about halfway out it widens
//!   to up to 2.79 NM at the edge of the 2.7 NM approach sector. The two widths depend on the lateral position
//!   accuracy; the widest ones are used.
//!
//! With only a point of the runway known the tunnel is a design choice around that point.

use super::{
    geometry::{bearing_deg, signed_angle_difference_deg},
    runway::{Runway, RunwayContext, FEET_PER_NAUTICAL_MILE},
};
use crate::surveillance::egpws::terrain_grid::GridPosition;

/// Approach sector radius, 5 km.
const APPROACH_SECTOR_NM: f64 = 2.7;

/// Design choice: the tunnel floor lies a little below the published one so that an error of the geometric altitude
/// does not open a gap in the tunnel at the threshold.
const ALTITUDE_ERROR_ALLOWANCE_FT: f64 = 150.;

const FLOOR_LEVEL_DISTANCE_NM: f64 = 0.96;
const FLOOR_SLOPE_DEG: f64 = 2.6;
const CEILING_AT_RUNWAY_END_FT: f64 = 5_000.;
const CEILING_SLOPE_DEG: f64 = 8.;
const HALF_WIDTH_NEAR_RUNWAY_NM: f64 = 0.52;
const HALF_WIDTH_AT_SECTOR_EDGE_NM: f64 = 2.79;
/// Design choice: the published figure shows the tunnel widening from about halfway out on a curve that steepens
/// towards the sector edge, without numbers; a parabola from 1.5 NM fits it.
const WIDENING_START_NM: f64 = 1.5;

/// Design choice: the track converges on the runway when it is within this angle of the runway direction (or of the
/// bearing to the runway point when only that is known). Wide enough for a final with an offset or a curved approach
/// path, narrow enough to exclude an aircraft that only passes the airport.
const CONVERGENCE_TRACK_TOLERANCE_DEG: f64 = 45.;

/// Design choice for a runway known by one point only: the tunnel ceiling is a 400 ft base plus 400 ft per nautical
/// mile, which is 1480 ft at the edge of the sector. A 3 degree approach path is at 320 ft per nautical mile, so the
/// tunnel is wide enough for a high or steep approach but not for an aircraft that flies over the sector level at
/// 3000 ft.
const POINT_TUNNEL_CEILING_BASE_FT: f64 = 400.;
const POINT_TUNNEL_CEILING_PER_NM_FT: f64 = 400.;

/// Design choice for a runway known by one point only: over the runway itself the bearing to the point means nothing
/// (the aircraft is on it, in the flare or on the rollout), so the convergence criterion is waived there.
const POINT_OVER_RUNWAY_RADIUS_NM: f64 = 0.5;

pub(super) struct LandingTunnelInputs {
    pub(super) aircraft_position: GridPosition,
    pub(super) true_track_deg: f64,
    pub(super) gear_downlocked: bool,
    pub(super) landing_flaps: bool,
}

/// True while the alerts must be inhibited: all three criteria hold.
pub(super) fn is_inhibiting(runway: &RunwayContext, aircraft: &LandingTunnelInputs) -> bool {
    if !is_landing_configuration(aircraft) {
        return false;
    }
    match runway.runway.reciprocal() {
        // A runway is landed on in either direction
        Some(reciprocal) => [runway.runway, reciprocal].iter().any(|direction| {
            is_inside_runway_tunnel(direction, runway.height_above_runway_ft, aircraft)
        }),
        None => {
            runway.distance_nm <= APPROACH_SECTOR_NM
                && is_inside_point_tunnel(runway)
                && is_track_converging_on_point(runway, aircraft)
        }
    }
}

fn is_landing_configuration(aircraft: &LandingTunnelInputs) -> bool {
    aircraft.gear_downlocked && aircraft.landing_flaps
}

fn is_inside_runway_tunnel(
    runway: &Runway,
    height_above_runway_ft: f64,
    aircraft: &LandingTunnelInputs,
) -> bool {
    let (Some(geometry), Some(coordinates)) = (
        runway.geometry,
        runway.coordinates_of(aircraft.aircraft_position),
    ) else {
        return false;
    };
    let before_threshold_nm = -coordinates.along_nm;
    let past_far_end_nm = coordinates.along_nm - runway.length_nm();
    if before_threshold_nm > APPROACH_SECTOR_NM || past_far_end_nm > 0. {
        return false;
    }
    if coordinates.across_nm.abs() > tunnel_half_width_nm(before_threshold_nm) {
        return false;
    }
    let floor_ft = (before_threshold_nm - FLOOR_LEVEL_DISTANCE_NM).max(0.)
        * FEET_PER_NAUTICAL_MILE
        * FLOOR_SLOPE_DEG.to_radians().tan()
        - ALTITUDE_ERROR_ALLOWANCE_FT;
    let ceiling_ft = CEILING_AT_RUNWAY_END_FT
        + (-past_far_end_nm) * FEET_PER_NAUTICAL_MILE * CEILING_SLOPE_DEG.to_radians().tan();
    (floor_ft..=ceiling_ft).contains(&height_above_runway_ft)
        && signed_angle_difference_deg(aircraft.true_track_deg, geometry.true_heading_deg).abs()
            <= CONVERGENCE_TRACK_TOLERANCE_DEG
}

fn tunnel_half_width_nm(before_threshold_nm: f64) -> f64 {
    let widening = ((before_threshold_nm - WIDENING_START_NM)
        / (APPROACH_SECTOR_NM - WIDENING_START_NM))
        .clamp(0., 1.);
    HALF_WIDTH_NEAR_RUNWAY_NM
        + (HALF_WIDTH_AT_SECTOR_EDGE_NM - HALF_WIDTH_NEAR_RUNWAY_NM) * widening.powi(2)
}

fn is_inside_point_tunnel(runway: &RunwayContext) -> bool {
    let ceiling =
        POINT_TUNNEL_CEILING_BASE_FT + POINT_TUNNEL_CEILING_PER_NM_FT * runway.distance_nm;
    (-ALTITUDE_ERROR_ALLOWANCE_FT..=ceiling).contains(&runway.height_above_runway_ft)
}

fn is_track_converging_on_point(runway: &RunwayContext, aircraft: &LandingTunnelInputs) -> bool {
    if runway.distance_nm <= POINT_OVER_RUNWAY_RADIUS_NM {
        return true;
    }
    let bearing_to_runway = bearing_deg(aircraft.aircraft_position, runway.runway.reference_point);
    signed_angle_difference_deg(aircraft.true_track_deg, bearing_to_runway).abs()
        <= CONVERGENCE_TRACK_TOLERANCE_DEG
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surveillance::egpws::predictive::{
        geometry::offset_position,
        runway::{Runway, RunwayGeometry, RunwayOrigin},
    };

    const RUNWAY_POINT: GridPosition = GridPosition {
        latitude_degrees: 47.,
        longitude_degrees: 8.,
    };

    /// An aircraft on a final from the south, `distance_nm` from the runway reference point.
    fn on_final(distance_nm: f64, height_ft: f64) -> (RunwayContext, LandingTunnelInputs) {
        let position = offset_position(RUNWAY_POINT, 180., distance_nm);
        (
            RunwayContext {
                runway: Runway {
                    reference_point: RUNWAY_POINT,
                    elevation_ft: 0.,
                    origin: RunwayOrigin::Destination,
                    geometry: None,
                },
                distance_nm,
                height_above_runway_ft: height_ft,
            },
            LandingTunnelInputs {
                aircraft_position: position,
                true_track_deg: 0.,
                gear_downlocked: true,
                landing_flaps: true,
            },
        )
    }

    #[test]
    fn a_normal_final_is_inhibited() {
        let (runway, aircraft) = on_final(2., 640.);
        assert!(is_inhibiting(&runway, &aircraft));
    }

    #[test]
    fn outside_the_approach_sector_nothing_is_inhibited() {
        let (runway, aircraft) = on_final(3., 950.);
        assert!(!is_inhibiting(&runway, &aircraft));
    }

    #[test]
    fn the_landing_configuration_is_needed() {
        let (runway, mut aircraft) = on_final(2., 640.);
        aircraft.gear_downlocked = false;
        assert!(!is_inhibiting(&runway, &aircraft));

        aircraft.gear_downlocked = true;
        aircraft.landing_flaps = false;
        assert!(!is_inhibiting(&runway, &aircraft));
    }

    #[test]
    fn an_aircraft_far_above_the_tunnel_is_not_inhibited() {
        let (runway, aircraft) = on_final(2., 2_500.);
        assert!(!is_inhibiting(&runway, &aircraft));
    }

    #[test]
    fn an_aircraft_below_the_runway_elevation_is_not_inhibited() {
        let (runway, aircraft) = on_final(2., -400.);
        assert!(!is_inhibiting(&runway, &aircraft));
    }

    #[test]
    fn the_tunnel_ceiling_rises_with_the_distance_to_the_runway() {
        let (near, aircraft) = on_final(0.8, 1_000.);
        assert!(!is_inhibiting(&near, &aircraft));
        let (far, aircraft) = on_final(2.6, 1_000.);
        assert!(is_inhibiting(&far, &aircraft));
    }

    #[test]
    fn an_aircraft_flying_away_from_the_runway_is_not_inhibited() {
        let (runway, mut aircraft) = on_final(2., 640.);
        aircraft.true_track_deg = 180.;
        assert!(!is_inhibiting(&runway, &aircraft));
    }

    #[test]
    fn a_track_within_the_tolerance_still_converges() {
        let (runway, mut aircraft) = on_final(2., 640.);
        aircraft.true_track_deg = 30.;
        assert!(is_inhibiting(&runway, &aircraft));
        aircraft.true_track_deg = 60.;
        assert!(!is_inhibiting(&runway, &aircraft));
    }

    #[test]
    fn over_the_runway_the_track_does_not_matter() {
        let (runway, mut aircraft) = on_final(0.3, 100.);
        aircraft.true_track_deg = 170.;
        assert!(is_inhibiting(&runway, &aircraft));
    }

    /// A runway 1.5 NM long towards the north, threshold at sea level.
    fn north_runway() -> Runway {
        Runway {
            reference_point: RUNWAY_POINT,
            elevation_ft: 0.,
            origin: RunwayOrigin::Destination,
            geometry: Some(RunwayGeometry {
                true_heading_deg: 0.,
                length_ft: 1.5 * FEET_PER_NAUTICAL_MILE,
            }),
        }
    }

    /// An aircraft `before_threshold_nm` before the threshold of the north runway (negative: over it), `across_nm`
    /// right of its centre line, tracking north.
    fn near_runway(
        before_threshold_nm: f64,
        across_nm: f64,
        height_ft: f64,
    ) -> (RunwayContext, LandingTunnelInputs) {
        let runway = north_runway();
        let position = offset_position(
            offset_position(RUNWAY_POINT, 180., before_threshold_nm),
            90.,
            across_nm,
        );
        (
            RunwayContext {
                runway,
                distance_nm: runway.distance_nm_from(position),
                height_above_runway_ft: height_ft,
            },
            LandingTunnelInputs {
                aircraft_position: position,
                true_track_deg: 0.,
                gear_downlocked: true,
                landing_flaps: true,
            },
        )
    }

    fn inhibits(before_threshold_nm: f64, across_nm: f64, height_ft: f64) -> bool {
        let (runway, aircraft) = near_runway(before_threshold_nm, across_nm, height_ft);
        is_inhibiting(&runway, &aircraft)
    }

    #[test]
    fn a_normal_final_to_a_known_runway_is_inhibited() {
        // 3 degree path: 50 ft over the threshold plus 318 ft per nautical mile
        for before_threshold_nm in [2.6, 2., 1., 0.3] {
            assert!(inhibits(
                before_threshold_nm,
                0.,
                50. + 318. * before_threshold_nm
            ));
        }
    }

    #[test]
    fn the_runway_tunnel_ends_at_the_edge_of_the_approach_sector_and_the_far_end() {
        assert!(!inhibits(2.8, 0., 940.));
        assert!(inhibits(-1.4, 0., 30.));
        assert!(!inhibits(-1.6, 0., 30.));
    }

    #[test]
    fn the_runway_tunnel_floor_is_level_then_rises_at_2_6_degrees() {
        // The floor is 150 ft lower than published for the altitude error
        assert!(inhibits(0.9, 0., -140.));
        assert!(!inhibits(0.9, 0., -160.));
        // 2 NM out the published floor is 1.04 NM * 276 ft = 287 ft
        assert!(inhibits(2., 0., 150.));
        assert!(!inhibits(2., 0., 120.));
    }

    #[test]
    fn the_runway_tunnel_ceiling_is_5000_ft_over_the_far_end_rising_at_8_degrees() {
        assert!(inhibits(-1.49, 0., 4_990.));
        assert!(!inhibits(-1.4, 0., 5_200.));
        // 4 NM from the far end: 5000 ft + 4 * 854 ft
        assert!(inhibits(2.5, 0., 8_350.));
        assert!(!inhibits(2.5, 0., 8_500.));
    }

    #[test]
    fn the_runway_tunnel_is_0_52_nm_wide_near_the_runway_then_widens_to_2_79_nm() {
        assert!(inhibits(0.5, 0.5, 300.));
        assert!(!inhibits(0.5, 0.55, 300.));
        assert!(inhibits(-1., -0.5, 100.));
        assert!(!inhibits(-1., -0.55, 100.));
        assert!(inhibits(2.69, 2.7, 900.));
        assert!(!inhibits(2.69, 2.85, 900.));
        // Halfway along the widening the width is a quarter of the way: 0.52 + 2.27 / 4 = 1.09 NM
        assert!(inhibits(2.1, 1.05, 700.));
        assert!(!inhibits(2.1, 1.15, 700.));
    }

    #[test]
    fn the_track_converges_with_the_runway_direction() {
        let (runway, mut aircraft) = near_runway(2., 0.8, 700.);
        // Right of the centre line: the runway direction counts, not the bearing to the threshold
        aircraft.true_track_deg = 30.;
        assert!(is_inhibiting(&runway, &aircraft));
        aircraft.true_track_deg = 330.;
        assert!(is_inhibiting(&runway, &aircraft));
        aircraft.true_track_deg = 60.;
        assert!(!is_inhibiting(&runway, &aircraft));
        aircraft.true_track_deg = 180.;
        assert!(!is_inhibiting(&runway, &aircraft));
    }

    #[test]
    fn the_landing_configuration_is_needed_for_a_known_runway_too() {
        let (runway, mut aircraft) = near_runway(1., 0., 370.);
        aircraft.landing_flaps = false;
        assert!(!is_inhibiting(&runway, &aircraft));
    }

    #[test]
    fn the_reciprocal_direction_of_a_known_runway_has_its_tunnel_too() {
        // Back to land on the opposite direction of the runway taken off from: 2 NM beyond its far end, tracking south
        let runway = north_runway();
        let position = offset_position(RUNWAY_POINT, 0., 1.5 + 2.);
        let context = RunwayContext {
            runway,
            distance_nm: runway.distance_nm_from(position),
            height_above_runway_ft: 50. + 318. * 2.,
        };
        let mut aircraft = LandingTunnelInputs {
            aircraft_position: position,
            true_track_deg: 180.,
            gear_downlocked: true,
            landing_flaps: true,
        };
        assert!(is_inhibiting(&context, &aircraft));
        aircraft.true_track_deg = 0.;
        assert!(!is_inhibiting(&context, &aircraft));
    }
}
