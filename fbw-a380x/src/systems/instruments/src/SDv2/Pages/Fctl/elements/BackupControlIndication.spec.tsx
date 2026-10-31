// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it } from 'vitest';
import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { SDSimvars } from '../../../SDSimvarPublisher';
import { FctlPage } from '../FctlPage';
import { isBackupControlActive } from './BackupControlIndication';

describe('SD F/CTL BKUP CTL ACTIVE', () => {
  it('is shown when all the PRIMs and SECs are lost', () => {
    expect(isBackupControlActive([false, false, false], [false, false, false])).toBe(true);
    expect(isBackupControlActive([0, 0, 0], [0, 0, 0])).toBe(true);
  });

  it('is not shown while one PRIM or one SEC is healthy (SimVar Bool reads give 1)', () => {
    expect(isBackupControlActive([0, 0, 1], [0, 0, 0])).toBe(false);
    expect(isBackupControlActive([0, 0, 0], [0, 1, 0])).toBe(false);
    expect(isBackupControlActive([true, true, true], [true, true, true])).toBe(false);
  });

  describe('the F/CTL page', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    /**
     * @param healthy the health of the computers
     * @param healthy.prims PRIM 1 to 3 healthy
     * @param healthy.secs SEC 1 to 3 healthy
     * @returns the visibility of the BKUP CTL ACTIVE legend, with the given computers healthy
     */
    function backupControlVisibility(healthy: { prims: boolean[]; secs: boolean[] }): string | null | undefined {
      const bus = new EventBus();
      const container = document.createElement('div');
      document.body.appendChild(container);
      FSComponent.render(<FctlPage bus={bus} visible={Subject.create(true)} />, container);
      const publisher = bus.getPublisher<SDSimvars>();
      healthy.prims.forEach((isHealthy, index) =>
        publisher.pub(`prim${index + 1}Healthy` as 'prim1Healthy', isHealthy),
      );
      healthy.secs.forEach((isHealthy, index) => publisher.pub(`sec${index + 1}Healthy` as 'sec1Healthy', isHealthy));
      return container.querySelector('#bkup-ctl-active')?.getAttribute('visibility');
    }

    it('draws the indication when all the PRIMs and SECs are lost only', () => {
      expect(backupControlVisibility({ prims: [false, false, false], secs: [false, false, false] })).toBe('inherit');
      expect(backupControlVisibility({ prims: [false, false, true], secs: [false, false, false] })).toBe('hidden');
      expect(backupControlVisibility({ prims: [false, false, false], secs: [false, true, false] })).toBe('hidden');
    });
  });
});
