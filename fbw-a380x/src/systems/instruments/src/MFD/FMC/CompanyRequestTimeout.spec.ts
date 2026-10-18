// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanyRequestTimeout } from './CompanyRequestTimeout';

// NO COMPANY REPLY when no answer comes within 4 min after the request
describe('company request timeout (NO COMPANY REPLY)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('times out a request without an answer after 4 min', () => {
    const timeout = new CompanyRequestTimeout();
    const onTimeout = vi.fn();
    timeout.start(0, onTimeout);

    vi.advanceTimersByTime(239_000);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('settles an answered request: no timeout, and the answer is taken', () => {
    const timeout = new CompanyRequestTimeout();
    const onTimeout = vi.fn();
    timeout.start(3, onTimeout);

    vi.advanceTimersByTime(60_000);
    expect(timeout.settle(3)).toBe(true);
    vi.advanceTimersByTime(300_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('refuses an answer arriving after the timeout', () => {
    const timeout = new CompanyRequestTimeout();
    timeout.start(0, () => {});
    vi.advanceTimersByTime(240_000);
    expect(timeout.settle(0)).toBe(false);
  });
});
