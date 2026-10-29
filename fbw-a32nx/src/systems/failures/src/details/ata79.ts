// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const OIL_LO_PR_ALERTS = ['7707901', '7707902'] as const;
const OIL_HI_TEMP_ALERTS = ['7707911', '7707912'] as const;
const OIL_FILTER_CLOG_ALERTS = ['7707921', '7707922'] as const;

const OIL_SYSTEM =
  'Each engine has its own oil system. A pump circulates the oil to lubricate and cool the bearings and gears, ' +
  'and the SD ENG page shows the oil quantity, pressure and temperature.';

const OilLeakFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1OilLeak, A320Failure.Eng2OilLeak],
  detail: (number): FailureDetail => ({
    whatItIs: `${OIL_SYSTEM} The oil is held in a tank and a circuit.`,
    impact: [
      `Engine ${number} loses 2 quarts of oil per minute while its core turns above 10 % N2.`,
      'The oil quantity falls first. Once the system is nearly empty (a few minutes later), the oil pressure collapses.',
      'The engine keeps running without oil pressure.',
    ],
    alertIds: [OIL_LO_PR_ALERTS[number - 1]],
    effects: [
      {
        where: 'SD ENG',
        text: 'The oil quantity falls and pulses below 3.25 QT; then the oil pressure falls into the red range, below 13 PSI.',
      },
      {
        where: 'E/WD',
        text:
          `ENG ${number} OIL LO PR once the pressure is below 13 PSI with the engine running and the ENG MASTER ON: red warning, master ` +
          'warning and continuous repetitive chime, ENG page called; it asks for thrust lever idle and ENG MASTER OFF. ' +
          'Not shown before the first engine start or after the last engine is shut down.',
      },
    ],
    notSimulated: ['The engine takes no damage from a lack of oil: it never seizes or shuts down by itself.'],
    logbook: { required: true, reason: 'ECAM warning and an oil quantity loss' },
    clearing: 'ENG MASTER OFF stops the alert. Restore ends the failure; the oil is not refilled.',
  }),
};

const OilFilterClogFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1OilFilterClog, A320Failure.Eng2OilFilterClog],
  detail: (number): FailureDetail => ({
    whatItIs: `${OIL_SYSTEM} A filter cleans the oil, and a sensor watches the pressure loss across it.`,
    impact: [
      `The oil filter of engine ${number} is declared clogged while the engine runs.`,
      'Only the indication and the alert are simulated: oil pressure and quantity stay normal.',
    ],
    alertIds: [OIL_FILTER_CLOG_ALERTS[number - 1]],
    effects: [
      { where: 'SD ENG', text: 'An amber CLOG shows under the oil pressure while the engine runs.' },
      {
        where: 'E/WD',
        text:
          `ENG ${number} OIL FILTER CLOG with the engine running: amber caution, ENG page called. ` +
          'Not shown from take-off power to 1,500 ft, on approach below 800 ft and in the landing roll.',
      },
    ],
    notSimulated: ['No loss of oil pressure and no filter bypass.'],
    logbook: { required: true, reason: 'ECAM caution and an SD indication' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const OilOverheatFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1OilOverheat, A320Failure.Eng2OilOverheat],
  detail: (number): FailureDetail => ({
    whatItIs: `${OIL_SYSTEM} The oil is cooled by the fuel and the engine air flow.`,
    impact: [
      `The oil of engine ${number} is no longer cooled enough: its temperature heads for 135 deg C at idle and 175 deg C at full core speed.`,
      'It follows the thrust slowly (about a minute), so at cruise thrust it passes 155 deg C within about 2 min.',
      'Setting the thrust lever to idle brings it back below 155 deg C within about 30 s.',
    ],
    alertIds: [OIL_HI_TEMP_ALERTS[number - 1]],
    effects: [
      {
        where: 'SD ENG',
        text: 'The oil temperature pulses green from 140 deg C, and turns amber above 155 deg C.',
      },
      {
        where: 'E/WD',
        text:
          `ENG ${number} OIL HI TEMP above 155 deg C, or between 140 and 155 deg C for more than 15 min: amber caution, ` +
          'ENG page called; it asks for thrust lever idle and ENG MASTER OFF. Not shown from the take-off roll above ' +
          '80 kt to 1,500 ft, on approach below 800 ft and in the landing roll.',
      },
    ],
    notSimulated: ['No damage to the engine from the hot oil.'],
    logbook: { required: true, reason: 'ECAM caution and a hot oil system' },
    clearing: 'Thrust lever idle cools the oil; ENG MASTER OFF stops the alert. Restore ends the failure.',
  }),
};

export const Ata79Entries: Record<number, FailureDetail> = {};

export const Ata79Families: FailureDetailFamily[] = [OilLeakFamily, OilFilterClogFamily, OilOverheatFamily];
