// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** The COM alerts all have the phase list 3, 4, 5, 7, 8 */
const NOT_SHOWN_PHASES =
  'not shown from take-off power set to 1,500 ft, nor below 800 ft on approach and in the landing roll above 80 kt';

const CAUTION_SOUND = 'amber caution with master caution and a single chime';
const AWARENESS_ONLY = 'amber, crew awareness only (no master caution, no chime)';

const VHF_NAMES = ['VHF 1', 'VHF 2', 'VHF 3'] as const;
const VHF_EMITTING_KEYS = ['2300030', '2300040', '2300050'] as const;

const RmpFamily: FailureDetailFamily = {
  ids: [A320Failure.RadioManagementPanel1, A320Failure.RadioManagementPanel2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two radio management panels (RMP) on the centre pedestal give the crew control of all the VHF radios. ' +
      'Each RMP can tune any VHF transceiver and the two panels follow each other. They are also the backup for ' +
      'tuning the navigation radios when the flight management computers cannot.',
    impact: [
      `RMP ${number} stops tuning and its displays go blank.`,
      `RMP ${number === 1 ? 2 : 1} still tunes every VHF transceiver.`,
      'The VHF radios themselves keep working on their last frequencies.',
    ],
    alertIds: [],
    effects: [
      { where: 'Pedestal (RMP)', text: `RMP ${number} blanks both frequency displays and ignores its keys and knobs.` },
      {
        where: 'Pedestal (RMP)',
        text: 'The green key lights and the SEL light of the panel go out, as with the panel switched off.',
      },
    ],
    clearing: MAINTENANCE_ONLY,
    logbook: { required: true, reason: 'blank and dead radio panel' },
  }),
};

const VhfFamily: FailureDetailFamily = {
  ids: [A320Failure.Vhf1, A320Failure.Vhf2, A320Failure.Vhf3],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The three VHF transceivers give voice communication with ATC and the company. VHF 1 and VHF 2 are voice ' +
      'only; VHF 3 can also carry data link. They are tuned from the RMPs and used through the audio control panels.',
    impact: [
      `${VHF_NAMES[number - 1]} is switched off: it neither receives nor transmits.`,
      'The other two VHF radios and both RMPs are not affected.',
    ],
    alertIds: number === 3 ? ['2300060'] : [],
    effects:
      number === 3
        ? [
            { where: 'Pedestal (ACP)', text: 'No reception and no transmission on VHF 3.' },
            {
              where: 'E/WD',
              text: `COM VHF 3 DATA FAULT, ${AWARENESS_ONLY}, when VHF 3 is failed and its active frequency reads 0.`,
            },
            { where: 'E/WD', text: `COM VHF 3 DATA FAULT is ${NOT_SHOWN_PHASES}.` },
            { where: 'SD STATUS', text: 'INOP SYS lists VHF 3 DATA.' },
          ]
        : [
            { where: 'Pedestal (ACP)', text: `No reception and no transmission on ${VHF_NAMES[number - 1]}.` },
            { where: 'E/WD', text: 'No alert: the loss shows only in the radio.' },
          ],
    clearing: MAINTENANCE_ONLY,
    logbook: { required: true, reason: 'dead VHF radio' },
  }),
};

const CidsDirectorFamily: FailureDetailFamily = {
  ids: [A320Failure.CidsDirector1, A320Failure.CidsDirector2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The cabin intercommunication data system (CIDS) runs the cabin and service interphone, the passenger ' +
      'address, the passenger signs and the cabin lighting. Two directors work in parallel: one is active and ' +
      'the other is on standby.',
    impact: [
      `CIDS director ${number} fails. The other director keeps the system working.`,
      'Both directors failed: the CIDS is lost.',
    ],
    alertIds: ['2300010'],
    effects: [
      {
        where: 'E/WD',
        text: `Both directors failed: COM CIDS 1+2 FAULT, ${AWARENESS_ONLY}.`,
      },
      {
        where: 'E/WD',
        text: `COM CIDS 1+2 FAULT is ${NOT_SHOWN_PHASES}.`,
      },
      { where: 'SD STATUS', text: 'Both directors failed: INOP SYS lists CIDS.' },
      { where: 'E/WD', text: 'One director failed: no indication.' },
    ],
    notSimulated: ['The cabin functions (interphone, passenger address, signs) do not stop with the CIDS.'],
    clearing: MAINTENANCE_ONLY,
    logbook: { required: false, reason: 'no indication to report with one director' },
  }),
};

const PttStuckFamily: FailureDetailFamily = {
  ids: [A320Failure.CaptPttStuck, A320Failure.FoPttStuck],
  detail: (number): FailureDetail => {
    const acp = number;
    return {
      whatItIs:
        'Each pilot keys the radio with a push-to-talk switch (PTT). It connects the microphone to the VHF ' +
        "transmission key selected on that pilot's audio control panel (ACP).",
      impact: [
        `The ${number === 1 ? 'captain' : 'first officer'} PTT stays jammed in transmit.`,
        `It keys the VHF whose transmission key is selected on ACP ${acp}, if that radio works.`,
        'If the emission is not stopped, the VHF itself raises its own emitting alert.',
      ],
      alertIds: ['2300020', ...VHF_EMITTING_KEYS],
      effects: [
        {
          where: 'E/WD',
          text:
            `COM SINGLE PTT STUCK, ${CAUTION_SOUND}, after 40 s of keying a VHF. It lists the ACP DESELECT lines ` +
            'one ACP after the other.',
        },
        {
          where: 'E/WD',
          text:
            'Once the ACP of the stuck PTT has no key on that VHF: AUDIO SWTG DO NOT USE, ALL TX KEYS DO NOT USE on ' +
            'that ACP and VHF TX RESELECT on the other ACP.',
        },
        { where: 'E/WD', text: `COM SINGLE PTT STUCK is ${NOT_SHOWN_PHASES}.` },
        {
          where: 'E/WD',
          text: `COM VHF 1, 2 or 3 EMITTING for the keyed radio, ${CAUTION_SOUND}, after 60 s of emission.`,
        },
        { where: 'E/WD', text: `COM VHF EMITTING is ${NOT_SHOWN_PHASES}.` },
        {
          where: 'Pedestal (ACP)',
          text: `Deselecting the transmission key on ACP ${acp} ends the emission and the lines follow.`,
        },
        { where: 'SD STATUS', text: 'Single PTT stuck: AUDIO SWTG DO NOT USE, INOP SYS SINGLE PTT.' },
      ],
      notSimulated: ['The radio does not really transmit; only the alerts follow the stuck switch.'],
      clearing: 'Crew action: deselect the VHF transmission key on that ACP. Then use Restore.',
      logbook: { required: true, reason: 'ECAM caution and a jammed PTT' },
    };
  },
};

const VhfEmittingFamily: FailureDetailFamily = {
  ids: [A320Failure.Vhf1StuckEmitting, A320Failure.Vhf2StuckEmitting, A320Failure.Vhf3StuckEmitting],
  detail: (number): FailureDetail => ({
    whatItIs:
      'A VHF transceiver transmits only while a PTT keys it. It is supplied from its own bus: VHF 1 from the DC ' +
      'essential bus, VHF 2 from DC bus 2 and VHF 3 from DC bus 1.',
    impact: [
      `${VHF_NAMES[number - 1]} keeps transmitting with no PTT keyed, while it is supplied and not failed.`,
      'The channel is blocked for other traffic.',
    ],
    alertIds: [VHF_EMITTING_KEYS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `COM ${VHF_NAMES[number - 1]} EMITTING, ${CAUTION_SOUND}, after 60 s of emission, only while it is supplied and not failed.`,
      },
      { where: 'E/WD', text: `COM VHF EMITTING is ${NOT_SHOWN_PHASES}.` },
    ],
    notSimulated: [
      'The radio does not really transmit; only the alert follows.',
      'Pulling the VHF circuit breaker is the real cure; the alert has no crew action line.',
    ],
    clearing: MAINTENANCE_ONLY,
    logbook: { required: true, reason: 'ECAM caution and a blocked VHF' },
  }),
};

export const Ata23Entries: Record<number, FailureDetail> = {};

export const Ata23Families: FailureDetailFamily[] = [
  RmpFamily,
  VhfFamily,
  CidsDirectorFamily,
  PttStuckFamily,
  VhfEmittingFamily,
];
