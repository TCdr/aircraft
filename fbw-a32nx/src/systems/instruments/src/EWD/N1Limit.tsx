// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, EventBus, DisplayComponent, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { EwdSimvars } from './shared/EwdSimvarPublisher';
import { Arinc429Values } from './shared/ArincValueProvider';
import { Layer } from '../MsfsAvionicsCommon/Layer';
import { flexTemperatureText, isThrustLimitValueVisible, thrustRatingModeLabel } from './EngineIndications';

const HUGE_LABEL_CLASS = 'Huge Center Cyan';
const LARGE_LABEL_CLASS = 'Large Center Cyan';
/** TOGA, DCLB and MREV are four characters: the longest label that fits the slot in the Huge font */
const LONGEST_HUGE_LABEL_LENGTH = 4;

interface N1LimitProps {
  bus: EventBus;
}
export class N1Limit extends DisplayComponent<N1LimitProps> {
  private inactiveVisibility = Subject.create('hidden');

  private activeVisibility = Subject.create('hidden');

  private flexVisibility = Subject.create('hidden');

  /** The N1 limit value, hidden with the thrust reversers selected (EngineIndications.ts) */
  private limitValueVisibility = Subject.create('hidden');

  private textThrustLimitType = Subject.create('');

  /** A long rating label (GA SOFT) is set in a smaller font so that it stays inside the display next to the N1 limit value */
  private textThrustLimitTypeClass = Subject.create(HUGE_LABEL_CLASS);

  private textThrustLimitInt = Subject.create('');

  private textThrustLimitFract = Subject.create('');

  private textFlexTemp = Subject.create('');

  private engine1Fadec: boolean = false;

  private engine2Fadec: boolean = false;

  private autoThrustLimit: number = 0;

  private thrustLimitType: number = 0;

  private flexTemp: number = 0;

  private takeoffDerate: number = 0;

  private deratedClimbPercent: number = 0;

  private gaSoftActive: boolean = false;

  private sat = new Arinc429Word(0);

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<Arinc429Values & ClockEvents & EwdSimvars>();

    sub
      .on('engine1Fadec')
      .whenChanged()
      .handle((f) => {
        this.engine1Fadec = f;
      });

    sub
      .on('engine2Fadec')
      .whenChanged()
      .handle((f) => {
        this.engine2Fadec = f;
      });

    sub
      .on('autoThrustLimit')
      .whenChanged()
      .handle((l) => {
        this.autoThrustLimit = Math.abs(l);
      });

    sub
      .on('thrustLimitType')
      .whenChanged()
      .handle((l) => {
        this.thrustLimitType = l;
      });

    sub
      .on('flexTemp')
      .whenChanged()
      .handle((c) => {
        this.flexTemp = c;
      });

    sub
      .on('takeoffDerate')
      .whenChanged()
      .handle((d) => {
        this.takeoffDerate = d;
      });

    sub
      .on('deratedClimbPercent')
      .whenChanged()
      .handle((d) => {
        this.deratedClimbPercent = d;
      });

    sub
      .on('gaSoftActive')
      .whenChanged()
      .handle((a) => {
        this.gaSoftActive = a > 0;
      });

    sub
      .on('sat')
      .whenChanged()
      .handle((sat) => {
        this.sat = sat;
      });

    sub
      .on('realTime')
      .atFrequency(2)
      .handle((_t) => {
        const isActive = this.engine1Fadec || this.engine2Fadec;
        if (isActive) {
          this.inactiveVisibility.set('hidden');
          this.activeVisibility.set('visible');

          const ratingLabel = thrustRatingModeLabel(
            this.thrustLimitType,
            this.takeoffDerate,
            this.deratedClimbPercent,
            this.gaSoftActive,
          );
          this.textThrustLimitType.set(ratingLabel);
          this.textThrustLimitTypeClass.set(
            ratingLabel.length > LONGEST_HUGE_LABEL_LENGTH ? LARGE_LABEL_CLASS : HUGE_LABEL_CLASS,
          );

          const n1Limit = this.autoThrustLimit.toFixed(1).split('.', 2);
          this.textThrustLimitInt.set(n1Limit[0]);
          this.textThrustLimitFract.set(n1Limit[1]);
          // 'inherit', not 'visible': a visible SVG child shows inside a hidden parent (unpowered FADEC XX)
          this.limitValueVisibility.set(isThrustLimitValueVisible(this.thrustLimitType) ? 'inherit' : 'hidden');

          const flexText = flexTemperatureText(
            this.flexTemp,
            this.thrustLimitType,
            this.sat.isNormalOperation(),
            this.sat.value,
          );
          this.flexVisibility.set(flexText !== null ? 'inherit' : 'hidden');
          this.textFlexTemp.set(flexText !== null ? flexText : '');
        } else {
          this.inactiveVisibility.set('visible');
          this.activeVisibility.set('hidden');
        }
      });
  }

  render(): VNode {
    return (
      <Layer x={698} y={28}>
        <g visibility={this.inactiveVisibility}>
          <text class="Large Center Amber" x={0} y={0}>
            XX
          </text>
          <text class="Large Center Amber" x={0} y={28}>
            XX
          </text>
        </g>
        <g visibility={this.activeVisibility}>
          <text class={this.textThrustLimitTypeClass} x={0} y={-1}>
            {this.textThrustLimitType}
          </text>
          <g visibility={this.limitValueVisibility}>
            <text class="Huge End Green" x={5} y={28}>
              {this.textThrustLimitInt}
            </text>
            <text class="Large End Green" x={18} y={28}>
              .
            </text>
            <text class="Standard End Green" x={34} y={28}>
              {this.textThrustLimitFract}
            </text>
            <text class="Medium End Cyan" x={49} y={27}>
              %
            </text>
          </g>

          <g visibility={this.flexVisibility}>
            <text class="Standard Cyan" x={-23} y={57}>
              {this.textFlexTemp}
              &deg;C
            </text>
          </g>
        </g>
      </Layer>
    );
  }
}
