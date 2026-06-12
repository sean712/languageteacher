import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Connect from './pages/Connect';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChannelManage from './pages/ChannelManage';
import ReviewVideo from './pages/ReviewVideo';
import Library from './pages/Library';
import TeacherPage from './pages/TeacherPage';
import RequireAuth from './components/RequireAuth';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/:slug"
        element={
          <RequireAuth>
            <ChannelManage />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/:slug/review/:videoId"
        element={
          <RequireAuth>
            <ReviewVideo />
          </RequireAuth>
        }
      />
      <Route
        path="/connect"
        element={
          <RequireAuth>
            <Connect />
          </RequireAuth>
        }
      />
      <Route
        path="/library"
        element={
          <RequireAuth>
            <Library />
          </RequireAuth>
        }
      />
      <Route path="/:teacherSlug" element={<TeacherPage />} />
    </Routes>
  );
}
