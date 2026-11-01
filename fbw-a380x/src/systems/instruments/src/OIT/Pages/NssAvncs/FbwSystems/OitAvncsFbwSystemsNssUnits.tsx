//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ConsumerSubject, FSComponent, MappedSubject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { OitSimvars } from '../../../OitSimvarPublisher';
import { nssRouterState, nssRouterStateLabel } from '../../../System/NssRouterLogic';

const onlineText = (healthy: boolean) => (healthy ? 'ONLINE' : 'OFFLINE');

const routerText = ([powered, operating]: readonly [boolean, boolean]) =>
  nssRouterStateLabel(nssRouterState(powered, operating));

interface NssUnitsRowProps {
  readonly name: string;
  readonly state: Subscribable<string>;
}

class NssUnitsRow extends DestroyableComponent<NssUnitsRowProps> {
  render(): VNode {
    return (
      <div class="fr ass">
        <div class="oit-ccom-inbox-msg-table-line tc f1">{this.props.name}</div>
        <div class="oit-ccom-inbox-msg-table-line oit-green-text f1">{this.props.state}</div>
      </div>
    );
  }
}

/**
 * The state of the NSS AVNCS units behind the applications: the two ANSUs, the two routers (ARU), the secure interface
 * router (SIRU) and the link to the FLT OPS network. On the real aircraft only maintenance sees these units, so the page
 * sits in the A380X SYSTEMS folder of the simulator.
 */
export class OitAvncsFbwSystemsNssUnits extends DestroyableComponent<AbstractOitAvncsPageProps> {
  private readonly sub = this.props.bus.getSubscriber<OitSimvars>();

  private readonly ansu1Healthy = ConsumerSubject.create(this.sub.on('nssAnsu1Healthy'), false);
  private readonly ansu2Healthy = ConsumerSubject.create(this.sub.on('nssAnsu2Healthy'), false);
  private readonly aru1Powered = ConsumerSubject.create(this.sub.on('nssAru1Powered'), false);
  private readonly aru1Operating = ConsumerSubject.create(this.sub.on('nssAru1Operating'), false);
  private readonly aru2Powered = ConsumerSubject.create(this.sub.on('nssAru2Powered'), false);
  private readonly aru2Operating = ConsumerSubject.create(this.sub.on('nssAru2Operating'), false);
  private readonly siruPowered = ConsumerSubject.create(this.sub.on('nssSiruPowered'), false);

  private readonly ansu1Text = this.ansu1Healthy.map(onlineText);
  private readonly ansu2Text = this.ansu2Healthy.map(onlineText);

  private readonly aru1Text = MappedSubject.create(routerText, this.aru1Powered, this.aru1Operating);
  private readonly aru2Text = MappedSubject.create(routerText, this.aru2Powered, this.aru2Operating);

  private readonly siruText = this.siruPowered.map((powered) => (powered ? 'POWERED' : 'OFF'));

  // The link to the FLT OPS network hangs off ARU 2
  private readonly fltOpsLinkText = this.aru2Operating.map((operating) => (operating ? 'AVAILABLE' : 'LOST'));

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(
      this.ansu1Healthy,
      this.ansu2Healthy,
      this.aru1Powered,
      this.aru1Operating,
      this.aru2Powered,
      this.aru2Operating,
      this.siruPowered,
      this.ansu1Text,
      this.ansu2Text,
      this.aru1Text,
      this.aru2Text,
      this.siruText,
      this.fltOpsLinkText,
    );
  }

  render(): VNode {
    return (
      <>
        <div class="oit-ccom-headline">NSS AVNCS Units</div>
        <div class="oit-ccom-inbox-msg-table">
          <div class="fr ass">
            <div class="oit-ccom-inbox-msg-table-header oit-table-ib f1">Unit</div>
            <div class="oit-ccom-inbox-msg-table-header oit-table-ib f1">State</div>
          </div>
          <NssUnitsRow name="ANSU 1" state={this.ansu1Text} />
          <NssUnitsRow name="ANSU 2" state={this.ansu2Text} />
          <NssUnitsRow name="ARU 1" state={this.aru1Text} />
          <NssUnitsRow name="ARU 2" state={this.aru2Text} />
          <NssUnitsRow name="SIRU" state={this.siruText} />
          <NssUnitsRow name="Link to FLT OPS network" state={this.fltOpsLinkText} />
        </div>
        <div style="flex-grow: 1" />
      </>
    );
  }
}
