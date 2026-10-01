// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { IconPlane } from '@tabler/icons';
import { CloudArrowDown } from 'react-bootstrap-icons';
import { usePersistentNumberProperty, usePersistentProperty, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { toast } from 'react-toastify';
import {
  ScrollableContainer,
  t,
  useAppSelector,
  useAppDispatch,
  fetchSimbriefDataAction,
  isSimbriefDataLoaded,
  setPayloadImported,
  setFuelImported,
  setToastPresented,
  setSimbriefDataPending,
} from '@flybywiresim/flypad';
import { useNavigraphAuthInfo } from '../../Apis/Navigraph/Components/Authentication';
import { M3Button, M3Card, M3Chip } from '../../UtilComponents/Material/Material';

interface InformationEntryProps {
  title: string;
  info: string;
}

/** A figure of the flight: its name over its value */
const InformationEntry = ({ title, info }: InformationEntryProps) => (
  <div className="flex min-w-0 flex-1 flex-col rounded-xl bg-m3-tile px-4 py-2">
    <span className="truncate text-xs font-bold uppercase tracking-widest text-m3-muted">{title}</span>
    <span className="truncate text-lg font-bold text-m3-text">{info}</span>
  </div>
);

export const FlightWidget = () => {
  const { data } = useAppSelector((state) => state.simbrief);
  const simbriefDataPending = useAppSelector((state) => state.simbrief.simbriefDataPending);
  const aircraftIcao = useAppSelector((state) => state.simbrief.data.aircraftIcao);

  const navigraphAuthInfo = useNavigraphAuthInfo();

  const [overrideSimBriefUserID] = usePersistentProperty('CONFIG_OVERRIDE_SIMBRIEF_USERID');
  const [autoSimbriefImport] = usePersistentProperty('CONFIG_AUTO_SIMBRIEF_IMPORT');
  const airframeInfo = useAppSelector((state) => state.config.airframeInfo);

  const [gsxPayloadSyncEnabled] = usePersistentNumberProperty('GSX_PAYLOAD_SYNC', 248);
  const [gsxBoardingState] = useSimVar('L:FSDT_GSX_BOARDING_STATE', 'Number', 227);
  const [gsxDeBoardingState] = useSimVar('L:FSDT_GSX_DEBOARDING_STATE', 'Number', 229);
  const [boardingStarted] = useSimVar('L:A32NX_BOARDING_STARTED_BY_USR', 'Bool', 208);
  const [refuelStartedByUser] = useSimVar('L:A32NX_REFUEL_STARTED_BY_USR', 'Bool', 254);

  const {
    schedIn,
    schedOut,
    weather,
    cruiseAltitude,
    weights,
    arrivingAirport,
    arrivingIata,
    arrivingName,
    departingAirport,
    departingIata,
    departingName,
    airline,
    route,
    flightNum,
    altIcao,
    costInd,
    arrivingRunway,
    departingRunway,
  } = data;
  const { flightPlanProgress } = useAppSelector((state) => state.flightProgress);

  const fuelImported = useAppSelector((state) => state.simbrief.fuelImported);
  const payloadImported = useAppSelector((state) => state.simbrief.payloadImported);
  const toastPresented = useAppSelector((state) => state.simbrief.toastPresented);

  const dispatch = useAppDispatch();

  const history = useHistory();

  const sta = new Date(parseInt(schedIn) * 1000);
  const schedInParsed = `${sta.getUTCHours().toString().padStart(2, '0')}${sta.getUTCMinutes().toString().padStart(2, '0')}Z`;

  const std = new Date(parseInt(schedOut) * 1000);
  const schedOutParsed = `${std.getUTCHours().toString().padStart(2, '0')}${std.getUTCMinutes().toString().padStart(2, '0')}Z`;

  const flightLevel = cruiseAltitude / 100;
  const crzAlt = `FL${flightLevel.toString().padStart(3, '0')}`;

  const avgWind = `${weather.avgWindDir}/${weather.avgWindSpeed}`;

  const eZfwUnround = Number.parseFloat(weights.estZeroFuelWeight) / 100;
  const eZfw = Math.round(eZfwUnround) / 10;
  const estimatedZfw = `${eZfw}`;

  const fetchData = async () => {
    dispatch(setSimbriefDataPending(true));

    const gsxInProgress =
      (gsxDeBoardingState >= 4 && gsxDeBoardingState < 6) || (gsxBoardingState >= 4 && gsxBoardingState < 6);
    const generalBoardingInProgress = gsxPayloadSyncEnabled ? gsxInProgress : boardingStarted;

    if (generalBoardingInProgress || refuelStartedByUser) {
      toast.error(t('Dashboard.YourFlight.NoImportDueToBoardingOrRefuel'));
    } else {
      try {
        const action = await fetchSimbriefDataAction(
          (navigraphAuthInfo.loggedIn && navigraphAuthInfo.username) || '',
          overrideSimBriefUserID ?? '',
        );
        dispatch(action);
        dispatch(setFuelImported(false));
        dispatch(setPayloadImported(false));
        dispatch(setToastPresented(false));
        history.push('/ground/fuel');
        history.push('/ground/payload');
        history.push('/dashboard');
      } catch (e) {
        toast.error(e.message);
      }
    }
    dispatch(setSimbriefDataPending(false));
  };

  useEffect(() => {
    if (
      !simbriefDataPending &&
      ((navigraphAuthInfo.loggedIn && navigraphAuthInfo.username) || overrideSimBriefUserID) &&
      !toastPresented &&
      fuelImported &&
      payloadImported
    ) {
      if (aircraftIcao !== airframeInfo.icao) {
        toast.error(t('Dashboard.YourFlight.ToastWrongAircraftType'));
      } else {
        toast.success(t('Dashboard.YourFlight.ToastFuelPayloadImported'));
      }
      dispatch(setToastPresented(true));
    }
  }, [fuelImported, payloadImported, simbriefDataPending]);

  useEffect(() => {
    if (
      (!data || !isSimbriefDataLoaded()) &&
      !simbriefDataPending &&
      autoSimbriefImport === 'ENABLED' &&
      ((navigraphAuthInfo.loggedIn && navigraphAuthInfo.username) || overrideSimBriefUserID)
    ) {
      fetchData();
    }
  }, [navigraphAuthInfo.loggedIn]);

  const simbriefDataLoaded = isSimbriefDataLoaded();

  return (
    <div className="mr-4 flex min-w-0 flex-1 flex-col text-m3-text">
      <div className="mb-4 flex flex-row items-center justify-between">
        <h1 className="font-bold">{t('Dashboard.YourFlight.Title')}</h1>
        <M3Chip tone="idle">
          {`${simbriefDataLoaded ? `${(airline.length > 0 ? airline : '') + flightNum} · ` : ''}${airframeInfo.variant}`}
        </M3Chip>
      </div>
      <M3Card className="h-content-section-reduced w-full p-6">
        {simbriefDataLoaded && (
          <>
            <div className="flex shrink-0 flex-row justify-between">
              <div className="flex flex-col">
                <span className="text-4xl font-bold leading-none">{departingAirport}</span>
                <span className="mt-1 w-52 text-sm text-m3-muted">{departingName}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-4xl font-bold leading-none">{arrivingAirport}</span>
                <span className="mt-1 w-52 text-right text-sm text-m3-muted">{arrivingName}</span>
              </div>
            </div>

            {/* the scheduled times, the progress of the flight between them */}
            <div className="mt-6 flex shrink-0 flex-row items-center">
              <span
                className={`text-lg font-bold ${flightPlanProgress > 1 ? 'text-m3-on-primary-container' : 'text-m3-text'}`}
              >
                {schedOutParsed}
              </span>
              <div className="relative mx-6 flex h-1 flex-1 flex-row">
                <div className="absolute inset-x-0 border-b-4 border-dashed border-m3-outline" />
                <div className="relative bg-m3-primary" style={{ width: `${flightPlanProgress}%` }}>
                  {!!flightPlanProgress && (
                    <IconPlane
                      className="absolute right-0 -translate-y-1/2 translate-x-1/2 fill-current text-m3-on-primary-container"
                      size={50}
                      strokeLinejoin="miter"
                    />
                  )}
                </div>
              </div>
              <span
                className={`text-lg font-bold ${Math.round(flightPlanProgress) >= 98 ? 'text-m3-on-primary-container' : 'text-m3-text'}`}
              >
                {schedInParsed}
              </span>
            </div>

            <div className="mt-6 flex shrink-0 flex-row space-x-2">
              <InformationEntry title={t('Dashboard.YourFlight.Alternate')} info={altIcao ?? 'NONE'} />
              <InformationEntry title={t('Dashboard.YourFlight.CompanyRoute')} info={departingIata + arrivingIata} />
              <InformationEntry title={t('Dashboard.YourFlight.ZFW')} info={estimatedZfw} />
            </div>
            <div className="mt-2 flex shrink-0 flex-row space-x-2">
              <InformationEntry title={t('Dashboard.YourFlight.CostIndex')} info={costInd} />
              <InformationEntry title={t('Dashboard.YourFlight.AverageWind')} info={avgWind} />
              <InformationEntry title={t('Dashboard.YourFlight.CruiseAlt')} info={crzAlt} />
            </div>

            <span className="mt-6 shrink-0 text-xs font-bold uppercase tracking-widest text-m3-muted">
              {t('Dashboard.YourFlight.Route')}
            </span>
            <div className="mt-2 shrink-0 rounded-xl bg-m3-ground p-3">
              <ScrollableContainer height={15}>
                <p className="font-mono text-xl">
                  <span className="text-xl text-m3-on-primary-container">
                    {departingAirport}/{departingRunway}
                  </span>{' '}
                  {route}{' '}
                  <span className="text-xl text-m3-on-primary-container">
                    {arrivingAirport}/{arrivingRunway}
                  </span>
                </p>
              </ScrollableContainer>
            </div>
            <div className="grow" />
          </>
        )}
        <div
          className={simbriefDataLoaded ? 'mt-4 shrink-0' : 'flex h-full w-full flex-col items-center justify-center'}
        >
          {simbriefDataPending ? (
            <CloudArrowDown
              className={`${simbriefDataLoaded ? 'w-full justify-self-center' : ''} animate-bounce`}
              size={40}
            />
          ) : (
            <>
              {!simbriefDataLoaded && (
                <h1 className="mb-4 text-center" style={{ maxWidth: '18em' }}>
                  {t('Dashboard.YourFlight.SimBriefDataNotYetLoaded')}
                </h1>
              )}
              <M3Button tone={simbriefDataLoaded ? 'tonal' : 'primary'} className="w-full" onClick={fetchData}>
                <CloudArrowDown size={24} />
                <span className="text-lg text-current">{t('Dashboard.YourFlight.ImportSimBriefData')}</span>
              </M3Button>
            </>
          )}
        </div>
      </M3Card>
    </div>
  );
};
