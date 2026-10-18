//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ComponentProps,
  DisplayComponent,
  FSComponent,
  Subscribable,
  SubscribableUtils,
  VNode,
} from '@microsoft/msfs-sdk';

import './OitFltOpsBoxes.scss';

interface OitTickBoxProps extends ComponentProps {
  readonly ticked: Subscribable<boolean>;
  readonly disabled?: Subscribable<boolean>;
  readonly onClick: () => void;
}

/** The white tick box of the LOAD BOX and EXPORT BOX tables */
export class OitTickBox extends DisplayComponent<OitTickBoxProps> {
  private readonly ref = FSComponent.createRef<HTMLDivElement>();

  private readonly disabled = SubscribableUtils.toSubscribable(this.props.disabled ?? false, true);

  private readonly tickHidden = this.props.ticked.map((ticked) => !ticked);

  // The sim browser never fires an onClick set on a plain element in JSX: listen to the element itself.
  private readonly onClickHandler = () => {
    if (!this.disabled.get()) {
      this.props.onClick();
    }
  };

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.ref.instance.addEventListener('click', this.onClickHandler);
  }

  public destroy(): void {
    this.ref.getOrDefault()?.removeEventListener('click', this.onClickHandler);
    this.tickHidden.destroy();
    super.destroy();
  }

  render(): VNode {
    return (
      <div ref={this.ref} class={{ 'oit-box-tick': true, disabled: this.disabled }}>
        <div class={{ hidden: this.tickHidden }}>
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path d="M4 12 L10 18 L20 5" stroke="#000000" stroke-width="4" fill="none" />
          </svg>
        </div>
      </div>
    );
  }
}

/**
 * @returns the recycle bin symbol of the LOAD BOX and EXPORT BOX tables
 */
export function recycleBinIcon(): VNode {
  return (
    <svg width="26" height="30" viewBox="0 0 26 30">
      <path d="M3 7 L23 7 L21 29 L5 29 Z" fill="#ffffff" stroke="#000000" stroke-width="1" />
      <path d="M1 5 L25 1" stroke="#ffffff" stroke-width="3" />
      <path d="M9 11 L9 26 M13 11 L13 26 M17 11 L17 26" stroke="#000000" stroke-width="1.5" />
    </svg>
  );
}
