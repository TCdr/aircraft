"""Builds the terrain elevation grid shipped with the A32NX from the SimBridge terrain.map.

Usage:
  python build_grid.py --terrain-map <path to terrain/terrain.map> [--out <grid file>] [--keep-raw <raw.npy>]

The default output is the file the aircraft package ships (see OUTPUT_DEFAULT). It is not committed to git (about
25 MB); it goes into the aircraft-large-files repository, which the build overlays on the package.

Grid: one byte per 1 arcminute cell, 0 = water, otherwise 1 + ceil(metres / 50) of the highest source sample in the
cell. The terrain alerting adds its own safety margins, so no conservative bias is applied here.

File layout (little endian), read by systems/src/surveillance/egpws/terrain_grid.rs:
  header, 64 bytes:
     0  8 bytes  magic "TAWSGRID"
     8  u32      format version (1)
    12  u32      cells per degree (60)
    16  i32      southern edge of coverage, degrees latitude
    20  i32      western edge of coverage, degrees longitude
    24  u32      coverage height in degrees latitude
    28  u32      coverage width in degrees longitude
    32  u32      block size in degrees
    36  u32      block rows
    40  u32      block columns
    44  u32      index offset
    48  16 bytes reserved (zero)
  index, one 12 byte entry per block, rows from the south, columns from the west:
     0  u32      offset of the block data from the start of the file
     4  u32      byte length of the block data
     8  u8       kind: 0 = raw deflate stream, 1 = constant block (every cell holds the constant, no data)
     9  u8       constant value (kind 1 only)
    10  u16      reserved (zero)
  block data: block_cells x block_cells bytes, row 0 = southern edge, column 0 = western edge, deflated on their own.
  Blocks that stick out of the coverage (the last block row) are padded with 0.
"""

import argparse
import collections
import os
import struct
import sys
import time
import zlib

import numpy as np

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUTPUT_DEFAULT = os.path.join(
    REPO, 'fbw-a32nx', 'src', 'base', 'flybywire-aircraft-a320-neo', 'SimObjects', 'AirPlanes', 'FlyByWire_A320_NEO',
    'panel', 'terrain_grid.bin')

FORMAT_VERSION = 1
CELLS_PER_DEGREE = 60
BLOCK_DEGREES = 5
COVERAGE_SOUTH = -84
COVERAGE_WEST = -180
COVERAGE_HEIGHT_DEGREES = 167  # latitude -84 .. 83, the tiles up to latitude 82 inclusive
COVERAGE_WIDTH_DEGREES = 360
METRES_PER_STEP = 50
# Highest point on Earth is 8849 m; the source has single-sample spikes up to 12700 m.
MAX_PLAUSIBLE_METRES = 8900
# A cell this many steps above all its eight neighbours is a data spike, not terrain: 1 arcmin is about 1.85 km, and
# no real terrain rises 2000 m within a single cell step.
SPIKE_STEPS = 2000 // METRES_PER_STEP

HEADER_SIZE = 64
INDEX_ENTRY_SIZE = 12
KIND_DEFLATED = 0
KIND_CONSTANT = 1


def read_source_tiles(data):
    """Yields (latitude, longitude, samples) for every 1 degree tile of terrain.map; samples are metres, -1 = water."""
    offset = 14
    while offset < len(data):
        width, _height = struct.unpack_from('<HH', data, offset)
        lat_byte, lon_low, lon_high = struct.unpack_from('<BBB', data, offset + 4)
        length = struct.unpack_from('<I', data, offset + 7)[0]
        latitude = lat_byte if lat_byte < 128 else lat_byte - 256
        longitude = lon_low + (-256 if lon_high == 255 else 0)
        payload = data[offset + 11:offset + 11 + length]
        samples = np.frombuffer(zlib.decompress(payload, 31), dtype='<i2').reshape(width, width)
        yield latitude, longitude, samples
        offset += 11 + length


def reduce_tile_to_cells(samples):
    """Takes the highest sample of every 1 arcmin cell: the alerting must never see terrain lower than it is."""
    size = samples.shape[0]
    cell_of_index = np.minimum((np.arange(size) * CELLS_PER_DEGREE) // size, CELLS_PER_DEGREE - 1)
    cells = np.full((CELLS_PER_DEGREE, CELLS_PER_DEGREE), -1, np.int32)
    for row in range(CELLS_PER_DEGREE):
        rows = samples[cell_of_index == row].astype(np.int32)
        for column in range(CELLS_PER_DEGREE):
            cells[row, column] = rows[:, cell_of_index == column].max()
    # terrain.map rows run north to south, the grid runs south to north
    return cells[::-1]


def decode_terrain_map(path):
    started = time.time()
    with open(path, 'rb') as file:
        data = file.read()
    height = COVERAGE_HEIGHT_DEGREES * CELLS_PER_DEGREE
    width = COVERAGE_WIDTH_DEGREES * CELLS_PER_DEGREE
    metres = np.full((height, width), -1, np.int16)
    tile_count = 0
    for latitude, longitude, samples in read_source_tiles(data):
        if not (COVERAGE_SOUTH <= latitude < COVERAGE_SOUTH + COVERAGE_HEIGHT_DEGREES
                and COVERAGE_WEST <= longitude < COVERAGE_WEST + COVERAGE_WIDTH_DEGREES):
            print(f'skipping tile outside coverage: lat {latitude} lon {longitude}')
            continue
        row = (latitude - COVERAGE_SOUTH) * CELLS_PER_DEGREE
        column = (longitude - COVERAGE_WEST) * CELLS_PER_DEGREE
        metres[row:row + CELLS_PER_DEGREE, column:column + CELLS_PER_DEGREE] = reduce_tile_to_cells(samples)
        tile_count += 1
    print(f'decoded {tile_count} tiles in {time.time() - started:.0f} s')
    return metres


def metres_to_steps(metres):
    steps = np.where(metres < 0, 0, 1 + (metres.astype(np.int32) + METRES_PER_STEP - 1) // METRES_PER_STEP)
    return steps.astype(np.int16)


def remove_spikes(steps):
    """Replaces cells that tower over all eight neighbours by the highest neighbour. Returns the number replaced."""
    height, width = steps.shape
    replaced = 0
    band_rows = 600
    for start in range(0, height, band_rows):
        top = max(start - 1, 0)
        bottom = min(start + band_rows + 1, height)
        band = steps[top:bottom]
        padded = np.pad(band, 1, mode='constant', constant_values=0)
        # the longitude seam wraps around, the poles do not
        padded[:, 0] = np.pad(band, ((1, 1), (0, 0)), mode='constant')[:, -1]
        padded[:, -1] = np.pad(band, ((1, 1), (0, 0)), mode='constant')[:, 0]
        neighbour_max = np.zeros_like(band)
        for row_shift in (0, 1, 2):
            for column_shift in (0, 1, 2):
                if row_shift == 1 and column_shift == 1:
                    continue
                window = padded[row_shift:row_shift + band.shape[0], column_shift:column_shift + width]
                neighbour_max = np.maximum(neighbour_max, window)
        spikes = band > neighbour_max + SPIKE_STEPS
        inner = slice(start - top, start - top + min(band_rows, height - start))
        inner_spikes = spikes[inner]
        replaced += int(inner_spikes.sum())
        band_inner = steps[start:start + band_rows]
        band_inner[inner_spikes] = neighbour_max[inner][inner_spikes]
    return replaced


def build_steps(terrain_map_path, raw_cache_path):
    if raw_cache_path and os.path.exists(raw_cache_path):
        print(f'using cached decode {raw_cache_path}')
        metres = np.load(raw_cache_path)
    else:
        metres = decode_terrain_map(terrain_map_path)
        if raw_cache_path:
            np.save(raw_cache_path, metres)
    print(f'highest source sample: {metres.max()} m')
    steps = metres_to_steps(metres)
    del metres
    replaced = remove_spikes(steps)
    print(f'isolated spikes replaced: {replaced}')
    cap = 1 + (MAX_PLAUSIBLE_METRES + METRES_PER_STEP - 1) // METRES_PER_STEP
    capped = int((steps > cap).sum())
    steps = np.minimum(steps, cap)
    print(f'cells capped at {MAX_PLAUSIBLE_METRES} m: {capped}')
    return steps.astype(np.uint8)


def compress_blocks(grid):
    block_cells = BLOCK_DEGREES * CELLS_PER_DEGREE
    block_rows = -(-COVERAGE_HEIGHT_DEGREES // BLOCK_DEGREES)
    block_columns = COVERAGE_WIDTH_DEGREES // BLOCK_DEGREES
    padded = np.zeros((block_rows * block_cells, block_columns * block_cells), np.uint8)
    padded[:grid.shape[0], :grid.shape[1]] = grid
    entries = []
    payloads = []
    constant_count = 0
    for block_row in range(block_rows):
        for block_column in range(block_columns):
            block = padded[block_row * block_cells:(block_row + 1) * block_cells,
                           block_column * block_cells:(block_column + 1) * block_cells]
            first = int(block[0, 0])
            if (block == first).all():
                entries.append((KIND_CONSTANT, first, b''))
                constant_count += 1
                continue
            compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
            entries.append((KIND_DEFLATED, 0, compressor.compress(block.tobytes()) + compressor.flush()))
    return block_rows, block_columns, entries, constant_count


def write_grid_file(path, block_rows, block_columns, entries):
    block_count = len(entries)
    index_offset = HEADER_SIZE
    data_offset = index_offset + block_count * INDEX_ENTRY_SIZE
    header = b'TAWSGRID' + struct.pack(
        '<IIiiIIIIII', FORMAT_VERSION, CELLS_PER_DEGREE, COVERAGE_SOUTH, COVERAGE_WEST, COVERAGE_HEIGHT_DEGREES,
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
    parser.add_argument('--terrain-map', required=True, help='SimBridge terrain/terrain.map')
    parser.add_argument('--out', default=OUTPUT_DEFAULT)
    parser.add_argument('--keep-raw', help='cache of the decoded metres grid (.npy), speeds up repeated runs')
    arguments = parser.parse_args()

    steps = build_steps(arguments.terrain_map, arguments.keep_raw)
    print(f'land cells: {(steps > 0).mean() * 100:.1f} %')
    block_rows, block_columns, entries, constant_count = compress_blocks(steps)
    size = write_grid_file(arguments.out, block_rows, block_columns, entries)
    kinds = collections.Counter(kind for kind, _, _ in entries)
    largest = max(len(payload) for _, _, payload in entries)
    print(f'{len(entries)} blocks ({block_rows} x {block_columns}), {constant_count} constant, '
          f'{kinds[KIND_DEFLATED]} deflated, largest {largest} B')
    print(f'wrote {arguments.out}: {size} bytes ({size / 1048576:.2f} MiB)')


if __name__ == '__main__':
    sys.exit(main())
