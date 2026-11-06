// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, RunwaySurfaceType } from '@microsoft/msfs-sdk';
import { AwarenessRunway, NearbyRunwayProvider } from '@flybywiresim/fbw-sdk';
import {
  EgpwcDatabaseRunway,
  EgpwcRunwayDatabase,
  egpwcDatabaseRunways,
  isEgpwcDatabaseRunway,
  toEgpwcDatabaseRunway,
} from './EgpwcRunwayDatabase';

let onCommBusRequest: (() => void) | undefined;

vi.mock('@flybywiresim/fbw-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@flybywiresim/fbw-sdk')>()),
  ViewListenerUtils: {
    getListener: () =>
      Promise.resolve({
        on: (_topic: string, callback: () => void) => {
          onCommBusRequest = callback;
        },
      }),
  },
}));

const FEET_PER_METRE = 1 / 0.3048;
const THREE_THOUSAND_FIVE_HUNDRED_FEET_M = 3_500 * 0.3048;

function runway(overrides: Partial<AwarenessRunway> & { ident?: string; course?: number } = {}): AwarenessRunway {
  const { ident = '09', course = 90, ...rest } = overrides;
  return {
    airport: 'TEST',
    latitude: 0,
    longitude: 0,
    length: 3_000,
    width: 45,
    surface: RunwaySurfaceType.Asphalt,
    ends: [
      { number: 9, designator: '', ident, course, displacedThreshold: 0, elevation: 0 },
      {
        number: 27,
        designator: '',
        ident: `${ident}-reciprocal`,
        course: (course + 180) % 360,
        displacedThreshold: 0,
        elevation: 0,
      },
    ],
    ...rest,
  };
}

describe('which runways the EGPWC database holds', () => {
  it('keeps an asphalt runway of 3500 ft', () => {
    expect(isEgpwcDatabaseRunway(runway({ length: THREE_THOUSAND_FIVE_HUNDRED_FEET_M }))).toBe(true);
  });

  it('leaves out an asphalt runway of 3400 ft', () => {
    expect(isEgpwcDatabaseRunway(runway({ length: 3_400 * 0.3048 }))).toBe(false);
  });

  it('leaves out grass and dirt runways', () => {
    expect(isEgpwcDatabaseRunway(runway({ surface: RunwaySurfaceType.Grass }))).toBe(false);
    expect(isEgpwcDatabaseRunway(runway({ surface: RunwaySurfaceType.Dirt }))).toBe(false);
  });

  it('leaves out ice and steel mat runways', () => {
    expect(isEgpwcDatabaseRunway(runway({ surface: RunwaySurfaceType.Ice }))).toBe(false);
    expect(isEgpwcDatabaseRunway(runway({ surface: RunwaySurfaceType.SteelMats }))).toBe(false);
  });

  it('keeps runways of every hard surface', () => {
    for (const surface of [
      RunwaySurfaceType.Asphalt,
      RunwaySurfaceType.Bituminous,
      RunwaySurfaceType.Brick,
      RunwaySurfaceType.Concrete,
      RunwaySurfaceType.Macadam,
      RunwaySurfaceType.Tarmac,
    ]) {
      expect(isEgpwcDatabaseRunway(runway({ surface }))).toBe(true);
    }
  });

  it('keeps a runway that has no surface', () => {
    expect(isEgpwcDatabaseRunway(runway({ surface: undefined }))).toBe(true);
  });
});

/** 3000 m long, runway 09 with a threshold displaced by 300 m */
function displacedRunway(): AwarenessRunway {
  return runway({
    length: 3_000,
    ends: [
      { number: 9, designator: '', ident: '09', course: 90, displacedThreshold: 300, elevation: 10 },
      { number: 27, designator: '', ident: '27', course: 270, displacedThreshold: 0, elevation: 10 },
    ],
  });
}

describe('the runway as the EGPWC database holds it', () => {
  it('is the primary landing threshold with the length from there', () => {
    const result = toEgpwcDatabaseRunway(displacedRunway());

    // 1200 m west of the centre: 1500 m to the runway end, 300 m back to the displaced threshold
    expect(result.latitude).toBe(0);
    expect(result.longitude).toBeCloseTo(-1_200 / 111_194.9, 4);
    expect(result.lengthFt).toBe(Math.round(2_700 * FEET_PER_METRE));
    expect(result.elevationFt).toBe(33);
    expect(result.trueHeadingDeg).toBe(90);
  });
});

describe('the message sent', () => {
  // The Rust test "the_message_the_host_sends_is_read_with_its_values" reads this same message
  it('is the JSON list of the runways', () => {
    const message = JSON.stringify(egpwcDatabaseRunways([displacedRunway()], 0, 0));

    expect(message).toBe('[{"latitude":0,"longitude":-0.01079,"elevationFt":33,"trueHeadingDeg":90,"lengthFt":8858}]');
  });
});

describe('the list of runways sent', () => {
  function runwaysAlongMeridian(count: number): AwarenessRunway[] {
    return Array.from({ length: count }, (_, index) =>
      runway({ airport: `AP${index.toString().padStart(2, '0')}`, ident: '09', latitude: index * 0.01 }),
    );
  }

  it('keeps the 60 nearest of 70 runways', () => {
    const sent = egpwcDatabaseRunways(runwaysAlongMeridian(70), 0, 0);

    expect(sent).toHaveLength(EgpwcRunwayDatabase.MAX_RUNWAYS);
    // the farthest kept is the 60th, 0.59 degrees north of the aircraft
    expect(Math.max(...sent.map((entry) => entry.latitude))).toBeCloseTo(0.59, 4);
  });

  it('does not depend on the order the provider lists the runways in', () => {
    const runways = runwaysAlongMeridian(10);

    expect(egpwcDatabaseRunways([...runways].reverse(), 0, 0)).toEqual(egpwcDatabaseRunways(runways, 0, 0));
  });
});

describe('the EGPWC runway database sending', () => {
  const nearbyRunways: { current: readonly AwarenessRunway[] } = { current: [] };
  const sentMessages: string[] = [];
  const MESSAGE_SEND_INTERVAL_MS = 30_000;

  function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function readyDatabase(): Promise<EgpwcRunwayDatabase> {
    const database = new EgpwcRunwayDatabase(new EventBus());
    database.init();
    await settle();
    return database;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    onCommBusRequest = undefined;
    sentMessages.length = 0;
    nearbyRunways.current = [runway()];
    vi.spyOn(NearbyRunwayProvider.prototype, 'update').mockImplementation(() => undefined);
    vi.spyOn(NearbyRunwayProvider.prototype, 'runways', 'get').mockImplementation(() => nearbyRunways.current);
    (global as any).SimVar = { GetSimVarValue: vi.fn().mockReturnValue(0) };
    (global as any).Coherent = {
      call: (event: string, topic: string, data: string) => {
        if (event === 'COMM_BUS_WASM_CALLBACK' && topic === 'FBW_EGPWC_RUNWAYS') {
          sentMessages.push(data);
        }
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends nothing before the CommBus listener is ready', () => {
    const database = new EgpwcRunwayDatabase(new EventBus());
    database.init();

    database.onUpdate();

    expect(sentMessages).toHaveLength(0);
  });

  it('sends the runways once the listener is ready', async () => {
    const database = await readyDatabase();

    database.onUpdate();

    expect(sentMessages).toHaveLength(1);
    const sent: EgpwcDatabaseRunway[] = JSON.parse(sentMessages[0]);
    expect(sent).toHaveLength(1);
    expect(sent[0].trueHeadingDeg).toBe(90);
  });

  it('does not send an unchanged list again before 30 s have passed', async () => {
    const database = await readyDatabase();
    database.onUpdate();

    vi.setSystemTime(1_000_000 + MESSAGE_SEND_INTERVAL_MS - 1);
    nearbyRunways.current = [...nearbyRunways.current];
    database.onUpdate();

    expect(sentMessages).toHaveLength(1);
  });

  it('sends the list again after 30 s', async () => {
    const database = await readyDatabase();
    database.onUpdate();

    vi.setSystemTime(1_000_000 + MESSAGE_SEND_INTERVAL_MS);
    database.onUpdate();

    expect(sentMessages).toHaveLength(2);
  });

  it('sends the list again when the systems WASM asks for it', async () => {
    const database = await readyDatabase();
    database.onUpdate();

    onCommBusRequest?.();
    database.onUpdate();

    expect(sentMessages).toHaveLength(2);
  });

  it('sends a changed list at once', async () => {
    const database = await readyDatabase();
    database.onUpdate();

    nearbyRunways.current = [runway({ airport: 'OTHER', latitude: 0.1 })];
    database.onUpdate();

    expect(sentMessages).toHaveLength(2);
    expect(JSON.parse(sentMessages[1])[0].latitude).toBeCloseTo(0.1, 4);
  });
});
