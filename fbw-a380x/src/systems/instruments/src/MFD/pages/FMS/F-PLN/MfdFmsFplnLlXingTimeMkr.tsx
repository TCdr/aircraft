// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, ClockEvents, FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';
import { Coordinates } from 'msfs-geo';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { SegmentClass } from '@fmgc/flightplanning/segments/SegmentClass';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { fcomAt, fcomCentre, fcomLine, fcomRight } from '../../common/FcomLayout';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { RadioButtonGroup } from '../../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { CrossingOriginFormat, TimeHhMmSsFormat, TwoDigitIntegerFormat } from '../../common/DataEntryFormats';
import { NXSystemMessages } from '../../../shared/NXSystemMessages';

import './MfdFmsFplnLlXingTimeMkr.scss';

interface MfdFmsFplnLlXingTimeMkrProps extends AbstractMfdPageProps {}

/** FCOM: up to 4 time markers */
const maxTimeMarkers = 4;

const secondsPerDay = 86_400;

/** A time marker of the FMS (shared by both MFDs): its UTC in seconds of the day and the aural alert option */
interface TimeMarker {
  utc: Subject<number | null>;
  aural: Subject<boolean>;
}

const timeMarkers: TimeMarker[] = Array.from({ length: maxTimeMarkers }, () => ({
  utc: Subject.create<number | null>(null),
  aural: Subject.create(false),
}));

/** A candidate start waypoint: its leg index and ident */
interface StartWaypoint {
  legIndex: number;
  ident: string;
}

/**
 * LL XING - TIME MKR page (A380 FCOM DSC-22-FMS-20-30 P 209-214): computes the crossings of the flight plan with a
 * series of latitudes (or longitudes) after a start waypoint and inserts them as waypoints in the temporary flight
 * plan, and defines up to 4 time markers (UTC or remaining time).
 *
 * Not modelled: the time marker pseudo waypoints on the ND and the aural alert.
 */
export class MfdFmsFplnLlXingTimeMkr extends FmsPage<MfdFmsFplnLlXingTimeMkrProps> {
  private startWaypoints: StartWaypoint[] = [];

  private readonly startWaypointIdents = ArraySubject.create<string>([]);

  private readonly selectedStart = Subject.create<number | null>(null);

  /** 0 = LAT, 1 = LONG (FCOM: latitude by default) */
  private readonly crossingType = Subject.create<number | null>(0);

  private readonly originLatitude = Subject.create<number | null>(null);

  private readonly originLongitude = Subject.create<number | null>(null);

  private originIsPilotEntered = false;

  private readonly increment = Subject.create<number | null>(1);

  private readonly number = Subject.create<number | null>(null);

  private readonly latitudeVisible = this.crossingType.map((t) => (t === 0 ? 'inherit' : 'hidden'));

  private readonly longitudeVisible = this.crossingType.map((t) => (t === 1 ? 'inherit' : 'hidden'));

  private readonly insertDisabled = MappedSubject.create(
    ([start, n]) => start === null || n === null,
    this.selectedStart,
    this.number,
  );

  /** FCOM: the time markers are only displayed for the active flight plan */
  private readonly timeMarkerVisibility = this.loadedFlightPlanIndex.map((i) =>
    i === FlightPlanIndex.Active ? 'inherit' : 'hidden',
  );

  private readonly remainingTimes = timeMarkers.map(() => Subject.create<number | null>(null));

  /** FCOM figure: a new empty time marker line appears once the previous one is defined */
  private readonly markerRowVisibility = timeMarkers.map((_, i) =>
    MappedSubject.create(
      (utcs) => (i === 0 || utcs[i - 1] !== null || utcs[i] !== null ? 'inherit' : 'hidden'),
      ...timeMarkers.map((m) => m.utc),
    ),
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.latitudeVisible,
      this.longitudeVisible,
      this.insertDisabled,
      this.timeMarkerVisibility,
      ...this.markerRowVisibility,
      this.crossingType.sub(() => this.updateDefaultOrigin()),
      this.selectedStart.sub(() => this.updateDefaultOrigin()),
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('realTime')
        .atFrequency(1)
        .handle(() => this.updateRemainingTimes()),
    );
  }

  protected onNewData(): void {
    const plan = this.loadedFlightPlan;
    if (!plan) {
      return;
    }
    // FCOM: the start waypoint is between the origin and the last enroute waypoint (excluded)
    const candidates: StartWaypoint[] = [];
    for (let i = Math.max(0, plan.activeLegIndex - 1); i < plan.firstMissedApproachLegIndex; i++) {
      const leg = plan.maybeElementAt(i);
      if (!isLeg(leg) || !leg.isXF()) {
        continue;
      }
      if (leg.segment.class === SegmentClass.Arrival) {
        break;
      }
      candidates.push({ legIndex: i, ident: leg.ident });
    }
    candidates.pop();
    this.startWaypoints = candidates;
    this.startWaypointIdents.set(candidates.map((c) => c.ident));
    const selected = this.selectedStart.get();
    if (selected === null || selected >= candidates.length) {
      this.selectedStart.set(candidates.length > 0 ? 0 : null);
    }
    this.updateDefaultOrigin();
  }

  /**
   * FCOM: the default origin is the rounded latitude (or longitude) of the flight plan waypoint following the first
   * waypoint of the start waypoint list (or of that first waypoint when there is none)
   */
  private updateDefaultOrigin(): void {
    if (this.originIsPilotEntered) {
      return;
    }
    const plan = this.loadedFlightPlan;
    const first = this.startWaypoints[0];
    if (!plan || !first) {
      this.originLatitude.set(null);
      this.originLongitude.set(null);
      return;
    }
    const next = this.startWaypoints[1] ?? first;
    const leg = plan.maybeElementAt(next.legIndex);
    const location = isLeg(leg) ? leg.terminationWaypoint()?.location : undefined;
    this.originLatitude.set(location ? Math.round(location.lat) : null);
    this.originLongitude.set(location ? Math.round(location.long) : null);
  }

  /** Crossing of the great circle a-b with a latitude (or longitude) value, or null */
  private static crossing(a: Coordinates, b: Coordinates, isLatitude: boolean, value: number): Coordinates | null {
    const coordinate = (c: Coordinates) => (isLatitude ? c.lat : c.long);
    if ((coordinate(a) - value) * (coordinate(b) - value) > 0 || coordinate(a) === coordinate(b)) {
      return null;
    }
    // Bisection along the great circle, with the intermediate point formula
    const toRad = Math.PI / 180;
    const phi1 = a.lat * toRad;
    const lambda1 = a.long * toRad;
    const phi2 = b.lat * toRad;
    const lambda2 = b.long * toRad;
    const delta =
      2 *
      Math.asin(
        Math.sqrt(
          Math.sin((phi2 - phi1) / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin((lambda2 - lambda1) / 2) ** 2,
        ),
      );
    if (delta === 0) {
      return null;
    }
    const pointAt = (f: number): Coordinates => {
      const A = Math.sin((1 - f) * delta) / Math.sin(delta);
      const B = Math.sin(f * delta) / Math.sin(delta);
      const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
      const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
      const z = A * Math.sin(phi1) + B * Math.sin(phi2);
      return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / toRad, long: Math.atan2(y, x) / toRad };
    };
    let low = 0;
    let high = 1;
    const startSign = Math.sign(coordinate(a) - value);
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (Math.sign(coordinate(pointAt(mid)) - value) === startSign) {
        low = mid;
      } else {
        high = mid;
      }
    }
    const result = pointAt((low + high) / 2);
    if (isLatitude) {
      result.lat = value;
    } else {
      result.long = value;
    }
    return result;
  }

  /** INSERT AS WPT: inserts the crossings as waypoints in the temporary flight plan (FCOM P 212) */
  private async insertCrossings(): Promise<void> {
    const plan = this.loadedFlightPlan;
    const startIndex = this.selectedStart.get();
    const number = this.number.get();
    const increment = this.increment.get() ?? 1;
    const isLatitude = this.crossingType.get() === 0;
    const origin = isLatitude ? this.originLatitude.get() : this.originLongitude.get();
    const dataManager = this.props.fmcService.master.getDataManager();
    if (!plan || startIndex === null || number === null || origin === null || !dataManager) {
      return;
    }

    // Path from the start waypoint onwards, up to the last enroute waypoint
    const start = this.startWaypoints[startIndex];
    const points: { legIndex: number; location: Coordinates }[] = [];
    for (let i = start.legIndex; i < plan.firstMissedApproachLegIndex; i++) {
      const leg = plan.maybeElementAt(i);
      const location = isLeg(leg) ? leg.terminationWaypoint()?.location : undefined;
      if (!isLeg(leg) || !location) {
        continue;
      }
      if (leg.segment.class === SegmentClass.Arrival) {
        break;
      }
      points.push({ legIndex: i, location });
    }
    if (points.length < 2) {
      this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
      return;
    }

    // Crossings in flight plan order: origin, origin +/- increment, ... in the direction the route moves
    const coordinate = (c: Coordinates) => (isLatitude ? c.lat : c.long);
    const direction = Math.sign(coordinate(points[points.length - 1].location) - coordinate(points[0].location)) || 1;
    const crossings: { beforeLeg: number; location: Coordinates }[] = [];
    let target = origin;
    for (let p = 0; p < points.length - 1 && crossings.length < number; p++) {
      let found = MfdFmsFplnLlXingTimeMkr.crossing(points[p].location, points[p + 1].location, isLatitude, target);
      while (found && crossings.length < number) {
        crossings.push({ beforeLeg: points[p + 1].legIndex, location: found });
        target += direction * increment;
        found = MfdFmsFplnLlXingTimeMkr.crossing(found, points[p + 1].location, isLatitude, target);
      }
    }
    if (crossings.length === 0) {
      this.props.fmcService.master.addMessageToQueue(NXSystemMessages.noIntersectionFound, undefined, undefined);
      return;
    }

    // Insert from the last one so that the leg indexes of the previous ones do not change
    const planIndex = this.loadedFlightPlanIndex.get();
    for (let i = crossings.length - 1; i >= 0; i--) {
      const waypoint = dataManager.createLatLonWaypoint(crossings[i].location, false).waypoint;
      await this.props.flightPlanInterface.insertWaypointBefore(crossings[i].beforeLeg, waypoint, planIndex);
    }
  }

  private updateRemainingTimes(): void {
    const now = this.props.fmcService.master.timeKeeper.utcSeconds.get();
    timeMarkers.forEach((marker, i) => {
      const utc = marker.utc.get();
      this.remainingTimes[i].set(utc !== null ? (((utc - now) % secondsPerDay) + secondsPerDay) % secondsPerDay : null);
    });
  }

  private renderTimeMarker(index: number): VNode {
    const y = 478 + index * 60;
    const marker = timeMarkers[index];
    return (
      <div style={{ visibility: this.markerRowVisibility[index] }}>
        {index > 0 && fcomLine(y - 30, 58, 679)}
        {fcomAt(
          y,
          89,
          <InputField<number>
            dataEntryFormat={new TimeHhMmSsFormat()}
            value={marker.utc}
            onModified={(v) => {
              marker.utc.set(v);
              this.updateRemainingTimes();
            }}
            containerStyle="width: 165px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomAt(
          y,
          339,
          <InputField<number>
            dataEntryFormat={new TimeHhMmSsFormat()}
            value={this.remainingTimes[index]}
            onModified={(v) => {
              const now = this.props.fmcService.master.timeKeeper.utcSeconds.get();
              marker.utc.set(v !== null ? (now + v) % secondsPerDay : null);
              this.updateRemainingTimes();
            }}
            containerStyle="width: 165px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomCentre(
          y,
          634,
          <div
            class={{ 'mfd-llxing-checkbox': true, checked: marker.aural }}
            onClick={() => marker.aural.set(!marker.aural.get())}
          />,
        )}
      </div>
    );
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 209), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {fcomAt(25, 2, <span class="mfd-label">LAT/LONG XING</span>)}
            {fcomAt(83, 20, <span class="mfd-label">START WPT</span>)}
            {fcomAt(
              132,
              21,
              <DropdownMenu
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_llXingStartWpt`}
                selectedIndex={this.selectedStart}
                values={this.startWaypointIdents}
                freeTextAllowed={false}
                containerStyle="width: 177px;"
                numberOfDigitsForInputField={7}
                alignLabels="flex-start"
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            <div class="mfd-llxing-origin-box" />
            {fcomAt(
              128,
              330,
              <div class="mfd-llxing-radio">
                <RadioButtonGroup
                  values={['LAT', 'LONG']}
                  selectedIndex={this.crossingType}
                  idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_llXingType`}
                  additionalVerticalSpacing={15}
                />
              </div>,
            )}
            <div style={{ visibility: this.latitudeVisible }}>
              {fcomAt(
                100,
                490,
                <InputField<number>
                  dataEntryFormat={new CrossingOriginFormat(true)}
                  value={this.originLatitude}
                  onModified={(v) => {
                    this.originIsPilotEntered = v !== null;
                    this.originLatitude.set(v);
                    this.updateDefaultOrigin();
                  }}
                  containerStyle="width: 88px;"
                  alignText="center"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
            </div>
            <div style={{ visibility: this.longitudeVisible }}>
              {fcomAt(
                100,
                490,
                <InputField<number>
                  dataEntryFormat={new CrossingOriginFormat(false)}
                  value={this.originLongitude}
                  onModified={(v) => {
                    this.originIsPilotEntered = v !== null;
                    this.originLongitude.set(v);
                    this.updateDefaultOrigin();
                  }}
                  containerStyle="width: 110px;"
                  alignText="center"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
            </div>
            {fcomRight(235, 449, <span class="mfd-label">INCREMENT</span>)}
            {fcomAt(
              235,
              490,
              <InputField<number>
                dataEntryFormat={new TwoDigitIntegerFormat(1, 20)}
                value={this.increment}
                containerStyle="width: 64px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomAt(233, 543, <span class="mfd-label-unit">°</span>)}
            {fcomRight(284, 449, <span class="mfd-label">NUMBER</span>)}
            {fcomAt(
              284,
              490,
              <InputField<number>
                dataEntryFormat={new TwoDigitIntegerFormat(1, 99)}
                value={this.number}
                containerStyle="width: 44px;"
                alignText="flex-end"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomAt(
              283,
              624,
              <Button
                label="INSERT<br />AS WPT*"
                disabled={this.insertDisabled}
                onClick={() => this.insertCrossings()}
                buttonStyle="min-width: 136px; min-height: 60px;"
              />,
            )}
            {fcomLine(338, 2, 757)}

            <div style={{ visibility: this.timeMarkerVisibility }}>
              {fcomAt(360, 2, <span class="mfd-label">TIME MKR</span>)}
              {fcomCentre(420, 166, <span class="mfd-label">UTC</span>)}
              {fcomCentre(420, 427, <span class="mfd-label">REMAINING TIME</span>)}
              {fcomCentre(420, 636, <span class="mfd-label">AURAL ALERT</span>)}
              {timeMarkers.map((_, i) => this.renderTimeMarker(i))}
            </div>

            {/* FCOM: RETURN (displays the F-PLN page) when no temporary flight plan exists */}
            {fcomAt(
              792,
              3,
              <Button
                label="RETURN"
                onClick={() =>
                  this.props.mfd.uiService.navigateTo(`fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`)
                }
                buttonStyle="min-width: 130px;"
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
