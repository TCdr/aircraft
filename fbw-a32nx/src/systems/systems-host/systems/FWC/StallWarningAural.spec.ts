// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { discreteWordWithBits } from './FwcControlsAlertProbe';
import { FwsSoundManager } from './FwsSoundManager';
import { PseudoFWC } from './PseudoFWC';
import { createFwc, installFwcSimVarMocks, normalWord, runFwc, setHealthyCruise } from './PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const STALL_AURAL = 'L:A32NX_AUDIO_STALL_WARNING';
const FCDC_1_DISCRETE_WORD_1 = 'L:A32NX_FCDC_1_DISCRETE_WORD_1';
const NORMAL_LAW_BIT = 11;
const RADIO_HEIGHT_LOW = 500;

describe('the stall aural of the PseudoFWC', () => {
  let simvars: Map<string, number>;
  let writes: Map<string, unknown>;
  let fwc: PseudoFWC;
  let bus: EventBus;

  const publishStall = (stall: boolean) => bus.getPublisher<any>().pub('stall_warning_on', stall, false, true);

  beforeEach(() => {
    ({ simvars, writes } = installFwcSimVarMocks());
    vi.spyOn(FwsSoundManager.prototype, 'setAuralsInhibited');
    ({ fwc, bus } = createFwc());
    // Healthy cruise: the FCDC words are NCD, so the flight controls are not in normal law
    setHealthyCruise(bus, simvars);
    for (let adr = 1; adr <= 3; adr++) {
      bus.getPublisher<any>().pub(`a32nx_adr_computed_airspeed_${adr}`, normalWord(200), false, true);
    }
    simvars.set('L:A32NX_RA_1_RADIO_ALTITUDE', normalWord(RADIO_HEIGHT_LOW));
    simvars.set('L:A32NX_RA_2_RADIO_ALTITUDE', normalWord(RADIO_HEIGHT_LOW));
  });

  it('sounds the stall aural below 1500 ft radio height out of normal law', () => {
    publishStall(true);
    runFwc(fwc, 1);

    expect(writes.get(STALL_AURAL)).toBe(true);
  });

  it('gives no stall aural on the ground', () => {
    simvars.set('L:A32NX_FWC_FLIGHT_PHASE', 1);
    publishStall(true);
    runFwc(fwc, 1);

    expect(writes.get(STALL_AURAL)).toBe(false);
  });

  it('gives no stall aural in normal law', () => {
    simvars.set(FCDC_1_DISCRETE_WORD_1, discreteWordWithBits(NORMAL_LAW_BIT));
    publishStall(true);
    runFwc(fwc, 1);

    expect(writes.get(STALL_AURAL)).toBe(false);
  });

  it('holds the other FWC aurals while the stall sounds', () => {
    publishStall(true);
    runFwc(fwc, 1);
    expect(FwsSoundManager.prototype.setAuralsInhibited).toHaveBeenLastCalledWith(true);

    publishStall(false);
    runFwc(fwc, 1);
    expect(FwsSoundManager.prototype.setAuralsInhibited).toHaveBeenLastCalledWith(false);
  });
});
