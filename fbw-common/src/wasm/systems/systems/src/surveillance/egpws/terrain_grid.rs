//! Terrain elevation grid for the terrain alerting: a worldwide grid of 1 arcminute cells holding the highest terrain of
//! each cell, stored in 5 degree blocks that are deflated one by one so that only the few blocks around the aircraft
//! have to be read and kept in memory. How the bytes of the file are fetched is left to a [`BlockReader`], because the
//! simulator offers only asynchronous file access.
//!
//! The file is written by `tools/taws-terrain-grid/build_grid.py`, which also documents the layout.

use miniz_oxide::inflate::decompress_to_vec_with_limit;
use std::collections::VecDeque;
use std::time::Duration;

const MAGIC: &[u8; 8] = b"TAWSGRID";
const SUPPORTED_VERSION: u32 = 1;
pub const HEADER_SIZE: usize = 64;
pub const INDEX_ENTRY_SIZE: usize = 12;

const KIND_DEFLATED: u8 = 0;
const KIND_CONSTANT: u8 = 1;

const METRES_PER_STEP: f64 = 50.;
const FEET_PER_METRE: f64 = 3.280_839_895;

/// Cells are stepped through one at a time along a segment so that no cell on the way is skipped.
const MAXIMUM_SEGMENT_SAMPLES: usize = 20_000;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GridPosition {
    pub latitude_degrees: f64,
    pub longitude_degrees: f64,
}

impl GridPosition {
    pub fn new(latitude_degrees: f64, longitude_degrees: f64) -> Self {
        Self {
            latitude_degrees,
            longitude_degrees,
        }
    }
}

/// What a terrain query can answer. "Not loaded" and "failed" are kept apart from a real elevation so that the alerting
/// never mistakes missing data for flat terrain at sea level.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TerrainSample {
    /// Highest terrain in the queried cell or along the queried segment, in feet. Water counts as 0 ft.
    ElevationFeet(f64),
    /// The block holding the answer has been requested but has not arrived yet.
    NotLoaded,
    /// The grid has no data at that place (beyond the covered latitudes).
    OutsideCoverage,
    /// The file is unreadable or the block is corrupt; waiting will not help.
    Failed,
}

impl TerrainSample {
    /// Merges two answers into the answer for both places together. A missing block anywhere on a segment makes the
    /// whole segment unknown, because the missing part could hold the dangerous terrain.
    fn combine(self, other: Self) -> Self {
        use TerrainSample::*;
        match (self, other) {
            (Failed, _) | (_, Failed) => Failed,
            (NotLoaded, _) | (_, NotLoaded) => NotLoaded,
            (ElevationFeet(a), ElevationFeet(b)) => ElevationFeet(a.max(b)),
            (ElevationFeet(a), OutsideCoverage) | (OutsideCoverage, ElevationFeet(a)) => {
                ElevationFeet(a)
            }
            (OutsideCoverage, OutsideCoverage) => OutsideCoverage,
        }
    }
}

pub trait TerrainElevationSource {
    /// Highest terrain in the 1 arcminute cell containing the position.
    fn max_elevation_at(&self, position: GridPosition) -> TerrainSample;

    /// Highest terrain along the straight (in latitude/longitude) segment, looking at every cell the segment crosses.
    fn max_elevation_along(&self, start: GridPosition, end: GridPosition) -> TerrainSample {
        let latitude_span = end.latitude_degrees - start.latitude_degrees;
        // A segment across the antimeridian goes the short way round, not through the whole world.
        let mut longitude_span = end.longitude_degrees - start.longitude_degrees;
        if longitude_span > 180. {
            longitude_span -= 360.;
        } else if longitude_span < -180. {
            longitude_span += 360.;
        }
        let cells_crossed = latitude_span.abs().max(longitude_span.abs()) * CELLS_PER_DEGREE_F64;
        let samples = (cells_crossed.ceil() as usize).clamp(1, MAXIMUM_SEGMENT_SAMPLES);

        (0..=samples)
            .map(|step| {
                let fraction = step as f64 / samples as f64;
                self.max_elevation_at(GridPosition::new(
                    start.latitude_degrees + latitude_span * fraction,
                    start.longitude_degrees + longitude_span * fraction,
                ))
            })
            .reduce(TerrainSample::combine)
            .unwrap_or(TerrainSample::OutsideCoverage)
    }
}

const CELLS_PER_DEGREE_F64: f64 = 60.;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GridError {
    TooShort,
    BadMagic,
    UnsupportedVersion(u32),
    InconsistentLayout,
    BadIndexEntry,
    CorruptBlock,
}

/// Geometry of the grid, read from the file header.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GridLayout {
    cells_per_degree: u32,
    south_degrees: i32,
    west_degrees: i32,
    height_degrees: u32,
    width_degrees: u32,
    block_degrees: u32,
    block_rows: u32,
    block_columns: u32,
    index_offset: u32,
}

fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
}

impl GridLayout {
    pub fn parse(header: &[u8]) -> Result<Self, GridError> {
        if header.len() < HEADER_SIZE {
            return Err(GridError::TooShort);
        }
        if &header[..8] != MAGIC {
            return Err(GridError::BadMagic);
        }
        let version = read_u32(header, 8);
        if version != SUPPORTED_VERSION {
            return Err(GridError::UnsupportedVersion(version));
        }

        let layout = Self {
            cells_per_degree: read_u32(header, 12),
            south_degrees: read_u32(header, 16) as i32,
            west_degrees: read_u32(header, 20) as i32,
            height_degrees: read_u32(header, 24),
            width_degrees: read_u32(header, 28),
            block_degrees: read_u32(header, 32),
            block_rows: read_u32(header, 36),
            block_columns: read_u32(header, 40),
            index_offset: read_u32(header, 44),
        };

        let blocks_cover_coverage = layout.block_degrees > 0
            && layout.block_rows * layout.block_degrees >= layout.height_degrees
            && layout.block_columns * layout.block_degrees >= layout.width_degrees;
        if layout.cells_per_degree == 0 || !blocks_cover_coverage {
            return Err(GridError::InconsistentLayout);
        }
        Ok(layout)
    }

    pub fn index_offset(&self) -> usize {
        self.index_offset as usize
    }

    pub fn block_count(&self) -> usize {
        (self.block_rows * self.block_columns) as usize
    }

    pub fn index_size(&self) -> usize {
        self.block_count() * INDEX_ENTRY_SIZE
    }

    fn cells_per_block_side(&self) -> usize {
        (self.cells_per_degree * self.block_degrees) as usize
    }

    fn cells_per_block(&self) -> usize {
        self.cells_per_block_side() * self.cells_per_block_side()
    }

    /// Finds the block and the cell inside it for a position. Longitudes wrap around the antimeridian; latitudes
    /// outside the covered band have no cell.
    fn locate(&self, position: GridPosition) -> Option<(BlockId, usize)> {
        let degrees_north = position.latitude_degrees - f64::from(self.south_degrees);
        if !degrees_north.is_finite()
            || degrees_north < 0.
            || degrees_north >= self.height_degrees as f64
        {
            return None;
        }
        if !position.longitude_degrees.is_finite() {
            return None;
        }
        let degrees_east = (position.longitude_degrees - f64::from(self.west_degrees))
            .rem_euclid(f64::from(self.width_degrees));

        let cells_per_degree = f64::from(self.cells_per_degree);
        let cell_row = (degrees_north * cells_per_degree).floor() as usize;
        // rem_euclid can round up to exactly the width for tiny negative inputs.
        let cell_column = ((degrees_east * cells_per_degree).floor() as usize)
            .min((self.width_degrees * self.cells_per_degree) as usize - 1);

        let side = self.cells_per_block_side();
        let block = BlockId {
            row: (cell_row / side) as u32,
            column: (cell_column / side) as u32,
        };
        Some((block, (cell_row % side) * side + cell_column % side))
    }

    fn block_containing(&self, position: GridPosition) -> Option<BlockId> {
        self.locate(position).map(|(block, _)| block)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct BlockId {
    pub row: u32,
    pub column: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BlockKind {
    Deflated { offset: u32, length: u32 },
    Constant { value: u8 },
}

/// The header plus the table that says where each block lives in the file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GridIndex {
    layout: GridLayout,
    entries: Vec<BlockKind>,
}

impl GridIndex {
    pub fn parse(layout: GridLayout, index_bytes: &[u8]) -> Result<Self, GridError> {
        if index_bytes.len() < layout.index_size() {
            return Err(GridError::TooShort);
        }
        let entries = index_bytes
            .chunks_exact(INDEX_ENTRY_SIZE)
            .take(layout.block_count())
            .map(|entry| match entry[8] {
                KIND_DEFLATED => {
                    let length = read_u32(entry, 4);
                    if length == 0 {
                        Err(GridError::BadIndexEntry)
                    } else {
                        Ok(BlockKind::Deflated {
                            offset: read_u32(entry, 0),
                            length,
                        })
                    }
                }
                KIND_CONSTANT => Ok(BlockKind::Constant { value: entry[9] }),
                _ => Err(GridError::BadIndexEntry),
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self { layout, entries })
    }

    pub fn layout(&self) -> &GridLayout {
        &self.layout
    }

    fn entry(&self, block: BlockId) -> Option<BlockKind> {
        if block.row >= self.layout.block_rows || block.column >= self.layout.block_columns {
            return None;
        }
        self.entries
            .get((block.row * self.layout.block_columns + block.column) as usize)
            .copied()
    }

    /// Byte range of a block's compressed data in the file, `None` for constant blocks which have no data.
    pub fn block_byte_range(&self, block: BlockId) -> Option<(u32, u32)> {
        match self.entry(block)? {
            BlockKind::Deflated { offset, length } => Some((offset, length)),
            BlockKind::Constant { .. } => None,
        }
    }
}

/// Converts a stored cell value into feet. The stored value is 0 for water, otherwise one step above the ceiling of
/// the height in 50 m steps, so the result never undershoots the real terrain.
fn cell_to_feet(cell: u8) -> f64 {
    if cell == 0 {
        0.
    } else {
        f64::from(cell - 1) * METRES_PER_STEP * FEET_PER_METRE
    }
}

/// The decoded cells of one block.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DecodedBlock {
    cells: Vec<u8>,
}

impl DecodedBlock {
    pub fn decode(layout: &GridLayout, compressed: &[u8]) -> Result<Self, GridError> {
        let expected = layout.cells_per_block();
        let cells = decompress_to_vec_with_limit(compressed, expected)
            .map_err(|_| GridError::CorruptBlock)?;
        if cells.len() != expected {
            return Err(GridError::CorruptBlock);
        }
        Ok(Self { cells })
    }

    fn cell(&self, cell_index: usize) -> u8 {
        self.cells[cell_index]
    }
}

/// A chunk of the grid file to fetch.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ReadRequest {
    pub offset: u32,
    pub length: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ReadFailure;

#[derive(Debug, PartialEq, Eq)]
pub struct ReadCompletion {
    pub request: ReadRequest,
    pub outcome: Result<Vec<u8>, ReadFailure>,
}

/// Fetches byte ranges of the grid file without blocking. The cache issues one request at a time and calls `poll`
/// every update; an implementation may take as many updates as it likes to complete a request.
pub trait BlockReader {
    fn request(&mut self, request: ReadRequest);

    /// Returns the finished request, if one finished since the last call.
    fn poll(&mut self) -> Option<ReadCompletion>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PendingRead {
    Header,
    Index,
    Block(BlockId),
}

/// A block whose read failed. File access can fail for a moment (the simulator is busy loading), so the read is tried
/// again after a delay, a few times, before the block is given up for good.
struct BlockReadFailure {
    block: BlockId,
    attempts: u32,
    retry_in: Duration,
}

/// Keeps the blocks around the aircraft decoded in memory and loads them through a [`BlockReader`].
pub struct TerrainGridCache<R: BlockReader> {
    reader: R,
    layout: Option<GridLayout>,
    index: Option<GridIndex>,
    loaded: Vec<(BlockId, DecodedBlock)>,
    /// Blocks whose bytes arrived but cannot be decoded: reading them again gives the same bytes
    corrupt: Vec<BlockId>,
    unreadable: Vec<BlockReadFailure>,
    pending: Option<PendingRead>,
    /// Failed reads of the header or the index so far, and the time until the next try
    setup_read_failures: u32,
    setup_retry_in: Duration,
    unusable: bool,
}

impl<R: BlockReader> TerrainGridCache<R> {
    /// Design choice: time before a failed read is tried again, and how many reads of the same part of the file are
    /// tried before it is given up. A failure that is still there after this is not going to go away.
    const READ_RETRY_DELAY: Duration = Duration::from_secs(10);
    const MAXIMUM_READ_ATTEMPTS: u32 = 3;

    pub fn new(reader: R) -> Self {
        Self {
            reader,
            layout: None,
            index: None,
            loaded: Vec::new(),
            corrupt: Vec::new(),
            unreadable: Vec::new(),
            pending: None,
            setup_read_failures: 0,
            setup_retry_in: Duration::ZERO,
            unusable: false,
        }
    }

    pub fn reader(&self) -> &R {
        &self.reader
    }

    /// True once the header and index are known; before that every query answers `NotLoaded`.
    pub fn is_ready(&self) -> bool {
        self.index.is_some()
    }

    pub fn loaded_blocks(&self) -> Vec<BlockId> {
        self.loaded.iter().map(|(block, _)| *block).collect()
    }

    /// Advances loading. Call every update with the aircraft position so that the window follows the aircraft.
    pub fn update(&mut self, delta: Duration, aircraft: GridPosition) {
        self.handle_completion();
        self.setup_retry_in = self.setup_retry_in.saturating_sub(delta);
        for failure in &mut self.unreadable {
            failure.retry_in = failure.retry_in.saturating_sub(delta);
        }
        if self.unusable || self.pending.is_some() || !self.setup_retry_in.is_zero() {
            return;
        }

        let Some(layout) = self.layout else {
            self.issue(
                PendingRead::Header,
                ReadRequest {
                    offset: 0,
                    length: HEADER_SIZE as u32,
                },
            );
            return;
        };
        let Some(index) = &self.index else {
            self.issue(
                PendingRead::Index,
                ReadRequest {
                    offset: layout.index_offset,
                    length: layout.index_size() as u32,
                },
            );
            return;
        };

        let window = Self::window_around(&layout, aircraft);
        // Dropping blocks that left the window first keeps memory bounded when the aircraft crosses block edges.
        self.loaded.retain(|(block, _)| window.contains(block));

        let next = window.into_iter().find(|block| {
            let needs_data = index.block_byte_range(*block).is_some();
            needs_data
                && !self.corrupt.contains(block)
                && !self.is_waiting_for_retry_or_given_up(block)
                && !self.loaded.iter().any(|(loaded, _)| loaded == block)
        });
        if let Some(block) = next {
            if let Some((offset, length)) = index.block_byte_range(block) {
                self.issue(PendingRead::Block(block), ReadRequest { offset, length });
            }
        }
    }

    fn is_waiting_for_retry_or_given_up(&self, block: &BlockId) -> bool {
        self.unreadable.iter().any(|failure| {
            failure.block == *block
                && (!failure.retry_in.is_zero() || failure.attempts >= Self::MAXIMUM_READ_ATTEMPTS)
        })
    }

    fn has_given_up(&self, block: &BlockId) -> bool {
        self.unreadable.iter().any(|failure| {
            failure.block == *block && failure.attempts >= Self::MAXIMUM_READ_ATTEMPTS
        })
    }

    fn note_block_read_failure(&mut self, block: BlockId) {
        match self.unreadable.iter_mut().find(|f| f.block == block) {
            Some(failure) => {
                failure.attempts += 1;
                failure.retry_in = Self::READ_RETRY_DELAY;
            }
            None => self.unreadable.push(BlockReadFailure {
                block,
                attempts: 1,
                retry_in: Self::READ_RETRY_DELAY,
            }),
        }
    }

    fn note_setup_read_failure(&mut self) {
        self.setup_read_failures += 1;
        if self.setup_read_failures >= Self::MAXIMUM_READ_ATTEMPTS {
            self.unusable = true;
        } else {
            self.setup_retry_in = Self::READ_RETRY_DELAY;
        }
    }

    fn issue(&mut self, pending: PendingRead, request: ReadRequest) {
        self.pending = Some(pending);
        self.reader.request(request);
    }

    fn handle_completion(&mut self) {
        let Some(completion) = self.reader.poll() else {
            return;
        };
        let Some(pending) = self.pending.take() else {
            return;
        };
        match (pending, completion.outcome) {
            (PendingRead::Header, Ok(bytes)) => match GridLayout::parse(&bytes) {
                Ok(layout) => self.layout = Some(layout),
                Err(_) => self.unusable = true,
            },
            (PendingRead::Index, Ok(bytes)) => {
                match self.layout.map(|layout| GridIndex::parse(layout, &bytes)) {
                    Some(Ok(index)) => self.index = Some(index),
                    _ => self.unusable = true,
                }
            }
            (PendingRead::Block(block), Ok(bytes)) => {
                match self
                    .layout
                    .map(|layout| DecodedBlock::decode(&layout, &bytes))
                {
                    Some(Ok(decoded)) => {
                        self.unreadable.retain(|failure| failure.block != block);
                        self.loaded.push((block, decoded));
                    }
                    _ => self.corrupt.push(block),
                }
            }
            (PendingRead::Header | PendingRead::Index, Err(_)) => self.note_setup_read_failure(),
            (PendingRead::Block(block), Err(_)) => self.note_block_read_failure(block),
        }
    }

    /// The 3 x 3 blocks around the aircraft's block, the aircraft's own first. Rows do not wrap over the poles,
    /// columns wrap around the antimeridian.
    fn window_around(layout: &GridLayout, aircraft: GridPosition) -> VecDeque<BlockId> {
        let mut window = VecDeque::new();
        let Some(centre) = layout.block_containing(aircraft) else {
            return window;
        };
        let offsets: [(i64, i64); 9] = [
            (0, 0),
            (1, 0),
            (-1, 0),
            (0, 1),
            (0, -1),
            (1, 1),
            (1, -1),
            (-1, 1),
            (-1, -1),
        ];
        for (row_offset, column_offset) in offsets {
            let row = i64::from(centre.row) + row_offset;
            if row < 0 || row >= i64::from(layout.block_rows) {
                continue;
            }
            let column = (i64::from(centre.column) + column_offset)
                .rem_euclid(i64::from(layout.block_columns));
            window.push_back(BlockId {
                row: row as u32,
                column: column as u32,
            });
        }
        window
    }
}

impl<R: BlockReader> TerrainElevationSource for TerrainGridCache<R> {
    fn max_elevation_at(&self, position: GridPosition) -> TerrainSample {
        if self.unusable {
            return TerrainSample::Failed;
        }
        let Some(index) = &self.index else {
            return TerrainSample::NotLoaded;
        };
        let Some((block, cell_index)) = index.layout().locate(position) else {
            return TerrainSample::OutsideCoverage;
        };

        match index.entry(block) {
            // Constant blocks (open ocean) need no data, so they answer even outside the loaded window.
            Some(BlockKind::Constant { value }) => {
                TerrainSample::ElevationFeet(cell_to_feet(value))
            }
            Some(BlockKind::Deflated { .. }) => {
                if self.corrupt.contains(&block) || self.has_given_up(&block) {
                    return TerrainSample::Failed;
                }
                match self.loaded.iter().find(|(loaded, _)| *loaded == block) {
                    Some((_, decoded)) => {
                        TerrainSample::ElevationFeet(cell_to_feet(decoded.cell(cell_index)))
                    }
                    None => TerrainSample::NotLoaded,
                }
            }
            None => TerrainSample::Failed,
        }
    }
}

/// A terrain source that follows the aircraft: what the aircraft systems hold, whatever the way the grid is read.
pub trait TerrainGrid: TerrainElevationSource {
    /// Advances loading. Call every update with the aircraft position.
    fn update(&mut self, delta: Duration, aircraft: GridPosition);
}

impl<R: BlockReader> TerrainGrid for TerrainGridCache<R> {
    fn update(&mut self, delta: Duration, aircraft: GridPosition) {
        TerrainGridCache::update(self, delta, aircraft);
    }
}

/// The terrain source of an aircraft without a grid file reader: nothing is ever loaded, so the predictive functions
/// stay off.
#[derive(Default)]
pub struct UnavailableTerrainGrid;

impl TerrainElevationSource for UnavailableTerrainGrid {
    fn max_elevation_at(&self, _position: GridPosition) -> TerrainSample {
        TerrainSample::NotLoaded
    }
}

impl TerrainGrid for UnavailableTerrainGrid {
    fn update(&mut self, _delta: Duration, _aircraft: GridPosition) {}
}

/// A [`BlockReader`] that serves a grid file held in memory, completing each request after a chosen number of polls so
/// that tests can exercise the "not loaded yet" state.
#[cfg(test)]
pub(crate) struct InMemoryBlockReader {
    file: Vec<u8>,
    polls_per_request: usize,
    in_flight: Option<(ReadRequest, usize)>,
    pub requests: Vec<ReadRequest>,
}

#[cfg(test)]
impl InMemoryBlockReader {
    pub(crate) fn new(file: Vec<u8>, polls_per_request: usize) -> Self {
        Self {
            file,
            polls_per_request,
            in_flight: None,
            requests: Vec::new(),
        }
    }
}

#[cfg(test)]
impl BlockReader for InMemoryBlockReader {
    fn request(&mut self, request: ReadRequest) {
        self.requests.push(request);
        self.in_flight = Some((request, self.polls_per_request));
    }

    fn poll(&mut self) -> Option<ReadCompletion> {
        let (request, polls_left) = self.in_flight.as_mut().map(|(r, n)| (*r, n))?;
        if *polls_left > 0 {
            *polls_left -= 1;
            return None;
        }
        self.in_flight = None;
        let start = request.offset as usize;
        let end = start + request.length as usize;
        let outcome = self
            .file
            .get(start..end)
            .map(<[u8]>::to_vec)
            .ok_or(ReadFailure);
        Some(ReadCompletion { request, outcome })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use miniz_oxide::deflate::compress_to_vec;

    // A tiny grid keeps the tests fast: 2 cells per degree and 5 degree blocks make 10 x 10 cell blocks. It spans
    // latitudes -84..86 (34 block rows) and the whole world in longitude (72 block columns), like the shipped file.
    const UPDATE_STEP: Duration = Duration::from_millis(50);
    const TEST_CELLS_PER_DEGREE: u32 = 2;
    const TEST_BLOCK_SIDE: usize = 10;
    const TEST_COVERAGE_HEIGHT: u32 = 167;
    const TEST_BLOCK_ROWS: u32 = 34;
    const TEST_BLOCK_COLUMNS: u32 = 72;

    fn id(row: u32, column: u32) -> BlockId {
        BlockId { row, column }
    }

    enum TestBlock {
        Constant(u8),
        Cells(Vec<u8>),
    }

    /// Cell value that depends on the block, so that a wrong block shows up as a wrong elevation.
    fn block_with_pattern(seed: u8) -> TestBlock {
        TestBlock::Cells(
            (0..TEST_BLOCK_SIDE * TEST_BLOCK_SIDE)
                .map(|cell| seed.wrapping_add(cell as u8 % 7) + 1)
                .collect(),
        )
    }

    fn build_grid_file(block_at: impl Fn(u32, u32) -> TestBlock) -> Vec<u8> {
        let block_count = (TEST_BLOCK_ROWS * TEST_BLOCK_COLUMNS) as usize;
        let data_start = HEADER_SIZE + block_count * INDEX_ENTRY_SIZE;

        let mut header = Vec::new();
        header.extend_from_slice(MAGIC);
        for value in [
            SUPPORTED_VERSION,
            TEST_CELLS_PER_DEGREE,
            (-84i32) as u32,
            (-180i32) as u32,
            TEST_COVERAGE_HEIGHT,
            360,
            5,
            TEST_BLOCK_ROWS,
            TEST_BLOCK_COLUMNS,
            HEADER_SIZE as u32,
        ] {
            header.extend_from_slice(&value.to_le_bytes());
        }
        header.resize(HEADER_SIZE, 0);

        let mut index = Vec::new();
        let mut data = Vec::new();
        for row in 0..TEST_BLOCK_ROWS {
            for column in 0..TEST_BLOCK_COLUMNS {
                match block_at(row, column) {
                    TestBlock::Constant(value) => {
                        index.extend_from_slice(&0u32.to_le_bytes());
                        index.extend_from_slice(&0u32.to_le_bytes());
                        index.extend_from_slice(&[KIND_CONSTANT, value, 0, 0]);
                    }
                    TestBlock::Cells(cells) => {
                        let compressed = compress_to_vec(&cells, 6);
                        index.extend_from_slice(&((data_start + data.len()) as u32).to_le_bytes());
                        index.extend_from_slice(&(compressed.len() as u32).to_le_bytes());
                        index.extend_from_slice(&[KIND_DEFLATED, 0, 0, 0]);
                        data.extend_from_slice(&compressed);
                    }
                }
            }
        }
        [header, index, data].concat()
    }

    fn default_file() -> Vec<u8> {
        build_grid_file(|row, column| {
            if row == 20 && column == 10 {
                block_with_pattern(0)
            } else if row == 20 && column == 11 {
                TestBlock::Cells(vec![101; TEST_BLOCK_SIDE * TEST_BLOCK_SIDE])
            } else if (row + column) % 5 == 0 {
                block_with_pattern(row as u8)
            } else {
                TestBlock::Constant(0)
            }
        })
    }

    fn layout_of(file: &[u8]) -> GridLayout {
        GridLayout::parse(&file[..HEADER_SIZE]).unwrap()
    }

    fn ready_cache(file: Vec<u8>, at: GridPosition) -> TerrainGridCache<InMemoryBlockReader> {
        let mut cache = TerrainGridCache::new(InMemoryBlockReader::new(file, 0));
        for _ in 0..30 {
            cache.update(UPDATE_STEP, at);
        }
        cache
    }

    #[test]
    fn header_is_parsed_and_checked() {
        let file = default_file();
        let layout = layout_of(&file);
        assert_eq!(layout.block_count(), 34 * 72);
        assert_eq!(layout.index_size(), 34 * 72 * INDEX_ENTRY_SIZE);

        let mut wrong_magic = file.clone();
        wrong_magic[0] = b'X';
        assert_eq!(GridLayout::parse(&wrong_magic), Err(GridError::BadMagic));

        let mut wrong_version = file.clone();
        wrong_version[8] = 9;
        assert_eq!(
            GridLayout::parse(&wrong_version),
            Err(GridError::UnsupportedVersion(9))
        );
        assert_eq!(GridLayout::parse(&file[..10]), Err(GridError::TooShort));
    }

    #[test]
    fn index_rejects_unknown_kind_and_short_table() {
        let file = default_file();
        let layout = layout_of(&file);
        let index_bytes = &file[HEADER_SIZE..HEADER_SIZE + layout.index_size()];
        assert!(GridIndex::parse(layout, index_bytes).is_ok());
        assert_eq!(
            GridIndex::parse(layout, &index_bytes[..100]),
            Err(GridError::TooShort)
        );
        let mut broken = index_bytes.to_vec();
        broken[8] = 7;
        assert_eq!(
            GridIndex::parse(layout, &broken),
            Err(GridError::BadIndexEntry)
        );
    }

    #[test]
    fn block_is_decoded_and_wrong_data_is_rejected() {
        let file = default_file();
        let layout = layout_of(&file);
        let index = GridIndex::parse(
            layout,
            &file[HEADER_SIZE..HEADER_SIZE + layout.index_size()],
        )
        .unwrap();
        let (offset, length) = index.block_byte_range(id(20, 11)).unwrap();
        let compressed = &file[offset as usize..(offset + length) as usize];

        let decoded = DecodedBlock::decode(&layout, compressed).unwrap();
        assert_eq!(decoded.cell(0), 101);

        assert_eq!(
            DecodedBlock::decode(&layout, &compressed[..compressed.len() / 2]),
            Err(GridError::CorruptBlock)
        );
        let wrong_size = compress_to_vec(&[1, 2, 3], 6);
        assert_eq!(
            DecodedBlock::decode(&layout, &wrong_size),
            Err(GridError::CorruptBlock)
        );
    }

    #[test]
    fn locate_finds_block_and_cell_in_the_middle() {
        let layout = layout_of(&default_file());
        // 10 deg north of the southern edge, 20 deg east of the western edge: block (2, 4), cell (0, 0)
        let (block, cell) = layout.locate(GridPosition::new(-74., -160.)).unwrap();
        assert_eq!(block, id(2, 4));
        assert_eq!(cell, 0);

        // half a degree further north-east is one cell up and right (2 cells per degree in the test grid)
        let (block, cell) = layout.locate(GridPosition::new(-73.5, -159.5)).unwrap();
        assert_eq!(block, id(2, 4));
        assert_eq!(cell, TEST_BLOCK_SIDE + 1);
    }

    #[test]
    fn locate_handles_the_coverage_edges() {
        let layout = layout_of(&default_file());
        assert_eq!(layout.locate(GridPosition::new(-84., 0.)).unwrap().0.row, 0);
        assert!(layout.locate(GridPosition::new(-84.0001, 0.)).is_none());
        // the last covered cell row is the one just below 83 degrees north
        let (block, _) = layout.locate(GridPosition::new(82.9999, 0.)).unwrap();
        assert_eq!(block.row, 33);
        assert!(layout.locate(GridPosition::new(83., 0.)).is_none());
        assert!(layout.locate(GridPosition::new(89., 0.)).is_none());
        assert!(layout.locate(GridPosition::new(-90., 0.)).is_none());
        assert!(layout.locate(GridPosition::new(f64::NAN, 0.)).is_none());
    }

    #[test]
    fn locate_wraps_the_antimeridian() {
        let layout = layout_of(&default_file());
        let west_edge = layout.locate(GridPosition::new(0., -180.)).unwrap();
        let wrapped_east = layout.locate(GridPosition::new(0., 180.)).unwrap();
        assert_eq!(west_edge, wrapped_east);
        assert_eq!(west_edge.0.column, 0);

        let just_west_of_antimeridian = layout.locate(GridPosition::new(0., 179.9)).unwrap();
        assert_eq!(just_west_of_antimeridian.0.column, 71);
        let just_east = layout.locate(GridPosition::new(0., -179.9)).unwrap();
        assert_eq!(just_east.0.column, 0);

        assert_eq!(
            layout.locate(GridPosition::new(0., 190.)).unwrap().0.column,
            layout
                .locate(GridPosition::new(0., -170.))
                .unwrap()
                .0
                .column
        );
        assert_eq!(
            layout.locate(GridPosition::new(0., -540.)).unwrap(),
            west_edge
        );
    }

    #[test]
    fn cell_values_convert_to_feet() {
        assert_eq!(cell_to_feet(0), 0.);
        assert_eq!(cell_to_feet(1), 0.);
        assert!((cell_to_feet(101) - 5000. * FEET_PER_METRE).abs() < 1e-6);
    }

    #[test]
    fn queries_report_not_loaded_until_the_block_arrives() {
        let file = default_file();
        let mut cache = TerrainGridCache::new(InMemoryBlockReader::new(file.clone(), 2));

        assert_eq!(
            cache.max_elevation_at(GridPosition::new(16., -125.)),
            TerrainSample::NotLoaded
        );
        for _ in 0..40 {
            cache.update(UPDATE_STEP, GridPosition::new(16., -125.));
        }
        assert!(cache.is_ready());
        // block (20, 11) is where the aircraft is; the block with data far away is not
        assert_eq!(
            cache.max_elevation_at(GridPosition::new(16., -125.)),
            TerrainSample::ElevationFeet(5000. * FEET_PER_METRE)
        );
        let far_block_with_data = GridPosition::new(-84. + 5. * 21., -180. + 5. * 14.5);
        assert_eq!(
            cache.max_elevation_at(far_block_with_data),
            TerrainSample::NotLoaded
        );
    }

    #[test]
    fn constant_blocks_answer_without_being_loaded() {
        let file = build_grid_file(|_, _| TestBlock::Constant(0));
        let mut cache = TerrainGridCache::new(InMemoryBlockReader::new(file, 0));
        for _ in 0..5 {
            cache.update(UPDATE_STEP, GridPosition::new(0., 0.));
        }
        assert_eq!(
            cache.max_elevation_at(GridPosition::new(40., 100.)),
            TerrainSample::ElevationFeet(0.)
        );
        // header and index only: no block was ever requested
        assert_eq!(cache.reader().requests.len(), 2);
        assert!(cache.loaded_blocks().is_empty());
    }

    #[test]
    fn an_aircraft_without_a_grid_reader_never_has_terrain_data() {
        let mut grid = UnavailableTerrainGrid;
        grid.update(UPDATE_STEP, GridPosition::new(47., 8.));
        assert_eq!(
            grid.max_elevation_at(GridPosition::new(47., 8.)),
            TerrainSample::NotLoaded
        );
        assert_eq!(
            grid.max_elevation_along(GridPosition::new(47., 8.), GridPosition::new(47.5, 8.)),
            TerrainSample::NotLoaded
        );
    }

    #[test]
    fn the_cache_follows_the_aircraft_through_the_terrain_grid_trait() {
        let file = build_grid_file(|_, _| TestBlock::Constant(0));
        let mut grid: Box<dyn TerrainGrid> =
            Box::new(TerrainGridCache::new(InMemoryBlockReader::new(file, 0)));
        for _ in 0..4 {
            grid.update(UPDATE_STEP, GridPosition::new(47., 8.));
        }
        assert_eq!(
            grid.max_elevation_at(GridPosition::new(47., 8.)),
            TerrainSample::ElevationFeet(0.)
        );
    }

    #[test]
    fn outside_coverage_is_reported_as_such() {
        let cache = ready_cache(default_file(), GridPosition::new(0., 0.));
        assert_eq!(
            cache.max_elevation_at(GridPosition::new(89., 0.)),
            TerrainSample::OutsideCoverage
        );
        assert_eq!(
            cache.max_elevation_at(GridPosition::new(-88., 30.)),
            TerrainSample::OutsideCoverage
        );
    }

    #[test]
    fn window_is_three_by_three_around_the_aircraft() {
        let all_data = build_grid_file(|row, _| block_with_pattern(row as u8));
        let cache = ready_cache(
            all_data,
            GridPosition::new(-84. + 5. * 10.5, -180. + 5. * 20.5),
        );
        let mut loaded = cache.loaded_blocks();
        loaded.sort_by_key(|block| (block.row, block.column));
        let mut expected: Vec<BlockId> = (9..=11)
            .flat_map(|row| (19..=21).map(move |column| id(row, column)))
            .collect();
        expected.sort_by_key(|block| (block.row, block.column));
        assert_eq!(loaded, expected);
    }

    #[test]
    fn window_shifts_with_the_aircraft_and_drops_old_blocks() {
        let all_data = build_grid_file(|row, _| block_with_pattern(row as u8));
        let mut cache = ready_cache(
            all_data,
            GridPosition::new(-84. + 5. * 10.5, -180. + 5. * 20.5),
        );
        let before = cache.loaded_blocks().len();
        assert_eq!(before, 9);

        let moved = GridPosition::new(-84. + 5. * 10.5, -180. + 5. * 21.5);
        for _ in 0..30 {
            cache.update(UPDATE_STEP, moved);
        }
        let loaded = cache.loaded_blocks();
        assert_eq!(loaded.len(), 9);
        assert!(!loaded.contains(&id(10, 19)));
        assert!(loaded.contains(&id(10, 22)));
        assert!(loaded.contains(&id(10, 21)));
    }

    #[test]
    fn window_wraps_over_the_antimeridian_and_stops_at_the_poles() {
        let all_data = build_grid_file(|row, _| block_with_pattern(row as u8));
        let cache = ready_cache(all_data, GridPosition::new(-83., 179.5));
        let mut loaded = cache.loaded_blocks();
        loaded.sort_by_key(|block| (block.row, block.column));
        // south edge: no row below 0; east edge: column 72 wraps to 0
        assert_eq!(
            loaded,
            vec![
                id(0, 0),
                id(0, 70),
                id(0, 71),
                id(1, 0),
                id(1, 70),
                id(1, 71)
            ]
        );
    }

    #[test]
    fn nearest_blocks_are_requested_first() {
        let all_data = build_grid_file(|row, _| block_with_pattern(row as u8));
        let mut cache = TerrainGridCache::new(InMemoryBlockReader::new(all_data.clone(), 0));
        for _ in 0..4 {
            cache.update(
                UPDATE_STEP,
                GridPosition::new(-84. + 5. * 10.5, -180. + 5. * 20.5),
            );
        }
        let layout = layout_of(&all_data);
        let index = GridIndex::parse(
            layout,
            &all_data[HEADER_SIZE..HEADER_SIZE + layout.index_size()],
        )
        .unwrap();
        let (offset, length) = index.block_byte_range(id(10, 20)).unwrap();
        // header, index, then the aircraft's own block
        assert_eq!(cache.reader().requests[2], ReadRequest { offset, length });
    }

    #[test]
    fn segment_takes_the_highest_cell_and_is_unknown_if_any_part_is_missing() {
        let file = default_file();
        // block (20, 10) holds the pattern 1..7, block (20, 11) is a flat 5000 m
        let mut cache = TerrainGridCache::new(InMemoryBlockReader::new(file.clone(), 0));
        for _ in 0..30 {
            cache.update(UPDATE_STEP, GridPosition::new(16., -125.));
        }
        let inside_flat_block = GridPosition::new(16., -123.);
        let also_inside = GridPosition::new(17., -126.);
        assert_eq!(
            cache.max_elevation_along(inside_flat_block, also_inside),
            TerrainSample::ElevationFeet(5000. * FEET_PER_METRE)
        );

        // far outside the window and not a constant block
        let missing = GridPosition::new(-84. + 5. * 21. + 1., -180. + 5. * 14.5);
        assert_eq!(
            cache.max_elevation_along(inside_flat_block, missing),
            TerrainSample::NotLoaded
        );
    }

    #[test]
    fn segment_across_the_antimeridian_goes_the_short_way() {
        let file = build_grid_file(|_, _| TestBlock::Constant(21));
        let cache = ready_cache(file, GridPosition::new(0., 0.));
        let result =
            cache.max_elevation_along(GridPosition::new(0., 179.9), GridPosition::new(0., -179.9));
        assert_eq!(result, TerrainSample::ElevationFeet(1000. * FEET_PER_METRE));
    }

    #[test]
    fn segment_over_the_coverage_edge_still_reports_the_covered_part() {
        let file = build_grid_file(|_, _| TestBlock::Constant(21));
        let cache = ready_cache(file, GridPosition::new(0., 0.));
        let result =
            cache.max_elevation_along(GridPosition::new(82., 0.), GridPosition::new(84., 0.));
        assert!(matches!(result, TerrainSample::ElevationFeet(_)));
        let all_outside =
            cache.max_elevation_along(GridPosition::new(84., 0.), GridPosition::new(86., 0.));
        assert_eq!(all_outside, TerrainSample::OutsideCoverage);
    }

    #[test]
    fn corrupt_block_is_failed_not_retried_and_not_flat_terrain() {
        let mut file = build_grid_file(|_, _| block_with_pattern(1));
        let layout = layout_of(&file);
        let index = GridIndex::parse(
            layout,
            &file[HEADER_SIZE..HEADER_SIZE + layout.index_size()],
        )
        .unwrap();
        let (offset, _) = index.block_byte_range(id(10, 20)).unwrap();
        for byte in &mut file[offset as usize..offset as usize + 4] {
            *byte = 0xFF;
        }
        let at = GridPosition::new(-84. + 5. * 10.5, -180. + 5. * 20.5);
        let cache = ready_cache(file, at);
        assert_eq!(cache.max_elevation_at(at), TerrainSample::Failed);
        // the neighbours still load
        assert_eq!(cache.loaded_blocks().len(), 8);
        let requests_for_block = cache
            .reader()
            .requests
            .iter()
            .filter(|request| request.offset == offset)
            .count();
        assert_eq!(requests_for_block, 1);
    }

    /// Reads through an in-memory file but fails the first reads of the chosen part of it, like a simulator that is
    /// busy for a moment.
    struct FlakyBlockReader {
        inner: InMemoryBlockReader,
        /// None: every read can fail
        only_offset: Option<u32>,
        failures_left: usize,
    }

    impl BlockReader for FlakyBlockReader {
        fn request(&mut self, request: ReadRequest) {
            self.inner.request(request);
        }

        fn poll(&mut self) -> Option<ReadCompletion> {
            let mut completion = self.inner.poll()?;
            let selected = self
                .only_offset
                .is_none_or(|offset| offset == completion.request.offset);
            if selected && self.failures_left > 0 {
                self.failures_left -= 1;
                completion.outcome = Err(ReadFailure);
            }
            Some(completion)
        }
    }

    fn run_for(cache: &mut TerrainGridCache<impl BlockReader>, seconds: u32, at: GridPosition) {
        for _ in 0..seconds * 20 {
            cache.update(UPDATE_STEP, at);
        }
    }

    fn flaky_cache(
        only_offset: Option<u32>,
        failures: usize,
    ) -> TerrainGridCache<FlakyBlockReader> {
        TerrainGridCache::new(FlakyBlockReader {
            inner: InMemoryBlockReader::new(default_file(), 0),
            only_offset,
            failures_left: failures,
        })
    }

    #[test]
    fn unreadable_header_makes_the_cache_unusable_after_a_few_tries() {
        let mut cache = TerrainGridCache::new(InMemoryBlockReader::new(vec![0; 10], 0));
        let at = GridPosition::new(0., 0.);
        run_for(&mut cache, 5, at);
        assert_eq!(
            cache.max_elevation_at(at),
            TerrainSample::NotLoaded,
            "the first failure only delays the next try"
        );
        run_for(&mut cache, 60, at);
        assert_eq!(cache.max_elevation_at(at), TerrainSample::Failed);
    }

    #[test]
    fn a_header_read_that_fails_once_is_tried_again() {
        let mut cache = flaky_cache(Some(0), 2);
        let at = GridPosition::new(16., -125.);
        run_for(&mut cache, 60, at);
        assert!(cache.is_ready(), "two failures are within the tries");
    }

    #[test]
    fn a_block_read_that_fails_once_is_tried_again_after_a_delay() {
        let at = GridPosition::new(16., -125.);
        let mut probe = TerrainGridCache::new(InMemoryBlockReader::new(default_file(), 0));
        run_for(&mut probe, 5, at);
        // The header, the index, then the block the aircraft is over
        let block_offset = probe.reader().requests[2].offset;

        let mut cache = flaky_cache(Some(block_offset), 1);
        run_for(&mut cache, 5, at);
        assert_eq!(cache.max_elevation_at(at), TerrainSample::NotLoaded);
        run_for(&mut cache, 30, at);
        assert!(matches!(
            cache.max_elevation_at(at),
            TerrainSample::ElevationFeet(_)
        ));
    }

    #[test]
    fn a_block_that_cannot_be_read_is_given_up_after_a_few_tries() {
        let at = GridPosition::new(16., -125.);
        let mut healthy = TerrainGridCache::new(InMemoryBlockReader::new(default_file(), 0));
        run_for(&mut healthy, 5, at);
        let index_offset = healthy.reader().requests[1].offset;

        // The header and the index are read, then every read fails
        let mut cache = flaky_cache(None, 0);
        while !cache.is_ready() {
            cache.update(UPDATE_STEP, at);
        }
        cache.reader.failures_left = usize::MAX;
        run_for(&mut cache, 300, at);
        let block_requests = cache
            .reader()
            .inner
            .requests
            .iter()
            .filter(|request| request.offset > index_offset)
            .count();
        assert_eq!(
            cache.max_elevation_at(at),
            TerrainSample::Failed,
            "given up for good"
        );
        run_for(&mut cache, 300, at);
        assert_eq!(
            cache
                .reader()
                .inner
                .requests
                .iter()
                .filter(|request| request.offset > index_offset)
                .count(),
            block_requests,
            "no further tries"
        );
    }

    /// Checks the Python tool's output against the real reader. Run with
    /// `TAWS_GRID_FILE=<path> cargo test -p systems real_grid_file -- --ignored`.
    #[test]
    #[ignore]
    fn real_grid_file_decodes_known_summits() {
        let path = std::env::var("TAWS_GRID_FILE").expect("TAWS_GRID_FILE not set");
        let file = std::fs::read(path).unwrap();
        let fuji = GridPosition::new(35.3606, 138.7274);
        let mut cache = TerrainGridCache::new(InMemoryBlockReader::new(file, 0));
        for _ in 0..40 {
            cache.update(UPDATE_STEP, fuji);
        }
        match cache.max_elevation_at(fuji) {
            TerrainSample::ElevationFeet(feet) => {
                assert!((9_000. ..16_000.).contains(&feet), "Fuji {feet} ft")
            }
            other => panic!("unexpected {other:?}"),
        }
        let pacific = GridPosition::new(0., -150.);
        for _ in 0..40 {
            cache.update(UPDATE_STEP, pacific);
        }
        assert_eq!(
            cache.max_elevation_at(pacific),
            TerrainSample::ElevationFeet(0.)
        );
    }
}
