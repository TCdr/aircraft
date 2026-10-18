// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { GpsReceiverOutputs, gpsReceiverTexts } from './GpsReceiverTexts';

const navigating: GpsReceiverOutputs = {
  mode: 3,
  satellites: 10,
  figureOfMerit: 38.6,
  trueTrack: 271.26,
  altitude: 41_015,
  groundSpeed: 498.6,
};

describe('MFD POSITION / GPS page values of a receiver', () => {
  it('shows the values of a receiver in NAV', () => {
    expect(gpsReceiverTexts(navigating)).toEqual({
      navigating: true,
      mode: 'NAV',
      satellites: '10',
      accuracy: '39',
      track: '271.3',
      altitude: '41015',
      groundSpeed: '499',
    });
  });

  it('shows the mode and the satellites while acquiring, dashes for the rest', () => {
    const texts = gpsReceiverTexts({ ...navigating, mode: 2, satellites: 3 });
    expect(texts.mode).toBe('ACQ');
    expect(texts.satellites).toBe('3');
    expect(texts.accuracy).toBe('---');
    expect(texts.track).toBe('---.-');
  });

  it('shows INIT and FAULT without satellites, and dashes when off', () => {
    expect(gpsReceiverTexts({ ...navigating, mode: 1 }).satellites).toBe('--');
    expect(gpsReceiverTexts({ ...navigating, mode: 4 }).mode).toBe('FAULT');
    const off = gpsReceiverTexts({ ...navigating, mode: 0 });
    expect(off.mode).toBe('----');
    expect(off.groundSpeed).toBe('---');
  });

  it('shows the values in DIFF and in the degraded modes ALTAID and AIDED', () => {
    expect(gpsReceiverTexts({ ...navigating, mode: 8 })).toEqual({ ...gpsReceiverTexts(navigating), mode: 'DIFF' });
    const altitudeAided = gpsReceiverTexts({ ...navigating, mode: 6, satellites: 3 });
    expect(altitudeAided.mode).toBe('ALTAID');
    expect(altitudeAided.satellites).toBe('3');
    expect(altitudeAided.navigating).toBe(true);
    const aided = gpsReceiverTexts({ ...navigating, mode: 7, satellites: 0 });
    expect(aided.mode).toBe('AIDED');
    expect(aided.satellites).toBe('0');
    expect(aided.track).toBe('271.3');
  });

  it('shows TEST without satellites nor values', () => {
    const test = gpsReceiverTexts({ ...navigating, mode: 5 });
    expect(test.mode).toBe('TEST');
    expect(test.satellites).toBe('--');
    expect(test.accuracy).toBe('---');
  });

  it('dashes an invalid word', () => {
    expect(gpsReceiverTexts({ ...navigating, altitude: null }).altitude).toBe('-----');
  });
});
