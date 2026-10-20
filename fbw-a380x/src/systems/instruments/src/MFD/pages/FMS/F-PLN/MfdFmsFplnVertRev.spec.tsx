// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { MfdFmsFplnVertRev } from './MfdFmsFplnVertRev';

/**
 * A stand-in for the FMC and display services: every property and call returns another stand-in, so that the page
 * builds without a running FMS
 * @returns the stand-in
 */
function anything(): any {
  return new Proxy(function () {}, {
    get(_target, property) {
      if (property === Symbol.toPrimitive) {
        return () => 0;
      }
      if (property === Symbol.iterator) {
        return [][Symbol.iterator].bind([]);
      }
      if (property === 'then') {
        return undefined;
      }
      return anything();
    },
    apply: () => anything(),
  });
}

// The MSFS Utils global, used by the dropdown menus
(window as any).Utils = anything();

/**
 * Builds the VERT REV page as the MFD does when it navigates to it
 * @param tab the tab of the page URI (rta, cms, spd, alt, step-alts)
 */
function renderVertRev(tab: string): void {
  const uiService = new Proxy(
    {
      activeUri: Subject.create({
        uri: `fms/active/f-pln-vert-rev/${tab}`,
        sys: 'fms',
        category: 'active',
        page: 'f-pln-vert-rev',
        extra: tab,
      }),
      captOrFo: 'CAPT',
    },
    { get: (service: any, property) => (property in service ? service[property] : anything()) },
  );
  const mfd = new Proxy({}, { get: (_mfd, property) => (property === 'uiService' ? uiService : anything()) });

  const container = document.createElement('div');
  document.body.appendChild(container);
  FSComponent.render(
    <MfdFmsFplnVertRev
      pageTitle="VERT REV"
      bus={new EventBus()}
      mfd={mfd as any}
      fmcService={anything()}
      flightPlanInterface={anything()}
    />,
    container,
  );
}

describe('MfdFmsFplnVertRev', () => {
  // A throw while the page builds leaves the whole MFD black (header and page are rebuilt on each navigation)
  for (const tab of ['rta', 'cms', 'spd', 'alt', 'step-alts']) {
    it(`builds with the ${tab} tab selected`, () => {
      expect(() => renderVertRev(tab)).not.toThrow();
    });
  }
});
