// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect } from 'react';
import { NXDataStore, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { useAppSelector } from '@flybywiresim/flypad';
import { isAtAirport } from '../Navigation/Pages/WeatherPage/logic/stationTime';
import { isNewFlightOfFlownOfp } from './logic/newFlight';
import { FLIGHT_LOG_KEY } from './useFlightLog';
import { FLOWN_OFP_KEY, useOfpKey } from './useDashboardPhase';
import { SERVICES_RAN_KEY } from './useServiceStatus';
import { readStoredValue } from './readStoredValue';

/**
 * Forgets what was recorded for the loaded OFP when the same OFP is flown again from its departure airport (a flight
 * reloaded in the sim), so the dashboard starts at the gate instead of showing the arrival of the last flight. Run once
 * for the whole flyPad (useDashboardLatches).
 */
export const useNewFlightReset = (): void => {
  const { departingPosLat, departingPosLong } = useAppSelector((state) => state.simbrief.data);
  const [aircraftLat] = useSimVar('PLANE LATITUDE', 'degree latitude', 5_000);
  const [aircraftLon] = useSimVar('PLANE LONGITUDE', 'degree longitude', 5_000);
  const [simOnGround] = useSimVar('SIM ON GROUND', 'bool', 500);
  const ofpKey = useOfpKey();

  const flownOfp = ofpKey !== '' && ofpKey === readStoredValue(FLOWN_OFP_KEY);
  const newFlight = isNewFlightOfFlownOfp({
    flownOfp,
    onGround: simOnGround > 0,
    // The OFP gives the position as text
    atDepartureAirport: isAtAirport(aircraftLat, aircraftLon, Number(departingPosLat), Number(departingPosLong)),
  });

  useEffect(() => {
    if (newFlight) {
      [FLOWN_OFP_KEY, FLIGHT_LOG_KEY, SERVICES_RAN_KEY].forEach((key) => NXDataStore.setLegacy(key, ''));
    }
  }, [newFlight]);
};
