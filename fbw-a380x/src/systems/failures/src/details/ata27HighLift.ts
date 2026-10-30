// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

type SeenEffect = FailureDetail['effects'][number];

/** Alerts inhibited in flight phases 3 to 7 and 9 to 11 (the control unit faults) */
const NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the engines are ' +
  'shut down';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 (the FLAPS lever and single system faults) */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 (the dual system faults) */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** Alerts inhibited in flight phases 4 to 6 (lever out of detent) */
const NOT_SHOWN_PHASES_4_TO_6 = 'a new alert is not shown from 80 kt on take-off to 400 ft';

/** Alerts inhibited in flight phases 4 to 7 and 10 (the locked surfaces) */
const NOT_SHOWN_PHASES_4_TO_7_AND_10 = 'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor at touch-down';

/** Alerts inhibited in flight phases 3 to 7 (BTV FAULT) */
const NOT_SHOWN_PHASES_3_TO_7 = 'a new alert is not shown from take-off power to 1,500 ft';

/** The maintenance reminders are inhibited in flight phases 2 to 11 */
const NOT_SHOWN_PHASES_2_TO_11 =
  'only with the engines off on electrical power, or with the engines shut down after landing';

const SD_FCTL_CALL_UP: SeenEffect = {
  where: 'SD F/CTL',
  text:
    'The page is called up when the alert first appears, unless the crew selected another page. Its SLATS and FLAPS ' +
    'computer boxes are drawn without any fault mark.',
};

/** BRAKES BTV FAULT, raised by the FCDC when both slat systems or both flap systems are lost, or the slats are locked */
const BTV_FAULT_ALERT = '320800014';

const btvFaultEffect = (cause: string): SeenEffect => ({
  where: 'E/WD',
  text:
    `${cause}, the FCDC reports the BTV lost and BRAKES BTV FAULT also appears, ${CAUTION}, with engines 2 and 3 ` +
    `running; ${NOT_SHOWN_PHASES_3_TO_7}.`,
});

const PFD_SPEEDS_AS_LEVER_ZERO =
  'The flight control computers read no lever position, so VLS, the green dot, S and F on the speed scale are computed as for FLAPS lever 0, whatever the slats and flaps.';

const SINGLE_SYSTEM_NOT_SIMULATED =
  'The real aircraft also lists FLAPS (SLATS) SLOW in the limitations and CAT 3 DUAL as inoperative with CAT 3 SINGLE ONLY as information.';

const STATUS_LINE_STAYS =
  'This line does not depend on the alert and stays when the alert is held back by the flight phase.';

const SPD_LIM_NOT_SIMULATED =
  'With both slat systems or both flap systems lost, the real PFD shows SPD LIM and removes VLS, S, F, the green dot and VFE next. Here the speed scale stays.';

const SD_COMPUTER_BOX_NOT_SIMULATED = (surfaces: 'FLAPS' | 'SLATS'): string =>
  `The real SD page shows the failed ${surfaces} computer in amber.`;

const ALTERNATE_LAW_NOT_SIMULATED =
  'The real aircraft goes to alternate law when both slat systems or both flap systems are lost, or when slats or ' +
  'flaps are locked. The control law is not changed here.';

/** What follows when both flap systems or both slat systems are lost, whether by channels or by control units */
const bothSystemsLostEffects = (surfaces: 'flap' | 'slat', cause: string): SeenEffect[] => {
  const flaps = surfaces === 'flap';
  const noun = flaps ? 'FLAPS' : 'SLATS';
  return [
    {
      where: 'E/WD',
      text:
        `${cause}, F/CTL ${noun.slice(0, -1)} SYS 1+2 FAULT replaces the single alerts, ${CAUTION}; ` +
        `${NOT_SHOWN_PHASES_4_TO_7_9_10}. Its lines include FOR VFE : USE PFD, USE SELECTED SPEED, ` +
        'FOR LDG : FLAP LVR 3, NO AUTOLAND, FOR GA : KEEP S/F CONF and LDG PERF AFFECTED, ' +
        (flaps
          ? 'TAWS FLAP MODE OFF while the lever is below 3, and the fuel and FMS prediction lines while the flaps are not retracted.'
          : 'the fuel and FMS prediction lines while the slats are not retracted, and SLATS 1 RESET in the emergency electrical configuration.'),
    },
    {
      where: 'E/WD',
      text:
        `The approach and landing column of LIMITATIONS lists ${noun} SLOW and LDG PERF AFFECTED (the FCDC raises the ` +
        'second one, not with the engines off on the ground). These limitations come from the lost systems, not from the alert.',
    },
    {
      where: 'SD STATUS',
      text:
        `${noun} is listed as inoperative for approach and landing, in place of the single system lines, and so is ` +
        'BTV, in flight or on the ground with engines running on both sides.',
    },
  ];
};

const SLAT_FLAP_DESCRIPTION =
  'Each of the two slat and flap control computers (SFCC) holds a slat control unit and a flap control unit. Each ' +
  'control unit monitors its surfaces and controls the motor and the power-off brake of its own system, and ' +
  'a gearbox adds the speed of the two motors of a surface group.';

// ---------------------------------------------------------------------------------------------------------------------
// Flap and slat control units
// ---------------------------------------------------------------------------------------------------------------------

const FLAP_CONTROL_UNIT_ALERTS = ['272800004', '272800005'] as const;
const FLAP_SYSTEM_BOTH_ALERT = '272800008';

const flapControlUnitDetail = (number: number): FailureDetail => ({
  whatItIs:
    `${SLAT_FLAP_DESCRIPTION} The flap control unit ${number} drives the flap motor of flap system ${number} ` +
    `(${number === 1 ? 'green' : 'yellow'} hydraulic). If the other flap control unit fails, it also drives that ` +
    'motor, so the flaps keep their normal speed.',
  impact: [
    `Flap control unit ${number} is lost. The other flap control unit drives both flap motors, so the flaps keep their normal speed.`,
    'The flap wing tip brakes need both control units to detect an asymmetry, so they cannot lock the flaps while one unit is lost.',
    'With both flap control units lost nobody drives the flap motors: the flaps stop where they are. The slats still work.',
  ],
  alertIds: [FLAP_CONTROL_UNIT_ALERTS[number - 1], FLAP_SYSTEM_BOTH_ALERT, BTV_FAULT_ALERT],
  effects: [
    {
      where: 'E/WD',
      text: `F/CTL FLAP CTL ${number} FAULT appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
    },
    {
      where: 'SD STATUS',
      text:
        'While the alert is shown, CAT 3 DUAL is listed as inoperative for approach and landing and CAT 3 SINGLE ONLY ' +
        'as information.',
    },
    SD_FCTL_CALL_UP,
    ...bothSystemsLostEffects('flap', 'With both flap control units failed'),
    {
      where: 'PFD',
      text:
        'With both flap control units failed, the flap index and its line on the slat and flap scale turn amber (the ' +
        'PFD reads SFCC 1 only).',
    },
    btvFaultEffect('With both flap control units failed'),
  ],
  notSimulated: [ALTERNATE_LAW_NOT_SIMULATED, SPD_LIM_NOT_SIMULATED, SD_COMPUTER_BOX_NOT_SIMULATED('FLAPS')],
  logbook: { required: true, reason: 'advisory, flap control redundancy lost' },
  clearing: MAINTENANCE_ONLY,
});

const FlapControlUnitFamily: FailureDetailFamily = {
  ids: [A380Failure.Sfcc1FlapControlUnit, A380Failure.Sfcc2FlapControlUnit],
  detail: flapControlUnitDetail,
};

const SLAT_CONTROL_UNIT_ALERTS = ['272800019', '272800020'] as const;
const SLAT_SYSTEM_BOTH_ALERT = '272800023';

const slatControlUnitDetail = (number: number): FailureDetail => ({
  whatItIs:
    `${SLAT_FLAP_DESCRIPTION} The slat control unit ${number} drives the slat motor of slat system ${number}. If the ` +
    'other slat control unit fails, it also drives that motor, so the slats keep their normal speed.',
  impact: [
    `Slat control unit ${number} is lost. The other slat control unit drives both slat motors, so the slats keep their normal speed.`,
    'The slat wing tip brakes need both control units to detect an asymmetry, so they cannot lock the slats while one unit is lost.',
    'With both slat control units lost nobody drives the slat motors: the slats stop where they are. The flaps still work.',
  ],
  alertIds: [SLAT_CONTROL_UNIT_ALERTS[number - 1], SLAT_SYSTEM_BOTH_ALERT, BTV_FAULT_ALERT],
  effects: [
    {
      where: 'E/WD',
      text: `F/CTL SLAT CTL ${number} FAULT appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
    },
    {
      where: 'SD STATUS',
      text:
        'While the alert is shown, CAT 3 DUAL is listed as inoperative for approach and landing and CAT 3 SINGLE ONLY ' +
        'as information.',
    },
    SD_FCTL_CALL_UP,
    ...bothSystemsLostEffects('slat', 'With both slat control units failed'),
    {
      where: 'PFD',
      text:
        'With both slat control units failed, the slat index and its line on the slat and flap scale turn amber (the ' +
        'PFD reads SFCC 1 only).',
    },
    btvFaultEffect('With both slat control units failed'),
  ],
  notSimulated: [ALTERNATE_LAW_NOT_SIMULATED, SPD_LIM_NOT_SIMULATED, SD_COMPUTER_BOX_NOT_SIMULATED('SLATS')],
  logbook: { required: true, reason: 'advisory, slat control redundancy lost' },
  clearing: MAINTENANCE_ONLY,
});

const SlatControlUnitFamily: FailureDetailFamily = {
  ids: [A380Failure.Sfcc1SlatControlUnit, A380Failure.Sfcc2SlatControlUnit],
  detail: slatControlUnitDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// Flap and slat channels (the system loses its motor control)
// ---------------------------------------------------------------------------------------------------------------------

const FLAP_SYSTEM_ALERTS = ['272800006', '272800007'] as const;

// Own entries: the PFD reads SFCC 1 only, so channel 1 differs from channel 2
const flapChannelDetail = (number: number): FailureDetail => ({
  whatItIs:
    'Each SFCC drives its flap system through a flap channel, with one motor of the flap gearbox and a power-off ' +
    `brake that holds the transmission. Flap system ${number} uses the ${number === 1 ? 'green' : 'yellow'} ` +
    'hydraulic motor. The gearbox adds the speed of the two motors, so the flaps run at half speed with one motor.',
  impact: [
    `Flap system ${number} stops driving its motor. The flaps move with the other motor only, at half speed.`,
    'The slats and the control units are not affected.',
    'With both flap systems lost the flaps cannot be moved. The slats still work.',
  ],
  alertIds: [FLAP_SYSTEM_ALERTS[number - 1], FLAP_SYSTEM_BOTH_ALERT, BTV_FAULT_ALERT],
  effects: [
    {
      where: 'E/WD',
      text: `F/CTL FLAP SYS ${number} FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is FLAPS SLOW.`,
    },
    {
      where: 'SD STATUS',
      text: `FLAP SYS ${number} is listed as inoperative for approach and landing. ${STATUS_LINE_STAYS}`,
    },
    SD_FCTL_CALL_UP,
    ...bothSystemsLostEffects('flap', 'With both flap systems failed'),
    ...(number === 1
      ? [
          {
            where: 'PFD',
            text:
              'The flap index and its line on the slat and flap scale turn amber (the PFD reads SFCC 1 only). The ' +
              'failure of flap system 2 does not change the PFD.',
          },
        ]
      : []),
    btvFaultEffect('With both flap systems failed'),
  ],
  notSimulated: [SINGLE_SYSTEM_NOT_SIMULATED, ALTERNATE_LAW_NOT_SIMULATED, SPD_LIM_NOT_SIMULATED],
  logbook: { required: true, reason: 'caution, flaps at half speed' },
  clearing: MAINTENANCE_ONLY,
});

const SLAT_SYSTEM_ALERTS = ['272800021', '272800022'] as const;

const slatChannelDetail = (number: number): FailureDetail => ({
  whatItIs:
    'Each SFCC drives its slat system through a slat channel, with one motor of the slat gearbox and a power-off ' +
    `brake that holds the transmission. Slat system ${number} uses the ${number === 1 ? 'electrical' : 'green hydraulic'} ` +
    'motor. The gearbox adds the speed of the two motors, so the slats run at half speed with one motor.',
  impact: [
    `Slat system ${number} stops driving its motor. The slats move with the other motor only, at half speed.`,
    'The flaps and the control units are not affected.',
    'With both slat systems lost the slats cannot be moved. The flaps still work.',
  ],
  alertIds: [SLAT_SYSTEM_ALERTS[number - 1], SLAT_SYSTEM_BOTH_ALERT, BTV_FAULT_ALERT],
  effects: [
    {
      where: 'E/WD',
      text: `F/CTL SLAT SYS ${number} FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is SLATS SLOW.`,
    },
    {
      where: 'SD STATUS',
      text: `SLAT SYS ${number} is listed as inoperative for approach and landing. ${STATUS_LINE_STAYS}`,
    },
    SD_FCTL_CALL_UP,
    ...bothSystemsLostEffects('slat', 'With both slat systems failed'),
    ...(number === 1
      ? [
          {
            where: 'PFD',
            text:
              'The slat index and its line on the slat and flap scale turn amber (the PFD reads SFCC 1 only). The ' +
              'failure of slat system 2 does not change the PFD.',
          },
        ]
      : []),
    btvFaultEffect('With both slat systems failed'),
  ],
  notSimulated: [
    SINGLE_SYSTEM_NOT_SIMULATED,
    SPD_LIM_NOT_SIMULATED,
    'The real slat system 1 motor is electrical on AC ESS; here both slat motors run on the green hydraulic system.',
    ALTERNATE_LAW_NOT_SIMULATED,
  ],
  logbook: { required: true, reason: 'caution, slats at half speed' },
  clearing: MAINTENANCE_ONLY,
});

// ---------------------------------------------------------------------------------------------------------------------
// FLAPS lever
// ---------------------------------------------------------------------------------------------------------------------

const FLAPS_LEVER_SYS_ALERTS = ['272800014', '272800015'] as const;

// Own entries: the PFD reads SFCC 1 only, so link 1 differs from link 2
const flapsLeverLinkDetail = (number: number): FailureDetail => ({
  whatItIs:
    'The FLAPS lever has a sensor unit that gives the lever position to each SFCC over its own link. An SFCC needs ' +
    'the lever position to build the flap configuration and to drive its slat and flap systems.',
  impact: [
    `SFCC ${number} no longer receives the FLAPS lever position: its slat and flap systems stop driving their motors.`,
    'The other SFCC moves slats and flaps at half speed, and gives the flap configuration alone.',
    'With both links lost the slats and flaps cannot be moved and both alerts show.',
  ],
  alertIds: [FLAPS_LEVER_SYS_ALERTS[number - 1]],
  effects: [
    {
      where: 'E/WD',
      text:
        `F/CTL FLAPS LEVER SYS ${number} FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its lines are ` +
        'SLATS SLOW and FLAPS SLOW.',
    },
    {
      where: 'E/WD',
      text: 'While the alert is shown, LIMITATIONS lists SLATS SLOW and FLAPS SLOW.',
    },
    {
      where: 'SD STATUS',
      text: `While the alert is shown, FLAP SYS ${number} and SLAT SYS ${number} are listed as inoperative.`,
    },
    SD_FCTL_CALL_UP,
    ...(number === 1
      ? [
          {
            where: 'PFD',
            text:
              'The lever number beside the slat and flap scale goes blank, and the scale is drawn even with slats and ' +
              'flaps retracted, because the lower area takes the lever position from SFCC 1 only.',
          },
        ]
      : [
          {
            where: 'PFD',
            text: PFD_SPEEDS_AS_LEVER_ZERO,
          },
        ]),
  ],
  logbook: { required: true, reason: 'caution, slats and flaps at half speed' },
  clearing: `${MAINTENANCE_ONLY} The SFCC receives the lever position again straight away.`,
});

const FlapsLeverJammedDetail: FailureDetail = {
  whatItIs:
    'The FLAPS lever has fixed detents, one for each slat and flap configuration. The SFCCs read its position and ' +
    'report the lever as out of detent when it stays between two detents.',
  impact: [
    'The SFCCs read the lever as between two detents and keep the last flap configuration, whatever the lever does.',
    'The slats and flaps stay at (or finish moving to) the last configuration until the failure is cleared; then they go to the configuration of the lever.',
  ],
  alertIds: ['272800013'],
  effects: [
    {
      where: 'E/WD',
      text:
        `F/CTL FLAPS LEVER OUT OF DETENT appears 10 s after the failure is set, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_6}. ` +
        'It has no procedure line and no STATUS line.',
    },
    {
      where: 'PFD',
      text:
        'The lever number beside the slat and flap scale goes blank, and the scale is drawn even with slats and ' +
        'flaps retracted, because both SFCCs read the lever out of detent.',
    },
    {
      where: 'PFD',
      text: PFD_SPEEDS_AS_LEVER_ZERO,
    },
  ],
  notSimulated: [
    'The lever itself is not blocked: it still moves in the cockpit, only the SFCCs read it as out of detent.',
  ],
  logbook: { required: true, reason: 'caution, lever read out of detent' },
  clearing: `${MAINTENANCE_ONLY} The SFCCs follow the lever again straight away.`,
};

// ---------------------------------------------------------------------------------------------------------------------
// Transmission asymmetry (wing tip brakes)
// ---------------------------------------------------------------------------------------------------------------------

const transmissionAsymmetryDetail = (surfaces: 'flaps' | 'slats'): FailureDetail => {
  const flaps = surfaces === 'flaps';
  const surfaceNoun = flaps ? 'flaps' : 'slats';
  const otherNoun = flaps ? 'slats' : 'flaps';
  const alertTitle = flaps ? 'FLAPS LOCKED' : 'SLATS LOCKED';
  return {
    whatItIs:
      `The ${surfaceNoun} are driven by a torque shaft that runs along both wings. A wing tip brake at the end of ` +
      `each wing locks the shaft, and so the ${surfaceNoun}, in case of runaway, overspeed or asymmetry between the ` +
      'wings. The brakes lock only if both control units of these surfaces detect the problem, and they cannot be ' +
      'released in flight.',
    impact: [
      `The failure is an asymmetry between the two wings. Nothing happens until the control units drive the ${surfaceNoun}: ` +
        `then the wing tip brakes lock them where they are, whatever the lever position. The ${otherNoun} keep working.`,
      'The lock holds in flight even after the failure is cleared. It is released on the ground once the failure is cleared.',
      `With one ${surfaceNoun.slice(0, -1)} control unit failed the brakes do not engage.`,
    ],
    alertIds: flaps ? ['272800016'] : ['272800024', BTV_FAULT_ALERT],
    effects: [
      {
        where: 'E/WD',
        text:
          `F/CTL ${alertTitle} appears when the brakes engage, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_AND_10}. Its lines are ` +
          'FOR VFE : USE PFD, USE SELECTED SPEED and LDG PERF AFFECTED.',
      },
      {
        where: 'E/WD',
        text:
          'While the alert is shown, the approach and landing column of LIMITATIONS lists FOR LDG : FLAP LVR 3, ' +
          'NO AUTOLAND and LDG PERF AFFECTED.',
      },
      {
        where: 'SD STATUS',
        text:
          `While the alert is shown, ${flaps ? 'FLAPS' : 'SLATS'}, BTV, CAT 2 and GLS AUTOLAND are listed as ` +
          'inoperative for approach and landing, and FUEL CONSUMPT INCRSD : FMS PRED DISREGARD and FOR GA : ' +
          'MAINTAIN S/F CONF as information.',
      },
      SD_FCTL_CALL_UP,
      {
        where: 'PFD',
        text:
          `The ${surfaceNoun} stop. When the lever is moved, its number beside the scale stays boxed in cyan, because the ${surfaceNoun} ` +
          'never reach it.',
      },
      ...(flaps ? [] : [btvFaultEffect('With the slats locked')]),
    ],
    notSimulated: [ALTERNATE_LAW_NOT_SIMULATED],
    logbook: { required: true, reason: `caution, ${surfaceNoun} locked` },
    clearing:
      `${MAINTENANCE_ONLY} In flight the brakes stay engaged and the alert stays. On the ground the brakes release ` +
      'once the failure is cleared.',
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Overdue maintenance tests
// ---------------------------------------------------------------------------------------------------------------------

const FLAP_SAFETY_TEST_ALERTS = ['272800009', '272800010'] as const;
const SLAT_SAFETY_TEST_ALERTS = ['272800011', '272800012'] as const;

const safetyTestDetail = (surfaces: 'flap' | 'slat', number: number): FailureDetail => {
  const alerts = surfaces === 'flap' ? FLAP_SAFETY_TEST_ALERTS : SLAT_SAFETY_TEST_ALERTS;
  const title = `F/CTL ${surfaces.toUpperCase()} ${number} SAFETY TEST REQUIRED`;
  return {
    whatItIs:
      `The maintenance computer runs an automatic internal safety test of the SFCC ${number} ${surfaces} channel on the ground. It finds ` +
      'internal faults that the continuous monitoring cannot see. When the test has not run for 150 operating hours, ' +
      'the crew is asked for it.',
    impact: [
      `A reminder only: the ${surfaces} system keeps working normally.`,
      'The test has to be done by maintenance.',
    ],
    alertIds: [alerts[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `${title} appears, ${ADVISORY}, ${NOT_SHOWN_PHASES_2_TO_11}. It has no procedure line and no STATUS line, and ` +
          'no page is called up.',
      },
    ],
    notSimulated: ['The automatic safety test and the operating hours counter are not simulated.'],
    logbook: { required: true, reason: 'advisory, safety test required' },
    clearing: MAINTENANCE_ONLY,
  };
};

const SafetyTestFlapFamily: FailureDetailFamily = {
  ids: [A380Failure.Sfcc1FlapSafetyTestOverdue, A380Failure.Sfcc2FlapSafetyTestOverdue],
  detail: (number) => safetyTestDetail('flap', number),
};

const SafetyTestSlatFamily: FailureDetailFamily = {
  ids: [A380Failure.Sfcc1SlatSafetyTestOverdue, A380Failure.Sfcc2SlatSafetyTestOverdue],
  detail: (number) => safetyTestDetail('slat', number),
};

const wingTipBrakeTestDetail = (surfaces: 'flaps' | 'slats'): FailureDetail => {
  const flaps = surfaces === 'flaps';
  return {
    whatItIs:
      `The SFCCs test the wing tip brakes of the ${surfaces} automatically at the end of each flight, when the ` +
      'aircraft speed is below 80 kt after landing. The test lasts 10 s and is stopped if the FLAPS lever is moved. ' +
      `When it has not been done for ${flaps ? '10' : '5'} days, the crew is asked for it.`,
    impact: [
      `A reminder only: the ${surfaces} work normally and the wing tip brakes keep their protection.`,
      'The test has to be done by maintenance.',
    ],
    alertIds: [flaps ? '272800027' : '272800025'],
    effects: [
      {
        where: 'E/WD',
        text:
          `F/CTL ${flaps ? 'FLAPS' : 'SLATS'} TIP BRK TEST REQUIRED appears, ${ADVISORY}, ${NOT_SHOWN_PHASES_2_TO_11}. It ` +
          'has no procedure line and no STATUS line, and no page is called up.',
      },
    ],
    notSimulated: ['The automatic wing tip brake test after landing and its day counter are not simulated.'],
    logbook: { required: true, reason: 'advisory, tip brake test required' },
    clearing: MAINTENANCE_ONLY,
  };
};

export const Ata27HighLiftEntries: Record<number, FailureDetail> = {
  [A380Failure.Sfcc1FlapChannel]: flapChannelDetail(1),
  [A380Failure.Sfcc2FlapChannel]: flapChannelDetail(2),
  [A380Failure.Sfcc1SlatChannel]: slatChannelDetail(1),
  [A380Failure.Sfcc2SlatChannel]: slatChannelDetail(2),
  [A380Failure.FlapsLeverLinkToSfcc1]: flapsLeverLinkDetail(1),
  [A380Failure.FlapsLeverLinkToSfcc2]: flapsLeverLinkDetail(2),
  [A380Failure.FlapsLeverJammedOutOfDetent]: FlapsLeverJammedDetail,
  [A380Failure.FlapTransmissionAsymmetry]: transmissionAsymmetryDetail('flaps'),
  [A380Failure.SlatTransmissionAsymmetry]: transmissionAsymmetryDetail('slats'),
  [A380Failure.FlapWingTipBrakeTestOverdue]: wingTipBrakeTestDetail('flaps'),
  [A380Failure.SlatWingTipBrakeTestOverdue]: wingTipBrakeTestDetail('slats'),
};

export const Ata27HighLiftFamilies: FailureDetailFamily[] = [
  FlapControlUnitFamily,
  SlatControlUnitFamily,
  SafetyTestFlapFamily,
  SafetyTestSlatFamily,
];
