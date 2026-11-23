"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Hold" },
  { href: "/today", label: "Today" },
  { href: "/you", label: "You" },
];

export function Dock() {
  const pathname = usePathname();
  return (
    <nav className="dock" aria-label="Main">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
