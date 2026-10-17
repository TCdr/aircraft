// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SimVarDefinition } from '@microsoft/msfs-sdk';
import { onsideLandingSystemReceiverSimVars, selectOnsideLandingSystemReceiver } from './OnsideLandingSystemReceiver';

/** The simvar sources the PFD publisher is given, by key */
function sourcesFor(displayIndex: number): Map<string, string> {
  const sources = new Map<string, string>();
  selectOnsideLandingSystemReceiver(
    { updateSimVarSource: (key: string, value: SimVarDefinition) => sources.set(key, value.name) },
    displayIndex,
  );
  return sources;
}

// Captain PFD displays ILS 1, first officer PFD ILS 2
describe('A380X PFD onside ILS receiver', () => {
  it('keeps MMR 1 (NAV 3, A32NX_RADIO_RECEIVER_*) on the CAPT PFD', () => {
    expect(sourcesFor(1).size).toBe(0);
  });

  it('keeps MMR 1 while the side is unknown', () => {
    expect(sourcesFor(0).size).toBe(0);
  });

  it('reads MMR 2 (NAV 4) on the F/O PFD for every landing system value', () => {
    const sources = sourcesFor(2);

    expect(sources).toEqual(
      new Map([
        ['hasLoc', 'L:A32NX_MMR_2_LOC_IS_VALID'],
        ['hasDme', 'NAV HAS DME:4'],
        ['navIdent', 'NAV IDENT:4'],
        ['navFreq', 'NAV FREQUENCY:4'],
        ['dme', 'NAV DME:4'],
        ['navRadialError', 'L:A32NX_MMR_2_LOC_DEVIATION'],
        ['hasGlideslope', 'L:A32NX_MMR_2_GS_IS_VALID'],
        ['glideSlopeError', 'L:A32NX_MMR_2_GS_DEVIATION'],
      ]),
    );
  });

  it('never reads NAV 3 on the F/O PFD', () => {
    for (const [, definition] of onsideLandingSystemReceiverSimVars(2)) {
      expect(definition.name).not.toMatch(/:3$|RADIO_RECEIVER/);
    }
  });
});
