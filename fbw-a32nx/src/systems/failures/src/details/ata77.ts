// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Alert keys of the FADEC-DMC discrepancy alerts: engine 1 then engine 2, for N1, N2, EGT and fuel flow */
const DISCREPANCY_ALERTS = [
  ['7708110', '7708120'],
  ['7708111', '7708121'],
  ['7708112', '7708122'],
  ['7708113', '7708123'],
] as const;
const DISCREPANCY_PARAMETERS = ['N1', 'N2', 'EGT', 'FF'] as const;
const DISCREPANCY_NAMES = ['N1 (fan speed)', 'N2 (core speed)', 'EGT (exhaust gas temperature)', 'fuel flow'] as const;

const HighVibrationFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1HighVibration, A320Failure.Eng2HighVibration],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Sensors on each engine measure the vibration of the fan (N1) and core (N2) rotors. The ENG page of the SD ' +
      'shows both values in units and pulses them when they pass the advisory level: 6 units for N1, 4.3 for N2.',
    impact: [
      `The vibration of engine ${number} grows with the square of the rotor speed, up to 8 units N1 and 5 units N2 at full speed.`,
      'It passes the advisory at climb and cruise thrust, and falls below it once the thrust is reduced. At idle it stays well below.',
      'It also shows while the engine windmills. The engine itself is not affected.',
    ],
    alertIds: [],
    effects: [
      { where: 'SD ENG', text: 'The N1 and N2 vibration values rise and pulse once they pass 6 and 4.3 units.' },
    ],
    notSimulated: ['No E/WD alert exists for this: the crew reads the advisory on the SD, as on the real aircraft.'],
    logbook: { required: true, reason: 'SD advisory only, no alert' },
    clearing: 'Reduce the thrust of the engine until the values fall below the advisory. Restore ends the failure.',
  }),
};

const DiscrepancyFamily: FailureDetailFamily = {
  ids: [
    A320Failure.Eng1N1Discrepancy,
    A320Failure.Eng2N1Discrepancy,
    A320Failure.Eng1N2Discrepancy,
    A320Failure.Eng2N2Discrepancy,
    A320Failure.Eng1EgtDiscrepancy,
    A320Failure.Eng2EgtDiscrepancy,
    A320Failure.Eng1FuelFlowDiscrepancy,
    A320Failure.Eng2FuelFlowDiscrepancy,
  ],
  detail: (number): FailureDetail => {
    const engine = number % 2 === 1 ? 1 : 2;
    const parameterIndex = Math.ceil(number / 2) - 1;
    const parameter = DISCREPANCY_PARAMETERS[parameterIndex];
    return {
      whatItIs:
        'The FADEC sends the engine parameters to the display management computers over a data bus. The computer ' +
        'compares the value it displays with the value on the bus, and flags a difference. Switching the E/WD to the ' +
        'third computer recovers the normal indication.',
      impact: [
        `The displayed ${DISCREPANCY_NAMES[parameterIndex]} of engine ${engine} is flagged as different from the FADEC value.`,
        'Only the flag is simulated: the displayed value itself stays correct.',
        'The engine and its control are not affected.',
      ],
      alertIds: [DISCREPANCY_ALERTS[parameterIndex][engine - 1]],
      effects: [
        { where: 'E/WD', text: `An amber CHECK shows under the ${parameter} of engine ${engine}.` },
        {
          where: 'E/WD',
          text:
            `ENG ${engine} ${parameter} DISCREPANCY: amber caution, crew awareness only, no master caution, no chime. Not ` +
            'shown from take-off power to 1,500 ft and in the landing roll.',
        },
      ],
      notSimulated: ['The displayed value is not made wrong.'],
      logbook: { required: true, reason: 'Amber CHECK and an alert' },
      clearing: 'Set the EIS DMC switching selector to CAPT 3: the CHECK and the alert go. Otherwise use Restore.',
    };
  },
};

export const Ata77Entries: Record<number, FailureDetail> = {
  [A320Failure.EngineVibrationMonitoringUnit]: {
    whatItIs:
      'The engine vibration monitoring unit processes the vibration sensors of both engines and sends the N1 and N2 ' +
      'vibration values to the SD ENG page.',
    impact: [
      'The unit is declared failed and the system reports it to the crew.',
      'It affects no other system and no engine.',
    ],
    alertIds: ['7707700'],
    effects: [
      {
        where: 'E/WD',
        text:
          'ENG VIB SYS FAULT: amber caution, crew awareness only, no master caution, no chime. Shown only before ' +
          'take-off power is set (including taxi) and in the 5 minutes after engine shutdown.',
      },
    ],
    notSimulated: ['The vibration values on the SD ENG page keep showing normally instead of being lost.'],
    logbook: { required: true, reason: 'Amber ECAM alert' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata77Families: FailureDetailFamily[] = [HighVibrationFamily, DiscrepancyFamily];
