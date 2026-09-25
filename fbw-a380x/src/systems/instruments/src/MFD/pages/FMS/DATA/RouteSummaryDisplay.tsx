// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  ComponentProps,
  DisplayComponent,
  FSComponent,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { RouteSummaryToken } from '../../../FMC/StoredRouteUtils';

import './RouteSummaryDisplay.scss';

interface RouteSummaryDisplayProps extends ComponentProps {
  tokens: Subscribable<readonly RouteSummaryToken[]>;
  /** Left edge of the box, in the coordinates of the positioned parent */
  left: number;
  /** Top edge of the box, in the coordinates of the positioned parent */
  top: number;
  /** Lines per page (FCOM figures: 10 on the DATABASE RTEs panel, 8 below a city pair line, 11 on ROUTE SELECTION) */
  lines: number;
  /** Space below the last line (ROUTE SELECTION: 19 px) */
  bottomPadding?: number;
  /** Order of the scroll buttons below the box (the FCOM figures show both orders) */
  scrollDownFirst?: boolean;
}

/**
 * The route summary of the DATA / ROUTE and ROUTE SELECTION pages (A380 FCOM DSC-22-FMS-20-30 P 83-89, P 324): a 560 px
 * wide box with a 24 px top margin and lines of 42 px separated by a thin line, each with two VIA / TO pairs (VIA at 6
 * and 283 px, TO at 134 and 411 px), read from left to right and from top to bottom; waypoints in green big font,
 * airways and procedures in small white font. The two scroll buttons below the box move page by page.
 */
export class RouteSummaryDisplay extends DisplayComponent<RouteSummaryDisplayProps> {
  private static readonly width = 560;

  private static readonly topMargin = 24;

  private static readonly lineHeight = 42;

  private readonly subs: Subscription[] = [];

  private readonly linesRef = FSComponent.createRef<HTMLDivElement>();

  private readonly firstLine = Subject.create(0);

  private lineCount = 0;

  private readonly scrollUpDisabled = Subject.create(true);

  private readonly scrollDownDisabled = Subject.create(true);

  private readonly boxHeight =
    RouteSummaryDisplay.topMargin + RouteSummaryDisplay.lineHeight * this.props.lines + (this.props.bottomPadding ?? 0);

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.props.tokens.sub(() => this.firstLine.set(0), true),
      this.props.tokens.sub(() => this.renderLines(), true),
      this.firstLine.sub(() => this.renderLines()),
    );
  }

  private renderLines(): void {
    const tokens = this.props.tokens.get();
    const container = this.linesRef.instance;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const pairs: [string, string][] = [];
    for (let i = 0; i < tokens.length; i += 2) {
      pairs.push([tokens[i]?.text ?? '', tokens[i + 1]?.text ?? '']);
    }
    this.lineCount = Math.ceil(pairs.length / 2);

    const first = this.firstLine.get();
    const columns = [
      [6, 134],
      [283, 411],
    ];
    for (let line = 0; line < this.props.lines; line++) {
      const top = RouteSummaryDisplay.topMargin + line * RouteSummaryDisplay.lineHeight;
      // FCOM figures: the text is 2 px above the middle of its line
      const centre = top + RouteSummaryDisplay.lineHeight / 2 - 2;
      for (let column = 0; column < 2; column++) {
        const pair = pairs[(first + line) * 2 + column];
        for (let k = 0; k < 2; k++) {
          const text = document.createElement('span');
          text.className = k === 0 ? 'mfd-label mfd-route-summary-text' : 'mfd-value bigger mfd-route-summary-text';
          text.style.left = `${columns[column][k]}px`;
          text.style.top = `${centre}px`;
          text.textContent = pair?.[k] ?? '';
          container.appendChild(text);
        }
      }
      if (line < this.props.lines - 1) {
        const separator = document.createElement('div');
        separator.className = 'mfd-route-summary-separator';
        separator.style.top = `${top + RouteSummaryDisplay.lineHeight}px`;
        container.appendChild(separator);
      }
    }

    this.scrollUpDisabled.set(first <= 0);
    this.scrollDownDisabled.set(first + this.props.lines >= this.lineCount);
  }

  private scrollByPage(direction: 1 | -1): void {
    const next = this.firstLine.get() + direction * this.props.lines;
    if (next >= 0 && next < this.lineCount) {
      this.firstLine.set(next);
    }
  }

  destroy(): void {
    for (const s of this.subs) {
      s.destroy();
    }
    super.destroy();
  }

  render(): VNode {
    const up = (
      <IconButton
        icon="double-up"
        disabled={this.scrollUpDisabled}
        onClick={() => this.scrollByPage(-1)}
        containerStyle="width: 60px; height: 54px;"
      />
    );
    const down = (
      <IconButton
        icon="double-down"
        disabled={this.scrollDownDisabled}
        onClick={() => this.scrollByPage(1)}
        containerStyle="width: 60px; height: 54px;"
      />
    );
    return (
      <div class="mfd-route-summary" style={`left: ${this.props.left}px; top: ${this.props.top}px;`}>
        <div
          ref={this.linesRef}
          class="mfd-route-summary-box"
          style={`width: ${RouteSummaryDisplay.width}px; height: ${this.boxHeight}px;`}
        />
        <div class="mfd-route-summary-scroll" style={`top: ${this.boxHeight + 6}px;`}>
          {this.props.scrollDownFirst ?? true ? [down, up] : [up, down]}
        </div>
      </div>
    );
  }
}
