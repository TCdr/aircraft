// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { engineFailureCreatesEngineOutSid, engineOutSidIdent } from './EngineOutSid';

describe('A380X engine-out SID (A380 FCOM DSC-22-FMS-10-60, l.30719-30751, l.30832-30849)', () => {
  it('shows the EOSID of the selected departure runway on the DEPARTURE page, NONE without one', () => {
    expect(engineOutSidIdent({ engineOutDepartureSegment: { procedureIdent: 'EO27R' } })).toBe('EO27R');
    expect(engineOutSidIdent({ engineOutDepartureSegment: { procedureIdent: undefined } })).toBe('NONE');
    expect(engineOutSidIdent(undefined)).toBe('NONE');
  });

  it('creates the EOSID temporary flight plan in the takeoff phase below the thrust reduction altitude only', () => {
    expect(engineFailureCreatesEngineOutSid(FmgcFlightPhase.Takeoff, 800, 1500)).toBe(true);
    expect(engineFailureCreatesEngineOutSid(FmgcFlightPhase.Takeoff, 1600, 1500)).toBe(false);
    expect(engineFailureCreatesEngineOutSid(FmgcFlightPhase.Climb, 800, 1500)).toBe(false);
    expect(engineFailureCreatesEngineOutSid(FmgcFlightPhase.Takeoff, 800, null)).toBe(false);
  });
});
