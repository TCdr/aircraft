// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import {
  ALTN_BRK_FAULT_STATUS,
  antiSkidNwsStatus,
  AUTO_BRK_FAULT_STATUS,
  AUTO_BRK_MEMO_CODES,
  autoBrakeMemoLine,
  BrakeSystemAlertInputs,
  brakeSystemAlerts,
  NORM_AND_ALTN_FAULT_STATUS,
  NORM_BRK_FAULT_STATUS,
  NW_STRG_FAULT_STATUS,
  HYD_SEL_FAULT_CODES,
  HYD_SEL_FAULT_PHASE_INHIBITION,
  hydSelFaultLines,
  SYS_1_FAULT_STATUS,
  SYS_2_FAULT_STATUS,
} from './BrakeSystemAlerts';
import { probedFailure, probedMemo, shownLineText, startCruiseFwc, triggeredAmong } from '../FwcControlsAlertProbe';
import { isAlertTriggered } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

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
  normalSelectorValveFailed: false,
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

describe('BRAKES and WHEEL cautions of the brake control units', () => {
  it('raises nothing with a healthy brake system', () => {
    expect(active({})).toEqual([]);
  });

  it('SYS 1(2) FAULT when one BSCU channel is failed', () => {
    expect(active({ bscu1Lost: true })).toEqual(['sys1Fault']);
    expect(active({ bscu2Lost: true })).toEqual(['sys2Fault']);
  });

  it('no SYS 1(2) FAULT when the channel is lost by its bus (the ELEC bus fault shows BRK SYS 1(2))', () => {
    expect(active({ bscu1Lost: true, bscu1PowerLost: true })).toEqual([]);
  });

  it('A/SKID N/WS FAULT instead of SYS 1 + SYS 2 when both BSCU channels are failed', () => {
    expect(active({ bscu1Lost: true, bscu2Lost: true })).toEqual(['antiSkidNwsFault']);
    // one failed, one unpowered: still both channels lost
    expect(active({ bscu1Lost: true, bscu2Lost: true, bscu2PowerLost: true })).toEqual(['antiSkidNwsFault']);
  });

  it('no A/SKID N/WS FAULT when both channels are lost only by their buses (DC BUS 1+2 FAULT lists BRK SYS 1+2)', () => {
    expect(active({ bscu1Lost: true, bscu2Lost: true, bscu1PowerLost: true, bscu2PowerLost: true })).toEqual([]);
  });

  it('A/SKID N/WS FAULT on a loss of normal braking with Y HYD SYS LO PRESS', () => {
    expect(active({ normalBrakingFailed: true, yellowLowPressure: true })).toEqual(['antiSkidNwsFault']);
  });

  it('A/SKID N/WS OFF with the switch OFF, the FAULT title when there is also a fault', () => {
    expect(active({ antiSkidSwitchOff: true })).toEqual(['antiSkidNwsOff']);
    expect(active({ antiSkidSwitchOff: true, bscu1Lost: true, bscu2Lost: true })).toEqual(['antiSkidNwsFault']);
  });

  it('NORM BRK FAULT when the normal braking function is lost', () => {
    expect(active({ normalBrakingFailed: true })).toEqual(['normBrkFault']);
  });

  it('ALTN BRK FAULT when the alternate braking function is lost, not for a DC ESS BUS loss', () => {
    expect(active({ abcuLost: true })).toEqual(['altnBrkFault']);
    expect(active({ abcuLost: true, abcuPowerLost: true })).toEqual([]);
  });

  it('NORM + ALTN FAULT replaces NORM BRK, ALTN BRK and A/SKID N/WS when both functions are lost', () => {
    expect(active({ normalBrakingFailed: true, abcuLost: true })).toEqual(['normAndAltnFault']);
    expect(active({ bscu1Lost: true, bscu2Lost: true, abcuLost: true })).toEqual(['normAndAltnFault']);
    expect(active({ normalBrakingFailed: true, abcuLost: true, abcuPowerLost: true })).toEqual(['normAndAltnFault']);
    // A/SKID N/WS OFF is inhibited by NORM + ALTN FAULT
    expect(active({ normalBrakingFailed: true, abcuLost: true, antiSkidSwitchOff: true })).toEqual([
      'normAndAltnFault',
    ]);
  });

  it('AUTO BRK FAULT when the autobrake failed after being armed', () => {
    expect(active({ autobrakeFailedAfterArmed: true })).toEqual(['autoBrkFault']);
  });

  it('no AUTO BRK FAULT when a braking alert already lists AUTO BRK in its STATUS', () => {
    expect(active({ autobrakeFailedAfterArmed: true, normalBrakingFailed: true })).toEqual(['normBrkFault']);
    expect(active({ autobrakeFailedAfterArmed: true, antiSkidSwitchOff: true })).toEqual(['antiSkidNwsOff']);
  });

  it('WHEEL N/W STRG FAULT when the nose wheel steering system is failed', () => {
    expect(active({ noseWheelSteeringFailed: true })).toEqual(['nwStrgFault']);
    expect(active({ noseWheelSteeringFailed: true, antiSkidSwitchOff: true })).toEqual(['antiSkidNwsOff']);
  });

  it('WHEEL HYD SEL FAULT when the BSCU reports the brake normal selector valve failed', () => {
    expect(active({ normalSelectorValveFailed: true })).toEqual(['hydSelFault']);
    // A/SKID & N/W STRG KEEP ON stays
    expect(hydSelFaultLines()).toEqual([0, 1]);
    expect(HYD_SEL_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
  });
});

/** The visible texts of formatted lines, without the colour codes */
// eslint-disable-next-line no-control-regex
const visible = (text: string) => text.replace(/\x1b(<\d+m|4m|m)/g, '').split('\r');

describe('BRAKES and WHEEL STATUS', () => {
  it('A/SKID N/WS: BRK Y ACCU PR ONLY only with the yellow system in low pressure', () => {
    expect(visible(formatStatusPage(antiSkidNwsStatus(false).left, []).left)).not.toContain('BRK Y ACCU PR ONLY');
    expect(visible(formatStatusPage(antiSkidNwsStatus(true).left, []).left)).toContain('BRK Y ACCU PR ONLY');
  });

  it('shows the procedure lines in the aircraft order', () => {
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
  it('EWD titles and lines have the aircraft wording', () => {
    const lines = (codes: string[]) => formatEwdMessages(codes).map((line) => visible(line).join('').trim());
    expect(lines(['320041001', '320041002'])).toEqual(['BRAKES NORM + ALTN FAULT', 'PARK BRK ONLY']);
    expect(lines(['320040001', '320040002'])).toEqual(['BRAKES A/SKID N/WS FAULT', 'MAX BRK PR......1000PSI']);
    expect(lines(['320042001'])).toEqual(['BRAKES NORM BRK FAULT']);
    expect(lines(['320043001'])).toEqual(['BRAKES ALTN BRK FAULT']);
    expect(lines(['320044001'])).toEqual(['BRAKES AUTO BRK FAULT']);
    expect(lines(['320045001'])).toEqual(['BRAKES SYS 1 FAULT']);
    expect(lines(['320046001'])).toEqual(['BRAKES SYS 2 FAULT']);
    expect(lines(['320047001'])).toEqual(['WHEEL N/W STRG FAULT']);
    expect(lines(HYD_SEL_FAULT_CODES)).toEqual(['WHEEL HYD SEL FAULT', '-A/SKID N/WS....KEEP ON']);
  });

  it('PseudoFWC reads the brake model outputs and raises the alerts', () => {
    const rig = startCruiseFwc();
    const alertCodes = [
      '3200400',
      '3200410',
      '3200420',
      '3200430',
      '3200440',
      '3200450',
      '3200460',
      '3200470',
      '3200480',
    ];
    expect(triggeredAmong(rig.fwc, alertCodes)).toEqual([]);
    for (const [simvar, alertCode, titleCode] of [
      ['BSCU_1_FAULT', '3200450', '320045001'],
      ['BSCU_2_FAULT', '3200460', '320046001'],
      ['ALTN_BRK_FAULT', '3200430', '320043001'],
      ['NORM_BRK_FAULT', '3200420', '320042001'],
      ['AUTO_BRK_FAULT', '3200440', '320044001'],
      ['NW_STRG_FAULT', '3200470', '320047001'],
      ['HYD_SEL_FAULT', '3200480', '320048001'],
    ]) {
      rig.simvars.set(`L:A32NX_BRAKES_${simvar}`, 1);
      rig.run(1);
      expect(triggeredAmong(rig.fwc, alertCodes)).toEqual([alertCode]);
      expect(probedFailure(rig.fwc, alertCode).codesToReturn[0]).toBe(titleCode);
      rig.simvars.set(`L:A32NX_BRAKES_${simvar}`, 0);
      rig.run(1);
    }
  });

  it('both BSCU channels lost and both braking functions lost give their own alerts', () => {
    const rig = startCruiseFwc();
    rig.simvars.set('L:A32NX_BRAKES_BSCU_1_FAULT', 1);
    rig.simvars.set('L:A32NX_BRAKES_BSCU_2_FAULT', 1);
    rig.run(1);
    expect(probedFailure(rig.fwc, '3200400').codesToReturn[0]).toBe('320040001');
    expect(isAlertTriggered(rig.fwc, '3200400')).toBe(true);
    expect(isAlertTriggered(rig.fwc, '3200450')).toBe(false);
    rig.simvars.set('L:A32NX_BRAKES_ALTN_BRK_FAULT', 1);
    rig.run(1);
    expect(probedFailure(rig.fwc, '3200410').codesToReturn[0]).toBe('320041001');
    expect(isAlertTriggered(rig.fwc, '3200410')).toBe(true);
    expect(isAlertTriggered(rig.fwc, '3200400')).toBe(false);
  });

  it('the brake model writes the variables that PseudoFWC reads', () => {
    const model = readFileSync(
      resolve(__dirname, '../../../../../wasm/systems/a320_systems/src/hydraulic/brake_control_units.rs'),
      'utf-8',
    );
    expect(model).toContain('format!("BRAKES_BSCU_{channel}_FAULT")');
    for (const simvar of ['ALTN_BRK_FAULT', 'NORM_BRK_FAULT', 'AUTO_BRK_FAULT', 'NW_STRG_FAULT', 'HYD_SEL_FAULT']) {
      expect(model).toContain(`"BRAKES_${simvar}"`);
    }
  });
});

describe('AUTO BRK memo', () => {
  const memo = (phase: number, mode: number, failed: boolean) => {
    const line = autoBrakeMemoLine(phase, mode, failed);
    return line === null ? null : formatEwdMessages([AUTO_BRK_MEMO_CODES[line]])[0];
  };

  it('shows the green AUTO BRK LO/MED/MAX selection in flight phases 7 and 8', () => {
    expect(memo(7, 1, false)).toBe('\x1b<3mAUTO BRK LO');
    expect(memo(8, 2, false)).toBe('\x1b<3mAUTO BRK MED');
    expect(memo(7, 3, false)).toBe('\x1b<3mAUTO BRK MAX');
    expect(memo(6, 2, false)).toBeNull();
  });

  it('shows no memo when nothing is selected (no undefined code)', () => {
    expect(autoBrakeMemoLine(7, 0, false)).toBeNull();
    expect(autoBrakeMemoLine(8, 0, false)).toBeNull();
  });

  it('shows the green AUTO BRK OFF when the autobrake is failed, in every flight phase', () => {
    for (const phase of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(memo(phase, 0, true)).toBe('\x1b<3mAUTO BRK OFF');
    }
  });

  it('gives no amber AUTO BRK OFF memo, aural or MASTER CAUT at an autobrake disarm', () => {
    const rig = startCruiseFwc();
    rig.simvars.set('L:A32NX_FWC_FLIGHT_PHASE', 7);
    rig.simvars.set('L:A32NX_AUTOBRAKES_ARMED_MODE', 2);
    rig.run(1);
    rig.simvars.set('L:A32NX_AUTOBRAKES_ARMED_MODE', 0);
    rig.run(2);
    expect(Object.values(rig.fwc.ewdMessageFailures).map((item) => item.codesToReturn[0])).not.toContain('320000001');
    expect(Object.values(rig.fwc.ewdMessageMemos).map((item) => item.codesToReturn[0])).not.toContain('320000001');
    expect(formatEwdMessages(['320000001'])).toEqual(['']);
    expect(rig.writes.get('L:A32NX_AUDIO_AUTOBRAKE_OFF')).toBeUndefined();
    expect(rig.writes.get('L:A32NX_MASTER_CAUTION')).toBeFalsy();
  });

  it('is the PseudoFWC AUTO BRK memo, from the BSCU autobrake fault', () => {
    const rig = startCruiseFwc();
    const memo = probedMemo(rig.fwc, '0000022');
    expect(memo.codesToReturn).toEqual(AUTO_BRK_MEMO_CODES);
    expect(memo.simVarIsActive.get()).toBe(false);

    rig.simvars.set('L:A32NX_BRAKES_AUTO_BRK_FAULT', 1);
    rig.run(1);
    expect(memo.simVarIsActive.get()).toBe(true);
    expect(shownLineText(memo)).toEqual(['AUTO BRK OFF']);

    rig.simvars.set('L:A32NX_BRAKES_AUTO_BRK_FAULT', 0);
    rig.simvars.set('L:A32NX_FWC_FLIGHT_PHASE', 7);
    rig.simvars.set('L:A32NX_AUTOBRAKES_ARMED_MODE', 3);
    rig.run(1);
    expect(shownLineText(memo)).toEqual(['AUTO BRK MAX']);
  });
});
