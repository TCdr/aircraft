// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useRef } from 'react';
import { usePersistentProperty, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { useAppSelector } from '@flybywiresim/flypad';
import { numberReader } from './registeredReads';
import { usePolledReading } from './usePolledReading';
import { plannedMinutesToTod } from './logic/timeToTod';
import { readStoredValue } from './readStoredValue';

/** The sim clock counts from year 1, the Unix epoch from 1970 */
const SIM_CLOCK_TO_UNIX_SECONDS = 62_135_596_800;
const MS_PER_SECOND = 1000;
const FMGC_PHASE_PREFLIGHT = 0;
const FMGC_PHASE_TAKEOFF = 1;
const TAKEOFF_TIME_KEY = 'EFB_DASHBOARD_TAKEOFF_TIME';

/** The sim's current time as Unix seconds */
export const useSimUnixSeconds = (): number => {
  const [absoluteTime] = useSimVar('E:ABSOLUTE TIME', 'seconds', 5_000);
  return absoluteTime - SIM_CLOCK_TO_UNIX_SECONDS;
};

const readAbsoluteSeconds = numberReader('E:ABSOLUTE TIME', 'seconds');
const readLocalSeconds = numberReader('E:LOCAL TIME', 'seconds');
const readZuluSeconds = numberReader('E:ZULU TIME', 'seconds');

/**
 * The sim's time as Unix seconds with the local and zulu clock, read together. The dashboard shows them at the pace of
 * this poll, so they are not rounded.
 */
export const useSimClock = () =>
  usePolledReading(
    () => ({
      nowUnixSeconds: readAbsoluteSeconds() - SIM_CLOCK_TO_UNIX_SECONDS,
      localSecondsOfDay: readLocalSeconds(),
      zuluSecondsOfDay: readZuluSeconds(),
    }),
    5_000,
  );

const useStoredTakeoff = () => {
  const { flightNum, schedOut } = useAppSelector((state) => state.simbrief.data);
  // The takeoff time is kept with the OFP it belongs to, so a flyPad reload in flight keeps it and a new OFP drops it
  const ofpKey = `${flightNum}|${schedOut}`;
  const [, setStoredTakeoff] = usePersistentProperty(TAKEOFF_TIME_KEY, '');
  const storedTakeoff = readStoredValue(TAKEOFF_TIME_KEY);
  const [storedKey, storedSeconds] = storedTakeoff.split('@');
  const takeoffUnixSeconds = storedKey === ofpKey && storedSeconds ? Number(storedSeconds) : null;
  return { ofpKey, storedTakeoff, setStoredTakeoff, takeoffUnixSeconds };
};

/**
 * Stores the takeoff time when the FMGC enters its takeoff phase. Run once for the whole flyPad
 * (useDashboardLatches), so a takeoff is seen whatever page is open.
 */
export const useTakeoffLatch = (fmgcPhase: number): void => {
  const nowUnixSeconds = useSimUnixSeconds();
  const { ofpKey, storedTakeoff, setStoredTakeoff } = useStoredTakeoff();

  const previousPhase = useRef(fmgcPhase);
  useEffect(() => {
    if (fmgcPhase >= FMGC_PHASE_TAKEOFF && previousPhase.current < FMGC_PHASE_TAKEOFF) {
      setStoredTakeoff(`${ofpKey}@${nowUnixSeconds}`);
    } else if (fmgcPhase === FMGC_PHASE_PREFLIGHT && storedTakeoff !== '') {
      setStoredTakeoff('');
    }
    previousPhase.current = fmgcPhase;
  }, [fmgcPhase]);
};

/** The stored takeoff time of the loaded OFP as Unix seconds, null before takeoff */
export const useTakeoffUnixSeconds = (): number | null => useStoredTakeoff().takeoffUnixSeconds;

/**
 * Minutes to the top of descent. The FMS publishes where the T/D lies but no live along-track distance to the
 * destination, so the figure is the SimBrief T/D time counted from the actual takeoff time and always planned.
 * Null before takeoff.
 */
export const useMinutesToTod = (nowUnixSeconds: number): { minutes: number; planned: boolean } | null => {
  const topOfDescent = useAppSelector((state) => state.simbrief.data.topOfDescent);
  const { takeoffUnixSeconds } = useStoredTakeoff();

  const minutes = plannedMinutesToTod(
    takeoffUnixSeconds === null ? null : takeoffUnixSeconds * MS_PER_SECOND,
    topOfDescent ? topOfDescent.secondsAfterTakeoff : null,
    nowUnixSeconds * MS_PER_SECOND,
  );
  return minutes === null || !Number.isFinite(minutes) ? null : { minutes, planned: true };
};
