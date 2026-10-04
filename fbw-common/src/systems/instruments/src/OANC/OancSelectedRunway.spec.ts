// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isFmsSelectedRunway } from './OancMapUtils';

/*
 * A380 FCOM DSC-34-10-70-20 (FMS Runway): "If the flight crew selects an origin runway, or a destination runway in the
 * FMS flight plan, the OANS displays [...] The QFU of the selected runway on the runway label in green."
 */
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

  it('the runway labels are built with the FMS destination, not the origin twice', () => {
    const oanc = readFileSync(resolve(__dirname, 'Oanc.tsx'), 'utf8');
    const call = oanc.slice(oanc.indexOf('const isSelectedRunway = isFmsSelectedRunway('));
    expect(call).toMatch(
      /^const isSelectedRunway = isFmsSelectedRunway\(\s*this\.dataAirportIcao\.get\(\),\s*this\.fmsDataStore\.origin\.get\(\),\s*this\.fmsDataStore\.destination\.get\(\),/,
    );
  });
});
