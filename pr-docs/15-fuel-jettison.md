# PR 15 - A380X fuel jettison

- **Title:** `feat(a380x): fuel jettison with JTSN GW, ECAM memo and procedures`
- **Base:** `master` - **Branch:** `feature/a380/fuel-jettison`
- **Commit:** `b04a3851d`
- **Labels to request:** `A380X`, `ECAM`, `FWS`, `MFD`, `QA A380 Only`, `Extensive Testing Needed`
- **Issue to open first:** *"A380X fuel jettison does nothing"*
- **CHANGELOG line:** `1. [A380X/FUEL] Add fuel jettison with the JTSN GW, the ECAM memo and procedures - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

FBW had the overhead JETTISON ARM / ACTIVE pb-sw only. Fuel jettison per the A380 FCOM DSC-28-40:

- **FQMS (CPIOM F `FuelJettison`):** with ARM and ACTIVE on, fuel leaves the transfer tanks (proportionally) at the FCOM rate; the feed
  tanks are never jettisoned. The trim tank is held at the forward T.O/LDG CG limit and resumed at +0.5 %. The jettison stops at the JTSN GW,
  when the transfer tanks are empty or when a pb-sw is set OFF; COMPLETED latches until both are OFF. The other transfers pause meanwhile.
  The MSFS fuel system has no overboard outlet, so the tank quantities are set directly (valves 57 / 58 open for the SD).
- **FUEL&LOAD:** the JTSN GW field, from ZFW + 11 000 lb to the maximum GW (DSC-22-FMS-20-100), sent to the FQMS.
- **ECAM:** memo JETTISON IN PROGRESS; FUEL JETTISON COMPLETED (ACTIVE OFF, ARM OFF, sensed); ABN PROC FUEL JETTISON (FUEL menu) with
  its FWS entry, the ARM / ACTIVE lines sensed.
- **Cockpit:** the ACTIVE ON light goes off when the FQMS completes the jettison.

## Cockpit API Changes

New LVars: `L:A380X_FMS_JETTISON_GW` (kg, FMC), `L:A380X_FUEL_JETTISON_IN_PROGRESS`, `L:A380X_FUEL_JETTISON_COMPLETED` (FQMS). Reads
`L:A380X_OVHD_FUEL_JETTISON_ARM_PB_IS_ON` / `_ACTIVE_PB_IS_ON`.

## Screenshots (if necessary)

**TO ADD**: FUEL&LOAD JTSN GW, the SD FUEL page during a jettison, the memo, the COMPLETED procedure, the ABN PROC procedure.

## References

- A380 FCOM DSC-28-40 (fuel jettison), DSC-22-FMS-20-30 / -20-100 (FUEL&LOAD JTSN GW), PRO-ABN-ECAM-10-28 / -20-28 (procedures).

## Additional context

FAULT, VLV NOT CLOSED and INOP SYS are not modelled (FBW has no jettison valve failures). The behaviour XML change needs a full MSFS restart.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. In flight, JTSN GW = GW - 20 t, ARM then ACTIVE: memo, fuel decreasing on the SD, trim tank held at the CG limit.
2. At the JTSN GW: jettison stops, COMPLETED procedure, ACTIVE light off; both pb-sw OFF clears it.
3. ABN PROC > FUEL > FUEL JETTISON: the procedure shows, ARM / ACTIVE lines tick with the pb-sw.

<!-- DO NOT DELETE THIS -->
