// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const FOR_APPROACH_AND_LANDING = 'for approach and landing';

const STATUS_NOTE = 'while the alert is shown';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 (shown in phases 1, 2, 8, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 (shown in phases 1, 2, 3, 8, 11 and 12) */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** Alerts inhibited in flight phases 3 to 10 (shown in phases 1, 2, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_10 =
  'a new alert shows only on the ground: before take-off thrust is set, once below 80 kt after landing and after ' +
  'the engines are shut down';

/** Alerts inhibited in flight phases 3 to 6 (shown in phases 1, 2 and 7 to 12) */
const NOT_SHOWN_PHASES_3_TO_6 = 'a new alert is not shown from take-off power to 400 ft after lift-off';

const SD_DOOR_CALL_UP = 'The alert calls up the DOOR page when it first appears, unless another page was selected.';

/** The 16 passenger doors in the order of the failure ids (and of the sim interactive points) */
interface PassengerDoor {
  deck: 'MAIN' | 'UPPER';
  number: number;
  side: 'L' | 'R';
}

const PASSENGER_DOORS: PassengerDoor[] = [
  { deck: 'MAIN', number: 1, side: 'L' },
  { deck: 'MAIN', number: 1, side: 'R' },
  { deck: 'MAIN', number: 2, side: 'L' },
  { deck: 'MAIN', number: 2, side: 'R' },
  { deck: 'MAIN', number: 3, side: 'L' },
  { deck: 'MAIN', number: 3, side: 'R' },
  { deck: 'MAIN', number: 4, side: 'L' },
  { deck: 'MAIN', number: 4, side: 'R' },
  { deck: 'MAIN', number: 5, side: 'L' },
  { deck: 'MAIN', number: 5, side: 'R' },
  { deck: 'UPPER', number: 1, side: 'L' },
  { deck: 'UPPER', number: 1, side: 'R' },
  { deck: 'UPPER', number: 2, side: 'L' },
  { deck: 'UPPER', number: 2, side: 'R' },
  { deck: 'UPPER', number: 3, side: 'L' },
  { deck: 'UPPER', number: 3, side: 'R' },
];

const doorName = (door: PassengerDoor): string => `${door.deck} ${door.number}${door.side}`;

// ---------------------------------------------------------------------------------------------------------------------
// Escape slides
// ---------------------------------------------------------------------------------------------------------------------

/** DOOR <door> POS DET FAULT of the first door, + the index of the door (520800161 to 520800176) */
const FIRST_DOOR_POS_DET_FAULT_ALERT = 520800161;
/** DOOR <door> SLIDE FAULT of the first door, + the index of the door (520800181 to 520800196) */
const FIRST_SLIDE_FAULT_ALERT = 520800181;

const slideTypeText = (door: PassengerDoor): string => {
  if (door.deck === 'UPPER') {
    return 'The slide of an upper deck door is built into the fuselage below the door.';
  }
  if (door.number === 3) {
    return 'The slide of the main deck door 3 is built into the belly fairing.';
  }
  return 'The slide of this main deck door is mounted on the door.';
};

const escapeSlideDetail = (position: number): FailureDetail => {
  const door = PASSENGER_DOORS[position - 1];
  const name = doorName(door);
  const index = position - 1;
  const slideFaultAlert = String(FIRST_SLIDE_FAULT_ALERT + index);
  const doorPosDetAlert = String(FIRST_DOOR_POS_DET_FAULT_ALERT + index);
  return {
    whatItIs:
      'Every passenger door has an escape slide that inflates by itself in about 6 s when the door is opened from ' +
      'inside with the slide armed; an arming lever at the door arms or disarms it. ' +
      `${slideTypeText(door)} The doors and slides management system monitors the slide status through the local door ` +
      'controller of the door.',
    impact: [
      `The slide of door ${name} is reported not ready or failed to the crew.`,
      'Nothing is moved in the sim: no slide, arming lever or inflation exists, so the failure only changes the warnings and the DOOR page.',
      'It is reported only while the door is monitored: not when its local door controller is failed or all three DSMS channels are lost.',
    ],
    alertIds: [slideFaultAlert, doorPosDetAlert],
    effects: [
      {
        where: 'E/WD',
        text:
          `DOOR ${name} SLIDE FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. The ` +
          'procedure line is CABIN CREW ADVISE.',
      },
      {
        where: 'SD DOOR',
        text:
          `An amber S shows at the slide position of door ${name}, even with the door closed and the slide not ` +
          `armed. ${SD_DOOR_CALL_UP}`,
      },
      {
        where: 'SD STATUS',
        text: `${name} SLIDE is listed as inoperative ${FOR_APPROACH_AND_LANDING}, ${STATUS_NOTE}.`,
      },
      {
        where: 'E/WD',
        text:
          `With a second fault detected on the same door (its actuator, flight lock or latch monitoring), DOOR ${name} ` +
          `POS DET FAULT also appears, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. Its lines: ` +
          'PACK 1+2 & CAB PRESS NOT AVAIL on the ground before 80 kt on take-off when the cabin pressure system has ' +
          'failed, and in flight the ABNORM CAB V/S lines; ticking ABNORM CAB V/S adds the MAX FL : 100/MEA-MORA ' +
          'limitation on the E/WD and the PFD. It calls up the SD DOOR page. It does not show when all the door ' +
          'controllers of that side or all three DSMS channels are lost.',
      },
      {
        where: 'SD STATUS',
        text:
          `While DOOR ${name} POS DET FAULT is shown, DOOR ${name} is listed as inoperative ${FOR_APPROACH_AND_LANDING}, ` +
          'and CAB PRESS SYS and PACK 1+2 as inoperative when the first line applies.',
      },
    ],
    notSimulated: ['The slide, its arming lever and its inflation are not modelled.'],
    logbook: { required: true, reason: `slide fault caution on door ${name}` },
    clearing: `${MAINTENANCE_ONLY} The alerts and the amber S go out at once.`,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Slide extension sill height sensors
// ---------------------------------------------------------------------------------------------------------------------

const slideLengtheningDetail = (position: number): FailureDetail => {
  const name = position === 1 ? 'MAIN 1L' : 'MAIN 1R';
  const alert = String(520800201 + position - 1);
  return {
    whatItIs:
      'The main deck doors 1 deploy the slide with an extension when the aircraft attitude raises the door sill, for ' +
      'example with an abnormal landing gear configuration. Sill height sensors at the door detect the sill height ' +
      'variation for the doors and slides management system.',
    impact: [
      `The sill height sensors of door ${name} are lost, so no slide extension is available there.`,
      'Nothing is moved in the sim: the failure only changes the warnings.',
      'It is reported only while the door is monitored: not when its local door controller is failed or all three DSMS channels are lost.',
    ],
    alertIds: [alert],
    effects: [
      {
        where: 'E/WD',
        text:
          `DOOR ${name} SLIDE LENGTHENING FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. ` +
          'The procedure line is CABIN CREW ADVISE. It calls up no page.',
      },
      {
        where: 'SD STATUS',
        text: `${name} SLIDE LENGTH is listed as inoperative ${FOR_APPROACH_AND_LANDING}, ${STATUS_NOTE}.`,
      },
    ],
    notSimulated: ['The slide extension and the sill height measurement are not modelled.'],
    logbook: { required: true, reason: `slide lengthening fault caution on door ${name}` },
    clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// DSMS channels
// ---------------------------------------------------------------------------------------------------------------------

const DOOR_POS_DET_FAULT_ALERT = '520800203';

const dsmsChannelDetail = (number: number): FailureDetail => ({
  whatItIs:
    'The doors and slides management system, DSMS, has three channels. Together they monitor the passenger doors and ' +
    'their slides through a local door controller at each door, and the cargo doors, and they report to the warning ' +
    'system and the DOOR page.',
  impact: [
    `DSMS channel ${number} is lost. One lost channel changes nothing: the other two keep monitoring all the doors.`,
    'With two channels lost, the warning system reports a door position detection fault but the doors are still monitored.',
    'With all three channels lost, the position of all 16 passenger doors is unknown and no door, passenger or cargo, raises a NOT CLOSED alert; the cargo doors are still drawn on the DOOR page.',
  ],
  alertIds: [DOOR_POS_DET_FAULT_ALERT],
  effects: [
    {
      where: 'E/WD',
      text:
        `With a second channel lost as well (any channel except channel ${number} counts), DOOR POS DET FAULT, ` +
        `${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. The only line then is PACK 1+2 & CAB ` +
        'PRESS NOT AVAIL, and only if the cabin pressure system is lost before 80 kt on the take-off run. ' +
        SD_DOOR_CALL_UP,
    },
    {
      where: 'E/WD',
      text:
        'With all three channels lost, the same alert adds, on the ground, BEFORE OPENING ANY CABIN DOOR with the lines ' +
        'RESIDUAL DIFF PRESS CHECK and CABIN CREW ADVISE, and in flight IF ABNORM CAB V/S with its lines; once that ' +
        'condition is checked the limitation MAX FL : 100/MEA-MORA shows on the E/WD and the PFD.',
    },
    {
      where: 'SD DOOR',
      text:
        'With all three channels lost, every passenger door shows an amber X instead of its number, an amber XX at its ' +
        'slide position and a dashed door message. The oxygen data stay.',
    },
    {
      where: 'SD STATUS',
      text: `With the pack line, CAB PRESS SYS and PACK 1+2 are listed as inoperative; with all three channels lost, DOOR POS DET is listed as inoperative in all phases, ${STATUS_NOTE}.`,
    },
    {
      where: 'E/WD',
      text:
        'With all three channels lost, the alerts of the single doors (actuator, flight lock, latch monitoring, door ' +
        'position detection, slide and slide lengthening) and DOOR RESIDUAL DIFF PRESS DET FAULT are hidden. The DOOR ' +
        '... NOT CLOSED alerts of the passenger and cargo doors do not show either, so an open door no longer ' +
        'raises an alert, keeps CAB PRESS INHIBITED BY DOORS from showing and no longer blocks the take-off ' +
        'configuration test.',
    },
  ],
  notSimulated: [
    'On the aircraft the cargo door indications are lost too with all three channels lost.',
    'The loss of channels does not change how a door, a lock or a slide works in the sim.',
  ],
  logbook: { required: false, reason: 'no indication to report for one lost channel' },
  clearing: `${MAINTENANCE_ONLY} DOOR POS DET FAULT goes out, the door symbols come back and the hidden door alerts can show again at once.`,
});

// ---------------------------------------------------------------------------------------------------------------------
// ASPSU
// ---------------------------------------------------------------------------------------------------------------------

const aspsuEntry: FailureDetail = {
  whatItIs:
    'The autonomous standby power supply unit, ASPSU, detects the residual cabin pressure at the doors and keeps ' +
    'doing it for 2.5 hours without aircraft electrical power. It tells the crew when the cabin is still pressurised ' +
    'before a door is opened.',
  impact: [
    'The detection of the residual cabin pressure at the doors is lost.',
    'The crew has to check the residual differential pressure before opening any cabin door.',
    'Nothing stops or delays a door opening in the sim.',
  ],
  alertIds: ['520800204'],
  effects: [
    {
      where: 'E/WD',
      text:
        `DOOR RESIDUAL DIFF PRESS DET FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_10}; ${ALREADY_SHOWN_STAYS}. The lines are ` +
        'BEFORE OPENING ANY CABIN DOOR, RESIDUAL DIFF PRESS CHECK and CABIN CREW ADVISE. It does not show with all three ' +
        'DSMS channels lost.',
    },
    {
      where: 'SD CAB PRESS',
      text: 'The alert calls up the CAB PRESS page when it first appears, unless another page was selected.',
    },
  ],
  notSimulated: [
    'The CABIN PRESSURE WARNING light of each door is not simulated, and nothing in the sim stops a door from opening under cabin pressure.',
  ],
  logbook: { required: true, reason: 'residual pressure detection fault caution' },
  clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
};

// ---------------------------------------------------------------------------------------------------------------------
// Cockpit door emergency access
// ---------------------------------------------------------------------------------------------------------------------

const cockpitDoorEmergencyAccessEntry: FailureDetail = {
  whatItIs:
    'The cockpit door is locked electrically. A crewmember outside enters a code on the keypad: with the emergency ' +
    'access code the door unlocks by itself for 5 s after a delay, unless the flight crew answers with the CKPT DOOR ' +
    'switch on the CKPT DOOR panel. UNLOCK unlocks the door while held; LOCK refuses the access and inhibits the keypad for a while.',
  impact: [
    'This is a cabin crew request, not a failure: the cabin crew enters the emergency access code.',
    'Without an answer, the door unlocks by itself for 5 s after 30 s and then locks again.',
    'Refusing with LOCK blocks new requests for 10 minutes.',
  ],
  alertIds: ['520800035'],
  effects: [
    {
      where: 'E/WD',
      text:
        `DOOR CKPT DOOR EMER OPENING IN PROGRESS, ${ADVISORY}, with the line CKPT DOOR LOCK AS RQRD, from the request ` +
        `until the flight crew answers or the door unlocks by itself; ${NOT_SHOWN_PHASES_3_TO_6}; ` +
        `${ALREADY_SHOWN_STAYS}. It is not hidden by a loss of the DSMS.`,
    },
    {
      where: 'SD VIDEO',
      text: 'The alert calls up the VIDEO page when it first appears, unless another page was selected; the page shows only NOT AVAIL.',
    },
    {
      where: 'CKPT DOOR panel',
      text:
        'The CKPT DOOR switch answers: UNLOCK unlocks the door and ends the alert, and the door stays unlocked until LOCK ' +
        'is selected; LOCK locks the door, ends the alert and blocks new requests for 10 minutes. After 30 s without ' +
        'an answer the door unlocks for 5 s, then locks again unless the switch is used.',
    },
  ],
  notSimulated: [
    'The keypad is not simulated: the flyPad request stands for the code entered by the cabin crew.',
    'The emergency buzzer and the CKPT DOOR light (steady with the door open, flashing during an emergency request) are not simulated.',
    'On the aircraft the door stays unlocked only while the switch is held at UNLOCK.',
    'The cockpit door camera picture on the VIDEO page is not simulated.',
  ],
  logbook: { required: false, reason: 'a cabin crew request, nothing is failed' },
  clearing:
    'Crew action: answer with the CKPT DOOR switch, or wait for the door to unlock by itself. Restore only allows a new request; it does not cancel one in progress.',
};

export const Ata52SlidesSystemsEntries: Record<number, FailureDetail> = {
  [A380Failure.Aspsu]: aspsuEntry,
  [A380Failure.CockpitDoorEmergencyAccessRequest]: cockpitDoorEmergencyAccessEntry,
};

export const Ata52SlidesSystemsFamilies: FailureDetailFamily[] = [
  {
    ids: [
      A380Failure.DoorMain1LSlide,
      A380Failure.DoorMain1RSlide,
      A380Failure.DoorMain2LSlide,
      A380Failure.DoorMain2RSlide,
      A380Failure.DoorMain3LSlide,
      A380Failure.DoorMain3RSlide,
      A380Failure.DoorMain4LSlide,
      A380Failure.DoorMain4RSlide,
      A380Failure.DoorMain5LSlide,
      A380Failure.DoorMain5RSlide,
      A380Failure.DoorUpper1LSlide,
      A380Failure.DoorUpper1RSlide,
      A380Failure.DoorUpper2LSlide,
      A380Failure.DoorUpper2RSlide,
      A380Failure.DoorUpper3LSlide,
      A380Failure.DoorUpper3RSlide,
    ],
    detail: escapeSlideDetail,
  },
  {
    ids: [A380Failure.DoorMain1LSlideLengthening, A380Failure.DoorMain1RSlideLengthening],
    detail: slideLengtheningDetail,
  },
  {
    ids: [A380Failure.DsmsChannel1, A380Failure.DsmsChannel2, A380Failure.DsmsChannel3],
    detail: dsmsChannelDetail,
  },
];
