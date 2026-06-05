const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

const NOTION_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";
const DB_ID = process.env.NOTION_INGREDIENTS_DB_ID;

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

// GET /api/notion/ingredients — fetch all ingredients
router.get("/ingredients", async (req, res) => {
  try {
    let allResults = [];
    let cursor = undefined;

    // Handle pagination — Notion returns max 100 per page
    do {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const response = await fetch(`${NOTION_BASE}/databases/${DB_ID}/query`, {
        method: "POST",
        headers: notionHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();
      allResults = allResults.concat(data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    const ingredients = allResults.map((page) => ({
      id: page.id,
      url: page.url,
      name: page.properties?.Name?.title?.[0]?.plain_text ?? "Unnamed",
      aisle: page.properties?.Aisle?.select?.name ?? "",
      krogerProductId: page.properties?.["Kroger Product ID"]?.rich_text?.[0]?.plain_text ?? "",
      krogerProductName: page.properties?.["Kroger Product Name"]?.rich_text?.[0]?.plain_text ?? "",
      krogerProductImage: page.properties?.["Kroger Product Image"]?.url ?? "",
    }));

    ingredients.sort((a, b) => a.name.localeCompare(b.name));
    res.json(ingredients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notion/ingredients/:id — update Kroger fields on an ingredient
router.patch("/ingredients/:id", async (req, res) => {
  const { id } = req.params;
  const { productId, productName, imageUrl } = req.body;

  try {
    const properties = {
      "Kroger Product ID": {
        rich_text: [{ text: { content: productId ?? "" } }],
      },
      "Kroger Product Name": {
        rich_text: [{ text: { content: productName ?? "" } }],
      },
    };
    if (imageUrl) {
      properties["Kroger Product Image"] = { url: imageUrl };
    }

    const response = await fetch(`${NOTION_BASE}/pages/${id}`, {
      method: "PATCH",
      headers: notionHeaders(),
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
