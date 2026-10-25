// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useRef } from 'react';
import { usePersistentProperty } from '@flybywiresim/fbw-sdk-react';
import { useDashboardPhaseAt, useOfpKey } from './useDashboardPhase';
import { useFobAndGrossWeight } from './useLiveFigures';
import { useSimUnixSeconds } from './useMinutesToTod';
import { readStoredValue } from './readStoredValue';
import { FlightLog, FlightLogSample, parseFlightLog, updateFlightLog } from './logic/flightLog';

export const FLIGHT_LOG_KEY = 'EFB_DASHBOARD_FLIGHT_LOG';

/**
 * Records the off-blocks, takeoff, touchdown and on-blocks times and weights of the loaded OFP. Run once for the
 * whole flyPad (useDashboardLatches), so the events are seen whatever page is open.
 */
export const useFlightLogLatch = (fmgcPhase: number): void => {
  const { phase, onGround } = useDashboardPhaseAt(fmgcPhase);
  const ofpKey = useOfpKey();
  const { fobKg, grossWeightKg } = useFobAndGrossWeight();
  const nowUnixSeconds = useSimUnixSeconds();
  const [, setStoredLog] = usePersistentProperty(FLIGHT_LOG_KEY, '');

  const previous = useRef<FlightLogSample>({ phase, onGround });
  useEffect(() => {
    const before = previous.current;
    previous.current = { phase, onGround };
    if (ofpKey === '' || (before.phase === phase && before.onGround === onGround)) {
      return;
    }
    const log = updateFlightLog(parseFlightLog(readStoredValue(FLIGHT_LOG_KEY)), before, {
      ofpKey,
      phase,
      onGround,
      event: { unixSeconds: nowUnixSeconds, fobKg, grossWeightKg },
    });
    setStoredLog(JSON.stringify(log));
  }, [phase, onGround]);
};

/** The log of the loaded OFP, null when nothing was recorded for it */
export const useFlightLog = (): FlightLog | null => {
  const ofpKey = useOfpKey();
  const log = parseFlightLog(readStoredValue(FLIGHT_LOG_KEY));
  return log && log.ofpKey === ofpKey ? log : null;
};
