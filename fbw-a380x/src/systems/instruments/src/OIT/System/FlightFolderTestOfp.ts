// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { ISimbriefData } from '@flybywiresim/fbw-sdk';

/**
 * An OFP for the specs of the flight folder: RJAA to LFBO with an alternate, weights in kg
 * @param overrides fields to replace
 * @returns the OFP
 */
export function testOfp(overrides: Record<string, unknown> = {}): ISimbriefData {
  return {
    airline: 'AIB',
    flightNumber: '406',
    callsign: 'AIB406',
    aircraftReg: 'F-HPJA',
    aircraftIcao: 'A388',
    cruiseAltitude: 35000,
    costIndex: '30',
    route: 'DCT ABC UL1 XYZ DCT',
    distance: '485nm',
    averageTropopause: '36000',
    origin: { icao: 'RJAA', iata: 'NRT' },
    destination: { icao: 'LFBO', iata: 'TLS' },
    alternate: {
      icao: 'LFPG',
      iata: 'CDG',
      burn: 5400,
      cruiseAltitude: 25000,
      airDistance: 101,
      groundDistance: 99,
      ete: 1320,
    },
    alternates: ['LFPG', 'LFMN'],
    units: 'kgs',
    weights: {
      payload: 52000,
      oew: 300000,
      estZeroFuelWeight: 352000,
      estTakeOffWeight: 377300,
      estLandingWeight: 363200,
      maxZeroFuelWeight: 366000,
      maxTakeOffWeight: 569000,
      maxLandingWeight: 391000,
      passengerCount: '300',
    },
    fuel: {
      enrouteBurn: 14100,
      contingency: 700,
      etops: 0,
      reserve: 5200,
      extra: 0,
      planTakeOff: 25300,
      taxi: 800,
    },
    times: {
      schedOut: '1222156800',
      estOff: 1222158000,
      estTimeEnroute: 4380,
      contFuelTime: 240,
      reserveTime: 1800,
      extraFuelTime: 0,
      etopsFuelTime: 0,
    },
    weather: { metars: { RJAA: 'RJAA 242100Z 18005KT 9999 FEW020 18/17 Q1015' }, tafs: {} },
    notams: {
      departure: [{ text: 'A0001/08 RWY 16R CLSD', location: 'RJAA' }],
      destination: [],
      alternate: [],
      enroute: [],
    },
    generatedTime: 1222150000,
    planNumber: '9387',
    airDistance: 490,
    groundDistance: 485,
    avgTempDev: 4,
    avgWindComp: -4,
    cruiseMach: 0.85,
    navlog: [
      {
        ident: 'RJAA',
        via_airway: 'DCT',
        is_sid_star: '0',
        mora: '30',
        time_leg: '0',
        time_total: '0',
        fuel_plan_onboard: '25300',
        fuel_totalused: '0',
      },
      {
        ident: 'ABC',
        via_airway: 'SID1A',
        is_sid_star: '1',
        mora: '3300',
        time_leg: '600',
        time_total: '600',
        fuel_plan_onboard: '24000',
        fuel_totalused: '1300',
      },
      {
        ident: 'XYZ',
        via_airway: 'UL1',
        is_sid_star: '0',
        mora: '41',
        time_leg: '1800',
        time_total: '2400',
        fuel_plan_onboard: '19000',
        fuel_totalused: '6300',
      },
    ],
    text: '<pre>OFP  AIB406\nROUTE &lt;DCT&gt;<br/>END</pre>',
    ...overrides,
  } as unknown as ISimbriefData;
}
