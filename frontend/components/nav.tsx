"use client";

import { BrainCircuit } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export default function Nav() {
  return (
    <div className="fixed z-50 flex h-16 w-screen items-center justify-center border-b border-border bg-background">
      <nav className="flex w-full max-w-screen-lg items-center justify-between px-4">
        <Link href="/">
          <div className="flex items-center text-lg font-semibold">
            <BrainCircuit className="mr-2 h-6 w-6 text-primary" /> Cogni Connect
          </div>
        </Link>
        <div className="flex items-center space-x-6 text-lg font-medium">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/games">Brain Games</Link>
          <Link href="/reports">Reports</Link>
          <Link href="/explore">Memory Explorer</Link>
          <Link href="/upload">Upload</Link>
          <Link href="/faces">Faces</Link>
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}
