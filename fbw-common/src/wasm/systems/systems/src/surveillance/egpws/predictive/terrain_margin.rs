//! The margin added to the terrain elevation of the grid so that real peaks are not under-estimated.
//!
//! The grid stores the highest elevation of each 1 arcminute cell, but the source data is averaged, and the peaks of
//! rugged terrain read 100 to 300 m too low in it. Averaging lowers a peak only where there is relief around it, flat
//! ground is read correctly. A constant margin would make every flight over flat land at 1000 ft above the ground
//! look like a threat, so the margin is scaled with the relief around the cell.

use crate::surveillance::egpws::terrain_grid::{
    GridPosition, TerrainElevationSource, TerrainSample,
};

/// Design choice: the largest peak error found in the source data, 300 m. A peak the grid places 300 m too low must
/// not let the aircraft pass it with less clearance than the required terrain clearance.
pub(super) const MAXIMUM_PEAK_MARGIN_FT: f64 = 984.;

/// Design choice: the relief at which the full margin applies, 1000 m between the cell and the lowest neighbour
/// cell. A third of that relief, a ridge of 330 m, is read about 100 m too low, which is the lower end of the error
/// range.
const RELIEF_FOR_FULL_MARGIN_FT: f64 = 3_281.;

const CELL_DEGREES: f64 = 1. / 60.;

/// How terrain elevations are raised before they are compared with the aircraft path: by up to the maximum margin,
/// depending on the relief around the cell.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct TerrainMargin {
    maximum_ft: f64,
}

impl TerrainMargin {
    /// The margin for the peak error of the grid data.
    pub(super) fn for_grid_peak_error() -> Self {
        Self {
            maximum_ft: MAXIMUM_PEAK_MARGIN_FT,
        }
    }

    /// No margin, for tests of the alerting logic against the published test cases.
    #[cfg(test)]
    pub(super) fn none() -> Self {
        Self { maximum_ft: 0. }
    }

    pub(super) fn maximum_ft(&self) -> f64 {
        self.maximum_ft
    }

    pub(super) fn margin_ft(
        &self,
        terrain: &dyn TerrainElevationSource,
        position: GridPosition,
        elevation_ft: f64,
    ) -> f64 {
        if self.maximum_ft == 0. {
            return 0.;
        }
        self.maximum_ft * relief_fraction(terrain, position, elevation_ft)
    }
}

/// How much of the full margin applies: 0 on flat ground, 1 where the relief is 1000 m or more.
fn relief_fraction(
    terrain: &dyn TerrainElevationSource,
    position: GridPosition,
    elevation_ft: f64,
) -> f64 {
    let mut lowest_neighbour_ft = elevation_ft;
    for latitude_step in [-1., 0., 1.] {
        for longitude_step in [-1., 0., 1.] {
            if latitude_step == 0. && longitude_step == 0. {
                continue;
            }
            let neighbour = GridPosition::new(
                position.latitude_degrees + latitude_step * CELL_DEGREES,
                position.longitude_degrees + longitude_step * CELL_DEGREES,
            );
            match terrain.max_elevation_at(neighbour) {
                TerrainSample::ElevationFeet(neighbour_ft) => {
                    lowest_neighbour_ft = lowest_neighbour_ft.min(neighbour_ft)
                }
                // Not knowing the neighbours must not shrink the margin
                TerrainSample::NotLoaded | TerrainSample::Failed => return 1.,
                TerrainSample::OutsideCoverage => {}
            }
        }
    }

    let relief_ft = elevation_ft - lowest_neighbour_ft;
    (relief_ft / RELIEF_FOR_FULL_MARGIN_FT).clamp(0., 1.)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surveillance::egpws::predictive::test_support::TestTerrain;

    #[test]
    fn flat_terrain_gets_no_margin() {
        let terrain = TestTerrain::flat(2_000.);
        let margin = TerrainMargin::for_grid_peak_error().margin_ft(
            &terrain,
            GridPosition::new(46., 8.),
            2_000.,
        );
        assert_eq!(margin, 0.);
    }

    #[test]
    fn a_peak_above_its_surroundings_gets_the_margin_for_its_relief() {
        let peak = GridPosition::new(46.0083, 8.0083);
        let terrain = TestTerrain::new(move |position| {
            let is_peak = (position.latitude_degrees - peak.latitude_degrees).abs() < 0.001
                && (position.longitude_degrees - peak.longitude_degrees).abs() < 0.001;
            TerrainSample::ElevationFeet(if is_peak { 5_000. } else { 3_360. })
        });
        // 1640 ft of relief is half of the relief for the full margin
        let margin = TerrainMargin::for_grid_peak_error().margin_ft(&terrain, peak, 5_000.);
        assert!(
            (margin - MAXIMUM_PEAK_MARGIN_FT / 2.).abs() < 5.,
            "{margin}"
        );
    }

    #[test]
    fn the_margin_never_exceeds_the_maximum() {
        let peak = GridPosition::new(46.0083, 8.0083);
        let terrain = TestTerrain::new(move |position| {
            let is_peak = (position.latitude_degrees - peak.latitude_degrees).abs() < 0.001
                && (position.longitude_degrees - peak.longitude_degrees).abs() < 0.001;
            TerrainSample::ElevationFeet(if is_peak { 14_000. } else { 0. })
        });
        let margin = TerrainMargin::for_grid_peak_error().margin_ft(&terrain, peak, 14_000.);
        assert_eq!(margin, MAXIMUM_PEAK_MARGIN_FT);
    }

    #[test]
    fn a_missing_neighbour_gives_the_full_margin() {
        let terrain = TestTerrain::new(|_| TerrainSample::NotLoaded);
        let margin = TerrainMargin::for_grid_peak_error().margin_ft(
            &terrain,
            GridPosition::new(46., 8.),
            1_000.,
        );
        assert_eq!(margin, MAXIMUM_PEAK_MARGIN_FT);
    }

    #[test]
    fn the_margin_can_be_switched_off() {
        let terrain = TestTerrain::new(|position| {
            TerrainSample::ElevationFeet(if position.latitude_degrees > 46. {
                5_000.
            } else {
                0.
            })
        });
        assert_eq!(
            TerrainMargin::none().margin_ft(&terrain, GridPosition::new(46.01, 8.), 5_000.),
            0.
        );
        assert_eq!(TerrainMargin::none().maximum_ft(), 0.);
    }
}
