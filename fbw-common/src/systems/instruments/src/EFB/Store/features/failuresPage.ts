// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { FailuresSelection } from '../../Failures/failuresView';

interface FailurePageState {
  searchQuery: string;
  /** The pane the user opened last; null until they pick one */
  selection: FailuresSelection | null;
  /** The failure whose detail view is open, null while the list shows */
  detailFailure: number | null;
}

const FailurePageInitialState: FailurePageState = { searchQuery: '', selection: null, detailFailure: null };

export const failurePageSlice = createSlice({
  name: 'failurePage',
  initialState: FailurePageInitialState,
  reducers: {
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    setSelection: (state, action: PayloadAction<FailuresSelection>) => {
      state.selection = action.payload;
      state.detailFailure = null;
    },
    openFailureDetail: (state, action: PayloadAction<number>) => {
      state.detailFailure = action.payload;
    },
    closeFailureDetail: (state) => {
      state.detailFailure = null;
    },
  },
});

export const { setSearchQuery, setSelection, openFailureDetail, closeFailureDetail } = failurePageSlice.actions;
export default failurePageSlice.reducer;
