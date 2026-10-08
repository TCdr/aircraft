// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Units } from '../../../../../shared/src/units';

/**
 * The weights of the Performance > Buffet page in the flyPad weight unit (EFB_PREFERRED_WEIGHT_UNIT, kg or lb), shown
 * like the other Performance pages: tonnes (t) or thousands of pounds (klb). The buffet model works in tonnes.
 */

/** The flyPad weight unit setting */
export type BuffetWeightUnit = 'kg' | 'lb';

/** The unit shown next to a weight: t or klb */
export function buffetWeightUnitText(unit: BuffetWeightUnit): 't' | 'klb' {
  return unit === 'lb' ? 'klb' : 't';
}

/** A weight in tonnes, in the shown unit (t or klb) */
export function tonnesToShownWeight(tonnes: number, unit: BuffetWeightUnit): number {
  return unit === 'lb' ? Units.kilogramToPound(tonnes * 1000) / 1000 : tonnes;
}

/** A shown weight (t or klb), in tonnes */
export function shownWeightToTonnes(shown: number, unit: BuffetWeightUnit): number {
  return unit === 'lb' ? Units.poundToKilogram(shown * 1000) / 1000 : shown;
}

/** A shown weight rounded to 0.1 (the precision of the field), e.g. for the A/C button */
export function roundShownWeight(tonnes: number, unit: BuffetWeightUnit): number {
  return Math.round(tonnesToShownWeight(tonnes, unit) * 10) / 10;
}
