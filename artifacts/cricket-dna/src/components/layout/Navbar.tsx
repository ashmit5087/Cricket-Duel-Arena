import React from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";

const links = [
  { href: "/constellation", label: "Constellation" },
  { href: "/archetypes", label: "Archetypes" },
  { href: "/kohli", label: "Kohli" },
  { href: "/battle", label: "Battle" },
  { href: "/search", label: "DNA Search" },
];

export function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="fixed top-0 left-0 w-full h-[52px] z-50 flex items-center justify-between px-6 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/5">
      <Link href="/">
        <div className="flex items-center gap-2 cursor-pointer">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-serif font-bold text-white tracking-widest text-sm">CRICKET DNA</span>
        </div>
      </Link>

      <div className="hidden md:flex items-center gap-8">
        {links.map((link) => {
          const isActive = location === link.href;
          return (
            <Link key={link.href} href={link.href}>
              <div className="relative cursor-pointer text-sm font-medium transition-colors hover:text-white text-muted-foreground uppercase tracking-wider text-[11px]">
                {link.label}
                {isActive && (
                  <motion.div
                    layoutId="navbar-active"
                    className="absolute -bottom-[16px] left-0 right-0 h-[2px] bg-primary"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
