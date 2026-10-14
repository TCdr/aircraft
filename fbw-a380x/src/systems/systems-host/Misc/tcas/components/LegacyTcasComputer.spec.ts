// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { EventBus } from '@microsoft/msfs-sdk';
import { LegacyTcasComputer } from './LegacyTcasComputer';
import { Inhibit, TcasMode } from '../lib/TcasConstants';
import { LegacySoundManager } from '../../LegacySoundManager';

/*
 * A380 FCOM DSC-34-20-40-10 (a380_fcom.txt l.90525-90536): "The TA ONLY mode is automatically selected, if: One of the
 * following alerts is triggered: Windshear, Stall, TAWS. The TCAS returns to TA/RA mode, when the alert is finished.
 * [...] The aircraft is in emergency electrical configuration."
 */
describe('TCAS automatic TA ONLY', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  interface Conditions {
    windshear?: boolean;
    stallFws1?: boolean;
    acBusesLost?: boolean;
  }

  /** The inhibition level at FL 100, 5 000 ft radio height, TCAS in TA/RA, under the given conditions */
  const inhibitionWith = (conditions: Conditions): Inhibit => {
    vi.spyOn(SimVar, 'GetGlobalVarValue').mockImplementation(() => 1);
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => {
      switch (name) {
        case 'L:A32NX_RA_1_RADIO_ALTITUDE':
          return Arinc429Word.getRawWord(5000, Arinc429SignStatusMatrix.NormalOperation);
        case 'L:A32NX_ADIRS_ADR_1_ALTITUDE':
          return Arinc429Word.getRawWord(10000, Arinc429SignStatusMatrix.NormalOperation);
        case 'L:A32NX_REACTIVE_WINDSHEAR_WARNING':
          return conditions.windshear ? 1 : 0;
        case 'L:A32NX_FWC_1_DISCRETE_WORD_126':
          // bit 17 = STALL warning (FwsCore.ts)
          return Arinc429Word.getRawWord(conditions.stallFws1 ? 1 << 16 : 0, Arinc429SignStatusMatrix.NormalOperation);
        case 'L:A32NX_ELEC_AC_1_BUS_IS_POWERED':
        case 'L:A32NX_ELEC_AC_2_BUS_IS_POWERED':
        case 'L:A32NX_ELEC_AC_3_BUS_IS_POWERED':
        case 'L:A32NX_ELEC_AC_4_BUS_IS_POWERED':
          return conditions.acBusesLost ? 0 : 1;
        default:
          return 0;
      }
    });
    const tcas = new LegacyTcasComputer(new EventBus(), {} as unknown as LegacySoundManager) as any;
    let mode = TcasMode.TARA;
    tcas.tcasMode = { getVar: () => mode, setVar: (v: TcasMode) => (mode = v) };
    // what init() sets up (not run here: it needs the sim game state)
    tcas.ppos = { lat: NaN, long: NaN };
    tcas.updateVars();
    // updateVars sets the mode from the (not powered here) TCAS: keep the TA/RA mode the crew selected
    mode = TcasMode.TARA;
    tcas.updateInhibitions();
    return tcas.inhibitions;
  };

  it('TA/RA without these alerts: no RA inhibited at FL 100', () => {
    expect(inhibitionWith({})).toBe(Inhibit.NONE);
  });

  it('windshear warning: TA ONLY', () => {
    expect(inhibitionWith({ windshear: true })).toBe(Inhibit.ALL_RA);
  });

  it('stall warning: TA ONLY', () => {
    expect(inhibitionWith({ stallFws1: true })).toBe(Inhibit.ALL_RA);
  });

  it('emergency electrical configuration (AC 1 to AC 4 lost): TA ONLY', () => {
    expect(inhibitionWith({ acBusesLost: true })).toBe(Inhibit.ALL_RA);
  });
});
