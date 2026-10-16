// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  isTrafficShownAtRange,
  MAX_TRAFFIC_RANGE_NM,
  ND_ZOOM_RANGE,
  TcasAdvisoryState,
  tcasSettingMessage,
} from './TcasSettingMessage';

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

/*
 * A320 FCOM DSC-34-SURV-60-20 ND INDICATIONS (a320_fcom.txt l.56198): "The traffic is displayed in all ROSE modes and
 * ARC mode when 10, 20 or 40 NM range is selected." Before, the A32NX ND drew the traffic at every range.
 */
describe('ND traffic display range', () => {
  it('A320: traffic at the 10, 20 and 40 NM ranges', () => {
    expect(isTrafficShownAtRange(10, MAX_TRAFFIC_RANGE_NM)).toBe(true);
    expect(isTrafficShownAtRange(20, MAX_TRAFFIC_RANGE_NM)).toBe(true);
    expect(isTrafficShownAtRange(40, MAX_TRAFFIC_RANGE_NM)).toBe(true);
  });

  it('A320: no traffic at 80 NM and above, where TCAS: REDUCE RANGE asks for a lower range', () => {
    expect(isTrafficShownAtRange(80, MAX_TRAFFIC_RANGE_NM)).toBe(false);
    expect(isTrafficShownAtRange(320, MAX_TRAFFIC_RANGE_NM)).toBe(false);
    expect(tcasSettingMessage(TcasAdvisoryState.Ta, false, false, 80, false)?.text).toBe('TCAS: REDUCE RANGE');
  });

  it('A380X: no limit, traffic at every range', () => {
    expect(isTrafficShownAtRange(160, undefined)).toBe(true);
    expect(isTrafficShownAtRange(ND_ZOOM_RANGE, undefined)).toBe(true);
  });

  it('the A32NX ND sets the 40 NM limit and the map applies it', () => {
    const canvasMap = readFileSync(resolve(__dirname, 'shared/map/CanvasMap.tsx'), 'utf-8');
    expect(canvasMap).toContain('isTrafficShownAtRange(rangeNm, this.props.options?.trafficMaxRangeNm)');
    const ndComponent = readFileSync(resolve(__dirname, 'ND.tsx'), 'utf-8');
    expect(ndComponent).toMatch(/<CanvasMap[^>]*rangeValues=\{this\.props\.rangeValues\}/);
    const a32nxNd = readFileSync(
      resolve(__dirname, '../../../../../../fbw-a32nx/src/systems/instruments/src/ND/instrument.tsx'),
      'utf-8',
    );
    expect(a32nxNd).toContain('mapOptions={{ trafficMaxRangeNm: MAX_TRAFFIC_RANGE_NM }}');
  });
});
