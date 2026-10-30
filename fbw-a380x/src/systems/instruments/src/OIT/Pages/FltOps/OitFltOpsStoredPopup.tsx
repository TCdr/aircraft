//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, DisplayComponent, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { DOCUMENT_STORED_MESSAGE } from '../../System/Performance/PerformanceStore';

import './OitFltOpsBoxes.scss';

interface OitFltOpsStoredPopupProps extends ComponentProps {
  /** The application name for the title bar while the pop-up is shown, null while it is hidden */
  readonly title: Subject<string | null>;
}

/** The pop-up of a performance application after STORE: Information, the document is in the FLT FOLDER */
export class OitFltOpsStoredPopup extends DisplayComponent<OitFltOpsStoredPopupProps> {
  private readonly hidden = this.props.title.map((title) => title === null);

  private readonly titleText = this.props.title.map((title) => title ?? '');

  public destroy(): void {
    this.hidden.destroy();
    this.titleText.destroy();
    super.destroy();
  }

  render(): VNode {
    return (
      <div class={{ 'oit-box-popup': true, 'oit-stored-popup': true, hidden: this.hidden }}>
        <div class="oit-box-popup-title">{this.titleText}</div>
        <div class="oit-box-popup-text">
          <div>Information:</div>
          <div class="oit-stored-popup-message">{DOCUMENT_STORED_MESSAGE}</div>
        </div>
        <div class="oit-stored-popup-buttons">
          <Button
            label="OK"
            onClick={() => this.props.title.set(null)}
            buttonStyle="font-size: 22px; width: 100px; height: 40px;"
          />
        </div>
      </div>
    );
  }
}
