// Shown while an /app route segment streams in. Mirrors the dashboard grid so
// the layout doesn't jump when content arrives.
export default function AppLoading() {
  return (
    <main className="min-h-screen bg-black text-white" aria-busy="true" aria-label="טוען">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10 space-y-3">
          <div className="h-8 w-64 rounded-lg bg-white/10 animate-pulse" />
          <div className="h-4 w-40 rounded bg-white/5 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 h-32 animate-pulse"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
