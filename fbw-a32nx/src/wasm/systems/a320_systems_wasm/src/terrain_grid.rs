//! The terrain grid of the A320 predictive terrain functions: the grid file of the aircraft package, read block by
//! block through the simulator's asynchronous file access. Outside the simulator (tests, host builds) there is no
//! file access and the grid is never loaded.

use systems::surveillance::egpws::terrain_grid::TerrainGrid;

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn terrain_grid() -> Box<dyn TerrainGrid> {
    Box::new(systems::surveillance::egpws::terrain_grid::UnavailableTerrainGrid)
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn terrain_grid() -> Box<dyn TerrainGrid> {
    Box::new(production::grid())
}

#[cfg(target_arch = "wasm32")]
mod production {
    use systems::surveillance::egpws::terrain_grid::TerrainGridCache;
    use systems_wasm::terrain_grid_loader::FsIoBlockReader;

    /// Path of the grid file relative to the root of the aircraft package.
    const GRID_FILE: &str = "./SimObjects/AirPlanes/FlyByWire_A320_NEO/panel/terrain_grid.bin";

    pub(super) fn grid() -> TerrainGridCache<FsIoBlockReader> {
        TerrainGridCache::new(FsIoBlockReader::new(GRID_FILE))
    }
}
