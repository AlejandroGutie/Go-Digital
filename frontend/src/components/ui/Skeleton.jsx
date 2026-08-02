export default function Skeleton({ rows = 4 }) {
  return (
    <div className="ui-skeleton" aria-hidden="true">
      <span className="ui-skel ui-skel--title" />
      <span className="ui-skel ui-skel--lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="ui-skel" style={{ width: `${88 - i * 8}%` }} />
      ))}
      <span className="ui-skel ui-skel--card" />
    </div>
  );
}
