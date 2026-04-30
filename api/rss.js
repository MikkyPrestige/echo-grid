export default async function handler(req, res) {
  const feedUrl = req.query.url;

  if (!feedUrl) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  try {
    const response = await fetch(feedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EchoGrid/1.0; +https://echo-grid.vercel.app)",
      },
    });

    if (!response.ok) {
      console.error(`RSS fetch failed for ${feedUrl}: HTTP ${response.status}`);
      return res.status(200).json([]);
    }

    const xml = await response.text();
    const tweets = parseRSS(xml);

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(tweets);
  } catch (error) {
    console.error(`RSS fetch error for ${feedUrl}:`, error);
    return res.status(200).json([]);
  }
}

function parseRSS(xml) {
  const items = extractItems(xml);
  const channelImage = extractChannelImage(xml);

  return items.map((item) => {
    const title = extractTag(item, "title");
    const link = extractTag(item, "link");
    const pubDate = extractTag(item, "pubDate");
    const rawDescription = extractTag(item, "description");
    const author = extractTag(item, "author") || "";

    const imageUrl = extractImageUrl(rawDescription);
    const text = cleanTweetText(rawDescription);

    const urlParts = link.split("/");
    const handle = urlParts[3] ? "@" + urlParts[3] : "";

    return {
      id: link.split("/").pop(),
      text,
      createdAt: new Date(pubDate).toISOString(),
      url: link,
      authorName: author,
      authorHandle: handle,
      avatarUrl: channelImage,
      imageUrl,
      platform: "x",
    };
  });
}

function extractItems(xml) {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const items = [];
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    items.push(match[1]);
  }
  return items;
}

function extractTag(itemXml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = itemXml.match(regex);
  return match ? match[1].trim() : "";
}

function extractChannelImage(xml) {
  const channelMatch = xml.match(/<image>[\s\S]*?<url>([^<]+)<\/url>/i);
  return channelMatch ? channelMatch[1] : null;
}

function extractImageUrl(html) {
  const decoded = decodeEntities(html);
  const imgRegex = /<img[^>]*?src\s*=\s*["']([^"']+)["'][^>]*?>/i;
  const match = decoded.match(imgRegex);
  return match ? match[1] : null;
}

function cleanTweetText(html) {
  let text = decodeEntities(html);
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]*>/g, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
