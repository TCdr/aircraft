//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ClockEvents, FSComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { OitAvncsSubHeader } from '../OitAvncsSubHeader';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import {
  REFUEL_ZF_DATA_CLEARED,
  RefuelWeightUnit,
  RefuelZfData,
  enteredRefuelZfData,
  formatRefuelWeight,
  formatZfcg,
  parsePreselectedFuel,
  parseRefuelZfData,
  refuelState,
} from '../../../System/OisRefuel';

interface OitAvncsRefuelProps extends AbstractOitAvncsPageProps {}

/** The PFQ and ZFW entries, whole kg or lb */
const WEIGHT_ENTRY_LENGTH = 6;

/** The ZFCG entry, % MAC with one decimal */
const ZFCG_ENTRY_LENGTH = 4;

/** The page of the drafts */
const REFUEL_PAGE = 'nss-avncs/refuel';

/**
 * NSS AVNCS > REFUEL: the preselected fuel quantity of the automatic refuel, and the ZFW / ZFCG of the CG targeting of
 * the FQMS: an entry of the REFUEL application, or the FQMS default data (OisRefuel). Design choice: a plain page in the
 * OIT style, as there is no reference layout.
 */
export class OitAvncsRefuel extends DestroyableComponent<OitAvncsRefuelProps> {
  // Make sure to collect all subscriptions in this.subscriptions, otherwise page navigation doesn't work.

  private readonly sci = this.props.container.ansu.sci;

  private readonly unit: RefuelWeightUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').get() ? 'KG' : 'LB';

  private readonly preselectedFuelKg = Subject.create<number | null>(null);

  private readonly refuelStarted = Subject.create(false);

  private readonly zeroFuelWeightKg = Subject.create<number | null>(null);

  private readonly zeroFuelWeightCg = Subject.create<number | null>(null);

  private readonly fuelOnBoardKg = this.sci.fqmsFuelQuantity.map((word) => word.valueOr(null));

  private readonly fuelOnBoardText = this.fuelOnBoardKg.map((kg) => formatRefuelWeight(kg, this.unit));

  private readonly preselectedFuelText = this.preselectedFuelKg.map((kg) => formatRefuelWeight(kg, this.unit));

  private readonly zeroFuelWeightText = this.zeroFuelWeightKg.map((kg) => formatRefuelWeight(kg, this.unit));

  private readonly zeroFuelWeightCgText = this.zeroFuelWeightCg.map(formatZfcg);

  private readonly refuelZfData = Subject.create<RefuelZfData | null>(null);

  private readonly refuelZfwText = this.refuelZfData.map((data) => formatRefuelWeight(data?.zfwKg ?? null, this.unit));

  private readonly refuelZfcgText = this.refuelZfData.map((data) => formatZfcg(data?.zfcgPercentMac ?? null));

  private readonly stateText = MappedSubject.create(
    ([started, fob, pfq]) => refuelState(started, fob, pfq),
    this.refuelStarted,
    this.fuelOnBoardKg,
    this.preselectedFuelKg,
  );

  /**
   * Design choice: the PFQ is entered on the ground only; the refuel is a ground operation and the FQMS uses no PFQ in
   * flight.
   */
  private readonly entryDisabled = this.sci.onGround.map((onGround) => !onGround);

  /** The entries stay while REFUEL is open: the page is drawn again at each return to it */
  private readonly drafts = this.props.container.ansu.pageDrafts;

  private readonly preselectedFuelEntry = this.drafts.field<string | null>(REFUEL_PAGE, 'pfq', null);

  private readonly entryMessage = Subject.create('');

  private readonly zfwEntry = this.drafts.field<string | null>(REFUEL_PAGE, 'zfw', null);

  private readonly zfcgEntry = this.drafts.field<string | null>(REFUEL_PAGE, 'zfcg', null);

  private readonly zfDataMessage = Subject.create('');

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.readSimVars();
    this.subscriptions.push(
      this.fuelOnBoardKg,
      this.fuelOnBoardText,
      this.preselectedFuelText,
      this.zeroFuelWeightText,
      this.zeroFuelWeightCgText,
      this.refuelZfwText,
      this.refuelZfcgText,
      this.stateText,
      this.entryDisabled,
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('simTime')
        .atFrequency(1)
        .handle(() => this.readSimVars()),
    );
  }

  private readSimVars(): void {
    this.preselectedFuelKg.set(SimVar.GetSimVarValue('L:A32NX_FUEL_DESIRED', 'kilograms'));
    this.refuelStarted.set(SimVar.GetSimVarValue('L:A32NX_REFUEL_STARTED_BY_USR', 'bool') > 0);
    this.zeroFuelWeightKg.set(SimVar.GetSimVarValue('L:A32NX_AIRFRAME_ZFW_DESIRED', 'number'));
    this.zeroFuelWeightCg.set(SimVar.GetSimVarValue('L:A32NX_AIRFRAME_ZFW_CG_PERCENT_MAC_DESIRED', 'number'));
    this.refuelZfData.set(
      enteredRefuelZfData(
        SimVar.GetSimVarValue('L:A32NX_FUEL_REFUEL_ZFW', 'number'),
        SimVar.GetSimVarValue('L:A32NX_FUEL_REFUEL_ZFCG', 'number'),
      ),
    );
  }

  private writeRefuelZfData(data: RefuelZfData): void {
    SimVar.SetSimVarValue('L:A32NX_FUEL_REFUEL_ZFW', 'number', data.zfwKg);
    SimVar.SetSimVarValue('L:A32NX_FUEL_REFUEL_ZFCG', 'number', data.zfcgPercentMac);
    this.refuelZfData.set(enteredRefuelZfData(data.zfwKg, data.zfcgPercentMac));
  }

  private setRefuelZfData(): void {
    const { data, error } = parseRefuelZfData(this.zfwEntry.get(), this.zfcgEntry.get(), this.unit);
    if (data === null) {
      this.zfDataMessage.set(error ?? '');
      return;
    }
    this.writeRefuelZfData(data);
    this.zfwEntry.set(null);
    this.zfcgEntry.set(null);
    this.zfDataMessage.set('');
  }

  /** FQMS DEFAULT: the FQMS goes back to its default data */
  private clearRefuelZfData(): void {
    this.writeRefuelZfData(REFUEL_ZF_DATA_CLEARED);
    this.zfDataMessage.set('');
  }

  private setPreselectedFuel(): void {
    const capacityKg =
      SimVar.GetSimVarValue('FUEL TOTAL CAPACITY', 'gallons') *
      SimVar.GetSimVarValue('FUEL WEIGHT PER GALLON', 'kilograms');
    const kg = parsePreselectedFuel(this.preselectedFuelEntry.get(), this.unit, capacityKg);
    if (kg === null) {
      this.entryMessage.set(`ENTRY OUT OF RANGE (0 - ${formatRefuelWeight(capacityKg, this.unit)})`);
      return;
    }
    SimVar.SetSimVarValue('L:A32NX_FUEL_DESIRED', 'kilograms', kg);
    this.preselectedFuelKg.set(kg);
    this.preselectedFuelEntry.set(null);
    this.entryMessage.set('');
  }

  /**
   * @param label the value and its unit
   * @param entry the new entry
   * @param entryLength the characters of the entry
   * @param entered the value the FQMS has from this application
   * @param fqmsDefault the default value of the FQMS
   * @returns a row of the ZF data box
   */
  private renderZfRow(
    label: string,
    entry: Subject<string | null>,
    entryLength: number,
    entered: Subscribable<string>,
    fqmsDefault: Subscribable<string>,
  ): VNode {
    return (
      <div style="display: flex; flex-direction: row; align-items: center; height: 50px;">
        <span class="oit-label" style="width: 200px;">
          {label}
        </span>
        <InputField<string>
          dataEntryFormat={new FreeTextFormat(entryLength)}
          value={entry}
          disabled={this.entryDisabled}
          containerStyle="width: 200px; margin-right: 40px;"
          alignText="flex-end"
          canBeCleared={true}
          hEventConsumer={this.props.container.hEventConsumer}
          interactionMode={this.props.container.interactionMode}
          errorHandler={() => {}}
        />
        <span class="oit-label green" style="width: 240px;">
          {entered}
        </span>
        <span class="oit-label green" style="width: 240px;">
          {fqmsDefault}
        </span>
      </div>
    );
  }

  private renderValue(label: string, value: Subscribable<string>): VNode {
    return (
      <div style="display: flex; flex-direction: row; align-items: center; height: 44px;">
        <span class="oit-label" style="width: 260px;">
          {label}
        </span>
        <span class="oit-label green">{value}</span>
      </div>
    );
  }

  render(): VNode {
    return (
      <>
        <OitAvncsSubHeader title={'REFUEL'} uiService={this.props.uiService} />
        <div class="oit-page-container" style="padding: 10px 40px;">
          <div class="oit-labeled-box-container">
            <span class="oit-labeled-box-label">Fuel</span>
            {this.renderValue('FOB', this.fuelOnBoardText)}
            {this.renderValue('PRESELECTED (PFQ)', this.preselectedFuelText)}
            {this.renderValue('REFUEL', this.stateText)}
            <div style="display: flex; flex-direction: row; align-items: center; margin-top: 10px;">
              <span class="oit-label" style="width: 260px;">
                NEW PFQ ({this.unit})
              </span>
              <InputField<string>
                dataEntryFormat={new FreeTextFormat(WEIGHT_ENTRY_LENGTH)}
                value={this.preselectedFuelEntry}
                disabled={this.entryDisabled}
                containerStyle="width: 200px; margin-right: 30px;"
                alignText="flex-end"
                canBeCleared={true}
                hEventConsumer={this.props.container.hEventConsumer}
                interactionMode={this.props.container.interactionMode}
                errorHandler={() => {}}
              />
              <Button label="SET" disabled={this.entryDisabled} onClick={() => this.setPreselectedFuel()} />
            </div>
            <div class="oit-label amber" style="margin-top: 6px; min-height: 30px;">
              {this.entryMessage}
            </div>
          </div>
          <div class="oit-labeled-box-container">
            <span class="oit-labeled-box-label">ZF data of the CG targeting</span>
            <div style="display: flex; flex-direction: row; align-items: center; height: 36px;">
              <span class="oit-label" style="width: 200px;" />
              <span class="oit-label" style="width: 240px;">
                NEW
              </span>
              <span class="oit-label" style="width: 240px;">
                REFUEL ENTRY
              </span>
              <span class="oit-label" style="width: 240px;">
                FQMS DEFAULT
              </span>
            </div>
            {this.renderZfRow(
              `ZFW (${this.unit})`,
              this.zfwEntry,
              WEIGHT_ENTRY_LENGTH,
              this.refuelZfwText,
              this.zeroFuelWeightText,
            )}
            {this.renderZfRow(
              'ZFCG (%)',
              this.zfcgEntry,
              ZFCG_ENTRY_LENGTH,
              this.refuelZfcgText,
              this.zeroFuelWeightCgText,
            )}
            <div style="display: flex; flex-direction: row; align-items: center; margin-top: 10px;">
              <span class="oit-label" style="width: 200px;" />
              <Button label="SET" disabled={this.entryDisabled} onClick={() => this.setRefuelZfData()} />
              <div style="width: 20px;" />
              <Button label="FQMS DEFAULT" disabled={this.entryDisabled} onClick={() => this.clearRefuelZfData()} />
            </div>
            <div class="oit-label amber" style="margin-top: 6px; min-height: 30px;">
              {this.zfDataMessage}
            </div>
          </div>
          <div style="flex-grow: 1" />
        </div>
      </>
    );
  }
}
