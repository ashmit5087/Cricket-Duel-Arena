import React from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";

const links = [
  { href: "/constellation", label: "Constellation" },
  { href: "/archetypes", label: "Archetypes" },
  { href: "/kohli", label: "Kohli" },
  { href: "/battle", label: "Battle" },
  { href: "/search", label: "DNA Search" },
  { href: "/quiz", label: "Quiz" },
];

export function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="fixed top-0 left-0 w-full h-[52px] z-50 flex items-center justify-between px-6 bg-[#080808]/96 backdrop-blur-md border-b border-white/5">
      <Link href="/">
        <div className="flex items-center gap-3 cursor-pointer group">
          <div className="relative w-2.5 h-2.5 shrink-0">
            <div className="w-full h-full rounded-full bg-[#c0392b] animate-pulse" />
            <div
              className="absolute inset-0 rounded-full blur-[4px] opacity-70 group-hover:opacity-100 transition-opacity"
              style={{ background: "#c0392b" }}
            />
          </div>
          <span
            style={{
              fontFamily: "'Bebas Neue', 'Impact', sans-serif",
              fontSize: "1.35rem",
              letterSpacing: "0.18em",
              color: "#f5f5f5",
              textShadow: "0 0 18px rgba(192,57,43,0.45), 0 0 40px rgba(192,57,43,0.18)",
              lineHeight: 1,
            }}
          >
            CRICKET DNA
          </span>
        </div>
      </Link>

      <div className="hidden md:flex items-center gap-8">
        {links.map((link) => {
          const isActive = location === link.href;
          return (
            <Link key={link.href} href={link.href}>
              <div
                className="relative cursor-pointer text-[11px] font-medium transition-colors hover:text-white uppercase tracking-wider"
                style={{ color: isActive ? "#f5f5f5" : "#555" }}
              >
                {link.label}
                {isActive && (
                  <motion.div
                    layoutId="navbar-active"
                    className="absolute -bottom-[16px] left-0 right-0 h-[2px] bg-[#c0392b]"
                    style={{ boxShadow: "0 0 8px #c0392b" }}
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
