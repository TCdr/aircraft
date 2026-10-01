// Copyright (c) 2025-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useState } from 'react';
import { Metar as FbwApiMetar } from '@flybywiresim/api-client';
import { Metar as MsfsMetar } from '@microsoft/msfs-sdk';
import {
  Units,
  MetarParserType,
  usePersistentProperty,
  parseMetar,
  ConfigWeatherMap,
  MathUtils,
  usePersistentSetting,
} from '@flybywiresim/fbw-sdk-react';
import { toast } from 'react-toastify';
import { ArrowRight, Trash } from 'react-bootstrap-icons';
import { getAirport } from '../Data/Runways';
import { t } from '../../Localization/translation';
import { TooltipWrapper } from '../../UtilComponents/TooltipWrapper';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { SelectInput } from '../../UtilComponents/Form/SelectInput/SelectInput';
import { useAppDispatch, useAppSelector } from '../../Store/store';
import {
  setFieldElevation,
  setTemperature,
  setPublishedAltitudes,
  setIcao,
} from '../../Store/features/temperatureCorrectionCalculator';
import { M3Button, M3Card, M3List } from '../../UtilComponents/Material/Material';
import { PERF_INPUT, PERF_SELECT, PerfFillFrom, PerfRow, PerfSection, PerfTitle, PerfValue } from './PerformanceKit';

const NUMBER_OF_ALTITUDES = 10;

export const TemperatureCorrectionWidget = () => {
  const dispatch = useAppDispatch();

  const [autoFillSource, setAutoFillSource] = useState<'METAR' | 'OFP'>('OFP');
  const [metarSource] = usePersistentSetting('CONFIG_METAR_SRC');
  const { usingMetric: usingMetricPinProg } = Units;

  const { icao, temperature, fieldElevation, publishedAltitudes } = useAppSelector(
    (state) => state.temperatureCorrectionCalculator,
  );

  const { arrivingAirport: ofpArrivingAirport, arrivingMetar: ofpArrivingMetar } = useAppSelector(
    (state) => state.simbrief.data,
  );

  const publishAltitudeInputs =
    publishedAltitudes.length < NUMBER_OF_ALTITUDES ? [...publishedAltitudes, undefined] : publishedAltitudes;

  // The displayed results have no duplicates and are in sorted order
  const displayedAltitudes = Array.from(new Set(publishedAltitudes)).sort((a, b) => a - b);

  const isValidIcao = (icao: string): boolean => icao?.length === 4;

  const handleICAOChange = (icao: string) => {
    dispatch(setIcao(icao));
    if (isValidIcao(icao)) {
      getAirport(icao)
        .then((airport) => dispatch(setFieldElevation(Math.round(airport.altitude / 0.3048))))
        .catch(() => dispatch(setFieldElevation(undefined)));
    }
  };

  const syncValuesWithApiMetar = async (): Promise<void> => {
    if (!icao || !isValidIcao(icao)) {
      return;
    }

    let parsedMetar: MetarParserType | undefined = undefined;

    // Comes from the sim rather than the FBW API
    if (metarSource === ConfigWeatherMap.MSFS) {
      let metar: MsfsMetar;
      try {
        metar = await Coherent.call('GET_METAR_BY_IDENT', icao);
        if (metar.icao !== icao.toUpperCase()) {
          throw new Error('No METAR available');
        }
        parsedMetar = parseMetar(metar.metarString);
      } catch (err: any) {
        toast.error(err.message);
      }
    } else {
      try {
        const response = await FbwApiMetar.get(icao, metarSource);
        if (!response.metar) {
          throw new Error('No METAR available');
        }
        parsedMetar = parseMetar(response.metar);
      } catch (err: any) {
        toast.error(err.message);
      }
    }

    if (parsedMetar === undefined) {
      return;
    }

    dispatch(setTemperature(parsedMetar.temperature.celsius));
  };

  const handleFieldElevation = (input: string): void => {
    let elevation: number | undefined = parseInt(input);

    if (Number.isNaN(elevation)) {
      elevation = undefined;
    }

    dispatch(setFieldElevation(elevation));
  };

  const handleTemperature = (input: string): void => {
    let temperature: number | undefined = parseInt(input);

    if (Number.isNaN(temperature)) {
      temperature = undefined;
    }

    dispatch(setTemperature(temperature));
  };

  const handlePublishedAltitude = (index: number, input: string): void => {
    const altitude: number = parseInt(input);

    if (Number.isNaN(altitude)) {
      return;
    }

    const altitudes = [...publishedAltitudes.slice(0, index), altitude, ...publishedAltitudes.slice(index + 1)];

    dispatch(setPublishedAltitudes(altitudes));
  };

  const handleClearPublishedAltitudes = (): void => {
    dispatch(setPublishedAltitudes([]));
  };

  const deletePublishedAltitudeRow = (idx: number): void => {
    dispatch(setPublishedAltitudes(publishedAltitudes.filter((_, i) => i !== idx)));
  };

  const syncValuesWithOfp = async () => {
    if (!isValidIcao(ofpArrivingAirport)) {
      return;
    }

    const parsedMetar: MetarParserType = parseMetar(ofpArrivingMetar);
    try {
      const airport = await getAirport(ofpArrivingAirport);
      dispatch(setIcao(ofpArrivingAirport));
      dispatch(setFieldElevation(airport.altitude));
      dispatch(setTemperature(parsedMetar.temperature.celsius));
    } catch (e) {
      toast.error(e);
      dispatch(setFieldElevation(undefined));
    }
  };

  const handleAutoFill = () => {
    if (autoFillSource === 'METAR') {
      syncValuesWithApiMetar();
    } else {
      syncValuesWithOfp();
    }
  };

  const isAutoFillIcaoValid = () => {
    if (autoFillSource === 'METAR') {
      return icao && isValidIcao(icao);
    }
    return isValidIcao(ofpArrivingAirport);
  };

  const calculateCorrectedAltitude = (publishedAlt?: number): number | undefined => {
    if (publishedAlt === undefined || fieldElevation === undefined || temperature === undefined) {
      return undefined;
    }

    // Formula from EUROCONTROL 2940 workbook.
    const correction =
      (publishedAlt - fieldElevation) *
      ((15 - (temperature + 0.00198 * fieldElevation)) /
        (273 +
          (temperature + 0.00198 * fieldElevation) -
          0.5 * 0.00198 * (publishedAlt - fieldElevation + fieldElevation)));

    if (correction <= 0) {
      return publishedAlt;
    }

    return MathUtils.ceil(publishedAlt + correction, 10);
  };

  const [temperatureUnit, setTemperatureUnit] = usePersistentProperty(
    'EFB_PREFERRED_TEMPERATURE_UNIT',
    usingMetricPinProg ? 'C' : 'F',
  );

  const getVariableUnitDisplayValue = <T,>(
    value: number | undefined,
    unit: T,
    imperialUnit: T,
    metricToImperial: (value: number) => number,
  ) => {
    if (value !== undefined) {
      if (unit === imperialUnit) {
        return metricToImperial(value);
      }
      return value;
    }
    return undefined;
  };

  const fillDataTooltip = () => {
    switch (autoFillSource) {
      case 'METAR':
        if (!isAutoFillIcaoValid()) {
          return t('Performance.Landing.TT.YouNeedToEnterAnIcaoCodeInOrderToMakeAMetarRequest');
        }
        break;
      case 'OFP':
        if (!isAutoFillIcaoValid()) {
          return t('Performance.Landing.TT.YouNeedToLoadSimBriefDataInOrderToAutofillData');
        }
        break;
      default:
        return undefined;
    }

    return undefined;
  };

  return (
    <div className="flex h-content-section-reduced flex-col overflow-hidden text-base text-m3-text">
      <div className="mb-3 flex shrink-0 flex-row items-center">
        <TooltipWrapper text={fillDataTooltip()}>
          <div>
            <PerfFillFrom
              enabled={!!isAutoFillIcaoValid()}
              onClick={handleAutoFill}
              source={autoFillSource}
              sources={['OFP', 'METAR']}
              onSource={(value: 'METAR' | 'OFP') => setAutoFillSource(value)}
            />
          </div>
        </TooltipWrapper>
      </div>

      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <div className="mr-3 flex h-full w-[26rem] shrink-0 flex-col">
          <PerfSection className="shrink-0" title={t('Performance.TemperatureCorrection.AirfieldData')}>
            <PerfRow label={t('Performance.Takeoff.Airport')}>
              <SimpleInput
                className={`w-48 uppercase ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={icao}
                placeholder="ICAO"
                onChange={handleICAOChange}
                maxLength={4}
              />
            </PerfRow>
            <PerfRow label={t('Performance.TemperatureCorrection.FieldElevation')}>
              <SimpleInput
                className={`w-48 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={fieldElevation}
                placeholder={t('Performance.Takeoff.RunwayElevationUnit')}
                onChange={handleFieldElevation}
                maxLength={5}
                decimalPrecision={0}
                number
              />
            </PerfRow>
            <PerfRow label={t('Performance.Takeoff.Temperature')}>
              <div className="flex w-48 flex-row">
                <SimpleInput
                  className={`w-full min-w-0 ${PERF_INPUT}`}
                  fontSizeClassName="text-base"
                  value={getVariableUnitDisplayValue<'C' | 'F'>(
                    temperature,
                    temperatureUnit as 'C' | 'F',
                    'F',
                    Units.celsiusToFahrenheit,
                  )}
                  placeholder={`°${temperatureUnit}`}
                  decimalPrecision={1}
                  onChange={handleTemperature}
                  number
                />
                <SelectInput
                  fontSizeClassName="text-base"
                  value={temperatureUnit}
                  className={`ml-1 w-[4.5rem] ${PERF_SELECT}`}
                  options={[
                    { value: 'C', displayValue: '°C' },
                    { value: 'F', displayValue: '°F' },
                  ]}
                  onChange={(newValue) => setTemperatureUnit(newValue as 'C' | 'F')}
                />
              </div>
            </PerfRow>
          </PerfSection>
          <div className="grow" />
          <M3Button
            tone="danger"
            className="!h-12 shrink-0"
            disabled={displayedAltitudes.length === 0}
            onClick={handleClearPublishedAltitudes}
          >
            <Trash size={20} />
            <span className="text-base text-current">{t('Performance.Landing.Clear')}</span>
          </M3Button>
        </div>

        {/* a published altitude and, beside it, the altitude to fly in cold air */}
        <M3Card className="h-full min-w-0 flex-1 py-3">
          <div className="mb-1 flex shrink-0 flex-row items-center px-4">
            <PerfTitle className="w-56">{t('Performance.TemperatureCorrection.PublishedAltitudes')}</PerfTitle>
            <PerfTitle>{t('Performance.TemperatureCorrection.Corrected')}</PerfTitle>
          </div>
          <M3List>
            {publishAltitudeInputs.map((alt, idx) => {
              const published = typeof alt === 'number' ? alt : parseInt(`${alt}`);
              const corrected = Number.isNaN(published) ? undefined : calculateCorrectedAltitude(published);
              return (
                // eslint-disable-next-line react/no-array-index-key
                <div className="flex h-12 shrink-0 flex-row items-center px-4" key={idx}>
                  <SimpleInput
                    className={`w-44 ${PERF_INPUT}`}
                    fontSizeClassName="text-base"
                    value={alt}
                    placeholder={t('Performance.Takeoff.RunwayElevationUnit')}
                    min={0}
                    max={20000}
                    decimalPrecision={0}
                    onChange={(v) => handlePublishedAltitude(idx, v)}
                    onBlur={(v) => !v && deletePublishedAltitudeRow(idx)}
                    number
                  />
                  <ArrowRight size={18} className="mx-4 shrink-0 text-m3-muted" />
                  {corrected !== undefined ? (
                    <>
                      <PerfValue text={corrected.toFixed(0)} unit="ft" primary big />
                      <div className="grow" />
                      {corrected > published && (
                        <span className="rounded-full bg-m3-warn-container px-3 py-1 text-xs font-bold leading-none text-m3-on-warn">
                          {`+${(corrected - published).toFixed(0)} ft`}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-lg text-m3-muted">—</span>
                  )}
                </div>
              );
            })}
          </M3List>
        </M3Card>
      </div>
    </div>
  );
};
