// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';

/** Alerts inhibited in flight phases 4 to 7 (BRAKES RELEASED) */
const NOT_SHOWN_PHASES_4_TO_7 = 'a new alert is not shown from 80 kt on take-off to 1,500 ft';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 (BRAKES RESIDUAL BRAKING) */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const SD_WHEEL_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

/**
 * Brake pairs 1/2 to 15/16 in the order of the failure ids. The pairs alternate left and right; pairs 1 to 4 are on the
 * wing gears (RDC 1), pairs 5 to 8 on the body gears (RDC 3 on the left, RDC 2 on the right).
 */
const pairLabel = (pair: number): string => `${pair * 2 - 1}/${pair * 2}`;
const pairSide = (pair: number): 'left' | 'right' => (pair % 2 === 1 ? 'left' : 'right');
const pairGear = (pair: number): 'wing' | 'body' => (pair <= 4 ? 'wing' : 'body');
const pairRdc = (pair: number): number => {
  if (pair <= 4) {
    return 1;
  }
  return pairSide(pair) === 'left' ? 3 : 2;
};
const pairWhere = (pair: number): string => `${pairSide(pair)} ${pairGear(pair)} gear`;

const BRAKE_SYSTEM_NOT_SIMULATED =
  'The model has one NORM and one ALTN brake circuit for all the wheels, so the pair only changes the pressure it ' +
  'receives from them.';

const tachometerDetail = (pair: number): FailureDetail => {
  const label = pairLabel(pair);
  const side = pairSide(pair);
  const where = pairWhere(pair);
  return {
    whatItIs:
      `Each pair of brakes has a wheel tachometer, here the one of brakes ${label} on the ${where}. The anti-skid ` +
      'of the braking control system compares the wheel speed with the aircraft speed from the ADIRS to find the ' +
      'braking pressure each pair can take without skidding.',
    impact: [
      `In normal or alternate braking the anti-skid of brakes ${label} loses its wheel speed and the pair is released: it gets no pedal or autobrake pressure.`,
      `The other pairs keep braking, but the ${side} side loses about a quarter of its braking force, so the stop is longer and the two sides brake unequally.`,
      `The pair is not released in emergency braking, or when both channels of RDC ${pairRdc(pair)} (the ${pairGear(pair) === 'wing' ? 'wing gears' : `${side} body gear`}) are lost: the EBCU then brakes it without anti-skid. The parking brake also still holds it.`,
    ],
    alertIds: ['320800025'],
    effects: [
      {
        where: 'E/WD',
        text:
          `BRAKES RELEASED, ${CAUTION}, while the pair is released; ${NOT_SHOWN_PHASES_4_TO_7}; ${ALREADY_SHOWN_STAYS}. ` +
          `The line BRK ${label} NORM RELEASED shows in normal braking, BRK ${label} ALTN RELEASED in alternate braking, ` +
          'then LDG DIST AFFECTED. The alert goes out when the braking changes to emergency braking.',
      },
      {
        where: 'E/WD',
        text: 'The limitation LDG DIST AFFECTED shows for approach and landing, while the alert is shown.',
      },
      { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
      {
        where: 'SD STATUS',
        text:
          'The limitation LDG DIST AFFECTED and BTV as inoperative are listed for approach and landing, while the alert ' +
          'is shown. The STATUS MORE page lists BRAKES RELEASED under ALERTS IMPACTING LDG PERF.',
      },
    ],
    notSimulated: [
      BRAKE_SYSTEM_NOT_SIMULATED,
      'The SD WHEEL page does not show the released indication on the pair.',
      'With many pairs released the real system changes the wheel group to another braking mode; here the pairs only stay released.',
      'The deferred procedure LDG DIST COMPUTATION (CONFIRM) of the approach is not listed.',
    ],
    logbook: { required: true, reason: 'caution and a released brake pair' },
    clearing: `${MAINTENANCE_ONLY} The pair brakes again from the next braking.`,
  };
};

const servoValveLeakDetail = (pair: number): FailureDetail => {
  const label = pairLabel(pair);
  const side = pairSide(pair);
  const where = pairWhere(pair);
  return {
    whatItIs:
      `The normal servo valve of brakes ${label} on the ${where} meters the NORM brake pressure to that pair in ` +
      'proportion to the pedal or autobrake order, and closes it when no braking is ordered.',
    impact: [
      `The valve leaks: brakes ${label} keep about 300 psi, against about 3,600 psi at full braking, without any order.`,
      `The leak counts while the NORM circuit is pressurised on the ground, or in flight with the gear lever down; it is not present with the gear lever up.`,
      `The ${side} side drags a little, and the brakes of that ${where} warm up, also during taxi.`,
    ],
    alertIds: ['320800026'],
    effects: [
      {
        where: 'E/WD',
        text:
          `BRAKES RESIDUAL BRAKING, ${CAUTION}, while the pair keeps its pressure; ${NOT_SHOWN_PHASES_4_TO_7_9_10}; ` +
          `${ALREADY_SHOWN_STAYS}. It goes out after the gear retraction and comes back, as a new alert, with the gear lever down. The amber line ON BRK (${label}) shows, one line for each leaking pair. It has no ` +
          'limitation and no STATUS entry.',
      },
      { where: 'SD WHEEL', text: `${SD_WHEEL_CALL_UP} The brake temperatures of the gear rise.` },
    ],
    notSimulated: [
      BRAKE_SYSTEM_NOT_SIMULATED,
      'The SD WHEEL page does not show the residual braking indication on the pair.',
    ],
    logbook: { required: true, reason: 'caution and residual brake pressure' },
    clearing: `${MAINTENANCE_ONLY} The brakes cool down afterwards.`,
  };
};

export const Ata32BrakesWheelsFamilies: FailureDetailFamily[] = [
  {
    ids: [
      A380Failure.BrakesPair1Tachometer,
      A380Failure.BrakesPair2Tachometer,
      A380Failure.BrakesPair3Tachometer,
      A380Failure.BrakesPair4Tachometer,
      A380Failure.BrakesPair5Tachometer,
      A380Failure.BrakesPair6Tachometer,
      A380Failure.BrakesPair7Tachometer,
      A380Failure.BrakesPair8Tachometer,
    ],
    detail: tachometerDetail,
  },
  {
    ids: [
      A380Failure.BrakesPair1ServoValveLeak,
      A380Failure.BrakesPair2ServoValveLeak,
      A380Failure.BrakesPair3ServoValveLeak,
      A380Failure.BrakesPair4ServoValveLeak,
      A380Failure.BrakesPair5ServoValveLeak,
      A380Failure.BrakesPair6ServoValveLeak,
      A380Failure.BrakesPair7ServoValveLeak,
      A380Failure.BrakesPair8ServoValveLeak,
    ],
    detail: servoValveLeakDetail,
  },
];
