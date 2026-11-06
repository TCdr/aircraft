// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { readSource, runFwsCoreStatement } from './FwsSpecSource';

const source = readSource('FwsCore.ts');

// The radio heights are deliberately not stubbed: the stub throws on a name that is not set, so a gate that reads them
// fails these tests.
const stallWarningAfter = (thisValues: Record<string, unknown>, locals: Record<string, unknown>) =>
  runFwsCoreStatement(source, 'this.stallWarning.set(', { stallWarning: false, ...thisValues }, locals).stallWarning;

const stallConditions = { isNormalLaw: false, isCasAbove60: true, flightPhase6789: true };

describe('Stall warning', () => {
  it('is on at a low radio height in alternate or direct law', () => {
    expect(stallWarningAfter({ stallWarningRaw: true }, stallConditions)).toBe(true);
  });

  it('is off outside flight phases 6 to 9', () => {
    expect(stallWarningAfter({ stallWarningRaw: true }, { ...stallConditions, flightPhase6789: false })).toBe(false);
  });

  it('is off at 60 kt CAS or less', () => {
    expect(stallWarningAfter({ stallWarningRaw: true }, { ...stallConditions, isCasAbove60: false })).toBe(false);
  });

  it('is off in normal law', () => {
    expect(stallWarningAfter({ stallWarningRaw: true }, { ...stallConditions, isNormalLaw: true })).toBe(false);
  });

  it('is off without the raw stall signal', () => {
    expect(stallWarningAfter({ stallWarningRaw: false }, stallConditions)).toBe(false);
  });
});
