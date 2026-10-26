# TAWS terrain grid

`build_grid.py` builds `terrain_grid.bin`, the elevation grid the A32NX GPWS uses for the predictive terrain functions
(terrain ahead alerting and the terrain clearance floor).

## Build the file

Needs Python 3 with `numpy`, and the SimBridge `terrain/terrain.map`:

```
python build_grid.py --terrain-map <path to terrain.map> [--out <file>] [--keep-raw <raw.npy>]
```

The default output is
`fbw-a32nx/src/base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/panel/terrain_grid.bin`
(about 20 MB). That path is git-ignored on purpose: the file is not committed to this repository.

The file layout is documented at the top of `build_grid.py` and read by
`fbw-common/src/wasm/systems/systems/src/surveillance/egpws/terrain_grid.rs`.

## Ship the file

Large binary assets live in the `aircraft-large-files` repository (the `large-files` submodule), which the build copies
over the aircraft package. Files up to 100 MiB are stored whole (`npm run chunk` only splits bigger ones), so the grid
goes in unchanged at the same relative path:

```
large-files/fbw-a32nx/src/base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/panel/terrain_grid.bin
```

Without the file the GPWS still runs modes 1 to 5; the predictive terrain functions report the terrain data as
unavailable (TERR STBY on the ND).
