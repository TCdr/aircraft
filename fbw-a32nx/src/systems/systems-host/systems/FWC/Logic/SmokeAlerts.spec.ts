// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  AFT_CRG_DET_FAULT_INOP_SYS,
  cargoSmokeLines,
  FWD_CRG_DET_FAULT_INOP_SYS,
  SmokeAlertInputs,
  smokeAlerts,
} from './SmokeAlerts';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';

const text = (prefix: string, lines: (number | null)[]) =>
  formatEwdMessages(
    lines
      .filter((line): line is number => line !== null)
      .map((line) => `${prefix}${(line + 1).toString().padStart(2, '0')}`),
  ).join(' | ');

const healthy: SmokeAlertInputs = {
  fwdCargoSmokeDetected: false,
  aftCargoSmokeDetected: false,
  avionicsSmokeDetected: false,
  cargoSmokeTest: false,
  fwdCargoDetectionFault: false,
  aftCargoDetectionFault: false,
  cargoBottleLowPressure: false,
};

/* A320 FCOM PRO-ABN-SMOKE (a320_fcom.txt l.95111-95392) and PRO-ABN-AVNCS AVIONICS SMOKE (l.72100-72120) */
describe('cargo and avionics smoke alerts', () => {
  it('no alert when healthy', () => {
    expect(Object.values(smokeAlerts(healthy)).some((alert) => alert)).toBe(false);
  });

  it('FWD CARGO SMOKE from the detection (l.95244-95250), and from the CARGO SMOKE TEST as before', () => {
    expect(smokeAlerts({ ...healthy, fwdCargoSmokeDetected: true }).fwdCargoSmoke).toBe(true);
    expect(smokeAlerts({ ...healthy, fwdCargoSmokeDetected: true }).aftCargoSmoke).toBe(false);
    expect(smokeAlerts({ ...healthy, cargoSmokeTest: true }).fwdCargoSmoke).toBe(true);
  });

  it('AFT CARGO SMOKE from the AFT detection (l.95111-95117)', () => {
    expect(smokeAlerts({ ...healthy, aftCargoSmokeDetected: true }).aftCargoSmoke).toBe(true);
    expect(smokeAlerts({ ...healthy, aftCargoSmokeDetected: true }).fwdCargoSmoke).toBe(false);
  });

  it('FWD (AFT) CRG DET FAULT when the detection of that compartment is failed (l.95203-95214, l.95378-95384)', () => {
    const fwd = smokeAlerts({ ...healthy, fwdCargoDetectionFault: true });
    expect([fwd.fwdCrgDetFault, fwd.aftCrgDetFault]).toEqual([true, false]);
    const aft = smokeAlerts({ ...healthy, aftCargoDetectionFault: true });
    expect([aft.fwdCrgDetFault, aft.aftCrgDetFault]).toEqual([false, true]);
  });

  it('FWD and AFT CRG BTL 1 FAULT when the single bottle is at low pressure (l.95345-95358)', () => {
    const alerts = smokeAlerts({ ...healthy, cargoBottleLowPressure: true });
    expect([alerts.fwdCrgBtlFault, alerts.aftCrgBtlFault]).toEqual([true, true]);
  });

  it('AVIONICS SMOKE from the avionics duct detector (l.72102-72108)', () => {
    expect(smokeAlerts({ ...healthy, avionicsSmokeDetected: true }).avionicsSmoke).toBe(true);
  });

  it('AFT CARGO SMOKE lines in flight: CAB FANS OFF, AGENT DISCH, then WHEN ON GROUND BEFORE OPEN CRG DOORS: PAX DISEMBARK', () => {
    expect(
      text('2600160', cargoSmokeLines({ cabFansOn: true, flightPhase: 6, agentDischarged: false, onGround: false })),
    ).toBe(
      '\x1b<2m\x1b4mSMOKE\x1bm AFT CARGO SMOKE | \x1b<5m -CAB FANS...........OFF | \x1b<5m -AGENT............DISCH | ' +
        '\x1b<7m  .WHEN ON GROUND: | \x1b<7m BEFORE OPEN CRG DOORS: | \x1b<5m -PAX..........DISEMBARK',
    );
  });

  it('cargo smoke lines on ground: IF CARG CLOSED in phases 1 and 10, the AGENT line goes once discharged', () => {
    expect(
      text('2600150', cargoSmokeLines({ cabFansOn: false, flightPhase: 10, agentDischarged: false, onGround: true })),
    ).toBe(
      '\x1b<2m\x1b4mSMOKE\x1bm FWD CARGO SMOKE | \x1b<7m  .IF FWD CARG CLOSED: | \x1b<5m -AGENT............DISCH | ' +
        '\x1b<7m .BEFORE OPEN CRG DOORS: | \x1b<5m -PAX..........DISEMBARK',
    );
    expect(
      text('2600150', cargoSmokeLines({ cabFansOn: false, flightPhase: 10, agentDischarged: true, onGround: true })),
    ).toBe(
      '\x1b<2m\x1b4mSMOKE\x1bm FWD CARGO SMOKE | \x1b<7m .BEFORE OPEN CRG DOORS: | \x1b<5m -PAX..........DISEMBARK',
    );
  });

  it('the caution titles', () => {
    // One at a time: formatEwdMessages blanks the group of consecutive lines of the same group
    expect(
      ['260017001', '260018001', '260019001', '260019101', '260030001', '260030002'].map(
        (code) => formatEwdMessages([code])[0],
      ),
    ).toEqual([
      '\x1b<4m\x1b4mSMOKE\x1bm FWD CRG DET FAULT',
      '\x1b<4m\x1b4mSMOKE\x1bm AFT CRG DET FAULT',
      '\x1b<4m\x1b4mSMOKE\x1bm FWD CRG BTL 1 FAULT',
      '\x1b<4m\x1b4mSMOKE\x1bm AFT CRG BTL 1 FAULT',
      '\x1b<4m\x1b4mAVIONICS SMOKE\x1bm',
      '\x1b<5m -SMOKE/FUMES PROC.APPLY',
    ]);
  });

  it('STATUS INOP SYS FWD (AFT) CRG DET (l.95236-95240, l.95388-95392)', () => {
    expect(formatStatusPage([], FWD_CRG_DET_FAULT_INOP_SYS).right).toBe(
      '\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mFWD CRG DET',
    );
    expect(formatStatusPage([], AFT_CRG_DET_FAULT_INOP_SYS).right).toBe(
      '\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mAFT CRG DET',
    );
  });

  it('reads the variables that systems.wasm writes and wires every alert', () => {
    const smokeDetection = readFileSync(
      resolve(
        __dirname,
        '../../../../../../../fbw-common/src/wasm/systems/systems/src/fire_protection/smoke_detection.rs',
      ),
      'utf8',
    );
    expect(smokeDetection).toContain('format!("SMOKE_{}_DETECTED", zone)');
    expect(smokeDetection).toContain('format!("SMOKE_{}_DET_FAULT", zone)');
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf8');
    for (const variable of [
      'SMOKE_FWD_CARGO_DETECTED',
      'SMOKE_AFT_CARGO_DETECTED',
      'SMOKE_AVIONICS_DETECTED',
      'SMOKE_FWD_CARGO_DET_FAULT',
      'SMOKE_AFT_CARGO_DET_FAULT',
      'CARGOSMOKE_BOTTLE_1_LOW_PRESSURE',
    ]) {
      expect(fwc).toContain(`'L:A32NX_${variable}'`);
    }
    for (const [id, subject] of [
      ['2600150', 'fwdCargoSmoke'],
      ['2600160', 'aftCargoSmoke'],
      ['2600170', 'fwdCrgDetFault'],
      ['2600180', 'aftCrgDetFault'],
      ['2600190', 'fwdCrgBtlFault'],
      ['2600191', 'aftCrgBtlFault'],
      ['2600300', 'avionicsSmoke'],
    ]) {
      const start = fwc.indexOf(`    ${id}: {`);
      expect(start, id).toBeGreaterThan(0);
      const block = fwc.slice(start, fwc.indexOf('\n    },', start));
      expect(block).toContain(`simVarIsActive: this.${subject},`);
    }
  });
});
