// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage, visibleTexts } from '../../Common/SdPageSpecHarness';
import { OilComponent } from '../Crz/Crz';
import { EngPage } from './Eng';
import {
  OIL_QTY_ADVISORY_QT,
  OIL_QTY_SCALE_MAX_QT,
  oilFilterClogShown,
  oilPressureIsRed,
  oilPressurePulses,
  oilQuantityPulses,
  oilTemperatureAdvisorySeconds,
  oilTemperatureAdvisoryTimeExceeded,
  oilTemperatureClassName,
} from './EngOilIndications';

const FADECS_POWERED = { 'L:A32NX_FADEC_POWERED_ENG1': 1, 'L:A32NX_FADEC_POWERED_ENG2': 1 };

/* Oil quantity */
describe('SD ENGINE oil quantity', () => {
  it('pulses below 3.25 QT', () => {
    expect(oilQuantityPulses(false, 3.2)).toBe(true);
    expect(oilQuantityPulses(false, 3.3)).toBe(false);
  });

  it('keeps pulsing until the quantity is back at 4.75 QT', () => {
    expect(oilQuantityPulses(true, 4.5)).toBe(true);
    expect(oilQuantityPulses(true, 4.75)).toBe(false);
  });
});

describe('SD ENGINE oil quantity indication', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  /** Angle of a path drawn by the Needle component, which rotates it from -90 deg (zero) to +90 deg (scale end). */
  const needleAngle = (needle: Element): number =>
    Number(/rotate\((-?[\d.]+)/.exec(needle.getAttribute('transform') ?? '')?.[1]);

  it('reads the FADEC oil quantity in quarts on a 0-22 QT scale, not the MSFS oil quantity', () => {
    page = renderSdPage(<EngPage />, {
      ...FADECS_POWERED,
      'L:A32NX_ENGINE_OIL_QTY:1': OIL_QTY_SCALE_MAX_QT / 2,
      'ENG OIL QUANTITY:1': 20,
    });

    expect(visibleTexts(page, '11.0')).toHaveLength(1);
    expect(visibleTexts(page, '20.0')).toHaveLength(0);
    // the engine 2 needle is hidden at 0 QT: the only shown green needle is the half scale one of engine 1
    const needles = Array.from(page.container.querySelectorAll('path.GreenLine')).filter(
      (needle) => !needle.classList.contains('Hidden'),
    );
    expect(needles).toHaveLength(1);
    expect(needleAngle(needles[0])).toBeCloseTo(0, 5);
  });

  it('draws the amber advisory mark at 3 QT, a little below the 3 QT needle position', () => {
    page = renderSdPage(<EngPage />, {
      ...FADECS_POWERED,
      'L:A32NX_ENGINE_OIL_QTY:1': OIL_QTY_ADVISORY_QT,
    });

    const threeQuartsAngle = -90 + (OIL_QTY_ADVISORY_QT / OIL_QTY_SCALE_MAX_QT) * 180;
    const amberMarks = Array.from(page.container.querySelectorAll('path.AmberLine'));
    expect(amberMarks.length).toBeGreaterThan(0);
    for (const mark of amberMarks) {
      expect(needleAngle(mark)).toBeLessThan(threeQuartsAngle);
      expect(needleAngle(mark)).toBeGreaterThan(threeQuartsAngle - 6);
    }
  });

  it('pulses the oil quantity below 3.25 QT', () => {
    page = renderSdPage(<EngPage />, { ...FADECS_POWERED, 'L:A32NX_ENGINE_OIL_QTY:1': 2 });

    expect(visibleTexts(page, '2.0')[0].classList.contains('FillPulse')).toBe(true);
  });

  it('shows the same FADEC oil quantity on the CRUISE page', () => {
    page = renderSdPage(
      <svg>
        <OilComponent />
      </svg>,
      { 'L:A32NX_ENGINE_OIL_QTY:1': 12.5, 'L:A32NX_ENGINE_OIL_QTY:2': 7, 'ENG OIL QUANTITY:1': 30 },
    );

    const text = (id: string) => page.container.querySelector(`#${id}`)?.textContent;
    expect(text('OilQuantityLeft')).toBe('12.');
    expect(text('OilQuantityLeftDecimal')).toBe('5');
    expect(text('OilQuantityRight')).toBe('7.');
    expect(text('OilQuantityRightDecimal')).toBe('0');
  });
});

/* Oil pressure */
describe('SD ENGINE oil pressure', () => {
  it('is red from 0 to 13 PSI, the ENG OIL LO PR threshold', () => {
    expect(oilPressureIsRed(0)).toBe(true);
    expect(oilPressureIsRed(12.9)).toBe(true);
    expect(oilPressureIsRed(13)).toBe(false);
  });

  it('pulses between 13 and 16 PSI with N2 above 75 %', () => {
    expect(oilPressurePulses(false, 15, 80)).toBe(true);
    expect(oilPressurePulses(false, 15, 70)).toBe(false);
    expect(oilPressurePulses(false, 17, 80)).toBe(false);
  });

  it('stops pulsing above 20 PSI', () => {
    expect(oilPressurePulses(true, 19, 80)).toBe(true);
    expect(oilPressurePulses(true, 21, 80)).toBe(false);
  });

  it('does not pulse in the red range (red instead)', () => {
    expect(oilPressurePulses(true, 10, 80)).toBe(false);
  });

  it('keeps the FBW upper advisory: pulses from 129 PSI until below 126 PSI', () => {
    expect(oilPressurePulses(false, 90, 100)).toBe(false);
    expect(oilPressurePulses(false, 129, 100)).toBe(true);
    expect(oilPressurePulses(true, 127, 100)).toBe(true);
    expect(oilPressurePulses(true, 125, 100)).toBe(false);
  });
});

/* Oil filter CLOG indication */
describe('SD ENGINE oil filter CLOG', () => {
  it('shows CLOG with a clogged filter on a running engine', () => {
    expect(oilFilterClogShown(true, 1)).toBe(true);
  });

  it('does not show CLOG on an engine that is not running, nor without the failure', () => {
    expect(oilFilterClogShown(true, 0)).toBe(false);
    expect(oilFilterClogShown(true, 4)).toBe(false);
    expect(oilFilterClogShown(false, 1)).toBe(false);
  });
});

describe('SD ENGINE oil filter CLOG indication', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  it('draws CLOG below the oil pressure of the engine with the clogged oil filter that is running', () => {
    page = renderSdPage(<EngPage />, {
      ...FADECS_POWERED,
      'GENERAL ENG OIL PRESSURE:1': 14,
      'L:A32NX_ENGINE_1_OIL_FILTER_CLOGGED': 1,
      'L:A32NX_ENGINE_STATE:1': 1,
      // engine 2 clogged but shut down: no CLOG
      'L:A32NX_ENGINE_2_OIL_FILTER_CLOGGED': 1,
      'L:A32NX_ENGINE_STATE:2': 0,
    });

    const clogs = visibleTexts(page, 'CLOG');
    expect(clogs).toHaveLength(1);
    const oilPressure = clogs[0].previousElementSibling;
    expect(oilPressure?.textContent).toBe('14');
    expect(clogs[0].getAttribute('x')).toBe(oilPressure?.getAttribute('x'));
    expect(Number(clogs[0].getAttribute('y'))).toBeGreaterThan(Number(oilPressure?.getAttribute('y')));
  });
});

/* Oil temperature: pulses green between 140 °C and 155 °C for less than 15 min;
   amber between 140 °C and 155 °C for more than 15 min, or above 155 °C. */
describe('SD ENGINE oil temperature', () => {
  /** Runs the advisory timer at a steady temperature for the given time, in 1 s updates as the SD does */
  const secondsAt = (temperature: number, seconds: number, startSeconds = 0): number => {
    let advisorySeconds = startSeconds;
    for (let i = 0; i < seconds; i++) {
      advisorySeconds = oilTemperatureAdvisorySeconds(advisorySeconds, temperature, 1);
    }
    return advisorySeconds;
  };

  it('is green in the normal range', () => {
    expect(oilTemperatureClassName(100, 100, oilTemperatureAdvisoryTimeExceeded(secondsAt(100, 3600)))).toBe(
      'FillGreen',
    );
  });

  it('pulses green between 140 and 155 °C for less than 15 min', () => {
    expect(oilTemperatureClassName(145, 145, oilTemperatureAdvisoryTimeExceeded(secondsAt(145, 14 * 60)))).toBe(
      'FillPulse',
    );
  });

  it('turns amber after more than 15 min at a STEADY 145 °C', () => {
    expect(oilTemperatureClassName(145, 145, oilTemperatureAdvisoryTimeExceeded(secondsAt(145, 15 * 60 + 1)))).toBe(
      'FillAmber',
    );
  });

  it('restarts the 15 min when the temperature goes back below 140 °C', () => {
    const afterDip = secondsAt(135, 1, secondsAt(145, 14 * 60));
    expect(afterDip).toBe(0);
    expect(
      oilTemperatureClassName(145, 145, oilTemperatureAdvisoryTimeExceeded(secondsAt(145, 2 * 60, afterDip))),
    ).toBe('FillPulse');
  });

  it('is amber above 155 °C at once', () => {
    expect(oilTemperatureClassName(155, 156, oilTemperatureAdvisoryTimeExceeded(0))).toBe('FillAmber');
  });
});

describe('SD ENGINE oil temperature indication', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  it('times the advisory on every SD update at a steady temperature: pulsing green, amber after 15 min', () => {
    page = renderSdPage(<EngPage />, { 'L:A32NX_FADEC_POWERED_ENG1': 1, 'GENERAL ENG OIL TEMPERATURE:1': 145 });
    const temperature = () => visibleTexts(page, '145');

    page.update(1000);
    expect(temperature()[0].classList.contains('FillPulse')).toBe(true);
    for (let minute = 0; minute < 14; minute++) {
      page.update(60_000);
    }
    expect(temperature()[0].classList.contains('FillPulse')).toBe(true);

    page.update(60_000);
    expect(temperature()[0].classList.contains('FillAmber')).toBe(true);
  });
});
