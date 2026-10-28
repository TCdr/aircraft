// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer, NXLogicConfirmNode } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, awarenessItem, cautionItem, readBool } from './FwcAlertItem';

/*
 * FUEL cautions of the fuel system faults, with their inhibited flight phases:
 * - FUEL APU LP VALVE FAULT: the valve position disagrees with the selected position. Crew awareness. Phases 3, 4, 5,
 *   7, 8. From the systems WASM (fuel/apu_lp_valve.rs, L:A32NX_FUEL_APU_LP_VALVE_FAULT).
 * - FUEL F. USED/FOB DISAGREE: the initial FOB differs significantly from the actual FOB + fuel used. Line: FUEL LEAK
 *   PROC ... APPLY. Shown in phase 6 only.
 * - FUEL L (R) OUTER XFR CLOSED and OPEN, from the systems host (Fuel/FuelLevelSensing). Phases 3, 4, 5, 7, 8.
 * - FUEL L (R) WING TK OVERFLOW, jet pump variant, from the systems host (Fuel/FuelLevelSensing). Phases 3, 4, 5, 7, 8.
 * - FUEL LO LVL DET FAULT: both low level sensors are failed. Maintenance action, crew awareness. Phases 3, 4, 5, 7, 8,
 *   9.
 * - FUEL INERTING SYS FAULT: the fuel tank inerting system is failed. Crew awareness, STATUS INOP SYS FUEL INERT. Its
 *   failure is the TS only flyPad failure "Fuel tank inerting system" (28030): the system has no model, it works from
 *   the engine start to their stop, so the alert needs an engine running (design choice, the same phases as the other
 *   FUEL awareness alerts).
 */

export const FuelSystemFaultKeys = {
  apuLpValveFault: '2800234',
  fuelUsedFobDisagree: '2800235',
  outerXfrClosed: ['2800236', '2800237'],
  outerXfrOpen: ['2800238', '2800239'],
  wingTankOverflow: ['2800240', '2800241'],
  lowLevelDetectionFault: '2800242',
  inertingSystemFault: '2800270',
} as const;

export const FUEL_SYSTEM_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/** F. USED/FOB DISAGREE: phase 6 only */
export const FUEL_USED_FOB_DISAGREE_PHASE_INHIBITION = [1, 2, 3, 4, 5, 7, 8, 9, 10];

/** LO LVL DET FAULT: phases 3, 4, 5, 7, 8 and 9 */
export const LOW_LEVEL_DETECTION_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8, 9];

/**
 * Design choice (the aircraft documentation says "significant", with no value): FOB + fuel used is lower than the
 * initial FOB by more than this, in kg. It is the 1 500 kg of the SD fuel imbalance advisory, far above what the
 * APU burns in flight without being counted in the fuel used (about 120 kg/h).
 */
const FUEL_USED_FOB_DISAGREE_KG = 1_500;

/** Design choice: the disagreement must last this long, in seconds (the fuel quantity indications move in turns) */
export const FUEL_USED_FOB_DISAGREE_CONFIRM_S = 60;

/** The STATUS codes (StatusMessages) of these alerts */
const FUEL_SYSTEM_FAULT_STATUS = {
  /** INERTING SYS FAULT: INOP SYS FUEL INERT */
  fuelInert: '280300013',
  /** OUTER XFR CLOSED: L (R) OUTER TK UNUSABLE */
  outerTankUnusable: ['280200004', '280200005'],
  /** OUTER XFR OPEN: INOP SYS L (R) CELL VALVE */
  cellValve: ['280300011', '280300012'],
  /** WING TK OVERFLOW: INOP SYS CTR TK L (R) XFR */
  centreTankTransfer: ['280300008', '280300009'],
} as const;

/** The state of the pb-sw of one wing in the WING TK OVERFLOW procedure */
export interface WingOverflowProcedureInputs {
  /** The CTR TK L (R) XFR pb-sw is ON */
  ctrTkXfrOn: boolean;
  crossFeedOn: boolean;
  /** The L (R) TK PUMP 1 and 2 pb-sw are ON */
  pump1On: boolean;
  pump2On: boolean;
  centreTankEmpty: boolean;
}

/**
 * The lines of FUEL L (R) WING TK OVERFLOW, jet pump variant: 0 title, 1 -CTR TK XFR OFF, 2 .IF
 * UNSUCCESSFUL:, 3 -FUEL X FEED ON, 4 -TK PUMP 1 OFF, 5 -TK PUMP 2 OFF, 6 .WHEN CTR TK EMPTY:, 7 -TK PUMP 1 ON, 8 -TK
 * PUMP 2 ON, 9 -FUEL X FEED OFF. The IF UNSUCCESSFUL part (only with fuel in the centre tank) is shown once
 * the CTR TK XFR pb-sw is OFF and the overflow goes on with fuel in the centre tank; an action line goes once it is done.
 */
export function wingOverflowLines(inputs: WingOverflowProcedureInputs): (number | null)[] {
  const { ctrTkXfrOn, crossFeedOn, pump1On, pump2On, centreTankEmpty } = inputs;
  if (ctrTkXfrOn) {
    return [0, 1];
  }
  if (!centreTankEmpty) {
    return [0, 2, crossFeedOn ? null : 3, pump1On ? 4 : null, pump2On ? 5 : null, 6, 7, 8, 9];
  }
  return [0, 6, pump1On ? null : 7, pump2On ? null : 8, crossFeedOn ? 9 : null];
}

export interface FuelSystemFaultInputs {
  apuLpValveFault: boolean;
  /** The fuel on board, kg */
  fobKg: number;
  /** The fuel used by both engines, kg (the counters restart at each engine start on the ground) */
  fuelUsedKg: number;
  onGround: boolean;
  /** Per wing L, R: the confirmed disagreements and overflows of the systems host (Fuel/FuelLevelSensing) */
  outerXfrClosed: readonly [boolean, boolean];
  outerXfrOpen: readonly [boolean, boolean];
  wingTankOverflow: readonly [boolean, boolean];
  lowLevelSensorFault: readonly [boolean, boolean];
  /** At least one engine is running: the fuel tank inerting system works from the engine start to their stop */
  anyEngineRunning: boolean;
  /** Per wing L, R: the cockpit state the WING TK OVERFLOW lines depend on */
  overflowProcedure: readonly [WingOverflowProcedureInputs, WingOverflowProcedureInputs];
}

/**
 * The initial FOB of F. USED/FOB DISAGREE, the FOB at engine start of the FUEL LEAK procedure (a leak shows as FOB +
 * fuel used significantly below the FOB at engine start): on the ground it follows the FOB + fuel used (refuelling;
 * the fuel used restarts at each engine start on the ground, so it is the FOB at engine start), in flight it is kept.
 * Design choice: fuel added in flight (the flyPad) raises it, as it is no leak.
 */
export function nextInitialFob(
  initialFobKg: number | null,
  fobKg: number,
  fuelUsedKg: number,
  onGround: boolean,
): number {
  const fobPlusFuelUsed = fobKg + fuelUsedKg;
  if (onGround || initialFobKg === null) {
    return fobPlusFuelUsed;
  }
  return Math.max(initialFobKg, fobPlusFuelUsed);
}

/** The disagreement of F. USED/FOB DISAGREE, before its confirmation */
export function isFuelUsedFobDisagree(initialFobKg: number, fobKg: number, fuelUsedKg: number): boolean {
  return initialFobKg - (fobKg + fuelUsedKg) > FUEL_USED_FOB_DISAGREE_KG;
}

/** The part of the failures consumer the inerting alert uses */
export type FuelSystemFaultFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

export class FuelSystemFaultAlerts {
  private inputs: FuelSystemFaultInputs | null = null;

  private initialFobKg: number | null = null;

  private readonly disagreeConfirm = new NXLogicConfirmNode(FUEL_USED_FOB_DISAGREE_CONFIRM_S, true);

  private readonly apuLpValveFault = Subject.create(false);

  private readonly fuelUsedFobDisagree = Subject.create(false);

  private readonly outerXfrClosed = [Subject.create(false), Subject.create(false)];

  private readonly outerXfrOpen = [Subject.create(false), Subject.create(false)];

  private readonly wingTankOverflow = [Subject.create(false), Subject.create(false)];

  private readonly lowLevelDetectionFault = Subject.create(false);

  private readonly inertingSystemFault = Subject.create(false);

  /** @param failuresConsumer the failures consumer (a test double in the specs) */
  constructor(private readonly failuresConsumer: FuelSystemFaultFailuresSource = new FailuresConsumer()) {
    for (const side of [0, 1]) {
      const closedKey = FuelSystemFaultKeys.outerXfrClosed[side];
      this.ewdFailures[closedKey] = cautionItem(
        closedKey,
        2,
        this.outerXfrClosed[side],
        FUEL_SYSTEM_FAULT_PHASE_INHIBITION,
        () => [0, 1],
        EcamSysPage.FUEL,
        (): StatusLines => ({ left: [FUEL_SYSTEM_FAULT_STATUS.outerTankUnusable[side]], inopSys: [] }),
      );
      const openKey = FuelSystemFaultKeys.outerXfrOpen[side];
      this.ewdFailures[openKey] = cautionItem(
        openKey,
        1,
        this.outerXfrOpen[side],
        FUEL_SYSTEM_FAULT_PHASE_INHIBITION,
        () => [0],
        EcamSysPage.FUEL,
        (): StatusLines => ({ left: [], inopSys: [FUEL_SYSTEM_FAULT_STATUS.cellValve[side]] }),
      );
      const overflowKey = FuelSystemFaultKeys.wingTankOverflow[side];
      this.ewdFailures[overflowKey] = cautionItem(
        overflowKey,
        10,
        this.wingTankOverflow[side],
        FUEL_SYSTEM_FAULT_PHASE_INHIBITION,
        () => (this.inputs ? wingOverflowLines(this.inputs.overflowProcedure[side]) : [0]),
        EcamSysPage.FUEL,
        (): StatusLines => ({ left: [], inopSys: [FUEL_SYSTEM_FAULT_STATUS.centreTankTransfer[side]] }),
      );
    }
  }

  /** Registers the failure of the inerting system, called once by the PseudoFWC init */
  init(): void {
    this.failuresConsumer.register(A320Failure.FuelTankInertingSystem);
  }

  /**
   * @param inputs the systems and cockpit state
   * @param deltaTime the time since the last update, in milliseconds
   */
  update(inputs: FuelSystemFaultInputs, deltaTime: number): void {
    this.inputs = inputs;
    this.apuLpValveFault.set(inputs.apuLpValveFault);

    this.initialFobKg = nextInitialFob(this.initialFobKg, inputs.fobKg, inputs.fuelUsedKg, inputs.onGround);
    this.fuelUsedFobDisagree.set(
      this.disagreeConfirm.write(isFuelUsedFobDisagree(this.initialFobKg, inputs.fobKg, inputs.fuelUsedKg), deltaTime),
    );

    for (const side of [0, 1]) {
      this.outerXfrClosed[side].set(inputs.outerXfrClosed[side]);
      this.outerXfrOpen[side].set(inputs.outerXfrOpen[side]);
      this.wingTankOverflow[side].set(inputs.wingTankOverflow[side]);
    }
    this.lowLevelDetectionFault.set(inputs.lowLevelSensorFault[0] && inputs.lowLevelSensorFault[1]);
    this.failuresConsumer.update();
    this.inertingSystemFault.set(
      inputs.anyEngineRunning && this.failuresConsumer.isActive(A320Failure.FuelTankInertingSystem),
    );
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [FuelSystemFaultKeys.apuLpValveFault]: cautionItem(
      FuelSystemFaultKeys.apuLpValveFault,
      1,
      this.apuLpValveFault,
      FUEL_SYSTEM_FAULT_PHASE_INHIBITION,
      () => [0],
      EcamSysPage.FUEL,
    ),
    [FuelSystemFaultKeys.fuelUsedFobDisagree]: cautionItem(
      FuelSystemFaultKeys.fuelUsedFobDisagree,
      2,
      this.fuelUsedFobDisagree,
      FUEL_USED_FOB_DISAGREE_PHASE_INHIBITION,
      () => [0, 1],
      EcamSysPage.FUEL,
    ),
    [FuelSystemFaultKeys.lowLevelDetectionFault]: cautionItem(
      FuelSystemFaultKeys.lowLevelDetectionFault,
      1,
      this.lowLevelDetectionFault,
      LOW_LEVEL_DETECTION_FAULT_PHASE_INHIBITION,
      () => [0],
      EcamSysPage.FUEL,
    ),
    [FuelSystemFaultKeys.inertingSystemFault]: awarenessItem(
      FuelSystemFaultKeys.inertingSystemFault,
      1,
      this.inertingSystemFault,
      FUEL_SYSTEM_FAULT_PHASE_INHIBITION,
      () => [0],
      () => ({ left: [], inopSys: [FUEL_SYSTEM_FAULT_STATUS.fuelInert] }),
    ),
  };
}

/* Acquisition (not unit tested: SimVar reads only) */

/**
 * Reads the inputs of the fuel system faults from the simvars.
 * @param onGround the aircraft is on the ground
 * @param overflowProcedure per wing L, R: the cockpit state of the WING TK OVERFLOW procedure
 */
export function readFuelSystemFaultInputs(
  onGround: boolean,
  overflowProcedure: [WingOverflowProcedureInputs, WingOverflowProcedureInputs],
): FuelSystemFaultInputs {
  const bySide = (name: (side: string) => string): [boolean, boolean] => [readBool(name('L')), readBool(name('R'))];
  return {
    apuLpValveFault: readBool('L:A32NX_FUEL_APU_LP_VALVE_FAULT'),
    fobKg: SimVar.GetSimVarValue('L:A32NX_TOTAL_FUEL_QUANTITY', 'number'),
    fuelUsedKg:
      SimVar.GetSimVarValue('L:A32NX_FUEL_USED:1', 'number') + SimVar.GetSimVarValue('L:A32NX_FUEL_USED:2', 'number'),
    onGround,
    outerXfrClosed: bySide((side) => `L:A32NX_FUEL_${side}_OUTER_XFR_CLOSED`),
    outerXfrOpen: bySide((side) => `L:A32NX_FUEL_${side}_OUTER_XFR_OPEN`),
    wingTankOverflow: bySide((side) => `L:A32NX_FUEL_${side}_WING_TK_OVERFLOW`),
    lowLevelSensorFault: bySide((side) => `L:A32NX_FUEL_${side}_WING_TK_LO_LVL_SENSOR_FAULT`),
    anyEngineRunning: [1, 2].some((engine) => SimVar.GetSimVarValue(`L:A32NX_ENGINE_STATE:${engine}`, 'enum') === 1),
    overflowProcedure,
  };
}
