// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, startCruiseFwc } from '../FwcAlertProbe';
import { EngineOilInputs, EngineOilMonitor, engineOilShutDownLines } from './EngineOilAlerts';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const running: EngineOilInputs = {
  masterOn: true,
  engineRunning: true,
  oilPressurePsi: 60,
  oilTemperatureCelsius: 90,
  oilFilterClogged: false,
};

function monitorAfter(...steps: [EngineOilInputs, number][]): EngineOilMonitor {
  const monitor = new EngineOilMonitor();
  for (const [inputs, seconds] of steps) {
    // 1 s steps
    for (let t = 0; t < seconds; t += 1) {
      monitor.update(inputs, 1);
    }
  }
  return monitor;
}

/* ENG 1(2) OIL LO PR: the oil pressure is below 13 PSI */
describe('ENG 1(2) OIL LO PR', () => {
  it('triggers below 13 PSI', () => {
    expect(monitorAfter([{ ...running, oilPressurePsi: 12.9 }, 1]).isLowPressure).toBe(true);
  });

  it('does not trigger at 13 PSI and above', () => {
    expect(monitorAfter([{ ...running, oilPressurePsi: 13 }, 1]).isLowPressure).toBe(false);
    expect(monitorAfter([running, 1]).isLowPressure).toBe(false);
  });

  it('is not monitored on an engine that is not running (start, shutdown, flameout)', () => {
    expect(monitorAfter([{ ...running, engineRunning: false, oilPressurePsi: 0 }, 1]).isLowPressure).toBe(false);
  });

  it('ends with the ENG MASTER OFF of its procedure', () => {
    expect(monitorAfter([{ ...running, masterOn: false, oilPressurePsi: 5 }, 1]).isLowPressure).toBe(false);
  });
});

/* ENG 1(2) OIL HI TEMP: between 140 °C and 155 °C for more than 15 min, or above 155 °C */
describe('ENG 1(2) OIL HI TEMP', () => {
  it('triggers above 155 °C at once', () => {
    expect(monitorAfter([{ ...running, oilTemperatureCelsius: 156 }, 1]).isHighTemperature).toBe(true);
  });

  it('does not trigger between 140 °C and 155 °C for 15 min', () => {
    expect(monitorAfter([{ ...running, oilTemperatureCelsius: 150 }, 15 * 60]).isHighTemperature).toBe(false);
  });

  it('triggers between 140 °C and 155 °C for more than 15 min', () => {
    expect(monitorAfter([{ ...running, oilTemperatureCelsius: 150 }, 15 * 60 + 2]).isHighTemperature).toBe(true);
  });

  it('restarts the 15 min when the temperature goes below 140 °C', () => {
    const monitor = monitorAfter(
      [{ ...running, oilTemperatureCelsius: 150 }, 14 * 60],
      [{ ...running, oilTemperatureCelsius: 135 }, 10],
      [{ ...running, oilTemperatureCelsius: 150 }, 14 * 60],
    );
    expect(monitor.isHighTemperature).toBe(false);
  });

  it('does not trigger below 140 °C', () => {
    expect(monitorAfter([{ ...running, oilTemperatureCelsius: 139 }, 3600]).isHighTemperature).toBe(false);
  });

  it('ends with the ENG MASTER OFF of its procedure', () => {
    expect(monitorAfter([{ ...running, masterOn: false, oilTemperatureCelsius: 170 }, 1]).isHighTemperature).toBe(
      false,
    );
  });
});

/* ENG 1(2) OIL FILTER CLOG: the oil filter is clogged */
describe('ENG 1(2) OIL FILTER CLOG', () => {
  it('triggers with a clogged filter on a running engine', () => {
    expect(monitorAfter([{ ...running, oilFilterClogged: true }, 1]).isFilterClogged).toBe(true);
  });

  it('does not trigger on a stopped engine (no oil flow)', () => {
    expect(monitorAfter([{ ...running, engineRunning: false, oilFilterClogged: true }, 1]).isFilterClogged).toBe(false);
  });

  it('does not trigger without the failure', () => {
    expect(monitorAfter([running, 1]).isFilterClogged).toBe(false);
  });
});

/* The procedure: THR LEVER (AFFECTED ENGINE) IDLE, ENG MASTER (AFFECTED ENGINE) OFF */
describe('ENG 1(2) OIL LO PR and OIL HI TEMP lines', () => {
  it('shows the THR LEVER line while the lever is above idle', () => {
    expect(engineOilShutDownLines(false)).toEqual([0, 1, 2]);
  });

  it('removes the THR LEVER line once the lever is at idle', () => {
    expect(engineOilShutDownLines(true)).toEqual([0, 2]);
  });
});

/* The alerts in the FWC: levels, flight phase inhibitions and the simvars that feed them */
describe('the real FWC: oil alerts', () => {
  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
  });

  // [engine 1 key, engine 2 key, flight phase inhibition, level, simvar of the failure, value that triggers it]
  const OIL_ALERTS: [string, string, number[], number, (engine: number) => string, number][] = [
    ['7707901', '7707902', [1, 10], 3, (engine) => `GENERAL ENG OIL PRESSURE:${engine}`, 5],
    ['7707911', '7707912', [4, 5, 7, 8], 2, (engine) => `GENERAL ENG OIL TEMPERATURE:${engine}`, 160],
    ['7707921', '7707922', [3, 4, 5, 7, 8], 2, (engine) => `L:A32NX_ENGINE_${engine}_OIL_FILTER_CLOGGED`, 1],
  ];

  it.each(OIL_ALERTS)(
    '%s and %s: inhibited in phases %j, level %d, raised by the oil data of their own engine',
    (key1, key2, phases, level, variableOf, triggeringValue) => {
      const { fwc } = startCruiseFwc(simvars);
      for (const key of [key1, key2]) {
        expect(failureItem(fwc, key).flightPhaseInhib).toEqual(phases);
        expect(failureItem(fwc, key).failure).toBe(level);
        expect(failureItem(fwc, key).sysPage).toBe(EcamSysPage.ENG);
        expect(isAlertTriggered(fwc, key)).toBe(false);
      }

      simvars.set(variableOf(2), triggeringValue);
      runFwc(fwc, 1);
      expect(isAlertTriggered(fwc, key2)).toBe(true);
      expect(isAlertTriggered(fwc, key1)).toBe(false);
    },
  );
});
