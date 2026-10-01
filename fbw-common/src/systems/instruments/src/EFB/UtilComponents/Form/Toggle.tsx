// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';

interface ToggleProps {
  value: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
}

/** An on/off switch, in the look of the Material kit (M3Switch) */
export const Toggle = ({ value, onToggle, disabled }: ToggleProps) => (
  <div
    role="switch"
    aria-checked={value}
    className={`relative box-border h-6 w-12 shrink-0 cursor-pointer rounded-full transition duration-150 ${
      value ? 'bg-m3-primary' : 'border-2 border-m3-outline-strong'
    } ${disabled ? 'pointer-events-none opacity-40' : ''}`}
    onClick={() => !disabled && onToggle(!value)}
  >
    <div
      className={`absolute rounded-full transition duration-150 ${
        value ? 'left-[26px] top-0.5 h-5 w-5 bg-white' : 'left-0.5 top-0.5 h-4 w-4 bg-m3-muted'
      }`}
    />
  </div>
);
