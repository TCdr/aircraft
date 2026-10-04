// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isGpwsAlertActive } from './TcasGpwsInhibit';

/* A320 FCOM DSC-34-SURV-60-10-10: the TCAS goes TA ONLY automatically if "GPWS alerts are triggered". */
describe('TCAS GPWS inhibition', () => {
  const reader = (values: Record<string, number>) => (name: string) => values[name] ?? 0;

  it('is active with the GPWS warning light', () => {
    expect(isGpwsAlertActive(reader({ 'L:A32NX_GPWS_WARNING_LIGHT_ON': 1 }))).toBe(true);
  });

  it('is active with the GPWS alert light', () => {
    expect(isGpwsAlertActive(reader({ 'L:A32NX_GPWS_ALERT_LIGHT_ON': 1 }))).toBe(true);
  });

  it('ignores the A380X variable, which nothing on the A32NX writes', () => {
    expect(isGpwsAlertActive(reader({ 'L:A32NX_GPWS_Warning_Active': 1 }))).toBe(false);
  });

  it('the TCAS computer uses it', () => {
    const computer = readFileSync(resolve(__dirname, '../components/TcasComputer.ts'), 'utf-8');
    expect(computer).toContain('this.gpwsWarning = isGpwsAlertActive(');
    expect(computer).not.toContain('A32NX_GPWS_Warning_Active');
  });
});
