// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const IGN_FAULT_ALERTS = ['7700741', '7700742'] as const;
const START_FAULT_ALERTS = ['7700801', '7700802'] as const;

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

function igniterDetail(number: number, letter: 'A' | 'B'): FailureDetail {
  const engine = number;
  const other = letter === 'A' ? 'B' : 'A';
  return {
    whatItIs:
      'Each engine has two independent ignition circuits, A and B, each with an igniter in the combustion chamber. ' +
      'The FADEC supplies them to light the engine at a start on the ground and at a relight in flight, and it can ' +
      'also select continuous ignition to protect the flame.',
    impact: [
      `Igniter ${letter} of engine ${engine} fails. The FADEC reports it at once, even with the engine running.`,
      `A first automatic ground start alternates igniters. If it picks ${letter}, there is no light-up: the FADEC cranks 30 s, then retries with both.`,
      `Manual starts, later attempts and starts in flight supply both igniters, so igniter ${other} still lights the engine.`,
      'With both igniters of the engine failed, no start or relight is possible.',
    ],
    alertIds: [IGN_FAULT_ALERTS[number - 1], START_FAULT_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${engine} IGN ${letter} FAULT: amber caution, ENG page called. Shown only on the ground at low speed. ` +
          'With both igniters failed it reads IGN A+B FAULT with AVOID ADVERSE CONDITIONS, also shown above 800 ft.',
      },
      {
        where: 'SD STATUS',
        text: `ENG ${engine} IGN ${letter} inoperative; ENG ${engine} IGN if both igniters are failed.`,
      },
      {
        where: 'E/WD',
        text:
          `A start that picks the failed igniter shows ENG ${engine} START FAULT with IGNITION FAULT, not shown ` +
          'from take-off power to 1,500 ft, on approach below 800 ft and in the landing roll.',
      },
      {
        where: 'Pedestal ENG panel',
        text: 'With both igniters failed, a start aborted after three attempts lights the ENG FAULT light.',
      },
    ],
    notSimulated: ['The SD ENG page still shows the failed igniter as supplied.'],
    logbook: { required: true, reason: 'ECAM caution and a degraded ignition' },
    clearing: MAINTENANCE_ONLY,
  };
}

const IgniterAFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1IgniterA, A320Failure.Eng2IgniterA],
  detail: (number) => igniterDetail(number, 'A'),
};

const IgniterBFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1IgniterB, A320Failure.Eng2IgniterB],
  detail: (number) => igniterDetail(number, 'B'),
};

export const Ata74Entries: Record<number, FailureDetail> = {};

export const Ata74Families: FailureDetailFamily[] = [IgniterAFamily, IgniterBFamily];
