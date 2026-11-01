// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';
const ADVISORY = 'an amber advisory with no master caution and no chime';

/** The COM alerts (RMP, VHF 3 datalink, PTT stuck, VHF emitting): flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

const ALERT_RMP_1 = '230800012';
const ALERT_RMP_2 = '230800013';
const ALERT_RMP_3 = '230800014';
const ALERT_RMP_1_2 = '230800015';
const ALERT_RMP_1_3 = '230800016';
const ALERT_RMP_2_3 = '230800017';
const ALERT_RMP_1_2_3 = '230800018';
const ALERT_DATALINK_FAULT = '230800007';
const ALERT_VHF_3_DATALINK_FAULT = '230800025';
const ALERT_PTT_STUCK = ['230800004', '230800005', '230800006'] as const;
const ALERT_VHF_EMITTING = ['230800022', '230800023', '230800024'] as const;

// ---------------------------------------------------------------------------------------------------------------------
// Audio management units
// ---------------------------------------------------------------------------------------------------------------------

const AmuFamily: FailureDetailFamily = {
  ids: [A380Failure.AudioManagementUnit1, A380Failure.AudioManagementUnit2],
  detail: (n): FailureDetail => {
    const side = n === 1 ? "captain's" : "first officer's";
    const otherAmu = n === 1 ? 2 : 1;
    return {
      whatItIs:
        'The two audio management units route all the cockpit audio: the VHF and navaid receivers, the transmission ' +
        'selections of the radio management panels and the loudspeaker volume. AMU 1 mainly serves the captain ' +
        "side and AMU 2 the first officer's, and both are supplied from the essential DC bus.",
      impact:
        n === 1
          ? [
              "The captain's audio unit is lost: the simulator audio is then run by AMU 2.",
              'AMU 2 takes its transmission and reception selections from RMP 2, or from RMP 3 and then RMP 1 when RMP 2 is switched off, and uses the first officer loudspeaker volume, not the captain one.',
              'With both AMUs failed there is no radio reception or transmission and no navaid identification audio.',
            ]
          : [
              "The first officer's audio unit is lost. If the player sits on the left, AMU 1 keeps serving the audio and nothing changes.",
              'If the player sits on the right, or once AMU 1 has failed too, there is no radio reception or transmission and no navaid identification audio.',
            ],
      alertIds: [],
      effects: [
        {
          where: 'E/WD',
          text:
            'No alert, no STATUS line and no memo: the warning system does not read this failure, so the crew gets ' +
            'no indication besides the audio itself.',
        },
        {
          where: 'Aural',
          text:
            n === 1
              ? `The ${side} seat now hears what RMP 2 has selected (VHF reception, navaid identification), or RMP 3 and ` +
                'then RMP 1 when RMP 2 is switched off, at the volume of the first officer loudspeaker knob. The ' +
                'VHF transmit selection of that RMP decides which radio transmits.'
              : `With the player on the right, the ${side} seat hears no VHF reception, cannot transmit and hears ` +
                'no navaid identification. On the left nothing changes.',
        },
        {
          where: 'Aural',
          text: `With AMU ${n} and AMU ${otherAmu} both failed, every VHF is silent in both directions and the navaid identifications are off.`,
        },
      ],
      notSimulated: [
        'The flight interphone and the cabin audio that the real audio units also route are not modelled.',
      ],
      logbook: {
        required: true,
        reason: n === 1 ? 'audio runs on AMU 2, no alert' : 'right-side audio lost, no alert',
      },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Radio management panels
// ---------------------------------------------------------------------------------------------------------------------

const RMP_FAULT_ALERTS: Record<number, readonly string[]> = {
  1: [ALERT_RMP_1, ALERT_RMP_1_2, ALERT_RMP_1_3, ALERT_RMP_1_2_3],
  2: [ALERT_RMP_2, ALERT_RMP_1_2, ALERT_RMP_2_3, ALERT_RMP_1_2_3],
  3: [ALERT_RMP_3, ALERT_RMP_1_3, ALERT_RMP_2_3, ALERT_RMP_1_2_3],
};

/** The names of the combined alerts a failed RMP can be part of, for each RMP */
const RMP_FAULT_NAMES: Record<number, readonly [string, string]> = {
  1: ['1+2', '1+3'],
  2: ['1+2', '2+3'],
  3: ['1+3', '2+3'],
};

const RmpFamily: FailureDetailFamily = {
  ids: [A380Failure.RadioManagementPanel1, A380Failure.RadioManagementPanel2, A380Failure.RadioManagementPanel3],
  detail: (n): FailureDetail => {
    const panel = n === 3 ? 'Overhead RMP 3' : `Pedestal RMP ${n}`;
    const partner = n === 1 ? 2 : 1;
    const vhfHandedOver = n === 1 ? 'VHF 1 and VHF 3' : 'VHF 2';
    const otherRmpForVhf = n === 1 ? 'RMP 2' : 'RMP 1';
    const memoWhenOff =
      n === 1
        ? 'CAPT ON RMP 3 (RMP 3 on, RMP 2 on)'
        : n === 2
          ? 'F/O ON RMP 3 (RMP 3 on, RMP 1 on)'
          : 'RMP 3 OFF (RMP 1 and 2 on)';

    return {
      whatItIs:
        'The radio management panels are the cockpit controls of the communication system: they select what is ' +
        'transmitted and received, tune the VHF radios, set the voice or data mode and set the transponder code. ' +
        'RMP 1 (captain) and RMP 2 (first officer) are on the pedestal and also tune the standby radio navigation; ' +
        'RMP 3 is on the overhead panel and is the backup of the other two.',
      impact:
        n === 3
          ? [
              'RMP 3 is lost as a panel: alone it changes no radio, because RMP 1 and RMP 2 tune the VHF radios.',
              'It can no longer take over the VHF radios of RMP 1 or RMP 2 if one of them fails or is switched off.',
            ]
          : [
              `RMP ${n} is lost: its screen is dark and its keys do nothing.`,
              `${vhfHandedOver} are tuned from RMP ${n} first and follow RMP 3 while it is on; with RMP 3 off they have no frequency until RMP ${n} is switched off, then ${otherRmpForVhf} tunes them.`,
              `RMP ${n} can no longer start the standby radio navigation; if it was active the FMS tunes the navaids again.`,
              `Once RMP ${n} is switched off, AMU ${n} takes its audio selections from RMP 3, or from RMP ${partner} when RMP 3 is off too.`,
            ],
      alertIds: [...RMP_FAULT_ALERTS[n]],
      effects: [
        {
          where: 'E/WD',
          text:
            `COM RMP ${n} FAULT (${CAUTION}) with the line RMP ${n} OFF, checked once the brightness knob of the ` +
            `RMP is turned to OFF; ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
        },
        {
          where: 'E/WD',
          text: `Replaced by COM RMP ${RMP_FAULT_NAMES[n][0]} FAULT or COM RMP ${RMP_FAULT_NAMES[n][1]} FAULT with both RMPs in the lines when one of the other RMPs has failed too (same caution).`,
        },
        {
          where: 'E/WD',
          text:
            'COM RMP 1+2+3 FAULT when all three have failed, with the three OFF lines and the cyan line NO COM ' +
            'AVAIL (same caution).',
        },
        {
          where: panel,
          text: 'The screen goes dark, the keys are dead and the red LED next to the brightness knob lights.',
        },
        {
          where: 'SD STATUS',
          text:
            n === 3
              ? 'Lists RMP 3 as inoperative (RMP 1+3 or 2+3 with a second RMP failed, RMP 1+2+3 with all three, then also STBY RAD NAV, VHF 1+2+3 and HF 1+2), in every flight phase, also while the alert is held back and after the RMP is switched off.'
              : `Lists RMP ${n} as inoperative (RMP 1+2, ${n === 1 ? '1+3' : '2+3'} or 1+2+3 when others failed too). With RMP 1 and RMP 2 both failed it adds STBY RAD NAV, with all three VHF 1+2+3 and HF 1+2. The lines show in every flight phase, also while the alert is held back and after the RMP is switched off.`,
        },
        {
          where: 'E/WD',
          text: `The memo ${memoWhenOff} shows once the RMP is switched off; with two RMPs off the memos read CAPT+F/O ON RMP 3, RMP 1+3 OFF, RMP 2+3 OFF or RMP 1+2+3 OFF.`,
        },
      ],
      notSimulated: [
        'HF and SATCOM are not modelled: the all-RMP alert always reads NO COM AVAIL, and the HF 1+2 line in STATUS has no radio behind it.',
      ],
      logbook: { required: true, reason: 'RMP FAULT alert and a dark panel' },
      clearing: 'Switching the RMP off only completes the alert line, the alert stays; maintenance only: use Restore.',
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// VHF transceivers
// ---------------------------------------------------------------------------------------------------------------------

const VhfFamily: FailureDetailFamily = {
  ids: [A380Failure.Vhf1, A380Failure.Vhf2],
  detail: (n): FailureDetail => ({
    whatItIs:
      `VHF ${n} is one of the three VHF transceivers for voice communication with air traffic control and other ` +
      'stations. It is tuned and selected from the radio management panels and its audio goes through the audio ' +
      'management units.',
    impact: [
      `VHF ${n} is lost: nothing is received or transmitted on it.`,
      `The other two VHF radios keep working; VHF ${n} can be tuned and selected on the panels, but the radio stays silent.`,
    ],
    alertIds: [],
    effects: [
      {
        where: 'E/WD',
        text: 'No alert, no STATUS line and no memo: the warning system does not read this failure.',
      },
      {
        where: `RMP`,
        text: `The VHF ${n} active frequency shows amber dashes instead of the frequency.`,
      },
      {
        where: 'Aural',
        text: `Nothing is heard on VHF ${n} and a transmission on it goes nowhere; the radio is switched off in the simulator.`,
      },
    ],
    logbook: { required: true, reason: `VHF ${n} unusable, dashes on the RMP` },
    clearing: MAINTENANCE_ONLY,
  }),
};

const VHF_3_DETAIL: FailureDetail = {
  whatItIs:
    'VHF 3 is the third VHF transceiver. Besides voice it is the radio of the datalink: in data mode on the radio ' +
    'management panel it carries the ATC datalink and company messages through the datalink router.',
  impact: [
    'VHF 3 is lost for voice and for data: nothing is received or transmitted on it.',
    'The datalink router has no data medium left, so ATC datalink (CPDLC) and company messages are no longer available.',
  ],
  alertIds: [ALERT_VHF_3_DATALINK_FAULT, ALERT_DATALINK_FAULT],
  effects: [
    {
      where: 'E/WD',
      text:
        `COM VHF 3 DATALINK FAULT (${ADVISORY}); ${NOT_SHOWN_PHASES_3_TO_7_9_10}. It shows even when VHF 3 is in voice ` +
        'mode on the RMP.',
    },
    {
      where: 'E/WD',
      text:
        `COM DATALINK FAULT with the line VHF & HF & SATCOM DATA NOT AVAIL (${ADVISORY}); same phase rule. It also ` +
        'shows when VHF 3 is only in voice mode, without any failure.',
    },
    {
      where: 'SD STATUS',
      text: 'Lists VHF 3 DATALINK as inoperative while COM VHF 3 DATALINK FAULT is shown.',
    },
    {
      where: 'RMP',
      text: 'The VHF 3 active frequency shows amber dashes, in data mode as four dashes instead of DATA.',
    },
    {
      where: 'Aural',
      text: 'Nothing is heard on VHF 3 and a transmission on it goes nowhere; the radio is switched off in the simulator.',
    },
  ],
  notSimulated: ['HF and SATCOM are not modelled, so VHF 3 is the only data medium and its loss ends all datalink.'],
  logbook: { required: true, reason: 'COM VHF 3 DATALINK FAULT and COM DATALINK FAULT alerts' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// Push-to-talk switches stuck in transmit
// ---------------------------------------------------------------------------------------------------------------------

const PTT_SEATS = [
  { seat: 'captain', title: 'CAPT', rmp: 1 },
  { seat: 'first officer', title: 'F/O', rmp: 2 },
  { seat: 'third occupant', title: 'THIRD OCCUPANT', rmp: 3 },
] as const;

const PttFamily: FailureDetailFamily = {
  ids: [A380Failure.CaptPttStuck, A380Failure.FoPttStuck, A380Failure.ThirdOccupantPttStuck],
  detail: (n): FailureDetail => {
    const { seat, title, rmp } = PTT_SEATS[n - 1];
    const seatName = n === 3 ? 'third occupant seat' : `${seat}'s side`;
    return {
      whatItIs:
        `The push-to-talk switch of the ${seat} keys the microphone on the transmission selected on the radio ` +
        `management panel of that seat (RMP ${rmp}). It is released on its own after each call; the flight ` +
        'warning system watches how long it stays pressed.',
      impact: [
        `The ${seat} PTT switch is held in the transmit position.`,
        `With a VHF transmission key selected on RMP ${rmp}, that VHF counts as transmitting continuously.`,
        'No transmission is actually keyed in the simulator: only the warnings follow.',
      ],
      alertIds: [ALERT_PTT_STUCK[n - 1], ...ALERT_VHF_EMITTING],
      effects: [
        {
          where: 'E/WD',
          text:
            `COM ${title} PTT STUCK (${CAUTION}) after more than 40 s of stuck switch, only while no transmission ` +
            `key is selected on RMP ${rmp}${n === 3 ? '' : ' (the cockpit preparation selects VHF 1, so this alert normally comes only after that key is deselected)'}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
        },
        {
          where: 'E/WD',
          text:
            `COM VHF 1 (2)(3) EMITTING (${CAUTION}) after 60 s with a VHF transmission key selected on RMP ${rmp}, ` +
            `with the line RMP TX KEY DESELECT${n === 3 ? '' : ' (with the VHF 1 key set by the cockpit preparation this is the usual alert, COM VHF 1 EMITTING)'}. ` +
            'Selecting a VHF key ends PTT STUCK at once and the EMITTING alert follows 60 s later; it goes out when the key is deselected. Same phase rule.',
        },
        {
          where: 'E/WD',
          text: `Selecting an HF, telephone, interphone or cabin key on RMP ${rmp} ends PTT STUCK. The PA key ends it only while held (PA IN USE memo meanwhile); after the release PTT STUCK returns 40 s later.`,
        },
      ],
      notSimulated: [
        `A real stuck switch keeps transmitting on the ${seatName}, which blocks the frequency; here no radio is keyed.`,
        'The real VHF EMITTING alert shows from about 35 s with the chime after 60 s; here it appears after 60 s.',
      ],
      logbook: { required: true, reason: `COM ${title} PTT STUCK or COM VHF EMITTING alert` },
      clearing:
        'Selecting an HF, telephone, interphone or cabin key on that RMP ends PTT STUCK (a VHF key starts the VHF EMITTING timing); maintenance only: use Restore.',
    };
  },
};

export const Ata23AudioEntries: Record<number, FailureDetail> = {
  [A380Failure.Vhf3]: VHF_3_DETAIL,
};

export const Ata23AudioFamilies: FailureDetailFamily[] = [AmuFamily, RmpFamily, VhfFamily, PttFamily];
