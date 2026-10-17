# PR 12 - A320 takeoff calculator and MCDU uplink takeoff data

- **Title:** `feat(a32nx/efb): A320 takeoff calculator with the MCDU uplink takeoff data`
- **Base:** `master` - **Branch:** `feature/a32nx/efb/take-off-calculator` (built on `feature/a380/efb/take-off-calculator`, PR 11: the screen is shared)
- **Labels to request:** `A32NX`, `EFB`, `MCDU`, `Extensive Testing Needed`
- **Issue to open first:** *"A32NX takeoff calculator: runway distances and the MCDU uplink takeoff data"*
- **CHANGELOG line:** `1. [A32NX/EFB] Show the takeoff run on the runway, TOGA and FLEX, and send the takeoff data to the MCDU UPLINK TO DATA pages - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

Both aircraft share the flypad takeoff screen of PR 11 (`TakeoffWidget`, `TakeoffRunway`, `TakeoffFmsLink`). A per-aircraft profile
holds the differences: FMS TOW margins, text keys, and the noise fields and T.O CG (A380 only).

**A32NX calculator**
- The takeoff run comes from the FBW A320 performance model: a bisection on the runway length (1000-5000 m) finds the required length.
  For FLEX, it is the length at which the model still allows that temperature.
- The model gives different speeds for TOGA, so a separate TOGA calculation feeds the TOGA run and the MAX uplink.
- Forward CG performance below 27 % MAC (A320 FCOM PER-LOD). The results include the THS.
- SEND TO FMS sends two uplinks, MAX and FLEX.

**MCDU**
- PERF TAKE OFF: `<TO DATA` (6L) in the PREFLIGHT and DONE phases; TO SHIFT field (1 m up to the runway length, CLR to clear).
- UPLINK TO DATA REQ (two runways), UPLINK MAX TO DATA / UPLINK FLX TO DATA (four runways, CONTAM scroll).
- INSERT UPLINK: accepted only for the flight plan runway and a TOW from 1 t below to 3 t above the FMS TOW. It inserts V1 / VR / V2,
  FLAPS / THS, FLEX (cleared for MAX), THR RED / ACC, ENG OUT ACC and the shift.
- Messages: TAKEOFF DATA UPLINK, INVALID TAKEOFF UPLINK, REQUEST IS PENDING, NO ANSWER TO REQUEST (4 min).

## Cockpit API Changes

None.

## Screenshots (if necessary)

**TO ADD**: the flypad screen on the A32NX (TOGA and FLEX), the three MCDU pages, PERF TAKE OFF after INSERT UPLINK.

## References

- A320 FCOM DSC-22_20-50-10-28 P 89-99 (UPLINK TO DATA pages, PERF TAKE OFF), DSC-22_45 (takeoff data function), PER-LOD.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. A32NX flypad, calculate: the TOGA and FLEX runs show; 70 t on a 2500 m runway gives about 1730 m at TOGA.
2. SEND TO FMS. On the MCDU, PERF TAKE OFF `<TO DATA`, then the MAX and FLX pages: INSERT UPLINK fills PERF TAKE OFF.
3. Another runway in the flight plan, or a ZFW 4 t higher: INSERT UPLINK is refused.
4. Enter a TO SHIFT, then clear it with CLR.

<!-- DO NOT DELETE THIS -->
