// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { OverWingOutline } from '../../../../Assets/OverWingOutline';

/**
 * The tank cells in the units of the over-wing outline (0 0 1290 455): the wing tank boxes of the outline, cut at its
 * rib lines into the inner and the outer cell, and its centre tank box.
 */
const TANK_CELLS = {
  centre: '576.722,101.605 714.115,101.605 714.115,211.98 576.722,211.98',
  leftInner: '573.147,101.605 262.877,256.658 261.066,314.268 573.547,211.98',
  leftOuter: '262.877,256.658 140.557,316.431 139.334,355.229 261.066,314.268',
  rightInner: '717.149,101.605 1027.44,256.658 1029.25,314.268 716.772,211.98',
  rightOuter: '1027.44,256.658 1149.83,316.431 1151.06,355.229 1029.25,314.268',
};

type TankCell = keyof typeof TANK_CELLS;

interface A320FuelPlanformProps {
  /** The level of each tank, 0 to 100 */
  levels: Record<TankCell, number>;
  className?: string;
}

/** The A320 from over the wings, its five tanks filled from the bottom to their level */
export const A320FuelPlanform: FC<A320FuelPlanformProps> = ({ levels, className }) => (
  <div className={`relative ${className ?? ''}`}>
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1290 455" fill="none">
      <defs>
        {(Object.keys(TANK_CELLS) as TankCell[]).map((cell) => {
          const level = `${Math.max(0, Math.min(100, levels[cell]))}%`;
          return (
            <linearGradient key={cell} id={`a320Fuel-${cell}`} x1="0" x2="0" y1="1" y2="0">
              <stop offset="0%" stopColor="var(--m3-primary)" />
              <stop offset={level} stopColor="var(--m3-primary)" />
              <stop offset={level} stopColor="var(--m3-tile)" />
              <stop offset="100%" stopColor="var(--m3-tile)" />
            </linearGradient>
          );
        })}
      </defs>
      {(Object.keys(TANK_CELLS) as TankCell[]).map((cell) => (
        <polygon key={cell} points={TANK_CELLS[cell]} fill={`url(#a320Fuel-${cell})`} />
      ))}
    </svg>
    <OverWingOutline className="absolute inset-0 h-full w-full text-m3-muted" />
  </div>
);
