// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FlsCapability,
  flsCapability,
  FlsCapabilityInputs,
  GlsCapability,
  glsCapability,
  GlsCapabilityInputs,
  GlsFlagInputs,
  GlsFlagMonitor,
  isLsDeviationValid,
  isLsTitleShown,
  lsDeviation,
  LsSource,
  lsSource,
  LsFlashTimer,
  lsTitleText,
  ownSideGlsTopics,
} from './FlsDisplay';

/* The FLS indications of the PFD: deviation source, approach capability, LS title */

function inputs(over: Partial<FlsCapabilityInputs> = {}): FlsCapabilityInputs {
  return {
    flsLateralActive: true,
    flsVerticalActive: true,
    approachModesArmedOrEngaged: true,
    flsLocValid: true,
    flsGsValid: true,
    gpsPrimary: true,
    navAccuracyHigh: true,
    fmGpsPositionDisagree: false,
    ...over,
  };
}

describe('LS scale deviation source', () => {
  it('keeps the ILS receiver without an FLS axis', () => {
    expect(lsDeviation(false, 0.3, -0.5)).toBe(0.3);
    expect(isLsDeviationValid(false, true, false)).toBe(true);
    expect(isLsDeviationValid(false, false, true)).toBe(false);
  });

  it('uses the FLS deviation when the axis flies the FLS beam', () => {
    expect(lsDeviation(true, 0.3, -0.5)).toBe(-0.5);
    expect(isLsDeviationValid(true, false, true)).toBe(true);
    expect(isLsDeviationValid(true, true, false)).toBe(false);
  });

  it('returns a real boolean for the Bool SimVars read as numbers', () => {
    expect(isLsDeviationValid(1 as unknown as boolean, 0 as unknown as boolean, 1 as unknown as boolean)).toBe(true);
  });
});

describe('LS scale deviation source with GLS', () => {
  it('picks GLS over FLS when both are active', () => {
    expect(lsSource(true, true)).toBe(LsSource.Gls);
    expect(lsSource(true, false)).toBe(LsSource.Fls);
    expect(lsSource(false, false)).toBe(LsSource.Ils);
  });

  it('uses the GLS deviation and validity for the GLS source', () => {
    expect(lsDeviation(LsSource.Gls, 0.3, -0.5, 0.7)).toBe(0.7);
    expect(isLsDeviationValid(LsSource.Gls, true, true, false)).toBe(false);
    expect(isLsDeviationValid(LsSource.Gls, false, false, true)).toBe(true);
  });

  it('keeps the ILS and FLS results with an explicit source', () => {
    expect(lsDeviation(LsSource.Ils, 0.3, -0.5, 0.7)).toBe(0.3);
    expect(lsDeviation(LsSource.Fls, 0.3, -0.5, 0.7)).toBe(-0.5);
    expect(isLsDeviationValid(LsSource.Ils, true, false, false)).toBe(true);
    expect(isLsDeviationValid(LsSource.Fls, false, true, false)).toBe(true);
  });

  it('reads a Bool SimVar number 1 as the FLS source and 0 as ILS', () => {
    expect(lsDeviation(1 as unknown as boolean, 0.3, -0.5)).toBe(-0.5);
    expect(lsDeviation(0 as unknown as boolean, 0.3, -0.5)).toBe(0.3);
  });
});

describe('the GLS data a PFD shows', () => {
  it('is the data of the MMR of its own side', () => {
    expect(ownSideGlsTopics(1)).toEqual({
      channel: 'mmr1GlsChannel',
      locValid: 'gls1LocValid',
      gsValid: 'gls1GsValid',
      failed: 'gls1Failed',
    });
    expect(ownSideGlsTopics(2)).toEqual({
      channel: 'mmr2GlsChannel',
      locValid: 'gls2LocValid',
      gsValid: 'gls2GsValid',
      failed: 'gls2Failed',
    });
  });
});

function glsInputs(over: Partial<GlsCapabilityInputs> = {}): GlsCapabilityInputs {
  return {
    glsSelected: true,
    catWordsCondition: true,
    landModesEngaged: false,
    flightGuidanceCat2OrBetter: true,
    gls1LocValid: true,
    gls2LocValid: true,
    gls1GsValid: true,
    gls2GsValid: true,
    ...over,
  };
}

describe('GLS approach capability', () => {
  it('is AUTO LAND when the guidance has CAT 2 or better and both receivers are valid', () => {
    expect(glsCapability(glsInputs())).toBe(GlsCapability.AutoLand);
  });

  it('falls back to CAT 1 without the guidance capability or with one receiver invalid', () => {
    expect(glsCapability(glsInputs({ flightGuidanceCat2OrBetter: false }))).toBe(GlsCapability.Cat1);
    expect(glsCapability(glsInputs({ gls1LocValid: false }))).toBe(GlsCapability.Cat1);
    expect(glsCapability(glsInputs({ gls2GsValid: false }))).toBe(GlsCapability.Cat1);
  });

  it('shows nothing without a GLS selected or while the ILS CAT words would show nothing', () => {
    expect(glsCapability(glsInputs({ glsSelected: false }))).toBe(GlsCapability.None);
    // LOC alone armed: LAND is not armed, so an ILS shows no CAT word and neither does the GLS
    expect(glsCapability(glsInputs({ catWordsCondition: false }))).toBe(GlsCapability.NotArmed);
  });

  it('stays capped through LAND, FLARE and ROLL OUT, when LOC and G/S modes are no longer engaged', () => {
    const landing = { catWordsCondition: false, landModesEngaged: true };
    expect(glsCapability(glsInputs(landing))).toBe(GlsCapability.AutoLand);
    expect(glsCapability(glsInputs({ ...landing, flightGuidanceCat2OrBetter: false }))).toBe(GlsCapability.Cat1);
  });

  it('ignores the G/S validity in LAND, FLARE and ROLL OUT, because the G/S ends at the glide path intercept point', () => {
    const landing = { catWordsCondition: false, landModesEngaged: true };
    expect(glsCapability(glsInputs({ ...landing, gls1GsValid: false, gls2GsValid: false }))).toBe(
      GlsCapability.AutoLand,
    );
    expect(glsCapability(glsInputs({ ...landing, gls2LocValid: false }))).toBe(GlsCapability.Cat1);
    expect(glsCapability(glsInputs({ gls1GsValid: false }))).toBe(GlsCapability.Cat1);
  });

  it('is capped on a selected GLS that is not received: CAT 1 at best, never AUTO LAND', () => {
    const notReceived = { gls1LocValid: false, gls2LocValid: false, gls1GsValid: false, gls2GsValid: false };
    expect(glsCapability(glsInputs(notReceived))).toBe(GlsCapability.Cat1);
  });

  it('has no CAT 2 or CAT 3 value', () => {
    expect(Object.values(GlsCapability).filter((v) => typeof v === 'string')).toEqual([
      'None',
      'NotArmed',
      'Cat1',
      'AutoLand',
    ]);
  });
});

describe('FLS approach capability', () => {
  it('is F-APP with GPS PRIMARY and valid FLS deviations', () => {
    expect(flsCapability(inputs())).toBe(FlsCapability.FApp);
  });

  it('is F-APP + RAW with a HIGH accuracy without GPS PRIMARY', () => {
    expect(flsCapability(inputs({ gpsPrimary: false }))).toBe(FlsCapability.FAppRaw);
  });

  it('is RAW ONLY with a LOW accuracy, invalid deviations or an FM / GPS position disagree', () => {
    expect(flsCapability(inputs({ gpsPrimary: false, navAccuracyHigh: false }))).toBe(FlsCapability.RawOnly);
    expect(flsCapability(inputs({ flsLocValid: false }))).toBe(FlsCapability.RawOnly);
    expect(flsCapability(inputs({ flsGsValid: false }))).toBe(FlsCapability.RawOnly);
    expect(flsCapability(inputs({ fmGpsPositionDisagree: true }))).toBe(FlsCapability.RawOnly);
  });

  it('ignores the F-LOC deviation on a LOC approach (real localizer + F-G/S)', () => {
    expect(flsCapability(inputs({ flsLateralActive: false, flsLocValid: false }))).toBe(FlsCapability.FApp);
    expect(flsCapability(inputs({ flsLateralActive: false, flsGsValid: false }))).toBe(FlsCapability.RawOnly);
  });

  it('shows nothing without an FLS approach or with no approach mode armed or engaged', () => {
    expect(flsCapability(inputs({ flsLateralActive: false, flsVerticalActive: false }))).toBe(FlsCapability.None);
    expect(flsCapability(inputs({ approachModesArmedOrEngaged: false }))).toBe(FlsCapability.None);
  });
});

describe('LS title', () => {
  it('is ILS, FLS, or LOC/FLS on a LOC approach flown with F-G/S', () => {
    expect(lsTitleText(false, false)).toBe('ILS');
    expect(lsTitleText(true, true)).toBe('FLS');
    expect(lsTitleText(false, true)).toBe('LOC/FLS');
  });

  it('is GLS on a GLS approach, whatever the FLS state', () => {
    expect(lsTitleText(false, false, true)).toBe('GLS');
    expect(lsTitleText(true, true, true)).toBe('GLS');
  });
  const shown = { lsButton: true, hasLoc: true, glsSelected: false, glsFlagShown: false };

  it('shows with the LS pb on and a localizer signal on an ILS', () => {
    expect(isLsTitleShown(shown)).toBe(true);
    expect(isLsTitleShown({ ...shown, hasLoc: false })).toBe(false);
    expect(isLsTitleShown({ ...shown, lsButton: false })).toBe(false);
  });

  it('shows GLS with the LS pb on whether or not the GLS is received', () => {
    expect(isLsTitleShown({ ...shown, glsSelected: true, hasLoc: false })).toBe(true);
    expect(isLsTitleShown({ ...shown, glsSelected: true, lsButton: false })).toBe(false);
  });

  it('gives way to the GLS flag, which takes its place', () => {
    expect(isLsTitleShown({ ...shown, glsSelected: true, glsFlagShown: true })).toBe(false);
  });
});

function glsFlagInputs(over: Partial<GlsFlagInputs> = {}): GlsFlagInputs {
  return {
    lsButton: true,
    channel: 20001,
    approachModeArmedOrEngaged: true,
    landModesEngaged: false,
    locValid: true,
    gsValid: true,
    glsFailed: false,
    onGround: false,
    ...over,
  };
}

describe('GLS flag', () => {
  const FRAME_MS = 100;

  /** Runs the monitor for the given time and returns the last flag state */
  const run = (monitor: GlsFlagMonitor, inputs: GlsFlagInputs, seconds: number) => {
    let flag = false;
    for (let i = 0; i < seconds * 10; i++) {
      flag = monitor.update(inputs, FRAME_MS);
    }
    return flag;
  };

  /** A monitor that has received the GLS for long enough */
  const receiving = () => {
    const monitor = new GlsFlagMonitor();
    expect(run(monitor, glsFlagInputs(), 2)).toBe(false);
    return monitor;
  };

  it('stays off while the GLS is not received yet, even with the approach armed', () => {
    expect(run(new GlsFlagMonitor(), glsFlagInputs({ locValid: false, gsValid: false }), 5)).toBe(false);
  });

  it('comes on when the LOC or the G/S that was received is lost', () => {
    const monitor = receiving();
    expect(run(monitor, glsFlagInputs({ gsValid: false }), 0.1)).toBe(true);
    expect(run(monitor, glsFlagInputs(), 0.1)).toBe(false);
    expect(run(monitor, glsFlagInputs({ locValid: false }), 0.1)).toBe(true);
  });

  it('does not count a signal that was valid for less than the confirmation time as received', () => {
    const monitor = new GlsFlagMonitor();
    expect(run(monitor, glsFlagInputs(), 0.5)).toBe(false);
    expect(run(monitor, glsFlagInputs({ locValid: false, gsValid: false }), 1)).toBe(false);
  });

  it('comes on with the GLS or the ground station failed, whether or not it was received', () => {
    const monitor = new GlsFlagMonitor();
    expect(run(monitor, glsFlagInputs({ locValid: false, gsValid: false, glsFailed: true }), 0.1)).toBe(true);
    expect(run(monitor, glsFlagInputs({ approachModeArmedOrEngaged: false, glsFailed: true }), 0.1)).toBe(true);
  });

  it('needs the LS pb and a GLS channel', () => {
    const monitor = new GlsFlagMonitor();
    const lost = { locValid: false, gsValid: false, glsFailed: true };
    expect(run(monitor, glsFlagInputs({ ...lost, lsButton: false }), 0.1)).toBe(false);
    expect(run(monitor, glsFlagInputs({ ...lost, channel: 0 }), 0.1)).toBe(false);
  });

  it('ignores the G/S in LAND, FLARE and ROLL OUT, where it is invalid past the glide path intercept point', () => {
    const monitor = receiving();
    expect(run(monitor, glsFlagInputs({ landModesEngaged: true, gsValid: false }), 0.1)).toBe(false);
    expect(run(monitor, glsFlagInputs({ landModesEngaged: true, locValid: false }), 0.1)).toBe(true);
  });

  it('shows no lost-signal flag on the ground, but still the failure flag', () => {
    const monitor = receiving();
    expect(run(monitor, glsFlagInputs({ locValid: false, onGround: true }), 1)).toBe(false);
    expect(run(monitor, glsFlagInputs({ locValid: false, onGround: true, glsFailed: true }), 0.1)).toBe(true);
  });

  it('forgets what was received when the approach modes drop', () => {
    const monitor = receiving();
    expect(run(monitor, glsFlagInputs({ approachModeArmedOrEngaged: false, locValid: false }), 0.1)).toBe(false);
    // armed again, still out of range: a new approach that was not received yet
    expect(run(monitor, glsFlagInputs({ locValid: false, gsValid: false }), 0.1)).toBe(false);
  });

  it('forgets what was received when the channel changes or the GLS is deselected', () => {
    const monitor = receiving();
    expect(run(monitor, glsFlagInputs({ channel: 20002, locValid: false, gsValid: false }), 0.1)).toBe(false);
    expect(run(monitor, glsFlagInputs({ channel: 20002 }), 0.1)).toBe(false);
    expect(run(monitor, glsFlagInputs({ channel: 0, locValid: false }), 0.1)).toBe(false);
    expect(run(monitor, glsFlagInputs({ channel: 20002, locValid: false, gsValid: false }), 0.1)).toBe(false);
  });

  it('does not latch the validity of the previous station on the frame of a channel change', () => {
    const monitor = receiving();
    // the channel changes while the validity still is the old one's for one frame, then the new GLS is not received
    expect(run(monitor, glsFlagInputs({ channel: 20002 }), 0.1)).toBe(false);
    expect(run(monitor, glsFlagInputs({ channel: 20002, locValid: false, gsValid: false }), 2)).toBe(false);
  });

  it('flags a new channel that was received for longer than the confirmation time and then lost', () => {
    const monitor = receiving();
    expect(run(monitor, glsFlagInputs({ channel: 20002 }), 2)).toBe(false);
    expect(run(monitor, glsFlagInputs({ channel: 20002, locValid: false }), 0.1)).toBe(true);
  });
});

describe('LS flash timer', () => {
  const run = (timer: LsFlashTimer, trigger: boolean, seconds: number) => {
    let flashing = false;
    for (let i = 0; i < seconds * 10; i++) {
      flashing = timer.update(trigger, 100);
    }
    return flashing;
  };

  it('flashes for 9 s from the rising edge, then stays steady', () => {
    const timer = new LsFlashTimer();
    expect(run(timer, true, 8.5)).toBe(true);
    expect(run(timer, true, 1)).toBe(false);
    expect(run(timer, true, 60)).toBe(false);
  });

  it('stops at once when the trigger drops and starts again on the next rising edge', () => {
    const timer = new LsFlashTimer();
    expect(run(timer, true, 3)).toBe(true);
    expect(run(timer, false, 0.1)).toBe(false);
    expect(run(timer, true, 1)).toBe(true);
    expect(run(timer, true, 8.5)).toBe(false);
  });

  it('does not let a time jump backwards stretch the flash', () => {
    const timer = new LsFlashTimer();
    expect(timer.update(true, 1000)).toBe(true);
    expect(timer.update(true, -60000)).toBe(true);
    expect(run(timer, true, 8.5)).toBe(false);
  });

  it('does not flash without the trigger', () => {
    expect(run(new LsFlashTimer(), false, 20)).toBe(false);
  });
});
