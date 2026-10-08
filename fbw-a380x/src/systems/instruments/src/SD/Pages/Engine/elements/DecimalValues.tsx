import React, { FC } from 'react';

interface DecimalValueProps {
  x: number;
  y: number;
  value: number;
  active: boolean;
  shift?: number;
  /** The value pulses green */
  pulse?: boolean;
}

const DecimalValue: FC<DecimalValueProps> = ({ x, y, value, active, shift = 0, pulse = false }) => {
  const colour = pulse ? 'Green FillPulse' : 'Green';
  value = value < 0 ? 0 : value;
  const shiftx = x + shift;

  return (
    <>
      {!active && (
        <text x={x} y={y - 4} className="Amber F29 MiddleAlign">
          XX
        </text>
      )}
      {active && (
        <text>
          <tspan x={shiftx + 8} y={y} className={`${colour} EndAlign F29`}>
            {value.toFixed(1).toString().split('.')[0]}
          </tspan>
          <tspan x={shiftx + 14} y={y - 6} className={`${colour} MiddleAlign F25`}>
            .
          </tspan>
          <tspan x={shiftx + 22} y={y} className={`${colour} F25`}>
            {value.toFixed(1).toString().split('.')[1]}
          </tspan>
        </text>
      )}
    </>
  );
};

export default DecimalValue;
