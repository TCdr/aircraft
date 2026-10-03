// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useState } from 'react';
import { MathUtils, MetarParserType, parseMetar, usePersistentSetting } from '@flybywiresim/fbw-sdk-react';
import { Check2 } from 'react-bootstrap-icons';
import { t } from '../../Localization/translation';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { M3ActionChip } from '../../UtilComponents/Material/Material';
import { useAppSelector } from '../../Store/store';
import { fetchRawMetarBySource } from '../../Service/WeatherService';
import { getAirportMagVar, getRunways, Runway } from '../Data/Runways';
import { isValidIcao } from '../Data/Utils';
import { LandingWindLimits, RankedRunway, rankRunwaysByWind } from '../Data/landingWind';
import { PERF_INPUT } from './PerformanceKit';
import { CONFIG_WEATHER_SOURCE_LABELS } from '../../Settings/Pages/AtsuAocPage';

/** The alternate airport of the wind check: its runways and its METAR (wind direction magnetic, as the calculator) */
export interface LandingAlternate {
  icao: string;
  runways: Runway[];
  metar: MetarParserType;
  magvar: number | null;
}

interface LandingWindCheckProps {
  /** The destination of the calculator, its runways and the runway selected in it (-1: entered by hand) */
  icao: string;
  runways: Runway[];
  selectedRunwayIndex: number;
  /** The wind of the calculator, magnetic (undefined direction: a headwind or tailwind entered without one) */
  windDirection: number | undefined;
  windSpeed: number | undefined;
  windEntry: string;
  /** The crosswind maximum of the runway condition at an OAT, and the tailwind limit */
  crosswindLimit: (oat: number) => number;
  oat: number | undefined;
  maxTailwind: number;
  conditionLabel: string;
  formatDistance: (metres: number) => string;
  distanceUnit: string;
  onUseRunway: (index: number) => void;
  onCalculateAlternate: (alternate: LandingAlternate, runwayIndex: number) => void;
}

/** The destination rows shown: the best ones, the selected runway always among them */
const DESTINATION_ROWS = 4;

type AlternateState =
  | { state: 'idle' }
  | { state: 'loading'; icao: string }
  | { state: 'error'; icao: string; message: string }
  | { state: 'loaded'; alternate: LandingAlternate; raw: string };

const COLUMNS = 'flex flex-row items-center px-3';
const cell = (width: string) => `${width} shrink-0 text-sm`;

/**
 * The wind check of the landing page (a design choice, not an Airbus function): when the wind is above the crosswind
 * maximum or the tailwind limit (FCOM LIM, gusts included), the runways of the destination ranked by wind and the best
 * runway of the alternate airport of the OFP with its METAR, each with a button that loads it into the calculator.
 * Advice only: the flight crew decides.
 */
export const LandingWindCheck = ({
  icao,
  runways,
  selectedRunwayIndex,
  windDirection,
  windSpeed,
  windEntry,
  crosswindLimit,
  oat,
  maxTailwind,
  conditionLabel,
  formatDistance,
  distanceUnit,
  onUseRunway,
  onCalculateAlternate,
}: LandingWindCheckProps) => {
  const ofpAlternate = useAppSelector((state) => state.simbrief.data.altIcao);
  const [metarSource] = usePersistentSetting('CONFIG_METAR_SRC');
  const [alternateIcao, setAlternateIcao] = useState<string>(ofpAlternate ?? '');
  const [alternate, setAlternate] = useState<AlternateState>({ state: 'idle' });

  // The alternate's runways and METAR, fetched when its ICAO code is complete
  useEffect(() => {
    if (!isValidIcao(alternateIcao)) {
      setAlternate({ state: 'idle' });
      return undefined;
    }
    const code = alternateIcao.toUpperCase();
    let current = true;
    setAlternate({ state: 'loading', icao: code });
    const load = async () => {
      let altRunways: Runway[];
      let magvar: number | null;
      try {
        altRunways = await getRunways(code);
        magvar = await getAirportMagVar(code);
      } catch {
        return { state: 'error', icao: code, message: t('Performance.Landing.Calc.WindCheck.NoAirport') } as const;
      }
      try {
        const raw = await fetchRawMetarBySource(code);
        const metar = parseMetar(raw);
        return { state: 'loaded', alternate: { icao: code, runways: altRunways, metar, magvar }, raw } as const;
      } catch {
        return { state: 'error', icao: code, message: t('Performance.Landing.Calc.WindCheck.NoMetar') } as const;
      }
    };
    load().then((loaded) => {
      if (current) {
        setAlternate(loaded);
      }
    });
    return () => {
      current = false;
    };
  }, [alternateIcao]);

  const limitsAt = (temperature: number | undefined): LandingWindLimits => ({
    crosswind: crosswindLimit(temperature ?? 15),
    tailwind: maxTailwind,
  });
  const replace = (msg: string, values: Record<string, string>) =>
    msg.replace(/\{([a-z_]+)\}/g, (m, key: string) => values[key] ?? m);

  /** "Crosswind 45 > 40", "Tailwind 27 > 10" or "Within limits" */
  const status = (r: RankedRunway<Runway>, limits: LandingWindLimits) => {
    if (r.within) {
      return (
        <span className="inline-flex h-7 items-center rounded-lg bg-m3-primary-container px-2 text-sm font-bold text-m3-on-primary-container">
          <Check2 size={16} className="mr-1" />
          <span className="text-sm font-bold text-current">{t('Performance.Landing.Calc.WindCheck.Within')}</span>
        </span>
      );
    }
    const parts: string[] = [];
    if (r.crosswindExceeded) {
      parts.push(
        replace(t('Performance.Landing.Calc.WindCheck.CrosswindAbove'), {
          actual: Math.round(r.gustWind.crosswind).toFixed(0),
          limit: limits.crosswind.toFixed(0),
        }),
      );
    }
    if (r.tailwindExceeded) {
      parts.push(
        replace(t('Performance.Landing.Calc.WindCheck.TailwindAbove'), {
          actual: Math.round(-r.gustWind.headwind).toFixed(0),
          limit: limits.tailwind.toFixed(0),
        }),
      );
    }
    return (
      <span className="inline-flex h-7 items-center whitespace-nowrap rounded-lg bg-m3-error-container px-2 text-sm font-bold text-m3-on-error">
        {parts.join(' · ')}
      </span>
    );
  };

  const runwayRow = (
    r: RankedRunway<Runway>,
    limits: LandingWindLimits,
    trailing: React.ReactNode,
    selected = false,
  ) => {
    const headwind = Math.round(r.wind.headwind);
    const gustCross = Math.round(r.gustWind.crosswind);
    return (
      <div key={r.runway.ident} className={`${COLUMNS} h-10 rounded-lg ${selected ? 'bg-m3-tile' : 'bg-m3-card'}`}>
        <span className={`${cell('w-16')} font-bold text-m3-text`}>{r.runway.ident}</span>
        <span className={`${cell('w-24')} text-m3-text`}>{`${formatDistance(r.runway.length)} ${distanceUnit}`}</span>
        <span className={`${cell('w-20')} text-m3-text`}>{`${headwind >= 0 ? 'H' : 'T'} ${Math.abs(headwind)}`}</span>
        <span className={`${cell('w-28')} text-m3-text`}>
          {`${r.wind.side} ${Math.round(r.wind.crosswind)}${gustCross > Math.round(r.wind.crosswind) ? ` (G ${gustCross})` : ''}`}
        </span>
        <span className="min-w-0 flex-1">{status(r, limits)}</span>
        {trailing}
      </div>
    );
  };

  const header = (
    <div className={`${COLUMNS} h-5 text-xs font-bold uppercase tracking-widest text-m3-muted`}>
      <span className={`${cell('w-16')} text-xs text-m3-muted`}>{t('Performance.Landing.Calc.WindCheck.Rwy')}</span>
      <span className={`${cell('w-24')} text-xs text-m3-muted`}>{t('Performance.Landing.Calc.WindCheck.Lda')}</span>
      <span className={`${cell('w-20')} text-xs text-m3-muted`}>
        {t('Performance.Landing.Calc.WindCheck.HeadTail')}
      </span>
      <span className={`${cell('w-28')} text-xs text-m3-muted`}>{t('Performance.Landing.Calc.WindCheck.Cross')}</span>
      <span className="text-xs text-m3-muted">{t('Performance.Landing.Calc.WindCheck.Limits')}</span>
    </div>
  );

  // ------------------------------------------------------------------------------------------- destination
  const destinationLimits = limitsAt(oat);
  let destination: React.ReactNode;
  if (runways.length === 0) {
    destination = <span className="text-sm text-m3-muted">{t('Performance.Landing.Calc.WindCheck.NoRunways')}</span>;
  } else if (windSpeed === undefined || windDirection === undefined) {
    destination = <span className="text-sm text-m3-muted">{t('Performance.Landing.Calc.WindCheck.NoDirection')}</span>;
  } else {
    const ranked = rankRunwaysByWind(runways, windDirection, windSpeed, windSpeed, destinationLimits);
    let shown = ranked.slice(0, DESTINATION_ROWS);
    const selected = ranked.find((r) => r.index === selectedRunwayIndex);
    if (selected !== undefined && !shown.includes(selected)) {
      shown = [...shown.slice(0, DESTINATION_ROWS - 1), selected];
    }
    destination = (
      <div className="flex flex-col space-y-1">
        {header}
        {shown.map((r) =>
          runwayRow(
            r,
            destinationLimits,
            r.index === selectedRunwayIndex ? (
              <span className="text-xs font-bold uppercase text-m3-muted">
                {t('Performance.Landing.Calc.WindCheck.Selected')}
              </span>
            ) : (
              r.within && (
                <M3ActionChip primary className="!h-8 !px-3 !text-sm" onClick={() => onUseRunway(r.index)}>
                  {t('Performance.Landing.Calc.WindCheck.Use')}
                </M3ActionChip>
              )
            ),
            r.index === selectedRunwayIndex,
          ),
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------------------------------- alternate
  let alternateBody: React.ReactNode = null;
  if (alternate.state === 'idle') {
    alternateBody = (
      <span className="text-sm text-m3-muted">{t('Performance.Landing.Calc.WindCheck.EnterAlternate')}</span>
    );
  } else if (alternate.state === 'loading') {
    alternateBody = <span className="text-sm text-m3-muted">{t('Performance.Landing.Calc.WindCheck.Loading')}</span>;
  } else if (alternate.state === 'error') {
    alternateBody = (
      <span className="text-sm text-m3-on-warn">{replace(alternate.message, { icao: alternate.icao })}</span>
    );
  } else {
    const { metar, magvar, runways: altRunways } = alternate.alternate;
    const variable = /\bVRB\d/.test(alternate.raw);
    const direction = variable ? 'VRB' : Math.round(MathUtils.normalise360(metar.wind.degrees - (magvar ?? 0)));
    const limits = limitsAt(metar.temperature.celsius);
    const best = rankRunwaysByWind(altRunways, direction, metar.wind.speed_kts, metar.wind.gust_kts, limits)[0];
    alternateBody = (
      <>
        <span className="rounded-lg bg-m3-ground px-3 py-1 font-mono text-sm text-m3-text">{alternate.raw}</span>
        {best !== undefined ? (
          runwayRow(
            best,
            limits,
            <M3ActionChip
              primary
              className="!h-8 !px-3 !text-sm"
              onClick={() => onCalculateAlternate(alternate.alternate, best.index)}
            >
              {replace(t('Performance.Landing.Calc.WindCheck.CalculateFor'), {
                icao: alternate.alternate.icao,
                runway: best.runway.ident,
              })}
            </M3ActionChip>,
          )
        ) : (
          <span className="text-sm text-m3-muted">{t('Performance.Landing.Calc.WindCheck.NoRunways')}</span>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-2 overflow-hidden">
      <div className="flex flex-row items-baseline">
        <span className="mr-3 text-base font-bold text-m3-text">
          {replace(t('Performance.Landing.Calc.WindCheck.Runways'), { icao: icao.toUpperCase() || '----' })}
        </span>
        <span className="text-sm text-m3-muted">
          {replace(t('Performance.Landing.Calc.WindCheck.RunwaysNote'), {
            wind: windEntry || '---',
            condition: conditionLabel,
          })}
        </span>
      </div>
      {destination}

      <div className="h-px shrink-0 bg-m3-outline" />

      <div className="flex flex-row items-center">
        <span className="mr-3 text-base font-bold text-m3-text">
          {t('Performance.Landing.Calc.WindCheck.Alternate')}
        </span>
        <SimpleInput
          className={`mr-3 w-24 text-center uppercase ${PERF_INPUT}`}
          fontSizeClassName="text-base"
          value={alternateIcao}
          placeholder="ICAO"
          onChange={(value) => setAlternateIcao(value)}
          maxLength={4}
          uppercase
        />
        <span className="text-sm text-m3-muted">
          {`${
            ofpAlternate && alternateIcao.toUpperCase() === ofpAlternate.toUpperCase()
              ? `${t('Performance.Landing.Calc.WindCheck.FromOfp')} · `
              : ''
          }METAR ${CONFIG_WEATHER_SOURCE_LABELS[metarSource] ?? metarSource}`}
        </span>
      </div>
      {alternateBody}

      <div className="grow" />
      <span className="shrink-0 text-xs leading-tight text-m3-muted">
        {replace(t('Performance.Landing.Calc.WindCheck.Advice'), { condition: conditionLabel })}
      </span>
    </div>
  );
};
