// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  ENGINE_ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS,
  EngineAntiIceValveInputs,
  EngineAntiIceValveMonitor,
  engineAntiIceValveClosedStatus,
  engineAntiIceValveOpenStatus,
} from './EngineAntiIceAlerts';
import { statusLines } from './FwcAlertSpecHelpers';

function monitorAfter(inputs: EngineAntiIceValveInputs, seconds: number): EngineAntiIceValveMonitor {
  const monitor = new EngineAntiIceValveMonitor();
  // 0.1 s steps, as the FWC updates
  for (let t = 0; t < seconds * 10; t += 1) {
    monitor.update(inputs, 0.1);
  }
  return monitor;
}

/* A320 FCOM PRO-ABN-A-ICE ANTI ICE ENG 1(2) VALVE CLSD, a320_fcom.txt l.68789: "This alert triggers when the valve is
 * abnormally closed." */
describe('ANTI ICE ENG 1(2) VALVE CLSD', () => {
  it('triggers when the valve stays closed with the pb-sw ON and the engine running', () => {
    const monitor = monitorAfter({ pbOn: true, valveOpen: false, engineRunning: true }, 6);
    expect(monitor.valveClosed).toBe(true);
    expect(monitor.valveOpen).toBe(false);
  });

  it('does not trigger while the valve transits', () => {
    const monitor = monitorAfter(
      { pbOn: true, valveOpen: false, engineRunning: true },
      ENGINE_ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS - 1,
    );
    expect(monitor.valveClosed).toBe(false);
  });

  it('does not trigger before the engine runs: the valve closes without engine air (DSC-30-30-10 l.44354)', () => {
    const monitor = monitorAfter({ pbOn: true, valveOpen: false, engineRunning: false }, 60);
    expect(monitor.valveClosed).toBe(false);
  });

  it('does not trigger with the valve open', () => {
    const monitor = monitorAfter({ pbOn: true, valveOpen: true, engineRunning: true }, 60);
    expect(monitor.valveClosed).toBe(false);
    expect(monitor.valveOpen).toBe(false);
  });

  it('has the STATUS of the FCOM: AVOID ICING CONDITIONS, INOP SYS ENG 1(2) A. ICE (l.68815-68817)', () => {
    expect(engineAntiIceValveClosedStatus(1)).toEqual({ statusInfo: ['700400001'], inopSys: ['300300002'] });
    expect(engineAntiIceValveClosedStatus(2)).toEqual({ statusInfo: ['700400001'], inopSys: ['300300003'] });
  });

  it('shows ENG 1(2) A. ICE under INOP SYS on the STATUS page (l.68817)', () => {
    for (const engine of [1, 2] as const) {
      const status = engineAntiIceValveClosedStatus(engine);
      const page = statusLines({ left: status.statusInfo, inopSys: status.inopSys });
      expect(page.left).toEqual(['AVOID ICING CONDITIONS']);
      expect(page.right).toEqual(['INOP SYS', `ENG ${engine} A. ICE`]);
    }
  });
});

/* A320 FCOM PRO-ABN-A-ICE ANTI ICE ENG 1(2) VALVE OPEN, a320_fcom.txt l.68829: "This alert triggers when the valve is
 * abnormally open." */
describe('ANTI ICE ENG 1(2) VALVE OPEN', () => {
  it('triggers when the valve stays open with the pb-sw OFF', () => {
    const monitor = monitorAfter({ pbOn: false, valveOpen: true, engineRunning: true }, 6);
    expect(monitor.valveOpen).toBe(true);
    expect(monitor.valveClosed).toBe(false);
  });

  it('does not trigger while the valve closes', () => {
    const monitor = monitorAfter(
      { pbOn: false, valveOpen: true, engineRunning: true },
      ENGINE_ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS - 1,
    );
    expect(monitor.valveOpen).toBe(false);
  });

  it('does not trigger with the valve closed and the pb-sw OFF', () => {
    const monitor = monitorAfter({ pbOn: false, valveOpen: false, engineRunning: true }, 60);
    expect(monitor.valveOpen).toBe(false);
    expect(monitor.valveClosed).toBe(false);
  });

  it('has the STATUS of the FCOM: THRUST LIM PENALTY (l.68855)', () => {
    expect(engineAntiIceValveOpenStatus()).toEqual({ statusInfo: ['300400001'], inopSys: [] });
  });
});
