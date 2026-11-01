// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';

/** CABIN EMER EXIT LT FAULT: inhibited in flight phases 3 to 10 */
const NOT_SHOWN_PHASES_3_TO_10 =
  'a new alert shows only on the ground: with the engines off, with engines running before take-off power is set ' +
  '(engine start and taxi-out), and after landing once below 80 kt; a failure that appears in flight shows after ' +
  'landing once below 80 kt';

const cabinEmergencyLightingDetail: FailureDetail = {
  whatItIs:
    'The cabin emergency lighting works independently of the normal lighting and comes on automatically when ' +
    'the electrical power is lost. It is made of the floor path marking, the exit signs, the staircase and overhead ' +
    'emergency lights and the door and slide lights.',
  impact: [
    'The cabin emergency lighting system is reported failed.',
    'The failure is crew awareness only: no procedure is given and no other system is affected.',
  ],
  alertIds: ['334800101'],
  effects: [
    {
      where: 'E/WD',
      text:
        `CABIN EMER EXIT LT FAULT appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_10}. It has no lines and calls up ` +
        'no SD page.',
    },
    {
      where: 'SD STATUS',
      text:
        'EMER EXIT LT is listed under INOP SYS (ALL PHASES part) in every flight phase, also while the alert itself ' +
        'is held back by the flight phase.',
    },
  ],
  notSimulated: [
    'The failed emergency lighting would not light the cabin in an emergency; the sim has no cabin emergency ' +
      'lighting, so nothing in the cabin changes.',
  ],
  logbook: { required: true, reason: 'advisory, emergency lighting inoperative' },
  clearing: MAINTENANCE_ONLY,
};

export const Ata33LightsEntries: Record<number, FailureDetail> = {
  [A380Failure.CabinEmergencyLighting]: cabinEmergencyLightingDetail,
};
