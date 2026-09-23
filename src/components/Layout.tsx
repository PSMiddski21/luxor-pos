import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const navItems = [
  { to: '/', label: 'POS', end: true, adminOnly: false },
  { to: '/customers', label: 'Customers', end: false, adminOnly: false },
  { to: '/stock', label: 'Stock', end: false, adminOnly: true },
  { to: '/rota', label: 'Rota', end: false, adminOnly: true },
  { to: '/timesheets', label: 'Timesheets', end: false, adminOnly: false },
  { to: '/reports', label: 'Reports', end: false, adminOnly: true },
];

export function Layout() {
  const { email, role, signOut } = useAuth();
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || role === 'admin');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Luxor</h1>
          <p className="text-sm text-slate-500">
            {email} <span className="text-slate-300">·</span> {role === 'admin' ? 'Admin' : 'Till'}
          </p>
        </div>
        <nav className="flex gap-1 items-center">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-4 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => signOut()}
            className="ml-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Sign out
          </button>
        </nav>
      </header>

      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
