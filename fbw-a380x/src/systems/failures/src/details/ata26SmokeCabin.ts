// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Alerts inhibited in flight phases 3-7, 9, 10 and 11 */
const DET_FAULT_PHASES =
  'not shown from take-off power until 1,500 ft or 2 min after lift-off, nor from 800 ft on approach until the engines are shut down (once shown it stays)';

/** Crew rest and CWS / RCC smoke warnings, inhibited in flight phases 4, 5, 6, 9 and 10 */
const REST_SMOKE_PHASES =
  'not shown from 80 kt on the take-off roll until 400 ft or about 15 s after lift-off, nor from 800 ft on approach until the aircraft slows below 80 kt after landing (once shown it stays)';

/** Lavatory smoke warnings, inhibited in flight phases 4, 5, 6, 7, 9 and 10 */
const LAVATORY_SMOKE_PHASES =
  'not shown from 80 kt on the take-off roll until 1,500 ft or 2 min after lift-off, nor from 800 ft on approach until the aircraft slows below 80 kt after landing (once shown it stays)';

const ADVISORY = 'amber advisory without master caution or chime';
const WARNING = 'red warning with master warning and continuous chime';

const SMOKE_HIDDEN =
  'The smoke warning does not come when every detector of the compartment is failed (its DET FAULT advisory shows instead), or when the smoke detection function or its facilities are failed (their own fault alert shows instead).';

const CABIN_COM_LINE = 'The procedure only asks to establish CKPT / CABIN COM.';

const FAP_NOT_SIMULATED = 'The cabin smoke alert on the flight attendant panel is not modelled.';

const DET_FAULT_GOES_OUT = 'It goes out while the smoke warning of this compartment is on.';

/** The two ways a detector can disappear: with one detector left the other still gives the warning. */
const DETECTOR_DUAL_IMPACT =
  'The detector no longer detects smoke. The other detector still gives the smoke warning if smoke appears. With both detectors failed the DET FAULT stays and smoke is no longer detected.';

const LAVATORY_DECKS = ['main deck', 'upper deck', 'lower deck'] as const;
const LAVATORY_SMOKE_ALERTS = ['260800065', '260800066', '260800067'] as const;
const LAVATORY_DET_FAULT_ALERTS = ['260800062', '260800063', '260800064'] as const;
const LAVATORY_TITLES = ['MAIN DECK', 'UPPER DECK', 'LOWER DECK'] as const;
const LAVATORY_INOP = ['MAIN LAV SMK DET', 'UPPER LAV SMK DET', 'LOWER LAV SMK DET'] as const;

const LavatorySmokeFamily: FailureDetailFamily = {
  ids: [A380Failure.MainDeckLavatorySmoke, A380Failure.UpperDeckLavatorySmoke, A380Failure.LowerDeckLavatorySmoke],
  detail: (number): FailureDetail => {
    const deck = LAVATORY_DECKS[number - 1];
    return {
      whatItIs:
        'Each lavatory has a smoke detector in its ceiling next to the extraction vent, and a wastebin with its own ' +
        'automatic fire extinguisher. In the model the lavatories of one deck share a single detector.',
      impact: [
        `Smoke appears in the ${deck} lavatories and their detector reports it.`,
        'The smoke itself changes no system in the model: only the warning follows.',
      ],
      alertIds: [LAVATORY_SMOKE_ALERTS[number - 1]],
      effects: [
        {
          where: 'E/WD',
          text:
            `SMOKE ${LAVATORY_TITLES[number - 1]} LAVATORY SMOKE, ${WARNING}, ${LAVATORY_SMOKE_PHASES}. ` +
            CABIN_COM_LINE,
        },
        { where: 'E/WD', text: SMOKE_HIDDEN },
      ],
      notSimulated: [FAP_NOT_SIMULATED],
      logbook: { required: true, reason: 'red ECAM warning for smoke' },
      clearing: `${MAINTENANCE_ONLY} The warning stays while the smoke is set.`,
    };
  },
};

const LavatoryDetectorFamily: FailureDetailFamily = {
  ids: [
    A380Failure.MainDeckLavatorySmokeDetector,
    A380Failure.UpperDeckLavatorySmokeDetector,
    A380Failure.LowerDeckLavatorySmokeDetector,
  ],
  detail: (number): FailureDetail => {
    const deck = LAVATORY_DECKS[number - 1];
    return {
      whatItIs:
        'Each lavatory has one smoke detector in its ceiling. The smoke detection function watches the detector ' +
        'and reports it when it stops working.',
      impact: [
        `The smoke detector of the ${deck} lavatories fails.`,
        'It is the only detector there: smoke in these lavatories would no longer be detected.',
      ],
      alertIds: [LAVATORY_DET_FAULT_ALERTS[number - 1]],
      effects: [
        {
          where: 'E/WD',
          text: `SMOKE ${LAVATORY_TITLES[number - 1]} LAVATORY DET FAULT, ${ADVISORY}, ${DET_FAULT_PHASES}.`,
        },
        { where: 'SD STATUS', text: `While the alert is shown: ${LAVATORY_INOP[number - 1]} inoperative.` },
      ],
      logbook: { required: true, reason: 'ECAM alert and lavatory smoke detection lost' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const FlightCrewRestSmokeFamily: FailureDetailFamily = {
  ids: [A380Failure.FlightCrewRest1Smoke, A380Failure.FlightCrewRest2Smoke],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each flight crew rest compartment has smoke detectors. The smoke detection function compares them and raises ' +
      `the warning. Compartment ${number} is one of the two.`,
    impact: [
      `Smoke appears in flight crew rest ${number} and the detectors report it.`,
      'The smoke itself changes no system in the model: only the warning follows.',
    ],
    alertIds: ['260800060'],
    effects: [
      {
        where: 'E/WD',
        text: `SMOKE FLT REST SMOKE, ${WARNING}, ${REST_SMOKE_PHASES}. ${CABIN_COM_LINE} Both rests share this alert.`,
      },
      { where: 'E/WD', text: SMOKE_HIDDEN },
    ],
    logbook: { required: true, reason: 'red ECAM warning for smoke' },
    clearing: `${MAINTENANCE_ONLY} The warning stays while the smoke is set.`,
  }),
};

const FlightCrewRestDetectorFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FlightCrewRest1SmokeDetector1,
    A380Failure.FlightCrewRest1SmokeDetector2,
    A380Failure.FlightCrewRest2SmokeDetector1,
    A380Failure.FlightCrewRest2SmokeDetector2,
  ],
  detail: (number): FailureDetail => {
    const rest = number <= 2 ? 1 : 2;
    const detector = number % 2 === 1 ? 1 : 2;
    return {
      whatItIs:
        'Each flight crew rest compartment has two smoke detectors. The smoke detection function compares them: both ' +
        'must agree, or one must be failed, for the smoke warning.',
      impact: [`Detector ${detector} of flight crew rest ${rest} fails.`, DETECTOR_DUAL_IMPACT],
      alertIds: ['260800058'],
      effects: [
        {
          where: 'E/WD',
          text: `SMOKE FLT REST DET FAULT, ${ADVISORY}, ${DET_FAULT_PHASES}. Both rests share this alert: it goes out while the smoke warning is on, and stays only if the other rest also has a detector fault.`,
        },
        { where: 'SD STATUS', text: 'While the alert is shown: FLT REST SMK DET inoperative.' },
      ],
      logbook: { required: true, reason: 'ECAM alert and crew rest smoke detection degraded' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const IFE_CENTERS = [
  {
    name: 'main deck 1L cabin work station',
    smokeAlert: '260800080',
    detFaultAlert: '260800068',
    smokeTitle: 'MAIN 1L CWS',
    inop: 'M1L CWS SMK DET',
  },
  {
    name: 'upper deck 1L cabin work station',
    smokeAlert: '260800082',
    detFaultAlert: '260800070',
    smokeTitle: 'UPPER 1L CWS',
    inop: 'U1L CWS SMK DET',
  },
  {
    name: 'upper deck 3R remote control center',
    smokeAlert: '260800091',
    detFaultAlert: '260800079',
    smokeTitle: 'UPPER 3R RCC',
    inop: 'U3R RCC SMK DET',
  },
] as const;

const IfeControlCenterSmokeFamily: FailureDetailFamily = {
  ids: [A380Failure.MainDeck1LCwsSmoke, A380Failure.UpperDeck1LCwsSmoke, A380Failure.UpperDeck3RRccSmoke],
  detail: (number): FailureDetail => {
    const { name, smokeAlert, smokeTitle } = IFE_CENTERS[number - 1];
    return {
      whatItIs:
        'The cabin work stations and the remote control center hold the cabin control and in-flight entertainment ' +
        'equipment. Each has smoke detectors, read by the smoke detection function.',
      impact: [
        `Smoke appears in the ${name} and its detectors report it.`,
        'The smoke itself changes no system in the model: only the warning follows.',
      ],
      alertIds: [smokeAlert],
      effects: [
        {
          where: 'E/WD',
          text: `SMOKE ${smokeTitle} SMOKE, ${WARNING}, ${REST_SMOKE_PHASES}. ${CABIN_COM_LINE}`,
        },
        { where: 'E/WD', text: SMOKE_HIDDEN },
      ],
      notSimulated: [FAP_NOT_SIMULATED],
      logbook: { required: true, reason: 'red ECAM warning for smoke' },
      clearing: `${MAINTENANCE_ONLY} The warning stays while the smoke is set.`,
    };
  },
};

const IfeControlCenterDetectorFamily: FailureDetailFamily = {
  ids: [
    A380Failure.MainDeck1LCwsSmokeDetector1,
    A380Failure.MainDeck1LCwsSmokeDetector2,
    A380Failure.UpperDeck1LCwsSmokeDetector1,
    A380Failure.UpperDeck1LCwsSmokeDetector2,
    A380Failure.UpperDeck3RRccSmokeDetector1,
    A380Failure.UpperDeck3RRccSmokeDetector2,
  ],
  detail: (number): FailureDetail => {
    const centre = Math.ceil(number / 2);
    const detector = number % 2 === 1 ? 1 : 2;
    const { name, detFaultAlert, smokeTitle, inop } = IFE_CENTERS[centre - 1];
    return {
      whatItIs:
        'Each cabin work station and the remote control center has two smoke detectors. The smoke detection function ' +
        'compares them and reports a detector that does not work.',
      impact: [`Detector ${detector} of the ${name} fails.`, DETECTOR_DUAL_IMPACT],
      alertIds: [detFaultAlert],
      effects: [
        {
          where: 'E/WD',
          text: `SMOKE ${smokeTitle} DET FAULT, ${ADVISORY}, ${DET_FAULT_PHASES}. ${CABIN_COM_LINE} ${DET_FAULT_GOES_OUT}`,
        },
        { where: 'SD STATUS', text: `While the alert is shown: ${inop} inoperative.` },
      ],
      logbook: { required: true, reason: 'ECAM alert and smoke detection degraded' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const AftLowerRestDetectorFamily: FailureDetailFamily = {
  ids: [A380Failure.AftLowerCabinCrewRestSmokeDetector1, A380Failure.AftLowerCabinCrewRestSmokeDetector2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The aft lower deck cabin crew rest compartment has two smoke detectors. The smoke detection function compares ' +
      'them and reports a detector that does not work.',
    impact: [`Detector ${number} of the aft lower deck cabin crew rest fails.`, DETECTOR_DUAL_IMPACT],
    alertIds: ['260800056'],
    effects: [
      {
        where: 'E/WD',
        text: `SMOKE AFT LWR CAB REST DET FAULT, ${ADVISORY}, ${DET_FAULT_PHASES}. ${DET_FAULT_GOES_OUT}`,
      },
      { where: 'SD STATUS', text: 'While the alert is shown: AFT LWR REST SMK DET inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM alert and crew rest smoke detection degraded' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata26SmokeCabinEntries: Record<number, FailureDetail> = {
  [A380Failure.AftLowerCabinCrewRestSmoke]: {
    whatItIs:
      'The aft lower deck cabin crew rest compartment has smoke detectors and two fire extinguisher bottles. The smoke ' +
      'detection function compares the detectors and raises the warning.',
    impact: [
      'Smoke appears in the aft lower deck cabin crew rest and the detectors report it.',
      'The smoke itself changes no system in the model: only the warning follows.',
    ],
    alertIds: ['260800057'],
    effects: [
      {
        where: 'E/WD',
        text:
          `SMOKE AFT LWR CAB REST SMOKE, ${WARNING}, ${REST_SMOKE_PHASES}. It asks for CAB FANS OFF, then to ` +
          'establish CKPT / CABIN COM, and to consider landing as soon as possible if the fire persists.',
      },
      {
        where: 'SD COND',
        text: 'The page comes up with the alert when it is the first one on the E/WD and no page is selected. Nothing on it shows the rest smoke.',
      },
      { where: 'SD STATUS', text: 'While the alert is shown: ALL PRIMARY CAB FANS inoperative.' },
      { where: 'E/WD', text: SMOKE_HIDDEN },
    ],
    notSimulated: [
      'The ventilation shut-off valves of the compartment do not close, and the aural and visual warnings in the compartment are not modelled.',
    ],
    logbook: { required: true, reason: 'red ECAM warning for smoke' },
    clearing: `${MAINTENANCE_ONLY} The warning stays while the smoke is set, even with CAB FANS OFF.`,
  },
};

export const Ata26SmokeCabinFamilies: FailureDetailFamily[] = [
  LavatorySmokeFamily,
  LavatoryDetectorFamily,
  FlightCrewRestSmokeFamily,
  FlightCrewRestDetectorFamily,
  AftLowerRestDetectorFamily,
  IfeControlCenterSmokeFamily,
  IfeControlCenterDetectorFamily,
];
