// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CdsDisplay } from '@shared/CdsReconfiguration';
import { HIDDEN_HOSTED_GAUGE_CLASS } from '../MsfsAvionicsCommon/HostedDisplay';
// the harness first: it puts the sim globals the gauge module uses when it is loaded
import {
  A380X_GAUGE_URL_PREFIX,
  addGauge,
  addGaugeTemplate,
  createPanel,
  useSimVarStore,
} from '../MsfsAvionicsCommon/test/SimGaugePanel';
import './instrument';

vi.setConfig({ testTimeout: 60_000 });

// The EWD itself is not under test: the mock tells whether the gauge started (rendered) the EWD
const renderedEwd = vi.hoisted(() => vi.fn());
vi.mock('./EWD', async () => {
  const { DisplayComponent, FSComponent } =
    await vi.importActual<typeof import('@microsoft/msfs-sdk')>('@microsoft/msfs-sdk');
  return {
    EngineWarningDisplay: class extends DisplayComponent<unknown> {
      render() {
        renderedEwd();
        return FSComponent.buildComponent('div', null);
      }
    },
  };
});

/** The EWD gauge element (A380X_EWD, a BaseInstrument) */
type EwdGauge = HTMLElement & { Update(): void };

describe('A380X EWD gauge', () => {
  beforeEach(() => {
    useSimVarStore();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    renderedEwd.mockClear();
  });

  it('keeps the hosted EWD on the SD DU hidden and not started while the SD DU shows the SD', () => {
    // panel.cfg [VCockpit04]: the SD's own gauges, then the hosted EWD (2026-10-10 sim diagnostic: its EWD_CONTENT had
    // no display set, the gate never ran its hide step)
    const panel = createPanel([
      ['a380x-sd', `${A380X_GAUGE_URL_PREFIX}SD/sd.html?duID=7`],
      ['a380x-sdv2', `${A380X_GAUGE_URL_PREFIX}SDv2/sdv2.html?duID=7`],
    ]);
    addGaugeTemplate('A380X_EWD', 'EWD_CONTENT');
    const ewd = addGauge<EwdGauge>(panel, 'a380x-ewd', `${A380X_GAUGE_URL_PREFIX}EWD/ewd-hosted.html?hostDu=7&duID=6`);
    ewd.Update();

    const mount = document.getElementById('EWD_CONTENT')!;
    expect(mount.style.display).toBe('none');
    expect(ewd.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(true);
    expect(renderedEwd).not.toHaveBeenCalled();

    // the systems host puts the EWD on the SD DU (EWD DU lost): started and shown
    SimVar.SetSimVarValue('L:A380X_CDS_SD_DU_DISPLAY', 'number', CdsDisplay.Ewd);
    ewd.Update();
    expect(renderedEwd).toHaveBeenCalledTimes(1);
    expect(mount.style.display).toBe('block');
    expect(ewd.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(false);

    // back to the SD: hidden again
    SimVar.SetSimVarValue('L:A380X_CDS_SD_DU_DISPLAY', 'number', 0);
    ewd.Update();
    expect(mount.style.display).toBe('none');
    expect(ewd.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(true);
  });

  it('keeps the hosted EWD on an ND DU hidden and not started while the ND DU shows the ND', () => {
    // panel.cfg [VCockpit07]: the ND, the two weather radar WASM gauges, the hosted PFD, then the hosted EWD
    const panel = createPanel([
      ['a380x-nd', `${A380X_GAUGE_URL_PREFIX}ND/nd.html?Index=1&duID=1`],
      [
        'wasm-instrument',
        'coui://html_ui/Pages/VCockpit/Instruments/WasmInstrument/WasmInstrument.html?wasm_module=ndwxr.wasm&wasm_gauge=ndwxr',
      ],
      [
        'wasm-instrument',
        'coui://html_ui/Pages/VCockpit/Instruments/WasmInstrument/WasmInstrument.html?wasm_module=ndwxr.wasm&wasm_gauge=ndwxr',
      ],
      ['a380x-pfd', `${A380X_GAUGE_URL_PREFIX}PFD/pfd-hosted.html?Index=1&hostDu=1&duID=0`],
    ]);
    addGaugeTemplate('A380X_EWD', 'EWD_CONTENT');
    const ewd = addGauge<EwdGauge>(panel, 'a380x-ewd', `${A380X_GAUGE_URL_PREFIX}EWD/ewd-hosted.html?hostDu=1&duID=6`);
    ewd.Update();

    expect(document.getElementById('EWD_CONTENT')!.style.display).toBe('none');
    expect(ewd.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(true);
    expect(renderedEwd).not.toHaveBeenCalled();
  });

  it("starts the EWD DU's own gauge at once", () => {
    // panel.cfg [VCockpit03]: the EWD alone
    const panel = createPanel([]);
    addGaugeTemplate('A380X_EWD', 'EWD_CONTENT');
    const ewd = addGauge<EwdGauge>(panel, 'a380x-ewd', `${A380X_GAUGE_URL_PREFIX}EWD/ewd.html?duID=6`);

    expect(renderedEwd).toHaveBeenCalledTimes(1);
    expect(document.getElementById('EWD_CONTENT')!.style.display).toBe('');
    expect(ewd.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(false);
  });
});
