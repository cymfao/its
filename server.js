/**
 * DECYM CAPITAL – Mini Data Relay
 * --------------------------------
 * • HTTP  : http://localhost:3000      (static + /data)
 * • WS    : ws://localhost:8080        (realtime kline broadcast)
 */

// require("dotenv").config();
const express = require("express");
const axios = require("axios");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

/*───────────────────────────────────────────────────────────*
 * CONFIG – ubah di sini jika mau pair / interval berbeda    *
 *───────────────────────────────────────────────────────────*/
const PAIRS = ["BTCUSDT", "ETHUSDT"]; // huruf besar
const INTERVAL = "1m"; // 1m / 5m / 15m / 1h …

/*────────────── Static assets & TradingView lib ───────────*/
app.use(express.static("public"));
app.use(
  "/tradingview",
  express.static(
    path.join(__dirname, "node_modules/@mathieuc/tradingview/dist")
  )
);

/*────────────── REST: /data?pair=BTCUSDT&interval=15m ─────*/
app.get("/data", async (req, res) => {
  const pair = (req.query.pair || "BTCUSDT").toUpperCase();
  const interval = (req.query.interval || "15m").toLowerCase();
  try {
    const url = `https://api.ots-optimized.com/display/raw/crypto/${pair}?interval=${interval}`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (err) {
    console.error("REST /data error:", err.message);
    res.status(500).send("Error fetching data");
  }
});

/*────────────── Root to index.html ────────────────────────*/
app.get("/", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

/*────────────── Launch HTTP server ────────────────────────*/
app.listen(HTTP_PORT, () =>
  console.log(`HTTP  server : http://localhost:${HTTP_PORT}`)
);

/*──────────────── WebSocket relay server ──────────────────*/
const wss = new WebSocket.Server({ port: WS_PORT }, () =>
  console.log(`WS relay    : ws://localhost:${WS_PORT}`)
);

wss.on("connection", (ws) => console.log("Client connected to local WS relay"));

/*────────────── Connect to Binance streams ────────────────*/
PAIRS.forEach((p) => connectBinanceStream(p));

function connectBinanceStream(pair) {
  const endpoint = `wss://fstream.binance.com/ws/${pair.toLowerCase()}@kline_${INTERVAL}`;
  const bs = new WebSocket(endpoint);

  bs.on("open", () => console.log(`↪️  Binance stream open for ${pair}`));

  bs.on("message", (raw) => {
    try {
      const { k } = JSON.parse(raw);
      // k.x === true => candle close
      const payload = {
        pair,
        openTime: k.t,
        closeTime: k.T,
        interval: k.i,
        open: k.o,
        high: k.h,
        low: k.l,
        close: k.c,
        volume: k.v,
        isFinal: k.x,
      };
      // broadcast ke semua client WS lokal
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });
    } catch (e) {
      console.error("Parse WS msg error:", e.message);
    }
  });

  bs.on("close", () => {
    console.warn(`Binance WS for ${pair} closed – reconnecting in 5s`);
    setTimeout(() => connectBinanceStream(pair), 5000);
  });

  bs.on("error", (err) =>
    console.error(`Binance WS error ${pair}:`, err.message)
  );
}
