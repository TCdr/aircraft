// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Where the DOOR caution shows: phases 2, 3, 6 and 9 (all others inhibited) */
const DOOR_ALERT_PHASES =
  'Shown during engine start and taxi, at take-off power below 80 kt, in climb, cruise and descent above 800 ft, ' +
  'and below 80 kt after landing until engine shutdown.';

const DOOR_ALERT_NOT_SHOWN =
  'Not shown before the first engine start, in the take-off roll above 80 kt, from lift-off to 1,500 ft, ' +
  'on approach below 800 ft, in the landing roll above 80 kt, or in the 5 min after shutdown.';

const PROXIMITY_SENSOR_WHAT_IT_IS =
  'A proximity sensor on each door tells the warning computer whether the door is closed. The sensors feed the DOOR ' +
  'alert and the door symbols of the DOOR/OXY page, so the crew sees an open or unlocked door.';

interface SensedDoorInfo {
  readonly name: string;
  readonly alertId: string;
  /** What the door is, for the whatItIs sentence */
  readonly kind: string;
}

const CABIN_DOORS: readonly SensedDoorInfo[] = [
  { name: 'L FWD CABIN', alertId: '5200101', kind: 'passenger door' },
  { name: 'R FWD CABIN', alertId: '5200102', kind: 'service door' },
  { name: 'L AFT CABIN', alertId: '5200103', kind: 'passenger door' },
  { name: 'R AFT CABIN', alertId: '5200104', kind: 'service door' },
];

const EMERGENCY_EXITS: readonly SensedDoorInfo[] = [
  { name: 'L EMER EXIT', alertId: '5200105', kind: 'overwing emergency exit' },
  { name: 'R EMER EXIT', alertId: '5200106', kind: 'overwing emergency exit' },
];

const CARGO_DOORS: readonly SensedDoorInfo[] = [
  { name: 'FWD CARGO', alertId: '5200107', kind: 'forward cargo door' },
  { name: 'AFT CARGO', alertId: '5200108', kind: 'aft cargo door' },
];

const AVIONICS_DOORS: readonly SensedDoorInfo[] = [
  { name: 'L FWD AVIONICS', alertId: '5200109', kind: 'left forward avionics compartment access door' },
  { name: 'R FWD AVIONICS', alertId: '5200110', kind: 'right forward avionics compartment access door' },
  { name: 'L AFT AVIONICS', alertId: '5200111', kind: 'left aft avionics compartment access door' },
  { name: 'R AFT AVIONICS', alertId: '5200112', kind: 'right aft avionics compartment access door' },
];

/** The part of a sensor detail that is the same for every door; the DOOR/OXY page bullet differs per group */
function proximitySensorDetail(door: SensedDoorInfo, pageEffect: string): FailureDetail {
  return {
    whatItIs: PROXIMITY_SENSOR_WHAT_IT_IS,
    impact: [
      `The ${door.name} proximity sensor no longer detects its door closed, so the door is reported not closed.`,
      'The door itself stays closed: cabin pressurisation and the cabin air are not affected.',
      'The DOOR alert stays on until the sensor is restored.',
    ],
    alertIds: [door.alertId],
    effects: [
      {
        where: 'E/WD',
        text:
          `DOOR ${door.name} caution with master caution and a single chime, whatever the true door state. ` +
          'On the ground the alert is the title only; in flight it adds IF ABN CAB V/S: and MAX FL 100/MEA-MORA, also listed in the status.',
      },
      { where: 'E/WD', text: DOOR_ALERT_PHASES },
      { where: 'E/WD', text: DOOR_ALERT_NOT_SHOWN },
      { where: 'SD DOOR/OXY', text: pageEffect },
    ],
    logbook: { required: true, reason: 'DOOR caution and a door shown not closed' },
    clearing: MAINTENANCE_ONLY,
  };
}

const CabinDoorSensorFamily: FailureDetailFamily = {
  ids: [
    A320Failure.LeftForwardCabinDoorProximitySensor,
    A320Failure.RightForwardCabinDoorProximitySensor,
    A320Failure.LeftAftCabinDoorProximitySensor,
    A320Failure.RightAftCabinDoorProximitySensor,
  ],
  detail: (number): FailureDetail => {
    const door = CABIN_DOORS[number - 1];
    return {
      ...proximitySensorDetail(
        door,
        `The page is called up when the DOOR caution is the top alert. The ${door.name} door symbol turns amber, with the CABIN legend amber and amber dashes.`,
      ),
      whatItIs: `${PROXIMITY_SENSOR_WHAT_IT_IS} This one watches the ${door.name.toLowerCase()} ${door.kind} of the cabin.`,
    };
  },
};

const EmergencyExitSensorFamily: FailureDetailFamily = {
  ids: [A320Failure.LeftEmergencyExitProximitySensor, A320Failure.RightEmergencyExitProximitySensor],
  detail: (number): FailureDetail => {
    const door = EMERGENCY_EXITS[number - 1];
    return {
      ...proximitySensorDetail(
        door,
        `The page is called up when the DOOR caution is the top alert. The ${door.name} symbol turns amber, with the EMER EXIT legend amber and amber dashes.`,
      ),
      whatItIs: `${PROXIMITY_SENSOR_WHAT_IT_IS} This one watches the ${number === 1 ? 'left' : 'right'} overwing emergency exit.`,
    };
  },
};

const CargoDoorSensorFamily: FailureDetailFamily = {
  ids: [A320Failure.ForwardCargoDoorProximitySensor, A320Failure.AftCargoDoorProximitySensor],
  detail: (number): FailureDetail => {
    const door = CARGO_DOORS[number - 1];
    return {
      ...proximitySensorDetail(
        door,
        `The page is called up when the DOOR caution is the top alert. The ${door.name} symbol turns amber, with the CARGO legend amber and amber dashes.`,
      ),
      whatItIs: `${PROXIMITY_SENSOR_WHAT_IT_IS} This one watches the ${door.kind} of the hold.`,
    };
  },
};

const AvionicsDoorSensorFamily: FailureDetailFamily = {
  ids: [
    A320Failure.LeftForwardAvionicsDoorProximitySensor,
    A320Failure.RightForwardAvionicsDoorProximitySensor,
    A320Failure.LeftAftAvionicsDoorProximitySensor,
    A320Failure.RightAftAvionicsDoorProximitySensor,
  ],
  detail: (number): FailureDetail => {
    const door = AVIONICS_DOORS[number - 1];
    return {
      ...proximitySensorDetail(door, 'The page is called up when the DOOR caution is the top alert.'),
      whatItIs:
        `${PROXIMITY_SENSOR_WHAT_IT_IS} This one watches the ${door.kind}, a manually operated ground access ` +
        'door.',
      impact: [
        `The ${door.name} proximity sensor reports its door not closed. The door is never open in the sim.`,
        'This is the only way to get this DOOR alert: the compartment doors are not modelled.',
        'The DOOR alert stays on until the sensor is restored.',
      ],
      notSimulated: [
        'The avionics compartment access doors themselves are not modelled.',
        'The DOOR/OXY page has no symbol for the avionics compartment access doors.',
      ],
    };
  },
};

const CockpitDoorLatchFamily: FailureDetailFamily = {
  ids: [A320Failure.CockpitDoorUpperLatch, A320Failure.CockpitDoorMidLatch, A320Failure.CockpitDoorLowerLatch],
  detail: (number): FailureDetail => {
    const position = ['upper', 'mid', 'lower'][number - 1];
    const strikeLight = ['TOP', 'MID', 'BOT'][number - 1];
    return {
      whatItIs:
        'The cockpit door is held shut by three electric locking strikes, upper, mid and lower, which stay locked ' +
        'when the door is closed. The cockpit door control unit locks and unlocks them on the crew command from the ' +
        'pedestal switch or on an authorised cabin request.',
      impact: [
        `The ${position} locking strike is reported faulty to the control unit.`,
        'Only the lights show it: the door locks and unlocks as normal in the sim.',
      ],
      alertIds: [],
      effects: [
        {
          where: 'Overhead CKPT DOOR CONT panel',
          text: `The ${strikeLight} strike status light comes on, with AC BUS 1 powered.`,
        },
        { where: 'Pedestal', text: 'The COCKPIT DOOR FAULT light comes on, with AC BUS 2 powered.' },
        { where: 'E/WD', text: 'No alert: the fault is shown by the lights only.' },
      ],
      notSimulated: [
        'The door has no latch model: a failed strike does not keep the door from locking or unlocking.',
        'The deadbolt and the mechanical override are not modelled.',
      ],
      logbook: { required: true, reason: 'COCKPIT DOOR FAULT light and a strike light' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const CockpitDoorPressureSensorFamily: FailureDetailFamily = {
  ids: [A320Failure.CockpitDoorPressureSensor1, A320Failure.CockpitDoorPressureSensor2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Two redundant differential pressure sensors in the cockpit door system detect a fast pressure drop in the ' +
      'cockpit. On such a drop the control unit opens all the latches at once, so the door can open under pressure.',
    impact: [
      `Pressure sensor ${number} is reported faulty to the control unit.`,
      'Only the lights show it: the sim has no cockpit decompression door logic.',
    ],
    alertIds: [],
    effects: [
      {
        where: 'Overhead CKPT DOOR CONT panel',
        text: `The CHAN ${number} pressure sensor status light comes on, with AC BUS 1 powered.`,
      },
      { where: 'Pedestal', text: 'The COCKPIT DOOR FAULT light comes on, with AC BUS 2 powered.' },
      { where: 'E/WD', text: 'No alert: the fault is shown by the lights only.' },
    ],
    notSimulated: ['The door never unlocks on a cockpit pressure drop, with or without this failure.'],
    logbook: { required: true, reason: 'COCKPIT DOOR FAULT light and a CHAN light' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata52Entries: Record<number, FailureDetail> = {
  [A320Failure.CockpitDoorControlUnit]: {
    whatItIs:
      'The cockpit door control unit is the controller of the cockpit door locking system. It locks and unlocks ' +
      'the latches on the crew command, and indicates failures of the latches and the pressure sensors.',
    impact: [
      'The control unit is reported faulty, so the system failure is flagged.',
      'Only the pedestal light shows it: the door locks and unlocks as normal in the sim.',
    ],
    alertIds: [],
    effects: [
      { where: 'Pedestal', text: 'The COCKPIT DOOR FAULT light comes on, with AC BUS 2 powered.' },
      { where: 'Overhead CKPT DOOR CONT panel', text: 'No status light comes on: the control unit has none.' },
      { where: 'E/WD', text: 'No alert: the fault is shown by the light only.' },
    ],
    notSimulated: ['The cockpit door does not lose any function: locking, unlocking and the override are unchanged.'],
    logbook: { required: true, reason: 'COCKPIT DOOR FAULT light' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata52Families: FailureDetailFamily[] = [
  CabinDoorSensorFamily,
  EmergencyExitSensorFamily,
  CargoDoorSensorFamily,
  AvionicsDoorSensorFamily,
  CockpitDoorLatchFamily,
  CockpitDoorPressureSensorFamily,
];
