// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  ALTI_DISCREPANCY_BARO_REFERENCE_FT,
  ALTI_DISCREPANCY_STD_REFERENCE_FT,
  isAltitudeDiscrepancy,
} from './AltitudeDiscrepancy';

const altitude = (feet: number, ssm = Arinc429SignStatusMatrix.NormalOperation) =>
  new Arinc429Word(Arinc429Word.getRawWord(feet, ssm));

/** Both ADRs at adrFt, both DMCs displaying dmcFt */
const discrepancy = (adrFt: number, dmcFt: number, thresholdFt: number) =>
  isAltitudeDiscrepancy(altitude(adrFt), altitude(dmcFt), altitude(adrFt), altitude(dmcFt), thresholdFt);

describe('A32NX FWC NAV ALTI DISCREPANCY', () => {
  it('uses 250 ft with QNH or QFE and 500 ft with STD', () => {
    expect(ALTI_DISCREPANCY_BARO_REFERENCE_FT).toBe(250);
    expect(ALTI_DISCREPANCY_STD_REFERENCE_FT).toBe(500);
  });

  it('triggers with QNH/QFE above 250 ft only', () => {
    expect(discrepancy(5000, 5250, ALTI_DISCREPANCY_BARO_REFERENCE_FT)).toBe(false);
    expect(discrepancy(5000, 5260, ALTI_DISCREPANCY_BARO_REFERENCE_FT)).toBe(true);
  });

  it('does not trigger with STD for a 400 ft difference (more than 250, not more than 500)', () => {
    expect(discrepancy(35000, 35400, ALTI_DISCREPANCY_STD_REFERENCE_FT)).toBe(false);
    expect(discrepancy(35000, 35500, ALTI_DISCREPANCY_STD_REFERENCE_FT)).toBe(false);
    expect(discrepancy(35000, 35510, ALTI_DISCREPANCY_STD_REFERENCE_FT)).toBe(true);
  });

  it('compares each ADR with the other side DMC, in either direction', () => {
    // only the F/O ADR disagrees with the CAPT DMC
    expect(isAltitudeDiscrepancy(altitude(5000), altitude(5000), altitude(5600), altitude(5000), 250)).toBe(true);
  });

  it('does not compare failed words', () => {
    const failed = altitude(9000, Arinc429SignStatusMatrix.FailureWarning);
    expect(isAltitudeDiscrepancy(failed, altitude(5000), failed, altitude(5000), 250)).toBe(false);
  });
});
