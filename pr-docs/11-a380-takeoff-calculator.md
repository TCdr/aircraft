# PR 11 - A380 takeoff calculator and company T.O data

- **Title:** `feat(a380x/efb): A380 takeoff calculator with company T.O data to the FMS`
- **Base:** `master` - **Branch:** `feature/a380/efb/take-off-calculator` (built on `feature/a380/mcdu-improvements`, PR 10)
- **Commit:** `c16e6e877`
- **Labels to request:** `A380X`, `EFB`, `MFD`, `QA A380 Only`, `Extensive Testing Needed`
- **Issue to open first:** *"No takeoff calculator on the A380X flypad"*
- **CHANGELOG line:** `1. [A380X/EFB] Add a takeoff calculator from the Airbus charts and the FCOM rules, with the company T.O data to the MFD - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The A380X flypad gets a takeoff calculator, and the MFD the FCOM company takeoff data function that receives its results.

**Calculator (`a380x_takeoff.ts`, `a380x_takeoff_data.ts`)**
- Weight limits from the Airbus A380 Aircraft Characteristics (1 Dec 2025), take-off weight limitation charts, Trent 900, ISA and ISA+15
  (PDF p.135-139). The curves are vector paths and were extracted exactly: runway 1700-5100 m, airport altitude 0-8000 ft.
- Corrections the charts do not give are FBW-model estimates, amber with an asterisk: temperature (W ~ sigma^k x thrust^j, fitted on the
  charts), FLEX (thrust ratio 1 at TREF to 0.6 at TMAXFLEX, FCOM 40 % maximum; checked on the FCOM example 560 t / 614 t -> FLEX 38),
  wind (50 % headwind / 150 % tailwind), slope, line-up (172.5 / 219.8 ft). A "Data" select switches to Airbus data only.
- Speeds: V2 >= 1.13 VS1G and >= 1.10 VMCA, VR >= 1.05 VMCA, V1 >= VMCG, ratios from the FCOM RESULTS example.
- Takeoff run: the required length is where the chart limit equals the TOW (bisection); V1 / VR / 35 ft points from TOD0 = required / 1.15
  (CS 25.113) with a constant acceleration to V2 + 10.

**Flypad screen:** RUNWAY / CONDITIONS / AIRCRAFT / DEPARTURE inputs (fill from the OFP, the METAR or the FMS), the RESULTS panel of the OIS
takeoff application (FCOM PER-TOF-TOR-SRS P 1), and a TAKEOFF RUN panel with a runway drawing (shift, line-up, V1 / VR / 35 ft marks,
required distance, margin) for TOGA or any FLEX of the allowed range (FCOM PER-TOF-THR-FLX, range of TFLEX).

**Company T.O data (FCOM DSC-22-FMS-20-30):** SEND T.O REQUEST (REQUEST PENDING..., NO COMPANY REPLY after 4 min), uplinks for up to
4 runways x 2 thrust ratings, message COMPANY T.O DATA RECEIVED WAITING FOR INSERTION, INIT / PERF button RECEIVED CPNY T.O, the
RECEIVED COMPANY T.O DATA page (runway amber when not the active one, TOW amber outside -2 t / +7 t with UPLINK/ACTIVE TOW DISAGREE,
TEMP dashes for FLEX, T.O LIMIT and T.O SHIFT) and INSERT, which fills PERF T.O (speeds, flaps, thrust, shift, THR RED / ACCEL / EO
ACCEL, noise; not the CG, which the crew enters in THS FOR).

## Cockpit API Changes

None (EventBus topics `cpny_to_fms_data`, `cpny_to_fms_data_request`, `cpny_to_uplink`, synced between the instruments).

## Screenshots (if necessary)

**TO ADD**: the flypad screen (TOGA and FLEX runs), the RECEIVED COMPANY T.O DATA page, PERF T.O after INSERT.

## References

- Airbus A380 Aircraft Characteristics, Airport and Maintenance Planning (1 Dec 2025), take-off weight limitation charts.
- A380 FCOM PER-TOF-THR-FLX, PER-TOF-TOR-SRS P 1-2, DSC-22-FMS-20-30 P 312-320 (RECEIVED COMPANY T.O DATA). CS 25.113.

## Additional context

The FBW VMCA / VMCG tables are A320 placeholders (the FCOM gives no values). The charts are dry, no wind, no slope: every other case
is an estimate and flagged as one.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Fill from the OFP, calculate: results and takeoff run; switch TOGA / FLEX and move the FLEX slider: the distances change.
2. Data select "Airbus data only": corrections not covered by the charts give an error instead of an estimate.
3. SEND TO FMS, then MFD RECEIVED CPNY T.O: the data per runway / thrust; INSERT fills PERF T.O.
4. Change the MFD runway or the ZFW: the runway / TOW turns amber and INSERT is not available.
5. MFD SEND T.O REQUEST, then Fill from FMS in the flypad: the request conditions come in.

<!-- DO NOT DELETE THIS -->
