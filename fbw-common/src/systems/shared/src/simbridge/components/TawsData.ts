// Copyright (c) 2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { fetchWithTimeout, getSimBridgeUrl } from '../common';
import { ElevationSamplePathDto, NavigationDisplayThresholdsDto, TawsAircraftStatusDataDto } from '../Taws/taws';

/**
 * Class responsible for retrieving data related to company routes from SimBridge
 */
export class TawsData {
  /**
   * Used to send aircraft status data (EFIS, ...) to the TAWS.
   */
  public static async postAircraftStatusData(data: TawsAircraftStatusDataDto): Promise<boolean> {
    if (data) {
      const response = await fetchWithTimeout(`${getSimBridgeUrl()}/api/v1/terrain/aircraftStatusData`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        return true;
      }
    }
    return false;
  }

  /**
   * Fetches the terrain elevation thresholds (peaks box figures) of the last terrain picture SimBridge rendered
   * for one ND. SimBridge answers with an empty body while it has no picture for that side (terrain not requested
   * there, no aircraft status yet, ...).
   * @param side The ND side, L (captain) or R (first officer)
   * @returns the thresholds, or null when SimBridge has none for that side
   */
  public static async getRenderingThresholds(side: 'L' | 'R'): Promise<NavigationDisplayThresholdsDto | null> {
    const response = await fetchWithTimeout(`${getSimBridgeUrl()}/api/v1/terrain/renderingThresholds?display=${side}`);
    if (!response.ok) {
      throw new Error(`SimBridge Error: ${response.status}`);
    }
    const body = await response.text();
    if (body.length === 0) {
      return null;
    }
    const thresholds = JSON.parse(body);
    if (typeof thresholds?.minElevation !== 'number' || typeof thresholds?.maxElevation !== 'number') {
      return null;
    }
    return thresholds as NavigationDisplayThresholdsDto;
  }

  public static async postVerticalDisplayPath(data: ElevationSamplePathDto): Promise<boolean> {
    if (data) {
      const response = await fetchWithTimeout(`${getSimBridgeUrl()}/api/v1/terrain/verticalDisplayPath`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        return true;
      }
    }
    return false;
  }
}
