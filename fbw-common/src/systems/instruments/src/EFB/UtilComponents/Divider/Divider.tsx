// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import classNames from 'classnames';

const Divider = ({ className, ...props }) => (
  <div className={classNames(['bg-m3-outline h-0.5', className])} {...props} />
);

export default Divider;
