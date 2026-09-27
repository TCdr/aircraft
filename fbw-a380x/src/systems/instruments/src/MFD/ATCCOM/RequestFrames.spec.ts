// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AtsuMessageDirection, CpdlcMessage } from '@datalink/common';

import {
  addRequestFrame,
  createRequestFrame,
  isRequestComplete,
  removeRequestFrame,
  RequestFrame,
  RequestFrameId,
  requestElements,
} from './RequestFrames';
import { msgRecordText } from './MsgRecord';

function add(frames: RequestFrame[], id: RequestFrameId, values: Record<string, string> = {}): RequestFrame[] {
  const result = addRequestFrame(frames, createRequestFrame(id, values));
  if (!result.frames) {
    throw new Error(result.error);
  }
  return result.frames;
}

function text(frames: RequestFrame[]): string {
  const message = new CpdlcMessage();
  message.Direction = AtsuMessageDirection.Downlink;
  message.Content.push(...requestElements(frames));
  return msgRecordText(message);
}

describe('REQUEST frames', () => {
  it('composes a request message of up to five frames', () => {
    let frames = add([], 'DIRECT_TO', { fix: 'TADEX' });
    frames = add(frames, 'CLIMB_TO', { level: 'FL360', at: '1230Z' });
    frames = add(frames, 'DUE_TO_WEATHER');
    expect(isRequestComplete(frames)).toBe(true);
    expect(text(frames)).toBe('REQUEST DIRECT TO TADEX AT 1230Z REQUEST CLIMB TO FL360 DUE TO WEATHER');

    frames = add(frames, 'SPEED', { speed: 'M.82', toSpeed: 'M.84' });
    frames = add(frames, 'HEADING', { degree: '090' });
    expect(addRequestFrame(frames, createRequestFrame('TRACK')).error).toBe('LAST_MSG_ELEMENT');
  });

  it('replaces CLIMB TO by DESCEND TO, and a frame can be selected once', () => {
    let frames = add([], 'CLIMB_TO', { level: 'FL360' });
    frames = add(frames, 'DIRECT_TO');
    frames = add(frames, 'DESCEND_TO', { level: 'FL300' });
    expect(frames.map((f) => f.id)).toEqual(['DESCEND_TO', 'DIRECT_TO']);
    expect(addRequestFrame(frames, createRequestFrame('DIRECT_TO')).error).toBe('NOT_ALLOWED');
  });

  it('keeps REROUTING, DEPARTURE and OCEANIC alone', () => {
    let frames = add([], 'DIRECT_TO');
    frames = add(frames, 'REROUTING');
    expect(frames.map((f) => f.id)).toEqual(['REROUTING']);
    frames = add(frames, 'HEADING');
    expect(frames.map((f) => f.id)).toEqual(['HEADING']);

    frames = add(frames, 'DEPARTURE');
    expect(frames.map((f) => f.id)).toEqual(['DEPARTURE']);
    expect(addRequestFrame(frames, createRequestFrame('HEADING')).error).toBe('LAST_MSG_ELEMENT');
  });

  it('needs another frame for an ADD TEXT frame, and all the mandatory fields', () => {
    expect(addRequestFrame([], createRequestFrame('DUE_TO_MEDICAL')).error).toBe('NOT_ALLOWED');
    let frames = add([], 'OFFSET');
    expect(isRequestComplete(frames)).toBe(false);
    frames = [{ ...frames[0], values: { offset: '20NM L', at: 'ABC' } }];
    expect(isRequestComplete(frames)).toBe(true);
    expect(text(frames)).toBe('AT ABC REQUEST OFFSET 20NM LEFT OF ROUTE');

    frames = add(frames, 'DUE_TO_TURBULENCE');
    expect(removeRequestFrame(frames, 0)).toEqual([]);
  });

  it('sends a freetext over its three lines', () => {
    const frames = add([], 'FREETEXT', { text1: 'REQUEST DEVIATION', text3: 'DUE TO CB' });
    expect(text(frames)).toBe('REQUEST DEVIATION DUE TO CB');
  });

  it('composes an emergency message: MAYDAY, PANPAN and CANCEL EMER replace each other', () => {
    let frames = add([], 'MAYDAY');
    frames = add(frames, 'ENDURANCE_SOULS', { endurance: '4H30', souls: '350' });
    frames = add(frames, 'DIVERTING', { position: 'LFPG', via: 'DCT' });
    frames = add(frames, 'EMER_DESCENDING_TO', { level: 'FL100' });
    expect(text(frames)).toBe(
      'MAYDAY MAYDAY MAYDAY 4H30 FUEL REMAINING AND 350 PERSONS ON BOARD DIVERTING TO LFPG VIA DCT DESCENDING TO FL100',
    );
    frames = add(frames, 'PANPAN');
    expect(frames.map((f) => f.id)).toEqual(['PANPAN', 'ENDURANCE_SOULS', 'DIVERTING', 'EMER_DESCENDING_TO']);
    frames = add(frames, 'CANCEL_EMER');
    expect(frames[0].id).toBe('CANCEL_EMER');
    frames = add(frames, 'EMER_CLIMBING_TO', { level: 'FL200' });
    expect(frames.map((f) => f.id)).toEqual(['CANCEL_EMER', 'ENDURANCE_SOULS', 'DIVERTING', 'EMER_CLIMBING_TO']);
  });
});
