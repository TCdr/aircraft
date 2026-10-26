//! The mountainous approach area (MAA): terrain more than 2000 ft above the runway within 6 NM of it. Near such a
//! runway the terrain warning reaches less far ahead, because the terrain around the runway is close to the approach
//! path on every landing.
//!
//! There is no list of mountainous runways. The area is derived from the terrain grid around the runway.

use super::{
    geometry::offset_position,
    runway::{Runway, RunwayContext},
};
use crate::surveillance::egpws::terrain_grid::{
    GridPosition, TerrainElevationSource, TerrainSample,
};

const AREA_RADIUS_NM: f64 = 6.;
const TERRAIN_ABOVE_RUNWAY_FT: f64 = 2_000.;

const FULL_WARNING_LOOK_AHEAD_S: f64 = 120.;
const REDUCED_WARNING_LOOK_AHEAD_S: f64 = 30.;

/// The grid cells are 1 NM wide, so the area is sampled on rings 1 NM apart with the samples about 1 NM apart.
const RING_SPACING_NM: f64 = 1.;

fn is_mountainous(terrain: &dyn TerrainElevationSource, runway: &Runway) -> Option<bool> {
    // Around the centre of a known runway the area reaches half its length further, to about 6 NM from its ends
    let highest_ft = highest_terrain_around(
        terrain,
        runway.centre(),
        AREA_RADIUS_NM + runway.length_nm() / 2.,
    )?;
    Some(highest_ft - runway.elevation_ft > TERRAIN_ABOVE_RUNWAY_FT)
}

/// None as long as part of the area is not known, because the missing part could hold the mountain.
fn highest_terrain_around(
    terrain: &dyn TerrainElevationSource,
    centre: GridPosition,
    radius_nm: f64,
) -> Option<f64> {
    let mut highest_ft = f64::MIN;
    let rings = (radius_nm / RING_SPACING_NM).round() as usize;
    for ring in 0..=rings {
        let radius_nm = ring as f64 * RING_SPACING_NM;
        let samples = if ring == 0 {
            1
        } else {
            (2. * std::f64::consts::PI * radius_nm / RING_SPACING_NM).ceil() as usize
        };
        for sample in 0..samples {
            let bearing = 360. * sample as f64 / samples as f64;
            match terrain.max_elevation_at(offset_position(centre, bearing, radius_nm)) {
                TerrainSample::ElevationFeet(elevation_ft) => {
                    highest_ft = highest_ft.max(elevation_ft)
                }
                TerrainSample::OutsideCoverage => {}
                TerrainSample::NotLoaded | TerrainSample::Failed => return None,
            }
        }
    }
    (highest_ft > f64::MIN).then_some(highest_ft)
}

/// Remembers the answer for the runway, as the terrain around a runway does not change during the flight.
#[derive(Default)]
pub(super) struct MountainousApproachAreas {
    evaluated: Option<(Runway, bool)>,
}

impl MountainousApproachAreas {
    /// Whether the runway is in a mountainous approach area, None while the grid around it is not loaded.
    pub(super) fn is_mountainous(
        &mut self,
        terrain: &dyn TerrainElevationSource,
        runway: &Runway,
    ) -> Option<bool> {
        if let Some((evaluated_runway, mountainous)) = self.evaluated {
            if evaluated_runway == *runway {
                return Some(mountainous);
            }
        }
        let mountainous = is_mountainous(terrain, runway)?;
        self.evaluated = Some((*runway, mountainous));
        Some(mountainous)
    }
}

/// How far ahead the terrain warning looks, in seconds. Inside the area it shrinks linearly from the full look-ahead
/// at the edge of the area to a third of it at the runway. Design choice: the variable of the reduction is not
/// published, the distance to the runway is the one an aircraft on approach is bound to reduce.
pub(super) fn warning_look_ahead_s(mountainous: bool, runway: Option<&RunwayContext>) -> f64 {
    match runway {
        Some(runway) if mountainous && runway.distance_nm < AREA_RADIUS_NM => {
            REDUCED_WARNING_LOOK_AHEAD_S
                + (FULL_WARNING_LOOK_AHEAD_S - REDUCED_WARNING_LOOK_AHEAD_S)
                    * runway.distance_nm.max(0.)
                    / AREA_RADIUS_NM
        }
        _ => FULL_WARNING_LOOK_AHEAD_S,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surveillance::egpws::predictive::{
        geometry::distance_nm,
        runway::{RunwayGeometry, RunwayOrigin, FEET_PER_NAUTICAL_MILE},
        test_support::TestTerrain,
    };

    const RUNWAY_POINT: GridPosition = GridPosition {
        latitude_degrees: 46.,
        longitude_degrees: 8.,
    };

    fn runway(elevation_ft: f64) -> Runway {
        Runway {
            reference_point: RUNWAY_POINT,
            elevation_ft,
            origin: RunwayOrigin::Destination,
            geometry: None,
        }
    }

    /// Flat land at 1000 ft with a mountain of the given height at the given distance from the runway.
    fn terrain_with_mountain(distance_nm: f64, mountain_ft: f64) -> TestTerrain {
        let mountain = offset_position(RUNWAY_POINT, 45., distance_nm);
        TestTerrain::new(move |position| {
            TerrainSample::ElevationFeet(if distance_nm_between(position, mountain) < 0.8 {
                mountain_ft
            } else {
                1_000.
            })
        })
    }

    fn distance_nm_between(a: GridPosition, b: GridPosition) -> f64 {
        distance_nm(a, b)
    }

    fn context(distance_nm: f64) -> RunwayContext {
        RunwayContext {
            runway: runway(1_000.),
            distance_nm,
            height_above_runway_ft: 500.,
        }
    }

    #[test]
    fn terrain_over_2000_ft_above_the_runway_within_6_nm_makes_a_mountainous_area() {
        let terrain = terrain_with_mountain(5., 3_200.);
        assert_eq!(
            MountainousApproachAreas::default().is_mountainous(&terrain, &runway(1_000.)),
            Some(true)
        );
    }

    #[test]
    fn terrain_2000_ft_above_the_runway_or_less_does_not() {
        let terrain = terrain_with_mountain(5., 2_900.);
        assert_eq!(
            MountainousApproachAreas::default().is_mountainous(&terrain, &runway(1_000.)),
            Some(false)
        );
    }

    #[test]
    fn a_mountain_beyond_6_nm_does_not() {
        let terrain = terrain_with_mountain(8., 9_000.);
        assert_eq!(
            MountainousApproachAreas::default().is_mountainous(&terrain, &runway(1_000.)),
            Some(false)
        );
    }

    #[test]
    fn the_area_of_a_known_runway_reaches_6_nm_from_its_far_end() {
        // The mountain is 8 NM from the threshold, but 6 NM from the far end of a 2 NM runway that heads towards it
        let terrain = terrain_with_mountain(7.8, 5_000.);
        let known_runway = Runway {
            geometry: Some(RunwayGeometry {
                true_heading_deg: 45.,
                length_ft: 2. * FEET_PER_NAUTICAL_MILE,
            }),
            ..runway(1_000.)
        };
        assert_eq!(
            MountainousApproachAreas::default().is_mountainous(&terrain, &known_runway),
            Some(true)
        );
        assert_eq!(
            MountainousApproachAreas::default().is_mountainous(&terrain, &runway(1_000.)),
            Some(false)
        );
    }

    #[test]
    fn the_area_is_unknown_while_the_grid_is_not_loaded() {
        let terrain = TestTerrain::new(|_| TerrainSample::NotLoaded);
        assert_eq!(
            MountainousApproachAreas::default().is_mountainous(&terrain, &runway(0.)),
            None
        );
    }

    #[test]
    fn the_result_is_kept_for_the_same_runway() {
        let mut areas = MountainousApproachAreas::default();
        let terrain = terrain_with_mountain(5., 5_000.);
        assert_eq!(areas.is_mountainous(&terrain, &runway(1_000.)), Some(true));
        // Answered from the memory, whatever the terrain says now
        let flat = TestTerrain::flat(0.);
        assert_eq!(areas.is_mountainous(&flat, &runway(1_000.)), Some(true));
        // A different runway is evaluated again
        assert_eq!(areas.is_mountainous(&flat, &runway(1_001.)), Some(false));
    }

    #[test]
    fn the_warning_look_ahead_is_not_reduced_outside_a_mountainous_area() {
        assert_eq!(warning_look_ahead_s(false, Some(&context(1.))), 120.);
        assert_eq!(warning_look_ahead_s(true, None), 120.);
    }

    #[test]
    fn the_warning_look_ahead_shrinks_linearly_to_30_s_at_the_runway() {
        assert_eq!(warning_look_ahead_s(true, Some(&context(6.))), 120.);
        assert_eq!(warning_look_ahead_s(true, Some(&context(3.))), 75.);
        assert_eq!(warning_look_ahead_s(true, Some(&context(0.))), 30.);
    }
}
