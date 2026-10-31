// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage, visibleTexts } from '../../Common/SdPageSpecHarness';
import { EngPage } from './Eng';

/** Both FADECs powered, so the page shows values instead of XX. */
const FADECS_POWERED = { 'L:A32NX_FADEC_POWERED_ENG1': 1, 'L:A32NX_FADEC_POWERED_ENG2': 1 };

describe('SD ENG page N2', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  // The oil pressure and bleed pressure indications use the N2 the FADEC shows on the E/WD. The MSFS N2 of a seized
  // engine (engine failures, a320_systems engine_failure.rs) still windmills while the FADEC shows the core stopped.
  it('pulses the low oil pressure advisory from the FADEC N2', () => {
    page = renderSdPage(<EngPage />, {
      ...FADECS_POWERED,
      'GENERAL ENG OIL PRESSURE:1': 14,
      'L:A32NX_ENGINE_N2:1': 80,
    });

    const oilPressure = visibleTexts(page, '14');
    expect(oilPressure).toHaveLength(1);
    expect(oilPressure[0].classList.contains('FillPulse')).toBe(true);
  });

  it('ignores the MSFS N2 of an engine whose FADEC N2 is zero', () => {
    page = renderSdPage(<EngPage />, {
      ...FADECS_POWERED,
      'GENERAL ENG OIL PRESSURE:1': 14,
      'L:A32NX_ENGINE_N2:1': 0,
      'ENG N2 RPM:1': 80,
      'TURB ENG CORRECTED N2:1': 80,
    });

    expect(visibleTexts(page, '14')[0].classList.contains('FillPulse')).toBe(false);
  });

  it('turns the bleed pressure amber below 21 PSI with the starter valve open and the FADEC N2 at 10 % or more', () => {
    page = renderSdPage(<EngPage />, {
      ...FADECS_POWERED,
      'L:A32NX_PNEU_ENG_1_REGULATED_TRANSDUCER_PRESSURE': 10,
      'L:A32NX_PNEU_ENG_1_STARTER_VALVE_OPEN': 1,
      'L:A32NX_ENGINE_N2:1': 50,
    });
    expect(visibleTexts(page, '10')[0].classList.contains('FillAmber')).toBe(true);
    page.unmount();

    page = renderSdPage(<EngPage />, {
      ...FADECS_POWERED,
      'L:A32NX_PNEU_ENG_1_REGULATED_TRANSDUCER_PRESSURE': 10,
      'L:A32NX_PNEU_ENG_1_STARTER_VALVE_OPEN': 1,
      'L:A32NX_ENGINE_N2:1': 0,
      'ENG N2 RPM:1': 50,
    });
    expect(visibleTexts(page, '10')[0].classList.contains('FillGreen')).toBe(true);
  });
});

describe('SD ENG page vibrations', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  // MSFS has one vibration value per engine; the systems WASM (a320_systems engine_malfunction.rs) gives N1 and N2 their own.
  it('shows the separate N1 and N2 vibrations of the systems WASM of each engine', () => {
    page = renderSdPage(<EngPage />, {
      ...FADECS_POWERED,
      'L:A32NX_ENGINE_1_N1_VIBRATION': 1.1,
      'L:A32NX_ENGINE_1_N2_VIBRATION': 2.2,
      'L:A32NX_ENGINE_2_N1_VIBRATION': 3.3,
      'L:A32NX_ENGINE_2_N2_VIBRATION': 4.4,
      'TURB ENG VIBRATION:1': 9.9,
      'TURB ENG VIBRATION:2': 8.8,
    });

    for (const shown of ['1.1', '2.2', '3.3', '4.4']) {
      expect(visibleTexts(page, shown)).toHaveLength(1);
    }
    expect(visibleTexts(page, '9.9')).toHaveLength(0);
    expect(visibleTexts(page, '8.8')).toHaveLength(0);
  });
});
