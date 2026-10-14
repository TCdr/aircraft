// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * RECORDER alerts (A380 FCOM PRO-ABN-ECAM-10-31, a380_fcom.txt l.158880-158980; DSC-31-90-50, l.78189-78195), all
 * "Crew awareness." without a procedure (l.158893, 158919, 158943, 158972): level 1 cautions, no aural and no master
 * light (DSC-31 alert levels, l.71433-71437; PDF pages 5417-5420):
 * - RECORDER ACCELMTR FAULT: "The accelerometer used by the DFDR is failed" (l.158886), INOP SYS RECORDER ACCELMTR
 *   (l.158900).
 * - RECORDER CVR FAULT: "The CVR is failed" (l.158912), INOP SYS CVR (l.158925).
 * - RECORDER DFDR FAULT: "The DFDR is failed" (l.158937), INOP SYS DFDR (l.158950).
 * - RECORDER SYS FAULT: "The FDIU is failed and does not transmit any information to the recorders (DFDR)" (l.158967),
 *   INOP SYS RECORDER SYS (l.158979).
 * The recorders are not simulated: each alert follows its flyPad failure.
 * Not done: the CVR TEST pb result ("If the test is not successful, the ECAM triggers a RECORDER CVR FAULT alert 5 s
 * after the pushbutton is pressed", l.78117-78119): a failed CVR already raises the alert outside its inhibited phases.
 */

/** RECORDER ACCELMTR FAULT is inhibited in phases 2 to 11 (FCOM PDF page 5417) */
export const RECORDER_ACCELMTR_PHASE_INHIBITION = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** RECORDER CVR, DFDR and SYS FAULT are inhibited in phases 3 to 11 (FCOM PDF pages 5418, 5419, 5420) */
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
