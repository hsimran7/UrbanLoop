import React from 'react';
import Select, { Props as SelectProps } from 'react-select';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps extends Omit<SelectProps<Option, false>, 'options' | 'value' | 'onChange'> {
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  isClearable?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  isLoading = false,
  placeholder = 'Select...',
  disabled = false,
  isClearable = true,
  ...props
}) => {
  const selectedOption = options.find((opt) => opt.value === value) || null;

  return (
    <Select
      value={selectedOption}
      onChange={(selected) => onChange(selected ? selected.value : '')}
      options={options}
      isLoading={isLoading}
      isDisabled={disabled}
      placeholder={placeholder}
      isClearable={isClearable}
      classNamePrefix="react-select"
      noOptionsMessage={() => (isLoading ? 'Loading data...' : 'No data available')}
      styles={{
        control: (base, state) => ({
          ...base,
          backgroundColor: '#0f172a', // slate-950
          borderColor: state.isFocused ? '#10b981' : '#1e293b', // emerald-500 or slate-800
          borderRadius: '0.5rem',
          padding: '2px',
          boxShadow: 'none',
          '&:hover': {
            borderColor: '#10b981'
          }
        }),
        menu: (base) => ({
          ...base,
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          zIndex: 50
        }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isSelected ? '#059669' : state.isFocused ? '#1e293b' : 'transparent',
          color: state.isSelected ? '#fff' : '#cbd5e1',
          cursor: 'pointer',
          '&:active': {
            backgroundColor: '#059669'
          }
        }),
        singleValue: (base) => ({
          ...base,
          color: '#e2e8f0' // slate-200
        }),
        input: (base) => ({
          ...base,
          color: '#e2e8f0'
        }),
        placeholder: (base) => ({
          ...base,
          color: '#64748b' // slate-500
        })
      }}
      {...props}
    />
  );
};
