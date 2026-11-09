// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  formatGlsChannel,
  isApprModeArmedOrEngaged,
  isBelowIlsTuneInhibitHeight,
  isLsTuneInhibited,
  RMP_PANEL_MODE_ADF,
  RMP_PANEL_MODE_GLS,
  RMP_PANEL_MODE_ILS,
  RMP_PANEL_MODE_VOR,
  rmpStbyNavKeyPanelMode,
  isRmpGlsChannelDropped,
  rmpTransferTuning,
  stepGlsChannel,
} from './RmpNavBackupTuning';

const radioHeight = (feet: number, ssm = Arinc429SignStatusMatrix.NormalOperation): number =>
  Arinc429Word.getRawWord(feet, ssm);

/** L:A32NX_FMA_* values: LOC and G/S armed (bits 1 and 4), LOC_TRACK (31), GS_TRACK (31), HDG (10), ALT (10) */
const LOC_ARMED = 1 << 1;
const GS_ARMED = 1 << 4;

describe('RMP STBY NAV keys', () => {
  it('select VOR, ILS and ADF in the NAV backup mode', () => {
    expect(rmpStbyNavKeyPanelMode('VOR', true)).toBe(RMP_PANEL_MODE_VOR);
    expect(rmpStbyNavKeyPanelMode('ILS', true)).toBe(RMP_PANEL_MODE_ILS);
    expect(rmpStbyNavKeyPanelMode('ADF', true)).toBe(RMP_PANEL_MODE_ADF);
  });

  it('do nothing outside the NAV backup mode', () => {
    expect(rmpStbyNavKeyPanelMode('VOR', false)).toBeNull();
    expect(rmpStbyNavKeyPanelMode('ILS', false)).toBeNull();
  });

  it('select the GLS in the NAV backup mode only', () => {
    expect(rmpStbyNavKeyPanelMode('GLS', true)).toBe(RMP_PANEL_MODE_GLS);
    expect(rmpStbyNavKeyPanelMode('GLS', false)).toBeNull();
  });

  it('MLS (receiver not installed) does nothing, also in the NAV backup mode', () => {
    expect(rmpStbyNavKeyPanelMode('MLS', true)).toBeNull();
  });
});

describe('ILS tune inhibit', () => {
  it('APPR armed or engaged needs both LOC and G/S', () => {
    expect(isApprModeArmedOrEngaged(10, LOC_ARMED, 10, GS_ARMED)).toBe(true);
    expect(isApprModeArmedOrEngaged(31, 0, 31, 0)).toBe(true);
    expect(isApprModeArmedOrEngaged(31, 0, 10, GS_ARMED)).toBe(true);
    expect(isApprModeArmedOrEngaged(32, 0, 32, 0)).toBe(true);
    // LOC only (LOC pb)
    expect(isApprModeArmedOrEngaged(31, 0, 10, 0)).toBe(false);
    expect(isApprModeArmedOrEngaged(10, LOC_ARMED, 10, 0)).toBe(false);
    // NAV and FINAL APP (non ILS approach)
    expect(isApprModeArmedOrEngaged(20, 0, 24, 0)).toBe(false);
  });

  it('reads the radio heights as ARINC 429 words', () => {
    expect(isBelowIlsTuneInhibitHeight(radioHeight(650), radioHeight(660))).toBe(true);
    expect(isBelowIlsTuneInhibitHeight(radioHeight(650), radioHeight(720))).toBe(true);
    expect(isBelowIlsTuneInhibitHeight(radioHeight(800), radioHeight(810))).toBe(false);
    // above the RA range (no computed data) and failed radio altimeters do not count
    expect(
      isBelowIlsTuneInhibitHeight(
        radioHeight(0, Arinc429SignStatusMatrix.NoComputedData),
        radioHeight(0, Arinc429SignStatusMatrix.FailureWarning),
      ),
    ).toBe(false);
    expect(isBelowIlsTuneInhibitHeight(0, 0)).toBe(false);
  });

  it('freezes the ILS or GLS below 700 ft RA with APPR armed or engaged and an AP or FD engaged', () => {
    expect(isLsTuneInhibited(true, true, true, true)).toBe(true);
  });

  it('does not freeze the ILS above 700 ft, without APPR, or without AP and FD', () => {
    expect(isLsTuneInhibited(true, false, true, true)).toBe(false);
    expect(isLsTuneInhibited(true, true, false, true)).toBe(false);
    expect(isLsTuneInhibited(true, true, true, false)).toBe(false);
  });

  it('leaves VOR and ADF tunable', () => {
    expect(isLsTuneInhibited(false, true, true, true)).toBe(false);
  });
});

describe('GLS channel entry', () => {
  it('moves the hundreds with the outer knob', () => {
    expect(stepGlsChannel(20001, 1, 0)).toBe(20101);
    expect(stepGlsChannel(20101, -1, 0)).toBe(20001);
    expect(stepGlsChannel(31434, 2, 0)).toBe(31634);
  });

  it('stays inside the channel range with the outer knob', () => {
    expect(stepGlsChannel(39999, 1, 0)).toBe(39999);
    expect(stepGlsChannel(20050, -1, 0)).toBe(20001);
  });

  it('moves the last two digits with the inner knob and wraps inside the hundred', () => {
    expect(stepGlsChannel(31434, 0, 1)).toBe(31435);
    expect(stepGlsChannel(31499, 0, 1)).toBe(31400);
    expect(stepGlsChannel(31400, 0, -1)).toBe(31499);
  });

  it('wraps over the missing channel 20000', () => {
    expect(stepGlsChannel(20099, 0, 1)).toBe(20001);
    expect(stepGlsChannel(20001, 0, -1)).toBe(20099);
  });

  it('moves by the clicks of the rate multiplier, as the ILS knobs do', () => {
    expect(stepGlsChannel(31434, 0, 25)).toBe(31459);
    expect(stepGlsChannel(31434, 0, 250)).toBe(31484);
    expect(stepGlsChannel(20001, 25, 0)).toBe(22501);
    expect(stepGlsChannel(20001, -50, 0)).toBe(20001);
    expect(stepGlsChannel(39999, 50, 0)).toBe(39999);
  });

  it('is shown as its digits', () => {
    expect(formatGlsChannel(20001)).toBe('20001');
    expect(formatGlsChannel(31434)).toBe('31434');
  });
});

describe('RMP transfer key', () => {
  it('tunes the GLS channel and the ILS frequency only while both RMPs are in the NAV backup mode', () => {
    expect(rmpTransferTuning('GLS', true)).toBe('gls-channel');
    expect(rmpTransferTuning('ILS', true)).toBe('ils-frequency');
    expect(rmpTransferTuning('GLS', false)).toBe('none');
    expect(rmpTransferTuning('ILS', false)).toBe('none');
  });

  it('tunes VOR and ADF with one RMP in the NAV backup mode', () => {
    expect(rmpTransferTuning('OTHER', false)).toBe('frequency');
    expect(rmpTransferTuning('OTHER', true)).toBe('frequency');
  });

  it('drops the GLS channel when the last RMP leaves the NAV backup mode', () => {
    expect(isRmpGlsChannelDropped(false)).toBe(true);
    expect(isRmpGlsChannelDropped(true)).toBe(false);
  });
});
