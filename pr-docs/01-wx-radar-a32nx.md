# PR 1 - native weather radar on the A32NX ND

- **Title:** `feat(a32nx/nd): add a native weather radar to the ND`
- **Base:** `master` (MSFS2024) - **Branch:** `feature/a32nx-nd-weather-radar` (built on `origin/master`, compiled for the A32NX)
- **Commits:** `e8933f6d5` (CPT ND gauge), `8b240be76` (F/O ND), `33b9c6f3f` (smoothing), `b52c8dace` (ground inhibit),
  `5b8a3604d` (solid airborne radar colours, the aircraft-independent part of the old mixed commit)
- **Labels to request:** `A32NX`, `ND`, `QA MSFS 2024 Only`, `Extensive Testing Needed` (`MSFS2024` is added automatically)
- **Issue to open first** (feature request template, aircraft version "Development"): *"Weather radar display on the A32NX ND"* -
  "The ND has no weather radar display: the WX SYS / MODE knobs on the weather radar panel do nothing on the ND. Add a weather radar image
  on the ARC and ROSE NAV pages of both NDs, driven by the panel knobs."
- **CHANGELOG line:** `1. [A32NX/ND] Add a native weather radar display on the ROSE and ARC pages, controlled by the WX SYS and MODE knobs - @TCdr` - already added to `.github/CHANGELOG.md` in the commit of this PR

---- paste from here ----

Fixes #[issue_no]

## Update 2026-09-22 (uncommitted): radar on the ground, MAP mode

- The ground inhibit is gone: the radar works on the ground as the manuals say (A320 FCOM DSC-34-SURV-30-30 "on the ground, the radar is scanning when the
  flight crew sets one radar to ON and selects a display mode"; A320 FCTM 04.006 "Use of radar" has the crew check ground returns during taxi). The LGCIU
  reads are removed (the ground inhibit commit `8b240be76` becomes obsolete: drop it when rebuilding the branch, or keep it and add the revert).
- MAP mode is a ground map from the terrain (altitude) view instead of drawing nothing: "black indicates water, green indicates the ground, and amber
  indicates cities and mountains" (A320 FCOM, display mode selector; mountains = terrain within 6 000 ft below the aircraft or above it; the sim has no cities).

## Summary of Changes

Adds the weather radar to the A32NX ND. It is drawn by a new native WASM gauge (`ndwxr`), stacked on the ND gauge of each side, from
MSFS's own weather radar data (`MSFS_MapView`), so the ND JS code does not need the Bing map path.

- **Display:** ARC (forward half disk) and ROSE NAV (forward half), aligned with the ND's range rings, on the CPT and the F/O ND.
  Nothing is drawn on the other ND modes, or when the radar is off.
- **Controls:** the WX SYS knob (SYS 1 / SYS 2 / OFF) and the MODE knob: WX draws the precipitation, WX+T the precipitation and the
  turbulence, TURB only the turbulence, MAP nothing.
- **Colours:** airborne radar levels of rain rate: green 0.7, yellow 4, red 12 mm/h, magenta for turbulence. The engine's rain rate is noisy
  texel by texel, so each threshold is a binary mask (in a colour channel of the MapView) that is blurred, saturated and squared, which gives
  solid areas with crisp edges instead of grain.
- **Turbulence** is a proxy: MSFS gives no turbulence data, only rain rate. Rain rate above 20 mm/h is drawn magenta, out to 40 NM.
- **Two independent NDs:** the CPT ND is on the AC ESS bus, the F/O ND on AC 2. The position source follows the ADIRS rule of the ND:
  IR 1 for the CPT, IR 2 for the F/O, or IR 3 when the ATT HDG knob routes it to that side. ND mode and range come from
  `A32NX_EFIS_{L,R}_ND_MODE` / `_RANGE`. The two WX knobs are shared.
- **Ground:** like a real weather radar it does not transmit on the ground. Nothing is drawn while both main gear legs are compressed on
  either LGCIU. The engine already stabilises the beam in pitch and bank.
- **Build:** new igniter task `systems-ndwxr` (`build-a32nx:ndwxr`), the module is built with the same `wasm-opt` sign-extension lowering as
  `terronnd`, `panel.cfg` gets the gauge on the two ND blocks (`VCockpit02` / `VCockpit15`, with the side as the last parameter), and
  `docs/README.md` lists the new folder.

Limits of MSFS that shaped it: no readback of the MapView texture (so everything is blend passes), no turbulence data, no tilt or gain, and
the radar image is only drawn when it is airborne with weather around (use the MSFS weather presets to test).

## Cockpit API Changes

No new LVars, no LVar changed. The gauge reads:
`L:A32NX_EFIS_{L,R}_ND_MODE`, `L:A32NX_EFIS_{L,R}_ND_RANGE`, `L:XMLVAR_A320_WeatherRadar_Sys`, `L:XMLVAR_A320_WeatherRadar_Mode`,
`L:A32NX_ADIRS_IR_{1,2,3}_LATITUDE` / `_LONGITUDE` / `_TRUE_HEADING`, `L:A32NX_ATT_HDG_SWITCHING_KNOB`,
`L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED`, `L:A32NX_ELEC_AC_2_BUS_IS_POWERED`, `L:A32NX_LGCIU_{1,2}_{LEFT,RIGHT}_GEAR_COMPRESSED`.

## Screenshots (if necessary)

**TO ADD** (same camera, zoom and time of day, before/after): the CPT ND in ARC and in ROSE NAV with rain and a thunderstorm at 40 and
80 NM; WX and WX+T side by side; the F/O ND showing a different range; the ND on the ground (no radar).
Before: the same ND with nothing drawn.

## References

- MSFS SDK, `MSFS_MapView.h` native weather radar API (implementation, not real-life behaviour).
- **TO ADD** (the guide asks for real-life references): the A320 FCOM/PSCOM pages showing the weather radar on the ND (colour coding of
  precipitation and turbulence, WX / WX+T / TURB modes, WXR not transmitting on the ground), with screenshots.

## Additional context

The native MapView weather data was found to be far more consistent across sessions than the JS/Bing map path, which is why the radar is
a WASM gauge. `ndwxr` serves both ND gauges from one module (state per gauge context), and each ND creates two MapViews (precipitation
and turbulence). MSFS allows at most 8 MapViews per module, which matters for the TERR ON ND PR that reuses this module.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Start a flight in the air with weather (MSFS weather presets: rain, thunderstorm). Set the ND to ARC or ROSE NAV, WX SYS on SYS 1 and
   MODE on WX: precipitation appears in green/yellow/red, aligned with the range rings. Change the range (10 to 320) and switch ARC/ROSE
   NAV: the image stays aligned.
2. MODE on WX+T: magenta turbulence cells appear over strong cells (within 40 NM). TURB: only the magenta. MAP: nothing.
3. WX SYS on OFF, or the ND on PLAN / ROSE ILS / ROSE VOR: no radar.
4. On the ground (gear compressed): no radar. After take-off it comes back.
5. F/O ND: set another range and mode than the CPT ND: both show their own image. Switch off AC ESS (CPT) and AC 2 (F/O): the
   corresponding radar goes off. Try the ATT HDG knob (CAPT/F/O 3) on the position source.
6. Restart MSFS with the same weather and check the same cells appear (consistency between sessions).
7. Check the ND lines, range rings, traffic and flight plan stay visible over the weather.

<!-- DO NOT DELETE THIS -->
## How to download the PR for QA

Every new commit to this PR will cause new A32NX and A380X artifacts to be created, built, and uploaded.

1. Make sure you are signed in to GitHub
1. Click on the **Checks** tab on the PR
1. On the left side, find and click on the **PR Build** tab
1. Click on either **flybywire-aircraft-a320-neo** or **flybywire-aircraft-a380-842** download link at the bottom of the page
