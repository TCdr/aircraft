//! The threat areas of the look-ahead alerts for the NDs: the terrain cells that break the caution envelope (solid
//! yellow) or the warning envelope (solid red, red/black crosshatch during AVOID TERRAIN), as runs of neighbouring cells
//! along the rows of the grid.
//!
//! A run is 24 bits: the row as the latitude offset from the cell of the aircraft plus 128 in bits 0-7, the first column
//! as the longitude offset plus 128 in bits 8-15, the number of cells (1 to 63) in bits 16-21 and the level in bits
//! 22-23 (1 caution, 2 warning, 3 warning of AVOID TERRAIN). Two runs share a slot, the second one times 2^24, which a
//! simulator variable holds exactly. An unused run is 0.

use crate::surveillance::egpws::terrain_grid::GridPosition;

const CELLS_PER_DEGREE: f64 = 60.;
const CELLS_AROUND_THE_EARTH: i32 = 360 * 60;

/// A 1 arcminute cell of the terrain grid, by its row and column counted from the equator and the prime meridian
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct GridCell {
    pub latitude_index: i32,
    pub longitude_index: i32,
}

impl GridCell {
    pub fn of(position: GridPosition) -> Self {
        Self {
            latitude_index: (position.latitude_degrees * CELLS_PER_DEGREE).floor() as i32,
            longitude_index: (position.longitude_degrees * CELLS_PER_DEGREE).floor() as i32,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum ThreatLevel {
    Caution,
    Warning,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ThreatCell {
    pub cell: GridCell,
    pub level: ThreatLevel,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ThreatRun {
    pub latitude_offset: i32,
    pub longitude_start: i32,
    pub length: u32,
    pub level: u32,
}

impl ThreatRun {
    const OFFSET_BIAS: i32 = 128;
    const MAX_LENGTH: u32 = 63;

    fn offset_fits(offset: i32) -> bool {
        (-Self::OFFSET_BIAS..Self::OFFSET_BIAS).contains(&offset)
    }

    fn encode(&self) -> u32 {
        (self.latitude_offset + Self::OFFSET_BIAS) as u32
            | ((self.longitude_start + Self::OFFSET_BIAS) as u32) << 8
            | self.length << 16
            | self.level << 22
    }

    #[cfg(test)]
    fn decode(bits: u32) -> Option<Self> {
        (bits != 0).then(|| Self {
            latitude_offset: (bits & 0xff) as i32 - Self::OFFSET_BIAS,
            longitude_start: (bits >> 8 & 0xff) as i32 - Self::OFFSET_BIAS,
            length: bits >> 16 & 0x3f,
            level: bits >> 22,
        })
    }

    /// From the cell of the aircraft to the nearest cell of the run, in north-south cell sizes
    fn distance(&self, east_west_cell_size: f64) -> f64 {
        let last = self.longitude_start + self.length as i32 - 1;
        let nearest_column = 0.clamp(self.longitude_start, last);
        (self.latitude_offset as f64).hypot(nearest_column as f64 * east_west_cell_size)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ThreatAreas {
    /// The cell of the aircraft, from which the runs are counted
    pub reference: GridCell,
    pub slots: [f64; ThreatAreas::SLOTS],
}

impl ThreatAreas {
    pub const SLOTS: usize = 32;
    pub const MAX_RUNS: usize = 2 * Self::SLOTS;
    const SECOND_RUN_FACTOR: f64 = 16_777_216.;

    /// When there are more runs than slots, the ones nearest to the aircraft are kept.
    pub fn of(aircraft: GridPosition, cells: &[ThreatCell], avoid_terrain: bool) -> Self {
        let reference = GridCell::of(aircraft);
        let mut offsets: Vec<(i32, i32, u32)> = cells
            .iter()
            .filter_map(|threat| {
                let latitude_offset = threat.cell.latitude_index - reference.latitude_index;
                let half_turn = CELLS_AROUND_THE_EARTH / 2;
                let longitude_offset = (threat.cell.longitude_index - reference.longitude_index
                    + half_turn)
                    .rem_euclid(CELLS_AROUND_THE_EARTH)
                    - half_turn;
                let level = match threat.level {
                    ThreatLevel::Caution => 1,
                    ThreatLevel::Warning if avoid_terrain => 3,
                    ThreatLevel::Warning => 2,
                };
                (ThreatRun::offset_fits(latitude_offset)
                    && ThreatRun::offset_fits(longitude_offset))
                .then_some((latitude_offset, longitude_offset, level))
            })
            .collect();
        // The highest level of a cell found more than once comes first and is kept
        offsets.sort_by(|a, b| (a.0, a.1, b.2).cmp(&(b.0, b.1, a.2)));
        offsets.dedup_by_key(|(row, column, _)| (*row, *column));

        let mut runs: Vec<ThreatRun> = Vec::new();
        for (row, column, level) in offsets {
            match runs.last_mut() {
                Some(run)
                    if run.latitude_offset == row
                        && run.level == level
                        && run.longitude_start + run.length as i32 == column
                        && run.length < ThreatRun::MAX_LENGTH =>
                {
                    run.length += 1
                }
                _ => runs.push(ThreatRun {
                    latitude_offset: row,
                    longitude_start: column,
                    length: 1,
                    level,
                }),
            }
        }
        let east_west_cell_size = aircraft.latitude_degrees.to_radians().cos();
        runs.sort_by(|a, b| {
            a.distance(east_west_cell_size)
                .total_cmp(&b.distance(east_west_cell_size))
        });
        runs.truncate(Self::MAX_RUNS);

        let mut slots = [0.; Self::SLOTS];
        for (index, run) in runs.iter().enumerate() {
            let factor = if index % 2 == 0 {
                1.
            } else {
                Self::SECOND_RUN_FACTOR
            };
            slots[index / 2] += run.encode() as f64 * factor;
        }
        Self { reference, slots }
    }

    #[cfg(test)]
    pub fn runs(&self) -> Vec<ThreatRun> {
        self.slots
            .iter()
            .flat_map(|slot| {
                let bits = *slot as u64;
                [bits as u32 & 0xff_ffff, (bits >> 24) as u32]
            })
            .filter_map(ThreatRun::decode)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AIRCRAFT: GridPosition = GridPosition {
        latitude_degrees: 35.25,
        longitude_degrees: 138.91,
    };

    fn reference() -> GridCell {
        GridCell::of(AIRCRAFT)
    }

    fn threat(latitude_offset: i32, longitude_offset: i32, level: ThreatLevel) -> ThreatCell {
        ThreatCell {
            cell: GridCell {
                latitude_index: reference().latitude_index + latitude_offset,
                longitude_index: reference().longitude_index + longitude_offset,
            },
            level,
        }
    }

    fn run(latitude_offset: i32, longitude_start: i32, length: u32, level: u32) -> ThreatRun {
        ThreatRun {
            latitude_offset,
            longitude_start,
            length,
            level,
        }
    }

    #[test]
    fn no_cells_no_runs() {
        let areas = ThreatAreas::of(AIRCRAFT, &[], false);
        assert!(areas.slots.iter().all(|slot| *slot == 0.));
        assert!(areas.runs().is_empty());
    }

    #[test]
    fn the_reference_is_the_cell_of_the_aircraft() {
        let areas = ThreatAreas::of(AIRCRAFT, &[threat(3, 0, ThreatLevel::Caution)], false);
        assert_eq!(areas.reference, GridCell::of(AIRCRAFT));
        assert_eq!(areas.reference.latitude_index, 2115);
        assert_eq!(areas.reference.longitude_index, 8334);
    }

    #[test]
    fn neighbouring_cells_of_a_row_make_one_run() {
        let cells = [
            threat(3, 1, ThreatLevel::Caution),
            threat(3, -1, ThreatLevel::Caution),
            threat(3, 0, ThreatLevel::Caution),
            threat(4, 0, ThreatLevel::Caution),
        ];
        let areas = ThreatAreas::of(AIRCRAFT, &cells, false);
        assert_eq!(areas.runs(), vec![run(3, -1, 3, 1), run(4, 0, 1, 1)]);
    }

    #[test]
    fn a_change_of_level_or_a_gap_starts_a_new_run() {
        let cells = [
            threat(2, 0, ThreatLevel::Warning),
            threat(2, 1, ThreatLevel::Caution),
            threat(2, 3, ThreatLevel::Caution),
        ];
        let areas = ThreatAreas::of(AIRCRAFT, &cells, false);
        assert_eq!(
            areas.runs(),
            vec![run(2, 0, 1, 2), run(2, 1, 1, 1), run(2, 3, 1, 1)]
        );
    }

    #[test]
    fn a_cell_found_twice_keeps_the_higher_level() {
        let cells = [
            threat(2, 0, ThreatLevel::Caution),
            threat(2, 0, ThreatLevel::Warning),
            threat(2, 0, ThreatLevel::Caution),
        ];
        let areas = ThreatAreas::of(AIRCRAFT, &cells, false);
        assert_eq!(areas.runs(), vec![run(2, 0, 1, 2)]);
    }

    #[test]
    fn avoid_terrain_marks_the_warning_cells_for_the_crosshatch() {
        let cells = [
            threat(2, 0, ThreatLevel::Warning),
            threat(5, 0, ThreatLevel::Caution),
        ];
        let areas = ThreatAreas::of(AIRCRAFT, &cells, true);
        assert_eq!(areas.runs(), vec![run(2, 0, 1, 3), run(5, 0, 1, 1)]);
    }

    #[test]
    fn a_long_run_is_split() {
        let cells: Vec<_> = (0..70)
            .map(|offset| threat(1, offset - 35, ThreatLevel::Caution))
            .collect();
        let areas = ThreatAreas::of(AIRCRAFT, &cells, false);
        assert_eq!(areas.runs(), vec![run(1, -35, 63, 1), run(1, 28, 7, 1)]);
    }

    #[test]
    fn the_nearest_runs_are_kept_when_there_are_too_many() {
        // One run per row, every other cell, so nothing merges: far more runs than slots
        let cells: Vec<_> = (1..=40)
            .flat_map(|row| (0..4).map(move |column| threat(row, 2 * column, ThreatLevel::Caution)))
            .collect();
        let runs = ThreatAreas::of(AIRCRAFT, &cells, false).runs();
        assert_eq!(runs.len(), ThreatAreas::MAX_RUNS);
        assert!(runs.iter().all(|run| run.latitude_offset <= 16));
        assert!(runs.contains(&run(1, 0, 1, 1)));
    }

    #[test]
    fn cells_too_far_for_the_encoding_are_left_out() {
        let cells = [
            threat(130, 0, ThreatLevel::Caution),
            threat(0, -129, ThreatLevel::Caution),
            threat(1, 0, ThreatLevel::Caution),
        ];
        let areas = ThreatAreas::of(AIRCRAFT, &cells, false);
        assert_eq!(areas.runs(), vec![run(1, 0, 1, 1)]);
    }

    #[test]
    fn the_longitude_offset_goes_across_the_antimeridian() {
        let aircraft = GridPosition::new(10., 179.99);
        let east_of_the_antimeridian = ThreatCell {
            cell: GridCell::of(GridPosition::new(10.02, -179.99)),
            level: ThreatLevel::Caution,
        };
        let runs = ThreatAreas::of(aircraft, &[east_of_the_antimeridian], false).runs();
        assert_eq!(runs, vec![run(1, 1, 1, 1)]);
    }

    #[test]
    fn two_runs_share_a_slot_exactly() {
        let cells = [
            threat(-128, -128, ThreatLevel::Warning),
            threat(127, 127, ThreatLevel::Caution),
        ];
        let areas = ThreatAreas::of(AIRCRAFT, &cells, true);
        let nearest = (1 << 22 | 1 << 16 | 255 << 8 | 255) as f64;
        let farthest = (3 << 22 | 1 << 16) as f64;
        assert_eq!(areas.slots[0], nearest + farthest * 16_777_216.);
        assert_eq!(
            areas.runs(),
            vec![run(127, 127, 1, 1), run(-128, -128, 1, 3)]
        );
    }
}
