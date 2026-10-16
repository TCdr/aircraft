// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { AlignReferenceLatitudeFormat, AlignReferenceLongitudeFormat } from '../pages/common/DataEntryFormats';
import {
  alignReferenceOriginIdent,
  alignReferenceToSend,
  defaultAlignReference,
  irsAlignmentLabel,
  isAlignOnOtherReferenceAvailable,
  isAlignReferenceLost,
} from './IrsAlignReference';

const kiad = { ident: 'KIAD', location: { lat: 38.945, long: -77.455 } };

describe('POSITION / IRS Align On Other Reference', () => {
  it('is available in the PREFLIGHT and DONE phases only', () => {
    expect(isAlignOnOtherReferenceAvailable(FmgcFlightPhase.Preflight)).toBe(true);
    expect(isAlignOnOtherReferenceAvailable(FmgcFlightPhase.Done)).toBe(true);
    expect(isAlignOnOtherReferenceAvailable(FmgcFlightPhase.Takeoff)).toBe(false);
    expect(isAlignOnOtherReferenceAvailable(FmgcFlightPhase.Cruise)).toBe(false);
  });

  it('labels the alignment on the GPS or on the reference position', () => {
    expect(irsAlignmentLabel(false, false)).toBe('IRS ALIGNING ON GPS POS:');
    expect(irsAlignmentLabel(true, false)).toBe('IRS ALIGNED ON GPS POS:');
    expect(irsAlignmentLabel(false, true)).toBe('IRS ALIGNING ON REF POS:');
    expect(irsAlignmentLabel(true, true)).toBe('IRS ALIGNED ON REF POS:');
  });

  it('defaults to the origin airport, and to empty fields without an origin', () => {
    expect(defaultAlignReference(kiad.location)).toEqual({ lat: 38.945, long: -77.455 });
    expect(defaultAlignReference(undefined)).toEqual({ lat: null, long: null });
  });

  it('shows the origin ident only while the fields hold the origin reference point', () => {
    expect(alignReferenceOriginIdent({ lat: 38.945, long: -77.455 }, kiad)).toBe('KIAD');
    expect(alignReferenceOriginIdent({ lat: 38.95, long: -77.455 }, kiad)).toBeNull();
    expect(alignReferenceOriginIdent({ lat: null, long: -77.455 }, kiad)).toBeNull();
    expect(alignReferenceOriginIdent({ lat: 38.945, long: -77.455 }, undefined)).toBeNull();
  });

  it('sends the reference position only with both fields filled', () => {
    expect(alignReferenceToSend({ lat: 38.945, long: -77.455 })).toEqual({ lat: 38.945, long: -77.455 });
    expect(alignReferenceToSend({ lat: 38.945, long: null })).toBeNull();
  });

  it('loses the reference position when all three IRS are switched OFF', () => {
    expect(isAlignReferenceLost([0, 0, 0])).toBe(true);
    expect(isAlignReferenceLost([0, 1, 0])).toBe(false);
  });

  it('shows the fields as DDMM.MX and DDDMM.MY, without the degree sign', () => {
    expect(new AlignReferenceLatitudeFormat().format(38.945)[0]).toBe('3856.7N');
    expect(new AlignReferenceLongitudeFormat().format(-77.455)[0]).toBe('07727.3W');
    expect(new AlignReferenceLatitudeFormat().format(null)[0]).toBe('----.-');
  });
});
