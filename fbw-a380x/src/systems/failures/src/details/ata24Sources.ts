// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'a caution with master caution and single chime';

const STATUS_NOTE = 'while the alert is shown';

// A phase inhibition only stops a NEW alert from being shown: one that is already up stays.
const RCL_NOTE = 'holding RCL for 3 s shows it until the flight phase changes';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 1, 3 to 7, 9, 10 and 12 */
const NOT_SHOWN_PHASES_1_3_TO_7_9_10_12 =
  'a new alert is not shown with the engines off on the ground, from take-off power to 1,500 ft, nor from 800 ft on ' +
  'approach until the landing roll is below 80 kt';

/** Alerts inhibited in flight phases 1, 4 to 7, 9, 10 and 12 */
const NOT_SHOWN_PHASES_1_4_TO_7_9_10_12 =
  'a new alert is not shown with the engines off on the ground, from 80 kt on take-off to 1,500 ft, nor from 800 ft ' +
  'on approach until the landing roll is below 80 kt';

/** Alerts inhibited in flight phases 3 to 10 */
const SHOWN_ON_GROUND_AT_LOW_SPEED_ONLY =
  'a new alert is shown only on the ground before take-off power or once the landing roll is below 80 kt';

/** Alerts inhibited in flight phases 3 to 11 */
const SHOWN_ON_GROUND_BEFORE_TAKE_OFF_OR_AFTER_SHUTDOWN_ONLY =
  'a new alert is shown only on the ground before take-off power or after engine shutdown';

/** Alerts inhibited in flight phases 2 to 11 */
const NOT_SHOWN_PHASES_2_TO_11 = 'a new alert is not shown from the first engine start until engine shutdown';

/** STATUS of the loss of an engine generator, with the APU not available */
const ENGINE_GENERATOR_LOST_STATUS =
  `is listed as inoperative ${STATUS_NOTE}; with the APU not available CAT 3 DUAL is listed as inoperative for ` +
  'approach and landing and CAT 3 SINGLE ONLY as information';

// ---------------------------------------------------------------------------------------------------------------------
// Transformer rectifiers
// ---------------------------------------------------------------------------------------------------------------------

const TR_FAULT_ALERTS = ['240800081', '240800082'] as const;
const TR_SUPPLY_BUS = ['AC 2', 'AC 3'] as const;
const TR_DC_BUS = ['DC 1', 'DC 2'] as const;

const TransformerRectifierMainFamily: FailureDetailFamily = {
  ids: [A380Failure.TransformerRectifier1, A380Failure.TransformerRectifier2],
  detail: (number): FailureDetail => ({
    whatItIs:
      `A transformer rectifier (TR) turns the 115 V AC of a busbar into 28 V DC. TR ${number} takes its power from ` +
      `the ${TR_SUPPLY_BUS[number - 1]} busbar and supplies the ${TR_DC_BUS[number - 1]} busbar. It also controls the ` +
      'charging of its own battery and the connection of that battery to the busbar.',
    impact: [
      `TR ${number} gives no output. With the BUS TIE pb-sw in AUTO the other main TR supplies both DC busbars through ` +
        'the DC bus tie, so no DC busbar is lost.',
      'The TR line contactor opens after 3 s without output, and the DC bus tie then closes if the BUS TIE pb-sw is in ' +
        'AUTO. With the BUS TIE pb-sw OFF the DC bus tie does not close, so the DC busbar of this TR is not re-supplied.',
      `After 5 s BAT ${number} also leaves the DC ${number} busbar: it is no longer charged and its hot busbar runs on ` +
        'the battery alone.',
    ],
    alertIds: [TR_FAULT_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ELEC TR ${number} FAULT, ${ADVISORY}, while the ${TR_SUPPLY_BUS[number - 1]} busbar is powered` +
          `${number === 2 ? ' (or while external power feeds TR 2 directly during ground servicing)' : ''}; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}. It has no procedure line.`,
      },
      {
        where: 'SD ELEC AC',
        text: `The TR ${number} label and its triangle turn amber.`,
      },
      {
        where: 'SD ELEC DC',
        text: `The TR ${number} title turns amber and its voltage and current read zero in amber.`,
      },
      {
        where: 'SD ELEC DC',
        text: `After 5 s the BAT ${number} to busbar wire disappears (battery contactor open).`,
      },
      {
        where: 'SD STATUS',
        text: `TR ${number} is listed as inoperative ${STATUS_NOTE}.`,
      },
    ],
    logbook: { required: true, reason: 'advisory alert and a lost transformer rectifier' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const TransformerRectifierEssEntry: FailureDetail = {
  whatItIs:
    'The essential transformer rectifier (ESS TR) turns the 115 V AC of the AC ESS busbar into 28 V DC for the DC ESS ' +
    'busbar. It also controls the charging of BAT ESS and the connection of that battery to the busbar.',
  impact: [
    'ESS TR gives no output. Once its line contactor has opened (after 3 s), DC ESS is supplied from DC 1 through the ' +
      'DC bus line, so the busbar is not lost.',
    'After 5 s ESS BAT also leaves the DC ESS busbar: it is no longer charged and its hot busbar runs on the battery ' +
      'alone.',
  ],
  alertIds: ['240800083'],
  effects: [
    {
      where: 'E/WD',
      text:
        `ELEC TR ESS FAULT, ${ADVISORY}, while the AC ESS busbar is powered; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. ` +
        'It has no procedure line.',
    },
    {
      where: 'SD ELEC AC',
      text: 'The ESS TR label and its triangle turn amber.',
    },
    {
      where: 'SD ELEC DC',
      text: 'The ESS TR title turns amber and its voltage and current read zero in amber.',
    },
    {
      where: 'SD ELEC DC',
      text: 'After 5 s the ESS BAT to busbar wire disappears (battery contactor open).',
    },
    {
      where: 'SD STATUS',
      text: `TR ESS is listed as inoperative ${STATUS_NOTE}.`,
    },
  ],
  logbook: { required: true, reason: 'advisory alert and a lost transformer rectifier' },
  clearing: MAINTENANCE_ONLY,
};

const TransformerRectifierApuEntry: FailureDetail = {
  whatItIs:
    'The APU transformer rectifier (APU TR) turns the 115 V AC of the AC 4 busbar into 28 V DC for the DC APU ' +
    'busbar, which holds the APU start motor supply. It also recharges the APU battery.',
  impact: [
    'APU TR gives no output. The DC APU busbar is then supplied by the APU battery alone.',
    'The APU battery is no longer recharged, so each APU start draws it down.',
  ],
  alertIds: ['240800016'],
  effects: [
    {
      where: 'E/WD',
      text:
        `ELEC APU TR FAULT, ${ADVISORY}, while the AC 4 busbar is powered; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its ` +
        'line is WHEN APU NOT RQRD : APU BAT OFF, shown only while the APU master switch is OFF.',
    },
    {
      where: 'E/WD',
      text:
        'While this alert is shown, ELEC APU BAT OFF is not raised for an APU battery that is switched off. If the ' +
        'APU BAT is faulty too, APU START NOT AVAIL is added as information.',
    },
    {
      where: 'SD ELEC AC',
      text: 'The APU TR label and its triangle turn amber.',
    },
    {
      where: 'SD ELEC DC',
      text: 'The APU TR voltage reads zero in amber; its title stays white.',
    },
    {
      where: 'SD STATUS',
      text: `APU TR is listed as inoperative ${STATUS_NOTE}.`,
    },
  ],
  logbook: { required: true, reason: 'advisory alert and a lost transformer rectifier' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// Static inverter
// ---------------------------------------------------------------------------------------------------------------------

const StaticInverterEntry: FailureDetail = {
  whatItIs:
    'The static inverter turns DC from BAT 1 and BAT ESS into 115 V AC at a constant 400 Hz. It supplies the AC ' +
    'EMER busbar during RAT extension and after landing (below 140 kt), and in the simulation also on the ground on ' +
    'batteries only.',
  impact: [
    'The inverter gives no output, so the AC EMER busbar stays unpowered whenever it would depend on it: on the ' +
      'ground on batteries only, during RAT extension, and after landing.',
    'While AC busbars or the RAT generator are supplying the aircraft, the inverter is not used and nothing changes.',
  ],
  alertIds: ['240800080'],
  effects: [
    {
      where: 'E/WD',
      text:
        `ELEC STATIC INV FAULT, ${ADVISORY}, only while the inverter is in use (its contactor closed) and gives no ` +
        `normal output, which needs BAT 1 and BAT ESS connected and the AC ESS busbar unpowered; ` +
        `${SHOWN_ON_GROUND_AT_LOW_SPEED_ONLY}; ${RCL_NOTE}. It has no procedure line.`,
    },
    {
      where: 'E/WD',
      text:
        'It appears at power-up with the aircraft on batteries only, when the static inverter should feed AC EMER, ' +
        'and AC EMER then stays unpowered.',
    },
    {
      where: 'SD ELEC AC',
      text: 'The STAT INV triangle turns amber while the inverter is in use and has no normal output.',
    },
  ],
  logbook: { required: true, reason: 'advisory alert at power-up and AC EMER not supplied on batteries' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// Engine generators
// ---------------------------------------------------------------------------------------------------------------------

const GEN_FAULT_ALERTS = ['240800061', '240800062', '240800063', '240800064'] as const;

const EngineGeneratorFamily: FailureDetailFamily = {
  ids: [A380Failure.Generator1, A380Failure.Generator2, A380Failure.Generator3, A380Failure.Generator4],
  detail: (number): FailureDetail => ({
    whatItIs:
      `Engine ${number} drives one generator that supplies 115 V AC at a frequency between 360 and 800 Hz, depending ` +
      `on the engine speed. It normally feeds the AC ${number} busbar through its own contactor. The four engine ` +
      'generators are the main power source of the aircraft.',
    impact: [
      `Generator ${number} gives no output and its contactor opens.`,
      `The other generators take over the AC ${number} busbar through the bus ties, so no busbar is lost while two ` +
        'generators work.',
      'The galleys can be shed if only two generators are left to supply the network.',
    ],
    alertIds: [GEN_FAULT_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ELEC GEN ${number} FAULT, ${CAUTION}, with the engine running, the GEN pb-sw ON, the drive connected and ` +
          `ENG FIRE pb not released; ${NOT_SHOWN_PHASES_1_3_TO_7_9_10_12}. Its line is GEN ${number} OFF. It stays ` +
          'after the GEN pb-sw is set OFF, and ends when the failure is restored or the engine is shut down.',
      },
      {
        where: 'Overhead ELEC panel',
        text: `The GEN ${number} pb-sw FAULT light comes on while the pb-sw is ON.`,
      },
      {
        where: 'SD ELEC AC',
        text: `The GEN ${number} label turns amber, and its voltage reads zero in amber while the pb-sw is ON.`,
      },
      {
        where: 'SD STATUS',
        text: `GEN ${number} ${ENGINE_GENERATOR_LOST_STATUS}.`,
      },
    ],
    logbook: { required: true, reason: 'caution and a lost engine generator' },
    clearing:
      `${MAINTENANCE_ONLY} Then set the GEN ${number} pb-sw back to ON: with the pb-sw still OFF after Restore, ELEC GEN ` +
      `${number} OFF follows until it is set ON.`,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// APU generators
// ---------------------------------------------------------------------------------------------------------------------

const APU_GEN_FAULT_ALERTS = ['240800014', '240800015'] as const;
const APU_GEN_LETTER = ['A', 'B'] as const;

const ApuGeneratorFamily: FailureDetailFamily = {
  ids: [A380Failure.ApuGenerator1, A380Failure.ApuGenerator2],
  detail: (number): FailureDetail => {
    const letter = APU_GEN_LETTER[number - 1];
    return {
      whatItIs:
        'The APU drives two generators, APU GEN A and APU GEN B, that give 115 V AC at 400 Hz. On the ground the ' +
        'two together can supply the whole network; in flight only one is connected. An APU generator can replace ' +
        'any engine generator.',
      impact: [
        `APU GEN ${letter} gives no output and is no longer a source for the network.`,
        'In flight the other APU generator is used when this one has failed.',
        'The engine generators are not affected.',
      ],
      alertIds: [APU_GEN_FAULT_ALERTS[number - 1]],
      effects: [
        {
          where: 'E/WD',
          text:
            `ELEC APU GEN ${letter} FAULT, ${CAUTION}, while the APU is available; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. ` +
            `Its line is APU GEN ${letter} OFF.`,
        },
        {
          where: 'Overhead ELEC panel',
          text: `The APU GEN ${letter} pb-sw FAULT light comes on while the APU is available and the pb-sw is ON.`,
        },
        {
          where: 'SD ELEC AC',
          text: `With the APU master switch and the pb-sw ON, the APU GEN ${letter} voltage and frequency read zero in amber.`,
        },
        {
          where: 'SD STATUS',
          text: `APU GEN ${letter} is listed as inoperative ${STATUS_NOTE}.`,
        },
      ],
      logbook: { required: true, reason: 'caution and a lost APU generator' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Batteries
// ---------------------------------------------------------------------------------------------------------------------

const Battery1Entry: FailureDetail = {
  whatItIs:
    'BAT 1 is permanently connected to its hot busbar and, with the BAT 1 pb-sw in AUTO, to DC 1. Its charging and ' +
    'its connection are controlled by TR 1. With ESS BAT it also backs up the DC ESS busbar and feeds the static ' +
    'inverter.',
  impact: [
    'BAT 1 detects the failure at once: its battery contactor opens and the battery leaves the DC 1 busbar.',
    'On batteries only, BAT 1 no longer supplies DC ESS: ESS BAT does it alone.',
    'On batteries only, its emergency contactor does not close unless the RAT has deployed, so the static inverter ' +
      'cannot be supplied.',
  ],
  alertIds: ['240800017'],
  effects: [
    {
      where: 'E/WD',
      text: `ELEC BAT 1 FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is BAT 1 OFF.`,
    },
    {
      where: 'Overhead ELEC panel',
      text: 'The BAT 1 pb-sw FAULT light comes on, and stays on in either pb-sw position.',
    },
    {
      where: 'SD ELEC DC',
      text: 'The BAT 1 to busbar wire disappears (battery contactor open); the title stays white.',
    },
    {
      where: 'SD STATUS',
      text:
        `BAT 1 is listed as inoperative ${STATUS_NOTE}; with BAT 2 faulty too, BAT 1+2 is listed instead. Setting ` +
        'BAT 1 OFF afterwards does not raise ELEC BAT 1 OFF while the FAULT light is on.',
    },
  ],
  logbook: { required: true, reason: 'caution and a lost battery' },
  clearing: MAINTENANCE_ONLY,
};

const Battery2Entry: FailureDetail = {
  whatItIs:
    'BAT 2 is permanently connected to its hot busbar and, with the BAT 2 pb-sw in AUTO, to DC 2. Its charging and ' +
    'its connection are controlled by TR 2.',
  impact: [
    'BAT 2 detects the failure at once: its battery contactor opens and the battery leaves the DC 2 busbar.',
    'DC 2 no longer has a battery to cover source changes.',
  ],
  alertIds: ['240800018'],
  effects: [
    {
      where: 'E/WD',
      text: `ELEC BAT 2 FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is BAT 2 OFF.`,
    },
    {
      where: 'Overhead ELEC panel',
      text: 'The BAT 2 pb-sw FAULT light comes on, and stays on in either pb-sw position.',
    },
    {
      where: 'SD ELEC DC',
      text: 'The BAT 2 to busbar wire disappears (battery contactor open); the title stays white.',
    },
    {
      where: 'SD STATUS',
      text:
        `BAT 2 is listed as inoperative ${STATUS_NOTE}; with BAT 1 faulty too, BAT 1+2 is listed instead. Setting ` +
        'BAT 2 OFF afterwards does not raise ELEC BAT 2 OFF while the FAULT light is on.',
    },
  ],
  logbook: { required: true, reason: 'caution and a lost battery' },
  clearing: MAINTENANCE_ONLY,
};

const BatteryEssEntry: FailureDetail = {
  whatItIs:
    'ESS BAT is permanently connected to its hot busbar and, with the BAT ESS pb-sw in AUTO, to the DC ESS busbar. ' +
    'ESS TR controls its charging and its connection. It backs up DC ESS and feeds the static inverter with BAT 1.',
  impact: [
    'ESS BAT detects the failure at once: its battery contactor opens and the battery leaves the DC ESS busbar.',
    'On batteries only, BAT 1 alone supplies DC ESS.',
    'The static inverter needs the lines of both BAT 1 and ESS BAT closed, so it can no longer be supplied.',
  ],
  alertIds: ['240800087'],
  effects: [
    {
      where: 'E/WD',
      text: `ELEC BAT ESS FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is BAT ESS OFF.`,
    },
    {
      where: 'Overhead ELEC panel',
      text: 'The BAT ESS pb-sw FAULT light comes on, and stays on in either pb-sw position.',
    },
    {
      where: 'SD ELEC DC',
      text: 'The ESS BAT to busbar wire disappears (battery contactor open); the title stays white.',
    },
    {
      where: 'SD STATUS',
      text:
        `BAT ESS is listed as inoperative ${STATUS_NOTE}. Setting BAT ESS OFF afterwards does not raise ELEC BAT ` +
        'ESS OFF while the FAULT light is on.',
    },
  ],
  logbook: { required: true, reason: 'caution and a lost battery' },
  clearing: MAINTENANCE_ONLY,
};

const BatteryApuEntry: FailureDetail = {
  whatItIs:
    'The APU battery is assigned to the APU start. It is permanently connected to its hot busbar and, with the APU ' +
    'BAT pb-sw in AUTO, to the DC APU busbar that feeds the start motor. The APU TR recharges it.',
  impact: [
    'The APU battery detects the failure at once: its battery contactor opens and it leaves the DC APU busbar.',
    'The APU start motor then has a supply only while the APU TR is fed by the AC 4 busbar.',
  ],
  alertIds: ['240800013'],
  effects: [
    {
      where: 'E/WD',
      text:
        `ELEC APU BAT FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its line is APU BAT OFF. If the APU TR is faulty ` +
        'too, APU BAT START NOT AVAIL is added as information.',
    },
    {
      where: 'Overhead ELEC panel',
      text: 'The APU BAT pb-sw FAULT light comes on, and stays on in either pb-sw position.',
    },
    {
      where: 'SD ELEC DC',
      text: 'The APU BAT to busbar wire disappears (battery contactor open); the title stays white.',
    },
    {
      where: 'SD STATUS',
      text:
        `APU BAT is listed as inoperative ${STATUS_NOTE}. Setting APU BAT OFF afterwards does not raise ELEC APU BAT ` +
        'OFF while the FAULT light is on.',
    },
  ],
  logbook: { required: true, reason: 'caution and a lost battery' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// External power
// ---------------------------------------------------------------------------------------------------------------------

const EXT_PWR_FAULT_ALERTS = ['240800056', '240800057', '240800058', '240800059'] as const;

function externalPowerDetail(unit: number, extraImpact: readonly string[]): FailureDetail {
  return {
    whatItIs:
      `On the ground, up to four external power units (EXT 1 to EXT 4) can be connected. EXT ${unit} gives 115 V AC ` +
      `at 400 Hz through its own contactor, controlled by the GGPCU that also controls generator ${unit}. Two units ` +
      'are enough for the whole network.',
    impact: [
      `The GGPCU of EXT ${unit} keeps its contactor open, so the unit supplies nothing even when it is connected ` +
        'and available.',
      'The other external power units, the APU generators and the engine generators are not affected.',
      ...extraImpact,
    ],
    alertIds: [EXT_PWR_FAULT_ALERTS[unit - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ELEC EXT PWR ${unit} FAULT, ${ADVISORY}, only while the unit is connected; ` +
          `${SHOWN_ON_GROUND_AT_LOW_SPEED_ONLY}; ${RCL_NOTE}. Its line is EXT PWR ${unit} P/B RECYCLE, done once ` +
          'the pb has been set OFF and then ON again.',
      },
      {
        where: 'SD ELEC AC',
        text: `The EXT ${unit} line contactor triangle stays white (contactor open) with the unit connected.`,
      },
      {
        where: 'SD STATUS',
        text: `EXT PWR ${unit} is listed as inoperative ${STATUS_NOTE}.`,
      },
    ],
    logbook: { required: true, reason: 'advisory alert and a lost external power unit' },
    clearing: MAINTENANCE_ONLY,
  };
}

const ExternalPower1Entry: FailureDetail = externalPowerDetail(1, [
  'With no other AC source, EXT 1 no longer supplies the AC GND/FLT service busbar or TR 2.',
]);

const ExternalPowerOtherFamily: FailureDetailFamily = {
  ids: [A380Failure.ExternalPower2, A380Failure.ExternalPower3, A380Failure.ExternalPower4],
  detail: (position): FailureDetail => externalPowerDetail(position + 1, []),
};

// ---------------------------------------------------------------------------------------------------------------------
// RAT generator
// ---------------------------------------------------------------------------------------------------------------------

const RatGeneratorEntry: FailureDetail = {
  whatItIs:
    'When all four AC busbars are lost in flight, the RAT extends and turns the emergency ' +
    'generator, which supplies the AC ESS busbar at a variable frequency. It can also be extended by the RAT MAN ON ' +
    'pushbutton.',
  impact: [
    'The emergency generator gives no output, even with the RAT stowed or extended.',
    'After a loss of all AC power the RAT therefore cannot supply AC ESS; only the batteries and the static inverter ' +
      'remain.',
  ],
  alertIds: ['240800072'],
  effects: [
    {
      where: 'E/WD',
      text:
        `ELEC RAT FAULT, ${ADVISORY}, at all times, RAT stowed or extended; ` +
        `${SHOWN_ON_GROUND_BEFORE_TAKE_OFF_OR_AFTER_SHUTDOWN_ONLY}, so a failure in flight is not announced on its own; ` +
        `${RCL_NOTE}. It has no procedure line.`,
    },
    {
      where: 'Overhead EMER ELEC PWR panel',
      text:
        'The EMER GEN FAULT light comes on in flight when all AC power is lost and the emergency generator does ' +
        'not supply the network.',
    },
    {
      where: 'SD ELEC AC',
      text: 'The RAT label turns amber.',
    },
    {
      where: 'SD STATUS',
      text: `RAT is listed as inoperative ${STATUS_NOTE}.`,
    },
  ],
  notSimulated: ['The RAT uplock and heater faults of the real alert are not modelled.'],
  logbook: { required: true, reason: 'advisory alert and a lost emergency generator' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// TR monitoring
// ---------------------------------------------------------------------------------------------------------------------

const TR_MONITORING_ALERTS = ['240800084', '240800085', '240800086'] as const;
const TR_MONITORING_NAME = ['TR 1', 'TR 2', 'TR ESS'] as const;

const TransformerRectifierMonitoringFamily: FailureDetailFamily = {
  ids: [
    A380Failure.TransformerRectifier1Monitoring,
    A380Failure.TransformerRectifier2Monitoring,
    A380Failure.TransformerRectifierEssMonitoring,
  ],
  detail: (number): FailureDetail => {
    const name = TR_MONITORING_NAME[number - 1];
    return {
      whatItIs:
        `The ${name} has a monitoring function that checks its output and reports a failure of the TR. The ` +
        'monitoring is separate from the conversion of the current itself.',
      impact: [`The ${name} keeps supplying DC normally: only the monitoring function is lost.`],
      alertIds: [TR_MONITORING_ALERTS[number - 1]],
      effects: [
        {
          where: 'E/WD',
          text:
            `ELEC ${name} MONITORING FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_2_TO_11}, so it appears with the ` +
            `engines off on the ground; ${RCL_NOTE}. It has no procedure line and no STATUS entry.`,
        },
      ],
      logbook: { required: true, reason: 'advisory alert and a lost monitoring function' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Generator drives
// ---------------------------------------------------------------------------------------------------------------------

const DRIVE_DISC_FAULT_ALERTS = ['240800032', '240800033', '240800034', '240800035'] as const;
const DRIVE_DISCONNECTED_ALERTS = ['240800036', '240800037', '240800038', '240800039'] as const;
const DRIVE_OIL_LEVEL_ALERTS = ['240800040', '240800041', '240800042', '240800043'] as const;
const DRIVE_OIL_OVERHEAT_ALERTS = ['240800044', '240800045', '240800046', '240800047'] as const;
const DRIVE_OIL_PRESSURE_ALERTS = ['240800048', '240800049', '240800050', '240800051'] as const;

const DRIVE_WHAT_IT_IS = (number: number): string =>
  `Generator ${number} turns with engine ${number} through a drive that an oil system lubricates and cools. The ` +
  `crew can disconnect the drive with the DRIVE ${number} pb-sw; once disconnected it cannot be reconnected in ` +
  'flight. The generator control unit watches the oil level, pressure and temperature.';

/** The DRIVE n DISCONNECTED bullet shared by the oil failures */
const driveDisconnectedEffect = (number: number): { where: string; text: string } => ({
  where: 'E/WD',
  text:
    `Once the drive has disconnected, the oil alerts end and ELEC DRIVE ${number} DISCONNECTED, ${CAUTION}, takes ` +
    `over; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. It shows no procedure line.`,
});

const GeneratorDriveDisconnectFamily: FailureDetailFamily = {
  ids: [
    A380Failure.GeneratorDrive1Disconnect,
    A380Failure.GeneratorDrive2Disconnect,
    A380Failure.GeneratorDrive3Disconnect,
    A380Failure.GeneratorDrive4Disconnect,
  ],
  detail: (number): FailureDetail => ({
    whatItIs: DRIVE_WHAT_IT_IS(number),
    impact: [
      `The DRIVE ${number} pb-sw no longer disconnects the drive: the generator keeps running.`,
      'The drive can still disconnect automatically, by low oil pressure or by oil overheat, if those occur.',
      'Nothing else changes while the drive works normally.',
    ],
    alertIds: [DRIVE_DISC_FAULT_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ELEC DRIVE ${number} DISC FAULT, ${CAUTION}, at all times; ${NOT_SHOWN_PHASES_2_TO_11}, so it appears ` +
          `with the engines off on the ground; ${RCL_NOTE}. It has no procedure line and no STATUS entry.`,
      },
      {
        where: 'Overhead ELEC panel',
        text: `After the DRIVE ${number} pb-sw is released, its DISC light stays off and the generator keeps its power.`,
      },
    ],
    logbook: { required: true, reason: 'caution and a drive that cannot be disconnected' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const GeneratorDriveOilLeakFamily: FailureDetailFamily = {
  ids: [
    A380Failure.GeneratorDrive1OilLeak,
    A380Failure.GeneratorDrive2OilLeak,
    A380Failure.GeneratorDrive3OilLeak,
    A380Failure.GeneratorDrive4OilLeak,
  ],
  detail: (number): FailureDetail => ({
    whatItIs: DRIVE_WHAT_IT_IS(number),
    impact: [
      'The drive loses 1 % of its oil each second while it turns, so it runs dry in under two minutes.',
      'The low level and low pressure follow, then the oil heats up.',
      `After 5 min of low oil level the generator control unit switches generator ${number} off; the drive ` +
        'disconnects by itself after 5 min of low oil pressure or above 250 degrees C.',
    ],
    alertIds: [
      DRIVE_OIL_LEVEL_ALERTS[number - 1],
      DRIVE_OIL_PRESSURE_ALERTS[number - 1],
      DRIVE_OIL_OVERHEAT_ALERTS[number - 1],
      GEN_FAULT_ALERTS[number - 1],
      DRIVE_DISCONNECTED_ALERTS[number - 1],
    ],
    effects: [
      {
        where: 'E/WD',
        text:
          `About 25 s after the leak starts: ELEC DRIVE ${number} OIL LEVEL LO, ${CAUTION}; ` +
          `${NOT_SHOWN_PHASES_2_TO_11}, so it is not shown while an engine runs and appears once the engines are ` +
          `shut down on the ground; ${RCL_NOTE}. Its line is GEN ${number} OFF.`,
      },
      {
        where: 'E/WD',
        text:
          `About 50 s after the leak starts, with the generator turning at 360 Hz or more: ELEC DRIVE ${number} OIL ` +
          `PRESS LO, ${CAUTION}; ${NOT_SHOWN_PHASES_1_4_TO_7_9_10_12}. Its line is DRIVE ${number} DISC.`,
      },
      {
        where: 'E/WD',
        text:
          `As the drive runs dry its oil heats up, and when the outlet passes 200 degrees C: ELEC DRIVE ${number} OIL OVHT, ${CAUTION}; ` +
          `${NOT_SHOWN_PHASES_1_3_TO_7_9_10_12}. Its line is DRIVE ${number} DISC.`,
      },
      {
        where: 'E/WD',
        text:
          `After 5 min of low oil level, with the drive still connected: ELEC GEN ${number} FAULT, ${CAUTION}; ` +
          `${NOT_SHOWN_PHASES_1_3_TO_7_9_10_12}. It ends when the drive disconnects.`,
      },
      driveDisconnectedEffect(number),
      {
        where: 'Overhead ELEC panel',
        text: `The DRIVE ${number} pb-sw FAULT light comes on with low oil pressure or oil overheat, and the DISC light once disconnected.`,
      },
      {
        where: 'Overhead ELEC panel',
        text: `The GEN ${number} pb-sw FAULT light comes on when the generator control unit switches the generator off after 5 min of low oil level.`,
      },
      {
        where: 'SD ELEC AC',
        text: `OVHT in amber under GEN ${number} above 185 degrees C oil outlet temperature; DISC in amber replaces the load and voltage after disconnection.`,
      },
      {
        where: 'SD STATUS',
        text: `GEN ${number} ${ENGINE_GENERATOR_LOST_STATUS}, for each of these alerts except ELEC DRIVE ${number} OIL LEVEL LO, which a running engine inhibits (its STATUS lines only appear with the engines off on the ground).`,
      },
    ],
    logbook: { required: true, reason: 'caution and a lost drive oil supply' },
    clearing:
      'Maintenance only: use Restore. It stops the leak, but the oil already lost stays lost and a disconnected ' +
      'drive stays disconnected. After the OIL LEVEL LO line (GEN OFF) the pb-sw must be set ON again, or ELEC GEN n OFF ' +
      'follows 5 s after it was set OFF while the generator still works.',
  }),
};

const GeneratorDriveOilOverheatFamily: FailureDetailFamily = {
  ids: [
    A380Failure.GeneratorDrive1OilOverheat,
    A380Failure.GeneratorDrive2OilOverheat,
    A380Failure.GeneratorDrive3OilOverheat,
    A380Failure.GeneratorDrive4OilOverheat,
  ],
  detail: (number): FailureDetail => ({
    whatItIs: DRIVE_WHAT_IT_IS(number),
    impact: [
      'The oil is no longer cooled, so its temperature climbs once the generator runs: the oil outlet passes ' +
        '200 degrees C after about 4 min.',
      `The drive disconnects by itself above 250 degrees C, about 100 s later, and generator ${number} is lost.`,
    ],
    alertIds: [DRIVE_OIL_OVERHEAT_ALERTS[number - 1], DRIVE_DISCONNECTED_ALERTS[number - 1]],
    effects: [
      {
        where: 'SD ELEC AC',
        text: `OVHT in amber under GEN ${number} when the oil outlet passes 185 degrees C, before the alert.`,
      },
      {
        where: 'E/WD',
        text:
          `ELEC DRIVE ${number} OIL OVHT, ${CAUTION}, above 200 degrees C; ${NOT_SHOWN_PHASES_1_3_TO_7_9_10_12}. ` +
          `Its line is DRIVE ${number} DISC.`,
      },
      {
        where: 'Overhead ELEC panel',
        text: `The DRIVE ${number} pb-sw FAULT light comes on with the alert, and the DISC light once disconnected.`,
      },
      driveDisconnectedEffect(number),
      {
        where: 'SD STATUS',
        text: `GEN ${number} ${ENGINE_GENERATOR_LOST_STATUS}, for each of these alerts.`,
      },
    ],
    logbook: { required: true, reason: 'caution and a lost drive oil cooling' },
    clearing:
      'Maintenance only: use Restore. The oil then cools down, but a drive that has disconnected stays ' +
      'disconnected.',
  }),
};

export const Ata24SourcesEntries: Record<number, FailureDetail> = {
  [A380Failure.TransformerRectifier3]: TransformerRectifierEssEntry,
  [A380Failure.TransformerRectifier4]: TransformerRectifierApuEntry,
  [A380Failure.StaticInverter]: StaticInverterEntry,
  [A380Failure.Battery1]: Battery1Entry,
  [A380Failure.Battery2]: Battery2Entry,
  [A380Failure.BatteryEss]: BatteryEssEntry,
  [A380Failure.BatteryApu]: BatteryApuEntry,
  [A380Failure.ExternalPower1]: ExternalPower1Entry,
  [A380Failure.RatGenerator]: RatGeneratorEntry,
};

export const Ata24SourcesFamilies: FailureDetailFamily[] = [
  TransformerRectifierMainFamily,
  EngineGeneratorFamily,
  ApuGeneratorFamily,
  ExternalPowerOtherFamily,
  TransformerRectifierMonitoringFamily,
  GeneratorDriveDisconnectFamily,
  GeneratorDriveOilLeakFamily,
  GeneratorDriveOilOverheatFamily,
];
