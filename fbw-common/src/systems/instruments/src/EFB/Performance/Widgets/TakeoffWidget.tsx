// @ts-strict-ignore
// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useContext, useEffect, useState } from 'react';
import {
  LineupAngle,
  MathUtils,
  MetarParserType,
  parseMetar,
  RunwayCondition,
  TakeoffAntiIceSetting,
  TakeoffPerfomanceError,
  Units,
  usePersistentProperty,
  AirframeType,
} from '@flybywiresim/fbw-sdk-react';
import {
  CompanyTakeoffDataUplink,
  getSimbriefData,
  TakeoffPerformanceEstimate,
  TakeoffPerformanceResult,
  TakeoffRunwayDistances,
} from '@flybywiresim/fbw-sdk';
import { useEventBus } from '@flybywiresim/flypad';
import { toast } from 'react-toastify';
import Slider from 'rc-slider';
import { Calculator, CloudArrowDown, Send, Trash } from 'react-bootstrap-icons';
import { getAirportMagVar, getRunways } from '../Data/Runways';
import { t } from '../../Localization/translation';
import { TooltipWrapper } from '../../UtilComponents/TooltipWrapper';
import { PromptModal, useModals } from '../../UtilComponents/Modals/Modals';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { SelectInput } from '../../UtilComponents/Form/SelectInput/SelectInput';
import { SelectGroup, SelectItem } from '../../UtilComponents/Form/Select';
import { Toggle } from '../../UtilComponents/Form/Toggle';
import { useAppDispatch, useAppSelector } from '../../Store/store';
import { clearTakeoffValues, initialState, setTakeoffValues } from '../../Store/features/performance';
import { AircraftContext } from '../../AircraftContext';
import { useNavigraphAuthInfo } from '../../Apis/Navigraph/Components/Authentication';
import {
  isValidIcao,
  isWindMagnitudeAndDirection,
  isWindMagnitudeOnly,
  WIND_MAGNITUDE_AND_DIR_REGEX,
  WIND_MAGNITUDE_ONLY_REGEX,
} from '../Data/Utils';
import { fetchRawMetarBySource } from '../../Service/WeatherService';
import { CompanyTakeoffRequests, requestFmsTakeoffData, sendTakeoffDataToFms } from './TakeoffFmsLink';
import { TakeoffRunway } from './TakeoffRunway';

/** What differs between the aircraft */
interface CalculatorProfile {
  /** The FMS inserts uplinked takeoff data for a TOW from this much below to this much above its own TOW, in kg */
  fmsTowMarginBelow: number;
  fmsTowMarginAbove: number;
  /** The FMS takes noise procedure parameters */
  noise: boolean;
  /** The FMS insertion needs the T.O CG */
  fmsNeedsCg: boolean;
  /** Text keys */
  sentToFms: string;
  resultsLegend: string;
  runwayLegend: string;
}

const PROFILES: Record<'A380' | 'A320', CalculatorProfile> = {
  A380: {
    // A380 FCOM DSC-22-FMS-20-30 P 316-319: TOW 2 t below to 7 t above the FMS one, T.O CG needed, noise parameters
    fmsTowMarginBelow: 2_000,
    fmsTowMarginAbove: 7_000,
    noise: true,
    fmsNeedsCg: true,
    sentToFms: 'Performance.Takeoff.Calc.SentToFms',
    resultsLegend: 'Performance.Takeoff.Calc.EstimateLegend',
    runwayLegend: 'Performance.Takeoff.Calc.RunwayLegend',
  },
  A320: {
    // A320 FCOM DSC-22_20-50-10-28 P 93: no insertion when the uplink TOW is 3 t greater or 1 t lower than the FMS one
    fmsTowMarginBelow: 1_000,
    fmsTowMarginAbove: 3_000,
    noise: false,
    fmsNeedsCg: false,
    sentToFms: 'Performance.Takeoff.Calc.SentToFmsA320',
    resultsLegend: 'Performance.Takeoff.Calc.LegendA320',
    runwayLegend: 'Performance.Takeoff.Calc.RunwayLegendA320',
  },
};

/** A320 FCOM PER-LOD-WBA-LTS: performance at forward CG must be used for an operational CG lower than 27 % */
const A320_FORWARD_CG_LIMIT = 27;

/** The runway conditions of the FMS lists (A380 MFD and A320 MCDU): DRY, WET, 1/4 WATER, 1/2 WATER, 1/4 SLUSH, 1/2 SLUSH,
 * COMP SNOW; wet snow as the slush of the same depth, and dry snow as compacted snow */
const FMS_RUNWAY_CONDITION: Record<RunwayCondition, number> = {
  [RunwayCondition.Dry]: 0,
  [RunwayCondition.Wet]: 1,
  [RunwayCondition.Contaminated6mmWater]: 2,
  [RunwayCondition.Contaminated13mmWater]: 3,
  [RunwayCondition.Contaminated6mmSlush]: 4,
  [RunwayCondition.Contaminated13mmSlush]: 5,
  [RunwayCondition.ContaminatedCompactedSnow]: 6,
  [RunwayCondition.Contaminated5mmWetSnow]: 4,
  [RunwayCondition.Contaminated15mmWetSnow]: 5,
  [RunwayCondition.Contaminated30mmWetSnow]: 5,
  [RunwayCondition.Contaminated10mmDrySnow]: 6,
  [RunwayCondition.Contaminated100mmDrySnow]: 6,
};

const RUNWAY_CONDITIONS: RunwayCondition[] = [
  RunwayCondition.Dry,
  RunwayCondition.Wet,
  RunwayCondition.Contaminated6mmWater,
  RunwayCondition.Contaminated13mmWater,
  RunwayCondition.Contaminated6mmSlush,
  RunwayCondition.Contaminated13mmSlush,
  RunwayCondition.ContaminatedCompactedSnow,
  RunwayCondition.Contaminated5mmWetSnow,
  RunwayCondition.Contaminated15mmWetSnow,
  RunwayCondition.Contaminated30mmWetSnow,
  RunwayCondition.Contaminated10mmDrySnow,
  RunwayCondition.Contaminated100mmDrySnow,
];

const Section: FC<{ title: string }> = ({ title, children }) => (
  <div className="flex flex-col rounded-md border-2 border-theme-accent px-3 pb-3 pt-1.5">
    <h2 className="mb-1.5 text-base font-bold uppercase tracking-wider text-theme-unselected">{title}</h2>
    <div className="flex flex-col space-y-2">{children}</div>
  </div>
);

const Row: FC<{ label: string }> = ({ label, children }) => (
  <div className="flex h-10 flex-row items-center justify-between">
    <span className="mr-2 whitespace-nowrap text-theme-text">{label}</span>
    {children}
  </div>
);

/** A value of the results panel: green, or amber with an asterisk for an estimate, with its unit in cyan */
const Value: FC<{ text: string; unit?: string; estimate?: boolean; big?: boolean }> = ({
  text,
  unit,
  estimate,
  big,
}) => (
  <span className={big ? 'text-3xl' : 'text-2xl'}>
    <span className={estimate ? 'text-utility-amber' : 'text-utility-green'}>
      {text}
      {estimate ? '*' : ''}
    </span>
    {unit && <span className="ml-1.5 text-xl text-theme-highlight">{unit}</span>}
  </span>
);

/**
 * The takeoff calculator of the A380X and the A32NX, with the results in the layout of the RESULTS panel of the Airbus
 * takeoff performance application (A380 FCOM PER-TOF-TOR-SRS P 1), the takeoff run on the runway at TOGA or at any FLEX
 * temperature of the possible range (A380 FCOM PER-TOF-THR-FLX, range of TFLEX), and the takeoff data exchange with the
 * FMS: company takeoff data of the A380 MFD (FCOM DSC-22-FMS-20-30), uplink takeoff data of the A320 MCDU (FCOM
 * DSC-22_20-50-10-28, UPLINK TO DATA pages).
 */
export const TakeoffWidget = () => {
  const dispatch = useAppDispatch();
  const calculator = useContext(AircraftContext).performanceCalculators.takeoff;
  const datalinkDelay = useContext(AircraftContext).settingsPages.realism.companyDatalinkReplyTime;
  const isA380 = useAppSelector((state) => state.config.airframeInfo.variant) === AirframeType.A380_842;
  const profile = PROFILES[isA380 ? 'A380' : 'A320'];
  const eventBus = useEventBus();
  const { showModal } = useModals();
  const { usingMetric } = Units;

  const [autoFillSource, setAutoFillSource] = useState<'METAR' | 'OFP' | 'FMS'>('FMS');
  const [realDataOnly, setRealDataOnly] = useState<boolean>(calculator?.realDataOnly ?? false);

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
  // The airline policy heights of the flypad settings, also the FMS defaults
  const [thrustReductionHeight] = usePersistentProperty('CONFIG_THR_RED_ALT', '1500');
  const [accelerationHeight] = usePersistentProperty('CONFIG_ACCEL_ALT', '1500');
  const [engineOutAccelerationHeight] = usePersistentProperty('CONFIG_ENG_OUT_ACCEL_ALT', '1500');

  const {
    icao,
    availableRunways,
    selectedRunwayIndex,
    runwayBearing,
    runwayLength,
    elevation,
    runwaySlope,
    lineupAngle,
    windDirection,
    windMagnitude,
    windEntry,
    oat,
    qnh,
    weight,
    config,
    antiIce,
    packs,
    forceToga,
    runwayCondition,
    cg,
    thrustReductionAltitude,
    accelerationAltitude,
    engineOutAccelerationAltitude,
    noiseEnabled,
    noiseEndAltitude,
    noiseSpeed,
    noiseN1,
    selectedFlex,
    result,
    togaResult,
  } = useAppSelector((state) => state.performance.takeoff);

  const {
    departingAirport: ofpDepartingAirport,
    departingMetar: ofpDepartingMetar,
    departingRunway: ofpDepartingRunway,
    weights: ofpWeights,
    units: ofpUnits,
  } = useAppSelector((state) => state.simbrief.data);
  const navigraphAuthInfo = useNavigraphAuthInfo();
  const [overrideSimBriefUserID] = usePersistentProperty('CONFIG_OVERRIDE_SIMBRIEF_USERID');

  const selectedRunway =
    selectedRunwayIndex !== undefined && selectedRunwayIndex >= 0 ? availableRunways[selectedRunwayIndex] : undefined;

  /** Takeoff shift in metres: the runway length behind the entered TORA (an intersection takeoff) */
  const takeoffShift =
    selectedRunway !== undefined && runwayLength !== undefined && selectedRunway.length > runwayLength + 0.5
      ? selectedRunway.length - runwayLength
      : undefined;

  /** The FMS default altitudes: the runway elevation plus the airline policy height, to 10 ft */
  const policyAltitude = (height: string) =>
    elevation !== undefined ? Math.round((elevation + (parseInt(height) || 1500)) / 10) * 10 : undefined;
  const thrRed = thrustReductionAltitude ?? policyAltitude(thrustReductionHeight);
  const accel = accelerationAltitude ?? policyAltitude(accelerationHeight);
  const eoAccel = engineOutAccelerationAltitude ?? policyAltitude(engineOutAccelerationHeight);

  // The FMS takeoff data requests (SEND T.O REQUEST) that arrive while the calculator is open
  useEffect(
    () =>
      CompanyTakeoffRequests.subscribe((request) =>
        toast.info(
          t('Performance.Takeoff.Calc.FmsRequestReceived').replace('{runway}', request.runways[0]?.runway ?? '---'),
        ),
      ),
    [],
  );

  const isContaminated = (condition: RunwayCondition) =>
    condition !== RunwayCondition.Dry && condition !== RunwayCondition.Wet;

  const subReplacements = (msg: string, replacements: Record<string, string>): string =>
    msg.replace(/\{([a-z_]+)\}/g, (m) => replacements[m.substring(1, m.length - 1)] ?? m[1]);

  const clearResult = () => {
    if (result !== undefined || selectedFlex !== undefined) {
      dispatch(setTakeoffValues({ result: undefined, togaResult: undefined, selectedFlex: undefined }));
    }
  };

  /** The aircraft CG at its current weight (the flypad load), the takeoff CG before taxi */
  const aircraftCg = (): number | undefined => {
    const gwCg = SimVar.GetSimVarValue('L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC', 'number');
    return gwCg > 0 ? Math.round(gwCg * 10) / 10 : undefined;
  };

  // ---------------------------------------------------------------------------------------------- calculation

  const performCalculateTakeoff = (headwind: number): void => {
    // The maximum FLEX is always calculated when FLEX is permitted (not on a contaminated runway, A380 FCOM
    // PER-TOF-THR-FLX), so that the takeoff run can show TOGA and any FLEX: the Thrust input is only its first choice
    const args = (toga: boolean) =>
      [
        runwayLength,
        runwaySlope,
        lineupAngle,
        headwind,
        elevation,
        qnh,
        oat,
        antiIce,
        packs,
        toga,
        runwayCondition,
        cg,
      ] as const;
    const forwardCg = !isA380 && cg !== undefined && cg < A320_FORWARD_CG_LIMIT;
    const perf =
      config > 0
        ? calculator.calculateTakeoffPerformance(weight, forwardCg, config, ...args(isContaminated(runwayCondition)))
        : calculator.calculateTakeoffPerformanceOptConf(weight, forwardCg, ...args(isContaminated(runwayCondition)));
    // The A320 TOGA speeds differ from the FLEX ones (FBW A320 performance model): a TOGA calculation too
    const togaPerf =
      !isA380 && perf.error === TakeoffPerfomanceError.None
        ? calculator.calculateTakeoffPerformance(weight, forwardCg, perf.inputs.conf, ...args(true))
        : undefined;

    const formatWeight = (kg: number | undefined): string =>
      kg !== undefined ? Math.floor(weightUnit === 'lb' ? Units.kilogramToPound(kg) : kg).toFixed(0) : '-';
    const replacements = {
      mtow: formatWeight(perf.mtow),
      weight_unit: weightUnit,
      oew: formatWeight(calculator.oew),
      structural_mtow: formatWeight(calculator.structuralMtow),
      max_zp: calculator.maxPressureAlt.toFixed(0),
      max_headwind: calculator.maxHeadwind.toFixed(0),
      max_tailwind: calculator.maxTailwind.toFixed(0),
      tmax: perf.params?.tMax?.toFixed(0) ?? '-',
    };

    if (perf.error === TakeoffPerfomanceError.None) {
      dispatch(
        setTakeoffValues({
          result: perf,
          togaResult: togaPerf?.error === TakeoffPerfomanceError.None ? togaPerf : undefined,
          selectedFlex: forceToga ? null : undefined,
        }),
      );
      if (!forceToga && perf.flex === undefined) {
        toast.info(
          realDataOnly
            ? t('Performance.Takeoff.Calc.RealDataOnlyNoFlex')
            : t('Performance.Takeoff.Messages.FlexNotPossible'),
        );
      }
    } else {
      dispatch(setTakeoffValues({ result: undefined, togaResult: undefined, selectedFlex: undefined }));
      toast.error(subReplacements(t(`Performance.Takeoff.Messages.${perf.error}`), replacements));
    }
  };

  const areInputsValid = (): boolean =>
    windMagnitude !== undefined &&
    weight !== undefined &&
    runwayBearing !== undefined &&
    elevation !== undefined &&
    runwaySlope !== undefined &&
    oat !== undefined &&
    qnh !== undefined &&
    runwayLength !== undefined;

  const handleCalculateTakeoff = (): void => {
    if (!areInputsValid()) {
      return;
    }
    const angle = windDirection === undefined ? 0 : Math.abs(Avionics.Utils.diffAngle(runwayBearing, windDirection));
    const headwind = windMagnitude * Math.cos(angle * Avionics.Utils.DEG2RAD);
    const crosswind = windDirection === undefined ? 0 : windMagnitude * Math.sin(angle * Avionics.Utils.DEG2RAD);
    const crosswindLimit = calculator.getCrosswindLimit(runwayCondition, oat);
    if (crosswind > crosswindLimit) {
      const replacements = { max_crosswind: crosswindLimit.toFixed(0), actual_crosswind: crosswind.toFixed(0) };
      showModal(
        <PromptModal
          title={subReplacements(t('Performance.Takeoff.CrosswindAboveLimitTitle'), replacements)}
          bodyText={subReplacements(t('Performance.Takeoff.CrosswindAboveLimitMessage'), replacements)}
          cancelText="No"
          confirmText="Yes"
          onConfirm={() => performCalculateTakeoff(headwind)}
        />,
      );
    } else {
      performCalculateTakeoff(headwind);
    }
  };

  // ---------------------------------------------------------------------------------------------- data import

  const setRunway = (runways: typeof availableRunways, runwayIndex: number, length?: number) => {
    const newRunway = runwayIndex >= 0 ? runways[runwayIndex] : undefined;
    return {
      availableRunways: runways,
      selectedRunwayIndex: runwayIndex,
      runwayBearing: newRunway?.magneticBearing,
      runwayLength: newRunway !== undefined ? length ?? newRunway.length : undefined,
      runwaySlope: newRunway !== undefined ? -Math.tan(newRunway.gradient * Avionics.Utils.DEG2RAD) * 100 : undefined,
      elevation: newRunway?.elevation,
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
      const magvar = await getAirportMagVar(airport);
      const direction = MathUtils.normalise360(parsedMetar.wind.degrees - magvar);
      dispatch(
        setTakeoffValues({
          windDirection: direction,
          windMagnitude: parsedMetar.wind.speed_kts,
          windEntry: `${direction.toFixed(0).padStart(3, '0')}/${parsedMetar.wind.speed_kts.toFixed(0).padStart(2, '0')}`,
          oat: parsedMetar.temperature.celsius,
          qnh: parsedMetar.barometer.mb,
        }),
      );
    } catch {
      toast.error('Could not fetch airport');
    }
  };

  /**
   * The departure data of the OFP: the one loaded in the flypad (Dashboard), otherwise the current SimBrief OFP, read for
   * the takeoff data only (the flypad OFP, and its fuel and payload import, do not change).
   */
  const loadOfpDeparture = async (): Promise<{
    icao: string;
    runway: string;
    metar: unknown;
    tow: number;
    units: string;
  } | null> => {
    if (ofpDepartingAirport) {
      return {
        icao: ofpDepartingAirport,
        runway: ofpDepartingRunway,
        metar: ofpDepartingMetar,
        tow: parseInt(ofpWeights.estTakeOffWeight),
        units: ofpUnits,
      };
    }
    try {
      const ofp = await getSimbriefData(
        (navigraphAuthInfo.loggedIn && navigraphAuthInfo.username) || '',
        overrideSimBriefUserID ?? '',
      );
      return {
        icao: ofp.origin.icao,
        runway: ofp.origin.runway,
        metar: ofp.origin.metar,
        tow: parseInt(ofp.weights.estTakeOffWeight),
        units: ofp.units,
      };
    } catch (e) {
      console.warn('[flypad] Takeoff OFP import:', e);
      return null;
    }
  };

  /**
   * Fills the takeoff inputs from the OFP: departure airport and runway, TOW, and wind, OAT and QNH of the departure
   * METAR. What is missing (runway not found, no METAR) is left to the flight crew, with a message.
   */
  const syncValuesWithOfp = async () => {
    const ofp = await loadOfpDeparture();
    if (ofp === null) {
      toast.error(t('Performance.Takeoff.Calc.OfpNoData'));
      return;
    }
    if (!isValidIcao(ofp.icao)) {
      toast.error(t('Performance.Takeoff.Calc.OfpInvalidAirport'));
      return;
    }

    let runways: Awaited<ReturnType<typeof getRunways>>;
    let magvar: number | null;
    try {
      runways = await getRunways(ofp.icao);
      magvar = await getAirportMagVar(ofp.icao);
    } catch {
      toast.error(subReplacements(t('Performance.Takeoff.Calc.OfpNoAirport'), { icao: ofp.icao }));
      return;
    }

    // SimBrief gives an empty object instead of a METAR when it has none
    let parsedMetar: MetarParserType | undefined;
    try {
      parsedMetar = typeof ofp.metar === 'string' ? parseMetar(ofp.metar) : undefined;
    } catch {
      parsedMetar = undefined;
    }
    const direction =
      parsedMetar !== undefined ? Math.round(MathUtils.normalise360(parsedMetar.wind.degrees - (magvar ?? 0))) : null;

    const runwayIndex = runways.findIndex((r) => r.ident === ofp.runway);
    dispatch(
      setTakeoffValues({
        icao: ofp.icao,
        ...setRunway(runways, runwayIndex),
        ...(Number.isFinite(ofp.tow)
          ? { weight: ofp.units === 'lbs' ? Math.round(Units.poundToKilogram(ofp.tow)) : ofp.tow }
          : {}),
        cg: aircraftCg() ?? cg,
        ...(parsedMetar !== undefined && direction !== null
          ? {
              windDirection: direction,
              windMagnitude: parsedMetar.wind.speed_kts,
              windEntry: `${direction.toFixed(0).padStart(3, '0')}/${parsedMetar.wind.speed_kts}`,
              oat: parsedMetar.temperature.celsius,
              qnh: parsedMetar.barometer.mb,
            }
          : {}),
      }),
    );
    if (runwayIndex < 0) {
      toast.warning(
        subReplacements(t('Performance.Takeoff.Calc.OfpNoRunway'), { runway: ofp.runway || '---', icao: ofp.icao }),
      );
    }
    if (parsedMetar === undefined) {
      toast.warning(t('Performance.Takeoff.Calc.OfpNoMetar'));
    }
  };

  /**
   * The FMS takeoff data (flight plan and load data), with the runway conditions of the last SEND T.O REQUEST of the
   * FMS for the same airport and runway.
   */
  const syncValuesWithFms = async () => {
    const fms = await requestFmsTakeoffData(eventBus);
    if (fms === null || fms.departure === null || !isValidIcao(fms.departure)) {
      toast.error(t('Performance.Takeoff.Calc.FmsNoData'));
      return;
    }
    const fmsRunway = fms.runways[0];
    const crewRequest = CompanyTakeoffRequests.last;
    const requested =
      crewRequest?.departure === fms.departure
        ? crewRequest.runways.find((r) => r.runway === fmsRunway?.runway) ?? crewRequest.runways[0]
        : undefined;
    const conditions = requested ?? fmsRunway;
    try {
      const runways = await getRunways(fms.departure);
      const runwayIndex = runways.findIndex((r) => r.ident === conditions?.runway);
      const newRunway = runwayIndex >= 0 ? runways[runwayIndex] : undefined;
      // T.O LIMIT: the remaining runway length of the request, otherwise the runway after the takeoff shift
      const length =
        newRunway !== undefined
          ? conditions?.toLimit ?? newRunway.length - Math.max(0, conditions?.shift ?? 0)
          : undefined;
      const direction = conditions?.windDirection ?? null;
      const speed = conditions?.windSpeed ?? null;
      dispatch(
        setTakeoffValues({
          icao: fms.departure,
          ...setRunway(runways, runwayIndex, length),
          weight: fms.tow ?? undefined,
          cg: fms.cg ?? aircraftCg() ?? cg,
          oat: fms.oat ?? undefined,
          qnh: conditions?.qnh ?? undefined,
          config: conditions?.flaps ?? config,
          // The runway condition of the FMS list (DRY, WET, 1/4 WATER, 1/2 WATER, 1/4 SLUSH, 1/2 SLUSH, COMP SNOW)
          runwayCondition:
            conditions?.runwayCondition !== null && conditions?.runwayCondition !== undefined
              ? RUNWAY_CONDITIONS[conditions.runwayCondition] ?? runwayCondition
              : runwayCondition,
          forceToga: conditions?.thrust === 'TOGA' ? true : conditions?.thrust === 'FLEX' ? false : forceToga,
          ...(direction !== null && speed !== null
            ? {
                windDirection: direction,
                windMagnitude: speed,
                windEntry: `${direction.toFixed(0).padStart(3, '0')}/${speed.toFixed(0)}`,
              }
            : {}),
        }),
      );
      if (newRunway === undefined) {
        toast.info(t('Performance.Takeoff.Calc.FmsNoRunway'));
      }
    } catch {
      toast.error(t('Performance.Takeoff.Calc.FmsNoData'));
    }
  };

  const isAutoFillIcaoValid = () => {
    if (autoFillSource === 'METAR') {
      return isValidIcao(icao);
    }
    return true;
  };

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

  const set = (values: Parameters<typeof setTakeoffValues>[0]) => {
    clearResult();
    dispatch(setTakeoffValues(values));
  };

  const parseNumber = (value: string, integer = false): number | undefined => {
    const n = integer ? parseInt(value) : parseFloat(value);
    return Number.isNaN(n) ? undefined : n;
  };

  const handleICAOChange = (value: string) => {
    dispatch(clearTakeoffValues());
    dispatch(setTakeoffValues({ icao: value }));
    if (isValidIcao(value)) {
      getRunways(value)
        .then((runways) => dispatch(setTakeoffValues(setRunway(runways, runways.length > 0 ? 0 : -1))))
        .catch(() => dispatch(setTakeoffValues(setRunway([], -1))));
    } else {
      dispatch(setTakeoffValues(setRunway([], -1)));
    }
  };

  const handleWindChange = (input: string): void => {
    clearResult();
    if (input === '0') {
      dispatch(setTakeoffValues({ windMagnitude: 0, windDirection: undefined, windEntry: input }));
    } else if (isWindMagnitudeOnly(input)) {
      const match = input.match(WIND_MAGNITUDE_ONLY_REGEX);
      const magnitude = parseFloat(match[2]);
      const tailwind = match[1] === 'TL' || match[1] === 'T' || match[1] === '-';
      dispatch(
        setTakeoffValues({
          windMagnitude: tailwind ? -magnitude : magnitude,
          windDirection: undefined,
          windEntry: input,
        }),
      );
    } else if (isWindMagnitudeAndDirection(input)) {
      const match = input.match(WIND_MAGNITUDE_AND_DIR_REGEX);
      dispatch(
        setTakeoffValues({ windDirection: parseInt(match[1]), windMagnitude: parseFloat(match[2]), windEntry: input }),
      );
    } else {
      dispatch(setTakeoffValues({ windMagnitude: undefined, windDirection: undefined, windEntry: input }));
    }
  };

  const handleRealDataOnlyChange = (value: boolean) => {
    clearResult();
    if (calculator) {
      calculator.realDataOnly = value;
    }
    setRealDataOnly(value);
  };

  const displayed = (value: number | undefined, imperial: boolean, toImperial: (v: number) => number) =>
    value !== undefined && imperial ? toImperial(value) : value;

  // ---------------------------------------------------------------------------------------------- results

  const isEstimate = (e: TakeoffPerformanceEstimate) => result?.estimates?.includes(e) ?? false;
  const flexMin = result ? Math.ceil(Math.max(result.params.tRef, result.inputs.oat)) : undefined;
  const flexMax = result?.flex;
  const flexPossible = flexMax !== undefined && flexMin !== undefined && flexMin <= flexMax;
  /** The FLEX temperature of the takeoff run and of the data sent to the FMS, undefined for TOGA */
  const runFlex = flexPossible && selectedFlex !== null ? Math.min(flexMax, selectedFlex ?? flexMax) : undefined;
  /** The result of the thrust of the takeoff run: the TOGA result has its own speeds on the A320 */
  const runResult = runFlex === undefined && togaResult !== undefined ? togaResult : result;
  const distances: TakeoffRunwayDistances | undefined =
    runResult !== undefined ? calculator.calculateTakeoffDistances?.(runResult, runFlex) : undefined;
  const lineUp = result ? result.inputs.tora - result.params.adjustedTora : 0;

  const formatWeight = (kg: number | undefined) =>
    kg === undefined ? '---.-' : ((weightUnit === 'lb' ? Units.kilogramToPound(kg) : kg) / 1000).toFixed(1);
  const weightUnitText = weightUnit === 'lb' ? 'klb' : 't';
  const formatDistance = (metres: number | undefined, dashes = '----') =>
    metres === undefined
      ? dashes
      : Math.round(distanceUnit === 'ft' ? Units.metreToFoot(metres) : metres).toLocaleString('en-US');
  const weightsEstimated =
    isEstimate(TakeoffPerformanceEstimate.Wind) ||
    isEstimate(TakeoffPerformanceEstimate.Slope) ||
    isEstimate(TakeoffPerformanceEstimate.Temperature);
  const margin = distances?.required !== undefined ? distances.available - distances.required : undefined;

  const canSend =
    result !== undefined &&
    result.v1 !== undefined &&
    result.vR !== undefined &&
    (cg !== undefined || !profile.fmsNeedsCg);

  /** SEND TO FMS: the results as company takeoff data, inserted from the RECEIVED COMPANY T.O DATA page */
  const handleSendToFms = async () => {
    if (!canSend || selectedRunway === undefined || !isValidIcao(icao)) {
      return;
    }
    const bearing = runwayBearing ?? 0;
    // A wind entered as a component: along the runway
    const direction =
      windDirection ?? (windMagnitude !== undefined && windMagnitude < 0 ? (bearing + 180) % 360 : bearing);
    const noise =
      profile.noise &&
      noiseEnabled &&
      noiseEndAltitude !== undefined &&
      noiseSpeed !== undefined &&
      noiseN1 !== undefined
        ? { endAltitude: noiseEndAltitude, speed: noiseSpeed, n1: noiseN1 }
        : null;
    // The takeoff data of both thrust ratings (A380 FCOM DSC-22-FMS-20-30, A320 FCOM DSC-22_45 "computed for max and
    // flex takeoff"): TOGA, and FLEX at the temperature of the takeoff run (the maximum one when TOGA is selected)
    const uplink = (
      speeds: TakeoffPerformanceResult,
      flexTemperature: number | undefined,
    ): CompanyTakeoffDataUplink => ({
      departure: icao.toUpperCase(),
      runway: selectedRunway.ident,
      tow: result.inputs.tow,
      cg: cg ?? null,
      qnh: Math.round(result.inputs.qnh),
      windDirection: Math.round(direction),
      windSpeed: Math.abs(windMagnitude ?? 0),
      runwayCondition: FMS_RUNWAY_CONDITION[result.inputs.runwayCondition] ?? 0,
      oat: result.inputs.oat,
      v1: speeds.v1 ?? null,
      vr: speeds.vR ?? null,
      v2: speeds.v2,
      thrust: flexTemperature !== undefined ? 'FLEX' : 'TOGA',
      flexTemperature: flexTemperature ?? null,
      flaps: result.inputs.conf,
      ths: result.stabTrim ?? null,
      shift: takeoffShift !== undefined ? Math.round(takeoffShift) : null,
      toLimit: Math.round(result.inputs.tora),
      thrustReductionAltitude: thrRed ?? null,
      accelerationAltitude: accel ?? null,
      engineOutAccelerationAltitude: eoAccel ?? null,
      noise,
      mtowPerf: result.mtow ?? result.inputs.tow,
    });
    // Both thrust ratings reach the FMS together
    sendTakeoffDataToFms(
      eventBus,
      flexPossible
        ? [uplink(togaResult ?? result, undefined), uplink(result, runFlex ?? flexMax)]
        : [uplink(togaResult ?? result, undefined)],
      datalinkDelay,
    );
    toast.success(t(profile.sentToFms));

    // The FMS only inserts data for its departure runway and a TOW close to its own: tell why before the crew tries
    const fms = await requestFmsTakeoffData(eventBus);
    if (fms === null) {
      return;
    }
    const fmsRunway = fms.runways[0]?.runway;
    if (fms.departure !== icao.toUpperCase() || fmsRunway !== selectedRunway.ident) {
      toast.warning(
        subReplacements(t('Performance.Takeoff.Calc.FmsCheckRunway'), {
          fms: `${fms.departure ?? '----'} ${fmsRunway ?? '---'}`,
          runway: `${icao.toUpperCase()} ${selectedRunway.ident}`,
        }),
      );
    } else if (fms.tow === null) {
      toast.warning(t('Performance.Takeoff.Calc.FmsCheckNoTow'));
    } else if (
      result.inputs.tow < fms.tow - profile.fmsTowMarginBelow ||
      result.inputs.tow > fms.tow + profile.fmsTowMarginAbove
    ) {
      toast.warning(subReplacements(t('Performance.Takeoff.Calc.FmsCheckTow'), { fms: (fms.tow / 1000).toFixed(1) }));
    }
  };

  const sendTooltip = () => {
    if (result !== undefined && (result.v1 === undefined || result.vR === undefined)) {
      return t('Performance.Takeoff.Calc.SendNeedsSpeeds');
    }
    if (result !== undefined && cg === undefined) {
      return t('Performance.Takeoff.Calc.SendNeedsCg');
    }
    return undefined;
  };

  // ---------------------------------------------------------------------------------------------- render

  const unitSelect = <T extends string>(value: string, options: T[], onChange: (v: T) => void, width = 'w-20') => (
    <SelectInput
      value={value}
      className={`${width} rounded-l-none`}
      options={options.map((o) => ({ value: o, displayValue: o === 'C' || o === 'F' ? `°${o}` : o }))}
      onChange={(v: T) => onChange(v)}
    />
  );

  return (
    <div className="flex h-content-section-reduced flex-col space-y-3 overflow-hidden text-base">
      {/* Airport, data sources and data mode */}
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-row items-center space-x-4">
          <Row label={t('Performance.Takeoff.Airport')}>
            <SimpleInput
              className="w-24 text-center uppercase"
              fontSizeClassName="text-base"
              value={icao}
              placeholder="ICAO"
              onChange={handleICAOChange}
              maxLength={4}
            />
          </Row>
          <div className="flex flex-row">
            <button
              onClick={isAutoFillIcaoValid() ? handleAutoFill : undefined}
              className={`flex flex-row items-center justify-center space-x-3 rounded-md rounded-r-none border-2 border-theme-highlight bg-theme-highlight px-5 py-1.5 text-theme-body outline-none transition duration-100 ${!isAutoFillIcaoValid() ? 'opacity-50' : 'hover:bg-theme-body hover:text-theme-highlight'}`}
              type="button"
            >
              <CloudArrowDown size={22} />
              <p className="text-current">{t('Performance.Landing.FillDataFrom')}</p>
            </button>
            <SelectInput
              value={autoFillSource}
              className="w-28 rounded-l-none"
              options={[
                { value: 'FMS', displayValue: 'FMS' },
                { value: 'OFP', displayValue: 'OFP' },
                { value: 'METAR', displayValue: 'METAR' },
              ]}
              onChange={(value: 'METAR' | 'OFP' | 'FMS') => setAutoFillSource(value)}
            />
          </div>
        </div>
        {calculator?.realDataOnly !== undefined && (
          <Row label={t('Performance.Takeoff.Calc.Data')}>
            <SelectInput
              className="w-60"
              value={realDataOnly}
              onChange={(value: boolean) => handleRealDataOnlyChange(!!value)}
              options={[
                { value: false, displayValue: t('Performance.Takeoff.Calc.DataWithEstimates') },
                { value: true, displayValue: t('Performance.Takeoff.Calc.DataRealOnly') },
              ]}
            />
          </Row>
        )}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-4 gap-3">
        <Section title={t('Performance.Takeoff.Calc.SectionRunway')}>
          <Row label={t('Performance.Takeoff.Runway')}>
            <SelectInput
              className="w-40"
              defaultValue={initialState.takeoff.selectedRunwayIndex}
              value={selectedRunwayIndex}
              onChange={(index: number) => set(setRunway(availableRunways, index))}
              options={[
                { value: -1, displayValue: t('Performance.Takeoff.Calc.Manual') },
                ...availableRunways.map((r, i) => ({ value: i, displayValue: r.ident })),
              ]}
              disabled={availableRunways.length === 0}
            />
          </Row>
          <Row label={t('Performance.Takeoff.Calc.Heading')}>
            <SimpleInput
              className="w-40"
              fontSizeClassName="text-base"
              value={runwayBearing}
              placeholder="°"
              min={0}
              max={360}
              padding={3}
              decimalPrecision={0}
              onChange={(v) => set({ runwayBearing: parseNumber(v, true) })}
              number
            />
          </Row>
          <Row label={t('Performance.Takeoff.Tora')}>
            <div className="flex w-40 flex-row">
              <SimpleInput
                className="w-full min-w-0 rounded-r-none"
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
          <Row label={t('Performance.Takeoff.Calc.Elevation')}>
            <SimpleInput
              className="w-40"
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
          <Row label={t('Performance.Takeoff.Calc.Slope')}>
            <SimpleInput
              className="w-40"
              fontSizeClassName="text-base"
              value={runwaySlope}
              placeholder="%"
              decimalPrecision={2}
              onChange={(v) => set({ runwaySlope: parseNumber(v) })}
              number
              reverse
            />
          </Row>
          <Row label={t('Performance.Takeoff.Calc.EntryAngle')}>
            <SelectInput
              className="w-40"
              defaultValue={initialState.takeoff.lineupAngle}
              value={lineupAngle}
              onChange={(v: LineupAngle) => set({ lineupAngle: v })}
              options={[0, 90, 180].map((a) => ({
                value: a,
                displayValue: t(`Performance.Takeoff.EntryAngles.${a}`),
              }))}
            />
          </Row>
        </Section>

        <Section title={t('Performance.Takeoff.Calc.SectionConditions')}>
          <Row label={t('Performance.Takeoff.Calc.Condition')}>
            <SelectInput
              className="w-40"
              defaultValue={initialState.takeoff.runwayCondition}
              value={runwayCondition}
              onChange={(v: RunwayCondition) =>
                set(isContaminated(v) ? { runwayCondition: v, forceToga: true } : { runwayCondition: v })
              }
              options={RUNWAY_CONDITIONS.map((c) => ({
                value: c,
                displayValue: t(`Performance.Takeoff.RunwayConditions.${c}`),
              }))}
            />
          </Row>
          <Row label={t('Performance.Takeoff.Wind')}>
            <SimpleInput
              className="w-40"
              fontSizeClassName="text-base"
              value={windEntry}
              placeholder="°/kt"
              onChange={handleWindChange}
              uppercase
              wind
            />
          </Row>
          <Row label={t('Performance.Takeoff.Calc.Oat')}>
            <div className="flex w-40 flex-row">
              <SimpleInput
                className="w-full min-w-0 rounded-r-none"
                fontSizeClassName="text-base"
                value={displayed(oat, temperatureUnit === 'F', Units.celsiusToFahrenheit)}
                placeholder={`°${temperatureUnit}`}
                decimalPrecision={1}
                onChange={(v) => {
                  const n = parseNumber(v);
                  set({ oat: n !== undefined && temperatureUnit === 'F' ? Units.fahrenheitToCelsius(n) : n });
                }}
                number
              />
              {unitSelect(temperatureUnit, ['C', 'F'], (v) => setTemperatureUnit(v), 'w-[4.5rem]')}
            </div>
          </Row>
          <Row label={t('Performance.Takeoff.Qnh')}>
            <div className="flex w-40 flex-row">
              <SimpleInput
                className="w-full min-w-0 rounded-r-none"
                fontSizeClassName="text-base"
                value={displayed(qnh, pressureUnit === 'inHg', Units.hectopascalToInchOfMercury)}
                placeholder={pressureUnit}
                min={pressureUnit === 'hPa' ? 800 : 23.624}
                max={pressureUnit === 'hPa' ? 1200 : 35.43598}
                decimalPrecision={2}
                onChange={(v) => {
                  const n = parseNumber(v);
                  set({ qnh: n !== undefined && pressureUnit === 'inHg' ? Units.inchOfMercuryToHectopascal(n) : n });
                }}
                number
              />
              {unitSelect(pressureUnit, ['hPa', 'inHg'], (v) => setPressureUnit(v), 'w-[5.25rem]')}
            </div>
          </Row>
          <Row label={t('Performance.Takeoff.AntiIce')}>
            <SelectInput
              className="w-40"
              defaultValue={initialState.takeoff.antiIce}
              value={antiIce}
              onChange={(v: TakeoffAntiIceSetting) => set({ antiIce: v })}
              options={[
                { value: TakeoffAntiIceSetting.Off, displayValue: 'Off' },
                { value: TakeoffAntiIceSetting.Engine, displayValue: 'Engine' },
                { value: TakeoffAntiIceSetting.EngineWing, displayValue: 'Eng & Wing' },
              ]}
            />
          </Row>
          <Row label={t('Performance.Takeoff.Packs')}>
            <SelectInput
              className="w-40"
              defaultValue={initialState.takeoff.packs}
              value={packs}
              onChange={(v: boolean) => set({ packs: v })}
              options={[
                { value: false, displayValue: 'Off' },
                { value: true, displayValue: 'On' },
              ]}
            />
          </Row>
        </Section>

        <Section title={t('Performance.Takeoff.Calc.SectionAircraft')}>
          <Row label={t('Performance.Takeoff.Calc.Tow')}>
            <div className="flex w-40 flex-row">
              <SimpleInput
                className="w-full min-w-0 rounded-r-none"
                fontSizeClassName="text-base"
                value={displayed(weight, weightUnit === 'lb', Units.kilogramToPound)}
                placeholder={weightUnit}
                decimalPrecision={0}
                onChange={(v) => {
                  const n = parseNumber(v, true);
                  set({ weight: n !== undefined && weightUnit === 'lb' ? Units.poundToKilogram(n) : n });
                }}
                number
              />
              {unitSelect(weightUnit, ['kg', 'lb'], (v) => setWeightUnit(v), 'w-[4.5rem]')}
            </div>
          </Row>
          <Row label={t('Performance.Takeoff.Calc.TakeoffCg')}>
            <SimpleInput
              className="w-40"
              fontSizeClassName="text-base"
              value={cg}
              placeholder="% MAC"
              min={20}
              max={50}
              decimalPrecision={1}
              onChange={(v) => set({ cg: parseNumber(v) })}
              number
            />
          </Row>
          <Row label={t('Performance.Takeoff.Calc.Flaps')}>
            <SelectInput
              className="w-40"
              defaultValue={initialState.takeoff.config}
              value={config}
              onChange={(v: number) => set({ config: v })}
              options={[
                { value: -1, displayValue: 'OPT' },
                { value: 1, displayValue: 'CONF 1+F' },
                { value: 2, displayValue: 'CONF 2' },
                { value: 3, displayValue: 'CONF 3' },
              ]}
            />
          </Row>
          <Row label={t('Performance.Takeoff.Thrust')}>
            <SelectInput
              className="w-40"
              defaultValue={initialState.takeoff.forceToga}
              value={forceToga}
              // The results have both thrusts: only the thrust of the takeoff run changes
              onChange={(v: boolean) =>
                dispatch(setTakeoffValues({ forceToga: !!v, selectedFlex: v ? null : undefined }))
              }
              options={[
                { value: false, displayValue: 'FLEX' },
                { value: true, displayValue: 'TOGA' },
              ]}
              disabled={isContaminated(runwayCondition)}
            />
          </Row>
        </Section>

        <Section title={t('Performance.Takeoff.Calc.SectionDeparture')}>
          {(
            [
              ['ThrRed', thrRed, 'thrustReductionAltitude'],
              ['Accel', accel, 'accelerationAltitude'],
              ['EoAccel', eoAccel, 'engineOutAccelerationAltitude'],
            ] as const
          ).map(([label, value, key]) => (
            <Row key={key} label={t(`Performance.Takeoff.Calc.${label}`)}>
              <SimpleInput
                className="w-40"
                fontSizeClassName="text-base"
                value={value}
                placeholder="ft"
                min={-1000}
                max={20000}
                decimalPrecision={0}
                onChange={(v) => set({ [key]: parseNumber(v, true) } as Parameters<typeof setTakeoffValues>[0])}
                number
              />
            </Row>
          ))}
          {profile.noise && (
            <>
              <Row label={t('Performance.Takeoff.Calc.Noise')}>
                <Toggle value={!!noiseEnabled} onToggle={(v) => set({ noiseEnabled: v })} />
              </Row>
              <div
                className={`flex flex-row items-center justify-between space-x-2 ${noiseEnabled ? '' : 'opacity-40'}`}
              >
                {(
                  [
                    ['NoiseEnd', noiseEndAltitude, 'noiseEndAltitude', 'ft', 'w-24'],
                    ['NoiseSpeed', noiseSpeed, 'noiseSpeed', 'kt', 'w-16'],
                    ['NoiseN1', noiseN1, 'noiseN1', '%', 'w-16'],
                  ] as const
                ).map(([label, value, key, unit, width]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-sm text-theme-unselected">{t(`Performance.Takeoff.Calc.${label}`)}</span>
                    <SimpleInput
                      className={width}
                      fontSizeClassName="text-base"
                      value={value}
                      placeholder={unit}
                      decimalPrecision={0}
                      onChange={(v) => set({ [key]: parseNumber(v, true) } as Parameters<typeof setTakeoffValues>[0])}
                      number
                      disabled={!noiseEnabled}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>
      </div>

      {/* Results, takeoff run and actions */}
      <div className="flex min-h-0 flex-1 flex-row space-x-3">
        <div className="flex w-[32.5rem] shrink-0 flex-col space-y-3">
          <ResultsPanel
            result={result}
            runway={selectedRunway?.ident}
            flex={runFlex}
            flexIsMax={runFlex !== undefined && runFlex === flexMax}
            isEstimate={isEstimate}
            weightsEstimated={weightsEstimated}
            formatWeight={formatWeight}
            weightUnit={weightUnitText}
            margin={margin}
            marginEstimated={distances?.requiredEstimated ?? false}
            formatDistance={formatDistance}
            distanceUnit={distanceUnit}
            cg={cg}
            shift={takeoffShift}
            thrRed={thrRed}
            accel={accel}
            eoAccel={eoAccel}
            speeds={runResult}
            legend={realDataOnly ? t('Performance.Takeoff.Calc.RealDataOnlyLegend') : t(profile.resultsLegend)}
          />
          <div className="flex flex-row space-x-3">
            <button
              onClick={handleCalculateTakeoff}
              className={`flex w-full flex-row items-center justify-center space-x-3 rounded-md border-2 border-theme-highlight bg-theme-highlight py-2 text-theme-body outline-none hover:bg-theme-body hover:text-theme-highlight ${!areInputsValid() ? 'pointer-events-none opacity-50' : ''}`}
              type="button"
              disabled={!areInputsValid()}
            >
              <Calculator size={22} />
              <p className="font-bold text-current">{t('Performance.Takeoff.Calculate')}</p>
            </button>
            <button
              onClick={() => dispatch(clearTakeoffValues())}
              className="flex w-full flex-row items-center justify-center space-x-3 rounded-md border-2 border-utility-red bg-utility-red py-2 text-theme-body outline-none hover:bg-theme-body hover:text-utility-red"
              type="button"
            >
              <Trash size={22} />
              <p className="font-bold text-current">{t('Performance.Takeoff.Clear')}</p>
            </button>
            <TooltipWrapper text={sendTooltip()}>
              <button
                onClick={handleSendToFms}
                className={`flex w-full flex-row items-center justify-center space-x-3 rounded-md border-2 border-theme-highlight py-2 text-theme-highlight outline-none hover:bg-theme-highlight hover:text-theme-body ${!canSend ? 'pointer-events-none opacity-50' : ''}`}
                type="button"
                disabled={!canSend}
              >
                <Send size={22} />
                <p className="whitespace-nowrap font-bold text-current">{t('Performance.Takeoff.Calc.SendToFms')}</p>
              </button>
            </TooltipWrapper>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col rounded-md border-2 border-theme-accent px-4 pb-2 pt-1.5">
          <div className="flex flex-row items-center justify-between">
            <h2 className="text-base font-bold uppercase tracking-wider text-theme-unselected">
              {t('Performance.Takeoff.Calc.TakeoffRun')}
            </h2>
            {distances !== undefined && (
              <div className="flex flex-row space-x-5 text-lg">
                <span>
                  {t('Performance.Takeoff.Calc.Required')}{' '}
                  <span className={distances.requiredEstimated ? 'text-utility-amber' : 'text-utility-green'}>
                    {distances.required !== undefined
                      ? `${formatDistance(distances.required)} ${distanceUnit}${distances.requiredEstimated ? '*' : ''}`
                      : distances.requiredBelowData
                        ? t('Performance.Takeoff.Calc.BelowData').replace(
                            '{length}',
                            `${formatDistance(distances.shortestDataLength)} ${distanceUnit}`,
                          )
                        : t('Performance.Takeoff.Calc.AboveData')}
                  </span>
                </span>
                <span>
                  {t('Performance.Takeoff.Calc.Available')}{' '}
                  <span className="text-utility-green">
                    {formatDistance(distances.available)} {distanceUnit}
                  </span>
                </span>
                {margin !== undefined && (
                  <span>
                    {t('Performance.Takeoff.Calc.Margin')}{' '}
                    <span
                      className={
                        margin < 0
                          ? 'text-utility-red'
                          : distances.requiredEstimated
                            ? 'text-utility-amber'
                            : 'text-utility-green'
                      }
                    >
                      {formatDistance(margin)} {distanceUnit}
                      {distances.requiredEstimated ? '*' : ''}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Thrust of the takeoff run: TOGA, or a FLEX temperature from the lowest possible one to the maximum */}
          <div className="mt-2 flex flex-row items-center space-x-4">
            <span className="text-theme-text">{t('Performance.Takeoff.Calc.FlexSimulation')}</span>
            <SelectGroup>
              <SelectItem
                selected={result !== undefined && runFlex === undefined}
                disabled={result === undefined}
                onSelect={() =>
                  result !== undefined && dispatch(setTakeoffValues({ selectedFlex: null, forceToga: true }))
                }
                className="px-4 py-1"
              >
                {t('Performance.Takeoff.Calc.Toga')}
              </SelectItem>
              <SelectItem
                selected={runFlex !== undefined}
                disabled={!flexPossible}
                onSelect={() => flexPossible && dispatch(setTakeoffValues({ selectedFlex: flexMax, forceToga: false }))}
                className="px-4 py-1"
              >
                FLEX
              </SelectItem>
            </SelectGroup>
            <button
              type="button"
              className={`h-9 w-9 rounded-md border-2 border-theme-accent text-xl ${runFlex === undefined || runFlex <= flexMin ? 'pointer-events-none opacity-40' : 'hover:border-theme-highlight'}`}
              onClick={() =>
                runFlex !== undefined && dispatch(setTakeoffValues({ selectedFlex: Math.max(flexMin, runFlex - 1) }))
              }
            >
              −
            </button>
            <span className="w-24 text-center text-2xl">
              {runFlex !== undefined ? (
                <Value text={`${runFlex}°C`} estimate={isEstimate(TakeoffPerformanceEstimate.Flex)} />
              ) : (
                <span className="text-theme-unselected">---</span>
              )}
            </span>
            <button
              type="button"
              className={`h-9 w-9 rounded-md border-2 border-theme-accent text-xl ${runFlex === undefined || runFlex >= flexMax ? 'pointer-events-none opacity-40' : 'hover:border-theme-highlight'}`}
              onClick={() =>
                runFlex !== undefined && dispatch(setTakeoffValues({ selectedFlex: Math.min(flexMax, runFlex + 1) }))
              }
            >
              +
            </button>
            <div className={`flex flex-1 flex-row items-center space-x-3 ${runFlex === undefined ? 'opacity-40' : ''}`}>
              <span className="text-sm text-theme-unselected">{flexPossible ? `${flexMin}°` : ''}</span>
              <Slider
                disabled={runFlex === undefined || flexMin === flexMax}
                min={flexMin ?? 0}
                max={flexMax ?? 1}
                step={1}
                value={runFlex ?? flexMax ?? 0}
                onChange={(v: number) => dispatch(setTakeoffValues({ selectedFlex: v }))}
              />
              <span className="whitespace-nowrap text-sm text-theme-unselected">
                {flexPossible ? `${flexMax}° ${t('Performance.Takeoff.Calc.FlexMax')}` : ''}
              </span>
            </div>
          </div>

          <div className="mt-1 min-h-0 flex-1">
            {result !== undefined ? (
              <TakeoffRunway
                ident={selectedRunway?.ident}
                runwayLength={
                  selectedRunway !== undefined
                    ? Math.max(selectedRunway.length, result.inputs.tora)
                    : result.inputs.tora
                }
                shift={takeoffShift ?? 0}
                lineUp={lineUp}
                distances={distances}
                distanceUnit={distanceUnit === 'ft' ? 'ft' : 'm'}
                shortestDataLength={distances?.shortestDataLength ?? 0}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-theme-unselected">
                {t('Performance.Takeoff.Calc.NoResult')}
              </div>
            )}
          </div>
          <div className="text-sm text-theme-unselected">
            {realDataOnly ? t('Performance.Takeoff.Calc.RunwayLegendRealOnly') : t(profile.runwayLegend)}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ResultsPanelProps {
  result: TakeoffPerformanceResult | undefined;
  runway: string | undefined;
  flex: number | undefined;
  flexIsMax: boolean;
  isEstimate: (e: TakeoffPerformanceEstimate) => boolean;
  weightsEstimated: boolean;
  formatWeight: (kg: number | undefined) => string;
  weightUnit: string;
  margin: number | undefined;
  marginEstimated: boolean;
  formatDistance: (metres: number | undefined, dashes?: string) => string;
  distanceUnit: string;
  cg: number | undefined;
  shift: number | undefined;
  thrRed: number | undefined;
  accel: number | undefined;
  eoAccel: number | undefined;
  /** The result of the thrust of the takeoff run, for the speeds */
  speeds: TakeoffPerformanceResult | undefined;
  legend: string;
}

/** The results in the layout of the RESULTS panel of the Airbus takeoff performance application (A380 FCOM PER-TOF-TOR-SRS P 1) */
const ResultsPanel = ({
  result,
  runway,
  flex,
  flexIsMax,
  isEstimate,
  weightsEstimated,
  formatWeight,
  weightUnit,
  margin,
  marginEstimated,
  formatDistance,
  distanceUnit,
  cg,
  shift,
  thrRed,
  accel,
  eoAccel,
  speeds,
  legend,
}: ResultsPanelProps) => {
  const speed = (value: number | undefined, estimate: TakeoffPerformanceEstimate) => (
    <Value text={value?.toFixed(0) ?? '---'} unit="kt" estimate={value !== undefined && isEstimate(estimate)} />
  );
  const altitude = (value: number | undefined) => (
    <Value text={value !== undefined ? value.toFixed(0) : '-----'} unit="ft" />
  );
  return (
    <div className="flex flex-1 flex-col justify-between rounded-md bg-black px-4 pb-2 pt-1.5 text-white">
      <div className="flex flex-row items-baseline justify-between">
        <span className="text-base uppercase tracking-wider text-theme-unselected">
          {t('Performance.Takeoff.Calc.Results')}
        </span>
        <span className="text-xl">
          RWY <Value text={runway ?? '---'} />
        </span>
      </div>
      <div className="flex flex-row items-baseline justify-between">
        <span className="text-xl">
          TOW <Value text={formatWeight(result?.inputs.tow)} unit={weightUnit} big />
        </span>
        <span className="text-xl">
          MTOW(perf){' '}
          <Value
            text={formatWeight(result?.mtow)}
            unit={weightUnit}
            estimate={result?.mtow !== undefined && weightsEstimated}
          />
        </span>
      </div>
      <div className="flex flex-row justify-between">
        <div className="flex flex-col text-xl">
          <span>V1 {speed(speeds?.v1, TakeoffPerformanceEstimate.V1)}</span>
          <span>VR {speed(speeds?.vR, TakeoffPerformanceEstimate.VR)}</span>
          <span>V2 {speed(speeds?.v2, TakeoffPerformanceEstimate.V2)}</span>
        </div>
        <div className="flex flex-col items-end justify-between text-xl">
          <span>
            {t('Performance.Takeoff.Calc.Margin').toUpperCase()}{' '}
            <Value
              text={formatDistance(margin, '---')}
              unit={distanceUnit}
              estimate={margin !== undefined && marginEstimated}
            />
          </span>
          <span>
            {result === undefined ? (
              <Value text="----" />
            ) : flex !== undefined ? (
              <>
                <Value text={`FLEX ${flex}°C`} estimate={isEstimate(TakeoffPerformanceEstimate.Flex)} />
                {!flexIsMax && <span className="ml-2 text-base text-theme-unselected">(max {result.flex})</span>}
              </>
            ) : (
              <Value text="TOGA" />
            )}
          </span>
          <span>
            FLAPS <Value text={result ? (result.inputs.conf === 1 ? '1+F' : result.inputs.conf.toFixed(0)) : '-'} />
          </span>
        </div>
      </div>
      <div className="flex flex-row justify-between text-xl">
        <span>
          T.O CG <Value text={cg !== undefined ? cg.toFixed(1) : '--.-'} unit="%" />
        </span>
        <span>
          T.O SHIFT <Value text={result ? formatDistance(shift ?? 0) : '----'} unit={distanceUnit} />
        </span>
      </div>
      <div className="flex flex-row justify-between text-xl">
        <span>THR RED {altitude(thrRed)}</span>
        <span>ACCEL {altitude(accel)}</span>
      </div>
      <div className="flex flex-row justify-between text-xl">
        <span>
          {result?.stabTrim !== undefined && (
            <>
              THS <Value text={`${result.stabTrim < 0 ? 'DN' : 'UP'}${Math.abs(result.stabTrim).toFixed(1)}`} />
            </>
          )}
        </span>
        <span>EO ACCEL {altitude(eoAccel)}</span>
      </div>
      <div className="text-sm leading-tight text-theme-unselected">{legend}</div>
    </div>
  );
};
