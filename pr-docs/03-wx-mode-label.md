# PR 3 - weather radar mode shown on the ND

- **Title:** `feat(nd): show the weather radar mode on the ND`
- **Base:** `master` - **Branch:** `feature/nd-wxr-mode-label` (built on `feature/nd-terrain`, which is built on the A380X radar branch: the label code sits
  next to the terrain code in `ndwxr/src/main.cpp` and could not be applied without it, so PR 1, 2 and 4 come first)
- **Commit:** `a5ecd08cf`
- **Labels to request:** `A32NX`, `A380X`, `ND`
- **Issue to open first:** *"ND does not show the selected weather radar mode"* - "With the weather radar on, nothing on the ND says which mode
  (WX, WX+T, TURB, MAP) is selected."
- **CHANGELOG line:** `1. [ND] Show the selected weather radar mode (WX, WX+T, TURB, MAP) on the ROSE and ARC pages - @TCdr` - already added to `.github/CHANGELOG.md` in the commit of this PR

---- paste from here ----

Fixes #[issue_no]

## Update 2026-09-22 (uncommitted): "WXR OFF"

On the A32NX the label reads `WXR OFF` in white while the radar's SYS switch is OFF, on the map pages (A320 FCOM DSC-34-SURV-30-30, weather radar indication
on ND: "WXR OFF (only in white)"; the modes stay green, the colour of the automatic mode). The gauge publishes it as mode 5 of `A32NX_WXR_ND_{side}_MODE`
(docs updated); the A380X never publishes it.

## Summary of Changes

Nothing on the ND told the crew which radar mode was selected. The mode (WX, WX+T, TURB or MAP) is now shown in green on the right of the ARC and
ROSE NAV pages while the radar is on, on both aircraft.

- The native radar gauge already knows whether the radar is selected and shown (the WX SYS knob on the A32NX; the WX overlay, the WXR & TAWS
  system and the SURV CONTROLS buttons on the A380X), so it publishes the text as a number in `A32NX_WXR_ND_{L,R}_MODE` (0 none, 1 WX, 2 WX+T,
  3 TURB, 4 MAP), only while the radar is selected on an ARC or ROSE NAV page and not while the terrain takes its place.
- The ND reads it through its simvar publisher and the new `WxrModeLabel` component draws the text, so the gating rules are not duplicated
  in the ND code.
- The A380X has no TURB-only mode: its SURV CONTROLS page gives WX, WX+T and MAP.
- The text is also shown on the ground, where the radar itself does not draw.

## Cockpit API Changes

New LVars, written by the `ndwxr` gauge and read by the ND. Already documented in `fbw-a32nx/docs/a320-simvars.md` (new "Weather Radar (ATA 34)" section) and `fbw-a380x/docs/a380-simvars.md` (new "Surveillance ATA 34" section), in the commit of this PR:

| Var | Type | Description |
|-----|------|-------------|
| `L:A32NX_WXR_ND_L_MODE` | Enum | Weather radar mode text of the left (CPT) ND: 0 none, 1 WX, 2 WX+T, 3 TURB, 4 MAP |
| `L:A32NX_WXR_ND_R_MODE` | Enum | Same for the right (F/O) ND |

## Screenshots (if necessary)

**TO ADD**: ARC and ROSE NAV with the label in each mode (WX, WX+T, TURB, MAP), and without the radar (no label). Before: same page, no label.

## References

**TO ADD**: real ND photo/FCOM screenshot showing the weather radar mode text (position and colour) on the A320 and the A380 ND.

## Additional context

Position: x 744, y 590 of the ND svg, `Green FontSmall`, right-aligned, after `TerrainMapThresholds`. The labels are not localised (like the
other ND texts).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. A32NX: WX SYS on SYS 1, ND in ARC then ROSE NAV: the mode text follows the MODE knob (WX, WX+T, TURB, MAP). WX SYS OFF: no text.
2. Other ND modes (PLAN, ROSE ILS, ROSE VOR): no text.
3. Turn TERR ON ND on (with the terrain PR): the text goes while the terrain is drawn.
4. A380X: WX overlay + WXR & TAWS system selected: text follows the SURV CONTROLS TURB / MODE buttons (WX, WX+T, MAP). Range index 0 (OANS): none.
5. On the ground the text is shown although the radar does not draw.

<!-- DO NOT DELETE THIS -->
## How to download the PR for QA

Every new commit to this PR will cause new A32NX and A380X artifacts to be created, built, and uploaded.

1. Make sure you are signed in to GitHub
1. Click on the **Checks** tab on the PR
1. On the left side, find and click on the **PR Build** tab
1. Click on either **flybywire-aircraft-a320-neo** or **flybywire-aircraft-a380-842** download link at the bottom of the page
