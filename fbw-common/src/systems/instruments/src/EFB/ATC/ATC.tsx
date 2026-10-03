// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useCallback, useEffect, useState } from 'react';
import * as apiClient from '@flybywiresim/api-client';
import { AtcType } from '@flybywiresim/api-client';
import {
  useSimVar,
  useInterval,
  useSplitSimVar,
  usePersistentSetting,
  ConfigWeatherMap,
} from '@flybywiresim/fbw-sdk-react';
import { Link } from 'react-router-dom';
import { CloudArrowDown, Gear, InfoCircle, X } from 'react-bootstrap-icons';
import { toast } from 'react-toastify';
import { t } from '../Localization/translation';
import { pathify } from '../Utils/routing';
import { ScrollableContainer } from '../UtilComponents/ScrollableContainer';
import { SimpleInput } from '../UtilComponents/Form/SimpleInput/SimpleInput';
import { TooltipWrapper } from '../UtilComponents/TooltipWrapper';
import { M3_INPUT, M3Card, M3SectionHeader } from '../UtilComponents/Material/Material';

export declare class ATCInfoExtended extends apiClient.ATCInfo {
  distance: number;
}

interface FrequencyCardProps {
  className?: string;
  callsign: string;
  frequency: string;
  /** The kind of station (Tower, Ground...) */
  typeName?: string;
  /** The distance from the aircraft, in nautical miles */
  distance: number;
  /** The station whose information is shown */
  selected: boolean;
  setActive: () => void;
  setCurrent: () => void;
  setStandby: () => void;
}

/** A station: its callsign, kind and distance, its frequency and the buttons that tune it */
const FrequencyCard = ({
  className,
  callsign,
  frequency,
  typeName,
  distance,
  selected,
  setActive,
  setCurrent,
  setStandby,
}: FrequencyCardProps) => (
  <div className={className}>
    <div className={`flex flex-col rounded-2xl px-4 py-3 ${selected ? 'bg-m3-primary-container' : 'bg-m3-tile'}`}>
      <div className="flex flex-row items-center">
        <span className={`truncate text-base font-bold ${selected ? 'text-m3-on-primary-container' : 'text-white'}`}>
          {callsign}
        </span>
        {typeName && (
          <span className="ml-2 whitespace-nowrap rounded-full bg-m3-ground px-2 py-1 text-xs font-bold leading-none text-m3-muted">
            {typeName}
          </span>
        )}
        <div className="grow" />
        {distance > 0 && (
          <span className="whitespace-nowrap text-xs font-semibold text-m3-muted">{`${distance.toFixed(0)} nm`}</span>
        )}
      </div>
      <div className="mt-2 flex flex-row items-center">
        <span className="grow text-2xl font-bold text-white">{frequency}</span>
        <button
          type="button"
          onClick={setActive}
          className="h-9 rounded-xl bg-m3-primary px-3 text-sm font-bold text-m3-on-primary transition duration-100 hover:brightness-110"
        >
          {t('AirTrafficControl.SetActive')}
        </button>
        <button
          type="button"
          onClick={setStandby}
          className="ml-2 h-9 rounded-xl border border-m3-outline bg-transparent px-3 text-sm font-bold text-m3-text transition duration-100 hover:bg-m3-card"
        >
          {t('AirTrafficControl.SetStandby')}
        </button>
        <button
          type="button"
          aria-label={callsign}
          onClick={setCurrent}
          className="ml-2 flex h-9 w-9 items-center justify-center rounded-xl border border-m3-outline bg-transparent text-m3-text transition duration-100 hover:bg-m3-card"
        >
          <InfoCircle size={18} />
        </button>
      </div>
    </div>
  </div>
);

export const ATC = () => {
  const [controllers, setControllers] = useState<ATCInfoExtended[]>();
  const [activeFrequency, setActiveFrequency] = useSplitSimVar(
    'COM ACTIVE FREQUENCY:1',
    'Hz',
    'K:COM_RADIO_SET_HZ',
    'Hz',
    500,
  );
  const [stanbdyFrequency, setStandbyFrequency] = useSplitSimVar(
    'COM STANDBY FREQUENCY:1',
    'Hz',
    'K:COM_STBY_RADIO_SET_HZ',
    'Hz',
    500,
  );
  const [displayedActiveFrequency, setDisplayedActiveFrequency] = useState<string>();
  const [displayedStandbyFrequency, setDisplayedStandbyFrequency] = useState<string>();
  const [currentAtc, setCurrentAtc] = useState<ATCInfoExtended>();
  const [currentLatitude] = useSimVar('GPS POSITION LAT', 'Degrees', 10_000);
  const [currentLongitude] = useSimVar('GPS POSITION LON', 'Degrees', 10_000);
  const [atisSource] = usePersistentSetting('CONFIG_ATIS_SRC');
  const [atcDataPending, setAtcDataPending] = useState(true);

  const [controllerTypeFilter, setControllerTypeFilter] = useState<AtcType | undefined>(undefined);
  const [controllerCallSignFilter, setControllerCallSignFilter] = useState('');

  const loadAtc = useCallback(async () => {
    if (atisSource.toLowerCase() !== 'vatsim' && atisSource.toLowerCase() !== 'ivao') return;
    const atisSourceReq = atisSource.toLowerCase();

    try {
      const atcRes = await apiClient.ATC.get(atisSourceReq);
      if (!atcRes) return;
      let allAtc: ATCInfoExtended[] = atcRes as ATCInfoExtended[];

      allAtc = allAtc.filter((a) => a.callsign.indexOf('_OBS') === -1 && parseFloat(a.frequency) <= 136.975);

      for (const a of allAtc) {
        a.distance = getDistanceFromLatLonInNm(a.latitude, a.longitude, currentLatitude, currentLongitude);
        if (a.visualRange === 0 && a.type === apiClient.AtcType.ATIS) {
          a.visualRange = 100;
        }
      }

      allAtc.sort((a1, a2) => (a1.distance > a2.distance ? 1 : -1));
      allAtc = allAtc.slice(0, 26);
      allAtc.push({
        callsign: 'UNICOM',
        frequency: '122.800',
        type: apiClient.AtcType.RADAR,
        visualRange: 999999,
        distance: 0,
        latitude: 0,
        longitude: 0,
        textAtis: [],
      });

      setControllers(allAtc.filter((a) => a.distance <= a.visualRange));
    } catch (e) {
      toast.error(e.message);
    }

    setAtcDataPending(false);
  }, [currentLatitude, currentLongitude, atisSource]);

  const getDistanceFromLatLonInNm = (lat1, lon1, lat2, lon2): number => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2Rad(lat2 - lat1); // deg2Rad below
    const dLon = deg2Rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2Rad(lat1)) * Math.cos(deg2Rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 0.5399568; // Distance in nm
  };

  const deg2Rad = (deg) => deg * (Math.PI / 180);

  const toFrequency = (frequency: string): number => {
    if (frequency) {
      return parseFloat(`${frequency.replace('.', '').padEnd(9, '0')}.000`);
    }
    return 0;
  };

  const fromFrequency = (frequency: number): string => {
    if (frequency) {
      let converted: string = frequency.toString().replace('.', '');
      converted = `${converted.substring(0, 3)}.${converted.substring(3)}`;
      return parseFloat(converted).toFixed(3);
    }
    return '';
  };

  useEffect(() => {
    loadAtc();
  }, [loadAtc]);

  useEffect(() => {
    const converted = fromFrequency(activeFrequency);
    setDisplayedActiveFrequency(converted);
    setCurrentAtc(controllers?.find((c) => c.frequency === converted));
  }, [activeFrequency]);

  useEffect(() => {
    const converted = fromFrequency(stanbdyFrequency);
    setDisplayedStandbyFrequency(converted);
    setCurrentAtc(controllers?.find((c) => c.frequency === converted));
  }, [stanbdyFrequency]);

  // Update selected controller info when controllers change
  useEffect(() => {
    const currentControllerFrequency = currentAtc?.frequency;

    if (currentControllerFrequency) {
      const controllerWithFrequency = controllers?.find((c) => c.frequency === currentControllerFrequency);

      if (controllerWithFrequency) {
        setCurrentAtc(controllerWithFrequency);
      }
    }
  }, [controllers]);

  useInterval(() => {
    loadAtc();
  }, 60_000);

  const filterControllers = (c: ATCInfoExtended): boolean =>
    !(
      (controllerTypeFilter && c.type !== controllerTypeFilter) ||
      (controllerCallSignFilter !== '' && !c.callsign.toUpperCase().includes(controllerCallSignFilter.toUpperCase()))
    );

  const atcTypeOptions = [
    { typeName: t('AirTrafficControl.ShowAll'), atcType: undefined },
    { typeName: t('AirTrafficControl.ShowAtis'), atcType: AtcType.ATIS },
    { typeName: t('AirTrafficControl.ShowDelivery'), atcType: AtcType.DELIVERY },
    { typeName: t('AirTrafficControl.ShowGround'), atcType: AtcType.GROUND },
    { typeName: t('AirTrafficControl.ShowTower'), atcType: AtcType.TOWER },
    { typeName: t('AirTrafficControl.ShowApproach'), atcType: AtcType.APPROACH },
    { typeName: t('AirTrafficControl.ShowDeparture'), atcType: AtcType.DEPARTURE },
    { typeName: t('AirTrafficControl.ShowRadar'), atcType: AtcType.RADAR },
  ];

  const shownControllers = controllers ? controllers.filter((c) => filterControllers(c)) : [];

  return (
    <div>
      <div className="relative mb-4 flex flex-row items-center justify-between">
        <h1 className="font-bold">
          {t('AirTrafficControl.Title')}
          {/* The setting holds the network id in lower case ('ivao', 'vatsim'): show the network name, IVAO / VATSIM */}
          {(atisSource === ConfigWeatherMap.IVAO || atisSource === ConfigWeatherMap.VATSIM) &&
            ` (${atisSource.toUpperCase()})`}
        </h1>
      </div>
      {atisSource === ConfigWeatherMap.IVAO || atisSource === ConfigWeatherMap.VATSIM ? (
        <div className="flex h-content-section-reduced w-full flex-col overflow-hidden">
          <div className="mb-4 flex shrink-0 flex-row items-center">
            <TooltipWrapper text={t('AirTrafficControl.TT.AtcCallSignSearch')}>
              <div className="mr-3 flex flex-row items-center">
                <SimpleInput
                  placeholder={t('AirTrafficControl.SearchPlaceholder')}
                  className={`w-64 ${M3_INPUT}`}
                  fontSizeClassName="text-base"
                  value={controllerCallSignFilter}
                  onChange={(value) => setControllerCallSignFilter(value)}
                />
                <button
                  type="button"
                  aria-label="Clear"
                  className="ml-2 flex h-10 w-10 items-center justify-center rounded-xl border border-m3-outline bg-transparent text-m3-text transition duration-100 hover:bg-m3-tile"
                  onClick={() => setControllerCallSignFilter('')}
                >
                  <X size={22} />
                </button>
              </div>
            </TooltipWrapper>
            {atcTypeOptions.map((option) => (
              <TooltipWrapper
                key={option.typeName}
                text={`${t('AirTrafficControl.TT.AtcTypeFilter')} ${option.typeName}`}
              >
                <div className="ml-2">
                  <button
                    type="button"
                    onClick={() => setControllerTypeFilter(option.atcType)}
                    className={`h-9 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition duration-100 ${
                      controllerTypeFilter === option.atcType
                        ? 'bg-m3-primary-container font-bold text-m3-on-primary-container'
                        : 'border border-m3-outline bg-transparent text-m3-text hover:bg-m3-tile'
                    }`}
                  >
                    {option.typeName}
                  </button>
                </div>
              </TooltipWrapper>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-row">
            <M3Card className="relative mr-4 min-w-0 flex-1 pb-3">
              <M3SectionHeader title={t('AirTrafficControl.ControllersOnline')} badge={`${shownControllers.length}`} />
              {/* Empty state: no controller in range, all filtered out, or the network request failed */}
              {shownControllers.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center px-4">
                  {!atcDataPending && (
                    <span className="text-center text-base font-bold text-m3-muted">
                      {t('AirTrafficControl.NoControllersToDisplay')}
                    </span>
                  )}
                </div>
              ) : (
                <div className="min-h-0 flex-1 px-4">
                  <ScrollableContainer innerClassName="grid grid-cols-2" height={40}>
                    {shownControllers.map((controller, index) => (
                      <FrequencyCard
                        key={controller.callsign}
                        className={`${index % 2 !== 0 ? 'ml-3' : ''} ${index >= 2 ? 'mt-3' : ''}`}
                        callsign={controller.callsign}
                        frequency={controller.frequency}
                        typeName={
                          atcTypeOptions.find((o) => o.atcType !== undefined && o.atcType === controller.type)?.typeName
                        }
                        distance={controller.distance}
                        selected={currentAtc?.callsign === controller.callsign}
                        setActive={() => setActiveFrequency(toFrequency(controller.frequency))}
                        setCurrent={() => setCurrentAtc(controllers?.find((c) => c.frequency === controller.frequency))}
                        setStandby={() => setStandbyFrequency(toFrequency(controller.frequency))}
                      />
                    ))}
                  </ScrollableContainer>
                </div>
              )}

              <div
                className={`absolute inset-0 flex items-center justify-center rounded-2xl bg-m3-card text-m3-on-primary-container transition duration-200
                            ${atcDataPending ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              >
                {atcDataPending && <CloudArrowDown className="animate-bounce" size={40} />}
              </div>
            </M3Card>

            <div className="flex w-[380px] shrink-0 flex-col">
              <M3Card className="mb-4 shrink-0 p-4">
                <span className="text-xs font-bold uppercase tracking-widest text-m3-muted">
                  {t('AirTrafficControl.Com1')}
                </span>
                <span className="mt-3 text-xs font-bold uppercase tracking-widest text-m3-muted">
                  {t('AirTrafficControl.Active')}
                </span>
                <div className="mt-1 flex h-[72px] items-center justify-center rounded-2xl border border-m3-outline bg-m3-ground font-rmp text-5xl text-m3-on-primary-container">
                  {displayedActiveFrequency && displayedActiveFrequency}
                </div>
                <span className="mt-3 text-xs font-bold uppercase tracking-widest text-m3-muted">
                  {t('AirTrafficControl.Standby')}
                </span>
                <div className="mt-1 flex h-[72px] items-center justify-center rounded-2xl border border-m3-outline bg-m3-ground font-rmp text-5xl text-m3-on-warn">
                  {displayedStandbyFrequency && displayedStandbyFrequency}
                </div>
              </M3Card>

              <M3Card className="min-h-0 flex-1 p-4">
                <span className="shrink-0 text-xs font-bold uppercase tracking-widest text-m3-muted">
                  {t('AirTrafficControl.ControllerInformation')}
                </span>
                {currentAtc?.textAtis ? (
                  <ControllerInformation currentAtc={currentAtc} />
                ) : (
                  <div className="flex grow items-center justify-center">
                    <span className="text-center text-base font-bold text-m3-muted">
                      {t('AirTrafficControl.NoInformationAvailableForThisFrequency')}
                    </span>
                  </div>
                )}
              </M3Card>
            </div>
          </div>
        </div>
      ) : (
        <M3Card low className="h-content-section-reduced items-center justify-center">
          <div className="max-w-4xl space-y-8">
            <h1 className="text-center">{t('AirTrafficControl.SelectCorrectATISATCSource')}</h1>
            <Link
              to={`/settings/${pathify('ATSU / AOC')}`}
              className="flex h-14 w-full items-center justify-center space-x-4 rounded-2xl bg-m3-primary text-m3-on-primary transition duration-100 hover:brightness-110"
            >
              <Gear size={24} />
              <p className="text-lg font-bold text-current">{t('AirTrafficControl.ChangeATISATCSourceButton')}</p>
            </Link>
          </div>
        </M3Card>
      )}
    </div>
  );
};

interface ControllerInformationProps {
  currentAtc?: ATCInfoExtended;
}

const ControllerInformation = ({ currentAtc }: ControllerInformationProps) => (
  <ScrollableContainer height={14} className="mt-3">
    <span className="block text-lg font-bold text-white">{currentAtc?.callsign}</span>
    {currentAtc?.textAtis.map((line) => (
      <p key={line} className="mt-2 flex flex-wrap text-base leading-snug text-m3-text">
        {line}
      </p>
    ))}
  </ScrollableContainer>
);

export default ATC;
