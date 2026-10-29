// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** The flight phases (3, 4, 5, 7 and 8) that most BRAKES and WHEEL cautions are inhibited in */
const NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING =
  'not shown from take-off power set until lift-off reaches 1,500 ft (or 2 minutes), nor from approach below 800 ft until the landing roll slows below 80 kt';

/** The flight phases 3 to 8: the alert shows only on the ground, outside the take-off and landing runs */
const ONLY_ON_THE_GROUND =
  'shown only before the first engine start, during engine start and taxi, and from below 80 kt after landing until 5 minutes after engine shutdown';

/** The released-brake alerts need the gear down and an engine at idle: phases 2 and 9 */
const TAXI_AND_AFTER_LANDING = 'shown only during taxi and after landing below 80 kt';

const AMBER_CAUTION = 'amber caution with master caution and a single chime';

const CAT_3_DUAL_AND_SINGLE = 'CAT 3 SINGLE ONLY is shown and CAT 3 DUAL is listed as inoperative.';

const MAIN_WHEEL_NAMES = ['left outer', 'left inner', 'right inner', 'right outer'] as const;
const TYRE_NAMES = [
  'left outer main',
  'left inner main',
  'right inner main',
  'right outer main',
  'left nose',
  'right nose',
] as const;
const GEAR_NAMES = ['left main', 'right main', 'nose'] as const;

const BrakeCircuitLeakFamily: FailureDetailFamily = {
  ids: [A320Failure.GreenBrakeHydraulicLeak, A320Failure.YellowBrakeHydraulicLeak],
  detail: (number): FailureDetail => {
    const green = number === 1;
    const color = green ? 'green' : 'yellow';
    const letter = green ? 'G' : 'Y';
    return {
      whatItIs: green
        ? 'The normal brakes are supplied by the green hydraulic system through the brake servo valves. ' +
          'The pedals, the autobrake and the antiskid all act through them.'
        : 'The alternate brakes are supplied by the yellow hydraulic system through the alternate servo valves, with ' +
          'a brake accumulator as a reserve. The parking brake uses the same circuit.',
      impact: [
        `The ${color} brake circuit leaks fluid at 0.1 gallon a second, but only while its supply is above 200 PSI.`,
        `The ${color} reservoir empties and the level goes low.`,
      ],
      alertIds: [green ? '2900111' : '2900112', '2900116'],
      effects: [
        {
          where: 'E/WD',
          text:
            `HYD ${letter} RSVR LO LVL with its procedure lines, ${AMBER_CAUTION} and the HYD page, ` +
            'once the reservoir level switch reads low.',
        },
        {
          where: 'E/WD',
          text: 'Not shown from take-off power set through the take-off roll, nor from approach below 800 ft through the landing roll above 80 kt.',
        },
        { where: 'E/WD', text: 'Also not shown for the first 15 seconds after lift-off.' },
        {
          where: 'E/WD',
          text:
            'In flight, with the PTU pb on AUTO and the reservoir low, HYD PTU FAULT shows as the system pressure falls: ' +
            `${AMBER_CAUTION} and the HYD page, not shown from take-off power set until 1,500 ft, nor on approach below 800 ft and the landing roll above 80 kt. The ${letter} SYS LO PR and pump LO PR lines join the RSVR LO LVL procedure.`,
        },
        {
          where: 'Overhead HYD panel',
          text: `The ${green ? 'ENG 1' : 'ENG 2'} PUMP FAULT light (low level, pump pb on AUTO) and the PTU FAULT light come on.`,
        },
      ],
      logbook: { required: true, reason: 'ECAM alert and a hydraulic leak' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const YellowAccumulatorGasLeak: FailureDetail = {
  whatItIs:
    'The yellow brake accumulator stores hydraulic fluid under a nitrogen gas charge. It keeps the alternate ' +
    'brakes and the parking brake supplied for a few applications when the yellow system pressure is lost.',
  impact: [
    'The gas charge leaks away at 50 PSI a second, down to 50 PSI.',
    'The accumulator then holds much more fluid for the same pressure and loses its reserve function.',
    'Removing the failure re-charges the accumulator.',
  ],
  alertIds: [],
  effects: [
    {
      where: 'Brake pressure triple indicator',
      text: 'Nothing shows while yellow is pressurised. Once yellow pressure is lost, the accumulator fluid pressure falls quickly as the brakes are used.',
    },
  ],
  logbook: { required: false, reason: 'no indication to report while the yellow system is pressurised' },
  clearing: MAINTENANCE_ONLY,
};

const BscuChannelFamily: FailureDetailFamily = {
  ids: [A320Failure.BscuChannel1, A320Failure.BscuChannel2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The brake and steering control unit has two channels. One is in control and the other is in standby; they ' +
      'change over at each gear down selection or when the one in control fails. The unit controls the antiskid, ' +
      'the autobrake, the normal braking and the nose wheel steering.',
    impact: [
      `Channel ${number} is lost. The other channel takes over, so nothing is lost with one channel.`,
      'Both channels lost: antiskid, normal braking, autobrake and nose wheel steering are lost.',
      'Alternate braking then works without antiskid, with the brake pressure limited to 1,000 PSI.',
    ],
    alertIds: [number === 1 ? '3200450' : '3200460', '3200400'],
    effects: [
      {
        where: 'E/WD',
        text: `BRAKES SYS ${number} FAULT, ${AMBER_CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. It shows only while the other channel works.`,
      },
      { where: 'SD STATUS', text: `BRK SYS ${number} is listed as inoperative.` },
      {
        where: 'E/WD',
        text: 'A/SKID N/WS FAULT is not shown on the take-off roll above 80 kt nor from lift-off to 1,500 ft.',
      },
      {
        where: 'E/WD',
        text: 'Both channels lost: BRAKES A/SKID N/WS FAULT with MAX BRK PR 1000 PSI replaces the SYS FAULT alerts.',
      },
      {
        where: 'SD WHEEL',
        text: 'Both channels lost: ANTI SKID, NORM BRK and N/W STEERING turn amber, with the failed channel numbers.',
      },
    ],
    notSimulated: [
      'A channel lost only through its power supply gives no BRAKES alert: the bus fault alert covers it.',
    ],
    logbook: { required: true, reason: 'ECAM alert and a lost control channel' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const AlternateBrakingControlUnit: FailureDetail = {
  whatItIs:
    'The alternate braking control unit commands the yellow alternate servo valves from the brake pedals. ' +
    'It takes over when the normal braking is lost. The parking brake does not depend on it.',
  impact: [
    'Alternate braking is lost. Normal braking is not affected while it works.',
    'If the normal braking is lost too, only the parking brake is left.',
  ],
  alertIds: ['3200430', '3200410'],
  effects: [
    {
      where: 'E/WD',
      text: `BRAKES ALTN BRK FAULT, ${AMBER_CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
    },
    {
      where: 'E/WD',
      text: 'With the normal braking failed or both control channels lost too, BRAKES NORM + ALTN FAULT (PARK BRK ONLY) replaces it. It is not shown on the take-off roll above 80 kt nor to 1,500 ft.',
    },
    { where: 'SD STATUS', text: 'ALTN BRK is listed as inoperative.' },
    { where: 'SD WHEEL', text: 'The ALTN BRK legend turns amber and the NORM BRK and ANTI SKID legends turn green.' },
  ],
  logbook: { required: true, reason: 'ECAM alert and a lost braking function' },
  clearing: MAINTENANCE_ONLY,
};

const NormalBraking: FailureDetail = {
  whatItIs:
    'Normal braking uses the green hydraulic system, controlled by the brake and steering control unit with ' +
    'the antiskid. The autobrake works through it. When it is lost, the yellow alternate braking takes over ' +
    'with the antiskid still working.',
  impact: [
    'The normal servo valves no longer brake. The brakes switch to the yellow alternate system.',
    'The autobrake cannot be armed and disarms if it was armed.',
    'With the yellow pressure low too, the brakes run on the accumulator only.',
  ],
  alertIds: ['3200420', '3200400', '3200410'],
  effects: [
    {
      where: 'E/WD',
      text: `BRAKES NORM BRK FAULT, ${AMBER_CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
    },
    {
      where: 'E/WD',
      text: 'With low yellow pressure, A/SKID N/WS FAULT replaces it; with the ABCU lost, NORM + ALTN FAULT does. Both are not shown on the take-off roll above 80 kt nor to 1,500 ft.',
    },
    {
      where: 'SD STATUS',
      text: `LDG DIST PROC APPLY and ALTN Y BRK WITH A/SKID are shown. ${CAT_3_DUAL_AND_SINGLE} NORM BRK and AUTO BRK are inoperative.`,
    },
    { where: 'SD WHEEL', text: 'The NORM BRK legend turns amber, with the ALTN BRK and ANTI SKID legends green.' },
  ],
  notSimulated: ['The MAX BRK PR 1000 PSI line of A/SKID N/WS FAULT is not enforced: the antiskid still works.'],
  logbook: { required: true, reason: 'ECAM alert and a lost braking function' },
  clearing: MAINTENANCE_ONLY,
};

const Autobrake: FailureDetail = {
  whatItIs:
    'The autobrake brakes the aircraft after touchdown or in a rejected take-off at a chosen deceleration (LO, ' +
    'MED or MAX). It is part of the brake and steering control unit and uses the normal braking.',
  impact: [
    'The autobrake cannot be armed. If it was armed, it disarms and the pilot has to brake.',
    'Normal braking and antiskid are not affected.',
    'The aircraft is limited to CAT 3 SINGLE once the failure shows.',
  ],
  alertIds: ['3200440', '0000022'],
  effects: [
    {
      where: 'E/WD',
      text: `BRAKES AUTO BRK FAULT, ${AMBER_CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. It appears only when the autobrake fails after being armed.`,
    },
    {
      where: 'E/WD',
      text: 'The green AUTO BRK OFF memo shows in every flight phase once the autobrake has failed after being armed.',
    },
    { where: 'SD STATUS', text: `${CAT_3_DUAL_AND_SINGLE} AUTO BRK is inoperative.` },
    { where: 'SD WHEEL', text: 'The AUTO BRK legend turns amber and the NORM BRK and ANTI SKID legends turn green.' },
  ],
  logbook: { required: true, reason: 'ECAM alert and a lost autobrake' },
  clearing: MAINTENANCE_ONLY,
};

const NoseWheelSteering: FailureDetail = {
  whatItIs:
    'The nose wheel is steered hydraulically by the yellow system, commanded by the brake and steering control ' +
    'unit from the hand wheel, the rudder pedals and the autopilot. The antiskid and nose wheel steering switch ' +
    'turns the function off.',
  impact: [
    'Nose wheel steering is lost. The hand wheel, the rudder pedals and the autopilot rollout order no longer steer.',
    'Braking and antiskid are not affected.',
  ],
  alertIds: ['3200470'],
  effects: [
    {
      where: 'E/WD',
      text: `WHEEL N/W STRG FAULT, ${AMBER_CAUTION} and the WHEEL page, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
    },
    { where: 'SD STATUS', text: `${CAT_3_DUAL_AND_SINGLE} N/W STRG is inoperative.` },
    { where: 'SD WHEEL', text: 'The N/W STEERING legend turns amber.' },
    {
      where: 'Pedestal (tiller)',
      text: 'The nose wheel stays straight and does not follow the hand wheel.',
    },
  ],
  logbook: { required: true, reason: 'ECAM alert and lost nose wheel steering' },
  clearing: MAINTENANCE_ONLY,
};

const BrakeNormalSelectorValve: FailureDetail = {
  whatItIs:
    'The brake normal selector valve routes the green supply to the normal servo valves. The brake and steering ' +
    'control unit monitors it.',
  impact: [
    'The valve is reported failed open. In the model this has no effect on the brakes.',
    'Only the warning appears; the antiskid keeps regulating the normal servo valves.',
  ],
  alertIds: ['3200480'],
  effects: [
    {
      where: 'E/WD',
      text: `WHEEL HYD SEL FAULT with -A/SKID N/WS KEEP ON, ${AMBER_CAUTION} and the WHEEL page, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
    },
    {
      where: 'E/WD',
      text: 'It shows only while a control channel works.',
    },
  ],
  notSimulated: [
    'Switching the antiskid and nose wheel steering switch off has no extra consequence with this failure.',
  ],
  logbook: { required: true, reason: 'ECAM caution and a selector valve fault' },
  clearing: MAINTENANCE_ONLY,
};

const ParkingBrakeValveJammed: FailureDetail = {
  whatItIs:
    'The parking brake valve applies the yellow brake pressure when the parking brake handle is ON. It is ' +
    'separate from the pedal braking.',
  impact: [
    'The valve stays where it was when the failure began and ignores the handle.',
    'Jammed applied: the brakes stay applied with the handle OFF. Jammed released: no pressure with the handle ON.',
  ],
  alertIds: ['3200500'],
  effects: [
    {
      where: 'E/WD',
      text: `BRAKES PARK BRK FAULT, ${AMBER_CAUTION} and the WHEEL page, ${ONLY_ON_THE_GROUND}. The alert appears only if the brake pressure disagrees with the handle.`,
    },
    {
      where: 'E/WD',
      text: 'Handle OFF: BRK PRESS STILL APPLIED. Handle ON: BRK PRESS RELEASED, -PARK BRK OFF, then .BEFORE ENG SHUT DOWN: -CHOCKS CONSIDER.',
    },
    { where: 'Pedestal PARK BRK', text: 'The handle moves, but the brakes do not follow it.' },
  ],
  logbook: { required: true, reason: 'ECAM alert and a faulty parking brake' },
  clearing: MAINTENANCE_ONLY,
};

const MainWheelBrakeReleasedFamily: FailureDetailFamily = {
  ids: [
    A320Failure.MainWheel1BrakeReleased,
    A320Failure.MainWheel2BrakeReleased,
    A320Failure.MainWheel3BrakeReleased,
    A320Failure.MainWheel4BrakeReleased,
  ],
  detail: (number): FailureDetail => {
    const gear = number <= 2 ? 'left' : 'right';
    return {
      whatItIs:
        'Each main gear has two braked wheels, numbered 1 to 4 from left to right. With the normal braking each ' +
        'wheel brake is supplied by its own servo valve.',
      impact: [
        `The brake of wheel ${number} (${MAIN_WHEEL_NAMES[number - 1]}) no longer applies with the normal braking.`,
        `The ${gear} main gear loses half of its normal braking force; the braking becomes asymmetric.`,
        'The alternate braking is not affected.',
      ],
      alertIds: ['3200540'],
      effects: [
        {
          where: 'E/WD',
          text:
            'BRAKES RELEASED, crew awareness only, once an engine runs at idle with the gear down and the normal ' +
            `braking is in use. It is ${TAXI_AND_AFTER_LANDING}.`,
        },
        {
          where: 'SD STATUS',
          text: 'LDG DIST PROC APPLY and CAT 2 ONLY are shown. CAT 3 and AUTO BRK are inoperative.',
        },
      ],
      notSimulated: ['The WHEEL page does not show which wheel brake is released.'],
      logbook: { required: true, reason: 'ECAM alert and a released wheel brake' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const AlternateBrakeReleasedFamily: FailureDetailFamily = {
  ids: [A320Failure.AlternateBrakeLeftReleased, A320Failure.AlternateBrakeRightReleased],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'left' : 'right';
    const letter = number === 1 ? 'L' : 'R';
    return {
      whatItIs:
        'The alternate braking uses the yellow system, with one servo valve for each main gear. It brakes the ' +
        'wheels when the normal braking is lost.',
      impact: [
        `The brakes of the ${side} main gear no longer apply with the alternate braking.`,
        'Nothing changes while the normal braking works: the failure matters once the alternate braking is in use.',
      ],
      alertIds: [number === 1 ? '3200550' : '3200560'],
      effects: [
        {
          where: 'E/WD',
          text:
            `BRAKES ALTN ${letter} RELEASED with -ASYM BRK PROC APPLY, ${AMBER_CAUTION} and the WHEEL page. It shows ` +
            'only with the alternate braking in use, an engine at idle and the gear down.',
        },
        { where: 'E/WD', text: `It is ${TAXI_AND_AFTER_LANDING}.` },
        { where: 'SD STATUS', text: `LDG DIST PROC APPLY is shown. ALTN ${letter} BRK is inoperative.` },
      ],
      logbook: { required: true, reason: 'ECAM alert and a released alternate brake' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const NoseWheelSteeringPedalOrders: FailureDetail = {
  whatItIs:
    'The rudder pedals steer the nose wheel at low speed through the brake and steering control unit. The hand ' +
    'wheel steers it separately and takes priority at low speed.',
  impact: [
    'The pedals no longer give steering orders to the nose wheel. The hand wheel still works.',
    'The rudder itself and the braking are not affected.',
  ],
  alertIds: ['3200570'],
  effects: [
    {
      where: 'E/WD',
      text: `BRAKES N/WS MINOR FAULT, crew awareness only, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. It shows while a control channel works.`,
    },
    { where: 'Pedestal (tiller)', text: 'The hand wheel still steers; the rudder pedals no longer do.' },
  ],
  notSimulated: ['The autopilot rollout order is not blocked: it still reaches the nose wheel.'],
  logbook: { required: true, reason: 'ECAM message and lost pedal steering' },
  clearing: MAINTENANCE_ONLY,
};

const ShockAbsorberStuckExtendedFamily: FailureDetailFamily = {
  ids: [
    A320Failure.LeftShockAbsorberStuckExtended,
    A320Failure.RightShockAbsorberStuckExtended,
    A320Failure.NoseShockAbsorberStuckExtended,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each landing gear has proximity detectors on its shock absorber that tell the landing gear control ' +
      'interface units whether the gear carries the aircraft weight. The units use them as the ground signal.',
    impact: [
      `The detectors of the ${GEAR_NAMES[number - 1]} gear always read extended, also on the ground. Both units see it.`,
      number === 3
        ? 'On the ground the nose wheel steering is lost, as it needs the nose gear compressed.'
        : 'The main gear reads extended on the ground while the other main gear reads compressed.',
    ],
    alertIds: ['3200520'],
    effects: [
      {
        where: 'E/WD',
        text:
          'L/G SHOCK ABSORBER FAULT, crew awareness only, after 3 seconds, ' +
          'shown only below 80 kt after landing until 5 minutes after shutdown.',
      },
      number === 3
        ? {
            where: 'Pedestal (tiller)',
            text: 'The nose wheel does not follow the hand wheel or the pedals.',
          }
        : { where: 'E/WD', text: 'Nothing shows in flight: the alert is checked only on the ground after landing.' },
    ],
    notSimulated: ['The other systems that read the ground signal were not traced and may react.'],
    logbook: { required: true, reason: 'ECAM message and a faulty ground signal' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const ShockAbsorberStuckCompressedFamily: FailureDetailFamily = {
  ids: [
    A320Failure.LeftShockAbsorberStuckCompressed,
    A320Failure.RightShockAbsorberStuckCompressed,
    A320Failure.NoseShockAbsorberStuckCompressed,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each landing gear has proximity detectors on its shock absorber that tell the landing gear control ' +
      'interface units whether the gear carries the aircraft weight. The units use them as the ground signal.',
    impact: [
      `The detectors of the ${GEAR_NAMES[number - 1]} gear always read compressed, also in the air. Both units see it.`,
      'The warning is for a shock absorber that has not extended after lift-off.',
    ],
    alertIds: ['3200530'],
    effects: [
      {
        where: 'E/WD',
        text:
          `L/G SHOCK ABSORBER FAULT, ${AMBER_CAUTION} and the WHEEL page, after 3 seconds, from lift-off through ` +
          'approach, until the landing roll.',
      },
      {
        where: 'E/WD',
        text: 'With a gear not uplocked, it adds MAX SPEED 280/.67 and -L/G KEEP DOWN (or -L/G DOWN with the lever up).',
      },
      {
        where: 'SD STATUS',
        text: 'With a gear not uplocked, the limitations are listed and L/G RETRACT is inoperative.',
      },
    ],
    notSimulated: ['The other systems that read the ground signal were not traced and may react.'],
    logbook: { required: true, reason: 'ECAM alert and a faulty ground signal' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const TyreDeflatedFamily: FailureDetailFamily = {
  ids: [
    A320Failure.MainTyre1Deflated,
    A320Failure.MainTyre2Deflated,
    A320Failure.MainTyre3Deflated,
    A320Failure.MainTyre4Deflated,
    A320Failure.NoseTyreLeftDeflated,
    A320Failure.NoseTyreRightDeflated,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The tyre pressure indicating system is an option. It measures the pressure of the six tyres and shows it ' +
      'on the WHEEL page, with a caution when a tyre is low or differs too much from the other one on its axle.',
    impact: [
      `The ${TYRE_NAMES[number - 1]} tyre loses 10 PSI a minute.`,
      'Without the system installed, nothing shows.',
    ],
    alertIds: ['3200490'],
    effects: [
      {
        where: 'SD WHEEL',
        text: 'With the TPIS option, the tyre pressure falls and turns amber when it is low or differs too much from its axle mate.',
      },
      {
        where: 'E/WD',
        text:
          `With the TPIS option, WHEEL TYRE LO PR and the WHEEL page, ${AMBER_CAUTION}, after about 2 minutes on the ground or 4 in flight; not shown from ` +
          'take-off power set until 1,500 ft, nor on the landing roll above 80 kt.',
      },
    ],
    notSimulated: ['A flat tyre has no effect on braking, steering or the ground handling.'],
    logbook: { required: true, reason: 'ECAM caution and a low tyre pressure' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const TyreBurstFamily: FailureDetailFamily = {
  ids: [
    A320Failure.MainTyre1Burst,
    A320Failure.MainTyre2Burst,
    A320Failure.MainTyre3Burst,
    A320Failure.MainTyre4Burst,
    A320Failure.NoseTyreLeftBurst,
    A320Failure.NoseTyreRightBurst,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The tyre pressure indicating system is an option. It measures the pressure of the six tyres and shows it ' +
      'on the WHEEL page, with a caution when a tyre is low or differs too much from the other one on its axle.',
    impact: [
      `The ${TYRE_NAMES[number - 1]} tyre loses almost all its pressure within a minute.`,
      'Without the system installed, nothing shows.',
    ],
    alertIds: ['3200490'],
    effects: [
      {
        where: 'SD WHEEL',
        text: 'With the TPIS option, the tyre pressure falls to almost zero and turns amber within a few seconds.',
      },
      {
        where: 'E/WD',
        text:
          `With the TPIS option, WHEEL TYRE LO PR and the WHEEL page, ${AMBER_CAUTION}, within seconds; not shown from take-off power set until 1,500 ft, ` +
          'nor on the landing roll above 80 kt.',
      },
    ],
    notSimulated: ['A burst tyre has no effect on braking, steering, vibration or the ground handling.'],
    logbook: { required: true, reason: 'ECAM caution and a burst tyre' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata32BrakesEntries: Record<number, FailureDetail> = {
  [A320Failure.YellowBrakeAccumulatorGasLeak]: YellowAccumulatorGasLeak,
  [A320Failure.AlternateBrakingControlUnit]: AlternateBrakingControlUnit,
  [A320Failure.NormalBraking]: NormalBraking,
  [A320Failure.Autobrake]: Autobrake,
  [A320Failure.NoseWheelSteering]: NoseWheelSteering,
  [A320Failure.BrakeNormalSelectorValve]: BrakeNormalSelectorValve,
  [A320Failure.ParkingBrakeValveJammed]: ParkingBrakeValveJammed,
  [A320Failure.NoseWheelSteeringPedalOrders]: NoseWheelSteeringPedalOrders,
};

export const Ata32BrakesFamilies: FailureDetailFamily[] = [
  BrakeCircuitLeakFamily,
  BscuChannelFamily,
  MainWheelBrakeReleasedFamily,
  AlternateBrakeReleasedFamily,
  ShockAbsorberStuckExtendedFamily,
  ShockAbsorberStuckCompressedFamily,
  TyreDeflatedFamily,
  TyreBurstFamily,
];
