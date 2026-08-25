import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

const links = [
  { href: "/constellation", label: "Constellation" },
  { href: "/archetypes", label: "Archetypes" },
  { href: "/kohli", label: "Kohli" },
  { href: "/battle", label: "Battle" },
  { href: "/search", label: "DNA Search" },
  { href: "/quiz", label: "Quiz" },
];

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <div className="w-6 h-5 flex flex-col justify-between">
      <motion.span
        className="block h-[2px] bg-white origin-center"
        animate={open ? { rotate: 45, y: 9 } : { rotate: 0, y: 0 }}
        transition={{ duration: 0.25 }}
      />
      <motion.span
        className="block h-[2px] bg-white"
        animate={open ? { opacity: 0 } : { opacity: 1 }}
        transition={{ duration: 0.15 }}
      />
      <motion.span
        className="block h-[2px] bg-white origin-center"
        animate={open ? { rotate: -45, y: -9 } : { rotate: 0, y: 0 }}
        transition={{ duration: 0.25 }}
      />
    </div>
  );
}

export function Navbar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  // Close the menu whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [location]);

  // Lock body scroll while the menu is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <nav className="fixed top-0 left-0 w-full h-[52px] z-50 flex items-center justify-between px-4 sm:px-6 bg-[#080808]/96 backdrop-blur-md border-b border-white/5">
        <Link href="/">
          <div className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group">
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
                fontSize: "1.2rem",
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

        {/* Desktop links */}
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

        {/* Mobile burger */}
        <button
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="md:hidden p-2 -mr-2 cursor-pointer"
        >
          <HamburgerIcon open={open} />
        </button>
      </nav>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 md:hidden bg-[#050505]/95 backdrop-blur-lg pt-[52px]"
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="flex flex-col p-6 gap-1"
            >
              {links.map((link, i) => {
                const isActive = location === link.href;
                return (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.04 }}
                  >
                    <Link href={link.href}>
                      <div
                        className={`block py-4 px-3 text-2xl font-serif uppercase tracking-wider border-b border-white/5 cursor-pointer transition-colors ${
                          isActive
                            ? "text-[#c0392b]"
                            : "text-[#d0d0d0] hover:text-white"
                        }`}
                      >
                        {link.label}
                        {isActive && (
                          <span className="ml-3 text-[10px] text-[#c0392b] align-middle">
                            ●
                          </span>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
              <div className="mt-8 text-[10px] text-[#555] tracking-widest uppercase text-center">
                Tap a destination to enter
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
