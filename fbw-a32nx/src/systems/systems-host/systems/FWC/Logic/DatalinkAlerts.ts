// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { DatalinkStatusCode } from '@datalink/common';
import type { RouterFmsMessages } from '@datalink/router';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, awarenessItem } from './FwcAlertItem';

/*
 * The datalink alerts and memo of the A320 FWC:
 * - DATALINK ATSU FAULT: the ATSU initialization failed (with the ATSU INIT FAULT line); crew awareness; STATUS INOP
 *   SYS ATSU, DATA COMPANY.
 * - DATALINK COMPANY FAULT: the AOC datalink communications failed; crew awareness; STATUS INOP SYS DATA COMPANY.
 * - COMPANY DATALINK STBY memo: green, while the AOC air-ground communication is temporarily unavailable, but not lost.
 *
 * The flyPad failures are those of systems-host AtsuFailureStates: "ATSU" (46000) and "ATSU AOC function (company
 * datalink)" (46001). The ATSU runs on AC BUS 1 (atsu.ts).
 *
 * Design choices:
 * - A failed ATSU cannot initialize: DATALINK ATSU FAULT with ATSU INIT FAULT while the ATSU is failed and supplied.
 *   Its STATUS already lists DATA COMPANY, so DATALINK COMPANY FAULT is only shown for a failed AOC function of a
 *   working ATSU.
 * - "Temporarily unavailable, but not lost" is a working ATSU and AOC function without any air-ground medium: the
 *   router reports no VHF, SATCOM or HF datalink available (the A32NX router: VHF 3 in voice mode or not supplied).
 * - The memo has the flight phase inhibition of the other datalink memos of the PseudoFWC (COMPANY MSG, VHF3 VOICE):
 *   3, 4, 5, 7, 8 (none is documented for this memo).
 * - The alerts are level 1 cautions: crew monitoring, generally without procedure, no aural, no SD page call.
 */

/** The flight phase inhibitions */
export const DATALINK_PHASE_INHIBITION = {
  /** DATALINK ATSU FAULT */
  atsuFault: [3, 4, 5, 7, 8],
  /** DATALINK COMPANY FAULT */
  companyFault: [3, 4, 5, 7, 8],
  /** COMPANY DATALINK STBY memo, as COMPANY MSG and VHF3 VOICE (design choice, see above) */
  companyDatalinkStbyMemo: [3, 4, 5, 7, 8],
};

/** The alert keys, the first digits of their EwdMessages codes */
export const DATALINK_ATSU_FAULT_KEY = '4600010';
export const DATALINK_COMPANY_FAULT_KEY = '4600020';

/** The memo codes (key 0000553), two lines: COMPANY / DATALINK STBY, the memo column is too narrow for one line */
export const COMPANY_DATALINK_STBY_MEMO_CODES = ['000055301', '000055302'];

/** STATUS INOP SYS codes (StatusMessages) */
const INOP_SYS_ATSU = '460300001';
const INOP_SYS_DATA_COMPANY = '460300002';

/** The data of the alerts */
export interface DatalinkAlertInputs {
  /** AC BUS 1, the ATSU supply */
  atsuSupplied: boolean;
  /** The flyPad failure of the ATSU */
  atsuFailed: boolean;
  /** The flyPad failure of the AOC function */
  aocFailed: boolean;
  /** An air-ground medium is available (router datalink status), null before the router reported one */
  airGroundLinkAvailable: boolean | null;
}

/** DATALINK ATSU FAULT: the supplied ATSU fails its initialization */
export function datalinkAtsuFaultAlert(inputs: DatalinkAlertInputs): boolean {
  return inputs.atsuSupplied && inputs.atsuFailed;
}

/** DATALINK COMPANY FAULT: the AOC function of a working ATSU is failed */
export function datalinkCompanyFaultAlert(inputs: DatalinkAlertInputs): boolean {
  return inputs.atsuSupplied && !inputs.atsuFailed && inputs.aocFailed;
}

/** COMPANY DATALINK STBY: the working AOC function has no air-ground medium */
export function companyDatalinkStbyMemo(inputs: DatalinkAlertInputs): boolean {
  return inputs.atsuSupplied && !inputs.atsuFailed && !inputs.aocFailed && inputs.airGroundLinkAvailable === false;
}

/** The router datalink status has at least one available air-ground medium */
export function airGroundLinkAvailable(status: RouterFmsMessages['routerDatalinkStatus']): boolean {
  return (
    status.vhf === DatalinkStatusCode.DlkAvail ||
    status.satellite === DatalinkStatusCode.DlkAvail ||
    status.hf === DatalinkStatusCode.DlkAvail
  );
}

/** The STATUS lines */
export const datalinkStatus = {
  /** DATALINK ATSU FAULT: INOP SYS ATSU, DATA COMPANY */
  atsuFault: (): StatusLines => ({ left: [], inopSys: [INOP_SYS_ATSU, INOP_SYS_DATA_COMPANY] }),
  /** DATALINK COMPANY FAULT: INOP SYS DATA COMPANY */
  companyFault: (): StatusLines => ({ left: [], inopSys: [INOP_SYS_DATA_COMPANY] }),
};

/** The part of the failures consumer the alerts use */
export type DatalinkFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

/** The datalink alerts and memo: reads the failures and the router status, gives the items the PseudoFWC adds */
export class DatalinkAlerts {
  private airGroundLinkAvailable: boolean | null = null;

  private readonly atsuFault = Subject.create(false);

  private readonly companyFault = Subject.create(false);

  /** COMPANY DATALINK STBY, for the PseudoFWC memos (key 0000553) */
  public readonly companyDatalinkStby = Subject.create(false);

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: DatalinkFailuresSource = new FailuresConsumer()) {}

  /**
   * Registers the failures and listens to the router datalink status, called once by the PseudoFWC init.
   * @param bus the systems-host bus the ATSU router publishes on
   */
  init(bus?: EventBus): void {
    this.failuresConsumer.register(A320Failure.Atsu);
    this.failuresConsumer.register(A320Failure.AtsuAoc);
    bus
      ?.getSubscriber<RouterFmsMessages>()
      .on('routerDatalinkStatus')
      .handle((status) => this.onRouterDatalinkStatus(status));
  }

  /** The datalink status the ATSU router publishes (1 Hz) */
  onRouterDatalinkStatus(status: RouterFmsMessages['routerDatalinkStatus']): void {
    this.airGroundLinkAvailable = airGroundLinkAvailable(status);
  }

  /**
   * @param atsuSupplied AC BUS 1 is powered
   */
  update(atsuSupplied: boolean): void {
    this.failuresConsumer.update();
    const inputs: DatalinkAlertInputs = {
      atsuSupplied,
      atsuFailed: this.failuresConsumer.isActive(A320Failure.Atsu),
      aocFailed: this.failuresConsumer.isActive(A320Failure.AtsuAoc),
      airGroundLinkAvailable: this.airGroundLinkAvailable,
    };
    this.atsuFault.set(datalinkAtsuFaultAlert(inputs));
    this.companyFault.set(datalinkCompanyFaultAlert(inputs));
    this.companyDatalinkStby.set(companyDatalinkStbyMemo(inputs));
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [DATALINK_ATSU_FAULT_KEY]: awarenessItem(
      DATALINK_ATSU_FAULT_KEY,
      2,
      this.atsuFault,
      DATALINK_PHASE_INHIBITION.atsuFault,
      () => [0, 1],
      datalinkStatus.atsuFault,
    ),
    [DATALINK_COMPANY_FAULT_KEY]: awarenessItem(
      DATALINK_COMPANY_FAULT_KEY,
      1,
      this.companyFault,
      DATALINK_PHASE_INHIBITION.companyFault,
      () => [0],
      datalinkStatus.companyFault,
    ),
  };
}
