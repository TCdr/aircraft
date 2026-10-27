//! The terrain grid and the obstacle grid of the A320 predictive terrain functions: the grid files of the aircraft
//! package, read block by block through the simulator's asynchronous file access. Outside the simulator (tests, host
//! builds) there is no file access and the grids are never loaded.

use systems::surveillance::egpws::terrain_grid::TerrainGrid;

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn terrain_grid() -> Box<dyn TerrainGrid> {
    Box::new(systems::surveillance::egpws::terrain_grid::UnavailableTerrainGrid)
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn terrain_grid() -> Box<dyn TerrainGrid> {
    Box::new(production::terrain_grid())
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn obstacle_grid() -> Box<dyn TerrainGrid> {
    Box::new(systems::surveillance::egpws::terrain_grid::UnavailableTerrainGrid)
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn obstacle_grid() -> Box<dyn TerrainGrid> {
    Box::new(production::obstacle_grid())
}

#[cfg(target_arch = "wasm32")]
mod production {
    use systems::surveillance::egpws::terrain_grid::TerrainGridCache;
    use systems_wasm::terrain_grid_loader::FsIoBlockReader;

    /// Path of the grid file relative to the root of the aircraft package.
    const GRID_FILE: &str = "./SimObjects/AirPlanes/FlyByWire_A320_NEO/panel/terrain_grid.bin";

    /// Path of the obstacle file, which has the layout of the terrain grid file
    const OBSTACLE_GRID_FILE: &str =
        "./SimObjects/AirPlanes/FlyByWire_A320_NEO/panel/obstacle_grid.bin";

    pub(super) fn terrain_grid() -> TerrainGridCache<FsIoBlockReader> {
        TerrainGridCache::new(FsIoBlockReader::new(GRID_FILE))
    }

    pub(super) fn obstacle_grid() -> TerrainGridCache<FsIoBlockReader> {
        TerrainGridCache::new(FsIoBlockReader::new(OBSTACLE_GRID_FILE))
    }
}
