// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  AtsuMessageComStatus,
  AtsuMessageDirection,
  CpdlcMessage,
  CpdlcMessagesDownlink,
  CpdlcMessagesUplink,
  MailboxStatusMessage,
} from '@datalink/common';

import {
  buildResponse,
  MailboxBlock,
  mailboxButtons,
  mailboxLines,
  mailboxMessageStyle,
  mailboxStatus,
  pageCount,
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

  it('offers LOAD-SEC3 for a route clearance, before and after the reply (FCOM DSC-46-10-40 P 24-25)', () => {
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
});
