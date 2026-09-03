import {
  DEFAULT_OBSERVATION_SENSES,
  DEFAULT_OBSERVATION_MODE,
  FILTER_MODE_OPTIONS,
  FLAGS,
  LEGACY_SEE_INVISIBILITY_SENSES,
  LEGACY_SIGHT_SENSES,
  LEGACY_TRUESIGHT_MODE,
  MODULE_ID,
  OBSERVATION_MODE_OPTIONS,
  OBSERVATION_MODES,
  SIGHT_FORMS,
  SIGHT_FORM_OPTIONS
} from "./constants.mjs";

const CONFIG_MARKER = "data-tile-sight-observation";

export function registerTileConfigHooks() {
  Hooks.on("renderTileConfig", (app, html) => {
    void injectTileObservationControls(app, html).catch(error => {
      console.error(`${MODULE_ID} | Failed to inject tile observation controls`, error);
    });
  });
}

async function injectTileObservationControls(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0] ?? html;
  const content = root?.querySelector?.(".window-content") ?? root;
  if ( !content ) return;

  const tileDocument = app.document ?? app.object;
  if ( !tileDocument?.getFlag ) return;

  const target = content.querySelector('.tab[data-group="sheet"][data-tab="overhead"]')
    ?? content.querySelector('.tab[data-group="sheet"][data-tab="position"]')
    ?? content.querySelector("form");
  if ( !target ) return;

  target.querySelector(`[${CONFIG_MARKER}]`)?.remove();

  const options = getAvailableObservationModeOptions();
  const mode = normalizeObservationMode(tileDocument.getFlag(MODULE_ID, FLAGS.observationMode), options);
  const senses = getTileObservationSenses(tileDocument);
  const fieldPrefix = `${MODULE_ID}-${htmlId(tileDocument.uuid ?? tileDocument.id ?? "tile")}`;
  const fieldId = `${fieldPrefix}-observation-mode`;
  const requireLineOfSight = normalizeBooleanFlag(tileDocument.getFlag(MODULE_ID, FLAGS.requireLineOfSight), true);
  const requireRange = normalizeBooleanFlag(tileDocument.getFlag(MODULE_ID, FLAGS.requireRange), true);
  const filterMode = tileDocument.getFlag(MODULE_ID, FLAGS.filterMode) ?? "";
  const tags = normalizeTags(tileDocument.getFlag(MODULE_ID, FLAGS.tags)).join(", ");
  const wrapper = document.createElement("fieldset");
  wrapper.className = "tile-sight-fieldset";
  wrapper.setAttribute(CONFIG_MARKER, "");
  wrapper.innerHTML = `
    <legend>${escapeHtml(game.i18n.localize("TILESIGHT.Config.Legend"))}</legend>
    <div class="form-group">
      <label for="${escapeHtml(fieldId)}">${escapeHtml(game.i18n.localize("TILESIGHT.Config.ModeLabel"))}</label>
      <div class="form-fields">
        <select id="${escapeHtml(fieldId)}" name="flags.${MODULE_ID}.${FLAGS.observationMode}">
          ${buildModeOptions(mode, options)}
        </select>
      </div>
      <p class="hint">${escapeHtml(game.i18n.localize("TILESIGHT.Config.Hint"))}</p>
    </div>
    <div class="form-group tile-sight-sense-group">
      <label for="${escapeHtml(`${fieldPrefix}-senses`)}">${escapeHtml(game.i18n.localize("TILESIGHT.Config.SensesLabel"))}</label>
      <div class="form-fields">
        <input type="hidden" name="flags.${MODULE_ID}.${FLAGS.observationSenses}" value="">
        ${buildSenseInput(senses, `${fieldPrefix}-senses`)}
      </div>
      <p class="hint">${escapeHtml(game.i18n.localize("TILESIGHT.Config.SensesHint"))}</p>
    </div>
    <div class="form-group">
      <label>${escapeHtml(game.i18n.localize("TILESIGHT.Config.ConstraintsLabel"))}</label>
      <div class="form-fields">
        <label class="checkbox">
          <input type="hidden" name="flags.${MODULE_ID}.${FLAGS.requireLineOfSight}" value="false">
          <input type="checkbox" name="flags.${MODULE_ID}.${FLAGS.requireLineOfSight}" value="true"${requireLineOfSight ? " checked" : ""}>
          ${escapeHtml(game.i18n.localize("TILESIGHT.Config.RequireLineOfSight"))}
        </label>
        <label class="checkbox">
          <input type="hidden" name="flags.${MODULE_ID}.${FLAGS.requireRange}" value="false">
          <input type="checkbox" name="flags.${MODULE_ID}.${FLAGS.requireRange}" value="true"${requireRange ? " checked" : ""}>
          ${escapeHtml(game.i18n.localize("TILESIGHT.Config.RequireRange"))}
        </label>
      </div>
    </div>
    <div class="form-group">
      <label for="${escapeHtml(`${fieldPrefix}-filter-mode`)}">${escapeHtml(game.i18n.localize("TILESIGHT.Config.FilterModeLabel"))}</label>
      <div class="form-fields">
        <select id="${escapeHtml(`${fieldPrefix}-filter-mode`)}" name="flags.${MODULE_ID}.${FLAGS.filterMode}">
          ${buildInheritFilterOptions(filterMode)}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label for="${escapeHtml(`${fieldPrefix}-tags`)}">${escapeHtml(game.i18n.localize("TILESIGHT.Config.TagsLabel"))}</label>
      <div class="form-fields">
        <input id="${escapeHtml(`${fieldPrefix}-tags`)}" type="text" name="flags.${MODULE_ID}.${FLAGS.tags}" value="${escapeHtml(tags)}" placeholder="${escapeHtml(game.i18n.localize("TILESIGHT.Config.TagsPlaceholder"))}">
      </div>
      <p class="hint">${escapeHtml(game.i18n.localize("TILESIGHT.Config.TagsHint"))}</p>
    </div>
  `;

  target.append(wrapper);
}

function buildModeOptions(selectedMode, options) {
  return Object.entries(options).map(([value, label]) => {
    const selected = value === selectedMode ? " selected" : "";
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(game.i18n.localize(label))}</option>`;
  }).join("");
}

function buildSenseInput(selectedSenses, fieldId) {
  const options = buildSenseOptions(selectedSenses);
  const name = `flags.${MODULE_ID}.${FLAGS.observationSenses}`;
  const id = escapeHtml(fieldId);
  const escapedName = escapeHtml(name);

  if ( hasFoundryMultiSelect() ) {
    return `<multi-select id="${id}" name="${escapedName}" class="tile-sight-sense-select multi-select">${options}</multi-select>`;
  }

  return `<select id="${id}" name="${escapedName}" class="tile-sight-sense-select" multiple>${options}</select>`;
}

function buildSenseOptions(selectedSenses) {
  const selected = new Set(selectedSenses);
  return Object.entries(SIGHT_FORM_OPTIONS).map(([value, label]) => {
    const selectedAttr = selected.has(value) ? " selected" : "";
    return `<option value="${escapeHtml(value)}"${selectedAttr}>${escapeHtml(game.i18n.localize(label))}</option>`;
  }).join("");
}

function hasFoundryMultiSelect() {
  return !!globalThis.customElements?.get?.("multi-select");
}

function buildInheritFilterOptions(selectedValue) {
  const inheritedLabel = game.i18n.localize("TILESIGHT.Config.FilterInherit");
  const rows = [`<option value=""${selectedValue ? "" : " selected"}>${escapeHtml(inheritedLabel)}</option>`];
  rows.push(buildModeOptions(selectedValue, FILTER_MODE_OPTIONS));
  return rows.join("");
}

function getAvailableObservationModeOptions() {
  return OBSERVATION_MODE_OPTIONS;
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value));
}

function htmlId(value) {
  return String(value).replace(/[^\w-]+/g, "-");
}

function normalizeBooleanFlag(value, fallback) {
  if ( Array.isArray(value) ) return normalizeBooleanFlag(value.at(-1), fallback);
  if ( value === undefined || value === null || value === "" ) return fallback;
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeTags(value) {
  if ( Array.isArray(value) ) return value.map(tag => String(tag).trim()).filter(Boolean);
  if ( typeof value !== "string" ) return [];
  return value.split(",").map(tag => tag.trim()).filter(Boolean);
}

function getTileObservationSenses(tileDocument) {
  const explicit = normalizeSightForms(tileDocument.getFlag(MODULE_ID, FLAGS.observationSenses));
  if ( explicit.length ) return explicit;

  const mode = tileDocument.getFlag(MODULE_ID, FLAGS.observationMode);
  if ( mode === OBSERVATION_MODES.sight ) return Array.from(LEGACY_SIGHT_SENSES);
  if ( mode === OBSERVATION_MODES.seeInvisibility || mode === LEGACY_TRUESIGHT_MODE ) {
    return Array.from(LEGACY_SEE_INVISIBILITY_SENSES);
  }

  if ( mode === OBSERVATION_MODES.senses ) return Array.from(DEFAULT_OBSERVATION_SENSES);
  return Array.from(DEFAULT_OBSERVATION_SENSES);
}

function normalizeSightForms(value) {
  const valid = new Set(Object.values(SIGHT_FORMS));
  const values = [];

  if ( Array.isArray(value) ) values.push(...value);
  else if ( value instanceof Set ) values.push(...Array.from(value));
  else if ( typeof value === "string" ) values.push(...value.split(","));
  else if ( value && (typeof value === "object") ) {
    for ( const [key, enabled] of Object.entries(value) ) {
      if ( normalizeBooleanFlag(enabled, false) ) values.push(key);
    }
  }

  return Array.from(new Set(values.map(sense => String(sense).trim()).filter(sense => valid.has(sense))));
}

function normalizeObservationMode(mode, options) {
  if ( mode === LEGACY_TRUESIGHT_MODE ) return OBSERVATION_MODES.senses;
  if ( mode === OBSERVATION_MODES.sight || mode === OBSERVATION_MODES.seeInvisibility ) return OBSERVATION_MODES.senses;
  if ( (typeof mode === "string") && (mode in options) ) return mode;
  return DEFAULT_OBSERVATION_MODE;
}
