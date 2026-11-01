// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ComponentProps, Subject, Subscribable } from '@microsoft/msfs-sdk';
import { FltOpsAircraftStatus } from '../../../System/Performance/AircraftStatus';
import { OpsLibrarySession } from '../../../System/OpsLibrary/OpsLibrarySession';
import { LogbookStatusRows } from '../../../System/OpsLibrary/OpsLibraryLogbookStatus';
import { DocumentFieldContainer } from '../Shared/DocumentTextField';

/** What the tabs and the consultation of the OPS LIBRARY page share */
export interface OpsLibraryContext {
  readonly session: OpsLibrarySession;
  /** The keyboard and interaction mode of the text fields */
  readonly fields: DocumentFieldContainer;
  /** The aircraft status of the FLT OPS domain, which the performance applications read */
  readonly aircraftStatus: Subject<FltOpsAircraftStatus | null>;
  /** The deferred items of the eLogbook as the FLT OPS domain last read them */
  readonly logbookRows: Subscribable<LogbookStatusRows>;
  /** SYNCHRO LOGBOOK: reads the eLogbook again */
  synchroLogbook(): void;
  /** The simulated time, ms since the epoch */
  now(): number;
}

export interface OpsLibraryViewProps extends ComponentProps {
  readonly ctx: OpsLibraryContext;
}
