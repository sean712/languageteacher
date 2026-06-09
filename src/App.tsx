import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import TeacherPage from './pages/TeacherPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/:teacherSlug" element={<TeacherPage />} />
    </Routes>
  );
}
