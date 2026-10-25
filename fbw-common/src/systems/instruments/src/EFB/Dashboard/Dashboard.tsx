// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useState } from 'react';
import { AirframeType, GsxServiceStates, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { t } from '../Localization/translation';
import { useAppSelector } from '../Store/store';
import { TaxiRouteDirection } from '../Store/features/taxiRoute';
import { useFailuresOrchestrator } from '../failures-orchestrator-provider';
import { GSX_BAGGAGE_VARS, GsxBaggageId, gsxTurnaround } from '../Ground/Pages/Services/gsxTurnaround';
import { useDashboardPhase } from './useDashboardPhase';
import { useFuelStatus, usePayloadLoad } from './useServiceStatus';
import { useMinutesToTod, useSimUnixSeconds, useTakeoffUnixSeconds } from './useMinutesToTod';
import { useTripWeather } from './useTripWeather';
import { useLiveFigures } from './useLiveFigures';
import { useAircraftState } from './useAircraftState';
import { useFlightLog } from './useFlightLog';
import { useFmsFlightPlan } from './useFmsFlightPlan';
import { useSimbriefImport } from './useSimbriefImport';
import { buildAdvice } from './logic/advice';
import { dashboardCountdown, dashboardLayout, estimatedArrivalMs, serviceChip } from './logic/dashboardLayout';
import {
  formatHoursMinutes,
  formatLocalClock,
  localOffsetSeconds,
  simbriefWeightKg,
  sunsetLocal,
} from './logic/dashboardFormat';
import { flightSummary } from './logic/flightLog';
import { fuelVersusPlanKg } from './logic/fuelPlan';
import { taxiMinutes } from './logic/taxiTime';
import { turnaroundLateMinutes, turnaroundRows } from './logic/turnaround';
import { routeWindComponentKt } from './logic/weatherVerdict';
import { FlightStrip, StripTile } from './Cards/FlightStrip';
import { AdvicePanel } from './Cards/AdvicePanel';
import { AircraftStateCard } from './Cards/AircraftStateCard';
import { ChecklistCard } from './Cards/ChecklistCard';
import { CabinCard } from './Cards/CabinCard';
import { GroundServicesCard } from './Cards/GroundServicesCard';
import { FuelCard } from './Cards/FuelCard';
import { PayloadCard } from './Cards/PayloadCard';
import { WeatherCard } from './Cards/WeatherCard';
import { TurnaroundCard } from './Cards/TurnaroundCard';
import { FlightSummaryCard } from './Cards/FlightSummaryCard';
import { FlightPlanCard } from './Cards/FlightPlanCard';

/** Checklist rows that fit the card: the full column height in flight, half of it under another card on the ground */
const CHECKLIST_ROWS_FULL = 12;
const CHECKLIST_ROWS_HALF = 5;

const unixSecondsOf = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const Dashboard = () => {
  const isA380 = useAppSelector((state) => state.config.airframeInfo.variant) === AirframeType.A380_842;
  const aircraft = isA380 ? 'a380x' : 'a32nx';
  const airframeInfo = useAppSelector((state) => state.config.airframeInfo);
  const ofp = useAppSelector((state) => state.simbrief.data);
  const taxiRoute = useAppSelector((state) => state.taxiRoute);

  const { phase, hasOfp, onGround } = useDashboardPhase();
  const layout = dashboardLayout(phase, hasOfp);
  const { importOfp, pending: importPending } = useSimbriefImport();
  const fmsHasFlightPlan = useFmsFlightPlan(phase === 'atGate' && hasOfp);

  const live = useLiveFigures();
  const aircraftState = useAircraftState();
  const fuelStatus = useFuelStatus();
  const payload = usePayloadLoad();
  const minutesToTod = useMinutesToTod();
  const takeoffUnixSeconds = useTakeoffUnixSeconds();
  const nowUnixSeconds = useSimUnixSeconds();
  const log = useFlightLog();
  const weather = useTripWeather();
  const { activeFailures } = useFailuresOrchestrator();

  const [zuluSecondsOfDay] = useSimVar('E:ZULU TIME', 'seconds', 5_000);
  const [registration] = useSimVar('ATC ID', 'string', 10_000);
  const [destQnh] = useSimVar('L:A32NX_DESTINATION_QNH', 'number', 2_000);
  const [mda] = useSimVar('L:AIRLINER_MINIMUM_DESCENT_ALTITUDE', 'number', 2_000);
  const [dh] = useSimVar('L:AIRLINER_DECISION_HEIGHT', 'number', 2_000);
  const [pushbackAttached] = useSimVar('Pushback Attached', 'enum', 1_000);
  const [gsxDeparture] = useSimVar('L:FSDT_GSX_DEPARTURE_STATE', 'number', 1_000);
  const [gsxBaggageLoading] = useSimVar(GSX_BAGGAGE_VARS[GsxBaggageId.Loading].active, 'number', 1_000);

  // The GSX completions are remembered outside the sim vars; this renders the dashboard when one changes
  const [, setGsxMemoryVersion] = useState(0);
  useEffect(() => {
    const unsubscribe = gsxTurnaround.subscribe(() => setGsxMemoryVersion((version) => version + 1));
    return () => {
      unsubscribe();
    };
  }, []);

  const nowMs = nowUnixSeconds * 1000;
  const stdMs = hasOfp && unixSecondsOf(ofp.schedOut) > 0 ? unixSecondsOf(ofp.schedOut) * 1000 : null;
  const etaMs = hasOfp ? estimatedArrivalMs(takeoffUnixSeconds, ofp.tripTime, unixSecondsOf(ofp.schedIn)) : null;
  const etaUtc = etaMs === null ? null : new Date(etaMs);

  // A measured taxi route counts only for the airport and direction of this leg
  const routeLength = (direction: TaxiRouteDirection, icao: string) =>
    taxiRoute.direction === direction && taxiRoute.icao === icao && taxiRoute.routeLengthM
      ? taxiRoute.routeLengthM
      : null;
  const taxiOut = hasOfp
    ? taxiMinutes(routeLength(TaxiRouteDirection.Departure, ofp.departingAirport), ofp.taxiOutTime)
    : null;
  const taxiInLength = taxiRoute.stand ? routeLength(TaxiRouteDirection.Arrival, ofp.arrivingAirport) : null;
  const taxiIn = taxiInLength !== null ? taxiMinutes(taxiInLength, null) : null;

  // The stand typed on the taxi page counts for the airport of the frame: the departure before the flight, the
  // arrival after it
  const frameAirport = layout === 'arrived' || layout === 'flight' ? ofp.arrivingAirport : ofp.departingAirport;
  const stand = !hasOfp || taxiRoute.icao === frameAirport ? taxiRoute.stand : undefined;

  const countdown = dashboardCountdown({
    phase,
    nowMs,
    stdMs,
    etaMs,
    taxiOut,
    taxiIn,
    minutesToTod,
    takeoffKnown: takeoffUnixSeconds !== null,
  });

  const fuelChip = onGround ? serviceChip(fuelStatus, hasOfp) : null;
  const payloadChip = onGround ? serviceChip(payload.status, hasOfp) : null;

  const rows = turnaroundRows({
    nowMs,
    stdMs,
    fuel: fuelStatus,
    payload: payload.status,
    cargoKg: payload.cargoKg,
    cargoTargetKg: payload.cargoTargetKg,
    gsxBaggageLoading: gsxBaggageLoading > 0,
    gsxBaggageDone: gsxTurnaround.isDone(GsxBaggageId.Loading),
    openDoorCount: aircraftState.openDoors.length,
    pushbackActive:
      pushbackAttached > 0 || gsxDeparture === GsxServiceStates.REQUESTED || gsxDeparture === GsxServiceStates.ACTIVE,
  });

  const plan = {
    blockMinutes:
      hasOfp && unixSecondsOf(ofp.schedIn) > unixSecondsOf(ofp.schedOut)
        ? (unixSecondsOf(ofp.schedIn) - unixSecondsOf(ofp.schedOut)) / 60
        : null,
    flightMinutes: hasOfp && ofp.tripTime > 0 ? ofp.tripTime / 60 : null,
    tripFuelKg: hasOfp ? simbriefWeightKg(ofp.fuels.enrouteBurn, ofp.units) : null,
    landingWeightKg: hasOfp ? simbriefWeightKg(ofp.weights.estLandingWeight, ofp.units) : null,
  };
  const summary = flightSummary(log, plan);

  const avgWindComponentKt = hasOfp
    ? routeWindComponentKt(
        Number.parseFloat(ofp.weather.avgWindDir),
        Number.parseFloat(ofp.weather.avgWindSpeed),
        { lat: ofp.departingPosLat, long: ofp.departingPosLong },
        { lat: ofp.arrivingPosLat, long: ofp.arrivingPosLong },
      )
    : null;

  const advice = buildAdvice({
    aircraft,
    phase,
    hasOfp,
    minutesToTod: minutesToTod ? minutesToTod.minutes : null,
    destQnh,
    mda,
    dh,
    fmsHasFlightPlan,
    turnaroundLateMin: turnaroundLateMinutes(rows, stdMs),
    avgWindComponentKt,
    activeFailures: activeFailures.size,
    fuelUsedDeltaKg: summary.fuelUsedDeltaKg,
    dep: weather.dep,
    dest: weather.dest,
    altn: weather.altn,
    etaUtc,
  });

  const localClock = formatLocalClock(live.localSecondsOfDay);
  let stripTiles: StripTile[];
  if (layout === 'gateNoOfp') {
    const sunset = sunsetLocal(
      nowUnixSeconds,
      live.latitudeDeg,
      live.longitudeDeg,
      localOffsetSeconds(live.localSecondsOfDay, zuluSecondsOfDay),
    );
    const registrationText = typeof registration === 'string' && registration ? ` · ${registration}` : '';
    stripTiles = [
      { label: t('Dashboard.Strip.LocalTime'), value: localClock },
      {
        label: t('Dashboard.Strip.Sunset'),
        value: sunset
          ? t('Dashboard.Strip.SunsetIn', [{ time: sunset.clock }, { left: formatHoursMinutes(sunset.minutesLeft) }])
          : '--',
      },
      { label: t('Dashboard.Strip.Aircraft'), value: `${airframeInfo.variant}${registrationText}` },
    ];
  } else {
    stripTiles = [
      {
        label: t('Dashboard.Strip.Altitude'),
        value: t('Dashboard.Strip.AltitudeValue', [{ feet: String(Math.round(live.altitudeFt)) }]),
      },
      {
        label: t('Dashboard.Strip.Speed'),
        value: t('Dashboard.Strip.SpeedValue', [
          { mach: String(Math.round(live.mach * 100)) },
          { groundSpeed: String(Math.round(live.groundSpeedKt)) },
        ]),
      },
      { label: t('Dashboard.Strip.LocalTime'), value: localClock },
    ];
  }

  const fuelCard = (
    <FuelCard
      layout={layout}
      chip={fuelChip}
      fobKg={live.fobKg}
      fuelFlowKgPerHour={live.fuelFlowKgPerHour}
      versusPlanKg={
        hasOfp
          ? fuelVersusPlanKg(live.fobKg, ofp.fuelPlan ?? [], takeoffUnixSeconds, nowUnixSeconds, (value) =>
              simbriefWeightKg(value, ofp.units),
            )
          : null
      }
      className={layout === 'arrived' ? 'flex-1' : 'shrink-0'}
    />
  );
  const payloadCard = (
    <PayloadCard
      layout={layout}
      chip={payloadChip}
      paxOnBoard={payload.paxOnBoard}
      paxTarget={payload.paxTarget}
      cargoKg={payload.cargoKg}
      zfwKg={live.zfwKg}
      grossWeightKg={live.grossWeightKg}
      zfwCgPercentMac={live.zfwCgPercentMac}
      className={layout === 'arrived' ? 'shrink-0' : 'mt-3 shrink-0'}
    />
  );

  const weatherCard = (
    <WeatherCard
      layout={layout}
      phase={phase}
      weather={weather}
      aircraft={aircraft}
      etaUtc={etaUtc}
      className="mt-3 flex-1"
    />
  );

  // In flight the ground cards give way to three columns: checklists and cabin, the plan figures, the destination
  const inFlightFrame = layout === 'flight' || layout === 'noOfp';
  let body: JSX.Element;
  if (inFlightFrame) {
    body = (
      <>
        <div className="flex min-h-0 min-w-0 flex-[1.6] flex-col">
          <ChecklistCard maxRows={CHECKLIST_ROWS_FULL} withPreview className="min-h-0 flex-1" />
          <CabinCard className="mt-3" />
        </div>
        <div className="ml-3 flex min-h-0 min-w-0 flex-1 flex-col">
          {fuelCard}
          {payloadCard}
          {hasOfp && <FlightPlanCard avgWindComponentKt={avgWindComponentKt} className="mt-3 flex-1" />}
        </div>
        <div className="ml-3 flex min-h-0 min-w-0 flex-1 flex-col">
          <WeatherCard
            layout={layout}
            phase={phase}
            weather={weather}
            aircraft={aircraft}
            etaUtc={etaUtc}
            className="flex-1"
          />
        </div>
      </>
    );
  } else if (layout === 'arrived') {
    // The summary and the fuel share the top row, so the payload starts level with the checklists and ground services
    body = (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-row items-stretch">
          <FlightSummaryCard summary={summary} plan={plan} className="min-w-0 flex-1" />
          <div className="ml-3 flex w-[36rem] shrink-0 flex-col">{fuelCard}</div>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-row">
          <ChecklistCard maxRows={CHECKLIST_ROWS_HALF} arrived className="min-w-0 flex-1" />
          <GroundServicesCard className="ml-3 min-w-0 flex-1" />
          <div className="ml-3 flex min-h-0 w-[36rem] shrink-0 flex-col">
            {payloadCard}
            {weatherCard}
          </div>
        </div>
      </div>
    );
  } else {
    let topLeft: JSX.Element | null = null;
    if (layout === 'gateNoOfp') {
      topLeft = <AircraftStateCard state={aircraftState} />;
    } else if (layout === 'gateOfp') {
      topLeft = <TurnaroundCard rows={rows} className="shrink-0" />;
    }
    body = (
      <>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {topLeft}
          <div className={`flex min-h-0 flex-1 flex-row ${topLeft ? 'mt-3' : ''}`}>
            <ChecklistCard maxRows={CHECKLIST_ROWS_HALF} className="min-w-0 flex-1" />
            <GroundServicesCard className="ml-3 min-w-0 flex-1" />
          </div>
        </div>
        <div className="ml-3 flex min-h-0 w-[36rem] shrink-0 flex-col">
          {fuelCard}
          {payloadCard}
          {weatherCard}
        </div>
      </>
    );
  }

  return (
    <div className="flex h-content-section-reduced min-h-0 w-full flex-col overflow-hidden text-m3-text">
      <FlightStrip
        layout={layout}
        phase={phase}
        countdown={countdown}
        tiles={stripTiles}
        aircraftState={aircraftState.chip}
        airport={taxiRoute.icao || undefined}
        stand={stand}
        taxiOut={taxiOut}
        etaMs={etaMs}
        takeoffUnixSeconds={takeoffUnixSeconds}
        log={log}
        importOfp={importOfp}
        importPending={importPending}
      />
      <AdvicePanel advice={advice} />
      <div className="mt-3 flex min-h-0 flex-1 flex-row overflow-hidden">{body}</div>
    </div>
  );
};
