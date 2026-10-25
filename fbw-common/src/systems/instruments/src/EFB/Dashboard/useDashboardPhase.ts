// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useRef } from 'react';
import { usePersistentProperty, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { isSimbriefDataLoaded, useAppSelector } from '@flybywiresim/flypad';
import { DashboardPhase, deriveDashboardPhase } from './logic/dashboardPhase';
import { readStoredValue } from './readStoredValue';

export const FLOWN_OFP_KEY = 'EFB_DASHBOARD_FLOWN_OFP';

/** The key of the loaded OFP, empty without one; a re-import of the same OFP keeps it */
export const useOfpKey = (): string => {
  // Subscribes this hook to OFP changes: the loaded check itself reads the store without a subscription
  const { flightNum, schedOut } = useAppSelector((state) => state.simbrief.data);
  return isSimbriefDataLoaded() ? `${flightNum}|${schedOut}` : '';
};

export const useFmgcPhase = (): number => {
  const [fmgcPhase] = useSimVar('L:A32NX_FMGC_FLIGHT_PHASE', 'enum', 500);
  return fmgcPhase;
};

/**
 * Marks the loaded OFP as flown at touchdown. Run once for the whole flyPad (useDashboardLatches), so a landing is
 * seen whatever page is open.
 */
export const useTouchdownLatch = (fmgcPhase: number): void => {
  const [simOnGround] = useSimVar('SIM ON GROUND', 'bool', 500);
  const currentOfpKey = useOfpKey();
  const [, setFlownOfpKey] = usePersistentProperty(FLOWN_OFP_KEY, '');

  // Touchdown: the aircraft was airborne past the FMGC preflight phase and is on the ground now
  const wasFlying = useRef(false);
  const onGround = simOnGround > 0;
  useEffect(() => {
    if (!onGround) {
      wasFlying.current = wasFlying.current || fmgcPhase >= 1;
    } else if (wasFlying.current) {
      wasFlying.current = false;
      if (currentOfpKey !== '') {
        setFlownOfpKey(currentOfpKey);
      }
    }
  }, [onGround, fmgcPhase]);
};

export interface DashboardPhaseState {
  phase: DashboardPhase;
  hasOfp: boolean;
  onGround: boolean;
}

/** The dashboard phase from an FMGC phase the caller already reads */
export const useDashboardPhaseAt = (fmgcPhase: number): DashboardPhaseState => {
  const [simOnGround] = useSimVar('SIM ON GROUND', 'bool', 500);
  const [stationary] = useSimVar('L:A32NX_IS_STATIONARY', 'bool', 500);
  const [pushbackAttached] = useSimVar('Pushback Attached', 'enum', 500);
  const [engine1Running] = useSimVar('ENG COMBUSTION:1', 'bool', 500);
  const [engine2Running] = useSimVar('ENG COMBUSTION:2', 'bool', 500);
  // The A32NX has no engines 3 and 4: their SimVars read 0
  const [engine3Running] = useSimVar('ENG COMBUSTION:3', 'bool', 500);
  const [engine4Running] = useSimVar('ENG COMBUSTION:4', 'bool', 500);

  const currentOfpKey = useOfpKey();
  const flownOfpKey = readStoredValue(FLOWN_OFP_KEY);
  const flownOfp = currentOfpKey !== '' && currentOfpKey === flownOfpKey;
  const onGround = simOnGround > 0;

  const phase = deriveDashboardPhase({
    fmgcPhase,
    onGround,
    stationary: stationary > 0,
    pushbackAttached: pushbackAttached > 0,
    anyEngineRunning: engine1Running > 0 || engine2Running > 0 || engine3Running > 0 || engine4Running > 0,
    flownOfp,
  });

  return { phase, hasOfp: currentOfpKey !== '', onGround };
};

export const useDashboardPhase = (): DashboardPhaseState => useDashboardPhaseAt(useFmgcPhase());
