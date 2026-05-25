import Link from "next/link";

const TILES = [
  {
    href: "/generate",
    title: "Generate",
    blurb: "AI scripts + video creative for your Shopify products.",
    color: "bg-fuchsia-500/10 border-fuchsia-500/30",
  },
  {
    href: "/launch",
    title: "Launch",
    blurb: "Push creative straight to Meta as a paused campaign.",
    color: "bg-emerald-500/10 border-emerald-500/30",
  },
  {
    href: "/spy",
    title: "Spy",
    blurb: "Paste any ad URL — get hook, transcript and steal-this notes.",
    color: "bg-amber-500/10 border-amber-500/30",
  },
  {
    href: "/library",
    title: "Library",
    blurb: "Every generated asset and analyzed competitor.",
    color: "bg-sky-500/10 border-sky-500/30",
  },
];

export default function Home() {
  return (
    <div className="p-10 max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">AdLab</h1>
      <p className="text-neutral-400 mt-2">
        One workflow: spy on what wins → generate your own → launch on Meta.
      </p>
      <div className="grid grid-cols-2 gap-4 mt-10">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-xl border ${t.color} p-6 hover:-translate-y-0.5 transition`}
          >
            <div className="text-xl font-semibold">{t.title}</div>
            <div className="text-sm text-neutral-300 mt-1">{t.blurb}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
