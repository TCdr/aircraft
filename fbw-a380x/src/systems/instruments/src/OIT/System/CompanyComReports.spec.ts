// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AocFmsMessages, FmsAocMessages } from '@datalink/aoc';
import { AtsuStatusCodes } from '@datalink/common';
import { CompanyComReports } from './CompanyComReports';
import { CompanyComDownlinks, CompanyComDownlinkStatus } from './CompanyComDownlinks';
import { COMPANY_COM_REQUEST_TIMEOUT_MS, CompanyComRequestStatus, freeTextMessage } from './CompanyComRequests';

const ETA_URL = 'nss-avncs/company-com/in-flight/eta';
const DIVERSION_URL = 'nss-avncs/company-com/in-flight/diversion';

/**
 * The OIT report forms, with the AOC side of the bus
 * @returns the reports, what the OIT published, the publisher of the AOC answers and the Outbox / Sent folders
 */
function setup() {
  const bus = new EventBus();
  const downlinks = new CompanyComDownlinks(bus, () => 0);
  downlinks.init();
  const reports = new CompanyComReports(bus, downlinks);
  reports.init();

  const sent: FmsAocMessages['aocSendFreetextMessage'][] = [];
  bus
    .getSubscriber<FmsAocMessages>()
    .on('aocSendFreetextMessage')
    .handle((request) => sent.push(request));

  const aoc = bus.getPublisher<AocFmsMessages>();
  return { reports, sent, aoc, downlinks };
}

describe('COMPANY COM report forms: sending', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the report through the AOC, into the Outbox, then into Sent once transmitted', () => {
    const { reports, sent, aoc, downlinks } = setup();
    expect(reports.send(ETA_URL, 'ETA', freeTextMessage('AFROPS', ['ETA', 'ETA 1745']))).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].message.Message).toBe('ETA\nETA 1745');
    expect(reports.status(ETA_URL).get()).toBe(CompanyComRequestStatus.Sending);
    expect(downlinks.outbox.get().map((d) => [d.subject, d.to, d.status])).toEqual([
      ['ETA', 'AFROPS', CompanyComDownlinkStatus.Sending],
    ]);

    aoc.pub('aocTransmissionResponse', { requestId: sent[0].requestId, status: AtsuStatusCodes.Ok });
    expect(reports.status(ETA_URL).get()).toBe(CompanyComRequestStatus.Sent);
    expect(downlinks.outbox.get()).toEqual([]);
    expect(downlinks.sent.get().map((d) => d.subject)).toEqual(['ETA']);
  });

  it('leaves a failed or unanswered report in the Outbox, NOT SENT', () => {
    const { reports, sent, aoc, downlinks } = setup();
    reports.send(ETA_URL, 'ETA', freeTextMessage('AFROPS', ['ETA']));
    aoc.pub('aocTransmissionResponse', { requestId: sent[0].requestId, status: AtsuStatusCodes.ComFailed });
    expect(reports.status(ETA_URL).get()).toBe(CompanyComRequestStatus.Failed);

    reports.send(DIVERSION_URL, 'DIVERSION', freeTextMessage('AFROPS', ['DIVERSION']));
    vi.advanceTimersByTime(COMPANY_COM_REQUEST_TIMEOUT_MS);
    expect(reports.status(DIVERSION_URL).get()).toBe(CompanyComRequestStatus.Failed);
    expect(downlinks.outbox.get().map((d) => [d.subject, d.status])).toEqual([
      ['DIVERSION', CompanyComDownlinkStatus.NotSent],
      ['ETA', CompanyComDownlinkStatus.NotSent],
    ]);
  });

  it('keeps one status per form, and one message per form at a time', () => {
    const { reports, sent, aoc } = setup();
    expect(reports.send(ETA_URL, 'ETA', freeTextMessage('AFROPS', ['ETA']))).toBe(true);
    expect(reports.send(ETA_URL, 'ETA', freeTextMessage('AFROPS', ['ETA AGAIN']))).toBe(false);
    expect(reports.send(DIVERSION_URL, 'DIVERSION', freeTextMessage('AFROPS', ['DIVERSION']))).toBe(true);
    expect(sent).toHaveLength(2);

    aoc.pub('aocTransmissionResponse', { requestId: sent[1].requestId, status: AtsuStatusCodes.Ok });
    expect(reports.status(DIVERSION_URL).get()).toBe(CompanyComRequestStatus.Sent);
    expect(reports.status(ETA_URL).get()).toBe(CompanyComRequestStatus.Sending);
  });

  it('ignores the answers to the other clients of the AOC', () => {
    const { reports, sent, aoc } = setup();
    reports.send(ETA_URL, 'ETA', freeTextMessage('AFROPS', ['ETA']));
    aoc.pub('aocTransmissionResponse', { requestId: sent[0].requestId + 1, status: AtsuStatusCodes.Ok });
    aoc.pub('aocTransmissionResponse', { requestId: 0, status: AtsuStatusCodes.Ok });
    expect(reports.status(ETA_URL).get()).toBe(CompanyComRequestStatus.Sending);
  });

  it('sends nothing for an incomplete form, and remembers the station of the last report', () => {
    const { reports, sent, downlinks } = setup();
    expect(reports.send(ETA_URL, 'ETA', null)).toBe(false);
    expect(sent).toHaveLength(0);
    expect(downlinks.downlinks.get()).toEqual([]);
    expect(reports.lastStation.get()).toBeNull();

    reports.send(ETA_URL, 'ETA', freeTextMessage('afrops', ['ETA']));
    expect(reports.lastStation.get()).toBe('AFROPS');
  });
});
