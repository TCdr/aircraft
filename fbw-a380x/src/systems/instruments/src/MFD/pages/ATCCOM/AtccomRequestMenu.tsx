// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ComponentProps,
  DisplayComponent,
  FSComponent,
  NodeReference,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';

import { RequestFrame, RequestFrameId, RequestMenuButton } from '../../ATCCOM/RequestFrames';

export interface AtccomMenuButtonLayout {
  button: RequestMenuButton;
  /** The top of the button in page coordinates, and its height */
  top: number;
  height: number;
}

interface AtccomRequestMenuProps extends ComponentProps {
  buttons: AtccomMenuButtonLayout[];
  /** The left of the buttons and their width */
  left: number;
  width: number;
  /** Whether a frame can be selected in the menu */
  isAvailable: (frame: RequestFrameId, frames: readonly RequestFrame[]) => boolean;
  frames: Subscribable<readonly RequestFrame[]>;
  onSelect: (frame: RequestFrameId) => void;
}

/**
 * The menu of the REQUEST page (FCOM DSC-46-10-20-30 P 12): a column of buttons, each opening its sub-menu on its left
 * (the arrow on the left of the label), or creating its frame directly (SPEED).
 */
export class AtccomRequestMenu extends DisplayComponent<AtccomRequestMenuProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  /** The index of the button whose sub-menu is open, -1 when closed */
  private readonly openMenu = Subject.create(-1);

  private readonly overlayRef = FSComponent.createRef<HTMLDivElement>();

  /** The clickable elements and their handlers, attached after rendering */
  private readonly listeners: [NodeReference<HTMLElement>, () => void][] = [];

  private readonly closeMenu = () => this.openMenu.set(-1);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.overlayRef.instance.addEventListener('click', this.closeMenu);
    this.listeners.forEach(([ref, handler]) => ref.instance.addEventListener('click', handler));
  }

  public destroy(): void {
    this.overlayRef.getOrDefault()?.removeEventListener('click', this.closeMenu);
    this.listeners.forEach(([ref, handler]) => ref.getOrDefault()?.removeEventListener('click', handler));
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  private select(frame: RequestFrameId): void {
    this.openMenu.set(-1);
    if (this.props.isAvailable(frame, this.props.frames.get())) {
      this.props.onSelect(frame);
    }
  }

  private clickable(handler: () => void): NodeReference<HTMLDivElement> {
    const ref = FSComponent.createRef<HTMLDivElement>();
    this.listeners.push([ref, handler]);
    return ref;
  }

  private renderButton(layout: AtccomMenuButtonLayout, index: number): VNode {
    const { button, top, height } = layout;
    const items = button.items;
    const menuVisible = this.openMenu.map((open) => (open === index ? 'block' : 'none'));
    this.subs.push(menuVisible);
    const lines = button.label.split('\n');
    // A frame already in the message: its button is grey (FCOM figure of the OTHER REPORTS page)
    const disabled = this.props.frames.map((frames) =>
      button.frame !== undefined ? !this.props.isAvailable(button.frame, frames) : false,
    );
    this.subs.push(disabled);
    const buttonRef = this.clickable(() => {
      if (items) {
        this.openMenu.set(this.openMenu.get() === index ? -1 : index);
      } else if (button.frame) {
        this.select(button.frame);
      }
    });
    return (
      <>
        <div
          ref={buttonRef}
          class={{ 'mfd-atccom-request-menu-button': true, disabled }}
          style={`top: ${top}px; left: ${this.props.left}px; width: ${this.props.width}px; height: ${height}px;`}
        >
          {items && (
            <svg class="mfd-atccom-request-menu-arrow" width="13" height="17" viewBox="0 0 13 17">
              <polygon points="0,8.5 13,0 13,17" fill="white" />
            </svg>
          )}
          <span class="mfd-atccom-request-menu-label">
            {lines.map((line, i) => (i < lines.length - 1 ? [line, <br />] : line))}
          </span>
        </div>
        {items && (
          <div
            class="mfd-atccom-request-submenu"
            style={{ display: menuVisible, top: `${top}px`, right: `${768 - this.props.left}px` }}
          >
            {items.map((item) => {
              const disabled = this.props.frames.map((frames) => !this.props.isAvailable(item.frame, frames));
              this.subs.push(disabled);
              return (
                <div
                  ref={this.clickable(() => this.select(item.frame))}
                  class={{ 'mfd-dropdown-menu-element': true, disabled }}
                >
                  {item.label}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  render(): VNode {
    const overlayVisible = this.openMenu.map((open) => (open === -1 ? 'none' : 'block'));
    this.subs.push(overlayVisible);
    return (
      <>
        {/* A click outside the open sub-menu closes it */}
        <div ref={this.overlayRef} class="mfd-atccom-request-menu-overlay" style={{ display: overlayVisible }} />
        {this.props.buttons.map((layout, index) => this.renderButton(layout, index))}
      </>
    );
  }
}
