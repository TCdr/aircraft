// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';

/** The DCDU without data from the ATSU, see DcduFailures */
export const InvalidData: React.FC = () => (
  <>
    <svg className="startup-text">
      <text x="1968" y="1520">
        INVALID DATA
      </text>
    </svg>
  </>
);
