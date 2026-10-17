// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, cautionItem, readBool } from './FwcAlertItem';

/*
 * The bleed leak, leak detection, HP valve and bleed monitoring cautions of the A320, from the detections of the Rust
 * BMCs (a320_systems/src/pneumatic.rs, docs/a320-simvars.md "Pneumatic"):
 * - AIR L(R) WING LEAK and AIR ENG 1(2) BLEED LEAK
 * - AIR APU BLEED LEAK
 * - AIR ENG 1(2) LEAK DET FAULT, AIR L(R) WNG LEAK DET FAULT, AIR APU LEAK DET FAULT
 * - AIR ENG 1(2) HP VALVE FAULT
 * - BLEED MONIT SYS 1(2) FAULT, BLEED MONITORING FAULT
 * All are amber cautions (level 2) that call the BLEED page.
 *
 * Not modelled: AIR APU BLEED LEAK / APU LEAK FED BY ENG (the Rust APU duct leak only blows APU air) and the LEFT/RIGHT
 * LEAK variants of ENG 1+2 BLEED FAULT. The other bleed cautions (BLEED FAULT, LO TEMP, HI TEMP, NOT CLSD, BLEED OFF,
 * APU BLEED FAULT, X BLEED FAULT) are in FWC/Logic/BleedAlerts.
 */

/** Flight phase inhibitions. The A320 FWC phases are 1 to 10. */
export const BleedLeakMonitoringPhaseInhibition = {
  /** L(R) WING LEAK, ENG 1(2) BLEED LEAK, APU BLEED LEAK */
  leak: [3, 4, 5, 7, 8],
  /** ENG 1(2) LEAK DET FAULT, L(R) WNG LEAK DET FAULT */
  engineOrWingLeakDetectionFault: [3, 4, 5, 6, 7, 8],
  apuLeakDetectionFault: [3, 4, 5, 7, 8],
  hpValveFault: [3, 4, 5, 7, 8],
  bleedMonitoringSystemFault: [3, 4, 5, 6, 7, 8],
  bleedMonitoringFault: [3, 4, 5, 7, 8],
};

/** Index 0 for the engine 1 / the left wing, 1 for the engine 2 / the right wing */
export type BleedSide = 0 | 1;

type PerSide = readonly [boolean, boolean];

/** What the FWC reads for these cautions */
export interface BleedLeakMonitoringInputs {
  /** L:A32NX_ENGINE_STATE:n is On */
  engineRunning: PerSide;
  /** L:A32NX_PNEU_ENG_n_BLEED_LEAK: the pylon leak detection loop detects a leak */
  pylonLeak: PerSide;
  /** L:A32NX_PNEU_LEFT(RIGHT)_WING_LEAK: the wing leak detection loops detect a leak */
  wingLeak: PerSide;
  /** L:A32NX_PNEU_APU_BLEED_LEAK */
  apuLeak: boolean;
  /** L:A32NX_PNEU_ENG_n_LEAK_DET_FAULT */
  pylonLeakDetectionFault: PerSide;
  /** L:A32NX_PNEU_LEFT(RIGHT)_WING_LEAK_DET_FAULT: both loops of the wing inoperative */
  wingLeakDetectionFault: PerSide;
  /** L:A32NX_PNEU_APU_LEAK_DET_FAULT */
  apuLeakDetectionFault: boolean;
  /** L:A32NX_PNEU_ENG_n_HP_VALVE_FAULT */
  hpValveFault: PerSide;
  /** L:A32NX_PNEU_BMC_n_FAULT */
  bmcFault: PerSide;
  /** L:A32NX_OVHD_PNEU_ENG_n_BLEED_PB_IS_AUTO */
  engineBleedPbAuto: PerSide;
  /** L:A32NX_PNEU_ENG_n_PR_VALVE_OPEN */
  engineBleedValveOpen: PerSide;
  /** L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON */
  apuBleedPbOn: boolean;
  /** L:A32NX_APU_BLEED_AIR_VALVE_OPEN */
  apuBleedValveOpen: boolean;
  /** L:A32NX_PNEU_XBLEED_VALVE_FULLY_CLOSED */
  crossBleedFullyClosed: boolean;
  /** L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_SELECTED: the WING ANTI ICE pb is ON */
  wingAntiIceOn: boolean;
}

/** The cautions, true when triggered (before the flight phase inhibition) */
export interface BleedLeakMonitoringStates {
  wingLeak: [boolean, boolean];
  engineBleedLeak: [boolean, boolean];
  apuBleedLeak: boolean;
  engineLeakDetectionFault: [boolean, boolean];
  wingLeakDetectionFault: [boolean, boolean];
  apuLeakDetectionFault: boolean;
  hpValveFault: [boolean, boolean];
  bleedMonitoringSystemFault: [boolean, boolean];
  bleedMonitoringFault: boolean;
}

/**
 * The cautions from the inputs:
 * - L(R) WING LEAK: both wing bleed leak detection loops detect a temperature above 124 °C; ENG 1(2) BLEED LEAK: the
 *   pylon bleed leak detection loop detects a temperature above 204 °C and engine 1(2) is running;
 * - APU BLEED LEAK: the APU bleed leak detection loop detects a temperature above 124 °C;
 * - the LEAK DET FAULT alerts: the loop is inoperative;
 * - HP VALVE FAULT: the HP valve is abnormally closed;
 * - BLEED MONIT SYS 1(2) FAULT: BMC 1(2) is failed; BLEED MONITORING FAULT: both BMCs are failed. Design choice:
 *   BLEED MONITORING FAULT replaces the two MONIT SYS FAULT cautions, as ENG 1+2 BLEED FAULT replaces the single ones.
 */
export function bleedLeakMonitoringStates(inputs: BleedLeakMonitoringInputs): BleedLeakMonitoringStates {
  const bothBmcsFailed = inputs.bmcFault[0] && inputs.bmcFault[1];
  return {
    wingLeak: [inputs.wingLeak[0], inputs.wingLeak[1]],
    engineBleedLeak: [inputs.pylonLeak[0] && inputs.engineRunning[0], inputs.pylonLeak[1] && inputs.engineRunning[1]],
    apuBleedLeak: inputs.apuLeak,
    engineLeakDetectionFault: [inputs.pylonLeakDetectionFault[0], inputs.pylonLeakDetectionFault[1]],
    wingLeakDetectionFault: [inputs.wingLeakDetectionFault[0], inputs.wingLeakDetectionFault[1]],
    apuLeakDetectionFault: inputs.apuLeakDetectionFault,
    hpValveFault: [inputs.hpValveFault[0], inputs.hpValveFault[1]],
    bleedMonitoringSystemFault: [inputs.bmcFault[0] && !bothBmcsFailed, inputs.bmcFault[1] && !bothBmcsFailed],
    bleedMonitoringFault: bothBmcsFailed,
  };
}

/**
 * L(R) WING LEAK and ENG 1(2) BLEED LEAK: 0 title, 1 -ENG n BLEED OFF, 2 -APU BLEED OFF, 3 -X BLEED SHUT,
 * 4 -WING ANTI ICE OFF, 5 AVOID ICING CONDITIONS.
 * ENG BLEED OFF: while the pb-sw is ON and the bleed valve open; APU BLEED OFF: left side only, while the pb-sw is ON
 * and the APU bleed valve open; X BLEED SHUT: while the crossbleed valve is not closed; WING ANTI ICE OFF: while the pb
 * is ON. The lines of actions done go.
 */
export function leakLines(inputs: BleedLeakMonitoringInputs, side: BleedSide): number[] {
  const lines = [0];
  if (inputs.engineBleedPbAuto[side] && inputs.engineBleedValveOpen[side]) {
    lines.push(1);
  }
  if (side === 0 && inputs.apuBleedPbOn && inputs.apuBleedValveOpen) {
    lines.push(2);
  }
  if (!inputs.crossBleedFullyClosed) {
    lines.push(3);
  }
  if (inputs.wingAntiIceOn) {
    lines.push(4);
  }
  lines.push(5);
  return lines;
}

/** APU BLEED LEAK: 0 title, 1 -APU BLEED OFF (while the pb-sw is ON and the valve open) */
export function apuLeakLines(inputs: BleedLeakMonitoringInputs): number[] {
  return [0, ...(inputs.apuBleedPbOn && inputs.apuBleedValveOpen ? [1] : [])];
}

/** The STATUS codes of these cautions (StatusMessages) */
export const BleedLeakMonitoringStatusCodes = {
  avoidIcing: '700400001',
  ifSevereIceAccretion: '700500001',
  minSpeed: '700400002',
  maneuverWithCare: '700400003',
  ldgDistProc: '700400004',
  airPressLowAtIdle: '360200101',
  wingAntiIce: '300300001',
  eng1Bleed: '360300001',
  eng2Bleed: '360300002',
  pack1: '210300001',
  pack2: '210300002',
  eng1LeakDetection: '360300101',
  eng2LeakDetection: '360300102',
  leftWingLeakDetection: '360300103',
  rightWingLeakDetection: '360300104',
  apuLeakDetection: '360300105',
  apuBleed: '360300106',
  bmc1: '360300107',
  bmc2: '360300108',
  bmc1And2: '360300109',
} as const;

const S = BleedLeakMonitoringStatusCodes;

const bySide = <T>(side: BleedSide, left: T, right: T): T => (side === 0 ? left : right);

/**
 * L(R) WING LEAK and ENG 1(2) BLEED LEAK STATUS: AVOID ICING CONDITIONS, IF SEVERE ICE ACCRETION: MIN SPD
 * VLS +10 / G DOT, MANEUVER WITH CARE, LDG DIST PROC APPLY; INOP SYS WING A.ICE, ENG 1(2) BLEED, PACK 1(2)
 */
export function leakStatus(side: BleedSide): StatusLines {
  return {
    left: [S.avoidIcing, S.ifSevereIceAccretion, S.minSpeed, S.maneuverWithCare, S.ldgDistProc],
    inopSys: [S.wingAntiIce, bySide(side, S.eng1Bleed, S.eng2Bleed), bySide(side, S.pack1, S.pack2)],
  };
}

/** APU BLEED LEAK STATUS: INOP SYS APU BLEED */
function apuLeakStatus(): StatusLines {
  return { left: [], inopSys: [S.apuBleed] };
}

/** ENG 1(2) LEAK DET FAULT, L(R) WNG LEAK DET FAULT, APU LEAK DET FAULT: INOP SYS */
function leakDetectionFaultStatus(loop: 'eng1' | 'eng2' | 'leftWing' | 'rightWing' | 'apu'): StatusLines {
  const code = {
    eng1: S.eng1LeakDetection,
    eng2: S.eng2LeakDetection,
    leftWing: S.leftWingLeakDetection,
    rightWing: S.rightWingLeakDetection,
    apu: S.apuLeakDetection,
  }[loop];
  return { left: [], inopSys: [code] };
}

/** ENG 1(2) HP VALVE FAULT STATUS: AIR PRESS LOW AT IDLE (green) */
function hpValveFaultStatus(): StatusLines {
  return { left: [S.airPressLowAtIdle], inopSys: [] };
}

/** BLEED MONIT SYS 1(2) FAULT and BLEED MONITORING FAULT STATUS: INOP SYS BMC 1(2), BMC 1 + 2 */
function bmcFaultStatus(bmc: 1 | 2 | 'both'): StatusLines {
  return { left: [], inopSys: [bmc === 'both' ? S.bmc1And2 : bmc === 1 ? S.bmc1 : S.bmc2] };
}

/** The alert keys (ATA 36), in the order of the EwdMessages codes 3612xxx */
export const BleedLeakMonitoringAlertKeys = {
  leftWingLeak: '3612001',
  rightWingLeak: '3612002',
  eng1BleedLeak: '3612003',
  eng2BleedLeak: '3612004',
  apuBleedLeak: '3612005',
  eng1LeakDetectionFault: '3612006',
  eng2LeakDetectionFault: '3612007',
  leftWingLeakDetectionFault: '3612008',
  rightWingLeakDetectionFault: '3612009',
  apuLeakDetectionFault: '3612010',
  eng1HpValveFault: '3612011',
  eng2HpValveFault: '3612012',
  bleedMonitoringSystem1Fault: '3612013',
  bleedMonitoringSystem2Fault: '3612014',
  bleedMonitoringFault: '3612015',
} as const;

const K = BleedLeakMonitoringAlertKeys;

/** The number of E/WD lines (title included) of each alert */
export const BleedLeakMonitoringLineCounts: Record<string, number> = {
  [K.leftWingLeak]: 6,
  [K.rightWingLeak]: 6,
  [K.eng1BleedLeak]: 6,
  [K.eng2BleedLeak]: 6,
  [K.apuBleedLeak]: 2,
  [K.eng1LeakDetectionFault]: 1,
  [K.eng2LeakDetectionFault]: 1,
  [K.leftWingLeakDetectionFault]: 1,
  [K.rightWingLeakDetectionFault]: 1,
  [K.apuLeakDetectionFault]: 1,
  [K.eng1HpValveFault]: 1,
  [K.eng2HpValveFault]: 1,
  [K.bleedMonitoringSystem1Fault]: 1,
  [K.bleedMonitoringSystem2Fault]: 1,
  [K.bleedMonitoringFault]: 1,
};

/** The inputs of a cold and dark aircraft, before the first update */
export const NO_BLEED_LEAK_MONITORING_INPUTS: BleedLeakMonitoringInputs = {
  engineRunning: [false, false],
  pylonLeak: [false, false],
  wingLeak: [false, false],
  apuLeak: false,
  pylonLeakDetectionFault: [false, false],
  wingLeakDetectionFault: [false, false],
  apuLeakDetectionFault: false,
  hpValveFault: [false, false],
  bmcFault: [false, false],
  engineBleedPbAuto: [true, true],
  engineBleedValveOpen: [false, false],
  apuBleedPbOn: false,
  apuBleedValveOpen: false,
  crossBleedFullyClosed: true,
  wingAntiIceOn: false,
};

/**
 * The bleed leak, leak detection, HP valve and BMC cautions of the FWC: one Subject per alert, and the alert items the
 * PseudoFWC adds to its ewdMessageFailures.
 */
export class BleedLeakMonitoringAlerts {
  private inputs: BleedLeakMonitoringInputs = NO_BLEED_LEAK_MONITORING_INPUTS;

  /** One Subject per alert key (ES2017 only, the Coherent runtime has no Object.fromEntries) */
  private readonly active = Object.values(K).reduce(
    (subjects, key) => {
      subjects[key] = Subject.create(false);
      return subjects;
    },
    {} as Record<string, Subject<boolean>>,
  );

  /** The current alerts, for the specs */
  public states: BleedLeakMonitoringStates = bleedLeakMonitoringStates(NO_BLEED_LEAK_MONITORING_INPUTS);

  update(inputs: BleedLeakMonitoringInputs): void {
    this.inputs = inputs;
    const s = bleedLeakMonitoringStates(inputs);
    this.states = s;
    this.active[K.leftWingLeak].set(s.wingLeak[0]);
    this.active[K.rightWingLeak].set(s.wingLeak[1]);
    this.active[K.eng1BleedLeak].set(s.engineBleedLeak[0]);
    this.active[K.eng2BleedLeak].set(s.engineBleedLeak[1]);
    this.active[K.apuBleedLeak].set(s.apuBleedLeak);
    this.active[K.eng1LeakDetectionFault].set(s.engineLeakDetectionFault[0]);
    this.active[K.eng2LeakDetectionFault].set(s.engineLeakDetectionFault[1]);
    this.active[K.leftWingLeakDetectionFault].set(s.wingLeakDetectionFault[0]);
    this.active[K.rightWingLeakDetectionFault].set(s.wingLeakDetectionFault[1]);
    this.active[K.apuLeakDetectionFault].set(s.apuLeakDetectionFault);
    this.active[K.eng1HpValveFault].set(s.hpValveFault[0]);
    this.active[K.eng2HpValveFault].set(s.hpValveFault[1]);
    this.active[K.bleedMonitoringSystem1Fault].set(s.bleedMonitoringSystemFault[0]);
    this.active[K.bleedMonitoringSystem2Fault].set(s.bleedMonitoringSystemFault[1]);
    this.active[K.bleedMonitoringFault].set(s.bleedMonitoringFault);
  }

  private item(
    key: string,
    flightPhaseInhib: number[],
    lines: () => number[],
    status: () => StatusLines,
  ): FwcAlertItem {
    return cautionItem(
      key,
      BleedLeakMonitoringLineCounts[key],
      this.active[key],
      flightPhaseInhib,
      lines,
      EcamSysPage.BLEED,
      status,
    );
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = (() => {
    const P = BleedLeakMonitoringPhaseInhibition;
    const title = () => [0];
    const items: Record<string, FwcAlertItem> = {};
    for (const side of [0, 1] as const) {
      items[bySide(side, K.leftWingLeak, K.rightWingLeak)] = this.item(
        bySide(side, K.leftWingLeak, K.rightWingLeak),
        P.leak,
        () => leakLines(this.inputs, side),
        () => leakStatus(side),
      );
      items[bySide(side, K.eng1BleedLeak, K.eng2BleedLeak)] = this.item(
        bySide(side, K.eng1BleedLeak, K.eng2BleedLeak),
        P.leak,
        () => leakLines(this.inputs, side),
        () => leakStatus(side),
      );
      items[bySide(side, K.eng1LeakDetectionFault, K.eng2LeakDetectionFault)] = this.item(
        bySide(side, K.eng1LeakDetectionFault, K.eng2LeakDetectionFault),
        P.engineOrWingLeakDetectionFault,
        title,
        () => leakDetectionFaultStatus(bySide(side, 'eng1', 'eng2')),
      );
      items[bySide(side, K.leftWingLeakDetectionFault, K.rightWingLeakDetectionFault)] = this.item(
        bySide(side, K.leftWingLeakDetectionFault, K.rightWingLeakDetectionFault),
        P.engineOrWingLeakDetectionFault,
        title,
        () => leakDetectionFaultStatus(bySide(side, 'leftWing', 'rightWing')),
      );
      items[bySide(side, K.eng1HpValveFault, K.eng2HpValveFault)] = this.item(
        bySide(side, K.eng1HpValveFault, K.eng2HpValveFault),
        P.hpValveFault,
        title,
        hpValveFaultStatus,
      );
      items[bySide(side, K.bleedMonitoringSystem1Fault, K.bleedMonitoringSystem2Fault)] = this.item(
        bySide(side, K.bleedMonitoringSystem1Fault, K.bleedMonitoringSystem2Fault),
        P.bleedMonitoringSystemFault,
        title,
        () => bmcFaultStatus(bySide(side, 1, 2)),
      );
    }
    items[K.apuBleedLeak] = this.item(K.apuBleedLeak, P.leak, () => apuLeakLines(this.inputs), apuLeakStatus);
    items[K.apuLeakDetectionFault] = this.item(K.apuLeakDetectionFault, P.apuLeakDetectionFault, title, () =>
      leakDetectionFaultStatus('apu'),
    );
    items[K.bleedMonitoringFault] = this.item(K.bleedMonitoringFault, P.bleedMonitoringFault, title, () =>
      bmcFaultStatus('both'),
    );
    return items;
  })();
}

/* Acquisition (not unit tested: SimVar reads only) */

const perEngine = (name: (engineNumber: 1 | 2) => string): [boolean, boolean] => [readBool(name(1)), readBool(name(2))];

/** Reads the inputs from the simvars */
export function readBleedLeakMonitoringInputs(): BleedLeakMonitoringInputs {
  return {
    // L:A32NX_ENGINE_STATE: 0 off, 1 on, 2 starting, 3 restarting, 4 shutting down
    engineRunning: [
      SimVar.GetSimVarValue('L:A32NX_ENGINE_STATE:1', 'enum') === 1,
      SimVar.GetSimVarValue('L:A32NX_ENGINE_STATE:2', 'enum') === 1,
    ],
    pylonLeak: perEngine((n) => `L:A32NX_PNEU_ENG_${n}_BLEED_LEAK`),
    wingLeak: [readBool('L:A32NX_PNEU_LEFT_WING_LEAK'), readBool('L:A32NX_PNEU_RIGHT_WING_LEAK')],
    apuLeak: readBool('L:A32NX_PNEU_APU_BLEED_LEAK'),
    pylonLeakDetectionFault: perEngine((n) => `L:A32NX_PNEU_ENG_${n}_LEAK_DET_FAULT`),
    wingLeakDetectionFault: [
      readBool('L:A32NX_PNEU_LEFT_WING_LEAK_DET_FAULT'),
      readBool('L:A32NX_PNEU_RIGHT_WING_LEAK_DET_FAULT'),
    ],
    apuLeakDetectionFault: readBool('L:A32NX_PNEU_APU_LEAK_DET_FAULT'),
    hpValveFault: perEngine((n) => `L:A32NX_PNEU_ENG_${n}_HP_VALVE_FAULT`),
    bmcFault: perEngine((n) => `L:A32NX_PNEU_BMC_${n}_FAULT`),
    engineBleedPbAuto: perEngine((n) => `L:A32NX_OVHD_PNEU_ENG_${n}_BLEED_PB_IS_AUTO`),
    engineBleedValveOpen: perEngine((n) => `L:A32NX_PNEU_ENG_${n}_PR_VALVE_OPEN`),
    // The cockpit pb-sw variable (A32NX_Interior_Misc.xml); L:A32NX_OVHD_APU_BLEED_PB_IS_ON is written by nothing
    apuBleedPbOn: readBool('L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON'),
    apuBleedValveOpen: readBool('L:A32NX_APU_BLEED_AIR_VALVE_OPEN'),
    crossBleedFullyClosed: readBool('L:A32NX_PNEU_XBLEED_VALVE_FULLY_CLOSED'),
    wingAntiIceOn: readBool('L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_SELECTED'),
  };
}
