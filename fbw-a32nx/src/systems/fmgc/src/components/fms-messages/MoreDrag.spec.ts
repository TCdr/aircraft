// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { GuidanceController } from '@fmgc/guidance/GuidanceController';
import type { Navigation } from '@fmgc/navigation/Navigation';

import { FMMessageUpdate } from './FmsMessages';
import { MoreDrag } from './VnavPathMessages';

// The FM message manager loads the whole guidance, whose leg modules import each other; the selector needs the enum
vi.mock('./FmsMessages', () => ({
  FMMessageUpdate: { NO_ACTION: 0, SEND: 1, RECALL: 2 },
}));

describe('MORE DRAG on the MCDU', () => {
  const selectorWith = (required: { value: boolean }) => {
    const selector = new MoreDrag();
    const guidanceController = {
      vnavDriver: { isMoreDragRequired: () => required.value },
    } as unknown as GuidanceController;
    selector.init({} as Navigation, guidanceController);
    return selector;
  };

  it('is an amber type II message that the crew can clear', () => {
    const selector = new MoreDrag();
    expect(selector.message.text).toBe('MORE DRAG');
    expect(selector.message.color).toBe('Amber');
    expect(selector.message.clearable).toBe(true);
  });

  it('is sent when the PFD message comes up and recalled when the drag is no longer needed', () => {
    const required = { value: false };
    const selector = selectorWith(required);
    expect(selector.process(0)).toBe(FMMessageUpdate.NO_ACTION);
    required.value = true;
    expect(selector.process(0)).toBe(FMMessageUpdate.SEND);
    expect(selector.process(0)).toBe(FMMessageUpdate.NO_ACTION);
    required.value = false;
    expect(selector.process(0)).toBe(FMMessageUpdate.RECALL);
  });

  it('is processed by the FM message manager', () => {
    const manager = readFileSync(resolve(__dirname, 'FmsMessages.ts'), 'utf-8');
    expect(manager).toContain('new MoreDrag()');
  });
});
