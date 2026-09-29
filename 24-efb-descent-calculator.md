# PR 24 - flyPad descent calculator (replaces the top of descent calculator)

- **Title:** `feat(efb): descent calculator in place of the top of descent calculator`
- **Base:** `master` - **Branch:** `pr/24-efb-descent-calculator` (stacked on `pr/23-efb-landing-calculator`, PR 23: the FMS data
  answers of the FMC and the MCDU, the performance store and texts it extends)
- **Tip:** `d39193281` - own commit: `469b9a0c8` (feature; original `915586cb7` on `feature/efb/descent-calculator`, merged into
  `develop` 99f00b531)
- **Also in `pr/24` (2026-09-28):** the table columns are RATE and GRDT, positive in descent, as in the A380 FCOM table results (PER-IFT-DES-DSR); the RESULTS line and the late message give V/S and FPA negative, as set on the FCU.
- **Also in `pr/24` (2026-09-29):** `d39193281` the Calculate and Clear buttons at the bottom as on the takeoff and landing pages, and
  a T/D distance slider (original `161100772`, develop 75534d098).
- **Labels to request:** `A32NX`, `A380X`, `EFB`, `Extensive Testing Needed`
- **Issue to open first:** *"flyPad top of descent calculator: only a 3-degree rule, no aircraft performance, speeds or FMS data"*
- **CHANGELOG line (in the branch):** `1. [EFB] Replace the top of descent calculator with a descent calculator: ECON, standard, given V/S and emergency descents from the FMS performance model, descent profile and descent check - @TCdr`
- **Before opening - TO DO:** the in-sim test (built, deployed and checked in the local flyPad harness only). Screenshots.

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The Top of Descent tab of the flyPad performance page becomes a descent calculator, after the A380 OIS IN-FLT PERF DES module
(A380 FCOM PER-IFT-DES), on both aircraft.

- **Descent types:** ECON (the managed descent Mach and CAS of the FMS), STANDARD (the FCOM speed schedule: A380 M.85 / 300 kt /
  250 kt below FL100, PER-IFT-DES-STD; A320 M.78 / 300 kt / 250 kt, PER-DES-STD), GIVEN V/S, EMERGENCY (MMO / VMO with the speed
  brakes).
- **Inputs:** initial altitude (A/C: the current one) and target altitude; the speed schedule (MACH, SPD, SPD LIM, LIM ALT; empty =
  the standard one); gross weight, ISA deviation (A/C: from the current SAT), wind component, anti-ice (off / engine / total), fuel
  factor, speed brakes. **Fill data from FMS:** cruise level (or the current altitude when below), destination elevation + 1500 ft,
  gross weight, the FMS speed limit, the ECON speeds and the distance to the destination.
- **RESULTS:** time, distance, fuel, mean V/S and flight path angle, and the 3 x altitude rule for comparison; the crossover altitude
  and the deceleration to the speed limit.
- **Profile:** a chart of altitude against the distance to the target (T/D, crossover, DECEL, SPD LIM) or a table every 5000 ft
  (time, distance, fuel, CAS, Mach, TAS, V/S, FPA), like the FCOM results table.
- **DESCENT CHECK:** with the distance to the target, the aircraft altitude and ground speed: start the descent in X NM (Y min), on
  profile, or N NM late with the V/S and FPA needed; the aircraft is drawn on the profile.
- **Model:** the FBW VNAV prediction steps (`Predictions.altitudeStep`, `verticalSpeedStep`, `speedChangeStep`, with the idle N1 of
  the engine model) and the aircraft config of each aircraft, integrated in 1000 ft steps; the deceleration to the speed limit on the
  -1 degree idle path of the FMS descent strategy, so the flyPad agrees with the FMS predictions. GIVEN V/S steeper than idle: idle
  there, with a warning. Anti-ice: the corrections of the A320 FCOM descent table, shown as estimates (amber).
- **FMS import:** the A380 FMC-A and the A320 MCDU answer the flyPad (shared `fmsDescentData` events).
- The old `TODCalculator` components are removed (its `todCalculator` store slice is left in place; nothing reads it any more).
- 3 unit tests (close to the A320 FCOM descent table; wind, temperature and anti-ice; EMERGENCY and the given V/S check).

Check against the A320 FCOM descent table (M.78 / 300 / 250, 65 t, FL390 to 1500 ft): FCOM 106 NM / 17.4 min / 165 kg, calculator
114 NM / 18.8 min / 146 kg. The FCOM table is for the CFM56 A320; the FBW A320neo model descends about 8 % longer.

- **T/D distance slider** under the profile: moves the start of the descent up to 60 NM earlier or later than the calculated T/D
  (reversed like the chart: farther on the left), with the V/S and FPA it needs at the mean ground speed of the calculated descent,
  against the calculated ones; later = steeper than the idle descent (speed brakes or a higher speed, red when the calculation
  already has the speed brakes), earlier = shallower (thrust, more fuel); the moved T/D is drawn dashed to the target. The
  Calculate and Clear buttons are at the bottom of the column, as on the takeoff and landing pages.

## Cockpit API Changes

None (two new event bus topics, `fms_descent_data_request` and `fms_descent_data`).

## Screenshots (if necessary)

**TO ADD**: the A380 screen with the profile chart and the table, the A320 screen, the DESCENT CHECK late and early.

## References

- A380 FCOM PER-IFT-DES (IN-FLT PERF DES module, descent types, speed profile, conditions), PER-IFT-DES-STD.
- A320 FCOM PER-DES-STD (standard descent table and its anti-ice corrections).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. flyPad > Performance > Top of Descent, in cruise with a flight plan: Fill data from FMS: the cruise level, target, weight,
   speed limit and distance are filled. CALCULATE: RESULTS and the profile.
2. ECON: the speeds of the FMS; compare the T/D with the one of the ND.
3. GIVEN V/S 3000 ft/min, EMERGENCY: shorter descents; a V/S steeper than idle gives the warning.
4. DESCENT CHECK: start in X NM before the T/D; late after it, with the V/S and FPA needed.
5. `npx vitest run fbw-a32nx/src/systems/fmgc/src/performance/FmsDescentPerformanceCalculator.spec.ts` (3 tests).

<!-- DO NOT DELETE THIS -->
