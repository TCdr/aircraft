// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  isEngineGeneratorIndicationAmber,
  isRatIndicationAmber,
  isStaticInverterFailed,
  isTransformerRectifierIndicationAmber,
} from './ElecFailureStates';

describe('ELEC AC page GEN indication (A380 FCOM l.51081-51085)', () => {
  it('is white for a generator in operation', () => {
    expect(isEngineGeneratorIndicationAmber(true, true, true, true, true)).toBe(false);
  });

  it('is amber when the generator is off or its engine does not run', () => {
    expect(isEngineGeneratorIndicationAmber(false, true, true, true, true)).toBe(true);
    expect(isEngineGeneratorIndicationAmber(true, false, true, true, true)).toBe(true);
  });

  it('is amber when the generator is failed: drive disconnected, voltage or frequency not normal', () => {
    expect(isEngineGeneratorIndicationAmber(true, true, false, true, true)).toBe(true);
    expect(isEngineGeneratorIndicationAmber(true, true, true, false, true)).toBe(true);
    expect(isEngineGeneratorIndicationAmber(true, true, true, true, false)).toBe(true);
  });
});

describe('ELEC AC page TR indication (A380 FCOM l.51125-51128)', () => {
  it('is white for a powered TR with a normal output', () => {
    expect(isTransformerRectifierIndicationAmber(true, true)).toBe(false);
  });

  it('is amber when the TR is failed or not powered', () => {
    expect(isTransformerRectifierIndicationAmber(true, false)).toBe(true);
    expect(isTransformerRectifierIndicationAmber(false, false)).toBe(true);
  });
});

describe('STAT INV indication (A380 FCOM l.50928-50931, l.51264-51267)', () => {
  it('is failed only when the inverter runs (7XB closed) without a normal output', () => {
    expect(isStaticInverterFailed(true, false)).toBe(true);
    expect(isStaticInverterFailed(true, true)).toBe(false);
    expect(isStaticInverterFailed(false, false)).toBe(false);
  });
});

describe('RAT indication (A380 FCOM l.51143-51147)', () => {
  it('follows the RAT generator fault', () => {
    expect(isRatIndicationAmber(true)).toBe(true);
    expect(isRatIndicationAmber(false)).toBe(false);
  });
});
