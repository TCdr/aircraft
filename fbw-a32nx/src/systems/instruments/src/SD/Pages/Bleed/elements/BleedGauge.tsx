// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { GaugeComponent, GaugeMarkerComponent } from '@instruments/common/gauges';
import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import Valve from './Valve';
import { packOutletTemperatureDisplay } from './PackOutletTemperature';

interface BleedGaugeProps {
  x: number;
  y: number;
  engine: number;
  sdacDatum: boolean;
  packFlowValveOpen: boolean;
}

const BleedGauge: FC<BleedGaugeProps> = ({ x, y, engine, sdacDatum, packFlowValveOpen }) => {
  // TODO
  // Pack compressor outlet temp, pack inlet flow rate and pack bypass valve should be revised once the packs are modelled
  const [precoolerOutletTemp] = useSimVar(
    `L:A32NX_PNEU_ENG_${engine}_BLEED_TEMPERATURE_SENSOR_TEMPERATURE`,
    'celsius',
    500,
  );
  const compressorOutletTemp = Math.round(precoolerOutletTemp / 5) * 5;
  const compressorOutletTempAmber = compressorOutletTemp > 260;
  const isPrecoolerOutletTempValid = precoolerOutletTemp > -100;

  const [packInletFlowPercentage] = useSimVar(`L:A32NX_COND_PACK_FLOW_${engine}`, 'percent', 500);

  const [fwdCondSelectorKnob] = useSimVar('L:A32NX_OVHD_COND_FWD_SELECTOR_KNOB', 'number', 1000); // 0 to 300
  const packBypassValve = Math.round((fwdCondSelectorKnob / 300) * 100);
  // The pack of this side: pack 1 is supplied from engine 1's side, pack 2 from engine 2's
  const [packOutletTempCelsius] = useSimVar(`L:A32NX_COND_PACK_${engine}_OUTLET_TEMPERATURE`, 'number', 1000);
  const packOutletTemp = packOutletTemperatureDisplay(packOutletTempCelsius);

  const radius = 38;
  const startAngle = -63;
  const endAngle = 63;
  const min = 80;
  const max = 120;
  const minBypass = 0;
  const maxBypass = 100;

  return (
    <g id={`Engine${engine}AirCond`}>
      {/* Pack Outlet Temp */}
      <text
        className={`Large End ${sdacDatum && !packOutletTemp.amber ? 'Green' : 'Amber'}`}
        x={sdacDatum ? x + 15 : x + 12}
        y={y - 117}
      >
        {sdacDatum ? packOutletTemp.value : 'XX'}
      </text>
      <text x={x + 20} y={y - 117} className="Cyan Standard">
        °C
      </text>

      {/* Bypass valve */}
      <GaugeComponent
        x={x}
        y={y - 69}
        radius={radius}
        startAngle={startAngle}
        endAngle={endAngle}
        visible
        className="GaugeComponent Gauge"
      >
        <GaugeMarkerComponent
          value={50}
          x={x}
          y={y - 69}
          min={minBypass}
          max={maxBypass}
          radius={radius}
          startAngle={startAngle}
          endAngle={endAngle}
          className="WhiteStroke Stroke2"
          showValue={false}
          outer
          multiplierOuter={1.1}
        />
        {sdacDatum && (
          <GaugeMarkerComponent
            value={packBypassValve}
            x={x}
            y={y - 69}
            min={minBypass}
            max={maxBypass}
            radius={radius}
            startAngle={startAngle}
            endAngle={endAngle}
            className="GaugeIndicator Gauge LineCapRound"
            indicator
            multiplierOuter={1.1}
          />
        )}
      </GaugeComponent>
      {!sdacDatum && (
        <text className="Large Amber End" x={x + 12} y={y - 85}>
          XX
        </text>
      )}

      {/* Compressor Outlet Temp */}
      <text
        className={`Large End ${compressorOutletTempAmber || !sdacDatum || !isPrecoolerOutletTempValid ? 'Amber' : 'Green'}`}
        x={sdacDatum ? x + 15 : x + 12}
        y={y - 47}
      >
        {sdacDatum && isPrecoolerOutletTempValid ? compressorOutletTemp : 'XX'}
      </text>
      <text x={x + 20} y={y - 47} className="Cyan Standard">
        °C
      </text>

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
        <GaugeMarkerComponent
          value={100}
          x={x}
          y={y}
          min={min}
          max={max}
          radius={radius}
          startAngle={startAngle}
          endAngle={endAngle}
          className="WhiteStroke Stroke2"
          showValue={false}
          outer
          multiplierOuter={1.1}
        />
        {sdacDatum && (
          <GaugeMarkerComponent
            value={packInletFlowPercentage < 80 ? 80 : packInletFlowPercentage}
            x={x}
            y={y}
            min={min}
            max={max}
            radius={radius}
            startAngle={startAngle}
            endAngle={endAngle}
            className={`${packFlowValveOpen ? 'GaugeIndicator' : 'AmberLine Stroke3'} Gauge LineCapRound`}
            indicator
            multiplierOuter={1.1}
          />
        )}
      </GaugeComponent>
      {!sdacDatum && (
        <text className="Standard Amber End" x={x + 12} y={y - 20}>
          XX
        </text>
      )}

      {/* Flow control valve */}
      <Valve
        x={x}
        y={y}
        radius={15}
        css="GreenLine BackgroundFill"
        position={packFlowValveOpen ? 'V' : 'H'}
        sdacDatum={sdacDatum}
      />
    </g>
  );
};

export default BleedGauge;
