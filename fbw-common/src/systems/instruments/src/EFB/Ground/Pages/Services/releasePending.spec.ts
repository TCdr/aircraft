// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it } from 'vitest';
import { RELEASE_PENDING_TIMEOUT_MS, ReleasePendingMemory, equipmentStillThere } from './releasePending';

const PRESS_TIME = 1_000_000;
const SECOND = 1_000;

describe('Released ground equipment (GPU, jet bridge, stairs)', () => {
  let memory: ReleasePendingMemory;
  beforeEach(() => {
    memory = new ReleasePendingMemory();
  });

  it('shows the released look at once while GSX still reports the GPU performing (the 2026-10-15 sim bug)', () => {
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
