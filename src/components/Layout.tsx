import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const navItems = [
  { to: '/', label: 'POS', end: true },
  { to: '/customers', label: 'Customers' },
  { to: '/stock', label: 'Stock' },
  { to: '/rota', label: 'Rota' },
  { to: '/timesheets', label: 'Timesheets' },
  { to: '/reports', label: 'Reports' },
];

export function Layout() {
  const { email, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Luxor</h1>
          <p className="text-sm text-slate-500">{email}</p>
        </div>
        <nav className="flex gap-1 items-center">
          {navItems.map((item) => (
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
