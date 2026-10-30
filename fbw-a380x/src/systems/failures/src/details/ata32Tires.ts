// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const CAUTION = 'an amber caution with master caution and single chime';

const SD_WHEEL_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

/** Alert inhibited in flight phases 3 to 7 and 10 (shown in phases 1, 2, 8, 9, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_7_AND_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from touch down until the landing roll is below 80 kt';

const NO_HANDLING_EFFECT = 'The braking, the steering and the ground handling are not changed.';

const RESTORE_NEW_TIRE =
  'Maintenance only: use Restore. The tire is back at its normal pressure at once, as if replaced.';

/**
 * The tires are numbered as on the SD WHEEL page: wing gears 1 to 8, body gears 9 to 20, the two tires of an axle are
 * 2n-1 and 2n; the left side holds the odd axles 1, 3, 5, ... counting 1/2 as axle 1.
 * @param tire the tire, 1 to 20
 * @returns the gear and side of the tire, the other tire of its axle and the brake note
 */
const mainTireLocation = (tire: number) => {
  const axleNumber = Math.ceil(tire / 2);
  const left = axleNumber % 2 === 1;
  const gear = `${left ? 'left' : 'right'} ${tire <= 8 ? 'wing' : 'body'} gear`;
  const mate = tire % 2 === 1 ? tire + 1 : tire - 1;
  const brake =
    tire <= 16
      ? `It sits on brake ${tire}.`
      : 'It is on the aft axle of a body gear, the steered axle, which has no brakes and no brake temperature.';
  return { gear, mate, brake };
};

const tireEffects = (firstText: string): FailureDetail['effects'] => [
  { where: 'SD WHEEL', text: firstText },
  {
    where: 'E/WD',
    text:
      `WHEEL TIRE PRESS LO, ${CAUTION}, when a tire is below a minimum pressure or differs too much from the other tire ` +
      'of its axle. Before take-off and after engine shutdown the limits are 89 % of the normal pressure and a ' +
      'difference of 15 % of it; from lift-off until the engines are shut down after landing they are 74 % and 21 %. ' +
      'With one tire deflating before take-off the alert comes after about 2.5 min, when the tire reads 190 psi; in ' +
      'flight or during taxi-in the difference with the other tire comes first, after about 4.5 min. ' +
      `${NOT_SHOWN_PHASES_3_TO_7_AND_10}; ${ALREADY_SHOWN_STAYS}, but at lift-off the looser flight limits can remove it ` +
      'until the tire is lower. It has no procedure line and no STATUS line.',
  },
  { where: 'SD WHEEL', text: SD_WHEEL_CALL_UP },
];

const mainTireDetail = (number: number): FailureDetail => {
  const { gear, mate, brake } = mainTireLocation(number);
  return {
    whatItIs:
      `Tire ${number} is one of the twenty main gear tires, on the ${gear}, paired on its axle with tire ${mate}. ${brake} ` +
      'The tire pressure indicating system measures every tire and shows the pressures on the wheel page.',
    impact: [
      `The pressure of tire ${number} drops slowly until the tire is flat.`,
      'The crew is told through the wheel page and a caution once the pressure is low or too different from the ' +
        'other tire of the axle.',
      NO_HANDLING_EFFECT,
    ],
    alertIds: ['320800063'],
    effects: tireEffects(
      `The pressure of tire ${number} on the ${gear} reads 220 psi and drops in steps of 5 psi, 10 psi per minute, to 0 ` +
        'psi when the tire is flat. It is shown in green on the MORE page only; it turns amber, whatever the MORE key, ' +
        `once it is low or differs too much from tire ${mate}. Tire ${mate} turns amber too once the difference is too ` +
        'large (before take-off about half a minute later, in flight at the same time).',
    ),
    notSimulated: [
      'On the aircraft a deflated tire limits the taxi (very low speed, reduced nose wheel steering angle); the sim ' +
        'applies no limit, and a burst tire does not damage the gear.',
    ],
    logbook: { required: true, reason: `caution and a deflating tire ${number}` },
    clearing: RESTORE_NEW_TIRE,
  };
};

const noseTireDetail = (position: number): FailureDetail => {
  const side = position === 1 ? 'left' : 'right';
  const mate = position === 1 ? 'right' : 'left';
  return {
    whatItIs:
      `The ${side} nose tire is one of the two tires of the nose gear, paired with the ${mate} nose tire on the same ` +
      'axle. The tire pressure indicating system measures it and shows the pressure on the wheel page, where the nose ' +
      'tires have no brake numbers.',
    impact: [
      `The pressure of the ${side} nose tire drops slowly until the tire is flat.`,
      'The crew is told through the wheel page and a caution once the pressure is low or too different from the ' +
        `${mate} nose tire.`,
      NO_HANDLING_EFFECT,
    ],
    alertIds: ['320800063'],
    effects: tireEffects(
      `The pressure of the ${side} nose tire reads 220 psi and drops in steps of 5 psi, 10 psi per minute, to 0 psi when ` +
        'the tire is flat. It is shown in green on the MORE page only; it turns amber, whatever the MORE key, once it ' +
        `is low or differs too much from the ${mate} nose tire. The ${mate} nose tire turns amber too once the difference ` +
        'is too large (before take-off about half a minute later, in flight at the same time).',
    ),
    notSimulated: [
      'On the aircraft a deflated tire limits the taxi (very low speed, reduced nose wheel steering angle); the sim ' +
        'applies no limit, and a burst tire does not damage the gear.',
    ],
    logbook: { required: true, reason: `caution and a deflating ${side} nose tire` },
    clearing: RESTORE_NEW_TIRE,
  };
};

export const Ata32TiresFamilies: FailureDetailFamily[] = [
  {
    ids: [
      A380Failure.Tire1Deflation,
      A380Failure.Tire2Deflation,
      A380Failure.Tire3Deflation,
      A380Failure.Tire4Deflation,
      A380Failure.Tire5Deflation,
      A380Failure.Tire6Deflation,
      A380Failure.Tire7Deflation,
      A380Failure.Tire8Deflation,
      A380Failure.Tire9Deflation,
      A380Failure.Tire10Deflation,
      A380Failure.Tire11Deflation,
      A380Failure.Tire12Deflation,
      A380Failure.Tire13Deflation,
      A380Failure.Tire14Deflation,
      A380Failure.Tire15Deflation,
      A380Failure.Tire16Deflation,
      A380Failure.Tire17Deflation,
      A380Failure.Tire18Deflation,
      A380Failure.Tire19Deflation,
      A380Failure.Tire20Deflation,
    ],
    detail: mainTireDetail,
  },
  { ids: [A380Failure.NoseTireLeftDeflation, A380Failure.NoseTireRightDeflation], detail: noseTireDetail },
];
