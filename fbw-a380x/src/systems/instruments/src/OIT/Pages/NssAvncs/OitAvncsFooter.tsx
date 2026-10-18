//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { OitUiService } from '../../OitUiService';
import { OisDomain } from '../../OIT';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { NSS_AVNCS_TASK_BAR_KEYS, nssAvncsApplicationName } from './NssAvncsApplications';

interface OitAvncsFooterProps {
  readonly uiService: OitUiService;
  readonly avncsOrFltOps: Subscribable<OisDomain>;
}

/*
 * The task bar of the NSS AVNCS side: a key per open application, the active one highlighted
 */
export abstract class OitAvncsFooter extends DestroyableComponent<OitAvncsFooterProps> {
  private readonly applications = this.props.uiService.nssAvncsApplications;

  private readonly keys = Array.from({ length: NSS_AVNCS_TASK_BAR_KEYS }, (_, index) => {
    const application = this.applications.shown.map((shown) => shown[index] ?? null);
    return {
      application,
      label: application.map((app) => (app === null ? '' : nssAvncsApplicationName(app))),
      visible: application.map((app) => app !== null),
      selected: MappedSubject.create(
        ([app, active]) => app !== null && app === active,
        application,
        this.applications.active,
      ),
    };
  });

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
      this.subscriptions.push(key.application, key.label, key.visible, key.selected);
    }
  }

  render(): VNode {
    return (
      <div class="oit-header-row">
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
      </div>
    );
  }
}
