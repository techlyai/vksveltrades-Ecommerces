import type { InputHTMLAttributes } from 'react';

export function RequiredLabel({ children, required = true }: { children: string; required?: boolean }) {
  return <span>{children}{required && <span className="required-mark" aria-hidden="true">*</span>}</span>;
}

export function CheckoutField({ label, error, id, required = true, ...input }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string }) {
  return <label htmlFor={id}>
    <RequiredLabel required={required}>{label}</RequiredLabel>
    <input {...input} id={id} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
    {error && <small id={`${id}-error`} className="checkout-field-error" role="alert">{error}</small>}
  </label>;
}
