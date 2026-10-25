// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { parseMetar, usePersistentNumberProperty } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../Localization/translation';
import { useAppDispatch, useAppSelector } from '../../Store/store';
import { setUserDepartureIcao } from '../../Store/features/dashboard';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { M3_INPUT } from '../../UtilComponents/Material/Material';
import { ColoredMetar } from '../Widgets/ColorMetar';
import { StationWx } from '../logic/advice';
import { DashboardLayout } from '../logic/dashboardLayout';
import { DashboardPhase } from '../logic/dashboardPhase';
import { leadWeatherRole } from '../logic/weatherStation';
import { chartsPath } from '../logic/chartsPath';
import { metarWindGroup, runwayWind, stationVerdict, worstVerdictIndex } from '../logic/weatherVerdict';
import { TripWeather } from '../useTripWeather';
import { CardButton, DashboardCard, Field, FieldLabel, FieldRow, HeaderChip, StatusBox } from './CardParts';

interface WeatherCardProps {
  layout: DashboardLayout;
  phase: DashboardPhase;
  weather: TripWeather;
  aircraft: 'a32nx' | 'a380x';
  etaUtc: Date | null;
  className?: string;
}

/** The pathnames the flyPad router has visited, oldest first (its memory history keeps them in `entries`) */
const seenPathnames = (history: ReturnType<typeof useHistory>): string[] =>
  // @ts-ignore entries exists on the memory history the flyPad uses
  ((history.entries ?? []) as { pathname: string }[]).map((entry) => entry.pathname);

const ICAO_LENGTH = 4;

/** The METAR in the colours of the flyPad setting; a report the parser rejects is shown as received */
export const MetarText: FC<{ metar: string }> = ({ metar }) => {
  const [usingColoredMetar] = usePersistentNumberProperty('EFB_USING_COLOREDMETAR', 1);
  let parsed = null;
  if (usingColoredMetar) {
    try {
      parsed = parseMetar(metar);
    } catch (_) {
      parsed = null;
    }
  }
  return (
    // A long report shrinks with the card instead of running under its buttons; the dialog shows it in full
    <div className="min-h-0 shrink-0 overflow-hidden font-mono leading-snug">
      {parsed ? (
        <ColoredMetar metar={parsed} sizeClassName="text-sm" />
      ) : (
        <span className="text-sm text-m3-text">{metar}</span>
      )}
    </div>
  );
};

/** The planned runway and the wind on it, as fields */
const RunwayWindFields: FC<{ station: StationWx; runway: string }> = ({ station, runway }) => {
  const wind = runwayWind(station.metar, station.runwayHeadingDeg);
  return (
    <FieldRow className="mt-2">
      <Field label={t('Dashboard.Weather.RunwayField')} value={runway} />
      {wind && (
        <Field
          label={t(wind.headwindKt >= 0 ? 'Dashboard.Weather.HeadwindField' : 'Dashboard.Weather.TailwindField')}
          value={t('Dashboard.Weather.Knots', [{ wind: String(Math.abs(wind.headwindKt)) }])}
        />
      )}
      {wind && (
        <Field
          label={t('Dashboard.Weather.CrosswindField')}
          value={t('Dashboard.Weather.Knots', [{ wind: String(wind.crosswindKt) }])}
          detail={
            wind.gustCrosswindKt !== null
              ? t('Dashboard.Weather.GustDetail', [{ wind: String(wind.gustCrosswindKt) }])
              : undefined
          }
        />
      )}
    </FieldRow>
  );
};

/** One station: its METAR (and TAF when asked for), or why there is none */
const StationReport: FC<{ station?: StationWx; withTaf?: boolean; note?: string; loading: boolean }> = ({
  station,
  withTaf,
  note,
  loading,
}) => {
  if (!station) {
    return (
      <span className="mt-2 text-sm text-m3-muted">
        {t(loading ? 'Dashboard.ImportantInformation.Weather.Loading' : 'Dashboard.Weather.NoAirport')}
      </span>
    );
  }
  return (
    <>
      <FieldLabel className="mt-2 shrink-0">{t('Dashboard.Weather.Metar')}</FieldLabel>
      {station.metar ? (
        <MetarText metar={station.metar} />
      ) : (
        <span className="text-sm text-m3-muted">{t('Dashboard.ImportantInformation.Weather.IcaoInvalid')}</span>
      )}
      {withTaf && (
        <>
          <FieldLabel className="mt-2 shrink-0">{t('Dashboard.Weather.Taf')}</FieldLabel>
          <p className="min-h-0 overflow-hidden font-mono text-sm leading-snug text-m3-text">
            {station.taf ?? t('Dashboard.Weather.NoTaf')}
          </p>
        </>
      )}
      {note && <span className="mt-2 shrink-0 text-sm text-m3-muted">{note}</span>}
    </>
  );
};

/** The weather of the trip: DEP, DEST and ALTN side by side before departure, the destination after it */
export const WeatherCard: FC<WeatherCardProps> = ({ layout, phase, weather, aircraft, etaUtc, className }) => {
  const history = useHistory();
  const dispatch = useAppDispatch();
  const {
    arrivingRunway,
    arrivingAirport: arrivingIcao,
    arrivingName,
    departingRunway,
    departingAirport: departingIcao,
    departingName,
  } = useAppSelector((state) => state.simbrief.data);
  const userIcao = useAppSelector((state) => state.dashboard.userDepartureIcao) ?? '';
  const [typedIcao, setTypedIcao] = useState(userIcao);
  // Without an OFP the weather is the one of the airport the aircraft is at: the flyPad knows it only from the taxi
  // page, so that airport is the default until the user types another
  const taxiIcao = useAppSelector((state) => state.taxiRoute.icao);
  const withoutOfp = layout === 'gateNoOfp' || layout === 'noOfp';
  useEffect(() => {
    if (withoutOfp && userIcao === '' && taxiIcao.length === ICAO_LENGTH) {
      setTypedIcao(taxiIcao);
      dispatch(setUserDepartureIcao(taxiIcao));
    }
  }, [withoutOfp, taxiIcao]);

  // The weather page opens on the airport this card is about: the departure until takeoff and the destination after it,
  // and in the trip layout the airport with the worst verdict (the destination when all are fine)
  const footer = (stationIcao: string | undefined) => (
    <>
      <CardButton tone="outline" onClick={() => history.push(chartsPath(seenPathnames(history)))}>
        {t('Dashboard.Weather.Charts')}
      </CardButton>
      <CardButton
        tone="outline"
        disabled={!stationIcao}
        onClick={() => history.push('/navigation/weather', { icao: stationIcao })}
      >
        {t('Dashboard.Weather.Reports')}
      </CardButton>
    </>
  );

  if (layout === 'gateOfp') {
    const trip: { role: string; station?: StationWx; arrival: boolean }[] = [
      { role: 'Dashboard.Weather.Dep', station: weather.dep, arrival: false },
      { role: 'Dashboard.Weather.Dest', station: weather.dest, arrival: true },
      { role: 'Dashboard.Weather.Altn', station: weather.altn, arrival: true },
    ].filter((entry) => !!entry.station);
    const verdicts = trip.map((entry) => stationVerdict(entry.station, aircraft, etaUtc, entry.arrival));
    const worst = worstVerdictIndex(verdicts);
    return (
      <DashboardCard
        title={t('Dashboard.Weather.TripTitle')}
        section="destination"
        className={className}
        trailing={
          worst >= 0 ? (
            <HeaderChip tone={verdicts[worst].tone}>
              {t('Dashboard.Weather.Worst', [{ icao: trip[worst].station!.icao }])}
            </HeaderChip>
          ) : undefined
        }
        footer={footer(worst >= 0 ? trip[worst].station?.icao : (weather.dest ?? weather.dep)?.icao)}
      >
        {trip.length === 0 && <StationReport loading={weather.loading} />}
        <div className="flex shrink-0 flex-row">
          {trip.map((entry, index) => (
            <div
              key={entry.role}
              className={`flex min-w-0 flex-1 flex-col rounded-sm bg-m3-tile px-3 py-2 ${index > 0 ? 'ml-3' : ''} ${
                index === worst ? 'border-2 border-m3-on-warn' : 'border-2 border-transparent'
              }`}
            >
              <FieldLabel>{`${entry.station!.icao} · ${t(entry.role)}`}</FieldLabel>
              <span className="mt-1 truncate font-mono text-base font-bold text-m3-text">
                {metarWindGroup(entry.station!.metar) ?? '--'}
              </span>
              <div className="mt-2 flex flex-row">
                <StatusBox tone={verdicts[index].tone}>
                  {t(verdicts[index].key, verdicts[index].replacements)}
                </StatusBox>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>
    );
  }

  if (layout === 'flight' || layout === 'arrived') {
    // Until takeoff the flight's weather is the departure's: its METAR, TAF and wind on the planned runway
    const departing = layout === 'flight' && leadWeatherRole(phase) === 'dep';
    const station = departing ? weather.dep : weather.dest;
    const stationName = departing ? departingName : arrivingName;
    const stationRunway = departing ? departingRunway : arrivingRunway;
    const fallbackIcao = departing ? departingIcao : arrivingIcao;
    return (
      <DashboardCard
        title={t(departing ? 'Dashboard.Weather.DepartureTitle' : 'Dashboard.Weather.DestinationTitle')}
        section="destination"
        className={className}
        footer={footer(station ? station.icao : fallbackIcao || undefined)}
      >
        <div className="flex shrink-0 flex-row items-baseline">
          <span className="shrink-0 text-2xl font-extrabold text-m3-text">{station ? station.icao : fallbackIcao}</span>
          <FieldLabel className="ml-3 min-w-0">{stationName}</FieldLabel>
        </div>
        {layout === 'flight' && station && station.metar && stationRunway && (
          <RunwayWindFields station={station} runway={stationRunway} />
        )}
        <StationReport
          station={station}
          withTaf={layout === 'flight'}
          note={layout === 'arrived' ? t('Dashboard.Weather.NextLeg') : undefined}
          loading={weather.loading}
        />
      </DashboardCard>
    );
  }

  // Without an OFP: the airport the user types, no planned runway
  const onIcao = (value: string) => {
    const icao = value.toUpperCase();
    setTypedIcao(icao);
    if (icao.length === ICAO_LENGTH || icao.length === 0) {
      dispatch(setUserDepartureIcao(icao));
    }
  };
  return (
    <DashboardCard
      title={t('Dashboard.Weather.Title')}
      section="destination"
      className={className}
      trailing={
        <SimpleInput
          className={`w-28 text-center font-bold uppercase ${M3_INPUT}`}
          fontSizeClassName="text-base"
          placeholder={t('Dashboard.Weather.IcaoPlaceholder')}
          value={typedIcao}
          onChange={onIcao}
          maxLength={ICAO_LENGTH}
        />
      }
      footer={footer(weather.dep ? weather.dep.icao : undefined)}
    >
      <StationReport
        station={weather.dep}
        note={weather.dep ? t('Dashboard.Weather.NoRunway') : undefined}
        loading={weather.loading}
      />
    </DashboardCard>
  );
};
