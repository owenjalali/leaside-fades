const REVIEWS_API = "/api/google-reviews";
const MAX_REVIEWS = 6;

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof text === "string") node.textContent = text;
  return node;
}

function initials(name) {
  return (name || "A")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function createAvatar(photoUrl, authorName) {
  if (photoUrl) {
    const image = createElement("img", "avatar");
    image.src = photoUrl;
    image.alt = `${authorName} profile photo`;
    image.loading = "lazy";
    image.decoding = "async";
    image.width = 40;
    image.height = 40;
    return image;
  }

  const fallback = createElement("div", "avatar", initials(authorName));
  fallback.setAttribute("aria-hidden", "true");
  fallback.style.display = "grid";
  fallback.style.placeItems = "center";
  fallback.style.fontWeight = "800";
  fallback.style.color = "#27402a";
  return fallback;
}

function renderReviewCard(review) {
  const card = createElement("article", "review-card");

  const authorRow = createElement("div", "author-row");
  authorRow.append(createAvatar(review.profilePhotoUrl, review.authorName));

  const identityWrap = createElement("div");
  identityWrap.append(createElement("p", "author-name", review.authorName || "Google User"));
  identityWrap.append(
    createElement(
      "p",
      "meta",
      review.relativeTimeDescription ? `${review.relativeTimeDescription} • Google` : "Google Review",
    ),
  );
  authorRow.append(identityWrap);

  const safeRating = Math.max(1, Math.min(5, Number(review.rating || 0)));
  const stars = createElement("p", "stars", "★".repeat(safeRating) + "☆".repeat(5 - safeRating));
  const text = createElement("p", "text", review.text || "No review text available.");

  card.append(authorRow, stars, text);
  return card;
}

function renderFallbackCards(container) {
  const messages = [
    "Great neighborhood shop. Always consistent cuts and friendly service.",
    "Very detail-oriented fade work and clean beard lining every visit.",
    "Reliable booking and a professional atmosphere from start to finish.",
  ];

  container.replaceChildren(
    ...messages.map((message, index) =>
      renderReviewCard({
        authorName: `Client ${index + 1}`,
        profilePhotoUrl: "",
        rating: 5,
        text: message,
        relativeTimeDescription: "recently",
      }),
    ),
  );
}

async function fetchReviews() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(REVIEWS_API, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Reviews API responded with ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function updateTrustMetrics(data) {
  const ratingNode = document.getElementById("google-rating-value");
  const reviewCountNode = document.getElementById("google-review-count");

  if (ratingNode) {
    ratingNode.textContent =
      typeof data.overallRating === "number" && data.overallRating > 0
        ? `${data.overallRating.toFixed(1)} / 5`
        : "Trusted Locally";
  }

  if (reviewCountNode) {
    reviewCountNode.textContent =
      typeof data.totalReviews === "number" && data.totalReviews > 0
        ? `${data.totalReviews}+ Google reviews`
        : "Google reviews loading";
  }
}

async function hydrateReviews() {
  const reviewsSection = document.getElementById("reviews");
  const reviewsGrid = document.getElementById("reviews-grid");
  const metaText = document.getElementById("reviews-meta-text");
  const reviewLink = document.getElementById("google-review-link");

  if (!reviewsSection || !reviewsGrid || !metaText || !reviewLink) return;

  try {
    const data = await fetchReviews();
    const list = Array.isArray(data.reviews) ? data.reviews.slice(0, MAX_REVIEWS) : [];

    if (list.length > 0) {
      reviewsGrid.replaceChildren(...list.map(renderReviewCard));
    } else {
      renderFallbackCards(reviewsGrid);
    }

    if (data.googleMapsUrl) {
      reviewLink.href = data.googleMapsUrl;
    }

    if (data.source === "google_places_api") {
      metaText.textContent = "Live Google reviews loaded.";
    } else if (data.source === "cache") {
      metaText.textContent = "Cached Google reviews (updated within 12 hours).";
    } else {
      metaText.textContent =
        "Live reviews temporarily unavailable. Showing cached or fallback reviews.";
    }

    updateTrustMetrics(data);
  } catch {
    renderFallbackCards(reviewsGrid);
    metaText.textContent = "Review service temporarily unavailable. Showing sample client feedback.";
    updateTrustMetrics({ overallRating: 0, totalReviews: 0 });
  }
}

function initLazyReviewLoad() {
  const section = document.getElementById("reviews");
  if (!section) return;

  if (!("IntersectionObserver" in window)) {
    hydrateReviews();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        hydrateReviews();
      }
    },
    { rootMargin: "250px 0px" },
  );

  observer.observe(section);
}

initLazyReviewLoad();
