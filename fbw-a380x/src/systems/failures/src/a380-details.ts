// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { AtaChapterNumber, FailureDetailTable } from '@flybywiresim/fbw-sdk';
import { A380Failure } from './a380';

/** Chapters whose failures all have a detail; the coverage spec only demands these. */
export const A380_DETAIL_CHAPTERS_DONE: readonly AtaChapterNumber[] = [];

export const A380FailureDetails: FailureDetailTable = {
  entries: {
    [A380Failure.HotAir1]: {
      whatItIs:
        'Hot air valve 1 is one of the valves of the trim air system. It bleeds hot air from the pack 1 supply into ' +
        'the manifold that warms the cabin and cockpit zones, and the temperature controller opens or closes it to ' +
        'reach the temperature selected for each zone.',
      impact: [
        'The valve stops moving and keeps the position it had when the failure was set, so the controller can no ' +
          'longer adjust the hot air it adds to the trim air.',
        'Temperature regulation items are listed inoperative.',
      ],
      alertIds: ['211800032', '211800048'],
      effects: [
        {
          where: 'E/WD',
          text: 'Stuck closed: HOT AIR 1 FAULT after about 30 s with a pack running, not during take-off or landing.',
        },
        {
          where: 'E/WD',
          text: 'Stuck open: HOT AIR 1 VLV OPEN on the ground, about 14 s after the valve is commanded closed.',
        },
        { where: 'SD COND', text: 'The valve is shown amber.' },
        { where: 'SD STATUS', text: 'The temperature regulation items are listed as inoperative.' },
        {
          where: 'Overhead AIR panel',
          text: 'The HOT AIR 1 pushbutton FAULT light stays off: it only shows a duct overheat or a leak.',
        },
      ],
      notSimulated: [
        'Zone temperature control moving to the other manifolds is not modelled.',
        'Both temperature regulation items are always inop, even if only some zones are affected.',
        'CARGO TEMP MONITOR is always asked for.',
      ],
      logbook: {
        required: true,
        reason: 'the alert is raised and the temperature regulation is degraded',
      },
      clearing:
        'Maintenance only: use Restore. Stuck closed, HOT AIR 1 OFF clears the alert; stuck open, the alert stays. ' +
        'The alert itself is already recorded in the OIS ECAM alert list.',
    },
  },
  families: [],
};
