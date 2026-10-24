// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useRef, useState } from 'react';
import { MathUtils } from '@flybywiresim/fbw-sdk-react';
import { groupThousands } from '../../../Dashboard/logic/dashboardFormat';
import { CategoryColours, ceilingCategory } from './logic/flightCategory';
import { CloudLayer } from './logic/reportElements';
import { skyRows, skyScaleTopFt, skyTicksFt, skyY } from './logic/skyColumn';
import { formatDirection } from './logic/weatherFormat';

/** SVG colours go through style properties: the sim browser does not resolve var() in presentation attributes */
export const SvgColour = {
  text: 'var(--m3-text)',
  muted: 'var(--m3-muted)',
  outline: 'var(--m3-outline)',
  primary: 'var(--m3-primary)',
  ground: 'var(--m3-ground)',
  tile: 'var(--m3-tile)',
};
const TAIL_COLOUR = CategoryColours.IFR;

/** A point at a bearing (degrees from the top, clockwise) and distance from a centre */
const polar = (cx: number, cy: number, radius: number, bearingDeg: number): { x: number; y: number } => ({
  x: cx + radius * Math.sin(bearingDeg * MathUtils.DEGREES_TO_RADIANS),
  y: cy - radius * Math.cos(bearingDeg * MathUtils.DEGREES_TO_RADIANS),
});

/** The size of a box, measured once laid out: the sim browser can report 0 on the first frame */
export const useBoxSize = (): [React.RefObject<HTMLDivElement>, { width: number; height: number }] => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const box = ref.current;
      if (!box || box.clientWidth === 0 || box.clientHeight === 0) {
        frame = requestAnimationFrame(measure);
        return;
      }
      setSize({ width: box.clientWidth, height: box.clientHeight });
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, []);
  return [ref, size];
};

const DIAGRAM_WIDTH = 560;
const DIAGRAM_HEIGHT = 290;
const RING_CX = 150;
const RING_CY = 145;
const RING_RADIUS = 118;
const RUNWAY_HALF_LENGTH = 92;
const RUNWAY_WIDTH = 28;
const ARROW_LENGTH = 104;
const BARS_X = 320;
const BAR_WIDTH = 220;

interface ComponentBarProps {
  y: number;
  label: string;
  valueKt: number;
  scaleKt: number;
  colour: string;
}

const ComponentBar: FC<ComponentBarProps> = ({ y, label, valueKt, scaleKt, colour }) => (
  <g>
    <text x={BARS_X} y={y} style={{ fill: SvgColour.muted, fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>
      {label}
    </text>
    <rect
      x={BARS_X}
      y={y + 8}
      width={BAR_WIDTH}
      height={12}
      style={{ fill: SvgColour.ground, stroke: SvgColour.outline }}
    />
    <rect
      x={BARS_X}
      y={y + 8}
      width={Math.min(1, valueKt / scaleKt) * BAR_WIDTH}
      height={12}
      style={{ fill: colour }}
    />
    <text x={BARS_X} y={y + 44} style={{ fill: colour, fontSize: 22, fontWeight: 800 }}>
      {`${valueKt} kt`}
    </text>
  </g>
);

export interface RunwayWindDiagramProps {
  runwayIdent: string;
  runwayBearing: number;
  /** Null for a variable wind */
  windDirDeg: number | null;
  speedKt: number;
  /** Negative for a tailwind; null when no component applies (calm or variable) */
  headwindKt: number | null;
  crosswindKt: number;
  gustCrosswindKt: number | null;
  crosswindSideLabel: string;
  scaleKt: number;
  labels: { headwind: string; tailwind: string; gustCross: string; scale: string; noComponent: string };
  windText: string;
}

/**
 * The chosen runway end pointing up inside a compass ring turned to match, the wind arrow from where it blows, and the
 * wind along and across the runway as bars beside it
 */
export const RunwayWindDiagram: FC<RunwayWindDiagramProps> = ({
  runwayIdent,
  runwayBearing,
  windDirDeg,
  speedKt,
  headwindKt,
  crosswindKt,
  gustCrosswindKt,
  crosswindSideLabel,
  scaleKt,
  labels,
  windText,
}) => {
  const ring: JSX.Element[] = [];
  for (let bearing = 0; bearing < 360; bearing += 10) {
    const relative = bearing - runwayBearing;
    const major = bearing % 30 === 0;
    const inner = polar(RING_CX, RING_CY, RING_RADIUS - (major ? 8 : 4), relative);
    const outer = polar(RING_CX, RING_CY, RING_RADIUS, relative);
    ring.push(
      <line
        key={`tick${bearing}`}
        x1={inner.x}
        y1={inner.y}
        x2={outer.x}
        y2={outer.y}
        style={{ stroke: SvgColour.muted, strokeWidth: major ? 2 : 1 }}
      />,
    );
    if (major) {
      const label = polar(RING_CX, RING_CY, RING_RADIUS + 14, relative);
      ring.push(
        <text
          key={`label${bearing}`}
          x={label.x}
          y={label.y + 4}
          textAnchor="middle"
          style={{ fill: SvgColour.muted, fontSize: 11, fontWeight: 700 }}
        >
          {formatDirection(bearing)}
        </text>,
      );
    }
  }

  let arrow: JSX.Element | null = null;
  if (windDirDeg !== null && speedKt > 0) {
    const relative = windDirDeg - runwayBearing;
    const tail = polar(RING_CX, RING_CY, RING_RADIUS - 2, relative);
    const tip = polar(RING_CX, RING_CY, RING_RADIUS - ARROW_LENGTH, relative);
    const left = polar(tip.x, tip.y, 14, relative - 28);
    const right = polar(tip.x, tip.y, 14, relative + 28);
    arrow = (
      <g>
        <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} style={{ stroke: SvgColour.primary, strokeWidth: 4 }} />
        <polygon
          points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
          style={{ fill: SvgColour.primary }}
        />
      </g>
    );
  }

  return (
    <svg viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`} width="100%" height="100%">
      <circle cx={RING_CX} cy={RING_CY} r={RING_RADIUS} style={{ fill: 'none', stroke: SvgColour.outline }} />
      {ring}
      <rect
        x={RING_CX - RUNWAY_WIDTH / 2}
        y={RING_CY - RUNWAY_HALF_LENGTH}
        width={RUNWAY_WIDTH}
        height={RUNWAY_HALF_LENGTH * 2}
        style={{ fill: SvgColour.tile, stroke: SvgColour.outline }}
      />
      <line
        x1={RING_CX}
        y1={RING_CY - RUNWAY_HALF_LENGTH + 14}
        x2={RING_CX}
        y2={RING_CY + RUNWAY_HALF_LENGTH - 34}
        style={{ stroke: SvgColour.text, strokeWidth: 2, strokeDasharray: '9 7' }}
      />
      <text
        x={RING_CX}
        y={RING_CY + RUNWAY_HALF_LENGTH - 10}
        textAnchor="middle"
        style={{ fill: SvgColour.text, fontSize: 15, fontWeight: 800 }}
      >
        {runwayIdent}
      </text>
      {arrow}
      {headwindKt !== null ? (
        <g>
          <ComponentBar
            y={34}
            label={headwindKt >= 0 ? labels.headwind : labels.tailwind}
            valueKt={Math.abs(headwindKt)}
            scaleKt={scaleKt}
            colour={headwindKt >= 0 ? SvgColour.text : TAIL_COLOUR}
          />
          <ComponentBar
            y={110}
            label={crosswindSideLabel}
            valueKt={crosswindKt}
            scaleKt={scaleKt}
            colour={SvgColour.text}
          />
          {gustCrosswindKt !== null && gustCrosswindKt > crosswindKt && (
            <ComponentBar
              y={186}
              label={labels.gustCross}
              valueKt={gustCrosswindKt}
              scaleKt={scaleKt}
              colour={SvgColour.text}
            />
          )}
          <text x={BARS_X} y={274} style={{ fill: SvgColour.muted, fontSize: 12 }}>
            {`${windText} · ${labels.scale}`}
          </text>
        </g>
      ) : (
        <g>
          <text x={BARS_X} y={100} style={{ fill: SvgColour.text, fontSize: 22, fontWeight: 800 }}>
            {windText}
          </text>
          <text x={BARS_X} y={124} style={{ fill: SvgColour.muted, fontSize: 13 }}>
            {labels.noComponent}
          </text>
        </g>
      )}
    </svg>
  );
};

const SKY_LEFT = 58;
const SKY_RIGHT_MARGIN = 8;
const SKY_TOP = 12;
const GROUND_STRIP = 22;
const SKY_BOTTOM_MARGIN = 34;
/** Room for a label above its bar */
const SKY_ROW_GAP = 40;
const SKY_GROUND_GAP = 10;
const CELL_INSET = 7;
const BAR_HEIGHT = 14;

interface SkyColumnProps {
  clouds: CloudLayer[];
  ceilingFt: number | null;
  /** The ground strip's text, e.g. "Field elevation 1,088 ft"; empty without one */
  groundText: string;
  ceilingLabel: string;
}

/**
 * The sky over the airport filling its panel: a height scale, one bar of eight cells per cloud height (the filled
 * cells are the cover in eighths), the ceiling in its flight category colour, the ground strip at the bottom
 */
export const SkyColumn: FC<SkyColumnProps> = ({ clouds, ceilingFt, groundText, ceilingLabel }) => {
  const [boxRef, { width, height }] = useBoxSize();
  let drawing: JSX.Element | null = null;
  if (width > 0 && height > 0) {
    const right = width - SKY_RIGHT_MARGIN;
    const bottom = height - SKY_BOTTOM_MARGIN;
    const topFt = skyScaleTopFt(clouds);
    const yOf = (ft: number) => skyY(ft, topFt, SKY_TOP, bottom);
    const cellWidth = (right - SKY_LEFT - CELL_INSET * 2) / 8;
    const rows = skyRows(clouds, topFt, SKY_TOP, bottom, SKY_ROW_GAP, SKY_GROUND_GAP);
    drawing = (
      <svg width={width} height={height}>
        <rect
          x={SKY_LEFT}
          y={SKY_TOP}
          width={right - SKY_LEFT}
          height={bottom - SKY_TOP}
          style={{ fill: SvgColour.tile }}
        />
        {skyTicksFt(topFt).map((ft) => (
          <g key={ft}>
            <line x1={SKY_LEFT - 6} y1={yOf(ft)} x2={right} y2={yOf(ft)} style={{ stroke: SvgColour.outline }} />
            <text x={SKY_LEFT - 10} y={yOf(ft) + 4} textAnchor="end" style={{ fill: SvgColour.muted, fontSize: 12 }}>
              {groupThousands(ft)}
            </text>
          </g>
        ))}
        <rect
          x={SKY_LEFT}
          y={bottom}
          width={right - SKY_LEFT}
          height={GROUND_STRIP}
          style={{ fill: SvgColour.ground }}
        />
        {groundText && (
          <text
            x={(SKY_LEFT + right) / 2}
            y={bottom + 15}
            textAnchor="middle"
            style={{ fill: SvgColour.muted, fontSize: 11, fontWeight: 800, letterSpacing: 1 }}
          >
            {groundText}
          </text>
        )}
        {rows.map((row) => {
          const isCeiling = row.baseFt === ceilingFt;
          const colour = isCeiling ? CategoryColours[ceilingCategory(row.baseFt)] : SvgColour.text;
          const cells: JSX.Element[] = [];
          for (let cell = 0; cell < 8; cell++) {
            const filled = cell < row.oktas;
            cells.push(
              <rect
                key={cell}
                x={SKY_LEFT + CELL_INSET + cell * cellWidth + 1}
                y={row.barY - BAR_HEIGHT / 2}
                width={cellWidth - 2}
                height={BAR_HEIGHT}
                style={{ fill: filled ? colour : 'none', stroke: colour, strokeOpacity: filled ? 1 : 0.35 }}
              />,
            );
          }
          return (
            <g key={row.baseFt}>
              {cells}
              {row.barY !== yOf(row.baseFt) && (
                <line
                  x1={SKY_LEFT}
                  y1={yOf(row.baseFt)}
                  x2={SKY_LEFT + CELL_INSET}
                  y2={row.barY}
                  style={{ stroke: colour, strokeWidth: 2 }}
                />
              )}
              <text
                x={SKY_LEFT + CELL_INSET}
                y={row.barY - 13}
                style={{ fill: colour, fontSize: 15, fontWeight: isCeiling ? 800 : 700 }}
              >
                {`${row.covers.join(' ')} ${groupThousands(row.baseFt)} ft`}
              </text>
              {isCeiling && (
                <text
                  x={right - 6}
                  y={row.barY - 13}
                  textAnchor="end"
                  style={{ fill: colour, fontSize: 11, fontWeight: 800, letterSpacing: 1 }}
                >
                  {ceilingLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }
  return (
    <div ref={boxRef} className="min-h-0 flex-1 overflow-hidden">
      {drawing}
    </div>
  );
};
