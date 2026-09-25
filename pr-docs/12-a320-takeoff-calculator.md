# PR 12 - A320 takeoff calculator and MCDU uplink takeoff data

- **Title:** `feat(a32nx/efb): A320 takeoff calculator with the MCDU uplink takeoff data`
- **Base:** `master` - **Branch:** `feature/a32nx/efb/take-off-calculator` (built on `feature/a380/efb/take-off-calculator`, PR 11: the screen is shared)
- **Commit:** `b25f790a2`
- **Labels to request:** `A32NX`, `EFB`, `MCDU`, `Extensive Testing Needed`
- **Issue to open first:** *"A32NX takeoff calculator: runway distances and the MCDU uplink takeoff data"*
- **CHANGELOG line:** `1. [A32NX/EFB] Show the takeoff run on the runway, TOGA and FLEX, and send the takeoff data to the MCDU UPLINK TO DATA pages - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The flypad takeoff screen of PR 11 is shared by both aircraft (`TakeoffWidget`, `TakeoffRunway`, `TakeoffFmsLink`); what differs per
aircraft is one profile (FMS TOW margins, noise fields and T.O CG only on the A380, text keys).

**A32NX calculator**
- Takeoff run from the FBW A320 performance model: the required length by bisection on the runway length (1000-5000 m); for a FLEX, the
  length where the model still allows that temperature.
- The FBW A320 model gives other speeds for TOGA: a separate TOGA calculation feeds the TOGA run and the MAX uplink.
- Performance at forward CG below 27 % MAC (A320 FCOM PER-LOD). THS in the results.
- SEND TO FMS sends two uplinks, MAX and FLEX.

**MCDU (A320 FCOM DSC-22_20-50-10-28 P 89-99, DSC-22_45)**
- PERF TAKE OFF: `<TO DATA` (6L) in PREFLIGHT and DONE; the TO SHIFT field (1 m to the runway length, CLR).
- UPLINK TO DATA REQ (two runways), UPLINK MAX TO DATA / UPLINK FLX TO DATA (four runways, CONTAM scroll).
- INSERT UPLINK: runway of the flight plan only, TOW not more than 1 t below / 3 t above the FMS TOW; inserts V1 / VR / V2, FLAPS / THS,
  FLEX (cleared for MAX), THR RED / ACC, ENG OUT ACC, shift.
- Messages TAKEOFF DATA UPLINK, INVALID TAKEOFF UPLINK, REQUEST IS PENDING, NO ANSWER TO REQUEST (4 min).

## Cockpit API Changes

None.

## Screenshots (if necessary)

**TO ADD**: the flypad screen on the A32NX (TOGA and FLEX), the three MCDU pages, PERF TAKE OFF after INSERT UPLINK.

## References

- A320 FCOM DSC-22_20-50-10-28 P 89-99 (UPLINK TO DATA pages, PERF TAKE OFF), DSC-22_45 (takeoff data function), PER-LOD.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Flypad on the A32NX: calculate, TOGA and FLEX runs; 70 t on 2500 m gives about 1730 m at TOGA.
2. SEND TO FMS; MCDU PERF TAKE OFF `<TO DATA`, then the MAX and FLX pages: INSERT UPLINK fills PERF TAKE OFF.
3. Another runway in the flight plan, or a ZFW 4 t higher: INSERT UPLINK refused.
4. TO SHIFT entry and CLR.

<!-- DO NOT DELETE THIS -->
