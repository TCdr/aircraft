// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimVarValueType } from '@microsoft/msfs-sdk';
import { GLS_RECEIVER_SIMVARS } from '../../../../../../../fbw-common/src/systems/instruments/src/ND/types/GlsReceiverSimVars';
import { adfSignalStrength, navAvailable, navHasDme } from './VorBusPublisher';

describe('VOR bus of the NDs with the radio navigation receiver failures', () => {
  const { GetSimVarValue } = SimVar;
  /** The failed receiver L:vars, as the systems host (NavigationReceiverFailures) writes them */
  let failed: Set<string>;

  function fail(receiverFailedVar: string): void {
    failed.add(receiverFailedVar);
  }

  beforeEach(() => {
    failed = new Set<string>();
    SimVar.GetSimVarValue = (name: string) => (failed.has(name) ? 1 : 0);
  });

  afterEach(() => {
    SimVar.GetSimVarValue = GetSimVarValue;
  });

  it('gives the sim signals while no receiver is failed', () => {
    expect(navAvailable(1, 1)).toBe(true);
    expect(navAvailable(2, 0)).toBe(false);
    expect(navHasDme(1, 1)).toBe(true);
    expect(adfSignalStrength(1, 0.8)).toBe(0.8);
  });

  it('drops the bearing of a failed VOR, but keeps its DME', () => {
    fail('L:A32NX_VOR_1_FAILED');
    expect(navAvailable(1, 1)).toBe(false);
    expect(navHasDme(1, 1)).toBe(true);
    expect(navAvailable(2, 1)).toBe(true);
  });

  it('drops the distance of a failed DME, but keeps the VOR bearing', () => {
    fail('L:A32NX_DME_2_FAILED');
    expect(navHasDme(2, 1)).toBe(false);
    expect(navAvailable(2, 1)).toBe(true);
    expect(navHasDme(1, 1)).toBe(true);
  });

  it('drops the localiser of a failed ILS receiver (NAV 3 for ILS 1, NAV 4 for ILS 2)', () => {
    fail('L:A32NX_ILS_2_FAILED');
    expect(navAvailable(4, 1)).toBe(false);
    expect(navAvailable(3, 1)).toBe(true);
  });

  it('gives no signal for a failed ADF', () => {
    fail('L:A32NX_ADF_1_FAILED');
    expect(adfSignalStrength(1, 0.8)).toBe(0);
    expect(adfSignalStrength(2, 0.8)).toBe(0.8);
  });
});

describe('GLS L:vars of the NDs, shared by both aircraft', () => {
  it('uses the names and types the systems host writes', () => {
    const entries: { [topic: string]: { name: string; type: SimVarValueType } } = {};
    for (const [topic, entry] of GLS_RECEIVER_SIMVARS) {
      entries[topic] = entry;
    }
    expect(entries).toEqual({
      mmr1GlsChannel: { name: 'L:A32NX_MMR_1_GLS_CHANNEL', type: SimVarValueType.Number },
      mmr2GlsChannel: { name: 'L:A32NX_MMR_2_GLS_CHANNEL', type: SimVarValueType.Number },
      gls1LocValid: { name: 'L:A32NX_GLS_1_LOC_IS_VALID', type: SimVarValueType.Bool },
      gls2LocValid: { name: 'L:A32NX_GLS_2_LOC_IS_VALID', type: SimVarValueType.Bool },
      gls1GsValid: { name: 'L:A32NX_GLS_1_GS_IS_VALID', type: SimVarValueType.Bool },
      gls2GsValid: { name: 'L:A32NX_GLS_2_GS_IS_VALID', type: SimVarValueType.Bool },
      glsLocDeviation: { name: 'L:A32NX_GLS_LOC_DEVIATION', type: SimVarValueType.Number },
      glsGsDeviation: { name: 'L:A32NX_GLS_GS_DEVIATION', type: SimVarValueType.Number },
      gbasIdent: { name: 'L:A32NX_GBAS_IDENT', type: SimVarValueType.Number },
    });
  });
});
