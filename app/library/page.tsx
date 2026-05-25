export default function LibraryPage() {
  return (
    <div className="p-10 max-w-3xl">
      <h1 className="text-2xl font-bold">Library</h1>
      <p className="text-neutral-400 text-sm mt-1">
        Past generations + analyzed competitors.
      </p>
      <div className="mt-10 border border-dashed border-neutral-800 rounded-xl p-10 text-center text-neutral-500">
        Library is wired in v0.2 — once Supabase is connected, every render and score lands here.
      </div>
    </div>
  );
}
