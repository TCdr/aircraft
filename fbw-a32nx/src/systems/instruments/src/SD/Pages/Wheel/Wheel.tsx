// @ts-strict-ignore
// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import React, { useState } from 'react';
import { useSimVar, useArinc429Var, Arinc429Word, usePersistentProperty } from '@flybywiresim/fbw-sdk-react';
import {
  MAIN_NOMINAL_PRESSURE_VAR,
  NOSE_NOMINAL_PRESSURE_VAR,
  TPIS_INSTALLED_DEFAULT,
  TPIS_INSTALLED_SETTING,
  TYRES,
  Tyre,
  TyrePressureIndication,
  tyrePressureIndication,
  tyrePressureVar,
} from '@shared/TyrePressures';
import { HydraulicsProvider, useHydraulics } from '../../Common/HydraulicsProvider';
import { HydraulicIndicator } from '../../Common/HydraulicIndicator';
import { ComponentPositionProps } from '../../Common/ComponentPositionProps';
import { SvgGroup } from '../../Common/SvgGroup';
import { Spoilers } from '../../Common/Spoilers';
import { autoBrakeIndicationClass } from './AutoBrakeIndication';
import { WheelBrakeIndications, WheelLegendColour, wheelBrakeIndications } from './WheelBrakeIndications';

import '../../Common/CommonStyles.scss';
import '../../Common/animations.scss';

const roundTemperature = (rawTemp: number): number => Math.min(995, Math.max(0, Math.round(rawTemp / 5) * 5));

const maxStaleness = 300;

export const WheelPage = () => {
  const tempBrake1 = useArinc429Var('L:A32NX_REPORTED_BRAKE_TEMPERATURE_1', maxStaleness);
  const tempBrake2 = useArinc429Var('L:A32NX_REPORTED_BRAKE_TEMPERATURE_2', maxStaleness);
  const tempBrake3 = useArinc429Var('L:A32NX_REPORTED_BRAKE_TEMPERATURE_3', maxStaleness);
  const tempBrake4 = useArinc429Var('L:A32NX_REPORTED_BRAKE_TEMPERATURE_4', maxStaleness);

  const roundedTemperatures = [tempBrake1, tempBrake2, tempBrake3, tempBrake4].map((temp) =>
    temp.isNormalOperation() ? roundTemperature(temp.value) : null,
  );
  const maxTemperature = roundedTemperatures
    .filter((temp) => temp !== null)
    .reduce((maxTemp, element) => Math.max(maxTemp, element), 0);
  const isHottest = roundedTemperatures.map((temp) => temp !== null && temp == maxTemperature);

  const lgciu1DiscreteWord1 = useArinc429Var('L:A32NX_LGCIU_1_DISCRETE_WORD_1');
  const lgciu2DiscreteWord1 = useArinc429Var('L:A32NX_LGCIU_2_DISCRETE_WORD_1');
  const lgciu1DiscreteWord3 = useArinc429Var('L:A32NX_LGCIU_1_DISCRETE_WORD_3');
  const lgciu2DiscreteWord3 = useArinc429Var('L:A32NX_LGCIU_2_DISCRETE_WORD_3');

  return (
    <svg
      id="main-wheel"
      className="ecam-common-styles"
      viewBox="0 0 768 768"
      style={{ marginTop: '-60px' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <text className="Title UnderlineWhite" x={15} y={149}>
        WHEEL
      </text>

      <HydraulicsProvider>
        <Spoilers x={133} y={64} />

        <LandingGearCtl
          x={326}
          y={320}
          lgciu1DiscreteWord1={lgciu1DiscreteWord1}
          lgciu2DiscreteWord1={lgciu2DiscreteWord1}
        />

        <BrakeAndSteeringLegends />
      </HydraulicsProvider>

      <AutoBrake x={318} y={570} />

      <Gear
        x={40}
        y={272}
        location="left"
        lgciu1DiscreteWord1={lgciu1DiscreteWord1}
        lgciu2DiscreteWord1={lgciu2DiscreteWord1}
        lgciu1DiscreteWord3={lgciu1DiscreteWord3}
        lgciu2DiscreteWord3={lgciu2DiscreteWord3}
      />
      <Wheels
        x={36}
        y={431}
        left={{ number: 1, temperature: tempBrake1, hottest: isHottest[0] }}
        right={{ number: 2, temperature: tempBrake2, hottest: isHottest[1] }}
      />

      <Gear
        x={294}
        y={137}
        location="center"
        lgciu1DiscreteWord1={lgciu1DiscreteWord1}
        lgciu2DiscreteWord1={lgciu2DiscreteWord1}
        lgciu1DiscreteWord3={lgciu1DiscreteWord3}
        lgciu2DiscreteWord3={lgciu2DiscreteWord3}
      />
      <WheelArch x={294} y={218} type="bottom" />
      <WheelArch x={416} y={218} type="bottom" />

      <Gear
        x={550}
        y={272}
        location="right"
        lgciu1DiscreteWord1={lgciu1DiscreteWord1}
        lgciu2DiscreteWord1={lgciu2DiscreteWord1}
        lgciu1DiscreteWord3={lgciu1DiscreteWord3}
        lgciu2DiscreteWord3={lgciu2DiscreteWord3}
      />
      <Wheels
        x={551}
        y={431}
        left={{ number: 3, temperature: tempBrake3, hottest: isHottest[2] }}
        right={{ number: 4, temperature: tempBrake4, hottest: isHottest[3] }}
      />

      <TyrePressures />
    </svg>
  );
};

/**
 * The TPIS tyre pressures, with the flyPad aircraft option "TPIS installed" only (rules in shared/TyrePressures):
 * "nnn PSI nnn" under the wheel numbers of each main gear and under the nose gear, above the lower wheel arcs.
 */
const TyrePressures = () => {
  const [tpisInstalled] = usePersistentProperty(TPIS_INSTALLED_SETTING, TPIS_INSTALLED_DEFAULT);
  const main1 = useArinc429Var(tyrePressureVar(Tyre.Main1), maxStaleness);
  const main2 = useArinc429Var(tyrePressureVar(Tyre.Main2), maxStaleness);
  const main3 = useArinc429Var(tyrePressureVar(Tyre.Main3), maxStaleness);
  const main4 = useArinc429Var(tyrePressureVar(Tyre.Main4), maxStaleness);
  const nose1 = useArinc429Var(tyrePressureVar(Tyre.Nose1), maxStaleness);
  const nose2 = useArinc429Var(tyrePressureVar(Tyre.Nose2), maxStaleness);
  const [mainNominalPsi] = useSimVar(MAIN_NOMINAL_PRESSURE_VAR, 'number', maxStaleness);
  const [noseNominalPsi] = useSimVar(NOSE_NOMINAL_PRESSURE_VAR, 'number', maxStaleness);
  const [fwcFlightPhase] = useSimVar('L:A32NX_FWC_FLIGHT_PHASE', 'Enum', maxStaleness);

  if (tpisInstalled !== '1') {
    return null;
  }

  // In the order of TYRES; null when the TPIS data is not valid (SSM not normal operation)
  const pressures = [main1, main2, main3, main4, nose1, nose2].map((word) =>
    word.isNormalOperation() ? word.value : null,
  );
  const nominal = { mainPsi: mainNominalPsi, nosePsi: noseNominalPsi };
  const [main1Ind, main2Ind, main3Ind, main4Ind, nose1Ind, nose2Ind] = TYRES.map((tyre) =>
    tyrePressureIndication(pressures, nominal, tyre, fwcFlightPhase),
  );

  return (
    <>
      <TyrePressurePair x={36} y={528} left={main1Ind} right={main2Ind} />
      <TyrePressurePair x={294} y={212} left={nose1Ind} right={nose2Ind} />
      <TyrePressurePair x={551} y={528} left={main3Ind} right={main4Ind} />
    </>
  );
};

interface TyrePressurePairProps extends ComponentPositionProps {
  left: TyrePressureIndication;
  right: TyrePressureIndication;
}

/** "nnn PSI nnn" of one axle, laid out as the "nnn °C nnn" of the brake temperatures (Wheels) */
const TyrePressurePair = ({ x, y, left, right }: TyrePressurePairProps) => (
  <SvgGroup x={x} y={y}>
    <text className={`${left.amber ? 'Amber' : 'Green'} Large End`} x={57} y={0}>
      {left.text}
    </text>
    <text className="Cyan Standard" x={70} y={0}>
      PSI
    </text>
    <text className={`${right.amber ? 'Amber' : 'Green'} Large End`} x={181} y={0}>
      {right.text}
    </text>
  </SvgGroup>
);

/**
 * The N/W STEERING, ANTI SKID, NORM BRK and ALTN BRK legends, from the brake fault L:vars of the a320_systems brake model
 * and the hydraulic low pressures (FCOM rules in WheelBrakeIndications)
 */
const BrakeAndSteeringLegends = () => {
  const hydraulics = useHydraulics();
  const [bscu1Fault] = useSimVar('L:A32NX_BRAKES_BSCU_1_FAULT', 'Bool', maxStaleness);
  const [bscu2Fault] = useSimVar('L:A32NX_BRAKES_BSCU_2_FAULT', 'Bool', maxStaleness);
  const [altnBrkFault] = useSimVar('L:A32NX_BRAKES_ALTN_BRK_FAULT', 'Bool', maxStaleness);
  const [normBrkFault] = useSimVar('L:A32NX_BRAKES_NORM_BRK_FAULT', 'Bool', maxStaleness);
  const [autoBrkFault] = useSimVar('L:A32NX_BRAKES_AUTO_BRK_FAULT', 'Bool', maxStaleness);
  const [nwStrgFault] = useSimVar('L:A32NX_BRAKES_NW_STRG_FAULT', 'Bool', maxStaleness);
  // The A/SKID & N/W STRG sw (the sim antiskid switch)
  const [antiSkidSwitchOn] = useSimVar('ANTISKID BRAKES ACTIVE', 'Bool', maxStaleness);

  const legends = wheelBrakeIndications({
    bscu1Lost: bscu1Fault > 0,
    bscu2Lost: bscu2Fault > 0,
    alternateBrakingLost: altnBrkFault > 0,
    normalBrakingFailed: normBrkFault > 0,
    autobrakeFailed: autoBrkFault > 0,
    noseWheelSteeringFailed: nwStrgFault > 0,
    antiSkidSwitchOff: !(antiSkidSwitchOn > 0),
    greenLowPressure: !hydraulics.G.available,
    yellowLowPressure: !hydraulics.Y.available,
  });

  return (
    <>
      <NoseWheelSteering x={271} y={235} shown={legends.noseWheelSteering} />
      <AntiSkid x={302} y={380} colour={legends.antiSkid} failedBscuChannels={legends.failedBscuChannels} />
      <NormalBraking x={276} y={393} colour={legends.normalBraking} />
      <AlternateBraking x={276} y={433} colour={legends.alternateBraking} accumulatorOnly={legends.accumulatorOnly} />
    </>
  );
};

interface LegendProps extends ComponentPositionProps {
  colour: WheelLegendColour;
}

/** N/W STEERING in amber with its Y hydraulic supply indication (green, amber in yellow low pressure) */
const NoseWheelSteering = ({ x, y, shown }: ComponentPositionProps & { shown: boolean }) =>
  shown ? (
    <SvgGroup x={x} y={y}>
      <HydraulicIndicator x={0} y={0} type="Y" />

      <text x={38} y={21} className="Large Amber">
        N/W STEERING
      </text>
    </SvgGroup>
  ) : null;

/** ANTI SKID with the numbers of the failed BSCU channels in amber */
const AntiSkid = ({
  x,
  y,
  colour,
  failedBscuChannels,
}: LegendProps & { failedBscuChannels: WheelBrakeIndications['failedBscuChannels'] }) =>
  colour !== null ? (
    <SvgGroup x={x} y={y}>
      {/* <!-- Text --> */}
      <text x={0} y={0} className={`Large ${colour}`}>
        ANTI SKID
      </text>

      {/* <!-- Brake and Steering Control Units: the failed channel numbers --> */}
      {failedBscuChannels[0] && (
        <>
          <path className="LightGreyLine" d="m 166 5 h 22 v -27" />
          <text className="Large Amber" x={171} y={0}>
            1
          </text>
        </>
      )}

      {failedBscuChannels[1] && (
        <>
          <path className="LightGreyLine" d="m 196 5 h 22 v -27" />
          <text className="Large Amber" x={200} y={0}>
            2
          </text>
        </>
      )}
    </SvgGroup>
  ) : null;

interface LandingGearCtlProps extends ComponentPositionProps {
  lgciu1DiscreteWord1: Arinc429Word;
  lgciu2DiscreteWord1: Arinc429Word;
}

const LandingGearCtl = ({ x, y, lgciu1DiscreteWord1, lgciu2DiscreteWord1 }: LandingGearCtlProps) => {
  const anyLgciuValid = lgciu1DiscreteWord1.isNormalOperation() || lgciu2DiscreteWord1.isNormalOperation();

  const leftMainGearNotDownlockedAndSelectedDown = lgciu1DiscreteWord1.bitValue(14) || lgciu2DiscreteWord1.bitValue(14);
  const rightMainGearNotDownlockedAndSelectedDown =
    lgciu1DiscreteWord1.bitValue(15) || lgciu2DiscreteWord1.bitValue(15);
  const noseGearNotDownlockedAndSelectedDown = lgciu1DiscreteWord1.bitValue(16) || lgciu2DiscreteWord1.bitValue(16);

  const leftMainGearNotUplockedAndNotSelectedDown =
    lgciu1DiscreteWord1.bitValue(11) || lgciu2DiscreteWord1.bitValue(11);
  const rightMainGearNotUplockedAndNotSelectedDown =
    lgciu1DiscreteWord1.bitValue(12) || lgciu2DiscreteWord1.bitValue(12);
  const noseGearNotUplockedAndNotSelectedDown = lgciu1DiscreteWord1.bitValue(13) || lgciu2DiscreteWord1.bitValue(13);

  const landingGearInTransit =
    anyLgciuValid &&
    (leftMainGearNotDownlockedAndSelectedDown ||
      rightMainGearNotDownlockedAndSelectedDown ||
      noseGearNotDownlockedAndSelectedDown ||
      leftMainGearNotUplockedAndNotSelectedDown ||
      rightMainGearNotUplockedAndNotSelectedDown ||
      noseGearNotUplockedAndNotSelectedDown);

  return landingGearInTransit ? (
    <text id="center-lg-ctl" x={x} y={y} className="Large Amber">
      L/G CTL
    </text>
  ) : null;
};

/** NORM BRK with its G hydraulic supply indication (green, amber in green low pressure) */
const NormalBraking = ({ x, y, colour }: LegendProps) =>
  colour !== null ? (
    <SvgGroup x={x} y={y}>
      <HydraulicIndicator x={0} y={0} type="G" />

      <text x={42} y={27} className={`Large ${colour}`}>
        NORM BRK
      </text>
    </SvgGroup>
  ) : null;

/** ALTN BRK with its Y hydraulic supply indication (green, amber in yellow low pressure) and ACCU ONLY */
const AlternateBraking = ({ x, y, colour, accumulatorOnly }: LegendProps & { accumulatorOnly: boolean }) =>
  colour !== null ? (
    <SvgGroup x={x} y={y}>
      <HydraulicIndicator x={0} y={0} type="Y" />

      <text x={42} y={28} className={`Large ${colour}`}>
        ALTN BRK
      </text>
      {accumulatorOnly && <AccumulatorOnly x={53} y={45} />}
    </SvgGroup>
  ) : null;

const AccumulatorOnly = ({ x, y }: ComponentPositionProps) => (
  <SvgGroup x={x} y={y}>
    {/* <!-- Arrow --> */}
    <polygon className="GreenLine" points="0,0 14,0 7,-10" />
    <path className="GreenLine" d="m 7 0 v 14 h 15" />

    <text x={38} y={24} className="Large Green">
      ACCU ONLY
    </text>
  </SvgGroup>
);

const AutoBrake = ({ x, y }: ComponentPositionProps) => {
  // Amber only on an AUTO BRK failure, "along with an ECAM caution" (FCOM DSC-32-30-20, a320_fcom.txt l.51576-51581):
  // the BSCU autobrake fault (BRAKES AUTO BRK FAULT), not when an engine is off
  const [autoBrakeFault] = useSimVar('L:A32NX_BRAKES_AUTO_BRK_FAULT', 'Bool', maxStaleness);
  const autoBrakeFailed = autoBrakeFault > 0;
  const available = !autoBrakeFailed;

  const [autoBrakeLevel] = useSimVar('L:A32NX_AUTOBRAKES_ARMED_MODE', 'Number', maxStaleness);
  const [autoBrakeActive] = useSimVar('L:A32NX_AUTOBRAKES_ACTIVE', 'boolean', maxStaleness);

  const [wasAutoBrakeActive, setAutoBrakeWasActive] = useState(!!autoBrakeActive);
  const [isAutoBrakeBlinking, setAutoBrakeIsBlinking] = useState(false);

  const shouldAutoBrakeBlink = !autoBrakeActive && autoBrakeLevel === 0 && (isAutoBrakeBlinking || wasAutoBrakeActive);

  if (shouldAutoBrakeBlink !== isAutoBrakeBlinking) {
    setAutoBrakeIsBlinking(shouldAutoBrakeBlink);
  }

  if (!!autoBrakeActive !== wasAutoBrakeActive) {
    setAutoBrakeWasActive(!!autoBrakeActive);
  }

  if (autoBrakeLevel !== 0) {
    return (
      <SvgGroup x={x} y={y}>
        <text className={`Large ${autoBrakeIndicationClass(autoBrakeFailed)}`}>AUTO BRK</text>

        <SvgGroup x={40} y={32}>
          {autoBrakeLevel === 1 ? <AutoBrakeLevel text="LO" available={available} /> : null}
          {autoBrakeLevel === 2 ? <AutoBrakeLevel text="MED" available={available} /> : null}
          {autoBrakeLevel === 3 ? <AutoBrakeLevel text="MAX" available={available} /> : null}
        </SvgGroup>
      </SvgGroup>
    );
  }

  // The failed autobrake disarms: the amber legend stays, without a rate
  if (autoBrakeFailed) {
    return (
      <SvgGroup x={x} y={y}>
        <text className={`Large ${autoBrakeIndicationClass(autoBrakeFailed)}`}>AUTO BRK</text>
      </SvgGroup>
    );
  }

  if (isAutoBrakeBlinking) {
    return (
      <SvgGroup x={x} y={y}>
        <text className="Large Green Transparent Blink10Seconds">AUTO BRK</text>
      </SvgGroup>
    );
  }

  return null;
};

interface AutoBrakeLevelProps {
  text: string;
  available: boolean;
}

const AutoBrakeLevel = ({ text, available }: AutoBrakeLevelProps) => (
  <text className={`Large ${available ? 'Green' : 'Amber'}`}>{text}</text>
);

const GearDoorJoint = ({ x, y }: ComponentPositionProps) => (
  <ellipse className="WhiteLine" cx={x} cy={y} rx={4.5} ry={4.5} />
);

type GearLocation = 'left' | 'center' | 'right';

interface GearDoorProps extends ComponentPositionProps {
  location: GearLocation;
  lgciu1DiscreteWord1: Arinc429Word;
  lgciu2DiscreteWord1: Arinc429Word;
  lgciu1DiscreteWord3: Arinc429Word;
  lgciu2DiscreteWord3: Arinc429Word;
}

const GearDoor = ({
  x,
  y,
  location,
  lgciu1DiscreteWord1,
  lgciu2DiscreteWord1,
  lgciu1DiscreteWord3,
  lgciu2DiscreteWord3,
}: GearDoorProps) => {
  const anyLgciuValid = lgciu1DiscreteWord1.isNormalOperation() || lgciu2DiscreteWord1.isNormalOperation();

  if (location === 'center') {
    const leftDoorFullyOpen = lgciu1DiscreteWord3.bitValue(27) || lgciu2DiscreteWord3.bitValue(27);
    const rightDoorFullyOpen = lgciu1DiscreteWord3.bitValue(28) || lgciu2DiscreteWord3.bitValue(28);
    const doorNotLockedUp = lgciu1DiscreteWord1.bitValue(19) || lgciu2DiscreteWord1.bitValue(19);

    let leftGearDoorSymbol: JSX.Element | null;
    let rightGearDoorSymbol: JSX.Element | null;
    if (anyLgciuValid && !doorNotLockedUp && !leftDoorFullyOpen) {
      leftGearDoorSymbol = <line className="GreenLine" x1={34} x2={78} y1={0} y2={0} />;
    } else if (anyLgciuValid && doorNotLockedUp && leftDoorFullyOpen) {
      leftGearDoorSymbol = <line className="AmberLine" x1={34} x2={78} y1={0} y2={0} transform="rotate(120, 29, 0)" />;
    } else if (anyLgciuValid && doorNotLockedUp && !leftDoorFullyOpen) {
      leftGearDoorSymbol = <line className="AmberLine" x1={34} x2={78} y1={0} y2={0} transform="rotate(55, 29, 0)" />;
    } else {
      leftGearDoorSymbol = (
        <text x={44} y={6} className="Amber Medium">
          XX
        </text>
      );
    }

    if (anyLgciuValid && !doorNotLockedUp && !rightDoorFullyOpen) {
      rightGearDoorSymbol = <line className="GreenLine" x1={106} x2={150} y1={0} y2={0} />;
    } else if (anyLgciuValid && doorNotLockedUp && rightDoorFullyOpen) {
      rightGearDoorSymbol = (
        <line className="AmberLine" x1={106} x2={150} y1={0} y2={0} transform="rotate(-120, 155, 0)" />
      );
    } else if (anyLgciuValid && doorNotLockedUp && !rightDoorFullyOpen) {
      rightGearDoorSymbol = (
        <line className="AmberLine" x1={106} x2={150} y1={0} y2={0} transform="rotate(-55, 155, 0)" />
      );
    } else {
      rightGearDoorSymbol = (
        <text x={116} y={6} className="Amber Medium">
          XX
        </text>
      );
    }

    return (
      <SvgGroup x={x} y={y}>
        <path className="WhiteLine" d="m 0 0 h 22" />
        <path className="WhiteLine" d="m 161 0 h 22" />

        {leftGearDoorSymbol}
        {rightGearDoorSymbol}

        <GearDoorJoint x={29} y={0} />
        <GearDoorJoint x={155} y={0} />
      </SvgGroup>
    );
  }
  let doorFullyOpen: boolean;
  let doorNotLockedUp: boolean;
  if (location === 'left') {
    doorFullyOpen = lgciu1DiscreteWord3.bitValue(25) || lgciu2DiscreteWord3.bitValue(25);
    doorNotLockedUp = lgciu1DiscreteWord1.bitValue(17) || lgciu2DiscreteWord1.bitValue(17);
  } else {
    doorFullyOpen = lgciu1DiscreteWord3.bitValue(26) || lgciu2DiscreteWord3.bitValue(26);
    doorNotLockedUp = lgciu1DiscreteWord1.bitValue(18) || lgciu2DiscreteWord1.bitValue(18);
  }

  let gearDoorSymbol: JSX.Element | null;
  if (anyLgciuValid && !doorNotLockedUp && !doorFullyOpen) {
    gearDoorSymbol = <line className="GreenLine" x1={33} x2={149} y1={0} y2={0} />;
  } else if (anyLgciuValid && doorNotLockedUp && doorFullyOpen) {
    gearDoorSymbol = (
      <line
        className="AmberLine"
        x1={location === 'left' ? 72 : 33}
        x2={location === 'left' ? 149 : 105}
        y1={0}
        y2={0}
        transform={`rotate(${location === 'left' ? -110 : 110},${location === 'left' ? 154 : 29},0)`}
      />
    );
  } else if (anyLgciuValid && doorNotLockedUp && !doorFullyOpen) {
    gearDoorSymbol = (
      <line
        className="AmberLine"
        x1={location === 'left' ? 72 : 33}
        x2={location === 'left' ? 149 : 105}
        y1={0}
        y2={0}
        transform={`rotate(${location === 'left' ? -55 : 55},${location === 'left' ? 154 : 29},0)`}
      />
    );
  } else {
    gearDoorSymbol = (
      <text x={80} y={6} className="Amber Medium">
        XX
      </text>
    );
  }

  return (
    <SvgGroup x={x} y={y}>
      <path className="WhiteLine" d="m0 0 h24" />
      <path className="WhiteLine" d="m159 0 h24" />

      {gearDoorSymbol}

      <GearDoorJoint x={location === 'left' ? 154 : 29} y={0} />
    </SvgGroup>
  );
};

interface LandingGearPositionIndicatorsProps extends ComponentPositionProps {
  location: GearLocation;
  lgciu1DiscreteWord1: Arinc429Word;
  lgciu2DiscreteWord1: Arinc429Word;
  lgciu1DiscreteWord3: Arinc429Word;
  lgciu2DiscreteWord3: Arinc429Word;
}

const LandingGearPositionIndicators = ({
  x,
  y,
  location,
  lgciu1DiscreteWord1,
  lgciu2DiscreteWord1,
  lgciu1DiscreteWord3,
  lgciu2DiscreteWord3,
}: LandingGearPositionIndicatorsProps) => {
  const lgciu1DataValid = lgciu1DiscreteWord1.isNormalOperation();
  const lgciu2DataValid = lgciu2DiscreteWord1.isNormalOperation();

  let lgciu1GearNotUplocked: boolean;
  let lgciu2GearNotUplocked: boolean;
  let lgciu1GearDownlocked: boolean;
  let lgciu2GearDownlocked: boolean;
  let upLockFlagShown = lgciu1DataValid && lgciu2DataValid;
  if (location === 'left') {
    lgciu1GearNotUplocked = lgciu1DiscreteWord3.bitValue(11);
    lgciu2GearNotUplocked = lgciu2DiscreteWord3.bitValue(11);
    lgciu1GearDownlocked = lgciu1DiscreteWord1.bitValue(23);
    lgciu2GearDownlocked = lgciu2DiscreteWord1.bitValue(23);
    upLockFlagShown = upLockFlagShown && lgciu1DiscreteWord1.bitValue(20) && lgciu2DiscreteWord1.bitValue(20);
  } else if (location === 'right') {
    lgciu1GearNotUplocked = lgciu1DiscreteWord3.bitValue(12);
    lgciu2GearNotUplocked = lgciu2DiscreteWord3.bitValue(12);
    lgciu1GearDownlocked = lgciu1DiscreteWord1.bitValue(24);
    lgciu2GearDownlocked = lgciu2DiscreteWord1.bitValue(24);
    upLockFlagShown = upLockFlagShown && lgciu1DiscreteWord1.bitValue(21) && lgciu2DiscreteWord1.bitValue(21);
  } else {
    lgciu1GearNotUplocked = lgciu1DiscreteWord3.bitValue(13);
    lgciu2GearNotUplocked = lgciu2DiscreteWord3.bitValue(13);
    lgciu1GearDownlocked = lgciu1DiscreteWord1.bitValue(25);
    lgciu2GearDownlocked = lgciu2DiscreteWord1.bitValue(25);
    upLockFlagShown = upLockFlagShown && lgciu1DiscreteWord1.bitValue(22) && lgciu2DiscreteWord1.bitValue(22);
  }

  let lgciu1Color = '';
  let lgciu2Color = '';
  if (lgciu1GearDownlocked && lgciu1GearNotUplocked) {
    lgciu1Color = 'Green';
  } else if (!lgciu1GearDownlocked && lgciu1GearNotUplocked) {
    lgciu1Color = 'Red';
  }
  if (lgciu2GearDownlocked && lgciu2GearNotUplocked) {
    lgciu2Color = 'Green';
  } else if (!lgciu2GearDownlocked && lgciu2GearNotUplocked) {
    lgciu2Color = 'Red';
  }

  return (
    <SvgGroup x={x} y={y}>
      {lgciu1DataValid && lgciu1GearNotUplocked && (
        <g className={`${lgciu1Color}Line`}>
          <path d="m 0 0 h 27 v 37 z" />
          <path d="m 6 0 v 8" />
          <path d="m 13 0 v 17" />
          <path d="m 20 0 v 27" />
        </g>
      )}

      {lgciu2DataValid && lgciu2GearNotUplocked && (
        <g className={`${lgciu2Color}Line`}>
          <path d="m 63 0 h -27 v 37 z" />
          <path d="m 43 0 v 27" />
          <path d="m 50 0 v 17" />
          <path d="m 57 0 v 8" />
        </g>
      )}

      {!lgciu1DataValid && (
        <g>
          <path className="AmberLine" d="m 0 0 h 27" />

          <text className="Amber Standard" x={1} y={22}>
            XX
          </text>
        </g>
      )}

      {!lgciu2DataValid && (
        <g>
          <path className="AmberLine" d="m 63 0 h -27" />

          <text className="Amber Standard" x={36} y={22}>
            XX
          </text>
        </g>
      )}

      {upLockFlagShown && (
        <text className="Amber Standard" x={-16} y={-22}>
          UP LOCK
        </text>
      )}
    </SvgGroup>
  );
};

interface GearProps extends ComponentPositionProps {
  location: GearLocation;
  lgciu1DiscreteWord1: Arinc429Word;
  lgciu2DiscreteWord1: Arinc429Word;
  lgciu1DiscreteWord3: Arinc429Word;
  lgciu2DiscreteWord3: Arinc429Word;
}

const Gear = ({
  x,
  y,
  location,
  lgciu1DiscreteWord1,
  lgciu2DiscreteWord1,
  lgciu1DiscreteWord3,
  lgciu2DiscreteWord3,
}: GearProps) => (
  <SvgGroup x={x} y={y}>
    <GearDoor
      x={0}
      y={0}
      location={location}
      lgciu1DiscreteWord1={lgciu1DiscreteWord1}
      lgciu2DiscreteWord1={lgciu2DiscreteWord1}
      lgciu1DiscreteWord3={lgciu1DiscreteWord3}
      lgciu2DiscreteWord3={lgciu2DiscreteWord3}
    />
    <LandingGearPositionIndicators
      x={60}
      y={9}
      location={location}
      lgciu1DiscreteWord1={lgciu1DiscreteWord1}
      lgciu2DiscreteWord1={lgciu2DiscreteWord1}
      lgciu1DiscreteWord3={lgciu1DiscreteWord3}
      lgciu2DiscreteWord3={lgciu2DiscreteWord3}
    />
  </SvgGroup>
);

interface WheelArchProps extends ComponentPositionProps {
  type: 'top' | 'bottom';
  green?: boolean;
  amber?: boolean;
}

const WheelArch = ({ x, y, type, green, amber }: WheelArchProps) => {
  let classes = 'ThickGreyLine';
  if (green && !amber) {
    classes = 'GreenLine';
  } else if (amber) {
    classes = 'AmberLine';
  }

  return <path className={classes} d={`m${x} ${y} a -62 -62 0 0 ${type === 'bottom' ? 0 : 1} 60 0`} />;
};

interface Brake {
  number: number;
  temperature: Arinc429Word;
  hottest: boolean;
}

interface WheelsProps extends ComponentPositionProps {
  left: Brake;
  right: Brake;
}

const Wheels = ({ x, y, left, right }: WheelsProps) => {
  const brakeAmberThreshold = 300;

  const leftTemperature = left.temperature.valueOr(NaN);
  const rightTemperature = right.temperature.valueOr(NaN);

  return (
    <SvgGroup x={x} y={y}>
      <WheelArch
        x={0}
        y={0}
        type="top"
        green={left.hottest && leftTemperature > 100}
        amber={left.hottest && leftTemperature > 300}
      />
      <WheelArch
        x={124}
        y={0}
        type="top"
        green={right.hottest && rightTemperature > 100}
        amber={right.hottest && rightTemperature > 300}
      />
      <WheelArch x={0} y={103} type="bottom" />
      <WheelArch x={124} y={103} type="bottom" />
      <text className="Cyan Standard" x={73} y={32}>
        °C
      </text>
      <text className="Standard" x={72} y={66}>
        REL
      </text>

      <text
        className={`${!left.temperature.isNormalOperation() || left.temperature.value > brakeAmberThreshold ? 'Amber' : 'Green'} Large End`}
        x={57}
        y={33}
      >
        {left.temperature.isNormalOperation() ? roundTemperature(left.temperature.value) : 'XX'}
      </text>
      <text
        className={`${!right.temperature.isNormalOperation() || right.temperature.value > brakeAmberThreshold ? 'Amber' : 'Green'} Large End`}
        x={181}
        y={33}
      >
        {right.temperature.isNormalOperation() ? roundTemperature(right.temperature.value) : 'XX'}
      </text>

      <text className="Large" x={22} y={66}>
        {left.number}
      </text>
      <text className="Large" x={146} y={66}>
        {right.number}
      </text>
    </SvgGroup>
  );
};
