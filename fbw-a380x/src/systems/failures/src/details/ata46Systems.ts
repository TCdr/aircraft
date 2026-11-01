// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';
const ADVISORY = 'an amber advisory with no master caution and no chime';

const ALERT_ADS_DATALINK_FAULT = '460800001';
const ALERT_NSS_AVNCS_DATA_XFR_FAULT = '460800004';

/** The information system COM alerts: inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

const NO_ALERT_NO_STATUS = 'No alert, no STATUS line and no light: the crew sees the loss only on the OIT.';

const NOT_AVAILABLE_SCREEN = 'The OIT screen is replaced by "Not available." and the OIT content is hidden.';

// ---------------------------------------------------------------------------------------------------------------------
// ANSUs (aircraft network server units)
// ---------------------------------------------------------------------------------------------------------------------

const NSS_ANSU_DESCRIPTION =
  'Two aircraft network server units (ANSUs) of the NSS AVNCS side host the flight crew applications of the onboard ' +
  'information system: the AOC company communication, the electronic logbook and the maintenance applications. Each ' +
  'ANSU is reached through its own router unit, and either of them is enough to run the applications.';

const nssAnsuDetail = (number: number): FailureDetail => {
  const other = number === 1 ? 2 : 1;
  return {
    whatItIs: NSS_ANSU_DESCRIPTION,
    impact: [
      `NSS AVNCS ANSU ${number} stops. ANSU ${other} hosts the applications, so nothing is lost while ANSU ${other} works.`,
      `If ANSU ${other} is lost as well, the NSS AVNCS applications stop and the AOC is inoperative.`,
    ],
    alertIds: [],
    effects: [
      {
        where: 'OIT',
        text:
          `With ANSU ${number} alone failed the NSS AVNCS side runs as usual: no message, no page change and no ` +
          'data loss.',
      },
      {
        where: 'OIT',
        text:
          `With both NSS AVNCS ANSUs failed, an OIT set to the NSS AVNCS side (OIT SIDE switch) shows "Not ` +
          'available." and the open applications are closed. The AOC powers down: its message queues and the unread ' +
          'company message count are cleared. The OOOI times and unsent entries of the applications are lost. A ' +
          'FLT OPS laptop no longer gets the flight number, the city pair or the other avionics data.',
      },
      { where: 'E/WD', text: NO_ALERT_NO_STATUS },
    ],
    logbook: {
      required: false,
      reason: 'no indication to report with one ANSU; the OIT shows Not available if both fail',
    },
    clearing: `${MAINTENANCE_ONLY} The reset panel does not clear it.`,
  };
};

const fltOpsAnsuDetail: FailureDetail = {
  whatItIs:
    'The FLT OPS side has one aircraft network server unit (ANSU) with an aircraft router unit (ARU). Together they ' +
    'form the network that connects the cockpit laptops to each other and, one way, to the data of the NSS AVNCS ' +
    'side. The laptops host the performance and mission applications.',
  impact: [
    'The FLT OPS ANSU stops and the FLT OPS network goes with it: the ARU stops.',
    'The laptops keep running but become stand-alones: no FLT OPS STS synchronisation, no shared charts clipboard, no avionics data (flight number, city pair), no ground link by gatelink or satellite.',
    'After Restore the network router needs up to 2 minutes to start. A laptop that was connected before the failure then reconnects, but its STS page entries are shared again only after both laptops are restarted; a laptop switched on during the failure stays a stand-alone until it is restarted.',
  ],
  alertIds: [],
  effects: [
    {
      where: 'OIT',
      text: `An OIT set to the FLT OPS side (OIT SIDE switch): ${NOT_AVAILABLE_SCREEN}`,
    },
    {
      where: 'OIT',
      text:
        'An OIT set to the NSS AVNCS side is not affected. While a laptop is a stand-alone, its FLT OPS login page ' +
        'shows STANDALONE and its STS page shows SYNCHRONIZATION NOT AVAIL (seen after Restore, during the router ' +
        'start, or for a laptop started during the failure).',
    },
    { where: 'E/WD', text: NO_ALERT_NO_STATUS },
  ],
  logbook: { required: false, reason: 'no indication to report; only the FLT OPS side of the OIT is lost' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// Laptops
// ---------------------------------------------------------------------------------------------------------------------

const laptopDetail = (number: number): FailureDetail => {
  const seat = number === 1 ? 'captain' : 'first officer';
  const otherSeat = number === 1 ? 'first officer' : 'captain';
  return {
    whatItIs:
      'The cockpit laptops host the FLT OPS applications: the performance calculations, the loadsheet, the charts, ' +
      'the flight folder and the OPS library. Each pilot has one, connected to the FLT OPS network, and its screen ' +
      'is shown on the OIT of that side.',
    impact: [
      `The ${seat} laptop hangs and stops. Its open sessions are cleared.`,
      `The ${otherSeat} laptop and the NSS AVNCS side of the OIT are not affected.`,
      'A restart of the laptop clears the hang.',
    ],
    alertIds: [],
    effects: [
      {
        where: 'OIT',
        text:
          `On the ${seat} OIT, set to the FLT OPS side (OIT SIDE switch), the screen shows "Not available." and the ` +
          'FLT OPS content is hidden. The message toolbar, the open flight folder and the OPS library and charts ' +
          'sessions of that laptop are cleared.',
      },
      {
        where: 'OIT',
        text: `The ${otherSeat} laptop is not affected.`,
      },
      { where: 'E/WD', text: NO_ALERT_NO_STATUS },
    ],
    logbook: {
      required: false,
      reason: 'no indication to report on the aircraft; the laptop screen shows Not available',
    },
    clearing:
      'Switch the laptop off for at least 30 s and on again: this clears the hang while the failure stays set (Restore also clears it).',
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// OITs
// ---------------------------------------------------------------------------------------------------------------------

const oitDetail = (number: number): FailureDetail => {
  const seat = number === 1 ? 'captain' : 'first officer';
  return {
    whatItIs:
      'The onboard information terminal (OIT) is the screen and keyboard of the onboard information system in front ' +
      'of each pilot. An OIT SIDE switch selects whether it shows the NSS AVNCS applications or the FLT OPS laptop.',
    impact: [
      `The ${seat} OIT screen goes dark, as if it lost its supply.`,
      'The servers and the laptops behind it keep running, and the other OIT still works.',
      'Switching the OIT off with its brightness knob for 5 s and on again clears the hang.',
    ],
    alertIds: [],
    effects: [
      {
        where: 'OIT',
        text:
          `The ${seat} OIT goes to standby and is off after 10 s. It comes back only after it has been switched off ` +
          'with its brightness knob for 5 s and on again, or after Restore.',
      },
      { where: 'E/WD', text: NO_ALERT_NO_STATUS },
    ],
    logbook: { required: false, reason: 'no indication to report; one OIT screen is dark' },
    clearing:
      'Turn the OIT brightness knob to OFF for at least 5 s and back on: this clears the hang while the failure stays set (Restore also clears it).',
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Secure communication interfaces and the ADS function
// ---------------------------------------------------------------------------------------------------------------------

const sciDetail = (number: number): FailureDetail => {
  const other = number === 1 ? 2 : 1;
  return {
    whatItIs:
      'The two secure communication interfaces (SCIs) link the NSS AVNCS side to the avionics in both directions. ' +
      'Through them the AOC receives flight data from the avionics and sends its messages to the ground, and it ' +
      'triggers the company messages on the ECAM. One interface is enough.',
    impact: [
      `SCI ${number} is lost. While SCI ${other} works nothing changes.`,
      `With SCI ${other} lost as well the data exchange between the NSS and the avionics is lost both ways.`,
      'Then the AOC is inoperative and cannot send or receive messages, and the NSS applications keep only the last avionics values they had.',
    ],
    alertIds: [ALERT_NSS_AVNCS_DATA_XFR_FAULT],
    effects: [
      {
        where: 'E/WD',
        text:
          `With both SCIs lost: COM NSS/AVNCS DATA XFR FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. It has no ` +
          `lines. With SCI ${number} alone lost there is no alert.`,
      },
      { where: 'SD STATUS', text: 'With both SCIs lost, INOP SYS NSS/AVNCS DATA XFR, while the alert is shown.' },
      {
        where: 'OIT',
        text:
          'With both SCIs lost the message toolbar shows NSS/AVNCS DATA XFR INOP, and an entry that cannot reach the ' +
          'avionics is answered with NOT SENT: NSS/AVNCS DATA XFR INOP. The AOC messages are cleared, the avionics ' +
          'data (flight number, fuel on board, park brake and others) stop arriving, and a FLT OPS laptop gets no ' +
          'flight number or city pair. The unread company message count on the E/WD memo goes to zero.',
      },
    ],
    logbook: {
      required: false,
      reason: 'no indication with one SCI; COM NSS/AVNCS DATA XFR FAULT only if both are lost',
    },
    clearing: `${MAINTENANCE_ONLY} The AOC starts again once an interface works.`,
  };
};

const adsFunctionDetail: FailureDetail = {
  whatItIs:
    'The ADS function is the automatic dependent surveillance of the ATC datalink: it reports the position of the ' +
    'aircraft to the ground on contract. It runs in the ATC datalink part of the avionics, next to the CPDLC.',
  impact: [
    'The ADS function stops. The rest of the ATC datalink, the CPDLC, keeps working.',
    'The sim has no ADS contract exchange, so nothing else is lost: the failure shows as an alert only.',
  ],
  alertIds: [ALERT_ADS_DATALINK_FAULT],
  effects: [
    {
      where: 'E/WD',
      text:
        `COM ADS DATALINK FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. It has no lines. It is replaced by ` +
        'COM ATC DATALINK FAULT when the whole ATC datalink is lost as well.',
    },
    { where: 'SD STATUS', text: 'INOP SYS ADS DATALINK, while the alert is shown.' },
  ],
  logbook: { required: true, reason: 'COM ADS DATALINK FAULT caution' },
  clearing: MAINTENANCE_ONLY,
};

export const Ata46SystemsEntries: Record<number, FailureDetail> = {
  [A380Failure.FltOpsAnsu]: fltOpsAnsuDetail,
  [A380Failure.AdsFunction]: adsFunctionDetail,
};

export const Ata46SystemsFamilies: FailureDetailFamily[] = [
  { ids: [A380Failure.NssAnsu1, A380Failure.NssAnsu2], detail: nssAnsuDetail },
  { ids: [A380Failure.CaptainLaptop, A380Failure.FirstOfficerLaptop], detail: laptopDetail },
  { ids: [A380Failure.CaptainOit, A380Failure.FirstOfficerOit], detail: oitDetail },
  { ids: [A380Failure.Sci1, A380Failure.Sci2], detail: sciDetail },
];
