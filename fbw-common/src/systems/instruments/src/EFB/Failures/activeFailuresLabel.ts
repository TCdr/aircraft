// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The text of the active failures chip in the Failures page header: "1 active failure", "3 active failures".
 * @param count the number of active failures
 * @param translate the flyPad translation function (t), passed in so the rule can be tested on its own
 */
export const activeFailuresLabel = (count: number, translate: (key: string) => string): string =>
  `${count} ${translate(count === 1 ? 'Failures.ActiveFailure' : 'Failures.ActiveFailures')}`;

/**
 * The text of the failure count chip of an ATA chapter: "1 failure", "12 failures".
 * @param count the number of failures of the chapter
 * @param translate the flyPad translation function (t)
 */
export const failuresCountLabel = (count: number, translate: (key: string) => string): string =>
  `${count} ${translate(count === 1 ? 'Failures.Failure' : 'Failures.Failures')}`;
