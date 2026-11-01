// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { WIND_TYPING_REGEX } from './Utils';

describe('wind field typing filter', () => {
  it.each(['8', '80', '80/', '80/1', '80/10', '080/', '080/10', '08010', 'TL10', '-5'])('accepts %s', (entry) => {
    expect(WIND_TYPING_REGEX.test(entry)).toBe(true);
  });

  it.each(['80/100', '1234/10', '80//', 'X'])('rejects %s', (entry) => {
    expect(WIND_TYPING_REGEX.test(entry)).toBe(false);
  });
});
