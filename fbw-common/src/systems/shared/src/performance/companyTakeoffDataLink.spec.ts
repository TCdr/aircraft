// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { CompanyTakeoffDataEvents, CompanyTakeoffDataUplink, formatTakeoffDerate } from './companyTakeoffData';
import { CompanyTakeoffDataLink, CompanyTakeoffDataLinkMessage } from './companyTakeoffDataLink';

class TestLink extends CompanyTakeoffDataLink {}

/** TOGA takeoff data of a valid uplink */
const TOGA_UPLINK: CompanyTakeoffDataUplink = {
  departure: 'EGLL',
  runway: '27R',
  tow: 450_000,
  cg: 36,
  qnh: 1013,
  windDirection: 270,
  windSpeed: 5,
  runwayCondition: 0,
  oat: 15,
  v1: 140,
  vr: 150,
  v2: 155,
  thrust: 'TOGA',
  flexTemperature: null,
  derate: null,
  flaps: 2,
  ths: null,
  shift: null,
  toLimit: 3000,
  thrustReductionAltitude: null,
  accelerationAltitude: null,
  engineOutAccelerationAltitude: null,
  noise: null,
  mtowPerf: 577_000,
};

const setup = () => {
  const bus = new EventBus();
  const messages: CompanyTakeoffDataLinkMessage[] = [];
  const link = new TestLink(
    bus,
    false,
    () => ({ departure: null, tow: null, cg: null, oat: null, runways: [] }),
    (m) => messages.push(m),
  );
  const send = (uplink: Partial<CompanyTakeoffDataUplink>) =>
    bus.getPublisher<CompanyTakeoffDataEvents>().pub('cpny_to_uplink', { ...TOGA_UPLINK, ...uplink });
  return { link, messages, send };
};

describe('company takeoff data link', () => {
  it('accepts a DERATED uplink with its level, next to the TOGA and FLEX data of the runway', () => {
    const { link, messages, send } = setup();
    send({});
    send({ thrust: 'FLEX', flexTemperature: 40 });
    send({ thrust: 'DERATED', derate: 12 });
    expect(messages).toEqual([
      CompanyTakeoffDataLinkMessage.Received,
      CompanyTakeoffDataLinkMessage.Received,
      CompanyTakeoffDataLinkMessage.Received,
    ]);
    expect(link.uplinks.get().map((u) => u.thrust)).toEqual(['TOGA', 'FLEX', 'DERATED']);
  });

  it.each([null, undefined, 0, 4.5, 100, Number.NaN])('rejects a DERATED uplink with the level %s', (derate) => {
    const { link, messages, send } = setup();
    send({ thrust: 'DERATED', derate: derate as number | null });
    expect(messages).toEqual([CompanyTakeoffDataLinkMessage.Invalid]);
    expect(link.uplinks.get()).toEqual([]);
  });

  it('finds the TOGA and FLEX data only, never the DERATED data, for the TOGA/FLEX lookup', () => {
    const { link, send } = setup();
    send({ thrust: 'DERATED', derate: 8 });
    expect(link.find('27R', false)).toBeUndefined();
    expect(link.find('27R', true)).toBeUndefined();
    send({});
    expect(link.find('27R', false)?.thrust).toBe('TOGA');
  });

  it('shows a derated level as D and two digits', () => {
    expect(formatTakeoffDerate(4)).toBe('D04');
    expect(formatTakeoffDerate(24)).toBe('D24');
  });
});
