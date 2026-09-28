// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { BtvExitAssessment, BtvExitStatus, BtvLines } from '@flybywiresim/fbw-sdk';
import { t } from '../../Localization/translation';

const WIDTH = 820;
const HEIGHT = 300;
const RUNWAY_X = 16;
const RUNWAY_END_MARGIN = 16;
const RUNWAY_TOP = 124;
const RUNWAY_HEIGHT = 56;
const RUNWAY_BOTTOM = RUNWAY_TOP + RUNWAY_HEIGHT;
/** The runway exits leave the runway below it, with their names */
const EXIT_NAME_Y = RUNWAY_BOTTOM + 27;
const BAR_Y = RUNWAY_BOTTOM + 38;
const BAR_HEIGHT = 12;
const SCALE_Y = HEIGHT - 22;
/** Width of one character of the 14 px scale labels, in viewBox units (upper bound, for the edge check) */
const SCALE_CHAR_WIDTH = 9;

const COLOURS = {
  asphalt: '#3b4048',
  paint: '#e5e7eb',
  air: '#9ca3af',
  touchdown: 'var(--color-highlight)',
  data: '#22c55e',
  estimate: 'var(--color-utility-amber)',
  overrun: 'var(--color-utility-red)',
  scale: '#9ca3af',
  unselected: '#6b7280',
  /** The DRY and WET lines, as on the OANS */
  btvLine: '#ff94ff',
};

const EXIT_COLOURS: Record<BtvExitStatus, string> = {
  [BtvExitStatus.Recommended]: COLOURS.data,
  [BtvExitStatus.BeyondWet]: COLOURS.data,
  [BtvExitStatus.DryOnly]: COLOURS.estimate,
  [BtvExitStatus.NotAchievable]: COLOURS.overrun,
};

/** A stop point of the landing roll */
export interface LandingRunwayStop {
  label: string;
  /** Distance from the threshold in metres */
  distance: number;
  /** The braking mode of the results: bold, with its margin */
  selected: boolean;
  estimate: boolean;
}

export interface LandingRunwayProps {
  ident: string | undefined;
  /** Landing distance available in metres */
  lda: number;
  /** The touchdown point in metres from the threshold */
  airDistance: number | undefined;
  stops: LandingRunwayStop[];
  /** DISPATCH: the required landing distance, in metres */
  required?: { distance: number; estimate: boolean };
  distanceUnit: 'm' | 'ft';
  /** A380: the BTV DRY and WET lines, and the runway exits with what BTV can achieve with them */
  btv?: { lines: BtvLines; exits: BtvExitAssessment[] };
}

/**
 * The landing runway seen from above, landing to the right: the airborne phase from 50 ft above the threshold to the
 * touchdown, the stop point of each braking mode (IN-FLIGHT) or the required landing distance (DISPATCH), and the
 * margin to the end of the landing distance available.
 */
export const LandingRunway = ({ ident, lda, airDistance, stops, required, distanceUnit, btv }: LandingRunwayProps) => {
  const farthest = Math.max(lda, required?.distance ?? 0, btv?.lines.wet ?? 0, ...stops.map((s) => s.distance));
  const scale = (WIDTH - RUNWAY_X - RUNWAY_END_MARGIN) / Math.max(farthest, 1);
  const x = (metres: number) => RUNWAY_X + metres * scale;
  const runwayEnd = x(lda);
  const toUnit = (metres: number) => (distanceUnit === 'ft' ? metres * 3.28084 : metres);
  const format = (metres: number) => `${Math.round(toUnit(metres)).toLocaleString('en-US')} ${distanceUnit}`;
  const clampEndLabel = (lx: number) => Math.min(Math.max(lx - 6, 190), WIDTH - 4);
  const centreY = RUNWAY_TOP + RUNWAY_HEIGHT / 2;

  // The farthest stop point on the top row: no line of a stop point crosses a label
  const rows = [...stops].sort((a, b) => b.distance - a.distance);
  const selected = stops.find((s) => s.selected);
  const selectedEnd = selected !== undefined ? x(selected.distance) : undefined;

  const step = distanceUnit === 'ft' ? 2000 / 3.28084 : 500;
  const ticks: number[] = [];
  for (let d = 0; d <= farthest + 1; d += step) {
    ticks.push(d);
  }

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      {/* Runway, to the end of the landing distance available */}
      <rect x={RUNWAY_X} y={RUNWAY_TOP} width={runwayEnd - RUNWAY_X} height={RUNWAY_HEIGHT} fill={COLOURS.asphalt} />
      {[RUNWAY_TOP + 3, RUNWAY_TOP + RUNWAY_HEIGHT - 3].map((y) => (
        <line key={`edge${y}`} x1={RUNWAY_X} x2={runwayEnd} y1={y} y2={y} stroke={COLOURS.paint} strokeWidth={2} />
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={`keys${i}`} x={RUNWAY_X + 4} y={RUNWAY_TOP + 9 + i * 8} width={18} height={4} fill={COLOURS.paint} />
      ))}
      <text
        x={RUNWAY_X + 40}
        y={centreY}
        fill={COLOURS.paint}
        fontSize={24}
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(90 ${RUNWAY_X + 40} ${centreY})`}
      >
        {ident ?? ''}
      </text>
      <line
        x1={RUNWAY_X + 64}
        x2={runwayEnd - 8}
        y1={centreY}
        y2={centreY}
        stroke={COLOURS.paint}
        strokeWidth={3}
        strokeDasharray="22 16"
      />

      {/* Airborne phase: 50 ft above the threshold to the touchdown */}
      {airDistance !== undefined && (
        <>
          <path
            d={`M ${RUNWAY_X} ${RUNWAY_TOP - 26} Q ${x(airDistance * 0.7)} ${RUNWAY_TOP - 12} ${x(airDistance)} ${centreY}`}
            fill="none"
            stroke={COLOURS.air}
            strokeWidth={2.5}
            strokeDasharray="6 5"
          />
          <circle cx={x(airDistance)} cy={centreY} r={5} fill={COLOURS.touchdown} />
          <text x={x(airDistance) + 8} y={centreY + 22} fill={COLOURS.touchdown} fontSize={15}>
            {t('Performance.Landing.Calc.Touchdown')}
          </text>
        </>
      )}

      {/* Stop points: one row each, the farthest on top, each label to the left of its line */}
      {rows.map((s, row) => {
        const sx = x(s.distance);
        const overrun = s.distance > lda;
        const colour = overrun
          ? COLOURS.overrun
          : s.selected
            ? s.estimate
              ? COLOURS.estimate
              : COLOURS.data
            : COLOURS.unselected;
        const labelY = 18 + row * 22;
        return (
          <g key={s.label}>
            <line
              x1={sx}
              x2={sx}
              y1={labelY - 13}
              y2={RUNWAY_TOP + RUNWAY_HEIGHT}
              stroke={colour}
              strokeWidth={s.selected ? 3.5 : 2}
            />
            <text
              x={clampEndLabel(sx)}
              y={labelY}
              fill={colour}
              fontSize={s.selected ? 18 : 16}
              fontWeight={s.selected ? 'bold' : 'normal'}
              textAnchor="end"
            >
              {`${s.label} ${format(s.distance)}${s.estimate ? '*' : ''}`}
            </text>
          </g>
        );
      })}

      {/* DISPATCH: the required landing distance */}
      {required !== undefined && (
        <>
          <rect
            x={RUNWAY_X}
            y={BAR_Y}
            width={Math.min(x(required.distance), runwayEnd) - RUNWAY_X}
            height={BAR_HEIGHT}
            fill={required.estimate ? COLOURS.estimate : COLOURS.data}
          />
          {required.distance > lda && (
            <rect
              x={runwayEnd}
              y={BAR_Y}
              width={x(required.distance) - runwayEnd}
              height={BAR_HEIGHT}
              fill={COLOURS.overrun}
            />
          )}
          <text
            x={Math.max(Math.min(x(required.distance), WIDTH - 4), 260)}
            y={BAR_Y + BAR_HEIGHT + 20}
            fill={required.distance > lda ? COLOURS.overrun : required.estimate ? COLOURS.estimate : COLOURS.data}
            fontSize={17}
            fontWeight="bold"
            textAnchor="end"
          >
            {`${t('Performance.Landing.Calc.Required')} ${format(required.distance)}${required.estimate ? '*' : ''}`}
          </text>
        </>
      )}

      {/* The margin of the braking mode of the results to the end of the landing distance available */}
      {required === undefined && selected !== undefined && selectedEnd !== undefined && selectedEnd < runwayEnd - 4 && (
        <>
          <line
            x1={selectedEnd}
            x2={runwayEnd}
            y1={BAR_Y + BAR_HEIGHT / 2}
            y2={BAR_Y + BAR_HEIGHT / 2}
            stroke={COLOURS.data}
            strokeWidth={2}
            strokeDasharray="5 4"
          />
          <text
            x={(selectedEnd + runwayEnd) / 2}
            y={BAR_Y + BAR_HEIGHT + 20}
            fill={COLOURS.data}
            fontSize={16}
            textAnchor="middle"
          >
            {format(lda - selected.distance)}
          </text>
        </>
      )}
      <line
        x1={runwayEnd}
        x2={runwayEnd}
        y1={RUNWAY_TOP - 6}
        y2={BAR_Y + BAR_HEIGHT + 2}
        stroke={COLOURS.paint}
        strokeWidth={3}
      />

      {/* BTV: the runway exits, and the DRY and WET lines as on the OANS (red beyond the runway end) */}
      {btv?.exits.map((e) => {
        const ex = x(e.distance);
        const colour = EXIT_COLOURS[e.status];
        const recommended = e.status === BtvExitStatus.Recommended;
        return (
          <g key={`exit${e.name}${e.distance}`}>
            <line
              x1={ex}
              x2={ex + 12}
              y1={RUNWAY_BOTTOM}
              y2={RUNWAY_BOTTOM + 14}
              stroke={colour}
              strokeWidth={recommended ? 5 : 3}
            />
            <text
              x={ex + 6}
              y={EXIT_NAME_Y}
              fill={colour}
              fontSize={recommended ? 15 : 13}
              fontWeight={recommended ? 'bold' : 'normal'}
              textAnchor="middle"
            >
              {e.name}
            </text>
          </g>
        );
      })}
      {btv !== undefined &&
        (
          [
            ['DRY', btv.lines.dry],
            ['WET', btv.lines.wet],
          ] as const
        ).map(([label, distance]) => {
          const lx = x(distance);
          const colour = distance > lda ? COLOURS.overrun : COLOURS.btvLine;
          return (
            <g key={label}>
              <line x1={lx} x2={lx} y1={RUNWAY_TOP} y2={RUNWAY_BOTTOM} stroke={colour} strokeWidth={3} />
              <text x={lx - 4} y={RUNWAY_TOP + 15} fill={colour} fontSize={14} fontWeight="bold" textAnchor="end">
                {label}
              </text>
            </g>
          );
        })}

      {/* Scale from the threshold */}
      <line x1={RUNWAY_X} x2={x(farthest)} y1={SCALE_Y} y2={SCALE_Y} stroke={COLOURS.scale} strokeWidth={1} />
      {ticks.map((d) => {
        const label = Math.round(toUnit(d)).toLocaleString('en-US');
        // A label centred on a tick near the right edge would be cut: it ends at the edge instead
        const overflows = x(d) + (label.length * SCALE_CHAR_WIDTH) / 2 > WIDTH;
        return (
          <g key={`tick${d}`}>
            <line x1={x(d)} x2={x(d)} y1={SCALE_Y - 5} y2={SCALE_Y + 5} stroke={COLOURS.scale} strokeWidth={1.5} />
            <text
              x={overflows ? WIDTH - 2 : x(d)}
              y={SCALE_Y + 19}
              fill={COLOURS.scale}
              fontSize={14}
              textAnchor={overflows ? 'end' : 'middle'}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
