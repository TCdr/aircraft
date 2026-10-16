// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { COLLECTOR_CELL_CAPACITY_KG, collectorCellQuantityVar } from '@shared/FuelTankIndications';

/*
 * The collector cells of the four feed tanks (A380 FCOM DSC-28-10, a380_fcom.txt l.57265-57271): "Each feed tank [...]
 * Contains a collector cell that has a fuel capacity of approximately 2 866 lb. The collector cell is maintained full,
 * to keep the fuel pumps immersed, in order to provide low or negative "g" protection to feed the engine." The MSFS
 * fuel system has no collector cell: its quantity is derived here from the feed tank quantity, for the FUEL SD page and
 * FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL.
 *
 * When the feed tank pumps are lost, the engine is fed by gravity and the cell empties: "EXPECT NORM COLLECTOR CELL
 * DEPLETION. In the case of collector cell depletion, the associated collector cell quantity appears in amber on the
 * FUEL SD page" (ELEC AC BUS 2+3 & DC BUS 1+2 FAULT, l.138086-138093).
 *
 * Design choices (the FCOM gives no rates):
 * - While a pump of the feed tank runs, or while its engine is not running (no fuel drawn out of the cell), the cell
 *   is refilled from the feed tank at COLLECTOR_CELL_REFILL_RATE_KG_PER_HOUR, up to its capacity.
 * - While no pump of the feed tank runs and its engine runs, the engine draws its fuel out of the cell: the cell loses
 *   what the feed tank loses.
 * - The cell never holds more than the feed tank (it is part of it); it starts full at flight load.
 */

/** Design choice: the refill rate of the collector cell, well above the engine fuel flow (about 3 000 kg/h at cruise) */
export const COLLECTOR_CELL_REFILL_RATE_KG_PER_HOUR = 20_000;

/** What a collector cell reads on one update */
export interface CollectorCellInputs {
  /** The feed tank quantity (the cell included), in kg */
  feedTankKg: number;
  /** The main or the standby pump of the feed tank runs */
  pumpRunning: boolean;
  /** The engine fed by the feed tank runs */
  engineRunning: boolean;
}

/** The collector cell of one feed tank */
export class CollectorCell {
  private quantityKg: number | null = null;

  private lastFeedTankKg = 0;

  /**
   * @param inputs what the cell reads
   * @param deltaTimeS the time since the last update, in seconds
   * @returns the collector cell quantity, in kg
   */
  public update(inputs: CollectorCellInputs, deltaTimeS: number): number {
    const feedTankKg = Math.max(inputs.feedTankKg, 0);
    let quantityKg = this.quantityKg ?? COLLECTOR_CELL_CAPACITY_KG;
    if (this.quantityKg !== null) {
      if (inputs.pumpRunning || !inputs.engineRunning) {
        quantityKg += (COLLECTOR_CELL_REFILL_RATE_KG_PER_HOUR * Math.max(deltaTimeS, 0)) / 3600;
      } else {
        quantityKg -= Math.max(this.lastFeedTankKg - feedTankKg, 0);
      }
    }
    this.quantityKg = Math.max(0, Math.min(quantityKg, COLLECTOR_CELL_CAPACITY_KG, feedTankKg));
    this.lastFeedTankKg = feedTankKg;
    return this.quantityKg;
  }
}

/** A feed tank with its MSFS tank (flight_model.cfg Tank.N), pumps (Pump.N) and engine */
interface FeedTankCell {
  cell: number;
  msfsTank: number;
  mainPump: number;
  stbyPump: number;
}

/** Feed tanks 1-4 = Tank.2, 5, 6, 9; their MAIN and STBY pumps = Pump.1-8 (CpiomF/FuelPumpsAndValves A380_FEED_PUMPS) */
const FEED_TANK_CELLS: readonly FeedTankCell[] = [
  { cell: 1, msfsTank: 2, mainPump: 1, stbyPump: 2 },
  { cell: 2, msfsTank: 5, mainPump: 3, stbyPump: 4 },
  { cell: 3, msfsTank: 6, mainPump: 5, stbyPump: 6 },
  { cell: 4, msfsTank: 9, mainPump: 7, stbyPump: 8 },
];

/** Writes the collector cell quantities (A380X_FUEL_COLLECTOR_CELL_{n}_QUANTITY) */
export class FuelCollectorCells implements Instrument {
  private readonly cells = FEED_TANK_CELLS.map(() => new CollectorCell());

  constructor(private readonly sysHost: { deltaTime: number }) {}

  public init(): void {
    // nothing to initialise: the cells start full on the first update
  }

  public onUpdate(): void {
    const deltaTimeS = this.sysHost.deltaTime / 1000;
    FEED_TANK_CELLS.forEach(({ cell, msfsTank, mainPump, stbyPump }, index) => {
      const quantityKg = this.cells[index].update(
        {
          feedTankKg: SimVar.GetSimVarValue(`FUELSYSTEM TANK WEIGHT:${msfsTank}`, 'kilogram'),
          pumpRunning:
            SimVar.GetSimVarValue(`FUELSYSTEM PUMP ACTIVE:${mainPump}`, SimVarValueType.Bool) > 0 ||
            SimVar.GetSimVarValue(`FUELSYSTEM PUMP ACTIVE:${stbyPump}`, SimVarValueType.Bool) > 0,
          engineRunning: SimVar.GetSimVarValue(`L:A32NX_ENGINE_STATE:${cell}`, SimVarValueType.Enum) === 1,
        },
        deltaTimeS,
      );
      SimVar.SetSimVarValue(collectorCellQuantityVar(cell), SimVarValueType.Number, quantityKg);
    });
  }
}
