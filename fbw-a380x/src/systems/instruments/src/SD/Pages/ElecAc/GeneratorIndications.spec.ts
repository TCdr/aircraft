// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  engineGeneratorOffText,
  galleyCommercialIndication,
  isApuGeneratorFrequencyNormal,
  isEngineGeneratorOverheat,
  isGeneratorLoadAmber,
  isGeneratorVoltageNormal,
  LoadSheddingState,
  nextGeneratorOverloadDurationMs,
} from './GeneratorIndications';

const source = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8');

/** Runs the overload confirmation for a constant load over `seconds`, in 100 ms steps */
function loadAmberAfter(loadPercent: number, seconds: number): boolean {
  let duration = 0;
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 100) {
    duration = nextGeneratorOverloadDurationMs(duration, loadPercent, 100);
  }
  return isGeneratorLoadAmber(duration);
}

describe('generator load amber only after 10 s above 108 % (A380 FCOM l.51013, 51097, 51167, 108601)', () => {
  it('stays green during a short overload', () => {
    expect(loadAmberAfter(115, 9)).toBe(false);
    expect(loadAmberAfter(115, 10)).toBe(false);
  });

  it('turns amber when the overload lasts more than 10 s', () => {
    expect(loadAmberAfter(115, 10.5)).toBe(true);
  });

  it('never turns amber at or below 108 %', () => {
    expect(loadAmberAfter(108, 60)).toBe(false);
    expect(loadAmberAfter(80, 60)).toBe(false);
  });

  it('restarts the confirmation when the load comes back to normal', () => {
    let duration = nextGeneratorOverloadDurationMs(0, 115, 9_000);
    duration = nextGeneratorOverloadDurationMs(duration, 100, 100);
    duration = nextGeneratorOverloadDurationMs(duration, 115, 9_000);
    expect(isGeneratorLoadAmber(duration)).toBe(false);
  });

  it('is used by the engine, APU and RAT generators of the ELEC AC page and by the APU page', () => {
    for (const path of [
      './elements/EngineGenerator.tsx',
      './elements/ApuGenerator.tsx',
      './elements/EmergencyGenerator.tsx',
      '../Apu/elements/ApuGenerator.tsx',
    ]) {
      const element = source(path);
      expect(element).toContain('useGeneratorLoadAmber(load)');
      expect(element).not.toContain('load < ');
    }
  });
});

describe('generator voltage and APU generator frequency (A380 FCOM l.51020, 51029, 51104, 108608, 108617)', () => {
  it('is normal inside 110 V to 120 V and 390 Hz to 410 Hz', () => {
    expect(isGeneratorVoltageNormal(115)).toBe(true);
    expect(isGeneratorVoltageNormal(105)).toBe(false);
    expect(isGeneratorVoltageNormal(125)).toBe(false);
    expect(isApuGeneratorFrequencyNormal(400)).toBe(true);
    expect(isApuGeneratorFrequencyNormal(380)).toBe(false);
    expect(isApuGeneratorFrequencyNormal(420)).toBe(false);
  });

  it('colours the APU generator voltage by the voltage and the frequency by the frequency', () => {
    for (const path of ['./elements/ApuGenerator.tsx', '../Apu/elements/ApuGenerator.tsx']) {
      const element = source(path);
      // before, the voltage line was coloured by the frequency check and the frequency line by the voltage check
      expect(element).toMatch(/apuGenVoltageNormal \? 'Green' : 'Amber'[^>]*>\s*\{Math\.round\(potential\)\}/);
      expect(element).toMatch(/apuGenFreqNormal \? 'Green' : 'Amber'[^>]*>\s*\{Math\.round\(frequency\)\}/);
    }
  });
});

describe('engine generator OFF / DISC (A380 FCOM l.51061-51065)', () => {
  it('shows nothing for a generator in operation', () => {
    expect(engineGeneratorOffText(true, true)).toBeNull();
  });

  it('shows OFF for a generator switched off', () => {
    expect(engineGeneratorOffText(false, true)).toBe('OFF');
  });

  it('shows DISC for a drive disconnected from the engine, whatever the GEN pb', () => {
    expect(engineGeneratorOffText(true, false)).toBe('DISC');
    expect(engineGeneratorOffText(false, false)).toBe('DISC');
  });

  it('is drawn by the engine generator element', () => {
    expect(source('./elements/EngineGenerator.tsx')).toContain(
      'engineGeneratorOffText(!!genPushbuttonAuto, !!driveConnected)',
    );
  });
});

describe('engine generator OVHT (A380 FCOM l.51107-51112)', () => {
  it('appears above 185 C', () => {
    expect(isEngineGeneratorOverheat(90)).toBe(false);
    expect(isEngineGeneratorOverheat(185)).toBe(false);
    expect(isEngineGeneratorOverheat(186)).toBe(true);
  });

  it('is drawn from the drive oil outlet temperature', () => {
    const element = source('./elements/EngineGenerator.tsx');
    expect(element).toContain('L:A32NX_ELEC_ENG_GEN_${bus}_IDG_OIL_OUTLET_TEMPERATURE');
    expect(element).toContain('isEngineGeneratorOverheat(');
  });
});

describe('GALLEY/COMMERCIAL indication of the ELEC AC page (A380 FCOM l.51033-51046)', () => {
  const normal: LoadSheddingState = {
    commercial1Off: false,
    commercial2Off: false,
    galleyShed: false,
    galleyPartiallyShed: false,
  };

  it('shows nothing when nothing is shed', () => {
    expect(galleyCommercialIndication(normal)).toEqual([]);
  });

  it('shows COMMERCIAL OFF with both COMMERCIAL pbs OFF', () => {
    expect(
      galleyCommercialIndication({ ...normal, commercial1Off: true, commercial2Off: true, galleyShed: true }),
    ).toEqual(['COMMERCIAL', 'OFF']);
  });

  it('shows COMMERCIAL PARTIALLY SHED with one COMMERCIAL pb OFF', () => {
    expect(galleyCommercialIndication({ ...normal, commercial2Off: true })).toEqual([
      'COMMERCIAL',
      'PARTIALLY',
      'SHED',
    ]);
  });

  it('shows GALLEY SHED when all galleys are shed', () => {
    expect(galleyCommercialIndication({ ...normal, galleyShed: true })).toEqual(['GALLEY SHED']);
    // COMMERCIAL 1 OFF with the GALLEY pb OFF (all galleys shed): GALLEY SHED comes before the partial commercial
    // shedding
    expect(galleyCommercialIndication({ ...normal, commercial1Off: true, galleyShed: true })).toEqual(['GALLEY SHED']);
  });

  it('shows COMMERCIAL PARTIALLY SHED with one COMMERCIAL pb OFF and its cabin side galleys shed', () => {
    // systems.wasm sheds the galleys of one cabin side per COMMERCIAL pb: some galleys shed
    expect(
      galleyCommercialIndication({ ...normal, commercial1Off: true, galleyShed: true, galleyPartiallyShed: true }),
    ).toEqual(['COMMERCIAL', 'PARTIALLY', 'SHED']);
  });

  it('shows GALLEY PARTIALLY SHED when only some galleys are shed', () => {
    expect(galleyCommercialIndication({ ...normal, galleyShed: true, galleyPartiallyShed: true })).toEqual([
      'GALLEY',
      'PARTIALLY',
      'SHED',
    ]);
  });

  it('is drawn on the ELEC AC page from the shedding L:vars', () => {
    const element = source('./elements/GalleyCommercialIndication.tsx');
    expect(source('./ElecAcPage.tsx')).toContain('<GalleyCommercialIndication');
    expect(element).toContain('L:A32NX_ELEC_GALLEY_IS_PARTIALLY_SHED');
    expect(element).toContain('L:A380X_OVHD_ELEC_COMMERCIAL_2_PB_IS_OFF');
    expect(element).toContain('galleyCommercialIndication(');
  });
});
