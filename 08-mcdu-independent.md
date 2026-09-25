# PR 8 - independent CPT and F/O MCDUs

- **Title:** `feat(a32nx/mcdu): make the CPT and F/O MCDUs independent`
- **Base:** `master` - **Branch:** `feature/a32nx-mcdu-independent` (built on `origin/master`, one branch for the whole feature)
- **Commits:** `5be670f87` (independent screens), `62f3f2917` (keyboard entry, remote MCDU, ATSU status)
- **Note on the second commit:** it changes `sendUpdate()` of the remote MCDU. On your local `master` that function has the debounced structure of the upstream
  PR that fixes the missing arrows (`4f25f245c`), which is not in `origin/master`, so the commit was ported to the old structure. If that upstream PR is merged
  before you open this one, rebase and resolve `A320_Neo_CDU_MainDisplay.ts` (the `sendUpdateToMcduServer` version of `master` is the right shape).
- **Labels to request:** `A32NX`, `MCDU`, `Remote MCDU` (for the SimBridge part), `Extensive Testing Needed`
- **Prerequisite:** a PR in `flybywiresim/aircraft-large-files` with the U change of the two screens in `A320_NEO_INTERIOR_LOD00.bin` (it is chunked:
  `.bin.part01`), merged first; then this PR bumps the `large-files` submodule pointer (the guide/AGENTS only allows that when the task concerns those assets,
  which it does).
- **Issue to open first:** *"CPT and F/O MCDUs show the same thing"* - "The two MCDU screens mirror each other (same page, same scratchpad) because there is
  one MCDU gauge on one texture. They should be independent, sharing the FMS data."
  (the stable release has the same behaviour, so it qualifies for the changelog)
- **CHANGELOG line:** `1. [A32NX/MCDU] Make the captain and first officer MCDUs independent, each with its own page, scratchpad and messages on the shared FMS data - @TCdr` - already added to `.github/CHANGELOG.md` in the commit of this PR

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

The two MCDU screens showed the same thing: there was one MCDU gauge on one texture and both screen meshes sampled all of it. This makes them independent
without running the FMS twice. `A320_Neo_CDU_MainDisplay` is the aircraft's FMS (flight plan, guidance, EFIS symbols) as well as the MCDU display, and only one
of it may exist. So both MCDUs are now two screens on that one FMS, the way the A380X does its two MFD screens (one gauge, one texture, both screens drawn into it):

- **Gauge and model:** the MCDU gauge is 2048x1024 and the two screen meshes each sample one half of it (the U of `SCREEN_MCDUL` runs 0..0.5, that of
  `SCREEN_MCDUR` 0.5..1). The CPT MCDU is drawn in the left half, the F/O MCDU in the right half. Only 4 UV values per LOD change (LOD01 in this repo,
  LOD00 in `aircraft-large-files`).
- **F/O screen:** a Proxy over the FMS instance. The fields that belong to one screen (page being shown, LSK callbacks, scratchpad, message queue, key
  handlers, DOM elements) are listed in `PER_SCREEN_KEYS` and the F/O screen has its own copy, everything else is forwarded to the FMS. Functions run with the
  proxy as `this`, so an entry made on the F/O MCDU puts its pages, scratchpad messages and dialogs on the F/O screen. The CPT screen stays the real instance
  with its code path unchanged. The 88 legacy pages are unchanged (they already take the MCDU through `LegacyFmsPageInterface`).
- **Keys and power:** the events of the F/O keys go to the F/O screen, checked against AC bus 2 (the CPT MCDU stays on AC ESS SHED).
- **Messages:** FMGC messages are queued on both screens and clearing one with CLR only clears it on that screen. What the FMS does by itself (request
  lights, PROG/PERF/IDENT page changes at a flight phase change, engine-out page request, INIT B to FUEL PRED) applies to every screen.
- **Keyboard entry, remote MCDU, ATSU:** the keyboard entry goes to the screen that was clicked and only one has it at a time (the pushed-key animation is
  on that MCDU only); the SimBridge remote MCDU shows the CPT screen on its left side and the F/O screen on its right side; ATSU system status that is not the
  answer to an entry is shown on the ATSU scratchpad of every MCDU.

Not changed (same as the CPT MCDU today): the MCDUs do not go back to the MENU page after a power loss.

## Cockpit API Changes

None. The MCDU key events (`H:A320_Neo_CDU_{1,2}_BTN_*`) are unchanged, the F/O ones now reach the F/O screen. `panel.cfg`: `VCockpit08` (MCDU) is 2048x1024.

## Screenshots (if necessary)

**TO ADD**: before (both MCDUs mirrored) and after (F-PLN on one, PERF on the other), same camera angle; the two scratchpads with different text.

## References

**TO ADD - ONLY the Honeywell Pegasus Step 1A (Rev 0), 2009 manual** (the template requires it for MCDU PRs): the pages showing that the two MCDUs have their
own display, page and scratchpad while sharing the FMGC data. Ask on Discord for the manual if you do not have it. The A380X `panel.cfg` comment on its MFD
texture is the precedent for the one-texture, two-screens technique.
(For the issue text, not the PR: A320 FCOM DSC-22_10-10 "Two MCDUs are installed on the pedestal for flight crew loading and display of data".)

## Additional context

A second gauge instance for the F/O MCDU (with template / PART_ID changes in the model behaviour XML) was tried and does not work in MSFS: the second gauge never
reached its screen and two of the behaviour changes blanked both screens. The one-texture approach avoids the screen routing question and needs no second FMS,
and because both screens share one FMS nothing has to be synchronised between gauges. An earlier upstream attempt at the same idea, flybywiresim/a32nx#5383,
was closed in 2022 (merge conflicts), its model change was never made; this PR makes it.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. CPT MCDU: MENU -> FMGC, INIT, F-PLN, PERF, PROG, DATA, typing and CLR, LSK entries, messages: exactly as before.
2. F/O MCDU shows the MCDU MENU and works by itself: put F-PLN on one MCDU and PERF on the other, they stay separate.
3. Scratchpads are independent (type on one, the other is unchanged).
4. FMS data is shared: an entry on one (flight plan, PERF values) shows on the other's page.
5. Messages: NOT ALLOWED / FORMAT ERROR appears only where you made the entry; FMGC queue messages (e.g. CHECK TAKE OFF DATA, ENTER DEST DATA) appear on both and
   CLR on one leaves the other.
6. BRT/DIM keys dim only their own screen. Remove AC 2: the F/O screen goes dark; the CPT stays on AC ESS SHED.
7. Keyboard entry (the MCDU keyboard input setting, `MCDU_KB_INPUT`): click the F/O screen, type in its scratchpad, then click the CPT screen: the keyboard moves and the
   key animations follow.
8. SimBridge remote MCDU: left and right show different content. ATSU: an ATIS request shows its status on the MCDU you used (and system status on both).

<!-- DO NOT DELETE THIS -->
## How to download the PR for QA

Every new commit to this PR will cause new A32NX and A380X artifacts to be created, built, and uploaded.

1. Make sure you are signed in to GitHub
1. Click on the **Checks** tab on the PR
1. On the left side, find and click on the **PR Build** tab
1. Click on either **flybywire-aircraft-a320-neo** or **flybywire-aircraft-a380-842** download link at the bottom of the page
