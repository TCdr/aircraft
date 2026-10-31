// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  COCKPIT_VIEW_FRAMES,
  COCKPIT_VIEW_SELECTION,
  ZoneFrame,
  canListStdDefects,
  steppedSelection,
  steppedZone,
  zoomedInto,
  zonesOfArea,
} from './TechLogbookCockpit';
import { COCKPIT_AREAS, STANDARD_DEFECTS, defectsInZone } from './TechLogbookDefects';

/**
 * @param a a frame
 * @param b another frame
 * @returns whether the frames share some surface
 */
function overlap(a: ZoneFrame, b: ZoneFrame): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * @param f a frame, in percent of the picture
 * @returns whether the frame lies inside the picture
 */
function insidePicture(f: ZoneFrame): boolean {
  return f.x >= 0 && f.y >= 0 && f.x + f.w <= 100.001 && f.y + f.h <= 100.001;
}

describe('COCKPIT INTERFACE pictures', () => {
  it('draws every cockpit area in the cockpit view, inside the picture and without overlap', () => {
    const drawn = new Set(COCKPIT_VIEW_FRAMES.map((f) => f.area));
    expect([...drawn].sort()).toEqual([...COCKPIT_AREAS].sort());
    for (const [i, a] of COCKPIT_VIEW_FRAMES.entries()) {
      expect(insidePicture(a.frame), a.area).toBe(true);
      for (const b of COCKPIT_VIEW_FRAMES.slice(i + 1)) {
        expect(overlap(a.frame, b.frame), `${a.area} / ${b.area}`).toBe(false);
      }
    }
  });

  it('draws the zones of every area inside its picture, without overlap, with a unique name', () => {
    for (const area of COCKPIT_AREAS) {
      const zones = zonesOfArea(area);
      expect(new Set(zones.map((z) => z.id)).size, area).toBe(zones.length);
      for (const [i, a] of zones.entries()) {
        expect(insidePicture(a.frame), `${area} ${a.id}`).toBe(true);
        for (const b of zones.slice(i + 1)) {
          expect(overlap(a.frame, b.frame), `${area}: ${a.id} / ${b.id}`).toBe(false);
        }
      }
    }
  });

  it('gives every drawn zone a standard defect and every standard defect a drawn zone', () => {
    for (const area of COCKPIT_AREAS) {
      for (const zone of zonesOfArea(area)) {
        expect(defectsInZone(area, zone.id).length, `${area} ${zone.id}`).toBeGreaterThan(0);
      }
    }
    for (const defect of STANDARD_DEFECTS) {
      expect(
        zonesOfArea(defect.area).map((z) => z.id),
        defect.title,
      ).toContain(defect.zone);
    }
  });

  it('lists in a zone only the defects of that zone', () => {
    expect(defectsInZone('OVERHEAD PANEL', 'FUEL').map((d) => d.function)).toEqual([
      'FEED PUMPS',
      'FEED PUMPS',
      'FEED PUMPS',
      'CROSSFEED',
    ]);
    expect(defectsInZone('OVERHEAD PANEL', 'APU').map((d) => d.title)).toEqual(['APU START FAULT']);
    expect(defectsInZone('GLARESHIELD', 'FUEL')).toEqual([]);
  });

  it('steps through the zones of an area and wraps around', () => {
    const ids = zonesOfArea('GLARESHIELD').map((z) => z.id);
    expect(ids).toEqual(['CAPT EFIS', 'FCU', 'F/O EFIS']);
    expect(steppedZone('GLARESHIELD', 'FCU', 1)).toBe('F/O EFIS');
    expect(steppedZone('GLARESHIELD', 'F/O EFIS', 1)).toBe('CAPT EFIS');
    expect(steppedZone('GLARESHIELD', 'CAPT EFIS', -1)).toBe('F/O EFIS');
  });

  it('starts at the first zone going forward and at the last one going back when none is selected', () => {
    expect(steppedZone('GLARESHIELD', null, 1)).toBe('CAPT EFIS');
    expect(steppedZone('GLARESHIELD', null, -1)).toBe('F/O EFIS');
    expect(steppedZone('GLARESHIELD', 'NOT IN THIS AREA', 1)).toBe('CAPT EFIS');
  });

  it('zooms into an area with no zone selected, and COCKPIT VIEW leaves the zoom and STD DEFECT', () => {
    const zoomed = zoomedInto('PEDESTAL');
    expect(zoomed).toEqual({ view: 'PEDESTAL', zone: null, stdDefectMode: false });
    expect(COCKPIT_VIEW_SELECTION).toEqual({ view: null, zone: null, stdDefectMode: false });
  });

  it('enables STD DEFECT only when an equipment zone of a zoomed area is selected', () => {
    expect(canListStdDefects(COCKPIT_VIEW_SELECTION)).toBe(false);
    expect(canListStdDefects(zoomedInto('GLARESHIELD'))).toBe(false);
    expect(canListStdDefects({ view: 'GLARESHIELD', zone: 'FCU' })).toBe(true);
  });

  it('steps the selection inside the zoomed area and keeps it in the cockpit view', () => {
    const zoomed = zoomedInto('GLARESHIELD');
    const first = steppedSelection(zoomed, 1);
    expect(first).toEqual({ view: 'GLARESHIELD', zone: 'CAPT EFIS', stdDefectMode: false });
    expect(steppedSelection(first, 1).zone).toBe('FCU');
    expect(steppedSelection({ ...first, stdDefectMode: true }, -1)).toEqual({
      view: 'GLARESHIELD',
      zone: 'F/O EFIS',
      stdDefectMode: true,
    });
    expect(steppedSelection(COCKPIT_VIEW_SELECTION, 1)).toBe(COCKPIT_VIEW_SELECTION);
  });
});
