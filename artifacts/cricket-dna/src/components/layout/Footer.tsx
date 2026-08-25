import React from "react";
import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="py-10 sm:py-12 border-t border-white/5 mt-16 sm:mt-24 bg-[#050505]">
      <div className="container mx-auto px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center text-muted-foreground text-[10px] sm:text-xs uppercase tracking-widest gap-4 text-center md:text-left">
        <div>
          <span>&copy; {new Date().getFullYear()} CRICKET DNA. ALL RIGHTS RESERVED.</span>
        </div>
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
          <Link href="/kohli">
            <span className="hover:text-primary transition-colors cursor-pointer">Kohli</span>
          </Link>
          <Link href="/battle">
            <span className="hover:text-primary transition-colors cursor-pointer">Battle</span>
          </Link>
          <Link href="/quiz">
            <span className="hover:text-primary transition-colors cursor-pointer">Quiz</span>
          </Link>
          <span className="hover:text-primary transition-colors cursor-pointer">Data Sources</span>
        </div>
      </div>
    </footer>
  );
}
