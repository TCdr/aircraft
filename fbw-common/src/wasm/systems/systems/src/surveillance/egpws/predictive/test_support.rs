//! Terrain and runway sources for the tests of the predictive functions.

use crate::surveillance::egpws::terrain_grid::{
    GridPosition, TerrainElevationSource, TerrainSample,
};

const CELL_DEGREES: f64 = 1. / 60.;

/// Terrain described by a function of the position, evaluated at the centre of the 1 arcminute cell like the real
/// grid.
pub(super) struct TestTerrain(Box<dyn Fn(GridPosition) -> TerrainSample>);

impl TestTerrain {
    pub(super) fn new(elevation_at: impl Fn(GridPosition) -> TerrainSample + 'static) -> Self {
        Self(Box::new(move |position| {
            elevation_at(GridPosition::new(
                (position.latitude_degrees / CELL_DEGREES).floor() * CELL_DEGREES
                    + CELL_DEGREES / 2.,
                (position.longitude_degrees / CELL_DEGREES).floor() * CELL_DEGREES
                    + CELL_DEGREES / 2.,
            ))
        }))
    }

    pub(super) fn flat(elevation_ft: f64) -> Self {
        Self::new(move |_| TerrainSample::ElevationFeet(elevation_ft))
    }

    /// An obstacle database with nothing in it: the cells hold 0 ft, like the cells of the real file without obstacles.
    pub(super) fn no_obstacles() -> Self {
        Self::flat(0.)
    }

    /// A single obstacle top in the cell around the position, nothing anywhere else.
    pub(super) fn tower_at(tower: GridPosition, top_ft: f64) -> Self {
        let cell_of = |position: GridPosition| {
            (
                (position.latitude_degrees / CELL_DEGREES).floor(),
                (position.longitude_degrees / CELL_DEGREES).floor(),
            )
        };
        Self::new(move |position| {
            TerrainSample::ElevationFeet(if cell_of(position) == cell_of(tower) {
                top_ft
            } else {
                0.
            })
        })
    }

    /// Flat terrain with a plateau at the given elevation for everything north of the latitude.
    pub(super) fn wall_north_of(wall_latitude: f64, base_ft: f64, wall_ft: f64) -> Self {
        Self::new(move |position| {
            TerrainSample::ElevationFeet(if position.latitude_degrees >= wall_latitude {
                wall_ft
            } else {
                base_ft
            })
        })
    }
}

impl TerrainElevationSource for TestTerrain {
    fn max_elevation_at(&self, position: GridPosition) -> TerrainSample {
        (self.0)(position)
    }
}
