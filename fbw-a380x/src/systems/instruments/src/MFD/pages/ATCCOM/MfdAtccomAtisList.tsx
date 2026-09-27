// Copyright (c) 2025-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import './MfdAtccomAtis.scss';

import { AtccomMfdPageProps } from '../../MFD';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { fcomAt, fcomLine } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { AtccomFooter } from './MfdAtccomFooter';
import { AtisRequestArea } from './AtisRequestArea';

/**
 * ATIS/LIST page (A380 FCOM DSC-46-10-20-30 P 30-34), laid out on the FCOM figure (page coordinates = display y - 143):
 * three ATIS request areas of 250 px, PRINT ALL and UPDATE ALL.
 */
export class MfdAtccomAtisList extends DisplayComponent<AtccomMfdPageProps> {
  render(): VNode {
    return (
      <>
        <ActivePageTitleBar activePage={Subject.create(this.props.pageTitle ?? '')} offset={Subject.create('')} />
        {/* begin page content */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-atccom-atis">
            {[0, 1, 2].map((index) => (
              <AtisRequestArea
                bus={this.props.bus}
                mfd={this.props.mfd}
                atcService={this.props.atcService}
                index={index}
                top={-3 + 250 * index}
              />
            ))}
            {fcomLine(248, 0, 768)}
            {fcomLine(498, 0, 768)}
            {fcomLine(748, 0, 768)}
            {fcomAt(
              784,
              385,
              <Button
                label={'PRINT\nALL'}
                onClick={() => this.props.atcService.printAllAtis()}
                buttonStyle="width: 187px; height: 57px;"
              />,
            )}
            {fcomAt(
              784,
              576,
              <Button
                label={'UPDATE\nALL'}
                onClick={() => this.props.atcService.updateAllAtis()}
                buttonStyle="width: 187px; height: 57px;"
              />,
            )}
          </div>
        </div>
        {/* end page content */}
        <AtccomFooter bus={this.props.bus} mfd={this.props.mfd} atcService={this.props.atcService} />
      </>
    );
  }
}
