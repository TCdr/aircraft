// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const ADVISORY_WHEN =
  'amber advisory, no master caution or chime; a new alert shows only on the ground before take-off thrust is set and after the engines are shut down; one already shown stays';

const LOAD_ALLEVIATION_WHEN =
  'amber advisory, no master caution or chime; a new alert shows only on the ground before take-off thrust is set, after landing or an aborted take-off once slowed to 80 kt, and after the engines are shut down; one already shown stays';

const RESTORE_CLEARING = 'Maintenance only: use Restore.';

/** The three load alleviation accelerometers of one outboard pylon: the wing alert needs two of the three. */
function lafAccelerometerDetail(wing: 'left' | 'right', number: number): FailureDetail {
  return {
    whatItIs:
      `Each outboard wing pylon carries three accelerometers that measure vertical acceleration of the wing. This is ` +
      `accelerometer ${number} of the ${wing} wing. The flight control computers use them for the load alleviation function, ` +
      'which reduces wing bending loads in turbulence and manoeuvres by deflecting the ailerons and outer spoilers (above 190 kt, not in CONF FULL).',
    impact: [
      `One failed accelerometer of the ${wing} wing is covered by the other two, and one failed in each wing shows nothing either: nothing changes for the crew.`,
      `With two of the three ${wing} wing accelerometers failed, the load alleviation function is declared lost.`,
    ],
    alertIds: ['271800029'],
    effects: [
      {
        where: 'E/WD',
        text: `F/CTL LOAD ALLEVIATION FAULT (${LOAD_ALLEVIATION_WHEN}) once two of the three accelerometers of one wing are failed and a PRIM is working; one failed accelerometer, or one in each wing, shows nothing.`,
      },
      {
        where: 'SD STATUS',
        text: 'While the alert is shown, INOP SYS lists LOAD ALLEVIATION.',
      },
    ],
    notSimulated: [
      'The load alleviation function is not simulated, so the lost function changes no wing loads or surface movement.',
    ],
    clearing: RESTORE_CLEARING,
    logbook: {
      required: true,
      reason: 'LOAD ALLEVIATION FAULT once a second accelerometer of the wing fails; none alone',
    },
  };
}

/** The six flight control gyrometers: the alert needs any two of the six, whichever they are. */
function gyrometerDetail(number: number): FailureDetail {
  return {
    whatItIs:
      `Six gyrometers in the centre fuselage measure the roll, pitch and yaw rates of the aircraft; this is gyrometer ${number}. ` +
      'The flight control computers use these rates for their normal and alternate laws; they keep those laws with up to ' +
      'two gyrometers lost, and revert to direct law with three lost.',
    impact: [
      'In the sim one failed gyrometer shows nothing; on the real aircraft it already downgrades the approach capability.',
      'In the sim any two of the six failed bring up an advisory; the flight controls themselves keep working.',
    ],
    alertIds: ['271800018'],
    effects: [
      {
        where: 'E/WD',
        text: `F/CTL TWO GYROMETERs FAULT (${ADVISORY_WHEN}) once any two gyrometers are failed and a PRIM is working; a single gyrometer shows nothing.`,
      },
    ],
    notSimulated: [
      'One or two failed gyrometers raise AUTO FLT APPROACH CAPABILITY DOWNGRADED on the real aircraft; the sim shows nothing.',
      'With three failed the real aircraft reverts to direct law, with the autopilots and flight directors lost and a lower maximum speed; the sim stays in normal law.',
    ],
    clearing: RESTORE_CLEARING,
    logbook: {
      required: true,
      reason: 'TWO GYROMETERs FAULT once a second gyrometer fails; none alone',
    },
  };
}

export const Ata27AccelGyroFamilies: FailureDetailFamily[] = [
  {
    ids: [
      A380Failure.LeftWingLafAccelerometer1,
      A380Failure.LeftWingLafAccelerometer2,
      A380Failure.LeftWingLafAccelerometer3,
    ],
    detail: (number) => lafAccelerometerDetail('left', number),
  },
  {
    ids: [
      A380Failure.RightWingLafAccelerometer1,
      A380Failure.RightWingLafAccelerometer2,
      A380Failure.RightWingLafAccelerometer3,
    ],
    detail: (number) => lafAccelerometerDetail('right', number),
  },
  {
    ids: [
      A380Failure.FlightControlGyrometer1,
      A380Failure.FlightControlGyrometer2,
      A380Failure.FlightControlGyrometer3,
      A380Failure.FlightControlGyrometer4,
      A380Failure.FlightControlGyrometer5,
      A380Failure.FlightControlGyrometer6,
    ],
    detail: gyrometerDetail,
  },
];
