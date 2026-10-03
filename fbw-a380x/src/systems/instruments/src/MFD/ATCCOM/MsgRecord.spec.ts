// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  AtsuMessageComStatus,
  AtsuMessageDirection,
  AtsuTimestamp,
  CpdlcMessage,
  CpdlcMessagesDownlink,
  CpdlcMessagesUplink,
} from '@datalink/common';

import {
  isDialogueOpen,
  MsgRecordEntry,
  msgRecordEntries,
  msgRecordListLine,
  msgRecordPrintLines,
  wrapMsgRecordText,
} from './MsgRecord';

function timestamp(hours: number, minutes: number): AtsuTimestamp {
  const time = new AtsuTimestamp();
  time.Year = 2026;
  time.Month = 9;
  time.Day = 26;
  time.Seconds = hours * 3600 + minutes * 60;
  return time;
}

function message(
  direction: AtsuMessageDirection,
  typeId: string,
  value: string | null,
  time: AtsuTimestamp | null,
  uid = -1,
): CpdlcMessage {
  const result = new CpdlcMessage();
  result.UniqueMessageID = uid;
  result.Direction = direction;
  result.Station = 'LFBO';
  if (time) {
    result.Timestamp = time;
  }
  const catalog = direction === AtsuMessageDirection.Uplink ? CpdlcMessagesUplink : CpdlcMessagesDownlink;
  const element = catalog[typeId][1].deepCopy();
  if (value !== null) {
    element.Content[0].Value = value;
  }
  result.Content.push(element);
  result.ComStatus = AtsuMessageComStatus.Sent;
  return result;
}

describe('MSG RECORD', () => {
  it('shows the crew response as the status of the uplink message, most recent first', () => {
    const clearance = message(AtsuMessageDirection.Uplink, 'UM20', 'FL340', timestamp(12, 23), 1);
    clearance.Response = message(AtsuMessageDirection.Downlink, 'DM0', null, null);

    const request = message(AtsuMessageDirection.Downlink, 'DM6', 'FL360', timestamp(12, 30), 2);
    request.Response = message(AtsuMessageDirection.Uplink, 'UM20', 'FL360', timestamp(12, 31));
    request.Response.Response = message(AtsuMessageDirection.Downlink, 'DM1', null, null);
    request.Response.Response.ComStatus = AtsuMessageComStatus.Failed;

    const entries = msgRecordEntries([request, clearance]);
    expect(entries.map((entry) => [entry.time, entry.direction, entry.status, entry.text])).toEqual([
      ['1231Z', 'FROM', 'OPEN', 'CLIMB TO FL360'],
      ['1230Z', 'TO', '', 'REQUEST FL360'],
      ['1223Z', 'FROM', 'WILCO', 'CLIMB TO FL340'],
    ]);
    expect(entries.map((entry) => [entry.uid, entry.position])).toEqual([
      [2, 1],
      [2, 0],
      [1, 0],
    ]);
  });

  it('keeps every sign of a freetext message', () => {
    const text = message(
      AtsuMessageDirection.Uplink,
      'UM169',
      'at bergi clb to & maintain fl340, rwy 26l/27r',
      null,
      4,
    );
    expect(msgRecordEntries([text])[0].text).toBe('AT BERGI CLB TO & MAINTAIN FL340, RWY 26L/27R');
  });

  it('does not record the connection messages', () => {
    const logon = message(AtsuMessageDirection.Downlink, 'DM9998', null, timestamp(12, 0), 3);
    logon.Response = message(AtsuMessageDirection.Uplink, 'UM9997', null, timestamp(12, 1));
    expect(msgRecordEntries([logon])).toEqual([]);
  });

  it('keeps open the dialogues waiting for a response', () => {
    const clearance = message(AtsuMessageDirection.Uplink, 'UM20', 'FL340', timestamp(12, 23), 1);
    expect(isDialogueOpen(clearance)).toBe(true);
    clearance.Response = message(AtsuMessageDirection.Downlink, 'DM2', null, null);
    expect(isDialogueOpen(clearance)).toBe(true);
    clearance.Response = message(AtsuMessageDirection.Downlink, 'DM0', null, null);
    expect(isDialogueOpen(clearance)).toBe(false);

    const request = message(AtsuMessageDirection.Downlink, 'DM6', 'FL360', timestamp(12, 30), 2);
    expect(isDialogueOpen(request)).toBe(true);
    request.Response = message(AtsuMessageDirection.Uplink, 'UM0', null, timestamp(12, 31));
    expect(isDialogueOpen(request)).toBe(false);
  });

  it('shows the start of a long message with >>>', () => {
    expect(msgRecordListLine('AT BERGI CLB TO & MAINTAIN FL340', 39)).toBe('AT BERGI CLB TO & MAINTAIN FL340');
    expect(msgRecordListLine('AT BERGI CLB TO & MAINTAIN FL340 WHEN ABLE REPORT LEVEL', 39)).toBe(
      'AT BERGI CLB TO & MAINTAIN FL340>>>',
    );
    expect(wrapMsgRecordText('ABCDEFGHIJ KL', 4)).toEqual(['ABCD', 'EFGH', 'IJ', 'KL']);
  });

  it('prints the messages with their time, origin and status, then their text', () => {
    const entry = (time: string, status: MsgRecordEntry['status'], text: string): MsgRecordEntry => ({
      uid: 1,
      position: 0,
      time,
      direction: 'FROM',
      station: 'LFBB',
      status,
      text,
      sortKey: 0,
      dialogueOrder: 0,
    });
    const lines = msgRecordPrintLines(
      [entry('1827Z', 'WILCO', 'CLEARED TO AMB VIA DIBAG UT210 TUDRA UT158 AMB'), entry('1825Z', '', 'CLIMB TO FL350')],
      40,
    );
    expect(lines).toEqual([
      '1827Z FROM LFBB CTL                WILCO',
      'CLEARED TO AMB VIA DIBAG UT210 TUDRA',
      'UT158 AMB',
      '',
      '1825Z FROM LFBB CTL',
      'CLIMB TO FL350',
    ]);
  });

  it('drops the @ markers of the uplink variable fields', () => {
    const clearance = message(AtsuMessageDirection.Uplink, 'UM169', 'CLRD TO @CYVR@ RWY @06R@', timestamp(12, 23), 1);
    expect(msgRecordEntries([clearance])[0].text).toBe('CLRD TO CYVR RWY 06R');
  });
});
