// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { Airport } from '@flybywiresim/fbw-sdk';
import { Coordinates } from 'msfs-geo';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { MfdSurvEvents, VdSafetyAltitudeSegment } from '../../MsfsAvionicsCommon/providers/MfdSurvPublisher';
import { SafetyAltitudeGrid, loadSafetyAltitudeGrid } from './SafetyAltitudeGrid';
import {
  VD_SAFETY_ALTITUDE_RANGE_NM,
  VdCut,
  VdCutPlanElement,
  VdMsaCentre,
  computeVdSafetyAltitudes,
  vdCutAlongFlightPlan,
  vdCutAlongTrack,
  vdCutHalfWidthNm,
} from './VdSafetyAltitudeProfile';

/** What the FMS knows when it computes the safety altitudes of the VD */
export interface FmsVdSafetyAltitudeInputs {
  /** null when the FMS has no position */
  position: Coordinates | null;
  trueTrackDeg: number;
  /** the vertical cut follows the aircraft track (selected lateral modes), not the flight plan */
  alongTrack: boolean;
  plan: ReadonlyFlightPlan | null;
  /** along the active flight plan, null when not computed */
  distanceToDestinationNm: number | null;
  epuNm: number;
  rnpNm: number;
}

/**
 * The airports whose MSA is in use: the departure airport once a SID is selected, the arrival airport once an arrival
 * (STAR, approach transition or approach) is selected.
 * @param plan the active flight plan
 * @returns the airports
 */
export function msaAirports(
  plan: Pick<
    ReadonlyFlightPlan,
    'originAirport' | 'originDeparture' | 'destinationAirport' | 'arrival' | 'approachVia' | 'approach'
  >,
): Airport[] {
  const airports: Airport[] = [];
  if (plan.originAirport && plan.originDeparture) {
    airports.push(plan.originAirport);
  }
  if (plan.destinationAirport && (plan.arrival || plan.approachVia || plan.approach)) {
    airports.push(plan.destinationAirport);
  }
  return airports;
}

/**
 * @param plan the active flight plan
 * @param distanceToDestinationNm the distance to the destination along the active flight plan
 * @returns the flight plan elements from the active leg to the destination, at their distance from the aircraft
 */
export function vdCutPlanElements(plan: ReadonlyFlightPlan, distanceToDestinationNm: number): VdCutPlanElement[] {
  const elements: VdCutPlanElement[] = [];
  for (let i = plan.activeLegIndex; i < plan.firstMissedApproachLegIndex; i++) {
    const element = plan.maybeElementAt(i);
    if (!element) {
      continue;
    }
    if (element.isDiscontinuity === true) {
      elements.push({ isDiscontinuity: true });
      continue;
    }
    const toEnd = element.calculated?.cumulativeDistanceToEndWithTransitions;
    elements.push({
      isDiscontinuity: false,
      location: element.terminationWaypoint()?.location ?? null,
      distanceFromAircraftNm: toEnd !== undefined ? distanceToDestinationNm - toEnd : null,
    });
  }
  return elements;
}

/**
 * Computes the safety altitudes of the VD (grid MORA or MSA along the vertical cut, see VdSafetyAltitudeProfile) and
 * sends them to the CDS.
 */
export class FmsVdSafetyAltitudes {
  /**
   * Design choice: the VD follows the FMS computations with a delay of a few seconds; the safety altitudes are computed
   * every 2 s.
   */
  private static readonly UPDATE_PERIOD_MS = 2_000;

  /** undefined while loading, null when the file cannot be read */
  private grid: SafetyAltitudeGrid | null | undefined = undefined;

  private readonly msaByAirport = new Map<string, number | null>();

  private sinceLastUpdateMs = Infinity;

  private readonly publisher = this.bus.getPublisher<MfdSurvEvents>();

  constructor(private readonly bus: EventBus) {
    loadSafetyAltitudeGrid().then((grid) => {
      this.grid = grid;
    });
  }

  public update(deltaTimeMs: number, inputs: FmsVdSafetyAltitudeInputs): void {
    this.sinceLastUpdateMs += deltaTimeMs;
    if (this.sinceLastUpdateMs < FmsVdSafetyAltitudes.UPDATE_PERIOD_MS || this.grid === undefined) {
      return;
    }
    this.sinceLastUpdateMs = 0;
    this.publisher.pub('a380x_fms_vd_safety_altitudes', this.compute(inputs), true);
  }

  public reset(): void {
    this.sinceLastUpdateMs = Infinity;
    this.publisher.pub('a380x_fms_vd_safety_altitudes', [], true);
  }

  private compute(inputs: FmsVdSafetyAltitudeInputs): VdSafetyAltitudeSegment[] {
    const { position, plan } = inputs;
    if (position === null) {
      return [];
    }
    const grid = this.grid;
    if (!grid) {
      return [{ startNm: 0, endNm: VD_SAFETY_ALTITUDE_RANGE_NM, altitudeFt: null, type: 'MORA' }];
    }
    let cut: VdCut;
    let msaCentres: VdMsaCentre[] = [];
    if (inputs.alongTrack || plan === null || inputs.distanceToDestinationNm === null) {
      cut = vdCutAlongTrack(position, inputs.trueTrackDeg);
    } else {
      cut = vdCutAlongFlightPlan(position, vdCutPlanElements(plan, inputs.distanceToDestinationNm));
      msaCentres = msaAirports(plan).map((airport) => ({
        lat: airport.location.lat,
        long: airport.location.long,
        altitudeFt: this.msaOf(grid, airport),
      }));
    }
    return computeVdSafetyAltitudes(grid, cut, msaCentres, vdCutHalfWidthNm(inputs.epuNm, inputs.rnpNm));
  }

  private msaOf(grid: SafetyAltitudeGrid, airport: Airport): number | null {
    let msa = this.msaByAirport.get(airport.ident);
    if (msa === undefined) {
      msa = grid.msaFeet(airport.location.lat, airport.location.long);
      this.msaByAirport.set(airport.ident, msa);
    }
    return msa;
  }
}
