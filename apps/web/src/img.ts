// Serves poster images that are stored in Telegram (SPEC §11): look up the file, stream it back with long
// caching. The bot token never reaches the browser.
import { isPublicImage } from "./data";

export async function serveImage(env: Env, fileId: string): Promise<Response> {
  if (!/^[\w-]{10,200}$/.test(fileId) || !(await isPublicImage(env, fileId))) {
    return new Response("Not found", { status: 404 });
  }
  const meta = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const json = (await meta.json().catch(() => null)) as {
    ok?: boolean;
    result?: { file_path?: string };
  } | null;
  const path = json?.ok ? json.result?.file_path : null;
  if (!path) return new Response("Not found", { status: 404 });

  const file = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${path}`);
  if (!file.ok || !file.body) return new Response("Not found", { status: 404 });
  const type = path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(file.body, {
    headers: {
      "content-type": type,
      // A Telegram file ID always points to the same image, so browsers can keep it for a long time.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
