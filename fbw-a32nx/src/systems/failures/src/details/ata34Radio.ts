// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** The flight phases (3, 4 and 5) the ILS fault is inhibited in */
const NOT_SHOWN_FROM_TAKE_OFF_POWER_TO_1500_FT =
  'Not shown from take-off power set until lift-off reaches 1,500 ft (or 2 minutes).';

const ILS_FAULT_ALERTS = ['3400600', '3400601', '3400602'] as const;
const STATIC_FAULT_ALERTS = ['3400640', '3400641', '3400642', '3400643'] as const;
const STATIC_PROBE_NAMES = ['L CAPT', 'R CAPT', 'L F/O', 'R F/O'] as const;

const Ata34WxrPredictiveWindshear: FailureDetail = {
  whatItIs:
    'The predictive windshear function belongs to the weather radar. It scans the area ahead of the aircraft for ' +
    'windshear and warns the crew before the aircraft enters it. It is only used at low height around take-off ' +
    'and landing.',
  impact: [
    'The predictive windshear function is lost. The rest of the weather radar is not affected.',
    'The crew has to be alert for windshear from forecasts and visible weather alone.',
  ],
  alertIds: ['3400900'],
  effects: [
    {
      where: 'E/WD',
      text:
        'NAV PRED W/S DET FAULT, crew awareness only. Not shown from take-off power set until lift-off reaches ' +
        '1,500 ft (or 2 minutes), nor on the landing roll above 80 kt.',
    },
    { where: 'SD STATUS', text: 'PRED W/S DET is listed as inoperative.' },
  ],
  notSimulated: [
    'The aircraft has no predictive windshear model: it never gives W/S AHEAD alerts, with or without the failure.',
  ],
  logbook: { required: true, reason: 'ECAM alert and a lost system' },
  clearing: MAINTENANCE_ONLY,
};

const VorReceiverFamily: FailureDetailFamily = {
  ids: [A320Failure.Vor1Receiver, A320Failure.Vor2Receiver],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two VOR receivers pick up the bearing to a VOR station and its identification. The bearing is drawn ' +
      'as a pointer on the navigation display, and the deviation is shown in the VOR and ILS modes. Each receiver ' +
      'also feeds its own DME and the radio navigation page of the MCDU.',
    impact: [
      `VOR ${number} no longer receives any station. The bearing and deviation of this receiver are lost.`,
      `The other VOR receiver, and every other radio receiver, keep working.`,
    ],
    alertIds: [],
    effects: [{ where: 'ND', text: `The VOR ${number} bearing pointer and its deviation disappear.` }],
    notSimulated: ['No ECAM alert and no STATUS entry, and no VOR flag appears.'],
    logbook: { required: true, reason: 'a navigation receiver is lost' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const DmeReceiverFamily: FailureDetailFamily = {
  ids: [A320Failure.Dme1Receiver, A320Failure.Dme2Receiver],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two DME interrogators measure the slant distance to a DME station that is paired with the tuned VOR. ' +
      'The distance is shown beside the VOR information on the navigation display and on the radio navigation ' +
      'page of the MCDU.',
    impact: [
      `DME ${number} no longer gives any distance. The bearing of VOR ${number} is not affected.`,
      'The DME distance has to come from the other DME or from the position of the aircraft.',
    ],
    alertIds: [],
    effects: [{ where: 'ND', text: `The distance of VOR ${number} shows dashes instead of a number.` }],
    notSimulated: ['No ECAM alert and no STATUS entry: the ECAM never monitors the DME interrogators.'],
    logbook: { required: true, reason: 'a navigation receiver is lost' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const AdfReceiverFamily: FailureDetailFamily = {
  ids: [A320Failure.Adf1Receiver, A320Failure.Adf2Receiver],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The ADF receiver finds the direction of a non-directional beacon. It is an option on the A320 family. Its ' +
      'bearing is drawn as a pointer on the navigation display, with the beacon identification in the ADF area.',
    impact: [
      `ADF ${number} no longer receives any beacon. The bearing to the beacon is lost.`,
      'The other ADF receiver and the VOR receivers keep working.',
    ],
    alertIds: [],
    effects: [
      { where: 'ND', text: `The ADF ${number} bearing pointer disappears.` },
      { where: 'ND', text: 'The beacon identification is replaced by the tuned frequency.' },
    ],
    notSimulated: ['No ECAM alert and no STATUS entry, and no ADF flag appears.'],
    logbook: { required: true, reason: 'a navigation receiver is lost' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const IlsReceiverFamily: FailureDetailFamily = {
  ids: [A320Failure.Ils1Receiver, A320Failure.Ils2Receiver],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two ILS receivers, in the multi-mode receivers, pick up the localiser and glide slope signals. Receiver 1 ' +
      'feeds the CAPT primary flight display and receiver 2 the F/O one. The autoflight uses receiver 1 to fly and ' +
      'capture the ILS.',
    impact: [
      `ILS ${number} receives nothing: no localiser and no glide slope for its side.`,
      number === 1
        ? 'The autoflight uses receiver 1, so it also loses the signal and cannot capture the ILS.'
        : 'Receiver 1 and the autoflight keep working, so the ILS approach is still possible with the other side.',
      'Both receivers lost: no ILS approach is possible.',
    ],
    alertIds: [ILS_FAULT_ALERTS[number - 1], ILS_FAULT_ALERTS[2]],
    effects: [
      {
        where: 'E/WD',
        text:
          `NAV ILS ${number} FAULT, crew awareness only, or NAV ILS 1+2 FAULT when both receivers are lost. ` +
          NOT_SHOWN_FROM_TAKE_OFF_POWER_TO_1500_FT,
      },
      {
        where: 'SD STATUS',
        text:
          `ILS ${number} is listed as inoperative, with CAT 2 when only one receiver is lost. With both lost, ILS 1+2 ` +
          'is listed and so is GPWS; GPWS is also listed when receiver 1 is lost on the ground.',
      },
      {
        where: 'PFD',
        text: `The localiser and glide slope scales and deviations of PFD ${number} disappear.`,
      },
      {
        where: 'ND',
        text: `ND ${number === 1 ? 2 : 1} loses the ILS ${number} signal: no localiser and glide slope on its ILS and VOR pages.`,
      },
    ],
    notSimulated: ['No ILS flag logic beyond the missing signal: the receiver simply receives nothing.'],
    logbook: { required: true, reason: 'ECAM alert and a lost approach aid' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const StaticProbeFamily: FailureDetailFamily = {
  ids: [
    A320Failure.CaptLeftStaticProbe,
    A320Failure.CaptRightStaticProbe,
    A320Failure.FoLeftStaticProbe,
    A320Failure.FoRightStaticProbe,
  ],
  detail: (number): FailureDetail => {
    const side = number <= 2 ? 'CAPT' : 'F/O';
    const adr = number <= 2 ? 1 : 2;
    return {
      whatItIs:
        'Each side of the fuselage has static ports for the air data. The CAPT pair feeds air data reference 1, ' +
        'the F/O pair air data reference 2, and the standby pair air data reference 3. Each probe senses the ' +
        'outside pressure for altitude, speed and vertical speed.',
      impact: [
        `The ${STATIC_PROBE_NAMES[number - 1]} static probe is lost. The ${side} pair has one probe left.`,
        `In this simulation ADR ${adr} keeps its static pressure from the other probe of the pair, so its air data do not change.`,
        'Only the warning appears; no value on the displays changes.',
      ],
      alertIds: [STATIC_FAULT_ALERTS[number - 1]],
      effects: [
        {
          where: 'E/WD',
          text:
            `NAV ${STATIC_PROBE_NAMES[number - 1]} STATIC FAULT with IAS/ALTI MAY BE UNREL, amber caution with master ` +
            'caution and a single chime.',
        },
        { where: 'E/WD', text: 'Shown only before the first engine start and during engine start and taxi.' },
        {
          where: 'SD STATUS',
          text:
            `The ${STATIC_PROBE_NAMES[number - 1]} static probe is listed as inoperative, with ${side} PROBES ` +
            'when the angle of attack and pitot and TAT heating of that side are lost too, or all its heating.',
        },
      ],
      notSimulated: ['The ADR does not use the lost probe: the air data are not affected, unlike the real aircraft.'],
      logbook: { required: true, reason: 'ECAM caution and a lost sensor' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

export const Ata34RadioEntries: Record<number, FailureDetail> = {
  [A320Failure.WxrPredictiveWindshear]: Ata34WxrPredictiveWindshear,
};

export const Ata34RadioFamilies: FailureDetailFamily[] = [
  VorReceiverFamily,
  DmeReceiverFamily,
  AdfReceiverFamily,
  IlsReceiverFamily,
  StaticProbeFamily,
];
