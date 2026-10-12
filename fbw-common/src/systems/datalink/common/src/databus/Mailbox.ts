//  Copyright (c) 2023-2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { DclMessage, OclMessage, CpdlcMessage } from '../messages';

export enum MailboxStatusMessage {
  NoMessage = -1,
  AnswerRequired = 0,
  CommunicationFault,
  CommunicationNotAvailable,
  CommunicationNotInitialized,
  MaximumDownlinkMessages,
  LinkLost,
  FlightplanLoadFailed,
  FlightplanLoadPartial,
  FlightplanLoadingUnavailable,
  MonitoringFailed,
  MonitoringLost,
  MonitoringUnavailable,
  NoAtcReply,
  OverflowClosed,
  PrintFailed,
  PriorityMessage,
  SendFailed = 16,
  FlightplanLoadSecondary,
  FlightplanLoadingSecondary,
  FmsDisplayForText,
  FmsDisplayForModification,
  MonitoringCancelled,
  Monitoring,
  NoFmData,
  NoMoreMessages,
  NoMorePages,
  PartialFmgsData,
  Printing,
  RecallMode,
  RecallEmpty,
  Reminder,
  Sending,
  Sent,
  WaitFmData,
}

/** A message block of the mailbox file: the messages shown together, and the information of the block */
export interface MailboxSnapshotBlock {
  messages: CpdlcMessage[];
  status: MailboxStatusMessage;
}

/**
 * The whole mailbox file of the ATC function, for a mailbox client that rebuilds its queue (e.g. the A380X SD drawn on
 * another display unit, which starts late or takes the mailbox over from another client)
 */
export interface MailboxSnapshot {
  /** The blocks in the order they entered the mailbox */
  blocks: MailboxSnapshotBlock[];
  /** The message the active mailbox client displays (its last visibleMessage), -1 when none */
  visibleUid: number;
  /** The current ATC center, '' when none */
  activeAtc: string;
}

export interface AtsuMailboxMessages {
  resetSystem: boolean;
  deleteMessage: number;
  closeMessage: number;
  readMessage: number;
  visibleMessage: number;
  invertSemanticResponse: number;
  recallMessage: boolean;
  updateMessageMonitoring: number;
  stopMessageMonitoring: number;
  uplinkResponse: { uid: number; responseId: number };
  downlinkTransmit: number;
  modifyMessage: number;
  printMessage: number;
  /** LOAD-SEC3 of a route clearance: the FMS loads it in the third secondary flight plan */
  loadMessage: number;
  cpdlcMessages: CpdlcMessage[];
  dclMessages: DclMessage[];
  oclMessages: OclMessage[];
  logonMessage: string;
  systemStatus: MailboxStatusMessage;
  messageStatus: { uid: number; status: MailboxStatusMessage };
  /** A mailbox client asks for the whole mailbox file: the ATC function answers with mailboxSnapshot */
  mailboxResyncRequest: boolean;
  /** The whole mailbox file, the answer to mailboxResyncRequest (every client receives it) */
  mailboxSnapshot: MailboxSnapshot;
}
