// Copyright (c) 2024-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0
import { ClockEvents, FSComponent, SimVarValueType, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { fcomAt, fcomCentre, fcomLine, fcomRight } from '../../common/FcomLayout';
import { Arinc429Register, coordinateToString, Fix, MagVar, RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { Coordinates } from '@fmgc/flightplanning/data/geo';
import { Footer } from '../../common/Footer';
import { FixFormat, RnpFormat } from '../../common/DataEntryFormats';
import './MfdFmsPositionMonitor.scss';
import { distanceTo } from 'msfs-geo';
import { WaypointEntryUtils } from '@fmgc/flightplanning/WaypointEntryUtils';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { noPositionAvailableText } from '../../../shared/utils';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { MfdFmsPositionNavaids } from './MfdFmsPositionNavaids';
import { navigationModeText } from '@fmgc/navigation/FmPosition';

interface MfdFmsPositionMonitorPageProps extends AbstractMfdPageProps {}

export class MfdFmsPositionMonitor extends FmsPage<MfdFmsPositionMonitorPageProps> {
  static readonly noIrsPositionDeviationAvailText = '--.-';

  private readonly fmsRnp = Subject.create<number | null>(null);

  private readonly rnpEnteredByPilot = Subject.create(false);

  private readonly fmsAccuracyHigh = Subject.create(false);

  private readonly fmsEpe = Subject.create(Infinity);

  private readonly fmsEpeDisplay = this.fmsEpe.map((v) => (v === Infinity ? '-.--' : v.toFixed(2)).padEnd(5, '\xa0'));

  private readonly fmsEPeUnitVisibility = this.fmsEpe.map((v) => (v === Infinity ? 'hidden' : 'visible'));

  private readonly fmsAccuracy = this.fmsAccuracyHigh.map((v) => (v ? 'HIGH' : 'LOW'));

  private readonly ir1LatitudeRegister = Arinc429Register.empty();

  private readonly ir1LatitudeSimVar = RegisteredSimVar.create<number>(
    'L:A32NX_ADIRS_IR_1_LATITUDE',
    SimVarValueType.Enum,
  );

  private readonly ir1LongitudeRegister = Arinc429Register.empty();

  private readonly ir1LongitudeSimVar = RegisteredSimVar.create<number>(
    'L:A32NX_ADIRS_IR_1_LONGITUDE',
    SimVarValueType.Enum,
  );

  private readonly ir1Coordinates: Coordinates = { lat: 0, long: 0 };

  private readonly ir1Position = Subject.create(noPositionAvailableText);

  private readonly ir1PositionDeviation = Subject.create(MfdFmsPositionMonitor.noIrsPositionDeviationAvailText);

  private readonly ir1PositionDeviationUnitVisibility = this.ir1PositionDeviation.map((v) =>
    v === MfdFmsPositionMonitor.noIrsPositionDeviationAvailText ? 'hidden' : 'visible',
  );

  private readonly ir2LatitudeRegister = Arinc429Register.empty();

  private readonly ir2LatitudeSimVar = RegisteredSimVar.create<number>(
    'L:A32NX_ADIRS_IR_2_LATITUDE',
    SimVarValueType.Enum,
  );

  private readonly ir2LongitudeRegister = Arinc429Register.empty();

  private readonly ir2LongitudeSimVar = RegisteredSimVar.create<number>(
    'L:A32NX_ADIRS_IR_2_LONGITUDE',
    SimVarValueType.Enum,
  );

  private readonly ir2Coordinates: Coordinates = { lat: 0, long: 0 };

  private readonly ir2Position = Subject.create(noPositionAvailableText);

  private readonly ir2PositionDeviation = Subject.create(MfdFmsPositionMonitor.noIrsPositionDeviationAvailText);

  private readonly ir2PositionDeviationUnitVisibility = this.ir2PositionDeviation.map((v) =>
    v === MfdFmsPositionMonitor.noIrsPositionDeviationAvailText ? 'hidden' : 'visible',
  );

  private readonly ir3LatitudeRegister = Arinc429Register.empty();

  private readonly ir3LatitudeSimVar = RegisteredSimVar.create<number>(
    'L:A32NX_ADIRS_IR_3_LATITUDE',
    SimVarValueType.Enum,
  );

  private readonly ir3LongitudeRegister = Arinc429Register.empty();

  private readonly ir3LongitudeSimVar = RegisteredSimVar.create<number>(
    'L:A32NX_ADIRS_IR_3_LONGITUDE',
    SimVarValueType.Enum,
  );

  private readonly ir3Coordinates: Coordinates = { lat: 0, long: 0 };

  private readonly ir3Position = Subject.create(noPositionAvailableText);

  private readonly ir3PositionDeviation = Subject.create(MfdFmsPositionMonitor.noIrsPositionDeviationAvailText);

  private readonly ir3PositionDeviationUnitVisibility = this.ir3PositionDeviation.map((v) =>
    v === MfdFmsPositionMonitor.noIrsPositionDeviationAvailText ? 'hidden' : 'visible',
  );

  private readonly position1 = Subject.create(noPositionAvailableText);

  /** The offside FMS position (FMS2 on the CAPT side, FMS1 on the F/O side) */
  private readonly position2 = Subject.create(noPositionAvailableText);

  /** The radio position of the onside FMS, in the IRS/DME/DME and IRS/VOR/DME modes */
  private readonly radioPosition = Subject.create(noPositionAvailableText);

  private readonly positionFrozen = Subject.create(false);

  private readonly navPrimaryLost = Subject.create(false);

  private readonly accuracyClass = this.fmsAccuracyHigh.map(
    (v) => `mfd-value ${v ? '' : 'amber'} bigger mfd-spacing-right`,
  );

  /** FCOM P 292: FREEZE POSITION / UNFREEZE POSITION, and the time the data was frozen */
  private readonly positionFrozenLabel = this.positionFrozen.map((v) =>
    v ? 'UNFREEZE<br />POSITION *' : 'FREEZE<br />POSITION *',
  );

  private readonly positionFrozenText = this.positionFrozen.map((v) => (v ? 'POSITION FROZEN' : ''));

  private readonly positionFrozenTime = this.positionFrozen.map((v) =>
    v ? 'AT ' + this.props.fmcService.master.timeKeeper.formatEta(0) : '',
  );

  private readonly gnss1PositionText = Subject.create(noPositionAvailableText);

  private readonly gnss2PositionText = Subject.create(noPositionAvailableText);

  private readonly onSidePositionLabel = Subject.create(this.props.mfd.uiService.captOrFo === 'CAPT' ? 'FMS1' : 'FMS2');

  private readonly offSidePositionLabel = Subject.create(
    this.props.mfd.uiService.captOrFo === 'CAPT' ? 'FMS2' : 'FMS1',
  );

  /** The GPIRS (hybrid GPS/IRS) position the onside FMS selects */
  private readonly gpirsPositionText = Subject.create(noPositionAvailableText);

  private readonly gpsPrimaryVisibility = this.navPrimaryLost.map((v) => (v ? 'hidden' : 'visible'));

  private readonly monitorWaypoint =
    this.props.fmcService.master.fmgc.data.positionMonitorFix ?? Subject.create<Fix | null>(null);

  /** The navigation modes of the onside and offside FMS positions, between brackets */
  private readonly position1Mode = Subject.create('');
  private readonly position2Mode = Subject.create('');

  private readonly bearingToWaypoint = Subject.create<number | null>(null);

  private readonly distanceToWaypoint = Subject.create<number | null>(null);

  private readonly bearingToWaypointDisplay = this.bearingToWaypoint.map((v) =>
    v ? v.toFixed(0).padStart(3, '0') : '---',
  );

  private readonly distanceToWaypointDisplay = this.distanceToWaypoint.map((v) =>
    v ? v.toFixed(v > 9999 ? 0 : 1).padEnd(6, '\xa0') : '----.-',
  );

  private readonly bearingUnit = this.bearingToWaypoint.map((v) => (v ? '°' : '\xa0'));

  private readonly distanceToWaypointUnit = this.bearingToWaypoint.map((v) => (v ? 'NM' : '\xa0\xa0'));

  private readonly waypointEntered = this.monitorWaypoint.map((v) => v !== null);

  private readonly mixIrsPositionText = Subject.create(noPositionAvailableText);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    const sub = this.props.bus.getSubscriber<ClockEvents>();
    this.subs.push(
      sub
        .on('realTime')
        .atFrequency(2)
        .handle((_t) => {
          this.onNewData();
        }),
      this.waypointEntered,
      this.positionFrozenLabel,
      this.fmsAccuracy,
      this.fmsEpeDisplay,
      this.bearingToWaypointDisplay,
      this.distanceToWaypointDisplay,
      this.bearingUnit,
      this.distanceToWaypointUnit,
      this.positionFrozenText,
      this.gpsPrimaryVisibility,
      this.positionFrozenTime,
      this.accuracyClass,
      this.fmsEPeUnitVisibility,
      this.ir1PositionDeviationUnitVisibility,
      this.ir2PositionDeviationUnitVisibility,
      this.ir3PositionDeviationUnitVisibility,
    );
  }

  protected onNewData(): void {
    if (!this.props.fmcService.master) {
      return;
    }

    const navigation = this.props.fmcService.master.navigation;
    const rnp = navigation.getActiveRnp();

    this.navPrimaryLost.set(!navigation.getGpsPrimary());
    this.fmsAccuracyHigh.set(navigation.isAccuracyHigh());
    this.fmsEpe.set(navigation.getEpe());
    this.fmsRnp.set(rnp ?? null);
    this.rnpEnteredByPilot.set(navigation.isPilotRnp());
    // FMS1 on the CAPT side, FMS2 on the F/O side (A380 FCOM POSITION / MONITOR page, a380_fcom.txt l.39683-39686)
    const onSide: 1 | 2 = this.props.mfd.uiService.captOrFo === 'CAPT' ? 1 : 2;
    const offSide: 1 | 2 = onSide === 1 ? 2 : 1;
    const fmCoordinates = navigation.getFmPosition(onSide);
    // FCOM P 292: FREEZE POSITION freezes the display of all position data on the page
    const updatePositionSensors = !this.positionFrozen.get();
    const positionText = (position: Coordinates | null) =>
      position !== null ? coordinateToString(position, false) : noPositionAvailableText;

    if (updatePositionSensors) {
      this.position1.set(positionText(fmCoordinates));
      this.position2.set(positionText(navigation.getFmPosition(offSide)));
      this.radioPosition.set(positionText(navigation.getRadioPosition()));
      this.gpirsPositionText.set(positionText(navigation.getGpirsPosition(onSide)));
    }

    this.fillIrData(
      1,
      this.ir1LatitudeRegister,
      this.ir1LongitudeRegister,
      this.ir1Coordinates,
      fmCoordinates,
      this.ir1Position,
      this.ir1PositionDeviation,
      updatePositionSensors,
    );
    this.fillIrData(
      2,
      this.ir2LatitudeRegister,
      this.ir2LongitudeRegister,
      this.ir2Coordinates,
      fmCoordinates,
      this.ir2Position,
      this.ir2PositionDeviation,
      updatePositionSensors,
    );
    this.fillIrData(
      3,
      this.ir3LatitudeRegister,
      this.ir3LongitudeRegister,
      this.ir3Coordinates,
      fmCoordinates,
      this.ir3Position,
      this.ir3PositionDeviation,
      updatePositionSensors,
    );

    if (updatePositionSensors) {
      // The pure GPS positions of the two MMR receivers, sent through the ADIRS (a380_fcom.txt l.22760-22761)
      this.gnss1PositionText.set(positionText(navigation.getGpsPosition(1)));
      this.gnss2PositionText.set(positionText(navigation.getGpsPosition(2)));
      // The MIX IRS position, or the single IRS position the onside FMS uses (a380_fcom.txt l.39724-39726)
      this.mixIrsPositionText.set(positionText(navigation.getMixIrsPosition(onSide)));
    }

    const waypoint = this.monitorWaypoint.get();
    if (waypoint && fmCoordinates) {
      const distanceToWaypointNm = distanceTo(fmCoordinates, waypoint.location);
      this.distanceToWaypoint.set(distanceToWaypointNm);
      const magVar = MagVar.get(fmCoordinates);
      this.bearingToWaypoint.set(
        MagVar.trueToMagnetic(Avionics.Utils.computeGreatCircleHeading(fmCoordinates, waypoint.location), magVar ?? 0),
      );
    } else {
      this.distanceToWaypoint.set(null);
      this.bearingToWaypoint.set(null);
    }

    if (updatePositionSensors) {
      // FCOM P 286: navigation mode "N IRS/GPS", "N IRS/DME/DME", "N IRS/VOR/DME" or "N IRS", N = 3 or 1 IRS. Both FMSs
      // use the same navaids and the same IRS, so both have the navigation mode of the FMS function.
      const modeText = navigationModeText(navigation.getIrsUsedCount(), navigation.getNavigationMode());
      const mode = modeText === '' ? '' : `(${modeText})`;
      this.position1Mode.set(navigation.getFmPosition(onSide) !== null ? mode : '');
      this.position2Mode.set(navigation.getFmPosition(offSide) !== null ? mode : '');
    }
  }

  private fillIrData(
    irIndex: 1 | 2 | 3,
    latitude: Arinc429Register,
    longitude: Arinc429Register,
    coordinates: Coordinates,
    fmPosition: Coordinates | null,
    irPosition: Subject<string>,
    irFmPositionDeviation: Subject<string>,
    updatePosition?: boolean,
  ): void {
    latitude.set(
      irIndex === 1
        ? this.ir1LatitudeSimVar.get()
        : irIndex === 2
          ? this.ir2LatitudeSimVar.get()
          : this.ir3LatitudeSimVar.get(),
    );
    longitude.set(
      irIndex === 1
        ? this.ir1LongitudeSimVar.get()
        : irIndex === 2
          ? this.ir2LongitudeSimVar.get()
          : this.ir3LongitudeSimVar.get(),
    );
    if (latitude.isInvalid() || longitude.isInvalid()) {
      irPosition.set(noPositionAvailableText);
      irFmPositionDeviation.set(MfdFmsPositionMonitor.noIrsPositionDeviationAvailText);
      return;
    }
    coordinates.lat = latitude.value;
    coordinates.long = longitude.value;

    if (updatePosition) {
      irPosition.set(coordinateToString(coordinates, false));
    }

    if (!updatePosition) {
      return;
    }
    if (fmPosition) {
      irFmPositionDeviation.set(distanceTo(coordinates, fmPosition).toFixed(1));
    } else {
      irFmPositionDeviation.set(MfdFmsPositionMonitor.noIrsPositionDeviationAvailText);
    }
  }

  private togglePositionFrozen(): void {
    this.positionFrozen.set(!this.positionFrozen.get());
  }

  /** A position line of the table: label right-aligned on x = 112, latitude/longitude from x = 128 */
  private static positionLine(y: number, label: string | Subscribable<string>, position: Subscribable<string>): VNode {
    return (
      <>
        {fcomRight(y, 92, <span class="mfd-label">{label}</span>)}
        {fcomAt(y, 111, <span class="mfd-value bigger">{position}</span>)}
      </>
    );
  }

  /** An IRS deviation from the onside FMS position, right-aligned on x = 652 with its NM unit */
  private static deviation(y: number, value: Subscribable<string>, unitVisibility: Subscribable<string>): VNode {
    return fcomRight(y, 652, [
      <span class="mfd-value bigger">{value}</span>,
      <span class="mfd-label-unit bigger mfd-unit-trailing" style={{ visibility: unitVisibility }}>
        NM
      </span>,
    ]);
  }

  render(): VNode {
    const line = MfdFmsPositionMonitor.positionLine;
    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figures (DSC-22-FMS-20-30 P 273, P 286), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {fcomRight(22, 208, <span class="mfd-label">ACCURACY</span>)}
            {fcomAt(22, 227, <span class={this.accuracyClass}>{this.fmsAccuracy}</span>)}
            <div style={{ visibility: this.gpsPrimaryVisibility }}>
              {fcomAt(69, 94, <span class="mfd-value bigger">GPS PRIMARY</span>)}
            </div>
            {fcomRight(22, 514, <span class="mfd-label">EPU</span>)}
            {fcomRight(22, 669, [
              <span class="mfd-value bigger">{this.fmsEpeDisplay}</span>,
              <span class="mfd-label-unit bigger mfd-unit-trailing" style={{ visibility: this.fmsEPeUnitVisibility }}>
                NM
              </span>,
            ])}
            {fcomRight(70, 514, <span class="mfd-label">RNP</span>)}
            {fcomAt(
              70,
              529,
              <InputField<number>
                dataEntryFormat={new RnpFormat()}
                value={this.fmsRnp}
                onModified={(v) => this.props.fmcService.master.navigation.setPilotRnp(v)}
                enteredByPilot={this.rnpEnteredByPilot}
                canBeCleared={Subject.create(true)}
                containerStyle="width: 140px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
                bigUnit={true}
              />,
            )}

            <div class="mfd-pos-monitor-box" />
            {line(174, this.onSidePositionLabel, this.position1)}
            {fcomAt(174, 504, <span class="mfd-value bigger">{this.position1Mode}</span>)}
            {line(224, 'RADIO', this.radioPosition)}
            {line(265, 'MIXIRS', this.mixIrsPositionText)}
            {line(305, 'GPIRS', this.gpirsPositionText)}
            {fcomCentre(216, 620, <span class="mfd-label">{this.positionFrozenText}</span>)}
            {fcomCentre(243, 620, <span class="mfd-label">{this.positionFrozenTime}</span>)}
            {fcomAt(
              295.5,
              537,
              <Button
                label={this.positionFrozenLabel}
                onClick={() => this.togglePositionFrozen()}
                buttonStyle="min-width: 167px; min-height: 59px;"
              />,
            )}
            {fcomLine(330, 22, 725)}
            {line(360, this.offSidePositionLabel, this.position2)}
            {fcomAt(360, 504, <span class="mfd-value bigger">{this.position2Mode}</span>)}
            {fcomLine(386, 22, 725)}
            {fcomRight(415, 736, <span class="mfd-label">DEVIATION FROM {this.onSidePositionLabel}</span>)}
            {line(455, 'IRS1', this.ir1Position)}
            {MfdFmsPositionMonitor.deviation(455, this.ir1PositionDeviation, this.ir1PositionDeviationUnitVisibility)}
            {line(496, 'IRS2', this.ir2Position)}
            {MfdFmsPositionMonitor.deviation(496, this.ir2PositionDeviation, this.ir2PositionDeviationUnitVisibility)}
            {line(536, 'IRS3', this.ir3Position)}
            {MfdFmsPositionMonitor.deviation(536, this.ir3PositionDeviation, this.ir3PositionDeviationUnitVisibility)}
            {fcomLine(561, 22, 725)}
            {line(592, 'GPS1', this.gnss1PositionText)}
            {line(632, 'GPS2', this.gnss2PositionText)}

            {fcomAt(
              721.5,
              11,
              <Button
                label="POSITION<br />UPDATE"
                disabled={Subject.create(true)} // FCOM: only when the FMS navigation mode is not IRS/GPS (not modelled)
                onClick={() => {}}
                buttonStyle="min-width: 127px; min-height: 57px;"
              />,
            )}
            {fcomRight(704, 576, <span class="mfd-label">BRG / DIST TO</span>)}
            {fcomAt(
              704,
              592,
              <InputField<Fix, string, false>
                dataEntryFormat={new FixFormat()}
                readonlyValue={this.monitorWaypoint}
                onModified={async (v) => {
                  if (v) {
                    if (this.props.fmcService.master) {
                      const wpt = await WaypointEntryUtils.getOrCreateWaypoint(this.props.fmcService.master, v, true);
                      if (!wpt) {
                        throw new FmsError(FmsErrorType.NotInDatabase);
                      }
                      this.monitorWaypoint.set(wpt);
                    } else {
                      this.monitorWaypoint.set(null);
                    }
                  } else {
                    this.monitorWaypoint.set(null);
                  }
                }}
                enteredByPilot={this.waypointEntered}
                canBeCleared={Subject.create(true)}
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
                containerStyle="width: 140px;"
              />,
            )}
            {fcomRight(743, 429, [
              <span class="mfd-value">{this.bearingToWaypointDisplay}</span>,
              <span class="mfd-label-unit mfd-unit-trailing">{this.bearingUnit}</span>,
            ])}
            {fcomCentre(743, 451, <span class="mfd-value">/</span>)}
            {fcomRight(743, 584, <span class="mfd-value">{this.distanceToWaypointDisplay}</span>)}
            {fcomAt(743, 589, <span class="mfd-label-unit">{this.distanceToWaypointUnit}</span>)}

            {/* FCOM P 286: RETURN always displayed */}
            {fcomAt(
              796,
              3,
              <Button
                label="RETURN"
                onClick={() => this.props.mfd.uiService.navigateTo('back')}
                buttonStyle="min-width: 125px;"
              />,
            )}
            {fcomAt(
              796,
              344,
              <Button
                label="NAVAIDS"
                onClick={() =>
                  this.props.mfd.uiService.navigateTo(
                    `fms/position/navaids/${MfdFmsPositionNavaids.selectedForFmsNavExtra}`,
                  )
                }
                buttonStyle="min-width: 150px;"
              />,
            )}
            {fcomAt(
              796,
              500,
              <Button
                label="GPS"
                onClick={() => this.props.mfd.uiService.navigateTo('fms/position/gps')}
                buttonStyle="min-width: 129px;"
              />,
            )}
            {fcomAt(
              796,
              634,
              <Button
                label="IRS"
                onClick={() => this.props.mfd.uiService.navigateTo('fms/position/irs')}
                buttonStyle="min-width: 130px;"
              />,
            )}
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
