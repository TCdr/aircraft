// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { fcomAt, fcomCentre, fcomLine } from '../../common/FcomLayout';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';

import './MfdFmsDataPrinter.scss';

interface MfdFmsDataPrinterProps extends AbstractMfdPageProps {}

/** Printer options of the FMS, shared by both MFDs */
const autoPrintOptions = {
  cpnyInit: Subject.create(false),
  cpnyTakeoff: Subject.create(false),
  cpnyWind: Subject.create(false),
  preFlight: Subject.create(false),
  inFlight: Subject.create(false),
  postFlight: Subject.create(false),
};

/**
 * DATA / PRINTER page (A380 FCOM DSC-22-FMS-20-30 P 75-78): manual printing of the active flight plan data and of the
 * flight plan reports, and the automatic printing options.
 *
 * The cockpit printer is not modelled: the PRINT buttons are inactive, the AUTO PRINT options are kept but print nothing.
 */
export class MfdFmsDataPrinter extends FmsPage<MfdFmsDataPrinterProps> {
  private readonly noPrinter = Subject.create(true);

  protected onNewData(): void {
    // The page has no flight plan data
  }

  private printButton(y: number, x: number): VNode {
    return fcomAt(
      y,
      x,
      <Button label="PRINT*" disabled={this.noPrinter} onClick={() => {}} buttonStyle="width: 87px; height: 24px;" />,
    );
  }

  private static checkbox(y: number, x: number, option: Subject<boolean>): VNode {
    return fcomCentre(
      y,
      x,
      <div class={{ 'mfd-printer-checkbox': true, checked: option }} onClick={() => option.set(!option.get())} />,
    );
  }

  render(): VNode {
    const checkbox = MfdFmsDataPrinter.checkbox;
    return (
      <>
        {super.render()}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 75), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {fcomCentre(30, 180, <span class="mfd-label">ACTIVE DATA</span>)}
            {fcomCentre(30, 565, <span class="mfd-label">CPNY DATA</span>)}
            {fcomCentre(72, 565, <span class="mfd-label">AUTO PRINT ON RECEPTION</span>)}
            <div class="mfd-printer-separator" />
            {fcomAt(129, 48, <span class="mfd-label">F-PLN INIT</span>)}
            {this.printButton(129, 235)}
            {fcomAt(189, 48, <span class="mfd-label">T.O DATA</span>)}
            {this.printButton(189, 235)}
            {fcomAt(250, 48, <span class="mfd-label">WIND DATA</span>)}
            {this.printButton(250, 235)}
            {fcomAt(129, 413, <span class="mfd-label">F-PLN INIT</span>)}
            {checkbox(129, 668, autoPrintOptions.cpnyInit)}
            {fcomAt(189, 413, <span class="mfd-label">T.O DATA</span>)}
            {checkbox(189, 668, autoPrintOptions.cpnyTakeoff)}
            {fcomAt(250, 413, <span class="mfd-label">WIND DATA</span>)}
            {checkbox(250, 668, autoPrintOptions.cpnyWind)}
            {fcomLine(289, 12, 756)}

            {fcomAt(329, 39, <span class="mfd-label">ACTIVE F-PLN REPORT</span>)}
            {fcomCentre(329, 609, <span class="mfd-label">AUTO PRINT</span>)}
            {fcomAt(387, 95, <span class="mfd-label">PRE-FLIGHT</span>)}
            {this.printButton(387, 337)}
            {checkbox(387, 596, autoPrintOptions.preFlight)}
            {fcomAt(446, 95, <span class="mfd-label">IN-FLIGHT</span>)}
            {this.printButton(446, 337)}
            {checkbox(446, 596, autoPrintOptions.inFlight)}
            {fcomAt(507, 95, <span class="mfd-label">POST-FLIGHT</span>)}
            {this.printButton(507, 337)}
            {checkbox(507, 596, autoPrintOptions.postFlight)}
            {fcomLine(547, 12, 756)}

            {fcomAt(589, 60, <span class="mfd-label">SEC F-PLN REPORT</span>)}
            {fcomAt(646, 95, <span class="mfd-label">SEC 1</span>)}
            {this.printButton(646, 337)}
            {fcomAt(707, 95, <span class="mfd-label">SEC 2</span>)}
            {this.printButton(707, 337)}
            {fcomAt(766, 95, <span class="mfd-label">SEC 3</span>)}
            {this.printButton(766, 337)}
          </div>
        </div>
        <Footer
          bus={this.props.bus}
          mfd={this.props.mfd}
          fmcService={this.props.fmcService}
          flightPlanInterface={this.props.fmcService.master.flightPlanInterface}
        />
      </>
    );
  }
}
