(function () {

//  State
  const state = {
    feeds: [],
    userFeedIndex: 0,
    activeMode: "my",
    activeFilterText: "",
    activeTags: new Set(),
    allTweets: [],
    filteredTweets: [],
    currentPage: 1,
    tweetsPerPage: 5,
    loading: false,
  };


//  DOM references
  const $ = (sel) => document.querySelector(sel);
  const dom = {
    app: $("#app"),
    modeTabs: $("#mode-tabs"),
    tabMy: $("#tab-my"),
    tabCommunity: $("#tab-community"),
    filterInput: $("#filter-input"),
    addFilterBtn: $("#add-filter-btn"),
    tagChips: $("#tag-chips"),
    tweetList: $("#tweet-list"),
    pagination: $("#pagination"),
    loading: $("#loading-indicator"),
    error: $("#error-message"),
    activityDot: $("#activity-dot"),
  };


//  Initialisation
  function init() {
    parseConfig();
    if (state.feeds.length === 0) {
      showError(
        "No feed configured. Add ?feed= or ?feeds= with RSSHub URL(s).",
      );
      return;
    }

    if (state.feeds.length === 1) {
      state.activeMode = "my";
      dom.modeTabs.classList.add("hidden");
    } else {
      applyModeTabState();
      dom.modeTabs.classList.remove("hidden");
    }

    const urlFilter = new URLSearchParams(window.location.search).get("filter");
    if (urlFilter) {
      urlFilter.split(",").forEach((tag) => {
        const trimmed = tag.trim().toLowerCase();
        if (trimmed) state.activeTags.add(trimmed);
      });
    }
    renderTagChips();

    dom.tabMy.addEventListener("click", () => switchMode("my"));
    dom.tabCommunity.addEventListener("click", () => switchMode("community"));
    dom.filterInput.addEventListener("input", debounce(onFilterInput, 250));
    dom.addFilterBtn.addEventListener("click", addChipFromInput);
    dom.filterInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addChipFromInput();
      }
    });

    applyTheme();
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", applyTheme);

    fetchAllFeeds();
  }

//  Configuration parsing
  function parseConfig() {
    const params = new URLSearchParams(window.location.search);
    const feed = params.get("feed");
    const feeds = params.get("feeds");
    const mode = params.get("mode");

    if (feeds) {
      state.feeds = feeds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (feed) {
      state.feeds = [feed.trim()];
    } else {
      state.feeds = [];
    }

    if (state.feeds.length === 1) {
      state.activeMode = "my";
    } else if (mode === "multi" || mode === "community") {
      state.activeMode = "community";
    } else {
      state.activeMode = "my";
    }
  }

 //  Fetch logic
  async function fetchAllFeeds() {
    setLoading(true);
    state.allTweets = [];

    const fetchPromises = state.feeds.map((feedUrl, idx) =>
      fetch(`/api/rss?url=${encodeURIComponent(feedUrl)}`)
        .then((r) => r.json())
        .then((tweets) => tweets.map((t) => ({ ...t, sourceFeed: idx })))
        .catch((err) => {
          console.error(`Failed to fetch feed ${idx}:`, err);
          return [];
        }),
    );

    const results = await Promise.allSettled(fetchPromises);
    results.forEach((res) => {
      if (res.status === "fulfilled") {
        state.allTweets = state.allTweets.concat(res.value);
      }
    });

    state.allTweets.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );

    checkActivity();
    applyFilterAndPaginate();
    setLoading(false);
  }

//  Filtering & Mode
  function applyFilterAndPaginate() {
    let tweets = [...state.allTweets];

  if (state.activeMode === "my") {
    tweets = tweets.filter((t) => t.sourceFeed === state.userFeedIndex);
  }

  if (state.activeTags.size > 0) {
    tweets = tweets.filter((t) => {
      const lower = t.text.toLowerCase();
      return Array.from(state.activeTags).some((tag) => lower.includes(tag));
    });
  }

  if (state.activeFilterText.trim()) {
    const query = state.activeFilterText.trim().toLowerCase();
    tweets = tweets.filter((t) => t.text.toLowerCase().includes(query));
  }

  state.filteredTweets = tweets;
  state.currentPage = 1;

  updateURL();

  renderView();
}

  function onFilterInput(e) {
    state.activeFilterText = e.target.value;
    applyFilterAndPaginate();
  }

  function addChipFromInput() {
    const value = dom.filterInput.value.trim().toLowerCase();
    if (!value) return;
    state.activeTags.add(value);
    dom.filterInput.value = "";
    state.activeFilterText = "";
    renderTagChips();
    applyFilterAndPaginate();
  }

  function switchMode(mode) {
    state.activeMode = mode;
    applyModeTabState();
    applyFilterAndPaginate();
  }

  function applyModeTabState() {
    if (state.activeMode === "my") {
      dom.tabMy.classList.add("active");
      dom.tabCommunity.classList.remove("active");
    } else {
      dom.tabCommunity.classList.add("active");
      dom.tabMy.classList.remove("active");
    }
  }

//  Tag chips rendering
  function renderTagChips() {
    dom.tagChips.innerHTML = "";
    state.activeTags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "chip active";
      chip.innerHTML = `${tag} <span class="chip-remove">&times;</span>`;
      chip.querySelector(".chip-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        state.activeTags.delete(tag);
        renderTagChips();
        applyFilterAndPaginate();
      });
      chip.addEventListener("click", () => {
        state.activeTags.delete(tag);
        renderTagChips();
        applyFilterAndPaginate();
      });
      dom.tagChips.appendChild(chip);
    });
  }

//  Pagination & rendering
  function renderView() {
    const total = state.filteredTweets.length;
    const totalPages = Math.ceil(total / state.tweetsPerPage);
    const start = (state.currentPage - 1) * state.tweetsPerPage;
    const pageTweets = state.filteredTweets.slice(
      start,
      start + state.tweetsPerPage,
    );

    dom.tweetList.innerHTML = "";
    if (pageTweets.length === 0) {
      dom.tweetList.innerHTML =
        '<div style="text-align:center;padding:20px;">No tweets found</div>';
    } else {
      pageTweets.forEach((tweet) =>
        dom.tweetList.appendChild(createTweetCard(tweet)),
      );
    }

    renderPagination(totalPages);

    if (totalPages <= 1) {
      dom.pagination.classList.add("hidden");
    } else {
      dom.pagination.classList.remove("hidden");
    }
  }

  function renderPagination(totalPages) {
    dom.pagination.innerHTML = "";
    const prev = document.createElement("button");
    prev.className = "page-btn";
    prev.textContent = "‹ Prev";
    prev.disabled = state.currentPage <= 1;
    prev.addEventListener("click", () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderView();
      }
    });
    dom.pagination.appendChild(prev);

    const maxVisible = 5;
    let startPage = Math.max(1, state.currentPage - Math.floor(maxVisible / 2));
    let endPage = startPage + maxVisible - 1;
    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement("button");
      btn.className = "page-btn" + (i === state.currentPage ? " active" : "");
      btn.textContent = i;
      btn.addEventListener("click", () => {
        state.currentPage = i;
        renderView();
      });
      dom.pagination.appendChild(btn);
    }

    const next = document.createElement("button");
    next.className = "page-btn";
    next.textContent = "Next ›";
    next.disabled = state.currentPage >= totalPages;
    next.addEventListener("click", () => {
      if (state.currentPage < totalPages) {
        state.currentPage++;
        renderView();
      }
    });
    dom.pagination.appendChild(next);
  }

//  Tweet card creation
  function createTweetCard(tweet) {
    const card = document.createElement("div");
    card.className = "tweet-card";

    const author = document.createElement("div");
    author.className = "tweet-author";

    const avatar = document.createElement("img");
    avatar.className = "tweet-avatar";
    avatar.src = tweet.avatarUrl || "";
    avatar.alt = tweet.authorHandle;
    avatar.onerror = () => {
      avatar.src = "";
    };
    author.appendChild(avatar);

    const info = document.createElement("div");
    info.className = "tweet-author-info";

    const name = document.createElement("span");
    name.className = "tweet-author-name";
    name.textContent = tweet.authorName || tweet.authorHandle;
    info.appendChild(name);

    const handle = document.createElement("span");
    handle.className = "tweet-author-handle";
    handle.textContent = tweet.authorHandle;
    info.appendChild(handle);

    const time = document.createElement("span");
    time.className = "tweet-timestamp";
    time.textContent = relativeTime(tweet.createdAt);
    info.appendChild(time);

    author.appendChild(info);
    card.appendChild(author);

    const text = document.createElement("div");
    text.className = "tweet-text";
    text.textContent = tweet.text;
    card.appendChild(text);

    if (tweet.imageUrl) {
      const img = document.createElement("img");
      img.className = "tweet-image";
      img.src = tweet.imageUrl;
      img.alt = "Tweet image";
      img.onerror = () => {
        img.style.display = "none";
      };
      card.appendChild(img);
    }

    const link = document.createElement("a");
    link.className = "tweet-link";
    link.href = tweet.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View on X";
    card.appendChild(link);

    return card;
  }

//  Relative time helper
  function relativeTime(isoString) {
    const now = new Date();
    const then = new Date(isoString);
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return "now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    return then.toLocaleDateString();
  }

//  Activity dot
  function checkActivity() {
    if (state.feeds.length === 0) return;
    const ownerTweets = state.allTweets.filter(
      (t) => t.sourceFeed === state.userFeedIndex,
    );
    if (ownerTweets.length === 0) return;
    const latest = new Date(ownerTweets[0].createdAt);
    const hoursAgo = (Date.now() - latest.getTime()) / (1000 * 60 * 60);
    if (hoursAgo <= 24) {
      dom.activityDot.classList.remove("hidden");
    } else {
      dom.activityDot.classList.add("hidden");
    }
  }

//  Theme detection
  function applyTheme() {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    dom.app.classList.toggle("dark-mode", isDark);
    dom.app.classList.toggle("light-mode", !isDark);
  }

//  Loading & Error UI
  function setLoading(loading) {
    state.loading = loading;
    dom.loading.classList.toggle("hidden", !loading);
    dom.tweetList.classList.toggle("hidden", loading);
    dom.pagination.classList.toggle("hidden", loading);
  }

  function showError(msg) {
    dom.error.textContent = msg;
    dom.error.classList.remove("hidden");
  }

//  Debounce utility
  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function updateURL() {
    const params = new URLSearchParams();

    // Always include feed/feeds
    if (state.feeds.length === 1) {
      params.set("feed", state.feeds[0]);
    } else if (state.feeds.length > 1) {
      params.set("feeds", state.feeds.join(","));
    }

    // Mode
    if (state.feeds.length > 1 && state.activeMode === "community") {
      params.set("mode", "multi");
    }

    // Active tags
    if (state.activeTags.size > 0) {
      params.set("filter", Array.from(state.activeTags).join(","));
    }

    const newUrl = window.location.pathname + "?" + params.toString();
    window.history.replaceState(null, "", newUrl);
  }

//  Start
  window.addEventListener("DOMContentLoaded", init);
})();
