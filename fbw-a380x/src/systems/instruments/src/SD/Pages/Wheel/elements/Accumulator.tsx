import { GaugeComponent, GaugeMarkerComponent } from '@instruments/common/gauges';
import React, { FC } from 'react';
import {
  WING_ACCU_AMBER_ARC_MAX_PSI,
  WING_ACCU_GREEN_ARC_MIN_PSI,
  WING_ACCU_SCALE_MAX_PSI,
  WingAccuIndication,
} from '../WheelIndications';

interface AccumulatorProps {
  x: number;
  y: number;
  /** WING ACCU pressure indication (A380 FCOM DSC-32-20-50, WheelIndications.wingAccuIndication) */
  indication: WingAccuIndication;
}

export const Accumulator: FC<AccumulatorProps> = ({ x, y, indication }) => {
  const AMBER_ARC_MAX = WING_ACCU_AMBER_ARC_MAX_PSI;
  const GREEN_ARC_MIN = WING_ACCU_GREEN_ARC_MIN_PSI;
  const GREEN_ARC_MAX = 5300;

  const GAUGE_MIN = 0;
  const GAUGE_MAX = WING_ACCU_SCALE_MAX_PSI / 1000;
  const GAUGE_RADIUS = 50;
  const GAUGE_START = 270;
  const GAUGE_END = 90;

  const AMBER_ARC_MAX_ANGLE = (GAUGE_START + ((GAUGE_START - GAUGE_END) * AMBER_ARC_MAX) / (GAUGE_MAX * 1000)) % 360;
  const GREEN_ARC_MIN_ANGLE = (GAUGE_START + ((GAUGE_START - GAUGE_END) * GREEN_ARC_MIN) / (GAUGE_MAX * 1000)) % 360;
  const GREEN_ARC_MAX_ANGLE = (GAUGE_START + ((GAUGE_START - GAUGE_END) * GREEN_ARC_MAX) / (GAUGE_MAX * 1000)) % 360;

  const gaugeMarkerClassName = 'White SW3';
  const gaugeMarkerTextClassName = 'White F24';
  // l.81242-81243: "When in the amber arc, the pressure indication is amber. When outside the amber arc, the pressure
  // indication is green."
  const needleClassName = `SW6 ${indication.amber ? 'Amber' : 'Green'} LineRound`;

  return (
    <g id="wing-accu" transform={`translate(${x} ${y})`} visibility={indication.visible ? 'visible' : 'hidden'}>
      <GaugeComponent
        x={0}
        y={0}
        radius={GAUGE_RADIUS}
        startAngle={GAUGE_START}
        endAngle={GAUGE_END}
        visible
        className="SW2 White NoFill"
      >
        <GaugeComponent
          x={0}
          y={0}
          radius={GAUGE_RADIUS - 2}
          startAngle={GAUGE_START}
          endAngle={AMBER_ARC_MAX_ANGLE}
          largeArc={0}
          visible
          className="SW6 Amber NoFill"
        >
          <GaugeComponent
            x={0}
            y={0}
            radius={GAUGE_RADIUS - 2}
            startAngle={GREEN_ARC_MIN_ANGLE}
            endAngle={GREEN_ARC_MAX_ANGLE}
            visible
            className="SW6 Green NoFill"
          >
            {/* 0 */}
            <GaugeMarkerComponent
              x={0}
              y={0}
              min={GAUGE_MIN}
              max={GAUGE_MAX}
              value={0}
              radius={GAUGE_RADIUS}
              startAngle={GAUGE_START}
              endAngle={GAUGE_END}
              className={gaugeMarkerClassName}
              textClassName={gaugeMarkerTextClassName}
              textNudgeX={-28}
              textNudgeY={9}
              multiplierInner={0.75}
              showValue
              bold
            />
            {/* 2500 */}
            <GaugeMarkerComponent
              x={0}
              y={0}
              min={GAUGE_MIN}
              max={GAUGE_MAX}
              value={2.5}
              radius={GAUGE_RADIUS}
              startAngle={GAUGE_START}
              endAngle={GAUGE_END}
              className={gaugeMarkerClassName}
              multiplierInner={0.75}
              bold
            />
            {/* 5000 */}
            <GaugeMarkerComponent
              x={0}
              y={0}
              min={GAUGE_MIN}
              max={GAUGE_MAX}
              value={5}
              radius={GAUGE_RADIUS}
              startAngle={GAUGE_START}
              endAngle={GAUGE_END}
              className={gaugeMarkerClassName}
              textClassName={gaugeMarkerTextClassName}
              showValue
              textNudgeX={30}
              textNudgeY={9}
              multiplierInner={0.75}
              bold
            />

            {/* Lowest wing brake accumulator pressure (l.81241) */}
            <GaugeMarkerComponent
              x={0}
              y={0}
              min={GAUGE_MIN}
              radius={GAUGE_RADIUS}
              max={GAUGE_MAX}
              startAngle={GAUGE_START}
              endAngle={GAUGE_END}
              value={indication.needleKpsi}
              className={needleClassName}
              multiplierInner={0.8}
              multiplierOuter={1.2}
              indicator
              halfIndicator
            />
          </GaugeComponent>
        </GaugeComponent>
      </GaugeComponent>

      <text className="F22 White LS1" x={-27} y={-1}>
        WING
      </text>
      <text className="F22 White LS1" x={-29} y={21}>
        ACCU
      </text>
      <text className="F22 Cyan WS-8" x={-62} y={44}>
        X 1000 PSI
      </text>
    </g>
  );
};
