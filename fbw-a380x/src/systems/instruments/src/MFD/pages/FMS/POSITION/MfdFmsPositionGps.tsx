// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { coordinateToString } from '@flybywiresim/fbw-sdk';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { noPositionAvailableText } from '../../../shared/utils';

import { fcomAt } from '../../common/FcomLayout';

import './MfdFmsPositionGps.scss';

interface MfdFmsPositionGpsProps extends AbstractMfdPageProps {}

/** The data of one GPS receiver shown on the page (A380 FCOM DSC-22-FMS-20-30, POSITION / GPS page). */
class GpsReceiverData {
  readonly position = Subject.create(noPositionAvailableText);

  readonly mode = Subject.create('----');

  readonly satellites = Subject.create('--');

  readonly accuracy = Subject.create('---');

  readonly track = Subject.create('---.-');

  readonly utcTime = Subject.create('--:--:--');

  readonly altitude = Subject.create('-----');

  readonly groundSpeed = Subject.create('---');

  /**
   * The simulator has no satellite constellation model. Until the MMR is modelled, the satellite count and the
   * horizontal figure of merit are stand-in values, drawn once per page view as on the A32NX MCDU GPS MONITOR page
   * (8 to 12 satellites, 40 to 49 ft of merit; the FCOM figure shows the accuracy in FT).
   */
  readonly standInSatellites = Math.floor(Math.random() * 5) + 8;

  readonly standInHfomFeet = Math.floor(Math.random() * 10) + 40;
}

/**
 * POSITION / GPS page (A380 FCOM DSC-22-FMS-20-30 "POSITION / GPS PAGE"): GPS 1 and GPS 2 position, mode, number of
 * satellites, accuracy (HFOM), true track, UTC time, altitude and ground speed. Both receivers show the simulator's
 * single GPS solution until the MMR is modelled.
 */
export class MfdFmsPositionGps extends FmsPage<MfdFmsPositionGpsProps> {
  private readonly receivers = [new GpsReceiverData(), new GpsReceiverData()];

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('realTime')
        .atFrequency(1)
        .handle(() => this.updateReceivers()),
    );
    this.updateReceivers();
  }

  protected onNewData(): void {
    // The page has no flight plan data
  }

  private updateReceivers(): void {
    // TODO replace with the MMR outputs once the MMR is modelled
    const lat = SimVar.GetSimVarValue('GPS POSITION LAT', 'degree latitude');
    const long = SimVar.GetSimVarValue('GPS POSITION LON', 'degree longitude');
    const altitude = SimVar.GetSimVarValue('GPS POSITION ALT', 'feet');
    const trueTrack = SimVar.GetSimVarValue('GPS GROUND TRUE TRACK', 'degrees');
    const groundSpeed = SimVar.GetSimVarValue('GPS GROUND SPEED', 'knots');
    const utcSeconds = Math.floor(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds'));

    const hours = Math.floor(utcSeconds / 3600) % 24;
    const minutes = Math.floor((utcSeconds % 3600) / 60);
    const seconds = utcSeconds % 60;
    const utc = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    for (const receiver of this.receivers) {
      receiver.position.set(coordinateToString({ lat, long }, false));
      receiver.mode.set('NAV');
      receiver.satellites.set(receiver.standInSatellites.toFixed(0));
      receiver.accuracy.set(receiver.standInHfomFeet.toFixed(0));
      receiver.track.set((Math.round(trueTrack * 10) / 10).toFixed(1));
      receiver.utcTime.set(utc);
      receiver.altitude.set(Math.round(altitude).toFixed(0));
      receiver.groundSpeed.set(Math.round(groundSpeed).toFixed(0));
    }
  }

  /**
   * The values of one receiver. The rows, the value right edges and the 448 px offset between GPS 1 and GPS 2 follow
   * the FCOM figure (DSC-22-FMS-20-30 P 271); positions are page container coordinates.
   */
  private renderReceiver(index: number): VNode {
    const data = this.receivers[index];
    const offset = index * 448;
    const right = (edge: number) => `right: ${768 - edge - offset}px;`;
    const unitLeft = (left: number) => `left: ${left + offset}px;`;
    return (
      <>
        <div class="mfd-position-gps-item mfd-position-gps-title" style={`top: -2px; left: ${104 + offset}px;`}>
          <span class="mfd-label">{`GPS ${index + 1}`}</span>
        </div>
        {/* FCOM: the two positions fill one line, GPS 2 starts at x = 415 */}
        <div class="mfd-position-gps-item" style={`top: 38px; left: ${index === 0 ? 12 : 415}px;`}>
          <span class="mfd-value bigger">{data.position}</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 81px; ${right(185)}`}>
          <span class="mfd-value bigger">{data.mode}</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 121px; ${right(185)}`}>
          <span class="mfd-value bigger">{data.satellites}</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 166px; ${right(195)}`}>
          <span class="mfd-value bigger">{data.accuracy}</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 166px; ${unitLeft(199)}`}>
          <span class="mfd-label-unit">FT</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 208px; ${right(195)}`}>
          <span class="mfd-value bigger">{data.track}</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 208px; ${unitLeft(199)}`}>
          <span class="mfd-label-unit">°T</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 250px; ${right(222)}`}>
          <span class="mfd-value bigger">{data.utcTime}</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 292px; ${right(195)}`}>
          <span class="mfd-value bigger">{data.altitude}</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 292px; ${unitLeft(199)}`}>
          <span class="mfd-label-unit">FT</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 333px; ${right(195)}`}>
          <span class="mfd-value bigger">{data.groundSpeed}</span>
        </div>
        <div class="mfd-position-gps-item" style={`top: 333px; ${unitLeft(199)}`}>
          <span class="mfd-label-unit">KT</span>
        </div>
      </>
    );
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-page-container" style="position: relative;">
          <div class="mfd-position-gps-canvas">
            {this.renderReceiver(0)}
            {this.renderReceiver(1)}
            <div class="mfd-position-gps-item mfd-position-gps-label" style="top: 81px;">
              <span class="mfd-label">MODE</span>
            </div>
            <div class="mfd-position-gps-item mfd-position-gps-label" style="top: 121px;">
              <span class="mfd-label">NBR OF SAT</span>
            </div>
            <div class="mfd-position-gps-item mfd-position-gps-label" style="top: 166px;">
              <span class="mfd-label">ACCURACY</span>
            </div>
            <div class="mfd-position-gps-item mfd-position-gps-label" style="top: 208px;">
              <span class="mfd-label">TRK</span>
            </div>
            <div class="mfd-position-gps-item mfd-position-gps-label" style="top: 250px;">
              <span class="mfd-label">UTC</span>
            </div>
            <div class="mfd-position-gps-item mfd-position-gps-label" style="top: 292px;">
              <span class="mfd-label">ALT</span>
            </div>
            <div class="mfd-position-gps-item mfd-position-gps-label" style="top: 333px;">
              <span class="mfd-label">GND SPD</span>
            </div>
            <div class="mfd-position-gps-separator" />
          </div>
          {/* FCOM: the RETURN button displays the POSITION / MONITOR page */}
          <div class="mfd-fcom-overlay">
            {fcomAt(
              797,
              1,
              <Button
                label="RETURN"
                onClick={() => this.props.mfd.uiService.navigateTo('fms/position/monitor')}
                buttonStyle="width: 100px;"
              />,
            )}
          </div>
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
