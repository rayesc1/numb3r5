import { useState, useRef, useEffect } from "react";

// ── Main puzzle (2 ops, 3 pairs) ──
const PUZZLE = {
  number: 3,
  pairs: [
    { input: 2, output: 13 },
    { input: 5, output: 25 },
    { input: 8, output: 37 },
  ],
  solution: { op1: "×", num1: 4, op2: "+", num2: 5 },
};

// ── Extra Challenge puzzle (3 ops, 4 pairs) ──
const LUCKY_PUZZLE = {
  pairs: [
    { input: 2, output: 5 },
    { input: 4, output: 11 },
    { input: 6, output: 17 },
    { input: 8, output: 23 },
  ],
  solution: { op1: "−", num1: 1, op2: "×", num2: 3, op3: "+", num3: 2 },
  // Slot indices: 0=OP1, 1=NUM1, 2=OP2, 3=NUM2, 4=OP3, 5=NUM3
  // hints[i] = slot revealed when luckyRevealed reaches i+2
  hints: [0, 3, 4], // Clue 2 → OP1(−), Clue 3 → NUM2(3), Clue 4 → OP3(+)
};

const PAIR_SCORES = { 1: 500, 2: 300, 3: 100 };
const EC_BONUS = 500; // flat bonus for completing EC regardless of clues used
const OPERATORS = ["+", "−", "×", "÷"];

// Builds a slot array with hints pre-filled up to the current clue level
function buildHintSlots(revealedCount) {
  const sol = LUCKY_PUZZLE.solution;
  const solArr = [sol.op1, sol.num1, sol.op2, sol.num2, sol.op3, sol.num3];
  const slots = [null, null, null, null, null, null];
  // hints[i] is revealed when revealedCount >= i+2
  LUCKY_PUZZLE.hints.forEach((slotIdx, i) => {
    if (revealedCount >= i + 2) slots[slotIdx] = solArr[slotIdx];
  });
  return slots;
}

// Builds a slot array with both hint slots AND formula-revealed slots pre-filled
function buildLockedSlots(revealedCount, formulaSlots) {
  const sol = LUCKY_PUZZLE.solution;
  const solArr = [sol.op1, sol.num1, sol.op2, sol.num2, sol.op3, sol.num3];
  const slots = buildHintSlots(revealedCount);
  formulaSlots.forEach(idx => { slots[idx] = solArr[idx]; });
  return slots;
}

// Returns the first non-hint, non-filled slot index for auto-focus
function firstOpenSlot(slots) {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === null) return i;
  }
  return null;
}

// ── Formula engines ──
// Applies a 2-operation formula left-to-right (no PEMDAS)
function applyFormula2(input, op1, num1, op2, num2) {
  let mid;
  if (op1 === "+") mid = input + num1;
  else if (op1 === "−") mid = input - num1;
  else if (op1 === "×") mid = input * num1;
  else if (op1 === "÷") mid = input / num1;
  else return 0; // defensive: unknown operator
  if (op2 === "+") return mid + num2;
  if (op2 === "−") return mid - num2;
  if (op2 === "×") return mid * num2;
  if (op2 === "÷") return mid / num2;
  return 0; // defensive: unknown operator
}

// Applies a 3-operation formula by chaining applyFormula2 with a third op
function applyFormula3(input, op1, num1, op2, num2, op3, num3) {
  const v = applyFormula2(input, op1, num1, op2, num2);
  if (op3 === "+") return v + num3;
  if (op3 === "−") return v - num3;
  if (op3 === "×") return v * num3;
  if (op3 === "÷") return v / num3;
  return 0; // defensive: unknown operator
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
  pairCluesLeft, formulaCluesLeft, onFormulaClue,
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
          <div className="negative-toggle-wrap" style={{ display: "none", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10 }}>
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

        {/* Clues panel — EC gets two-button version, main game gets standard */}
        {slotCount === 6 ? (
          <div className="clues-panel-wrap" style={{ flexShrink: 0, width: 152, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, color: "#888", letterSpacing: 1.5, textTransform: "uppercase", textAlign: "center" }}>Clues</div>
            {/* Reveal Pair Clue */}
            <button
              onClick={() => pairCluesLeft > 0 && onRequestClue()}
              disabled={pairCluesLeft === 0}
              style={{
                width: "100%", height: 44, borderRadius: 8, cursor: pairCluesLeft > 0 ? "pointer" : "not-allowed",
                background: pairCluesLeft > 0 ? "#2a2a2a" : "#1e1e1e",
                border: `1px solid ${pairCluesLeft > 0 ? "#4a4a4a" : "#2a2a2a"}`,
                color: pairCluesLeft > 0 ? "#aaa" : "#444",
                fontSize: 10, fontFamily: "'Aldrich', sans-serif", letterSpacing: 1,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0 10px", transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (pairCluesLeft > 0) { e.currentTarget.style.background = "#363636"; e.currentTarget.style.color = "#ddd"; }}}
              onMouseLeave={e => { if (pairCluesLeft > 0) { e.currentTarget.style.background = "#2a2a2a"; e.currentTarget.style.color = "#aaa"; }}}
            >
              <span>Reveal Pair</span>
              <span style={{
                background: pairCluesLeft > 0 ? "#3a3a3a" : "#222",
                border: `1px solid ${pairCluesLeft > 0 ? "#555" : "#333"}`,
                borderRadius: 4, padding: "1px 6px", fontSize: 11,
                color: pairCluesLeft > 0 ? "#aaa" : "#444",
              }}>{pairCluesLeft}</span>
            </button>
            {/* Reveal Formula Clue */}
            <button
              onClick={() => formulaCluesLeft > 0 && onFormulaClue()}
              disabled={formulaCluesLeft === 0}
              style={{
                width: "100%", height: 44, borderRadius: 8, cursor: formulaCluesLeft > 0 ? "pointer" : "not-allowed",
                background: formulaCluesLeft > 0 ? "#2a2a2a" : "#1e1e1e",
                border: `1px solid ${formulaCluesLeft > 0 ? "#4a4a4a" : "#2a2a2a"}`,
                color: formulaCluesLeft > 0 ? "#aaa" : "#444",
                fontSize: 10, fontFamily: "'Aldrich', sans-serif", letterSpacing: 1,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0 10px", transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (formulaCluesLeft > 0) { e.currentTarget.style.background = "#363636"; e.currentTarget.style.color = "#ddd"; }}}
              onMouseLeave={e => { if (formulaCluesLeft > 0) { e.currentTarget.style.background = "#2a2a2a"; e.currentTarget.style.color = "#aaa"; }}}
            >
              <span>Reveal Formula</span>
              <span style={{
                background: formulaCluesLeft > 0 ? "#3a3a3a" : "#222",
                border: `1px solid ${formulaCluesLeft > 0 ? "#555" : "#333"}`,
                borderRadius: 4, padding: "1px 6px", fontSize: 11,
                color: formulaCluesLeft > 0 ? "#aaa" : "#444",
              }}>{formulaCluesLeft}</span>
            </button>
          </div>
        ) : (
          <div className="clues-panel-wrap" style={{ flexShrink: 0, width: 152, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div className="clues-label" style={{ fontSize: 11, color: "#888", letterSpacing: 1.5, textTransform: "uppercase" }}>Clues</div>
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
        )}
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

const STORAGE_KEY = `numb3r5_v25_puzzle${PUZZLE.number}`;
const _saved = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
})();
function savedOr(key, fallback) {
  return _saved && _saved[key] !== undefined ? _saved[key] : fallback;
}

// Computed once at load time — stable for the lifetime of the page
const localDate = new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });

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
  const [luckyFormulaSlots, setLuckyFormulaSlots] = useState(() => savedOr("luckyFormulaSlots", []));
  const [luckySlots, setLuckySlots] = useState(() => savedOr("luckySlots", buildLockedSlots(savedOr("luckyRevealed", 1), savedOr("luckyFormulaSlots", []))));
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
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDemo, setShowDemo] = useState(() => !_saved); // auto-show for first-time players
  const [demoStep, setDemoStep] = useState(0);
  const [mainResultsOpen, setMainResultsOpen] = useState(() => {
    const gs = savedOr("gameState", "playing");
    return gs === "won" || gs === "lost";
  });
  const [luckyResultsOpen, setLuckyResultsOpen] = useState(() => {
    const ls = savedOr("luckyState", "playing");
    return ls === "won" || ls === "lost";
  });

  // Track how many pairs were visible on mount — suppresses slide-in animation on restored pairs
  const initMainPairs = useRef(savedOr("revealedPairs", 1));
  const initLuckyPairs = useRef(savedOr("luckyRevealed", 1));
  const flashTimer = useRef(null); // tracks flash timeout to avoid race conditions

  // Persist all meaningful state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        slots, activeSlot, revealedPairs, attempts, gameState, finalScore,
        luckyOpen, luckyFormulaSlots, luckySlots, luckyActive, luckyRevealed, luckyAttempts, luckyState, luckyScore,
      }));
    } catch { /* quota/blocked — fail silently */ }
  }, [slots, activeSlot, revealedPairs, attempts, gameState, finalScore,
      luckyOpen, luckyFormulaSlots, luckySlots, luckyActive, luckyRevealed, luckyAttempts, luckyState, luckyScore]);

  // ── Toast flash message (clears previous timer to avoid race conditions) ──
  function flash(msg) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashMsg(msg);
    flashTimer.current = setTimeout(() => setFlashMsg(""), 4500);
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
  // Selecting a slot focuses it for input
  function mainSelectSlot(i) { setActiveSlot(i); setNegative(false); }

  // Pick an operator for the active op slot, auto-advance to next slot
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
      setMainResultsOpen(true);
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
        setMainResultsOpen(true);
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
    const locked = buildLockedSlots(luckyRevealed, luckyFormulaSlots);
    if (locked[i] !== null) return; // locked hint or formula slot
    setLuckyActive(i); setLuckyNeg(false);
  }

  function luckyPickOp(op) {
    const isOpSlot = luckyActive === 0 || luckyActive === 2 || luckyActive === 4;
    if (!isOpSlot) return;
    const locked = buildLockedSlots(luckyRevealed, luckyFormulaSlots);
    if (locked[luckyActive] !== null) return;
    const next = [...luckySlots]; next[luckyActive] = op;
    setLuckySlots(next); setLuckyNeg(false);
    const naturalNext = luckyActive === 0 ? 1 : luckyActive === 2 ? 3 : 5;
    const merged = next.map((v, i) => locked[i] !== null ? locked[i] : v);
    if (locked[naturalNext] !== null) {
      setLuckyActive(firstOpenSlot(merged));
    } else {
      setLuckyActive(naturalNext);
    }
  }

  function luckyPickNum(n) {
    const isNumSlot = luckyActive === 1 || luckyActive === 3 || luckyActive === 5;
    if (!isNumSlot) return;
    const locked = buildLockedSlots(luckyRevealed, luckyFormulaSlots);
    if (locked[luckyActive] !== null) return;
    const val = luckyNeg ? -n : n;
    const next = [...luckySlots]; next[luckyActive] = val;
    setLuckySlots(next); setLuckyNeg(false);
    const naturalNext = luckyActive === 1 ? 2 : luckyActive === 3 ? 4 : null;
    if (naturalNext === null) { setLuckyActive(null); return; }
    const merged = next.map((v, i) => locked[i] !== null ? locked[i] : v);
    if (locked[naturalNext] !== null) {
      setLuckyActive(firstOpenSlot(merged));
    } else {
      setLuckyActive(naturalNext);
    }
  }

  function luckyClear() {
    const base = buildLockedSlots(luckyRevealed, luckyFormulaSlots);
    setLuckySlots(base); setLuckyActive(firstOpenSlot(base)); setLuckyNeg(false);
  }

  function luckySubmit() {
    const [op1, num1, op2, num2, op3, num3] = luckySlots;
    const reason = invalidReason3(op1, num1, op2, num2, op3, num3);
    if (reason) {
      setLuckyShake(true); setTimeout(() => setLuckyShake(false), 500);
      flash(reason); return;
    }
    if (checkLuckySatisfies(op1, num1, op2, num2, op3, num3)) {
      setLuckyScore(EC_BONUS);
      setLuckyAttempts(prev => [...prev, { guess: [...luckySlots], result: "correct" }]);
      setLuckyState("won");
      setLuckyResultsOpen(true);
    } else {
      setLuckyWrongFlash(true); setTimeout(() => setLuckyWrongFlash(false), 650);
      setLuckyAttempts(prev => [...prev, { guess: [...luckySlots], result: "wrong" }]);
      const nextReveal = luckyRevealed + 1;
      const newSlots = buildLockedSlots(nextReveal, luckyFormulaSlots);
      setLuckySlots(newSlots); setLuckyActive(firstOpenSlot(newSlots));
      const partial = checkPartialSatisfies3(op1, num1, op2, num2, op3, num3, LUCKY_PUZZLE.pairs.slice(0, luckyRevealed));
      if (luckyRevealed < LUCKY_PUZZLE.pairs.length) {
        setLuckyRevealed(p => p + 1);
        flash(partial ? "That's technically right...but it's not the answer we're looking for." : "Not quite. Here's another clue...");
      } else {
        if (partial) flash("That's technically right...but it's not the answer we're looking for.");
        setLuckyState("lost");
        setLuckyResultsOpen(true);
      }
    }
  }

  function luckyRequestClue() { if (luckyRevealed < LUCKY_PUZZLE.pairs.length) setLuckyConfirmClue(true); }
  function applyLuckyClue() {
    setLuckyConfirmClue(false);
    const next = luckyRevealed + 1;
    const newSlots = buildLockedSlots(next, luckyFormulaSlots);
    setLuckySlots(newSlots);
    setLuckyRevealed(next);
    setLuckyActive(firstOpenSlot(newSlots));
    setLuckyNeg(false);
  }

  // Reveals a random unfilled, non-locked slot from the solution
  function applyFormulaClue() {
    const sol = LUCKY_PUZZLE.solution;
    const solArr = [sol.op1, sol.num1, sol.op2, sol.num2, sol.op3, sol.num3];
    const locked = buildLockedSlots(luckyRevealed, luckyFormulaSlots);
    // Find slots that are: not locked, not already filled by player
    const candidates = locked
      .map((v, i) => v === null && luckySlots[i] === null ? i : null)
      .filter(i => i !== null);
    if (candidates.length <= 2) return; // safety check
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const newFormulaSlots = [...luckyFormulaSlots, pick];
    const newSlots = buildLockedSlots(luckyRevealed, newFormulaSlots);
    // Preserve any player-filled slots
    luckySlots.forEach((v, i) => { if (newSlots[i] === null && v !== null) newSlots[i] = v; });
    setLuckyFormulaSlots(newFormulaSlots);
    setLuckySlots(newSlots);
    if (luckyActive === pick) setLuckyActive(firstOpenSlot(newSlots));
  }

  // How many formula clues are still available (always keep 2 slots for player to fill)
  const lockedCount = buildLockedSlots(luckyRevealed, luckyFormulaSlots).filter(v => v !== null).length;
  const playerFilledCount = luckySlots.filter((v, i) => buildLockedSlots(luckyRevealed, luckyFormulaSlots)[i] === null && v !== null).length;
  const openSlots = 6 - lockedCount - playerFilledCount;
  const formulaCluesLeft = Math.max(0, openSlots - 2);
  const pairCluesLeft = LUCKY_PUZZLE.pairs.length - luckyRevealed;

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
        .results-overlay {
          animation: fadeIn 0.15s ease;
        }
        .results-card {
          animation: cardPop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes cardPop {
          from { opacity: 0; transform: scale(0.95) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
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

        .shake { animation: shake 0.45s ease; }
        .wrong-flash { animation: wrongPulse 0.65s ease forwards !important; }
        .pair-row { animation: slideIn 0.35s ease; }

        .flash-toast {
          position: fixed; top: 72px; left: 50%;
          transform: translateX(-50%);
          background: #2a2a2a; border: 1px solid #4ade80; color: #4ade80;
          padding: 10px 26px; border-radius: 8px; font-size: 13px;
          font-family: 'Aldrich', sans-serif; z-index: 999;
          white-space: nowrap; pointer-events: none;
          max-width: calc(100vw - 32px);
          white-space: normal; text-align: center;
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
            order: 2;
            flex: none !important;
            width: 100% !important;
          }
          .num-key { height: 64px !important; font-size: 22px !important; }

          /* Hide negative toggle on mobile */
          .negative-toggle-wrap { display: none !important; }

          /* Op pad: single row of 4, above numbers */
          .op-pad-wrap {
            order: 1;
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
            style={{ background: "#222", border: "1px solid #3a3a3a", borderRadius: 14, maxWidth: 480, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
          >
            {/* Scrollable content */}
            <div style={{ overflowY: "auto", padding: "32px 32px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
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

            </div>{/* end scrollable area */}

            {/* Sticky close buttons */}
            <div style={{ padding: "16px 32px 24px", borderTop: "1px solid #333", background: "#222", borderRadius: "0 0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => { setShowInstructions(false); setDemoStep(0); setShowDemo(true); }}
              style={{
                width: "100%", height: 44, borderRadius: 8,
                background: "transparent", border: "1px solid #555",
                color: "#888", fontSize: 12, fontFamily: "'Aldrich', sans-serif",
                letterSpacing: 2, cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#4ade80"; e.currentTarget.style.color = "#4ade80"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.color = "#888"; }}
            >
              GUIDED WALKTHROUGH →
            </button>
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
        </div>
      )}

      {/* ── Interactive Demo Walkthrough ── */}
      {showDemo && (() => {
        // Demo uses a fake simple puzzle: + 2 × 3, pair: 1 → 9
        const DEMO_SLOTS = ["+", 2, "×", 3];
        const DEMO_STEPS = [
          {
            title: "Welcome to numb3r5",
            body: "Let's walk you through how the game works. It'll only take a minute.",
            highlight: null,
            showSlots: false,
            showPair: false,
          },
          {
            title: "You have a clue",
            body: "Each round starts with one input/output pair. A hidden formula turns every input into its output.",
            highlight: null,
            showSlots: false,
            showPair: true,
          },
          {
            title: "Crack the formula",
            body: "The formula always has the shape: OP NUM OP NUM — two operations, two numbers, evaluated strictly left to right.",
            highlight: null,
            showSlots: true,
            showPair: true,
          },
          {
            title: "⚠ Forget PEMDAS",
            body: "Math goes left to right — no exceptions. So 1 + 2 × 3 = 9, not 7. Keep that in mind.",
            highlight: null,
            showSlots: true,
            showPair: true,
          },
          {
            title: "Fill in OP 1",
            body: "The first slot takes an operator. For our example, the answer starts with +",
            highlight: 0,
            showSlots: true,
            showPair: true,
            filledUpTo: 0,
          },
          {
            title: "Fill in NUM 1",
            body: "The second slot takes a number. Here it's 2.",
            highlight: 1,
            showSlots: true,
            showPair: true,
            filledUpTo: 1,
          },
          {
            title: "Fill in OP 2",
            body: "Third slot — another operator. In this case ×.",
            highlight: 2,
            showSlots: true,
            showPair: true,
            filledUpTo: 2,
          },
          {
            title: "Fill in NUM 2",
            body: "Last slot — the final number. Here it's 3. Check the math: 1 + 2 = 3, then 3 × 3 = 9 ✓",
            highlight: 3,
            showSlots: true,
            showPair: true,
            filledUpTo: 3,
          },
          {
            title: "One correct answer",
            body: "Only one formula cracks the code. Other formulas might fit the first pair — but only the right one works for all of them.",
            highlight: null,
            showSlots: true,
            showPair: true,
            filledUpTo: 3,
          },
          {
            title: "Clues & hints",
            body: "A wrong guess automatically reveals the next pair. You can also tap a clue slot to request one — but it costs points. Fewer clues = higher score.",
            highlight: null,
            showSlots: true,
            showPair: true,
            filledUpTo: 3,
          },
        ];

        const step = DEMO_STEPS[demoStep];
        const isLast = demoStep === DEMO_STEPS.length - 1;
        const slotTypes = ["op", "num", "op", "num"];
        const slotLabels = ["OP", "NUM", "OP", "NUM"];

        function closeDemo() { setShowDemo(false); setDemoStep(0); }

        return (
          <div
            className="instructions-overlay"
            style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 650, padding: "24px" }}
          >
            <div
              className="instructions-card"
              style={{ background: "#222", border: "1px solid #3a3a3a", borderRadius: 14, maxWidth: 420, width: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              {/* Progress bar */}
              <div style={{ height: 3, background: "#2a2a2a", borderRadius: "14px 14px 0 0", overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#4ade80", width: `${((demoStep + 1) / DEMO_STEPS.length) * 100}%`, transition: "width 0.3s ease" }} />
              </div>

              <div style={{ padding: "28px 28px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Step counter */}
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase" }}>
                  Step {demoStep + 1} of {DEMO_STEPS.length}
                </div>

                {/* Title */}
                <div style={{ fontFamily: "'Aldrich', sans-serif", fontSize: 18, color: "#e8e8e8", letterSpacing: 1 }}>
                  {step.title}
                </div>

                {/* Body */}
                <p style={{ fontSize: 13, color: "#bbb", lineHeight: 1.8 }}>{step.body}</p>

                {/* Demo pair */}
                {step.showPair && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px", background: "#2a2a2a", borderRadius: 10, flexWrap: "wrap" }}>
                    <span style={{ color: "#e8e8e8", fontSize: 24 }}>1</span>
                    {["OP","NUM","OP","NUM"].map((label, i) => {
                      const filled = step.filledUpTo !== undefined && i <= step.filledUpTo;
                      const isOp = i % 2 === 0;
                      return (
                        <div key={i} style={{
                          width: 36, height: 36, borderRadius: 6,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          border: `1.5px solid ${filled ? "#666" : "#444"}`,
                          background: filled ? "#4a4a4a" : "#3a3a3a",
                          color: filled ? (isOp ? "#e8e8e8" : "#4ade80") : "#555",
                          fontSize: filled ? 15 : 10, fontFamily: "'Aldrich', sans-serif",
                        }}>
                          {filled ? DEMO_SLOTS[i] : label}
                        </div>
                      );
                    })}
                    <span style={{ color: "#ccc", fontSize: 18 }}>=</span>
                    <span style={{ color: "#4ade80", fontSize: 24 }}>9</span>
                  </div>
                )}

                {/* Demo slots — only shown on steps before the pair is visible */}
                {step.showSlots && !step.showPair && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {DEMO_SLOTS.map((val, i) => {
                      const filled = step.filledUpTo !== undefined && i <= step.filledUpTo;
                      const isHighlighted = step.highlight === i;
                      const isOp = slotTypes[i] === "op";
                      return (
                        <div key={i} style={{
                          flex: 1, height: 52, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "'Aldrich', sans-serif", fontSize: 17,
                          background: filled ? (isHighlighted ? "#1e3a1e" : "#3d3d3d") : isHighlighted ? "#1e2e1e" : "#2e2e2e",
                          border: `2px solid ${isHighlighted ? "#4ade80" : filled ? "#585858" : "#3a3a3a"}`,
                          color: filled ? (isOp ? "#e8e8e8" : "#4ade80") : "#555",
                          transition: "all 0.25s",
                          boxShadow: isHighlighted ? "0 0 0 2px #4ade8033" : "none",
                        }}>
                          {filled ? val : slotLabels[i]}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Buttons */}
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button
                    onClick={closeDemo}
                    style={{
                      flex: 1, height: 44, borderRadius: 8, background: "transparent",
                      border: "1px solid #333", color: "#555", fontSize: 12,
                      fontFamily: "'Aldrich', sans-serif", letterSpacing: 2, cursor: "pointer",
                    }}
                  >SKIP</button>
                  {demoStep > 0 && (
                    <button
                      onClick={() => setDemoStep(s => s - 1)}
                      style={{
                        flex: 1, height: 44, borderRadius: 8,
                        background: "transparent", border: "1px solid #444",
                        color: "#888", fontSize: 13,
                        fontFamily: "'Aldrich', sans-serif", letterSpacing: 2, cursor: "pointer",
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "#666"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "#444"}
                    >← BACK</button>
                  )}
                  <button
                    onClick={() => isLast ? closeDemo() : setDemoStep(s => s + 1)}
                    style={{
                      flex: 2, height: 44, borderRadius: 8,
                      background: "#2a3a2a", border: "1px solid #4ade80",
                      color: "#4ade80", fontSize: 13,
                      fontFamily: "'Aldrich', sans-serif", letterSpacing: 3, cursor: "pointer",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#334a33"}
                    onMouseLeave={e => e.currentTarget.style.background = "#2a3a2a"}
                  >{isLast ? "LET'S PLAY" : "NEXT →"}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
          <span style={{ color: "#4ade80" }}>5</span>
        </h1>

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
              hintSlots={buildLockedSlots(luckyRevealed, luckyFormulaSlots).map((v, i) => v !== null ? i : null).filter(i => i !== null)}
              pairCluesLeft={pairCluesLeft}
              formulaCluesLeft={formulaCluesLeft}
              onFormulaClue={applyFormulaClue}
            />
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

        </>
      )}

      {/* ══════════════════════════════════════
          MAIN RESULTS OVERLAY
      ══════════════════════════════════════ */}
      {mainResultsOpen && (gameState === "won" || gameState === "lost") && (
        <div
          className="results-overlay"
          style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, pointerEvents: "none", padding: "24px" }}
        >
          <div
            className="results-card"
            style={{
              background: "#1c1c1c",
              border: `1.5px solid ${gameState === "won" ? "#4ade80" : "#f87171"}`,
              borderRadius: 16, width: "100%", maxWidth: 480,
              padding: "32px 32px 36px", display: "flex", flexDirection: "column", gap: 24,
              maxHeight: "85vh", overflowY: "auto", pointerEvents: "all",
              boxShadow: `0 8px 48px ${gameState === "won" ? "#4ade8022" : "#f8717122"}, 0 2px 24px #00000088`,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                Puzzle #{PUZZLE.number} · {localDate}
              </div>
              <div style={{ fontSize: 26, letterSpacing: 6, color: gameState === "won" ? "#4ade80" : "#f87171" }}>
                {gameState === "won" ? "CODE CRACKED" : "NOT CRACKED"}
              </div>
              {gameState === "won" && (
                <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                  {revealedPairs === 1 ? "Incredible — solved on the first clue! 🔥"
                    : revealedPairs === 2 ? "Nice work — solved on the second clue."
                    : "Got there in the end — solved on the final clue."}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              {Array.from({ length: PUZZLE.pairs.length }).map((_, i) => {
                const emoji = gameState === "lost" ? "🟥"
                  : i < revealedPairs - 1 ? "🟥"
                  : i === revealedPairs - 1 ? "🟩" : "⬜";
                return <span key={i} style={{ fontSize: 36 }}>{emoji}</span>;
              })}
            </div>

            {gameState === "won" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 42, color: "#4ade80", letterSpacing: 4 }}>+{finalScore}</div>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 2, marginTop: 4 }}>POINTS</div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center", gap: 24 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, color: "#e8e8e8" }}>{revealedPairs - 1}</div>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 3 }}>Hints Used</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, color: "#e8e8e8" }}>{attempts.filter(a => a.result === "wrong").length}</div>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 3 }}>Wrong Guesses</div>
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                {gameState === "won" ? "The formula" : "The code was"}
              </div>
              <div style={{ fontSize: 28, letterSpacing: 8, color: "#e8e8e8" }}>
                {PUZZLE.solution.op1} {PUZZLE.solution.num1} {PUZZLE.solution.op2} {PUZZLE.solution.num2}
              </div>
            </div>

            <div style={{ borderTop: "1px solid #2a2a2a" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                className="submit-btn"
                onClick={() => {
                  const clueEmoji = gameState === "lost" ? "🟥🟥🟥"
                    : revealedPairs === 1 ? "🟩⬜⬜"
                    : revealedPairs === 2 ? "🟥🟩⬜" : "🟥🟥🟩";
                  const label = gameState === "won" ? "CRACKED" : "NOT CRACKED";
                  const scoreLine = gameState === "won" ? `Score: +${finalScore}pts` : "Got me today.";
                  const text = `📡 numb3r5 #${PUZZLE.number} — ${label}\n${clueEmoji}\n${scoreLine}`;
                  copyToClipboard(text);
                }}
                style={{
                  background: gameState === "won" ? "#162016" : "#2a1212",
                  border: `1px solid ${gameState === "won" ? "#4ade80" : "#f87171"}`,
                  color: gameState === "won" ? "#4ade80" : "#f87171", letterSpacing: 3,
                }}
              >📡 Share Result</button>

              {gameState === "won" && luckyState === "playing" && !luckyOpen && (
                <button className="submit-btn"
                  onClick={() => { setLuckyOpen(true); setMainResultsOpen(false); }}
                  style={{ background: "#1a2e1a", border: "1px solid #4ade8077", color: "#4ade80", letterSpacing: 2 }}
                >Up for an extra challenge? →</button>
              )}

              {gameState === "won" && luckyState === "playing" && luckyOpen && (
                <button className="submit-btn"
                  onClick={() => { setMainResultsOpen(false); }}
                  style={{ background: "#1a2e1a", border: "1px solid #4ade8077", color: "#4ade80", letterSpacing: 2 }}
                >Back to Extra Challenge →</button>
              )}

              {gameState === "won" && (luckyState === "won" || luckyState === "lost") && (
                <button className="submit-btn"
                  onClick={() => { setLuckyResultsOpen(true); setMainResultsOpen(false); }}
                  style={{ background: "#1a1a2e", border: "1px solid #a78bfa77", color: "#a78bfa", letterSpacing: 2 }}
                >Extra Challenge Results →</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          EC RESULTS OVERLAY
      ══════════════════════════════════════ */}
      {luckyResultsOpen && (luckyState === "won" || luckyState === "lost") && (
        <div
          className="results-overlay"
          style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, pointerEvents: "none", padding: "24px" }}
        >
          <div
            className="results-card"
            style={{
              background: "#1c1c1c",
              border: `1.5px solid ${luckyState === "won" ? "#4ade80" : "#f87171"}`,
              borderRadius: 16, width: "100%", maxWidth: 480,
              padding: "32px 32px 36px", display: "flex", flexDirection: "column", gap: 24,
              maxHeight: "85vh", overflowY: "auto", pointerEvents: "all",
              boxShadow: `0 8px 48px ${luckyState === "won" ? "#4ade8022" : "#f8717122"}, 0 2px 24px #00000088`,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                Extra Challenge · {localDate}
              </div>
              <div style={{ fontSize: 26, letterSpacing: 6, color: luckyState === "won" ? "#4ade80" : "#f87171" }}>
                {luckyState === "won" ? "CODE CRACKED" : "NOT CRACKED"}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              {Array.from({ length: LUCKY_PUZZLE.pairs.length }).map((_, i) => {
                const emoji = luckyState === "lost" ? "🟥"
                  : i < luckyRevealed - 1 ? "🟥"
                  : i === luckyRevealed - 1 ? "🟩" : "⬜";
                return <span key={i} style={{ fontSize: 36 }}>{emoji}</span>;
              })}
            </div>

            {luckyState === "won" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 42, color: "#4ade80", letterSpacing: 4 }}>+{luckyScore}</div>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 2, marginTop: 4 }}>BONUS POINTS</div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center", gap: 24 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, color: "#e8e8e8" }}>{luckyRevealed - 1}</div>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 3 }}>Pair Hints</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, color: "#e8e8e8" }}>{luckyFormulaSlots.length}</div>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 3 }}>Formula Hints</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, color: "#e8e8e8" }}>{luckyAttempts.filter(a => a.result === "wrong").length}</div>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 3 }}>Wrong Guesses</div>
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                {luckyState === "won" ? "The formula" : "The code was"}
              </div>
              <div style={{ fontSize: 22, letterSpacing: 6, color: "#e8e8e8" }}>
                {LUCKY_PUZZLE.solution.op1} {LUCKY_PUZZLE.solution.num1}{" "}
                {LUCKY_PUZZLE.solution.op2} {LUCKY_PUZZLE.solution.num2}{" "}
                {LUCKY_PUZZLE.solution.op3} {LUCKY_PUZZLE.solution.num3}
              </div>
            </div>

            <div style={{ borderTop: "1px solid #2a2a2a" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                className="submit-btn"
                onClick={() => {
                  const clueEmoji = luckyState === "lost" ? "🟥🟥🟥🟥"
                    : ["🟩⬜⬜⬜","🟥🟩⬜⬜","🟥🟥🟩⬜","🟥🟥🟥🟩"][luckyRevealed - 1];
                  const text = luckyState === "won"
                    ? `📡 numb3r5 #${PUZZLE.number} — Extra Challenge CRACKED\n${clueEmoji}\nBonus Score: +${luckyScore}pts`
                    : `📡 numb3r5 #${PUZZLE.number} — Extra Challenge NOT CRACKED\n🟥🟥🟥🟥\nGot me today.`;
                  copyToClipboard(text);
                }}
                style={{
                  background: luckyState === "won" ? "#162016" : "#2a1212",
                  border: `1px solid ${luckyState === "won" ? "#4ade80" : "#f87171"}`,
                  color: luckyState === "won" ? "#4ade80" : "#f87171", letterSpacing: 3,
                }}
              >📡 Share EC Result</button>

              <button className="submit-btn"
                onClick={() => { setLuckyResultsOpen(false); setMainResultsOpen(true); }}
                style={{ background: "transparent", border: "1px solid #444", color: "#888", letterSpacing: 2 }}
              >← Main Results</button>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
