// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { aocNotificationText, OisMessageToolbar } from './OisMessageToolbar';

/*
 * The message toolbar of an OIS menu bar displays messages to the flight crew and counts them; CLEAR erases them. A
 * company message notification selected on one OIT stays on the other OIT.
 */
describe('OIS message toolbar', () => {
  it('starts at 0 MSG, counts the messages and shows the newest one', () => {
    const toolbar = new OisMessageToolbar();
    expect(toolbar.count.get()).toBe(0);
    expect(toolbar.shownText.get()).toBe('');

    toolbar.post('FIRST');
    toolbar.postAocNotification(7, 'FREE TEXT KLMOPS');
    expect(toolbar.count.get()).toBe(2);
    expect(toolbar.shownText.get()).toBe(aocNotificationText('FREE TEXT KLMOPS'));
    expect(toolbar.messages.get().map((m) => m.text)).toEqual(['COMPANY MSG : FREE TEXT KLMOPS', 'FIRST']);
  });

  it('has one notification per company message', () => {
    const toolbar = new OisMessageToolbar();
    expect(toolbar.postAocNotification(7, 'METAR')).not.toBeNull();
    expect(toolbar.postAocNotification(7, 'METAR')).toBeNull();
    expect(toolbar.count.get()).toBe(1);
  });

  it('takes a selected message off the toolbar and gives it back once', () => {
    const toolbar = new OisMessageToolbar();
    toolbar.post('FIRST');
    const id = toolbar.postAocNotification(7, 'METAR') ?? -1;

    const selected = toolbar.select(id);
    expect(selected?.aocUid).toBe(7);
    expect(toolbar.count.get()).toBe(1);
    expect(toolbar.shownText.get()).toBe('FIRST');
    expect(toolbar.select(id)).toBeNull();
  });

  it('drops the notification of a company message read or deleted', () => {
    const toolbar = new OisMessageToolbar();
    toolbar.postAocNotification(7, 'METAR');
    toolbar.postAocNotification(8, 'TAF');
    toolbar.removeAocNotification(7);
    expect(toolbar.messages.get().map((m) => m.aocUid)).toEqual([8]);
  });

  it('CLEAR erases every message', () => {
    const toolbar = new OisMessageToolbar();
    toolbar.post('FIRST');
    toolbar.postAocNotification(7, 'METAR');
    toolbar.clear();
    expect(toolbar.count.get()).toBe(0);
    expect(toolbar.shownText.get()).toBe('');
  });

  it('keeps each OIT toolbar on its own', () => {
    const captain = new OisMessageToolbar();
    const firstOfficer = new OisMessageToolbar();
    const id = captain.postAocNotification(7, 'METAR') ?? -1;
    firstOfficer.postAocNotification(7, 'METAR');
    captain.select(id);
    expect(captain.count.get()).toBe(0);
    expect(firstOfficer.count.get()).toBe(1);
  });
});
