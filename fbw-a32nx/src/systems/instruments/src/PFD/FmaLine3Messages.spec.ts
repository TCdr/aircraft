// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  DisconnectApForLdgInputs,
  ForGaSetTogaInputs,
  isDisconnectApForLdg,
  isForGaSetToga,
  isNonPrecisionApproachFlown,
  isSetGreenDotSpeed,
  NonPrecisionApproachInputs,
  SetGreenDotSpeedInputs,
} from './FmaLine3Messages';

/* The FMA line 3 special messages computed on the PFD */

function toga(over: Partial<ForGaSetTogaInputs> = {}): ForGaSetTogaInputs {
  return {
    apOrFdEngaged: true,
    approachVerticalModeActive: true,
    radioAltitudeFt: 500,
    tlaDegrees: [35, 35],
    ...over,
  };
}

describe('FMA FOR GA: SET TOGA', () => {
  it('shows with all levers in MCT on approach below 1 000 ft RA', () => {
    expect(isForGaSetToga(toga())).toBe(true);
    expect(isForGaSetToga(toga({ tlaDegrees: [40, 44.9] }))).toBe(true);
  });

  it('does not show with a lever below MCT or in TOGA', () => {
    expect(isForGaSetToga(toga({ tlaDegrees: [35, 25] }))).toBe(false);
    expect(isForGaSetToga(toga({ tlaDegrees: [45, 45] }))).toBe(false);
  });

  it('needs the approach vertical mode, AP/FD and RA below 1 000 ft', () => {
    expect(isForGaSetToga(toga({ approachVerticalModeActive: false }))).toBe(false);
    expect(isForGaSetToga(toga({ apOrFdEngaged: false }))).toBe(false);
    expect(isForGaSetToga(toga({ radioAltitudeFt: 1_000 }))).toBe(false);
    expect(isForGaSetToga(toga({ radioAltitudeFt: null }))).toBe(false);
  });
});

function disconnect(over: Partial<DisconnectApForLdgInputs> = {}): DisconnectApForLdgInputs {
  return {
    apEngaged: true,
    nonPrecisionApproach: true,
    baroAltitudeFt: 1_000,
    mdaFt: 1_100,
    dhFt: null,
    radioAltitudeFt: 600,
    ...over,
  };
}

describe('FMA DISCONNECT AP FOR LDG', () => {
  it('shows at the MDA minus 50 ft with the AP engaged on a non precision approach', () => {
    expect(isDisconnectApForLdg(disconnect({ baroAltitudeFt: 1_051 }))).toBe(false);
    expect(isDisconnectApForLdg(disconnect({ baroAltitudeFt: 1_050 }))).toBe(true);
  });

  it('uses the DH with a RADIO minimum', () => {
    expect(isDisconnectApForLdg(disconnect({ mdaFt: null, dhFt: 250, radioAltitudeFt: 210 }))).toBe(false);
    expect(isDisconnectApForLdg(disconnect({ mdaFt: null, dhFt: 250, radioAltitudeFt: 200 }))).toBe(true);
  });

  it('uses 400 ft AGL without a minimum', () => {
    expect(isDisconnectApForLdg(disconnect({ mdaFt: null, radioAltitudeFt: 401 }))).toBe(false);
    expect(isDisconnectApForLdg(disconnect({ mdaFt: null, radioAltitudeFt: 400 }))).toBe(true);
  });

  it('does not show with the AP off or on a precision approach', () => {
    expect(isDisconnectApForLdg(disconnect({ apEngaged: false }))).toBe(false);
    expect(isDisconnectApForLdg(disconnect({ nonPrecisionApproach: false }))).toBe(false);
  });
});

function approach(over: Partial<NonPrecisionApproachInputs> = {}): NonPrecisionApproachInputs {
  return {
    fmgcFlightPhase: 5,
    finalMode: false,
    fpaMode: false,
    vsMode: false,
    glideSlopeMode: false,
    flsVerticalActive: false,
    ...over,
  };
}

describe('FMA non precision approach', () => {
  it('counts the G/S modes of an FLS approach (F-G/S)', () => {
    expect(isNonPrecisionApproachFlown(approach({ glideSlopeMode: true, flsVerticalActive: true }))).toBe(true);
  });

  it('does not count the G/S of a real ILS', () => {
    expect(isNonPrecisionApproachFlown(approach({ glideSlopeMode: true, flsVerticalActive: false }))).toBe(false);
  });

  it('does not count F-G/S without the G/S mode engaged', () => {
    expect(isNonPrecisionApproachFlown(approach({ flsVerticalActive: true }))).toBe(false);
  });

  it.each(['finalMode', 'fpaMode', 'vsMode'] as const)('counts %s in the approach phase', (mode) => {
    expect(isNonPrecisionApproachFlown(approach({ [mode]: true }))).toBe(true);
  });

  it('needs the approach phase', () => {
    expect(isNonPrecisionApproachFlown(approach({ fmgcFlightPhase: 4, finalMode: true }))).toBe(false);
    expect(
      isNonPrecisionApproachFlown(approach({ fmgcFlightPhase: 4, glideSlopeMode: true, flsVerticalActive: true })),
    ).toBe(false);
  });

  it('does not count without a vertical mode of a non precision approach', () => {
    expect(isNonPrecisionApproachFlown(approach())).toBe(false);
  });
});

function greenDot(over: Partial<SetGreenDotSpeedInputs> = {}): SetGreenDotSpeedInputs {
  return {
    engineOut: true,
    speedSelected: true,
    fcuSelectedSpeedKt: 210,
    greenDotKt: 200,
    altOrAltStarActive: false,
    ...over,
  };
}

describe('FMA SET GREEN DOT SPEED', () => {
  it('shows at green dot +10 kt or more, except in ALT* / ALT', () => {
    expect(isSetGreenDotSpeed(greenDot())).toBe(true);
    expect(isSetGreenDotSpeed(greenDot({ fcuSelectedSpeedKt: 209 }))).toBe(false);
    expect(isSetGreenDotSpeed(greenDot({ altOrAltStarActive: true }))).toBe(false);
  });

  it('shows at green dot -10 kt or less, also in ALT', () => {
    expect(isSetGreenDotSpeed(greenDot({ fcuSelectedSpeedKt: 190, altOrAltStarActive: true }))).toBe(true);
    expect(isSetGreenDotSpeed(greenDot({ fcuSelectedSpeedKt: 191 }))).toBe(false);
  });

  it('needs engine-out and a selected speed', () => {
    expect(isSetGreenDotSpeed(greenDot({ engineOut: false }))).toBe(false);
    expect(isSetGreenDotSpeed(greenDot({ speedSelected: false }))).toBe(false);
    expect(isSetGreenDotSpeed(greenDot({ greenDotKt: null }))).toBe(false);
  });
});
