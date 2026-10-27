"""Builds the obstacle grid shipped with the A32NX from the FAA Digital Obstacle File (DOF).

Source: FAA Digital Obstacle File, public domain, https://aeronav.faa.gov/Obst_Data/DAILY_DOF_DAT.ZIP (DOF.DAT inside
the zip, fixed-width text, refreshed daily).

Usage:
  python build_obstacle_grid.py --dof <path to DOF.DAT> [--out <grid file>]

The default output is the file the aircraft package ships (see OUTPUT_DEFAULT).

Grid: one byte per 1 arcminute cell, 0 = no obstacle, otherwise 1 + ceil(metres / 50) of the highest obstacle top
(AMSL) in the cell. The rounding is always upwards so the value never reads lower than the real top.

The file format is the one of the terrain grid (tools/taws-terrain-grid/build_grid.py) and is read by the same code,
systems/src/surveillance/egpws/terrain_grid.rs: magic "TAWSGRID", version 1, 64 byte header, 12 byte index entries per
5 degree block, deflated blocks or constant blocks. Only the header values differ: the full 360 degrees of longitude,
but a latitude band that is the data extent rounded out to whole blocks. Blocks without an obstacle are constant
blocks of 0.

DOF.DAT columns (0 based): latitude degrees 35, minutes 38, seconds 41, hemisphere 46; longitude degrees 48, minutes
52, seconds 55, hemisphere 60; AMSL feet 89; action code 118 (A added, C changed, D dismantled).
"""

import argparse
import collections
import os
import struct
import sys
import zlib

import numpy as np

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUTPUT_DEFAULT = os.path.join(
    REPO, 'fbw-a32nx', 'src', 'base', 'flybywire-aircraft-a320-neo', 'SimObjects', 'AirPlanes', 'FlyByWire_A320_NEO',
    'panel', 'obstacle_grid.bin')

# Must match the terrain grid: the Rust reader treats both files the same way.
FORMAT_VERSION = 1
CELLS_PER_DEGREE = 60
BLOCK_DEGREES = 5
COVERAGE_WEST = -180
COVERAGE_WIDTH_DEGREES = 360
METRES_PER_STEP = 50
# 1 ft = 0.3048 m exactly; integer arithmetic keeps the upward rounding free of float error.
METRE_TEN_THOUSANDTHS_PER_FOOT = 3048

# Obstacles are first collected on the whole globe and cropped to the data band afterwards.
WORLD_SOUTH = -90
WORLD_HEIGHT_DEGREES = 180

HEADER_SIZE = 64
INDEX_ENTRY_SIZE = 12
KIND_DEFLATED = 0
KIND_CONSTANT = 1

ACTION_DISMANTLED = 'D'
CENTI_ARCSECONDS_PER_DEGREE = 3600 * 100
CENTI_ARCSECONDS_PER_CELL = CENTI_ARCSECONDS_PER_DEGREE // CELLS_PER_DEGREE


class Obstacle:
    """Position in hundredths of an arcsecond (exact for the 2 decimals of the DOF) and top in feet AMSL."""

    def __init__(self, latitude_centi_arcseconds, longitude_centi_arcseconds, amsl_feet, action=' '):
        self.latitude_centi_arcseconds = latitude_centi_arcseconds
        self.longitude_centi_arcseconds = longitude_centi_arcseconds
        self.amsl_feet = amsl_feet
        self.action = action

    @property
    def latitude(self):
        return self.latitude_centi_arcseconds / CENTI_ARCSECONDS_PER_DEGREE

    @property
    def longitude(self):
        return self.longitude_centi_arcseconds / CENTI_ARCSECONDS_PER_DEGREE


class LoadStats:
    def __init__(self):
        self.records = 0
        self.skipped_dismantled = 0
        self.rejected = 0
        self.tallest = None
        self.south = None
        self.north = None
        self.west = None
        self.east = None


def _signed_centi_arcseconds(degrees, minutes, centi_seconds, hemisphere):
    if len(hemisphere) != 1 or hemisphere not in 'NSEW':
        raise ValueError(f'bad hemisphere {hemisphere!r}')
    if not (0 <= minutes < 60 and 0 <= centi_seconds < 6000 and degrees >= 0):
        raise ValueError('degrees, minutes or seconds out of range')
    total = degrees * CENTI_ARCSECONDS_PER_DEGREE + minutes * 6000 + centi_seconds
    return -total if hemisphere in 'SW' else total


def parse_dms(degrees, minutes, seconds, hemisphere):
    """Signed decimal degrees; S and W are negative."""
    signed = _signed_centi_arcseconds(degrees, minutes, round(seconds * 100), hemisphere)
    return signed / CENTI_ARCSECONDS_PER_DEGREE


def parse_record(line):
    """Returns the Obstacle of a DOF.DAT line. Raises ValueError for a line that is not a valid obstacle record."""
    if len(line) < 120:
        raise ValueError('record too short')
    if line[46] not in 'NS' or line[60] not in 'EW':
        raise ValueError('hemisphere letters are not where the DOF puts them')
    latitude = _signed_centi_arcseconds(
        int(line[35:37]), int(line[38:40]), round(float(line[41:46]) * 100), line[46])
    longitude = _signed_centi_arcseconds(
        int(line[48:51]), int(line[52:54]), round(float(line[55:60]) * 100), line[60])
    if abs(latitude) > 90 * CENTI_ARCSECONDS_PER_DEGREE or abs(longitude) > 180 * CENTI_ARCSECONDS_PER_DEGREE:
        raise ValueError('position out of range')
    return Obstacle(latitude, longitude, int(line[89:94]), line[118])


def cell_of(obstacle):
    """Global (row, column), rows from WORLD_SOUTH and columns from COVERAGE_WEST. A cell is the floor of the position."""
    row = (obstacle.latitude_centi_arcseconds - WORLD_SOUTH * CENTI_ARCSECONDS_PER_DEGREE) // CENTI_ARCSECONDS_PER_CELL
    shifted = obstacle.longitude_centi_arcseconds - COVERAGE_WEST * CENTI_ARCSECONDS_PER_DEGREE
    # +180 exactly is the same meridian as -180, and the pole itself belongs to the last row
    column = (shifted % (COVERAGE_WIDTH_DEGREES * CENTI_ARCSECONDS_PER_DEGREE)) // CENTI_ARCSECONDS_PER_CELL
    return min(row, WORLD_HEIGHT_DEGREES * CELLS_PER_DEGREE - 1), column


def feet_to_cell(feet):
    """1 + ceil(metres / 50), rounded up so the reader never sees an obstacle lower than it is. Capped at a byte."""
    steps = -(-(max(feet, 0) * METRE_TEN_THOUSANDTHS_PER_FOOT) // (10000 * METRES_PER_STEP))
    return min(1 + steps, 255)


def new_cell_grid():
    return np.zeros((WORLD_HEIGHT_DEGREES * CELLS_PER_DEGREE, COVERAGE_WIDTH_DEGREES * CELLS_PER_DEGREE), np.uint8)


def add_obstacle(grid, obstacle):
    row, column = cell_of(obstacle)
    value = feet_to_cell(obstacle.amsl_feet)
    if value > grid[row, column]:
        grid[row, column] = value


def _widen_extent(stats, obstacle):
    latitude, longitude = obstacle.latitude, obstacle.longitude
    stats.south = latitude if stats.south is None else min(stats.south, latitude)
    stats.north = latitude if stats.north is None else max(stats.north, latitude)
    stats.west = longitude if stats.west is None else min(stats.west, longitude)
    stats.east = longitude if stats.east is None else max(stats.east, longitude)


def load_records(lines, grid):
    stats = LoadStats()
    for line in lines:
        try:
            obstacle = parse_record(line)
        except ValueError:
            stats.rejected += 1
            continue
        if obstacle.action == ACTION_DISMANTLED:
            stats.skipped_dismantled += 1
            continue
        add_obstacle(grid, obstacle)
        stats.records += 1
        _widen_extent(stats, obstacle)
        if stats.tallest is None or obstacle.amsl_feet > stats.tallest.amsl_feet:
            stats.tallest = obstacle
    return stats


def is_record_line(line):
    # The currency/ruler lines and the final empty line are not records; a damaged record still counts as rejected.
    return len(line) > 10 and line[2] == '-' and line[:2].isalnum()


def read_dof(path, grid):
    with open(path, encoding='latin-1') as file:
        lines = (line.rstrip('\n') for line in file)
        return load_records((line for line in lines if is_record_line(line)), grid)


def crop_to_data_band(grid):
    """Returns (south degrees, height degrees, cropped grid): the rows with obstacles rounded out to whole blocks."""
    rows_with_data = np.flatnonzero(grid.any(axis=1))
    if rows_with_data.size == 0:
        raise SystemExit('no obstacles found')
    first_degree = int(rows_with_data[0]) // CELLS_PER_DEGREE
    last_degree = int(rows_with_data[-1]) // CELLS_PER_DEGREE
    south = WORLD_SOUTH + first_degree // BLOCK_DEGREES * BLOCK_DEGREES
    north = WORLD_SOUTH + (last_degree // BLOCK_DEGREES + 1) * BLOCK_DEGREES
    first_row = (south - WORLD_SOUTH) * CELLS_PER_DEGREE
    last_row = (north - WORLD_SOUTH) * CELLS_PER_DEGREE
    return south, north - south, grid[first_row:last_row]


def compress_blocks(grid, height_degrees):
    block_cells = BLOCK_DEGREES * CELLS_PER_DEGREE
    block_rows = height_degrees // BLOCK_DEGREES
    block_columns = COVERAGE_WIDTH_DEGREES // BLOCK_DEGREES
    entries = []
    constant_count = 0
    for block_row in range(block_rows):
        for block_column in range(block_columns):
            block = grid[block_row * block_cells:(block_row + 1) * block_cells,
                         block_column * block_cells:(block_column + 1) * block_cells]
            first = int(block[0, 0])
            if (block == first).all():
                entries.append((KIND_CONSTANT, first, b''))
                constant_count += 1
                continue
            compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
            entries.append((KIND_DEFLATED, 0, compressor.compress(block.tobytes()) + compressor.flush()))
    return block_rows, block_columns, entries, constant_count


def write_grid_file(path, south, height_degrees, block_rows, block_columns, entries):
    index_offset = HEADER_SIZE
    data_offset = index_offset + len(entries) * INDEX_ENTRY_SIZE
    header = b'TAWSGRID' + struct.pack(
        '<IIiiIIIIII', FORMAT_VERSION, CELLS_PER_DEGREE, south, COVERAGE_WEST, height_degrees,
        COVERAGE_WIDTH_DEGREES, BLOCK_DEGREES, block_rows, block_columns, index_offset)
    header += bytes(HEADER_SIZE - len(header))
    index = bytearray()
    body = bytearray()
    for kind, constant, payload in entries:
        if kind == KIND_CONSTANT:
            index += struct.pack('<IIBBH', 0, 0, KIND_CONSTANT, constant, 0)
        else:
            index += struct.pack('<IIBBH', data_offset + len(body), len(payload), KIND_DEFLATED, 0, 0)
            body += payload
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'wb') as file:
        file.write(header)
        file.write(index)
        file.write(body)
    return HEADER_SIZE + len(index) + len(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--dof', required=True, help='FAA DOF.DAT')
    parser.add_argument('--out', default=OUTPUT_DEFAULT)
    arguments = parser.parse_args()

    world = new_cell_grid()
    stats = read_dof(arguments.dof, world)
    print(f'records used: {stats.records}, skipped dismantled: {stats.skipped_dismantled}, '
          f'rejected malformed: {stats.rejected}')
    print(f'extent: latitude {stats.south:.4f} .. {stats.north:.4f}, longitude {stats.west:.4f} .. {stats.east:.4f}')
    tallest = stats.tallest
    print(f'tallest: {tallest.amsl_feet} ft AMSL at {tallest.latitude:.5f}, {tallest.longitude:.5f}')
    south, height_degrees, band = crop_to_data_band(world)
    print(f'coverage: latitude {south} .. {south + height_degrees}, longitude -180 .. 180')
    print(f'cells with an obstacle: {int((band > 0).sum())}')
    block_rows, block_columns, entries, constant_count = compress_blocks(band, height_degrees)
    size = write_grid_file(arguments.out, south, height_degrees, block_rows, block_columns, entries)
    kinds = collections.Counter(kind for kind, _, _ in entries)
    print(f'{len(entries)} blocks ({block_rows} x {block_columns}), {constant_count} constant, '
          f'{kinds[KIND_DEFLATED]} deflated')
    print(f'wrote {arguments.out}: {size} bytes ({size / 1048576:.2f} MiB)')


if __name__ == '__main__':
    sys.exit(main())
