// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { EcamClearHistory, FlightPhaseInhibitOverride, recallAll } from './FwsRecall';
import { createFws } from './FwsSpecFixture';

/*
 * RCL LAST pb cancels the last CLEAR pb action on an alert. RCL pb brings back on the EWD every alert already performed
 * and still active and every still active not-sensed ABN PROC; with nothing to recall, NORMAL appears for 3 s.
 */
describe('RCL pb', () => {
  it('brings back every cleared alert still active at once (one per press before)', () => {
    expect(recallAll(['A', 'B', 'C'])).toEqual({ recalled: ['A', 'B', 'C'], showNormal: false });
  });

  it('shows NORMAL when there is no alert to recall', () => {
    expect(recallAll([])).toEqual({ recalled: [], showNormal: true });
  });
});

describe('RCL LAST pb', () => {
  const history = (...cleared: string[]) => {
    const h = new EcamClearHistory();
    cleared.forEach((key) => h.onCleared(key));
    return h;
  };

  it('brings back the alert of the last CLEAR action, not the oldest one', () => {
    expect(history('A', 'B', 'C').lastCleared(['A', 'B', 'C'])).toBe('C');
  });

  it('goes one CLEAR action further back on each press', () => {
    const h = history('A', 'B', 'C');
    h.forget('C'); // recalled by the first press
    expect(h.lastCleared(['A', 'B'])).toBe('B');
  });

  it('skips an alert that is no more active (design choice)', () => {
    expect(history('A', 'B', 'C').lastCleared(['A', 'B'])).toBe('B');
  });

  it('an alert cleared again is the last CLEAR action', () => {
    expect(history('A', 'B', 'A').lastCleared(['A', 'B'])).toBe('A');
  });

  it('does nothing when no CLEAR action can be cancelled', () => {
    expect(history('A').lastCleared([])).toBeUndefined();
    const reset = history('A');
    reset.reset();
    expect(reset.lastCleared(['A'])).toBeUndefined();
  });
});

describe('RCL / RCL LAST wiring', () => {
  it('the RCL LAST key of the ECP writes its own L:var', () => {
    // ecam-cp.xml cannot be loaded by vitest, so its source text is read
    const xml = readFileSync(
      resolve(
        __dirname,
        '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/behaviour/ecam-cp.xml',
      ),
      'utf-8',
    );
    const rclLast = xml.slice(xml.indexOf('<PART_ID>ECAM_RCLLAST</PART_ID>'), xml.indexOf('<!-- ECAM RCL -->'));
    expect(rclLast).toContain('<SIMVAR>A32NX_BTN_RCL_LAST</SIMVAR>');
  });

  /** Presses and releases a pb of the ECAM control panel, one FWS frame each */
  function pressAndRelease(core: ReturnType<typeof createFws>['core'], simVars: Map<string, any>, name: string): void {
    // The ECP is reachable on the AFDX network
    simVars.set('L:A32NX_AFDX_3_3_REACHABLE', 1);
    simVars.set(name, 1);
    core.update(1000);
    simVars.set(name, 0);
    core.update(1000);
  }

  it('the FWS brings back the alert of the last CLEAR action on RCL LAST', () => {
    const { core, simVars } = createFws(new Set());
    core.startupCompleted.set(true);
    core.recallFailures = ['A', 'B'];
    core.clearHistory.onCleared('A');
    core.clearHistory.onCleared('B');
    pressAndRelease(core, simVars, 'L:A32NX_BTN_RCL_LAST');
    expect(core.recallFailures).toEqual(['A']);
    expect(core.presentedFailures).toContain('B');
  });

  it('the FWS records the CLEAR actions', () => {
    const { core } = createFws(new Set());
    core.presentedFailures.push('X');
    core.abnormalSensed.activeProcedureId.set('X');
    core.abnormalSensed.clearActiveProcedure();
    expect(core.clearHistory.lastCleared(['X'])).toBe('X');
  });

  it('the FWS shows NORMAL for 3 s on RCL with nothing to recall', () => {
    const { core, simVars } = createFws(new Set());
    core.startupCompleted.set(true);
    const memo = core.memos.ewdMemos['000000001'];
    expect(memo.simVarIsActive).toBe(core.recallNormalMemo);
    pressAndRelease(core, simVars, 'L:A32NX_BTN_RCL');
    expect(core.recallNormalMemo.get()).toBe(true);
    core.update(1000);
    core.update(1000);
    core.update(1000);
    core.update(1000);
    expect(core.recallNormalMemo.get()).toBe(false);
  });

  it('only the long RCL press overrides the flight phase inhibition, for the alerts too', () => {
    const { core, simVars } = createFws(new Set());
    core.startupCompleted.set(true);
    simVars.set('L:A32NX_AFDX_3_3_REACHABLE', 1);
    simVars.set('L:A32NX_BTN_RCL', 1);
    core.update(1000);
    core.update(1000);
    expect(core.flightPhaseInhibitOverride.active).toBe(false);
    core.update(1000);
    core.update(1000);
    expect(core.flightPhaseInhibitOverride.active).toBe(true);
  });
});

/* RCL pressed for more than 3 s: the alerts inhibited by the current flight phase appear */
describe('RCL long press: flight phase inhibition override', () => {
  it('starts with the long press and lasts while the flight phase stays the same', () => {
    const override = new FlightPhaseInhibitOverride();
    expect(override.update(false, 3)).toBe(false);
    expect(override.update(true, 3)).toBe(true);
    expect(override.update(false, 3)).toBe(true);
  });

  it('ends when the flight phase changes (the old memory node never reset)', () => {
    const override = new FlightPhaseInhibitOverride();
    override.update(true, 3);
    expect(override.update(false, 4)).toBe(false);
    expect(override.update(false, 3)).toBe(false);
  });
});
