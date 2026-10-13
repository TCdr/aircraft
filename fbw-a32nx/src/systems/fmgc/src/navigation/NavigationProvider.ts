// Copyright (c) 2023-2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SelectedNavaid } from '@fmgc/navigation/Navigation';
import { Coordinates } from 'msfs-geo';
import { FmNavigationMode } from '@fmgc/navigation/PositionUncertainty';

/**
 * An interface to a system providing FMS navigation.
 * This primarily exists to prevent circular dependencies.
 */
export interface NavigationProvider {
  /**
   * Get the baro corrected altitude
   * @returns baro corrected altitude in feet or null if invalid
   */
  getBaroCorrectedAltitude(): number | null;

  /**
   * Gets the estimated position error.
   * @returns Estimated position error in nautical miles, or Infinity if no position.
   */
  getEpe(): number;

  /**
   * Gets the FMS position
   * @returns FMS position or null if invalid
   */
  getPpos(): Coordinates | null;

  /** Whether GPS is the primary navigation means and meets accuracy requirements.
   * @returns true if GPS primary is active.
   */
  getGpsPrimary(): boolean;

  /** Whether the flight crew has deselected the GPS for the FMS position computation */
  isGpsDeselected(): boolean;

  /** Selects or deselects the GPS for the FMS position computation */
  setGpsDeselected(deselected: boolean): void;

  /**
   * Get the pressure altitude
   * @returns pressure altitude in feet or null if invalid
   */
  getPressureAltitude(): number | null;

  /**
   * Get the computed airspeed from the ADR
   * @returns computed air speed in knots or null if invalid
   */
  getComputedAirspeed(): number | null;

  /**
   * Get the radio altimeter height
   * @returns radio altimeter height in feet or null if invalid
   */
  getRadioHeight(): number | null;

  /**
   * Get the navaids selected by the FMS.
   * @param cdu The CDU to get navaids for, defaults to 1.
   */
  getSelectedNavaids(cdu?: 1 | 2): SelectedNavaid[];

  /**
   * Gets the active RNP considering priority order.
   * @returns RNP in nautical miles, or undefined if none.
   */
  getActiveRnp(): number | undefined;

  /**
   * Gets if the FMS position accuracy is high
   * @returns true if the position accuracy is high or false if low
   */
  isAccuracyHigh(): boolean;

  /**
   * Updates the required navigation performance of the FMS
   * @param rnp number The RNP value to set or null to clear a previous pilot input
   */
  setPilotRnp(rnp: number | null): void;

  /**
   * Gets if a pilot RNP entry was performed
   * @returns true if a pilot RNP entry was performed or false if not
   */
  isPilotRnp(): boolean;

  /** The FM navigation mode: IRS/GPS, IRS/DME/DME, IRS/VOR/DME or IRS only */
  getNavigationMode(): FmNavigationMode;

  /**
   * The FM position of an FMS
   * @param side the FMS, 1 or 2
   * @returns the position, null without an inertial position
   */
  getFmPosition(side: 1 | 2): Coordinates | null;

  /**
   * The GPIRS position an FMS selects
   * @param side the FMS, 1 or 2
   * @returns the position, null when none is valid or the GPS is deselected
   */
  getGpirsPosition(side: 1 | 2): Coordinates | null;

  /** The radio position, null outside the IRS/DME/DME and IRS/VOR/DME modes */
  getRadioPosition(): Coordinates | null;

  /**
   * The position of a GPS receiver
   * @param receiver the receiver, 1 or 2
   * @returns the position, null when not valid
   */
  getGpsPosition(receiver: 1 | 2): Coordinates | null;

  /**
   * The MIX IRS position of an FMS (or the single IRS position it uses)
   * @param side the FMS, 1 or 2
   * @returns the position, null without an IR position
   */
  getMixIrsPosition(side: 1 | 2): Coordinates | null;

  /** The number of IRS used for the IRS position (3 with the MIX IRS position, else 1), 0 without one */
  getIrsUsedCount(): 0 | 1 | 3;

  /**
   * The manual FM position update
   * @param position the position the aircraft overflies
   * @returns false when not allowed (IRS/GPS mode, or no FM position)
   */
  updatePositionAt(position: Coordinates): boolean;
}
