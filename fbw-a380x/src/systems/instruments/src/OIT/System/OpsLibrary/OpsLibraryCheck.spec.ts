// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { OpsManual, OpsNode, manualHash } from './OpsLibraryContent';
import { CHECK_DURATION_MS, OpsLibraryCheckRunner, checkManual, checkStatusText } from './OpsLibraryCheck';

const root: OpsNode = {
  id: 'm',
  title: 'M',
  kind: 'folder',
  children: [{ id: 'm/a', title: 'A', kind: 'unit', blocks: [{ t: 'p', layer: 1, text: 'x' }] }],
};

const manual = (overrides: Partial<OpsManual>): OpsManual => ({
  id: 'm',
  title: 'M',
  revision: 'r',
  units: 1,
  hash: manualHash(root),
  root,
  ...overrides,
});

describe('checkManual', () => {
  it('succeeds when the count and the checksum match', () => {
    expect(checkManual(manual({}))).toBe('success');
  });

  it('fails on a wrong checksum or unit count', () => {
    expect(checkManual(manual({ hash: '00000000' }))).toBe('failed');
    expect(checkManual(manual({ units: 2 }))).toBe('failed');
  });

  it('compares only the count for a manual without a checksum', () => {
    expect(checkManual(manual({ hash: '' }))).toBe('success');
  });
});

describe('checkStatusText', () => {
  const date = () => '29-OCT-26';
  it('shows Checking... while it runs, then the result with its date', () => {
    expect(checkStatusText(true, null, date)).toBe('Checking...');
    expect(checkStatusText(false, { result: 'success', date: 1 }, date)).toBe('Success check on 29-OCT-26');
    expect(checkStatusText(false, { result: 'failed', date: 1 }, date)).toBe('Failed check on 29-OCT-26');
    expect(checkStatusText(false, { result: 'aborted', date: 1 }, date)).toBe('Aborted check on 29-OCT-26');
    expect(checkStatusText(false, null, date)).toBe('');
  });
});

describe('OpsLibraryCheckRunner', () => {
  it('ends a check after its duration', () => {
    const runner = new OpsLibraryCheckRunner();
    expect(runner.start('m', 1000)).toBe(true);
    expect(runner.update(1000 + CHECK_DURATION_MS - 1, true)).toBeNull();
    expect(runner.update(1000 + CHECK_DURATION_MS, true)).toEqual({ manualId: 'm', outcome: 'done' });
    expect(runner.running.get()).toBeNull();
  });

  it('runs one check at a time', () => {
    const runner = new OpsLibraryCheckRunner();
    runner.start('m', 0);
    expect(runner.start('n', 10)).toBe(false);
  });

  it('aborts when the laptop goes off during the check', () => {
    const runner = new OpsLibraryCheckRunner();
    runner.start('m', 0);
    expect(runner.update(10, false)).toEqual({ manualId: 'm', outcome: 'aborted' });
    expect(runner.update(20, true)).toBeNull();
  });
});
