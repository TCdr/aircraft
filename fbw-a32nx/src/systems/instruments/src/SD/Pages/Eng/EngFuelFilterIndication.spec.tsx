// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { describe, expect, it, vi } from 'vitest';

// The React instrument framework finds its root element when its module loads: create it before the page is imported.
vi.hoisted(() => {
  const root = document.createElement('div');
  const mount = document.createElement('div');
  mount.id = 'MSFS_REACT_MOUNT';
  root.appendChild(mount);
  document.body.appendChild(root);
});

import { EngPage } from './Eng';
import { fuelFilterClogShown } from './EngFuelFilterIndication';

/* Fuel filter CLOG indication */
describe('SD ENGINE fuel filter CLOG', () => {
  it('shows CLOG with a clogged filter on a running engine', () => {
    expect(fuelFilterClogShown(true, 1)).toBe(true);
  });

  it('does not show CLOG on an engine that is not running, nor without the failure', () => {
    expect(fuelFilterClogShown(true, 0)).toBe(false);
    expect(fuelFilterClogShown(true, 2)).toBe(false);
    expect(fuelFilterClogShown(false, 1)).toBe(false);
  });

  it('draws CLOG below the fuel used of each engine from its own fuel filter failure and engine state', () => {
    const simVars: Record<string, number> = {
      'L:A32NX_ENGINE_1_FUEL_FILTER_CLOGGED': 1,
      'L:A32NX_ENGINE_STATE:1': 1,
      // engine 2 clogged but shut down: no CLOG
      'L:A32NX_ENGINE_2_FUEL_FILTER_CLOGGED': 1,
      'L:A32NX_ENGINE_STATE:2': 0,
    };
    const originalGetSimVarValue = SimVar.GetSimVarValue;
    SimVar.GetSimVarValue = ((name: string) => simVars[name] ?? 0) as unknown as typeof SimVar.GetSimVarValue;
    const container = document.createElement('div');
    try {
      act(() => {
        ReactDOM.render(<EngPage />, container);
      });
      // only the fuel filter simvars are set, so the visible CLOG is a fuel filter one (the oil filter CLOG has the same text)
      const visibleClogs = Array.from(container.querySelectorAll('text')).filter(
        (text) => text.textContent === 'CLOG' && !text.classList.contains('Hidden'),
      );
      expect(visibleClogs.length).toBe(1);
      const clog = visibleClogs[0];
      // below the fuel used of the same column
      const fuelUsed = clog.previousElementSibling;
      expect(fuelUsed?.textContent).toBe('0');
      expect(clog.getAttribute('x')).toBe(fuelUsed?.getAttribute('x'));
      expect(Number(clog.getAttribute('y'))).toBeGreaterThan(Number(fuelUsed?.getAttribute('y')));
    } finally {
      ReactDOM.unmountComponentAtNode(container);
      SimVar.GetSimVarValue = originalGetSimVarValue;
    }
  });
});
