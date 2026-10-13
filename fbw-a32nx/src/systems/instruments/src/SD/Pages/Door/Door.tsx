// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useState } from 'react';
import { useArinc429Var, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { cabinVsPulses } from '../Press/PressIndications';
import { crewOxygenIndication, doorPageCabinVsClass, isCabinVsShown, isDoorNotLocked } from './DoorOxyIndications';

import './Door.scss';

interface DoorIndicationProps {
  /** The door is not locked: amber symbol, dashes and legend */
  notLocked: boolean;
  /** The door symbol */
  symbol: string;
  /** The dashes from the door symbol to the legend */
  dashes: string;
  /** The legend: CABIN, EMER EXIT or CARGO */
  legend: string;
  legendX: number;
  legendY: number;
  /** A second door symbol driven by the same door (the two overwing emergency exits of a side) */
  secondSymbol?: string;
}

/**
 * A door of the DOOR/OXY page: its symbol is green when closed and locked, amber when not locked, with amber dashes and
 * legend (A320 FCOM DSC-52-20, a320_fcom.txt l.61436-61440).
 */
const DoorIndication = ({ notLocked, symbol, dashes, legend, legendX, legendY, secondSymbol }: DoorIndicationProps) => (
  <g>
    <path className={notLocked ? 'WarningShape' : 'DoorShape'} d={symbol} />
    {secondSymbol && <path className={notLocked ? 'WarningShape' : 'DoorShape'} d={secondSymbol} />}
    {notLocked && <path className="WarningShape" strokeDasharray="7,4" d={dashes} />}
    {notLocked && (
      <text className="Warning" x={legendX} y={legendY} textAnchor="middle" alignmentBaseline="central">
        {legend}
      </text>
    )}
  </g>
);

/**
 * The cabin vertical speed, in flight phases 5, 6 and 7 (A320 FCOM DSC-21-20-40 ECAM DOOR/OXY page,
 * a320_fcom.txt l.9180-9186), from the active CPC (the CAB PRESS page source) or the manual partition.
 */
const CabinVerticalSpeed = () => {
  const [fwcFlightPhase] = useSimVar('L:A32NX_FWC_FLIGHT_PHASE', 'enum', 1000);
  const cpc1DiscreteWord = useArinc429Var('L:A32NX_PRESS_CPC_1_DISCRETE_WORD');
  const activeCpcNumber = cpc1DiscreteWord.bitValueOr(11, false) ? 1 : 2;
  const arincCabinVs = useArinc429Var(`L:A32NX_PRESS_CPC_${activeCpcNumber}_CABIN_VS`, 500);
  const [manCabinVs] = useSimVar('L:A32NX_PRESS_MAN_CABIN_VS', 'feet per minute', 500);
  const cabinVs = arincCabinVs.isNormalOperation() ? arincCabinVs.value : manCabinVs;
  const displayedCabinVs = Math.round(cabinVs / 50) * 50;

  // Pulses above 1750 ft/min until back below 1650 ft/min (hysteresis on the displayed value)
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    setPulsing((wasPulsing) => cabinVsPulses(displayedCabinVs, wasPulsing));
  }, [displayedCabinVs]);

  if (!isCabinVsShown(fwcFlightPhase)) {
    return null;
  }

  return (
    <g id="cabin-vs">
      <text className="Label" x="20" y="18" alignmentBaseline="central">
        V/S
      </text>
      <text
        id="cabin-vs-value"
        className={doorPageCabinVsClass(displayedCabinVs, pulsing)}
        x="110"
        y="42"
        textAnchor="end"
        alignmentBaseline="central"
      >
        {displayedCabinVs}
      </text>
      <text className="Unit" x="116" y="43" alignmentBaseline="central">
        FT/MIN
      </text>
    </g>
  );
};

export const DoorPage = () => {
  // The doors of the sim, as the DOOR cautions read them (systems-host FWC/Logic/DoorAlerts.ts): MSFS interactive points
  // 0 L FWD, 1 R FWD, 2 L AFT, 3 R AFT cabin doors, 6 L and 7 R overwing emergency exits (one per side in the sim, it
  // drives both exits of that side), and the two cargo door locks of the Rust cargo doors.
  const [leftForwardDoor] = useSimVar('INTERACTIVE POINT OPEN:0', 'percent', 1000);
  const [rightForwardDoor] = useSimVar('INTERACTIVE POINT OPEN:1', 'percent', 1000);
  const [leftAftDoor] = useSimVar('INTERACTIVE POINT OPEN:2', 'percent', 1000);
  const [rightAftDoor] = useSimVar('INTERACTIVE POINT OPEN:3', 'percent', 1000);
  const [leftEmergencyExit] = useSimVar('INTERACTIVE POINT OPEN:6', 'percent', 1000);
  const [rightEmergencyExit] = useSimVar('INTERACTIVE POINT OPEN:7', 'percent', 1000);
  const [forwardCargoLocked] = useSimVar('L:A32NX_FWD_DOOR_CARGO_LOCKED', 'bool', 1000);
  const [aftCargoLocked] = useSimVar('L:A32NX_AFT_DOOR_CARGO_LOCKED', 'bool', 1000);
  const [oxygen] = useSimVar('L:PUSH_OVHD_OXYGEN_CREW', 'bool', 1000);
  const [slides] = useSimVar('L:A32NX_SLIDES_ARMED', 'bool', 1000);
  const [crewOxygenPressure] = useSimVar('L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE', 'psi', 1000);
  const [leftGearCompressed] = useSimVar('L:A32NX_LGCIU_1_LEFT_GEAR_COMPRESSED', 'bool', 1000);
  const [rightGearCompressed] = useSimVar('L:A32NX_LGCIU_1_RIGHT_GEAR_COMPRESSED', 'bool', 1000);
  const onGround = leftGearCompressed > 0 || rightGearCompressed > 0;

  const crewOxygenPressureRounded = Math.round(crewOxygenPressure / 50) * 50;
  const crewOxygen = crewOxygenIndication(crewOxygenPressureRounded, onGround);

  return (
    <>
      {/* This is already in an svg so we should remove the containing one - TODO remove style once we are not in the Asobo ECAM */}
      <svg id="door-page" viewBox="0 0 600 600" style={{ marginTop: '-60px' }} xmlns="http://www.w3.org/2000/svg">
        <g id="fuselage">
          <path className="MainShape" d="M 267 473 l -5 -13 l 0 -340 C 260,102 276,52 300,40" />
          <path className="MainShape" d="M 333 473 l 5 -13 l 0 -340 C 340,102 324,52 300,40" />
          <line className="MainShape" x1="262" y1="275" x2="160" y2="308" />
          <line className="MainShape" x1="338" y1="275" x2="440" y2="308" />
        </g>

        <g id="hatches">
          <path className="DoorShape" d="M292 73 l0 -9 l16 0 l0 9Z" />
          <path className="DoorShape" d="M283 102 l0 -15 l9 0 l0 15Z" />
          <path className="DoorShape" d="M317 102 l0 -15 l-9 0 l0 15Z" />

          <path className="DoorShape" d="M300 181 l0 10 l16 0 l0 -10Z" />
          {/* Bulk cargo door: not in the sim */}
          <path className="DoorShape" d="M328 414 l0 -22 l-8 0 l0 22Z" />
        </g>

        <g id="doors">
          <DoorIndication
            notLocked={isDoorNotLocked(leftForwardDoor)}
            symbol="M264 145 l0 -20 l12 0 l0 20Z"
            dashes="M138, 136 l121 0"
            legend="CABIN"
            legendX={103}
            legendY={136}
          />
          <DoorIndication
            notLocked={isDoorNotLocked(rightForwardDoor)}
            symbol="M336 145 l0 -20 l-12 0 l0 20Z"
            dashes="M346, 136 l77 0"
            legend="CABIN"
            legendX={455}
            legendY={136}
          />
          <DoorIndication
            notLocked={!forwardCargoLocked}
            symbol="M336 221 l0 -20 l-18 0 l0 20Z"
            dashes="M346, 210 l77 0"
            legend="CARGO"
            legendX={455}
            legendY={211}
          />
          <DoorIndication
            notLocked={isDoorNotLocked(leftEmergencyExit)}
            symbol="M264 310 l0 -20 l12 0 l0 20Z"
            secondSymbol="M264 344 l0 -20 l12 0 l0 20Z"
            dashes="M160, 317 l99 0"
            legend="EMER EXIT"
            legendX={103}
            legendY={317}
          />
          <DoorIndication
            notLocked={isDoorNotLocked(rightEmergencyExit)}
            symbol="M336 310 l0 -20 l-12 0 l0 20Z"
            secondSymbol="M336 344 l0 -20 l-12 0 l0 20Z"
            dashes="M346, 317 l77 0"
            legend="EMER EXIT"
            legendX={483}
            legendY={317}
          />
          <DoorIndication
            notLocked={!aftCargoLocked}
            symbol="M336 384 l0 -20 l-18 0 l0 20Z"
            dashes="M346, 374 l77 0"
            legend="CARGO"
            legendX={455}
            legendY={375}
          />
          <DoorIndication
            notLocked={isDoorNotLocked(leftAftDoor)}
            symbol="M264 445 l0 -20 l12 0 l0 20Z"
            dashes="M138, 438 l121 0"
            legend="CABIN"
            legendX={103}
            legendY={438}
          />
          <DoorIndication
            notLocked={isDoorNotLocked(rightAftDoor)}
            symbol="M336 445 l0 -20 l-12 0 l0 20Z"
            dashes="M346, 438 l77 0"
            legend="CABIN"
            legendX={455}
            legendY={438}
          />
        </g>

        {/* Texts */}
        <g id="texts">
          <text
            id="PageTitle"
            className="Title"
            x="300"
            y="16"
            textAnchor="middle"
            alignmentBaseline="central"
            textDecoration="underline"
          >
            DOOR/OXY
          </text>
          <text
            id="slide1"
            className={slides ? 'Slide' : 'Hide'}
            x="232"
            y="136"
            textAnchor="middle"
            alignmentBaseline="central"
          >
            SLIDE
          </text>
          <text
            id="slide2"
            className={slides ? 'Slide' : 'Hide'}
            x="368"
            y="136"
            textAnchor="middle"
            alignmentBaseline="central"
          >
            SLIDE
          </text>
          <text
            id="slide3"
            className={slides ? 'Slide' : 'Hide'}
            x="232"
            y="320"
            textAnchor="middle"
            alignmentBaseline="central"
          >
            SLIDE
          </text>
          <text
            id="slide4"
            className={slides ? 'Slide' : 'Hide'}
            x="368"
            y="320"
            textAnchor="middle"
            alignmentBaseline="central"
          >
            SLIDE
          </text>
          <text
            id="slide5"
            className={slides ? 'Slide' : 'Hide'}
            x="232"
            y="438"
            textAnchor="middle"
            alignmentBaseline="central"
          >
            SLIDE
          </text>
          <text
            id="slide6"
            className={slides ? 'Slide' : 'Hide'}
            x="368"
            y="438"
            textAnchor="middle"
            alignmentBaseline="central"
          >
            SLIDE
          </text>

          <CabinVerticalSpeed />

          <text
            id="oxy"
            className={oxygen ? 'OxyWarn' : 'Oxygen'}
            x="490"
            y="18"
            textAnchor="middle"
            alignmentBaseline="central"
          >
            CKPT OXY
          </text>

          <text
            id="psi_val"
            className={crewOxygen.valueClass}
            x="432"
            y="42"
            textAnchor="middle"
            alignmentBaseline="central"
          >
            {crewOxygenPressureRounded}
          </text>
          {/* On ground below 1000 PSI: amber half frame (the lower half of a box) around the value */}
          {crewOxygen.halfFrame && <path id="psi_half_frame" className="HalfFrame" d="M 402 42 v 12 h 60 v -12" />}
          <text id="psi_unit" className="Unit" x="486" y="43" textAnchor="middle" alignmentBaseline="central">
            PSI
          </text>
        </g>
      </svg>
    </>
  );
};
