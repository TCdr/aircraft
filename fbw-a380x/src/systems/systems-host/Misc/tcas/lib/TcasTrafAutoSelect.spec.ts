// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { trafPbLightVar, trafPbPushEvent, trafPbsToAutoSelect } from './TcasTrafAutoSelect';

/*
 * A380 FCOM DSC-34-20-40-20 ND (a380_fcom.txt 90812-90815): the ND displays the intruders when the TCAS triggers an
 * alert, the TRAF pb is selected automatically. Before, the TCAS read a TRAF L:var nothing writes and never pushed it.
 */
describe('TCAS TRAF pb auto-selection', () => {
  it('selects the TRAF pbs that are off when a TA starts', () => {
    expect(trafPbsToAutoSelect(0, 1, false, true)).toEqual(['L']);
    expect(trafPbsToAutoSelect(0, 2, false, false)).toEqual(['L', 'R']);
  });

  it('does nothing when both are on', () => {
    expect(trafPbsToAutoSelect(0, 1, true, true)).toEqual([]);
  });

  it('only at the start of the alert, so that the crew can deselect it', () => {
    expect(trafPbsToAutoSelect(1, 1, false, false)).toEqual([]);
    expect(trafPbsToAutoSelect(1, 2, false, false)).toEqual([]);
    expect(trafPbsToAutoSelect(2, 0, false, false)).toEqual([]);
  });

  it('uses the FCU TRAF light and push event', () => {
    expect(trafPbLightVar('R')).toBe('L:A32NX_FCU_EFIS_R_TRAF_LIGHT_ON');
    expect(trafPbPushEvent('L')).toBe('K:A32NX.FCU_EFIS_L_TRAF_PUSH');
  });

  it('the TCAS computer reads the FCU TRAF light, not the never-written L:var, and auto-selects', () => {
    const computer = readFileSync(resolve(__dirname, '../components/LegacyTcasComputer.ts'), 'utf-8');
    expect(computer).not.toContain('A380X_EFIS_L_TRAF_BUTTON_IS_ON');
    expect(computer).toContain("trafPbLightVar('L')");
    expect(computer).toContain('trafPbsToAutoSelect(');
  });
});
