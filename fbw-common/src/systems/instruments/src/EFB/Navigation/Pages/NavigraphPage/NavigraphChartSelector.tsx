// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useState, useEffect } from 'react';
import { CloudArrowDown, PinFill, Pin } from 'react-bootstrap-icons';
import { Chart } from 'navigraph/charts';

import { t } from '../../../Localization/translation';
import { useAppDispatch, useAppSelector } from '../../../Store/store';
import {
  NavigationTab,
  editTabProperty,
  setBoundingBox,
  setProvider,
  ChartProvider,
  isChartPinned,
  removedPinnedChart,
  addPinnedChart,
  NavigraphChartTabTypeToIndex,
} from '../../../Store/features/navigationPage';
import { navigationTabs } from '../../Navigation';

interface NavigraphChartSelectorProps {
  selectedTab: OrganizedChart;
  loading?: boolean;
}

type RunwayOrganizedChart = {
  name: string;
  charts: Chart[];
};

export type OrganizedChart = {
  name: string;
  charts: Chart[];
  bundleRunways?: boolean;
};

export const NavigraphChartSelector = ({ selectedTab, loading }: NavigraphChartSelectorProps) => {
  const NO_RUNWAY_NAME = 'NONE';
  const [runwaySet, setRunwaySet] = useState<Set<string>>(new Set());
  const [organizedCharts, setOrganizedCharts] = useState<RunwayOrganizedChart[]>([]);

  const dispatch = useAppDispatch();

  const { chartId, searchQuery, selectedTabType } = useAppSelector(
    (state) => state.navigationTab[NavigationTab.NAVIGRAPH],
  );

  const { pinnedCharts } = useAppSelector((state) => state.navigationTab);

  useEffect(() => {
    if (selectedTab.bundleRunways) {
      const runwayNumbers: string[] = [];

      selectedTab.charts.forEach((chart) => {
        if (chart.runways.length !== 0) {
          for (const runway of chart.runways) {
            runwayNumbers.push(runway);
          }
        } else {
          runwayNumbers.push(NO_RUNWAY_NAME);
        }
      });

      setRunwaySet(new Set(runwayNumbers));
    } else {
      setRunwaySet(new Set());
    }
  }, [selectedTab.charts]);

  useEffect(() => {
    if (selectedTab.bundleRunways) {
      const organizedRunwayCharts: RunwayOrganizedChart[] = [];

      runwaySet.forEach((runway) => {
        organizedRunwayCharts.push({
          name: runway,
          charts: selectedTab.charts.filter(
            (chart) => chart.runways.includes(runway) || (chart.runways.length === 0 && runway === NO_RUNWAY_NAME),
          ),
        });
      });

      setOrganizedCharts(organizedRunwayCharts);
    } else {
      setOrganizedCharts([]);
    }
  }, [runwaySet]);

  const handleChartClick = (chart: Chart) => {
    dispatch(editTabProperty({ tab: NavigationTab.NAVIGRAPH, pagesViewable: 1 }));

    dispatch(editTabProperty({ tab: NavigationTab.NAVIGRAPH, currentPage: 1 }));

    dispatch(editTabProperty({ tab: NavigationTab.NAVIGRAPH, chartId: chart.id }));

    dispatch(
      editTabProperty({ tab: NavigationTab.NAVIGRAPH, chartDimensions: { width: undefined, height: undefined } }),
    );
    dispatch(editTabProperty({ tab: NavigationTab.NAVIGRAPH, chartName: { light: chart.name, dark: chart.name } }));
    dispatch(
      editTabProperty({
        tab: NavigationTab.NAVIGRAPH,
        chartLinks: { light: chart.image_day_url, dark: chart.image_night_url },
      }),
    );

    dispatch(setBoundingBox(chart.bounding_boxes));

    dispatch(setProvider(ChartProvider.NAVIGRAPH));
  };

  if (loading) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-2xl bg-m3-card-low text-m3-muted"
        style={{ height: '42.75rem' }}
      >
        <CloudArrowDown className="animate-bounce" size={40} />
      </div>
    );
  }

  if (!selectedTab.charts.length) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-2xl bg-m3-card-low text-m3-muted"
        style={{ height: '42.75rem' }}
      >
        <p className="text-center text-lg text-m3-muted">{t('NavigationAndCharts.ThereAreNoChartsToDisplay')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {selectedTab.bundleRunways ? (
        <>
          {organizedCharts.map((item) => (
            <div className="flex w-full flex-col space-y-1" key={item.name}>
              <span className="px-2 pb-1 pt-2 text-xs font-bold uppercase tracking-widest text-m3-muted">
                {item.name}
              </span>
              {item.charts.map((chart) => (
                <div
                  className="flex flex-row overflow-hidden rounded-xl bg-m3-tile"
                  onClick={() => handleChartClick(chart)}
                  key={chart.id}
                >
                  <div className="flex flex-row items-center">
                    <div
                      className={`h-full w-2 transition duration-100 ${
                        chart.id === chartId ? 'bg-m3-primary' : 'bg-transparent'
                      }`}
                    />
                    <div
                      className="flex h-full items-center px-3 text-m3-muted transition duration-100 hover:bg-m3-card hover:text-m3-on-primary-container"
                      onClick={(event) => {
                        event.stopPropagation();

                        if (isChartPinned(chart.id)) {
                          dispatch(removedPinnedChart({ chartId: chart.id }));
                        } else {
                          dispatch(
                            addPinnedChart({
                              chartId: chart.id,
                              chartName: { light: chart.image_day_url, dark: chart.image_night_url },
                              title: searchQuery,
                              subTitle: chart.procedures[0],
                              tabIndex: NavigraphChartTabTypeToIndex[selectedTabType],
                              timeAccessed: 0,
                              tag: selectedTab.name,
                              provider: ChartProvider.NAVIGRAPH,
                              pagesViewable: 1,
                              boundingBox: chart.bounding_boxes,
                              chartLinks: { dark: chart.image_night_url, light: chart.image_day_url },
                              pageIndex: navigationTabs.findIndex(
                                (tab) => tab.associatedTab === NavigationTab.NAVIGRAPH,
                              ),
                            }),
                          );
                        }
                      }}
                    >
                      {pinnedCharts.some((pinnedChart) => pinnedChart.chartId === chart.id) ? (
                        <PinFill size={20} className="text-m3-on-primary-container" />
                      ) : (
                        <Pin size={20} />
                      )}
                    </div>
                  </div>
                  <div className="m-2 flex flex-col">
                    <span className="text-base font-bold text-m3-text">{chart.name}</span>
                    <span className="mr-auto mt-1 rounded-full bg-m3-ground px-2 py-0.5 text-xs font-bold text-m3-muted">
                      {chart.index_number}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      ) : (
        <>
          {selectedTab.charts.map((chart) => (
            <div
              className="flex w-full flex-row overflow-hidden rounded-xl bg-m3-tile"
              onClick={() => handleChartClick(chart)}
              key={chart.id}
            >
              <div className="flex flex-row items-center">
                <div
                  className={`h-full w-2 transition duration-100 ${
                    chart.id === chartId ? 'bg-m3-primary' : 'bg-transparent'
                  }`}
                />
                <div
                  className="flex h-full items-center px-3 text-m3-muted transition duration-100 hover:bg-m3-card hover:text-m3-on-primary-container"
                  onClick={(event) => {
                    event.stopPropagation();

                    if (isChartPinned(chart.id)) {
                      dispatch(removedPinnedChart({ chartId: chart.id }));
                    } else {
                      dispatch(
                        addPinnedChart({
                          chartId: chart.id,
                          chartName: { light: chart.image_day_url, dark: chart.image_night_url },
                          title: searchQuery,
                          subTitle: chart.procedures[0],
                          tabIndex: NavigraphChartTabTypeToIndex[selectedTabType],
                          timeAccessed: 0,
                          tag: selectedTab.name,
                          provider: ChartProvider.NAVIGRAPH,
                          pagesViewable: 1,
                          boundingBox: chart.bounding_boxes,
                          chartLinks: {
                            light: chart.image_day_url,
                            dark: chart.image_night_url,
                          },
                          pageIndex: navigationTabs.findIndex((tab) => tab.associatedTab === NavigationTab.NAVIGRAPH),
                        }),
                      );
                    }
                  }}
                >
                  {pinnedCharts.some((pinnedChart) => pinnedChart.chartId === chart.id) ? (
                    <PinFill size={20} className="text-m3-on-primary-container" />
                  ) : (
                    <Pin size={20} />
                  )}
                </div>
              </div>
              <div className="m-2 flex flex-col">
                <span className="text-base font-bold text-m3-text">{chart.name}</span>
                <span className="mr-auto mt-1 rounded-full bg-m3-ground px-2 py-0.5 text-xs font-bold text-m3-muted">
                  {chart.index_number}
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};
