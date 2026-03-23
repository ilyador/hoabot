import { useState, useId } from 'react';

interface FormFieldProps {
  label: string;
  type?: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  validate?: (value: string) => string | null;
  rows?: number;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  className?: string;
  children?: React.ReactNode; // For custom inputs like AddressAutocomplete
}

export function FormField({
  label, type = 'text', value, onChange, placeholder, required, disabled,
  validate, rows, min, max, step, className, children,
}: FormFieldProps) {
  const id = useId();
  const [hasBlurred, setHasBlurred] = useState(false);
  const errorId = `${id}-error`;

  const stringValue = String(value ?? '');
  let error: string | null = null;

  if (hasBlurred && required && !stringValue.trim()) {
    error = `${label} is required`;
  } else if (hasBlurred && validate) {
    error = validate(stringValue);
  }

  // Clear error eagerly when value becomes valid
  if (hasBlurred && error === null) {
    // Valid — error stays cleared
  }

  const inputProps = {
    id,
    value: stringValue,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(e.target.value),
    onBlur: () => setHasBlurred(true),
    placeholder,
    disabled,
    required,
    min, max, step,
    className: `input ${error ? 'border-error' : ''}`,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    'aria-required': required || undefined,
    style: error ? { borderColor: 'var(--error)' } as React.CSSProperties : undefined,
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}{required && <span style={{ color: 'var(--error)', marginLeft: '2px' }}>*</span>}
      </label>
      {children ? (
        children
      ) : rows ? (
        <textarea {...inputProps} rows={rows} />
      ) : (
        <input {...inputProps} type={type} />
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[11px] mt-1" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
