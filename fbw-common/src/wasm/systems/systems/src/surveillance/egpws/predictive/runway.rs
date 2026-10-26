//! The runways the terrain functions know about.
//!
//! There is no runway database in the aircraft. The terrain functions work with what the aircraft does have: the
//! origin and destination runways of the flight plan the FMGC sends to the EGPWC, and the place the aircraft took off
//! from. Anything that can name runways (a future database) plugs in through [`RunwaySource`].

use super::geometry::{bearing_deg, distance_nm, offset_position, signed_angle_difference_deg};
use crate::surveillance::egpws::terrain_grid::GridPosition;

pub(super) const FEET_PER_NAUTICAL_MILE: f64 = 6_076.12;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunwayOrigin {
    /// The runway of the flight plan destination
    Destination,
    /// The runway the aircraft takes off from
    Departure,
}

/// The direction and length of a runway, from its reference point to its far end.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RunwayGeometry {
    pub true_heading_deg: f64,
    pub length_ft: f64,
}

/// A runway as the terrain functions use it. The reference point is where the runway starts in the direction of use:
/// the threshold of a landing runway, the start of a takeoff runway. Without a geometry only that point is known (an
/// airport reference point, the start of the takeoff roll), and distances are measured to it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Runway {
    pub reference_point: GridPosition,
    pub elevation_ft: f64,
    pub origin: RunwayOrigin,
    pub geometry: Option<RunwayGeometry>,
}

/// Where a position is relative to a runway: along the runway from its reference point (positive in the direction of
/// use, negative before the reference point) and across it (positive to the right).
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct RunwayCoordinates {
    pub(super) along_nm: f64,
    pub(super) across_nm: f64,
}

impl Runway {
    pub(super) fn length_nm(&self) -> f64 {
        self.geometry
            .map_or(0., |geometry| geometry.length_ft / FEET_PER_NAUTICAL_MILE)
    }

    /// The same runway used in the other direction, from its far end. Only one elevation is known for the runway.
    pub(super) fn reciprocal(&self) -> Option<Self> {
        let geometry = self.geometry?;
        Some(Self {
            reference_point: offset_position(
                self.reference_point,
                geometry.true_heading_deg,
                self.length_nm(),
            ),
            geometry: Some(RunwayGeometry {
                true_heading_deg: (geometry.true_heading_deg + 180.).rem_euclid(360.),
                ..geometry
            }),
            ..*self
        })
    }

    pub(super) fn centre(&self) -> GridPosition {
        match self.geometry {
            Some(geometry) => offset_position(
                self.reference_point,
                geometry.true_heading_deg,
                self.length_nm() / 2.,
            ),
            None => self.reference_point,
        }
    }

    /// None without a geometry. The runway is a few nautical miles from the positions it is used for, so a flat
    /// plane around the reference point is accurate enough.
    pub(super) fn coordinates_of(&self, position: GridPosition) -> Option<RunwayCoordinates> {
        let geometry = self.geometry?;
        let distance = distance_nm(self.reference_point, position);
        let angle_off_runway = signed_angle_difference_deg(
            geometry.true_heading_deg,
            bearing_deg(self.reference_point, position),
        )
        .to_radians();
        Some(RunwayCoordinates {
            along_nm: distance * angle_off_runway.cos(),
            across_nm: distance * angle_off_runway.sin(),
        })
    }

    /// The distance to the nearest point of the runway: beyond its ends this is the distance to its centre less half
    /// its length, which is how the terrain clearance floor adds half the runway length to its bias.
    pub(super) fn distance_nm_from(&self, position: GridPosition) -> f64 {
        match self.coordinates_of(position) {
            Some(coordinates) => {
                let beyond_ends_nm =
                    coordinates.along_nm - coordinates.along_nm.clamp(0., self.length_nm());
                beyond_ends_nm.hypot(coordinates.across_nm)
            }
            None => distance_nm(self.reference_point, position),
        }
    }

    /// Design choice: a point within a tenth of a nautical mile of the runway, sideways or before its start, is on
    /// it. That holds the start of a rolling takeoff from a taxiway entry and keeps out the parallel taxiways.
    fn holds(&self, position: GridPosition) -> bool {
        const ON_RUNWAY_TOLERANCE_NM: f64 = 0.1;
        self.coordinates_of(position).is_some_and(|coordinates| {
            coordinates.across_nm.abs() <= ON_RUNWAY_TOLERANCE_NM
                && (-ON_RUNWAY_TOLERANCE_NM..=self.length_nm()).contains(&coordinates.along_nm)
        })
    }
}

pub trait RunwaySource {
    /// All the runways the source knows. Callers pick the ones near the aircraft themselves.
    fn runways(&self) -> Vec<Runway>;
}

/// A runway together with where the aircraft is relative to it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct RunwayContext {
    pub(super) runway: Runway,
    /// To the nearest point of the runway
    pub(super) distance_nm: f64,
    pub(super) height_above_runway_ft: f64,
}

impl RunwayContext {
    /// Design choice: the takeoff roll latch is the point where the roll started, not the runway, and the aircraft
    /// lifts off up to a runway length from it (4 km, 2.2 NM, for the longest runways). Within this distance of it the
    /// aircraft is taking off, close to the ground by design, so the functions that measure the height above the
    /// terrain around the runway stand down.
    pub(super) const DEPARTURE_RUNWAY_AREA_NM: f64 = 2.5;

    /// The aircraft is still on the runway it took off from, or just lifting off from it, and only the point the
    /// roll started at is known. With the whole runway known its distance already covers the takeoff.
    pub(super) fn is_in_departure_runway_area(&self) -> bool {
        self.runway.origin == RunwayOrigin::Departure
            && self.runway.geometry.is_none()
            && self.distance_nm < Self::DEPARTURE_RUNWAY_AREA_NM
    }

    /// For the take-off roll latch the runway is the whole departure runway area around the point the roll started.
    pub(super) fn distance_past_departure_runway_nm(&self) -> f64 {
        if self.runway.geometry.is_none() {
            (self.distance_nm - Self::DEPARTURE_RUNWAY_AREA_NM).max(0.)
        } else {
            self.distance_nm
        }
    }

    pub(super) fn nearest(
        runways: &[Runway],
        position: GridPosition,
        geometric_altitude_ft: f64,
    ) -> Option<Self> {
        runways
            .iter()
            .map(|runway| Self {
                runway: *runway,
                distance_nm: runway.distance_nm_from(position),
                height_above_runway_ft: geometric_altitude_ft - runway.elevation_ft,
            })
            .min_by(|a, b| a.distance_nm.total_cmp(&b.distance_nm))
    }
}

/// Remembers where the aircraft last stood still or taxied slowly on the ground. When the aircraft takes off that is
/// the start of the takeoff roll, which stands in for the departure runway.
#[derive(Default)]
pub struct DepartureRunwayLatch {
    runway: Option<Runway>,
}

impl DepartureRunwayLatch {
    /// Same ground speed as the departure phase of the TSO ("on the ground" below 35 kt).
    const SLOW_GROUND_SPEED_KT: f64 = 35.;

    pub fn update(
        &mut self,
        on_ground: bool,
        ground_speed_kt: f64,
        position: GridPosition,
        geometric_altitude_ft: f64,
    ) {
        if on_ground && ground_speed_kt < Self::SLOW_GROUND_SPEED_KT {
            self.runway = Some(Runway {
                reference_point: position,
                elevation_ft: geometric_altitude_ft,
                origin: RunwayOrigin::Departure,
                geometry: None,
            });
        }
    }

    pub fn runway(&self) -> Option<Runway> {
        self.runway
    }
}

/// The runways of the A320: the origin and destination of the flight plan and the departure latch.
#[derive(Default)]
pub struct ReferenceRunways {
    origin: Option<Runway>,
    destination: Option<Runway>,
    departure_latch: DepartureRunwayLatch,
}

impl ReferenceRunways {
    pub fn set_origin(&mut self, origin: Option<Runway>) {
        self.origin = origin;
    }

    pub fn set_destination(&mut self, destination: Option<Runway>) {
        self.destination = destination;
    }

    pub fn departure_latch_mut(&mut self) -> &mut DepartureRunwayLatch {
        &mut self.departure_latch
    }

    /// The origin runway of the flight plan, as long as the takeoff roll started on it. A takeoff from another runway
    /// than the planned one keeps the latch.
    fn departure(&self) -> Option<Runway> {
        let latched = self.departure_latch.runway();
        match (self.origin, latched) {
            (Some(origin), Some(latched)) if !origin.holds(latched.reference_point) => {
                Some(latched)
            }
            (Some(origin), _) => Some(origin),
            (None, latched) => latched,
        }
    }
}

impl RunwaySource for ReferenceRunways {
    fn runways(&self) -> Vec<Runway> {
        self.destination
            .into_iter()
            .chain(self.departure())
            .collect()
    }
}

#[cfg(test)]
pub(super) struct StaticRunways(pub(super) Vec<Runway>);

#[cfg(test)]
impl RunwaySource for StaticRunways {
    fn runways(&self) -> Vec<Runway> {
        self.0.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn runway_at(latitude: f64, origin: RunwayOrigin) -> Runway {
        Runway {
            reference_point: GridPosition::new(latitude, 8.),
            elevation_ft: 100.,
            origin,
            geometry: None,
        }
    }

    const NORTH_RUNWAY_START: GridPosition = GridPosition {
        latitude_degrees: 47.,
        longitude_degrees: 8.,
    };

    /// 12152 ft, 2 NM, towards the north
    fn north_runway(origin: RunwayOrigin) -> Runway {
        Runway {
            reference_point: NORTH_RUNWAY_START,
            elevation_ft: 100.,
            origin,
            geometry: Some(RunwayGeometry {
                true_heading_deg: 0.,
                length_ft: 2. * FEET_PER_NAUTICAL_MILE,
            }),
        }
    }

    fn assert_near(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 0.01,
            "{actual} is not {expected}"
        );
    }

    #[test]
    fn the_nearest_runway_is_picked_with_distance_and_height() {
        let runways = [
            runway_at(47.5, RunwayOrigin::Destination),
            runway_at(47.1, RunwayOrigin::Departure),
        ];
        let context = RunwayContext::nearest(&runways, GridPosition::new(47., 8.), 1_100.).unwrap();
        assert_eq!(context.runway.origin, RunwayOrigin::Departure);
        assert!((context.distance_nm - 6.).abs() < 0.1);
        assert_eq!(context.height_above_runway_ft, 1_000.);
    }

    #[test]
    fn there_is_no_nearest_runway_without_runways() {
        assert!(RunwayContext::nearest(&[], GridPosition::new(0., 0.), 0.).is_none());
    }

    #[test]
    fn the_centre_is_half_the_length_down_the_runway() {
        let runway = north_runway(RunwayOrigin::Destination);
        assert_near(distance_nm(runway.reference_point, runway.centre()), 1.);
        assert_near(bearing_deg(runway.reference_point, runway.centre()), 0.);
        assert_eq!(
            runway_at(47., RunwayOrigin::Destination).centre(),
            GridPosition::new(47., 8.)
        );
    }

    #[test]
    fn the_reciprocal_starts_at_the_far_end_in_the_other_direction() {
        let reciprocal = north_runway(RunwayOrigin::Destination)
            .reciprocal()
            .unwrap();
        assert_near(
            distance_nm(NORTH_RUNWAY_START, reciprocal.reference_point),
            2.,
        );
        assert_near(reciprocal.geometry.unwrap().true_heading_deg, 180.);
        assert_near(reciprocal.length_nm(), 2.);
        assert!(runway_at(47., RunwayOrigin::Destination)
            .reciprocal()
            .is_none());
    }

    #[test]
    fn runway_coordinates_are_along_and_across_the_direction_of_use() {
        let runway = north_runway(RunwayOrigin::Destination);
        let short_final = offset_position(NORTH_RUNWAY_START, 180., 3.);
        let coordinates = runway.coordinates_of(short_final).unwrap();
        assert_near(coordinates.along_nm, -3.);
        assert_near(coordinates.across_nm, 0.);

        let right_of_centre = offset_position(runway.centre(), 90., 0.5);
        let coordinates = runway.coordinates_of(right_of_centre).unwrap();
        assert_near(coordinates.along_nm, 1.);
        assert_near(coordinates.across_nm, 0.5);

        assert!(runway_at(47., RunwayOrigin::Destination)
            .coordinates_of(short_final)
            .is_none());
    }

    #[test]
    fn the_distance_is_to_the_nearest_point_of_the_runway() {
        let runway = north_runway(RunwayOrigin::Destination);
        let before_the_start = offset_position(NORTH_RUNWAY_START, 180., 3.);
        assert_near(runway.distance_nm_from(before_the_start), 3.);
        let beyond_the_end = offset_position(NORTH_RUNWAY_START, 0., 5.);
        assert_near(runway.distance_nm_from(beyond_the_end), 3.);
        let abeam_the_centre = offset_position(runway.centre(), 270., 0.4);
        assert_near(runway.distance_nm_from(abeam_the_centre), 0.4);
        assert_near(runway.distance_nm_from(runway.centre()), 0.);
    }

    #[test]
    fn without_a_geometry_the_distance_is_to_the_reference_point() {
        let runway = runway_at(47., RunwayOrigin::Destination);
        assert_near(
            runway.distance_nm_from(offset_position(GridPosition::new(47., 8.), 0., 5.)),
            5.,
        );
    }

    #[test]
    fn the_latch_follows_the_aircraft_while_it_is_slow_on_the_ground() {
        let mut latch = DepartureRunwayLatch::default();
        assert!(latch.runway().is_none());

        latch.update(true, 10., GridPosition::new(1., 2.), 50.);
        latch.update(true, 20., GridPosition::new(1.001, 2.), 52.);
        let runway = latch.runway().unwrap();
        assert_eq!(runway.reference_point, GridPosition::new(1.001, 2.));
        assert_eq!(runway.elevation_ft, 52.);
        assert_eq!(runway.origin, RunwayOrigin::Departure);
        assert!(runway.geometry.is_none());
    }

    #[test]
    fn the_latch_keeps_the_takeoff_point_during_the_roll_and_the_flight() {
        let mut latch = DepartureRunwayLatch::default();
        latch.update(true, 5., GridPosition::new(1., 2.), 50.);
        latch.update(true, 80., GridPosition::new(1.02, 2.), 50.);
        latch.update(false, 150., GridPosition::new(1.1, 2.), 600.);
        assert_eq!(
            latch.runway().unwrap().reference_point,
            GridPosition::new(1., 2.)
        );
    }

    #[test]
    fn the_reference_runways_list_destination_and_departure() {
        let mut runways = ReferenceRunways::default();
        assert!(runways.runways().is_empty());

        runways
            .departure_latch_mut()
            .update(true, 0., GridPosition::new(1., 2.), 0.);
        assert_eq!(runways.runways().len(), 1);

        runways.set_destination(Some(runway_at(47., RunwayOrigin::Destination)));
        assert_eq!(runways.runways().len(), 2);

        runways.set_destination(None);
        assert_eq!(runways.runways().len(), 1);
    }

    fn departure_of(runways: &ReferenceRunways) -> Runway {
        *runways
            .runways()
            .iter()
            .find(|runway| runway.origin == RunwayOrigin::Departure)
            .unwrap()
    }

    #[test]
    fn the_origin_runway_is_the_departure_runway_before_any_latch() {
        let mut runways = ReferenceRunways::default();
        runways.set_origin(Some(north_runway(RunwayOrigin::Departure)));
        assert_eq!(
            departure_of(&runways),
            north_runway(RunwayOrigin::Departure)
        );
    }

    #[test]
    fn a_roll_started_on_the_origin_runway_keeps_the_origin_runway() {
        let mut runways = ReferenceRunways::default();
        runways.set_origin(Some(north_runway(RunwayOrigin::Departure)));
        // Lined up 300 m down the runway after an intersection entry, slightly off the centre line
        let lined_up = offset_position(offset_position(NORTH_RUNWAY_START, 0., 0.16), 90., 0.01);
        runways
            .departure_latch_mut()
            .update(true, 5., lined_up, 100.);
        assert_eq!(
            departure_of(&runways),
            north_runway(RunwayOrigin::Departure)
        );
    }

    #[test]
    fn a_roll_started_elsewhere_keeps_the_latch() {
        let mut runways = ReferenceRunways::default();
        runways.set_origin(Some(north_runway(RunwayOrigin::Departure)));
        // On a parallel taxiway 200 m from the centre line, or at the gate
        for position in [
            offset_position(offset_position(NORTH_RUNWAY_START, 0., 1.), 90., 0.11),
            offset_position(NORTH_RUNWAY_START, 225., 0.5),
        ] {
            runways
                .departure_latch_mut()
                .update(true, 5., position, 100.);
            let departure = departure_of(&runways);
            assert_eq!(departure.reference_point, position);
            assert!(departure.geometry.is_none());
        }
    }

    #[test]
    fn without_an_origin_runway_the_latch_is_the_departure_runway() {
        let mut runways = ReferenceRunways::default();
        runways
            .departure_latch_mut()
            .update(true, 5., NORTH_RUNWAY_START, 100.);
        assert!(departure_of(&runways).geometry.is_none());
    }

    #[test]
    fn the_departure_runway_area_is_only_kept_for_the_latch() {
        let latched = RunwayContext {
            runway: runway_at(47., RunwayOrigin::Departure),
            distance_nm: 2.,
            height_above_runway_ft: 300.,
        };
        assert!(latched.is_in_departure_runway_area());
        let known_runway = RunwayContext {
            runway: north_runway(RunwayOrigin::Departure),
            ..latched
        };
        assert!(!known_runway.is_in_departure_runway_area());
    }
}
