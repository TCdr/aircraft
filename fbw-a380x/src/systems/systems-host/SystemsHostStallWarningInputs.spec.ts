// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

// The host class cannot be built in vitest (it pulls in the whole avionics tree), so the wiring is read from its source.
const source = readFileSync(resolve(__dirname, 'SystemsHost.ts'), 'utf-8').replace(/\r\n/g, '\n');

describe('A380X systems host stall warning inputs', () => {
  it('creates an AdcPublisher on the host bus', () => {
    expect(source).toMatch(/import \{[^}]*\bAdcPublisher\b[^}]*\} from '@microsoft\/msfs-sdk'/);
    expect(source).toContain('new AdcPublisher(this.bus)');
  });

  it('adds the AdcPublisher to the backplane before the stall warning publisher', () => {
    const adcLine = source.indexOf("this.backplane.addPublisher('Adc', this.adcPublisher)");
    const stallLine = source.indexOf("this.backplane.addPublisher('StallWarning', this.stallWarningPublisher)");
    expect(adcLine).toBeGreaterThan(-1);
    expect(stallLine).toBeGreaterThan(adcLine);
  });
});
