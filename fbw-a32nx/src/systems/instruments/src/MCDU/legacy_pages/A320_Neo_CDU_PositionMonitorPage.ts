import { navigationModeText } from '@fmgc/navigation/FmPosition';
import { Arinc429Register } from '@flybywiresim/fbw-sdk';
import { Coordinates } from 'msfs-geo';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { CDUIRSMonitor } from './A320_Neo_CDU_IRSMonitor';
import { CDUPosFrozen } from './A320_Neo_CDU_PositionFrozen';
import { CDUSelectedNavaids } from './A320_Neo_CDU_SelectedNavaids';
import { irsModeText, PositionMonitorReading, positionMonitorLines } from './PositionMonitorFields';

export class CDUPositionMonitorPage {
  private static readonly irMaintenanceWord = Arinc429Register.empty();

  private static readonly irLatitude = Arinc429Register.empty();

  private static readonly irLongitude = Arinc429Register.empty();

  /**
   * Reads the positions of the FMS function, the GPIRS, radio, MIX IRS and IRS positions. The MCDU pages share one FMS:
   * the onside FMGC is FMGC 1.
   */
  static read(mcdu: LegacyFmsPageInterface): PositionMonitorReading {
    const navigation = mcdu.navigation;
    const irPositions: (Coordinates | null)[] = [];
    const irModes: string[] = [];
    for (let ir = 1; ir <= 3; ir++) {
      this.irMaintenanceWord.setFromSimVar(`L:A32NX_ADIRS_IR_${ir}_MAINT_WORD`);
      irModes.push(irsModeText(CDUIRSMonitor.getAdiruStateMessage(this.irMaintenanceWord)));
      this.irLatitude.setFromSimVar(`L:A32NX_ADIRS_IR_${ir}_LATITUDE`);
      this.irLongitude.setFromSimVar(`L:A32NX_ADIRS_IR_${ir}_LONGITUDE`);
      irPositions.push(
        this.irLatitude.isNormalOperation() && this.irLongitude.isNormalOperation()
          ? { lat: this.irLatitude.value, long: this.irLongitude.value }
          : null,
      );
    }
    return {
      fm1: navigation?.getFmPosition(1) ?? null,
      fm2: navigation?.getFmPosition(2) ?? null,
      modeText: navigation ? navigationModeText(navigation.getIrsUsedCount(), navigation.getNavigationMode()) : '',
      gpirs: navigation?.getGpirsPosition(1) ?? null,
      radio: navigation?.getRadioPosition() ?? null,
      mixIrs: navigation?.getMixIrsPosition(1) ?? null,
      irPositions,
      irModes,
      onSide: 1,
    };
  }

  static ShowPage(mcdu: LegacyFmsPageInterface) {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.PositionMonitorPage;

    const reading = CDUPositionMonitorPage.read(mcdu);

    mcdu.setTemplate([
      ['POSITION MONITOR'],
      ...positionMonitorLines(reading),
      ['', 'SEL\xa0'],
      ['{FREEZE[color]cyan', 'NAVAIDS>'],
    ]);

    mcdu.rightInputDelay[5] = () => {
      return mcdu.getDelaySwitchPage();
    };

    mcdu.onRightInput[5] = () => {
      CDUSelectedNavaids.ShowPage(mcdu);
    };

    // FREEZE [6L]: the page keeps the data of this moment
    mcdu.onLeftInput[5] = () => {
      CDUPosFrozen.ShowPage(mcdu, reading);
    };

    // regular update due to showing dynamic data on this page
    mcdu.SelfPtr = setTimeout(() => {
      if (mcdu.page.Current === mcdu.page.PositionMonitorPage) {
        CDUPositionMonitorPage.ShowPage(mcdu);
      }
    }, mcdu.PageTimeout.Default);
  }
}
