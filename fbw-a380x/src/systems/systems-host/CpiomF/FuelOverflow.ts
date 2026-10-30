// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { FailuresConsumer, RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { GROUND_TRANSFER_RATE_LB_PER_H } from './FuelGroundTransfer';
import {
  LEFT_INNER_TANK,
  LEFT_MID_TANK,
  LEFT_OUTER_TANK,
  RIGHT_INNER_TANK,
  RIGHT_MID_TANK,
  RIGHT_OUTER_TANK,
  TRIM_TANK,
} from './FuelTransferSchedule';

/** A tank whose inlet valve can stick open, and the surge tank it overflows into */
interface OverflowTank {
  failure: number;
  /** The MSFS tank (Tank.N) */
  tank: number;
  /** The MSFS transfer pumps (Pump.N) of this tank: they pump fuel out of it, not into it */
  ownPumps: readonly number[];
  /** The surge tank fuel above which the FQMS detects the overflow, in pounds */
  overflowThresholdLb: number;
  /** The L:var of the overflow detection */
  overflowVar: string;
  /** The L:var of the fuel in the surge tank, in pounds */
  surgeFuelVar: string;
}

/**
 * The wing overflow: more than 1 730 lb in a surge tank. The vent tanks (1 297 lb) are not modelled: the fuel spills
 * from the outer tank into its surge tank.
 */
export const WING_SURGE_TANK_OVERFLOW_LB = 1_730;
/** The trim tank overflow: more than 524 lb in the trim surge tank */
export const TRIM_SURGE_TANK_OVERFLOW_LB = 524;

export const L_WING_TK_OVERFLOW_VAR = 'L:A380X_FUEL_L_WING_TK_OVERFLOW';
export const R_WING_TK_OVERFLOW_VAR = 'L:A380X_FUEL_R_WING_TK_OVERFLOW';
export const TRIM_TK_OVERFLOW_VAR = 'L:A380X_FUEL_TRIM_TK_OVERFLOW';

const OVERFLOW_TANKS: readonly OverflowTank[] = [
  {
    failure: A380Failure.FuelLeftOuterTankInletValveStuckOpen,
    tank: LEFT_OUTER_TANK,
    ownPumps: [9],
    overflowThresholdLb: WING_SURGE_TANK_OVERFLOW_LB,
    overflowVar: L_WING_TK_OVERFLOW_VAR,
    surgeFuelVar: 'L:A380X_FUEL_L_SURGE_TK_FUEL_LB',
  },
  {
    failure: A380Failure.FuelRightOuterTankInletValveStuckOpen,
    tank: RIGHT_OUTER_TANK,
    ownPumps: [14],
    overflowThresholdLb: WING_SURGE_TANK_OVERFLOW_LB,
    overflowVar: R_WING_TK_OVERFLOW_VAR,
    surgeFuelVar: 'L:A380X_FUEL_R_SURGE_TK_FUEL_LB',
  },
  {
    failure: A380Failure.FuelTrimTankInletValveStuckOpen,
    tank: TRIM_TANK,
    ownPumps: [19, 20],
    overflowThresholdLb: TRIM_SURGE_TANK_OVERFLOW_LB,
    overflowVar: TRIM_TK_OVERFLOW_VAR,
    surgeFuelVar: 'L:A380X_FUEL_TRIM_SURGE_TK_FUEL_LB',
  },
];

/** Whether the FQMS has detected an overflow (the automatic ground transfer and the refuel stop), read every update */
export class FuelOverflowDetectionReader {
  private readonly overflowDetected = OVERFLOW_TANKS.map(({ overflowVar }) =>
    RegisteredSimVar.createBoolean(overflowVar),
  );

  public isOverflowDetected(): boolean {
    for (const overflowDetected of this.overflowDetected) {
      if (overflowDetected.get()) {
        return true;
      }
    }
    return false;
  }
}

interface TransferPumpHandle {
  pump: number;
  tank: number;
  active: RegisteredSimVar<boolean>;
}

/** The MSFS transfer pumps (Pump.9-20) and their tanks (Tank.N), flight_model.cfg */
const TRANSFER_PUMP_TANKS: ReadonlyMap<number, number> = new Map([
  [9, LEFT_OUTER_TANK],
  [10, LEFT_MID_TANK],
  [11, LEFT_MID_TANK],
  [12, LEFT_INNER_TANK],
  [13, RIGHT_INNER_TANK],
  [14, RIGHT_OUTER_TANK],
  [15, RIGHT_MID_TANK],
  [16, RIGHT_MID_TANK],
  [17, LEFT_INNER_TANK],
  [18, RIGHT_INNER_TANK],
  [19, TRIM_TANK],
  [20, TRIM_TANK],
]);

/**
 * The flow through a stuck open inlet valve into a full tank, in pounds per hour. Design choice: the flow of one transfer
 * (the trim tank transfer rate), whether it comes from the refuel or from the transfer pumps.
 */
export const OVERFLOW_RATE_LB_PER_H = GROUND_TRANSFER_RATE_LB_PER_H;

/**
 * The fuel that drains back from the surge tank into its tank once the tank has room, in pounds per hour. Design
 * choice: about one tenth of the overflow rate (gravity through the drain check valve).
 */
export const DRAIN_BACK_RATE_LB_PER_H = 4_400;

/**
 * The fuel a surge tank holds before the rest goes overboard through the vent, as a multiple of its overflow threshold.
 * Design choice: the A380 surge tank volumes are not published.
 */
const SURGE_TANK_CAPACITY_FACTOR = 2;

/** What the overflow of one tank reads on one update */
export interface OverflowInputs {
  /** The inlet valve of the tank is stuck open */
  inletValveStuckOpen: boolean;
  /** The tank is full */
  tankFull: boolean;
  /** The room left in the tank, in pounds */
  tankRoomLb: number;
  /** A refuel is in progress: the refuel pushes fuel into the refuel gallery */
  refuelInProgress: boolean;
  /** The transfer pumps of other tanks run: they push fuel into the transfer galleries */
  otherTransferPumpsRunning: boolean;
}

/** What the overflow of one tank does over one update, in pounds */
export interface OverflowResult {
  /** Fuel that spilled from the galleries into the surge tank (or overboard): taken from the pumped tanks */
  spilledFromPumpedTanksLb: number;
  /** Fuel that drained back from the surge tank into the tank */
  drainedBackLb: number;
  /** The FQMS detects the overflow */
  overflowDetected: boolean;
}

/**
 * The surge tank of a tank with an inlet valve stuck open: while fuel is pushed into the galleries (a refuel, or the
 * transfer pumps of other tanks), the valve lets it into the tank even when the tank is full, and the full tank spills
 * into its surge tank. The surge tank fuel drains back into the tank once the tank has room. The FQMS detects the
 * overflow above the surge tank threshold.
 */
export class SurgeTank {
  private fuelLb = 0;

  constructor(private readonly overflowThresholdLb: number) {}

  public get surgeFuelLb(): number {
    return this.fuelLb;
  }

  /**
   * @param inputs what the overflow reads
   * @param deltaTimeS the time of the update, in seconds
   */
  public update(inputs: OverflowInputs, deltaTimeS: number): OverflowResult {
    let spilledFromPumpedTanksLb = 0;
    let drainedBackLb = 0;
    const fuelPushed = inputs.refuelInProgress || inputs.otherTransferPumpsRunning;
    if (inputs.inletValveStuckOpen && inputs.tankFull && fuelPushed) {
      const spilled = (OVERFLOW_RATE_LB_PER_H * deltaTimeS) / 3600;
      this.fuelLb = Math.min(this.fuelLb + spilled, this.overflowThresholdLb * SURGE_TANK_CAPACITY_FACTOR);
      // The refuel brings its own fuel; otherwise the spilled fuel leaves the tanks that the pumps empty
      spilledFromPumpedTanksLb = inputs.refuelInProgress ? 0 : spilled;
    } else if (!inputs.tankFull && this.fuelLb > 0) {
      drainedBackLb = Math.min(this.fuelLb, (DRAIN_BACK_RATE_LB_PER_H * deltaTimeS) / 3600, inputs.tankRoomLb);
      this.fuelLb -= drainedBackLb;
    }
    return {
      spilledFromPumpedTanksLb,
      drainedBackLb,
      overflowDetected: this.fuelLb > this.overflowThresholdLb,
    };
  }
}

/** A tank holding at least its capacity less this, in gallons, is full (as CpiomF/FuelTransferSchedule) */
const TANK_FULL_MARGIN_GAL = 0.5;

/**
 * The overflows of the outer tanks into the wing surge tanks and of the trim tank into its surge tank, after an inlet
 * valve failure (FUEL WING TK OVERFLOW, FUEL TRIM TK OVERFLOW). The spilled fuel leaves the pumped tanks, as
 * CpiomF/FuelLeak takes the leaked fuel. The FQMS then stops the refuel (CpiomF/FuelRefuelFaults) and the automatic
 * ground transfer (CpiomF/FuelGroundTransfer).
 */
export class FuelOverflow implements Instrument {
  /** The fuel moves are written to the tanks at most this often, in milliseconds (as CpiomF/FuelLeak) */
  private static readonly WRITE_PERIOD_MS = 500;

  private readonly surgeTanks = OVERFLOW_TANKS.map(({ overflowThresholdLb }) => new SurgeTank(overflowThresholdLb));

  /** The fuel to add to (or take from) each MSFS tank at the next write, in gallons */
  private readonly pendingGal = new Map<number, number>();

  private timeSinceWriteMs = 0;

  private readonly fuelWeightPerGallon = RegisteredSimVar.create('FUEL WEIGHT PER GALLON', SimVarValueType.Pounds);

  private readonly refuelStartedByUser = RegisteredSimVar.createBoolean('L:A32NX_REFUEL_STARTED_BY_USR');

  private readonly pumps: TransferPumpHandle[] = [];

  private readonly tankHandles = OVERFLOW_TANKS.map(({ tank, overflowVar, surgeFuelVar }) => ({
    quantityGal: RegisteredSimVar.create(`FUELSYSTEM TANK QUANTITY:${tank}`, SimVarValueType.GAL),
    capacityGal: RegisteredSimVar.create(`FUELSYSTEM TANK CAPACITY:${tank}`, SimVarValueType.GAL),
    overflowDetected: RegisteredSimVar.createBoolean(overflowVar),
    surgeFuelLb: RegisteredSimVar.create(surgeFuelVar, SimVarValueType.Number),
  }));

  /** Rebuilt in place at each update, from the entries of the pumps */
  private readonly runningPumps: TransferPumpHandle[] = [];

  private readonly pumpedTanks: number[] = [];

  private readonly surgeTankInputs: OverflowInputs = {
    inletValveStuckOpen: false,
    tankFull: false,
    tankRoomLb: 0,
    refuelInProgress: false,
    otherTransferPumpsRunning: false,
  };

  constructor(
    private readonly sysHost: { deltaTime: number },
    private readonly failures: Pick<FailuresConsumer, 'isActive'>,
  ) {
    TRANSFER_PUMP_TANKS.forEach((tank, pump) =>
      this.pumps.push({ pump, tank, active: RegisteredSimVar.createBoolean(`A:FUELSYSTEM PUMP ACTIVE:${pump}`) }),
    );
  }

  public init(): void {
    // nothing to initialise: the surge tanks start empty
  }

  public onUpdate(): void {
    const deltaTimeS = this.sysHost.deltaTime / 1000;
    const poundsPerGallon = this.fuelWeightPerGallon.get();
    // No fuel density while a flight loads: no fuel moves (as CpiomF/FuelLeak)
    if (!(poundsPerGallon > 0)) {
      return;
    }
    const refuelInProgress = this.refuelStartedByUser.get();
    this.runningPumps.length = 0;
    for (const transferPump of this.pumps) {
      if (transferPump.active.get()) {
        this.runningPumps.push(transferPump);
      }
    }

    const pumpedTanks = this.pumpedTanks;
    for (let index = 0; index < OVERFLOW_TANKS.length; index++) {
      const overflowTank = OVERFLOW_TANKS[index];
      const handles = this.tankHandles[index];
      const quantityGal = handles.quantityGal.get();
      const capacityGal = handles.capacityGal.get();
      pumpedTanks.length = 0;
      for (const { pump, tank } of this.runningPumps) {
        if (!overflowTank.ownPumps.includes(pump) && pumpedTanks.indexOf(tank) < 0) {
          pumpedTanks.push(tank);
        }
      }
      const inputs = this.surgeTankInputs;
      inputs.inletValveStuckOpen = this.failures.isActive(overflowTank.failure);
      inputs.tankFull = quantityGal >= capacityGal - TANK_FULL_MARGIN_GAL;
      inputs.tankRoomLb = Math.max(0, capacityGal - quantityGal) * poundsPerGallon;
      inputs.refuelInProgress = refuelInProgress;
      inputs.otherTransferPumpsRunning = pumpedTanks.length > 0;
      const result = this.surgeTanks[index].update(inputs, deltaTimeS);

      this.addPending(overflowTank.tank, result.drainedBackLb / poundsPerGallon);
      for (const tank of pumpedTanks) {
        this.addPending(tank, -result.spilledFromPumpedTanksLb / poundsPerGallon / pumpedTanks.length);
      }
      handles.overflowDetected.set(result.overflowDetected);
      handles.surgeFuelLb.set(this.surgeTanks[index].surgeFuelLb);
    }

    this.timeSinceWriteMs += this.sysHost.deltaTime;
    if (this.timeSinceWriteMs >= FuelOverflow.WRITE_PERIOD_MS) {
      this.timeSinceWriteMs = 0;
      this.pendingGal.forEach((gallons, tank) => {
        const quantityVar = `FUELSYSTEM TANK QUANTITY:${tank}`;
        const quantityGal = SimVar.GetSimVarValue(quantityVar, SimVarValueType.GAL);
        SimVar.SetSimVarValue(quantityVar, SimVarValueType.GAL, Math.max(0, quantityGal + gallons));
      });
      this.pendingGal.clear();
    }
  }

  private addPending(tank: number, gallons: number): void {
    if (gallons !== 0) {
      this.pendingGal.set(tank, (this.pendingGal.get(tank) ?? 0) + gallons);
    }
  }
}
