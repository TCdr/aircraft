// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { formatEwdMessages } from './EwdMessages';

/**
 * The parts of the A320 ECAM STATUS page: limitations (blue), approach procedures (white), procedures
 * (blue) and information (green) on the left; inoperative systems (amber) on the right. Only the parts used by the
 * alerts that have their status modelled are here.
 */
export enum StatusPart {
  Limitation,
  /** A condition of the next limitation or procedure lines (white), e.g. "IF SEVERE ICE ACCRETION:" */
  Condition,
  Information,
  InopSys,
  /** A procedure title in the left column (amber, underlined in its text), e.g. "MAN CAB PR CTL" */
  ProcedureTitle,
}

/**
 * The STATUS page lines, by code: ATA chapter, then 04 xxxxx limitations, 02 xxxxx information, 03 xxxxx inoperative
 * systems (as the A380 codes). Their order here is their order on the page: the limitations come before the information
 * in the left column.
 */
const StatusMessages = new Map<string, { part: StatusPart; text: string }>([
  // 70 ENGINE: the STATUS of ENG ALL ENGINES FAILURE (see FWC/Logic/AllEnginesFailure), first on the page in the
  // aircraft order: the lines the other alerts of an all engines failure share with it are shown once, here
  ['700400070', { part: StatusPart.Limitation, text: 'MIN RAT SPEED....140 KT' }],
  ['700400071', { part: StatusPart.Limitation, text: 'MAX SPEED.......320/.77' }],
  ['700400072', { part: StatusPart.Limitation, text: 'MAX BRK PR.....1000 PSI' }],
  ['700400073', { part: StatusPart.Limitation, text: 'MANEUVER WITH CARE' }],
  ['700400074', { part: StatusPart.Limitation, text: 'FUEL GRVTY FEED' }],
  ['700400075', { part: StatusPart.Limitation, text: 'AVOID NEGATIVE G FACTOR' }],
  ['700500070', { part: StatusPart.Condition, text: 'APPR PROC:' }],
  ['700400076', { part: StatusPart.Limitation, text: 'FOR LDG......USE FLAP 2' }],
  ['700500071', { part: StatusPart.Condition, text: 'WHEN CONF 2 AND VAPP:' }],
  ['700400077', { part: StatusPart.Limitation, text: 'L/G GRVTY EXTN...AS RQRD' }],
  ['700200070', { part: StatusPart.Information, text: 'ALTN LAW: PROT LOST' }],
  ['700200071', { part: StatusPart.Information, text: 'WHEN L/G DN: DIRECT LAW' }],
  ['700200072', { part: StatusPart.Information, text: 'BRK Y ACCU PR ONLY' }],
  ['700200073', { part: StatusPart.Information, text: 'SLATS SLOW' }],
  ['700200074', { part: StatusPart.Information, text: 'FLS LIMITED TO F-APP + RAW' }],
  ['700300070', { part: StatusPart.InopSys, text: 'G+Y HYD' }],
  ['700300071', { part: StatusPart.InopSys, text: 'F/CTL PROT' }],
  ['700300072', { part: StatusPart.InopSys, text: 'STABILIZER' }],
  ['700300073', { part: StatusPart.InopSys, text: 'R AIL' }],
  ['700300074', { part: StatusPart.InopSys, text: 'REVERSER 1+2' }],
  ['700300075', { part: StatusPart.InopSys, text: 'ADR 2+3' }],
  ['700300076', { part: StatusPart.InopSys, text: 'IR 2+3' }],
  ['700300077', { part: StatusPart.InopSys, text: 'RA 1+2' }],
  ['700300078', { part: StatusPart.InopSys, text: 'SPLR 1+2+4+5' }],
  ['700300079', { part: StatusPart.InopSys, text: 'ELAC 2' }],
  ['700300080', { part: StatusPart.InopSys, text: 'SEC 2+3' }],
  ['700300081', { part: StatusPart.InopSys, text: 'FLAPS' }],
  ['700300082', { part: StatusPart.InopSys, text: 'YAW DAMPER' }],
  ['700300083', { part: StatusPart.InopSys, text: 'A/CALL OUT' }],
  ['700300084', { part: StatusPart.InopSys, text: 'AP 1+2' }],
  ['700300085', { part: StatusPart.InopSys, text: 'A/THR' }],
  ['700300086', { part: StatusPart.InopSys, text: 'FUEL PUMPS' }],
  ['700300087', { part: StatusPart.InopSys, text: 'ANTI SKID' }],
  ['700300088', { part: StatusPart.InopSys, text: 'N/W STRG' }],
  ['700300089', { part: StatusPart.InopSys, text: 'AUTO BRK' }],
  ['700300090', { part: StatusPart.InopSys, text: 'CAT 2' }],
  ['700300091', { part: StatusPart.InopSys, text: 'L/G RETRACT' }],
  ['700300092', { part: StatusPart.InopSys, text: 'CAB PR 1+2' }],
  ['700300093', { part: StatusPart.InopSys, text: 'PACK 1+2' }],
  // 24 ELECTRICAL: the STATUS of ELEC EMER CONFIG (see FWC/Logic/ElecBusAlerts elecEmerConfigStatus), in the aircraft
  // order; after the ENG ALL ENGINES FAILURE lines above, which an all engines failure (with ELEC EMER CONFIG) shows
  // first
  ['240400301', { part: StatusPart.Limitation, text: 'MIN RAT SPEED....140 KT' }],
  ['240400302', { part: StatusPart.Limitation, text: 'MAX SPEED........320 KT' }],
  ['240400303', { part: StatusPart.Limitation, text: 'MAX BRK PR.....1000 PSI' }],
  ['240400304', { part: StatusPart.Limitation, text: 'FUEL GRVTY FEED' }],
  ['240400305', { part: StatusPart.Limitation, text: 'AVOID NEGATIVE G FACTOR' }],
  ['240500301', { part: StatusPart.Condition, text: 'APPR PROC:' }],
  ['240400306', { part: StatusPart.Limitation, text: 'FOR LDG......USE FLAP 3' }],
  ['240400307', { part: StatusPart.Limitation, text: 'APPR SPD.VREF+10/140 KT' }],
  ['240400308', { part: StatusPart.Limitation, text: 'LDG DIST PROC....APPLY' }],
  ['240400309', { part: StatusPart.Limitation, text: 'FUEL CONSUMPT INCRSD' }],
  ['240400310', { part: StatusPart.Limitation, text: 'FMS PRED UNRELIABLE' }],
  ['240200301', { part: StatusPart.Information, text: 'ALTN LAW: PROT LOST' }],
  ['240200302', { part: StatusPart.Information, text: 'WHEN L/G DN: DIRECT LAW' }],
  ['240200303', { part: StatusPart.Information, text: 'SLATS/FLAPS SLOW' }],
  ['240200304', { part: StatusPart.Information, text: 'FLS LIMITED TO F-APP + RAW' }],
  ['240300301', { part: StatusPart.InopSys, text: 'F/CTL PROT' }],
  ['240300302', { part: StatusPart.InopSys, text: 'REVERSER 1+2' }],
  ['240300303', { part: StatusPart.InopSys, text: 'ADR 2+3' }],
  ['240300304', { part: StatusPart.InopSys, text: 'IR 2' }],
  ['240300305', { part: StatusPart.InopSys, text: 'RA 1+2' }],
  ['240300306', { part: StatusPart.InopSys, text: 'SPLR 1+2+5' }],
  ['240300307', { part: StatusPart.InopSys, text: 'ELAC 2' }],
  ['240300308', { part: StatusPart.InopSys, text: 'SEC 2+3' }],
  ['240300309', { part: StatusPart.InopSys, text: 'A/CALL OUT' }],
  ['240300310', { part: StatusPart.InopSys, text: 'AP 1+2' }],
  ['240300311', { part: StatusPart.InopSys, text: 'A/THR' }],
  ['240300312', { part: StatusPart.InopSys, text: 'FUEL PUMPS' }],
  ['240300313', { part: StatusPart.InopSys, text: 'ANTI SKID' }],
  ['240300314', { part: StatusPart.InopSys, text: 'N/W STRG' }],
  ['240300315', { part: StatusPart.InopSys, text: 'CAT 2' }],
  // 21 AIR CONDITIONING
  ['210400001', { part: StatusPart.Limitation, text: 'MAX FL.....100/MEA-MORA' }],
  // CAB PR SAFETY VALVE OPEN and SYS 1+2 FAULT, see FWC/Logic/AirConditioningAlerts: the manual pressurization schedule
  ['210500002', { part: StatusPart.ProcedureTitle, text: '\x1b4mMAN CAB PR CTL\x1bm' }],
  ['210400002', { part: StatusPart.Limitation, text: 'TGT V/S: CLIMB 500 FT/MN' }],
  ['210400003', { part: StatusPart.Limitation, text: 'TGT V/S: DESC 300 FT/MN' }],
  ['210500003', { part: StatusPart.Condition, text: 'A/C FL     CAB ALT TGT' }],
  ['210400004', { part: StatusPart.Limitation, text: ' 390           8000' }],
  ['210400005', { part: StatusPart.Limitation, text: ' 350           7000' }],
  ['210400006', { part: StatusPart.Limitation, text: ' 300           5500' }],
  ['210400007', { part: StatusPart.Limitation, text: ' 250           3000' }],
  ['210400008', { part: StatusPart.Limitation, text: '<200              0' }],
  ['210500004', { part: StatusPart.Condition, text: 'DURING FINAL APPR:' }],
  ['210400009', { part: StatusPart.Limitation, text: 'MAN V/S CTL.....FULL UP' }],
  ['210400010', { part: StatusPart.Limitation, text: 'V/S CTL.........FULL UP' }],
  // 30 ICE AND RAIN PROTECTION (WING A.ICE L(R) HI PR), see FWC/Logic/WingAntiIceAlerts
  ['300400001', { part: StatusPart.Limitation, text: 'THRUST LIM PENALTY' }],
  // 32 LANDING GEAR (GEAR NOT UPLOCKED, DOORS NOT CLOSED), see FWC/Logic/LandingGearAlerts
  ['320400001', { part: StatusPart.Limitation, text: 'MAX SPEED.......280/.67' }],
  ['320400002', { part: StatusPart.Limitation, text: 'MAX SPEED.......250/.60' }],
  // 52 DOORS (in flight), see FWC/Logic/DoorAlerts
  ['520500001', { part: StatusPart.Condition, text: 'IF ABN CAB V/S:' }],
  ['520400001', { part: StatusPart.Limitation, text: 'MAX FL.....100/MEA-MORA' }],
  // 24 ELECTRICAL (bus faults STATUS, see FWC/Logic/ElecBusAlerts), before LDG DIST PROC as on the aircraft
  ['240500101', { part: StatusPart.Condition, text: 'IF ABN CAB V/S:' }],
  ['240400106', { part: StatusPart.Limitation, text: 'MAX FL..........100/MEA' }],
  ['240400103', { part: StatusPart.Limitation, text: 'MIN RAT SPEED....140 KT' }],
  ['240400104', { part: StatusPart.Limitation, text: 'PROC: GRVTY FUEL FEEDING' }],
  ['240400101', { part: StatusPart.Limitation, text: 'MAX BRK PR.....1000 PSI' }],
  ['240400105', { part: StatusPart.Limitation, text: 'FUEL GRVTY FEED' }],
  ['240400102', { part: StatusPart.Limitation, text: 'L/G..........GRVTY EXTN' }],
  // 32 LANDING GEAR (NORM + ALTN FAULT STATUS), see FWC/Logic/BrakeSystemAlerts
  ['320400090', { part: StatusPart.Limitation, text: 'PARK BRK ONLY' }],
  // 29 HYDRAULIC (STATUS), see FWC/Logic/HydraulicAlerts: limitations, then the APPR PROC block, then the procedures,
  // as on the STATUS pages
  ['290400001', { part: StatusPart.Limitation, text: 'MIN RAT SPD......140 KT' }],
  ['290400002', { part: StatusPart.Limitation, text: 'MAX SPEED.......320/.77' }],
  ['290400003', { part: StatusPart.Limitation, text: 'MAX BRK PR.....1000 PSI' }],
  ['290400004', { part: StatusPart.Limitation, text: 'MANEUVER WITH CARE' }],
  ['290400005', { part: StatusPart.Limitation, text: 'SPD BRK......DO NOT USE' }],
  ['290400006', { part: StatusPart.Limitation, text: 'FOR GA: MAX PITCH 15 DEG' }],
  ['290500001', { part: StatusPart.Condition, text: 'APPR PROC: HYD LO PR' }],
  ['290500002', { part: StatusPart.Condition, text: 'APPR PROC: DUAL HYD LO PR' }],
  ['290500003', { part: StatusPart.Condition, text: 'IF BLUE OVHT OUT:' }],
  ['290400007', { part: StatusPart.Limitation, text: 'BLUE ELEC PUMP.....AUTO' }],
  ['290500004', { part: StatusPart.Condition, text: 'IF GREEN OVHT OUT:' }],
  ['290400008', { part: StatusPart.Limitation, text: 'GREEN ENG 1 PUMP.....ON' }],
  ['290500005', { part: StatusPart.Condition, text: 'IF YELLOW OVHT OUT:' }],
  ['290400009', { part: StatusPart.Limitation, text: 'YELLOW ENG 2 PUMP....ON' }],
  ['290400010', { part: StatusPart.Limitation, text: 'PTU................AUTO' }],
  ['290500006', { part: StatusPart.Condition, text: 'IF SYS NOT RECOVERED:' }],
  ['290500007', { part: StatusPart.Condition, text: 'IF HYD NOT RECOVERED:' }],
  ['290400011', { part: StatusPart.Limitation, text: 'A/THR...............OFF' }],
  ['290400012', { part: StatusPart.Limitation, text: 'FOR LDG......USE FLAP 3' }],
  ['290400013', { part: StatusPart.Limitation, text: 'GPWS LDG FLAP 3......ON' }],
  ['290400014', { part: StatusPart.Limitation, text: 'GPWS FLAP MODE......OFF' }],
  // The condition is "speed below 200 kt": the landing gear is extended at 200 kt
  ['290500008', { part: StatusPart.Condition, text: 'WHEN SPD < 200 KT:' }],
  ['290500009', { part: StatusPart.Condition, text: 'WHEN CONF 3 AND VAPP:' }],
  ['290400015', { part: StatusPart.Limitation, text: 'L/G..........GRVTY EXTN' }],
  ['290400016', { part: StatusPart.Limitation, text: 'APPR SPD.....VREF+25 KT' }],
  ['290400017', { part: StatusPart.Limitation, text: 'LDG DIST PROC....APPLY' }],
  ['290400018', { part: StatusPart.Limitation, text: 'FUEL CONSUMPT INCRSD' }],
  ['290400019', { part: StatusPart.Limitation, text: 'FMS PRED UNRELIABLE' }],
  // 30 ICE AND RAIN PROTECTION: ANTI ICE ENG 1(2) VALVE OPEN (see FWC/Logic/EngineAntiIceAlerts) gives the THRUST LIM
  // PENALTY line 300400001 above, shared with WING A.ICE L(R) HI PR ANTI ICE ALL PITOT and the pitot pairs STATUS, see
  // FWC/Logic/ProbeWindowHeatAlerts
  ['300500001', { part: StatusPart.Condition, text: 'IF ICING EXPECTED:' }],
  ['300400002', { part: StatusPart.Limitation, text: 'ADR 1 P/B...........OFF' }],
  ['300400003', { part: StatusPart.Limitation, text: 'ADR 2 P/B...........OFF' }],
  ['300400004', { part: StatusPart.Limitation, text: 'ADR 3 P/B...........OFF' }],
  ['300400005', { part: StatusPart.Limitation, text: 'UNREL SPD PROC....APPLY' }],
  // 70 ENGINE (ENG 1(2) SHUT DOWN STATUS), in the aircraft order
  ['700400001', { part: StatusPart.Limitation, text: 'AVOID ICING CONDITIONS' }],
  ['700500001', { part: StatusPart.Condition, text: 'IF SEVERE ICE ACCRETION:' }],
  ['700400002', { part: StatusPart.Limitation, text: 'MIN SPD....VLS+10/G DOT' }],
  ['700400003', { part: StatusPart.Limitation, text: 'MANEUVER WITH CARE' }],
  ['700400004', { part: StatusPart.Limitation, text: 'LDG DIST PROC....APPLY' }],
  // "If REV unlocked", see FWC/Logic/EngineFailAlerts engineShutDownStatus; MAX SPEED 300/.78 is also the STATUS of
  // REVERSE UNLOCKED (FWC/Logic/FadecReverserAlerts)
  ['700400058', { part: StatusPart.Limitation, text: 'MAX SPEED.......300/.78' }],
  ['700500051', { part: StatusPart.Condition, text: 'APPR PROC:' }],
  ['700500052', { part: StatusPart.Condition, text: 'IF BUFFET:' }],
  ['700400059', { part: StatusPart.Limitation, text: 'FOR LDG......USE FLAP 3' }],
  ['700400060', { part: StatusPart.Limitation, text: 'GPWS LDG FLAP 3......ON' }],
  ['700400061', { part: StatusPart.Limitation, text: 'APPR SPD.....VREF+10 KT' }],
  ['700400062', { part: StatusPart.Limitation, text: 'LDG DIST PROC....APPLY' }],
  // ENG 1(2) SENSOR FAULT STATUS, FWC/Logic/EngineMonitoringAlerts
  ['700400063', { part: StatusPart.Limitation, text: 'AVOID RAPID THR CHANGES' }],
  // ENG 1(2) CTL VALVE FAULT STATUS, FWC/Logic/EngineFadecFaultAlerts
  ['700400090', { part: StatusPart.Limitation, text: 'MAX ENG 1 N2.......96 %' }],
  ['700400091', { part: StatusPart.Limitation, text: 'MAX ENG 2 N2.......96 %' }],
  ['700500002', { part: StatusPart.Condition, text: 'IF PERF PERMITS:' }],
  ['700400005', { part: StatusPart.Limitation, text: 'X BLEED...........OPEN' }],
  ['700500003', { part: StatusPart.Condition, text: 'IF NO ENG 1 DAMAGE:' }],
  ['700400006', { part: StatusPart.Limitation, text: 'CONSIDER ENG 1 RELIGHT' }],
  ['700500004', { part: StatusPart.Condition, text: 'IF NO ENG 2 DAMAGE:' }],
  ['700400007', { part: StatusPart.Limitation, text: 'CONSIDER ENG 2 RELIGHT' }],
  // 34 NAVIGATION (NAV ADR 1+2+3 FAULT STATUS), see FWC/Logic/AdirsAlerts
  ['340400001', { part: StatusPart.Limitation, text: 'STBY INST..MAY BE UNREL' }],
  // 27 FLIGHT CONTROLS (STATUS), see FWC/Logic/FlightControlStatus
  ['270400001', { part: StatusPart.Limitation, text: 'MAX SPEED........320 KT' }],
  ['270400002', { part: StatusPart.Limitation, text: 'MAX SPEED.......320/.77' }],
  ['270400003', { part: StatusPart.Limitation, text: 'MANEUVER WITH CARE' }],
  ['270400004', { part: StatusPart.Limitation, text: 'SPD BRK......DO NOT USE' }],
  ['270400005', { part: StatusPart.Limitation, text: 'USE SPD BRK WITH CARE' }],
  ['270400006', { part: StatusPart.Limitation, text: 'FOR GA: MAX PITCH 15 DEG' }],
  ['270500001', { part: StatusPart.Condition, text: 'APPR PROC:' }],
  ['270400007', { part: StatusPart.Limitation, text: 'FOR LDG......USE FLAP 3' }],
  ['270400008', { part: StatusPart.Limitation, text: 'GPWS LDG FLAP 3......ON' }],
  ['270400009', { part: StatusPart.Limitation, text: 'MAN PITCH TRIM......USE' }],
  ['270400010', { part: StatusPart.Limitation, text: 'APPR SPD.....VREF+10 KT' }],
  ['270400011', { part: StatusPart.Limitation, text: 'LDG DIST PROC....APPLY' }],
  // APPR PROC of F/CTL FLAP SYS 1 FAULT, see FWC/Logic/SlatFlapChannelAlerts
  ['270400012', { part: StatusPart.Limitation, text: 'GPWS FLAP MODE......OFF' }],
  // 22 AUTO FLIGHT (RUD TRV LIM SYS STATUS), see FWC/Logic/FacActuatorAlerts
  ['220400001', { part: StatusPart.Limitation, text: 'RUD WITH CARE ABV 160 KT' }],
  ['220400002', { part: StatusPart.Limitation, text: 'MAX X WIND FOR LDG 15 KT' }],
  ['220400003', { part: StatusPart.Limitation, text: 'AUTO BRK.....DO NOT USE' }],
  ['220500001', { part: StatusPart.Condition, text: 'AT LDG ROLL:' }],
  ['220400004', { part: StatusPart.Limitation, text: 'DIFF BRAKING.....AS RQRD' }],
  // 23 COMMUNICATIONS (COM SINGLE PTT STUCK STATUS), see FWC/Logic/CommunicationAlerts
  ['230400001', { part: StatusPart.Limitation, text: 'AUDIO SWTG...DO NOT USE' }],
  // 34 NAVIGATION (NAV ADR 1+2(1+3)(2+3) and 1+2+3 FAULT STATUS)
  ['340400002', { part: StatusPart.Limitation, text: 'L/G..........GRVTY EXTN' }],
  // 80 STARTING (ENG 1(2) START FAULT STATUS, STARTER SHAFT SHEAR)
  ['800400001', { part: StatusPart.Limitation, text: 'ENG 1 WINDMILL START ONLY' }],
  ['800400002', { part: StatusPart.Limitation, text: 'ENG 2 WINDMILL START ONLY' }],
  // 70 ENGINE (STATUS of FADEC FAULT, THR LEVER DISAGREE, THR LEVER FAULT), lines by FWC/Logic/FadecReverserAlerts
  ['700400050', { part: StatusPart.Limitation, text: 'THR LVR 1 NOT ABV IDLE' }],
  ['700400051', { part: StatusPart.Limitation, text: 'THR LVR 2 NOT ABV IDLE' }],
  ['700500050', { part: StatusPart.Condition, text: 'WHEN SLATS OUT:' }],
  ['700400052', { part: StatusPart.Limitation, text: 'ENG 1 AT IDLE' }],
  ['700400053', { part: StatusPart.Limitation, text: 'ENG 2 AT IDLE' }],
  ['700400054', { part: StatusPart.Limitation, text: 'ENG 1 AVAIL MAX PWR:CLB' }],
  ['700400055', { part: StatusPart.Limitation, text: 'ENG 2 AVAIL MAX PWR:CLB' }],
  ['700400056', { part: StatusPart.Limitation, text: 'GND ENG 1 MAX PWR: IDLE' }],
  ['700400057', { part: StatusPart.Limitation, text: 'GND ENG 2 MAX PWR: IDLE' }],
  // 24 ELECTRICAL (bus faults STATUS, see FWC/Logic/ElecBusAlerts)
  ['240200103', { part: StatusPart.Information, text: 'ENG 1 APPR IDLE ONLY' }],
  ['240200104', { part: StatusPart.Information, text: 'ENG 2 APPR IDLE ONLY' }],
  // ENG 1(2) BLEED STATUS FAULT STATUS, FWC/Logic/EngineFadecFaultAlerts
  ['700200080', { part: StatusPart.Information, text: 'ENG 1 HI GND IDLE' }],
  ['700200081', { part: StatusPart.Information, text: 'ENG 2 HI GND IDLE' }],
  ['240200105', { part: StatusPart.Information, text: 'BOTH PFD ON SAME FAC' }],
  ['240200106', { part: StatusPart.Information, text: 'L/G CONTROL NOT AVAIL' }],
  ['240200108', { part: StatusPart.Information, text: 'APU BAT START NOT AVAIL' }],
  ['240200101', { part: StatusPart.Information, text: 'SLATS SLOW' }],
  ['240200107', { part: StatusPart.Information, text: 'SLATS/FLAPS SLOW' }],
  ['240200102', { part: StatusPart.Information, text: 'CAT 2 ONLY' }],
  ['210200001', { part: StatusPart.Information, text: 'CKPT AT FIXED TEMP' }],
  ['210200002', { part: StatusPart.Information, text: 'CAB AT FIXED TEMP' }],
  ['210200003', { part: StatusPart.Information, text: 'CAB TEMP BY PACK ONLY' }],
  ['210200004', { part: StatusPart.Information, text: 'CAB TEMP CKPT CTL ONLY' }],
  // 29 HYDRAULIC (STATUS), before CAT 3 SINGLE ONLY as on the aircraft
  ['290200001', { part: StatusPart.Information, text: 'BRK Y ACCU PR ONLY' }],
  ['290200002', { part: StatusPart.Information, text: 'ALTN Y BRK WITH A/SKID' }],
  ['290200003', { part: StatusPart.Information, text: 'SLATS/FLAPS SLOW' }],
  ['290200004', { part: StatusPart.Information, text: 'SLATS SLOW' }],
  ['290200005', { part: StatusPart.Information, text: 'FLAPS SLOW' }],
  // 22 AUTO FLIGHT (FWS FWC 1(2) FAULT)
  ['220200001', { part: StatusPart.Information, text: 'CAT 3 SINGLE ONLY' }],
  // 27 FLIGHT CONTROLS (STATUS), after CAT 3 SINGLE ONLY as in ELAC 1(2) FAULT
  ['270200001', { part: StatusPart.Information, text: 'ALTN LAW: PROT LOST' }],
  ['270200002', { part: StatusPart.Information, text: 'WHEN L/G DN: DIRECT LAW' }],
  // "WHEN L/G DN AND AP OFF: DIRECT LAW" in two lines, the second is the DIRECT LAW line
  ['270200003', { part: StatusPart.Information, text: 'WHEN L/G DN AND AP OFF:' }],
  ['270200004', { part: StatusPart.Information, text: 'DIRECT LAW' }],
  ['270200005', { part: StatusPart.Information, text: 'PITCH MECH BACK UP' }],
  ['270200006', { part: StatusPart.Information, text: 'ROLL DIRECT LAW' }],
  ['270200007', { part: StatusPart.Information, text: 'F/CTL INDICATIONS LOST' }],
  ['270200008', { part: StatusPart.Information, text: 'FUEL CONSUMPT INCRSD' }],
  ['270200009', { part: StatusPart.Information, text: 'FMS PRED UNRELIABLE' }],
  // 70 ENGINE (ENG 1(2) SHUT DOWN STATUS)
  ['700200001', { part: StatusPart.Information, text: 'ONE PACK ONLY IF WAI ON' }],
  // 34 NAVIGATION
  // NAV ADR DISAGREE and NAV IR 1(2)(3) / 1+2(1+3)(2+3) FAULT STATUS, see FWC/Logic/AdirsAlerts
  ['340500001', { part: StatusPart.Condition, text: 'IF NO SPD DISAGREE:' }],
  ['340200010', { part: StatusPart.Information, text: 'RISK OF UNDUE STALL WARN' }],
  ['340200011', { part: StatusPart.Information, text: 'IR MAY BE AVAIL IN ATT' }],
  ['340200001', { part: StatusPart.Information, text: 'FLS LIMITED TO F-APP + RAW' }],
  // 36 PNEUMATIC (ENG 1(2) HP VALVE FAULT STATUS), see FWC/Logic/BleedLeakMonitoringAlerts
  ['360200101', { part: StatusPart.Information, text: 'AIR PRESS LOW AT IDLE' }],
  // 28 FUEL (CTR L + R XFR FAULT (VALVES NOT FULLY OPEN))
  ['280200001', { part: StatusPart.Information, text: 'CTR TK USABLE BY GRAVITY' }],
  ['280200002', { part: StatusPart.Information, text: '2T (4400LBS) UNUSABLE' }],
  // 28 FUEL (FUEL L (R) WING TK LO LVL STATUS, if center tank not empty)
  ['280200003', { part: StatusPart.Information, text: 'CTR TK FEED: MAN ONLY' }],
  // 28 FUEL (FUEL L (R) OUTER XFR CLOSED STATUS), see FWC/Logic/FuelSystemFaultAlerts
  ['280200004', { part: StatusPart.Information, text: 'L OUTER TK UNUSABLE' }],
  ['280200005', { part: StatusPart.Information, text: 'R OUTER TK UNUSABLE' }],
  // 36 PNEUMATIC (X BLEED FAULT STATUS), see FWC/Logic/BleedAlerts
  ['360200001', { part: StatusPart.Information, text: 'X BLEED MAN CTL' }],
  // 24 ELECTRICAL (BAT 1(2) FAULT and BCL 1(2) FAULT STATUS)
  ['240200201', { part: StatusPart.Information, text: 'APU BAT START NOT AVAIL' }],
  // 27 FLIGHT CONTROLS (INOP SYS), before CAT 3 DUAL as in ELAC 1(2) FAULT
  ['270300001', { part: StatusPart.InopSys, text: 'F/CTL PROT' }],
  ['270300002', { part: StatusPart.InopSys, text: 'L+R ELEV' }],
  ['270300003', { part: StatusPart.InopSys, text: 'L ELEV' }],
  ['270300004', { part: StatusPart.InopSys, text: 'R ELEV' }],
  ['270300005', { part: StatusPart.InopSys, text: 'L+R AIL' }],
  ['270300006', { part: StatusPart.InopSys, text: 'L AIL' }],
  ['270300007', { part: StatusPart.InopSys, text: 'R AIL' }],
  ['270300008', { part: StatusPart.InopSys, text: 'ELAC 1+2' }],
  ['270300009', { part: StatusPart.InopSys, text: 'ELAC 1' }],
  ['270300010', { part: StatusPart.InopSys, text: 'ELAC 2' }],
  ['270300011', { part: StatusPart.InopSys, text: 'ELAC PITCH' }],
  ['270300015', { part: StatusPart.InopSys, text: 'SPLR 1+2' }],
  ['270300016', { part: StatusPart.InopSys, text: 'SPLR 1' }],
  ['270300017', { part: StatusPart.InopSys, text: 'SPLR 2' }],
  ['270300018', { part: StatusPart.InopSys, text: 'SPLR 3+4' }],
  ['270300019', { part: StatusPart.InopSys, text: 'SPLR 3' }],
  ['270300020', { part: StatusPart.InopSys, text: 'SPLR 4' }],
  ['270300021', { part: StatusPart.InopSys, text: 'SPLR 5' }],
  ['270300012', { part: StatusPart.InopSys, text: 'SEC 1' }],
  ['270300013', { part: StatusPart.InopSys, text: 'SEC 2' }],
  ['270300014', { part: StatusPart.InopSys, text: 'SEC 3' }],
  ['270300022', { part: StatusPart.InopSys, text: 'SPD BRK' }],
  ['270300023', { part: StatusPart.InopSys, text: 'AUTO BRK' }],
  ['270300024', { part: StatusPart.InopSys, text: 'FCDC 1+2' }],
  ['270300025', { part: StatusPart.InopSys, text: 'FCDC 1' }],
  ['270300026', { part: StatusPart.InopSys, text: 'FCDC 2' }],
  // 22 AUTO FLIGHT (YAW DAMPER / RUD TRIM / RUD TRV LIM SYS, before AP 1+2 as on the aircraft, see
  // FWC/Logic/FacActuatorAlerts)
  ['220300004', { part: StatusPart.InopSys, text: 'YAW DAMPER' }],
  ['220300007', { part: StatusPart.InopSys, text: 'RUD TRIM' }],
  ['220300010', { part: StatusPart.InopSys, text: 'RUD TRV LIM' }],
  ['270300027', { part: StatusPart.InopSys, text: 'AP 1+2' }],
  ['270300028', { part: StatusPart.InopSys, text: 'CAT 2' }],
  // 22 AUTO FLIGHT (FWS FWC 1(2) FAULT)
  ['220300001', { part: StatusPart.InopSys, text: 'CAT 3 DUAL' }],
  // 22 AUTO FLIGHT (YAW DAMPER 1(2), RUD TRIM 1(2) FAULT, RUD TRV LIM 1(2), after CAT 3 DUAL as on the aircraft, see
  // FWC/Logic/FacActuatorAlerts)
  ['220300002', { part: StatusPart.InopSys, text: 'YAW DAMPER 1' }],
  ['220300003', { part: StatusPart.InopSys, text: 'YAW DAMPER 2' }],
  ['220300005', { part: StatusPart.InopSys, text: 'RUD TRIM 1' }],
  ['220300006', { part: StatusPart.InopSys, text: 'RUD TRIM 2' }],
  ['220300008', { part: StatusPart.InopSys, text: 'RUD TRV LIM 1' }],
  ['220300009', { part: StatusPart.InopSys, text: 'RUD TRV LIM 2' }],
  // 36 PNEUMATIC (ENG 1(2) SHUT DOWN INOP SYS, between CAT 3 DUAL and PACK 1(2))
  ['360300001', { part: StatusPart.InopSys, text: 'ENG 1 BLEED' }],
  ['360300002', { part: StatusPart.InopSys, text: 'ENG 2 BLEED' }],
  // ENG 1+2 BLEED FAULT (ENG 1 BLEED, ENG 2 BLEED, APU BLEED, PACK 1+2) and X BLEED FAULT
  ['360300003', { part: StatusPart.InopSys, text: 'APU BLEED' }],
  ['360300004', { part: StatusPart.InopSys, text: 'X BLEED' }],
  // 70 ENGINE (REVERSER FAULT, THR LEVER FAULT and THR LEVER DISAGREE INOP SYS)
  ['780300001', { part: StatusPart.InopSys, text: 'REVERSER 1' }],
  ['780300002', { part: StatusPart.InopSys, text: 'REVERSER 2' }],
  ['730300001', { part: StatusPart.InopSys, text: 'ENG 1 THR' }],
  ['730300002', { part: StatusPart.InopSys, text: 'ENG 2 THR' }],
  // 29 HYDRAULIC (INOP SYS, see FWC/Logic/HydraulicAlerts), the lists merged in their order; G ENG 1 PUMP and Y ENG 2
  // PUMP are the ENG 1(2) SHUT DOWN codes 290300001/2 below
  ['290300010', { part: StatusPart.InopSys, text: 'GREEN HYD' }],
  ['290300011', { part: StatusPart.InopSys, text: 'BLUE HYD' }],
  ['290300012', { part: StatusPart.InopSys, text: 'YELLOW HYD' }],
  ['290300013', { part: StatusPart.InopSys, text: 'B+Y HYD' }],
  ['290300014', { part: StatusPart.InopSys, text: 'G+B HYD' }],
  ['290300015', { part: StatusPart.InopSys, text: 'G+Y HYD' }],
  ['290300016', { part: StatusPart.InopSys, text: 'F/CTL PROT' }],
  ['290300017', { part: StatusPart.InopSys, text: 'STABILIZER' }],
  ['290300018', { part: StatusPart.InopSys, text: 'L ELEV' }],
  ['290300019', { part: StatusPart.InopSys, text: 'R ELEV' }],
  ['290300020', { part: StatusPart.InopSys, text: 'L+R AIL' }],
  ['290300021', { part: StatusPart.InopSys, text: 'SPLR 1+5' }],
  ['290300022', { part: StatusPart.InopSys, text: 'SPLR 3' }],
  ['290300023', { part: StatusPart.InopSys, text: 'SPLR 2+4' }],
  ['290300024', { part: StatusPart.InopSys, text: 'SPLR 2+3+4' }],
  ['290300025', { part: StatusPart.InopSys, text: 'SPLR 1+3+5' }],
  ['290300026', { part: StatusPart.InopSys, text: 'SPLR 1+2+4+5' }],
  ['290300027', { part: StatusPart.InopSys, text: 'SPD BRK' }],
  ['290300028', { part: StatusPart.InopSys, text: 'SLATS' }],
  ['290300029', { part: StatusPart.InopSys, text: 'FLAPS' }],
  ['290300030', { part: StatusPart.InopSys, text: 'CAT 3 DUAL' }],
  ['290300031', { part: StatusPart.InopSys, text: 'AP 1+2' }],
  ['290300032', { part: StatusPart.InopSys, text: 'ANTI SKID' }],
  ['290300033', { part: StatusPart.InopSys, text: 'AUTO BRK' }],
  ['290300034', { part: StatusPart.InopSys, text: 'NORM BRK' }],
  ['290300035', { part: StatusPart.InopSys, text: 'N/W STRG' }],
  ['290300036', { part: StatusPart.InopSys, text: 'L/G RETRACT' }],
  ['290300037', { part: StatusPart.InopSys, text: 'CARGO DOOR' }],
  ['290300038', { part: StatusPart.InopSys, text: 'REVERSER 1' }],
  ['290300039', { part: StatusPart.InopSys, text: 'REVERSER 2' }],
  ['290300040', { part: StatusPart.InopSys, text: 'REVERSER 1+2' }],
  ['290300041', { part: StatusPart.InopSys, text: 'EMER GEN' }],
  ['290300042', { part: StatusPart.InopSys, text: 'PTU' }],
  ['290300043', { part: StatusPart.InopSys, text: 'B ELEC PUMP' }],
  ['290300044', { part: StatusPart.InopSys, text: 'Y ELEC PUMP' }],
  ['290300045', { part: StatusPart.InopSys, text: 'YAW DAMPER' }],
  ['290300046', { part: StatusPart.InopSys, text: 'YAW DAMPER 1' }],
  ['290300047', { part: StatusPart.InopSys, text: 'YAW DAMPER 2' }],
  ['290300048', { part: StatusPart.InopSys, text: 'CAT 2' }],
  ['290300049', { part: StatusPart.InopSys, text: 'RAT' }],
  // 49 APU (APU AUTO (EMER) SHUT DOWN INOP SYS)
  ['490300001', { part: StatusPart.InopSys, text: 'APU' }],
  // 21 AIR CONDITIONING
  ['210300001', { part: StatusPart.InopSys, text: 'PACK 1' }],
  ['210300002', { part: StatusPart.InopSys, text: 'PACK 2' }],
  ['210300003', { part: StatusPart.InopSys, text: 'PACK 1+2' }],
  ['210300004', { part: StatusPart.InopSys, text: 'COND CTL 1' }],
  ['210300005', { part: StatusPart.InopSys, text: 'COND CTL 2' }],
  ['210300006', { part: StatusPart.InopSys, text: 'COND CTL 1-A' }],
  ['210300007', { part: StatusPart.InopSys, text: 'COND CTL 1-B' }],
  ['210300008', { part: StatusPart.InopSys, text: 'COND CTL 2-A' }],
  ['210300009', { part: StatusPart.InopSys, text: 'COND CTL 2-B' }],
  ['210300010', { part: StatusPart.InopSys, text: 'HOT AIR' }],
  ['210300011', { part: StatusPart.InopSys, text: 'L+R CAB FAN' }],
  ['210300012', { part: StatusPart.InopSys, text: 'GALLEY FAN' }],
  // CAB PR SYS 1+2 FAULT
  ['210300013', { part: StatusPart.InopSys, text: 'CAB PR 1+2' }],
  // ENG 1(2) SHUT DOWN INOP SYS, in its order with 22 CAT 3 DUAL and 21 PACK 1(2)
  ['240300001', { part: StatusPart.InopSys, text: 'MAIN GALLEY' }],
  ['240300002', { part: StatusPart.InopSys, text: 'GEN 1' }],
  ['240300003', { part: StatusPart.InopSys, text: 'GEN 2' }],
  // 24 ELECTRICAL (BAT/BCL FAULT, GEN OVERLOAD INOP SYS)
  ['240300201', { part: StatusPart.InopSys, text: 'BAT 1' }],
  ['240300202', { part: StatusPart.InopSys, text: 'BAT 2' }],
  ['240300203', { part: StatusPart.InopSys, text: 'BCL 1' }],
  ['240300204', { part: StatusPart.InopSys, text: 'BCL 2' }],
  ['240300205', { part: StatusPart.InopSys, text: 'GALY/CAB' }],
  ['290300001', { part: StatusPart.InopSys, text: 'G ENG 1 PUMP' }],
  ['290300002', { part: StatusPart.InopSys, text: 'Y ENG 2 PUMP' }],
  ['300300001', { part: StatusPart.InopSys, text: 'WING A. ICE' }],
  // ANTI ICE ENG 1(2) VALVE CLSD
  ['300300002', { part: StatusPart.InopSys, text: 'ENG 1 A. ICE' }],
  ['300300003', { part: StatusPart.InopSys, text: 'ENG 2 A. ICE' }],
  // WING A.ICE L(R) HI PR, see FWC/Logic/WingAntiIceAlerts
  ['300300004', { part: StatusPart.InopSys, text: 'WAI REGUL' }],
  // ANTI ICE probe and window heat INOP SYS, see FWC/Logic/ProbeWindowHeatAlerts
  ['300300010', { part: StatusPart.InopSys, text: 'CAPT PITOT' }],
  ['300300011', { part: StatusPart.InopSys, text: 'F/O PITOT' }],
  ['300300012', { part: StatusPart.InopSys, text: 'STBY PITOT' }],
  ['300300013', { part: StatusPart.InopSys, text: 'CAPT PROBES' }],
  ['300300014', { part: StatusPart.InopSys, text: 'F/O PROBES' }],
  ['300300015', { part: StatusPart.InopSys, text: 'STBY PROBES' }],
  ['300300016', { part: StatusPart.InopSys, text: 'CAPT L STAT' }],
  ['300300017', { part: StatusPart.InopSys, text: 'CAPT R STAT' }],
  ['300300018', { part: StatusPart.InopSys, text: 'F/O L STAT' }],
  ['300300019', { part: StatusPart.InopSys, text: 'F/O R STAT' }],
  ['300300020', { part: StatusPart.InopSys, text: 'STBY L STAT' }],
  ['300300021', { part: StatusPart.InopSys, text: 'STBY R STAT' }],
  ['300300022', { part: StatusPart.InopSys, text: 'CAPT AOA' }],
  ['300300023', { part: StatusPart.InopSys, text: 'F/O AOA' }],
  ['300300024', { part: StatusPart.InopSys, text: 'STBY AOA' }],
  ['300300025', { part: StatusPart.InopSys, text: 'CAPT TAT' }],
  ['300300026', { part: StatusPart.InopSys, text: 'F/O TAT' }],
  ['300300027', { part: StatusPart.InopSys, text: 'WSHLD HEAT' }],
  ['300300028', { part: StatusPart.InopSys, text: 'L WSHLD HEAT' }],
  ['300300029', { part: StatusPart.InopSys, text: 'R WSHLD HEAT' }],
  ['300300030', { part: StatusPart.InopSys, text: 'L WNDW HEAT' }],
  ['300300031', { part: StatusPart.InopSys, text: 'R WNDW HEAT' }],
  // L/G DOORS NOT CLOSED
  ['320300001', { part: StatusPart.InopSys, text: 'L/G DOOR' }],
  // 36 PNEUMATIC (LEAK DET FAULT, APU BLEED LEAK, BLEED MONIT SYS 1(2) FAULT, BLEED MONITORING FAULT), see
  // FWC/Logic/BleedLeakMonitoringAlerts
  ['360300101', { part: StatusPart.InopSys, text: 'ENG 1 LK DET' }],
  ['360300102', { part: StatusPart.InopSys, text: 'ENG 2 LK DET' }],
  ['360300103', { part: StatusPart.InopSys, text: 'L WNG LK DET' }],
  ['360300104', { part: StatusPart.InopSys, text: 'R WNG LK DET' }],
  ['360300105', { part: StatusPart.InopSys, text: 'APU LEAK DET' }],
  ['360300106', { part: StatusPart.InopSys, text: 'APU BLEED' }],
  ['360300107', { part: StatusPart.InopSys, text: 'BMC 1' }],
  ['360300108', { part: StatusPart.InopSys, text: 'BMC 2' }],
  ['360300109', { part: StatusPart.InopSys, text: 'BMC 1 + 2' }],
  // 31 INDICATING/RECORDING (FWS FWC 1(2) FAULT)
  ['310300001', { part: StatusPart.InopSys, text: 'FWC 1' }],
  ['310300002', { part: StatusPart.InopSys, text: 'FWC 2' }],
  // 26 FIRE PROTECTION (ENG 1(2) FIRE LOOP A(B) FAULT / FIRE DET FAULT)
  ['260300001', { part: StatusPart.InopSys, text: 'ENG 1 LOOP A' }],
  ['260300002', { part: StatusPart.InopSys, text: 'ENG 1 LOOP B' }],
  ['260300003', { part: StatusPart.InopSys, text: 'ENG 2 LOOP A' }],
  ['260300004', { part: StatusPart.InopSys, text: 'ENG 2 LOOP B' }],
  ['260300005', { part: StatusPart.InopSys, text: 'APU LOOP A' }],
  ['260300006', { part: StatusPart.InopSys, text: 'APU LOOP B' }],
  ['260300007', { part: StatusPart.InopSys, text: 'FIRE DET 1' }],
  ['260300008', { part: StatusPart.InopSys, text: 'FIRE DET 2' }],
  ['260300009', { part: StatusPart.InopSys, text: 'APU FIRE DET' }],
  // SMOKE FWD (AFT) CRG DET FAULT STATUS
  ['260300010', { part: StatusPart.InopSys, text: 'FWD CRG DET' }],
  ['260300011', { part: StatusPart.InopSys, text: 'AFT CRG DET' }],
  // 28 FUEL
  ['280300001', { part: StatusPart.InopSys, text: 'L TK PUMP 1' }],
  ['280300002', { part: StatusPart.InopSys, text: 'L TK PUMP 2' }],
  ['280300003', { part: StatusPart.InopSys, text: 'R TK PUMP 1' }],
  ['280300004', { part: StatusPart.InopSys, text: 'R TK PUMP 2' }],
  ['280300005', { part: StatusPart.InopSys, text: 'L TK PUMPS' }],
  ['280300006', { part: StatusPart.InopSys, text: 'R TK PUMPS' }],
  ['280300007', { part: StatusPart.InopSys, text: 'FUEL X FEED' }],
  ['280300008', { part: StatusPart.InopSys, text: 'CTR TK L XFR' }],
  ['280300009', { part: StatusPart.InopSys, text: 'CTR TK R XFR' }],
  ['280300010', { part: StatusPart.InopSys, text: 'CTR TK XFR' }],
  // FUEL L (R) OUTER XFR OPEN, see FWC/Logic/FuelSystemFaultAlerts
  ['280300011', { part: StatusPart.InopSys, text: 'L CELL VALVE' }],
  ['280300012', { part: StatusPart.InopSys, text: 'R CELL VALVE' }],
  // 34 NAVIGATION
  // NAV ADR, IR and RA alerts INOP SYS, see FWC/Logic/AdirsAlerts; ADR 1(2)(3), RA 1(2) and the lines of other chapters
  // keep their codes
  ['340300020', { part: StatusPart.InopSys, text: 'REAC W/S DET' }],
  ['340300021', { part: StatusPart.InopSys, text: 'ADR 1+2' }],
  ['340300022', { part: StatusPart.InopSys, text: 'ADR 1+3' }],
  ['340300023', { part: StatusPart.InopSys, text: 'ADR 2+3' }],
  ['340300024', { part: StatusPart.InopSys, text: 'ADR 1+2+3' }],
  ['340300025', { part: StatusPart.InopSys, text: 'IR 1' }],
  ['340300026', { part: StatusPart.InopSys, text: 'IR 2' }],
  ['340300027', { part: StatusPart.InopSys, text: 'IR 3' }],
  ['340300028', { part: StatusPart.InopSys, text: 'IR 1+2' }],
  ['340300029', { part: StatusPart.InopSys, text: 'IR 1+3' }],
  ['340300030', { part: StatusPart.InopSys, text: 'IR 2+3' }],
  ['340300031', { part: StatusPart.InopSys, text: 'RA 1+2' }],
  ['340300032', { part: StatusPart.InopSys, text: 'RUD TRV LIM' }],
  ['340300033', { part: StatusPart.InopSys, text: 'CAB PR 1+2' }],
  ['340300034', { part: StatusPart.InopSys, text: 'A/CALL OUT' }],
  // NAV PRED W/S DET FAULT, see FWC/Logic/PredictiveWindshearAlerts
  ['340300035', { part: StatusPart.InopSys, text: 'PRED W/S DET' }],
  ['340300001', { part: StatusPart.InopSys, text: 'GPS 1' }],
  ['340300002', { part: StatusPart.InopSys, text: 'GPS 2' }],
  ['340300003', { part: StatusPart.InopSys, text: 'GPS 1+2' }],
  // NAV TCAS FAULT, NAV ATC/XPDR 1(2) FAULT and 1+2 FAULT, in the order of the 1+2 FAULT STATUS
  ['340300004', { part: StatusPart.InopSys, text: 'TCAS' }],
  ['340300005', { part: StatusPart.InopSys, text: 'ATC/XPDR 1' }],
  ['340300006', { part: StatusPart.InopSys, text: 'ATC/XPDR 2' }],
  ['340300007', { part: StatusPart.InopSys, text: 'ADS-B RPTG 1' }],
  ['340300008', { part: StatusPart.InopSys, text: 'ADS-B RPTG 2' }],
  // NAV LS TUNING DISAGREE INOP SYS
  ['340300009', { part: StatusPart.InopSys, text: 'CAT 2' }],
  // 74 IGNITION (ENG 1(2) IGN FAULT INOP SYS)
  ['740300001', { part: StatusPart.InopSys, text: 'ENG 1 IGN A' }],
  ['740300002', { part: StatusPart.InopSys, text: 'ENG 1 IGN B' }],
  ['740300003', { part: StatusPart.InopSys, text: 'ENG 2 IGN A' }],
  ['740300004', { part: StatusPart.InopSys, text: 'ENG 2 IGN B' }],
  ['740300005', { part: StatusPart.InopSys, text: 'ENG 1 IGN' }],
  ['740300006', { part: StatusPart.InopSys, text: 'ENG 2 IGN' }],
  // 24 ELECTRICAL (bus and TR faults INOP SYS, see FWC/Logic/ElecBusAlerts)
  ['240300101', { part: StatusPart.InopSys, text: 'BLUE HYD' }],
  ['240300102', { part: StatusPart.InopSys, text: 'B HYD' }],
  ['240300103', { part: StatusPart.InopSys, text: 'SPLR 1+2+5' }],
  ['240300104', { part: StatusPart.InopSys, text: 'SPLR 3' }],
  ['240300105', { part: StatusPart.InopSys, text: 'ELAC 2' }],
  ['240300106', { part: StatusPart.InopSys, text: 'SEC 2+3' }],
  ['240300107', { part: StatusPart.InopSys, text: 'ADR 1' }],
  ['240300108', { part: StatusPart.InopSys, text: 'ADR 2' }],
  ['240300109', { part: StatusPart.InopSys, text: 'ADR 3' }],
  ['240300110', { part: StatusPart.InopSys, text: 'RA 1' }],
  ['240300111', { part: StatusPart.InopSys, text: 'RA 2' }],
  ['240300112', { part: StatusPart.InopSys, text: 'CAPT PITOT' }],
  ['240300113', { part: StatusPart.InopSys, text: 'CAPT AOA' }],
  ['240300114', { part: StatusPart.InopSys, text: 'CAPT TAT' }],
  ['240300115', { part: StatusPart.InopSys, text: 'F/O PITOT' }],
  ['240300116', { part: StatusPart.InopSys, text: 'F/O AOA' }],
  ['240300117', { part: StatusPart.InopSys, text: 'F/O TAT' }],
  ['240300118', { part: StatusPart.InopSys, text: 'CAPT STAT HEAT' }],
  ['240300119', { part: StatusPart.InopSys, text: 'F/O STAT HEAT' }],
  ['240300120', { part: StatusPart.InopSys, text: 'STBY STAT HEAT' }],
  ['240300121', { part: StatusPart.InopSys, text: 'WSHLD HEAT' }],
  ['240300122', { part: StatusPart.InopSys, text: 'L WSHLD HEAT' }],
  ['240300123', { part: StatusPart.InopSys, text: 'R WSHLD HEAT' }],
  ['240300124', { part: StatusPart.InopSys, text: 'WNDW HEAT' }],
  ['240300125', { part: StatusPart.InopSys, text: 'L WNDW HEAT' }],
  ['240300126', { part: StatusPart.InopSys, text: 'R WNDW HEAT' }],
  ['240300127', { part: StatusPart.InopSys, text: 'CAT 2' }],
  ['240300128', { part: StatusPart.InopSys, text: 'CAT 3' }],
  ['240300129', { part: StatusPart.InopSys, text: 'AP 1' }],
  ['240300130', { part: StatusPart.InopSys, text: 'AP 2' }],
  ['240300131', { part: StatusPart.InopSys, text: 'A/THR' }],
  ['240300132', { part: StatusPart.InopSys, text: 'FCU 1' }],
  ['240300133', { part: StatusPart.InopSys, text: 'FCU 2' }],
  ['240300134', { part: StatusPart.InopSys, text: 'FAC 1' }],
  ['240300135', { part: StatusPart.InopSys, text: 'FAC 2' }],
  ['240300136', { part: StatusPart.InopSys, text: 'YAW DAMPER 1' }],
  ['240300137', { part: StatusPart.InopSys, text: 'YAW DAMPER 2' }],
  ['240300138', { part: StatusPart.InopSys, text: 'RUD TRIM 1' }],
  ['240300139', { part: StatusPart.InopSys, text: 'RUD TRIM 2' }],
  ['240300140', { part: StatusPart.InopSys, text: 'RUD TRV LIM 1' }],
  ['240300141', { part: StatusPart.InopSys, text: 'RUD TRV LIM 2' }],
  ['240300142', { part: StatusPart.InopSys, text: 'FCDC 1' }],
  ['240300143', { part: StatusPart.InopSys, text: 'FCDC 2' }],
  ['240300144', { part: StatusPart.InopSys, text: 'LS 1' }],
  ['240300145', { part: StatusPart.InopSys, text: 'LS 2' }],
  ['240300146', { part: StatusPart.InopSys, text: 'SDAC 1' }],
  ['240300147', { part: StatusPart.InopSys, text: 'SDAC 2' }],
  ['240300148', { part: StatusPart.InopSys, text: 'DMC 1' }],
  ['240300149', { part: StatusPart.InopSys, text: 'DMC 2' }],
  ['240300150', { part: StatusPart.InopSys, text: 'DMC 3' }],
  ['240300151', { part: StatusPart.InopSys, text: 'RECORDER SYS' }],
  ['240300152', { part: StatusPart.InopSys, text: 'GPWS' }],
  ['240300153', { part: StatusPart.InopSys, text: 'GPWS TERR' }],
  ['240300154', { part: StatusPart.InopSys, text: 'VHF 1' }],
  ['240300155', { part: StatusPart.InopSys, text: 'VHF 2' }],
  ['240300156', { part: StatusPart.InopSys, text: 'ACP 1+2' }],
  ['240300157', { part: StatusPart.InopSys, text: 'ACP 3' }],
  ['240300158', { part: StatusPart.InopSys, text: 'L+R TK PUMP 1' }],
  ['240300159', { part: StatusPart.InopSys, text: 'L+R TK PUMP 2' }],
  ['240300160', { part: StatusPart.InopSys, text: 'B ELEC PUMP' }],
  ['240300161', { part: StatusPart.InopSys, text: 'Y ELEC PUMP' }],
  ['240300162', { part: StatusPart.InopSys, text: 'ENG 2 START' }],
  ['240300163', { part: StatusPart.InopSys, text: 'PACK 2 REGUL' }],
  ['240300164', { part: StatusPart.InopSys, text: 'CAB PR 1' }],
  ['240300165', { part: StatusPart.InopSys, text: 'CAB PR 2' }],
  ['240300166', { part: StatusPart.InopSys, text: 'VENT BLOWER' }],
  ['240300167', { part: StatusPart.InopSys, text: 'VENT EXTRACT' }],
  ['240300168', { part: StatusPart.InopSys, text: 'AVNCS VENT' }],
  ['240300169', { part: StatusPart.InopSys, text: 'GND COOL' }],
  ['240300170', { part: StatusPart.InopSys, text: 'LGCIU 1' }],
  ['240300171', { part: StatusPart.InopSys, text: 'LGCIU 2' }],
  ['240300172', { part: StatusPart.InopSys, text: 'BRK SYS 1' }],
  ['240300173', { part: StatusPart.InopSys, text: 'BRK SYS 2' }],
  ['240300174', { part: StatusPart.InopSys, text: 'BRK SYS 1+2' }],
  ['240300175', { part: StatusPart.InopSys, text: 'ALTN BRK' }],
  ['240300176', { part: StatusPart.InopSys, text: 'ANTI SKID' }],
  ['240300177', { part: StatusPart.InopSys, text: 'N/W STRG' }],
  ['240300178', { part: StatusPart.InopSys, text: 'REVERSER 1+2' }],
  ['240300179', { part: StatusPart.InopSys, text: 'SDCU' }],
  ['240300180', { part: StatusPart.InopSys, text: 'LAV DET' }],
  ['240300181', { part: StatusPart.InopSys, text: 'TR 1' }],
  ['240300182', { part: StatusPart.InopSys, text: 'TR 2' }],
  ['240300183', { part: StatusPart.InopSys, text: 'APU GEN' }],
  // 46 INFORMATION SYSTEMS (ATSU FAULT, COMPANY FAULT), see FWC/Logic/DatalinkAlerts
  ['460300001', { part: StatusPart.InopSys, text: 'ATSU' }],
  ['460300002', { part: StatusPart.InopSys, text: 'DATA COMPANY' }],
  // 21 VENT, AIR AFT CRG VENT FAULT, COND AFT CRG ISOL VALVE, see FWC/Logic/VentilationAlerts
  ['210300014', { part: StatusPart.InopSys, text: 'AVNCS VENT' }],
  ['210300015', { part: StatusPart.InopSys, text: 'VENT BLOWER' }],
  ['210300016', { part: StatusPart.InopSys, text: 'VENT EXTRACT' }],
  ['210300017', { part: StatusPart.InopSys, text: 'AVNCS VALVE' }],
  ['210300018', { part: StatusPart.InopSys, text: 'AFT CRG VENT' }],
  // 22 AUTO FLT TCAS MODE FAULT, see FWC/Logic/TcasModeFaultAlert
  ['220300011', { part: StatusPart.InopSys, text: 'AP/FD TCAS' }],
  // 23 COM CIDS 1 + 2 FAULT, SINGLE PTT STUCK, VHF 3 DATA FAULT, see FWC/Logic/CommunicationAlerts
  ['230300001', { part: StatusPart.InopSys, text: 'CIDS' }],
  ['230300002', { part: StatusPart.InopSys, text: 'SINGLE PTT' }],
  ['230300003', { part: StatusPart.InopSys, text: 'VHF 3 DATA' }],
]);

const StatusMessageOrder = new Map([...StatusMessages.keys()].map((code, index) => [code, index]));

/**
 * The known codes, without duplicates, in the order of the STATUS page. A line that two alerts give with different codes
 * (the same part and text, e.g. BLUE HYD of AC BUS 1 FAULT and of HYD B SYS LO PR) is shown once, at its first place.
 */
export function orderStatusCodes(codes: readonly string[]): string[] {
  const shownLines = new Set<string>();
  return [...new Set(codes)]
    .filter((code) => StatusMessages.has(code))
    .sort((a, b) => StatusMessageOrder.get(a)! - StatusMessageOrder.get(b)!)
    .filter((code) => {
      const message = StatusMessages.get(code)!;
      const line = `${message.part}:${message.text}`;
      if (shownLines.has(line)) {
        return false;
      }
      shownLines.add(line);
      return true;
    });
}

/** The colour of the lines of each part, as FWC text control codes */
const PART_COLOURS: Record<StatusPart, string> = {
  [StatusPart.Limitation]: '\x1b<5m',
  [StatusPart.Condition]: '\x1b<7m',
  [StatusPart.Information]: '\x1b<3m',
  [StatusPart.InopSys]: '\x1b<4m',
  [StatusPart.ProcedureTitle]: '\x1b<4m',
};

export interface StatusPageTexts {
  /** Whether the page is empty: NORMAL is shown */
  normal: boolean;
  /** The left column, lines separated by \r */
  left: string;
  /** The right column, lines separated by \r */
  right: string;
}

/**
 * The CANCELLED CAUTION part of the left column, in white: the FWC sends this code, then the E/WD title codes
 * (EwdMessages) of the cautions cancelled with the EMER CANC pb.
 */
export const CANCELLED_CAUTION_STATUS_CODE = '310600001';

/** The E/WD title of a cancelled caution, in white and not underlined, or '' for an unknown code */
function cancelledCautionTitle(ewdTitleCode: string): string {
  const title = formatEwdMessages([ewdTitleCode])[0] ?? '';
  // eslint-disable-next-line no-control-regex
  const plain = title.replace(/\x1b4m|\x1bm/g, '').replace(/\x1b<\dm/g, '');
  return plain.trim().length > 0 ? `\x1b<7m${plain}` : '';
}

/**
 * The texts of the STATUS page from the codes of its left and right columns. The titles are white and underlined; an
 * empty page shows NORMAL in green. The CANCELLED CAUTION part comes last in the left column, after a blank line, as
 * every block of the page.
 */
export function formatStatusPage(leftCodes: readonly string[], rightCodes: readonly string[]): StatusPageTexts {
  const lines = (codes: readonly string[]) =>
    orderStatusCodes(codes).map((code) => {
      const message = StatusMessages.get(code)!;
      return `${PART_COLOURS[message.part]}${message.text}`;
    });
  const cancelledCautionIndex = leftCodes.indexOf(CANCELLED_CAUTION_STATUS_CODE);
  const statusLeftCodes = cancelledCautionIndex === -1 ? leftCodes : leftCodes.slice(0, cancelledCautionIndex);
  const cancelledCautions =
    cancelledCautionIndex === -1
      ? []
      : leftCodes
          .slice(cancelledCautionIndex + 1)
          .map(cancelledCautionTitle)
          .filter((title) => title !== '');
  const left = lines(statusLeftCodes);
  const inopSys = lines(rightCodes);

  if (left.length === 0 && inopSys.length === 0 && cancelledCautions.length === 0) {
    return { normal: true, left: '\r\r              \x1b<3mNORMAL', right: '' };
  }
  const cancelledCautionPart =
    cancelledCautions.length > 0
      ? [...(left.length > 0 ? [''] : []), '\x1b<7m\x1b4mCANCELLED CAUTION\x1bm', ...cancelledCautions]
      : [];
  return {
    normal: false,
    left: [...left, ...cancelledCautionPart].join('\r'),
    right: inopSys.length > 0 ? ['\x1b<7m\x1b4mINOP SYS\x1bm', ...inopSys].join('\r') : '',
  };
}
