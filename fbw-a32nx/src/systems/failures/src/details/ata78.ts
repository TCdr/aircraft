// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'amber caution with master caution light and single chime';
const AWARENESS = 'amber message without master caution light or chime';

const REVERSER_TEXT =
  'Each engine has a thrust reverser: doors that, after landing, turn the fan air forward to slow the aircraft. ' +
  'The reverser is driven by hydraulic pressure under the control of the FADEC and of the spoiler elevator computers. ' +
  'It deploys only on the ground, with the thrust lever in the reverse range, and is otherwise locked stowed.';

const ReverserFaultFamily: FailureDetailFamily = {
  ids: [A320Failure.Reverser1Fault, A320Failure.Reverser2Fault],
  detail: (engine): FailureDetail => ({
    whatItIs: REVERSER_TEXT,
    impact: [
      `The reverser control of engine ${engine} is failed: the reverser stays stowed.`,
      'Pulling the thrust lever into reverse gives reverse idle only, so there is no reverse thrust from that engine.',
    ],
    alertIds: [engine === 1 ? '7700561' : '7700562'],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${engine} REVERSER FAULT, ${CAUTION}. Not shown from take-off power to 1,500 feet ` +
          'unless the FADEC has set idle by itself.',
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
      { where: 'SD STATUS', text: `Inoperative: REVERSER ${engine}.` },
    ],
    logbook: { required: true, reason: 'ECAM caution and an inoperative reverser' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const ReverserUnlockedFamily: FailureDetailFamily = {
  ids: [A320Failure.Reverser1Unlocked, A320Failure.Reverser2Unlocked],
  detail: (engine): FailureDetail => ({
    whatItIs: REVERSER_TEXT,
    impact: [
      `The doors of reverser ${engine} leave their stowed and locked position without any deploy order.`,
      `The FADEC sets engine ${engine} at idle by itself, whatever the thrust lever position.`,
    ],
    alertIds: [engine === 1 ? '7700551' : '7700552'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} REVERSE UNLOCKED, ${CAUTION}. Not shown on the landing roll above 80 knots.`,
      },
      {
        where: 'E/WD',
        text: `ENG AT IDLE, thrust lever to idle, ENG MASTER OFF. In flight, MAX SPEED 300/.78 and MAX SPEED 240 kt if buffet.`,
      },
      { where: 'E/WD', text: 'An amber REV in the N1 box: pulsing for 9 seconds in flight, then steady.' },
      { where: 'SD STATUS', text: 'In flight: MAX SPEED 300/.78.' },
    ],
    notSimulated: ['The doors do not open into the airflow: no buffet, no yaw or roll, no rudder trim order.'],
    logbook: { required: true, reason: 'ECAM caution and engine held at idle' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const ReverserPressurizedFamily: FailureDetailFamily = {
  ids: [A320Failure.Reverser1Pressurized, A320Failure.Reverser2Pressurized],
  detail: (engine): FailureDetail => ({
    whatItIs: REVERSER_TEXT,
    impact: [
      `The shutoff valve of reverser ${engine} stays open: its actuators are pressurized while stowed and locked.`,
      'The reverser stays stowed and the engine is not affected.',
    ],
    alertIds: [engine === 1 ? '7700571' : '7700572'],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${engine} REV PRESSURIZED, ${CAUTION}, after 2 seconds. Not shown from 80 knots on take-off to 1,500 feet, ` +
          'nor on the landing roll above 80 knots.',
      },
      {
        where: 'E/WD',
        text: 'In flight: thrust lever to idle (gone once there). On the ground: THR LVR NOT ABV IDLE.',
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    notSimulated: ['The pressurized reverser does not drift open and does not limit the thrust.'],
    logbook: { required: true, reason: 'ECAM caution and a pressurized reverser' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const ReverserPermissionSwitchFamily: FailureDetailFamily = {
  ids: [A320Failure.Reverser1PermissionSwitch, A320Failure.Reverser2PermissionSwitch],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The reverser deployment needs a permission signal from a switch. The FADEC watches that switch ' +
      'and reports when it is faulty.',
    impact: [
      `The reverser permission switch of engine ${engine} is failed.`,
      'The reverser still deploys and stows as before.',
    ],
    alertIds: [engine === 1 ? '7707811' : '7707812'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} REV SWITCH FAULT, ${CAUTION}, not shown from take-off power until the landing roll slows below 80 knots.`,
      },
      { where: 'SD ENG', text: 'The ENG page is called.' },
    ],
    logbook: { required: true, reason: 'ECAM caution' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const ReverserInhibitedFamily: FailureDetailFamily = {
  ids: [A320Failure.Reverser1InhibitedByMaintenance, A320Failure.Reverser2InhibitedByMaintenance],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'Maintenance can inhibit a thrust reverser, locking it stowed so that the aircraft can be dispatched with ' +
      'it inoperative. The FADEC reports the inhibition to the crew.',
    impact: [
      `Reverser ${engine} is inhibited by a maintenance action: it does not deploy.`,
      'Reverse thrust is lost on that engine, and the landing distance grows accordingly.',
    ],
    alertIds: [engine === 1 ? '7707821' : '7707822'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} REV INHIBITED, ${AWARENESS}, not shown from take-off power until the engines are shut down.`,
      },
      { where: 'SD STATUS', text: `Inoperative: REVERSER ${engine}.` },
    ],
    logbook: { required: true, reason: 'ECAM message and an inoperative reverser' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const ReverserShutoffValveFamily: FailureDetailFamily = {
  ids: [A320Failure.Reverser1ShutoffValveFailedOpen, A320Failure.Reverser2ShutoffValveFailedOpen],
  detail: (engine): FailureDetail => ({
    whatItIs:
      'The hydraulic pressure of a reverser first goes through a shutoff valve, then through a hydraulic ' +
      'control unit (HCU) that directs it to the actuators. The two in series keep the reverser unpressurized in flight.',
    impact: [
      `The shutoff valve of reverser ${engine} is failed open.`,
      'The hydraulic control unit still keeps the actuators unpressurized, so the reverser is not affected.',
    ],
    alertIds: [engine === 1 ? '7707831' : '7707832'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} REV ISOL FAULT, ${AWARENESS}.`,
      },
      { where: 'E/WD', text: 'Not shown from take-off power to the end of the approach.' },
    ],
    logbook: { required: true, reason: 'ECAM message and lost redundancy' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata78Entries: Record<number, FailureDetail> = {};

export const Ata78Families: FailureDetailFamily[] = [
  ReverserFaultFamily,
  ReverserUnlockedFamily,
  ReverserPressurizedFamily,
  ReverserPermissionSwitchFamily,
  ReverserInhibitedFamily,
  ReverserShutoffValveFamily,
];
