// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  isApprModeArmedOrEngaged,
  isBelowIlsTuneInhibitHeight,
  isIlsTuneInhibited,
  RMP_PANEL_MODE_ADF,
  RMP_PANEL_MODE_ILS,
  RMP_PANEL_MODE_VOR,
  rmpStbyNavKeyPanelMode,
} from './RmpNavBackupTuning';

const radioHeight = (feet: number, ssm = Arinc429SignStatusMatrix.NormalOperation): number =>
  Arinc429Word.getRawWord(feet, ssm);

/** L:A32NX_FMA_* values: LOC and G/S armed (bits 1 and 4), LOC_TRACK (31), GS_TRACK (31), HDG (10), ALT (10) */
const LOC_ARMED = 1 << 1;
const GS_ARMED = 1 << 4;

describe('RMP STBY NAV keys (A320 FCOM l.53452-53456)', () => {
  it('select VOR, ILS and ADF in the NAV backup mode', () => {
    expect(rmpStbyNavKeyPanelMode('VOR', true)).toBe(RMP_PANEL_MODE_VOR);
    expect(rmpStbyNavKeyPanelMode('ILS', true)).toBe(RMP_PANEL_MODE_ILS);
    expect(rmpStbyNavKeyPanelMode('ADF', true)).toBe(RMP_PANEL_MODE_ADF);
  });

  it('do nothing outside the NAV backup mode', () => {
    expect(rmpStbyNavKeyPanelMode('VOR', false)).toBeNull();
    expect(rmpStbyNavKeyPanelMode('ILS', false)).toBeNull();
  });

  it('GLS and MLS (receivers not installed) do nothing, also in the NAV backup mode', () => {
    expect(rmpStbyNavKeyPanelMode('GLS', true)).toBeNull();
    expect(rmpStbyNavKeyPanelMode('MLS', true)).toBeNull();
  });
});

describe('ILS tune inhibit (A320 FCOM l.111377-111380)', () => {
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

  it('freezes the ILS below 700 ft RA with APPR armed or engaged and an AP or FD engaged', () => {
    expect(isIlsTuneInhibited(true, true, true, true)).toBe(true);
  });

  it('does not freeze the ILS above 700 ft, without APPR, or without AP and FD', () => {
    expect(isIlsTuneInhibited(true, false, true, true)).toBe(false);
    expect(isIlsTuneInhibited(true, true, false, true)).toBe(false);
    expect(isIlsTuneInhibited(true, true, true, false)).toBe(false);
  });

  it('leaves VOR and ADF tunable', () => {
    expect(isIlsTuneInhibited(false, true, true, true)).toBe(false);
  });
});
