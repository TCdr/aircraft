# PR 16 - KCCU keyboard entries

- **Title:** `fix(a380x/mfd): KCCU keyboard entries validated with ENT, ESC cancels the edition`
- **Base:** `master` - **Branch:** `fix/a380/mfd/kccu-keyboard-entry`
- **Labels to request:** `A380X`, `MFD`, `Bug`, `QA A380 Only`
- **Issue to open first** (bug report): *"A380X: values typed on the KCCU keys are not entered (e.g. ZFW)"*
- **CHANGELOG line:** `1. [A380X/MFD] KCCU entries are validated with ENT and cancelled with ESC - @TCdr`

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

A value typed on the KCCU keys was not entered. An entry field was only validated by the display's blur event, and in the sim a click
on a 3D KCCU key can end the edition before the key reaches the field. `InputField` now follows the A380 FCOM (DSC-31-30-20, KCCU):

- ENT validates the entry directly.
- ESC "cancels the current field edition. The field returns to the last valid value" (before, it re-entered the old value).
- With the KBD sw ON ("The KCCU keyboard is active"), a display blur no longer ends the edition. ENT, ESC or selecting another field
  ends it (selecting another field validates the previous one). One field in edition per side.
- A click on a field selects it even when the element already has the focus.
- KBD sw OFF: the PC keyboard works as before.

## Cockpit API Changes

None.

## References

- A380 FCOM DSC-31-30-20 (KCCU keyboard, ON/OFF sw, ENT, ESC).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. KBD sw ON: click the FUEL&LOAD ZFW field, type 3 3 0 on the KCCU, ENT: ZFW 330.0.
2. Type 1 2 then ESC: the previous value stays, nothing is entered.
3. Type in ZFW, click ZFWCG, type, ENT: both are entered.
4. KBD sw OFF: typing on the PC keyboard + Enter works.

<!-- DO NOT DELETE THIS -->
