// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, EventBus, DisplayComponent, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { EwdSimvars } from './shared/EwdSimvarPublisher';
import { GaugeComponent, GaugeMarkerComponent, GaugeMaxComponent } from '../MsfsAvionicsCommon/gauges';
import { Layer } from '../MsfsAvionicsCommon/Layer';
import {
  EGT_RED_LIMIT_DEGREES,
  ExceedanceMemory,
  egtAmberLimit,
  egtColor,
  isGroundStartSequence,
} from '@shared/EngineLimits';

import './style.scss';

interface EgtProps {
  bus: EventBus;
  x: number;
  y: number;
  engine: 1 | 2;
}
export class Egt extends DisplayComponent<EgtProps> {
  private static readonly GAUGE_MIN = 0;

  private static readonly GAUGE_MAX = 1200;

  private readonly gaugeStartAngle = Subject.create(270);

  // The red line starts at the EGT red limit (975 °C, see @shared/EngineLimits): the gauge sweeps 180 degrees clockwise from
  // 270 over its scale. It started at 70 degrees, about 1067 °C, above the red limit of the EGT colour.
  private readonly gaugeStartAngleRed = Subject.create(
    270 + (EGT_RED_LIMIT_DEGREES / (Egt.GAUGE_MAX - Egt.GAUGE_MIN)) * 180 - 360,
  );

  private readonly gaugeEndAngle = Subject.create(90);

  private inactiveVisibility = Subject.create('hidden');

  private activeVisibility = Subject.create('hidden');

  private thrustLimitType: number = 0;

  private egt: number = 0;

  private egtIndicatorClass = Subject.create('');

  private egtText = Subject.create('');

  private egtValue = Subject.create(0);

  private egtClass = Subject.create('');

  private egtMaxValue = Subject.create(0);

  private engineState = 0;

  private onGround = false;

  /** The red mark at the highest EGT reached above the red limit (FCOM DSC-70-90-40 EGT EXCEEDANCE) */
  private readonly egtExceedance = new ExceedanceMemory(EGT_RED_LIMIT_DEGREES);

  private egtExceedanceValue = Subject.create(0);

  private egtExceedanceClass = Subject.create('Hide');

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ClockEvents & EwdSimvars>();

    sub
      .on(`engine${this.props.engine}Fadec`)
      .whenChanged()
      .handle((f) => {
        this.inactiveVisibility.set(f ? 'hidden' : 'visible');
        this.activeVisibility.set(f ? 'visible' : 'hidden');
      });

    sub
      .on('thrustLimitType')
      .whenChanged()
      .handle((t) => {
        this.thrustLimitType = t;
      });

    sub
      .on(`engine${this.props.engine}EGT`)
      .whenChanged()
      .handle((egt) => {
        this.egt = egt;
        this.egtValue.set(egt);
      });

    sub
      .on(`engine${this.props.engine}State`)
      .whenChanged()
      .handle((state) => {
        this.engineState = state;
      });

    sub
      .on('left1LandingGear')
      .whenChanged()
      .handle((onGround) => {
        this.onGround = onGround;
      });

    sub
      .on('realTime')
      .atFrequency(10)
      .handle((_t) => {
        this.egtMaxValue.set(this.egtMax);
        this.egtExceedance.update(this.egt, isGroundStartSequence(this.engineState, this.onGround));
        this.egtExceedanceValue.set(this.egtExceedance.highestValue);
        this.egtExceedanceClass.set(this.egtExceedance.exceeded ? 'GaugeExceedanceMark' : 'Hide');
        this.egtText.set(Math.round(this.egt).toString());
        this.egtClass.set(`Large End ${this.egtColor}`);
        this.egtIndicatorClass.set(`GaugeIndicator Gauge ${this.egtColor}`);
      });
  }

  /** The amber EGT limit of the thrust limit type (CFM56-5B TCDS values, see @shared/EngineLimits) */
  get egtMax(): number {
    return egtAmberLimit(this.thrustLimitType);
  }

  get egtColor(): string {
    return egtColor(this.egt, this.egtMax);
  }

  render(): VNode {
    const min = Egt.GAUGE_MIN;
    const max = Egt.GAUGE_MAX;
    const radius = 61;

    return (
      <Layer x={this.props.x} y={this.props.y}>
        <g visibility={this.inactiveVisibility}>
          <GaugeComponent
            x={0}
            y={0}
            radius={radius}
            startAngle={this.gaugeStartAngle}
            endAngle={this.gaugeEndAngle}
            class="GaugeComponent GaugeInactive"
          />
          <text class="Large End Amber" x={20} y={6}>
            XX
          </text>
        </g>
        <g visibility={this.activeVisibility}>
          <text class={this.egtClass} x={35} y={6}>
            {this.egtText}
          </text>
          <GaugeComponent
            x={0}
            y={0}
            radius={radius}
            startAngle={this.gaugeStartAngle}
            endAngle={this.gaugeEndAngle}
            class="GaugeComponent Gauge"
          >
            <GaugeComponent
              x={0}
              y={0}
              radius={radius}
              startAngle={this.gaugeStartAngleRed}
              endAngle={this.gaugeEndAngle}
              class="GaugeComponent Gauge RedLine"
            />

            <GaugeMarkerComponent
              value={Subject.create(min)}
              x={0}
              y={0}
              min={min}
              max={max}
              radius={radius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge Medium"
            />
            <GaugeMarkerComponent
              value={Subject.create(600)}
              x={0}
              y={0}
              min={min}
              max={max}
              radius={radius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge"
            />
            <GaugeMarkerComponent
              value={Subject.create(max)}
              x={0}
              y={0}
              min={min}
              max={max}
              radius={radius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeText Gauge RedLine"
            />

            <GaugeMarkerComponent
              value={this.egtMaxValue}
              x={0}
              y={0}
              min={min}
              max={max}
              radius={radius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeThrustLimitIndicator Gauge"
            />
            <GaugeMaxComponent
              value={this.egtMaxValue}
              x={0}
              y={0}
              min={min}
              max={max}
              radius={radius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class="GaugeThrustLimitIndicatorFill Gauge"
            />
            <GaugeMarkerComponent
              value={this.egtExceedanceValue}
              x={0}
              y={0}
              min={min}
              max={max}
              radius={radius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class={this.egtExceedanceClass}
            />

            <rect x={-34} y={-16} width={69} height={24} class="DarkGreyBox" />

            <GaugeMarkerComponent
              value={this.egtValue}
              x={0}
              y={0}
              min={min}
              max={max}
              radius={radius}
              startAngle={this.gaugeStartAngle}
              endAngle={this.gaugeEndAngle}
              class={this.egtIndicatorClass}
              multiplierInner={0.6}
              multiplierOuter={1.08}
              indicator
              halfIndicator
              roundLinecap
            />
          </GaugeComponent>
        </g>
      </Layer>
    );
  }
}
