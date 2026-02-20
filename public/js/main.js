const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.getElementById("main-nav");
const yearNode = document.getElementById("year");

if (yearNode) {
  yearNode.textContent = String(new Date().getFullYear());
}

if (menuToggle && mainNav) {
  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!expanded));
    mainNav.classList.toggle("is-open", !expanded);
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menuToggle.setAttribute("aria-expanded", "false");
      mainNav.classList.remove("is-open");
    });
  });
}

const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const panels = {
  men: document.getElementById("panel-men"),
  ladies: document.getElementById("panel-ladies"),
  boys: document.getElementById("panel-boys"),
};

function switchPanel(nextPanelKey) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.panel === nextPanelKey;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  Object.entries(panels).forEach(([key, panel]) => {
    const isActive = key === nextPanelKey;
    if (!panel) return;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchPanel(button.dataset.panel || "men");
  });
});

function getTorontoTimeParts() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: lookup.weekday,
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
  };
}

function updateOpenStatusChip() {
  const node = document.getElementById("open-status-chip");
  if (!node) return;

  const weekdayOrder = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const schedule = {
    Monday: { open: 10, close: 19 },
    Tuesday: { open: 10, close: 19 },
    Wednesday: { open: 10, close: 19 },
    Thursday: { open: 10, close: 19 },
    Friday: { open: 10, close: 19 },
    Saturday: { open: 10, close: 19 },
  };

  const { weekday, hour, minute } = getTorontoTimeParts();
  const hours = schedule[weekday];
  const todayIndex = weekdayOrder.indexOf(weekday);
  if (todayIndex < 0) return;

  const formatHour = (hour24) => {
    if (hour24 === 0) return "12 a.m.";
    if (hour24 < 12) return `${hour24} a.m.`;
    if (hour24 === 12) return "12 p.m.";
    return `${hour24 - 12} p.m.`;
  };

  const getNextOpening = () => {
    for (let offset = 1; offset <= weekdayOrder.length; offset += 1) {
      const nextDay = weekdayOrder[(todayIndex + offset) % weekdayOrder.length];
      const nextHours = schedule[nextDay];
      if (nextHours) {
        return { day: nextDay, hours: nextHours, offset };
      }
    }
    return null;
  };

  const setChip = (isOpen, text) => {
    node.classList.toggle("is-closed", !isOpen);
    node.textContent = text;
  };

  if (!hours) {
    const nextOpening = getNextOpening();
    if (!nextOpening) {
      setChip(false, "Closed today.");
      return;
    }

    const dayLabel = nextOpening.offset === 1 ? "tomorrow" : nextOpening.day;
    setChip(false, `Closed today. Opens ${dayLabel} at ${formatHour(nextOpening.hours.open)}.`);
    return;
  }

  const nowMinutes = hour * 60 + minute;
  const openMinutes = hours.open * 60;
  const closeMinutes = hours.close * 60;
  const isOpen = nowMinutes >= openMinutes && nowMinutes < closeMinutes;

  if (isOpen) {
    setChip(true, "Open today");
    return;
  }

  if (nowMinutes < openMinutes) {
    setChip(false, `Closed today. Opens at ${formatHour(hours.open)}.`);
    return;
  }

  const nextOpening = getNextOpening();
  if (!nextOpening) {
    setChip(false, "Closed today.");
    return;
  }

  const dayLabel = nextOpening.offset === 1 ? "tomorrow" : nextOpening.day;
  setChip(false, `Closed today. Opens ${dayLabel} at ${formatHour(nextOpening.hours.open)}.`);
}

function withTimeout(promiseFactory, ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  return promiseFactory(controller.signal).finally(() => clearTimeout(timeout));
}

async function fetchSiteConfig() {
  return withTimeout(async (signal) => {
    const response = await fetch("/api/site-config", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Site config request failed with ${response.status}`);
    }

    return response.json();
  }, 5000);
}

function applySiteConfig(config) {
  if (!config || typeof config !== "object") return;

  const googleMapsUrl = config.googleMapsUrl;
  const instagramUrl = config.instagramUrl;
  const facebookUrl = config.facebookUrl;
  const phoneE164 = config.phoneE164;
  const bookingEnabled = Boolean(config.bookingEnabled && config.bookingUrl);
  const bookingUrl = config.bookingUrl;
  const bookingNotice = config.bookingNotice;

  if (googleMapsUrl) {
    document.querySelectorAll("[data-maps-link]").forEach((link) => {
      link.setAttribute("href", googleMapsUrl);
    });
  }

  if (instagramUrl) {
    document.querySelectorAll("[data-instagram-link]").forEach((link) => {
      link.setAttribute("href", instagramUrl);
    });
  }

  if (facebookUrl) {
    document.querySelectorAll("[data-facebook-link]").forEach((link) => {
      link.setAttribute("href", facebookUrl);
    });
  }

  if (phoneE164) {
    const phoneHref = `tel:${phoneE164}`;
    document.querySelectorAll("[data-phone-link]").forEach((link) => {
      link.setAttribute("href", phoneHref);
    });
  }

  const bookingNoteNode = document.querySelector("[data-booking-note]");
  document.querySelectorAll("[data-online-booking]").forEach((link) => {
    if (bookingEnabled) {
      link.setAttribute("href", bookingUrl);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
      link.textContent = "Book Online";
      if (bookingNoteNode) {
        bookingNoteNode.textContent = "Online booking is now live.";
      }
      return;
    }

    link.setAttribute("href", "#booking-coming-soon");
    link.removeAttribute("target");
    link.removeAttribute("rel");
    link.textContent = "Book Online (Fresha Soon)";
  });

  if (!bookingEnabled && bookingNoteNode && bookingNotice) {
    bookingNoteNode.textContent = bookingNotice;
  }
}

async function initSiteConfig() {
  try {
    const config = await fetchSiteConfig();
    applySiteConfig(config);
  } catch {
    // Keep static fallback values already present in HTML.
  }
}

updateOpenStatusChip();
setInterval(updateOpenStatusChip, 60_000);
initSiteConfig();
