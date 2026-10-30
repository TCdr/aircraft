// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

const SD_FCTL_CALL_UP = 'The page is called up when the alert first appears, unless another page was selected.';

const STATUS_NOTE = 'while the alert is shown';

/** The flight control computer that drives each spoiler, spoiler 1 (inboard) to 8 (outboard) */
const SPOILER_COMPUTERS = ['SEC 3', 'SEC 2', 'SEC 1', 'PRIM 3', 'PRIM 2', 'PRIM 1', 'SEC 2', 'SEC 3'];

/** Spoilers 5 and 6 are EBHAs: the computers do not retract their symmetric spoiler when one of them fails */
const keepsSymmetricSpoiler = (spoiler: number): boolean => spoiler === 5 || spoiler === 6;

/** Spoilers 3 to 8 also work as roll spoilers, spoilers 1 and 2 do not */
const isRollSpoiler = (spoiler: number): boolean => spoiler >= 3;

const BTV_NOT_ARMED =
  'The brake to vacate function (BTV) does not arm, and an armed BTV reverts to BRK HI, while the failure is present.';

const AUTOBRAKE_NOT_BRAKING =
  'The autobrake arms but never starts braking at landing or in a rejected take-off, because the ground spoiler request ' +
  'that it waits for is built from the orders of spoilers 1 and 2. An autobrake already braking disarms when the ' +
  'failure comes during the stop, which gives the AUTO BRK OFF memo.';

const spoilerDescription = (wing: string, spoiler: number, system: string, computer: string): string => {
  const roles = isRollSpoiler(spoiler)
    ? 'roll spoilers, speed brakes and ground spoilers'
    : 'speed brakes and ground spoilers';
  let actuator = `one actuator on the ${system} hydraulic system`;
  if (spoiler === 5) {
    actuator += ', an EBHA which works on electrical power (AC 3 busbar) when the yellow system fails';
  } else if (spoiler === 6) {
    actuator += ', an EBHA which works on electrical power (AC ESS busbar) when the green system fails';
  }
  const rollNote = isRollSpoiler(spoiler) ? '' : ' Only spoilers 3 to 8 also work as roll spoilers.';
  return (
    `Each wing has eight spoiler panels, numbered 1 (inboard) to 8 (outboard). They work as ${roles}.${rollNote} ` +
    `The ${wing} spoiler ${spoiler} has ${actuator}, and is ordered by ${computer}.`
  );
};

const spoilerDetail =
  (wing: 'left' | 'right') =>
  (spoiler: number): FailureDetail => {
    const otherWing = wing === 'left' ? 'right' : 'left';
    const system = spoiler % 2 === 0 ? 'green' : 'yellow';
    const computer = SPOILER_COMPUTERS[spoiler - 1];
    const symmetric = !keepsSymmetricSpoiler(spoiler);
    const lostCount = symmetric ? 'two spoilers' : 'one spoiler';
    const lostFunctions = isRollSpoiler(spoiler)
      ? 'The roll, speed brake and ground spoiler functions lose the lost panels'
      : 'The speed brake and ground spoiler functions lose the lost panels';

    return {
      whatItIs: spoilerDescription(wing, spoiler, system, computer),
      impact: [
        `The ${wing} spoiler ${spoiler} no longer follows its orders: it retracts and stays retracted.`,
        symmetric
          ? `The computers also retract the ${otherWing} spoiler ${spoiler}, so that the roll stays symmetric: ${lostCount} are lost.`
          : `The ${otherWing} spoiler ${spoiler} keeps working: ${lostCount} is lost.`,
        `${lostFunctions}; the flight control laws do not change.`,
        `The landing distance is affected. ${BTV_NOT_ARMED}`,
        ...(spoiler <= 2 ? [AUTOBRAKE_NOT_BRAKING] : []),
      ],
      alertIds: ['271800030', '271800031'],
      effects: [
        {
          where: 'E/WD',
          text:
            `F/CTL PART SPLRs FAULT, ${CAUTION}, while one to eight spoilers are lost and any PRIM is healthy; ` +
            `${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. Lines: FOR TAXI: FLAPS SELECT CONF 1+F, shown ` +
            'only after landing below 80 kt once the FLAPS lever has been at 0 for one minute, and LDG DIST AFFECTED.',
        },
        {
          where: 'E/WD',
          text:
            `With nine or more spoilers lost (other spoiler failures added), F/CTL MOST SPLRs FAULT replaces it, ` +
            `${CAUTION}, with the same lines, phases and conditions.`,
        },
        { where: 'SD F/CTL', text: SD_FCTL_CALL_UP },
        ...(spoiler <= 2
          ? [
              {
                where: 'E/WD',
                text:
                  'If the autobrake was braking when the failure came, the AUTO BRK OFF memo shows with its aural, and the master caution ' +
                  'light comes on for about 3 s, in the touch-down and landing roll phases while the ground speed is above 33 kt.',
              },
            ]
          : []),
        {
          where: 'SD F/CTL',
          text:
            `The ${wing} spoiler ${spoiler} turns amber with two amber side lines${symmetric ? `, and so does the ${otherWing} spoiler ${spoiler}` : ''}. ` +
            'The deflection shown follows the real position, so the retracted spoiler stays at zero.',
        },
        {
          where: 'E/WD',
          text: `The limitation LDG DIST AFFECTED shows for approach and landing, ${STATUS_NOTE}.`,
        },
        {
          where: 'SD STATUS',
          text:
            `PART SPLRs (MOST SPLRs for the combined alert) is listed as inoperative in all phases, with BTV and GLS AUTOLAND for approach and landing; ` +
            `the limitation LDG DIST AFFECTED is listed too, ${STATUS_NOTE}.`,
        },
        {
          where: 'SD STATUS',
          text: 'With MOST SPLRs FAULT, the deferred procedure MOST SPLRs FAULT is listed for the approach: LDG DIST COMPUTATION (CONFIRM).',
        },
        ...(spoiler === 1
          ? [
              {
                where: 'PFD',
                text:
                  'The speed brake and ground spoiler extension symbol of the lower area is not drawn, because the PFD reads ' +
                  'the order of left spoiler 1, which stays at zero; only the armed triangle remains.',
              },
            ]
          : []),
      ],
      notSimulated: [
        ...(spoiler === 5
          ? [
              'The electrical backup of spoiler 5 (AC 3) is not simulated: without yellow pressure the spoiler does not move.',
            ]
          : []),
        ...(isRollSpoiler(spoiler)
          ? [
              'With at least four pairs of roll spoilers (spoilers 3 to 8) lost, the control law reverts to alternate and the STATUS adds F/CTL PROT, CAT 2 and ALTN LAW : PROT LOST.',
            ]
          : []),
      ],
      logbook: { required: true, reason: 'caution and lost spoiler panels' },
      clearing: symmetric
        ? `${MAINTENANCE_ONLY} It also brings back the retracted ${otherWing} spoiler ${spoiler}; ${
            spoiler <= 2
              ? 'an autobrake disarmed meanwhile and a BTV reverted to HI stay as they are'
              : 'a BTV reverted to HI stays as it is'
          }.`
        : `${MAINTENANCE_ONLY} A BTV reverted to HI stays as it is.`,
    };
  };

const LEFT_SPOILERS = [
  A380Failure.LeftSpoiler1Actuator,
  A380Failure.LeftSpoiler2Actuator,
  A380Failure.LeftSpoiler3Actuator,
  A380Failure.LeftSpoiler4Actuator,
  A380Failure.LeftSpoiler5Actuator,
  A380Failure.LeftSpoiler6Actuator,
  A380Failure.LeftSpoiler7Actuator,
  A380Failure.LeftSpoiler8Actuator,
];

const RIGHT_SPOILERS = [
  A380Failure.RightSpoiler1Actuator,
  A380Failure.RightSpoiler2Actuator,
  A380Failure.RightSpoiler3Actuator,
  A380Failure.RightSpoiler4Actuator,
  A380Failure.RightSpoiler5Actuator,
  A380Failure.RightSpoiler6Actuator,
  A380Failure.RightSpoiler7Actuator,
  A380Failure.RightSpoiler8Actuator,
];

const leftDetail = spoilerDetail('left');
const rightDetail = spoilerDetail('right');

/** Spoilers 1, 2, 5 and 6 differ from 3, 4, 7 and 8 (autobrake, PFD, EBHA, symmetric spoiler), so they have entries */
export const Ata27SpoilersEntries: Record<number, FailureDetail> = {
  [A380Failure.LeftSpoiler1Actuator]: leftDetail(1),
  [A380Failure.LeftSpoiler2Actuator]: leftDetail(2),
  [A380Failure.LeftSpoiler5Actuator]: leftDetail(5),
  [A380Failure.LeftSpoiler6Actuator]: leftDetail(6),
  [A380Failure.RightSpoiler1Actuator]: rightDetail(1),
  [A380Failure.RightSpoiler2Actuator]: rightDetail(2),
  [A380Failure.RightSpoiler5Actuator]: rightDetail(5),
  [A380Failure.RightSpoiler6Actuator]: rightDetail(6),
};

const WING_SPOILERS_WITH_SYMMETRIC = [2, 3, 6, 7];

export const Ata27SpoilersFamilies: FailureDetailFamily[] = [
  {
    ids: WING_SPOILERS_WITH_SYMMETRIC.map((index) => LEFT_SPOILERS[index]),
    detail: (position) => leftDetail(WING_SPOILERS_WITH_SYMMETRIC[position - 1] + 1),
  },
  {
    ids: WING_SPOILERS_WITH_SYMMETRIC.map((index) => RIGHT_SPOILERS[index]),
    detail: (position) => rightDetail(WING_SPOILERS_WITH_SYMMETRIC[position - 1] + 1),
  },
];
