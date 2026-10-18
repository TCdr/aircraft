// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { GpsReceiverReading, gpsMonitorFields } from './GpsMonitorFields';

const navigating: GpsReceiverReading = {
  mode: 3,
  satellites: 9,
  figureOfMerit: 41.6,
  trueTrack: 5.4,
  groundSpeed: 452.3,
  altitude: 35_020,
  selected: true,
};

describe('MCDU GPS MONITOR fields of a receiver', () => {
  it('shows the data of a receiver in NAV', () => {
    expect(gpsMonitorFields(navigating)).toEqual({
      dataShown: true,
      trueTrack: '005',
      groundSpeed: '452',
      merit: '42FT',
      modeSatellites: 'NAV/9',
      altitude: '35020',
    });
  });

  it('dashes the data of a receiver no ADIRU has selected, keeping its mode', () => {
    const fields = gpsMonitorFields({ ...navigating, selected: false });
    expect(fields.dataShown).toBe(false);
    expect(fields.trueTrack).toBe('---');
    expect(fields.merit).toBe('---FT');
    expect(fields.modeSatellites).toBe('NAV/9');
  });

  it('shows the satellites tracked while acquiring, and no data yet', () => {
    const fields = gpsMonitorFields({ ...navigating, mode: 2, satellites: 3 });
    expect(fields.modeSatellites).toBe('ACQ/3');
    expect(fields.groundSpeed).toBe('---');
  });

  it('shows INIT and FAULT without satellites, and nothing when off', () => {
    expect(gpsMonitorFields({ ...navigating, mode: 1, satellites: null }).modeSatellites).toBe('INIT');
    expect(gpsMonitorFields({ ...navigating, mode: 4 }).modeSatellites).toBe('FAULT');
    const off = gpsMonitorFields({ ...navigating, mode: 0, satellites: null });
    expect(off.modeSatellites).toBe('');
    expect(off.altitude).toBe('-----');
  });

  it('shows the data in the degraded modes ALTAID and AIDED, with the satellites tracked', () => {
    const altitudeAided = gpsMonitorFields({ ...navigating, mode: 6, satellites: 3 });
    expect(altitudeAided.dataShown).toBe(true);
    expect(altitudeAided.modeSatellites).toBe('ALTAID/3');
    expect(altitudeAided.merit).toBe('42FT');
    const aided = gpsMonitorFields({ ...navigating, mode: 7, satellites: 1 });
    expect(aided.modeSatellites).toBe('AIDED/1');
    expect(aided.groundSpeed).toBe('452');
  });

  it('shows TEST without satellites nor data', () => {
    const test = gpsMonitorFields({ ...navigating, mode: 5, satellites: null });
    expect(test.modeSatellites).toBe('TEST');
    expect(test.dataShown).toBe(false);
    expect(test.altitude).toBe('-----');
  });

  it('dashes a word that is not valid', () => {
    expect(gpsMonitorFields({ ...navigating, figureOfMerit: null }).merit).toBe('---FT');
  });
});
