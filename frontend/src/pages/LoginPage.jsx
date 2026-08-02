import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import Field, { Input } from '../components/ui/Field';
import Button from '../components/ui/Button';
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
      <div className="ui-login">
        <div className="ui-skeleton" style={{ width: 280 }}>
          <span className="ui-skel ui-skel--card" />
        </div>
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
    <div className="ui-login">
      <Toast toasts={toasts} removeToast={removeToast} />

      <div className="ui-login__card">
        <h1 className="font-display ui-page-title" style={{ textAlign: 'center', marginBottom: 8 }}>
          Iniciar sesión
        </h1>
        <p className="ui-page-subtitle" style={{ textAlign: 'center', marginBottom: 24 }}>
          Ingresa con tu correo y contraseña.
        </p>

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
      </div>
    </div>
  );
}
