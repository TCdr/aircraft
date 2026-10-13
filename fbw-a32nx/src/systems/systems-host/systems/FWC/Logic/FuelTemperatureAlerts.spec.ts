// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FUEL_TEMPERATURE_CELLS,
  FUEL_TEMPERATURE_PHASE_INHIBITION,
  FuelCellState,
  FuelTemperatureAlerts,
  FuelTemperatureInputs,
} from './FuelTemperatureAlerts';
import { ewdLines, pseudoFwcSource } from './FwcAlertSpecHelpers';

const normalCell: FuelCellState = { temperatureC: 15, quantityKg: 3000 };

/** The inputs with one cell (L OUTER, L INNER, R OUTER, R INNER) changed */
function inputs(cellIndex: number, cell: FuelCellState, onGround: boolean): FuelTemperatureInputs {
  return {
    cells: FUEL_TEMPERATURE_CELLS.map((_, index) => (index === cellIndex ? cell : normalCell)),
    onGround,
    engineMasterOn: [true, true],
  };
}

function activeKeys(alerts: FuelTemperatureAlerts): string[] {
  return Object.keys(alerts.ewdFailures).filter((key) => alerts.ewdFailures[key].simVarIsActive.get());
}

/* A320 FCOM PRO-ABN-FUEL FUEL L (R) OUTER (INNER) TK HI TEMP (a320_fcom.txt l.85994-86047) */
describe('FUEL L (R) OUTER (INNER) TK HI TEMP', () => {
  it('triggers above 55 °C in an outer cell on the ground, 60 °C in flight', () => {
    const alerts = new FuelTemperatureAlerts();
    alerts.update(inputs(0, { temperatureC: 56, quantityKg: 600 }, true));
    expect(activeKeys(alerts)).toEqual(['2800243']);
    alerts.update(inputs(0, { temperatureC: 56, quantityKg: 600 }, false));
    expect(activeKeys(alerts)).toEqual([]);
    alerts.update(inputs(0, { temperatureC: 61, quantityKg: 600 }, false));
    expect(activeKeys(alerts)).toEqual(['2800243']);
  });

  it('triggers above 45 °C in an inner cell on the ground, 54 °C in flight', () => {
    const alerts = new FuelTemperatureAlerts();
    alerts.update(inputs(3, { temperatureC: 46, quantityKg: 3000 }, true));
    expect(activeKeys(alerts)).toEqual(['2800246']);
    alerts.update(inputs(3, { temperatureC: 46, quantityKg: 3000 }, false));
    expect(activeKeys(alerts)).toEqual([]);
    alerts.update(inputs(3, { temperatureC: 55, quantityKg: 3000 }, false));
    expect(activeKeys(alerts)).toEqual(['2800246']);
  });

  it('gives nothing for a cell without fuel (dry sensor)', () => {
    const alerts = new FuelTemperatureAlerts();
    alerts.update(inputs(0, { temperatureC: 70, quantityKg: 0 }, true));
    expect(activeKeys(alerts)).toEqual([]);
  });

  it('shows the ground part of the procedure on the ground, the flight part in flight', () => {
    const alerts = new FuelTemperatureAlerts();
    alerts.update(inputs(0, { temperatureC: 58, quantityKg: 600 }, true));
    const item = alerts.ewdFailures['2800243'];
    expect(ewdLines(item)).toEqual([
      'FUEL L OUTER TK HI TEMP',
      ' -GALLEY.............OFF',
      '   .ON GROUND:',
      ' LIMITED TAXI TIME',
      '  .IF TEMP ABV 60 DEG C:',
      ' DELAY T.O.',
      ' -ENG 1 MASTER.......OFF',
    ]);

    alerts.update(inputs(1, { temperatureC: 55, quantityKg: 3000 }, false));
    expect(ewdLines(alerts.ewdFailures['2800244'])).toEqual([
      'FUEL L INNER TK HI TEMP',
      ' -GALLEY.............OFF',
      '   .IN FLIGHT:',
      ' -ENG 1 F.FLOW..INCREASE',
      '  .IF TEMP ABV 57 DEG C:',
      ' -APU............AS RQRD',
      '   .IF GEN 2 AVAIL:',
      ' -IDG 1..............OFF',
    ]);
    expect(FUEL_TEMPERATURE_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
  });

  it('hides the ENG MASTER line once the master is OFF', () => {
    const alerts = new FuelTemperatureAlerts();
    alerts.update({ ...inputs(2, { temperatureC: 58, quantityKg: 600 }, true), engineMasterOn: [true, false] });
    expect(ewdLines(alerts.ewdFailures['2800245'])).not.toContain(' -ENG 2 MASTER.......OFF');
  });
});

/* FCOM PRO-ABN-FUEL FUEL L (R) OUTER (INNER) TK LO TEMP (l.86069-86081) */
describe('FUEL L (R) OUTER (INNER) TK LO TEMP', () => {
  it('triggers below -43 °C, with DELAY T.O on the ground only', () => {
    const alerts = new FuelTemperatureAlerts();
    alerts.update(inputs(1, { temperatureC: -43, quantityKg: 3000 }, false));
    expect(activeKeys(alerts)).toEqual([]);
    alerts.update(inputs(1, { temperatureC: -44, quantityKg: 3000 }, false));
    expect(activeKeys(alerts)).toEqual(['2800248']);
    expect(ewdLines(alerts.ewdFailures['2800248'])).toEqual(['FUEL L INNER TK LO TEMP']);
    alerts.update(inputs(1, { temperatureC: -44, quantityKg: 3000 }, true));
    expect(ewdLines(alerts.ewdFailures['2800248'])).toEqual(['FUEL L INNER TK LO TEMP', ' DELAY T.O']);
  });
});

describe('PseudoFWC fuel temperature alerts', () => {
  it('is wired in the PseudoFWC', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('...this.fuelTemperatureAlerts.ewdFailures');
    expect(fwc).toContain('this.fuelTemperatureAlerts.update(');
    expect(fwc).toContain('readFuelTemperatureInputs(this.aircraftOnGround.get()');
  });
});
