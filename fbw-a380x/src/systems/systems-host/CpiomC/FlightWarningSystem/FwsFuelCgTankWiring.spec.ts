// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * The wiring of the FUEL alerts, read from the source text (as FwsAbnormalSensedItems.spec.ts:
 * importing the EcamMessages tables in a test fails on a circular import).
 */
const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8');
const abnormalSensed = read('FwsAbnormalSensed.ts');
const ata28 = read('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata28.ts');
const systemsHost = read('../../SystemsHost.ts');
const fuelPage = read('../../../instruments/src/SD/Pages/FuelPage.tsx');

/** The source of one alert entry of FwsAbnormalSensed, from its id to the end of its object */
function alertBlock(id: string): string {
  const start = abnormalSensed.indexOf(`    ${id}: {`);
  expect(start).toBeGreaterThan(0);
  return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
}

/** The number of items of an ata28 procedure written as an item list */
function ata28ItemCount(id: string): number {
  const start = ata28.indexOf(`  ${id}: {`);
  expect(start).toBeGreaterThan(0);
  const block = ata28.slice(start, ata28.indexOf('\n  },', start));
  return (block.match(/\{ name: /g) ?? []).length;
}

describe('FUEL CG, weight and tank alert wiring', () => {
  it.each(['281800023', '281800024', '281800025', '281800026', '281800102', '281800103'])(
    '%s FEED TK(s) LEVEL LO shows and ticks the TRIM TK FEED and XFR lines',
    (id) => {
      const block = alertBlock(id);
      expect(block).toContain('...this.feedTankLevelLoTransferLines().show');
      expect(block).toContain('...this.feedTankLevelLoTransferLines().checked');
    },
  );

  it('the CG, weight, collector cell, temperature and MAN XFR COMPLETED alerts are in the abnormal sensed list', () => {
    expect(abnormalSensed).toContain('...this.fuelCgAndTankAlerts(),');
    for (const id of ['281800007', '281800008', '281800009', '281800022', '281800096', '281800086']) {
      expect(abnormalSensed).toContain(`      ${id}: {`);
    }
    expect(abnormalSensed).toContain('alerts[281800010 + cell]');
    expect(abnormalSensed).toContain('alerts[281800039 + tank]');
    for (const id of ['281800050', '281800075', '281800080', '281800092']) {
      expect(abnormalSensed).toContain(`[${id}, '`);
    }
  });

  it('FUEL EXCESS AFT CG is a master warning', () => {
    const block = abnormalSensed.slice(abnormalSensed.indexOf('      281800022: {'));
    expect(block.slice(0, block.indexOf('\n      },'))).toContain('failure: 3,');
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
  ])('ata28 %s has the %i items that its lines function gives', (id, count) => {
    expect(ata28ItemCount(id)).toBe(count);
  });

  it('the collector cell and TEMP HI procedures are built for each tank', () => {
    for (let cell = 1; cell <= 4; cell++) {
      expect(ata28).toContain(`items: collectorCellNotFullItems(${cell}),`);
      expect(ata28).toContain(`items: feedTankTempHiItems(${cell}),`);
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
