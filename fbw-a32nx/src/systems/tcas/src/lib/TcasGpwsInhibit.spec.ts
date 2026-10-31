// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isGpwsAlertActive, isWindshearOrStallWarningActive } from './TcasGpwsInhibit';
import {
  createTcasComputer,
  readSimVar,
  setHealthyTcasInputs,
  setSimVar,
  TCAS_TA_ONLY_VAR,
} from '../components/TcasComputerTestBed';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Runs the TCAS computer with the given extra L:vars; returns whether it shows TA ONLY */
async function taOnlyWith(extraSimVars: Record<string, number>): Promise<boolean> {
  setHealthyTcasInputs();
  for (const [name, value] of Object.entries(extraSimVars)) {
    setSimVar(name, value);
  }
  const tcas = createTcasComputer();
  await tcas.runSeconds(2);
  return readSimVar(TCAS_TA_ONLY_VAR) === 1;
}

/* The TCAS goes TA ONLY automatically while a GPWS alert is active. */
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

  it('the TCAS computer shows TA ONLY with the GPWS lights, and not with the A380X variable', async () => {
    expect(await taOnlyWith({})).toBe(false);
    expect(await taOnlyWith({ 'L:A32NX_GPWS_WARNING_LIGHT_ON': 1 })).toBe(true);
    expect(await taOnlyWith({ 'L:A32NX_GPWS_ALERT_LIGHT_ON': 1 })).toBe(true);
    expect(await taOnlyWith({ 'L:A32NX_GPWS_Warning_Active': 1 })).toBe(false);
  });
});

/* TA ONLY also while the windshear alert or the stall warning is active. */
describe('TCAS windshear and stall inhibition', () => {
  const reader = (values: Record<string, number>) => (name: string) => values[name] ?? 0;

  it('is not active without a windshear or stall warning', () => {
    expect(isWindshearOrStallWarningActive(reader({}))).toBe(false);
  });

  it('is active with the reactive windshear warning of the FACs', () => {
    expect(isWindshearOrStallWarningActive(reader({ 'L:A32NX_REACTIVE_WINDSHEAR_WARNING': 1 }))).toBe(true);
  });

  it('is active with the stall warning of the FWCs', () => {
    expect(isWindshearOrStallWarningActive(reader({ 'L:A32NX_AUDIO_STALL_WARNING': 1 }))).toBe(true);
  });

  it('the TCAS computer shows TA ONLY with it, like with a GPWS alert', async () => {
    expect(await taOnlyWith({ 'L:A32NX_REACTIVE_WINDSHEAR_WARNING': 1 })).toBe(true);
    expect(await taOnlyWith({ 'L:A32NX_AUDIO_STALL_WARNING': 1 })).toBe(true);
  });
});
