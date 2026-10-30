// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

const SD_FCTL_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

const STATUS_NOTE = 'while the alert is shown';

/** Alerts inhibited in flight phases 3 to 11 (shown in phases 1, 2 and 12) */
const NOT_SHOWN_PHASES_3_TO_11 =
  'a new alert shows only on the ground before take-off thrust is set and after the engines are shut down';

/** Alerts inhibited in flight phases 2 to 11 (shown in phases 1 and 12) */
const NOT_SHOWN_PHASES_2_TO_11 =
  'a new alert shows only before the first engine is started and after the engines are shut down';

/** Alerts inhibited in flight phases 3 to 7, 9, 10 and 11 (shown in phases 1, 2, 8 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_9_10_11 =
  'a new alert shows only on the ground before take-off thrust is set, in flight above 800 ft (climb above 1,500 ft, ' +
  'cruise and descent) and after the engines are shut down';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 4 to 7 */
const NOT_SHOWN_PHASES_4_TO_7 = 'a new alert is not shown from 80 kt on take-off until 1,500 ft';

/** Alerts inhibited in flight phases 3 to 7 */
const NOT_SHOWN_PHASES_3_TO_7 = 'a new alert is not shown from take-off power until 1,500 ft';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const BTV_NOT_ARMED =
  'The brake to vacate function (BTV) does not arm, and an armed BTV changes to BRK HI, while the failure is present.';

const NO_OTHER_EFFECT =
  'Only the alert shows: the flight control computers keep enough redundancy, so handling and the flight control law do not change.';

// ---------------------------------------------------------------------------------------------------------------------
// Sidesticks
// ---------------------------------------------------------------------------------------------------------------------

const sidestickDetail = (number: number): FailureDetail => {
  const pilot = number === 1 ? 'captain' : 'first officer';
  const label = number === 1 ? 'CAPT' : 'F/O';
  const letter = number === 1 ? 'L' : 'R';
  return {
    whatItIs:
      `The ${pilot} sidestick is the control column of the ${pilot}, fixed to the ${number === 1 ? 'left' : 'right'} ` +
      'side panel. Its position transducers send the pitch and roll orders to the three PRIMs and the three SECs, ' +
      'which turn them into surface commands in every control law. The sidesticks are not linked to each other.',
    impact: [
      `The ${label} sidestick sends no pitch or roll order to the flight control computers.`,
      `The control input of the pilot is then read as the ${number === 1 ? 'F/O' : 'CAPT'} sidestick, so the aircraft can still be flown.`,
      `With both sidesticks failed, no sidestick order reaches the computers at all.`,
    ],
    alertIds: [String(271800024 + number)],
    effects: [
      {
        where: 'E/WD',
        text:
          `F/CTL ${letter} SIDESTICK FAULT, ${CAUTION}, in every flight phase and only while at least one PRIM is ` +
          `healthy. The ${letter} SIDESTICK SENSOR FAULT advisory is hidden while this failure stays.`,
      },
      { where: 'SD F/CTL', text: SD_FCTL_CALL_UP },
      {
        where: 'SD STATUS',
        text: `${letter} SIDESTICK is listed as inoperative, ${STATUS_NOTE}.`,
      },
    ],
    logbook: { required: true, reason: `caution and a failed ${label} sidestick` },
    clearing: MAINTENANCE_ONLY,
  };
};

const sidestickSensorDetail = (number: number): FailureDetail => {
  const pilot = number === 1 ? 'captain' : 'first officer';
  const label = number === 1 ? 'CAPT' : 'F/O';
  const letter = number === 1 ? 'L' : 'R';
  return {
    whatItIs:
      `Each sidestick carries redundant position sensors in addition to its transducers; the ${pilot} sidestick ` +
      'sensor is the monitoring channel which lets the PRIMs and SECs compare the readings and detect a transducer ' +
      'that drifts or sticks.',
    impact: [
      `The monitoring of the ${label} sidestick position is degraded; the sidestick keeps sending its orders.`,
      NO_OTHER_EFFECT,
    ],
    alertIds: [String(271800026 + number), '271800042', '271800043', '271800044'],
    effects: [
      {
        where: 'E/WD',
        text:
          `F/CTL ${letter} SIDESTICK SENSOR FAULT, ${ADVISORY}, while at least two PRIMs are healthy; ` +
          `${NOT_SHOWN_PHASES_3_TO_11}; ${ALREADY_SHOWN_STAYS}.`,
      },
      {
        where: 'E/WD',
        text:
          'With only one PRIM healthy, F/CTL PRIM 1 (2, 3) SIDESTICK SENSOR FAULT for that PRIM replaces it, ' +
          `${ADVISORY}; ${NOT_SHOWN_PHASES_2_TO_11}.`,
      },
      {
        where: 'E/WD',
        text: `With the ${label} sidestick itself failed as well, only its SIDESTICK FAULT caution shows.`,
      },
    ],
    logbook: { required: true, reason: 'advisory alert and a degraded sidestick sensor' },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// PRIM sidestick channels and priority functions
// ---------------------------------------------------------------------------------------------------------------------

const primSidestickSensorChannelDetail = (number: number): FailureDetail => ({
  whatItIs:
    `PRIM ${number} reads the position of both sidesticks through its own input channel, independent from the two ` +
    'other PRIMs and from the SECs. The three PRIMs compare their readings and the crew sees which channel disagrees.',
  impact: [
    `The sidestick sensor channel of PRIM ${number} is flagged faulty; the other PRIMs and the SECs still read the sticks.`,
    NO_OTHER_EFFECT,
  ],
  alertIds: [String(271800041 + number)],
  effects: [
    {
      where: 'E/WD',
      text:
        `F/CTL PRIM ${number} SIDESTICK SENSOR FAULT, ${ADVISORY}, only while PRIM ${number} is healthy; ` +
        `${NOT_SHOWN_PHASES_2_TO_11}; ${ALREADY_SHOWN_STAYS}.`,
    },
  ],
  logbook: { required: true, reason: 'advisory alert and a faulty PRIM sidestick channel' },
  clearing: MAINTENANCE_ONLY,
});

const primSidestickPriorityDetail = (number: number): FailureDetail => ({
  whatItIs:
    `The sidestick priority function of PRIM ${number} decides which sidestick has the priority when the pilots ` +
    'press the sidestick pushbuttons (a take-over, which also deactivates the other sidestick), and combines the two ' +
    'orders. Each PRIM runs its own copy.',
  impact: [
    `The priority function of PRIM ${number} is flagged faulty; the other PRIMs and the take-over by the pilots work as before.`,
    NO_OTHER_EFFECT,
  ],
  alertIds: ['271800073'],
  effects: [
    {
      where: 'E/WD',
      text:
        `F/CTL SIDESTICK PRIORITY FAULT, ${ADVISORY}, only while PRIM ${number} is healthy; one alert serves all three ` +
        `PRIMs. ${NOT_SHOWN_PHASES_3_TO_11}; ${ALREADY_SHOWN_STAYS}.`,
    },
  ],
  logbook: { required: true, reason: 'advisory alert and a faulty sidestick priority function' },
  clearing: MAINTENANCE_ONLY,
});

// ---------------------------------------------------------------------------------------------------------------------
// Rudder pedals
// ---------------------------------------------------------------------------------------------------------------------

const RUDDER_PEDAL_TRANSDUCERS: FailureDetail = {
  whatItIs:
    'The rudder pedals of both pilots carry position transducers which send the pedal order to the PRIMs and the ' +
    'SECs. The same pedal position also steers the nose wheel through the pedals, and the pedals sit on the Pedal ' +
    'Feel and Trim Unit, which sets their zero-force position for the rudder trim.',
  impact: [
    'The pedals no longer command the rudders and the manual rudder trim offset is lost; yaw damping and turn coordination stay with the computers.',
    'Nose wheel steering through the pedals is lost; the tiller remains.',
    `${BTV_NOT_ARMED} The landing distance is affected.`,
  ],
  alertIds: ['271800050'],
  effects: [
    {
      where: 'E/WD',
      text:
        `F/CTL RUDDER PEDAL FAULT, ${CAUTION}, while any PRIM or SEC is healthy; ${NOT_SHOWN_PHASES_4_TO_7}; ` +
        `${ALREADY_SHOWN_STAYS}. Lines: AP : KEEP ON and LDG DIST AFFECTED.`,
    },
    { where: 'SD F/CTL', text: SD_FCTL_CALL_UP },
    {
      where: 'E/WD',
      text: `The limitation LDG DIST AFFECTED shows for approach and landing, ${STATUS_NOTE}.`,
    },
    {
      where: 'SD STATUS',
      text: `RUDDER PEDAL is listed as inoperative, with BTV for approach and landing, ${STATUS_NOTE}.`,
    },
    {
      where: 'E/WD',
      text:
        'The deferred procedure RUDDER PEDAL FAULT, also listed on the SD STATUS, is available for the approach: LDG DIST COMPUTATION (CONFIRM), ' +
        'AUTOLAND: RECOMMENDED, AUTO BRK: DO NOT USE, USE DIFF BRAKING AS RQRD, N/W STEER TILLER (< 70 KT) AS RQRD ' +
        'and REVERSER: SYMMETRIC USE ONLY.',
    },
  ],
  logbook: { required: true, reason: 'caution and lost rudder pedal orders' },
  clearing: MAINTENANCE_ONLY,
};

const RUDDER_PEDAL_SENSOR: FailureDetail = {
  whatItIs:
    'The rudder pedal sensor is the monitoring channel of the pedal position, next to the pedal transducers. It ' +
    'lets the computers compare the pedal readings and detect a transducer that drifts or sticks.',
  impact: [
    'The monitoring of the pedal position is degraded; the pedals keep commanding the rudders.',
    NO_OTHER_EFFECT,
  ],
  alertIds: ['271800052'],
  effects: [
    {
      where: 'E/WD',
      text:
        `F/CTL RUDDER PEDAL SENSOR FAULT, ${ADVISORY}, while any PRIM or SEC is healthy; ` +
        `${NOT_SHOWN_PHASES_3_TO_11}; ${ALREADY_SHOWN_STAYS}.`,
    },
    {
      where: 'E/WD',
      text: 'With the rudder pedal transducers failed as well, only RUDDER PEDAL FAULT shows.',
    },
  ],
  logbook: { required: true, reason: 'advisory alert and a degraded rudder pedal sensor' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// Rudder pressure sensors
// ---------------------------------------------------------------------------------------------------------------------

const rudderPressureSensorDetail = (number: number): FailureDetail => {
  const position = number === 1 ? 'upper' : 'lower';
  const otherPosition = number === 1 ? 'lower' : 'upper';
  return {
    whatItIs:
      `The ${position} rudder has a pressure sensor on its actuators. It measures the actuator pressure, so that the ` +
      'computers can let both actuators of a rudder drive the surface together during take-off, approach and landing.',
    impact: [
      `The pressure monitoring of the ${position} rudder is lost; the rudder keeps moving.`,
      'Both the upper and the lower sensor failed together is the double fault, with its own alert.',
      NO_OTHER_EFFECT,
    ],
    alertIds: ['271800053', '271800074'],
    effects: [
      {
        where: 'E/WD',
        text:
          `F/CTL RUDDER PRESSURE SENSOR FAULT, ${ADVISORY}, while the ${otherPosition} sensor is healthy and any PRIM ` +
          `or SEC is healthy; ${NOT_SHOWN_PHASES_2_TO_11}; ${ALREADY_SHOWN_STAYS}.`,
      },
      {
        where: 'E/WD',
        text:
          `With the ${otherPosition} sensor failed too, F/CTL DOUBLE RUDDER PRESS SENSOR FAULT replaces it, ` +
          `${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10_11}; ${ALREADY_SHOWN_STAYS}.`,
      },
    ],
    notSimulated: [
      `Only one actuator of the affected rudder (each rudder with the double fault) drives it in take-off, approach and landing.`,
    ],
    logbook: { required: true, reason: 'advisory alert and a lost rudder pressure sensor' },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Rudder trim motors
// ---------------------------------------------------------------------------------------------------------------------

const rudderTrimMotorDetail = (number: number): FailureDetail => {
  const sec = number === 1 ? 1 : 3;
  const otherMotor = number === 1 ? 2 : 1;
  const otherSec = number === 1 ? 3 : 1;
  return {
    whatItIs:
      'The Pedal Feel and Trim Unit has two electric motors which move the zero-force position of the rudder pedals ' +
      `to apply the rudder trim, one controlled by SEC 1 and the other by SEC 3. Motor ${number} is controlled by SEC ${sec}; ` +
      'the trim comes from the RUDDER TRIM selector or from the autopilot orders.',
    impact: [
      `Rudder trim motor ${number} stops; SEC ${otherSec} drives its motor ${otherMotor} and the rudder trim still follows its orders.`,
      `With motor ${otherMotor} failed as well, or SEC ${otherSec} lost, the zero-force position of the pedals no longer follows the trim orders.`,
    ],
    alertIds: [String(271800053 + number), '271800056'],
    effects: [
      {
        where: 'E/WD',
        text:
          `F/CTL RUDDER TRIM ${number} FAULT, ${ADVISORY}, while SEC ${sec} is healthy and the other channel still ` +
          `trims; ${NOT_SHOWN_PHASES_3_TO_7_9_10_11}; ${ALREADY_SHOWN_STAYS}.`,
      },
      { where: 'SD F/CTL', text: SD_FCTL_CALL_UP },
      {
        where: 'E/WD',
        text:
          `With both trim channels lost (motor ${number} failed and motor ${otherMotor} failed or SEC ${otherSec} ` +
          `not healthy), F/CTL RUDDER TRIM FAULT replaces it, ${CAUTION}, while any SEC is healthy; ` +
          `${NOT_SHOWN_PHASES_4_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}.`,
      },
      {
        where: 'SD STATUS',
        text: `For RUDDER TRIM FAULT, RUDDER TRIM is listed as inoperative, with CAT 2 for approach and landing, ${STATUS_NOTE}.`,
      },
    ],
    logbook: { required: true, reason: 'alert and a lost rudder trim channel' },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// PRIM wheel speed inputs, speed brake lever
// ---------------------------------------------------------------------------------------------------------------------

const PRIM_WHEEL_SPEED_INPUTS: FailureDetail = {
  whatItIs:
    'The PRIMs receive the speed of the main landing gear wheels (body gear and wing gear, left and right). They ' +
    'use it, with the thrust levers and the speed brake lever, to decide that the aircraft is rolling on the ground ' +
    'and to extend the ground spoilers.',
  impact: [
    'The ground spoilers do not extend at touch-down or on a rejected take-off; the speed brakes still work in flight.',
    'The PRIMs get a wheel speed of zero from all four wheel groups.',
    'The landing distance is affected and the automatic braking is not to be used.',
    `${BTV_NOT_ARMED} The runway overrun protection and CAT 2 are listed as inoperative for the approach.`,
  ],
  alertIds: ['271800016'],
  effects: [
    {
      where: 'E/WD',
      text:
        `F/CTL GND SPLRs FAULT, ${CAUTION}, while any PRIM is healthy; ${NOT_SHOWN_PHASES_3_TO_7}; ` +
        `${ALREADY_SHOWN_STAYS}. Lines: LDG DIST AFFECTED and AUTO BRK : DO NOT USE.`,
    },
    { where: 'SD F/CTL', text: SD_FCTL_CALL_UP },
    {
      where: 'E/WD',
      text: `The limitations LDG DIST AFFECTED and AUTO BRK DO NOT USE show for approach and landing, ${STATUS_NOTE}.`,
    },
    {
      where: 'SD STATUS',
      text: `GND SPLRs, BTV, RWY OVERRUN PROT and CAT 2 are listed as inoperative for approach and landing, ${STATUS_NOTE}.`,
    },
    {
      where: 'E/WD',
      text: 'The deferred procedure GND SPLRs FAULT, also listed on the SD STATUS, is available for the approach: LDG DIST COMPUTATION (CONFIRM).',
    },
  ],
  logbook: { required: true, reason: 'caution and lost ground spoiler information' },
  clearing: MAINTENANCE_ONLY,
};

const SPEED_BRAKES_LEVER: FailureDetail = {
  whatItIs:
    'The SPEED BRAKE lever on the pedestal is read by position transducers, which send the lever position and the ' +
    'armed position of the ground spoilers to the PRIMs and the FCDCs. The lever commands the speed brakes in ' +
    'flight and arms the ground spoilers for landing and rejected take-off.',
  impact: [
    'The PRIMs and the FCDCs see the lever retracted and not armed, so the speed brakes cannot be commanded and the ground spoilers cannot be armed.',
    'The ground spoilers still extend when reverse is selected after touch-down. Moving the lever has no effect.',
    'On approach the computers see the lever not armed, which raises a second caution.',
  ],
  alertIds: ['271800063', '271800017'],
  effects: [
    {
      where: 'E/WD',
      text:
        `F/CTL SPEED BRAKES FAULT, ${CAUTION}, while any PRIM is healthy; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ` +
        `${ALREADY_SHOWN_STAYS}.`,
    },
    {
      where: 'E/WD',
      text:
        `F/CTL GND SPLRs NOT ARMED, ${CAUTION}, on approach below 500 ft radio height with the landing gear down, ` +
        'because the computers see the lever not armed. A new alert shows only in climb, cruise, descent and approach ' +
        `not on the ground, not at take-off and not after touch-down; ${ALREADY_SHOWN_STAYS}.`,
    },
    { where: 'SD F/CTL', text: SD_FCTL_CALL_UP },
    {
      where: 'SD STATUS',
      text: `SPEED BRAKES is listed as inoperative, ${STATUS_NOTE}.`,
    },
  ],
  logbook: { required: true, reason: 'caution and lost speed brake control' },
  clearing: MAINTENANCE_ONLY,
};

export const Ata27InputsEntries: Record<number, FailureDetail> = {
  [A380Failure.RudderPedalTransducers]: RUDDER_PEDAL_TRANSDUCERS,
  [A380Failure.RudderPedalSensor]: RUDDER_PEDAL_SENSOR,
  [A380Failure.PrimWheelSpeedInputs]: PRIM_WHEEL_SPEED_INPUTS,
  [A380Failure.SpeedBrakesLever]: SPEED_BRAKES_LEVER,
};

export const Ata27InputsFamilies: FailureDetailFamily[] = [
  { ids: [A380Failure.CaptSidestick, A380Failure.FoSidestick], detail: sidestickDetail },
  { ids: [A380Failure.CaptSidestickSensor, A380Failure.FoSidestickSensor], detail: sidestickSensorDetail },
  {
    ids: [
      A380Failure.Prim1SidestickSensorChannel,
      A380Failure.Prim2SidestickSensorChannel,
      A380Failure.Prim3SidestickSensorChannel,
    ],
    detail: primSidestickSensorChannelDetail,
  },
  {
    ids: [A380Failure.Prim1SidestickPriority, A380Failure.Prim2SidestickPriority, A380Failure.Prim3SidestickPriority],
    detail: primSidestickPriorityDetail,
  },
  {
    ids: [A380Failure.UpperRudderPressureSensor, A380Failure.LowerRudderPressureSensor],
    detail: rudderPressureSensorDetail,
  },
  { ids: [A380Failure.RudderTrimMotor1, A380Failure.RudderTrimMotor2], detail: rudderTrimMotorDetail },
];
