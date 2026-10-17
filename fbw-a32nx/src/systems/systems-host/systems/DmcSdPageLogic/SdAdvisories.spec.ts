// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SdPages } from '../../../shared/src/SdPages';
import {
  APU_FLAP_OPEN_ADVISORY_SECONDS,
  EngineAdvisoryInputs,
  SdAdvisoryInputs,
  SdAdvisoryMonitor,
} from './SdAdvisories';

const normalEngine: EngineAdvisoryInputs = {
  fadecPowered: true,
  oilPressurePsi: 60,
  n2Percent: 90,
  oilQuantityQt: 15,
  oilTemperatureCelsius: 90,
  n1VibrationUnits: 0.5,
  n2VibrationUnits: 0.6,
};

/** A normal cruise: no advisory */
function normalInputs(overrides: Partial<SdAdvisoryInputs> = {}): SdAdvisoryInputs {
  return {
    fwcFlightPhase: 6,
    engines: [normalEngine, normalEngine],
    idgOilTemperaturesCelsius: [80, 80],
    cabinAltitudeFt: 7000,
    cabinVsFtMin: 0,
    cabinDeltaPsi: 8,
    leftWingFuelKg: 5000,
    rightWingFuelKg: 5000,
    apuEgtCelsius: 20,
    apuEgtCautionCelsius: 642,
    apuStarting: false,
    apuFlapNotClosed: false,
    apuMasterOn: false,
    ...overrides,
  };
}

function engineInputs(engine1: Partial<EngineAdvisoryInputs>): SdAdvisoryInputs['engines'] {
  return [{ ...normalEngine, ...engine1 }, normalEngine];
}

describe('ECAM advisories', () => {
  it('no parameter out of its normal range: no advisory page', () => {
    expect(new SdAdvisoryMonitor().update(normalInputs(), 0.02)).toBe(SdPages.NONE);
  });

  it('ENG: oil quantity below 3.25 QT until back at 4.75 QT, as the ENGINE page pulses it', () => {
    const monitor = new SdAdvisoryMonitor();
    expect(monitor.update(normalInputs({ engines: engineInputs({ oilQuantityQt: 3 }) }), 0.02)).toBe(SdPages.ENG);
    expect(monitor.update(normalInputs({ engines: engineInputs({ oilQuantityQt: 4.5 }) }), 0.02)).toBe(SdPages.ENG);
    expect(monitor.update(normalInputs({ engines: engineInputs({ oilQuantityQt: 4.75 }) }), 0.02)).toBe(SdPages.NONE);
  });

  it('ENG: low oil pressure with N2 above 75 %, high oil pressure, vibration and oil temperature', () => {
    expect(new SdAdvisoryMonitor().update(normalInputs({ engines: engineInputs({ oilPressurePsi: 15 }) }), 0.02)).toBe(
      SdPages.ENG,
    );
    expect(
      new SdAdvisoryMonitor().update(
        normalInputs({ engines: engineInputs({ oilPressurePsi: 15, n2Percent: 60 }) }),
        0.02,
      ),
    ).toBe(SdPages.NONE);
    expect(new SdAdvisoryMonitor().update(normalInputs({ engines: engineInputs({ n1VibrationUnits: 6 }) }), 0.02)).toBe(
      SdPages.ENG,
    );
    expect(
      new SdAdvisoryMonitor().update(normalInputs({ engines: engineInputs({ n2VibrationUnits: 4.3 }) }), 0.02),
    ).toBe(SdPages.ENG);
    expect(
      new SdAdvisoryMonitor().update(normalInputs({ engines: engineInputs({ oilTemperatureCelsius: 141 }) }), 0.02),
    ).toBe(SdPages.ENG);
  });

  it('ENG: the oil temperature advisory ends after 15 min above 140 °C (amber, a caution then)', () => {
    const monitor = new SdAdvisoryMonitor();
    const hot = normalInputs({ engines: engineInputs({ oilTemperatureCelsius: 145 }) });
    expect(monitor.update(hot, 14 * 60)).toBe(SdPages.ENG);
    expect(monitor.update(hot, 2 * 60)).toBe(SdPages.NONE);
  });

  it('ENG: no advisory while the FADEC is not powered (the ENGINE page shows XX)', () => {
    expect(
      new SdAdvisoryMonitor().update(
        normalInputs({ engines: engineInputs({ fadecPowered: false, oilQuantityQt: 2 }) }),
        0.02,
      ),
    ).toBe(SdPages.NONE);
  });

  it('ELEC: IDG oil temperature between 147 and 180 °C', () => {
    expect(new SdAdvisoryMonitor().update(normalInputs({ idgOilTemperaturesCelsius: [80, 150] }), 0.02)).toBe(
      SdPages.ELEC,
    );
    // above 180 °C: amber, the IDG caution
    expect(new SdAdvisoryMonitor().update(normalInputs({ idgOilTemperaturesCelsius: [185, 80] }), 0.02)).toBe(
      SdPages.NONE,
    );
  });

  it('CAB PR: cabin altitude from 8800 ft until 8600 ft, cabin V/S above 1750 ft/min', () => {
    const monitor = new SdAdvisoryMonitor();
    expect(monitor.update(normalInputs({ cabinAltitudeFt: 8790 }), 0.02)).toBe(SdPages.PRESS);
    expect(monitor.update(normalInputs({ cabinAltitudeFt: 8650 }), 0.02)).toBe(SdPages.PRESS);
    expect(monitor.update(normalInputs({ cabinAltitudeFt: 8600 }), 0.02)).toBe(SdPages.NONE);
    expect(new SdAdvisoryMonitor().update(normalInputs({ cabinVsFtMin: -1800 }), 0.02)).toBe(SdPages.PRESS);
  });

  it('CAB PR: delta P above 1.5 PSI in phase 7 only', () => {
    expect(new SdAdvisoryMonitor().update(normalInputs({ fwcFlightPhase: 7, cabinDeltaPsi: 2 }), 0.02)).toBe(
      SdPages.PRESS,
    );
    expect(new SdAdvisoryMonitor().update(normalInputs({ fwcFlightPhase: 6, cabinDeltaPsi: 2 }), 0.02)).toBe(
      SdPages.NONE,
    );
  });

  it('FUEL: wing imbalance above 1 500 kg in phases 2 and 6 only', () => {
    const imbalance = { leftWingFuelKg: 6600, rightWingFuelKg: 5000 };
    expect(new SdAdvisoryMonitor().update(normalInputs(imbalance), 0.02)).toBe(SdPages.FUEL);
    expect(new SdAdvisoryMonitor().update(normalInputs({ ...imbalance, fwcFlightPhase: 2 }), 0.02)).toBe(SdPages.FUEL);
    expect(new SdAdvisoryMonitor().update(normalInputs({ ...imbalance, fwcFlightPhase: 5 }), 0.02)).toBe(SdPages.NONE);
  });

  it('APU: EGT above EGT MAX -33 °C, not during the APU start', () => {
    expect(new SdAdvisoryMonitor().update(normalInputs({ apuEgtCelsius: 650 }), 0.02)).toBe(SdPages.APU);
    expect(new SdAdvisoryMonitor().update(normalInputs({ apuEgtCelsius: 650, apuStarting: true }), 0.02)).toBe(
      SdPages.NONE,
    );
    expect(new SdAdvisoryMonitor().update(normalInputs({ apuEgtCelsius: null }), 0.02)).toBe(SdPages.NONE);
  });

  it('APU: FLAP OPEN 3 min after the MASTER SW is off', () => {
    const monitor = new SdAdvisoryMonitor();
    const flapOpen = normalInputs({ apuFlapNotClosed: true });
    expect(monitor.update(flapOpen, APU_FLAP_OPEN_ADVISORY_SECONDS - 1)).toBe(SdPages.NONE);
    expect(monitor.update(flapOpen, 1)).toBe(SdPages.APU);
    expect(monitor.update(normalInputs({ apuFlapNotClosed: true, apuMasterOn: true }), 0.02)).toBe(SdPages.NONE);
  });

  it('several advisories: the page shown stays while its advisory lasts, else the advisory list order', () => {
    const monitor = new SdAdvisoryMonitor();
    expect(monitor.update(normalInputs({ engines: engineInputs({ oilQuantityQt: 3 }) }), 0.02)).toBe(SdPages.ENG);
    // an ELEC advisory comes in: the ENG page stays
    expect(
      monitor.update(
        normalInputs({ engines: engineInputs({ oilQuantityQt: 3 }), idgOilTemperaturesCelsius: [150, 80] }),
        0.02,
      ),
    ).toBe(SdPages.ENG);
    // the ENG advisory is over: the ELEC page
    expect(monitor.update(normalInputs({ idgOilTemperaturesCelsius: [150, 80] }), 0.02)).toBe(SdPages.ELEC);
    // both new at once: APU first, the order of the advisory list
    expect(
      new SdAdvisoryMonitor().update(normalInputs({ apuEgtCelsius: 650, idgOilTemperaturesCelsius: [150, 80] }), 0.02),
    ).toBe(SdPages.APU);
  });
});
