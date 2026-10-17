// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/* EcamInfos is read from the source text (EcamMessages/index.ts import cycle, see FwsElecAlertsStatus.spec.ts) */
const ecamMessages = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
  'utf-8',
);

/** Text of an EcamInfos line, without its ECAM colour code (non-breaking spaces as plain spaces) */
function infoText(key: string): string | undefined {
  const start = ecamMessages.indexOf('export const EcamInfos');
  const body = ecamMessages.slice(start, ecamMessages.indexOf('\n};', start));
  const line = body.match(new RegExp(`^\\s*'?${key}'?: '\\\\x1b<\\d+m([^']*)',`, 'm'));
  return line ? line[1].replace(/\\xa0/g, ' ') : undefined;
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
