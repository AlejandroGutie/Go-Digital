import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from './ui/Button';
import { buildLoginPath } from '../utils/authRedirect';

const font =
  "'Avenir LT Pro', 'Avenir Next', Avenir, sans-serif";

export default function ProtectedRoute({ children }) {
  const { session, loading, authError, refreshSession } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '50vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: font,
          background: '#f8fafc',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid #e2e8f0',
            borderTopColor: '#0f172a',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Error de red al boot ≠ logout: no redirigir a login.
  if (authError && !session) {
    return (
      <div
        className="ui-login"
        style={{ fontFamily: font }}
      >
        <div className="ui-login__card" style={{ textAlign: 'center' }}>
          <h1 className="font-display ui-page-title" style={{ marginBottom: 8 }}>
            Sin conexión con la sesión
          </h1>
          <p className="ui-page-subtitle" style={{ marginBottom: 20 }}>
            {authError}
          </p>
          <Button variant="primary" onClick={() => refreshSession()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    const returnPath = `${location.pathname}${location.search || ''}`;
    return <Navigate to={buildLoginPath(returnPath)} replace />;
  }

  return children;
}
