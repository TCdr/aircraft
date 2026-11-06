// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useState } from 'react';
import { GSX_TRIGGER_HOLD_MS } from './GsxRemote';
import type { ServiceLook } from './ServicesLayout';

/**
 * The release of a connected ground equipment (GPU, jet bridge, stairs), on its way.
 *
 * Pressing Release on a connected equipment does not change what GSX or the sim reports at once: GSX keeps the service
 * 'performing' until its crew has removed the equipment (seen in the sim: the GPU row kept "GPU service is
 * being performed" and its Release chip for a long time), and the GPU keeps powering the aircraft until it is unplugged.
 * So the flyPad remembers the press and shows the row 'released' (amber, "Leaving", chip disabled) until the equipment
 * is really gone, i.e. GSX or the sim no longer reports it connected and, for the GPU, no external power is available.
 *
 * Design choices:
 * - A fallback timeout (RELEASE_PENDING_TIMEOUT_MS) gives the row back to GSX or the sim when the equipment never
 *   leaves (e.g. GSX ignored the request without an error).
 * - A release GSX did not accept is forgotten at once (cancel).
 * - A docked GSX jet bridge or stairs starts moving about 1 s after GSX takes the release; one that GSX has not moved
 *   within GSX_REACTION_TIMEOUT_MS was ignored (GSX accepted the trigger but did nothing), so its row offers the
 *   release again (Retry) instead of "Leaving". The GPU has no such sign: GSX keeps it 'performing' while its crew
 *   unplugs it, so it only has the fallback timeout.
 * - GSX may first ask the crew to confirm the release in its menu (e.g. removing the stairs) and waits for the answer:
 *   while its menu is shown the release is not ignored, and the reaction time starts again when the menu closes.
 * - The memory lives outside the pages, so it survives a page switch.
 */

/** 3 min: a GSX crew removes a GPU, jet bridge or stairs well within this; past it, GSX or the sim is trusted again */
export const RELEASE_PENDING_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Design choice: 10 s. GSX reports a released jet bridge or stairs moving ('performing', phase 'undocking') about 1 s
 * after the trigger, after briefly opening and closing its menu; 10 s leaves room for a slow sim frame rate while
 * giving the button back well before the 3 min fallback.
 */
export const GSX_REACTION_TIMEOUT_MS = 10 * 1000;

/** What GSX shows of a docked jet bridge or stairs whose release it has to start (see ReleasePendingMemory.ignored) */
export interface GsxMoveSigns {
  /** GSX still reports it docked, i.e. it has not started moving it */
  stillDocked: boolean;
  /** GSX shows its menu, e.g. a question to confirm the release */
  menuShown: boolean;
  /** When GSX last closed its menu (ms), 0 when never */
  menuClosedAt: number;
}

const NO_GSX_MOVE: GsxMoveSigns = { stillDocked: false, menuShown: false, menuClosedAt: 0 };

/**
 * A Release press: the time the release reaches GSX (ms), and whether GSX has to start moving the equipment (a docked
 * jet bridge or stairs)
 */
interface ReleasePress {
  at: number;
  awaitsGsxMove: boolean;
}

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
  /** The Release press of each row */
  private readonly presses = new Map<string, ReleasePress>();

  private readonly listeners = new Set<() => void>();

  /**
   * Notes a click on the chip of a row: a Release when the row shows its equipment connected (the chip reads Release
   * only on an 'active' row); a Request is not remembered
   * @param key the row
   * @param look the look of the row when it was clicked
   * @param now the time (ms)
   * @param awaitsGsxMove the equipment is a docked GSX jet bridge or stairs, which GSX has to start moving (see ignored)
   * @param sendDelayMs how long the flyPad holds the release before it sends it to GSX (GsxRemote.trigger): GSX's
   * reaction time counts from the send, so a held release is not offered again as Retry because of the hold
   */
  public click(key: string, look: ServiceLook, now: number, awaitsGsxMove = false, sendDelayMs = 0): void {
    if (look !== 'active') {
      return;
    }
    this.presses.set(key, { at: now + sendDelayMs, awaitsGsxMove });
    this.notify();
  }

  /** Forgets the release of a row, e.g. GSX did not accept it */
  public cancel(key: string): void {
    if (this.presses.delete(key)) {
      this.notify();
    }
  }

  /**
   * Whether the release of a row is on its way: pressed, the equipment still there and the timeout not reached, and
   * not ignored by GSX
   * @param key the row
   * @param stillThere the equipment is still there (equipmentStillThere)
   * @param now the time (ms)
   * @param gsx what GSX shows of a jet bridge or stairs it has to move
   */
  public isPending(key: string, stillThere: boolean, now: number, gsx = NO_GSX_MOVE): boolean {
    return this.withinTimeout(key, stillThere, now) && !this.ignored(key, stillThere, now, gsx);
  }

  /**
   * Whether GSX ignored the release of a row: the jet bridge or stairs still docked GSX_REACTION_TIMEOUT_MS after the
   * press, or after GSX closed its menu if it did so since. The row then offers the release again (Retry).
   * @param key the row
   * @param stillThere the equipment is still there (equipmentStillThere)
   * @param now the time (ms)
   * @param gsx what GSX shows of the jet bridge or stairs
   */
  public ignored(key: string, stillThere: boolean, now: number, gsx: GsxMoveSigns): boolean {
    if (!this.awaitsGsxMove(key, stillThere, now, gsx) || gsx.menuShown) {
      return false;
    }
    const reactionFrom = Math.max(this.presses.get(key)!.at, gsx.menuClosedAt);
    return now - reactionFrom >= GSX_REACTION_TIMEOUT_MS;
  }

  /**
   * Whether GSX shows its menu while it has not started moving the released jet bridge or stairs: it is likely asking
   * the crew to confirm the release, and waits for the answer
   * @param key the row
   * @param stillThere the equipment is still there (equipmentStillThere)
   * @param now the time (ms)
   * @param gsx what GSX shows of the jet bridge or stairs
   */
  public asking(key: string, stillThere: boolean, now: number, gsx: GsxMoveSigns): boolean {
    return this.awaitsGsxMove(key, stillThere, now, gsx) && gsx.menuShown;
  }

  /**
   * The look of a row: 'released' while its release is on its way, else the look GSX or the sim gives it. A disabled or
   * hidden row (aircraft moving, pushback) stays so.
   */
  public look(key: string, look: ServiceLook, stillThere: boolean, now: number, gsx = NO_GSX_MOVE): ServiceLook {
    if (look === 'hidden' || look === 'disabled') {
      return look;
    }
    return this.isPending(key, stillThere, now, gsx) ? 'released' : look;
  }

  /**
   * Forgets the release of a row once it is over (equipment gone, or timeout), so that a later Request and connection
   * show normally. A release GSX ignored is kept, so that its row still offers Retry. Called by the page after each
   * render; nothing changes on the screen, so the listeners are not told.
   */
  public settle(key: string, stillThere: boolean, now: number): void {
    if (this.presses.has(key) && !this.withinTimeout(key, stillThere, now)) {
      this.presses.delete(key);
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

  /** The release of a row was pressed, the equipment is still there and the fallback timeout is not reached */
  private withinTimeout(key: string, stillThere: boolean, now: number): boolean {
    const press = this.presses.get(key);
    return press !== undefined && stillThere && now - press.at < RELEASE_PENDING_TIMEOUT_MS;
  }

  /** The release of a row is on its way and GSX has not started moving its docked jet bridge or stairs */
  private awaitsGsxMove(key: string, stillThere: boolean, now: number, gsx: GsxMoveSigns): boolean {
    return this.presses.get(key)?.awaitsGsxMove === true && gsx.stillDocked && this.withinTimeout(key, stillThere, now);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

/** The releases of the flyPad's Services pages */
export const releasePendingMemory = new ReleasePendingMemory();

/**
 * The releases on their way, for a page: it renders again on each press or cancel and when a release times out or GSX
 * has not reacted in time (neither changes anything GSX or the sim reports, so nothing else would render the page)
 */
export function useReleasePending(): ReleasePendingMemory {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const render = () => setVersion((version) => version + 1);
    const timeoutTimers: ReturnType<typeof setTimeout>[] = [];
    const unsubscribe = releasePendingMemory.subscribe(() => {
      render();
      // a little after the timeouts of this press, so that the row is past them when drawn again
      timeoutTimers.push(setTimeout(render, GSX_REACTION_TIMEOUT_MS + 500));
      timeoutTimers.push(setTimeout(render, GSX_TRIGGER_HOLD_MS + GSX_REACTION_TIMEOUT_MS + 500));
      timeoutTimers.push(setTimeout(render, RELEASE_PENDING_TIMEOUT_MS + 500));
    });
    return () => {
      unsubscribe();
      timeoutTimers.forEach((timer) => clearTimeout(timer));
    };
  }, []);
  return releasePendingMemory;
}
