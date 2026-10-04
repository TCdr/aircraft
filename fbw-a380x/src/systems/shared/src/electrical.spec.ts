// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AcElectricalBus } from './electrical';

/** How the displays build the power variable of a busbar (OitDisplayUnit, CdsDisplayUnit). */
const poweredVar = (bus: AcElectricalBus) => `L:A32NX_ELEC_${bus}_BUS_IS_POWERED`;

describe('A380 AC busbar variables', () => {
  it('reads the A380 AC ESS busbar (400XP) from the AC_ESS_SHED variable', () => {
    expect(poweredVar(AcElectricalBus.AcEss)).toBe('L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED');
  });

  it('reads the A380 AC EMER busbar (491XP) from the AC_ESS variable, which exists (AC_EMER does not)', () => {
    expect(poweredVar(AcElectricalBus.AcEmer)).toBe('L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED');
  });
});
