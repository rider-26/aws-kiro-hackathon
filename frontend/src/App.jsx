import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import TutorProfile from './pages/TutorProfile.jsx';
import FindTutors from './pages/FindTutors.jsx';
import MyBookings from './pages/MyBookings.jsx';
import TutorRequests from './pages/tutor/TutorRequests.jsx';
import TutorSessions from './pages/tutor/TutorSessions.jsx';
import TutorReviews from './pages/tutor/TutorReviews.jsx';
import TutorDashboard from './pages/tutor/TutorDashboard.jsx';
import Home from './pages/Home.jsx';
import Progress from './pages/Progress.jsx';
import GroupSessions from './pages/GroupSessions.jsx';
import Profile from './pages/Profile.jsx';
import MyReports from './pages/MyReports.jsx';
import AcademicIntegrity from './pages/AcademicIntegrity.jsx';
import TutorProfileSettings from './pages/tutor/TutorProfileSettings.jsx';
import TutorAvailability from './pages/tutor/TutorAvailability.jsx';
import Notifications from './pages/Notifications.jsx';
import SessionDetail from './pages/SessionDetail.jsx';
import Messages from './pages/Messages.jsx';
import AIStudy from './pages/AIStudy.jsx';
import QuizPlayer from './pages/QuizPlayer.jsx';
import QuizResult from './pages/QuizResult.jsx';
import AdminModules from './pages/admin/AdminModules.jsx';
import AdminReports from './pages/admin/AdminReports.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminTutors from './pages/admin/AdminTutors.jsx';
import AdminStudents from './pages/admin/AdminStudents.jsx';
import AdminSessions from './pages/admin/AdminSessions.jsx';
import AdminAnalytics from './pages/admin/AdminAnalytics.jsx';
import AdminRecognitionRules from './pages/admin/AdminRecognitionRules.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppShell from './components/AppShell.jsx';
import { useAuth } from './context/AuthContext.jsx';

// Wraps a placeholder/real page in the role-aware shell + protection.
function Shell({ roles, children }) {
  return (
    <ProtectedRoute roles={roles}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />

      {/* Tutee */}
      <Route path="/" element={<Shell roles={['Tutee']}><Home /></Shell>} />
      <Route path="/find-tutors" element={<Shell roles={['Tutee']}><FindTutors /></Shell>} />
      <Route path="/tutors/:id" element={<Shell roles={['Tutee']}><TutorProfile /></Shell>} />
      <Route path="/group-sessions" element={<Shell roles={['Tutee']}><GroupSessions /></Shell>} />
      <Route path="/ai-study" element={<Shell roles={['Tutee']}><AIStudy /></Shell>} />
      <Route path="/ai-study/quiz/:quizId" element={<Shell roles={['Tutee']}><QuizPlayer /></Shell>} />
      <Route path="/ai-study/quiz/:quizId/result" element={<Shell roles={['Tutee']}><QuizResult /></Shell>} />
      <Route path="/bookings" element={<Shell roles={['Tutee']}><MyBookings /></Shell>} />
      <Route path="/sessions/:id" element={<Shell roles={['Tutee', 'Tutor']}><SessionDetail /></Shell>} />
      <Route path="/messages" element={<Shell roles={['Tutee']}><Messages /></Shell>} />
      <Route path="/progress" element={<Shell roles={['Tutee']}><Progress /></Shell>} />
      <Route path="/notifications" element={<Shell roles={['Tutee', 'Tutor', 'Admin']}><Notifications /></Shell>} />
      {/* Linkable from the sidebar notice, session pages and the report form. */}
      <Route path="/academic-integrity" element={<Shell roles={['Tutee', 'Tutor', 'Admin']}><AcademicIntegrity /></Shell>} />
      {/* Reporters of both roles land here from the ReportUpdated notification. */}
      <Route path="/reports" element={<Shell roles={['Tutee', 'Tutor']}><MyReports /></Shell>} />
      <Route path="/profile" element={<Shell roles={['Tutee']}><Profile /></Shell>} />

      {/* Tutor */}
      <Route path="/tutor" element={<Shell roles={['Tutor']}><TutorDashboard /></Shell>} />
      <Route path="/tutor/requests" element={<Shell roles={['Tutor']}><TutorRequests /></Shell>} />
      <Route path="/tutor/sessions" element={<Shell roles={['Tutor']}><TutorSessions /></Shell>} />
      <Route path="/tutor/availability" element={<Shell roles={['Tutor']}><TutorAvailability /></Shell>} />
      <Route path="/tutor/messages" element={<Shell roles={['Tutor']}><Messages /></Shell>} />
      <Route path="/tutor/reviews" element={<Shell roles={['Tutor']}><TutorReviews /></Shell>} />
      <Route path="/tutor/profile" element={<Shell roles={['Tutor']}><TutorProfileSettings /></Shell>} />

      {/* Admin */}
      <Route path="/admin" element={<Shell roles={['Admin']}><AdminDashboard /></Shell>} />
      <Route path="/admin/tutors" element={<Shell roles={['Admin']}><AdminTutors /></Shell>} />
      <Route path="/admin/students" element={<Shell roles={['Admin']}><AdminStudents /></Shell>} />
      <Route path="/admin/sessions" element={<Shell roles={['Admin']}><AdminSessions /></Shell>} />
      <Route path="/admin/reports" element={<Shell roles={['Admin']}><AdminReports /></Shell>} />
      <Route path="/admin/modules" element={<Shell roles={['Admin']}><AdminModules /></Shell>} />
      <Route path="/admin/recognition" element={<Shell roles={['Admin']}><AdminRecognitionRules /></Shell>} />
      <Route path="/admin/analytics" element={<Shell roles={['Admin']}><AdminAnalytics /></Shell>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
