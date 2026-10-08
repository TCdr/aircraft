// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * ENG 1(2)(3)(4) START FAULT, START VLV FAULT (NOT CLOSED), START VLV FAULT (NOT OPEN), IGN A(B) FAULT and IGN A+B FAULT
 * (A380 FCOM PRO-ABN-ECAM-10-70, a380_fcom.txt l.172237-172300 and l.172871-173262). The FADEC start sequence of the systems
 * WASM (systems::engine::engine_start, a380_systems engine_failure.rs) detects the faults and writes them per engine:
 * L:A32NX_ENGINE_n_START_FAULT, _START_PHASE, _START_ATTEMPT, _START_MANUAL, _START_VALVE_FAULT, _IGNITER_A_FAULT,
 * _IGNITER_B_FAULT. Flight phase inhibition (FCOM PDF pages 5791, 5792, 5810, 5813, 5817): phases 3, 4, 5, 6, 7, 9 and 10;
 * IGN A(B) FAULT also phase 8.
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

export const START_ALERTS_FLIGHT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];
export const IGN_FAULT_FLIGHT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10];

/**
 * The items of ENG n START FAULT (ata70 701800117-120), by index:
 * 0 NO STARTER AIR PRESSURE, 1 LOW N2, 2 HUNG START, 3 EGT OVERLIMIT, 4 NO LIGHT UP, 5 ENG STALL, 6 STARTER TIME EXCEEDED,
 * 7 THR LEVERS NOT AT IDLE, 8 XBLEED OPEN, 9 APU BLEED ON, 10 MIN SPEED FOR WINDML RELIGHT : 260 KT, 11 NEW START IN
 * PROGRESS, 12 ENG n MASTER OFF, 13 ENG START SEL CRANK, 14 AFTER 30S, 15 ENG START SEL NORM, 16 ENG n MAN START OFF,
 * 17 ALL THR LEVERS IDLE.
 */
export const START_FAULT_ITEM_COUNT = 18;

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
}

const START_FAULT_SUB_TITLE: Partial<Record<EngineStartFault, number>> = {
  [EngineStartFault.LowStartAirPressure]: 0,
  [EngineStartFault.StarterFault]: 1,
  [EngineStartFault.HungStart]: 2,
  [EngineStartFault.EgtOverlimit]: 3,
  [EngineStartFault.NoLightUp]: 4,
  [EngineStartFault.Stall]: 5,
  [EngineStartFault.StarterTimeExceeded]: 6,
  [EngineStartFault.ThrustLeverNotAtIdle]: 7,
};

/**
 * The items shown, l.172905-173026:
 * - NO STARTER AIR PRESSURE: XBLEED OPEN, APU BLEED ON; in flight MIN SPEED FOR WINDML RELIGHT : 260 KT. Design choice: the
 *   IF NOT SUCCESSFUL lines are left out (the crew supplies air and the start goes on).
 * - EGT OVERLIMIT, NO LIGHT UP, ENG STALL (and HUNG START, design choice: the same procedure): in flight ENG MASTER OFF; on
 *   ground during an autostart NEW START IN PROGRESS, then ENG MASTER OFF once the start is aborted; on ground during a manual
 *   start ENG MASTER OFF, ENG START SEL CRANK, AFTER 30S: ENG START SEL NORM, ENG MAN START OFF.
 * - LOW N2 (the starter failure, design choice): ENG MASTER OFF, ENG MAN START OFF (if ON).
 * - STARTER TIME EXCEEDED: during a manual start ENG MAN START OFF; ENG MASTER OFF.
 * - THR LEVERS NOT AT IDLE: ALL THR LEVERS IDLE.
 * Not modelled: LOW N1 (no N1 rotor failure).
 */
export function startFaultItems(inputs: StartFaultInputs): { show: boolean[]; checked: boolean[] } {
  const show = new Array<boolean>(START_FAULT_ITEM_COUNT).fill(false);
  const subTitle = START_FAULT_SUB_TITLE[inputs.fault];
  if (subTitle !== undefined) {
    show[subTitle] = true;
  }
  const masterOff = () => (show[12] = true);
  const manStartOff = () => (show[16] = show[16] || inputs.manualStartPbOn);

  switch (inputs.fault) {
    case EngineStartFault.LowStartAirPressure:
      show[8] = true;
      show[9] = true;
      show[10] = !inputs.onGround;
      break;
    case EngineStartFault.HungStart:
    case EngineStartFault.EgtOverlimit:
    case EngineStartFault.NoLightUp:
    case EngineStartFault.Stall:
      if (!inputs.onGround) {
        masterOff();
      } else if (inputs.manualStart) {
        masterOff();
        show[13] = true;
        show[14] = true;
        show[15] = true;
        manStartOff();
      } else if (
        inputs.phase === EngineStartPhase.AutomaticCrank ||
        (inputs.phase === EngineStartPhase.Starting && inputs.attempt > 1)
      ) {
        show[11] = true;
      } else {
        masterOff();
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
      show[17] = true;
      break;
    default:
      break;
  }

  const checked = new Array<boolean>(START_FAULT_ITEM_COUNT).fill(false);
  checked[9] = inputs.apuBleedPbOn;
  checked[12] = !inputs.masterOn;
  checked[13] = inputs.engStartSelector === 0;
  checked[15] = inputs.engStartSelector === 1;
  checked[16] = !inputs.manualStartPbOn;
  checked[17] = inputs.allThrustLeversIdle;
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

/**
 * The items of ENG n START VLV FAULT (NOT OPEN) (ata70 701800125-128), by index: 0 VLV STUCK CLOSED, 1 ENG n MAN START OFF,
 * 2 ENG n MASTER OFF, 3 MIN SPEED FOR WINDML RELIGHT : 260 KT, 4 WINDMILL START INITIATED, 5 ENG PARAMETERS MONITOR WITH
 * CARE. l.173216-173252: "If the valve is mechanically stuck closed: VLV STUCK CLOSED; On ground: during manual start MAN
 * START OFF, MASTER OFF"; in flight the FADEC attempts a windmill start. The start sequence reports NOT OPEN for a valve
 * that does not follow its open command, i.e. stuck closed; no starter air is START FAULT NO STARTER AIR PRESSURE.
 */
export const START_VALVE_NOT_OPEN_ITEM_COUNT = 6;

export function startValveNotOpenItems(inputs: StartValveFaultInputs): { show: boolean[]; checked: boolean[] } {
  return {
    show: [
      true,
      inputs.onGround && inputs.manualStartPbOn,
      inputs.onGround,
      !inputs.onGround,
      !inputs.onGround,
      !inputs.onGround,
    ],
    checked: [false, !inputs.manualStartPbOn, !inputs.masterOn, false, false, false],
  };
}
