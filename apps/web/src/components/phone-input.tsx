'use client';

import PhoneInputBase from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}

/**
 * Mimo-themed phone input with country flag + dial code dropdown.
 * Uses E.164 format internally (+85291234567). Default country: HK.
 *
 * Matches the /get-started form inputs:
 *   rounded-lg border border-[#E8DFD5] bg-white/80 text-[#1A1A1A]
 */
export default function PhoneInput({ value, onChange, required, disabled }: PhoneInputProps) {
  return (
    <PhoneInputBase
      international
      defaultCountry="HK"
      countryCallingCodeEditable={false}
      value={value}
      onChange={(val) => onChange(val || '')}
      required={required}
      disabled={disabled}
      className="flex rounded-lg border border-[#E8DFD5] bg-white/80 text-[#1A1A1A] focus-within:border-[#0E7C3A] focus-within:ring-1 focus-within:ring-[#0E7C3A]"
      style={
        {
          '--PhoneInputCountrySelectArrow-color': '#5B5851',
          '--PhoneInputCountrySelectArrow-opacity': '0.6',
        } as React.CSSProperties
      }
    />
  );
}

