import React, { FC } from 'react';
import { GaugeComponent, GaugeMarkerComponent } from '@instruments/common/gauges';
import { OIL_QTY_ADVISORY_QT } from '../OilIndications';

interface OilQuantityGaugeProps {
  x: number;
  y: number;
  engine: number;
  active: boolean;
  value: number;
  /** The needle pulses below the oil advisory limit (OilIndications oilQuantityPulses) */
  pulse: boolean;
}

const OilQuantityGauge: FC<OilQuantityGaugeProps> = ({ x, y, engine, active, value, pulse }) => {
  const radius = 53;
  const startAngle = -90;
  const endAngle = 90;
  const min = 0;
  const max = 18.3;

  return (
    <g id={`OilQuantityGauge-${engine}`}>
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
            {/* FCOM DSC-70-90 OIL QUANTITY: the first white dash is the 1.2 qt oil advisory limit */}
            <GaugeMarkerComponent
              value={OIL_QTY_ADVISORY_QT}
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
              value={max / 2}
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
              value={value}
              x={x}
              y={y}
              min={min}
              max={max}
              radius={radius}
              startAngle={startAngle}
              endAngle={endAngle}
              className={`GaugeIndicator Gauge LineRound SW4 ${pulse ? 'LinePulse' : ''}`}
              indicator
              halfIndicator
              multiplierInner={0.8}
              multiplierOuter={1.2}
            />
          </>
        )}
      </GaugeComponent>
    </g>
  );
};

export default OilQuantityGauge;
