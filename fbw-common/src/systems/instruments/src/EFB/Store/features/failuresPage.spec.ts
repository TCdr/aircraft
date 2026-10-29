// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { closeFailureDetail, failurePageSlice, openFailureDetail, setSearchQuery, setSelection } from './failuresPage';

const reducer = failurePageSlice.reducer;

describe('failure detail view', () => {
  it('starts closed', () => {
    expect(reducer(undefined, { type: 'init' }).detailFailure).toBeNull();
  });

  it('opens the detail of a failure', () => {
    expect(reducer(undefined, openFailureDetail(21027)).detailFailure).toBe(21027);
  });

  it('closes the detail', () => {
    const open = reducer(undefined, openFailureDetail(21027));
    expect(reducer(open, closeFailureDetail()).detailFailure).toBeNull();
  });

  it('leaves the detail when a chapter is picked', () => {
    const open = reducer(undefined, openFailureDetail(21027));
    expect(reducer(open, setSelection(36)).detailFailure).toBeNull();
  });

  it('keeps the detail while searching', () => {
    const open = reducer(undefined, openFailureDetail(21027));
    expect(reducer(open, setSearchQuery('X')).detailFailure).toBe(21027);
  });
});
