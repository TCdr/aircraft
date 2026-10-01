// @ts-strict-ignore
// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useContext, useState } from 'react';
import {
  AirframeType,
  MathUtils,
  MetarParserType,
  parseMetar,
  Units,
  usePersistentProperty,
} from '@flybywiresim/fbw-sdk-react';
import {
  getSimbriefData,
  LandingAntiIce,
  LandingApproachType,
  LandingBrakingMode,
  LandingComputationType,
  LandingConf,
  LandingGoAroundConf,
  LandingLimitation,
  LandingPerformanceError,
  LandingPerformanceEstimate,
  LandingPerformanceInputs,
  LandingPerformanceResult,
  LandingRunwayCondition,
  landingIsaTemperature,
  landingPressureAltitude,
  requestFmsLandingData,
  assessBtvExits,
  BtvExitStatus,
  isBtvRunwayCondition,
} from '@flybywiresim/fbw-sdk';
import { useEventBus } from '@flybywiresim/flypad';
import { toast } from 'react-toastify';
import { Calculator, Trash } from 'react-bootstrap-icons';
import { t } from '../../Localization/translation';
import { PromptModal, useModals } from '../../UtilComponents/Modals/Modals';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { SelectInput } from '../../UtilComponents/Form/SelectInput/SelectInput';
import { useAppDispatch, useAppSelector } from '../../Store/store';
import { clearLandingValues, initialState, setLandingValues } from '../../Store/features/performance';
import { AircraftContext } from '../../AircraftContext';
import { useNavigraphAuthInfo } from '../../Apis/Navigraph/Components/Authentication';
import { fetchRawMetarBySource } from '../../Service/WeatherService';
import {
  isValidIcao,
  isWindMagnitudeAndDirection,
  isWindMagnitudeOnly,
  WIND_MAGNITUDE_AND_DIR_REGEX,
  WIND_MAGNITUDE_ONLY_REGEX,
} from '../Data/Utils';
import { getAirportMagVar, getRunways } from '../Data/Runways';
import { LandingRunway, LandingRunwayStop } from './LandingRunway';
import { LandingRunwayExits, loadLandingRunwayExits } from './LandingBtv';
import { M3ActionChip, M3Button, M3Card, M3Segmented, M3Switch } from '../../UtilComponents/Material/Material';
import {
  PERF_INPUT,
  PERF_SELECT,
  PerfFillFrom,
  PerfResult,
  PerfResultRow,
  PerfRow as Row,
  PerfSection as Section,
  PerfTitle,
  PerfValue as Value,
} from './PerformanceKit';

/** The labels of the braking modes, as on the autobrake selectors (A380 LO/2/3/HI/BTV, A320 LO/MED) */
const BRAKING_LABELS: Record<LandingBrakingMode, string> = {
  [LandingBrakingMode.Manual]: 'MAN',
  [LandingBrakingMode.Lo]: 'LO',
  [LandingBrakingMode.Two]: '2',
  [LandingBrakingMode.Three]: '3',
  [LandingBrakingMode.Hi]: 'HI',
  [LandingBrakingMode.Btv]: 'BTV',
  [LandingBrakingMode.Low]: 'LO',
  [LandingBrakingMode.Medium]: 'MED',
};

/** Water and slush 1/2": Airbus does not recommend their operational use (A380 FCOM PER-LND-LCD-OCD) */
const NOT_RECOMMENDED = [LandingRunwayCondition.Water13mm, LandingRunwayCondition.Slush13mm];

/**
 * The landing calculator of the A380X and the A32NX, after the LDG PERF application of the A380 (A380 FCOM PER-LND):
 * DISPATCH (required landing distance) and IN-FLIGHT (actual landing distance of each braking mode) computations,
 * with the results in the layout of its RESULTS panel, and the landing roll on the runway.
 */
export const LandingWidget = () => {
  const dispatch = useAppDispatch();
  const calculator = useContext(AircraftContext).performanceCalculators.landing;
  const isA380 = useAppSelector((state) => state.config.airframeInfo.variant) === AirframeType.A380_842;
  const eventBus = useEventBus();
  const { showModal } = useModals();
  const { usingMetric } = Units;

  const [autoFillSource, setAutoFillSource] = useState<'METAR' | 'OFP' | 'FMS'>('FMS');
  /** A380 BTV: the exits of a runway (key: airport and runway) */
  const [runwayExits, setRunwayExits] = useState<(LandingRunwayExits & { key: string }) | undefined>(undefined);

  const [temperatureUnit, setTemperatureUnit] = usePersistentProperty(
    'EFB_PREFERRED_TEMPERATURE_UNIT',
    usingMetric ? 'C' : 'F',
  );
  const [pressureUnit, setPressureUnit] = usePersistentProperty(
    'EFB_PREFERRED_PRESSURE_UNIT',
    usingMetric ? 'hPa' : 'inHg',
  );
  const [distanceUnit, setDistanceUnit] = usePersistentProperty(
    'EFB_PREFERRED_DISTANCE_UNIT',
    usingMetric ? 'm' : 'ft',
  );
  const [weightUnit, setWeightUnit] = usePersistentProperty('EFB_PREFERRED_WEIGHT_UNIT', usingMetric ? 'kg' : 'lb');

  const {
    icao,
    availableRunways,
    selectedRunwayIndex,
    runwayHeading,
    runwayLength,
    elevation,
    slope,
    goAroundAltitude,
    computationType,
    runwayCondition,
    windDirection,
    windMagnitude,
    windEntry,
    temperature,
    pressure,
    antiIce,
    airConditioning,
    weight,
    conf,
    goAroundConf,
    approachType,
    goAroundGradient,
    speedIncrement,
    autoland,
    glideSlope,
    brakingMode,
    reverseThrust,
    overweightProcedure,
    result,
  } = useAppSelector((state) => state.performance.landing);

  const {
    arrivingAirport: ofpArrivingAirport,
    arrivingMetar: ofpArrivingMetar,
    arrivingRunway: ofpArrivingRunway,
    weights: ofpWeights,
    units: ofpUnits,
  } = useAppSelector((state) => state.simbrief.data);
  const navigraphAuthInfo = useNavigraphAuthInfo();
  const [overrideSimBriefUserID] = usePersistentProperty('CONFIG_OVERRIDE_SIMBRIEF_USERID');

  const selectedRunway =
    selectedRunwayIndex !== undefined && selectedRunwayIndex >= 0 ? availableRunways[selectedRunwayIndex] : undefined;
  const inFlight = computationType === LandingComputationType.InFlight;
  const features = calculator.features;
  const runwayConditions = calculator.runwayConditions(computationType);
  const reverseAvailable = calculator.reverseThrustAvailable(
    computationType,
    runwayCondition,
    conf,
    inFlight ? brakingMode : LandingBrakingMode.Manual,
  );

  const subReplacements = (msg: string, replacements: Record<string, string>): string =>
    msg.replace(/\{([a-z_]+)\}/g, (m) => replacements[m.substring(1, m.length - 1)] ?? m[1]);

  // ---------------------------------------------------------------------------------------------- wind

  /** The wind along the runway (negative for a tailwind) and across it (R from the right, L from the left) */
  const windComponents = (): { headwind: number; crosswind: number; side: 'L' | 'R' | '' } | undefined => {
    if (windMagnitude === undefined) {
      return undefined;
    }
    if (windDirection === undefined || runwayHeading === undefined) {
      return { headwind: windMagnitude, crosswind: 0, side: '' };
    }
    const angle = Avionics.Utils.diffAngle(runwayHeading, windDirection);
    return {
      headwind: windMagnitude * Math.cos(angle * Avionics.Utils.DEG2RAD),
      crosswind: Math.abs(windMagnitude * Math.sin(angle * Avionics.Utils.DEG2RAD)),
      side: angle > 0 ? 'R' : angle < 0 ? 'L' : '',
    };
  };
  const wind = windComponents();
  const windNote =
    wind !== undefined && (wind.headwind !== 0 || wind.crosswind !== 0)
      ? `${wind.headwind >= 0 ? 'HD' : 'TL'}${Math.abs(Math.round(wind.headwind))}${
          wind.crosswind >= 0.5 ? ` ${wind.side}${Math.round(wind.crosswind)}` : ''
        }`
      : undefined;

  const pressureAlt =
    elevation !== undefined && pressure !== undefined ? landingPressureAltitude(elevation, pressure) : undefined;
  const isaDeviation =
    pressureAlt !== undefined && temperature !== undefined
      ? Math.round(temperature - landingIsaTemperature(pressureAlt))
      : undefined;

  // ---------------------------------------------------------------------------------------------- calculation

  const clearResult = () => {
    if (result !== undefined) {
      dispatch(setLandingValues({ result: undefined }));
    }
  };

  const set = (values: Parameters<typeof setLandingValues>[0]) => {
    clearResult();
    dispatch(setLandingValues(values));
  };

  /** The inputs the calculation needs that are still empty: their labels are amber, and CALCULATE stays off */
  const missingInputs = {
    heading: runwayHeading === undefined && windDirection !== undefined,
    lda: runwayLength === undefined,
    elevation: elevation === undefined,
    slope: slope === undefined,
    wind: windMagnitude === undefined,
    oat: temperature === undefined,
    qnh: pressure === undefined,
    weight: weight === undefined,
  };
  const areInputsValid = () => !Object.values(missingInputs).some((missing) => missing);

  const performCalculateLanding = (): void => {
    const inputs: LandingPerformanceInputs = {
      type: computationType,
      weight,
      conf,
      goAroundConf,
      lda: runwayLength,
      elevation,
      slope,
      headwind: wind.headwind,
      crosswind: wind.crosswind,
      oat: temperature,
      qnh: pressure,
      runwayCondition,
      antiIce,
      airConditioning,
      approachType,
      goAroundGradient: Math.max(goAroundGradient ?? 0, calculator.minGoAroundGradient ?? 0),
      goAroundAltitude,
      speedIncrement,
      autoland,
      glideSlope,
      brakingMode: inFlight ? brakingMode : LandingBrakingMode.Manual,
      reverseThrust: reverseThrust && reverseAvailable,
      overweightProcedure: inFlight && overweightProcedure,
    };
    const perf = calculator.calculateLandingPerformance(inputs);
    if (perf.error === LandingPerformanceError.None) {
      dispatch(setLandingValues({ result: perf }));
      // BTV: the exits of the runway, from the airport database of the OANS
      if (features.btv && selectedRunway !== undefined && isValidIcao(icao)) {
        const key = `${icao.toUpperCase()}${selectedRunway.ident}`;
        if (runwayExits?.key !== key || runwayExits.state === 'unavailable') {
          setRunwayExits({ key, state: 'loading' });
          loadLandingRunwayExits(icao, selectedRunway.ident).then((exits) => setRunwayExits({ ...exits, key }));
        }
      }
    } else {
      dispatch(setLandingValues({ result: undefined }));
      const formatWeight = (kg: number) => Math.round(weightUnit === 'lb' ? Units.kilogramToPound(kg) : kg).toFixed(0);
      toast.error(
        subReplacements(t(`Performance.Landing.Calc.Errors.${perf.error}`), {
          mlw: formatWeight(calculator.mlw),
          mtow: formatWeight(calculator.mtow),
          oew: formatWeight(calculator.oew),
          weight_unit: weightUnit,
          max_tailwind: calculator.maxTailwind.toFixed(0),
          max_zp: calculator.maxPressureAlt.toFixed(0),
        }),
      );
    }
  };

  const handleCalculateLanding = (): void => {
    if (!areInputsValid()) {
      return;
    }
    const limit = calculator.crosswindLimit(runwayCondition, temperature);
    if (wind.crosswind > limit) {
      const replacements = { max_crosswind: limit.toFixed(0), actual_crosswind: wind.crosswind.toFixed(0) };
      showModal(
        <PromptModal
          title={subReplacements(t('Performance.Landing.Calc.CrosswindAboveLimitTitle'), replacements)}
          bodyText={subReplacements(t('Performance.Landing.Calc.CrosswindAboveLimitMessage'), replacements)}
          cancelText="No"
          confirmText="Yes"
          onConfirm={performCalculateLanding}
        />,
      );
    } else {
      performCalculateLanding();
    }
  };

  // ---------------------------------------------------------------------------------------------- data import

  const setRunway = (runways: typeof availableRunways, runwayIndex: number) => {
    const newRunway = runwayIndex >= 0 ? runways[runwayIndex] : undefined;
    return {
      availableRunways: runways,
      selectedRunwayIndex: runwayIndex,
      runwayHeading: newRunway?.magneticBearing,
      runwayLength: newRunway?.length,
      slope: newRunway !== undefined ? -Math.tan(newRunway.gradient * Avionics.Utils.DEG2RAD) * 100 : undefined,
      elevation: newRunway?.elevation,
    };
  };

  const metarValues = (parsedMetar: MetarParserType, magvar: number | null) => {
    const direction = Math.round(MathUtils.normalise360(parsedMetar.wind.degrees - (magvar ?? 0)));
    return {
      windDirection: direction,
      windMagnitude: parsedMetar.wind.speed_kts,
      windEntry: `${direction.toFixed(0).padStart(3, '0')}/${parsedMetar.wind.speed_kts.toFixed(0).padStart(2, '0')}`,
      temperature: parsedMetar.temperature.celsius,
      pressure: parsedMetar.barometer.mb,
    };
  };

  const syncValuesWithApiMetar = async (airport: string): Promise<void> => {
    if (!isValidIcao(airport)) {
      return;
    }
    let parsedMetar: MetarParserType | undefined;
    try {
      parsedMetar = parseMetar(await fetchRawMetarBySource(airport));
    } catch (err) {
      toast.error(err.message);
      return;
    }
    try {
      dispatch(setLandingValues(metarValues(parsedMetar, await getAirportMagVar(airport))));
    } catch {
      toast.error('Could not fetch airport');
    }
  };

  /**
   * The arrival data of the OFP: the one loaded in the flypad (Dashboard), otherwise the current SimBrief OFP, read for
   * the landing data only (the flypad OFP does not change).
   */
  const loadOfpArrival = async (): Promise<{
    icao: string;
    runway: string;
    metar: unknown;
    ldw: number;
    units: string;
  } | null> => {
    if (ofpArrivingAirport) {
      return {
        icao: ofpArrivingAirport,
        runway: ofpArrivingRunway,
        metar: ofpArrivingMetar,
        ldw: parseInt(ofpWeights.estLandingWeight),
        units: ofpUnits,
      };
    }
    try {
      const ofp = await getSimbriefData(
        (navigraphAuthInfo.loggedIn && navigraphAuthInfo.username) || '',
        overrideSimBriefUserID ?? '',
      );
      return {
        icao: ofp.destination.icao,
        runway: ofp.destination.runway,
        metar: ofp.destination.metar,
        ldw: parseInt(ofp.weights.estLandingWeight),
        units: ofp.units,
      };
    } catch (e) {
      console.warn('[flypad] Landing OFP import:', e);
      return null;
    }
  };

  /**
   * Fills the landing inputs from the OFP: arrival airport and runway, landing weight, and wind, OAT and QNH of the
   * arrival METAR. What is missing (runway not found, no METAR) is left to the flight crew, with a message.
   */
  const syncValuesWithOfp = async () => {
    const ofp = await loadOfpArrival();
    if (ofp === null) {
      toast.error(t('Performance.Landing.Calc.OfpNoData'));
      return;
    }
    if (!isValidIcao(ofp.icao)) {
      toast.error(t('Performance.Landing.Calc.OfpInvalidAirport'));
      return;
    }
    let runways: Awaited<ReturnType<typeof getRunways>>;
    let magvar: number | null;
    try {
      runways = await getRunways(ofp.icao);
      magvar = await getAirportMagVar(ofp.icao);
    } catch {
      toast.error(subReplacements(t('Performance.Landing.Calc.OfpNoAirport'), { icao: ofp.icao }));
      return;
    }
    // SimBrief gives an empty object instead of a METAR when it has none
    let parsedMetar: MetarParserType | undefined;
    try {
      parsedMetar = typeof ofp.metar === 'string' ? parseMetar(ofp.metar) : undefined;
    } catch {
      parsedMetar = undefined;
    }
    const runwayIndex = runways.findIndex((r) => r.ident === ofp.runway);
    dispatch(
      setLandingValues({
        icao: ofp.icao,
        result: undefined,
        ...setRunway(runways, runwayIndex),
        ...(Number.isFinite(ofp.ldw)
          ? { weight: ofp.units === 'lbs' ? Math.round(Units.poundToKilogram(ofp.ldw)) : ofp.ldw }
          : {}),
        ...(parsedMetar !== undefined ? metarValues(parsedMetar, magvar) : {}),
      }),
    );
    if (runwayIndex < 0) {
      toast.warning(
        subReplacements(t('Performance.Landing.Calc.OfpNoRunway'), { runway: ofp.runway || '---', icao: ofp.icao }),
      );
    }
    if (parsedMetar === undefined) {
      toast.warning(t('Performance.Landing.Calc.OfpNoMetar'));
    }
  };

  /** The FMS landing data: destination and runway, landing weight, and the conditions of the approach page */
  const syncValuesWithFms = async () => {
    const fms = await requestFmsLandingData(eventBus);
    if (fms === null || fms.destination === null || !isValidIcao(fms.destination)) {
      toast.error(t('Performance.Landing.Calc.FmsNoData'));
      return;
    }
    try {
      const runways = await getRunways(fms.destination);
      const runwayIndex = runways.findIndex((r) => r.ident === fms.runway);
      dispatch(
        setLandingValues({
          icao: fms.destination,
          result: undefined,
          ...setRunway(runways, runwayIndex),
          ...(fms.landingWeight !== null ? { weight: Math.round(fms.landingWeight) } : {}),
          ...(fms.qnh !== null ? { pressure: fms.qnh } : {}),
          ...(fms.oat !== null ? { temperature: fms.oat } : {}),
          ...(fms.conf !== null && (fms.conf === LandingConf.Conf3 || conf !== LandingConf.Auto)
            ? { conf: fms.conf }
            : {}),
          ...(fms.windDirection !== null && fms.windSpeed !== null
            ? {
                windDirection: fms.windDirection,
                windMagnitude: fms.windSpeed,
                windEntry: `${fms.windDirection.toFixed(0).padStart(3, '0')}/${fms.windSpeed.toFixed(0)}`,
              }
            : {}),
        }),
      );
      if (runwayIndex < 0) {
        toast.info(t('Performance.Landing.Calc.FmsNoRunway'));
      }
      if (fms.qnh === null || fms.oat === null || fms.windSpeed === null) {
        toast.info(t('Performance.Landing.Calc.FmsNoApproachData'));
      }
    } catch {
      toast.error(t('Performance.Landing.Calc.FmsNoData'));
    }
  };

  const isAutoFillIcaoValid = () => autoFillSource !== 'METAR' || isValidIcao(icao);

  const handleAutoFill = () => {
    clearResult();
    if (autoFillSource === 'METAR') {
      syncValuesWithApiMetar(icao);
    } else if (autoFillSource === 'FMS') {
      syncValuesWithFms();
    } else {
      syncValuesWithOfp();
    }
  };

  // ---------------------------------------------------------------------------------------------- inputs

  const parseNumber = (value: string, integer = false): number | undefined => {
    const n = integer ? parseInt(value) : parseFloat(value);
    return Number.isNaN(n) ? undefined : n;
  };

  const handleICAOChange = (value: string) => {
    set({ icao: value, ...setRunway([], -1) });
    if (isValidIcao(value)) {
      getRunways(value)
        .then((runways) => dispatch(setLandingValues(setRunway(runways, runways.length > 0 ? 0 : -1))))
        .catch(() => dispatch(setLandingValues(setRunway([], -1))));
    }
  };

  const handleWindChange = (input: string): void => {
    clearResult();
    if (input === '0') {
      dispatch(setLandingValues({ windMagnitude: 0, windDirection: undefined, windEntry: input }));
    } else if (isWindMagnitudeOnly(input)) {
      const match = input.match(WIND_MAGNITUDE_ONLY_REGEX);
      const magnitude = parseFloat(match[2]);
      const tailwind = match[1] === 'TL' || match[1] === 'T' || match[1] === '-';
      dispatch(
        setLandingValues({
          windMagnitude: tailwind ? -magnitude : magnitude,
          windDirection: undefined,
          windEntry: input,
        }),
      );
    } else if (isWindMagnitudeAndDirection(input)) {
      const match = input.match(WIND_MAGNITUDE_AND_DIR_REGEX);
      dispatch(
        setLandingValues({ windDirection: parseInt(match[1]), windMagnitude: parseFloat(match[2]), windEntry: input }),
      );
    } else {
      dispatch(setLandingValues({ windMagnitude: undefined, windDirection: undefined, windEntry: input }));
    }
  };

  const handleComputationTypeChange = (type: LandingComputationType) => {
    const conditions = calculator.runwayConditions(type);
    set({
      computationType: type,
      runwayCondition: conditions.includes(runwayCondition) ? runwayCondition : LandingRunwayCondition.Dry,
    });
  };

  const handleRunwayConditionChange = (condition: LandingRunwayCondition) => {
    set({ runwayCondition: condition });
    if (NOT_RECOMMENDED.includes(condition)) {
      toast.info(t('Performance.Landing.Calc.HalfInchNotRecommended'));
    }
  };

  const displayed = (value: number | undefined, imperial: boolean, toImperial: (v: number) => number) =>
    value !== undefined && imperial ? toImperial(value) : value;

  const unitSelect = <T extends string>(value: string, options: T[], onChange: (v: T) => void, width = 'w-20') => (
    <SelectInput
      fontSizeClassName="text-base"
      value={value}
      className={`${width} ml-1 ${PERF_SELECT}`}
      options={options.map((o) => ({ value: o, displayValue: o === 'C' || o === 'F' ? `°${o}` : o }))}
      onChange={(v: T) => onChange(v)}
    />
  );

  const onOff = [
    { value: false, displayValue: 'Off' },
    { value: true, displayValue: 'On' },
  ];

  // ---------------------------------------------------------------------------------------------- results

  const isEstimate = (e: LandingPerformanceEstimate) => result?.estimates.includes(e) ?? false;
  const formatWeight = (kg: number | undefined) =>
    kg === undefined ? '---.-' : ((weightUnit === 'lb' ? Units.kilogramToPound(kg) : kg) / 1000).toFixed(1);
  const weightUnitText = weightUnit === 'lb' ? 'klb' : 't';
  const formatDistance = (metres: number | undefined) =>
    metres === undefined
      ? '----'
      : Math.round(distanceUnit === 'ft' ? Units.metreToFoot(metres) : metres).toLocaleString('en-US');
  const distanceEstimated = isEstimate(LandingPerformanceEstimate.LandingDistance);
  const showGaConf =
    features.goAround && inFlight && conf === LandingConf.Conf3 && weight !== undefined && weight > calculator.mlw;

  // BTV: the exits of the runway of the results, and what BTV can achieve with them
  const exitsKey = selectedRunway !== undefined ? `${icao.toUpperCase()}${selectedRunway.ident}` : undefined;
  const exitsOfRunway = runwayExits !== undefined && runwayExits.key === exitsKey ? runwayExits : undefined;
  const btvAllowed = result?.btv !== undefined && isBtvRunwayCondition(result.inputs.runwayCondition);
  const btvExits =
    btvAllowed && exitsOfRunway?.state === 'loaded'
      ? assessBtvExits(exitsOfRunway.exits, result.btv, result.inputs.runwayCondition) ?? []
      : [];
  const btvStatusText = (): string | undefined => {
    if (selectedRunway === undefined) {
      return t('Performance.Landing.Calc.Btv.ManualRunway');
    }
    switch (exitsOfRunway?.state) {
      case 'loading':
        return t('Performance.Landing.Calc.Btv.Loading');
      case 'unavailable':
        return t('Performance.Landing.Calc.Btv.Unavailable');
      case 'no-runway':
        return t('Performance.Landing.Calc.Btv.NoRunway');
      case 'loaded':
        return exitsOfRunway.exits.length === 0 ? t('Performance.Landing.Calc.Btv.NoExits') : undefined;
      default:
        return undefined;
    }
  };

  const stops: LandingRunwayStop[] =
    result !== undefined && result.inputs.type === LandingComputationType.InFlight
      ? result.brakingDistances.map((d) => ({
          label: BRAKING_LABELS[d.mode],
          distance: d.distance,
          selected: d.mode === result.inputs.brakingMode,
          estimate: distanceEstimated,
        }))
      : result?.actualLandingDistance !== undefined
        ? [{ label: 'ALD', distance: result.actualLandingDistance, selected: true, estimate: distanceEstimated }]
        : [];

  return (
    <div className="flex h-content-section-reduced flex-col overflow-hidden text-base text-m3-text">
      {/* Airport, data sources and computation type */}
      <div className="mb-3 flex shrink-0 flex-row items-center">
        <span className="mr-2 text-sm font-semibold text-m3-muted">{t('Performance.Landing.Airport')}</span>
        <SimpleInput
          className={`mr-3 w-24 text-center uppercase ${PERF_INPUT}`}
          fontSizeClassName="text-base"
          value={icao}
          placeholder="ICAO"
          onChange={handleICAOChange}
          maxLength={4}
        />
        <PerfFillFrom
          enabled={isAutoFillIcaoValid()}
          onClick={handleAutoFill}
          source={autoFillSource}
          sources={['FMS', 'OFP', 'METAR']}
          onSource={(value: 'METAR' | 'OFP' | 'FMS') => setAutoFillSource(value)}
        />
        <div className="grow" />
        <span className="mr-3 text-sm font-semibold text-m3-muted">{t('Performance.Landing.Calc.Computation')}</span>
        <M3Segmented
          className="w-64"
          options={[LandingComputationType.Dispatch, LandingComputationType.InFlight].map((type) => ({
            label: t(`Performance.Landing.Calc.${type === LandingComputationType.Dispatch ? 'Dispatch' : 'InFlight'}`),
            selected: computationType === type,
            onClick: () => handleComputationTypeChange(type),
          }))}
        />
      </div>

      {/* Inputs */}
      <div className="mb-3 flex shrink-0 flex-row">
        <Section className="mr-3 min-w-0 flex-1" title={t('Performance.Landing.Calc.SectionRunway')}>
          <Row label={t('Performance.Landing.Runway')}>
            <SelectInput
              fontSizeClassName="text-base"
              className={`w-40 ${PERF_SELECT}`}
              defaultValue={initialState.landing.selectedRunwayIndex}
              value={selectedRunwayIndex}
              onChange={(index: number) => set(setRunway(availableRunways, index))}
              options={[
                { value: -1, displayValue: t('Performance.Landing.Calc.Manual') },
                ...availableRunways.map((r, i) => ({ value: i, displayValue: r.ident })),
              ]}
              disabled={availableRunways.length === 0}
            />
          </Row>
          <Row label={t('Performance.Landing.Calc.Heading')} missing={missingInputs.heading}>
            <SimpleInput
              className={`w-40 ${PERF_INPUT}`}
              fontSizeClassName="text-base"
              value={runwayHeading}
              placeholder="°"
              min={0}
              max={360}
              padding={3}
              decimalPrecision={0}
              onChange={(v) => set({ runwayHeading: parseNumber(v, true) })}
              number
            />
          </Row>
          <Row label={t('Performance.Landing.Calc.Lda')} missing={missingInputs.lda}>
            <div className="flex w-40 flex-row">
              <SimpleInput
                className={`w-full min-w-0 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={displayed(runwayLength, distanceUnit === 'ft', Units.metreToFoot)}
                placeholder={distanceUnit}
                min={0}
                max={distanceUnit === 'm' ? 6000 : 19685.04}
                decimalPrecision={0}
                onChange={(v) => {
                  const n = parseNumber(v, true);
                  set({ runwayLength: n !== undefined && distanceUnit === 'ft' ? Units.footToMetre(n) : n });
                }}
                number
              />
              {unitSelect(distanceUnit, ['m', 'ft'], (v) => setDistanceUnit(v), 'w-[4.5rem]')}
            </div>
          </Row>
          <Row label={t('Performance.Landing.Calc.Elevation')} missing={missingInputs.elevation}>
            <SimpleInput
              className={`w-40 ${PERF_INPUT}`}
              fontSizeClassName="text-base"
              value={elevation}
              placeholder="ft"
              min={-2000}
              max={20000}
              decimalPrecision={0}
              onChange={(v) => set({ elevation: parseNumber(v, true) })}
              number
            />
          </Row>
          <Row label={t('Performance.Landing.Calc.Slope')} missing={missingInputs.slope}>
            <SimpleInput
              className={`w-40 ${PERF_INPUT}`}
              fontSizeClassName="text-base"
              value={slope}
              placeholder="%"
              decimalPrecision={2}
              onChange={(v) => set({ slope: parseNumber(v) })}
              number
              reverse
            />
          </Row>
          {features.goAround && (
            <Row label={t('Performance.Landing.Calc.GoAroundAltitude')}>
              <SimpleInput
                className={`w-40 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={goAroundAltitude}
                placeholder={elevation !== undefined ? `${elevation} ft` : 'ft'}
                min={-2000}
                max={25000}
                decimalPrecision={0}
                onChange={(v) => set({ goAroundAltitude: parseNumber(v, true) })}
                number
              />
            </Row>
          )}
        </Section>

        <Section className="mr-3 min-w-0 flex-1" title={t('Performance.Landing.Calc.SectionConditions')}>
          <Row label={t('Performance.Landing.Calc.Condition')}>
            <SelectInput
              fontSizeClassName="text-base"
              className={`w-48 whitespace-nowrap ${PERF_SELECT}`}
              value={runwayCondition}
              onChange={(v: LandingRunwayCondition) => handleRunwayConditionChange(v)}
              options={runwayConditions.map((c) => ({
                value: c,
                displayValue: t(`Performance.Landing.Calc.Conditions.${c}`),
              }))}
            />
          </Row>
          <Row label={t('Performance.Landing.Wind')} missing={missingInputs.wind} note={windNote}>
            <SimpleInput
              className={`w-40 ${PERF_INPUT}`}
              fontSizeClassName="text-base"
              value={windEntry}
              placeholder="°/kt"
              onChange={handleWindChange}
              uppercase
              wind
            />
          </Row>
          <Row
            label={t('Performance.Landing.Calc.Oat')}
            missing={missingInputs.oat}
            note={isaDeviation !== undefined ? `ISA ${isaDeviation >= 0 ? '+' : ''}${isaDeviation}` : undefined}
          >
            <div className="flex w-40 flex-row">
              <SimpleInput
                className={`w-full min-w-0 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={displayed(temperature, temperatureUnit === 'F', Units.celsiusToFahrenheit)}
                placeholder={`°${temperatureUnit}`}
                decimalPrecision={1}
                onChange={(v) => {
                  const n = parseNumber(v);
                  set({ temperature: n !== undefined && temperatureUnit === 'F' ? Units.fahrenheitToCelsius(n) : n });
                }}
                number
              />
              {unitSelect(temperatureUnit, ['C', 'F'], (v) => setTemperatureUnit(v), 'w-[4.5rem]')}
            </div>
          </Row>
          <Row label={t('Performance.Landing.Qnh')} missing={missingInputs.qnh}>
            <div className="flex w-40 flex-row">
              <SimpleInput
                className={`w-full min-w-0 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={displayed(pressure, pressureUnit === 'inHg', Units.hectopascalToInchOfMercury)}
                placeholder={pressureUnit}
                min={pressureUnit === 'hPa' ? 800 : 23.624}
                max={pressureUnit === 'hPa' ? 1200 : 35.43598}
                decimalPrecision={2}
                onChange={(v) => {
                  const n = parseNumber(v);
                  set({
                    pressure: n !== undefined && pressureUnit === 'inHg' ? Units.inchOfMercuryToHectopascal(n) : n,
                  });
                }}
                number
              />
              {unitSelect(pressureUnit, ['hPa', 'inHg'], (v) => setPressureUnit(v), 'w-[5.25rem]')}
            </div>
          </Row>
          {features.antiIce && (
            <Row label={t('Performance.Landing.Calc.AntiIce')}>
              <SelectInput
                fontSizeClassName="text-base"
                className={`w-40 ${PERF_SELECT}`}
                value={antiIce}
                onChange={(v: LandingAntiIce) => set({ antiIce: v })}
                options={[
                  { value: LandingAntiIce.Off, displayValue: 'Off' },
                  { value: LandingAntiIce.Engine, displayValue: 'Engine' },
                  { value: LandingAntiIce.EngineWing, displayValue: 'Eng & Wing' },
                ]}
              />
            </Row>
          )}
          {features.airConditioning && (
            <Row label={t('Performance.Landing.Calc.AirConditioning')}>
              <SelectInput
                fontSizeClassName="text-base"
                className={`w-40 ${PERF_SELECT}`}
                value={airConditioning}
                onChange={(v: boolean) => set({ airConditioning: v })}
                options={onOff}
              />
            </Row>
          )}
        </Section>

        <Section
          className="mr-3 min-w-0 flex-1"
          title={t('Performance.Landing.Calc.SectionAircraft')}
          action={
            // The maximum landing weight as the landing weight
            <M3ActionChip className="!h-6 !px-2 !text-xs" onClick={() => set({ weight: calculator.mlw })}>
              MLW
            </M3ActionChip>
          }
        >
          <Row label={t('Performance.Landing.Calc.Lw')} missing={missingInputs.weight}>
            <div className="flex w-40 flex-row">
              {/* In tonnes or thousands of pounds, as the LW of the FMS and of the results: 56.0, 386.0 */}
              <SimpleInput
                className={`w-full min-w-0 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={
                  weight !== undefined
                    ? Math.round((weightUnit === 'lb' ? Units.kilogramToPound(weight) : weight) / 100) / 10
                    : undefined
                }
                placeholder={weightUnitText}
                decimalPrecision={1}
                onChange={(v) => {
                  const n = parseNumber(v);
                  set({
                    weight:
                      n !== undefined
                        ? Math.round(weightUnit === 'lb' ? Units.poundToKilogram(n * 1000) : n * 1000)
                        : n,
                  });
                }}
                number
              />
              {unitSelect(weightUnitText, ['t', 'klb'], (v) => setWeightUnit(v === 'klb' ? 'lb' : 'kg'), 'w-[4.5rem]')}
            </div>
          </Row>
          <Row label={t('Performance.Landing.Calc.LandingConf')}>
            <SelectInput
              fontSizeClassName="text-base"
              className={`w-40 ${PERF_SELECT}`}
              value={conf}
              onChange={(v: LandingConf) => set({ conf: v })}
              options={[
                ...(features.autoConf ? [{ value: LandingConf.Auto, displayValue: 'AUTO CONF' }] : []),
                { value: LandingConf.Full, displayValue: 'CONF FULL' },
                { value: LandingConf.Conf3, displayValue: 'CONF 3' },
              ]}
            />
          </Row>
          {showGaConf && (
            <Row label={t('Performance.Landing.Calc.GoAroundConf')}>
              <SelectInput
                fontSizeClassName="text-base"
                className={`w-40 ${PERF_SELECT}`}
                value={goAroundConf ?? LandingGoAroundConf.Conf2}
                onChange={(v: LandingGoAroundConf) => set({ goAroundConf: v })}
                options={[
                  { value: LandingGoAroundConf.Conf2, displayValue: 'CONF 2' },
                  { value: LandingGoAroundConf.Conf1F, displayValue: 'CONF 1+F' },
                ]}
              />
            </Row>
          )}
          {features.approachType && (
            <Row label={t('Performance.Landing.Calc.ApproachType')}>
              <SelectInput
                fontSizeClassName="text-base"
                className={`w-40 ${PERF_SELECT}`}
                value={approachType}
                onChange={(v: LandingApproachType) => set({ approachType: v })}
                options={[
                  { value: LandingApproachType.Normal, displayValue: 'Normal' },
                  { value: LandingApproachType.Cat2, displayValue: 'CAT II / III' },
                ]}
              />
            </Row>
          )}
          {features.goAround && (
            <Row label={t('Performance.Landing.Calc.GoAroundGradient')}>
              <SimpleInput
                className={`w-40 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={goAroundGradient}
                placeholder={`MIN ${calculator.minGoAroundGradient} %`}
                min={calculator.minGoAroundGradient}
                max={20}
                decimalPrecision={1}
                onChange={(v) => set({ goAroundGradient: parseNumber(v) })}
                number
              />
            </Row>
          )}
          <Row label={t('Performance.Landing.Calc.SpeedIncrement')}>
            <SimpleInput
              className={`w-40 ${PERF_INPUT}`}
              fontSizeClassName="text-base"
              value={speedIncrement}
              placeholder={
                wind !== undefined
                  ? `${calculator.windIncrement(wind.headwind)} kt (${t('Performance.Landing.Wind')})`
                  : 'kt'
              }
              min={0}
              max={40}
              decimalPrecision={0}
              onChange={(v) => set({ speedIncrement: parseNumber(v, true) })}
              number
            />
          </Row>
        </Section>

        <Section className="min-w-0 flex-1" title={t('Performance.Landing.Calc.SectionLanding')}>
          <Row label={t('Performance.Landing.Calc.Technique')}>
            <SelectInput
              fontSizeClassName="text-base"
              className={`w-40 ${PERF_SELECT}`}
              value={autoland}
              onChange={(v: boolean) => set({ autoland: v })}
              options={[
                { value: false, displayValue: t('Performance.Landing.Calc.Manual') },
                { value: true, displayValue: t('Performance.Landing.AutoLand') },
              ]}
            />
          </Row>
          {autoland && (
            <Row label={t('Performance.Landing.Calc.GlideSlope')}>
              <SimpleInput
                className={`w-40 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={glideSlope}
                placeholder="°"
                min={2.5}
                max={4.5}
                decimalPrecision={1}
                onChange={(v) => set({ glideSlope: parseNumber(v) ?? 3 })}
                number
              />
            </Row>
          )}
          <Row label={t('Performance.Landing.Calc.BrakingMode')}>
            <SelectInput
              fontSizeClassName="text-base"
              className={`w-40 ${PERF_SELECT}`}
              value={inFlight ? brakingMode : LandingBrakingMode.Manual}
              onChange={(v: LandingBrakingMode) => set({ brakingMode: v })}
              options={calculator.brakingModes().map((m) => ({
                value: m,
                displayValue:
                  m === LandingBrakingMode.Manual ? t('Performance.Landing.Calc.ManualBraking') : BRAKING_LABELS[m],
              }))}
              disabled={!inFlight}
            />
          </Row>
          <Row label={t('Performance.Landing.ReverseThrust')}>
            <div className={reverseAvailable ? '' : 'pointer-events-none opacity-40'}>
              <M3Switch value={reverseThrust && reverseAvailable} onToggle={(v) => set({ reverseThrust: v })} />
            </div>
          </Row>
          {features.overweightProcedure && inFlight && (
            <Row label={t('Performance.Landing.OverweightProcedure')}>
              <M3Switch value={overweightProcedure} onToggle={(v) => set({ overweightProcedure: v })} />
            </Row>
          )}
        </Section>
      </div>

      {/* Results, landing roll and actions */}
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <div className="mr-3 flex h-full w-[32.5rem] shrink-0 flex-col">
          <ResultsPanel
            result={result}
            runway={selectedRunway?.ident}
            isEstimate={isEstimate}
            formatWeight={formatWeight}
            weightUnit={weightUnitText}
            formatDistance={formatDistance}
            distanceUnit={distanceUnit}
            goAround={features.goAround}
            brakingLabel={result ? BRAKING_LABELS[result.inputs.brakingMode] : ''}
          />
          <div className="mt-3 flex shrink-0 flex-row">
            <M3Button className="mr-2 !h-12 flex-1" disabled={!areInputsValid()} onClick={handleCalculateLanding}>
              <Calculator size={20} />
              <span className="text-base text-current">{t('Performance.Landing.Calculate')}</span>
            </M3Button>
            <M3Button tone="danger" className="!h-12" onClick={() => dispatch(clearLandingValues())}>
              <Trash size={20} />
              <span className="text-base text-current">{t('Performance.Landing.Clear')}</span>
            </M3Button>
          </div>
        </div>

        <M3Card className="h-full min-w-0 flex-1 px-4 py-3">
          <div className="flex shrink-0 flex-row items-center">
            <PerfTitle>{t('Performance.Landing.Calc.LandingRoll')}</PerfTitle>
            <div className="grow" />
            {result !== undefined && (
              <>
                <span className="mr-4 text-sm text-m3-muted">
                  {`${t('Performance.Landing.Calc.Available')} `}
                  <span className="text-sm font-bold text-m3-text">
                    {`${formatDistance(result.inputs.lda)} ${distanceUnit}`}
                  </span>
                </span>
                <span className="text-sm text-m3-muted">
                  {`${t('Performance.Landing.Calc.Crosswind')} `}
                  <span
                    className={`text-sm font-bold ${
                      result.inputs.crosswind >
                      calculator.crosswindLimit(result.inputs.runwayCondition, result.inputs.oat)
                        ? 'text-m3-on-error'
                        : 'text-m3-text'
                    }`}
                  >
                    {`${Math.round(result.inputs.crosswind)} / ${calculator.crosswindLimit(result.inputs.runwayCondition, result.inputs.oat)} kt`}
                  </span>
                </span>
              </>
            )}
          </div>
          <div className="mt-2 min-h-0 flex-1">
            {result !== undefined ? (
              <LandingRunway
                ident={selectedRunway?.ident}
                lda={result.inputs.lda}
                airDistance={result.airDistance}
                stops={stops}
                required={
                  result.inputs.type === LandingComputationType.Dispatch && result.landingDistance !== undefined
                    ? { distance: result.landingDistance, estimate: distanceEstimated }
                    : undefined
                }
                distanceUnit={distanceUnit === 'ft' ? 'ft' : 'm'}
                btv={btvAllowed ? { lines: result.btv, exits: btvExits } : undefined}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-base text-m3-muted">
                {t('Performance.Landing.Calc.NoResult')}
              </div>
            )}
          </div>
          {/* BTV: the exits the flight crew can select on the OANS (A380 FCOM PRO-NOR-SOP-160, runway exit) */}
          {features.btv && result !== undefined && (
            <div className="mb-1 flex shrink-0 flex-col">
              <div>
                <span className="mr-3 text-xs font-bold uppercase tracking-widest text-m3-muted">BTV</span>
                {!btvAllowed ? (
                  <span className="text-sm text-m3-on-warn">{t('Performance.Landing.Calc.Btv.Contaminated')}</span>
                ) : (
                  <>
                    <span className="mr-3 text-sm text-[#ff94ff]">
                      {`DRY ${formatDistance(result.btv.dry)} ${distanceUnit} · WET ${formatDistance(result.btv.wet)} ${distanceUnit}`}
                    </span>
                    {btvStatusText() !== undefined && <span className="text-sm text-m3-muted">{btvStatusText()}</span>}
                  </>
                )}
              </div>
              {/* One row per group, from the threshold: an exit, its distance from the threshold */}
              {(
                [
                  [[BtvExitStatus.Recommended, BtvExitStatus.BeyondWet], 'WetOrDry', 'text-m3-on-primary-container'],
                  [[BtvExitStatus.DryOnly], 'DryOnly', 'text-m3-on-warn'],
                  [[BtvExitStatus.NotAchievable], 'NotAchievable', 'text-m3-on-error'],
                ] as const
              ).map(([statuses, label, colour]) => {
                const exits = btvExits.filter((e) => (statuses as readonly BtvExitStatus[]).includes(e.status));
                return (
                  exits.length > 0 && (
                    <div key={label}>
                      <span className={`mr-2 text-xs font-bold uppercase ${colour}`}>
                        {t(`Performance.Landing.Calc.Btv.${label}`)}
                      </span>
                      {exits.map((e, index) => (
                        <span
                          key={`${e.name}${e.distance}`}
                          className={`text-sm ${colour} ${e.status === BtvExitStatus.Recommended ? 'font-bold' : ''}`}
                        >
                          {index > 0 ? ', ' : ''}
                          {e.name} {formatDistance(e.distance)}
                          {e.status === BtvExitStatus.Recommended
                            ? ` ◀ ${t('Performance.Landing.Calc.Btv.Recommended')}`
                            : ''}
                        </span>
                      ))}
                    </div>
                  )
                );
              })}
            </div>
          )}
          <span className="shrink-0 text-xs leading-tight text-m3-muted">
            {t(isA380 ? 'Performance.Landing.Calc.RunwayLegend' : 'Performance.Landing.Calc.RunwayLegendA320')}
          </span>
        </M3Card>
      </div>
    </div>
  );
};

interface ResultsPanelProps {
  result: LandingPerformanceResult | undefined;
  runway: string | undefined;
  isEstimate: (e: LandingPerformanceEstimate) => boolean;
  formatWeight: (kg: number | undefined) => string;
  weightUnit: string;
  formatDistance: (metres: number | undefined) => string;
  distanceUnit: string;
  /** The aircraft data has the go-around gradient */
  goAround: boolean;
  brakingLabel: string;
}

/**
 * The results in the layout of the RESULTS panel of the Airbus landing performance application (A380 FCOM
 * PER-LND-LRD-DSR, PER-LND-LRF-FSR), with the data of its MORE panel below.
 */
const ResultsPanel = ({
  result,
  runway,
  isEstimate,
  formatWeight,
  weightUnit,
  formatDistance,
  distanceUnit,
  goAround,
  brakingLabel,
}: ResultsPanelProps) => {
  const dispatchType = result?.inputs.type === LandingComputationType.Dispatch;
  const distanceEstimate = isEstimate(LandingPerformanceEstimate.LandingDistance);
  const limited = result !== undefined && result.limitation !== LandingLimitation.Weight;
  const overrun = result?.stopMargin !== undefined && result.stopMargin < 0;
  const flaps = result?.conf === LandingConf.Conf3 ? '3' : result?.conf === LandingConf.Full ? 'FULL' : '---';
  let distanceName = t('Performance.Landing.Calc.LdgDist');
  if (dispatchType) {
    distanceName = t('Performance.Landing.Calc.RegulatoryLdgDist');
  } else if (result?.factoredLandingDistance !== undefined) {
    distanceName = t('Performance.Landing.Calc.FactoredLdgDist');
  }
  return (
    <M3Card low className="min-h-0 flex-1 px-4 py-3">
      <div className="mb-2 flex shrink-0 flex-row items-center">
        <PerfTitle>{t('Performance.Landing.Calc.Results')}</PerfTitle>
        {result?.overweight && (
          <span className="ml-3 rounded-full bg-m3-warn-container px-3 py-1 text-xs font-bold leading-none text-m3-on-warn">
            {t('Performance.Landing.Calc.OverweightLanding')}
          </span>
        )}
        <div className="grow" />
        <span className="rounded-full bg-m3-tile px-3 py-1 text-xs font-bold leading-none text-m3-text">
          {`RWY ${runway ?? '---'} · FLAPS ${flaps}${result?.inputs.type === LandingComputationType.InFlight ? ` · BRK ${brakingLabel}` : ''}`}
        </span>
      </div>
      <PerfResultRow className="mb-2">
        <PerfResult name={distanceName}>
          <Value
            text={formatDistance(result?.landingDistance)}
            unit={distanceUnit}
            estimate={result?.landingDistance !== undefined && distanceEstimate}
            warning={overrun}
            primary
            big
          />
        </PerfResult>
        <PerfResult name={t('Performance.Landing.Calc.StopMargin')}>
          <Value
            text={formatDistance(result?.stopMargin)}
            unit={distanceUnit}
            estimate={result?.stopMargin !== undefined && distanceEstimate}
            warning={overrun}
            big
          />
        </PerfResult>
        <PerfResult name="VAPP">
          <Value text={result !== undefined ? Math.round(result.vapp).toFixed(0) : '---'} unit="kt" big />
          <span className="text-xs leading-tight text-m3-muted">
            {result !== undefined ? `VLS ${Math.round(result.vls)} + ${result.speedIncrement}` : ''}
          </span>
        </PerfResult>
      </PerfResultRow>
      <PerfResultRow className="mb-2">
        <PerfResult name="LW">
          <Value text={formatWeight(result?.inputs.weight)} unit={weightUnit} />
        </PerfResult>
        <PerfResult name="MLW(perf)">
          <Value
            text={formatWeight(result?.mlwPerf)}
            unit={weightUnit}
            estimate={result?.mlwPerf !== undefined && isEstimate(LandingPerformanceEstimate.MlwPerf)}
          />
        </PerfResult>
        <PerfResult name={t('Performance.Landing.Calc.LimitationCode')}>
          <Value text={result?.limitation ?? '---'} warning={limited} />
        </PerfResult>
      </PerfResultRow>
      {goAround && (
        <PerfResultRow className="mb-2">
          <PerfResult name={t('Performance.Landing.Calc.GaSpeed')}>
            <Value text={result?.goAroundSpeed !== undefined ? result.goAroundSpeed.toFixed(0) : '---'} unit="kt" />
          </PerfResult>
          <PerfResult name={t('Performance.Landing.Calc.GaGradient')}>
            <Value
              text={result?.goAroundGradient !== undefined ? result.goAroundGradient.toFixed(1) : '-.-'}
              unit="%"
              estimate={
                result?.goAroundGradient !== undefined && isEstimate(LandingPerformanceEstimate.GoAroundGradient)
              }
              warning={result !== undefined && result.goAroundGradient < result.inputs.goAroundGradient}
            />
          </PerfResult>
          <div className="min-w-0 flex-1" />
        </PerfResultRow>
      )}
      <div className="grow" />
      {/* MORE panel */}
      <span className="shrink-0 text-xs leading-tight text-m3-muted">
        {result !== undefined
          ? `ALD ${formatDistance(result.actualLandingDistance)} ${distanceUnit} · Vwind ${result.windIncrement} kt · ${
              result.goAroundConf !== undefined
                ? `GA CONF ${{ CONF_3: '3', CONF_2: '2', CONF_1F: '1+F' }[result.goAroundConf]} · `
                : ''
            }${t(result.reverseCredit ? 'Performance.Landing.Calc.ReverseCredit' : 'Performance.Landing.Calc.NoReverseCredit')}`
          : ''}
      </span>
    </M3Card>
  );
};
