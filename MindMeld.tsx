import { useCallback, useEffect, useRef, useState } from 'react';
import { Particles, type ParticlesHandle } from './Particles';
import {
  playOrb,
  playError,
  playSuccess,
  playCombo,
  playClick,
  playStart,
  playGameOver,
  unlockAudio,
  setMuted,
  isMuted,
} from './audio';
import { loadScores, saveScore, isNewHighScore, type HighScore } from './storage';

type Phase = 'start' | 'showing' | 'input' | 'success' | 'gameover' | 'paused';

type Orb = {
  id: number;
  color: string;
  glow: string;
  key: string; // keyboard key
  label: string;
};

const ORBS: Orb[] = [
  { id: 0, color: '#f472b6', glow: '#ec4899', key: 'q', label: 'Q' },
  { id: 1, color: '#a78bfa', glow: '#8b5cf6', key: 'w', label: 'W' },
  { id: 2, color: '#22d3ee', glow: '#06b6d4', key: 'e', label: 'E' },
  { id: 3, color: '#facc15', glow: '#eab308', key: 'a', label: 'A' },
  { id: 4, color: '#34d399', glow: '#10b981', key: 's', label: 'S' },
  { id: 5, color: '#fb923c', glow: '#f97316', key: 'd', label: 'D' },
];

const KEY_TO_ORB: Record<string, number> = ORBS.reduce(
  (acc, o) => ((acc[o.key] = o.id), acc),
  {} as Record<string, number>,
);

function randOrb() {
  return Math.floor(Math.random() * ORBS.length);
}

// Length grows every round; playback speeds up.
function baseDelayForRound(round: number) {
  // 700ms round 1 -> ~260ms by round 15
  return Math.max(240, 720 - round * 32);
}
function litDurationForRound(round: number) {
  return Math.max(160, 500 - round * 22);
}

export default function MindMeld() {
  const [phase, setPhase] = useState<Phase>('start');
  const [sequence, setSequence] = useState<number[]>([]);
  const [inputIndex, setInputIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [litOrb, setLitOrb] = useState<number | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [flash, setFlash] = useState<{ color: string; key: number } | null>(null);
  const [popups, setPopups] = useState<{ id: number; x: number; y: number; text: string; color: string }[]>([]);
  const [rings, setRings] = useState<{ id: number; x: number; y: number; color: string }[]>([]);
  const [scores, setScores] = useState<HighScore[]>([]);
  const [muted, setMutedState] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [showTimingBar, setShowTimingBar] = useState(false);
  const [inputStart, setInputStart] = useState<number>(0);
  const [reactionMs, setReactionMs] = useState<number | null>(null);

  const particlesRef = useRef<ParticlesHandle | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const popupIdRef = useRef(0);
  const ringIdRef = useRef(0);
  const phaseRef = useRef<Phase>('start');
  const inputStartRef = useRef<number>(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    setScores(loadScores());
    setMutedState(isMuted());
  }, []);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  const scheduleShow = useCallback((seq: number[], roundNum: number) => {
    clearTimeouts();
    setPhase('showing');
    setLitOrb(null);
    const step = baseDelayForRound(roundNum);
    const lit = litDurationForRound(roundNum);
    // brief pause before showing
    const startDelay = 400;
    seq.forEach((orbId, i) => {
      const onT = window.setTimeout(() => {
        setLitOrb(orbId);
        playOrb(orbId);
        // small particle puff on the orb
        const el = document.querySelector<HTMLElement>(`[data-orb="${orbId}"]`);
        if (el && particlesRef.current) {
          const r = el.getBoundingClientRect();
          const b = boardRef.current?.getBoundingClientRect();
          if (b) {
            particlesRef.current.burst(
              r.left + r.width / 2 - b.left,
              r.top + r.height / 2 - b.top,
              ORBS[orbId].color,
              10,
              { speed: 2, size: 2, life: 30 },
            );
          }
        }
      }, startDelay + i * step);
      const offT = window.setTimeout(() => {
        setLitOrb(null);
      }, startDelay + i * step + lit);
      timeoutsRef.current.push(onT, offT);
    });
    const endT = window.setTimeout(() => {
      setLitOrb(null);
      setPhase('input');
      setInputIndex(0);
      const now = performance.now();
      inputStartRef.current = now;
      setInputStart(now);
      setReactionMs(null);
      setShowTimingBar(true);
    }, startDelay + seq.length * step + 120);
    timeoutsRef.current.push(endT);
  }, [clearTimeouts]);

  const startGame = useCallback(() => {
    unlockAudio();
    clearTimeouts();
    setScore(0);
    setCombo(0);
    setRound(1);
    setInputIndex(0);
    setReactionMs(null);
    const first = [randOrb(), randOrb(), randOrb()];
    setSequence(first);
    playStart();
    setPhase('showing');
    // delay so start screen animates out
    const t = window.setTimeout(() => scheduleShow(first, 1), 300);
    timeoutsRef.current.push(t);
  }, [clearTimeouts, scheduleShow]);

  const nextRound = useCallback(() => {
    setRound((r) => {
      const nr = r + 1;
      setSequence((seq) => {
        const next = [...seq, randOrb()];
        // schedule after state applies
        const t = window.setTimeout(() => scheduleShow(next, nr), 600);
        timeoutsRef.current.push(t);
        return next;
      });
      return nr;
    });
    setInputIndex(0);
    setPhase('success');
  }, [scheduleShow]);

  const triggerShake = useCallback((intensity: number) => {
    setShakeIntensity(intensity);
    setShakeKey((k) => k + 1);
  }, []);

  const addPopup = useCallback((x: number, y: number, text: string, color: string) => {
    const id = ++popupIdRef.current;
    setPopups((p) => [...p, { id, x, y, text, color }]);
    window.setTimeout(() => {
      setPopups((p) => p.filter((pp) => pp.id !== id));
    }, 900);
  }, []);

  const addRing = useCallback((x: number, y: number, color: string) => {
    const id = ++ringIdRef.current;
    setRings((r) => [...r, { id, x, y, color }]);
    window.setTimeout(() => {
      setRings((r) => r.filter((rr) => rr.id !== id));
    }, 700);
  }, []);

  const gameOver = useCallback(() => {
    clearTimeouts();
    setPhase('gameover');
    playGameOver();
    triggerShake(18);
    setFlash({ color: '#ef4444', key: Date.now() });
    setTimeout(() => setFlash(null), 250);
    const finalScore = score;
    if (finalScore > 0) {
      const updated = saveScore({ score: finalScore, round, date: Date.now() });
      setScores(updated);
    }
  }, [clearTimeouts, round, score, triggerShake]);

  const gameOverRef = useRef(gameOver);
  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  const handleOrbPress = useCallback(
    (orbId: number) => {
      if (phaseRef.current !== 'input') return;
      unlockAudio();

      const expected = sequence[inputIndex];
      const el = document.querySelector<HTMLElement>(`[data-orb="${orbId}"]`);
      const board = boardRef.current;
      const rect = el?.getBoundingClientRect();
      const boardRect = board?.getBoundingClientRect();
      const cx = rect && boardRect ? rect.left + rect.width / 2 - boardRect.left : 0;
      const cy = rect && boardRect ? rect.top + rect.height / 2 - boardRect.top : 0;

      // Brief flash on the orb regardless
      setLitOrb(orbId);
      window.setTimeout(() => setLitOrb((v) => (v === orbId ? null : v)), 140);

      if (orbId !== expected) {
        playError();
        setCombo(0);
        if (particlesRef.current && rect && boardRect) {
          particlesRef.current.burst(cx, cy, '#ef4444', 40, { speed: 6, size: 3, life: 60 });
        }
        addRing(cx, cy, '#ef4444');
        triggerShake(14);
        setFlash({ color: '#ef4444', key: Date.now() });
        window.setTimeout(() => setFlash(null), 200);
        window.setTimeout(() => gameOverRef.current(), 350);
        return;
      }

      // Correct
      playOrb(orbId);
      const now = performance.now();
      const elapsed = now - inputStartRef.current;
      inputStartRef.current = now;
      const fast = elapsed < 700;
      setReactionMs(elapsed);

      if (particlesRef.current && rect && boardRect) {
        particlesRef.current.burst(cx, cy, ORBS[orbId].color, fast ? 26 : 18, {
          speed: fast ? 5 : 3.5,
          size: 3,
          life: 45,
        });
      }
      addRing(cx, cy, ORBS[orbId].color);

      const base = 10;
      const roundBonus = round * 2;
      const speedBonus = fast ? Math.max(0, Math.floor((700 - elapsed) / 20)) : 0;
      const nextCombo = combo + 1;
      const comboMult = 1 + Math.floor(nextCombo / 3) * 0.5;
      const gained = Math.round((base + roundBonus + speedBonus) * comboMult);

      setScore((s) => s + gained);
      setCombo(nextCombo);

      addPopup(cx, cy - 20, `+${gained}${comboMult > 1 ? ` ×${comboMult.toFixed(1)}` : ''}`, ORBS[orbId].color);

      if (nextCombo > 0 && nextCombo % 3 === 0) {
        playCombo();
        addPopup(cx, cy + 20, `COMBO ×${(1 + Math.floor(nextCombo / 3) * 0.5).toFixed(1)}`, '#facc15');
        triggerShake(4);
      }

      const nextIndex = inputIndex + 1;
      setInputIndex(nextIndex);

      if (nextIndex >= sequence.length) {
        // Round complete
        setShowTimingBar(false);
        playSuccess();
        triggerShake(6);
        if (particlesRef.current && boardRect) {
          particlesRef.current.burst(
            boardRect.width / 2,
            boardRect.height / 2,
            '#a78bfa',
            50,
            { speed: 6, size: 4, life: 70 },
          );
        }
        // small round bonus
        const rBonus = round * 15;
        setScore((s) => s + rBonus);
        addPopup(boardRect ? boardRect.width / 2 : 0, boardRect ? boardRect.height / 2 - 40 : 0, `ROUND +${rBonus}`, '#a78bfa');
        nextRound();
      } else {
        // reset timing bar for next input
        setInputStart(performance.now());
      }
    },
    [sequence, inputIndex, combo, round, addPopup, addRing, triggerShake, nextRound],
  );

  const handleOrbPressRef = useRef(handleOrbPress);
  useEffect(() => {
    handleOrbPressRef.current = handleOrbPress;
  }, [handleOrbPress]);

  // Keyboard controls
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'p') {
        if (phaseRef.current === 'input' || phaseRef.current === 'showing') {
          clearTimeouts();
          setPhase('paused');
          playClick();
        } else if (phaseRef.current === 'paused') {
          // resume: replay current sequence
          playClick();
          scheduleShow(sequence, round);
        }
        return;
      }
      if (k === ' ' || k === 'enter') {
        if (phaseRef.current === 'start' || phaseRef.current === 'gameover') {
          e.preventDefault();
          startGame();
        }
        return;
      }
      if (k === 'm') {
        const next = !isMuted();
        setMuted(next);
        setMutedState(next);
        return;
      }
      if (k in KEY_TO_ORB) {
        handleOrbPressRef.current(KEY_TO_ORB[k]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearTimeouts, scheduleShow, sequence, round, startGame]);

  // Show tip after a short delay on start screen
  useEffect(() => {
    if (phase === 'start') {
      const t = setTimeout(() => setShowTip(true), 400);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => () => clearTimeouts(), [clearTimeouts]);

  const highScore = scores[0]?.score ?? 0;

  // Timing bar animation using RAF
  const [timingProgress, setTimingProgress] = useState(0);
  useEffect(() => {
    if (phase !== 'input' || !showTimingBar) {
      setTimingProgress(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - inputStartRef.current;
      // "fast" threshold is 700ms; bar drains over that
      const p = Math.min(1, elapsed / 700);
      setTimingProgress(p);
      if (phaseRef.current === 'input') raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, showTimingBar, inputStart]);



  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1a0b3d_0%,_#05050f_60%)]" />
        <div className="bg-drift-1 absolute -left-1/4 top-1/4 h-[60vh] w-[60vh] rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="bg-drift-2 absolute -right-1/4 bottom-0 h-[70vh] w-[70vh] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="bg-drift-1 absolute left-1/2 top-1/2 h-[50vh] w-[50vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
        {/* subtle grid */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.08]">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Shake wrapper */}
      <ShakeWrap shakeKey={shakeKey} intensity={shakeIntensity}>
        <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col px-4 py-4 sm:py-6">
          {/* Top HUD */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-white/60">
                <div className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_8px_#e879f9]" />
                Mind Meld
              </div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-white sm:text-4xl">
                {score.toLocaleString()}
              </div>
              <div className="mt-0.5 text-xs text-white/50">
                Best <span className="text-white/80 tabular-nums">{highScore.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex flex-col items-center">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/60">Round</div>
              <div className="text-2xl font-bold tabular-nums text-white sm:text-3xl">{round || '—'}</div>
              {combo > 1 && (
                <div className="pop-in mt-1 rounded-full bg-yellow-400/20 px-2 py-0.5 text-xs font-bold text-yellow-300">
                  {combo}× COMBO
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  setMutedState(next);
                  playClick();
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
                aria-label="Toggle sound"
              >
                {muted ? '🔇' : '🔊'}
              </button>
              {(phase === 'input' || phase === 'showing') && (
                <button
                  onClick={() => {
                    clearTimeouts();
                    setPhase('paused');
                    playClick();
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
                >
                  ⏸ Pause
                </button>
              )}
            </div>
          </div>

          {/* Status text */}
          <div className="mt-3 flex h-8 items-center justify-center">
            {phase === 'showing' && (
              <div className="fade-in-up text-sm font-medium tracking-wide text-white/70">
                Watch the pattern…
              </div>
            )}
            {phase === 'input' && (
              <div className="fade-in-up flex items-center gap-3 text-sm font-medium text-white/80">
                <span className="tracking-wide">Your turn</span>
                <span className="tabular-nums text-white/50">
                  {inputIndex}/{sequence.length}
                </span>
              </div>
            )}
            {phase === 'success' && (
              <div className="pop-in text-sm font-bold text-emerald-300">Nice! Next round…</div>
            )}
          </div>

          {/* Timing bar */}
          <div className="mt-1 h-1 w-full max-w-md self-center overflow-hidden rounded-full bg-white/5">
            {phase === 'input' && showTimingBar && (
              <div
                className="h-full rounded-full transition-none"
                style={{
                  width: `${(1 - timingProgress) * 100}%`,
                  background:
                    timingProgress < 0.5
                      ? 'linear-gradient(90deg,#facc15,#f472b6)'
                      : 'linear-gradient(90deg,#a78bfa,#22d3ee)',
                  boxShadow: '0 0 12px rgba(255,255,255,0.3)',
                }}
              />
            )}
          </div>

          {/* Board */}
          <div className="relative mt-4 flex flex-1 items-center justify-center">
            <div
              ref={boardRef}
              className="relative aspect-square w-full max-w-[min(90vw,540px)] max-h-[min(70vh,540px)]"
            >
              <Particles className="pointer-events-none absolute inset-0 h-full w-full" />

              {/* Rings */}
              {rings.map((r) => (
                <div
                  key={r.id}
                  className="ring-ping pointer-events-none absolute h-24 w-24 rounded-full border-2"
                  style={{
                    left: r.x - 48,
                    top: r.y - 48,
                    borderColor: r.color,
                    boxShadow: `0 0 20px ${r.color}`,
                  }}
                />
              ))}

              {/* Popups */}
              {popups.map((p) => (
                <div
                  key={p.id}
                  className="pointer-events-none absolute z-20 whitespace-nowrap text-lg font-bold"
                  style={{
                    left: p.x,
                    top: p.y,
                    color: p.color,
                    textShadow: `0 0 8px ${p.color}, 0 2px 4px rgba(0,0,0,0.5)`,
                    animation: 'popupFloat 0.9s cubic-bezier(0.22,1,0.36,1) forwards',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {p.text}
                </div>
              ))}

              {/* Orbs arranged in 2 rows of 3 */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-3 p-2 sm:gap-5 sm:p-4">
                {ORBS.map((orb) => (
                  <OrbButton
                    key={orb.id}
                    orb={orb}
                    lit={litOrb === orb.id}
                    interactive={phase === 'input'}
                    onPress={() => handleOrbPress(orb.id)}
                  />
                ))}
              </div>

              {/* Center reaction display */}
              {phase === 'input' && reactionMs !== null && (
                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                  <div className="text-xs uppercase tracking-widest text-white/40">reaction</div>
                  <div className="tabular-nums text-lg font-bold text-white/70">{Math.round(reactionMs)}ms</div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom help */}
          <div className="mt-2 flex flex-col items-center gap-1 text-center text-[10px] uppercase tracking-widest text-white/30">
            <div>Keys: Q W E / A S D · Space start · Esc pause · M mute</div>
            <div className="text-white/20">jeric.site</div>
          </div>
        </div>
      </ShakeWrap>

      {/* Flash overlay */}
      {flash && (
        <div
          key={flash.key}
          className="pointer-events-none absolute inset-0 z-30"
          style={{
            background: flash.color,
            opacity: 0.35,
            animation: 'flashFade 0.25s ease-out forwards',
          }}
        />
      )}

      {/* Start screen */}
      {phase === 'start' && (
        <Overlay>
          <div className="fade-in-up mx-auto max-w-lg px-6 text-center">
            <div className="float-y mb-6 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 shadow-2xl shadow-fuchsia-500/40">
              <svg viewBox="0 0 24 24" className="h-10 w-10 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a5 5 0 0 0-5 5v1a5 5 0 0 0-3 4.6V15a4 4 0 0 0 4 4h.5" />
                <path d="M12 2a5 5 0 0 1 5 5v1a5 5 0 0 1 3 4.6V15a4 4 0 0 1-4 4h-.5" />
                <path d="M12 2v20" />
                <path d="M8 19v1a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1" />
              </svg>
            </div>
            <h1 className="shimmer-text mb-2 text-5xl font-black tracking-tight sm:text-6xl">MIND MELD</h1>
            <p className="mx-auto max-w-md text-base text-white/60">
              Watch the sequence. Repeat it. Faster clicks and longer chains multiply your score.
            </p>

            <button
              onClick={startGame}
              className="group mt-8 inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-fuchsia-500/30 transition hover:scale-105 hover:shadow-fuchsia-500/50 active:scale-100"
            >
              <span>▶</span> Start
              <span className="ml-2 hidden text-xs font-medium text-white/70 sm:inline">SPACE</span>
            </button>

            {showTip && (
              <div className="fade-in-up mt-8 grid grid-cols-3 gap-2 text-xs text-white/50">
                <Tip label="Show" desc="pattern lights up" />
                <Tip label="Repeat" desc="click or key press" />
                <Tip label="Score" desc="speed + combos" />
              </div>
            )}

            {scores.length > 0 && (
              <div className="fade-in-up mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="mb-2 text-xs font-medium uppercase tracking-widest text-white/50">
                  Top Scores
                </div>
                <ScoreTable scores={scores.slice(0, 5)} />
              </div>
            )}
          </div>
        </Overlay>
      )}

      {/* Pause */}
      {phase === 'paused' && (
        <Overlay>
          <div className="pop-in mx-auto max-w-sm px-6 text-center">
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-white/50">Paused</div>
            <h2 className="mb-6 text-4xl font-black text-white">Take a breath</h2>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  playClick();
                  scheduleShow(sequence, round);
                }}
                className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3 font-bold text-white shadow-lg shadow-fuchsia-500/30 transition hover:scale-105"
              >
                Resume
              </button>
              <button
                onClick={() => {
                  playClick();
                  clearTimeouts();
                  setPhase('start');
                  setScore(0);
                  setRound(0);
                  setCombo(0);
                  setSequence([]);
                }}
                className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-medium text-white/80 transition hover:bg-white/10"
              >
                Quit to Menu
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Game over */}
      {phase === 'gameover' && (
        <Overlay>
          <div className="pop-in mx-auto max-w-md px-6 text-center">
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-white/50">
              {isNewHighScore(score) && score > 0 ? '⭐ New Best!' : 'Game Over'}
            </div>
            <h2 className="mb-2 text-5xl font-black text-white sm:text-6xl">
              <span className="tabular-nums">{score.toLocaleString()}</span>
            </h2>
            <div className="mb-6 text-sm text-white/60">
              Round <span className="font-bold text-white">{round}</span> · {sequence.length} steps
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={startGame}
                className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3 font-bold text-white shadow-lg shadow-fuchsia-500/30 transition hover:scale-105"
                autoFocus
              >
                ↻ Play Again <span className="ml-1 text-xs font-medium text-white/70">SPACE</span>
              </button>
              <button
                onClick={() => {
                  playClick();
                  setPhase('start');
                  setScore(0);
                  setRound(0);
                  setCombo(0);
                  setSequence([]);
                }}
                className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-medium text-white/80 transition hover:bg-white/10"
              >
                Main Menu
              </button>
            </div>

            {scores.length > 0 && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="mb-2 text-xs font-medium uppercase tracking-widest text-white/50">
                  High Scores
                </div>
                <ScoreTable scores={scores} highlight={score} />
              </div>
            )}
          </div>
        </Overlay>
      )}

      <style>{`
        @keyframes popupFloat {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
          20% { opacity: 1; transform: translate(-50%, -80%) scale(1.1); }
          100% { opacity: 0; transform: translate(-50%, -160%) scale(1); }
        }
        @keyframes flashFade {
          0% { opacity: 0.5; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function Tip({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-white/80">{label}</div>
      <div className="mt-0.5 text-[10px] text-white/50">{desc}</div>
    </div>
  );
}

function ScoreTable({ scores, highlight }: { scores: HighScore[]; highlight?: number }) {
  return (
    <div className="space-y-1">
      {scores.map((s, i) => {
        const isHi = highlight !== undefined && s.score === highlight && Math.abs(Date.now() - s.date) < 5000;
        return (
          <div
            key={`${s.date}-${i}`}
            className={
              'flex items-center justify-between rounded-lg px-3 py-1.5 text-sm tabular-nums transition ' +
              (isHi ? 'bg-fuchsia-500/20 text-white' : 'text-white/70')
            }
          >
            <div className="flex items-center gap-3">
              <span className="w-4 text-xs text-white/40">{i + 1}</span>
              <span className="font-bold">{s.score.toLocaleString()}</span>
            </div>
            <div className="text-xs text-white/50">R{s.round}</div>
          </div>
        );
      })}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-md">
      {children}
    </div>
  );
}

function OrbButton({
  orb,
  lit,
  interactive,
  onPress,
}: {
  orb: Orb;
  lit: boolean;
  interactive: boolean;
  onPress: () => void;
}) {
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    onPress();
  };

  return (
    <button
      data-orb={orb.id}
      type="button"
      onPointerDown={handlePointerDown}
      disabled={!interactive}
      className="group relative flex touch-none items-center justify-center rounded-3xl transition-transform duration-100 will-change-transform focus:outline-none"
      style={{
        transform: lit ? 'scale(1.06)' : undefined,
      }}
    >
      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-3xl transition-opacity duration-150"
        style={{
          background: `radial-gradient(circle at center, ${orb.glow}66 0%, transparent 70%)`,
          opacity: lit ? 1 : 0.35,
          filter: 'blur(12px)',
        }}
      />
      {/* Orb body */}
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-3xl border transition-all duration-100"
        style={{
          background: lit
            ? `radial-gradient(circle at 30% 30%, ${orb.color}, ${orb.glow})`
            : `radial-gradient(circle at 30% 30%, ${orb.color}55, ${orb.glow}22)`,
          borderColor: lit ? orb.color : `${orb.glow}55`,
          boxShadow: lit
            ? `0 0 40px ${orb.color}, inset 0 0 30px ${orb.color}88, 0 0 80px ${orb.glow}88`
            : `inset 0 0 20px ${orb.glow}22, 0 4px 24px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Highlight */}
        <div
          className="absolute left-[15%] top-[10%] h-[35%] w-[35%] rounded-full bg-white/40 blur-md transition-opacity"
          style={{ opacity: lit ? 0.8 : 0.3 }}
        />
        {/* Key hint */}
        <span
          className="relative select-none text-2xl font-black text-white/90 transition-opacity sm:text-3xl"
          style={{
            opacity: lit ? 0 : 0.7,
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          {orb.label}
        </span>
      </div>
    </button>
  );
}

function ShakeWrap({
  children,
  shakeKey,
  intensity,
}: {
  children: React.ReactNode;
  shakeKey: number;
  intensity: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current || !shakeKey) return;
    const el = ref.current;
    const dur = 350;
    const start = performance.now();
    let raf = 0;
    const step = () => {
      const t = performance.now() - start;
      const p = Math.min(1, t / dur);
      const decay = 1 - p;
      const x = (Math.random() * 2 - 1) * intensity * decay;
      const y = (Math.random() * 2 - 1) * intensity * decay;
      const r = (Math.random() * 2 - 1) * (intensity * 0.15) * decay;
      el.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg)`;
      if (p < 1) raf = requestAnimationFrame(step);
      else el.style.transform = '';
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [shakeKey, intensity]);
  return (
    <div ref={ref} className="h-full w-full will-change-transform">
      {children}
    </div>
  );
}
