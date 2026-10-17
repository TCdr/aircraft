// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SdPages } from '@shared/EcamSystemPages';
import { AutoThrustMode } from '@shared/autopilot';
import { advisoryPages, AdvisorySdState, EngineAdvisoryInputs, FwsAdvisoryDisplay } from './FwsAdvisories';

const normalEngine: EngineAdvisoryInputs = {
  oilQuantityQt: 15,
  thrustLeverAngle: 20,
  autothrustMode: AutoThrustMode.SPEED,
  oilTemperatureCelsius: 120,
  n1VibrationUnits: 1,
  n2VibrationUnits: 1,
  n3VibrationUnits: 1,
};

function inputs(engine2: Partial<EngineAdvisoryInputs> = {}, cabinVerticalSpeedFtMin = 0) {
  return {
    engines: [normalEngine, { ...normalEngine, ...engine2 }, normalEngine, normalEngine],
    cabinVerticalSpeedFtMin,
  };
}

const flightPhaseMode: AdvisorySdState = {
  selectedPage: SdPages.None,
  alertPageShown: false,
  ewdShowsMemos: true,
  timeMs: 0,
};

describe('ECAM advisory conditions', () => {
  it('has none with all parameters in range', () => {
    expect(advisoryPages(inputs())).toEqual([]);
  });

  it('ENGINE: oil temperature above 163 C, rotor vibration above 5 units, oil quantity below the advisory', () => {
    expect(advisoryPages(inputs({ oilTemperatureCelsius: 164 }))).toEqual([SdPages.Eng]);
    expect(advisoryPages(inputs({ n2VibrationUnits: 5.1 }))).toEqual([SdPages.Eng]);
    expect(advisoryPages(inputs({ oilQuantityQt: 1 }))).toEqual([SdPages.Eng]);
    // the oil quantity advisory is inhibited at TOGA and in reverse
    expect(advisoryPages(inputs({ oilQuantityQt: 1, thrustLeverAngle: 45 }))).toEqual([]);
    // and at a FLEX takeoff and in alpha floor, as on the ENGINE page
    expect(advisoryPages(inputs({ oilQuantityQt: 1, autothrustMode: AutoThrustMode.MAN_FLEX }))).toEqual([]);
    expect(advisoryPages(inputs({ oilQuantityQt: 1, autothrustMode: AutoThrustMode.A_FLOOR }))).toEqual([]);
    // above 177 C the oil temperature is amber (an alert level, not an advisory)
    expect(advisoryPages(inputs({ oilTemperatureCelsius: 180 }))).toEqual([]);
  });

  it('CAB PRESS: cabin vertical speed above 1 800 ft/min, climbing or descending', () => {
    expect(advisoryPages(inputs({}, 1900))).toEqual([SdPages.Press]);
    expect(advisoryPages(inputs({}, -1900))).toEqual([SdPages.Press]);
    expect(advisoryPages(inputs({}, 1500))).toEqual([]);
  });

  it('lists the engines first', () => {
    expect(advisoryPages(inputs({ oilTemperatureCelsius: 170 }, 2000))).toEqual([SdPages.Eng, SdPages.Press]);
  });
});

describe('ECAM advisory display', () => {
  it('shows the page automatically in flight phase mode, its ECP pb on, and ADV on the EWD', () => {
    const display = new FwsAdvisoryDisplay();
    expect(display.update([SdPages.Eng], flightPhaseMode)).toEqual({
      automaticPage: SdPages.Eng,
      litPushbutton: SdPages.Eng,
      ewdAdvIndication: true,
    });
  });

  it('shows no ADV while the EWD shows a procedure', () => {
    const display = new FwsAdvisoryDisplay();
    expect(display.update([SdPages.Eng], { ...flightPhaseMode, ewdShowsMemos: false }).ewdAdvIndication).toBe(false);
  });

  it('flashes the ECP pb of the advisory while the crew has another page selected, until pressed', () => {
    const display = new FwsAdvisoryDisplay();
    const manual = { ...flightPhaseMode, selectedPage: SdPages.Fuel };
    const on = display.update([SdPages.Press], { ...manual, timeMs: 0 });
    const off = display.update([SdPages.Press], { ...manual, timeMs: 500 });
    expect(on.automaticPage).toBe(SdPages.None);
    expect(on.litPushbutton).toBe(SdPages.Press);
    expect(off.litPushbutton).toBe(SdPages.None);
    expect(on.ewdAdvIndication).toBe(true);
    // the crew presses the CAB PRESS pb: the page is selected, no flashing and no ADV any more
    const pressed = display.update([SdPages.Press], { ...manual, selectedPage: SdPages.Press });
    expect(pressed.ewdAdvIndication).toBe(false);
    const back = display.update([SdPages.Press], { ...manual, timeMs: 0 });
    expect(back.litPushbutton).toBe(SdPages.None);
    expect(back.ewdAdvIndication).toBe(false);
  });

  it('shows a new advisory again once the parameter was back in range', () => {
    const display = new FwsAdvisoryDisplay();
    display.update([SdPages.Eng], { ...flightPhaseMode, selectedPage: SdPages.Eng });
    display.update([], flightPhaseMode);
    expect(display.update([SdPages.Eng], flightPhaseMode).ewdAdvIndication).toBe(true);
  });

  it('gives no indication while the SD shows the page of an ECAM alert', () => {
    const display = new FwsAdvisoryDisplay();
    expect(display.update([SdPages.Eng], { ...flightPhaseMode, alertPageShown: true })).toEqual({
      automaticPage: SdPages.None,
      litPushbutton: SdPages.None,
      ewdAdvIndication: false,
    });
  });
});
