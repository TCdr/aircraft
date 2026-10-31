// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isApuAvailMemoShown, isApuBleedMemoShown } from './ApuMemos';
import { readBleedInputs } from './BleedAlerts';
import { readBleedLeakMonitoringInputs } from './BleedLeakMonitoringAlerts';
import { readWingAntiIceValveOpenInputs } from './WingAntiIceValveOpenAlerts';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const APU_AVAIL_MEMO = '0000170';
const APU_BLEED_MEMO = '0000180';

let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

/* APU BLEED memo: shown when the APU is available and the APU BLEED pb-sw is ON. */
describe('APU BLEED and APU AVAIL memos', () => {
  it('APU BLEED follows the APU BLEED pb-sw', () => {
    expect(isApuBleedMemoShown(true, true)).toBe(true);
    expect(isApuBleedMemoShown(true, false)).toBe(false);
    expect(isApuBleedMemoShown(false, true)).toBe(false);
  });

  it('APU AVAIL shows when the APU is available and APU BLEED is not selected', () => {
    expect(isApuAvailMemoShown(true, false)).toBe(true);
    expect(isApuAvailMemoShown(true, true)).toBe(false);
    expect(isApuAvailMemoShown(false, false)).toBe(false);
  });

  it('the FWC memos follow the APU BLEED pb-sw, not the bleed valve', () => {
    const { fwc } = startCruiseFwc(simvars);
    const memoActive = (key: string) => !!fwc.ewdMessageMemos[key].simVarIsActive.get();
    expect(memoActive(APU_AVAIL_MEMO)).toBe(false);
    expect(memoActive(APU_BLEED_MEMO)).toBe(false);

    simvars.set('L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE', 1);
    // the valve is open but the pb-sw is not ON: APU AVAIL, no APU BLEED
    simvars.set('L:A32NX_APU_BLEED_AIR_VALVE_OPEN', 1);
    runFwc(fwc, 1);
    expect(memoActive(APU_AVAIL_MEMO)).toBe(true);
    expect(memoActive(APU_BLEED_MEMO)).toBe(false);

    simvars.set('L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON', 1);
    simvars.set('L:A32NX_APU_BLEED_AIR_VALVE_OPEN', 0);
    runFwc(fwc, 1);
    expect(memoActive(APU_AVAIL_MEMO)).toBe(false);
    expect(memoActive(APU_BLEED_MEMO)).toBe(true);
  });

  // The cockpit APU BLEED pb-sw writes L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON (A32NX_Interior_Misc.xml);
  // L:A32NX_OVHD_APU_BLEED_PB_IS_ON is never written in the aircraft and always reads 0.
  it('the bleed alerts read the APU BLEED pb-sw variable the cockpit writes', () => {
    const readers = [
      () => readBleedInputs().apuBleedPbOn,
      () => readBleedLeakMonitoringInputs().apuBleedPbOn,
      () => readWingAntiIceValveOpenInputs(false, 6).apuBleedPbOn,
    ];
    for (const read of readers) {
      simvars.set('L:A32NX_OVHD_APU_BLEED_PB_IS_ON', 1);
      expect(read()).toBe(false);
      simvars.clear();
      simvars.set('L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON', 1);
      expect(read()).toBe(true);
      simvars.clear();
    }
  });
});
