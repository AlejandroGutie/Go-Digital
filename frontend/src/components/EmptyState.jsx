export default function EmptyState({ icon, title, description }) {
  return (
    <div className="ui-empty">
      {icon != null && <div className="ui-empty__icon">{icon}</div>}
      <p className="ui-empty__title">{title}</p>
      {description ? <p className="ui-empty__desc">{description}</p> : null}
    </div>
  );
}
