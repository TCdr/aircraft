// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFwc, installFwcSimVarMocks, runFwc, setHealthyCruise } from './PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

describe('the FWC voices while a TCAS voice is said', () => {
  let simvars: Map<string, number>;
  let autoCallouts: { gpwsOrTcasAuralActive: boolean };
  let fwc: ReturnType<typeof createFwc>['fwc'];

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
    let bus;
    ({ fwc, bus } = createFwc());
    setHealthyCruise(bus, simvars);
    autoCallouts = (fwc as any).autoCallouts;
  });

  it('are held while a TCAS voice is said and 5 s after it started', () => {
    runFwc(fwc, 0.5);
    expect(autoCallouts.gpwsOrTcasAuralActive).toBe(false);

    simvars.set('L:A32NX_TCAS_AURAL_ACTIVE', 1);
    runFwc(fwc, 0.5);
    expect(autoCallouts.gpwsOrTcasAuralActive).toBe(true);

    simvars.set('L:A32NX_TCAS_AURAL_ACTIVE', 0);
    runFwc(fwc, 2);
    expect(autoCallouts.gpwsOrTcasAuralActive).toBe(true);

    runFwc(fwc, 4);
    expect(autoCallouts.gpwsOrTcasAuralActive).toBe(false);
  });

  it('are held for as long as the TCAS voices follow each other', () => {
    simvars.set('L:A32NX_TCAS_AURAL_ACTIVE', 1);
    runFwc(fwc, 12);
    expect(autoCallouts.gpwsOrTcasAuralActive).toBe(true);
  });
});
