// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

/** Engines 1 and 2 are on the left wing, 3 and 4 on the right wing */
const ENGINE_POSITIONS = ['outer left', 'inner left', 'inner right', 'outer right'] as const;

const position = (engine: number): string => ENGINE_POSITIONS[engine - 1];

/** The engine monitoring unit that measures the vibrations has its own supply: AC 4 for engines 1 and 3, AC 2 for 2 and 4 */
const emuSupply = (engine: number): string => (engine % 2 === 1 ? 'AC 4' : 'AC 2');

const highVibrationDetail = (engine: number): FailureDetail => ({
  whatItIs:
    'Each engine has sensors that measure the vibration of its rotors, the fan (N1), the intermediate-pressure rotor ' +
    '(N2) and the high-pressure rotor (N3). An engine monitoring unit processes them, and the engine page of the SD ' +
    `shows the levels in units. Engine ${engine} is the ${position(engine)} engine; its monitoring unit is supplied ` +
    `from ${emuSupply(engine)}.`,
  impact: [
    `Engine ${engine} runs and gives its thrust as before: only the vibration values rise.`,
    'The rise grows with the square of the rotor speed: the vibration is above the 5 units advisory level at climb ' +
      'and cruise thrust and clearly below it at idle.',
    'Reducing the thrust of the affected engine brings the values back below the advisory level.',
  ],
  alertIds: [],
  effects: [
    {
      where: 'SD ENG',
      text:
        `The N1, N2 and N3 vibration values of engine ${engine} rise, up to 7 units more on N1 and 6 units more on N3 ` +
        'at full rotor speed, and N2 shows the mean of the two. Each value pulses green by itself when it is above 5 ' +
        'units. At a low cruise power the fan value can stay below 5 while the high-pressure rotor value is above. ' +
        `They show only with the FADEC of the engine powered and its monitoring unit supplied (${emuSupply(engine)}).`,
    },
    {
      where: 'SD ENG',
      text:
        'When any vibration of any engine is above 5 units, the advisory logic applies: with no page selected on the SD, the ENG ' +
        'page comes up and the ECP ENG pushbutton lights; with another page selected the pushbutton flashes until it is ' +
        'pressed. Nothing shows while the SD displays the page of an ECAM alert.',
    },
    {
      where: 'E/WD',
      text:
        'When the E/WD shows memos or limitations and no procedure, a pulsing ADV indication shows until the ENG ' +
        'pushbutton is pressed or the vibration is back in range. No ENG HI VIBRATIONS alert is raised and no box ' +
        'comes up around the engine on the E/WD: the crew calls the ENG HI VIBRATIONS procedure through the ABN PROC pushbutton of the ECP and ' +
        'the ENG menu. Its lines: ICING CONDs, A/THR OFF, ALL ENGs (1 BY 1) IDLE THEN INCREASE, then IF ABOVE VIB ADV: ' +
        'THRUST (AFFECTED ENG) REDUCE, and IF VIB STILL ABOVE VIB ADV: ENG (AFFECTED) MASTER OFF CONSIDER.',
    },
  ],
  notSimulated: [
    'The real aircraft vibrations are felt in the cockpit and cabin, often with airframe vibration; here only the ' +
      'indicated values change.',
  ],
  logbook: { required: true, reason: 'vibration advisory on the ENG page' },
  clearing: 'Maintenance only: use Restore. The values then fall back gradually.',
});

const HighVibrationFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1HighVibration,
    A380Failure.Eng2HighVibration,
    A380Failure.Eng3HighVibration,
    A380Failure.Eng4HighVibration,
  ],
  detail: highVibrationDetail,
};

export const Ata77VibrationFamilies: FailureDetailFamily[] = [HighVibrationFamily];
