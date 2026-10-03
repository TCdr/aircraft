// @ts-strict-ignore
// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useContext, useEffect, useState } from 'react';
import Slider from 'rc-slider';
import { AirframeType, Units, usePersistentProperty, useSimVar } from '@flybywiresim/fbw-sdk-react';
import {
  DescentAntiIce,
  DescentPerformanceError,
  DescentPerformanceEstimate,
  DescentPerformanceResult,
  DescentSpeedSchedule,
  DescentType,
  FmsDescentAltitudeConstraint,
  FmsDescentWaypoint,
  requestFmsDescentData,
} from '@flybywiresim/fbw-sdk';
import { useEventBus } from '@flybywiresim/flypad';
import { toast } from 'react-toastify';
import { Calculator, Trash } from 'react-bootstrap-icons';
import { t } from '../../Localization/translation';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { SelectInput } from '../../UtilComponents/Form/SelectInput/SelectInput';
import { useAppDispatch, useAppSelector } from '../../Store/store';
import { clearDescentValues, setDescentValues } from '../../Store/features/performance';
import { AircraftContext } from '../../AircraftContext';
import { isWindMagnitudeOnly, WIND_MAGNITUDE_ONLY_REGEX } from '../Data/Utils';
import { DescentProfile } from './DescentProfile';
import { DESCENT_NOTES_SEPARATOR, joinDescentNotes } from './descentNotes';
import { M3Button, M3Card, M3Segmented, M3Switch } from '../../UtilComponents/Material/Material';
import {
  PERF_INPUT,
  PERF_SELECT,
  PERF_SMALL_BUTTON,
  PerfFillFrom,
  PerfResult,
  PerfResultRow,
  PerfRow as Row,
  PerfSection as Section,
  PerfTitle,
  PerfValue as Value,
} from './PerformanceKit';

const DESCENT_TYPES = [DescentType.Econ, DescentType.Standard, DescentType.GivenVs, DescentType.Emergency];

/** ISA temperature in °C at a pressure altitude in feet (troposphere) */
const isaTemperature = (altitude: number) => 15 - 0.0019812 * Math.min(altitude, 36_089);

/**
 * The descent calculator of the A380X and the A32NX, after the DES module of the Airbus in-flight performance
 * application (A380 FCOM PER-IFT-DES): the descent from an initial to a target altitude with a descent type and a speed
 * schedule, its time, distance and fuel, its profile, and a check of the aircraft against it (where to start the
 * descent, or the rate of descent needed when late).
 */
export const DescentWidget = () => {
  const dispatch = useAppDispatch();
  const calculator = useContext(AircraftContext).performanceCalculators.descent;
  const isA380 = useAppSelector((state) => state.config.airframeInfo?.variant) === AirframeType.A380_842;
  const eventBus = useEventBus();
  const { usingMetric } = Units;
  const [weightUnit, setWeightUnit] = usePersistentProperty('EFB_PREFERRED_WEIGHT_UNIT', usingMetric ? 'kg' : 'lb');
  const [view, setView] = useState<'PROFILE' | 'TABLE'>('PROFILE');
  /** The start of the descent earlier (> 0) or later (< 0) than the calculated T/D, in NM */
  const [startOffset, setStartOffset] = useState(0);
  /** The waypoints ahead in the active flight plan of the FMS, as descent targets */
  const [fmsWaypoints, setFmsWaypoints] = useState<FmsDescentWaypoint[]>([]);

  const [pressureAltitude] = useSimVar('PRESSURE ALTITUDE', 'feet', 1_000);
  const [sat] = useSimVar('AMBIENT TEMPERATURE', 'celsius', 1_000);
  const [groundSpeed] = useSimVar('GPS GROUND SPEED', 'knots', 1_000);

  const {
    type,
    initialAltitude,
    targetAltitude,
    targetWaypoint,
    mach,
    cas,
    limitCas,
    limitAltitude,
    verticalSpeed,
    speedBrakes,
    weight,
    isaDeviation,
    headwind,
    windEntry,
    antiIce,
    fuelFactor,
    distanceToTarget,
    result,
  } = useAppSelector((state) => state.performance.descent);

  const standard = calculator.standardSchedule;
  const emergency = type === DescentType.Emergency;
  const schedule: DescentSpeedSchedule = emergency
    ? { mach: calculator.mmo, cas: calculator.vmo, limitCas: calculator.vmo, limitAltitude: 0 }
    : {
        mach: mach ?? standard.mach,
        cas: cas ?? standard.cas,
        limitCas: limitCas ?? standard.limitCas,
        limitAltitude: limitAltitude ?? standard.limitAltitude,
      };

  const subReplacements = (msg: string, replacements: Record<string, string>): string =>
    msg.replace(/\{([a-z_]+)\}/g, (m) => replacements[m.substring(1, m.length - 1)] ?? m[1]);

  const set = (values: Parameters<typeof setDescentValues>[0]) => {
    dispatch(setDescentValues(Object.assign({}, values, { result: undefined })));
  };

  const parseNumber = (value: string, integer = false): number | undefined => {
    const n = integer ? parseInt(value) : parseFloat(value);
    return Number.isNaN(n) ? undefined : n;
  };

  const currentIsaDeviation = () => Math.round(sat - isaTemperature(pressureAltitude));

  // ---------------------------------------------------------------------------------------------- FMS

  /**
   * The FMS descent data: cruise level (or the current altitude when lower), destination elevation + 1500 ft (the end
   * of the descent tables of the FCOM), gross weight, speed limit, ECON speeds, and the distance to the destination
   */
  const fillFromFms = async (econOnly = false) => {
    const fms = await requestFmsDescentData(eventBus);
    if (fms === null) {
      toast.error(t('Performance.TopOfDescent.Calc.FmsNoData'));
      return;
    }
    setFmsWaypoints(fms.waypoints);
    const econ =
      fms.managedMach !== null && fms.managedCas !== null ? { mach: fms.managedMach, cas: fms.managedCas } : {};
    if (econOnly) {
      set({ type: DescentType.Econ, ...econ });
      return;
    }
    const currentLevel = Math.round(pressureAltitude / 100) * 100;
    const initial =
      fms.cruiseAltitude !== null
        ? currentLevel > 5000 && currentLevel < fms.cruiseAltitude - 500
          ? currentLevel
          : fms.cruiseAltitude
        : undefined;
    set({
      ...(initial !== undefined ? { initialAltitude: initial } : {}),
      ...(fms.destinationElevation !== null
        ? { targetAltitude: Math.round((fms.destinationElevation + 1500) / 100) * 100 }
        : {}),
      ...(fms.grossWeight !== null ? { weight: fms.grossWeight } : {}),
      ...(fms.speedLimitCas !== null && fms.speedLimitAltitude !== null
        ? { limitCas: fms.speedLimitCas, limitAltitude: fms.speedLimitAltitude }
        : {}),
      ...(type === DescentType.Econ ? econ : {}),
      ...(fms.distanceToDestination !== null ? { distanceToTarget: Math.round(fms.distanceToDestination) } : {}),
      // The destination is the target
      targetWaypoint: undefined,
      isaDeviation: currentIsaDeviation(),
    });
    if (fms.destination === null) {
      toast.info(t('Performance.TopOfDescent.Calc.FmsNoDestination'));
    }
  };

  /**
   * A waypoint of the flight plan as the target: its altitude constraint as the target altitude (the entry stays without
   * one), and its distance along the flight plan
   */
  const selectTargetWaypoint = (ident: string) => {
    const waypoint = fmsWaypoints.find((w) => w.ident === ident);
    if (!waypoint) {
      set({ targetWaypoint: undefined });
      return;
    }
    set({
      targetWaypoint: waypoint.ident,
      ...(waypoint.constraint ? { targetAltitude: constraintTargetAltitude(waypoint.constraint) } : {}),
      ...(waypoint.distance !== null ? { distanceToTarget: Math.round(waypoint.distance) } : {}),
    });
  };

  // The waypoints of the flight plan, for the target list
  useEffect(() => {
    let current = true;
    requestFmsDescentData(eventBus).then((fms) => current && fms !== null && setFmsWaypoints(fms.waypoints));
    return () => {
      current = false;
    };
  }, [eventBus]);

  // The distance to the target waypoint follows the aircraft along the flight plan; a sequenced waypoint stops it
  useEffect(() => {
    if (targetWaypoint === undefined) {
      return;
    }
    let current = true;
    const refresh = async () => {
      const fms = await requestFmsDescentData(eventBus);
      if (!current || fms === null) {
        return;
      }
      setFmsWaypoints(fms.waypoints);
      const waypoint = fms.waypoints.find((w) => w.ident === targetWaypoint);
      if (!waypoint) {
        dispatch(setDescentValues({ targetWaypoint: undefined }));
      } else if (waypoint.distance !== null) {
        dispatch(setDescentValues({ distanceToTarget: Math.round(waypoint.distance) }));
      }
    };
    const interval = setInterval(refresh, TARGET_WAYPOINT_REFRESH_MS);
    return () => {
      current = false;
      clearInterval(interval);
    };
  }, [targetWaypoint, eventBus, dispatch]);

  const targetWaypointOptions = fmsWaypoints.map((w) => ({
    value: w.ident,
    displayValue: `${w.ident} ${constraintText(w.constraint)}`.trim(),
  }));
  if (targetWaypoint !== undefined && !fmsWaypoints.some((w) => w.ident === targetWaypoint)) {
    targetWaypointOptions.unshift({ value: targetWaypoint, displayValue: targetWaypoint });
  }

  const handleTypeChange = (newType: DescentType) => {
    if (newType === DescentType.Econ) {
      // ECON: the managed descent speeds of the FMS
      fillFromFms(true);
    } else {
      set({ type: newType, ...(type === DescentType.Econ ? { mach: undefined, cas: undefined } : {}) });
    }
  };

  // ---------------------------------------------------------------------------------------------- calculation

  const missingInputs = {
    initial: initialAltitude === undefined,
    target: targetAltitude === undefined,
    weight: weight === undefined,
    verticalSpeed: type === DescentType.GivenVs && verticalSpeed === undefined,
  };
  const inputsValid = !Object.values(missingInputs).some((m) => m);

  const handleCalculate = () => {
    if (!inputsValid) {
      return;
    }
    const perf = calculator.calculateDescent({
      type,
      initialAltitude,
      targetAltitude,
      weight,
      isaDeviation: isaDeviation ?? 0,
      headwind: headwind ?? 0,
      antiIce,
      speedBrakes: speedBrakes || emergency,
      fuelFactor: fuelFactor ?? 0,
      schedule,
      verticalSpeed,
    });
    if (perf.error === DescentPerformanceError.None) {
      dispatch(setDescentValues({ result: perf }));
    } else {
      dispatch(setDescentValues({ result: undefined }));
      toast.error(
        subReplacements(t(`Performance.TopOfDescent.Calc.Errors.${perf.error}`), {
          max_alt: calculator.maxAltitude.toFixed(0),
          oew: formatWeight(calculator.oew),
          mtow: formatWeight(calculator.mtow),
          weight_unit: weightUnitText,
        }),
      );
    }
  };

  const handleWindChange = (input: string) => {
    if (input === '0' || input === '') {
      set({ headwind: input === '' ? undefined : 0, windEntry: input });
    } else if (isWindMagnitudeOnly(input)) {
      const match = input.match(WIND_MAGNITUDE_ONLY_REGEX);
      const magnitude = parseFloat(match[2]);
      const tailwind = match[1] === 'TL' || match[1] === 'T' || match[1] === '-';
      set({ headwind: tailwind ? -magnitude : magnitude, windEntry: input });
    } else {
      set({ headwind: undefined, windEntry: input });
    }
  };

  // ---------------------------------------------------------------------------------------------- results

  // A new calculation starts at its T/D
  useEffect(() => setStartOffset(0), [result]);

  const weightUnitText = weightUnit === 'lb' ? 'klb' : 't';
  const formatWeight = (kg: number | undefined) =>
    kg === undefined ? '---.-' : ((weightUnit === 'lb' ? Units.kilogramToPound(kg) : kg) / 1000).toFixed(1);
  const formatFuel = (kg: number) =>
    Math.round(weightUnit === 'lb' ? Units.kilogramToPound(kg) : kg).toLocaleString('en-US');
  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${Math.round(seconds % 60)
      .toString()
      .padStart(2, '0')}`;
  const formatAltitude = (altitude: number) =>
    altitude >= 10_000 ? `FL${Math.round(altitude / 100)}` : `${Math.round(altitude)}`;

  return (
    <div className="flex h-content-section-reduced flex-col overflow-hidden text-base text-m3-text">
      {/* Data source and descent type */}
      <div className="mb-3 flex shrink-0 flex-row items-center">
        <PerfFillFrom enabled onClick={() => fillFromFms()} label={t('Performance.TopOfDescent.Calc.FillFromFms')} />
        <div className="grow" />
        <span className="mr-3 text-sm font-semibold text-m3-muted">
          {t('Performance.TopOfDescent.Calc.DescentType')}
        </span>
        <M3Segmented
          className="w-[32rem]"
          options={DESCENT_TYPES.map((d) => ({
            label: t(`Performance.TopOfDescent.Calc.Types.${d}`),
            selected: type === d,
            onClick: () => handleTypeChange(d),
          }))}
        />
      </div>

      {/* Inputs */}
      <div className="mb-3 flex shrink-0 flex-row">
        <Section className="mr-3 min-w-0 flex-1" title={t('Performance.TopOfDescent.Calc.SectionDescent')}>
          <Row label={t('Performance.TopOfDescent.Calc.InitialAltitude')} missing={missingInputs.initial}>
            <div className="flex w-44 flex-row">
              <SimpleInput
                className={`w-full min-w-0 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={initialAltitude}
                placeholder="ft"
                min={0}
                max={calculator.maxAltitude}
                decimalPrecision={0}
                onChange={(v) => set({ initialAltitude: parseNumber(v, true) })}
                number
              />
              <button
                type="button"
                className={`${PERF_SMALL_BUTTON} ml-1 shrink-0 px-2 text-xs font-bold hover:bg-m3-tile`}
                onClick={() => set({ initialAltitude: Math.round(pressureAltitude / 100) * 100 })}
              >
                A/C
              </button>
            </div>
          </Row>
          <Row label={t('Performance.TopOfDescent.Calc.TargetAltitude')} missing={missingInputs.target}>
            <SimpleInput
              className={`w-44 ${PERF_INPUT}`}
              fontSizeClassName="text-base"
              value={targetAltitude}
              placeholder="ft"
              min={-1000}
              max={calculator.maxAltitude}
              decimalPrecision={0}
              onChange={(v) => set({ targetAltitude: parseNumber(v, true) })}
              number
            />
          </Row>
          <Row label={t('Performance.TopOfDescent.Calc.TargetWaypoint')}>
            <SelectInput
              fontSizeClassName="text-base"
              className={`w-44 ${PERF_SELECT}`}
              value={targetWaypoint ?? ''}
              options={[{ value: '', displayValue: '-' }, ...targetWaypointOptions]}
              onChange={(v) => selectTargetWaypoint(v as string)}
              maxHeight={20}
            />
          </Row>
          {type === DescentType.GivenVs && (
            <Row label={t('Performance.TopOfDescent.Calc.VerticalSpeed')} missing={missingInputs.verticalSpeed}>
              <SimpleInput
                className={`w-44 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={verticalSpeed}
                placeholder="ft/min"
                min={100}
                max={6000}
                decimalPrecision={0}
                onChange={(v) => set({ verticalSpeed: parseNumber(v, true) })}
                number
              />
            </Row>
          )}
          <Row label={t('Performance.TopOfDescent.Calc.SpeedBrakes')}>
            <div className={emergency ? 'pointer-events-none opacity-40' : ''}>
              <M3Switch value={speedBrakes || emergency} onToggle={(v) => set({ speedBrakes: v })} />
            </div>
          </Row>
        </Section>

        <Section className="mr-3 min-w-0 flex-1" title={t('Performance.TopOfDescent.Calc.SectionSchedule')}>
          {(
            [
              ['Mach', 'mach', mach, schedule.mach, standard.mach, 3, 'M'],
              ['Speed', 'cas', cas, schedule.cas, standard.cas, 0, 'kt'],
              ['SpeedLimit', 'limitCas', limitCas, schedule.limitCas, standard.limitCas, 0, 'kt'],
              [
                'SpeedLimitAltitude',
                'limitAltitude',
                limitAltitude,
                schedule.limitAltitude,
                standard.limitAltitude,
                0,
                'ft',
              ],
            ] as const
          ).map(([label, key, entered, value, placeholder, precision, unit]) => (
            <Row key={key} label={t(`Performance.TopOfDescent.Calc.${label}`)}>
              <SimpleInput
                className={`w-44 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                // EMERGENCY: MMO/VMO; ECON: the managed speeds of the FMS; otherwise the entry, or the standard one
                value={emergency || (type === DescentType.Econ && (key === 'mach' || key === 'cas')) ? value : entered}
                placeholder={`${placeholder} ${unit}`}
                decimalPrecision={precision}
                onChange={(v) => set({ [key]: parseNumber(v) } as Parameters<typeof setDescentValues>[0])}
                number
                disabled={emergency || (type === DescentType.Econ && (key === 'mach' || key === 'cas'))}
              />
            </Row>
          ))}
        </Section>

        <Section className="min-w-0 flex-1" title={t('Performance.TopOfDescent.Calc.SectionConditions')}>
          <Row label={t('Performance.TopOfDescent.Calc.Weight')} missing={missingInputs.weight}>
            <div className="flex w-44 flex-row">
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
              <SelectInput
                fontSizeClassName="text-base"
                value={weightUnitText}
                className={`ml-1 w-[4.5rem] ${PERF_SELECT}`}
                options={[
                  { value: 't', displayValue: 't' },
                  { value: 'klb', displayValue: 'klb' },
                ]}
                onChange={(v: 't' | 'klb') => setWeightUnit(v === 'klb' ? 'lb' : 'kg')}
              />
            </div>
          </Row>
          <Row
            label={t('Performance.TopOfDescent.Calc.Temperature')}
            note={
              initialAltitude !== undefined
                ? `SAT ${Math.round(isaTemperature(initialAltitude) + (isaDeviation ?? 0))}°C`
                : undefined
            }
          >
            <div className="flex w-44 flex-row">
              <SimpleInput
                className={`w-full min-w-0 ${PERF_INPUT}`}
                fontSizeClassName="text-base"
                value={isaDeviation}
                placeholder="ISA +0"
                min={-60}
                max={60}
                decimalPrecision={0}
                onChange={(v) => set({ isaDeviation: parseNumber(v, true) })}
                number
                reverse
              />
              <button
                type="button"
                className={`${PERF_SMALL_BUTTON} ml-1 shrink-0 px-2 text-xs font-bold hover:bg-m3-tile`}
                onClick={() => set({ isaDeviation: currentIsaDeviation() })}
              >
                A/C
              </button>
            </div>
          </Row>
          <Row label={t('Performance.TopOfDescent.Calc.Wind')}>
            <SimpleInput
              className={`w-44 ${PERF_INPUT}`}
              fontSizeClassName="text-base"
              value={windEntry}
              placeholder="HD/TL kt"
              onChange={handleWindChange}
              uppercase
              wind
            />
          </Row>
          <Row label={t('Performance.TopOfDescent.Calc.AntiIce')}>
            <SelectInput
              fontSizeClassName="text-base"
              className={`w-44 ${PERF_SELECT}`}
              value={antiIce}
              onChange={(v: DescentAntiIce) => set({ antiIce: v })}
              options={[
                { value: DescentAntiIce.Off, displayValue: 'Off' },
                { value: DescentAntiIce.Engine, displayValue: 'Engine' },
                { value: DescentAntiIce.Total, displayValue: 'Total' },
              ]}
            />
          </Row>
          <Row label={t('Performance.TopOfDescent.Calc.FuelFactor')}>
            <SimpleInput
              className={`w-44 ${PERF_INPUT}`}
              fontSizeClassName="text-base"
              value={fuelFactor}
              placeholder="0.0 %"
              min={-10}
              max={20}
              decimalPrecision={1}
              onChange={(v) => set({ fuelFactor: parseNumber(v) })}
              number
              reverse
            />
          </Row>
        </Section>
      </div>

      {/* Results, profile and actions */}
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <div className="mr-3 flex h-full w-[30rem] shrink-0 flex-col">
          <ResultsPanel
            result={result}
            formatFuel={formatFuel}
            fuelUnit={weightUnit === 'lb' ? 'lb' : 'kg'}
            formatTime={formatTime}
            formatAltitude={formatAltitude}
          />
          <DescentCheck
            result={result}
            distanceToTarget={distanceToTarget}
            // An entered distance is not the one of the target waypoint any more
            onDistanceChange={(d) => dispatch(setDescentValues({ distanceToTarget: d, targetWaypoint: undefined }))}
            altitude={pressureAltitude}
            groundSpeed={groundSpeed}
          />
          {/* The buttons at the bottom, as on the takeoff and landing pages */}
          <div className="flex-1" />
          <div className="mt-3 flex shrink-0 flex-row">
            <M3Button className="mr-2 !h-12 flex-1" disabled={!inputsValid} onClick={handleCalculate}>
              <Calculator size={20} />
              <span className="text-base text-current">{t('Performance.TopOfDescent.Calc.Calculate')}</span>
            </M3Button>
            <M3Button tone="danger" className="!h-12" onClick={() => dispatch(clearDescentValues())}>
              <Trash size={20} />
              <span className="text-base text-current">{t('Performance.TopOfDescent.Calc.Clear')}</span>
            </M3Button>
          </div>
        </div>

        <M3Card className="h-full min-w-0 flex-1 px-4 py-3">
          <div className="flex shrink-0 flex-row items-center">
            <PerfTitle>{t('Performance.TopOfDescent.Calc.Profile')}</PerfTitle>
            <div className="grow" />
            <M3Segmented
              className="w-56"
              options={(['PROFILE', 'TABLE'] as const).map((v) => ({
                label: t(`Performance.TopOfDescent.Calc.View${v === 'PROFILE' ? 'Profile' : 'Table'}`),
                selected: view === v,
                onClick: () => setView(v),
              }))}
            />
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-hidden">
            {result === undefined ? (
              <div className="flex h-full items-center justify-center text-base text-m3-muted">
                {t('Performance.TopOfDescent.Calc.NoResult')}
              </div>
            ) : view === 'PROFILE' ? (
              <DescentProfile
                points={result.points}
                totalDistance={result.distance}
                targetAltitude={result.inputs.targetAltitude}
                startDistance={startOffset !== 0 ? result.distance + startOffset : undefined}
                aircraft={
                  distanceToTarget !== undefined
                    ? {
                        distanceToTarget,
                        altitude: pressureAltitude,
                        late: distanceToTarget < distanceNeeded(result, pressureAltitude),
                      }
                    : undefined
                }
              />
            ) : (
              <ProfileTable
                result={result}
                formatFuel={formatFuel}
                formatTime={formatTime}
                formatAltitude={formatAltitude}
              />
            )}
          </div>
          {result !== undefined && (
            <StartDistance result={result} offset={startOffset} onOffsetChange={setStartOffset} />
          )}
          <span className="shrink-0 text-xs leading-tight text-m3-muted">
            {/* Both aircraft use the anti-ice factors of the A320 FCOM table: the A380 FCOM has no such table */}
            {t(isA380 ? 'Performance.TopOfDescent.Calc.LegendA380' : 'Performance.TopOfDescent.Calc.Legend')}
          </span>
        </M3Card>
      </div>
    </div>
  );
};

/** The distance to the target waypoint is refreshed this often */
const TARGET_WAYPOINT_REFRESH_MS = 5_000;

/** The target altitude of an altitude constraint: altitude 1 (the upper one of a window), to the nearest 100 ft */
function constraintTargetAltitude(constraint: FmsDescentAltitudeConstraint): number {
  return Math.round(constraint.altitude1 / 100) * 100;
}

/** An altitude constraint as the F-PLN shows it: 9000, +9000, -9000, or 11000/9000 for a window */
function constraintText(constraint: FmsDescentAltitudeConstraint | null): string {
  if (constraint === null) {
    return '';
  }
  const alt1 = Math.round(constraint.altitude1).toFixed(0);
  switch (constraint.type) {
    case 'atOrAbove':
      return `+${alt1}`;
    case 'atOrBelow':
      return `-${alt1}`;
    case 'between':
      return `${alt1}/${Math.round(constraint.altitude2 ?? constraint.altitude1).toFixed(0)}`;
    default:
      return alt1;
  }
}

/** The distance in NM the descent of the results needs from an altitude to the target (the whole one above it) */
function distanceNeeded(result: DescentPerformanceResult, altitude: number): number {
  const points = result.points;
  if (points.length === 0 || altitude >= points[0].altitude) {
    return result.distance;
  }
  for (let i = 1; i < points.length; i++) {
    if (altitude >= points[i].altitude) {
      const a = points[i - 1];
      const b = points[i];
      const f = a.altitude === b.altitude ? 0 : (a.altitude - altitude) / (a.altitude - b.altitude);
      return result.distance - (a.distance + f * (b.distance - a.distance));
    }
  }
  return 0;
}

/** The start of the descent can be moved this far from the calculated T/D, in NM (half the distance at most, later) */
const START_OFFSET_MAX = 60;

interface StartDistanceProps {
  result: DescentPerformanceResult;
  offset: number;
  onOffsetChange: (offset: number) => void;
}

/**
 * The descent started earlier or later than the calculated T/D (e.g. vectors, or a shortcut): the V/S and path angle it
 * needs from the initial to the target altitude at the mean ground speed of the calculated descent, against the
 * calculated ones, and whether it is steeper than the idle descent (speed brakes) or shallower (thrust).
 */
const StartDistance = ({ result, offset, onOffsetChange }: StartDistanceProps) => {
  const distance = result.distance + offset;
  const ratio = result.distance / Math.max(distance, 0.1);
  // Same mean ground speed: the V/S scales with the distance, the tangent of the path angle too
  const rate = result.averageRate * ratio;
  const gradient = (Math.atan(Math.tan((result.averageGradient * Math.PI) / 180) * ratio) * 180) / Math.PI;
  const idle = result.inputs.type !== DescentType.GivenVs;
  const steeper = offset < 0 && idle;
  const tooSteep = steeper && result.inputs.speedBrakes;
  let note: React.ReactNode = null;
  if (steeper) {
    note = tooSteep ? (
      <span className="text-sm text-m3-on-error">{t('Performance.TopOfDescent.Calc.SteeperThanSpeedBrakes')}</span>
    ) : (
      <span className="text-sm text-m3-on-warn">{t('Performance.TopOfDescent.Calc.SteeperThanIdle')}</span>
    );
  } else if (offset > 0 && idle) {
    note = <span className="text-sm text-m3-text">{t('Performance.TopOfDescent.Calc.ShallowerThanIdle')}</span>;
  }
  const change =
    offset === 0
      ? t('Performance.TopOfDescent.Calc.StartAsCalculated')
      : t(`Performance.TopOfDescent.Calc.${offset > 0 ? 'StartEarlier' : 'StartLater'}`).replace(
          '{distance}',
          Math.abs(offset).toFixed(0),
        );
  return (
    <div className="mb-1 flex shrink-0 flex-col border-t border-m3-tile pt-2">
      <div className="flex flex-row items-center">
        <span className="mr-4 shrink-0 text-sm font-semibold text-m3-text">
          {t('Performance.TopOfDescent.Calc.StartDistance')}
        </span>
        {/* Reversed, as the chart: the farther from the target, the more to the left */}
        <Slider
          reverse
          className="flex-1"
          min={-Math.min(START_OFFSET_MAX, Math.floor(result.distance / 2))}
          max={START_OFFSET_MAX}
          step={1}
          value={offset}
          onChange={(v) => onOffsetChange(v as number)}
        />
        <span className="ml-4 w-28 shrink-0 text-right">
          <Value text={Math.round(distance).toFixed(0)} unit="NM" />
        </span>
      </div>
      <div className="flex flex-row items-center">
        <span className="text-sm text-m3-muted">{change}</span>
        <div className="grow" />
        <span className="mr-2 text-sm text-m3-muted">V/S</span>
        <Value
          text={`-${Math.round(rate / 10) * 10}`}
          unit="ft/min"
          caution={steeper && !tooSteep}
          warning={tooSteep}
        />
        <span className="ml-4 mr-2 text-sm text-m3-muted">FPA</span>
        <Value text={gradient.toFixed(1)} unit="°" caution={steeper && !tooSteep} warning={tooSteep} />
      </div>
      {note && <div className="leading-tight">{note}</div>}
    </div>
  );
};

interface ResultsPanelProps {
  result: DescentPerformanceResult | undefined;
  formatFuel: (kg: number) => string;
  fuelUnit: string;
  formatTime: (seconds: number) => string;
  formatAltitude: (altitude: number) => string;
}

/** The results in the layout of the RESULTS panel of the Airbus descent performance application (PER-IFT-DES-DSR) */
const ResultsPanel = ({ result, formatFuel, fuelUnit, formatTime, formatAltitude }: ResultsPanelProps) => {
  const antiIce = result?.estimates.includes(DescentPerformanceEstimate.AntiIce) ?? false;
  const crossover = result?.points.find((p) => p.event === 'CROSSOVER');
  const decel = result?.points.find((p) => p.event === 'DECEL');
  const notes = joinDescentNotes([
    crossover && `${t('Performance.TopOfDescent.Calc.Crossover')} ${formatAltitude(crossover.altitude)}`,
    decel && `${t('Performance.TopOfDescent.Calc.Decel')} ${formatAltitude(decel.altitude)}`,
  ]);
  const ruleOfThumb =
    result !== undefined ? ((result.inputs.initialAltitude - result.inputs.targetAltitude) / 1000) * 3 : undefined;
  return (
    <M3Card low className="mb-3 shrink-0 px-4 py-3">
      <PerfTitle className="mb-2">{t('Performance.TopOfDescent.Calc.Results')}</PerfTitle>
      <PerfResultRow className="mb-2">
        <PerfResult name={t('Performance.TopOfDescent.Calc.Distance')}>
          <Value
            text={result ? Math.round(result.distance).toFixed(0) : '---'}
            unit="NM"
            estimate={antiIce}
            primary
            big
          />
        </PerfResult>
        <PerfResult name={t('Performance.TopOfDescent.Calc.Time')}>
          <Value text={result ? formatTime(result.time) : '--:--'} unit="min" estimate={antiIce} big />
        </PerfResult>
        <PerfResult name={t('Performance.TopOfDescent.Calc.Fuel')}>
          <Value text={result ? formatFuel(result.fuel) : '---'} unit={fuelUnit} estimate={antiIce} big />
        </PerfResult>
      </PerfResultRow>
      <PerfResultRow className="mb-2">
        <PerfResult name="V/S">
          <Value text={result ? `-${Math.round(result.averageRate / 10) * 10}` : '----'} unit="ft/min" />
        </PerfResult>
        <PerfResult name="FPA">
          <Value text={result ? result.averageGradient.toFixed(1) : '-.-'} unit="°" />
        </PerfResult>
        <PerfResult name={t('Performance.TopOfDescent.Calc.RuleOfThumb')}>
          <span className="whitespace-nowrap text-lg font-bold text-m3-muted">
            {ruleOfThumb !== undefined ? `${Math.round(ruleOfThumb)} NM` : '---'}
          </span>
        </PerfResult>
      </PerfResultRow>
      <span className="text-xs leading-tight text-m3-muted">
        {/* One string (crossover · decel), then the separator only when the idle note (in amber) follows */}
        {`${notes}${notes && result?.verticalSpeedIdleBelow !== undefined ? DESCENT_NOTES_SEPARATOR : ''}`}
        {result?.verticalSpeedIdleBelow !== undefined && (
          <span className="text-xs text-m3-on-warn">
            {t('Performance.TopOfDescent.Calc.VsAtIdle').replace(
              '{altitude}',
              formatAltitude(result.verticalSpeedIdleBelow),
            )}
          </span>
        )}
      </span>
    </M3Card>
  );
};

interface DescentCheckProps {
  result: DescentPerformanceResult | undefined;
  distanceToTarget: number | undefined;
  onDistanceChange: (distance: number | undefined) => void;
  altitude: number;
  groundSpeed: number;
}

/**
 * The aircraft against the descent: with its altitude, ground speed and distance to the target, where to start the
 * descent, or the rate of descent and path angle needed to reach the target when it is too late for the profile.
 */
const DescentCheck = ({ result, distanceToTarget, onDistanceChange, altitude, groundSpeed }: DescentCheckProps) => {
  let message: React.ReactNode = (
    <span className="text-sm text-m3-muted">{t('Performance.TopOfDescent.Calc.CheckHelp')}</span>
  );
  if (result !== undefined && distanceToTarget !== undefined && altitude > result.inputs.targetAltitude) {
    const needed = distanceNeeded(result, altitude);
    const margin = distanceToTarget - needed;
    if (Math.abs(margin) < 2) {
      message = (
        <span className="text-sm font-bold text-m3-on-primary-container">
          {t('Performance.TopOfDescent.Calc.OnProfile')}
        </span>
      );
    } else if (margin > 0) {
      const minutes = groundSpeed > 50 ? Math.round((margin / groundSpeed) * 60) : undefined;
      message = (
        <span className="text-sm font-bold text-m3-on-primary-container">
          {t('Performance.TopOfDescent.Calc.StartIn').replace('{distance}', Math.round(margin).toFixed(0))}
          {minutes !== undefined ? ` (${minutes} min)` : ''}
        </span>
      );
    } else {
      const height = altitude - result.inputs.targetAltitude;
      const fpa = (Math.atan2(height, Math.max(distanceToTarget, 0.1) * 6076.12) * 180) / Math.PI;
      const rate = groundSpeed * 101.27 * Math.tan((fpa * Math.PI) / 180);
      // The V/S and FPA to set on the FCU: negative in descent, as on the RESULTS line
      message = (
        <span className="text-sm font-bold text-m3-on-warn">
          {t('Performance.TopOfDescent.Calc.Late')
            .replace('{distance}', Math.round(-margin).toFixed(0))
            .replace('{rate}', `-${(Math.round(rate / 100) * 100).toFixed(0)}`)
            .replace('{fpa}', `-${fpa.toFixed(1)}`)}
        </span>
      );
    }
  }
  return (
    <M3Card className="shrink-0 px-4 py-3">
      <div className="flex flex-row items-center">
        <PerfTitle>{t('Performance.TopOfDescent.Calc.Check')}</PerfTitle>
        <div className="grow" />
        <span className="text-xs text-m3-muted">
          {`${Math.round(altitude / 100) * 100} ft · GS ${Math.round(groundSpeed)} kt`}
        </span>
      </div>
      <div className="mt-1 flex h-10 flex-row items-center justify-between">
        <span className="text-sm font-semibold text-m3-text">
          {t('Performance.TopOfDescent.Calc.DistanceToTarget')}
        </span>
        <SimpleInput
          className={`w-32 ${PERF_INPUT}`}
          fontSizeClassName="text-base"
          value={distanceToTarget}
          placeholder="NM"
          min={0}
          max={999}
          decimalPrecision={0}
          onChange={(v) => {
            const n = parseInt(v);
            onDistanceChange(Number.isNaN(n) ? undefined : n);
          }}
          number
        />
      </div>
      <div className="mt-1 leading-tight">{message}</div>
    </M3Card>
  );
};

interface ProfileTableProps {
  result: DescentPerformanceResult;
  formatFuel: (kg: number) => string;
  formatTime: (seconds: number) => string;
  formatAltitude: (altitude: number) => string;
}

/**
 * The profile every 5000 ft (A380 FCOM PER-IFT-DES-DSR, table results). As in the FCOM table, RATE is the rate of
 * descent and GRDT the descent gradient, both positive in descent (ROD = TAS x sin GRDT).
 */
const ProfileTable = ({ result, formatFuel, formatTime, formatAltitude }: ProfileTableProps) => (
  <table className="w-full text-right text-sm text-m3-text">
    <thead className="text-xs text-m3-muted">
      <tr>
        {['ALT', 'TIME', 'DIST', 'FUEL', 'CAS', 'MACH', 'TAS', 'RATE', 'GRDT', ''].map((h) => (
          <th key={h} className="px-1 font-normal">
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {result.points.map((p) => (
        <tr key={`${p.altitude}${p.event ?? ''}`} className={p.event ? 'text-m3-on-primary-container' : ''}>
          <td className="px-1">{formatAltitude(p.altitude)}</td>
          <td className="px-1">{formatTime(p.time)}</td>
          <td className="px-1">{Math.round(p.distance)}</td>
          <td className="px-1">{formatFuel(p.fuel)}</td>
          <td className="px-1">{Math.round(p.cas)}</td>
          <td className="px-1">{p.mach.toFixed(3)}</td>
          <td className="px-1">{Math.round(p.tas)}</td>
          <td className="px-1">{p.rate > 0 ? Math.round(p.rate / 10) * 10 : ''}</td>
          <td className="px-1">{p.rate > 0 ? (-p.gradient).toFixed(1) : ''}</td>
          <td className="px-1 text-left text-xs">{p.event ?? ''}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
