// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  ConsumerSubject,
  EventBus,
  Instrument,
  InstrumentBackplane,
  MappedSubject,
  SimVarPublisher,
  SimVarValueType,
} from '@microsoft/msfs-sdk';
import {
  Arinc429LocalVarConsumerSubject,
  Arinc429WordData,
  ClientState,
  EfisNdMode,
  TawsAircraftStatusDataDto,
  TawsData,
  TawsEfisDataDto,
} from '@flybywiresim/fbw-sdk';

interface TawsStatusSimVars {
  /** Raw ARINC 429 words of the EGPWC */
  egpwcPresentLatitude: number;
  egpwcPresentLongitude: number;
  egpwcPresentAltitude: number;
  egpwcPresentHeading: number;
  egpwcPresentVerticalSpeed: number;
  egpwcDestinationLatitude: number;
  egpwcDestinationLongitude: number;
  egpwcGearIsDown: number;
  egpwcTerrOnNdRenderingMode: number;
  /** ND range in NM, mode and TERR ON ND state of each side, as the EGPWC publishes them */
  ndRangeCapt: number;
  ndModeCapt: number;
  terrainActiveCapt: boolean;
  ndRangeFo: number;
  ndModeFo: number;
  terrainActiveFo: boolean;
  /** The sim's own position, whatever the ADIRS say */
  groundTruthLatitude: number;
  groundTruthLongitude: number;
}

class TawsStatusPublisher extends SimVarPublisher<TawsStatusSimVars> {
  constructor(bus: EventBus) {
    super(
      new Map([
        ['egpwcPresentLatitude', { name: 'L:A32NX_EGPWC_PRESENT_LAT', type: SimVarValueType.Number }],
        ['egpwcPresentLongitude', { name: 'L:A32NX_EGPWC_PRESENT_LONG', type: SimVarValueType.Number }],
        ['egpwcPresentAltitude', { name: 'L:A32NX_EGPWC_PRESENT_ALTITUDE', type: SimVarValueType.Number }],
        ['egpwcPresentHeading', { name: 'L:A32NX_EGPWC_PRESENT_HEADING', type: SimVarValueType.Number }],
        ['egpwcPresentVerticalSpeed', { name: 'L:A32NX_EGPWC_PRESENT_VERTICAL_SPEED', type: SimVarValueType.Number }],
        ['egpwcDestinationLatitude', { name: 'L:A32NX_EGPWC_DEST_LAT', type: SimVarValueType.Number }],
        ['egpwcDestinationLongitude', { name: 'L:A32NX_EGPWC_DEST_LONG', type: SimVarValueType.Number }],
        ['egpwcGearIsDown', { name: 'L:A32NX_EGPWC_GEAR_IS_DOWN', type: SimVarValueType.Number }],
        ['egpwcTerrOnNdRenderingMode', { name: 'L:A32NX_EGPWC_TERRONND_RENDERING_MODE', type: SimVarValueType.Number }],
        ['ndRangeCapt', { name: 'L:A32NX_EGPWC_ND_L_RANGE', type: SimVarValueType.Number }],
        ['ndModeCapt', { name: 'L:A32NX_EFIS_L_ND_MODE', type: SimVarValueType.Number }],
        ['terrainActiveCapt', { name: 'L:A32NX_EGPWC_ND_L_TERRAIN_ACTIVE', type: SimVarValueType.Bool }],
        ['ndRangeFo', { name: 'L:A32NX_EGPWC_ND_R_RANGE', type: SimVarValueType.Number }],
        ['ndModeFo', { name: 'L:A32NX_EFIS_R_ND_MODE', type: SimVarValueType.Number }],
        ['terrainActiveFo', { name: 'L:A32NX_EGPWC_ND_R_TERRAIN_ACTIVE', type: SimVarValueType.Bool }],
        ['groundTruthLatitude', { name: 'PLANE LATITUDE', type: SimVarValueType.Degree }],
        ['groundTruthLongitude', { name: 'PLANE LONGITUDE', type: SimVarValueType.Degree }],
      ]),
      bus,
    );
  }
}

/**
 * Sends the aircraft status the SimBridge terrain service needs (position, EFIS settings, TERR ON ND state of each
 * ND) over HTTP, the way the A380X's EfisTawsBridge does. The terronnd gauge used to send it over SimConnect and
 * receive SimBridge's terrain picture in return; the ND now draws its own terrain (the ndwxr gauge) and only takes
 * the TERR peaks box figures from SimBridge, which it computes from this status. Same content as terronnd's
 * status block (collection.cpp); no VD on the A32NX. Sent on every change, at most every 200 ms, and at least
 * every 30 s: SimBridge drops the HTTP source after two minutes of silence.
 */
export class TawsStatusBridge implements Instrument {
  private static readonly MIN_POST_INTERVAL_MS = 200;

  private static readonly REPOST_INTERVAL_MS = 30_000;

  private readonly bus = new EventBus();

  private readonly backplane = new InstrumentBackplane();

  private readonly publisher = new TawsStatusPublisher(this.bus);

  private readonly sub = this.bus.getSubscriber<TawsStatusSimVars>();

  private readonly simBridgeClient = ClientState.getInstance();

  private readonly coordinateEquality = (a: Arinc429WordData, b: Arinc429WordData) =>
    a.ssm === b.ssm && a.value.toPrecision(4) === b.value.toPrecision(4);

  private readonly roundedEquality = (a: Arinc429WordData, b: Arinc429WordData) =>
    a.ssm === b.ssm && Math.round(a.value) === Math.round(b.value);

  private readonly latitude = Arinc429LocalVarConsumerSubject.create(this.sub.on('egpwcPresentLatitude')).map(
    (v) => v,
    this.coordinateEquality,
  );

  private readonly longitude = Arinc429LocalVarConsumerSubject.create(this.sub.on('egpwcPresentLongitude')).map(
    (v) => v,
    this.coordinateEquality,
  );

  private readonly altitude = Arinc429LocalVarConsumerSubject.create(this.sub.on('egpwcPresentAltitude')).map(
    (v) => v,
    this.roundedEquality,
  );

  private readonly heading = Arinc429LocalVarConsumerSubject.create(this.sub.on('egpwcPresentHeading')).map(
    (v) => v,
    this.roundedEquality,
  );

  private readonly verticalSpeed = Arinc429LocalVarConsumerSubject.create(this.sub.on('egpwcPresentVerticalSpeed')).map(
    (v) => v,
    this.roundedEquality,
  );

  private readonly destinationLatitude = Arinc429LocalVarConsumerSubject.create(
    this.sub.on('egpwcDestinationLatitude'),
  ).map((v) => v, this.coordinateEquality);

  private readonly destinationLongitude = Arinc429LocalVarConsumerSubject.create(
    this.sub.on('egpwcDestinationLongitude'),
  ).map((v) => v, this.coordinateEquality);

  private readonly gearIsDown = ConsumerSubject.create(this.sub.on('egpwcGearIsDown'), 1);

  private readonly renderingMode = ConsumerSubject.create(this.sub.on('egpwcTerrOnNdRenderingMode'), 0);

  private readonly ndRangeCapt = ConsumerSubject.create(this.sub.on('ndRangeCapt'), 0);

  private readonly ndModeCapt = ConsumerSubject.create(this.sub.on('ndModeCapt'), 0);

  private readonly terrainActiveCapt = ConsumerSubject.create(this.sub.on('terrainActiveCapt'), false);

  private readonly ndRangeFo = ConsumerSubject.create(this.sub.on('ndRangeFo'), 0);

  private readonly ndModeFo = ConsumerSubject.create(this.sub.on('ndModeFo'), 0);

  private readonly terrainActiveFo = ConsumerSubject.create(this.sub.on('terrainActiveFo'), false);

  private readonly groundTruthLatitude = ConsumerSubject.create(this.sub.on('groundTruthLatitude').withPrecision(4), 0);

  private readonly groundTruthLongitude = ConsumerSubject.create(
    this.sub.on('groundTruthLongitude').withPrecision(4),
    0,
  );

  private readonly efisDataCapt = MappedSubject.create(
    ([range, mode, terrainActive]) => TawsStatusBridge.efisData(range, mode, terrainActive),
    this.ndRangeCapt,
    this.ndModeCapt,
    this.terrainActiveCapt,
  );

  private readonly efisDataFo = MappedSubject.create(
    ([range, mode, terrainActive]) => TawsStatusBridge.efisData(range, mode, terrainActive),
    this.ndRangeFo,
    this.ndModeFo,
    this.terrainActiveFo,
  );

  private readonly aircraftStatus = MappedSubject.create(
    ([
      latitude,
      longitude,
      altitude,
      heading,
      verticalSpeed,
      gearIsDown,
      destinationLatitude,
      destinationLongitude,
      efisDataCapt,
      efisDataFo,
      renderingMode,
      groundTruthLatitude,
      groundTruthLongitude,
    ]) => {
      return {
        adiruDataValid:
          latitude.isNormalOperation() &&
          longitude.isNormalOperation() &&
          altitude.isNormalOperation() &&
          heading.isNormalOperation() &&
          verticalSpeed.isNormalOperation(),
        tawsInop: false,
        latitude: latitude.value,
        longitude: longitude.value,
        altitude: altitude.value,
        heading: heading.value,
        verticalSpeed: verticalSpeed.value,
        gearIsDown: gearIsDown !== 0,
        runwayDataValid: destinationLatitude.isNormalOperation() && destinationLongitude.isNormalOperation(),
        runwayLatitude: destinationLatitude.value,
        runwayLongitude: destinationLongitude.value,
        efisDataCapt,
        efisDataFO: efisDataFo,
        navigationDisplayRenderingMode: renderingMode,
        manualAzimEnabled: false,
        manualAzimDegrees: 0,
        groundTruthLatitude,
        groundTruthLongitude,
      } as TawsAircraftStatusDataDto;
    },
    this.latitude,
    this.longitude,
    this.altitude,
    this.heading,
    this.verticalSpeed,
    this.gearIsDown,
    this.destinationLatitude,
    this.destinationLongitude,
    this.efisDataCapt,
    this.efisDataFo,
    this.renderingMode,
    this.groundTruthLatitude,
    this.groundTruthLongitude,
  );

  private shouldPost = true;

  private postPending = false;

  private lastAttemptTime = 0;

  private lastPostTime = 0;

  /** The EFIS part of the status for one ND: the terrain is asked for on the map pages only (not PLAN), the VD does not exist. */
  private static efisData(rangeNm: number, mode: number, terrainActive: boolean): TawsEfisDataDto {
    return {
      ndRange: Math.max(rangeNm, 0),
      arcMode: mode === EfisNdMode.ARC,
      terrOnNd: terrainActive && mode !== EfisNdMode.PLAN,
      terrOnVd: false,
      efisMode: mode,
      vdRangeLower: 0,
      vdRangeUpper: 0,
    };
  }

  /** @inheritdoc */
  public init(): void {
    this.backplane.addPublisher('tawsStatus', this.publisher);
    this.backplane.init();
    this.aircraftStatus.sub(() => {
      this.shouldPost = true;
    });
  }

  /** @inheritdoc */
  public onUpdate(): void {
    this.backplane.onUpdate();

    const now = Date.now();
    if (now - this.lastPostTime > TawsStatusBridge.REPOST_INTERVAL_MS) {
      this.shouldPost = true;
    }
    if (
      !this.shouldPost ||
      this.postPending ||
      now - this.lastAttemptTime < TawsStatusBridge.MIN_POST_INTERVAL_MS ||
      !this.simBridgeClient.isConnected()
    ) {
      return;
    }

    this.lastAttemptTime = now;
    this.postPending = true;
    TawsData.postAircraftStatusData(this.aircraftStatus.get())
      .then((success) => {
        if (success) {
          this.shouldPost = false;
          this.lastPostTime = Date.now();
        }
        this.postPending = false;
      })
      .catch(() => {
        this.postPending = false;
      });
  }
}
