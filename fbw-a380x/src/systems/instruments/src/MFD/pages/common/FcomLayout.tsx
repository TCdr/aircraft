// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import './FcomLayout.scss';

/**
 * Helpers to lay out an MFD FMS page at the positions of its FCOM figure (A380 FCOM DSC-22-FMS-20-30). Coordinates are
 * pixels of the 768 x 1024 display relative to the element with the `mfd-fcom-canvas` class (for a page, the page
 * container starting below the title bar at y = 143). `y` is the vertical centre of the element.
 */
type Content = VNode | string | Subscribable<string> | (VNode | string | Subscribable<string>)[];

/** An element whose left edge is at x */
export function fcomAt(y: number, x: number, content: Content, style = ''): VNode {
  return (
    <div class="mfd-fcom-item" style={`top: ${y}px; left: ${x}px; ${style}`}>
      {content}
    </div>
  );
}

/** An element whose right edge is at x */
export function fcomRight(y: number, x: number, content: Content, style = ''): VNode {
  return (
    <div class="mfd-fcom-item mfd-fcom-right" style={`top: ${y}px; left: ${x}px; ${style}`}>
      {content}
    </div>
  );
}

/** An element centred on x */
export function fcomCentre(y: number, x: number, content: Content, style = ''): VNode {
  return (
    <div class="mfd-fcom-item mfd-fcom-centre" style={`top: ${y}px; left: ${x}px; ${style}`}>
      {content}
    </div>
  );
}

/** A horizontal line from x1 to x2 */
export function fcomLine(y: number, x1: number, x2: number): VNode {
  return <div class="mfd-fcom-line" style={`top: ${y}px; left: ${x1}px; width: ${x2 - x1}px;`} />;
}

/** Tab bar of the FMS pages (FCOM figures: 38 px high tabs with nearly vertical edges and 22 px titles) */
export const fcomTabBar = { tabBarHeight: 38, tabBarSlantedEdgeAngle: 9, tabFontSize: 22 };
