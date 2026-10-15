// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useState } from 'react';
import type { ServiceLook } from './ServicesLayout';

/**
 * The release of a connected ground equipment (GPU, jet bridge, stairs), on its way.
 *
 * Pressing Release on a connected equipment does not change what GSX or the sim reports at once: GSX keeps the service
 * 'performing' until its crew has removed the equipment (the 2026-10-15 sim report: the GPU row kept "GPU service is
 * being performed" and its Release chip for a long time), and the GPU keeps powering the aircraft until it is unplugged.
 * So the flyPad remembers the press and shows the row 'released' (amber, "Leaving", chip disabled) until the equipment
 * is really gone, i.e. GSX or the sim no longer reports it connected and, for the GPU, no external power is available.
 *
 * Design choices:
 * - A fallback timeout (RELEASE_PENDING_TIMEOUT_MS) gives the row back to GSX or the sim when the equipment never
 *   leaves (e.g. GSX ignored the request without an error).
 * - A release GSX did not accept is forgotten at once (cancel).
 * - The memory lives outside the pages, so it survives a page switch.
 */

/** 3 min: a GSX crew removes a GPU, jet bridge or stairs well within this; past it, GSX or the sim is trusted again */
export const RELEASE_PENDING_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Whether the equipment of a row is still there, as GSX or the sim reports it
 * @param look the look GSX or the sim gives the row: connected ('active') or leaving on its own ('released')
 * @param powered for the GPU: external power is available
 */
export function equipmentStillThere(look: ServiceLook, powered = false): boolean {
  return look === 'active' || look === 'released' || powered;
}

/** The releases on their way, by row key ('gpu', 'jetBridge', 'stairs') */
export class ReleasePendingMemory {
  /** The time of the Release press of each row (ms) */
  private readonly releasedAt = new Map<string, number>();

  private readonly listeners = new Set<() => void>();

  /**
   * Notes a click on the chip of a row: a Release when the row shows its equipment connected (the chip reads Release
   * only on an 'active' row); a Request is not remembered
   * @param key the row
   * @param look the look of the row when it was clicked
   * @param now the time (ms)
   */
  public click(key: string, look: ServiceLook, now: number): void {
    if (look !== 'active') {
      return;
    }
    this.releasedAt.set(key, now);
    this.notify();
  }

  /** Forgets the release of a row, e.g. GSX did not accept it */
  public cancel(key: string): void {
    if (this.releasedAt.delete(key)) {
      this.notify();
    }
  }

  /**
   * Whether the release of a row is on its way: pressed, the equipment still there and the timeout not reached
   * @param key the row
   * @param stillThere the equipment is still there (equipmentStillThere)
   * @param now the time (ms)
   */
  public isPending(key: string, stillThere: boolean, now: number): boolean {
    const releasedAt = this.releasedAt.get(key);
    return releasedAt !== undefined && stillThere && now - releasedAt < RELEASE_PENDING_TIMEOUT_MS;
  }

  /**
   * The look of a row: 'released' while its release is on its way, else the look GSX or the sim gives it. A disabled or
   * hidden row (aircraft moving, pushback) stays so.
   */
  public look(key: string, look: ServiceLook, stillThere: boolean, now: number): ServiceLook {
    if (look === 'hidden' || look === 'disabled') {
      return look;
    }
    return this.isPending(key, stillThere, now) ? 'released' : look;
  }

  /**
   * Forgets the release of a row once it is over (equipment gone, or timeout), so that a later Request and connection
   * show normally. Called by the page after each render; nothing changes on the screen, so the listeners are not told.
   */
  public settle(key: string, stillThere: boolean, now: number): void {
    if (this.releasedAt.has(key) && !this.isPending(key, stillThere, now)) {
      this.releasedAt.delete(key);
    }
  }

  /**
   * Follows the releases pressed and cancelled
   * @returns the function that stops following them
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

/** The releases of the flyPad's Services pages */
export const releasePendingMemory = new ReleasePendingMemory();

/**
 * The releases on their way, for a page: it renders again on each press or cancel and when a release times out (a
 * timeout changes nothing GSX or the sim reports, so nothing else would render the page)
 */
export function useReleasePending(): ReleasePendingMemory {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const render = () => setVersion((version) => version + 1);
    const timeoutTimers: ReturnType<typeof setTimeout>[] = [];
    const unsubscribe = releasePendingMemory.subscribe(() => {
      render();
      // a little after the timeout of this press, so that the row is past it when drawn again
      timeoutTimers.push(setTimeout(render, RELEASE_PENDING_TIMEOUT_MS + 500));
    });
    return () => {
      unsubscribe();
      timeoutTimers.forEach((timer) => clearTimeout(timer));
    };
  }, []);
  return releasePendingMemory;
}
