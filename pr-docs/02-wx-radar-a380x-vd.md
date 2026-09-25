# PR 2 - native weather radar on the A380X ND and weather on the VD

- **Title:** `feat(a380x/nd): add the native weather radar to the ND and the weather to the VD`
- **Base:** `master` - **Branch:** `feature/a380x-nd-weather-radar` (built on `feature/a32nx-nd-weather-radar`: same `main.cpp`, so PR 1 has to be merged first
  or this PR shows its commits too; compiled for both aircraft)
- **Commits (own):** `ede2b4247` (WXR availability), `774ff9187` (A380X ND gauge), `6d86300ab` (radar follows the SURV CONTROLS, weather on the VD),
  `0efbbef25` (VD weather cells)
- **Labels to request:** `A380X`, `ND`, `VD`, `QA A380 Only`, `QA MSFS 2024 Only`
- **Issue to open first:** *"Weather radar on the A380X ND and VD"* - "Selecting the WX overlay on the EFIS control panel shows WXR INOP
  on the ND (both weather systems are hard-coded as failed) and no weather is ever drawn, on the ND or on the VD (WX ON VD)."
- **CHANGELOG line:** `1. [A380X/ND] Add the weather radar to the ND and the weather to the VD, following the EFIS WX overlay and the SURV CONTROLS WXR settings - @TCdr` - already added to `.github/CHANGELOG.md` in the commit of this PR

---- paste from here ----

Fixes #[issue_no]

## Update 2026-09-22/23 (these parts are in PR 9's commits, not in this branch): VD weather along the cut, 30 s buffer fill

- **On-path / off-path (FCOM DSC-34-20-30, WX display function) is NOT modelled.** It was tried (a third MapView per ND in the engine's TOP VIEW radar
  mode for the off-path weather, hatched) and removed again on 2026-09-23: the engine runs one radar per aircraft and a view in the top-view mode changes
  what the horizontal views deliver (rain at the aircraft's level came back over the whole range instead of as cells; the A32NX next to it was clean, and
  so were the A380X's views without the top view). The A380X shows the same picture as the A32NX, from the beam views. The VD terrain gauge still has a
  single view (water is entry 0 of its colour list, blue). The FCOM's envelope limits cannot be applied either: MSFS's radar has no altitude information.
- **VD weather along the zero-width vertical cut (FCOM):** the same cut as the terrain (flight plan in managed modes, track otherwise, PR 9), sampled over
  the 3.5 deg beam width instead of the 10 deg wedge; the columns stand on the ground (sea level) rather than on the plot bottom.
- **30 s buffer fill (FCOM operational recommendations):** from the moment the radar starts transmitting (any ND with the WX overlay, radar not OFF, on the
  ground too) the picture is revealed by one slow sweep over 30 s on both NDs; the VD shows its weather once the sweep passed the cut's direction.
- MAP mode as PR 1 (from the ND's terrain pair). The SURV CONTROLS defaults (WXR AUTO, TURB AUTO, GAIN AUTO, MODE WX, WX ON VD ON, PRED W/S AUTO) match the
  FCOM's "SURV DEFAULT SETTINGS".

## Summary of Changes

Adds the weather radar to the A380X NDs with the native `ndwxr` gauge of the A32NX PR, and the weather to the VD.

- **Availability (`EfisTawsBridge`):** both WXR systems were hard-coded as failed, so the ND always showed WXR INOP as soon as the WX overlay was
  selected. Each WXR is now failed only while its AESU is reset or its power supply is lost (AC ESS for system 1, AC 4 for system 2), like GPWS.
- **ND radar:** built for the A380X (`build.sh --a380x`, `ndwxr_A380X.wasm`, `build-a380x:ndwxr`, igniter task) and added to both ND screens
  (`VCockpit07` CPT, `VCockpit08` F/O, 768x1024). It follows the A380X's rules: shown when this side's EFIS panel has the WX overlay selected
  and the WXR & TAWS system selected on the SURV panel is not failed; the ND range table is `[-1, 10 .. 640]` and range index 0 (the OANS
  map) hides the radar; the ND is on with the DC buses of its display unit (`CdsDisplayUnit` mapping); IR 1/2 feed the CPT/F/O with the
  ATT HDG knob in NORM, IR 3 otherwise. The ND pages are shared with the A32NX, so the geometry is the same.
- **SURV CONTROLS:** the radar follows the WXR, TURB, MODE (MAP) and WX ON VD buttons (`L:A380X_WXR_OFF`, `_TURB_OFF`, `_MODE_MAP`,
  `_VD_OFF`, written by the SURV PR). There is no TURB-only mode on the A380X: TURB off gives WX, on gives WX+T.
  (`PRED WS` and `GAIN` are written by the SURV page too but nothing reads them: MSFS's radar has no predictive windshear or gain.)
- **VD weather (WX ON VD):** the vertical MapView mode of MSFS is a single thin beam (and tilting it crashes the gauge), so the VD weather is
  stylised from the ND's own radar views: the texel columns near the heading line are rotated onto the range axis and drawn as cells (green and
  yellow columns with rounded tops, a red core; no magenta: the real VD does not display turbulence, FCOM DSC-31-20-40-10). The heights are
  fractions of the VD altitude span above the aircraft, placed on the ADR baro-corrected altitude like the VD's own symbol. Single-texel specks
  and radar sweep streaks are filtered.

## Cockpit API Changes

Reads (written by the SURV PR, which documents them): `L:A380X_WXR_OFF`, `L:A380X_WXR_TURB_OFF`, `L:A380X_WXR_MODE_MAP`,
`L:A380X_WXR_VD_OFF` (Bool, one per SURV CONTROLS button). Also reads `L:A380X_EFIS_{L,R}_ACTIVE_OVERLAY`, `L:A32NX_WXR_TAWS_SYS_SELECTED`, `L:A32NX_WXR_{1,2}_FAILED`,
`L:A32NX_VD_{1,2}_RANGE_LOWER/UPPER` and the ND mode/range LVars. No other LVar added or changed. `panel.cfg` (A380X cockpit part) gets
the gauges on the two ND blocks.

## Screenshots (if necessary)

**TO ADD**: before/after of the A380X ND with the WX overlay selected (before: WXR INOP, no weather); CPT with weather and F/O with
another range/overlay; the VD with WX ON VD; the SURV CONTROLS page next to the resulting ND.

## References

- MSFS SDK, `MSFS_MapView.h` native weather radar API.
- **TO ADD**: A380 FCOM/documentation for the WX overlay of the ND, the WXR & TAWS system selection and the weather on the VD, with screenshots.

## Additional context

The VD weather is an approximation (MSFS has no vertical weather data): the shapes are made from the horizontal radar image, they are not real
cell heights. Say so in the review if you would rather not ship that part, the ND radar works without it.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. In flight with weather, select the WX overlay on the CPT EFIS panel and a WXR & TAWS system on the SURV panel: weather appears on the CPT
   ND (ARC and ROSE NAV, ranges 10 to 640), no WXR INOP message. Do the same on the F/O side with another range.
2. SURV CONTROLS page: WXR off removes it, TURB toggles WX / WX+T, MODE MAP removes the precipitation.
3. Range index 0 (OANS) and the PLAN mode hide the radar.
4. WX ON VD: weather cells appear on the VD around the aircraft altitude, and disappear with WX ON VD off.
5. Reset the AESU of a WXR system, or remove AC ESS / AC 4: that system is failed (WXR INOP) and its weather goes.
6. ATT HDG knob away from NORM: the position source changes, no glitch.

<!-- DO NOT DELETE THIS -->
## How to download the PR for QA

Every new commit to this PR will cause new A32NX and A380X artifacts to be created, built, and uploaded.

1. Make sure you are signed in to GitHub
1. Click on the **Checks** tab on the PR
1. On the left side, find and click on the **PR Build** tab
1. Click on either **flybywire-aircraft-a320-neo** or **flybywire-aircraft-a380-842** download link at the bottom of the page
