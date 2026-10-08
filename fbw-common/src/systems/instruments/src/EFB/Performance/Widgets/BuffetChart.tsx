// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { t } from '../../Localization/translation';
import {
  BuffetEnvelopeData,
  buffetBoundary,
  buffetMachRange,
  liftTableMachRange,
  maxOperatingMach,
} from '../Data/buffet';

/** The drawing size (SVG units); the SVG scales to the card */
export const BUFFET_CHART_WIDTH = 846;
export const BUFFET_CHART_HEIGHT = 560;

const LEFT = 58;
const RIGHT = 16;
const TOP = 14;
const BOTTOM = 36;

/** The axes: Mach across, flight level up (the cruise band of the A320) */
const MACH_MIN = 0.5;
const MACH_MAX = 0.9;
const FL_MIN = 200;
const FL_MAX = 450;

/** The theme colours (CSS variables of Assets/Theme.css) */
const COLOURS = {
  grid: 'var(--m3-tile)',
  gridMajor: 'var(--m3-outline)',
  axis: 'var(--m3-muted)',
  speedLimit: 'var(--m3-on-error)',
  recMax: 'var(--m3-on-primary-container)',
  aircraftFill: 'var(--m3-card)',
  aircraft: 'var(--m3-text)',
};

/** A buffet onset line of the chart */
export interface BuffetChartLine {
  /** The load factor (g) of the line */
  loadFactor: number;
  colour: string;
  dash?: string;
  /** The name written next to the low-speed side */
  label: string;
  /** The fill of the area inside the line, below the maximum operating Mach */
  fill?: string;
  fillOpacity?: number;
  /** Where the label sits along the low-speed side (0 bottom, 1 top) */
  labelAt?: number;
}

export interface BuffetChartProps {
  data: BuffetEnvelopeData;
  weightTonnes: number;
  cg: number;
  lines: BuffetChartLine[];
  /** The REC MAX flight level of the FMS, or null */
  recMaxFl: number | null;
  /** The aircraft or the entered point: pressure altitude (ft) and Mach; not drawn off the chart */
  point?: { pressureAltitude: number; mach: number; note: string };
}

const formatMach = (mach: number) =>
  `.${Math.round(mach * 1000)
    .toString()
    .padStart(3, '0')}`;

const x = (mach: number) => LEFT + ((mach - MACH_MIN) / (MACH_MAX - MACH_MIN)) * (BUFFET_CHART_WIDTH - LEFT - RIGHT);
const y = (fl: number) => TOP + ((FL_MAX - fl) / (FL_MAX - FL_MIN)) * (BUFFET_CHART_HEIGHT - TOP - BOTTOM);

const polyline = (points: [number, number][]) =>
  points.map(([mach, fl], i) => `${i === 0 ? 'M' : 'L'}${x(mach).toFixed(1)} ${y(fl).toFixed(1)}`).join(' ');

/**
 * The area inside a buffet line: from its low-speed side (or the M .50 edge of the chart) to its high-speed side or
 * the maximum operating Mach, whichever comes first
 */
function areaPath(data: BuffetEnvelopeData, loadFactor: number, cg: number, weightTonnes: number): string {
  const [chartLowMach] = liftTableMachRange(data);
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let fl = FL_MIN; fl <= FL_MAX; fl++) {
    const range = buffetMachRange(data, loadFactor, fl * 100, cg, weightTonnes);
    if (range === null) {
      continue;
    }
    const from = Math.max(range.low ?? chartLowMach, chartLowMach);
    const to = Math.min(range.high ?? Infinity, maxOperatingMach(data, fl * 100));
    if (from < to) {
      left.push([from, fl]);
      right.push([to, fl]);
    }
  }
  return left.length > 1 ? `${polyline([...left, ...right.reverse()])} Z` : '';
}

/**
 * The buffet envelope: pressure altitude against Mach, the buffet onset lines (the coffin corner at 1.0 g), VMO/MMO,
 * the maximum operating altitude, REC MAX of the FMS and the aircraft. Drawn as SVG (no canvas): the theme colours
 * come from the CSS variables.
 */
export const BuffetChart = ({ data, weightTonnes, cg, lines, recMaxFl, point }: BuffetChartProps) => {
  const gridLevels: number[] = [];
  for (let fl = FL_MIN; fl <= FL_MAX; fl += 25) {
    gridLevels.push(fl);
  }
  const gridMachs: number[] = [];
  for (let i = 0; i <= Math.round((MACH_MAX - MACH_MIN) / 0.05); i++) {
    gridMachs.push(MACH_MIN + i * 0.05);
  }
  const speedLimit: [number, number][] = [];
  for (let fl = FL_MIN; fl <= FL_MAX; fl++) {
    speedLimit.push([maxOperatingMach(data, fl * 100), fl]);
  }
  const maxAltitudeFl = data.maxOperatingAltitude / 100;
  const pointOnChart =
    point !== undefined &&
    point.mach >= MACH_MIN &&
    point.mach <= MACH_MAX &&
    point.pressureAltitude / 100 >= FL_MIN &&
    point.pressureAltitude / 100 <= FL_MAX;
  const hasWeight = weightTonnes > 0;

  return (
    <svg
      viewBox={`0 0 ${BUFFET_CHART_WIDTH} ${BUFFET_CHART_HEIGHT}`}
      width="100%"
      height={BUFFET_CHART_HEIGHT}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* grid: a line every 25 FL (labelled every 50) and every M .05 */}
      {gridLevels.map((fl) => (
        <g key={`fl${fl}`}>
          <line
            x1={LEFT}
            x2={BUFFET_CHART_WIDTH - RIGHT}
            y1={y(fl)}
            y2={y(fl)}
            style={{ stroke: fl % 50 === 0 ? COLOURS.gridMajor : COLOURS.grid }}
            strokeWidth={1}
          />
          {fl % 50 === 0 && (
            <text
              x={LEFT - 8}
              y={y(fl) + 4}
              textAnchor="end"
              fontSize={12}
              fontWeight={600}
              style={{ fill: COLOURS.axis }}
            >
              {`FL${fl}`}
            </text>
          )}
        </g>
      ))}
      {gridMachs.map((mach) => (
        <g key={`m${mach.toFixed(2)}`}>
          <line
            x1={x(mach)}
            x2={x(mach)}
            y1={TOP}
            y2={BUFFET_CHART_HEIGHT - BOTTOM}
            style={{ stroke: COLOURS.grid }}
            strokeWidth={1}
          />
          <text
            x={x(mach)}
            y={BUFFET_CHART_HEIGHT - BOTTOM + 18}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            style={{ fill: COLOURS.axis }}
          >
            {`M ${formatMach(mach)}`}
          </text>
        </g>
      ))}

      {/* the areas inside the lines first, so that every line stays visible */}
      {hasWeight &&
        lines
          .filter((line) => line.fill !== undefined)
          .map((line) => (
            <path
              key={`area${line.label}`}
              d={areaPath(data, line.loadFactor, cg, weightTonnes)}
              style={{ fill: line.fill, fillOpacity: line.fillOpacity ?? 0.12, stroke: 'none' }}
            />
          ))}

      {/* VMO / MMO */}
      <path d={polyline(speedLimit)} fill="none" style={{ stroke: COLOURS.speedLimit }} strokeWidth={2.5} />
      <text x={x(data.mmo) + 6} y={y(FL_MAX - 10)} fontSize={12} fontWeight={700} style={{ fill: COLOURS.speedLimit }}>
        {`MMO ${formatMach(data.mmo)}`}
      </text>
      <text
        x={x(maxOperatingMach(data, FL_MIN * 100)) + 6}
        y={y(FL_MIN + 6)}
        fontSize={12}
        fontWeight={700}
        style={{ fill: COLOURS.speedLimit }}
      >
        {`VMO ${data.vmo} kt`}
      </text>

      {/* the buffet onset lines: low-speed and high-speed sides */}
      {hasWeight &&
        lines.map((line) => {
          const boundary = buffetBoundary(data, line.loadFactor, cg, weightTonnes, FL_MIN, FL_MAX);
          const stroke = { stroke: line.colour };
          const labelPoint =
            boundary.lowSpeed.length > 0
              ? boundary.lowSpeed[Math.floor(boundary.lowSpeed.length * (line.labelAt ?? 0.5))]
              : undefined;
          return (
            <g key={`line${line.label}`}>
              {boundary.lowSpeed.length > 1 && (
                <path
                  d={polyline(boundary.lowSpeed)}
                  fill="none"
                  style={stroke}
                  strokeWidth={2.5}
                  strokeDasharray={line.dash}
                />
              )}
              {boundary.highSpeed.length > 1 && (
                <path
                  d={polyline(boundary.highSpeed)}
                  fill="none"
                  style={stroke}
                  strokeWidth={2.5}
                  strokeDasharray={line.dash}
                />
              )}
              {labelPoint && (
                <text
                  x={x(labelPoint[0]) - 8}
                  y={y(labelPoint[1])}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={700}
                  style={{ fill: line.colour }}
                >
                  {line.label}
                </text>
              )}
            </g>
          );
        })}

      {/* the maximum operating altitude */}
      <line
        x1={LEFT}
        x2={BUFFET_CHART_WIDTH - RIGHT}
        y1={y(maxAltitudeFl)}
        y2={y(maxAltitudeFl)}
        style={{ stroke: COLOURS.axis }}
        strokeWidth={1.5}
        strokeDasharray="2 4"
      />
      <text x={LEFT + 6} y={y(maxAltitudeFl) - 6} fontSize={12} fontWeight={600} style={{ fill: COLOURS.axis }}>
        {t('Performance.Buffet.MaxOperatingAltitude', [
          { altitude: data.maxOperatingAltitude.toString().replace(/(\d)(\d{3})$/, '$1 $2') },
        ])}
      </text>

      {/* REC MAX of the FMS */}
      {recMaxFl !== null && recMaxFl >= FL_MIN && recMaxFl <= FL_MAX && (
        <g>
          <line
            x1={LEFT}
            x2={BUFFET_CHART_WIDTH - RIGHT}
            y1={y(recMaxFl)}
            y2={y(recMaxFl)}
            style={{ stroke: COLOURS.recMax }}
            strokeWidth={1.5}
            strokeDasharray="8 5"
          />
          <text
            x={BUFFET_CHART_WIDTH - RIGHT - 6}
            y={y(recMaxFl) + (recMaxFl > maxAltitudeFl - 4 ? 16 : -6)}
            textAnchor="end"
            fontSize={12}
            fontWeight={700}
            style={{ fill: COLOURS.recMax }}
          >
            {`${t('Performance.Buffet.RecMax')} FL${recMaxFl} (${t('Performance.Buffet.Fms')})`}
          </text>
        </g>
      )}

      <text
        x={LEFT + 6}
        y={BUFFET_CHART_HEIGHT - BOTTOM - 8}
        fontSize={11}
        fontWeight={600}
        style={{ fill: COLOURS.axis }}
      >
        {t('Performance.Buffet.LeftEdge')}
      </text>

      {/* the aircraft (or the entered point) and a dotted line at its level */}
      {pointOnChart && (
        <g>
          <line
            x1={LEFT}
            x2={BUFFET_CHART_WIDTH - RIGHT}
            y1={y(point.pressureAltitude / 100)}
            y2={y(point.pressureAltitude / 100)}
            style={{ stroke: COLOURS.aircraft, strokeOpacity: 0.35 }}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle
            cx={x(point.mach)}
            cy={y(point.pressureAltitude / 100)}
            r={9}
            style={{ fill: COLOURS.aircraftFill, stroke: COLOURS.aircraft }}
            strokeWidth={3}
          />
          <circle cx={x(point.mach)} cy={y(point.pressureAltitude / 100)} r={3} style={{ fill: COLOURS.aircraft }} />
          <text
            x={x(point.mach) + 14}
            y={y(point.pressureAltitude / 100) + 18}
            fontSize={12}
            fontWeight={700}
            style={{ fill: COLOURS.aircraft }}
          >
            {point.note}
          </text>
        </g>
      )}
    </svg>
  );
};
