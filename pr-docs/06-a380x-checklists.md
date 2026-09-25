# PR 6 - A380X ECAM procedures: WXR & TAWS and XPDR & TCAS lines sensed

- **Title:** `feat(a380x/fws): sense the WXR & TAWS and XPDR & TCAS lines of the ECAM procedures`
- **Base:** `master` - **Branch:** `feature/a380x-checklists-surv` (built on `feature/a380x-surv-panel`: needs the system selection LVars of PR 5)
- **Commits:** `4e24d18d6` (ECAM procedure lines sensed), `48b83c0ba` (CABIN CREW line), `14e842d8f` (the selected XPDR & TCAS system read through one helper); `50a3d13ee` (normal checklists) is gone - **2026-09-22: the normal-checklist lines of `50a3d13ee` are
  reverted in the working tree** (the A380 FCOM's normal checklists, PRO-NOR-C-L, have no SURV / WX & TERR / TCAS line; only the ECAM LINE-UP `CABIN CREW`
  line of that commit stays, the FCOM's BEFORE TAKEOFF checklist has it). Squash the revert into `50a3d13ee` when rebuilding the branch, or drop the commit
  and keep the CABIN CREW line alone.
- **Labels to request:** `A380X`, `FWS`, `ECAM`, `QA A380 Only`
- **Issue to open first:** *"A380X ADR/IR/TCAS fault procedures show the WXR & TAWS and XPDR & TCAS lines as always done"*
- **CHANGELOG line:** `1. [A380X/FWS] Sense the WXR & TAWS and XPDR & TCAS lines of the ECAM procedures and add the CABIN CREW line to the ECAM LINE-UP checklist - @TCdr`
  (the line in `.github/CHANGELOG.md` was rewritten to this on 2026-09-22)

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

**ECAM LINE-UP checklist:** gets the `CABIN CREW ... ADVISED` line that the EFB checklist already had (the FCOM's BEFORE TAKEOFF checklist has
`CABIN CREW ... ADVISE`). The sensed-items arrays of the ECAM checklists are index-aligned with the items, so they are extended in step.

**ECAM procedures:** the ADR 1+2 / 1+3 / 2+3 FAULT and IR 1+2 / 1+3 / 2+3 FAULT procedures ask the crew to switch the WXR & TAWS and the XPDR & TCAS
to SYS 1 or SYS 2, but both lines were hard-coded as always done. They now tick from the real selection (`L:A32NX_WXR_TAWS_SYS_SELECTED`,
`L:A32NX_TRANSPONDER_SYSTEM`), which the MFD STATUS & SWITCHING page and the pedestal buttons drive. The TCAS 1 / 2 FAULT procedures had their
XPDR & TCAS line hidden behind a "replace with SURV SYS logic once implemented" TODO: it is now shown and ticks once the healthy system is selected.

## Cockpit API Changes

No new LVars. Reads `L:A32NX_WXR_TAWS_SYS_SELECTED` and `L:A32NX_TRANSPONDER_SYSTEM` (introduced by the SURV PR).

## Screenshots (if necessary)

**TO ADD**: an ADR FAULT procedure with the XPDR & TCAS line before (always ticked) and after; the ECAM LINE-UP checklist with the CABIN CREW line.

## References

- A380 FCOM PRO-NOR-C-L Normal checklists (BEFORE TAKEOFF: `CABIN CREW ... ADVISE`; no surveillance lines in any normal checklist).
- **TO ADD**: the A380 FCOM abnormal procedures ADR 1+2 / 1+3 / 2+3 FAULT, IR ... FAULT and TCAS 1 / 2 FAULT (the WXR & TAWS ... SYS 1/2 and XPDR &
  TCAS ... SYS 1/2 lines), with page screenshots.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. LINE-UP (ECAM): the CABIN CREW line exists and matches the EFB.
2. Fail ADR 1+2 (or IR 1+2, and the other pairs): the WXR & TAWS and XPDR & TCAS lines tick only after selecting the system the procedure asks for.
3. Fail TCAS 1 (and TCAS 2): the XPDR & TCAS line is shown and ticks once the healthy system is selected.

<!-- DO NOT DELETE THIS -->
## How to download the PR for QA

Every new commit to this PR will cause new A32NX and A380X artifacts to be created, built, and uploaded.

1. Make sure you are signed in to GitHub
1. Click on the **Checks** tab on the PR
1. On the left side, find and click on the **PR Build** tab
1. Click on either **flybywire-aircraft-a320-neo** or **flybywire-aircraft-a380-842** download link at the bottom of the page
