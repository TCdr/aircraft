// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { AirplaneFill, CloudArrowDown } from 'react-bootstrap-icons';
import { useAppSelector, useModals } from '@flybywiresim/flypad';
import { t } from '../../Localization/translation';
import { M3ActionChip, M3Button } from '../../UtilComponents/Material/Material';
import { flightLineProgress, timeOverPoint } from '../Widgets/flightLineMarks';
import { Countdown, DashboardLayout } from '../logic/dashboardLayout';
import { DashboardPhase } from '../logic/dashboardPhase';
import { AircraftStateChip } from '../logic/aircraftState';
import { FlightLog } from '../logic/flightLog';
import { formatHoursMinutes, formatUtcClock, ofpRouteText } from '../logic/dashboardFormat';
import { DashboardCard, Field, FieldLabel, FieldRow, HeaderChip, PANEL_FRAME, StatusBox } from './CardParts';

export interface StripTile {
  label: string;
  value: string;
}

export interface FlightStripProps {
  layout: DashboardLayout;
  phase: DashboardPhase;
  countdown: Countdown | null;
  /** Live figures of the frames without a flight plan (gate without OFP, flight without OFP) */
  tiles: StripTile[];
  aircraftState: AircraftStateChip;
  /** The airport and stand typed on the taxi page, the only source without an OFP */
  stand?: string;
  airport?: string;
  taxiOut: { minutes: number; planned: boolean } | null;
  etaMs: number | null;
  /** The latched takeoff time, null before takeoff */
  takeoffUnixSeconds: number | null;
  log: FlightLog | null;
  importOfp: () => void;
  importPending: boolean;
}

const PHASE_KEYS: Record<DashboardPhase, string> = {
  atGate: 'Dashboard.Phase.AtGate',
  taxiOut: 'Dashboard.Phase.TaxiOut',
  takeoff: 'Dashboard.Phase.Takeoff',
  climb: 'Dashboard.Phase.Climb',
  cruise: 'Dashboard.Phase.Cruise',
  descent: 'Dashboard.Phase.Descent',
  approach: 'Dashboard.Phase.Approach',
  taxiIn: 'Dashboard.Phase.TaxiIn',
  arrived: 'Dashboard.Phase.Arrived',
};

const STATE_KEYS: Record<AircraftStateChip, string> = {
  coldDark: 'Dashboard.State.ColdDark',
  powered: 'Dashboard.State.Powered',
  enginesRunning: 'Dashboard.State.EnginesRunning',
};

const COUNTDOWN_KEYS: Record<Countdown['kind'], string> = {
  offBlocks: 'Dashboard.Strip.Countdown.OffBlocks',
  runway: 'Dashboard.Strip.Countdown.Runway',
  gate: 'Dashboard.Strip.Countdown.Gate',
  tod: 'Dashboard.Strip.Countdown.Tod',
  destination: 'Dashboard.Strip.Countdown.Destination',
};

const unixMs = (seconds: string) => {
  const parsed = Number.parseInt(seconds, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : null;
};

const ImportButton: FC<{ onClick: () => void; pending: boolean; labelKey: string; className?: string }> = ({
  onClick,
  pending,
  labelKey,
  className,
}) => (
  <M3Button tone="primary" onClick={onClick} disabled={pending} className={`!h-10 !rounded ${className ?? ''}`}>
    <CloudArrowDown size={18} className={pending ? 'animate-bounce' : ''} />
    <span className="whitespace-nowrap text-sm font-extrabold uppercase tracking-wider text-current">
      {t(labelKey)}
    </span>
  </M3Button>
);

interface LineMarkProps {
  name: string;
  progress: number;
  time: string;
  flightPlanProgress: number;
}

const FlightLineMark: FC<LineMarkProps> = ({ name, progress, time, flightPlanProgress }) => {
  const passed = flightPlanProgress >= progress;
  const textColor = passed ? 'text-m3-on-primary-container' : 'text-m3-muted';
  return (
    <div
      className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${progress}%` }}
    >
      <span className={`text-xs font-extrabold tracking-widest ${textColor}`}>{name}</span>
      <div className={`my-0.5 h-3 w-px ${passed ? 'bg-m3-on-primary-container' : 'bg-m3-text'}`} />
      <span className={`text-xs font-bold ${textColor}`}>{time}</span>
    </div>
  );
};

export const RouteDialog: FC<{ route: string }> = ({ route }) => {
  const { popModal } = useModals();
  return (
    <div className={`flex w-8/12 flex-col p-6 ${PANEL_FRAME}`}>
      <span className="text-lg font-extrabold uppercase tracking-wider text-m3-text">{t('Dashboard.Strip.Route')}</span>
      <p className="mt-3 font-mono text-base leading-relaxed text-m3-text">{route}</p>
      <M3Button tone="primary" className="mt-6 !h-11 !rounded" onClick={popModal}>
        <span className="text-sm font-extrabold uppercase tracking-wider text-current">
          {t('Dashboard.Strip.Close')}
        </span>
      </M3Button>
    </div>
  );
};

/** Where the aircraft stands, e.g. "Stand F32 · RWY 09L" */
const standAndRunway = (stand: string, runway: string) =>
  runway
    ? `${t('Dashboard.Strip.Stand', [{ stand }])} · ${t('Dashboard.Weather.Runway', [{ runway }])}`
    : t('Dashboard.Strip.Stand', [{ stand }]);

/** The flight of the OFP: flight number and airports, the progress line with T/C and T/D, the phase and countdown */
const PlannedStrip: FC<FlightStripProps> = (props) => {
  const { layout, phase, countdown, taxiOut, etaMs, takeoffUnixSeconds, log, importOfp, importPending, stand } = props;
  const { showModal } = useModals();
  const data = useAppSelector((state) => state.simbrief.data);
  const { flightPlanProgress } = useAppSelector((state) => state.flightProgress);

  const stdMs = unixMs(data.schedOut);
  const staMs = unixMs(data.schedIn);
  const departure = { lat: data.departingPosLat, long: data.departingPosLong };
  const arrival = { lat: data.arrivingPosLat, long: data.arrivingPosLong };
  const marks = [
    { name: t('Dashboard.Strip.TopOfClimb'), point: data.topOfClimb },
    { name: t('Dashboard.Strip.TopOfDescent'), point: data.topOfDescent },
  ]
    .filter((mark) => mark.point)
    .map((mark) => ({
      name: mark.name,
      progress: flightLineProgress(departure, arrival, mark.point!),
      time: timeOverPoint(data.schedOut, data.taxiOutTime, mark.point!, takeoffUnixSeconds),
    }));

  const flightLevel = t('Dashboard.Strip.FlightLevel', [
    { level: String(Math.round(data.cruiseAltitude / 100)).padStart(3, '0') },
  ]);
  const route = ofpRouteText(data);
  const clock = (ms: number | null) => (ms === null ? '--:--' : formatUtcClock(ms));
  const flightTime = data.tripTime > 0 ? formatHoursMinutes(data.tripTime / 60) : null;
  const flightNumber = data.airline || data.flightNum ? `${data.airline}${data.flightNum}` : '';
  const alternate = data.altIcao ? t('Dashboard.Strip.Alternate', [{ icao: data.altIcao }]) : '';

  let left = `${t('Dashboard.Strip.Std')} ${clock(stdMs)}`;
  let middle = `${flightLevel} · ${t('Dashboard.Strip.CostIndex')} ${data.costInd}`;
  let right = `${t('Dashboard.Strip.Sta')} ${clock(staMs)}`;
  let place = alternate;
  if (layout === 'gateOfp') {
    if (taxiOut) {
      left += ` · ${t(taxiOut.planned ? 'Dashboard.Strip.TaxiPlanned' : 'Dashboard.Strip.Taxi', [{ minutes: String(taxiOut.minutes) }])}`;
    }
    if (flightTime) {
      middle += ` · ${t('Dashboard.Strip.FlightTime', [{ time: flightTime }])}`;
    }
    if (stand) {
      place = standAndRunway(stand, data.departingRunway);
    }
  } else if (layout === 'flight') {
    if (log && log.offBlocks) {
      left = `${t('Dashboard.Strip.OffBlocks')} ${formatUtcClock(log.offBlocks.unixSeconds * 1000)}`;
    }
    right = `${t('Dashboard.Strip.Eta')} ${clock(etaMs)}`;
  } else if (layout === 'arrived') {
    if (log && log.offBlocks) {
      left += ` · ${t('Dashboard.Strip.Off')} ${formatUtcClock(log.offBlocks.unixSeconds * 1000)}`;
    }
    middle = flightLevel;
    if (log && log.onBlocks) {
      right += ` · ${t('Dashboard.Strip.On')} ${formatUtcClock(log.onBlocks.unixSeconds * 1000)}`;
    }
    if (stand) {
      place = standAndRunway(stand, data.arrivingRunway);
    }
  }

  const phaseField = (
    <Field label={t('Dashboard.Strip.Phase')} value={<StatusBox tone="active">{t(PHASE_KEYS[phase])}</StatusBox>} />
  );

  return (
    <>
      <div className="flex shrink-0 flex-row items-center">
        <div className="flex w-72 shrink-0 flex-col">
          {flightNumber && (
            <span className="truncate text-xs font-extrabold uppercase tracking-wider text-m3-on-warn">
              {flightNumber}
            </span>
          )}
          <span className="truncate text-3xl font-extrabold leading-tight text-m3-text">
            {t('Dashboard.Strip.Airports', [{ from: data.departingAirport }, { to: data.arrivingAirport }])}
          </span>
          {place && <FieldLabel>{place}</FieldLabel>}
        </div>
        <div className="mx-6 flex min-w-0 flex-1 flex-col">
          <div className="relative flex h-12 flex-row items-center">
            <div className="absolute inset-x-0 border-b-4 border-dashed border-m3-outline" />
            {marks.map((mark) => (
              <FlightLineMark key={mark.name} {...mark} flightPlanProgress={flightPlanProgress} />
            ))}
            <div className="relative h-1 bg-m3-primary" style={{ width: `${flightPlanProgress}%` }}>
              {!!flightPlanProgress && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
                  <AirplaneFill size={24} className="rotate-90 text-m3-on-primary-container" />
                </div>
              )}
            </div>
          </div>
          <div className="mt-1 flex flex-row">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-m3-muted">{left}</span>
            <span className="ml-3 min-w-0 flex-1 truncate text-center text-xs font-semibold text-m3-muted">
              {middle}
            </span>
            <span className="ml-3 min-w-0 flex-1 truncate text-right text-xs font-semibold text-m3-muted">{right}</span>
          </div>
        </div>
        {layout === 'arrived' ? (
          <div className="flex shrink-0 flex-row items-center">
            <div className="flex w-32 flex-row">{phaseField}</div>
            <ImportButton
              onClick={importOfp}
              pending={importPending}
              labelKey="Dashboard.Strip.ImportNextOfp"
              className="ml-3"
            />
          </div>
        ) : (
          <FieldRow className="w-64">
            {phaseField}
            {countdown && (
              <Field
                label={t('Dashboard.Strip.CountdownIn', [{ what: t(COUNTDOWN_KEYS[countdown.kind]) }])}
                value={formatHoursMinutes(countdown.minutes)}
                detail={countdown.planned ? t('Dashboard.Strip.Planned') : undefined}
              />
            )}
          </FieldRow>
        )}
      </div>
      {layout === 'gateOfp' && (
        <div className="mt-2 flex shrink-0 flex-row items-center border-t border-m3-outline pt-2">
          <FieldLabel className="shrink-0">{t('Dashboard.Strip.Route')}</FieldLabel>
          <span className="ml-3 min-w-0 flex-1 truncate font-mono text-sm text-m3-text">{route}</span>
          <M3ActionChip className="ml-3" onClick={() => showModal(<RouteDialog route={route} />)}>
            {t('Dashboard.Strip.ShowAll')}
          </M3ActionChip>
        </div>
      )}
    </>
  );
};

/** Without an OFP: live figures and the import */
const LiveStrip: FC<FlightStripProps> = ({ layout, tiles, airport, stand, importOfp, importPending }) => {
  const history = useHistory();
  const atGate = layout === 'gateNoOfp';
  const title = atGate && airport ? airport : t('Dashboard.Strip.NoOfp');
  const detail = atGate
    ? stand
      ? t('Dashboard.Strip.Stand', [{ stand }])
      : t('Dashboard.Strip.NoOfpGate')
    : t('Dashboard.Strip.NoOfpDetail');

  return (
    <div className="flex shrink-0 flex-row items-center">
      <div className="flex w-64 shrink-0 flex-col">
        <span className="truncate text-3xl font-extrabold leading-tight text-m3-text">{title}</span>
        <span className="mt-1 text-xs font-semibold text-m3-muted">{detail}</span>
      </div>
      <FieldRow className="mx-6 min-w-0 flex-1">
        {tiles.map((tile) => (
          <Field key={tile.label} label={tile.label} value={tile.value} />
        ))}
      </FieldRow>
      <div className="flex shrink-0 flex-row items-center">
        {atGate && (
          <M3Button
            tone="outline"
            className="mr-3 !h-10 !rounded"
            onClick={() => history.push('/presets/aircraft-states')}
          >
            <span className="whitespace-nowrap text-sm font-extrabold uppercase tracking-wider text-current">
              {t('Dashboard.Strip.LoadPreset')}
            </span>
          </M3Button>
        )}
        <ImportButton onClick={importOfp} pending={importPending} labelKey="Dashboard.Strip.ImportOfp" />
      </div>
    </div>
  );
};

export const FlightStrip: FC<FlightStripProps> = (props) => {
  const live = props.layout === 'gateNoOfp' || props.layout === 'noOfp';
  const atGate = props.layout === 'gateNoOfp';
  return (
    <DashboardCard
      title={t('Dashboard.Strip.Title')}
      section="flight"
      className="shrink-0"
      bodyClassName="px-4 py-2"
      trailing={
        live ? (
          <HeaderChip tone={atGate ? 'idle' : 'active'}>
            {t(atGate ? STATE_KEYS[props.aircraftState] : PHASE_KEYS[props.phase])}
          </HeaderChip>
        ) : undefined
      }
    >
      {live ? <LiveStrip {...props} /> : <PlannedStrip {...props} />}
    </DashboardCard>
  );
};
