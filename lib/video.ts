import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function generateVideo(scriptText: string, imageUrl: string): Promise<string> {
  const output = await replicate.run(
    "minimax/video-01" as `${string}/${string}`,
    {
      input: {
        prompt: scriptText,
        first_frame_image: imageUrl,
      },
    }
  );
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) return output[0] as string;
  throw new Error("Unexpected video output format");
}

export async function extractThumbnail(videoUrl: string): Promise<string | null> {
  try {
    const output = await replicate.run(
      "lucataco/extract-frames:b5e115fb7698ee9c81f35f2c3f6e37e5f84c8b2f2c2f2c2f2c2f2c2f2c2f2c" as `${string}/${string}:${string}`,
      {
        input: {
          video_url: videoUrl,
          get_first_frame: true,
          fps: 1,
          start_time: 0,
          end_time: 1,
        },
      }
    );
    if (Array.isArray(output) && output.length > 0) return output[0] as string;
    return null;
  } catch {
    return await extractThumbnailFallback(videoUrl);
  }
}

async function extractThumbnailFallback(videoUrl: string): Promise<string | null> {
  try {
    const response = await fetch(videoUrl, { headers: { Range: "bytes=0-65535" } });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = "video/mp4";
    return `data:${mimeType};base64,${base64.substring(0, 100)}`;
  } catch {
    return null;
  }
}
