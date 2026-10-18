// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  AtsuMessageComStatus,
  AtsuMessageDirection,
  CpdlcMessage,
  CpdlcMessageMonitoringState,
  CpdlcMessagesDownlink,
  CpdlcMessagesUplink,
  MailboxStatusMessage,
} from '@datalink/common';

import {
  buildResponse,
  MAILBOX_TOP_ON_DU,
  MailboxBlock,
  mailboxButtons,
  mailboxLines,
  mailboxMessageStyle,
  mailboxStatus,
  pageCount,
  queueFromMailboxFile,
  resyncedStatus,
  resyncedVisibleUid,
} from './MailboxLogic';

/**
 * A test CPDLC message with one element
 * @param direction uplink or downlink
 * @param typeId the element type (e.g. UM20)
 * @param value the value of its first parameter, or null for the template default
 * @returns the message
 */
function message(direction: AtsuMessageDirection, typeId: string, value: string | null): CpdlcMessage {
  const result = new CpdlcMessage();
  result.UniqueMessageID = 1;
  result.Direction = direction;
  result.Station = 'KZAK';
  const catalog = direction === AtsuMessageDirection.Uplink ? CpdlcMessagesUplink : CpdlcMessagesDownlink;
  const element = catalog[typeId][1].deepCopy();
  if (value !== null) {
    element.Content[0].Value = value;
  }
  result.Content.push(element);
  return result;
}

/**
 * A mailbox block of one message
 * @param msg the message
 * @param response the response selected by the flight crew, -1 for none
 * @returns the block
 */
function block(msg: CpdlcMessage, response = -1): MailboxBlock {
  return {
    uid: 1,
    messages: [msg],
    arrival: 0,
    response,
    status: MailboxStatusMessage.NoMessage,
    page: 0,
    lastPageSeen: 0,
    dueTo: null,
    replyTo: null,
  };
}

const actions = (b: MailboxBlock) => mailboxButtons(b).map((button) => button?.action ?? null);

describe('ATC mailbox', () => {
  it('offers WILCO, STANDBY and UNABLE for a clearance, then SEND and CANCEL, then CLOSE', () => {
    const clearance = message(AtsuMessageDirection.Uplink, 'UM20', 'FL340');
    expect(actions(block(clearance))).toEqual(['WILCO', 'STANDBY', 'UNABLE', null, 'PRINT']);
    expect(mailboxStatus(block(clearance))).toEqual({ text: 'OPEN', style: 'open' });

    expect(actions(block(clearance, 0))).toEqual(['SEND', null, 'CANCEL', null, 'PRINT']);
    expect(mailboxStatus(block(clearance, 0))).toEqual({ text: 'WILCO', style: 'selected' });

    clearance.Response = message(AtsuMessageDirection.Downlink, 'DM2', null);
    clearance.Response.ComStatus = AtsuMessageComStatus.Sent;
    expect(actions(block(clearance))).toEqual(['WILCO', null, 'UNABLE', null, 'PRINT']);

    clearance.Response = message(AtsuMessageDirection.Downlink, 'DM0', null);
    clearance.Response.ComStatus = AtsuMessageComStatus.Sent;
    expect(actions(block(clearance))).toEqual(['CLOSE', null, null, null, 'PRINT']);
    expect(mailboxStatus(block(clearance))).toEqual({ text: 'WILCO', style: 'answered' });
    expect(mailboxMessageStyle(block(clearance))).toBe('answered');
  });

  it('offers AFFIRM / NEGATIVE, ROGER, and CLOSE for a message without response', () => {
    expect(actions(block(message(AtsuMessageDirection.Uplink, 'UM150', 'FL380'))).slice(0, 3)).toEqual([
      'AFFIRM',
      'STANDBY',
      'NEGATIVE',
    ]);
    expect(actions(block(message(AtsuMessageDirection.Uplink, 'UM169', 'CONTACT BORDEAUX')))[0]).toBe('ROGER');
    expect(actions(block(message(AtsuMessageDirection.Uplink, 'UM3', null)))[0]).toBe('CLOSE');
  });

  it('sends a downlink message once all its pages are displayed', () => {
    const request = message(AtsuMessageDirection.Downlink, 'DM67', 'A '.repeat(80).trim());
    const b = block(request);
    expect(pageCount(b)).toBe(2);
    expect(mailboxButtons(b)[0]).toEqual({ action: 'SEND', enabled: false });
    expect(mailboxButtons({ ...b, lastPageSeen: 1 })[0]).toEqual({ action: 'SEND', enabled: true });
    expect(mailboxMessageStyle(b)).toBe('downlink');
    expect(mailboxStatus(b)).toBeNull();

    request.ComStatus = AtsuMessageComStatus.Sent;
    expect(actions(b)).toEqual(['CLOSE', null, null, null, 'PRINT']);
    expect(mailboxMessageStyle(b)).toBe('downlinkSent');
  });

  it('shows the main parameters of an uplink message', () => {
    const lines = mailboxLines(block(message(AtsuMessageDirection.Uplink, 'UM20', 'FL340')));
    expect(lines).toEqual([
      [
        { text: 'CLIMB TO ', kind: 'text' },
        { text: 'FL340', kind: 'parameter' },
      ],
    ]);
  });

  it('adds a justification or a freetext to UNABLE, and SEND transmits the prepared response', () => {
    const clearance = message(AtsuMessageDirection.Uplink, 'UM20', 'FL340');
    expect(actions(block(clearance, 1))).toEqual(['SEND', 'DUE TO', 'CANCEL', 'FREETEXT', 'PRINT']);
    expect(actions(block(clearance, 0))).toEqual(['SEND', null, 'CANCEL', null, 'PRINT']);

    const response = buildResponse(clearance, 1, 'weather');
    expect(response.Content.map((element) => element.TypeId)).toEqual(['DM1', 'DM65']);
    clearance.Response = response;
    expect(actions(block(clearance))).toEqual(['SEND', 'DUE TO', 'CANCEL', 'FREETEXT', 'PRINT']);
    expect(mailboxStatus(block(clearance))).toEqual({ text: 'UNABLE', style: 'selected' });
    expect(mailboxLines(block(clearance)).map((line) => line.map((s) => s.text).join(''))).toEqual([
      'CLIMB TO FL340',
      'DUE TO WEATHER',
    ]);
  });

  it('offers ACK and REFUSE for a departure clearance, and shows the request it replies to', () => {
    const clearance = message(AtsuMessageDirection.Uplink, 'UM169', 'CLEARED TO KJFK SQUAWK 4521');
    const b = { ...block(clearance), replyTo: { time: '1422Z', clearance: true } };
    expect(actions(b).slice(0, 3)).toEqual(['ACK', null, 'REFUSE']);
    expect(mailboxStatus({ ...b, response: 3 })).toEqual({ text: 'ACK', style: 'selected' });
    expect(
      mailboxLines(b)[0]
        .map((s) => s.text)
        .join(''),
    ).toBe('(REPLY TO 1422Z REQ:)');
  });

  it('offers MODIFY and REFRESH for a confirm message', () => {
    const confirm = message(AtsuMessageDirection.Uplink, 'UM133', null);
    confirm.SemanticResponseRequired = true;
    confirm.Response = message(AtsuMessageDirection.Downlink, 'DM32', 'FL350');
    expect(actions(block(confirm))).toEqual(['SEND', 'MODIFY', 'REFRESH', null, 'PRINT']);
  });

  it('offers LOAD-SEC3 for a route clearance, before and after the reply', () => {
    const clearance = message(AtsuMessageDirection.Uplink, 'UM79', 'AMB');
    clearance.Content[0].Content[1].Value = 'DIBAG UT210 TUDRA UT158 AMB';
    expect(actions(block(clearance))).toEqual(['WILCO', 'STANDBY', 'UNABLE', 'LOAD-SEC3', 'PRINT']);

    clearance.Response = message(AtsuMessageDirection.Downlink, 'DM2', null);
    clearance.Response.ComStatus = AtsuMessageComStatus.Sent;
    expect(actions(block(clearance))).toEqual(['WILCO', null, 'UNABLE', 'LOAD-SEC3', 'PRINT']);

    // UNABLE selected: FREETEXT takes the fourth position
    expect(actions(block(clearance, 1))).toEqual(['SEND', 'DUE TO', 'CANCEL', 'FREETEXT', 'PRINT']);

    clearance.Response = message(AtsuMessageDirection.Downlink, 'DM0', null);
    clearance.Response.ComStatus = AtsuMessageComStatus.Sent;
    expect(actions(block(clearance))).toEqual(['CLOSE', null, null, 'LOAD-SEC3', 'PRINT']);

    // A crossing constraint is loadable too; a level clearance is not
    const constraint = message(AtsuMessageDirection.Uplink, 'UM46', 'KIMMO');
    constraint.Content[0].Content[1].Value = 'FL240';
    expect(actions(block(constraint))[3]).toBe('LOAD-SEC3');
    expect(actions(block(message(AtsuMessageDirection.Uplink, 'UM20', 'FL340')))[3]).toBeNull();
  });

  it('shows the @-marked values of a freetext uplink as parameters, without the markers (A32NX DCDU convention)', () => {
    // BeyondATC departure clearance: Hoppie marks the variable fields with @ (the A380 font draws @ as a triangle)
    const clearance = message(AtsuMessageDirection.Uplink, 'UM169', 'CLRD TO @CYVR@ RWY @06R@ SQUAWK @4611@. ATIS @U@');
    // A wide line: the wrapping is not what is checked here
    const lines = mailboxLines(block(clearance), 80);
    expect(lines.flat().some((segment) => segment.text.includes('@'))).toBe(false);
    expect(lines).toEqual([
      [
        { text: 'CLRD TO ', kind: 'text' },
        { text: 'CYVR ', kind: 'parameter' },
        { text: 'RWY ', kind: 'text' },
        { text: '06R ', kind: 'parameter' },
        { text: 'SQUAWK ', kind: 'text' },
        { text: '4611', kind: 'parameter' },
        { text: '. ATIS ', kind: 'text' },
        { text: 'U', kind: 'parameter' },
      ],
    ]);
    // On the real mailbox width the full stop stays on its word
    const text = mailboxLines(block(clearance)).map((line) => line.map((segment) => segment.text).join(''));
    expect(text.join('|')).toContain('4611.');
  });

  it('highlights an unclosed @ marker to the end of the text, as the A32NX DCDU', () => {
    const lines = mailboxLines(
      block(message(AtsuMessageDirection.Uplink, 'UM169', '@D8FBW@ CDA RECEIVED @CLEARANCE CONFIRMED')),
      80,
    );
    expect(lines).toEqual([
      [
        { text: 'D8FBW ', kind: 'parameter' },
        { text: 'CDA RECEIVED ', kind: 'text' },
        { text: 'CLEARANCE CONFIRMED', kind: 'parameter' },
      ],
    ]);
  });

  it('keeps a freetext uplink without markers as plain text', () => {
    expect(mailboxLines(block(message(AtsuMessageDirection.Uplink, 'UM169', 'CONTACT MONTREAL CENTER')))).toEqual([
      [{ text: 'CONTACT MONTREAL CENTER', kind: 'text' }],
    ]);
  });
});

describe('mailbox queue rebuilt from the mailbox file (SD drawn on another DU: resync)', () => {
  /**
   * An uplink message with a unique id
   * @param uid the unique message id
   * @returns the message
   */
  const uplink = (uid: number) => {
    const msg = message(AtsuMessageDirection.Uplink, 'UM20', 'FL350');
    msg.UniqueMessageID = uid;
    return msg;
  };
  const fileBlock = (uid: number, status = MailboxStatusMessage.NoMessage) => ({ messages: [uplink(uid)], status });
  const noReply = () => null;

  it('builds the whole queue, in the order of the file, for a client that starts empty', () => {
    const { blocks, nextArrival } = queueFromMailboxFile([], [fileBlock(3), fileBlock(1), fileBlock(2)], 0, noReply);
    expect(blocks.map((b) => b.uid)).toEqual([3, 1, 2]);
    expect(blocks.map((b) => b.arrival)).toEqual([0, 1, 2]);
    expect(nextArrival).toBe(3);
    expect(blocks.every((b) => b.response === -1 && b.page === 0 && b.dueTo === null)).toBe(true);
  });

  it('keeps the selections of the flight crew of a block it already had, and drops a block no longer in the file', () => {
    const kept: MailboxBlock = { ...block(uplink(1), 0), uid: 1, page: 1, lastPageSeen: 1, dueTo: 'weather' };
    const gone: MailboxBlock = { ...block(uplink(2)), uid: 2 };
    const { blocks } = queueFromMailboxFile([kept, gone], [fileBlock(1), fileBlock(4)], 10, noReply);
    expect(blocks.map((b) => b.uid)).toEqual([1, 4]);
    expect(blocks[0]).toMatchObject({ response: 0, page: 1, lastPageSeen: 1, dueTo: 'weather', arrival: 0 });
    expect(blocks[1].arrival).toBe(10);
  });

  it('gives a new uplink block the request it replies to', () => {
    const replyTo = { time: '1200Z', clearance: false };
    const { blocks } = queueFromMailboxFile([], [fileBlock(1)], 0, () => replyTo);
    expect(blocks[0].replyTo).toBe(replyTo);
  });

  it('takes the information of the file, else the monitoring, else MFD FOR MODIF of this client', () => {
    const msg = uplink(1);
    expect(resyncedStatus(MailboxStatusMessage.Sending, msg, null)).toBe(MailboxStatusMessage.Sending);
    expect(resyncedStatus(MailboxStatusMessage.NoMessage, msg, MailboxStatusMessage.FmsDisplayForModification)).toBe(
      MailboxStatusMessage.FmsDisplayForModification,
    );
    expect(resyncedStatus(MailboxStatusMessage.NoMessage, msg, MailboxStatusMessage.Sent)).toBe(
      MailboxStatusMessage.NoMessage,
    );
    msg.MessageMonitoring = CpdlcMessageMonitoringState.Monitoring;
    expect(resyncedStatus(MailboxStatusMessage.NoMessage, msg, null)).toBe(MailboxStatusMessage.Monitoring);
    msg.MessageMonitoring = CpdlcMessageMonitoringState.Cancelled;
    expect(resyncedStatus(MailboxStatusMessage.NoMessage, msg, null)).toBe(MailboxStatusMessage.MonitoringCancelled);
  });

  it('displays the message the active client displayed, else its own, else the first one', () => {
    const { blocks } = queueFromMailboxFile([], [fileBlock(1), fileBlock(2), fileBlock(3)], 0, noReply);
    expect(resyncedVisibleUid(blocks, 2, 3)).toBe(2);
    expect(resyncedVisibleUid(blocks, 9, 3)).toBe(3);
    expect(resyncedVisibleUid(blocks, -1, null)).toBe(1);
    expect(resyncedVisibleUid([], -1, 3)).toBeNull();
  });
});

describe('ATC mailbox position on the DU (KCCU cursor)', () => {
  it('draws every SDv2 gauge (with the mailbox) at 0,0 on a 768 x 1024 DU, so the mailbox cursor offset holds', () => {
    const panelCfg = join(
      __dirname,
      '../../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire',
      'Part_Interior_Cockpit/panel/panel.cfg',
    );
    const blocks = readFileSync(panelCfg, 'utf-8')
      .split(/^\[VCockpit\d+\]/m)
      .slice(1);
    const sdv2Blocks = blocks.filter((block) => /A380X\/SDv2\//.test(block));
    // the SD DU and both ND DUs (CDS reconfiguration)
    expect(sdv2Blocks).toHaveLength(3);
    for (const block of sdv2Blocks) {
      expect(block).toMatch(/^pixel_size=768,1024\s*$/m);
      expect(block).toMatch(/^htmlgauge\d+=A380X\/SDv2\/[^,]+,\s*0,0,768,1024\s*$/m);
    }
    // the bottom 256 px of the SD
    expect(MAILBOX_TOP_ON_DU).toBe(1024 - 256);
  });
});
