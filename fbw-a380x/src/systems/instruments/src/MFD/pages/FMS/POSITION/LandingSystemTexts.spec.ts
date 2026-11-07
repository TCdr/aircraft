// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import type { GlsApproachData } from '@fmgc/navigation/gls/GlsApproachData';
import {
  lsClassText,
  lsFrequencyEnteredByPilot,
  lsFrequencyOrChannel,
  lsIdentEnteredByPilot,
  lsSlopeText,
} from './LandingSystemTexts';

const gls = {
  channel: 20001,
  rpi: 'G25A',
  course: 249,
  slope: -3,
  definition: null,
} as GlsApproachData;

describe('LS block texts', () => {
  it('shows ILS/DME for a tuned ILS', () => {
    expect(lsClassText({ ident: 'IFRA', frequency: 110.3, slope: -3, gls: undefined })).toBe('ILS/DME');
  });

  it('shows GLS for a GLS, also when the channel is unknown and has no ident', () => {
    expect(lsClassText({ ident: 'G25A', frequency: null, slope: -3, gls })).toBe('GLS');
    expect(lsClassText({ ident: null, frequency: null, slope: null, gls: { ...gls, rpi: null } })).toBe('GLS');
  });

  it('shows nothing while nothing is tuned', () => {
    expect(lsClassText({ ident: null, frequency: null, slope: null, gls: undefined })).toBe('');
  });

  it('shows the channel of a GLS and the frequency of an ILS', () => {
    expect(lsFrequencyOrChannel({ ident: 'G25A', frequency: null, slope: -3, gls })).toBe(20001);
    expect(lsFrequencyOrChannel({ ident: 'IFRA', frequency: 110.3, slope: -3, gls: undefined })).toBe(110.3);
  });

  it('shows the GPA as the slope of a GLS, dashes without one', () => {
    expect(lsSlopeText({ ident: 'G25A', frequency: null, slope: gls.slope, gls })).toBe('-3.0');
    expect(lsSlopeText({ ident: null, frequency: null, slope: null, gls: undefined })).toBe('---');
  });
});

describe('LS block crew entry fonts', () => {
  const ilsFacility = {} as NonNullable<Parameters<typeof lsIdentEnteredByPilot>[0]['facility']>;

  it('shows a GLS typed as a reference path identifier as a crew entry in IDENT only', () => {
    const mmr = { manual: true, facility: undefined, gls, glsEntry: 'ident' as const };
    expect(lsIdentEnteredByPilot(mmr)).toBe(true);
    expect(lsFrequencyEnteredByPilot(mmr)).toBe(false);
  });

  it('shows a GLS typed as a channel as a crew entry in FREQ/CHAN only', () => {
    const mmr = { manual: true, facility: undefined, gls, glsEntry: 'channel' as const };
    expect(lsIdentEnteredByPilot(mmr)).toBe(false);
    expect(lsFrequencyEnteredByPilot(mmr)).toBe(true);
  });

  it('shows a GLS that the FMS selected small in both fields', () => {
    const mmr = { manual: false, facility: undefined, gls, glsEntry: undefined };
    expect(lsIdentEnteredByPilot(mmr)).toBe(false);
    expect(lsFrequencyEnteredByPilot(mmr)).toBe(false);
  });

  it('keeps the ILS rule: an ident entry has a facility, a frequency entry has none', () => {
    expect(lsIdentEnteredByPilot({ manual: true, facility: ilsFacility, gls: undefined })).toBe(true);
    expect(lsFrequencyEnteredByPilot({ manual: true, facility: ilsFacility, gls: undefined })).toBe(false);
    expect(lsIdentEnteredByPilot({ manual: true, facility: undefined, gls: undefined })).toBe(false);
    expect(lsFrequencyEnteredByPilot({ manual: true, facility: undefined, gls: undefined })).toBe(true);
  });
});
