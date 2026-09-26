// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXDataStore } from './persistence';

/** The flypad realism setting of the company datalink reply time */
export type CompanyDatalinkReplyTime = 'INSTANT' | 'FAST' | 'REAL';

/**
 * The time the company ground station takes to answer a request sent by datalink (ACARS to the airline operations
 * centre and back): company flight plan, wind and takeoff data requests of the A380X FMS.
 *
 * Airbus gives no figure, only NO COMPANY REPLY when no answer comes within 4 min (A380 FCOM DSC-22-FMS-10-40-90): the
 * REAL values are typical airline values, below these 4 min. The transit is the time of a message sent without a
 * request, or after the reply time has already passed.
 */
export class CompanyDatalinkDelay {
  /** The flypad setting (Settings > Realism) */
  public static readonly SETTING_KEY = 'CONFIG_COMPANY_DATALINK_REPLY_TIME';

  private static readonly REPLY_MS: Record<CompanyDatalinkReplyTime, readonly [number, number]> = {
    INSTANT: [0, 0],
    FAST: [5_000, 15_000],
    REAL: [60_000, 120_000],
  };

  private static readonly TRANSIT_MS: Record<CompanyDatalinkReplyTime, readonly [number, number]> = {
    INSTANT: [0, 0],
    FAST: [1_000, 3_000],
    REAL: [5_000, 15_000],
  };

  public static setting(): CompanyDatalinkReplyTime {
    const value = NXDataStore.getLegacy(CompanyDatalinkDelay.SETTING_KEY, 'REAL');
    return value === 'INSTANT' || value === 'FAST' ? value : 'REAL';
  }

  /** A random time from a request to its answer, in ms */
  public static replyDelayMs(): number {
    return CompanyDatalinkDelay.random(CompanyDatalinkDelay.REPLY_MS[CompanyDatalinkDelay.setting()]);
  }

  /** A random transit time of a message, in ms */
  public static transitDelayMs(): number {
    return CompanyDatalinkDelay.random(CompanyDatalinkDelay.TRANSIT_MS[CompanyDatalinkDelay.setting()]);
  }

  /**
   * Waits until an answer can be delivered: not before `notBefore` (the request time plus its reply delay, as
   * Date.now()), and not before the transit time from now when the reply time has passed.
   */
  public static waitForDelivery(notBefore: number | null): Promise<void> {
    const ms = Math.max(notBefore !== null ? notBefore - Date.now() : 0, 0) || CompanyDatalinkDelay.transitDelayMs();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static random([min, max]: readonly [number, number]): number {
    return min + Math.random() * (max - min);
  }
}
