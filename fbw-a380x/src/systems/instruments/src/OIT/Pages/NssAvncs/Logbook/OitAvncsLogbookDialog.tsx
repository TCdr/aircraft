//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, DisplayComponent, FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { OitAvncsContainer } from '../../../OitAvncsContainer';
import { LogbookDialog, LogbookDialogButton, TechLogbookStore } from '../../../System/TechLogbookStore';
import { LogbookField } from './LogbookWidgets';
import { LogbookPasswordFormat } from './LogbookEntryFormats';
import { LOGBOOK_DIALOG_DRAFTS, personalIdAfterButton } from './LogbookDrafts';

interface OitAvncsLogbookDialogProps extends ComponentProps {
  readonly store: TechLogbookStore;
  readonly container: OitAvncsContainer;
}

/** The LOGBOOK message windows over the logbook pages: messages, the identification and the electronic signature */
export class OitAvncsLogbookDialog extends DestroyableComponent<OitAvncsLogbookDialogProps> {
  private readonly linesRef = FSComponent.createRef<HTMLDivElement>();
  private readonly buttonsRef = FSComponent.createRef<HTMLDivElement>();

  private buttons: VNode[] = [];

  private readonly hidden = this.props.store.dialog.map((d) => d === null);

  private readonly kindText = this.props.store.dialog.map((d) => (d ? `${d.kind}:` : ''));
  private readonly kindIsCaution = this.props.store.dialog.map((d) => d?.kind === 'Caution');

  private readonly identification = this.props.store.dialog.map((d) => d?.identification ?? null);
  private readonly identificationHidden = this.identification.map((i) => i === null);
  private readonly passwordHidden = this.identification.map((i) => i !== 'authentication');

  /** The PERSONAL ID survives a visit to another application and the next signature; the password never does */
  private readonly drafts = this.props.container.ansu.pageDrafts;
  private readonly personalId = this.drafts.field<string | null>(LOGBOOK_DIALOG_DRAFTS, 'personalId', null);
  private readonly password = Subject.create<string | null>(null);

  /** OK of an identification needs the personal ID, and the password when the logbook opens */
  private readonly okDisabled = MappedSubject.create(
    ([identification, id, password]) =>
      identification !== null && (!id || (identification === 'authentication' && !password)),
    this.identification,
    this.personalId,
    this.password,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subscriptions.push(
      this.hidden,
      this.kindText,
      this.kindIsCaution,
      this.identification,
      this.identificationHidden,
      this.passwordHidden,
      this.okDisabled,
      this.props.store.dialog.sub((dialog) => this.show(dialog), true),
    );
  }

  destroy(): void {
    this.destroyButtons();
    super.destroy();
  }

  private show(dialog: LogbookDialog | null): void {
    const lines = this.linesRef.getOrDefault();
    const buttons = this.buttonsRef.getOrDefault();
    if (!lines || !buttons) {
      return;
    }
    while (lines.firstChild) {
      lines.removeChild(lines.firstChild);
    }
    this.destroyButtons();
    while (buttons.firstChild) {
      buttons.removeChild(buttons.firstChild);
    }
    this.password.set(null);
    if (!dialog) {
      return;
    }
    for (const text of dialog.lines) {
      const line = document.createElement('div');
      line.className = 'oit-logbook-dialog-line';
      line.textContent = text === '' ? '\xa0' : text;
      lines.appendChild(line);
    }
    for (const button of dialog.buttons) {
      const vnode = (
        <Button
          label={button.label}
          disabled={button.label === 'OK' ? this.okDisabled : false}
          onClick={() => this.press(button)}
          buttonStyle="width: 150px; font-size: 26px; height: 46px; margin-left: 12px;"
        />
      );
      FSComponent.render(vnode, buttons);
      this.buttons.push(vnode);
    }
  }

  private press(button: LogbookDialogButton): void {
    this.personalId.set(personalIdAfterButton(this.personalId.get(), button.label));
    this.props.store.dialog.set(null);
    button.action?.();
  }

  private destroyButtons(): void {
    for (const vnode of this.buttons) {
      if (vnode.instance instanceof DisplayComponent) {
        vnode.instance.destroy();
      }
    }
    this.buttons = [];
  }

  render(): VNode {
    return (
      <div class={{ 'oit-logbook-dialog-overlay': true, hidden: this.hidden }}>
        <div class="oit-logbook-dialog">
          <div class="oit-logbook-dialog-title">LOGBOOK</div>
          <div class="oit-logbook-dialog-body">
            <div class={{ 'oit-logbook-amber': this.kindIsCaution }}>{this.kindText}</div>
            <div ref={this.linesRef} />
            <div class={{ 'oit-logbook-column': true, hidden: this.identificationHidden }} style="margin-top: 16px;">
              <div class="oit-logbook-row" style="margin-top: 8px;">
                <div class="oit-logbook-label" style="width: 260px;">
                  PERSONAL ID
                </div>
                <LogbookField<string>
                  container={this.props.container}
                  format={new FreeTextFormat(12)}
                  value={this.personalId}
                  onModified={(v) => this.personalId.set(v)}
                  width={300}
                  alignText="flex-start"
                />
              </div>
              <div class={{ 'oit-logbook-row': true, hidden: this.passwordHidden }} style="margin-top: 8px;">
                <div class="oit-logbook-label" style="width: 260px;">
                  PASSWORD
                </div>
                <LogbookField<string>
                  container={this.props.container}
                  format={new LogbookPasswordFormat()}
                  value={this.password}
                  onModified={(v) => this.password.set(v)}
                  width={300}
                  alignText="flex-start"
                />
              </div>
            </div>
            <div ref={this.buttonsRef} class="oit-logbook-bottom-buttons" style="margin-top: 20px;" />
          </div>
        </div>
      </div>
    );
  }
}
