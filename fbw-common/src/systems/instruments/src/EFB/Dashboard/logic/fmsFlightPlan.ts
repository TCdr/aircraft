// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FmsDescentData } from '@flybywiresim/fbw-sdk';

/** The FMS has a flight plan once its active plan has a destination: both FMSs answer without one otherwise */
export const fmsHasFlightPlan = (answer: Pick<FmsDescentData, 'destination'> | null): boolean =>
  answer !== null && answer.destination !== null;
