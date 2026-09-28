// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/** Departure: from a gate, ramp or cargo stand to a runway holding point; arrival: from a runway exit to a stand */
export enum TaxiRouteDirection {
  Departure = 'DEPARTURE',
  Arrival = 'ARRIVAL',
}

/** Where the taxi route starts */
export enum TaxiRouteStartMode {
  /** A runway exit, after landing */
  Exit = 'EXIT',
  /** A parking stand, for departure */
  Stand = 'STAND',
  /** The aircraft, on the ground */
  Aircraft = 'AIRCRAFT',
}

interface TaxiRouteState {
  icao: string;
  direction: TaxiRouteDirection;
  startMode: TaxiRouteStartMode;
  /** The landing or takeoff runway, e.g. 27L */
  runway?: string;
  /** Arrival: the runway exit, e.g. B3 */
  exit?: string;
  /** Departure: the runway entry, e.g. S1 (the full length entry when not set) */
  entry?: string;
  /** Arrival: the stand to go to; departure: the stand to leave */
  stand?: string;
  /** The taxiways of the ATC clearance, as typed */
  clearance: string;
  /** The route along the clearance is accepted (drawn solid); else the suggested route is a preview */
  accepted: boolean;
}

const initialState: TaxiRouteState = {
  icao: '',
  direction: TaxiRouteDirection.Departure,
  startMode: TaxiRouteStartMode.Stand,
  clearance: '',
  accepted: false,
};

export const taxiRouteSlice = createSlice({
  name: 'taxiRoute',
  initialState,
  reducers: {
    setTaxiRouteValues: (state, action: PayloadAction<Partial<TaxiRouteState>>) => {
      Object.assign(state, action.payload);
    },
    clearTaxiRoute: () => initialState,
  },
});

export const { setTaxiRouteValues, clearTaxiRoute } = taxiRouteSlice.actions;

export default taxiRouteSlice.reducer;
