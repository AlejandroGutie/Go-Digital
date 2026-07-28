import { useEffect } from 'react';

export function Toast({ toasts, removeToast }) {
  return (
    <div style={{
      position:      'fixed',
      bottom:        24,
      right:         24,
      display:       'flex',
      flexDirection: 'column',
      gap:           10,
      zIndex:        9999,
    }}>
      {toasts.map(t => (
        <div key={t.id}
          onClick={() => removeToast(t.id)}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          12,
            padding:      '12px 16px',
            borderRadius: 8,
            minWidth:     280,
            maxWidth:     380,
            cursor:       'pointer',
            boxShadow:    '0 4px 12px rgba(0,0,0,0.12)',
            background:   t.type === 'success' ? '#f0fdf4' : t.type === 'error' ? '#fef2f2' : '#eff6ff',
            borderLeft:   `4px solid ${t.type === 'success' ? '#16a34a' : t.type === 'error' ? '#dc2626' : '#2563eb'}`,
          }}>
          {/* Ícono */}
          <span style={{
            fontSize:   18,
            flexShrink: 0,
            color: t.type === 'success' ? '#16a34a' : t.type === 'error' ? '#dc2626' : '#2563eb'
          }}>
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
          </span>

          {/* Mensaje */}
          <span style={{
            fontSize:   13,
            fontWeight: 500,
            flex:       1,
            color:      t.type === 'success' ? '#166534' : t.type === 'error' ? '#991b1b' : '#1e40af',
          }}>
            {t.message}
          </span>

          {/* Botón cerrar */}
          <span style={{ fontSize: 14, color: '#94a3b8', flexShrink: 0 }}>✕</span>
        </div>
      ))}
    </div>
  );
}