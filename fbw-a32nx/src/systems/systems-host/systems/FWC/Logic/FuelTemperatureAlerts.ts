// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import {
  FuelCell,
  isFuelTemperatureHigh,
  isFuelTemperatureLow,
  isFuelTemperatureSensorWet,
} from '@shared/FuelTemperature';
import { FwcAlertItem, cautionItem } from './FwcAlertItem';

/*
 * FUEL L (R) OUTER (INNER) TK HI TEMP and LO TEMP, A320 FCOM PRO-ABN-FUEL, on the fuel temperatures of the systems WASM
 * (a320_systems fuel/fuel_temperature.rs) and the limits of shared/src/FuelTemperature.ts:
 * - HI TEMP (a320_fcom.txt l.85983-86047): the triggering conditions l.85994-85998, the procedure l.86023-86047. The
 *   procedure is applied "After 2 min, if the ECAM caution has not disappeared" (l.86020-86021): the lines are shown at
 *   once. Flight phase inhibition (FCOM PDF PRO-ABN-FUEL P 43/74, PDF page 5293): phases 3, 4, 5, 7 and 8.
 * - LO TEMP (l.86059-86082): "On the ground before takeoff: DELAY T.O", "In flight: Crew awareness". Flight phase
 *   inhibition (PDF P 47/74, PDF page 5297): phases 3, 4, 5, 7 and 8.
 * Design choice: a dry sensor (a cell without fuel) gives no alert.
 */

export const FUEL_TEMPERATURE_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/** A wing tank cell: its side, the engine (and IDG) it feeds and the other generator */
export interface FuelTemperatureCell {
  side: 'L' | 'R';
  cell: FuelCell;
  /** The engine, IDG and generator of the side */
  engine: 1 | 2;
  /** The 7-digit key of HI TEMP */
  highKey: string;
  /** The 7-digit key of LO TEMP */
  lowKey: string;
}

/** The four cells, in the order of FuelTemperatureInputs.cells */
export const FUEL_TEMPERATURE_CELLS: readonly FuelTemperatureCell[] = [
  { side: 'L', cell: 'outer', engine: 1, highKey: '2800243', lowKey: '2800247' },
  { side: 'L', cell: 'inner', engine: 1, highKey: '2800244', lowKey: '2800248' },
  { side: 'R', cell: 'outer', engine: 2, highKey: '2800245', lowKey: '2800249' },
  { side: 'R', cell: 'inner', engine: 2, highKey: '2800246', lowKey: '2800250' },
];

/** The temperature and the fuel of a cell */
export interface FuelCellState {
  temperatureC: number;
  quantityKg: number;
}

export interface FuelTemperatureInputs {
  /** L OUTER, L INNER, R OUTER, R INNER */
  cells: readonly FuelCellState[];
  onGround: boolean;
  /** The ENG 1 and ENG 2 MASTER switches are ON */
  engineMasterOn: readonly [boolean, boolean];
}

/** The number of E/WD codes of HI TEMP (title included) */
export const HI_TEMP_LINE_COUNT = 13;

/**
 * The lines of HI TEMP (l.86023-86047): 0 title, 1 -GALLEY OFF, 2 .ON GROUND:, 3 LIMITED TAXI TIME, 4 .IF TEMP ABV
 * 60 (54) DEG C:, 5 DELAY T.O., 6 -ENG n MASTER OFF, 7 .IN FLIGHT:, 8 -ENG n F.FLOW INCREASE, 9 .IF TEMP ABV 65 (57)
 * DEG C:, 10 -APU AS RQRD, 11 .IF GEN m AVAIL:, 12 -IDG n OFF. The part of the other flight condition is hidden, and
 * the ENG MASTER line once it is OFF.
 */
export function highTemperatureLines(onGround: boolean, engineMasterOn: boolean): (number | null)[] {
  if (onGround) {
    return [0, 1, 2, 3, 4, 5, engineMasterOn ? 6 : null];
  }
  return [0, 1, 7, 8, 9, 10, 11, 12];
}

/** The lines of LO TEMP (l.86075-86081): 0 title, 1 DELAY T.O on the ground; the title alone in flight */
export function lowTemperatureLines(onGround: boolean): (number | null)[] {
  return onGround ? [0, 1] : [0];
}

export class FuelTemperatureAlerts {
  private inputs: FuelTemperatureInputs = {
    cells: FUEL_TEMPERATURE_CELLS.map(() => ({ temperatureC: 15, quantityKg: 0 })),
    onGround: true,
    engineMasterOn: [false, false],
  };

  private readonly high = FUEL_TEMPERATURE_CELLS.map(() => Subject.create(false));

  private readonly low = FUEL_TEMPERATURE_CELLS.map(() => Subject.create(false));

  update(inputs: FuelTemperatureInputs): void {
    this.inputs = inputs;
    FUEL_TEMPERATURE_CELLS.forEach(({ cell }, index) => {
      const { temperatureC, quantityKg } = inputs.cells[index];
      const wet = isFuelTemperatureSensorWet(quantityKg);
      this.high[index].set(wet && isFuelTemperatureHigh(cell, temperatureC, inputs.onGround));
      this.low[index].set(wet && isFuelTemperatureLow(temperatureC));
    });
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {};

  constructor() {
    FUEL_TEMPERATURE_CELLS.forEach(({ engine, highKey, lowKey }, index) => {
      this.ewdFailures[highKey] = cautionItem(
        highKey,
        HI_TEMP_LINE_COUNT,
        this.high[index],
        FUEL_TEMPERATURE_PHASE_INHIBITION,
        () => highTemperatureLines(this.inputs.onGround, this.inputs.engineMasterOn[engine - 1]),
        EcamSysPage.FUEL,
      );
      this.ewdFailures[lowKey] = cautionItem(
        lowKey,
        2,
        this.low[index],
        FUEL_TEMPERATURE_PHASE_INHIBITION,
        () => lowTemperatureLines(this.inputs.onGround),
        EcamSysPage.FUEL,
      );
    });
  }
}

/* Acquisition (not unit tested: SimVar reads only) */

/** Reads the fuel temperature inputs from the simvars */
export function readFuelTemperatureInputs(
  onGround: boolean,
  engineMasterOn: [boolean, boolean],
): FuelTemperatureInputs {
  const kgPerGallon = SimVar.GetSimVarValue('FUEL WEIGHT PER GALLON', 'kilogram');
  const tank = { L: { inner: 'LEFT MAIN', outer: 'LEFT AUX' }, R: { inner: 'RIGHT MAIN', outer: 'RIGHT AUX' } };
  return {
    cells: FUEL_TEMPERATURE_CELLS.map(({ side, cell }) => ({
      temperatureC: SimVar.GetSimVarValue(
        `L:A32NX_FUEL_${side === 'L' ? 'LEFT' : 'RIGHT'}_${cell.toUpperCase()}_TANK_TEMPERATURE`,
        'number',
      ),
      quantityKg: SimVar.GetSimVarValue(`FUEL TANK ${tank[side][cell]} QUANTITY`, 'gallons') * kgPerGallon,
    })),
    onGround,
    engineMasterOn,
  };
}
