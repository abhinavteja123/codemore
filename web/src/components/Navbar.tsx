"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { Zap, LogOut, User, Github, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function Navbar() {
  const { data: session } = useSession();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-surface-800 bg-surface-950/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#06b6d4]">
              <Zap size={16} className="text-surface-950" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              Code<span className="text-[#f59e0b]">More</span>
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {session ? (
              <>
                <Link
                  href="/dashboard"
                  className="rounded-md px-3 py-1.5 text-sm text-surface-400 transition hover:bg-surface-800 hover:text-white"
                >
                  Dashboard
                </Link>

                {/* User dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="flex items-center gap-2 rounded-lg border border-surface-800 px-2.5 py-1.5 transition hover:border-surface-600"
                  >
                    {session.user?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={session.user.image}
                        alt=""
                        className="h-6 w-6 rounded-full"
                      />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-700">
                        <User size={14} className="text-surface-300" />
                      </div>
                    )}
                    <span className="hidden text-sm text-surface-300 sm:block">
                      {session.user?.name || session.user?.email?.split("@")[0]}
                    </span>
                    <ChevronDown size={14} className="text-surface-500" />
                  </button>

                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-surface-700 bg-surface-900 py-1 shadow-xl">
                        <div className="border-b border-surface-800 px-3 py-2">
                          <p className="text-sm font-medium text-white">
                            {session.user?.name}
                          </p>
                          <p className="text-xs text-surface-500">
                            {session.user?.email}
                          </p>
                          {session.provider && (
                            <p className="mt-1 flex items-center gap-1 text-[10px] text-surface-500">
                              via {session.provider === "github" ? (
                                <><Github size={10} /> GitHub</>
                              ) : (
                                session.provider
                              )}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => signOut()}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-400 transition hover:bg-surface-800 hover:text-white"
                        >
                          <LogOut size={14} />
                          Sign out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => signIn("google")}
                  className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-surface-400 transition hover:bg-surface-800 hover:text-white sm:flex"
                >
                  Sign in
                </button>
                <button
                  onClick={() => signIn("github")}
                  className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
                >
                  <Github size={14} />
                  GitHub
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
