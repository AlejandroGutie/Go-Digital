export default function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header__titles">
        <h1 className="font-display ui-page-title">{title}</h1>
        {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  );
}
