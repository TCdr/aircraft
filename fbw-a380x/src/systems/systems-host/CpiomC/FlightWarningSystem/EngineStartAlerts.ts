// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * ENG 1(2)(3)(4) START FAULT, START VLV FAULT (NOT CLOSED), START VLV FAULT (NOT OPEN), IGN A(B) FAULT and IGN A+B FAULT
 * (A380 FCOM PRO-ABN-ECAM-10-70, a380_fcom.txt l.172237-172300 and l.172871-173262). The FADEC start sequence of the systems
 * WASM (systems::engine::engine_start, a380_systems engine_failure.rs) detects the faults and writes them per engine:
 * L:A32NX_ENGINE_n_START_FAULT, _START_PHASE, _START_ATTEMPT, _START_MANUAL, _START_VALVE_FAULT, _IGNITER_A_FAULT,
 * _IGNITER_B_FAULT. Flight phase inhibition (FCOM PDF pages 5791, 5792, 5810, 5813, 5817): phases 3, 4, 5, 6, 7, 9 and 10;
 * IGN A(B) FAULT also phase 8.
 *
 * Indications (FCOM PDF figures, the "Indications:" lines of the text):
 * - START FAULT (p.5810, l.172889): none. No aural, no MASTER CAUT, no SD page call.
 * - IGN A(B) FAULT (p.5791, l.172244): none, "Crew awareness".
 * - IGN A+B FAULT (l.172275): single chime and MASTER CAUT.
 * - START VLV FAULT (NOT CLOSED) / (NOT OPEN): single chime, MASTER CAUT, ENGINE SD page (unchanged).
 */

/** The FWS alert level of the alerts without aural and MASTER light (FwsAbnormalSensed `failure`: 1, no SC, no MASTER CAUT) */
export const CREW_AWARENESS_LEVEL = 1;
/** The FWS alert level of the cautions with single chime and MASTER CAUT */
export const MASTER_CAUTION_LEVEL = 2;

/** ENG n START FAULT: no aural, no MASTER light (FCOM p.5810) */
export const START_FAULT_LEVEL = CREW_AWARENESS_LEVEL;
/** ENG n IGN A FAULT, ENG n IGN B FAULT: crew awareness (FCOM p.5791) */
export const IGN_A_OR_B_FAULT_LEVEL = CREW_AWARENESS_LEVEL;
/** ENG n IGN A+B FAULT: single chime and MASTER CAUT (FCOM l.172275) */
export const IGN_A_AND_B_FAULT_LEVEL = MASTER_CAUTION_LEVEL;

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
  N1RotorJam = 9,
}

/** L:A32NX_ENGINE_n_START_VALVE_FAULT (systems::engine::engine_start::StartValveFault) */
export enum StartValveFault {
  None = 0,
  NotOpen = 1,
  NotClosed = 2,
}

/** The ENG START selector position IGN START (L:XMLVAR_ENG_MODE_SEL: 0 CRANK, 1 NORM, 2 IGN START) */
const ENG_START_SELECTOR_IGN_START = 2;

/**
 * IGNITION memo (FCOM DSC-70-90 MEMO, l.113497-113498): "Automatic continuous ignition is in progress, or manual continuous
 * ignition is selected."
 * - Manual: the ENG START selector at IGN START (the memo of the FBW code before 2026-10-09).
 * - Automatic: the FADEC energizes both igniters of an engine. DSC-70-80-20 (l.112367): "The FADEC uses both igniters, when
 *   the continuous ignition operates"; fadec_a380x IgniterSelection_A380X selects A + B for the continuous ignition, the
 *   quick relight, the auto relight and the start in flight, and one igniter only for the automatic start on the ground
 *   (L:A32NX_FADEC_IGNITER_A/B_ACTIVE_ENGn).
 * @param bothIgnitersActive per engine, both FADEC igniters energized
 */
export function isIgnitionMemoShown(engStartSelector: number, bothIgnitersActive: readonly boolean[]): boolean {
  return engStartSelector === ENG_START_SELECTOR_IGN_START || bothIgnitersActive.some((active) => active);
}

export const START_ALERTS_FLIGHT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];
export const IGN_FAULT_FLIGHT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10];

/**
 * The items of ENG n START FAULT (ata70 701800117-120), by index:
 * 0 NO STARTER AIR PRESSURE, 1 LOW N2, 2 LOW N1, 3 HUNG START, 4 EGT OVERLIMIT, 5 NO LIGHT UP, 6 ENG STALL,
 * 7 STARTER TIME EXCEEDED, 8 THR LEVERS NOT AT IDLE, 9 XBLEED OPEN, 10 APU BLEED ON, 11 MIN SPEED FOR WINDML RELIGHT : 260 KT,
 * 12 NEW START IN PROGRESS, 13 THR LEVER n IDLE, 14 CRANK IN PROGRESS (LOW N1), 15 ENG n MASTER OFF, 16 ENG START SEL CRANK,
 * 17 AFTER 30S, 18 ENG START SEL NORM, 19 ENG n MAN START OFF, 20 ALL THR LEVERS IDLE, 21 WINDMILL START INITIATED,
 * 22 ENG PARAMETERS MONITOR, 23 IF ABNORMAL, 24 ENG n MAN START OFF, 25 ENG n MASTER OFF (the in-flight lines of NO STARTER AIR
 * PRESSURE), 26 IF NOT SUCCESSFUL, 27 ENG n MAN START OFF, 28 ENG n MASTER OFF (NO STARTER AIR PRESSURE,
 * l.172931-172933).
 */
export const START_FAULT_ITEM_COUNT = 29;

export interface StartFaultInputs {
  fault: EngineStartFault;
  phase: EngineStartPhase;
  attempt: number;
  manualStart: boolean;
  onGround: boolean;
  masterOn: boolean;
  manualStartPbOn: boolean;
  /** The ENG START selector: 0 CRANK, 1 NORM, 2 IGN START */
  engStartSelector: number;
  apuBleedPbOn: boolean;
  allThrustLeversIdle: boolean;
  /** The thrust lever of the affected engine is at idle */
  thrustLeverIdle: boolean;
}

const START_FAULT_SUB_TITLE: Partial<Record<EngineStartFault, number>> = {
  [EngineStartFault.LowStartAirPressure]: 0,
  [EngineStartFault.StarterFault]: 1,
  [EngineStartFault.N1RotorJam]: 2,
  [EngineStartFault.HungStart]: 3,
  [EngineStartFault.EgtOverlimit]: 4,
  [EngineStartFault.NoLightUp]: 5,
  [EngineStartFault.Stall]: 6,
  [EngineStartFault.StarterTimeExceeded]: 7,
  [EngineStartFault.ThrustLeverNotAtIdle]: 8,
};

/**
 * The items shown, l.172905-173026:
 * - NO STARTER AIR PRESSURE: XBLEED OPEN, APU BLEED ON; in flight (l.172919-172928) MIN SPEED FOR WINDML RELIGHT : 260 KT,
 *   WINDMILL START INITIATED, ENG PARAMETERS MONITOR, IF ABNORMAL: ENG MAN START OFF, ENG MASTER OFF; then, on ground and
 *   in flight, IF NOT SUCCESSFUL: ENG MAN START OFF, ENG MASTER OFF (l.172931-172933: on the FCOM PDF page 5811 this
 *   bullet is at the level of "In flight:", after it, so it closes the NO STARTER AIR PRESSURE case in both).
 * - EGT OVERLIMIT, NO LIGHT UP, ENG STALL (and HUNG START, design choice: the same procedure): in flight ENG MASTER OFF; on
 *   ground during an autostart NEW START IN PROGRESS, then ENG MASTER OFF once the start is aborted; on ground during a manual
 *   start ENG MASTER OFF, ENG START SEL CRANK, AFTER 30S: ENG START SEL NORM, ENG MAN START OFF.
 * - LOW N2 (the starter failure, design choice): ENG MASTER OFF, ENG MAN START OFF (if ON).
 * - STARTER TIME EXCEEDED: during a manual start ENG MAN START OFF; ENG MASTER OFF.
 * - THR LEVERS NOT AT IDLE: ALL THR LEVERS IDLE.
 * - LOW N1 (the N1 rotor jam, on the ground only): THR LEVER n IDLE, CRANK IN PROGRESS, ENG MASTER OFF; during a manual start
 *   ENG START SEL CRANK, AFTER 30S: ENG START SEL NORM, ENG MAN START OFF.
 */
export function startFaultItems(inputs: StartFaultInputs): { show: boolean[]; checked: boolean[] } {
  const show = new Array<boolean>(START_FAULT_ITEM_COUNT).fill(false);
  const subTitle = START_FAULT_SUB_TITLE[inputs.fault];
  if (subTitle !== undefined) {
    show[subTitle] = true;
  }
  const masterOff = () => (show[15] = true);
  const manStartOff = () => (show[19] = show[19] || inputs.manualStartPbOn);

  switch (inputs.fault) {
    case EngineStartFault.LowStartAirPressure:
      show[9] = true;
      show[10] = true;
      if (!inputs.onGround) {
        show[11] = true;
        show[21] = true;
        show[22] = true;
        show[23] = true;
        show[24] = true;
        show[25] = true;
      }
      show[26] = true;
      show[27] = true;
      show[28] = true;
      break;
    case EngineStartFault.HungStart:
    case EngineStartFault.EgtOverlimit:
    case EngineStartFault.NoLightUp:
    case EngineStartFault.Stall:
      if (!inputs.onGround) {
        masterOff();
      } else if (inputs.manualStart) {
        masterOff();
        show[16] = true;
        show[17] = true;
        show[18] = true;
        manStartOff();
      } else if (
        inputs.phase === EngineStartPhase.AutomaticCrank ||
        (inputs.phase === EngineStartPhase.Starting && inputs.attempt > 1)
      ) {
        show[12] = true;
      } else {
        masterOff();
      }
      break;
    case EngineStartFault.N1RotorJam:
      if (inputs.onGround) {
        show[13] = true;
        show[14] = true;
      }
      masterOff();
      if (inputs.onGround && inputs.manualStart) {
        show[16] = true;
        show[17] = true;
        show[18] = true;
        manStartOff();
      }
      break;
    case EngineStartFault.StarterFault:
      masterOff();
      manStartOff();
      break;
    case EngineStartFault.StarterTimeExceeded:
      manStartOff();
      masterOff();
      break;
    case EngineStartFault.ThrustLeverNotAtIdle:
      show[20] = true;
      break;
    default:
      break;
  }

  const checked = new Array<boolean>(START_FAULT_ITEM_COUNT).fill(false);
  checked[10] = inputs.apuBleedPbOn;
  checked[15] = !inputs.masterOn;
  checked[16] = inputs.engStartSelector === 0;
  checked[18] = inputs.engStartSelector === 1;
  checked[19] = !inputs.manualStartPbOn;
  checked[13] = inputs.thrustLeverIdle;
  checked[20] = inputs.allThrustLeversIdle;
  checked[24] = !inputs.manualStartPbOn;
  checked[25] = !inputs.masterOn;
  checked[27] = !inputs.manualStartPbOn;
  checked[28] = !inputs.masterOn;
  return { show, checked };
}

/**
 * The items of ENG n START VLV FAULT (NOT CLOSED) (ata70 701800121-124), by index: 0 ENG n BLEED OFF, 1 APU BLEED OFF,
 * 2 X BLEED CLOSE, 3 ENG n MAN START OFF, 4 ENG n MASTER OFF, 5 WING A-ICE OFF, 6 AVOID ICING CONDs.
 * l.173080-173105: in flight ENG BLEED OFF; if engine 1 APU BLEED OFF; X BLEED CLOSE; during manual start MAN START OFF; on
 * ground ENG MASTER OFF; if engine 1 or 4 WING A-ICE OFF and AVOID ICING CONDs. Design choice: the X BLEED still open after
 * 15 s branch (a departure under MEL) is not modelled.
 */
export const START_VALVE_NOT_CLOSED_ITEM_COUNT = 7;

export interface StartValveFaultInputs {
  engineNumber: 1 | 2 | 3 | 4;
  onGround: boolean;
  masterOn: boolean;
  manualStartPbOn: boolean;
  apuBleedPbOn: boolean;
}

export function startValveNotClosedItems(inputs: StartValveFaultInputs): { show: boolean[]; checked: boolean[] } {
  const outerEngine = inputs.engineNumber === 1 || inputs.engineNumber === 4;
  return {
    show: [
      !inputs.onGround,
      inputs.engineNumber === 1,
      true,
      inputs.manualStartPbOn,
      inputs.onGround,
      outerEngine,
      outerEngine,
    ],
    checked: [false, !inputs.apuBleedPbOn, false, !inputs.manualStartPbOn, !inputs.masterOn, false, false],
  };
}

/** EcamMessages ids of the STATUS and LIMITATIONS lines of ENG n START VLV FAULT (NOT CLOSED) */
const AVOID_ICING_CONDS_LIMITATION = '300400001';
const ENG_BLEED_INOP_SYS = ['260300002', '260300003', '260300004', '260300005'];
const APU_BLEED_INOP_SYS = '260300006';
const WING_ANTI_ICE_INOP_SYS = '300300001';

/**
 * The LIMITATIONS and STATUS of ENG n START VLV FAULT (NOT CLOSED), l.173136-173158:
 * - LIMITATIONS ON ECAM and ON PFD, ALL PHASES, if engine 1 or 4 affected: AVOID ICING CONDs.
 * - INOP SYS ALL PHASES: ENG n BLEED; APU BLEED if engine 1 affected; WING A-ICE if engine 1 or 4 affected.
 * The DEFERRED PROC FOR APPROACH (if engine 1 or 4: IF SEVERE ICE ACCRETION: FOR LDG : FLAP LVR 3) is ata70 700700001.
 */
export function startValveNotClosedStatus(engineNumber: 1 | 2 | 3 | 4): { limitations: string[]; inopSys: string[] } {
  const outerEngine = engineNumber === 1 || engineNumber === 4;
  return {
    limitations: outerEngine ? [AVOID_ICING_CONDS_LIMITATION] : [],
    inopSys: [
      ENG_BLEED_INOP_SYS[engineNumber - 1],
      ...(engineNumber === 1 ? [APU_BLEED_INOP_SYS] : []),
      ...(outerEngine ? [WING_ANTI_ICE_INOP_SYS] : []),
    ],
  };
}

/**
 * The items of ENG n START VLV FAULT (NOT OPEN) (ata70 701800125-128), by index: 0 VLV STUCK CLOSED, 1 ENG n MAN START OFF,
 * 2 ENG n MASTER OFF, 3 MIN SPEED FOR WINDML RELIGHT : 260 KT, 4 WINDMILL START INITIATED, 5 ENG PARAMETERS MONITOR WITH
 * CARE, 6 IF ABNORMAL, 7 ENG n MAN START OFF, 8 ENG n MASTER OFF. l.173216-173257: "If the valve is mechanically stuck
 * closed: VLV STUCK CLOSED; On ground: during manual start MAN START OFF, MASTER OFF"; in flight the FADEC attempts a windmill
 * start, then "IF ABNORMAL: During manual start: MAN START OFF; MASTER OFF". The start sequence reports NOT OPEN for a valve
 * that does not follow its open command, i.e. stuck closed; no starter air is START FAULT NO STARTER AIR PRESSURE.
 */
export const START_VALVE_NOT_OPEN_ITEM_COUNT = 9;

export function startValveNotOpenItems(inputs: StartValveFaultInputs): { show: boolean[]; checked: boolean[] } {
  const inFlight = !inputs.onGround;
  return {
    show: [
      true,
      inputs.onGround && inputs.manualStartPbOn,
      inputs.onGround,
      inFlight,
      inFlight,
      inFlight,
      inFlight,
      inFlight && inputs.manualStartPbOn,
      inFlight,
    ],
    checked: [
      false,
      !inputs.manualStartPbOn,
      !inputs.masterOn,
      false,
      false,
      false,
      false,
      !inputs.manualStartPbOn,
      !inputs.masterOn,
    ],
  };
}
