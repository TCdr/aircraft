// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  AtsuMessageComStatus,
  AtsuMessageDirection,
  AtsuMessageSerializationFormat,
  AtsuMessageType,
  Conversion,
  CpdlcMessage,
  CpdlcMessageElement,
  CpdlcMessageExpectedResponseType,
  CpdlcMessageMonitoringState,
  CpdlcMessagesDownlink,
  CpdlcMessagesUplink,
  MailboxStatusMessage,
  UplinkMessageInterpretation,
} from '@datalink/common';

/**
 * The A380 ATC mailbox on the SD (FCOM DSC-46-10-10-70, DSC-46-10-20-60): the messages of the mailbox queue, their
 * communication buttons, status, colors and pages.
 */

/** A message of the mailbox queue: the messages of the ATC function shown together, and the crew selections */
export interface MailboxBlock {
  uid: number;
  messages: CpdlcMessage[];
  /** The order of arrival */
  arrival: number;
  /** The response the flight crew prepared (a DM id, e.g. 0 for WILCO), -1 when none */
  response: number;
  /** The information of the message (Information Messages Area) */
  status: MailboxStatusMessage;
  /** The displayed page of the message */
  page: number;
  /** The last page the flight crew displayed: SEND needs all the pages to be displayed */
  lastPageSeen: number;
  /** The justification of a NEGATIVE or UNABLE response (DUE TO button), a DUE_TO_REASONS key */
  dueTo: string | null;
  /** The downlink request this uplink message replies to: its time, and whether it is a departure / oceanic clearance */
  replyTo: { time: string; clearance: boolean } | null;
}

/** The standard responses, by downlink id (DM0 to DM5) */
export const RESPONSES = ['WILCO', 'UNABLE', 'STANDBY', 'ROGER', 'AFFIRM', 'NEGATIVE'];

/**
 * The justifications of the DUE TO button (FCOM DSC-46-10-20-60 P 6: "due to aircraft performance, weather, ..."): the
 * CPDLC elements, or the freetext
 */
export const DUE_TO_REASONS: Record<string, { label: string; typeId: string; text?: string }> = {
  weather: { label: 'DUE TO WEATHER', typeId: 'DM65' },
  performance: { label: 'DUE TO A/C PERFORMANCE', typeId: 'DM66' },
  turbulence: { label: 'DUE TO TURBULENCE', typeId: 'DM67', text: 'DUE TO TURBULENCE' },
};

export type MailboxAction =
  | 'WILCO'
  | 'UNABLE'
  | 'STANDBY'
  | 'ROGER'
  | 'AFFIRM'
  | 'NEGATIVE'
  | 'ACK'
  | 'REFUSE'
  | 'SEND'
  | 'CANCEL'
  | 'CLOSE'
  | 'MODIFY'
  | 'REFRESH'
  | 'DUE TO'
  | 'FREETEXT'
  | 'LOAD-SEC3'
  | 'PRINT';

/**
 * The response of an action (a DM id): ACK accepts a departure / oceanic clearance (a ROGER), REFUSE declines it (an
 * UNABLE), FCOM DSC-46-10-20-60 P 5-6
 * @param action the button of the flight crew
 * @returns the DM id of the response, -1 for a button that is not a response
 */
export function responseOf(action: MailboxAction): number {
  if (action === 'ACK') {
    return 3;
  }
  if (action === 'REFUSE') {
    return 1;
  }
  return RESPONSES.indexOf(action);
}

/**
 * The label of a response: ACK / REFUSE for a departure / oceanic clearance
 * @param block the message block
 * @param response the DM id of the response
 * @returns the label shown in the message status
 */
export function responseLabel(block: MailboxBlock, response: number): string {
  if (block.replyTo?.clearance) {
    if (response === 3) {
      return 'ACK';
    }
    if (response === 1) {
      return 'REFUSE';
    }
  }
  return RESPONSES[response] ?? '';
}

export interface MailboxButton {
  action: MailboxAction;
  enabled: boolean;
}

/** The five communication button positions, top to bottom (FCOM figure: WILCO, STANDBY, UNABLE, LOAD->SEC3, PRINT) */
export type MailboxButtons = [
  MailboxButton | null,
  MailboxButton | null,
  MailboxButton | null,
  MailboxButton | null,
  MailboxButton | null,
];

/** The lines of a page of the message area, below the time / origin line (FCOM figure) */
export const MAILBOX_PAGE_LINES = 5;
/** The characters of a line, on the left of the page buttons */
export const MAILBOX_LINE_LENGTH = 23;

/**
 * The type of the first element of a message
 * @param message the message, if any
 * @returns the type id (e.g. DM0), empty without a message
 */
function typeId(message: CpdlcMessage | null | undefined): string {
  return message?.Content[0]?.TypeId ?? '';
}

/**
 * Whether a message is a standard response of the flight crew
 * @param message the message, if any
 * @returns true for DM0 to DM5 (WILCO, UNABLE, STANDBY, ROGER, AFFIRM, NEGATIVE)
 */
function isCrewResponse(message: CpdlcMessage | null | undefined): boolean {
  return /^DM[0-5]$/.test(typeId(message));
}

/**
 * A response of the flight crew in the message but not sent (e.g. UNABLE DUE TO WEATHER, or a response modified on the
 * MFD): SEND transmits it as it is
 * @param message the uplink message
 * @returns true when the message holds such a response, open or failed
 */
export function isPreparedResponse(message: CpdlcMessage): boolean {
  const response = message.Response;
  return (
    !message.SemanticResponseRequired &&
    isCrewResponse(response) &&
    (response.ComStatus === AtsuMessageComStatus.Open || response.ComStatus === AtsuMessageComStatus.Failed)
  );
}

/**
 * The response the flight crew prepared, with its justification, for the ATC function to send
 * @param message the uplink message
 * @param response the standard response (a DM id)
 * @param dueTo the justification (a DUE_TO_REASONS key), or null
 * @returns the downlink response message
 */
export function buildResponse(message: CpdlcMessage, response: number, dueTo: string | null): CpdlcMessage {
  const result = new CpdlcMessage();
  result.Direction = AtsuMessageDirection.Downlink;
  result.Station = message.Station;
  result.PreviousTransmissionId = message.CurrentTransmissionId;
  result.Content.push(CpdlcMessagesDownlink[`DM${response}`][1].deepCopy());
  const reason = dueTo ? DUE_TO_REASONS[dueTo] : undefined;
  if (reason) {
    const element = CpdlcMessagesDownlink[reason.typeId][1].deepCopy();
    if (reason.text) {
      element.Content[0].Value = reason.text;
    }
    result.Content.push(element);
  }
  return result;
}

/**
 * Whether an uplink message expects a response of the flight crew
 * @param message the message
 * @returns true for an uplink message with an expected response
 */
export function answerRequired(message: CpdlcMessage): boolean {
  const expected = message.Content[0]?.ExpectedResponse;
  return (
    message.Direction === AtsuMessageDirection.Uplink &&
    expected !== undefined &&
    expected !== CpdlcMessageExpectedResponseType.NotRequired &&
    expected !== CpdlcMessageExpectedResponseType.No
  );
}

/**
 * The number of pages of the message area for a message block
 * @param block the message block
 * @returns the page count, at least 1
 */
export function pageCount(block: MailboxBlock): number {
  return Math.max(1, Math.ceil(mailboxLines(block).length / MAILBOX_PAGE_LINES));
}

/**
 * Whether the flight crew displayed every page of a message block
 * @param block the message block
 * @returns true when the last page has been displayed
 */
function allPagesSeen(block: MailboxBlock): boolean {
  return block.lastPageSeen >= pageCount(block) - 1;
}

const button = (action: MailboxAction, enabled = true): MailboxButton => ({ action, enabled });

/**
 * The communication buttons of a message (FCOM DSC-46-10-20-60 P 4-6): the possible replies of an uplink message, SEND
 * and CANCEL once a reply is prepared or for a downlink message to send, CLOSE when processed, and PRINT. A route
 * clearance or a crossing constraint (loadable messages) also has LOAD-SEC3 in the fourth position, before and after the reply (FCOM DSC-46-10-40 P 24-25), unless
 * FREETEXT is there.
 * @param block the message block
 * @returns the five button positions, null where there is no button
 */
export function mailboxButtons(block: MailboxBlock): MailboxButtons {
  const buttons = communicationButtons(block);
  const message = block.messages[0];
  if (
    message.Direction === AtsuMessageDirection.Uplink &&
    buttons[3] === null &&
    UplinkMessageInterpretation.IsLoadable(message)
  ) {
    buttons[3] = button('LOAD-SEC3');
  }
  return buttons;
}

/**
 * The buttons of a message, without LOAD-SEC3 (see {@link mailboxButtons})
 * @param block the message block
 * @returns the five button positions, null where there is no button
 */
function communicationButtons(block: MailboxBlock): MailboxButtons {
  const message = block.messages[0];
  const buttons: MailboxButtons = [null, null, null, null, button('PRINT')];

  if (message.Direction === AtsuMessageDirection.Downlink) {
    if (message.ComStatus === AtsuMessageComStatus.Open || message.ComStatus === AtsuMessageComStatus.Failed) {
      // A downlink message is sent once all its pages have been displayed
      buttons[0] = button('SEND', allPagesSeen(block));
      buttons[2] = button('CANCEL');
    } else {
      buttons[0] = button('CLOSE', message.ComStatus === AtsuMessageComStatus.Sent);
    }
    return buttons;
  }

  const response = message.Response;
  const sending = response?.ComStatus === AtsuMessageComStatus.Sending;
  const responseSent = response?.ComStatus === AtsuMessageComStatus.Sent;

  // A confirm message: the ATC function prepares the response with the FMS data, the flight crew can modify it on the
  // REPORT/MODIFY page of the MFD
  if (message.SemanticResponseRequired) {
    if (!responseSent) {
      const complete = !!response && response.Content.every((element) => element.Content.every((c) => c.Value !== ''));
      const underModification = block.status === MailboxStatusMessage.FmsDisplayForModification;
      buttons[0] = button('SEND', !sending && complete && !underModification);
      buttons[1] = button('MODIFY', !sending && !underModification);
      // REFRESH updates the FMS data of the response
      buttons[2] = button('REFRESH', !sending && !underModification);
    } else {
      buttons[0] = button('CLOSE');
    }
    return buttons;
  }

  if (!answerRequired(message)) {
    buttons[0] = button('CLOSE');
    return buttons;
  }

  // A response prepared by the flight crew: selected, or in the message (after FREETEXT, or not sent)
  const prepared = isPreparedResponse(message);
  if (block.response !== -1 || prepared) {
    const negative = [1, 5].includes(block.response) || ['DM1', 'DM5'].includes(typeId(response));
    const underModification = block.status === MailboxStatusMessage.FmsDisplayForModification;
    buttons[0] = button('SEND', !sending && !underModification);
    buttons[2] = button('CANCEL', !sending && !underModification);
    // A justification or a freetext for a NEGATIVE or UNABLE response (FCOM DSC-46-10-20-60 P 6-7)
    if (negative) {
      buttons[1] = button('DUE TO', !sending && !underModification);
      buttons[3] = button('FREETEXT', !sending && !underModification);
    }
    return buttons;
  }

  // Standby: the final answer is still to be sent
  const standby = typeId(response) === 'DM2';
  if (response && !standby) {
    buttons[0] = button('CLOSE', !sending);
    return buttons;
  }

  const enabled = !sending;
  // A departure / oceanic clearance: ACK or REFUSE (FCOM DSC-46-10-20-60 P 5-6)
  if (block.replyTo?.clearance) {
    buttons[0] = button('ACK', enabled);
    buttons[2] = button('REFUSE', enabled);
    return buttons;
  }
  switch (message.Content[0]?.ExpectedResponse) {
    case CpdlcMessageExpectedResponseType.WilcoUnable:
      buttons[0] = button('WILCO', enabled);
      buttons[1] = standby ? null : button('STANDBY', enabled);
      buttons[2] = button('UNABLE', enabled);
      break;
    case CpdlcMessageExpectedResponseType.AffirmNegative:
      buttons[0] = button('AFFIRM', enabled);
      buttons[1] = standby ? null : button('STANDBY', enabled);
      buttons[2] = button('NEGATIVE', enabled);
      break;
    default:
      buttons[0] = button('ROGER', enabled);
      break;
  }
  return buttons;
}

export type MailboxStatusStyle = 'open' | 'selected' | 'answered';

/**
 * The message status (FCOM figure): OPEN while an uplink message waits for its response, the prepared response in black
 * on a blue background, the sent response. Empty for a downlink message and an uplink message without response.
 * @param block the message block
 * @returns the status text and its style, or null
 */
export function mailboxStatus(block: MailboxBlock): { text: string; style: MailboxStatusStyle } | null {
  const message = block.messages[0];
  if (message.Direction !== AtsuMessageDirection.Uplink) {
    return null;
  }
  if (block.response !== -1) {
    return { text: responseLabel(block, block.response), style: 'selected' };
  }
  if (isCrewResponse(message.Response)) {
    const text = responseLabel(block, parseInt(typeId(message.Response).substring(2)));
    return { text, style: message.Response.ComStatus === AtsuMessageComStatus.Sent ? 'answered' : 'selected' };
  }
  if (answerRequired(message) || message.SemanticResponseRequired) {
    return { text: 'OPEN', style: 'open' };
  }
  return null;
}

/**
 * The colors of a message (FCOM DSC-46-10-10-70 P 3): an uplink message in white with the main parameters in blue
 * (magenta when monitored), green when answered; a downlink message in black on a blue background before sending, on a
 * green background after sending.
 */
export type MailboxMessageStyle = 'uplink' | 'answered' | 'downlink' | 'downlinkSent';

/**
 * The colors of a message block (see {@link MailboxMessageStyle})
 * @param block the message block
 * @returns the style of its first message
 */
export function mailboxMessageStyle(block: MailboxBlock): MailboxMessageStyle {
  const message = block.messages[0];
  if (message.Direction === AtsuMessageDirection.Downlink) {
    return message.ComStatus === AtsuMessageComStatus.Sent ? 'downlinkSent' : 'downlink';
  }
  const response = message.Response;
  return response?.ComStatus === AtsuMessageComStatus.Sent && typeId(response) !== 'DM2' ? 'answered' : 'uplink';
}

/** A part of a line: text, a main parameter, a monitored parameter, or the prepared response of a confirm message */
export interface MailboxSegment {
  text: string;
  kind: 'text' | 'parameter' | 'monitored' | 'response';
}

export type MailboxLine = MailboxSegment[];

/**
 * The segments of a freetext value: Hoppie/BeyondATC mark the variable fields of a freetext uplink with @ (e.g.
 * "CLRD TO @CYVR@ RWY @06R@"). The marked fields are parameters (FCOM DSC-46-10-10-70: "the main parameters in blue"),
 * the markers are dropped (the A380 display font draws @ as a triangle). An unclosed marker runs to the end of the
 * text, as on the A32NX DCDU.
 * @param value the freetext value
 * @param parameterKind the kind of a marked field
 * @returns the segments of the value
 */
function freetextSegments(value: string, parameterKind: MailboxSegment['kind']): MailboxSegment[] {
  const segments: MailboxSegment[] = [];
  value.split('@').forEach((part, i) => {
    if (part !== '') {
      segments.push({ text: part, kind: i % 2 === 1 ? parameterKind : 'text' });
    }
  });
  return segments;
}

/**
 * The segments of a message element: the text of its CPDLC template, with its values as parameters
 * @param direction the direction of the message (uplink or downlink template)
 * @param element the message element
 * @param monitored whether the message is monitored (its parameters in magenta)
 * @returns the segments of the element
 */
function elementSegments(direction: AtsuMessageDirection, element: CpdlcMessageElement, monitored: boolean) {
  const catalog = direction === AtsuMessageDirection.Uplink ? CpdlcMessagesUplink : CpdlcMessagesDownlink;
  const template = catalog[element.TypeId]?.[0][0] ?? '';
  const parts = template.split('%s');
  const segments: MailboxSegment[] = [];
  // A freetext element is text
  const freetext = template.trim() === '%s';
  parts.forEach((part, i) => {
    if (part !== '') {
      segments.push({ text: part, kind: 'text' });
    }
    if (i < parts.length - 1) {
      const value = element.Content[i]?.Value || '[      ]';
      const parameterKind = monitored ? 'monitored' : 'parameter';
      if (freetext) {
        segments.push(...freetextSegments(value, parameterKind));
      } else {
        segments.push({ text: value, kind: parameterKind });
      }
    }
  });
  return segments;
}

/**
 * The segments of a message, on one line
 * @param message the message
 * @param kind a kind for every segment (e.g. a response), or the kinds of the elements
 * @returns the segments of the message
 */
function messageSegments(message: CpdlcMessage, kind?: MailboxSegment['kind']): MailboxSegment[] {
  let segments: MailboxSegment[];
  if (message.Type === AtsuMessageType.DCL || message.Type === AtsuMessageType.OCL) {
    segments = [{ text: message.serialize(AtsuMessageSerializationFormat.Mailbox).replace(/@/g, ''), kind: 'text' }];
  } else if (message.Content.length === 0) {
    segments = [{ text: message.Message.replace(/_/g, ' '), kind: 'text' }];
  } else {
    const monitored = message.MessageMonitoring === CpdlcMessageMonitoringState.Monitoring;
    // No flatMap: not in the Coherent GT runtime
    segments = [];
    message.Content.forEach((element) => {
      segments.push({ text: ' ', kind: 'text' }, ...elementSegments(message.Direction, element, monitored));
    });
  }
  return kind ? segments.map((segment) => ({ ...segment, kind })) : segments;
}

/** A word of a message: a segment of one word, glued to the previous word when no space separates them */
interface MailboxWord extends MailboxSegment {
  glued: boolean;
}

/**
 * The segments as words, a word keeping the kind of its segment
 * @param segments the segments
 * @returns one word per segment word, in capitals; a word that follows the previous segment without a space (the
 * full stop in "@4611@.") is glued to it
 */
function words(segments: MailboxSegment[]): MailboxWord[] {
  const result: MailboxWord[] = [];
  let previousEndsInWord = false;
  for (const segment of segments) {
    const text = segment.text.replace(/\n/g, ' ').toUpperCase();
    text.split(' ').forEach((word, i) => {
      if (word !== '') {
        result.push({ text: word, kind: segment.kind, glued: i === 0 && previousEndsInWord });
      }
    });
    if (text !== '') {
      previousEndsInWord = !text.endsWith(' ');
    }
  }
  return result;
}

/**
 * The lines of a message: words kept whole, a word longer than a line cut
 * @param block the message block
 * @param length the characters of a line
 * @returns the lines of the message area
 */
export function mailboxLines(block: MailboxBlock, length = MAILBOX_LINE_LENGTH): MailboxLine[] {
  const lines: MailboxLine[] = [];
  const addWords = (segments: MailboxSegment[]) => {
    let line: MailboxLine = [];
    let lineLength = 0;
    for (const word of words(segments)) {
      let text = word.text;
      while (text.length > 0) {
        // A glued word follows the previous one without a space (the first part of a word cut over lines only)
        const space = lineLength > 0 && !(word.glued && text === word.text) ? 1 : 0;
        const needed = space + Math.min(text.length, length);
        if (lineLength + needed > length) {
          lines.push(line);
          line = [];
          lineLength = 0;
          continue;
        }
        const part = text.substring(0, length);
        text = text.substring(part.length);
        if (lineLength > 0) {
          const last = line[line.length - 1];
          const separator = space === 1 ? ' ' : '';
          if (last.kind === word.kind) {
            last.text += `${separator}${part}`;
          } else {
            last.text += separator;
            line.push({ text: part, kind: word.kind });
          }
          lineLength += space + part.length;
        } else {
          line.push({ text: part, kind: word.kind });
          lineLength = part.length;
        }
      }
    }
    if (line.length > 0) {
      lines.push(line);
    }
  };

  // The reply to a request of the flight crew (FCOM figure: (REPLY TO 1422Z REQ:))
  if (block.replyTo) {
    addWords([{ text: `(REPLY TO ${block.replyTo.time} REQ:)`, kind: 'text' }]);
  }
  for (const message of block.messages) {
    addWords(messageSegments(message));
    const response = message.Response;
    if (message.SemanticResponseRequired && response) {
      // A confirm message: the response prepared with the FMS data
      addWords(messageSegments(response, 'response'));
    } else if (response && isCrewResponse(response) && response.Content.length > 1) {
      // The justification or the freetext of a response
      const extension = Conversion.messageDataToMessage(response) as CpdlcMessage;
      extension.Content = extension.Content.slice(1);
      addWords(messageSegments(extension, 'response'));
    }
  }
  if (block.dueTo && DUE_TO_REASONS[block.dueTo]) {
    addWords([{ text: DUE_TO_REASONS[block.dueTo].label, kind: 'response' }]);
  }
  return lines;
}

/** The texts of the Information Messages Area (FCOM DSC-46-10-20-60 P 7-9) */
const INFORMATION: Partial<Record<MailboxStatusMessage, string>> = {
  [MailboxStatusMessage.AnswerRequired]: 'ANSWER MSG',
  [MailboxStatusMessage.CommunicationFault]: 'COM FAULT',
  [MailboxStatusMessage.CommunicationNotAvailable]: 'COM NOT AVAIL',
  [MailboxStatusMessage.CommunicationNotInitialized]: 'COM NOT INIT',
  [MailboxStatusMessage.MaximumDownlinkMessages]: 'FILE FULL',
  [MailboxStatusMessage.LinkLost]: 'LINK LOST',
  [MailboxStatusMessage.FlightplanLoadFailed]: 'LOAD FAILED',
  [MailboxStatusMessage.FlightplanLoadPartial]: 'LOAD PARTIAL',
  [MailboxStatusMessage.FlightplanLoadingUnavailable]: 'LOAD NOT AVAIL',
  [MailboxStatusMessage.MonitoringFailed]: 'MONIT FAILED',
  [MailboxStatusMessage.MonitoringLost]: 'MONIT LOST',
  [MailboxStatusMessage.MonitoringUnavailable]: 'MONIT NOT AVAIL',
  [MailboxStatusMessage.NoAtcReply]: 'NO ATC REPLY',
  [MailboxStatusMessage.OverflowClosed]: 'OVERFLW CLOSED',
  [MailboxStatusMessage.PrintFailed]: 'PRINT FAILED',
  [MailboxStatusMessage.SendFailed]: 'SEND FAILED',
  [MailboxStatusMessage.FlightplanLoadSecondary]: 'LOAD OK',
  [MailboxStatusMessage.FlightplanLoadingSecondary]: 'LOADING',
  [MailboxStatusMessage.FmsDisplayForModification]: 'MFD FOR MODIF',
  [MailboxStatusMessage.MonitoringCancelled]: 'MONIT CNCLD',
  [MailboxStatusMessage.Monitoring]: 'FMS MONITORING',
  [MailboxStatusMessage.NoFmData]: 'NO FMS DATA',
  [MailboxStatusMessage.PartialFmgsData]: 'PARTIAL FMS DATA',
  [MailboxStatusMessage.Printing]: 'PRINTING',
  [MailboxStatusMessage.RecallMode]: 'RECALL MODE',
  [MailboxStatusMessage.Reminder]: 'REMINDER',
  [MailboxStatusMessage.Sending]: 'SENDING',
  [MailboxStatusMessage.Sent]: 'SENT',
  [MailboxStatusMessage.WaitFmData]: 'WAIT FMS DATA',
};

/**
 * The text of the Information Messages Area for a mailbox status
 * @param status the mailbox status message
 * @returns the text, empty for a status without text
 */
export function informationText(status: MailboxStatusMessage): string {
  return INFORMATION[status] ?? '';
}
