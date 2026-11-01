//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { OpsLibraryViewProps } from './OpsLibraryContext';
import { revisionDateText } from '../../../System/OpsLibrary/OpsLibraryContent';
import './ops-library.scss';

interface OpsLibraryAboutTabProps extends OpsLibraryViewProps {
  /** The OIS version line of the FLT OPS STS page */
  readonly oisVersion: Subscribable<string>;
}

/** The ABOUT tab: the software version of the laptop and the date of the library content */
export class OpsLibraryAboutTab extends DestroyableComponent<OpsLibraryAboutTabProps> {
  private readonly versionText = this.props.oisVersion.map((version) => `FOCT software version : ${version || '---'}`);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(this.versionText);
  }

  render(): VNode {
    const manuals = this.props.ctx.session.catalog.manuals();
    const newest = manuals.reduce((date, manual) => (manual.revision > date ? manual.revision : date), '');
    return (
      <div class="oit-ops-tab">
        <div class="oit-ops-caption">OPS LIBRARY</div>
        <div>{this.versionText}</div>
        <div>{`Library content : ${manuals.length} manuals, revision ${revisionDateText(newest)}`}</div>
      </div>
    );
  }
}
