// @ts-strict-ignore
// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import {
  NXDataStore,
  usePersistentNumberProperty,
  usePersistentProperty,
  useSimVar,
} from '@flybywiresim/fbw-sdk-react';
import { toast } from 'react-toastify';
import {
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
import { useNavigraphAuthInfo } from '../Apis/Navigraph/Components/Authentication';
import { loadsPayloadAtOnce } from './logic/instantPayload';

/** Time for the payload page to write the imported targets before the load is started */
const TARGETS_WRITTEN_DELAY_MS = 1_000;
const GSX_SYNC_RESTORE_POLL_MS = 500;
const GSX_SYNC_RESTORE_TIMEOUT_MS = 30_000;

/**
 * The SimBrief import of the dashboard: the import itself, the toast once fuel and payload took the OFP, and the
 * automatic import at start. Call it once, from the dashboard page.
 */
export const useSimbriefImport = (): { importOfp: () => void; pending: boolean } => {
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
  const [simOnGround] = useSimVar('SIM ON GROUND', 'Bool', 500);
  const [engine1Running] = useSimVar('ENG COMBUSTION:1', 'Bool', 500);
  const [engine2Running] = useSimVar('ENG COMBUSTION:2', 'Bool', 500);

  const fuelImported = useAppSelector((state) => state.simbrief.fuelImported);
  const payloadImported = useAppSelector((state) => state.simbrief.payloadImported);
  const toastPresented = useAppSelector((state) => state.simbrief.toastPresented);

  const dispatch = useAppDispatch();

  const history = useHistory();

  /**
   * The payload page has just written the OFP targets; an instant boarding takes them into the aircraft. With GSX
   * payload sync the payload system only follows GSX, which cannot board an aircraft off the gate, so the sync is
   * switched off for the load and back on once the boarding is over.
   */
  const loadPayloadAtOnce = () => {
    NXDataStore.setLegacy('CONFIG_BOARDING_RATE', 'INSTANT');
    if (gsxPayloadSyncEnabled) {
      SimVar.SetSimVarValue('L:A32NX_GSX_PAYLOAD_SYNC_ENABLED', 'number', 0);
    }
    window.setTimeout(() => {
      SimVar.SetSimVarValue('L:A32NX_BOARDING_STARTED_BY_USR', 'Bool', true);
      if (!gsxPayloadSyncEnabled) {
        return;
      }
      const loadDeadline = Date.now() + GSX_SYNC_RESTORE_TIMEOUT_MS;
      const restoreGsxSync = window.setInterval(() => {
        const boardingOver = !SimVar.GetSimVarValue('L:A32NX_BOARDING_STARTED_BY_USR', 'Bool');
        if (boardingOver || Date.now() > loadDeadline) {
          window.clearInterval(restoreGsxSync);
          SimVar.SetSimVarValue('L:A32NX_GSX_PAYLOAD_SYNC_ENABLED', 'number', 1);
        }
      }, GSX_SYNC_RESTORE_POLL_MS);
    }, TARGETS_WRITTEN_DELAY_MS);
  };

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
        if (loadsPayloadAtOnce(simOnGround > 0, engine1Running > 0 || engine2Running > 0)) {
          loadPayloadAtOnce();
        }
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

  return { importOfp: fetchData, pending: simbriefDataPending };
};
