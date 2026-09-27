# PR 12 - A320 takeoff calculator and MCDU uplink takeoff data

- **Title:** `feat(a32nx/efb): A320 takeoff calculator with the MCDU uplink takeoff data`
- **Base:** `master` - **Branch:** `pr/12-a320-takeoff-calculator` (stacked on `pr/11-a380-takeoff-calculator`, PR 11: the screen is shared)
- **Tip:** `6558460dd` - own commits: `36eecadcf` (feature), `cb282d30b` (shared FMS link), `fb5035f32` (OFP import), `a8c0db6e7`
  (selected thrust only), `ed998f69a` (Data selector removed), `2ab2d94a6` (missing inputs in amber), `d7f729c01` (A380 CG envelope
  edges), `f5f898ffb` (A380 calculator tests), `37aca0601` (EFB build inputs), `6558460dd` (MCDU strict types)
- **Labels to request:** `A32NX`, `A380X`, `EFB`, `MCDU`, `Extensive Testing Needed`
- **Issue to open first:** *"A32NX takeoff calculator: runway distances and the MCDU uplink takeoff data"*
- **CHANGELOG line:** `1. [A32NX/EFB] Show the takeoff run on the runway, TOGA and FLEX, and send the takeoff data to the MCDU UPLINK TO DATA pages - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The flypad takeoff screen of PR 11 is shared by both aircraft (`TakeoffWidget`, `TakeoffRunway`, `TakeoffFmsLink`); what differs per
aircraft is one profile (FMS TOW margins, noise fields and T.O CG only on the A380, text keys). This PR also completes the takeoff
screen and the A380 calculator of PR 11 (see "Both aircraft" and "A380 calculator" below).

**A32NX calculator**
- Takeoff run from the FBW A320 performance model: the required length by bisection on the runway length (1000-5000 m); for a FLEX, the
  length where the model still allows that temperature.
- The FBW A320 model gives other speeds for TOGA: a separate TOGA calculation feeds the TOGA run and the MAX uplink.
- Performance at forward CG below 27 % MAC (A320 FCOM PER-LOD). THS in the results.
- SEND TO FMS sends the takeoff data of the thrust selected for the takeoff run only (MAX, or FLEX at its temperature, with that
  thrust's own speeds).

**MCDU (A320 FCOM DSC-22_20-50-10-28 P 89-99, DSC-22_45)**
- PERF TAKE OFF: `<TO DATA` (6L) in PREFLIGHT and DONE; the TO SHIFT field (1 m to the runway length, CLR).
- UPLINK TO DATA REQ (two runways), UPLINK MAX TO DATA / UPLINK FLX TO DATA (four runways, CONTAM scroll).
- INSERT UPLINK: runway of the flight plan only, TOW not more than 1 t below / 3 t above the FMS TOW; inserts V1 / VR / V2, FLAPS / THS,
  FLEX (cleared for MAX), THR RED / ACC, ENG OUT ACC, shift.
- Messages TAKEOFF DATA UPLINK, INVALID TAKEOFF UPLINK, REQUEST IS PENDING, NO ANSWER TO REQUEST (4 min).
- No INSERT UPLINK prompt for an incomplete uplink, e.g. without V1 or VR (A320 FCOM DSC-22_20-70 P 6).

**Both aircraft (takeoff screen of PR 11)**
- One company takeoff data link for the A380 and A320 FMS (`CompanyTakeoffDataLink`, fbw-common): the request and its 4 min timeout,
  the data of up to four runways, the common checks and the answer to the flypad import; each aircraft adds its own checks.
- The Data selector (Airbus data only) is removed: with the charts alone the A380 calculator gives no FLEX, V1 or VR and refuses any
  wind, slope or temperature above TREF. The estimates are always used and stay flagged (amber, asterisk).
- The labels of the missing inputs (heading, TORA, elevation, slope, wind, OAT, QNH, TOW) are amber, so the pilot sees why CALCULATE
  is not available.
- OFP import: reads the current SimBrief OFP when the flypad has none, handles an OFP without METAR and a runway that is not found,
  and reports every failure.

**A380 calculator (PR 11)**
- A TOW of exactly 510 t (the structural MTOW) no longer gives CG OUT OF LIMITS: the envelope limits are inclusive, as on the A320.
- 42 unit tests against the Airbus A380 AC 3-3 chart points and the A380 FCOM (PER-TOF-TOC corrections, PER-TOF-TOR-SRS minimum
  speeds, PER-TOF-THR-FLX FLEX range, LIM-12 limits).
- The A380X EFB is rebuilt when the calculator changes (EFB `extraDeps`).

## Cockpit API Changes

None.

## Screenshots (if necessary)

**TO ADD**: the flypad screen on the A32NX (TOGA and FLEX), the three MCDU pages, PERF TAKE OFF after INSERT UPLINK.

## References

- A320 FCOM DSC-22_20-50-10-28 P 89-99 (UPLINK TO DATA pages, PERF TAKE OFF), DSC-22_20-70 P 6 (INSERT UPLINK not displayed for an
  incomplete uplink), DSC-22_45 (takeoff data function), PER-LOD.
- A380 FCOM PER-TOF-TOC, PER-TOF-TOR-SRS, PER-TOF-THR-FLX, LIM-12; Airbus A380 Aircraft Characteristics (Dec 01/25) 3-3 (tests).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Flypad on the A32NX: calculate, TOGA and FLEX runs; 70 t on 2500 m gives about 1730 m at TOGA.
2. SEND TO FMS; MCDU PERF TAKE OFF `<TO DATA`, then the MAX and FLX pages: INSERT UPLINK fills PERF TAKE OFF.
3. Another runway in the flight plan, or a ZFW 4 t higher: INSERT UPLINK refused.
4. TO SHIFT entry and CLR.
5. SEND TO FMS with TOGA selected, then with a FLEX: only the selected thrust reaches the MCDU (MAX or FLX page).
6. Clear an input (e.g. OAT): its label turns amber and CALCULATE is not available.
7. A380X: TOW 510.0 t with a CG inside the envelope calculates (was CG OUT OF LIMITS); no Data selector on the screen.
8. `npx vitest run fbw-a380x/src/systems/shared/src/performance/a380x_takeoff.spec.ts` (42 tests).

<!-- DO NOT DELETE THIS -->
