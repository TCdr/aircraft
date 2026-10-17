// Copyright (c) 2021-2023, 2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0
import { CDUIRSStatus } from './A320_Neo_CDU_IRSStatus';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { Arinc429Register, Arinc429Word, RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { SimVarValueType } from '@microsoft/msfs-sdk';
import { Keypad } from '../legacy/A320_Neo_CDU_Keypad';
import { NXSystemMessages } from '../messages/NXSystemMessages';
import {
  IRS_SET_HEADING_VAR,
  irsStatusMessage,
  isSetHeadingFieldDisplayed,
  parseSetHeadingEntry,
  SetHeadingTransmitter,
  setHeadingField,
} from './IrsMonitorFields';

export class CDUIRSMonitor {
  private static ir1MaintenanceWordVar = RegisteredSimVar.create('L:A32NX_ADIRS_IR_1_MAINT_WORD', SimVarValueType.Enum);
  private static ir1MaintenanceWord = Arinc429Register.empty();
  private static ir2MaintenanceWordVar = RegisteredSimVar.create('L:A32NX_ADIRS_IR_2_MAINT_WORD', SimVarValueType.Enum);
  private static ir2MaintenanceWord = Arinc429Register.empty();
  private static ir3MaintenanceWordVar = RegisteredSimVar.create('L:A32NX_ADIRS_IR_3_MAINT_WORD', SimVarValueType.Enum);
  private static ir3MaintenanceWord = Arinc429Register.empty();

  /** The heading the crew entered in the SET HDG field, kept while at least one IR is in ATT mode */
  private static enteredSetHeading: number | null = null;

  private static readonly setHeadingTransmitter = new SetHeadingTransmitter((heading, ssm) =>
    Arinc429Word.toSimVarValue(IRS_SET_HEADING_VAR, heading, ssm),
  );

  static ShowPage(mcdu: LegacyFmsPageInterface) {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.IRSMonitor;

    this.populateAdiruMaintenanceWords();

    const setHeadingFieldDisplayed = isSetHeadingFieldDisplayed([
      this.ir1MaintenanceWord,
      this.ir2MaintenanceWord,
      this.ir3MaintenanceWord,
    ]);
    if (!setHeadingFieldDisplayed) {
      this.enteredSetHeading = null;
    }
    const [setHeadingLabel, setHeadingValue] = setHeadingFieldDisplayed
      ? setHeadingField(this.enteredSetHeading)
      : ['', ''];

    mcdu.setTemplate([
      ['IRS MONITOR'],
      [''],
      [`<IRS1\xa0{small}{green}${this.getAdiruStatusMessage(this.ir1MaintenanceWord)}{end}`],
      [`\xa0${this.getAdiruStateMessage(this.ir1MaintenanceWord)}[color]green`],
      [`<IRS2\xa0{small}{green}${this.getAdiruStatusMessage(this.ir2MaintenanceWord)}{end}`],
      [`\xa0${this.getAdiruStateMessage(this.ir2MaintenanceWord)}[color]green`],
      [`<IRS3\xa0{small}{green}${this.getAdiruStatusMessage(this.ir3MaintenanceWord)}{end}`],
      [`\xa0${this.getAdiruStateMessage(this.ir3MaintenanceWord)}[color]green`],
      [''],
      ['', setHeadingLabel],
      ['', setHeadingValue],
    ]);

    // [5R] SET HDG: the heading the crew enters for an IRS in ATT mode
    mcdu.onRightInput[4] = (value, scratchpadCallback) => {
      if (!setHeadingFieldDisplayed || value === Keypad.clrValue) {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }
      const entry = parseSetHeadingEntry(value);
      if ('error' in entry) {
        mcdu.setScratchpadMessage(
          entry.error === 'range' ? NXSystemMessages.entryOutOfRange : NXSystemMessages.formatError,
        );
        scratchpadCallback();
        return;
      }
      this.enteredSetHeading = entry.heading;
      this.setHeadingTransmitter.send(entry.heading);
      CDUIRSMonitor.ShowPage(mcdu);
    };
    mcdu.leftInputDelay[0] = () => {
      return mcdu.getDelaySwitchPage();
    };
    mcdu.onLeftInput[0] = () => {
      CDUIRSStatus.ShowPage(mcdu, 1);
    };
    mcdu.leftInputDelay[1] = () => {
      return mcdu.getDelaySwitchPage();
    };
    mcdu.onLeftInput[1] = () => {
      CDUIRSStatus.ShowPage(mcdu, 2);
    };
    mcdu.leftInputDelay[2] = () => {
      return mcdu.getDelaySwitchPage();
    };
    mcdu.onLeftInput[2] = () => {
      CDUIRSStatus.ShowPage(mcdu, 3);
    };

    // regular update due to showing dynamic data on this page
    mcdu.SelfPtr = setTimeout(() => {
      if (mcdu.page.Current === mcdu.page.IRSMonitor) {
        CDUIRSMonitor.ShowPage(mcdu);
      }
    }, mcdu.PageTimeout.Slow);
  }

  static populateAdiruMaintenanceWords() {
    this.ir1MaintenanceWord.set(this.ir1MaintenanceWordVar.get());
    this.ir2MaintenanceWord.set(this.ir2MaintenanceWordVar.get());
    this.ir3MaintenanceWord.set(this.ir3MaintenanceWordVar.get());
  }

  static getAdiruStatusMessage(irMaintenanceWord: Arinc429Register): string {
    return irsStatusMessage(irMaintenanceWord);
  }

  static getAdiruStateMessage(irMaintenanceWord: Arinc429Register): string {
    if (irMaintenanceWord.isInvalid()) {
      return 'INVAL';
    }

    if (irMaintenanceWord.bitValue(3)) {
      const align1Min = irMaintenanceWord.bitValue(16);
      const align2Min = irMaintenanceWord.bitValue(17);
      const align4Min = irMaintenanceWord.bitValue(18);
      if (align1Min || align2Min || align4Min) {
        let timeToAlign = 0;
        if (align1Min) {
          timeToAlign += 1;
        }
        if (align2Min) {
          timeToAlign += 2;
        }
        if (align4Min) {
          timeToAlign += 4;
        }
        return 'ALIGN TTN ' + timeToAlign;
      } else {
        return 'NAV';
      }
    } else if (irMaintenanceWord.bitValue(2)) {
      return 'ATT';
    }

    return '';
  }
}
