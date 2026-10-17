// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import {
  CompanyTakeoffDataEvents,
  CompanyTakeoffDataLinkMessage,
  CompanyTakeoffDataUplink,
} from '@flybywiresim/fbw-sdk';
import { TakeoffDerated, TakeoffPowerSetting } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import { CompanyTakeoffData, companyTakeoffThrustSettings } from './CompanyTakeoffData';

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

const uplink = (overrides: Partial<CompanyTakeoffDataUplink>) => ({ ...TOGA_UPLINK, ...overrides });

describe('A380 company takeoff data', () => {
  describe('INSERT thrust settings', () => {
    it('gives PERF T.O DERATED with the level of a DERATED uplink', () => {
      expect(companyTakeoffThrustSettings(uplink({ thrust: 'DERATED', derate: 8 }))).toEqual({
        powerSetting: TakeoffPowerSetting.DERATED,
        flexTemperature: null,
        derated: TakeoffDerated.D08,
      });
      expect(companyTakeoffThrustSettings(uplink({ thrust: 'DERATED', derate: 24 })).derated).toBe(TakeoffDerated.D24);
    });

    it('gives FLEX with its temperature, and TOGA, without a derated level', () => {
      expect(companyTakeoffThrustSettings(uplink({ thrust: 'FLEX', flexTemperature: 0 }))).toEqual({
        powerSetting: TakeoffPowerSetting.FLEX,
        flexTemperature: 0,
        derated: null,
      });
      expect(companyTakeoffThrustSettings(uplink({}))).toEqual({
        powerSetting: TakeoffPowerSetting.TOGA,
        flexTemperature: null,
        derated: null,
      });
    });
  });

  describe('validation', () => {
    const receive = (data: CompanyTakeoffDataUplink) => {
      const bus = new EventBus();
      const messages: CompanyTakeoffDataLinkMessage[] = [];
      const link = new CompanyTakeoffData(
        bus,
        false,
        () => ({ departure: null, tow: null, cg: null, oat: null, runways: [] }),
        (m) => messages.push(m),
      );
      bus.getPublisher<CompanyTakeoffDataEvents>().pub('cpny_to_uplink', data);
      return { messages, uplinks: link.uplinks.get() };
    };

    it('accepts the six levels of the engine, D04 to D24', () => {
      for (const derate of [4, 8, 12, 16, 20, 24]) {
        expect(receive(uplink({ thrust: 'DERATED', derate })).messages).toEqual([
          CompanyTakeoffDataLinkMessage.Received,
        ]);
      }
    });

    it('rejects a level the engine does not have', () => {
      for (const derate of [2, 5, 28]) {
        const { messages, uplinks } = receive(uplink({ thrust: 'DERATED', derate }));
        expect(messages).toEqual([CompanyTakeoffDataLinkMessage.Invalid]);
        expect(uplinks).toEqual([]);
      }
    });
  });
});
