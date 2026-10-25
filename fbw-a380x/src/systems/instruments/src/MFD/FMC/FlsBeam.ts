// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { FlsBeamGeometry } from '@fmgc/navigation/fls/FlsBeam';
import { FlsBeam, MfdSurvEvents } from '../../MsfsAvionicsCommon/providers/MfdSurvPublisher';

/**
 * The FLS beam as the VD shows it, along the flight plan
 * @param mapDistanceFromAircraft NM along the flight plan from the aircraft to the MAP
 * @param approachQnh the destination QNH of the PERF APPR panel, in hPa, null without one
 */
export function vdFlsBeam(beam: FlsBeamGeometry, mapDistanceFromAircraft: number, approachQnh: number | null): FlsBeam {
  return {
    anchorDistance: mapDistanceFromAircraft + beam.mapToAnchorDistance,
    anchorAltitude: beam.anchorAltitude,
    slope: beam.slope,
    ident: beam.ident,
    anchorAtThreshold: beam.anchorAtThreshold,
    approachQnh,
  };
}

/** Sends the FLS beam of the active flight plan to the VD, on a change */
export class VdFlsBeamPublisher {
  private lastSent: string | null = null;

  constructor(private readonly bus: EventBus) {}

  publish(beam: FlsBeam | null): void {
    const key = beam
      ? `${beam.anchorDistance.toFixed(1)}|${beam.anchorAltitude.toFixed(0)}|${beam.slope.toFixed(2)}|${beam.ident}|${beam.approachQnh}`
      : 'none';
    if (key !== this.lastSent) {
      this.lastSent = key;
      this.bus.getPublisher<MfdSurvEvents>().pub('a32nx_fms_vd_fls_beam', beam, true);
    }
  }
}
