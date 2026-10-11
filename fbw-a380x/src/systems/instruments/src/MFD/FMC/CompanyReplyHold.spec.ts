// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanyReplyHold } from './CompanyReplyHold';

describe('company datalink reply hold (flyPad reply time)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds a reply until the reply time of its request has passed', async () => {
    const hold = new CompanyReplyHold();
    hold.requested(3, Date.now(), 10_000);

    let delivered = false;
    const delivery = hold.whenDeliverable(3).then(() => (delivered = true));

    await vi.advanceTimersByTimeAsync(9_000);
    expect(delivered).toBe(false);

    await vi.advanceTimersByTimeAsync(1_500);
    await delivery;
    expect(delivered).toBe(true);
  });

  it('keeps the requests of different flight plans apart', async () => {
    const hold = new CompanyReplyHold();
    hold.requested(0, Date.now(), 20_000);
    hold.requested(3, Date.now(), 1_000);

    let secDelivered = false;
    const delivery = hold.whenDeliverable(3).then(() => (secDelivered = true));
    await vi.advanceTimersByTimeAsync(1_500);
    await delivery;
    expect(secDelivered).toBe(true);
  });
});
