//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { DocumentTextEntry } from '../Shared/DocumentTextEntry';
import { DocumentFieldContainer, DocumentTextField } from '../Shared/DocumentTextField';
import { WAYPOINT_NAME_MAX_LENGTH } from '../../../System/FlightFolderFlightPlan';
import { ScrollBar } from '../Shared/ScrollBar';
import './flight-folder.scss';

/** The waypoint NEXT WPT starts from, and the waypoints of the log after it that the crew can go to */
export interface NextWaypointRequest {
  /** The folder the window was opened for: the current folder may change while the window is open */
  readonly folderId: string;
  readonly fromKey: string;
  readonly fromIdent: string;
  readonly choices: readonly string[];
}

interface OitNavLogNextWaypointProps extends ComponentProps {
  readonly request: Subject<NextWaypointRequest | null>;
  readonly keyboard: DocumentFieldContainer;
  /** Applies the entry; false when it is not a waypoint name. True also when there is nothing to apply any more. */
  readonly confirm: (request: NextWaypointRequest, entry: string) => boolean;
}

/**
 * The NEXT WPT window of the NAV LOG: the waypoint to go to is picked in the list of the waypoints after the initial one
 * or typed, when it is not in the flight plan. Design choice: a list box with the shared scroll bar instead of a
 * drop-down list, as the cockpit screen has no wheel and a flight plan has many waypoints.
 */
export class OitNavLogNextWaypoint extends DestroyableComponent<OitNavLogNextWaypointProps> {
  private readonly listRef = FSComponent.createRef<HTMLDivElement>();

  private readonly hidden = this.props.request.map((request) => request === null);
  private readonly fromText = this.props.request.map((request) =>
    request === null ? '' : `Next WPT from ${request.fromIdent}`,
  );
  private readonly errorText = Subject.create('');

  private readonly entry = new DocumentTextEntry(() => this.errorText.set(''));

  private scrollBar: ScrollBar | null = null;

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.hidden,
      this.fromText,
      this.props.request.sub((request) => this.show(request), true),
    );
  }

  public destroy(): void {
    this.scrollBar?.destroy();
    this.scrollBar = null;
    super.destroy();
  }

  private show(request: NextWaypointRequest | null): void {
    const list = this.listRef.getOrDefault();
    if (!list) {
      return;
    }
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    this.entry.set(null);
    this.errorText.set('');
    if (request === null) {
      return;
    }
    for (const ident of request.choices) {
      const choice = document.createElement('div');
      choice.className = 'oit-eff-nw-choice';
      choice.textContent = ident;
      choice.addEventListener('click', () => {
        this.entry.set(ident);
        this.errorText.set('');
      });
      list.appendChild(choice);
    }
    list.scrollTop = 0;
    if (this.scrollBar === null) {
      this.scrollBar = new ScrollBar(list);
    }
    this.scrollBar.refresh();
  }

  private ok(): void {
    const request = this.props.request.get();
    if (request === null) {
      return;
    }
    if (this.props.confirm(request, this.entry.current())) {
      this.props.request.set(null);
    } else {
      this.errorText.set('INVALID WAYPOINT NAME');
    }
  }

  render(): VNode {
    return (
      <div class={{ 'oit-logbook-dialog-overlay': true, hidden: this.hidden }}>
        <div class="oit-logbook-dialog">
          <div class="oit-logbook-dialog-title">FLT FOLDER</div>
          <div class="oit-logbook-dialog-body">
            <div class="oit-eff-nw-from">{this.fromText}</div>
            <div class="oit-eff-nw-entry">
              <div class="oit-eff-nw-label">NEXT WPT</div>
              <DocumentTextField
                container={this.props.keyboard}
                entry={this.entry}
                maxLength={WAYPOINT_NAME_MAX_LENGTH}
                width={220}
              />
            </div>
            <div class="oit-eff-nw-error">{this.errorText}</div>
            <div class="oit-eff-nw-list-frame">
              <div ref={this.listRef} class="oit-eff-nw-list" />
            </div>
            <div class="oit-logbook-bottom-buttons" style="margin-top: 16px;">
              <Button
                label="OK"
                onClick={() => this.ok()}
                buttonStyle="min-width: 150px; padding: 0 14px; font-size: 26px; height: 46px; margin-left: 12px;"
              />
              <Button
                label="CANCEL"
                onClick={() => this.props.request.set(null)}
                buttonStyle="min-width: 150px; padding: 0 14px; font-size: 26px; height: 46px; margin-left: 12px;"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
}
