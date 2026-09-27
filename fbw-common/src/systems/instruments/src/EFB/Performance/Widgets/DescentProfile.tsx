// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { DescentProfilePoint } from '@flybywiresim/fbw-sdk';
import { t } from '../../Localization/translation';

const WIDTH = 820;
const HEIGHT = 300;
const LEFT = 64;
const RIGHT = 20;
const TOP = 22;
const BOTTOM = 40;

const COLOURS = {
  path: '#22c55e',
  axis: '#9ca3af',
  grid: '#374151',
  event: 'var(--color-highlight)',
  aircraft: '#facc15',
  late: 'var(--color-utility-red)',
};

export interface DescentProfileProps {
  points: DescentProfilePoint[];
  /** The distance from the start of the descent to the target, in NM */
  totalDistance: number;
  targetAltitude: number;
  /** DESCENT CHECK: the aircraft, at a distance to the target in NM and an altitude in feet */
  aircraft?: { distanceToTarget: number; altitude: number; late: boolean };
}

/**
 * The descent profile: altitude against the distance to the target, from the top of descent (T/D) to the target,
 * with the crossover altitude, the deceleration to the speed limit and the aircraft of the descent check.
 */
export const DescentProfile = ({ points, totalDistance, targetAltitude, aircraft }: DescentProfileProps) => {
  const top = Math.max(points[0]?.altitude ?? 0, aircraft?.altitude ?? 0);
  const topRounded = Math.ceil((top + 1) / 5000) * 5000;
  const bottom = Math.floor(targetAltitude / 5000) * 5000;
  const span = Math.max(totalDistance, aircraft?.distanceToTarget ?? 0, 1);
  // Distance to the target: T/D at the left of the path, the target at the right
  const x = (toGo: number) => WIDTH - RIGHT - (toGo / span) * (WIDTH - LEFT - RIGHT);
  const y = (altitude: number) => TOP + ((topRounded - altitude) / (topRounded - bottom)) * (HEIGHT - TOP - BOTTOM);

  const altitudeLines: number[] = [];
  for (let a = bottom; a <= topRounded; a += topRounded - bottom > 20_000 ? 10_000 : 5000) {
    altitudeLines.push(a);
  }
  const distanceStep = span > 150 ? 50 : span > 60 ? 20 : 10;
  const distanceTicks: number[] = [];
  for (let d = 0; d <= span; d += distanceStep) {
    distanceTicks.push(d);
  }

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(totalDistance - p.distance)} ${y(p.altitude)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      {altitudeLines.map((a) => (
        <g key={`alt${a}`}>
          <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(a)} y2={y(a)} stroke={COLOURS.grid} strokeWidth={1} />
          <text x={LEFT - 8} y={y(a) + 5} fill={COLOURS.axis} fontSize={14} textAnchor="end">
            {a >= 10_000 ? `FL${Math.round(a / 100)}` : `${a}`}
          </text>
        </g>
      ))}
      {distanceTicks.map((d) => (
        <g key={`dist${d}`}>
          <line
            x1={x(d)}
            x2={x(d)}
            y1={HEIGHT - BOTTOM}
            y2={HEIGHT - BOTTOM + 6}
            stroke={COLOURS.axis}
            strokeWidth={1.5}
          />
          <text x={x(d)} y={HEIGHT - BOTTOM + 22} fill={COLOURS.axis} fontSize={14} textAnchor="middle">
            {d}
          </text>
        </g>
      ))}
      <text x={WIDTH - RIGHT} y={HEIGHT - 2} fill={COLOURS.axis} fontSize={13} textAnchor="end">
        {t('Performance.TopOfDescent.Calc.NmToTarget')}
      </text>
      <line
        x1={LEFT}
        x2={WIDTH - RIGHT}
        y1={HEIGHT - BOTTOM}
        y2={HEIGHT - BOTTOM}
        stroke={COLOURS.axis}
        strokeWidth={1.5}
      />

      <path d={path} fill="none" stroke={COLOURS.path} strokeWidth={3.5} />

      {/* Top of descent and target */}
      {points.length > 0 && (
        <>
          <circle cx={x(totalDistance)} cy={y(points[0].altitude)} r={6} fill={COLOURS.path} />
          <text
            x={x(totalDistance) + 8}
            y={y(points[0].altitude) - 8}
            fill={COLOURS.path}
            fontSize={16}
            fontWeight="bold"
          >
            T/D {Math.round(totalDistance)} NM
          </text>
          <circle cx={x(0)} cy={y(targetAltitude)} r={5} fill={COLOURS.path} />
        </>
      )}

      {/* Crossover, deceleration and speed limit */}
      {points
        .filter((p) => p.event !== undefined)
        .map((p) => {
          const px = x(totalDistance - p.distance);
          const py = y(p.altitude);
          return (
            <g key={`${p.event}${p.altitude}`}>
              <circle cx={px} cy={py} r={4.5} fill="none" stroke={COLOURS.event} strokeWidth={2} />
              <text x={px + 7} y={py - 7} fill={COLOURS.event} fontSize={13}>
                {p.event === 'CROSSOVER'
                  ? `${t('Performance.TopOfDescent.Calc.Crossover')} FL${Math.round(p.altitude / 100)}`
                  : p.event}
              </text>
            </g>
          );
        })}

      {/* The aircraft of the descent check */}
      {aircraft !== undefined && aircraft.distanceToTarget <= span && (
        <g>
          <polygon
            points={`${x(aircraft.distanceToTarget) - 9},${y(aircraft.altitude) - 6} ${x(aircraft.distanceToTarget) + 9},${y(aircraft.altitude)} ${x(aircraft.distanceToTarget) - 9},${y(aircraft.altitude) + 6}`}
            fill={aircraft.late ? COLOURS.late : COLOURS.aircraft}
          />
        </g>
      )}
    </svg>
  );
};
