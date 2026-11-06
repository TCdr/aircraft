// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it } from 'vitest';
import {
  GSX_REACTION_TIMEOUT_MS,
  GsxMoveSigns,
  RELEASE_PENDING_TIMEOUT_MS,
  ReleasePendingMemory,
  equipmentStillThere,
} from './releasePending';

const PRESS_TIME = 1_000_000;
const SECOND = 1_000;

describe('Released ground equipment (GPU, jet bridge, stairs)', () => {
  let memory: ReleasePendingMemory;
  beforeEach(() => {
    memory = new ReleasePendingMemory();
  });

  it('shows the released look at once while GSX still reports the GPU performing', () => {
    memory.click('gpu', 'active', PRESS_TIME);

    // GSX keeps the GPU 'performing' (look 'active') and EXT PWR available until its crew has removed it
    const stillThere = equipmentStillThere('active', true);
    expect(memory.look('gpu', 'active', stillThere, PRESS_TIME + 30 * SECOND)).toBe('released');
    expect(memory.isPending('gpu', stillThere, PRESS_TIME + 30 * SECOND)).toBe(true);
  });

  it('keeps the released look while the GPU still powers the aircraft, whatever GSX or the sim says', () => {
    memory.click('gpu', 'active', PRESS_TIME);

    expect(memory.look('gpu', 'inactive', equipmentStillThere('inactive', true), PRESS_TIME + SECOND)).toBe('released');
  });

  it('goes back to what GSX or the sim says once the equipment is gone', () => {
    memory.click('jetBridge', 'active', PRESS_TIME);

    const gone = equipmentStillThere('inactive');
    expect(gone).toBe(false);
    expect(memory.look('jetBridge', 'inactive', gone, PRESS_TIME + 40 * SECOND)).toBe('inactive');
  });

  it('goes back to what GSX or the sim says after the timeout, the equipment still there', () => {
    memory.click('stairs', 'active', PRESS_TIME);

    const stillThere = equipmentStillThere('active');
    expect(memory.look('stairs', 'active', stillThere, PRESS_TIME + RELEASE_PENDING_TIMEOUT_MS - 1)).toBe('released');
    expect(memory.look('stairs', 'active', stillThere, PRESS_TIME + RELEASE_PENDING_TIMEOUT_MS)).toBe('active');
  });

  it('lets a later Request work normally once the equipment has left', () => {
    memory.click('gpu', 'active', PRESS_TIME);
    // the GPU leaves: the page settles the release
    memory.settle('gpu', equipmentStillThere('inactive'), PRESS_TIME + 60 * SECOND);

    // Request again: not a release
    memory.click('gpu', 'inactive', PRESS_TIME + 70 * SECOND);
    expect(memory.look('gpu', 'called', equipmentStillThere('called'), PRESS_TIME + 75 * SECOND)).toBe('called');
    // connected again within the timeout of the first release: shown connected, not leaving
    expect(memory.look('gpu', 'active', equipmentStillThere('active', true), PRESS_TIME + 90 * SECOND)).toBe('active');
  });

  it('does not take a Request or a click on a busy row for a release', () => {
    memory.click('gpu', 'inactive', PRESS_TIME);
    memory.click('stairs', 'called', PRESS_TIME);

    expect(memory.look('gpu', 'active', true, PRESS_TIME + SECOND)).toBe('active');
    expect(memory.look('stairs', 'active', true, PRESS_TIME + SECOND)).toBe('active');
  });

  it('forgets a release GSX did not accept', () => {
    memory.click('jetBridge', 'active', PRESS_TIME);
    memory.cancel('jetBridge');

    expect(memory.look('jetBridge', 'active', true, PRESS_TIME + SECOND)).toBe('active');
  });

  it('keeps a disabled or hidden row as it is (pushback, aircraft moving)', () => {
    memory.click('gpu', 'active', PRESS_TIME);

    expect(memory.look('gpu', 'disabled', true, PRESS_TIME + SECOND)).toBe('disabled');
    expect(memory.look('gpu', 'hidden', true, PRESS_TIME + SECOND)).toBe('hidden');
  });

  it('keeps each row on its own', () => {
    memory.click('gpu', 'active', PRESS_TIME);

    expect(memory.look('jetBridge', 'active', true, PRESS_TIME + SECOND)).toBe('active');
  });

  it('tells its listeners about a release and its end', () => {
    let notified = 0;
    const unsubscribe = memory.subscribe(() => notified++);

    memory.click('gpu', 'active', PRESS_TIME);
    memory.cancel('gpu');
    unsubscribe();
    memory.click('gpu', 'active', PRESS_TIME);

    expect(notified).toBe(2);
  });
});

describe('Release of a docked GSX jet bridge or stairs that GSX ignores', () => {
  let memory: ReleasePendingMemory;
  beforeEach(() => {
    memory = new ReleasePendingMemory();
  });

  const STILL_DOCKED: GsxMoveSigns = { stillDocked: true, menuShown: false, menuClosedAt: 0 };
  const MOVING: GsxMoveSigns = { stillDocked: false, menuShown: false, menuClosedAt: 0 };

  it('shows "Leaving" while GSX may still react, then offers the release again once GSX has not moved it', () => {
    memory.click('jetBridge', 'active', PRESS_TIME, true);

    const justBefore = PRESS_TIME + GSX_REACTION_TIMEOUT_MS - 1;
    expect(memory.look('jetBridge', 'active', true, justBefore, STILL_DOCKED)).toBe('released');
    expect(memory.ignored('jetBridge', true, justBefore, STILL_DOCKED)).toBe(false);

    const after = PRESS_TIME + GSX_REACTION_TIMEOUT_MS;
    expect(memory.look('jetBridge', 'active', true, after, STILL_DOCKED)).toBe('active');
    expect(memory.ignored('jetBridge', true, after, STILL_DOCKED)).toBe(true);
  });

  it('keeps "Leaving" until the equipment is gone once GSX has started moving it', () => {
    memory.click('stairs', 'active', PRESS_TIME, true);

    // GSX reports the undocking 'performing' (look 'active') until the move is done
    const later = PRESS_TIME + 40 * SECOND;
    expect(memory.look('stairs', 'active', true, later, MOVING)).toBe('released');
    expect(memory.ignored('stairs', true, later, MOVING)).toBe(false);
    expect(memory.look('stairs', 'inactive', false, PRESS_TIME + 50 * SECOND, MOVING)).toBe('inactive');
  });

  it('keeps the Retry offer after the page settles it, and shows "Leaving" again on the Retry press', () => {
    memory.click('jetBridge', 'active', PRESS_TIME, true);
    const ignoredAt = PRESS_TIME + GSX_REACTION_TIMEOUT_MS + SECOND;
    memory.settle('jetBridge', true, ignoredAt);
    expect(memory.ignored('jetBridge', true, ignoredAt, STILL_DOCKED)).toBe(true);

    memory.click('jetBridge', 'active', ignoredAt, true);
    expect(memory.look('jetBridge', 'active', true, ignoredAt + SECOND, STILL_DOCKED)).toBe('released');
    expect(memory.ignored('jetBridge', true, ignoredAt + SECOND, STILL_DOCKED)).toBe(false);
  });

  it('still waits the full timeout for the GPU, which GSX keeps performing while its crew unplugs it', () => {
    memory.click('gpu', 'active', PRESS_TIME);

    const almostTimeout = PRESS_TIME + RELEASE_PENDING_TIMEOUT_MS - 1;
    expect(memory.look('gpu', 'active', true, almostTimeout, STILL_DOCKED)).toBe('released');
    expect(memory.ignored('gpu', true, almostTimeout, STILL_DOCKED)).toBe(false);
  });
});

describe('Release of a docked GSX jet bridge or stairs while GSX asks a question', () => {
  let memory: ReleasePendingMemory;
  beforeEach(() => {
    memory = new ReleasePendingMemory();
  });

  const ASKING: GsxMoveSigns = { stillDocked: true, menuShown: true, menuClosedAt: 0 };
  const answeredAt = (menuClosedAt: number): GsxMoveSigns => ({ stillDocked: true, menuShown: false, menuClosedAt });

  it('waits for the answer, however long GSX keeps its question open, without offering Retry', () => {
    memory.click('stairs', 'active', PRESS_TIME, true);

    const later = PRESS_TIME + 30 * SECOND;
    expect(memory.look('stairs', 'active', true, later, ASKING)).toBe('released');
    expect(memory.ignored('stairs', true, later, ASKING)).toBe(false);
    expect(memory.asking('stairs', true, later, ASKING)).toBe(true);
  });

  it('gives GSX the full reaction time again from the answer, then offers Retry', () => {
    memory.click('jetBridge', 'active', PRESS_TIME, true);
    const answer = PRESS_TIME + 30 * SECOND;
    const answered = answeredAt(answer);

    expect(memory.asking('jetBridge', true, answer + SECOND, answered)).toBe(false);
    expect(memory.look('jetBridge', 'active', true, answer + GSX_REACTION_TIMEOUT_MS - 1, answered)).toBe('released');
    expect(memory.look('jetBridge', 'active', true, answer + GSX_REACTION_TIMEOUT_MS, answered)).toBe('active');
    expect(memory.ignored('jetBridge', true, answer + GSX_REACTION_TIMEOUT_MS, answered)).toBe(true);
  });

  it('is not delayed by the menu GSX opens and closes on its own right after the press', () => {
    memory.click('jetBridge', 'active', PRESS_TIME, true);
    const flashedMenu = answeredAt(PRESS_TIME + 300);

    expect(memory.look('jetBridge', 'active', true, PRESS_TIME + 1500, { ...flashedMenu, stillDocked: false })).toBe(
      'released',
    );
    expect(memory.ignored('jetBridge', true, PRESS_TIME + GSX_REACTION_TIMEOUT_MS + 300, flashedMenu)).toBe(true);
  });

  it('does not take a menu closed before the press for an answer', () => {
    memory.click('jetBridge', 'active', PRESS_TIME, true);

    expect(
      memory.ignored('jetBridge', true, PRESS_TIME + GSX_REACTION_TIMEOUT_MS, answeredAt(PRESS_TIME - 60 * SECOND)),
    ).toBe(true);
  });

  it('leaves the GPU release as it was while GSX shows its menu', () => {
    memory.click('gpu', 'active', PRESS_TIME);

    expect(memory.asking('gpu', true, PRESS_TIME + SECOND, ASKING)).toBe(false);
    expect(memory.look('gpu', 'active', true, PRESS_TIME + RELEASE_PENDING_TIMEOUT_MS - 1, ASKING)).toBe('released');
  });
});

describe('Release of a docked GSX jet bridge or stairs that is held before it is sent', () => {
  const STILL_DOCKED: GsxMoveSigns = { stillDocked: true, menuShown: false, menuClosedAt: 0 };
  const HELD_MS = 9 * SECOND;

  it('counts the reaction time from the moment the trigger is sent, not from the press', () => {
    const memory = new ReleasePendingMemory();
    memory.click('jetBridge', 'active', PRESS_TIME, true, HELD_MS);

    // 10 s after the press, GSX has had the trigger for only 1 s
    const tenSecondsAfterPress = PRESS_TIME + GSX_REACTION_TIMEOUT_MS;
    expect(memory.look('jetBridge', 'active', true, tenSecondsAfterPress, STILL_DOCKED)).toBe('released');
    expect(memory.ignored('jetBridge', true, tenSecondsAfterPress, STILL_DOCKED)).toBe(false);

    const sentAt = PRESS_TIME + HELD_MS;
    expect(memory.ignored('jetBridge', true, sentAt + GSX_REACTION_TIMEOUT_MS - 1, STILL_DOCKED)).toBe(false);
    expect(memory.ignored('jetBridge', true, sentAt + GSX_REACTION_TIMEOUT_MS, STILL_DOCKED)).toBe(true);
  });
});
