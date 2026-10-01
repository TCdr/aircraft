// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'react-bootstrap-icons';
import { ScrollableContainer } from '../../ScrollableContainer';
import { TooltipWrapper } from '../../TooltipWrapper';

interface Option {
  value: any;
  displayValue: string;
  tooltip?: string;
}

/**
 * Options is array of options. Each option is an array, with the index 0 being the value and 1 being the display value
 * e.g [[0, "Value 1"], [1, "Value 2"]]
 * Options are displayed in order of list
 */
interface SelectInputProps {
  onChange?: (newValue: number | string | boolean) => void;
  defaultValue?: any;
  value?: any;
  reverse?: boolean; // Flips label/input order
  options: Option[];
  dropdownOnTop?: boolean; // Display dropdown above input instead of below
  className?: string;
  forceShowAll?: boolean; // Forces dropdown to show all options
  maxHeight?: number; // max height before it becomes scrollable
  fontSizeClassName?: string; // text size of the value and of the options (the flyPad default otherwise)
  disabled?: boolean;
}

const defaultOptionFallback: Option = { value: 0, displayValue: '' };

export const SelectInput = (props: SelectInputProps) => {
  const defaultOption =
    props.options.find((option) => option.value === (props.defaultValue ?? 0)) ?? defaultOptionFallback;

  const [value, setValue] = useState<any>(defaultOption.displayValue);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (props.value === undefined) return;

    const option = props.options.find((option) => option.value === props.value) ?? defaultOption;

    setValue(option.displayValue);
  }, [props.value]);

  // This useEffect is to support dynamically generated option lists.
  useEffect(() => {
    const option = props.options.find((option) => option.value === props.value) ?? defaultOption;
    setValue(option.displayValue);
  }, [props.options]);

  const onOptionClicked = (option: Option) => {
    if (props.onChange) {
      props.onChange(option.value);
    }
    setValue(option.displayValue);
  };

  const handleToggleDropdown = () => {
    if (props.disabled !== true) {
      setShowDropdown(!showDropdown);
    }
  };

  return (
    <div className="flex flex-row">
      <div
        className={`relative ${props.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} rounded-xl border border-m3-outline bg-m3-ground text-m3-text ${props.className} ${' '}
                ${showDropdown && (props.dropdownOnTop ? '!rounded-t-none' : '!rounded-b-none')}`}
        onClick={handleToggleDropdown}
      >
        <div className={`relative flex px-3 py-1.5 ${props.fontSizeClassName ?? ''}`}>
          {value}
          <ChevronDown
            className={`absolute inset-y-0 right-3 h-full duration-100${showDropdown && '-rotate-180'}`}
            size={20}
          />
        </div>
        {showDropdown && (
          <div
            className={`absolute -inset-x-px z-10 flex overflow-hidden border border-m3-outline bg-m3-ground pb-2 pr-2 shadow-xl ${' '}
                        ${
                          props.dropdownOnTop
                            ? 'top-0 -translate-y-full flex-col-reverse rounded-t-xl border-b-0'
                            : 'bottom-0 translate-y-full flex-col rounded-b-xl border-t-0'
                        }
                        `}
          >
            <ScrollableContainer height={props.maxHeight || 40} nonRigid>
              {props.options.map(
                (option) =>
                  (value !== option.displayValue || props.forceShowAll) &&
                  (option.tooltip ? (
                    <TooltipWrapper key={option.value} text={option.tooltip}>
                      <div
                        className={`px-3 py-1.5 text-m3-text transition duration-100 hover:bg-m3-tile ${props.fontSizeClassName ?? ''}`}
                        onClick={() => onOptionClicked(option)}
                      >
                        {option.displayValue}
                      </div>
                    </TooltipWrapper>
                  ) : (
                    <div
                      key={option.value}
                      className={`px-3 py-1.5 text-m3-text transition duration-100 hover:bg-m3-tile ${props.fontSizeClassName ?? ''}`}
                      onClick={() => onOptionClicked(option)}
                    >
                      {option.displayValue}
                    </div>
                  )),
              )}
            </ScrollableContainer>
          </div>
        )}
      </div>
    </div>
  );
};
