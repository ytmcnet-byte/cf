const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dotenv = require("dotenv");

// Use built-in fetch in Node 18+ (no node-fetch required)
const fetch = global.fetch;

dotenv.config();

const token = process.env.CLOUDFLARE_TOKEN;
if (!token) {
  console.error("❌ Missing CLOUDFLARE_TOKEN in .env file");
  process.exit(1);
}

const platformMap = { linux: "linux", darwin: "darwin", win32: "windows" };
const archMap = { x64: "amd64", arm64: "arm64" };
const platform = platformMap[os.platform()] || "linux";
const arch = archMap[os.arch()] || "amd64";
const binaryName = `cloudflared-${platform}-${arch}${platform === "windows" ? ".exe" : ""}`;
const binaryPath = path.join(process.cwd(), binaryName);

const urls = {
  "linux-amd64": "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
  "linux-arm64": "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64",
  "darwin-amd64": "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64",
  "darwin-arm64": "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64",
  "windows-amd64": "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
};

const key = `${platform}-${arch}`;
const url = urls[key];

if (!url) {
  console.error(`❌ Unsupported platform: ${platform} ${arch}`);
  process.exit(1);
}

async function downloadBinary() {
  if (fs.existsSync(binaryPath)) {
    console.log("✔️ Cloudflared binary already exists");
    return binaryPath;
  }

  console.log("⬇️ Downloading cloudflared binary...");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(binaryPath, buffer);
  fs.chmodSync(binaryPath, 0o755);

  console.log("✔️ Download complete!");
  return binaryPath;
}

async function startTunnel() {
  const bin = await downloadBinary();
  console.log("🚀 Starting Cloudflare Tunnel...");

  const tunnel = spawn(bin, ["tunnel", "run"], {
    env: { ...process.env, TUNNEL_TOKEN: token },
  });

  tunnel.stdout.on("data", (data) => {
    const msg = data.toString();
    console.log(msg.trim());

    const match = msg.match(/https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/);
    if (match) {
      console.log(`\n🌍 Public URL: ${match[0]}\n`);
    }
  });

  tunnel.stderr.on("data", (data) => {
    console.error("⚠️", data.toString().trim());
  });

  tunnel.on("close", (code) => {
    console.error(`❌ Tunnel exited (code: ${code})`);
    console.log("🔄 Restarting in 5 seconds...");
    setTimeout(startTunnel, 5000);
  });

  process.on("SIGINT", () => {
    console.log("\n🛑 Stopping Cloudflare tunnel...");
    tunnel.kill();
    process.exit(0);
  });
}

startTunnel().catch((err) => console.error("Error:", err.message));
