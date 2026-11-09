// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { IsisLsInputs, isisLsDeviations } from './IsisLsDeviations';

const inputs: IsisLsInputs = {
  mmr1GlsChannel: 0,
  ilsLocValid: true,
  ilsLocDeviation: 0.3,
  ilsGsValid: true,
  ilsGsDeviation: -0.2,
  gls1LocValid: true,
  gls1GsValid: true,
  glsLocDeviation: 1.1,
  glsGsDeviation: 0.7,
};

describe('LS deviations of the ISIS', () => {
  it('gives the ILS values exactly while MMR 1 is in ILS mode', () => {
    expect(isisLsDeviations(inputs)).toEqual({ locValid: true, locDeviation: 0.3, gsValid: true, gsDeviation: -0.2 });
  });

  it('gives the GLS deviations while MMR 1 is set to a GLS channel and receives it', () => {
    expect(isisLsDeviations({ ...inputs, mmr1GlsChannel: 20001 })).toEqual({
      locValid: true,
      locDeviation: 1.1,
      gsValid: true,
      gsDeviation: 0.7,
    });
  });

  it('shows no index when the GLS is not received, even if an ILS is still valid on the bus', () => {
    const result = isisLsDeviations({ ...inputs, mmr1GlsChannel: 20001, gls1LocValid: false, gls1GsValid: false });
    expect(result.locValid).toBe(false);
    expect(result.gsValid).toBe(false);
  });

  it('keeps the LOC index only when the G/S is invalid on a GLS (past the GPIP)', () => {
    const result = isisLsDeviations({ ...inputs, mmr1GlsChannel: 20001, gls1GsValid: false });
    expect(result.locValid).toBe(true);
    expect(result.gsValid).toBe(false);
  });

  it('ignores the ILS validity in GLS mode', () => {
    const result = isisLsDeviations({
      ...inputs,
      mmr1GlsChannel: 20001,
      gls1LocValid: false,
      gls1GsValid: false,
      ilsLocValid: true,
      ilsGsValid: true,
    });
    expect(result.locValid).toBe(false);
  });
});
