// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380Failure } from '@failures';
import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import {
  FEED_TANK_NAMES,
  FUEL_FQI_LOST_TANKS_VAR,
  FUEL_QUANTITY_SYSTEM_FAULTS_VAR,
  fuelQuantitySystemFaults,
  isFqmsMonitoringLost,
  isTankBitSet,
} from '@shared/FuelQuantityMeasurement';
import type { FailureStates } from './FuelPumpsAndValves';
import { FUEL_XFR_PB_IS_AUTO_VARS } from './FuelManualTransfer';
import { EMER_OUTR_TK_XFR_PB_IS_ON_VAR } from './FuelEmerOuterTransfer';
import { L_WING_TK_OVERFLOW_VAR, R_WING_TK_OVERFLOW_VAR } from './FuelOverflow';

/** The FQMS makes no more automatic transfers, the flight crew transfers manually (FUEL MAN XFR PROCEDURE) */
const FUEL_XFR_MAN_ONLY_VAR = 'L:A380X_FUEL_XFR_MAN_ONLY';

/** What the transfer failures leave of the automatic and manual fuel transfers */
export interface FuelTransferRestrictions {
  /** The flight crew must transfer manually (FUEL MAN XFR PROCEDURE, FUEL XFR : MAN ONLY) */
  manualTransferRequired: boolean;
  /** The FQMS no longer makes automatic transfers; the manual transfers that are still possible work */
  automaticTransfersLost: boolean;
  /** The CG control transfers are inhibited: a transfer gallery is not usable */
  cgTransfersInhibited: boolean;
  /** No pumped transfer out of the outer tanks: the forward gallery is not usable; the outer tanks go by gravity */
  outerPumpedTransferLost: boolean;
  /** Neither gallery is usable: no transfer out of the inner, mid and trim tanks, automatic or manual */
  innerMidTrimTransfersLost: boolean;
  /** No automatic transfer out of the trim tank (damaged trim line, or its isolation valve closed) */
  trimTankAutomaticTransfersInhibited: boolean;
  /** The trim tank isolation valve stays closed: no pumped transfer out of the trim tank, only by gravity */
  trimTankIsolationValveClosed: boolean;
}

export const NO_TRANSFER_RESTRICTION: Readonly<FuelTransferRestrictions> = {
  manualTransferRequired: false,
  automaticTransfersLost: false,
  cgTransfersInhibited: false,
  outerPumpedTransferLost: false,
  innerMidTrimTransfersLost: false,
  trimTankAutomaticTransfersInhibited: false,
  trimTankIsolationValveClosed: false,
};

/** What the FQMS monitoring reads */
export interface FuelTransferFaultInputs {
  /** L:A32NX_FUEL_QUANTITY_SYSTEM_FAULTS */
  quantitySystemFaultsWord: number;
  /** L:A32NX_FUEL_FQI_LOST_TANKS */
  fqiLostTanksWord: number;
  onGround: boolean;
  /**
   * An inlet valve of the forward (aft) transfer gallery stuck open, the feed tank 1 fwd (aft) inlet valve in the
   * simulation: that gallery is not usable
   */
  fwdGalleryInletValveOpen: boolean;
  aftGalleryInletValveOpen: boolean;
  trimTankIsolationValveClosed: boolean;
  trimAndApuLineDamaged: boolean;
  /** The FQMS detects a left or right wing tank overflow (CpiomF/FuelOverflow) */
  wingTankOverflow: boolean;
  /** A manual transfer is selected: an OUTR/MID/INR TK XFR pb-sw in MAN, TRIM TK XFR in FWD or EMER OUTR TK XFR ON */
  manualTransferSelected: boolean;
}

/**
 * Whether the FQMS needs the flight crew to transfer manually: it can no longer measure or monitor the fuel quantities
 * (both FQMS, both FQDCs or both AGPs failed), or the quantity of a feed tank is lost, so it cannot know when to
 * transfer.
 */
export function isManualTransferRequired(i: FuelTransferFaultInputs): boolean {
  return (
    isFqmsMonitoringLost(fuelQuantitySystemFaults(i.quantitySystemFaultsWord)) ||
    FEED_TANK_NAMES.some((tank) => isTankBitSet(i.fqiLostTanksWord, tank))
  );
}

/**
 * The fuel transfer restrictions of the transfer failures:
 * - Manual transfer required (isManualTransferRequired): the automatic transfers stop. Once that happened in flight,
 *   they stay stopped for the rest of the flight, even if the failures clear. Design choice: on ground they come back
 *   with the failures cleared.
 * - One transfer gallery not usable (an inlet valve stuck open): the CG control transfers are inhibited, the other
 *   transfers go through the other gallery. With the forward gallery, the outer tanks go by gravity
 *   (CpiomF/FuelAlternateTransfers). Design choice: the main transfers from the inner and mid tanks stay on the
 *   simulated lines, which lead to the same feed tanks.
 * - Both galleries not usable: the alternate transfers cannot solve it (FUEL NORM + ALTN XFR FAULT); the inner, mid
 *   and trim tanks cannot be transferred, the outer tanks only go by gravity, and the automatic transfers stop.
 * - The trim tank isolation valve stuck closed, or the trim and APU lines damaged: no automatic transfer out of the
 *   trim tank. With the valve closed, the trim tank fuel only goes by gravity (TRIM TK FEED OPEN).
 * - A wing tank overflow while no manual transfer was selected: an automatic transfer overflowed the tank, so the
 *   transfers become manual (FUEL WING TK OVERFLOW: FUEL XFR : MAN ONLY, then FUEL MAN XFR PROCEDURE). With a manual
 *   transfer selected when the overflow started, the crew sets the transfers back to AUTO instead.
 */
export class FuelTransferFaultMonitor {
  private manualTransferLatched = false;

  private wingTankOverflow = false;

  private manualTransferAtWingTankOverflow = false;

  public update(i: FuelTransferFaultInputs): FuelTransferRestrictions {
    if (i.wingTankOverflow && !this.wingTankOverflow) {
      this.manualTransferAtWingTankOverflow = i.manualTransferSelected;
    }
    this.wingTankOverflow = i.wingTankOverflow;
    const required = isManualTransferRequired(i) || (i.wingTankOverflow && !this.manualTransferAtWingTankOverflow);
    if (required && !i.onGround) {
      this.manualTransferLatched = true;
    } else if (i.onGround && !required) {
      this.manualTransferLatched = false;
    }
    const manualTransferRequired = required || this.manualTransferLatched;
    const bothGalleriesLost = i.fwdGalleryInletValveOpen && i.aftGalleryInletValveOpen;
    return {
      manualTransferRequired,
      automaticTransfersLost: manualTransferRequired || bothGalleriesLost,
      cgTransfersInhibited: i.fwdGalleryInletValveOpen || i.aftGalleryInletValveOpen,
      outerPumpedTransferLost: i.fwdGalleryInletValveOpen,
      innerMidTrimTransfersLost: bothGalleriesLost,
      trimTankAutomaticTransfersInhibited: i.trimTankIsolationValveClosed || i.trimAndApuLineDamaged,
      trimTankIsolationValveClosed: i.trimTankIsolationValveClosed,
    };
  }
}

/** The fuel transfer restrictions of the FQMS simulation, for CpiomF/LegacyFuel and CpiomF/FuelAutomaticTransfers */
export interface FuelTransferRestrictionSource {
  readonly restrictions: Readonly<FuelTransferRestrictions>;
}

/** Reads the transfer failures every update and writes FUEL_XFR_MAN_ONLY_VAR for the FWS */
export class FuelTransferFaults implements Instrument, FuelTransferRestrictionSource {
  private readonly monitor = new FuelTransferFaultMonitor();

  public restrictions: Readonly<FuelTransferRestrictions> = NO_TRANSFER_RESTRICTION;

  private readonly quantitySystemFaultsWord = RegisteredSimVar.create(
    FUEL_QUANTITY_SYSTEM_FAULTS_VAR,
    SimVarValueType.Number,
  );

  private readonly fqiLostTanksWord = RegisteredSimVar.create(FUEL_FQI_LOST_TANKS_VAR, SimVarValueType.Number);

  private readonly onGround = RegisteredSimVar.createBoolean('SIM ON GROUND');

  private readonly wingTankOverflows = [L_WING_TK_OVERFLOW_VAR, R_WING_TK_OVERFLOW_VAR].map((overflowVar) =>
    RegisteredSimVar.createBoolean(overflowVar),
  );

  private readonly transferPbsAuto = FUEL_XFR_PB_IS_AUTO_VARS.map((pbVar) => RegisteredSimVar.createBoolean(pbVar));

  private readonly emerOuterTransferPbOn = RegisteredSimVar.createBoolean(EMER_OUTR_TK_XFR_PB_IS_ON_VAR);

  private readonly manualOnlyOutput = RegisteredSimVar.createBoolean(FUEL_XFR_MAN_ONLY_VAR);

  /** Refilled at each update, to avoid a new object */
  private readonly monitorInputs: FuelTransferFaultInputs = {
    quantitySystemFaultsWord: 0,
    fqiLostTanksWord: 0,
    onGround: false,
    fwdGalleryInletValveOpen: false,
    aftGalleryInletValveOpen: false,
    trimTankIsolationValveClosed: false,
    trimAndApuLineDamaged: false,
    wingTankOverflow: false,
    manualTransferSelected: false,
  };

  constructor(private readonly failures: FailureStates) {}

  public init(): void {
    // nothing to initialise: no restriction until the first update
  }

  public onUpdate(): void {
    const inputs = this.monitorInputs;
    inputs.quantitySystemFaultsWord = this.quantitySystemFaultsWord.get();
    inputs.fqiLostTanksWord = this.fqiLostTanksWord.get();
    inputs.onGround = this.onGround.get();
    inputs.fwdGalleryInletValveOpen = this.failures.isActive(A380Failure.FuelFeedTank1FwdInletValveOpen);
    inputs.aftGalleryInletValveOpen = this.failures.isActive(A380Failure.FuelFeedTank1AftInletValveOpen);
    inputs.trimTankIsolationValveClosed = this.failures.isActive(A380Failure.FuelTrimTankIsolationValveClosed);
    inputs.trimAndApuLineDamaged = this.failures.isActive(A380Failure.FuelTrimAndApuLineDamaged);
    inputs.wingTankOverflow = false;
    for (const overflow of this.wingTankOverflows) {
      if (overflow.get()) {
        inputs.wingTankOverflow = true;
        break;
      }
    }
    inputs.manualTransferSelected = false;
    for (const pbAuto of this.transferPbsAuto) {
      if (!pbAuto.get()) {
        inputs.manualTransferSelected = true;
        break;
      }
    }
    inputs.manualTransferSelected = inputs.manualTransferSelected || this.emerOuterTransferPbOn.get();
    this.restrictions = this.monitor.update(inputs);
    this.manualOnlyOutput.set(this.restrictions.manualTransferRequired);
  }
}
