// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { metricAltSelMetres } from './MetricAltSel';

// A320 FCOM DSC-31-20, a320_fcom.txt l.46264-46277: G LOAD - ALT SEL area of the lower SD
describe('A32NX SD metric FCU selected altitude', () => {
  it('shows the FCU selected altitude in metres when METRIC ALT is selected', () => {
    expect(metricAltSelMetres({ metricAltSelected: true, selectedAltitudeFt: 35000, gLoadShown: false })).toBe(10670);
    expect(metricAltSelMetres({ metricAltSelected: true, selectedAltitudeFt: 5000, gLoadShown: false })).toBe(1520);
  });

  it('shows nothing without METRIC ALT', () => {
    expect(metricAltSelMetres({ metricAltSelected: false, selectedAltitudeFt: 35000, gLoadShown: false })).toBeNull();
    expect(metricAltSelMetres({ metricAltSelected: null, selectedAltitudeFt: 35000, gLoadShown: false })).toBeNull();
  });

  it('gives way to the G LOAD indication', () => {
    expect(metricAltSelMetres({ metricAltSelected: true, selectedAltitudeFt: 35000, gLoadShown: true })).toBeNull();
  });

  it('shows nothing without a valid FCU selected altitude', () => {
    expect(metricAltSelMetres({ metricAltSelected: true, selectedAltitudeFt: null, gLoadShown: false })).toBeNull();
  });
});
