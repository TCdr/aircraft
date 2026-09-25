# MFD pages

This directory contains the different pages for the A380's MFD. List for pages is still incomplete.

## Status and description of components

Status legend:
✅ MVP complete
2️⃣ Phase 2 in progress: Data
1️⃣ Phase 1 in progress: Layout
🟥 Not yet started

### FMS

| Status      | URI | Sprint/Prio | Missing functionality |
| ------------- | ------------- | ------------- | ---------- |
| ✅ | fms/\*/init | 1 | ALTN RTE entry |
| ✅ | fms/\*/fuel-load | 1 | correct fuel calculation, FUEL PLANNING, JTSN GW, ALTN time |
| ✅ | fms/\*/perf | 1 | OPT FL, REC MAX, EO behavior, speed restriction type/label and ECON line in CRZ |
|  |  |  |  |
| ✅ | fms/\*/f-pln | 1 | F-PLN INFO button |
| ✅ | fms/\*/f-pln-departure | 1 | - |
| ✅ | fms/\*/f-pln-arrival | 1 | - |
| ✅ | fms/\*/f-pln-airways | 1 | geographic airway intersections (X waypoints), fixed turn radius airways |
| ✅ | fms/active/f-pln-direct-to | 1 | direct with abeam, crs in/out |
| ✅ | fms/\*/f-pln-duplicate-names | 1 | - |
| ✅ | fms/\*/f-pln-cpny-f-pln-req | 1 | SEND F-PLN REQUEST downloads the SimBrief OFP (flight number, company route and free text are not sent) |
| ✅ | fms/\*/f-pln-hold | 2 | last exit predictions, database holds |
| ✅ | fms/\*/f-pln-vert-rev | 2 | RTA panel shown and stored (ETA, time error) but no RTA speed control (RTA SPD dashed, no TMPY), CMS, STEP ALTs OPT |
| 🟨 | fms/\*/f-pln-rte-sel | 3 | alternate company routes are listed but cannot be inserted |
| 🟨 | fms/\*/f-pln-offset | 3 | no lateral offset guidance: fields shown with the FCOM defaults but inactive |
| ✅ | fms/\*/f-pln-fix-info | 3 | intecept predictions, abeam, insert as waypoint |
| 🟨 | fms/\*/f-pln-alternate | 3 | database alternates from the SimBrief OFP (no navdata alternate records), no alternate company routes, simplified alternate fuel (level flight), selection is direct (no TMPY) |
| 🟨 | fms/active/f-pln-closest-airports | 3 | simplified predictions (level flight at CRZ FL, no descent), default EFF WIND = INIT trip wind |
| ✅ | fms/\*/cpny-wind-request | 4 | free text not sent (SimBrief winds through the AOC datalink) |
| 🟨 | fms/\*/wind | 4 | draft winds (INSERT / CANCEL WIND), F-PLN wind prediction shortcut |
| 🟨 | fms/active/cpny-to-request | 9 | no company takeoff data computation: SEND T.O REQUEST inactive |
| 🟨 | fms/active/received-cpny-to-data | 9 | no received company takeoff data (dashes, INSERT / CLEAR inactive) |
| 🟨 | fms/active/f-pln-equi-time-point | 9 | simplified times (cruise Mach TAS + entered wind), ETP not drawn on F-PLN / ND |
| 🟨 | fms/\*/f-pln-ll-xing-time-mkr | 9 | time marker pseudo waypoints and aural alert not modelled |
|  |  |  |  |
| ✅ | fms/position/irs | 1 | data sources inconsistent, ALIGN ON OTHER REF |
| ✅ | fms/position/navaids | 2 | deselect glide, GPS deselection, radio nav mode/position |
| ✅ | fms/position/monitor | 3 |  UPDATE AT, FM calculated position info, Independent fixes across both MFDs |
| 🟨 | fms/position/gps | 3 | MMR not modelled: both receivers show the sim GPS, satellites / accuracy are stand-in values |
| 🟨 | fms/position/report | 4 | SEND REPORT TO CPNY (ACARS downlink) |
| 🟨 | fms/position/time | 4 | page not in the available FCOM (KAL 2011) |
|  |  |  |  |
| ✅ | fms/sec/index | 4 | print; XFER TO MAILBOX / REJECTED ATC INFO pages without ATC datalink backend |
|  |  |  |  |
| ✅ | fms/data/status | 2 | FMS P/N part numbers from the aircraft build (no real P/N), idle/perf factors MODIFY |
| ✅ | fms/data/airport | 2 | pilot stored runways missing |
| 🟨 | fms/data/navaid | 2 | pilot stored NAVAIDs are not tunable / usable as fixes; STORE NAVAID+RWY |
| ✅ | fms/data/waypoint | 2 | pilot stored waypoints limit is 99 (FCOM: 50) |
| 🟨 | fms/data/printer | 4 | no cockpit printer: PRINT buttons inactive |
| 🟨 | fms/data/route | 3 | navigation database routes = SimBridge company routes; stored routes keep 30 en-route elements |
|  |  |  |  |
| 🟨 | fms/active/f-pln-cpny-f-pln-report | 4 | no company flight plan report downlink: send inactive |
| 🟨 | fms/sec\*/xfer-to-mailbox | 4 | no ATC mailbox: transfer inactive |
| 🟨 | fms/sec3/rejected-atc-info | 4 | no ATC flight plan uplink: empty list |
| ✅ | fms/data/msg-list | 1 | messages are not deleted automatically when conditions don't apply anymore |

\* (active | sec1 | sec2 | sec3)

### ATCCOM

Use React-based implementation for now, hence no dev. effort needed here.

| Status      | URI | Sprint/Prio |
| ------------- | ------------- | ------------- |
| 2️⃣ | atccom/connect | 6 |
| 🟥 | atccom/connect/max-uplink-delay | 6 |
| 🟥 | atccom/request | 6 |
| 🟥 | atccom/report-modify/position | 6 |
| 🟥 | atccom/report-modify/modify | 6 |
| 🟥 | atccom/report-modify/other-reports | 6 |
| 2️⃣ | atccom/msg-record | 6 |
| 2️⃣ | atccom/msg-record/all-msg | 6 |
| 2️⃣ | atccom/msg-record/monitored-msg | 6 |
| 2️⃣ | atccom/msg-record/all-msg-expand | 6 |
| ✅ | atccom/d-atis/list | 6 |
| ✅ | atccom/d-atis/received | 6 |
| 🟥 | atccom/emer | 6 |

### SURV

| Status      | URI | Sprint/Prio | Missing functionality |
| ------------- | ------------- | ------------- |
| ✅ | surv/controls | 2 | TCAS+WXR not functional |
| 🟥 | surv/status-switching | 4 | tbd |

### FCU BKUP

| Status      | URI | Sprint/Prio |
| ------------- | ------------- | ------------- |
| 🟥 | fcubkup/afs | 5 |
| 🟥 | fcubkup/efis | 5 |
