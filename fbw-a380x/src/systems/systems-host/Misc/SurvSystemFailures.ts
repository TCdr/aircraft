// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380Failure } from '@failures';
import { SurvSystem } from './Communications/TransponderSystem';

const SURV_SYSTEM_FAILURE: Record<SurvSystem, number> = {
  1: A380Failure.SurvSystem1,
  2: A380Failure.SurvSystem2,
};

const WXR_DISPLAY_FAILURE: Record<SurvSystem, number> = {
  1: A380Failure.WxrDisplay1,
  2: A380Failure.WxrDisplay2,
};

const WXR_TURBULENCE_FAILURE: Record<SurvSystem, number> = {
  1: A380Failure.WxrTurbulence1,
  2: A380Failure.WxrTurbulence2,
};

const WXR_PREDICTIVE_WINDSHEAR_FAILURE: Record<SurvSystem, number> = {
  1: A380Failure.WxrPredictiveWindshear1,
  2: A380Failure.WxrPredictiveWindshear2,
};

/**
 * Whether a SURV system is lost as a whole: its AESU failed or reset. All its functions are lost then (XPDR, TCAS,
 * TAWS and the WXR functions).
 * @param system the surveillance system
 * @param isFailureActive whether a flyPad failure is active
 * @param aesuResetPulled whether the AESU reset of that system is pulled (reset panel)
 * @returns whether the system is lost
 */
export function isSurvSystemLost(
  system: SurvSystem,
  isFailureActive: (failure: number) => boolean,
  aesuResetPulled: boolean,
): boolean {
  return aesuResetPulled || isFailureActive(SURV_SYSTEM_FAILURE[system]);
}

/** The state of the three WXR functions of one SURV system */
export interface WxrFunctionsFailed {
  /** The WX display function (weather on the ND and the VD) */
  wxDisplay: boolean;
  /** The turbulence detection (magenta areas) */
  turbulence: boolean;
  /** The predictive windshear function */
  predictiveWindshear: boolean;
}

/**
 * The failed state of the WXR functions of one SURV system: each fails on its own, all fail with the system (lost or
 * unpowered).
 * @param system the surveillance system
 * @param isFailureActive whether a flyPad failure is active
 * @param systemLost whether the SURV system is lost (isSurvSystemLost)
 * @param powered whether its busbar is powered (AC ESS for SYS 1, AC 4 for SYS 2)
 * @returns the failed state of each WXR function
 */
export function wxrFunctionsFailed(
  system: SurvSystem,
  isFailureActive: (failure: number) => boolean,
  systemLost: boolean,
  powered: boolean,
): WxrFunctionsFailed {
  const systemOut = systemLost || !powered;
  return {
    wxDisplay: systemOut || isFailureActive(WXR_DISPLAY_FAILURE[system]),
    turbulence: systemOut || isFailureActive(WXR_TURBULENCE_FAILURE[system]),
    predictiveWindshear: systemOut || isFailureActive(WXR_PREDICTIVE_WINDSHEAR_FAILURE[system]),
  };
}
