// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { NearbyRunwayProvider, NXDataStore, Raas, RaasCallout, RaasConfig, RaasWord } from '@flybywiresim/fbw-sdk';
import { RAAS_CLIP_LENGTHS } from './RaasClips';

/** The flypad setting (Aircraft Options / Pin Programs): RAAS off, or on with its distance unit */
export type RaasSetting = 'OFF' | 'FEET' | 'METERS';

/**
 * The Runway Awareness and Advisory System, an option of the A320's Honeywell EGPWS (A320 FCOM GEN "RAAS",
 * PRO-NOR-SOP-11 "TAKEOFF RUNWAY....CONFIRM"). The advisories come from the Honeywell product description; the
 * runways come from the sim's airport database, and the voice is played word by word from WAV clips.
 */
export class RaasSystem implements Instrument {
  public static readonly SETTING_KEY = 'CONFIG_A32NX_RAAS';

  private static readonly MAX_CALLOUT_AGE_MS = 5_000;

  private static readonly WORD_GAP_S = 0.03;

  private static readonly PAUSE_S = 0.35;

  /** The A320 flight deck is about 14 m ahead of the aircraft position (the reference datum) */
  private static readonly FLIGHT_DECK_OFFSET_M = 14;

  /** The A320 nominal runway lengths, below which the length is given (the operator's choice on the real system) */
  private static readonly TAKEOFF_NOMINAL_LENGTH_M = 1_800;

  private static readonly LANDING_NOMINAL_LENGTH_M = 1_500;

  private readonly runwayProvider: NearbyRunwayProvider;

  private setting: RaasSetting = 'FEET';

  private raas = this.createRaas('FEET');

  private readonly queue: RaasCallout[] = [];

  /** The words of the callout being said, the current one first */
  private words: RaasWord[] = [];

  /** The L:var of the word being said, reset before the next word so that the same clip can play again */
  private playingLocalVar: string | null = null;

  private wordEndTime = 0;

  constructor(bus: EventBus) {
    this.runwayProvider = new NearbyRunwayProvider(bus);
  }

  public init(): void {
    for (const word of Object.keys(RAAS_CLIP_LENGTHS) as (keyof typeof RAAS_CLIP_LENGTHS)[]) {
      SimVar.SetSimVarValue(RaasSystem.localVar(word), SimVarValueType.Bool, false);
    }
    NXDataStore.getAndSubscribeLegacy(
      RaasSystem.SETTING_KEY,
      (_, value) => {
        const setting: RaasSetting = value === 'OFF' || value === 'METERS' ? value : 'FEET';
        if (setting !== this.setting) {
          this.setting = setting;
          this.raas = this.createRaas(setting);
          this.stop();
        }
      },
      'FEET',
    );
  }

  public onUpdate(): void {
    const now = Date.now();
    // RAAS runs whenever the EGPWS is powered (Honeywell 060-4564-001 4.1.1), whatever its GPWS modes: the GPWS SYS
    // FAULT output also comes on for a glideslope (mode 5) fault on the ground. The EGPWC is on AC BUS 1.
    const available =
      this.setting !== 'OFF' &&
      SimVar.GetSimVarValue('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', SimVarValueType.Bool) &&
      !SimVar.GetSimVarValue('L:A32NX_GPWS_SYS_OFF', SimVarValueType.Bool);
    if (!available) {
      if (this.queue.length > 0 || this.words.length > 0) {
        this.stop();
        this.raas.reset();
      }
      return;
    }

    const latitude = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);
    const longitude = SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree);
    this.runwayProvider.update(latitude, longitude, now);

    const callouts = this.raas.update(
      {
        latitude,
        longitude,
        trueHeading: SimVar.GetSimVarValue('PLANE HEADING DEGREES TRUE', SimVarValueType.Degree),
        trueTrack: SimVar.GetSimVarValue('GPS GROUND TRUE TRACK', SimVarValueType.Degree),
        groundSpeed: SimVar.GetSimVarValue('GPS GROUND SPEED', SimVarValueType.Knots),
        onGround: SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool),
        altitude: SimVar.GetSimVarValue('PLANE ALTITUDE', SimVarValueType.Feet),
        radioAltitude: SimVar.GetSimVarValue('PLANE ALT ABOVE GROUND MINUS CG', SimVarValueType.Feet),
        verticalSpeed: SimVar.GetSimVarValue('VERTICAL SPEED', SimVarValueType.FPM),
      },
      this.runwayProvider.runways,
      now,
    );
    this.queue.push(...callouts);
    this.queue.sort((a, b) => a.advisory - b.advisory);

    this.updateVoice(now);
  }

  /** Says the callouts one word after the other; the EGPWS aural alerts have priority over RAAS */
  private updateVoice(now: number): void {
    if (this.playingLocalVar !== null) {
      if (now < this.wordEndTime) {
        return;
      }
      SimVar.SetSimVarValue(this.playingLocalVar, SimVarValueType.Bool, false);
      this.playingLocalVar = null;
      this.wordEndTime = now + RaasSystem.WORD_GAP_S * 1_000;
      return;
    }
    if (now < this.wordEndTime) {
      return;
    }

    if (this.words.length === 0) {
      const gpwsAural = SimVar.GetSimVarValue('L:A32NX_GPWS_AURAL_OUTPUT', SimVarValueType.Number) !== 0;
      while (this.queue.length > 0 && now - this.queue[0].time > RaasSystem.MAX_CALLOUT_AGE_MS) {
        this.queue.shift();
      }
      if (gpwsAural || this.queue.length === 0) {
        return;
      }
      this.words = [...this.queue.shift()!.words];
    }

    const word = this.words.shift()!;
    if (word === 'pause') {
      this.wordEndTime = now + RaasSystem.PAUSE_S * 1_000;
      return;
    }
    this.playingLocalVar = RaasSystem.localVar(word);
    SimVar.SetSimVarValue(this.playingLocalVar, SimVarValueType.Bool, true);
    this.wordEndTime = now + RAAS_CLIP_LENGTHS[word] * 1_000;
  }

  private stop(): void {
    this.queue.length = 0;
    this.words = [];
    if (this.playingLocalVar !== null) {
      SimVar.SetSimVarValue(this.playingLocalVar, SimVarValueType.Bool, false);
      this.playingLocalVar = null;
    }
  }

  private createRaas(setting: RaasSetting): Raas {
    const config: RaasConfig = {
      distanceUnit: setting === 'METERS' ? 'meters' : 'feet',
      flightDeckOffset: RaasSystem.FLIGHT_DECK_OFFSET_M,
      takeoffNominalLength: RaasSystem.TAKEOFF_NOMINAL_LENGTH_M,
      landingNominalLength: RaasSystem.LANDING_NOMINAL_LENGTH_M,
      // The Airbus window, clear of the 400 ft callout
      suppressWindow: [450, 350],
      extendedHoldingInitial: 90,
      extendedHoldingRepeat: 120,
    };
    return new Raas(config);
  }

  /** e.g. L:A32NX_RAAS_AUDIO_ON_RUNWAY */
  private static localVar(word: Exclude<RaasWord, 'pause'>): string {
    return `L:A32NX_RAAS_AUDIO_${word.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
  }
}
