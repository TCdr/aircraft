// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X ELEC (ATA 24) alerts: the combined busbar alerts, ELEC STATIC INV FAULT, and the procedure lines and STATUS of
 * these alerts.
 *
 * Every function here is pure (or a small state machine) so that the alert logic has unit tests; FwsCore reads the
 * simulation and FwsAbnormalSensed only maps the results onto the alert entries.
 */

import { ElecAlertFlags, Four, Two } from './FwsElecAlerts';

/** Flight phase inhibitions. All the combined busbar alerts: phases 4, 5 and 10. ELEC STATIC INV FAULT: 3 to 10 */
export const ELEC_COMBINED_BUS_PHASE_INHIBITION: { combinedBusFault: number[]; staticInvFault: number[] } = {
  combinedBusFault: [4, 5, 10],
  staticInvFault: [3, 4, 5, 6, 7, 8, 9, 10],
};

/** The combined busbar alerts, true while all their busbars are lost */
export interface CombinedBusFaults {
  /** ELEC AC BUS 1+2 & DC BUS 1 FAULT (240800003) */
  ac12Dc1: boolean;
  /** ELEC AC BUS 2+3 & DC BUS 1+2 FAULT (240800005) */
  ac23Dc12: boolean;
  /** ELEC AC BUS 2+4 FAULT (240800006) */
  ac24: boolean;
  /** ELEC AC BUS 3+4 & DC BUS 2 FAULT (240800008) */
  ac34Dc2: boolean;
  /** ELEC DC BUS 1+2 FAULT (240800027) */
  dc12: boolean;
  /** ELEC DC BUS 1+ESS FAULT (240800028) */
  dc1Ess: boolean;
}

type Busbar = 'ac1' | 'ac2' | 'ac3' | 'ac4' | 'dc1' | 'dc2' | 'dcEss';

const COMBINED_BUSBARS: Record<keyof CombinedBusFaults, readonly Busbar[]> = {
  ac12Dc1: ['ac1', 'ac2', 'dc1'],
  ac23Dc12: ['ac2', 'ac3', 'dc1', 'dc2'],
  ac24: ['ac2', 'ac4'],
  ac34Dc2: ['ac3', 'ac4', 'dc2'],
  dc12: ['dc1', 'dc2'],
  dc1Ess: ['dc1', 'dcEss'],
};

/** The ELEC flags with the combined alerts, and with the single alerts that a combined alert replaces turned off */
export interface ElecAlertFlagsWithCombined extends ElecAlertFlags {
  combined: CombinedBusFaults;
}

/**
 * Adds the combined busbar alerts to the single busbar alert flags of ElecAlertLogic.
 *
 * Design choices (only each alert's triggering condition is known, not how the alerts replace each other):
 * - A combined alert replaces the single alerts of its busbars (ELEC AC BUS 1 FAULT, ... DC ESS BUS FAULT): its
 *   procedure covers them, and the real ECAM shows the combination, not the single faults, for these cases.
 * - A combined alert whose busbars are all part of another active combined alert is replaced by it (DC BUS 1+2 FAULT
 *   is part of AC BUS 2+3 & DC BUS 1+2 FAULT). Combined alerts that only overlap (AC BUS 1+2 & DC BUS 1 with AC BUS 2+4)
 *   are both shown.
 * - The single flags are only set while at least one AC busbar is powered (ElecAlertLogic), so the combined alerts do
 *   not trigger in ELEC EMER CONFIG either.
 * - ELEC AC ESS BUS ALTN is not shown with AC BUS 1+2 & DC BUS 1 FAULT, as it is not shown with AC BUS 1 FAULT
 *   (FwsAbnormalSensed 240800011): the AC 4 busbar takes over the emergency network automatically.
 */
export function combineElecBusFaults(flags: ElecAlertFlags): ElecAlertFlagsWithCombined {
  const lost: Record<Busbar, boolean> = {
    ac1: flags.acBusFault[0],
    ac2: flags.acBusFault[1],
    ac3: flags.acBusFault[2],
    ac4: flags.acBusFault[3],
    dc1: flags.dcBusFault[0],
    dc2: flags.dcBusFault[1],
    dcEss: flags.dcEssBusFault,
  };
  const names = Object.keys(COMBINED_BUSBARS) as (keyof CombinedBusFaults)[];
  const triggered = {} as CombinedBusFaults;
  for (const name of names) {
    triggered[name] = COMBINED_BUSBARS[name].every((bus) => lost[bus]);
  }
  const isContainedIn = (inner: keyof CombinedBusFaults, outer: keyof CombinedBusFaults): boolean =>
    inner !== outer &&
    COMBINED_BUSBARS[inner].length < COMBINED_BUSBARS[outer].length &&
    COMBINED_BUSBARS[inner].every((bus) => COMBINED_BUSBARS[outer].includes(bus));

  const combined = {} as CombinedBusFaults;
  for (const name of names) {
    combined[name] = triggered[name] && !names.some((other) => triggered[other] && isContainedIn(name, other));
  }
  const covered = (bus: Busbar): boolean =>
    names.some((name) => combined[name] && COMBINED_BUSBARS[name].includes(bus));

  return {
    ...flags,
    acBusFault: (['ac1', 'ac2', 'ac3', 'ac4'] as const).map((bus) => lost[bus] && !covered(bus)) as Four<boolean>,
    dcBusFault: (['dc1', 'dc2'] as const).map((bus) => lost[bus] && !covered(bus)) as Two<boolean>,
    dcEssBusFault: lost.dcEss && !covered('dcEss'),
    acEssBusAltn: flags.acEssBusAltn && !combined.ac12Dc1,
    combined,
  };
}

/**
 * ELEC STATIC INV FAULT (240800080): the static inverter has failed.
 * The static inverter only runs while its contactor 7XB is closed (a380_systems direct_current.rs: no AC ESS power and
 * both battery contactors closed). Design choice: the inverter counts as failed when its contactor is closed but it
 * gives no normal output; with the contactor open it is not used and nothing tells whether it works.
 */
export function isStaticInverterFault(contactor7XbClosed: boolean, staticInverterPotentialNormal: boolean): boolean {
  return contactor7XbClosed && !staticInverterPotentialNormal;
}

/** FL 300 and 30 min, the gravity feeding ceiling rule of the fuel procedures */
const FL300_FT = 30_000;
const FL300_TIME_LIMIT_S = 30 * 60;

/**
 * The flight time above FL 300 since departure: the procedures that lead to fuel gravity feeding branch on whether it
 * is less or more than 30 min.
 * Design choices: the time counts from lift-off (it is reset on the ground), above FL 300 pressure altitude (ADR); an
 * invalid altitude does not count.
 */
export class FlightTimeAboveFl300 {
  private secondsAboveFl300 = 0;

  /**
   * @param onGround whether the aircraft is on the ground
   * @param pressureAltitudeFt the ADR pressure altitude, null if invalid
   * @param deltaTimeMs the time since the last update, in milliseconds
   */
  public update(onGround: boolean, pressureAltitudeFt: number | null, deltaTimeMs: number): void {
    if (onGround) {
      this.secondsAboveFl300 = 0;
    } else if (pressureAltitudeFt !== null && pressureAltitudeFt > FL300_FT) {
      this.secondsAboveFl300 += deltaTimeMs / 1000;
    }
  }

  /** Whether the aircraft has flown more than 30 min above FL 300 since departure */
  public get moreThan30Min(): boolean {
    return this.secondsAboveFl300 > FL300_TIME_LIMIT_S;
  }
}

/** The aircraft and cockpit state the procedure lines of the combined busbar alerts depend on */
export interface ElecProcedureInputs {
  onGround: boolean;
  /** FlightTimeAboveFl300.moreThan30Min */
  moreThan30MinAboveFl300: boolean;
  /** Fuel quantity in feed tanks 1 and 4 below 42 000 lb (feedTanks1And4BelowEmerOutrXfrThreshold) */
  feedTanks1And4Low: boolean;
  /** All landing gears down and locked */
  gearDownLocked: boolean;
  /** CROSSFEED 1-4 pb-sw ON */
  crossFeedPbOn: Four<boolean>;
  /** WXR & TAWS system selected on the SURV panel (1 or 2) */
  wxrTawsSys: number;
  /** XPDR & TCAS system selected on the SURV panel (1 or 2) */
  xpdrTcasSys: number;
  /** ATT HDG switching knob at F/O ON 3 */
  attHdgFoOn3: boolean;
  /** AIR DATA switching knob at F/O ON 3 */
  airDataFoOn3: boolean;
  /** L and R OUTR TK PMP pb-sw ON */
  outerTankPumpPbOn: Two<boolean>;
  /** EMER OUTR TK XFR pb-sw ON */
  emerOutrTkXfrOn: boolean;
  autoThrustEngaged: boolean;
}

/** One procedure's lines: shown, and checked, in the order of its items in ata24.ts / ata28.ts */
export interface ProcedureLines {
  show: boolean[];
  checked: boolean[];
}

/** Builds ProcedureLines from [shown, checked] pairs, one per item */
export function procedureLines(...lines: [show: boolean, checked: boolean][]): ProcedureLines {
  return { show: lines.map(([show]) => show), checked: lines.map(([, checked]) => checked) };
}

/**
 * The seven gravity feeding lines after the "flight time above FL 300 since departure less (more) than 30 min" test:
 * DESCENT TO FL 50/MEA (280), MAX FL, WHEN BELOW ...:, CROSSFEED x OFF, CROSSFEED y OFF, EXPECT NORM COLLECTOR CELL
 * DEPLETION, AVOID NEG G LOAD. Design choice: shown in flight only (on the ground there is no descent to fly).
 * @param shown whether the branch applies
 * @param crossfeedsOff the CROSSFEED ... OFF lines of the branch (one or two), checked when the pb-sw is OFF
 */
function gravityCeilingBranch(shown: boolean, crossfeedsOff: boolean[]): [boolean, boolean][] {
  return [
    [shown, false], // DESCENT TO FL ...
    [shown, false], // MAX FL : ...
    [shown, false], // WHEN BELOW FL ... :
    ...crossfeedsOff.map((off): [boolean, boolean] => [shown, off]), // CROSSFEED ... OFF
    [shown, false], // EXPECT NORM COLLECTOR CELL DEPLETION
    [shown, false], // AVOID NEG G LOAD
  ];
}

/** ELEC AC BUS 1+2 & DC BUS 1 FAULT (items of ata24.ts 240800003) */
export function acBus12Dc1FaultLines(): ProcedureLines {
  return procedureLines(
    [true, false], // ATC COM VOICE ONLY
    [true, false], // AP : SIDESTICK LOCKING DEVICE NOT AVAIL
    [false, false], // FUEL CONSUMPT INCRSD: not a line of this procedure
    [false, false], // FMS PRED UNRELIABLE: idem
    [true, false], // LDG DIST AFFECTED
  );
}

/** ELEC AC BUS 2+3 & DC BUS 1+2 FAULT (items of ata24.ts 240800005) */
export function acBus23Dc12FaultLines(i: ElecProcedureInputs): ProcedureLines {
  const inFlight = !i.onGround;
  return procedureLines(
    [true, i.crossFeedPbOn[2]], // CROSSFEED 3 ON
    [true, i.crossFeedPbOn[3]], // CROSSFEED 4 ON
    [true, false], // USE VHF 1
    [true, i.wxrTawsSys === 1], // WXR & TAWS SYS 1
    [true, i.xpdrTcasSys === 1], // XPDR & TCAS SYS 1
    [true, false], // ATC COM VOICE ONLY
    [true, false], // AVOID ICING CONDs
    [true, false], // FOR SD : SELECT "MAILBOX" ON CAPT KCCU
    [true, false], // INR TKs NOT USABLE
    [true, false], // MID TKs NOT USABLE
    [true, false], // TRIM TK NOT USABLE
    [true, false], // OIS ON BAT
    [true, false], // USE TRIM TK XFR FOR CG IF NECESSARY
    [true, false], // FEED TK 4 : 1300 KG MAX NOT USABLE (2 900 lb)
    ...gravityCeilingBranch(inFlight && !i.moreThan30MinAboveFl300, [!i.crossFeedPbOn[2], !i.crossFeedPbOn[3]]),
    ...gravityCeilingBranch(inFlight && i.moreThan30MinAboveFl300, [!i.crossFeedPbOn[2], !i.crossFeedPbOn[3]]),
    [!i.gearDownLocked, false], // L/G GRVTY EXTN ONLY
    [i.gearDownLocked, false], // NO L/G RETRACTION
    [i.feedTanks1And4Low, !i.outerTankPumpPbOn[0] && !i.outerTankPumpPbOn[1]], // OUTR TKs PMPs OFF
    // OUTR TK XFR MAN: the manual transfer pb-sw is INOP in the simulation
    [i.feedTanks1And4Low, false],
    [true, false], // LDG DIST AFFECTED
    // After landing. Design choice, as ELEC AC BUS 3 FAULT: shown on the ground
    [i.onGround, false], // BEFORE OPENING ANY CABIN DOOR:
    [i.onGround, false], // RESIDUAL DIFF PRESS CHECK
    [i.onGround, false], // CABIN CREW ADVISE
  );
}

/** ELEC AC BUS 2+4 FAULT (items of ata24.ts 240800006) */
export function acBus24FaultLines(i: ElecProcedureInputs): ProcedureLines {
  const inFlight = !i.onGround;
  const allCrossfeedsOff = i.crossFeedPbOn.every((on) => !on);
  return procedureLines(
    [i.onGround, false], // After landing: FOR ENG STOP : KEEP ENG 1 LAST
    [true, i.crossFeedPbOn.every((on) => on)], // ALL CROSSFEEDS ON
    [true, !i.autoThrustEngaged], // A/THR DISCONNECT
    // In flight: VENT AVNCS EXTRACT OVRD: no avionics ventilation pb-sw in the simulation
    [inFlight, false],
    [true, i.wxrTawsSys === 1], // WXR & TAWS SYS 1
    [true, i.xpdrTcasSys === 1], // XPDR & TCAS SYS 1
    [true, false], // INR TKs NOT USABLE
    [true, false], // MID TKs NOT USABLE
    [true, false], // TRIM TK NOT USABLE
    [true, false], // USE TRIM TK XFR FOR CG IF NECESSARY
    [true, false], // FEED TK 1 : 1300 KG MAX NOT USABLE (2 900 lb)
    [true, false], // FEED TK 4 : 1300 KG MAX NOT USABLE
    ...gravityCeilingBranch(inFlight && !i.moreThan30MinAboveFl300, [allCrossfeedsOff]),
    ...gravityCeilingBranch(inFlight && i.moreThan30MinAboveFl300, [allCrossfeedsOff]),
    [true, false], // LDG DIST IMPACT ON WET/CONTAM RWY ONLY
    [i.feedTanks1And4Low, !i.outerTankPumpPbOn[0] && !i.outerTankPumpPbOn[1]], // OUTR TKs PMPs OFF
    [i.feedTanks1And4Low, false], // OUTR TK XFR MAN: INOP pb-sw
  );
}

/** ELEC AC BUS 3+4 & DC BUS 2 FAULT (items of ata24.ts 240800008) */
export function acBus34Dc2FaultLines(i: ElecProcedureInputs): ProcedureLines {
  return procedureLines(
    [!i.onGround, false], // In flight: VENT AVNCS EXTRACT OVRD: no avionics ventilation pb-sw
    [true, i.attHdgFoOn3], // ATT HDG SWTG F/O ON 3
    [true, i.airDataFoOn3], // AIR DATA SWTG F/O ON 3
    [true, false], // F/O BARO REF : STD ONLY
    [true, false], // USE VHF 1 OR 3
    [true, i.wxrTawsSys === 1], // WXR & TAWS SYS 1
    [true, i.xpdrTcasSys === 1], // XPDR & TCAS SYS 1
    [true, false], // DU RECONF PB AVAIL
    [true, false], // F/O KEYBOARD CURSOR CTL AVAIL
    [false, false], // FUEL CONSUMPT INCRSD: not a line of this procedure
    [false, false], // FMS PRED UNRELIABLE: idem
    [true, false], // LDG DIST AFFECTED
    [i.onGround, false], // After landing: BEFORE OPENING ANY CABIN DOOR:
    [i.onGround, false], // RESIDUAL DIFF PRESS CHECK
    [i.onGround, false], // CABIN CREW ADVISE
  );
}

/** ELEC DC BUS 1+2 FAULT (items of ata24.ts 240800027) */
export function dcBus12FaultLines(i: ElecProcedureInputs): ProcedureLines {
  return procedureLines(
    [true, false], // FOR TAXI : FLAPS SELECT CONF 1+F (no condition in this procedure, as DC ESS BUS FAULT)
    [true, i.wxrTawsSys === 1], // WXR & TAWS SYS 1
    [true, i.xpdrTcasSys === 1], // XPDR & TCAS SYS 1
    [true, false], // USE VHF 1
    [true, false], // ATC COM VOICE ONLY
    [true, false], // AVOID ICING CONDs
    [true, false], // FOR SD : SELECT "MAILBOX" ON CAPT KCCU
    [true, false], // OIS ON BAT
    [true, false], // INR TKs NOT USABLE
    [true, false], // MID TKs NOT USABLE
    [true, false], // TRIM TK NOT USABLE
    [false, false], // TRIM TK NOT USABLE FOR ENG SUPPLY: not a line of this procedure
    [true, false], // USE TRIM TK XFR FOR CG IF NECESSARY
    [!i.gearDownLocked, false], // If L/G is retracted: L/G GRVTY EXTN ONLY
    [i.gearDownLocked, false], // If L/G is down and locked: NO L/G RETRACTION
    [false, false], // FMS PRED UNRELIABLE: a STATUS info here, not a procedure line
    [false, false], // IF SEVERE ICE ACCRETION: a deferred procedure here
    [false, false], // GA THR : TOGA ONLY: not a line of this procedure
    [true, false], // LDG DIST AFFECTED
    [i.feedTanks1And4Low, i.emerOutrTkXfrOn], // EMER OUTR TK XFR ON
    [i.feedTanks1And4Low, false], // EXPECT FEED TKS IMBALANCE
    [i.feedTanks1And4Low, false], // FUEL MAN BALANCING PROC CONSIDER
  );
}

/** ELEC DC BUS 1+ESS FAULT (items of ata24.ts 240800028) */
export function dcBus1EssFaultLines(i: ElecProcedureInputs): ProcedureLines {
  const inFlight = !i.onGround;
  return procedureLines(
    [true, i.crossFeedPbOn[0]], // CROSSFEED 1 ON
    [true, i.crossFeedPbOn[1]], // CROSSFEED 2 ON
    [true, i.wxrTawsSys === 2], // WXR & TAWS SYS 2
    [true, i.xpdrTcasSys === 2], // XPDR & TCAS SYS 2
    [true, false], // NO COM AVAILABLE
    [true, false], // F/O HEADSETS ON (FOR AUDIO ALERTS)
    [true, false], // SQUAWK AVAIL ON MFD SURV PAGE ONLY
    [true, false], // DU RECONF P/B AVAIL
    [true, false], // ECP KEYS NOT AVAIL :
    [true, false], // SYSTEMS, MORE, TO CONFIG, RCL LAST
    [true, false], // FOR SYS PAGES : "ALL" AVAIL
    [true, false], // INR TKs NOT USABLE
    [true, false], // MID TKs NOT USABLE
    [true, false], // OUTR TKs NOT USABLE
    [true, false], // TRIM TK NOT USABLE
    [true, false], // FEED TK 2 : 2000 KG MAX NOT USABLE (4 400 lb)
    ...gravityCeilingBranch(inFlight && !i.moreThan30MinAboveFl300, [!i.crossFeedPbOn[0], !i.crossFeedPbOn[1]]),
    ...gravityCeilingBranch(inFlight && i.moreThan30MinAboveFl300, [!i.crossFeedPbOn[0], !i.crossFeedPbOn[1]]),
    [true, false], // FOB COMPUTED FROM FU
    [true, false], // SLATS SLOW
    [true, false], // LDG DIST AFFECTED
  );
}

/** STATUS of an alert: keys of EcamLimitations, EcamInopSys and EcamInfos, in the order of the real STATUS page */
export interface ElecBusAlertStatus {
  limitationsAllPhases: string[];
  limitationsApprLdg: string[];
  limitationsPfd: string[];
  inopSysAllPhases: string[];
  inopSysApprLdg: string[];
  info: string[];
}

const NO_STATUS: ElecBusAlertStatus = {
  limitationsAllPhases: [],
  limitationsApprLdg: [],
  limitationsPfd: [],
  inopSysAllPhases: [],
  inopSysApprLdg: [],
  info: [],
};

/*
 * STATUS of the combined busbar alerts. Only the STATUS lines that have a key in EcamMessages are listed; the lines
 * without a key are named in the comment of each table. REDUND LOSS is left out: the redundLoss field of an alert
 * never reaches the STATUS page (see ELEC_AC_ESS_BUS_FAULT_STATUS in FwsElecAlerts).
 * Shared, never mutated: FwsAbnormalSensed returns these arrays as they are.
 */

/**
 * ELEC AC BUS 1+2 & DC BUS 1 FAULT. Without key: ATC COM VOICE ONLY (limitation), VHF 3, MOST FUEL XFR
 * PMPs, Y ELEC PMP A+B (on ground, no engine running), STBY STATIC HEATG, FWD CREW REST VENT, AP SIDESTICK LOCKING
 * DEVICE NOT AVAIL (info).
 */
export const AC_BUS_12_DC_1_FAULT_STATUS: ElecBusAlertStatus = {
  ...NO_STATUS,
  limitationsApprLdg: ['800400002'], // LDG DIST AFFECTED
  inopSysAllPhases: [
    '290100001', // PART SPLRs
    '270300012', // PRIM 3
    '270300003', // SEC 3
    '340300006', // ADR 3
    '230300011', // RMP 3
    '230300019', // SATCOM
    '230300006', // DATALINK
    '280300007', // FEED TK 4 MAIN PMP
  ],
  inopSysApprLdg: [
    '320300002', // AUTO BRK
    '320300022', // ROW/ROP
    '320300005', // ALTN BRK
    '700300001', // ENG 2 REVERSER
    '340300026', // RA SYS A+C
    '220300010', // GLS AUTOLAND
    '220300027', // CAT 2
    '340300049', // ARPT NAV
  ],
  info: [
    '210200001', // CABIN TEMP REGUL DEGRADED
    '280200008', // OUTR TKs XFR BY GRVTY ONLY
  ],
};

/**
 * ELEC AC BUS 2+3 & DC BUS 1+2 FAULT. Without key: MAX FL, AVOID NEG G LOAD, NO L/G RETRACTION, ATC
 * COM VOICE ONLY (limitations), FUEL NORM+ALTN XFR, MOST FUEL XFR PMPs, LS 2 (INOP SYS), USE TRIM TK XFR FOR CG,
 * FEED TK 4 : MAX NOT USABLE, TRIM/INR/MID TKs NOT USABLE, EXPECT NORM COLLECTOR CELL DEPLETION, BRK WITH ACCU ONLY
 * (info).
 * The conditional limitations (FOR LDG : FLAP LVR 3 if severe ice accretion) are left out.
 */
export const AC_BUS_23_DC_12_FAULT_STATUS: ElecBusAlertStatus = {
  limitationsAllPhases: [
    '240400002', // MAX SPEED: 310/.86
    '240400004', // MANEUVER WITH CARE
    '300400001', // AVOID ICING CONDs
    '280400001', // FUEL PARTLY UNUSABLE
  ],
  limitationsApprLdg: [
    '320400001', // MAX SPEED : 220 KT
    '800400002', // LDG DIST AFFECTED
  ],
  limitationsPfd: ['240400002', '240400004', '300400001', '320400001'],
  inopSysAllPhases: [
    '290100008', // F/CTL PROT
    '270300011', // PRIM 2
    '270300012', // PRIM 3
    '270300002', // SEC 2
    '270300003', // SEC 3
    '290100011', // MOST SPLRs
    '220300007', // AP 1+2
    '220300001', // A/THR
    '220300024', // FD 1+2
    '230300019', // SATCOM
    '280300014', // FEED TK 4 PMPs
    '280300006', // FEED TK 3 MAIN PMP
    '300300001', // WING A-ICE
  ],
  inopSysApprLdg: [
    '320300011', // L/G CTL 1+2
    '320300001', // A-SKID
    '320300002', // AUTO BRK
    '320300022', // ROW/ROP
    '320300017', // N/W + B/W STEER
    '700300003', // ENG 2+3 REVERSERs
    '220300027', // CAT 2
    '220300010', // GLS AUTOLAND
    '340300003', // GPWS 1+2
    '340300049', // ARPT NAV
  ],
  info: [
    '340200004', // DIRECT LAW : PROT LOST
    '280200003', // FUEL CONSUMPT INCRSD : FMS PRED DISREGARD
    '280200007', // FEED TK 4 BY GRVTY ONLY
    '280200008', // OUTR TKs XFR BY GRVTY ONLY
    '320200002', // BRK PRESS AUTO LIMITED ON ALL L/Gs
    '320200003', // DELAY BRAKING UNTIL NLG TOUCHDOWN
  ],
};

/**
 * ELEC AC BUS 2+4 FAULT. Without key: MAX FL, AVOID NEG G LOAD (limitations), FUEL NORM+ALTN XFR,
 * MOST FUEL XFR PMPs (INOP SYS), the TRIM/INR/MID TKs and FEED TK 1/4 MAX NOT USABLE lines (info).
 */
export const AC_BUS_24_FAULT_STATUS: ElecBusAlertStatus = {
  limitationsAllPhases: [
    '270400002', // MAX SPEED: 310 KT
    '280400001', // FUEL PARTLY UNUSABLE
  ],
  limitationsApprLdg: [],
  limitationsPfd: ['270400002'],
  inopSysAllPhases: [
    '290100008', // F/CTL PROT
    '220300007', // AP 1+2
    '220300001', // A/THR
    '220300024', // FD 1+2
    '340300008', // ADR 2+3
    '340300029', // TCAS 1+2
    '230300019', // SATCOM
    '280300001', // JETTISON
    '280300011', // FEED TK 1 PMPs
    '280300014', // FEED TK 4 PMPs
  ],
  inopSysApprLdg: [
    '320300007', // BTV
    '320300022', // ROW/ROP
    '320300005', // ALTN BRK
    '700300003', // ENG 2+3 REVERSERs
    '340300028', // RA SYS A+B+C
    '310300001', // AUTO CALLOUT
    '220300027', // CAT 2
    '220300010', // GLS AUTOLAND
    '340300003', // GPWS 1+2
    '341300003', // PRED W/S 1+2
    '220300021', // REACTIVE W/S DET
    '340300049', // ARPT NAV
  ],
  info: [
    '340200002', // ALTN LAW : PROT LOST
    '280200004', // FEED TK 1 BY GRVTY ONLY
    '280200007', // FEED TK 4 BY GRVTY ONLY
    '280200008', // OUTR TKs XFR BY GRVTY ONLY
  ],
};

/**
 * ELEC AC BUS 3+4 & DC BUS 2 FAULT. Without key: VHF 2, HF 2, PART FUEL XFR PMPs, G ELEC PMP A+B (on
 * ground, no engine running), VENT AVNCS EXTRACT, DOOR RES PRESS DET, F/O EFIS CTL, LS 2 (INOP SYS), F/O BARO REF : STD
 * ONLY, F/O KEYBOARD CURSOR CTL AVAIL (info).
 */
export const AC_BUS_34_DC_2_FAULT_STATUS: ElecBusAlertStatus = {
  ...NO_STATUS,
  limitationsApprLdg: ['800400002'], // LDG DIST AFFECTED
  inopSysAllPhases: [
    '290100008', // F/CTL PROT
    '290100001', // PART SPLRs
    '270300011', // PRIM 2
    '270300002', // SEC 2
    '340300005', // ADR 2
    '340300031', // IR 2
    '280300005', // FEED TK 1 MAIN PMP
    '280300006', // FEED TK 3 MAIN PMP
    '300300005', // R WINDSHIELD HEATG
  ],
  inopSysApprLdg: [
    '320300007', // BTV
    '320300022', // ROW/ROP
    '320300005', // ALTN BRK
    '700300002', // ENG 3 REVERSER
    '220300027', // CAT 2
    '220300010', // GLS AUTOLAND
    '340300049', // ARPT NAV
  ],
  info: [
    '340200002', // ALTN LAW : PROT LOST
    '210200001', // CABIN TEMP REGUL DEGRADED
  ],
};

/**
 * ELEC DC BUS 1+2 FAULT. Without key: NO L/G RETRACTION, ATC COM VOICE ONLY, TRIM/MID/INR TKs NOT
 * USABLE (limitations), FUEL NORM + ALTN XFR, MOST FUEL XFR PMPs (INOP SYS), USE TRIM TK XFR FOR CG, BRK WITH ACCU ONLY
 * (info). The conditional limitation FOR LDG : FLAP LVR 3 (severe ice accretion) is left out.
 */
export const DC_BUS_12_FAULT_STATUS: ElecBusAlertStatus = {
  limitationsAllPhases: [
    '240400002', // MAX SPEED: 310/.86
    '240400004', // MANEUVER WITH CARE
    '300400001', // AVOID ICING CONDs
  ],
  limitationsApprLdg: [
    '320400001', // MAX SPEED : 220 KT (for gravity extension)
    '320400002', // L/G GRVTY EXTN ONLY
    '800400002', // LDG DIST AFFECTED
  ],
  limitationsPfd: ['240400002', '240400004', '300400001', '320400001'],
  inopSysAllPhases: [
    '290100008', // F/CTL PROT
    '270300011', // PRIM 2
    '270300012', // PRIM 3
    '270300002', // SEC 2
    '270300003', // SEC 3
    '290100011', // MOST SPLRs
    '220300007', // AP 1+2
    '220300001', // A/THR
    '220300024', // FD 1+2
    '340300012', // TCAS 2
    '280300001', // JETTISON
    '300300001', // WING A-ICE
  ],
  inopSysApprLdg: [
    '320300011', // L/G CTL 1+2
    '320300001', // A-SKID
    '320300002', // AUTO BRK
    '320300022', // ROW/ROP
    '320300017', // N/W + B/W STEER
    '700300003', // ENG 2+3 REVERSERs
    '220300027', // CAT 2
    '220300010', // GLS AUTOLAND
    '340300003', // GPWS 1+2
    '340300049', // ARPT NAV
  ],
  info: [
    '340200004', // DIRECT LAW : PROT LOST
    '280200003', // FUEL CONSUMPT INCRSD : FMS PRED DISREGARD
    '320200002', // BRK PRESS AUTO LIMITED ON ALL L/Gs
    '320200003', // DELAY BRAKING UNTIL NLG TOUCHDOWN
    '340200003', // FLS LIMITED TO F-APP + RAW
  ],
};

/**
 * ELEC DC BUS 1+ESS FAULT. LAND ANSA comes from the procedure recommendation. Without key: MAX FL,
 * AVOID NEG G LOAD (limitations), FUEL NORM+ALTN XFR, FQMS 1+2, FQDC 1+2, MOST FUEL XFR PMPs, FUEL LEAK DET, CG
 * MANAGEMENT, AUTO REFUEL, FUEL AUTO GND XFR (INOP SYS), FOB COMPUTED FROM FU, the TKs NOT USABLE lines (info).
 */
export const DC_BUS_1_ESS_FAULT_STATUS: ElecBusAlertStatus = {
  limitationsAllPhases: [
    '240400002', // MAX SPEED: 310/.86
    '240400004', // MANEUVER WITH CARE
    '230400001', // NO COM AVAIL
    '280400001', // FUEL PARTLY UNUSABLE
  ],
  limitationsApprLdg: [
    '290400001', // SLATS SLOW
    '800400002', // LDG DIST AFFECTED
  ],
  limitationsPfd: ['240400002', '240400004'],
  inopSysAllPhases: [
    '290100008', // F/CTL PROT
    '270300010', // PRIM 1
    '270300012', // PRIM 3
    '270300001', // SEC 1
    '270300003', // SEC 3
    '270300004', // RUDDER TRIM
    '290100011', // MOST SPLRs
    '220300007', // AP 1+2
    '220300001', // A/THR
    '220300024', // FD 1+2
    '340300009', // ADR 1+3
    '230300016', // RMP 1+2+3
    '230300017', // VHF 1+2+3
    '230300018', // HF 1+2
    '230300019', // SATCOM
    '230300006', // DATALINK
    '280300001', // JETTISON
    '280300012', // FEED TK 2 PMPs
    '260300007', // L X BLEED AUTO CTL
    '260300008', // R X BLEED AUTO CTL
    '260300009', // CTR X BLEED AUTO CTL
  ],
  inopSysApprLdg: [
    '290100005', // SLAT SYS 1
    '320300002', // AUTO BRK
    '320300022', // ROW/ROP
    '320300005', // ALTN BRK
    '320300006', // EMER BRK
    '700300001', // ENG 2 REVERSER
    '220300027', // CAT 2
    '220300010', // GLS AUTOLAND
    '340300049', // ARPT NAV
  ],
  info: [
    '340200004', // DIRECT LAW : PROT LOST
    '280200003', // FUEL CONSUMPT INCRSD : FMS PRED DISREGARD
    '280200005', // FEED TK 2 BY GRVTY ONLY
  ],
};
