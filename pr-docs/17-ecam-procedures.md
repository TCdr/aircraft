# PR 17 - A380X ECAM procedures from the FCOM

- **Title:** `feat(a380x/fws): ECAM procedures from the A380 FCOM for the ABN PROC and the sensed alerts`
- **Base:** `master` - **Branch:** `feature/a380/fws/abn-proc-procedures`
- **Commit:** `00b3a980d`
- **Labels to request:** `A380X`, `ECAM`, `FWS`, `QA A380 Only`
- **Issue to open first:** *"A380X ABN PROC procedures marked WIP show nothing when activated"*
- **CHANGELOG line:** `1. [A380X/ECAM] Add the ABN PROC procedures and the ENG FAIL / ALL ENGINES FAILURE procedure lines from the FCOM - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

A not-sensed procedure is only displayed with its entry in `FwsAbnormalNonSensed`: the ABN PROC procedures marked WIP had neither
lines nor entry and showed nothing when activated. The procedures now carry the A380 FCOM text and their FWS entries (sensed lines where the
FWS has the signal).

**ABN PROC (FCOM PRO-ABN-ECAM-20; texts PRO-ABN-ECAM-10):** MISC DITCHING, FORCED LANDING, CKPT WINDOW CRACKED, CKPT WINDOW ELEC
ARCING, OIS FAULT; FUEL LEAK (the FUEL LEAK DETECTED procedure, LAND ANSA), MAN BALANCING PROCEDURE; L/G LDG WITH ABNORM NOSE L/G, WITH 2
ABNORM L/Gs ON SAME SIDE, WITH 1 ABNORM WING OR BODY L/G, WITH 2 ABNORM BODY L/Gs, WITH 2 ABNORM WING L/Gs (WHEEL page); NAV IR ALIGNMENT IN
ATT MODE; new ENG HI VIBRATIONS (in the FCOM ENG list, was missing).

**Sensed alerts (FCOM PRO-ABN-ECAM-10):** of the 102 wired alerts without lines, about 85 are "Crew awareness" in the FCOM (title only):
left empty. Filled: COND HOT AIR 1(2) FAULT, COND TEMP CTL FAULT, ENG 1(2)(3)(4) FAIL (in flight / on ground, the engine number in the
lines, thrust lever / master / fire pb / agent sensed, L/G UP after lift-off), ENG ALL ENGINES FAILURE (the FCOM ALL ENG FLAME OUT: fuel
remaining / no fuel, relight, forced landing and ditching).

**FCOM conventions:** upper case "IF ...:" lines are ECAM condition lines; lower case "If ...:" only select the lines shown. Headers
("AT 2000 FT AGL :") are centred sub-headlines; lines fit the 41-character EWD width (nesting capped at three levels).

## Cockpit API Changes

None.

## Screenshots (if necessary)

**TO ADD**: each ABN PROC procedure on the EWD, ENG 1 FAIL in flight and on ground, ALL ENGINES FAILURE.

## References

- A380 FCOM PRO-ABN-ECAM-10 (procedures), PRO-ABN-ECAM-20 (not-sensed ABN PROC list).

## Additional context

Not done: the deferred procedures, limitations and STATUS of the new procedures; FLUCTUATING VERTICAL SPEED stays WIP (not in the 2011
FCOM). HOT AIR 1(2) OFF / VLV OPEN, T.O V1/VR/V2 DISAGREE and OVERSPEED LOAD ANALYSIS REQUIRED are not in this FCOM and stay without lines.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. ECP ABN PROC: open each procedure of the list, activate it: the lines show; sensed lines tick (e.g. SIGNS, ALL ENG MASTERS, PARK BRK).
2. Fail an engine in flight: ENG x FAIL with AUTO RELIGHT IN PROGRESS, THR LEVER x / ENG x MASTER; on ground: the ground lines.
3. Fail all engines in flight: ALL ENGINES FAILURE, LAND ASAP, the full procedure scrolls.
4. HOT AIR 1 pb OFF: COND HOT AIR 1 FAULT with HOT AIR 1 ON.

<!-- DO NOT DELETE THIS -->
