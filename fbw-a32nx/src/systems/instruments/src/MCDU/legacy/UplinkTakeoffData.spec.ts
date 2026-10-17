// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import {
  CompanyTakeoffDataEvents,
  CompanyTakeoffDataLinkMessage,
  CompanyTakeoffDataUplink,
} from '@flybywiresim/fbw-sdk';
import { UplinkTakeoffData } from './UplinkTakeoffData';

const TOGA_UPLINK: CompanyTakeoffDataUplink = {
  departure: 'EGLL',
  runway: '27R',
  tow: 70_000,
  cg: 28,
  qnh: 1013,
  windDirection: 270,
  windSpeed: 5,
  runwayCondition: 0,
  oat: 15,
  v1: 140,
  vr: 145,
  v2: 150,
  thrust: 'TOGA',
  flexTemperature: null,
  derate: null,
  flaps: 2,
  ths: 1,
  shift: null,
  toLimit: 3000,
  thrustReductionAltitude: null,
  accelerationAltitude: null,
  engineOutAccelerationAltitude: null,
  noise: null,
  mtowPerf: 77_000,
};

describe('A320 uplink takeoff data', () => {
  const receive = (overrides: Partial<CompanyTakeoffDataUplink>) => {
    const bus = new EventBus();
    const messages: CompanyTakeoffDataLinkMessage[] = [];
    const link = new UplinkTakeoffData(
      bus,
      () => ({ departure: null, tow: null, cg: null, oat: null, runways: [] }),
      (m) => messages.push(m),
    );
    bus.getPublisher<CompanyTakeoffDataEvents>().pub('cpny_to_uplink', { ...TOGA_UPLINK, ...overrides });
    return { messages, link };
  };

  it('rejects a DERATED uplink: the A320 has no derated takeoff', () => {
    const { messages, link } = receive({ thrust: 'DERATED', derate: 8 });
    expect(messages).toEqual([CompanyTakeoffDataLinkMessage.Invalid]);
    expect(link.uplinks.get()).toEqual([]);
  });

  it('still accepts TOGA and FLEX uplinks', () => {
    expect(receive({}).messages).toEqual([CompanyTakeoffDataLinkMessage.Received]);
    const flex = receive({ thrust: 'FLEX', flexTemperature: 45 });
    expect(flex.messages).toEqual([CompanyTakeoffDataLinkMessage.Received]);
    expect(flex.link.find('27R', true)?.flexTemperature).toBe(45);
  });
});
