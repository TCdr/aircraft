// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

export class McduMessage {
  public isTypeTwo = false;

  constructor(
    public text: string,
    public isAmber = false,
    public replace = '',
  ) {}
}

export class TypeIMessage extends McduMessage {
  constructor(text: string, isAmber = false, replace = '') {
    super(text, isAmber, replace);
  }

  /**
   * Only returning a "copy" of the object to ensure thread safety when trying to edit the original message
   * t {string} replaces defined elements, see this.replace
   */
  getModifiedMessage(t: string): TypeIMessage {
    return new TypeIMessage(t ? this.text.replace(this.replace, `${t}`) : this.text, this.isAmber, this.replace);
  }
}

export class TypeIIMessage extends McduMessage {
  constructor(
    text: string,
    isAmber = false,
    replace = '',
    public isResolved = () => false,
    public onClear = () => {},
  ) {
    super(text, isAmber, replace);

    this.isTypeTwo = true;
  }

  /**
   * Only returning a "copy" of the object to ensure thread safety when trying to edit the original message
   * t {string} replaces defined elements, see this.replace
   * isResolved {function} overrides present function
   * onClear {function} overrides present function
   */
  getModifiedMessage(
    t: string,
    isResolved: (() => boolean) | undefined = undefined,
    onClear: (() => void) | undefined = undefined,
  ) {
    return new TypeIIMessage(
      t ? this.text.replace(this.replace, `${t}`) : this.text,
      this.isAmber,
      this.replace,
      isResolved || this.isResolved,
      onClear || this.onClear,
    );
  }
}

export class ATCCOMMessage extends McduMessage {
  constructor(text: string, isAmber = false, replace = '') {
    super(text, isAmber, replace);
  }

  /**
   * Only returning a "copy" of the object to ensure thread safety when trying to edit the original message
   * t {string} replaces defined elements, see this.replace
   */
  getModifiedMessage(t: string): ATCCOMMessage {
    return new ATCCOMMessage(t ? this.text.replace(this.replace, `${t}`) : this.text, this.isAmber, this.replace);
  }
}

/**
 NXSystemMessages only holds real messages
 */
export const NXSystemMessages = {
  awyWptDisagree: new TypeIMessage('AIRWAY / WPT DISAGREE'), // TODO
  crzFlAboveMaxFL: new TypeIIMessage('CRZ FL ABOVE MAX FL', false),
  cancelAtisUpdate: new TypeIMessage('CANCEL AUTO UPDATE FIRST'), // TODO
  checkAltnWind: new TypeIIMessage('CHECK ALTN WIND'),
  // In cruise within 200 NM of the destination, the descent profile is too short for the maximum cabin rate
  cabinRateExceeded: new TypeIIMessage('CABIN RATE EXCEEDED'),
  checkDestData: new TypeIIMessage('CHECK DEST DATA', true),
  // Type I: an alternate company route that does not start at the destination
  destAltnCpnyRteDisagree: new TypeIMessage('DEST / ALTN CPNY RTE DISAGREE'),
  checkMinFuelAtDest: new TypeIIMessage('CHECK MIN FUEL AT DEST'),
  checkSpeedMode: new TypeIIMessage('CHECK SPD MODE'),
  // Design choice: white, as on the PFD; no colour is published for these two and they do not concern the navigation
  extendSpdBrk: new TypeIIMessage('EXTEND SPD BRK'),
  retractSpdBrk: new TypeIIMessage('RETRACT SPD BRK'),
  /** Shown on the MFD and the PFD (FmsAdvisoryMessages) */
  checkApprSel: new TypeIIMessage('CHECK APPR SEL'),
  checkToData: new TypeIIMessage('CHECK T.O. DATA', true),
  checkZfw: new TypeIIMessage('CHECK ZFW', true),
  comFplnReceivedPendingInsertion: new TypeIIMessage('COMPANY F-PLN RECEIVED\nWAITING FOR INSERTION', false),
  // Company takeoff data messages
  cpnyToDataReceivedPendingInsertion: new TypeIIMessage('COMPANY T.O DATA RECEIVED\nWAITING FOR INSERTION'),
  receivedCpnyToDataNotValid: new TypeIIMessage('RECEIVED COMPANY T.O DATA NOT VALID'),
  comWindRecievedPendingInsertionActive: new TypeIIMessage(
    'COMPANY WIND DATA RECEIVED\nWAITING FOR INSERTION IN ACTIVE',
    false,
  ),
  comWindRecievedPendingInsertionInSecondary: new TypeIIMessage(
    'COMPANY WIND DATA RECEIVED\nWAITING FOR INSERTION IN SEC X',
    false,
    'X',
  ),
  comWindUplinkPending: new TypeIIMessage('COMPANY WIND UPLINK PENDING', true),
  comDatalinkNotAvail: new TypeIMessage('COM DATALINK NOT AVAIL'),
  cstrDelUpToWpt: new TypeIIMessage('CONSTRAINTS BEFORE WWWWW : DELETED', false, 'WWWWW'),
  costIndexInUse: new TypeIMessage('COST INDEX-NNN IN USE', false, 'NNN'),
  destEfobBelowMin: new TypeIIMessage('DEST EFOB BELOW MIN', true),
  draftWindsInserted: new TypeIMessage('DRAFT WIND INSERTED'),
  enterDestData: new TypeIIMessage('ENTER DEST DATA', true),
  // The data communication between the FMS and the Avionics Communication Router is not available
  fmsDatalinkNotAvail: new TypeIIMessage('FMS DATALINK NOT AVAIL'),
  EntryNotInList: new TypeIMessage('ENTRY NOT IN LIST'),
  entryOutOfRange: new TypeIMessage('ENTRY OUT OF RANGE'),
  formatError: new TypeIMessage('FORMAT ERROR'),
  fplnElementRetained: new TypeIMessage('F-PLN ELEMENT RETAINED'), // TODO
  initializeZfwOrZfwCg: new TypeIIMessage('INITIALIZE ZFW / ZFWCG', true),
  newAccAlt: new TypeIIMessage('NEW ACCEL ALT: HHHHH', false, 'HHHHH'),
  newCrzAlt: new TypeIIMessage('NEW CRZ ALT: HHHHH', false, 'HHHHH'),
  newThrRedAlt: new TypeIIMessage('NEW THR RED ALT: HHHHH', false, 'HHHHH'),
  noCompanyReply: new TypeIIMessage('NO COMPANY REPLY'),
  noIntersectionFound: new TypeIMessage('NO INTERSECTION FOUND'),
  notAllowed: new TypeIMessage('NOT ALLOWED'),
  notInDatabase: new TypeIMessage('NOT IN DATABASE'),
  notTransmittedToAcr: new TypeIIMessage('NOT TRANSMITTED TO ACR', false),
  receivedCpnyFplnNotValid: new TypeIIMessage('RECEIVED COMPANY F-PLN NOT VALID', false),
  // The received ATC F-PLN (LOAD-SEC3 of the mailbox) loaded, partially loaded, or rejected
  atcFplnInsertedSec3: new TypeIIMessage('ATC F-PLN INSERTED IN SEC 3', false),
  atcFplnInsertedSec3Rejected: new TypeIIMessage('ATC F-PLN INSERTED IN SEC 3\nREJECTED INFO SEE SEC / INDEX', false),
  receivedAtcMsgNotValid: new TypeIIMessage('RECEIVED ATC MSG NOT VALID', false),
  receivedCpnyWindNotValid: new TypeIIMessage('RECEIVED COMPANY WIND DATA NOT VALID', false),
  rwyLsDisagree: new TypeIIMessage('RUNWAY / LS DISAGREE', true),
  setHoldSpeed: new TypeIIMessage('SET HOLD SPD'),
  tdReached: new TypeIIMessage('T/D REACHED'),
  spdLimExceeded: new TypeIIMessage('SPD LIMIT EXCEEDED', true),
  // Design choice: white, as the A320 type II message (the A380 message table gives no colour)
  spdErrorAt: new TypeIIMessage('SPD ERROR AT XXXXXXX', false, 'XXXXXXX'),
  toSpeedTooLow: new TypeIIMessage('T.O SPEED TOO LOW - CHECK TOW & T.O DATA', true),
  vToDisagree: new TypeIIMessage('V1/VR/V2 DISAGREE', true),
  xxxIsDeselected: new TypeIMessage('XXXX IS DESELECTED', false, 'XXXX'),
  stepAboveMaxFl: new TypeIIMessage('STEP ABOVE MAX FL'),
  stepAhead: new TypeIIMessage('STEP AHEAD'),
  stepDeleted: new TypeIIMessage('STEP DELETED'),
  tooSteepPathAhead: new TypeIIMessage('TOO STEEP PATH AHEAD'),
  navprimary: new TypeIIMessage('NAV PRIMARY'),
  navprimaryLost: new TypeIIMessage('NAV PRIMARY LOST', true),
  sqwkCodeNotValid: new TypeIMessage('SQWK CODE NOT VALID'),
  lateralDiscontinuityAhead: new TypeIIMessage('LATERAL DISCONTINUITY AHEAD', true),
  machSegmentDeleted: new TypeIIMessage('MACH SEGMENT DELETED'),
  // The GPS deselected, 80 NM before the T/D or in APPROACH phase (type II, white)
  gpsDeselected: new TypeIIMessage('GPS DESELECTED'),
  listOf99InUse: new TypeIMessage('LIST OF 99 IN USE'),
  // A new pilot-stored waypoint rejected, the 50 of the database are used
  wptsMaxAllInUse: new TypeIMessage('50 WPTS MAX : ALL IN USE'),
  // A printer communication error while printing a report (type II, white)
  printerNotAvail: new TypeIIMessage('PRINTER NOT AVAIL'),
  pilotRtesListFull: new TypeIMessage('PILOT RTEs LIST FULL'),
  rteIdentAlreadyUsed: new TypeIMessage('RTE IDENT ALREADY USED'),
  someRevisionsNotStored: new TypeIMessage('SOME REVISIONS NOT STORED'),
  // A PLACE/DISTANCE waypoint whose PLACE is not the revised waypoint
  placeWptDisagree: new TypeIMessage('PLACE / WPT DISAGREE'),
  // Message colours: white for the result of a flight crew entry and less important messages, amber for navigation
  // and more important messages.
  // A DIR TO with interception of an inbound/outbound radial is inserted
  adjustDesiredTrkOrHdg: new TypeIIMessage('ADJUST DESIRED TRK OR HDG'),
  // The pilot RNP is above the default RNP, no RNP in the navigation database for the active leg
  areaRnpIs: new TypeIIMessage('AREA RNP IS XX.XX', false, 'XX.XX'),
  // The pilot RNP is above the RNP of the navigation database for the active leg
  procRnpIs: new TypeIIMessage('PROC RNP IS XX.XX', true, 'XX.XX'),
  // The current date does not match the effectivity of the active navigation database
  checkDatabaseCycle: new TypeIIMessage('CHECK DATABASE CYCLE'),
  // At least one IRS position is 5 NM or more from the airport position
  checkIrsArptPosition: new TypeIIMessage('CHECK IRS / ARPT POSITION', true),
  // The procedure turn ahead exceeds the excursion distance of the navigation database
  expectTurnAreaExceedance: new TypeIIMessage('EXPECT TURN AREA EXCEEDANCE', true),
  // The NDB of the NDB approach is not available or deselected
  specifNdbNotAvail: new TypeIIMessage('SPECIF NDB NOT AVAIL', true),
  // The aircraft must leave the holding pattern immediately (extra fuel = 0 at destination)
  timeToExit: new TypeIIMessage('TIME TO EXIT', true),
  // The aircraft clock time reaches the ETT
  toTimeReached: new TypeIIMessage('T.O TIME REACHED'),
  // The CRZ FL change deleted the climb and descent constraints at or above it (flight crew entry)
  constraintsAboveCrzFlDeleted: new TypeIIMessage('CONSTRAINTS ABOVE CRZ FL: DELETED'),
  // Engine out, the selected speed target is not within green dot +/- 10 kt
  checkEoSpdSetting: new TypeIIMessage('CHECK EO SPD SETTING', true),
  // The selected HDG/TRACK does not intercept the flight plan before the TO waypoint
  noNavInterception: new TypeIIMessage('NO NAV INTERCEPTION', true),
  // A temporary flight plan (not a direct to) is pending, and the DIR key of the KCCU is pressed
  insertOrEraseTmpyFirst: new TypeIMessage('INSERT OR ERASE TMPY F-PLN FIRST'),
  // The received flight number of the up linked flight plan data is not valid
  receivedFltNumberNotValid: new TypeIIMessage('RECEIVED FLT NUMBER NOT VALID'),
  // The FMS computes a new managed target speed to meet the time constraint (cleared after 15 s)
  adjustingSpdDueToRta: new TypeIIMessage('ADJUSTING SPD DUE TO RTA'),
  // In preflight, with an RTA, the flight crew tries to delete the FMS computed ETT
  rtaAlreadyExisting: new TypeIMessage('RTA ALREADY EXISTING'),
  // The RTA of the active flight plan was automatically deleted
  rtaDeleted: new TypeIIMessage('RTA DELETED'),
  // The fuel planning is started with an RTA in the flight plan
  rtaNotConsideredForFuelPlanning: new TypeIIMessage('RTA NOT CONSIDERED FOR FUEL PLANNING'),
  // The time constraint at the waypoint will be missed
  timeErrorAt: new TypeIIMessage('TIME ERROR AT WWWWWWW', true, 'WWWWWWW'),
};

export const NXFictionalMessages = {
  noNavigraphUser: new TypeIMessage('NO NAVIGRAPH USER'),
  internalError: new TypeIMessage('INTERNAL ERROR'),
  noAirportSpecified: new TypeIMessage('NO AIRPORT SPECIFIED'),
  fltNbrInUse: new TypeIMessage('FLT NBR IN USE'),
  fltNbrMissing: new TypeIMessage('ENTER ATC FLT NBR'),
  notYetImplemented: new TypeIMessage('NOT YET IMPLEMENTED'),
  recipientNotFound: new TypeIMessage('RECIPIENT NOT FOUND'),
  authErr: new TypeIMessage('AUTH ERR'),
  invalidMsg: new TypeIMessage('INVALID MSG'),
  unknownDownlinkErr: new TypeIMessage('UNKNOWN DOWNLINK ERR'),
  telexNotEnabled: new TypeIMessage('TELEX NOT ENABLED'),
  freeTextDisabled: new TypeIMessage('FREE TEXT DISABLED'),
  freetextEnabled: new TypeIMessage('FREE TEXT ENABLED'),
  enabledFltNbrInUse: new TypeIMessage('ENABLED. FLT NBR IN USE'),
  noOriginApt: new TypeIMessage('NO ORIGIN AIRPORT'),
  noOriginSet: new TypeIMessage('NO ORIGIN SET'),
  secondIndexNotFound: new TypeIMessage('2ND INDEX NOT FOUND'),
  firstIndexNotFound: new TypeIMessage('1ST INDEX NOT FOUND'),
  noRefWpt: new TypeIMessage('NO REF WAYPOINT'),
  noWptInfos: new TypeIMessage('NO WAYPOINT INFOS'),
  emptyMessage: new TypeIMessage(''),
  reloadPlaneApply: new TypeIIMessage('RELOAD A/C TO APPLY', true),
  noAcarsConnection: new TypeIMessage('NO ACARS CONNECTION'),
  unknownAtsuMessage: new TypeIMessage('UNKNOWN ATSU MESSAGE'),
  reverseProxy: new TypeIMessage('REVERSE PROXY ERROR'),
  simBriefNoUser: new TypeIMessage('NO SIMBRIEF PILOT ID PROVIDED'),
};

export function isTypeIIMessage(message: McduMessage): message is TypeIIMessage {
  return message instanceof TypeIIMessage;
}

/**
 * The ATC COM messages: two lines of 33 characters, separated by a newline
 */
export const ATCCOMMessages = {
  atcComNotAvail: new ATCCOMMessage('ATC COM NOT AVAIL'),
  atisUsedOffside: new ATCCOMMessage('ATIS USED OFFSIDE'),
  comDatalinkNotAvail: new ATCCOMMessage('COM DATALINK NOT AVAIL\nCHECK RMP COM STATUS PAGE'),
  deselectAutoUpdate: new ATCCOMMessage('DESELECT AUTO UPDATE'),
  enterOrCheckFltNumber: new ATCCOMMessage('ENTER OR CHECK FLT NUMBER\nIN FMS INIT PAGE'),
  entryOutOfRange: new ATCCOMMessage('ENTRY OUT OF RANGE'),
  fmsAcftPositionNotAvail: new ATCCOMMessage('FMS ACFT POSITION NOT AVAIL\nNOTIFICATION NOT AVAIL'),
  formatError: new ATCCOMMessage('FORMAT ERROR'),
  identicalAtisRequest: new ATCCOMMessage('IDENTICAL ATIS REQUEST'),
  lastMsgElement: new ATCCOMMessage('LAST MSG ELEMENT'),
  mailboxFull: new ATCCOMMessage('MAILBOX FULL\nSEND, CANCEL OR CLOSE SOME MSG'),
  msgRecordPartlyLost: new ATCCOMMessage('MSG RECORD PARTLY LOST'),
  msgRecordUsedOffside: new ATCCOMMessage('MSG RECORD USED OFFSIDE'),
  newAtisReceived: new ATCCOMMessage('NEW ATIS RECEIVED'),
  noFmsData: new ATCCOMMessage('NO FMS DATA'),
  pleaseCheckNotification: new ATCCOMMessage('PLEASE CHECK NOTIFICATION THEN\nWAIT FOR ATC CONNECTION'),
  pleaseWaitInProgress: new ATCCOMMessage('PLEASE WAIT : IN PROGRESS'),
  printerNotAvail: new ATCCOMMessage('PRINTER NOT AVAIL'),
  sendingMaydayWillSwitchAdsToEmergency: new ATCCOMMessage('SENDING MAYDAY WILL SWITCH ADS\nTO EMERGENCY'),
};
