// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { AirframeType, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { useEventBus } from '@flybywiresim/flypad';
import {
  BtvExit,
  OansControlEvents,
  OansMapProjection,
  parseTaxiClearance,
  taxiDefaultEntry,
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
import { ArrowClockwise, CheckLg, ExclamationTriangleFill, GeoAltFill, Lightbulb, Trash } from 'react-bootstrap-icons';
import { t } from '../../../Localization/translation';
import { SimpleInput } from '../../../UtilComponents/Form/SimpleInput/SimpleInput';
import { SelectInput } from '../../../UtilComponents/Form/SelectInput/SelectInput';
import {
  M3ActionChip,
  M3Banner,
  M3Button,
  M3Card,
  M3Chip,
  M3IconButton,
  M3Page,
  M3Segmented,
  M3_INPUT,
} from '../../../UtilComponents/Material/Material';
import { useAppDispatch, useAppSelector } from '../../../Store/store';
import {
  clearTaxiRoute,
  setTaxiRouteValues,
  TaxiRouteDirection,
  TaxiRouteStartMode,
} from '../../../Store/features/taxiRoute';
import { loadTaxiAirport, TaxiAirportState } from './TaxiAirport';
import { TaxiMap } from './TaxiMap';
import { TaxiFrequencyPanel } from './TaxiFrequencyPanel';

/** The aircraft is at the airport within this distance of its reference point, in metres */
const AT_AIRPORT_DISTANCE = 8000;
/** Stands listed under the stand field while typing */
const STAND_SUGGESTIONS = 8;

const START_MODES: Record<TaxiRouteDirection, TaxiRouteStartMode[]> = {
  [TaxiRouteDirection.Arrival]: [TaxiRouteStartMode.Exit, TaxiRouteStartMode.Aircraft],
  [TaxiRouteDirection.Departure]: [TaxiRouteStartMode.Stand, TaxiRouteStartMode.Aircraft],
};

/** The look of a drop-down on a card (SelectInput brings its own border) */
const SELECT_LOOK = 'h-10 !border-m3-outline bg-m3-ground';

/**
 * A card of the route form; a drop-down may hang out of it. The badge stays on the line of the title: a long one (the
 * airport database messages) is cut with an ellipsis, its full text is on the map card.
 */
const Section: FC<{ title: string; badge?: string | null; badgeWarn?: boolean }> = ({
  title,
  badge,
  badgeWarn,
  children,
}) => (
  <M3Card className="mb-3 shrink-0 !overflow-visible px-4 py-3">
    <div className="mb-2 flex flex-row items-center">
      <span className="shrink-0 whitespace-nowrap text-xs font-bold uppercase tracking-widest text-m3-muted">
        {title}
      </span>
      <div className="grow" />
      {badge && (
        <span
          className={`ml-3 min-w-0 truncate rounded-full px-2 py-1 text-xs font-bold leading-none ${
            badgeWarn ? 'bg-m3-warn-container text-m3-on-warn' : 'bg-m3-tile text-m3-muted'
          }`}
        >
          {badge}
        </span>
      )}
    </div>
    <div className="flex flex-col space-y-1">{children}</div>
  </M3Card>
);

const Row: FC<{ label: string; missing?: boolean }> = ({ label, missing, children }) => (
  <div className="flex h-10 flex-row items-center justify-between">
    <span className={`mr-2 whitespace-nowrap text-sm font-semibold ${missing ? 'text-m3-on-warn' : 'text-m3-text'}`}>
      {label}
    </span>
    {children}
  </div>
);

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

  // The entry chosen by the crew, or the first one (full length first) reached without crossing a runway
  const defaultEntry = useMemo(
    () =>
      airport && start && runway
        ? taxiDefaultEntry(airport.network, airport.runways, airport.holdingLines, start, runway, entries)
        : entries[0],
    [airport, start, runway, entries],
  );
  const entryInfo = entries.find((e) => e.name === entry) ?? defaultEntry;

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
  // The taxiway names of the airport, to read the names of several words in the clearance (e.g. SOUTH RAMP)
  const airportNames = useMemo(
    () => new Set(airport?.network.lines.map((l) => l.name).filter((n): n is string => n !== null)),
    [airport],
  );
  const via = parseTaxiClearance(clearance, airportNames);
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
  // With a flyPad per pilot, a flyPad takes away only the flags it has set: opening the page on the other flyPad must
  // not clear them
  const flagsSet = useRef(false);
  useEffect(() => {
    if (!hasOans) {
      return;
    }
    const points =
      flagRoute && airport
        ? taxiRouteFlagPoints(flagRoute).map((p) => OansMapProjection.airportToGlobalCoordinates(airport.arp, p))
        : [];
    if (points.length === 0 && !flagsSet.current) {
      return;
    }
    flagsSet.current = points.length > 0;
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
        <div className="flex flex-row items-center">
          {standInfo?.terminal && <span className="mr-2 text-sm text-m3-muted">{standInfo.terminal}</span>}
          <SimpleInput
            className={`w-32 text-center ${M3_INPUT} font-bold`}
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
        <div className="-m-1 flex flex-row flex-wrap">
          {standMatches.map((s) => (
            <M3ActionChip key={s.name} className="m-1" onClick={() => set({ stand: s.name, accepted: false })}>
              {s.name}
            </M3ActionChip>
          ))}
        </div>
      )}
      {standUnknown && <span className="text-sm text-m3-on-warn">{t('Ground.Taxi.StandNotFound')}</span>}
    </>
  );

  const runwayField = (
    <Row label={t('Ground.Taxi.Runway')} missing={!runway}>
      <SelectInput
        fontSizeClassName="text-base"
        className={`w-48 ${SELECT_LOOK}`}
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
    <div className="flex h-10 flex-row items-center justify-between">
      <span className={`text-sm font-semibold ${aircraftStart ? 'text-m3-text' : 'text-m3-on-warn'}`}>
        {aircraftStart ? t('Ground.Taxi.AircraftPosition') : t('Ground.Taxi.NotAtAirport')}
      </span>
      <M3ActionChip primary onClick={takeAircraftPosition}>
        <span className="flex flex-row items-center text-sm text-current">
          <ArrowClockwise size={16} className="mr-2" />
          {t('Ground.Taxi.Update')}
        </span>
      </M3ActionChip>
    </div>
  );

  const setAirport = (newIcao: string) =>
    set({ icao: newIcao.toUpperCase(), runway: undefined, exit: undefined, entry: undefined, accepted: false });

  let routeStatus = t('Ground.Taxi.Suggested');
  if (accepted) {
    routeStatus = t('Ground.Taxi.Accepted');
  } else if (cleared) {
    routeStatus = t('Ground.Taxi.Preview');
  }

  return (
    <M3Page
      chips={
        <>
          <M3Chip tone="idle" icon={<GeoAltFill size={16} />}>
            {`${icao || '----'} · ${t(`Ground.Taxi.Directions.${direction}`)}`}
          </M3Chip>
          {shownRoute && (
            <M3Chip tone={accepted ? 'active' : 'idle'} icon={accepted ? <CheckLg size={16} /> : undefined}>
              {`${routeStatus} · ${(shownRoute.length / 1000).toFixed(1)} km`}
            </M3Chip>
          )}
          {shownRoute && crossings.length > 0 && (
            <M3Chip tone="warn" icon={<ExclamationTriangleFill size={16} />}>
              {`${t('Ground.Taxi.CrossRunway')} ${crossings.map((c) => c.runway).join(', ')}`}
            </M3Chip>
          )}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden text-base">
        <div className="mr-4 flex h-full w-[420px] shrink-0 flex-col">
          <Section title={t('Ground.Taxi.Airport')} badge={airportStatus} badgeWarn={!airport}>
            <M3Segmented
              options={[TaxiRouteDirection.Departure, TaxiRouteDirection.Arrival].map((d) => ({
                label: t(`Ground.Taxi.Directions.${d}`),
                selected: direction === d,
                onClick: () => setDirection(d),
              }))}
            />
            <Row label="ICAO" missing={!airport}>
              <div className="flex flex-row items-center">
                <SimpleInput
                  className={`w-24 text-center ${M3_INPUT} font-bold`}
                  fontSizeClassName="text-base"
                  value={icao}
                  placeholder="ICAO"
                  maxLength={4}
                  uppercase
                  onChange={setAirport}
                />
                {[departingAirport, arrivingAirport].map((ofpIcao, i) => (
                  <M3ActionChip
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    className="ml-2"
                    disabled={!ofpIcao}
                    primary={!!ofpIcao && ofpIcao.toUpperCase() === icao}
                    onClick={() => setAirport(ofpIcao)}
                  >
                    {i === 0 ? t('Ground.Taxi.Origin') : t('Ground.Taxi.Destination')}
                  </M3ActionChip>
                ))}
              </div>
            </Row>
          </Section>

          <Section title={t('Ground.Taxi.From')}>
            <M3Segmented
              options={START_MODES[direction].map((mode) => ({
                label: t(`Ground.Taxi.StartModes.${mode}`),
                selected: startMode === mode,
                onClick: () => {
                  set({ startMode: mode, accepted: false });
                  if (mode === TaxiRouteStartMode.Aircraft) {
                    takeAircraftPosition();
                  }
                },
              }))}
            />
            {startMode === TaxiRouteStartMode.Exit && (
              <>
                {runwayField}
                <Row label={t('Ground.Taxi.Exit')} missing={!exit}>
                  <SelectInput
                    fontSizeClassName="text-base"
                    className={`w-48 ${SELECT_LOOK}`}
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
                    fontSizeClassName="text-base"
                    className={`w-48 ${SELECT_LOOK}`}
                    value={entryInfo?.name ?? ''}
                    // Without a runway there is no entry: '-' as the other drop-downs (an empty value would collapse
                    // the line of the drop-down and draw its chevron at the top)
                    options={
                      entries.length === 0
                        ? [{ value: '', displayValue: '-' }]
                        : entries.map((e, i) => ({
                            value: e.name,
                            displayValue: `${e.name}  ${i === 0 ? t('Ground.Taxi.FullLength') : `${Math.round(e.remaining)} m`}`,
                          }))
                    }
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
            <SimpleInput
              className={`w-full min-w-0 ${M3_INPUT} font-bold`}
              fontSizeClassName="text-base"
              value={clearance}
              placeholder={t('Ground.Taxi.ClearancePlaceholder')}
              uppercase
              onChange={(v) => set({ clearance: v.toUpperCase(), accepted: false })}
            />
            <div className="flex flex-row pt-1">
              <M3Button
                tone="outline"
                className="!h-11 flex-1"
                disabled={!suggestion || suggestion.error !== TaxiRouteError.None}
                onClick={() => suggestion && set({ clearance: suggestion.taxiways.join(' '), accepted: false })}
              >
                <Lightbulb size={18} />
                <span className="text-sm text-current">{t('Ground.Taxi.Suggest')}</span>
              </M3Button>
              <M3Button
                className="ml-2 !h-11 flex-1"
                disabled={!cleared || cleared.error !== TaxiRouteError.None || accepted}
                onClick={() => set({ accepted: true })}
              >
                <CheckLg size={18} />
                <span className="text-sm text-current">{t('Ground.Taxi.Accept')}</span>
              </M3Button>
              <M3IconButton
                aria-label="Clear"
                className="ml-2 !h-11 w-12 !flex-none text-m3-on-error"
                onClick={() => {
                  dispatch(clearTaxiRoute());
                  setAircraftStart(null);
                }}
              >
                <Trash size={18} />
              </M3IconButton>
            </div>
          </Section>

          <M3Card low className="scrollbar min-h-0 flex-1 !overflow-y-auto px-4 py-3">
            {shownRoute ? (
              <>
                <span
                  className={`shrink-0 text-sm font-bold ${accepted ? 'text-m3-on-primary-container' : 'text-m3-muted'}`}
                >
                  {routeStatus}
                  {hasOans && flagRoute && ` · ${t('Ground.Taxi.FlagsOnOans')}`}
                </span>
                <span className="mt-1 shrink-0 text-base leading-snug">{routeText(shownRoute, routeEnd)}</span>
                <span className="mt-1 shrink-0 text-xs text-m3-muted">
                  {(shownRoute.length / 1000).toFixed(1)} km
                  {shownRoute.taxiways.length > 0 && ` · ${shownRoute.taxiways.join(' ')}`}
                </span>
                {crossings.map((c, i) => (
                  <M3Banner
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    tone="warn"
                    className="mt-2 shrink-0"
                    icon={<ExclamationTriangleFill size={16} />}
                  >
                    {`${t('Ground.Taxi.CrossRunway')} ${c.runway}`}
                  </M3Banner>
                ))}
              </>
            ) : (
              <span className={`text-sm leading-snug ${routeError ? 'text-m3-on-error' : 'text-m3-muted'}`}>
                {routeError ?? t(departure ? 'Ground.Taxi.HelpDeparture' : 'Ground.Taxi.Help')}
              </span>
            )}
          </M3Card>
        </div>

        <M3Card low className="relative h-full min-w-0 flex-1">
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
            <div className="flex h-full items-center justify-center px-8">
              <span className="text-center text-base text-m3-muted">
                {airportStatus ?? t('Ground.Taxi.EnterAirport')}
              </span>
            </div>
          )}
          <TaxiFrequencyPanel
            icao={icao}
            origin={(departingAirport ?? '').toUpperCase()}
            destination={(arrivingAirport ?? '').toUpperCase()}
          />
        </M3Card>
      </div>
    </M3Page>
  );
};
