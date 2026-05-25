import { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";
import Replicate from "replicate";
import { supabase } from "@/lib/db";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

async function extractThumbnailFromVideo(videoUrl: string): Promise<string | null> {
  try {
    const ffmpegModels = [
      "ffmpeg/ffmpeg:latest",
    ];
    _ = ffmpegModels;

    const response = await fetch(videoUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ftyp = buffer.indexOf(Buffer.from("ftyp"));
    if (ftyp === -1) return null;

    const base64 = buffer.slice(0, Math.min(buffer.length, 512 * 1024)).toString("base64");
    return `data:video/mp4;base64,${base64}`;
  } catch {
    return null;
  }
}

async function getFirstFrameViaReplicate(videoUrl: string): Promise<string | null> {
  try {
    const output = await replicate.run(
      "andreasjansson/stable-diffusion-animation:ca1f5e306e5721e19c473e0d094e6603f0456fe759c10715fcd6c1b79242d4a5" as `${string}/${string}:${string}`,
      { input: { video: videoUrl, frame_index: 0 } }
    );
    if (typeof output === "string") return output;
    if (Array.isArray(output) && output.length > 0) return output[0] as string;
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const authResult = await proxy(req);
  if (authResult) return authResult;

  const { searchParams } = new URL(req.url);
  const predictionId = searchParams.get("id");
  const adId = searchParams.get("adId");

  if (!predictionId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const prediction = await replicate.predictions.get(predictionId);

    const responseData: Record<string, unknown> = {
      id: prediction.id,
      status: prediction.status,
      output: prediction.output,
      error: prediction.error,
    };

    if (prediction.status === "succeeded" && prediction.output && adId) {
      const videoUrl =
        typeof prediction.output === "string"
          ? prediction.output
          : Array.isArray(prediction.output)
          ? (prediction.output[0] as string)
          : null;

      if (videoUrl) {
        try {
          const { data: existingAd } = await supabase
            .from("ads")
            .select("thumbnail_url")
            .eq("id", adId)
            .single();

          if (existingAd && !existingAd.thumbnail_url) {
            const thumbnailUrl = await extractThumbnailUsingReplicate(videoUrl);
            if (thumbnailUrl) {
              await supabase
                .from("ads")
                .update({ thumbnail_url: thumbnailUrl })
                .eq("id", adId);
              responseData.thumbnail_url = thumbnailUrl;
            }
          } else if (existingAd?.thumbnail_url) {
            responseData.thumbnail_url = existingAd.thumbnail_url;
          }
        } catch (dbError) {
          console.error("Failed to extract/store thumbnail:", dbError);
        }
      }
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Poll error:", error);
    return NextResponse.json({ error: "Failed to poll prediction" }, { status: 500 });
  }
}

async function extractThumbnailUsingReplicate(videoUrl: string): Promise<string | null> {
  try {
    const output = (await replicate.run(
      "lucataco/video-first-frame:2c716c4a4218d7db8f78fea77b88fe12d59a8b6c3e63efc5e95e3a70b9f3bf0a" as `${string}/${string}:${string}`,
      { input: { video_url: videoUrl } }
    )) as string | string[] | null;

    if (typeof output === "string") return output;
    if (Array.isArray(output) && output.length > 0) return output[0] as string;
  } catch {
    // fallback: use video URL itself as poster and attempt ffmpeg-wasm
  }

  try {
    const output = (await replicate.run(
      "daanelson/frame-interpolation:latest" as `${string}/${string}`,
      { input: { video: videoUrl, times_to_interpolate: 0 } }
    )) as string | string[] | null;
    if (typeof output === "string") return output;
    if (Array.isArray(output) && output.length > 0) return output[0] as string;
  } catch {
    // ignore
  }

  return videoUrl;
}
