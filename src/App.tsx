import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Connect from './pages/Connect';
import Login from './pages/Login';
import TeacherPage from './pages/TeacherPage';
import RequireAuth from './components/RequireAuth';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/connect"
        element={
          <RequireAuth>
            <Connect />
          </RequireAuth>
        }
      />
      <Route path="/:teacherSlug" element={<TeacherPage />} />
    </Routes>
  );
}
