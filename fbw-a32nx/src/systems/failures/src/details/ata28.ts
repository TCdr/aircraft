// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Flight phases 3, 4, 5, 7 and 8: most FUEL cautions */
const NOT_SHOWN_FROM_TAKE_OFF_POWER =
  'not shown from take-off power set to 1,500 ft (or 2 min), nor from 800 ft on approach to 80 kt on landing';

/** Flight phases 3, 4, 5, 7, 8 and 9: the wing tank low level and low level detection alerts */
const NOT_SHOWN_AROUND_FLIGHT_AND_AFTER_LANDING =
  'not shown from take-off power set to 1,500 ft (or 2 min), from 800 ft on approach to 80 kt on landing, nor below 80 kt after landing until engine shutdown';

/** Flight phases 4, 5, 7 and 8: FUEL ENG 1(2) LP VALVE OPEN */
const NOT_SHOWN_ON_TAKE_OFF_AND_LANDING =
  'not shown on take-off from 80 kt to 1,500 ft (or 2 min), nor from 800 ft on approach to 80 kt on landing';

const CAUTION = 'a caution with master caution and single chime';

const WING_TANK_PUMP_DESCRIPTION =
  'Each wing has an inner tank with two electric pumps. They push fuel to the engine of their side, and through the ' +
  'X FEED valve to the other engine. With both pumps of a wing off, that engine is fed by gravity from its own tank, ' +
  'which only works up to a ceiling altitude.';

const PUMP_ALERTS = ['2800201', '2800202', '2800203', '2800204'] as const;

const TankPumpFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftTankPump1, A320Failure.LeftTankPump2, A320Failure.RightTankPump1, A320Failure.RightTankPump2],
  detail: (number): FailureDetail => {
    const wing = number <= 2 ? 'L' : 'R';
    const wingWord = wing === 'L' ? 'left' : 'right';
    const pump = number % 2 === 1 ? 1 : 2;
    const engine = wing === 'L' ? 1 : 2;
    return {
      whatItIs: WING_TANK_PUMP_DESCRIPTION,
      impact: [
        `The ${wingWord} wing tank pump ${pump} stops delivering, whatever its pb-sw says.`,
        'The other pump of the wing still feeds the engine, so the fuel flow is not affected.',
        `With both pumps of the ${wingWord} wing lost and the X FEED closed, engine ${engine} is fed by gravity.`,
        'Above the gravity feed ceiling the engine runs out of fuel after 3 min and flames out.',
      ],
      alertIds: [PUMP_ALERTS[number - 1], wing === 'L' ? '2800205' : '2800206'],
      effects: [
        {
          where: 'Overhead FUEL panel',
          text: `The ${wing} TK PUMPS ${pump} FAULT light comes on while its pb-sw is ON. It goes out with the pb-sw OFF.`,
        },
        {
          where: 'SD FUEL',
          text: 'The pump symbol shows an amber LO with the pb-sw ON, and an amber crossline with it OFF.',
        },
        {
          where: 'E/WD',
          text:
            `FUEL ${wing} TK PUMP ${pump} LO PR, ${CAUTION}, 2 s after the pressure is low with the pb-sw ON, ` +
            `${NOT_SHOWN_FROM_TAKE_OFF_POWER}. Its line -TK PUMP ${pump} OFF goes once it is done.`,
        },
        {
          where: 'E/WD',
          text:
            `Both pumps of the ${wingWord} wing lost: FUEL ${wing} TK PUMP 1 + 2 LO PR replaces the two singles, ` +
            'with its gravity feeding lines, same phases.',
        },
        {
          where: 'SD STATUS',
          text: `INOP SYS ${wing} TK PUMP is listed (${wing} TK PUMPS with both pumps lost).`,
        },
      ],
      logbook: { required: true, reason: 'ECAM caution and a lost tank pump' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const CENTRE_TRANSFER_DESCRIPTION =
  'The centre tank has no pumps of its own. When a centre tank transfer valve is open, the flow of the inner tank ' +
  'pumps drives a jet pump that draws centre tank fuel into the inner tank of that wing. The CTR TK XFR pb-sw and the ' +
  'FUEL MODE SEL pb-sw control the valve, and the fuel computer opens and closes it as the inner tank level goes.';

const CentreTransferValveFamily: FailureDetailFamily = {
  ids: [A320Failure.CentreTankLeftTransferValveJammed, A320Failure.CentreTankRightTransferValveJammed],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'L' : 'R';
    const sideWord = number === 1 ? 'left' : 'right';
    return {
      whatItIs: CENTRE_TRANSFER_DESCRIPTION,
      impact: [
        `The ${sideWord} centre tank transfer valve stays as it was when the failure came: open if it was at least half open.`,
        'Jammed open, the transfer goes on whatever the pb-sw, the mode selector and the fuel computer say.',
        'Jammed closed, the centre tank fuel on that side cannot be moved, even in MAN mode.',
      ],
      alertIds: [
        number === 1 ? '2800211' : '2800212',
        '2800213',
        number === 1 ? '2800214' : '2800215',
        '2800216',
        number === 1 ? '2800240' : '2800241',
      ],
      effects: [
        {
          where: 'E/WD',
          text:
            `FUEL CTR ${side} XFR FAULT, ${CAUTION}, 5 s after the valve should have moved: VALVE NOT FULLY CLOSED ` +
            `when jammed open, VALVE NOT FULLY OPEN when jammed closed. ${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
        },
        {
          where: 'E/WD',
          text: 'Both valves jammed the same way: FUEL CTR L + R XFR FAULT replaces the two singles, same phases.',
        },
        {
          where: 'E/WD',
          text:
            `Jammed open: FUEL ${side} WING TK OVERFLOW, ${CAUTION}, 10 s after the inner tank is full. ` +
            'Centre tank fuel must keep coming in with a wing pump running. Same phases.',
        },
        {
          where: 'Overhead FUEL panel',
          text: `The CTR TK ${side} XFR FAULT light comes on with the wing tank overflow.`,
        },
        {
          where: 'SD FUEL',
          text: 'Both valves jammed closed: the centre tank quantity is boxed amber and the FOB gets a half amber box.',
        },
        {
          where: 'SD STATUS',
          text: `INOP SYS CTR TK ${side} XFR is listed (CTR TK XFR with both valves).`,
        },
      ],
      logbook: { required: true, reason: 'ECAM caution and a jammed transfer valve' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const EngineLpValveFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1LpValveJammed, A320Failure.Eng2LpValveJammed],
  detail: (number): FailureDetail => {
    const engine = number;
    return {
      whatItIs:
        'Each engine has a low pressure (LP) fuel valve on its feed line. The ENG MASTER switch of the engine opens ' +
        'and closes it, and so does the ENG FIRE pb when it is pushed.',
      impact: [
        `The engine ${engine} LP fuel valve stays where it was, whatever ENG MASTER ${engine} and the ENG FIRE pb say.`,
        'Jammed open, the engine still stops with its ENG MASTER, which also closes the HP valve.',
        'The valve can only jam closed with the engine off: the next start is starved, so the engine cannot be started.',
      ],
      alertIds: [number === 1 ? '2800230' : '2800231'],
      effects: [
        {
          where: 'E/WD',
          text:
            `FUEL ENG ${engine} LP VALVE OPEN, ${CAUTION}, once the valve is still open about 2.7 s after the ENG MASTER OFF or the ENG FIRE pb. ` +
            'It has no action line.',
        },
        { where: 'E/WD', text: `The alert is ${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}.` },
        {
          where: 'SD FUEL',
          text: `The engine ${engine} LP valve symbol is amber: open with the ENG MASTER OFF, or closed with it ON.`,
        },
      ],
      notSimulated: ['A valve that stays closed raises no alert on this aircraft.'],
      logbook: { required: true, reason: 'ECAM caution and a jammed fuel valve' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const FqiChannelFamily: FailureDetailFamily = {
  ids: [A320Failure.FqiChannel1, A320Failure.FqiChannel2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The fuel quantity indicating computer (FQI) works out the fuel quantity of each tank from the probes, and ' +
      'drives the fuel indications. It has two channels, and one channel is enough to keep the indications.',
    impact: [
      `FQI channel ${number} fails. The other channel keeps the fuel quantity indications.`,
      'Nothing else changes: the fuel system works as before.',
    ],
    alertIds: [number === 1 ? '2800232' : '2800233'],
    effects: [
      {
        where: 'E/WD',
        text: `FUEL FQI CH ${number} FAULT, ${CAUTION}, ${NOT_SHOWN_FROM_TAKE_OFF_POWER}. It has no action line.`,
      },
    ],
    notSimulated: ['The loss of the fuel quantities when both channels are failed is not simulated.'],
    logbook: { required: true, reason: 'ECAM caution and a failed FQI channel' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const OuterTransferFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftOuterTankTransferValvesJammed, A320Failure.RightOuterTankTransferValvesJammed],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'L' : 'R';
    const sideWord = number === 1 ? 'left' : 'right';
    return {
      whatItIs:
        'Each wing has an outer tank that drains into the inner tank through two transfer valves. They open on their own ' +
        'when the inner tank reaches its low level, and close when the outer tank is full again after refuelling.',
      impact: [
        `The two transfer valves of the ${sideWord} outer tank stay where they were, whatever the fuel computer says.`,
        'Jammed closed, the outer tank fuel cannot drain into the inner tank, so it cannot be used.',
        'Jammed open, the outer tank drains before the inner tank is low.',
      ],
      alertIds: [number === 1 ? '2800236' : '2800237', number === 1 ? '2800238' : '2800239'],
      effects: [
        {
          where: 'E/WD',
          text:
            `Jammed closed: FUEL ${side} OUTER XFR CLOSED, ${CAUTION}, 5 s after the inner tank reaches its low level, ` +
            `${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
        },
        {
          where: 'E/WD',
          text: `Jammed open: FUEL ${side} OUTER XFR OPEN, ${CAUTION}, 5 s after the valves should be closed, same phases.`,
        },
        {
          where: 'SD FUEL',
          text: 'Jammed closed: the outer tank quantity is boxed amber and the FOB gets a half amber box.',
        },
        {
          where: 'SD STATUS',
          text: `Jammed closed: ${side} OUTER TK UNUSABLE. Jammed open: INOP SYS ${side} CELL VALVE.`,
        },
      ],
      logbook: { required: true, reason: 'ECAM caution and a jammed transfer valve' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const LowLevelSensorFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftWingTankLowLevelSensor, A320Failure.RightWingTankLowLevelSensor],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'L' : 'R';
    const sideWord = number === 1 ? 'left' : 'right';
    return {
      whatItIs:
        'A low level sensor in each wing tank triggers the LO LVL warning when the tank holds less than about 750 kg. ' +
        'It works independently of the fuel quantity indication.',
      impact: [
        `The ${sideWord} wing tank low level sensor fails, so a low ${sideWord} tank no longer warns the crew.`,
        'With the sensors of both wings failed the crew gets a maintenance message.',
      ],
      alertIds: ['2800242'],
      effects: [
        {
          where: 'E/WD',
          text: `${side} WING TK LO LVL no longer shows below 750 kg, and nothing replaces it.`,
        },
        {
          where: 'E/WD',
          text: `Both sensors failed: FUEL LO LVL DET FAULT, ${CAUTION}, ${NOT_SHOWN_AROUND_FLIGHT_AND_AFTER_LANDING}.`,
        },
      ],
      logbook: { required: true, reason: 'a lost low level warning' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const WingLeakFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftWingTankLeak, A320Failure.RightWingTankLeak],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'L' : 'R';
    const sideWord = number === 1 ? 'left' : 'right';
    return {
      whatItIs:
        'The wing tanks hold the fuel the engines burn. The fuel used counters add up what the engines burn, so the fuel ' +
        'on board plus the fuel used must match the fuel at engine start.',
      impact: [
        `The ${sideWord} inner tank loses 3,000 kg/h until it is empty. The loss is not counted in the fuel used.`,
        'The wings become unbalanced, and the leaking side runs low. No E/WD imbalance alert is raised.',
      ],
      alertIds: [
        number === 1 ? '2800130' : '2800140',
        '2800145',
        '2800235',
        ...(number === 1 ? ['2800201', '2800202', '2800205'] : ['2800203', '2800204', '2800206']),
      ],
      effects: [
        {
          where: 'E/WD',
          text:
            `FUEL F.USED/FOB DISAGREE, ${CAUTION}, 60 s after the fuel on board plus the fuel used is 1,500 kg ` +
            'below the fuel at engine start (about 30 min).',
        },
        { where: 'E/WD', text: 'FUEL F.USED/FOB DISAGREE shows only in climb, cruise and descent above 800 ft.' },
        {
          where: 'E/WD',
          text:
            `FUEL ${side} WING TK LO LVL, ${CAUTION}, 30 s after the ${sideWord} inner tank is below 750 kg, ` +
            `${NOT_SHOWN_AROUND_FLIGHT_AND_AFTER_LANDING}.`,
        },
        {
          where: 'E/WD',
          text: 'Both wings leaking: FUEL L + R WING TK LO LVL replaces the single cautions, same phases.',
        },
        {
          where: 'E/WD',
          text:
            `Once the ${sideWord} inner tank is empty its pumps lose pressure (with their pb-sw ON): FUEL ${side} TK PUMP 1 and 2 LO PR show ` +
            `after 2 s, then FUEL ${side} TK PUMP 1 + 2 LO PR replaces the two singles. Same phases as the pump alerts.`,
        },
        {
          where: 'E/WD',
          text: `The FUEL ${side} WING TK LO LVL procedure includes the FUEL IMBALANCE: lines.`,
        },
        {
          where: 'SD FUEL',
          text: 'The inner tank quantity of that side falls faster than the other.',
        },
        {
          where: 'SD FUEL',
          text:
            'When the wings differ by more than 1,500 kg during engine start and taxi, or in climb, cruise and ' +
            'descent above 800 ft, the inner and outer tank quantities of the heavier wing pulse.',
        },
      ],
      logbook: { required: true, reason: 'ECAM caution and a fuel leak' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const IdgCoolingFamily: FailureDetailFamily = {
  ids: [A320Failure.Idg1FuelCoolingCommand, A320Failure.Idg2FuelCoolingCommand],
  detail: (number): FailureDetail => ({
    whatItIs:
      'At low thrust the engine computer sends part of the fuel that cooled the IDG oil back to the wing tank. This ' +
      'fuel recirculation cools the IDG oil, and the computer raises the idle if the oil keeps getting hotter.',
    impact: [
      `The recirculation command of engine ${number} is lost and its fuel return valve stays closed.`,
      `The oil of IDG ${number} is no longer cooled with fuel, so it can run hotter at low thrust.`,
    ],
    alertIds: [number === 1 ? '2800260' : '2800261'],
    effects: [
      {
        where: 'E/WD',
        text:
          `FUEL IDG ${number} COOL FAULT, crew awareness only (no master caution, no chime). ` +
          'Shown only before the first engine start and 5 min after shutdown. It has no action line and no STATUS entry.',
      },
    ],
    logbook: { required: true, reason: 'ECAM message and a maintenance action' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata28Entries: Record<number, FailureDetail> = {
  [A320Failure.CrossFeedValveJammed]: {
    whatItIs:
      'The X FEED valve joins the fuel feed lines of the two wings. It is closed in normal operation so that each wing ' +
      'feeds its own engine, and opened with the X FEED pb-sw to feed both engines from one side.',
    impact: [
      'The valve stays where it was when the failure came, whatever the X FEED pb-sw says.',
      'Jammed open, the two wings stay joined. Jammed closed, one side cannot feed the other.',
      'The X FEED pb-sw and the valve then disagree.',
    ],
    alertIds: ['2800210'],
    effects: [
      {
        where: 'E/WD',
        text:
          `FUEL X FEED VALVE FAULT, ${CAUTION}, 5 s after the valve disagrees with the pb-sw, ` +
          `${NOT_SHOWN_FROM_TAKE_OFF_POWER}. It has no action line.`,
      },
      {
        where: 'SD FUEL',
        text: 'The X FEED valve symbol turns amber: open with the pb-sw OFF, or closed with it ON.',
      },
      {
        where: 'Overhead FUEL panel',
        text: 'The OPEN light follows the real valve position, so it does not agree with the ON light.',
      },
      {
        where: 'SD STATUS',
        text: 'INOP SYS FUEL X FEED is listed.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and a valve that does not follow the pb-sw' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.ApuLpValveJammed]: {
    whatItIs:
      'The APU takes its fuel from the left feed line through its own LP fuel valve. The APU MASTER SW opens it, and ' +
      'the APU FIRE pb closes it.',
    impact: [
      'The valve stays where it was, whatever the APU MASTER SW and the APU FIRE pb say.',
      'Jammed closed with the MASTER SW ON, no fuel reaches the APU: the ECB shuts it down for low fuel pressure.',
      'Jammed open, the APU is not affected.',
    ],
    alertIds: ['2800234', '4900101'],
    effects: [
      {
        where: 'E/WD',
        text:
          `FUEL APU LP VALVE FAULT, ${CAUTION}, 4 s after the valve position disagrees with the selected position, ` +
          `${NOT_SHOWN_FROM_TAKE_OFF_POWER}. It has no action line.`,
      },
      {
        where: 'E/WD',
        text:
          `Jammed closed: APU AUTO SHUT DOWN, ${CAUTION}, ${NOT_SHOWN_FROM_TAKE_OFF_POWER}. ` +
          'The line -MASTER SW OFF goes once it is done.',
      },
      {
        where: 'SD APU',
        text: 'Jammed closed: FUEL LO PR shows.',
      },
      {
        where: 'Overhead APU panel',
        text: 'Jammed closed: the MASTER SW FAULT light comes on and the START ON light goes out.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and a jammed APU fuel valve' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.FuelTankInertingSystem]: {
    whatItIs:
      'The fuel tank inerting system fills the empty space of the tanks with nitrogen-enriched air to keep the fuel ' +
      'vapour from igniting. It works from the first engine start to the last engine stop.',
    impact: [
      'The inerting system is lost for the rest of the flight, with no direct effect on the fuel system.',
      'It matters for dispatch and maintenance only.',
    ],
    alertIds: ['2800270'],
    effects: [
      {
        where: 'E/WD',
        text:
          `FUEL INERTING SYS FAULT, crew awareness only (no master caution, no chime), with an engine running, ` +
          `${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
      },
      {
        where: 'SD STATUS',
        text: 'INOP SYS FUEL INERT is listed.',
      },
    ],
    notSimulated: ['The inerting system has no model: the failure only raises the alert.'],
    logbook: { required: true, reason: 'ECAM message and a failed inerting system' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata28Families: FailureDetailFamily[] = [
  TankPumpFamily,
  CentreTransferValveFamily,
  EngineLpValveFamily,
  FqiChannelFamily,
  OuterTransferFamily,
  LowLevelSensorFamily,
  WingLeakFamily,
  IdgCoolingFamily,
];
