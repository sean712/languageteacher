import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// Shared top bar for signed-in creator pages: wordmark → dashboard, email,
// and log out. Keeps navigation consistent so creators can always get home.
export default function CreatorHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="border-b border-paper-300/60 bg-paper-50">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
        <Link
          to="/dashboard"
          className="font-display text-lg font-semibold tracking-tight"
        >
          Lingua
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link
            to="/dashboard"
            className="text-ink-600 hover:text-ink-900 hidden sm:inline"
          >
            Dashboard
          </Link>
          {user?.email && (
            <span className="text-ink-400 hidden sm:inline">{user.email}</span>
          )}
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
            className="text-ink-600 hover:text-ink-900"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
