// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import simbriefReducer, {
  clearSimbriefData,
  initialState,
  isSimbriefDataLoaded,
  setFuelImported,
  setPayloadImported,
  setSimbriefData,
  setSimbriefDataPending,
  SimbriefData,
} from './simBrief';

// The real store pulls in the whole flyPad, which cannot be loaded outside the simulator.
// The check reads whichever store the module imports, so that store is swapped for one holding only this slice.
const storeHolder = vi.hoisted(() => ({ current: undefined as undefined | { getState: () => unknown } }));
vi.mock('../store', () => ({
  store: { getState: () => storeHolder.current?.getState() },
}));

const createStore = () => configureStore({ reducer: { simbrief: simbriefReducer } });

const loadedOfp = { ...initialState.data, flightNum: '1234', departingAirport: 'EDDF' } as SimbriefData;

describe('isSimbriefDataLoaded', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    storeHolder.current = store;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the initial data object by reference in a fresh store', () => {
    expect(store.getState().simbrief.data).toBe(initialState.data);
  });

  it('is not loaded in a fresh store', () => {
    expect(isSimbriefDataLoaded()).toBe(false);
  });

  it('is loaded after an OFP was set', () => {
    store.dispatch(setSimbriefData(loadedOfp));
    expect(isSimbriefDataLoaded()).toBe(true);
  });

  it('is not loaded again after the OFP was cleared', () => {
    store.dispatch(setSimbriefData(loadedOfp));
    store.dispatch(clearSimbriefData());
    expect(isSimbriefDataLoaded()).toBe(false);
  });

  it('stays not loaded when only the sibling flags change', () => {
    store.dispatch(setPayloadImported(true));
    store.dispatch(setFuelImported(true));
    store.dispatch(setSimbriefDataPending(true));
    expect(isSimbriefDataLoaded()).toBe(false);
  });

  it('does not serialise the OFP', () => {
    store.dispatch(setSimbriefData(loadedOfp));
    const stringify = vi.spyOn(JSON, 'stringify');
    isSimbriefDataLoaded();
    expect(stringify).not.toHaveBeenCalled();
  });
});
