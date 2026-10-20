// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ConsumerSubject,
  DisplayComponent,
  EventBus,
  FSComponent,
  MappedSubject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { Arinc429ConsumerSubject, EfisNdMode, MathUtils } from '@flybywiresim/fbw-sdk';

import { NDSimvars } from '../NDSimvarPublisher';
import { NDControlEvents } from '../NDControlEvents';
import { GenericDisplayManagementEvents } from '../types/GenericDisplayManagementEvents';
import { ENERGY_CIRCLE_MAP_CENTRE, energyCircleArcPath, energyCircleGeometry } from './EnergyCircleGeometry';

export interface EnergyCircleProps {
  bus: EventBus;
  ndMode: Subscribable<EfisNdMode>;
  isUsingTrackUpMode: Subscribable<boolean>;
  /** A dashed arc (A380) instead of a solid one (A320) */
  dashed: boolean;
}

/**
 * The energy circle: a green arc centred on the aircraft and oriented on the track line, at the distance the FMS
 * computes as required to descend and land.
 */
export class EnergyCircle extends DisplayComponent<EnergyCircleProps> {
  private readonly sub = this.props.bus.getSubscriber<NDSimvars & NDControlEvents & GenericDisplayManagementEvents>();

  private readonly distance = ConsumerSubject.create(this.sub.on('energyCircleDistance').whenChanged(), 0);

  private readonly mapPixelRadius = ConsumerSubject.create(this.sub.on('set_map_pixel_radius').whenChanged(), 0);

  private readonly mapRangeRadius = ConsumerSubject.create(this.sub.on('set_map_range_radius').whenChanged(), 0);

  private readonly mapCentreYBias = ConsumerSubject.create(this.sub.on('set_map_center_y_bias').whenChanged(), 0);

  private readonly headingWord = Arinc429ConsumerSubject.create(this.sub.on('heading'));

  private readonly trackWord = Arinc429ConsumerSubject.create(this.sub.on('track'));

  private readonly geometry = MappedSubject.create(
    ([ndMode, distance, pixelRadius, rangeRadius, yBias, heading, track]) =>
      heading.isNormalOperation() && track.isNormalOperation()
        ? energyCircleGeometry(ndMode, distance, pixelRadius, rangeRadius, yBias)
        : null,
    this.props.ndMode,
    this.distance,
    this.mapPixelRadius,
    this.mapRangeRadius,
    this.mapCentreYBias,
    this.headingWord,
    this.trackWord,
  );

  private readonly path = this.geometry.map((geometry) => (geometry ? energyCircleArcPath(geometry) : ''));

  private readonly visibility = this.geometry.map((geometry) => (geometry ? 'inherit' : 'hidden'));

  private readonly transform = MappedSubject.create(
    ([geometry, heading, track, trackUp]) => {
      const rotation = trackUp || !geometry ? 0 : MathUtils.diffAngle(heading.value, track.value);
      return `rotate(${rotation} ${ENERGY_CIRCLE_MAP_CENTRE} ${geometry?.centreY ?? ENERGY_CIRCLE_MAP_CENTRE})`;
    },
    this.geometry,
    this.headingWord,
    this.trackWord,
    this.props.isUsingTrackUpMode,
  );

  destroy(): void {
    this.distance.destroy();
    this.mapPixelRadius.destroy();
    this.mapRangeRadius.destroy();
    this.mapCentreYBias.destroy();
    this.headingWord.destroy();
    this.trackWord.destroy();
    this.geometry.destroy();
    this.path.destroy();
    this.visibility.destroy();
    this.transform.destroy();
    super.destroy();
  }

  render(): VNode {
    const dashArray = this.props.dashed ? '12 9' : 'none';
    return (
      <g transform={this.transform} visibility={this.visibility}>
        <path d={this.path} class="rounded shadow" stroke-width={3.0} stroke-dasharray={dashArray} />
        <path d={this.path} class="Green rounded" stroke-width={2.5} stroke-dasharray={dashArray} />
      </g>
    );
  }
}
