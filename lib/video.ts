import Replicate from "replicate";

export type VideoModel = "minimax" | "kling-1.6" | "sora-2";

export interface VideoJob {
  id: string;
  model: VideoModel;
  status: "pending" | "processing" | "succeeded" | "failed";
  videoUrl?: string;
  error?: string;
}

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function startVideo(
  prompt: string,
  model: VideoModel = "minimax"
): Promise<VideoJob> {
  if (model === "sora-2") {
    throw new Error(
      "Sora-2 REST API is not yet publicly available. Please use minimax or kling-1.6."
    );
  }

  const modelMap: Record<Exclude<VideoModel, "sora-2">, `${string}/${string}`> = {
    minimax: "minimax/video-01",
    "kling-1.6": "kwaivgi/kling-v1.6-standard",
  };

  const replicateModel = modelMap[model as Exclude<VideoModel, "sora-2">];

  const prediction = await (replicate.predictions.create as Function)({
    model: replicateModel,
    input: { prompt },
  });

  return {
    id: prediction.id,
    model,
    status: "pending",
  };
}

export async function pollVideo(jobId: string, model: VideoModel): Promise<VideoJob> {
  if (model === "sora-2") {
    throw new Error(
      "Sora-2 REST API is not yet publicly available."
    );
  }

  const prediction = await replicate.predictions.get(jobId);

  const status = prediction.status as string;

  let mappedStatus: VideoJob["status"] = "processing";
  if (status === "succeeded") mappedStatus = "succeeded";
  else if (status === "failed" || status === "canceled") mappedStatus = "failed";
  else if (status === "starting" || status === "processing") mappedStatus = "processing";

  const output = prediction.output as string | string[] | null;
  const videoUrl =
    typeof output === "string"
      ? output
      : Array.isArray(output)
      ? output[0]
      : undefined;

  return {
    id: jobId,
    model,
    status: mappedStatus,
    videoUrl,
    error: prediction.error ? String(prediction.error) : undefined,
  };
}
