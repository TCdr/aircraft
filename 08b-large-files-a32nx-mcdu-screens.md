# PR 8b - aircraft-large-files: A32NX MCDU screens on one texture, one half each

Companion of PR 8 (the aircraft repository). Opens FIRST, in `flybywiresim/aircraft-large-files`.

- **Title:** `feat(a32nx): one MCDU texture split between the CPT and F/O screens`
- **Repository:** `flybywiresim/aircraft-large-files` - **Base:** `master` (`5f07408`, #23)
- **Branch:** `feat/a32nx-mcdu-screen-uv-split` - **Commit:** `5563e31` (local worktree `E:\MSFS2024 mods\q-lf8`)
- **Pushed** (2026-09-29) to the fork `TCdr/aircraft-large-files`. Open the PR from
  https://github.com/TCdr/aircraft-large-files/pull/new/feat/a32nx-mcdu-screen-uv-split (base `flybywiresim/aircraft-large-files` master).
- **File:** `A320_NEO_INTERIOR_LOD00.bin.part01` only: four float16 UV values (1 byte each), no other change. The result is
  byte-identical to the model tested in the sim (reassembled LOD00 SHA-1 `1ce56de1`).
- **After it is merged:** bump the `large-files` submodule pointer in PR 8 to the merge commit, and say in PR 8 that it depends
  on this PR.
- **Tested in the sim** in September 2026 with PR 8's code (the user): CPT and F/O MCDUs independent.

---- paste from here ----

## Summary of Changes

The CPT and F/O MCDU screens of the A32NX interior model `A320_NEO_INTERIOR_LOD00` (`SCREEN_MCDUL`, `SCREEN_MCDUR`) both
sample the whole `MCDU` texture, so the two MCDUs always show the same picture. This PR maps each screen to one half of the
texture:

| Mesh | TEXCOORD_0 u before | u after |
|---|---|---|
| `SCREEN_MCDUL` (CPT) | 0 .. 1 | 0 .. 0.5 (left half) |
| `SCREEN_MCDUR` (F/O) | 0 .. 1 | 0.5 .. 1 (right half) |

Four float16 values change (MCDUL u 1.0 -> 0.5 on two vertices, MCDUR u 0 -> 0.5 on two vertices); nothing else in the model.

It is the model part of flybywiresim/aircraft#[PR 8]: the MCDU gauge renders one 2048x1024 texture with the CPT display in the
left half and the F/O display in the right half (the approach of the earlier attempt flybywiresim/a32nx#5383). The aircraft PR
makes the same change to `A320_NEO_INTERIOR_LOD01` (in the aircraft repository); the lower LODs have no MCDU screens.

## Screenshots (if necessary)

**TO ADD**: both MCDUs on different pages.

## References

- A320 FCOM DSC-22_10-10: the two MCDUs "are installed on the pedestal for flight crew loading and display of data".

## Additional context

Needs flybywiresim/aircraft#[PR 8], which bumps the `large-files` submodule to this change: the aircraft only picks the model up
through that bump, together with the 2048x1024 MCDU display (with the current 1024x1024 display each screen would show half of
the MCDU picture).

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. With the aircraft PR installed, power the aircraft.
2. CPT MCDU: MCDU MENU > FMGC; F/O MCDU: stays on MCDU MENU, or go to another page.
3. Each screen shows its own page, full width, not stretched; typing on one keyboard only changes that MCDU's scratchpad.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
