import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import { QaDataProvider } from '@/lib/QaDataContext';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/Dashboard';
import MyTasks from '@/pages/MyTasks';
import AssignTasks from '@/pages/AssignTasks';
import YourList from '@/pages/YourList';
import Tracker from '@/pages/Tracker';
import Documents from '@/pages/Documents';
import Milestones from '@/pages/Milestones';
import Activity from '@/pages/Activity';
import Report from '@/pages/Report';
import ProjectSetup from '@/pages/ProjectSetup';
import UserManagement from '@/pages/UserManagement';
import LocationDetail from '@/pages/LocationDetail';
import InspectionDetail from '@/pages/InspectionDetail';
import VisiByCode from '@/pages/VisiByCode';

function QaLayout() {
  return (
    <QaDataProvider>
      <Layout />
    </QaDataProvider>
  );
}

const AppRoutes = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<QaLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-tasks" element={<MyTasks />} />
          <Route path="/assign-tasks" element={<AssignTasks />} />
          <Route path="/your-list" element={<YourList />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/milestones" element={<Milestones />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/report" element={<Report />} />
          <Route path="/setup" element={<ProjectSetup />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/location/:locationId" element={<LocationDetail />} />
          <Route path="/inspection/:visiId" element={<InspectionDetail />} />
          <Route path="/visi/:code" element={<VisiByCode />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AppRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App