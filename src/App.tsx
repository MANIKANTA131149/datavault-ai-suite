import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/CommandPalette";
import { OnboardingModal } from "@/components/OnboardingModal";
import AppLayout from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import { Seo } from "@/components/Seo";

const GetStartedPage = lazy(() => import("@/pages/GetStartedPage"));
const WebsitePage = lazy(() => import("@/pages/WebsitePage"));
const PrivacyPolicyPage = lazy(() => import("@/pages/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("@/pages/TermsPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const DatasetsPage = lazy(() => import("@/pages/DatasetsPage"));
const QueryPage = lazy(() => import("@/pages/QueryPage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));
const InsightsPage = lazy(() => import("@/pages/InsightsPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const ConnectionsPage = lazy(() => import("@/pages/ConnectionsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const DeployedChatPage = lazy(() => import("@/pages/DeployedChatPage"));

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="top-right" richColors closeButton />
      <BrowserRouter>
        <Seo />
        <CommandPalette />
        <OnboardingModal />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/website" replace />} />
            <Route path="/website" element={<WebsitePage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="/terms-and-conditions" element={<TermsPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="get-started" element={<GetStartedPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="datasets" element={<DatasetsPage />} />
              <Route path="connections" element={<ConnectionsPage />} />
              <Route path="query" element={<QueryPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="insights" element={<InsightsPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="pricing" element={<PricingPage />} />
            </Route>
            <Route path="/deploy/:deployId" element={<DeployedChatPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
