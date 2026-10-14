import React, { useRef, useState } from 'react';
import { useInterval, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { useArinc429Var } from '@instruments/common/arinc429';
import { MoreLabel, PageTitle } from '../Generic/PageTitle';
import { Gear, GearPosition, GearType } from './elements/Gear';

import '../../../index.scss';
import { WheelBogey, WheelBogeyPosition, WheelBogeyType } from './elements/WheelBogey';
import { BrakingSupply } from './elements/BrakingSupply';
import { ControlSystem, ControlSystemType } from './elements/ControlSystem';
import { Accumulator } from './elements/Accumulator';
import { allGearsDownlocked, GravityExtensionIndication, LgCtlIndication } from './LgersIndications';
import {
  brakeControlIndication,
  hottestBrakeArcs,
  readBrakeTemperatures,
  readTirePressures,
  readWheelControlInputs,
  steeringControlIndication,
  WheelControlInputs,
  wingAccuIndication,
} from './WheelIndications';

/** Update period of the timed LGERS indications, ms */
const LGERS_UPDATE_MS = 500;
/** Update period of the brake temperatures and of the control lines, ms (the brake temperatures used 300 ms) */
const BRAKES_UPDATE_MS = 300;

const NO_CONTROL_FAULT: WheelControlInputs = {
  normBrkFault: false,
  altnBrkFault: false,
  emerBrkFault: false,
  autoBrkFault: false,
  scs1Fault: false,
  scs2Fault: false,
};

const CONTROL_INPUT_KEYS = Object.keys(NO_CONTROL_FAULT) as (keyof WheelControlInputs)[];

/** Whether two arrays hold the same values (to set the React state only on a change) */
function sameValues<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

const readCelsius = (name: string): number => SimVar.GetSimVarValue(name, 'celsius');
const readNumber = (name: string): number => SimVar.GetSimVarValue(name, 'number');

export const WheelPage = () => {
  // A380 FCOM DSC-32-20-30 (a380_fcom.txt l.81015-81024): the MORE key on the ECP shows the WHEEL MORE page. The FWS
  // owns the MORE state (EcamSdMore, FwsSystemDisplayLogic).
  const [moreShownVar] = useSimVar('L:A32NX_ECAM_SD_MORE_SHOWN', 'number', 200);
  const moreActive = moreShownVar > 0;

  // Brake temperatures and the hottest brake arcs (FCOM DSC-32-20-70, WheelIndications.ts)
  const [brakeTemperatures, setBrakeTemperatures] = useState<number[]>(() => readBrakeTemperatures(readCelsius));
  // BRK CTL / STEER CTL lines and AUTO BRAKE (FCOM DSC-32-20-50/60, WheelIndications.ts)
  const [controlInputs, setControlInputs] = useState<WheelControlInputs>(NO_CONTROL_FAULT);
  // TPIS tire pressures (FCOM DSC-32-20-70 TIRE PRESSURE, systems-host Misc/Tpis.ts) and the FWS flight phase of the
  // WHEEL TIRE PRESS LO thresholds
  const [tirePressures, setTirePressures] = useState<number[]>(() => readTirePressures(readNumber));
  const [flightPhase] = useSimVar('L:A32NX_FWC_FLIGHT_PHASE', 'number', 1000);
  useInterval(() => {
    const temperatures = readBrakeTemperatures(readCelsius);
    setBrakeTemperatures((previous) => (sameValues(previous, temperatures) ? previous : temperatures));
    const pressures = readTirePressures(readNumber);
    setTirePressures((previous) => (sameValues(previous, pressures) ? previous : pressures));
    const inputs = readWheelControlInputs(readNumber);
    setControlInputs((previous) =>
      CONTROL_INPUT_KEYS.every((key) => previous[key] === inputs[key]) ? previous : inputs,
    );
  }, BRAKES_UPDATE_MS);
  const arcs = hottestBrakeArcs(brakeTemperatures);
  const brakeControl = brakeControlIndication(controlInputs, moreActive);
  const steeringControl = steeringControlIndication(controlInputs, moreActive);

  // WING ACCU gauge (FCOM DSC-32-20-50, WheelIndications.ts): the pressure of the brake accumulator of the model
  const [accuPressurePsi] = useSimVar('L:A32NX_HYD_BRAKE_ALTN_ACC_PRESS', 'number', BRAKES_UPDATE_MS);

  // LGERS indications (FCOM DSC-32-20-40, LgersIndications.ts)
  const lgciu1Word1 = useArinc429Var('L:A32NX_LGCIU_1_DISCRETE_WORD_1', LGERS_UPDATE_MS);
  const lgciu2Word1 = useArinc429Var('L:A32NX_LGCIU_2_DISCRETE_WORD_1', LGERS_UPDATE_MS);
  const lgciu1Word3 = useArinc429Var('L:A32NX_LGCIU_1_DISCRETE_WORD_3', LGERS_UPDATE_MS);
  const lgciu2Word3 = useArinc429Var('L:A32NX_LGCIU_2_DISCRETE_WORD_3', LGERS_UPDATE_MS);
  const lgciuWords = {
    word1Lgcis1: lgciu1Word1,
    word1Lgcis2: lgciu2Word1,
    word3Lgcis1: lgciu1Word3,
    word3Lgcis2: lgciu2Word3,
  };
  const [gravitySwitchPosition] = useSimVar('L:A32NX_LG_GRVTY_SWITCH_POS', 'number', LGERS_UPDATE_MS);
  const lgCtlIndication = useRef(new LgCtlIndication());
  const gravityExtensionIndication = useRef(new GravityExtensionIndication());
  const [lgCtlVisible, setLgCtlVisible] = useState(false);
  const [gravityExtensionVisible, setGravityExtensionVisible] = useState(false);
  useInterval(() => {
    const deltaS = LGERS_UPDATE_MS / 1000;
    setLgCtlVisible(lgCtlIndication.current.update(deltaS, lgciu1Word1, lgciu2Word1));
    setGravityExtensionVisible(
      gravityExtensionIndication.current.update(
        deltaS,
        gravitySwitchPosition === 2,
        allGearsDownlocked(lgciu1Word1, lgciu2Word1),
      ),
    );
  }, LGERS_UPDATE_MS);

  return (
    <>
      <PageTitle x={6} y={29}>
        WHEEL
      </PageTitle>

      <MoreLabel x={157} y={28} moreActive={moreActive} />

      <g id="brk-control" visibility={brakeControl.lineVisible ? 'visible' : 'hidden'}>
        <text className="F22 White LS1" x={9} y={110}>
          BRK CTL
        </text>
        <text className="F28 White" x={128} y={112}>
          :
        </text>
        <ControlSystem x={145} y={114} type={ControlSystemType.Braking} number={1} failed={brakeControl.bcs1Failed} />
        <ControlSystem x={170} y={114} type={ControlSystemType.Braking} number={2} failed={brakeControl.bcs2Failed} />
        <ControlSystem x={198} y={114} type={ControlSystemType.Braking} number="E" failed={brakeControl.ebcuFailed} />
      </g>

      <text className="F26 Amber" x={9} y={144} visibility={brakeControl.autoBrakeFailedVisible ? 'visible' : 'hidden'}>
        AUTO BRAKE
      </text>

      <g id="steering-control" visibility={steeringControl.lineVisible ? 'visible' : 'hidden'}>
        <text className="F22 White LS1" x={482} y={110}>
          STEER CTL
        </text>
        <text className="F28 White" x={631} y={112}>
          :
        </text>
        <ControlSystem
          x={650}
          y={114}
          type={ControlSystemType.Steering}
          number={1}
          failed={steeringControl.scs1Failed}
        />
        <ControlSystem
          x={677}
          y={114}
          type={ControlSystemType.Steering}
          number={2}
          failed={steeringControl.scs2Failed}
        />
      </g>

      <g id="lgers">
        <Gear x={351} y={59} position={GearPosition.Nose} type={GearType.Nose} lgciuWords={lgciuWords} />

        <text className="F22 Green WS-6" x={216} y={210} visibility={gravityExtensionVisible ? 'visible' : 'hidden'}>
          L/G GRVTY EXTN IN PROGRESS
        </text>

        <text className="F26 Amber" x={482} y={144} visibility={lgCtlVisible ? 'visible' : 'hidden'}>
          L/G CTL
        </text>

        <path
          className="Grey SW2 NoFill"
          d="m 5,207 l 31,4 m 98,7 c 3,14 14,30 27,34 h 43 m 106,0 h 149 m 106,0 h43 m27,-34 c -3,14 -14,30 -27,34 m 27,-34 m 98,-7 l 31,-4"
        />
        <Gear x={48} y={223} position={GearPosition.Left} type={GearType.WLG} lgciuWords={lgciuWords} />
        <Gear x={223} y={260} position={GearPosition.Left} type={GearType.BLG} lgciuWords={lgciuWords} />
        <Gear x={479} y={260} position={GearPosition.Right} type={GearType.BLG} lgciuWords={lgciuWords} />
        <Gear x={654} y={223} position={GearPosition.Right} type={GearType.WLG} lgciuWords={lgciuWords} />
      </g>

      <g id="wheels">
        <text className="F24 Cyan" x={370} y={580}>
          °C
        </text>
        <text className="F22 Cyan" x={367} y={634}>
          PSI
        </text>
        <WheelBogey
          x={384}
          y={140}
          position={WheelBogeyPosition.Nose}
          type={WheelBogeyType.Nose}
          moreActive={moreActive}
          brakeTemperatures={brakeTemperatures}
          hottestBrakeArcs={arcs}
          tirePressures={tirePressures}
          flightPhase={flightPhase}
        />
        <WheelBogey
          x={81}
          y={403}
          position={WheelBogeyPosition.Left}
          type={WheelBogeyType.WLG}
          moreActive={moreActive}
          brakeTemperatures={brakeTemperatures}
          hottestBrakeArcs={arcs}
          tirePressures={tirePressures}
          flightPhase={flightPhase}
        />
        <WheelBogey
          x={257}
          y={417}
          position={WheelBogeyPosition.Left}
          type={WheelBogeyType.BLG}
          moreActive={moreActive}
          brakeTemperatures={brakeTemperatures}
          hottestBrakeArcs={arcs}
          tirePressures={tirePressures}
          flightPhase={flightPhase}
        />
        <WheelBogey
          x={513}
          y={417}
          position={WheelBogeyPosition.Right}
          type={WheelBogeyType.BLG}
          moreActive={moreActive}
          brakeTemperatures={brakeTemperatures}
          hottestBrakeArcs={arcs}
          tirePressures={tirePressures}
          flightPhase={flightPhase}
        />
        <WheelBogey
          x={690}
          y={403}
          position={WheelBogeyPosition.Right}
          type={WheelBogeyType.WLG}
          moreActive={moreActive}
          brakeTemperatures={brakeTemperatures}
          hottestBrakeArcs={arcs}
          tirePressures={tirePressures}
          flightPhase={flightPhase}
        />
      </g>

      <g id="braking">
        <text className="F22 White" x={366} y={320}>
          BRK
        </text>
        <path className="White SW2 NoFill" d="m 145,311 h 46 m 110,0 h 40 m 88,0 h 40 m 110,0 h 46" />
        <BrakingSupply x={81} y={328} type={WheelBogeyType.WLG} />
        <BrakingSupply x={258} y={328} type={WheelBogeyType.BLG} />
        <BrakingSupply x={513} y={328} type={WheelBogeyType.BLG} />
        <BrakingSupply x={690} y={328} type={WheelBogeyType.WLG} />
      </g>

      <Accumulator x={687} y={602} indication={wingAccuIndication(accuPressurePsi, moreActive)} />
    </>
  );
};
