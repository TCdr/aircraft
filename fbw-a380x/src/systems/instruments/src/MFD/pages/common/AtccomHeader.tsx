// Copyright (c) 2024-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { AbstractHeader } from './AbstractHeader';
import { PageSelectorDropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/PageSelectorDropdownMenu';

/**
 * Header of the ATC COM pages: the general menu bar with its 6 menus (A380 FCOM DSC-46-10-20-20 P 3, DSC-46-10-20-30
 * P 1): CONNECT (NOTIFICATION, CONNECTION STATUS, MAX UPLINK DELAY), REQUEST, REPORT & MODIFY (POSITION, MODIFY,
 * OTHER REPORTS), MSG RECORD, ATIS and EMER. A box around the menu name shows the menu of the displayed page. The menu
 * widths are those of the FCOM figures.
 */
export class AtccomHeader extends AbstractHeader {
  private readonly connectIsSelected = Subject.create(false);

  private readonly requestIsSelected = Subject.create(false);

  private readonly reportModifyIsSelected = Subject.create(false);

  private readonly msgRecordIsSelected = Subject.create(false);

  private readonly atisIsSelected = Subject.create(false);

  private readonly emerIsSelected = Subject.create(false);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.props.uiService.activeUri.sub((val) => {
        this.connectIsSelected.set(val.category === 'connect');
        this.requestIsSelected.set(val.category === 'request');
        this.reportModifyIsSelected.set(val.category === 'report-modify');
        this.msgRecordIsSelected.set(val.category === 'msg-record');
        this.atisIsSelected.set(val.category === 'atis');
        this.emerIsSelected.set(val.category === 'emer');
      }, true),
    );
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  render(): VNode {
    // FCOM figure: the two-line menu names are in small font, in a row as high as the one-line menus
    const twoLines =
      'margin-top: 0; margin-bottom: 0; padding-top: 0; padding-bottom: 0; white-space: nowrap; font-size: 20px; line-height: 22px';
    return (
      <>
        {super.render()}
        <div class="mfd-header-page-select-row">
          <PageSelectorDropdownMenu
            isActive={this.connectIsSelected}
            label="CONNECT"
            menuItems={[
              { label: 'NOTIFICATION', action: () => this.props.uiService.navigateTo('atccom/connect/notification') },
              {
                label: 'CONNECTION STATUS',
                action: () => this.props.uiService.navigateTo('atccom/connect/connection-status'),
              },
              {
                label: 'MAX UPLINK DELAY',
                action: () => this.props.uiService.navigateTo('atccom/connect/max-uplink-delay'),
              },
            ]}
            idPrefix={`${this.props.uiService.captOrFo}_MFD_pageSelectorConnect`}
            containerStyle="flex: none; width: 145px;"
          />
          <PageSelectorDropdownMenu
            isActive={this.requestIsSelected}
            label="REQUEST"
            menuItems={[{ label: '', action: () => this.props.uiService.navigateTo('atccom/request') }]}
            idPrefix={`${this.props.uiService.captOrFo}_MFD_pageSelectorRequest`}
            containerStyle="flex: none; width: 130px;"
          />
          <PageSelectorDropdownMenu
            isActive={this.reportModifyIsSelected}
            label="REPORT<br />& MODIFY"
            menuItems={[
              { label: 'POSITION', action: () => this.props.uiService.navigateTo('atccom/report-modify/position') },
              { label: 'MODIFY', action: () => this.props.uiService.navigateTo('atccom/report-modify/modify') },
              {
                label: 'OTHER REPORTS',
                action: () => this.props.uiService.navigateTo('atccom/report-modify/other-reports'),
              },
            ]}
            idPrefix={`${this.props.uiService.captOrFo}_MFD_pageSelectorReportModify`}
            containerStyle="flex: none; width: 153px;"
            labelStyle={twoLines}
          />
          <PageSelectorDropdownMenu
            isActive={this.msgRecordIsSelected}
            label="MSG<br />RECORD"
            menuItems={[{ label: '', action: () => this.props.uiService.navigateTo('atccom/msg-record/list') }]}
            idPrefix={`${this.props.uiService.captOrFo}_MFD_pageSelectorMsgRecord`}
            containerStyle="flex: none; width: 132px;"
            labelStyle={twoLines}
          />
          <PageSelectorDropdownMenu
            isActive={this.atisIsSelected}
            label="ATIS"
            menuItems={[{ label: '', action: () => this.props.uiService.navigateTo('atccom/atis/list') }]}
            idPrefix={`${this.props.uiService.captOrFo}_MFD_pageSelectorAtis`}
            containerStyle="flex: none; width: 102px;"
          />
          <PageSelectorDropdownMenu
            isActive={this.emerIsSelected}
            label="EMER"
            menuItems={[{ label: '', action: () => this.props.uiService.navigateTo('atccom/emer') }]}
            idPrefix={`${this.props.uiService.captOrFo}_MFD_pageSelectorEmer`}
            containerStyle="flex: 1;"
            labelStyle="color: #000; background-color: #ff9601; background-clip: content-box"
          />
        </div>
      </>
    );
  }
}
