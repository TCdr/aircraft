// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useState } from 'react';
import { Droplet, Speedometer2, ThermometerHalf, Wind } from 'react-bootstrap-icons';
import {
  MetarParserType,
  parseMetar,
  useInterval,
  usePersistentNumberProperty,
  usePersistentProperty,
} from '@flybywiresim/fbw-sdk-react';
import { t } from '../../Localization/translation';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { ColoredMetar } from './ColorMetar';
import { useAppDispatch, useAppSelector } from '../../Store/store';
import {
  setDepartureMetar,
  setDestinationMetar,
  setUserDepartureIcao,
  setUserDestinationIcao,
} from '../../Store/features/dashboard';
import { M3Switch, M3_INPUT } from '../../UtilComponents/Material/Material';
import { TooltipWrapper } from '../../UtilComponents/TooltipWrapper';
import { fetchRawMetarBySource, mapMetarErrorToDisplayMessage } from '../../Service/WeatherService';

const MetarParserTypeProp: MetarParserType = {
  raw_text: '',
  raw_parts: [],
  color_codes: [],
  icao: '',
  observed: new Date(0),
  wind: {
    degrees: 0,
    degrees_from: 0,
    degrees_to: 0,
    speed_kts: 0,
    speed_mps: 0,
    gust_kts: 0,
    gust_mps: 0,
  },
  visibility: {
    miles: '',
    miles_float: 0.0,
    meters: '',
    meters_float: 0.0,
  },
  conditions: [],
  clouds: [],
  ceiling: {
    code: '',
    feet_agl: 0,
    meters_agl: 0,
  },
  temperature: {
    celsius: 0,
    fahrenheit: 0,
  },
  dewpoint: {
    celsius: 0,
    fahrenheit: 0,
  },
  humidity_percent: 0,
  barometer: {
    hg: 0,
    kpa: 0,
    mb: 0,
  },
  flight_category: '',
};

interface WeatherWidgetProps {
  name: 'origin' | 'destination';
  simbriefIcao: string;
  userIcao?: string;
}

export const WeatherWidget: FC<WeatherWidgetProps> = ({ name, simbriefIcao, userIcao }) => {
  const [baroType] = usePersistentProperty('CONFIG_INIT_BARO_UNIT', 'AUTO');
  const dispatch = useAppDispatch();
  const [simbriefIcaoAtLoading, setSimbriefIcaoAtLoading] = useState(simbriefIcao);
  const [metarError, setErrorMetar] = useState('');
  const [usingColoredMetar] = usePersistentNumberProperty('EFB_USING_COLOREDMETAR', 1);

  const getBaroTypeForAirport = (icao: string) =>
    ['K', 'C', 'M', 'P', 'RJ', 'RO', 'TI', 'TJ'].some((r) => icao.toUpperCase().startsWith(r)) ? 'IN HG' : 'HPA';

  const metar =
    useAppSelector((state) =>
      name === 'origin' ? state.dashboard.departureMetar : state.dashboard.destinationMetar,
    ) ?? MetarParserTypeProp;
  const setMetar = name === 'origin' ? setDepartureMetar : setDestinationMetar;

  const [showMetar, setShowMetar] = usePersistentNumberProperty(`CONFIG_SHOW_METAR_${name}`, 0);

  const baroValue = () => {
    const displayedBaroType = baroType === 'AUTO' ? getBaroTypeForAirport(metar.icao) : baroType;
    if (displayedBaroType === 'IN HG') {
      return `${metar.barometer.hg.toFixed(2)} inHg`;
    }
    return `${metar.barometer.mb.toFixed(0)} mb`;
  };

  const notAvailable = t('Dashboard.ImportantInformation.Weather.NotAvailableShort');
  /** A reading of the report: its icon, its name, its value */
  const reading = (icon: JSX.Element, name: string, value: string) => (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <span className="text-m3-muted">{icon}</span>
      <span className="mt-1 text-center text-xs text-m3-muted">{name}</span>
      <span className="text-center text-base font-bold text-m3-text">{metar.raw_text ? value : notAvailable}</span>
    </div>
  );

  const handleIcao = (icao: string) => {
    if (name === 'origin') {
      dispatch(setUserDepartureIcao(icao));
    } else {
      dispatch(setUserDestinationIcao(icao));
    }

    if (icao.length > 0) {
      getMetar(icao);
    } else if (icao.length === 0) {
      getMetar(simbriefIcao);
    }
  };

  async function getMetar(icao: string): Promise<void> {
    if (icao.length !== 4 || !/^[a-z]{4}$/i.test(icao)) {
      setErrorMetar(t('Dashboard.ImportantInformation.Weather.NoIcaoProvided'));
      dispatch(setMetar(MetarParserTypeProp));
      return Promise.resolve();
    }

    try {
      const rawMetar = await fetchRawMetarBySource(icao);
      const metarParse = parseMetar(rawMetar);
      dispatch(setMetar(metarParse));
    } catch (err) {
      setErrorMetar(mapMetarErrorToDisplayMessage(err));

      dispatch(setMetar(MetarParserTypeProp));
    }

    return Promise.resolve();
  }

  useEffect(() => {
    // if we have new simbrief data that is different from the simbrief data at
    // loading of the widget we overwrite the user input once. After that
    // user input has priority.
    if (simbriefIcao !== simbriefIcaoAtLoading) {
      dispatch(setUserDepartureIcao(''));
      dispatch(setUserDestinationIcao(''));
      getMetar(simbriefIcao);
      setSimbriefIcaoAtLoading(simbriefIcao);
    } else {
      getMetar(userIcao || simbriefIcao);
    }
  }, [simbriefIcao, userIcao]);

  useInterval(() => {
    handleIcao(userIcao ?? simbriefIcao);
  }, 60_000);

  return (
    <div>
      {metar === undefined ? (
        <span className="text-base text-m3-muted">{t('Dashboard.ImportantInformation.Weather.Loading')}</span>
      ) : (
        <>
          <div className="flex flex-row items-center">
            <SimpleInput
              className={`w-28 text-center font-bold uppercase ${M3_INPUT}`}
              fontSizeClassName="text-lg"
              placeholder={simbriefIcao || 'ICAO'}
              value={userIcao ?? simbriefIcao}
              onChange={(value) => handleIcao(value)}
              maxLength={4}
            />
            <div className="grow" />
            <TooltipWrapper
              text={
                showMetar
                  ? t('Dashboard.ImportantInformation.Weather.TT.SwitchToIconView')
                  : t('Dashboard.ImportantInformation.Weather.TT.SwitchToRawMetarView')
              }
            >
              <div className="flex flex-row items-center">
                <span className="mr-2 text-sm font-semibold text-m3-muted">
                  {t('Dashboard.ImportantInformation.Weather.Raw')}
                </span>
                <M3Switch value={!!showMetar} onToggle={(value) => setShowMetar(value ? 1 : 0)} />
              </div>
            </TooltipWrapper>
          </div>
          <div style={{ minHeight: '84px' }}>
            {!showMetar ? (
              <div className="mt-3 flex w-full flex-row">
                {reading(
                  <Speedometer2 size={24} />,
                  t('Dashboard.ImportantInformation.Weather.AirPressure'),
                  metar.barometer ? baroValue() : 'N/A',
                )}
                {reading(
                  <Wind size={24} />,
                  t('Dashboard.ImportantInformation.Weather.WindSpeed'),
                  `${metar.wind.degrees.toFixed(0)}° / ${metar.wind.speed_kts.toFixed(0)} kts`,
                )}
                {reading(
                  <ThermometerHalf size={24} />,
                  t('Dashboard.ImportantInformation.Weather.Temperature'),
                  `${metar.temperature.celsius.toFixed(0)} °C`,
                )}
                {reading(
                  <Droplet size={24} />,
                  t('Dashboard.ImportantInformation.Weather.DewPoint'),
                  `${metar.dewpoint.celsius.toFixed(0)} °C`,
                )}
              </div>
            ) : (
              <>
                {metar.raw_text ? (
                  <div className="mt-3 font-mono text-lg">
                    {usingColoredMetar ? (
                      <ColoredMetar metar={metar} />
                    ) : (
                      <span className="text-lg text-m3-text">{metar.raw_text}</span>
                    )}
                  </div>
                ) : (
                  <span className="mt-3 text-base text-m3-muted">{metarError}</span>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
