import {
  HashRouter,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import MascotasPage from './pages/MascotasPage';
import CuidadoresPage from './pages/CuidadoresPage';
import AsignacionPage from './pages/AsignacionPage';
import AgendasPage from './pages/AgendasPage';
import ProfesionalesPage from './pages/ProfesionalesPage';
import CobrosPage from './pages/CobrosPage';
import InformesPage from './pages/InformesPage';

function Nav() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  const linkStyle = (path) => ({
    textDecoration: 'none',
    padding: '8px 16px',
    borderRadius: 6,
    fontWeight: 500,
    fontSize: 14,
    background: pathname.startsWith(path) ? 'var(--color-entorno)' : 'transparent',
    color: pathname.startsWith(path) ? 'var(--color-white)' : '#0f172a',
  });

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      /* evitar romper UI si falla signOut */
    }
  };

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 24px',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Link to="/mascotas" style={linkStyle('/mascotas')}>
          Mascotas
        </Link>
        <Link to="/cuidadores" style={linkStyle('/cuidadores')}>
          Cuidadores
        </Link>
        <Link to="/asignacion" style={linkStyle('/asignacion')}>
          Asignación
        </Link>
        <Link to="/profesionales" style={linkStyle('/profesionales')}>
          Profesionales
        </Link>
        <Link to="/agendas" style={linkStyle('/agendas')}>
          Agendas
        </Link>
        <Link to="/cobros" style={linkStyle('/cobros')}>
          Cobros
        </Link>
        <Link to="/informes" style={linkStyle('/informes')}>
          Informes
        </Link>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: '#64748b',
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={user?.email || ''}
        >
          {user?.email || ''}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "'Avenir LT Pro', 'Avenir Next', Avenir, sans-serif",
            color: 'var(--color-white)',
            background: 'var(--color-entorno)',
            border: 'var(--color-entorno)',
            borderRadius: 6,
            cursor: 'pointer',
          }}>
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}

function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <>
        <Nav />
        <main
          style={{
            maxWidth: 960,
            margin: '0 auto',
            padding: '0 24px 48px',
            fontFamily:
              "'Avenir LT Pro', 'Avenir Next', Avenir, sans-serif",
          }}>
          <Outlet />
        </main>
      </>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Navigate to="/mascotas" replace />} />
            <Route path="/mascotas" element={<MascotasPage />} />
            <Route path="/cuidadores" element={<CuidadoresPage />} />
            <Route path="/profesionales" element={<ProfesionalesPage />} />
            <Route path="/asignacion" element={<AsignacionPage />} />
            <Route path="/agendas" element={<AgendasPage />} />
            <Route path="/cobros" element={<CobrosPage />} />
            <Route path="/informes" element={<InformesPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
