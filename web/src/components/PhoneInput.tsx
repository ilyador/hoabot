import { useState, useId } from 'react';
import { formatPhone, rawDigits } from '../lib/format';

interface PhoneInputProps {
  label?: string;
  value: string; // raw digits
  onChange: (digits: string) => void;
  placeholder?: string;
  required?: boolean;
}

export function PhoneInput({ label = 'Phone', value, onChange, placeholder = '(555) 123-4567', required }: PhoneInputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const [display, setDisplay] = useState(() => value ? formatPhone(value) : '');
  const [hasBlurred, setHasBlurred] = useState(false);

  const digits = rawDigits(display);
  const error = hasBlurred && digits.length > 0 && digits.length < 10
    ? 'Enter a 10-digit phone number'
    : null;

  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}{required && <span style={{ color: 'var(--error)', marginLeft: '2px' }}>*</span>}
        </label>
      )}
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        value={display}
        onChange={e => {
          // Let user type freely — no formatting while typing
          setDisplay(e.target.value);
          onChange(rawDigits(e.target.value));
        }}
        onBlur={() => {
          setHasBlurred(true);
          // Format on blur
          const d = rawDigits(display);
          setDisplay(d ? formatPhone(d) : '');
          onChange(d);
        }}
        placeholder={placeholder}
        className="input"
        style={error ? { borderColor: 'var(--error)' } : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} role="alert" className="text-[11px] mt-1" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
