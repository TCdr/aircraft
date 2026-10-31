// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Helpers of the specs that drive the whole PseudoFWC and look at one of its alerts (no shipped code imports this file)

import { expect } from 'vitest';
import { formatEwdMessages } from '../../../shared/src/EwdMessages';
import { withoutColourCodes } from './Logic/FwcAlertSpecHelpers';
import { PseudoFWC } from './PseudoFWC';
import { createFwc, normalWord, runFwc, setHealthyCruise } from './PseudoFwcTestBed';

/** One entry of the E/WD failure list of the PseudoFWC */
export type FwcFailureItem = PseudoFWC['ewdMessageFailures'][string];

/**
 * The real PseudoFWC in a healthy cruise, run long enough for the start-up confirm nodes to settle
 * @param adjustInputs sets the simvars of the case under test; it runs after the healthy values are set, which it overrides
 * @param settleSeconds how long the FWC runs before the test looks at it; shorter for specs that time a confirm node
 */
export function startCruiseFwc(simvars: Map<string, number>, adjustInputs: () => void = () => {}, settleSeconds = 3) {
  const { fwc, bus } = createFwc();
  setHealthyCruise(bus, simvars);
  adjustInputs();
  runFwc(fwc, settleSeconds);
  return { fwc, bus };
}

/** The E/WD failure of the given alert key; fails the test when the PseudoFWC has no such alert */
export function failureItem(fwc: PseudoFWC, key: string): FwcFailureItem {
  const item = fwc.ewdMessageFailures[key];
  expect(item, `alert ${key}`).toBeDefined();
  return item;
}

/** Whether the alert is triggered (before the flight phase inhibition) */
export function isAlertTriggered(fwc: PseudoFWC, key: string): boolean {
  return !!failureItem(fwc, key).simVarIsActive.get();
}

/** Whether a memo of the E/WD right side is raised now */
export function isMemoActive(fwc: PseudoFWC, key: string): boolean {
  return !!fwc.ewdMessageMemos[key].simVarIsActive.get();
}

/**
 * Tells an alert module that the flyPad failures are active, as the failures system does over the generic data
 * listener (the real consumer only gets them in the sim)
 * @param alertModule the module of the PseudoFWC that holds a FailuresConsumer (private member failuresConsumer)
 */
export function setActiveFailures(alertModule: unknown, failureIdentifiers: number[]): void {
  (alertModule as any).failuresConsumer.onActiveFailuresChanged(new Set(failureIdentifiers));
}

/** A module of the PseudoFWC by its member name (the members are private) */
export function fwcModule(fwc: PseudoFWC, member: string): unknown {
  return (fwc as any)[member];
}

/** The E/WD codes the alert shows now, title first */
export function shownCodes(fwc: PseudoFWC, key: string): string[] {
  const item = failureItem(fwc, key);
  // the type also allows a text (legacy items); the alerts under test return line indexes
  const lines = item.whichCodeToReturn() as (number | null)[];
  return lines.filter((line): line is number => line !== null).map((line) => item.codesToReturn[line]);
}

/** An E/WD or STATUS text without its colour and format escape sequences, trimmed */
export function plainText(text: string): string {
  return withoutColourCodes(text).trim();
}

/** The E/WD lines the alert shows now as text, without the colour codes */
export function shownText(fwc: PseudoFWC, key: string): string[] {
  return formatEwdMessages(shownCodes(fwc, key)).map(plainText);
}

/**
 * Puts the healthy cruise on the ground: both LGCIUs report the left gear compressed and both radio altimeters read
 * 0 ft (the ground logic keeps the state only while a majority of the four sources agree). Call it from the
 * adjustInputs of startCruiseFwc. The FWC flight phase stays the cruise phase the test bed sets.
 */
export function setOnGround(simvars: Map<string, number>): void {
  const gearCompressedDiscreteBit = 1 << 12;
  for (const lgciu of [1, 2]) {
    simvars.set(`L:A32NX_RA_${lgciu}_RADIO_ALTITUDE`, normalWord(0));
    simvars.set(`L:A32NX_LGCIU_${lgciu}_LEFT_GEAR_COMPRESSED`, 1);
    simvars.set(`L:A32NX_LGCIU_${lgciu}_DISCRETE_WORD_2`, normalWord(gearCompressedDiscreteBit));
  }
}
