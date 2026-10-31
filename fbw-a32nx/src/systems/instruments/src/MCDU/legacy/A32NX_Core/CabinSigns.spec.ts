// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A32NX_LocalVarUpdater } from './A32NX_LocalVarUpdater';
import {
  createFwc,
  installFwcSimVarMocks,
  runFwc,
  setHealthyCruise,
  writtenEwdLines,
} from '../../../../../systems-host/systems/FWC/PseudoFwcTestBed';
import { NoSmokingSignsInputs, NoSmokingSwitchPosition, areNoSmokingSignsOn, areSeatBeltsSignsOn } from './CabinSigns';

/** Cruise: switch AUTO, gear up, flaps lever 0, cabin at 8000 ft, NO SMOKING signs */
const CRUISE: NoSmokingSignsInputs = {
  switchPosition: NoSmokingSwitchPosition.auto,
  gearPositionsPercent: [0, 0, 0],
  flapsLeverIndex: 0,
  cabinAltitudeFt: 8000,
  portableDevicesSigns: false,
};

/** Runs the A32NX_LocalVarUpdater once on the given simvar values; returns the L:vars it wrote */
function runLocalVarUpdater(simVars: Map<string, number>): Map<string, boolean> {
  const written = new Map<string, boolean>();
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
  vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: unknown) => {
    written.set(name, value as boolean);
    return Promise.resolve();
  });
  new A32NX_LocalVarUpdater().update(2000);
  return written;
}

afterEach(() => {
  vi.restoreAllMocks();
});

const signsOn = (changes: Partial<NoSmokingSignsInputs>) => areNoSmokingSignsOn({ ...CRUISE, ...changes });

describe('NO SMOKING cabin signs', () => {
  it('are off in AUTO with the gear up and the flaps lever at 0', () => {
    expect(signsOn({})).toBe(false);
  });

  it('are on with the switch ON and off with the switch OFF', () => {
    expect(signsOn({ switchPosition: NoSmokingSwitchPosition.on })).toBe(true);
    expect(signsOn({ switchPosition: NoSmokingSwitchPosition.off, flapsLeverIndex: 3 })).toBe(false);
  });

  it('are on in AUTO with a landing gear extended, any of the three', () => {
    expect(signsOn({ gearPositionsPercent: [0, 0, 100] })).toBe(true);
    expect(signsOn({ gearPositionsPercent: [100, 0, 0] })).toBe(true);
  });

  it('are on in AUTO with the flaps/slats lever in 1, 2, 3 or FULL, gear up', () => {
    for (const lever of [1, 2, 3, 4]) {
      expect(signsOn({ flapsLeverIndex: lever })).toBe(true);
    }
  });

  it('come on above 11 300 ft cabin altitude whatever the switch position', () => {
    expect(signsOn({ switchPosition: NoSmokingSwitchPosition.off, cabinAltitudeFt: 11_400 })).toBe(true);
    expect(signsOn({ switchPosition: NoSmokingSwitchPosition.auto, cabinAltitudeFt: 12_000 })).toBe(true);
    expect(signsOn({ switchPosition: NoSmokingSwitchPosition.off, cabinAltitudeFt: 11_300 })).toBe(false);
  });

  it('do not come on with the cabin altitude for the NO PORTABLE ELEC DEVICE signs', () => {
    expect(
      signsOn({ switchPosition: NoSmokingSwitchPosition.off, cabinAltitudeFt: 14_000, portableDevicesSigns: true }),
    ).toBe(false);
  });

  describe('memo L:var', () => {
    it('is written from the switch, gear, flaps lever and cabin altitude L:vars', () => {
      const simVars = new Map<string, number>([
        ['L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', NoSmokingSwitchPosition.auto],
        ['L:A32NX_PRESS_MAN_CABIN_ALTITUDE', 8000],
      ]);
      expect(runLocalVarUpdater(simVars).get('L:A32NX_NO_SMOKING_MEMO')).toBe(false);

      simVars.set('L:A32NX_FLAPS_HANDLE_INDEX', 1);
      expect(runLocalVarUpdater(simVars).get('L:A32NX_NO_SMOKING_MEMO')).toBe(true);

      simVars.set('L:A32NX_FLAPS_HANDLE_INDEX', 0);
      simVars.set('L:A32NX_GEAR_CENTER_POSITION', 100);
      expect(runLocalVarUpdater(simVars).get('L:A32NX_NO_SMOKING_MEMO')).toBe(true);

      simVars.set('L:A32NX_GEAR_CENTER_POSITION', 0);
      simVars.set('L:A32NX_PRESS_MAN_CABIN_ALTITUDE', 11_400);
      expect(runLocalVarUpdater(simVars).get('L:A32NX_NO_SMOKING_MEMO')).toBe(true);
    });

    it('does not follow the cabin altitude with the NO PED switch', () => {
      const simVars = new Map<string, number>([
        ['L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', NoSmokingSwitchPosition.off],
        ['L:A32NX_CONFIG_USING_PORTABLE_DEVICES', 1],
        ['L:A32NX_PRESS_MAN_CABIN_ALTITUDE', 14_000],
      ]);
      expect(runLocalVarUpdater(simVars).get('L:A32NX_NO_SMOKING_MEMO')).toBe(false);
    });
  });
});

describe('SEAT BELTS cabin signs', () => {
  it('follow the SEAT BELTS switch below 11 300 ft cabin altitude', () => {
    expect(areSeatBeltsSignsOn({ switchOn: true, cabinAltitudeFt: 8000 })).toBe(true);
    expect(areSeatBeltsSignsOn({ switchOn: false, cabinAltitudeFt: 8000 })).toBe(false);
    expect(areSeatBeltsSignsOn({ switchOn: false, cabinAltitudeFt: 11_300 })).toBe(false);
  });

  it('come on above 11 300 ft cabin altitude with the switch OFF', () => {
    expect(areSeatBeltsSignsOn({ switchOn: false, cabinAltitudeFt: 11_400 })).toBe(true);
  });

  describe('memo L:var, read by the FWC for the SEAT BELTS memo and the T.O MEMO', () => {
    it('is written from the SEAT BELTS switch and the cabin altitude L:var', () => {
      const simVars = new Map<string, number>([['L:A32NX_PRESS_MAN_CABIN_ALTITUDE', 8000]]);
      expect(runLocalVarUpdater(simVars).get('L:A32NX_SEAT_BELTS_MEMO')).toBe(false);

      simVars.set('A:CABIN SEATBELTS ALERT SWITCH', 1);
      expect(runLocalVarUpdater(simVars).get('L:A32NX_SEAT_BELTS_MEMO')).toBe(true);

      simVars.set('A:CABIN SEATBELTS ALERT SWITCH', 0);
      simVars.set('L:A32NX_PRESS_MAN_CABIN_ALTITUDE', 11_400);
      expect(runLocalVarUpdater(simVars).get('L:A32NX_SEAT_BELTS_MEMO')).toBe(true);
    });
  });

  describe('SEAT BELTS memo of the FWC', () => {
    const SEAT_BELTS_MEMO = '000008001';
    let simvars: Map<string, number>;
    let writes: Map<string, unknown>;

    beforeEach(() => {
      vi.setConfig({ testTimeout: 60_000 });
      ({ simvars, writes } = installFwcSimVarMocks());
    });

    it('shows while L:A32NX_SEAT_BELTS_MEMO is set, and not for the sim switch alone', () => {
      const { fwc, bus } = createFwc();
      setHealthyCruise(bus, simvars);
      runFwc(fwc, 3);
      expect(writtenEwdLines(writes, 'LEFT')).not.toContain(SEAT_BELTS_MEMO);

      // the FWC reads the memo L:var, not the switch of the sim
      simvars.set('A:CABIN SEATBELTS ALERT SWITCH', 1);
      runFwc(fwc, 2);
      expect(writtenEwdLines(writes, 'LEFT')).not.toContain(SEAT_BELTS_MEMO);

      simvars.set('L:A32NX_SEAT_BELTS_MEMO', 1);
      runFwc(fwc, 2);
      expect(writtenEwdLines(writes, 'LEFT')).toContain(SEAT_BELTS_MEMO);

      simvars.set('L:A32NX_SEAT_BELTS_MEMO', 0);
      runFwc(fwc, 2);
      expect(writtenEwdLines(writes, 'LEFT')).not.toContain(SEAT_BELTS_MEMO);
    });
  });
});
