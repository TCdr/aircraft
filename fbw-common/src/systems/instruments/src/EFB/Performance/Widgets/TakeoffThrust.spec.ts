// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { RunwayCondition, TakeoffPerformanceResult } from '@flybywiresim/fbw-sdk';
import { offeredTakeoffThrusts, takeoffRunThrust, takeoffThrustChoice } from './TakeoffThrust';

/** A result at sea level, OAT 15 °C: FLEX from 30 °C (TREF) to `flex`, derated levels down to `derate` */
const result = (flex: number | undefined, derate: number | undefined) =>
  ({
    inputs: { oat: 15 },
    params: { tRef: 30 },
    flex,
    derate,
  }) as TakeoffPerformanceResult;

describe('takeoff thrust of the flypad calculator', () => {
  describe('offered thrust ratings', () => {
    it('offers TOGA and DERATED but not FLEX on a contaminated runway', () => {
      expect(offeredTakeoffThrusts(RunwayCondition.Contaminated6mmWater, true)).toEqual(['TOGA', 'DERATED']);
      expect(offeredTakeoffThrusts(RunwayCondition.ContaminatedCompactedSnow, true)).toEqual(['TOGA', 'DERATED']);
    });

    it('offers FLEX, TOGA and DERATED on a dry or wet runway', () => {
      expect(offeredTakeoffThrusts(RunwayCondition.Dry, true)).toEqual(['FLEX', 'TOGA', 'DERATED']);
      expect(offeredTakeoffThrusts(RunwayCondition.Wet, true)).toEqual(['FLEX', 'TOGA', 'DERATED']);
    });

    it('never offers DERATED without derated levels (A320)', () => {
      expect(offeredTakeoffThrusts(RunwayCondition.Dry, false)).toEqual(['FLEX', 'TOGA']);
      expect(offeredTakeoffThrusts(RunwayCondition.Contaminated6mmSlush, false)).toEqual(['TOGA']);
    });
  });

  describe('thrust of the takeoff run', () => {
    it('is the deepest permitted level by default, the chosen level otherwise, never deeper', () => {
      expect(takeoffRunThrust(result(50, 16), null, null)).toEqual({ rating: 'DERATED', derate: 16 });
      expect(takeoffRunThrust(result(50, 16), null, 8)).toEqual({ rating: 'DERATED', derate: 8 });
      expect(takeoffRunThrust(result(50, 16), null, 24)).toEqual({ rating: 'DERATED', derate: 16 });
    });

    it('is TOGA when DERATED is chosen but the TOW permits no level', () => {
      expect(takeoffRunThrust(result(50, undefined), null, null)).toEqual({ rating: 'TOGA' });
    });

    it('keeps TOGA and FLEX as before without a derate choice', () => {
      expect(takeoffRunThrust(result(50, 16), undefined, undefined)).toEqual({ rating: 'FLEX', flex: 50 });
      expect(takeoffRunThrust(result(50, 16), 40, undefined)).toEqual({ rating: 'FLEX', flex: 40 });
      expect(takeoffRunThrust(result(50, 16), null, undefined)).toEqual({ rating: 'TOGA' });
      expect(takeoffRunThrust(result(undefined, 16), undefined, undefined)).toEqual({ rating: 'TOGA' });
      expect(takeoffRunThrust(undefined, undefined, undefined)).toBeUndefined();
    });

    it('makes TOGA, FLEX and DERATED exclusive choices', () => {
      const derated = takeoffThrustChoice('DERATED');
      expect(takeoffRunThrust(result(50, 16), derated.selectedFlex, derated.selectedDerate)?.rating).toBe('DERATED');
      const toga = takeoffThrustChoice('TOGA');
      expect(takeoffRunThrust(result(50, 16), toga.selectedFlex, toga.selectedDerate)?.rating).toBe('TOGA');
      const flex = takeoffThrustChoice('FLEX');
      expect(takeoffRunThrust(result(50, 16), flex.selectedFlex, flex.selectedDerate)?.rating).toBe('FLEX');
    });
  });
});
