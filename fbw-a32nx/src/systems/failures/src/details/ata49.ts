// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily, SeenEffect } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const RESTORE_THEN_MASTER_SW_OFF =
  'Maintenance only: use Restore, then set the APU MASTER SW to OFF to clear the fault.';

/** Flight phases 3, 4, 5, 7 and 8: APU AUTO SHUT DOWN */
const NOT_SHOWN_FROM_TAKE_OFF_POWER =
  'not shown from take-off power set to 1,500 ft (or 2 min), nor from 800 ft on approach to 80 kt on landing';

const ECB_DESCRIPTION =
  'The electronic control box (ECB) is the computer of the APU. It controls the start, the speed and the bleed valve, ' +
  'watches the APU and shuts it down on a fault. The APU MASTER SW powers it up.';

/** What every automatic APU shutdown shows, the same alert and lights */
const AUTO_SHUTDOWN_EFFECTS: readonly SeenEffect[] = [
  {
    where: 'E/WD',
    text:
      'APU AUTO SHUT DOWN, a caution with master caution and single chime, ' +
      `${NOT_SHOWN_FROM_TAKE_OFF_POWER}. The line -MASTER SW OFF goes once it is done.`,
  },
  {
    where: 'Overhead APU panel',
    text: 'The MASTER SW FAULT light comes on, the START ON light goes out and the AVAIL light goes out.',
  },
  {
    where: 'SD STATUS',
    text: 'INOP SYS APU is listed.',
  },
  {
    where: 'SD APU',
    text: 'The page is called up when the alert is the top alert.',
  },
  {
    where: 'SD APU',
    text: 'With the APU BLEED pb-sw ON, the bleed valve closes and its symbol shows an amber crossline after 10 s.',
  },
];

const SHUTDOWN_CONSEQUENCES =
  'The APU AVAIL and APU BLEED memos go. On the ground with no other source, the buses the APU fed lose power.';

export const Ata49Entries: Record<number, FailureDetail> = {
  [A320Failure.ApuEcb]: {
    whatItIs: ECB_DESCRIPTION,
    impact: [
      'The ECB fails as soon as it is powered, so the APU cannot start.',
      'An APU already running is shut down automatically.',
      SHUTDOWN_CONSEQUENCES,
    ],
    alertIds: ['4900101'],
    effects: AUTO_SHUTDOWN_EFFECTS,
    logbook: { required: true, reason: 'ECAM caution and an APU that does not start' },
    clearing: RESTORE_THEN_MASTER_SW_OFF,
  },
  [A320Failure.ApuOverspeed]: {
    whatItIs:
      'The ECB watches the APU speed and shuts the APU down if it goes too fast. This protects the turbine from damage.',
    impact: [
      'The ECB detects an overspeed and shuts the APU down automatically.',
      'It only acts on a running APU: a failure applied to a stopped APU waits for the next start.',
      SHUTDOWN_CONSEQUENCES,
    ],
    alertIds: ['4900101'],
    effects: AUTO_SHUTDOWN_EFFECTS,
    logbook: { required: true, reason: 'ECAM caution and an APU shutdown' },
    clearing: RESTORE_THEN_MASTER_SW_OFF,
  },
  [A320Failure.ApuOilLowPressure]: {
    whatItIs: 'The APU has its own oil system. The ECB reads the oil pressure and shuts the APU down if it is too low.',
    impact: [
      'The ECB sees a low oil pressure and shuts the APU down automatically.',
      'It only acts on a running APU: a failure applied to a stopped APU waits for the next start.',
      SHUTDOWN_CONSEQUENCES,
    ],
    alertIds: ['4900101'],
    effects: AUTO_SHUTDOWN_EFFECTS,
    logbook: { required: true, reason: 'ECAM caution and an APU shutdown' },
    clearing: RESTORE_THEN_MASTER_SW_OFF,
  },
  [A320Failure.ApuOilHighTemperature]: {
    whatItIs:
      'The ECB reads the APU oil temperature and shuts the APU down if it gets too hot, on the ground and in flight.',
    impact: [
      'The ECB sees a high oil temperature and shuts the APU down automatically.',
      'It only acts on a running APU: a failure applied to a stopped APU waits for the next start.',
      SHUTDOWN_CONSEQUENCES,
    ],
    alertIds: ['4900101'],
    effects: AUTO_SHUTDOWN_EFFECTS,
    logbook: { required: true, reason: 'ECAM caution and an APU shutdown' },
    clearing: RESTORE_THEN_MASTER_SW_OFF,
  },
  [A320Failure.ApuAirIntakeFlapFailedClosed]: {
    whatItIs:
      'The APU air intake flap opens when the APU is started and gives the APU its air. The start needs the flap fully ' +
      'open, and the ECB shuts the APU down if the flap leaves its open position while it starts or runs.',
    impact: [
      'The flap is driven closed and stays closed.',
      'A stopped APU does not start. A starting or running APU is shut down automatically.',
      SHUTDOWN_CONSEQUENCES,
    ],
    alertIds: ['4900101'],
    effects: [
      {
        where: 'E/WD',
        text:
          'APU AUTO SHUT DOWN, a caution with master caution and single chime, once a starting or running APU loses its open flap, ' +
          `${NOT_SHOWN_FROM_TAKE_OFF_POWER}. A start attempt with the flap already closed gives no alert.`,
      },
      ...AUTO_SHUTDOWN_EFFECTS.slice(1),
    ],
    logbook: { required: true, reason: 'ECAM caution and an APU that does not start' },
    clearing: RESTORE_THEN_MASTER_SW_OFF,
  },
  [A320Failure.ApuOilLevelLow]: {
    whatItIs:
      'The ECB checks the APU oil level and tells the crew when it is low, so that the oil can be topped up before the ' +
      'next flight. The APU keeps working.',
    impact: ['The ECB senses a low oil level.', 'The APU is not affected and keeps starting and running.'],
    alertIds: [],
    effects: [
      {
        where: 'SD APU',
        text:
          'A green pulsing LOW OIL LEVEL advisory shows, on the ground with the APU not running and the ECB on ' +
          '(MASTER SW ON or the APU still turning).',
      },
      {
        where: 'SD APU',
        text: 'The advisory is seen only with the APU page displayed: no alert calls the page up.',
      },
    ],
    logbook: { required: true, reason: 'advisory: the oil needs topping up' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata49Families: FailureDetailFamily[] = [];
