// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  AtsuMessageComStatus,
  AtsuMessageDirection,
  AtsuMessageSerializationFormat,
  AtsuMessageType,
  AtsuTimestamp,
  CpdlcMessage,
  CpdlcMessageElement,
  CpdlcMessageExpectedResponseType,
  CpdlcMessagesDownlink,
  CpdlcMessagesUplink,
} from '@datalink/common';

/**
 * The status of a recorded message (FCOM DSC-46-10-20-30 P 28-29): the response of the flight crew to an uplink message,
 * OPEN when a downlink or a response message is not acknowledged, '' for a downlink message and for an uplink message
 * without response
 */
export type MsgRecordStatus = '' | 'AFFIRM' | 'NEGATIVE' | 'OPEN' | 'ROGER' | 'STANDBY' | 'UNABLE' | 'WILCO';

/** A message of the MSG RECORD/LIST page */
export interface MsgRecordEntry {
  /** The unique id of the dialogue (the first message) */
  uid: number;
  /** The position of the message in the dialogue, 0 for the first message */
  position: number;
  /** The UTC time at which the ATC center sends the message (uplink) or the flight crew sends it (downlink), HHMMZ */
  time: string;
  /** FROM the ATC center (uplink) or TO the ATC center (downlink) */
  direction: 'FROM' | 'TO';
  station: string;
  status: MsgRecordStatus;
  /** The whole message on one line */
  text: string;
  /** For the order, most recent first: the time, then the later message of a dialogue, then the dialogue order */
  sortKey: number;
  dialogueOrder: number;
}

/** The standard flight crew responses, shown as the status of the uplink message */
const CREW_RESPONSES: Record<string, MsgRecordStatus> = {
  DM0: 'WILCO',
  DM1: 'UNABLE',
  DM2: 'STANDBY',
  DM3: 'ROGER',
  DM4: 'AFFIRM',
  DM5: 'NEGATIVE',
};

/** The connection management pseudo messages of the ATC function (logon, logoff, handover): not CPDLC messages */
const CONNECTION_MESSAGES = ['DM9998', 'DM9999', 'UM9995', 'UM9996', 'UM9997', 'UM9998', 'UM9999'];

function typeId(message: CpdlcMessage): string {
  return message.Content[0]?.TypeId ?? '';
}

function sortKey(timestamp: AtsuTimestamp | null | undefined): number {
  if (!timestamp) {
    return 0;
  }
  return ((timestamp.Year * 12 + timestamp.Month) * 31 + timestamp.Day) * 86400 + timestamp.Seconds;
}

/** The text of a message element: its template with the entered values */
function elementText(direction: AtsuMessageDirection, element: CpdlcMessageElement): string {
  // Without the @ markers of the freetext variable fields (Hoppie "CLRD TO @CYVR@"): the A380 font draws @ as a triangle
  const values = element.Content.map((entry) => (entry.Value ?? '').replace(/@/g, ''));
  const catalog = direction === AtsuMessageDirection.Uplink ? CpdlcMessagesUplink : CpdlcMessagesDownlink;
  let text = catalog[element.TypeId]?.[0][0] ?? '';
  values.forEach((value) => (text = text.replace('%s', value !== '' ? value : '[      ]')));
  return text;
}

/**
 * The text of a message on one line. Built from the message templates: the serialization of the ATC function keeps
 * only letters, digits and a few signs (no & / , for instance).
 */
export function msgRecordText(message: CpdlcMessage): string {
  let text: string;
  if (message.Type === AtsuMessageType.DCL || message.Type === AtsuMessageType.OCL) {
    text = message.serialize(AtsuMessageSerializationFormat.Mailbox).replace(/@/g, '');
  } else if (message.Content.length === 0) {
    text = message.Message.replace(/_/g, ' ');
  } else {
    text = message.Content.map((element) => elementText(message.Direction, element)).join(' ');
  }
  return text.replace(/\s+/g, ' ').trim().toUpperCase();
}

function isCrewResponse(message: CpdlcMessage | null | undefined): boolean {
  return (
    !!message && message.Direction === AtsuMessageDirection.Downlink && CREW_RESPONSES[typeId(message)] !== undefined
  );
}

function status(message: CpdlcMessage): MsgRecordStatus {
  if (message.Direction === AtsuMessageDirection.Downlink) {
    return message.ComStatus === AtsuMessageComStatus.Failed ? 'OPEN' : '';
  }
  const response = message.Response;
  if (isCrewResponse(response)) {
    return response.ComStatus === AtsuMessageComStatus.Failed ? 'OPEN' : CREW_RESPONSES[typeId(response)];
  }
  return '';
}

/**
 * The messages of the MSG RECORD/LIST page, most recent first: every message of every dialogue, the standard crew
 * responses shown as the status of the uplink message they answer
 * @param dialogues the dialogues of the ATC function, each a message with its chain of responses
 */
export function msgRecordEntries(dialogues: readonly CpdlcMessage[]): MsgRecordEntry[] {
  const entries: MsgRecordEntry[] = [];
  let order = 0;
  for (const dialogue of dialogues) {
    if (CONNECTION_MESSAGES.includes(typeId(dialogue))) {
      continue;
    }
    let message: CpdlcMessage | null = dialogue;
    let position = 0;
    let lastKey = 0;
    let lastTime = '';
    while (message) {
      // A message without its own time (a response created on board) takes the time of the previous one
      if (sortKey(message.Timestamp) > lastKey) {
        lastKey = sortKey(message.Timestamp);
        lastTime = message.Timestamp.mailboxTimestamp();
      }
      if (!(position > 0 && isCrewResponse(message))) {
        entries.push({
          uid: dialogue.UniqueMessageID,
          position,
          time: lastTime,
          direction: message.Direction === AtsuMessageDirection.Uplink ? 'FROM' : 'TO',
          station: message.Station,
          status: status(message),
          text: msgRecordText(message),
          sortKey: lastKey,
          dialogueOrder: order,
        });
      }
      message = message.Response;
      position++;
    }
    order++;
  }
  return entries.sort(
    (a, b) => b.sortKey - a.sortKey || (a.uid === b.uid ? b.position - a.position : a.dialogueOrder - b.dialogueOrder),
  );
}

/**
 * Whether a dialogue is still open: an uplink message waits for the flight crew response, a request waits for the ATC
 * response, or a message is being sent. An open dialogue stays in the mailbox and is not erased by ERASE ALL.
 */
export function isDialogueOpen(dialogue: CpdlcMessage): boolean {
  let last: CpdlcMessage = dialogue;
  while (last.Response) {
    if (last.ComStatus === AtsuMessageComStatus.Sending) {
      return true;
    }
    last = last.Response;
  }
  if (last.ComStatus === AtsuMessageComStatus.Sending) {
    return true;
  }
  const expected = last.Content[0]?.ExpectedResponse;
  if (last.Direction === AtsuMessageDirection.Uplink) {
    return (
      expected !== undefined &&
      expected !== CpdlcMessageExpectedResponseType.NotRequired &&
      expected !== CpdlcMessageExpectedResponseType.No
    );
  }
  // A STANDBY answer keeps the uplink message open until the final response
  if (typeId(last) === 'DM2') {
    return true;
  }
  return expected === CpdlcMessageExpectedResponseType.Yes && last.ComStatus !== AtsuMessageComStatus.Failed;
}

/** The lines of a text in lines of the given length, words kept whole (a word longer than a line is cut) */
export function wrapMsgRecordText(text: string, length: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ').filter((w) => w !== '')) {
    let rest = word;
    while (rest.length > length) {
      if (line !== '') {
        lines.push(line);
        line = '';
      }
      lines.push(rest.substring(0, length));
      rest = rest.substring(length);
    }
    if (line === '') {
      line = rest;
    } else if (line.length + 1 + rest.length <= length) {
      line = `${line} ${rest}`;
    } else {
      lines.push(line);
      line = rest;
    }
  }
  if (line !== '') {
    lines.push(line);
  }
  return lines;
}

/** The message line of the list (FCOM figure): the start of the message, >>> when the message continues */
export function msgRecordListLine(text: string, length: number): string {
  if (text.length <= length) {
    return text;
  }
  const lines = wrapMsgRecordText(text, length - 3);
  return lines.length > 1 ? `${lines[0]}>>>` : lines[0] ?? '';
}
