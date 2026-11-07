// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { GbasApproach } from '../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';
import { defineGbasApproach, GbasRunwayRecord, MAX_COURSE_MISMATCH } from './GbasApproachDefinition';

const frankfurt25C: GbasApproach = {
  airport: 'EDDF',
  runway: '25C',
  channel: 31434,
  rpi: 'G25P',
  suffix: 'Z',
  gpa: 3,
  tch: 50,
  course: 246,
  verified: true,
  source: 'test',
};

/** The MSFS record of 25C: 3 deg of west variation make the true bearing 3 deg more than the magnetic one */
function runway25C(overrides: Partial<GbasRunwayRecord> = {}): GbasRunwayRecord {
  return {
    ident: 'RW25C',
    bearing: 249.2,
    magneticBearing: 246.2,
    thresholdLocation: { lat: 50.0285, long: 8.5361, alt: 328 },
    length: 4000,
    ...overrides,
  };
}

describe('the GBAS approach definition', () => {
  it('takes position, elevation, length and true course from the runway, slope and crossing height from the table', () => {
    const result = defineGbasApproach(frankfurt25C, runway25C());
    expect(result.rejection).toBeNull();
    expect(result.definition).toEqual({
      channel: 31434,
      rpi: 'G25P',
      thresholdLocation: { lat: 50.0285, long: 8.5361 },
      thresholdElevation: 328,
      runwayLength: 4000,
      courseTrue: 249.2,
      gpa: 3,
      tch: 50,
    });
  });

  it('does not take the course from the table', () => {
    const result = defineGbasApproach(frankfurt25C, runway25C({ bearing: 248, magneticBearing: 245 }));
    expect(result.definition?.courseTrue).toBe(248);
  });

  it('keeps the slope of the Y procedure on the same runway end', () => {
    const y: GbasApproach = { ...frankfurt25C, suffix: 'Y', channel: 28968, rpi: 'G25M', gpa: 3.2 };
    expect(defineGbasApproach(y, runway25C()).definition).toMatchObject({ channel: 28968, rpi: 'G25M', gpa: 3.2 });
    expect(defineGbasApproach(frankfurt25C, runway25C()).definition?.gpa).toBe(3);
  });

  it('accepts a charted course within the allowed difference of the runway', () => {
    expect(MAX_COURSE_MISMATCH).toBe(3);
    expect(defineGbasApproach(frankfurt25C, runway25C({ magneticBearing: 249 })).rejection).toBeNull();
    expect(defineGbasApproach(frankfurt25C, runway25C({ magneticBearing: 243.2 })).rejection).toBeNull();
  });

  it('rejects a runway whose bearing is 4 degrees from the charted course', () => {
    const result = defineGbasApproach(frankfurt25C, runway25C({ magneticBearing: 250 }));
    expect(result.definition).toBeNull();
    expect(result.rejection).toBe('course-mismatch');
  });

  it('compares the course across north', () => {
    const northRunway: GbasApproach = { ...frankfurt25C, runway: '36', rpi: 'G36A', course: 358 };
    expect(defineGbasApproach(northRunway, runway25C({ magneticBearing: 1 })).rejection).toBeNull();
    expect(defineGbasApproach(northRunway, runway25C({ magneticBearing: 3 })).rejection).toBe('course-mismatch');
  });

  it('rejects an approach whose runway is not in the airport', () => {
    const result = defineGbasApproach(frankfurt25C, null);
    expect(result.definition).toBeNull();
    expect(result.rejection).toBe('runway-missing');
  });

  it('rejects a table channel outside 20001 to 39999', () => {
    expect(defineGbasApproach({ ...frankfurt25C, channel: 20000 }, runway25C()).rejection).toBe('channel-out-of-range');
    expect(defineGbasApproach({ ...frankfurt25C, channel: 40000 }, runway25C()).rejection).toBe('channel-out-of-range');
    expect(defineGbasApproach({ ...frankfurt25C, channel: 20001 }, runway25C()).rejection).toBeNull();
    expect(defineGbasApproach({ ...frankfurt25C, channel: 39999 }, runway25C()).rejection).toBeNull();
  });

  it('rejects a runway without a threshold elevation, as the path would have no height reference', () => {
    const result = defineGbasApproach(frankfurt25C, runway25C({ thresholdLocation: { lat: 50.0285, long: 8.5361 } }));
    expect(result.rejection).toBe('threshold-elevation-missing');
    expect(result.definition).toBeNull();
  });

  it('rejects a runway without a length', () => {
    expect(defineGbasApproach(frankfurt25C, runway25C({ length: 0 })).rejection).toBe('runway-length-missing');
  });
});
