// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The React instrument framework finds its root element when its module loads: create it before anything is imported.
vi.hoisted(() => {
  const root = document.createElement('div');
  const mount = document.createElement('div');
  mount.id = 'MSFS_REACT_MOUNT';
  root.appendChild(mount);
  document.body.appendChild(root);
});

import { dcduKeyEvent, dcduKeyWorks } from './DcduFailures';
import { Button } from './elements/Button';

/* The DCDU 1 and DCDU 2 flyPad failures: one DCDU on each side */
describe('DCDU failures', () => {
  const noFailure = { dcdu1Failed: false, dcdu2Failed: false };

  it('the keys of a failed DCDU do nothing, the other DCDU keeps working', () => {
    expect(dcduKeyWorks('MPL', noFailure)).toBe(true);
    expect(dcduKeyWorks('MPR', noFailure)).toBe(true);
    expect(dcduKeyWorks('MPL', { ...noFailure, dcdu1Failed: true })).toBe(false);
    expect(dcduKeyWorks('MPR', { ...noFailure, dcdu1Failed: true })).toBe(true);
    expect(dcduKeyWorks('MPL', { ...noFailure, dcdu2Failed: true })).toBe(true);
    expect(dcduKeyWorks('MPR', { ...noFailure, dcdu2Failed: true })).toBe(false);
  });

  it('names the key events of the cockpit model', () => {
    expect(dcduKeyEvent('MPL', 'PRINT')).toBe('A32NX_DCDU_BTN_MPL_PRINT');
    expect(dcduKeyEvent('MPR', 'L1')).toBe('A32NX_DCDU_BTN_MPR_L1');
  });

  describe('in the DCDU gauge', () => {
    const simVars: Record<string, number> = {};
    const originalGetSimVarValue = SimVar.GetSimVarValue;
    const mount = document.getElementById('MSFS_REACT_MOUNT') as HTMLElement;

    beforeEach(() => {
      vi.useFakeTimers();
      for (const name of Object.keys(simVars)) {
        delete simVars[name];
      }
      SimVar.GetSimVarValue = ((name: string) => simVars[name] ?? 0) as unknown as typeof SimVar.GetSimVarValue;
    });

    afterEach(() => {
      ReactDOM.unmountComponentAtNode(mount);
      SimVar.GetSimVarValue = originalGetSimVarValue;
      vi.useRealTimers();
    });

    /** Presses a key and returns how often the key action ran (a Button runs it 1 s after the press) */
    function pressButtonKey(event: string): number {
      const onClick = vi.fn();
      act(() => {
        ReactDOM.render(<Button messageId={1} index="L1" content="WILCO" active onClick={onClick} />, mount);
      });
      act(() => {
        (mount.parentElement as HTMLElement).dispatchEvent(new CustomEvent(event));
      });
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      return onClick.mock.calls.length;
    }

    it('a key of a working DCDU runs its action, from both sides', () => {
      expect(pressButtonKey('A32NX_DCDU_BTN_MPL_L1')).toBe(1);
      expect(pressButtonKey('A32NX_DCDU_BTN_MPR_L1')).toBe(1);
    });

    it('a key of a failed DCDU does nothing while the other DCDU keeps working', () => {
      simVars['L:A32NX_DCDU_1_FAILED'] = 1;
      expect(pressButtonKey('A32NX_DCDU_BTN_MPL_L1')).toBe(0);
      expect(pressButtonKey('A32NX_DCDU_BTN_MPR_L1')).toBe(1);

      simVars['L:A32NX_DCDU_1_FAILED'] = 0;
      simVars['L:A32NX_DCDU_2_FAILED'] = 1;
      expect(pressButtonKey('A32NX_DCDU_BTN_MPL_L1')).toBe(1);
      expect(pressButtonKey('A32NX_DCDU_BTN_MPR_L1')).toBe(0);
    });

    it('shows INVALID DATA in place of the messages while the ATSU is off', async () => {
      simVars['L:A32NX_ELEC_DC_1_BUS_IS_POWERED'] = 1;
      simVars['L:A32NX_ATSU_OFF'] = 1;
      await act(async () => {
        await import('./index');
      });
      expect(mount.textContent).toContain('INVALID DATA');
    }, 60_000);
  });
});
