// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Fuel transfer memos of the A380X FWS: FWD XFR IN PROGRESS (a transfer from the trim tank is in progress), OUTR TK XFR
 * IN PROG (a transfer from the outer tanks is in progress), OUTR TKs XFRD (all the outer tank fuel has been
 * transferred), TRIM TK XFRD (all the trim tank fuel has been transferred).
 * The transfers are made by the fuel model (CpiomF/LegacyFuel.ts) with MSFS fuel system triggers, which tell no
 * transfer state to the FWS. The engines never burn from the outer or the trim tank, so their fuel leaving them is a
 * transfer: the FWS watches the tank weights. GND XFR IN PROGRESS follows the automatic ground transfer of the FQMS
 * (CpiomF/FuelGroundTransfer); the fuel then leaves the trim tank or the wing tanks for the ground transfer, not for a
 * FWD XFR or an OUTR TK XFR. Not simulated: COLDFUEL OUTR TK XFR (no fuel temperature model).
 */

/** Design choice: the tank weight is compared over 10 s windows */
const FUEL_XFR_DETECTION_WINDOW_S = 10;

/**
 * Design choice: more than 5 kg out of the tank over one window is a transfer (sensor noise and rounding stay below)
 */
const FUEL_XFR_MIN_OUTFLOW_KG = 5;

/** Design choice: a tank holding less than 1 kg is empty (the fuel model leaves a few grams in an emptied tank) */
const FUEL_TANK_EMPTY_KG = 1;

/** Watches the weight of one tank group and tells whether fuel flows out of it (a transfer in progress). */
export class TankOutflowMonitor {
  private referenceKg: number | null = null;

  private elapsedS = 0;

  private outflow = false;

  /**
   * @param tankKg the weight of the tank group now, in kg
   * @param deltaTimeS the time since the last update, in seconds
   * @returns whether fuel flowed out of the tanks over the last complete window
   */
  public update(tankKg: number, deltaTimeS: number): boolean {
    if (this.referenceKg === null) {
      this.referenceKg = tankKg;
      return this.outflow;
    }
    this.elapsedS += deltaTimeS;
    if (this.elapsedS >= FUEL_XFR_DETECTION_WINDOW_S) {
      this.outflow = this.referenceKg - tankKg > FUEL_XFR_MIN_OUTFLOW_KG;
      this.referenceKg = tankKg;
      this.elapsedS = 0;
    }
    return this.outflow;
  }
}

export interface FuelTransferMemoInputs {
  /** Fuel flows out of the trim tank (TankOutflowMonitor) */
  readonly trimTankOutflow: boolean;
  /** Fuel flows out of the outer tanks (TankOutflowMonitor) */
  readonly outerTanksOutflow: boolean;
  /** Weight of the trim tank, kg */
  readonly trimTankKg: number;
  /** Weight of both outer tanks, kg */
  readonly outerTanksKg: number;
  /** Fuel jettison in progress: its own memo (JETTISON IN PROGRESS) */
  readonly jettisonInProgress: boolean;
  /** Refuel or defuel in progress, or the refuel panel open: their own memos */
  readonly fuelingInProgress: boolean;
  /** The automatic ground transfer is in progress (L:A380X_FUEL_AUTO_GND_XFR_IN_PROGRESS): its own memo */
  readonly groundTransferInProgress: boolean;
}

export interface FuelTransferMemos {
  /** FWD XFR IN PROGRESS (280000004) */
  readonly fwdXfrInProgress: boolean;
  /** OUTR TK XFR IN PROG (280000007) */
  readonly outerTankXfrInProgress: boolean;
  /** OUTR TKs XFRD (280000008), shown in flight phase 8 only */
  readonly outerTanksXfrd: boolean;
  /** TRIM TK XFRD (280000012), shown in flight phase 8 only */
  readonly trimTankXfrd: boolean;
  /** GND XFR IN PROGRESS (280000005) */
  readonly gndXfrInProgress: boolean;
}

/**
 * @param inputs the tank states
 * @returns the five fuel transfer memo conditions (before their flight phase inhibition)
 */
export function fuelTransferMemos(inputs: FuelTransferMemoInputs): FuelTransferMemos {
  const transferAllowed = !inputs.jettisonInProgress && !inputs.fuelingInProgress && !inputs.groundTransferInProgress;
  return {
    fwdXfrInProgress: transferAllowed && inputs.trimTankOutflow,
    outerTankXfrInProgress: transferAllowed && inputs.outerTanksOutflow,
    outerTanksXfrd: inputs.outerTanksKg < FUEL_TANK_EMPTY_KG,
    trimTankXfrd: inputs.trimTankKg < FUEL_TANK_EMPTY_KG,
    gndXfrInProgress: inputs.groundTransferInProgress && !inputs.jettisonInProgress && !inputs.fuelingInProgress,
  };
}
