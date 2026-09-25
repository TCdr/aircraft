# PR 4 - native TERR ON ND and the A380X VD terrain profile

- **Title:** `feat(nd): add the native TERR ON ND and the A380X VD terrain profile`
- **Base:** `master` - **Branch:** `feature/nd-terrain` (built on `feature/a380x-nd-weather-radar`: same `ndwxr/src/main.cpp` and its A380X code, so PR 1 and 2 come first)
- **Commits:** `e0e1d718d` (terrain + VD profile), `ac5ad3aef` (range up to 29,500 ft above, blue water), `89f956037` (terronnd retired, A32NX status poster), `acffe345b` (the TAWS status object typed by its mapper)
- **Labels to request:** `A32NX`, `A380X`, `ND`, `VD`, `GPWS`, `QA MSFS 2024 Only`, `Extensive Testing Needed`
- **Issue to open first:** *"TERR ON ND does not work without SimBridge on MSFS 2024"* - "The terrain display of the ND needs the SimBridge
  terrain service, which does not work with MSFS 2024. Add a terrain display that uses only the simulator's own data."
- **CHANGELOG line:** `1. [ND] Add a TERR ON ND terrain display that works without SimBridge, and a terrain profile on the A380X VD - @TCdr` - already added to `.github/CHANGELOG.md` in the commit of this PR (a completely new feature, so a difference from the stable release)

---- paste from here ----

Fixes #[issue_no]

## Update 2026-09-22 (uncommitted): reference altitude 30 s ahead in a fast descent

"The reference altitude is computed based on the current aircraft altitude or, if descending more than 1 000 ft/min, the altitude expected in 30 s" (A320
FCOM DSC-31-45, GPWS terrain picture): the altitude view colours by the aircraft's own altitude, so its band range is shifted by the altitude lost in 30 s
(from the IR vertical speed word) instead. Both aircraft. The VD terrain gauge also lost its water view (water in the terrain list, blue as the FCOM says) and
places the terrain by true height, see PR 9.

## Summary of Changes

Terrain on the ND (TERR ON ND) without SimBridge, drawn by the `ndwxr` module for both aircraft from MSFS's own terrain data, plus a terrain
profile on the A380X VD.

**How the ND terrain works**
- An altitude-mode MapView colours the terrain by the aircraft's altitude minus the terrain height in 250 ft bands, over -29,500 to +2,500 ft
  (128 entries). The EGPWS look is built from the bands: dense red from 2000 ft above the aircraft, dense/medium yellow from 1000 ft above,
  medium yellow down to 500 ft below (250 ft with the gear down), dense green to 1000 ft below (500 ft), light green to 2000 ft below and
  nothing under that. The dots are a random stipple (~1 px cells, ~70% lit when dense) made with blend-only passes (ordered compare against a
  noise image, sharpened by repeated squaring), as MSFS gives a gauge no way to read the texture back.
- Water never takes the altitude list's colours (it always gets the first entry, like terrain far above), so a second altitude view with a
  two-entry list tells water from land; the water is wiped from the terrain and redrawn as cyan-blue dots at every altitude.
- The map is rotated by the ND's own true heading. ARC shows the forward half disk, the ROSE modes the whole disk; every map page but PLAN,
  also on the ground, in place of the weather.
- A32NX: gated by `A32NX_EGPWC_ND_{L,R}_TERRAIN_ACTIVE` (the TERR ON ND pb), gear from `A32NX_EGPWC_GEAR_IS_DOWN`. A380X: gated by the ND
  overlay being TERR with a WXR & TAWS system selected and not failed.
- Terrain far above the range's top does not clamp to the first entry in MSFS (it comes out as rings of the other entries), which is why the range
  reaches -29,500 ft and every band above +2000 ft is red: nothing on Earth is higher above the aircraft.

**A380X VD terrain profile:** a third `ndwxr` gauge per ND (`LV` / `RV` in `panel.cfg`, its own surface). The heading-line column of a terrain
view whose altitude range follows the VD's limits is stretched over the plot height, compared with a vertical ramp and filled brown; water is cyan
from sea level down. Needs the TERR SYS button of the SURV page not to be OFF.

**MSFS limits that shaped the module** (found by crashing the gauge draw in-sim): a module can have at most 8 MapViews (a ninth is created without
complaint and crashes the draw; hiding views does not help). The A32NX uses 4 per ND; the A380X has 2 per ND, which are either the weather pair
or the terrain pair (never wanted together) and are reconfigured when the crew switches, and 2 per VD terrain gauge. Growing the module's memory
while it draws also crashes it, so `build.sh` reserves 16 MB up front.

**Peaks box (PR 9's commit `43a6899f1`, 2026-09-23):** the TERR box with the highest and lowest elevation of the range needs real elevations, which a
gauge cannot read back from MSFS, so its figures come from SimBridge, over SimConnect: SimBridge's terrain service only renders while a SimConnect
client takes part (its HTTP `renderingThresholds` endpoint stays empty while it is connected to the sim; an HTTP poller was tried first and reverted),
and the stock `terronnd` gauge was that client. `ndwxr` now takes its place from the first ND gauge installed: it creates and writes the aircraft status
block `FBW_SIMBRIDGE_EGPWC_AIRCRAFT_STATUS` every 100 ms (the content of terronnd's `collection.cpp`, with the terrain reported on per side exactly
when the module selects it), subscribes to the two threshold areas SimBridge writes per ND and publishes the figures on the four
`L:A32NX_EGPWC_ND_{side}_TERRAIN_{MIN,MAX}_ELEVATION(_MODE)` LVars that `TerrainMapThresholds` already shows, while terrain is selected on that side
on a map page and the figures are fresh (5 s) and for the ND's range and mode; -1 otherwise. It reconnects every 5 s and disconnects when the owning
gauge is killed. `build.sh` adds the SimConnect SDK include path; the client data layouts are terronnd's `simbridge.h`. Without SimBridge the box stays
empty and the terrain is drawn as before. (Peaks mode, the display when all terrain is far below the aircraft, uses the same figures: PR 9.)

**terronnd retired (uncommitted, 2026-09-23):** the stock `terronnd` gauge is removed from both `panel.cfg` (the wasm is still built, nothing instantiates it).
Reasons found in test with SimBridge 0.7.0 on MSFS 2024: its picture is not clipped at the compass arc (the old ARC_CLIP dome), it is never
expired (the last frame stays after SimBridge closes), and on the A380X its SimConnect status reports terrain on for an ND whenever the VD
wants it, which SimBridge falls back to after two minutes without HTTP posts (a stationary aircraft), so the F/O terrain stayed on with the
overlay off. The native picture is the only one now; SimBridge only supplies the peaks figures. The A32NX gets `TawsStatusBridge`
(systems host) to post the aircraft status over HTTP as the A380X does (terronnd used to send it over SimConnect; the SimConnect status block
SimBridge takes the aircraft's position from is written by `ndwxr` again, see the peaks box), and both hosts re-post it every 30 s so SimBridge
never drops the HTTP source. The ARC picture (terrain and weather) leaves the ND's bottom-right corner free
(same corner as CanvasMap's ARC_CLIP) for the TERR box and the radar mode text.

**Not done:** the VD profile follows the heading line and not the flight plan path, and switching between weather and terrain on the A380X ND
takes about a second.

## Cockpit API Changes

No new LVars. The terrain gauge reads `L:A32NX_EGPWC_ND_{L,R}_TERRAIN_ACTIVE`, `L:A32NX_EGPWC_GEAR_IS_DOWN`, `L:A32NX_GPWS_TERR_OFF`,
`L:A32NX_TERR_{1,2}_FAILED`, `L:A32NX_WXR_TAWS_SYS_SELECTED`, `L:A380X_EFIS_{L,R}_ACTIVE_OVERLAY` and `L:A32NX_VD_{1,2}_RANGE_LOWER/UPPER`
(the last two pairs already exist), `panel.cfg` gets the VD gauges.

## Screenshots (if necessary)

**TO ADD**: TERR ON ND on both aircraft in ARC and ROSE, at the same place before/after (before: no terrain without SimBridge), e.g. KASE
(Aspen, 7,820 ft) at 40 and 320 NM, and LSZC; sea and lakes in blue; gear up/down colour change; the A380X VD terrain profile; weather on one ND and
terrain on the other.

## References

- MSFS SDK, `MSFS_MapView.h` altitude view mode (implementation).
- **TO ADD**: the Honeywell EGPWS / A320 & A380 FCOM references for the terrain colours and the altitude thresholds (the values above), and for the
  gear-down thresholds; if the blue water cannot be referenced, drop it (it was added because the reference aircraft in the sim show it).

## Additional context

The stock `terronnd` module is only a client of the external SimBridge program; its source is not changed by this PR, but the gauge is no longer
instantiated (removed from both `panel.cfg`, see above), so there is one terrain layer. Say in the review if the `terronnd` build task should go
too. After the range fix the A380X VD terrain profile still uses a range that ends at the top of its plot (same weakness as the ND had), it
was not affected in tests at Aspen where the plot sits above the terrain.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. A32NX: TERR ON ND pb ON, ND in ARC or ROSE NAV: terrain in red/yellow/green dots around the aircraft, rotating with the heading. Check at
   high terrain: on the ground at KASE (Aspen) at 40 and 320 NM there must be red.
2. Lower the gear: the medium-yellow/green limits move (250/500 ft instead of 500/1000 ft below). Water is blue dots.
3. PLAN: no terrain. On the ground the terrain is drawn.
4. A380X: TERR overlay on the EFIS panel and a WXR & TAWS system selected: same on the ND; VD shows the terrain profile (TERR SYS not OFF); with
   TERR SYS OFF the VD says NO TERR DATA AVAILABLE (see the SURV PR).
5. A380X: WX on the CPT ND and TERR on the F/O ND at once, then swap them (about 1 s to switch).
6. Weather and terrain never both show on the same ND; the weather comes back when TERR is turned off.

<!-- DO NOT DELETE THIS -->
## How to download the PR for QA

Every new commit to this PR will cause new A32NX and A380X artifacts to be created, built, and uploaded.

1. Make sure you are signed in to GitHub
1. Click on the **Checks** tab on the PR
1. On the left side, find and click on the **PR Build** tab
1. Click on either **flybywire-aircraft-a320-neo** or **flybywire-aircraft-a380-842** download link at the bottom of the page
