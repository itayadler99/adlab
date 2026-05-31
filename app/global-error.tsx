"use client";

// Replaces the root layout when an error is thrown in it, so it must render
// its own <html>/<body>. Kept dependency-free (no next/font) and Hebrew RTL.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          background: "#000",
          color: "#fff",
          fontFamily: "Heebo, Assistant, system-ui, Arial, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <div style={{ fontSize: "3rem" }}>⚠️</div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>שגיאה כללית</h1>
        <p style={{ color: "rgba(255,255,255,0.5)", maxWidth: "28rem" }}>
          המערכת נתקלה בתקלה. נסו לטעון מחדש.
        </p>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", direction: "ltr" }}>
            קוד שגיאה: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            background: "#7c3aed",
            color: "#fff",
            border: "none",
            padding: "0.75rem 1.5rem",
            borderRadius: "0.75rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          טעינה מחדש
        </button>
      </body>
    </html>
  );
}
