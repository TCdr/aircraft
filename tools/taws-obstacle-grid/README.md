# TAWS obstacle grid

`build_obstacle_grid.py` builds `obstacle_grid.bin`, the obstacle grid the A32NX GPWS uses for the predictive obstacle
alerts (OBSTACLE AHEAD, OBSTACLE AHEAD PULL UP, AVOID OBSTACLE and OBST AHEAD on the ND).

## Source

The FAA Digital Obstacle File (DOF), public domain, refreshed daily:
<https://aeronav.faa.gov/Obst_Data/DAILY_DOF_DAT.ZIP>. It lists the obstacles of the United States and its territories, so
the obstacle alerts only work where it has data.

## Build the file

Needs Python 3 with `numpy`. Unzip `DOF.DAT` from the download, then:

```
python build_obstacle_grid.py --dof <path to DOF.DAT> [--out <file>]
```

The default output is
`fbw-a32nx/src/base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/panel/obstacle_grid.bin`.
The file is small (about 265 KB), so unlike the terrain grid it is committed to this repository. Rebuild and commit it
to take in newer obstacles.

Tests: `python -m unittest discover -s tools/taws-obstacle-grid`.

## Format

The same format as the terrain grid (`tools/taws-terrain-grid`), read by the same code
(`fbw-common/src/wasm/systems/systems/src/surveillance/egpws/terrain_grid.rs`): one byte per 1 arcminute cell, 0 for no
obstacle, otherwise 1 + ceil(metres / 50) of the highest obstacle top (AMSL) in the cell. The rounding is always
upwards, so a cell never reads lower than its highest obstacle. Dismantled obstacles (action code D) are left out. The
details are at the top of `build_obstacle_grid.py`.

Without the file the GPWS works as before, with no obstacle alerts; the terrain functions do not need it.

The ND terrain picture (TERR ON ND) reads the same file to draw the obstacles, in the colour and dot density of the
terrain at that height. Without the file the ND simply shows no obstacles.
