# PR 19 - A380X OANS RWY AHEAD without an airport map

- **Title:** `feat(a380x/oans): show RWY AHEAD without an airport map`
- **Base:** `master` - **Branch:** `pr/19-a380x-oans-rwy-ahead-without-map` (on upstream `master`, independent)
- **Tip:** `28f04ab4b` (one commit)
- **Labels to request:** `A380X`, `ND`, `QA A380 Only`
- **Issue to open first:** *"A380X: OANS RWY AHEAD stays silent without a Navigraph airport map"*
- **CHANGELOG line (in the branch):** `1. [A380X/OANS] Show the RWY AHEAD advisory without a Navigraph airport map, from the sim's own runways - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The OANS RWY AHEAD advisory needs the Navigraph airport map (AMDB) and stays silent without it, so most users never get it.

While no airport map is loaded, OANS now runs the same rule as with the map (the volume from the nose to 7 s ahead, 60 m wide, from 1 to
40 kt on the ground, 30 s at most) against the runway rectangles of the sim's own airport database, through the shared
`NearbyRunwayProvider`, and issues the advisory on the PFD and ND the same way. With an airport map loaded, nothing changes.

4 unit tests (`fbw-common/src/systems/instruments/src/OANC/OansRunwayAheadWithoutMap.spec.ts`).

## Cockpit API Changes

None.

## Screenshots (if necessary)

**TO ADD**: RWY AHEAD on the PFD and ND while taxiing onto a runway without an airport map loaded.

## References

- A380 FCOM DSC-31-20-30-100 (ND message RWY AHEAD : CHANGE MODE). This FCOM edition does not describe the detection itself: the rule
  is FBW's existing OANS RWY AHEAD rule, applied to the sim's runways.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. No Navigraph airport map loaded (no subscription, or OANS map not loaded).
2. Taxi slowly towards a runway: RWY AHEAD on the PFD and ND when the runway is within 7 s ahead.
3. Above 40 kt, or airborne: no advisory. With the airport map loaded: the existing behaviour.
4. `npx vitest run fbw-common/src/systems/instruments/src/OANC/OansRunwayAheadWithoutMap.spec.ts` (4 tests).

<!-- DO NOT DELETE THIS -->
