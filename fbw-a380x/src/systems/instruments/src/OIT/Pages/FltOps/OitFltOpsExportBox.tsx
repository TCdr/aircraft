//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ClockEvents,
  ConsumerSubject,
  DisplayComponent,
  FSComponent,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { AbstractOitFltOpsPageProps } from '../../OIT';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { formatOisDateTime } from '../../System/OisDateTime';
import { ExportBoxItem, exportStatusText } from '../../System/OisExportBox';
import { OitTickBox, recycleBinIcon } from './OitFltOpsBoxWidgets';

interface OitFltOpsExportBoxProps extends AbstractOitFltOpsPageProps {}

/** Rows shown. Design choice: a flight exports a handful of items, a few rows are plenty. */
const EXPORT_BOX_ROWS = 10;

/**
 * The EXPORT BOX: the data exported from the FLT FOLDER and the applications, sent to the ground (GND) or to a USB key
 * (USB) with SEND.
 */
export class OitFltOpsExportBox extends DisplayComponent<OitFltOpsExportBoxProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly exportBox = this.props.container.laptop.exportBox;

  private readonly simTime = ConsumerSubject.create(this.props.bus.getSubscriber<ClockEvents>().on('simTime'), 0);

  private readonly sendDisabled = this.exportBox.items.map(() => !this.exportBox.canSend());

  private readonly wirelessStatus = this.exportBox.gatelinkAvailable.map((available) =>
    available ? 'GATELINK AVAIL' : 'GATELINK NOT AVAIL',
  );

  /** The "COM with ground not available" pop-up */
  private readonly noComPopupHidden = Subject.create(true);

  private row<T>(index: number, value: (item: ExportBoxItem) => T, empty: T): Subscribable<T> {
    const mapped = this.exportBox.items.map((items) => (index < items.length ? value(items[index]) : empty));
    this.subs.push(mapped);
    return mapped;
  }

  private send(): void {
    if (this.exportBox.send(this.simTime.get()) === 'no-com') {
      this.noComPopupHidden.set(false);
    }
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(this.simTime, this.sendDisabled, this.wirelessStatus);
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
      <>
        {/* begin page content */}
        <div class="oit-page-container oit-box-page">
          <div class="oit-box-table">
            <div class="oit-box-row oit-box-header">
              <div class="oit-box-cell oit-box-tick-column">GND</div>
              <div class="oit-box-cell oit-box-tick-column">USB</div>
              <div class="oit-box-cell oit-export-box-identifier">DATA IDENTIFIER</div>
              <div class="oit-box-cell oit-export-box-date">DATE</div>
              <div class="oit-box-cell oit-export-box-source">SOURCE</div>
              <div class="oit-box-cell oit-export-box-status">STATUS</div>
              <div class="oit-box-cell oit-box-bin-column">
                <Button
                  label={
                    <div class="fr aic">
                      {recycleBinIcon()}
                      <span class="oit-box-bin-all">ALL</span>
                    </div>
                  }
                  onClick={() => this.exportBox.removeAll()}
                  buttonStyle="padding: 2px 4px;"
                />
              </div>
            </div>
            {Array.from({ length: EXPORT_BOX_ROWS }, (_, index) => (
              <div class={{ 'oit-box-row': true, hidden: this.row(index, () => false, true) }}>
                <div class="oit-box-cell oit-box-tick-column">
                  <OitTickBox
                    ticked={this.row(index, (item) => item.gnd, false)}
                    onClick={() => this.exportBox.toggleDestination(index, 'GND')}
                  />
                </div>
                <div class="oit-box-cell oit-box-tick-column">
                  <OitTickBox
                    ticked={this.row(index, (item) => item.usb, false)}
                    disabled={Subject.create(!this.exportBox.usbKeyPresent)}
                    onClick={() => this.exportBox.toggleDestination(index, 'USB')}
                  />
                </div>
                <div class="oit-box-cell oit-export-box-identifier left">
                  {this.row(index, (item) => item.identifier, '')}
                </div>
                <div class="oit-box-cell oit-export-box-date">
                  {this.row(index, (item) => formatOisDateTime(item.dateMs).replace(' ', '\n'), '')}
                </div>
                <div class="oit-box-cell oit-export-box-source">{this.row(index, (item) => item.source, '')}</div>
                <div
                  class={{
                    'oit-box-cell': true,
                    'oit-export-box-status': true,
                    left: true,
                    green: this.row(index, (item) => item.status.state === 'SENT', false),
                    blue: this.row(index, (item) => item.status.state === 'NOT SENT', false),
                  }}
                >
                  {this.row(index, (item) => exportStatusText(item.status), '')}
                </div>
                <div class="oit-box-cell oit-box-bin-column">
                  <Button
                    label={recycleBinIcon()}
                    onClick={() => this.exportBox.remove(index)}
                    buttonStyle="padding: 2px;"
                  />
                </div>
              </div>
            ))}
            <div class={{ 'oit-box-popup': true, hidden: this.noComPopupHidden }}>
              <div class="oit-box-popup-title">EXPORT BOX</div>
              <div class="oit-box-popup-text">
                COM with ground not available.
                <br />
                Move data to outbox? (Data will be sent when COM is available)
              </div>
              <div class="fr jc">
                <Button
                  label="OK"
                  onClick={() => {
                    this.exportBox.moveToOutbox();
                    this.noComPopupHidden.set(true);
                  }}
                  buttonStyle="font-size: 22px; width: 100px;"
                />
                <Button
                  label="Cancel"
                  onClick={() => this.noComPopupHidden.set(true)}
                  buttonStyle="font-size: 22px; width: 100px;"
                />
              </div>
            </div>
          </div>
          <div class="oit-box-bottom-row">
            <div style="flex-grow: 1" />
            <Button
              label="SEND"
              onClick={() => this.send()}
              disabled={this.sendDisabled}
              buttonStyle="font-size: 24px; width: 120px;"
            />
          </div>
          <div class="oit-export-box-footer">
            <div class="fr">
              <span class="oit-label bigger">WIRELESS STATUS:</span>
              <span class="oit-label bigger green" style="margin-left: 20px;">
                {this.wirelessStatus}
              </span>
            </div>
            <div class="fr" style="margin-top: 15px; padding-left: 110px;">
              <span class="oit-label bigger">USB KEY:</span>
              <span class="oit-label bigger" style="margin-left: 20px;">
                NO KEY
              </span>
            </div>
          </div>
        </div>
        {/* end page content */}
      </>
    );
  }
}
