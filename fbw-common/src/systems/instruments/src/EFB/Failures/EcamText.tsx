// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { EcamColour, EcamTextSegment } from '@flybywiresim/fbw-sdk-react';

const ECAM_COLOUR_CLASSES: Record<EcamColour, string> = {
  white: 'text-m3-text',
  green: 'text-utility-green',
  cyan: 'text-cyan',
  amber: 'text-utility-amber',
  red: 'text-utility-red',
  magenta: 'text-utility-pink',
  yellow: 'text-yellow-500',
};

interface EcamTextProps {
  segments: EcamTextSegment[];
  /** Reference text of an alert that is not on the EWD: one muted colour instead of the ECAM colours */
  greyed?: boolean;
}

/** ECAM text in its EWD colours */
export const EcamText: FC<EcamTextProps> = ({ segments, greyed }) => (
  <>
    {segments.map((segment, index) => (
      <span
        // segments have no identity of their own and never reorder
        // eslint-disable-next-line react/no-array-index-key
        key={index}
        className={`font-mono text-base ${greyed ? 'text-m3-muted' : ECAM_COLOUR_CLASSES[segment.colour]} ${
          segment.underline ? 'underline' : ''
        }`}
      >
        {segment.text}
      </span>
    ))}
  </>
);
