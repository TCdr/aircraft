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
import { CdsDisplay, normalDisplayOf, resolveDisplay } from '@shared/CdsReconfiguration';

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
 * The DU a gauge of an instrument draws on when it is a hosted gauge. Only from the gauge's connectedCallback on (or
 * FsBaseInstrument.constructInstrument, called from there), never in the constructor of a BaseInstrument gauge: the
 * sim creates the gauge element before it sets its url attribute and puts it into the panel, so the constructor finds
 * only the gauges listed before it (e.g. the SD's, without hostDu) and a hosted gauge passes for the DU's own one.
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
 * The gauge elements of the hosted gauges of a display on a DU: the children of the panel element (vcockpit-panel) whose
 * panel.cfg URL has that hostDu and a duID whose normal display is that display, e.g. a380x-ewd for
 * A380X/EWD/ewd-hosted.html?hostDu=7&duID=6. Found by URL, as the gauge finds its own URL (findInstrumentUrl): in the sim
 * the mount element is not inside the gauge element, so walking up from it missed the hidden EWD over the SD's mailbox.
 * For the SD on an ND DU both the legacy SD and the SDv2 gauge are found.
 * @param hostDisplayUnit the DU the gauges draw on
 * @param display the display of the gauges
 * @returns the gauge elements
 */
export function hostedGaugeElements(hostDisplayUnit: DisplayUnitID, display: CdsDisplay): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('vcockpit-panel > *')).filter((gauge) => {
    const url = gauge.getAttribute('url');
    if (parseHostDisplayUnit(url) !== hostDisplayUnit) {
      return false;
    }
    const duId = /[?&]duID=(\d)/.exec(url ?? '');
    return duId !== null && normalDisplayOf(parseInt(duId[1], 10)) === display;
  });
}

/** The class of the gauge element of a hidden hosted gauge */
export const HIDDEN_HOSTED_GAUGE_CLASS = 'cds-hosted-hidden';

/** The id of the style element with the rule of HIDDEN_HOSTED_GAUGE_CLASS */
const HIDDEN_HOSTED_GAUGE_STYLE_ID = 'cds-hosted-hidden-style';

/**
 * Adds, once per document, the rule that lets the mouse through a hidden hosted gauge: on its gauge element and on every
 * element inside it, with !important, as the ND's rule for the WASM gauges over it (ND style.scss, wasm-instrument):
 * a pointer-events value on the gauge element alone did not reach the SD's mailbox under the hidden EWD in the sim
 */
function addHiddenHostedGaugeStyle(): void {
  if (document.getElementById(HIDDEN_HOSTED_GAUGE_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = HIDDEN_HOSTED_GAUGE_STYLE_ID;
  style.textContent = `.${HIDDEN_HOSTED_GAUGE_CLASS}, .${HIDDEN_HOSTED_GAUGE_CLASS} * { pointer-events: none !important; }`;
  (document.head ?? document.body).appendChild(style);
}

/**
 * The run gate of a hosted gauge: started on the first frame its display is shown on its DU, then running only while
 * shown. While it is not shown its mount element is hidden (display: none), so it does not draw, and its gauge element
 * lets the mouse through (pointer-events: none): all gauges of a panel.cfg block share one document, and the gauge
 * element of a gauge listed later covers the whole DU even with nothing drawn, so it would take the clicks of the DU's
 * own gauge under it (e.g. the hidden hosted EWD over the SD's ATC mailbox). The same as upstream's OIT legacy overlay
 * (OitLegacy.tsx, class nopointer).
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
      const mount = document.getElementById(this.mountElementId);
      // Without its mount element yet (the gauge's template not in the document yet), tried again on the next frame
      if (mount) {
        this.shown = shown;
        mount.style.display = shown ? 'block' : 'none';
        if (!shown) {
          addHiddenHostedGaugeStyle();
        }
        for (const gauge of hostedGaugeElements(this.hostDisplayUnit, this.display)) {
          gauge.style.pointerEvents = shown ? '' : 'none';
          if (shown) {
            gauge.classList.remove(HIDDEN_HOSTED_GAUGE_CLASS);
          } else {
            gauge.classList.add(HIDDEN_HOSTED_GAUGE_CLASS);
          }
        }
      }
    }
    return shown;
  }
}
