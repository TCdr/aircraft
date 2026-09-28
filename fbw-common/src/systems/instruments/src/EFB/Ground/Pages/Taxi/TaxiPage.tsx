// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useMemo, useState } from 'react';
import { AirframeType, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { useEventBus } from '@flybywiresim/flypad';
import {
  BtvExit,
  OansControlEvents,
  OansMapProjection,
  parseTaxiClearance,
  TaxiLineKind,
  TaxiPoint,
  taxiRoute,
  TaxiRoute,
  TaxiRouteError,
  TaxiRouteStart,
  TaxiRouteTarget,
  taxiRouteFlagPoints,
  taxiRouteRunwayCrossings,
  taxiRouteToHoldingPoint,
  TaxiRunwayEntry,
  taxiFindStand,
  taxiStandMatches,
} from '@flybywiresim/fbw-sdk';
import { ArrowClockwise, CheckLg, Lightbulb, Trash } from 'react-bootstrap-icons';
import { t } from '../../../Localization/translation';
import { SimpleInput } from '../../../UtilComponents/Form/SimpleInput/SimpleInput';
import { SelectInput } from '../../../UtilComponents/Form/SelectInput/SelectInput';
import { SelectGroup, SelectItem } from '../../../UtilComponents/Form/Select';
import { useAppDispatch, useAppSelector } from '../../../Store/store';
import {
  clearTaxiRoute,
  setTaxiRouteValues,
  TaxiRouteDirection,
  TaxiRouteStartMode,
} from '../../../Store/features/taxiRoute';
import { loadTaxiAirport, TaxiAirportState } from './TaxiAirport';
import { TaxiMap } from './TaxiMap';

/** The aircraft is at the airport within this distance of its reference point, in metres */
const AT_AIRPORT_DISTANCE = 8000;
/** Stands listed under the stand field while typing */
const STAND_SUGGESTIONS = 8;

const START_MODES: Record<TaxiRouteDirection, TaxiRouteStartMode[]> = {
  [TaxiRouteDirection.Arrival]: [TaxiRouteStartMode.Exit, TaxiRouteStartMode.Aircraft],
  [TaxiRouteDirection.Departure]: [TaxiRouteStartMode.Stand, TaxiRouteStartMode.Aircraft],
};

const Section: FC<{ title: string }> = ({ title, children }) => (
  <div className="flex flex-col rounded-md border-2 border-theme-accent px-3 pb-3 pt-1.5">
    <h2 className="mb-1.5 text-base font-bold uppercase tracking-wider text-theme-unselected">{title}</h2>
    <div className="flex flex-col space-y-2">{children}</div>
  </div>
);

const Row: FC<{ label: string; missing?: boolean }> = ({ label, missing, children }) => (
  <div className="flex h-10 flex-row items-center justify-between">
    <span className={`mr-2 whitespace-nowrap ${missing ? 'text-utility-amber' : 'text-theme-text'}`}>{label}</span>
    {children}
  </div>
);

const buttonClass =
  'flex flex-row items-center justify-center space-x-2 rounded-md border-2 py-1.5 outline-none transition duration-100 disabled:opacity-40';

/** The route as a clearance reads: EXIT B3, A, K, GATE 42 (or GATE 42, A, S1, HOLDING POINT RWY 09) */
function routeText(route: TaxiRoute, end: string | null): string {
  const parts: string[] = [];
  for (const leg of route.legs) {
    if (leg.name === null) {
      continue;
    }
    let text = leg.name;
    if (leg.kind === TaxiLineKind.Exit) {
      text = `${t('Ground.Taxi.Exit')} ${leg.name}`;
    } else if (leg.kind === TaxiLineKind.Stand) {
      text = `${t('Ground.Taxi.StandShort')} ${leg.name}`;
    }
    if (parts[parts.length - 1] !== text) {
      parts.push(text);
    }
  }
  if (end) {
    parts.push(end);
  }
  return parts.join(' → ');
}

/**
 * The taxi route page, on the Navigraph airport map: after landing from a runway exit (or the aircraft) to a stand; for
 * departure from a stand (or the aircraft) to the holding point of a runway entry. The shortest route along named
 * taxiways is suggested; the crew edits the taxiway list to match the ATC clearance and accepts it.
 */
export const TaxiPage = () => {
  const dispatch = useAppDispatch();
  const { icao, direction, startMode, runway, exit, entry, stand, clearance, accepted } = useAppSelector(
    (state) => state.taxiRoute,
  );
  const { departingAirport, arrivingAirport } = useAppSelector((state) => state.simbrief.data);
  const set = (values: Parameters<typeof setTaxiRouteValues>[0]) => dispatch(setTaxiRouteValues(values));
  const departure = direction === TaxiRouteDirection.Departure;
  const eventBus = useEventBus();
  /** The A380 shows the accepted route on its OANS */
  const hasOans = useAppSelector((state) => state.config.airframeInfo.variant) === AirframeType.A380_842;

  const [latitude] = useSimVar('PLANE LATITUDE', 'degrees', 500);
  const [longitude] = useSimVar('PLANE LONGITUDE', 'degrees', 500);
  const [heading] = useSimVar('PLANE HEADING DEGREES TRUE', 'degrees', 500);

  const [airportState, setAirportState] = useState<TaxiAirportState | null>(null);
  /** The aircraft position the route starts from, taken when the crew asks for it */
  const [aircraftStart, setAircraftStart] = useState<{ point: TaxiPoint; heading: number } | null>(null);

  useEffect(() => {
    if (!/^[A-Z0-9]{4}$/.test(icao)) {
      setAirportState(null);
      return;
    }
    let current = true;
    setAirportState({ state: 'loading' });
    loadTaxiAirport(icao).then((state) => current && setAirportState(state));
    return () => {
      current = false;
    };
  }, [icao]);

  const airport = airportState?.state === 'loaded' ? airportState.airport : null;

  // The aircraft on the airport map, when it is at this airport
  const aircraft = useMemo(() => {
    if (!airport) {
      return null;
    }
    const point = OansMapProjection.globalToAirportCoordinates(
      airport.arp,
      { lat: latitude, long: longitude },
      [0, 0],
    ) as TaxiPoint;
    return Math.hypot(point[0], point[1]) < AT_AIRPORT_DISTANCE ? { point, heading } : null;
  }, [airport, latitude, longitude, heading]);

  const runways = airport ? [...(departure ? airport.entries : airport.exits).keys()] : [];
  const exits: BtvExit[] = (!departure && runway ? airport?.exits.get(runway) : undefined) ?? [];
  const entries: TaxiRunwayEntry[] = (departure && runway ? airport?.entries.get(runway) : undefined) ?? [];
  const exitInfo = exits.find((e) => e.name === exit);
  const entryInfo = entries.find((e) => e.name === entry) ?? entries[0];
  const standInfo = airport && stand ? taxiFindStand(airport.stands, stand) : null;

  const start: TaxiRouteStart | null = useMemo(() => {
    switch (startMode) {
      case TaxiRouteStartMode.Exit:
        return exitInfo?.start ? { kind: 'exit', exit: exitInfo.name, point: exitInfo.start } : null;
      case TaxiRouteStartMode.Stand:
        // Push back along the lead-in line of the stand
        return standInfo ? { kind: 'position', point: standInfo.point, heading: null } : null;
      default:
        return aircraftStart ? { kind: 'position', point: aircraftStart.point, heading: aircraftStart.heading } : null;
    }
  }, [startMode, exitInfo, standInfo, aircraftStart]);

  const to: TaxiRouteTarget | null = useMemo(() => {
    if (departure) {
      return runway && entryInfo ? { kind: 'runway', runway, entry: entryInfo.name, point: entryInfo.point } : null;
    }
    return standInfo ? { kind: 'stand', name: standInfo.name, point: standInfo.point } : null;
  }, [departure, runway, entryInfo, standInfo]);

  // The shortest route (suggestion), and the route along the typed clearance
  const suggestion = useMemo(
    () => (airport && start && to ? taxiRoute(airport.network, { start, to }) : null),
    [airport, start, to],
  );
  const via = parseTaxiClearance(clearance);
  const viaKey = via.join(' ');
  const cleared = useMemo(
    () => (airport && start && to && via.length > 0 ? taxiRoute(airport.network, { start, to, via }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [airport, start, to, viaKey],
  );
  const route = cleared ?? suggestion;
  // Departure: the route stops at the holding point of the runway
  const { shownRoute, holdingPoint } = useMemo(() => {
    if (!route || route.error !== TaxiRouteError.None) {
      return { shownRoute: null, holdingPoint: null };
    }
    if (!departure || !airport) {
      return { shownRoute: route, holdingPoint: null };
    }
    const held = taxiRouteToHoldingPoint(route, airport.holdingLines);
    return { shownRoute: held.route, holdingPoint: held.holdingPoint };
  }, [route, departure, airport]);
  const crossings = useMemo(
    () => (shownRoute && airport ? taxiRouteRunwayCrossings(shownRoute.points, airport.runways) : []),
    [shownRoute, airport],
  );
  const routeEnd =
    departure && runway ? `${holdingPoint ? t('Ground.Taxi.HoldingPoint') : t('Ground.Taxi.Runway')} ${runway}` : null;
  const hold =
    departure && runway && shownRoute
      ? {
          point: holdingPoint ?? shownRoute.points[shownRoute.points.length - 1],
          label: `${t('Ground.Taxi.Hold')} ${runway}`,
        }
      : null;

  // The accepted route is marked on the OANS with green flags (FCOM: flags mark a given point on the airport); a route
  // that is not accepted any more takes its flags away
  const flagRoute = accepted && cleared !== null ? shownRoute : null;
  useEffect(() => {
    if (!hasOans) {
      return;
    }
    const points =
      flagRoute && airport
        ? taxiRouteFlagPoints(flagRoute).map((p) => OansMapProjection.airportToGlobalCoordinates(airport.arp, p))
        : [];
    eventBus
      .getPublisher<OansControlEvents>()
      .pub(
        'oans_taxi_route_flags',
        { icao: airport?.icao ?? icao, points: points.map((c) => ({ lat: c.lat, long: c.long })) },
        true,
      );
  }, [hasOans, flagRoute, airport, icao, eventBus]);

  const takeAircraftPosition = () => {
    setAircraftStart(aircraft ? { point: aircraft.point, heading: aircraft.heading } : null);
    set({ accepted: false });
  };

  const setDirection = (d: TaxiRouteDirection) =>
    set({
      direction: d,
      startMode: START_MODES[d][0],
      runway: undefined,
      exit: undefined,
      entry: undefined,
      clearance: '',
      accepted: false,
    });

  const standMatches = airport && stand && !standInfo ? taxiStandMatches(airport.stands, stand, STAND_SUGGESTIONS) : [];
  const standUnknown = airport !== null && !!stand && !standInfo && standMatches.length === 0;

  let airportStatus: string | null = null;
  switch (airportState?.state) {
    case 'loading':
      airportStatus = t('Ground.Taxi.Loading');
      break;
    case 'not-found':
      airportStatus = t('Ground.Taxi.NotFound');
      break;
    case 'unavailable':
      airportStatus = t('Ground.Taxi.Unavailable');
      break;
    case 'loaded':
      airportStatus = `${airportState.airport.stands.length} ${t('Ground.Taxi.Stands')}`;
      break;
    default:
      break;
  }

  let routeError: string | null = null;
  if (route && route.error !== TaxiRouteError.None) {
    // Without a clearance, no taxi line at all connects the start to the end
    routeError =
      route.error === TaxiRouteError.NoRoute && !cleared
        ? t('Ground.Taxi.Errors.NoConnection')
        : t(`Ground.Taxi.Errors.${route.error}`);
  }

  const standField = (
    <>
      <Row label={t('Ground.Taxi.Stand')} missing={!standInfo}>
        <div className="flex flex-row items-center space-x-2">
          {standInfo?.terminal && <span className="text-theme-unselected">{standInfo.terminal}</span>}
          <SimpleInput
            className="w-32 text-center"
            fontSizeClassName="text-base"
            value={stand ?? ''}
            placeholder={t('Ground.Taxi.StandShort')}
            maxLength={8}
            uppercase
            onChange={(v) => set({ stand: v.toUpperCase() || undefined, accepted: false })}
          />
        </div>
      </Row>
      {standMatches.length > 0 && (
        <div className="flex flex-row flex-wrap">
          {standMatches.map((s) => (
            <button
              key={s.name}
              type="button"
              className="mb-1 mr-1 rounded-md border-2 border-theme-accent px-2 text-sm hover:border-theme-highlight"
              onClick={() => set({ stand: s.name, accepted: false })}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {standUnknown && <span className="text-utility-amber">{t('Ground.Taxi.StandNotFound')}</span>}
    </>
  );

  const runwayField = (
    <Row label={t('Ground.Taxi.Runway')} missing={!runway}>
      <SelectInput
        className="w-48"
        value={runway ?? ''}
        options={[{ value: '', displayValue: '-' }, ...runways.map((r) => ({ value: r, displayValue: r }))]}
        onChange={(v) =>
          set({ runway: (v as string) || undefined, exit: undefined, entry: undefined, accepted: false })
        }
        maxHeight={20}
      />
    </Row>
  );

  const aircraftField = (
    <div className="flex flex-row items-center justify-between">
      <span className={aircraftStart ? 'text-theme-text' : 'text-utility-amber'}>
        {aircraftStart ? t('Ground.Taxi.AircraftPosition') : t('Ground.Taxi.NotAtAirport')}
      </span>
      <button
        type="button"
        className="flex flex-row items-center space-x-2 rounded-md border-2 border-theme-highlight px-3 py-1 text-theme-highlight hover:bg-theme-highlight hover:text-theme-body"
        onClick={takeAircraftPosition}
      >
        <ArrowClockwise size={18} />
        <span>{t('Ground.Taxi.Update')}</span>
      </button>
    </div>
  );

  return (
    <div className="flex h-content-section-reduced flex-row space-x-3 overflow-hidden text-base">
      <div className="flex w-[27rem] shrink-0 flex-col space-y-3">
        <Section title={t('Ground.Taxi.Airport')}>
          <SelectGroup>
            {[TaxiRouteDirection.Departure, TaxiRouteDirection.Arrival].map((d) => (
              <SelectItem key={d} className="w-1/2" selected={direction === d} onSelect={() => setDirection(d)}>
                {t(`Ground.Taxi.Directions.${d}`)}
              </SelectItem>
            ))}
          </SelectGroup>
          <Row label="ICAO" missing={!airport}>
            <div className="flex flex-row space-x-2">
              <SimpleInput
                className="w-24 text-center"
                fontSizeClassName="text-base"
                value={icao}
                placeholder="ICAO"
                maxLength={4}
                uppercase
                onChange={(v) =>
                  set({ icao: v.toUpperCase(), runway: undefined, exit: undefined, entry: undefined, accepted: false })
                }
              />
              {[departingAirport, arrivingAirport].map((ofpIcao, i) => (
                <button
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  type="button"
                  disabled={!ofpIcao}
                  className="rounded-md border-2 border-theme-highlight px-2 text-sm text-theme-highlight hover:bg-theme-highlight hover:text-theme-body disabled:opacity-40"
                  onClick={() =>
                    set({
                      icao: ofpIcao.toUpperCase(),
                      runway: undefined,
                      exit: undefined,
                      entry: undefined,
                      accepted: false,
                    })
                  }
                >
                  {i === 0 ? t('Ground.Taxi.Origin') : t('Ground.Taxi.Destination')}
                </button>
              ))}
            </div>
          </Row>
          {airportStatus && (
            <span className={airport ? 'text-theme-unselected' : 'text-utility-amber'}>{airportStatus}</span>
          )}
        </Section>

        <Section title={t('Ground.Taxi.From')}>
          <SelectGroup>
            {START_MODES[direction].map((mode) => (
              <SelectItem
                key={mode}
                className="w-1/2"
                selected={startMode === mode}
                onSelect={() => {
                  set({ startMode: mode, accepted: false });
                  if (mode === TaxiRouteStartMode.Aircraft) {
                    takeAircraftPosition();
                  }
                }}
              >
                {t(`Ground.Taxi.StartModes.${mode}`)}
              </SelectItem>
            ))}
          </SelectGroup>
          {startMode === TaxiRouteStartMode.Exit && (
            <>
              {runwayField}
              <Row label={t('Ground.Taxi.Exit')} missing={!exit}>
                <SelectInput
                  className="w-48"
                  value={exit ?? ''}
                  options={[
                    { value: '', displayValue: '-' },
                    ...exits.map((e) => ({ value: e.name, displayValue: `${e.name}  ${Math.round(e.distance)} m` })),
                  ]}
                  onChange={(v) => set({ exit: (v as string) || undefined, accepted: false })}
                  maxHeight={20}
                />
              </Row>
            </>
          )}
          {startMode === TaxiRouteStartMode.Stand && standField}
          {startMode === TaxiRouteStartMode.Aircraft && aircraftField}
        </Section>

        <Section title={t('Ground.Taxi.To')}>
          {departure ? (
            <>
              {runwayField}
              <Row label={t('Ground.Taxi.Entry')} missing={!entryInfo}>
                <SelectInput
                  className="w-48"
                  value={entryInfo?.name ?? ''}
                  options={entries.map((e, i) => ({
                    value: e.name,
                    displayValue: `${e.name}  ${i === 0 ? t('Ground.Taxi.FullLength') : `${Math.round(e.remaining)} m`}`,
                  }))}
                  onChange={(v) => set({ entry: v as string, accepted: false })}
                  maxHeight={20}
                />
              </Row>
            </>
          ) : (
            standField
          )}
        </Section>

        <Section title={t('Ground.Taxi.Clearance')}>
          <div className="flex flex-row space-x-2">
            <SimpleInput
              className="w-full min-w-0"
              fontSizeClassName="text-base"
              value={clearance}
              placeholder={t('Ground.Taxi.ClearancePlaceholder')}
              uppercase
              onChange={(v) => set({ clearance: v.toUpperCase(), accepted: false })}
            />
          </div>
          <div className="flex flex-row space-x-2">
            <button
              type="button"
              disabled={!suggestion || suggestion.error !== TaxiRouteError.None}
              className={`${buttonClass} w-full border-theme-highlight text-theme-highlight hover:bg-theme-highlight hover:text-theme-body`}
              onClick={() => suggestion && set({ clearance: suggestion.taxiways.join(' '), accepted: false })}
            >
              <Lightbulb size={18} />
              <span>{t('Ground.Taxi.Suggest')}</span>
            </button>
            <button
              type="button"
              disabled={!cleared || cleared.error !== TaxiRouteError.None || accepted}
              className={`${buttonClass} w-full border-utility-green bg-utility-green text-theme-body hover:bg-theme-body hover:text-utility-green`}
              onClick={() => set({ accepted: true })}
            >
              <CheckLg size={18} />
              <span>{t('Ground.Taxi.Accept')}</span>
            </button>
            <button
              type="button"
              className={`${buttonClass} w-16 shrink-0 border-utility-red text-utility-red hover:bg-utility-red hover:text-theme-body`}
              onClick={() => {
                dispatch(clearTaxiRoute());
                setAircraftStart(null);
              }}
            >
              <Trash size={18} />
            </button>
          </div>
        </Section>

        <div className="flex min-h-0 flex-1 flex-col rounded-md border-2 border-theme-accent px-3 py-2">
          {shownRoute ? (
            <>
              <span className={accepted ? 'font-bold text-utility-green' : 'text-theme-highlight'}>
                {accepted ? t('Ground.Taxi.Accepted') : cleared ? t('Ground.Taxi.Preview') : t('Ground.Taxi.Suggested')}
                {hasOans && flagRoute && ` · ${t('Ground.Taxi.FlagsOnOans')}`}
              </span>
              <span className="leading-snug">{routeText(shownRoute, routeEnd)}</span>
              <span className="text-theme-unselected">
                {(shownRoute.length / 1000).toFixed(1)} km
                {shownRoute.taxiways.length > 0 && ` · ${shownRoute.taxiways.join(' ')}`}
              </span>
              {crossings.map((c, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <span key={i} className="font-bold text-utility-red">
                  {t('Ground.Taxi.CrossRunway')} {c.runway}
                </span>
              ))}
            </>
          ) : (
            <span className={routeError ? 'text-utility-red' : 'text-theme-unselected'}>
              {routeError ?? t(departure ? 'Ground.Taxi.HelpDeparture' : 'Ground.Taxi.Help')}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col rounded-md border-2 border-theme-accent">
        {airport ? (
          <TaxiMap
            airport={airport}
            route={shownRoute}
            accepted={accepted && cleared !== null}
            crossings={crossings}
            stand={standInfo}
            hold={hold}
            entries={entries}
            aircraft={aircraft}
            onStandPick={
              !departure || startMode === TaxiRouteStartMode.Stand
                ? (name) => set({ stand: name, accepted: false })
                : undefined
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center text-theme-unselected">
            {airportStatus ?? t('Ground.Taxi.EnterAirport')}
          </div>
        )}
      </div>
    </div>
  );
};
