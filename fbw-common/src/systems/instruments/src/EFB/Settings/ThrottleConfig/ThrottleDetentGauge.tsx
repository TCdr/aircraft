// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { CSSProperties, FC } from 'react';
import { isThrottleInDetent, throttleGaugePercent } from './throttleGaugeValues';

interface ThrottleDetentGaugeProps {
  /** The lever position of the axis, -1 to +1 */
  position: number;
  /** The bounds of the detent being calibrated, -1 to +1 */
  lowerBound: number;
  upperBound: number;
  /** Show the detent bounds (markers and values); without them only the lever position is shown */
  showDetent: boolean;
}

/** Places a marker or a value label at a mapping value, centred on it */
const at = (value: number): CSSProperties => ({
  bottom: `${throttleGaugePercent(value)}%`,
  transform: 'translateY(50%)',
});

/**
 * The vertical gauge of one throttle axis on the calibration page: the lever position fills the bar from the bottom
 * (reverse full) to the top (TOGA); the two markers are the bounds of the detent being calibrated, with their values
 * on each side. The markers and values turn to the active colour while the lever is inside the detent.
 */
export const ThrottleDetentGauge: FC<ThrottleDetentGaugeProps> = ({ position, lowerBound, upperBound, showDetent }) => {
  const inDetent = showDetent && isThrottleInDetent(position, lowerBound, upperBound);
  const markerClassName = `absolute -left-1 -right-1 h-1.5 rounded-full ${
    inDetent ? 'bg-m3-primary-light' : 'bg-m3-outline-strong'
  }`;
  const valueClassName = `absolute text-xs font-bold leading-none ${
    inDetent ? 'text-m3-on-primary-container' : 'text-m3-muted'
  }`;

  return (
    <div className="flex h-56 shrink-0 flex-row">
      <div className="relative w-10">
        {showDetent && (
          <span className={`right-0 ${valueClassName}`} style={at(lowerBound)}>
            {lowerBound.toFixed(2)}
          </span>
        )}
      </div>
      <div className="relative mx-1 w-8 rounded-md bg-m3-tile">
        <div
          className="absolute bottom-0 left-0 w-full rounded-md bg-m3-primary"
          style={{ height: `${throttleGaugePercent(position)}%` }}
        />
        {showDetent && <div className={markerClassName} style={at(lowerBound)} />}
        {showDetent && <div className={markerClassName} style={at(upperBound)} />}
      </div>
      <div className="relative w-10">
        {showDetent && (
          <span className={`left-0 ${valueClassName}`} style={at(upperBound)}>
            {upperBound.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
};
