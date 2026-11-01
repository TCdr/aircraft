// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { OansFmsDataStore } from '@flybywiresim/fbw-sdk';
import { EventBus } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { isFmsSelectedRunway, isFmsSelectedRunwayOfFms } from './OancMapUtils';

// The OANS shows the QFU of the FMS origin or destination runway in green on the runway label
describe('OANS FMS selected runway', () => {
  const designators = ['04R', '22L'];

  it('is the landing runway at the destination', () => {
    expect(isFmsSelectedRunway('KBOS', 'KJFK', 'KBOS', '31L', '22L', designators)).toBe(true);
  });

  it('is the departure runway at the origin', () => {
    expect(isFmsSelectedRunway('KBOS', 'KBOS', 'KJFK', '04R', '13L', designators)).toBe(true);
  });

  it('is not the landing runway of another airport', () => {
    expect(isFmsSelectedRunway('KBOS', 'KJFK', 'KLGA', '31L', '22L', designators)).toBe(false);
  });

  it('is not set without an FMS runway', () => {
    expect(isFmsSelectedRunway('KBOS', 'KJFK', 'KBOS', undefined, undefined, designators)).toBe(false);
  });

  it('the runway labels use the FMS origin with the departure runway and the FMS destination with the landing runway', () => {
    const bus = new EventBus();
    const publisher = bus.getPublisher<{
      fmsOrigin: string;
      fmsDestination: string;
      fmsDepartureRunway: string;
      fmsLandingRunway: string;
    }>();
    const fmsData = new OansFmsDataStore(bus);
    // the FMS runway entries carry the ICAO code of their airport in front of the designator
    publisher.pub('fmsOrigin', 'KBOS', true);
    publisher.pub('fmsDestination', 'KJFK', true);
    publisher.pub('fmsDepartureRunway', 'KBOS04R', true);
    publisher.pub('fmsLandingRunway', 'KJFK22L', true);

    expect(isFmsSelectedRunwayOfFms('KBOS', fmsData, ['04R', '22L'])).toBe(true);
    expect(isFmsSelectedRunwayOfFms('KJFK', fmsData, ['04R', '22L'])).toBe(true);
    // the departure runway belongs to the origin only, the landing runway to the destination only
    expect(isFmsSelectedRunwayOfFms('KBOS', fmsData, ['22L', '31R'])).toBe(false);
    expect(isFmsSelectedRunwayOfFms('KJFK', fmsData, ['04R', '13L'])).toBe(false);
    expect(isFmsSelectedRunwayOfFms('KLGA', fmsData, ['04R', '22L'])).toBe(false);
  });
});
