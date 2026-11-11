// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, GameStateProvider, Subject, Wait } from '@microsoft/msfs-sdk';
import { IlsNavaid } from '@flybywiresim/fbw-sdk';
import { Coordinates } from 'msfs-geo';
import { FmgcFlightPhase } from '@shared/flightphase';
import { GlsApproachData } from '@fmgc/navigation/gls/GlsApproachData';
import { NavaidTuner } from './NavaidTuner';

const ILS = {
  databaseId: 'ILS-IFCW',
  ident: 'IFCW',
  frequency: 111.55,
  locBearing: 249,
  gsSlope: -3,
} as unknown as IlsNavaid;

const OTHER_ILS = { ...ILS, databaseId: 'ILS-IFNW', ident: 'IFNW', frequency: 110.3 } as unknown as IlsNavaid;

const GLS: GlsApproachData = { channel: 31434, rpi: 'G25P', course: 246, slope: -3, definition: null };

const OTHER_GLS: GlsApproachData = { ...GLS, channel: 28968, rpi: 'G25M', slope: -3.2 };

const MMR_INDEXES: (1 | 2)[] = [1, 2];

const triggerKeyEvent = vi.fn((..._args: unknown[]) => Promise.resolve());

function setup(initialPhase: FmgcFlightPhase = FmgcFlightPhase.Descent) {
  const bus = new EventBus();
  const setPhase = (phase: FmgcFlightPhase) =>
    bus.getPublisher<{ fmgc_flight_phase: FmgcFlightPhase }>().pub('fmgc_flight_phase', phase, false, true);
  setPhase(initialPhase);

  const aircraft: { radioHeight: number | null; ppos: Coordinates | null } = {
    radioHeight: null,
    ppos: { lat: 50.5, long: 8.6 },
  };
  const selection = {
    selectedIls: null as IlsNavaid | null,
    selectedLocCourse: null as number | null,
    selectedApprBackcourse: false,
    selectedGsSlope: null as number | null,
    selectedGls: null as GlsApproachData | null,
  };
  const selectIls = (ils: IlsNavaid) => {
    selection.selectedIls = ils;
    selection.selectedLocCourse = ils.locBearing;
    selection.selectedGsSlope = ils.gsSlope ?? null;
    selection.selectedGls = null;
  };
  const selectGls = (gls: GlsApproachData) => {
    selection.selectedIls = null;
    selection.selectedLocCourse = null;
    selection.selectedGsSlope = null;
    selection.selectedGls = gls;
  };

  const tuner = new NavaidTuner(
    bus,
    { getRadioHeight: () => aircraft.radioHeight, getPpos: () => aircraft.ppos } as never,
    { displayVor: null, displayNdb: null } as never,
    selection as never,
  );

  /** The MMR tuning locks in the approach phase below 700 ft */
  const flyFinalApproach = () => {
    setPhase(FmgcFlightPhase.Approach);
    aircraft.radioHeight = 500;
  };

  return { tuner, aircraft, selection, selectIls, selectGls, setPhase, flyFinalApproach };
}

/** A tuner that has started, as it does once the flight is loaded */
async function setupStarted(initialPhase?: FmgcFlightPhase) {
  const context = setup(initialPhase);
  context.tuner.init();
  await new Promise((resolve) => setTimeout(resolve));
  return context;
}

/** The L:vars of the RMPs. The SDK replaces the SimVar reads of the test setup, so the tuner reads these instead. */
let rmpVariables: Record<string, number> = {};

beforeEach(() => {
  triggerKeyEvent.mockClear();
  rmpVariables = {};
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => rmpVariables[name] ?? 0);
  vi.stubGlobal('Coherent', { on: vi.fn(), trigger: vi.fn(), call: triggerKeyEvent });
  // The key event manager of the SDK compares the game state with this sim enum
  vi.stubGlobal('GameState', { ingame: 3 });
  vi.spyOn(GameStateProvider, 'get').mockReturnValue(Subject.create(undefined) as never);
  vi.spyOn(Wait, 'awaitSubscribable').mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NavaidTuner MMR tuning lock', () => {
  it('locks the MMR tuning in the approach phase below 700 ft only', () => {
    const { tuner, aircraft, setPhase } = setup(FmgcFlightPhase.Approach);

    aircraft.radioHeight = 699;
    expect(tuner.isMmrTuningLocked()).toBe(true);

    aircraft.radioHeight = 700;
    expect(tuner.isMmrTuningLocked()).toBe(false);

    aircraft.radioHeight = null;
    expect(tuner.isMmrTuningLocked()).toBe(false);

    aircraft.radioHeight = 500;
    setPhase(FmgcFlightPhase.Descent);
    expect(tuner.isMmrTuningLocked()).toBe(false);
    setPhase(FmgcFlightPhase.GoAround);
    expect(tuner.isMmrTuningLocked()).toBe(false);
  });
});

describe('NavaidTuner manual landing system entries', () => {
  it('sets both MMRs to an ILS entered by its ident', () => {
    const { tuner } = setup();
    tuner.setManualIls(ILS);

    MMR_INDEXES.forEach((index) => {
      expect(tuner.getMmrRadioTuningStatus(index)).toMatchObject({
        manual: true,
        facility: ILS,
        ident: 'IFCW',
        frequency: 111.55,
        course: 249,
        databaseCourse: 249,
        courseManual: false,
        backcourse: false,
        slope: -3,
      });
    });
  });

  it('has no course for an ILS without a localizer bearing', () => {
    const { tuner } = setup();
    tuner.setManualIls({ ...ILS, locBearing: -1, gsSlope: undefined } as unknown as IlsNavaid);

    expect(tuner.getMmrRadioTuningStatus(1)).toMatchObject({ course: null, databaseCourse: null, slope: null });
  });

  it('sets both MMRs to an ILS entered by its frequency, without ident or course', () => {
    const { tuner } = setup();
    tuner.setManualIls(ILS);
    tuner.setManualIls(110.3);

    MMR_INDEXES.forEach((index) => {
      const mmr = tuner.getMmrRadioTuningStatus(index);
      expect(mmr).toMatchObject({ manual: true, ident: null, frequency: 110.3, course: null, slope: null });
      expect(mmr.facility).toBeUndefined();
    });
  });

  it('clears the manual ILS of both MMRs', () => {
    const { tuner } = setup();
    tuner.setManualIls(ILS);
    tuner.setManualIls(null);

    MMR_INDEXES.forEach((index) => {
      const mmr = tuner.getMmrRadioTuningStatus(index);
      expect(mmr).toMatchObject({ manual: false, ident: null, frequency: null, course: null, slope: null });
      expect(mmr.facility).toBeUndefined();
    });
  });

  it('sets both MMRs to a GLS the crew entered and keeps the field it was typed into', () => {
    const { tuner } = setup();
    tuner.setManualIls(ILS);
    tuner.setManualGls(GLS, 'ident');

    MMR_INDEXES.forEach((index) => {
      const mmr = tuner.getMmrRadioTuningStatus(index);
      expect(mmr.gls).toBe(GLS);
      expect(mmr).toMatchObject({
        manual: true,
        glsEntry: 'ident',
        ident: 'G25P',
        frequency: null,
        course: 246,
        slope: -3,
      });
      expect(mmr.facility).toBeUndefined();
    });
  });

  it('takes both MMRs out of GLS mode when an ILS is entered', () => {
    const { tuner } = setup();
    tuner.setManualGls(GLS, 'channel');
    tuner.setManualIls(ILS);

    MMR_INDEXES.forEach((index) => {
      const mmr = tuner.getMmrRadioTuningStatus(index);
      expect(mmr.gls).toBeUndefined();
      expect(mmr.glsEntry).toBeUndefined();
      expect(mmr.frequency).toBe(111.55);
    });
  });

  it('keeps the GLS on final approach when an ILS is entered or the entry is cleared', () => {
    const { tuner, flyFinalApproach } = setup();
    tuner.setManualGls(GLS, 'channel');
    flyFinalApproach();

    tuner.setManualIls(ILS);
    tuner.setManualIls(null);

    MMR_INDEXES.forEach((index) => {
      expect(tuner.getMmrRadioTuningStatus(index)).toMatchObject({ gls: GLS, glsEntry: 'channel', manual: true });
    });
  });

  it('does not enter GLS mode, or change the GLS, on final approach', () => {
    const { tuner, flyFinalApproach, aircraft } = setup();
    tuner.setManualIls(ILS);
    flyFinalApproach();

    tuner.setManualGls(GLS, 'channel');
    expect(tuner.getMmrRadioTuningStatus(1).gls).toBeUndefined();
    expect(tuner.getMmrRadioTuningStatus(2).frequency).toBe(111.55);

    aircraft.radioHeight = 800;
    tuner.setManualGls(GLS, 'channel');
    aircraft.radioHeight = 500;
    tuner.setManualGls(OTHER_GLS, 'channel');
    expect(tuner.getMmrRadioTuningStatus(1).gls).toBe(GLS);
    expect(tuner.getMmrRadioTuningStatus(2).gls).toBe(GLS);
  });

  it('still takes another ILS entry on final approach', () => {
    const { tuner, flyFinalApproach } = setup();
    tuner.setManualIls(ILS);
    flyFinalApproach();

    tuner.setManualIls(OTHER_ILS);

    expect(tuner.getMmrRadioTuningStatus(1).ident).toBe('IFNW');
    expect(tuner.getMmrRadioTuningStatus(2).ident).toBe('IFNW');
  });

  it('takes a course entry for an ILS, and goes back to the database course when it is cleared', () => {
    const { tuner } = setup();
    tuner.setManualIls(ILS);

    tuner.setIlsCourse(370, true);
    MMR_INDEXES.forEach((index) => {
      expect(tuner.getMmrRadioTuningStatus(index)).toMatchObject({ course: 10, backcourse: true, courseManual: true });
    });

    tuner.setIlsCourse(null);
    MMR_INDEXES.forEach((index) => {
      expect(tuner.getMmrRadioTuningStatus(index)).toMatchObject({
        course: 249,
        backcourse: false,
        courseManual: false,
      });
    });
  });

  it('takes no course entry for a GLS', () => {
    const { tuner } = setup();
    tuner.setManualGls(GLS, 'channel');

    tuner.setIlsCourse(100, true);

    MMR_INDEXES.forEach((index) => {
      expect(tuner.getMmrRadioTuningStatus(index)).toMatchObject({
        course: 246,
        backcourse: false,
        courseManual: false,
      });
    });
  });

  it('clears a manual GLS when all tuning is reset', () => {
    const { tuner } = setup();
    tuner.setManualGls(GLS, 'channel');

    tuner.resetState();

    MMR_INDEXES.forEach((index) => {
      const mmr = tuner.getMmrRadioTuningStatus(index);
      expect(mmr.gls).toBeUndefined();
      expect(mmr).toMatchObject({ manual: false, frequency: null, course: null });
    });
  });
});

describe('NavaidTuner landing system of the FMS', () => {
  it('does nothing before the flight is loaded', () => {
    const { tuner, selectGls } = setup();
    selectGls(GLS);

    tuner.update(100);

    expect(tuner.getMmrRadioTuningStatus(1).gls).toBeUndefined();
    expect(tuner.isFmTuningActive()).toBe(false);
  });

  it('tunes both ILS receivers to the ILS the FMS selected', async () => {
    const { tuner, selectIls } = await setupStarted();
    selectIls(ILS);

    tuner.update(100);

    expect(tuner.isFmTuningActive()).toBe(true);
    MMR_INDEXES.forEach((index) => {
      expect(tuner.getMmrRadioTuningStatus(index)).toMatchObject({
        manual: false,
        ident: 'IFCW',
        frequency: 111.55,
        course: 249,
        slope: -3,
      });
      expect(triggerKeyEvent).toHaveBeenCalledWith(
        'TRIGGER_KEY_EVENT',
        `NAV${index + 2}_RADIO_SET_HZ`,
        true,
        111.55 * 1_000_000,
        0,
        0,
      );
      expect(triggerKeyEvent).toHaveBeenCalledWith('TRIGGER_KEY_EVENT', `VOR${index + 2}_SET`, true, 249, 0, 0);
    });
  });

  it('takes both MMRs to the GLS the FMS selected and detunes the ILS receivers', async () => {
    const { tuner, selectIls, selectGls } = await setupStarted();
    selectIls(ILS);
    tuner.update(100);
    triggerKeyEvent.mockClear();

    selectGls(GLS);
    tuner.update(100);

    MMR_INDEXES.forEach((index) => {
      const mmr = tuner.getMmrRadioTuningStatus(index);
      expect(mmr.gls).toBe(GLS);
      expect(mmr).toMatchObject({ manual: false, ident: 'G25P', frequency: null, course: 246, slope: -3 });
      expect(triggerKeyEvent).toHaveBeenCalledWith('TRIGGER_KEY_EVENT', `NAV${index + 2}_RADIO_SET_HZ`, true, 0, 0, 0);
      expect(triggerKeyEvent).toHaveBeenCalledWith('TRIGGER_KEY_EVENT', `VOR${index + 2}_SET`, true, 0, 0, 0);
    });
    expect(triggerKeyEvent).not.toHaveBeenCalledWith('TRIGGER_KEY_EVENT', 'VOR3_SET', true, 246, 0, 0);
  });

  it('goes back from the GLS to the ILS when the FMS selects the ILS', async () => {
    const { tuner, selectIls, selectGls } = await setupStarted();
    selectGls(GLS);
    tuner.update(100);

    selectIls(ILS);
    tuner.update(100);

    MMR_INDEXES.forEach((index) => {
      const mmr = tuner.getMmrRadioTuningStatus(index);
      expect(mmr.gls).toBeUndefined();
      expect(mmr.frequency).toBe(111.55);
    });
  });

  it('keeps the GLS on final approach when the FMS selects an ILS, until the lock is released', async () => {
    const { tuner, selectIls, selectGls, flyFinalApproach, aircraft } = await setupStarted();
    selectGls(GLS);
    tuner.update(100);
    flyFinalApproach();

    selectIls(ILS);
    tuner.update(100);
    expect(tuner.getMmrRadioTuningStatus(1).gls).toBe(GLS);
    expect(tuner.getMmrRadioTuningStatus(2).gls).toBe(GLS);

    aircraft.radioHeight = 800;
    tuner.update(100);
    expect(tuner.getMmrRadioTuningStatus(1).gls).toBeUndefined();
    expect(tuner.getMmrRadioTuningStatus(1).frequency).toBe(111.55);
  });

  it('keeps the ILS on final approach when the FMS selects a GLS', async () => {
    const { tuner, selectIls, selectGls, flyFinalApproach } = await setupStarted();
    selectIls(ILS);
    tuner.update(100);
    flyFinalApproach();

    selectGls(GLS);
    tuner.update(100);

    MMR_INDEXES.forEach((index) => {
      const mmr = tuner.getMmrRadioTuningStatus(index);
      expect(mmr.gls).toBeUndefined();
      expect(mmr.frequency).toBe(111.55);
    });
  });

  it('leaves a manual entry alone', async () => {
    const { tuner, selectIls } = await setupStarted();
    tuner.setManualGls(OTHER_GLS, 'channel');
    selectIls(ILS);

    tuner.update(100);

    expect(tuner.getMmrRadioTuningStatus(1).gls).toBe(OTHER_GLS);
    expect(tuner.getMmrRadioTuningStatus(2).gls).toBe(OTHER_GLS);
  });
});

describe('NavaidTuner runway and landing system mismatch', () => {
  it('has no mismatch while the MMRs follow the selection of the FMS', async () => {
    const { tuner, selectGls, selectIls } = await setupStarted();

    selectGls(GLS);
    tuner.update(100);
    expect(tuner.getRwyLsMismatchMessage()).toBe(false);

    selectIls(ILS);
    tuner.update(100);
    expect(tuner.getRwyLsMismatchMessage()).toBe(false);
  });

  it('tells the crew when the GLS they entered is not the one of the approach', async () => {
    const { tuner, selectGls } = await setupStarted();
    selectGls(GLS);

    tuner.setManualGls(OTHER_GLS, 'channel');
    tuner.update(100);
    expect(tuner.getRwyLsMismatchMessage()).toBe(true);

    tuner.setManualGls(GLS, 'channel');
    tuner.update(100);
    expect(tuner.getRwyLsMismatchMessage()).toBe(false);
  });

  it('tells the crew when they entered an ILS and the approach is a GLS', async () => {
    const { tuner, selectGls } = await setupStarted();
    selectGls(GLS);
    tuner.setManualIls(ILS);

    tuner.update(100);

    expect(tuner.getRwyLsMismatchMessage()).toBe(true);
  });

  it('tells the crew when they entered a GLS and the approach is an ILS', async () => {
    const { tuner, selectIls } = await setupStarted();
    selectIls(ILS);
    tuner.setManualGls(GLS, 'channel');

    tuner.update(100);

    expect(tuner.getRwyLsMismatchMessage()).toBe(true);
  });

  it('has no mismatch for a GLS entry while the FMS has no landing system selected', async () => {
    const { tuner } = await setupStarted();
    tuner.setManualGls(GLS, 'channel');

    tuner.update(100);

    expect(tuner.getRwyLsMismatchMessage()).toBe(false);
  });
});
