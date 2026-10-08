// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { EngineOilInputs, EngineOilMonitor, engineOilShutDownLines } from './EngineOilAlerts';

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

/* A320 FCOM PRO-ABN-ENG ENG 1(2) OIL LO PR, a320_fcom.txt l.80569: "This alert triggers when oil pressure is below 13 PSI." */
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

/* A320 FCOM PRO-ABN-ENG ENG 1(2) OIL HI TEMP, l.80528-80530: "Between 140 °C and 155 °C for more than 15 min, or Above
 * 155 °C." */
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

/* A320 FCOM PRO-ABN-ENG ENG 1(2) OIL FILTER CLOG, l.80497: "This alert triggers when the oil filter is clogged." */
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

/* l.80536-80537 and l.80576-80578: THR LEVER (AFFECTED ENGINE) IDLE, ENG MASTER (AFFECTED ENGINE) OFF */
describe('ENG 1(2) OIL LO PR and OIL HI TEMP lines', () => {
  it('shows the THR LEVER line while the lever is above idle', () => {
    expect(engineOilShutDownLines(false)).toEqual([0, 1, 2]);
  });

  it('removes the THR LEVER line once the lever is at idle', () => {
    expect(engineOilShutDownLines(true)).toEqual([0, 2]);
  });
});

/* The alerts in the FWC: levels and flight phase inhibitions of the 2019 FCOM PDF pages 2281-2283 */
describe('PseudoFWC oil alerts', () => {
  const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');

  function alert(code: string): string {
    const start = fwc.indexOf(`    ${code}: {`);
    expect(start, `alert ${code}`).toBeGreaterThan(0);
    return fwc.substring(start, fwc.indexOf('\n    },', start));
  }

  it.each([
    ['7707901', 'engine1OilLoPr', '[1, 10]', 3],
    ['7707902', 'engine2OilLoPr', '[1, 10]', 3],
    ['7707911', 'engine1OilHiTemp', '[4, 5, 7, 8]', 2],
    ['7707912', 'engine2OilHiTemp', '[4, 5, 7, 8]', 2],
    ['7707921', 'engine1OilFilterClog', '[3, 4, 5, 7, 8]', 2],
    ['7707922', 'engine2OilFilterClog', '[3, 4, 5, 7, 8]', 2],
  ])('%s is active on %s, inhibited in phases %s, level %d', (code, subject, phases, level) => {
    const item = alert(code);
    expect(item).toContain(`simVarIsActive: this.${subject},`);
    expect(item).toContain(`flightPhaseInhib: ${phases},`);
    expect(item).toContain(`failure: ${level},`);
    expect(item).toContain('sysPage: EcamSysPage.ENG,');
  });
});
