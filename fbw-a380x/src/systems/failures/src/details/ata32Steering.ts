// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

const SD_WHEEL_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

const STATUS_NOTE = 'while the alert is shown';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const FOR_APPROACH_AND_LANDING = 'for approach and landing';

/** Alerts inhibited in flight phases 3 to 7, 9, 10 and 11 (shown in phases 1, 2, 8 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_9_10_11 =
  'a new alert shows only on the ground before take-off thrust is set, in flight above 800 ft (climb above 1,500 ft, ' +
  'cruise and descent) and after the engines are shut down';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 (shown in phases 1, 2, 8, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 3 to 7 and 10 (shown in phases 1, 2, 8, 9, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_AND_10 = 'a new alert is not shown from take-off power to 1,500 ft, nor at touch-down';

/** Alerts inhibited in flight phases 4 to 7 */
const NOT_SHOWN_PHASES_4_TO_7 = 'a new alert is not shown from 80 kt on take-off until 1,500 ft';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** Alerts inhibited in flight phases 4 to 7 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_AND_10 = 'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor at touch-down';

/** Alerts inhibited in flight phases 3 to 10 (shown in phases 1, 2, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_10 =
  'a new alert shows only on the ground: before take-off thrust is set, once below 80 kt after landing and after ' +
  'the engines are shut down';

/** Alerts inhibited in flight phases 3 to 12 (shown in phases 1 and 2) */
const NOT_SHOWN_PHASES_3_TO_12 = 'a new alert shows only before take-off thrust is set on the ground';

// ---------------------------------------------------------------------------------------------------------------------
// Nose wheel steering and body wheel steering equipment
// ---------------------------------------------------------------------------------------------------------------------

const normalNoseWheelSteering: FailureDetail = {
  whatItIs:
    'The normal nose wheel steering turns the nose wheels with the green hydraulic system. The steering control ' +
    'system turns the tiller, rudder pedal and autopilot orders into a nose wheel angle at up to 15 degrees per second.',
  impact: [
    'The normal steering is cut off; with an engine running the alternate steering takes over automatically.',
    'The alternate steering turns the nose wheels slower, at up to 10 degrees per second.',
    'With the alternate steering failed too, no nose wheel steering is left.',
  ],
  alertIds: ['320800060', '320800058', '320800055'],
  effects: [
    {
      where: 'E/WD',
      text:
        `STEER NORM N/W STEER FAULT, ${CAUTION}, with the alternate steering healthy; ${NOT_SHOWN_PHASES_3_TO_7_AND_10}; ` +
        `${ALREADY_SHOWN_STAYS}. The line FOR TAXI : STEER ENDURANCE LIMITED is part of the alert.`,
    },
    {
      where: 'E/WD',
      text:
        'With the alternate steering failed as well, STEER N/W STEER FAULT replaces it, ' +
        `${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}. With the body wheel steering failed too, STEER N/W + B/W STEER FAULT ` +
        `replaces it, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}.`,
    },
    {
      where: 'SD STATUS',
      text:
        `The limitation STEER ENDUR LIMITED and the inoperative system NORM N/W STEER are listed ${FOR_APPROACH_AND_LANDING}, ` +
        'with the alternate steering healthy. With the alternate steering failed too, N/W STEER and CAT 3 DUAL are listed in all phases ' +
        'with the information CAT 3 SINGLE ONLY; with the body wheel steering failed as well, N/W + B/W STEER and CAT 3 DUAL ' +
        `are listed ${FOR_APPROACH_AND_LANDING} with the same information, ${STATUS_NOTE}.`,
    },
    { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
  ],
  notSimulated: [
    'The alternate steering never overheats here, so taxi time on it is not limited.',
    'The tiller damping does not increase in alternate steering.',
    'The information B/W STEER AVAIL FOR TOW & PUSHBACK is not shown with N/W STEER FAULT.',
  ],
  logbook: { required: true, reason: 'caution and loss of the normal nose wheel steering' },
  clearing: MAINTENANCE_ONLY,
};

const alternateNoseWheelSteering: FailureDetail = {
  whatItIs:
    'The alternate nose wheel steering is the backup of the normal steering. It runs on the local electro-hydraulic ' +
    'generation system of the steering, which has its own reservoir, and is selected automatically when the green ' +
    'system cannot steer the nose wheels.',
  impact: [
    'While the normal steering works nothing changes: the alternate steering is only a backup.',
    'If the green system loses its pressure, no backup is left and the nose wheels caster.',
    'With the normal steering failed too, no nose wheel steering is left.',
  ],
  alertIds: ['320800047', '320800058', '320800055'],
  effects: [
    {
      where: 'E/WD',
      text:
        `STEER ALTN N/W STEER FAULT, ${ADVISORY}, with the normal steering healthy; ${NOT_SHOWN_PHASES_3_TO_7_9_10_11}; ` +
        `${ALREADY_SHOWN_STAYS}. It has no STATUS line.`,
    },
    {
      where: 'E/WD',
      text:
        'With the normal steering failed as well, STEER N/W STEER FAULT replaces it, ' +
        `${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}. With the body wheel steering failed too, STEER N/W + B/W STEER FAULT ` +
        `replaces it, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}.`,
    },
    {
      where: 'SD STATUS',
      text:
        'With both nose wheel steerings failed, N/W STEER and CAT 3 DUAL are listed as inoperative in all phases, ' +
        'with the information CAT 3 SINGLE ONLY; with the body wheel steering failed as well, N/W + B/W STEER and ' +
        `CAT 3 DUAL are listed ${FOR_APPROACH_AND_LANDING} with the same information, ${STATUS_NOTE}.`,
    },
    { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
  ],
  notSimulated: ['The information B/W STEER AVAIL FOR TOW & PUSHBACK is not shown with N/W STEER FAULT.'],
  logbook: { required: true, reason: 'advisory and loss of the backup nose wheel steering' },
  clearing: MAINTENANCE_ONLY,
};

const bodyWheelSteering: FailureDetail = {
  whatItIs:
    'The body wheel steering turns the rear wheels of the two body landing gears below 30 kt, when the nose wheel angle ' +
    'is large, to reduce the loads on the body gears in turns. It runs on the yellow hydraulic system and is also used ' +
    'during pushback and towing.',
  impact: [
    'The body wheels stay centred and locked; they no longer follow the nose wheel angle.',
    'The nose wheel steering is not affected.',
  ],
  alertIds: ['320800049', '320800058', '320800055'],
  effects: [
    {
      where: 'E/WD',
      text:
        `STEER B/W STEER FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. ` +
        'With both nose wheel steerings failed as well, STEER N/W + B/W STEER FAULT replaces it, ' +
        `${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7}.`,
    },
    {
      where: 'SD STATUS',
      text:
        `B/W STEER is listed as inoperative ${FOR_APPROACH_AND_LANDING}. With at least one engine running the ` +
        'information TAXI WITH CARE, AVOID MAX TILLER ANGLE TURN ON WET/CONTAM RWY and NO BRAKED PIVOT TURN shows. ' +
        'With both nose wheel steerings failed as well, N/W + B/W STEER and CAT 3 DUAL are listed ' +
        `${FOR_APPROACH_AND_LANDING} with the information CAT 3 SINGLE ONLY instead, ${STATUS_NOTE}.`,
    },
    { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
  ],
  notSimulated: [
    'Locked body wheels do not increase the turn radius or skid the wheels: the ground handling of the sim does not change.',
  ],
  logbook: { required: true, reason: 'advisory and loss of the body wheel steering' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// Steering control systems
// ---------------------------------------------------------------------------------------------------------------------

const steeringControlSystemDetail = (number: number): FailureDetail => {
  const other = number === 1 ? 2 : 1;
  return {
    whatItIs:
      'The two steering control systems are the computers of the nose wheel and body wheel steering. One is active and ' +
      'the other is a backup; they choose the nose wheel steering mode and enable the body wheel steering.',
    impact: [
      `Steering control system ${number} is lost; system ${other} takes over, so steering and the body wheels keep working.`,
      `With system ${other} failed too, no nose wheel steering and no body wheel steering are left.`,
    ],
    alertIds: [number === 1 ? '320800053' : '320800054', '320800055'],
    effects: [
      {
        where: 'E/WD',
        text:
          `STEER CTL ${number} FAULT, ${ADVISORY}, with system ${other} healthy; ${NOT_SHOWN_PHASES_3_TO_7_9_10_11}; ` +
          `${ALREADY_SHOWN_STAYS}. It has no STATUS line.`,
      },
      {
        where: 'E/WD',
        text:
          `With system ${other} failed as well, STEER N/W + B/W STEER FAULT replaces it, ${CAUTION}; ` +
          `${NOT_SHOWN_PHASES_4_TO_7}.`,
      },
      {
        where: 'SD WHEEL',
        text: `The STEER CTL line appears with ${number} drawn as failed. ${SD_WHEEL_CALL_UP}`,
      },
      {
        where: 'SD STATUS',
        text:
          `With both systems failed, N/W + B/W STEER and CAT 3 DUAL are listed as inoperative ${FOR_APPROACH_AND_LANDING}, ` +
          `with the information CAT 3 SINGLE ONLY, ${STATUS_NOTE}.`,
      },
    ],
    logbook: { required: true, reason: 'advisory and a failed steering control system' },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Body wheel steering locks
// ---------------------------------------------------------------------------------------------------------------------

const bodyWheelLockDetail = (number: number): FailureDetail => {
  const side = number === 1 ? 'left' : 'right';
  return {
    whatItIs:
      `The body wheel steering lock holds the steered axle of the ${side} body gear centred and locked whenever the ` +
      'body wheel steering is not steering. The gear can be retracted only when the axle is centred and locked.',
    impact: [
      `The ${side} body wheel steering is no longer sensed centred and locked.`,
      'The gear retraction is inhibited: with the gears down and locked, a gear lever up leaves them down.',
      'The nose wheel steering and the braking are not affected.',
    ],
    alertIds: ['320800050', '320800044'],
    effects: [
      {
        where: 'E/WD',
        text:
          `STEER B/W STEER NOT LOCKED, ${CAUTION}, with the line B/W STEER NOT CENTERED; ` +
          `${NOT_SHOWN_PHASES_4_TO_7_AND_10}; ${ALREADY_SHOWN_STAYS}. The line NO L/G RETRACTION is added if all the gears ` +
          'were down and locked when the alert came up and at least one engine is running.',
      },
      {
        where: 'E/WD',
        text:
          'After take-off, a gear lever up leaves the gears down and raises L/G RETRACTION FAULT, ' +
          `${CAUTION}; a new alert shows only from lift-off to 1,500 ft, and an alert already shown stays. In flight its lines are ` +
          'MAX SPEED : 250/.55 (or SPEED REDUCE BELOW 250/.55 above that speed), L/G RECYCLE, IF NOT SUCCESSFUL and L/G : KEEP DOWN.',
      },
      {
        where: 'SD STATUS',
        text:
          `B/W STEER is listed as inoperative ${FOR_APPROACH_AND_LANDING}. Under the same condition as the NO L/G RETRACTION line, ` +
          'NO L/G RETRACTION is listed as a limitation. With at least one engine running TAXI WITH CARE, AVOID MAX TILLER ANGLE TURN ' +
          'ON WET/CONTAM RWY and NO BRAKED PIVOT TURN show. With L/G RETRACTION FAULT in flight, the limitations MAX SPEED : 250/.55 ' +
          'and L/G : KEEP DOWN, the inoperative system L/G RETRACTION and, with an engine running, the information FUEL CONSUMPT ' +
          `INCRSD : FMS PRED DISREGARD are listed, ${STATUS_NOTE}.`,
      },
      { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
    ],
    notSimulated: [
      'The axle itself stays centred and locked; only the sensed lock state changes.',
      'A real unlocked body wheel steering can prevent the gear extension or cause shimmy of the body gear after touch-down.',
    ],
    logbook: { required: true, reason: 'caution and an unlocked body wheel steering' },
    clearing:
      'Maintenance only: use Restore. With the gear lever up, the gears retract only after the lever is set down and up again, ' +
      'and L/G RETRACTION FAULT stays until the gears lock up or the aircraft is on the ground.',
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Pedals and tillers
// ---------------------------------------------------------------------------------------------------------------------

const pedalControl: FailureDetail = {
  whatItIs:
    'The rudder pedals steer the nose wheels at low angles, mostly during take-off and landing roll, through the ' +
    'steering control system. The tillers on the side consoles are the main means to steer on the ground.',
  impact: [
    'The steering control system no longer receives the pedal orders: the pedals do not turn the nose wheels.',
    'The tillers still steer, and so does the autopilot roll-out guidance.',
  ],
  alertIds: ['320800061'],
  effects: [
    {
      where: 'E/WD',
      text:
        `STEER PEDAL STEER CTL FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. ` +
        'It has no procedure line.',
    },
    { where: 'SD STATUS', text: `PEDAL STEER CTL is listed as inoperative in all phases, ${STATUS_NOTE}.` },
    { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
  ],
  logbook: { required: true, reason: 'caution and no steering with the rudder pedals' },
  clearing: MAINTENANCE_ONLY,
};

const tillerDetail = (number: number): FailureDetail => {
  const pilot = number === 1 ? 'captain' : 'first officer';
  const label = number === 1 ? 'CAPT' : 'FO';
  return {
    whatItIs:
      `The ${pilot} tiller is the steering handwheel on the ${number === 1 ? 'left' : 'right'} side console. It orders ` +
      'the nose wheel angle for taxi, and through the steering control system also the body wheel steering.',
    impact: [
      `The ${label} tiller is reported faulty.`,
      'The warning is the only change: the tiller still steers the nose wheels.',
    ],
    alertIds: [number === 1 ? '320800051' : '320800052'],
    effects: [
      {
        where: 'E/WD',
        text:
          `STEER ${label} STEER TILLER FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ` +
          `${ALREADY_SHOWN_STAYS}. It has no procedure line.`,
      },
      { where: 'SD STATUS', text: `${label} STEER TILLER is listed as inoperative in all phases, ${STATUS_NOTE}.` },
      { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
    ],
    notSimulated: [`The ${pilot} tiller still turns the nose wheels; the real tiller would not.`],
    logbook: { required: true, reason: `advisory and a faulty ${label} tiller` },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// LEHGS, tow switch and selector valves
// ---------------------------------------------------------------------------------------------------------------------

const lehgsOverheat: FailureDetail = {
  whatItIs:
    'The steering local electro-hydraulic generation system is a small electric pump and reservoir that supply the ' +
    'alternate nose wheel steering. Its fluid temperature is monitored; a high temperature is reported to the crew.',
  impact: [
    'The crew is warned that the alternate nose wheel steering can be lost.',
    'The steering itself is not changed.',
  ],
  alertIds: ['320800048'],
  effects: [
    {
      where: 'E/WD',
      text:
        `STEER ALTN STEER SYS HOT, ${CAUTION}, with the line EXPECT N/W STEER LOSS; ${NOT_SHOWN_PHASES_3_TO_10}; ` +
        `${ALREADY_SHOWN_STAYS}.`,
    },
    { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
  ],
  notSimulated: ['The alternate steering is not lost: the line tells the crew to expect a loss that does not follow.'],
  logbook: { required: true, reason: 'caution with a hot alternate steering system' },
  clearing: MAINTENANCE_ONLY,
};

const noseWheelDisconnection: FailureDetail = {
  whatItIs:
    'For towing, the TOW switch in the towing position depowers the nose wheel steering so the tug can turn the ' +
    'nose wheels. The N/W STEER DISC memo shows while the switch is in the towing position; in the sim the switch is set by the tug pin of the pushback.',
  impact: [
    'With the TOW switch in the towing position the steering is reported as still powered.',
    'The crew is told to shut all engine masters before towing.',
  ],
  alertIds: ['320800057', '320800059'],
  effects: [
    {
      where: 'E/WD',
      text:
        `STEER N/W STEER DISC FAULT, ${CAUTION}, only while the TOW switch is in the towing position; ` +
        `${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. On the ground it shows N/W STEER POWERED and IF TOW : ` +
        'ALL ENG MASTERS OFF; the second line is ticked when all engine masters are off.',
    },
    {
      where: 'E/WD',
      text:
        'During a pushback or tow (sim pushback or GSX), STEER N/W STEER NOT DISC also shows after 3 s, ' +
        `${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_12}. Its lines are N/W STEER POWERED and IF TOW : ALL ENG MASTERS OFF, ticked ` +
        'when all engine masters are off.',
    },
    {
      where: 'SD STATUS',
      text:
        'N/W STEER DISC is listed as inoperative in all phases, and on the ground the information N/W STEER POWERED shows; ' +
        `NOT DISC shows the information N/W STEER POWERED too, ${STATUS_NOTE}.`,
    },
    { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
  ],
  notSimulated: [
    'The nose wheel steering is still disconnected by the TOW switch; the real failure leaves it powered.',
  ],
  logbook: { required: true, reason: 'caution and a nose wheel steering that cannot be disconnected' },
  clearing: MAINTENANCE_ONLY,
};

const selectorValveText = (valve: string, who: string): FailureDetail => ({
  whatItIs:
    `A steering selector valve connects the actuators of the ${who} to their hydraulic source and isolates them when ` +
    'they are not in use. The steering control system commands it open only when it needs that steering.',
  impact: [
    `The ${valve} valve is sensed open while the steering control system commands it closed.`,
    'The warning is the only change: the steering works as before.',
  ],
  alertIds: ['320800062'],
  effects: [],
  logbook: { required: true, reason: 'advisory and a steering selector valve jammed open' },
  clearing: MAINTENANCE_ONLY,
});

const normalSelectorValveJammed: FailureDetail = {
  ...selectorValveText('normal', 'nose wheel steering on the green system'),
  effects: [
    {
      where: 'E/WD',
      text:
        `STEER STEER SEL VLV JAMMED OPEN, ${ADVISORY}, shown whenever the normal steering is not the active mode: engines ` +
        'off, green pressure lost, normal steering failed or both steering control systems failed. ' +
        `${NOT_SHOWN_PHASES_3_TO_10}; ${ALREADY_SHOWN_STAYS}. Lines: N/W STEER POWERED and IF TOW : ALL ENG MASTERS OFF ` +
        '(ticked when all engine masters are off); with the alternate valve jammed too and the alternate steering not active, NO TOWING replaces the second ' +
        'line.',
    },
    { where: 'SD STATUS', text: `The information N/W STEER POWERED shows, ${STATUS_NOTE}.` },
  ],
  notSimulated: [
    'The nose wheel steering stays powered by the valve in the real aircraft; here the steering is unchanged.',
  ],
};

const alternateSelectorValveJammed: FailureDetail = {
  ...selectorValveText('alternate', 'alternate nose wheel steering'),
  effects: [
    {
      where: 'E/WD',
      text:
        `STEER STEER SEL VLV JAMMED OPEN, ${ADVISORY}, shown whenever the alternate steering is not the active mode, ` +
        `so normally at once with the green system healthy. ${NOT_SHOWN_PHASES_3_TO_10}; ${ALREADY_SHOWN_STAYS}. ` +
        'Lines: N/W STEER POWERED and NO TOWING.',
    },
    { where: 'SD STATUS', text: `The information N/W STEER POWERED shows, ${STATUS_NOTE}.` },
  ],
  notSimulated: [
    'The nose wheel steering stays powered by the valve in the real aircraft; here the steering is unchanged.',
  ],
};

const bodyWheelSelectorValveJammed: FailureDetail = {
  ...selectorValveText('body wheel steering', 'body wheel steering'),
  effects: [
    {
      where: 'E/WD',
      text:
        `STEER STEER SEL VLV JAMMED OPEN, ${ADVISORY}, shown whenever the body wheel steering is not needed: in flight, ` +
        'above 30 kt on the ground, or on the ground with the engines off and no towing. ' +
        `${NOT_SHOWN_PHASES_3_TO_10}; ${ALREADY_SHOWN_STAYS}. It shows no procedure line and no STATUS line.`,
    },
  ],
  notSimulated: ['The body wheel steering stays pressurised when it should not; here nothing changes.'],
};

export const Ata32SteeringEntries: Record<number, FailureDetail> = {
  [A380Failure.SteeringNormalNoseWheel]: normalNoseWheelSteering,
  [A380Failure.SteeringAlternateNoseWheel]: alternateNoseWheelSteering,
  [A380Failure.SteeringBodyWheel]: bodyWheelSteering,
  [A380Failure.SteeringPedalControl]: pedalControl,
  [A380Failure.SteeringLehgsOverheat]: lehgsOverheat,
  [A380Failure.SteeringNoseWheelDisconnection]: noseWheelDisconnection,
  [A380Failure.SteeringNormalSelectorValveJammedOpen]: normalSelectorValveJammed,
  [A380Failure.SteeringAlternateSelectorValveJammedOpen]: alternateSelectorValveJammed,
  [A380Failure.SteeringBodyWheelSelectorValveJammedOpen]: bodyWheelSelectorValveJammed,
};

export const Ata32SteeringFamilies: FailureDetailFamily[] = [
  {
    ids: [A380Failure.SteeringControlSystem1, A380Failure.SteeringControlSystem2],
    detail: steeringControlSystemDetail,
  },
  {
    ids: [A380Failure.SteeringBodyWheelLockLeft, A380Failure.SteeringBodyWheelLockRight],
    detail: bodyWheelLockDetail,
  },
  { ids: [A380Failure.SteeringCaptTiller, A380Failure.SteeringFoTiller], detail: tillerDetail },
];
