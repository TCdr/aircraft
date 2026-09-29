# PR 31 - A380X second ISIS as Standby Navigation Display (SND)

- **Title:** `feat(a380x/isis): second ISIS as Standby Navigation Display (SND)`
- **Base:** `master` - **Branch:** `pr/31-a380x-isis-snd` (from the upstream master, independent)
- **Tip:** `9dff226cb` - own commit: `9dff226cb` (original `003cd304e` on `feature/a380x/isis-snd`, merged into `develop` 7b67b1c02)
- **Labels to request:** `A380X`, `Extensive Testing Needed`
- **Issue to open first:** *"A380X: the lower ISIS screen is black (its gauge is commented out in panel.cfg: FIXME re-enable second
  ISIS when A380X ISIS implementation is in place)"*
- **CHANGELOG line (in the branch):** `1. [A380X/ISIS] Second ISIS as Standby Navigation Display (SND): heading rose, track, ground speed and position - @TCdr`
- **Status (2026-09-29):** tested in the sim by the user: OK.
- **Before opening - TO DO:** screenshots from the sim.

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The A380 has two ISIS, one Standby Flight Display (SFD) and one Standby Navigation Display (SND) (FCOM DSC-34-10-20). FBW had the
second one switched off. It is now a new FSComponent instrument, `A380X/SND`, on the lower ISIS screen, laid out on the FCOM
figures (DSC-34-10-20-30):

- **Navigation:** heading rose (240°, graduated every 5°, numbers every 30°, fixed markers at 45° and 90°), yellow heading index,
  heading source IR3 (IR1 when ADIRU 3 has none), TRU in true reference (MAG/TRUE pb or extreme latitude, as the DMC), green track
  diamond, ground speed, aircraft position with its source; amber HDG (replaces the rose) and PPOS flags.
- **Waypoint list** (MENU pb, SET/SEL knob, FCOM DSC-34-10-20-50): INSERT WPT, INSERT FIX, EDIT WPT / FIX, CLEAR WPT / FIX in cyan;
  coordinates entered field by field with the knob; the list FROM / TO / NEXT (coordinates truncated to the minutes), the TO -> NEXT
  true bearing and distance, TO WPT bearing and distance, the desired track with the deviation bar and scale (large lines 5 NM,
  small 2.5 NM).
- **DIR TO** (LS/DIR TO pb): to a waypoint of the list (which activates the navigation) or to new coordinates; the TO waypoint is
  sequenced abeam.
- **FIX:** distance to go, magenta bearing pointer, coordinates at the bottom of the list.
- MODE pb: SND off / on; + and - pb: brightness. Power: DC ESS, or DC HOT 1 above 50 kt (as the SFD).
- Cockpit behaviour for the second ISIS (PUSH_ISIS_2_MODE / PLUS / MINUS / MENU / LS_DIR, KNOB_ISIS_2_SET_SEL: new template
  `FBW_ISIS_SND_Knob_Template`); `panel.cfg` VCockpit11 gauge; `mach.config.js`.
- Simplifications listed in the aircraft README (ATA 34): no SFD/SND reconfiguration (MODE only switches the SND off and on), no
  power-up self-test, no FIX on the SFD, position source always GPIR (no MMR / GPIRS model), and the coordinate entry, the list
  size (10) and the sequencing are not described in the FCOM (its procedure figures stop at the first frame).
- 10 unit tests (`SndNavigation.spec.ts`: geodesy, list and sequencing, menu flows, FIX).

## Cockpit API Changes

New H events: `A32NX_ISIS_2_{MODE|PLUS|MINUS|MENU|LS_DIR}_PRESSED`, `A32NX_ISIS_2_KNOB_{CLOCKWISE|ANTI_CLOCKWISE|PRESSED}`.

## Screenshots (if necessary)

**TO ADD** (from the sim): the SND in flight; the menu; the list with DIR TO active; the FIX.

## References

- A380 FCOM DSC-34-10-20-10 (standby instruments), -30 (ISIS/SND: overview, indications, waypoints, FIX, position), -50 (how to use
  the MENU and SET/SEL in SND mode, insert a waypoint, DIR TO).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Power the aircraft: the lower ISIS shows the SND (heading rose, GS, IR3, GPIR3 position).
2. MODE: off, again: on; + / -: brightness.
3. MENU > INSERT WPT > push; set the coordinates with SET/SEL (turn = value, push = next field), push to the end. Insert a second
   one.
4. LS/DIR TO > push: FROM / TO / NEXT, TO WPT bearing and distance, the course arrow and the deviation bar.
5. MENU > INSERT FIX: FIX distance, magenta pointer, FIX line at the bottom of the list. EDIT / CLEAR WPT / FIX.
6. `npx vitest run fbw-a380x/src/systems/instruments/src/SND` (10 tests).

<!-- DO NOT DELETE THIS -->
