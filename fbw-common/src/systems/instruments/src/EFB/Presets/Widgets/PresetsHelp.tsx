// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { InfoCircleFill } from 'react-bootstrap-icons';
import { AirframeType } from '@flybywiresim/fbw-sdk-react';
import { ScrollableContainer } from '../../UtilComponents/ScrollableContainer';
import { M3Banner, M3Card, M3SectionHeader } from '../../UtilComponents/Material/Material';
import { useAppSelector } from '../../Store/store';

/** One point of a help list, in the size and colour of the flyPad body text */
const HelpItem: FC = ({ children }) => <li className="mt-2 text-base leading-snug text-m3-muted">{children}</li>;

/**
 * The "?" page of the Presets section: how the interior lighting presets and the aircraft state presets work.
 * The flight management system is set up on the MCDU and the FCU of the A320, on the MFD (with the KCCU) and the
 * AFS CP of the A380 (A380 FCOM: "AFS CONTROL PANEL (AFS CP)", DSC-22-FMS-10-40-40 KCCU).
 */
export const PresetsHelp = () => {
  const isA380 = useAppSelector((state) => state.config.airframeInfo?.variant) === AirframeType.A380_842;
  const fcu = isA380 ? 'AFS CP' : 'FCU';
  const fmsInterface = isA380 ? 'the MFD (with the KCCU)' : 'the MCDU';

  return (
    <div className="h-content-section-reduced overflow-hidden">
      <ScrollableContainer height={54}>
        <div className="pr-5">
          <M3Card className="shrink-0 pb-4">
            <M3SectionHeader title="Lighting" />
            <ul className="ml-5 list-outside list-disc px-4">
              <HelpItem>
                Load a preset by clicking on the corresponding "Load Preset" button when the aircraft is powered.
              </HelpItem>
              <HelpItem>
                Save current interior lighting levels by clicking on "Save Preset" button of the corresponding preset
                when the aircraft is powered.
              </HelpItem>
              <HelpItem>
                Rename a preset by clicking on the current name and entering a new name. The new name will be saved
                after leaving the input field.
              </HelpItem>
            </ul>
          </M3Card>

          <M3Card className="mt-4 shrink-0 pb-4">
            <M3SectionHeader title="Aircraft" />
            <p className="px-4 text-base leading-snug text-m3-muted">
              {`Aircraft Presets act as a virtual Co-Pilot supporting you setting up the aircraft correctly while you are preparing the flight management system. The Aircraft Presets do not cover the FMS and ${fcu} setup.`}
            </p>
            <div className="px-4">
              <M3Banner tone="busy" icon={<InfoCircleFill size={16} />} className="mt-3">
                {`You still have to set up the FMS using ${fmsInterface} and the ${fcu} according to your flight plan.`}
              </M3Banner>
            </div>
            <ul className="ml-5 mt-1 list-outside list-disc px-4">
              <HelpItem>
                When clicking on a preset button the corresponding preset procedure will be started. This happens in
                real time as if a Co-Pilot would execute the setup.
              </HelpItem>
              <HelpItem>
                This means that the preset procedure will take some time to complete especially when waiting for certain
                steps to finish, e.g. ADIRS alignment, APU start, engines start, etc.
              </HelpItem>
              <HelpItem>
                You can stop and interrupt the procedure anytime by clicking on "Cancel". The procedure will stop after
                the current step is finished. The aircraft will be in a state in-between two presets. You can always
                press a preset again and let it run until completion to make sure a procedure is complete.
              </HelpItem>
              <HelpItem>
                If you have partly setup the aircraft already the presets will check if the correct setting is already
                done and skip this step. Otherwise it will overwrite your setup.
              </HelpItem>
              <HelpItem>
                If you change any settings during a running procedure you might confuse your Co-Pilot and end up with an
                incomplete preset state. You can repeat loading the preset in this case.
              </HelpItem>
            </ul>
          </M3Card>
        </div>
      </ScrollableContainer>
    </div>
  );
};
