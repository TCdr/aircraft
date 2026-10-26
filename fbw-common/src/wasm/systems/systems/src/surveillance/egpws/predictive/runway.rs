//! The runways the terrain functions know about.
//!
//! There is no runway database in the aircraft. The terrain functions work with what the aircraft does have: the
//! destination runway threshold the FMGC sends to the EGPWC, and the place the aircraft took off from. Anything that
//! can name runways (a future database) plugs in through [`RunwaySource`].

use super::geometry::distance_nm;
use crate::surveillance::egpws::terrain_grid::GridPosition;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunwayOrigin {
    /// The runway of the flight plan destination
    Destination,
    /// The place the aircraft started its takeoff roll
    Departure,
}

/// A runway as the terrain functions use it: one reference point at the landing end and the elevation there. The
/// length and heading are not known, so the runway centre is not either: distances are measured to the reference
/// point.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Runway {
    pub reference_point: GridPosition,
    pub elevation_ft: f64,
    pub origin: RunwayOrigin,
}

pub trait RunwaySource {
    /// All the runways the source knows. Callers pick the ones near the aircraft themselves.
    fn runways(&self) -> Vec<Runway>;
}

/// A runway together with where the aircraft is relative to it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct RunwayContext {
    pub(super) runway: Runway,
    pub(super) distance_nm: f64,
    pub(super) height_above_runway_ft: f64,
}

impl RunwayContext {
    /// Design choice: the departure runway is the point where the takeoff roll started, not the runway end, and
    /// the aircraft lifts off up to a runway length from it (4 km, 2.2 NM, for the longest runways). Within this
    /// distance of it the aircraft is taking off, close to the ground by design, so the functions that measure
    /// the height above the terrain around the runway stand down.
    pub(super) const DEPARTURE_RUNWAY_AREA_NM: f64 = 2.5;

    /// The aircraft is still on the runway it took off from, or just lifting off from it.
    pub(super) fn is_in_departure_runway_area(&self) -> bool {
        self.runway.origin == RunwayOrigin::Departure
            && self.distance_nm < Self::DEPARTURE_RUNWAY_AREA_NM
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
                distance_nm: distance_nm(position, runway.reference_point),
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
            });
        }
    }

    pub fn runway(&self) -> Option<Runway> {
        self.runway
    }
}

/// The runways of the A320: the destination of the flight plan and the departure latch.
#[derive(Default)]
pub struct ReferenceRunways {
    destination: Option<Runway>,
    departure: DepartureRunwayLatch,
}

impl ReferenceRunways {
    pub fn set_destination(&mut self, destination: Option<Runway>) {
        self.destination = destination;
    }

    pub fn departure_latch_mut(&mut self) -> &mut DepartureRunwayLatch {
        &mut self.departure
    }
}

impl RunwaySource for ReferenceRunways {
    fn runways(&self) -> Vec<Runway> {
        self.destination
            .into_iter()
            .chain(self.departure.runway())
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
        }
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
    fn the_latch_follows_the_aircraft_while_it_is_slow_on_the_ground() {
        let mut latch = DepartureRunwayLatch::default();
        assert!(latch.runway().is_none());

        latch.update(true, 10., GridPosition::new(1., 2.), 50.);
        latch.update(true, 20., GridPosition::new(1.001, 2.), 52.);
        let runway = latch.runway().unwrap();
        assert_eq!(runway.reference_point, GridPosition::new(1.001, 2.));
        assert_eq!(runway.elevation_ft, 52.);
        assert_eq!(runway.origin, RunwayOrigin::Departure);
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
}
