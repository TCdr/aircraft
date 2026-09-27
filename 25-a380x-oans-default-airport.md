# PR 25 - A380X OANS default airport

- **Title:** `feat(a380x/oans): display the FCOM default airport automatically`
- **Base:** `master` - **Branch:** `pr/25-a380x-oans-default-airport` (independent, on the upstream `master` 2baa2b35e)
- **Tip:** `3a5afec9f` - own commit: `3a5afec9f` (original `c0948ecb5` on `feature/a380x/oans-default-airport`, merged into `develop`
  a4e693727)
- **Labels to request:** `A380X`, `ND`, `QA A380 Only`
- **Issue to open first:** *"A380X OANS: in flight only the destination is loaded (within 50 NM at any height), never the origin or the
  alternate, and a manual airport selection blocks the automatic one for 10 minutes"*
- **CHANGELOG line (in the branch):** `1. [A380X/OANS] Display the default airport of the FCOM automatically: the current airport on ground, the origin, destination or alternate airport in flight within 20 NM and 5000 ft of it - @TCdr`
- **Before opening - TO DO:** screenshots. Tested in the sim on 2026-09-27 (user-confirmed).

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The OANS moving airport map displays the default airport of the A380 FCOM (DSC-34-10-70-20, MOVING AIRPORT MAP) without a manual
selection. Before, the automatic load took the nearest airport on ground (kept), but in flight only the destination, within 50 NM at
any height, and a manual selection stopped it for 10 minutes in every mode (the FIXME in `autoLoadAirport`).

- **ARC and ROSE-NAV:** the current airport on ground; in flight the origin, destination or alternate airport while the aircraft is
  within its virtual cylinder of 20 NM radius and 5000 ft height; the displayed one is kept while the aircraft stays in its cylinder.
- **PLAN:** in flight the origin airport if it is closer than 50 NM to the aircraft, else the destination airport; the destination
  when the origin to destination distance is shorter than 300 NM. One airport is displayed on both NDs (synced
  `oans_display_airport`), so this rule applies when the other ND does not show ARC or ROSE-NAV.
- **Manual selection (ARPT SEL):** only the PLAN mode displays another airport (FCOM: SET PLAN MODE in ARC / ROSE-NAV); a displayed
  airport is kept until the ND leaves the PLAN mode, or the aircraft lands or takes off.
- The rules are a pure function `oansDefaultAirport()` (`ND/OansDefaultAirport.ts`), used by `OansControlPanel.autoLoadAirport()`
  every 2 s with the ADIRS position and baro corrected altitude and the FMS origin, destination and alternate.
- 4 unit tests (on ground, the in-flight cylinder with a diversion to the alternate, keeping the displayed airport, PLAN).

## Cockpit API Changes

None.

## Screenshots (if necessary)

**TO ADD**: the OANS in ARC mode on approach to the destination, and after a diversion to the alternate.

## References

- A380 FCOM DSC-34-10-70-20 (Airport navigation, controls and indicators): MOVING AIRPORT MAP (default airport in ARC / ROSE-NAV
  and PLAN mode), ARPT SEL panel (SET PLAN MODE).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. On ground: the OANS displays the airport of the aircraft.
2. In flight with origin, destination and alternate in the F-PLN: the destination appears within 20 NM and 5000 ft of it; divert to
   the alternate: its map loads within 20 NM and 5000 ft.
3. ARPT SEL: display another airport in PLAN; back to ARC: the default airport returns.
4. PLAN in flight (other ND in PLAN too): the origin within 50 NM, then the destination.
5. `npx vitest run fbw-a380x/src/systems/instruments/src/ND/OansDefaultAirport.spec.ts` (4 tests).

<!-- DO NOT DELETE THIS -->
