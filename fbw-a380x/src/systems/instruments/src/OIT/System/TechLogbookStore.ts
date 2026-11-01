// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { A380AocPrintEvents, AocPrintout } from '@shared/AocPrintout';
import { FwsEvents } from '../../MsfsAvionicsCommon/providers/FwsPublisher';
import { EcamAbnormalProcedures } from '../../MsfsAvionicsCommon/EcamMessages';
import { SecureCommunicationInterface } from './SecureCommunicationInterface';
import {
  EcamAlertOccurrence,
  LogbookAvionicsInfo,
  LogbookBlockData,
  LogbookDefectEntry,
  TECH_LOGBOOK_STORAGE_KEY,
  TechLogbookState,
  appearedEcamAlerts,
  closeFlight,
  completeAcceptance,
  completeGroundUpdate,
  completeSending,
  createTechLogbook,
  ecamAlertTitle,
  giveBackToGround,
  parseTechLogbook,
  recordDefect,
  signAcceptance,
  startSending,
} from './TechLogbook';
import { OisDialog, OisDialogButton } from './OisDialog';

/** The flight log values the logbook reuses (AnsuOps) */
export interface LogbookFlightLogSource {
  readonly outBlockTime: Subscribable<number | null>;
  readonly offBlockTime: Subscribable<number | null>;
  readonly onBlockTime: Subscribable<number | null>;
  readonly inBlockTime: Subscribable<number | null>;
  readonly outBlockFob: Subscribable<number | null>;
  readonly inBlockFob: Subscribable<number | null>;
  readonly flightTime: Subscribable<number | null>;
}

/** The synchronisations with the ground station, during which the logbook must not be used */
export type LogbookSyncOperation = 'update' | 'give-back' | 'acceptance' | 'closure';

/** The end of a synchronisation, which the OIT that started it tells the crew */
export type LogbookSyncResult =
  | 'update-done'
  | 'update-failed'
  | 'give-back-done'
  | 'give-back-failed'
  | 'acceptance-acknowledged'
  | 'acceptance-not-acknowledged'
  | 'closure-sent'
  | 'closure-not-sent';

export type LogbookDialogButton = OisDialogButton;

/** A LOGBOOK message window: see OisDialog */
export type LogbookDialog = OisDialog;

/** Design choice: the duration of a synchronisation with the ground station, ms */
const SYNC_DURATION_MS = 5_000;

/** Design choice: the time for the ground to acknowledge sent items, ms */
const SEND_DURATION_MS = 3_000;

/**
 * The technical logbook of one OIT side: the logbook database (stored with NXDataStore, so the other OIT and the next
 * sim session see it), the ECAM alerts of the flight, and the synchronisations with the ground in progress. Kept by
 * the NSS AVNCS ANSU so that it lives across the OIT page changes.
 */
export class TechLogbookStore {
  private readonly subscriptions: Subscription[] = [];

  private readonly sub = this.bus.getSubscriber<FwsEvents>();

  public readonly state = Subject.create<TechLogbookState>(createTechLogbook());

  /** The ECAM alerts that appeared on the EWD during the flight, newest first */
  public readonly ecamAlerts = Subject.create<readonly EcamAlertOccurrence[]>([]);

  /** The synchronisation in progress, null when none */
  public readonly syncInProgress = Subject.create<LogbookSyncOperation | null>(null);

  /** The end of the last synchronisation this OIT started, for its message */
  public readonly syncResult = Subject.create<LogbookSyncResult | null>(null);

  /** Whether the flight crew identified themselves on this OIT since the NSS AVNCS log-on */
  public readonly authenticated = Subject.create(false);

  /** The message window shown over the logbook of this OIT, null when none */
  public readonly dialog = Subject.create<LogbookDialog | null>(null);

  /** The flight shown on the FLIGHT DATA page (and printed), null for the current flight */
  public readonly shownFlightIndex = Subject.create<number | null>(null);

  private activeEcamAlertIds: readonly string[] = [];

  private storedText = '';

  private syncEndsAt: number | null = null;

  private readonly sendings: { refs: string[]; endsAt: number }[] = [];

  private cancelStorageSubscription: (() => void) | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly sci: SecureCommunicationInterface,
    private readonly flightLog: LogbookFlightLogSource,
  ) {}

  public init(): void {
    const stored = parseTechLogbook(NXDataStore.getLegacy(TECH_LOGBOOK_STORAGE_KEY, ''));
    if (stored) {
      this.storedText = JSON.stringify(stored);
      this.state.set(stored);
    }

    this.subscriptions.push(
      this.sub.on('fws_abn_sensed_procedures').handle((procedures) => this.onEcamAlerts(procedures.map((p) => p.id))),
    );

    // The other OIT changed the logbook
    this.cancelStorageSubscription = NXDataStore.subscribeLegacy(TECH_LOGBOOK_STORAGE_KEY, (_key, value) => {
      if (value === undefined || value === this.storedText) {
        return;
      }
      const state = parseTechLogbook(value);
      if (state) {
        this.storedText = value;
        this.state.set(state);
      }
    });
  }

  /**
   * Applies a change made on this OIT and stores it.
   * @param change the operation on the logbook
   */
  public change(change: (state: TechLogbookState) => TechLogbookState): void {
    const next = change(this.state.get());
    if (next === this.state.get()) {
      return;
    }
    this.state.set(next);
    this.storedText = JSON.stringify(next);
    NXDataStore.setLegacy(TECH_LOGBOOK_STORAGE_KEY, this.storedText);
  }

  /**
   * The aircraft registration
   * @returns the registration, empty when the sim gives none
   */
  public registration(): string {
    const id = SimVar.GetSimVarValue('ATC ID', 'string');
    return typeof id === 'string' ? id.trim().toUpperCase() : '';
  }

  /**
   * The FMS flight number and city pair and the date
   * @returns the avionics values
   */
  public avionicsInfo(): LogbookAvionicsInfo {
    return {
      flightNumber: this.sci.fltNumber.get(),
      from: this.sci.fltOrigin.get(),
      to: this.sci.fltDestination.get(),
      now: this.sci.zuluTime.get(),
    };
  }

  /**
   * The flight log values of the flight
   * @returns the OUT/OFF/ON/IN times and fuel
   */
  public blockData(): LogbookBlockData {
    return {
      outTime: this.flightLog.outBlockTime.get(),
      offTime: this.flightLog.offBlockTime.get(),
      onTime: this.flightLog.onBlockTime.get(),
      inTime: this.flightLog.inBlockTime.get(),
      outFob: this.flightLog.outBlockFob.get(),
      inFob: this.flightLog.inBlockFob.get(),
      flightTime: this.flightLog.flightTime.get(),
    };
  }

  /**
   * The logbook reaches the ground through the avionics: NSS DATA TO AVNCS OFF or both SCIs lost cut it
   * @returns whether the logbook reaches the ground station
   */
  private groundLinkAvailable(): boolean {
    return this.sci.canSendToAvionics.get();
  }

  /** UPDATE: takes the control on board (the ground releases the aircraft) */
  public startUpdate(): void {
    this.startSync('update');
  }

  /** GIVE BACK TO GROUND */
  public startGiveBack(): void {
    this.startSync('give-back');
  }

  /** SIGN of the acceptance report, after the electronic signature */
  public signAcceptance(): void {
    const avionics = this.avionicsInfo();
    this.change((state) => signAcceptance(state, avionics));
    if (this.state.get().flight.acceptance === 'syncing') {
      this.startSync('acceptance');
    }
  }

  /** SIGN of the flight closure report, after the electronic signature: the aircraft status goes to the ground */
  public closeFlight(): void {
    const index = this.state.get().flight.index;
    const avionics = this.avionicsInfo();
    const block = this.blockData();
    this.change((state) => closeFlight(state, avionics, block));
    if (this.state.get().flight.index !== index) {
      this.ecamAlerts.set([]);
      this.startSync('closure');
    }
  }

  /**
   * Records a defect from an assistant, with the current time and the aircraft registration.
   * @param entry the defect
   * @param target OPEN ITEMS or TEMPORARY ITEMS
   */
  public recordDefect(entry: LogbookDefectEntry, target: 'open' | 'temporary'): void {
    const now = this.sci.zuluTime.get();
    const registration = this.registration();
    this.change((state) => recordDefect(state, entry, target, now, registration));
  }

  /**
   * SEND of open items.
   * @param refs the items
   */
  public send(refs: readonly string[]): void {
    let sent: string[] = [];
    this.change((state) => {
      const result = startSending(state, refs);
      sent = result.sent;
      return result.state;
    });
    if (sent.length > 0) {
      this.sendings.push({ refs: sent, endsAt: this.sci.zuluTime.get() + SEND_DURATION_MS });
    }
  }

  /**
   * Prints a logbook page on the NSS AVNCS printer of the pedestal (the AOC printer route).
   * @param printout the page text and its title
   */
  public print(printout: AocPrintout): void {
    this.bus.getPublisher<A380AocPrintEvents>().pub('aocPrintMessage', printout, true, false);
  }

  private startSync(operation: LogbookSyncOperation): void {
    this.syncResult.set(null);
    this.syncInProgress.set(operation);
    this.syncEndsAt = this.sci.zuluTime.get() + SYNC_DURATION_MS;
  }

  /**
   * Runs the synchronisations in progress.
   * @param now ms since the epoch (UTC)
   */
  public update(now: number): void {
    const operation = this.syncInProgress.get();
    if (operation !== null && this.syncEndsAt !== null && now >= this.syncEndsAt) {
      this.syncEndsAt = null;
      this.syncInProgress.set(null);
      this.syncResult.set(this.completeSync(operation, now));
    }

    for (let i = this.sendings.length - 1; i >= 0; i--) {
      const sending = this.sendings[i];
      if (now >= sending.endsAt) {
        this.sendings.splice(i, 1);
        const acknowledged = this.groundLinkAvailable();
        this.change((state) => completeSending(state, sending.refs, acknowledged));
      }
    }
  }

  private completeSync(operation: LogbookSyncOperation, now: number): LogbookSyncResult {
    const link = this.groundLinkAvailable();
    switch (operation) {
      case 'update':
        if (link) {
          this.change((state) => completeGroundUpdate(state, now, this.registration()));
        }
        return link ? 'update-done' : 'update-failed';
      case 'give-back':
        if (link) {
          this.change((state) => giveBackToGround(state, now));
        }
        return link ? 'give-back-done' : 'give-back-failed';
      case 'acceptance':
        this.change((state) => completeAcceptance(state, link, now));
        return link ? 'acceptance-acknowledged' : 'acceptance-not-acknowledged';
      case 'closure':
        return link ? 'closure-sent' : 'closure-not-sent';
    }
  }

  private onEcamAlerts(ids: readonly string[]): void {
    const appeared = appearedEcamAlerts(this.activeEcamAlertIds, ids);
    this.activeEcamAlertIds = ids;
    if (appeared.length === 0) {
      return;
    }
    const time = this.sci.zuluTime.get();
    const occurrences = appeared.map((id) => ({
      id,
      title: ecamAlertTitle(EcamAbnormalProcedures[id]?.title ?? id),
      time,
    }));
    this.ecamAlerts.set([...occurrences.reverse(), ...this.ecamAlerts.get()]);
  }

  public destroy(): void {
    this.subscriptions.forEach((s) => s.destroy());
    this.subscriptions.length = 0;
    this.cancelStorageSubscription?.();
    this.cancelStorageSubscription = null;
  }
}
