//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button, ButtonMenuItem } from '../../MsfsAvionicsCommon/UiWidgets/Button';
import { OisMessageToolbar, OisToolbarMessage } from '../System/OisMessageToolbar';

interface OitMessageToolbarViewProps {
  readonly toolbar: OisMessageToolbar;
  /** The flight crew selected a message of the list (already taken off the toolbar) */
  readonly onSelect?: (message: OisToolbarMessage) => void;
  readonly idPrefix: string;
  /** The height of the menu bar buttons, px */
  readonly height: number;
}

/** The message area of an OIS menu bar: "n MSG" counter, the newest message, the list under the arrow, CLEAR */
export class OitMessageToolbarView extends DestroyableComponent<OitMessageToolbarViewProps> {
  private readonly counterText = this.props.toolbar.count.map((count) => `${count} MSG`);

  private readonly empty = this.props.toolbar.count.map((count) => count === 0);

  private readonly listItems = this.props.toolbar.messages.map((messages) =>
    messages.map<ButtonMenuItem>((message) => ({
      label: message.text,
      action: () => this.select(message.id),
    })),
  );

  private select(id: number): void {
    const message = this.props.toolbar.select(id);
    if (message !== null) {
      this.props.onSelect?.(message);
    }
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(this.counterText, this.empty, this.listItems);
  }

  render(): VNode {
    return (
      <>
        <div class="oit-msg-header">{this.counterText}</div>
        <div class="oit-msg-box">{this.props.toolbar.shownText}</div>
        <Button
          label=""
          menuItems={this.listItems}
          idPrefix={`${this.props.idPrefix}_msg_list`}
          disabled={this.empty}
          dropdownMenuRightAligned={true}
          onClick={() => {}}
          buttonStyle={`width: 60px; height: ${this.props.height}px;`}
        />
        <Button
          label="CLEAR"
          onClick={() => this.props.toolbar.clear()}
          buttonStyle={`font-size: 28px; height: ${this.props.height}px;`}
          containerStyle="margin-left: 5px;"
          disabled={this.empty}
        />
      </>
    );
  }
}
