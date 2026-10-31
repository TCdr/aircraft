// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage, visibleTexts } from '../../Common/SdPageSpecHarness';
import { PressPage } from './Press';
import {
  cabinAltitudeNeedleClass,
  cabinAltitudePulses,
  cabinAltitudeTextClass,
  cabinVsPulses,
  ventilationIndication,
} from './PressIndications';

/* CAB ALT digital value pulses at or above 8800 ft (resets at 8600 ft), red above
   9550 ft. */
describe('CAB PRESS page CAB ALT', () => {
  it('starts pulsing at 8800 ft', () => {
    expect(cabinAltitudePulses(8750, false)).toBe(false);
    expect(cabinAltitudePulses(8800, false)).toBe(true);
  });

  it('keeps pulsing down to 8600 ft (hysteresis)', () => {
    expect(cabinAltitudePulses(8700, true)).toBe(true);
    expect(cabinAltitudePulses(8650, true)).toBe(true);
    expect(cabinAltitudePulses(8600, true)).toBe(false);
  });

  it('digits: pulsing green, red from 9550 ft', () => {
    expect(cabinAltitudeTextClass(8700, true)).toBe('GreenTextPulse');
    expect(cabinAltitudeTextClass(8700, false)).toBe('Green');
    expect(cabinAltitudeTextClass(9550, true)).toBe('Red');
  });

  it('the needle never pulses', () => {
    expect(cabinAltitudeNeedleClass(9000)).toBe('Green');
    expect(cabinAltitudeNeedleClass(9550)).toBe('Red');
  });
});

/* V/S digital value pulses when V/S > 1750 ft/min (resets at 1650 ft/min). */
describe('CAB PRESS page V/S', () => {
  it('starts pulsing above 1750 ft/min', () => {
    expect(cabinVsPulses(1750, false)).toBe(false);
    expect(cabinVsPulses(1800, false)).toBe(true);
    expect(cabinVsPulses(-1800, false)).toBe(true);
  });

  it('keeps pulsing down to 1650 ft/min (hysteresis)', () => {
    expect(cabinVsPulses(1700, true)).toBe(true);
    expect(cabinVsPulses(1700, false)).toBe(false);
    expect(cabinVsPulses(1650, true)).toBe(false);
  });
});

describe('CAB PRESS page', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  /** The class attribute of the first text element with the given content */
  const textClass = (content: string): string | undefined =>
    Array.from(page.container.querySelectorAll('text'))
      .find((text) => text.textContent === content)
      ?.getAttribute('class') ?? undefined;

  it('pulses the V/S digits from the hysteresis rule: on above 1750, kept down to 1650 ft/min', () => {
    const simVars = { 'L:A32NX_PRESS_MAN_CABIN_VS': 1800 };
    page = renderSdPage(<PressPage />, simVars);
    expect(textClass('1800')).toContain('GreenTextPulse');

    simVars['L:A32NX_PRESS_MAN_CABIN_VS'] = 1700;
    page.update();
    expect(textClass('1700')).toContain('GreenTextPulse');

    simVars['L:A32NX_PRESS_MAN_CABIN_VS'] = 1600;
    page.update();
    expect(textClass('1600')).not.toContain('GreenTextPulse');
  });

  it('pulses the CAB ALT digits from the hysteresis rule: on at 8800, kept down to 8650 ft', () => {
    const simVars = { 'L:A32NX_PRESS_MAN_CABIN_ALTITUDE': 8800 };
    page = renderSdPage(<PressPage />, simVars);
    expect(textClass('8800')).toContain('GreenTextPulse');

    simVars['L:A32NX_PRESS_MAN_CABIN_ALTITUDE'] = 8650;
    page.update();
    expect(textClass('8650')).toContain('GreenTextPulse');

    simVars['L:A32NX_PRESS_MAN_CABIN_ALTITUDE'] = 8600;
    page.update();
    expect(textClass('8600')).not.toContain('GreenTextPulse');
  });

  it('pulses the delta P digits in flight phase 7 above 1.5 PSI and only then', () => {
    const simVars = { 'L:A32NX_PRESS_MAN_CABIN_DELTA_PRESSURE': 1.6, 'L:A32NX_FWC_FLIGHT_PHASE': 7 };
    page = renderSdPage(<PressPage />, simVars);
    const deltaPDigits = () => page.container.querySelector('#DeltaPressure text.Huge')?.getAttribute('class');
    expect(deltaPDigits()).toContain('GreenTextPulse');

    simVars['L:A32NX_FWC_FLIGHT_PHASE'] = 6;
    page.update();
    expect(deltaPDigits()).not.toContain('GreenTextPulse');
  });

  it('pulses no needle: only the digital presentations pulse', () => {
    page = renderSdPage(<PressPage />, {
      'L:A32NX_PRESS_MAN_CABIN_ALTITUDE': 9000,
      'L:A32NX_PRESS_MAN_CABIN_VS': 1800,
      'L:A32NX_PRESS_MAN_CABIN_DELTA_PRESSURE': 1.6,
      'L:A32NX_FWC_FLIGHT_PHASE': 7,
    });

    expect(page.container.querySelector('[class*="Pulse"]:not(text)')).toBeNull();
  });

  it('shows a white VENT alone without fault', () => {
    page = renderSdPage(<PressPage />, {});

    expect(textClass('VENT')).toContain('White');
    expect(visibleTexts(page, 'BLOWER')).toHaveLength(0);
    expect(visibleTexts(page, 'EXTRACT')).toHaveLength(0);
  });

  it('shows an amber BLOWER and VENT from the BLOWER FAULT signal', () => {
    page = renderSdPage(<PressPage />, { 'L:A32NX_VENTILATION_BLOWER_FAULT': 1 });

    expect(textClass('VENT')).toContain('Amber');
    expect(visibleTexts(page, 'BLOWER')).toHaveLength(1);
    expect(visibleTexts(page, 'EXTRACT')).toHaveLength(0);
  });

  it('shows an amber EXTRACT and VENT from the EXTRACT FAULT signal', () => {
    page = renderSdPage(<PressPage />, { 'L:A32NX_VENTILATION_EXTRACT_FAULT': 1 });

    expect(textClass('VENT')).toContain('Amber');
    expect(visibleTexts(page, 'BLOWER')).toHaveLength(0);
    expect(visibleTexts(page, 'EXTRACT')).toHaveLength(1);
  });

  it('shows both BLOWER and EXTRACT on avionics smoke', () => {
    page = renderSdPage(<PressPage />, { 'L:A32NX_SMOKE_AVIONICS_DETECTED': 1 });

    expect(textClass('VENT')).toContain('Amber');
    expect(visibleTexts(page, 'BLOWER')).toHaveLength(1);
    expect(visibleTexts(page, 'EXTRACT')).toHaveLength(1);
  });
});

/* CAB PRESS page BLOWER, VENT and EXTRACT */
describe('CAB PRESS page avionics ventilation', () => {
  it('shows a white VENT alone without fault', () => {
    expect(ventilationIndication(false, false)).toEqual({ ventAmber: false, blowerShown: false, extractShown: false });
  });

  it('shows an amber BLOWER and turns VENT amber on a BLOWER FAULT', () => {
    expect(ventilationIndication(true, false)).toEqual({ ventAmber: true, blowerShown: true, extractShown: false });
  });

  it('shows an amber EXTRACT and turns VENT amber on an EXTRACT FAULT', () => {
    expect(ventilationIndication(false, true)).toEqual({ ventAmber: true, blowerShown: false, extractShown: true });
  });
});
