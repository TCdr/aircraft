//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  DisplayComponent,
  FSComponent,
  MappedSubject,
  Subscribable,
  SubscribableMapFunctions,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { IconButton } from '../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { OisDomain } from '../../OIT';
import { OitUiService } from '../../OitUiService';
import { FLT_OPS_SWITCHING_BAR_KEYS, fltOpsApplicationName } from './FltOpsApplications';

interface OitFltOpsFooterProps {
  readonly uiService: OitUiService;
  readonly avncsOrFltOps: Subscribable<OisDomain>;
}

/*
 * The switching bar of the FLT OPS side: a key per open application, the active one highlighted; the arrows scroll it
 */
export abstract class OitFltOpsFooter extends DisplayComponent<OitFltOpsFooterProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  protected readonly subs = [] as Subscription[];

  private readonly applications = this.props.uiService.fltOpsApplications;

  private readonly keys = Array.from({ length: FLT_OPS_SWITCHING_BAR_KEYS }, (_, index) => {
    const application = this.applications.shown.map((shown) => shown[index] ?? null);
    return {
      application,
      label: application.map((app) => (app === null ? '' : fltOpsApplicationName(app))),
      visible: application.map((app) => app !== null),
      selected: MappedSubject.create(
        ([app, active]) => app !== null && app === active,
        application,
        this.applications.active,
      ),
    };
  });

  private readonly leftDisabled = this.applications.canScrollLeft.map(SubscribableMapFunctions.not());

  private readonly rightDisabled = this.applications.canScrollRight.map(SubscribableMapFunctions.not());

  /**
   * A key of the bar displays its application where it was left
   * @param index the key, from the left
   */
  private onKey(index: number): void {
    const application = this.keys[index].application.get();
    if (application !== null) {
      this.props.uiService.navigateTo(this.applications.pageOf(application));
    }
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    for (const key of this.keys) {
      this.subs.push(key.application, key.label, key.visible, key.selected);
    }
    this.subs.push(this.leftDisabled, this.rightDisabled);
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }

    super.destroy();
  }

  render(): VNode {
    return (
      <div class="oit-header-row">
        <IconButton
          icon={'single-left'}
          containerStyle="width: 60px; height: 50px; padding: 17.5px;"
          disabled={this.leftDisabled}
          onClick={() => this.applications.scroll(-1)}
        />
        {this.keys.map((key, index) => (
          <Button
            label={key.label}
            visible={key.visible}
            selected={key.selected}
            onClick={() => this.onKey(index)}
            buttonStyle="width: 225px; font-size: 28px; height: 50px;"
          />
        ))}
        <div style="flex-grow: 1" />
        <IconButton
          icon={'single-right'}
          containerStyle="width: 60px; height: 50px; padding: 17.5px;"
          disabled={this.rightDisabled}
          onClick={() => this.applications.scroll(1)}
        />
      </div>
    );
  }
}
