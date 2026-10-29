// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** An amber alert of failure level 1 */
const AWARENESS = 'crew awareness only, with no master caution and no chime';

/** Inhibited in the flight phases 3, 4, 5, 7 and 8 */
const NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING =
  'not shown from take-off power until 1,500 ft, nor below 800 ft on approach and in the landing roll above 80 kt';

const SIDE_OF_DCDU = ['captain', 'first officer'] as const;

const DcduFamily: FailureDetailFamily = {
  ids: [A320Failure.Dcdu1, A320Failure.Dcdu2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The datalink control and display units (DCDU) show the datalink messages of the ATC (CPDLC) and of the ' +
      'company, and let the pilot answer, print or clear them. There is one for each pilot.',
    impact: [
      `The DCDU of the ${SIDE_OF_DCDU[number - 1]} is lost: its screen goes blank and its keys do nothing.`,
      'The other DCDU keeps working, and the datalink itself is not affected.',
      'The aircraft raises no alert for it.',
    ],
    alertIds: [],
    effects: [
      { where: 'DCDU', text: `The DCDU ${number} screen is blank and its keys no longer respond.` },
      { where: 'DCDU', text: `DCDU ${3 - number} still receives the messages and works as usual.` },
    ],
    logbook: { required: true, reason: 'blank datalink display unit' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata46Entries: Record<number, FailureDetail> = {
  [A320Failure.Atsu]: {
    whatItIs:
      'The air traffic services unit (ATSU) runs the datalink. Its router chooses the air-ground link, its ATC ' +
      'function handles the CPDLC messages and its AOC function the company messages. It is supplied by AC bus 1.',
    impact: [
      'The ATSU stops running, as if it had no power: the router, the CPDLC and the company datalink all stop.',
      'Switching it off drops the current ATC connection.',
      'Each DCDU that has power has no data to show.',
    ],
    alertIds: ['4600010'],
    effects: [
      {
        where: 'E/WD',
        text:
          `DATALINK ATSU FAULT with ATSU INIT FAULT, ${AWARENESS}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. ` +
          'It shows only while AC bus 1 supplies the ATSU.',
      },
      { where: 'SD STATUS', text: 'ATSU and DATA COMPANY are listed as inoperative.' },
      { where: 'E/WD', text: 'The green COMPANY DATALINK STBY memo, if it was showing, goes out.' },
      { where: 'DCDU', text: 'Each supplied DCDU shows INVALID DATA in place of its messages.' },
    ],
    logbook: { required: true, reason: 'ECAM alert and datalink lost' },
    clearing: 'Maintenance only: use Restore. Pulling and pushing the ATSU circuit breakers does not clear it.',
  },
  [A320Failure.AtsuAoc]: {
    whatItIs:
      'The AOC function of the ATSU exchanges the company messages (reports, weather and flight plan requests, ' +
      'free text). The router and the ATC function (CPDLC) work separately from it.',
    impact: [
      'The company datalink stops. The router and the CPDLC keep working.',
      'The company messages can no longer be sent or received.',
    ],
    alertIds: ['4600020'],
    effects: [
      {
        where: 'E/WD',
        text:
          `DATALINK COMPANY FAULT, ${AWARENESS}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. ` +
          'It shows only with the ATSU itself working: a failed ATSU shows DATALINK ATSU FAULT instead.',
      },
      { where: 'SD STATUS', text: 'DATA COMPANY is listed as inoperative.' },
      { where: 'E/WD', text: 'The green COMPANY DATALINK STBY memo, if it was showing, goes out.' },
    ],
    logbook: { required: true, reason: 'ECAM alert and company datalink lost' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.Printer]: {
    whatItIs:
      'The cockpit printer prints the MCDU pages, the company and ATC reports and the datalink messages of the ' +
      'DCDU. The pilot starts a print from the MCDU or with the PRINT key of the DCDU.',
    impact: ['The printer is lost: nothing can be printed.', 'The aircraft raises no alert for it.'],
    alertIds: [],
    effects: [
      {
        where: 'MCDU',
        text: 'A print request gives the white message PRINTER NOT AVAILABLE and nothing is printed. The DCDU PRINT key does the same.',
      },
    ],
    logbook: { required: true, reason: 'printer not available' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata46Families: FailureDetailFamily[] = [DcduFamily];
