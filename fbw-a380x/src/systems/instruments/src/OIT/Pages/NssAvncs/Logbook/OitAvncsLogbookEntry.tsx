//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { LOGBOOK_URI } from './LogbookFlows';

interface OitAvncsLogbookEntryProps extends AbstractOitAvncsPageProps {}

const BUTTON_STYLE = 'width: 320px; margin-top: 14px;';

/**
 * The LOGBOOK ENTRY page: the assistants to record a defect, from the ECAM alerts or the cabin items, from the
 * standard defect database (SYSTEM & FUNCTION, COCKPIT INTERFACE, KEYWORD) or as FREE TEXT.
 */
export class OitAvncsLogbookEntry extends DestroyableComponent<OitAvncsLogbookEntryProps> {
  private button(label: string, uri: string): VNode {
    return <Button label={label} onClick={() => this.props.uiService.navigateTo(uri)} buttonStyle={BUTTON_STYLE} />;
  }

  render(): VNode {
    return (
      <>
        <div class="oit-logbook-row" style="align-items: stretch; margin-top: 40px;">
          <div class="oit-logbook-column" style="flex: 1; align-items: center;">
            <div class="oit-logbook-section oit-logbook-column" style="align-items: center; padding: 20px 30px;">
              <span>VALIDATE ITEM FROM:</span>
              {this.button('ECAM ALERTS', LOGBOOK_URI.ecamAlerts)}
              {this.button('CABIN ITEMS', LOGBOOK_URI.cabinItems)}
            </div>
          </div>
          <div style="border-left: 1px solid #c4c6cf; margin: 0px 20px;" />
          <div class="oit-logbook-column" style="flex: 1; align-items: center;">
            <div class="oit-logbook-section oit-logbook-column" style="align-items: center; padding: 20px 30px;">
              <span>{'SEARCH & VALIDATE ITEM BY:'}</span>
              {this.button('SYSTEM & FUNCTION', LOGBOOK_URI.systemFunction)}
              {this.button('COCKPIT INTERFACE', LOGBOOK_URI.cockpitInterface)}
              {this.button('KEYWORD', LOGBOOK_URI.keyword)}
            </div>
          </div>
        </div>
        <div class="oit-logbook-separator" style="margin: 50px 60px 30px 60px;" />
        <div class="oit-logbook-column" style="align-items: center;">
          <div class="oit-logbook-section oit-logbook-column" style="align-items: center; padding: 20px 30px;">
            <span>VALIDATE NON-LISTED ITEM:</span>
            {this.button('FREE TEXT', LOGBOOK_URI.freeText)}
          </div>
        </div>
        <div style="flex: 1;" />
        <div class="oit-logbook-bottom-buttons">
          <Button label="STATUS" onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)} />
        </div>
      </>
    );
  }
}
