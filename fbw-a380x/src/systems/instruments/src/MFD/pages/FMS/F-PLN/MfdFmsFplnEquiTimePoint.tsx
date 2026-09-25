// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { Fix, MagVar } from '@flybywiresim/fbw-sdk';
import { bearingTo, Coordinates, distanceTo, placeBearingDistance } from 'msfs-geo';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { WaypointEntryUtils } from '@fmgc/flightplanning/WaypointEntryUtils';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { fcomAt, fcomCentre, fcomRight } from '../../common/FcomLayout';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { WaypointFormat, WindDirectionFormat, WindSpeedFormat } from '../../common/DataEntryFormats';
import { NXSystemMessages } from '../../../shared/NXSystemMessages';

import './MfdFmsFplnEquiTimePoint.scss';

interface MfdFmsFplnEquiTimePointProps extends AbstractMfdPageProps {}

/** A point of the lateral path from the aircraft to the destination */
interface PathPoint {
  location: Coordinates;
  /** Along-path distance from the aircraft */
  distance: number;
  /** Ident of the flight plan waypoint at this point ('' for P.POS) */
  ident: string;
  /** Predicted time from present at this point, when the vertical predictions give one */
  secondsFromPresent?: number;
}

/** Data of one reference: the reference fix, the entered wind and the computed data from P.POS and from the ETP */
class Reference {
  readonly ident = Subject.create<string | null>(null);

  fix: Fix | null = null;

  /** True if the flight crew entered the reference (otherwise the default origin / destination is used) */
  pilotEntered = false;

  readonly windDirection = Subject.create<number | null>(null);

  readonly windSpeed = Subject.create<number | null>(null);

  readonly pposBearing = Subject.create('---');

  readonly pposDistance = Subject.create('----');

  readonly pposTime = Subject.create('--:--');

  readonly etpTrack = Subject.create('---');

  readonly etpDistance = Subject.create('----');

  readonly etpTime = Subject.create('--:--');
}

const noEtp = '';

/**
 * EQUI-TIME POINT page (A380 FCOM DSC-22-FMS-20-30 P 135-138): computes the point of the active flight plan from which
 * the time to reach both references is the same, taking into account the cruise Mach and the wind entered at each
 * reference. The default references are the origin and destination airports.
 *
 * Simplifications: the time to a reference uses the managed cruise Mach at the cruise flight level (standard
 * atmosphere) and the wind entered at that reference; the time from P.POS to the ETP comes from the vertical
 * predictions when available. The ETP is not drawn as a pseudo waypoint on the F-PLN page or the ND.
 */
export class MfdFmsFplnEquiTimePoint extends FmsPage<MfdFmsFplnEquiTimePointProps> {
  private readonly references = [new Reference(), new Reference()];

  private readonly etpText = Subject.create(noEtp);

  private readonly pposToEtpDistance = Subject.create('----');

  private readonly pposToEtpTime = Subject.create('--:--');

  private readonly timeLabel = this.props.fmcService.master.timeKeeper.timeReference.map(() => 'UTC');

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.props.mfd.uiService.activeUri.sub(() => this.activePageTitle.set('ACTIVE/F-PLN/EQUI-TIME POINT'), true),
      this.timeLabel,
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('realTime')
        .atFrequency(1)
        .handle(() => this.compute()),
    );
  }

  protected onNewData(): void {
    this.updateDefaultReferences();
    this.compute();
  }

  /** FCOM: the default REF1 is the origin airport, the default REF2 the destination airport */
  private updateDefaultReferences(): void {
    if (!this.props.flightPlanInterface.hasActive) {
      return;
    }
    const plan = this.props.flightPlanInterface.active;
    const defaults = [plan.originAirport, plan.destinationAirport];
    this.references.forEach((ref, i) => {
      if (!ref.pilotEntered) {
        ref.fix = defaults[i] ?? null;
        ref.ident.set(defaults[i]?.ident ?? null);
      }
    });
  }

  private async onReferenceEntered(index: number, ident: string | null): Promise<boolean> {
    const ref = this.references[index];
    if (ident === null) {
      ref.pilotEntered = false;
      this.updateDefaultReferences();
      this.compute();
      return true;
    }
    // FCOM: the ident already selected in the other reference field is NOT ALLOWED
    if (this.references[1 - index].ident.get() === ident) {
      this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
      return false;
    }
    const fix = await WaypointEntryUtils.getOrCreateWaypoint(this.props.fmcService.master, ident, false);
    if (!fix) {
      throw new FmsError(FmsErrorType.NotInDatabase);
    }
    ref.fix = fix;
    ref.pilotEntered = true;
    ref.ident.set(fix.ident);
    this.compute();
    return true;
  }

  /** The lateral path from the aircraft to the destination, from the active leg onwards */
  private buildPath(ppos: Coordinates): PathPoint[] {
    const plan = this.props.flightPlanInterface.active;
    const predictions = this.props.fmcService.master.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions;
    const path: PathPoint[] = [{ location: ppos, distance: 0, ident: '', secondsFromPresent: 0 }];
    const lastLeg = Math.min(plan.firstMissedApproachLegIndex, plan.legCount) - 1;
    for (let i = Math.max(0, plan.activeLegIndex); i <= lastLeg; i++) {
      const leg = plan.maybeElementAt(i);
      const fix = isLeg(leg) ? leg.terminationWaypoint() : null;
      if (!isLeg(leg) || !fix) {
        continue;
      }
      const previous = path[path.length - 1];
      path.push({
        location: fix.location,
        distance: previous.distance + distanceTo(previous.location, fix.location),
        ident: leg.ident,
        secondsFromPresent: predictions?.get(i)?.secondsFromPresent,
      });
    }
    return path;
  }

  /** True airspeed at the cruise flight level for the managed cruise Mach, in the standard atmosphere */
  private cruiseTrueAirspeed(): number {
    const fmc = this.props.fmcService.master;
    const mach = fmc.fmgc.getManagedCruiseSpeedMach();
    const cruiseLevel = this.props.flightPlanInterface.active.performanceData.cruiseFlightLevel.get();
    const altitude = (cruiseLevel ?? 350) * 100;
    const temperature = Math.max(216.65, 288.15 - 0.0019812 * altitude);
    return (Number.isFinite(mach) && mach > 0 ? mach : 0.85) * 661.47 * Math.sqrt(temperature / 288.15);
  }

  /** Ground speed on a track, for a true airspeed and the wind (direction it blows from, speed) of a reference */
  private static groundSpeed(track: number, tas: number, ref: Reference): number {
    const windDirection = ref.windDirection.get() ?? 0;
    const windSpeed = ref.windSpeed.get() ?? 0;
    const angle = ((windDirection - track) * Math.PI) / 180;
    const headwind = windSpeed * Math.cos(angle);
    const crosswind = windSpeed * Math.sin(angle);
    return Math.max(50, Math.sqrt(Math.max(0, tas * tas - crosswind * crosswind)) - headwind);
  }

  /** Time in seconds to fly direct from a location to a reference */
  private timeToReference(location: Coordinates, ref: Reference, tas: number): number {
    const fix = ref.fix!;
    const track = bearingTo(location, fix.location);
    return (distanceTo(location, fix.location) / MfdFmsFplnEquiTimePoint.groundSpeed(track, tas, ref)) * 3600;
  }

  private formatTrack(from: Coordinates, to: Coordinates): string {
    const trueTrack = bearingTo(from, to);
    const magVar = MagVar.get(from);
    const track = magVar !== null ? MagVar.trueToMagnetic(trueTrack, magVar) : trueTrack;
    return (Math.round(track) % 360).toFixed(0).padStart(3, '0');
  }

  private compute(): void {
    const fmc = this.props.fmcService.master;
    const ppos = fmc?.navigation.getPpos();
    const timeKeeper = fmc?.timeKeeper;
    if (!fmc || !ppos || !this.props.flightPlanInterface.hasActive || !timeKeeper) {
      this.clear();
      return;
    }

    const tas = this.cruiseTrueAirspeed();
    for (const ref of this.references) {
      if (!ref.fix) {
        ref.pposBearing.set('---');
        ref.pposDistance.set('----');
        ref.pposTime.set('--:--');
        continue;
      }
      ref.pposBearing.set(this.formatTrack(ppos, ref.fix.location));
      ref.pposDistance.set(Math.round(distanceTo(ppos, ref.fix.location)).toFixed(0));
      ref.pposTime.set(timeKeeper.formatEta(this.timeToReference(ppos, ref, tas)));
    }

    if (!this.references[0].fix || !this.references[1].fix) {
      this.clearEtp('ETP NOT FOUND');
      return;
    }

    // Search the first point of the path where the time difference to the two references changes sign
    const path = this.buildPath(ppos);
    const difference = (location: Coordinates) =>
      this.timeToReference(location, this.references[0], tas) - this.timeToReference(location, this.references[1], tas);

    let found: { location: Coordinates; segment: number; distance: number } | null = null;
    for (let i = 0; i < path.length - 1 && !found; i++) {
      const a = path[i];
      const b = path[i + 1];
      const segmentLength = b.distance - a.distance;
      const course = bearingTo(a.location, b.location);
      const pointAt = (d: number) => placeBearingDistance(a.location, course, d);
      const steps = Math.max(1, Math.ceil(segmentLength / 5));
      let previous = difference(a.location);
      for (let s = 1; s <= steps && !found; s++) {
        const d = (segmentLength * s) / steps;
        const current = difference(pointAt(d));
        if (Math.sign(current) !== Math.sign(previous) || current === 0) {
          // Bisection inside the step
          let low = (segmentLength * (s - 1)) / steps;
          let high = d;
          for (let k = 0; k < 20; k++) {
            const mid = (low + high) / 2;
            if (Math.sign(difference(pointAt(mid))) === Math.sign(previous)) {
              low = mid;
            } else {
              high = mid;
            }
          }
          const distanceInSegment = (low + high) / 2;
          found = { location: pointAt(distanceInSegment), segment: i, distance: a.distance + distanceInSegment };
        }
        previous = current;
      }
    }

    if (!found) {
      // FCOM: ETP SEQUENCED once the aircraft is past the ETP, ETP NOT FOUND otherwise
      this.clearEtp(difference(ppos) > 0 && path.length > 1 ? 'ETP SEQUENCED' : 'ETP NOT FOUND');
      return;
    }

    // FCOM: the ETP is a place/distance waypoint, the place being the waypoint that follows the ETP
    const next = path[found.segment + 1];
    const distanceToNext = next.distance - found.distance;
    this.etpText.set(`${next.ident}/-${distanceToNext.toFixed(1)}NM`);

    // Time to the ETP: the vertical predictions when both ends of the segment have one, the cruise TAS otherwise
    const a = path[found.segment];
    let secondsToEtp = (found.distance / tas) * 3600;
    if (a.secondsFromPresent !== undefined && next.secondsFromPresent !== undefined && next.distance > a.distance) {
      const ratio = (found.distance - a.distance) / (next.distance - a.distance);
      secondsToEtp = a.secondsFromPresent + ratio * (next.secondsFromPresent - a.secondsFromPresent);
    }
    this.pposToEtpDistance.set(Math.round(found.distance).toFixed(0));
    this.pposToEtpTime.set(timeKeeper.formatEta(secondsToEtp));

    for (const ref of this.references) {
      const fix = ref.fix!;
      ref.etpTrack.set(this.formatTrack(found.location, fix.location));
      ref.etpDistance.set(Math.round(distanceTo(found.location, fix.location)).toFixed(0));
      ref.etpTime.set(timeKeeper.formatEta(secondsToEtp + this.timeToReference(found.location, ref, tas)));
    }
  }

  private clearEtp(text: string): void {
    this.etpText.set(text);
    this.pposToEtpDistance.set('----');
    this.pposToEtpTime.set('--:--');
    for (const ref of this.references) {
      ref.etpTrack.set('---');
      ref.etpDistance.set('----');
      ref.etpTime.set('--:--');
    }
  }

  private clear(): void {
    this.clearEtp(noEtp);
    for (const ref of this.references) {
      ref.pposBearing.set('---');
      ref.pposDistance.set('----');
      ref.pposTime.set('--:--');
    }
  }

  /** A data box of three lines (FCOM figure): label, value right-aligned, unit */
  private dataBox(
    x: number,
    y: number,
    labels: [string, string, Subscribable<string>],
    values: [Subscribable<string>, Subscribable<string>, Subscribable<string>],
    units: [string, string],
    valueRight: number,
  ): VNode {
    return (
      <>
        <div class="mfd-etp-box" style={`left: ${x}px; top: ${y}px;`} />
        {[0, 1, 2].map((i) => (
          <>
            {fcomAt(y + 20 + i * 41, x + 20, <span class="mfd-label">{labels[i]}</span>)}
            {i < 2
              ? fcomRight(y + 20 + i * 41, x + valueRight, <span class="mfd-value bigger">{values[i]}</span>)
              : fcomAt(y + 20 + i * 41, x + 85, <span class="mfd-value bigger">{values[i]}</span>)}
            {i < 2 && fcomAt(y + 20 + i * 41, x + valueRight + 3, <span class="mfd-label-unit">{units[i]}</span>)}
          </>
        ))}
      </>
    );
  }

  private renderReference(index: number): VNode {
    const ref = this.references[index];
    const x = index === 0 ? 32 : 516;
    const centre = x + 114;
    return (
      <>
        {this.dataBox(
          x,
          102,
          ['BRG', 'DIST', this.timeLabel],
          [ref.pposBearing, ref.pposDistance, ref.pposTime],
          ['°', 'NM'],
          172,
        )}
        {fcomCentre(274, centre, <span class="mfd-label">{`REF${index + 1}`}</span>)}
        <div class="mfd-etp-ref-bracket" style={`left: ${x}px;`} />
        {fcomAt(
          313,
          x + 26,
          <InputField<string>
            dataEntryFormat={new WaypointFormat()}
            value={ref.ident}
            dataHandlerDuringValidation={(v) => this.onReferenceEntered(index, v)}
            containerStyle="width: 166px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomCentre(359, centre, <span class="mfd-label">CRZ FL WIND</span>)}
        {fcomAt(
          401,
          x + 9,
          <InputField<number>
            dataEntryFormat={new WindDirectionFormat()}
            value={ref.windDirection}
            onModified={(v) => {
              ref.windDirection.set(v);
              this.compute();
            }}
            containerStyle="width: 84px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomAt(
          401,
          x + 110,
          <InputField<number>
            dataEntryFormat={new WindSpeedFormat()}
            value={ref.windSpeed}
            onModified={(v) => {
              ref.windSpeed.set(v);
              this.compute();
            }}
            containerStyle="width: 103px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {this.dataBox(
          x,
          470,
          ['TRK', 'DIST', this.timeLabel],
          [ref.etpTrack, ref.etpDistance, ref.etpTime],
          ['°', 'NM'],
          172,
        )}
      </>
    );
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 135), page container coordinates */}
          <div class="mfd-fcom-canvas">
            <svg class="mfd-etp-lines" width="768" height="760" viewBox="0 0 768 760">
              <ellipse cx="390" cy="40" rx="112" ry="22" />
              <polyline points="278,40 148,40 148,102" />
              <polyline points="502,40 630,40 630,102" />
              <polyline points="390,62 390,125" />
              <polyline points="390,207 390,628" />
              <polyline points="384,618 390,630 396,618" />
              <polyline points="148,224 148,250" />
              <polyline points="142,240 148,250 154,240" />
              <polyline points="630,224 630,250" />
              <polyline points="624,240 630,250 636,240" />
              <polyline points="148,445 148,468" />
              <polyline points="142,455 148,445 154,455" />
              <polyline points="630,445 630,468" />
              <polyline points="624,455 630,445 636,455" />
              <polyline points="148,592 148,657 222,657" />
              <polyline points="630,592 630,657 556,657" />
            </svg>
            {fcomCentre(40, 390, <span class="mfd-label">P.POS</span>)}

            <div class="mfd-etp-box" style="left: 285px; top: 125px; width: 208px; height: 82px;" />
            {fcomAt(147, 295, <span class="mfd-label">DIST</span>)}
            {fcomRight(147, 453, <span class="mfd-value bigger">{this.pposToEtpDistance}</span>)}
            {fcomAt(147, 456, <span class="mfd-label-unit">NM</span>)}
            {fcomAt(187, 295, <span class="mfd-label">{this.timeLabel}</span>)}
            {fcomAt(187, 360, <span class="mfd-value bigger">{this.pposToEtpTime}</span>)}

            {this.renderReference(0)}
            {this.renderReference(1)}

            <div class="mfd-etp-box" style="left: 222px; top: 632px; width: 334px; height: 90px;" />
            {fcomCentre(659, 389, <span class="mfd-label">ETP</span>)}
            {fcomCentre(697, 389, <span class="mfd-value bigger">{this.etpText}</span>)}

            {fcomAt(
              787,
              2,
              <Button
                label="RETURN"
                onClick={() => this.props.mfd.uiService.navigateTo('fms/active/f-pln')}
                buttonStyle="min-width: 138px;"
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
