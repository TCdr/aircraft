# PR 28 - A380X EMER CANC pushbutton

- **Title:** `feat(a380x/fws): EMER CANC pushbutton`
- **Base:** `master` - **Branch:** `pr/28-a380x-fws-emer-canc` (from the upstream master, independent)
- **Tip:** `4377b066a` - own commit: `4377b066a` (original `fbb6abd12` on `feature/a380x/fws/emer-canc`, merged into `develop` ca3644748)
- **Labels to request:** `A380X`, `ECAM`
- **Issue to open first:** *"A380X: the EMER CANC pushbutton on the ECP does nothing (the L:var it sets is read by nothing)"*
- **CHANGELOG line (in the branch):** `1. [A380X/FWS] EMER CANC pushbutton: cancels the aural and MASTER WARN of a warning, a caution for the rest of the flight (CANCELLED CAUTION on the STATUS page, recalled with RCL held 3 s) - @TCdr`
- **Before opening - TO DO:** in-sim test (the FWS cannot run in the browser harness); screenshots of the STATUS page CANCELLED
  CAUTION section and of the EMERGENCY CANCEL ON memo.

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The EMER CANC pushbutton of the ECP sets `L:A32NX_BTN_EMERCANC`, but nothing in the A380X FWS read it. It now works as the A380
FCOM describes it (DSC-31-40-20 P 5), on the alert at the top of the EWD:

- **Warning:** its aural alert and the MASTER WARN light are cancelled; the procedure stays on the EWD. When the warning goes away and
  comes back, the aural alert and MASTER WARN come back.
- **Caution:** cancelled for the rest of the flight, with its procedure and the MASTER CAUT light; it stays cancelled if the failure
  comes back. The cancelled cautions are listed in white in a new CANCELLED CAUTION section of the STATUS MORE page (DSC-31-40-10).
- **Always:** all the aural alerts and audio indicators (the one playing and the queued ones) are cancelled, and the not-sensed
  procedures activated from ABN PROC are deactivated.
- **Nothing to cancel:** the EWD shows the memo EMERGENCY CANCEL ON for 3 s (the FCOM gives no time; 3 s as the RCL NORMAL).
- **RCL pressed more than 3 s** brings back the cancelled cautions still active on the EWD (DSC-31-40-10).
- Reset with the other ECAM resets (FWS power loss, 50 minutes after shutdown).

Code: `FwsEmerCancel.ts` keeps the cancelled cautions and the silenced warnings (4 unit tests); `FwsCore.ts` reads the pushbutton
through its input buffer and pulse node as CLR and RCL, and excludes the cancelled cautions from the new warnings, the EWD
procedures and the recall; `FwsSoundManager.cancelAll()`; memo `310000002`; STATUS page section fed by the new bus topic
`fws_cancelled_caution`.

## Cockpit API Changes

None (the existing `L:A32NX_BTN_EMERCANC` is now read). New FWS bus topic `fws_cancelled_caution` (FWS -> SD).

## Screenshots (if necessary)

**TO ADD**: STATUS page with the CANCELLED CAUTION section; EWD with EMERGENCY CANCEL ON.

## References

- A380 FCOM DSC-31-40-20 P 5 (ECP, EMER CANC pb).
- A380 FCOM DSC-31-40-10 (CANCELLED CAUTION on the STATUS page, RCL pb pressed more than 3 s).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Cold and dark, then power: trigger a caution (e.g. a bleed or a pack off in flight) and press EMER CANC: MASTER CAUT off, the
   caution and its procedure removed; STATUS > MORE: CANCELLED CAUTION lists it. Trigger it again: it stays cancelled.
2. Hold RCL more than 3 s: the caution comes back on the EWD.
3. Trigger a warning with an aural alert (e.g. ENG FIRE TEST, or a failure from the flyPad) and press EMER CANC: aural and MASTER
   WARN off, procedure kept.
4. EMER CANC with no alert: EMERGENCY CANCEL ON for 3 s in the memo area.
5. `npx vitest run fbw-a380x/src/systems/systems-host/CpiomC/FlightWarningSystem/FwsEmerCancel.spec.ts` (4 tests).

<!-- DO NOT DELETE THIS -->
