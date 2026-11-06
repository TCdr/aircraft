//! The runways the terrain functions know about.
//!
//! The runways of the airports around the aircraft (the runway database), the origin and destination runways of the
//! flight plan the FMGC sends to the EGPWC, and the place the aircraft took off from. Anything that can name runways
//! plugs in through [`RunwaySource`].

use super::geometry::{bearing_deg, distance_nm, offset_position, signed_angle_difference_deg};
use super::phase::TerrainPhase;
use crate::surveillance::egpws::terrain_grid::GridPosition;

pub(super) const FEET_PER_NAUTICAL_MILE: f64 = 6_076.12;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunwayOrigin {
    /// The runway of the flight plan destination
    Destination,
    /// The runway the aircraft takes off from
    Departure,
    /// A runway of an airport around the aircraft, from the runway database
    Database,
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

    /// The angle between the runway line and a true heading, whichever direction the runway is used in, 0 to 90
    /// degrees. None without a geometry.
    fn angle_to_line_deg(&self, true_heading_deg: f64) -> Option<f64> {
        let geometry = self.geometry?;
        let difference_deg =
            signed_angle_difference_deg(geometry.true_heading_deg, true_heading_deg).abs();
        Some(difference_deg.min(180. - difference_deg))
    }

    /// Design choice: a runway that holds the reference point of the other and lies within 10 degrees of its line is
    /// the same runway, whatever the direction of use. The sources give the headings a little differently, but a
    /// runway that starts at the side of another one and crosses it is another runway.
    fn is_same_runway_as(&self, other: &Self) -> bool {
        const SAME_LINE_TOLERANCE_DEG: f64 = 10.;
        self.holds(other.reference_point)
            && other
                .geometry
                .and_then(|geometry| self.angle_to_line_deg(geometry.true_heading_deg))
                .is_some_and(|angle_deg| angle_deg <= SAME_LINE_TOLERANCE_DEG)
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

    pub(super) fn of(runway: &Runway, position: GridPosition, geometric_altitude_ft: f64) -> Self {
        Self {
            runway: *runway,
            distance_nm: runway.distance_nm_from(position),
            height_above_runway_ft: geometric_altitude_ft - runway.elevation_ft,
        }
    }

    pub(super) fn nearest_of(contexts: &[Self]) -> Option<Self> {
        contexts
            .iter()
            .min_by(|a, b| a.distance_nm.total_cmp(&b.distance_nm))
            .copied()
    }

    /// The runway the phase, the floors and the terrain scan refer to. While the aircraft is departing it leaves out
    /// the runways of the database: the other runways of the departure airport are known too, and a parallel or
    /// crossing one can be nearer just after lift-off, which would end the departure phase and bring the landing
    /// floors in. Otherwise, and when there are no database runways, it is the nearest runway.
    pub(super) fn nearest_reference_runway(contexts: &[Self]) -> Option<Self> {
        let is_departing = contexts.iter().any(|context| {
            context.runway.origin == RunwayOrigin::Departure
                && TerrainPhase::determine(Some(context)) == TerrainPhase::Departure
        });
        if !is_departing {
            return Self::nearest_of(contexts);
        }
        let without_database: Vec<Self> = contexts
            .iter()
            .filter(|context| context.runway.origin != RunwayOrigin::Database)
            .copied()
            .collect();
        Self::nearest_of(&without_database)
    }
}

/// Remembers where the aircraft last stood still or taxied slowly on the ground. When the aircraft takes off that is
/// the start of the takeoff roll, which stands in for the departure runway. Without such a point the first position on
/// the ground is kept at any speed: after a flight is loaded on the runway the GPS can still be acquiring the satellites
/// until the aircraft is well into its roll.
#[derive(Default)]
pub struct DepartureRunwayLatch {
    runway: Option<Runway>,
    /// The true track of the aircraft rolling fast from the latched point, which tells the runway of the roll at an
    /// intersection
    roll_true_track_deg: Option<f64>,
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
        true_track_deg: f64,
    ) {
        let is_slow = ground_speed_kt < Self::SLOW_GROUND_SPEED_KT;
        if on_ground && (is_slow || self.runway.is_none()) {
            self.runway = Some(Runway {
                reference_point: position,
                elevation_ft: geometric_altitude_ft,
                origin: RunwayOrigin::Departure,
                geometry: None,
            });
            self.roll_true_track_deg = None;
        }
        if on_ground && !is_slow && self.runway.is_some() {
            self.roll_true_track_deg = Some(true_track_deg);
        }
    }

    pub fn runway(&self) -> Option<Runway> {
        self.runway
    }
}

/// The runways of the A320: the origin and destination of the flight plan, the runway database and the departure
/// latch.
#[derive(Default)]
pub struct ReferenceRunways {
    origin: Option<Runway>,
    destination: Option<Runway>,
    database: Vec<Runway>,
    departure_latch: DepartureRunwayLatch,
}

impl ReferenceRunways {
    pub fn set_origin(&mut self, origin: Option<Runway>) {
        self.origin = origin;
    }

    pub fn set_destination(&mut self, destination: Option<Runway>) {
        self.destination = destination;
    }

    /// The runways of the airports around the aircraft. They replace the previous list.
    pub fn set_database_runways(&mut self, runways: Vec<Runway>) {
        self.database = runways;
    }

    pub fn departure_latch_mut(&mut self) -> &mut DepartureRunwayLatch {
        &mut self.departure_latch
    }

    /// The runway the takeoff roll started on: the origin runway of the flight plan, else a runway of the database,
    /// else the point the roll started at. A takeoff from another runway than the planned one keeps the latch. Where
    /// several runways hold the point the roll started at, the one along the track of the roll is taken.
    fn departure(&self) -> Option<Runway> {
        /// Design choice: wide enough for the wind crab and a line-up that is still turning, narrow enough to tell
        /// crossing runways apart.
        const ALIGNED_WITH_ROLL_DEG: f64 = 20.;

        let Some(latched) = self.departure_latch.runway() else {
            return self.origin;
        };
        let holding: Vec<&Runway> = self
            .origin
            .iter()
            .chain(&self.database)
            .filter(|runway| runway.holds(latched.reference_point))
            .collect();
        let along_the_roll = holding.iter().find(|runway| {
            self.departure_latch
                .roll_true_track_deg
                .and_then(|track_deg| runway.angle_to_line_deg(track_deg))
                .is_some_and(|angle_deg| angle_deg <= ALIGNED_WITH_ROLL_DEG)
        });
        along_the_roll
            .or(holding.first())
            .map(|runway| Runway {
                origin: RunwayOrigin::Departure,
                ..**runway
            })
            .or(Some(latched))
    }
}

impl RunwaySource for ReferenceRunways {
    fn runways(&self) -> Vec<Runway> {
        let mut runways: Vec<Runway> = self
            .destination
            .into_iter()
            .chain(self.departure())
            .collect();
        // The database also holds the runways of the flight plan, and the departure runway may come from it
        let plan_runways = runways.len();
        for database_runway in &self.database {
            if !runways[..plan_runways]
                .iter()
                .any(|runway| runway.is_same_runway_as(database_runway))
            {
                runways.push(*database_runway);
            }
        }
        runways
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
        let contexts: Vec<RunwayContext> = runways
            .iter()
            .map(|runway| RunwayContext::of(runway, GridPosition::new(47., 8.), 1_100.))
            .collect();
        let context = RunwayContext::nearest_of(&contexts).unwrap();
        assert_eq!(context.runway.origin, RunwayOrigin::Departure);
        assert!((context.distance_nm - 6.).abs() < 0.1);
        assert_eq!(context.height_above_runway_ft, 1_000.);
    }

    #[test]
    fn there_is_no_nearest_runway_without_runways() {
        assert!(RunwayContext::nearest_of(&[]).is_none());
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

        latch.update(true, 10., GridPosition::new(1., 2.), 50., 0.);
        latch.update(true, 20., GridPosition::new(1.001, 2.), 52., 0.);
        let runway = latch.runway().unwrap();
        assert_eq!(runway.reference_point, GridPosition::new(1.001, 2.));
        assert_eq!(runway.elevation_ft, 52.);
        assert_eq!(runway.origin, RunwayOrigin::Departure);
        assert!(runway.geometry.is_none());
    }

    #[test]
    fn the_latch_keeps_the_takeoff_point_during_the_roll_and_the_flight() {
        let mut latch = DepartureRunwayLatch::default();
        latch.update(true, 5., GridPosition::new(1., 2.), 50., 0.);
        latch.update(true, 80., GridPosition::new(1.02, 2.), 50., 0.);
        latch.update(false, 150., GridPosition::new(1.1, 2.), 600., 0.);
        assert_eq!(
            latch.runway().unwrap().reference_point,
            GridPosition::new(1., 2.)
        );
    }

    #[test]
    fn without_an_earlier_point_the_first_ground_position_is_latched_at_any_speed() {
        // After a flight is loaded on the runway the GPS position can become valid only during the takeoff roll
        let mut latch = DepartureRunwayLatch::default();
        latch.update(true, 90., GridPosition::new(1., 2.), 50., 0.);
        latch.update(true, 120., GridPosition::new(1.01, 2.), 50., 0.);
        latch.update(false, 150., GridPosition::new(1.02, 2.), 200., 0.);
        assert_eq!(
            latch.runway().unwrap().reference_point,
            GridPosition::new(1., 2.)
        );
    }

    #[test]
    fn a_first_position_in_the_air_is_not_latched() {
        let mut latch = DepartureRunwayLatch::default();
        latch.update(false, 150., GridPosition::new(1., 2.), 600., 0.);
        assert!(latch.runway().is_none());
    }

    #[test]
    fn a_takeoff_roll_with_the_position_valid_only_when_fast_has_a_departure_runway() {
        let mut runways = ReferenceRunways::default();
        runways
            .departure_latch_mut()
            .update(true, 80., GridPosition::new(1., 2.), 0., 0.);
        assert_eq!(runways.runways().len(), 1);
    }

    #[test]
    fn the_reference_runways_list_destination_and_departure() {
        let mut runways = ReferenceRunways::default();
        assert!(runways.runways().is_empty());

        runways
            .departure_latch_mut()
            .update(true, 0., GridPosition::new(1., 2.), 0., 0.);
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
            .update(true, 5., lined_up, 100., 0.);
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
                .update(true, 5., position, 100., 0.);
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
            .update(true, 5., NORTH_RUNWAY_START, 100., 0.);
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

    fn reference_runways_with_database(database: Vec<Runway>) -> ReferenceRunways {
        let mut runways = ReferenceRunways::default();
        runways.set_database_runways(database);
        runways
    }

    #[test]
    fn the_database_runways_are_listed_with_the_flight_plan_runways() {
        let mut runways =
            reference_runways_with_database(vec![runway_at(48., RunwayOrigin::Database)]);
        runways.set_destination(Some(north_runway(RunwayOrigin::Destination)));
        let listed = runways.runways();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].origin, RunwayOrigin::Destination);
        assert_eq!(listed[1].origin, RunwayOrigin::Database);
    }

    #[test]
    fn the_database_copy_of_the_destination_runway_is_left_out() {
        let destination = north_runway(RunwayOrigin::Destination);
        let same_direction = north_runway(RunwayOrigin::Database);
        let opposite_direction = Runway {
            origin: RunwayOrigin::Database,
            ..north_runway(RunwayOrigin::Database).reciprocal().unwrap()
        };
        for copy in [same_direction, opposite_direction] {
            let mut runways = reference_runways_with_database(vec![copy]);
            runways.set_destination(Some(destination));
            assert_eq!(runways.runways(), vec![destination]);
        }
    }

    #[test]
    fn a_parallel_runway_of_the_destination_airport_is_kept() {
        let destination = north_runway(RunwayOrigin::Destination);
        let parallel = Runway {
            reference_point: offset_position(NORTH_RUNWAY_START, 90., 0.12),
            ..north_runway(RunwayOrigin::Database)
        };
        let mut runways = reference_runways_with_database(vec![parallel]);
        runways.set_destination(Some(destination));
        assert_eq!(runways.runways(), vec![destination, parallel]);
    }

    #[test]
    fn a_roll_started_on_a_database_runway_makes_it_the_departure_runway() {
        let mut runways =
            reference_runways_with_database(vec![north_runway(RunwayOrigin::Database)]);
        runways
            .departure_latch_mut()
            .update(true, 5., NORTH_RUNWAY_START, 100., 0.);
        let listed = runways.runways();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].origin, RunwayOrigin::Departure);
        assert_eq!(
            listed[0].geometry,
            north_runway(RunwayOrigin::Database).geometry
        );
    }

    #[test]
    fn the_planned_origin_runway_wins_over_its_database_copy() {
        let origin = north_runway(RunwayOrigin::Departure);
        let mut runways =
            reference_runways_with_database(vec![north_runway(RunwayOrigin::Database)]);
        runways.set_origin(Some(origin));
        runways
            .departure_latch_mut()
            .update(true, 5., NORTH_RUNWAY_START, 100., 0.);
        assert_eq!(runways.runways(), vec![origin]);
    }

    #[test]
    fn a_roll_started_off_every_known_runway_keeps_the_latch() {
        let mut runways =
            reference_runways_with_database(vec![north_runway(RunwayOrigin::Database)]);
        let off_the_runway = offset_position(NORTH_RUNWAY_START, 90., 0.5);
        runways
            .departure_latch_mut()
            .update(true, 5., off_the_runway, 100., 0.);
        let listed = runways.runways();
        assert_eq!(listed.len(), 2);
        let latch = listed
            .iter()
            .find(|runway| runway.origin == RunwayOrigin::Departure)
            .unwrap();
        assert_eq!(latch.reference_point, off_the_runway);
        assert!(latch.geometry.is_none());
    }

    /// 2 NM towards the east
    fn east_runway_from(start: GridPosition) -> Runway {
        Runway {
            reference_point: start,
            geometry: Some(RunwayGeometry {
                true_heading_deg: 90.,
                length_ft: 2. * FEET_PER_NAUTICAL_MILE,
            }),
            ..north_runway(RunwayOrigin::Database)
        }
    }

    /// The north runway and an east runway cross 0.5 NM from the start of the north runway
    fn crossing_runways() -> (ReferenceRunways, GridPosition) {
        let crossing = offset_position(NORTH_RUNWAY_START, 0., 0.5);
        let runways = reference_runways_with_database(vec![
            north_runway(RunwayOrigin::Database),
            east_runway_from(offset_position(crossing, 270., 1.)),
        ]);
        (runways, crossing)
    }

    fn departure_heading_deg(runways: &ReferenceRunways) -> f64 {
        departure_of(runways).geometry.unwrap().true_heading_deg
    }

    #[test]
    fn at_a_crossing_the_runway_along_the_roll_is_the_departure_runway() {
        for roll_track_deg in [90., 270., 85.] {
            let (mut runways, crossing) = crossing_runways();
            let latch = runways.departure_latch_mut();
            latch.update(true, 5., crossing, 100., 0.);
            latch.update(true, 60., crossing, 100., roll_track_deg);
            assert_eq!(
                departure_heading_deg(&runways),
                90.,
                "track {roll_track_deg}"
            );
        }
    }

    #[test]
    fn at_a_crossing_without_a_roll_track_the_first_runway_is_the_departure_runway() {
        let (mut runways, crossing) = crossing_runways();
        runways
            .departure_latch_mut()
            .update(true, 5., crossing, 100., 90.);
        assert_eq!(departure_heading_deg(&runways), 0.);
    }

    #[test]
    fn a_roll_track_along_no_runway_keeps_the_first_runway() {
        let (mut runways, crossing) = crossing_runways();
        let latch = runways.departure_latch_mut();
        latch.update(true, 5., crossing, 100., 0.);
        latch.update(true, 60., crossing, 100., 45.);
        assert_eq!(departure_heading_deg(&runways), 0.);
    }

    #[test]
    fn the_roll_track_is_forgotten_when_the_aircraft_is_slow_again() {
        let (mut runways, crossing) = crossing_runways();
        let latch = runways.departure_latch_mut();
        latch.update(true, 60., crossing, 100., 90.);
        latch.update(true, 5., crossing, 100., 90.);
        assert_eq!(departure_heading_deg(&runways), 0.);
    }

    #[test]
    fn a_database_runway_that_starts_at_the_side_of_the_destination_runway_is_kept() {
        let destination = north_runway(RunwayOrigin::Destination);
        let crossing_runway = east_runway_from(offset_position(NORTH_RUNWAY_START, 0., 0.5));
        let mut runways = reference_runways_with_database(vec![crossing_runway]);
        runways.set_destination(Some(destination));
        assert_eq!(runways.runways(), vec![destination, crossing_runway]);
    }

    /// A departure runway the aircraft has just lifted off from, and a database runway that is nearer to it
    fn lift_off_contexts(height_ft: f64) -> [RunwayContext; 2] {
        let departure = RunwayContext {
            runway: north_runway(RunwayOrigin::Departure),
            distance_nm: 0.3,
            height_above_runway_ft: height_ft,
        };
        let staggered_parallel = RunwayContext {
            runway: north_runway(RunwayOrigin::Database),
            distance_nm: 0.2,
            height_above_runway_ft: height_ft,
        };
        [departure, staggered_parallel]
    }

    #[test]
    fn while_departing_the_reference_runway_is_not_a_database_runway() {
        let contexts = lift_off_contexts(60.);
        assert_eq!(
            RunwayContext::nearest_reference_runway(&contexts),
            Some(contexts[0])
        );
    }

    #[test]
    fn when_not_departing_the_reference_runway_is_the_nearest_runway() {
        // High above the departure runway the departure phase is over
        let contexts = lift_off_contexts(3_000.);
        assert_eq!(
            RunwayContext::nearest_reference_runway(&contexts),
            Some(contexts[1])
        );
    }

    #[test]
    fn without_database_runways_the_reference_runway_is_the_nearest_runway() {
        for height_ft in [60., 3_000.] {
            let [departure, _] = lift_off_contexts(height_ft);
            let destination = RunwayContext {
                runway: north_runway(RunwayOrigin::Destination),
                distance_nm: 0.1,
                ..departure
            };
            for contexts in [vec![departure], vec![departure, destination]] {
                assert_eq!(
                    RunwayContext::nearest_reference_runway(&contexts),
                    RunwayContext::nearest_of(&contexts)
                );
            }
        }
    }
}
