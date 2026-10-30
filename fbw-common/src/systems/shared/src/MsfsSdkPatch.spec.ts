// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Pins the behaviour that patches/@microsoft__msfs-sdk@2.3.3.patch adds to the SDK, so that an SDK upgrade or a
 * missing patch is noticed: the instruments share one JavaScriptCore heap and the SDK's per-publish and per-frame
 * allocations are a large part of what makes it collect garbage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, SimVarPublisher, SimVarValueType } from '@microsoft/msfs-sdk';

/** The internals of the EventBus that the patch relies on */
interface EventBusInternals {
  _eventCache: Map<string, { data: unknown; synced: boolean }>;
}

describe('EventBus cache entries', () => {
  it('reuses the cache entry of a topic across publishes', () => {
    const bus = new EventBus();
    const cache = (bus as unknown as EventBusInternals)._eventCache;
    bus.pub('test_topic', 1, false, true);
    const firstEntry = cache.get('test_topic');
    bus.pub('test_topic', 2, false, true);
    expect(cache.get('test_topic')).toBe(firstEntry);
  });

  it('gives a later subscriber the latest data', () => {
    const bus = new EventBus();
    bus.pub('test_topic', 1, false, true);
    bus.pub('test_topic', 2, false, true);
    const received: number[] = [];
    bus
      .getSubscriber<{ test_topic: number }>()
      .on('test_topic')
      .handle((value) => received.push(value));
    expect(received).toEqual([2]);
  });

  it('does not cache a topic published uncached', () => {
    const bus = new EventBus();
    bus.pub('test_topic', 1, false, false);
    const received: number[] = [];
    bus
      .getSubscriber<{ test_topic: number }>()
      .on('test_topic')
      .handle((value) => received.push(value));
    expect(received).toEqual([]);
  });

  it('resyncs the latest data of the synced topics only', () => {
    const synced: [string, unknown][] = [];
    const bus = new EventBus();
    (bus as unknown as { syncEvent: (topic: string, data: unknown) => void }).syncEvent = (topic, data) => {
      synced.push([topic, data]);
    };
    bus.pub('synced_topic', 1, true, true);
    bus.pub('synced_topic', 2, true, true);
    bus.pub('local_topic', 5, false, true);
    // the topic turns from synced to local: the entry must follow the latest publish
    bus.pub('turned_local_topic', 7, true, true);
    bus.pub('turned_local_topic', 8, false, true);

    // publishing syncs as well: look at the resync alone
    synced.length = 0;
    bus.resyncEvents();

    expect(synced).toEqual([['synced_topic', 2]]);
  });
});

describe('SimVarPublisher.onUpdate', () => {
  const values = new Map<string, number>();
  const ids: string[] = [];
  const originalGetRegisteredId = SimVar.GetRegisteredId;
  const originalSimvar = global.simvar;

  beforeEach(() => {
    values.clear();
    ids.length = 0;
    SimVar.GetRegisteredId = (name: string) => {
      const known = ids.indexOf(name);
      return known >= 0 ? known : ids.push(name) - 1;
    };
    global.simvar = { getValueReg: (id: number) => values.get(ids[id]) ?? 0 } as typeof global.simvar;
  });

  afterEach(() => {
    SimVar.GetRegisteredId = originalGetRegisteredId;
    global.simvar = originalSimvar;
  });

  it('publishes every subscribed topic once, in subscription order, with its value', () => {
    interface Topics {
      first: number;
      second: number;
      third: number;
    }
    const bus = new EventBus();
    const publisher = new SimVarPublisher<Topics>(
      new Map([
        ['first', { name: 'L:TEST_FIRST', type: SimVarValueType.Number }],
        ['second', { name: 'L:TEST_SECOND', type: SimVarValueType.Number }],
        ['third', { name: 'L:TEST_THIRD', type: SimVarValueType.Number }],
      ]),
      bus,
    );
    const published: [string, number][] = [];
    const subscriber = bus.getSubscriber<Topics>();
    // subscription order, not the order of the entries map, decides the publish order
    subscriber.on('third').handle((value) => published.push(['third', value]));
    subscriber.on('first').handle((value) => published.push(['first', value]));
    publisher.startPublish();
    published.length = 0;

    values.set('L:TEST_FIRST', 11);
    values.set('L:TEST_SECOND', 22);
    values.set('L:TEST_THIRD', 33);
    publisher.onUpdate();

    expect(published).toEqual([
      ['third', 33],
      ['first', 11],
    ]);

    subscriber.on('second').handle((value) => published.push(['second', value]));
    published.length = 0;
    publisher.onUpdate();

    expect(published).toEqual([
      ['third', 33],
      ['first', 11],
      ['second', 22],
    ]);
  });

  it('walks the subscribed topics with forEach and a function created once, not with an iterator per frame', () => {
    const bus = new EventBus();
    const publisher = new SimVarPublisher<{ first: number }>(
      new Map([['first', { name: 'L:TEST_FIRST', type: SimVarValueType.Number }]]),
      bus,
    );
    bus
      .getSubscriber<{ first: number }>()
      .on('first')
      .handle(() => {});
    publisher.startPublish();

    const { subscribed, publishSubscribedTopicFn } = publisher as unknown as {
      subscribed: Map<string, unknown>;
      publishSubscribedTopicFn: unknown;
    };
    let iteratorsCreated = 0;
    const forEach = vi.spyOn(subscribed, 'forEach');
    Object.defineProperty(subscribed, Symbol.iterator, {
      value: () => {
        iteratorsCreated++;
        return Map.prototype[Symbol.iterator].call(subscribed);
      },
    });

    publisher.onUpdate();

    expect(typeof publishSubscribedTopicFn).toBe('function');
    expect(forEach).toHaveBeenCalledWith(publishSubscribedTopicFn);
    expect(iteratorsCreated).toBe(0);
  });
});
