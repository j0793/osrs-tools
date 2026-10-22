/**
 * Combat Achievements Tracker - WikiSync proxy
 *
 * sync.runescape.wiki blocks direct browser fetches from third-party
 * origins (no Access-Control-Allow-Origin header, and it 403s outright).
 * This worker fetches server-side - where CORS doesn't apply - and
 * re-serves the response with permissive CORS headers so the GitHub
 * Pages site can call it.
 *
 * Deployed at https://osrs-ca-tracker.julianj0793.workers.dev
 * (Cloudflare Workers, free tier, "Hello World" starter with this code pasted in).
 * This copy is for the record; editing it here does not redeploy the worker.
 *
 * Usage from the browser:
 *   https://<your-worker>.workers.dev/?username=SomeUsername
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const username = url.searchParams.get("username");

    if (!username) {
      return new Response(
        JSON.stringify({ error: "Missing 'username' query parameter." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const target = `https://sync.runescape.wiki/runelite/player/${encodeURIComponent(username)}/STANDARD`;

    let upstreamResp;
    try {
      upstreamResp = await fetch(target, {
        headers: {
          "User-Agent": "combat-achievements-tracker-proxy/1.0",
          Accept: "application/json",
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Couldn't reach WikiSync: ${err.message}` }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const body = await upstreamResp.text();
    return new Response(body, {
      status: upstreamResp.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  },
};
