import { setupFetchInterceptor } from "@/lib/fetch-interceptor";
setupFetchInterceptor();

import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ClerkProvider
    publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
    afterSignOutUrl="/auth"
    signInUrl="/auth"
    signUpUrl="/auth"
  >
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </ClerkProvider>
);
