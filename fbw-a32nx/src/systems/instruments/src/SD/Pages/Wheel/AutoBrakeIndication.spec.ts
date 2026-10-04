// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { autoBrakeIndicationClass } from './AutoBrakeIndication';

/* A320 FCOM DSC-32-30-20 AUTO BRK: green when armed, amber only on a system failure. */
describe('SD WHEEL AUTO BRK legend', () => {
  it('is green when armed without a failure', () => {
    expect(autoBrakeIndicationClass(false)).toBe('Green');
  });

  it('is amber on an auto brake failure', () => {
    expect(autoBrakeIndicationClass(true)).toBe('Amber');
  });

  it('does not turn amber because an engine is off (single-engine taxi)', () => {
    const page = readFileSync(resolve(__dirname, 'Wheel.tsx'), 'utf-8');
    const autoBrake = page.slice(page.indexOf('const AutoBrake = '), page.indexOf('const AutoBrakeLevel = '));
    expect(autoBrake).not.toContain('ENG COMBUSTION');
    expect(autoBrake).toContain('autoBrakeIndicationClass(');
  });
});
