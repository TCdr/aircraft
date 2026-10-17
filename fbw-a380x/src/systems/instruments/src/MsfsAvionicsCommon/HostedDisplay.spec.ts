// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_DISPLAY_UNITS, DisplayUnitID } from '@shared/CdsDisplayUnits';
import { CdsDisplay, DRAWN_DISPLAYS, normalDisplayOf } from '@shared/CdsReconfiguration';
import { findInstrumentUrl, HIDDEN_HOSTED_GAUGE_CLASS, HostedDisplayGate, parseHostDisplayUnit } from './HostedDisplay';

const PANEL_CFG = join(
  __dirname,
  '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire',
  'Part_Interior_Cockpit/panel/panel.cfg',
);

const FOLDER_DISPLAY: Readonly<Record<string, CdsDisplay>> = {
  PFD: CdsDisplay.Pfd,
  ND: CdsDisplay.Nd,
  EWD: CdsDisplay.Ewd,
  SD: CdsDisplay.Sd,
  SDv2: CdsDisplay.Sd,
};

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
    // no gauge of that folder: the first gauge
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

  it('lets the mouse through the gauge element of a hidden hosted gauge to the DU gauge under it', () => {
    // The SD DU block: the SD's own gauge, then the hosted EWD listed after it (on top), each a whole-DU element
    const panel = document.createElement('vcockpit-panel');
    const sdGauge = document.createElement('a380x-sd');
    sdGauge.setAttribute('url', 'A380X/SDv2/sdv2.html?duID=7');
    const ewdGauge = document.createElement('a380x-ewd');
    ewdGauge.setAttribute('url', 'A380X/EWD/ewd-hosted.html?hostDu=7&duID=6');
    const ewdMount = document.createElement('div');
    ewdMount.id = 'EWD_CONTENT';
    ewdGauge.appendChild(ewdMount);
    panel.append(sdGauge, ewdGauge);
    document.body.append(panel);
    const gate = new HostedDisplayGate(DisplayUnitID.Sd, CdsDisplay.Ewd, 'EWD_CONTENT', vi.fn());

    expect(gate.update()).toBe(false);
    expect(ewdGauge.style.pointerEvents).toBe('none');
    expect(sdGauge.style.pointerEvents).toBe('');

    SimVar.SetSimVarValue('L:A380X_CDS_SD_DU_DISPLAY', 'number', CdsDisplay.Ewd);
    expect(gate.update()).toBe(true);
    expect(ewdGauge.style.pointerEvents).toBe('');

    SimVar.SetSimVarValue('L:A380X_CDS_SD_DU_DISPLAY', 'number', 0);
    expect(gate.update()).toBe(false);
    expect(ewdGauge.style.pointerEvents).toBe('none');
  });

  it('marks a hidden hosted gauge for a document rule that covers it and every element inside it', () => {
    const panel = document.createElement('vcockpit-panel');
    const ewdGauge = document.createElement('a380x-ewd');
    ewdGauge.setAttribute('url', 'A380X/EWD/ewd-hosted.html?hostDu=7&duID=6');
    const wrapper = document.createElement('div');
    const ewdMount = document.createElement('div');
    ewdMount.id = 'EWD_CONTENT';
    wrapper.appendChild(ewdMount);
    ewdGauge.appendChild(wrapper);
    panel.append(ewdGauge);
    document.body.append(panel);
    const gate = new HostedDisplayGate(DisplayUnitID.Sd, CdsDisplay.Ewd, 'EWD_CONTENT', vi.fn());

    gate.update();
    expect(ewdGauge.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(true);
    const rule = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .find((text) => text.includes(HIDDEN_HOSTED_GAUGE_CLASS));
    expect(rule).toContain(`.${HIDDEN_HOSTED_GAUGE_CLASS} *`);
    expect(rule).toContain('pointer-events: none !important');

    SimVar.SetSimVarValue('L:A380X_CDS_SD_DU_DISPLAY', 'number', CdsDisplay.Ewd);
    gate.update();
    expect(ewdGauge.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(false);
    SimVar.SetSimVarValue('L:A380X_CDS_SD_DU_DISPLAY', 'number', 0);
  });

  it('hides a hosted gauge whose mount element only comes into the document after the first update', () => {
    const gate = new HostedDisplayGate(DisplayUnitID.Sd, CdsDisplay.Ewd, 'EWD_CONTENT', vi.fn());
    expect(gate.update()).toBe(false);

    const panel = document.createElement('vcockpit-panel');
    const ewdGauge = document.createElement('a380x-ewd');
    ewdGauge.setAttribute('url', 'A380X/EWD/ewd-hosted.html?hostDu=7&duID=6');
    const ewdMount = document.createElement('div');
    ewdMount.id = 'EWD_CONTENT';
    ewdGauge.appendChild(ewdMount);
    panel.append(ewdGauge);
    document.body.append(panel);

    expect(gate.update()).toBe(false);
    expect(ewdMount.style.display).toBe('none');
    expect(ewdGauge.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(true);
  });

  it('finds the gauge element of a hidden hosted gauge by its URL when the mount element is outside it', () => {
    // As in the sim: the mount element is not a descendant of the gauge element, so only the panel.cfg URL tells which
    // gauge element to make transparent
    const panel = document.createElement('vcockpit-panel');
    const sdGauge = document.createElement('a380x-sdv2');
    sdGauge.setAttribute('url', 'A380X/SDv2/sdv2.html?duID=7');
    const ewdGauge = document.createElement('a380x-ewd');
    ewdGauge.setAttribute('url', 'A380X/EWD/ewd-hosted.html?hostDu=7&duID=6');
    panel.append(sdGauge, ewdGauge);
    const ewdMount = document.createElement('div');
    ewdMount.id = 'EWD_CONTENT';
    document.body.append(panel, ewdMount);
    const gate = new HostedDisplayGate(DisplayUnitID.Sd, CdsDisplay.Ewd, 'EWD_CONTENT', vi.fn());

    expect(gate.update()).toBe(false);
    expect(ewdGauge.style.pointerEvents).toBe('none');
    expect(ewdGauge.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(true);
    expect(sdGauge.style.pointerEvents).toBe('');
    expect(sdGauge.classList.contains(HIDDEN_HOSTED_GAUGE_CLASS)).toBe(false);
  });

  it('stops a hosted gauge with a stop function when its display is no longer shown, and starts it again', () => {
    setUpPanel([['a380x-sd', 'A380X/SD/sd-hosted.html?hostDu=4&duID=7']]);
    const start = vi.fn();
    const stop = vi.fn();
    const gate = new HostedDisplayGate(DisplayUnitID.FoNd, CdsDisplay.Sd, 'PFD_CONTENT', start, stop);

    expect(gate.update()).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();

    SimVar.SetSimVarValue('L:A380X_CDS_FO_ND_DU_DISPLAY', 'number', CdsDisplay.Sd);
    expect(gate.update()).toBe(true);
    expect(gate.update()).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);

    SimVar.SetSimVarValue('L:A380X_CDS_FO_ND_DU_DISPLAY', 'number', CdsDisplay.Ewd);
    expect(gate.update()).toBe(false);
    expect(gate.update()).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);

    SimVar.SetSimVarValue('L:A380X_CDS_FO_ND_DU_DISPLAY', 'number', CdsDisplay.Sd);
    expect(gate.update()).toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
    SimVar.SetSimVarValue('L:A380X_CDS_FO_ND_DU_DISPLAY', 'number', 0);
  });

  it('reads the DU of a hosted SD gauge, and not of an SDv2 gauge, from the SD folder', () => {
    setUpPanel([
      ['a380x-nd', 'A380X/ND/nd.html?Index=2?duID=4'],
      ['a380x-sd', 'A380X/SD/sd-hosted.html?hostDu=4&duID=7'],
      ['a380x-sdv2', 'A380X/SDv2/sdv2-hosted.html?hostDu=4&duID=7'],
    ]);
    expect(findInstrumentUrl('SD')).toBe('A380X/SD/sd-hosted.html?hostDu=4&duID=7');
    expect(findInstrumentUrl('SDv2')).toBe('A380X/SDv2/sdv2-hosted.html?hostDu=4&duID=7');
  });

  it('has a hosted gauge in panel.cfg for every display a DU can draw, and no other', () => {
    const hostedUrls = Array.from(
      readFileSync(PANEL_CFG, 'utf-8').matchAll(/^htmlgauge\d+\s*=\s*A380X\/(\w+)\/([^,\s]+)/gm),
    );
    const drawn = new Map<DisplayUnitID, Set<CdsDisplay>>(
      ALL_DISPLAY_UNITS.map((du) => [du, new Set([normalDisplayOf(du)])]),
    );
    const hostedFolders = new Map<DisplayUnitID, string[]>();
    for (const [, folder, file] of hostedUrls) {
      const hostDu = parseHostDisplayUnit(file);
      if (hostDu !== null) {
        expect(file).toContain('-hosted.html');
        drawn.get(hostDu)!.add(FOLDER_DISPLAY[folder]);
        hostedFolders.set(hostDu, [...(hostedFolders.get(hostDu) ?? []), folder]);
      }
    }
    for (const du of ALL_DISPLAY_UNITS) {
      expect([...drawn.get(du)!].sort()).toEqual([...DRAWN_DISPLAYS[du]].sort());
    }
    // the SD is two gauges (legacy SD pages + SDv2): both on each ND DU
    for (const du of [DisplayUnitID.CaptNd, DisplayUnitID.FoNd]) {
      expect(hostedFolders.get(du)).toEqual(expect.arrayContaining(['SD', 'SDv2']));
    }
  });
});
