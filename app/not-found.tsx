import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="text-7xl font-extrabold tracking-tight text-violet-400">
        404
      </div>
      <h1 className="text-2xl font-bold">הדף לא נמצא</h1>
      <p className="text-white/50 max-w-md">
        הקישור שביקשתם לא קיים או שהוסר. אפשר לחזור ולהמשיך מהדשבורד.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 mt-2">
        <Link
          href="/app"
          className="bg-violet-600 hover:bg-violet-500 transition-colors px-6 py-3 rounded-xl font-semibold"
        >
          לדשבורד
        </Link>
        <Link
          href="/"
          className="border border-white/15 hover:border-white/30 transition-colors text-white/70 hover:text-white px-6 py-3 rounded-xl font-medium"
        >
          לדף הבית
        </Link>
      </div>
    </main>
  );
}
