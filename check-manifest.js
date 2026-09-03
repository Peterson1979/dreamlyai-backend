require("dotenv").config({ path: ".env.production.local" });

const Redis = require("ioredis");

async function main() {
  const redis = new Redis(process.env.UPSTASH_REDIS_URL);

  const key = "social:manifest:2026-09-02";

  const value = await redis.get(key);

  if (!value) {
    console.log("NO MANIFEST FOUND:", key);
    await redis.quit();
    return;
  }

  const manifest = JSON.parse(value);

  console.log(JSON.stringify(manifest, null, 2));

  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});