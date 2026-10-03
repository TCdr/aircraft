// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { allFmcInop, allFmcResetsPulled } from './FmcResetPanel';

/** A simvar reader where the listed simvars are 1 and every other simvar is 0 */
const simVars =
  (...set: string[]) =>
  (name: string) =>
    set.includes(name) ? 1 : 0;

describe('FMC reset panel check', () => {
  it('is true only when the FMC-A, FMC-B and FMC-C reset buttons are all pulled', () => {
    expect(
      allFmcResetsPulled(
        simVars('L:A32NX_RESET_PANEL_FMC_A', 'L:A32NX_RESET_PANEL_FMC_B', 'L:A32NX_RESET_PANEL_FMC_C'),
      ),
    ).toBe(true);
  });

  it('keeps the FMS running while FMC-C is still in (FMC-A and FMC-B pulled)', () => {
    expect(allFmcResetsPulled(simVars('L:A32NX_RESET_PANEL_FMC_A', 'L:A32NX_RESET_PANEL_FMC_B'))).toBe(false);
  });

  it('keeps the FMS running while FMC-A or FMC-B is still in', () => {
    expect(allFmcResetsPulled(simVars('L:A32NX_RESET_PANEL_FMC_B', 'L:A32NX_RESET_PANEL_FMC_C'))).toBe(false);
    expect(allFmcResetsPulled(simVars('L:A32NX_RESET_PANEL_FMC_A', 'L:A32NX_RESET_PANEL_FMC_C'))).toBe(false);
    expect(allFmcResetsPulled(simVars())).toBe(false);
  });

  it('reports all FMCs inop only when none of them is healthy', () => {
    expect(allFmcInop(simVars())).toBe(true);
    expect(allFmcInop(simVars('L:A32NX_FMC_C_IS_HEALTHY'))).toBe(false);
    expect(allFmcInop(simVars('L:A32NX_FMC_A_IS_HEALTHY', 'L:A32NX_FMC_B_IS_HEALTHY'))).toBe(false);
  });
});
