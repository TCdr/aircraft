import React, { FC } from 'react';
import { degradedAccuracyStrikePath, ROTOR_SPEED_STRUCK_DIGITS } from '../../../../MsfsAvionicsCommon/DegradedAccuracy';

/** The size of an F25 digit on the SD */
const DECIMAL_DIGIT_WIDTH = 14;
const DECIMAL_DIGIT_HEIGHT = 18;

interface DecimalValueProps {
  x: number;
  y: number;
  value: number;
  active: boolean;
  shift?: number;
  /** The value pulses green */
  pulse?: boolean;
  /** The colour class of the value (default Green) */
  className?: string;
  /** The accuracy of the value is degraded (ENG CTL SYS FAULT): its decimal digit is struck out */
  accuracyDegraded?: boolean;
}

const DecimalValue: FC<DecimalValueProps> = ({
  x,
  y,
  value,
  active,
  shift = 0,
  pulse = false,
  className = 'Green',
  accuracyDegraded = false,
}) => {
  const colour = pulse ? `${className} FillPulse` : className;
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
      {active && accuracyDegraded && (
        <path
          className="Amber SW2 NoFill"
          d={degradedAccuracyStrikePath(
            shiftx + 22 + DECIMAL_DIGIT_WIDTH,
            y,
            DECIMAL_DIGIT_WIDTH,
            DECIMAL_DIGIT_HEIGHT,
            ROTOR_SPEED_STRUCK_DIGITS,
          )}
        />
      )}
    </>
  );
};

export default DecimalValue;
