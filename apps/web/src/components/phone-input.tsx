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
      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
    />
  );
}
