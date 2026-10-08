// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  EGT_RED_LIMIT_DEGREES,
  EGT_START_LIMIT_DEGREES,
  N1_RED_LIMIT_PERCENT,
  N2_RED_LIMIT_PERCENT,
  egtAmberLimit,
} from '@shared/EngineLimits';

/*
 * ENG 1(2) STALL and ENG 1(2) N1/N2/EGT OVER LIMIT (A320 FCOM PRO-ABN-ENG, a320_fcom.txt l.81293-81341 and
 * l.80408-80475). Both are amber cautions: the FCOM shows their title in amber. Flight phase inhibition (2019 FCOM PDF,
 * "fcom-a320-flight-crew-operationg-manual-a320-iss-20190215", figures read on the rendered pages): ENG 1(2) STALL page
 * 2302, inhibited in phases 3, 4, 5, 7 and 8; ENG 1(2) N1/N2/EGT OVER LIMIT page 2279, inhibited in phases 4 and 8.
 *
 * The limits are those of the EWD (@shared/EngineLimits: the CFM56-5B TCDS EGT figures confirmed in the sim by the user),
 * so that the alert comes up with the amber EGT: the FCOM text (l.80420-80423) gives N1 104 %, N2 105 % and an EGT of
 * 725 °C during start, 950 °C at TOGA or FLX/MCT, 915 °C otherwise; the user chose the TCDS EGT values (940 °C at TOGA/FLX,
 * 905 °C at CLB/MCT/MREV, 725 °C without a rated limit or during start). The LEAP-1A limits are an open question.
 */

/**
 * l.80456-80460, the second "Max pointer indication" band: "EGT above 970 °C or N1 above 105.8 % or N2 above 105.8 %"
 * calls for THR LEVER IDLE and ENG MASTER OFF; below it, THR LEVER BELOW LIMIT. With the TCDS EGT limits the EGT band is
 * the EGT red limit of the EWD (975 °C, design choice in place of the FCOM 970 °C).
 */
export const EGT_SHUTDOWN_BAND_DEGREES = EGT_RED_LIMIT_DEGREES;
export const N1_SHUTDOWN_BAND_PERCENT = 105.8;
export const N2_SHUTDOWN_BAND_PERCENT = 105.8;

export { N1_RED_LIMIT_PERCENT, N2_RED_LIMIT_PERCENT };

/** The EGT above which the alert triggers: the amber EGT limit of the EWD, 725 °C during a start */
export function egtOverLimitThreshold(engineStarting: boolean, thrustLimitType: number): number {
  if (engineStarting) {
    return EGT_START_LIMIT_DEGREES;
  }
  return egtAmberLimit(thrustLimitType);
}

/** The parameter shown in the title of the alert */
export enum OverLimitParameter {
  None,
  N1,
  N2,
  Egt,
}

export interface EngineOverLimitInputs {
  n1Percent: number;
  n2Percent: number;
  egtDegrees: number;
  /** The engine start sequence is in progress (ENGINE_STATE Starting or Restarting) */
  engineStarting: boolean;
  onGround: boolean;
  /** L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE (ThrustLimitType of @shared/EngineLimits) */
  thrustLimitType: number;
}

/**
 * ENG 1(2) N1/N2/EGT OVER LIMIT. The alert is active while one parameter is above its limit. The procedure depends on the
 * "max pointer indication", the highest value reached (l.80444-80460): the monitor keeps the highest N1, N2 and EGT
 * reached above their limits until the next engine start sequence on ground, as the EWD exceedance marks do (DSC-70-90-40
 * l.64286-64287, 64388-64389: "The red mark no longer appears at the next engine start sequence on ground").
 */
export class EngineOverLimitMonitor {
  private maxN1Percent = 0;

  private maxN2Percent = 0;

  private maxEgtDegrees = 0;

  private parameter = OverLimitParameter.None;

  update(inputs: EngineOverLimitInputs): void {
    if (inputs.engineStarting && inputs.onGround) {
      this.maxN1Percent = 0;
      this.maxN2Percent = 0;
      this.maxEgtDegrees = 0;
    }

    const n1OverLimit = inputs.n1Percent > N1_RED_LIMIT_PERCENT;
    const n2OverLimit = inputs.n2Percent > N2_RED_LIMIT_PERCENT;
    const egtOverLimit = inputs.egtDegrees > egtOverLimitThreshold(inputs.engineStarting, inputs.thrustLimitType);
    if (n1OverLimit) {
      this.maxN1Percent = Math.max(this.maxN1Percent, inputs.n1Percent);
    }
    if (n2OverLimit) {
      this.maxN2Percent = Math.max(this.maxN2Percent, inputs.n2Percent);
    }
    if (egtOverLimit) {
      this.maxEgtDegrees = Math.max(this.maxEgtDegrees, inputs.egtDegrees);
    }

    // Design choice: the title names the parameter above its limit, the EGT first (the FCOM title covers the three).
    if (egtOverLimit) {
      this.parameter = OverLimitParameter.Egt;
    } else if (n1OverLimit) {
      this.parameter = OverLimitParameter.N1;
    } else if (n2OverLimit) {
      this.parameter = OverLimitParameter.N2;
    } else {
      this.parameter = OverLimitParameter.None;
    }
  }

  get isActive(): boolean {
    return this.parameter !== OverLimitParameter.None;
  }

  get overLimitParameter(): OverLimitParameter {
    return this.parameter;
  }

  /** The highest values reached in the second band of l.80456-80460: the engine must be shut down */
  get inShutdownBand(): boolean {
    return (
      this.maxEgtDegrees > EGT_SHUTDOWN_BAND_DEGREES ||
      this.maxN1Percent > N1_SHUTDOWN_BAND_PERCENT ||
      this.maxN2Percent > N2_SHUTDOWN_BAND_PERCENT
    );
  }
}

/**
 * The lines of ENG 1(2) N1/N2/EGT OVER LIMIT, by index in its codes (EwdMessages 7700731/7700732):
 * 0 title N1, 1 title N2, 2 title EGT, 3 -THR LVR n..BELOW LIMIT, 4 -THR LEVER n.......IDLE, 5 -ENG MASTER n.......OFF.
 * l.80444-80460: below the second band, THR LEVER BELOW LIMIT; in the second band, THR LEVER IDLE and ENG MASTER OFF. The
 * L2 notes ("Normal operation may be resumed...", "land ASAP...") are crew information, not ECAM lines. The line of an
 * action done (lever at idle) goes.
 */
export function engineOverLimitLines(
  parameter: OverLimitParameter,
  inShutdownBand: boolean,
  thrLeverIdle: boolean,
): number[] {
  const title = parameter === OverLimitParameter.N1 ? 0 : parameter === OverLimitParameter.N2 ? 1 : 2;
  if (!inShutdownBand) {
    return [title, 3];
  }
  return [title, ...(thrLeverIdle ? [] : [4]), 5];
}

/**
 * The lines of ENG 1(2) STALL, by index in its codes (EwdMessages 7700721/7700722):
 * 0 title, 1 -THR LEVER n.......IDLE, 2 -ENG MASTER n.......OFF, 3 -ENG n PARAMETERS.CHECK, 4 -ENG n STALL PROC.APPLY.
 * l.81327-81335: on ground THR LEVER IDLE, ENG MASTER OFF; in flight THR LEVER IDLE, ENG PARAMETERS CHECK, ENG 1(2) STALL PROC
 * APPLY. The alert is inhibited in phases 3-5, 7 and 8, so it shows on ground in phases 1, 2, 9 and 10 and in flight in
 * phase 6. The line of an action done (lever at idle) goes.
 */
export function engineStallLines(flightPhase: number, thrLeverIdle: boolean): number[] {
  const thrLeverLine = thrLeverIdle ? [] : [1];
  const onGround = flightPhase <= 2 || flightPhase >= 9;
  return onGround ? [0, ...thrLeverLine, 2] : [0, ...thrLeverLine, 3, 4];
}

/** l.81339-81341, the STATUS of ENG 1(2) STALL: CONSIDER ENG 1(2) RELIGHT (StatusMessages 700400006/700400007) */
export function engineStallStatus(engineNumber: 1 | 2): string[] {
  return [engineNumber === 1 ? '700400006' : '700400007'];
}
