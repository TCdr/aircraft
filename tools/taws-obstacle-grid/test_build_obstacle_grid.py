"""Tests for build_obstacle_grid.py. Run: python test_build_obstacle_grid.py."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import build_obstacle_grid as tool

# Real DOF layout: lat DMS at 35, lon DMS at 48, AGL at 83, AMSL at 89, action at 118.
RECORD = ('{oas} O US AL DAUPHIN ISLAND   {lat} {lon} RIG                1 00236 {amsl:05d} R 5 D M 1990ASO01578OE '
          '{action} 2014138 ')


def record(lat='30 10 45.00N', lon='088 04 39.00W', amsl=236, action='C'):
    return RECORD.format(oas='01-001307', lat=lat, lon=lon, amsl=amsl, action=action)


class DmsTest(unittest.TestCase):
    def test_north_east_positive(self):
        self.assertAlmostEqual(tool.parse_dms(47, 20, 0.54, 'N'), 47 + 20 / 60 + 0.54 / 3600)
        self.assertAlmostEqual(tool.parse_dms(8, 30, 0, 'E'), 8.5)

    def test_south_west_negative(self):
        self.assertAlmostEqual(tool.parse_dms(88, 4, 39, 'W'), -(88 + 4 / 60 + 39 / 3600))
        self.assertAlmostEqual(tool.parse_dms(33, 0, 0, 'S'), -33.0)

    def test_bad_hemisphere_rejected(self):
        with self.assertRaises(ValueError):
            tool.parse_dms(10, 0, 0, 'X')

    def test_record_fields(self):
        parsed = tool.parse_record(record())
        self.assertAlmostEqual(parsed.latitude, 30 + 10 / 60 + 45 / 3600)
        self.assertAlmostEqual(parsed.longitude, -(88 + 4 / 60 + 39 / 3600))
        self.assertEqual(parsed.amsl_feet, 236)

    def test_malformed_record_rejected(self):
        with self.assertRaises(ValueError):
            tool.parse_record(record(lat='30 99 45.00N'))
        with self.assertRaises(ValueError):
            tool.parse_record('garbage')


class CellTest(unittest.TestCase):
    def test_cell_index_of_position(self):
        # 30 deg 10' 45'' N is in the 11th arcminute above 30 N; 88 deg 4' 39'' W is 91 deg 55' 21'' east of -180.
        parsed = tool.parse_record(record())
        row, column = tool.cell_of(parsed)
        self.assertEqual(row, (30 - tool.WORLD_SOUTH) * 60 + 10)
        self.assertEqual(column, (180 - 89) * 60 + 55)

    def test_exact_minute_boundary_is_not_pushed_down_by_rounding(self):
        parsed = tool.parse_record(record(lat='30 10 00.00N', lon='088 04 00.00W'))
        row, column = tool.cell_of(parsed)
        self.assertEqual(row, (30 - tool.WORLD_SOUTH) * 60 + 10)
        self.assertEqual(column, (180 - 89) * 60 + 56)

    def test_antimeridian_both_sides(self):
        east = tool.parse_record(record(lon='179 59 30.00E'))
        west = tool.parse_record(record(lon='179 59 30.00W'))
        self.assertEqual(tool.cell_of(east)[1], 360 * 60 - 1)
        self.assertEqual(tool.cell_of(west)[1], 0)


class EncodingTest(unittest.TestCase):
    def test_zero_height_obstacle_still_marks_the_cell(self):
        self.assertEqual(tool.feet_to_cell(0), 1 + 0)  # a zero-height obstacle still marks the cell

    def test_never_under_reads(self):
        for feet in list(range(0, 3000, 7)) + [3, 164, 165, 1049, 1050, 2063]:
            cell = tool.feet_to_cell(feet)
            decoded_feet = (cell - 1) * 50 / 0.3048  # same as cell_to_feet in terrain_grid.rs
            self.assertGreaterEqual(decoded_feet + 1e-9, feet, feet)
            self.assertLess(decoded_feet, feet + 50 / 0.3048 + 1e-9, feet)

    def test_cap_fits_a_byte(self):
        self.assertEqual(tool.feet_to_cell(10 ** 6), 255)


class GridTest(unittest.TestCase):
    def test_max_of_two_obstacles_in_one_cell(self):
        grid = tool.new_cell_grid()
        tool.add_obstacle(grid, tool.parse_record(record(amsl=500)))
        tool.add_obstacle(grid, tool.parse_record(record(lat='30 10 50.00N', amsl=1500)))
        tool.add_obstacle(grid, tool.parse_record(record(lat='30 10 55.00N', amsl=900)))
        row, column = tool.cell_of(tool.parse_record(record()))
        self.assertEqual(grid[row, column], tool.feet_to_cell(1500))
        self.assertEqual(int((grid > 0).sum()), 1)

    def test_dismantled_record_skipped(self):
        grid = tool.new_cell_grid()
        stats = tool.load_records([record(action='D'), record(amsl=300)], grid)
        self.assertEqual(stats.skipped_dismantled, 1)
        self.assertEqual(stats.records, 1)
        row, column = tool.cell_of(tool.parse_record(record()))
        self.assertEqual(grid[row, column], tool.feet_to_cell(300))

    def test_record_lines_include_letter_prefixes_but_not_headers(self):
        self.assertTrue(tool.is_record_line(record().replace('01-001307', 'CA-020012')))
        self.assertFalse(tool.is_record_line('OAS#      V CO ST CITY             DEG MIN SEC'))
        self.assertFalse(tool.is_record_line('-' * 120))

    def test_malformed_lines_counted_not_fatal(self):
        grid = tool.new_cell_grid()
        stats = tool.load_records([record(lat='30 99 45.00N'), record()], grid)
        self.assertEqual(stats.rejected, 1)
        self.assertEqual(stats.records, 1)


if __name__ == '__main__':
    unittest.main()
