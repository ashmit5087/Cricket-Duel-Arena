import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ScrollToTop } from "@/components/layout/ScrollToTop";

// Pages
import Home from "@/pages/Home";
import KohliShrine from "@/pages/KohliShrine";
import BattleArena from "@/pages/BattleArena";
import Constellation from "@/pages/Constellation";
import DNASearch from "@/pages/DNASearch";
import Archetypes from "@/pages/Archetypes";
import Quiz from "@/pages/Quiz";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never retry failed requests — every retry burns API quota
      retry: false,
      // 24h stale time — matches server-side Redis TTL exactly.
      // Data fetched once per day, never re-fetched mid-session.
      staleTime: 1000 * 60 * 60 * 24,
      // Don't re-fetch just because the user switched tabs
      refetchOnWindowFocus: false,
      // Don't re-fetch on component remount if data already exists
      refetchOnMount: false,
      // Don't re-fetch on network reconnect
      refetchOnReconnect: false,
    },
  },
});

function Router() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <ScrollToTop />
      <Navbar />
      <main className="flex-1 pt-[52px]">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/kohli" component={KohliShrine} />
          <Route path="/battle" component={BattleArena} />
          <Route path="/constellation" component={Constellation} />
          <Route path="/search" component={DNASearch} />
          <Route path="/archetypes" component={Archetypes} />
          <Route path="/quiz" component={Quiz} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

import { SmoothScrollProvider } from "@/lib/smooth-scroll";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SmoothScrollProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </SmoothScrollProvider>
    </QueryClientProvider>
  );
}

export default App;
