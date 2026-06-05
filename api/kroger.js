const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

const KROGER_BASE = "https://api.kroger.com/v1";
let cachedToken = null;
let tokenExpiry = 0;

// ── OAuth: client credentials token (product search only) ────────────────────
async function getClientToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const credentials = Buffer.from(
    `${process.env.KROGER_CLIENT_ID}:${process.env.KROGER_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${KROGER_BASE}/connect/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=product.compact",
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kroger token error: ${err}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // refresh 1min early
  return cachedToken;
}

// GET /api/kroger/search?q=chicken&locationId=01400943
router.get("/search", async (req, res) => {
  const { q, locationId } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query parameter: q" });

  try {
    const token = await getClientToken();

    const params = new URLSearchParams({
      "filter.term": q,
      "filter.limit": "24",
    });
    if (locationId) params.set("filter.locationId", locationId);

    const response = await fetch(`${KROGER_BASE}/products?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();

    // Normalize into a clean shape for the frontend
    const products = (data.data ?? []).map((p) => {
      const frontImg = p.images?.find((i) => i.perspective === "front");
      const img =
        frontImg?.sizes?.find((s) => s.size === "medium")?.url ??
        frontImg?.sizes?.[0]?.url ??
        p.images?.[0]?.sizes?.[0]?.url ??
        null;

      const item = p.items?.[0];
      return {
        productId: p.productId,
        description: p.description,
        brand: p.brand ?? "",
        size: item?.size ?? "",
        price: item?.price?.regular ?? item?.price?.promo ?? null,
        imageUrl: img,
        upc: item?.upc ?? "",
      };
    });

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kroger/locations?zip=30301
router.get("/locations", async (req, res) => {
  const { zip } = req.query;
  if (!zip) return res.status(400).json({ error: "Missing query parameter: zip" });

  try {
    const token = await getClientToken();

    const params = new URLSearchParams({
      "filter.zipCode.near": zip,
      "filter.limit": "5",
      "filter.radiusInMiles": "10",
    });

    const response = await fetch(`${KROGER_BASE}/locations?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const locations = (data.data ?? []).map((l) => ({
      locationId: l.locationId,
      name: l.name,
      address: `${l.address?.addressLine1}, ${l.address?.city}, ${l.address?.state}`,
    }));

    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
