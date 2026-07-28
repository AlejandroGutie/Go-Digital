import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import '../index.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, session, loading } = useAuth();
  const navigate = useNavigate();
  const { toasts, addToast, removeToast } = useToast();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-entorno)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid var(--color-entorno)',
            borderTopColor: 'var(--color-entorno)',
            borderRadius: '50%',
            animation: 'login-spin 0.8s linear infinite',
          }}
        />
        <style>{`
          @keyframes login-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/mascotas" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      addToast(err.message || 'Error de autenticación', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg-main)',
        color: 'var(--text-main)',
      }}
    >
      <Toast toasts={toasts} removeToast={removeToast} />

      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '32px 28px',
          background: 'var(--color-white)',
          borderRadius: 12,
          border: '1px solid var(--color-purple-light)',
          boxShadow: '0 4px 24px rgba(183, 65, 146, 0.08)',
        }}
      >
        <h1
          className="font-display text-brand-magenta"
          style={{
            margin: '0 0 8px',
            fontSize: 28,
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          Iniciar sesión
        </h1>

        <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--color-purple-light)', textAlign: 'center' }}>
          Ingresa con tu correo y contraseña.
        </p>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 6,
              color: 'var(--color-black)',
            }}
          >
            Correo
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                display: 'block',
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid var(--color-purple-light)',
                borderRadius: 8,
                background: 'var(--color-white)',
                color: 'var(--color-black)',
                boxSizing: 'border-box',
              }}
            />
          </label>

          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              marginTop: 16,
              marginBottom: 6,
              color: 'var(--color-black)',
            }}
          >
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                display: 'block',
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid var(--color-purple-light)',
                borderRadius: 8,
                background: 'var(--color-white)',
                color: 'var(--color-black)',
                boxSizing: 'border-box',
              }}
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              marginTop: 24,
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--color-white)',
              background: submitting ? 'var(--color-entorno)' : 'var(--color-entorno)',
              border: 'none',
              borderRadius: 8,
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            {submitting ? 'Procesando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
