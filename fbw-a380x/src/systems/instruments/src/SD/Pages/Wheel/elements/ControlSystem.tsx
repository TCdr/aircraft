import React, { FC } from 'react';

export enum ControlSystemType {
  Steering,
  Braking,
}

interface ControlSystemProps {
  x: number;
  y: number;
  number: 1 | 2 | 'E';
  type: ControlSystemType;
  /**
   * Green when normal. Design choice: amber when failed, the ECAM colour of a failure (the source gives no colour).
   */
  failed: boolean;
}

export const ControlSystem: FC<ControlSystemProps> = ({ x, y, number, type, failed }) => (
  <g id={`control-indications-${type}-${number}`} transform={`translate(${x} ${y})`}>
    <path className="SW2 Grey NoFill" d="m 0 0 h 18 v -21" />
    <text className={`F22 ${failed ? 'Amber' : 'Green'}`} x={3} y={-3}>
      {number}
    </text>
  </g>
);
