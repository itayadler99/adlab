"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="text-5xl">⚠️</div>
      <h1 className="text-2xl font-bold">משהו השתבש</h1>
      <p className="text-white/50 max-w-md">
        אירעה שגיאה בלתי צפויה. אפשר לנסות שוב, ואם זה חוזר, רעננו את הדף.
      </p>
      {error.digest && (
        <p className="text-xs text-white/30 ltr-island">קוד שגיאה: {error.digest}</p>
      )}
      <div className="flex flex-col sm:flex-row gap-3 mt-2">
        <button
          onClick={reset}
          className="bg-violet-600 hover:bg-violet-500 transition-colors px-6 py-3 rounded-xl font-semibold"
        >
          ניסיון חוזר
        </button>
        <a
          href="/app"
          className="border border-white/15 hover:border-white/30 transition-colors text-white/70 hover:text-white px-6 py-3 rounded-xl font-medium"
        >
          לדשבורד
        </a>
      </div>
    </main>
  );
}
