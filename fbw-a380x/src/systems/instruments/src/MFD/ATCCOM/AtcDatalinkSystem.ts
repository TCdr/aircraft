// Copyright (c) 2025-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, EventBus, Instrument, SimVarValueType, Subject } from '@microsoft/msfs-sdk';
import { AtcFmsMessages, FmsAtcMessages } from '@datalink/atc';
import {
  AtisMessage,
  AtisType,
  AtsuStatusCodes,
  Conversion,
  CpdlcMessage,
  CpdlcMessageElement,
  DatalinkModeCode,
  DatalinkStatusCode,
  DclMessage,
  OclMessage,
  PositionReportData,
} from '@datalink/common';
import { FmsRouterMessages, RouterFmsMessages } from '@datalink/router';
import { MessageStorage } from './MessageStorage';
import { isDialogueOpen, MsgRecordEntry, msgRecordEntries } from './MsgRecord';
import { RequestFrame, RequestFrameId, requestElements } from './RequestFrames';
import { FrameComposer } from './FrameComposer';
import {
  emptyPositionReport,
  isPositionReportComplete,
  PositionReportValues,
  positionReportElements,
  positionReportFromFms,
} from './PositionReport';
import { FmsData } from '@flybywiresim/fbw-sdk';
import { FmsErrorType } from '@fmgc/FmsError';
import {
  McduMessage,
  ATCCOMMessage,
  ATCCOMMessages,
  NXFictionalMessages,
  NXSystemMessages,
} from '../shared/NXSystemMessages';
import { atisPrintLines, atisTime } from '../pages/ATCCOM/AtisText';

/** The cockpit printer, as the ATC COM functions use it (the FMS printer, FmsPrinter) */
export interface AtcComPrinter {
  printText(title: string, body: readonly string[]): void;
}

/**
 * The indications of the message status / FSM button of an ATIS request area (FCOM DSC-46-10-20-30 P 32): '' when
 * none, SENDING, SENT, USE VOICE, SEND AGAIN, NO AUTO UPDATE, END OF UPDATE
 */
export type AtisStatus = '' | 'SENDING' | 'SENT' | 'USE VOICE' | 'SEND AGAIN' | 'NO AUTO UPDATE' | 'END OF UPDATE';

/** An ATIS request area of the ATIS/LIST page (FCOM DSC-46-10-20-30 P 30-34) */
export interface AtisArea {
  /** The airport, ICAO code, or null */
  icao: string | null;
  /** DEP or ARR (destination or alternate) */
  type: AtisType;
  status: AtisStatus;
  /** An ATIS request is in "waiting" state */
  waiting: boolean;
  autoUpdate: boolean;
  autoPrint: boolean;
  /** The airport or the type was updated: SEND REQUEST and AUTO UPDATE are shown */
  modified: boolean;
  /** The ATIS request was accepted by the ATC center: OPTIONS is shown */
  accepted: boolean;
  /** The ATIS version the crew has seen (the NEW ATIS symbol shows until the new version is read) */
  readVersion: string | null;
}

/** The notification (CPDLC logon) in progress on the CONNECT/NOTIFICATION page (FCOM DSC-46-10-20-30 P 3) */
export type AtcNotificationState = 'NONE' | 'NOTIFYING' | 'FAILED';

/** A notified ATC center of the NOTIFIED TO CENTERS list, with the UTC time of the notification (e.g. "1308Z") */
export interface AtcNotifiedCenter {
  icao: string;
  time: string;
}

/** The ATC centers, as the ATC function reports them */
export interface AtcStationStatus {
  /** The active ATC center, '' if none */
  current: string;
  /** The next ATC center (a notification in progress), '' if none */
  next: string;
}

/** The ADS status (FCOM DSC-46-10-10-60): ARMED by default; no ADS contract is available through the ATSU */
export type AdsStatus = 'ARMED' | 'CONNECTED' | 'OFF';

export interface AtcErrorMessage {
  message: McduMessage;
  messageText: string;
  backgroundColor: 'white' | 'amber' | 'cyan'; // Whether the message should be colored.
  cleared: boolean; // If message has been cleared from footer
}

export class AtcDatalinkSystem implements Instrument {
  private readonly messageStorage: MessageStorage;

  private readonly publisher = this.bus.getPublisher<FmsAtcMessages & FmsRouterMessages>();

  private readonly sub = this.bus.getSubscriber<AtcFmsMessages & FmsData & RouterFmsMessages & FmsRouterMessages>();

  private requestId: number = 0;

  private genericRequestResponseCallbacks: ((requestId: number) => boolean)[] = [];

  private requestAtsuStatusCodeCallbacks: ((code: AtsuStatusCodes, requestId: number) => boolean)[] = [];

  private flightNumber = '';

  private fmsOrigin: string | null = null;

  private fmsDestination: string | null = null;

  /** The frames of the REQUEST page (FCOM DSC-46-10-20-30 P 11-16) */
  public readonly request = new FrameComposer(
    () => this.addMessageToQueue(ATCCOMMessages.lastMsgElement),
    (id) => this.requestDefaults(id),
    (frames) => this.transferRequest(frames),
  );

  /** The report of the REPORT/AUTO & MANUAL POSITION page (FCOM DSC-46-10-20-30 P 17-21) */
  public readonly positionReport = Subject.create<PositionReportValues>(emptyPositionReport());

  /** The message of the mailbox modified on the REPORT/MODIFY page (FCOM DSC-46-10-20-30 P 22-23) */
  public readonly modifyMessage = Subject.create<CpdlcMessage | null>(null);

  /** Incremented when the mailbox asks the MFD to display the REPORT/MODIFY page (MODIFY button) */
  public readonly modifyRequests = Subject.create(0);

  /** The AUTO POSITION REPORT function of the ATC function */
  public readonly autoPositionReport = Subject.create(false);

  private positionReportCallbacks: ((requestId: number, data: PositionReportData) => boolean)[] = [];

  /** The frames of the EMERGENCY page (FCOM DSC-46-10-20-30 P 35-38) */
  public readonly emergency = new FrameComposer(
    () => this.addMessageToQueue(ATCCOMMessages.lastMsgElement),
    (id) => this.emergencyDefaults(id),
    (frames) => this.transferEmergency(frames),
  );

  /** The frames of the REPORT/OTHER REPORTS page (FCOM DSC-46-10-20-30 P 24-26) */
  public readonly otherReports = new FrameComposer(
    () => this.addMessageToQueue(ATCCOMMessages.lastMsgElement),
    () => ({}),
    (frames) => this.transferElementsToMailbox(requestElements(frames)),
  );

  /** The active and next ATC centers */
  public readonly stationStatus = Subject.create<AtcStationStatus>({ current: '', next: '' });

  /** The NOTIFIED TO CENTERS list, most recent first, up to 6 centers (FCOM DSC-46-10-20-30 P 4) */
  public readonly notifiedCenters = ArraySubject.create<AtcNotifiedCenter>([]);

  public readonly notificationState = Subject.create<AtcNotificationState>('NONE');

  /** The maximum uplink delay in seconds, or null for NONE */
  public readonly maxUplinkDelay = Subject.create<number | null>(null);

  public readonly adsStatus = Subject.create<AdsStatus>('ARMED');

  public readonly adsEmergency = Subject.create(false);

  /** The ATC centers connected for ADS reporting (none: no ADS contract through the ATSU) */
  public readonly adsConnectedCenters = ArraySubject.create<string>([]);

  /** The three ATIS request areas: departure, destination and alternate airports by default */
  public readonly atisAreas: readonly Subject<AtisArea>[] = [0, 1, 2].map((index) =>
    Subject.create<AtisArea>(AtcDatalinkSystem.emptyAtisArea(index === 0 ? AtisType.Departure : AtisType.Arrival)),
  );

  /** Incremented at every change of the received ATIS reports */
  public readonly atisReportsVersion = Subject.create(0);

  /** The messages of the MSG RECORD/LIST page, most recent first (FCOM DSC-46-10-20-30 P 27) */
  public readonly msgRecord = Subject.create<readonly MsgRecordEntry[]>([]);

  #atcErrors = ArraySubject.create<AtcErrorMessage>();

  get atcErrors() {
    return this.#atcErrors;
  }

  private datalinkStatus: { vhf: DatalinkStatusCode; satellite: DatalinkStatusCode; hf: DatalinkStatusCode } = {
    vhf: DatalinkStatusCode.NotInstalled,
    satellite: DatalinkStatusCode.NotInstalled,
    hf: DatalinkStatusCode.NotInstalled,
  };

  private datalinkMode: { vhf: DatalinkModeCode; satellite: DatalinkModeCode; hf: DatalinkModeCode } = {
    vhf: DatalinkModeCode.None,
    satellite: DatalinkModeCode.None,
    hf: DatalinkModeCode.None,
  };

  /**
   * Creates a new instance of the ATC Datalink System
   * @param {EventBus} bus The event bus
   */
  constructor(private readonly bus: EventBus) {
    this.messageStorage = new MessageStorage(this.sub);

    // After the message storage: the reports are stored when the pages are told
    // The ADS status for the mailbox on the SD (ADS OFF indication, FCOM DSC-46-10-20-60 P 2)
    this.adsStatus.sub(
      (status) =>
        SimVar.SetSimVarValue(
          AtcDatalinkSystem.ADS_STATUS_VAR,
          SimVarValueType.Number,
          status === 'ARMED' ? 0 : status === 'CONNECTED' ? 1 : 2,
        ),
      true,
    );

    this.sub.on('atcAtisReports').handle(() => {
      this.atisReportsVersion.set(this.atisReportsVersion.get() + 1);
      this.autoPrintNewAtis();
    });
    const updateMsgRecord = () => this.msgRecord.set(msgRecordEntries(this.messageStorage.atcMessagesBuffer));
    this.sub.on('atcResynchronizeCpdlcMessage').handle(updateMsgRecord);
    this.sub.on('atcResynchronizeDclMessage').handle(updateMsgRecord);
    this.sub.on('atcResynchronizeOclMessage').handle(updateMsgRecord);
    this.sub.on('atcDeleteMessage').handle(updateMsgRecord);

    this.sub
      .on('fmsFlightNumber')
      .whenChanged()
      .handle((flightNumber) => (this.flightNumber = flightNumber ?? ''));

    this.sub.on('atcResetData').handle(() => {
      this.messageStorage.resetAtcData();
      this.atisReportsVersion.set(this.atisReportsVersion.get() + 1);
      this.stationStatus.set({ current: '', next: '' });
      this.notificationState.set('NONE');
      this.maxUplinkDelay.set(null);
      this.atisAreas.forEach((area) => area.set({ ...area.get(), autoUpdate: false, waiting: false, status: '' }));

      this.datalinkStatus = {
        vhf: DatalinkStatusCode.NotInstalled,
        satellite: DatalinkStatusCode.NotInstalled,
        hf: DatalinkStatusCode.NotInstalled,
      };

      this.datalinkMode = {
        vhf: DatalinkModeCode.None,
        satellite: DatalinkModeCode.None,
        hf: DatalinkModeCode.None,
      };
    });

    this.sub.on('routerDatalinkStatus').handle((data) => (this.datalinkStatus = data));
    this.sub.on('routerDatalinkMode').handle((data) => (this.datalinkMode = data));

    this.sub.on('atcActiveAtisAutoUpdates').handle((airports) => {
      this.atisAreas.forEach((area) => {
        const data = area.get();
        const autoUpdate = data.icao !== null && airports.includes(data.icao);
        if (autoUpdate !== data.autoUpdate) {
          area.set({ ...data, autoUpdate });
        }
      });
    });

    this.sub.on('atcGenericRequestResponse').handle((requestId) => {
      this.genericRequestResponseCallbacks.every((callback, index) => {
        if (callback(requestId)) {
          this.genericRequestResponseCallbacks.splice(index, 1);
          return false;
        }
        return true;
      });
    });

    this.sub.on('atcStationStatus').handle((status) => {
      const previous = this.stationStatus.get();
      this.stationStatus.set({ current: status.current, next: status.next });
      if (this.notificationState.get() === 'NOTIFYING' && status.next === '') {
        // The notification ended: the center became active, or the logon timed out or was refused
        this.notificationState.set(status.current !== '' && status.current === previous.next ? 'NONE' : 'FAILED');
      }
    });

    this.sub.on('atcMessageModify').handle((message) => {
      this.modifyMessage.set(Conversion.messageDataToMessage(message) as CpdlcMessage);
      this.modifyRequests.set(this.modifyRequests.get() + 1);
    });

    this.sub.on('atcAutomaticPositionReportActive').handle((active) => this.autoPositionReport.set(active));

    this.sub.on('atcPositionReport').handle((response) => {
      this.positionReportCallbacks = this.positionReportCallbacks.filter(
        (callback) => !callback(response.requestId, response.data),
      );
    });

    this.sub.on('atcMaxUplinkDelay').handle((delay) => this.maxUplinkDelay.set(delay > 0 ? delay : null));

    this.sub.on('atcRequestAtsuStatusCode').handle((response) => {
      this.requestAtsuStatusCodeCallbacks.every((callback, index) => {
        if (callback(response.code, response.requestId)) {
          this.requestAtsuStatusCodeCallbacks.splice(index, 1);
          return false;
        }
        return true;
      });
    });

    // The request areas default to the FMS departure, destination and alternate airports
    this.sub
      .on('fmsOrigin')
      .whenChanged()
      .handle((icao) => {
        this.fmsOrigin = icao ?? null;
        this.initAtisArea(0, icao);
      });
    this.sub
      .on('fmsDestination')
      .whenChanged()
      .handle((icao) => {
        this.fmsDestination = icao ?? null;
        this.initAtisArea(1, icao);
      });
    this.sub
      .on('fmsAlternate')
      .whenChanged()
      .handle((icao) => this.initAtisArea(2, icao));
  }

  init(): void {}
  onUpdate(): void {}

  destroy() {}

  /**
   * Add ATC error message to ATCCOM message queue
   * @param {FmsErrorType} errorType error type
   * @param {string} details optional details to add to error message which are shown on the second line. For format error and entry out of range cases
   */
  showAtcErrorMessage(errorType: FmsErrorType, details?: string) {
    switch (errorType) {
      case FmsErrorType.EntryOutOfRange:
        this.addMessageToQueue(ATCCOMMessages.entryOutOfRange, details);
        break;
      case FmsErrorType.FormatError:
        this.addMessageToQueue(ATCCOMMessages.formatError, details);
        break;
      case FmsErrorType.NotInDatabase:
        this.addMessageToQueue(NXSystemMessages.notInDatabase);
        break;
      case FmsErrorType.NotYetImplemented:
        this.addMessageToQueue(NXFictionalMessages.notYetImplemented);
        break;
      default:
        break;
    }
  }

  /**
   * Clear last ATC error message from queue
   */
  clearLatestAtcErrorMessage() {
    const arr = this.atcErrors.getArray();
    const index = arr.findIndex((val) => !val.cleared);

    if (index > -1) {
      if (arr[index].message.isTypeTwo) {
        const old = arr[index];
        old.cleared = true;

        this.atcErrors.set(arr);
      } else {
        this.atcErrors.removeAt(index);
      }
    }
  }

  /**
   * Add ATCCOM message to ATCCOM message queue
   * @param {ATCCOMMessage} message message object
   * @param {string} details optional details to add to message which are shown on the second line
   */
  public addMessageToQueue(message: ATCCOMMessage, details?: string) {
    const msg: AtcErrorMessage = {
      message: message,
      messageText: details ? message.text.concat('\n', details) : message.text,
      backgroundColor: message.isAmber ? 'amber' : 'white',
      cleared: false,
    };

    const exists = this.atcErrors.getArray().findIndex((el) => el.messageText === msg.messageText && el.cleared);
    if (exists !== -1) {
      this.atcErrors.removeAt(exists);
    }
    this.atcErrors.insert(msg, 0);
  }

  private static emptyAtisArea(type: AtisType): AtisArea {
    return {
      icao: null,
      type,
      status: '',
      waiting: false,
      autoUpdate: false,
      autoPrint: false,
      modified: false,
      accepted: false,
      readVersion: null,
    };
  }

  /** A request area follows the FMS airport, unless the crew has a request running for it */
  private initAtisArea(index: number, icao: string | null | undefined): void {
    const area = this.atisAreas[index].get();
    if (area.waiting || area.autoUpdate || !icao || icao === area.icao) {
      return;
    }
    this.atisAreas[index].set({
      ...AtcDatalinkSystem.emptyAtisArea(area.type),
      icao,
      modified: true,
      accepted: this.atisReports(icao).length > 0,
    });
  }

  /**
   * Whether an ATIS request area can be modified (FCOM DSC-46-10-20-40 D, I, Q): not while a request is waiting (PLEASE
   * WAIT : IN PROGRESS) nor while an auto update contract is active (DESELECT AUTO UPDATE), and not to the same airport
   * and type as another area (IDENTICAL ATIS REQUEST)
   */
  private canModifyAtisArea(index: number, icao: string | null, type: AtisType): boolean {
    const area = this.atisAreas[index].get();
    if (area.waiting) {
      this.addMessageToQueue(ATCCOMMessages.pleaseWaitInProgress);
      return false;
    }
    if (area.autoUpdate) {
      this.addMessageToQueue(ATCCOMMessages.deselectAutoUpdate);
      return false;
    }
    const identical = this.atisAreas.some(
      (other, i) => i !== index && icao !== null && other.get().icao === icao && other.get().type === type,
    );
    if (identical) {
      this.addMessageToQueue(ATCCOMMessages.identicalAtisRequest);
      return false;
    }
    return true;
  }

  /**
   * AIRPORT entry field of an ATIS request area
   * @returns whether the entry was taken
   */
  public setAtisAirport(index: number, icao: string | null): boolean {
    const area = this.atisAreas[index].get();
    if (!this.canModifyAtisArea(index, icao, area.type)) {
      return false;
    }
    this.atisAreas[index].set({
      ...AtcDatalinkSystem.emptyAtisArea(area.type),
      icao,
      modified: icao !== null,
      accepted: icao !== null && this.atisReports(icao).length > 0,
    });
    return true;
  }

  /**
   * ATIS TYPE list of an ATIS request area
   * @returns whether the selection was taken
   */
  public setAtisType(index: number, type: AtisType): boolean {
    const area = this.atisAreas[index].get();
    if (type === area.type) {
      return true;
    }
    if (!this.canModifyAtisArea(index, area.icao, type)) {
      return false;
    }
    this.atisAreas[index].set({ ...area, type, modified: area.icao !== null, status: '' });
    return true;
  }

  /**
   * The ATIS reports received for an airport, the most recent first
   * @param {string} icao 4-letter icao of station to fetch reports of
   * @returns {AtisMessage[]} array of all ATIS messages of specific station
   */
  public atisReports(icao: string): AtisMessage[] {
    return this.messageStorage.atisReports.get(icao) ?? [];
  }

  /** The last ATIS report received for a request area, if any */
  public atisReport(index: number): AtisMessage | undefined {
    const icao = this.atisAreas[index].get().icao;
    return icao === null ? undefined : this.atisReports(icao)[0];
  }

  /** The crew has seen the whole ATIS of a request area: the NEW ATIS symbol goes out */
  public markAtisRead(index: number): void {
    const version = this.atisReport(index)?.Information ?? null;
    const area = this.atisAreas[index].get();
    if (area.readVersion !== version) {
      this.atisAreas[index].set({ ...area, readVersion: version });
    }
  }

  /**
   * Handler for receiving ATC ATIS message
   * @param {string} airport 4-letter icao code for airport
   * @param {AtisType} type ATIS type DEP/ARR/ENR
   * @returns {Promise<AtsuStatusCodes>} promise which returns an ATSU status code
   */
  private receiveAtcAtis(airport: string, type: AtisType): Promise<AtsuStatusCodes> {
    return this.requestStatusCode((requestId) =>
      this.publisher.pub('atcRequestAtis', { icao: airport, type, requestId }, true, false),
    );
  }

  /**
   * SEND REQUEST button, UPDATE option: sends the ATIS request of a request area (FCOM DSC-46-10-20-30 P 32-33)
   * @param index the request area
   */
  public async requestAtis(index: number): Promise<void> {
    const area = this.atisAreas[index].get();
    if (area.icao === null || area.waiting) {
      return;
    }
    if (!this.isDatalinkAvailable()) {
      this.addMessageToQueue(ATCCOMMessages.comDatalinkNotAvail);
      return;
    }
    this.atisAreas[index].set({ ...area, waiting: true, status: 'SENDING' });

    const response = await this.receiveAtcAtis(area.icao, area.type);

    const current = this.atisAreas[index].get();
    switch (response) {
      case AtsuStatusCodes.Ok:
      case AtsuStatusCodes.NewAtisReceived:
        this.atisAreas[index].set({ ...current, waiting: false, status: '', modified: false, accepted: true });
        break;
      case AtsuStatusCodes.NoAtisReceived:
        // The ATIS is not available at the ATC center
        this.atisAreas[index].set({ ...current, waiting: false, status: 'USE VOICE' });
        break;
      default:
        // Downlink lost, timeout or an ATIS request not valid: the crew resubmits the request
        this.atisAreas[index].set({ ...current, waiting: false, status: 'SEND AGAIN' });
        break;
    }
  }

  /**
   * AUTO UPDATE button, AUTO UPDATE / CANCEL AUTO UPDATE option: selects or deselects the auto update function
   * @param index the request area
   */
  public async toggleAtisAutoUpdate(index: number): Promise<void> {
    const area = this.atisAreas[index].get();
    if (area.icao === null) {
      return;
    }
    if (area.autoUpdate) {
      await this.genericRequest((requestId) =>
        this.publisher.pub('atcDeactivateAtisAutoUpdate', { icao: area.icao!, requestId }, true, false),
      );
      return;
    }
    if (!this.isDatalinkAvailable()) {
      this.addMessageToQueue(ATCCOMMessages.comDatalinkNotAvail);
      return;
    }
    await this.genericRequest((requestId) =>
      this.publisher.pub('atcActivateAtisAutoUpdate', { icao: area.icao!, type: area.type, requestId }, true, false),
    );
    await this.requestAtis(index);

    // No ATIS from the center (USE VOICE) or a request to send again: there is no auto update contract
    const status = this.atisAreas[index].get().status;
    if (status === 'USE VOICE' || status === 'SEND AGAIN') {
      await this.genericRequest((requestId) =>
        this.publisher.pub('atcDeactivateAtisAutoUpdate', { icao: area.icao!, requestId }, true, false),
      );
    }
  }

  /**
   * The PRINT buttons of the MSG RECORD pages: their messages are not printed (PRINTER NOT AVAIL, FCOM
   * DSC-46-10-20-40 R)
   */
  public print(): void {
    this.addMessageToQueue(ATCCOMMessages.printerNotAvail);
  }

  /** The cockpit printer on the pedestal (the FMS printer of the master FMC), null when not available */
  private printer: () => AtcComPrinter | null = () => null;

  /** The ATIS version last printed by the AUTO PRINT function of each request area */
  private readonly autoPrintedVersions: (string | null)[] = [null, null, null];

  /**
   * Connects the ATIS print functions to the cockpit printer
   * @param printer the printer, null when not available
   */
  public connectPrinter(printer: () => AtcComPrinter | null): void {
    this.printer = printer;
  }

  /** The printed lines of the last ATIS message received for a request area, null without one */
  private atisPrintBody(index: number): { title: string; lines: string[] } | null {
    const area = this.atisAreas[index].get();
    const report = this.atisReport(index);
    if (area.icao === null || !report) {
      return null;
    }
    const type = area.type === AtisType.Departure ? 'DEP' : 'ARR';
    const text = report.Reports.map((r) => r.report).join(' ');
    return {
      title: `ATC COM ATIS ${area.icao} ${type}`,
      lines: atisPrintLines(area.icao, type, report.Information, atisTime(text), text),
    };
  }

  /**
   * Prints the last ATIS messages of request areas on one printout (the messages follow each other on the paper)
   * @param indexes the request areas
   */
  private printAtisReports(indexes: readonly number[]): void {
    const printer = this.printer();
    if (!printer) {
      this.addMessageToQueue(ATCCOMMessages.printerNotAvail);
      return;
    }
    const bodies = indexes
      .map((index) => this.atisPrintBody(index))
      .filter((body): body is { title: string; lines: string[] } => body !== null);
    if (bodies.length === 0) {
      return;
    }
    const lines: string[] = [];
    bodies.forEach((body, i) => {
      if (i > 0) {
        lines.push('', '');
      }
      lines.push(...body.lines);
    });
    printer.printText(bodies.length === 1 ? bodies[0].title : 'ATC COM ATIS', lines);
  }

  /**
   * PRINT option of an ATIS request area: prints the last received ATIS message (FCOM DSC-46-10-20-30 P 33)
   * @param index the request area
   */
  public printAtis(index: number): void {
    this.printAtisReports([index]);
  }

  /** PRINT ALL button: prints all the ATIS messages displayed, on one printout (FCOM DSC-46-10-20-30 P 34) */
  public printAllAtis(): void {
    this.printAtisReports(this.atisAreas.map((_, index) => index));
  }

  /**
   * AUTO PRINT / CANCEL AUTO PRINT option: selects or deselects the auto print function, which prints the ATIS message
   * when a new ATIS version is received (FCOM DSC-46-10-20-30 P 31, 33); PRINTER NOT AVAIL without a printer
   * @param index the request area
   */
  public toggleAtisAutoPrint(index: number): void {
    const area = this.atisAreas[index].get();
    if (!area.autoPrint && !this.printer()) {
      this.addMessageToQueue(ATCCOMMessages.printerNotAvail);
      return;
    }
    // Only a new version is printed automatically
    this.autoPrintedVersions[index] = this.atisReport(index)?.Information ?? null;
    this.atisAreas[index].set({ ...area, autoPrint: !area.autoPrint });
  }

  /** AUTO PRINT: the request areas print their new ATIS versions */
  private autoPrintNewAtis(): void {
    this.atisAreas.forEach((area, index) => {
      const version = this.atisReport(index)?.Information ?? null;
      if (area.get().autoPrint && version !== null && version !== this.autoPrintedVersions[index]) {
        this.autoPrintedVersions[index] = version;
        this.printAtisReports([index]);
      }
    });
  }

  /** The ADS status that the mailbox on the SD displays: 0 ARMED, 1 CONNECTED, 2 OFF */
  public static readonly ADS_STATUS_VAR = 'L:A380X_ATCCOM_ADS_STATUS';

  /** The L: variable set while an MFD displays a recorded message on the MSG RECORD/ZOOM page */
  public static msgRecordZoomVar(side: 'CAPT' | 'FO'): string {
    return `L:A380X_MFD_${side === 'CAPT' ? 'L' : 'R'}_ATCCOM_MSG_RECORD_ZOOM`;
  }

  /** The dialogue of the ATC function with the given unique id, a message with its chain of responses */
  public msgRecordDialogue(uid: number) {
    return this.messageStorage.atcMessagesBuffer.find((message) => message.UniqueMessageID === uid);
  }

  /**
   * Whether the ERASE ALL button can erase the recorded messages: not while the other MFD displays a recorded message
   * (MSG RECORD USED OFFSIDE, FCOM DSC-46-10-20-30 P 29)
   */
  public canEraseMsgRecord(side: 'CAPT' | 'FO'): boolean {
    const offside = AtcDatalinkSystem.msgRecordZoomVar(side === 'CAPT' ? 'FO' : 'CAPT');
    if (SimVar.GetSimVarValue(offside, SimVarValueType.Bool)) {
      this.addMessageToQueue(ATCCOMMessages.msgRecordUsedOffside);
      return false;
    }
    return true;
  }

  /**
   * ERASE ALL button, after confirmation: erases the recorded messages of both MFDs. The open dialogues, still in the
   * mailbox, stay until they are closed.
   */
  public eraseMsgRecord(): void {
    this.messageStorage.atcMessagesBuffer
      .filter((dialogue) => !isDialogueOpen(dialogue))
      .forEach((dialogue) => this.publisher.pub('atcRemoveMessage', dialogue.UniqueMessageID, true, false));
  }

  /**
   * UPDATE ALL button: a new ATIS request for all the request areas, except those with an auto update contract or a
   * request in waiting state (FCOM DSC-46-10-20-30 P 34)
   */
  public updateAllAtis(): void {
    if (!this.isDatalinkAvailable()) {
      this.addMessageToQueue(ATCCOMMessages.comDatalinkNotAvail);
      return;
    }
    this.atisAreas.forEach((area, index) => {
      const data = area.get();
      if (data.icao !== null && !data.autoUpdate && !data.waiting) {
        this.requestAtis(index);
      }
    });
  }

  /**
   * The frames that complete a new REQUEST frame: DEPARTURE with the FMS airports, the aircraft type and the ATIS code
   * received (FCOM DSC-46-10-20-30 P 14)
   */
  private requestDefaults(id: RequestFrameId): Record<string, string | null> {
    if (id !== 'DEPARTURE') {
      return {};
    }
    return {
      departure: this.fmsOrigin,
      destination: this.fmsDestination,
      acType: 'A388',
      atis: (this.fmsOrigin && this.atisReports(this.fmsOrigin)[0]?.Information) || null,
    };
  }

  /** Whether a message can be transferred to the mailbox: a flight number is needed (FCOM DSC-46-10-20-40 E) */
  private canTransferToMailbox(): boolean {
    if (this.flightNumber === '') {
      this.addMessageToQueue(ATCCOMMessages.enterOrCheckFltNumber);
      return false;
    }
    return true;
  }

  /**
   * The values a new EMERGENCY frame is completed with (FCOM DSC-46-10-20-30 P 37): the FCU-selected altitude for
   * CLIMBING TO and DESCENDING TO, 121.5 MHz for REQUEST VOICE CONTACT
   */
  private emergencyDefaults(id: RequestFrameId): Record<string, string | null> {
    if (id === 'EMER_VOICE_CONTACT') {
      return { frequency: '121.500' };
    }
    if (id === 'EMER_CLIMBING_TO' || id === 'EMER_DESCENDING_TO') {
      const altitude: number | null = SimVar.GetSimVarValue('AUTOPILOT ALTITUDE LOCK VAR:3', 'feet');
      return { level: altitude ? `${Math.round(altitude / 100) * 100}FT` : null };
    }
    return {};
  }

  /**
   * XFR TO MAILBOX of the EMERGENCY page: a MAYDAY sets the ADS EMERGENCY to ON, a CANCEL EMER sets it to OFF (FCOM
   * DSC-46-10-20-30 P 36-37)
   */
  private transferEmergency(frames: readonly RequestFrame[]): boolean {
    if (!this.transferElementsToMailbox(requestElements(frames))) {
      return false;
    }
    if (frames.some((frame) => frame.id === 'MAYDAY')) {
      this.adsEmergency.set(true);
    } else if (frames.some((frame) => frame.id === 'CANCEL_EMER')) {
      this.adsEmergency.set(false);
    }
    return true;
  }

  /** Transfers a CPDLC message of the given elements to the mailbox, for the active ATC center */
  public transferElementsToMailbox(elements: CpdlcMessageElement[]): boolean {
    if (!this.canTransferToMailbox()) {
      return false;
    }
    const message = new CpdlcMessage();
    message.Station = this.stationStatus.get().current;
    message.Content.push(...elements);
    this.publisher.pub('atcRegisterCpdlcMessages', [message], true, false);
    return true;
  }

  /**
   * XFR TO MAILBOX of the REQUEST page: transfers the request to the mailbox, where the flight crew sends it (FCOM
   * DSC-46-10-20-30 P 16). A DEPARTURE frame is a departure clearance request to the departure airport, an OCEANIC frame
   * an oceanic clearance request to the oceanic ATC center, the other frames a CPDLC message to the active ATC center.
   */
  private transferRequest(frames: readonly RequestFrame[]): boolean {
    const values = frames[0].values;
    if (frames[0].id === 'DEPARTURE') {
      if (!this.canTransferToMailbox()) {
        return false;
      }
      const message = new DclMessage();
      message.Callsign = this.flightNumber;
      message.Origin = values.departure ?? '';
      message.Destination = values.destination ?? '';
      message.AcType = values.acType ?? '';
      message.Atis = values.atis ?? '';
      message.Gate = values.gate ?? '';
      message.Station = message.Origin;
      this.publisher.pub('atcRegisterDclMessages', [message], true, false);
      return true;
    }
    if (frames[0].id === 'OCEANIC') {
      if (!this.canTransferToMailbox()) {
        return false;
      }
      const message = new OclMessage();
      message.Callsign = this.flightNumber;
      message.Destination = this.fmsDestination ?? '';
      message.EntryPoint = values.entryPoint ?? '';
      message.EntryTime = values.eta ?? '';
      message.RequestedMach = values.mach ?? '';
      message.RequestedFlightlevel = values.level ?? '';
      message.Station = values.center ?? '';
      this.publisher.pub('atcRegisterOclMessages', [message], true, false);
      return true;
    }
    return this.transferElementsToMailbox(requestElements(frames));
  }

  public setPositionReportValue<K extends keyof PositionReportValues>(key: K, value: PositionReportValues[K]): void {
    this.positionReport.set({ ...this.positionReport.get(), [key]: value });
  }

  /** ERASE ALL FIELDS button: clears all the fields of the report */
  public erasePositionReport(): void {
    this.positionReport.set(emptyPositionReport());
  }

  /**
   * REFRESH DATA button: completes the report with the FMS data, except ICING, TURBULENCE and ENDURANCE (emptied) and
   * the freetext (FCOM DSC-46-10-20-30 P 20). NO FMS DATA when the FMS data are not available.
   */
  public refreshPositionReport(): void {
    const requestId = this.requestId++;
    let answered = false;
    const callback = (id: number, data: PositionReportData) => {
      if (id !== requestId) {
        return false;
      }
      answered = true;
      if (!data || !data.flightState) {
        this.addMessageToQueue(ATCCOMMessages.noFmsData);
      } else {
        const utcSeconds = SimVar.GetSimVarValue('E:ZULU TIME', 'seconds') ?? 0;
        this.positionReport.set(positionReportFromFms(data, utcSeconds, this.positionReport.get()));
      }
      return true;
    };
    this.positionReportCallbacks.push(callback);
    this.publisher.pub('atcRequestPositionReport', requestId, true, false);
    setTimeout(() => {
      if (!answered) {
        this.positionReportCallbacks = this.positionReportCallbacks.filter((c) => c !== callback);
        this.addMessageToQueue(ATCCOMMessages.noFmsData);
      }
    }, 2000);
  }

  /**
   * AUTO POSITION REPORT button (FCOM DSC-46-10-20-30 P 17): a report at each sequenced waypoint. Not possible without an
   * active datalink connection (PLEASE CHECK NOTIFICATION THEN WAIT FOR ATC CONNECTION).
   */
  public async toggleAutoPositionReport(): Promise<void> {
    if (!this.autoPositionReport.get() && this.stationStatus.get().current === '') {
      this.addMessageToQueue(ATCCOMMessages.pleaseCheckNotification);
      return;
    }
    await this.genericRequest((requestId) =>
      this.publisher.pub('atcToggleAutomaticPositionReport', requestId, true, false),
    );
  }

  /** XFR TO MAILBOX button of the REPORT/AUTO & MANUAL POSITION page */
  public transferPositionReport(): void {
    const report = this.positionReport.get();
    if (isPositionReportComplete(report) && this.transferElementsToMailbox(positionReportElements(report))) {
      this.positionReport.set(emptyPositionReport());
    }
  }

  /** XFR TO MAILBOX of the REPORT/MODIFY page: the modified message goes back to the mailbox */
  public transferModifiedMessage(message: CpdlcMessage): void {
    this.publisher.pub('atcUpdateMessage', message, true, false);
    this.modifyMessage.set(null);
  }

  /** CANCEL of the REPORT/MODIFY page: the mailbox keeps the message as it was */
  public cancelModify(): void {
    const message = this.modifyMessage.get();
    if (message) {
      this.publisher.pub('atcUpdateMessage', message, true, false);
    }
    this.modifyMessage.set(null);
  }

  /** Sends a request that the ATC function answers with a generic response */
  private genericRequest(send: (requestId: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      const requestId = this.requestId++;
      this.genericRequestResponseCallbacks.push((id: number) => {
        if (id === requestId) {
          resolve();
        }
        return id === requestId;
      });
      send(requestId);
    });
  }

  /**
   * Sends a request to the ATC function and waits for its status code
   * @param send publishes the request with its request id
   */
  private requestStatusCode(send: (requestId: number) => void): Promise<AtsuStatusCodes> {
    return new Promise<AtsuStatusCodes>((resolve) => {
      const requestId = this.requestId++;
      this.requestAtsuStatusCodeCallbacks.push((code: AtsuStatusCodes, id: number) => {
        if (id === requestId) {
          resolve(code);
        }
        return id === requestId;
      });
      send(requestId);
    });
  }

  /**
   * NOTIFY button of the CONNECT/NOTIFICATION page (FCOM DSC-46-10-20-30 P 3): sends the notification (CPDLC logon) to
   * an ATC center. The center is added to the NOTIFIED TO CENTERS list once the notification is sent.
   * @param icao the ATC center, ICAO 4-letter code
   */
  public async notify(icao: string): Promise<void> {
    if (this.flightNumber === '') {
      this.addMessageToQueue(ATCCOMMessages.enterOrCheckFltNumber);
      return;
    }
    if (!this.isDatalinkAvailable()) {
      this.addMessageToQueue(ATCCOMMessages.comDatalinkNotAvail);
      return;
    }
    this.notificationState.set('NOTIFYING');
    const code = await this.requestStatusCode((requestId) =>
      this.publisher.pub('atcLogon', { station: icao, requestId }, true, false),
    );
    if (code !== AtsuStatusCodes.Ok) {
      this.notificationState.set('FAILED');
      return;
    }
    const now = new Date(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds') * 1_000);
    const time = `${now.getUTCHours().toString().padStart(2, '0')}${now.getUTCMinutes().toString().padStart(2, '0')}Z`;
    const list = this.notifiedCenters.getArray().filter((center) => center.icao !== icao);
    this.notifiedCenters.set([{ icao, time }, ...list].slice(0, 6));
  }

  /** DISCONNECT button of the CONNECT/CONNECTION STATUS page: disconnects the active and next ATC centers */
  public async disconnect(): Promise<AtsuStatusCodes> {
    this.notificationState.set('NONE');
    return this.requestStatusCode((requestId) => this.publisher.pub('atcLogoff', requestId, true, false));
  }

  /**
   * CONNECT/MAX UPLINK DELAY page: sets the maximum uplink delay, or NONE
   * @param delay the delay in seconds, or null for NONE
   */
  public setMaxUplinkDelay(delay: number | null): void {
    const requestId = this.requestId++;
    this.maxUplinkDelay.set(delay);
    this.publisher.pub('atcSetMaxUplinkDelay', { delay: delay ?? -1, requestId }, true, false);
  }

  /** Whether any datalink medium is available (else COM DATALINK NOT AVAIL) */
  public isDatalinkAvailable(): boolean {
    return [this.datalinkStatus.vhf, this.datalinkStatus.satellite, this.datalinkStatus.hf].some(
      (status) => status === DatalinkStatusCode.DlkAvail,
    );
  }

  /**
   * Get status of datalink subsystem
   * @param {string} value name of datalink subsystem vhf/satcom/hf
   * @returns {DatalinkStatusCode} status code of datalink system
   */
  public getDatalinkStatus(value: 'vhf' | 'satcom' | 'hf'): DatalinkStatusCode {
    switch (value) {
      case 'vhf':
        return this.datalinkStatus.vhf;
      case 'satcom':
        return this.datalinkStatus.satellite;
      case 'hf':
        return this.datalinkStatus.hf;
      default:
        return DatalinkStatusCode.NotInstalled;
    }
  }

  /**
   * Get mode of datalink subsystem
   * @param {string} value name of datalink subsystem vhf/satcom/hf
   * @returns {DatalinkModeCode} mode code of datalink subsystem
   */
  public getDatalinkMode(value: 'vhf' | 'satcom' | 'hf'): DatalinkModeCode {
    switch (value) {
      case 'vhf':
        return this.datalinkMode.vhf;
      case 'satcom':
        return this.datalinkMode.satellite;
      case 'hf':
        return this.datalinkMode.hf;
      default:
        return DatalinkModeCode.None;
    }
  }
}
