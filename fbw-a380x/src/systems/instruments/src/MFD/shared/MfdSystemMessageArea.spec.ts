// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ATIS_SYS_MSG, CHECK_FMS_MESSAGE, MfdSystemMessageArea, NEW_ATIS_RECEIVED } from './MfdSystemMessageArea';

describe('MFD System Message Area', () => {
  it('shows CHECK FMS MESSAGE for a new amber FMS message while another application is shown', () => {
    const area = new MfdSystemMessageArea();
    area.onApplicationShown('surv');
    area.onFmsMessages(true, true);
    expect(area.text.get()).toBe(CHECK_FMS_MESSAGE);
  });

  it('removes CHECK FMS MESSAGE when the crew accesses an FMS page', () => {
    const area = new MfdSystemMessageArea();
    area.onApplicationShown('atccom');
    area.onFmsMessages(true, true);
    area.onApplicationShown('fms');
    expect(area.text.get()).toBe('');
    // back on ATC COM: the crew has seen the message on the FMS page
    area.onApplicationShown('atccom');
    expect(area.text.get()).toBe('');
  });

  it('does not show CHECK FMS MESSAGE while the FMS is shown, nor for a white message', () => {
    const area = new MfdSystemMessageArea();
    area.onApplicationShown('fms');
    area.onFmsMessages(true, true);
    area.onApplicationShown('surv');
    expect(area.text.get()).toBe('');
    area.onFmsMessages(false, false);
    expect(area.text.get()).toBe('');
  });

  it('removes CHECK FMS MESSAGE when no amber FMS message is pending any more', () => {
    const area = new MfdSystemMessageArea();
    area.onApplicationShown('fcubkup');
    area.onFmsMessages(true, true);
    area.onFmsMessages(false, false);
    expect(area.text.get()).toBe('');
  });

  it('shows NEW ATIS RECEIVED for a new unread ATIS outside ATC COM, removed on an ATC COM page', () => {
    const area = new MfdSystemMessageArea();
    area.onApplicationShown('fms');
    area.onAtis([null, null, null], ['', '', '']);
    expect(area.text.get()).toBe('');
    area.onAtis(['A', null, null], ['', '', '']);
    expect(area.text.get()).toBe(NEW_ATIS_RECEIVED);
    area.onApplicationShown('atccom');
    expect(area.text.get()).toBe('');
    area.onApplicationShown('fms');
    // the same unread report: no new message
    area.onAtis(['A', null, null], ['', '', '']);
    expect(area.text.get()).toBe('');
    // the next ATIS letter
    area.onAtis(['B', null, null], ['', '', '']);
    expect(area.text.get()).toBe(NEW_ATIS_RECEIVED);
  });

  it('shows ATIS SYS MSG for an ATIS Flight System Message of the center, not for SENDING / SENT', () => {
    const area = new MfdSystemMessageArea();
    area.onApplicationShown('surv');
    area.onAtis([null, null, null], ['SENDING', '', '']);
    area.onAtis([null, null, null], ['SENT', '', '']);
    expect(area.text.get()).toBe('');
    area.onAtis([null, null, null], ['SENT', 'USE VOICE', '']);
    expect(area.text.get()).toBe(ATIS_SYS_MSG);
    area.onApplicationShown('atccom');
    expect(area.text.get()).toBe('');
  });

  it('ignores ATIS events while ATC COM is shown', () => {
    const area = new MfdSystemMessageArea();
    area.onApplicationShown('atccom');
    area.onAtis(['A', null, null], ['END OF UPDATE', '', '']);
    expect(area.text.get()).toBe('');
  });

  it('shows the most recent message; an FMS page access leaves the ATIS one', () => {
    const area = new MfdSystemMessageArea();
    area.onApplicationShown('surv');
    area.onAtis(['A', null, null], ['', '', '']);
    area.onFmsMessages(true, true);
    expect(area.text.get()).toBe(CHECK_FMS_MESSAGE);
    area.onApplicationShown('fms');
    expect(area.text.get()).toBe(NEW_ATIS_RECEIVED);
  });
});
