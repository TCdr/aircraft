// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CpdlcMessageElement, CpdlcMessagesDownlink } from '@datalink/common';

/**
 * The frames of the REQUEST page (A380 FCOM DSC-46-10-20-30 P 11-16): the REQUEST menu creates the frames that compose
 * a request message, up to five frames, each a CPDLC message element with the fields the flight crew completes.
 */

/** The entry formats of the fields (FCOM DSC-46-10-20-50) */
export type RequestFieldKind =
  | 'acType'
  | 'airport'
  | 'altitude'
  | 'atisCode'
  | 'center'
  | 'degree'
  | 'fix'
  | 'freetext'
  | 'frequency'
  | 'gate'
  | 'mach'
  | 'offset'
  | 'positionOrTime'
  | 'procedure'
  | 'speed'
  | 'time'
  | 'wxDeviation'
  | 'groundSpeed'
  | 'verticalSpeed'
  | 'wind'
  | 'sat'
  | 'endurance'
  | 'squawk'
  | 'souls'
  | 'distance';

export interface RequestField {
  key: string;
  kind: RequestFieldKind;
  mandatory: boolean;
  /** The width of the field box in px */
  width: number;
}

/** A line of a frame: texts and fields, from left to right */
export type RequestLineItem = string | RequestField;

export type RequestFrameId =
  | 'CLIMB_TO'
  | 'DESCEND_TO'
  | 'ALTITUDE'
  | 'BLOCK_ALT'
  | 'CRUISE_CLIMB'
  | 'DIRECT_TO'
  | 'OFFSET'
  | 'WX_DEVIATION'
  | 'HEADING'
  | 'TRACK'
  | 'SID_STAR'
  | 'REROUTING'
  | 'SPEED'
  | 'DEPARTURE'
  | 'OCEANIC'
  | 'CLEARANCE_OTHER'
  | 'WCWE_HIGHER_ALT'
  | 'WCWE_LOWER_ALT'
  | 'WCWE_CLIMB_TO'
  | 'WCWE_DESCEND_TO'
  | 'WCWE_CRUISE_CLIMB'
  | 'WCWE_SPEED'
  | 'WCWE_BACK_ON_ROUTE'
  | 'FREETEXT'
  | 'VOICE_CONTACT'
  | 'OWN_SEPARATION'
  | 'VMC_DESCENT'
  | 'DUE_TO_WEATHER'
  | 'DUE_TO_PERFORMANCE'
  | 'DUE_TO_TURBULENCE'
  | 'DUE_TO_TECHNICAL'
  | 'DUE_TO_MEDICAL'
  | 'AT_PILOTS_DISCRETION'
  | 'ADD_FREETEXT'
  | 'BACK_ON_ROUTE'
  | 'PASSING_POSITION'
  | 'LEAVING_ALTITUDE'
  | 'LEVEL'
  | 'REACHING_ALTITUDE'
  | 'REACHING_BLOCK'
  | 'MAYDAY'
  | 'PANPAN'
  | 'CANCEL_EMER'
  | 'EMER_CLIMBING_TO'
  | 'EMER_DESCENDING_TO'
  | 'DIVERTING'
  | 'OFFSETTING'
  | 'EMER_VOICE_CONTACT'
  | 'ENDURANCE_SOULS';

/** A frame of the REQUEST page with the values of its fields (null when empty) */
export interface RequestFrame {
  id: RequestFrameId;
  /** SID/STAR: a SID on ground, a STAR in flight */
  label?: string;
  values: Record<string, string | null>;
}

interface RequestFrameDefinition {
  /** The lines of the frame (FCOM figure: at most three, the first one left of the delete symbol) */
  lines: (frame: RequestFrame) => RequestLineItem[][];
  /** The CPDLC message element, or null when a mandatory field is empty */
  element: (values: Record<string, string | null>) => CpdlcMessageElement | null;
  /** The frames that cannot be selected at the same time: selecting one replaces the other */
  exchanges?: RequestFrameId | RequestFrameId[];
  /** ADD TEXT frames complete another frame */
  addText?: boolean;
}

const field = (key: string, kind: RequestFieldKind, width: number, mandatory = true): RequestField => ({
  key,
  kind,
  mandatory,
  width,
});

const ALT = 150;
const FIX = 200;

/** The downlink message element with the given values */
function downlink(typeId: string, ...values: string[]): CpdlcMessageElement {
  const element = CpdlcMessagesDownlink[typeId][1].deepCopy();
  values.forEach((value, i) => {
    if (element.Content[i]) {
      element.Content[i].Value = value;
    }
  });
  return element;
}

function isTime(value: string): boolean {
  return /^\d{4}Z$/.test(value);
}

/** OFFSET and WX DEV values: distance and direction, e.g. "20NM L" */
function offsetElements(value: string): [string, string] {
  const [distance, direction] = value.split(' ');
  const directions: Record<string, string> = { L: 'LEFT', R: 'RIGHT', LR: 'EITHER SIDE' };
  return [distance, directions[direction] ?? ''];
}

/** The freetext of the three freetext lines */
function freetext(values: Record<string, string | null>): string | null {
  const text = [values.text1, values.text2, values.text3]
    .filter((line) => line)
    .join(' ')
    .trim();
  return text !== '' ? text : null;
}

const FREETEXT_LINES: RequestLineItem[][] = [
  [field('text1', 'freetext', 480)],
  [field('text2', 'freetext', 480, false)],
  [field('text3', 'freetext', 480, false)],
];

const fixed = (text: string, typeId: string, value?: string): RequestFrameDefinition => ({
  lines: () => [[], [text]],
  element: () => (value !== undefined ? downlink(typeId, value) : downlink(typeId)),
});

export const REQUEST_FRAMES: Record<RequestFrameId, RequestFrameDefinition> = {
  CLIMB_TO: {
    lines: () => [
      [],
      ['REQUEST CLB TO', field('level', 'altitude', ALT)],
      ['AT', field('at', 'positionOrTime', FIX, false)],
    ],
    element: ({ level, at }) => {
      if (!level) return null;
      if (!at) return downlink('DM9', level);
      return downlink(isTime(at) ? 'DM13' : 'DM11', at, level);
    },
    exchanges: 'DESCEND_TO',
  },
  DESCEND_TO: {
    lines: () => [
      [],
      ['REQUEST DES TO', field('level', 'altitude', ALT)],
      ['AT', field('at', 'positionOrTime', FIX, false)],
    ],
    element: ({ level, at }) => {
      if (!level) return null;
      if (!at) return downlink('DM10', level);
      return downlink(isTime(at) ? 'DM14' : 'DM12', at, level);
    },
    exchanges: 'CLIMB_TO',
  },
  ALTITUDE: {
    lines: () => [[], ['REQUEST ALTITUDE', field('level', 'altitude', ALT)]],
    element: ({ level }) => (level ? downlink('DM6', level) : null),
  },
  BLOCK_ALT: {
    lines: () => [[], ['REQUEST BLOCK', field('lower', 'altitude', ALT)], ['TO', field('upper', 'altitude', ALT)]],
    element: ({ lower, upper }) => (lower && upper ? downlink('DM7', lower, upper) : null),
  },
  CRUISE_CLIMB: {
    lines: () => [[], ['REQUEST CRUISE CLB TO', field('level', 'altitude', ALT)]],
    element: ({ level }) => (level ? downlink('DM8', level) : null),
  },
  DIRECT_TO: {
    lines: () => [[], ['REQUEST DIR TO', field('fix', 'fix', 322)]],
    element: ({ fix }) => (fix ? downlink('DM22', fix) : null),
  },
  OFFSET: {
    lines: () => [
      [],
      ['REQUEST OFFSET', field('offset', 'offset', ALT)],
      ['AT', field('at', 'positionOrTime', FIX, false)],
    ],
    element: ({ offset, at }) => {
      if (!offset) return null;
      const [distance, direction] = offsetElements(offset);
      if (!at) return downlink('DM15', distance, direction);
      return downlink(isTime(at) ? 'DM17' : 'DM16', at, distance, direction);
    },
  },
  WX_DEVIATION: {
    lines: () => [[], ['REQUEST WX DEV', field('offset', 'wxDeviation', ALT)]],
    element: ({ offset }) => (offset ? downlink('DM27', ...offsetElements(offset)) : null),
  },
  HEADING: {
    lines: () => [[], ['REQUEST HDG', field('degree', 'degree', 110)]],
    element: ({ degree }) => (degree ? downlink('DM70', degree) : null),
  },
  TRACK: {
    lines: () => [[], ['REQUEST GROUND TRACK', field('degree', 'degree', 110)]],
    element: ({ degree }) => (degree ? downlink('DM71', degree) : null),
  },
  SID_STAR: {
    lines: (frame) => [[], [frame.label ?? 'REQUEST SID', field('procedure', 'procedure', 170)]],
    element: ({ procedure }) => (procedure ? downlink('DM23', procedure) : null),
  },
  REROUTING: {
    lines: () => [[], ['REQUEST REROUTING']],
    element: () => downlink('DM25', 'ROUTE'),
  },
  SPEED: {
    lines: () => [
      [],
      ['REQUEST SPD', field('speed', 'speed', ALT)],
      ['TO SPEED', field('toSpeed', 'speed', ALT, false)],
    ],
    element: ({ speed, toSpeed }) => {
      if (!speed) return null;
      return toSpeed ? downlink('DM19', speed, toSpeed) : downlink('DM18', speed);
    },
  },
  DEPARTURE: {
    lines: () => [
      ['DEPARTURE ARPT', field('departure', 'airport', 107)],
      ['DESTINATION', field('destination', 'airport', 107), 'GATE', field('gate', 'gate', 120, false)],
      ['A/C TYPE', field('acType', 'acType', 107), 'ATIS CODE', field('atis', 'atisCode', 60)],
    ],
    // A departure clearance is a DCL message, not a CPDLC message element
    element: () => null,
  },
  OCEANIC: {
    lines: () => [
      ['OCEANIC CENTER', field('center', 'center', 107)],
      ['ENTRY POINT', field('entryPoint', 'fix', 150), 'ETA', field('eta', 'time', 110)],
      ['MACH', field('mach', 'mach', 110), 'LEVEL', field('level', 'altitude', ALT)],
    ],
    // An oceanic clearance is an OCL message, not a CPDLC message element
    element: () => null,
  },
  CLEARANCE_OTHER: {
    lines: () => [[], ['REQUEST', field('clearance', 'freetext', 260), 'CLEARANCE']],
    element: ({ clearance }) => (clearance ? downlink('DM25', clearance) : null),
  },
  WCWE_HIGHER_ALT: {
    lines: () => [[], ['WHEN CAN WE EXPECT HIGHER ALT']],
    element: () => downlink('DM53'),
    exchanges: 'WCWE_LOWER_ALT',
  },
  WCWE_LOWER_ALT: {
    lines: () => [[], ['WHEN CAN WE EXPECT LOWER ALT']],
    element: () => downlink('DM52'),
    exchanges: 'WCWE_HIGHER_ALT',
  },
  WCWE_CLIMB_TO: {
    lines: () => [['WHEN CAN WE EXPECT'], ['CLB TO', field('level', 'altitude', ALT)]],
    element: ({ level }) => (level ? downlink('DM87', level) : null),
    exchanges: 'WCWE_DESCEND_TO',
  },
  WCWE_DESCEND_TO: {
    lines: () => [['WHEN CAN WE EXPECT'], ['DES TO', field('level', 'altitude', ALT)]],
    element: ({ level }) => (level ? downlink('DM88', level) : null),
    exchanges: 'WCWE_CLIMB_TO',
  },
  WCWE_CRUISE_CLIMB: {
    lines: () => [['WHEN CAN WE EXPECT'], ['CRUISE CLB TO', field('level', 'altitude', ALT)]],
    element: ({ level }) => (level ? downlink('DM54', level) : null),
  },
  WCWE_SPEED: {
    lines: () => [
      ['WHEN CAN WE EXPECT'],
      ['SPD', field('speed', 'speed', ALT)],
      ['TO SPEED', field('toSpeed', 'speed', ALT, false)],
    ],
    element: ({ speed, toSpeed }) => {
      if (!speed) return null;
      return toSpeed ? downlink('DM50', speed, toSpeed) : downlink('DM49', speed);
    },
  },
  WCWE_BACK_ON_ROUTE: fixed('WHEN CAN WE EXPECT BACK ON ROUTE', 'DM51'),
  FREETEXT: {
    lines: () => FREETEXT_LINES,
    element: (values) => {
      const text = freetext(values);
      return text ? downlink('DM67', text) : null;
    },
  },
  VOICE_CONTACT: {
    lines: () => [[], ['REQUEST VOICE CONTACT', field('frequency', 'frequency', 160, false)]],
    element: ({ frequency }) => (frequency ? downlink('DM21', frequency) : downlink('DM20')),
  },
  OWN_SEPARATION: fixed('REQUEST OWN SEPARATION & VMC', 'DM74'),
  VMC_DESCENT: fixed('REQUEST VMC DES', 'DM69'),
  DUE_TO_WEATHER: { ...fixed('DUE TO WEATHER', 'DM65'), addText: true },
  DUE_TO_PERFORMANCE: { ...fixed('DUE TO A/C PERFORMANCE', 'DM66'), addText: true },
  DUE_TO_TURBULENCE: { ...fixed('DUE TO TURBULENCE', 'DM67', 'DUE TO TURBULENCE'), addText: true },
  DUE_TO_TECHNICAL: { ...fixed('DUE TO TECHNICAL', 'DM67', 'DUE TO TECHNICAL'), addText: true },
  DUE_TO_MEDICAL: { ...fixed('DUE TO MEDICAL', 'DM67', 'DUE TO MEDICAL'), addText: true },
  AT_PILOTS_DISCRETION: { ...fixed('AT PILOTS DISCRETION', 'DM75'), addText: true },
  ADD_FREETEXT: {
    lines: () => FREETEXT_LINES,
    element: (values) => {
      const text = freetext(values);
      return text ? downlink('DM67', text) : null;
    },
    addText: true,
  },
  // OTHER REPORTS (FCOM DSC-46-10-20-30 P 25): the text of a report frame is on its first line
  BACK_ON_ROUTE: {
    lines: () => [['BACK ON ROUTE']],
    element: () => downlink('DM41'),
  },
  PASSING_POSITION: {
    lines: () => [['PASSING', field('position', 'fix', FIX)]],
    element: ({ position }) => (position ? downlink('DM31', position) : null),
  },
  LEAVING_ALTITUDE: {
    lines: () => [['LEAVING', field('level', 'altitude', ALT)]],
    element: ({ level }) => (level ? downlink('DM28', level) : null),
  },
  LEVEL: {
    lines: () => [['LEVEL', field('level', 'altitude', ALT)]],
    element: ({ level }) => (level ? downlink('DM37', level) : null),
  },
  REACHING_ALTITUDE: {
    lines: () => [['REACHING', field('level', 'altitude', ALT)]],
    element: ({ level }) => (level ? downlink('DM72', level) : null),
  },
  REACHING_BLOCK: {
    lines: () => [
      ['REACHING BLOCK', field('lower', 'altitude', ALT)],
      ['TO', field('upper', 'altitude', ALT)],
    ],
    element: ({ lower, upper }) => (lower && upper ? downlink('DM76', lower, upper) : null),
  },
  // EMERGENCY (FCOM DSC-46-10-20-30 P 36-37)
  MAYDAY: {
    lines: () => [['MAYDAY MAYDAY MAYDAY']],
    element: () => downlink('DM56'),
    exchanges: ['PANPAN', 'CANCEL_EMER'],
  },
  PANPAN: {
    lines: () => [['PAN PAN PAN']],
    element: () => downlink('DM55'),
    exchanges: ['MAYDAY', 'CANCEL_EMER'],
  },
  CANCEL_EMER: {
    lines: () => [['CANCEL EMERGENCY']],
    element: () => downlink('DM58'),
    exchanges: ['MAYDAY', 'PANPAN'],
  },
  EMER_CLIMBING_TO: {
    lines: () => [['CLIMBING TO', field('level', 'altitude', ALT)]],
    element: ({ level }) => (level ? downlink('DM29', level) : null),
    exchanges: 'EMER_DESCENDING_TO',
  },
  EMER_DESCENDING_TO: {
    lines: () => [['DESCENDING TO', field('level', 'altitude', ALT)]],
    element: ({ level }) => (level ? downlink('DM61', level) : null),
    exchanges: 'EMER_CLIMBING_TO',
  },
  DIVERTING: {
    lines: () => [
      ['DIVERTING TO', field('position', 'fix', FIX)],
      ['VIA', field('via', 'fix', FIX)],
    ],
    element: ({ position, via }) => (position && via ? downlink('DM59', position, via) : null),
  },
  OFFSETTING: {
    lines: () => [['OFFSETTING', field('offset', 'offset', ALT)]],
    element: ({ offset }) => (offset ? downlink('DM60', ...offsetElements(offset)) : null),
  },
  EMER_VOICE_CONTACT: {
    lines: () => [['REQUEST VOICE CONTACT', field('frequency', 'frequency', 150, false)]],
    element: ({ frequency }) => (frequency ? downlink('DM21', frequency) : downlink('DM20')),
  },
  ENDURANCE_SOULS: {
    lines: () => [
      ['ENDURANCE', field('endurance', 'endurance', 162)],
      ['SOULS ON BOARD', field('souls', 'souls', 110)],
    ],
    element: ({ endurance, souls }) => (endurance && souls ? downlink('DM57', endurance, souls) : null),
  },
};

/** The EMERGENCY menu (FCOM DSC-46-10-20-30 P 36): each button creates its frame */
export const EMERGENCY_MENU: RequestMenuButton[] = [
  { label: 'MAYDAY', frame: 'MAYDAY' },
  { label: 'PANPAN', frame: 'PANPAN' },
  { label: 'CANCEL EMER', frame: 'CANCEL_EMER' },
  { label: 'CLIMBING TO', frame: 'EMER_CLIMBING_TO' },
  { label: 'DESCENDING TO', frame: 'EMER_DESCENDING_TO' },
  { label: 'DIVERTING/VIA', frame: 'DIVERTING' },
  { label: 'OFFSETTING', frame: 'OFFSETTING' },
  { label: 'REQUEST\nVOICE CONTACT', frame: 'EMER_VOICE_CONTACT' },
  { label: 'ENDURANCE\n& SOULS', frame: 'ENDURANCE_SOULS' },
  { label: 'ADD FREETEXT', frame: 'ADD_FREETEXT' },
];

/** The OTHER REPORTS menu (FCOM DSC-46-10-20-30 P 25): each button creates its frame */
export const OTHER_REPORTS_MENU: RequestMenuButton[] = [
  { label: 'BACK\nON ROUTE', frame: 'BACK_ON_ROUTE' },
  { label: 'PASSING\nPOSITION', frame: 'PASSING_POSITION' },
  { label: 'LEAVING\nALTITUDE', frame: 'LEAVING_ALTITUDE' },
  { label: 'LEVEL', frame: 'LEVEL' },
  { label: 'REACHING\nALTITUDE', frame: 'REACHING_ALTITUDE' },
  { label: 'REACHING\nBLOCK', frame: 'REACHING_BLOCK' },
  { label: 'ADD\nFREETEXT', frame: 'ADD_FREETEXT' },
];

/** The REQUEST menu (FCOM DSC-46-10-20-30 P 12-16): the buttons, and the frames of their sub-menus */
export interface RequestMenuItem {
  label: string;
  frame: RequestFrameId;
}

export interface RequestMenuButton {
  label: string;
  /** A button without sub-menu creates its frame directly */
  frame?: RequestFrameId;
  items?: RequestMenuItem[];
}

export const REQUEST_MENU: RequestMenuButton[] = [
  {
    label: 'VERTICAL',
    items: [
      { label: 'CLIMB TO', frame: 'CLIMB_TO' },
      { label: 'DESCEND TO', frame: 'DESCEND_TO' },
      { label: 'ALTITUDE', frame: 'ALTITUDE' },
      { label: 'BLOCK ALT', frame: 'BLOCK_ALT' },
      { label: 'CRUISE CLIMB', frame: 'CRUISE_CLIMB' },
    ],
  },
  {
    label: 'LATERAL',
    items: [
      { label: 'DIRECT TO', frame: 'DIRECT_TO' },
      { label: 'OFFSET', frame: 'OFFSET' },
      { label: 'WX DEVIATION', frame: 'WX_DEVIATION' },
      { label: 'HEADING', frame: 'HEADING' },
      { label: 'TRACK', frame: 'TRACK' },
      { label: 'SID/STAR', frame: 'SID_STAR' },
      { label: 'REROUTING', frame: 'REROUTING' },
    ],
  },
  { label: 'SPEED', frame: 'SPEED' },
  {
    label: 'CLEARANCE',
    items: [
      { label: 'DEPARTURE', frame: 'DEPARTURE' },
      { label: 'OCEANIC', frame: 'OCEANIC' },
      { label: 'OTHER', frame: 'CLEARANCE_OTHER' },
    ],
  },
  {
    label: 'WHEN CAN\nWE EXPECT',
    items: [
      { label: 'HIGHER ALTITUDE', frame: 'WCWE_HIGHER_ALT' },
      { label: 'LOWER ALTITUDE', frame: 'WCWE_LOWER_ALT' },
      { label: 'CLIMB TO', frame: 'WCWE_CLIMB_TO' },
      { label: 'DESCEND TO', frame: 'WCWE_DESCEND_TO' },
      { label: 'CRUISE CLIMB', frame: 'WCWE_CRUISE_CLIMB' },
      { label: 'SPEED', frame: 'WCWE_SPEED' },
      { label: 'BACK ON ROUTE', frame: 'WCWE_BACK_ON_ROUTE' },
    ],
  },
  {
    label: 'OTHER',
    items: [
      { label: 'FREETEXT', frame: 'FREETEXT' },
      { label: 'VOICE CONTACT', frame: 'VOICE_CONTACT' },
      { label: 'OWN SEPARATION & VMC', frame: 'OWN_SEPARATION' },
      { label: 'VMC DES.', frame: 'VMC_DESCENT' },
    ],
  },
];

export const ADD_TEXT_MENU: RequestMenuButton = {
  label: 'ADD TEXT',
  items: [
    { label: 'DUE TO WEATHER', frame: 'DUE_TO_WEATHER' },
    { label: 'DUE TO A/C PERFORMANCE', frame: 'DUE_TO_PERFORMANCE' },
    { label: 'DUE TO TURBULENCE', frame: 'DUE_TO_TURBULENCE' },
    { label: 'DUE TO TECHNICAL', frame: 'DUE_TO_TECHNICAL' },
    { label: 'DUE TO MEDICAL', frame: 'DUE_TO_MEDICAL' },
    { label: 'AT PILOTS DISCRETION', frame: 'AT_PILOTS_DISCRETION' },
    { label: 'FREETEXT', frame: 'ADD_FREETEXT' },
  ],
};

/** The flight crew may select up to five frames (FCOM DSC-46-10-20-30 P 12) */
export const MAX_REQUEST_FRAMES = 5;

/** DEPARTURE and OCEANIC are clearance requests of their own (LAST MSG ELEMENT, FCOM DSC-46-10-20-40 L) */
const SINGLE_FRAMES: RequestFrameId[] = ['DEPARTURE', 'OCEANIC'];

export function isAddTextFrame(id: RequestFrameId): boolean {
  return REQUEST_FRAMES[id].addText === true;
}

/** The fields of a frame */
export function requestFrameFields(frame: RequestFrame): RequestField[] {
  // No flat(): not in the Coherent GT runtime
  const fields: RequestField[] = [];
  for (const line of REQUEST_FRAMES[frame.id].lines(frame)) {
    for (const item of line) {
      if (typeof item !== 'string') {
        fields.push(item);
      }
    }
  }
  return fields;
}

export function createRequestFrame(id: RequestFrameId, defaults: Record<string, string | null> = {}): RequestFrame {
  const frame: RequestFrame = { id, values: {} };
  for (const f of requestFrameFields(frame)) {
    frame.values[f.key] = defaults[f.key] ?? null;
  }
  return frame;
}

export type AddRequestFrameResult =
  | { frames: RequestFrame[]; error?: undefined }
  | { frames?: undefined; error: 'LAST_MSG_ELEMENT' | 'NOT_ALLOWED' };

/**
 * Adds a frame to the request (FCOM DSC-46-10-20-30 P 12-16): up to five frames; CLIMB TO / DESCEND TO, HIGHER /
 * LOWER ALTITUDE and the WHEN CAN WE EXPECT CLIMB / DESCEND TO replace each other; REROUTING, DEPARTURE and OCEANIC
 * cannot be selected with other frames (they replace the request, and another frame replaces REROUTING); an ADD TEXT
 * frame completes another frame.
 */
export function addRequestFrame(frames: readonly RequestFrame[], frame: RequestFrame): AddRequestFrameResult {
  const definition = REQUEST_FRAMES[frame.id];
  if (frames.some((f) => f.id === frame.id)) {
    return { error: 'NOT_ALLOWED' };
  }
  if (definition.addText && !frames.some((f) => !isAddTextFrame(f.id))) {
    return { error: 'NOT_ALLOWED' };
  }
  if (frame.id === 'REROUTING' || SINGLE_FRAMES.includes(frame.id)) {
    return { frames: [frame] };
  }
  if (frames.some((f) => SINGLE_FRAMES.includes(f.id))) {
    return { error: 'LAST_MSG_ELEMENT' };
  }
  const remaining = frames.filter((f) => f.id !== 'REROUTING');
  const exchanges =
    definition.exchanges === undefined
      ? []
      : Array.isArray(definition.exchanges)
        ? definition.exchanges
        : [definition.exchanges];
  const exchanged = remaining.findIndex((f) => exchanges.includes(f.id));
  if (exchanged !== -1) {
    const result = [...remaining];
    result[exchanged] = frame;
    return { frames: result };
  }
  if (remaining.length >= MAX_REQUEST_FRAMES) {
    return { error: 'LAST_MSG_ELEMENT' };
  }
  return { frames: [...remaining, frame] };
}

/** Removes a frame; the ADD TEXT frames go with the last frame they complete */
export function removeRequestFrame(frames: readonly RequestFrame[], index: number): RequestFrame[] {
  const result = frames.filter((_, i) => i !== index);
  return result.some((f) => !isAddTextFrame(f.id)) ? result : [];
}

/** Whether the request can be transferred to the mailbox: a frame other than ADD TEXT, and all mandatory fields */
export function isRequestComplete(frames: readonly RequestFrame[]): boolean {
  return (
    frames.some((f) => !isAddTextFrame(f.id)) &&
    frames.every((frame) => requestFrameFields(frame).every((f) => !f.mandatory || !!frame.values[f.key]))
  );
}

/** The CPDLC message elements of a request, in the order of the frames */
export function requestElements(frames: readonly RequestFrame[]): CpdlcMessageElement[] {
  return frames
    .map((frame) => REQUEST_FRAMES[frame.id].element(frame.values))
    .filter((element): element is CpdlcMessageElement => element !== null);
}
