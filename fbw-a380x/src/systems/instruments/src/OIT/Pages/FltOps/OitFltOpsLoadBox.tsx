//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ConsumerSubject,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { AbstractOitFltOpsPageProps } from '../../OIT';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { OitSimvars } from '../../OitSimvarPublisher';
import { LoadBoxItem, LoadBoxLaptop, LoadBoxStatus } from '../../System/OisLoadBox';
import { OitTickBox, recycleBinIcon } from './OitFltOpsBoxWidgets';

interface OitFltOpsLoadBoxProps extends AbstractOitFltOpsPageProps {}

/** Rows shown. Design choice: the ground sends one EFF per flight, a few rows are plenty. */
const LOAD_BOX_ROWS = 10;

/**
 * The LOAD BOX: the data available to load into the laptops (the EFF of the airline OFP, sent from the ground) and its
 * loading status on each laptop. Opening it detects new data, like REFRESH LOAD BOX.
 */
export class OitFltOpsLoadBox extends DisplayComponent<OitFltOpsLoadBoxProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly loadBox = this.props.container.laptop.loadBox;

  private readonly ownLaptop = this.props.uiService.captOrFo;

  private readonly otherLaptopHealthy = ConsumerSubject.create(
    this.props.bus.getSubscriber<OitSimvars>().on(this.ownLaptop === 'CAPT' ? 'laptopFoHealthy' : 'laptopCaptHealthy'),
    false,
  );

  private readonly allTicked = this.loadBox.items.map(() => this.loadBox.allSelected());

  private readonly refreshDisabled = MappedSubject.create(
    ([refreshing, standalone]) => refreshing || standalone,
    this.loadBox.refreshing,
    this.props.container.laptop.standalone,
  );

  private row<T>(index: number, value: (item: LoadBoxItem) => T, empty: T): Subscribable<T> {
    const mapped = this.loadBox.items.map((items) => (index < items.length ? value(items[index]) : empty));
    this.subs.push(mapped);
    return mapped;
  }

  private statusCell(index: number, laptop: LoadBoxLaptop): VNode {
    const status = this.row<LoadBoxStatus | ''>(index, (item) => item.status[laptop], '');
    const loaded = status.map((s) => s === 'LOADED');
    const notLoaded = status.map((s) => s === 'NOT LOADED');
    this.subs.push(loaded, notLoaded);
    return <div class={{ 'oit-box-cell': true, 'oit-box-status': true, green: loaded, blue: notLoaded }}>{status}</div>;
  }

  private refresh(): void {
    // Not awaited: the LOAD BOX shows the new data when the ground answers.
    this.loadBox.refresh(this.props.container.laptop.isGroundWirelessAvailable());
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(this.otherLaptopHealthy, this.allTicked, this.refreshDisabled);

    this.refresh();
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
              <div class="oit-box-cell oit-box-tick-column">
                <OitTickBox ticked={this.allTicked} onClick={() => this.loadBox.toggleAll()} />
              </div>
              <div class="oit-box-cell oit-load-box-identifier">DATA IDENTIFIER</div>
              <div class="oit-box-cell oit-load-box-column">GENERATED</div>
              <div class="oit-box-cell oit-load-box-column">DESTINATION</div>
              <div class="oit-box-cell oit-load-box-column">
                CAPT
                <br />
                STATUS
              </div>
              <div class="oit-box-cell oit-load-box-column">
                F/O
                <br />
                STATUS
              </div>
              <div class="oit-box-cell oit-load-box-column">
                BACKUP
                <br />
                STATUS
              </div>
              <div class="oit-box-cell oit-box-bin-column">
                <Button
                  label={
                    <div class="fr aic">
                      {recycleBinIcon()}
                      <span class="oit-box-bin-all">ALL</span>
                    </div>
                  }
                  onClick={() => this.loadBox.removeAll()}
                  buttonStyle="padding: 2px 4px;"
                />
              </div>
            </div>
            {Array.from({ length: LOAD_BOX_ROWS }, (_, index) => (
              <div class={{ 'oit-box-row': true, hidden: this.row(index, () => false, true) }}>
                <div class="oit-box-cell oit-box-tick-column">
                  <OitTickBox
                    ticked={this.row(index, (item) => item.selected, false)}
                    onClick={() => this.loadBox.toggle(index)}
                  />
                </div>
                <div class="oit-box-cell oit-load-box-identifier oit-box-link">
                  {this.row(index, (item) => item.identifier, '')}
                </div>
                <div class="oit-box-cell oit-load-box-column">UNKNOWN</div>
                <div class="oit-box-cell oit-load-box-column">{this.row(index, (item) => item.destination, '')}</div>
                {this.statusCell(index, 'CAPT')}
                {this.statusCell(index, 'FO')}
                {this.statusCell(index, 'BACKUP')}
                <div class="oit-box-cell oit-box-bin-column">
                  <Button
                    label={recycleBinIcon()}
                    onClick={() => this.loadBox.remove(index)}
                    buttonStyle="padding: 2px;"
                  />
                </div>
              </div>
            ))}
          </div>
          <div class="oit-box-bottom-row">
            <Button
              label="REFRESH LOAD BOX"
              onClick={() => this.refresh()}
              disabled={this.refreshDisabled}
              buttonStyle="font-size: 24px;"
            />
            <div style="flex-grow: 1" />
            <Button
              label="LOAD"
              onClick={() =>
                this.loadBox.load(
                  this.ownLaptop,
                  !this.props.container.laptop.standalone.get(),
                  this.otherLaptopHealthy.get(),
                )
              }
              buttonStyle="font-size: 24px; width: 120px;"
            />
            {/* The loading is immediate in the sim: there is never a loading to abort */}
            <Button label="ABORT" onClick={() => {}} disabled={Subject.create(true)} buttonStyle="font-size: 24px;" />
          </div>
        </div>
        {/* end page content */}
      </>
    );
  }
}
