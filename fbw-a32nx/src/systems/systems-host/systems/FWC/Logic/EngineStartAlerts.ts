// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * ENG 1(2) START FAULT, ENG 1(2) START VALVE FAULT and ENG 1(2) IGN FAULT. The FADEC start sequence of the systems WASM
 * (systems::engine::engine_start) detects the faults and writes them per engine:
 * - L:A32NX_ENGINE_n_START_FAULT (EngineStartFault), L:A32NX_ENGINE_n_START_PHASE (EngineStartPhase),
 *   L:A32NX_ENGINE_n_START_MANUAL;
 * - L:A32NX_ENGINE_n_START_VALVE_FAULT (StartValveFault);
 * - L:A32NX_ENGINE_n_IGNITER_A_FAULT, L:A32NX_ENGINE_n_IGNITER_B_FAULT.
 * All three are amber cautions, inhibited in phases 3, 4, 5, 7 and 8; IGN A OR B FAULT also in phase 6; START FAULT also
 * in phase 6, only for THR LEVER NOT AT IDLE.
 */

/** L:A32NX_ENGINE_n_START_PHASE (systems::engine::engine_start::EngineStartPhase) */
export enum EngineStartPhase {
  None = 0,
  Motoring = 1,
  Starting = 2,
  AutomaticCrank = 3,
  Aborted = 4,
  WetCrank = 5,
}

/** L:A32NX_ENGINE_n_START_FAULT (systems::engine::engine_start::EngineStartFault) */
export enum EngineStartFault {
  None = 0,
  NoLightUp = 1,
  Stall = 2,
  EgtOverlimit = 3,
  HungStart = 4,
  StarterFault = 5,
  LowStartAirPressure = 6,
  ThrustLeverNotAtIdle = 7,
  StarterTimeExceeded = 8,
}

/** L:A32NX_ENGINE_n_START_VALVE_FAULT (systems::engine::engine_start::StartValveFault) */
export enum StartValveFault {
  None = 0,
  NotOpen = 1,
  NotClosed = 2,
}

/** The flight phases that inhibit the three alerts (see the file comment) */
export const START_ALERTS_FLIGHT_PHASE_INHIBITION = [3, 4, 5, 7, 8];
export const IGN_FAULT_FLIGHT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8];
export const IGN_A_PLUS_B_FAULT_FLIGHT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/**
 * ENG 1(2) START FAULT is active while the FADEC reports a start fault, except THR LEVER NOT AT IDLE in flight phase 6
 * (the alert is inhibited in phase 6 only for that cause).
 */
export function isStartFaultActive(fault: EngineStartFault, flightPhase: number): boolean {
  if (fault === EngineStartFault.None || fault === EngineStartFault.StarterTimeExceeded) {
    // the A320 has no starter time limit alert: the FADEC does not report it
    return false;
  }
  return !(fault === EngineStartFault.ThrustLeverNotAtIdle && flightPhase === 6);
}

/**
 * The lines of ENG 1(2) START FAULT, by index in its codes (EwdMessages 7700801/7700802):
 * 0 title, 1 IGNITION FAULT, 2 STALL, 3 EGT OVERLIMIT, 4 HUNG START, 5 STARTER SHAFT SHEAR, 6 LO START AIR PRESS,
 * 7 THR LEVER NOT AT IDLE, 8 AUTO CRANK IN PROGRESS, 9 NEW START IN PROGRESS, 10 -ENG MASTER n OFF, 11 -MAN START n OFF,
 * 12 -BLEED AIR SUPPLY CHECK, 13 -THR LEVER n IDLE, 14 WINDMILL START ONLY.
 */
export interface StartFaultLineInputs {
  fault: EngineStartFault;
  phase: EngineStartPhase;
  /** The FADEC runs a manual start (ENG MAN START pb ON at the ENG MASTER ON) */
  manualStart: boolean;
  onGround: boolean;
  masterOn: boolean;
  manualStartPbOn: boolean;
}

const START_FAULT_SUB_TITLE: Partial<Record<EngineStartFault, number>> = {
  [EngineStartFault.NoLightUp]: 1,
  [EngineStartFault.Stall]: 2,
  [EngineStartFault.EgtOverlimit]: 3,
  [EngineStartFault.HungStart]: 4,
  [EngineStartFault.StarterFault]: 5,
  [EngineStartFault.LowStartAirPressure]: 6,
  [EngineStartFault.ThrustLeverNotAtIdle]: 7,
};

/**
 * The procedure of each start fault, the lines of actions done removed:
 * - IGNITION FAULT, STALL and EGT OVERLIMIT; HUNG START (the A320neo gives it the same procedure):
 *   - in flight: ENG MASTER OFF;
 *   - on ground, automatic start: AUTO CRANK IN PROGRESS during the automatic dry crank, NEW START IN PROGRESS during the
 *     next attempt, and ENG MASTER OFF once the start is aborted (the final dry crank finished);
 *   - on ground, manual start: ENG MASTER OFF, MAN START OFF (the next lines, MODE SEL CRANK and MAN START ON for a dry
 *     crank, are not displayed).
 * - STARTER SHAFT SHEAR (A320neo): on ground ENG MASTER OFF, MAN START OFF; in flight
 *   WINDMILL START ONLY.
 * - LO START AIR PRESS: BLEED AIR SUPPLY CHECK.
 * - THR LEVER NOT AT IDLE: THR LEVER IDLE.
 */
export function startFaultLines(inputs: StartFaultLineInputs): number[] {
  const subTitle = START_FAULT_SUB_TITLE[inputs.fault];
  if (subTitle === undefined) {
    return [];
  }
  const lines = [0, subTitle];
  const masterOff = inputs.masterOn ? [10] : [];
  const manStartOff = inputs.manualStartPbOn ? [11] : [];

  switch (inputs.fault) {
    case EngineStartFault.NoLightUp:
    case EngineStartFault.Stall:
    case EngineStartFault.EgtOverlimit:
    case EngineStartFault.HungStart:
      if (!inputs.onGround) {
        lines.push(...masterOff);
      } else if (inputs.manualStart) {
        lines.push(...masterOff, ...manStartOff);
      } else if (inputs.phase === EngineStartPhase.AutomaticCrank) {
        lines.push(8);
      } else if (inputs.phase === EngineStartPhase.Starting) {
        lines.push(9);
      } else {
        lines.push(...masterOff);
      }
      break;
    case EngineStartFault.StarterFault:
      if (inputs.onGround) {
        lines.push(...masterOff, ...manStartOff);
      } else {
        lines.push(14);
      }
      break;
    case EngineStartFault.LowStartAirPressure:
      lines.push(12);
      break;
    case EngineStartFault.ThrustLeverNotAtIdle:
      lines.push(13);
      break;
    default:
      break;
  }
  return lines;
}

/**
 * The STATUS of ENG 1(2) START FAULT: STARTER SHAFT SHEAR gives ENG (AFFECTED) WINDMILL START ONLY (A320neo). The other
 * start faults have no STATUS.
 */
export function startFaultStatus(engineNumber: 1 | 2, fault: EngineStartFault): string[] {
  return fault === EngineStartFault.StarterFault ? [engineNumber === 1 ? '800400001' : '800400002'] : [];
}

/**
 * The lines of ENG 1(2) START VALVE FAULT, by index in its codes (EwdMessages 7700811/7700812):
 * 0 title, 1 START VALVE NOT CLOSED, 2 -APU BLEED OFF, 3 -X BLEED SHUT, 4 -ENG n BLEED OFF, 5 -MAN START n OFF,
 * 6 -WING ANTI ICE OFF, 7 AVOID ICING CONDITIONS, 8 -ENG MASTER n OFF, 9 START VALVE NOT OPEN, 10 -X BLEED OPEN,
 * 11 -APU BLEED ON, 12 .IF UNSUCCESSFUL:.
 */
export interface StartValveFaultLineInputs {
  engineNumber: 1 | 2;
  fault: StartValveFault;
  onGround: boolean;
  masterOn: boolean;
  manualStartPbOn: boolean;
  apuBleedOn: boolean;
  /** The X BLEED is open (selector OPEN, or AUTO with the valve open) */
  crossBleedOpen: boolean;
  /** The X BLEED selector is at OPEN */
  crossBleedSelectorOpen: boolean;
  engineBleedOn: boolean;
  wingAntiIceOn: boolean;
  oppositeEngineRunning: boolean;
  apuAvailable: boolean;
  /** The aircraft is below FL 200 (pressure altitude) */
  belowFl200: boolean;
}

/**
 * The lines of ENG 1(2) START VALVE FAULT:
 * - START VALVE NOT CLOSED: APU BLEED (IF ENG 1 AFFECTED) OFF, X BLEED SHUT; in flight ENG BLEED (AFFECTED) OFF, MAN START
 *   (IF MAN START PERFORMED) OFF, WING ANTI ICE OFF, AVOID ICING CONDITIONS; on ground MAN START (IF MAN START PERFORMED) OFF,
 *   ENG MASTER (AFFECTED) OFF.
 * - START VALVE NOT OPEN: if opposite engine running X BLEED OPEN; if APU AVAIL below FL 200 APU BLEED ON; IF UNSUCCESSFUL:
 *   MAN START (IF MAN START PERFORMED) OFF, ENG MASTER (AFFECTED) (IF AUTO START PERFORMED) OFF.
 * The lines of actions done go. Design choice: "MAN START PERFORMED" is the ENG MAN START pb ON; for NOT OPEN the IF
 * UNSUCCESSFUL lines show with the condition line.
 * Not modelled: the "EEC control of start valve failed" lines (IAE or PW engines only).
 */
export function startValveFaultLines(inputs: StartValveFaultLineInputs): number[] {
  if (inputs.fault === StartValveFault.NotClosed) {
    const lines = [0, 1];
    if (inputs.engineNumber === 1 && inputs.apuBleedOn) {
      lines.push(2);
    }
    if (inputs.crossBleedOpen) {
      lines.push(3);
    }
    if (!inputs.onGround) {
      if (inputs.engineBleedOn) {
        lines.push(4);
      }
      if (inputs.manualStartPbOn) {
        lines.push(5);
      }
      if (inputs.wingAntiIceOn) {
        lines.push(6);
      }
      lines.push(7);
    } else {
      if (inputs.manualStartPbOn) {
        lines.push(5);
      }
      if (inputs.masterOn) {
        lines.push(8);
      }
    }
    return lines;
  }
  if (inputs.fault === StartValveFault.NotOpen) {
    const lines = [0, 9];
    if (inputs.oppositeEngineRunning && !inputs.crossBleedSelectorOpen) {
      lines.push(10);
    }
    if (inputs.apuAvailable && inputs.belowFl200 && !inputs.apuBleedOn) {
      lines.push(11);
    }
    lines.push(12);
    if (inputs.manualStartPbOn) {
      lines.push(5);
    } else if (inputs.masterOn) {
      lines.push(8);
    }
    return lines;
  }
  return [];
}

/** The STATUS page codes of ENG 1(2) START VALVE FAULT (StatusMessages) */
export interface StartValveFaultStatus {
  left: string[];
  inopSys: string[];
}

/**
 * The STATUS of ENG 1(2) START VALVE FAULT: AVOID ICING CONDITIONS; IF SEVERE ICE ACCRETION: MIN SPD VLS+10
 * /G DOT, MANEUVER WITH CARE; in flight LDG DIST PROC APPLY; INOP SYS WING A. ICE (in flight). Design choice: they follow
 * the wing anti-ice that the NOT CLOSED procedure switches off in flight, so only for NOT CLOSED in flight.
 */
export function startValveFaultStatus(fault: StartValveFault, onGround: boolean): StartValveFaultStatus {
  if (fault !== StartValveFault.NotClosed || onGround) {
    return { left: [], inopSys: [] };
  }
  return {
    left: ['700400001', '700500001', '700400002', '700400003', '700400004'],
    inopSys: ['300300001'],
  };
}

/**
 * The lines of ENG 1(2) IGN FAULT, by index in its codes (EwdMessages 7700741/7700742): 0 title IGN A FAULT, 1 title IGN B
 * FAULT, 2 title IGN A+B FAULT, 3 AVOID ADVERSE CONDITIONS.
 * IGN A OR B FAULT is crew awareness; IGN A+B FAULT gives AVOID ADVERSE CONDITIONS.
 */
export function ignitionFaultLines(igniterAFault: boolean, igniterBFault: boolean): number[] {
  if (igniterAFault && igniterBFault) {
    return [2, 3];
  }
  if (igniterAFault) {
    return [0];
  }
  return igniterBFault ? [1] : [];
}

/** INOP SYS of ENG 1(2) IGN FAULT: ENG 1(2) IGN A (B), or ENG 1(2) IGN for A+B */
export function ignitionFaultInopSys(engineNumber: 1 | 2, igniterAFault: boolean, igniterBFault: boolean): string[] {
  const base = engineNumber === 1 ? 0 : 2;
  if (igniterAFault && igniterBFault) {
    return [engineNumber === 1 ? '740300005' : '740300006'];
  }
  if (igniterAFault) {
    return [`74030000${base + 1}`];
  }
  return igniterBFault ? [`74030000${base + 2}`] : [];
}
