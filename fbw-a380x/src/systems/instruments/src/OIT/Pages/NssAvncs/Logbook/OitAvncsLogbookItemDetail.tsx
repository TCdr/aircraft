//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, FSComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { OitAvncsContainer } from '../../../OitAvncsContainer';
import { OitUiService } from '../../../OitUiService';
import {
  LogbookItem,
  canRecordData,
  changeAdditionalInfo,
  deferralExpiryText,
  formatLogbookDate,
} from '../../../System/TechLogbook';
import { LogbookField, LogbookValueBox } from './LogbookWidgets';
import { LOGBOOK_URI } from './LogbookFlows';

/** Which detailed report: each list shows its own fields */
export type LogbookDetailVariant = 'history' | 'open' | 'deferred' | 'cabin';

/** Design choice: the length of ADDITIONAL INFO, one line of the field */
const ADDITIONAL_INFO_LENGTH = 60;

interface OitAvncsLogbookItemDetailProps extends ComponentProps {
  readonly container: OitAvncsContainer;
  readonly uiService: OitUiService;
  readonly variant: LogbookDetailVariant;
  readonly title: string;
  /** The items of the list, in the table order, for the previous/next item buttons */
  readonly items: Subscribable<readonly LogbookItem[]>;
  /** The reference of the item shown, null: the detail is hidden */
  readonly selectedRef: Subject<string | null>;
  /** SEND of the item (open items) */
  readonly onSend?: (ref: string) => void;
}

/** The DETAILED REPORT of an item, with the previous/next item, RETURN (to the table) and STATUS buttons */
export class OitAvncsLogbookItemDetail extends DestroyableComponent<OitAvncsLogbookItemDetailProps> {
  private readonly store = this.props.container.ansu.techLogbook;

  private readonly item = MappedSubject.create(
    ([items, ref]) => items.find((i) => i.ref === ref) ?? null,
    this.props.items,
    this.props.selectedRef,
  );

  private readonly index = MappedSubject.create(
    ([items, ref]) => items.findIndex((i) => i.ref === ref),
    this.props.items,
    this.props.selectedRef,
  );

  private readonly hidden = this.item.map((i) => i === null);
  private readonly previousDisabled = this.index.map((i) => i <= 0);
  private readonly nextDisabled = MappedSubject.create(
    ([i, items]) => i < 0 || i >= items.length - 1,
    this.index,
    this.props.items,
  );

  private readonly text = (read: (item: LogbookItem) => string) => this.item.map((item) => (item ? read(item) : ''));

  private readonly titleText = this.text((i) => i.title);
  private readonly ataText = this.text((i) => i.ata);
  private readonly openDateText = this.text((i) => formatLogbookDate(i.openDate));
  private readonly closeDateText = this.text((i) => formatLogbookDate(i.closeDate));
  private readonly refText = this.text((i) => i.ref);
  private readonly commentText = this.text((i) =>
    this.props.variant === 'cabin' ? i.cabinComment || 'NONE' : i.pilotComment || 'NONE',
  );
  private readonly additionalInfoText = this.text((i) => i.additionalInfo || 'NONE');
  private readonly lastMaintActionText = this.text((i) => i.lastMaintAction);
  private readonly classificationText = this.text((i) => `CLASSIFICATION: ${i.deferral?.classification ?? ''}`);
  private readonly referenceLabel = this.text((i) => `${i.deferral?.category === 'CDL' ? 'CDL' : 'MEL'} REFERENCE`);
  private readonly referenceText = this.text((i) => i.deferral?.reference ?? '');
  private readonly expiryText = this.text(deferralExpiryText);

  private readonly additionalInfo = this.item.map((i) => (i?.additionalInfo ? i.additionalInfo : null));
  private readonly additionalInfoDisabled = this.store.state.map((state) => !canRecordData(state));
  private readonly sendDisabled = this.item.map((i) => i === null || i.sendStatus === 'sent');

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.item,
      this.index,
      this.hidden,
      this.previousDisabled,
      this.nextDisabled,
      this.titleText,
      this.ataText,
      this.openDateText,
      this.closeDateText,
      this.refText,
      this.commentText,
      this.additionalInfoText,
      this.lastMaintActionText,
      this.classificationText,
      this.referenceLabel,
      this.referenceText,
      this.expiryText,
      this.additionalInfo,
      this.additionalInfoDisabled,
      this.sendDisabled,
    );
  }

  private step(delta: number): void {
    const items = this.props.items.get();
    const next = items[this.index.get() + delta];
    if (next) {
      this.props.selectedRef.set(next.ref);
    }
  }

  private row(label: string | Subscribable<string>, content: VNode, show = true): VNode {
    return (
      <div class={{ 'oit-logbook-row': true, hidden: !show }} style="margin-top: 10px; align-items: flex-start;">
        <div class="oit-logbook-label" style="width: 260px; padding-top: 6px;">
          {label}
        </div>
        {content}
      </div>
    );
  }

  render(): VNode {
    const v = this.props.variant;
    return (
      <div class={{ 'oit-logbook-frame': true, hidden: this.hidden }}>
        <span class="oit-logbook-frame-title">{this.props.title}</span>
        {this.row('TITLE', <LogbookValueBox value={this.titleText} width="900px" textClass="oit-logbook-cyan" />)}
        <div class={{ 'oit-logbook-row': true, hidden: v !== 'deferred' }} style="margin-top: 10px;">
          <div class="oit-logbook-label" style="width: 400px;">
            {this.classificationText}
          </div>
          <div class="oit-logbook-label" style="width: 230px;">
            {this.referenceLabel}
          </div>
          <LogbookValueBox value={this.referenceText} width="270px" centered />
        </div>
        {this.row('ATA', <LogbookValueBox value={this.ataText} width="270px" centered />, v === 'open')}
        <div class="oit-logbook-row" style="margin-top: 10px;">
          <div class="oit-logbook-label" style="width: 260px;">
            OPEN DATE
          </div>
          <LogbookValueBox value={this.openDateText} width="270px" centered />
          <div class="oit-logbook-label" style="width: 200px;">
            REF REPORT
          </div>
          <LogbookValueBox value={this.refText} width="350px" centered />
        </div>
        {this.row('CLOSE DATE', <LogbookValueBox value={this.closeDateText} width="270px" centered />, v === 'history')}
        {this.row('EXPIRY DATE', <LogbookValueBox value={this.expiryText} width="270px" centered />, v === 'deferred')}
        {this.row(
          'COMMENT',
          <LogbookValueBox value={this.commentText} width="900px" multiline textClass="oit-logbook-cyan" />,
        )}
        {this.row(
          'ADDITIONAL INFO',
          <LogbookValueBox value={this.additionalInfoText} width="900px" multiline />,
          v === 'history' || v === 'deferred',
        )}
        {this.row(
          'ADDITIONAL INFO',
          <LogbookField<string>
            container={this.props.container}
            format={new FreeTextFormat(ADDITIONAL_INFO_LENGTH)}
            value={this.additionalInfo}
            disabled={this.additionalInfoDisabled}
            onModified={(text) => {
              const ref = this.props.selectedRef.get();
              if (ref !== null) {
                this.store.change((state) => changeAdditionalInfo(state, ref, text ?? ''));
              }
            }}
            width={900}
            alignText="flex-start"
          />,
          v === 'open',
        )}
        {this.row(
          'LAST MAINT ACTION',
          <LogbookValueBox value={this.lastMaintActionText} width="900px" multiline />,
          v === 'history' || v === 'deferred',
        )}
        <div style="flex: 1;" />
        <div class="oit-logbook-bottom-buttons">
          <IconButton
            icon="double-left"
            disabled={this.previousDisabled}
            onClick={() => this.step(-1)}
            containerStyle="width: 44px; height: 44px; margin-right: 6px;"
          />
          <IconButton
            icon="double-right"
            disabled={this.nextDisabled}
            onClick={() => this.step(1)}
            containerStyle="width: 44px; height: 44px;"
          />
          <Button
            label="SEND"
            visible={v === 'open'}
            disabled={this.sendDisabled}
            onClick={() => {
              const ref = this.props.selectedRef.get();
              if (ref !== null) {
                this.props.onSend?.(ref);
              }
            }}
            buttonStyle="width: 150px; margin-left: 12px;"
          />
        </div>
        <div class="oit-logbook-bottom-buttons">
          <Button label="RETURN" onClick={() => this.props.selectedRef.set(null)} />
          <Button
            label="STATUS"
            onClick={() => this.props.uiService.navigateTo(LOGBOOK_URI.status)}
            buttonStyle="margin-left: 10px;"
          />
        </div>
      </div>
    );
  }
}
