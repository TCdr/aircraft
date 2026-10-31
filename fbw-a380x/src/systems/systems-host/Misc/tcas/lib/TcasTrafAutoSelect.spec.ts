// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { LegacyTcasComputer } from '../components/LegacyTcasComputer';
import { LegacySoundManager } from '../../LegacySoundManager';
import { TaRaIntrusion, TcasMode, TcasState } from './TcasConstants';
import { trafPbLightVar, trafPbPushEvent, trafPbsToAutoSelect } from './TcasTrafAutoSelect';

/* When the TCAS triggers an alert, the TRAF pb is selected automatically so that the ND shows the intruders. */
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
});

describe('TCAS computer TRAF pb auto-selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The key events sent when a TA starts, with the TRAF pb lights of the FCU as given (the legacy L:A380X_EFIS_L_TRAF_BUTTON_IS_ON is set, so only the FCU light decides) */
  const pushedTrafPbsWhenTaStarts = (lightLeft: boolean, lightRight: boolean): string[] => {
    const vars: Record<string, number> = {
      'L:A32NX_FCU_EFIS_L_TRAF_LIGHT_ON': lightLeft ? 1 : 0,
      'L:A32NX_FCU_EFIS_R_TRAF_LIGHT_ON': lightRight ? 1 : 0,
      'L:A380X_EFIS_L_TRAF_BUTTON_IS_ON': 1,
    };
    vi.spyOn(SimVar, 'GetGlobalVarValue').mockImplementation(() => 1);
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => vars[name] ?? 0);
    const keyEvents: string[] = [];
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string) => {
      keyEvents.push(name);
      return Promise.resolve();
    });
    const tcas = new LegacyTcasComputer(new EventBus(), {
      tryPlaySound: () => {},
    } as unknown as LegacySoundManager) as any;
    tcas.tcasState = { getVar: () => TcasState.NONE, setVar: () => {} };
    tcas.tcasMode = { getVar: () => TcasMode.TARA, setVar: () => {} };
    tcas.ppos = { lat: NaN, long: NaN };
    tcas.updateVars();
    tcas.airTraffic = [{ alive: true, isDisplayed: true, intrusionLevel: TaRaIntrusion.TA }];
    tcas.raTraffic = [];
    tcas._newRa = { info: null };
    tcas.advisoryState = TcasState.NONE;
    keyEvents.length = 0;
    tcas.updateAdvisoryState(50);
    return keyEvents;
  };

  it('pushes the TRAF pb of the side whose FCU TRAF light is off when a TA starts', () => {
    expect(pushedTrafPbsWhenTaStarts(false, true)).toEqual(['K:A32NX.FCU_EFIS_L_TRAF_PUSH']);
    expect(pushedTrafPbsWhenTaStarts(true, false)).toEqual(['K:A32NX.FCU_EFIS_R_TRAF_PUSH']);
    expect(pushedTrafPbsWhenTaStarts(false, false)).toEqual([
      'K:A32NX.FCU_EFIS_L_TRAF_PUSH',
      'K:A32NX.FCU_EFIS_R_TRAF_PUSH',
    ]);
  });

  it('pushes nothing when both FCU TRAF lights are on', () => {
    expect(pushedTrafPbsWhenTaStarts(true, true)).toEqual([]);
  });
});
