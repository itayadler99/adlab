"use client";

import { useEffect, useState } from "react";

interface Ad {
  id: string;
  created_at: string;
  product_name?: string;
  script?: string;
  video_url?: string;
  thumbnail_url?: string;
  status?: string;
  platform?: string;
}

export default function LibraryPage() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        setAds(Array.isArray(data) ? data : data.ads ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Ad Library</h1>

      {loading && <p className="text-zinc-400">Loading ads...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {!loading && !error && ads.length === 0 && (
        <p className="text-zinc-400">No ads yet. Generate your first ad!</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {ads.map((ad) => (
          <div
            key={ad.id}
            className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors"
          >
            <div className="relative aspect-video bg-zinc-800">
              {ad.thumbnail_url ? (
                ad.thumbnail_url.startsWith("data:video") ? (
                  <video
                    src={ad.video_url}
                    poster={undefined}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={ad.thumbnail_url}
                    alt={ad.product_name ?? "Ad thumbnail"}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )
              ) : ad.video_url ? (
                <video
                  src={ad.video_url}
                  className="w-full h-full object-cover"
                  muted
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    (e.target as HTMLVideoElement).currentTime = 0;
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-zinc-600 text-sm">
                    {ad.status === "generating" ? "Generating..." : "No preview"}
                  </span>
                </div>
              )}

              <div className="absolute top-2 right-2">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    ad.status === "succeeded" || ad.status === "done"
                      ? "bg-green-900 text-green-300"
                      : ad.status === "generating" || ad.status === "processing"
                      ? "bg-yellow-900 text-yellow-300"
                      : ad.status === "failed"
                      ? "bg-red-900 text-red-300"
                      : "bg-zinc-700 text-zinc-300"
                  }`}
                >
                  {ad.status ?? "unknown"}
                </span>
              </div>
            </div>

            <div className="p-4">
              <h3 className="font-semibold text-white truncate">
                {ad.product_name ?? "Untitled Ad"}
              </h3>
              {ad.script && (
                <p className="text-zinc-400 text-sm mt-1 line-clamp-2">{ad.script}</p>
              )}
              <div className="flex items-center justify-between mt-3">
                {ad.platform && (
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">
                    {ad.platform}
                  </span>
                )}
                <span className="text-xs text-zinc-600 ml-auto">
                  {new Date(ad.created_at).toLocaleDateString()}
                </span>
              </div>
              {ad.video_url && (
                <a
                  href={ad.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block w-full text-center text-sm bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-lg transition-colors"
                >
                  View Video
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
