// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
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

/** The nominal pressures of the TPIS model (a320_systems tyre_pressure.rs) */
const nominal = { mainPsi: 200, nosePsi: 180 };

/** Every tyre at its nominal pressure, then the given changes (index = Tyre) */
function pressures(changes: Partial<Record<Tyre, number | null>> = {}): (number | null)[] {
  return TYRES.map((tyre) => (tyre in changes ? changes[tyre] ?? null : tyre >= Tyre.Nose1 ? 180 : 200));
}

const CLIMB = 6; // between liftoff and engines shutdown
const TAXI = 2; // other cases

describe('TPIS tyres', () => {
  it('reads the L:vars that the TPIS model writes', () => {
    const model = readFileSync(resolve(__dirname, '../../../wasm/systems/a320_systems/src/tyre_pressure.rs'), 'utf-8');
    expect(model).toContain('format!("TPIS_MAIN_{number}_TYRE_PRESSURE")');
    expect(model).toContain('format!("TPIS_NOSE_{number}_TYRE_PRESSURE")');
    expect(model).toContain(`"${MAIN_NOMINAL_PRESSURE_VAR.replace('L:A32NX_', '')}"`);
    expect(model).toContain(`"${NOSE_NOMINAL_PRESSURE_VAR.replace('L:A32NX_', '')}"`);
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

  it('is shown on the SD WHEEL page with the flyPad option only', () => {
    const page = readFileSync(resolve(__dirname, '../../instruments/src/SD/Pages/Wheel/Wheel.tsx'), 'utf-8');
    expect(page).toContain('<TyrePressures />');
    expect(page).toContain('usePersistentProperty(TPIS_INSTALLED_SETTING, TPIS_INSTALLED_DEFAULT)');
    expect(page).toContain("if (tpisInstalled !== '1') {");
    expect(page).toContain('tyrePressureIndication(pressures, nominal, tyre, fwcFlightPhase)');
    expect(page).toContain('PSI');
  });
});
