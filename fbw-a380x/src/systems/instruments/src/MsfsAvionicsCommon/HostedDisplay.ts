// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Gauges of a display drawn on another DU for the CDS reconfiguration (A380 FCOM DSC-31-15-20).
 *
 * Every display is a gauge of its own on the texture of its DU (panel.cfg). To show the PFD on the ND DU, the ND on the
 * PFD DU, the EWD on the SD DU, or the EWD and the SD (its two gauges, SD and SDv2) on the ND DU, panel.cfg stacks an extra gauge of that display on the other DU's texture, with
 * `hostDu=<duID of that DU>` in its URL and the `-hosted` HTML file (the same script, its stylesheet scoped to the
 * display's mount element, see buildSrc/hostedInstrument.js: all gauges of a panel.cfg block share one document).
 * Such a hosted gauge starts nothing until the systems host first puts its display on the DU
 * (L:A380X_CDS_{DU}_DU_DISPLAY), then only runs while it is shown, so it costs next to nothing in normal operation.
 */

import { DisplayUnitID, displayUnitDisplayVar } from '@shared/CdsDisplayUnits';
import { CdsDisplay, resolveDisplay } from '@shared/CdsReconfiguration';

/**
 * The DU a hosted gauge draws on, from its panel.cfg URL
 * @param url the gauge URL (e.g. A380X/PFD/pfd-hosted.html?Index=1&hostDu=1&duID=0)
 * @returns the DU, or null for the DU's own gauge (no hostDu parameter)
 */
export function parseHostDisplayUnit(url: string | null | undefined): DisplayUnitID | null {
  const match = /[?&]hostDu=(\d)/.exec(url ?? '');
  if (!match) {
    return null;
  }
  const du = parseInt(match[1], 10);
  return du >= DisplayUnitID.CaptPfd && du <= DisplayUnitID.Sd ? du : null;
}

/**
 * The URL of the gauge of an instrument in this document. All gauges of a panel.cfg block share the document, so the
 * first one is not always this instrument's (a hosted gauge comes after the DU's own gauge).
 * @param folder the instrument folder in the URL (PFD, ND, EWD)
 * @returns the URL of the gauge of that folder, else of the first gauge that is not a WASM gauge
 */
export function findInstrumentUrl(folder: string): string | null {
  const gauges = Array.from(document.querySelectorAll('vcockpit-panel > *'));
  const own = gauges.find((it) => (it.getAttribute('url') ?? '').includes(`/${folder}/`));
  const first = gauges.find((it) => it.tagName.toLowerCase() !== 'wasm-instrument');
  return (own ?? first)?.getAttribute('url') ?? null;
}

/**
 * The DU a gauge of an instrument draws on when it is a hosted gauge
 * @param folder the instrument folder in the URL (PFD, ND, EWD)
 * @returns the DU, or null for the DU's own gauge
 */
export function hostDisplayUnitOf(folder: string): DisplayUnitID | null {
  return parseHostDisplayUnit(findInstrumentUrl(folder));
}

/**
 * Whether a display is shown on a DU
 * @param du the DU
 * @param display the display
 * @returns true while the systems host puts the display on the DU
 */
export function isDisplayShownOn(du: DisplayUnitID, display: CdsDisplay): boolean {
  return resolveDisplay(du, SimVar.GetSimVarValue(displayUnitDisplayVar(du), 'number')) === display;
}

/**
 * The run gate of a hosted gauge: started on the first frame its display is shown on its DU, then running only while
 * shown. While it is not shown its mount element is hidden (display: none), so it neither draws nor takes mouse events
 * from the DU's own gauge under it.
 */
export class HostedDisplayGate {
  private started = false;

  /** Whether the display was shown at the last update, null before the first one */
  private shown: boolean | null = null;

  /**
   * @param hostDisplayUnit the DU the gauge draws on
   * @param display the display of the gauge
   * @param mountElementId the id of the gauge's mount element (e.g. PFD_CONTENT)
   * @param start starts the instrument (backplane, rendering): called once, or each time the display is shown again
   * when there is a stop function
   * @param stop stops the instrument when the display is no longer shown (e.g. unmounts a React instrument, whose
   * hooks would otherwise keep running on every frame); without it the instrument stays started and the gauge's own
   * update loop is skipped while the display is not shown
   */
  constructor(
    private readonly hostDisplayUnit: DisplayUnitID,
    private readonly display: CdsDisplay,
    private readonly mountElementId: string,
    private readonly start: () => void,
    private readonly stop?: () => void,
  ) {}

  /**
   * Called when the gauge is connected (hides the mount element at once) and on every frame of the gauge
   * @returns true if the instrument shall run this frame
   */
  public update(): boolean {
    const shown = isDisplayShownOn(this.hostDisplayUnit, this.display);
    if (shown && !this.started) {
      this.started = true;
      this.start();
    } else if (!shown && this.started && this.stop) {
      this.started = false;
      this.stop();
    }
    if (shown !== this.shown) {
      this.shown = shown;
      const mount = document.getElementById(this.mountElementId);
      if (mount) {
        mount.style.display = shown ? 'block' : 'none';
      }
    }
    return shown;
  }
}
