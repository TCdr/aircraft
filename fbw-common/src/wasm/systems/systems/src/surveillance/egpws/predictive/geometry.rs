//! Distances and bearings on the sphere. The terrain look-ahead reaches at most a few tens of nautical miles, where a
//! spherical earth is accurate to far better than one terrain cell.

use crate::surveillance::egpws::terrain_grid::GridPosition;

const EARTH_RADIUS_NAUTICAL_MILES: f64 = 3_440.065;

pub(super) fn distance_nm(from: GridPosition, to: GridPosition) -> f64 {
    let from_latitude = from.latitude_degrees.to_radians();
    let to_latitude = to.latitude_degrees.to_radians();
    let latitude_change = to_latitude - from_latitude;
    let longitude_change = (to.longitude_degrees - from.longitude_degrees).to_radians();

    let haversine = (latitude_change / 2.).sin().powi(2)
        + from_latitude.cos() * to_latitude.cos() * (longitude_change / 2.).sin().powi(2);
    2. * EARTH_RADIUS_NAUTICAL_MILES * haversine.sqrt().min(1.).asin()
}

/// Initial true bearing from one position to another, 0 to 360 degrees.
pub(super) fn bearing_deg(from: GridPosition, to: GridPosition) -> f64 {
    let from_latitude = from.latitude_degrees.to_radians();
    let to_latitude = to.latitude_degrees.to_radians();
    let longitude_change = (to.longitude_degrees - from.longitude_degrees).to_radians();

    let east = longitude_change.sin() * to_latitude.cos();
    let north = from_latitude.cos() * to_latitude.sin()
        - from_latitude.sin() * to_latitude.cos() * longitude_change.cos();
    east.atan2(north).to_degrees().rem_euclid(360.)
}

/// The position reached by flying the given distance along the initial bearing.
pub(super) fn offset_position(
    from: GridPosition,
    bearing_deg: f64,
    distance_nm: f64,
) -> GridPosition {
    let angular_distance = distance_nm / EARTH_RADIUS_NAUTICAL_MILES;
    let bearing = bearing_deg.to_radians();
    let from_latitude = from.latitude_degrees.to_radians();

    let latitude = (from_latitude.sin() * angular_distance.cos()
        + from_latitude.cos() * angular_distance.sin() * bearing.cos())
    .clamp(-1., 1.)
    .asin();
    let longitude_change = (bearing.sin() * angular_distance.sin() * from_latitude.cos())
        .atan2(angular_distance.cos() - from_latitude.sin() * latitude.sin());

    let longitude =
        (from.longitude_degrees + longitude_change.to_degrees() + 540.).rem_euclid(360.) - 180.;
    GridPosition::new(latitude.to_degrees(), longitude)
}

/// The signed turn from one direction to the other, -180 to 180 degrees, positive clockwise.
pub(super) fn signed_angle_difference_deg(from_deg: f64, to_deg: f64) -> f64 {
    (to_deg - from_deg + 540.).rem_euclid(360.) - 180.
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_degree_of_latitude_is_sixty_nautical_miles() {
        let distance = distance_nm(GridPosition::new(10., 20.), GridPosition::new(11., 20.));
        assert!((distance - 60.04).abs() < 0.1, "{distance}");
    }

    #[test]
    fn longitude_degrees_shrink_with_latitude() {
        let at_equator = distance_nm(GridPosition::new(0., 0.), GridPosition::new(0., 1.));
        let at_sixty = distance_nm(GridPosition::new(60., 0.), GridPosition::new(60., 1.));
        assert!((at_sixty / at_equator - 0.5).abs() < 0.01);
    }

    #[test]
    fn offset_position_goes_the_requested_way_and_distance() {
        let start = GridPosition::new(47., 8.);
        for bearing in [0., 45., 90., 180., 270., 333.] {
            let end = offset_position(start, bearing, 25.);
            assert!((distance_nm(start, end) - 25.).abs() < 0.01, "{bearing}");
            let measured = bearing_deg(start, end);
            assert!(
                signed_angle_difference_deg(bearing, measured).abs() < 0.01,
                "{bearing} {measured}"
            );
        }
    }

    #[test]
    fn offset_position_wraps_the_antimeridian() {
        let end = offset_position(GridPosition::new(0., 179.9), 90., 30.);
        assert!(end.longitude_degrees < -179., "{}", end.longitude_degrees);
    }

    #[test]
    fn angle_difference_takes_the_short_way_round() {
        assert_eq!(signed_angle_difference_deg(350., 10.), 20.);
        assert_eq!(signed_angle_difference_deg(10., 350.), -20.);
    }
}
