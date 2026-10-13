import React, { FC } from 'react';
import { HydraulicPowerSource, PowerSupplyIndication, PowerSupplyType } from './PowerSupply';
import {
  GearDoorIndication,
  gearDoorIndication,
  GearTriangle,
  gearTriangle,
  LgciuGear,
  LgciuWord,
} from '../LgersIndications';

export enum GearPosition {
  Nose = 'NOSE',
  Left = 'LEFT',
  Right = 'RIGHT',
}

export enum GearType {
  Nose,
  WLG,
  BLG,
}

/** The LGCIU discrete words 1 and 3 of both LGCIS (L:A32NX_LGCIU_n_DISCRETE_WORD_1/3) */
export interface LgciuWords {
  word1Lgcis1: LgciuWord;
  word1Lgcis2: LgciuWord;
  word3Lgcis1: LgciuWord;
  word3Lgcis2: LgciuWord;
}

interface GearProps {
  x: number;
  y: number;
  position: GearPosition;
  type: GearType;
  lgciuWords: LgciuWords;
}

/** The gear of the LGCIU words: the model has a left, a right and a nose gear (the wing gears show the body one) */
function lgciuGear(position: GearPosition): LgciuGear {
  switch (position) {
    case GearPosition.Nose:
      return LgciuGear.Nose;
    case GearPosition.Left:
      return LgciuGear.Left;
    default:
      return LgciuGear.Right;
  }
}

export const Gear: FC<GearProps> = ({ x, y, position, type, lgciuWords }) => {
  const gear = lgciuGear(position);
  const hydraulicSource =
    type === GearType.WLG || type === GearType.Nose ? HydraulicPowerSource.Green : HydraulicPowerSource.Yellow;

  let uplockX: number;
  let uplockY: number;
  if (type === GearType.Nose) {
    uplockX = -20;
    uplockY = -36;
  } else if (type === GearType.BLG) {
    uplockX = position === GearPosition.Left ? -66 : 74;
    uplockY = -14;
  } else {
    uplockX = position === GearPosition.Left ? -40 : 48;
    uplockY = -20;
  }

  return (
    <g id={`gear-${position}-${type}`} transform={`translate(${x} ${y})`}>
      <PowerSupplyIndication
        x={23}
        y={type === GearType.Nose ? -32 : -36}
        type={PowerSupplyType.Conventional}
        powerSource={hydraulicSource}
      />
      {/* A380 FCOM DSC-32-20-40 (l.81088-81096): LGCIS 1 controls the left triangle, LGCIS 2 the right one */}
      <PositionIndicator system={1} triangle={gearTriangle(lgciuWords.word1Lgcis1, lgciuWords.word3Lgcis1, gear)} />
      <PositionIndicator system={2} triangle={gearTriangle(lgciuWords.word1Lgcis2, lgciuWords.word3Lgcis2, gear)} />
      <GearDoor
        type={type}
        position={position}
        indication={gearDoorIndication(
          lgciuWords.word1Lgcis1,
          lgciuWords.word1Lgcis2,
          lgciuWords.word3Lgcis1,
          lgciuWords.word3Lgcis2,
          gear,
        )}
      />

      <g visibility={'hidden'}>
        <UplockFlag x={uplockX} y={uplockY} type={type} />
      </g>
    </g>
  );
};

interface PositionIndicatiorProps {
  system: 1 | 2;
  triangle: GearTriangle;
}

const PositionIndicator: FC<PositionIndicatiorProps> = ({ system, triangle }) => {
  if (triangle === GearTriangle.Hidden) {
    return null;
  }
  if (triangle === GearTriangle.Invalid) {
    // The data of this LGCIS is lost: amber crosses in place of its triangle
    return (
      <text className="F24 Amber" x={system === 1 ? 2 : 40} y={22}>
        XX
      </text>
    );
  }

  const color = triangle === GearTriangle.Downlocked ? 'Green' : 'Red';

  return (
    <g className={`SW2 ${color}`}>
      {system === 1 && (
        <>
          <path d="m 0 0 h 29 v 26 z" />
          <path d="M 13 0 v 12 M 21 0 v 19" />
        </>
      )}
      {system === 2 && (
        <>
          <path d="m 67 0 h -29 v 26 z" />
          <path d="M 46 0 v 19 M 54 0 v 12" />
        </>
      )}
    </g>
  );
};

interface GearDoorProps {
  position: GearPosition;
  type: GearType;
  indication: GearDoorIndication;
}

/**
 * Door angle of the picture, degrees. A380 FCOM DSC-32-20-40 (l.81098-81103) has three door indications: closed and
 * uplocked, in transit, open. Design choice (the FCOM figures are not in the text): in transit at 55 degrees (the FBW
 * picture), open at 90 degrees.
 */
function doorAngle(indication: GearDoorIndication): number {
  switch (indication) {
    case GearDoorIndication.InTransit:
      return 55;
    case GearDoorIndication.Open:
      return 90;
    default:
      return 0;
  }
}

const GearDoor: FC<GearDoorProps> = ({ position, type, indication }) => {
  const yPos = type === GearType.BLG ? -8 : -6;

  if (indication === GearDoorIndication.Invalid) {
    // The data of both LGCIS is lost: amber crosses in place of the doors, the hinges stay
    return (
      <g className="SW2 White">
        {(type === GearType.BLG || type === GearType.Nose) && (
          <>
            <text className="F24 Amber" x={-4} y={yPos + 9}>
              XX
            </text>
            <text className="F24 Amber" x={45} y={yPos + 9}>
              XX
            </text>
          </>
        )}
        {type === GearType.WLG && (
          <text className="F24 Amber" x={position === GearPosition.Left ? 24 : 18} y={-1}>
            XX
          </text>
        )}
      </g>
    );
  }

  const color = indication === GearDoorIndication.Closed ? 'Green' : 'Amber';
  const angle = doorAngle(indication);

  return (
    <g className={`SW2 ${color}`}>
      {(type === GearType.BLG || type === GearType.Nose) && (
        <>
          <path d={`m -14 ${yPos} h 46`} transform={`rotate(${angle} -15 -8)`} />
          <path d={`m 81 ${yPos} h -46`} transform={`rotate(${-angle} 82 -8)`} />
          <circle r="3" cx={-15} cy={yPos} />
          <circle r="3" cx={82} cy={yPos} />
        </>
      )}
      {type === GearType.WLG && (
        <>
          <path
            d={`m ${position === GearPosition.Left ? 83 : -16} -7 l ${position === GearPosition.Left ? '-' : ''}94 -5`}
            transform={`rotate(${position === GearPosition.Left ? -angle : angle} ${position === GearPosition.Left ? 84 : -17} -7)`}
          />
          <circle r="3" cx={position === GearPosition.Left ? 84 : -17} cy={-7} />
        </>
      )}
    </g>
  );
};

interface UplockFlagProps {
  x: number;
  y: number;
  type: GearType;
}

const UplockFlag: FC<UplockFlagProps> = ({ x, y, type }) => (
  <>
    {(type === GearType.BLG || type === GearType.WLG) && (
      <g transform={`translate(${x} ${y})`}>
        <text className="F24 Amber" x={16} y={-24}>
          UP
        </text>
        <text className="F24 Amber" x={0} y={0}>
          LOCK
        </text>
      </g>
    )}
    {type === GearType.Nose && (
      <text className="F24 Amber" x={x} y={y}>
        UP LOCK
      </text>
    )}
  </>
);
