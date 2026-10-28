// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ConsumerSubject,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { ArincEventBus } from '@flybywiresim/fbw-sdk';

import { PFDSimvars } from './shared/PFDSimvarPublisher';
import { backupSpeedScaleLayout } from './shared/BackupSpeedScale';

/** The speed tape of the PFD, the place of the backup speed scale */
const TAPE_TOP = 38.086;
const TAPE_HEIGHT = 85.474;
const TAPE_LEFT = 1.9058;
const TAPE_RIGHT = 19.031;
const BAR_LEFT = 13.5;
const BAR_WIDTH = 4;

/**
 * Whether the BKUP SPD/ALT pb of this PFD's side is on.
 * @param bus the PFD event bus
 */
export function createBackupScaleActive(bus: ArincEventBus): Subscribable<boolean> {
  return ConsumerSubject.create(bus.getSubscriber<PFDSimvars>().on('backupScalePbIsOn'), false);
}

interface BackupSpeedScaleProps {
  bus: ArincEventBus;
  active: Subscribable<boolean>;
}

/** The backup speed scale, in place of the speed tape (the angle of attack is the simulator's, independent of the ADRs) */
export class BackupSpeedScale extends DisplayComponent<BackupSpeedScaleProps> {
  private readonly sub = this.props.bus.getSubscriber<PFDSimvars>();

  private readonly layout = MappedSubject.create(
    ([config]) => backupSpeedScaleLayout(config),
    ConsumerSubject.create(this.sub.on('flapsConfigIndex'), 0),
  );

  private readonly angleOfAttack = ConsumerSubject.create(this.sub.on('aoa').withPrecision(1), 0);

  private readonly areaPath = (from: Subscribable<number>, to: Subscribable<number>) =>
    MappedSubject.create(
      ([a, b]) => `m${BAR_LEFT} ${TAPE_TOP + a * TAPE_HEIGHT}h${BAR_WIDTH}v${(b - a) * TAPE_HEIGHT}h-${BAR_WIDTH}z`,
      from,
      to,
    );

  private readonly areaEnd = (index: number) => this.layout.map((l) => l.areaEnds[index]);

  private readonly redFastPath = this.areaPath(Subject.create(0), this.areaEnd(0));

  private readonly amberFastPath = this.areaPath(this.areaEnd(0), this.areaEnd(1));

  private readonly greenPath = this.areaPath(this.areaEnd(1), this.areaEnd(2));

  private readonly amberSlowPath = this.areaPath(this.areaEnd(2), this.areaEnd(3));

  private readonly redSlowPath = this.areaPath(this.areaEnd(3), Subject.create(1));

  private readonly targetY = this.layout.map((l) => TAPE_TOP + l.target * TAPE_HEIGHT);

  private readonly targetPath = this.targetY.map((y) => `m${TAPE_RIGHT + 0.2} ${y}l3.4-1.5v3z`);

  private readonly currentY = MappedSubject.create(
    ([layout, aoa]) => TAPE_TOP + layout.positionOf(aoa) * TAPE_HEIGHT,
    this.layout,
    this.angleOfAttack,
  );

  private readonly currentPath = this.currentY.map((y) => `m${TAPE_LEFT} ${y}h${TAPE_RIGHT - TAPE_LEFT}`);

  render(): VNode {
    return (
      <g id="BackupSpeedScale" style={{ display: this.props.active.map((a) => (a ? 'inline' : 'none')) }}>
        <path id="SpeedTapeBackground" class="TapeBackground" d="m1.9058 123.56v-85.473h17.125v85.473z" />
        <path class="Fill Red" d={this.redFastPath} />
        <path class="Fill Amber" d={this.amberFastPath} />
        <path class="Fill Green" d={this.greenPath} />
        <path class="Fill Amber" d={this.amberSlowPath} />
        <path class="Fill Red" d={this.redSlowPath} />
        <path class="NormalStroke White" d="m1.9058 38.086h21.859m-21.859 85.474h21.859m-4.734-85.474v85.474" />
        <path class="Fill Green" d={this.targetPath} />
        <path class="ThickOutline" d={this.currentPath} />
        <path class="NormalStroke Yellow" d={this.currentPath} />
      </g>
    );
  }
}

/**
 * GPS ALT flag: the barometric altitude is replaced by the GPS altitude. The two amber dashes cover the last two digits
 * of the altitude.
 */
export class BackupAltitudeFlags extends DisplayComponent<BackupSpeedScaleProps> {
  render(): VNode {
    return (
      <g id="BackupAltitudeFlags" style={{ display: this.props.active.map((a) => (a ? 'inline' : 'none')) }}>
        <path id="GpsAltTensCover" class="BlackFill" d="m131.2 73.9h8.2v13.9h-8.2z" />
        <path class="NormalStroke Amber" d="m132.5 80.8h2.3m1.6 0h2.3" />
        <text id="GpsAltFlag" class="FontMedium Amber EndAlign" x="139.7" y="129.2">
          GPS ALT
        </text>
      </g>
    );
  }
}
