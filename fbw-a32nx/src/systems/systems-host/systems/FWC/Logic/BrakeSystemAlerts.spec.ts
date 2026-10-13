// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import {
  ALTN_BRK_FAULT_STATUS,
  antiSkidNwsStatus,
  AUTO_BRK_FAULT_STATUS,
  BrakeSystemAlertInputs,
  brakeSystemAlerts,
  NORM_AND_ALTN_FAULT_STATUS,
  NORM_BRK_FAULT_STATUS,
  NW_STRG_FAULT_STATUS,
  SYS_1_FAULT_STATUS,
  SYS_2_FAULT_STATUS,
} from './BrakeSystemAlerts';

const healthy: BrakeSystemAlertInputs = {
  bscu1Lost: false,
  bscu2Lost: false,
  bscu1PowerLost: false,
  bscu2PowerLost: false,
  abcuLost: false,
  abcuPowerLost: false,
  normalBrakingFailed: false,
  autobrakeFailedAfterArmed: false,
  noseWheelSteeringFailed: false,
  antiSkidSwitchOff: false,
  yellowLowPressure: false,
};

/** The names of the active alerts */
function active(inputs: Partial<BrakeSystemAlertInputs>): string[] {
  const alerts = brakeSystemAlerts({ ...healthy, ...inputs });
  return Object.entries(alerts)
    .filter(([, isActive]) => isActive)
    .map(([name]) => name);
}

describe('BRAKES and WHEEL cautions of the brake control units (A320 FCOM PRO-ABN-BRAKES, PRO-ABN-WHEEL)', () => {
  it('raises nothing with a healthy brake system', () => {
    expect(active({})).toEqual([]);
  });

  it('SYS 1(2) FAULT when one BSCU channel is failed (l.72884)', () => {
    expect(active({ bscu1Lost: true })).toEqual(['sys1Fault']);
    expect(active({ bscu2Lost: true })).toEqual(['sys2Fault']);
  });

  it('no SYS 1(2) FAULT when the channel is lost by its bus (the ELEC bus fault shows BRK SYS 1(2))', () => {
    expect(active({ bscu1Lost: true, bscu1PowerLost: true })).toEqual([]);
  });

  it('A/SKID N/WS FAULT instead of SYS 1 + SYS 2 when both BSCU channels are failed (l.72327)', () => {
    expect(active({ bscu1Lost: true, bscu2Lost: true })).toEqual(['antiSkidNwsFault']);
    // one failed, one unpowered: still both channels lost
    expect(active({ bscu1Lost: true, bscu2Lost: true, bscu2PowerLost: true })).toEqual(['antiSkidNwsFault']);
  });

  it('no A/SKID N/WS FAULT when both channels are lost only by their buses (DC BUS 1+2 FAULT lists BRK SYS 1+2)', () => {
    expect(active({ bscu1Lost: true, bscu2Lost: true, bscu1PowerLost: true, bscu2PowerLost: true })).toEqual([]);
  });

  it('A/SKID N/WS FAULT on a loss of normal braking with Y HYD SYS LO PRESS (l.72326)', () => {
    expect(active({ normalBrakingFailed: true, yellowLowPressure: true })).toEqual(['antiSkidNwsFault']);
  });

  it('A/SKID N/WS OFF with the switch OFF, the FAULT title when there is also a fault (l.72328)', () => {
    expect(active({ antiSkidSwitchOff: true })).toEqual(['antiSkidNwsOff']);
    expect(active({ antiSkidSwitchOff: true, bscu1Lost: true, bscu2Lost: true })).toEqual(['antiSkidNwsFault']);
  });

  it('NORM BRK FAULT when the normal braking function is lost (l.72686)', () => {
    expect(active({ normalBrakingFailed: true })).toEqual(['normBrkFault']);
  });

  it('ALTN BRK FAULT when the alternate braking function is lost (l.72395), not for a DC ESS BUS loss', () => {
    expect(active({ abcuLost: true })).toEqual(['altnBrkFault']);
    expect(active({ abcuLost: true, abcuPowerLost: true })).toEqual([]);
  });

  it('NORM + ALTN FAULT replaces NORM BRK, ALTN BRK and A/SKID N/WS when both functions are lost (l.72640)', () => {
    expect(active({ normalBrakingFailed: true, abcuLost: true })).toEqual(['normAndAltnFault']);
    expect(active({ bscu1Lost: true, bscu2Lost: true, abcuLost: true })).toEqual(['normAndAltnFault']);
    expect(active({ normalBrakingFailed: true, abcuLost: true, abcuPowerLost: true })).toEqual(['normAndAltnFault']);
    // The existing A/SKID N/WS OFF TODO: inhibited by NORM + ALTN FAULT
    expect(active({ normalBrakingFailed: true, abcuLost: true, antiSkidSwitchOff: true })).toEqual([
      'normAndAltnFault',
    ]);
  });

  it('AUTO BRK FAULT when the autobrake failed after being armed (l.72473)', () => {
    expect(active({ autobrakeFailedAfterArmed: true })).toEqual(['autoBrkFault']);
  });

  it('no AUTO BRK FAULT when a braking alert already lists AUTO BRK in its STATUS', () => {
    expect(active({ autobrakeFailedAfterArmed: true, normalBrakingFailed: true })).toEqual(['normBrkFault']);
    expect(active({ autobrakeFailedAfterArmed: true, antiSkidSwitchOff: true })).toEqual(['antiSkidNwsOff']);
  });

  it('WHEEL N/W STRG FAULT when the nose wheel steering system is failed (l.96350)', () => {
    expect(active({ noseWheelSteeringFailed: true })).toEqual(['nwStrgFault']);
    expect(active({ noseWheelSteeringFailed: true, antiSkidSwitchOff: true })).toEqual(['antiSkidNwsOff']);
  });
});

/** The visible texts of formatted lines, without the colour codes */
// eslint-disable-next-line no-control-regex
const visible = (text: string) => text.replace(/\x1b(<\d+m|4m|m)/g, '').split('\r');

describe('BRAKES and WHEEL STATUS', () => {
  it('A/SKID N/WS: BRK Y ACCU PR ONLY only with the yellow system in low pressure (l.72358-72360)', () => {
    expect(visible(formatStatusPage(antiSkidNwsStatus(false).left, []).left)).not.toContain('BRK Y ACCU PR ONLY');
    expect(visible(formatStatusPage(antiSkidNwsStatus(true).left, []).left)).toContain('BRK Y ACCU PR ONLY');
  });

  it('shows the FCOM lines in the FCOM order', () => {
    const page = (status: { left: string[]; inopSys: string[] }) => {
      const texts = formatStatusPage(status.left, status.inopSys);
      return {
        left: visible(texts.left).filter((line) => line !== ''),
        inopSys: visible(texts.right).filter((line) => line !== '' && line !== 'INOP SYS'),
      };
    };
    expect(page(antiSkidNwsStatus(true))).toEqual({
      left: ['MAX BRK PR.....1000 PSI', 'LDG DIST PROC....APPLY', 'BRK Y ACCU PR ONLY', 'CAT 3 SINGLE ONLY'],
      inopSys: expect.arrayContaining(['CAT 3 DUAL', 'ANTI SKID', 'N/W STRG', 'NORM BRK', 'AUTO BRK']),
    });
    expect(page(NORM_AND_ALTN_FAULT_STATUS)).toEqual({
      left: ['PARK BRK ONLY', 'LDG DIST PROC....APPLY', 'CAT 3 SINGLE ONLY'],
      inopSys: expect.arrayContaining(['CAT 3 DUAL', 'ANTI SKID', 'N/W STRG', 'NORM BRK', 'AUTO BRK', 'ALTN BRK']),
    });
    expect(page(NORM_BRK_FAULT_STATUS)).toEqual({
      left: ['LDG DIST PROC....APPLY', 'ALTN Y BRK WITH A/SKID', 'CAT 3 SINGLE ONLY'],
      inopSys: expect.arrayContaining(['CAT 3 DUAL', 'NORM BRK', 'AUTO BRK']),
    });
    expect(page(ALTN_BRK_FAULT_STATUS).inopSys).toEqual(['ALTN BRK']);
    expect(page(AUTO_BRK_FAULT_STATUS)).toEqual({ left: ['CAT 3 SINGLE ONLY'], inopSys: ['CAT 3 DUAL', 'AUTO BRK'] });
    expect(page(SYS_1_FAULT_STATUS).inopSys).toEqual(['BRK SYS 1']);
    expect(page(SYS_2_FAULT_STATUS).inopSys).toEqual(['BRK SYS 2']);
    expect(page(NW_STRG_FAULT_STATUS)).toEqual({ left: ['CAT 3 SINGLE ONLY'], inopSys: ['CAT 3 DUAL', 'N/W STRG'] });
  });
});

describe('BRAKES and WHEEL wiring', () => {
  it('EWD titles and lines have the FCOM wording', () => {
    const lines = (codes: string[]) => formatEwdMessages(codes).map((line) => visible(line).join('').trim());
    expect(lines(['320041001', '320041002'])).toEqual(['BRAKES NORM + ALTN FAULT', 'PARK BRK ONLY']);
    expect(lines(['320040001', '320040002'])).toEqual(['BRAKES A/SKID N/WS FAULT', 'MAX BRK PR......1000PSI']);
    expect(lines(['320042001'])).toEqual(['BRAKES NORM BRK FAULT']);
    expect(lines(['320043001'])).toEqual(['BRAKES ALTN BRK FAULT']);
    expect(lines(['320044001'])).toEqual(['BRAKES AUTO BRK FAULT']);
    expect(lines(['320045001'])).toEqual(['BRAKES SYS 1 FAULT']);
    expect(lines(['320046001'])).toEqual(['BRAKES SYS 2 FAULT']);
    expect(lines(['320047001'])).toEqual(['WHEEL N/W STRG FAULT']);
  });

  it('PseudoFWC reads the brake model outputs and raises the alerts', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    for (const simvar of [
      'BSCU_1_FAULT',
      'BSCU_2_FAULT',
      'ALTN_BRK_FAULT',
      'NORM_BRK_FAULT',
      'AUTO_BRK_FAULT',
      'NW_STRG_FAULT',
    ]) {
      expect(fwc).toContain(`'L:A32NX_BRAKES_${simvar}'`);
    }
    expect(fwc).toContain('brakeSystemAlerts({');
    for (const code of [
      '3200400:',
      '3200410:',
      '3200420:',
      '3200430:',
      '3200440:',
      '3200450:',
      '3200460:',
      '3200470:',
    ]) {
      expect(fwc).toContain(code);
    }
  });

  it('the brake model writes the variables that PseudoFWC reads', () => {
    const model = readFileSync(
      resolve(__dirname, '../../../../../wasm/systems/a320_systems/src/hydraulic/brake_control_units.rs'),
      'utf-8',
    );
    expect(model).toContain('format!("BRAKES_BSCU_{channel}_FAULT")');
    for (const simvar of ['ALTN_BRK_FAULT', 'NORM_BRK_FAULT', 'AUTO_BRK_FAULT', 'NW_STRG_FAULT']) {
      expect(model).toContain(`"BRAKES_${simvar}"`);
    }
  });
});
