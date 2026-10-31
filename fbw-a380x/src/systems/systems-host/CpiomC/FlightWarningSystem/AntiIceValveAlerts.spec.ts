// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  ANTI_ICE_VALVE_ALERT_IDS,
  ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS,
  AntiIceValveAlerts,
  AntiIceValveInputs,
  isWingAntiIceFailedAfterPressLo,
  WingBleedControls,
  wingPressLoLines,
  wingValveOpenLines,
} from './AntiIceValveAlerts';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws } from './FwsSpecFixture';

const noWingFlag = { abnormallyClosed: false, abnormallyOpen: false, lowPressure: false, highPressure: false };

function inputs(changes: Partial<AntiIceValveInputs> = {}): AntiIceValveInputs {
  return {
    engines: [1, 2, 3, 4].map(() => ({ pbOn: false, valveOpen: false, engineRunning: true, monitoringLost: false })),
    wings: [noWingFlag, noWingFlag],
    engineBleedPbAuto: [true, true, true, true],
    ...changes,
  };
}

function alertsAfter(input: AntiIceValveInputs, seconds: number): AntiIceValveAlerts {
  const alerts = new AntiIceValveAlerts();
  for (let t = 0; t < seconds * 10; t += 1) {
    alerts.update(input, 0.1);
  }
  return alerts;
}

describe('A-ICE ENG 1(2)(3)(4) VLV CLOSED', () => {
  const engine3PbOnValveClosed = (engineRunning: boolean) =>
    inputs({
      engines: [1, 2, 3, 4].map((engine) => ({
        pbOn: engine === 3,
        valveOpen: false,
        engineRunning,
        monitoringLost: false,
      })),
    });

  it('triggers when the valve of a running engine stays closed with its pb ON', () => {
    const alerts = alertsAfter(engine3PbOnValveClosed(true), ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS + 1);
    expect(alerts.engineValveClosed.map((alert) => alert.get())).toEqual([false, false, true, false]);
  });

  it('does not trigger while the valve transits', () => {
    const alerts = alertsAfter(engine3PbOnValveClosed(true), ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS - 1);
    expect(alerts.engineValveClosed[2].get()).toBe(false);
  });

  it('does not trigger before the engine runs (no air to open the valve)', () => {
    const alerts = alertsAfter(engine3PbOnValveClosed(false), 60);
    expect(alerts.engineValveClosed[2].get()).toBe(false);
  });
});

describe('A-ICE ENG 1(2)(3)(4) VLV OPEN', () => {
  it('triggers when a valve stays open with its pb OFF', () => {
    const input = inputs({
      engines: [1, 2, 3, 4].map((engine) => ({
        pbOn: false,
        valveOpen: engine === 1,
        engineRunning: true,
        monitoringLost: false,
      })),
    });
    const alerts = alertsAfter(input, ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS + 1);
    expect(alerts.engineValveOpen.map((alert) => alert.get())).toEqual([true, false, false, false]);
    expect(alerts.engineValveClosed.map((alert) => alert.get())).toEqual([false, false, false, false]);
  });
});

describe('A-ICE ENG VLV CLOSED and OPEN without the valve position monitoring', () => {
  it('do not trigger: the AICU no longer knows the valve position', () => {
    const input = inputs({
      engines: [1, 2, 3, 4].map((engine) => ({
        pbOn: engine === 2,
        valveOpen: engine === 4,
        engineRunning: true,
        monitoringLost: true,
      })),
    });
    const alerts = alertsAfter(input, ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS + 1);
    expect(alerts.engineValveClosed.map((alert) => alert.get())).toEqual([false, false, false, false]);
    expect(alerts.engineValveOpen.map((alert) => alert.get())).toEqual([false, false, false, false]);
  });
});

/* A-ICE L(R) WING VLV CLOSED / OPEN / PRESS HI / PRESS LO, on the AICU monitoring of the systems model */
describe('A-ICE L(R) WING VLV alerts', () => {
  it('follow the AICU monitoring flags of their wing after the confirmation time', () => {
    const input = inputs({
      wings: [
        { abnormallyClosed: true, abnormallyOpen: false, lowPressure: true, highPressure: false },
        { abnormallyClosed: false, abnormallyOpen: true, lowPressure: false, highPressure: true },
      ],
    });
    const alerts = alertsAfter(input, ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS + 1);
    expect(alerts.wingValveClosed.map((alert) => alert.get())).toEqual([true, false]);
    expect(alerts.wingValvePressLo.map((alert) => alert.get())).toEqual([true, false]);
    expect(alerts.wingValveOpen.map((alert) => alert.get())).toEqual([false, true]);
    expect(alerts.wingValvePressHi.map((alert) => alert.get())).toEqual([false, true]);

    const transit = alertsAfter(input, ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS - 1);
    expect(transit.wingValveClosed[0].get()).toBe(false);
    expect(transit.wingValveOpen[1].get()).toBe(false);
  });
});

describe('A-ICE L(R) WING VLV OPEN lines', () => {
  const controls: WingBleedControls = {
    onGround: true,
    beforeTakeoff: true,
    crossBleedShut: false,
    crossBleedAuto: true,
    packOn: true,
    firstEngineBleedOn: true,
    secondEngineBleedOn: true,
    apuBleedOn: true,
  };

  it('closes the bleed sources of the wing before takeoff, with APU BLEED OFF for the left wing only', () => {
    expect(wingValveOpenLines(controls, true).show).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(wingValveOpenLines(controls, false).show[4]).toBe(false);
    expect(wingValveOpenLines({ ...controls, beforeTakeoff: false }, true).show[5]).toBe(false);
  });

  it('checks the items as the crew closes the bleed sources', () => {
    const closed = { ...controls, crossBleedShut: true, crossBleedAuto: false, packOn: false, apuBleedOn: false };
    const checked = wingValveOpenLines(
      { ...closed, firstEngineBleedOn: false, secondEngineBleedOn: false },
      true,
    ).checked;
    expect(checked.slice(0, 5)).toEqual([true, true, true, true, true]);
  });

  it('turns all bleed systems on again in flight', () => {
    const inFlight = { ...controls, onGround: false, beforeTakeoff: false, crossBleedAuto: false, packOn: false };
    const lines = wingValveOpenLines(inFlight, true);
    expect(lines.show).toEqual([false, false, false, false, false, false, true, true, true, true]);
    expect(lines.checked.slice(6)).toEqual([true, true, false, false]);
  });
});

describe('A-ICE L(R) WING VLV PRESS LO lines', () => {
  it('shows WING A-ICE OFF on ground, THRUST INCREASE then IF NOT SUCCESSFUL in flight', () => {
    expect(wingPressLoLines(true, true)).toEqual({
      show: [true, true, false, false, false, false],
      checked: [false, false, false, false, false, false],
    });
    expect(wingPressLoLines(false, false)).toEqual({
      show: [false, false, true, true, true, true],
      checked: [true, false, false, false, true, false],
    });
  });

  it('makes WING A-ICE inoperative on ground, or in flight once IF NOT SUCCESSFUL is validated', () => {
    expect(isWingAntiIceFailedAfterPressLo(true, [])).toBe(true);
    expect(isWingAntiIceFailedAfterPressLo(false, [false, false, true, false])).toBe(false);
    expect(isWingAntiIceFailedAfterPressLo(false, [false, false, true, true])).toBe(true);
  });
});

describe('A-ICE valve alert definitions', () => {
  const procedureItems = (id: string) => EcamAbnormalProcedures[id].items.length;

  it('defines every alert, with as many items as its lines', () => {
    const ids = ([] as string[]).concat(...Object.values(ANTI_ICE_VALVE_ALERT_IDS));
    expect(new Set(ids).size).toBe(16);
    ANTI_ICE_VALVE_ALERT_IDS.engineValveClosed.forEach((id) => expect(procedureItems(id)).toBe(1));
    ANTI_ICE_VALVE_ALERT_IDS.engineValveOpen.forEach((id) => expect(procedureItems(id)).toBe(0));
    ANTI_ICE_VALVE_ALERT_IDS.wingValveClosed.forEach((id) => expect(procedureItems(id)).toBe(2));
    ANTI_ICE_VALVE_ALERT_IDS.wingValveOpen.forEach((id) => expect(procedureItems(id)).toBe(10));
    ANTI_ICE_VALVE_ALERT_IDS.wingPressHi.forEach((id) => expect(procedureItems(id)).toBe(0));
    ANTI_ICE_VALVE_ALERT_IDS.wingPressLo.forEach((id) => expect(procedureItems(id)).toBe(6));
  });

  it('adds the alerts to the FWS abnormal sensed alerts', () => {
    const { core } = createFws();
    const ids = ([] as string[]).concat(...Object.values(ANTI_ICE_VALVE_ALERT_IDS));
    ids.forEach((id) => expect(core.abnormalSensed.ewdAbnormalSensed[id]).toBeDefined());
  });
});
