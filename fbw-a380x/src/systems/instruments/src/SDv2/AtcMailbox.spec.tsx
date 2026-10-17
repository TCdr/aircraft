// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, FSComponent, HEvent, Subject } from '@microsoft/msfs-sdk';
import {
  AtsuMailboxMessages,
  AtsuMessageDirection,
  AtsuMessageType,
  CpdlcMessage,
  CpdlcMessagesUplink,
  MailboxStatusMessage,
} from '@datalink/common';
import { AtcMailbox } from './AtcMailbox';

/**
 * An uplink clearance of the ATC center
 * @param uid the unique message id
 * @returns the message
 */
function uplink(uid: number): CpdlcMessage {
  const message = new CpdlcMessage();
  message.UniqueMessageID = uid;
  message.Type = AtsuMessageType.CPDLC;
  message.Direction = AtsuMessageDirection.Uplink;
  message.Station = 'KZAK';
  const element = CpdlcMessagesUplink.UM20[1].deepCopy();
  element.Content[0].Value = 'FL350';
  message.Content.push(element);
  return message;
}

/** The private state of a mailbox the tests look at */
interface MailboxInternals {
  blocks: Subject<{ uid: number }[]>;
  visibleUid: Subject<number | null>;
  onButton(index: number): void;
}

/**
 * Two mailbox clients on one bus, as the SD DU's mailbox and the SD drawn on the F/O ND DU (CDS reconfiguration), and
 * what they publish to the ATC function
 * @param sdDuActive whether the SD DU's mailbox starts active
 * @param foNdActive whether the F/O ND DU's mailbox starts active
 * @returns the mailboxes, their active inputs, and what they publish
 */
function setup(sdDuActive: boolean, foNdActive: boolean) {
  const bus = new EventBus();
  const publisher = bus.getPublisher<AtsuMailboxMessages>();
  const sub = bus.getSubscriber<AtsuMailboxMessages>();
  const read: number[] = [];
  const visible: number[] = [];
  const printed: number[] = [];
  let resyncRequests = 0;
  sub.on('printMessage').handle((uid) => printed.push(uid));
  sub.on('readMessage').handle((uid) => read.push(uid));
  sub.on('visibleMessage').handle((uid) => visible.push(uid));
  sub.on('mailboxResyncRequest').handle(() => resyncRequests++);

  const mount = (active: Subject<boolean>) => {
    const ref = FSComponent.createRef<AtcMailbox>();
    const container = document.createElement('div');
    document.body.appendChild(container);
    FSComponent.render(<AtcMailbox ref={ref} bus={bus} active={active} />, container);
    return ref.instance as unknown as MailboxInternals;
  };
  const sdDuActive$ = Subject.create(sdDuActive);
  const foNdActive$ = Subject.create(foNdActive);
  const sdDu = mount(sdDuActive$);
  const foNd = mount(foNdActive$);
  /**
   * A new message of the ATC function for the mailbox
   * @param uid the unique message id
   * @returns nothing
   */
  const receive = (uid: number) => publisher.pub('cpdlcMessages', [uplink(uid)], true, false);
  return {
    publisher,
    sdDu,
    foNd,
    sdDuActive$,
    foNdActive$,
    receive,
    read,
    visible,
    printed,
    resyncRequests: () => resyncRequests,
  };
}

describe('ATC mailbox clients (A380 FCOM PRO-ABN-ECAM-10-31: "If the SD DU is turned OFF, use the F/O DU RECONF P/B for ATC mailbox")', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('lets only the active mailbox mark a new message as displayed and read', () => {
    const { receive, read, visible, sdDu, foNd } = setup(true, false);
    receive(1);
    expect(read).toEqual([1]);
    expect(visible).toEqual([1]);
    // both show it
    expect(sdDu.visibleUid.get()).toBe(1);
    expect(foNd.visibleUid.get()).toBe(1);
  });

  it('marks nothing as read while no mailbox is active (the SD shown on no DU)', () => {
    const { receive, read, visible } = setup(false, false);
    receive(1);
    expect(read).toEqual([]);
    expect(visible).toEqual([]);
  });

  it('makes an inactive mailbox display the message the active one displays', () => {
    const { receive, publisher, foNd } = setup(true, false);
    receive(1);
    receive(2);
    publisher.pub('visibleMessage', 2, true, false);
    expect(foNd.visibleUid.get()).toBe(2);
  });

  it('ignores the buttons of an inactive mailbox', () => {
    const { receive, printed, sdDu, foNd } = setup(false, true);
    receive(1);
    // PRINT (fifth button of a clearance) on the SD DU's mailbox while its DU is off: nothing happens
    sdDu.onButton(4);
    expect(printed).toEqual([]);
    // on the F/O ND DU's mailbox, the active one: the message is printed
    foNd.onButton(4);
    expect(printed).toEqual([1]);
  });

  it('asks for the mailbox file when it starts and when it becomes active', () => {
    const { resyncRequests, foNdActive$, sdDuActive$ } = setup(true, false);
    // one request per mailbox at its start
    expect(resyncRequests()).toBe(2);
    sdDuActive$.set(false);
    foNdActive$.set(true);
    expect(resyncRequests()).toBe(3);
  });

  it('rebuilds the queue of a mailbox that started late from the mailbox file, on the displayed message', () => {
    const { publisher, foNd, sdDu, read } = setup(true, false);
    publisher.pub(
      'mailboxSnapshot',
      {
        blocks: [
          { messages: [uplink(4)], status: MailboxStatusMessage.NoMessage },
          { messages: [uplink(5)], status: MailboxStatusMessage.Sending },
        ],
        visibleUid: 5,
        activeAtc: 'KZAK',
      },
      true,
      false,
    );
    expect(foNd.blocks.get().map((b) => b.uid)).toEqual([4, 5]);
    expect(foNd.visibleUid.get()).toBe(5);
    expect(sdDu.visibleUid.get()).toBe(5);
    // the displayed message is the one the ATC function knows: nothing new to mark as read
    expect(read).toEqual([]);
  });

  it('marks the message it displays as read when the mailbox file had none displayed (active mailbox only)', () => {
    const { publisher, read } = setup(false, true);
    publisher.pub(
      'mailboxSnapshot',
      { blocks: [{ messages: [uplink(7)], status: MailboxStatusMessage.NoMessage }], visibleUid: -1, activeAtc: '' },
      true,
      false,
    );
    expect(read).toEqual([7]);
  });
});

describe('KCCU MAILBOX key (A380 FCOM DSC-46-10-20-80, l.101303-101306: "the cursor moves to the mailbox section of the SD")', () => {
  /** The KCCU keyboard ON/OFF switches the mailbox reads */
  let keyboards: Record<string, number>;

  beforeEach(() => {
    keyboards = {};
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => keyboards[name] ?? 0);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * One mailbox client and a way to press a KCCU key
   * @param active whether the mailbox is the active mailbox client
   * @returns the KCCU key press and the mailbox KCCU cursor element
   */
  function mountMailbox(active: boolean) {
    const bus = new EventBus();
    const container = document.createElement('div');
    document.body.appendChild(container);
    FSComponent.render(<AtcMailbox bus={bus} active={Subject.create(active)} />, container);
    const press = (event: string) => bus.getPublisher<HEvent>().pub('hEvent', event, false, false);
    const cursor = () => container.querySelector('.mfd-mouse-cursor') as HTMLElement;
    return { press, cursor };
  }

  it('shows the KCCU cursor on the mailbox when the F/O presses MAILBOX', () => {
    keyboards['L:A32NX_KCCU_R_KBD_ON_OFF'] = 1;
    const { press, cursor } = mountMailbox(true);
    expect(cursor().style.display).not.toBe('block');
    press('A32NX_KCCU_R_MAILBOX');
    expect(cursor().style.display).toBe('block');
    // the F/O cursor is the turned one (MouseCursor side FO)
    expect(cursor().innerHTML).toContain('rotate(90');
  });

  it('shows the captain cursor when the captain presses MAILBOX', () => {
    keyboards['L:A32NX_KCCU_L_KBD_ON_OFF'] = 1;
    const { press, cursor } = mountMailbox(true);
    press('A32NX_KCCU_L_MAILBOX');
    expect(cursor().style.display).toBe('block');
    expect(cursor().innerHTML).toContain('rotate(0');
  });

  it('ignores the key while the KCCU keyboard is OFF (DSC-31-30-20)', () => {
    const { press, cursor } = mountMailbox(true);
    press('A32NX_KCCU_L_MAILBOX');
    expect(cursor().style.display).not.toBe('block');
  });

  it('ignores the key on an inactive mailbox and other KCCU keys', () => {
    keyboards['L:A32NX_KCCU_L_KBD_ON_OFF'] = 1;
    const inactive = mountMailbox(false);
    inactive.press('A32NX_KCCU_L_MAILBOX');
    expect(inactive.cursor().style.display).not.toBe('block');
    const active = mountMailbox(true);
    active.press('A32NX_KCCU_L_ND');
    expect(active.cursor().style.display).not.toBe('block');
  });
});

/*
 * A380 FCOM PRO-SUP-46 AIR TRAFFIC CONTROL (ATC) RESET (a380_fcom.txt l.184521-184523): "It is possible to perform an
 * ATC reset, when: MAILBOX NOT AVAIL is displayed on the lower part of the SD".
 */
describe('MAILBOX NOT AVAIL', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('replaces the mailbox while the ATC function is not available, and goes away with it', () => {
    const bus = new EventBus();
    const container = document.createElement('div');
    document.body.appendChild(container);
    FSComponent.render(<AtcMailbox bus={bus} active={Subject.create(true)} />, container);
    const notAvail = container.querySelector('.atc-mailbox-not-avail') as HTMLElement;
    const recall = container.querySelector('.atc-mailbox-recall') as HTMLElement;
    const shown = (element: HTMLElement) => {
      for (let e: HTMLElement | null = element; e && e !== container; e = e.parentElement) {
        if (e.style.display === 'none') {
          return false;
        }
      }
      return true;
    };
    expect(shown(notAvail)).toBe(false);
    expect(shown(recall)).toBe(true);

    const publisher = bus.getPublisher<{ atcFunctionAvailable: boolean }>();
    publisher.pub('atcFunctionAvailable', false);
    expect(notAvail.textContent).toBe('MAILBOX NOT AVAIL');
    expect(shown(notAvail)).toBe(true);
    expect(shown(recall)).toBe(false);

    publisher.pub('atcFunctionAvailable', true);
    expect(shown(notAvail)).toBe(false);
    expect(shown(recall)).toBe(true);
  });
});
