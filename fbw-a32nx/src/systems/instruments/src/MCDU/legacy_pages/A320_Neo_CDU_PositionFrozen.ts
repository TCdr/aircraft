// @ts-strict-ignore
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { CDUPositionMonitorPage } from './A320_Neo_CDU_PositionMonitorPage';
import { CDUSelectedNavaids } from './A320_Neo_CDU_SelectedNavaids';
import { PositionMonitorReading, positionMonitorLines } from './PositionMonitorFields';

export class CDUPosFrozen {
  /**
   * The POSITION MONITOR page frozen: the title gives the time of the freeze, the data is the data of that moment.
   * @param reading the POSITION MONITOR data when the page was frozen
   */
  static ShowPage(mcdu: LegacyFmsPageInterface, reading: PositionMonitorReading) {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.PosFrozen;
    const UTC_SECONDS = Math.floor(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds'));
    const hours = Math.floor(UTC_SECONDS / 3600) || 0;
    const minutes = Math.floor((UTC_SECONDS % 3600) / 60) || 0;
    const hhmm = `${hours.toString().padStart(2, '0') || '00'}${minutes.toString().padStart(2, '0') || '00'}`;
    mcdu.setTemplate([
      [`POSITION FROZEN AT ${hhmm}`],
      ...positionMonitorLines(reading),
      ['', 'SEL\xa0'],
      ['{UNFREEZE[color]cyan', 'NAVAIDS>'],
    ]);

    mcdu.onLeftInput[5] = () => {
      CDUPositionMonitorPage.ShowPage(mcdu);
    };

    mcdu.onRightInput[5] = () => {
      CDUSelectedNavaids.ShowPage(mcdu);
    };
  }
}
