// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';
const ADVISORY = 'an amber advisory with no master caution and no chime';

/** CAB COM CIDS alerts: flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** COM DEGRADED: flight phases 3 to 11 */
const NOT_SHOWN_PHASES_3_TO_11 =
  'it shows only on the ground before take-off power (engines off, or the first engine started) and after the ' +
  'engines are shut down';

const ALERT_CIDS_123_FAULT = '230800001';
const ALERT_CIDS_CABIN_COM_FAULT = '230800002';
const ALERT_COM_DEGRADED = '230800003';

const CIDS_NOT_SIMULATED =
  'The cabin crew stations, the PA loudspeakers and the interphone handsets are not modelled: only the alerts follow.';

const HIDDEN_BY_CIDS_123 = 'It is not shown while CIDS 1+2+3 FAULT is active, which replaces it.';

const CidsDirectorFamily: FailureDetailFamily = {
  ids: [A380Failure.CidsDirector1, A380Failure.CidsDirector2, A380Failure.CidsDirector3],
  detail: (n): FailureDetail => ({
    whatItIs:
      'The cabin intercommunication data system has three redundant directors. It runs the cabin interphone, the ' +
      'service interphone and the passenger address, and the audio management units pass the cockpit audio to it.',
    impact: [
      `CIDS director ${n} is lost; the other two directors carry the cabin communication.`,
      'Only with all three directors lost is the whole cabin communication lost.',
    ],
    alertIds: [ALERT_CIDS_123_FAULT],
    effects: [
      {
        where: 'E/WD',
        text: 'Alone, or with one other director, nothing shows: the warning system reads only the loss of all three.',
      },
      {
        where: 'E/WD',
        text:
          `CAB COM CIDS 1+2+3 FAULT (${CAUTION}) when all three directors have failed; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. ` +
          'It replaces the CIDS CABIN COM FAULT and COM DEGRADED alerts.',
      },
      { where: 'SD STATUS', text: 'Lists CIDS 1+2+3 as inoperative while CIDS 1+2+3 FAULT is shown.' },
    ],
    notSimulated: [CIDS_NOT_SIMULATED],
    logbook: { required: false, reason: 'no indication on its own: the other directors take over' },
    clearing: MAINTENANCE_ONLY,
  }),
};

interface CabinFunction {
  readonly name: string;
  readonly line: string;
  readonly status: string;
  readonly whatItIs: string;
}

const DECK_PA_ALERT_TEXT = (fn: CabinFunction, triggers: boolean) =>
  triggers
    ? `CIDS CABIN COM FAULT (${CAUTION}) with the line ${fn.line}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. ${HIDDEN_BY_CIDS_123}`
    : `Alone, nothing shows: the line ${fn.line} is added to CIDS CABIN COM FAULT only when the upper deck PA, the main deck PA or the cabin interphone has failed too.`;

function cabinFunctionDetail(fn: CabinFunction, triggers: boolean): FailureDetail {
  return {
    whatItIs: fn.whatItIs,
    impact: [
      `${fn.name} is lost for the cabin crew and the flight crew.`,
      triggers
        ? 'The other cabin communication functions keep working.'
        : 'The flight warning system does not treat this loss as an alert on its own.',
    ],
    alertIds: [ALERT_CIDS_CABIN_COM_FAULT],
    effects: [
      { where: 'E/WD', text: DECK_PA_ALERT_TEXT(fn, triggers) },
      {
        where: 'SD STATUS',
        text: triggers
          ? `Lists ${fn.status} as inoperative while CIDS CABIN COM FAULT is shown.`
          : `Lists ${fn.status} as inoperative only while CIDS CABIN COM FAULT is shown for another failed function.`,
      },
    ],
    notSimulated: [CIDS_NOT_SIMULATED],
    logbook: triggers
      ? { required: true, reason: 'CIDS CABIN COM FAULT alert' }
      : { required: false, reason: 'no indication on its own' },
    clearing: MAINTENANCE_ONLY,
  };
}

const PA_DESCRIPTION =
  'The passenger address lets the flight and cabin crew speak to the passengers through the cabin loudspeakers. It ' +
  'is run by the cabin intercommunication data system.';

export const Ata23CabinEntries: Record<number, FailureDetail> = {
  [A380Failure.UpperDeckPa]: cabinFunctionDetail(
    {
      name: 'The upper deck passenger address',
      line: 'UPPER DECK PA FAULT',
      status: 'UPPER DECK PA',
      whatItIs: `${PA_DESCRIPTION} This is the part that serves the upper deck cabin.`,
    },
    true,
  ),
  [A380Failure.MainDeckPa]: cabinFunctionDetail(
    {
      name: 'The main deck passenger address',
      line: 'MAIN DECK PA FAULT',
      status: 'MAIN DECK PA',
      whatItIs: `${PA_DESCRIPTION} This is the part that serves the main deck cabin.`,
    },
    true,
  ),
  [A380Failure.LowerDeckPa]: cabinFunctionDetail(
    {
      name: 'The lower deck passenger address',
      line: 'LOWER DECK PA FAULT',
      status: 'LOWER DECK PA',
      whatItIs: `${PA_DESCRIPTION} This is the part that serves the lower deck areas.`,
    },
    false,
  ),
  [A380Failure.CabinInterphone]: cabinFunctionDetail(
    {
      name: 'The cabin interphone',
      line: 'CABIN INTERPHONE FAULT',
      status: 'CABIN INTERPHONE',
      whatItIs:
        'The cabin interphone lets the flight crew and the cabin crew call each other, and the cabin crew call each ' +
        'other between stations. It is run by the cabin intercommunication data system.',
    },
    true,
  ),
  [A380Failure.PaDegraded]: {
    whatItIs: PA_DESCRIPTION,
    impact: [
      'The passenger address no longer works in some areas of the cabin.',
      'The rest of the cabin communication keeps working.',
    ],
    alertIds: [ALERT_COM_DEGRADED],
    effects: [
      {
        where: 'E/WD',
        text:
          `CAB COM COM DEGRADED with the line PA DEGRADED (${ADVISORY}); ${NOT_SHOWN_PHASES_3_TO_11}. ` +
          HIDDEN_BY_CIDS_123,
      },
      { where: 'SD STATUS', text: 'Nothing is added: this alert has no STATUS line.' },
    ],
    notSimulated: [CIDS_NOT_SIMULATED],
    logbook: { required: true, reason: 'COM DEGRADED advisory' },
    clearing: MAINTENANCE_ONLY,
  },
  [A380Failure.CabinInterphoneDegraded]: {
    whatItIs:
      'The cabin interphone lets the flight crew and the cabin crew call each other, and the cabin crew call each ' +
      'other between stations. It is run by the cabin intercommunication data system.',
    impact: [
      'The cabin interphone no longer works at some stations.',
      'The rest of the cabin communication keeps working.',
    ],
    alertIds: [ALERT_COM_DEGRADED],
    effects: [
      {
        where: 'E/WD',
        text:
          `CAB COM COM DEGRADED with the line CABIN INTERPHONE DEGRADED (${ADVISORY}); ${NOT_SHOWN_PHASES_3_TO_11}. ` +
          HIDDEN_BY_CIDS_123,
      },
      { where: 'SD STATUS', text: 'Nothing is added: this alert has no STATUS line.' },
    ],
    notSimulated: [CIDS_NOT_SIMULATED],
    logbook: { required: true, reason: 'COM DEGRADED advisory' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata23CabinFamilies: FailureDetailFamily[] = [CidsDirectorFamily];
