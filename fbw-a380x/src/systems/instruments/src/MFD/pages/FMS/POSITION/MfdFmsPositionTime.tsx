// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, ClockEvents, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { FmsTimeKeeper, FmsTimeReference, fmsTimeReferenceLabels } from '../../../FMC/FmsTimeKeeper';

import './MfdFmsPositionTime.scss';

interface MfdFmsPositionTimeProps extends AbstractMfdPageProps {}

/**
 * POSITION / TIME page: UTC time and date, the flight and block times of the current flight (from the OOOI block
 * events), and the PERM DATA SETUP that selects the time reference of the FMS pages (FLT TIME / BLK TIME / DATE /
 * UTC ONLY). This page is not described in the available A380 FCOM (DSC-22-FMS-20-30); the layout follows the
 * reference screenshots.
 */
export class MfdFmsPositionTime extends FmsPage<MfdFmsPositionTimeProps> {
  private readonly timeKeeper = this.props.fmcService.master.timeKeeper;

  private readonly utcTime = Subject.create('--:--:--');

  private readonly flightTime = Subject.create('--:--');

  private readonly blockTime = Subject.create('--:--');

  private readonly outBlockTime = Subject.create('--:--');

  private readonly offBlockTime = Subject.create('--:--');

  private readonly onBlockTime = Subject.create('--:--');

  private readonly inBlockTime = Subject.create('--:--');

  private readonly timeReferenceLabels = ArraySubject.create([...fmsTimeReferenceLabels]);

  private readonly selectedTimeReference = Subject.create<number | null>(this.timeKeeper.timeReference.get());

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('realTime')
        .atFrequency(1)
        .handle(() => this.updateTimes()),
      this.timeKeeper.timeReference.sub((v) => this.selectedTimeReference.set(v), true),
    );
    this.updateTimes();
  }

  protected onNewData(): void {
    // The page has no flight plan data
  }

  private updateTimes(): void {
    this.utcTime.set(FmsTimeKeeper.formatHoursMinutesSeconds(this.timeKeeper.utcSeconds.get()));
    this.flightTime.set(FmsTimeKeeper.formatHoursMinutes(this.timeKeeper.flightTime.get()));
    this.blockTime.set(FmsTimeKeeper.formatHoursMinutes(this.timeKeeper.blockTime.get()));
    this.outBlockTime.set(this.formatUtc(this.timeKeeper.outBlockTime.get()));
    this.offBlockTime.set(this.formatUtc(this.timeKeeper.offBlockTime.get()));
    this.onBlockTime.set(this.formatUtc(this.timeKeeper.onBlockTime.get()));
    this.inBlockTime.set(this.formatUtc(this.timeKeeper.inBlockTime.get()));
  }

  /** Block events are always shown as UTC on this page, whatever the time reference. */
  private formatUtc(absoluteTimeSeconds: number | null): string {
    if (absoluteTimeSeconds === null) {
      return '--:--';
    }
    const nowAbsolute = SimVar.GetGlobalVarValue('ABSOLUTE TIME', 'seconds');
    const utc = this.timeKeeper.utcSeconds.get() + (absoluteTimeSeconds - nowAbsolute);
    return FmsTimeKeeper.formatHoursMinutes(((utc % 86_400) + 86_400) % 86_400);
  }

  private onTimeReferenceModified(index: number | null): void {
    if (index !== null && index >= FmsTimeReference.FlightTime && index <= FmsTimeReference.UtcOnly) {
      this.timeKeeper.setTimeReference(index as FmsTimeReference);
    }
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-page-container">
          <div class="mfd-position-time-block">
            <div class="mfd-position-time-row">
              <span class="mfd-label mfd-position-time-label">UTC</span>
              <span class="mfd-value bigger">{this.utcTime}</span>
            </div>
            <div class="mfd-position-time-row">
              <span class="mfd-label mfd-position-time-label">DATE</span>
              <span class="mfd-value bigger">{this.timeKeeper.utcDate}</span>
            </div>
          </div>
          <div class="mfd-position-time-block">
            <div class="mfd-position-time-row">
              <span class="mfd-label mfd-position-time-label">FLT TIME</span>
              <span class="mfd-value bigger">{this.flightTime}</span>
            </div>
            <div class="mfd-position-time-row">
              <span class="mfd-label mfd-position-time-label">BLK TIME</span>
              <span class="mfd-value bigger">{this.blockTime}</span>
            </div>
          </div>
          <div class="mfd-position-time-block">
            <div class="mfd-position-time-row">
              <span class="mfd-label mfd-position-time-label">OUT</span>
              <span class="mfd-value bigger mfd-position-time-event">{this.outBlockTime}</span>
              <span class="mfd-label mfd-position-time-label-short">OFF</span>
              <span class="mfd-value bigger mfd-position-time-event">{this.offBlockTime}</span>
            </div>
            <div class="mfd-position-time-row">
              <span class="mfd-label mfd-position-time-label">ON</span>
              <span class="mfd-value bigger mfd-position-time-event">{this.onBlockTime}</span>
              <span class="mfd-label mfd-position-time-label-short">IN</span>
              <span class="mfd-value bigger mfd-position-time-event">{this.inBlockTime}</span>
            </div>
          </div>
          <div class="mfd-position-time-row" style="margin-top: 30px;">
            <span class="mfd-label mfd-position-time-label">PERM DATA SETUP</span>
            <DropdownMenu
              idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_positionTimePermDataSetup`}
              selectedIndex={this.selectedTimeReference}
              values={this.timeReferenceLabels}
              freeTextAllowed={false}
              containerStyle="width: 200px;"
              alignLabels="center"
              numberOfDigitsForInputField={8}
              onModified={(i) => this.onTimeReferenceModified(i)}
              hEventConsumer={this.props.mfd.hEventConsumer}
              interactionMode={this.props.mfd.interactionMode}
            />
          </div>
          <div style="flex-grow: 1;" />
        </div>
        <Footer
          bus={this.props.bus}
          mfd={this.props.mfd}
          fmcService={this.props.fmcService}
          flightPlanInterface={this.props.fmcService.master.flightPlanInterface}
        />
      </>
    );
  }
}
