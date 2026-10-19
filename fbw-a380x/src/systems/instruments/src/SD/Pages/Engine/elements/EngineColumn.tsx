import { useSimVar } from '@instruments/common/simVars';
import { EngineNumber, IgnitionActive, Position } from '@instruments/common/types';
import React, { FC, useEffect, useState } from 'react';
import DecimalValues from './DecimalValues';
import IgnitionBorder from './IgnitionBorder';
import NacelleTemperatureGauge from './NacelleTemperatureGauge';
import OilPressureGauge from './OilPressureGauge';
import OilQuantityGauge from './OilQuantityGauge';
import StartValve from './StartValve';
import { StartValveFault, nacelleTemperatureVisible, startParametersVisible } from './StartParameters';
import { oilQuantityPulses, oilTemperatureClass } from '../OilIndications';
import { n3ClassName, n3RedCrossShown, vibrationClassName } from './EngineVibration';
import { NXUnits } from '@flybywiresim/fbw-sdk-react';
import { areEngineParametersShown, areVibrationsShown } from '../EngineParametersAvailability';
import { fuelFilterCloggedShown } from '../FuelFilterIndication';
import { nacelleTemperaturePulses } from '../NacelleTemperature';
import {
  degradedAccuracyShown,
  degradedAccuracyStrikePath,
  FUEL_FLOW_STRUCK_DIGITS,
} from '../../../../MsfsAvionicsCommon/DegradedAccuracy';

/** The size of an F29 digit on the SD */
const LARGE_DIGIT_WIDTH = 16;
const LARGE_DIGIT_HEIGHT = 21;

interface EngineColumnProps {
  useMetric: boolean;
}

const EngineColumn: FC<Position & EngineNumber & IgnitionActive & EngineColumnProps> = ({ x, y, engine, ignition }) => {
  const [N2] = useSimVar(`L:A32NX_ENGINE_N2:${engine}`, 'number', 100); // TODO: Update with correct SimVars
  const [N3] = useSimVar(`L:A32NX_ENGINE_N3:${engine}`, 'number', 100); // TODO: Update with correct SimVars
  const [starterValveOpen] = useSimVar(`L:A32NX_PNEU_ENG_${engine}_STARTER_VALVE_OPEN`, 'number', 500); // TODO: Update with correct SimVars
  const starting = !!(N2 < 58.5 && ignition && starterValveOpen); // TODO Should be N3
  // the igniters the FADEC energizes (fadec_a380x IgniterSelection_A380X)
  const [igniterA] = useSimVar(`L:A32NX_FADEC_IGNITER_A_ACTIVE_ENG${engine}`, 'bool', 300);
  const [igniterB] = useSimVar(`L:A32NX_FADEC_IGNITER_B_ACTIVE_ENG${engine}`, 'bool', 300);
  // The start valve fault the FADEC start sequence detects (systems::engine::engine_start::StartValveFault)
  const [startValveFaultValue] = useSimVar(`L:A32NX_ENGINE_${engine}_START_VALVE_FAULT`, 'number', 500);
  const startValveFault = startValveFaultValue ?? StartValveFault.None;
  const hasStartValveFault = startValveFault !== StartValveFault.None;

  // FCOM DSC-70-90 N2: the red cross of an N3 exceedance stays until the next start of the engine on the ground
  // (EngineVibration n3RedCrossShown). ENGINE_STATE 2 starting, 3 restarting.
  const [engineState] = useSimVar(`L:A32NX_ENGINE_STATE:${engine}`, 'number', 500);
  const [onGround] = useSimVar('SIM ON GROUND', 'bool', 500);
  const groundStart = !!onGround && (engineState === 2 || engineState === 3);
  const [n3RedCross, setN3RedCross] = useState(false);
  // The FADEC supply model of the systems WASM (a380_systems fadec_power.rs)
  const [fadecSupplied] = useSimVar(`L:A32NX_FADEC_POWERED_ENG${engine}`, 'bool', 500);
  const [fadecNetworkLost] = useSimVar(`L:A32NX_ENGINE_${engine}_FADEC_FAULT`, 'bool', 500);

  const fadecPowered = areEngineParametersShown({
    fadecPowered: !!fadecSupplied,
    fadecNetworkLost: !!fadecNetworkLost,
  });
  // Only an N3 shown (FADEC powered, not XX) can latch the red cross (EngineVibration n3RedCrossShown).
  useEffect(() => {
    setN3RedCross((shownBefore) => n3RedCrossShown(shownBefore, N3, groundStart, fadecPowered));
  }, [N3, groundStart, fadecPowered]);

  const [fuelFlow] = useSimVar(`L:A32NX_ENGINE_FF:${engine}`, 'number', 100);
  // ENG CTL SYS FAULT (systems WASM engine_monitoring_fault.rs): degraded accuracy of the engine values (DegradedAccuracy.ts)
  const [ctlSysFault] = useSimVar(`L:A32NX_ENGINE_${engine}_CTL_SYS_FAULT`, 'bool', 500);
  const accuracyDegraded = degradedAccuracyShown(!!ctlSysFault, fadecPowered);
  // The fuel filter clog failure (systems engine/fuel_filter_failure.rs) and the engine state (above), see FuelFilterIndication
  const [fuelFilterClogged] = useSimVar(`L:A32NX_ENGINE_${engine}_FUEL_FILTER_CLOGGED`, 'bool', 500);

  // The rotor vibrations of the systems WASM (see EngineVibration): MSFS has a single vibration value per engine.
  const [n1Vibration] = useSimVar(`L:A32NX_ENGINE_${engine}_N1_VIBRATION`, 'number', 250);
  const [n2Vibration] = useSimVar(`L:A32NX_ENGINE_${engine}_N2_VIBRATION`, 'number', 250);
  const [n3Vibration] = useSimVar(`L:A32NX_ENGINE_${engine}_N3_VIBRATION`, 'number', 250);
  const [emuSupplied] = useSimVar(`L:A32NX_ENGINE_${engine}_EMU_SUPPLIED`, 'bool', 500);
  const vibrationsShown = areVibrationsShown(fadecPowered, !!emuSupplied);

  const [nacelleTemperature] = useSimVar(`L:A32NX_ENGINE_${engine}_NACELLE_TEMPERATURE`, 'number', 500);

  const [oilQuantity] = useSimVar(`L:A32NX_ENGINE_OIL_QTY:${engine}`, 'number', 500); // TODO: Update with correct SimVars
  // FCOM DSC-70-90 OIL QUANTITY: pulses below the 1.2 qt advisory, except at TOGA or in reverse (OilIndications),
  const [thrustLeverAngle] = useSimVar(`L:A32NX_AUTOTHRUST_TLA:${engine}`, 'number', 500);
  // and at a FLEX or derated takeoff, a go-around and in alpha floor (A/THR mode)
  const [autothrustMode] = useSimVar('L:A32NX_AUTOTHRUST_MODE', 'enum', 500);
  const oilQuantityPulse = oilQuantityPulses(oilQuantity, thrustLeverAngle, autothrustMode);
  const [engineOilTemperature] = useSimVar(`GENERAL ENG OIL TEMPERATURE:${engine}`, 'celsius', 100); // TODO: Update with correct SimVars
  // fbw-a380x\src\wasm\fadec_a380x\src\Fadec\EngineControl_A380X.cpp
  // has all the engine oil simvars in a large section commented out

  return (
    <>
      <IgnitionBorder x={x} y={y} engine={engine} ignition={ignition} />
      {/* N2 */}
      <DecimalValues x={x} y={y} value={N2} active={fadecPowered} accuracyDegraded={accuracyDegraded} />
      <path className="White SW2" d={`M${engine > 2 ? x - 96 : x + 64},${y - 10} l 26, 0`} />
      {/* N3 */}
      <rect x={x - 55} y={y + 10} width={98} height={34} className={`LightGreyBox ${starting ? 'Show' : 'Hide'}`} />
      <DecimalValues
        x={x}
        y={y + 38}
        value={N3}
        active={fadecPowered}
        className={n3ClassName(N3)}
        accuracyDegraded={accuracyDegraded}
      />
      {fadecPowered && n3RedCross && (
        <text x={x + 46} y={y + 38} className="Red F25 MiddleAlign">
          +
        </text>
      )}
      <path className="White SW2" d={`M${engine > 2 ? x - 96 : x + 64},${y + 28} l 26, 0`} />
      {/* Fuel Flow */}
      {!fadecPowered && (
        <text x={x} y={y + 86} className="Amber F29 MiddleAlign">
          XX
        </text>
      )}
      {fadecPowered && (
        <text x={x + 30} y={y + 92} className="Green EndAlign F29">
          {Math.ceil(NXUnits.kgToUser(fuelFlow) / 10) * 10}
        </text>
      )}
      {accuracyDegraded && (
        <path
          className="Amber SW2 NoFill"
          d={degradedAccuracyStrikePath(x + 31, y + 92, LARGE_DIGIT_WIDTH, LARGE_DIGIT_HEIGHT, FUEL_FLOW_STRUCK_DIGITS)}
        />
      )}
      {/* FCOM DSC-70-90 FUEL FLOW: CLOGGED in amber below the fuel flow */}
      {fadecPowered && fuelFilterCloggedShown(!!fuelFilterClogged, engineState) && (
        <text x={x} y={y + 118} className="Amber MiddleAlign F22">
          CLOGGED
        </text>
      )}
      {/* OIL */}
      <OilQuantityGauge
        x={x}
        y={y + 206}
        engine={engine}
        active={fadecPowered}
        value={oilQuantity}
        pulse={oilQuantityPulse}
      />
      <DecimalValues x={x} y={y + 206} value={oilQuantity} active={fadecPowered} pulse={oilQuantityPulse} />
      {!fadecPowered && (
        <text x={x} y={y + 242} className="Amber F29 MiddleAlign">
          XX
        </text>
      )}
      {fadecPowered && (
        <text x={x + 20} y={y + 248} className={`${oilTemperatureClass(engineOilTemperature)} EndAlign F29`}>
          {engineOilTemperature < 0 ? 0 : Math.round(engineOilTemperature)}
        </text>
      )}
      <path className="White SW2" d={`M${engine > 2 ? x - 96 : x + 64},${y + 82} l 26, 0`} />
      {/* Oil Pressure */}
      <OilPressureGauge x={x} y={y + 320} engine={engine} active={fadecPowered} />
      {/* VIB N1 */}
      <DecimalValues
        x={x}
        y={y + 380}
        value={n1Vibration}
        active={vibrationsShown}
        shift={-14}
        className={vibrationClassName(n1Vibration)}
      />
      <path className="White SW2" d={`M${engine > 2 ? x - 96 : x + 64},${y + 370} l 26, 0`} />
      {/* VIB N2 */}
      <DecimalValues
        x={x}
        y={y + 416}
        value={n2Vibration}
        active={vibrationsShown}
        shift={-14}
        className={vibrationClassName(n2Vibration)}
      />
      <path className="White SW2" d={`M${engine > 2 ? x - 96 : x + 64},${y + 406} l 26, 0`} />
      {/* VIB N3 */}
      <DecimalValues
        x={x}
        y={y + 450}
        value={n3Vibration}
        active={vibrationsShown}
        shift={-14}
        className={vibrationClassName(n3Vibration)}
      />
      <path className="White SW2" d={`M${engine > 2 ? x - 96 : x + 64},${y + 440} l 26, 0`} />

      {/* NAC / Ignition */}
      {startParametersVisible(starting, ignition, !!igniterA, !!igniterB, hasStartValveFault) && (
        <StartValve
          x={x}
          y={y + 536}
          engine={engine}
          igniterA={!!igniterA}
          igniterB={!!igniterB}
          startValveFault={startValveFault}
        />
      )}
      {nacelleTemperatureVisible(!!starterValveOpen, ignition, !!igniterA, !!igniterB, hasStartValveFault) && (
        <NacelleTemperatureGauge
          x={x}
          y={y + 536}
          engine={engine}
          active={fadecPowered}
          value={nacelleTemperature}
          pulse={nacelleTemperaturePulses(nacelleTemperature)}
        />
      )}
    </>
  );
};

export default EngineColumn;
