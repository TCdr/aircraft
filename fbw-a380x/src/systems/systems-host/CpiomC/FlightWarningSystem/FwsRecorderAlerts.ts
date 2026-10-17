// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * RECORDER alerts, all crew awareness without a procedure: level 1 cautions, no aural and no master light.
 * - RECORDER ACCELMTR FAULT: the accelerometer of the DFDR failed, INOP SYS RECORDER ACCELMTR.
 * - RECORDER CVR FAULT: the CVR failed, INOP SYS CVR.
 * - RECORDER DFDR FAULT: the DFDR failed, INOP SYS DFDR.
 * - RECORDER SYS FAULT: the FDIU failed and sends nothing to the recorders (DFDR), INOP SYS RECORDER SYS.
 * The recorders are not simulated: each alert follows its flyPad failure.
 * Not done: a failed CVR TEST raising RECORDER CVR FAULT 5 s after the pb press; a failed CVR already raises the alert
 * outside its inhibited phases.
 */

/** RECORDER ACCELMTR FAULT is inhibited in phases 2 to 11 */
export const RECORDER_ACCELMTR_PHASE_INHIBITION = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** RECORDER CVR, DFDR and SYS FAULT are inhibited in phases 3 to 11 */
export const RECORDER_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10, 11];

/** The flyPad failures of the recorders */
export interface RecorderFailures {
  readonly cockpitVoiceRecorder: boolean;
  readonly flightDataRecorder: boolean;
  readonly accelerometer: boolean;
  readonly flightDataInterfaceUnit: boolean;
}

/** The RECORDER alerts, each with its INOP SYS line */
export interface RecorderAlerts {
  readonly accelerometerFault: boolean;
  readonly cvrFault: boolean;
  readonly dfdrFault: boolean;
  readonly systemFault: boolean;
}

/**
 * @param failures the recorder failures
 * @returns the RECORDER alerts
 */
export function recorderAlerts(failures: RecorderFailures): RecorderAlerts {
  return {
    accelerometerFault: failures.accelerometer,
    cvrFault: failures.cockpitVoiceRecorder,
    dfdrFault: failures.flightDataRecorder,
    systemFault: failures.flightDataInterfaceUnit,
  };
}
