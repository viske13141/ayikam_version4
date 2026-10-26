import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/aikyam/SiteLayout";
import { jyotirlingas } from "./temples";
import "./shiva.css";

// ─── Frame manifest ───────────────────────────────────────────────────────────
// part1: 28 frames  (frame-0001.png … frame-0028.png)
// part2: 27 frames  (frame-0001.png … frame-0027.png)
// Total: 55 frames  (0-based indices 0–54)

const P1 = "/shivalingas/part1";
const P2 = "/shivalingas/part2";
const pad = (n: number) => String(n).padStart(4, "0");

const PART1_COUNT = 28;
const PART2_COUNT = 27;

export const FRAMES: string[] = [
  ...Array.from({ length: PART1_COUNT }, (_, i) => `${P1}/frame-${pad(i + 1)}.png`),
  ...Array.from({ length: PART2_COUNT }, (_, i) => `${P2}/frame-${pad(i + 1)}.png`),
];
const TOTAL = FRAMES.length; // 55

// ─── Scroll timeline ─────────────────────────────────────────────────────────
// Total scroll track = REVEAL_VH (overlay fade) + JOURNEY_VH (frame playback)
// REVEAL_FRACTION = share of total progress devoted to Phase A
const REVEAL_VH = 60;   // vh of scroll consumed by the opening reveal
const JOURNEY_VH = 600; // vh of scroll for the full frame sequence
const TOTAL_VH = REVEAL_VH + JOURNEY_VH;
const REVEAL_FRACTION = REVEAL_VH / TOTAL_VH; // ~0.091
const OVERLAY_START_OPACITY = 0.60;

// ─── Scene manifest ───────────────────────────────────────────────────────────
// Cannot visually inspect assets; using general Shiva reflection copy.
// Scene boundaries are distributed proportionally across both parts.
// Identities are NOT claimed for specific frames — editorial note preserved.
interface Scene {
  startFrame: number; // 0-based inclusive
  endFrame: number;   // 0-based inclusive
  eyebrow: string;
  title: string;
  body: string;
  reflection: string;
  side: "left" | "right" | "center";
}

const SCENES: Scene[] = [
  // Part 1 — frames 0–27
  {
    startFrame: 0,
    endFrame: 6,
    eyebrow: "THE SACRED JOURNEY · 01",
    title: "Pause before the sacred",
    body: "Let your attention rest on the forms before you — the rising towers, the stone, the water, the surrounding landscape. Take a moment to notice before moving forward.",
    reflection: "What becomes visible when you slow down?",
    side: "left",
  },
  {
    startFrame: 7,
    endFrame: 13,
    eyebrow: "THE SACRED JOURNEY · 02",
    title: "The architecture of attention",
    body: "Each carved surface holds centuries of intention. Allow the detail to draw your eye inward, from the outer form to the quiet at its centre.",
    reflection: "Where does your attention naturally settle?",
    side: "right",
  },
  {
    startFrame: 14,
    endFrame: 20,
    eyebrow: "THE SACRED JOURNEY · 03",
    title: "Light and threshold",
    body: "Notice how light moves across stone — the way a threshold marks a shift in attention as much as a shift in space. Crossing it asks something of you.",
    reflection: "What do you carry with you as you enter?",
    side: "left",
  },
  {
    startFrame: 21,
    endFrame: 27,
    eyebrow: "THE SACRED JOURNEY · 04",
    title: "The still point",
    body: "Within the movement of the journey, there is always a still point. The temple does not move toward you — you move toward it, and in doing so, you change.",
    reflection: "Can you find stillness within motion?",
    side: "right",
  },
  // Part 2 — frames 28–54
  {
    startFrame: 28,
    endFrame: 34,
    eyebrow: "THE SACRED JOURNEY · 05",
    title: "A new sequence begins",
    body: "The second part of this journey opens with a different quality of light. Bring the same attention you have been practising — fresh eyes, unhurried.",
    reflection: "How does your seeing change as the journey continues?",
    side: "left",
  },
  {
    startFrame: 35,
    endFrame: 41,
    eyebrow: "THE SACRED JOURNEY · 06",
    title: "Sacred water and stone",
    body: "Water and stone appear together in many of these traditions — one yielding, one enduring. Notice what each quality asks of you.",
    reflection: "Which quality do you need more of today?",
    side: "right",
  },
  {
    startFrame: 42,
    endFrame: 48,
    eyebrow: "THE SACRED JOURNEY · 07",
    title: "The tower and the sky",
    body: "The shikhara rises toward the open sky — a vertical axis connecting earth and the infinite. Let your gaze follow it upward without hurry.",
    reflection: "What opens when you look up?",
    side: "left",
  },
  {
    startFrame: 49,
    endFrame: 54,
    eyebrow: "THE SACRED JOURNEY · 08",
    title: "Carry that attention forward",
    body: "Each temple offers a different point of encounter. Continue with curiosity, allowing every new scene to invite a fresh moment of attention beyond the screen.",
    reflection: "Carry that attention beyond the screen.",
    side: "right",
  },
];

// A sticky viewport-height stage needs one extra viewport in its track so the
// scrollable distance itself equals the reveal plus journey duration.
const SCROLL_HEIGHT_VH = TOTAL_VH + 100;
const MAX_DPR = 1.75;
const EAGER_WINDOW = 8;
const CONCURRENCY = 4;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sm = (t: number) => { const c = clamp01(t); return c * c * (3 - 2 * c); };

export function ShivaExperience() {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const darkOverlayRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<(HTMLElement | null)[]>([]);
  const [openTemple, setOpenTemple] = useState(0);
  const [frameError, setFrameError] = useState(false);
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (reducedMotion) return;

    const track = trackRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // ── image cache ──────────────────────────────────────────────────────────
    const cache: (HTMLImageElement | null)[] = new Array(TOTAL).fill(null);
    const requested = new Set<number>();
    let disposed = false;
    let activeLoads = 0;
    const queue: number[] = [];

    function loadOne(idx: number): Promise<void> {
      if (cache[idx] || idx < 0 || idx >= TOTAL || requested.has(idx)) return Promise.resolve();
      requested.add(idx);
      return new Promise((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.src = FRAMES[idx]!;
        const done = () => {
          if (!disposed) {
            if (img.naturalWidth) {
              cache[idx] = img;
            } else {
              if (import.meta.env.DEV) console.warn("[Shiva] zero-size frame:", FRAMES[idx]);
              setFrameError(true);
            }
            needsDraw = true;
          }
          resolve();
        };
        img.onload = () => (img.decode ? img.decode().then(done, done) : done());
        img.onerror = () => {
          if (import.meta.env.DEV) console.warn("[Shiva] missing frame:", FRAMES[idx]);
          setFrameError(true);
          resolve();
        };
      });
    }

    async function drainQueue() {
      while (queue.length > 0 && activeLoads < CONCURRENCY && !disposed) {
        const idx = queue.shift()!;
        if (cache[idx] || requested.has(idx)) continue;
        activeLoads++;
        await loadOne(idx);
        activeLoads--;
        if (!disposed) drainQueue();
      }
    }

    function enqueueRange(center: number, radius: number) {
      // Prioritise frames closest to center
      for (let d = 0; d <= radius; d++) {
        for (const i of d === 0 ? [center] : [center - d, center + d]) {
          if (i >= 0 && i < TOTAL && !cache[i] && !requested.has(i) && !queue.includes(i)) {
            queue.push(i);
          }
        }
      }
      drainQueue();
    }

    // ── canvas sizing ────────────────────────────────────────────────────────
    let W = 0, H = 0, needsDraw = true;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      needsDraw = true;
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    // ── draw — cover-fit ─────────────────────────────────────────────────────
    function nearest(idx: number): HTMLImageElement | null {
      for (let d = 0; d < TOTAL; d++) {
        if (cache[idx - d]) return cache[idx - d]!;
        if (cache[idx + d]) return cache[idx + d]!;
      }
      return null;
    }

    function draw(frameIdx: number) {
      const idx = Math.max(0, Math.min(TOTAL - 1, Math.round(frameIdx)));
      const img = cache[idx] ?? nearest(idx);
      if (!img || W <= 0 || H <= 0) return;
      // cover-fit: fill viewport, preserve aspect ratio
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    }

    // ── scroll state ─────────────────────────────────────────────────────────
    // rawProgress: 0..1 over the full scroll track (Phase A + Phase B)
    // overlayOpacity: OVERLAY_START_OPACITY..0  during Phase A
    // frameProgress:  0..1 over TOTAL frames     during Phase B
    let targetRaw = 0;
    let currentRaw = 0;
    let lastDrawnFrame = -1;
    let rafId = 0;

    function getRawProgress(): number {
      const rect = track.getBoundingClientRect();
      const trackH = track.offsetHeight - window.innerHeight;
      if (trackH <= 0) return 0;
      return clamp01(-rect.top / trackH);
    }

    targetRaw = getRawProgress();
    currentRaw = targetRaw;

    function onScroll() {
      targetRaw = getRawProgress();
      // Preload frames near the current position in Phase B
      const phaseB = clamp01((targetRaw - REVEAL_FRACTION) / (1 - REVEAL_FRACTION));
      const near = Math.round(phaseB * (TOTAL - 1));
      enqueueRange(near, EAGER_WINDOW);
    }

    function tick() {
      rafId = requestAnimationFrame(tick);

      currentRaw += (targetRaw - currentRaw) * 0.16;
      if (Math.abs(targetRaw - currentRaw) < 0.0005) currentRaw = targetRaw;

      // ── Phase A: overlay fade, frame stays at 0 ──────────────────────────
      const overlayOpacity = currentRaw < REVEAL_FRACTION
        ? OVERLAY_START_OPACITY * (1 - currentRaw / REVEAL_FRACTION)
        : 0;

      const darkOverlay = darkOverlayRef.current;
      if (darkOverlay) {
        darkOverlay.style.opacity = String(overlayOpacity);
      }

      // ── Phase B: advance frames ──────────────────────────────────────────
      const phaseB = clamp01((currentRaw - REVEAL_FRACTION) / (1 - REVEAL_FRACTION));
      const currentFrame = phaseB * (TOTAL - 1);

      const fi = Math.round(currentFrame);
      if (needsDraw || fi !== lastDrawnFrame) {
        draw(currentFrame);
        lastDrawnFrame = fi;
        needsDraw = false;
      }

      // ── Scene overlay opacity (only active in Phase B) ───────────────────
      SCENES.forEach((scene, i) => {
        const el = sceneRefs.current[i];
        if (!el) return;
        // Hide all scenes during Phase A
        if (currentRaw < REVEAL_FRACTION) {
          el.style.opacity = "0";
          el.style.visibility = "hidden";
          return;
        }
        const fade = Math.max((scene.endFrame - scene.startFrame) * 0.25, 1.5);
        let o = 0;
        if (currentFrame >= scene.startFrame && currentFrame <= scene.endFrame) {
          o = Math.min(
            sm((currentFrame - scene.startFrame) / fade),
            sm((scene.endFrame - currentFrame) / fade),
          );
        }
        el.style.opacity = String(o);
        el.style.visibility = o < 0.005 ? "hidden" : "visible";
      });
    }

    // ── boot ─────────────────────────────────────────────────────────────────
    // Load frame 0 first so canvas shows immediately
    loadOne(0).then(() => {
      if (!disposed) {
        draw(0);
        canvas.dataset["ready"] = "true";
      }
    });
    // Eager window around start
    enqueueRange(0, EAGER_WINDOW);
    // Background load rest
    for (let i = EAGER_WINDOW + 1; i < TOTAL; i++) {
      if (!cache[i] && !requested.has(i) && !queue.includes(i)) queue.push(i);
    }
    drainQueue();

    // Set the opening overlay to the current scroll-restored timeline state.
    if (darkOverlayRef.current) {
      const initialOpacity =
        targetRaw < REVEAL_FRACTION ? OVERLAY_START_OPACITY * (1 - targetRaw / REVEAL_FRACTION) : 0;
      darkOverlayRef.current.style.opacity = String(initialOpacity);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    enqueueRange(
      Math.round(clamp01((targetRaw - REVEAL_FRACTION) / (1 - REVEAL_FRACTION)) * (TOTAL - 1)),
      EAGER_WINDOW,
    );
    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
    };
  }, [reducedMotion]);

  return (
    <div className="aikyam-page shiva-page">
      <SiteNav />
      {/* Visually hidden page title for accessibility */}
      <h1 className="sr-only">Shiva — I SEE · The 12 Jyotirlingas</h1>
      <main>
        {/* ── Cinematic scroll track — first thing after nav ── */}
        <div
          className="shiva-scroll-track"
          ref={trackRef}
          style={{ height: `${SCROLL_HEIGHT_VH}svh` }}
          aria-label={`Shiva cinematic scroll experience — ${TOTAL} frames`}
        >
          <div className="shiva-stage">
            {/* canvas — primary rendering surface */}
            <canvas
              ref={canvasRef}
              className="shiva-canvas"
              aria-hidden="true"
            />

            {/* poster shown until canvas is ready */}
            <img
              className="shiva-poster"
              src={FRAMES[0]}
              alt=""
              fetchPriority="high"
              aria-hidden="true"
            />

            <div className="shiva-vignette" aria-hidden="true" />

            {/* dark opening overlay — Phase A fades this out */}
            <div
              ref={darkOverlayRef}
              className="shiva-dark-overlay"
              aria-hidden="true"
              style={{ opacity: OVERLAY_START_OPACITY }}
            />

            {/* scene overlays — visible only in Phase B */}
            {SCENES.map((scene, i) => (
              <article
                key={i}
                ref={(el) => { sceneRefs.current[i] = el; }}
                className={`shiva-scene shiva-scene--${scene.side}`}
                style={{ opacity: 0, visibility: "hidden" }}
                aria-hidden="true"
              >
                <div className="shiva-scene-scrim" />
                <div className="shiva-scene-body">
                  <p className="aikyam-eyebrow">{scene.eyebrow}</p>
                  <h2>{scene.title}</h2>
                  <p>{scene.body}</p>
                  <p className="shiva-reflection">{scene.reflection}</p>
                  {i === 0 && <p className="shiva-cue">Scroll to discover ↓</p>}
                </div>
              </article>
            ))}

            {frameError && (
              <p className="shiva-frame-error" role="status">
                Some frames could not be loaded. The available scene remains visible.
              </p>
            )}
            <span className="shiva-progress-label" aria-hidden="true">
              SCROLL TO CONTINUE
            </span>

          </div>
        </div>

        <p className="shiva-art-caption">
          Artistic temple visualisations ({PART1_COUNT} + {PART2_COUNT} = {TOTAL} frames);
          landscapes are imaginative and do not represent actual geography.
        </p>

        <section className="shiva-directory" id="temples" aria-labelledby="temple-list-title">
          <div className="shiva-directory-heading">
            <p className="aikyam-eyebrow">Twelve sacred traditions</p>
            <h2 id="temple-list-title">Explore the 12 Jyotirlingas</h2>
            <p>
              Discover the places associated with these sacred traditions. Select a temple to read
              its introduction and reflect on the invitation of Shiva — I SEE.
            </p>
          </div>
          <ol className="shiva-temple-list">
            {jyotirlingas.map((temple, index) => {
              const isOpen = openTemple === index;
              const detailsId = `temple-details-${temple.slug}`;
              return (
                <li className="shiva-temple-entry" key={temple.slug}>
                  <button
                    className="shiva-temple-toggle"
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={detailsId}
                    onClick={() => setOpenTemple(isOpen ? -1 : index)}
                  >
                    <span className="shiva-temple-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="shiva-temple-name">{temple.name}</span>
                    <span className="shiva-temple-location">{temple.location}</span>
                    <span className="shiva-temple-indicator" aria-hidden="true">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="shiva-temple-details" id={detailsId}>
                      <p>{temple.introduction}</p>
                      <p className="shiva-reflection">{temple.reflection}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="shiva-editorial-note">
            These are short editorial introductions and reflection prompts, not researched
            historical accounts. The supplied visualisations are not identified as individual
            temples. Visual inspection of assets was not possible; scene copy uses general
            Shiva reflection text.
          </p>
        </section>

        <section className="shiva-everyday" aria-labelledby="everyday-title">
          <p className="aikyam-eyebrow">A practice beyond the screen</p>
          <h2 id="everyday-title">Bring I SEE into everyday life</h2>
          <p>
            Awareness can begin with a small pause: before a reply, during a conversation, or while
            noticing the world around you. Seeing more clearly can help you respond with greater
            care.
          </p>
          <ul>
            <li>
              <strong>Pause</strong>
              <span>Take a breath before responding.</span>
            </li>
            <li>
              <strong>Observe</strong>
              <span>Notice what is present without rushing to a conclusion.</span>
            </li>
            <li>
              <strong>Reflect</strong>
              <span>Let attention inform your next action.</span>
            </li>
          </ul>
        </section>

        <section className="shiva-closing" aria-labelledby="shiva-closing-title">
          <p className="aikyam-eyebrow">Continue your journey</p>
          <h2 id="shiva-closing-title">Four paths. One journey towards wholeness.</h2>
          <p>
            Continue through the AIKYA Mandala. Explore how creating, seeing, relating, and
            contributing can enrich one another.
          </p>
          <div className="shiva-closing-links">
            <Link to="/aikya-mandala">
              Explore AIKYA Mandala <span aria-hidden="true">↗</span>
            </Link>
            <Link to="/aikya-mandala/shakti">
              Explore Shakti — I CREATE <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
