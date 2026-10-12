// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subscribable } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';

export { ConfirmTimer } from './BleedAlerts';

/**
 * An alert of the E/WD left side in the form of the PseudoFWC ewdMessageFailures items, built by the Logic modules that
 * own their alerts (the PseudoFWC spreads their items into its list, the way it does with Logic/BleedAlerts).
 */
export interface FwcAlertItem {
  flightPhaseInhib: number[];
  simVarIsActive: Subscribable<boolean>;
  whichCodeToReturn: () => (number | null)[];
  codesToReturn: string[];
  memoInhibit: () => boolean;
  /** 2: amber caution with the MASTER CAUTION light and the single chime */
  failure: number;
  sysPage: EcamSysPage;
  side: 'LEFT';
  inopSys: () => string[];
  statusInfo: () => string[];
}

/** The E/WD codes of an alert: its 7-digit key followed by the line number, 01 for the title */
export function alertCodes(key: string, lineCount: number): string[] {
  return Array.from({ length: lineCount }, (_, i) => `${key}${(i + 1).toString().padStart(2, '0')}`);
}

/** No STATUS line */
export const NO_STATUS = (): StatusLines => ({ left: [], inopSys: [] });

/**
 * An amber caution (level 2) of the E/WD left side.
 * @param key the 7-digit alert key, the first digits of its EwdMessages codes
 * @param lineCount the number of EwdMessages codes of the alert, title included
 * @param active whether the alert is triggered
 * @param flightPhaseInhib the FWC flight phases (1 to 10) in which the alert is inhibited
 * @param lines the indexes of the lines shown now, title included
 * @param sysPage the SD page the alert calls
 * @param status the STATUS page lines of the alert
 */
export function cautionItem(
  key: string,
  lineCount: number,
  active: Subscribable<boolean>,
  flightPhaseInhib: number[],
  lines: () => (number | null)[],
  sysPage: EcamSysPage,
  status: () => StatusLines = NO_STATUS,
): FwcAlertItem {
  return {
    flightPhaseInhib,
    simVarIsActive: active,
    whichCodeToReturn: lines,
    codesToReturn: alertCodes(key, lineCount),
    memoInhibit: () => false,
    failure: 2,
    sysPage,
    side: 'LEFT',
    inopSys: () => status().inopSys,
    statusInfo: () => status().left,
  };
}
