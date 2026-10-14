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
   * A380 FCOM DSC-32-20-50/60 (l.81185-81187, l.81313-81322): "operates normally" / "is failed". Green when normal;
   * design choice: amber when failed, the ECAM colour of a failure (the FCOM figures are not in the text).
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
