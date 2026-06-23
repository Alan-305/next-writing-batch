"use client";

type Props = {
  presetId: string;
  /** 設定画面の小さなプレビュー用 */
  compact?: boolean;
};

/** 画面スタイルごとの背景・小道具（視認性を損なわない装飾レイヤー） */
export function StudentBrandingThemeDecor({ presetId, compact = false }: Props) {
  const id = presetId.trim();
  if (!id || id === "standard" || id === "custom") return null;

  return (
    <div
      className={`branding-theme-decor no-print${compact ? " branding-theme-decor--compact" : ""}`}
      aria-hidden
      data-decor-preset={id}
    >
      <div className={`branding-theme-decor__scene branding-theme-decor__scene--${id}`}>
        {id === "cockpit" ? <CockpitGauges compact={compact} /> : null}
        {id === "american" ? <AmericanSkyline compact={compact} /> : null}
        {id === "chalkboard" ? <ChalkboardProps compact={compact} /> : null}
        {id === "library" ? <LibraryShelves compact={compact} /> : null}
        {id === "space" ? <SpaceStars compact={compact} /> : null}
        {id === "spring-sakura" ? <SakuraPetals compact={compact} /> : null}
        {id === "sports" ? <SportsStripes compact={compact} /> : null}
        {id === "rococo" ? <RococoCorners compact={compact} /> : null}
        {id === "showa" ? <ShowaFilm compact={compact} /> : null}
        {id === "matcha" ? <MatchaZen compact={compact} /> : null}
        {id === "exam-pass" ? <ExamPassMotif compact={compact} /> : null}
        {id === "exam-focus" ? <ExamFocusMotif compact={compact} /> : null}
        {id === "early-summer" ? <EarlySummerMotif compact={compact} /> : null}
        {id === "midsummer" ? <MidsummerMotif compact={compact} /> : null}
        {id === "autumn-moon" ? <AutumnMoonMotif compact={compact} /> : null}
        {id === "winter-snow" ? <WinterSnowMotif compact={compact} /> : null}
      </div>
    </div>
  );
}

function CockpitGauges({ compact }: { compact: boolean }) {
  return (
    <>
      <svg className="branding-decor-gauge branding-decor-gauge--tl" viewBox="0 0 80 80" role="presentation">
        <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.35" />
        <circle cx="40" cy="40" r="24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
        <line x1="40" y1="40" x2="40" y2="14" stroke="currentColor" strokeWidth="2" opacity="0.7" />
        <text x="40" y="72" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.6">
          ALT
        </text>
      </svg>
      <svg className="branding-decor-gauge branding-decor-gauge--tr" viewBox="0 0 80 80" role="presentation">
        <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.35" />
        <circle cx="40" cy="40" r="24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
        <line x1="40" y1="40" x2="58" y2="28" stroke="currentColor" strokeWidth="2" opacity="0.7" />
        <text x="40" y="72" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.6">
          SPD
        </text>
      </svg>
      {!compact ? (
        <div className="branding-decor-cockpit-grid" />
      ) : null}
    </>
  );
}

function AmericanSkyline({ compact }: { compact: boolean }) {
  return (
    <svg className="branding-decor-skyline" viewBox="0 0 400 120" preserveAspectRatio="xMidYMax slice" role="presentation">
      <rect x="0" y="90" width="400" height="30" fill="currentColor" opacity="0.08" />
      <rect x="20" y="55" width="36" height="65" fill="currentColor" opacity="0.18" />
      <rect x="70" y="35" width="28" height="85" fill="currentColor" opacity="0.22" />
      <rect x="110" y="20" width="32" height="100" fill="currentColor" opacity="0.28" />
      <rect x="155" y="45" width="24" height="75" fill="currentColor" opacity="0.16" />
      <rect x="190" y="30" width="40" height="90" fill="currentColor" opacity="0.24" />
      <rect x="240" y="50" width="30" height="70" fill="currentColor" opacity="0.18" />
      <rect x="280" y="25" width="34" height="95" fill="currentColor" opacity="0.26" />
      <rect x="325" y="40" width="28" height="80" fill="currentColor" opacity="0.2" />
      <rect x="360" y="60" width="32" height="60" fill="currentColor" opacity="0.15" />
      {!compact ? (
        <>
          <text x="200" y="14" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.35" fontWeight="700">
            ★ Learning City ★
          </text>
        </>
      ) : null}
    </svg>
  );
}

function ChalkboardProps({ compact }: { compact: boolean }) {
  return (
    <>
      <div className="branding-decor-chalk-tray" />
      <span className="branding-decor-eraser" title="">
        🧽
      </span>
      <span className="branding-decor-chalk branding-decor-chalk--1">🖍️</span>
      {!compact ? <span className="branding-decor-chalk branding-decor-chalk--2">✏️</span> : null}
      <span className="branding-decor-desk-corner" />
    </>
  );
}

function LibraryShelves({ compact }: { compact: boolean }) {
  const books = ["#7c2d12", "#14532d", "#1e3a8a", "#78350f", "#4c1d95", "#0f766e"];
  return (
    <>
      <div className="branding-decor-shelf branding-decor-shelf--left">
        {books.map((c, i) => (
          <span key={`l${i}`} className="branding-decor-book" style={{ background: c, height: compact ? 28 + (i % 3) * 6 : 48 + (i % 4) * 10 }} />
        ))}
      </div>
      <div className="branding-decor-shelf branding-decor-shelf--right">
        {books.map((c, i) => (
          <span key={`r${i}`} className="branding-decor-book" style={{ background: c, height: compact ? 32 + (i % 2) * 8 : 52 + (i % 3) * 12 }} />
        ))}
      </div>
    </>
  );
}

function SpaceStars({ compact }: { compact: boolean }) {
  const count = compact ? 12 : 28;
  return (
    <div className="branding-decor-stars">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="branding-decor-star"
          style={{
            left: `${(i * 37 + 11) % 100}%`,
            top: `${(i * 53 + 7) % 88}%`,
            opacity: 0.15 + (i % 5) * 0.12,
            fontSize: i % 3 === 0 ? "0.65rem" : "0.45rem",
          }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}

function SakuraPetals({ compact }: { compact: boolean }) {
  const count = compact ? 6 : 14;
  return (
    <div className="branding-decor-petals">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="branding-decor-petal"
          style={{
            left: `${(i * 29 + 5) % 95}%`,
            top: `${(i * 41 + 10) % 80}%`,
          }}
        >
          🌸
        </span>
      ))}
    </div>
  );
}

function SportsStripes({ compact }: { compact: boolean }) {
  return (
    <>
      <div className="branding-decor-sports-stripe branding-decor-sports-stripe--a" />
      <div className="branding-decor-sports-stripe branding-decor-sports-stripe--b" />
      <span className="branding-decor-sports-ball">{compact ? "⚽" : "🏀"}</span>
    </>
  );
}

function RococoCorners({ compact }: { compact: boolean }) {
  return (
    <>
      <span className="branding-decor-rococo branding-decor-rococo--tl">❦</span>
      <span className="branding-decor-rococo branding-decor-rococo--tr">❦</span>
      {!compact ? (
        <>
          <span className="branding-decor-rococo branding-decor-rococo--bl">❦</span>
          <span className="branding-decor-rococo branding-decor-rococo--br">❦</span>
        </>
      ) : null}
    </>
  );
}

function ShowaFilm({ compact }: { compact: boolean }) {
  return <div className={`branding-decor-showa-grain${compact ? " branding-decor-showa-grain--compact" : ""}`} />;
}

function MatchaZen({ compact }: { compact: boolean }) {
  return (
    <svg className="branding-decor-zen" viewBox="0 0 120 120" role="presentation">
      <circle cx="60" cy="60" r={compact ? 28 : 48} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <circle cx="60" cy="60" r={compact ? 18 : 32} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
    </svg>
  );
}

function ExamPassMotif({ compact }: { compact: boolean }) {
  return <span className="branding-decor-exam-pass">{compact ? "🎓" : "🏆"}</span>;
}

function ExamFocusMotif({ compact }: { compact: boolean }) {
  return <span className="branding-decor-exam-focus">{compact ? "📖" : "🎯"}</span>;
}

function EarlySummerMotif({ compact }: { compact: boolean }) {
  return <span className="branding-decor-season branding-decor-season--early">{compact ? "🌿" : "🌱☁️"}</span>;
}

function MidsummerMotif({ compact }: { compact: boolean }) {
  return <span className="branding-decor-season branding-decor-season--mid">{compact ? "☀️" : "🏖️"}</span>;
}

function AutumnMoonMotif({ compact }: { compact: boolean }) {
  return <span className="branding-decor-season branding-decor-season--autumn">{compact ? "🍁" : "🌕🍂"}</span>;
}

function WinterSnowMotif({ compact }: { compact: boolean }) {
  return <span className="branding-decor-season branding-decor-season--winter">{compact ? "❄️" : "⛄"}</span>;
}
