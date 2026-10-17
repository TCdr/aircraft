// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  galleryFlowSpan,
  insertOutletsByX,
  isGallerySegmentActive,
  isTransferPumpRunning,
  jettisonGalleryFlow,
} from './FuelGalleryFlow';

// The AFT gallery of the FUEL page: pumps at 182, 274, 524, 626; jettison valves at 190 and 570; link at 438
const aftPumps = (running: boolean) => [182, 274, 524, 626].map((x) => ({ x, active: running }));
const closedValves = [60, 132, 232, 482, 578, 704].map((x) => ({ x, active: false }));

describe('SD FUEL gallery flow', () => {
  it('keeps the transfer rule: no open valve, no green gallery line even with pumps running', () => {
    const span = galleryFlowSpan(aftPumps(true), closedValves);
    expect(span.flowing).toBe(false);
    expect(isGallerySegmentActive(span, 182, 232)).toBe(false);
  });

  it('keeps the transfer rule: green from the first to the last running pump or open valve', () => {
    const span = galleryFlowSpan(aftPumps(true), [{ x: 704, active: true }]);
    expect(isGallerySegmentActive(span, 182, 274)).toBe(true);
    expect(isGallerySegmentActive(span, 626, 704)).toBe(true);
    expect(isGallerySegmentActive(span, 132, 182)).toBe(false);
  });

  it('an open jettison valve is a way out of the AFT gallery', () => {
    const span = galleryFlowSpan(aftPumps(true), closedValves, [
      { x: 190, active: true },
      { x: 570, active: true },
    ]);
    expect(span.flowing).toBe(true);
    expect(isGallerySegmentActive(span, 182, 190)).toBe(true);
    expect(isGallerySegmentActive(span, 524, 570)).toBe(true);
    expect(isGallerySegmentActive(span, 570, 578)).toBe(true);
    expect(isGallerySegmentActive(span, 626, 704)).toBe(false);
  });

  it('splits the gallery line at the outlets, after the valves at the same abscissa', () => {
    const valves = [{ x1: 132 }, { x1: 232 }, { x1: 570 }];
    expect(insertOutletsByX(valves, [{ x1: 190 }, { x1: 570 }, { x1: 600 }]).map((v) => v.x1)).toEqual([
      132, 190, 232, 570, 570, 600,
    ]);
  });
});

describe('SD FUEL jettison flow', () => {
  it('runs the transfer pumps and links the FWD gallery to the AFT gallery while the jettison is in progress', () => {
    expect(jettisonGalleryFlow(true, true, true, false)).toEqual({
      transferPumpsRun: true,
      galleryLinkActive: true,
      leftOutletActive: true,
      rightOutletActive: true,
    });
  });

  it('adds nothing outside a jettison; the link keeps the aux refuel valve rule', () => {
    expect(jettisonGalleryFlow(false, false, false, false)).toEqual({
      transferPumpsRun: false,
      galleryLinkActive: false,
      leftOutletActive: false,
      rightOutletActive: false,
    });
    expect(jettisonGalleryFlow(false, false, false, true).galleryLinkActive).toBe(true);
  });

  it('a jettison valve stuck closed is not an outlet', () => {
    const flow = jettisonGalleryFlow(true, false, true, false);
    expect(flow.leftOutletActive).toBe(false);
    expect(flow.rightOutletActive).toBe(true);
  });

  it('shows a transfer pump running for the jettison unless its pb-sw is OFF or it is failed', () => {
    const jettison = jettisonGalleryFlow(true, true, true, false);
    const none = jettisonGalleryFlow(false, false, false, false);
    expect(isTransferPumpRunning(false, jettison, false, false)).toBe(true);
    expect(isTransferPumpRunning(false, jettison, true, false)).toBe(false);
    expect(isTransferPumpRunning(false, jettison, false, true)).toBe(false);
    expect(isTransferPumpRunning(false, none, false, false)).toBe(false);
    expect(isTransferPumpRunning(true, none, false, false)).toBe(true);
  });

  it('the FUEL page gives the jettison outlets to both galleries and the link line', () => {
    const page = readFileSync(resolve(__dirname, 'FuelPage.tsx'), 'utf8');
    expect(page).toContain('outlets={fwdGalleryOutlets}');
    expect(page).toContain('outlets={aftGalleryOutlets}');
    expect(page).toContain('active={jettisonFlow.galleryLinkActive}');
    expect(page.match(/running: isTransferPumpRunning\(/g)).toHaveLength(10);
  });
});
