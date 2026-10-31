// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderSdElement, sendInstrumentUpdate, withRenderedSdElement } from '../../SdSpecSupport';
import { ApuGenerator as ApuPageGenerator } from '../Apu/elements/ApuGenerator';
import { ApuGenerator } from './elements/ApuGenerator';
import { ElecAcPage } from './ElecAcPage';
import { EmergencyGenerator } from './elements/EmergencyGenerator';
import { EngineGenerator } from './elements/EngineGenerator';
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

/** @returns the class list of the first text element of the rendered SVG whose content is `content` */
function textClass(container: SVGSVGElement, content: string): string | null | undefined {
  return Array.from(container.querySelectorAll('text'))
    .find((text) => text.textContent === content)
    ?.getAttribute('class');
}

/** @returns whether a text element with this content is displayed (not Hide) in the rendered SVG */
function textShown(container: SVGSVGElement, content: string): boolean {
  return Array.from(container.querySelectorAll('text')).some(
    (text) => text.textContent === content && !text.classList.contains('Hide'),
  );
}

const APU_GENERATOR_SIM_VARS = {
  'L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON': 1,
  'APU GENERATOR SWITCH:1': 1,
};

/** Runs the overload confirmation for a constant load over `seconds`, in 100 ms steps */
function loadAmberAfter(loadPercent: number, seconds: number): boolean {
  let duration = 0;
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 100) {
    duration = nextGeneratorOverloadDurationMs(duration, loadPercent, 100);
  }
  return isGeneratorLoadAmber(duration);
}

describe('generator load amber only after 10 s above 108 %', () => {
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

  describe('is shown by the engine, APU and RAT generators of the ELEC AC page and by the APU page', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Renders the generator with an overload of 120 %, lets `seconds` pass and returns the class of the load value */
    function loadClassAfterOverload(element: React.ReactElement, simVars: Record<string, number>, seconds: number) {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const rendered = renderSdElement(element, simVars);
      try {
        for (let elapsed = 0; elapsed < seconds; elapsed++) {
          now += 1000;
          sendInstrumentUpdate(1000);
        }
        return textClass(rendered.container, '120');
      } finally {
        rendered.dispose();
      }
    }

    const generators: [string, React.ReactElement, Record<string, number>][] = [
      [
        'engine generator',
        <EngineGenerator key="eng" x={0} y={0} bus={1} />,
        { 'L:A32NX_ELEC_ENG_GEN_1_LOAD': 120, 'L:A32NX_ELEC_ENG_GEN_1_IDG_IS_CONNECTED': 1 },
      ],
      [
        'APU generator',
        <ApuGenerator key="apu" x={0} y={0} position={1} />,
        { ...APU_GENERATOR_SIM_VARS, 'L:A32NX_ELEC_APU_GEN_1_LOAD': 120 },
      ],
      [
        'APU page generator',
        <ApuPageGenerator key="apupage" x={0} y={0} position={1} />,
        { ...APU_GENERATOR_SIM_VARS, 'L:A32NX_ELEC_APU_GEN_1_LOAD': 120 },
      ],
      [
        'emergency generator',
        <EmergencyGenerator key="emer" x={0} y={0} />,
        { 'L:A32NX_ELEC_EMER_GEN_LOAD': 120, 'L:A32NX_ELEC_CONTACTOR_5XE_IS_CLOSED': 1 },
      ],
    ];

    it.each(generators)('%s: green for a short overload, amber after 10 s', (_name, element, simVars) => {
      expect(loadClassAfterOverload(element, simVars, 5)).toContain('Green');
      expect(loadClassAfterOverload(element, simVars, 11)).toContain('Amber');
    });
  });
});

describe('generator voltage and APU generator frequency', () => {
  it('is normal inside 110 V to 120 V and 390 Hz to 410 Hz', () => {
    expect(isGeneratorVoltageNormal(115)).toBe(true);
    expect(isGeneratorVoltageNormal(105)).toBe(false);
    expect(isGeneratorVoltageNormal(125)).toBe(false);
    expect(isApuGeneratorFrequencyNormal(400)).toBe(true);
    expect(isApuGeneratorFrequencyNormal(380)).toBe(false);
    expect(isApuGeneratorFrequencyNormal(420)).toBe(false);
  });

  it.each([
    ['ELEC AC page', <ApuGenerator key="ac" x={0} y={0} position={1} />],
    ['APU page', <ApuPageGenerator key="apu" x={0} y={0} position={1} />],
  ])('colours the APU generator voltage by the voltage and the frequency by the frequency (%s)', (_page, element) => {
    const colours = (potential: number, frequency: number) =>
      withRenderedSdElement(
        element,
        {
          ...APU_GENERATOR_SIM_VARS,
          'L:A32NX_ELEC_APU_GEN_1_POTENTIAL': potential,
          'L:A32NX_ELEC_APU_GEN_1_FREQUENCY': frequency,
        },
        (container) => ({
          voltage: textClass(container, String(potential))?.includes('Green') ? 'Green' : 'Amber',
          frequency: textClass(container, String(frequency))?.includes('Green') ? 'Green' : 'Amber',
        }),
      );
    expect(colours(115, 400)).toEqual({ voltage: 'Green', frequency: 'Green' });
    expect(colours(130, 400)).toEqual({ voltage: 'Amber', frequency: 'Green' });
    expect(colours(115, 420)).toEqual({ voltage: 'Green', frequency: 'Amber' });
  });
});

describe('engine generator OFF / DISC', () => {
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

  it('is drawn by the engine generator element from the GEN pb and the drive connection', () => {
    const shownOffTexts = (genPbOn: number, driveConnected: number) =>
      withRenderedSdElement(
        <EngineGenerator x={0} y={0} bus={2} />,
        { 'GENERAL ENG MASTER ALTERNATOR:2': genPbOn, 'L:A32NX_ELEC_ENG_GEN_2_IDG_IS_CONNECTED': driveConnected },
        (container) => ['OFF', 'DISC'].filter((content) => textShown(container, content)),
      );
    expect(shownOffTexts(1, 1)).toEqual([]);
    expect(shownOffTexts(0, 1)).toEqual(['OFF']);
    expect(shownOffTexts(1, 0)).toEqual(['DISC']);
  });
});

describe('engine generator OVHT', () => {
  it('appears above 185 C', () => {
    expect(isEngineGeneratorOverheat(90)).toBe(false);
    expect(isEngineGeneratorOverheat(185)).toBe(false);
    expect(isEngineGeneratorOverheat(186)).toBe(true);
  });

  it('is drawn from the drive oil outlet temperature', () => {
    const overheatShown = (oilTemperature: number) =>
      withRenderedSdElement(
        <EngineGenerator x={0} y={0} bus={3} />,
        { 'L:A32NX_ELEC_ENG_GEN_3_IDG_OIL_OUTLET_TEMPERATURE': oilTemperature },
        (container) => textShown(container, 'OVHT'),
      );
    expect(overheatShown(185)).toBe(false);
    expect(overheatShown(186)).toBe(true);
  });
});

describe('GALLEY/COMMERCIAL indication of the ELEC AC page', () => {
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
    const galleyLines = (simVars: Record<string, number>) =>
      withRenderedSdElement(<ElecAcPage />, { 'L:A32NX_OVHD_ELEC_COMMERCIAL_PB_IS_ON': 1, ...simVars }, (container) =>
        Array.from(container.querySelectorAll('g#galley-commercial-indication text')).map((text) => text.textContent),
      );
    expect(galleyLines({})).toEqual([]);
    expect(galleyLines({ 'L:A32NX_ELEC_GALLEY_IS_SHED': 1 })).toEqual(['GALLEY SHED']);
    expect(galleyLines({ 'L:A32NX_ELEC_GALLEY_IS_SHED': 1, 'L:A32NX_ELEC_GALLEY_IS_PARTIALLY_SHED': 1 })).toEqual([
      'GALLEY',
      'PARTIALLY',
      'SHED',
    ]);
    expect(galleyLines({ 'L:A380X_OVHD_ELEC_COMMERCIAL_2_PB_IS_OFF': 1 })).toEqual(['COMMERCIAL', 'PARTIALLY', 'SHED']);
    expect(galleyLines({ 'L:A32NX_OVHD_ELEC_COMMERCIAL_PB_IS_ON': 0 })).toEqual(['COMMERCIAL', 'PARTIALLY', 'SHED']);
  });
});
