// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Units, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../../Localization/translation';
import { useAppSelector } from '../../../Store/store';
import { SimpleInput } from '../../../UtilComponents/Form/SimpleInput/SimpleInput';
import { M3_INPUT } from '../../../UtilComponents/Material/Material';
import { localOffsetSeconds } from '../../../Dashboard/logic/dashboardFormat';
import { TripRole } from '../../../Dashboard/logic/tripWeather';
import { useStationReports, useTripWeather } from '../../../Dashboard/useTripWeather';
import { useAirportInfo } from './useAirportInfo';
import { isAtAirport } from './logic/stationTime';
import { MetarView } from './MetarView';
import { TafView } from './TafView';

const W = 'NavigationAndCharts.Weather';
const ICAO_LENGTH = 4;
const CLOCK_TICK_MS = 30_000;
const ROLE_KEYS: Record<TripRole, string> = { dep: `${W}.Dep`, dest: `${W}.Dest`, altn: `${W}.Altn` };

/** What the dashboard's METAR / TAF button passes along */
export interface WeatherPageState {
  icao?: string;
}

type View = 'metar' | 'taf';

const Message: FC<{ text: string }> = ({ text, children }) => (
  <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
    <span className="text-base font-semibold text-m3-muted">{text}</span>
    {children}
  </div>
);

const ToolbarButton: FC<{ selected: boolean; onClick: () => void; className?: string }> = ({
  selected,
  onClick,
  className,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex h-10 shrink-0 flex-row items-center rounded-sm border px-3 ${
      selected
        ? 'border-m3-primary bg-m3-primary-container text-m3-on-primary-container'
        : 'border-m3-outline bg-transparent text-m3-text hover:bg-m3-tile'
    } ${className ?? ''}`}
  >
    {children}
  </button>
);

const OfpLoadButton: FC<{ label: string; onLoad: () => void }> = ({ label, onLoad }) => (
  <ToolbarButton selected={false} onClick={onLoad} className="mt-4">
    <span className="text-sm font-extrabold uppercase tracking-wider text-current">{label}</span>
  </ToolbarButton>
);

/** METAR and TAF of the trip's airports or of any airport typed, decoded and drawn */
export const WeatherPage: FC = () => {
  const location = useLocation<WeatherPageState | undefined>();
  const askedIcao = location.state && location.state.icao ? location.state.icao.toUpperCase() : null;
  const trip = useTripWeather();
  const { departingName, arrivingName, weather: ofpWeather } = useAppSelector((state) => state.simbrief.data);
  const { tafs: ofpTafs, metars: ofpMetars } = ofpWeather;
  // The plan's other airports with a report (takeoff and en-route alternates), after the trip's own buttons
  const ofpStations = Object.keys(ofpTafs)
    .concat(Object.keys(ofpMetars))
    .filter((icao, index, all) => all.indexOf(icao) === index)
    .filter((icao) => !trip.airports.some((airport) => airport.icao === icao));

  /** The airport the dashboard asked for, else the destination, else the first airport of the trip */
  const defaultIcao = (): string | null => {
    if (askedIcao) {
      return askedIcao;
    }
    const dest = trip.airports.find((airport) => airport.role === 'dest');
    const first = dest ?? trip.airports[0];
    return first ? first.icao : null;
  };
  const [selected, setSelected] = useState<string | null>(defaultIcao);
  const [typed, setTyped] = useState('');
  const [view, setView] = useState<View>('metar');
  /** The reports the crew took from the OFP, as "metar:ICAO" or "taf:ICAO", when the weather server had none */
  const [ofpLoaded, setOfpLoaded] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const loadFromOfp = (kind: 'metar' | 'taf', icao: string) =>
    setOfpLoaded((loaded) => loaded.concat(`${kind}:${icao}`));

  useEffect(() => {
    if (askedIcao) {
      setSelected(askedIcao);
    }
  }, [askedIcao]);
  // An OFP imported while the page is open gives it its airports
  useEffect(() => {
    if (selected === null) {
      setSelected(defaultIcao());
    }
  }, [trip.airports.map((airport) => airport.icao).join(' ')]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const tripAirport = trip.airports.find((airport) => airport.icao === selected);
  const tripStation = [trip.dep, trip.dest, trip.altn].find((station) => !!station && station.icao === selected);
  const own = useStationReports(selected && !tripAirport ? selected : null);
  const serverMetar = tripAirport ? tripStation?.metar : own.reports?.metar;
  const ofpMetar = selected ? ofpMetars[selected] : undefined;
  const metarFromOfp = !serverMetar && !!ofpMetar && !!selected && ofpLoaded.indexOf(`metar:${selected}`) >= 0;
  const metar = metarFromOfp ? ofpMetar : serverMetar;
  const serverTaf = tripAirport ? tripStation?.taf : own.reports?.taf;
  const ofpTaf = selected ? ofpTafs[selected] : undefined;
  const tafFromOfp = !serverTaf && !!ofpTaf && !!selected && ofpLoaded.indexOf(`taf:${selected}`) >= 0;
  const taf = tafFromOfp ? ofpTaf : serverTaf;
  const loading = tripAirport ? !tripStation && trip.loading : own.loading && !own.reports;

  const airport = useAirportInfo(selected);
  const [aircraftLat] = useSimVar('PLANE LATITUDE', 'degree latitude', 10_000);
  const [aircraftLon] = useSimVar('PLANE LONGITUDE', 'degree longitude', 10_000);
  const [localSeconds] = useSimVar('E:LOCAL TIME', 'seconds', 10_000);
  const [zuluSeconds] = useSimVar('E:ZULU TIME', 'seconds', 10_000);
  const offsetSeconds =
    airport && isAtAirport(aircraftLat, aircraftLon, airport.lat, airport.lon)
      ? localOffsetSeconds(localSeconds, zuluSeconds)
      : null;

  let ofpName = '';
  if (tripAirport && tripAirport.role === 'dep') {
    ofpName = departingName;
  } else if (tripAirport && tripAirport.role === 'dest') {
    ofpName = arrivingName;
  }
  const name = (airport && airport.name) || ofpName;
  const metric = Units.usingMetric;

  const onTyped = (value: string) => {
    const icao = value.toUpperCase();
    setTyped(icao);
    if (icao.length === ICAO_LENGTH) {
      setSelected(icao);
    }
  };

  let body: JSX.Element;
  if (!selected) {
    body = <Message text={t(`${W}.NoStation`)} />;
  } else if (view === 'metar') {
    body = metar ? (
      <MetarView
        icao={selected}
        name={name}
        metar={metar}
        fromOfp={metarFromOfp}
        airport={airport}
        localOffsetSeconds={offsetSeconds}
        nowMs={nowMs}
        metric={metric}
      />
    ) : (
      <Message text={loading ? t(`${W}.Loading`) : t(`${W}.NoMetar`, [{ icao: selected }])}>
        {!loading && ofpMetar && (
          <OfpLoadButton label={t(`${W}.LoadOfpMetar`)} onLoad={() => loadFromOfp('metar', selected)} />
        )}
      </Message>
    );
  } else {
    body = taf ? (
      <TafView
        icao={selected}
        taf={taf}
        fromOfp={tafFromOfp}
        localOffsetSeconds={offsetSeconds}
        nowMs={nowMs}
        metric={metric}
      />
    ) : (
      <Message text={loading ? t(`${W}.Loading`) : t(`${W}.NoTaf`, [{ icao: selected }])}>
        {!loading && ofpTaf && (
          <OfpLoadButton label={t(`${W}.LoadOfpTaf`)} onLoad={() => loadFromOfp('taf', selected)} />
        )}
      </Message>
    );
  }

  return (
    <div className="flex h-content-section-reduced w-full flex-col text-m3-text">
      <div className="flex h-11 shrink-0 flex-row items-center">
        {trip.airports.map((entry, index) => (
          <ToolbarButton
            key={entry.role}
            selected={entry.icao === selected}
            onClick={() => setSelected(entry.icao)}
            className={index > 0 ? 'ml-2' : ''}
          >
            <span className="text-xs font-bold uppercase tracking-wider text-current">{t(ROLE_KEYS[entry.role])}</span>
            <span className="ml-2 text-sm font-extrabold text-current">{entry.icao}</span>
          </ToolbarButton>
        ))}
        {ofpStations.map((icao) => (
          <ToolbarButton key={icao} selected={icao === selected} onClick={() => setSelected(icao)} className="ml-2">
            <span className="text-xs font-bold uppercase tracking-wider text-current">{t(`${W}.Ofp`)}</span>
            <span className="ml-2 text-sm font-extrabold text-current">{icao}</span>
          </ToolbarButton>
        ))}
        <SimpleInput
          className={`${trip.airports.length + ofpStations.length > 0 ? 'ml-3' : ''} w-28 text-center font-bold uppercase ${M3_INPUT} !rounded-sm ${
            selected !== null && selected === typed && !tripAirport && ofpStations.indexOf(selected) < 0
              ? '!border-m3-primary'
              : ''
          }`}
          fontSizeClassName="text-base"
          placeholder={t(`${W}.IcaoPlaceholder`)}
          value={typed}
          onChange={onTyped}
          maxLength={ICAO_LENGTH}
        />
        <div className="grow" />
        <div className="flex shrink-0 flex-row overflow-hidden rounded-sm border border-m3-outline">
          {(['metar', 'taf'] as View[]).map((option, index) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className={`flex h-10 w-28 flex-row items-center justify-center ${index > 0 ? 'border-l border-m3-outline' : ''} ${
                view === option ? 'bg-m3-primary text-m3-on-primary' : 'bg-transparent text-m3-muted hover:bg-m3-tile'
              }`}
            >
              <span className="text-sm font-extrabold tracking-wider text-current">
                {t(option === 'metar' ? `${W}.Metar` : `${W}.Taf`)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">{body}</div>
    </div>
  );
};
