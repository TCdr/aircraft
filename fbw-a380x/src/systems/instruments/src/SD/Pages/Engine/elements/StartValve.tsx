import { useSimVar } from '@instruments/common/simVars';
import { Position, EngineNumber } from '@instruments/common/types';
import Valve from '@instruments/common/Valve';
import React from 'react';
import { startValveColour } from './StartParameters';

interface StartValveProps {
  /** igniter A is energized (L:A32NX_FADEC_IGNITER_A_ACTIVE_ENGn) */
  igniterA: boolean;
  /** igniter B is energized (L:A32NX_FADEC_IGNITER_B_ACTIVE_ENGn) */
  igniterB: boolean;
  /** The StartValveFault the FADEC detects (L:A32NX_ENGINE_n_START_VALVE_FAULT) */
  startValveFault: number;
}

const StartValve: React.FC<Position & EngineNumber & StartValveProps> = ({
  x,
  y,
  engine,
  igniterA,
  igniterB,
  startValveFault,
}) => {
  const [startValveOpen] = useSimVar(`L:A32NX_PNEU_ENG_${engine}_STARTER_VALVE_OPEN`, 'boolean', 500);
  const [starterInletPressure] = useSimVar(`L:A32NX_PNEU_ENG_${engine}_REGULATED_TRANSDUCER_PRESSURE`, 'psi', 100);

  return (
    <g id={`SD-start-valve-${engine}`}>
      {/* Amber when abnormally open or closed */}
      <Valve
        x={x}
        y={y - 14}
        radius={24}
        css={`
          ${startValveColour(startValveFault)} SW2
        `}
        position={startValveOpen ? 'V' : 'H'}
        sdacDatum
      />
      {/* Ignition: A, B or A B, the igniters that are energized */}
      <text x={x - 10} y={y - 60} className={`Green F25 MiddleAlign ${!igniterA && 'Hide'}`}>
        A
      </text>
      <text x={x + 10} y={y - 60} className={`Green F25 MiddleAlign ${!igniterB && 'Hide'}`}>
        B
      </text>
      <text
        x={x}
        y={y + 38}
        className={`F29 MiddleAlign ${starterInletPressure < 15 || starterInletPressure > 60 ? 'Amber' : 'Green'}`}
      >
        {Math.round(starterInletPressure)}
      </text>
      <path className="SW2 Green" d={`M${x},${y + 11} l 0,10`} />
      {startValveOpen && <path className="SW2 Green" d={`M${x},${y - 37} l 0,-10`} />}
      {engine === 2 && (
        <>
          <text x={x + 180} y={y - 50} className="F25 EndAlign White">
            IGN
          </text>
          <text x={x + 180} y={y + 44} className="F25 EndAlign Cyan">
            PSI
          </text>
        </>
      )}
    </g>
  );
};

export default StartValve;
