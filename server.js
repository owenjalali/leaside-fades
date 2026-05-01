import compression from "compression";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

const app = express();
const port = Number(process.env.PORT || 3000);
let publicBookingApiPromise;
let adminApiPromise;
let reminderJobPromise;

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const API_TIMEOUT_MS = 5000;
const DEFAULT_MAPS_URL =
  "https://www.google.com/maps/place/Leaside+Fades/@43.7137557,-79.3678747,17z/data=!3m1!4b1!4m6!3m5!1s0x89d4cd3cbeae8bc3:0xc528126035583aff!8m2!3d43.7137557!4d-79.3652998!16s%2Fg%2F11xmhwymps?entry=ttu&g_ep=EgoyMDI2MDIxNi4wIKXMDSoASAFQAw%3D%3D";
const DEFAULT_INSTAGRAM_URL =
  "https://www.instagram.com/explore/locations/108041690603158/leaside-fades/";
const DEFAULT_FACEBOOK_URL = "https://www.facebook.com/p/Leaside-FADES-100067481677284/";
const DEFAULT_BOOKING_URL = "https://leasidefades.com/book";
const DEFAULT_PHONE_E164 = "+16473482200";
const DEFAULT_PHONE_DISPLAY = "+1 (647) 348-2200";

const publicDir = path.join(__dirname, "public");
const distDir = path.join(__dirname, "dist");
const distIndexPath = path.join(distDir, "index.html");
const dataDir = path.join(__dirname, "data");
const cacheDir = process.env.VERCEL ? "/tmp" : dataDir;
const cachePath = path.join(cacheDir, "google-reviews-cache.json");
const fallbackPath = path.join(dataDir, "reviews-fallback.json");

function getPublicSiteConfig() {
  const bookingUrl = (process.env.SITE_BOOKING_URL || DEFAULT_BOOKING_URL).trim();
  const bookingEnabled = /^https?:\/\//i.test(bookingUrl) || bookingUrl.startsWith("/");

  return {
    businessName: process.env.SITE_BUSINESS_NAME || "Leaside Fades",
    googleMapsUrl: process.env.SITE_GOOGLE_MAPS_URL || DEFAULT_MAPS_URL,
    instagramUrl: process.env.SITE_INSTAGRAM_URL || DEFAULT_INSTAGRAM_URL,
    facebookUrl: process.env.SITE_FACEBOOK_URL || DEFAULT_FACEBOOK_URL,
    phoneE164: process.env.SITE_PHONE_E164 || DEFAULT_PHONE_E164,
    phoneDisplay: process.env.SITE_PHONE_DISPLAY || DEFAULT_PHONE_DISPLAY,
    bookingUrl: bookingEnabled ? bookingUrl : "",
    bookingEnabled,
    bookingNotice:
      process.env.SITE_BOOKING_NOTICE ||
      "Book online with Leaside Fades.",
  };
}

function loadPublicBookingApi() {
  publicBookingApiPromise ??= import("./src/server/public-booking/api.ts");
  return publicBookingApiPromise;
}

function loadAdminApi() {
  adminApiPromise ??= import("./src/server/admin/api.ts");
  return adminApiPromise;
}

function loadReminderJob() {
  reminderJobPromise ??= import("./src/server/notifications/reminder-job-runner.ts");
  return reminderJobPromise;
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function sendPublicBookingError(error, res, next) {
  try {
    const publicBookingApi = await loadPublicBookingApi();
    const httpError = publicBookingApi.toPublicBookingHttpError(error);
    return res.status(httpError.status).json(httpError.body);
  } catch {
    return next(error);
  }
}

function attachMapsUrl(data) {
  const siteConfig = getPublicSiteConfig();
  return {
    ...data,
    googleMapsUrl: siteConfig.googleMapsUrl || data.googleMapsUrl || "",
  };
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function sendReactBookingApp(_req, res) {
  try {
    await fs.access(distIndexPath);
    return res.sendFile(distIndexPath);
  } catch {
    return res.status(503).send("Booking app build is missing. Run npm run build before using this route.");
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

function isFreshCache(cache) {
  if (!cache?.fetchedAt || !cache?.data) return false;
  const ageMs = Date.now() - Number(cache.fetchedAt);
  return ageMs >= 0 && ageMs < CACHE_TTL_MS;
}

function normalizeGoogleResponse(payload) {
  const result = payload?.result ?? {};
  const reviews = Array.isArray(result.reviews) ? result.reviews : [];

  const normalizedReviews = reviews
    .map((review) => ({
      authorName: review.author_name ?? "Anonymous",
      authorUrl: review.author_url ?? "",
      profilePhotoUrl: review.profile_photo_url ?? "",
      rating: Number(review.rating ?? 0),
      text: (review.text ?? "").trim(),
      relativeTimeDescription: review.relative_time_description ?? "",
      publishTime: Number(review.time ?? 0),
    }))
    .filter((review) => review.rating > 0 && review.text.length > 0)
    .sort((a, b) => b.publishTime - a.publishTime);

  return {
    businessName: result.name ?? "Leaside Fades",
    overallRating: Number(result.rating ?? 0),
    totalReviews: Number(result.user_ratings_total ?? 0),
    googleMapsUrl: result.url ?? "",
    reviews: normalizedReviews,
  };
}

async function fetchGoogleReviewsFromApi() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID");
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "name,rating,user_ratings_total,url,reviews",
    language: "en",
    reviews_sort: "newest",
    key: apiKey,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
      { signal: controller.signal },
    );

    if (!response.ok) {
      throw new Error(`Google API request failed with ${response.status}`);
    }

    const payload = await response.json();
    if (payload.status !== "OK") {
      throw new Error(
        `Google Places API error: ${payload.status}${
          payload.error_message ? ` (${payload.error_message})` : ""
        }`,
      );
    }

    return normalizeGoogleResponse(payload);
  } finally {
    clearTimeout(timeout);
  }
}

app.disable("x-powered-by");
app.use(compression());
app.use(express.json({ limit: "100kb" }));
app.use(
  express.static(publicDir, {
    maxAge: "7d",
    etag: true,
    index: false,
  }),
);

app.use(
  "/assets",
  express.static(path.join(distDir, "assets"), {
    maxAge: "7d",
    etag: true,
    index: false,
  }),
);

app.get(/^\/assets\/index-[^/]+\.(?:js|css)$/, (req, res, next) => {
  res.sendFile(path.join(distDir, req.path), (error) => {
    if (error) next();
  });
});

app.get("/api/google-reviews", async (_req, res) => {
  const cached = await readJsonFile(cachePath);

  if (isFreshCache(cached)) {
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return res.json({
      source: "cache",
      fetchedAt: cached.fetchedAt,
      stale: false,
      ...attachMapsUrl(cached.data),
    });
  }

  try {
    const freshData = await fetchGoogleReviewsFromApi();
    const nextCache = {
      fetchedAt: Date.now(),
      data: freshData,
    };

    try {
      await writeJsonFile(cachePath, nextCache);
    } catch {
      // Non-fatal in serverless/read-only environments.
    }

    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return res.json({
      source: "google_places_api",
      fetchedAt: nextCache.fetchedAt,
      stale: false,
      ...attachMapsUrl(freshData),
    });
  } catch (error) {
    if (cached?.data) {
      res.set(
        "Cache-Control",
        "public, max-age=120, stale-while-revalidate=600, must-revalidate",
      );
      return res.status(200).json({
        source: "stale_cache_fallback",
        fetchedAt: cached.fetchedAt,
        stale: true,
        warning: "Live Google reviews are temporarily unavailable.",
        ...attachMapsUrl(cached.data),
      });
    }

    const fallback = await readJsonFile(fallbackPath);
    if (fallback) {
      res.set("Cache-Control", "no-store");
      return res.status(200).json({
        source: "local_fallback",
        fetchedAt: Date.now(),
        stale: true,
        warning: "Live Google reviews are temporarily unavailable.",
        ...attachMapsUrl(fallback),
      });
    }

    return res.status(503).json({
      source: "error",
      stale: true,
      message: "Google reviews service is currently unavailable.",
      details: error instanceof Error ? error.message : "Unknown error",
      reviews: [],
    });
  }
});

app.get("/api/review-avatar", async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url : "";

  if (!rawUrl) {
    return res.status(400).json({ message: "Missing avatar URL." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ message: "Invalid avatar URL." });
  }

  const allowedHosts = new Set([
    "lh3.googleusercontent.com",
    "lh4.googleusercontent.com",
    "lh5.googleusercontent.com",
    "lh6.googleusercontent.com",
    "lh.googleusercontent.com",
  ]);

  if (parsedUrl.protocol !== "https:" || !allowedHosts.has(parsedUrl.hostname)) {
    return res.status(400).json({ message: "Avatar host is not allowed." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      return res.status(502).json({ message: "Failed to fetch avatar image." });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return res.status(415).json({ message: "Avatar response is not an image." });
    }

    const body = Buffer.from(await response.arrayBuffer());

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=86400");
    res.send(body);
  } catch {
    return res.status(502).json({ message: "Avatar service is unavailable." });
  } finally {
    clearTimeout(timeout);
  }
});

app.get("/api/site-config", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json(getPublicSiteConfig());
});

app.get(
  "/api/jobs/send-reminders",
  asyncRoute(async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return res.status(503).json({ error: "CRON_SECRET is required before production reminder jobs can run." });
    }

    if (req.get("authorization") !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const reminderJob = await loadReminderJob();
    const result = await reminderJob.runConfiguredBookingReminderJob();
    return res.json({ ok: true, result });
  }),
);

app.get(
  "/api/booking/catalog",
  asyncRoute(async (_req, res, next) => {
    try {
      const publicBookingApi = await loadPublicBookingApi();
      const catalog = await publicBookingApi.getPublicBookingCatalog();
      res.set("Cache-Control", "no-store");
      return res.json(catalog);
    } catch (error) {
      return sendPublicBookingError(error, res, next);
    }
  }),
);

app.post(
  "/api/admin/auth/login",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminLogin(req, res, next);
  }),
);

app.post(
  "/api/admin/auth/logout",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminLogout(req, res, next);
  }),
);

app.post(
  "/api/admin/auth/forgot-password",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminForgotPassword(req, res, next);
  }),
);

app.post(
  "/api/admin/auth/reset-password",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminResetPassword(req, res, next);
  }),
);

app.post(
  "/api/admin/auth/accept-invite",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminAcceptInvite(req, res, next);
  }),
);

app.post(
  "/api/admin/team/barbers",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminCreateBarber(req, res, next);
  }),
);

app.post(
  "/api/admin/team/barbers/:barberId/deactivate",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminDeactivateBarber(req, res, next);
  }),
);

app.get(
  "/api/admin/auth/session",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminSession(req, res, next);
  }),
);

app.get(
  "/api/admin/bookings",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminBookings(req, res, next);
  }),
);

app.get(
  "/api/admin/dashboard",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminDashboard(req, res, next);
  }),
);

app.get(
  "/api/admin/calendar/options",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminCalendarOptions(req, res, next);
  }),
);

app.get(
  "/api/admin/availability",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminAvailability(req, res, next);
  }),
);

app.get(
  "/api/admin/bookings/:bookingId",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminBookingDetail(req, res, next);
  }),
);

app.post(
  "/api/admin/bookings",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminCreateManualBooking(req, res, next);
  }),
);

app.post(
  "/api/admin/bookings/walk-in",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminCreateWalkInBooking(req, res, next);
  }),
);

app.post(
  "/api/admin/bookings/:bookingId/cancel",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminCancelBooking(req, res, next);
  }),
);

app.post(
  "/api/admin/bookings/:bookingId/no-show",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminNoShowBooking(req, res, next);
  }),
);

app.post(
  "/api/admin/bookings/:bookingId/reschedule",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminRescheduleBooking(req, res, next);
  }),
);

app.get(
  "/api/admin/schedule",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminSchedule(req, res, next);
  }),
);

app.post(
  "/api/admin/schedule/shifts",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminCreateShift(req, res, next);
  }),
);

app.post(
  "/api/admin/schedule/shifts/:shiftId",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminUpdateShift(req, res, next);
  }),
);

app.post(
  "/api/admin/schedule/shifts/:shiftId/deactivate",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminDeactivateShift(req, res, next);
  }),
);

app.post(
  "/api/admin/schedule/shift-overrides",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminCreateShiftOverride(req, res, next);
  }),
);

app.post(
  "/api/admin/schedule/shift-overrides/:overrideId",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminUpdateShiftOverride(req, res, next);
  }),
);

app.post(
  "/api/admin/schedule/shift-overrides/:overrideId/delete",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminDeleteShiftOverride(req, res, next);
  }),
);

app.post(
  "/api/admin/schedule/blocked-times",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminCreateBlockedTime(req, res, next);
  }),
);

app.post(
  "/api/admin/schedule/blocked-times/:blockedTimeId",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminUpdateBlockedTime(req, res, next);
  }),
);

app.post(
  "/api/admin/schedule/blocked-times/:blockedTimeId/delete",
  asyncRoute(async (req, res, next) => {
    const adminApi = await loadAdminApi();
    return adminApi.handleAdminDeleteBlockedTime(req, res, next);
  }),
);

app.get(
  "/api/booking/availability",
  asyncRoute(async (req, res, next) => {
    try {
      const publicBookingApi = await loadPublicBookingApi();
      const availability = await publicBookingApi.getPublicBookingAvailability(req.query);
      res.set("Cache-Control", "no-store");
      return res.json(availability);
    } catch (error) {
      return sendPublicBookingError(error, res, next);
    }
  }),
);

app.get(
  "/api/booking/manage/:token",
  asyncRoute(async (req, res, next) => {
    try {
      const publicBookingApi = await loadPublicBookingApi();
      const booking = await publicBookingApi.getCustomerManagedBookingFromToken(req.params.token);
      res.set("Cache-Control", "no-store");
      return res.json({ booking });
    } catch (error) {
      return sendPublicBookingError(error, res, next);
    }
  }),
);

app.post(
  "/api/booking/manage/:token/cancel",
  asyncRoute(async (req, res, next) => {
    try {
      const publicBookingApi = await loadPublicBookingApi();
      const booking = await publicBookingApi.cancelCustomerManagedBookingFromToken(req.params.token);
      res.set("Cache-Control", "no-store");
      return res.json({ booking });
    } catch (error) {
      return sendPublicBookingError(error, res, next);
    }
  }),
);

app.get(
  "/api/booking/manage/:token/availability",
  asyncRoute(async (req, res, next) => {
    try {
      const publicBookingApi = await loadPublicBookingApi();
      const availability = await publicBookingApi.getCustomerManagedBookingAvailability(
        req.params.token,
        req.query,
      );
      res.set("Cache-Control", "no-store");
      return res.json(availability);
    } catch (error) {
      return sendPublicBookingError(error, res, next);
    }
  }),
);

app.post(
  "/api/booking/manage/:token/reschedule",
  asyncRoute(async (req, res, next) => {
    try {
      const publicBookingApi = await loadPublicBookingApi();
      const booking = await publicBookingApi.rescheduleCustomerManagedBookingFromBody(
        req.params.token,
        req.body,
      );
      res.set("Cache-Control", "no-store");
      return res.json({ booking });
    } catch (error) {
      return sendPublicBookingError(error, res, next);
    }
  }),
);

app.post(
  "/api/booking/bookings",
  asyncRoute(async (req, res, next) => {
    try {
      const publicBookingApi = await loadPublicBookingApi();
      const booking = await publicBookingApi.createPublicBookingFromBody(req.body);
      res.set("Cache-Control", "no-store");
      return res.status(201).json(booking);
    } catch (error) {
      return sendPublicBookingError(error, res, next);
    }
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

app.get(/^\/booking(?:\/.*)?$/, asyncRoute(sendReactBookingApp));

app.get(/^\/book(?:\/.*)?$/, asyncRoute(sendReactBookingApp));

app.get(/^\/admin(?:\/.*)?$/, asyncRoute(sendReactBookingApp));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).json({ message: "Service is currently unavailable." });
});

if (isDirectRun) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Leaside Fades site running at http://localhost:${port}`);
  });
}

export default app;
