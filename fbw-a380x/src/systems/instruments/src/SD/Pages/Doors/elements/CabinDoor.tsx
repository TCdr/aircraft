import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import { Position, CabinDoorProps } from '@instruments/common/types';
import React from 'react';
import { DSMS_VARS, isDoorBitSet } from '@shared/DoorsAndSlides';

const CabinDoor: React.FC<Position & CabinDoorProps> = ({
  x,
  y,
  doorNumber,
  interactivePoint,
  side,
  mainOrUpper,
  engineRunning,
  slideArmed,
}) => {
  const [openPercentage] = useSimVar(`INTERACTIVE POINT OPEN:${interactivePoint}`, 'percent', 1000);
  const doorOpen = openPercentage > 20;
  const armed = !doorOpen && slideArmed;
  const [positionInvalidDoors] = useSimVar(DSMS_VARS.positionInvalid, 'number', 1000);
  const [slideFaultDoors] = useSimVar(DSMS_VARS.slideFault, 'number', 1000);
  // The DSMS no longer knows the door position: failed LDC, or no DSMS channel
  const validSDAC = !isDoorBitSet(positionInvalidDoors, interactivePoint);
  const slideFailed = isDoorBitSet(slideFaultDoors, interactivePoint);

  let slide = '';
  if (!validSDAC) {
    slide = 'XX';
  } else if (armed || slideFailed) {
    slide = 'S';
  }

  let cabinDoorMessage = '';
  let xpos = 0;
  if (!validSDAC || (engineRunning && doorOpen)) {
    cabinDoorMessage =
      side === 'L' ? `${mainOrUpper} ${doorNumber}${side} ----` : `---- ${mainOrUpper} ${doorNumber}${side}`;
  }
  if (side === 'L') {
    xpos = -180;
    if (mainOrUpper === 'UPPER') {
      xpos = -193;
    }
  } else {
    xpos = 30;
    if (mainOrUpper === 'UPPER') {
      xpos = 33;
    }
  }
  let doorNumberCss = 'Green';
  let doorRectCss = 'Green SW3 BackgroundFill';
  let slideCss = slideFailed ? 'Amber' : 'White';
  if (side === 'L') {
    slideCss = `${slideCss} EndAlign`;
  }
  if (!validSDAC) {
    doorNumberCss = 'Amber';
    doorRectCss = 'Hide';
    slideCss = 'AmberFill';
    if (side === 'L') {
      slideCss = 'AmberFill EndAlign';
    }
  } else if (doorOpen) {
    doorNumberCss = 'BackgroundFill';
    doorRectCss = 'Amber SW3 AmberFill';
  }

  return (
    <g id={`${side}${doorNumber}`} transform={`translate(${x} ${y})`}>
      <rect x={0} y={0} width="18" height="26" rx="5" className={doorRectCss} />
      <text x={3} y={21} className={`${doorNumberCss} F22`}>
        {!validSDAC ? 'X' : doorNumber}
      </text>
      <text x={xpos} y={12} className={`${!validSDAC ? 'White' : 'AmberFill'} F22`}>
        {cabinDoorMessage}
      </text>
      <text x={side === 'L' ? -6 : 23} y={38} className={`${slideCss} F30`}>
        {slide}
      </text>
    </g>
  );
};

export default CabinDoor;
