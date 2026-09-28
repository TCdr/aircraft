# PR 23 - flyPad landing calculator (A380 new, A320 reworked)

- **Title:** `feat(efb): A380 landing calculator and reworked A320 landing calculator`
- **Base:** `master` - **Branch:** `pr/23-efb-landing-calculator` (stacked on `pr/12-a320-takeoff-calculator`, PR 12: the shared
  performance module and the FMS links of the takeoff calculators; PRs 10 and 11 below it)
- **Tip:** `0adf3f890` - own commits: `fc850a71e` (feature; original `c4e4f0a38` on `feature/efb/landing-calculator`, merged into
  `develop` 224cf6741), `e7e27cf62` (strict null checks)
- **Also in `pr/23` (2026-09-28):** the last distance label of the landing roll scale ends at the chart edge instead of being cut.
- **Labels to request:** `A32NX`, `A380X`, `EFB`, `Extensive Testing Needed`
- **Issue to open first:** *"flyPad landing calculator: no A380 calculator, and the A320 one has no dispatch data, no FMS import and
  no approach / go-around parameters"*
- **CHANGELOG line (in the branch):** `1. [EFB] Add the A380 landing calculator and rework the A320 one: dispatch and in-flight landing distances from the FCOM, FMS data import, BTV exit advice on the A380 - @TCdr`
- **Before opening - TO DO:** the in-sim test (built, deployed and checked in the local flyPad harness only; the BTV exits were seen in
  the sim once). Screenshots.

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

One landing screen for both aircraft, laid out after the A380 OIS LDG PERF application (A380 FCOM PER-LND): a DISPATCH / IN-FLIGHT
computation type, Runway / Conditions / Aircraft / Landing sections, a RESULTS panel and a runway picture.

- **Inputs:** airport and runway (LDA, heading, elevation, slope), runway condition (dry, wet and the RWYCC contaminants), wind,
  temperature and QNH, anti-ice and air conditioning (A380), landing weight in tonnes (or klb) with an MLW button, CONF (AUTO on the
  A380), go-around CONF and gradient, approach type and VLS+ increment, autoland and glide slope, braking mode (manual, autobrake modes,
  BTV on the A380), reverse thrust (greyed out when the condition gives no reverser credit), overweight procedure (A320).
- **RESULTS:** landing weight, MLW(PERF) and its limitation code (weight, landing distance, go-around gradient), flaps, landing
  distance (factored for dispatch), stop margin, go-around speed and gradient, VAPP = VLS + VLS+; estimated values in amber.
- **Runway picture:** touchdown, the stop point of each braking mode, the required distance bar, and on the A380 the BTV DRY / WET
  lines with the runway exits.
- **A380 data:** the landing field length chart of the Airbus A380 AC document (dry, manual braking, CONF FULL, VLS) and a model
  fitted on it (0.8 % RMS) for the other conditions. FCOM rules: dispatch RLD = ALD / 0.6, wet x 1.15, contaminated = max(wet RLD,
  ALD x 1.15); 50 % of the headwind, 150 % of the tailwind; temperature only for water-contaminated runways or autoland, slope only
  for autoland; autobrake decelerations LO / 2 / 3 / HI (DSC-32-10-30-20); go-around gradient calibrated on the FCOM in-flight example.
- **BTV exit advice (A380, information only):** DRY / WET lines = 400 m + 5 s roll + the braking distance at the BTV decelerations;
  the runway exits of the Navigraph airport map (the OANS exit rules) rated as recommended (first exit beyond the WET line), beyond
  WET, dry runway only, or not achievable. Not shown on contaminated runways (BTV prohibited, LIM-32-30).
- **A320 data:** the QRH in-flight landing distances are kept; the FCOM dispatch required landing distance tables (PER-LDG-DIS-RLD),
  the autoland correction and the wet minimum are added; the crosswind limits of PER-LDG-DIS-MAT.
- **FMS import:** the A380 FMC-A and the A320 MCDU answer the flyPad (shared `fmsLandingData` events) with the destination, runway,
  predicted landing weight and the PERF APPR QNH, temperature, wind and landing configuration.
- The old `RunwayVisualizationWidget` is removed.
- 16 unit tests (A380 calculator 8, A320 calculator 6, BTV exits 2).

## Cockpit API Changes

None (the FMS data travels on two new event bus topics, `fms_landing_data_request` and `fms_landing_data`).

## Screenshots (if necessary)

**TO ADD**: the A380 IN-FLIGHT and DISPATCH screens with results, the A320 screen, the BTV lines with the exits of an airport.

## References

- A380 FCOM PER-LND (landing performance, OIS LDG PERF), DSC-32-10-30-20 (autobrake and BTV), LIM-32-30; Airbus A380 Aircraft
  Characteristics (landing field length chart).
- A320 FCOM PER-LDG-DIS (dispatch RLD tables, autoland, crosswind), QRH in-flight landing distances.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. A380 flyPad > Performance > Landing: IN-FLIGHT, fill from the FMS (destination and runway in the F-PLN, PERF APPR filled):
   runway, weight and conditions are imported. CALCULATE: RESULTS and the runway picture.
2. Change the runway condition, braking mode, CONF AUTO, reverse thrust: the distances and the MLW(PERF) change; reverse thrust is
   greyed out when it gives no credit.
3. With a Navigraph airport map: the BTV lines and the exits, with their rating; a contaminated runway hides them.
4. DISPATCH: the factored required landing distance.
5. A320 flyPad: the same screen with the A320 data; DISPATCH uses the FCOM tables.
6. `npx vitest run` on `a380x_landing.spec.ts`, `a32nx_landing.spec.ts`, `btvExits.spec.ts` (16 tests).

<!-- DO NOT DELETE THIS -->
