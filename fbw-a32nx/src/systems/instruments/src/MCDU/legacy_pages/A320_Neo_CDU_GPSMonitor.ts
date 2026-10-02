// @ts-strict-ignore
import { Arinc429Register } from '@flybywiresim/fbw-sdk';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { GpsReceiverReading, gpsMonitorFields } from './GpsMonitorFields';

/**
 * GPS MONITOR page (A320 FCOM DSC-22_20-50-10-28): the data of the GPS receivers of MMR 1 and MMR 2 (position, true
 * track, ground speed, UTC, figure of merit, mode and satellites tracked, GPS altitude).
 */
export class CDUGPSMonitor {
  private static readonly word = Arinc429Register.empty();

  /** The value of an ARINC 429 word, null when it is not in normal operation */
  private static read(simVar: string): number | null {
    CDUGPSMonitor.word.setFromSimVar(simVar);
    return CDUGPSMonitor.word.isNormalOperation() ? CDUGPSMonitor.word.value : null;
  }

  private static reading(gps: number): GpsReceiverReading & { latitude: number | null; longitude: number | null } {
    const name = (s: string) => `L:A32NX_GPS_${gps}_${s}`;
    // A receiver an ADIRU uses for its GPIRS position (each ADIRU selects one receiver)
    const selected = [1, 2, 3].some(
      (ir) => SimVar.GetSimVarValue(`L:A32NX_ADIRS_IR_${ir}_GPIRS_SOURCE`, 'number') === gps,
    );
    return {
      mode: SimVar.GetSimVarValue(name('MODE'), 'number'),
      satellites: CDUGPSMonitor.read(name('SATELLITES')),
      figureOfMerit: CDUGPSMonitor.read(name('HORIZONTAL_FIGURE_OF_MERIT')),
      trueTrack: CDUGPSMonitor.read(name('TRUE_TRACK')),
      groundSpeed: CDUGPSMonitor.read(name('GROUND_SPEED')),
      altitude: CDUGPSMonitor.read(name('ALTITUDE')),
      latitude: CDUGPSMonitor.read(name('LATITUDE')),
      longitude: CDUGPSMonitor.read(name('LONGITUDE')),
      selected,
    };
  }

  /** The position as the page shows it, e.g. 4528.2N/07344.4W */
  private static position(latitude: number, longitude: number): string {
    const position = new LatLong(latitude, longitude).toShortDegreeString();
    const north = position.includes('N');
    const [lat, lon] = position.split(north ? 'N' : 'S');
    return `${lat}${north ? 'N/' : 'S/'}${lon}`;
  }

  static ShowPage(mcdu: LegacyFmsPageInterface) {
    const UTC_SECONDS = Math.floor(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds'));
    const hours = Math.floor(UTC_SECONDS / 3600) || 0;
    const minutes = Math.floor((UTC_SECONDS % 3600) / 60) || 0;
    const seconds = Math.floor((UTC_SECONDS % 3600) % 60) || 0;
    const utc = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const lines = [1, 2].map((gps) => {
      const reading = CDUGPSMonitor.reading(gps);
      const fields = gpsMonitorFields(reading);
      const positionShown = fields.dataShown && reading.latitude !== null && reading.longitude !== null;
      return {
        position: positionShown ? CDUGPSMonitor.position(reading.latitude, reading.longitude) : '----.--/-----.--',
        fields,
        utc: fields.dataShown ? utc : '--:--:--',
      };
    });

    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.GPSMonitor;
    const template = [['GPS MONITOR']];
    lines.forEach(({ position, fields, utc: time }, i) => {
      template.push(
        [`GPS${i + 1} POSITION`],
        [`${position}[color]green`],
        ['TTRK', 'GS', 'UTC'],
        [`${fields.trueTrack}[color]green`, `${fields.groundSpeed}[color]green`, `${time}[color]green`],
        ['MERIT', 'MODE/SAT', 'GPS ALT'],
        [`${fields.merit}[color]green`, `${fields.modeSatellites}[color]green`, `${fields.altitude}[color]green`],
      );
    });
    mcdu.setTemplate(template);

    // The page shows the seconds of the UTC: refreshed fast
    mcdu.SelfPtr = setTimeout(() => {
      if (mcdu.page.Current === mcdu.page.GPSMonitor) {
        CDUGPSMonitor.ShowPage(mcdu);
      }
    }, mcdu.PageTimeout.Fast);
  }
}
