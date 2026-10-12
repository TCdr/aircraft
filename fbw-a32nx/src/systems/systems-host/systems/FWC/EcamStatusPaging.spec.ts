// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EcamStatus, EcamStatusInputs } from './EcamStatus';
import { EcamStatusPaging, EcamStatusPagingInputs } from './EcamStatusPaging';

/** The FWC update period (FwsManager FWC_PROCESSING_INTERVAL_MS) */
const DT = 0.06;
/** The FWC CLR pulse lasts 0.5 s: about 8 FWC updates */
const PULSE_UPDATES = 8;

const shown: EcamStatusPagingInputs = {
  pageCount: 3,
  sdShowsStatus: true,
  singleDisplay: false,
  ewdAlertDisplayed: false,
  clearPulse: false,
  statusPushed: false,
};

/** One CLR push as the FWC sees it: the 0.5 s pulse, then released; the outputs of each update */
function pushClear(paging: EcamStatusPaging, inputs: Partial<EcamStatusPagingInputs> = {}) {
  const outputs = [];
  for (let i = 0; i < PULSE_UPDATES; i++) {
    outputs.push(paging.update({ ...shown, ...inputs, clearPulse: true }, DT));
  }
  outputs.push(paging.update({ ...shown, ...inputs }, DT));
  return outputs;
}

/** One STS push held for `heldSeconds`, then released */
function pushStatus(paging: EcamStatusPaging, inputs: Partial<EcamStatusPagingInputs>, heldSeconds = 1) {
  for (let t = 0; t < heldSeconds; t += DT) {
    paging.update({ ...shown, ...inputs, statusPushed: true }, DT);
  }
  return paging.update({ ...shown, ...inputs }, DT);
}

describe('A320 ECAM STATUS page overflow and paging (FCOM DSC-31-20 l.46196-46199, DSC-31-30 l.46772-46779)', () => {
  it('scrolls to the next page on each CLR push, one page per push even though the FWC pulse lasts 0.5 s', () => {
    const paging = new EcamStatusPaging();
    expect(paging.update(shown, DT).pageIndex).toBe(0);
    expect(paging.update(shown, DT).clearScrollsPage).toBe(true);

    const first = pushClear(paging);
    expect(first.map((o) => o.pageIndex)).toEqual(Array(PULSE_UPDATES + 1).fill(1));
    // the push scrolled: it is not a CLR for the STATUS page itself
    expect(first.some((o) => o.clearPushForStatus)).toBe(false);

    const second = pushClear(paging);
    expect(second[second.length - 1].pageIndex).toBe(2);
    // the last page: no arrow, the next CLR removes the STATUS page
    expect(second[second.length - 1].clearScrollsPage).toBe(false);

    const third = pushClear(paging);
    expect(third[third.length - 1].pageIndex).toBe(2);
    expect(third.filter((o) => o.clearPushForStatus).length).toBe(1);
  });

  it('leaves a CLR push that clears an E/WD alert to the E/WD', () => {
    const paging = new EcamStatusPaging();
    paging.update({ ...shown, ewdAlertDisplayed: true }, DT);
    // this push clears the last alert: the E/WD has none after it
    const outputs = pushClear(paging);
    expect(outputs.every((o) => o.pageIndex === 0)).toBe(true);
    expect(outputs.some((o) => o.clearPushForStatus)).toBe(false);
    expect(outputs[outputs.length - 1].clearScrollsPage).toBe(true);
  });

  it('starts from the first page when the SD shows the STATUS page again, and on an STS push', () => {
    const paging = new EcamStatusPaging();
    paging.update(shown, DT);
    pushClear(paging);
    expect(paging.update({ ...shown, sdShowsStatus: false }, DT).pageIndex).toBe(0);
    expect(paging.update(shown, DT).pageIndex).toBe(0);

    pushClear(paging);
    expect(pushStatus(paging, {}).pageIndex).toBe(0);
  });

  it('follows a STATUS page that becomes shorter', () => {
    const paging = new EcamStatusPaging();
    paging.update(shown, DT);
    pushClear(paging);
    pushClear(paging);
    expect(paging.update({ ...shown, pageCount: 2 }, DT).pageIndex).toBe(1);
    expect(paging.update({ ...shown, pageCount: 1 }, DT)).toEqual({
      pageIndex: 0,
      clearScrollsPage: false,
      clearPushForStatus: false,
    });
  });

  it('with one ECAM display, shows the next page when the STS pb is pushed again within 2 s, if any', () => {
    const single = { singleDisplay: true };
    const paging = new EcamStatusPaging();
    // first push: the DMC selects the STATUS page
    expect(pushStatus(paging, { ...single, sdShowsStatus: false }).pageIndex).toBe(0);
    expect(pushStatus(paging, single).pageIndex).toBe(1);
    expect(pushStatus(paging, single).pageIndex).toBe(2);
    // no next page: the last page stays
    expect(pushStatus(paging, single).pageIndex).toBe(2);

    // pushed again after more than 2 s: the first page
    for (let t = 0; t < 2.5; t += DT) {
      paging.update({ ...shown, ...single }, DT);
    }
    expect(pushStatus(paging, single).pageIndex).toBe(0);
  });

  it('with one ECAM display, CLR does not scroll the STATUS page (the E/WD is shown)', () => {
    const paging = new EcamStatusPaging();
    const outputs = pushClear(paging, { singleDisplay: true });
    expect(outputs.every((o) => o.pageIndex === 0 && !o.clearScrollsPage)).toBe(true);
  });

  it('keeps the STATUS page called by the FWC for the whole CLR pulse that cleared the last alert', () => {
    const status = new EcamStatus();
    const paging = new EcamStatusPaging();
    const idle: EcamStatusInputs = {
      statusEmpty: false,
      leftFailureDisplayed: false,
      lastAlertCleared: false,
      clearPressed: false,
      statusPressed: false,
      conf1SelectedInFlight: false,
      sdShowsStatus: false,
    };
    const fwcUpdate = (clearPulse: boolean, lastAlertCleared: boolean, alert: boolean) => {
      const out = paging.update(
        { ...shown, pageCount: 1, sdShowsStatus: false, ewdAlertDisplayed: alert, clearPulse },
        DT,
      );
      return status.update({
        ...idle,
        leftFailureDisplayed: alert,
        lastAlertCleared,
        clearPressed: out.clearPushForStatus,
      }).requestStatusPage;
    };

    fwcUpdate(false, false, true);
    // the CLR push clears the last alert: the STATUS page is called, and stays called while the pulse lasts
    expect(fwcUpdate(true, true, false)).toBe(true);
    for (let i = 1; i < PULSE_UPDATES; i++) {
      expect(fwcUpdate(true, false, false)).toBe(true);
    }
    expect(fwcUpdate(false, false, false)).toBe(true);
    // the next CLR push removes it
    expect(fwcUpdate(true, false, false)).toBe(false);
  });
});
