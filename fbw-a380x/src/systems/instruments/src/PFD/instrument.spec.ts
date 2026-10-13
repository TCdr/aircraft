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

// The PFD itself is not under test: the mock tells whether the gauge started (rendered) the PFD. Its getDisplayIndex
// (read by the PFD's ARINC value provider when the gauge starts) is the real one.
const renderedPfd = vi.hoisted(() => vi.fn());
vi.mock('./PFD', async () => {
  const { DisplayComponent, FSComponent } =
    await vi.importActual<typeof import('@microsoft/msfs-sdk')>('@microsoft/msfs-sdk');
  const { getDisplayIndex } =
    await vi.importActual<typeof import('./shared/PfdDisplayIndex')>('./shared/PfdDisplayIndex');
  return {
    getDisplayIndex,
    PFDComponent: class extends DisplayComponent<unknown> {
      render() {
        renderedPfd();
        return FSComponent.buildComponent('div', null);
      }
    },
  };
});

/** The PFD gauge element (A380X_PFD, a BaseInstrument) */
type PfdGauge = HTMLElement & { Update(): void };

/** The EFIS side whose FMS data (L:A32NX_EFIS_<side>_..., L:A32NX_FMGC_<side>_RNP) a PFD gauge reads */
function fmsDataSideOf(pfd: PfdGauge): string {
  return (
    pfd as unknown as { fmsDataPublisher: { stateSubject: { get(): string } } }
  ).fmsDataPublisher.stateSubject.get();
}

/** panel.cfg [VCockpit08]: the F/O ND and the two weather radar WASM gauges, before the hosted PFD */
const FO_ND_DU_GAUGES: [string, string][] = [
  ['a380x-nd', `${A380X_GAUGE_URL_PREFIX}ND/nd.html?Index=2?duID=4`],
  [
    'wasm-instrument',
    'coui://html_ui/Pages/VCockpit/Instruments/WasmInstrument/WasmInstrument.html?wasm_module=ndwxr.wasm&wasm_gauge=ndwxr',
  ],
  [
    'wasm-instrument',
    'coui://html_ui/Pages/VCockpit/Instruments/WasmInstrument/WasmInstrument.html?wasm_module=ndwxr.wasm&wasm_gauge=ndwxr',
  ],
];

describe('A380X PFD gauge', () => {
  beforeEach(() => {
    useSimVarStore();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    renderedPfd.mockClear();
  });

  it('keeps the hosted PFD on the CAPT ND DU hidden and not started while the DU shows the ND', () => {
    // panel.cfg [VCockpit07]: the ND and the two weather radar WASM gauges, then the hosted PFD
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
    ]);
    addGaugeTemplate('A380X_PFD', 'PFD_CONTENT');
    const pfd = addGauge<PfdGauge>(
      panel,
      'a380x-pfd',
      `${A380X_GAUGE_URL_PREFIX}PFD/pfd-hosted.html?Index=1&hostDu=1&duID=0`,
    );
    pfd.Update();

    const mount = document.getElementById('PFD_CONTENT')!;
    expect(mount.style.display).toBe('none');
    expect(pfd.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(true);
    expect(renderedPfd).not.toHaveBeenCalled();

    // the systems host puts the PFD on the ND DU (PFD DU lost, or PFD/ND pb): started and shown
    SimVar.SetSimVarValue('L:A380X_CDS_CAPT_ND_DU_DISPLAY', 'number', CdsDisplay.Pfd);
    pfd.Update();
    expect(renderedPfd).toHaveBeenCalledTimes(1);
    expect(mount.style.display).toBe('block');
    expect(pfd.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(false);
  });

  it("starts the PFD DU's own gauge at once", () => {
    // panel.cfg [VCockpit05]: the PFD first, then the hosted ND (not created here)
    const panel = createPanel([]);
    addGaugeTemplate('A380X_PFD', 'PFD_CONTENT');
    const pfd = addGauge<PfdGauge>(panel, 'a380x-pfd', `${A380X_GAUGE_URL_PREFIX}PFD/pfd.html?Index=1&duID=0`);

    expect(renderedPfd).toHaveBeenCalledTimes(1);
    expect(document.getElementById('PFD_CONTENT')!.style.display).toBe('');
    expect(pfd.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(false);
  });

  // The PFD/ND DU pairs: the CAPT PFD (duID 0) reads the CAPT (L) EFIS side, the F/O PFD (duID 3) the F/O (R) side
  it('reads the FMS data of the CAPT side on the CAPT PFD', () => {
    const panel = createPanel([]);
    addGaugeTemplate('A380X_PFD', 'PFD_CONTENT');
    const pfd = addGauge<PfdGauge>(panel, 'a380x-pfd', `${A380X_GAUGE_URL_PREFIX}PFD/pfd.html?Index=1&duID=0`);

    expect(fmsDataSideOf(pfd)).toBe('L');
  });

  it('reads the FMS data of the F/O side on the F/O PFD', () => {
    const panel = createPanel([]);
    addGaugeTemplate('A380X_PFD', 'PFD_CONTENT');
    const pfd = addGauge<PfdGauge>(panel, 'a380x-pfd', `${A380X_GAUGE_URL_PREFIX}PFD/pfd.html?Index=2&duID=3`);

    expect(fmsDataSideOf(pfd)).toBe('R');
  });

  it('reads the FMS data of the CAPT side on the CAPT PFD drawn on the CAPT ND DU', () => {
    const panel = createPanel([
      ['a380x-nd', `${A380X_GAUGE_URL_PREFIX}ND/nd.html?Index=1&duID=1`],
      [
        'wasm-instrument',
        'coui://html_ui/Pages/VCockpit/Instruments/WasmInstrument/WasmInstrument.html?wasm_module=ndwxr.wasm&wasm_gauge=ndwxr',
      ],
    ]);
    addGaugeTemplate('A380X_PFD', 'PFD_CONTENT');
    const pfd = addGauge<PfdGauge>(
      panel,
      'a380x-pfd',
      `${A380X_GAUGE_URL_PREFIX}PFD/pfd-hosted.html?Index=1&hostDu=1&duID=0`,
    );

    expect(fmsDataSideOf(pfd)).toBe('L');
  });

  it('reads the FMS data of the F/O side on the F/O PFD drawn on the F/O ND DU', () => {
    const panel = createPanel(FO_ND_DU_GAUGES);
    addGaugeTemplate('A380X_PFD', 'PFD_CONTENT');
    const pfd = addGauge<PfdGauge>(
      panel,
      'a380x-pfd',
      `${A380X_GAUGE_URL_PREFIX}PFD/pfd-hosted.html?Index=2&hostDu=4&duID=3`,
    );

    expect(fmsDataSideOf(pfd)).toBe('R');
  });
});
