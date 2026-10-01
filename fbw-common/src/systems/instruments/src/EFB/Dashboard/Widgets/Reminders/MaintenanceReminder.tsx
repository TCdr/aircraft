// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AtaChapterNumber } from '@flybywiresim/fbw-sdk-react';
import React, { FC } from 'react';
import { ArrowRight, ExclamationTriangleFill } from 'react-bootstrap-icons';
import { useHistory } from 'react-router';
import { t } from '../../../Localization/translation';
import { RemindersSection } from './RemindersSection';
import { useFailuresOrchestrator } from '../../../failures-orchestrator-provider';
import { findLatestSeenPathname } from '../../../Utils/routing';
import { useAppDispatch } from '../../../Store/store';
import { setSearchQuery } from '../../../Store/features/failuresPage';
import { M3ListRow } from '../../../UtilComponents/Material/Material';

interface ActiveFailureCardProps {
  ata?: AtaChapterNumber;
  name: string;
}

const ActiveFailureCard: FC<ActiveFailureCardProps> = ({ ata, name }) => {
  const dispatch = useAppDispatch();
  const history = useHistory();

  return (
    <M3ListRow
      icon={<ExclamationTriangleFill size={18} />}
      tone="warn"
      name={name}
      status={`Active Failure${ata ? ` · ATA ${ata}` : ''}`}
      trailing={<ArrowRight size={18} className="text-m3-muted" />}
      onClick={() => {
        dispatch(setSearchQuery(name.toUpperCase()));

        const lastFailurePath = findLatestSeenPathname(history, '/failures');

        if (!ata) {
          history.push('/failures/compact');
        }

        if (!lastFailurePath || lastFailurePath.includes('comfort')) {
          history.push(`/failures/comfort/${ata}`);
        } else {
          history.push('/failures/compact');
        }
      }}
    />
  );
};

export const MaintenanceReminder = () => {
  const { allFailures, activeFailures } = useFailuresOrchestrator();

  return (
    <RemindersSection title={t('Dashboard.ImportantInformation.Maintenance.Title')} pageLinkPath="/failures">
      <div className="-mx-4 flex flex-col">
        {Array.from(activeFailures)
          // Sorts the failures by name length, greatest to least
          .sort(
            (a, b) =>
              (allFailures.find((f) => f.identifier === b)?.name ?? '').length -
              (allFailures.find((f) => f.identifier === a)?.name ?? '').length,
          )
          .map((failureIdentifier) => {
            const failure = allFailures.find((it) => it.identifier === failureIdentifier);

            return <ActiveFailureCard key={failureIdentifier} ata={failure?.ata} name={failure?.name ?? '<unknown>'} />;
          })}

        {!activeFailures.size && (
          <span className="my-2 text-center text-base text-m3-muted">
            {t('Dashboard.ImportantInformation.Maintenance.NoActiveFailures')}
          </span>
        )}
      </div>
    </RemindersSection>
  );
};
