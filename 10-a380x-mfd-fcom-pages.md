# PR 10 - A380X MFD FMS and SURV pages to the FCOM

- **Title:** `feat(a380x/mfd): lay out and complete the MFD FMS and SURV pages per the A380 FCOM`
- **Base:** `master` - **Branch:** `feature/a380/mcdu-improvements` (built on `feature/a380x-checklists-surv`, PR 6: open PR 5 and PR 6 first)
- **Commits (own):** `3800ff39d` (FMS pages), `e9d159981` (SURV pages), `ed33c1686` (labels, field height, STORE WPT, RTE SEL, WIND FL),
  `752007449` (FMS print functions, printouts in the flypad), `fbef33990` (SURV memos), `edb07a695` (FCOM sizes in the sim),
  `197a5f6aa` (printouts reach the flypad, menus open upwards, F-PLN wind), `a09803fa8` (FUEL PLANNING)
- **Labels to request:** `A380X`, `MFD`, `FWS`, `QA A380 Only`, `Extensive Testing Needed`
- **Issue to open first:** *"A380X MFD FMS pages differ from the FCOM and several FCOM pages are missing"*
- **CHANGELOG line:** `1. [A380X/MFD] Lay out the FMS and SURV pages per the A380 FCOM, add the missing FCOM pages, the print functions and FUEL PLANNING - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

Every A380X MFD FMS page was compared with its figure in the A380 FCOM (DSC-22-FMS-20-30, PDF pages 1009-1409) and re-laid out on it,
and the FCOM pages and functions FBW did not have were added. Each layout value and rule names its FCOM page in a code comment.

- **Layout:** the pages use the FCOM figure coordinates (`common/FcomLayout.tsx`: `fcomAt`, `fcomRight`, `fcomCentre`, `fcomLine`), the
  global FMS frame of the figures (title bar, 40 px entry fields, 22.5 px labels, 38 px tab bar), and box sizes counted border-box as
  Coherent GT renders them. Field contents are centred, dropdown arrows sit inside the frame, open menus are raised above the next items.
- **Entry formats:** the FCOM data entry formats (DSC-22-FMS-20-100) for every field, with the FCOM error messages.
- **New pages:** ALTERNATE, CLOSEST AIRPORTS, OFFSET, EQUI-TIME POINT, LL XING / TIME MKR, DATA / PRINTER, COMPANY WIND DATA REQUEST,
  COMPANY T.O DATA REQUEST, RECEIVED COMPANY T.O DATA (laid out; wired by PR 11), COMPANY F-PLN REQUEST / REPORT, REJECTED ATC INFO,
  TRANSFER TO MAILBOX.
- **Functions:** FMS print functions with the printouts shown in the flypad; FUEL PLANNING computes the minimum BLOCK from the
  predictions and CONFIRM BLOCK inserts it (FCOM P 179); PERF CRZ LRC (99 % of the maximum specific range, FCOM PER-IFT) and MAX TURB
  speed; VERT REV RTA with the time error thresholds; FMS P/N panel; pilot-stored runways; AIRWAYS with 31 segments and automatic
  airway connection; DATA / STATUS and AIRPORT behaviour per the FCOM.
- **SURV pages:** CONTROLS and STATUS & SWITCHING on DSC-34-20-60-50 P 4 / P 6 (XPDR AUTO / ON / STBY, TCAS and WXR option rules,
  ELEVN / TILT and GAIN fields); SURV memos of the WXR and TAWS; TCAS STBY with ALT RPTG OFF.

Where FBW had a newer FMS standard than this 2011 FCOM and the FCOM figure shows something else, the FCOM figure was followed.

## Cockpit API Changes

New LVars documented in `fbw-a380x/docs/a380-simvars.md` for the SURV pages (WXR ELEVN / TILT / GAIN settings). No LVar removed.

## Screenshots (if necessary)

**TO ADD**: each FMS page next to its FCOM figure (before / after).

## References

- A380 FCOM DSC-22-FMS-20-30 (MFD FMS pages, PDF p.1009-1409), DSC-22-FMS-20-100 (data entry formats), DSC-34-20-60-50 (SURV pages).

## Additional context

The pages were compared with the FCOM figures in a local browser harness that renders the MFD bundle with the sim's box model.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. Open every FMS page (ACTIVE, POSITION, SEC INDEX, DATA menus) and compare it with its FCOM figure.
2. Enter values in each field, including out-of-range and badly formatted entries: FCOM format and error messages.
3. PRINT functions: the printout appears in the flypad.
4. FUEL PLANNING with a flight plan, cruise FL, ZFW and ZFWCG and no BLOCK: the computed BLOCK appears, CONFIRM BLOCK inserts it.
5. SURV CONTROLS / STATUS & SWITCHING: every button and field.

<!-- DO NOT DELETE THIS -->
