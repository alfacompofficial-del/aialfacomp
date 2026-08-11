import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import NotFound from "./pages/NotFound.tsx";
import Download from "./pages/Download.tsx";
import Developers from "./pages/Developers.tsx";
import DeveloperKeys from "./pages/DeveloperKeys.tsx";
import DeveloperDocs from "./pages/DeveloperDocs.tsx";
import SitePage from "./pages/SitePage.tsx";
import MySites from "./pages/MySites.tsx";
import SettingsPage from "./pages/Settings.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/download" element={<Download />} />
          <Route path="/developers" element={<Developers />} />
          <Route path="/developers/keys" element={<DeveloperKeys />} />
          <Route path="/developers/docs" element={<DeveloperDocs />} />
          <Route path="/site/:slug" element={<SitePage />} />
          <Route path="/sites" element={<MySites />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
