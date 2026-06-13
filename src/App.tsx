import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { PremiumToaster } from "@/lib/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/CommandPalette";
import { OnboardingModal } from "@/components/OnboardingModal";
import AppLayout from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import { Seo } from "@/components/Seo";

// const GetStartedPage = lazy(() => import("@/pages/GetStartedPage")); // temporarily disabled, will release later
const WebsitePage = lazy(() => import("@/pages/WebsitePage"));
const PrivacyPolicyPage = lazy(() => import("@/pages/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("@/pages/TermsPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const DatasetsPage = lazy(() => import("@/pages/DatasetsPage"));
const QueryPage = lazy(() => import("@/pages/QueryPage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));
// const InsightsPage = lazy(() => import("@/pages/InsightsPage")); // temporarily disabled, will release later
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const ConnectionsPage = lazy(() => import("@/pages/ConnectionsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const DeployedChatPage = lazy(() => import("@/pages/DeployedChatPage"));
const AutomationsPage = lazy(() => import("@/pages/AutomationsPage"));
const DashboardsViewerPage = lazy(() => import("@/pages/DashboardsViewerPage"));
const GlossaryPage = lazy(() => import("@/pages/GlossaryPage"));

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
      <PremiumToaster position="top-right" max={4} />
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
              {/* Get Started — temporarily disabled, will release later */}
              {/* <Route path="get-started" element={<GetStartedPage />} /> */}
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="datasets" element={<DatasetsPage />} />
              <Route path="connections" element={<ConnectionsPage />} />
              <Route path="query" element={<QueryPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="automations" element={<AutomationsPage />} />
              <Route path="dashboards" element={<DashboardsViewerPage />} />
              <Route path="glossary" element={<GlossaryPage />} />
              {/* Insights — temporarily disabled, will release later */}
              {/* <Route path="insights" element={<InsightsPage />} /> */}
              <Route path="admin" element={<AdminPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="pricing" element={<PricingPage />} />
            </Route>
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/deploy/:deployId" element={<DeployedChatPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
