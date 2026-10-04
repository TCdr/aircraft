// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisplayUnitID } from '@shared/CdsDisplayUnits';
import { CdsDisplay } from '@shared/CdsReconfiguration';
import { findInstrumentUrl, HostedDisplayGate, parseHostDisplayUnit } from './HostedDisplay';

/** A document like the one of a panel.cfg block: the DU's own gauge, WASM gauges, then the hosted gauge */
function setUpPanel(urls: [string, string][]): void {
  const panel = document.createElement('vcockpit-panel');
  for (const [tag, url] of urls) {
    const gauge = document.createElement(tag);
    gauge.setAttribute('url', url);
    panel.appendChild(gauge);
  }
  const mount = document.createElement('div');
  mount.id = 'PFD_CONTENT';
  document.body.append(panel, mount);
}

describe('hosted display gauges (CDS reconfiguration)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reads the DU of a hosted gauge from its URL', () => {
    expect(parseHostDisplayUnit('A380X/PFD/pfd-hosted.html?Index=1&hostDu=1&duID=0')).toBe(DisplayUnitID.CaptNd);
    expect(parseHostDisplayUnit('A380X/EWD/ewd-hosted.html?hostDu=7&duID=6')).toBe(DisplayUnitID.Sd);
    expect(parseHostDisplayUnit('A380X/PFD/pfd.html?Index=1&duID=0')).toBeNull();
    expect(parseHostDisplayUnit(null)).toBeNull();
    expect(parseHostDisplayUnit('A380X/PFD/pfd-hosted.html?hostDu=9&duID=0')).toBeNull();
  });

  it("finds the instrument's own gauge in a shared document", () => {
    setUpPanel([
      ['a380x-nd', 'A380X/ND/nd.html?Index=1&duID=1'],
      ['wasm-instrument', 'WasmInstrument/WasmInstrument.html?wasm_module=ndwxr.wasm&wasm_gauge=ndwxr'],
      ['a380x-pfd', 'A380X/PFD/pfd-hosted.html?Index=1&hostDu=1&duID=0'],
    ]);
    expect(findInstrumentUrl('PFD')).toBe('A380X/PFD/pfd-hosted.html?Index=1&hostDu=1&duID=0');
    expect(findInstrumentUrl('ND')).toBe('A380X/ND/nd.html?Index=1&duID=1');
    // no gauge of that folder: the first gauge, as before
    expect(findInstrumentUrl('EWD')).toBe('A380X/ND/nd.html?Index=1&duID=1');
  });

  it('starts a hosted gauge only when its display is shown, and hides it otherwise', () => {
    setUpPanel([['a380x-pfd', 'A380X/PFD/pfd-hosted.html?Index=1&hostDu=1&duID=0']]);
    const start = vi.fn();
    const gate = new HostedDisplayGate(DisplayUnitID.CaptNd, CdsDisplay.Pfd, 'PFD_CONTENT', start);
    const mount = document.getElementById('PFD_CONTENT')!;

    expect(gate.update()).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(mount.style.display).toBe('none');

    SimVar.SetSimVarValue('L:A380X_CDS_CAPT_ND_DU_DISPLAY', 'number', CdsDisplay.Pfd);
    expect(gate.update()).toBe(true);
    expect(gate.update()).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(mount.style.display).toBe('block');

    SimVar.SetSimVarValue('L:A380X_CDS_CAPT_ND_DU_DISPLAY', 'number', 0);
    expect(gate.update()).toBe(false);
    expect(mount.style.display).toBe('none');
    expect(start).toHaveBeenCalledTimes(1);
  });
});
