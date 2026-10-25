// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { CompanyTakeoffDataEvents, CompanyTakeoffDataUplink } from '@flybywiresim/fbw-sdk';
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
    const link = new UplinkTakeoffData(
      bus,
      () => ({ departure: null, tow: null, cg: null, oat: null, runways: [] }),
      () => {},
    );
    bus.getPublisher<CompanyTakeoffDataEvents>().pub('cpny_to_uplink', { ...TOGA_UPLINK, ...overrides });
    return link;
  };

  it('opens on the FLX TO DATA page when only FLEX data was received for the runway', () => {
    expect(receive({ thrust: 'FLEX', flexTemperature: 45 }).opensOnFlexPage('27R')).toBe(true);
  });

  it('opens on the MAX TO DATA page when MAX data was received for the runway', () => {
    expect(receive({}).opensOnFlexPage('27R')).toBe(false);
  });
});
