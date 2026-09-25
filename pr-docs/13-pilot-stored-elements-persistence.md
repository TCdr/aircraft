# PR 13 - keep the pilot stored elements across sessions (flypad setting)

- **Title:** `feat(a380x/mfd): keep the pilot stored elements across sim sessions (flypad setting)`
- **Base:** `master` - **Branch:** `feature/a380/mfd/pilot-stored-elements-persistence`
- **Commit:** `7636abc1c`
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

<!-- DO NOT DELETE THIS -->
