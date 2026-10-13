// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { EventBus, SimVarValueType, Subscribable } from '@microsoft/msfs-sdk';
import { FWS_VOICE_CLIP_LENGTHS } from './FwsVoiceClips';

export interface FwsSoundManagerControlEvents {
  enqueueSound: string;
  dequeueSound: string;
}

// Synthetic voice has priority over everything, SC is least important
enum FwsAuralWarningType {
  SingleChime,
  AuralWarning,
  SyntheticVoice,
}

export enum FwsAuralVolume {
  Full, // 0 dB
  Attenuated, // -6dB
  Silent, // -200 dB
}

interface FwsAural {
  /** The LocalVar which triggers the playback. Not prefixed by L: here. Either localVarName or wwiseEventName has to be defined. */
  localVarName?: string;
  /** The Wwise event which triggers the playback. Either localVarName or wwiseEventName has to be defined. */
  wwiseEventName?: string;
  /** Sounds are queued based on type and priority (highest priority = gets queued first within same type) */
  priority: number;
  type: FwsAuralWarningType;
  /** Length of audio in seconds, if non-repetitive */
  length?: number;
  /** If this is set, this sound is repeated periodically with the specified pause in seconds */
  periodicWithPause?: number;
  continuous?: boolean;

  /** If true, sound is immediately stopped upon request */
  immediateStop?: boolean;
}

export interface FwsAudioOutputSignals {
  keepMaxReverse: boolean;
}

const KEEP_MAX_REVERSE_OUTPUT_VAR = 'A32NX_AUDIO_ROP_KEEP_MAX_REVERSE';

export const FwsAuralsList: Record<string, FwsAural> = {
  continuousRepetitiveChime: {
    localVarName: 'A32NX_FWC_CRC',
    priority: 5,
    type: FwsAuralWarningType.AuralWarning,
    continuous: true,
  },
  singleChime: {
    localVarName: 'A32NX_FWC_SC',
    length: 0.4,
    priority: 0,
    type: FwsAuralWarningType.SingleChime,
    continuous: false,
    immediateStop: true,
  },
  cavalryChargeOnce: {
    localVarName: 'A32NX_FWC_CAVALRY_CHARGE',
    length: 0.9,
    priority: 4,
    type: FwsAuralWarningType.AuralWarning,
    continuous: false,
  },
  cavalryChargeCont: {
    localVarName: 'A32NX_FWC_CAVALRY_CHARGE',
    priority: 4,
    type: FwsAuralWarningType.AuralWarning,
    continuous: true,
  },
  tripleClick: {
    localVarName: 'A32NX_FMA_TRIPLE_CLICK',
    length: 0.62,
    priority: 3,
    type: FwsAuralWarningType.AuralWarning,
    continuous: false,
  },
  v1: {
    localVarName: 'A32NX_AUDIO_V1_CALLOUT',
    length: 1.3,
    priority: 1,
    type: FwsAuralWarningType.SyntheticVoice,
    continuous: false,
  },
  runwayTooShort: {
    localVarName: 'A32NX_AUDIO_ROW_RWY_TOO_SHORT',
    length: 1.6,
    priority: 4,
    type: FwsAuralWarningType.SyntheticVoice,
    continuous: true,
  },
  keepMaxReverse: {
    localVarName: KEEP_MAX_REVERSE_OUTPUT_VAR,
    length: 1.4,
    priority: 18,
    type: FwsAuralWarningType.SyntheticVoice,
    continuous: false,
  },
  autoBrakeOff: {
    localVarName: 'A32NX_AUDIO_AUTOBRAKE_OFF',
    length: 1.5,
    priority: 17,
    type: FwsAuralWarningType.SyntheticVoice,
    continuous: false,
  },
  setMaxReverse: {
    localVarName: 'A32NX_AUDIO_ROW_SET_MAX_REVERSE',
    length: 1.62,
    priority: 19,
    type: FwsAuralWarningType.SyntheticVoice,
    continuous: false,
  },
  brakeMaxBraking: {
    localVarName: 'A32NX_AUDIO_ROP_MAX_BRAKING',
    length: 3.1,
    priority: 20,
    type: FwsAuralWarningType.SyntheticVoice,
    continuous: true,
  },
  stall: {
    localVarName: 'A32NX_AUDIO_ROP_MAX_BRAKING',
    length: 3.0,
    priority: 5,
    type: FwsAuralWarningType.SyntheticVoice,
    continuous: true,
  },
  cChordOnce: {
    localVarName: 'A32NX_ALT_DEVIATION',
    length: 1.0,
    priority: 3,
    type: FwsAuralWarningType.AuralWarning,
    continuous: false,
  },
  cChordCont: {
    localVarName: 'A32NX_ALT_DEVIATION',
    priority: 3,
    type: FwsAuralWarningType.AuralWarning,
    continuous: true,
  },
  // Altitude callouts
  minimums: {
    wwiseEventName: 'aural_minimumnew',
    length: 0.67,
    priority: 15,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  hundred_above: {
    wwiseEventName: 'aural_100above',
    length: 0.72,
    priority: 16,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  retard: {
    wwiseEventName: 'new_retard',
    length: 0.9,
    periodicWithPause: 0.2,
    priority: 22,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_2500: {
    wwiseEventName: 'new_2500',
    length: 1.1,
    priority: 0,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_2500b: {
    wwiseEventName: 'new_2_500',
    length: 1.047,
    priority: 1,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_2000: {
    wwiseEventName: 'new_2000',
    length: 0.72,
    priority: 2,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_1000: {
    wwiseEventName: 'new_1000',
    length: 0.9,
    priority: 3,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_500: {
    wwiseEventName: 'new_500',
    length: 0.6,
    priority: 4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_400: {
    wwiseEventName: 'new_400',
    length: 0.6,
    priority: 5,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_300: {
    wwiseEventName: 'new_300',
    length: 0.6,
    priority: 6,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_200: {
    wwiseEventName: 'new_200',
    length: 0.6,
    priority: 7,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_100: {
    wwiseEventName: 'new_100',
    length: 0.6,
    priority: 8,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_90: {
    wwiseEventName: '90_380',
    length: 0.4,
    priority: 8,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_80: {
    wwiseEventName: '80_380',
    length: 0.4,
    priority: 8,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_70: {
    wwiseEventName: '70_380',
    length: 0.4,
    priority: 8,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_60: {
    wwiseEventName: '60_380',
    length: 0.4,
    priority: 8,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_50: {
    wwiseEventName: '50_380',
    length: 0.4,
    priority: 9,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_40: {
    wwiseEventName: '40_380',
    length: 0.4,
    priority: 10,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_30: {
    wwiseEventName: '30_380',
    length: 0.4,
    priority: 11,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_20: {
    wwiseEventName: '20_380',
    length: 0.4,
    priority: 12,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_10: {
    wwiseEventName: '10_380',
    length: 0.3,
    priority: 13,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  alt_5: {
    wwiseEventName: '5_380',
    length: 0.3,
    priority: 14,
    type: FwsAuralWarningType.SyntheticVoice,
  },

  // Intermediate callout words (shared/src/AutoCallOuts.ts IntermediateCallout): the height callout voices, said
  // hundreds first (higher priority), then tens. Lowest priority of the synthetic voices.
  intermediate_100: {
    wwiseEventName: 'new_100',
    length: 0.6,
    priority: -3,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_200: {
    wwiseEventName: 'new_200',
    length: 0.6,
    priority: -3,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_300: {
    wwiseEventName: 'new_300',
    length: 0.6,
    priority: -3,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_90: {
    wwiseEventName: '90_380',
    length: 0.4,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_80: {
    wwiseEventName: '80_380',
    length: 0.4,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_70: {
    wwiseEventName: '70_380',
    length: 0.4,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_60: {
    wwiseEventName: '60_380',
    length: 0.4,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_50: {
    wwiseEventName: '50_380',
    length: 0.4,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_40: {
    wwiseEventName: '40_380',
    length: 0.4,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_30: {
    wwiseEventName: '30_380',
    length: 0.4,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_20: {
    wwiseEventName: '20_380',
    length: 0.4,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_10: {
    wwiseEventName: '10_380',
    length: 0.3,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  // Below 100 ft the unit word comes after the tens word (FORTY SEVEN): lower priority than the tens. FIVE is the bank
  // voice, ONE to NINE and ELEVEN to NINETEEN are WAV clips of tools/fws-voice/generate.py (sound.xml Wave Data).
  intermediate_5: {
    wwiseEventName: '5_380',
    length: 0.3,
    priority: -5,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_11: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_11',
    length: FWS_VOICE_CLIP_LENGTHS.height11,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_12: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_12',
    length: FWS_VOICE_CLIP_LENGTHS.height12,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_13: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_13',
    length: FWS_VOICE_CLIP_LENGTHS.height13,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_14: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_14',
    length: FWS_VOICE_CLIP_LENGTHS.height14,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_15: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_15',
    length: FWS_VOICE_CLIP_LENGTHS.height15,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_16: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_16',
    length: FWS_VOICE_CLIP_LENGTHS.height16,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_17: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_17',
    length: FWS_VOICE_CLIP_LENGTHS.height17,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_18: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_18',
    length: FWS_VOICE_CLIP_LENGTHS.height18,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_19: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_19',
    length: FWS_VOICE_CLIP_LENGTHS.height19,
    priority: -4,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_1: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_1',
    length: FWS_VOICE_CLIP_LENGTHS.height1,
    priority: -5,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_2: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_2',
    length: FWS_VOICE_CLIP_LENGTHS.height2,
    priority: -5,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_3: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_3',
    length: FWS_VOICE_CLIP_LENGTHS.height3,
    priority: -5,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_4: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_4',
    length: FWS_VOICE_CLIP_LENGTHS.height4,
    priority: -5,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_6: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_6',
    length: FWS_VOICE_CLIP_LENGTHS.height6,
    priority: -5,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_7: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_7',
    length: FWS_VOICE_CLIP_LENGTHS.height7,
    priority: -5,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_8: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_8',
    length: FWS_VOICE_CLIP_LENGTHS.height8,
    priority: -5,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  intermediate_9: {
    localVarName: 'A32NX_FWS_AUDIO_HEIGHT_9',
    length: FWS_VOICE_CLIP_LENGTHS.height9,
    priority: -5,
    type: FwsAuralWarningType.SyntheticVoice,
  },

  // PRIORITY LEFT / PRIORITY RIGHT (FwsSidestickPriority): WAV clips of tools/fws-voice/generate.py, played by the
  // sound.xml Wave Data entries. The FCOM gives no priority among the synthetic voices: design choice, below the
  // height callouts, above the intermediate callout.
  priorityLeft: {
    localVarName: 'A32NX_FWS_AUDIO_PRIORITY_LEFT',
    length: FWS_VOICE_CLIP_LENGTHS.priorityLeft,
    priority: -1,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  priorityRight: {
    localVarName: 'A32NX_FWS_AUDIO_PRIORITY_RIGHT',
    length: FWS_VOICE_CLIP_LENGTHS.priorityRight,
    priority: -1,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  // PITCH PITCH, "Sounds 2 times" (a380_fcom.txt l.9048, 73618-73619), one clip (FwsPitchAural). Priority of the
  // A32NX FWC pitchPitch.
  pitchPitch: {
    localVarName: 'A32NX_FWS_AUDIO_PITCH',
    length: FWS_VOICE_CLIP_LENGTHS.pitchPitch,
    priority: 25,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  // COMPANY MESSAGE, "Sounds 1 time" (a380_fcom.txt l.73651-73652), FwsCompanyMessageAural. Design choice: below the
  // PRIORITY LEFT / RIGHT voices, above the intermediate callout.
  companyMessage: {
    localVarName: 'A32NX_FWS_AUDIO_COMPANY_MESSAGE',
    length: FWS_VOICE_CLIP_LENGTHS.companyMessage,
    priority: -2,
    type: FwsAuralWarningType.SyntheticVoice,
  },
  // WINDSHEAR, "Sounds 3 times" (a380_fcom.txt l.9274-9276, 73643), one clip: highest priority of the synthetic voices
  windshear: {
    localVarName: 'A32NX_FWS_AUDIO_WINDSHEAR',
    length: FWS_VOICE_CLIP_LENGTHS.windshear,
    priority: 30,
    type: FwsAuralWarningType.SyntheticVoice,
  },
};

// FIXME Not all sounds are added to this yet (e.g. CIDS chimes), consider adding them in the future
// Also, single chimes are not filtered (in RL only once every two seconds)
export class FwsSoundManager {
  private readonly soundQueue = new Set<keyof typeof FwsAuralsList>();

  private singleChimesPending = 0;

  private currentSoundPlaying: keyof typeof FwsAuralsList | null = null;

  /** in seconds */
  private currentSoundPlayTimeRemaining = 0;

  private readonly soundOutputs: FwsAudioOutputSignals = {
    keepMaxReverse: false,
  };

  constructor(
    private readonly bus: EventBus,
    private readonly startupCompleted: Subscribable<boolean>,
    private readonly audioFunctionLost: Subscribable<boolean>,
  ) {
    // Stop all sounds
    Object.values(FwsAuralsList).forEach((a) => {
      if (a.localVarName) {
        SimVar.SetSimVarValue(`L:${a.localVarName}`, SimVarValueType.Bool, false);
      }
    });

    const sub = this.bus.getSubscriber<FwsSoundManagerControlEvents>();
    sub.on('enqueueSound').handle((s) => this.enqueueSound(s));
    sub.on('dequeueSound').handle((s) => this.dequeueSound(s));
  }

  /** Add sound to queue. Don't add if already playing */
  enqueueSound(soundKey: keyof typeof FwsAuralsList) {
    const sound = FwsAuralsList[soundKey];
    if (!sound || this.currentSoundPlaying === soundKey) {
      return;
    }

    if (sound.type === FwsAuralWarningType.SyntheticVoice || sound.type === FwsAuralWarningType.AuralWarning) {
      this.soundQueue.add(soundKey);
    } else if (sound.type === FwsAuralWarningType.SingleChime) {
      this.singleChimesPending++;
    }
  }

  /** Remove sound from queue, e.g. when condition doesn't apply anymore. If sound is currently playing, stops sound immediately */
  dequeueSound(soundKey: keyof typeof FwsAuralsList) {
    // Check if this sound is currently playing
    if (this.currentSoundPlaying === soundKey) {
      const sound = FwsAuralsList[this.currentSoundPlaying];
      if (sound !== undefined) {
        this.stopCurrentSound(sound);
      }
    }
    this.soundQueue.delete(soundKey);
  }

  /**
   * EMER CANC pb (A380 FCOM DSC-31-40-20): cancels all the audio indicators and aural alerts, the one playing and the
   * queued ones. A sound whose triggering conditions occur again sounds again.
   * @returns whether there was a sound to cancel
   */
  cancelAll(): boolean {
    const anySound = this.currentSoundPlaying !== null || this.soundQueue.size > 0 || this.singleChimesPending > 0;
    for (const soundKey of [...this.soundQueue]) {
      this.dequeueSound(soundKey);
    }
    if (this.currentSoundPlaying !== null) {
      this.dequeueSound(this.currentSoundPlaying);
    }
    this.singleChimesPending = 0;
    return anySound;
  }

  private stopCurrentSound(currentSound?: FwsAural) {
    const sound =
      currentSound !== undefined
        ? currentSound
        : this.currentSoundPlaying !== null
          ? FwsAuralsList[this.currentSoundPlaying]
          : null;
    if (sound) {
      // Only LVar sounds which are continuous or with explicit stop can be stopped
      if (!sound.localVarName || (!sound.continuous && !sound.immediateStop)) {
        return;
      }
      SimVar.SetSimVarValue(`L:${sound.localVarName}`, SimVarValueType.Bool, false);
      this.currentSoundPlaying = null;
      this.currentSoundPlayTimeRemaining = 0;
      this.setAudioOutputSignals(sound.localVarName, false);
    }
  }

  /**
   * Convenience function for FWS: If condition true and sound not already playing, add to queue. If not, dequeue sound
   * */
  handleSoundCondition(soundKey: keyof typeof FwsAuralsList, condition: boolean) {
    if (condition && this.currentSoundPlaying !== soundKey) {
      this.enqueueSound(soundKey);
    } else if (!condition) {
      this.dequeueSound(soundKey);
    }
  }

  /** This only has an effect on sounds defining WwiseRTPC behavior/var for volume */
  setVolume(volume: FwsAuralVolume) {
    SimVar.SetSimVarValue('L:A32NX_FWS_AUDIO_VOLUME', SimVarValueType.Enum, volume);
  }

  /** Play now, not to be called from the outside */
  private playSound(soundKey: keyof typeof FwsAuralsList) {
    const sound = FwsAuralsList[soundKey];
    if (!sound) {
      return;
    }

    if (sound.localVarName) {
      SimVar.SetSimVarValue(`L:${sound.localVarName}`, SimVarValueType.Bool, true);
      this.setAudioOutputSignals(sound.localVarName, true);
    } else if (sound.wwiseEventName) {
      Coherent.call('PLAY_INSTRUMENT_SOUND', sound.wwiseEventName);
    }
    this.currentSoundPlaying = soundKey;
    this.currentSoundPlayTimeRemaining = sound.continuous ? Infinity : sound.length ?? 0;
    this.soundQueue.delete(soundKey);
  }

  /** Find most important sound from soundQueue and play */
  private selectAndPlayMostImportantSound(): keyof typeof FwsAuralsList | null {
    if (!this.startupCompleted.get() || this.audioFunctionLost.get()) {
      return null;
    }

    // Logic for scheduling new sounds: Take sound from soundQueue of most important type
    // (SyntheticVoice > AuralWarning > SingleChime) with highest priority, and play it
    let selectedSoundKey: keyof typeof FwsAuralsList | null = null;
    this.soundQueue.forEach((sk) => {
      const s = FwsAuralsList[sk];
      if (
        selectedSoundKey === null ||
        s.type > FwsAuralsList[selectedSoundKey].type ||
        (s.type === FwsAuralsList[selectedSoundKey].type && s.priority > FwsAuralsList[selectedSoundKey].priority)
      ) {
        selectedSoundKey = sk;
      }
    });

    if (selectedSoundKey) {
      this.playSound(selectedSoundKey);
      return selectedSoundKey;
    }

    // See if single chimes are left
    if (this.singleChimesPending) {
      this.playSound('singleChime');
      this.singleChimesPending--;
      return 'singleChime';
    }

    // Ok, nothing to play
    return null;
  }

  onUpdate(deltaTime: number) {
    if (this.audioFunctionLost.get()) {
      while (this.currentSoundPlaying) {
        this.stopCurrentSound();
      }
      return;
    }

    // Either wait for the current sound to finish, or schedule the next sound
    if (this.currentSoundPlaying && this.currentSoundPlayTimeRemaining > 0) {
      if (this.currentSoundPlayTimeRemaining - deltaTime / 1_000 > 0) {
        // Wait for sound to be finished
        this.currentSoundPlayTimeRemaining -= deltaTime / 1_000;
      } else {
        const sound = FwsAuralsList[this.currentSoundPlaying];
        // Sound finishes in this cycle
        if (sound.localVarName) {
          SimVar.SetSimVarValue(`L:${sound.localVarName}`, SimVarValueType.Bool, false);
          this.setAudioOutputSignals(sound.localVarName, false);
        }
        this.currentSoundPlaying = null;
        this.currentSoundPlayTimeRemaining = 0;
      }

      // Interrupt if sound with higher category is present in queue and current sound is continuous
      let shouldInterrupt = false;
      let rescheduleSound: keyof typeof FwsAuralsList | null = null;
      this.soundQueue.forEach((sk) => {
        const s = FwsAuralsList[sk];
        if (
          s &&
          this.currentSoundPlaying &&
          FwsAuralsList[this.currentSoundPlaying]?.continuous &&
          s.type > FwsAuralsList[this.currentSoundPlaying].type
        ) {
          shouldInterrupt = true;
        }
      });

      if (shouldInterrupt) {
        if (this.currentSoundPlaying && FwsAuralsList[this.currentSoundPlaying]?.continuous) {
          rescheduleSound = this.currentSoundPlaying;
          this.stopCurrentSound();
          if (rescheduleSound) {
            this.enqueueSound(rescheduleSound);
          }
        }
      }
    } else {
      // Play next sound
      this.selectAndPlayMostImportantSound();
    }
  }

  private setAudioOutputSignals(localVarName: string, value: boolean) {
    if (localVarName === KEEP_MAX_REVERSE_OUTPUT_VAR) {
      this.soundOutputs.keepMaxReverse = value;
    }
  }

  public getKeepMaxReversePlayed(): boolean {
    return this.soundOutputs.keepMaxReverse;
  }
}
