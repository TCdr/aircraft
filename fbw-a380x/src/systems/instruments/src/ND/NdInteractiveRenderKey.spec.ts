// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { NdInteractiveState } from '@shared/NdInteractive';
import { ndInteractiveButtonsKey, ndInteractivePageKey } from './NdInteractiveRenderKey';

const element = (ident: string, databaseId: string) => ({ ident, databaseId }) as NdInteractiveState['waypoints'][0];

const base = (): NdInteractiveState => ({
  tmpy: true,
  directTo: true,
  directToTarget: 'ABC',
  directToDistance: 12.34,
  directToUtc: 12 * 3600 + 34 * 60,
  directToCourse: null,
  waypoints: [element('ABC', 'a'), element('DEF', 'd')],
});

describe('ndInteractivePageKey', () => {
  // The FMS republishes every 500 ms with the raw distance and ETA: those must not rebuild the page
  it('ignores a distance that rounds to the same value and an ETA inside the same minute', () => {
    const later = { ...base(), directToDistance: 12.44, directToUtc: 12 * 3600 + 34 * 60 + 20 };
    expect(ndInteractivePageKey(later)).toBe(ndInteractivePageKey(base()));
  });

  it('changes with the rounded distance', () => {
    expect(ndInteractivePageKey({ ...base(), directToDistance: 12.6 })).not.toBe(ndInteractivePageKey(base()));
  });

  it('changes with the displayed UTC minute', () => {
    expect(ndInteractivePageKey({ ...base(), directToUtc: 12 * 3600 + 35 * 60 })).not.toBe(
      ndInteractivePageKey(base()),
    );
  });

  it('changes with the directTo and tmpy flags', () => {
    expect(ndInteractivePageKey({ ...base(), directTo: false })).not.toBe(ndInteractivePageKey(base()));
    expect(ndInteractivePageKey({ ...base(), tmpy: false })).not.toBe(ndInteractivePageKey(base()));
  });

  it('changes with the waypoint list', () => {
    expect(ndInteractivePageKey({ ...base(), waypoints: [element('ABC', 'a')] })).not.toBe(
      ndInteractivePageKey(base()),
    );
    expect(ndInteractivePageKey({ ...base(), waypoints: [element('ABC', 'a'), element('XYZ', 'x')] })).not.toBe(
      ndInteractivePageKey(base()),
    );
  });

  it('changes with the course and its true flag', () => {
    const withCourse = { ...base(), directToCourse: { course: 90.2, isTrue: false } };
    expect(ndInteractivePageKey(withCourse)).not.toBe(ndInteractivePageKey(base()));
    expect(ndInteractivePageKey({ ...withCourse, directToCourse: { course: 90.4, isTrue: false } })).toBe(
      ndInteractivePageKey(withCourse),
    );
    expect(ndInteractivePageKey({ ...withCourse, directToCourse: { course: 90.2, isTrue: true } })).not.toBe(
      ndInteractivePageKey(withCourse),
    );
  });

  it('ignores the distance when no DIR TO is active', () => {
    const a = { ...base(), directTo: false, directToDistance: 5 };
    expect(ndInteractivePageKey({ ...a, directToDistance: 9 })).toBe(ndInteractivePageKey(a));
  });
});

describe('ndInteractiveButtonsKey', () => {
  it('only depends on the flags that pick the buttons', () => {
    const later = { ...base(), directToDistance: 99, directToUtc: 0 };
    expect(ndInteractiveButtonsKey(later)).toBe(ndInteractiveButtonsKey(base()));
    expect(ndInteractiveButtonsKey({ ...base(), directTo: false })).not.toBe(ndInteractiveButtonsKey(base()));
    expect(ndInteractiveButtonsKey({ ...base(), tmpy: false })).not.toBe(ndInteractiveButtonsKey(base()));
  });
});
