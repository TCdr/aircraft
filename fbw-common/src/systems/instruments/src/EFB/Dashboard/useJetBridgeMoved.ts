// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useAppSelector } from '@flybywiresim/flypad';
import { jetBridgeMovedByFlypad } from './logic/aircraftState';

/** Since this flyPad was loaded: the Services page state resets with the flyPad, so this must not outlive it */
let movedSinceLoad = false;

/**
 * Notes that the flyPad moved the jet bridge. Run once for the whole flyPad (useDashboardLatches): the bridge is moved
 * from the Services page, while the dashboard is not open.
 */
export const useJetBridgeMovedLatch = (): void => {
  const buttonState = useAppSelector((state) => state.groundServicePage.jetWayButtonState);
  if (jetBridgeMovedByFlypad(buttonState)) {
    movedSinceLoad = true;
  }
};

export const jetBridgeMovedSinceLoad = (): boolean => movedSinceLoad;
