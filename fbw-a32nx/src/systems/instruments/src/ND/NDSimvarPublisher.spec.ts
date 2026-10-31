// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320WxrPanelEvents } from '@flybywiresim/navigation-display';
import { EventBus } from '@microsoft/msfs-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockSimVars } from '../../../../../../fbw-common/src/jest/MockedSimVars';
import { NDSimvarPublisher } from './NDSimvarPublisher';

describe('A32NX NDSimvarPublisher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes the radar panel variables the ND weather radar label reads', () => {
    mockSimVars(
      new Map<string, number>([
        ['L:A32NX_WXR_GAIN_KNOB', 0.5],
        ['L:A32NX_RADAR_MULTISCAN_AUTO', 0],
        ['L:A32NX_WXR_TILT_KNOB', -2],
        ['L:A32NX_SWITCH_RADAR_PWS_Position', 1],
      ]),
    );
    // the SDK publisher reads registered simvars through the lower case simvar object of the sim
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.stubGlobal('simvar', { getValueReg: (id: number) => (SimVar as any).GetSimVarValueFastReg(id) });
    const bus = new EventBus();
    // the publisher reads the variables somebody subscribed to, so it is created before the subscriptions
    const publisher = new NDSimvarPublisher(bus);
    const published: Record<string, unknown> = {};
    const subscriber = bus.getSubscriber<A320WxrPanelEvents>();
    for (const topic of ['wxrA320GainKnob', 'wxrA320MultiscanAuto', 'wxrA320TiltKnob', 'wxrA320PwsAuto'] as const) {
      subscriber.on(topic).handle((value) => (published[topic] = value));
    }
    publisher.startPublish();
    publisher.onUpdate();
    expect(published).toEqual({
      wxrA320GainKnob: 0.5,
      wxrA320MultiscanAuto: false,
      wxrA320TiltKnob: -2,
      wxrA320PwsAuto: true,
    });
  });
});
