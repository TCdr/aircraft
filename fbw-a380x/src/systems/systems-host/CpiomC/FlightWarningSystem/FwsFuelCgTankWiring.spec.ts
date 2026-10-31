// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { feedTankLevelLoTransferLines } from './FwsFuelTankAlerts';
import { createFws } from './FwsSpecFixture';

/*
 * The SystemsHost and the FUEL SD page cannot be built in a test (they need the sim), so the last two tests read their
 * source text.
 */
const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8');
const systemsHost = read('../../SystemsHost.ts');
const fuelPage = read('../../../instruments/src/SD/Pages/FuelPage.tsx');

describe('FUEL CG, weight and tank alert wiring', () => {
  it.each(['281800023', '281800024', '281800025', '281800026', '281800102', '281800103'])(
    '%s FEED TK(s) LEVEL LO shows and ticks the TRIM TK FEED and XFR lines',
    (id) => {
      const { core } = createFws();
      const alert = core.abnormalSensed.ewdAbnormalSensed[id];
      const transferLines = feedTankLevelLoTransferLines(
        core.feedTankLevelLoTransferInputs,
        core.fuelTankProcedureInputs,
      );
      expect(alert.whichItemsToShow().slice(-transferLines.show.length)).toEqual(transferLines.show);
      expect(alert.whichItemsChecked().slice(-transferLines.checked.length)).toEqual(transferLines.checked);
    },
  );

  it('the CG, weight, collector cell, temperature and MAN XFR COMPLETED alerts are in the abnormal sensed list', () => {
    const { core } = createFws();
    const alerts = core.abnormalSensed.ewdAbnormalSensed;
    expect(alerts['281800007'].simVarIsActive).toBe(core.fuelCgAtFwdLimit);
    expect(alerts['281800008'].simVarIsActive).toBe(core.fuelCgDataDisagree);
    expect(alerts['281800009'].simVarIsActive).toBe(core.fuelCgOutOfRange);
    expect(alerts['281800022'].simVarIsActive).toBe(core.fuelExcessAftCg);
    expect(alerts['281800096'].simVarIsActive).toBe(core.fuelWeightDataDisagree);
    expect(alerts['281800086'].simVarIsActive).toBe(core.fuelTempLo);
    for (let index = 0; index < 4; index++) {
      expect(alerts[281800010 + index].simVarIsActive).toBe(core.fuelCollectorCellNotFull[index]);
      expect(alerts[281800039 + index].simVarIsActive).toBe(core.fuelFeedTankTempHi[index]);
    }
    expect(alerts['281800050'].simVarIsActive).toBe(core.fuelInnerTankManXfrCompleted);
    expect(alerts['281800075'].simVarIsActive).toBe(core.fuelMidTankManXfrCompleted);
    expect(alerts['281800080'].simVarIsActive).toBe(core.fuelOuterTankManXfrCompleted);
    expect(alerts['281800092'].simVarIsActive).toBe(core.fuelTrimTankManXfrCompleted);
  });

  it('FUEL EXCESS AFT CG is a master warning', () => {
    const { core } = createFws();
    expect(core.abnormalSensed.ewdAbnormalSensed['281800022'].failure).toBe(3);
  });

  it.each([
    ['281800007', 8],
    ['281800008', 2],
    ['281800009', 3],
    ['281800022', 12],
    ['281800050', 1],
    ['281800075', 1],
    ['281800080', 2],
    ['281800086', 8],
    ['281800092', 2],
    ['281800096', 7],
  ])('ECAM procedure %s has the %i items that its lines function gives', (id, count) => {
    const { core } = createFws();
    const alert = core.abnormalSensed.ewdAbnormalSensed[id];
    expect(EcamAbnormalProcedures[id].items).toHaveLength(count);
    expect(alert.whichItemsToShow()).toHaveLength(count);
    expect(alert.whichItemsChecked()).toHaveLength(count);
  });

  it('the collector cell and TEMP HI procedures are built for each tank', () => {
    const { core } = createFws();
    for (let index = 0; index < 4; index++) {
      for (const id of [281800010 + index, 281800039 + index]) {
        const alert = core.abnormalSensed.ewdAbnormalSensed[id];
        expect(EcamAbnormalProcedures[id].items.length, `${id}`).toBeGreaterThan(0);
        expect(alert.whichItemsToShow(), `${id}`).toHaveLength(EcamAbnormalProcedures[id].items.length);
      }
    }
  });

  it('the systems host runs the collector cells, the fuel temperatures and the WBBC', () => {
    expect(systemsHost).toContain("addInstrument('FuelCollectorCells', this.fuelCollectorCells)");
    expect(systemsHost).toContain("addInstrument('FuelTemperatures', this.fuelTemperatures)");
    expect(systemsHost).toContain("addInstrument('WeightBalanceBackup', this.weightBalanceBackup)");
  });

  it('the FUEL SD page shows the computed collector cell quantities, not the 1200 placeholder', () => {
    expect(fuelPage).not.toMatch(/collectorCell\dWeight = 1200/);
    expect(fuelPage).toContain('useSimVar(collectorCellQuantityVar(1)');
    expect(fuelPage).toContain('<FeedTankTemperature');
    expect(fuelPage).toContain('<OuterOrTrimTankTemperature');
  });
});
