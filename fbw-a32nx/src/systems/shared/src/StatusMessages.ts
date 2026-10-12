// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The parts of the A320 ECAM STATUS page (FCOM DSC-31-20): limitations (blue), approach procedures (white), procedures
 * (blue) and information (green) on the left; inoperative systems (amber) on the right. Only the parts used by the
 * alerts that have their status modelled are here.
 */
export enum StatusPart {
  Limitation,
  /** A condition of the next limitation or procedure lines (white), e.g. "IF SEVERE ICE ACCRETION:" */
  Condition,
  Information,
  InopSys,
}

/** The STATUS page lines, by code: 34 02 xxxxx information, 34 03 xxxxx inoperative systems (as the A380 codes) */
const StatusMessages = new Map<string, { part: StatusPart; text: string }>([
  // 24 ELECTRICAL (FCOM PRO-ABN-ELEC bus faults STATUS, see FWC/Logic/ElecBusAlerts), before LDG DIST PROC as in the FCOM
  ['240500101', { part: StatusPart.Condition, text: 'IF ABN CAB V/S:' }],
  ['240400106', { part: StatusPart.Limitation, text: 'MAX FL..........100/MEA' }],
  ['240400103', { part: StatusPart.Limitation, text: 'MIN RAT SPEED....140 KT' }],
  ['240400104', { part: StatusPart.Limitation, text: 'PROC: GRVTY FUEL FEEDING' }],
  ['240400101', { part: StatusPart.Limitation, text: 'MAX BRK PR.....1000 PSI' }],
  ['240400105', { part: StatusPart.Limitation, text: 'FUEL GRVTY FEED' }],
  ['240400102', { part: StatusPart.Limitation, text: 'L/G..........GRVTY EXTN' }],
  // 70 ENGINE (FCOM PRO-ABN-ENG ENG 1(2) SHUT DOWN STATUS, a320_fcom.txt l.81168-81264), in the order of the FCOM
  ['700400001', { part: StatusPart.Limitation, text: 'AVOID ICING CONDITIONS' }],
  ['700500001', { part: StatusPart.Condition, text: 'IF SEVERE ICE ACCRETION:' }],
  ['700400002', { part: StatusPart.Limitation, text: 'MIN SPD....VLS+10/G DOT' }],
  ['700400003', { part: StatusPart.Limitation, text: 'MANEUVER WITH CARE' }],
  ['700400004', { part: StatusPart.Limitation, text: 'LDG DIST PROC....APPLY' }],
  // "If REV unlocked" (l.81172-81173, 81205-81214), see FWC/Logic/EngineFailAlerts engineShutDownStatus; MAX SPEED
  // 300/.78 is also the STATUS of REVERSE UNLOCKED (FWC/Logic/FadecReverserAlerts)
  ['700400058', { part: StatusPart.Limitation, text: 'MAX SPEED.......300/.78' }],
  ['700500051', { part: StatusPart.Condition, text: 'APPR PROC:' }],
  ['700500052', { part: StatusPart.Condition, text: 'IF BUFFET:' }],
  ['700400059', { part: StatusPart.Limitation, text: 'FOR LDG......USE FLAP 3' }],
  ['700400060', { part: StatusPart.Limitation, text: 'GPWS LDG FLAP 3......ON' }],
  ['700400061', { part: StatusPart.Limitation, text: 'APPR SPD.....VREF+10 KT' }],
  ['700400062', { part: StatusPart.Limitation, text: 'LDG DIST PROC....APPLY' }],
  ['700500002', { part: StatusPart.Condition, text: 'IF PERF PERMITS:' }],
  ['700400005', { part: StatusPart.Limitation, text: 'X BLEED...........OPEN' }],
  ['700500003', { part: StatusPart.Condition, text: 'IF NO ENG 1 DAMAGE:' }],
  ['700400006', { part: StatusPart.Limitation, text: 'CONSIDER ENG 1 RELIGHT' }],
  ['700500004', { part: StatusPart.Condition, text: 'IF NO ENG 2 DAMAGE:' }],
  ['700400007', { part: StatusPart.Limitation, text: 'CONSIDER ENG 2 RELIGHT' }],
  // 80 STARTING (A320neo FCOM PRO-ABN-ENG ENG 1(2) START FAULT STATUS, STARTER SHAFT SHEAR)
  ['800400001', { part: StatusPart.Limitation, text: 'ENG 1 WINDMILL START ONLY' }],
  ['800400002', { part: StatusPart.Limitation, text: 'ENG 2 WINDMILL START ONLY' }],
  // 70 ENGINE (FCOM PRO-ABN-ENG STATUS of FADEC FAULT l.79659-79660, THR LEVER DISAGREE l.81738-81771, THR LEVER FAULT
  // l.81866-81874), lines by FWC/Logic/FadecReverserAlerts
  ['700400050', { part: StatusPart.Limitation, text: 'THR LVR 1 NOT ABV IDLE' }],
  ['700400051', { part: StatusPart.Limitation, text: 'THR LVR 2 NOT ABV IDLE' }],
  ['700500050', { part: StatusPart.Condition, text: 'WHEN SLATS OUT:' }],
  ['700400052', { part: StatusPart.Limitation, text: 'ENG 1 AT IDLE' }],
  ['700400053', { part: StatusPart.Limitation, text: 'ENG 2 AT IDLE' }],
  ['700400054', { part: StatusPart.Limitation, text: 'ENG 1 AVAIL MAX PWR:CLB' }],
  ['700400055', { part: StatusPart.Limitation, text: 'ENG 2 AVAIL MAX PWR:CLB' }],
  ['700400056', { part: StatusPart.Limitation, text: 'GND ENG 1 MAX PWR: IDLE' }],
  ['700400057', { part: StatusPart.Limitation, text: 'GND ENG 2 MAX PWR: IDLE' }],
  // 24 ELECTRICAL (FCOM PRO-ABN-ELEC bus faults STATUS, see FWC/Logic/ElecBusAlerts)
  ['240200103', { part: StatusPart.Information, text: 'ENG 1 APPR IDLE ONLY' }],
  ['240200104', { part: StatusPart.Information, text: 'ENG 2 APPR IDLE ONLY' }],
  ['240200105', { part: StatusPart.Information, text: 'BOTH PFD ON SAME FAC' }],
  ['240200106', { part: StatusPart.Information, text: 'L/G CONTROL NOT AVAIL' }],
  ['240200108', { part: StatusPart.Information, text: 'APU BAT START NOT AVAIL' }],
  ['240200101', { part: StatusPart.Information, text: 'SLATS SLOW' }],
  ['240200107', { part: StatusPart.Information, text: 'SLATS/FLAPS SLOW' }],
  ['240200102', { part: StatusPart.Information, text: 'CAT 2 ONLY' }],
  ['340200001', { part: StatusPart.Information, text: 'FLS LIMITED TO F-APP + RAW' }],
  // 28 FUEL (FCOM PRO-ABN-FUEL CTR L + R XFR FAULT (VALVES NOT FULLY OPEN), a320_fcom.txt l.85648-85651)
  ['280200001', { part: StatusPart.Information, text: 'CTR TK USABLE BY GRAVITY' }],
  ['280200002', { part: StatusPart.Information, text: '2T (4400LBS) UNUSABLE' }],
  // 28 FUEL (FCOM PRO-ABN-FUEL FUEL L (R) WING TK LO LVL STATUS, a320_fcom.txt l.86477-86484, if center tank not empty)
  ['280200003', { part: StatusPart.Information, text: 'CTR TK FEED: MAN ONLY' }],
  // 22 AUTO FLIGHT (FCOM PRO-ABN-FWS FWS FWC 1(2) FAULT)
  ['220200001', { part: StatusPart.Information, text: 'CAT 3 SINGLE ONLY' }],
  // 70 ENGINE (FCOM PRO-ABN-ENG ENG 1(2) SHUT DOWN STATUS, l.81263)
  ['700200001', { part: StatusPart.Information, text: 'ONE PACK ONLY IF WAI ON' }],
  // 22 AUTO FLIGHT (FCOM PRO-ABN-FWS FWS FWC 1(2) FAULT)
  ['220300001', { part: StatusPart.InopSys, text: 'CAT 3 DUAL' }],
  // 36 PNEUMATIC (FCOM PRO-ABN-ENG ENG 1(2) SHUT DOWN INOP SYS, between CAT 3 DUAL and PACK 1(2))
  ['360300001', { part: StatusPart.InopSys, text: 'ENG 1 BLEED' }],
  ['360300002', { part: StatusPart.InopSys, text: 'ENG 2 BLEED' }],
  // 70 ENGINE (FCOM PRO-ABN-ENG REVERSER FAULT, THR LEVER FAULT and THR LEVER DISAGREE INOP SYS)
  ['780300001', { part: StatusPart.InopSys, text: 'REVERSER 1' }],
  ['780300002', { part: StatusPart.InopSys, text: 'REVERSER 2' }],
  ['730300001', { part: StatusPart.InopSys, text: 'ENG 1 THR' }],
  ['730300002', { part: StatusPart.InopSys, text: 'ENG 2 THR' }],
  // 21 AIR CONDITIONING (ENG 1(2) SHUT DOWN INOP SYS; the same codes as the PACK 1(2) FAULT lines)
  ['210300001', { part: StatusPart.InopSys, text: 'PACK 1' }],
  ['210300002', { part: StatusPart.InopSys, text: 'PACK 2' }],
  // ENG 1(2) SHUT DOWN INOP SYS (FCOM PRO-ABN-ENG, l.81170-81181), in its order with 22 CAT 3 DUAL and 21 PACK 1(2)
  ['240300001', { part: StatusPart.InopSys, text: 'MAIN GALLEY' }],
  ['240300002', { part: StatusPart.InopSys, text: 'GEN 1' }],
  ['240300003', { part: StatusPart.InopSys, text: 'GEN 2' }],
  ['290300001', { part: StatusPart.InopSys, text: 'G ENG 1 PUMP' }],
  ['290300002', { part: StatusPart.InopSys, text: 'Y ENG 2 PUMP' }],
  ['300300001', { part: StatusPart.InopSys, text: 'WING A. ICE' }],
  // 31 INDICATING/RECORDING (FCOM PRO-ABN-FWS FWS FWC 1(2) FAULT)
  ['310300001', { part: StatusPart.InopSys, text: 'FWC 1' }],
  ['310300002', { part: StatusPart.InopSys, text: 'FWC 2' }],
  // 26 FIRE PROTECTION (FCOM PRO-ABN-ENG ENG 1(2) FIRE LOOP A(B) FAULT / FIRE DET FAULT, PRO-ABN-APU)
  ['260300001', { part: StatusPart.InopSys, text: 'ENG 1 LOOP A' }],
  ['260300002', { part: StatusPart.InopSys, text: 'ENG 1 LOOP B' }],
  ['260300003', { part: StatusPart.InopSys, text: 'ENG 2 LOOP A' }],
  ['260300004', { part: StatusPart.InopSys, text: 'ENG 2 LOOP B' }],
  ['260300005', { part: StatusPart.InopSys, text: 'APU LOOP A' }],
  ['260300006', { part: StatusPart.InopSys, text: 'APU LOOP B' }],
  ['260300007', { part: StatusPart.InopSys, text: 'FIRE DET 1' }],
  ['260300008', { part: StatusPart.InopSys, text: 'FIRE DET 2' }],
  ['260300009', { part: StatusPart.InopSys, text: 'APU FIRE DET' }],
  // 28 FUEL (FCOM PRO-ABN-FUEL)
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
  ['340300001', { part: StatusPart.InopSys, text: 'GPS 1' }],
  ['340300002', { part: StatusPart.InopSys, text: 'GPS 2' }],
  ['340300003', { part: StatusPart.InopSys, text: 'GPS 1+2' }],
  // NAV TCAS FAULT, NAV ATC/XPDR 1(2) FAULT and 1+2 FAULT, in the order of the 1+2 FAULT STATUS (FCOM PRO-ABN-NAV)
  ['340300004', { part: StatusPart.InopSys, text: 'TCAS' }],
  ['340300005', { part: StatusPart.InopSys, text: 'ATC/XPDR 1' }],
  ['340300006', { part: StatusPart.InopSys, text: 'ATC/XPDR 2' }],
  ['340300007', { part: StatusPart.InopSys, text: 'ADS-B RPTG 1' }],
  ['340300008', { part: StatusPart.InopSys, text: 'ADS-B RPTG 2' }],
  // 74 IGNITION (FCOM PRO-ABN-ENG ENG 1(2) IGN FAULT INOP SYS, a320_fcom.txt l.80295, 80331)
  ['740300001', { part: StatusPart.InopSys, text: 'ENG 1 IGN A' }],
  ['740300002', { part: StatusPart.InopSys, text: 'ENG 1 IGN B' }],
  ['740300003', { part: StatusPart.InopSys, text: 'ENG 2 IGN A' }],
  ['740300004', { part: StatusPart.InopSys, text: 'ENG 2 IGN B' }],
  ['740300005', { part: StatusPart.InopSys, text: 'ENG 1 IGN' }],
  ['740300006', { part: StatusPart.InopSys, text: 'ENG 2 IGN' }],
  // 24 ELECTRICAL (FCOM PRO-ABN-ELEC bus and TR faults INOP SYS, see FWC/Logic/ElecBusAlerts), FCOM texts
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
]);

const StatusMessageOrder = new Map([...StatusMessages.keys()].map((code, index) => [code, index]));

/** The number of lines of each column of the STATUS page */
export const STATUS_PAGE_LINES = 16;

/** The known codes, without duplicates, in the order of the STATUS page */
export function orderStatusCodes(codes: readonly string[]): string[] {
  return [...new Set(codes)]
    .filter((code) => StatusMessages.has(code))
    .sort((a, b) => StatusMessageOrder.get(a)! - StatusMessageOrder.get(b)!);
}

/** The colour of the lines of each part, as FWC text control codes */
const PART_COLOURS: Record<StatusPart, string> = {
  [StatusPart.Limitation]: '\x1b<5m',
  [StatusPart.Condition]: '\x1b<7m',
  [StatusPart.Information]: '\x1b<3m',
  [StatusPart.InopSys]: '\x1b<4m',
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
 * The texts of the STATUS page from the codes of its left and right columns. The titles are white and underlined; an
 * empty page shows NORMAL in green.
 */
export function formatStatusPage(leftCodes: readonly string[], rightCodes: readonly string[]): StatusPageTexts {
  const lines = (codes: readonly string[]) =>
    orderStatusCodes(codes).map((code) => {
      const message = StatusMessages.get(code)!;
      return `${PART_COLOURS[message.part]}${message.text}`;
    });
  const left = lines(leftCodes);
  const inopSys = lines(rightCodes);

  if (left.length === 0 && inopSys.length === 0) {
    return { normal: true, left: '\r\r              \x1b<3mNORMAL', right: '' };
  }
  return {
    normal: false,
    left: left.join('\r'),
    right: inopSys.length > 0 ? ['\x1b<7m\x1b4mINOP SYS\x1bm', ...inopSys].join('\r') : '',
  };
}
