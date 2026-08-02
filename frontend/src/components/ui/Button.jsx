export default function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  icon = false,
  className = '',
  type = 'button',
  children,
  ...rest
}) {
  const classes = [
    'ui-btn',
    `ui-btn--${variant}`,
    size === 'sm' ? 'ui-btn--sm' : '',
    block ? 'ui-btn--block' : '',
    icon ? 'ui-btn--icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
