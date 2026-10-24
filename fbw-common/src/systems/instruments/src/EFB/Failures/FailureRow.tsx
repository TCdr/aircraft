// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { ExclamationTriangle } from 'react-bootstrap-icons';
import { splitAtQuery } from './failuresView';

interface FailureRowProps {
  name: string;
  isActive: boolean;
  onToggle: () => void;
  /** The search text to underline in the name */
  searchQuery: string;
  className?: string;
}

/**
 * One failure: its name and a switch, the whole row is the target. A failed row is red, switch included: the cyan
 * switch of the kit would read as "on and healthy".
 */
export const FailureRow: FC<FailureRowProps> = ({ name, isActive, onToggle, searchQuery, className }) => {
  const parts = splitAtQuery(name, searchQuery);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isActive}
      onClick={onToggle}
      className={`flex min-h-[52px] flex-row items-center rounded-sm py-1.5 pl-4 pr-3.5 text-left transition duration-100 ${
        isActive ? 'bg-m3-error-container text-m3-on-error' : 'bg-m3-card text-m3-text hover:bg-m3-tile'
      } ${className ?? ''}`}
    >
      {isActive && <ExclamationTriangle size={16} className="mr-3 shrink-0" />}
      <span className="line-clamp-2 min-w-0 grow text-base font-bold leading-tight text-current">
        {parts ? (
          <>
            {parts[0]}
            <span className="text-base font-bold text-current underline">{parts[1]}</span>
            {parts[2]}
          </>
        ) : (
          name
        )}
      </span>
      <span
        className={`relative ml-3 box-border block h-6 w-12 shrink-0 rounded-sm ${
          isActive ? 'bg-m3-on-error' : 'border-2 border-m3-outline-strong'
        }`}
      >
        <span
          className={`absolute top-0.5 block rounded-sm ${
            isActive ? 'left-[26px] h-5 w-5 bg-m3-error-container' : 'left-0.5 h-4 w-4 bg-m3-muted'
          }`}
        />
      </span>
    </button>
  );
};
