//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, DisplayComponent, FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { LoadsheetResults } from '../../../System/Performance/Loadsheet';
import { CG_ENVELOPES } from '../../../System/Performance/CgEnvelopes';
import {
  CgDiagramPoint,
  CgDiagramSize,
  DIAGRAM_MAX_CG,
  DIAGRAM_MAX_WEIGHT,
  DIAGRAM_MIN_CG,
  DIAGRAM_MIN_WEIGHT,
  POINT_RADIUS,
  cgDiagramPoints,
  cgToX,
  envelopeNamePosition,
  envelopePolygon,
  loadingPathPoints,
  placeLabels,
  weightToY,
} from '../../../System/Performance/CgDiagram';

interface OitCgDiagramProps extends ComponentProps {
  readonly results: Subscribable<LoadsheetResults | null>;
  readonly size: CgDiagramSize;
}

const POINT_NAMES: CgDiagramPoint['name'][] = ['DOW', 'ZFW', 'TOW', 'LW'];

const CG_TICKS = [25, 30, 35, 40, 45];
const WEIGHT_TICKS = [300_000, 400_000, 500_000, 600_000];

/**
 * The CG diagram of the LOADSHEET results: the ZF, LDG and T.O CG envelopes with the DOW, ZFW, TOW and LW points. The
 * RESULTS panel and the MORE panel draw it at their own size.
 * Design choice: the weight is plotted against the CG in % MAC with no index scale, because the FBW envelopes are
 * defined by their CG and weight.
 */
export class OitCgDiagram extends DisplayComponent<OitCgDiagramProps> {
  private readonly size = this.props.size;

  private readonly pathPoints = Subject.create('');

  private readonly pathClass = Subject.create('oit-cg-path hidden');

  private readonly pointX = POINT_NAMES.map(() => Subject.create(0));

  private readonly pointY = POINT_NAMES.map(() => Subject.create(0));

  private readonly pointClass = POINT_NAMES.map(() => Subject.create('oit-cg-point hidden'));

  private readonly labelX = POINT_NAMES.map(() => Subject.create(0));

  private readonly labelY = POINT_NAMES.map(() => Subject.create(0));

  private readonly labelAnchor = POINT_NAMES.map(() => Subject.create('start'));

  private readonly labelClass = POINT_NAMES.map(() => Subject.create('oit-cg-label hidden'));

  onAfterRender(): void {
    this.props.results.sub((results) => this.showPoints(results), true);
  }

  private showPoints(results: LoadsheetResults | null): void {
    const points = results !== null ? cgDiagramPoints(this.size, results) : null;
    const labels = points !== null ? placeLabels(this.size, points) : null;
    this.pathPoints.set(points !== null ? loadingPathPoints(points) : '');
    this.pathClass.set(points !== null ? 'oit-cg-path' : 'oit-cg-path hidden');
    POINT_NAMES.forEach((_, i) => {
      const point = points !== null ? points[i] : null;
      const state = point === null ? 'hidden' : point.outOfLimits ? 'red' : '';
      this.pointClass[i].set(`oit-cg-point ${state}`);
      this.labelClass[i].set(`oit-cg-label ${state}`);
      if (point !== null) {
        this.pointX[i].set(point.x);
        this.pointY[i].set(point.y);
        this.labelX[i].set(labels![i].x);
        this.labelY[i].set(labels![i].y);
        this.labelAnchor[i].set(labels![i].anchor);
      }
    });
  }

  render(): VNode {
    const size = this.size;
    const left = cgToX(size, DIAGRAM_MIN_CG);
    const right = cgToX(size, DIAGRAM_MAX_CG);
    const top = weightToY(size, DIAGRAM_MAX_WEIGHT);
    const bottom = weightToY(size, DIAGRAM_MIN_WEIGHT);
    return (
      <svg class="oit-cg-diagram" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
        <rect class="oit-cg-frame" x={left} y={top} width={right - left} height={bottom - top} />
        {CG_ENVELOPES.map((envelope) => (
          <polygon class="oit-cg-envelope" points={envelopePolygon(size, envelope)} />
        ))}
        {CG_ENVELOPES.map((envelope) => {
          const position = envelopeNamePosition(size, envelope);
          return (
            <text class="oit-cg-envelope-name" x={position.x} y={position.y} text-anchor="end">
              {envelope.name}
            </text>
          );
        })}
        <polyline class={this.pathClass} points={this.pathPoints} />
        {CG_TICKS.map((cg) => (
          <text class="oit-cg-axis" x={cgToX(size, cg)} y={bottom + 18} text-anchor="middle">
            {cg.toString()}
          </text>
        ))}
        {WEIGHT_TICKS.map((weight) => (
          <text class="oit-cg-axis" x={left - 6} y={weightToY(size, weight) + 4} text-anchor="end">
            {(weight / 1000).toString()}
          </text>
        ))}
        <text class="oit-cg-axis" x={right} y={size.height - 2} text-anchor="end">
          CG % MAC
        </text>
        <text class="oit-cg-axis" x={2} y={12}>
          t
        </text>
        {POINT_NAMES.map((name, i) => (
          <g>
            <circle class={this.pointClass[i]} cx={this.pointX[i]} cy={this.pointY[i]} r={POINT_RADIUS} />
            <text class={this.labelClass[i]} x={this.labelX[i]} y={this.labelY[i]} text-anchor={this.labelAnchor[i]}>
              {name}
            </text>
          </g>
        ))}
      </svg>
    );
  }
}
