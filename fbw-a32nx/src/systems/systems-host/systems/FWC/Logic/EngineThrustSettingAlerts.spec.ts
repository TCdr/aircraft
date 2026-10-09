// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  SAT_ABOVE_FLEX_TEMP_PHASE_INHIBITION,
  THR_LEVER_ABV_IDLE_PHASE_INHIBITION,
  ThrustLeverAboveIdleMonitor,
  isSatAboveFlexTemp,
} from './EngineThrustSettingAlerts';

/** Thrust lever angles in degrees: max reverse, idle, climb detent */
const REVERSE = -20;
const IDLE = 0;
const CLIMB = 25;

function monitorAfter(...steps: { phase: number; tla: [number, number]; onGround?: boolean }[]) {
  const monitor = new ThrustLeverAboveIdleMonitor();
  for (const step of steps) {
    monitor.update({ onGround: step.onGround ?? true, flightPhase: step.phase, tlaDegrees: step.tla });
  }
  return monitor;
}

/* A320 FCOM PRO-ABN-ENG ENG 1(2) THR LEVER ABV IDLE, a320_fcom.txt l.81642-81645 */
describe('ENG 1(2) THR LEVER ABV IDLE', () => {
  it('triggers for the lever above idle while the other lever is in reverse at landing', () => {
    const monitor = monitorAfter({ phase: 8, tla: [CLIMB, REVERSE] });
    expect(monitor.isActive(0)).toBe(true);
    expect(monitor.isActive(1)).toBe(false);
    expect(monitorAfter({ phase: 9, tla: [REVERSE, CLIMB] }).isActive(1)).toBe(true);
  });

  it('triggers for a lever above idle at the reverser deselection during the landing roll', () => {
    const monitor = monitorAfter({ phase: 8, tla: [REVERSE, REVERSE] }, { phase: 8, tla: [CLIMB, IDLE] });
    expect(monitor.isActive(0)).toBe(true);
    expect(monitor.isActive(1)).toBe(false);
  });

  it('does not trigger for one lever above idle without a reverse selection (taxi on one engine)', () => {
    expect(monitorAfter({ phase: 9, tla: [CLIMB, IDLE] }).isActive(0)).toBe(false);
  });

  it('ends the deselection trigger once both levers were at idle', () => {
    const monitor = monitorAfter(
      { phase: 8, tla: [REVERSE, REVERSE] },
      { phase: 8, tla: [IDLE, IDLE] },
      { phase: 9, tla: [CLIMB, IDLE] },
    );
    expect(monitor.isActive(0)).toBe(false);
  });

  it('does not trigger outside the landing roll or with both levers in reverse', () => {
    expect(monitorAfter({ phase: 6, tla: [CLIMB, REVERSE], onGround: false }).isActive(0)).toBe(false);
    expect(monitorAfter({ phase: 3, tla: [CLIMB, REVERSE] }).isActive(0)).toBe(false);
    expect(monitorAfter({ phase: 8, tla: [CLIMB, REVERSE], onGround: false }).isActive(0)).toBe(false);
    const bothReverse = monitorAfter({ phase: 8, tla: [REVERSE, REVERSE] });
    expect(bothReverse.isActive(0) || bothReverse.isActive(1)).toBe(false);
  });

  it('sounds the repetitive RETARD-RETARD above 40 kt only (DSC-31-10 l.45786)', () => {
    const monitor = monitorAfter({ phase: 8, tla: [CLIMB, REVERSE] });
    expect(monitor.isRetardCalloutRequired(60)).toBe(true);
    expect(monitor.isRetardCalloutRequired(30)).toBe(false);
    expect(monitorAfter({ phase: 8, tla: [IDLE, REVERSE] }).isRetardCalloutRequired(60)).toBe(false);
  });

  it('is inhibited in the flight phases of the FCOM figure (PDF page 2309)', () => {
    expect(THR_LEVER_ABV_IDLE_PHASE_INHIBITION).toEqual([1, 5, 10]);
  });
});

/* A320 FCOM PRO-ABN-ENG ENG SAT ABOVE FLEX TEMP, a320_fcom.txt l.80994 */
describe('ENG SAT ABOVE FLEX TEMP', () => {
  it('triggers when the SAT is above the FLEX TEMP', () => {
    expect(isSatAboveFlexTemp({ flexTemperatureCelsius: 25, staticAirTemperatureCelsius: 26 })).toBe(true);
    // a FLEX TEMP of 0 °C is written as 0.1 by the FMS
    expect(isSatAboveFlexTemp({ flexTemperatureCelsius: 0.1, staticAirTemperatureCelsius: 5 })).toBe(true);
  });

  it('does not trigger at or below the FLEX TEMP, without a FLEX TEMP or without a valid SAT', () => {
    expect(isSatAboveFlexTemp({ flexTemperatureCelsius: 25, staticAirTemperatureCelsius: 25 })).toBe(false);
    expect(isSatAboveFlexTemp({ flexTemperatureCelsius: 50, staticAirTemperatureCelsius: 15 })).toBe(false);
    expect(isSatAboveFlexTemp({ flexTemperatureCelsius: 0, staticAirTemperatureCelsius: 15 })).toBe(false);
    expect(isSatAboveFlexTemp({ flexTemperatureCelsius: 25, staticAirTemperatureCelsius: null })).toBe(false);
  });

  it('is shown in flight phase 2 only (PDF page 2295)', () => {
    expect(SAT_ABOVE_FLEX_TEMP_PHASE_INHIBITION).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('PseudoFWC thrust setting alerts', () => {
  const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const messages = readFileSync(resolve(__dirname, '../../../../shared/src/EwdMessages.ts'), 'utf-8');

  function alert(code: string): string {
    const start = fwc.indexOf(`    ${code}: {`);
    expect(start, `alert ${code}`).toBeGreaterThan(0);
    return fwc.substring(start, fwc.indexOf('\n    },', start));
  }

  it.each([
    ['7700901', 'engine1ThrLeverAboveIdle', '770090101', '770090102', '1'],
    ['7700902', 'engine2ThrLeverAboveIdle', '770090201', '770090202', '2'],
  ])('%s is a red ENG warning on %s with the title %s and the lever line', (code, subject, title, line, engine) => {
    const item = alert(code);
    expect(item).toContain(`simVarIsActive: this.${subject},`);
    expect(item).toContain('flightPhaseInhib: THR_LEVER_ABV_IDLE_PHASE_INHIBITION,');
    expect(item).toContain('auralWarning: Subject.create(FwcAuralWarning.None),');
    expect(item).toContain('failure: 3,');
    expect(item).toContain(`codesToReturn: ['${title}', '${line}'],`);
    expect(messages).toContain(`['${title}', { group: 'ENG$1', text: ' ${engine} THR LEVER ABV IDLE' }],`);
    expect(messages).toContain(`['${line}', { text: '\\x1b<5m -THR LEVER ${engine}.......IDLE' }],`);
  });

  it('7700911 is the amber ENG SAT ABOVE FLEX TEMP caution with T.O DATA CHECK', () => {
    const item = alert('7700911');
    expect(item).toContain('simVarIsActive: this.satAboveFlexTemp,');
    expect(item).toContain('flightPhaseInhib: SAT_ABOVE_FLEX_TEMP_PHASE_INHIBITION,');
    expect(item).toContain('failure: 2,');
    expect(item).toContain(`codesToReturn: ['770091101', '770091102'],`);
    expect(messages).toContain(`['770091101', { group: 'ENG$5', text: ' SAT ABOVE FLEX TEMP' }],`);
    expect(messages).toContain(`['770091102', { text: '\\x1b<5m -T.O DATA.........CHECK' }],`);
  });

  it('reads the FLEX TEMP and the ADR SATs, and plays the RETARD voice with the auto callouts', () => {
    expect(fwc).toContain("SimVar.GetSimVarValue('L:A32NX_AIRLINER_TO_FLEX_TEMP', 'number')");
    expect(fwc).toContain("this.sub.on('a32nx_adr_static_air_temperature_1')");
    expect(fwc).toContain('this.autoCallouts.retardAudio,\n      this.thrLeverAboveIdleRetardAudio,');
  });

  it('the new alert codes are used once', () => {
    for (const code of ['7700901', '7700902', '7700911']) {
      expect(fwc.split(`    ${code}: `).length - 1, code).toBe(1);
    }
    for (const code of ['770090101', '770090102', '770090201', '770090202', '770091101', '770091102']) {
      expect(messages.split(`['${code}'`).length - 1, code).toBe(1);
    }
  });
});
