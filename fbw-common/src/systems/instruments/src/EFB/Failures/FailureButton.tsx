// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, MouseEventHandler } from 'react';
import { ExclamationTriangle } from 'react-bootstrap-icons';
import { t } from '../Localization/translation';

export interface FailureButtonProps {
  name: string;
  isActive: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  className: string;
  highlightedTerm?: string;
}

export const FailureButton: FC<FailureButtonProps> = ({
  name,
  isActive,
  onClick,
  className,
  highlightedTerm,
}: FailureButtonProps) => {
  const look = isActive ? 'bg-m3-error-container text-m3-on-error' : 'bg-m3-card text-m3-text hover:bg-m3-tile';

  return (
    <button
      onClick={onClick}
      type="button"
      className={`flex flex-col items-start justify-between rounded-2xl px-4 py-3 text-left transition duration-100 ${look} ${className}`}
    >
      {highlightedTerm ? (
        <span className="text-base font-bold leading-tight text-current">
          {name.substring(0, name.indexOf(highlightedTerm))}
          <span className="text-base font-bold text-current underline">{highlightedTerm}</span>
          {name.substring(name.indexOf(highlightedTerm) + highlightedTerm.length)}
        </span>
      ) : (
        <span className="text-base font-bold leading-tight text-current">{name}</span>
      )}
      <span
        className={`flex flex-row items-center text-xs font-semibold ${isActive ? 'text-m3-on-error' : 'text-m3-muted'}`}
      >
        {isActive && <ExclamationTriangle size={14} className="mr-1.5" />}
        {isActive ? t('Failures.FailedTapToRestore') : t('Failures.Working')}
      </span>
    </button>
  );
};
