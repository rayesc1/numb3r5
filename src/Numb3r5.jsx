import { useState, useRef } from "react";

// ── Main puzzle (2 ops, 3 pairs) ──
const PUZZLE = {
  number: 2,
  difficulty: "Hard",
  date: "3/7/2026",
  pairs: [
    { input: 2, output: 5 },
    { input: 5, output: 17 },
    { input: 7, output: 25 },
  ],
  solution: { op1: "×", num1: 4, op2: "−", num2: 3 },
};

// ── Extra Challenge puzzle (3 ops, 4 pairs) ──
const LUCKY_PUZZLE = {
  pairs: [
    { input: 2, output: 9 },
    { input: 4, output: 13 },
    { input: 6, output: 17 },
    { input: 8, output: 21 },
  ],
  solution: { op1: "+", num1: 3, op2: "×", num2: 2, op3: "−", num3: 1 },
};

const PAIR_SCORES = { 1: 500, 2: 300, 3: 100 };
const LUCKY_SCORES = { 1: 1000, 2: 800, 3: 500, 4: 300 };
const OPERATORS = ["+", "−", "×", "÷"];

// ── Formula engines ──
function applyFormula2(input, op1, num1, op2, num2) {
  let mid;
  if (op1 === "+") mid = input + num1;
  else if (op1 === "−") mid = input - num1;
  else if (op1 === "×") mid = input * num1;
  else if (op1 === "÷") mid = input / num1;
  if (op2 === "+") return mid + num2;
  if (op2 === "−") return mid - num2;
  if (op2 === "×") return mid * num2;
  if (op2 === "÷") return mid / num2;
}

function applyFormula3(input, op1, num1, op2, num2, op3, num3) {
  let v = applyFormula2(input, op1, num1, op2, num2);
  if (op3 === "+") return v + num3;
  if (op3 === "−") return v - num3;
  if (op3 === "×") return v * num3;
  if (op3 === "÷") return v / num3;
}

function checkMainSatisfies(op1, num1, op2, num2) {
  return PUZZLE.pairs.every(
    (p) => applyFormula2(p.input, op1, num1, op2, num2) === p.output
  );
}

function checkLuckySatisfies(op1, num1, op2, num2, op3, num3) {
  return LUCKY_PUZZLE.pairs.every(
    (p) => applyFormula3(p.input, op1, num1, op2, num2, op3, num3) === p.output
  );
}

function invalidReason2(op1, num1, op2, num2) {
  if (num1 === 0 || num2 === 0) return "Zero isn't a valid constant.";
  if ((op1 === "×" || op1 === "÷") && num1 === 1) return "× or ÷ by 1 doesn't change anything — try a different number.";
  if ((op2 === "×" || op2 === "÷") && num2 === 1) return "× or ÷ by 1 doesn't change anything — try a different number.";
  if ((op1 === "+" && op2 === "−" && num1 === num2) || (op1 === "−" && op2 === "+" && num1 === num2)) return "Adding then subtracting the same number cancels out — that's a no-op.";
  if ((op1 === "×" && op2 === "÷" && num1 === num2) || (op1 === "÷" && op2 === "×" && num1 === num2)) return "Multiplying then dividing by the same number cancels out — that's a no-op.";
  return null;
}
function checkPartialSatisfies2(op1, num1, op2, num2, visiblePairs) {
  // True if guess works for all visible pairs but we already know it's not the canonical answer
  return visiblePairs.every((p) => applyFormula2(p.input, op1, num1, op2, num2) === p.output);
}

function checkPartialSatisfies3(op1, num1, op2, num2, op3, num3, visiblePairs) {
  return visiblePairs.every((p) => applyFormula3(p.input, op1, num1, op2, num2, op3, num3) === p.output);
}

function invalidReason3(op1, num1, op2, num2, op3, num3) {
  const r = invalidReason2(op1, num1, op2, num2);
  if (r) return r;
  if (num3 === 0) return "Zero isn't a valid constant.";
  if ((op3 === "×" || op3 === "÷") && num3 === 1) return "× or ÷ by 1 doesn't change anything — try a different number.";
  return null;
}
function fmtNum(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number" && val < 0) return `−${Math.abs(val)}`;
  return `${val}`;
}

// ── Shared Input Panel ──
function InputPanel({
  slots, activeSlot, negative, shake,
  onSelectSlot, onPickOperator, onPickNumber, onToggleNegative, onClear, onSubmit,
  revealedPairs, totalPairs, onRequestClue, slotCount, hintSlots,
}) {
  const opActive = activeSlot === 0 || activeSlot === 2 || (slotCount === 6 && activeSlot === 4);
  const numActive = activeSlot === 1 || activeSlot === 3 || (slotCount === 6 && activeSlot === 5);
  const allFilled = slots.every((s) => s !== null);
  const slotTypes = slotCount === 4
    ? ["op", "num", "op", "num"]
    : ["op", "num", "op", "num", "op", "num"];

  return (
    <div className="input-panel" style={{
      width: "100%",
      maxWidth: 720,
      padding: "24px 32px 40px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 16,
    }}>
      {/* Crack slots */}
      <div style={{ width: "100%" }}>
        <div style={{ fontSize: 11, color: "#888", letterSpacing: 1.5, marginBottom: 8, textTransform: "uppercase" }}>
          Crack the code:
        </div>
        <div className={shake ? "shake" : ""} style={{ display: "flex", gap: 8 }}>
          {slots.map((val, i) => {
            const isHint = hintSlots && hintSlots.includes(i) && val !== null;
            const isActive = activeSlot === i;
            const filled = val !== null;
            const type = slotTypes[i];
            let cls = "crack-slot";
            if (isHint) cls += " hint-slot";
            else if (isActive) cls += " active";
            else if (filled && type === "num") cls += " filled-num";
            else if (filled) cls += " filled-op";
            return (
              <button key={i} className={cls} onClick={() => !isHint && onSelectSlot(i)}
                title={isHint ? "Hint — this one's on us" : ""}>
                {filled ? (type === "op" ? val : fmtNum(val)) : (type === "op" ? "OP" : "NUM")}
              </button>
            );
          })}
        </div>
      </div>

      <div className="input-body" style={{ width: "100%", display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Operator pad + Clear */}
        <div className="op-pad-wrap" style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="op-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {OPERATORS.map((op) => (
              <button key={op} className={`op-key${opActive ? "" : " dim"}`} onClick={() => onPickOperator(op)}>
                {op}
              </button>
            ))}
          </div>
          <button
            className="clear-btn"
            onClick={onClear}
            style={{
              width: "100%", height: 34,
              background: "#2a2a2a", border: "1px solid #444",
              borderRadius: 8, color: "#888",
              fontSize: 11, fontFamily: "'Aldrich', sans-serif",
              letterSpacing: 2, cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.target.style.background = "#383838"; e.target.style.color = "#bbb"; }}
            onMouseLeave={e => { e.target.style.background = "#2a2a2a"; e.target.style.color = "#888"; }}
          >
            CLEAR
          </button>
        </div>

        {/* Number grid + Negative */}
        <div className="num-pad-wrap" style={{ flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[1,2,3,4,5,6,7,8,9].map((n) => (
              <button key={n} className={`num-key${numActive ? "" : " dim"}`} onClick={() => onPickNumber(n)}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 12, color: numActive ? "#bbb" : "#555", transition: "color 0.2s" }}>
              Negative
            </span>
            <div
              onClick={() => { if (numActive) onToggleNegative(); }}
              style={{
                width: 42, height: 22,
                background: negative ? "#4ade80" : "#444",
                border: `1px solid ${negative ? "#4ade80" : "#555"}`,
                borderRadius: 11, position: "relative",
                cursor: numActive ? "pointer" : "default",
                opacity: numActive ? 1 : 0.4,
                transition: "all 0.2s", flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute", top: 3,
                left: negative ? 21 : 3,
                width: 14, height: 14,
                background: negative ? "#111" : "#999",
                borderRadius: "50%", transition: "left 0.18s",
              }} />
            </div>
          </div>
          {/* Mobile-only CLEAR button */}
          <button
            className="mobile-clear-btn"
            onClick={onClear}
            style={{
              display: "none",
              width: "100%", height: 34, marginTop: 10,
              background: "#2a2a2a", border: "1px solid #444",
              borderRadius: 8, color: "#888",
              fontSize: 11, fontFamily: "'Aldrich', sans-serif",
              letterSpacing: 2, cursor: "pointer", transition: "all 0.15s",
            }}
          >
            CLEAR
          </button>
        </div>

        {/* Clues panel */}
        <div className="clues-panel-wrap" style={{ flexShrink: 0, width: 152, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {slotCount !== 6 && <div className="clues-label" style={{ fontSize: 11, color: "#888", letterSpacing: 1.5, textTransform: "uppercase" }}>Clues</div>}
          <div className="clues-inner" style={{
            background: "#242424", border: "1px solid #3a3a3a",
            borderRadius: 10, padding: "10px", width: "100%",
            display: "flex", flexDirection: "column", gap: 7,
          }}>
            {Array.from({ length: totalPairs }).map((_, i) => {
              const used = i < revealedPairs;
              const isCurrent = i === revealedPairs - 1;
              const isNext = i === revealedPairs;
              return (
                <div
                  key={i}
                  onClick={() => { if (isNext) onRequestClue(); }}
                  style={{
                    width: "100%", height: 34, borderRadius: 6,
                    background: isCurrent ? "#2a3a2a" : used ? "#2e2e2e" : isNext ? "#2a2a2a" : "#222",
                    border: `1px solid ${isCurrent ? "#4ade8077" : used ? "#3a3a3a" : isNext ? "#4a4a4a" : "#2e2e2e"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11,
                    color: isCurrent ? "#4ade80" : used ? "#666" : isNext ? "#aaa" : "#444",
                    letterSpacing: 1, cursor: isNext ? "pointer" : "default", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { if (isNext) { e.currentTarget.style.background = "#363636"; e.currentTarget.style.color = "#ddd"; e.currentTarget.style.borderColor = "#4ade8055"; }}}
                  onMouseLeave={e => { if (isNext) { e.currentTarget.style.background = "#2a2a2a"; e.currentTarget.style.color = "#aaa"; e.currentTarget.style.borderColor = "#4a4a4a"; }}}
                >
                  {isCurrent ? `Clue ${i + 1}` : used ? `✓ Clue ${i + 1}` : isNext ? `+ Clue ${i + 1}` : `Clue ${i + 1}`}
                </div>
              );
            })}
          </div>
          <div className="clues-remaining" style={{ fontSize: 11, textAlign: "center", letterSpacing: 0.5, color: revealedPairs === totalPairs ? "#f87171" : "#666" }}>
            {revealedPairs === totalPairs ? "Last chance!" : `${totalPairs - revealedPairs} clue${totalPairs - revealedPairs !== 1 ? "s" : ""} remaining`}
          </div>
        </div>
      </div>

      <button className="submit-btn" onClick={onSubmit} disabled={!allFilled}>
        submit
      </button>
    </div>
  );
}

// ── Puzzle Zone (top-level to avoid remount flash) ──
function PuzzleZone({ visiblePairs, currentSlots, currentActive, wrongFlash, pairsLabel, isPlaying, attempts: att, slotCount, initialPairCount }) {
  const slotTypes = slotCount === 4
    ? ["op", "num", "op", "num"]
    : ["op", "num", "op", "num", "op", "num"];
  return (
    <div
      className={wrongFlash ? "wrong-flash" : ""}
      style={{ width: "100%", background: "#585858", marginTop: 24, padding: "30px 32px", display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <div style={{ fontSize: 11, color: "#ddd", letterSpacing: 2, textTransform: "uppercase", marginBottom: 20 }}>
        {isPlaying ? pairsLabel : ""}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, width: "100%" }}>
        {visiblePairs.map((pair, i) => {
          const isLatest = i === visiblePairs.length - 1;
          const isNew = i >= initialPairCount;
          return (
            <div key={i} className={isLatest && isNew ? "pair-row" : ""} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "clamp(22px, 3.2vw, 32px)" }}>
              <span style={{ color: "#e8e8e8", minWidth: 24, textAlign: "right" }}>{pair.input}</span>
              {isPlaying ? (
                Array.from({ length: slotCount }).map((_, si) => {
                  const val = currentSlots[si];
                  const isOp = si % 2 === 0;
                  const isActive = isLatest && currentActive === si;
                  const filled = val !== null;
                  return (
                    <span key={si} className="puzzle-slot" style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 32, height: 32, borderRadius: 5,
                      border: `1.5px solid ${isActive ? "#4ade80" : filled ? "#666" : "#555"}`,
                      background: filled ? "#4a4a4a" : "#3a3a3a",
                      color: filled ? (isOp ? "#e8e8e8" : "#4ade80") : (isActive ? "#4ade80" : "#888"),
                      fontSize: filled ? 15 : 11, transition: "all 0.15s", flexShrink: 0,
                    }}>
                      {filled ? (isOp ? val : fmtNum(val)) : (isOp ? "□" : "?")}
                    </span>
                  );
                })
              ) : (
                Array.from({ length: slotCount }).map((_, si) => (
                  <span key={si} style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 32, height: 32, borderRadius: 5,
                    border: "1.5px solid #555", background: "#3a3a3a", color: "#777", fontSize: 11,
                  }}>
                    {si % 2 === 0 ? "□" : "?"}
                  </span>
                ))
              )}
              <span style={{ color: "#ccc", margin: "0 4px" }}>=</span>
              <span style={{ color: "#e8e8e8" }}>{pair.output}</span>
            </div>
          );
        })}
      </div>
      {att.length > 0 && isPlaying && (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {att.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#f87171cc", letterSpacing: 1 }}>
              <span style={{ width: 11, height: 11, background: "#f8717155", border: "1px solid #f87171aa", borderRadius: 2, flexShrink: 0, display: "inline-block" }} />
              {a.guess.map((v, gi) => gi % 2 === 0 ? v : fmtNum(v)).join(" ")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STORAGE_KEY = `numb3r5_v5_puzzle${PUZZLE.number}`;
const _saved = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
})();
function savedOr(key, fallback) {
  return _saved && _saved[key] !== undefined ? _saved[key] : fallback;
}

// ── Main component ──
export default function Numb3r5() {
  // Main game state
  const [slots, setSlots] = useState(() => savedOr("slots", [null, null, null, null]));
  const [activeSlot, setActiveSlot] = useState(() => savedOr("activeSlot", 0));
  const [negative, setNegative] = useState(false);
  const [revealedPairs, setRevealedPairs] = useState(() => savedOr("revealedPairs", 1));
  const [attempts, setAttempts] = useState(() => savedOr("attempts", []));
  const [gameState, setGameState] = useState(() => savedOr("gameState", "playing"));
  const [shake, setShake] = useState(false);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [finalScore, setFinalScore] = useState(() => savedOr("finalScore", null));
  const [confirmClue, setConfirmClue] = useState(false);

  // Extra Challenge state
  const [luckyOpen, setLuckyOpen] = useState(() => savedOr("luckyOpen", false));
  const [luckySlots, setLuckySlots] = useState(() => savedOr("luckySlots", [null, null, null, null, null, null]));
  const [luckyActive, setLuckyActive] = useState(() => savedOr("luckyActive", 0));
  const [luckyNeg, setLuckyNeg] = useState(false);
  const [luckyRevealed, setLuckyRevealed] = useState(() => savedOr("luckyRevealed", 1));
  const [luckyAttempts, setLuckyAttempts] = useState(() => savedOr("luckyAttempts", []));
  const [luckyState, setLuckyState] = useState(() => savedOr("luckyState", "playing"));
  const [luckyShake, setLuckyShake] = useState(false);
  const [luckyWrongFlash, setLuckyWrongFlash] = useState(false);
  const [luckyScore, setLuckyScore] = useState(() => savedOr("luckyScore", null));
  const [luckyConfirmClue, setLuckyConfirmClue] = useState(false);

  const [flashMsg, setFlashMsg] = useState("");
  const [showInstructions, setShowInstructions] = useState(() => !_saved); // auto-show for first-timers

  // Track how many pairs were visible on mount — suppresses slide-in animation on restored pairs
  const initMainPairs = useRef(savedOr("revealedPairs", 1));
  const initLuckyPairs = useRef(savedOr("luckyRevealed", 1));

  // Persist all meaningful state on every render
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      slots, activeSlot, revealedPairs, attempts, gameState, finalScore,
      luckyOpen, luckySlots, luckyActive, luckyRevealed, luckyAttempts, luckyState, luckyScore,
    }));
  } catch { /* quota/blocked — fail silently */ }

  const localDate = new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });

  function flash(msg) {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(""), 2800);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => flash("Result copied to clipboard!")).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
    document.body.appendChild(el);
    el.focus(); el.select();
    try {
      document.execCommand("copy");
      flash("Result copied to clipboard!");
    } catch {
      flash("Couldn't copy — try selecting manually.");
    }
    document.body.removeChild(el);
  }

  // ── Main game handlers ──
  function mainSelectSlot(i) { setActiveSlot(i); setNegative(false); }

  function mainPickOp(op) {
    const isOpSlot = activeSlot === 0 || activeSlot === 2;
    if (!isOpSlot) return;
    const next = [...slots]; next[activeSlot] = op;
    setSlots(next);
    setActiveSlot(activeSlot === 0 ? 1 : 3);
    setNegative(false);
  }

  function mainPickNum(n) {
    const isNumSlot = activeSlot === 1 || activeSlot === 3;
    if (!isNumSlot) return;
    const val = negative ? -n : n;
    const next = [...slots]; next[activeSlot] = val;
    setSlots(next); setNegative(false);
    setActiveSlot(activeSlot === 1 ? 2 : null);
  }

  function mainClear() { setSlots([null, null, null, null]); setActiveSlot(0); setNegative(false); }

  function mainSubmit() {
    const [op1, num1, op2, num2] = slots;
    const reason = invalidReason2(op1, num1, op2, num2);
    if (reason) {
      setShake(true); setTimeout(() => setShake(false), 500);
      flash(reason); return;
    }
    if (checkMainSatisfies(op1, num1, op2, num2)) {
      const score = PAIR_SCORES[revealedPairs] ?? 100;
      setFinalScore(score);
      setAttempts(prev => [...prev, { guess: [...slots], result: "correct" }]);
      setGameState("won");
    } else {
      setWrongFlash(true); setTimeout(() => setWrongFlash(false), 650);
      setAttempts(prev => [...prev, { guess: [...slots], result: "wrong" }]);
      setSlots([null, null, null, null]); setActiveSlot(0);
      const partial = checkPartialSatisfies2(op1, num1, op2, num2, PUZZLE.pairs.slice(0, revealedPairs));
      if (revealedPairs < PUZZLE.pairs.length) {
        setRevealedPairs(p => p + 1);
        flash(partial ? "That's technically right...but it's not the answer we're looking for." : "Not quite. Here's another clue...");
      } else {
        if (partial) flash("That's technically right...but it's not the answer we're looking for.");
        setGameState("lost");
      }
    }
  }

  function mainRequestClue() { if (revealedPairs < PUZZLE.pairs.length) setConfirmClue(true); }
  function mainConfirmClue() {
    setConfirmClue(false);
    setRevealedPairs(p => p + 1);
    setSlots([null, null, null, null]); setActiveSlot(0); setNegative(false);
  }

  // ── Extra Challenge handlers ──
  function luckySelectSlot(i) {
    // Don't allow selecting pre-filled hint slots
    if (luckyRevealed >= 3 && (i === 0 || i === 2 || i === 3)) return;
    setLuckyActive(i); setLuckyNeg(false);
  }

  function luckyPickOp(op) {
    const isOpSlot = luckyActive === 0 || luckyActive === 2 || luckyActive === 4;
    if (!isOpSlot) return;
    const next = [...luckySlots]; next[luckyActive] = op;
    setLuckySlots(next); setLuckyNeg(false);
    setLuckyActive(luckyActive === 0 ? 1 : luckyActive === 2 ? 3 : 5);
  }

  function luckyPickNum(n) {
    const isNumSlot = luckyActive === 1 || luckyActive === 3 || luckyActive === 5;
    if (!isNumSlot) return;
    const val = luckyNeg ? -n : n;
    const next = [...luckySlots]; next[luckyActive] = val;
    setLuckySlots(next); setLuckyNeg(false);
    // Skip slots 2+3 if they're pre-filled (Clue 3 hint)
    if (luckyActive === 1) setLuckyActive(next[2] !== null ? 4 : 2);
    else if (luckyActive === 3) setLuckyActive(4);
    else setLuckyActive(null);
  }

  function luckyClear() {
    const base = luckyRevealed >= 3
      ? [LUCKY_PUZZLE.solution.op1, null, LUCKY_PUZZLE.solution.op2, LUCKY_PUZZLE.solution.num2, null, null]
      : [null, null, null, null, null, null];
    setLuckySlots(base); setLuckyActive(luckyRevealed >= 3 ? 1 : 0); setLuckyNeg(false);
  }

  function luckySubmit() {
    const [op1, num1, op2, num2, op3, num3] = luckySlots;
    const reason = invalidReason3(op1, num1, op2, num2, op3, num3);
    if (reason) {
      setLuckyShake(true); setTimeout(() => setLuckyShake(false), 500);
      flash(reason); return;
    }
    if (checkLuckySatisfies(op1, num1, op2, num2, op3, num3)) {
      const score = LUCKY_SCORES[luckyRevealed] ?? 100;
      setLuckyScore(score);
      setLuckyAttempts(prev => [...prev, { guess: [...luckySlots], result: "correct" }]);
      setLuckyState("won");
    } else {
      setLuckyWrongFlash(true); setTimeout(() => setLuckyWrongFlash(false), 650);
      setLuckyAttempts(prev => [...prev, { guess: [...luckySlots], result: "wrong" }]);
      const nextReveal = luckyRevealed + 1;
      const newSlots = nextReveal >= 3
        ? [LUCKY_PUZZLE.solution.op1, null, LUCKY_PUZZLE.solution.op2, LUCKY_PUZZLE.solution.num2, null, null]
        : [null, null, null, null, null, null];
      setLuckySlots(newSlots); setLuckyActive(nextReveal >= 3 ? 1 : 0);
      const partial = checkPartialSatisfies3(op1, num1, op2, num2, op3, num3, LUCKY_PUZZLE.pairs.slice(0, luckyRevealed));
      if (luckyRevealed < LUCKY_PUZZLE.pairs.length) {
        setLuckyRevealed(p => p + 1);
        flash(partial ? "That's technically right...but it's not the answer we're looking for." : "Not quite. Here's another clue...");
      } else {
        if (partial) flash("That's technically right...but it's not the answer we're looking for.");
        setLuckyState("lost");
      }
    }
  }

  function luckyRequestClue() { if (luckyRevealed < LUCKY_PUZZLE.pairs.length) setLuckyConfirmClue(true); }
  function applyLuckyClue() {
    setLuckyConfirmClue(false);
    const next = luckyRevealed + 1;
    const newSlots = next >= 3
      ? [LUCKY_PUZZLE.solution.op1, null, LUCKY_PUZZLE.solution.op2, LUCKY_PUZZLE.solution.num2, null, null]
      : [null, null, null, null, null, null];
    setLuckySlots(newSlots);
    setLuckyRevealed(next);
    setLuckyActive(next >= 3 ? 1 : 0);
    setLuckyNeg(false);
  }

  const mainVisiblePairs = PUZZLE.pairs.slice(0, revealedPairs);
  const luckyVisiblePairs = LUCKY_PUZZLE.pairs.slice(0, luckyRevealed);
  const mainPairsLabel = revealedPairs === 1 ? "Clue 1 of 3" : revealedPairs === 2 ? "Clue 2 of 3" : "Final Clue";
  const luckyPairsLabel = luckyRevealed === 1 ? "Clue 1 of 4" : luckyRevealed === 2 ? "Clue 2 of 4" : luckyRevealed === 3 ? "Clue 3 of 4" : "Final Clue";

  const threeColor = revealedPairs === 1 ? "#4ade80" : revealedPairs === 2 ? "#a3f0c0" : "#f87171";
  const fourColor = luckyRevealed === 1 ? "#4ade80" : luckyRevealed === 2 ? "#b8f5cc" : luckyRevealed === 3 ? "#a3f0c0" : "#f87171";


  return (
    <div style={{ minHeight: "100vh", background: "#1a1a1a", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "'Aldrich', sans-serif", color: "#e8e8e8", userSelect: "none" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Aldrich&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #1a1a1a; }

        .op-key {
          width: 64px; height: 64px;
          background: #3d3d3d; border: 1px solid #585858; border-radius: 8px;
          color: #e8e8e8; font-size: 26px; font-family: 'Aldrich', sans-serif;
          cursor: pointer; transition: all 0.12s;
          display: flex; align-items: center; justify-content: center;
        }
        .op-key.dim { background: #262626; border-color: #333; color: #555; cursor: default; }
        .op-key:not(.dim):hover { background: #4a4a4a; transform: scale(1.06); }
        .op-key:not(.dim):active { transform: scale(0.94); }

        .num-key {
          height: 52px; background: #3d3d3d; border: 1px solid #585858; border-radius: 8px;
          color: #e8e8e8; font-size: 18px; font-family: 'Aldrich', sans-serif;
          cursor: pointer; transition: all 0.12s;
          display: flex; align-items: center; justify-content: center;
        }
        .num-key.dim { background: #262626; border-color: #333; color: #555; cursor: default; }
        .num-key:not(.dim):hover { background: #4a4a4a; transform: scale(1.06); }
        .num-key:not(.dim):active { transform: scale(0.94); }

        .crack-slot {
          flex: 1; height: 56px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Aldrich', sans-serif; font-size: 18px;
          cursor: pointer; transition: all 0.15s;
          background: #2e2e2e; border: 2px solid #4a4a4a; color: #666; letter-spacing: 1px;
        }
        .crack-slot:hover { border-color: #666; }
        .crack-slot.active { border-color: #4ade80; background: #1e2e1e; color: #e8e8e8; box-shadow: 0 0 0 1px #4ade8022; }
        .crack-slot.filled-op { border-color: #585858; background: #3d3d3d; color: #e8e8e8; }
        .crack-slot.filled-num { border-color: #585858; background: #3d3d3d; color: #4ade80; }
        .crack-slot.hint-slot { border-color: #4ade8055; background: #1a2e1a; color: #4ade80; cursor: default; letter-spacing: 1px; }

        .submit-btn {
          width: 100%; height: 54px; border-radius: 8px;
          font-family: 'Aldrich', sans-serif; font-size: 15px; letter-spacing: 4px;
          cursor: pointer; transition: all 0.15s;
          background: #3a3a3a; border: 1px solid #555; color: #e8e8e8;
        }
        .submit-btn:disabled { background: #242424; border-color: #333; color: #444; cursor: not-allowed; }
        .submit-btn:not(:disabled):hover { background: #484848; }
        .submit-btn:not(:disabled):active { transform: scale(0.99); }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .instructions-overlay {
          animation: fadeIn 0.2s ease;
        }
        .instructions-card {
          animation: slideUp 0.25s ease;
        }
        @keyframes shake {
          0%,100%{ transform: translateX(0); }
          20%{ transform: translateX(-8px); }
          40%{ transform: translateX(8px); }
          60%{ transform: translateX(-5px); }
          80%{ transform: translateX(5px); }
        }
        @keyframes wrongPulse {
          0%{ background-color: #585858; }
          40%{ background-color: #4a1010; }
          100%{ background-color: #585858; }
        }
        @keyframes slideIn {
          from{ opacity: 0; transform: translateY(10px); }
          to{ opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeDown {
          from{ opacity:0; transform: translateX(-50%) translateY(-10px); }
          to{ opacity:1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes blink {
          0%, 100% { color: #4ade80; text-shadow: 0 0 10px #4ade8099; }
          50% { color: #4ade8033; text-shadow: none; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 #4ade8044; }
          50% { box-shadow: 0 0 12px 4px #4ade8033; }
        }

        .shake { animation: shake 0.45s ease; }
        .wrong-flash { animation: wrongPulse 0.65s ease forwards !important; }
        .pair-row { animation: slideIn 0.35s ease; }
        .five-blink { animation: blink 1.1s ease-in-out infinite; cursor: pointer; }
        .cta-pulse { animation: pulseGlow 1.8s ease-in-out infinite; }

        .flash-toast {
          position: fixed; top: 20px; left: 50%;
          transform: translateX(-50%);
          background: #2a2a2a; border: 1px solid #4ade80; color: #4ade80;
          padding: 10px 26px; border-radius: 8px; font-size: 13px;
          font-family: 'Aldrich', sans-serif; z-index: 999;
          white-space: nowrap; pointer-events: none;
          animation: fadeDown 0.25s ease;
        }

        /* ── Mobile layout ── */
        @media (max-width: 560px) {
          .input-panel { padding: 16px 16px 28px !important; }

          .input-body {
            flex-direction: column !important;
          }

          /* Clues: horizontal pill strip */
          .clues-panel-wrap {
            width: 100% !important;
            order: 0;
            flex-direction: row !important;
            align-items: center !important;
            gap: 6px !important;
          }
          .clues-panel-wrap .clues-label { display: none; }
          .clues-panel-wrap .clues-inner {
            flex-direction: row !important;
            gap: 6px !important;
            padding: 8px !important;
            width: 100% !important;
          }
          .clues-panel-wrap .clues-inner > div {
            flex: 1;
            height: 28px !important;
            font-size: 10px !important;
          }
          .clues-panel-wrap .clues-remaining { display: none; }

          /* Number grid: full width, bigger keys */
          .num-pad-wrap {
            order: 1;
            flex: none !important;
            width: 100% !important;
          }
          .num-key { height: 64px !important; font-size: 22px !important; }

          /* Negative toggle: stays under num grid, already centered */

          /* Op pad: single row of 4 */
          .op-pad-wrap {
            order: 2;
            flex-shrink: 0 !important;
            width: 100% !important;
          }
          .op-pad-wrap .op-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
          .op-key { width: 100% !important; height: 56px !important; }
          .op-pad-wrap .clear-btn { display: none !important; }

          /* Submit: already full width */
          .submit-btn { height: 60px !important; font-size: 16px !important; }

          /* Puzzle zone: tighten slot indicators */
          .puzzle-slot {
            width: 26px !important;
            height: 26px !important;
            font-size: 10px !important;
          }

          /* Header ? button position */
          .help-btn { top: 20px !important; right: 16px !important; }

          /* Mobile CLEAR visible, header tighter */
          .mobile-clear-btn { display: block !important; }
          .mobile-header { padding: 20px 16px 0 !important; }
        }
      `}</style>

      {flashMsg && <div className="flash-toast">{flashMsg}</div>}

      {/* ── Instructions overlay ── */}
      {showInstructions && (
        <div
          className="instructions-overlay"
          onClick={() => setShowInstructions(false)}
          style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: "24px" }}
        >
          <div
            className="instructions-card"
            onClick={e => e.stopPropagation()}
            style={{ background: "#222", border: "1px solid #3a3a3a", borderRadius: 14, padding: "32px", maxWidth: 480, width: "100%", display: "flex", flexDirection: "column", gap: 20 }}
          >
            {/* Title */}
            <div style={{ textAlign: "center" }}>
              <span style={{ fontFamily: "'Aldrich', sans-serif", fontSize: 22, letterSpacing: 4, color: "#e8e8e8" }}>
                numb<span style={{ color: "#4ade80" }}>3</span>r<span style={{ color: "#4ade80" }}>5</span>
              </span>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: 2, marginTop: 6, textTransform: "uppercase" }}>How to Play</div>
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid #333" }} />

            {/* Sections */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              <div>
                <div style={{ fontSize: 11, color: "#4ade80", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>The Goal</div>
                <p style={{ fontSize: 13, color: "#bbb", lineHeight: 1.7 }}>
                  A hidden formula is applied to every input to produce its output. Crack the formula before you run out of clues.
                </p>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#4ade80", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>The Formula</div>
                <p style={{ fontSize: 13, color: "#bbb", lineHeight: 1.7 }}>
                  Always two operations, two numbers — in the shape{" "}
                  <span style={{ color: "#e8e8e8", letterSpacing: 1 }}>[OP] [NUM] [OP] [NUM]</span>.
                  Use the pads to fill in your guess, then hit Submit.
                </p>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#f87171", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>⚠ Important</div>
                <p style={{ fontSize: 13, color: "#bbb", lineHeight: 1.7 }}>
                  FORGET EVERYTHING YOU KNOW ABOUT PEMDAS...for now at least.
                  Math evaluates strictly <span style={{ color: "#e8e8e8" }}>left to right</span>.{" "}
                  <span style={{ color: "#e8e8e8" }}>3 + 4 × 2 = 14</span>, not 11.
                </p>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#4ade80", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Clues</div>
                <p style={{ fontSize: 13, color: "#bbb", lineHeight: 1.7 }}>
                  You start with one input/output pair. A wrong answer reveals the next pair automatically — or you can request one voluntarily at the cost of points.
                </p>
                <p style={{ fontSize: 13, color: "#bbb", lineHeight: 1.7, marginTop: 8 }}>
                  There is only <span style={{ color: "#e8e8e8" }}>one correct answer</span>. Multiple formulas may fit the visible pairs — especially early on — but only one cracks the code.
                </p>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#4ade80", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Scoring</div>
                <p style={{ fontSize: 13, color: "#bbb", lineHeight: 1.7 }}>
                  Crack it on Clue 1 for <span style={{ color: "#4ade80" }}>500pts</span>, Clue 2 for <span style={{ color: "#4ade80" }}>300pts</span>, Clue 3 for <span style={{ color: "#4ade80" }}>100pts</span>. Fewer clues = higher score.
                </p>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#4ade80", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Extra Challenge</div>
                <p style={{ fontSize: 13, color: "#bbb", lineHeight: 1.7 }}>
                  Solve the main puzzle to unlock a harder 3-operation formula. Same rules, higher stakes.
                </p>
              </div>

            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid #333" }} />

            {/* Close button */}
            <button
              onClick={() => setShowInstructions(false)}
              style={{
                width: "100%", height: 48, borderRadius: 8,
                background: "#2a3a2a", border: "1px solid #4ade80",
                color: "#4ade80", fontSize: 13, fontFamily: "'Aldrich', sans-serif",
                letterSpacing: 3, cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#334a33"}
              onMouseLeave={e => e.currentTarget.style.background = "#2a3a2a"}
            >
              LET'S GO
            </button>
          </div>
        </div>
      )}

      {/* ── Confirm clue modal (main) ── */}
      {confirmClue && (
        <div style={{ position: "fixed", inset: 0, background: "#000000bb", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}>
          <div style={{ background: "#2a2a2a", border: "1px solid #484848", borderRadius: 12, padding: "28px 32px", textAlign: "center", maxWidth: 320, width: "90%" }}>
            <p style={{ color: "#e8e8e8", fontSize: 15, marginBottom: 8, letterSpacing: 0.5 }}>Are you sure you want to use a clue?</p>
            <p style={{ color: "#888", fontSize: 12, marginBottom: 24 }}>This will reveal the next pair and reduce your score.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmClue(false)} style={{ flex: 1, height: 44, background: "#3a3a3a", border: "1px solid #555", borderRadius: 8, color: "#e8e8e8", fontSize: 14, fontFamily: "'Aldrich', sans-serif", letterSpacing: 2, cursor: "pointer" }}
                onMouseEnter={e => e.target.style.background = "#484848"} onMouseLeave={e => e.target.style.background = "#3a3a3a"}>No</button>
              <button onClick={mainConfirmClue} style={{ flex: 1, height: 44, background: "#1a2e1a", border: "1px solid #4ade80", borderRadius: 8, color: "#4ade80", fontSize: 14, fontFamily: "'Aldrich', sans-serif", letterSpacing: 2, cursor: "pointer" }}
                onMouseEnter={e => e.target.style.background = "#223a22"} onMouseLeave={e => e.target.style.background = "#1a2e1a"}>Yes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm clue modal (lucky) ── */}
      {luckyConfirmClue && (
        <div style={{ position: "fixed", inset: 0, background: "#000000bb", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}>
          <div style={{ background: "#2a2a2a", border: "1px solid #484848", borderRadius: 12, padding: "28px 32px", textAlign: "center", maxWidth: 320, width: "90%" }}>
            <p style={{ color: "#e8e8e8", fontSize: 15, marginBottom: 8, letterSpacing: 0.5 }}>Are you sure you want to use a clue?</p>
            <p style={{ color: "#888", fontSize: 12, marginBottom: 24 }}>This will reveal the next pair and reduce your score.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setLuckyConfirmClue(false)} style={{ flex: 1, height: 44, background: "#3a3a3a", border: "1px solid #555", borderRadius: 8, color: "#e8e8e8", fontSize: 14, fontFamily: "'Aldrich', sans-serif", letterSpacing: 2, cursor: "pointer" }}
                onMouseEnter={e => e.target.style.background = "#484848"} onMouseLeave={e => e.target.style.background = "#3a3a3a"}>No</button>
              <button onClick={applyLuckyClue} style={{ flex: 1, height: 44, background: "#1a2e1a", border: "1px solid #4ade80", borderRadius: 8, color: "#4ade80", fontSize: 14, fontFamily: "'Aldrich', sans-serif", letterSpacing: 2, cursor: "pointer" }}
                onMouseEnter={e => e.target.style.background = "#223a22"} onMouseLeave={e => e.target.style.background = "#1a2e1a"}>Yes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="mobile-header" style={{ width: "100%", maxWidth: 720, padding: "32px 32px 0", textAlign: "center", position: "relative" }}>
        {/* ? button */}
        <button
          className="help-btn"
          onClick={() => setShowInstructions(true)}
          style={{
            position: "absolute", top: 32, right: 32,
            width: 28, height: 28, borderRadius: "50%",
            background: "#2a2a2a", border: "1px solid #484848",
            color: "#888", fontSize: 13, fontFamily: "'Aldrich', sans-serif",
            cursor: "pointer", transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#4ade80"; e.currentTarget.style.color = "#4ade80"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#484848"; e.currentTarget.style.color = "#888"; }}
        >?</button>
        <h1 style={{ fontFamily: "'Aldrich', sans-serif", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 400, letterSpacing: "5px", color: "#e8e8e8", lineHeight: 1 }}>
          numb
          {luckyOpen ? (
            <span style={{ color: fourColor, transition: "color 0.4s" }}>
              {4 - (luckyRevealed - 1)}
            </span>
          ) : (
            <span style={{ color: threeColor, transition: "color 0.4s" }}>
              {3 - (revealedPairs - 1)}
            </span>
          )}
          r
          <span
            className={gameState === "won" && !luckyOpen ? "five-blink" : ""}
            onClick={() => { if (gameState === "won" && !luckyOpen) setLuckyOpen(true); }}
            style={{ color: "#4ade80", cursor: gameState === "won" && !luckyOpen ? "pointer" : "default" }}
          >
            5
          </span>
        </h1>

        {/* CTA — only after main win, before extra challenge opens */}
        {gameState === "won" && !luckyOpen && (
          <div
            className="cta-pulse"
            onClick={() => setLuckyOpen(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              marginTop: 12, padding: "7px 18px",
              background: "#1a2e1a", border: "1px solid #4ade8077",
              borderRadius: 20, cursor: "pointer", transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#223a22"; e.currentTarget.style.borderColor = "#4ade80"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#1a2e1a"; e.currentTarget.style.borderColor = "#4ade8077"; }}
          >
            <span style={{ color: "#4ade80", fontSize: 12, letterSpacing: 1.5 }}>Up for an extra challenge?</span>
            <span style={{ color: "#4ade80", fontSize: 16 }}>→</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 10, fontSize: 13, color: "#888" }}>
          {luckyOpen ? (
            <span style={{ color: "#4ade80", letterSpacing: 1 }}>Extra Challenge</span>
          ) : (
            <span>Puzzle #{PUZZLE.number}</span>
          )}
          <span>{localDate}</span>
        </div>
      </div>

      {/* ══════════════════════════════════════
          EXTRA CHALLENGE MODE (replaces main game)
      ══════════════════════════════════════ */}
      {luckyOpen ? (
        <>
          <PuzzleZone
            visiblePairs={luckyVisiblePairs}
            currentSlots={luckySlots}
            currentActive={luckyActive}
            wrongFlash={luckyWrongFlash}
            pairsLabel={luckyPairsLabel}
            isPlaying={luckyState === "playing"}
            attempts={luckyAttempts}
            slotCount={6}
            initialPairCount={initLuckyPairs.current}
          />

          {luckyState === "playing" && (
            <InputPanel
              slots={luckySlots}
              activeSlot={luckyActive}
              negative={luckyNeg}
              shake={luckyShake}
              onSelectSlot={luckySelectSlot}
              onPickOperator={luckyPickOp}
              onPickNumber={luckyPickNum}
              onToggleNegative={() => setLuckyNeg(v => !v)}
              onClear={luckyClear}
              onSubmit={luckySubmit}
              revealedPairs={luckyRevealed}
              totalPairs={LUCKY_PUZZLE.pairs.length}
              onRequestClue={luckyRequestClue}
              slotCount={6}
              hintSlots={luckyRevealed >= 3 ? [0, 2, 3] : []}
            />
          )}

          {luckyState === "lost" && (
            <div style={{ width: "100%", maxWidth: 720, padding: "32px" }}>
              <div style={{ background: "#221212", border: "1px solid #f87171", borderRadius: 10, padding: "28px", textAlign: "center" }}>
                <p style={{ color: "#f87171", fontSize: 20, letterSpacing: 5, marginBottom: 8 }}>NOT CRACKED</p>
                <p style={{ color: "#777", fontSize: 12, marginBottom: 16 }}>The code was:</p>
                <p style={{ color: "#e8e8e8", fontSize: 22, letterSpacing: 6, marginBottom: 20 }}>
                  {LUCKY_PUZZLE.solution.op1} {LUCKY_PUZZLE.solution.num1}{" "}
                  {LUCKY_PUZZLE.solution.op2} {LUCKY_PUZZLE.solution.num2}{" "}
                  {LUCKY_PUZZLE.solution.op3} {LUCKY_PUZZLE.solution.num3}
                </p>
                <button
                  className="submit-btn"
                  onClick={() => {
                    const text = `📡 numb3r5 #${PUZZLE.number} — Extra Challenge NOT CRACKED\n🟥🟥🟥🟥\nGot me today.`;
                    copyToClipboard(text);
                  }}
                  style={{ background: "#2a1212", border: "1px solid #f87171", color: "#f87171", letterSpacing: 3 }}
                >
                  📡 Share Result
                </button>
              </div>
            </div>
          )}

          {luckyState === "won" && (
            <div style={{ width: "100%", maxWidth: 720, padding: "32px" }}>
              <div style={{ background: "#121a12", border: "1px solid #4ade80", borderRadius: 10, padding: "28px", textAlign: "center" }}>
                <p style={{ color: "#4ade80", fontSize: 22, letterSpacing: 6, marginBottom: 8 }}>CODE CRACKED</p>
                <p style={{ color: "#777", fontSize: 12, marginBottom: 6 }}>Extra challenge solved in {luckyRevealed} clue{luckyRevealed !== 1 ? "s" : ""}!</p>
                <p style={{ color: "#4ade80", fontSize: 34, letterSpacing: 4, margin: "16px 0" }}>+{luckyScore} pts</p>
                <button
                  className="submit-btn"
                  onClick={() => {
                    const clueEmoji = ["🟩⬜⬜⬜","🟥🟩⬜⬜","🟥🟥🟩⬜","🟥🟥🟥🟩"][luckyRevealed - 1];
                    const text = `📡 numb3r5 #${PUZZLE.number} — Extra Challenge CRACKED\n${clueEmoji}\nBonus Score: +${luckyScore}pts`;
                    copyToClipboard(text);
                  }}
                  style={{ background: "#162016", border: "1px solid #4ade80", color: "#4ade80", letterSpacing: 3, marginTop: 8 }}
                >
                  📡 Share Result
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ══════════════════════════════════════
              MAIN GAME
          ══════════════════════════════════════ */}
          <PuzzleZone
            visiblePairs={mainVisiblePairs}
            currentSlots={slots}
            currentActive={activeSlot}
            wrongFlash={wrongFlash}
            pairsLabel={mainPairsLabel}
            isPlaying={gameState === "playing"}
            attempts={attempts}
            slotCount={4}
            initialPairCount={initMainPairs.current}
          />

          {gameState === "playing" && (
            <InputPanel
              slots={slots}
              activeSlot={activeSlot}
              negative={negative}
              shake={shake}
              onSelectSlot={mainSelectSlot}
              onPickOperator={mainPickOp}
              onPickNumber={mainPickNum}
              onToggleNegative={() => setNegative(v => !v)}
              onClear={mainClear}
              onSubmit={mainSubmit}
              revealedPairs={revealedPairs}
              totalPairs={PUZZLE.pairs.length}
              onRequestClue={mainRequestClue}
              slotCount={4}
            />
          )}

          {gameState === "lost" && (
            <div style={{ width: "100%", maxWidth: 720, padding: "32px" }}>
              <div style={{ background: "#221212", border: "1px solid #f87171", borderRadius: 10, padding: "28px", textAlign: "center" }}>
                <p style={{ color: "#f87171", fontSize: 20, letterSpacing: 5, marginBottom: 8 }}>NOT CRACKED</p>
                <p style={{ color: "#777", fontSize: 12, marginBottom: 16 }}>The code was:</p>
                <p style={{ color: "#e8e8e8", fontSize: 28, letterSpacing: 8, marginBottom: 20 }}>
                  {PUZZLE.solution.op1} {PUZZLE.solution.num1} {PUZZLE.solution.op2} {PUZZLE.solution.num2}
                </p>
                <p style={{ color: "#555", fontSize: 12, marginBottom: 20 }}>Come back tomorrow for a new puzzle.</p>
                <button
                  className="submit-btn"
                  onClick={() => {
                    const text = `📡 numb3r5 #${PUZZLE.number} — NOT CRACKED\n🟥🟥🟥\nGot me today.`;
                    copyToClipboard(text);
                  }}
                  style={{ background: "#2a1212", border: "1px solid #f87171", color: "#f87171", letterSpacing: 3 }}
                >
                  📡 Share Result
                </button>
              </div>
            </div>
          )}

          {gameState === "won" && (
            <div style={{ width: "100%", maxWidth: 720, padding: "32px" }}>
              <div style={{ background: "#121a12", border: "1px solid #4ade80", borderRadius: 10, padding: "28px", textAlign: "center" }}>
                <p style={{ color: "#4ade80", fontSize: 22, letterSpacing: 6, marginBottom: 8 }}>CODE CRACKED</p>
                <p style={{ color: "#777", fontSize: 12, marginBottom: 6 }}>Solved using {revealedPairs} clue{revealedPairs !== 1 ? "s" : ""}</p>
                <p style={{ color: "#4ade80", fontSize: 34, letterSpacing: 4, margin: "16px 0" }}>+{finalScore} pts</p>
                <p style={{ color: "#666", fontSize: 11, marginBottom: 22 }}>
                  {revealedPairs === 1 ? "Incredible — solved on the first clue! 🔥"
                    : revealedPairs === 2 ? "Nice work — solved on the second clue."
                    : "Got there in the end — solved on the final clue."}
                </p>
                <button
                  className="submit-btn"
                  onClick={() => {
                    const clueEmoji = revealedPairs === 1 ? "🟩⬜⬜" : revealedPairs === 2 ? "🟥🟩⬜" : "🟥🟥🟩";
                    const text = `📡 numb3r5 #${PUZZLE.number} — CRACKED\n${clueEmoji}\nScore: +${finalScore}pts`;
                    copyToClipboard(text);
                  }}
                  style={{ background: "#162016", border: "1px solid #4ade80", color: "#4ade80", letterSpacing: 3 }}
                >
                  📡 Share Result
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
