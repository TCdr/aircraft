//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, SubscribableMapFunctions, Subscription, VNode } from '@microsoft/msfs-sdk';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { OitUiService } from '../../OitUiService';
import { PageFunctionAvailability } from '../../OitPageFunctions';
import { NSS_AVNCS_MENU_URI } from './NssAvncsApplications';

interface OitAvncsSubHeaderProps {
  title: string;
  readonly uiService: OitUiService;
}

/*
 * Line 2 of the NSS AVNCS menu bar: the active application, then HOME, BACK, FORWARD, PRINT, UPDATE, HELP, CLOSE
 */
export abstract class OitAvncsSubHeader extends DisplayComponent<OitAvncsSubHeaderProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  protected readonly subs = [] as Subscription[];

  private readonly backDisabled = this.props.uiService.backAvailable.map(SubscribableMapFunctions.not());
  private readonly forwardDisabled = this.props.uiService.forwardAvailable.map(SubscribableMapFunctions.not());

  /** No application on the menu page: nothing to UPDATE or CLOSE */
  private readonly onMenuPage = this.props.uiService.activeUri.map((uri) => !uri.page);

  private readonly print = new PageFunctionAvailability(this.props.uiService.pageFunctions, 'print');

  private update(): void {
    // A page with its own UPDATE does it; the others show again with fresh avionics parameters
    if (!this.props.uiService.runPageFunction('update')) {
      this.props.uiService.reloadActivePage();
    }
  }

  /** CLOSE: the application closes (it leaves the task bar), back to the menu page */
  private close(): void {
    this.props.uiService.nssAvncsApplications.closeActive();
    this.props.uiService.navigateTo(NSS_AVNCS_MENU_URI);
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(this.backDisabled, this.forwardDisabled, this.onMenuPage);
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }
    this.print.destroy();

    super.destroy();
  }

  render(): VNode {
    return (
      <div class="oit-header-row" style="padding-top: 10px;">
        <div class="oit-avncs-sub-header-title">{this.props.title}</div>
        <Button
          label={'HOME'}
          onClick={() => this.props.uiService.navigateTo(NSS_AVNCS_MENU_URI)}
          buttonStyle="width: 130px; font-size: 28px; height: 50px;"
        />
        <Button
          label={'BACK'}
          disabled={this.backDisabled}
          onClick={() => this.props.uiService.navigateTo('back')}
          buttonStyle="width: 130px; font-size: 28px; height: 50px; margin-left: 10px;"
        />
        <Button
          label={'FORWARD'}
          disabled={this.forwardDisabled}
          onClick={() => this.props.uiService.navigateTo('forward')}
          buttonStyle="width: 130px; font-size: 28px; height: 50px; margin-left: 10px;"
        />
        <Button
          label={'PRINT'}
          disabled={this.print.disabled}
          onClick={() => this.props.uiService.runPageFunction('print')}
          buttonStyle="width: 130px; font-size: 28px; height: 50px; margin-left: 10px;"
        />
        <Button
          label={'UPDATE'}
          disabled={this.onMenuPage}
          onClick={() => this.update()}
          buttonStyle="width: 130px; font-size: 28px; height: 50px; margin-left: 10px;"
        />
        <Button
          label={'HELP'}
          disabled={true}
          onClick={() => {}}
          buttonStyle="width: 130px; font-size: 28px; height: 50px; margin-left: 10px;"
        />
        <Button
          label={'CLOSE'}
          disabled={this.onMenuPage}
          onClick={() => this.close()}
          buttonStyle="width: 130px; font-size: 28px; height: 50px; margin-left: 10px;"
        />
        <div style="flex-grow: 1;" />
      </div>
    );
  }
}
