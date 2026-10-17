import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpError } from "../../lib/httpError";
import { parseProbeDuration, type SupportedMediaMime } from "./media.validation";

export interface ProcessedMedia { body: Buffer; mime: SupportedMediaMime; }

/** Re-encode images to WebP and videos to H.264 MP4 using FFmpeg without a shell. */
export async function optimizeMedia(body: Buffer, mime: SupportedMediaMime, ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg"): Promise<ProcessedMedia> {
  const isImage = mime.startsWith("image/");
  const inputExtension = mime === "image/jpeg" ? ".jpg" : mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : mime === "video/webm" ? ".webm" : ".mp4";
  const outputMime: SupportedMediaMime = isImage ? "image/webp" : "video/mp4";
  const outputExtension = isImage ? ".webp" : ".mp4";
  const directory = await mkdtemp(join(tmpdir(), "support-connecte-media-"));
  const inputPath = join(directory, "input" + inputExtension);
  const outputPath = join(directory, "output" + outputExtension);
  try {
    await writeFile(inputPath, body);
    const args = isImage
      ? ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-frames:v", "1", "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease", "-c:v", "libwebp", "-quality", "82", "-compression_level", "6", outputPath]
      : ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-map", "0:v:0", "-map", "0:a?", "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", outputPath];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      if (child.stderr) {
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
      }
      child.once("error", error => {
        if ("code" in error && error.code === "ENOENT") {
          reject(new HttpError(503, "MEDIA_PROCESSOR_UNAVAILABLE", "Le serveur doit disposer de FFmpeg pour optimiser les médias"));
          return;
        }
        reject(error);
      });
      child.once("close", code => code === 0 ? resolve() : reject(new HttpError(422, "OPTIMISATION_MEDIA_ECHOUEE", "Impossible d’optimiser ce fichier. Vérifiez qu’il est valide et non corrompu.", { diagnostic: stderr })));
    });
    const optimized = await readFile(outputPath);
    if (!optimized.length) throw new HttpError(422, "OPTIMISATION_MEDIA_ECHOUEE", "Le fichier optimisé est vide");
    return optimized.length < body.length ? { body: optimized, mime: outputMime } : { body, mime };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

const probePathFor = (ffmpegPath: string) =>
  process.env.FFPROBE_PATH || (/ffmpeg$/.test(ffmpegPath) ? ffmpegPath.replace(/ffmpeg$/, "ffprobe") : "ffprobe");

/** Durée d'une vidéo en secondes (ffprobe, sans shell) ; `null` si elle est illisible. */
export async function probeDurationSeconds(body: Buffer, mime: SupportedMediaMime, ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg"): Promise<number | null> {
  const directory = await mkdtemp(join(tmpdir(), "support-connecte-probe-"));
  const inputPath = join(directory, mime === "video/webm" ? "input.webm" : "input.mp4");
  try {
    await writeFile(inputPath, body);
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(probePathFor(ffmpegPath), ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputPath], { stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => { out = (out + chunk).slice(0, 200); });
      child.once("error", error => {
        if ("code" in error && error.code === "ENOENT") {
          reject(new HttpError(503, "MEDIA_PROCESSOR_UNAVAILABLE", "Le serveur doit disposer de FFprobe (livré avec FFmpeg) pour vérifier les vidéos"));
          return;
        }
        reject(error);
      });
      child.once("close", code => code === 0 ? resolve(out) : resolve(""));
    });
    return parseProbeDuration(stdout);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
