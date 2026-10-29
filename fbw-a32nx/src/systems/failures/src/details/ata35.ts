// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

export const Ata35Entries: Record<number, FailureDetail> = {
  [A320Failure.CrewOxygenBottleLeak]: {
    whatItIs:
      'The crew oxygen bottle supplies the masks of the pilots through a regulator and the CREW SUPPLY valve. Its ' +
      'pressure is shown on the DOOR/OXY page of the SD, next to the CKPT OXY legend.',
    impact: [
      'The bottle leaks 100 PSI every minute on top of its normal very slow leak, until it is empty.',
      'From a full bottle it shows the pulse after about 13 minutes and amber after about 16 minutes, at normal cockpit temperature.',
      'No alert is raised: only the DOOR/OXY page shows the loss.',
    ],
    alertIds: [],
    effects: [
      {
        where: 'SD DOOR/OXY',
        text: 'The pressure value counts down, pulses green below 600 PSI and turns amber below 300 PSI.',
      },
      {
        where: 'SD DOOR/OXY',
        text: 'CKPT OXY turns amber below 300 PSI. REGUL LO PR shows in amber below 50 PSI.',
      },
      {
        where: 'SD DOOR/OXY',
        text: 'On the ground, an amber half frame appears around the value below 1,000 PSI.',
      },
    ],
    notSimulated: ['The masks are not modelled: the bottle loses pressure only through the leak.'],
    logbook: { required: true, reason: 'crew oxygen pressure falling' },
    clearing: 'Maintenance only: use Restore. It stops the leak, but the pressure already lost does not come back.',
  },
};

export const Ata35Families: FailureDetailFamily[] = [];
