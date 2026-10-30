// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { FailuresConsumer, RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { FuelOverflowDetectionReader } from './FuelOverflow';

/** The refuel (flyPad, refuel panel, OIS REFUEL, GSX): the systems a380 FQMS refuels while it is set */
export const REFUEL_STARTED_VAR = 'L:A32NX_REFUEL_STARTED_BY_USR';
/** A failure prevents the start or the completion of the refuel (FUEL REFUEL FAULT) */
export const REFUEL_FAULT_VAR = 'L:A380X_FUEL_REFUEL_FAULT';
/** A refuel isolation valve is failed (FUEL REFUEL / DEFUEL SYS FAULT) */
export const REFUEL_L_ISOL_VALVE_FAULT_VAR = 'L:A380X_FUEL_REFUEL_L_ISOL_VALVE_FAULT';
export const REFUEL_R_ISOL_VALVE_FAULT_VAR = 'L:A380X_FUEL_REFUEL_R_ISOL_VALVE_FAULT';

/** What the refuel fault logic reads on one update */
export interface RefuelFaultInputs {
  /** The refuel system failure is active */
  refuelSystemFailed: boolean;
  /** A refuel is requested */
  refuelRequested: boolean;
  /** The FQMS detects an overflow (CpiomF/FuelOverflow) */
  overflowDetected: boolean;
}

export interface RefuelFaultOutputs {
  /** The FQMS stops the refuel */
  stopRefuel: boolean;
  /** FUEL REFUEL FAULT */
  refuelFault: boolean;
}

/**
 * The refuel faults of the FQMS:
 * - A failed refuel system cannot start or complete a refuel: the refuel stops at once.
 * - An overflow stops the refuel in progress, which then cannot restart until the overflow is gone.
 * FUEL REFUEL FAULT shows while the refuel system is failed, or after an overflow stopped a refuel until the overflow is
 * gone.
 */
export class RefuelFaultLogic {
  private stoppedByOverflow = false;

  public update(inputs: RefuelFaultInputs): RefuelFaultOutputs {
    if (!inputs.overflowDetected) {
      this.stoppedByOverflow = false;
    } else if (inputs.refuelRequested) {
      this.stoppedByOverflow = true;
    }
    return {
      stopRefuel: inputs.refuelRequested && (inputs.refuelSystemFailed || inputs.overflowDetected),
      refuelFault: inputs.refuelSystemFailed || this.stoppedByOverflow,
    };
  }
}

/**
 * The refuel system failures: the refuel system failure and the overflows stop the refuel (FUEL REFUEL FAULT); a failed
 * refuel isolation valve only gives FUEL REFUEL / DEFUEL SYS FAULT, as it has no effect on the fuel system in flight.
 */
export class FuelRefuelFaults implements Instrument {
  private readonly logic = new RefuelFaultLogic();

  private readonly overflowDetection = new FuelOverflowDetectionReader();

  private readonly refuelStarted = RegisteredSimVar.createBoolean(REFUEL_STARTED_VAR);

  private readonly refuelFaultOutput = RegisteredSimVar.createBoolean(REFUEL_FAULT_VAR);

  private readonly leftIsolationValveFaultOutput = RegisteredSimVar.createBoolean(REFUEL_L_ISOL_VALVE_FAULT_VAR);

  private readonly rightIsolationValveFaultOutput = RegisteredSimVar.createBoolean(REFUEL_R_ISOL_VALVE_FAULT_VAR);

  constructor(private readonly failures: Pick<FailuresConsumer, 'isActive'>) {}

  public init(): void {
    // nothing to initialise
  }

  public onUpdate(): void {
    const outputs = this.logic.update({
      refuelSystemFailed: this.failures.isActive(A380Failure.FuelRefuelSystem),
      refuelRequested: this.refuelStarted.get(),
      overflowDetected: this.overflowDetection.isOverflowDetected(),
    });
    if (outputs.stopRefuel) {
      this.refuelStarted.set(false);
    }
    this.refuelFaultOutput.set(outputs.refuelFault);
    this.leftIsolationValveFaultOutput.set(this.failures.isActive(A380Failure.FuelRefuelLeftIsolationValve));
    this.rightIsolationValveFaultOutput.set(this.failures.isActive(A380Failure.FuelRefuelRightIsolationValve));
  }
}
