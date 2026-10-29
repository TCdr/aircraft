//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FlightFolder } from '../../../System/FlightFolder';
import './flight-folder.scss';

export type FlightFolderExportKind = 'cfp' | 'full';

interface OitFlightFolderExportProps extends ComponentProps {
  /** The current folder, the one the export takes */
  readonly folder: FlightFolder;
  readonly onExport: (kind: FlightFolderExportKind) => void;
  readonly onReturn: () => void;
}

/** The EXPORT FLIGHT FOLDER view: what to export, and the documents that go with it */
export class OitFlightFolderExport extends DestroyableComponent<OitFlightFolderExportProps> {
  private readonly listRef = FSComponent.createRef<HTMLDivElement>();
  private readonly beforePushBackRef = FSComponent.createRef<HTMLDivElement>();
  private readonly afterFlightRef = FSComponent.createRef<HTMLDivElement>();

  private readonly choice = Subject.create<FlightFolderExportKind | null>(null);
  private readonly exportDisabled = this.choice.map((choice) => choice === null);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.beforePushBackRef.instance.addEventListener('click', () => this.choice.set('cfp'));
    this.afterFlightRef.instance.addEventListener('click', () => this.choice.set('full'));
    this.subscriptions.push(
      this.exportDisabled,
      this.choice.sub((choice) => {
        this.beforePushBackRef.instance.classList.toggle('selected', choice === 'cfp');
        this.afterFlightRef.instance.classList.toggle('selected', choice === 'full');
        this.showList(choice);
      }, true),
    );
  }

  private showList(choice: FlightFolderExportKind | null): void {
    const list = this.listRef.instance;
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    const names = choice === null ? ['No document'] : this.props.folder.exportContent(choice);
    for (const name of names) {
      const line = document.createElement('div');
      line.textContent = name;
      list.appendChild(line);
    }
  }

  render(): VNode {
    return (
      <div class="oit-eff-export">
        <div class="oit-eff-export-id">{`FLT FOLDER IDENTIFIER: ${this.props.folder.label}`}</div>
        <div class="oit-eff-export-body">
          <div class="oit-eff-export-left">
            <div>EXPORT CONTENT:</div>
            <div ref={this.beforePushBackRef} class="oit-eff-radio">
              <div class="oit-eff-radio-dot" />
              <div>Before Push Back (CFP)</div>
            </div>
            <div ref={this.afterFlightRef} class="oit-eff-radio">
              <div class="oit-eff-radio-dot" />
              <div>After flight (Full export)</div>
            </div>
          </div>
          <div ref={this.listRef} class="oit-eff-export-list" />
        </div>
        <div class="oit-eff-export-buttons">
          <Button
            label="EXPORT"
            disabled={this.exportDisabled}
            onClick={() => {
              const choice = this.choice.get();
              if (choice !== null) {
                this.props.onExport(choice);
              }
            }}
          />
          <Button label="RETURN" onClick={() => this.props.onReturn()} />
        </div>
      </div>
    );
  }
}
