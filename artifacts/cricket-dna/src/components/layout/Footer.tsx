import React from "react";

export function Footer() {
  return (
    <footer className="py-12 border-t border-white/5 mt-24 bg-[#050505]">
      <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-muted-foreground text-xs uppercase tracking-widest gap-4">
        <div>
          <span>&copy; {new Date().getFullYear()} CRICKET DNA. ALL RIGHTS RESERVED.</span>
        </div>
        <div className="flex gap-6">
          <span className="hover:text-primary transition-colors cursor-pointer">Privacy</span>
          <span className="hover:text-primary transition-colors cursor-pointer">Terms</span>
          <span className="hover:text-primary transition-colors cursor-pointer">Data Sources</span>
        </div>
      </div>
    </footer>
  );
}
