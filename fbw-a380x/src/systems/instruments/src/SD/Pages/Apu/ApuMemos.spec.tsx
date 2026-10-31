// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';

// The React instrument framework finds its root element when its module loads: create it before the page is imported.
vi.hoisted(() => {
  const root = document.createElement('div');
  const mount = document.createElement('div');
  mount.id = 'MSFS_REACT_MOUNT';
  root.appendChild(mount);
  document.body.appendChild(root);
});

import { ApuMemos } from './ApuPage';

/** The APU memos of the SD APU page, drawn from the given simulator variables */
function renderMemos(simVars: Record<string, number>): SVGTextElement[] {
  const originalGetSimVarValue = SimVar.GetSimVarValue;
  SimVar.GetSimVarValue = ((name: string) => simVars[name] ?? 0) as unknown as typeof SimVar.GetSimVarValue;
  const container = document.createElement('div');
  try {
    act(() => {
      ReactDOM.render(<ApuMemos x={0} y={0} />, container);
    });
    return Array.from(container.querySelectorAll('text'));
  } finally {
    ReactDOM.unmountComponentAtNode(container);
    SimVar.GetSimVarValue = originalGetSimVarValue;
  }
}

const lowOilLevelWord = (value: number, ssm: Arinc429SignStatusMatrix) => ({
  'L:A32NX_APU_LOW_OIL_LEVEL': Arinc429Word.getRawWord(value, ssm),
});

describe('APU page OIL LVL LO memo', () => {
  it('pulses in green when the ECB word reports a low oil level', () => {
    const memos = renderMemos(lowOilLevelWord(1, Arinc429SignStatusMatrix.NormalOperation));
    const oilMemo = memos.find((text) => text.textContent === 'OIL LVL LO');
    expect(oilMemo?.getAttribute('class')).toContain('FillPulse');
    expect(oilMemo?.getAttribute('class')).toContain('Green');
  });

  it('is not drawn with a normal oil quantity', () => {
    const memos = renderMemos(lowOilLevelWord(0, Arinc429SignStatusMatrix.NormalOperation));
    expect(memos.map((text) => text.textContent)).not.toContain('OIL LVL LO');
  });

  it('is not drawn when the word is not valid, whatever its value', () => {
    const memos = renderMemos(lowOilLevelWord(1, Arinc429SignStatusMatrix.NoComputedData));
    expect(memos.map((text) => text.textContent)).not.toContain('OIL LVL LO');
  });
});
