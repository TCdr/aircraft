// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { COCKPIT_AREAS, CockpitArea } from './TechLogbookDefects';

/*
 * The pictures of the COCKPIT INTERFACE assistant. The real assistant shows a cockpit photograph with framed areas, a
 * click zooms into an area, and the successive zooming ends on an equipment zone that enables STD DEFECT. No
 * photograph is available, so both pictures are drawn from plain frames: the cockpit seen from the seats (design
 * choice), and one picture per area with its equipment zones.
 */

/** A frame inside a picture, in percent of the picture width and height */
export interface ZoneFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** What a frame is drawn with: rows of pushbuttons, a display screen, or a seat */
export type ZoneLook = 'buttons' | 'screens' | 'seat';

/** A frame of the cockpit view: clicking it zooms into its area */
export interface CockpitViewFrame {
  readonly area: CockpitArea;
  readonly frame: ZoneFrame;
  readonly look: ZoneLook;
}

/** An equipment zone of the picture of an area: selecting it enables STD DEFECT */
export interface AreaZone {
  readonly id: string;
  readonly frame: ZoneFrame;
  readonly look: ZoneLook;
}

/**
 * @param x the left edge, in percent of the picture width
 * @param y the top edge, in percent of the picture height
 * @param w the width, in percent of the picture width
 * @param h the height, in percent of the picture height
 * @returns the frame
 */
function frame(x: number, y: number, w: number, h: number): ZoneFrame {
  return { x, y, w, h };
}

/** The windshield panes behind the panels: drawn in the cockpit view, not clickable */
export const COCKPIT_VIEW_WINDOWS: readonly ZoneFrame[] = [frame(2, 2, 24, 26), frame(74, 2, 24, 26)];

/** The cockpit seen from the seats: overhead panel on top, glareshield, the main panels, the pedestal below */
export const COCKPIT_VIEW_FRAMES: readonly CockpitViewFrame[] = [
  { area: 'OVERHEAD PANEL', frame: frame(28, 2, 44, 26), look: 'buttons' },
  { area: 'GLARESHIELD', frame: frame(8, 30, 84, 7), look: 'buttons' },
  { area: 'CAPT MAIN PANEL', frame: frame(6, 40, 32, 24), look: 'screens' },
  { area: 'CENTER PANEL', frame: frame(40, 40, 20, 24), look: 'screens' },
  { area: 'F/O MAIN PANEL', frame: frame(62, 40, 32, 24), look: 'screens' },
  { area: 'PEDESTAL', frame: frame(38, 66, 24, 31), look: 'buttons' },
  { area: 'CAPT SIDE CONSOLE', frame: frame(2, 66, 20, 31), look: 'buttons' },
  { area: 'F/O SIDE CONSOLE', frame: frame(78, 66, 20, 31), look: 'buttons' },
  { area: 'COCKPIT AREA', frame: frame(24, 72, 12, 25), look: 'seat' },
  { area: 'COCKPIT AREA', frame: frame(64, 72, 12, 25), look: 'seat' },
];

const PICTURE_MARGIN = 3;
const PICTURE_GAP = 2;

interface ZoneDefinition {
  readonly id: string;
  readonly look: ZoneLook;
}

/**
 * @param id the name of the zone
 * @returns a zone of pushbuttons
 */
function buttons(id: string): ZoneDefinition {
  return { id, look: 'buttons' };
}

/**
 * @param id the name of the zone
 * @returns a seat
 */
function seat(id: string): ZoneDefinition {
  return { id, look: 'seat' };
}

/**
 * @param id the name of the zone
 * @returns a zone with a display screen
 */
function screen(id: string): ZoneDefinition {
  return { id, look: 'screens' };
}

/** The zones of each area, by picture row. Every zone has at least one standard defect (see the spec) */
const AREA_ROWS: Readonly<Record<CockpitArea, readonly (readonly ZoneDefinition[])[]>> = {
  'OVERHEAD PANEL': [
    [buttons('HYD'), buttons('FIRE'), buttons('APU')],
    [buttons('FUEL'), buttons('ICE & RAIN'), buttons('AIR COND')],
    [buttons('LIGHTING'), buttons('EXTERIOR LIGHTS'), buttons('ENG START')],
  ],
  GLARESHIELD: [[buttons('CAPT EFIS'), buttons('FCU'), buttons('F/O EFIS')]],
  'CAPT MAIN PANEL': [[screen('CAPT PFD'), screen('CAPT ND')], [buttons('CLOCK')]],
  'CENTER PANEL': [[screen('EWD')], [screen('SD')], [screen('ISIS')]],
  'F/O MAIN PANEL': [[screen('F/O PFD'), screen('F/O ND')]],
  PEDESTAL: [
    [buttons('KCCU'), buttons('RMP'), buttons('WXR')],
    [buttons('THRUST LEVERS'), buttons('SPEED BRAKE'), buttons('PARKING BRAKE')],
    [buttons('PRINTER'), buttons('COCKPIT DOOR')],
  ],
  'CAPT SIDE CONSOLE': [
    [buttons('SIDESTICK'), buttons('TILLER')],
    [screen('OIT'), buttons('OXYGEN')],
    [buttons('READING LIGHT')],
  ],
  'F/O SIDE CONSOLE': [[buttons('SIDESTICK'), screen('OIT')]],
  'COCKPIT AREA': [
    [buttons('WINDOWS'), seat('SEATS')],
    [buttons('AIR OUTLETS'), buttons('OTHER')],
  ],
};

/**
 * Lays the zones of an area out as rows of equal frames filling the picture.
 * @param rows the zones by row
 * @returns the zones with their frames
 */
function layOut(rows: readonly (readonly ZoneDefinition[])[]): AreaZone[] {
  const rowHeight = (100 - 2 * PICTURE_MARGIN - (rows.length - 1) * PICTURE_GAP) / rows.length;
  const zones: AreaZone[] = [];
  rows.forEach((row, rowIndex) => {
    const width = (100 - 2 * PICTURE_MARGIN - (row.length - 1) * PICTURE_GAP) / row.length;
    row.forEach((zone, columnIndex) => {
      zones.push({
        id: zone.id,
        look: zone.look,
        frame: frame(
          PICTURE_MARGIN + columnIndex * (width + PICTURE_GAP),
          PICTURE_MARGIN + rowIndex * (rowHeight + PICTURE_GAP),
          width,
          rowHeight,
        ),
      });
    });
  });
  return zones;
}

const AREA_ZONES = {} as Record<CockpitArea, readonly AreaZone[]>;
for (const area of COCKPIT_AREAS) {
  AREA_ZONES[area] = layOut(AREA_ROWS[area]);
}

/**
 * @param area the cockpit area
 * @returns the equipment zones of its picture, in picture order (rows from the top, left to right)
 */
export function zonesOfArea(area: CockpitArea): readonly AreaZone[] {
  return AREA_ZONES[area];
}

/**
 * The previous or next equipment zone of the picture, as the arrows of NAVIGATION move the selection.
 * @param area the area of the picture
 * @param zone the zone selected, null when none
 * @param delta -1 for the previous zone, 1 for the next one; the picture wraps around
 * @returns the zone to select: with no zone selected, the first one going forward and the last one going back
 */
export function steppedZone(area: CockpitArea, zone: string | null, delta: -1 | 1): string {
  const ids = zonesOfArea(area).map((z) => z.id);
  const index = zone === null ? -1 : ids.indexOf(zone);
  if (index < 0) {
    return delta > 0 ? ids[0] : ids[ids.length - 1];
  }
  return ids[(index + delta + ids.length) % ids.length];
}

/** What the crew has selected in the COCKPIT INTERFACE assistant */
export interface CockpitSelection {
  /** The area the picture is zoomed into, null for the cockpit view */
  readonly view: CockpitArea | null;
  /** The equipment zone selected in the picture of the area, null when none */
  readonly zone: string | null;
  /** STD DEFECT is shown instead of the picture */
  readonly stdDefectMode: boolean;
}

/** COCKPIT VIEW: the whole cockpit, nothing selected */
export const COCKPIT_VIEW_SELECTION: CockpitSelection = { view: null, zone: null, stdDefectMode: false };

/**
 * @param area the area the crew clicked in the cockpit view
 * @returns the selection zoomed into the area, with no zone yet
 */
export function zoomedInto(area: CockpitArea): CockpitSelection {
  return { view: area, zone: null, stdDefectMode: false };
}

/**
 * The arrows of NAVIGATION.
 * @param selection the current selection
 * @param delta -1 for the previous zone, 1 for the next one
 * @returns the selection with the neighbouring zone, unchanged in the cockpit view where no zone is drawn
 */
export function steppedSelection(selection: CockpitSelection, delta: -1 | 1): CockpitSelection {
  if (selection.view === null) {
    return selection;
  }
  return { ...selection, zone: steppedZone(selection.view, selection.zone, delta) };
}

/**
 * @param selection the current selection
 * @returns whether STD DEFECT can be chosen: it needs an equipment zone
 */
export function canListStdDefects(selection: Pick<CockpitSelection, 'view' | 'zone'>): boolean {
  return selection.view !== null && selection.zone !== null;
}
