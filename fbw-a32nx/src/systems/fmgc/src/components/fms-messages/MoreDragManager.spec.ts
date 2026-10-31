// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
// the guidance leg modules import each other: loading the guidance controller first is the order in which they resolve
import '@fmgc/guidance/GuidanceController';
import { FmsMessages } from './FmsMessages';
import { FMMessageTriggers, FMMessageTypes } from './FmMessages';
import { MoreDrag } from './VnavPathMessages';

describe('MORE DRAG in the FM message manager', () => {
  const triggers: [string, unknown][] = [];

  beforeEach(() => {
    triggers.length = 0;
    // the manager registers its view listener when it is created
    vi.stubGlobal('RegisterViewListener', () => ({
      triggerToAllSubscribers: (trigger: string, data: unknown) => triggers.push([trigger, data]),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends MORE DRAG to the MCDU', () => {
    new FmsMessages(new EventBus()).send(MoreDrag);
    expect(triggers).toEqual([[FMMessageTriggers.SEND_TO_MCDU, FMMessageTypes.MoreDrag]]);
  });

  it('recalls MORE DRAG from the MCDU', () => {
    new FmsMessages(new EventBus()).recall(MoreDrag);
    expect(triggers).toEqual([[FMMessageTriggers.RECALL_FROM_MCDU_WITH_ID, FMMessageTypes.MoreDrag.text]]);
  });
});
