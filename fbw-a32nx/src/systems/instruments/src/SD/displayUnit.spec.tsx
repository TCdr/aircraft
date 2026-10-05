// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { describe, expect, it, vi } from 'vitest';

// The React instrument framework finds its root element (which receives the `update` events) when its module loads:
// create it before the display unit is imported (vi.hoisted runs before the imports).
vi.hoisted(() => {
  const root = document.createElement('div');
  const mount = document.createElement('div');
  mount.id = 'MSFS_REACT_MOUNT';
  root.appendChild(mount);
  document.body.appendChild(root);
});

import { DisplayUnit } from './displayUnit';

describe('SD display unit (React) failure', () => {
  it('goes blank when failed and runs its self-test when the failure is removed', () => {
    // not cold and dark, brightness up, powered
    const simVars: Record<string, number> = {
      'L:A32NX_COLD_AND_DARK_SPAWN': 0,
      'LIGHT POTENTIOMETER:93': 1,
      'L:TEST_DU_POWERED': 1,
    };
    // (the SDK imports replace the setup's SimVar mock, so the reader is stubbed here)
    const originalGetSimVarValue = SimVar.GetSimVarValue;
    SimVar.GetSimVarValue = ((name: string) => simVars[name] ?? 0) as typeof SimVar.GetSimVarValue;

    const container = document.createElement('div');
    const renderUnit = (failed: boolean) =>
      act(() => {
        ReactDOM.render(
          <DisplayUnit electricitySimvar="L:TEST_DU_POWERED" potentiometerIndex={93} normDmc={1} failed={failed}>
            <span id="sd-picture" />
          </DisplayUnit>,
          container,
        );
      });

    renderUnit(false);
    expect(container.querySelector('#sd-picture')).not.toBeNull();
    expect((container.querySelector('#sd-picture')?.parentElement as HTMLElement).style.display).toBe('block');

    // only the failed prop changes: the DU must still react
    renderUnit(true);
    expect(container.querySelector('#sd-picture')).toBeNull();
    expect(container.textContent).not.toContain('SELF TEST');

    // DU reconfiguration: the SD shown on another DU is drawn even with the lower ECAM DU failed
    act(() => {
      ReactDOM.render(
        <DisplayUnit electricitySimvar="L:TEST_DU_POWERED" potentiometerIndex={93} normDmc={1} failed shownOnOtherDu>
          <span id="sd-picture" />
        </DisplayUnit>,
        container,
      );
    });
    expect(container.querySelector('#sd-picture')).not.toBeNull();

    renderUnit(false);
    expect(container.textContent).toContain('SELF TEST IN PROGRESS');

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    SimVar.GetSimVarValue = originalGetSimVarValue;
  });
});
