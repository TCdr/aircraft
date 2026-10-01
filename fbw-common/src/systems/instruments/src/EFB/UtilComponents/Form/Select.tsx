// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';

interface SelectItemProps {
  disabled?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}

/** The look of one segment of the group: the selected one is tonal, as in the Material kit (M3Segmented) */
const activeButtonRow = ({ disabled, selected }: Partial<SelectItemProps>) => {
  if (disabled) {
    return 'flex items-center justify-center px-5 h-10 text-base font-semibold text-m3-muted opacity-40 cursor-not-allowed';
  }
  if (selected) {
    return 'flex items-center justify-center px-5 h-10 text-base font-bold bg-m3-primary-container text-m3-on-primary-container';
  }
  return 'flex items-center justify-center px-5 h-10 text-base font-semibold text-m3-text hover:bg-m3-tile transition duration-100';
};

export const SelectItem: React.FC<SelectItemProps> = ({ children, className, disabled, onSelect, selected }) => (
  <span onClick={onSelect} className={`cursor-pointer ${activeButtonRow({ disabled, selected })} ${className}`}>
    {children}
  </span>
);

export const SelectGroup: React.FC<{ className?: string }> = ({ children, className }) => (
  <div
    className={`flex flex-row justify-between divide-x divide-m3-outline overflow-hidden rounded-full border border-m3-outline ${className}`}
  >
    {children}
  </div>
);

export const VerticalSelectGroup: React.FC<{ className?: string }> = ({ children, className }) => (
  <div
    className={`flex flex-col divide-y divide-m3-outline overflow-hidden rounded-2xl border border-m3-outline ${className}`}
  >
    {children}
  </div>
);
