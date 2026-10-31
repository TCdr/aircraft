// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EcamInfos } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { withoutEcamCodes } from './FwsSpecFixture';

/** Text of an EcamInfos line, without its ECAM colour code (non-breaking spaces as plain spaces) */
function infoText(key: string): string | undefined {
  const line = EcamInfos[key];
  return line === undefined ? undefined : withoutEcamCodes(line).replace(/\xa0/g, ' ');
}

/* NAV ALL AIR DATA DISAGREE, with all the air data rejected by the PRIMs */
describe('A380X NAV ALL AIR DATA DISAGREE STATUS INFO, radome destruction', () => {
  it('has the lines IF RADOME DESTRUCTION: / INCREASE THRUST BY 5 % / FUEL CONSUMPT INCRSD / FMS FUEL PRED DISREGARD', () => {
    expect(['340200016', '340200017', '340200018', '340200019'].map(infoText)).toEqual([
      'IF RADOME DESTRUCTION :',
      '  INCREASE THRUST BY 5 %',
      '  FUEL CONSUMPT INCRSD',
      '  FMS FUEL PRED DISREGARD',
    ]);
  });
});
