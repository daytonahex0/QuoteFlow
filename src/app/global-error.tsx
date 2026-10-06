"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f7f8f9" }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p style={{ color: "#4c5661" }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 16, minHeight: 48, padding: "0 20px", borderRadius: 12, border: 0, background: "#13624f", color: "#fff", fontWeight: 600 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
