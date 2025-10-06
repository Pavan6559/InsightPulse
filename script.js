// ====== Configuration ======
const N8N_WEBHOOK_URL = "http://localhost:5678/webhook/d217914a-4cca-4049-bd01-0759581d687b"
const N8N_AI_CHAT_URL = "https://pavan6559.app.n8n.cloud/webhook-test/8a759c92-73f1-4411-96a1-b5a65acb9e7c"

const N8N_TRACKING_URL = ""
const N8N_TASK_URL = ""

// ====== Supabase Configuration ======
const SUPABASE_URL = 'https://axicogqtiindhiehfbuz.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4aWNvZ3F0aWluZGhpZWhmYnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NjE1NjgsImV4cCI6MjA3NTEzNzU2OH0.MoOTFZ0viqkWr_s7vDIzBgMzrx32LW_PTAWKRwCQNYQ'
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====== State ======
const state = {
  auth: null,
  query: "",
  allInsights: [],
  filtered: [],
  filters: {
    categories: new Set(),
    importance: "",
    dateRange: "",
  },
  bookmarks: new Set(),
  tracking: new Set(),
  history: [],
  savedStartups: [],
  userId: null
}

// ====== Utility Functions ======
function $(sel) {
  return document.querySelector(sel)
}

function $all(sel) {
  return Array.from(document.querySelectorAll(sel))
}

function formatDate(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}

function rankImportance(imp) {
  if (imp === "High") return 3
  if (imp === "Medium") return 2
  if (imp === "Low") return 1
  return 0
}

function withinRange(ts, range) {
  if (!range) return true
  const now = Date.now()
  const t = new Date(ts).getTime()
  if (isNaN(t)) return true
  const day = 24 * 60 * 60 * 1000
  if (range === "24h") return now - t <= day
  if (range === "week") return now - t <= 7 * day
  if (range === "month") return now - t <= 30 * day
  return true
}

function show(el) {
  el.classList.remove("hidden")
}

function hide(el) {
  el.classList.add("hidden")
}

function toast(msg) {
  const el = $("#toast")
  $("#toastMsg").textContent = msg
  show(el)
  setTimeout(() => hide(el), 2000)
}

function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m],
  )
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;")
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ====== Persistence Functions ======
function persist() {
  localStorage.setItem("ip_history", JSON.stringify(state.history));
  localStorage.setItem("ip_saved", JSON.stringify(state.savedStartups));
  localStorage.setItem("ip_bookmarks", JSON.stringify(Array.from(state.bookmarks)));
  localStorage.setItem("ip_tracking", JSON.stringify(Array.from(state.tracking)));
}

function loadPersisted() {
  try {
    state.history = JSON.parse(localStorage.getItem("ip_history")) || []
    state.savedStartups = JSON.parse(localStorage.getItem("ip_saved")) || []
    const bm = JSON.parse(localStorage.getItem("ip_bookmarks")) || []
    state.bookmarks = new Set(bm)
    const tr = JSON.parse(localStorage.getItem("ip_tracking")) || []
    state.tracking = new Set(tr)
  } catch {}
}

function readAuth() {
  try {
    const auth = JSON.parse(localStorage.getItem("ip_auth"));
    console.log("🔍 readAuth found:", auth);
    
    if (auth) {
      state.userId = auth.userId || auth.email;
      state.auth = auth;
      console.log("✅ User ID set to:", state.userId);
    }
    return auth || null;
  } catch (error) {
    console.error("❌ readAuth error:", error);
    return null;
  }
}

function requireAuth() {
  const auth = readAuth();
  if (!auth) {
    window.location.href = "./login.html";
    return false;
  }
  state.auth = auth;
  state.userId = auth.userId || auth.email;
  return true;
}

// ====== Database Functions ======
async function saveStartupToDB(startupData) {
  try {
    console.log("💾 Saving full startup data to Supabase:", startupData.startup);
    
    const { data, error } = await supabaseClient
      .from('saved_startups')
      .insert([
        { 
          user_id: state.userId,
          startup_name: startupData.startup,
          logo_url: startupData.logo,
          headline: startupData.headline,
          summary: startupData.summary,
          category: startupData.category,
          importance: startupData.importance,
          source: startupData.source,
          timestamp: startupData.timestamp
        }
      ])
      .select();

    if (error) {
      console.error("❌ Supabase save error:", error);
      throw error;
    }
    
    console.log("✅ Full startup data saved to Supabase:", data);
    return data;
  } catch (error) {
    console.error("❌ Save to DB failed:", error);
    return null;
  }
}

async function removeStartupFromDB(startupName) {
  try {
    const { error } = await supabaseClient
      .from('saved_startups')
      .delete()
      .eq('user_id', state.userId)
      .eq('startup_name', startupName);

    if (error) throw error;
    console.log("🗑️ Removed startup from Supabase:", startupName);
  } catch (error) {
    console.error("❌ Remove from DB failed:", error);
  }
}

async function loadSavedFromDB() {
  try {
    console.log("📥 Loading full startup data from Supabase...");
    
    const { data, error } = await supabaseClient
      .from('saved_startups')
      .select('*')
      .eq('user_id', state.userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      state.savedStartups = data.map(item => ({
        startup: item.startup_name,
        logo: item.logo_url,
        headline: item.headline,
        summary: item.summary,
        category: item.category,
        importance: item.importance,
        source: item.source,
        timestamp: item.timestamp
      }));
      console.log("✅ Loaded full data from Supabase:", state.savedStartups);
    } else {
      console.log("ℹ️ No data in Supabase, using localStorage");
      loadFromLocalStorage();
    }
  } catch (error) {
    console.error("❌ Load from DB failed, using localStorage:", error);
    loadFromLocalStorage();
  }
}

function loadFromLocalStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem("ip_saved")) || [];
    state.savedStartups = saved;
  } catch (error) {
    console.error("❌ localStorage load failed:", error);
    state.savedStartups = [];
  }
}

// ====== Search History Functions ======
function renderHistoryDropdown(matches) {
  const list = $("#historyList")
  list.innerHTML = ""
  if (!matches.length) {
    hide(list)
    $("#searchInput").setAttribute("aria-expanded", "false")
    return
  }
  
  const header = document.createElement("div")
  header.className = "flex items-center justify-between px-3 py-2 border-b border-gray-200"
  header.innerHTML = `
    <span class="text-xs font-medium text-gray-500">Recent searches</span>
    <button type="button" class="clear-all-history text-xs text-red-600 hover:text-red-800" 
            ${state.history.length === 0 ? 'disabled' : ''}>
      Clear all
    </button>
  `
  
  header.querySelector('.clear-all-history').addEventListener("click", (e) => {
    e.stopPropagation()
    if (state.history.length > 0 && confirm("Clear all search history?")) {
      clearAllHistory()
    }
  })
  
  list.appendChild(header)
  
  matches.slice(0, 8).forEach((q) => {
    const item = document.createElement("div")
    item.className = "flex items-center justify-between px-3 py-2 hover:bg-gray-50"
    
    item.innerHTML = `
      <button type="button" class="flex-1 text-left text-sm text-gray-700 truncate" data-history-query="${escapeAttr(q)}">
        ${escapeHtml(q)}
      </button>
      <button type="button" class="remove-history-btn ml-2 rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50" 
              data-query="${escapeAttr(q)}" title="Remove from history">
        ×
      </button>
    `
    
    item.querySelector('button[data-history-query]').addEventListener("click", () => {
      $("#searchInput").value = q
      hide(list)
    })
    
    item.querySelector('.remove-history-btn').addEventListener("click", (e) => {
      e.stopPropagation()
      removeFromHistory(q)
    })
    
    list.appendChild(item)
  })
  
  show(list)
  $("#searchInput").setAttribute("aria-expanded", "true")
}

function removeFromHistory(query) {
  console.log("Removing from history:", query);
  state.history = state.history.filter(q => q !== query);
  persist();
  
  const currentInput = $("#searchInput").value.toLowerCase();
  const matches = state.history.filter(q => q.toLowerCase().includes(currentInput));
  renderHistoryDropdown(matches);
  
  toast(`Removed "${query}" from history`);
}

function clearAllHistory() {
  state.history = [];
  persist();
  renderHistoryDropdown([]);
  toast("All search history cleared");
}

function updateHistory(q) {
  const set = new Set([q, ...state.history])
  state.history = Array.from(set).slice(0, 25)
}

// ====== Rendering Functions ======
function renderUser() {
  const emailEl = $("#userEmail")
  if (state.auth?.email) emailEl.textContent = state.auth.email
}

function renderTopInsights() {
  const box = $("#topInsights")
  const list = $("#topInsightsList")
  list.innerHTML = ""
  if (!state.filtered.length) {
    hide(box)
    return
  }

  const top3 = [...state.filtered]
    .sort((a, b) => {
      const r = rankImportance(b.importance) - rankImportance(a.importance)
      if (r !== 0) return r
      return new Date(b.timestamp) - new Date(a.timestamp)
    })
    .slice(0, 3)

  top3.forEach((item) => {
    const el = document.createElement("div")
    el.className = "rounded-md border border-amber-200 bg-amber-50 p-3"
    el.innerHTML = `
      <div class="flex items-start gap-2">
        <div class="mt-1 h-2 w-2 rounded-full bg-amber-500"></div>
        <div>
          <p class="text-sm font-semibold text-gray-900">${escapeHtml(item.headline)}</p>
          <p class="text-xs text-gray-600">${escapeHtml(item.startup)} • ${escapeHtml(item.category)} • ${escapeHtml(item.importance)}</p>
        </div>
      </div>
    `
    list.appendChild(el)
  })

  show(box)
}

function badgeClass(importance) {
  if (importance === "High") return "badge badge-red"
  if (importance === "Medium") return "badge badge-amber"
  return "badge badge-gray"
}

function renderResults() {
  const container = $("#results")
  container.innerHTML = ""

  if (!state.allInsights.length) {
    show($("#emptyState"))
  } else {
    hide($("#emptyState"))
  }

  if (!state.filtered.length && state.allInsights.length) {
    const p = document.createElement("p")
    p.className = "text-sm text-gray-600"
    p.textContent = "No results match your current filters."
    container.appendChild(p)
    return
  }

  state.filtered.forEach((item) => {
    const isSaved = state.savedStartups.some(s => s.startup === item.startup);
    const card = document.createElement("article")
    card.className = "card cursor-pointer"
    card.setAttribute("tabindex", "0")
    card.innerHTML = `
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2">
          <img src="${escapeAttr(item.logo)}" alt="${escapeAttr(item.startup)} logo" 
     class="h-8 w-8 rounded bg-gray-100 object-contain" 
     onerror="this.src='https://via.placeholder.com/32/9CA3AF/FFFFFF?text=${escapeAttr(item.startup.charAt(0).toUpperCase())}'" />
          <div>
            <h4 class="text-sm font-semibold text-gray-900">${escapeHtml(item.startup)}</h4>
            <p class="text-xs text-gray-600">${escapeHtml(item.headline)}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
            <span class="${badgeClass(item.importance)}">${escapeHtml(item.importance)}</span>


            <button 
                class="save-btn rounded p-1 ${isSaved ? 'text-yellow-500' : 'text-gray-600'} hover:bg-gray-100" 
                title="${isSaved ? 'Remove from Saved' : 'Save Startup'}" 
                aria-label="${isSaved ? 'Remove from Saved' : 'Save Startup'}">
                <i class="fa${isSaved ? 's' : 'r'} fa-star"></i>
            </button>


            <button 
                class="bookmark-btn rounded p-1 text-blue-500 hover:bg-gray-100" 
                title="Bookmark" 
                aria-label="Bookmark">
                <i class="fa-regular fa-bookmark"></i>
            </button>


            <button 
                class="share-btn rounded p-1 text-green-500 hover:bg-gray-100" 
                title="Share" 
                aria-label="Share">
                <i class="fa-solid fa-share-nodes"></i>
            </button>
        </div>

      </div>
      <div class="mt-2">
        <ul class="list-disc pl-5 text-sm text-gray-700">
          ${item.summary.slice(0, 3).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
        </ul>
      </div>
      <div class="mt-3 flex items-center justify-between text-xs text-gray-600">
        <div class="flex items-center gap-2">
          <span class="rounded bg-gray-100 px-2 py-0.5">${escapeHtml(item.category)}</span>
          <time datetime="${escapeAttr(item.timestamp)}">${escapeHtml(formatDate(item.timestamp))}</time>
        </div>
        <a href="${escapeAttr(item.source)}" target="_blank" rel="noopener" class="text-teal-700 hover:underline">Source</a>
      </div>
      <div class="mt-3 flex items-center gap-2">
        <span class="text-xs text-gray-500">Track Automatically</span>
        <button class="track-toggle toggle ${state.tracking.has(item.startup) ? "toggle-on" : ""}" role="switch" aria-checked="${state.tracking.has(item.startup) ? "true" : "false"}" data-startup="${escapeAttr(item.startup)}">
          <span class="toggle-dot ${state.tracking.has(item.startup) ? "toggle-dot-on" : ""}"></span>
        </button>
      </div>
    `

    card.querySelector(".save-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const startupData = {
        startup: item.startup,
        logo: item.logo,
        headline: item.headline,
        summary: item.summary,
        category: item.category,
        importance: item.importance,
        source: item.source,
        timestamp: item.timestamp
      };
      toggleSaveStartup(startupData);
    });
    
    card.querySelector(".bookmark-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBookmark(item.source)
    })
    
    card.querySelector(".share-btn").addEventListener("click", (e) => {
      e.stopPropagation()
      console.log("[Share] to Slack/Email:", item)
      toast("Shared (demo)")
    })

    card.addEventListener("click", () => openModal(item))
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault()
        openModal(item)
      }
    })

    container.appendChild(card)
  })
}

function renderSaved() {
  try {
    const wrap = $("#savedList");
    const empty = $("#noSaved");
    
    wrap.innerHTML = "";
    
    if (!state.savedStartups || !state.savedStartups.length) {
      empty.textContent = "No saved startups yet.";
      return;
    }
    
    empty.textContent = "";
    
    state.savedStartups.forEach((startup) => {
      if (!startup || typeof startup !== 'object') {
        console.warn('Skipping invalid startup data:', startup);
        return;
      }
      
      const safeStartup = {
        startup: startup.startup || 'Unknown Startup',
        logo: startup.logo || '',
        headline: startup.headline || 'No headline available',
        importance: startup.importance || 'Medium',
        category: startup.category || 'Uncategorized',
        timestamp: startup.timestamp || new Date().toISOString(),
        summary: Array.isArray(startup.summary) ? startup.summary : []
      };
      
      const summaryItems = safeStartup.summary.slice(0, 2);
      const summaryHTML = summaryItems.length > 0 
        ? summaryItems.map((s) => `<li>${escapeHtml(String(s))}</li>`).join("")
        : '<li>No summary available</li>';
      
      const card = document.createElement("div");
      card.className = "card cursor-pointer";
      card.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2">
            <img src="${escapeAttr(safeStartup.logo)}" 
                 alt="${escapeAttr(safeStartup.startup)} logo" 
                 class="h-8 w-8 rounded bg-gray-100 object-contain"
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjOUNBM0FGIi8+Cjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0iY2VudHJhbCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMTQiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiI+${escapeAttr(safeStartup.startup.charAt(0).toUpperCase())}</dGV4dD4KPC9zdmc+'"/>
            <div>
              <h4 class="text-sm font-semibold text-gray-900">${escapeHtml(safeStartup.startup)}</h4>
              <p class="text-xs text-gray-600">${escapeHtml(safeStartup.headline)}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="${badgeClass(safeStartup.importance)}">${escapeHtml(safeStartup.importance)}</span>
            <button class="remove-btn rounded p-1 text-red-500 hover:bg-red-50" title="Remove">
              ×
            </button>
          </div>
        </div>
        <div class="mt-2">
          <ul class="list-disc pl-5 text-sm text-gray-700">
            ${summaryHTML}
          </ul>
        </div>
        <div class="mt-3 flex items-center justify-between text-xs text-gray-600">
          <span class="rounded bg-gray-100 px-2 py-0.5">${escapeHtml(safeStartup.category)}</span>
          <time datetime="${escapeAttr(safeStartup.timestamp)}">${escapeHtml(formatDate(safeStartup.timestamp))}</time>
        </div>
      `;

      card.addEventListener("click", (e) => {
        if (e.target.closest('.remove-btn')) return;
        $("#searchInput").value = safeStartup.startup;
        submitSearch(safeStartup.startup);
      });

      card.querySelector(".remove-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSaveStartup(startup);
      });

      wrap.appendChild(card);
    });
    
  } catch (error) {
    console.error('Error in renderSaved:', error);
    $("#savedList").innerHTML = '<div class="text-red-500 p-4">Error loading saved startups</div>';
  }
}

// ====== Action Functions ======
async function submitSearch(q) {
  state.query = (q ?? $("#searchInput").value ?? "").trim()
  if (!state.query) return

  hide($("#errorBanner"))
  hide($("#topInsights"))
  show($("#loading"))
  $("#results").innerHTML = ""

  try {
    const payload = { query: state.query }
    console.log("🔴 STEP 1 - Sending to n8n:", payload);
    
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    
    console.log("🔴 STEP 2 - Response status:", res.status);
    
    if (!res.ok) throw new Error(`n8n webhook error: ${res.status}`)
    
    const rawData = await res.json();
    console.log("🔴 STEP 3 - RAW n8n response:", rawData);
    
    const normalized = normalizeInsights(rawData);
    console.log("🔴 STEP 4 - Normalized insights count:", normalized.length);
    
    state.allInsights = normalized;
    console.log("🔴 STEP 5 - State insights count:", state.allInsights.length);
    
    applyFilters()
    console.log("🔴 STEP 6 - Filtered insights count:", state.filtered.length);
    
    updateHistory(state.query)
    
  } catch (err) {
    console.error("❌ ERROR in submitSearch:", err)
    show($("#errorBanner"))
    state.allInsights = []
    state.filtered = []
  } finally {
    hide($("#loading"))
    renderTopInsights()
    renderResults()
    renderSaved()
    persist()
  }
}

function normalizeInsights(resp) {
  console.log("🔄 RAW AI AGENT OUTPUT:", resp);
  
  const out = [];
  
  if (Array.isArray(resp)) {
    resp.forEach(company => {
      processCompanyInsights(company, out);
    });
  } else if (resp && typeof resp === 'object') {
    processCompanyInsights(resp, out);
  } else {
    console.warn("⚠️ Unexpected response format:", resp);
  }
  
  console.log("✅ NORMALIZED DATA (no duplicates):", out);
  return out;
}

function processCompanyInsights(company, outputArray) {
  if (!company || !company.startup) {
    console.warn("⚠️ Skipping invalid company data:", company);
    return;
  }
  
  const startup = company.startup;
  const logo = company.logo || generateLogoUrl(startup);
  
  console.log(`📊 Processing company: ${startup} with ${company.insights?.length || 0} insights`);
  
  (company.insights || []).forEach((insight, index) => {
    const uniqueInsight = {
      startup: startup,
      logo: logo,
      headline: insight.headline || insight.title || `Update ${index + 1}`,
      summary: Array.isArray(insight.summary) ? insight.summary : [insight.summary || "No summary available"],
      category: insight.category || "Other",
      importance: insight.importance || "Low",
      timestamp: insight.timestamp || new Date().toISOString(),
      source: insight.source || "#"
    };
    
    const isDuplicate = outputArray.some(existing => 
      existing.startup === uniqueInsight.startup && 
      existing.headline === uniqueInsight.headline
    );
    
    if (!isDuplicate) {
      outputArray.push(uniqueInsight);
    } else {
      console.log(`🔄 Skipping duplicate: ${uniqueInsight.startup} - ${uniqueInsight.headline}`);
    }
  });
}

function generateLogoUrl(startupName) {
  const cleanName = startupName.toLowerCase().replace(/\s+/g, '');
  const logoUrls = [
    `https://logo.clearbit.com/${cleanName}.com`,
    `https://logo.clearbit.com/${cleanName}.io`,
    `https://logo.clearbit.com/${cleanName}.co`,
    `https://logo.clearbit.com/${cleanName}.ai`,
    `https://via.placeholder.com/64/3B82F6/FFFFFF?text=${cleanName.charAt(0).toUpperCase()}`
  ];
  
  return logoUrls[0];
}

function applyFilters() {
  state.filtered = state.allInsights.filter((it) => {
    const catOk = state.filters.categories.size ? state.filters.categories.has(it.category) : true
    const impOk = state.filters.importance ? state.filters.importance === it.importance : true
    const dateOk = withinRange(it.timestamp, state.filters.dateRange)
    return catOk && impOk && dateOk
  })
}

async function toggleSaveStartup(startupData) {
  const existingIndex = state.savedStartups.findIndex(s => s.startup === startupData.startup);
  
  if (existingIndex >= 0) {
    state.savedStartups.splice(existingIndex, 1);
    await removeStartupFromDB(startupData.startup);
    toast(`Removed ${startupData.startup} from saved startups`);
  } else {
    state.savedStartups.push(startupData);
    await saveStartupToDB(startupData);
    toast(`Saved ${startupData.startup}`);
  }
  
  persist();
  renderSaved();
}

function toggleBookmark(key) {
  if (state.bookmarks.has(key)) state.bookmarks.delete(key)
  else state.bookmarks.add(key)
  persist()
  toast("Bookmark updated")
}

async function toggleTracking(startup, toggleEl) {
  const wasOn = state.tracking.has(startup)
  const nextOn = !wasOn
  if (nextOn) state.tracking.add(startup)
  else state.tracking.delete(startup)
  
  toggleEl.classList.toggle("toggle-on", nextOn)
  toggleEl.querySelector(".toggle-dot").classList.toggle("toggle-dot-on", nextOn)
  toggleEl.setAttribute("aria-checked", nextOn ? "true" : "false")
  persist()

  try {
    if (N8N_TRACKING_URL) {
      await fetch(N8N_TRACKING_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startup, enabled: nextOn }),
      })
    }
    toast(`Tracking ${nextOn ? "enabled" : "disabled"} for ${startup}`)
  } catch (e) {
    console.error(e)
    toast("Tracking change failed")
  }
}

// for ai chatbot
async function sendChatMessage(message) {
  try {
    // Show user's message
    addChatMessage(message, 'user');

    // Show loading spinner
    showChatLoading(true);

    // Send message to n8n AI webhook
    const response = await fetch(N8N_AI_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message }),
    });

    if (!response.ok) throw new Error(`Chat error: ${response.status}`);

    const dataArray = await response.json(); // dataArray = [{ output: "..." }]
    const aiText = JSON.parse(dataArray[0].output).text || "I couldn't process that request.";

    // --- Enhanced display logic ---
    // Split AI text into sections using double newline
    const sections = aiText.split("\n\n");

    sections.forEach(section => {
      // Convert URLs to clickable links
      const urlPattern = /(https?:\/\/[^\s]+)/g;
      const formatted = section.replace(urlPattern, '<a href="$1" target="_blank" class="text-teal-700 underline">$1</a>');

      // Display each section as its own message block
      addChatMessage(formatted, 'ai');
    });

  } catch (error) {
    console.error("Chat error:", error);
    addChatMessage("Sorry, I'm having trouble connecting right now.", 'ai');
  } finally {
    showChatLoading(false);
  }
}



function addChatMessage(message, sender) {
  const chatList = document.getElementById("chatList");
  const messageDiv = document.createElement("div");

  messageDiv.className = `rounded-xl p-4 text-sm ${
    sender === 'user' 
      ? 'bg-teal-600 text-white ml-8' 
      : 'bg-teal-50 text-teal-800 border border-teal-100 mr-8'
  }`;

  messageDiv.innerHTML = `
    <div class="flex items-start gap-2">
      <i class="fas ${sender === 'user' ? 'fa-user text-teal-200' : 'fa-robot text-teal-600'} mt-0.5"></i>
      <div class="flex-1">
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;

  chatList.appendChild(messageDiv);
  chatList.scrollTop = chatList.scrollHeight;
}

function showChatLoading(show) {
  const chatSendBtn = document.getElementById("chatSend");
  if (show) {
    chatSendBtn.disabled = true;
    chatSendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  } else {
    chatSendBtn.disabled = false;
    chatSendBtn.innerHTML = '<i class="fa-solid fa-paper-plane text-white"></i> Send';
  }
}


function openModal(item) {
  $("#modalBody").innerHTML = `
    <div class="flex items-center gap-2">
      <img src="${escapeAttr(item.logo)}" alt="" class="h-8 w-8 rounded bg-gray-100 object-contain" onerror="this.style.display='none'"/>
      <div>
        <p class="text-sm font-semibold text-gray-900">${escapeHtml(item.startup)}</p>
        <p class="text-xs text-gray-600">${escapeHtml(formatDate(item.timestamp))}</p>
      </div>
    </div>
    <div>
      <h3 class="mt-2 font-semibold text-gray-900">${escapeHtml(item.headline)}</h3>
      <ul class="mt-2 list-disc pl-5 text-sm text-gray-700">
        ${item.summary.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
      </ul>
      <div class="mt-3 flex items-center gap-2 text-xs text-gray-600">
        <span class="${badgeClass(item.importance)}">${escapeHtml(item.importance)}</span>
        <span class="rounded bg-gray-100 px-2 py-0.5">${escapeHtml(item.category)}</span>
        <a href="${escapeAttr(item.source)}" class="text-teal-700 hover:underline" target="_blank" rel="noopener">Source</a>
      </div>
    </div>
  `
  show($("#modal"))
}

function closeModal() {
  hide($("#modal"))
}

// ====== Event Wiring ======
function wireEvents() {
  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault()
    submitSearch()
  })

  const input = $("#searchInput")
  input.addEventListener("input", () => {
    const v = input.value.toLowerCase()
    const matches = state.history.filter((q) => q.toLowerCase().includes(v))
    renderHistoryDropdown(matches)
  })
  
  document.addEventListener("click", (e) => {
    if (!$("#historyList").contains(e.target) && e.target !== input) {
      hide($("#historyList"))
      input.setAttribute("aria-expanded", "false")
    }
  })

  $all(".filter-category").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) state.filters.categories.add(cb.value)
      else state.filters.categories.delete(cb.value)
      applyFilters()
      renderTopInsights()
      renderResults()
    })
  })
  
  $("#importanceSelect").addEventListener("change", (e) => {
    state.filters.importance = e.target.value
    applyFilters()
    renderTopInsights()
    renderResults()
  })
  
  $all('input[name="dateRange"]').forEach((r) => {
    r.addEventListener("change", () => {
      state.filters.dateRange = document.querySelector('input[name="dateRange"]:checked').value
      applyFilters()
      renderTopInsights()
      renderResults()
    })
  })

  $("#modalClose").addEventListener("click", closeModal)
  $("#modalBackdrop").addEventListener("click", closeModal)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal()
  })

  $("#userMenuBtn").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const menu = $("#userMenu");
    const isHidden = menu.classList.contains("hidden");
    
    if (isHidden) {
        menu.classList.remove("hidden");
        $("#userMenuBtn").setAttribute("aria-expanded", "true");
    } else {
        menu.classList.add("hidden");
        $("#userMenuBtn").setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("click", (e) => {
    const menu = $("#userMenu");
    const btn = $("#userMenuBtn");
    
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.add("hidden");
        btn.setAttribute("aria-expanded", "false");
    }
  });

  $("#chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = $("#chatInput").value.trim();
    if (!message) return;
    
    $("#chatInput").value = ""; // Clear input
    await sendChatMessage(message);
  });
}

function initialRender() {
  renderUser()
  renderSaved()
  renderTopInsights()
  renderResults()
}

// ====== Application Boot ======
;(async function boot() {
  console.log("🔴 Booting application...");

  if (!requireAuth()) {
    console.log("❌ Auth failed, redirecting to login");
    return;
  }

  console.log("✅ Auth successful, user:", state.auth?.email);

  loadPersisted();
  wireEvents();
  initialRender();

  console.log("📥 Loading saved data from Supabase...");
  await loadSavedFromDB();
  renderSaved();

  console.log("🎉 Application boot completed");
})();

// ====== Safe Merge Protection ======
if (window.__INSIGHT_MERGE_APPLIED__) {
  console.log("🔒 InsightPulse already loaded - skipping duplicate load");
} else {
  window.__INSIGHT_MERGE_APPLIED__ = true;
  console.log("✅ InsightPulse JavaScript merged successfully");
}

