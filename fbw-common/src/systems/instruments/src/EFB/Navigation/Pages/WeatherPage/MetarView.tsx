// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useState } from 'react';
import { t } from '../../../Localization/translation';
import { ScrollableContainer } from '../../../UtilComponents/ScrollableContainer';
import { DashboardCard, FieldLabel, HeaderChip } from '../../../Dashboard/Cards/CardParts';
import { MetarText } from '../../../Dashboard/Cards/WeatherCard';
import { crosswindSide } from '../../../Dashboard/logic/crosswind';
import { groupThousands } from '../../../Dashboard/logic/dashboardFormat';
import { runwayWind } from '../../../Dashboard/logic/weatherVerdict';
import { AirportInfo } from './useAirportInfo';
import { RunwayWindDiagram, SkyColumn } from './WeatherGraphics';
import {
  CategoryColours,
  FlightCategory,
  ceilingCategory,
  ceilingFt,
  flightCategory,
  visibilityCategory,
} from './logic/flightCategory';
import { relativeHumidityPercent } from './logic/humidity';
import { capitalise, decodeMetar, weatherPhrase, weatherPhrases } from './logic/metarDecode';
import { CloudLayer, parseMetarReport } from './logic/reportElements';
import { componentScaleKt, favouredRunwayEnd, fieldElevationFt } from './logic/runwayDiagram';
import { formatAge, formatLocal, formatZulu, nextSunsetMs, reportAgeMinutes, reportTimeMs } from './logic/stationTime';
import { formatDirection, formatPressure, formatVisibility } from './logic/weatherFormat';

const W = 'NavigationAndCharts.Weather';
/** A METAR is issued every 30 or 60 minutes: an older one is out of date */
const FRESH_MINUTES = 60;
const COVER_ORDER = ['FEW', 'SCT', 'BKN', 'OVC', 'VV'];
/** Rem height of the report's scroll area: what is left of its panel in the 54 rem page */
const REPORT_SCROLL_REM = 44;

/** A note on the station's coloured header bar, in the bar's title colour (set by the theme's section rule) */
export const StationNote: FC = ({ children }) => (
  <span className="dashboard-header-title whitespace-nowrap text-xs font-bold uppercase tracking-wider">
    {children}
  </span>
);

interface ConditionProps {
  label: string;
  value: string;
  detail: string;
  /** Only a value that lowers the flight category is coloured */
  category?: FlightCategory | null;
  /** Fields of the top row have no rule above, fields of the left column none on their left */
  top?: boolean;
  left?: boolean;
}

const Condition: FC<ConditionProps> = ({ label, value, detail, category, top, left }) => (
  <div
    className={`flex w-1/3 min-w-0 flex-col py-2 ${left ? 'pr-3' : 'border-l border-m3-outline px-3'} ${
      top ? '' : 'border-t border-m3-outline'
    }`}
  >
    <FieldLabel>{label}</FieldLabel>
    <span
      className={`truncate text-2xl font-extrabold leading-snug ${category && category !== 'VFR' ? '' : 'text-m3-text'}`}
      style={category && category !== 'VFR' ? { color: CategoryColours[category] } : undefined}
    >
      {value}
    </span>
    <span className="truncate text-xs font-semibold text-m3-muted">{detail}</span>
  </div>
);

/** The sky in words beside the category: the weather when there is some, else the thickest cloud cover */
const skyText = (weather: string[] | undefined, clouds: CloudLayer[] | undefined): string => {
  // The main weather group only: the visibility field gives them all
  if (weather && weather.length > 0) {
    return capitalise(weatherPhrase(weather[0], t));
  }
  if (!clouds) {
    return '';
  }
  if (clouds.length === 0) {
    return t(`${W}.Tile.NoCloud`);
  }
  const thickest = clouds.reduce((worst, layer) =>
    COVER_ORDER.indexOf(layer.cover) > COVER_ORDER.indexOf(worst.cover) ? layer : worst,
  );
  return t(`${W}.Tile.Cover.${thickest.cover}`);
};

const cloudGroupsText = (clouds: CloudLayer[] | undefined): string => {
  if (!clouds) {
    return '';
  }
  if (clouds.length === 0) {
    return t(`${W}.Tile.NoCloud`);
  }
  return clouds.map((layer) => `${layer.cover} ${groupThousands(layer.baseFt)}`).join(' · ');
};

interface MetarViewProps {
  icao: string;
  name: string;
  metar: string;
  airport: AirportInfo | null;
  /** Local minus UTC of the airport; null when the aircraft is not at it */
  localOffsetSeconds: number | null;
  nowMs: number;
  metric: boolean;
}

export const MetarView: FC<MetarViewProps> = ({ icao, name, metar, airport, localOffsetSeconds, nowMs, metric }) => {
  const [chosenRunway, setChosenRunway] = useState<string | null>(null);
  useEffect(() => setChosenRunway(null), [icao]);

  const report = parseMetarReport(metar);
  const ceiling = report.clouds ? ceilingFt(report.clouds) : undefined;
  const category: FlightCategory | null = flightCategory(ceiling, report.visibility?.metres);
  const observedMs = reportTimeMs(metar, nowMs);
  const local = (ms: number) => (localOffsetSeconds !== null ? formatLocal(ms, localOffsetSeconds) : null);
  const observedLocal = observedMs !== null ? local(observedMs) : null;
  const ageMinutes = observedMs !== null ? reportAgeMinutes(observedMs, nowMs) : null;
  let observedText: string | null = null;
  let timeText = '';
  if (observedMs !== null) {
    observedText = observedLocal ? `${observedLocal} ${t(`${W}.Lt`)}` : formatZulu(observedMs);
    timeText = observedLocal ? `${observedText} · ${formatZulu(observedMs)}` : observedText;
  }
  const decoded = decodeMetar(
    {
      report,
      observedText,
      ceilingFt: ceiling ?? null,
      category,
      metric,
    },
    t,
  );

  const { wind } = report;
  const visibility = report.visibility ? formatVisibility(report.visibility, metric) : null;
  const qnh = report.qnh ? formatPressure(report.qnh, metric) : null;
  const qnhOther = report.qnh ? formatPressure(report.qnh, !metric) : null;
  const sunsetMs = airport ? nextSunsetMs(airport.lat, airport.lon, nowMs) : null;
  const sunsetLocal = sunsetMs !== null ? local(sunsetMs) : null;
  const runways = airport ? airport.runways : [];
  const elevation = fieldElevationFt(runways);

  let windValue = '—';
  let windDetail = '';
  if (wind) {
    const direction = wind.dirDeg === null ? 'VRB' : `${formatDirection(wind.dirDeg)}°`;
    windValue = wind.speedKt === 0 ? t(`${W}.Tile.Calm`) : `${direction} ${wind.speedKt} kt`;
    windDetail =
      wind.gustKt !== null ? t(`${W}.Field.Gusts`, [{ gust: String(wind.gustKt) }]) : t(`${W}.Field.NoGusts`);
  }

  const windDirDeg = wind && wind.speedKt > 0 ? wind.dirDeg : null;
  const runway = runways.find((end) => end.ident === chosenRunway) ?? favouredRunwayEnd(runways, windDirDeg);
  const along = runway ? runwayWind(metar, runway.bearing) : null;
  const side = runway && wind ? crosswindSide(wind.dirDeg, runway.bearing) : null;
  let crossLabel = t(`${W}.Diagram.Cross`);
  if (side) {
    crossLabel = t(side === 'left' ? `${W}.Diagram.CrossLeft` : `${W}.Diagram.CrossRight`);
  }
  const scaleKt = wind ? componentScaleKt(wind.speedKt, wind.gustKt) : componentScaleKt(0, null);

  const stationTitle = name ? `${icao} · ${name}` : icao;

  return (
    <div className="flex min-h-0 flex-1 flex-row">
      <div className="flex w-[640px] shrink-0 flex-col">
        <DashboardCard
          title={stationTitle}
          section="destination"
          className="shrink-0"
          trailing={
            <>
              {timeText && <StationNote>{timeText}</StationNote>}
              {ageMinutes !== null && (
                <HeaderChip tone={ageMinutes <= FRESH_MINUTES ? 'active' : 'busy'}>{formatAge(ageMinutes)}</HeaderChip>
              )}
            </>
          }
        >
          <div className="mb-1 flex shrink-0 flex-row items-center">
            <div
              className={`flex h-9 flex-row items-center rounded-sm px-4 ${category ? '' : 'bg-m3-tile'}`}
              style={category ? { backgroundColor: CategoryColours[category] } : undefined}
            >
              <span className={`text-lg font-extrabold ${category ? 'text-white' : 'text-m3-text'}`}>
                {category ?? '—'}
              </span>
            </div>
            <span className="ml-3 truncate text-base font-semibold text-m3-muted">
              {skyText(report.weather, report.clouds)}
            </span>
          </div>
          <div className="flex shrink-0 flex-row">
            <Condition top left label={t(`${W}.Field.Wind`)} value={windValue} detail={windDetail} />
            <Condition
              top
              label={t(`${W}.Tile.Visibility`)}
              value={visibility ? `${report.visibility?.orMore ? '≥' : ''}${visibility.value} ${visibility.unit}` : '—'}
              detail={
                report.weather && report.weather.length > 0
                  ? capitalise(weatherPhrases(report.weather, t))
                  : t(`${W}.Tile.NoWeather`)
              }
              category={report.visibility ? visibilityCategory(report.visibility.metres) : null}
            />
            <Condition
              top
              label={t(`${W}.Tile.Ceiling`)}
              value={typeof ceiling === 'number' ? `${groupThousands(ceiling)} ft` : t(`${W}.NoCeilingShort`)}
              detail={cloudGroupsText(report.clouds)}
              category={typeof ceiling === 'number' ? ceilingCategory(ceiling) : null}
            />
          </div>
          <div className="flex shrink-0 flex-row">
            <Condition
              left
              label={t(`${W}.Field.TempDew`)}
              value={
                report.temperatureC !== undefined
                  ? `${report.temperatureC}${report.dewPointC !== undefined ? ` / ${report.dewPointC}` : ''} °C`
                  : '—'
              }
              detail={
                report.temperatureC !== undefined && report.dewPointC !== undefined
                  ? t(`${W}.Field.Humidity`, [
                      { humidity: String(relativeHumidityPercent(report.temperatureC, report.dewPointC)) },
                    ])
                  : ''
              }
            />
            <Condition
              label="QNH"
              value={qnh ? `${qnh.value} ${qnh.unit}` : '—'}
              detail={qnhOther ? `${qnhOther.value} ${qnhOther.unit}` : ''}
            />
            <Condition
              label={t(`${W}.Field.Sunset`)}
              value={sunsetMs !== null ? sunsetLocal ?? formatZulu(sunsetMs) : '—'}
              detail={sunsetLocal ? t(`${W}.Field.LocalTime`) : t(`${W}.Field.Utc`)}
            />
          </div>
        </DashboardCard>

        <DashboardCard
          title={t(`${W}.Panel.RunwayWind`)}
          className="mt-2 flex-1"
          trailing={runways.map((end) => (
            <button
              key={end.ident}
              type="button"
              onClick={() => setChosenRunway(end.ident)}
              className={`flex h-6 flex-row items-center rounded-sm border px-2 ${
                runway && end.ident === runway.ident ? 'border-m3-primary' : 'border-m3-outline'
              }`}
            >
              <span
                className={`text-xs font-extrabold ${
                  runway && end.ident === runway.ident ? 'text-m3-primary' : 'text-m3-muted'
                }`}
              >
                {end.ident}
              </span>
            </button>
          ))}
        >
          {runway && wind ? (
            <RunwayWindDiagram
              runwayIdent={runway.ident}
              runwayBearing={runway.bearing}
              windDirDeg={windDirDeg}
              speedKt={wind.speedKt}
              headwindKt={along ? along.headwindKt : null}
              crosswindKt={along ? along.crosswindKt : 0}
              gustCrosswindKt={along ? along.gustCrosswindKt : null}
              crosswindSideLabel={crossLabel}
              scaleKt={scaleKt}
              windText={windValue}
              labels={{
                headwind: t(`${W}.Diagram.Headwind`),
                tailwind: t(`${W}.Diagram.Tailwind`),
                gustCross: t(`${W}.Diagram.GustCross`),
                scale: t(`${W}.Diagram.Scale`, [{ scale: String(scaleKt) }]),
                noComponent: t(wind.speedKt === 0 ? `${W}.Diagram.Calm` : `${W}.Diagram.NoComponent`),
              }}
            />
          ) : (
            <span className="mt-2 text-sm text-m3-muted">
              {runways.length === 0 ? t(`${W}.Runways.NotAvailable`) : t(`${W}.Diagram.NoWind`)}
            </span>
          )}
        </DashboardCard>
      </div>

      <DashboardCard title={t(`${W}.Panel.Sky`)} className="ml-2 w-[330px] shrink-0" bodyClassName="flex px-2 py-1">
        {report.clouds ? (
          <SkyColumn
            key={metar}
            clouds={report.clouds}
            ceilingFt={ceiling ?? null}
            groundText={
              elevation !== null ? t(`${W}.Sky.FieldElevation`, [{ elevation: groupThousands(elevation) }]) : ''
            }
            ceilingLabel={t(`${W}.Sky.Ceiling`)}
          />
        ) : (
          <span className="mt-2 text-sm text-m3-muted">{t(`${W}.NoClouds`)}</span>
        )}
      </DashboardCard>

      <DashboardCard title={t(`${W}.Panel.Report`)} className="ml-2 min-w-0 flex-1">
        <ScrollableContainer height={REPORT_SCROLL_REM} innerClassName="pr-5">
          <div className="rounded-sm bg-m3-ground px-3 py-2">
            <MetarText metar={metar} />
          </div>
          {decoded.map((line, index) => (
            <p key={index} className="border-b border-m3-outline py-2 text-sm leading-normal text-m3-text">
              {line}
            </p>
          ))}
        </ScrollableContainer>
      </DashboardCard>
    </div>
  );
};
