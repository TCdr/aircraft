// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

/** DOUBLE IOM FAULT is inhibited in flight phases 2 to 11 (shown in phases 1 and 12) */
const NOT_SHOWN_PHASES_2_TO_11 =
  'a new alert shows only on the ground with the engines off: before the first engine is started, and after the ' +
  'engines are shut down';

/** The MULTIPLE IOM FAULT alerts are inhibited in flight phases 3 to 7, 9 and 10 (shown in phases 1, 2, 8, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

const DOUBLE_IOM_FAULT_ALERT = '420800002';
const MULTIPLE_IOM_FAULT_NETWORK_DEGRADED_ALERT = '420800004';
const MULTIPLE_IOM_FAULT_REDUNDANCY_DEGRADED_ALERT = '420800005';

/**
 * The warning system pairs the IOMs A1+A2, A3+A4, A5+A6 and A7+A8 (AvionicsNetworkAlerts.ts IOM_PAIRS).
 * @param number the IOM number, 1 to 8
 * @returns the other IOM of its pair
 */
const partnerOf = (number: number): number => (number % 2 === 1 ? number + 1 : number - 1);

const iomDetail = (number: number): FailureDetail => {
  const partner = partnerOf(number);
  return {
    whatItIs:
      'The input/output modules, IOMs, are the interface between conventional avionics signals, for example ARINC 429 ' +
      'data and discretes, and the two avionics networks. There are eight, grouped in four pairs: each avionics ' +
      'system that uses IOMs is connected to both IOMs of a pair, and each pair interfaces with both networks.',
    impact: [
      `IOM A${number} is lost. Its partner IOM A${partner} would keep every connected system on the avionics networks, so nothing changes in flight.`,
      'No system of the sim sends its data through the IOMs and nothing reads their availability: only the alert logic counts the failed IOMs.',
      `With IOM A${partner} lost too, the alert logic reports the loss of a whole pair.`,
    ],
    alertIds: [
      DOUBLE_IOM_FAULT_ALERT,
      MULTIPLE_IOM_FAULT_NETWORK_DEGRADED_ALERT,
      MULTIPLE_IOM_FAULT_REDUNDANCY_DEGRADED_ALERT,
    ],
    effects: [
      {
        where: 'E/WD',
        text: 'This IOM alone raises no alert. Only the number of failed IOMs and their pairs decides what shows.',
      },
      {
        where: 'E/WD',
        text:
          `AVIONICS NETWORK DOUBLE IOM FAULT, ${ADVISORY}, when exactly two IOMs are failed and they are not the ` +
          `two of one pair (this IOM and any IOM except A${partner}). ${NOT_SHOWN_PHASES_2_TO_11}; ` +
          `${ALREADY_SHOWN_STAYS}. It has no procedure line.`,
      },
      {
        where: 'E/WD',
        text:
          `AVIONICS NETWORK MULTIPLE IOM FAULT with the line (REDUNDANCY DEGRADED), ${ADVISORY}, when three IOMs or ` +
          `more are failed and no pair is lost. ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}.`,
      },
      {
        where: 'E/WD',
        text:
          `AVIONICS NETWORK MULTIPLE IOM FAULT with the line (NETWORK DEGRADED), ${CAUTION}, as soon as IOM ` +
          `A${partner} is failed too, or any other pair has both IOMs failed. It replaces the other two IOM alerts. ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. It has no other line, no STATUS line and calls up ` +
          'no page.',
      },
    ],
    notSimulated: [
      'A single IOM failure sends a message to maintenance on the aircraft; the sim has none.',
      'Losing both IOMs of a pair cuts the systems attached to that pair from both avionics networks, and the lines of MULTIPLE IOM FAULT depend on the IOMs lost. Neither is simulated: no system of the sim is attached to an IOM.',
    ],
    logbook: { required: false, reason: 'no indication to report for a single IOM' },
    clearing: `${MAINTENANCE_ONLY} The alerts go out at once.`,
  };
};

export const Ata42IomFamilies: FailureDetailFamily[] = [
  {
    ids: [
      A380Failure.IomA1,
      A380Failure.IomA2,
      A380Failure.IomA3,
      A380Failure.IomA4,
      A380Failure.IomA5,
      A380Failure.IomA6,
      A380Failure.IomA7,
      A380Failure.IomA8,
    ],
    detail: iomDetail,
  },
];
