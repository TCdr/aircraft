// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { CompanyTakeoffDataEvents } from '@flybywiresim/fbw-sdk';
import { TakeoffResults } from './TakeoffPerformance';
import {
  AvionicsCrosscheckData,
  FmsTakeoffEntries,
  crosscheckTakeoff,
  fmsTakeoffEntries,
  takeoffCrosscheckAvailable,
  thrustCrosscheck,
} from './TakeoffCrosscheck';
import { readFmsTakeoffSelections } from './FmsTakeoffDataReader';

const RESULTS: TakeoffResults = {
  runway: '06',
  tow: 500_000,
  mtowPerf: 520_000,
  v1: 149,
  vr: 162,
  v2: 170,
  flaps: 2,
  thrust: { kind: 'FLEX', temperature: 45 },
  stopMargin: 700,
  takeoffShift: 0,
  engineOutAcceleration: 2320,
  reverseThrustCredit: false,
  qnh: 1013,
};

const FMS: FmsTakeoffEntries = { v1: 149, vr: 162, v2: 170, flaps: 2, thrust: 'FLEX', flexTemperature: 45 };

const AVIONICS: AvionicsCrosscheckData = { grossWeight: 500_000, captainBaroIsQnh: true, captainQnh: 1013 };

describe('XCHECK WITH AVNCS', () => {
  it('finds no discrepancy when the FMS matches the results', () => {
    expect(crosscheckTakeoff(RESULTS, FMS, AVIONICS)).toEqual({
      discrepancies: [],
      title: 'AVNCS/OIS: no Discrepancy',
      thrustMessage: null,
    });
  });

  it('flags the speeds and the flaps that differ', () => {
    const check = crosscheckTakeoff(RESULTS, { ...FMS, v1: 150, v2: null, flaps: 3 }, AVIONICS);
    expect(check.discrepancies).toEqual(['V1', 'V2', 'FLAPS']);
    expect(check.title).toBe('AVNCS/OIS: Discrepancies');
  });

  it('checks the SD gross weight within 0.99 TOW and 1.0035 TOW', () => {
    const check = (gw: number | null) =>
      crosscheckTakeoff(RESULTS, FMS, { ...AVIONICS, grossWeight: gw }).discrepancies.includes('TOW');
    expect(check(495_000)).toBe(false);
    expect(check(494_999)).toBe(true);
    expect(check(501_750)).toBe(false);
    expect(check(501_751)).toBe(true);
    expect(check(null)).toBe(true);
  });

  it('checks the QNH within 0.99 hPa, only when the captain is on QNH', () => {
    const check = (qnh: number, isQnh: boolean) =>
      crosscheckTakeoff(RESULTS, FMS, { ...AVIONICS, captainQnh: qnh, captainBaroIsQnh: isQnh }).discrepancies.includes(
        'QNH',
      );
    expect(check(1013.99, true)).toBe(false);
    expect(check(1014, true)).toBe(true);
    expect(check(1020, false)).toBe(false);
  });

  describe('thrust', () => {
    it('compares the FMS FLEX with TFLEX - 5 to TFLEX', () => {
      expect(thrustCrosscheck(RESULTS, { ...FMS, flexTemperature: 40 }).discrepancy).toBe(false);
      expect(thrustCrosscheck(RESULTS, { ...FMS, flexTemperature: 39 })).toEqual({
        discrepancy: true,
        message: 'AVNCS/OIS discrepancy: crosscheck THRUST',
      });
      expect(thrustCrosscheck(RESULTS, { ...FMS, flexTemperature: 46 }).discrepancy).toBe(true);
    });

    it('is a discrepancy when only one side is FLEX', () => {
      expect(thrustCrosscheck(RESULTS, { ...FMS, thrust: 'TOGA' }).discrepancy).toBe(true);
      expect(thrustCrosscheck(RESULTS, { ...FMS, thrust: 'DERATED' }).discrepancy).toBe(true);
      expect(thrustCrosscheck({ ...RESULTS, thrust: { kind: 'TOGA' } }, FMS).discrepancy).toBe(true);
    });

    it('cannot crosscheck TOGA and derates: caution only', () => {
      const caution = { discrepancy: false, message: 'Caution: No XCHECK with AVNCS for: THRUST' };
      expect(thrustCrosscheck({ ...RESULTS, thrust: { kind: 'TOGA' } }, { ...FMS, thrust: 'TOGA' })).toEqual(caution);
      expect(thrustCrosscheck({ ...RESULTS, thrust: { kind: 'TOGA' } }, { ...FMS, thrust: 'DERATED' })).toEqual(
        caution,
      );
      expect(
        thrustCrosscheck({ ...RESULTS, thrust: { kind: 'DERATE', level: 8 } }, { ...FMS, thrust: 'TOGA' }),
      ).toEqual(caution);
      const check = crosscheckTakeoff({ ...RESULTS, thrust: { kind: 'TOGA' } }, { ...FMS, thrust: 'TOGA' }, AVIONICS);
      expect(check.title).toBe('AVNCS/OIS: no Discrepancy');
      expect(check.thrustMessage).toBe('Caution: No XCHECK with AVNCS for: THRUST');
    });
  });

  it('is available only when the TOW does not exceed MTOW(perf)', () => {
    expect(takeoffCrosscheckAvailable(RESULTS)).toBe(true);
    expect(takeoffCrosscheckAvailable({ ...RESULTS, mtowPerf: 499_000 })).toBe(false);
    expect(takeoffCrosscheckAvailable(null)).toBe(false);
  });

  it('reads the FMS speeds and FLEX as the FMS publishes them', () => {
    expect(fmsTakeoffEntries(149, 162, 170, 45, 2, 'FLEX')).toEqual(FMS);
    expect(fmsTakeoffEntries(-1, -1, 0, 0, null, null)).toEqual({
      v1: null,
      vr: null,
      v2: null,
      flaps: null,
      thrust: null,
      flexTemperature: null,
    });
    // 0.1 is a FLEX of 0 °C
    expect(fmsTakeoffEntries(149, 162, 170, 0.1, 2, 'FLEX').flexTemperature).toBe(0);
    expect(fmsTakeoffEntries(149, 162, 170, 45, 2, 'TOGA').flexTemperature).toBeNull();
  });

  it('asks the FMS for its T.O flaps and thrust without writing anything', async () => {
    const bus = new EventBus();
    const published: string[] = [];
    bus
      .getSubscriber<CompanyTakeoffDataEvents>()
      .on('cpny_to_uplink')
      .handle(() => published.push('uplink'));
    bus
      .getSubscriber<CompanyTakeoffDataEvents>()
      .on('cpny_to_fms_data_request')
      .handle((requestId) =>
        bus.getPublisher<CompanyTakeoffDataEvents>().pub('cpny_to_fms_data', {
          answersRequestId: requestId,
          departure: 'LFBO',
          tow: 500_000,
          cg: null,
          oat: 15,
          runways: [
            {
              runway: '14R',
              windDirection: null,
              windSpeed: null,
              qnh: 1013,
              runwayCondition: 0,
              thrust: 'FLEX',
              flaps: 2,
              shift: null,
              toLimit: null,
            },
          ],
        }),
      );
    expect(await readFmsTakeoffSelections(bus)).toEqual({ flaps: 2, thrust: 'FLEX' });
    expect(published).toEqual([]);
  });
});
