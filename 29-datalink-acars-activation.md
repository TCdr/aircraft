# PR 29 - ACARS provider found again, and connected even when TELEX fails

- **Title:** `fix(datalink): keep looking for the ACARS provider and follow its availability`
- **Base:** `master` - **Branch:** `pr/29-datalink-acars-activation` (from the upstream master, independent)
- **Tip:** `ba83c9b4b` - own commit: `ba83c9b4b` (original `b6e388358` on `fix/datalink/acars-activation`, merged into `develop` 6d68cfd88)
- **Labels to request:** `A32NX`, `A380X`, `ATSU`, `Bug`
- **Issue to open first:** *"ACARS (Hoppie / BeyondATC / SayIntentions): a provider started after the aircraft is never found, the
  flyPad setting is reset to NONE after 5 minutes, a provider closed later still shows connected, and a TELEX failure leaves the
  ACARS provider unconnected"*
- **CHANGELOG line (in the branch):** `1. [ATSU] ACARS provider (Hoppie, BeyondATC, SayIntentions) found again when started late or restarted, and connected even when the TELEX connection fails; the provider setting is no longer reset after 5 minutes - @TCdr`
- **Before opening - TO DO:** the in-sim test with BeyondATC closed then started (done for the late start and the close/restart in
  the user's flights of 2026-09-29, to be confirmed after the final build).

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

Found while flying with BeyondATC as the ACARS provider (shared datalink code: both aircraft):

- The activation pinged the provider every 5 s for 5 minutes, then **gave up and reset the flyPad settings** (ACARS provider to
  NONE, ATIS to VATSIM, METAR to MSFS): starting BeyondATC 6 minutes after the aircraft wiped the setup. It now keeps trying once a
  minute after the first 5 minutes and never changes the settings.
- A flight number connection starts with a disconnection, which **stopped the activation** in progress: a provider not answering at
  that moment was never found. A disconnection now only clears the flight number.
- When the provider answers late, the **flight number received before is connected** (callsign check, then polls).
- A provider **closed later** was never noticed (the flyPad kept "connected"). Once active, the provider is checked once a minute
  without a flight number (a ping) or by the polls and the messages sent with one (no extra traffic for Hoppie); when it stops
  answering, the ACARS is not active any more and the activation starts again, fast.
- With TELEX on, a TELEX connection failure **left the ACARS provider unconnected**. `Router.connect` now connects both and still
  returns the TELEX failure.

4 unit tests (`AcarsConnector.spec.ts`): a provider started 6 minutes late (settings untouched), a flight number connected while
the provider is down, a provider closed and started again, with and without a flight number.

## Cockpit API Changes

None (`L:A32NX_ACARS_ACTIVE` now also goes back to 0 when the provider stops answering).

## Screenshots (if necessary)

**TO ADD**: flyPad ATSU/AOC page "waiting for connection" then connected.

## References

- Hoppie ACARS technical notes (polling every 45 to 75 s), https://www.hoppie.nl/acars/system/tech.html
- BeyondATC ACARS server logs (localhost:57698) during the tests.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. flyPad ATSU/AOC: ACARS provider BATC (or Hoppie), BeyondATC closed. Load the aircraft: "waiting for connection".
2. Start BeyondATC after 6 minutes: within a minute, connected; the provider setting is still BATC.
3. Enter a flight number, then close BeyondATC: within about a minute, "waiting for connection"; start it again: connected, and the
   flight number is connected again (BeyondATC log: ping with the flight number, then polls).
4. TELEX on with a flight number FBW's service refuses: the ACARS provider is still connected.
5. `npx vitest run fbw-common/src/systems/datalink/router/src/webinterfaces/AcarsConnector.spec.ts` (4 tests).

<!-- DO NOT DELETE THIS -->
