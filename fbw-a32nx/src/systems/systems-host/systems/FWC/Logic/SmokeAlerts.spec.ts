// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AFT_CRG_DET_FAULT_INOP_SYS,
  cargoSmokeLines,
  FWD_CRG_DET_FAULT_INOP_SYS,
  SmokeAlertInputs,
  smokeAlerts,
} from './SmokeAlerts';
import { isAlertTriggered, startCruiseFwc } from '../FwcAlertProbe';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the real PseudoFWC reads (by name) */
let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

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

describe('cargo and avionics smoke alerts', () => {
  it('no alert when healthy', () => {
    expect(Object.values(smokeAlerts(healthy)).some((alert) => alert)).toBe(false);
  });

  it('FWD CARGO SMOKE from the detection, and from the CARGO SMOKE TEST as before', () => {
    expect(smokeAlerts({ ...healthy, fwdCargoSmokeDetected: true }).fwdCargoSmoke).toBe(true);
    expect(smokeAlerts({ ...healthy, fwdCargoSmokeDetected: true }).aftCargoSmoke).toBe(false);
    expect(smokeAlerts({ ...healthy, cargoSmokeTest: true }).fwdCargoSmoke).toBe(true);
  });

  it('AFT CARGO SMOKE from the AFT detection', () => {
    expect(smokeAlerts({ ...healthy, aftCargoSmokeDetected: true }).aftCargoSmoke).toBe(true);
    expect(smokeAlerts({ ...healthy, aftCargoSmokeDetected: true }).fwdCargoSmoke).toBe(false);
  });

  it('FWD (AFT) CRG DET FAULT when the detection of that compartment is failed', () => {
    const fwd = smokeAlerts({ ...healthy, fwdCargoDetectionFault: true });
    expect([fwd.fwdCrgDetFault, fwd.aftCrgDetFault]).toEqual([true, false]);
    const aft = smokeAlerts({ ...healthy, aftCargoDetectionFault: true });
    expect([aft.fwdCrgDetFault, aft.aftCrgDetFault]).toEqual([false, true]);
  });

  it('FWD and AFT CRG BTL 1 FAULT when the single bottle is at low pressure', () => {
    const alerts = smokeAlerts({ ...healthy, cargoBottleLowPressure: true });
    expect([alerts.fwdCrgBtlFault, alerts.aftCrgBtlFault]).toEqual([true, true]);
  });

  it('AVIONICS SMOKE from the avionics duct detector', () => {
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

  it('STATUS INOP SYS FWD (AFT) CRG DET', () => {
    expect(formatStatusPage([], FWD_CRG_DET_FAULT_INOP_SYS).right).toBe(
      '\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mFWD CRG DET',
    );
    expect(formatStatusPage([], AFT_CRG_DET_FAULT_INOP_SYS).right).toBe(
      '\x1b<7m\x1b4mINOP SYS\x1bm\r\x1b<4mAFT CRG DET',
    );
  });

  // The variables systems.wasm writes (smoke_detection.rs): the FWC reads them by name
  it('systems.wasm writes the smoke detection variables', () => {
    const smokeDetection = readFileSync(
      resolve(
        __dirname,
        '../../../../../../../fbw-common/src/wasm/systems/systems/src/fire_protection/smoke_detection.rs',
      ),
      'utf8',
    );
    expect(smokeDetection).toContain('format!("SMOKE_{}_DETECTED", zone)');
    expect(smokeDetection).toContain('format!("SMOKE_{}_DET_FAULT", zone)');
  });

  it('the real PseudoFWC raises each alert from its smoke detection simvar', () => {
    const simvarToAlert: [string, string][] = [
      ['L:A32NX_SMOKE_FWD_CARGO_DETECTED', '2600150'],
      ['L:A32NX_SMOKE_AFT_CARGO_DETECTED', '2600160'],
      ['L:A32NX_SMOKE_FWD_CARGO_DET_FAULT', '2600170'],
      ['L:A32NX_SMOKE_AFT_CARGO_DET_FAULT', '2600180'],
      ['L:A32NX_CARGOSMOKE_BOTTLE_1_LOW_PRESSURE', '2600190'],
      ['L:A32NX_CARGOSMOKE_BOTTLE_1_LOW_PRESSURE', '2600191'],
      ['L:A32NX_SMOKE_AVIONICS_DETECTED', '2600300'],
    ];
    const fwc = startCruiseFwc(simvars, undefined, 1).fwc;
    for (const [simvar, alertKey] of simvarToAlert) {
      expect(isAlertTriggered(fwc, alertKey), `${alertKey} before`).toBe(false);
      simvars.set(simvar, 1);
      runFwc(fwc, 1);
      expect(isAlertTriggered(fwc, alertKey), `${alertKey} from ${simvar}`).toBe(true);
      simvars.set(simvar, 0);
      runFwc(fwc, 1);
    }
  });
});
