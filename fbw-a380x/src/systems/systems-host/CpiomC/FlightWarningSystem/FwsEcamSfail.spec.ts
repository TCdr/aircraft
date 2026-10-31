// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import { describe, expect, it } from 'vitest';
import { createFws, runFwsCycle } from './FwsSpecFixture';

const FUEL_CG_AT_FWD_LIMIT = '281800007';
/** Two more fuel cautions, re-pointed by the specs at a page of their own */
const CAUTION_WITHOUT_PAGE = '281800008';
const CAUTION_ON_HYD_PAGE = '281800086';

describe('L:A32NX_ECAM_SFAIL (the SD page called by the alert on top of the EWD)', () => {
  const setUp = (withOtherCautions = false) => {
    const fixture = createFws(new Set());
    // Hold the phase: the cycle would compute phase 1 from the all-zero simvars
    fixture.core.flightPhase.set(8);
    fixture.core.flightPhase.set = () => undefined;
    // Only these alerts: the all-zero simvars make many others active, which would rank above them
    const abnormal: typeof fixture.core.ewdAbnormal = {
      [FUEL_CG_AT_FWD_LIMIT]: fixture.core.ewdAbnormal[FUEL_CG_AT_FWD_LIMIT],
    };
    if (withOtherCautions) {
      abnormal[CAUTION_WITHOUT_PAGE] = {
        ...fixture.core.ewdAbnormal[CAUTION_WITHOUT_PAGE],
        simVarIsActive: Subject.create(true),
        failure: 2,
        sysPage: -1,
      };
      abnormal[CAUTION_ON_HYD_PAGE] = {
        ...fixture.core.ewdAbnormal[CAUTION_ON_HYD_PAGE],
        simVarIsActive: Subject.create(true),
        failure: 2,
        sysPage: SdPages.Hyd,
      };
    }
    fixture.core.ewdAbnormal = abnormal;
    // A first cycle at a known time, so that the activation time of the alert below is a number
    fixture.simVars.set('E:SIMULATION TIME', 1);
    runFwsCycle(fixture.core);
    fixture.core.fuelCgAtFwdLimit.set(true);
    fixture.core.fuelCgAtFwdLimit.set = () => undefined;
    return fixture;
  };
  const cycleSeconds = (fixture: ReturnType<typeof setUp>, seconds: number) => {
    fixture.simVars.set('E:SIMULATION TIME', seconds);
    runFwsCycle(fixture.core);
  };

  it('calls the page of a presented caution', () => {
    const fixture = setUp();
    cycleSeconds(fixture, 10);
    cycleSeconds(fixture, 20);
    expect(fixture.core.presentedFailures).toContain(FUEL_CG_AT_FWD_LIMIT);
    expect(fixture.simVars.get('L:A32NX_ECAM_SFAIL')).toBe(SdPages.Fuel);
  });

  it('calls no page once the caution is cancelled with EMER CANC', () => {
    const fixture = setUp();
    cycleSeconds(fixture, 10);
    cycleSeconds(fixture, 20);
    fixture.core.emerCancel.cancelCaution(FUEL_CG_AT_FWD_LIMIT);
    cycleSeconds(fixture, 30);
    expect(fixture.simVars.get('L:A32NX_ECAM_SFAIL')).toBe(-1);
  });

  it('calls the page of the next caution that has one once the top caution is cancelled', () => {
    const fixture = setUp(true);
    cycleSeconds(fixture, 10);
    cycleSeconds(fixture, 20);
    fixture.core.emerCancel.cancelCaution(FUEL_CG_AT_FWD_LIMIT);
    cycleSeconds(fixture, 30);
    expect(fixture.core.presentedFailures).toContain(CAUTION_ON_HYD_PAGE);
    expect(fixture.simVars.get('L:A32NX_ECAM_SFAIL')).toBe(SdPages.Hyd);
  });
});
