// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useRef, useState } from 'react';
import { PaxStationInfo } from '@flybywiresim/fbw-sdk-react';
import { useAppSelector } from '../../../Store/store';
import { GsxPaxCounts } from './gsxPassengers';
import { announceGsxPassengers, readGsxPaxCounts } from './gsxPassengerSync';

/** How often the seats and the GSX counts are read (the Payload page reads its seats every ~0.5 s) */
const READ_MS = 1_000;

const NO_PAX: GsxPaxCounts = { onBoard: 0, planned: 0, gsxBoarded: 0, gsxDeboarded: 0 };
const NO_SEATS: PaxStationInfo[] = [];

/**
 * Gives GSX the flyPad's passenger number, so that GSX boards the passengers planned on the Payload page (and
 * deboards the ones on board) instead of its own number: the Payload page only sets L:FSDT_GSX_NUMPASSENGERS while it
 * is open, and GSX resets it to 0 when it restarts. Runs while the Services page is shown (the boarding is requested
 * there), with the same rule as the Payload page (announceGsxPassengers).
 * @param ready the Services page is linked to GSX and GSX runs
 * @returns the passenger counts, and `announce` to give GSX the number at once (before a boarding request)
 */
export function useGsxPassengers(ready: boolean): { counts: GsxPaxCounts; announce: () => void } {
  const seatMap = useAppSelector((state) => state.config.cabinInfo?.seatMap) ?? NO_SEATS;
  const [counts, setCounts] = useState<GsxPaxCounts>(NO_PAX);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    const update = () => {
      const now = readGsxPaxCounts(seatMap);
      setCounts((old) =>
        old.onBoard === now.onBoard &&
        old.planned === now.planned &&
        old.gsxBoarded === now.gsxBoarded &&
        old.gsxDeboarded === now.gsxDeboarded
          ? old
          : now,
      );
      announceGsxPassengers(seatMap, readyRef.current, now);
    };
    update();
    const timer = setInterval(update, READ_MS);
    return () => clearInterval(timer);
  }, [seatMap, ready]);

  return { counts, announce: () => announceGsxPassengers(seatMap, readyRef.current) };
}
