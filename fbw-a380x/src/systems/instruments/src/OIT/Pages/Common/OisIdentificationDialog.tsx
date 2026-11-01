//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { ComponentProps, DisplayComponent, FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FreeTextFormat } from '../../../MFD/pages/common/DataEntryFormats';
import { OisDialog, OisDialogButton, personalIdAfterButton } from '../../System/OisDialog';
import { OitPageDrafts } from '../../System/OitPageDrafts';
import { LogbookField, LogbookFieldKeyboard } from '../NssAvncs/Logbook/LogbookWidgets';
import { LogbookPasswordFormat } from '../NssAvncs/Logbook/LogbookEntryFormats';

interface OisIdentificationDialogProps extends ComponentProps {
  /** The window shown, null when there is none */
  readonly dialog: Subject<OisDialog | null>;
  /** Where the personal ID is kept between two drawings of the page */
  readonly drafts: OitPageDrafts;
  /** The page entry of the personal ID in the drafts */
  readonly draftsPage: string;
  readonly keyboard: LogbookFieldKeyboard;
  /** The title bar: the application */
  readonly title: string;
}

/** The message windows of an application: messages, the identification and the electronic signature */
export class OisIdentificationDialog extends DestroyableComponent<OisIdentificationDialogProps> {
  private readonly linesRef = FSComponent.createRef<HTMLDivElement>();
  private readonly buttonsRef = FSComponent.createRef<HTMLDivElement>();

  private buttons: VNode[] = [];

  private readonly hidden = this.props.dialog.map((d) => d === null);

  private readonly kindText = this.props.dialog.map((d) => (d ? `${d.kind}:` : ''));
  private readonly kindIsCaution = this.props.dialog.map((d) => d?.kind === 'Caution');

  private readonly identification = this.props.dialog.map((d) => d?.identification ?? null);
  private readonly identificationHidden = this.identification.map((i) => i === null);
  private readonly passwordHidden = this.identification.map((i) => i !== 'authentication');

  /** The PERSONAL ID survives a visit to another application and the next signature; the password never does */
  private readonly personalId = this.props.drafts.field<string | null>(this.props.draftsPage, 'personalId', null);
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
      this.props.dialog.sub((dialog) => this.show(dialog), true),
    );
  }

  destroy(): void {
    this.destroyButtons();
    super.destroy();
  }

  private show(dialog: OisDialog | null): void {
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
          buttonStyle="min-width: 150px; padding: 0 14px; font-size: 26px; height: 46px; margin-left: 12px;"
        />
      );
      FSComponent.render(vnode, buttons);
      this.buttons.push(vnode);
    }
  }

  private press(button: OisDialogButton): void {
    this.personalId.set(personalIdAfterButton(this.personalId.get(), button.label));
    this.props.dialog.set(null);
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
          <div class="oit-logbook-dialog-title">{this.props.title}</div>
          <div class="oit-logbook-dialog-body">
            <div class={{ 'oit-logbook-amber': this.kindIsCaution }}>{this.kindText}</div>
            <div ref={this.linesRef} />
            <div class={{ 'oit-logbook-column': true, hidden: this.identificationHidden }} style="margin-top: 16px;">
              <div class="oit-logbook-row" style="margin-top: 8px;">
                <div class="oit-logbook-label" style="width: 260px;">
                  PERSONAL ID
                </div>
                <LogbookField<string>
                  container={this.props.keyboard}
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
                  container={this.props.keyboard}
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
