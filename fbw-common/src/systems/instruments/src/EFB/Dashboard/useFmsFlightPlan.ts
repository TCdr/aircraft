// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useState } from 'react';
import { requestFmsDescentData } from '@flybywiresim/fbw-sdk';
import { useEventBus } from '@flybywiresim/flypad';
import { fmsHasFlightPlan } from './logic/fmsFlightPlan';

const POLL_MS = 5_000;

/**
 * Whether the FMS holds a flight plan, asked of the FMS itself while `active`. The guidance variable of the LNAV only
 * says a leg is being flown, which is not the case at the gate with a plan entered.
 */
export const useFmsFlightPlan = (active: boolean): boolean => {
  const eventBus = useEventBus();
  const [hasFlightPlan, setHasFlightPlan] = useState(false);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    let cancelled = false;
    const ask = () =>
      requestFmsDescentData(eventBus).then((answer) => {
        // An FMS that does not answer in time (switched off, busy) keeps the last answer instead of flickering
        if (!cancelled && answer !== null) {
          setHasFlightPlan(fmsHasFlightPlan(answer));
        }
      });
    ask();
    const timer = window.setInterval(ask, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, eventBus]);

  return hasFlightPlan;
};
