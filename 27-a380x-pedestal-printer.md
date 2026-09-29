# PR 27 - A380X pedestal printer on paper, with the FMS pages and the ATIS

- **Title:** `feat(a380x/mfd): print the FMS pages and the ATIS on the pedestal printer`
- **Base:** `master` - **Branch:** `pr/27-a380x-pedestal-printer` (stacked on `pr/22-a380x-mfd-atccom`, PR 22: the ATC COM ATIS pages it prints from;
  PR 10 below it: the FMS print functions)
- **Tip:** `f8293d36b` - own commits: `9d45e444b` (FMS pages on the pedestal printer), `21c132b33` (tests),
  `2f65b31f8` (64-column lines on the paper), `9c0e68dea` (ATIS print), `f8293d36b` (ATIS time on the printout,
  PRINT ALL on one printout)
- **Labels to request:** `A380X`, `MFD`, `QA A380 Only`, `Extensive Testing Needed`
- **Issue to open first:** *"A380X: the MFD PRINT functions do not print on the pedestal printer"*
- **CHANGELOG line (in the branch):** `1. [A380X/MFD] Print the FMS pages on the pedestal printer paper, torn-off sheets on the pedestal or the CPT pull-out table - @TCdr`
- **Companion PR needed first:** the A380 cockpit model (`aircraft-large-files`, A380_COCKPIT_LOD00) has no paper nodes and no
  PRINT / PRINT_STATIC materials: the paper was added to the installed model by a script (copied from the A32NX model, placed at the
  printer slot and on the blank panel left of the lid). Without it the printer works but nothing is visible.
- **Tested in the sim** on 2026-09-27 (feed animation, tear-off, sheets on the pedestal and the CPT table, FMS pages and ATIS).

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The A380X MFD print functions (DATA / PRINTER page, SEC INDEX PRINT, ATC COM ATIS PRINT, PRINT ALL, AUTO PRINT) now print on the
pedestal printer paper, like the A32NX printer:

- **PedestalPrinter** (MFD): the A32NX print logic (45-line sheets fed 2.5 s apart, PRINT / PAPER / PRINT_TORN events and the
  printer sounds of the cockpit behaviours), called by the FMS printer.
- **Printer display:** `A380X/Printer/printer.html` on VCockpit25 / 26 (texture PRINT / PRINT_STATIC), the paper painted by the page;
  64-column lines fitted to the sheet.
- **ATIS:** PRINT, PRINT ALL (all the request areas on one printout: printed separately, each sheet pushed the previous one out) and
  AUTO PRINT print the ATIS message with the time of the ATIS message (FCOM DSC-46-10-20-30 P 31).
- Tests: FMS print functions, the pedestal printer, the printed ATIS.

## Cockpit API Changes

`panel.cfg` of the cockpit attachment: VCockpit25 / VCockpit26 (PRINT / PRINT_STATIC). Uses the existing `L:A32NX_PRINTER_*` variables
of the cockpit behaviours.

## Screenshots (if necessary)

**TO ADD**: a printout on the pedestal paper; a torn sheet on the CPT table.

## References

- A380 FCOM DSC-22-FMS-20-30 (DATA / PRINTER page), DSC-46-10-20-30 (ATC COM ATIS: PRINT, PRINT ALL, AUTO PRINT).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. MFD DATA / PRINTER: print a page; the paper feeds out of the pedestal printer with the text.
2. Tear the sheet; it goes to the pedestal (or the CPT table).
3. ATC COM ATIS: PRINT and PRINT ALL; one printout with all the ATIS, the time of each ATIS message.

<!-- DO NOT DELETE THIS -->
