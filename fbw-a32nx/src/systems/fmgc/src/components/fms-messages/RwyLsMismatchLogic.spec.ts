// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { DatabaseLandingSystem, isRunwayLsMismatch, TunedLandingSystem } from './RwyLsMismatchLogic';

function tuned(overrides: Partial<TunedLandingSystem> = {}): TunedLandingSystem {
  return { frequency: null, course: null, glsChannel: null, ...overrides };
}

function database(overrides: Partial<DatabaseLandingSystem> = {}): DatabaseLandingSystem {
  return { frequency: null, course: null, glsChannel: null, ...overrides };
}

describe('RWY/LS mismatch', () => {
  describe('ILS', () => {
    it('compares the frequency', () => {
      expect(isRunwayLsMismatch(tuned({ frequency: 109.5 }), database({ frequency: 110.3 }))).toBe(true);
      expect(isRunwayLsMismatch(tuned({ frequency: 110.3 }), database({ frequency: 110.3 }))).toBe(false);
    });

    it('compares the course with a tolerance of 3 degrees', () => {
      expect(isRunwayLsMismatch(tuned({ course: 250 }), database({ course: 246 }))).toBe(true);
      expect(isRunwayLsMismatch(tuned({ course: 249 }), database({ course: 246 }))).toBe(false);
      expect(isRunwayLsMismatch(tuned({ course: 359 }), database({ course: 1 }))).toBe(false);
    });

    it('is no mismatch while one side has nothing', () => {
      expect(isRunwayLsMismatch(tuned(), database({ frequency: 110.3, course: 246 }))).toBe(false);
      expect(isRunwayLsMismatch(tuned({ frequency: 110.3, course: 246 }), database())).toBe(false);
    });
  });

  describe('GLS', () => {
    it('compares the channel', () => {
      expect(isRunwayLsMismatch(tuned({ glsChannel: 28968 }), database({ glsChannel: 31434 }))).toBe(true);
      expect(isRunwayLsMismatch(tuned({ glsChannel: 31434 }), database({ glsChannel: 31434 }))).toBe(false);
    });

    it('also compares the course', () => {
      const same = { glsChannel: 31434 };

      expect(isRunwayLsMismatch(tuned({ ...same, course: 246 }), database({ ...same, course: 246 }))).toBe(false);
      expect(isRunwayLsMismatch(tuned({ ...same, course: 66 }), database({ ...same, course: 246 }))).toBe(true);
    });

    it('is a mismatch when an ILS is tuned for a GLS runway, and the other way round', () => {
      expect(isRunwayLsMismatch(tuned({ frequency: 110.3 }), database({ glsChannel: 31434 }))).toBe(true);
      expect(isRunwayLsMismatch(tuned({ glsChannel: 31434 }), database({ frequency: 110.3 }))).toBe(true);
    });

    it('is no mismatch while nothing is tuned', () => {
      expect(isRunwayLsMismatch(tuned(), database({ glsChannel: 31434 }))).toBe(false);
      expect(isRunwayLsMismatch(tuned({ glsChannel: 31434 }), database())).toBe(false);
    });
  });
});
