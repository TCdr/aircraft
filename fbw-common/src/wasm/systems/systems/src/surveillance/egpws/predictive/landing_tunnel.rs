//! The runway convergence inhibit of the predictive alerts. On entering the approach sector of the runway the aircraft
//! is expected to get close to the terrain around the runway, so the alerts are inhibited as long as three criteria
//! hold: the aircraft is configured for landing, it is inside the landing tunnel above the approach path, and its
//! track converges on the runway.
//!
//! The sector size is published. The size and shape of the tunnel are on a figure that is not available, so the
//! numbers below are design choices.

use super::{geometry::bearing_deg, runway::RunwayContext};
use crate::surveillance::egpws::terrain_grid::GridPosition;

/// Approach sector radius, 5 km.
const APPROACH_SECTOR_NM: f64 = 2.7;

/// Design choice: the tunnel floor lies a little below the runway elevation so that an altitude error of the
/// geometric altitude does not open a gap in the tunnel at the threshold.
const TUNNEL_FLOOR_ABOVE_RUNWAY_FT: f64 = -150.;

/// Design choice: the tunnel ceiling is a 400 ft base plus 400 ft per nautical mile, which is 1480 ft at the edge of
/// the sector. A 3 degree approach path is at 320 ft per nautical mile, so the tunnel is wide enough for a high or
/// steep approach but not for an aircraft that flies over the sector level at 3000 ft.
const TUNNEL_CEILING_BASE_FT: f64 = 400.;
const TUNNEL_CEILING_PER_NM_FT: f64 = 400.;

/// Design choice: the heading of the runway is not known, so the track converges on the runway when it points at the
/// reference point within this angle. Wide enough for a final with an offset or a curved approach path, narrow enough
/// to exclude an aircraft that only passes the airport.
const CONVERGENCE_TRACK_TOLERANCE_DEG: f64 = 45.;

/// Design choice: over the runway itself the bearing to the reference point means nothing (the aircraft is on it, in
/// the flare or on the rollout), so the convergence criterion is waived there.
const OVER_RUNWAY_RADIUS_NM: f64 = 0.5;

pub(super) struct LandingTunnelInputs {
    pub(super) aircraft_position: GridPosition,
    pub(super) true_track_deg: f64,
    pub(super) gear_downlocked: bool,
    pub(super) landing_flaps: bool,
}

/// True while the alerts must be inhibited: all three criteria hold.
pub(super) fn is_inhibiting(runway: &RunwayContext, aircraft: &LandingTunnelInputs) -> bool {
    runway.distance_nm <= APPROACH_SECTOR_NM
        && is_landing_configuration(aircraft)
        && is_inside_tunnel(runway)
        && is_track_converging(runway, aircraft)
}

fn is_landing_configuration(aircraft: &LandingTunnelInputs) -> bool {
    aircraft.gear_downlocked && aircraft.landing_flaps
}

fn is_inside_tunnel(runway: &RunwayContext) -> bool {
    let ceiling = TUNNEL_CEILING_BASE_FT + TUNNEL_CEILING_PER_NM_FT * runway.distance_nm;
    (TUNNEL_FLOOR_ABOVE_RUNWAY_FT..=ceiling).contains(&runway.height_above_runway_ft)
}

fn is_track_converging(runway: &RunwayContext, aircraft: &LandingTunnelInputs) -> bool {
    if runway.distance_nm <= OVER_RUNWAY_RADIUS_NM {
        return true;
    }
    let bearing_to_runway = bearing_deg(aircraft.aircraft_position, runway.runway.reference_point);
    super::geometry::signed_angle_difference_deg(aircraft.true_track_deg, bearing_to_runway).abs()
        <= CONVERGENCE_TRACK_TOLERANCE_DEG
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surveillance::egpws::predictive::{
        geometry::offset_position,
        runway::{Runway, RunwayOrigin},
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
}
