// ====== Configuration ======
const SUPABASE_URL = 'https://axicogqtiindhiehfbuz.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4aWNvZ3F0aWluZGhpZWhmYnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NjE1NjgsImV4cCI6MjA3NTEzNzU2OH0.MoOTFZ0viqkWr_s7vDIzBgMzrx32LW_PTAWKRwCQNYQ'
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====== State ======
const state = {
  auth: null,
  userId: null,
  savedStartups: []
}

// ====== Utility Functions ======
function $(sel) {
  return document.querySelector(sel)
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

function formatDate(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString()
  } catch {
    return iso
  }
}

function badgeClass(importance) {
  if (importance === "High") return "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"
  if (importance === "Medium") return "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"
  return "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
}

// ====== Auth Functions ======
function readAuth() {
  try {
    const auth = JSON.parse(localStorage.getItem("ip_auth"));
    if (auth) {
      state.userId = auth.userId || auth.email;
      state.auth = auth;
    }
    return auth || null;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

function requireAuth() {
  const auth = readAuth();
  if (!auth) {
    window.location.href = "./login.html";
    return false;
  }
  $("#userEmail").textContent = auth.email || 'User';
  return true;
}

// ====== Database Functions ======
async function loadSavedFromDB() {
  try {
    console.log("📥 Loading saved startups from Supabase...");
    
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
      console.log("✅ Loaded from Supabase:", state.savedStartups.length, "startups");
    } else {
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
    console.log("📥 Loaded from localStorage:", state.savedStartups.length, "startups");
  } catch (error) {
    console.error("❌ localStorage load failed:", error);
    state.savedStartups = [];
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

// ====== Rendering Functions ======
function renderSavedStartups() {
  const container = $("#savedList");
  const emptyState = $("#noSaved");
  
  container.innerHTML = "";
  
  if (!state.savedStartups || state.savedStartups.length === 0) {
    emptyState.classList.remove("hidden");
    container.classList.add("hidden");
    return;
  }
  
  emptyState.classList.add("hidden");
  container.classList.remove("hidden");
  
  state.savedStartups.forEach((startup) => {
    if (!startup || typeof startup !== 'object') return;
    
    const safeStartup = {
      startup: startup.startup || 'Unknown Startup',
      logo: startup.logo || '',
      headline: startup.headline || 'No headline available',
      importance: startup.importance || 'Medium',
      category: startup.category || 'Uncategorized',
      timestamp: startup.timestamp || new Date().toISOString(),
      summary: Array.isArray(startup.summary) ? startup.summary : [startup.summary || "No summary available"]
    };
    
    const summaryItems = safeStartup.summary.slice(0, 3);
    
    const card = document.createElement("div");
    card.className = "bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all";
    card.innerHTML = `
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center gap-3">
          <img src="${escapeAttr(safeStartup.logo)}" 
               alt="${escapeAttr(safeStartup.startup)} logo" 
               class="h-12 w-12 rounded-lg bg-gray-100 object-contain flex-shrink-0"
               onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjOUNBM0FGIi8+Cjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0iY2VudHJhbCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiI+${escapeAttr(safeStartup.startup.charAt(0).toUpperCase())}</dGV4dD4KPC9zdmc+'"/>
          <div>
            <h3 class="font-semibold text-gray-900 text-lg">${escapeHtml(safeStartup.startup)}</h3>
            <p class="text-sm text-gray-600 mt-1">${escapeHtml(safeStartup.headline)}</p>
          </div>
        </div>
        <button class="remove-btn p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" 
                title="Remove from saved">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="mb-4">
        <ul class="space-y-2 text-sm text-gray-700">
          ${summaryItems.map((s) => `
            <li class="flex items-start gap-2">
              <i class="fas fa-chevron-right text-teal-500 mt-0.5 text-xs"></i>
              <span>${escapeHtml(String(s))}</span>
            </li>
          `).join('')}
        </ul>
      </div>
      
      <div class="flex items-center justify-between text-sm">
        <div class="flex items-center gap-2">
          <span class="${badgeClass(safeStartup.importance)}">${escapeHtml(safeStartup.importance)}</span>
          <span class="bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full text-xs">${escapeHtml(safeStartup.category)}</span>
        </div>
        <span class="text-gray-500">${formatDate(safeStartup.timestamp)}</span>
      </div>
    `;
    
    card.querySelector(".remove-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm(`Remove ${safeStartup.startup} from saved startups?`)) {
        await removeStartupFromDB(safeStartup.startup);
        
        // Remove from local state
        state.savedStartups = state.savedStartups.filter(s => s.startup !== safeStartup.startup);
        
        // Update localStorage
        localStorage.setItem("ip_saved", JSON.stringify(state.savedStartups));
        
        renderSavedStartups();
      }
    });
    
    container.appendChild(card);
  });
}

// ====== Event Wiring ======
function wireEvents() {
  // User menu toggle
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

  // Logout handler
  $('[data-action="logout"]').addEventListener("click", () => {
    localStorage.removeItem("ip_auth");
    window.location.href = "./login.html";
  });
}

// ====== Application Boot ======
;(async function boot() {
  console.log("🔴 Booting saved startups page...");

  if (!requireAuth()) {
    console.log("❌ Auth failed, redirecting to login");
    return;
  }

  console.log("✅ Auth successful, user:", state.auth?.email);

  wireEvents();
  await loadSavedFromDB();
  renderSavedStartups();

  console.log("🎉 Saved startups page loaded");
})();