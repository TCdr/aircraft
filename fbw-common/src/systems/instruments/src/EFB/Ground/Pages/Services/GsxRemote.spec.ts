// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { GsxService, gsxRequestable, gsxTurnaroundAction } from './GsxRemote';

const service = (state: string, canTrigger?: boolean): GsxService =>
  ({ id: 'Catering', displayName: 'Catering', state, canTrigger }) as GsxService;

describe('GSX turnaround step action', () => {
  it('offers no Request on a completed service GSX does not let be triggered', () => {
    expect(gsxTurnaroundAction(service('completed', false))).toBeNull();
  });

  it('offers Request whenever GSX lets the service be triggered, a completed one included', () => {
    expect(gsxTurnaroundAction(service('available', true))).toBe('request');
    expect(gsxTurnaroundAction(service('completed', true))).toBe('request');
  });

  it('offers nothing on an available service GSX does not let be triggered now', () => {
    expect(gsxTurnaroundAction(service('available', false))).toBeNull();
  });

  it('falls back on the state without canTrigger', () => {
    expect(gsxTurnaroundAction(service('available'))).toBe('request');
    expect(gsxTurnaroundAction(service('completed'))).toBeNull();
  });

  it('offers Stop on a running service GSX lets be triggered, nothing while requested or leaving', () => {
    expect(gsxTurnaroundAction(service('performing', true))).toBe('stop');
    expect(gsxTurnaroundAction(service('performing', false))).toBeNull();
    expect(gsxTurnaroundAction(service('requested', false))).toBeNull();
    expect(gsxTurnaroundAction(service('completing', false))).toBeNull();
    expect(gsxTurnaroundAction(service('unavailable', false))).toBeNull();
  });
});

describe('GSX-linked Services buttons', () => {
  it('may offer Request only when GSX lets the service be triggered, or does not list it', () => {
    expect(gsxRequestable(service('completed', false))).toBe(false);
    expect(gsxRequestable(service('completed', true))).toBe(true);
    expect(gsxRequestable(service('available', true))).toBe(true);
    expect(gsxRequestable(service('unavailable', false))).toBe(false);
    expect(gsxRequestable(undefined)).toBe(true);
  });
});
