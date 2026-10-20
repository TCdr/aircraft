// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, cautionItem, readBool } from './FwcAlertItem';
import { LgciuGearPosition, fromValidLgcius } from './LandingGearAlerts';

/*
 * BRAKES PARK BRK FAULT and L/G GEAR UPLOCK FAULT of the A320 FWC:
 * - PARK BRK FAULT: the parking brake pressure disagrees with the PARKING BRK handle (a320_systems hydraulic brakes,
 *   flyPad parking brake valve jammed failure, L:A32NX_PARK_BRAKE_FAULT). On ground: handle OFF with the pressure
 *   still applied: BRK PRESS STILL APPLIED; handle ON without pressure: BRK PRESS RELEASED, -PARK BRK OFF, .BEFORE ENG
 *   SHUT DOWN: -CHOCKS CONSIDER. Inhibited in phases 3 to 8, no STATUS.
 * - GEAR UPLOCK FAULT: a gear uplock is engaged while that gear is downlocked (the LGCIU proximity sensors, flyPad gear
 *   uplock stuck locked failures). -L/G KEEP DOWN (retracting would damage the uplock), MAX SPEED 280/.67, FUEL
 *   CONSUMPT INCRSD, FMS PRED UNRELIABLE. STATUS: the same limitations, INOP SYS L/G RETRACT. Inhibited in phase 4.
 */

export const BrakeGearFaultKeys = {
  parkBrakeFault: '3200500',
  gearUplockFault: '3200510',
} as const;

const PARK_BRK_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8];

const GEAR_UPLOCK_FAULT_PHASE_INHIBITION = [4];

export interface BrakeGearFaultInputs {
  /** L:A32NX_PARK_BRAKE_FAULT */
  readonly parkBrakeFault: boolean;
  /** L:A32NX_PARK_BRAKE_LEVER_POS */
  readonly parkBrakeHandleOn: boolean;
  readonly lgcius: readonly [LgciuGearPosition, LgciuGearPosition];
}

/**
 * The lines of PARK BRK FAULT: 0 title; handle OFF: 1 BRK PRESS STILL APPLIED; handle ON: 2 BRK PRESS RELEASED,
 * 3 -PARK BRK OFF, 4 .BEFORE ENG SHUT DOWN:, 5 -CHOCKS CONSIDER
 */
function parkBrakeFaultLines(handleOn: boolean): number[] {
  return handleOn ? [0, 2, 3, 4, 5] : [0, 1];
}

/** For each gear (LH, RH, nose) one LGCIU sees: the uplock engaged and the gear downlocked; null without valid words */
function uplockedAndDownlocked(lgciu: LgciuGearPosition): (boolean | null)[] {
  return [0, 1, 2].map((gear) =>
    lgciu.notLockedUp === null || lgciu.downlocked === null ? null : !lgciu.notLockedUp[gear] && lgciu.downlocked[gear],
  );
}

/** GEAR UPLOCK FAULT: a gear is downlocked with its uplock engaged, from the valid LGCIUs */
export function isGearUplockFault(lgcius: readonly [LgciuGearPosition, LgciuGearPosition]): boolean {
  const [lgciu1, lgciu2] = lgcius.map(uplockedAndDownlocked);
  return [0, 1, 2].some((gear) => fromValidLgcius(lgciu1[gear], lgciu2[gear]));
}

/** The STATUS codes of GEAR UPLOCK FAULT (StatusMessages) */
const UPLOCK_STATUS = {
  maxSpeed280: '320400001',
  keepDown: '320400091',
  fuelConsumptionIncreased: '290400018',
  fmsPredictionsUnreliable: '290400019',
  lgRetract: '290300036',
} as const;

function gearUplockFaultStatus(): StatusLines {
  return {
    left: [
      UPLOCK_STATUS.maxSpeed280,
      UPLOCK_STATUS.keepDown,
      UPLOCK_STATUS.fuelConsumptionIncreased,
      UPLOCK_STATUS.fmsPredictionsUnreliable,
    ],
    inopSys: [UPLOCK_STATUS.lgRetract],
  };
}

export class BrakeGearFaultAlerts {
  private parkBrakeHandleOn = true;

  private readonly parkBrakeFault = Subject.create(false);

  private readonly gearUplockFault = Subject.create(false);

  update(inputs: BrakeGearFaultInputs): void {
    this.parkBrakeHandleOn = inputs.parkBrakeHandleOn;
    this.parkBrakeFault.set(inputs.parkBrakeFault);
    this.gearUplockFault.set(isGearUplockFault(inputs.lgcius));
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [BrakeGearFaultKeys.parkBrakeFault]: cautionItem(
      BrakeGearFaultKeys.parkBrakeFault,
      6,
      this.parkBrakeFault,
      PARK_BRK_FAULT_PHASE_INHIBITION,
      () => parkBrakeFaultLines(this.parkBrakeHandleOn),
      EcamSysPage.WHEEL,
    ),
    // 0 title, 1 -L/G KEEP DOWN, 2 MAX SPEED 280/.67, 3 FUEL CONSUMPT INCRSD, 4 FMS PRED UNRELIABLE
    [BrakeGearFaultKeys.gearUplockFault]: cautionItem(
      BrakeGearFaultKeys.gearUplockFault,
      5,
      this.gearUplockFault,
      GEAR_UPLOCK_FAULT_PHASE_INHIBITION,
      () => [0, 1, 2, 3, 4],
      EcamSysPage.WHEEL,
      gearUplockFaultStatus,
    ),
  };
}

/**
 * Reads the parking brake fault of the systems and the handle
 * @param lgcius the LGCIU gear positions the landing gear alerts read
 */
export function readBrakeGearFaultInputs(
  lgcius: readonly [LgciuGearPosition, LgciuGearPosition],
): BrakeGearFaultInputs {
  return {
    parkBrakeFault: readBool('L:A32NX_PARK_BRAKE_FAULT'),
    parkBrakeHandleOn: readBool('L:A32NX_PARK_BRAKE_LEVER_POS'),
    lgcius,
  };
}
