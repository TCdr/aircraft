# PR 7 - TCAS: RA-level intruders shown as TAs while RAs are inhibited

- **Title:** `fix(tcas): show and count RA-level intruders as TAs while RAs are inhibited`
- **Base:** `master` - **Branch:** `fix/tcas-ta-only-intruder-level` (built on `origin/master`)
- **Commits:** `56d5d656c` (the fix), `4a5fb1c4e` (the low-altitude inhibitions with the real hysteresis, 900 / 1 100 ft and 400 / 600 ft), `c42cef6cc` (those altitudes named in `TcasConstants.ts`), `2518ca61e` (the TCAS message centred at the bottom of the A32NX ND, A320 FCOM DSC-34-SURV-60-20 figure)
- **Labels to request:** `A32NX`, `A380X`, `Bug` (it is a fix)
- **Status:** the commit message says *"Not verified in-sim yet"*. Test it first (see the testing instructions) or say so in the PR.
- **Issue to open first** (bug report template for the A32NX and one for the A380X): *"TCAS in TA ONLY shows an RA-level intruder as a red square
  and gives no traffic alert"*
- **CHANGELOG line:** `1. [TCAS] Show and count RA-level intruders as TAs while the RAs are inhibited (TA ONLY, or below 1000 ft) - @TCdr` - already added to `.github/CHANGELOG.md` in the commit of this PR (qualifies only if the bug is in the previous stable release, check it before opening)

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

With every RA inhibited (TA ONLY mode, or below 1000 ft radio altitude, the two cases that put up the "TA ONLY" message) the intruder classification still
went to RA for an intruder that met the RA criteria. On the ND that intruder was drawn as a red RA square, and since it was not a TA either, it did
not raise the TA state or the "traffic, traffic" aural. A real TCAS in TA ONLY shows it as an amber TA circle with the TA aural.

The desired intrusion level is now capped to TA while `Inhibit.ALL_RA` or `Inhibit.ALL_RA_AURAL_TA` is active. The partial inhibits (no climb / descend /
increase descent RA) still issue RAs and are unchanged, and an RA that is already active keeps running until its own end conditions. Same change in the
A32NX `TcasComputer` and the A380X `LegacyTcasComputer`, whose classification code is identical.

Found while comparing the ND traffic symbols with the reference symbology (hollow diamond other traffic, filled diamond proximate, amber circle TA, red
square RA), which otherwise matches.

## Cockpit API Changes

None.

## Screenshots (if necessary)

**TO ADD**: the ND in TA ONLY with an intruder that meets the RA criteria, before (red square) and after (amber circle).

## Update 2026-09-22 (uncommitted, second commit of this PR): low-altitude inhibition hysteresis

`updateInhibitions()` of both computers inhibited every RA below a flat 1 000 ft radio altitude and the TA aural below 500 ft. The manuals give a hysteresis:
RAs are inhibited below 900 ft AGL in descent and 1 100 ft AGL in climb (A380 FCTM, Supplementary Information / TCAS; the FCOM's "below 1 000 ft +-100 ft"),
the TA aural below 400 ft in descent and 600 ft in climb. Both are now state-based thresholds (`raInhibitedLow`, `taAuralInhibitedLow`), reset while the radio
altitude is invalid. Suggested title: `fix(tcas): low-altitude RA and TA inhibitions with the real hysteresis`.

## References

- IVAO training wiki, Traffic collision avoidance system (TCAS): https://wiki.ivao.aero/en/home/training/documentation/Traffic_collision_avoidance_system-TCAS
  (traffic symbols and colours; used to check the ND symbology).
- A320 FCOM DSC-34-SURV-60-10-10, TA ONLY mode: "All RAs are inhibited and converted into TAs", "TA threshold is set to TAU 20 s", "'TA ONLY' is displayed on
  the NDs"; automatic TA ONLY below 1 000 ft AGL (and with windshear / stall / GPWS alerts).
- A380 FCOM DSC-34-20-40-10, TA ONLY mode: "All RAs are inhibited, and become TAs", automatic "below 1 000 ft +-100 ft".
- A380 FCTM SI TCAS (page 345 of the scanned FCTM): RAs inhibited below 900 ft AGL in descent / 1 100 ft AGL in climb, TAs below 400 / 600 ft AGL.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. A32NX and A380X: TCAS in TA ONLY. Bring an intruder (AI traffic, slew or MSFS multiplayer) on a converging course that meets the RA criteria: it is an amber
   circle with the "TRAFFIC, TRAFFIC" aural, not a red square.
2. Below 1000 ft radio altitude (the "TA ONLY" message shows): same.
3. TCAS in TA/RA above 1000 ft: the same intruder still gives an RA (red square + RA aural). An RA in progress is not cut short.
4. The partial inhibits (climb inhibit at high weight/altitude, descend inhibit near the ground) still allow the other RA senses.

<!-- DO NOT DELETE THIS -->
## How to download the PR for QA

Every new commit to this PR will cause new A32NX and A380X artifacts to be created, built, and uploaded.

1. Make sure you are signed in to GitHub
1. Click on the **Checks** tab on the PR
1. On the left side, find and click on the **PR Build** tab
1. Click on either **flybywire-aircraft-a320-neo** or **flybywire-aircraft-a380-842** download link at the bottom of the page
