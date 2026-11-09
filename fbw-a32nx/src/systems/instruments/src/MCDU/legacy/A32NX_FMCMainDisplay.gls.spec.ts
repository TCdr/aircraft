// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGbasTableAirportLoader } from '@fmgc/navigation/gls/ManualGlsTuning';
import { FMCMainDisplay } from './A32NX_FMCMainDisplay';

/* The GLS parts of the FMS: the course it publishes to the flight guidance and the manual entry of a GLS. The class is
   abstract and heavy, so its methods run on a stand-in with just the members they read. */

type Method = (this: unknown, ...args: unknown[]) => unknown;
const method = (name: string): Method => (FMCMainDisplay.prototype as unknown as Record<string, Method>)[name];

const EDDF_25C = {
  ident: 'RW25C',
  bearing: 249,
  magneticBearing: 249,
  length: 4000,
  thresholdLocation: { lat: 50.0345, long: 8.5812, alt: 365 },
};

describe('the course the FMS publishes to the flight guidance', () => {
  let published: { name: string; value: unknown }[];
  const previousSet = SimVar.SetSimVarValue;
  const previousGet = SimVar.GetSimVarValue;

  beforeEach(() => {
    published = [];
    SimVar.SetSimVarValue = vi.fn((name: string, _unit: string, value: unknown) => {
      published.push({ name, value });
      return Promise.resolve();
    });
    SimVar.GetSimVarValue = vi.fn(() => 0);
  });

  afterEach(() => {
    SimVar.SetSimVarValue = previousSet;
    SimVar.GetSimVarValue = previousGet;
  });

  function display(mmr: object, flsBeamCourse: number | null = null) {
    return {
      navigation: { getNavaidTuner: () => ({ getMmrRadioTuningStatus: () => mmr }) },
      flsBeamPublisher: { lsCourse: vi.fn((ilsCourse: number) => flsBeamCourse ?? ilsCourse) },
    };
  }

  it('is the course of the selected GLS, even where an FLS beam has a course', async () => {
    const screen = display({ gls: { course: 249 }, course: 249, frequency: null }, 100);

    await method('updateIlsCourse').call(screen);

    expect(published).toEqual([{ name: 'L:A32NX_FM_LS_COURSE', value: 249 }]);
    expect(screen.flsBeamPublisher.lsCourse).not.toHaveBeenCalled();
  });

  it('is -1 for a GLS channel without a course, never the course of an FLS beam', async () => {
    const screen = display({ gls: { course: null }, course: null, frequency: null }, 100);

    await method('updateIlsCourse').call(screen);

    expect(published).toEqual([{ name: 'L:A32NX_FM_LS_COURSE', value: -1 }]);
  });

  it('keeps the course of an ILS, passed through the FLS beam', async () => {
    const screen = display({ gls: undefined, course: 183, frequency: 110.3 });

    await method('updateIlsCourse').call(screen);

    expect(screen.flsBeamPublisher.lsCourse).toHaveBeenCalledWith(183);
    expect(published).toEqual([{ name: 'L:A32NX_FM_LS_COURSE', value: 183 }]);
  });

  it('lets an FLS beam course replace the ILS one when no GLS is selected', async () => {
    const screen = display({ gls: undefined, course: null, frequency: null }, 100);

    await method('updateIlsCourse').call(screen);

    expect(published).toEqual([{ name: 'L:A32NX_FM_LS_COURSE', value: 100 }]);
  });
});

describe('the manual GLS entry of the FMS', () => {
  function display(options: { locked?: () => boolean } = {}) {
    const setManualGls = vi.fn();
    const getAirports = vi.fn(() => Promise.resolve([{ ident: 'EDDF', location: { lat: 50.033, long: 8.57 } }]));
    const getRunways = vi.fn(() => Promise.resolve([EDDF_25C]));
    const navigationDatabase = { backendDatabase: { getAirports, getRunways } };
    const screen = {
      flightPlanService: { active: { destinationAirport: { ident: 'EDDF' }, originAirport: { ident: 'EDDM' } } },
      navigationDatabase,
      navigation: {
        getPpos: vi.fn(() => ({ lat: 50.5, long: 8.5 })),
        getNavaidTuner: () => ({ setManualGls }),
      },
      isMmrTuningLocked: options.locked ?? (() => false),
      glsTableAirportLoader: createGbasTableAirportLoader(() => navigationDatabase.backendDatabase),
    };
    return { screen, setManualGls, getAirports, getRunways };
  }

  it('tunes the GLS of a channel at the destination of the flight plan and keeps the field', async () => {
    const { screen, setManualGls, getRunways } = display();

    await expect(method('tuneManualGls').call(screen, '31434', 'channel')).resolves.toBe('tuned');

    expect(getRunways).toHaveBeenCalledWith('EDDF');
    expect(setManualGls).toHaveBeenCalledWith(expect.objectContaining({ channel: 31434, rpi: 'G25P' }), 'channel');
  });

  it('resolves a reference path identifier against the destination and origin of the flight plan', async () => {
    const { screen, setManualGls } = display();

    await expect(method('tuneManualGls').call(screen, 'G25P', 'ident')).resolves.toBe('tuned');

    expect(setManualGls).toHaveBeenCalledWith(expect.objectContaining({ channel: 31434 }), 'ident');
  });

  it('loads the airports of the GBAS table once', async () => {
    const { screen, getAirports } = display();

    await method('tuneManualGls').call(screen, '31434', 'channel');
    await method('tuneManualGls').call(screen, '31434', 'channel');

    expect(getAirports).toHaveBeenCalledTimes(1);
    expect(getAirports).toHaveBeenCalledWith(expect.arrayContaining(['EDDF']));
  });

  it('sets nothing when the tuning locks while the airports load', async () => {
    let locked = false;
    const { screen, setManualGls, getAirports } = display({ locked: () => locked });
    getAirports.mockImplementation(() => {
      locked = true;
      return Promise.resolve([{ ident: 'EDDF', location: { lat: 50.033, long: 8.57 } }]);
    });

    await expect(method('tuneManualGls').call(screen, '31434', 'channel')).resolves.toBe('locked');

    expect(setManualGls).not.toHaveBeenCalled();
  });

  it('hands an identifier that no GLS of the flight plan airports has back to be looked up as an ILS', async () => {
    const { screen, setManualGls } = display();

    await expect(method('tuneManualGls').call(screen, 'X99Z', 'ident')).resolves.toBe('unknown-rpi');

    expect(setManualGls).not.toHaveBeenCalled();
  });
});
