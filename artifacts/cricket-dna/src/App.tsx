import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

// Pages
import Home from "@/pages/Home";
import KohliShrine from "@/pages/KohliShrine";
import BattleArena from "@/pages/BattleArena";
import Constellation from "@/pages/Constellation";
import DNASearch from "@/pages/DNASearch";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 pt-[52px]">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/kohli" component={KohliShrine} />
          <Route path="/battle" component={BattleArena} />
          <Route path="/constellation" component={Constellation} />
          <Route path="/search" component={DNASearch} />
          {/* Placeholder for /archetypes */}
          <Route path="/archetypes">
            <div className="p-24 text-center">Coming soon.</div>
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
