# Upstream PR drafts (flybywiresim/aircraft, base branch `master`)

_Last updated 2026-09-25 (local master `50db576cc`, 89 ahead; upstream `origin/master` still `2baa2b35e`; `master` and the 9 branches are on
the fork https://github.com/TCdr/aircraft, no PR opened). The assistant's own notes on the same
state live in its memory files `project_fbw_pr_readiness.md`, `project_fbw_wx_radar.md` and `project_fbw_terrain_on_nd.md`; this README is
the human-readable copy and is kept in step with them._

Drafts of the PR descriptions for our features, written against `.github/PULL_REQUEST_TEMPLATE.md`, with the labels picked from the
113 labels that exist on the repository (read from the GitHub API on 2026-09-21). Nothing here has been sent to GitHub.

The branches exist in the local repo (`E:\MSFS2024 mods\repos\fbw`), one branch per feature, built on `origin/master` (2baa2b35e, the
version the installer delivered on 2026-09-21) from the commits of the local `master` (tip `38bc26241`, 75 commits ahead). On 2026-09-25 `master` and the 9 branches were pushed to the fork `TCdr/aircraft`; no PR is open.
The tree and the table below are the CURRENT state (2026-09-23 evening); the dated sections at the end are the log of how it got there.

Each file is one PR: title, branch, labels, the issue to open first, the CHANGELOG line, and the body to paste into
the template. Anything marked **TO ADD** is something only you can supply (a real-life reference, screenshots, your Discord name).
I did not invent references.

## The branches

```
origin/master (2baa2b35e)
 |- feature/a32nx-nd-weather-radar          PR 1  5b8a3604d  (5 commits)
 |   '- feature/a380x-nd-weather-radar      PR 2  416a0f316  (+5)   needs PR 1 (same ndwxr/main.cpp)
 |       '- feature/nd-terrain              PR 4  acffe345b  (+4)   needs PR 2 (its A380X code sits in the same file)
 |           '- feature/nd-wxr-mode-label   PR 3  a5ecd08cf  (+1)   needs PR 4 (the label code is written next to the terrain code)
 |               '- feature/nd-manuals-pass PR 9  ddca9fe22  (+15)  needs PR 3 (edits the radar module across radar, terrain and VD; cannot be split lower)
 |- feature/a380x-surv-panel                PR 5  a1c0afd4b  (3 commits, independent)
 |   '- feature/a380x-checklists-surv       PR 6  14e842d8f  (+3)   needs PR 5 (LVars)
 |- fix/tcas-ta-only-intruder-level         PR 7  2518ca61e  (4 commits, independent)
 '- feature/a32nx-mcdu-independent          PR 8  62f3f2917  (2 commits, independent, one PR for the whole feature)
```

| # | File | Branch | Title (semantic) | Aircraft | Own commits |
|---|------|--------|------------------|----------|-------------|
| 1 | `01-wx-radar-a32nx.md` | `feature/a32nx-nd-weather-radar` | `feat(a32nx/nd): add a native weather radar to the ND` | A32NX | `e8933f6d5` `8b240be76` `33b9c6f3f` `b52c8dace` `5b8a3604d` |
| 2 | `02-wx-radar-a380x-vd.md` | `feature/a380x-nd-weather-radar` | `feat(a380x/nd): add the native weather radar to the ND and the weather to the VD` | A380X | `ede2b4247` `774ff9187` `6d86300ab` `0efbbef25` `416a0f316` |
| 3 | `03-wx-mode-label.md` | `feature/nd-wxr-mode-label` | `feat(nd): show the weather radar mode on the ND` | both | `a5ecd08cf` |
| 4 | `04-terrain-on-nd.md` | `feature/nd-terrain` | `feat(nd): add the native TERR ON ND and the A380X VD terrain profile` | both | `e0e1d718d` `ac5ad3aef` `89f956037` `acffe345b` |
| 5 | `05-a380x-surv.md` | `feature/a380x-surv-panel` | `feat(a380x): make the SURV controls, STATUS & SWITCHING and the pedestal SURV panel work` | A380X | `d263c6b12` `b6877383f` `a1c0afd4b` |
| 6 | `06-a380x-checklists.md` | `feature/a380x-checklists-surv` | `feat(a380x/fws): sense the WXR & TAWS and XPDR & TCAS lines of the ECAM procedures` | A380X | `4e24d18d6` `48b83c0ba` `14e842d8f` |
| 7 | `07-tcas-ta-only.md` | `fix/tcas-ta-only-intruder-level` | `fix(tcas): show and count RA-level intruders as TAs while RAs are inhibited` | both | `56d5d656c` `4a5fb1c4e` `c42cef6cc` `2518ca61e` |
| 8 | `08-mcdu-independent.md` | `feature/a32nx-mcdu-independent` | `feat(a32nx/mcdu): make the CPT and F/O MCDUs independent` | A32NX | `5be670f87` `62f3f2917` |
| 9 | `09-a380x-vd-cut.md` | `feature/nd-manuals-pass` | `feat(nd): follow the A380 and A320 manuals for the weather radar, the terrain and the VD` | both | `e0d8756a5` `e32c0041f` `ee739e25a` `96c1ffcf2` `150ad4a81` `9aebfc062` `0910bfdc6` `76b4d1afe` `43a6899f1` `61a348d92` `d7747b040` `75dc1f8de` `333f17e91` `a5fcb23f3` `ddca9fe22` |

| 10 | `10-a380x-mfd-fcom-pages.md` | `feature/a380/mcdu-improvements` | `feat(a380x/mfd): lay out and complete the MFD FMS and SURV pages per the A380 FCOM` | A380X | 8 commits on PR 6, tip `a09803fa8` |
| 11 | `11-a380-takeoff-calculator.md` | `feature/a380/efb/take-off-calculator` | `feat(a380x/efb): A380 takeoff calculator with company T.O data to the FMS` | A380X | `c16e6e877` (on PR 10) |
| 12 | `12-a320-takeoff-calculator.md` | `feature/a32nx/efb/take-off-calculator` | `feat(a32nx/efb): A320 takeoff calculator with the MCDU uplink takeoff data` | A32NX | `b25f790a2` (on PR 11) |
| 13 | `13-pilot-stored-elements-persistence.md` | `feature/a380/mfd/pilot-stored-elements-persistence` | `feat(a380x/mfd): keep the pilot stored elements across sim sessions (flypad setting)` | A380X | `7636abc1c` |
| 14 | `14-direct-to-options.md` | `feature/a380/mfd/direct-to-options` | `feat(a380x/mfd): DIRECT TO with ABEAM points, CRS IN and CRS OUT` | A380X | `f98743703` |
| 15 | `15-fuel-jettison.md` | `feature/a380/fuel-jettison` | `feat(a380x): fuel jettison with JTSN GW, ECAM memo and procedures` | A380X | `b04a3851d` |
| 16 | `16-kccu-keyboard-entry.md` | `fix/a380/mfd/kccu-keyboard-entry` | `fix(a380x/mfd): KCCU keyboard entries validated with ENT, ESC cancels the edition` | A380X | `b45746fa7` `6d571974b` |
| 17 | `17-ecam-procedures.md` | `feature/a380/fws/abn-proc-procedures` | `feat(a380x/fws): ECAM procedures from the A380 FCOM for the ABN PROC and the sensed alerts` | A380X | `00b3a980d` |

PRs 10 to 17 were added on 2026-09-26; 13 to 17 are built on `master` 280800cf7, not on upstream, so rebase them on the upstream `master`
before opening. The PDF documents of every PR (specification, architecture diagram, FCOM rules, and the PR body below from "Summary of
Changes") are in `docs/`; `docs/FBW-features-handbook.pdf` has them all. Release: `master` tagged `v2024.2.0`, `develop` at 2024.3.0-SNAPSHOT.

**`pr-docs/` on every feature branch (2026-09-26):** each of the 17 branches ends with one commit
`docs: PR draft and feature document (NN ...)` that adds `pr-docs/NN-<draft>.md` and `pr-docs/NN-<document>.pdf` (the files of this
folder). The names are numbered so stacked branches never conflict; a stacked branch holds only its own two files. Drop that commit (or
`git rm -r pr-docs`) before opening the upstream PR, so the PR diff has no documentation files. Branch tips with that commit:

| # | Branch | Tip | # | Branch | Tip |
|---|--------|-----|---|--------|-----|
| 1 | `feature/a32nx-nd-weather-radar` | `e4f003fc9` | 10 | `feature/a380/mcdu-improvements` | `d219f2bf0` |
| 2 | `feature/a380x-nd-weather-radar` | `4b3ca7d34` | 11 | `feature/a380/efb/take-off-calculator` | `7860c45f5` |
| 3 | `feature/nd-wxr-mode-label` | `c9b2acbb5` | 12 | `feature/a32nx/efb/take-off-calculator` | `de64480ca` |
| 4 | `feature/nd-terrain` | `6cad08e0e` | 13 | `feature/a380/mfd/pilot-stored-elements-persistence` | `095bf1a96` |
| 5 | `feature/a380x-surv-panel` | `78513c94c` | 14 | `feature/a380/mfd/direct-to-options` | `b4092e405` |
| 6 | `feature/a380x-checklists-surv` | `9cf2fedf9` | 15 | `feature/a380/fuel-jettison` | `5bfedb567` |
| 7 | `fix/tcas-ta-only-intruder-level` | `fdec75a5f` | 16 | `fix/a380/mfd/kccu-keyboard-entry` | `72b0963c9` |
| 8 | `feature/a32nx-mcdu-independent` | `7b50734d5` | 17 | `feature/a380/fws/abn-proc-procedures` | `eba2c99ce` |
| 9 | `feature/nd-manuals-pass` | `b895de2d9` | | | |

This folder is also on the branch `docs/pr-drafts` of the fork (no shared history with the code).

A stacked branch contains the commits of the ones below it, so its PR shows them too until those are merged: open PR 1 first, then PR 2 once
PR 1 is merged (rebase on the new `master`), and so on up to PR 9. PRs 5, 7 and 8 can be opened at any time.

## Current state (2026-09-24 morning) - what is verified and what is left

- **Verified:** the PR 9 tip is identical to `master` on `fbw-common/src/wasm/ndwxr` (now nine files, see the quality pass at the end), the common
  ND, the SimBridge client and both systems hosts; PR 6 matches `master` on the FWS file, PR 7 on the TCAS files and the A32NX ND stylesheet
  (the remaining branch-vs-master differences are `master`-only commits that were never part of a PR). At the PR 4, PR 3 and PR 9 tips the
  `ndwxr` build passes for both aircraft and `tsc --noEmit` passes for the A32NX and A380X ND and systems-host projects (2026-09-23); the
  standalone refactor commit of the split compiles on its own; ESLint, Prettier and tsc are clean on every TypeScript file the branches touch.
  The build you fly is `master`'s (both `ndwxr.wasm`, the systems hosts, the A32NX ATC bundle and the A32NX ND stylesheet deployed 2026-09-24);
  in-sim you confirmed the peaks box, the clean A380X weather on the ground, the VD water, the picture bottom, the A380 WXR messages and the
  centred TA ONLY.
- **Standing rule since 2026-09-24:** every change is checked against the manuals first (A320 / A380 FCOM and FCTM, or the vendor's document
  when the FCOM is silent) and the code comment names the page. The searchable texts and extracted figures live in `E:/MSFS2024 mods/references/manuals`.
- **Checked against the manuals and left alone:** the VD range in ROSE NAV is half the selected range on purpose (A380 FCOM DSC-31-20-40-10);
  the A380 EFIS should step the ND range up when switching ARC -> ROSE so the distance ahead stays the same (DSC-31-20-50), which the FBW EFIS
  control code does not do - outside our PRs, only noted.
- **Left for you:** in-sim tests of the branch builds themselves (only `master`'s build was flown); clang-format on the C++ (not installed here);
  the issues, screenshots, references and Discord name marked **TO ADD** in each draft; the `aircraft-large-files` companion PR + submodule bump for
  PR 8; a rebase on upstream `master` before opening if it has moved (checked 2026-09-23 evening: `origin/master` is still 2baa2b35e, the base of
  every branch); decide whether PR 4 should also drop the `terronnd` build task (the wasm is still built but no longer instantiated).
- **Small things noticed, not done:** the shared `TcasWxrMessages.tsx` has a right-hand message slot that nothing ever sets (dead code upstream
  could drop); the A380's manual GAIN / ELEVN / TILT values and its stand-alone TURB alert message are not modelled (SURV knobs unwired, no radar
  readback).
- **Not possible:** splitting PR 9's radar-module commits into PRs 1, 2 and 4 (tried, seven conflict blocks); PR 9 stays the chain-top PR.
- **Rules kept throughout:** nothing pushed; `.env` files, `FwsAutoCallouts.ts`, `.idea/` and the `large-files` submodule are in no commit; the APU
  interior sound is out of the history.
- **History note:** the old mixed commit (radar colours + A380X SURV controls + VD weather) was split: the colours are in PR 1 (`5b8a3604d`), the
  A380X radar following the SURV controls and the VD weather are in PR 2 (`6d86300ab`).

## A380X MFD FCOM pages (COMMITTED on `master` 2026-09-25, not in a branch yet)

- `28acbb26f` feat(a380x/mfd): FMS pages laid out and completed per the A380 FCOM (105 files: every MFD FMS page on its FCOM figure,
  the missing FCOM pages and functions, the FCOM data entry formats DSC-22-FMS-20-100, centred fields, menus above the page).
- `ecdfe182c` feat(a380x/mfd): SURV pages laid out and wired per the A380 FCOM (CONTROLS and STATUS & SWITCHING on DSC-34-20-60-50
  P 4 / P 6, XPDR AUTO/ON/STBY, the TCAS / WXR option rules, ELEVN/TILT and GAIN entry fields, confirmations; 4 new documented LVars).
- Not yet in any PR branch, no draft yet. Built and checked (tsc MFD / systems-host / ND / OIT, ESLint, Prettier, MFD build) and compared
  page by page with the FCOM figures in a local browser harness; NOT flown in the sim yet. The new WXR LVars are not read by the radar
  (the ND GAIN / ELEVN / TILT messages are still not modelled).

## Conflicts to expect between the PRs

Tested by merging all eight tips onto `origin/master`; everything else merges cleanly:

- `.github/CHANGELOG.md`: every PR appends its line at the end of the current release list, so the second and later PRs conflict there (keep both lines).
- `fbw-a380x/docs/a380-simvars.md`: PR 3 and PR 5 both create the "Surveillance ATA 34" heading and its table-of-contents entry (PR 3 for
  `A32NX_WXR_ND_{side}_MODE`, PR 5 for the `A380X_WXR_*` / `A380X_TCAS_*` LVars). Whichever comes second keeps one heading and both sets of entries.

Not a conflict but worth knowing: PR 8's second commit was ported to the `sendUpdate()` of `origin/master` (see its file); your local `master` has the
debounced version from the upstream remote-MCDU-arrows PR.

## What was checked on each branch

These checks were run on the branches before they were rebased onto 2baa2b35e (installer update of 2026-09-21). The rebase only brought in the 4 upstream commits
(A380X `FwsCore.ts`, `LightSync.ts`, a locPak and the CHANGELOG), which touch none of our source files, and each rebased tip was verified to differ from its old tip
by exactly that upstream delta; the checks were not re-run.

- Commit titles are Conventional Commits and every commit carries the co-author trailer; no `.env`, `large-files`, `FwsAutoCallouts.ts`, audio or lockfile in any of them.
- `ndwxr` compiled (clang, the `build.sh` of the module) for the A32NX and the A380X at the tip of PR 1, 2, 4 and 3. At the tip of the chain the whole `ndwxr` folder is identical to your `master`.
- `tsc --noEmit` and `tsc-strict` on every TS project the branches touch: MCDU (PR 8), the A380X MFD / ND / systems-host (PR 5, 6, 3), the A32NX and common ND (PR 3), the A32NX TCAS and the A380X systems-host (PR 7).
  One pre-existing `tsc-strict` error on `origin/master` in `MsfsAvionicsCommon/displayUnit.tsx` (untouched file) shows in the A380X projects that include it.
- Prettier and ESLint on the PR 8 files (the only place with hand-merged TS).
- Every feature file of the eight branches is identical to your `master` except six files where other commits of yours (perf/fix work and cherry-picked upstream PRs) also
  changed the same file: atsu `index.ts`, the four MCDU legacy files, `TcasComputer.ts` and `ND.tsx`.
- Not done: no in-sim test of the branches themselves, no clang-format (not installed), no full igniter build of each branch.

## Labels

Available and used (all exist on the repo):

- `MSFS2024` - added automatically by `pr-labels.yml` for a PR against `master`, do not add it by hand.
- `A32NX`, `A380X` - the aircraft ("Related to the ...").
- `ND` (Navigation Display), `MFD`, `VD` (Vertical Display, A380X only), `MCDU`, `Remote MCDU`, `FWS` (Flight Warning, ata-31),
  `ECAM`, `GPWS` (ata-34-surv-40, the terrain/EGPWS system) - the area.
- `QA A380 Only` - "QA only for A380 required" (A380X-only PRs).
- `QA MSFS 2024 Only` - only where the change cannot exist on MSFS 2020 (the native MapView gauges: PRs 1-4).
- `Extensive Testing Needed` - "More testing needed in this PR": PRs 1, 4 and 8 (large, simulator-coupled).

Considered and left out: `Request`/`Bug` (issue labels, the issue template applies `Request` to the issue), `Needs Changelog`
(we add the entry), `Needs Reference` and `True to Life` (a maintainer decision), `Localazy Keys Needed` (no new language
strings), `Sim Limitation` (would be for an issue about the peaks box), the `QA ...`/`Tested`/`Accuracy ...` labels (applied by
QA and the QA comment bot), `pr-build-8k`, `Not Ready For Review`/`Do Not Merge`.

Note: labels can only be set by people with triage/write access. As a fork contributor you will probably not be able to add
them yourself, only `MSFS2024` appears by itself. Ask in the PR or in the Discord `#dev-support` channel for the labels
listed in each file (the template has no labels section).

## Before opening any of them (from `.github/Contributing.md` and `AGENTS.md`)

- Open an issue first (feature request template, it applies the `Request` label) and put its number in `Fixes #...`.
- The fork is https://github.com/TCdr/aircraft and every branch below is on it: open each PR from its branch there against `master`.
- CHANGELOG line of each PR: already added (with `@TCdr`) at the end of the current release list, in the commit of its PR. The guide only wants an entry when
  the effect is a difference from the previous stable release: the new features (radar, terrain, SURV, MCDU, mode label) qualify; check it for PR 6 (checklists) and PR 7 (TCAS,
  only if the bug is in the stable release).
- New LVars: already documented in `fbw-a32nx/docs/a320-simvars.md` (Weather Radar ATA 34) and `fbw-a380x/docs/a380-simvars.md` (Surveillance ATA 34), in the commits of PRs 3 and 5.
- Before/after screenshots and real-life references (MCDU PR: ONLY the Honeywell Pegasus Step 1A Rev 0, 2009 manual).
- Rebase the branch on the current upstream `master` before opening it (the branches are on the `origin/master` of 2baa2b35e).

## Reference material now available (2026-09-21)

- A380 FCOM (KAL fleet, 2011): `C:/Users/trist/Downloads/airbus-a380-fcom_compress.pdf` (7156 pages, searchable text). VD chapter DSC-31-20-40-10 = PDF pages
  2365-2394 (vertical cut along the flight plan / track / azimuth, cut widths, vertical scale = 4 deg diagonal, aircraft reference = baro altitude, safety
  altitudes, terrain profile placed by TRUE height under the mock-up, weather on the VD without magenta, VD messages); TAWS VD page 3159-3160 (terrain brown,
  water blue, RA amber zone below 5000 ft); WXR VD page 3195-3196. Use these for the References sections of PR 2, 4 and 5 and for the SURV pages of PR 5 / 6
  (SURV chapter is DSC-34, not read yet).
- Real A380 photo at FL400 with the VD: `E:/MSFS2024 mods/references/real-a380-pfd-nd-vd-fl400.webp` (ground at the bottom of the VD, aircraft at ~75 %
  of the height, MORA label) - reference for the VD vertical range and the terrain/MORA look.
- A380 FCOM WXR pages (DSC-34-20-30, photographed 2026-09-22, the pages ARE in the PDF's text after all: WXR chapter DSC-34-20-30-10/-20 at text lines ~89300-90400, incl. the ND "WXR MESSAGES" list p. 17/24): DISPLAY MODES AND FUNCTIONS (AUTO on-path / off-path envelope
  figure), OPERATIONAL RECOMMENDATIONS (30 s buffer fill, TURB, gain, MAP), ELEVN/TILT, AZIM, GAIN, TURB, PWS - references for PR 2 and PR 5.
- A320 FCOM (2019, PK-L fleet, Collins Multiscan and RDR-4000 variants): `C:/Users/trist/Downloads/fcom-a320-flight-crew-operationg-manual-a320-iss-20190215-pdf_compress.pdf`.
  Weather radar DSC-34-SURV-30-10..30 (control panel, ND indications, on-path envelope of the RDR-4000 variant), ND indications DSC-31-45 (weather radar,
  GPWS terrain picture, TERR ON ND), GPWS DSC-34-SURV-40, TCAS DSC-34-SURV-60-10-10 (TA ONLY), FMGS DSC-22_10-10 (two MCDUs) - references for PRs 1, 3, 4, 7, 8.
- A320 FCTM (`airbus-a320-flight-crew-training-manual_compress.pdf`): Supplementary information 04.006 "Use of radar" (tilt, gain, modes, radar on the ground) - PR 1.
- A380 FCTM (`a380-fctm_compress.pdf`, scanned, no text layer; page images in `E:/MSFS2024 mods/references/manuals/a380_fctm_pages/`): SI TCAS (inhibition altitudes 900/1100 and 400/600 ft AGL,
  page 345), SI-70 Safety altitude and terrain / vertical trajectory / terrain on the VD (pages 353-359) - references for PR 7 and PR 9.

- **Durable copies (2026-09-24):** `E:/MSFS2024 mods/references/manuals/` holds the extracted texts of the A320 FCOM and FCTM, the A380 FCOM and the
  Airbus Safety First radar article, the 63 A380 FCTM page images, and `figures/` with the A320 TCAS ND indications figures (DSC-34-SURV-60-20,
  PDF pages 1588 / 1590: traffic symbols; TA ONLY at the bottom centre). Vendor sources used for the radar sweeps: Honeywell's IntuVue RDR-4000
  white paper (160 deg, +-80) and Avionics International, "Product Focus: Weather Radar", 2002 (RDR-4B 180 deg).

## (log, done) Follow-up commits on `master` from the review of 2026-09-21 - all placed in branches on 2026-09-23

Three commits sit on `master` after the branch tips and belong in the PRs; cherry-pick them onto the branches before opening (nothing else on `master` is missing from them):

- `59d1c371d` chore(nd): eight gauge slots in the ndwxr module -> PR 1 (`feature/a32nx-nd-weather-radar`).
- `46460d963` feat(nd): weather radar on the ROSE ILS / VOR pages too -> its `ndwxr/main.cpp` part is PR 1, its `WxrModeLabel.tsx` + docs part is PR 3
  (`feature/nd-wxr-mode-label`); split it with `git cherry-pick -n` + staging by file. Then update the PR 1 and PR 3 bodies: the display is on all map
  pages (ROSE ILS / VOR / NAV and ARC), not only ARC and ROSE NAV, and testing step 3 of PR 1 changes accordingly.
- `ce8bb654e` fix(nd): A380X VD weather on the ADR baro-corrected altitude -> PR 2 (`feature/a380x-nd-weather-radar`); it adds reads of
  `L:A32NX_AIR_DATA_SWITCHING_KNOB` and `L:A32NX_ADIRS_ADR_{1,2,3}_BARO_CORRECTED_ALTITUDE_{1,2}` to the Cockpit API section of PR 2.

## (log) Work of 2026-09-22: the FCOM/FCTM pass - committed on `master` 2026-09-22/23 and in PR 9 (plus the off-path removal noted inline)

The A380 FCOM WXR pages you photographed and the three manuals you added (A380 FCTM, A320 FCOM 2019, A320 FCTM; text extracted to the
scratchpad, the A380 FCTM is scanned and was read page by page for SI TCAS and SI-70 VD) were checked against everything in the eight PRs.
What changed, with the PR each change belongs to:

- **PR 1 (A32NX radar) and PR 2:** the radar now works on the ground (A320 FCOM DSC-34-SURV-30-30 "on the ground, the radar is scanning when the
  flight crew sets one radar to ON and selects a display mode", A320 FCTM "Use of radar / Taxi"); the ground inhibit and its LGCIU reads are gone.
  MAP mode is a ground map from the terrain view: "black indicates water, green indicates the ground, and amber indicates cities and mountains"
  (A320 FCOM, display mode selector; cities are not in the sim's data). The `WeatherPass` pipeline got channel selection, a hatch pass and a sweep sector.
- **PR 2 (A380X radar + VD):** AUTO mode on-path / off-path display (A380 FCOM DSC-34-20-30 WX display function: off-path weather "with reduced intensity and
  black parallel lines", no discrimination beyond 160 NM): a third MapView per ND in the engine's TOP VIEW mode; the 8-view budget was paid by the VD
  terrain gauge dropping its water view (water is now entry 0 of the terrain list, drawn blue as the FCOM says). **REMOVED again on 2026-09-23 (`57599288f`
  on master): the top-view MapView corrupted the beam views, see the section at the end.** VD weather along the zero-width vertical
  cut (same cut as the terrain, beam-width sampling instead of the 10 deg wedge). 30 s buffer fill after the
  radar starts transmitting (FCOM operational recommendations), shown as one slow sweep on both NDs and delaying the VD until the sweep passed the cut.
- **PR 3 (mode label):** "WXR OFF" in white while the A32NX radar is switched off (A320 FCOM ND radar indications, "WXR OFF (only in white)"); mode 5 of
  `A32NX_WXR_ND_{side}_MODE`, docs updated.
- **PR 4 (terrain):** the terrain's reference altitude looks 30 s ahead when descending faster than 1 000 ft/min (A320 FCOM DSC-31-45 GPWS terrain picture),
  by shifting the altitude-view range with the IR vertical speed word.
- **PR 6 (checklists):** the four normal-checklist lines (SURV ON, WX & TERR AS RQRD x2, WX & TERR OFF, TCAS OFF) are REMOVED again: the A380 FCOM normal
  checklists (PRO-NOR-C-L) have none of them (the radar/terrain/TCAS items are SOP flow items: "MFD SURV default settings", "WX pb / TERR pb AS RQRD",
  "WX pb CHECK OFF"). The ECAM CABIN CREW line of LINE-UP stays (FCOM BEFORE TAKEOFF C/L has it). The PR is now only the ECAM procedure sensing; its
  draft, title and CHANGELOG line were rewritten.
- **PR 7 (TCAS):** the low-altitude inhibitions now have the real hysteresis: RAs inhibited below 900 ft AGL in descent and 1 100 ft in climb (A380 FCTM SI
  TCAS; FCOM "below 1 000 ft +-100 ft"), the TA aural below 400 / 600 ft (was 1 000 / 500 ft without hysteresis), both TCAS computers.
- **PR 9 (new, `09-a380x-vd-cut.md`):** the VD vertical cut along the flight plan, the FCOM scale origin rule and the terrain by true height (the work
  of 2026-09-21 evening), now confirmed by the A380 FCTM SI-70 ("the height of the aircraft above the terrain displayed on the VD is geometrically correct
  and does not vary with the altimeter setting"; MORA/MSA "along the F-PLN in NAV mode, or along the track in HDG/TRACK mode").
- Checked and found consistent, no change: TA ONLY converts every RA into a TA (both FCOMs, the PR 7 fix); TA TAU 20 s in TA ONLY (sensitivity level 2 already);
  turbulence within 40 NM; weather on all ROSE pages and ARC, not PLAN; terrain replaces the weather; TERR SYS OFF / WX ON VD behaviour; the MCDU: "Two MCDUs
  are installed on the pedestal for flight crew loading and display of data" (A320 FCOM DSC-22_10-10) is the reference line for PR 8.
- Not implementable from the manuals (no data in MSFS's radar, or the SURV panel knobs are not wired): the on-path envelope limits (+-4 000 ft, 25 000 / 10 000 ft
  boundaries), ELEVN / TILT / manual GAIN / AZIM (30 s auto-return), PWS, the A320's HZD mode, PAC alert, MAN GAIN and tilt rows, radar failure messages,
  the terrain sweep from the centre, peaks mode, automatic TA ONLY on windshear / stall (no FWS LVars for those warnings).

Suggested commits (in this order, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`): fix(a380x/vd) scale rule; feat(a380x/vd) cut along the
flight plan (bridge + wasm + docs); fix(nd) VD terrain by true height, blue water, no magenta, weather needs TERR; feat(a380x/nd) on-path / off-path and
the 30 s buffer fill; feat(nd) radar on the ground + MAP mode + WXR OFF label + terrain look-ahead; fix(tcas) low-altitude inhibition hysteresis;
revert(a380x/fws) the normal-checklist surveillance lines.

## Things to know before you open them

- PR 7 (TCAS): the commit says "Not verified in-sim yet". Test a TA ONLY scenario first or say so in the PR.
- PR 8 (MCDU): the keyboard / remote MCDU / ATSU part (`62f3f2917`) was committed without you reporting a test of it. The LOD00 model change must be made
  in `flybywiresim/aircraft-large-files` first, then the submodule pointer bumped in the MCDU PR (not done, `large-files` is not in any branch).
- Terrain (PR 4): the stock `terronnd` gauge is no longer instantiated (removed from both `panel.cfg`), so there is one terrain layer; the TERR
  peaks box figures come from SimBridge over SimConnect (PR 9's `43a6899f1`), the box stays empty without SimBridge.
- Weather (PR 2 / PR 9): the A380's AUTO-mode off-path display is not modelled (tried and removed, see the last section); both aircraft show the
  same picture.

## (log) Branches updated 2026-09-23 early (everything on `master` up to `1b08d3ee7` was in a branch then)

(Log entry; the tree at the top of this file is the current one.) The chain became five deep here: the work of 2026-09-22/23 in `ndwxr/main.cpp` (the manuals pass,
the VD cut, the real-display look, peaks mode) is entangled across the radar, terrain and VD code and could not be split back into the
lower branches (a trial cherry-pick of the smallest of those commits onto PR 1 produced seven conflict blocks against A380X code PR 1 does
not have), so it sits in one new branch on top of the chain, **PR 9**. Only the commits that applied cleanly went to the branch they belong to.

```
origin/master (2baa2b35e)
 |- feature/a32nx-nd-weather-radar          PR 1  5b8a3604d  (5 commits, unchanged)
 |   '- feature/a380x-nd-weather-radar      PR 2  416a0f316  (+5)  + chore(nd) eight gauge slots (416a0f316)
 |       '- feature/nd-terrain              PR 4  89f956037  (+3)  terronnd retired + A32NX status poster (89f956037); the HTTP peaks box commit is GONE (see the end)
 |           '- feature/nd-wxr-mode-label   PR 3  a5ecd08cf  (+1, rebased)
 |               '- feature/nd-manuals-pass PR 9  43a6899f1  (+9)  e0d8756a5 ROSE ILS/VOR pages, e32c0041f VD baro altitude, ee739e25a VD scale rule,
 |                                                                  96c1ffcf2 VD cut LVars, 150ad4a81 the manuals pass, 9aebfc062 WXR OFF label, 0910bfdc6 peaks mode + look + VD height fix,
 |                                                                  76b4d1afe off-path layer dropped, 43a6899f1 peaks box from SimBridge over SimConnect,
 |                                                                  61a348d92 VD water in the ND's colour (PR 9 tip)
 |- feature/a380x-surv-panel                PR 5  a1c0afd4b  (3 commits, unchanged)
 |   '- feature/a380x-checklists-surv       PR 6  48b83c0ba  (+2)  4e24d18d6 ECAM sensing, 48b83c0ba CABIN CREW line (the checklist commit and its revert squashed into one)
 |- fix/tcas-ta-only-intruder-level         PR 7  4a5fb1c4e  (2 commits)  + f99f61af7 -> 4a5fb1c4e low-altitude inhibition hysteresis
 '- feature/a32nx-mcdu-independent          PR 8  62f3f2917  (2 commits, unchanged)
```

Verified: the PR 9 tip is identical to `master` on `ndwxr/main.cpp` and on every file of the new work (the only differences are the unrelated
`master` commits that were never part of a PR: the ROSE ILS/VOR smoothing, PseudoFWC, the SURV branch's VD messages and LVar docs, the MCDU
panel.cfg hunks); the PR 6 branch is identical to `master` on the checklist files; the PR 7 branch differs from `master` only by the audit-era
TCAS perf/fix commits. `tsc --noEmit` passes for the A32NX and A380X ND and systems-host projects at the PR 9 tip; `ndwxr` builds for both
aircraft at the PR 2, PR 4, PR 3 and PR 9 tips. Not done: in-sim tests of the branches, clang-format. The commit lists are in the scratchpad
file `branches_2026-09-23.txt`.

Consequences for the drafts: PR 9 (`09-a380x-vd-cut.md`) is now the manuals-pass PR (title, branch and commits at its top); PR 4 gains the
peaks box and the terronnd retirement (its body already describes them); PR 6 is two commits, the ECAM sensing and the CABIN CREW line; the
review follow-ups of 2026-09-21 (`59d1c371d` -> PR 2, `46460d963` and `ce8bb654e` -> PR 9) are placed, so the "Follow-up commits" section
above is done. The PR 1 and PR 3 bodies still say "ARC and ROSE NAV" until PR 9; say so in PR 9.

## (log) Branches updated again 2026-09-23 evening (everything on `master` up to `38bc26241` is in a branch; the tree at the top is this state)

What happened on `master` after `1b08d3ee7`: `ced1cac5d` reverted the HTTP peaks box poller (`TerrainThresholdsProvider` and the SimBridge client
additions: SimBridge's HTTP thresholds endpoint stays empty while it is connected to the sim), `57599288f` dropped the A380X off-path weather layer,
`f18964160` added the TERR peaks box figures over SimConnect (`ndwxr` writes SimBridge's aircraft status block and subscribes to its threshold areas,
in terronnd's place). On the branches: PR 4 was rebased WITHOUT its HTTP peaks box commit (`f9b6b3fde`, the exact inverse of `ced1cac5d`; nothing
later touched those files, so the rebase was clean), PR 3 and PR 9 were rebased on it, and the two new commits were cherry-picked onto PR 9
(`76b4d1afe`, `43a6899f1`). Verified: `ndwxr/`, the common ND, the SimBridge client and both systems hosts are identical between the PR 9 tip and
`master`. Re-run afterwards at the PR 4 (`89f956037`), PR 3 (`a5ecd08cf`) and PR 9 (`61a348d92`) tips: `ndwxr` builds for both aircraft and
`tsc --noEmit` passes for the A32NX and A380X ND and systems-host projects (worktree + dev container with the main checkout's `node_modules`
mounted read-only; script `check_tip.ps1` / `check_tip.sh` in the scratchpad).

**The off-path finding (for PR 2 / PR 9 reviewers):** the A380X's hatched off-path weather came from a third MapView per ND in the engine's TOP VIEW
radar mode. On the ground in rain (RJTT, custom weather) the A380X ND filled with a green speckle over the whole range while the A32NX at the same
place showed cells; a diagnostic build drawing the raw view textures showed the A380X beam views full of returns, and the same views were clean as
soon as the top view was not created. The engine runs one radar per aircraft and views in different radar modes do not keep their settings apart
(a top-view view also renders the aerial base map under the precipitation). The user chose to drop the off-path layer for good: both aircraft show
the same picture, from the beam views. `02-wx-radar-a380x-vd.md`, `04-terrain-on-nd.md` and `09-a380x-vd-cut.md` are updated accordingly.

## Quality pass 2026-09-24 (COMMITTED on `master` as seven commits, user-tested in the sim, placed in the branches)

A scan of everything the nine branches touch against `AGENTS.md` and the repo's lint setup. ESLint and Prettier were already clean on all 23
TypeScript files; `clang-format` is not in the dev container, so the C++ was checked by hand against the Chromium style. What changed:

- **`ndwxr` restructured (the big item):** the single 2 733-line `main.cpp` with a 500-line gauge callback, 77 preprocessor conditionals and 42
  globals is now `ndwxr.h` (types, shared declarations, the module overview), `constants.h` (every tuning constant with its provenance comment),
  `simvars.cpp` (the `L:` variables, their registration and the readers), `render.cpp` (NanoVG helpers), `weather.cpp`, `terrain.cpp`,
  `vd.cpp` (A380X only), `simbridge.cpp` (the SimConnect client, with a two-function owner API instead of a shared struct) and `gauge.cpp`
  (install / draw / kill; the ND draw is `readNdFrame` -> `NdFrame`, `radarSweepFraction`, `publishWxrLabel`, `updateViewRoles`,
  `drawTerrainLayer`, `drawWeatherLayer`, `drawVdWeatherLayer`). Code bodies moved verbatim; file-local helpers are `static`. New `rgba()` helper
  for `FsColor` (removes 29 `-Wmissing-braces` warnings the old file had), the SimBridge EFIS fill returns a struct instead of writing through
  pointers into the packed status block (removes the two `-Waddress-of-packed-member` warnings), `kWxrLabelOff` names the literal 5. Both
  aircraft build with zero warnings from the module. `build.sh` compiles `src/*.cpp` and empties the object folder first (a stale object of a
  removed file was linked otherwise).
- **TCAS (both computers):** the hysteresis thresholds 900 / 1 100 / 400 / 600 ft are named constants in `TcasConstants.ts`
  (`INHIBIT_ALL_RA_AGL_DESCENT` / `_CLIMB`, `INHIBIT_TA_AURAL_AGL_DESCENT` / `_CLIMB`), used through `TCAS.`.
- **A380X FWS:** the eight inline reads of `L:A32NX_TRANSPONDER_SYSTEM` in the ECAM procedure tables go through one `xpdrTcasSystemIs(1 | 2)`.
- **A32NX `TawsStatusBridge`:** the status object is typed by the mapper's return type instead of an `as` cast; the identity maps carry a
  comment saying they exist for the equality only.
- Verified: `ndwxr` builds for both aircraft (0 warnings), ESLint + Prettier clean, `tsc --noEmit` clean on the A32NX and A380X systems-host
  and the A32NX TCAS projects; the A32NX systems-host, ATC and A380X systems-host bundles rebuilt.
- Committed as `8926a0be1` refactor(nd) split, `d0db7d2e3` refactor(tcas), `b83797da4` refactor(a380x/fws), `51fe2dbc1` refactor(a32nx), then three
  fixes found while testing and checking the manuals: `3aafdb137` fix(nd) the ARC picture stops just above the TCAS / WXR message box (it ran to
  the bottom of the screen behind it), `6e0d81dcd` fix(nd) the radar cone is each aircraft's real antenna sweep (A320 RDR-4B 180 deg, A380
  RDR-4000 160 deg, sources in the comment), `6dfba5431` fix(a380x/nd) no weather above 320 NM (A380 FCOM DSC-31-20-50). Placed: the four
  ndwxr commits on PR 9, the TCAS one on PR 7, the FWS one on PR 6, the status-bridge one on PR 4 (PR 3 and PR 9 rebased over it). The
  standalone refactor commit compiles for both aircraft; PR 9's `ndwxr` == `master`'s. The drafts' `main.cpp` mentions describe the branch
  history before the split and stay right.
- Checked against the FCOM and left alone: the VD range in ROSE NAV is half the selected range on purpose (A380 FCOM DSC-31-20-40-10 RANGE:
  the VD covers the area in front of the aircraft, 160 nm in ARC = 320 nm in ROSE-NAV); the A320's TA ONLY position is only in the FCOM's ND
  figure (DSC-34-SURV-60-20), not in its text. SETTLED 2026-09-24 from the PDF's figure (p. 1590, saved under `references/manuals/figures`):
  TA ONLY sits at the bottom CENTRE of the ND -> `22aa5383b` fix(a32nx/nd) (PR 7 as `2518ca61e`): the A32NX ND stylesheet centres the TCAS
  message as the A380X stylesheet already did.
- `d99a3754a` fix(a380x/nd) (on PR 9 as `ddca9fe22`): the A380X ND announced the radar with the A320's "WX+T"; the A380 FCOM's WXR messages
  (DSC-34-20-30-20 p. 17) are WX / MAP / WXR OFF plus the manual GAIN, ELEVN and TILT values, so the label is WX / MAP / WXR OFF now. "WX ALL"
  belongs to the Collins MultiScan A320 variant (A320 FCOM DSC-34-SURV-30-30 p. 6); our A320 models the Honeywell RDR-4B list of p. 10.

Not changed on purpose: the long provenance comments in the C++ (they record in-sim measurements and manual pages that a reviewer needs), the
duplicated A32NX / A380X TCAS computers (an upstream layout), and the `#ifdef A380X` blocks that differ by simulator variable rather than by
logic.

## 2026-09-25: pushed to the fork, commit email changed

- `master` and the 9 branches were pushed to https://github.com/TCdr/aircraft (the backup branch was not: it predates the APU sound removal).
- GitHub refused the first push because the commits carried a private email address. The author and committer email of the 131 local
  commits was changed to `afataahu@gmail.com` (name, messages, dates and files unchanged) and the branches were force-pushed. Every commit
  ID therefore changed; the IDs in these drafts were updated to the new ones (`master` `63d6495fe` -> `50db576cc`). The older IDs that
  earlier rebases had left in the drafts were updated to the same-titled commit on the PR branches (or on `master` for the two commits that
  are only there). The one ID left as it was is `4f25f245c` in `08-mcdu-independent.md`: it is the commit of the other author's upstream PR.
- `master` since the 2026-09-25 state above, on top of the FMS / SURV pages: `1d81e3514` feat(a380x/nd) WXR GAIN / ELEVN / TILT messages,
  `06df418a2` fix(a380x/mfd) button labels, field height, STORE WPT, RTE SEL, WIND FL, `50db576cc` feat(a380x/mfd) FMS print functions and
  the flypad printouts. None of them is on a PR branch yet.
