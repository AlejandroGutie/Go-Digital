import {
  HashRouter,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate,
  Outlet,
} from 'react-router-dom';
import {
  PawPrint,
  Users,
  Link2,
  Stethoscope,
  CalendarDays,
  Wallet,
  BarChart3,
  LogOut,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Button from './components/ui/Button';
import UserBrandBadge from './components/ui/UserBrandBadge';
import LoginPage from './pages/LoginPage';
import MascotasPage from './pages/MascotasPage';
import CuidadoresPage from './pages/CuidadoresPage';
import AsignacionPage from './pages/AsignacionPage';
import AgendasPage from './pages/AgendasPage';
import ProfesionalesPage from './pages/ProfesionalesPage';
import CobrosPage from './pages/CobrosPage';
import InformesPage from './pages/InformesPage';

const NAV_ITEMS = [
  { to: '/mascotas', label: 'Mascotas', icon: PawPrint },
  { to: '/cuidadores', label: 'Cuidadores', icon: Users },
  { to: '/asignacion', label: 'Asignación', icon: Link2 },
  { to: '/profesionales', label: 'Profesionales', icon: Stethoscope },
  { to: '/agendas', label: 'Agendas', icon: CalendarDays },
  { to: '/cobros', label: 'Cobros', icon: Wallet },
  { to: '/informes', label: 'Informes', icon: BarChart3 },
];

function Nav() {
  const { pathname } = useLocation();
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      /* evitar romper UI si falla signOut */
    }
  };

  return (
    <nav className="ui-nav pt-safe">
      <div className="ui-nav__session">
        <UserBrandBadge />
        <Button variant="primary" size="sm" onClick={handleLogout} aria-label="Cerrar sesión">
          <LogOut size={16} strokeWidth={2.25} />
          <span>Salir</span>
        </Button>
      </div>
      <div className="ui-nav__links">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`ui-nav__link ${active ? 'ui-nav__link--active' : ''}`.trim()}
            >
              <Icon size={16} strokeWidth={2.25} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <>
        <Nav />
        <main className="ui-main">
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
            <Route path="*" element={<Navigate to="/mascotas" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
