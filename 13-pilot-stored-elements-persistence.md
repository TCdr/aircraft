# PR 13 - keep the pilot stored elements across sessions (flypad setting)

- **Title:** `feat(a380x/mfd): keep the pilot stored elements across sim sessions (flypad setting)`
- **Base:** `master` - **Branch:** `pr/13-pilot-stored-elements-persistence` (stacked on `pr/10-a380x-mfd-fcom-pages`, PR 10)
- **Tip:** `77170df99` - own commits: `c91bfd34e` (feature), `4b4a481e8` (single instance), `757c7dfce` (strict types), `c245f149f`
  (test setup: jsdom localStorage), `ed59b37cf` (tests), `77170df99` (OIT settings option)
- **Labels to request:** `A380X`, `MFD`, `EFB`, `QA A380 Only`
- **Issue to open first:** *"A380X pilot stored waypoints and routes are lost when the sim is closed"*
- **CHANGELOG line:** `1. [A380X/MFD] Add an optional setting to keep the pilot stored elements between sim sessions - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The A380 FCOM says "All the pilot-stored elements are deleted when all FMCs are shut down" (DSC-22-FMS); that stays the default. A new
flypad realism setting, **Keep pilot stored elements** (off by default, marked unrealistic), saves the stored waypoints, navaids, routes and
runways in the persistent storage (`SetStoredData A380X_PILOT_STORED_ELEMENTS`) and restores them at the next session, before the FMS
loads them (a session sentinel tells a new session from a reload).

Also in this PR:
- The OIT flyPad (OITlegacy) gets the new realism option too, with the A380X EFB value; without it the FBW_TYPECHECK build fails.
- 17 unit tests (`PilotStoredElements.spec.ts`): the FCOM database limits (20 NAVAIDs and 10 runways, the first created one deleted
  when full; 5 routes, then PILOT RTEs LIST FULL), replacement instead of duplicates, city pair routes, deletions, the NAVAID class
  fields, unreadable storage, and the setting across sessions (kept or deleted, written only on a change, not restored twice in a
  session, the kept copy dropped when the setting is turned off).
- Test setup fix (`fbw-common/src/jest/setupJestMock.ts`, test only): Node 22+ defines its own `localStorage` global, undefined
  without `--localstorage-file`, and vitest keeps it instead of the jsdom one. The setup now uses the jsdom storage, or an in-memory
  one, when `localStorage` is undefined. The new tests need it, and it also makes the existing `WaypointEntryUtils.spec.ts` and
  `SimBriefUplinkAdapter.spec.ts` load again on Node 22+ (they failed to load in the dev container, Node 26).

## Cockpit API Changes

None. New stored data key `A380X_PILOT_STORED_ELEMENTS`, new setting `KEEP_PILOT_STORED_ELEMENTS`.

## Screenshots (if necessary)

**TO ADD**: the Realism setting; DATA / WAYPOINT after a sim restart with the setting on.

## References

- A380 FCOM DSC-22-FMS (pilot-stored elements deleted at FMC shutdown).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Setting off: store a waypoint, restart the sim: it is gone (FCOM).
2. Setting on: store waypoints, navaids, a route and a runway, restart the sim: they are back.
3. OIT flyPad: Settings > Realism shows the option.
4. `npx vitest run fbw-a380x/src/systems/instruments/src/MFD/FMC/PilotStoredElements.spec.ts` (17 tests), and the full `npm test`
   on Node 22+ (the two existing specs above load again).

<!-- DO NOT DELETE THIS -->
