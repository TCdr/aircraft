// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Accuracy of the E/WD engine indications:
 * - Degraded accuracy of N1 or N2: two amber dashes over the last digit. Design choice: the FADEC sends N1 and N2 with degraded
 *   accuracy while its core sensors are failed (L:A32NX_ENGINE_n_SENSOR_FAULT, the ENG 1(2) SENSOR FAULT failure, which covers
 *   the N1 and N2 data).
 * - FADEC-DMC discrepancy: an amber CHECK under the N1, N2, EGT or FF indication when the displayed value differs from the
 *   value on the FADEC-DMC bus (L:A32NX_ENGINE_n_<N1|N2|EGT|FF>_DISCREPANCY). The crew recovers the normal indication by
 *   switching the E/WD from DMC 1 to DMC 3 (EIS DMC switching selector on CAPT 3), so the CHECK only shows on DMC 1 or 2.
 */

/** Two amber dashes in place of the last digit of a value of degraded accuracy */
export const DEGRADED_ACCURACY_DASHES = '--';

/** The amber text under a parameter with a FADEC-DMC discrepancy */
export const DISCREPANCY_CHECK_TEXT = 'CHECK';

/** L:A32NX_EIS_DMC_SWITCHING_KNOB on CAPT 3: DMC 3 replaces DMC 1, which normally drives the E/WD */
const DMC_SWITCHING_CAPT_3 = 0;

/** The last digit of N1 or N2 as shown on the E/WD */
export function lastDigitText(lastDigit: string, accuracyDegraded: boolean): string {
  return accuracyDegraded ? DEGRADED_ACCURACY_DASHES : lastDigit;
}

/** The color class of the last digit of N1 or N2: amber dashes, or the color of the value */
export function lastDigitColor(valueColor: string, accuracyDegraded: boolean): string {
  return accuracyDegraded ? 'Amber' : valueColor;
}

/**
 * The amber CHECK under an E/WD engine parameter.
 * @param discrepancy the DMC finds a discrepancy for this parameter (L:A32NX_ENGINE_n_<N1|N2|EGT|FF>_DISCREPANCY)
 * @param dmcSwitchingKnob L:A32NX_EIS_DMC_SWITCHING_KNOB (0 CAPT 3, 1 NORM, 2 F/O 3)
 * @param fadecPowered the FADEC sends the parameter (L:A32NX_FADEC_POWERED_ENGn); otherwise the value is replaced by XX
 */
export function isDiscrepancyCheckVisible(
  discrepancy: boolean,
  dmcSwitchingKnob: number,
  fadecPowered: boolean,
): boolean {
  return discrepancy && fadecPowered && dmcSwitchingKnob !== DMC_SWITCHING_CAPT_3;
}
