export default function Field({
  id,
  label,
  required,
  hint,
  children,
  className = '',
}) {
  return (
    <div className={`ui-field ${className}`.trim()}>
      {label != null && (
        <label className="ui-field__label" htmlFor={id}>
          {label}
          {required ? <span className="ui-field__req">*</span> : null}
        </label>
      )}
      {children}
      {hint ? <span className="ui-field__hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ className = '', ...rest }) {
  return <input className={`ui-input ${className}`.trim()} {...rest} />;
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select className={`ui-select ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...rest }) {
  return <textarea className={`ui-textarea ${className}`.trim()} {...rest} />;
}
