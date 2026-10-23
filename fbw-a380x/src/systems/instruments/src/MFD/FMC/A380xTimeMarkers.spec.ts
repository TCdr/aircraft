// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { A380xTimeMarkers, TimeMarkerStorage } from './A380xTimeMarkers';
import { NXSystemMessages } from '../shared/NXSystemMessages';

function createFixture() {
  const stored = [0, 1, 2, 3].map(() => ({ utcSeconds: null as number | null, aural: false }));
  const storage: TimeMarkerStorage = {
    read: (index) => ({ ...stored[index] }),
    write: (index, utcSeconds, aural) => {
      stored[index] = { utcSeconds, aural };
    },
  };
  const state = { now: 36_000, reference: 36_000 };
  const messages: unknown[] = [];
  const markers = new A380xTimeMarkers(
    {
      utcSeconds: () => state.now,
      predictionReferenceUtcSeconds: () => state.reference,
      addMessageToQueue: (message) => messages.push(message),
    },
    storage,
  );

  return { markers, state, messages, stored };
}

describe('A380X time markers', () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    fixture = createFixture();
  });

  it('are predicted from the prediction reference (the ETT in preflight)', () => {
    fixture.markers.setUtc(0, 36_600);
    fixture.markers.setUtc(2, 36_000 - 60);
    fixture.state.reference = 35_000;

    expect(fixture.markers.predictions()).toEqual([
      { utcSeconds: 36_600, secondsFromPresent: 1600 },
      { utcSeconds: 35_940, secondsFromPresent: 940 },
    ]);
  });

  it('are shared with the other FMC through the storage', () => {
    fixture.markers.setUtc(1, 40_000);
    fixture.markers.setAural(1, true);
    const other = new A380xTimeMarkers(
      { utcSeconds: () => 36_000, predictionReferenceUtcSeconds: () => 36_000, addMessageToQueue: vi.fn() },
      { read: (index) => ({ ...fixture.stored[index] }), write: vi.fn() },
    );

    other.update();

    expect(other.utc[1].get()).toBe(40_000);
    expect(other.aural[1].get()).toBe(true);
  });

  it('post TIME MARKER REACHED once when reached, and are deleted', () => {
    fixture.markers.setUtc(0, 36_005);
    fixture.markers.update();
    fixture.state.now = 36_004;
    fixture.markers.update();
    expect(fixture.messages).toEqual([]);

    fixture.state.now = 36_006;
    fixture.markers.update();
    fixture.state.now = 36_010;
    fixture.markers.update();

    expect(fixture.messages).toEqual([NXSystemMessages.timeMarkerReached]);
    expect(fixture.markers.utc[0].get()).toBeNull();
  });

  it('are not reached while far ahead', () => {
    fixture.markers.setUtc(0, 40_000);
    fixture.markers.update();
    fixture.state.now = 38_000;
    fixture.markers.update();

    expect(fixture.messages).toEqual([]);
    expect(fixture.markers.utc[0].get()).toBe(40_000);
  });
});
