# PR 27b - aircraft-large-files: A380X pedestal printer paper in the cockpit model

Companion of PR 27 (the aircraft repository). Opens FIRST, in `flybywiresim/aircraft-large-files`.

- **Title:** `feat(a380x): pedestal printer paper in the cockpit model`
- **Repository:** `flybywiresim/aircraft-large-files` - **Base:** `master` (`5f07408`, #23)
- **Branch:** `feat/a380x-pedestal-printer-paper` - **Commit:** `36b4bd9` (local worktree `E:\MSFS2024 mods\q-lf`)
- **To push:** the fork `TCdr/aircraft-large-files` does not exist yet: fork `flybywiresim/aircraft-large-files` on GitHub first,
  then `git push <fork> feat/a380x-pedestal-printer-paper`.
- **Files:** `A380_COCKPIT_LOD00.gltf` and `A380_COCKPIT_LOD00.bin.part02` (the new data is appended to the buffer: `part01` and
  every existing mesh are unchanged; +11 296 bytes of binary, +44 976 bytes of glTF JSON).
- **Made by:** `large-files/patch_a380_printer_model.py` in this folder, run on the unmodified `5f07408` model and the A32NX
  `A320_NEO_INTERIOR_LOD00` of the same commit; the result is byte-identical to the model tested in the sim (SHA-1 bin
  `5ed8da38`, glTF `a3abec98`).
- **After it is merged:** bump the `large-files` submodule pointer in PR 27 to the merge commit (a pointer to a fork commit would
  break FBW's checkout), and say in PR 27 that it depends on this PR.
- **Tested in the sim** on 2026-09-27 with PR 27's code (the user).

---- paste from here ----

## Summary of Changes

Adds the pedestal printer paper to the A380X cockpit model `A380_COCKPIT_LOD00`. The A380X cockpit behaviours already use the
A32NX printer templates and the aircraft PR flybywiresim/aircraft#[PR 27] prints the MFD pages on it, but the model had only the
printer buttons and an empty `PRINTER PAPER PATH` node: no paper was visible.

New nodes (names used by `A380_Cockpit_Behavior.xml` of the aircraft PR):

| Node | What |
|---|---|
| `Print`, `Print_TEXT`, `PRINT_TORN` | the sheet coming out of the printer (feed animation `PrintAnim`), its text layer, the torn edge; at the printer slot |
| `PAPER_1..4`, `PAPER_1..4_TEXT` | the torn-off sheets, flat on the blank panel left of the printer lid |
| `PAPER_PREV`, `PAPER_NEXT`, `PAPER_DISCARD` | invisible click zones over the torn-off sheet (previous / next page, discard) |
| `PAPER_TABLE` + `PAPER_T1..T4`, `PAPER_T1..T4_TEXT`, `PAPER_T_PREV/NEXT/DISCARD` | the same set on the captain's pull-out table, child of the table tray `Cube.034`; animation `PRINT_TABLE` slides it aft with the meal table |

New materials `PRINT` and `PRINT_STATIC` (the textures of the `VCockpit25` / `VCockpit26` printer displays of the aircraft PR),
emissive like the cockpit screens: in this MSFS 2024 model a live display texture shows through the emissive channel.

The paper meshes are the A32NX ones (`A320_NEO_INTERIOR_LOD00`), moved to the A380X printer slot and laid flat (the A32NX
pedestal is tilted 10 degrees); the click zones are shortened so they do not cover the printer buttons. The data is appended to the
buffer: no existing mesh, node or material changes.

## Screenshots (if necessary)

**TO ADD**: the sheet in the printer, the torn-off sheet on the pedestal, the sheets on the captain's table.

## References

- A380 FCOM DSC-22-FMS-20-30 (printer functions of the FMS); the paper look and animation follow the FBW A32NX printer.

## Additional context

Needs the aircraft PR flybywiresim/aircraft#[PR 27] (the printer displays and the behaviours); without it the paper stays hidden
(the templates show a sheet only while something is printed).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. With the aircraft PR installed, cold and dark: MFD FMS > DATA > PRINTER, press PRINT on F-PLN INIT.
2. The sheet feeds out of the printer on the pedestal with the printout readable on it.
3. Click the sheet: it tears off and lies on the panel left of the printer; PREV / NEXT at its ends page through the torn
   sheets, the aft edge discards it.
4. Pull out the captain's table: the sheets move to the table; unfold the meal table: they slide aft with it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
