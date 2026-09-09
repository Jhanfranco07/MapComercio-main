/* Shared application chrome; map rendering and source data remain in their modules. */
window.ComercioUI = (() => {
  let selectedStatus = "";
  let searchAdapter;
  let closePanel;
  let returnFocus;
  const byId = (id) => document.getElementById(id);

  function syncNavigation(mode) {
    document.body.dataset.appMode = mode;
    document.querySelectorAll(".bottom-nav-item").forEach((item) => {
      if (item.classList.contains("active")) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }

  function activateTool(name, focus = false) {
    const tabs = document.querySelectorAll("[data-tool]");
    tabs.forEach((tab) => {
      const active = tab.dataset.tool === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
      byId(tab.getAttribute("aria-controls")).hidden = !active;
    });
  }

  function buildWorkspace() {
    if (!document.body.classList.contains("admin-app")) return;
    const workspace = document.createElement("aside");
    workspace.className = "workspace-tools";
    workspace.setAttribute("aria-label", "Herramientas de administración");
    workspace.innerHTML = '<div class="workspace-heading"><span class="section-eyebrow">Administración</span><h2>Centro de gestión</h2></div><div class="workspace-tabs" role="tablist" aria-label="Herramientas"></div>';
    const tools = [
      ["overview", "Resumen", "monitoring", ".diagnostic-panel"],
      ["locations", "Ubicaciones", "edit_location_alt", ".main-editor"],
      ["selection", "Selección", "checklist", ".map-selection-editor"],
      ["zones", "Zonas", "pentagon", ".zone-editor"]
    ];
    tools.forEach(([name, label, icon, selector]) => {
      const panel = document.querySelector(selector);
      const wrapper = document.createElement("div");
      wrapper.id = `tool-panel-${name}`;
      wrapper.className = "workspace-panel";
      wrapper.setAttribute("role", "tabpanel");
      wrapper.setAttribute("aria-labelledby", `tool-tab-${name}`);
      const tab = document.createElement("button");
      tab.id = `tool-tab-${name}`;
      tab.type = "button";
      tab.dataset.tool = name;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", wrapper.id);
      tab.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span><span>${label}</span>`;
      tab.addEventListener("click", () => activateTool(name));
      wrapper.append(panel);
      workspace.querySelector(".workspace-tabs").append(tab);
      workspace.append(wrapper);
    });
    document.querySelector(".main-app").append(workspace);
    workspace.querySelector(".workspace-tabs").addEventListener("keydown", (event) => {
      const tabs = [...workspace.querySelectorAll("[data-tool]")];
      const index = tabs.indexOf(document.activeElement);
      if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      activateTool(tabs[next].dataset.tool, true);
    });
    activateTool("overview");
  }

  function init(adapter) {
    searchAdapter = adapter;
    buildWorkspace();
    syncNavigation(document.body.dataset.appMode);
    const desktop = window.matchMedia("(min-width: 900px)");
    const configureFilters = () => {
      document.querySelector(".search-filter-panel").open = desktop.matches;
      const mapFilters = document.querySelector(".main-controls, .viewer-controls");
      mapFilters.classList.toggle("mobile-collapsed", !desktop.matches);
      byId("btnFilters").setAttribute("aria-expanded", String(desktop.matches));
    };
    configureFilters();
    desktop.addEventListener("change", configureFilters);
    document.querySelectorAll(".legend-block").forEach((block, index) => {
      const details = document.createElement("details");
      details.className = "legend-section";
      details.open = index === 0;
      const summary = document.createElement("summary");
      summary.textContent = block.querySelector("h2").textContent;
      details.append(summary, block.querySelector(".legend-items"));
      block.replaceWith(details);
    });
    document.querySelectorAll(".quick-filters [data-status]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedStatus = button.dataset.status;
        document.querySelectorAll("[data-status]").forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
        });
        adapter.renderSearch(byId("moduleSearchInput").value);
      });
    });
    ["searchRubro", "searchTurno", "searchOrder"].forEach((id) => {
      byId(id).addEventListener("change", () => adapter.renderSearch(byId("moduleSearchInput").value));
    });
    byId("clearSearchFilters").addEventListener("click", resetSearch);
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-reset-search]")) resetSearch();
    });
    byId("bottomAdmin")?.addEventListener("click", (event) => {
      event.preventDefault();
      adapter.setMode("admin");
    });
    let layoutFrame;
    const positionMapActions = () => {
      cancelAnimationFrame(layoutFrame);
      layoutFrame = requestAnimationFrame(() => {
        const map = byId("map");
        const actions = document.querySelector(".map-fabs");
        const bounds = map.getBoundingClientRect();
        const headerHeight = document.querySelector(".app-topbar").offsetHeight;
        const compact = innerWidth < 900;
        const navHeight = compact ? document.querySelector(".bottom-nav").offsetHeight : 0;
        const exportBar = byId("exportBar");
        const exportHeight = exportBar && getComputedStyle(exportBar).display !== "none" && !compact ? exportBar.offsetHeight : 0;
        const bottom = Math.min(bounds.bottom - 12, innerHeight - navHeight - exportHeight - 16);
        actions.classList.toggle("actions-outside-map", bottom - actions.offsetHeight < Math.max(bounds.top, headerHeight) || !bounds.height);
        actions.style.bottom = `${Math.max(12, innerHeight - bottom)}px`;
      });
    };
    window.addEventListener("scroll", positionMapActions, { passive: true });
    window.addEventListener("resize", positionMapActions);
    new ResizeObserver(positionMapActions).observe(document.querySelector("main"));
    positionMapActions();
    const backdrop = document.createElement("div");
    backdrop.className = "panel-backdrop";
    backdrop.addEventListener("click", () => closePanel?.());
    document.body.append(backdrop);
    document.addEventListener("keydown", (event) => {
      const panel = byId("merchantPanel");
      if (!panel?.classList.contains("open")) return;
      if (event.key === "Escape") closePanel?.();
      if (event.key !== "Tab" || !panel.classList.contains("detail-mode")) return;
      const focusable = [...panel.querySelectorAll('button, a[href], input, select, [tabindex="0"]')].filter((item) => !item.disabled);
      const first = focusable[0];
      const last = focusable.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    });
    document.querySelectorAll("button[aria-label]").forEach((button) => {
      if (!button.title) button.title = button.getAttribute("aria-label");
    });
    byId("moduleSearchInput").setAttribute("aria-label", "Buscar por nombre, DNI o número de permiso");
  }

  function resetSearch() {
    selectedStatus = "";
    byId("moduleSearchInput").value = "";
    byId("searchRubro").value = "";
    byId("searchTurno").value = "";
    byId("searchOrder").value = "name";
    document.querySelectorAll("[data-status]").forEach((button) => button.setAttribute("aria-pressed", String(!button.dataset.status)));
    searchAdapter.renderSearch("");
    byId("moduleSearchInput").focus();
  }

  function filterRecords(data, query, adapter) {
    const select = byId("searchRubro");
    const rubros = [...new Set(data.flatMap(adapter.rubros))].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
    if (select.dataset.options !== JSON.stringify(rubros)) {
      const previous = select.value;
      select.replaceChildren(new Option("Todos los rubros", ""), ...rubros.map((rubro) => new Option(rubro, rubro)));
      select.value = rubros.includes(previous) ? previous : "";
      select.dataset.options = JSON.stringify(rubros);
    }
    const turno = byId("searchTurno").value;
    const activeFilters = Number(Boolean(select.value)) + Number(Boolean(turno));
    byId("searchAppliedFilters").textContent = activeFilters ? String(activeFilters) : "";
    const records = data.filter((record) => adapter.matches(record, query)
      && (!selectedStatus || adapter.status(record) === selectedStatus)
      && (!select.value || adapter.rubros(record).includes(select.value))
      && (!turno || record.turno === turno));
    records.sort((a, b) => {
      if (byId("searchOrder").value === "status") {
        const statusOrder = Number(adapter.status(b) === "Vigente") - Number(adapter.status(a) === "Vigente");
        if (statusOrder) return statusOrder;
      }
      return (a.nombre || "").localeCompare(b.nombre || "", "es");
    });
    byId("searchResultCount").textContent = `${records.length} ${records.length === 1 ? "comerciante" : "comerciantes"} de ${data.length}`;
    return records;
  }

  function emptyResults() {
    return '<div class="empty-results"><span class="material-symbols-outlined" aria-hidden="true">search_off</span><h3>Sin coincidencias</h3><p>No hay comerciantes que coincidan con esta búsqueda y sus filtros.</p><button class="btn" type="button" data-reset-search>Limpiar búsqueda</button></div>';
  }

  function openPanel(panel, onClose) {
    if (!panel.contains(document.activeElement)) returnFocus = document.activeElement;
    closePanel = onClose;
    const detail = panel.classList.contains("detail-mode");
    document.body.classList.toggle("detail-open", detail);
    panel.setAttribute("role", detail ? "dialog" : "region");
    if (detail) panel.setAttribute("aria-modal", "true");
    else panel.removeAttribute("aria-modal");
    panel.querySelector("h2").id = "merchantPanelTitle";
    panel.setAttribute("aria-labelledby", "merchantPanelTitle");
    panel.removeAttribute("aria-hidden");
    panel.inert = false;
    panel.querySelectorAll(".panel-icon-btn").forEach((button) => {
      button.setAttribute("aria-label", detail ? "Volver" : "Cerrar detalle");
      button.title = button.getAttribute("aria-label");
    });
    panel.querySelector(".merchant-panel-card").scrollTop = 0;
    panel.querySelector("button")?.focus({ preventScroll: true });
  }

  function panelClosed() {
    document.body.classList.remove("detail-open");
    const panel = byId("merchantPanel");
    if (!panel) return;
    panel.inert = true;
    panel.setAttribute("aria-hidden", "true");
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    closePanel = null;
  }

  function bindResultCards(container, open) {
    container.querySelectorAll(".merchant-card").forEach((card) => {
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Ver permiso de ${card.querySelector("h3").textContent}`);
      card.addEventListener("click", () => open(card.dataset.id));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open(card.dataset.id);
        }
      });
    });
  }

  return { init, syncNavigation, activateTool, filterRecords, emptyResults, openPanel, panelClosed, bindResultCards };
})();
