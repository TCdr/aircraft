// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';

import './MfdAtccomConnect.scss';

import { AtccomMfdPageProps } from '../../MFD';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { fcomAt } from '../common/FcomLayout';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { RadioButtonGroup } from '../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { AtccomFooter } from './MfdAtccomFooter';
import { MaxUplinkDelayFormat } from './AtccomEntryFormats';

/**
 * CONNECT/MAX UPLINK DELAY page (A380 FCOM DSC-46-10-20-30 P 9-10), laid out on the FCOM figure (page coordinates =
 * display y - 143): NONE (default) or SET MAX UPLINK DELAY TO, whose entry field appears when selected (amber boxes
 * until a value is entered), and the active ATC center.
 */
export class MfdAtccomMaxUplinkDelay extends DisplayComponent<AtccomMfdPageProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly option = Subject.create<number | null>(this.props.atcService.maxUplinkDelay.get() === null ? 0 : 1);

  private readonly delay = Subject.create<number | null>(this.props.atcService.maxUplinkDelay.get());

  private readonly fieldVisibility = this.option.map((option) => (option === 1 ? 'inherit' : 'hidden'));

  private readonly activeAtc = this.props.atcService.stationStatus.map((status) => status.current || '----');

  private readonly activeAtcClass = this.props.atcService.stationStatus.map((status) =>
    status.current ? 'mfd-value green' : 'mfd-value',
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.fieldVisibility,
      this.activeAtc,
      this.activeAtcClass,
      this.props.atcService.maxUplinkDelay.sub((delay) => {
        this.delay.set(delay);
        if (delay !== null) {
          this.option.set(1);
        }
      }),
    );
  }

  private onOptionSelected(option: number): void {
    this.option.set(option);
    if (option === 0) {
      this.props.atcService.setMaxUplinkDelay(null);
    }
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  render(): VNode {
    return (
      <>
        <ActivePageTitleBar activePage={Subject.create(this.props.pageTitle ?? '')} offset={Subject.create('')} />
        {/* begin page content */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-atccom-connect">
            {fcomAt(164, 57, <span class="mfd-label">MAX UPLINK DELAY :</span>)}
            <div class="mfd-atccom-radio" style="left: 52px; top: 145px;">
              <RadioButtonGroup
                values={['NONE', 'SET MAX UPLINK DELAY TO']}
                selectedIndex={this.option}
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_atccomMaxUplinkDelay`}
                onModified={(option) => this.onOptionSelected(option)}
                additionalVerticalSpacing={84}
              />
            </div>
            <div class="mfd-fcom-item" style="top: 359px; left: 581px;">
              <div style={{ visibility: this.fieldVisibility }}>
                <InputField<number>
                  dataEntryFormat={new MaxUplinkDelayFormat()}
                  value={this.delay}
                  mandatory={Subject.create(true)}
                  dataHandlerDuringValidation={async (delay) => this.props.atcService.setMaxUplinkDelay(delay)}
                  containerStyle="width: 120px;"
                  alignText="center"
                  errorHandler={(e) => this.props.atcService.showAtcErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />
              </div>
            </div>
            {fcomAt(409, 110, <span class="mfd-label">(ONLY ON DEMAND OF ACTIVE ATC)</span>)}
            {fcomAt(461, 110, <span class="mfd-label">ACTIVE ATC :</span>)}
            {fcomAt(461, 307, <span class={this.activeAtcClass}>{this.activeAtc}</span>)}
          </div>
        </div>
        {/* end page content */}
        <AtccomFooter bus={this.props.bus} mfd={this.props.mfd} atcService={this.props.atcService} />
      </>
    );
  }
}
