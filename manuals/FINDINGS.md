# Findings while making the user manuals (2026-09-28)

Fixed (uncommitted, worktree q-taxi, branch feature/a380x/oans-taxi-route-flags; to split into a pr/26 fix commit):
- PR 26 taxi route: from the aircraft, the route could roll to the next junction and U-turn back through the aircraft position (the turn-back penalty only covered the first step). Fixed: the edge the aircraft is on is never taken whole; spec case added.
- PR 26 taxi map: the fitted view cut the labels at the ends of the route (HOLD, stand). Fixed: 70 px margin.

Fixed 2026-09-28 (each on its own branch from develop, UNCOMMITTED; built, deployed, checked in the harness; manuals updated):
- PR 23 landing roll picture: the last distance label of the scale was cut at the right edge. Now a label that would overflow ends at the edge (`fix/efb/landing-chart-scale-label`, worktree q-f1).
- PR 24 descent: the table showed V/S positive and FPA negative, the RESULTS line both negative, the late message both positive. Now, per the A380 FCOM table results (PER-IFT-DES-DSR P 3-4): the table columns are RATE (rate of descent) and GRDT (descent gradient), both positive in descent; the RESULTS line and the late message give V/S and FPA negative, as set on the FCU (`fix/efb/descent-table-fcom-columns`, worktree q-f2).
- PR 12 A32NX MCDU UPLINK MAX / FLX TO DATA: the V1 / VR / V2 labels ran into the left labels. Now laid out as the A320 FCOM figure (DSC-22_20-50-10-28 P 92): the TEMP/QNH, MAG WIND and CONTAM labels from column 1, V1 / VR / V2 and the speeds in column 11 (`fix/a32nx/mcdu-uplink-speed-labels`, worktree q-f3).
- PR 12 flyPad (A320): the Send to FMS warnings used the A380 texts. New A320 texts: TOW within -1 t / +3 t for INSERT UPLINK, no TOW -> INIT B: ZFW and BLOCK (`fix/efb/a320-send-to-fms-warnings`, worktree q-f5). Not visible in the harness (needs the MCDU answer on the same bus): checked by build and bundle content only.
- PR 10/21 MFD: SEND F-PLN REQUEST had two asterisks. Now one, on the right, as in the A380 FCOM figure (DSC-22-FMS-20-30 P 28) (`fix/a380x/mfd-cpny-fpln-request-asterisk`, worktree q-f6).

Not fixed:
- PR 12 (upstream FBW A320 model, not our change): at light weights the takeoff model returns V1 = VR = V2 (68 t CONF 1+F: 148/148/148 FLEX, 140/140/140 TOGA; 75 t: 135/147/147). Same with the upstream file of 0df155e90. Changing it needs Airbus performance data we do not have: worth an upstream issue.
