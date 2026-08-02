import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function Toast({ toasts, removeToast }) {
  if (!toasts?.length) return null;

  return (
    <div className="ui-toast-stack">
      {toasts.map((t) => {
        const Icon = ICONS[t.type] || Info;
        return (
          <div
            key={t.id}
            className={`ui-toast ui-toast--${t.type || 'info'}`}
            onClick={() => removeToast(t.id)}
            role="status"
          >
            <Icon
              size={18}
              strokeWidth={2.25}
              color={
                t.type === 'success'
                  ? '#16a34a'
                  : t.type === 'error'
                    ? '#dc2626'
                    : 'var(--color-entorno)'
              }
            />
            <span className="ui-toast__msg">{t.message}</span>
            <X size={16} color="var(--color-purple-light)" />
          </div>
        );
      })}
    </div>
  );
}
