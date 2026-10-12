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
  // 29 HYDRAULIC (FCOM PRO-ABN-HYD STATUS, a320_fcom.txt l.87028-88759), see FWC/Logic/HydraulicAlerts: limitations,
  // then the APPR PROC block, then the procedures, as on the FCOM STATUS pages
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
  // l.88570: "WHEN SPD 200 KT" lost its sign in the FCOM text, "Extend the landing gear at 200 kt" (l.88576)
  ['290500008', { part: StatusPart.Condition, text: 'WHEN SPD < 200 KT:' }],
  ['290500009', { part: StatusPart.Condition, text: 'WHEN CONF 3 AND VAPP:' }],
  ['290400015', { part: StatusPart.Limitation, text: 'L/G..........GRVTY EXTN' }],
  ['290400016', { part: StatusPart.Limitation, text: 'APPR SPD.....VREF+25 KT' }],
  ['290400017', { part: StatusPart.Limitation, text: 'LDG DIST PROC....APPLY' }],
  ['290400018', { part: StatusPart.Limitation, text: 'FUEL CONSUMPT INCRSD' }],
  ['290400019', { part: StatusPart.Limitation, text: 'FMS PRED UNRELIABLE' }],
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
  // 29 HYDRAULIC (FCOM PRO-ABN-HYD STATUS), before CAT 3 SINGLE ONLY as in the FCOM
  ['290200001', { part: StatusPart.Information, text: 'BRK Y ACCU PR ONLY' }],
  ['290200002', { part: StatusPart.Information, text: 'ALTN Y BRK WITH A/SKID' }],
  ['290200003', { part: StatusPart.Information, text: 'SLATS/FLAPS SLOW' }],
  ['290200004', { part: StatusPart.Information, text: 'SLATS SLOW' }],
  ['290200005', { part: StatusPart.Information, text: 'FLAPS SLOW' }],
  // 22 AUTO FLIGHT (FCOM PRO-ABN-FWS FWS FWC 1(2) FAULT)
  ['220200001', { part: StatusPart.Information, text: 'CAT 3 SINGLE ONLY' }],
  // 70 ENGINE (FCOM PRO-ABN-ENG ENG 1(2) SHUT DOWN STATUS, l.81263)
  ['700200001', { part: StatusPart.Information, text: 'ONE PACK ONLY IF WAI ON' }],
  // 34 NAVIGATION
  ['340200001', { part: StatusPart.Information, text: 'FLS LIMITED TO F-APP + RAW' }],
  // 28 FUEL (FCOM PRO-ABN-FUEL CTR L + R XFR FAULT (VALVES NOT FULLY OPEN), a320_fcom.txt l.85648-85651)
  ['280200001', { part: StatusPart.Information, text: 'CTR TK USABLE BY GRAVITY' }],
  ['280200002', { part: StatusPart.Information, text: '2T (4400LBS) UNUSABLE' }],
  // 28 FUEL (FCOM PRO-ABN-FUEL FUEL L (R) WING TK LO LVL STATUS, a320_fcom.txt l.86477-86484, if center tank not empty)
  ['280200003', { part: StatusPart.Information, text: 'CTR TK FEED: MAN ONLY' }],
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
  // 29 HYDRAULIC (FCOM PRO-ABN-HYD INOP SYS, see FWC/Logic/HydraulicAlerts), the FCOM lists merged in their order;
  // G ENG 1 PUMP and Y ENG 2 PUMP are the ENG 1(2) SHUT DOWN codes 290300001/2 below
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
  // 49 APU (FCOM PRO-ABN-APU APU AUTO (EMER) SHUT DOWN INOP SYS, l.71110-71114)
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
