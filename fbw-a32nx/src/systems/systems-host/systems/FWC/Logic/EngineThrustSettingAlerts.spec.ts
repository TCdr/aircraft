// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { installFwcSimVarMocks, noComputedDataWord, normalWord, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, plainText, setOnGround, startCruiseFwc } from '../FwcAlertProbe';
import {
  SAT_ABOVE_FLEX_TEMP_PHASE_INHIBITION,
  THR_LEVER_ABV_IDLE_PHASE_INHIBITION,
  ThrustLeverAboveIdleMonitor,
  isSatAboveFlexTemp,
} from './EngineThrustSettingAlerts';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

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

/* ENG 1(2) THR LEVER ABV IDLE */
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

  it('sounds the repetitive RETARD-RETARD above 40 kt only', () => {
    const monitor = monitorAfter({ phase: 8, tla: [CLIMB, REVERSE] });
    expect(monitor.isRetardCalloutRequired(60)).toBe(true);
    expect(monitor.isRetardCalloutRequired(30)).toBe(false);
    expect(monitorAfter({ phase: 8, tla: [IDLE, REVERSE] }).isRetardCalloutRequired(60)).toBe(false);
  });

  it('is inhibited in the aircraft flight phases', () => {
    expect(THR_LEVER_ABV_IDLE_PHASE_INHIBITION).toEqual([1, 5, 10]);
  });
});

/* ENG SAT ABOVE FLEX TEMP */
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

  it('is shown in flight phase 2 only', () => {
    expect(SAT_ABOVE_FLEX_TEMP_PHASE_INHIBITION).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('the real FWC: thrust setting alerts', () => {
  const THR_LEVER_ABV_IDLE = [
    ['7700901', 1, '770090101', '770090102'],
    ['7700902', 2, '770090201', '770090202'],
  ] as const;
  const SAT_ABOVE_FLEX_TEMP_KEY = '7700911';
  const LANDING_ROLL_PHASE = 8;
  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
  });

  /** The landing roll with the lever of the given engine above idle and the other lever in reverse */
  const landingRollWithLeverAboveIdle = (engine: 1 | 2) => () => {
    setOnGround(simvars);
    simvars.set('L:A32NX_FWC_FLIGHT_PHASE', LANDING_ROLL_PHASE);
    simvars.set(`L:A32NX_AUTOTHRUST_TLA:${engine}`, CLIMB);
    simvars.set(`L:A32NX_AUTOTHRUST_TLA:${3 - engine}`, REVERSE);
  };

  it.each(THR_LEVER_ABV_IDLE)(
    '%s is a red ENG warning of engine %i with the title %s and the lever line %s',
    (key, engine, title, line) => {
      const { fwc } = startCruiseFwc(simvars, landingRollWithLeverAboveIdle(engine));
      const item = failureItem(fwc, key);
      expect(item.failure).toBe(3);
      expect(item.sysPage).toBe(EcamSysPage.NONE);
      expect(item.flightPhaseInhib).toEqual(THR_LEVER_ABV_IDLE_PHASE_INHIBITION);
      expect(item.codesToReturn).toEqual([title, line]);
      expect(isAlertTriggered(fwc, key)).toBe(true);
      expect(isAlertTriggered(fwc, engine === 1 ? '7700902' : '7700901')).toBe(false);
      expect(formatEwdMessages(item.codesToReturn).map(plainText)).toEqual([
        `ENG ${engine} THR LEVER ABV IDLE`,
        `-THR LEVER ${engine}.......IDLE`,
      ]);
    },
  );

  it('plays the RETARD voice of THR LEVER ABV IDLE above 40 kt', () => {
    const { fwc, bus } = startCruiseFwc(simvars, landingRollWithLeverAboveIdle(1));
    const soundManager = (fwc as any).soundManager;
    const handleSoundCondition = vi.spyOn(soundManager, 'handleSoundCondition');
    bus.getPublisher<any>().pub('a32nx_adr_computed_airspeed_1', normalWord(60), false, true);
    runFwc(fwc, 1);
    expect(handleSoundCondition).toHaveBeenCalledWith('retard_continuous', true);
  });

  it('7700911 is the amber ENG SAT ABOVE FLEX TEMP caution with T.O DATA CHECK, raised by the FLEX TEMP and an ADR SAT', () => {
    const { fwc, bus } = startCruiseFwc(simvars);
    const item = failureItem(fwc, SAT_ABOVE_FLEX_TEMP_KEY);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual(SAT_ABOVE_FLEX_TEMP_PHASE_INHIBITION);
    expect(item.codesToReturn).toEqual(['770091101', '770091102']);
    expect(formatEwdMessages(item.codesToReturn).map(plainText)).toEqual([
      'ENG SAT ABOVE FLEX TEMP',
      '-T.O DATA.........CHECK',
    ]);
    expect(isAlertTriggered(fwc, SAT_ABOVE_FLEX_TEMP_KEY)).toBe(false);

    simvars.set('L:A32NX_AIRLINER_TO_FLEX_TEMP', 25);
    bus.getPublisher<any>().pub('a32nx_adr_static_air_temperature_1', normalWord(30), false, true);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, SAT_ABOVE_FLEX_TEMP_KEY)).toBe(true);

    // ADR 1 loses its SAT: the SAT of ADR 2, the first ADR with a valid one, is used
    bus.getPublisher<any>().pub('a32nx_adr_static_air_temperature_1', noComputedDataWord(), false, true);
    bus.getPublisher<any>().pub('a32nx_adr_static_air_temperature_2', normalWord(30), false, true);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, SAT_ABOVE_FLEX_TEMP_KEY)).toBe(true);

    // ... and it clears when that SAT is below the FLEX TEMP
    bus.getPublisher<any>().pub('a32nx_adr_static_air_temperature_2', normalWord(10), false, true);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, SAT_ABOVE_FLEX_TEMP_KEY)).toBe(false);
  });
});
