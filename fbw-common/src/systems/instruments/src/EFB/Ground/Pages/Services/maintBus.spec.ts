// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { maintBusRowState, maintBusStatusKey, maintBusToggled } from './maintBus';

describe('MAINT BUS row of the A320 Services page (FCOM l.37377-37405)', () => {
  it('is greyed out without external power: the switch cannot latch', () => {
    expect(maintBusRowState(false, false)).toBe('unavailable');
    expect(maintBusRowState(true, false)).toBe('unavailable');
    expect(maintBusToggled('unavailable')).toBe(false);
  });

  it('shows the switch position with external power', () => {
    expect(maintBusRowState(false, true)).toBe('off');
    expect(maintBusRowState(true, true)).toBe('on');
  });

  it('toggles the switch', () => {
    expect(maintBusToggled('off')).toBe(true);
    expect(maintBusToggled('on')).toBe(false);
  });

  it('describes each state', () => {
    expect(maintBusStatusKey('on')).toBe('Ground.Services.MaintBusOn');
    expect(maintBusStatusKey('off')).toBe('Ground.Services.MaintBusOff');
    expect(maintBusStatusKey('unavailable')).toBe('Ground.Services.MaintBusNeedsExtPwr');
  });
});
