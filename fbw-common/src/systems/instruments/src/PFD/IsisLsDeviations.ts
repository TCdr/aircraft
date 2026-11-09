// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { isLsDeviationValid, lsDeviation, lsSource } from './FlsDisplay';

export interface IsisLsInputs {
  /** the channel MMR 1 is set to, 0 while it is in ILS mode */
  mmr1GlsChannel: number;
  ilsLocValid: boolean;
  ilsLocDeviation: number;
  ilsGsValid: boolean;
  ilsGsDeviation: number;
  gls1LocValid: boolean;
  gls1GsValid: boolean;
  glsLocDeviation: number;
  glsGsDeviation: number;
}

export interface IsisLsDeviations {
  locValid: boolean;
  /** degrees, positive with the beam to the right */
  locDeviation: number;
  gsValid: boolean;
  /** degrees, positive above the beam */
  gsDeviation: number;
}

/**
 * The deviations the ISIS LS scales show. The ISIS is fed by MMR 1: on a GLS the ILS receiver is detuned, so the scales
 * take the GLS deviations and the validity of the GLS on that MMR. Importing this file directly keeps the FSComponent
 * index of the PFD out of the React instrument.
 */
export function isisLsDeviations(inputs: IsisLsInputs): IsisLsDeviations {
  const source = lsSource(false, inputs.mmr1GlsChannel > 0);
  return {
    locValid: isLsDeviationValid(source, inputs.ilsLocValid, false, inputs.gls1LocValid),
    locDeviation: lsDeviation(source, inputs.ilsLocDeviation, 0, inputs.glsLocDeviation),
    gsValid: isLsDeviationValid(source, inputs.ilsGsValid, false, inputs.gls1GsValid),
    gsDeviation: lsDeviation(source, inputs.ilsGsDeviation, 0, inputs.glsGsDeviation),
  };
}
