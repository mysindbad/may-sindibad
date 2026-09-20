"use client";

// Last-resort boundary: this replaces the root layout itself, so it cannot use
// the locale provider, app shell or design tokens -- everything it needs is
// inlined here. It only renders when the layout tree itself failed.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f8fafc" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "24px",
            textAlign: "center",
            color: "#0b3552",
          }}
        >
          <span style={{ fontSize: "40px" }}>🧭</span>
          <h1 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>My Sindbad</h1>
          <p style={{ fontSize: "14px", color: "#475569", margin: 0 }}>Something went wrong. Please try again.</p>
          <button
            onClick={reset}
            style={{
              border: "none",
              borderRadius: "9999px",
              background: "#0b3552",
              color: "#ffffff",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && <code style={{ fontSize: "11px", color: "#94a3b8" }}>{error.digest}</code>}
        </div>
      </body>
    </html>
  );
}
