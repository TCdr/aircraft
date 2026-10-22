// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FMMessageTypes } from './FmMessages';

describe('FM message ids', () => {
  // The MCDU recalls a cleared message by its id: an id shared with another message recalls the wrong one
  it.each(['CabinRateExceeded', 'NoVertPathIntercept', 'SpeedErrorAtWaypoint', 'MoreDrag'])(
    '%s has an id of its own',
    (name) => {
      const messages: Record<string, { id: number }> = FMMessageTypes;
      const id = messages[name].id;
      const sharing = Object.entries(messages)
        .filter(([other, message]) => other !== name && message.id === id)
        .map(([other]) => other);
      expect(sharing).toEqual([]);
    },
  );
});
