// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { TakeoffRunwayDistances } from '@flybywiresim/fbw-sdk';
import { t } from '../../Localization/translation';

const WIDTH = 820;
const HEIGHT = 300;
const RUNWAY_X = 16;
const RUNWAY_END_MARGIN = 16;
const RUNWAY_TOP = 92;
const RUNWAY_HEIGHT = 84;
const BAR_Y = RUNWAY_TOP + RUNWAY_HEIGHT + 14;
const BAR_HEIGHT = 16;
const SCALE_Y = HEIGHT - 26;

const COLOURS = {
  asphalt: '#3b4048',
  paint: '#e5e7eb',
  unusable: '#1a1d22',
  lineUp: '#6b7280',
  v1: 'var(--color-highlight)',
  vr: '#ffffff',
  screenHeight: '#22c55e',
  data: '#22c55e',
  estimate: 'var(--color-utility-amber)',
  overrun: 'var(--color-utility-red)',
  scale: '#9ca3af',
};

/** The reciprocal runway designator: 05 -> 23, 27L -> 09R */
function reciprocal(ident: string): string {
  const match = ident.match(/^(\d{1,2})([LRC]?)$/);
  if (!match) {
    return '';
  }
  const number = ((parseInt(match[1]) + 17) % 36) + 1;
  const side = { L: 'R', R: 'L', C: 'C', '': '' }[match[2]];
  return `${number.toString().padStart(2, '0')}${side}`;
}

export interface TakeoffRunwayProps {
  /** Runway ident without the airport, e.g. 05 */
  ident: string | undefined;
  /** Length of the runway in metres (the TORA when the runway is entered manually) */
  runwayLength: number;
  /** Takeoff shift in metres: the part of the runway behind the intersection */
  shift: number;
  /** Line-up allowance in metres */
  lineUp: number;
  distances: TakeoffRunwayDistances | undefined;
  distanceUnit: 'm' | 'ft';
  /** The shortest runway of the data in metres, for a required length below it */
  shortestDataLength: number;
}

/**
 * The runway seen from above, takeoff to the right: the takeoff shift and the line-up allowance, then the takeoff run
 * with the points where V1, VR and 35 ft are reached, the runway length required and the margin to the runway end.
 */
export const TakeoffRunway = ({
  ident,
  runwayLength,
  shift,
  lineUp,
  distances,
  distanceUnit,
  shortestDataLength,
}: TakeoffRunwayProps) => {
  const required = distances?.required;
  const start = shift + lineUp;
  const drawnRequired = required ?? (distances?.requiredBelowData ? shortestDataLength : undefined);
  const total = Math.max(runwayLength, start + (drawnRequired ?? 0), 1);
  const scale = (WIDTH - RUNWAY_X - RUNWAY_END_MARGIN) / total;
  const x = (metres: number) => RUNWAY_X + metres * scale;
  const runwayEnd = x(runwayLength);
  const takeoffStart = x(start);
  const toUnit = (metres: number) => (distanceUnit === 'ft' ? metres * 3.28084 : metres);
  const format = (metres: number) => `${Math.round(toUnit(metres)).toLocaleString('en-US')} ${distanceUnit}`;
  const clampLabel = (lx: number) => Math.min(Math.max(lx, 70), WIDTH - 70);
  /** A marker label ends just before its line: V1 <= VR <= 35 ft, so no line of a marker crosses a label */
  const clampEndLabel = (lx: number) => Math.min(Math.max(lx - 6, 150), WIDTH - 4);

  const markers: { at: number; label: string; colour: string; row: number }[] = [];
  if (distances?.v1 !== undefined) {
    markers.push({ at: distances.v1, label: 'V1', colour: COLOURS.v1, row: 2 });
  }
  if (distances?.vr !== undefined) {
    markers.push({ at: distances.vr, label: 'VR', colour: COLOURS.vr, row: 1 });
  }
  if (distances?.screenHeight !== undefined) {
    markers.push({
      at: distances.screenHeight,
      label: t('Performance.Takeoff.Calc.ScreenHeight'),
      colour: COLOURS.screenHeight,
      row: 0,
    });
  }

  // The scale from brake release, in steps of 500 m or 2000 ft
  const step = distanceUnit === 'ft' ? 2000 / 3.28084 : 500;
  const ticks: number[] = [];
  for (let d = 0; start + d <= total + 1; d += step) {
    ticks.push(d);
  }

  const centreY = RUNWAY_TOP + RUNWAY_HEIGHT / 2;
  const overrun = required !== undefined && distances !== undefined && required > distances.available;
  const requiredEnd = drawnRequired !== undefined ? x(start + drawnRequired) : undefined;
  const barColour = distances?.requiredEstimated ? COLOURS.estimate : COLOURS.data;
  const margin = required !== undefined && distances !== undefined ? distances.available - required : undefined;
  const pianoKeys = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      {/* Runway */}
      <rect x={RUNWAY_X} y={RUNWAY_TOP} width={runwayEnd - RUNWAY_X} height={RUNWAY_HEIGHT} fill={COLOURS.asphalt} />
      {[RUNWAY_TOP + 3, RUNWAY_TOP + RUNWAY_HEIGHT - 3].map((y) => (
        <line key={`edge${y}`} x1={RUNWAY_X} x2={runwayEnd} y1={y} y2={y} stroke={COLOURS.paint} strokeWidth={2} />
      ))}
      {pianoKeys.map((i) => (
        <g key={`keys${i}`}>
          <rect x={RUNWAY_X + 4} y={RUNWAY_TOP + 9 + i * 9} width={20} height={5} fill={COLOURS.paint} />
          <rect x={runwayEnd - 24} y={RUNWAY_TOP + 9 + i * 9} width={20} height={5} fill={COLOURS.paint} />
        </g>
      ))}
      {[
        { at: RUNWAY_X + 46, text: ident ?? '', angle: 90 },
        { at: runwayEnd - 46, text: ident ? reciprocal(ident) : '', angle: -90 },
      ].map((d) => (
        <text
          key={`designator${d.angle}`}
          x={d.at}
          y={centreY}
          fill={COLOURS.paint}
          fontSize={28}
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(${d.angle} ${d.at} ${centreY})`}
        >
          {d.text}
        </text>
      ))}
      <line
        x1={RUNWAY_X + 76}
        x2={runwayEnd - 76}
        y1={centreY}
        y2={centreY}
        stroke={COLOURS.paint}
        strokeWidth={3}
        strokeDasharray="22 16"
      />

      {/* Takeoff shift and line-up allowance */}
      {shift > 0 && (
        <>
          <rect
            x={RUNWAY_X}
            y={RUNWAY_TOP}
            width={x(shift) - RUNWAY_X}
            height={RUNWAY_HEIGHT}
            fill={COLOURS.unusable}
            opacity={0.85}
          />
          <text
            x={clampLabel((RUNWAY_X + x(shift)) / 2)}
            y={RUNWAY_TOP - 10}
            fill={COLOURS.scale}
            fontSize={16}
            textAnchor="middle"
          >
            {`${t('Performance.Takeoff.Calc.Shift')} ${format(shift)}`}
          </text>
        </>
      )}
      {lineUp > 0 && (
        <rect
          x={x(shift)}
          y={RUNWAY_TOP}
          width={takeoffStart - x(shift)}
          height={RUNWAY_HEIGHT}
          fill={COLOURS.lineUp}
          opacity={0.75}
        />
      )}

      {/* Required length, and the margin to the runway end */}
      {distances !== undefined && requiredEnd !== undefined && (
        <>
          <rect
            x={takeoffStart}
            y={BAR_Y}
            width={Math.min(requiredEnd, runwayEnd) - takeoffStart}
            height={BAR_HEIGHT}
            fill={barColour}
            opacity={required === undefined ? 0.35 : 1}
          />
          {overrun && (
            <rect x={runwayEnd} y={BAR_Y} width={requiredEnd - runwayEnd} height={BAR_HEIGHT} fill={COLOURS.overrun} />
          )}
          <text
            x={Math.max(Math.min(requiredEnd, WIDTH - 4), takeoffStart + 220)}
            y={BAR_Y + BAR_HEIGHT + 22}
            fill={overrun ? COLOURS.overrun : barColour}
            fontSize={18}
            fontWeight="bold"
            textAnchor="end"
          >
            {`${t('Performance.Takeoff.Calc.Required')} ${
              required !== undefined
                ? `${format(required)}${distances.requiredEstimated ? '*' : ''}`
                : t('Performance.Takeoff.Calc.BelowData').replace('{length}', format(shortestDataLength))
            }`}
          </text>
          {margin !== undefined && margin > 0 && runwayEnd - requiredEnd > 4 && (
            <>
              <line
                x1={requiredEnd}
                x2={runwayEnd}
                y1={BAR_Y + BAR_HEIGHT / 2}
                y2={BAR_Y + BAR_HEIGHT / 2}
                stroke={COLOURS.data}
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              <line
                x1={runwayEnd}
                x2={runwayEnd}
                y1={BAR_Y - 2}
                y2={BAR_Y + BAR_HEIGHT + 2}
                stroke={COLOURS.data}
                strokeWidth={3}
              />
            </>
          )}
        </>
      )}

      {/* V1, VR, 35 ft: one row each, the farthest point on top, each label to the left of its line */}
      {markers.map((m) => {
        const mx = x(start + m.at);
        const labelY = 20 + m.row * 23;
        return (
          <g key={m.label}>
            <line x1={mx} x2={mx} y1={labelY - 14} y2={RUNWAY_TOP + RUNWAY_HEIGHT} stroke={m.colour} strokeWidth={3} />
            <text x={clampEndLabel(mx)} y={labelY} fill={m.colour} fontSize={19} fontWeight="bold" textAnchor="end">
              {`${m.label} ${format(m.at)}`}
            </text>
          </g>
        );
      })}

      {/* Scale from brake release */}
      <line x1={takeoffStart} x2={x(total)} y1={SCALE_Y} y2={SCALE_Y} stroke={COLOURS.scale} strokeWidth={1} />
      {ticks.map((d) => (
        <g key={`tick${d}`}>
          <line
            x1={x(start + d)}
            x2={x(start + d)}
            y1={SCALE_Y - 5}
            y2={SCALE_Y + 5}
            stroke={COLOURS.scale}
            strokeWidth={1.5}
          />
          <text x={x(start + d)} y={SCALE_Y + 22} fill={COLOURS.scale} fontSize={15} textAnchor="middle">
            {Math.round(toUnit(d)).toLocaleString('en-US')}
          </text>
        </g>
      ))}
    </svg>
  );
};
