// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { formatWaypoint, SndPoint } from './SndGeo';
import { SND_MAX_WAYPOINTS, SndNavigator } from './SndNavigator';

/** The SND menu (FCOM DSC-34-10-20-30, MENU pb) */
export const SND_MENU_ITEMS = ['INSERT WPT', 'INSERT FIX', 'EDIT WPT / FIX', 'CLEAR WPT / FIX'] as const;

enum Item {
  InsertWpt,
  InsertFix,
  EditWpt,
  ClearWpt,
}

/** A part of the coordinates being entered; the active one is the one the SET/SEL knob changes */
export interface SndEditorField {
  text: string;
  active: boolean;
}

/**
 * Coordinates entered with the SET/SEL knob, one field after the other: latitude hemisphere, degrees, minutes, tenths of
 * minutes, then the same for the longitude. Turning the knob changes the active field, pressing it goes to the next one.
 */
export class SndCoordinateEditor {
  // [N/S, degrees, minutes, tenths, E/W, degrees, minutes, tenths]
  private readonly values: number[];

  private field = 0;

  private static readonly RANGES = [2, 90, 60, 10, 2, 180, 60, 10];

  constructor(initial: SndPoint) {
    const split = (value: number) => {
      const tenths = Math.round(Math.abs(value) * 600);
      return [value < 0 ? 1 : 0, Math.floor(tenths / 600), Math.floor((tenths % 600) / 10), tenths % 10];
    };
    this.values = [...split(Math.max(-89.99, Math.min(89.99, initial.lat))), ...split(initial.lon)];
    if (this.values[5] >= 180) {
      this.values[5] = 179;
    }
  }

  turn(steps: number): void {
    const range = SndCoordinateEditor.RANGES[this.field];
    this.values[this.field] = (((this.values[this.field] + steps) % range) + range) % range;
  }

  /** Goes to the next field; true when all the fields are entered */
  next(): boolean {
    this.field++;
    return this.field >= this.values.length;
  }

  get point(): SndPoint {
    const [ns, latD, latM, latT, ew, lonD, lonM, lonT] = this.values;
    const lat = latD + (latM + latT / 10) / 60;
    const lon = lonD + (lonM + lonT / 10) / 60;
    return { lat: ns ? -lat : lat, lon: ew ? -lon : lon };
  }

  /** e.g. N 50 12.5 / E 012 00.3, in parts */
  get fields(): SndEditorField[] {
    const v = this.values;
    const texts = [
      v[0] ? 'S' : 'N',
      v[1].toString().padStart(2, '0'),
      v[2].toString().padStart(2, '0'),
      v[3].toString(),
      v[4] ? 'W' : 'E',
      v[5].toString().padStart(3, '0'),
      v[6].toString().padStart(2, '0'),
      v[7].toString(),
    ];
    return texts.map((text, i) => ({ text, active: i === this.field }));
  }
}

/** What the lower part of the SND shows when a menu is displayed */
export type SndMenuView =
  | { title: string; kind: 'item' }
  | { title: string; kind: 'coordinates'; fields: SndEditorField[] }
  | { title: string; kind: 'waypoint'; text: string };

type State =
  | { kind: 'closed' }
  | { kind: 'items'; item: number }
  | { kind: 'select'; purpose: 'edit' | 'clear' | 'dirto'; index: number }
  | {
      kind: 'coordinates';
      purpose: 'insert' | 'fix' | 'edit' | 'dirto';
      index: number;
      editor: SndCoordinateEditor;
    };

/**
 * The SND menu and the DIR TO (FCOM DSC-34-10-20-30 and -50). MENU pb: the first item of the menu, MENU again: exit.
 * SET/SEL knob: turned, scrolls the items (or the values of the selected item); pressed, selects. LS/DIR TO pb: DIR TO a
 * waypoint of the list (which activates the navigation), or to new coordinates when there is no list. EDIT and CLEAR
 * WPT / FIX choose among the waypoints, then the FIX.
 */
export class SndMenu {
  private state: State = { kind: 'closed' };

  constructor(private readonly navigator: SndNavigator) {}

  /** The points EDIT and CLEAR WPT / FIX choose from: the waypoints, then the FIX when there is one */
  private get editableCount(): number {
    return this.navigator.waypoints.length + (this.navigator.fix !== null ? 1 : 0);
  }

  /** The FIX is after the waypoints */
  private isFix(index: number): boolean {
    return index === this.navigator.waypoints.length;
  }

  get isOpen(): boolean {
    return this.state.kind !== 'closed';
  }

  pressMenu(): void {
    this.state = this.state.kind === 'closed' ? { kind: 'items', item: 0 } : { kind: 'closed' };
  }

  pressDirTo(aircraft: SndPoint | null): void {
    const inDirTo =
      (this.state.kind === 'select' || this.state.kind === 'coordinates') && this.state.purpose === 'dirto';
    if (inDirTo || aircraft === null) {
      this.state = { kind: 'closed' };
      return;
    }
    const list = this.navigator.waypoints;
    this.state =
      list.length > 0
        ? { kind: 'select', purpose: 'dirto', index: Math.max(0, this.navigator.toIndex) }
        : { kind: 'coordinates', purpose: 'dirto', index: 0, editor: new SndCoordinateEditor(aircraft) };
  }

  turn(steps: number): void {
    const s = this.state;
    switch (s.kind) {
      case 'items':
        s.item = (((s.item + steps) % SND_MENU_ITEMS.length) + SND_MENU_ITEMS.length) % SND_MENU_ITEMS.length;
        break;
      case 'select': {
        const n = s.purpose === 'dirto' ? this.navigator.waypoints.length : this.editableCount;
        s.index = (((s.index + steps) % n) + n) % n;
        break;
      }
      case 'coordinates':
        s.editor.turn(steps);
        break;
      default:
        break;
    }
  }

  press(aircraft: SndPoint | null): void {
    const s = this.state;
    const list = this.navigator.waypoints;
    switch (s.kind) {
      case 'items':
        if (s.item === Item.InsertWpt && list.length < SND_MAX_WAYPOINTS) {
          const initial = list[list.length - 1] ?? aircraft ?? { lat: 0, lon: 0 };
          this.state = { kind: 'coordinates', purpose: 'insert', index: 0, editor: new SndCoordinateEditor(initial) };
        } else if (s.item === Item.InsertFix) {
          // One FIX: a new one replaces it
          const initial = this.navigator.fix ?? aircraft ?? { lat: 0, lon: 0 };
          this.state = { kind: 'coordinates', purpose: 'fix', index: 0, editor: new SndCoordinateEditor(initial) };
        } else if ((s.item === Item.EditWpt || s.item === Item.ClearWpt) && this.editableCount > 0) {
          this.state = { kind: 'select', purpose: s.item === Item.EditWpt ? 'edit' : 'clear', index: 0 };
        }
        break;
      case 'select':
        if (s.purpose === 'edit') {
          const point = this.isFix(s.index) ? this.navigator.fix : list[s.index];
          this.state = point
            ? { kind: 'coordinates', purpose: 'edit', index: s.index, editor: new SndCoordinateEditor(point) }
            : { kind: 'closed' };
        } else if (s.purpose === 'clear') {
          if (this.isFix(s.index)) {
            this.navigator.clearFix();
          } else {
            this.navigator.clear(s.index);
          }
          this.state = { kind: 'closed' };
        } else if (aircraft !== null) {
          this.navigator.directTo(s.index, aircraft);
          this.state = { kind: 'closed' };
        }
        break;
      case 'coordinates':
        if (s.editor.next()) {
          if (s.purpose === 'insert') {
            this.navigator.insert(s.editor.point);
          } else if (s.purpose === 'fix' || (s.purpose === 'edit' && this.isFix(s.index))) {
            this.navigator.setFix(s.editor.point);
          } else if (s.purpose === 'edit') {
            this.navigator.edit(s.index, s.editor.point);
          } else if (aircraft !== null) {
            this.navigator.directToNew(s.editor.point, aircraft);
          }
          this.state = { kind: 'closed' };
        }
        break;
      default:
        break;
    }
  }

  get view(): SndMenuView | null {
    const s = this.state;
    const list = this.navigator.waypoints;
    const titles = {
      insert: 'INSERT WPT',
      fix: 'INSERT FIX',
      edit: 'EDIT WPT / FIX',
      clear: 'CLEAR WPT / FIX',
      dirto: 'DIR TO',
    };
    switch (s.kind) {
      case 'items':
        return { title: SND_MENU_ITEMS[s.item], kind: 'item' };
      case 'select': {
        const fix = s.purpose !== 'dirto' && this.isFix(s.index) ? this.navigator.fix : null;
        const count = s.purpose === 'dirto' ? list.length : this.editableCount;
        return {
          title: titles[s.purpose],
          kind: 'waypoint',
          text: fix ? `FIX ${formatWaypoint(fix)}` : `${s.index + 1}/${count} ${formatWaypoint(list[s.index])}`,
        };
      }
      case 'coordinates':
        return { title: titles[s.purpose], kind: 'coordinates', fields: s.editor.fields };
      default:
        return null;
    }
  }
}
