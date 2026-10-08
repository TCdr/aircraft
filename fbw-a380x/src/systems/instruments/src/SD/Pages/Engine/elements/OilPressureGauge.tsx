import React, { FC } from 'react';
import { GaugeComponent, GaugeMarkerComponent } from '@instruments/common/gauges';
import { useSimVar } from '@instruments/common/simVars';
import {
  OIL_PSI_GAUGE_MAX,
  OIL_PSI_RED_MAX,
  oilFilterCloggedShown,
  oilPressureGaugeValue,
  oilPressureIsRed,
} from '../OilIndications';

interface OilPressureGaugeProps {
  x: number;
  y: number;
  engine: number;
  active: boolean;
}

const OilPressureGauge: FC<OilPressureGaugeProps> = ({ x, y, engine, active }) => {
  // The oil pressure the FADEC computes (EngineControl_A380X updateOil), as the FWS reads it
  const [engineOilPressure] = useSimVar(`GENERAL ENG OIL PRESSURE:${engine}`, 'psi', 100);
  // The oil filter clog failure (systems engine/oil_failure.rs) and the engine state, see OilIndications
  const [oilFilterClogged] = useSimVar(`L:A32NX_ENGINE_${engine}_OIL_FILTER_CLOGGED`, 'bool', 500);
  const [engineState] = useSimVar(`L:A32NX_ENGINE_STATE:${engine}`, 'number', 500);
  const radius = 45;
  const startAngle = -90;
  const endAngle = 90;
  const min = 0;
  const max = OIL_PSI_GAUGE_MAX;

  // FCOM DSC-70-90 OIL PRESSURE: 0-100 PSI on the first half of the scale, 100-440 PSI on the second half
  const needleValue = oilPressureGaugeValue(engineOilPressure);
  const red = oilPressureIsRed(engineOilPressure);
  // The red range, 0 to 25 PSI, in degrees of the 180 degree scale
  const redArcDegrees = ((endAngle - startAngle) * oilPressureGaugeValue(OIL_PSI_RED_MAX)) / max;

  return (
    <g id={`OilPressureGauge-${engine}`}>
      {/* Pack inlet flow */}
      <GaugeComponent
        x={x}
        y={y}
        radius={radius}
        startAngle={startAngle}
        endAngle={endAngle}
        visible
        className="GaugeComponent Gauge"
      >
        {!active && (
          <text x={x} y={y - 4} className="Amber F29 MiddleAlign">
            XX
          </text>
        )}
        {active && (
          <>
            <GaugeComponent
              x={x}
              y={y}
              radius={radius - 1}
              startAngle={startAngle}
              endAngle={startAngle + redArcDegrees}
              visible
              className="GaugeComponent Gauge SW6RedLine"
            />
            <GaugeMarkerComponent
              value={min}
              x={x}
              y={y}
              min={min}
              max={max}
              radius={radius}
              startAngle={startAngle}
              endAngle={endAngle}
              className="White SW2"
              showValue={false}
            />
            <GaugeMarkerComponent
              value={250}
              x={x}
              y={y}
              min={min}
              max={max}
              radius={radius}
              startAngle={startAngle}
              endAngle={endAngle}
              className="White SW2"
              showValue={false}
            />
            <GaugeMarkerComponent
              value={max}
              x={x}
              y={y}
              min={min}
              max={max}
              radius={radius}
              startAngle={startAngle}
              endAngle={endAngle}
              className="White SW2"
              showValue={false}
            />
            <GaugeMarkerComponent
              value={Math.round(needleValue)}
              x={x}
              y={y}
              min={min}
              max={max}
              radius={radius}
              startAngle={startAngle}
              endAngle={endAngle}
              className={`${red ? 'RedGaugeIndicator ' : 'GaugeIndicator '} Gauge LineRound SW4 `}
              indicator
              halfIndicator
              multiplierInner={0.8}
              multiplierOuter={1.2}
            />
          </>
        )}
      </GaugeComponent>
      {active && (
        <text x={x + 28} y={y} className={`${red ? 'Red' : 'Green'} EndAlign F29`}>
          {engineOilPressure < 0 ? 0 : Math.round(engineOilPressure)}
        </text>
      )}
      {/* FCOM DSC-70-90 OIL PRESSURE: CLOGGED in amber below the oil pressure */}
      {active && oilFilterCloggedShown(!!oilFilterClogged, engineState) && (
        <text x={x} y={y + 26} className="Amber MiddleAlign F22">
          CLOGGED
        </text>
      )}
    </g>
  );
};

export default OilPressureGauge;
