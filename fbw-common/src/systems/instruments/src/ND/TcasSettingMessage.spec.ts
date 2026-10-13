// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { ND_ZOOM_RANGE, TcasAdvisoryState, tcasSettingMessage } from './TcasSettingMessage';

/*
 * A320 FCOM DSC-34-SURV-60-20 TCAS MESSAGES (a320_fcom.txt 56266-56273) and A380 FCOM DSC-31-20-30-100
 * (a380_fcom.txt 68708-68761): TCAS: CHANGE MODE / REDUCE RANGE / INCREASE RANGE, red for an RA, amber for a TA.
 * Before, the ND had none of them.
 */
describe('TCAS ND setting message', () => {
  it('none without a TA or RA', () => {
    expect(tcasSettingMessage(TcasAdvisoryState.None, true, false, 160, false)).toBeUndefined();
  });

  it('TCAS: CHANGE MODE in PLAN mode, amber for a TA', () => {
    expect(tcasSettingMessage(TcasAdvisoryState.Ta, true, false, 20, false)).toEqual({
      text: 'TCAS: CHANGE MODE',
      isRa: false,
    });
  });

  it('TCAS: CHANGE MODE wins over the range in PLAN mode, red for an RA', () => {
    expect(tcasSettingMessage(TcasAdvisoryState.Ra, true, false, 160, false)).toEqual({
      text: 'TCAS: CHANGE MODE',
      isRa: true,
    });
  });

  it('TCAS: REDUCE RANGE above 40 NM', () => {
    expect(tcasSettingMessage(TcasAdvisoryState.Ra, false, false, 80, false)?.text).toBe('TCAS: REDUCE RANGE');
    expect(tcasSettingMessage(TcasAdvisoryState.Ta, false, true, 80, false)?.text).toBe('TCAS: REDUCE RANGE');
  });

  it('none at 40 NM and below', () => {
    expect(tcasSettingMessage(TcasAdvisoryState.Ra, false, false, 40, false)).toBeUndefined();
    expect(tcasSettingMessage(TcasAdvisoryState.Ta, false, false, 10, false)).toBeUndefined();
  });

  it('A380X: TCAS: INCREASE RANGE in ROSE-VOR/LS with ZOOM, in flight only', () => {
    expect(tcasSettingMessage(TcasAdvisoryState.Ta, false, true, ND_ZOOM_RANGE, false)?.text).toBe(
      'TCAS: INCREASE RANGE',
    );
    expect(tcasSettingMessage(TcasAdvisoryState.Ta, false, true, ND_ZOOM_RANGE, true)).toBeUndefined();
    expect(tcasSettingMessage(TcasAdvisoryState.Ta, false, false, ND_ZOOM_RANGE, false)).toBeUndefined();
  });

  it('A380X: no TCAS: CHANGE MODE with ZOOM on ground', () => {
    expect(tcasSettingMessage(TcasAdvisoryState.Ra, true, false, ND_ZOOM_RANGE, true)).toBeUndefined();
    expect(tcasSettingMessage(TcasAdvisoryState.Ra, true, false, ND_ZOOM_RANGE, false)?.text).toBe('TCAS: CHANGE MODE');
  });

  it('the ND TCAS message layer shows it', () => {
    const layer = readFileSync(resolve(__dirname, 'TcasWxrMessages.tsx'), 'utf-8');
    expect(layer).toContain('tcasSettingMessage(');
  });
});
