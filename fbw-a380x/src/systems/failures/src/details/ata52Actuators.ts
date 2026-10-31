// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';

type SeenEffect = FailureDetail['effects'][number];

/** ACTUATOR FAULT and FLIGHT LOCK FAULT: inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** POS DET FAULT: inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

// ---------------------------------------------------------------------------------------------------------------------
// The 16 passenger doors, in the order of the flyPad failures and of the alert ids (door index 0 to 15)
// ---------------------------------------------------------------------------------------------------------------------

const DOOR_NAMES = [
  'MAIN 1L',
  'MAIN 1R',
  'MAIN 2L',
  'MAIN 2R',
  'MAIN 3L',
  'MAIN 3R',
  'MAIN 4L',
  'MAIN 4R',
  'MAIN 5L',
  'MAIN 5R',
  'UPPER 1L',
  'UPPER 1R',
  'UPPER 2L',
  'UPPER 2R',
  'UPPER 3L',
  'UPPER 3R',
] as const;

/** First alert key of each kind; the door index is added */
const ACTUATOR_FAULT_ALERT = 520800101;
const FLIGHT_LOCK_FAULT_ALERT = 520800121;
const POS_DET_FAULT_ALERT = 520800161;

const alertId = (first: number, door: number): string => (first + door).toString();

/** @returns the plain description of a door: 'main deck door 3 on the left side' */
const doorWords = (door: number): string => {
  const name = DOOR_NAMES[door];
  const deck = name.startsWith('MAIN') ? 'main deck' : 'upper deck';
  const number = name.charAt(name.length - 2);
  const side = name.endsWith('L') ? 'left' : 'right';
  return `${deck} door ${number} on the ${side} side`;
};

const SD_DOOR_UNCHANGED: SeenEffect = {
  where: 'SD DOOR',
  text: 'The door symbol does not change: the page shows only the door position and the slide state.',
};

/** What a second detected fault on the same door adds, shared by both kinds */
const posDetEffect = (door: number, secondFault: string): SeenEffect => ({
  where: 'E/WD',
  text:
    `With ${secondFault} detected on the same door, DOOR ${DOOR_NAMES[door]} POS DET FAULT also appears, ${CAUTION}; ` +
    `${NOT_SHOWN_PHASES_4_TO_7_9_10}. Its lines: PACK 1+2 & CAB PRESS NOT AVAIL on the ground before 80 kt on ` +
    'take-off when the cabin pressure system has failed, and in flight the ABNORM CAB V/S lines. Ticking ABNORM ' +
    'CAB V/S in flight adds the MAX FL : 100/MEA-MORA limitation on the E/WD and the PFD. It calls up the SD DOOR ' +
    'page. It does not show when all the door controllers of that side or all three DSMS channels are lost.',
});

const posDetStatusEffect = (door: number): SeenEffect => ({
  where: 'SD STATUS',
  text:
    `While DOOR ${DOOR_NAMES[door]} POS DET FAULT is shown, DOOR ${DOOR_NAMES[door]} is listed as inoperative for ` +
    'approach and landing, and CAB PRESS SYS and PACK 1+2 as inoperative when the first line applies.',
});

const DETECTION_NOTE =
  'The door system only reports a fault on a door it monitors: it reports nothing for a door whose local door ' +
  'controller has failed, or when all three DSMS channels are lost.';

// ---------------------------------------------------------------------------------------------------------------------
// Opening/closing actuators
// ---------------------------------------------------------------------------------------------------------------------

const actuatorDetail = (door: number): FailureDetail => {
  const name = DOOR_NAMES[door];
  return {
    whatItIs:
      `The opening/closing actuator turns the ${doorWords(door)} electrically when the crew presses the OPEN or ` +
      'CLOSE pushbutton; in emergency operation it moves the door automatically. Without electrical power the door ' +
      'can still be moved by hand.',
    impact: [
      `The ${doorWords(door)} can no longer be opened or closed by its actuator and counts as inoperative for evacuation.`,
      'The cabin crew must change their evacuation procedure.',
      'No other system is affected: the door position, locks and slide are unchanged.',
    ],
    alertIds: [alertId(ACTUATOR_FAULT_ALERT, door), alertId(POS_DET_FAULT_ALERT, door)],
    effects: [
      {
        where: 'E/WD',
        text:
          `DOOR ${name} ACTUATOR FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is CABIN CREW ` +
          `ADVISE. ${DETECTION_NOTE}`,
      },
      {
        where: 'SD STATUS',
        text: `While the alert is shown, DOOR ${name} is listed as inoperative for approach and landing.`,
      },
      posDetEffect(door, 'one more fault (flight lock actuator, latch monitoring or slide)'),
      posDetStatusEffect(door),
      SD_DOOR_UNCHANGED,
    ],
    notSimulated: [
      'The door itself still opens and closes in the sim: the powered operation and the emergency operation are not modelled, the failure only raises the alert.',
    ],
    logbook: { required: true, reason: 'caution, door inoperative for evacuation' },
    clearing: MAINTENANCE_ONLY,
  };
};

const ActuatorFamily: FailureDetailFamily = {
  ids: [
    A380Failure.DoorMain1LActuator,
    A380Failure.DoorMain1RActuator,
    A380Failure.DoorMain2LActuator,
    A380Failure.DoorMain2RActuator,
    A380Failure.DoorMain3LActuator,
    A380Failure.DoorMain3RActuator,
    A380Failure.DoorMain4LActuator,
    A380Failure.DoorMain4RActuator,
    A380Failure.DoorMain5LActuator,
    A380Failure.DoorMain5RActuator,
    A380Failure.DoorUpper1LActuator,
    A380Failure.DoorUpper1RActuator,
    A380Failure.DoorUpper2LActuator,
    A380Failure.DoorUpper2RActuator,
    A380Failure.DoorUpper3LActuator,
    A380Failure.DoorUpper3RActuator,
  ],
  detail: (number) => actuatorDetail(number - 1),
};

// ---------------------------------------------------------------------------------------------------------------------
// Flight lock actuators
// ---------------------------------------------------------------------------------------------------------------------

const flightLockDetail = (door: number): FailureDetail => {
  const name = DOOR_NAMES[door];
  return {
    whatItIs:
      `Each door has a flight lock actuator that locks the door handle in flight, so that the ${doorWords(door)} ` +
      'cannot be operated by mistake. It locks the handle from 65 kt in the climb until FL 240, and again below FL ' +
      '240 in the descent. It releases the handle on the ground, and when the door controller fails; a failed actuator can stay locked or unlocked.',
    impact: [
      'The lock stays where it was when it failed: locked if it was locked, unlocked if it was unlocked.',
      'Failed locked, the door handle stays locked, also after landing: the door counts as inoperative for evacuation and the cabin crew must be advised.',
      'Failed unlocked, the lock does not engage in flight: the flight lock of that door is lost.',
    ],
    alertIds: [alertId(FLIGHT_LOCK_FAULT_ALERT, door), alertId(POS_DET_FAULT_ALERT, door)],
    effects: [
      {
        where: 'E/WD',
        text:
          `DOOR ${name} FLIGHT LOCK FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Failed locked, its ` +
          'lines are FLIGHT LOCK ENGAGED and CABIN CREW ADVISE. Failed unlocked, its line is FLIGHT LOCK NOT AVAIL, ' +
          `shown on the ground only: in flight the alert has no line. ${DETECTION_NOTE}`,
      },
      {
        where: 'SD STATUS',
        text:
          `While the alert is shown: failed locked, DOOR ${name} is listed as inoperative for approach and landing; ` +
          `failed unlocked and on the ground, ${name} FLT LOCK is listed as inoperative for all phases.`,
      },
      posDetEffect(door, 'one more fault (opening/closing actuator, latch monitoring or slide)'),
      posDetStatusEffect(door),
      SD_DOOR_UNCHANGED,
    ],
    notSimulated: [
      'The door handle is not really locked: the sim door still opens, only the alert lines tell the crew.',
      'The release of the lock by a cabin differential pressure detection is not simulated.',
      'The real aircraft releases the handle on a failure of the actuator in some cases; here a failed actuator always stays where it was.',
    ],
    logbook: { required: true, reason: 'caution, flight lock fault' },
    clearing: `${MAINTENANCE_ONLY} The lock then follows the speed and altitude again at once.`,
  };
};

const FlightLockFamily: FailureDetailFamily = {
  ids: [
    A380Failure.DoorMain1LFlightLock,
    A380Failure.DoorMain1RFlightLock,
    A380Failure.DoorMain2LFlightLock,
    A380Failure.DoorMain2RFlightLock,
    A380Failure.DoorMain3LFlightLock,
    A380Failure.DoorMain3RFlightLock,
    A380Failure.DoorMain4LFlightLock,
    A380Failure.DoorMain4RFlightLock,
    A380Failure.DoorMain5LFlightLock,
    A380Failure.DoorMain5RFlightLock,
    A380Failure.DoorUpper1LFlightLock,
    A380Failure.DoorUpper1RFlightLock,
    A380Failure.DoorUpper2LFlightLock,
    A380Failure.DoorUpper2RFlightLock,
    A380Failure.DoorUpper3LFlightLock,
    A380Failure.DoorUpper3RFlightLock,
  ],
  detail: (number) => flightLockDetail(number - 1),
};

export const Ata52ActuatorsFamilies: FailureDetailFamily[] = [ActuatorFamily, FlightLockFamily];
