// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { NXSystemMessages } from '../shared/NXSystemMessages';
import { CostIndexDefault } from './CostIndexDefault';

describe('Default cost index (COST INDEX-NNN IN USE)', () => {
  it('is 0 after a power up', () => {
    expect(new CostIndexDefault().defaultFor(null)).toBe(0);
  });

  it('is the cost index of the previous flight, stored in the DONE phase', () => {
    const costIndexDefault = new CostIndexDefault();
    costIndexDefault.storeAtDone(45);
    expect(costIndexDefault.defaultFor(null)).toBe(45);
    // A flight without cost index keeps the stored one
    costIndexDefault.storeAtDone(null);
    expect(costIndexDefault.defaultFor(null)).toBe(45);
  });

  it('is not set when the crew entered a cost index', () => {
    const costIndexDefault = new CostIndexDefault();
    costIndexDefault.storeAtDone(45);
    expect(costIndexDefault.defaultFor(80)).toBeNull();
  });

  it('names the cost index in the message', () => {
    expect(NXSystemMessages.costIndexInUse.getModifiedMessage('45').text).toBe('COST INDEX-45 IN USE');
  });
});
