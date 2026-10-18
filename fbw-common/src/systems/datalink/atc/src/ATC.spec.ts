// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AtsuMessageDirection, AtsuStatusCodes, CpdlcMessage, CpdlcMessagesUplink } from '../../common/src';
import { Atc } from './ATC';
import { UplinkRejectionReason } from './databus/MailboxBus';

/**
 * A powered ATC function whose downlinks are caught
 * @param a380xMailbox the A380X mailbox rules, false for the A32NX DCDU
 */
function setup(a380xMailbox: boolean) {
  const atc = new Atc(new EventBus(), false, false, a380xMailbox);
  atc.powerUp();

  const sent: CpdlcMessage[] = [];
  vi.spyOn(atc.digitalOutputs, 'sendMessage').mockImplementation((message) => {
    sent.push(message as CpdlcMessage);
    return Promise.resolve(AtsuStatusCodes.Ok);
  });
  const enqueue = vi.spyOn(atc.mailboxBus, 'enqueue');

  let transmissionId = 100;
  // a CLIMB TO uplink of the ATC center (requires WILCO/UNABLE)
  const receive = () => {
    const message = new CpdlcMessage();
    message.Direction = AtsuMessageDirection.Uplink;
    message.Station = 'EDYY';
    message.CurrentTransmissionId = ++transmissionId;
    const element = CpdlcMessagesUplink.UM20[1].deepCopy();
    element.Content[0].Value = 'FL350';
    message.Content.push(element);
    atc.insertMessages([message]);
    return message;
  };

  return { atc, sent, enqueue, receive };
}

describe('Atc automatic rejection of an uplink', () => {
  beforeEach(() => {
    // the message watchdog interval of the powered ATC function
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('A380X: an uplink in takeoff is not put in the mailbox, the ATC center gets an ERROR referring to it', () => {
    const { atc, sent, enqueue, receive } = setup(true);
    atc.digitalInputs.FwcFlightPhase = 4;
    const uplink = receive();

    expect(enqueue).not.toHaveBeenCalled();
    expect(atc.messages().some((message) => message.UniqueMessageID === uplink.UniqueMessageID)).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0].Direction).toBe(AtsuMessageDirection.Downlink);
    expect(sent[0].Station).toBe('EDYY');
    expect(sent[0].PreviousTransmissionId).toBe(uplink.CurrentTransmissionId);
    expect(sent[0].Content[0].TypeId).toBe('DM62');
    expect(sent[0].Content[0].Content[0].Value).toBe(Atc.UplinkRejectionText[UplinkRejectionReason.FlightPhase]);
  });

  it('A380X: a sixth unanswered uplink is discarded with the mailbox full ERROR', () => {
    const { atc, sent, enqueue, receive } = setup(true);
    atc.digitalInputs.FwcFlightPhase = 8;
    for (let i = 0; i < 5; i++) {
      receive();
    }
    expect(enqueue).toHaveBeenCalledTimes(5);
    expect(sent).toHaveLength(0);

    const sixth = receive();
    expect(enqueue).toHaveBeenCalledTimes(5);
    expect(sent).toHaveLength(1);
    expect(sent[0].PreviousTransmissionId).toBe(sixth.CurrentTransmissionId);
    expect(sent[0].Content[0].Content[0].Value).toBe(Atc.UplinkRejectionText[UplinkRejectionReason.MailboxFull]);
  });

  it('A380X: an uplink in cruise goes to the mailbox without a downlink', () => {
    const { atc, sent, enqueue, receive } = setup(true);
    atc.digitalInputs.FwcFlightPhase = 8;
    receive();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
  });

  it('A32NX DCDU: no rejection in takeoff nor with six uplinks, as before', () => {
    const { atc, sent, enqueue, receive } = setup(false);
    atc.digitalInputs.FwcFlightPhase = 4;
    for (let i = 0; i < 6; i++) {
      receive();
    }
    expect(enqueue).toHaveBeenCalledTimes(6);
    expect(sent).toHaveLength(0);
  });
});
