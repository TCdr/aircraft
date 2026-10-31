// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

/** Engines 1 and 2 are on the left wing, 3 and 4 on the right wing */
const ENGINE_POSITIONS = ['outer left', 'inner left', 'inner right', 'outer right'] as const;

const position = (engine: number): string => ENGINE_POSITIONS[engine - 1];

/** First alert key of each kind; the engine number minus one is added */
const FIRST_IGN_A_FAULT_ALERT = 701800057;
const FIRST_IGN_B_FAULT_ALERT = 701800061;
const FIRST_IGN_A_AND_B_FAULT_ALERT = 701800065;
const FIRST_START_FAULT_ALERT = 701800117;

const alertId = (first: number, engine: number): string => (first + engine - 1).toString();

/** ENG n IGN A(B) FAULT: inhibited in flight phases 3 to 10 */
const SINGLE_IGN_FAULT_NOT_SHOWN =
  'a new alert shows only on the ground: with the engines off on electrical power, with the first engine started ' +
  'before take-off power, after landing once below 80 kt, and after engine shutdown; a failure that appears in ' +
  'flight shows after landing';

/** ENG n IGN A+B FAULT: inhibited in flight phases 3 to 7, 9 and 10 */
const DUAL_IGN_FAULT_NOT_SHOWN =
  'a new alert is not shown from the second engine at take-off power up to 1,500 ft, nor from 800 ft on approach ' +
  'until below 80 kt after landing: it shows on the ground and in climb above 1,500 ft, cruise and descent above 800 ft';

/** ENG n START FAULT: inhibited in flight phases 3 to 7, 9 and 10 */
const START_FAULT_NOT_SHOWN =
  'a new alert is not shown from the second engine at take-off power until 1,500 ft, nor from 800 ft on approach ' +
  'until the landing roll is below 80 kt';

const IGNITER_DESCRIPTION =
  'Each engine has two independent igniters, A and B, that the FADEC energizes to light the combustion chamber for ' +
  'an engine start on the ground and for a relight in flight. Only one igniter is used for an automatic start on the ' +
  'ground; both are used for the continuous ignition, the automatic relight and a start in flight.';

const igniterDetail = (igniter: 'A' | 'B', engine: number): FailureDetail => {
  const other = igniter === 'A' ? 'B' : 'A';
  const ownAlert = alertId(igniter === 'A' ? FIRST_IGN_A_FAULT_ALERT : FIRST_IGN_B_FAULT_ALERT, engine);
  // The single igniter of an automatic start is igniter A at the first start after loading, then alternates
  const startOrderText =
    igniter === 'A'
      ? 'the first automatic start after loading uses igniter A, so it needs a second attempt, and the start after it ' +
        'lights up at once'
      : 'the first automatic start after loading uses igniter A and lights up at once, and the start after it uses ' +
        'igniter B, so it needs a second attempt';
  return {
    whatItIs: `${IGNITER_DESCRIPTION} Engine ${engine} is the ${position(engine)} engine; this is its igniter ${igniter}.`,
    impact: [
      `A running engine ${engine} is not affected: once lit up it needs no igniter, also with the continuous ignition ` +
        'on.',
      `The engine still starts and relights with igniter ${other}, because the manual start, the continuous ignition ` +
        'and the starts in flight use both igniters.',
      `An automatic start on the ground uses one igniter at a time, alternating at each start: ${startOrderText}.`,
      `With igniter ${other} failed as well, engine ${engine} cannot be started or relit: the ground start is aborted ` +
        'after three attempts and no relight in flight lights up.',
    ],
    alertIds: [ownAlert, alertId(FIRST_IGN_A_AND_B_FAULT_ALERT, engine), alertId(FIRST_START_FAULT_ALERT, engine)],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${engine} IGN ${igniter} FAULT appears, ${ADVISORY}, while igniter ${other} works, as soon as the ` +
          `failure is set on the ground; ${SINGLE_IGN_FAULT_NOT_SHOWN}. It has no lines and calls up no SD page.`,
      },
      {
        where: 'E/WD',
        text:
          `With igniter ${other} failed too, ENG ${engine} IGN A+B FAULT replaces it, ${CAUTION}; ` +
          `${DUAL_IGN_FAULT_NOT_SHOWN}. It has no lines and calls up no SD page.`,
      },
      {
        where: 'SD STATUS',
        text:
          `With igniter ${other} working, ENG ${engine} IGN ${igniter} is in the REDUND LOSS list of the STATUS MORE ` +
          'page, but a STATUS page that holds only such lines counts as empty: the E/WD shows no STS indication, and ' +
          'the STATUS page goes back to the previous page after a few seconds, so the line is hard to read. With ' +
          `both igniters failed, ENG ${engine} IGNITION is listed under INOP SYS in every flight phase, and the STATUS ` +
          'page is not empty.',
      },
      {
        where: 'E/WD',
        text:
          `When an automatic start on the ground uses the failed igniter, the engine does not light up within 20 s of ` +
          `the ignition starting at 20 % N3: ENG ${engine} START FAULT appears, ${ADVISORY}, with NO LIGHT UP; ` +
          `${START_FAULT_NOT_SHOWN}. After a 30 s dry crank the FADEC makes a new attempt with both igniters (NEW ` +
          'START IN PROGRESS) and the engine lights up with the working one. The alert clears once the engine runs.',
      },
      {
        where: 'Pedestal ENG MASTER panel',
        text:
          'With both igniters failed the automatic start makes three attempts without light-up, then is aborted: the ' +
          `FAULT light of the ENG ${engine} MASTER comes on.`,
      },
      {
        where: 'E/WD',
        text:
          `After that abort START FAULT shows ENG ${engine} MASTER OFF. In flight, a relight of an engine that is out ` +
          `never lights up: 30 s after the ENG ${engine} MASTER is set back ON, START FAULT shows NO LIGHT UP and ` +
          `ENG ${engine} MASTER OFF, in climb above 1,500 ft, cruise and descent above 800 ft only.`,
      },
    ],
    logbook: { required: true, reason: 'IGN FAULT alert, engine may not light up at a start' },
    clearing: MAINTENANCE_ONLY,
  };
};

const IgniterAFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1IgniterA, A380Failure.Eng2IgniterA, A380Failure.Eng3IgniterA, A380Failure.Eng4IgniterA],
  detail: (number) => igniterDetail('A', number),
};

const IgniterBFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1IgniterB, A380Failure.Eng2IgniterB, A380Failure.Eng3IgniterB, A380Failure.Eng4IgniterB],
  detail: (number) => igniterDetail('B', number),
};

export const Ata74IgnitionFamilies: FailureDetailFamily[] = [IgniterAFamily, IgniterBFamily];
