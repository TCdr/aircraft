// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/* The EcamInfos table is read from the source text (EcamMessages/index.ts import cycle, see FwsElecAlertsStatus.spec.ts) */
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

/* A380 FCOM PRO-ABN-ECAM-10-34 NAV ALL AIR DATA DISAGREE (Cont'd), ALL AIR DATA REJECTED BY PRIMs (a380_fcom.txt l.164360-164364) */
describe('A380X NAV ALL AIR DATA DISAGREE STATUS INFO, radome destruction', () => {
  it('has the FCOM lines IF RADOME DESTRUCTION : / INCREASE THRUST BY 5 % / FUEL CONSUMPT INCRSD / FMS FUEL PRED DISREGARD', () => {
    expect(['340200016', '340200017', '340200018', '340200019'].map(infoText)).toEqual([
      'IF RADOME DESTRUCTION :',
      '  INCREASE THRUST BY 5 %',
      '  FUEL CONSUMPT INCRSD',
      '  FMS FUEL PRED DISREGARD',
    ]);
  });
});
