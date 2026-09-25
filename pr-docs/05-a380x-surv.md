# PR 5 - A380X SURV controls, STATUS & SWITCHING and pedestal SURV panel

- **Title:** `feat(a380x): make the SURV controls, STATUS & SWITCHING and the pedestal SURV panel work`
- **Base:** `master` - **Branch:** `feature/a380x-surv-panel` (built on `origin/master`, independent of the radar PRs; the radar reading these LVars is in PR 2)
- **Commits:** `d263c6b12` (MFD SURV CONTROLS + STATUS & SWITCHING), `b6877383f` (VD no-data messages), `a1c0afd4b` (pedestal panel)
- **Labels to request:** `A380X`, `MFD`, `VD`, `QA A380 Only`
- **Issue to open first:** *"A380X SURV panel and MFD SURV CONTROLS page do nothing"* - "The WXR block of the MFD SURV CONTROLS page is a stub, the
  STATUS & SWITCHING XPDR/TCAS and WXR buttons do not select anything, and none of the pedestal SURV panel buttons works."
- **CHANGELOG line:** `1. [A380X/MFD] Make the SURV CONTROLS page (WXR, TCAS), the STATUS & SWITCHING WXR and XPDR/TCAS selection and the pedestal SURV panel buttons work - @TCdr` - already added to `.github/CHANGELOG.md` in the commit of this PR

---- paste from here ----

Fixes #[issue_no]

## Summary of Changes

**MFD SURV CONTROLS:** the WXR block was a stub (every button greyed out, "FIXME replace with appropriate events"). Its buttons (WXR, PRED WS, TURB,
GAIN, MODE, WX ON VD) now write LVars that the native weather radar reads, and are only inhibited when the selected WXR system is really failed.

**STATUS & SWITCHING:** the WXR DISPLAY items show the real failure of each system, and the XPDR/TCAS SYS 1 / SYS 2 buttons select the transponder
system (`L:A32NX_TRANSPONDER_SYSTEM`, the one the TCAS reads) and light from it.

**Pedestal SURV panel:** the buttons use the backlight indicator template, which runs the button code and lights the button only if
`INDICATOR_POWERED` is defined, and `pedestal.xml` never defined it (the EFIS, FCU and KCCU files do), so none of them ever worked. It is now the
DC 1 bus, like the backlight. The buttons are linked to the MFD pages: WXR TAWS SYS 1/2 toggle `L:A32NX_WXR_TAWS_SYS_SELECTED`, XPDR TCAS SYS 1/2
set the transponder system, G/S MODE toggles the GPWS G/S inhibit, each lit from the same LVar. TCAS ABV / BLW / TA ONLY follow and change the SURV
CONTROLS TCAS settings: the TCAS computer mirrors the settings to LVars for the lights and applies the button requests to the same events the
page publishes.

**VD messages:** TERR SYS OFF removed both terrain and weather from the message logic, it always showed "NO TERR AND WX DATA AVAILABLE". TERR SYS OFF
now only gives NO TERR DATA AVAILABLE, a failed or OFF WXR or WX ON VD OFF only gives NO WX DATA AVAILABLE, and the combined message is kept for both.

Known limit: PRED WS and GAIN MAN are written but nothing reads them (the MSFS radar has no predictive windshear or gain).

## Cockpit API Changes

New LVars, already documented in `fbw-a380x/docs/a380-simvars.md` (new "Surveillance ATA 34" section, in the commits of this PR):

| Var | Type | Description |
|-----|------|-------------|
| `L:A380X_WXR_OFF` | Bool | SURV CONTROLS WXR button: weather radar off |
| `L:A380X_WXR_TURB_OFF` | Bool | SURV CONTROLS TURB button: turbulence detection off |
| `L:A380X_WXR_MODE_MAP` | Bool | SURV CONTROLS MODE button: MAP mode |
| `L:A380X_WXR_PRED_WS_OFF` | Bool | SURV CONTROLS PRED WS button: predictive windshear off (not read by anything yet) |
| `L:A380X_WXR_GAIN_MAN` | Bool | SURV CONTROLS GAIN button: manual gain (not read by anything yet) |
| `L:A380X_WXR_VD_OFF` | Bool | SURV CONTROLS WX ON VD button: weather on the VD off |
| `L:A380X_TCAS_ALERT_LEVEL` | Number | Current TCAS alert level setting of the SURV CONTROLS page (mirrored for the pedestal lights) |
| `L:A380X_TCAS_ALT_SELECT` | Number | Current TCAS ABV/BLW altitude selection (mirrored for the pedestal lights) |
| `L:A380X_TCAS_ALERT_LEVEL_REQUEST` | Number | Pedestal button request: wanted alert level + 1, 0 = no request (cleared by the TCAS computer) |
| `L:A380X_TCAS_ALT_SELECT_REQUEST` | Number | Pedestal button request: wanted altitude selection + 1, 0 = no request |

Enum meanings as documented: `L:A380X_TCAS_ALERT_LEVEL` 0 STBY / 1 TA ONLY / 2 TA/RA, `L:A380X_TCAS_ALT_SELECT` 0 NORM / 1 ABV / 2 BLW; the WXR LVars are true for OFF / MANUAL / MAP.

## Screenshots (if necessary)

**TO ADD**: the SURV CONTROLS page (WXR block enabled) and STATUS & SWITCHING before/after; the pedestal SURV panel lit (before: all buttons dark);
the VD messages for each case.

## References

**TO ADD**: A380 FCOM/FCTM pages for the SURV panel and the SURV CONTROLS / STATUS & SWITCHING MFD pages (button functions, WXR & TAWS and XPDR & TCAS
system selection, TCAS ABV/BLW/TA ONLY, VD no-data messages), with screenshots.

Discord username (if different from GitHub): **TO ADD**

## Testing instructions

1. MFD SURV CONTROLS: WXR, TURB, MODE, WX ON VD buttons change the weather on the ND/VD (with the weather PR); PRED WS / GAIN toggle without effect.
   With the selected WXR system failed (reset its AESU) the WXR buttons are inhibited.
2. MFD STATUS & SWITCHING: WXR DISPLAY shows the failures; XPDR/TCAS SYS 1 / SYS 2 select the transponder system and light.
3. Pedestal SURV panel: with DC 1 powered the buttons light; WXR TAWS SYS 1/2, XPDR TCAS SYS 1/2, G/S MODE, TCAS ABV / BLW / TA ONLY work and stay
   in step with the MFD pages (press on the pedestal, look at the MFD, and the other way round). Remove DC 1: lights off.
4. VD messages: TERR SYS OFF -> NO TERR DATA AVAILABLE; WXR OFF/failed or WX ON VD OFF -> NO WX DATA AVAILABLE; both -> the combined message.

<!-- DO NOT DELETE THIS -->
## How to download the PR for QA

Every new commit to this PR will cause new A32NX and A380X artifacts to be created, built, and uploaded.

1. Make sure you are signed in to GitHub
1. Click on the **Checks** tab on the PR
1. On the left side, find and click on the **PR Build** tab
1. Click on either **flybywire-aircraft-a320-neo** or **flybywire-aircraft-a380-842** download link at the bottom of the page
