// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import classNames from 'classnames';

type CardProps = {
  title?: string;
  childrenContainerClassName?: string;
  className?: string;
};

export const Card: React.FC<CardProps> = ({ title, childrenContainerClassName = '', children, className }) => (
  <div className={className}>
    {!!title && <h1 className="mb-4 text-2xl font-medium text-m3-text">{title}</h1>}

    <div className={classNames(['rounded-2xl bg-m3-card p-4', childrenContainerClassName])}>{children}</div>
  </div>
);

export default Card;
