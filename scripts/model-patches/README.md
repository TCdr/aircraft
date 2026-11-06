# Model patches (fork-only edits of generated code)

The `model/` folders of the fly-by-wire WASM modules (`fbw-a32nx/src/wasm/fbw_a320/src/model/` and
`fbw-a380x/src/wasm/fbw_a380/src/model/`) are generated from Simulink models that this fork does not have. Upstream
regenerates them from time to time, which would silently drop any hand edit. The fork needs a few edits there, so they are
kept here as an ordered patch set on top of the pristine upstream files, and a script checks that the tree still matches it.

`BASE` holds the upstream commit that last changed the `model/` folders: the files at that commit are the pristine ones the
patches apply to. The check fails on any upstream change of a model file after `BASE`, not only on a full regeneration: a merge
of upstream that touches `model/` too is enough. Re-record the patches on the new upstream state (see "After an upstream
change of the model files" below).

| Patch | Feature | Files | Source of the values | Native test that guards it |
| --- | --- | --- | --- | --- |
| `01-a380x-alpha-floor-mach.patch` | A380X alpha floor inhibited above Mach 0.5 (the model had 0.6) | `A380PrimComputerFe.cpp` | A380 FCOM, alpha floor inhibition conditions | `fbw_a380/test/alpha_floor_mach_inhibit_test.cpp` |
| `02-a32nx-cl-detent.patch` | A32NX thrust limit goes to CLB with the levers at the CL detent after a FLX takeoff (tolerance on the detent) | `FadecComputer.cpp` | A320 FCOM, thrust limit modes | `fbw_a320/test/clb_limit_after_flex_takeoff_test.cpp` |
| `03-a380x-cl-detent.patch` | A380X same, after a derated or FLEX takeoff | `A380FadecComputer.cpp` | A380 FCOM, thrust limit modes | `fbw_a380/test/clb_limit_after_derate_takeoff_test.cpp` |
| `04-ap-overspeed-disconnect.patch` | Autopilot disengages at VMO + 15 kt or MMO + 0.04 (both aircraft) | `FmgcComputer.cpp`, `A380PrimComputerFg.cpp/.h` | A320 and A380 FCOM, autopilot disconnection | `fbw_a320/test/ap_overspeed_disconnect_test.cpp`, `fbw_a380/test/ap_overspeed_disconnect_test.cpp` |
| `05-a32nx-elac-fcom.patch` | A32NX ELAC high speed protection, B+Y pitch law, sidestick takeover latch | `ElacComputer.cpp`, `ElacComputer_data.cpp`, `SecComputer_data.cpp` | A320 FCOM, high speed protection and sidestick takeover | `fbw_a320/test/elac_law_and_protection_test.cpp` |
| `06-a380x-fctl-fcom.patch` | A380X normal law protection values and direct law triggers | `A380PrimComputerFctl.cpp/_data.cpp`, `A380LateralNormalLaw.cpp/.h`, `A380PitchNormalLaw.cpp` | A380 FCOM, normal law protections and direct law | `fbw_a380/test/fctl_protection_values_test.cpp` |
| `07-fls-no-land.patch` | LAND never engages on an FLS approach (new input `fls_approach_active`) | `FmgcComputer.cpp/_data.cpp/_types.h`, `A380PrimComputerFg.cpp`, `_types.h`/`_data.cpp` of Fctl, Fe, Fg, GeneralLogic | Feature not in upstream | None on the model edit itself (`fbw_a320/test/fls_guidance_test.cpp` covers the shared FLS receiver only); `check-model-patches.sh` is its guard |
| `08-a380x-hsp-dive.patch` | A380X holds the 15 degree nose-down limit and VD in a full forward sidestick dive | `A380PitchNormalLaw.cpp`, `A380PrimComputerFctl_data.cpp` | Tuning from sim recordings | `fbw_a380/test/hsp_dive_response_test.cpp` |
| `09-a380x-elec-emer-direct-law.patch` | A380X direct law in ELEC EMER CONFIG (new PRIM discrete input `elec_emer_config`, all four AC busbars lost in flight) | `A380PrimComputerFctl.cpp`, `_types.h`/`_data.cpp` of Fctl, Fe, Fg, GeneralLogic | A380 FCOM, ELEC EMER CONFIG and flight control reconfiguration laws | `fbw_a380/test/elec_emer_direct_law_test.cpp` |

The patches apply in numeric order and must stay in that order: some files carry two features. A patch may only modify
files that exist in `BASE`; creating or deleting a model file is not supported by the check.

## Checking

`scripts/check-model-patches.sh` fails when the tree does not match the patch set:

- with the base commit in the clone (strong form): every touched file is rebuilt from `BASE` plus the patches and compared
  with the tree, and any `model/` file that differs from `BASE` (changed, deleted or untracked) without being in a patch is
  reported;
- without it, or without a reachable git repository (weak form): every patch must still reverse on the tree, last one first.
  The CI job refuses this form (`GITHUB_ACTIONS=true` makes the check fail instead), so it fetches `BASE` first.

`scripts/test-fbw-native.sh` runs that check and then the native tests of both modules (in the dev-env container:
`./scripts/dev-env/run.sh scripts/test-fbw-native.sh`). `selftest.sh` in this folder proves that the check catches a reverted
patch, an unrecorded edit, a deleted or new model file, an edit inside and outside the hunks of a recorded patch, and that the
weak form is refused in CI.

## After an upstream change of the model files

1. Merge upstream. The commit that holds the new, unedited `model/` files is the upstream commit: set `BASE` to it right away,
   before re-applying anything, so the check compares against the right files. The merge leaves the patched files either
   merged with our edits or in conflict, and `git apply --3way` needs the index to match the tree, so put the unedited files
   back first: `git checkout "$(cat scripts/model-patches/BASE)" -- fbw-a32nx/src/wasm/fbw_a320/src/model fbw-a380x/src/wasm/fbw_a380/src/model`.
2. Re-apply the patches in order on those files, stopping at the first one that does not apply cleanly:
   `for p in scripts/model-patches/*.patch; do git apply --3way "$p" || break; done`.
   The old `BASE` blobs are in the history, so the 3-way merge can place a hunk whose context moved; a conflict is left in the
   file as markers. Resolve it by hand, keeping the intent of the patch and the native test that guards it green, then
   continue with the next patch.
3. Re-record each patch as the difference between consecutive states (patch N is the diff from the files with patches 1..N-1
   applied to the files with 1..N applied).
4. Run `scripts/check-model-patches.sh` and the native tests.

New hand edits of the generated files are to be avoided; if one is unavoidable, add it as a new numbered patch.
