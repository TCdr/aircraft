# PR 30 - FIRE TEST warnings extended after the button release (flyPad option, both aircraft)

- **Title:** `feat(fire): option to extend the FIRE TEST after the button release`
- **Base:** `master` - **Branch:** `pr/30-fire-test-extension` (from the upstream master, independent)
- **Tip:** `088ef54e0` - own commits: A32NX `2180b3b98` `bc012b81d` `339adb87b` `62edf66ec` (originals `4c0619664` `4f92c0a6b`
  `d162c31b6` `54a915e6d` on develop, never in a PR before), A380X `6fd19fc3c` (original `d5eed3058` on
  `feature/a380x/fire-test-extend`, merged into `develop` 5d0b27f1b), docs `088ef54e0` (the fire test part of develop's `8d41ee50e`)
- **Labels to request:** `A32NX`, `A380X`, `EFB`, `QoL`
- **Issue to open first:** *"FIRE TEST: the warnings stop the instant the button is released, so the crew must hold it while
  checking the ECAM, the CRC and every FIRE and AGENT light"*
- **CHANGELOG line (in the branch):** `1. [A380X/FIRE] Option to extend the FIRE TEST warnings and lights for a few seconds after the button is released - @TCdr`
  (the A32NX commits predate the CHANGELOG lines of this work: add an `[A32NX/FWC]` line when opening)
- **Before opening - TO DO:** the A380X in-sim test (the A32NX part is user-tested since 2026-09-17).

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

A flyPad Settings > Realism option, "Extend Fire Test Warnings After Button Release" (marked unrealistic, on by default): the FIRE
TEST goes on for 7 s after the test button is released, so the crew can check the warnings and the lights without holding it.
Off, the test stops on release as on the aircraft.

- **A32NX:** the FWC keeps the APU / ENG 1 / ENG 2 FIRE TEST active 7 s after release (monostables written every tick, so no
  falling edge is missed while the option is off), which keeps the CRC, MASTER WARN, the ECAM and the FIRE pb lights; the AGENT /
  SQUIB DISCH lights read the same extended signal (`L:A32NX_FWC_FIRE_TEST_{ENG1|ENG2|APU}_ACTIVE`). Also fixes a short-circuit
  that dropped the APU FIRE TEST.
- **A380X:** the fire protection system (Rust) extends the FIRE TEST pb signal by 7 s before its 500 ms test delay, so the fire
  detection zones, the FIRE lights, the squib lights and the FWS warnings all stay on together. The systems host passes the option
  (`L:A32NX_FIRE_TEST_EXTEND`); the FWS reads the extended test (`L:A32NX_FIRE_TEST_ACTIVE`) where it read the pushbutton.
- 2 Rust tests (`fire_and_smoke_protection.rs`: the test stops on release without the option, lasts 7 s with it).

## Cockpit API Changes

- A32NX: `L:A32NX_FWC_FIRE_TEST_{ENG1|ENG2|APU}_ACTIVE` (documented in `a320-simvars.md`).
- A380X: `L:A32NX_FIRE_TEST_EXTEND`, `L:A32NX_FIRE_TEST_ACTIVE` (documented in `a380-simvars.md`).

## Screenshots (if necessary)

**TO ADD**: the flyPad Realism option.

## References

Not an aircraft behaviour: a realism option for the simulator, like the other unrealistic flyPad options.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. flyPad Settings > Realism: "Extend Fire Test Warnings After Button Release" on.
2. A32NX: press and release ENG 1 FIRE TEST: the CRC, MASTER WARN, ECAM, FIRE pb and AGENT lights stay 7 s, together.
3. A380X: press and release FIRE TEST on the overhead: FIRE and squib lights and the FWS warnings stay 7 s, together.
4. Option off: everything stops on release, on both aircraft.
5. `cargo test -p a380_systems fire_and_smoke`.

<!-- DO NOT DELETE THIS -->
