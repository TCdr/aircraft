// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, cautionItem, readBool } from './FwcAlertItem';

/*
 * The centre tank transfer cautions of the jet pump fuel system (the FBW A32NX one, see Fuel/FuelPumpsAndValves):
 * FUEL AUTO TRANSFER FAULT and FUEL CTR TK XFR OFF.
 */

export const FuelTransferAlertKeys = {
  autoTransferFault: '2800218',
  centreTankTransferOff: '2800217',
} as const;

/** AUTO TRANSFER FAULT flight phase inhibition: shown in phases 1, 6, 9 and 10 */
export const AUTO_TRANSFER_FAULT_PHASE_INHIBITION = [2, 3, 4, 5, 7, 8];

/** CTR TK XFR OFF flight phase inhibition: shown in phases 2 and 6 only */
export const CTR_TK_XFR_OFF_PHASE_INHIBITION = [1, 3, 4, 5, 7, 8, 9, 10];

/** AUTO TRANSFER FAULT: more than 250 kg in the centre tank and less than 5 000 kg in the left or right wing tanks */
const AUTO_TRANSFER_FAULT_CENTRE_TANK_MIN_KG = 250;
const AUTO_TRANSFER_FAULT_WING_TANKS_MAX_KG = 5000;

export interface FuelTransferInputs {
  /** The FUEL MODE SEL pb is at MAN */
  readonly modeSelMan: boolean;
  /** The CTR TK L (R) XFR pb-sw is ON */
  readonly centreLeftTransferOn: boolean;
  readonly centreRightTransferOn: boolean;
  /** The fuel in the centre tank, kg */
  readonly centreTankKg: number;
  /** The fuel in the left (right) wing tanks, inner and outer, kg */
  readonly leftWingTanksKg: number;
  readonly rightWingTanksKg: number;
}

/**
 * FUEL AUTO TRANSFER FAULT. With the transfer working, the FLSCU opens the transfer valves as soon as the inner tank
 * is not full, so that the wing tanks stay full while the centre tank has fuel.
 */
export function isAutoTransferFault(inputs: FuelTransferInputs): boolean {
  return (
    inputs.centreTankKg > AUTO_TRANSFER_FAULT_CENTRE_TANK_MIN_KG &&
    (inputs.leftWingTanksKg < AUTO_TRANSFER_FAULT_WING_TANKS_MAX_KG ||
      inputs.rightWingTanksKg < AUTO_TRANSFER_FAULT_WING_TANKS_MAX_KG)
  );
}

/**
 * The lines of FUEL AUTO TRANSFER FAULT: 0 title, 1 -FUEL MODE SEL MAN, 2 -CTR TK L XFR ON, 3 -CTR TK
 * R XFR ON. A done action line is hidden.
 */
function autoTransferFaultLines(inputs: FuelTransferInputs): (number | null)[] {
  return [
    0,
    inputs.modeSelMan ? null : 1,
    inputs.centreLeftTransferOn ? null : 2,
    inputs.centreRightTransferOn ? null : 3,
  ];
}

/** FUEL AUTO TRANSFER FAULT STATUS: CTR TK FEED: MAN ONLY */
function autoTransferFaultStatus(): StatusLines {
  return { left: ['280200003'], inopSys: [] };
}

/**
 * FUEL CTR TK XFR OFF: both CTR TK L XFR and CTR TK R XFR pb-sw are OFF with the system in automatic mode. Lines:
 * 0 title, 1 -CTR TK L XFR ON, 2 -CTR TK R XFR ON.
 */
export function isCentreTankTransferOff(inputs: FuelTransferInputs): boolean {
  return !inputs.modeSelMan && !inputs.centreLeftTransferOn && !inputs.centreRightTransferOn;
}

export class FuelTransferAlerts {
  private inputs: FuelTransferInputs = {
    modeSelMan: false,
    centreLeftTransferOn: true,
    centreRightTransferOn: true,
    centreTankKg: 0,
    leftWingTanksKg: 0,
    rightWingTanksKg: 0,
  };

  private readonly autoTransferFault = Subject.create(false);

  private readonly centreTankTransferOff = Subject.create(false);

  update(inputs: FuelTransferInputs): void {
    this.inputs = inputs;
    this.autoTransferFault.set(isAutoTransferFault(inputs));
    this.centreTankTransferOff.set(isCentreTankTransferOff(inputs));
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [FuelTransferAlertKeys.autoTransferFault]: cautionItem(
      FuelTransferAlertKeys.autoTransferFault,
      4,
      this.autoTransferFault,
      AUTO_TRANSFER_FAULT_PHASE_INHIBITION,
      () => autoTransferFaultLines(this.inputs),
      EcamSysPage.FUEL,
      autoTransferFaultStatus,
    ),
    [FuelTransferAlertKeys.centreTankTransferOff]: cautionItem(
      FuelTransferAlertKeys.centreTankTransferOff,
      3,
      this.centreTankTransferOff,
      CTR_TK_XFR_OFF_PHASE_INHIBITION,
      () => [0, 1, 2],
      EcamSysPage.FUEL,
    ),
  };
}

/* Acquisition (not unit tested: SimVar reads only) */

/** Reads the fuel transfer inputs from the simvars */
export function readFuelTransferInputs(modeSelMan: boolean): FuelTransferInputs {
  const kgPerGallon = SimVar.GetSimVarValue('FUEL WEIGHT PER GALLON', 'kilogram');
  const tankKg = (tank: string) => SimVar.GetSimVarValue(`FUEL TANK ${tank} QUANTITY`, 'gallons') * kgPerGallon;
  return {
    modeSelMan,
    centreLeftTransferOn: readBool('L:A32NX_OVHD_FUEL_CTR_TK_L_XFR_PB_IS_ON'),
    centreRightTransferOn: readBool('L:A32NX_OVHD_FUEL_CTR_TK_R_XFR_PB_IS_ON'),
    centreTankKg: tankKg('CENTER'),
    // the inner (MAIN) and outer (AUX) tanks of each wing
    leftWingTanksKg: tankKg('LEFT MAIN') + tankKg('LEFT AUX'),
    rightWingTanksKg: tankKg('RIGHT MAIN') + tankKg('RIGHT AUX'),
  };
}
