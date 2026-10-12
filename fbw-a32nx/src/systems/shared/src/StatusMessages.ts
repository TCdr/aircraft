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

/**
 * The STATUS page lines, by code: ATA chapter, then 04 xxxxx limitations, 02 xxxxx information, 03 xxxxx inoperative
 * systems (as the A380 codes). Their order here is their order on the page: the limitations come before the information
 * in the left column.
 */
const StatusMessages = new Map<string, { part: StatusPart; text: string }>([
  // 21 AIR CONDITIONING (FCOM PRO-ABN-AIR, PRO-ABN-COND)
  ['210400001', { part: StatusPart.Limitation, text: 'MAX FL.....100/MEA-MORA' }],
  // 70 ENGINE (FCOM PRO-ABN-ENG ENG 1(2) SHUT DOWN STATUS, a320_fcom.txt l.81168-81264), in the order of the FCOM
  ['700400001', { part: StatusPart.Limitation, text: 'AVOID ICING CONDITIONS' }],
  ['700500001', { part: StatusPart.Condition, text: 'IF SEVERE ICE ACCRETION:' }],
  ['700400002', { part: StatusPart.Limitation, text: 'MIN SPD....VLS+10/G DOT' }],
  ['700400003', { part: StatusPart.Limitation, text: 'MANEUVER WITH CARE' }],
  ['700400004', { part: StatusPart.Limitation, text: 'LDG DIST PROC....APPLY' }],
  ['700500002', { part: StatusPart.Condition, text: 'IF PERF PERMITS:' }],
  ['700400005', { part: StatusPart.Limitation, text: 'X BLEED...........OPEN' }],
  ['700500003', { part: StatusPart.Condition, text: 'IF NO ENG 1 DAMAGE:' }],
  ['700400006', { part: StatusPart.Limitation, text: 'CONSIDER ENG 1 RELIGHT' }],
  ['700500004', { part: StatusPart.Condition, text: 'IF NO ENG 2 DAMAGE:' }],
  ['700400007', { part: StatusPart.Limitation, text: 'CONSIDER ENG 2 RELIGHT' }],
  // 27 FLIGHT CONTROLS (FCOM PRO-ABN-F_CTL STATUS, a320_fcom.txt l.82568-83853), see FWC/Logic/FlightControlStatus
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
  // 80 STARTING (A320neo FCOM PRO-ABN-ENG ENG 1(2) START FAULT STATUS, STARTER SHAFT SHEAR)
  ['800400001', { part: StatusPart.Limitation, text: 'ENG 1 WINDMILL START ONLY' }],
  ['800400002', { part: StatusPart.Limitation, text: 'ENG 2 WINDMILL START ONLY' }],
  // 70 ENGINE (FCOM PRO-ABN-ENG STATUS of FADEC FAULT l.79659-79660, THR LEVER DISAGREE l.81738-81771, THR LEVER FAULT
  // l.81866-81874, ENG SHUT DOWN "If REV unlocked" l.81172-81173), lines by FWC/Logic/FadecReverserAlerts
  ['700400050', { part: StatusPart.Limitation, text: 'THR LVR 1 NOT ABV IDLE' }],
  ['700400051', { part: StatusPart.Limitation, text: 'THR LVR 2 NOT ABV IDLE' }],
  ['700500050', { part: StatusPart.Condition, text: 'WHEN SLATS OUT:' }],
  ['700400052', { part: StatusPart.Limitation, text: 'ENG 1 AT IDLE' }],
  ['700400053', { part: StatusPart.Limitation, text: 'ENG 2 AT IDLE' }],
  ['700400054', { part: StatusPart.Limitation, text: 'ENG 1 AVAIL MAX PWR:CLB' }],
  ['700400055', { part: StatusPart.Limitation, text: 'ENG 2 AVAIL MAX PWR:CLB' }],
  ['700400056', { part: StatusPart.Limitation, text: 'GND ENG 1 MAX PWR: IDLE' }],
  ['700400057', { part: StatusPart.Limitation, text: 'GND ENG 2 MAX PWR: IDLE' }],
  ['700400058', { part: StatusPart.Limitation, text: 'MAX SPEED.......300/.78' }],
  ['210200001', { part: StatusPart.Information, text: 'CKPT AT FIXED TEMP' }],
  ['210200002', { part: StatusPart.Information, text: 'CAB AT FIXED TEMP' }],
  ['210200003', { part: StatusPart.Information, text: 'CAB TEMP BY PACK ONLY' }],
  ['210200004', { part: StatusPart.Information, text: 'CAB TEMP CKPT CTL ONLY' }],
  // 22 AUTO FLIGHT (FCOM PRO-ABN-FWS FWS FWC 1(2) FAULT)
  ['220200001', { part: StatusPart.Information, text: 'CAT 3 SINGLE ONLY' }],
  // 27 FLIGHT CONTROLS (FCOM PRO-ABN-F_CTL STATUS), after CAT 3 SINGLE ONLY as in ELAC 1(2) FAULT (l.82768-82780)
  ['270200001', { part: StatusPart.Information, text: 'ALTN LAW: PROT LOST' }],
  ['270200002', { part: StatusPart.Information, text: 'WHEN L/G DN: DIRECT LAW' }],
  // "WHEN L/G DN AND AP OFF: DIRECT LAW" (l.82596) in two lines, the second is the DIRECT LAW line
  ['270200003', { part: StatusPart.Information, text: 'WHEN L/G DN AND AP OFF:' }],
  ['270200004', { part: StatusPart.Information, text: 'DIRECT LAW' }],
  ['270200005', { part: StatusPart.Information, text: 'PITCH MECH BACK UP' }],
  ['270200006', { part: StatusPart.Information, text: 'ROLL DIRECT LAW' }],
  ['270200007', { part: StatusPart.Information, text: 'F/CTL INDICATIONS LOST' }],
  ['270200008', { part: StatusPart.Information, text: 'FUEL CONSUMPT INCRSD' }],
  ['270200009', { part: StatusPart.Information, text: 'FMS PRED UNRELIABLE' }],
  // 70 ENGINE (FCOM PRO-ABN-ENG ENG 1(2) SHUT DOWN STATUS, l.81263)
  ['700200001', { part: StatusPart.Information, text: 'ONE PACK ONLY IF WAI ON' }],
  // 34 NAVIGATION
  ['340200001', { part: StatusPart.Information, text: 'FLS LIMITED TO F-APP + RAW' }],
  // 28 FUEL (FCOM PRO-ABN-FUEL CTR L + R XFR FAULT (VALVES NOT FULLY OPEN), a320_fcom.txt l.85648-85651)
  ['280200001', { part: StatusPart.Information, text: 'CTR TK USABLE BY GRAVITY' }],
  ['280200002', { part: StatusPart.Information, text: '2T (4400LBS) UNUSABLE' }],
  // 28 FUEL (FCOM PRO-ABN-FUEL FUEL L (R) WING TK LO LVL STATUS, a320_fcom.txt l.86477-86484, if center tank not empty)
  ['280200003', { part: StatusPart.Information, text: 'CTR TK FEED: MAN ONLY' }],
  // 27 FLIGHT CONTROLS (FCOM PRO-ABN-F_CTL INOP SYS), before CAT 3 DUAL as in ELAC 1(2) FAULT (l.82768-82780)
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
  ['270300027', { part: StatusPart.InopSys, text: 'AP 1+2' }],
  ['270300028', { part: StatusPart.InopSys, text: 'CAT 2' }],
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
  // 34 NAVIGATION
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
