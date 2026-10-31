// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { exitsToCloseOnMovement } from './doorClosing';

describe('closing the doors when the aircraft moves, is pushed or leaves the ground', () => {
  it('toggles the exit of every open door once (exit = interactive point + 1)', () => {
    expect(exitsToCloseOnMovement([1, 0, 0, 0, 0, 1, 0], true)).toEqual([1, 6]);
  });

  it('toggles a closed door never, a door counts as open from 0.99', () => {
    expect(exitsToCloseOnMovement([0, 0, 0.5, 0.98, 0.99], true)).toEqual([5]);
    expect(exitsToCloseOnMovement([0, 0, 0], true)).toEqual([]);
  });

  it('toggles nothing on the first officer flyPad: two flyPads would open the door again', () => {
    expect(exitsToCloseOnMovement([1, 1, 1], false)).toEqual([]);
  });

  it('treats unread positions as closed', () => {
    expect(exitsToCloseOnMovement([Number.NaN, 1], true)).toEqual([2]);
  });
});
