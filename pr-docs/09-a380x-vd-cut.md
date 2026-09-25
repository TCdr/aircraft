# PR 9 - the radar, terrain and VD after the A380 / A320 manuals (VD cut along the flight plan, real-display look, peaks mode)

- **Title:** `feat(nd): follow the A380 and A320 manuals for the weather radar, the terrain and the VD`
- **Base:** `master` - **Branch:** `feature/nd-manuals-pass` (on top of `feature/nd-wxr-mode-label`, the chain tip: it edits `ndwxr/main.cpp`
  after the radar, terrain and label code, `EfisTawsBridge.ts` after PR 2 and PR 4, and `VerticalDisplay.tsx`; PRs 1, 2, 4 and 3 come first)
- **Commits (after the rebase of 2026-09-23 evening):** `e0d8756a5` (radar on the ROSE ILS / VOR pages too), `e32c0041f` (VD weather on the ADR
  baro-corrected altitude), `ee739e25a` (VD scale rule), `96c1ffcf2` (VD cut LVars), `150ad4a81` (the FCOM/FCTM pass: radar on the ground, MAP mode,
  on-path / off-path, 30 s buffer fill, VD weather along the cut, terrain look-ahead, VD terrain by true height), `9aebfc062` (WXR OFF label),
  `0910bfdc6` (peaks mode, the real A380 display shape and look, VD terrain height fix), `76b4d1afe` (the on-path / off-path display REMOVED again:
  the engine runs one radar per aircraft and the top-view MapView it needed corrupted the beam views, see the commit message), `43a6899f1` (the TERR
  peaks box figures from SimBridge over SimConnect, `ndwxr` as SimBridge's SimConnect client in terronnd's place; described in the PR 4 draft),
  `61a348d92` (the VD water in the ND's water colour: a second MapView per VD gauge, the water mask, drawn with the ND's water tint),
  `d7747b040` (refactor: the radar module split into translation units by concern, see the README's quality pass), `75dc1f8de` (the ARC
  picture stops just above the message box), `333f17e91` (the real antenna sweep per aircraft), `a5fcb23f3` (no weather above 320 NM, FCOM), `ddca9fe22` (the A380's own WXR messages WX / MAP / WXR OFF on the ND, FCOM).
  The hashes of the older commits changed with the 2026-09-24 rebase: `e0d8756a5` `e32c0041f` `ee739e25a` `96c1ffcf2` `150ad4a81`
  `9aebfc062` `0910bfdc6` `76b4d1afe` `43a6899f1`.
- **Scope note:** these commits change `ndwxr/main.cpp` across the radar, terrain and VD code at once, which is why they are one PR on top of the
  chain and not spread over PRs 1, 2 and 4 (tried, they do not apply below the chain tip). The body below and the "Work of 2026-09-22" section of the
  README list what each part is and which manual page it follows. The PR 1 and PR 3 bodies say "ARC and ROSE NAV pages"; this PR makes it all map pages.
- **Labels to request:** `A380X`, `VD`, `ND`, `QA A380 Only`, `QA MSFS 2024 Only`
- **Issue to open first:** *"A380X VD shows the terrain and weather along the heading line only, and its scale hides the ground in cruise"*
- **CHANGELOG line:** `1. [A380X/VD] Cut the VD along the active flight plan (track in selected modes), place the terrain by true height, keep the ground on the
  scale in cruise - @TCdr` (to add in the commit)

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

- **Vertical cut (FCOM DSC-31-20-40-10):** `EfisTawsBridge` publishes the cut as `L:A380X_VD_CUT_*` LVars: along the active flight plan in the managed lateral
  modes (a vertex per path vector, the midpoint of each turn, a 160 NM straight extension, a 200 NM window from just behind the aircraft, twice a second),
  along the track (IR true track) in the selected modes, as the FCOM's "VIEW ALONG ACFT TRK". The native gauge draws the terrain profile piece by piece along
  it (falls back to the track when the aircraft is more than 5 NM off the plan), with a width of 2 x RNP (1 NM terminal, 2 NM en route above 18 000 ft) as the
  highest terrain across five columns, and the grey area from the FMS's next track change > 3 deg. The weather on the VD follows the same cut with a zero width
  (beam-width sampling).
- **Scale (FCOM "the FMS defines the origin of the vertical scale in order to display the aircraft mock-up and most of the aircraft trajectory"):** with a
  trajectory the highest of aircraft / path sits at three quarters of the 4 deg window, the top is capped at 70 000 ft and the bottom may go below sea level,
  so the ground stays on the plot in cruise as on the real aircraft (photo at FL400). Without a trajectory the aircraft stays in the middle.
- **Terrain placement (FCOM / FCTM SI-70 "the height of the aircraft above the terrain displayed on the VD is geometrically correct and does not vary with the
  altimeter setting"):** the terrain view's range is set from the ADR baro altitude, so the gap under the mock-up is the true height whatever the baro
  setting. Water is drawn from a water-mask view in the same teal as the ND's terrain display (the FCOM says blue; the ND's colour is what the crew
  sees next to it). Magenta is not drawn on the VD (FCOM), and the VD weather
  is removed while TERR is unavailable (FCOM: "the VD does not display the weather when the TERR function is not available").
- **Weather picture (both aircraft, from the manuals pass):** the radar scans on the ground too (A320 FCOM DSC-34-SURV-30-30), MAP mode is a ground map
  from the terrain view, the picture fills over 30 s after the radar starts transmitting (A380 FCOM operational recommendations), the ARC picture keeps
  the ND's bottom corners free as on the real display, water on the terrain display is the real display's teal, and the TERR peaks box figures come from
  SimBridge over SimConnect (PR 4 draft). The A380's AUTO mode off-path display is NOT modelled: it was built from a third MapView in the engine's
  top-view radar mode and removed again, because the engine runs one radar per aircraft and that view changed what the beam views delivered (rain at
  the aircraft's level over the whole range instead of the cells; the A32NX next to it was clean). Both aircraft show the same picture.

## Cockpit API Changes

New LVars, documented in `fbw-a380x/docs/a380-simvars.md`: `L:A380X_VD_CUT_MODE` (0 track / 1 plan), `L:A380X_VD_CUT_COUNT`, `L:A380X_VD_CUT_{i}_LAT` /
`_LON` (i < 32, degrees), `L:A380X_VD_CUT_TRACK_CHANGE_NM`. Reads the IR true track words.

## Screenshots (if necessary)

**TO ADD**: the VD through a turn in NAV (profile follows the route, grey area at the turn), the same in HDG (along the track), cruise at 160 NM (ground
visible, aircraft in the upper quarter), an approach with terrain (gap under the mock-up with QNH vs STD).

## References

- A380 FCOM DSC-31-20-40-10 (VD): vertical cut along the active flight plan / current track, cut width 2 x RNP, vertical scale origin, terrain by true
  height, water blue, magenta not displayed, weather needs TERR (PDF pages 2365-2394 of the KAL FCOM).
- A380 FCTM SI-70 Safety altitude and terrain / Vertical trajectory / Terrain (VD height geometrically correct; MORA/MSA along the F-PLN in NAV, along the
  track in HDG/TRACK; grey area = next turning point).
- Real A380 photo at FL400 (ground on the VD, aircraft at ~75 % of the height).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. NAV mode with a turn ahead, VD on: the terrain profile follows the route through the turn (compare with the ND terrain along the green line); a grey area
   starts at the turn. Switch to HDG: the profile is along the track; back to NAV: along the plan.
2. Cruise at 160 NM: the ground and the terrain profile are visible, the aircraft symbol in the upper quarter of the VD.
3. Approach with terrain nearby, QNH then STD: the gap under the aircraft symbol does not change.
4. Water on the cut: blue from sea level down. TERR SYS OFF: the VD weather goes with the terrain.

<!-- DO NOT DELETE THIS -->
## How to download the PR for QA

Every new commit to this PR will cause new A32NX and A380X artifacts to be created, built, and uploaded.

1. Make sure you are signed in to GitHub
1. Click on the **Checks** tab on the PR
1. On the left side, find and click on the **PR Build** tab
1. Click on either **flybywire-aircraft-a320-neo** or **flybywire-aircraft-a380-842** download link at the bottom of the page
