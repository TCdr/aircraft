// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
// The harness comes first: it creates the root element the React instrument framework looks for when it loads
import { renderSdPage, RenderedSdPage } from '../../instruments/src/SD/Common/SdPageSpecHarness';
import React from 'react';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WheelPage } from '../../instruments/src/SD/Pages/Wheel/Wheel';
import {
  axleMate,
  isTyrePressureAbnormal,
  MAIN_NOMINAL_PRESSURE_VAR,
  NOSE_NOMINAL_PRESSURE_VAR,
  TPIS_INSTALLED_DEFAULT,
  TPIS_INSTALLED_SETTING,
  Tyre,
  tyrePressureIndication,
  tyrePressureVar,
  TYRES,
} from './TyrePressures';

/** Round nominal pressures that keep the percentage arithmetic readable (the TPIS model writes the published ones) */
const nominal = { mainPsi: 200, nosePsi: 180 };

/** Every tyre at its nominal pressure, then the given changes (index = Tyre) */
function pressures(changes: Partial<Record<Tyre, number | null>> = {}): (number | null)[] {
  return TYRES.map((tyre) => (tyre in changes ? changes[tyre] ?? null : tyre >= Tyre.Nose1 ? 180 : 200));
}

const CLIMB = 6; // between liftoff and engines shutdown
const TAXI = 2; // other cases

describe('TPIS tyres', () => {
  // Needs a different kind of test (a Rust test of the model): the names are written by the Rust model
  it('reads the L:vars that the TPIS model writes (Rust model source)', () => {
    const model = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems/src/tyre_pressure.rs'), 'utf-8');
    expect(model).toContain('format!("TPIS_MAIN_{number}_TYRE_PRESSURE")');
    expect(model).toContain('format!("TPIS_NOSE_{number}_TYRE_PRESSURE")');
    expect(model).toContain(`"${MAIN_NOMINAL_PRESSURE_VAR.replace('L:A32NX_', '')}"`);
    expect(model).toContain(`"${NOSE_NOMINAL_PRESSURE_VAR.replace('L:A32NX_', '')}"`);
  });

  it('names the L:vars of the six tyres', () => {
    expect(TYRES.map(tyrePressureVar)).toEqual([
      'L:A32NX_TPIS_MAIN_1_TYRE_PRESSURE',
      'L:A32NX_TPIS_MAIN_2_TYRE_PRESSURE',
      'L:A32NX_TPIS_MAIN_3_TYRE_PRESSURE',
      'L:A32NX_TPIS_MAIN_4_TYRE_PRESSURE',
      'L:A32NX_TPIS_NOSE_1_TYRE_PRESSURE',
      'L:A32NX_TPIS_NOSE_2_TYRE_PRESSURE',
    ]);
  });

  it('pairs the tyres of each axle: main 1-2, main 3-4, nose 1-2', () => {
    expect(TYRES.map(axleMate)).toEqual([Tyre.Main2, Tyre.Main1, Tyre.Main4, Tyre.Main3, Tyre.Nose2, Tyre.Nose1]);
  });

  it('is an aircraft option, not installed by default', () => {
    expect(TPIS_INSTALLED_SETTING).toBe('CONFIG_A32NX_TPIS_INSTALLED');
    expect(TPIS_INSTALLED_DEFAULT).toBe('0');
  });

  // Needs a different kind of test (an EFB test): the flyPad option page lives in fbw-common and repeats the key
  it('is switched by the flyPad aircraft option page and listed in the EFB option set', () => {
    const efbPage = readFileSync(
      resolve(
        __dirname,
        '../../../../../fbw-common/src/systems/instruments/src/EFB/Settings/Pages/AircraftOptionsPinProgramsPage.tsx',
      ),
      'utf-8',
    );
    expect(efbPage).toContain(`const A32NX_TPIS_INSTALLED_SETTING = '${TPIS_INSTALLED_SETTING}';`);
    expect(efbPage).toContain(`usePersistentProperty(A32NX_TPIS_INSTALLED_SETTING, '${TPIS_INSTALLED_DEFAULT}')`);
    const efb = readFileSync(resolve(__dirname, '../../instruments/src/EFB/index.tsx'), 'utf-8');
    expect(efb).toContain('tpis: true');
  });
});

describe('tyre low pressure rule', () => {
  it('uses 74 % of the nominal pressure between liftoff and engines shutdown (FWC phases 5 to 9)', () => {
    // main: 148 PSI, nose: 133.2 PSI
    for (const phase of [5, 6, 7, 8, 9]) {
      expect(
        isTyrePressureAbnormal(pressures({ [Tyre.Main1]: 148, [Tyre.Main2]: 148 }), nominal, Tyre.Main1, phase),
      ).toBe(false);
      expect(
        isTyrePressureAbnormal(pressures({ [Tyre.Main1]: 147.9, [Tyre.Main2]: 147.9 }), nominal, Tyre.Main1, phase),
      ).toBe(true);
    }
    expect(
      isTyrePressureAbnormal(pressures({ [Tyre.Nose2]: 133.1, [Tyre.Nose1]: 133.1 }), nominal, Tyre.Nose2, CLIMB),
    ).toBe(true);
  });

  it('uses 89 % of the nominal pressure in the other cases (phases 1 to 4 and 10)', () => {
    // main: 178 PSI, nose: 160.2 PSI
    for (const phase of [1, 2, 3, 4, 10]) {
      expect(
        isTyrePressureAbnormal(pressures({ [Tyre.Main4]: 178, [Tyre.Main3]: 178 }), nominal, Tyre.Main4, phase),
      ).toBe(false);
      expect(
        isTyrePressureAbnormal(pressures({ [Tyre.Main4]: 177.9, [Tyre.Main3]: 177.9 }), nominal, Tyre.Main4, phase),
      ).toBe(true);
    }
    expect(
      isTyrePressureAbnormal(pressures({ [Tyre.Nose1]: 160.3, [Tyre.Nose2]: 160.3 }), nominal, Tyre.Nose1, TAXI),
    ).toBe(false);
  });

  it('flags both tyres of an axle whose difference is above 21 % (liftoff to shutdown) or 15 % of nominal', () => {
    // 15 % of 200 = 30 PSI, 21 % = 42 PSI; the lower tyre stays above its low limit
    const taxiDiff = pressures({ [Tyre.Main2]: 230, [Tyre.Main1]: 199.9 });
    expect(isTyrePressureAbnormal(taxiDiff, nominal, Tyre.Main1, TAXI)).toBe(true);
    expect(isTyrePressureAbnormal(taxiDiff, nominal, Tyre.Main2, TAXI)).toBe(true);
    expect(isTyrePressureAbnormal(taxiDiff, nominal, Tyre.Main3, TAXI)).toBe(false);
    expect(isTyrePressureAbnormal(pressures({ [Tyre.Main2]: 230, [Tyre.Main1]: 200 }), nominal, Tyre.Main1, TAXI)).toBe(
      false,
    );
    expect(isTyrePressureAbnormal(taxiDiff, nominal, Tyre.Main1, CLIMB)).toBe(false);
    expect(
      isTyrePressureAbnormal(pressures({ [Tyre.Main2]: 200, [Tyre.Main1]: 157.9 }), nominal, Tyre.Main2, CLIMB),
    ).toBe(true);
  });

  it('gives no rule without valid data or before the nominal pressures are known', () => {
    expect(isTyrePressureAbnormal(pressures({ [Tyre.Main1]: null }), nominal, Tyre.Main1, TAXI)).toBe(false);
    expect(isTyrePressureAbnormal(pressures({ [Tyre.Main1]: null }), nominal, Tyre.Main2, TAXI)).toBe(false);
    expect(isTyrePressureAbnormal(pressures({ [Tyre.Main1]: 0 }), { mainPsi: 0, nosePsi: 0 }, Tyre.Main1, TAXI)).toBe(
      false,
    );
  });
});

describe('WHEEL page tyre pressure indication', () => {
  it('shows the pressure in green when normal, rounded to 1 PSI', () => {
    expect(tyrePressureIndication(pressures({ [Tyre.Nose1]: 165.4 }), nominal, Tyre.Nose1, TAXI)).toEqual({
      text: '165',
      amber: false,
    });
  });

  it('shows the pressure in amber with the WHEEL TYRE LO PR condition', () => {
    expect(tyrePressureIndication(pressures({ [Tyre.Main3]: 20 }), nominal, Tyre.Main3, CLIMB)).toEqual({
      text: '20',
      amber: true,
    });
  });

  it('shows amber XX when the TPIS data is not valid (DC BUS 1 lost)', () => {
    expect(tyrePressureIndication(pressures({ [Tyre.Main2]: null }), nominal, Tyre.Main2, TAXI)).toEqual({
      text: 'XX',
      amber: true,
    });
  });

  describe('on the SD WHEEL page', () => {
    let page: RenderedSdPage;
    afterEach(() => {
      page?.unmount();
      vi.unstubAllGlobals();
    });

    /** The flyPad option is a persistent setting of the aircraft (the sim data store, key prefixed with the aircraft) */
    const setTpisOption = (value: string) => {
      vi.stubGlobal('GetStoredData', (key: string) => (key === `A32NX_${TPIS_INSTALLED_SETTING}` ? value : ''));
    };

    const normalWord = (psi: number) => Arinc429Word.getRawWord(psi, Arinc429SignStatusMatrix.NormalOperation);
    const tpisSimVars = (phase: number, main1Psi: number) => ({
      'L:A32NX_FWC_FLIGHT_PHASE': phase,
      [MAIN_NOMINAL_PRESSURE_VAR]: 200,
      [NOSE_NOMINAL_PRESSURE_VAR]: 180,
      [tyrePressureVar(Tyre.Main1)]: normalWord(main1Psi),
      [tyrePressureVar(Tyre.Main2)]: normalWord(200),
      [tyrePressureVar(Tyre.Main3)]: normalWord(200),
      [tyrePressureVar(Tyre.Main4)]: normalWord(200),
      [tyrePressureVar(Tyre.Nose1)]: normalWord(180),
      [tyrePressureVar(Tyre.Nose2)]: normalWord(180),
    });
    const textElements = (content: string) =>
      Array.from(page.container.querySelectorAll('text')).filter((text) => text.textContent === content);

    it('shows nothing with the flyPad option off', () => {
      setTpisOption('0');
      page = renderSdPage(<WheelPage />, tpisSimVars(TAXI, 200));
      expect(textElements('PSI')).toHaveLength(0);
    });

    it('shows the pressures in green with PSI under each gear with the flyPad option on', () => {
      setTpisOption('1');
      page = renderSdPage(<WheelPage />, tpisSimVars(TAXI, 200));
      expect(textElements('PSI')).toHaveLength(3);
      expect(textElements('200')).toHaveLength(4);
      expect(textElements('180')).toHaveLength(2);
      expect(textElements('200').every((text) => text.classList.contains('Green'))).toBe(true);
    });

    it('shows a low tyre pressure in amber, with the limit of the flight phase', () => {
      setTpisOption('1');
      // 160 PSI is above 74 % of 200 PSI (in flight), below 89 % (on ground)
      page = renderSdPage(<WheelPage />, tpisSimVars(CLIMB, 160));
      expect(textElements('160')[0].classList.contains('Amber')).toBe(false);
      page.unmount();
      page = renderSdPage(<WheelPage />, tpisSimVars(TAXI, 160));
      expect(textElements('160')[0].classList.contains('Amber')).toBe(true);
    });
  });
});
