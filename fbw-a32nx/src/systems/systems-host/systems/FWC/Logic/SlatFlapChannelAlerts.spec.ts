// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import {
  discreteWordWithBits,
  probedFailure,
  shownLineText,
  startCruiseFwc,
  triggeredAmong,
} from '../FwcControlsAlertProbe';
import { normalWord } from '../PseudoFwcTestBed';
import {
  SLAT_FLAP_CHANNEL_FAULT_PHASE_INHIBITION,
  SfccStatusWord,
  flapSysFaultStatus,
  selectSfccPositionWord,
  slatFlapChannelFaults,
  slatSysFaultStatus,
} from './SlatFlapChannelAlerts';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The texts of the left column of the STATUS page for these codes, without their colour codes */
function statusTexts(codes: string[]): string[] {
  // eslint-disable-next-line no-control-regex
  const colourCode = /\x1b<\dm/g;
  return formatStatusPage(codes, [])
    .left.split('\r')
    .map((line) => line.replace(colourCode, ''));
}

/** A status word with the given bits set; an invalid word (SFCC unpowered) returns the default value of bitValueOr */
function statusWord(bits: number[], valid = true): SfccStatusWord {
  return { bitValueOr: (bit, valueIfInvalid) => (valid ? bits.includes(bit) : valueIfInvalid) };
}

describe('F/CTL FLAP(SLAT) SYS 1(2) FAULT', () => {
  it('raises nothing without a channel fault', () => {
    expect(slatFlapChannelFaults(statusWord([17, 28, 29]), statusWord([17, 28, 29]))).toEqual({
      flapSysFault: [false, false],
      slatSysFault: [false, false],
    });
  });

  it('raises FLAP SYS 1(2) FAULT on the flap fault bit 12 of SFCC 1(2)', () => {
    expect(slatFlapChannelFaults(statusWord([12]), statusWord([])).flapSysFault).toEqual([true, false]);
    expect(slatFlapChannelFaults(statusWord([]), statusWord([12])).flapSysFault).toEqual([false, true]);
    expect(slatFlapChannelFaults(statusWord([12]), statusWord([])).slatSysFault).toEqual([false, false]);
  });

  it('raises SLAT SYS 1(2) FAULT on the slat fault bit 11 of SFCC 1(2)', () => {
    expect(slatFlapChannelFaults(statusWord([11]), statusWord([])).slatSysFault).toEqual([true, false]);
    expect(slatFlapChannelFaults(statusWord([]), statusWord([11])).slatSysFault).toEqual([false, true]);
  });

  it('does not raise them for an unpowered SFCC (no status word, ELEC alerts cover it)', () => {
    expect(slatFlapChannelFaults(statusWord([], false), statusWord([], false))).toEqual({
      flapSysFault: [false, false],
      slatSysFault: [false, false],
    });
  });

  it('is inhibited in phases 3, 4, 5, 7 and 8', () => {
    expect(SLAT_FLAP_CHANNEL_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
  });

  it('shows the FLAP SYS 1 FAULT STATUS with the APPR PROC GPWS FLAP MODE OFF', () => {
    const status = flapSysFaultStatus(1);
    expect(statusTexts(status.left)).toEqual([
      'APPR PROC:',
      'GPWS FLAP MODE......OFF',
      'ENG 1 APPR IDLE ONLY',
      'FLAPS SLOW',
    ]);
    expect(status.inopSys).toEqual([]);
  });

  it('shows the FLAP SYS 2 FAULT STATUS without APPR PROC', () => {
    const status = flapSysFaultStatus(2);
    expect(statusTexts(status.left)).toEqual(['ENG 2 APPR IDLE ONLY', 'FLAPS SLOW']);
  });

  it('shows SLATS SLOW for SLAT SYS 1(2) FAULT', () => {
    expect(statusTexts(slatSysFaultStatus().left)).toEqual(['SLATS SLOW']);
  });
});

describe('PseudoFWC F/CTL FLAP(SLAT) SYS 1(2) FAULT', () => {
  const CHANNEL_FAULTS = [
    // alert key, SFCC, fault bit of the SFCC system status word, E/WD title, the STATUS of the alert
    ['2701110', 1, 12, 'F/CTL FLAP SYS 1 FAULT', flapSysFaultStatus(1)],
    ['2701120', 2, 12, 'F/CTL FLAP SYS 2 FAULT', flapSysFaultStatus(2)],
    ['2701130', 1, 11, 'F/CTL SLAT SYS 1 FAULT', slatSysFaultStatus()],
    ['2701140', 2, 11, 'F/CTL SLAT SYS 2 FAULT', slatSysFaultStatus()],
  ] as const;
  const ALERT_KEYS = CHANNEL_FAULTS.map(([key]) => key);

  it.each(CHANNEL_FAULTS)(
    '%s is a crew awareness F/CTL caution fed by SFCC %s bit %s',
    (key, sfcc, bit, title, status) => {
      const rig = startCruiseFwc();
      const alert = probedFailure(rig.fwc, key);
      expect(triggeredAmong(rig.fwc, ALERT_KEYS)).toEqual([]);

      rig.simvars.set(`L:A32NX_SFCC_${sfcc}_SLAT_FLAP_SYSTEM_STATUS_WORD`, discreteWordWithBits(bit));
      rig.run(1);
      expect(triggeredAmong(rig.fwc, ALERT_KEYS)).toEqual([key]);
      expect(alert.flightPhaseInhib).toEqual(SLAT_FLAP_CHANNEL_FAULT_PHASE_INHIBITION);
      expect(alert.failure).toBe(1);
      expect(shownLineText(alert).join(' ').replace(/\s+/g, ' ').trim()).toBe(title);
      expect(alert.statusInfo?.()).toEqual(status.left);
      expect(alert.inopSys?.()).toEqual(status.inopSys);
    },
  );
});

/* Two SFCCs, each with one slat channel and one flap channel: each position word has two sources. */
describe('FWC flap and slat position source', () => {
  const word = (name: string, valid: boolean) => ({ name, isNormalOperation: () => valid });

  it('uses SFCC 1 when it is valid', () => {
    expect(selectSfccPositionWord(word('sfcc1', true), word('sfcc2', true)).name).toBe('sfcc1');
    expect(selectSfccPositionWord(word('sfcc1', true), word('sfcc2', false)).name).toBe('sfcc1');
  });

  it('uses SFCC 2 when SFCC 1 sends no valid position', () => {
    expect(selectSfccPositionWord(word('sfcc1', false), word('sfcc2', true)).name).toBe('sfcc2');
  });

  it('keeps SFCC 1 when neither is valid', () => {
    expect(selectSfccPositionWord(word('sfcc1', false), word('sfcc2', false)).name).toBe('sfcc1');
  });

  it('PseudoFWC takes the SFCC 2 flap and slat positions when SFCC 1 sends none', () => {
    // flap position D and F angles are 152 and 179 deg, slat position G is 309.5 deg of the SFCC position words
    const rig = startCruiseFwc();
    const flapsAboveF = () => (rig.fwc as any).flapsSuperiorToPositionF.get();
    const slatsAboveG = () => (rig.fwc as any).slatsSuperiorToPositionG.get();
    rig.simvars.set('L:A32NX_SFCC_2_FLAP_ACTUAL_POSITION_WORD', normalWord(200));
    rig.simvars.set('L:A32NX_SFCC_2_SLAT_ACTUAL_POSITION_WORD', normalWord(320));
    rig.run(1);
    expect(flapsAboveF()).toBe(true);
    expect(slatsAboveG()).toBe(true);

    // SFCC 1 valid: its position is used
    rig.simvars.set('L:A32NX_SFCC_1_FLAP_ACTUAL_POSITION_WORD', normalWord(100));
    rig.simvars.set('L:A32NX_SFCC_1_SLAT_ACTUAL_POSITION_WORD', normalWord(100));
    rig.run(1);
    expect(flapsAboveF()).toBe(false);
    expect(slatsAboveG()).toBe(false);
  });
});
