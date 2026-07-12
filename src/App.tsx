/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  ShieldAlert, 
  KeyRound, 
  Zap, 
  Clock, 
  Terminal, 
  FileCode, 
  Github, 
  Cpu, 
  GitPullRequest, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  CheckCircle2, 
  Code,
  ArrowRight,
  Eye,
  Lock,
  RefreshCw,
  Layers
} from "lucide-react";

import SidebarHUDBars from "./components/SidebarHUDBars";
import CodeMoreLinterSandbox from "./components/CodeMoreLinterSandbox";
import PageTransitionIndicator from "./components/PageTransitionIndicator";
import WebGLPortalBg from "./components/WebGLPortalBg";
import WebGLBrandLetter from "./components/WebGLBrandLetter";
import WebGLASTConnectionMesh from "./components/WebGLASTConnectionMesh";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

// Types for Carousel Cards
interface CardItem {
  id: number;
  idx: string;
  name: string;
  desc: string;
  tag: string;
  h1: number;
  h2: number;
  h3: number;
  icon: React.ReactNode;
  severity: string;
  score: string;
  remediation: string;
  codeSnippet: string;
}

const HUD_SECTIONS = [
  { id: "passage", label: "Overview Portal" },
  { id: "scan", label: "Findings Feed" },
  { id: "playground", label: "Schema Preview" },
  { id: "playground-linter", label: "Interactive Linter" },
  { id: "docs", label: "Manifesto Core" },
  { id: "dashboard", label: "Safety Figures" }
];

const SECTION_IDS = ["passage", "scan", "playground", "playground-linter", "docs", "dashboard"];

// Code snippets for the Interactive Scan Playboard
interface CodeExample {
  title: string;
  category: string;
  vulnerable: string;
  vulnerableHighlight: number; // line number to highlight
  repaired: string;
  report: string;
}

const RUNTIME_EXAMPLES: Record<string, CodeExample> = {
  sqli: {
    title: "SQL Injection",
    category: "Critical / Security",
    vulnerable: `// ❌ VULNERABLE CODE - Unsanitized user inputs
app.get("/api/users", async (req, res) => {
  const query = \`SELECT * FROM users WHERE active = true AND name = '\${req.query.name}'\`;
  const result = await db.execute(query);
  res.json(result.rows);
});`,
    vulnerableHighlight: 3,
    repaired: `// ✅ SECURE CODE - Parameritized SQL query
app.get("/api/users", async (req, res) => {
  const query = \`SELECT * FROM users WHERE active = true AND name = ?\`;
  const result = await db.execute(query, [req.query.name]);
  res.json(result.rows);
});`,
    report: `{
  "findingId": "SEC-SQLI-0042",
  "severity": "CRITICAL",
  "analyzer": "CodeMore:VibeScanner",
  "location": {
    "file": "src/db/query.ts",
    "line": 42
  },
  "message": "User query parameter 'name' is directly concatenated into a raw SQL string.",
  "recommendedFix": "Use parameter placeholders (?) to isolate data from sql compilation."
}`
  },
  secrets: {
    title: "Exposed API Key",
    category: "Critical / Secrets",
    vulnerable: `// ❌ VULNERABLE CODE - Plaintext production tokens
import { CloudService } from "cloud-node";

const client = new CloudService({
  apiKey: "aws_live_sk_89fjdh8e2k3m1n8z9p0q2w3e"
});`,
    vulnerableHighlight: 5,
    repaired: `// ✅ SECURE CODE - Loaded via process env secrets
import { CloudService } from "cloud-node";

const client = new CloudService({
  apiKey: process.env.CLOUD_SERVICE_API_KEY
});`,
    report: `{
  "findingId": "SEC-KEYS-0007",
  "severity": "CRITICAL",
  "analyzer": "CodeMore:LeakWatcher",
  "location": {
    "file": "src/config.ts",
    "line": 7
  },
  "message": "Found hardcoded plaintext API key 'aws_live_sk_...' directly in source control.",
  "recommendedFix": "Move keys out of source code. Reference environment variables instead."
}`
  },
  race: {
    title: "Race Condition",
    category: "Critical / Concurrency",
    vulnerable: `// ❌ VULNERABLE CODE - Mutation without state locking
let totalShares = 100;

async function decrementShares(amount) {
  const current = totalShares;
  await delay(10); // Simulated delay
  totalShares = current - amount;
}`,
    vulnerableHighlight: 6,
    repaired: `// ✅ SECURE CODE - Atomic operations
let totalShares = 100;

async function decrementShares(amount) {
  // Use a transactional lock or atomic subtract
  await db.transaction(async (tx) => {
    await tx.execute("UPDATE state SET shares = shares - ?", [amount]);
  });
}`,
    report: `{
  "findingId": "BUG-RACE-0088",
  "severity": "CRITICAL",
  "analyzer": "CodeMore:ConcurrencySuite",
  "location": {
    "file": "src/worker.ts",
    "line": 88
  },
  "message": "Shared local mutable variable 'totalShares' modified across asynchronous ticks.",
  "recommendedFix": "Store session state in database and run updates via transaction."
}`
  }
};

export default function App() {
  // --- Curtain Loader state ---
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const isLoadedRef = useRef<boolean>(isLoaded);
  const [isEntranceFinished, setIsEntranceFinished] = useState<boolean>(false);

  useEffect(() => {
    isLoadedRef.current = isLoaded;
  }, [isLoaded]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 2400);
    return () => clearTimeout(timer);
  }, []);

  // Play GSAP Entrance Animation and set isEntranceFinished
  useEffect(() => {
    if (!isLoaded) return;
    if (!heroCopyRef.current || !heroHintRef.current || !navRef.current) return;

    // Pre-set initial states for the entrance animation
    gsap.set(heroCopyRef.current, { opacity: 0, y: 30, scale: 0.98 });
    gsap.set(heroHintRef.current, { opacity: 0 });
    gsap.set(navRef.current, { opacity: 0, y: -30, xPercent: -50 });

    const ctx = gsap.context(() => {
      gsap.fromTo(heroCopyRef.current,
        { opacity: 0, y: 30, scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1.4,
          ease: "power3.out",
          delay: 1.2
        }
      );

      gsap.fromTo(heroHintRef.current,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 1.0,
          ease: "power2.out",
          delay: 0.8
        }
      );

      gsap.fromTo(navRef.current,
        { opacity: 0, y: -30, xPercent: -50 },
        {
          opacity: 1,
          y: 0,
          xPercent: -50,
          duration: 1.2,
          ease: "power3.out",
          delay: 0.2
        }
      );
    });

    const timer = setTimeout(() => {
      setIsEntranceFinished(true);
    }, 2800); // Ensures entrance finishes and elements are fully settled before ScrollTrigger is initialized

    return () => {
      ctx.revert();
      clearTimeout(timer);
    };
  }, [isLoaded]);

  // Initialize --scroll-p on mount
  useEffect(() => {
    document.documentElement.style.setProperty("--scroll-p", "0");
  }, []);

  // --- Scroll & Layout Refs ---
  const passageRef = useRef<HTMLElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const heroCopyRef = useRef<HTMLDivElement>(null);
  const heroHintRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const scene2Ref = useRef<HTMLDivElement>(null);
  const starfieldRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  // --- Synced scroll state ---
  const [currentSection, setCurrentSection] = useState<string>("passage");
  const currentSectionRef = useRef<string>("passage");
  const activeIdxRef = useRef<number>(0);
  const dragOffsetRef = useRef<number>(0);

  // --- Carousel Data ---
  const CARDS: CardItem[] = useMemo(() => [
    {
      id: 0,
      idx: "Critical / Security",
      name: "SQL Injection",
      desc: "Unsanitized user input in SQL template literal.\nsrc/db/query.ts:42",
      tag: "View Issue →",
      h1: 205, h2: 222, h3: 248,
      icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
      severity: "CRITICAL",
      score: "9.8 / 10",
      remediation: "Use parameterized templates or secure input bindings.",
      codeSnippet: `// query.ts : line 42\nconst query = \`SELECT * FROM users \nWHERE email = '\${input}'\`;\ndb.execute(query);`
    },
    {
      id: 1,
      idx: "Critical / Secrets",
      name: "Exposed Key",
      desc: "AWS_SECRET_KEY exposed in source code.\nsrc/config.ts:7",
      tag: "View Issue →",
      h1: 255, h2: 272, h3: 292,
      icon: <KeyRound className="w-5 h-5 text-amber-400" />,
      severity: "CRITICAL",
      score: "9.5 / 10",
      remediation: "Move secrets to env vars or use a cloud Key Vault.",
      codeSnippet: `// config.ts : line 7\nconst AWS_SECRET_KEY = \n  "AKIAIOSFODNN7EXAMPLE";\n// Danger: credential leakage`
    },
    {
      id: 2,
      idx: "Critical / Concurrency",
      name: "Race Condition",
      desc: "Shared mutable state accessed across threads.\nsrc/worker.ts:88",
      tag: "View Issue →",
      h1: 25, h2: 8, h3: 355,
      icon: <Zap className="w-5 h-5 text-orange-400" />,
      severity: "CRITICAL",
      score: "8.8 / 10",
      remediation: "Incorporate locks, mutexes, or atomic database operations.",
      codeSnippet: `// worker.ts : line 88\nlet current = await getCount();\nawait saveCount(current + 1);\n// Gap allows concurrent collision`
    },
    {
      id: 3,
      idx: "Warning / Bugs",
      name: "Missing Await",
      desc: "Async function called without await.\nsrc/api/handler.ts:19",
      tag: "View Issue →",
      h1: 180, h2: 192, h3: 205,
      icon: <Clock className="w-5 h-5 text-blue-400" />,
      severity: "HIGH WARNING",
      score: "6.4 / 10",
      remediation: "Prepend the function invocation with the 'await' keyword.",
      codeSnippet: `// handler.ts : line 19\ndb.analytics.logEvent("click");\n// Event is resolved out of order`
    },
    {
      id: 4,
      idx: "Warning / Quality",
      name: "Prod Console",
      desc: "console.log present in production bundle.\nsrc/utils/log.ts:3",
      tag: "View Issue →",
      h1: 135, h2: 118, h3: 92,
      icon: <Terminal className="w-5 h-5 text-yellow-400" />,
      severity: "WARNING",
      score: "4.1 / 10",
      remediation: "Strip debug consoles using compilers or conditional checks.",
      codeSnippet: `// log.ts : line 3\nconsole.log("DEBUG_STATE:", \n  session.accessToken);\n// Exposes access token in browser`
    },
    {
      id: 5,
      idx: "Quick Scan",
      name: "Drop your ZIP",
      desc: "No sign-up required. Drag a .zip right here for an instant anonymous scan.",
      tag: "Upload →",
      h1: 44, h2: 38, h3: 28,
      icon: <FileCode className="w-5 h-5 text-teal-400" />,
      severity: "SECURE INTAKE",
      score: "LOCAL ONLY",
      remediation: "Files parsed locally inside browser engine sandbox.",
      codeSnippet: `// Browser local intake\nconst tree = parseZipToAST(zip);\nconst report = await auditLayers(tree);`
    },
    {
      id: 6,
      idx: "Integration",
      name: "Connect GitHub",
      desc: "Sign in, pick a repo, and we pull the code directly. Re-scan anytime with one click.",
      tag: "Connect Repository →",
      h1: 18, h2: 6, h3: 330,
      icon: <Github className="w-5 h-5 text-purple-400" />,
      severity: "OAUTH HANDLER",
      score: "MUTUAL AUTH",
      remediation: "Setup mutual OAuth webhook integrations using standard OAuth2 flow.",
      codeSnippet: `// OAuth2 integration flow\nconst hook = createWebhookTarget();\nconst payload = await hook.fetchDiffs();`
    },
    {
      id: 7,
      idx: "Agent Protocol",
      name: "MCP Server",
      desc: "The static analyzer your AI agent reads. Direct integration with Cursor and Claude Code.",
      tag: "View Docs →",
      h1: 160, h2: 200, h3: 268,
      icon: <Cpu className="w-5 h-5 text-emerald-400" />,
      severity: "AGENT CORE",
      score: "CONNECTED",
      remediation: "Mount as active static tool server definition inside AI context.",
      codeSnippet: `// Model Context Protocol\n{"jsonrpc": "2.0", \n "method": "tools/call",\n "params": { "name": "scan" }}`
    },
    {
      id: 8,
      idx: "CI / CD",
      name: "GitHub Action",
      desc: "Posts a fix-ready PR comment that AI coding agents can act on for any PR.",
      tag: "View Docs →",
      h1: 210, h2: 218, h3: 230,
      icon: <GitPullRequest className="w-5 h-5 text-indigo-400" />,
      severity: "AUTOMATION",
      score: "VERIFIED",
      remediation: "Add codemore-action to your main production release ruleset.",
      codeSnippet: `// GitHub action manifest\n- name: CodeMore Scan\n  uses: codemore/scan@v2\n  with: { token: secrets.TOKEN }`
    }
  ], []);

  // --- Dynamic Slide state, resizing & scroll pinning ---
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isScanningActive, setIsScanningActive] = useState<boolean>(false);
  
  const isDragging = useRef<boolean>(false);
  const startDragX = useRef<number>(0);
  const lenisRef = useRef<Lenis | null>(null);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);
  // Resize boundaries tracking
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const cardSpacing = useMemo(() => {
    if (windowWidth < 480) {
      return Math.min(windowWidth * 0.42, 180);
    }
    if (windowWidth < 760) {
      return Math.min(windowWidth * 0.35, 200);
    }
    if (windowWidth < 1024) {
      return Math.min(windowWidth * 0.25, 215);
    }
    return Math.min(windowWidth * 0.17, 215);
  }, [windowWidth]);

  const dropOffset = useMemo(() => {
    return windowWidth < 760 ? 20 : 60;
  }, [windowWidth]);

  const rotationStep = 7;

  // Scroll and portal animations: unified scroll tracking across the whole portal-scene using GSAP ScrollTrigger and Lenis smooth scroll
  useEffect(() => {
    if (!isEntranceFinished) return;

    // 1. Initialize Lenis smooth scroll
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    lenisRef.current = lenis;

    // Connect Lenis to ScrollTrigger updates
    lenis.on("scroll", ScrollTrigger.update);

    // Frame ticker for Lenis
    const raf = (time: number) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    // 2. Setup GSAP ScrollTrigger for the Portal Scene
    if (!passageRef.current || !portalRef.current || !heroCopyRef.current || !heroHintRef.current || !scene2Ref.current) {
      return;
    }

    // Set initial GSAP states to prevent layout flash or wrong initial positions
    gsap.set(portalRef.current, {
      scale: 1,
      opacity: 1,
      visibility: "visible",
      "--ring-o": 1
    });
    gsap.set(heroCopyRef.current, {
      opacity: 1,
      y: 0,
      scale: 1
    });
    gsap.set(heroHintRef.current, {
      opacity: 1
    });
    gsap.set(scene2Ref.current, {
      opacity: 0,
      scale: 0.01,
      visibility: "hidden",
      pointerEvents: "none"
    });
    if (starfieldRef.current) {
      gsap.set(starfieldRef.current, { opacity: 0.6, visibility: "visible" });
    }
    if (vignetteRef.current) {
      gsap.set(vignetteRef.current, { opacity: 1, visibility: "visible" });
    }

    // Create a scrubbed GSAP Timeline driven entirely by the scroll position of the passage container
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: passageRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          // Clamp progress strictly to [0.0, 1.0] to prevent negative rubber-band overshooting from causing NaN in Math.pow
          const p = Math.max(0, Math.min(1, self.progress));
          const currentScrollY = self.scroll();

          // 1. Update high-performance CSS variable for progress-based CSS calculations
          document.documentElement.style.setProperty("--scroll-p", p.toFixed(4));

          // 2. Add scrolled class to document element for global stylesheet selector styling
          if (currentScrollY > 50) {
            document.documentElement.classList.add("nav-scrolled");
          } else {
            document.documentElement.classList.remove("nav-scrolled");
          }

          // Robust styling updates for navbar (.nav) and progress-bar (.progress-bar)
          if (navRef.current) {
            const navP = Math.min(Math.max((p - 0.15) / 0.18, 0), 1);
            navRef.current.style.opacity = (1 - navP).toFixed(3);
            navRef.current.style.transform = `translate3d(-50%, ${(-navP * 30).toFixed(1)}px, 0)`;
            if (navP >= 0.99) {
              navRef.current.style.visibility = "hidden";
              navRef.current.style.pointerEvents = "none";
            } else {
              navRef.current.style.visibility = "visible";
              navRef.current.style.pointerEvents = "auto";
            }
          }

          if (progressBarRef.current) {
            progressBarRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
          }

          // 3. Robust Visibility and Pointer-Events Toggles based on Progress
          // This avoids GSAP timeline .set() race conditions/skipping on fast scrolls.
          if (portalRef.current) {
            if (p < 0.45) {
              portalRef.current.style.visibility = "visible";
              portalRef.current.style.pointerEvents = "auto";
            } else {
              portalRef.current.style.visibility = "hidden";
              portalRef.current.style.pointerEvents = "none";
            }
          }

          if (heroCopyRef.current) {
            if (p < 0.35) {
              heroCopyRef.current.style.visibility = "visible";
            } else {
              heroCopyRef.current.style.visibility = "hidden";
            }
          }

          if (heroHintRef.current) {
            if (p < 0.12) {
              heroHintRef.current.style.visibility = "visible";
            } else {
              heroHintRef.current.style.visibility = "hidden";
            }
          }

          if (scene2Ref.current) {
            if (p >= 0.10) {
              scene2Ref.current.style.visibility = "visible";
              scene2Ref.current.style.pointerEvents = "auto";
            } else {
              scene2Ref.current.style.visibility = "hidden";
              scene2Ref.current.style.pointerEvents = "none";
            }
          }

          if (starfieldRef.current) {
            if (p < 0.48) {
              starfieldRef.current.style.visibility = "visible";
              starfieldRef.current.style.opacity = ((1 - Math.min(Math.max((p - 0.15) / 0.33, 0), 1)) * 0.6).toFixed(3);
            } else {
              starfieldRef.current.style.visibility = "hidden";
            }
          }

          if (vignetteRef.current) {
            if (p < 0.48) {
              vignetteRef.current.style.visibility = "visible";
              vignetteRef.current.style.opacity = (1 - Math.min(Math.max((p - 0.15) / 0.33, 0), 1)).toFixed(3);
            } else {
              vignetteRef.current.style.visibility = "hidden";
            }
          }

          // 4. Carousel slide indexing in Phase 3
          if (!isDragging.current) {
            let targetIdx = 0;
            let targetOffset = 0;

            if (p >= 0.48) {
              const activeP = (p - 0.48) / 0.52;
              const targetIdxFloat = activeP * (CARDS.length - 1);
              targetIdx = Math.round(targetIdxFloat);
              targetOffset = targetIdxFloat - targetIdx;
            }

            if (activeIdxRef.current !== targetIdx) {
              activeIdxRef.current = targetIdx;
              setActiveIdx(targetIdx);
            }
            if (Math.abs(dragOffsetRef.current - targetOffset) > 0.002) {
              dragOffsetRef.current = targetOffset;
              setDragOffset(targetOffset);
            }
          }

          // 5. Synced HUD Active Section
          let activeSec = currentSectionRef.current;
          if (p < 1.0) {
            activeSec = p >= 0.48 ? "scan" : "passage";
          }
          
          if (currentSectionRef.current !== activeSec) {
            currentSectionRef.current = activeSec;
            setCurrentSection(activeSec);
          }
        }
      }
    });

    // --- TIMELINE DEFINITION ---
    // All values are mapped to a normalized 0 to 1 timeline duration.

    // 1. Fade out the hero hint label extremely early (p = 0 to 0.12)
    tl.to(heroHintRef.current, {
      opacity: 0,
      ease: "power1.out",
      duration: 0.12
    }, 0);

    // 2. Fade out and scale/translate up the main hero copywriting content (p = 0 to 0.35)
    tl.to(heroCopyRef.current, {
      opacity: 0,
      y: -160,
      scale: 1.12,
      ease: "power1.out",
      duration: 0.35
    }, 0);

    // 3. Zoom the WebGL vortex portal (scale 1x to 12x) and smoothly fade the outer conically blurred orbiting ring (p = 0 to 0.45)
    tl.to(portalRef.current, {
      scale: 12.0,
      opacity: 0,
      "--ring-o": 0.08,
      ease: "power2.inOut",
      duration: 0.45
    }, 0);

    // 4. Fade in and expand the Scene 2 blueprint scanner grid layout from the black core void (p = 0.10 to 0.48)
    // Ensures early distant visibility during the zoom sequence to create perfect three-dimensional depth.
    tl.fromTo(scene2Ref.current,
      { opacity: 0, scale: 0.01 },
      {
        opacity: 1,
        scale: 1.0,
        ease: "power2.out",
        duration: 0.38 // (0.48 - 0.10)
      },
      0.10
    );

    return () => {
      tl.kill();
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [isEntranceFinished, CARDS.length]);

  const handleNextSection = () => {
    if (currentSection === "passage") {
      const el = passageRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const totalScrollable = el.offsetHeight - window.innerHeight;
        const elementAbsoluteTop = window.scrollY + rect.top;
        const targetProgress = 0.48;
        const targetScrollRelativeY = targetProgress * totalScrollable;
        const targetY = elementAbsoluteTop + targetScrollRelativeY + 2;
        if (lenisRef.current) {
          lenisRef.current.scrollTo(targetY);
        } else {
          window.scrollTo({
            top: targetY,
            behavior: "smooth"
          });
        }
      }
    } else if (currentSection === "scan") {
      const el = document.getElementById("playground");
      if (el) {
        if (lenisRef.current) {
          lenisRef.current.scrollTo(el);
        } else {
          el.scrollIntoView({ behavior: "smooth" });
        }
      }
    } else {
      const idx = SECTION_IDS.indexOf(currentSection);
      if (idx !== -1 && idx < SECTION_IDS.length - 1) {
        const nextId = SECTION_IDS[idx + 1];
        const el = document.getElementById(nextId);
        if (el) {
          if (lenisRef.current) {
            lenisRef.current.scrollTo(el);
          } else {
            el.scrollIntoView({ behavior: "smooth" });
          }
        }
      } else {
        if (lenisRef.current) {
          lenisRef.current.scrollTo(0);
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    }
  };

  const handleGo = (index: number) => {
    const targetIdx = Math.min(Math.max(index, 0), CARDS.length - 1);
    const el = passageRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const viewHeight = window.innerHeight;
      const totalScrollable = el.offsetHeight - viewHeight;
      if (totalScrollable > 0) {
        const elementAbsoluteTop = window.scrollY + rect.top;
        // Phase 3 starts at p = 0.48 and goes to 1.0
        const phase3StartProgress = 0.48;
        const phase3Range = 0.52;
        const targetProgress = phase3StartProgress + (targetIdx / (CARDS.length - 1)) * phase3Range;
        const targetScrollRelativeY = targetProgress * totalScrollable;
        const targetY = elementAbsoluteTop + targetScrollRelativeY + 2;
        if (lenisRef.current) {
          lenisRef.current.scrollTo(targetY);
        } else {
          window.scrollTo({
            top: targetY, // minor padding to lock precisely
            behavior: "smooth"
          });
        }
        return;
      }
    }

    // Fallback if not scrolling yet
    setActiveIdx(targetIdx);
    setDragOffset(0);
    activeIdxRef.current = targetIdx;
    dragOffsetRef.current = 0;
    isDragging.current = false;
  };

  // Drag and swiping physics
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    startDragX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const delta = startDragX.current - e.clientX;
    const offset = delta / cardSpacing;
    setDragOffset(offset);
    dragOffsetRef.current = offset;
  };

  const handlePointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const endActive = Math.round(activeIdx + dragOffset);
    handleGo(endActive);
  };

  // --- Scroll reveal intersection observer hook ---
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    const revealElements = document.querySelectorAll(".reveal");
    revealElements.forEach((el) => observer.observe(el));

    return () => {
      revealElements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  // --- Scroll observer for lower section active trackers (avoids layout thrashing in ScrollTrigger) ---
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: "-45% 0px -45% 0px", // Center viewport trigger line
      threshold: 0,
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id;
          // Only track sections below the main portal-scene
          if (sectionId && ["playground", "playground-linter", "docs", "dashboard"].includes(sectionId)) {
            const passageEl = passageRef.current;
            if (passageEl) {
              const passageBottom = passageEl.offsetTop + passageEl.offsetHeight;
              // Double check we are scrolled past the passage section
              if (window.scrollY >= passageBottom - 120) {
                currentSectionRef.current = sectionId;
                setCurrentSection(sectionId);
              }
            }
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    ["playground", "playground-linter", "docs", "dashboard"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // --- Interactive Playboard state ---
  const [selectedExampleId, setSelectedExampleId] = useState<string>("sqli");
  const [playboardState, setPlayboardState] = useState<"code" | "repaired" | "report">("code");
  const [scanProgress, setScanProgress] = useState<number>(100);
  const [isScanningCode, setIsScanningCode] = useState<boolean>(false);

  const currentExample = RUNTIME_EXAMPLES[selectedExampleId];

  const handleTriggerScan = () => {
    setIsScanningCode(true);
    setScanProgress(0);
    setPlayboardState("code");
    
    // Smooth scanning fake feedback loop (interactive feel)
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setScanProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setIsScanningCode(false);
        setPlayboardState("report"); // Switch automatically to diagnostics formatted for AI
      }
    }, 40);
  };

  // --- Magnetic hover effects implementation ---
  const handleMagneticMove = (e: React.MouseEvent<HTMLElement>, strength = 0.25) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * strength;
    const y = (e.clientY - rect.top - rect.height / 2) * strength;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(1.02)`;

    if (el.tagName === "BUTTON") {
      const gx = e.clientX - rect.left;
      const gy = e.clientY - rect.top;
      el.style.backgroundImage = `radial-gradient(circle at ${gx}px ${gy}px, rgba(78, 242, 202, 0.12) 0%, transparent 70%)`;
    }
  };

  const handleMagneticLeave = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.style.transform = "";
    el.style.backgroundImage = "";
  };


  return (
    <>
      <PageTransitionIndicator sections={SECTION_IDS} onNextSection={handleNextSection} progressBarRef={progressBarRef} />

      <header ref={navRef} className="nav" aria-label="Global navigation">
        <a href="#top" aria-label="CodeMore home" className="brand" onClick={(e) => {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}>
          <div className="brand__mark" />
          <span className="brand__name">CODEMORE</span>
        </a>
        <nav className="nav__links">
          <a href="#passage" onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById("passage");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}>Overview</a>
          <a href="#scan" onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById("scan");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}>Scan Feed</a>
          <a href="#playground" onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById("playground");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}>Schema</a>
          <a href="#playground-linter" onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById("playground-linter");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}>Linter</a>
          <a href="#docs" onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById("docs");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}>Manifesto</a>
          <a href="#dashboard" onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById("dashboard");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}>Safety Stats</a>
        </nav>
        <a href="#playground-linter" className="nav__cta" onClick={(e) => {
          e.preventDefault();
          const el = document.getElementById("playground-linter");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }}>Try Sandbox</a>
      </header>

      <WebGLASTConnectionMesh />

      {/* ===================== CURTAIN ENTRANCE ===================== */}
      <div className={`curtain ${isLoaded ? "hidden" : "flex"}`} aria-hidden="true">
        <div className="curtain__panel curtain__panel--l">
          <div className="curtain__text-half curtain__text-half--l">
            CODE
          </div>
        </div>
        <div className="curtain__panel curtain__panel--r">
          <div className="curtain__text-half curtain__text-half--r">
            MORE
          </div>
        </div>
      </div>




      <main id="top">
        {/* ===== COMBINED VORTEX AND SCAN PORTAL ===== */}
        <section className="portal-scene" id="passage" ref={passageRef} aria-label="The scan portal" style={{ height: "650vh" }}>
          <div className="portal-sticky">
            <div className="starfield" aria-hidden="true" ref={starfieldRef} />
            <div className="hero-vignette" ref={vignetteRef} />

            <div className="portal" id="portal" ref={portalRef} aria-hidden="true">
              <div className="portal__ring" />
              <div className="portal__edge" />
              <div className="portal__core">
                <WebGLPortalBg />
              </div>
            </div>

            <div className="hero-copy" id="heroCopy" ref={heroCopyRef}>
              <div>
                <span className="kicker">NOT ANOTHER LINTER</span>
                <h1 className="hero-title">
                  <span className="glow">Your code has<br />secrets to tell.</span>
                </h1>
                <p className="hero-sub">
                  CodeMore tears through your codebase in seconds. Security holes, race conditions, forgotten logs, that hardcoded AWS key from 2022 — we find it all and show you exactly where to look.
                </p>
              </div>
            </div>

            <div className="hero-hint text-center" id="heroHint" ref={heroHintRef}>
              <div className="hero-hint-inner">
                <span className="text-gray-400">Scroll to scan</span>
                <span className="bar" aria-hidden="true" />
              </div>
            </div>

            {/* ===== SCENE TWO LAYER (INSIDE VORTEX) ===== */}
            <div className="scene2-layer" id="scan" ref={scene2Ref}>
              
              {/* Parallax technical backdrop grid */}
              <div 
                className="scene2__grid animate-pulse-slow" 
                style={{ transform: `translate3d(${-( (activeIdx + dragOffset) * 45 ).toFixed(1)}px, 0px, 0px)` }}
                aria-hidden="true"
              />
              <div className="scene2__beam" aria-hidden="true" />

              {/* Corner Bracket Accents (HUD design detail) */}
              <div className="hud-bracket hud-bracket-tl" aria-hidden="true" />
              <div className="hud-bracket hud-bracket-tr" aria-hidden="true" />
              <div className="hud-bracket hud-bracket-bl" aria-hidden="true" />
              <div className="hud-bracket hud-bracket-br" aria-hidden="true" />

              {/* Technical HUD Overlay Sidebars */}
              <div className="scene2__hud-overlay select-none pointer-events-none" aria-hidden="true">
                
                {/* Left Sidebar - Parser and Engine Stats */}
                <div className="scene2__hud-left">
                  <div className="border border-gray-950 bg-black/50 p-4 rounded-xl backdrop-blur-md flex flex-col gap-3.5 shadow-25xl">
                    <div className="flex items-center gap-2 border-b border-gray-900/80 pb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] tracking-widest text-[#4ef2ca] font-mono">SYSTEM INTEGRITY ENGINE</span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-mono text-gray-500">
                        <span>PARSER STATUS</span>
                        <span className="text-white font-medium">ACTIVE_SCAN</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono text-gray-500">
                        <span>SCAN DEPTH</span>
                        <span className="text-white font-medium">65,492 AST NODES</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono text-gray-500">
                        <span>ACCURACY VERDICT</span>
                        <span className="text-[#4ef2ca] font-medium font-mono">STABLE (99.8%)</span>
                      </div>
                    </div>

                    <div className="border-t border-gray-900/60 pt-3">
                      <span className="text-[9px] tracking-widest text-gray-500 font-mono block mb-2">GRAPH LOAD RATIO</span>
                      <div className="flex items-end gap-1.5 h-10 pt-1">
                        {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.45, 0.75].map((val, idx) => {
                          const dynamicVal = Math.min(1, Math.max(0.15, val + (activeIdx % 3) * 0.05 - (idx === activeIdx % 8 ? 0.2 : 0)));
                          return (
                            <div 
                              key={idx} 
                              className="flex-1 bg-gradient-to-t from-emerald-500/20 to-[#4ef2ca] rounded-sm transition-all duration-300"
                              style={{ height: `${(dynamicVal * 100).toFixed(0)}%` }}
                            />
                          );
                        })}
                      </div>
                    </div>
                    
                    <div className="text-[9px] text-gray-600 font-mono flex items-center justify-between border-t border-gray-900/60 pt-2 mt-1">
                      <span>SECTOR_0X{activeIdx.toString(16).toUpperCase()}</span>
                      <span>TEMP_REF_44.1A</span>
                    </div>
                  </div>
                  
                  {/* Floating telemetry notes */}
                  <div className="text-[10px] text-gray-600 px-1 font-mono tracking-wide leading-relaxed mt-2">
                    // Scans for deep structural leaks. Horizontal scroll matches viewport offset.
                  </div>
                </div>

                {/* Right Sidebar - Threat Telemetry Panel */}
                <div className="scene2__hud-right">
                  <div className="border border-gray-950 bg-black/50 p-5 rounded-xl backdrop-blur-md flex flex-col gap-4 shadow-25xl">
                    
                    {/* Category Pill based on severity */}
                    <div className="flex justify-between items-center border-b border-gray-900/80 pb-3">
                      <span className="text-[10px] text-gray-500 font-mono tracking-widest">[ ACTIVE ANALYZER ]</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded border uppercase font-mono tracking-wider ${
                        CARDS[activeIdx]?.severity === 'CRITICAL' ? 'text-red-400 border-red-500/20 bg-red-500/5' :
                        CARDS[activeIdx]?.severity.includes('WARNING') ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' :
                        'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
                      }`}>
                        {CARDS[activeIdx]?.severity}
                      </span>
                    </div>

                    {/* Danger score indicator */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 font-mono">DANGER EXPOSURE INDEX</span>
                      <span className={`text-sm font-bold font-mono tracking-wide ${
                        CARDS[activeIdx]?.severity === 'CRITICAL' ? 'text-red-400' :
                        CARDS[activeIdx]?.severity.includes('WARNING') ? 'text-amber-400' :
                        'text-teal-400'
                      }`}>
                        {CARDS[activeIdx]?.score}
                      </span>
                    </div>

                    {/* Syntactic Code Inspector */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] text-gray-500 font-mono tracking-wider">SYNTAX AST MATCH:</span>
                      <div className="relative overflow-hidden rounded-lg border border-gray-900 bg-[#030307] p-3 text-[10px] font-mono leading-normal text-gray-300">
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-[#4ef2ca]/10 anim-sweep pointer-events-none" />
                        <pre className="whitespace-pre select-text font-mono text-[9.5px] text-teal-200/90 leading-tight">
                          {CARDS[activeIdx]?.codeSnippet}
                        </pre>
                      </div>
                    </div>

                    {/* Remediation Advice */}
                    <div className="flex flex-col gap-1.5 bg-white/[0.01] border border-gray-900/40 p-3 rounded-lg">
                      <span className="text-[9px] text-gray-500 font-mono uppercase tracking-widest">PROPOSED REMEDIATION:</span>
                      <p className="text-[10.5px] text-gray-400 leading-normal font-sans tracking-wide">
                        {CARDS[activeIdx]?.remediation}
                      </p>
                    </div>

                  </div>
                </div>

              </div>

              <div className="scene2__head">
                <div>
                  <div className="eyebrow">codemore — scan</div>
                  <h2 className="reveal">
                    SQL Injection // XSS Vulnerabilities // Memory Leaks // Race Conditions
                  </h2>
                </div>
                <p className="reveal">
                  We extract structural code semantics and hand structural definitions to Cursor, Claude Code, or Copilot for secure execution.
                </p>
              </div>

              <div 
                className={`arc ${isDragging.current ? "dragging" : ""}`} 
                id="arc" 
                role="listbox" 
                aria-label="Scan findings" 
                tabIndex={0}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                {CARDS.map((card, i) => {
                  const activeFactor = activeIdx + dragOffset;
                  const off = i - activeFactor;
                  const ax = off * cardSpacing;
                  const ay = Math.pow(Math.abs(off), 1.55) * dropOffset;
                  const rot = off * rotationStep;
                  const sc = Math.max(0.6, 1 - Math.abs(off) * 0.14);
                  const op = Math.max(0, 1 - Math.abs(off) * 0.32);
                  const isCenter = Math.round(activeFactor) === i;

                  return (
                    <article 
                      key={card.id}
                      className={`card ${isCenter ? "is-center" : ""}`} 
                      style={{
                        transform: `translate(-50%,-50%) translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`,
                        opacity: op.toFixed(3),
                        zIndex: 200 - Math.round(Math.abs(off) * 10),
                        borderColor: isCenter ? 
                          (card.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.35)' : 
                           card.severity.includes('WARNING') ? 'rgba(245, 158, 11, 0.35)' : 
                           'rgba(16, 185, 129, 0.35)') : undefined,
                        boxShadow: isCenter ? 
                          (card.severity === 'CRITICAL' ? '0 30px 70px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(239, 68, 68, 0.2), 0 0 45px rgba(239, 68, 68, 0.12)' : 
                           card.severity.includes('WARNING') ? '0 30px 70px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(245, 158, 11, 0.2), 0 0 45px rgba(245, 158, 11, 0.12)' : 
                           '0 30px 70px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(16, 185, 129, 0.2), 0 0 45px rgba(16, 185, 129, 0.12)') : undefined
                      }}
                      onClick={() => {
                        if (!isDragging.current && i !== activeIdx) {
                          handleGo(i);
                        }
                      }}
                    >
                      <div className="world" style={{ "--h1": card.h1, "--h2": card.h2, "--h3": card.h3 } as React.CSSProperties} />
                      <div className="card__scrim" />
                      <div className="card__body">
                        {/* Active level label on top of card inside body */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5">
                            {card.icon}
                            <span className="card__idx text-white/90 font-medium">{card.idx}</span>
                          </div>
                        </div>
                        <h3 className="card__name">{card.name}</h3>
                        <p className="card__desc">{card.desc}</p>
                        <span className="card__go">{card.tag}</span>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="arc-ui">
                <div className="arc-prog" aria-hidden="true">
                  <i id="arcProg" style={{ transform: `translateX(${(activeIdx * (100 / CARDS.length)).toFixed(2)}%)`, width: `${(100 / CARDS.length).toFixed(2)}%` }} />
                </div>
                <div className="arc-count">
                  <b id="arcCur">{String(activeIdx + 1).padStart(2, "0")}</b> / {String(CARDS.length).padStart(2, "0")} · <span id="arcName" className="text-gray-300 font-medium">{CARDS[activeIdx]?.name}</span>
                </div>
                <div className="arc-btns">
                  <button 
                    id="arcPrev" 
                    aria-label="Previous issue" 
                    disabled={activeIdx <= 0}
                    onClick={() => handleGo(activeIdx - 1)}
                    onMouseMove={(e) => handleMagneticMove(e, 0.2)}
                    onMouseLeave={handleMagneticLeave}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button 
                    id="arcNext" 
                    aria-label="Next issue" 
                    disabled={activeIdx >= CARDS.length - 1}
                    onClick={() => handleGo(activeIdx + 1)}
                    onMouseMove={(e) => handleMagneticMove(e, 0.2)}
                    onMouseLeave={handleMagneticLeave}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ===== PLAYBOARD INTERACTIVE DEMO (PLAYGROUND) ===== */}
        <section className="bg-[#080812] border-y border-gray-900 py-20 px-6 sm:px-12" id="playground">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              
              {/* Info Column */}
              <div className="lg:col-span-5 space-y-6">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[rgba(78,242,202,0.15)] bg-[rgba(78,242,202,0.02)] text-xs text-emerald-400 font-mono">
                  <Sparkles className="w-3 h-3 anim-pulse" />
                  <span>Interactive Playground</span>
                </div>
                <h3 className="text-3xl sm:text-4xl font-bold tracking-tight font-display text-white">
                  Give your Agent <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-200 to-indigo-300">
                    Fix-Ready Schemas
                  </span>
                </h3>
                <p className="text-gray-400 text-sm sm:text-base leading-relaxed font-light">
                  Traditional scanners dump messy terminal reports that confuse AI. CodeMore targets code syntax layers, generating precise structural recommendations that AI tools like Cursor can execute directly.
                </p>

                {/* Example selection widgets */}
                <div className="space-y-2.5 pt-4">
                  {Object.entries(RUNTIME_EXAMPLES).map(([id, item]) => (
                    <button 
                      key={id}
                      onClick={() => {
                        setSelectedExampleId(id);
                        setPlayboardState("code");
                      }}
                      className={`w-full flex items-center justify-between p-3.5 rounded-lg border text-left transition-all duration-300 ${
                        selectedExampleId === id 
                          ? "border-[#4ef2ca] bg-[rgba(78,242,202,0.06)] shadow-[0_0_15px_rgba(78,242,202,0.08)]" 
                          : "border-gray-800 bg-black/40 hover:border-gray-700"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{item.category}</span>
                        <span className="text-xs font-semibold text-white mt-1 font-display">{item.title}</span>
                      </div>
                      <Code className={`w-4 h-4 transition-transform duration-300 ${selectedExampleId === id ? "text-[#4ef2ca] scale-110" : "text-gray-500"}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Console Output Column */}
              <div className="lg:col-span-7">
                <div className="rounded-xl border border-gray-800 bg-black overflow-hidden shadow-2xl flex flex-col h-[420px]">
                  
                  {/* Console Header Bar */}
                  <div className="flex items-center justify-between px-4 py-3 bg-[#0d0d18] border-b border-gray-900">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                      <span className="text-[10px] font-mono text-gray-400 ml-2">codemore_agent_protocol.json</span>
                    </div>

                    <div className="flex gap-1 bg-black/60 p-0.5 rounded-md border border-gray-900">
                      <button 
                        onClick={() => setPlayboardState("code")}
                        className={`px-2.5 py-1 text-[10px] font-mono rounded transition-colors ${playboardState === "code" ? "bg-emerald-400/10 text-emerald-300" : "text-gray-400 hover:text-white"}`}
                      >
                        Source
                      </button>
                      <button 
                        onClick={() => setPlayboardState("repaired")}
                        className={`px-2.5 py-1 text-[10px] font-mono rounded transition-colors ${playboardState === "repaired" ? "bg-emerald-400/10 text-emerald-300" : "text-gray-400 hover:text-white"}`}
                      >
                        Repaired
                      </button>
                      <button 
                        onClick={() => setPlayboardState("report")}
                        className={`px-2.5 py-1 text-[10px] font-mono rounded transition-colors ${playboardState === "report" ? "bg-emerald-400/10 text-emerald-300" : "text-gray-400 hover:text-white"}`}
                      >
                        LLM Report
                      </button>
                    </div>
                  </div>

                  {/* Code Screen */}
                  <div className="flex-1 p-4 font-mono text-xs overflow-auto bg-[#040409]">
                    {playboardState === "code" && (
                      <pre className="text-gray-300">
                        <code>
                          {currentExample.vulnerable.split("\n").map((line, index) => {
                            const isLineHighlight = index + 1 === currentExample.vulnerableHighlight;
                            return (
                              <div 
                                key={index} 
                                className={`py-0.5 -mx-4 px-4 border-l-2 transition-all duration-300 ${
                                  isLineHighlight 
                                    ? "bg-red-950/20 border-red-500 text-red-100" 
                                    : "border-transparent"
                                }`}
                              >
                                {line}
                              </div>
                            );
                          })}
                        </code>
                      </pre>
                    )}

                    {playboardState === "repaired" && (
                      <pre className="text-gray-300">
                        <code>
                          {currentExample.repaired.split("\n").map((line, index) => (
                            <div key={index} className="py-0.5 px-1">
                              {line}
                            </div>
                          ))}
                        </code>
                      </pre>
                    )}

                    {playboardState === "report" && (
                      <pre className="text-cyan-200">
                        <code>{currentExample.report}</code>
                      </pre>
                    )}
                  </div>

                  {/* Console Footer Action Bar */}
                  <div className="p-3 bg-[#0d0d18] border-t border-gray-900 flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-mono">
                      {isScanningCode ? "Compiling AST..." : "Ready for Agent Intake"}
                    </span>

                    <button 
                      onClick={handleTriggerScan}
                      disabled={isScanningCode}
                      className="flex items-center gap-2 bg-[#1b715e] hover:bg-[#228e75] disabled:bg-gray-800 text-white font-mono text-xs px-4 py-2 rounded-md transition-all duration-300 font-semibold shadow-md active:scale-95"
                    >
                      {isScanningCode ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin text-emerald-300" />
                          <span>Scanning... {scanProgress}%</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-[#4ef2ca]" />
                          <span>Re-check Semantic AST</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ===== PLAYGROUND LIVE CODE LINTER AND AST PARSER ===== */}
        <CodeMoreLinterSandbox />

        {/* ===== EDITORIAL MANIFESTO (LIGHT) ===== */}
        <section className="manifesto" id="docs" aria-label="Manifesto">
          <div className="manifesto__inner">
            <div className="meta reveal">
              <div className="rule" />
              Protocol<br />v1.0.0<br />Schema-Stable
            </div>
            <div className="reveal">
              <h3 className="font-display">
                A dashboard that <em>actually</em> helps. Not a wall of static lint warnings.
              </h3>
              <p className="drop">
                CodeMore is the protocol layer between code-quality scanners and AI coding agents. It catches the systemic issues that show up in AI-generated apps — disabled database security policies, public-prefixed secret leaks, raw authentication handles, permissive headers — and returns a schema-stable structure that any LLM can understand, fix, and verify seamlessly.
              </p>
              <p>
                <strong>What it catches:</strong> Our unified semantic processor compiles your files in memory. From exposed tokens and weak hashing to unsanitized queries and floating actions, we return clean JSON files optimized precisely for language intelligence parsing.
              </p>
              
              <div className="mt-10 pt-8 border-t border-gray-200/60">
                <span className="font-mono text-xs text-[#156252] font-semibold tracking-wider">
                  INSTALL IN 30 SECONDS
                </span>
                <p className="text-sm mt-3 text-gray-700 leading-relaxed font-light">
                  Pick the surface that matches how your team ships: CLI (<code>npx codemore scan .</code>), GitHub Action for autonomous PR reviews, or our direct MCP Server for integrated IDE contexts.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== ATLAS STATE (DARK) ===== */}
        <section className="atlas" id="dashboard" aria-label="Dashboard figures">
          <div className="atlas__inner">
            <h4 className="reveal font-display text-white">
              Stop shipping blind. You're one scan away from knowing what's lurking in your database.
            </h4>
            <div className="atlas-grid">
              <div className="atlas-cell reveal">
                <div className="k">Health Score</div>
                <div className="n">68</div>
                <div className="l">/ 100 overall repository security and quality score.</div>
              </div>
              <div className="atlas-cell reveal">
                <div className="k">Critical</div>
                <div className="n">03</div>
                <div className="l">Critical vulnerabilities discovered in the last scan.</div>
              </div>
              <div className="atlas-cell reveal">
                <div className="k">Warnings</div>
                <div className="n">12</div>
                <div className="l">Important issues that should be addressed before release.</div>
              </div>
              <div className="atlas-cell reveal">
                <div className="k">Clean Files</div>
                <div className="n">89%</div>
                <div className="l">Proportion of scanned files currently matching safety standards.</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <div className="footer__stars" aria-hidden="true" />
        <div className="footer__inner">
          <div className="footer__top">
            <h5 className="text-white">Stop shipping blind.</h5>
            <div className="fcol">
              <b>Surface Integration</b>
              <a href="#scan">CLI Utility</a>
              <a href="#scan">GitHub Action</a>
              <a href="#scan">MCP Server</a>
              <a href="#scan">VS Code Integration</a>
            </div>
            <div className="fcol">
              <b>Protocol Specification</b>
              <a href="#playground">Schema AST</a>
              <a href="#playground">JSON Output</a>
              <a href="#scan">Validator Engine</a>
            </div>
            <div className="fcol">
              <b>Company</b>
              <a href="#docs">Security Audits</a>
              <a href="#docs">Open Source Core</a>
              <a href="#docs">Contact Engineering</a>
            </div>
          </div>

          <div className="footer__brand" aria-hidden="true">
            {["C", "O", "D", "E", "M", "O", "R", "E"].map((letter, index) => (
              <WebGLBrandLetter key={index} letter={letter} index={index} />
            ))}
          </div>

          <div className="footer__legal">
            <span>© 2026 CodeMore. The static analyzer your AI agent reads.</span>
            <span>Scan · Fix · Verify code with zero friction.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
