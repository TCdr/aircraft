// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Helpers of the flight controls, brakes and hydraulics specs that drive the whole PseudoFWC and read its alerts
// (no shipped code imports this file)

import { EventBus, Subscribable } from '@microsoft/msfs-sdk';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { formatEwdMessages } from '../../../shared/src/EwdMessages';
import { isAlertTriggered } from './FwcAlertProbe';
import { withoutColourCodes } from './Logic/FwcAlertSpecHelpers';
import { PseudoFWC } from './PseudoFWC';
import { createFwc, installFwcSimVarMocks, runFwc, setHealthyCruise } from './PseudoFwcTestBed';

/** The part of an alert item of the PseudoFWC lists that the specs read */
export interface ProbedAlertItem {
  flightPhaseInhib: number[];
  simVarIsActive: Subscribable<boolean>;
  whichCodeToReturn: () => (number | null)[];
  codesToReturn: string[];
  failure: number;
  sysPage: number;
  inopSys?: () => string[];
  statusInfo?: () => string[];
}

/** A running FWC with the simvars it reads and the simvars it wrote */
export interface FwcRig {
  readonly fwc: PseudoFWC;
  readonly bus: EventBus;
  readonly simvars: Map<string, number>;
  readonly writes: Map<string, unknown>;
  /** Runs the FWC for some seconds at the FwsManager rate */
  run(seconds: number): void;
}

/** A healthy A32NX in cruise, the FWC having run 2 s */
export function startCruiseFwc(): FwcRig {
  const { simvars, writes } = installFwcSimVarMocks();
  const { fwc, bus } = createFwc();
  setHealthyCruise(bus, simvars);
  const rig: FwcRig = { fwc, bus, simvars, writes, run: (seconds) => runFwc(fwc, seconds) };
  rig.run(2);
  return rig;
}

/** An alert of the E/WD left side (failures) of the FWC */
export function probedFailure(fwc: PseudoFWC, code: string): ProbedAlertItem {
  const item = (fwc.ewdMessageFailures as Record<string, ProbedAlertItem | undefined>)[code];
  if (!item) {
    throw new Error(`no alert ${code} in the FWC`);
  }
  return item;
}

/** A memo of the E/WD right side of the FWC */
export function probedMemo(fwc: PseudoFWC, code: string): ProbedAlertItem {
  const item = (fwc.ewdMessageMemos as unknown as Record<string, ProbedAlertItem | undefined>)[code];
  if (!item) {
    throw new Error(`no memo ${code} in the FWC`);
  }
  return item;
}

/** The codes, among the given ones, of the alerts that are triggered now */
export function triggeredAmong(fwc: PseudoFWC, codes: string[]): string[] {
  return codes.filter((code) => isAlertTriggered(fwc, code));
}

/** The E/WD codes of the lines an alert shows now */
export function shownLineCodes(item: ProbedAlertItem): string[] {
  return item
    .whichCodeToReturn()
    .filter((line): line is number => line !== null)
    .map((line) => item.codesToReturn[line]);
}

/** The E/WD text of the lines an alert shows now, without the colour codes */
export function shownLineText(item: ProbedAlertItem): string[] {
  return formatEwdMessages(shownLineCodes(item)).map(withoutColourCodes);
}

/**
 * The raw simvar value of an ARINC 429 word in normal operation with the given bits (numbered from 1) set. The word
 * value goes through a float32, so keep the bits within 24 places of each other and below bit 31.
 */
export function discreteWordWithBits(...bits: number[]): number {
  const value = bits.reduce((word, bit) => word + 2 ** (bit - 1), 0);
  return Arinc429Word.getRawWord(value, Arinc429SignStatusMatrix.NormalOperation);
}
