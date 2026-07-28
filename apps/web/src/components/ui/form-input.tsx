import type { InputHTMLAttributes, ReactNode } from "react";

interface FormInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function FormInput({
  label,
  hint,
  error,
  prefix,
  suffix,
  className = "",
  id,
  ...props
}: FormInputProps) {
  const inputId = id || `form-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <label
      className={`gm-form-field ${error ? "gm-form-field--error" : ""} ${className}`}
      htmlFor={inputId}
    >
      <span className="gm-form-label">{label}</span>
      <div className="gm-form-input-wrapper">
        {prefix && <span className="gm-form-prefix">{prefix}</span>}
        <input
          id={inputId}
          className="gm-form-input"
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {suffix && <span className="gm-form-suffix">{suffix}</span>}
      </div>
      {hint && !error && (
        <span className="gm-form-hint" id={`${inputId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="gm-form-error" id={`${inputId}-error`} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

export function FormSelect({
  label,
  hint,
  error,
  options,
  placeholder,
  className = "",
  id,
  ...props
}: FormSelectProps) {
  const selectId = id || `form-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <label
      className={`gm-form-field ${error ? "gm-form-field--error" : ""} ${className}`}
      htmlFor={selectId}
    >
      <span className="gm-form-label">{label}</span>
      <select
        id={selectId}
        className="gm-form-select"
        aria-invalid={!!error}
        aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error && (
        <span className="gm-form-hint" id={`${selectId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="gm-form-error" id={`${selectId}-error`} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function FormTextarea({
  label,
  hint,
  error,
  className = "",
  id,
  ...props
}: FormTextareaProps) {
  const textareaId = id || `form-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <label
      className={`gm-form-field ${error ? "gm-form-field--error" : ""} ${className}`}
      htmlFor={textareaId}
    >
      <span className="gm-form-label">{label}</span>
      <textarea
        id={textareaId}
        className="gm-form-textarea"
        aria-invalid={!!error}
        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
        {...props}
      />
      {hint && !error && (
        <span className="gm-form-hint" id={`${textareaId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="gm-form-error" id={`${textareaId}-error`} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
