// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXDataStore } from '@flybywiresim/fbw-sdk-react';

/**
 * A value the latches (useDashboardLatches) store, read at each render rather than through a subscription, so the
 * dashboard is right even when the store's change broadcast does not reach it, at the cost of a lag up to the next
 * SimVar poll (5 s).
 */
export const readStoredValue = (key: string): string => NXDataStore.getLegacy(key, '') ?? '';
