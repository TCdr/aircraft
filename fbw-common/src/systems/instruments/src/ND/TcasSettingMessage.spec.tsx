// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EfisNdMode } from '@flybywiresim/fbw-sdk';
import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { GenericFcuEvents } from './types/GenericFcuEvents';
import { GenericTcasEvents } from './types/GenericTcasEvents';
import { TcasWxrMessages } from './TcasWxrMessages';
import {
  isTrafficShownAtRange,
  MAX_TRAFFIC_RANGE_NM,
  ND_ZOOM_RANGE,
  TcasAdvisoryState,
  tcasSettingMessage,
} from './TcasSettingMessage';

// The TCAS ND messages of both aircraft: TCAS: CHANGE MODE / REDUCE RANGE / INCREASE RANGE, red for an RA, amber for a
// TA
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

  describe('on the ND message layer', () => {
    // the ND range in NM of each range selector position, the last one is the ZOOM position of the A380X (range -1)
    const rangeValues = [10, 20, 40, 80, 160, 320, ND_ZOOM_RANGE];
    const ZOOM_SETTING = 6;

    function renderLayer(mode: EfisNdMode) {
      const bus = new EventBus();
      const modeSubject = Subject.create(mode);
      const container = document.createElement('div');
      FSComponent.render(<TcasWxrMessages bus={bus} mode={modeSubject} rangeValues={rangeValues} />, container);
      const publisher = bus.getPublisher<GenericTcasEvents & GenericFcuEvents>();
      const message = () => {
        // the setting message is the first text of the layer
        const text = container.querySelector('text');
        return {
          text: text?.textContent,
          colour: text?.getAttribute('class'),
          shown: text?.getAttribute('visibility'),
        };
      };
      return { modeSubject, publisher, message };
    }

    it('shows nothing without a TA or RA', () => {
      const { message } = renderLayer(EfisNdMode.ARC);
      expect(message().shown).toBe('hidden');
    });

    it('asks for a lower range above 40 NM, amber for a TA and red for an RA', () => {
      const { publisher, message } = renderLayer(EfisNdMode.ARC);
      publisher.pub('tcasAircraftOnGround', false, false, false);
      publisher.pub('ndRangeSetting', 3, false, false);
      publisher.pub('tcasState', 1, false, false);
      expect(message()).toMatchObject({ text: 'TCAS: REDUCE RANGE', shown: 'inherit' });
      expect(message().colour).toContain('Amber');

      publisher.pub('tcasState', 2, false, false);
      expect(message().colour).toContain('Red');

      publisher.pub('ndRangeSetting', 2, false, false);
      expect(message().shown).toBe('hidden');
    });

    it('asks for another mode in PLAN, and follows the mode of the ND', () => {
      const { modeSubject, publisher, message } = renderLayer(EfisNdMode.PLAN);
      publisher.pub('ndRangeSetting', 0, false, false);
      publisher.pub('tcasState', 1, false, false);
      expect(message().text).toBe('TCAS: CHANGE MODE');

      modeSubject.set(EfisNdMode.ARC);
      expect(message().shown).toBe('hidden');
    });

    it('A380X: asks for a larger range with ZOOM in ROSE-VOR in flight, and not on the ground', () => {
      const { publisher, message } = renderLayer(EfisNdMode.ROSE_VOR);
      publisher.pub('ndRangeSetting', ZOOM_SETTING, false, false);
      publisher.pub('tcasAircraftOnGround', false, false, false);
      publisher.pub('tcasState', 1, false, false);
      expect(message().text).toBe('TCAS: INCREASE RANGE');

      publisher.pub('tcasAircraftOnGround', true, false, false);
      expect(message().shown).toBe('hidden');
    });
  });
});

// The A320 ND displays the traffic in ROSE and ARC modes only at the 10, 20 and 40 NM ranges
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
