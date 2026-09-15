//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0
import { FSComponent, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';

import { PageTitle } from '../Generic/PageTitle';
import { SdPageProps } from '../../SD';
import { ElacComputerIndicator, SecComputerIndicator } from './elements/ComputerIndicator';
import { Aileron } from './elements/Aileron';
import { Elevator } from './elements/Elevator';
import { Rudder } from './elements/Rudder';
import { PitchTrim } from './elements/PitchTrim';
import { Wings } from './elements/Wings';

export class FctlPage extends DestroyableComponent<SdPageProps> {
  private readonly topSvgDisplay = this.props.visible.map((v) => (v ? 'inline' : 'none'));

  private readonly elac1Ref = FSComponent.createRef<ElacComputerIndicator>();

  private readonly elac2Ref = FSComponent.createRef<ElacComputerIndicator>();

  private readonly sec1Ref = FSComponent.createRef<SecComputerIndicator>();

  private readonly sec2Ref = FSComponent.createRef<SecComputerIndicator>();

  private readonly sec3Ref = FSComponent.createRef<SecComputerIndicator>();

  private readonly wingsRef = FSComponent.createRef<Wings>();

  private readonly aileronLeftRef = FSComponent.createRef<Aileron>();

  private readonly aileronRightRef = FSComponent.createRef<Aileron>();

  private readonly elevatorLeftRef = FSComponent.createRef<Elevator>();

  private readonly elevatorRightRef = FSComponent.createRef<Elevator>();

  private readonly pitchTrimRef = FSComponent.createRef<PitchTrim>();

  private readonly rudderRef = FSComponent.createRef<Rudder>();

  onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(this.topSvgDisplay);

    this.childComponents.push(
      ...[
        this.elac1Ref,
        this.elac2Ref,
        this.sec1Ref,
        this.sec2Ref,
        this.sec3Ref,
        this.wingsRef,
        this.aileronLeftRef,
        this.aileronRightRef,
        this.elevatorLeftRef,
        this.elevatorRightRef,
        this.pitchTrimRef,
        this.rudderRef,
      ]
        .map((ref) => ref.getOrDefault())
        .filter((c) => c !== null),
    );
  }

  destroy(): void {
    super.destroy();
  }

  render() {
    return (
      <svg
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        viewBox="0 0 768 768"
        style={{ display: this.topSvgDisplay }}
      >
        <PageTitle x={8} y={33}>
          F/CTL
        </PageTitle>

        <text class="White F22" x={221} y={226}>
          ELAC
        </text>
        <ElacComputerIndicator ref={this.elac1Ref} bus={this.props.bus} x={215} y={234} num={1} />
        <ElacComputerIndicator ref={this.elac2Ref} bus={this.props.bus} x={245} y={252} num={2} />

        <text class="White F22 LS1" x={408} y={226}>
          SEC
        </text>
        <SecComputerIndicator ref={this.sec1Ref} bus={this.props.bus} x={395} y={234} num={1} />
        <SecComputerIndicator ref={this.sec2Ref} bus={this.props.bus} x={425} y={252} num={2} />
        <SecComputerIndicator ref={this.sec3Ref} bus={this.props.bus} x={455} y={270} num={3} />

        <Wings ref={this.wingsRef} bus={this.props.bus} x={124} y={11} />

        <Aileron ref={this.aileronLeftRef} bus={this.props.bus} x={88} y={197} side="left" />
        <Aileron ref={this.aileronRightRef} bus={this.props.bus} x={678} y={197} side="right" />

        <Elevator ref={this.elevatorLeftRef} bus={this.props.bus} x={212} y={424} side="left" />
        <Elevator ref={this.elevatorRightRef} bus={this.props.bus} x={555} y={424} side="right" />

        <PitchTrim ref={this.pitchTrimRef} bus={this.props.bus} x={356} y={350} />

        <Rudder ref={this.rudderRef} bus={this.props.bus} x={384} y={454} />
      </svg>
    );
  }
}
