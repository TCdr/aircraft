# PR 26 - flyPad taxi route page

- **Title:** `feat(efb): taxi route page on the Navigraph airport map`
- **Base:** `master` - **Branch:** `pr/26-efb-taxi-route` (stacked on `pr/23-efb-landing-calculator`, PR 23: the shared runway exit
  module `btvExits.ts` the arrival start uses; PRs 12, 11 and 10 below it)
- **Tip:** `9a061e1f5` - own commit: `b97742c40` (original `0b21c7f17` on `feature/efb/taxi-route`, merged into `develop` 9cd78dd05)
- **Labels to request:** `A32NX`, `A380X`, `EFB`, `Extensive Testing Needed`
- **Issue to open first:** *"flyPad: no taxi route; the OANS shows the airport map but the crew has no way to see the route of the
  ATC taxi clearance and its runway crossings"*
- **CHANGELOG line (in the branch):** `1. [EFB] Add a taxi route page (Ground > Taxi) on the Navigraph airport map: after landing from a runway exit to a stand, for departure from a stand to the holding point of a runway entry, suggested along named taxiways and edited to match the ATC clearance, with the runway crossings - @TCdr`
- **Before opening - TO DO:** screenshots. Tested in the sim on 2026-09-28 at RJTT (user-confirmed); checked on a synthetic airport in
  the local flyPad harness.

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

A new flyPad page, Ground > Taxi (both aircraft), shows the taxi route on the Navigraph airport map (AMDB, the data of the A380
OANS). The A380 FCOM has no taxi routing (the crew marks the OANS with flags and crosses, DSC-34-10-70-20) and MSFS has no D-TAXI,
so the route lives on the flyPad and the cockpit displays stay as the FCOM describes them.

- **Departure** (default): from a gate / ramp / cargo stand, or the aircraft position, to a runway entry. The entries of the
  selected runway are listed in order (the first one = full length, the others with the runway length remaining) and drawn on the
  map; the route stops at the runway holding position line (HOLD RWY stop bar).
- **Arrival:** from a runway exit (the exits of the landing calculator) or the aircraft position to a stand.
- **Suggestion and clearance:** the shortest route along the taxi lines is suggested (SUGGEST copies its taxiways into the
  clearance field); the crew types the taxiways of the ATC clearance in order, the route follows them strictly, ACCEPT draws it
  solid. Runway crossings are listed and circled in red; an impossible clearance or a start not connected to the end is explained.
- **Map:** aprons, taxiways, runways, guidance lines, taxiway names (spaced out, not overlapping), stands (tap one to choose it),
  runway entries, the route with its taxiway names, the aircraft; drag, zoom, fit. The canvas is drawn larger than the view, so a
  drag only moves it and the map is drawn again when the drag ends.
- **Stand names** are found with or without leading zeros and separators ("16" finds "016"); the suggestions list the names that
  start with, then contain, the typed text.
- Shared module `fbw-common/src/systems/shared/src/taxi/`: `taxiNetwork.ts` (graph from the guidance lines: split at crossings,
  T junctions within 3 m, dead ends of disconnected parts joined within 15 m; runway centrelines only split crossing lines and are
  never followed), `taxiRoute.ts` (Dijkstra over node x cleared-taxiway states; runway crossings), `taxiDeparture.ts` (runway
  entries, holding point cut), `taxiAmdb.ts` (AMDB features, stand name matching). `btvExits.ts` gives each exit its start point on
  the runway.
- flyPad: `Ground/Pages/Taxi` (TaxiAirport, TaxiMap, TaxiPage), store slice `taxiRoute` (kept across the flyPad pages), Taxi tab.
- 9 unit tests (`taxi/taxiRoute.spec.ts`) + the exit start points in `btvExits.spec.ts`.

## Cockpit API Changes

None.

## Screenshots (if necessary)

**TO ADD**: a departure route from a gate to a runway holding point with a runway crossing; an arrival from an exit to a gate.

## References

- A380 FCOM DSC-34-10-70-20 (Airport navigation): the OANS has no taxi routing (flags and crosses only), hence the flyPad page.
- EUROCAE ED-99 airport mapping database features used by the Navigraph AMDB (taxiway guidance lines, runway exit lines, stand
  guidance lines, parking stand locations, runway holding positions, painted centrelines).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Navigraph account linked in the flyPad settings. Ground > Taxi, ORIG: the airport map loads.
2. Departure: choose a gate (type it or tap it on the map), a runway and an entry: a dashed route to the HOLD RWY bar appears;
   SUGGEST, then ACCEPT: the route turns solid.
3. Type another clearance (e.g. a longer taxiway sequence): the route follows it in order; an impossible one is shown in red.
4. From the aircraft: at the gate, Aircraft: the route starts at the aircraft.
5. Arrival after landing: runway, exit and gate: the route from the exit to the gate, with the runway crossings in red.
6. Drag and zoom the map: smooth; the taxiway names are shown.
7. `npx vitest run fbw-common/src/systems/shared/src/taxi` (9 tests).

<!-- DO NOT DELETE THIS -->
