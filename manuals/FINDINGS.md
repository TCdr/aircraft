# Findings while making the user manuals (2026-09-28)

Fixed (uncommitted, worktree q-taxi, branch feature/a380x/oans-taxi-route-flags; to split into a pr/26 fix commit):
- PR 26 taxi route: from the aircraft, the route could roll to the next junction and U-turn back through the aircraft position (the turn-back penalty only covered the first step). Fixed: the edge the aircraft is on is never taken whole; spec case added.
- PR 26 taxi map: the fitted view cut the labels at the ends of the route (HOLD, stand). Fixed: 70 px margin.

Not fixed (to decide):
- PR 23 landing roll picture: the last distance tick label (e.g. 3,000) is cut at the right edge of the chart.
- PR 24 descent table: the V/S column is positive (3200, 2350...) while RESULTS shows a negative V/S (-1660 ft/min); FPA is negative in both. Pick one sign convention.
- PR 12 A32NX MCDU UPLINK MAX / FLX TO DATA: the V1 / VR / V2 labels touch the left labels ("TEMP/QNHV1", "MAG WINDVR", "CONTAM  V2"); check the spacing against the A320 FCOM figure DSC-22_20-50-10-28 P 93.
- PR 12 (upstream FBW A320 model, not our change): at light weights the takeoff model returns V1 = VR = V2 (68 t CONF 1+F: 148/148/148 FLEX, 140/140/140 TOGA; 75 t: 135/147/147). Same with the upstream file of 0df155e90. Worth an upstream issue.
- PR 12 flyPad (A320): the Send to FMS warnings use the A380 texts: FmsCheckTow says '-2 t / +7 t' (the A320 check is -1 t / +3 t) and FmsCheckNoTow says '(FUEL&LOAD)' (A380 page). Needs A320 variants of the two en.json keys, like SentToFmsA320.
- PR 10/21 MFD: the SEND F-PLN REQUEST button (COMPANY F-PLN REQUEST page, reached from INIT CPNY F-PLN REQUEST) shows two asterisks ('REQUEST *' and a second '*' at the right edge); SEND WIND REQUEST shows one.
