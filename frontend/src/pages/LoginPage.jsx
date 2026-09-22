import { useState } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import Field, { Input } from '../components/ui/Field';
import Button from '../components/ui/Button';
import clientLogo from '../assets/logo-pelu-eli.png';
import goDigitalLogo from '../assets/LogoGo-Digital.png';
import { safeReturnPath } from '../utils/authRedirect';
import '../index.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, session, loading, authError, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get('returnUrl'));
  const { toasts, addToast, removeToast } = useToast();

  if (loading) {
    return (
      <div className="ui-login">
        <div className="ui-skeleton" style={{ width: 280 }}>
          <span className="ui-skel ui-skel--card" />
        </div>
      </div>
    );
  }

  if (session) {
    return <Navigate to={returnTo} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      addToast(err.message || 'Error de autenticación', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ui-login">
      <Toast toasts={toasts} removeToast={removeToast} />

      <div className="ui-login__card">
        <div className="ui-login__brand">
          <img
            src={clientLogo}
            alt="Logo"
            className="ui-login__logo"
          />
        </div>

        <h1 className="font-display ui-page-title" style={{ textAlign: 'center', marginBottom: 8 }}>
          Iniciar sesión
        </h1>
        <p className="ui-page-subtitle" style={{ textAlign: 'center', marginBottom: 24 }}>
          Ingresa con tu correo y contraseña.
        </p>

        {authError ? (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(185, 28, 28, 0.25)',
              background: 'rgba(254, 226, 226, 0.65)',
              color: '#7f1d1d',
              fontSize: '0.875rem',
            }}
          >
            <p style={{ margin: '0 0 10px' }}>{authError}</p>
            <Button variant="secondary" size="sm" type="button" onClick={() => refreshSession()}>
              Reintentar sesión
            </Button>
          </div>
        ) : null}

        <form className="ui-form" onSubmit={handleSubmit}>
          <Field id="login-email" label="Correo" required>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>

          <Field id="login-password" label="Contraseña" required>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>

          <Button type="submit" variant="primary" block disabled={submitting}>
            {submitting ? 'Procesando…' : 'Ingresar'}
          </Button>
        </form>

        <div className="ui-login__footer">
          <img
            src={goDigitalLogo}
            alt="Go-Digital"
            className="ui-login__footer-logo"
          />
          <span className="ui-login__footer-text">
            © {new Date().getFullYear()} Go-Digital. Todos los derechos reservados.
          </span>
        </div>
      </div>
    </div>
  );
}
