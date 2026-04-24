import { Router } from "express";

const router = Router();

/**
 * Server-side proxy for Google Maps APIs so we can keep the key out of the
 * mobile bundle AND let the ASL/Evacuation features reach the same endpoint
 * without duplicating HTTP code client-side.
 */
router.post("/directions", async (req, res) => {
  try {
    const { origin, destination, mode = "walking" } = req.body || {};
    if (!origin || !destination) return res.status(400).json({ error: "origin and destination required" });
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return res.json({ demo: true, ...demoDirections(origin, destination, mode) });
    }
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", coordString(origin));
    url.searchParams.set("destination", coordString(destination));
    url.searchParams.set("mode", mode);
    url.searchParams.set("key", key);
    const r = await fetch(url);
    const data = await r.json();
    const primary = data.routes?.[0];
    res.json({
      summary: primary?.summary || null,
      distance: primary?.legs?.[0]?.distance || null,
      duration: primary?.legs?.[0]?.duration || null,
      steps: (primary?.legs?.[0]?.steps || []).map((s) => ({
        html: s.html_instructions,
        distance: s.distance,
        duration: s.duration,
        start: s.start_location,
        end: s.end_location,
      })),
      polyline: primary?.overview_polyline?.points || null,
      status: data.status,
    });
  } catch (err) {
    console.error("[/api/maps/directions]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/reverse-geocode", async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    if (typeof lat !== "number" || typeof lng !== "number") return res.status(400).json({ error: "lat and lng required" });
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.json({ demo: true, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("key", key);
    const r = await fetch(url);
    const data = await r.json();
    res.json({
      address: data.results?.[0]?.formatted_address || null,
      components: data.results?.[0]?.address_components || [],
      status: data.status,
    });
  } catch (err) {
    console.error("[/api/maps/reverse-geocode]", err);
    res.status(500).json({ error: err.message });
  }
});

function coordString(p) {
  if (typeof p === "string") return p;
  if (p && typeof p.lat === "number" && typeof p.lng === "number") return `${p.lat},${p.lng}`;
  return "";
}

function demoDirections(origin, destination, mode) {
  return {
    summary: "Demo route",
    distance: { text: "0.6 mi", value: 965 },
    duration: { text: mode === "driving" ? "3 min" : "12 min", value: mode === "driving" ? 180 : 720 },
    steps: [
      { html: "Head <b>east</b> on your street",       distance: { text: "0.2 mi" }, duration: { text: "3 min" } },
      { html: "Turn <b>right</b> at the intersection", distance: { text: "0.3 mi" }, duration: { text: "6 min" } },
      { html: "Arrive at destination on the left",     distance: { text: "0.1 mi" }, duration: { text: "3 min" } },
    ],
    polyline: null,
    status: "DEMO",
  };
}

export default router;
