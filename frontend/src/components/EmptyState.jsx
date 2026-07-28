export default function EmptyState({ icon, title, description }) {
    return (
      <div style={{
        textAlign:    'center',
        padding:      '48px 24px',
        border:       '1px dashed #cbd5e1',
        borderRadius: 8,
        color:        '#94a3b8',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
        <p style={{ fontSize: 15, fontWeight: 500, color: '#64748b', margin: '0 0 6px' }}>{title}</p>
        <p style={{ fontSize: 13, margin: 0 }}>{description}</p>
      </div>
    );
  }