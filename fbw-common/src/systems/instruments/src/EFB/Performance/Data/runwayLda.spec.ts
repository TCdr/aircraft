// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { displacedThresholdOfEnd, landingDistanceAvailable } from './runwayLda';

const FACILITY_WITH_DISPLACED_PRIMARY = { primaryThresholdLength: 400, secondaryThresholdLength: 0 };

describe('displacedThresholdOfEnd', () => {
  it('gives the primary end its own displaced threshold', () => {
    expect(displacedThresholdOfEnd(FACILITY_WITH_DISPLACED_PRIMARY, 0)).toBe(400);
  });

  it('gives the secondary end its own displaced threshold, not the primary one', () => {
    expect(displacedThresholdOfEnd(FACILITY_WITH_DISPLACED_PRIMARY, 1)).toBe(0);
    expect(displacedThresholdOfEnd({ primaryThresholdLength: 0, secondaryThresholdLength: 250 }, 1)).toBe(250);
  });

  it('treats a missing threshold length as no displaced threshold', () => {
    expect(displacedThresholdOfEnd({ primaryThresholdLength: undefined, secondaryThresholdLength: 100 }, 0)).toBe(0);
  });
});

describe('landingDistanceAvailable', () => {
  it('shortens the runway by 400 m for the end with a 400 m displaced threshold', () => {
    expect(landingDistanceAvailable({ length: 3000, displacedThreshold: 400 })).toBe(2600);
  });

  it('leaves the other direction of the same runway at the full length', () => {
    expect(landingDistanceAvailable({ length: 3000, displacedThreshold: 0 })).toBe(3000);
  });

  it('gives the full length when the runway record has no displaced threshold', () => {
    expect(landingDistanceAvailable({ length: 3000 })).toBe(3000);
  });

  it('never gives a negative distance', () => {
    expect(landingDistanceAvailable({ length: 300, displacedThreshold: 400 })).toBe(0);
  });
});
