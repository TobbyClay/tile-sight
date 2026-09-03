import {MODULE_ID, OBSERVATION_MODE_OPTIONS, OBSERVATION_MODES} from "./constants.mjs";
import {getDiagnosticsEnabled, getSenseAurasEnabled} from "./settings.mjs";
import {
  getActorSenseRangePixels,
  getPreviewToken,
  getTileObservationDiagnostics,
  getTileObservationMode
} from "./visibility.mjs";

const CONTAINER_NAME = `${MODULE_ID}.diagnostics`;
const LABEL_STYLE = {
  align: "left",
  dropShadow: true,
  dropShadowAlpha: 0.75,
  dropShadowBlur: 2,
  dropShadowDistance: 1,
  fill: 0xffffff,
  fontFamily: "Arial",
  fontSize: 14,
  fontWeight: "700",
  stroke: 0x000000,
  strokeThickness: 3
};
const COLORS = Object.freeze({
  visible: 0x35d072,
  blocked: 0xf05a50,
  nativeHidden: 0xffc247
});
const SENSE_COLORS = Object.freeze({
  truesight: 0x8be9fd,
  blindsight: 0xff79c6,
  tremorsense: 0xf1fa8c,
  darkvision: 0xbd93f9
});

let diagnosticsContainer = null;

const debouncedRefreshDiagnostics = foundry.utils.debounce(() => {
  drawDiagnosticsOverlay();
}, 25);

export function registerDiagnosticsHooks() {
  Hooks.on("canvasReady", requestDiagnosticsRefresh);
  Hooks.on("canvasTearDown", clearDiagnosticsOverlay);
  Hooks.on("visibilityRefresh", requestDiagnosticsRefresh);
  Hooks.on("sightRefresh", requestDiagnosticsRefresh);
  Hooks.on("controlToken", requestDiagnosticsRefresh);
  Hooks.on("createToken", requestDiagnosticsRefresh);
  Hooks.on("updateToken", requestDiagnosticsRefresh);
  Hooks.on("deleteToken", requestDiagnosticsRefresh);
  Hooks.on("updateActor", requestDiagnosticsRefresh);
  Hooks.on("createActiveEffect", requestDiagnosticsRefresh);
  Hooks.on("updateActiveEffect", requestDiagnosticsRefresh);
  Hooks.on("deleteActiveEffect", requestDiagnosticsRefresh);
  Hooks.on("createTile", requestDiagnosticsRefresh);
  Hooks.on("updateTile", requestDiagnosticsRefresh);
  Hooks.on("deleteTile", requestDiagnosticsRefresh);
}

export function requestDiagnosticsRefresh() {
  debouncedRefreshDiagnostics();
}

export function clearDiagnosticsOverlay() {
  if ( !diagnosticsContainer ) return;
  diagnosticsContainer.destroy({children: true});
  diagnosticsContainer = null;
}

function drawDiagnosticsOverlay() {
  const showDiagnostics = getDiagnosticsEnabled();
  const showAuras = getSenseAurasEnabled();
  if ( !canvas?.ready || (!showDiagnostics && !showAuras) ) {
    clearDiagnosticsOverlay();
    return;
  }

  const parent = canvas.interface ?? canvas.controls ?? canvas.stage;
  if ( !parent ) return;

  diagnosticsContainer ??= parent.addChild(new PIXI.Container());
  diagnosticsContainer.name = CONTAINER_NAME;
  diagnosticsContainer.zIndex = 10_000;
  diagnosticsContainer.eventMode = showDiagnostics ? "auto" : "none";
  diagnosticsContainer.interactiveChildren = showDiagnostics;
  diagnosticsContainer.removeChildren().forEach(child => child.destroy({children: true}));

  if ( showDiagnostics ) {
    for ( const tile of canvas.tiles?.placeables ?? [] ) {
      if ( getTileObservationMode(tile.document) === OBSERVATION_MODES.always ) continue;
      drawTileDiagnostics(tile);
    }
  }

  if ( showAuras ) drawSenseAuras();
}

function drawTileDiagnostics(tile) {
  const diagnostics = getTileObservationDiagnostics(tile);
  if ( !diagnostics ) return;

  const color = getDiagnosticColor(diagnostics);
  const bounds = tile.bounds;
  const box = new PIXI.Graphics();

  box.lineStyle(2, color, 0.9);
  box.beginFill(color, 0.06);
  box.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
  box.endFill();
  diagnosticsContainer.addChild(box);

  const label = createLabel(tile, diagnostics, color);
  diagnosticsContainer.addChild(label.background);
  diagnosticsContainer.addChild(label.text);
}

function createLabel(tile, diagnostics, color) {
  const textClass = globalThis.PreciseText ?? PIXI.Text;
  const text = new textClass(getDiagnosticLabel(diagnostics), LABEL_STYLE);
  const padding = 4;

  text.position.set(tile.center.x + 6, tile.center.y - 6);
  if ( text.anchor ) text.anchor.set(0, 1);

  const bounds = text.getLocalBounds();
  const background = new PIXI.Graphics();
  const x = text.x + bounds.x - padding;
  const y = text.y + bounds.y - padding;
  const width = bounds.width + (padding * 2);
  const height = bounds.height + (padding * 2);

  background.beginFill(0x000000, 0.68);
  background.lineStyle(1, color, 0.9);
  background.drawRect(x, y, width, height);
  background.endFill();

  text.eventMode = "static";
  text.cursor = "help";
  text.on?.("pointerover", () => console.info(`${MODULE_ID} | ${diagnostics.summary}`, diagnostics));

  return {background, text};
}

function getDiagnosticLabel(diagnostics) {
  const state = diagnostics.finalVisible
    ? game.i18n.localize("TILESIGHT.Diagnostics.Visible")
    : game.i18n.localize("TILESIGHT.Diagnostics.Hidden");
  const mode = game.i18n.localize(OBSERVATION_MODE_OPTIONS[diagnostics.mode] ?? diagnostics.mode);

  return `${mode}: ${state}\n${diagnostics.observedPointCount}/${diagnostics.pointCount} points`;
}

function getDiagnosticColor(diagnostics) {
  if ( diagnostics.finalVisible ) return COLORS.visible;
  if ( !diagnostics.coreVisible ) return COLORS.nativeHidden;
  return COLORS.blocked;
}

function drawSenseAuras() {
  const previewToken = getPreviewToken();
  const tokens = previewToken ? [previewToken] : (canvas.tokens?.controlled ?? []);

  for ( const token of tokens ) {
    for ( const sense of Object.keys(SENSE_COLORS) ) {
      const range = getActorSenseRangePixels(token.actor, sense);
      if ( range.pixels <= 0 ) continue;
      drawSenseAura(token, sense, range);
    }
  }
}

function drawSenseAura(token, sense, range) {
  const color = SENSE_COLORS[sense];
  const aura = new PIXI.Graphics();
  disablePointerEvents(aura);
  aura.lineStyle(2, color, 0.75);
  aura.beginFill(color, 0.04);
  aura.drawCircle(token.center.x, token.center.y, range.pixels);
  aura.endFill();
  diagnosticsContainer.addChild(aura);

  const textClass = globalThis.PreciseText ?? PIXI.Text;
  const label = new textClass(`${sense} ${formatRange(range)}`, {
    ...LABEL_STYLE,
    fill: color,
    fontSize: 13
  });
  disablePointerEvents(label);
  label.position.set(token.center.x + range.pixels + 4, token.center.y);
  diagnosticsContainer.addChild(label);
}

function disablePointerEvents(displayObject) {
  displayObject.eventMode = "none";
  displayObject.interactive = false;
  displayObject.interactiveChildren = false;
  displayObject.cursor = null;
}

function formatRange(range) {
  const value = Number.isInteger(range.range) ? range.range : range.range.toFixed(1);
  return `${value} ${range.units}`;
}
