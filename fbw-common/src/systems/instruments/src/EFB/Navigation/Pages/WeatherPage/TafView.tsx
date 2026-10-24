// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { t } from '../../../Localization/translation';
import { DashboardCard, FieldLabel, HeaderChip } from '../../../Dashboard/Cards/CardParts';
import { StationNote } from './MetarView';
import { SvgColour, useBoxSize } from './WeatherGraphics';
import { MetarWind } from '../../../Dashboard/logic/metarTokens';
import { groupThousands, twoDigits } from '../../../Dashboard/logic/dashboardFormat';
import { CategoryColours, FlightCategory, ceilingFt } from './logic/flightCategory';
import { ReportElements } from './logic/reportElements';
import { formatAge, formatLocal, reportAgeMinutes, reportTimeMs } from './logic/stationTime';
import { TafBands, tafBands } from './logic/tafBands';
import { TafHour, tafHours, tafLines } from './logic/tafHourly';
import { formatDirection, formatVisibility } from './logic/weatherFormat';

const W = 'NavigationAndCharts.Weather';
const MS_PER_HOUR = 3_600_000;
const ISSUE_TIME_GROUP = /(?:^|\s)(\d{6}Z)(?:\s|$)/;

const AXIS_LEFT = 110;
const AXIS_RIGHT_MARGIN = 12;
const HOURS_Y = 22;
const BASE_Y = 36;
const BAND_HEIGHT = 28;
const LANE_HEIGHT = 50;
/** The visibility and ceiling tracks share what the panel has left, never less than this */
const MIN_TRACK_HEIGHT = 70;
const WIND_HEIGHT = 36;
const GAP = 14;
/** Room under the wind track for the local times */
const LOCAL_TIMES_HEIGHT = 22;
/** Full scale of the visibility and ceiling tracks: above it nothing changes for the flight category */
const VISIBILITY_SCALE_M = 8000;
const CEILING_SCALE_FT = 3000;
/** Average width of a 12 px label character, to cut a text to the bar it describes */
const CHAR_WIDTH_PX = 6.5;
const BECOMING_STEPS = 6;

/** "24 18Z": the day of the month and the hour, as TAF periods are written */
const dayHour = (ms: number): string => {
  const date = new Date(ms);
  return `${twoDigits(date.getUTCDate())} ${twoDigits(date.getUTCHours())}Z`;
};

const windText = (wind: MetarWind | null): string => {
  if (!wind) {
    return '—';
  }
  if (wind.speedKt === 0) {
    return t(`${W}.Tile.Calm`);
  }
  const direction = wind.dirDeg === null ? 'VRB' : `${formatDirection(wind.dirDeg)}°`;
  return `${direction} / ${wind.speedKt}${wind.gustKt !== null ? `G${wind.gustKt}` : ''} kt`;
};

/** What a group states, short: "0.5 km · SHRA FG · BKN 300 ft" */
const conditionsText = (elements: ReportElements, metric: boolean): string => {
  const parts: string[] = [];
  if (elements.visibility) {
    const shown = formatVisibility(elements.visibility, metric);
    parts.push(`${shown.value} ${shown.unit}`);
  }
  if (elements.weather) {
    parts.push(elements.weather.length > 0 ? elements.weather.join(' ') : 'NSW');
  }
  if (elements.clouds) {
    const ceiling = ceilingFt(elements.clouds);
    const ceilingLayer = elements.clouds.find((layer) => layer.baseFt === ceiling);
    if (ceilingLayer) {
      parts.push(`${ceilingLayer.cover} ${groupThousands(ceilingLayer.baseFt)} ft`);
    } else if (elements.clouds.length === 0) {
      parts.push('NSC');
    }
  }
  if (elements.wind) {
    parts.push(windText(elements.wind));
  }
  return parts.join(' · ');
};

const fitted = (text: string, widthPx: number): string => {
  const maxChars = Math.floor(widthPx / CHAR_WIDTH_PX);
  if (text.length <= maxChars) {
    return text;
  }
  return maxChars > 1 ? `${text.slice(0, maxChars - 1)}…` : '';
};

const categoryFill = (category: FlightCategory | null): string =>
  category ? CategoryColours[category] : SvgColour.tile;

interface TimelineProps {
  bands: TafBands;
  hours: TafHour[];
  width: number;
  height: number;
  nowMs: number;
  localOffsetSeconds: number | null;
  metric: boolean;
}

/**
 * The TAF on a time axis: the main forecast as a category band, the TEMPO and PROB groups on rows under it, then the
 * worst visibility and ceiling of each hour and the wind with its BECMG changes
 */
const TafTimeline: FC<TimelineProps> = ({ bands, hours, width, height, nowMs, localOffsetSeconds, metric }) => {
  const right = width - AXIS_RIGHT_MARGIN;
  const xOf = (ms: number) => AXIS_LEFT + ((ms - bands.startMs) / (bands.endMs - bands.startMs)) * (right - AXIS_LEFT);
  const lanes = bands.temporary.reduce((count, bar) => Math.max(count, bar.lane + 1), 0);
  const lanesY = BASE_Y + BAND_HEIGHT + GAP;
  const visibilityY = lanesY + Math.max(lanes, 1) * LANE_HEIGHT;
  const fixedHeight = visibilityY + GAP * 2 + 12 + WIND_HEIGHT + LOCAL_TIMES_HEIGHT;
  const trackHeight = Math.max(MIN_TRACK_HEIGHT, Math.floor((height - fixedHeight) / 2));
  const ceilingY = visibilityY + trackHeight + GAP;
  const windY = ceilingY + trackHeight + GAP + 12;
  const bottom = windY + WIND_HEIGHT;
  const svgHeight = bottom + LOCAL_TIMES_HEIGHT;
  const hourCount = Math.round((bands.endMs - bands.startMs) / MS_PER_HOUR);
  const labelStepHours = hourCount > 12 ? 3 : 1;

  const rowLabel = (y: number, text: string) => (
    <text
      x={AXIS_LEFT - 10}
      y={y + 4}
      textAnchor="end"
      style={{ fill: SvgColour.muted, fontSize: 11, fontWeight: 800, letterSpacing: 1 }}
    >
      {text.toUpperCase()}
    </text>
  );

  const grid: JSX.Element[] = [];
  for (let hour = 0; hour <= hourCount; hour += labelStepHours) {
    const ms = bands.startMs + hour * MS_PER_HOUR;
    const x = xOf(ms);
    grid.push(
      <g key={ms}>
        <line x1={x} y1={HOURS_Y + 6} x2={x} y2={bottom} style={{ stroke: SvgColour.outline }} />
        <text x={x} y={HOURS_Y} textAnchor="middle" style={{ fill: SvgColour.text, fontSize: 13, fontWeight: 800 }}>
          {`${twoDigits(new Date(ms).getUTCHours())}Z`}
        </text>
        {localOffsetSeconds !== null && (
          <text x={x} y={bottom + 16} textAnchor="middle" style={{ fill: SvgColour.muted, fontSize: 11 }}>
            {`${formatLocal(ms, localOffsetSeconds)} ${t(`${W}.Lt`)}`}
          </text>
        )}
      </g>,
    );
  }

  /** A step line of one value per hour, 0 at the bottom of the track and the full scale at its top */
  const track = (top: number, valueOf: (hour: TafHour) => number | null, scale: number, colour: string) => {
    let path = '';
    hours.forEach((hour) => {
      const value = valueOf(hour);
      if (value === null) {
        return;
      }
      const y = top + trackHeight - (Math.min(value, scale) / scale) * trackHeight;
      const x1 = xOf(hour.startMs);
      const x2 = xOf(Math.min(hour.startMs + MS_PER_HOUR, bands.endMs));
      path += `${path ? 'L' : 'M'}${x1},${y}L${x2},${y}`;
    });
    return (
      <g>
        <rect
          x={AXIS_LEFT}
          y={top}
          width={right - AXIS_LEFT}
          height={trackHeight}
          style={{ fill: SvgColour.ground, stroke: SvgColour.outline }}
        />
        {path && <path d={path} style={{ fill: 'none', stroke: colour, strokeWidth: 3 }} />}
      </g>
    );
  };
  const visibilityScale = formatVisibility({ metres: VISIBILITY_SCALE_M, orMore: false }, metric);

  return (
    <svg width={width} height={svgHeight}>
      {grid}

      {rowLabel(BASE_Y + BAND_HEIGHT / 2, t(`${W}.Timeline.Forecast`))}
      {bands.base.map((span) => {
        const x = xOf(span.startMs);
        const spanWidth = xOf(span.endMs) - x;
        const text = [span.category ?? '', conditionsText({ ...span.elements, wind: undefined }, metric)]
          .filter(Boolean)
          .join(' · ');
        return (
          <g key={span.startMs}>
            <rect
              x={x}
              y={BASE_Y}
              width={spanWidth}
              height={BAND_HEIGHT}
              style={{ fill: categoryFill(span.category) }}
            />
            <text x={x + 8} y={BASE_Y + 19} style={{ fill: '#ffffff', fontSize: 13, fontWeight: 800 }}>
              {fitted(text, spanWidth - 12)}
            </text>
          </g>
        );
      })}

      {rowLabel(lanesY + BAND_HEIGHT / 2, t(`${W}.Timeline.Temporary`))}
      {bands.temporary.map((bar) => {
        const x = xOf(bar.startMs);
        const barWidth = xOf(bar.endMs) - x;
        const y = lanesY + bar.lane * LANE_HEIGHT;
        const fill = categoryFill(bar.category);
        return (
          <g key={`${bar.label}${bar.startMs}`}>
            <rect x={x} y={y} width={barWidth} height={BAND_HEIGHT} style={{ fill, opacity: 0.55 }} />
            <rect x={x} y={y} width={barWidth} height={4} style={{ fill }} />
            <text x={x + 6} y={y + 20} style={{ fill: '#ffffff', fontSize: 12, fontWeight: 800 }}>
              {fitted(`${bar.label} · ${bar.category ?? ''}`, barWidth - 10)}
            </text>
            <text x={x + 6} y={y + BAND_HEIGHT + 14} style={{ fill: SvgColour.muted, fontSize: 11 }}>
              {fitted(conditionsText(bar.elements, metric), barWidth - 8)}
            </text>
          </g>
        );
      })}

      {rowLabel(visibilityY + trackHeight / 2, t(`${W}.Row.Visibility`))}
      {track(
        visibilityY,
        (hour) => (hour.visibility ? hour.visibility.min.metres : null),
        VISIBILITY_SCALE_M,
        SvgColour.primary,
      )}
      <text x={right - 4} y={visibilityY + 14} textAnchor="end" style={{ fill: SvgColour.muted, fontSize: 11 }}>
        {t(`${W}.Timeline.Scale`, [{ scale: `${visibilityScale.value} ${visibilityScale.unit}` }])}
      </text>

      {rowLabel(ceilingY + trackHeight / 2, t(`${W}.Row.Ceiling`))}
      {track(
        ceilingY,
        (hour) => {
          if (!hour.ceilingFt) {
            return null;
          }
          return hour.ceilingFt.min === null ? CEILING_SCALE_FT : hour.ceilingFt.min;
        },
        CEILING_SCALE_FT,
        SvgColour.text,
      )}
      <text x={right - 4} y={ceilingY + 14} textAnchor="end" style={{ fill: SvgColour.muted, fontSize: 11 }}>
        {t(`${W}.Timeline.Scale`, [{ scale: `${groupThousands(CEILING_SCALE_FT)} ft` }])}
      </text>

      {rowLabel(windY + WIND_HEIGHT / 2, t(`${W}.Row.Wind`))}
      <rect
        x={AXIS_LEFT}
        y={windY}
        width={right - AXIS_LEFT}
        height={WIND_HEIGHT}
        style={{ fill: SvgColour.ground, stroke: SvgColour.outline }}
      />
      {bands.becoming.map((change) => {
        const x = xOf(change.startMs);
        const stepWidth = (xOf(change.endMs) - x) / BECOMING_STEPS;
        const steps: JSX.Element[] = [];
        for (let step = 0; step < BECOMING_STEPS; step++) {
          steps.push(
            <rect
              key={step}
              x={x + step * stepWidth}
              y={windY}
              width={stepWidth}
              height={WIND_HEIGHT}
              style={{ fill: SvgColour.primary, opacity: ((step + 1) / BECOMING_STEPS) * 0.45 }}
            />,
          );
        }
        return (
          <g key={change.startMs}>
            {steps}
            <text x={x + 4} y={windY - 6} style={{ fill: SvgColour.primary, fontSize: 11, fontWeight: 800 }}>
              {`BECMG ${twoDigits(new Date(change.startMs).getUTCHours())}–${twoDigits(new Date(change.endMs).getUTCHours())}Z`}
            </text>
          </g>
        );
      })}
      {bands.wind.map((span) => {
        // A wind that a BECMG brings is written once its change is complete
        const x = xOf(span.startMs);
        return (
          <text
            key={span.startMs}
            x={x + 8}
            y={windY + 23}
            style={{ fill: SvgColour.text, fontSize: 14, fontWeight: 800 }}
          >
            {fitted(windText(span.wind), xOf(span.endMs) - x - 12)}
          </text>
        );
      })}

      {nowMs >= bands.startMs && nowMs < bands.endMs && (
        <line
          x1={xOf(nowMs)}
          y1={HOURS_Y + 6}
          x2={xOf(nowMs)}
          y2={bottom}
          style={{ stroke: SvgColour.primary, strokeWidth: 2, strokeDasharray: '4 3' }}
        />
      )}
    </svg>
  );
};

interface TafViewProps {
  icao: string;
  taf: string;
  /** The TAF of the OFP, as it was when the OFP was made: the weather server had none */
  fromOfp: boolean;
  localOffsetSeconds: number | null;
  nowMs: number;
  metric: boolean;
}

/** The TAF as a timeline over its validity, with the raw TAF under it */
export const TafView: FC<TafViewProps> = ({ icao, taf, fromOfp, localOffsetSeconds, nowMs, metric }) => {
  const [boxRef, { width, height }] = useBoxSize();
  const bands = tafBands(taf, nowMs);
  const hours = tafHours(taf, nowMs);
  const issuedMs = reportTimeMs(taf, nowMs);

  const issueGroup = ISSUE_TIME_GROUP.exec(taf.toUpperCase());
  const title = issueGroup ? t(`${W}.TafHeader`, [{ icao }, { time: issueGroup[1] }]) : icao;
  const validText =
    bands && issuedMs !== null
      ? t(`${W}.TafValid`, [
          { from: dayHour(bands.startMs) },
          { to: dayHour(bands.endMs) },
          { age: formatAge(reportAgeMinutes(issuedMs, nowMs)) },
        ])
      : '';

  return (
    <DashboardCard
      title={title}
      section="destination"
      className="min-h-0 flex-1"
      trailing={
        <>
          {fromOfp && <HeaderChip tone="busy">{t(`${W}.FromOfp`)}</HeaderChip>}
          {validText && <StationNote>{validText}</StationNote>}
        </>
      }
    >
      <div ref={boxRef} className="min-h-0 w-full flex-1 overflow-hidden">
        {bands && width > 0 && height > 0 && (
          <TafTimeline
            bands={bands}
            hours={hours}
            width={width}
            height={height}
            nowMs={nowMs}
            localOffsetSeconds={localOffsetSeconds}
            metric={metric}
          />
        )}
      </div>
      <FieldLabel className="mt-3 shrink-0">{t(`${W}.Panel.Taf`)}</FieldLabel>
      <div className="mt-1 flex shrink-0 flex-col rounded-sm bg-m3-ground px-3 py-2">
        {tafLines(taf).map((line, index) => (
          <span key={index} className="font-mono text-sm leading-snug text-m3-text">
            {line}
          </span>
        ))}
      </div>
    </DashboardCard>
  );
};
