// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A380Failure, A380FailureDefinitions } from '@failures';
import { TIRE_COUNT, TIRE_NORMAL_PRESSURE_PSI } from '@shared/TirePressures';
import { TIRE_DEFLATION_FAILURES, TIRE_DEFLATION_RATE_PSI_PER_S, TirePressureModel } from './Tpis';

const none = () => new Array(TIRE_COUNT).fill(false);

describe('A380 TPIS tire pressure model', () => {
  it('holds the normal pressure, 217.5 PSI, without failure', () => {
    const model = new TirePressureModel();
    expect(model.update(600, none())).toEqual(new Array(TIRE_COUNT).fill(TIRE_NORMAL_PRESSURE_PSI));
  });

  it('a deflating tire loses 10 PSI/min down to 0, the other tires keep their pressure', () => {
    const model = new TirePressureModel();
    const deflating = none();
    deflating[6] = true;
    expect(model.update(60, deflating)[6]).toBeCloseTo(TIRE_NORMAL_PRESSURE_PSI - 60 * TIRE_DEFLATION_RATE_PSI_PER_S);
    expect(model.update(60 * 60, deflating)[6]).toBe(0);
    expect(model.update(1, deflating)[7]).toBe(TIRE_NORMAL_PRESSURE_PSI);
  });

  it('the tire is back at the normal pressure when the failure is removed', () => {
    const model = new TirePressureModel();
    const deflating = none();
    deflating[20] = true;
    model.update(300, deflating);
    expect(model.update(1, none())[20]).toBe(TIRE_NORMAL_PRESSURE_PSI);
  });

  it('has one flyPad deflation failure per tire, in ATA 32', () => {
    expect(TIRE_DEFLATION_FAILURES).toHaveLength(TIRE_COUNT);
    expect(new Set(TIRE_DEFLATION_FAILURES).size).toBe(TIRE_COUNT);
    const listed = A380FailureDefinitions.filter(([, id]) => TIRE_DEFLATION_FAILURES.includes(id));
    expect(listed).toHaveLength(TIRE_COUNT);
    expect(listed.every(([ata]) => ata === 32)).toBe(true);
    expect(TIRE_DEFLATION_FAILURES[20]).toBe(A380Failure.NoseTireLeftDeflation);
  });

  it('the systems host runs the TPIS', () => {
    const host = readFileSync(resolve(__dirname, '../SystemsHost.ts'), 'utf8');
    expect(host).toContain("this.backplane.addInstrument('Tpis', this.tpis);");
  });
});
