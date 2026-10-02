// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EcamStatus, EcamStatusInputs } from './EcamStatus';

const idle: EcamStatusInputs = {
  statusEmpty: false,
  leftFailureDisplayed: false,
  lastAlertCleared: false,
  clearPressed: false,
  statusPressed: false,
  conf1SelectedInFlight: false,
  sdShowsStatus: false,
};

describe('A320 ECAM STATUS page display and STS reminder (FCOM DSC-31-20, DSC-31-25-20)', () => {
  it('calls the STATUS page when the last alert is cleared and the page is not empty', () => {
    const status = new EcamStatus();
    expect(status.update({ ...idle, leftFailureDisplayed: true }).requestStatusPage).toBe(false);
    expect(status.update({ ...idle, lastAlertCleared: true, clearPressed: true }).requestStatusPage).toBe(true);
    expect(status.update(idle).requestStatusPage).toBe(true);
  });

  it('does not call an empty STATUS page', () => {
    const status = new EcamStatus();
    expect(status.update({ ...idle, statusEmpty: true, lastAlertCleared: true }).requestStatusPage).toBe(false);
  });

  it('removes the STATUS page on the next CLR, or on STS', () => {
    const status = new EcamStatus();
    status.update({ ...idle, lastAlertCleared: true, clearPressed: true });
    expect(status.update({ ...idle, clearPressed: true }).requestStatusPage).toBe(false);

    status.update({ ...idle, lastAlertCleared: true, clearPressed: true });
    expect(status.update({ ...idle, statusPressed: true }).requestStatusPage).toBe(false);
  });

  it('calls the STATUS page when CONF 1 is selected for the approach', () => {
    const status = new EcamStatus();
    expect(status.update({ ...idle, conf1SelectedInFlight: true }).requestStatusPage).toBe(true);
    expect(status.update({ ...idle, statusEmpty: true }).requestStatusPage).toBe(false);
  });

  it('gives way to a new alert on the E/WD', () => {
    const status = new EcamStatus();
    status.update({ ...idle, lastAlertCleared: true, clearPressed: true });
    expect(status.update({ ...idle, leftFailureDisplayed: true }).requestStatusPage).toBe(false);
  });

  it('shows the STS reminder when the STATUS page is not empty and neither shown nor hidden by an alert', () => {
    const status = new EcamStatus();
    expect(status.update(idle).reminder).toBe(true);
    expect(status.update({ ...idle, sdShowsStatus: true }).reminder).toBe(false);
    expect(status.update({ ...idle, leftFailureDisplayed: true }).reminder).toBe(false);
    expect(status.update({ ...idle, statusEmpty: true }).reminder).toBe(false);
  });
});
