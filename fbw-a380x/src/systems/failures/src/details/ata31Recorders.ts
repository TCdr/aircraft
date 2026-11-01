// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';

/** RECORDER ACCELMTR FAULT: inhibited in flight phases 2 to 11 */
const NOT_SHOWN_PHASES_2_TO_11 =
  'a new alert shows only with the engines off on electrical power, including the first minutes after the engines ' +
  'are shut down; it is not shown from the first engine start until the engines are shut down';

/** RECORDER CVR, DFDR and SYS FAULT: inhibited in flight phases 3 to 11 */
const NOT_SHOWN_PHASES_3_TO_11 =
  'a new alert shows only on the ground before take-off power is set: with the engines off, and with engines ' +
  'running (engine start and taxi-out); it is not shown from take-off power through the flight and the landing ' +
  'until the engines are ' +
  'shut down';

const RECORDING_NOT_SIMULATED =
  'The failed recorder stops recording; the sim records nothing, so only the alert and the STATUS line show the ' +
  'failure.';

interface RecorderOptions {
  whatItIs: string;
  title: string;
  alertId: string;
  notShown: string;
  /** the INOP SYS line of the STATUS page */
  inopSysLine: string;
  impact: readonly string[];
  extraNotSimulated?: string;
}

const recorderDetail = (options: RecorderOptions): FailureDetail => ({
  whatItIs: options.whatItIs,
  impact: options.impact,
  alertIds: [options.alertId],
  effects: [
    {
      where: 'E/WD',
      text:
        `${options.title} appears, ${ADVISORY}; ${options.notShown}. It has no lines and calls up no SD page, and ` +
        'nothing else in the aircraft changes.',
    },
    {
      where: 'SD STATUS',
      text:
        `${options.inopSysLine} is listed under INOP SYS (ALL PHASES part) in every flight phase, also while the ` +
        'alert itself is held back by the flight phase.',
    },
  ],
  notSimulated: options.extraNotSimulated
    ? [RECORDING_NOT_SIMULATED, options.extraNotSimulated]
    : [RECORDING_NOT_SIMULATED],
  logbook: { required: true, reason: 'advisory, recorder inoperative' },
  clearing: MAINTENANCE_ONLY,
});

const cockpitVoiceRecorderDetail = recorderDetail({
  whatItIs:
    'The cockpit voice recorder system records the voice communications to and from the flight deck and the ' +
    'sounds in the cockpit. It gets its time reference from the flight data interface unit and keeps the last ' +
    'recording in a crash-protected memory.',
  title: 'RECORDER CVR FAULT',
  alertId: '319800002',
  notShown: NOT_SHOWN_PHASES_3_TO_11,
  inopSysLine: 'CVR',
  extraNotSimulated:
    'A CVR TEST does not show the failure (on the aircraft a failed test raises RECORDER CVR FAULT 5 s after the ' +
    'press).',
  impact: [
    'The cockpit voice recorder is reported failed.',
    'The failure is crew awareness only: no procedure and no other system is affected.',
  ],
});

const flightDataRecorderDetail = recorderDetail({
  whatItIs:
    'The digital flight data recorder stores the flight parameters and data of many aircraft systems in a ' +
    'crash-protected memory. The crew can mark an event in the recording with the DFDR EVENT pushbutton.',
  title: 'RECORDER DFDR FAULT',
  alertId: '319800003',
  notShown: NOT_SHOWN_PHASES_3_TO_11,
  inopSysLine: 'DFDR',
  impact: [
    'The digital flight data recorder is reported failed.',
    'The failure is crew awareness only: no procedure and no other system is affected.',
  ],
});

const accelerometerDetail = recorderDetail({
  whatItIs:
    'The linear three-axis accelerometer gives the longitudinal, vertical and lateral accelerations of the aircraft ' +
    'to the flight data recorder. It is part of the flight data recording system.',
  title: 'RECORDER ACCELMTR FAULT',
  alertId: '319800001',
  notShown: NOT_SHOWN_PHASES_2_TO_11,
  inopSysLine: 'RECORDER ACCELMTR',
  impact: [
    'The accelerometer of the flight data recorder is reported failed.',
    'The failure is crew awareness only: no procedure and no other system is affected.',
  ],
});

const flightDataInterfaceUnitDetail = recorderDetail({
  whatItIs:
    'The flight data interface unit collects data from the avionics systems, processes the parameters and passes ' +
    'them to the flight data recorder. It also gives the cockpit voice recorder its UTC time reference.',
  title: 'RECORDER SYS FAULT',
  alertId: '319800004',
  notShown: NOT_SHOWN_PHASES_3_TO_11,
  inopSysLine: 'RECORDER SYS',
  impact: [
    'The flight data interface unit is reported failed: it sends no information to the flight data recorder.',
    'The failure is crew awareness only: no procedure and no other system is affected.',
  ],
});

export const Ata31RecordersEntries: Record<number, FailureDetail> = {
  [A380Failure.CockpitVoiceRecorder]: cockpitVoiceRecorderDetail,
  [A380Failure.FlightDataRecorder]: flightDataRecorderDetail,
  [A380Failure.FlightDataRecorderAccelerometer]: accelerometerDetail,
  [A380Failure.FlightDataInterfaceUnit]: flightDataInterfaceUnitDetail,
};
