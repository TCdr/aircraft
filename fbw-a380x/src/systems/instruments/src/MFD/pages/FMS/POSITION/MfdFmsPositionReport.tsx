// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { Units } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import {
  inboundPointIdent,
  outboundPointIdent,
  pposPointIDent,
  turningPointIdent,
} from '@fmgc/flightplanning/legs/FlightPlanLegNaming';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { PseudoWaypoint } from '@fmgc/guidance/PseudoWaypoint';
import { FmgcFlightPhase } from '@shared/flightphase';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { FreeTextFormat } from '../../common/DataEntryFormats';
import { FmsTimeReference } from '../../../FMC/FmsTimeKeeper';

import './MfdFmsPositionReport.scss';

interface MfdFmsPositionReportProps extends AbstractMfdPageProps {}

/** One line of the waypoint data table: ident, time (UTC or flight time) and altitude. */
class WaypointLine {
  readonly ident = Subject.create('-------');

  readonly time = Subject.create('--:--');

  readonly altitude = Subject.create('-----');
}

/** Legs whose fix is not a navigation database or pilot stored waypoint (FCOM: "T-P, PPOS, IN-BND, etc") */
const nonWaypointIdents: ReadonlySet<string> = new Set([
  turningPointIdent,
  pposPointIDent,
  inboundPointIdent,
  outboundPointIdent,
]);

/** Pseudo waypoints that are a cruise vertical profile change (FCOM: S/C, S/D, T/D), keyed by their F-PLN ident */
const cruiseProfileChangeTypes: ReadonlyMap<string, string> = new Map([
  ['(S/C)', 'S/C'],
  ['(S/D)', 'S/D'],
  ['(T/D)', 'T/D'],
]);

/**
 * POSITION / REPORT page (A380 FCOM DSC-22-FMS-20-30 "POSITION / REPORT PAGE"): recorded data of the last sequenced
 * waypoint, predictions for the TO and NEXT waypoints, the next cruise vertical profile change (in cruise only) and
 * the destination, plus a free text for the position report. Times follow the PERM DATA SETUP (UTC or flight time).
 *
 * Not modelled: sending the report to the airline via ACARS (SEND REPORT).
 */
export class MfdFmsPositionReport extends FmsPage<MfdFmsPositionReportProps> {
  private readonly timeKeeper = this.props.fmcService.master.timeKeeper;

  private readonly lastSequenced = new WaypointLine();

  private readonly toWaypoint = new WaypointLine();

  private readonly nextWaypoint = new WaypointLine();

  private readonly lastSequencedSat = Subject.create('---');

  private readonly lastSequencedWindDirection = Subject.create('---');

  private readonly lastSequencedWindSpeed = Subject.create('---');

  private readonly lastSequencedFob = Subject.create('---.-');

  /** FCOM: times are UTC, or the flight time when the PERM DATA SETUP asks for it */
  private readonly timeHeader = this.timeKeeper.timeReference.map((reference) =>
    reference === FmsTimeReference.FlightTime || reference === FmsTimeReference.BlockTime ? 'TIME' : 'UTC',
  );

  private readonly profileChangeType = Subject.create('NONE');

  private readonly profileChangeWaypoint = Subject.create('-------');

  private readonly profileChangeAltitude = Subject.create('-----');

  private readonly profileChangeTime = Subject.create('--:--');

  private readonly profileChangeDistance = Subject.create('----');

  private readonly profileChangeDataVisible = this.profileChangeType.map((type) =>
    type === 'NONE' ? 'hidden' : 'inherit',
  );

  private readonly destinationIdent = Subject.create('NONE');

  private readonly destinationTime = Subject.create('--:--');

  private readonly destinationDistance = Subject.create('----');

  private readonly destinationEfob = Subject.create('---.-');

  private readonly destinationDataVisible = this.destinationIdent.map((ident) =>
    ident === 'NONE' ? 'hidden' : 'inherit',
  );

  private readonly freeText = Subject.create<string | null>(null);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.timeHeader,
      this.profileChangeDataVisible,
      this.destinationDataVisible,
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('realTime')
        .atFrequency(1)
        .handle(() => this.updateReport()),
    );
  }

  protected onNewData(): void {
    this.updateReport();
  }

  private updateReport(): void {
    const fmc = this.props.fmcService.master;
    if (!fmc || !this.props.flightPlanInterface.hasActive) {
      return;
    }
    const plan = this.props.flightPlanInterface.active;
    const transitionAltitude = plan.performanceData.transitionAltitude.get();

    this.updateLastSequencedWaypoint(transitionAltitude);
    this.updateToAndNextWaypoints(plan, transitionAltitude);
    this.updateCruiseProfileChange(plan, transitionAltitude);
    this.updateDestination(plan);
  }

  private updateLastSequencedWaypoint(transitionAltitude: number | null): void {
    const record = this.props.fmcService.master.lastSequencedWaypoint;
    this.lastSequenced.ident.set(record?.ident ?? '-------');
    this.lastSequenced.time.set(this.timeKeeper.formatEventTime(record?.absoluteTimeSeconds ?? null));
    this.lastSequenced.altitude.set(formatAltitude(record?.altitude ?? null, transitionAltitude));

    const sat = record?.staticAirTemperature ?? null;
    this.lastSequencedSat.set(sat !== null ? `${sat >= 0 ? '+' : '-'}${Math.abs(Math.round(sat))}` : '---');
    const windDirection = record?.windDirection ?? null;
    this.lastSequencedWindDirection.set(
      windDirection !== null ? (Math.round(windDirection) % 360).toFixed(0).padStart(3, '0') : '---',
    );
    const windSpeed = record?.windSpeed ?? null;
    this.lastSequencedWindSpeed.set(windSpeed !== null ? Math.round(windSpeed).toFixed(0).padStart(3, '0') : '---');
    this.lastSequencedFob.set(formatTonnes(record?.fuelOnBoard ?? null));
  }

  /** TO and NEXT are the next two navigation database or pilot stored waypoints of the flight plan (FCOM). */
  private updateToAndNextWaypoints(plan: ReadonlyFlightPlan, transitionAltitude: number | null): void {
    const predictions =
      plan.index === FlightPlanIndex.Active
        ? this.props.fmcService.master.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions
        : undefined;

    const lines = [this.toWaypoint, this.nextWaypoint];
    let lineIndex = 0;
    for (let i = Math.max(0, plan.activeLegIndex); i < plan.firstMissedApproachLegIndex && lineIndex < 2; i++) {
      const leg = plan.maybeElementAt(i);
      if (!isLeg(leg) || !leg.isXF() || nonWaypointIdents.has(leg.ident)) {
        continue;
      }

      const prediction = predictions?.get(i);
      const line = lines[lineIndex++];
      line.ident.set(leg.ident);
      line.time.set(this.timeKeeper.formatEta(prediction?.secondsFromPresent));
      line.altitude.set(formatAltitude(prediction?.altitude ?? null, transitionAltitude));
    }
    for (; lineIndex < 2; lineIndex++) {
      lines[lineIndex].ident.set('-------');
      lines[lineIndex].time.set('--:--');
      lines[lineIndex].altitude.set('-----');
    }
  }

  /** The next S/C, S/D or T/D ahead of the aircraft, from the vertical profile's pseudo waypoints. */
  private updateCruiseProfileChange(plan: ReadonlyFlightPlan, transitionAltitude: number | null): void {
    const pseudoWaypoints: readonly PseudoWaypoint[] =
      this.props.fmcService.master.guidanceController?.pseudoWaypoints?.pseudoWaypoints ?? [];

    let next: PseudoWaypoint | undefined;
    for (const pwp of pseudoWaypoints) {
      const distance = pwp.flightPlanInfo?.distanceFromAircraft;
      if (
        cruiseProfileChangeTypes.has(pwp.ident) &&
        distance !== undefined &&
        distance > 0 &&
        (next === undefined || distance < (next.flightPlanInfo?.distanceFromAircraft ?? Infinity))
      ) {
        next = pwp;
      }
    }

    if (
      this.activeFlightPhase.get() !== FmgcFlightPhase.Cruise ||
      next === undefined ||
      next.flightPlanInfo === undefined
    ) {
      this.profileChangeType.set('NONE');
      this.profileChangeWaypoint.set('-------');
      this.profileChangeAltitude.set('-----');
      this.profileChangeTime.set('--:--');
      this.profileChangeDistance.set('----');
      return;
    }

    const leg = plan.maybeElementAt(next.alongLegIndex);
    const startWaypointIdent = isLeg(leg) ? leg.ident : '-------';
    // A step starts at its waypoint towards the step altitude; a T/D leaves the current altitude (FCOM: "target
    // altitude (or current altitude)")
    const targetAltitude = (isLeg(leg) ? leg.cruiseStep?.toAltitude : undefined) ?? next.flightPlanInfo.altitude;

    this.profileChangeType.set(cruiseProfileChangeTypes.get(next.ident) ?? 'NONE');
    this.profileChangeWaypoint.set(startWaypointIdent);
    this.profileChangeAltitude.set(formatAltitude(targetAltitude, transitionAltitude));
    this.profileChangeTime.set(this.timeKeeper.formatEta(next.flightPlanInfo.secondsFromPresent));
    this.profileChangeDistance.set(Math.round(next.flightPlanInfo.distanceFromAircraft).toFixed(0));
  }

  private updateDestination(plan: ReadonlyFlightPlan): void {
    const prediction = this.props.fmcService.master.guidanceController?.vnavDriver?.getDestinationPrediction();
    this.destinationIdent.set(plan.destinationAirport?.ident ?? 'NONE');
    this.destinationTime.set(this.timeKeeper.formatEta(prediction?.secondsFromPresent));
    this.destinationDistance.set(prediction ? Math.round(prediction.distanceFromAircraft).toFixed(0) : '----');
    this.destinationEfob.set(
      formatTonnes(prediction ? Units.poundToKilogram(prediction.estimatedFuelOnBoard) / 1000 : null),
    );
  }

  /** Altitude as in the FCOM figure: a small blue FL before a flight level, FT after an altitude in feet. */
  private static renderAltitude(altitude: Subscribable<string>): VNode {
    return (
      <>
        <span class="mfd-label-unit mfd-unit-leading">{altitude.map((a) => (a.startsWith('FL') ? 'FL' : ''))}</span>
        <span class="mfd-value bigger">{altitude.map((a) => (a.startsWith('FL') ? a.substring(2) : a))}</span>
        <span class="mfd-label-unit mfd-unit-trailing">
          {altitude.map((a) => (a.startsWith('FL') || a.startsWith('-') ? '' : 'FT'))}
        </span>
      </>
    );
  }

  /** One line of the waypoint data table, at the FCOM p.309 positions (container coordinates). */
  private renderWaypointLine(label: string, line: WaypointLine, top: number): VNode {
    return (
      <>
        <div class="mfd-position-report-item mfd-position-report-wpt-label" style={`top: ${top}px;`}>
          <span class="mfd-label">{label}</span>
        </div>
        <div class="mfd-position-report-item" style={`top: ${top}px; left: 207px;`}>
          <span class="mfd-value bigger">{line.ident}</span>
        </div>
        <div class="mfd-position-report-item mfd-position-report-time-column" style={`top: ${top}px;`}>
          <span class="mfd-value bigger">{line.time}</span>
        </div>
        <div class="mfd-position-report-item mfd-position-report-alt-column" style={`top: ${top}px;`}>
          {MfdFmsPositionReport.renderAltitude(line.altitude)}
        </div>
      </>
    );
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-page-container">
          {/* Positions follow the FCOM figure (DSC-22-FMS-20-30 P 309): four data areas separated by lines, the free
              text entry field and the SEND REPORT button at the bottom */}
          <div class="mfd-position-report-canvas">
            {/* WAYPOINT DATA */}
            <div class="mfd-position-report-item mfd-position-report-time-header" style="top: 8px;">
              <span class="mfd-label">{this.timeHeader}</span>
            </div>
            <div class="mfd-position-report-item mfd-position-report-alt-header" style="top: 8px;">
              <span class="mfd-label">ALT</span>
            </div>
            {this.renderWaypointLine('LAST SEQD WPT', this.lastSequenced, 50)}
            {this.renderWaypointLine('TO WPT', this.toWaypoint, 92)}
            {this.renderWaypointLine('NEXT WPT', this.nextWaypoint, 135)}
            <div class="mfd-position-report-separator" style="top: 185px;" />

            {/* LAST SEQUENCED WAYPOINT DATA */}
            <div class="mfd-position-report-item" style="top: 199px; left: 8px;">
              <span class="mfd-label">LAST SEQD WPT</span>
            </div>
            <div class="mfd-position-report-vertical-line" />
            <div class="mfd-position-report-item" style="top: 199px; left: 227px;">
              <span class="mfd-label">SAT</span>
            </div>
            <div class="mfd-position-report-item mfd-position-report-right" style="top: 199px; right: 328px;">
              <span class="mfd-value bigger">{this.lastSequencedSat}</span>
            </div>
            <div class="mfd-position-report-item" style="top: 199px; left: 442px;">
              <span class="mfd-label-unit">°C</span>
            </div>
            <div class="mfd-position-report-item" style="top: 243px; left: 230px;">
              <span class="mfd-label">T.WIND</span>
            </div>
            <div class="mfd-position-report-item mfd-position-report-right" style="top: 243px; right: 358px;">
              <span class="mfd-value bigger">{this.lastSequencedWindDirection}</span>
            </div>
            <div class="mfd-position-report-item" style="top: 243px; left: 412px;">
              <span class="mfd-label-unit">°</span>
              <span class="mfd-label" style="margin-left: 16px;">
                /
              </span>
            </div>
            <div class="mfd-position-report-item mfd-position-report-right" style="top: 243px; right: 218px;">
              <span class="mfd-value bigger">{this.lastSequencedWindSpeed}</span>
            </div>
            <div class="mfd-position-report-item" style="top: 243px; left: 552px;">
              <span class="mfd-label-unit">KT</span>
            </div>
            <div class="mfd-position-report-item" style="top: 281px; left: 230px;">
              <span class="mfd-label">FOB</span>
            </div>
            <div class="mfd-position-report-item mfd-position-report-right" style="top: 281px; right: 285px;">
              <span class="mfd-value bigger">{this.lastSequencedFob}</span>
            </div>
            <div class="mfd-position-report-item" style="top: 281px; left: 487px;">
              <span class="mfd-label-unit">T</span>
            </div>
            <div class="mfd-position-report-separator" style="top: 336px;" />

            {/* NEXT CRUISE PROFILE CHANGE DATA (only in CRUISE, NONE otherwise) */}
            <div class="mfd-position-report-item" style="top: 346px; left: 8px;">
              <span class="mfd-label">NEXT CRZ PROFILE CHANGE</span>
            </div>
            <div class="mfd-position-report-item" style="top: 346px; left: 392px;">
              <span class="mfd-value bigger">{this.profileChangeType}</span>
            </div>
            <div style={{ visibility: this.profileChangeDataVisible }}>
              <div class="mfd-position-report-item" style="top: 346px; left: 468px;">
                <span class="mfd-label">AT</span>
              </div>
              <div class="mfd-position-report-item" style="top: 346px; left: 507px;">
                <span class="mfd-value bigger">{this.profileChangeWaypoint}</span>
              </div>
              <div class="mfd-position-report-item" style="top: 389px; left: 172px;">
                <span class="mfd-label">TO</span>
              </div>
              <div class="mfd-position-report-item" style="top: 389px; left: 237px;">
                {MfdFmsPositionReport.renderAltitude(this.profileChangeAltitude)}
              </div>
              <div class="mfd-position-report-item" style="top: 430px; left: 172px;">
                <span class="mfd-label">{this.timeHeader}</span>
              </div>
              <div class="mfd-position-report-item" style="top: 430px; left: 243px;">
                <span class="mfd-value bigger">{this.profileChangeTime}</span>
              </div>
              <div class="mfd-position-report-item" style="top: 472px; left: 172px;">
                <span class="mfd-label">DIST</span>
              </div>
              <div class="mfd-position-report-item mfd-position-report-right" style="top: 472px; right: 438px;">
                <span class="mfd-value bigger">{this.profileChangeDistance}</span>
              </div>
              <div class="mfd-position-report-item" style="top: 472px; left: 334px;">
                <span class="mfd-label-unit">NM</span>
              </div>
            </div>
            <div class="mfd-position-report-separator" style="top: 533px;" />

            {/* DESTINATION DATA */}
            <div class="mfd-position-report-item" style="top: 536px; left: 8px;">
              <span class="mfd-label">DEST</span>
            </div>
            <div class="mfd-position-report-item" style="top: 536px; left: 75px;">
              <span class="mfd-value bigger">{this.destinationIdent}</span>
            </div>
            <div style={{ visibility: this.destinationDataVisible }}>
              <div class="mfd-position-report-item" style="top: 581px; left: 98px;">
                <span class="mfd-label">{this.timeHeader}</span>
              </div>
              <div class="mfd-position-report-item" style="top: 581px; left: 175px;">
                <span class="mfd-value bigger">{this.destinationTime}</span>
              </div>
              <div class="mfd-position-report-item" style="top: 622px; left: 98px;">
                <span class="mfd-label">DIST</span>
              </div>
              <div class="mfd-position-report-item mfd-position-report-right" style="top: 622px; right: 506px;">
                <span class="mfd-value bigger">{this.destinationDistance}</span>
              </div>
              <div class="mfd-position-report-item" style="top: 622px; left: 266px;">
                <span class="mfd-label-unit">NM</span>
              </div>
              <div class="mfd-position-report-item" style="top: 662px; left: 98px;">
                <span class="mfd-label">EFOB</span>
              </div>
              <div class="mfd-position-report-item mfd-position-report-right" style="top: 662px; right: 506px;">
                <span class="mfd-value bigger">{this.destinationEfob}</span>
              </div>
              <div class="mfd-position-report-item" style="top: 662px; left: 266px;">
                <span class="mfd-label-unit">T</span>
              </div>
            </div>
            <div class="mfd-position-report-separator" style="top: 729px;" />

            {/* FREE TEXT ENTRY FIELD (24 characters) and SEND REPORT button */}
            <div class="mfd-position-report-item mfd-position-report-free-text-label">
              <span class="mfd-label">FREE TEXT</span>
            </div>
            <div class="mfd-position-report-free-text">
              <InputField<string>
                dataEntryFormat={new FreeTextFormat(24)}
                value={this.freeText}
                containerStyle="width: 494px;"
                alignText="flex-start"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />
            </div>
            <div class="mfd-position-report-send">
              {/* The ACARS position report downlink is not modelled */}
              <Button
                disabled={true}
                label="SEND REPORT<br />TO CPNY*"
                onClick={() => {}}
                buttonStyle="width: 179px; height: 42px;"
              />
            </div>
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

/** Altitude in feet below the transition altitude (18 000 ft when unknown), flight level above it. */
function formatAltitude(altitude: number | null, transitionAltitude: number | null): string {
  if (altitude === null || !Number.isFinite(altitude)) {
    return '-----';
  }
  if (altitude > (transitionAltitude ?? 18_000)) {
    return `FL${Math.round(altitude / 100)
      .toFixed(0)
      .padStart(3, '0')}`;
  }
  return (Math.round(altitude / 10) * 10).toFixed(0);
}

function formatTonnes(tonnes: number | null): string {
  return tonnes !== null && Number.isFinite(tonnes) ? tonnes.toFixed(1) : '---.-';
}
