# PR 20 - A380X computed ALTN fuel and time

- **Title:** `feat(a380x/mfd): computed ALTN fuel and time (FCOM default computation)`
- **Base:** `master` - **Branch:** `pr/20-a380x-altn-fuel-computation` (stacked on `pr/10-a380x-mfd-fcom-pages`, PR 10: FUEL&LOAD page)
- **Tip:** `e18e12a72` (one commit)
- **Labels to request:** `A380X`, `MFD`, `FMS`, `QA A380 Only`
- **Issue to open first:** *"A380X FUEL&LOAD: the ALTN fuel is a fixed 6.5 t"*
- **CHANGELOG line (to add in the PR):** `1. [A380X/MFD] Compute the ALTN fuel and time for the trip to the alternate instead of a fixed 6.5 t - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The ALTN fuel of the FUEL&LOAD page was a fixed 6.5 t. The A380 FCOM (DSC-22-FMS-20-30, FUEL&LOAD page) defines it: the fuel (time)
for the trip between the primary destination and the landing at the alternate, computed with CI 0, at FL220 when the alternate flight
plan distance is less than 200 NM, FL310 otherwise.

- **AlternateFuelPredictor:** climb at climb thrust, cruise and idle descent with the aircraft's VNAV prediction models, at the FMS CI 0
  speeds (290 kt, 288 kt in descent, M0.84, 250 kt below FL100). The cruise level is lowered when the distance is too short for the
  climb and the descent.
- **FMS:** over the alternate flight plan distance (without its missed approach; the direct distance when there is no alternate route),
  with the ALTN wind and the weight at destination (ZFW + MIN FUEL AT DEST). No default ALTN without a ZFW; recomputed only when its
  inputs change.
- **FUEL&LOAD:** the ALTN time next to the ALTN fuel, and the arrival at the alternate (destination + ALTN time).
- **ALTERNATE page:** the fuel to each alternate, with the same computation.
- 5 unit tests (`AlternateFuelPredictor.spec.ts`).

## Cockpit API Changes

None.

## Screenshots (if necessary)

**TO ADD**: FUEL&LOAD with the computed ALTN fuel and time and the alternate ETA; the ALTERNATE page with the fuel of each alternate.

## References

- A380 FCOM DSC-22-FMS-20-30 (FUEL&LOAD page: ALTN fuel and time, default computation at CI 0, FL220 below 200 NM, FL310 above).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Flight plan with an alternate, ZFW entered: FUEL&LOAD shows a computed ALTN fuel and time (no longer 6.5 t) and the ALTN ETA.
2. An alternate closer than 200 NM against one further away: the lower fuel; the ALTERNATE page lists the fuel of each alternate.
3. No ZFW: no ALTN fuel.
4. `npx vitest run fbw-a380x/src/systems/instruments/src/MFD/FMC/AlternateFuelPredictor.spec.ts` (5 tests).

<!-- DO NOT DELETE THIS -->
