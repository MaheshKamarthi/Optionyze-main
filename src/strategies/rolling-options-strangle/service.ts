import crypto from "node:crypto";
import { RunnerManager } from "../../runners/runner-manager";
import {
    listRollingOptionsPtDeClosedPositions,
    listRollingOptionsPtDeOpenPositions,
    saveRollingOptionsPtDePosition,
    type RollingOptionsPtDePositionRecord
} from "../../storage/rolling-options-strangle-position-store";
import {
    clearRollingOptionsStrangleTempClosedPositions,
    listRollingOptionsStrangleTempClosedPositions,
    saveRollingOptionsStrangleTempClosedPositions
} from "../../storage/rolling-options-strangle-temp-closed-store";
import {
    loadRollingOptionsPtDeProfile,
    patchRollingOptionsPtDeProfileUiState
} from "../../storage/rolling-options-strangle-profile-store";
import {
    listRollingOptionsPtDeRuntime,
    saveRollingOptionsPtDeRuntime,
    type RollingOptionsPtDeRuntimeRecord
} from "../../storage/rolling-options-strangle-runtime-store";
import { runWithPostgresAdvisoryLock } from "../../storage/postgres";
import {
    buildConfigFromUiState,
    buildRenkoBrickClosesFromPrices,
    estimatePositionCharges,
    getOpenPositionsSummary,
    getPositionPnl,
    resolveExpiryDateByMode,
    shouldTriggerOption,
    updateRenkoState
} from "../rolling-options-pt-de/engine";
import { logRollingOptionsPtDeEvent } from "./event-logger";
import {
    ensureLiveTickerSymbols,
    calculateEmaFromCloses,
    findBestLiveOptionContract,
    getCandleEma,
    getHistoricalCandleCloses,
    getLiveMarketSnapshot,
    getCachedOptionTicker,
    getFreshWebSocketMarketSnapshot,
    getLiveOptionTicker
} from "../rolling-options-pt-de/market-data";
import { getDeltaTrailGap, getTrailedDeltaTarget } from "../../lib/delta-trailing";
import { syncOptionsPnlWithClosedPositions } from "./options-pnl";
import type {
    RollingOptionsPtDeConfig,
    RollingOptionsPtDeEmaTimeframe,
    RollingOptionsPtDeEngineState,
    RollingOptionsPtDeMarketSnapshot,
    RollingOptionsPtDeRenkoTimeframe
} from "../rolling-options-pt-de/types";

const RE_DELTA_TOLERANCE = 0.05;
const RENKO_MAX_WEBSOCKET_TICK_AGE_MS = 3000;

function normalizeNumber(pValue: unknown, pFallback: number): number {
    const vNumber = Number(pValue);
    return Number.isFinite(vNumber) ? vNumber : pFallback;
}

function normalizeEmaTimeframe(pValue: unknown): RollingOptionsPtDeEmaTimeframe {
    const vValue = String(pValue || "").trim().toLowerCase();
    if (vValue === "5s") {
        return "5s";
    }
    if (vValue === "5m" || vValue === "15m" || vValue === "1h") {
        return vValue;
    }
    return "1m";
}

function normalizeRenkoTimeframe(pValue: unknown): RollingOptionsPtDeRenkoTimeframe {
    const vValue = String(pValue || "").trim().toLowerCase();
    if (vValue === "5s") {
        return "5s";
    }
    return normalizeEmaTimeframe(vValue);
}

function getTimeMinutes(pTimeValue: string): number | null {
    const objMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(pTimeValue || "").trim());
    if (!objMatch) {
        return null;
    }
    return (Number(objMatch[1]) * 60) + Number(objMatch[2]);
}

function shouldRefreshPositivePnlExpiryNow(
    pUiState: Record<string, unknown>,
    pNow = new Date()
): { shouldRefresh: boolean; nextExpiryDate: string; } {
    const vMode = String((pUiState as any).positivePnlExpiryMode || "1").trim();
    if (vMode !== "1" && vMode !== "2") {
        return { shouldRefresh: false, nextExpiryDate: "" };
    }

    const vRefreshMinutes = getTimeMinutes(String((pUiState as any).positivePnlExpiryRefreshTime || ""));
    if (vRefreshMinutes === null) {
        return { shouldRefresh: false, nextExpiryDate: "" };
    }

    const vCurrentMinutes = (pNow.getHours() * 60) + pNow.getMinutes();
    if (vCurrentMinutes < vRefreshMinutes) {
        return { shouldRefresh: false, nextExpiryDate: "" };
    }

    const vNextExpiryDate = resolveExpiryDateByMode(vMode, pNow);
    const vCurrentExpiryDate = String((pUiState as any).positivePnlExpiryDate || "").trim();
    return {
        shouldRefresh: Boolean(vNextExpiryDate) && vCurrentExpiryDate !== vNextExpiryDate,
        nextExpiryDate: vNextExpiryDate
    };
}

function normalizeEmaSource(pValue: unknown): "candles" | "renko" {
    return String(pValue || "").trim().toLowerCase() === "renko" ? "renko" : "candles";
}

function normalizeEmaPeriod(pValue: unknown): number {
    const vValue = Math.floor(Number(pValue || 0));
    return Number.isFinite(vValue) ? Math.min(500, Math.max(1, vValue)) : 20;
}

function getLotSizeForSymbol(pSymbol: string): number {
    const vSymbol = String(pSymbol || "").trim().toUpperCase();
    return vSymbol === "ETH" ? 0.01 : 0.001;
}

function createPositionBase(pUserId: string): Pick<
    RollingOptionsPtDePositionRecord,
    "positionId" | "userId" | "groupId" | "cycleId" | "createdAt" | "updatedAt"
> {
    const vNow = new Date().toISOString();
    return {
        positionId: crypto.randomUUID(),
        userId: pUserId,
        groupId: `group_${Date.now()}`,
        cycleId: `manual_${Date.now()}`,
        createdAt: vNow,
        updatedAt: vNow
    };
}

function getOptionDeltaTargetsFromPct(
    pEntryDelta: number,
    pAction: "BUY" | "SELL",
    pTakeProfitPct: number,
    pStopLossPct: number
): { takeProfitDelta: number; stopLossDelta: number; } {
    const clamp01 = (pValue: number): number => Math.min(1, Math.max(0, pValue));
    const normalizeTarget = (pValue: number): number => clamp01(pValue > 1 ? pValue / 100 : pValue);
    const vTakeProfitDelta = normalizeTarget(pTakeProfitPct);
    const vStopLossDelta = normalizeTarget(pStopLossPct);
    return {
        takeProfitDelta: vTakeProfitDelta,
        stopLossDelta: vStopLossDelta
    };
}

function getSimulatedSpotPrice(pSymbol: string): number {
    const vBase = String(pSymbol || "").trim().toUpperCase() === "ETH" ? 3200 : 64000;
    return Number((vBase + ((Date.now() % 1000) - 500) / 10).toFixed(2));
}

function getSimulatedFuturePrice(pSymbol: string): number {
    const vSpotPrice = getSimulatedSpotPrice(pSymbol);
    return Number((vSpotPrice * 1.0012).toFixed(2));
}

function getSimulatedOptionPrice(pSymbol: string, pDelta: number): number {
    const vSpotPrice = getSimulatedSpotPrice(pSymbol);
    const vPremiumFactor = Math.max(0.0025, Math.min(Math.abs(pDelta) * 0.018, 0.02));
    return Number((vSpotPrice * vPremiumFactor).toFixed(2));
}

async function getLiveOrFallbackMarketSnapshot(pUiState: Record<string, unknown>): Promise<{
    spotPrice: number;
    futuresPrice: number;
    bestBidPrice: number;
    bestAskPrice: number;
    ts: string;
    priceSource: "public" | "simulated";
}> {
    const objConfig = buildConfigFromUiState(pUiState);
    ensureLiveTickerSymbols([objConfig.contractName]);

    try {
        const objSnapshot = await getLiveMarketSnapshot(objConfig);
        return {
            spotPrice: objSnapshot.spotPrice,
            futuresPrice: objSnapshot.futuresPrice,
            bestBidPrice: objSnapshot.bestBidPrice,
            bestAskPrice: objSnapshot.bestAskPrice,
            ts: objSnapshot.ts,
            priceSource: objSnapshot.priceSource
        };
    }
    catch (_objError) {
        const vNow = new Date().toISOString();
        const vSpotPrice = getSimulatedSpotPrice(objConfig.symbol);
        const vFuturesPrice = getSimulatedFuturePrice(objConfig.symbol);
        return {
            spotPrice: vSpotPrice,
            futuresPrice: vFuturesPrice,
            bestBidPrice: Number((vFuturesPrice * 0.9998).toFixed(2)),
            bestAskPrice: Number((vFuturesPrice * 1.0002).toFixed(2)),
            ts: vNow,
            priceSource: "simulated"
        };
    }
}

async function getLiveOrFallbackOptionQuote(
    pUiState: Record<string, unknown>,
    pOptionSide: "CE" | "PE",
    pDelta: number,
    pMaxDeltaGap?: number
): Promise<{
    contractName: string;
    strike: number;
    expiryDate: string;
    entryPrice: number;
    bestBid: number | null;
    bestAsk: number | null;
    entryDelta: number;
    metadata: Record<string, unknown>;
    usedNextDayFallback?: boolean;
    contractSymbol?: string;
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    markPrice?: number;
    requestedExpiryDate?: string;
    resolvedExpiryDate?: string;
}> {
    const objConfig = buildConfigFromUiState(pUiState);
    const objSnapshot = await getLiveOrFallbackMarketSnapshot(pUiState);
    const vFallbackStrike = Math.round(objSnapshot.spotPrice / 100) * 100;

    try {
        const objLiveContract = await findBestLiveOptionContract(objConfig, pOptionSide, pDelta, false, pMaxDeltaGap);
        if (objLiveContract?.contractSymbol) {
            ensureLiveTickerSymbols([objLiveContract.contractSymbol]);
        }
        if (objLiveContract) {
            return {
                contractName: objLiveContract.contractSymbol,
                strike: objLiveContract.strike,
                expiryDate: objLiveContract.expiryDate,
                entryPrice: objLiveContract.markPrice,
                bestBid: objLiveContract.bestBid,
                bestAsk: objLiveContract.bestAsk,
                entryDelta: Math.abs(objLiveContract.delta),
                contractSymbol: objLiveContract.contractSymbol,
                delta: objLiveContract.delta,
                gamma: objLiveContract.gamma,
                theta: objLiveContract.theta,
                vega: objLiveContract.vega,
                markPrice: objLiveContract.markPrice,
                usedNextDayFallback: Boolean(objLiveContract.usedNextDayFallback),
                requestedExpiryDate: objLiveContract.requestedExpiryDate,
                resolvedExpiryDate: objLiveContract.expiryDate,
                metadata: {
                    entrySpotPrice: objSnapshot.spotPrice,
                    productSymbol: objLiveContract.contractSymbol,
                    productDelta: objLiveContract.delta,
                    productGamma: objLiveContract.gamma,
                    productTheta: objLiveContract.theta,
                    productVega: objLiveContract.vega,
                    productMarkPrice: objLiveContract.markPrice,
                    productBestBid: objLiveContract.bestBid,
                    productBestAsk: objLiveContract.bestAsk,
                    requestedExpiryDate: objLiveContract.requestedExpiryDate,
                    resolvedExpiryDate: objLiveContract.expiryDate,
                    usedNextDayFallback: Boolean(objLiveContract.usedNextDayFallback),
                    source: objSnapshot.priceSource === "public" ? "demo-manual-option-live" : "demo-manual-option-simulated"
                }
            };
        }
    }
    catch (_objError) {
    }

    const vFallbackPrice = getSimulatedOptionPrice(objConfig.symbol, pDelta);
    return {
        contractName: `${objConfig.contractName} ${pOptionSide}`,
        strike: vFallbackStrike,
        expiryDate: objConfig.expiryDate,
        entryPrice: vFallbackPrice,
        bestBid: Number((vFallbackPrice * 0.995).toFixed(2)),
        bestAsk: Number((vFallbackPrice * 1.005).toFixed(2)),
        entryDelta: pDelta,
        metadata: {
            entrySpotPrice: objSnapshot.spotPrice,
            productSymbol: "",
            productDelta: pDelta,
            productGamma: 0,
            productTheta: 0,
            productVega: 0,
            source: "demo-manual-option-simulated"
        }
    };
}

async function loadMergedUiState(pUserId: string): Promise<Record<string, unknown>> {
    const objProfile = await loadRollingOptionsPtDeProfile(pUserId);
    const objUiState = {
        ...getDefaultUiState(),
        ...(objProfile?.uiState || {})
    };
    if (!Number.isFinite(Number(objUiState.redOptQty))) {
        const vLegacyPct = Number(objUiState.redOptQtyPct ?? objUiState.autoOptQtyPct);
        const vBaseQty = Math.max(1, Math.floor(Number(objUiState.manualFutQty || 1)));
        objUiState.redOptQty = Number.isFinite(vLegacyPct)
            ? Math.max(0, Math.round(vBaseQty * vLegacyPct / 100))
            : 1;
    }
    else {
        objUiState.redOptQty = Math.max(0, Math.floor(Number(objUiState.redOptQty)));
    }
    if (!Number.isFinite(Number(objUiState.greenOptQty))) {
        const vLegacyPct = Number(objUiState.greenOptQtyPct);
        const vBaseQty = Math.max(1, Math.floor(Number(objUiState.manualFutQty || 1)));
        objUiState.greenOptQty = Number.isFinite(vLegacyPct)
            ? Math.max(0, Math.round(vBaseQty * vLegacyPct / 100))
            : 1;
    }
    else {
        objUiState.greenOptQty = Math.max(0, Math.floor(Number(objUiState.greenOptQty)));
    }
    if (!Number.isFinite(Number(objUiState.greenReDelta))) {
        objUiState.greenReDelta = normalizeNumber(objUiState.reDelta1, 0.53);
    }
    if (!Number.isFinite(Number(objUiState.greenTpDelta))) {
        objUiState.greenTpDelta = normalizeNumber(objUiState.deltaTp1, 0.15);
    }
    if (!Number.isFinite(Number(objUiState.greenSlDelta))) {
        objUiState.greenSlDelta = normalizeNumber(objUiState.deltaSl1, 0.85);
    }
    if (!Number.isFinite(Number(objUiState.greenTpPct))) {
        const vLegacy = normalizeNumber(objUiState.greenTpDelta, 0.15);
        objUiState.greenTpPct = Math.max(0, Math.min(100, vLegacy <= 2 ? vLegacy * 100 : vLegacy));
    }
    if (!Number.isFinite(Number(objUiState.greenSlPct))) {
        const vLegacy = normalizeNumber(objUiState.greenSlDelta, 0.85);
        objUiState.greenSlPct = Math.max(0, Math.min(100, vLegacy <= 2 ? vLegacy * 100 : vLegacy));
    }
    if (!Number.isFinite(Number(objUiState.redTpPct))) {
        const vLegacy = normalizeNumber((objUiState as Record<string, unknown>).redTpDelta ?? objUiState.deltaTp1, 0.15);
        objUiState.redTpPct = Math.max(0, Math.min(100, vLegacy <= 2 ? vLegacy * 100 : vLegacy));
    }
    if (!Number.isFinite(Number(objUiState.redSlPct))) {
        const vLegacy = normalizeNumber((objUiState as Record<string, unknown>).redSlDelta ?? objUiState.deltaSl1, 0.85);
        objUiState.redSlPct = Math.max(0, Math.min(100, vLegacy <= 2 ? vLegacy * 100 : vLegacy));
    }
    objUiState.demoBalance = Math.max(0, normalizeNumber(objUiState.demoBalance, 10000));
    objUiState.skipRenkoEntryNoOpenOptions = Boolean((objUiState as any).skipRenkoEntryNoOpenOptions);
    objUiState.boxColorChangeOpenEnabled = Boolean((objUiState as any).boxColorChangeOpenEnabled);
    const vExpiryMode = String(objUiState.expiryMode1 || "1");
    const vExpiryMode2 = String(objUiState.expiryMode2 || "1");
    return {
        ...objUiState,
        expiryDate1: resolveExpiryDateByMode(vExpiryMode),
        expiryDate2: vExpiryMode2 === "1" || vExpiryMode2 === "2"
            ? resolveExpiryDateByMode(vExpiryMode2)
            : objUiState.expiryDate2
    };
}

function getDefaultUiState(): Record<string, unknown> {
    return {
        symbol: "BTC",
        manualFutQty: 1,
        manualFutOrderType: "market_order",
        manualFutAction: "SELL",
        futuresEnabled: true,
        action1: "sell",
        legSide1: "ce",
        expiryMode1: "1",
        expiryDate1: "",
        manualOptQty1: 1,
        reDelta1: 0.53,
        deltaTp1: 0.15,
        deltaSl1: 0.85,
        reEnter1: false,
        action2: "none",
        legSide2: "pe",
        expiryMode2: "1",
        expiryDate2: "",
        manualOptQty2: 1,
        reEnter2: false,
        greenOptQty2: 1,
        greenReDelta2: 0.53,
        greenTpPct2: 0.50,
        greenSlPct2: 0.90,
        redOptQty2: 1,
        redReDelta2: 0.53,
        redTpPct2: 0.50,
        redSlPct2: 0.90,
        redOptQty: 1,
        redTpPct: 0.50,
        redSlPct: 0.90,
        greenOptQty: 1,
        greenReDelta: 0.53,
        greenTpDelta: 0.15,
        greenSlDelta: 0.85,
        greenTpPct: 0.50,
        greenSlPct: 0.90,
        trailGreenTp1Enabled: true,
        trailGreenSl1Enabled: true,
        trailRedTp1Enabled: true,
        trailRedSl1Enabled: true,
        renkoFeedEnabled: true,
        trailGreenTp2Enabled: true,
        trailGreenSl2Enabled: true,
        trailRedTp2Enabled: true,
        trailRedSl2Enabled: true,
        renkoFeedPts: 10,
        renkoFeedManualPrice: null,
        renkoManualPriceResetToken: 0,
        renkoFeedTimeframe: "1m",
        renkoFeedPriceSrc: "spot_price",
        emaEnabled: false,
        emaSource: "candles",
        emaSignalEnabled: false,
        emaRenkoConfirmEnabled: false,
        emaTimeframe: "1m",
        emaPeriod: 20,
        tradingViewEmaEnabled: false,
        tradingViewEmaSide: "both",
        demoBalance: 10000,
        closeAllLegsOnAnyClose: false,
        closeSupportLegOnSourceClose: false,
        skipRenkoEntryNoOpenOptions: false,
        boxColorChangeOpenEnabled: false,
        positivePnlSupportEnabled: true,
        positivePnlSupportAction: "buy",
        positivePnlSupportQty: 10,
        positivePnlMaxLegs: 1,
        positivePnlTriggerAmount: 0,
        positivePnlTpPct: 15,
        positivePnlSlPct: 85,
        positivePnlExpiryMode: "1",
        positivePnlExpiryDate: "",
        positivePnlExpiryRefreshTime: "",
        positivePnlTargetDelta: 0.53,
        positivePnlTrailSlEnabled: false,
        positivePnlAdverseRenkoCloseEnabled: false,
        optionsPnl: 0,
        telegramAlertsEnabled: false,
        telegramAlertTypes: [
            "engine_started",
            "engine_stopped",
            "engine_error",
            "sl_triggered",
            "tp_triggered",
            "reentry_opened",
            "kill_switch"
        ],
        closedFromDate: "",
        closedToDate: ""
    };
}

function isPositivePnlSupportPosition(pPosition: RollingOptionsPtDePositionRecord): boolean {
    const objMetadata = (pPosition.metadata || {}) as Record<string, unknown>;
    return Boolean(objMetadata.positivePnlSupport || objMetadata.negativePnlAdjustment);
}

function isPositivePnlSupportLeg(pPosition: RollingOptionsPtDePositionRecord): boolean {
    const objMetadata = (pPosition.metadata || {}) as Record<string, unknown>;
    return Boolean(objMetadata.positivePnlSupport);
}

function normalizeTradingViewEmaTrend(pValue: unknown): "UP" | "DOWN" | "FLAT" {
    const vValue = String(pValue || "").trim().toUpperCase();
    if (vValue === "UP" || vValue === "EMA_UP" || vValue === "BUY" || vValue === "LONG") {
        return "UP";
    }
    if (vValue === "DOWN" || vValue === "EMA_DOWN" || vValue === "SELL" || vValue === "SHORT") {
        return "DOWN";
    }
    return "FLAT";
}

function normalizeTradingViewEmaSide(pValue: unknown): "UP" | "DOWN" | "BOTH" {
    const vValue = String(pValue || "").trim().toUpperCase();
    if (vValue === "UP" || vValue === "EMA_UP" || vValue === "BUY" || vValue === "LONG") {
        return "UP";
    }
    if (vValue === "DOWN" || vValue === "EMA_DOWN" || vValue === "SELL" || vValue === "SHORT") {
        return "DOWN";
    }
    return "BOTH";
}

function migratePositivePnlSettings(
    pUiState: Record<string, unknown>,
    pSavedUiState?: Record<string, unknown> | null
): Record<string, unknown> {
    const objSaved = pSavedUiState || {};
    const getMigratedValue = (pPositiveKey: string, pLegacyKey: string, pFallback: unknown): unknown => {
        if (objSaved[pPositiveKey] !== undefined) {
            return objSaved[pPositiveKey];
        }
        if (objSaved[pLegacyKey] !== undefined) {
            return objSaved[pLegacyKey];
        }
        return pUiState[pPositiveKey] ?? pFallback;
    };
    const objUiState = {
        ...pUiState,
        positivePnlSupportEnabled: Boolean(getMigratedValue("positivePnlSupportEnabled", "negativePnlHedgeEnabled", true)),
        positivePnlSupportAction: String(getMigratedValue("positivePnlSupportAction", "negativePnlAction3", "buy")).trim().toLowerCase() === "sell" ? "sell" : "buy",
        positivePnlSupportQty: getMigratedValue("positivePnlSupportQty", "negativePnlHedgeQty", 10),
        positivePnlMaxLegs: getMigratedValue("positivePnlMaxLegs", "negativePnlMaxLegs", 1),
        positivePnlTriggerAmount: Math.min(0, normalizeNumber(pUiState.positivePnlTriggerAmount, 0)),
        positivePnlTpPct: getMigratedValue("positivePnlTpPct", "negativePnlTpPct", 15),
        positivePnlSlPct: getMigratedValue("positivePnlSlPct", "negativePnlSlPct", 85),
        positivePnlExpiryMode: getMigratedValue("positivePnlExpiryMode", "negativePnlHedgeExpiryMode", "1"),
        positivePnlExpiryDate: String(pUiState.positivePnlExpiryDate || "").trim(),
        positivePnlExpiryRefreshTime: String(pUiState.positivePnlExpiryRefreshTime || "").trim(),
        positivePnlTargetDelta: getMigratedValue("positivePnlTargetDelta", "negativePnlHedgeDelta", 0.53),
        positivePnlTrailSlEnabled: Boolean(pUiState.positivePnlTrailSlEnabled ?? false),
        positivePnlAdverseRenkoCloseEnabled: Boolean(getMigratedValue(
            "positivePnlAdverseRenkoCloseEnabled",
            "negativePnlRenkoCloseOnly",
            false
        ))
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(objUiState.positivePnlExpiryDate || ""))) {
        objUiState.positivePnlExpiryDate = "";
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(objUiState.positivePnlExpiryRefreshTime || ""))) {
        objUiState.positivePnlExpiryRefreshTime = "";
    }
    return objUiState;
}

const REPLACEMENT_CONDITION_KEYS = [
    "replacementBlockSameLegEnabled",
    "replacementImmediateTriggerGuardEnabled",
    "replacementCloseOrphanEnabled",
    "replacementCloseWhenOriginalPositiveEnabled",
    "replacementCloseEmaMismatchEnabled",
    "replacementUseRenkoColorEnabled",
    "replacementUseEmaTrendEnabled",
    "replacementWaitForRenkoPointEnabled"
] as const;

function normalizeReplacementConditionSettings(pUiState: Record<string, unknown>): Record<string, unknown> {
    const objUiState = { ...(pUiState || {}) };
    for (const vKey of REPLACEMENT_CONDITION_KEYS) {
        if (vKey === "replacementCloseEmaMismatchEnabled" || vKey === "replacementWaitForRenkoPointEnabled") {
            objUiState[vKey] = (objUiState as any)[vKey] === true;
            continue;
        }
        objUiState[vKey] = (objUiState as any)[vKey] !== false;
    }
    return objUiState;
}

function isReplacementConditionEnabled(pUiState: Record<string, unknown>, pKey: typeof REPLACEMENT_CONDITION_KEYS[number]): boolean {
    return (pUiState as any)?.[pKey] !== false;
}

export class RollingOptionsStrangleService {
    private readonly stateByUserId = new Map<string, RollingOptionsPtDeEngineState>();
    private readonly boxStateByUserId = new Map<string, RollingOptionsPtDeEngineState["renko"]>();

    public constructor(private readonly runnerManager: RunnerManager) {}

    private async loadUiState(pUserId: string): Promise<Record<string, unknown>> {
        const objProfile = await loadRollingOptionsPtDeProfile(pUserId);
        const objSavedUiState = (objProfile?.uiState || {}) as Record<string, unknown>;
        const objUiState = normalizeReplacementConditionSettings(migratePositivePnlSettings({
            symbol: "BTC",
            manualFutQty: 1,
            manualFutOrderType: "market_order",
            manualFutAction: "SELL",
            futuresEnabled: true,
            replacementBlockSameLegEnabled: true,
            replacementImmediateTriggerGuardEnabled: true,
            replacementCloseOrphanEnabled: true,
            replacementCloseWhenOriginalPositiveEnabled: true,
            replacementCloseEmaMismatchEnabled: false,
            replacementUseRenkoColorEnabled: true,
            replacementUseEmaTrendEnabled: true,
            replacementWaitForRenkoPointEnabled: false,
            action1: "sell",
            legSide1: "ce",
            expiryMode1: "1",
            expiryDate1: "",
            manualOptQty1: 1,
            reDelta1: 0.53,
            deltaTp1: 0.15,
            deltaSl1: 0.85,
            reEnter1: false,
            redOptQty: 1,
            greenOptQty: 1,
            greenReDelta: 0.53,
            greenTpDelta: 0.15,
            greenSlDelta: 0.85,
            greenTpPct: 0.50,
            greenSlPct: 0.90,
            redTpPct: 0.50,
            redSlPct: 0.90,
            targetOpenPnl: 0,
            closeAllLegsOnAnyClose: false,
            closeSupportLegOnSourceClose: false,
            skipRenkoEntryNoOpenOptions: false,
            boxColorChangeOpenEnabled: false,
            trailGreenTp1Enabled: true,
            trailGreenSl1Enabled: true,
            trailRedTp1Enabled: true,
            trailRedSl1Enabled: true,
            renkoFeedEnabled: true,
            trailGreenTp2Enabled: true,
            trailGreenSl2Enabled: true,
            trailRedTp2Enabled: true,
            trailRedSl2Enabled: true,
            renkoFeedPts: 10,
            renkoFeedManualPrice: null,
            renkoManualPriceResetToken: 0,
            renkoFeedTimeframe: "1m",
            renkoFeedPriceSrc: "spot_price",
            emaEnabled: false,
            emaSource: "candles",
            emaSignalEnabled: false,
            emaRenkoConfirmEnabled: false,
            emaTimeframe: "1m",
            emaPeriod: 20,
            tradingViewEmaEnabled: false,
            tradingViewEmaSide: "both",
            action2: "none",
            legSide2: "pe",
            expiryMode2: "1",
            expiryDate2: "",
            manualOptQty2: 1,
            reEnter2: false,
            greenOptQty2: 1,
            greenReDelta2: 0.53,
            greenTpPct2: 0.50,
            greenSlPct2: 0.90,
            redOptQty2: 1,
            redReDelta2: 0.53,
            redTpPct2: 0.50,
            redSlPct2: 0.90,
            positivePnlSupportEnabled: true,
            positivePnlSupportAction: "buy",
            positivePnlSupportQty: 10,
            positivePnlMaxLegs: 1,
            positivePnlTriggerAmount: 0,
            positivePnlTpPct: 15,
            positivePnlSlPct: 85,
            positivePnlExpiryMode: "1",
            positivePnlExpiryDate: "",
            positivePnlExpiryRefreshTime: "",
            positivePnlTargetDelta: 0.53,
            positivePnlTrailSlEnabled: false,
            positivePnlAdverseRenkoCloseEnabled: false,
            ...objSavedUiState
        } as Record<string, unknown>, objSavedUiState));

        (objUiState as any).addOneLotFuture = false;
        return objUiState;
    }

    private buildRuleSetConfig(pUiState: Record<string, unknown>, pRuleSet: 1 | 2): RollingOptionsPtDeConfig {
        const objState = { ...(pUiState || {}) } as Record<string, unknown>;

        if (pRuleSet === 2) {
            objState.action1 = (pUiState as any).action2;
            objState.legSide1 = (pUiState as any).legSide2;
            objState.expiryMode1 = (pUiState as any).expiryMode2;
            objState.expiryDate1 = (pUiState as any).expiryDate2;
            objState.manualOptQty1 = (pUiState as any).manualOptQty2;
            objState.reEnter1 = (pUiState as any).reEnter2;

            objState.greenOptQty = (pUiState as any).greenOptQty2;
            objState.greenReDelta = (pUiState as any).greenReDelta2;
            objState.greenTpPct = (pUiState as any).greenTpPct2;
            objState.greenSlPct = (pUiState as any).greenSlPct2;

            objState.redOptQty = (pUiState as any).redOptQty2;
            objState.redTpPct = (pUiState as any).redTpPct2;
            objState.redSlPct = (pUiState as any).redSlPct2;
            objState.reRedDelta = (pUiState as any).redReDelta2;
            objState.reDelta1 = (pUiState as any).redReDelta2;
        }

        const objConfig = buildConfigFromUiState(objState);
        objConfig.renkoTimeframe = normalizeRenkoTimeframe((pUiState as any).renkoFeedTimeframe);
        (objConfig as any).futuresEnabled = Boolean((pUiState as any).futuresEnabled ?? true);
        (objConfig as any).ruleSet = pRuleSet;
        (objConfig as any).__uiState = pUiState;
        if (pRuleSet === 2) {
            (objConfig as any).ruleSetGreenTpPct = Number((pUiState as any).greenTpPct2);
            (objConfig as any).ruleSetGreenSlPct = Number((pUiState as any).greenSlPct2);
            (objConfig as any).ruleSetRedTpPct = Number((pUiState as any).redTpPct2);
            (objConfig as any).ruleSetRedSlPct = Number((pUiState as any).redSlPct2);
        }
        objConfig.newDelta = 0.53;
        return objConfig;
    }

    private createInitialState(pUserId: string): RollingOptionsPtDeEngineState {
        return {
            userId: pUserId,
            running: false,
            isBusy: false,
            timerRef: null,
            cycleCount: 0,
            consecutiveFailures: 0,
            lastError: "",
            lastCycleAt: null,
            tradingViewEmaTrend: "FLAT",
            ema: {
                enabled: false,
                source: "candles",
                timeframe: "1m",
                period: 20,
                trend: "FLAT",
                signalTrend: "FLAT",
                value: null,
                close: null,
                candleCount: 0,
                calculatedAt: "",
                error: ""
            },
            renko: {
                anchor: null,
                lastDir: 0,
                lastColor: ""
            },
            market: {
                lastSpotPrice: null,
                lastFuturesPrice: null,
                lastSource: "simulated"
            },
            sourcePositiveCycleCountByPositionId: new Map()
        };
    }

    private getOrCreateState(pUserId: string): RollingOptionsPtDeEngineState {
        const vUserId = String(pUserId || "").trim() || "demo-paper";
        let objState = this.stateByUserId.get(vUserId);
        if (!objState) {
            objState = this.createInitialState(vUserId);
            this.stateByUserId.set(vUserId, objState);
        }
        return objState;
    }

    private getOrCreateBoxState(pUserId: string): RollingOptionsPtDeEngineState["renko"] {
        const vUserId = String(pUserId || "").trim() || "demo-paper";
        let objBoxState = this.boxStateByUserId.get(vUserId);
        if (!objBoxState) {
            objBoxState = {
                anchor: null,
                lastDir: 0,
                lastColor: "",
                lastPrice: null,
                historyKey: "",
                historySyncedAt: "",
                historyCandleCount: 0
            };
            this.boxStateByUserId.set(vUserId, objBoxState);
        }
        return objBoxState;
    }

    private updateBoxState(
        pBoxState: RollingOptionsPtDeEngineState["renko"],
        pSnapshot: RollingOptionsPtDeMarketSnapshot,
        pConfig: RollingOptionsPtDeConfig
    ): Array<"R" | "G"> {
        const vPrice = pConfig.renkoPriceSource === "spot_price"
            ? pSnapshot.spotPrice
            : (pConfig.renkoPriceSource === "best_bid"
                ? pSnapshot.bestBidPrice
                : (pConfig.renkoPriceSource === "best_ask"
                    ? pSnapshot.bestAskPrice
                    : pSnapshot.futuresPrice));
        const vStep = Math.max(1, Number(pConfig.renkoStepPoints || 10));
        const arrSignals: Array<"R" | "G"> = [];
        if (!Number.isFinite(vPrice) || vPrice <= 0) {
            return arrSignals;
        }

        pBoxState.lastPrice = vPrice;
        if (pBoxState.anchor === null || !Number.isFinite(pBoxState.anchor)) {
            pBoxState.anchor = Math.floor(vPrice / vStep) * vStep;
            pBoxState.lastDir = 0;
            pBoxState.lastColor = "";
            return arrSignals;
        }

        let vLowerAnchor = pBoxState.anchor;
        let vUpperAnchor = vLowerAnchor + vStep;
        if (vPrice > vUpperAnchor) {
            arrSignals.push("G");
            pBoxState.lastColor = "G";
            pBoxState.lastDir = 1;
            vUpperAnchor = vPrice;
            vLowerAnchor = vUpperAnchor - vStep;
        }
        else if (vPrice < vLowerAnchor) {
            arrSignals.push("R");
            pBoxState.lastColor = "R";
            pBoxState.lastDir = -1;
            vLowerAnchor = vPrice;
            vUpperAnchor = vLowerAnchor + vStep;
        }
        pBoxState.anchor = vLowerAnchor;
        return arrSignals;
    }

    public async hydrate(): Promise<void> {
        const objRuntimeRows = await listRollingOptionsPtDeRuntime();
        for (const objRuntime of objRuntimeRows) {
            if (!objRuntime.autoTraderEnabled || objRuntime.status !== "running") {
                continue;
            }

            const objState = this.getOrCreateState(objRuntime.userId);
            objState.running = true;
            objState.cycleCount = Number((objRuntime.state?.cycleCount as number) || 0);
            objState.consecutiveFailures = Number((objRuntime.state?.consecutiveFailures as number) || 0);
            objState.lastError = String(objRuntime.lastError || "");
            objState.lastCycleAt = objRuntime.lastCycleAt || null;
            objState.tradingViewEmaTrend = normalizeTradingViewEmaTrend(objRuntime.state?.tradingViewEmaTrend);
            objState.ema = {
                enabled: Boolean(objRuntime.state?.emaEnabled),
                source: normalizeEmaSource(objRuntime.state?.emaSource),
                timeframe: normalizeEmaTimeframe(objRuntime.state?.emaTimeframe),
                period: normalizeEmaPeriod(objRuntime.state?.emaPeriod),
                trend: normalizeTradingViewEmaTrend(objRuntime.state?.emaTrend),
                signalTrend: normalizeTradingViewEmaTrend(objRuntime.state?.emaSignalTrend),
                value: Number.isFinite(Number(objRuntime.state?.emaValue)) ? Number(objRuntime.state?.emaValue) : null,
                close: Number.isFinite(Number(objRuntime.state?.emaClose)) ? Number(objRuntime.state?.emaClose) : null,
                candleCount: Math.max(0, Math.floor(Number(objRuntime.state?.emaCandleCount || 0))),
                calculatedAt: String(objRuntime.state?.emaCalculatedAt || ""),
                error: String(objRuntime.state?.emaError || "")
            };
            objState.renko.anchor = Number.isFinite(Number(objRuntime.state?.renkoAnchor))
                ? Number(objRuntime.state?.renkoAnchor)
                : null;
            objState.renko.lastDir = Number(objRuntime.state?.renkoLastDir || 0) as -1 | 0 | 1;
            objState.renko.lastColor = String(objRuntime.state?.renkoLastColor || "") as "" | "R" | "G";
            objState.renko.lastPrice = objRuntime.state?.renkoCalculationPrice !== null
                && objRuntime.state?.renkoCalculationPrice !== undefined
                && Number.isFinite(Number(objRuntime.state.renkoCalculationPrice))
                ? Number(objRuntime.state?.renkoCalculationPrice)
                : null;
            objState.renko.historyKey = String(objRuntime.state?.renkoHistoryKey || "");
            objState.renko.historySyncedAt = String(objRuntime.state?.renkoHistorySyncedAt || "");
            objState.renko.historyCandleCount = Math.max(0, Math.floor(Number(objRuntime.state?.renkoHistoryCandleCount || 0)));
            const objBoxState = this.getOrCreateBoxState(objRuntime.userId);
            const vStoredBoxLowerAnchor = objRuntime.state?.boxLowerAnchor ?? objRuntime.state?.boxAnchor;
            objBoxState.anchor = Number.isFinite(Number(vStoredBoxLowerAnchor))
                ? Number(vStoredBoxLowerAnchor)
                : null;
            objBoxState.lastDir = Number(objRuntime.state?.boxLastDir || 0) as -1 | 0 | 1;
            objBoxState.lastColor = String(objRuntime.state?.boxLastColor || "") as "" | "R" | "G";
            objBoxState.lastPrice = objRuntime.state?.boxCalculationPrice !== null
                && objRuntime.state?.boxCalculationPrice !== undefined
                && Number.isFinite(Number(objRuntime.state.boxCalculationPrice))
                ? Number(objRuntime.state?.boxCalculationPrice)
                : null;
            objBoxState.historyKey = String(objRuntime.state?.boxHistoryKey || "");
            objBoxState.historySyncedAt = String(objRuntime.state?.boxHistorySyncedAt || "");
            objBoxState.historyCandleCount = Math.max(0, Math.floor(Number(objRuntime.state?.boxHistoryCandleCount || 0)));
            objState.market.lastSpotPrice = objRuntime.lastSpotPrice;
            objState.market.lastFuturesPrice = objRuntime.lastFuturesPrice;
            objState.market.lastSource = String(objRuntime.state?.marketSource || "simulated") === "public" ? "public" : "simulated";
            this.armTimer(objState);
        }
    }

    private armTimer(pState: RollingOptionsPtDeEngineState, pLoopSeconds = 8): void {
        if (pState.timerRef) {
            clearInterval(pState.timerRef);
        }

        pState.timerRef = setInterval(() => {
            void this.runCycle(pState.userId);
        }, Math.max(5, pLoopSeconds) * 1000);
    }

    private async loadConfig(pUserId: string): Promise<RollingOptionsPtDeConfig> {
        const objUiState = await this.loadUiState(pUserId);
        const objRefreshDecision = shouldRefreshPositivePnlExpiryNow(objUiState);
        if (objRefreshDecision.shouldRefresh) {
            objUiState.positivePnlExpiryDate = objRefreshDecision.nextExpiryDate;
            await patchRollingOptionsPtDeProfileUiState(pUserId, {
                positivePnlExpiryDate: objRefreshDecision.nextExpiryDate
            });
        }
        const objConfig = this.buildRuleSetConfig(objUiState, 1);
        (objConfig as any).__uiState = objUiState;
        return objConfig;
    }

    public async ensureFutureForOpenOptions(
        pUserId: string,
        pReason: string
    ): Promise<RollingOptionsPtDePositionRecord | null> {
        const objConfig = await this.loadConfig(pUserId);
        const bFuturesEnabled = Boolean((objConfig as any).futuresEnabled ?? true);
        if (!bFuturesEnabled) {
            return null;
        }

        const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const objSummary = getOpenPositionsSummary(arrOpenPositions);
        if (!objSummary.hasOpenOption) {
            return null;
        }

        const objExistingFuture = arrOpenPositions.find((objRow) => objRow.status === "OPEN" && objRow.instrumentType === "FUTURE") || null;
        if (objExistingFuture) {
            return objExistingFuture;
        }

        const vQty = Math.max(1, Math.floor(Number(objConfig.futureQty || 1)));
        return await this.openFuturePosition(pUserId, objConfig, vQty, pReason);
    }

    private getSimulatedSnapshot(pState: RollingOptionsPtDeEngineState, pConfig: RollingOptionsPtDeConfig): RollingOptionsPtDeMarketSnapshot {
        const vBase = pConfig.symbol === "ETH" ? 3200 : 64000;
        const vLastSpot = Number(pState.market.lastSpotPrice || vBase);
        const vBias = pState.renko.lastColor === "R" ? -1 : 1;
        const vRandomMove = ((Date.now() % 11) - 5) * (pConfig.renkoStepPoints / 4);
        const vTrendMove = vBias * (pConfig.renkoStepPoints / 5);
        const vSpotPrice = Number(Math.max(1, vLastSpot + vRandomMove + vTrendMove).toFixed(2));
        const vFuturesPrice = Number((vSpotPrice * 1.0012).toFixed(2));
        const vBestBidPrice = Number((vFuturesPrice * 0.9998).toFixed(2));
        const vBestAskPrice = Number((vFuturesPrice * 1.0002).toFixed(2));

        return {
            symbol: pConfig.symbol,
            contractName: pConfig.contractName,
            spotPrice: vSpotPrice,
            futuresPrice: vFuturesPrice,
            bestBidPrice: vBestBidPrice,
            bestAskPrice: vBestAskPrice,
            priceSource: "simulated",
            ts: new Date().toISOString()
        };
    }

    private getRuleValues(
        pConfig: RollingOptionsPtDeConfig,
        pColorCode: "R" | "G"
    ): {
        colorCode: "R" | "G";
        reDelta: number;
        takeProfitDelta: number;
        stopLossDelta: number;
    } {
        if (pColorCode === "G") {
            return {
                colorCode: "G",
                reDelta: Number(pConfig.greenReDelta ?? pConfig.reDelta ?? 0.53),
                takeProfitDelta: Number(pConfig.greenDeltaTakeProfit ?? pConfig.deltaTakeProfit ?? 0.15),
                stopLossDelta: Number(pConfig.greenDeltaStopLoss ?? pConfig.deltaStopLoss ?? 0.85)
            };
        }

        return {
            colorCode: "R",
            reDelta: Number(pConfig.redReDelta ?? pConfig.reDelta ?? 0.53),
            takeProfitDelta: Number(pConfig.redDeltaTakeProfit ?? pConfig.deltaTakeProfit ?? 0.15),
            stopLossDelta: Number(pConfig.redDeltaStopLoss ?? pConfig.deltaStopLoss ?? 0.85)
        };
    }

    private getPayoffSlCheckpoints(pUiState: Record<string, unknown>): Array<{ legKey: string; price: number; }> {
        const vAllLegsKey = "__all_legs__";
        const arrStructuredRaw = Array.isArray((pUiState as any)?.payoffSlCheckpoints)
            ? (pUiState as any).payoffSlCheckpoints
            : [];
        const arrStructured = arrStructuredRaw
            .map((pRow: unknown) => {
                const objRow = pRow && typeof pRow === "object"
                    ? pRow as { legKey?: unknown; price?: unknown; }
                    : null;
                const vPrice = Number(objRow?.price);
                if (!Number.isFinite(vPrice)) {
                    return null;
                }
                return {
                    legKey: String(objRow?.legKey || vAllLegsKey).trim() || vAllLegsKey,
                    price: vPrice
                };
            })
            .filter((pRow: { legKey: string; price: number; } | null): pRow is { legKey: string; price: number; } => Boolean(pRow));
        if (arrStructured.length > 0) {
            return arrStructured
                .filter((pRow: { legKey: string; price: number; }, pIndex: number, pRows: Array<{ legKey: string; price: number; }>) => {
                    return pRows.findIndex((pCandidate: { legKey: string; price: number; }) => {
                        return pCandidate.legKey === pRow.legKey && Math.abs(pCandidate.price - pRow.price) < 0.01;
                    }) === pIndex;
                })
                .sort((pLeft: { legKey: string; price: number; }, pRight: { legKey: string; price: number; }) => {
                    if (pLeft.legKey === pRight.legKey) {
                        return pLeft.price - pRight.price;
                    }
                    return pLeft.legKey.localeCompare(pRight.legKey);
                });
        }

        const arrRaw = Array.isArray((pUiState as any)?.payoffSlCheckpointPrices)
            ? (pUiState as any).payoffSlCheckpointPrices
            : (Number.isFinite(Number((pUiState as any)?.payoffSlCheckpointPrice))
                ? [Number((pUiState as any).payoffSlCheckpointPrice)]
                : []);

        return arrRaw
            .map((pValue: unknown) => Number(pValue))
            .filter((pValue: number) => Number.isFinite(pValue))
            .filter((pValue: number, pIndex: number, pValues: number[]) => {
                return pValues.findIndex((pCandidate) => Math.abs(pCandidate - pValue) < 0.01) === pIndex;
            })
            .sort((pLeft: number, pRight: number) => pLeft - pRight)
            .map((pPrice: number) => ({
                legKey: vAllLegsKey,
                price: pPrice
            }));
    }

    private getCrossedPayoffSlCheckpoints(
        pPreviousSpotPrice: number,
        pCurrentSpotPrice: number,
        pCheckpoints: Array<{ legKey: string; price: number; }>
    ): Array<{ legKey: string; price: number; }> {
        if (!Number.isFinite(pPreviousSpotPrice) || !Number.isFinite(pCurrentSpotPrice)) {
            return [];
        }

        if (Math.abs(pPreviousSpotPrice - pCurrentSpotPrice) < 0.000001) {
            return [];
        }

        const vMinPrice = Math.min(pPreviousSpotPrice, pCurrentSpotPrice);
        const vMaxPrice = Math.max(pPreviousSpotPrice, pCurrentSpotPrice);
        return pCheckpoints.filter((pCheckpoint) => {
            return pCheckpoint.price >= vMinPrice && pCheckpoint.price <= vMaxPrice;
        });
    }

    private async handlePayoffSlCheckpointTrigger(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pOpenPositions: RollingOptionsPtDePositionRecord[],
        pPreviousSpotPrice: number,
        pCurrentSpotPrice: number
    ): Promise<{ triggered: boolean; signal: string; message: string; }> {
        const arrOpenPositions = (Array.isArray(pOpenPositions) ? pOpenPositions : [])
            .filter((pPosition) => pPosition?.status === "OPEN");
        if (arrOpenPositions.length <= 0) {
            return { triggered: false, signal: "", message: "" };
        }

        const vAllLegsKey = "__all_legs__";
        const objUiState = ((pConfig as any).__uiState || await this.loadUiState(pUserId)) as Record<string, unknown>;
        const arrCheckpoints = this.getPayoffSlCheckpoints(objUiState);
        const arrTriggeredCheckpoints = this.getCrossedPayoffSlCheckpoints(
            pPreviousSpotPrice,
            pCurrentSpotPrice,
            arrCheckpoints
        );
        if (arrTriggeredCheckpoints.length <= 0) {
            return { triggered: false, signal: "", message: "" };
        }

        const arrRemainingCheckpoints = arrCheckpoints.filter((pCheckpoint) => {
            return !arrTriggeredCheckpoints.some((pTriggeredCheckpoint) => {
                return pTriggeredCheckpoint.legKey === pCheckpoint.legKey && Math.abs(pTriggeredCheckpoint.price - pCheckpoint.price) < 0.01;
            });
        });
        const arrTargetPositions = arrTriggeredCheckpoints.some((pCheckpoint) => pCheckpoint.legKey === vAllLegsKey)
            ? arrOpenPositions
            : arrOpenPositions.filter((pPosition) => {
                const vPositionId = String((pPosition as any)?.positionId || "").trim();
                return arrTriggeredCheckpoints.some((pCheckpoint) => pCheckpoint.legKey === vPositionId);
            });
        const arrTargetPositionIds = arrTargetPositions
            .map((pPosition) => String((pPosition as any)?.positionId || "").trim())
            .filter(Boolean);

        const objNextUiState = {
            ...objUiState,
            payoffSlCheckpointPrices: arrRemainingCheckpoints
                .filter((pCheckpoint) => pCheckpoint.legKey === vAllLegsKey)
                .map((pCheckpoint) => pCheckpoint.price),
            payoffSlCheckpoints: arrRemainingCheckpoints
        } as Record<string, unknown>;
        const objUpdatedProfile = await patchRollingOptionsPtDeProfileUiState(pUserId, {
            payoffSlCheckpointPrices: objNextUiState.payoffSlCheckpointPrices,
            payoffSlCheckpoints: objNextUiState.payoffSlCheckpoints
        });
        (pConfig as any).__uiState = objUpdatedProfile.uiState;

        if (arrTargetPositions.length <= 0) {
            return { triggered: false, signal: "", message: "" };
        }

        const vCheckpointLabel = arrTriggeredCheckpoints
            .map((pCheckpoint) => `${pCheckpoint.legKey === vAllLegsKey ? "All legs" : pCheckpoint.legKey} @ ${pCheckpoint.price.toFixed(2)}`)
            .join(", ");
        const objClosedPositions = await this.closePositions(arrTargetPositions, pConfig, `Payoff graph exit point triggered @ ${vCheckpointLabel}`);
        if (!arrTriggeredCheckpoints.some((pCheckpoint) => pCheckpoint.legKey === vAllLegsKey)) {
            await this.reEnterClosedOptionPositions(pUserId, objClosedPositions, "Payoff graph exit point");
        }
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "warning",
            title: "Payoff Exit Point Triggered",
            message: `Closed ${arrTargetPositions.length} paper position(s) after spot crossed payoff exit point(s).`,
            payload: {
                symbol: pConfig.symbol,
                qty: arrTargetPositions.length,
                reason: "payoff_graph_exit_point_triggered",
                previousSpotPrice: pPreviousSpotPrice,
                currentSpotPrice: pCurrentSpotPrice,
                checkpoints: arrTriggeredCheckpoints,
                remainingCheckpoints: arrRemainingCheckpoints,
                targetPositionIds: arrTargetPositionIds
            }
        });
        return {
            triggered: true,
            signal: "PAYOFF_EXIT_POINT_TRIGGERED",
            message: `Cycle completed with payoff exit point close at ${vCheckpointLabel}.`
        };
    }

    private async getMarketSnapshot(pState: RollingOptionsPtDeEngineState, pConfig: RollingOptionsPtDeConfig): Promise<RollingOptionsPtDeMarketSnapshot> {
        ensureLiveTickerSymbols([pConfig.contractName]);
        let objLastError: unknown = null;
        for (let vAttempt = 0; vAttempt < 3; vAttempt += 1) {
            try {
                return await getLiveMarketSnapshot(pConfig);
            }
            catch (objError) {
                objLastError = objError;
                if (vAttempt < 2) {
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, 250 * (vAttempt + 1));
                    });
                }
            }
        }

        const vSpot = Number(pState.market.lastSpotPrice ?? NaN);
        const vFutures = Number(pState.market.lastFuturesPrice ?? NaN);
        const vFallbackSpot = Number.isFinite(vSpot) && vSpot > 0 ? vSpot : (Number.isFinite(vFutures) && vFutures > 0 ? vFutures : 0);
        const vFallbackFutures = Number.isFinite(vFutures) && vFutures > 0 ? vFutures : vFallbackSpot;
        if (vFallbackSpot > 0 && vFallbackFutures > 0) {
            return {
                symbol: pConfig.symbol,
                contractName: pConfig.contractName,
                spotPrice: vFallbackSpot,
                futuresPrice: vFallbackFutures,
                bestBidPrice: vFallbackFutures,
                bestAskPrice: vFallbackFutures,
                priceSource: pState.market.lastSource,
                ts: new Date().toISOString()
            };
        }

        if (pConfig.renkoEnabled) {
            throw (objLastError instanceof Error ? objLastError : new Error("Unable to load live market snapshot."));
        }
        return this.getSimulatedSnapshot(pState, pConfig);
    }

    private async buildRuntimeRecord(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState,
        pOverrides: Partial<RollingOptionsPtDeRuntimeRecord> = {}
    ): Promise<RollingOptionsPtDeRuntimeRecord> {
        const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const vLastSignal = pOverrides.lastSignal
            || (pState.renko.lastColor === "R" ? "RED" : (pState.renko.lastColor === "G" ? "GREEN" : "IDLE"));
        const objBoxState = this.getOrCreateBoxState(pUserId);

        return {
            userId: pUserId,
            status: pOverrides.status || (pState.running ? "running" : "stopped"),
            autoTraderEnabled: pOverrides.autoTraderEnabled ?? pState.running,
            currentSymbol: pConfig.symbol,
            currentContractName: pConfig.contractName,
            currentExpiryMode: pConfig.expiryMode,
            currentExpiryDate: pConfig.expiryDate,
            renkoEnabled: pConfig.renkoEnabled,
            renkoPoints: pConfig.renkoStepPoints,
            renkoSource: pConfig.renkoPriceSource,
            lastSpotPrice: pOverrides.lastSpotPrice ?? pState.market.lastSpotPrice,
            lastFuturesPrice: pOverrides.lastFuturesPrice ?? pState.market.lastFuturesPrice,
            lastSignal: vLastSignal,
            lastCycleAt: pOverrides.lastCycleAt ?? pState.lastCycleAt ?? "",
            lastError: pOverrides.lastError ?? pState.lastError,
            state: {
                cycleCount: pState.cycleCount,
                consecutiveFailures: pState.consecutiveFailures,
                renkoAnchor: pState.renko.anchor,
                renkoLastDir: pState.renko.lastDir,
                renkoLastColor: pState.renko.lastColor,
                renkoCalculationPrice: pState.renko.lastPrice ?? null,
                renkoManualPrice: pConfig.renkoManualPrice ?? null,
                renkoTimeframe: pConfig.renkoTimeframe || "1m",
                renkoHistoryKey: pState.renko.historyKey || "",
                renkoHistorySyncedAt: pState.renko.historySyncedAt || "",
                renkoHistoryCandleCount: pState.renko.historyCandleCount || 0,
                boxLowerAnchor: objBoxState.anchor,
                boxUpperAnchor: objBoxState.anchor !== null
                    ? objBoxState.anchor + Math.max(1, Number(((pConfig as any).__uiState || {}).boxConditionPoints || 10))
                    : null,
                boxLastDir: objBoxState.lastDir,
                boxLastColor: objBoxState.lastColor,
                boxCalculationPrice: objBoxState.lastPrice ?? null,
                boxHistoryKey: objBoxState.historyKey || "",
                boxHistorySyncedAt: objBoxState.historySyncedAt || "",
                boxHistoryCandleCount: objBoxState.historyCandleCount || 0,
                boxConditionEnabled: Boolean(((pConfig as any).__uiState || {}).boxConditionEnabled),
                tradingViewEmaEnabled: Boolean(((pConfig as any).__uiState || {}).tradingViewEmaEnabled),
                tradingViewEmaSide: normalizeTradingViewEmaSide(((pConfig as any).__uiState || {}).tradingViewEmaSide),
                tradingViewEmaTrend: pState.tradingViewEmaTrend || "FLAT",
                emaEnabled: pState.ema.enabled,
                emaSource: pState.ema.source,
                emaSignalEnabled: Boolean(((pConfig as any).__uiState || {}).emaSignalEnabled),
                emaRenkoConfirmEnabled: Boolean(((pConfig as any).__uiState || {}).emaRenkoConfirmEnabled),
                emaTimeframe: pState.ema.timeframe,
                emaPeriod: pState.ema.period,
                emaTrend: pState.ema.trend,
                emaSignalTrend: pState.ema.signalTrend,
                emaValue: pState.ema.value,
                emaClose: pState.ema.close,
                emaCandleCount: pState.ema.candleCount,
                emaCalculatedAt: pState.ema.calculatedAt,
                emaError: pState.ema.error,
                marketSource: pState.market.lastSource,
                openPositions: objOpenPositions.length
            },
            updatedAt: ""
        };
    }

    private async syncRuntime(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState,
        pOverrides: Partial<RollingOptionsPtDeRuntimeRecord> = {}
    ): Promise<RollingOptionsPtDeRuntimeRecord> {
        const objRuntime = await this.buildRuntimeRecord(pUserId, pConfig, pState, pOverrides);
        await this.runnerManager.setState({
            userId: pUserId,
            strategyType: "rolling-options-strangle",
            status: objRuntime.status === "running" ? "running" : "stopped",
            updatedAt: new Date().toISOString(),
            message: objRuntime.lastError || objRuntime.lastSignal || "Rolling Option Strangle Demo",
            state: objRuntime.state
        });
        return saveRollingOptionsPtDeRuntime(objRuntime);
    }

    private getDemoBalanceLimit(pConfig: RollingOptionsPtDeConfig): number | null {
        const vBalance = Number(pConfig.demoBalance);
        if (!Number.isFinite(vBalance) || vBalance <= 0) {
            return null;
        }
        return vBalance;
    }

    private calculatePaperNotional(pQty: number, pLotSize: number, pPrice: number): number {
        const vQty = Math.max(0, Number(pQty || 0));
        const vLotSize = Math.max(0, Number(pLotSize || 0));
        const vPrice = Math.max(0, Number(pPrice || 0));
        if (!(vQty > 0) || !(vLotSize > 0) || !(vPrice > 0)) {
            return 0;
        }
        return vQty * vLotSize * vPrice;
    }

    private calculateBlockedMarginFromPositions(pPositions: RollingOptionsPtDePositionRecord[]): number {
        const arrPositions = Array.isArray(pPositions) ? pPositions : [];
        return arrPositions.reduce((sum, objRow) => {
            if (!objRow || objRow.status !== "OPEN") {
                return sum;
            }
            const vPrice = Number(objRow.entryPrice ?? objRow.markPrice ?? 0);
            return sum + this.calculatePaperNotional(Number(objRow.qty || 0), Number(objRow.lotSize || 0), vPrice);
        }, 0);
    }

    private async hasSufficientDemoBalance(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pAdditionalBlockedMargin: number,
        pReason: string
    ): Promise<boolean> {
        const vDemoBalance = this.getDemoBalanceLimit(pConfig);
        if (vDemoBalance === null) {
            return true;
        }

        const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const vBlockedMargin = this.calculateBlockedMarginFromPositions(objOpenPositions);
        const vRequired = vBlockedMargin + Math.max(0, Number(pAdditionalBlockedMargin || 0));
        if (vRequired <= vDemoBalance) {
            return true;
        }

        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "warning",
            title: "Insufficient Demo Balance",
            message: `Skipped ${pReason} because required margin ${vRequired.toFixed(3)} exceeds demo balance ${vDemoBalance.toFixed(3)}.`,
            payload: {
                symbol: pConfig.symbol,
                reason: "insufficient_demo_balance",
                requiredMargin: vRequired,
                blockedMargin: vBlockedMargin,
                demoBalance: vDemoBalance,
                additionalMargin: Math.max(0, Number(pAdditionalBlockedMargin || 0))
            }
        });
        return false;
    }

    private async openFuturePosition(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pQty: number,
        pReason: string
    ): Promise<RollingOptionsPtDePositionRecord | null> {
        const bFuturesEnabled = Boolean((pConfig as any).futuresEnabled ?? true);
        if (!bFuturesEnabled) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Futures Disabled",
                message: `Skipped futures entry (${pReason}) because FUT Enabled is OFF.`,
                payload: {
                    symbol: pConfig.symbol,
                    reason: "futures_disabled"
                }
            });
            return null;
        }

        const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const objOpenFutures = objOpenPositions.filter((objRow) => objRow.instrumentType === "FUTURE" && objRow.status === "OPEN");
        if (objOpenFutures.length > 0) {
            const vDesiredAction = pConfig.futureAction ?? (pConfig.action === "sell" ? "BUY" : "SELL");
            const vExisting = objOpenFutures[0];
            const vExistingQty = Math.max(0, Math.floor(Number(vExisting.qty || 0)));
            const vDesiredQty = Math.max(0, Math.floor(Number(pQty || 0)));
            const vMismatch = (String(vExisting.action || "").trim().toUpperCase() !== vDesiredAction) || (vDesiredQty > 0 && vExistingQty !== vDesiredQty);
            if (vMismatch) {
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "manual_action",
                    severity: "warning",
                    title: "Future Mismatch",
                    message: "Future position already open, and it does not match the requested qty/action.",
                    payload: {
                        symbol: pConfig.symbol,
                        reason: "future_already_open_mismatch",
                        existingAction: vExisting.action,
                        existingQty: vExistingQty,
                        desiredAction: vDesiredAction,
                        desiredQty: vDesiredQty
                    }
                });
            }
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Future Already Open",
                message: `Skipped futures entry (${pReason}) because a future position is already open.`,
                payload: {
                    symbol: pConfig.symbol,
                    reason: "future_already_open",
                    openFutures: objOpenFutures.length
                }
            });
            return objOpenFutures[0];
        }

        const objSnapshot = await this.getMarketSnapshot(this.getOrCreateState(pUserId), pConfig);
        const vAdditionalMargin = this.calculatePaperNotional(pQty, pConfig.lotSize, objSnapshot.futuresPrice);
        if (!(await this.hasSufficientDemoBalance(pUserId, pConfig, vAdditionalMargin, pReason))) {
            return null;
        }
        const objPosition = await saveRollingOptionsPtDePosition({
            positionId: crypto.randomUUID(),
            userId: pUserId,
            groupId: `group_${Date.now()}`,
            cycleId: `cycle_${Date.now()}`,
            status: "OPEN",
            symbol: pConfig.symbol,
            contractName: `${pConfig.contractName} FUT`,
            instrumentType: "FUTURE",
            optionSide: "",
            action: pConfig.futureAction ?? (pConfig.action === "sell" ? "BUY" : "SELL"),
            strike: null,
            expiryDate: pConfig.expiryDate,
            qty: pQty,
            lotSize: pConfig.lotSize,
            entryPrice: objSnapshot.futuresPrice,
            exitPrice: null,
            markPrice: objSnapshot.futuresPrice,
            entryDelta: null,
            exitDelta: null,
            charges: estimatePositionCharges("FUTURE", pQty, pConfig.lotSize, objSnapshot.futuresPrice),
            pnl: 0,
            openedReason: pReason,
            closedReason: "",
            openedAt: objSnapshot.ts,
            closedAt: "",
            metadata: {
                orderType: pConfig.futureOrderType,
                source: "server-strategy"
            },
            createdAt: objSnapshot.ts,
            updatedAt: objSnapshot.ts
        });

        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: pReason === "SL add one future" ? "extra_future_added" : "future_opened",
            severity: "success",
            title: pReason === "SL add one future" ? "Extra Future Added" : "Future Opened",
            message: `${objPosition.action} future paper position opened.`,
            payload: {
                symbol: pConfig.symbol,
                contractName: objPosition.contractName,
                qty: pQty,
                reason: pReason
            }
        });

        return objPosition;
    }

    private getOptionEntryPriceForAction(
        pQuote: { markPrice?: number; bestBid?: number | null; bestAsk?: number | null; },
        pAction: string
    ): number {
        const vAction = String(pAction || "").trim().toUpperCase();
        const vBid = Number(pQuote.bestBid);
        const vAsk = Number(pQuote.bestAsk);
        const vFallback = Number(pQuote.markPrice || 0);
        if (vAction === "SELL" && Number.isFinite(vBid) && vBid > 0) {
            return vBid;
        }
        if (vAction === "BUY" && Number.isFinite(vAsk) && vAsk > 0) {
            return vAsk;
        }
        return vFallback;
    }

    private async canOpenOptionByEmaRenkoConfirmation(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pColorCode: "R" | "G",
        pReason: string,
        pMetadataOverrides: Record<string, unknown>
    ): Promise<boolean> {
        const objUiState = ((pConfig as any).__uiState || {}) as Record<string, unknown>;
        const bEmaSignalSyncEnabled = Boolean((objUiState as any).emaSignalEnabled);
        const bEmaRenkoConfirmEnabled = Boolean((objUiState as any).emaRenkoConfirmEnabled);
        const bReplacementEmaEnabled = isReplacementConditionEnabled(objUiState, "replacementUseEmaTrendEnabled");
        if (!bEmaSignalSyncEnabled && (!bReplacementEmaEnabled || !bEmaRenkoConfirmEnabled)) {
            return true;
        }
        if (Boolean((pMetadataOverrides as any).positivePnlSupport)) {
            return true;
        }

        const objState = this.getOrCreateState(pUserId);
        await this.updateStandaloneEmaIndicator(pConfig, objState, objUiState);
        const vEmaTrend = objState.ema.trend;
        const vRenkoColor = String(objState.renko.lastColor || "").trim().toUpperCase();
        const vExpectedEmaTrend = pColorCode === "G" ? "UP" : "DOWN";
        const bEmaMatches = vEmaTrend === vExpectedEmaTrend;
        const bRenkoMatches = !bEmaRenkoConfirmEnabled || vRenkoColor === pColorCode;
        const bAllowed = bEmaMatches && bRenkoMatches;
        if (bAllowed) {
            return true;
        }

        const vRequiredConfirmation = bEmaRenkoConfirmEnabled ? "EMA and Renko" : "EMA";
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "info",
            title: "Option Entry Skipped",
            message: `Skipped ${pReason} because ${vRequiredConfirmation} did not match ${pColorCode === "G" ? "GREEN" : "RED"}.`,
            payload: {
                symbol: pConfig.symbol,
                reason: bEmaRenkoConfirmEnabled
                    ? "ema_renko_confirmation_mismatch"
                    : "ema_signal_sync_mismatch",
                requestedColor: pColorCode,
                emaTrend: vEmaTrend,
                renkoColor: vRenkoColor || "NONE",
                emaSignalSyncEnabled: bEmaSignalSyncEnabled,
                emaRenkoConfirmEnabled: bEmaRenkoConfirmEnabled
            }
        });
        return false;
    }

    private async openOptionPositions(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pQty: number,
        pReason: string,
        pColorCode: "R" | "G",
        pUseReEntryDelta = false,
        pRuleSet: 1 | 2 = 1,
        pOptionSidesOverride?: Array<"CE" | "PE">,
        pMetadataOverrides: Record<string, unknown> = {},
        pAllowNextDayExpiryFallback = true
    ): Promise<RollingOptionsPtDePositionRecord[]> {
        if (!(await this.canOpenOptionByEmaRenkoConfirmation(pUserId, pConfig, pColorCode, pReason, pMetadataOverrides))) {
            return [];
        }

        const objSnapshot = await this.getMarketSnapshot(this.getOrCreateState(pUserId), pConfig);
        const vOptionSides: Array<"CE" | "PE"> = Array.isArray(pOptionSidesOverride) && pOptionSidesOverride.length > 0
            ? pOptionSidesOverride
            : (pConfig.legSide === "both"
                ? ["CE", "PE"]
                : [pConfig.legSide === "pe" ? "PE" : "CE"]);
        const objRuleValues = this.getRuleValues(pConfig, pColorCode);
        const vAction = pConfig.action === "buy" ? "BUY" : "SELL";
        const clamp01 = (pValue: number): number => Math.min(1, Math.max(0, pValue));
        const vTargetDelta = Number.isFinite(objRuleValues.reDelta) && objRuleValues.reDelta > 0
            ? objRuleValues.reDelta
            : pConfig.newDelta;
        const vStrike = Math.round(objSnapshot.spotPrice / 100) * 100;
        const objSaved: RollingOptionsPtDePositionRecord[] = [];

        const objPlannedLegs: Array<{
            optionSide: "CE" | "PE";
            contractName: string;
            strike: number;
            expiryDate: string;
            markPrice: number;
            entryPrice: number;
            bestBid: number | null;
            bestAsk: number | null;
            entryDelta: number;
            takeProfitDelta: number;
            stopLossDelta: number;
            configuredTakeProfitPct: number;
            configuredStopLossPct: number;
            productSymbol: string;
            productDelta: number;
            productGamma: number;
            productTheta: number;
            productVega: number;
            usedNextDayExpiryFallback: boolean;
        }> = [];

        for (const vOptionSide of vOptionSides) {
            const objLiveContract = await findBestLiveOptionContract(
                pConfig,
                vOptionSide,
                vTargetDelta,
                false,
                pUseReEntryDelta ? RE_DELTA_TOLERANCE : undefined,
                pAllowNextDayExpiryFallback
            );
            if (!pAllowNextDayExpiryFallback && !objLiveContract?.contractSymbol) {
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "manual_action",
                    severity: "warning",
                    title: "Exact Expiry Option Entry Skipped",
                    message: `Skipped ${pReason} ${vOptionSide} because no exact-expiry contract was found for ${pConfig.expiryDate}.`,
                    payload: {
                        symbol: pConfig.symbol,
                        reason: "exact_expiry_contract_not_found",
                        optionSide: vOptionSide,
                        requestedExpiryDate: pConfig.expiryDate,
                        ruleSet: pRuleSet
                    }
                });
                continue;
            }
            if (pUseReEntryDelta && !objLiveContract?.contractSymbol) {
                return [];
            }
            if (objLiveContract?.contractSymbol) {
                ensureLiveTickerSymbols([objLiveContract.contractSymbol]);
            }
            const vMark = objLiveContract?.markPrice || Number((objSnapshot.spotPrice * Math.max(0.002, Math.abs(vTargetDelta) * 0.012)).toFixed(2));
            const vBestBid = objLiveContract?.bestBid ?? Number((vMark * 0.995).toFixed(2));
            const vBestAsk = objLiveContract?.bestAsk ?? Number((vMark * 1.005).toFixed(2));
            const vEntryPrice = this.getOptionEntryPriceForAction({ markPrice: vMark, bestBid: vBestBid, bestAsk: vBestAsk }, vAction);
            const vEntryDelta = objLiveContract ? Math.abs(objLiveContract.delta) : vTargetDelta;
            const vBaseDelta = Math.abs(Number(vEntryDelta || 0));
            let vTakeProfitDelta = Number(objRuleValues.takeProfitDelta || 0);
            let vStopLossDelta = Number(objRuleValues.stopLossDelta || 0);
            let vConfiguredTakeProfitPct = Number((vTakeProfitDelta * 100).toFixed(4));
            let vConfiguredStopLossPct = Number((vStopLossDelta * 100).toFixed(4));

            if (pColorCode === "G" || pColorCode === "R") {
                const getPctValue = (pValue: unknown, pFallback: number): number => {
                    const vNum = Number(pValue);
                    return Number.isFinite(vNum) ? clamp01(vNum > 1 ? vNum / 100 : vNum) : pFallback;
                };
                const bIsRuleSet2 = Number((pConfig as any)?.ruleSet || 1) === 2;
                const vTpPct = bIsRuleSet2
                    ? (pColorCode === "G"
                        ? getPctValue((pConfig as any).ruleSetGreenTpPct, 0.50)
                        : getPctValue((pConfig as any).ruleSetRedTpPct, 0.50))
                    : getPctValue((pColorCode === "G" ? pConfig.greenTakeProfitPct : pConfig.redTakeProfitPct), 0.50);
                const vSlPct = bIsRuleSet2
                    ? (pColorCode === "G"
                        ? getPctValue((pConfig as any).ruleSetGreenSlPct, 0.90)
                        : getPctValue((pConfig as any).ruleSetRedSlPct, 0.90))
                    : getPctValue((pColorCode === "G" ? pConfig.greenStopLossPct : pConfig.redStopLossPct), 0.90);
                vConfiguredTakeProfitPct = vTpPct;
                vConfiguredStopLossPct = vSlPct;
                vTakeProfitDelta = vTpPct;
                vStopLossDelta = vSlPct;
            }

            const objUiState = ((pConfig as any).__uiState || {}) as Record<string, unknown>;
            const bIsReplacementEntry = pReason.toLowerCase().includes("replacement") || pReason.toLowerCase().includes("re-entry") || pReason.toLowerCase().includes("reentry");
            const bShouldGuardImmediateTrigger = !pUseReEntryDelta
                || (bIsReplacementEntry && isReplacementConditionEnabled(objUiState, "replacementImmediateTriggerGuardEnabled"));
            if (bShouldGuardImmediateTrigger && this.wouldOptionTriggerImmediately({
                takeProfitDelta: vTakeProfitDelta,
                stopLossDelta: vStopLossDelta
            }, vAction, vBaseDelta)) {
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "manual_action",
                    severity: "warning",
                    title: "Option Re-entry Skipped",
                    message: `Skipped ${pReason} because the replacement delta ${vEntryDelta.toFixed(4)} already violates TP/SL settings.`,
                    payload: {
                        symbol: pConfig.symbol,
                        reason: "replacement_option_immediate_trigger_skip",
                        contractName: objLiveContract?.contractSymbol || `${pConfig.contractName} ${vOptionSide}`,
                        delta: vEntryDelta
                    }
                });
                continue;
            }

            objPlannedLegs.push({
                optionSide: vOptionSide,
                contractName: objLiveContract?.contractSymbol || `${pConfig.contractName} ${vOptionSide}`,
                strike: objLiveContract?.strike || vStrike,
                expiryDate: objLiveContract?.expiryDate || pConfig.expiryDate,
                markPrice: vMark,
                entryPrice: vEntryPrice,
                bestBid: vBestBid,
                bestAsk: vBestAsk,
                entryDelta: vEntryDelta,
                takeProfitDelta: vTakeProfitDelta,
                stopLossDelta: vStopLossDelta,
                configuredTakeProfitPct: vConfiguredTakeProfitPct,
                configuredStopLossPct: vConfiguredStopLossPct,
                productSymbol: objLiveContract?.contractSymbol || "",
                productDelta: objLiveContract?.delta || vTargetDelta,
                productGamma: objLiveContract?.gamma || 0,
                productTheta: objLiveContract?.theta || 0,
                productVega: objLiveContract?.vega || 0,
                usedNextDayExpiryFallback: Boolean(objLiveContract?.usedNextDayFallback)
            });
        }

        if (objPlannedLegs.length === 0) {
            return [];
        }

        const vAdditionalMargin = objPlannedLegs.reduce((sum, objLeg) => {
            return sum + this.calculatePaperNotional(pQty, pConfig.lotSize, objLeg.entryPrice);
        }, 0);
        if (!(await this.hasSufficientDemoBalance(pUserId, pConfig, vAdditionalMargin, pReason))) {
            return [];
        }

        for (const objLeg of objPlannedLegs) {
            objSaved.push(await saveRollingOptionsPtDePosition({
                positionId: crypto.randomUUID(),
                userId: pUserId,
                groupId: `group_${Date.now()}`,
                cycleId: `cycle_${Date.now()}`,
                status: "OPEN",
                symbol: pConfig.symbol,
                contractName: objLeg.contractName,
                instrumentType: "OPTION",
                optionSide: objLeg.optionSide,
                action: vAction,
                strike: objLeg.strike,
                expiryDate: objLeg.expiryDate,
                qty: pQty,
                lotSize: pConfig.lotSize,
                entryPrice: objLeg.entryPrice,
                exitPrice: null,
                markPrice: objLeg.markPrice,
                entryDelta: objLeg.entryDelta,
                exitDelta: objLeg.entryDelta,
                charges: estimatePositionCharges("OPTION", pQty, pConfig.lotSize, objLeg.entryPrice, objSnapshot.spotPrice),
                pnl: 0,
                openedReason: pReason,
                closedReason: "",
                openedAt: objSnapshot.ts,
                closedAt: "",
                metadata: {
                    deltaTakeProfit: objLeg.takeProfitDelta,
                    deltaStopLoss: objLeg.stopLossDelta,
                    takeProfitDelta: objLeg.takeProfitDelta,
                    stopLossDelta: objLeg.stopLossDelta,
                    trailSlGap: Number(getDeltaTrailGap(objLeg.entryDelta, objLeg.stopLossDelta).toFixed(6)),
                    trailTpGap: Number(getDeltaTrailGap(objLeg.entryDelta, objLeg.takeProfitDelta).toFixed(6)),
                    trailBestDelta: objLeg.entryDelta,
                    trailTpPeakDelta: objLeg.entryDelta,
                    configuredTakeProfitPct: objLeg.configuredTakeProfitPct,
                    configuredStopLossPct: objLeg.configuredStopLossPct,
                    reEntryDelta: objRuleValues.reDelta,
                    reEnter: pConfig.reEnter,
                    ruleColor: objRuleValues.colorCode,
                    ruleSet: pRuleSet,
                    entrySpotPrice: objSnapshot.spotPrice,
                    productSymbol: objLeg.productSymbol,
                    productDelta: objLeg.productDelta,
                    productGamma: objLeg.productGamma,
                    productTheta: objLeg.productTheta,
                    productVega: objLeg.productVega,
                    productMarkPrice: objLeg.markPrice,
                    productBestBid: objLeg.bestBid,
                    productBestAsk: objLeg.bestAsk,
                    expiryMode: pConfig.expiryMode,
                    requestedExpiryDate: pConfig.expiryDate,
                    resolvedExpiryDate: objLeg.expiryDate,
                    usedNextDayExpiryFallback: objLeg.usedNextDayExpiryFallback,
                    source: objSnapshot.priceSource === "public" ? "server-strategy-live" : "server-strategy-simulated",
                    ...pMetadataOverrides,
                    linkedClosedByLink: false
                },
                createdAt: objSnapshot.ts,
                updatedAt: objSnapshot.ts
            }));
        }

        const objFallbackPositions = objSaved.filter((objRow) => Boolean(objRow.metadata?.usedNextDayExpiryFallback));
        if (objFallbackPositions.length > 0) {
            const objFirstFallback = objFallbackPositions[0];
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Next-Day Expiry Fallback Used",
                message: `Used next-day expiry fallback for ${objFallbackPositions.length} option leg(s).`,
                payload: {
                    symbol: pConfig.symbol,
                    qty: objFallbackPositions.length,
                    reason: "next_day_expiry_fallback",
                    requestedExpiryDate: String(objFirstFallback.metadata?.requestedExpiryDate || pConfig.expiryDate),
                    resolvedExpiryDate: String(objFirstFallback.metadata?.resolvedExpiryDate || objFirstFallback.expiryDate || pConfig.expiryDate)
                }
            });
        }

        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: pReason.toLowerCase().includes("re-entry") || pReason.toLowerCase().includes("replacement")
                ? "reentry_opened"
                : "option_opened",
            severity: "success",
            title: pReason.toLowerCase().includes("re-entry") || pReason.toLowerCase().includes("replacement")
                ? "Replacement Option Opened"
                : "Option Opened",
            message: `Opened ${objSaved.length} option paper leg(s).`,
            payload: {
                symbol: pConfig.symbol,
                qty: pQty,
                reason: pReason
            }
        });

        return objSaved;
    }

    private wouldOptionTriggerImmediately(
        pRuleValues: {
            takeProfitDelta: number;
            stopLossDelta: number;
        },
        pAction: "BUY" | "SELL",
        pDelta: number
    ): boolean {
        const vAbsDelta = Math.abs(Number(pDelta || 0));
        const vDeltaSl = Number(pRuleValues.stopLossDelta || 0);
        const vDeltaTp = Number(pRuleValues.takeProfitDelta || 0);
        const bHasSl = Number.isFinite(vDeltaSl) && vDeltaSl > 0;
        const bHasTp = Number.isFinite(vDeltaTp) && vDeltaTp > 0;

        if (!Number.isFinite(vAbsDelta)) {
            return false;
        }

        if (pAction === "SELL") {
            if (bHasSl && vAbsDelta >= vDeltaSl) {
                return true;
            }
            if (bHasTp && vAbsDelta <= vDeltaTp) {
                return true;
            }
            return false;
        }

        if (bHasSl && vAbsDelta <= vDeltaSl) {
            return true;
        }
        if (bHasTp && vAbsDelta >= vDeltaTp) {
            return true;
        }
        return false;
    }

    private getLinkedLeaderPositionId(pPosition: RollingOptionsPtDePositionRecord): string {
        return String((pPosition.metadata as any)?.linkedLeaderPositionId || "").trim();
    }

    private async expandLinkedFollowerPositions(
        pPositions: RollingOptionsPtDePositionRecord[]
    ): Promise<RollingOptionsPtDePositionRecord[]> {
        const arrPositions = (Array.isArray(pPositions) ? pPositions : [])
            .filter((objPosition) => objPosition?.status === "OPEN");
        if (arrPositions.length <= 0) {
            return [];
        }

        const vUserId = String(arrPositions[0]?.userId || "").trim();
        if (!vUserId) {
            return arrPositions;
        }

        const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
        const objById = new Map<string, RollingOptionsPtDePositionRecord>();
        const arrQueue = [...arrPositions];

        for (const objPosition of arrPositions) {
            const vPositionId = String(objPosition.positionId || "").trim();
            if (vPositionId) {
                objById.set(vPositionId, objPosition);
            }
        }

        while (arrQueue.length > 0) {
            const objLeader = arrQueue.shift();
            const vLeaderId = String(objLeader?.positionId || "").trim();
            if (!vLeaderId) {
                continue;
            }

            for (const objPosition of arrOpenPositions) {
                const vPositionId = String(objPosition.positionId || "").trim();
                if (!vPositionId || objById.has(vPositionId)) {
                    continue;
                }
                if (this.getLinkedLeaderPositionId(objPosition) !== vLeaderId) {
                    continue;
                }
                objById.set(vPositionId, objPosition);
                arrQueue.push(objPosition);
            }
        }

        return Array.from(objById.values());
    }

    private async closePositions(
        pPositions: RollingOptionsPtDePositionRecord[],
        pConfig: RollingOptionsPtDeConfig,
        pReason: string
    ): Promise<RollingOptionsPtDePositionRecord[]> {
        const arrPositions = await this.expandLinkedFollowerPositions(pPositions);
        const objDirectPositionIds = new Set((Array.isArray(pPositions) ? pPositions : [])
            .map((objPosition) => String(objPosition?.positionId || "").trim())
            .filter(Boolean));
        const objSnapshot = await this.getMarketSnapshot(this.getOrCreateState(arrPositions[0]?.userId || "demo-paper"), pConfig);
        const objClosed: RollingOptionsPtDePositionRecord[] = [];

        for (const objPosition of arrPositions) {
            const bLinkedFollowerClose = !objDirectPositionIds.has(String(objPosition.positionId || "").trim());
            const vProductSymbol = String(objPosition.metadata?.productSymbol || "").trim();
            const objLiveTicker = objPosition.instrumentType === "OPTION" && vProductSymbol
                ? await getLiveOptionTicker(vProductSymbol)
                : null;
            const vCurrentDelta = objPosition.instrumentType === "OPTION"
                ? Math.abs(Number(objLiveTicker?.delta || objPosition.exitDelta || objPosition.entryDelta || 0.53))
                : null;
            const vExitPrice = objPosition.instrumentType === "OPTION"
                ? Number(objLiveTicker?.markPrice || objPosition.markPrice || objPosition.entryPrice || 0)
                : objSnapshot.futuresPrice;
            const vExitCharges = estimatePositionCharges(
                objPosition.instrumentType,
                objPosition.qty,
                objPosition.lotSize,
                vExitPrice,
                objPosition.instrumentType === "OPTION" ? objSnapshot.spotPrice : undefined
            );
            objClosed.push(await saveRollingOptionsPtDePosition({
                ...objPosition,
                status: "CLOSED",
                exitPrice: vExitPrice,
                markPrice: vExitPrice,
                exitDelta: vCurrentDelta,
                charges: Number((Number(objPosition.charges || 0) + vExitCharges).toFixed(4)),
                pnl: getPositionPnl(objPosition, vExitPrice),
                closedReason: bLinkedFollowerClose ? `${pReason} linked follower` : pReason,
                closedAt: objSnapshot.ts,
                metadata: {
                    ...(objPosition.metadata || {}),
                    linkedClosedByLink: bLinkedFollowerClose
                },
                updatedAt: ""
            }));
        }

        if (objClosed.length > 0) {
            await syncOptionsPnlWithClosedPositions(objClosed[0].userId);
            await saveRollingOptionsStrangleTempClosedPositions(objClosed);
            const objRemainingOpenPositions = await listRollingOptionsPtDeOpenPositions(objClosed[0].userId);
            if (objRemainingOpenPositions.length <= 0) {
                await clearRollingOptionsStrangleTempClosedPositions(objClosed[0].userId);
            }
            await logRollingOptionsPtDeEvent({
                userId: objClosed[0].userId,
                eventType: pReason.toLowerCase().includes("sl")
                    ? "sl_triggered"
                    : (pReason.toLowerCase().includes("tp") ? "tp_triggered" : "option_closed"),
                severity: pReason.toLowerCase().includes("sl") ? "warning" : "info",
                title: pReason.toLowerCase().includes("sl")
                    ? "SL Triggered"
                    : (pReason.toLowerCase().includes("tp") ? "TP Triggered" : "Position Closed"),
                message: `Closed ${objClosed.length} paper position(s).`,
                payload: {
                    symbol: pConfig.symbol,
                    qty: objClosed.length,
                    reason: pReason
                }
            });
            await this.reArmPositivePnlSupportSourcesAfterClose(objClosed, pConfig);
            await this.closePositivePnlSupportsForClosedSourceLegs(objClosed, pConfig);
        }

        return objClosed;
    }

    private async closePositivePnlSupportsForClosedSourceLegs(
        pClosedPositions: RollingOptionsPtDePositionRecord[],
        pConfig: RollingOptionsPtDeConfig
    ): Promise<void> {
        const arrClosedSourceLegs = (Array.isArray(pClosedPositions) ? pClosedPositions : [])
            .filter((objPosition) => objPosition?.instrumentType === "OPTION")
            .filter((objPosition) => !isPositivePnlSupportPosition(objPosition));
        if (arrClosedSourceLegs.length <= 0) {
            return;
        }

        const vUserId = String(arrClosedSourceLegs[0]?.userId || "").trim();
        if (!vUserId) {
            return;
        }

        const objUiState = await this.loadUiState(vUserId);
        if (!Boolean((objUiState as any).closeSupportLegOnSourceClose)) {
            return;
        }

        const objSourceIds = new Set<string>();
        for (const objClosed of arrClosedSourceLegs) {
            const objMetadata = (objClosed.metadata || {}) as Record<string, unknown>;
            [
                objClosed.positionId,
                objMetadata.sourcePositionId,
                objMetadata.sourceClosedPositionId
            ].forEach((pValue) => {
                const vPositionId = String(pValue || "").trim();
                if (vPositionId) {
                    objSourceIds.add(vPositionId);
                }
            });
        }
        if (objSourceIds.size <= 0) {
            return;
        }

        const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
        const arrSupportPositions = arrOpenPositions.filter((objPosition) => {
            const vSourcePositionId = String((objPosition.metadata as any)?.sourcePositionId || "").trim();
            return objPosition.status === "OPEN"
                && objPosition.instrumentType === "OPTION"
                && isPositivePnlSupportLeg(objPosition)
                && objSourceIds.has(vSourcePositionId);
        });
        if (arrSupportPositions.length <= 0) {
            return;
        }

        await this.closePositions(
            arrSupportPositions,
            pConfig,
            "Support closed because linked original/replacement leg closed"
        );
    }

    private async reArmPositivePnlSupportSourcesAfterClose(
        pClosedPositions: RollingOptionsPtDePositionRecord[],
        pConfig: RollingOptionsPtDeConfig
    ): Promise<void> {
        const arrClosedSupports = (Array.isArray(pClosedPositions) ? pClosedPositions : []).filter((objPosition) => {
            return Boolean((objPosition.metadata as any)?.positivePnlSupport);
        });
        if (arrClosedSupports.length <= 0) {
            return;
        }

        const vUserId = String(arrClosedSupports[0]?.userId || "").trim();
        if (!vUserId) {
            return;
        }

        const objUiState = await this.loadUiState(vUserId);
        const bSupportEnabled = Boolean((objUiState as any).positivePnlSupportEnabled ?? true);
        if (!bSupportEnabled) {
            return;
        }

        const vTriggerAmount = Math.min(0, normalizeNumber((objUiState as any).positivePnlTriggerAmount, 0));
        const vSupportAction: "buy" | "sell" = String((objUiState as any).positivePnlSupportAction || "buy").trim().toLowerCase() === "sell"
            ? "sell"
            : "buy";
        const bSellSupportMode = vSupportAction === "sell";
        const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
        const arrSourceOpenPositions = arrOpenPositions.filter((objPosition) => {
            return objPosition.status === "OPEN"
                && objPosition.instrumentType === "OPTION"
                && !isPositivePnlSupportPosition(objPosition)
                && String(objPosition.action || "").trim().toUpperCase() === "SELL";
        });
        const arrNegativeSourcePositions = arrSourceOpenPositions.filter((objPosition) => Number(objPosition.pnl || 0) <= vTriggerAmount);
        if (arrNegativeSourcePositions.length <= 0) {
            return;
        }

        const objOpenSourceById = new Map(arrSourceOpenPositions.map((objPosition) => [objPosition.positionId, objPosition]));
        const objState = this.getOrCreateState(vUserId);
        let vReArmedCount = 0;

        for (const objSupport of arrClosedSupports) {
            const vSourcePositionId = String((objSupport.metadata as any)?.sourcePositionId || "").trim();
            const objSource = objOpenSourceById.get(vSourcePositionId);
            if (!objSource || String(objSource.instrumentType || "").trim().toUpperCase() !== "OPTION") {
                continue;
            }
            if (Number(objSource.pnl || 0) > vTriggerAmount) {
                continue;
            }

            const objSourceMetadata = (objSource.metadata || {}) as Record<string, unknown>;
            objState.sourcePositiveCycleCountByPositionId.set(objSource.positionId, 1);
            await saveRollingOptionsPtDePosition({
                ...objSource,
                metadata: {
                    ...objSourceMetadata,
                    positivePnlSupportArmed: true,
                    positivePnlCycleCount: 1
                },
                updatedAt: ""
            });
            vReArmedCount += 1;
        }

        if (vReArmedCount > 0) {
            await logRollingOptionsPtDeEvent({
                userId: vUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Positive PnL Support Re-armed",
                message: `Re-armed ${vReArmedCount} support source leg(s) after support close because the source leg PnL is at or below trigger ${vTriggerAmount}.`,
                payload: {
                    symbol: pConfig.symbol,
                    reason: "positive_pnl_support_rearmed_after_close",
                    reArmedCount: vReArmedCount,
                    triggerAmount: vTriggerAmount
                }
            });
        }
    }

    public async reEnterClosedOptionPositions(
        pUserId: string,
        pClosedPositions: RollingOptionsPtDePositionRecord[],
        pReason: string,
        pRenkoSignal: "R" | "G" | null = null
    ): Promise<RollingOptionsPtDePositionRecord[]> {
        const arrClosedOptions = (Array.isArray(pClosedPositions) ? pClosedPositions : [])
            .filter((objPosition) => objPosition?.instrumentType === "OPTION")
            .filter((objPosition) => !isPositivePnlSupportPosition(objPosition))
            .filter((objPosition) => !this.isReplacementOptionPosition(objPosition));
        const objState = this.getOrCreateState(pUserId);
        if (arrClosedOptions.length <= 0 || Boolean(objState.positionMismatchDetected)) {
            return [];
        }

        const objQueueUiState = await this.loadUiState(pUserId);
        if (!pRenkoSignal && isReplacementConditionEnabled(objQueueUiState, "replacementWaitForRenkoPointEnabled")) {
            const arrPendingPositions = arrClosedOptions.map((objPosition) => ({
                ...objPosition,
                metadata: {
                    ...(objPosition.metadata || {}),
                    replacementPendingRenko: true,
                    replacementPendingReason: pReason
                }
            }));
            await saveRollingOptionsStrangleTempClosedPositions(arrPendingPositions);
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Replacement Waiting for Renko",
                message: `Queued ${arrPendingPositions.length} replacement leg(s) until the next Renko point.`,
                payload: {
                    reason: "replacement_waiting_for_new_renko_point",
                    qty: arrPendingPositions.length
                }
            });
            return [];
        }

        const arrCreatedPositions: RollingOptionsPtDePositionRecord[] = [];

        for (const objClosedOption of arrClosedOptions) {
            const vRuleSet: 1 | 2 = Number((objClosedOption.metadata as any)?.ruleSet) === 2 ? 2 : 1;
            const vOptionSide = this.getOptionSide(objClosedOption);
            if (vOptionSide !== "CE" && vOptionSide !== "PE") {
                continue;
            }

            // Replacement legs use the latest Action 1/2 configuration.
            // The closed leg supplies only its rule set and side.
            const objUiState = await this.loadUiState(pUserId);
            const objConfig = this.buildRuleSetConfig(objUiState, vRuleSet);
            if (!Boolean(objConfig.reEnter)) {
                continue;
            }

            const arrCurrentPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
            const objCurrentSummary = getOpenPositionsSummary(arrCurrentPositions);
            const bSameLegAlreadyOpen = arrCurrentPositions.some((objPosition) => {
                return objPosition.instrumentType === "OPTION"
                    && !isPositivePnlSupportPosition(objPosition)
                    && Number((objPosition.metadata as any)?.ruleSet) === vRuleSet
                    && this.getOptionSide(objPosition) === vOptionSide;
            });
            if (bSameLegAlreadyOpen && isReplacementConditionEnabled(objUiState, "replacementBlockSameLegEnabled")) {
                continue;
            }

            const vCurrentRenkoColor = String(pRenkoSignal || objState.renko.lastColor || "").trim().toUpperCase();
            const vStoredRuleColor = String((objClosedOption.metadata as any)?.ruleColor || "").trim().toUpperCase();
            const bUseRenkoColor = isReplacementConditionEnabled(objUiState, "replacementUseRenkoColorEnabled");
            const vActiveRuleColor: "R" | "G" = pRenkoSignal
                ? pRenkoSignal
                : objConfig.renkoEnabled && bUseRenkoColor
                ? (vCurrentRenkoColor === "G" ? "G" : (vCurrentRenkoColor === "R" ? "R" : (vStoredRuleColor === "G" ? "G" : "R")))
                : (vStoredRuleColor === "G" ? "G" : "R");
            const vConfiguredQty = this.getConfiguredOptionQty(
                objUiState,
                objConfig,
                vRuleSet,
                vActiveRuleColor,
                objCurrentSummary.futureQty
            );
            const vQty = vConfiguredQty;
            if (!(vQty > 0)) {
                continue;
            }

            const arrOpened = await this.openOptionPositions(
                pUserId,
                objConfig,
                vQty,
                `${pReason} re-entry replacement option`,
                vActiveRuleColor,
                true,
                vRuleSet,
                [vOptionSide],
                {
                    sourceClosedPositionId: objClosedOption.positionId,
                    sourceClosedReason: objClosedOption.closedReason || pReason,
                    replacementForRuleSet: vRuleSet
                },
                true
            );
            arrCreatedPositions.push(...arrOpened);
        }

        const objUiState = await this.loadUiState(pUserId);
        if (isReplacementConditionEnabled(objUiState, "replacementCloseOrphanEnabled")) {
            await this.closeOrphanReplacementOptionPositions(pUserId, this.buildRuleSetConfig(objUiState, 1));
        }
        if (arrCreatedPositions.length > 0) {
            await clearRollingOptionsStrangleTempClosedPositions(pUserId);
        }
        return arrCreatedPositions;
    }

    private async openPendingReplacementPositionsOnRenko(
        pUserId: string,
        pRenkoSignal: "R" | "G"
    ): Promise<RollingOptionsPtDePositionRecord[]> {
        const arrTempClosedPositions = await listRollingOptionsStrangleTempClosedPositions(pUserId);
        const arrPendingPositions = arrTempClosedPositions.filter((objPosition) => {
            return (objPosition.metadata as any)?.replacementPendingRenko === true;
        });
        if (arrPendingPositions.length <= 0) {
            return [];
        }

        return this.reEnterClosedOptionPositions(
            pUserId,
            arrPendingPositions,
            `New ${pRenkoSignal === "G" ? "GREEN" : "RED"} Renko point`,
            pRenkoSignal
        );
    }

    private isReplacementOptionPosition(pPosition: RollingOptionsPtDePositionRecord): boolean {
        if (pPosition.instrumentType !== "OPTION") {
            return false;
        }
        const objMeta = (pPosition.metadata || {}) as Record<string, unknown>;
        const vReason = `${pPosition.openedReason || ""} ${String(objMeta.openedReason || "")} ${String(objMeta.reason || "")}`.toLowerCase();
        return vReason.includes("replacement") || vReason.includes("re-entry") || vReason.includes("reentry");
    }

    private async closeOrphanReplacementOptionPositions(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig
    ): Promise<RollingOptionsPtDePositionRecord[]> {
        const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const arrReplacementOptions = arrOpenPositions.filter((objPosition) => this.isReplacementOptionPosition(objPosition));
        if (arrReplacementOptions.length <= 0 || arrOpenPositions.some((objPosition) => !this.isReplacementOptionPosition(objPosition))) {
            return [];
        }

        return this.closePositions(
            arrReplacementOptions,
            pConfig,
            "Replacement option closed because all other legs are closed"
        );
    }

    private async closeReplacementWhenOriginalLegsPositive(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig
    ): Promise<RollingOptionsPtDePositionRecord[]> {
        const objUiState = ((pConfig as any).__uiState || await this.loadUiState(pUserId)) as Record<string, unknown>;
        if (!isReplacementConditionEnabled(objUiState, "replacementCloseWhenOriginalPositiveEnabled")) {
            return [];
        }
        const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const arrReplacementOptions = arrOpenPositions.filter((objPosition) => this.isReplacementOptionPosition(objPosition));
        if (arrReplacementOptions.length <= 0) {
            return [];
        }

        const arrClosed: RollingOptionsPtDePositionRecord[] = [];
        for (const objReplacement of arrReplacementOptions) {
            const vRuleSet: 1 | 2 = Math.floor(Number((objReplacement.metadata as any)?.ruleSet ?? 1)) === 2 ? 2 : 1;
            // Get original legs (non-replacement, non-negative PnL) for this rule set
            const arrOriginalLegs = arrOpenPositions.filter((objPosition) => {
                const bIsOption = objPosition.instrumentType === "OPTION";
                const bIsReplacement = this.isReplacementOptionPosition(objPosition);
                const bIsPositivePnlSupport = isPositivePnlSupportPosition(objPosition);
                const objPositionRuleSet = Math.floor(Number((objPosition.metadata as any)?.ruleSet ?? 1)) === 2 ? 2 : 1;
                return bIsOption && !bIsReplacement && !bIsPositivePnlSupport && objPositionRuleSet === vRuleSet;
            });

            // Check if all original legs for this rule set are in positive PnL
            const bAllLegsPositive = arrOriginalLegs.length > 0 && arrOriginalLegs.every((objLeg) => {
                const vPnl = Number(objLeg.pnl || 0);
                return Number.isFinite(vPnl) && vPnl >= 0;
            });

            if (bAllLegsPositive) {
                const [objClosed] = await this.closePositions([objReplacement], pConfig, "Replacement option closed because all original legs are positive");
                if (objClosed) {
                    arrClosed.push(objClosed);
                }
            }
        }

        return arrClosed;
    }

    private async closeReplacementOnEmaMismatch(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig
    ): Promise<RollingOptionsPtDePositionRecord[]> {
        const objUiState = ((pConfig as any).__uiState || await this.loadUiState(pUserId)) as Record<string, unknown>;
        if (!isReplacementConditionEnabled(objUiState, "replacementCloseEmaMismatchEnabled")) {
            return [];
        }

        const objState = this.getOrCreateState(pUserId);
        await this.updateStandaloneEmaIndicator(pConfig, objState, objUiState);
        const vEmaTrend = String(objState.ema.trend || "").trim().toUpperCase();
        if (vEmaTrend !== "UP" && vEmaTrend !== "DOWN") {
            return [];
        }

        const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const arrMismatchReplacementOptions = arrOpenPositions.filter((objPosition) => {
            if (!this.isReplacementOptionPosition(objPosition)) {
                return false;
            }
            const vRuleColor = String((objPosition.metadata as any)?.ruleColor || "").trim().toUpperCase();
            return (vRuleColor === "G" && vEmaTrend === "DOWN")
                || (vRuleColor === "R" && vEmaTrend === "UP");
        });
        if (arrMismatchReplacementOptions.length <= 0) {
            return [];
        }

        return this.closePositions(
            arrMismatchReplacementOptions,
            pConfig,
            `Replacement option closed because EMA trend is ${vEmaTrend}`
        );
    }

    private getRenkoOptionQty(pFutureQty: number, pQtyPct: number): number {
        const vBaseQty = Math.max(0, Number(pFutureQty || 0));
        const vPercent = Math.max(0, Number(pQtyPct || 0));

        if (!(vBaseQty > 0) || !(vPercent > 0)) {
            return 0;
        }

        return Math.max(1, Math.round(vBaseQty * vPercent / 100));
    }

    private getConfiguredOptionQty(
        pUiState: Record<string, unknown>,
        pConfig: RollingOptionsPtDeConfig,
        pRuleSet: 1 | 2,
        pColorCode: "R" | "G",
        pFutureQty: number
    ): number {
        if (pRuleSet === 2) {
            const vRaw = pColorCode === "G"
                ? Number((pUiState as any).greenOptQty2)
                : Number((pUiState as any).redOptQty2);
            return Number.isFinite(vRaw) ? Math.max(0, Math.floor(vRaw)) : 0;
        }

        const vExplicitQty = pColorCode === "R"
            ? Number(pConfig.redOptionQty)
            : Number(pConfig.greenOptionQty);
        if (Number.isFinite(vExplicitQty)) {
            return Math.max(0, Math.floor(vExplicitQty));
        }

        const vPctQty = pColorCode === "R"
            ? this.getRenkoOptionQty(pFutureQty, pConfig.redOptionQtyPct)
            : this.getRenkoOptionQty(pFutureQty, pConfig.greenOptionQtyPct);
        return vPctQty > 0 ? vPctQty : 1;
    }

    private async openGreenRenkoFuturePosition(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pReason: string
    ): Promise<void> {
        const bFuturesEnabled = Boolean((pConfig as any).futuresEnabled ?? true);
        if (!bFuturesEnabled) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Futures Disabled",
                message: "Skipped GREEN Renko future entry because FUT Enabled is OFF.",
                payload: {
                    symbol: pConfig.symbol,
                    reason: "futures_disabled"
                }
            });
            return;
        }

        const objSummary = getOpenPositionsSummary(await listRollingOptionsPtDeOpenPositions(pUserId));
        const vFutureQty = pConfig.greenOptionQty !== undefined
            ? Math.max(0, Math.floor(Number(pConfig.greenOptionQty || 0)))
            : this.getRenkoOptionQty(objSummary.futureQty, pConfig.greenOptionQtyPct);

        if (!(vFutureQty > 0)) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Renko GREEN Futures Skipped",
                message: "Skipped GREEN Renko future entry because Green Opt Qty is 0.",
                payload: {
                    symbol: pConfig.symbol,
                    reason: "renko_green_future_skipped_zero_qty"
                }
            });
            return;
        }

        await this.openFuturePosition(pUserId, pConfig, vFutureQty, pReason);
    }

    public async executeStrategy(pUserId: string): Promise<{ status: string; message: string; }> {
        const objState = this.getOrCreateState(pUserId);
        const objConfig = await this.loadConfig(pUserId);
        if (!objState.running) {
            objState.running = true;
            objState.lastError = "";
            this.armTimer(objState, objConfig.loopSeconds);
        }
        const objUiState = ((objConfig as any).__uiState || {}) as Record<string, unknown>;
        const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
        const bAction1Enabled = String(objUiState.action1 || "sell").trim().toLowerCase() !== "none";
        const bAction2Enabled = String(objUiState.action2 || "none").trim().toLowerCase() !== "none";
        const bFuturesEnabled = Boolean((objConfig as any).futuresEnabled ?? true);
        const objSummary = getOpenPositionsSummary(await listRollingOptionsPtDeOpenPositions(pUserId));

        if (bFuturesEnabled && objSummary.futureQty <= 0) {
            await this.openFuturePosition(pUserId, objConfig, objConfig.futureQty, "Strategy initial future");
        }

        const objPositionsAfterFuture = await listRollingOptionsPtDeOpenPositions(pUserId);
        const objNextSummary = getOpenPositionsSummary(objPositionsAfterFuture);
        const arrOpenOptions = objPositionsAfterFuture.filter((objRow) => objRow.instrumentType === "OPTION" && objRow.status === "OPEN");
        const bHasRuleSet1 = arrOpenOptions.some((objRow) => Math.floor(Number((objRow.metadata as any)?.ruleSet ?? 1)) !== 2);
        const bHasRuleSet2 = arrOpenOptions.some((objRow) => Math.floor(Number((objRow.metadata as any)?.ruleSet ?? 1)) === 2);
        const bSkipRenkoEntryNoOpenOptions = Boolean((objUiState as any).skipRenkoEntryNoOpenOptions);

        if (((bAction1Enabled && !bHasRuleSet1) || (bAction2Enabled && !bHasRuleSet2))
            && (bFuturesEnabled ? objNextSummary.futureQty > 0 : true)) {
            if (bSkipRenkoEntryNoOpenOptions && arrOpenOptions.length <= 0) {
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "manual_action",
                    severity: "info",
                    title: "Strategy Option Entry Skipped",
                    message: "Skipped strategy initial option entry because Skip entry (0 open opts) is enabled and no option leg is running.",
                    payload: {
                        symbol: objConfig.symbol,
                        reason: "strategy_option_skipped_no_open_option_leg_switch",
                        skipRenkoEntryNoOpenOptions: true
                    }
                });
                await this.syncRuntime(pUserId, objConfig, objState, {
                    status: "running",
                    autoTraderEnabled: true,
                    lastSignal: "STRATEGY_EXECUTED",
                    lastCycleAt: new Date().toISOString(),
                    lastError: ""
                });
                return {
                    status: "success",
                    message: "Skipped strategy initial option entry because Skip entry (0 open opts) is enabled. Auto trader is running server-side for re-entry."
                };
            }
            const vCurrentRenkoColor = String(objState.renko.lastColor || "").trim().toUpperCase();
            const vRuleColor: "R" | "G" = objConfig.renkoEnabled && vCurrentRenkoColor === "G" ? "G" : "R";
            let vOpenedOptionCount = 0;

            const readRuleSetQty = (pRuleSet: 1 | 2): number => {
                if (pRuleSet !== 2) {
                    return 0;
                }
                const vRaw = vRuleColor === "G"
                    ? Number((objUiState as any).greenOptQty2)
                    : Number((objUiState as any).redOptQty2);
                return Number.isFinite(vRaw) ? Math.max(0, Math.floor(vRaw)) : 0;
            };

            const computeQty = (pCfg: RollingOptionsPtDeConfig, pRuleSet: 1 | 2): number => {
                if (pRuleSet === 2) {
                    return readRuleSetQty(2);
                }
                if (bFuturesEnabled) {
                    return vRuleColor === "G"
                        ? (pCfg.greenOptionQty !== undefined
                            ? Math.max(0, Math.floor(Number(pCfg.greenOptionQty || 0)))
                            : this.getRenkoOptionQty(objNextSummary.futureQty, pCfg.greenOptionQtyPct))
                        : (pCfg.redOptionQty !== undefined
                            ? Math.max(0, Math.floor(Number(pCfg.redOptionQty || 0)))
                            : this.getRenkoOptionQty(objNextSummary.futureQty, pCfg.redOptionQtyPct));
                }

                return vRuleColor === "G"
                    ? Math.max(0, Math.floor(Number(pCfg.greenOptionQty ?? 1)))
                    : Math.max(0, Math.floor(Number(pCfg.redOptionQty ?? 1)));
            };

            if (bAction1Enabled && !bHasRuleSet1) {
                const vQty1 = computeQty(objConfig, 1);
                if (vQty1 > 0) {
                    const arrOpened = await this.openOptionPositions(
                        pUserId,
                        objConfig,
                        vQty1,
                        "Strategy initial option entry (Action 1)",
                        vRuleColor,
                        true,
                        1,
                        undefined,
                        {},
                        false
                    );
                    vOpenedOptionCount += arrOpened.length;
                }
            }

            if (bAction2Enabled && !bHasRuleSet2) {
                const vQty2 = computeQty(objConfig2, 2);
                if (vQty2 > 0) {
                    const arrOpened = await this.openOptionPositions(
                        pUserId,
                        objConfig2,
                        vQty2,
                        "Strategy initial option entry (Action 2)",
                        vRuleColor,
                        true,
                        2,
                        undefined,
                        {},
                        false
                    );
                    vOpenedOptionCount += arrOpened.length;
                }
            }

            if (vOpenedOptionCount > 0) {
                await clearRollingOptionsStrangleTempClosedPositions(pUserId);
            }
        }

        await this.syncRuntime(pUserId, objConfig, objState, {
            status: "running",
            autoTraderEnabled: true,
            lastSignal: "STRATEGY_EXECUTED",
            lastCycleAt: new Date().toISOString(),
            lastError: ""
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "strategy_executed",
            severity: "success",
            title: "Strategy Executed",
            message: "Initial futures and option entry flow executed.",
            payload: {
                symbol: objConfig.symbol,
                reason: "strategy_execute"
            }
        });

        return { status: "success", message: "Strategy executed. Auto trader is running server-side for re-entry." };
    }

    public async start(pUserId: string): Promise<{ status: string; message: string; }> {
        const objState = this.getOrCreateState(pUserId);
        if (objState.running) {
            return { status: "warning", message: "Auto trader already running." };
        }

        const objConfig = await this.loadConfig(pUserId);
        objState.running = true;
        objState.lastError = "";
        this.armTimer(objState, objConfig.loopSeconds);
        await this.syncRuntime(pUserId, objConfig, objState, {
            status: "running",
            autoTraderEnabled: true,
            lastSignal: "AUTO_TRADER_ON",
            lastCycleAt: new Date().toISOString()
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "engine_started",
            severity: "success",
            title: "Auto Trader Started",
            message: "Server-side auto trader started.",
            payload: {
                symbol: objConfig.symbol,
                reason: "engine_started"
            }
        });
        void this.runCycle(pUserId);
        return { status: "success", message: "Auto trader started." };
    }

    public async stop(pUserId: string, pReason = "Manual stop"): Promise<{ status: string; message: string; }> {
        const objState = this.getOrCreateState(pUserId);
        if (objState.timerRef) {
            clearInterval(objState.timerRef);
            objState.timerRef = null;
        }
        objState.running = false;
        const objConfig = await this.loadConfig(pUserId);
        await this.syncRuntime(pUserId, objConfig, objState, {
            status: "stopped",
            autoTraderEnabled: false,
            lastSignal: pReason === "Manual stop" ? "AUTO_TRADER_OFF" : "ENGINE_STOPPED"
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "engine_stopped",
            severity: "info",
            title: "Auto Trader Stopped",
            message: "Server-side auto trader stopped.",
            payload: {
                symbol: objConfig.symbol,
                reason: pReason
            }
        });
        return { status: "success", message: "Auto trader stopped." };
    }

    private async handleRenkoOptionEntry(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pColorCode: "R" | "G"
    ): Promise<void> {
        const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const objSummary = getOpenPositionsSummary(objOpenPositions);
        const vColorLabel = pColorCode === "R" ? "RED" : "GREEN";
        const objUiState = await this.loadUiState(pUserId);
        const objConfig1 = this.buildRuleSetConfig(objUiState, 1);
        const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
        const bAction1Enabled = String(objUiState.action1 || "sell").trim().toLowerCase() !== "none";
        const bAction2Enabled = String(objUiState.action2 || "none").trim().toLowerCase() !== "none";
        const objOpenOptions = objOpenPositions.filter((objRow) => objRow.instrumentType === "OPTION" && objRow.status === "OPEN");
        const objOpenOptions1 = objOpenOptions.filter((objRow) => Math.floor(Number((objRow.metadata as any)?.ruleSet ?? 1)) !== 2);
        const objOpenOptions2 = objOpenOptions.filter((objRow) => Math.floor(Number((objRow.metadata as any)?.ruleSet ?? 1)) === 2);
        const bSkipRenkoEntryNoOpenOptions = Boolean((objUiState as any).skipRenkoEntryNoOpenOptions);

        if (bSkipRenkoEntryNoOpenOptions && objOpenOptions.length <= 0) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: `Renko ${vColorLabel} Skipped`,
                message: `Skipped ${vColorLabel} Renko option entry because Skip entry (0 open opts) is enabled and no option leg is running.`,
                payload: {
                    symbol: pConfig.symbol,
                    reason: "renko_option_skipped_no_open_option_leg_switch",
                    skipRenkoEntryNoOpenOptions: true
                }
            });
            return;
        }

        const readRuleSetQty = (pRuleSet: 1 | 2): number => {
            if (pRuleSet !== 2) {
                return 0;
            }
            const vRaw = pColorCode === "G"
                ? Number((objUiState as any).greenOptQty2)
                : Number((objUiState as any).redOptQty2);
            return Number.isFinite(vRaw) ? Math.max(0, Math.floor(vRaw)) : 0;
        };

        const computeQty = (pCfg: RollingOptionsPtDeConfig, pRuleSet: 1 | 2): number => {
            if (pRuleSet === 2) {
                return readRuleSetQty(2);
            }
            const vExplicitQty = pColorCode === "R"
                ? Number(pCfg.redOptionQty)
                : Number(pCfg.greenOptionQty);
            if (Number.isFinite(vExplicitQty)) {
                return Math.max(0, Math.floor(vExplicitQty));
            }
            const vPctQty = pColorCode === "R"
                ? this.getRenkoOptionQty(objSummary.futureQty, pCfg.redOptionQtyPct)
                : this.getRenkoOptionQty(objSummary.futureQty, pCfg.greenOptionQtyPct);
            return vPctQty > 0 ? vPctQty : 1;
        };

        const bShouldOpen1 = bAction1Enabled && objOpenOptions1.length === 0;
        const bShouldOpen2 = bAction2Enabled && objOpenOptions2.length === 0;
        if (!bShouldOpen1 && !bShouldOpen2) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: `Renko ${vColorLabel} Skipped`,
                message: `Skipped ${vColorLabel} Renko option entry because an option position is already open for the enabled rule set(s).`,
                payload: {
                    symbol: pConfig.symbol,
                    reason: "renko_option_skipped_option_already_open",
                    openOptionLegsRuleSet1: objOpenOptions1.length,
                    openOptionLegsRuleSet2: objOpenOptions2.length,
                    action1Enabled: bAction1Enabled,
                    action2Enabled: bAction2Enabled
                }
            });
            return;
        }

        if (bShouldOpen1) {
            const vFallbackQty = computeQty(objConfig1, 1);
            const vQty = vFallbackQty;
            if (!(vQty > 0)) {
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "manual_action",
                    severity: "info",
                    title: `Renko ${vColorLabel} Skipped`,
                    message: `Skipped ${vColorLabel} Renko option entry for Action 1 because qty resolved to 0.`,
                    payload: {
                        symbol: pConfig.symbol,
                        reason: "renko_option_skipped_zero_qty_action_1"
                    }
                });
            }
            else {
                await this.openOptionPositions(
                    pUserId,
                    objConfig1,
                    vQty,
                    pColorCode === "R" ? "Renko RED option entry (Action 1)" : "Renko GREEN option entry (Action 1)",
                    pColorCode,
                    true,
                    1,
                    undefined,
                    {},
                    false
                );
            }
        }
        if (bShouldOpen2) {
            const vFallbackQty = computeQty(objConfig2, 2);
            const vQty = vFallbackQty;
            if (!(vQty > 0)) {
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "manual_action",
                    severity: "info",
                    title: `Renko ${vColorLabel} Skipped`,
                    message: `Skipped ${vColorLabel} Renko option entry for Action 2 because qty resolved to 0.`,
                    payload: {
                        symbol: pConfig.symbol,
                        reason: "renko_option_skipped_zero_qty_action_2"
                    }
                });
            }
            else {
                await this.openOptionPositions(
                    pUserId,
                    objConfig2,
                    vQty,
                    pColorCode === "R" ? "Renko RED option entry (Action 2)" : "Renko GREEN option entry (Action 2)",
                    pColorCode,
                    true,
                    2,
                    undefined,
                    {},
                    false
                );
            }
        }
    }

    private async handleRenkoRedFlow(pUserId: string, pConfig: RollingOptionsPtDeConfig): Promise<void> {
        await this.handleRenkoOptionEntry(pUserId, pConfig, "R");
    }

    private async handleRenkoGreenFlow(pUserId: string, pConfig: RollingOptionsPtDeConfig): Promise<void> {
        await this.handleRenkoOptionEntry(pUserId, pConfig, "G");
        const objSummary = getOpenPositionsSummary(await listRollingOptionsPtDeOpenPositions(pUserId));

        if (objSummary.futureQty <= 0) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Renko GREEN Skipped",
                message: "Skipped GREEN Renko future entry because no futures position is open.",
                payload: {
                    symbol: pConfig.symbol,
                    reason: "renko_green_future_skipped_no_open_future"
                }
            });
            return;
        }

        if (objSummary.hasOpenOption) {
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "info",
                title: "Renko GREEN Skipped",
                message: "Skipped GREEN Renko future entry because an option position is already open.",
                payload: {
                    symbol: pConfig.symbol,
                    reason: "renko_green_future_skipped_option_already_open"
                }
            });
            return;
        }

        await this.openGreenRenkoFuturePosition(pUserId, pConfig, "Renko GREEN future entry");
    }

    private async handleBoxColorChangeOpen(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pUiState: Record<string, unknown>,
        pPreviousColor: string,
        pNextColor: "R" | "G"
    ): Promise<void> {
        if (!Boolean((pUiState as any).boxColorChangeOpenEnabled)
            || (pPreviousColor !== "R" && pPreviousColor !== "G")
            || pPreviousColor === pNextColor) {
            return;
        }

        if (pNextColor === "G") {
            await this.handleRenkoGreenFlow(pUserId, pConfig);
            return;
        }
        await this.handleRenkoRedFlow(pUserId, pConfig);
    }

    private async handleOptionTrigger(
        pUserId: string,
        _pConfig: RollingOptionsPtDeConfig,
        pPosition: RollingOptionsPtDePositionRecord,
        pReason: "sl" | "tp"
    ): Promise<void> {
        const objUiState = await this.loadUiState(pUserId);
        const vTriggeredRuleSet = Math.floor(Number((pPosition.metadata as any)?.ruleSet ?? 1)) === 2 ? 2 : 1;
        const objConfig1 = this.buildRuleSetConfig(objUiState, 1);
        const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
        const objTriggeredConfig = vTriggeredRuleSet === 2 ? objConfig2 : objConfig1;
        const vCloseReason = pReason === "sl" ? "SL triggered" : "TP triggered";

        const objClosedPositions = await this.closePositions([pPosition], objTriggeredConfig, vCloseReason);
        if (isPositivePnlSupportPosition(pPosition)) {
            return;
        }
        const bShouldCloseAllLegs = objClosedPositions.some((objClosedPosition) => {
            return objClosedPosition.instrumentType === "OPTION"
                && !isPositivePnlSupportPosition(objClosedPosition)
                && Number(objClosedPosition.pnl || 0) < 0;
        });
        if (Boolean((objUiState as any).closeAllLegsOnAnyClose) && bShouldCloseAllLegs) {
            const objRemaining = (await listRollingOptionsPtDeOpenPositions(pUserId))
                .filter((objPosition) => !isPositivePnlSupportPosition(objPosition));
            let objAllClosedPositions = objClosedPositions;
            if (objRemaining.length > 0) {
                const objCloseAllPositions = await this.closePositions(objRemaining, objTriggeredConfig, "Close all legs switch");
                objAllClosedPositions = [...objClosedPositions, ...objCloseAllPositions];
            }
            await this.reEnterClosedOptionPositions(pUserId, objAllClosedPositions, `${pReason === "sl" ? "SL" : "TP"} close all`);
            return;
        }

        await this.reEnterClosedOptionPositions(pUserId, objClosedPositions, pReason === "sl" ? "SL" : "TP");
    }

    private getOptionSide(pPosition: RollingOptionsPtDePositionRecord): "CE" | "PE" | "" {
        const vDirectSide = String(pPosition.optionSide || (pPosition.metadata as any)?.optionSide || "").trim().toUpperCase();
        if (vDirectSide === "CE" || vDirectSide === "PE") {
            return vDirectSide;
        }

        const vContractName = String(pPosition.contractName || pPosition.symbol || "").trim().toUpperCase();
        if (vContractName.startsWith("P-")) {
            return "PE";
        }
        if (vContractName.startsWith("C-")) {
            return "CE";
        }
        return "";
    }

    private async managePositivePnlSupports(
        pUserId: string,
        pUiState: Record<string, unknown>,
        pBaseConfig: RollingOptionsPtDeConfig,
        pManualOpen = false
    ): Promise<void> {
        const bSupportEnabled = Boolean((pUiState as any).positivePnlSupportEnabled ?? true);
        const vTriggerAmount = Math.min(0, normalizeNumber((pUiState as any).positivePnlTriggerAmount, 0));
        const vSupportAction: "buy" | "sell" = String((pUiState as any).positivePnlSupportAction || "buy").trim().toLowerCase() === "sell"
            ? "sell"
            : "buy";
        const vSupportActionLabel = vSupportAction.toUpperCase();
        const bSellSupportMode = vSupportAction === "sell";
        const objState = this.getOrCreateState(pUserId);
        const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        const arrOpenOptions = arrOpenPositions.filter((objPosition) => {
            return objPosition.status === "OPEN" && objPosition.instrumentType === "OPTION";
        });
        const arrSupportPositions = arrOpenOptions.filter(isPositivePnlSupportLeg);
        const arrSourceOptions = arrOpenOptions.filter((objPosition) => {
            return !isPositivePnlSupportLeg(objPosition)
                && String(objPosition.action || "").trim().toUpperCase() === "SELL";
        });
        const vConfiguredSupportExpiryDate = String((pUiState as any).positivePnlExpiryDate || "").trim();
        const arrExpiryChangedSupports = /^\d{4}-\d{2}-\d{2}$/.test(vConfiguredSupportExpiryDate)
            ? arrSupportPositions.filter((objSupport) => {
                const objMetadata = (objSupport.metadata || {}) as Record<string, unknown>;
                const vSupportExpiryDate = String(
                    objSupport.expiryDate
                    || objMetadata.resolvedExpiryDate
                    || objMetadata.requestedExpiryDate
                    || objMetadata.positivePnlExpiryDate
                    || ""
                ).trim();
                return Boolean(vSupportExpiryDate) && vSupportExpiryDate !== vConfiguredSupportExpiryDate;
            })
            : [];
        if (arrExpiryChangedSupports.length > 0) {
            await this.closePositions(arrExpiryChangedSupports, pBaseConfig, "Support closed because Positive PnL expiry date changed");
        }
        const objExpiryChangedSupportIds = new Set(arrExpiryChangedSupports.map((objPosition) => objPosition.positionId));
        const arrSupportPositionsAfterExpiryChange = arrSupportPositions.filter((objPosition) => !objExpiryChangedSupportIds.has(objPosition.positionId));
        const arrRemainingSupportPositions = arrSupportPositionsAfterExpiryChange;
        const arrNegativeSourceOptions = arrSourceOptions.filter((objPosition) => Number(objPosition.pnl || 0) <= vTriggerAmount);
        const objSourceById = new Map(arrSourceOptions.map((objPosition) => [objPosition.positionId, objPosition]));
        const arrActiveSupports = arrRemainingSupportPositions;
        const objActiveSupportSourceIds = new Set(arrActiveSupports
            .map((objPosition) => String((objPosition.metadata as any)?.sourcePositionId || "").trim())
            .filter(Boolean));

        for (const vTrackedSourceId of Array.from(objState.sourcePositiveCycleCountByPositionId.keys())) {
            if (!objSourceById.has(vTrackedSourceId)) {
                objState.sourcePositiveCycleCountByPositionId.delete(vTrackedSourceId);
            }
        }

        const saveSourceTriggerState = async (
            pSource: RollingOptionsPtDePositionRecord,
            pArmed: boolean,
            pPositiveCycleCount: number
        ): Promise<void> => {
            const objMetadata = (pSource.metadata || {}) as Record<string, unknown>;
            const vCurrentArmed = objMetadata.positivePnlSupportArmed !== false;
            const vCurrentCount = Math.max(0, Math.floor(Number(objMetadata.positivePnlCycleCount || 0)));
            if (vCurrentArmed === pArmed && vCurrentCount === pPositiveCycleCount) {
                return;
            }
            await saveRollingOptionsPtDePosition({
                ...pSource,
                metadata: {
                    ...objMetadata,
                    positivePnlSupportArmed: pArmed,
                    positivePnlCycleCount: pPositiveCycleCount
                },
                updatedAt: ""
            });
        };

        for (const objSource of arrSourceOptions) {
            if (objActiveSupportSourceIds.has(objSource.positionId)) {
                objState.sourcePositiveCycleCountByPositionId.set(objSource.positionId, -1);
                await saveSourceTriggerState(objSource, false, 0);
                continue;
            }
            if ((bSellSupportMode ? Number(objSource.pnl || 0) > 0 : Number(objSource.pnl || 0) > vTriggerAmount)
                && (objSource.metadata as any)?.positivePnlSupportArmed !== false) {
                objState.sourcePositiveCycleCountByPositionId.set(objSource.positionId, 0);
                await saveSourceTriggerState(objSource, true, 0);
            }
        }

        if (!bSupportEnabled) {
            return;
        }

        if (arrNegativeSourceOptions.length <= 0) {
            return;
        }

        const objPendingSource = arrNegativeSourceOptions.find((objPosition) => {
            const vTrackedCount = objState.sourcePositiveCycleCountByPositionId.get(objPosition.positionId)
                ?? Number((objPosition.metadata as any)?.positivePnlCycleCount || 0);
            return vTrackedCount > 0;
        });
        const objSource = objPendingSource || [...arrNegativeSourceOptions]
            .sort((objLeft, objRight) => Number(objLeft.pnl || 0) - Number(objRight.pnl || 0))[0];
        if (!objSource) {
            return;
        }

        if (objActiveSupportSourceIds.has(objSource.positionId)) {
            return;
        }
        const bSourceArmed = (objSource.metadata as any)?.positivePnlSupportArmed !== false;
        if (!bSourceArmed) {
            objState.sourcePositiveCycleCountByPositionId.set(objSource.positionId, 0);
            await saveSourceTriggerState(objSource, true, 0);
        }

        const vPreviousCycleCount = Math.max(
            0,
            objState.sourcePositiveCycleCountByPositionId.get(objSource.positionId)
                ?? Number((objSource.metadata as any)?.positivePnlCycleCount || 0)
        );
        const vPositiveCycleCount = pManualOpen ? 1 : Math.min(1, vPreviousCycleCount + 1);
        objState.sourcePositiveCycleCountByPositionId.set(objSource.positionId, vPositiveCycleCount);
        await saveSourceTriggerState(objSource, true, vPositiveCycleCount);
        if (vPositiveCycleCount < 1) {
            return;
        }

        const vMaxLegs = Math.max(1, Math.floor(normalizeNumber((pUiState as any).positivePnlMaxLegs, 1)));
        if (arrActiveSupports.length >= vMaxLegs) {
            return;
        }
        const vSourceSide = this.getOptionSide(objSource);
        if (!vSourceSide) {
            return;
        }

        const vSupportSide: "CE" | "PE" = bSellSupportMode
            ? (vSourceSide === "CE" ? "PE" : "CE")
            : vSourceSide;
        const vQty = Math.max(0, Math.floor(normalizeNumber((pUiState as any).positivePnlSupportQty, 10)));
        if (!(vQty > 0)) {
            return;
        }
        const vRuleSet: 1 | 2 = Math.floor(Number((objSource.metadata as any)?.ruleSet ?? 1)) === 2 ? 2 : 1;
        const objRuleConfig = this.buildRuleSetConfig(pUiState, vRuleSet);
        const vExpiryModeRaw = String((pUiState as any).positivePnlExpiryMode || "1").trim();
        const vExpiryMode = ["1", "2", "4", "5", "6", "7"].includes(vExpiryModeRaw)
            ? vExpiryModeRaw as RollingOptionsPtDeConfig["expiryMode"]
            : (String((objSource.metadata as any)?.expiryMode || objRuleConfig.expiryMode || "1") as RollingOptionsPtDeConfig["expiryMode"]);
        const vSelectedExpiryDate = String((pUiState as any).positivePnlExpiryDate || "").trim();
        const vExpiryDate = vExpiryModeRaw === "source"
            ? String(objSource.expiryDate || objRuleConfig.expiryDate || "")
            : (vSelectedExpiryDate || resolveExpiryDateByMode(vExpiryMode));
        const vTargetDelta = Math.max(0, normalizeNumber((pUiState as any).positivePnlTargetDelta, 0.53));
        const vTakeProfitPct = Math.min(100, Math.max(0, normalizeNumber((pUiState as any).positivePnlTpPct, 15)));
        const vStopLossPct = Math.min(100, Math.max(0, normalizeNumber((pUiState as any).positivePnlSlPct, 85)));
        const bTrailSlEnabled = Boolean((pUiState as any).positivePnlTrailSlEnabled ?? false);
        const vTakeProfitMove = vTakeProfitPct / 100;
        const vStopLossMove = vStopLossPct / 100;
        const objSupportConfig: RollingOptionsPtDeConfig = {
            ...objRuleConfig,
            action: vSupportAction,
            legSide: vSupportSide === "PE" ? "pe" : "ce",
            expiryMode: vExpiryMode,
            expiryDate: vExpiryDate,
            optionQty: vQty,
            newDelta: vTargetDelta,
            reDelta: vTargetDelta,
            greenReDelta: vTargetDelta,
            redReDelta: vTargetDelta,
            deltaTakeProfit: vTakeProfitMove,
            deltaStopLoss: vStopLossMove,
            redDeltaTakeProfit: vTakeProfitMove,
            redDeltaStopLoss: vStopLossMove,
            redTakeProfitPct: vTakeProfitPct,
            redStopLossPct: vStopLossPct,
            greenDeltaTakeProfit: vTakeProfitMove,
            greenDeltaStopLoss: vStopLossMove,
            greenTakeProfitPct: vTakeProfitPct,
            greenStopLossPct: vStopLossPct
        };
        Object.assign(objSupportConfig, {
            ruleSetGreenTpPct: vTakeProfitPct,
            ruleSetGreenSlPct: vStopLossPct,
            ruleSetRedTpPct: vTakeProfitPct,
            ruleSetRedSlPct: vStopLossPct
        });
        const arrOpenedSupports = await this.openOptionPositions(
            pUserId,
            objSupportConfig,
            vQty,
            "Positive PnL support",
            vSupportSide === "PE" ? "R" : "G",
            false,
            vRuleSet,
            [vSupportSide],
            {
                positivePnlSupport: true,
                actionSlot: 3,
                actionLabel: "Action 3",
                supportAction: vSupportAction,
                sourcePositionId: objSource.positionId,
                sourceContractName: objSource.contractName,
                sourceOptionSide: vSourceSide,
                adjustmentGroupId: `positive-pnl:${objSource.positionId}`,
                hedgeTargetDelta: vTargetDelta,
                manualHedgeQty: vQty,
                maxHedgeQty: vQty,
                configuredTakeProfitPct: vTakeProfitPct,
                configuredStopLossPct: vStopLossPct,
                positivePnlTrailSlEnabled: bTrailSlEnabled,
                positivePnlExpiryDate: vSelectedExpiryDate,
                positivePnlTriggerAmount: vTriggerAmount,
                triggeredByNegativeSourceLeg: true,
                reason: "positive_pnl_support"
            }
        );
        if (arrOpenedSupports.length > 0) {
            objState.sourcePositiveCycleCountByPositionId.set(objSource.positionId, -1);
            await saveSourceTriggerState(objSource, false, 0);
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "success",
                title: "Positive PnL Support Opened",
                message: `Opened ${vSupportActionLabel} ${vSupportSide} support after source leg PnL stayed at or below ${vTriggerAmount} for one cycle.`,
                payload: {
                    symbol: pBaseConfig.symbol,
                    sourcePositionId: objSource.positionId,
                    sourceContractName: objSource.contractName,
                    sourcePnl: Number(objSource.pnl || 0),
                    supportSide: vSupportSide,
                    supportAction: vSupportAction,
                    triggerAmount: vTriggerAmount,
                    reason: "positive_pnl_support"
                }
            });
        }
    }

    public async openPositivePnlSupportManually(pUserId: string): Promise<{ status: string; message: string; openedCount: number; }> {
        const objConfig = await this.loadConfig(pUserId);
        const objUiState = ((objConfig as any).__uiState || {}) as Record<string, unknown>;
        const objState = this.getOrCreateState(pUserId);
        const arrBefore = await listRollingOptionsPtDeOpenPositions(pUserId);
        const vBeforeSupportCount = arrBefore.filter(isPositivePnlSupportLeg).length;
        const objRenkoSnapshot = objConfig.renkoEnabled
            ? getFreshWebSocketMarketSnapshot(objConfig, RENKO_MAX_WEBSOCKET_TICK_AGE_MS)
            : this.getSimulatedSnapshot(objState, objConfig);

        if (objRenkoSnapshot) {
            updateRenkoState(objState, objRenkoSnapshot, objConfig);
        }

        await this.managePositivePnlSupports(
            pUserId,
            objUiState,
            objConfig,
            true
        );

        const arrAfter = await listRollingOptionsPtDeOpenPositions(pUserId);
        const vAfterSupportCount = arrAfter.filter(isPositivePnlSupportLeg).length;
        const vOpenedCount = Math.max(0, vAfterSupportCount - vBeforeSupportCount);
        return {
            status: vOpenedCount > 0 ? "success" : "warning",
            message: vOpenedCount > 0
                ? `Opened ${vOpenedCount} Positive PnL support leg${vOpenedCount === 1 ? "" : "s"}.`
                : "No Positive PnL support leg was opened. Check negative source PnL, Max Legs, qty, and margin.",
            openedCount: vOpenedCount
        };
    }

    private async updateStandaloneEmaIndicator(
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState,
        pUiState: Record<string, unknown>
    ): Promise<void> {
        const bEnabled = Boolean((pUiState as any).emaEnabled);
        const vSource = normalizeEmaSource((pUiState as any).emaSource);
        const vTimeframe = normalizeEmaTimeframe((pUiState as any).emaTimeframe);
        const vPeriod = normalizeEmaPeriod((pUiState as any).emaPeriod);
        pState.ema.enabled = bEnabled;
        pState.ema.source = vSource;
        pState.ema.timeframe = vTimeframe;
        pState.ema.period = vPeriod;

        if (!bEnabled) {
            pState.ema.value = null;
            pState.ema.close = null;
            pState.ema.trend = "FLAT";
            pState.ema.signalTrend = "FLAT";
            pState.ema.candleCount = 0;
            pState.ema.calculatedAt = "";
            pState.ema.error = "";
            return;
        }

        try {
            const objEma = vSource === "renko"
                ? await this.getRenkoBrickEma(pConfig, vPeriod)
                : await getCandleEma(pConfig.contractName, vTimeframe, vPeriod);
            const vManualValue = Number((pUiState as any).emaManualValue);
            pState.ema.value = Number.isFinite(vManualValue) && vManualValue > 0 ? vManualValue : objEma.value;
            pState.ema.close = objEma.close;
            pState.ema.trend = pState.ema.value !== null && objEma.close !== null
                ? (objEma.close > pState.ema.value ? "UP" : (objEma.close < pState.ema.value ? "DOWN" : "FLAT"))
                : "FLAT";
            pState.ema.candleCount = objEma.candleCount;
            pState.ema.calculatedAt = objEma.calculatedAt;
            pState.ema.error = pState.ema.value === null
                ? `Need at least ${vPeriod} ${vSource === "renko" ? "Renko bricks" : `${vTimeframe} candles`}.`
                : "";
        }
        catch (objError) {
            pState.ema.error = objError instanceof Error ? objError.message : String(objError);
            pState.ema.calculatedAt = new Date().toISOString();
        }
    }

    private async getRenkoBrickEma(
        pConfig: RollingOptionsPtDeConfig,
        pPeriod: number
    ): Promise<{ value: number | null; close: number | null; candleCount: number; calculatedAt: string; }> {
        const objHistory = await getHistoricalCandleCloses(
            pConfig.contractName,
            pConfig.renkoTimeframe || "1m",
            Math.max(700, pPeriod * 20)
        );
        const objBricks = buildRenkoBrickClosesFromPrices(objHistory.closes, pConfig.renkoStepPoints);
        const vValue = calculateEmaFromCloses(objBricks.closes, pPeriod);
        return {
            value: vValue,
            close: objBricks.closes.length > 0 ? objBricks.closes[objBricks.closes.length - 1] : null,
            candleCount: objBricks.closes.length,
            calculatedAt: objHistory.fetchedAt
        };
    }

    private getRenkoHistoryKey(pConfig: RollingOptionsPtDeConfig): string {
        return [
            pConfig.contractName,
            pConfig.renkoStepPoints,
            pConfig.renkoTimeframe || "1m",
            pConfig.renkoPriceSource,
            pConfig.renkoManualPriceResetToken || 0
        ].join("|");
    }

    private async syncRenkoFromHistoricalCandles(
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState
    ): Promise<void> {
        if (!pConfig.renkoEnabled) {
            return;
        }

        const vHistoryKey = this.getRenkoHistoryKey(pConfig);
        if (pState.renko.historyKey === vHistoryKey && pState.renko.anchor !== null) {
            return;
        }

        const vManualStartPrice = Number(pConfig.renkoManualPrice);
        if (Number.isFinite(vManualStartPrice) && vManualStartPrice > 0) {
            pState.renko.anchor = vManualStartPrice;
            pState.renko.lastDir = 0;
            pState.renko.lastColor = "";
            pState.renko.lastPrice = vManualStartPrice;
            pState.renko.historyKey = vHistoryKey;
            pState.renko.historySyncedAt = new Date().toISOString();
            pState.renko.historyCandleCount = 0;
            return;
        }

        const objHistory = await getHistoricalCandleCloses(
            pConfig.contractName,
            pConfig.renkoTimeframe || "1m",
            700
        );
        if (objHistory.closes.length <= 0) {
            return;
        }

        pState.renko.anchor = null;
        pState.renko.lastDir = 0;
        pState.renko.lastColor = "";
        pState.renko.historyKey = vHistoryKey;
        pState.renko.historySyncedAt = objHistory.fetchedAt;
        pState.renko.historyCandleCount = objHistory.candleCount;

        for (const vClose of objHistory.closes) {
            updateRenkoState(pState, {
                symbol: pConfig.symbol,
                contractName: pConfig.contractName,
                spotPrice: vClose,
                futuresPrice: vClose,
                bestBidPrice: vClose,
                bestAskPrice: vClose,
                priceSource: "public",
                ts: objHistory.fetchedAt
            }, pConfig);
        }
    }

    private async syncBoxFromHistoricalCandles(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState,
        pUiState: Record<string, unknown>
    ): Promise<RollingOptionsPtDeConfig> {
        const vBoxPoints = Math.max(1, Math.round(Number((pUiState as any).boxConditionPoints || 10)));
        const objBoxConfig: RollingOptionsPtDeConfig = {
            ...pConfig,
            renkoStepPoints: vBoxPoints,
            renkoManualPrice: null,
            renkoManualPriceResetToken: 0
        };
        const objBoxState = this.getOrCreateBoxState(pUserId);
        const vHistoryKey = [
            objBoxConfig.contractName,
            vBoxPoints,
            objBoxConfig.renkoTimeframe || "1m",
            objBoxConfig.renkoPriceSource
        ].join("|");
        if (objBoxState.historyKey === vHistoryKey && objBoxState.anchor !== null) {
            return objBoxConfig;
        }

        const objHistory = await getHistoricalCandleCloses(
            objBoxConfig.contractName,
            objBoxConfig.renkoTimeframe || "1m",
            700
        );
        if (objHistory.closes.length <= 0) {
            return objBoxConfig;
        }

        objBoxState.anchor = null;
        objBoxState.lastDir = 0;
        objBoxState.lastColor = "";
        objBoxState.historyKey = vHistoryKey;
        objBoxState.historySyncedAt = objHistory.fetchedAt;
        objBoxState.historyCandleCount = objHistory.candleCount;
        for (const vClose of objHistory.closes) {
            this.updateBoxState(objBoxState, {
                symbol: objBoxConfig.symbol,
                contractName: objBoxConfig.contractName,
                spotPrice: vClose,
                futuresPrice: vClose,
                bestBidPrice: vClose,
                bestAskPrice: vClose,
                priceSource: "public",
                ts: objHistory.fetchedAt
            }, objBoxConfig);
        }
        return objBoxConfig;
    }

    private getTargetOpenPnl(pUiState: Record<string, unknown>): number | null {
        const vTarget = normalizeNumber((pUiState as any).targetOpenPnl, 0);
        if (!Number.isFinite(vTarget) || vTarget === 0) {
            return null;
        }
        return vTarget;
    }

    private async calculateCurrentOpenPnl(
        pPositions: RollingOptionsPtDePositionRecord[],
        pSnapshot: RollingOptionsPtDeMarketSnapshot
    ): Promise<number> {
        let vOpenPnl = 0;
        for (const objPosition of pPositions) {
            if (objPosition.status !== "OPEN") {
                continue;
            }

            if (objPosition.instrumentType === "FUTURE") {
                vOpenPnl += getPositionPnl(objPosition, pSnapshot.futuresPrice);
                continue;
            }

            const vProductSymbol = String(objPosition.metadata?.productSymbol || "").trim();
            let vMarkPrice = Number(objPosition.markPrice || objPosition.entryPrice || 0);
            if (vProductSymbol) {
                const objCachedTicker = getCachedOptionTicker(vProductSymbol);
                const objLiveTicker = objCachedTicker || await getLiveOptionTicker(vProductSymbol).catch(() => null);
                if (Number.isFinite(Number(objLiveTicker?.markPrice)) && Number(objLiveTicker?.markPrice) > 0) {
                    vMarkPrice = Number(objLiveTicker?.markPrice);
                }
            }
            vOpenPnl += getPositionPnl(objPosition, vMarkPrice);
        }
        return Number(vOpenPnl.toFixed(6));
    }

    private async handleTargetOpenPnlExit(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState,
        pUiState: Record<string, unknown>,
        pOpenPositions: RollingOptionsPtDePositionRecord[],
        pSnapshot: RollingOptionsPtDeMarketSnapshot
    ): Promise<{ triggered: boolean; message: string; }> {
        const vTarget = this.getTargetOpenPnl(pUiState);
        if (vTarget === null || pOpenPositions.length <= 0) {
            return { triggered: false, message: "" };
        }

        const vOpenPnl = await this.calculateCurrentOpenPnl(pOpenPositions, pSnapshot);
        const bHitTarget = vTarget > 0 ? vOpenPnl >= vTarget : vOpenPnl <= vTarget;
        if (!bHitTarget) {
            return { triggered: false, message: "" };
        }

        const vReason = `Target Open PnL hit (${vOpenPnl.toFixed(3)} / ${vTarget.toFixed(3)})`;
        await this.closePositions(pOpenPositions, pConfig, vReason);
        pState.lastError = "";
        pState.lastCycleAt = new Date().toISOString();
        await this.syncRuntime(pUserId, pConfig, pState, {
            status: "running",
            autoTraderEnabled: true,
            lastSpotPrice: pSnapshot.spotPrice,
            lastFuturesPrice: pSnapshot.futuresPrice,
            lastSignal: "TARGET_OPEN_PNL_HIT",
            lastCycleAt: pState.lastCycleAt,
            lastError: ""
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: vTarget > 0 ? "success" : "warning",
            title: "Target Open PnL Hit",
            message: vReason,
            payload: {
                symbol: pConfig.symbol,
                openPnl: vOpenPnl,
                targetOpenPnl: vTarget,
                reason: "target_open_pnl_hit"
            }
        });

        return {
            triggered: true,
            message: `${vReason}. Closed all open positions and kept auto trader running.`
        };
    }

    private async handleEmaSignalCondition(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState,
        pUiState: Record<string, unknown>
    ): Promise<void> {
        const bSignalEnabled = Boolean((pUiState as any).emaSignalEnabled);
        if (!bSignalEnabled || !pState.ema.enabled || pState.ema.error) {
            return;
        }

        const vTrend = pState.ema.trend;
        if (vTrend !== "UP" && vTrend !== "DOWN") {
            return;
        }
        if (pState.ema.signalTrend === vTrend) {
            return;
        }

        pState.ema.signalTrend = vTrend;
        const vColorCode: "R" | "G" = vTrend === "UP" ? "G" : "R";
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "info",
            title: "EMA Signal Detected",
            message: `EMA ${vTrend} condition triggered ${vColorCode === "G" ? "GREEN" : "RED"} strategy flow.`,
            payload: {
                symbol: pConfig.symbol,
                emaTrend: vTrend,
                emaTimeframe: pState.ema.timeframe,
                emaPeriod: pState.ema.period,
                emaValue: pState.ema.value,
                emaClose: pState.ema.close,
                reason: "ema_signal_condition"
            }
        });

        if (vColorCode === "G") {
            await this.handleRenkoGreenFlow(pUserId, pConfig);
            return;
        }
        await this.handleRenkoRedFlow(pUserId, pConfig);
    }

    public async refreshStandaloneEmaIndicator(pUserId: string): Promise<{ status: string; message: string; }> {
        const objConfig = await this.loadConfig(pUserId);
        const objUiState = ((objConfig as any).__uiState || {}) as Record<string, unknown>;
        const objState = this.getOrCreateState(pUserId);
        await this.updateStandaloneEmaIndicator(objConfig, objState, objUiState);
        await this.syncRuntime(pUserId, objConfig, objState, {
            status: objState.running ? "running" : "stopped",
            autoTraderEnabled: objState.running,
            lastSignal: objState.ema.enabled ? "EMA_REFRESHED" : "EMA_OFF",
            lastError: ""
        });
        return {
            status: objState.ema.error ? "warning" : "success",
            message: objState.ema.enabled
                ? (objState.ema.error || "EMA refreshed.")
                : "EMA is OFF."
        };
    }

    public async setTradingViewEmaTrend(
        pUserId: string,
        pTrend: "UP" | "DOWN" | "FLAT",
        pPayload: Record<string, unknown> = {}
    ): Promise<{ status: string; message: string; trend: "UP" | "DOWN" | "FLAT"; }> {
        const objConfig = await this.loadConfig(pUserId);
        const objUiState = ((objConfig as any).__uiState || {}) as Record<string, unknown>;
        const objState = this.getOrCreateState(pUserId);
        const vTrend = normalizeTradingViewEmaTrend(pTrend);
        const bTradingViewEmaEnabled = Boolean((objUiState as any).tradingViewEmaEnabled);
        const vAllowedSide = normalizeTradingViewEmaSide((objUiState as any).tradingViewEmaSide);
        if (!bTradingViewEmaEnabled) {
            await this.syncRuntime(pUserId, objConfig, objState, {
                lastSignal: "TV_EMA_OFF",
                lastError: ""
            });
            return {
                status: "warning",
                message: "TradingView EMA message ignored because TV EMA is OFF.",
                trend: objState.tradingViewEmaTrend || "FLAT"
            };
        }
        if (vTrend !== "FLAT" && vAllowedSide !== "BOTH" && vTrend !== vAllowedSide) {
            await this.syncRuntime(pUserId, objConfig, objState, {
                lastSignal: `TV_EMA_${vTrend}_IGNORED`,
                lastError: ""
            });
            return {
                status: "warning",
                message: `TradingView EMA ${vTrend} ignored because TV EMA side is ${vAllowedSide}.`,
                trend: objState.tradingViewEmaTrend || "FLAT"
            };
        }
        objState.tradingViewEmaTrend = vTrend;
        await this.syncRuntime(pUserId, objConfig, objState, {
            lastSignal: `TV_EMA_${vTrend}`,
            lastError: ""
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: vTrend === "FLAT" ? "info" : "success",
            title: "TradingView EMA Trend",
            message: `TradingView EMA trend switched to ${vTrend}.`,
            payload: {
                symbol: objConfig.symbol,
                trend: vTrend,
                source: "tradingview",
                receivedPayload: pPayload,
                reason: "tradingview_ema_trend"
            }
        });

        return {
            status: "success",
            message: `TradingView EMA trend switched to ${vTrend}.`,
            trend: vTrend
        };
    }

    public async runCycle(pUserId: string): Promise<{ status: string; message: string; }> {
        return runWithPostgresAdvisoryLock(
            `rolling-options-strangle:cycle:${pUserId}`,
            () => this.runCycleWithProcessLock(pUserId),
            () => ({ status: "warning", message: "Cycle already in progress on another server instance." })
        );
    }

    private async runCycleWithProcessLock(pUserId: string): Promise<{ status: string; message: string; }> {
        const objState = this.getOrCreateState(pUserId);
        if (objState.isBusy) {
            return { status: "warning", message: "Cycle already in progress." };
        }

        objState.isBusy = true;
        try {
            const objConfig = await this.loadConfig(pUserId);
            let objCurrentOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
            const vPreviousSpotPrice = Number(objState.market.lastSpotPrice ?? NaN);
            ensureLiveTickerSymbols([
                objConfig.contractName,
                ...objCurrentOpenPositions
                    .map((objRow) => String(objRow.metadata?.productSymbol || "").trim())
                    .filter(Boolean)
            ]);
            const objSnapshot = await this.getMarketSnapshot(objState, objConfig);
            objState.market.lastSpotPrice = objSnapshot.spotPrice;
            objState.market.lastFuturesPrice = objSnapshot.futuresPrice;
            objState.market.lastSource = objSnapshot.priceSource;
            const objUiState = ((objConfig as any).__uiState || {}) as Record<string, unknown>;
            await this.updateStandaloneEmaIndicator(objConfig, objState, objUiState);

            const objTargetOpenPnlExit = await this.handleTargetOpenPnlExit(
                pUserId,
                objConfig,
                objState,
                objUiState,
                objCurrentOpenPositions,
                objSnapshot
            );
            if (objTargetOpenPnlExit.triggered) {
                return { status: "success", message: objTargetOpenPnlExit.message };
            }

            if (objState.running) {
                await this.handleEmaSignalCondition(pUserId, objConfig, objState, objUiState);
                objCurrentOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
            }

            const objPayoffSlTrigger = await this.handlePayoffSlCheckpointTrigger(
                pUserId,
                objConfig,
                objCurrentOpenPositions,
                vPreviousSpotPrice,
                objSnapshot.spotPrice
            );
            if (objPayoffSlTrigger.triggered) {
                objState.cycleCount += 1;
                objState.consecutiveFailures = 0;
                objState.lastError = "";
                objState.lastCycleAt = new Date().toISOString();
                await this.syncRuntime(pUserId, objConfig, objState, {
                    status: objState.running ? "running" : "stopped",
                    autoTraderEnabled: objState.running,
                    lastSpotPrice: objSnapshot.spotPrice,
                    lastFuturesPrice: objSnapshot.futuresPrice,
                    lastSignal: objPayoffSlTrigger.signal,
                    lastCycleAt: objState.lastCycleAt
                });
                return { status: "success", message: objPayoffSlTrigger.message };
            }

            const bTrailGreenTp1Enabled = Boolean((objUiState as any).trailGreenTp1Enabled ?? true);
            const bTrailRedTp1Enabled = Boolean((objUiState as any).trailRedTp1Enabled ?? true);
            const bTrailGreenTp2Enabled = Boolean((objUiState as any).trailGreenTp2Enabled ?? true);
            const bTrailRedTp2Enabled = Boolean((objUiState as any).trailRedTp2Enabled ?? true);
            const isRenkoColorTrailTpEnabled = (pRuleColor: string, pRuleSet: 1 | 2): boolean => {
                const vRuleColor = String(pRuleColor || "").trim().toUpperCase();
                if (pRuleSet === 2) {
                    return vRuleColor === "G" ? bTrailGreenTp2Enabled : (vRuleColor === "R" ? bTrailRedTp2Enabled : false);
                }
                return vRuleColor === "G" ? bTrailGreenTp1Enabled : (vRuleColor === "R" ? bTrailRedTp1Enabled : false);
            };

            await this.syncRenkoFromHistoricalCandles(objConfig, objState);
            const vPreviousRenkoColor = String(objState.renko.lastColor || "").trim().toUpperCase();
            const objRenkoSnapshot = objConfig.renkoEnabled
                ? (getFreshWebSocketMarketSnapshot(objConfig, RENKO_MAX_WEBSOCKET_TICK_AGE_MS) || objSnapshot)
                : null;
            const objRenkoSignals = objRenkoSnapshot
                ? updateRenkoState(objState, objRenkoSnapshot, objConfig)
                : [];

            if (objRenkoSignals.length > 0) {
                const vLast = objRenkoSignals.at(-1) === "R" ? "R" : "G";
                await logRollingOptionsPtDeEvent({
                    userId: pUserId,
                    eventType: "renko_change_detected",
                    severity: "info",
                    title: "Renko Change Detected",
                    message: `Server detected ${objRenkoSignals.length} renko brick(s).`,
                    payload: {
                        symbol: objConfig.symbol,
                        reason: "renko_bricks",
                        renkoColor: vLast,
                        bricks: objRenkoSignals.length
                    }
                });

                const vFirstNewRenkoSignal: "R" | "G" = objRenkoSignals[0] === "R" ? "R" : "G";
                await this.openPendingReplacementPositionsOnRenko(pUserId, vFirstNewRenkoSignal);

                if ((vPreviousRenkoColor === "R" || vPreviousRenkoColor === "G")
                    && vPreviousRenkoColor !== vLast) {
                    const arrOpenOptionPositions = objCurrentOpenPositions.filter((objRow) => {
                        const objMeta = (objRow.metadata || {}) as Record<string, unknown>;
                        const vRuleColor = String(objMeta.ruleColor || "").trim().toUpperCase();
                        const vRuleSet = Math.floor(Number((objMeta as any).ruleSet ?? 1)) === 2 ? 2 : 1;
                        return objRow.status === "OPEN"
                            && objRow.instrumentType === "OPTION"
                            && !isPositivePnlSupportPosition(objRow)
                            && vRuleColor !== vLast
                            && (vRuleColor === "R" || vRuleColor === "G")
                            && isRenkoColorTrailTpEnabled(vRuleColor, vRuleSet);
                    });

                    if (arrOpenOptionPositions.length > 0) {
                        const objClosedPositions = await this.closePositions(
                            arrOpenOptionPositions,
                            objConfig,
                            `Renko color changed from ${vPreviousRenkoColor} to ${vLast}`
                        );
                        await this.reEnterClosedOptionPositions(
                            pUserId,
                            objClosedPositions,
                            `Renko color changed from ${vPreviousRenkoColor} to ${vLast}`
                        );
                        objCurrentOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);

                        await this.closeReplacementWhenOriginalLegsPositive(pUserId, objConfig);
                    }
                }
            }

            const bBoxConditionsEnabled = Boolean((objUiState as any).boxConditionEnabled);
            const objBoxConfig = bBoxConditionsEnabled
                ? await this.syncBoxFromHistoricalCandles(pUserId, objConfig, objState, objUiState)
                : null;
            const objBoxState = this.getOrCreateBoxState(pUserId);
            const vPreviousBoxColor = String(objBoxState.lastColor || "").trim().toUpperCase();
            const objBoxSnapshot = objBoxConfig
                ? (getFreshWebSocketMarketSnapshot(objBoxConfig, RENKO_MAX_WEBSOCKET_TICK_AGE_MS) || objSnapshot)
                : null;
            const objBoxSignals = objBoxConfig && objBoxSnapshot
                ? this.updateBoxState(objBoxState, objBoxSnapshot, objBoxConfig)
                : [];
            if (objBoxSignals.length > 0) {
                const vLastBoxSignal: "R" | "G" = objBoxSignals.at(-1) === "R" ? "R" : "G";
                if (Boolean((objUiState as any).boxColorChangeCloseEnabled)
                    && (vPreviousBoxColor === "R" || vPreviousBoxColor === "G")
                    && vPreviousBoxColor !== vLastBoxSignal) {
                    const arrBoxCloseTargets = objCurrentOpenPositions.filter((objRow) => {
                        const objMeta = (objRow.metadata || {}) as Record<string, unknown>;
                        const vRuleColor = String(objMeta.ruleColor || "").trim().toUpperCase();
                        return objRow.status === "OPEN"
                            && objRow.instrumentType === "OPTION"
                            && !isPositivePnlSupportPosition(objRow)
                            && !this.isReplacementOptionPosition(objRow)
                            && vRuleColor === vPreviousBoxColor;
                    });
                    if (arrBoxCloseTargets.length > 0) {
                        const arrClosedPositions = await this.closePositions(
                            arrBoxCloseTargets,
                            objConfig,
                            `Box color changed from ${vPreviousBoxColor} to ${vLastBoxSignal}`
                        );
                        await this.reEnterClosedOptionPositions(
                            pUserId,
                            arrClosedPositions,
                            `Box color changed from ${vPreviousBoxColor} to ${vLastBoxSignal}`
                        );
                        objCurrentOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
                    }
                }
                await this.handleBoxColorChangeOpen(
                    pUserId,
                    objConfig,
                    objUiState,
                    vPreviousBoxColor,
                    vLastBoxSignal
                );
            }

            for (const vRenkoSignal of objRenkoSignals) {
                if (!objState.running) {
                    break;
                }

                if (vRenkoSignal === "R") {
                    await this.handleRenkoRedFlow(pUserId, objConfig);
                    continue;
                }

                await this.handleRenkoGreenFlow(pUserId, objConfig);
            }

            const objOpenFutures = objCurrentOpenPositions
                .filter((objRow) => objRow.instrumentType === "FUTURE");
            const objOpenOptions = objCurrentOpenPositions
                .filter((objRow) => objRow.instrumentType === "OPTION");

            const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
            const bTrailGreenSl1Enabled = Boolean((objUiState as any).trailGreenSl1Enabled ?? true);
            const bTrailRedSl1Enabled = Boolean((objUiState as any).trailRedSl1Enabled ?? true);
            const bTrailGreenSl2Enabled = Boolean((objUiState as any).trailGreenSl2Enabled ?? true);
            const bTrailRedSl2Enabled = Boolean((objUiState as any).trailRedSl2Enabled ?? true);
            const bPositivePnlTrailSlEnabled = Boolean((objUiState as any).positivePnlTrailSlEnabled ?? false);

            for (const objPosition of objOpenFutures) {
                const vNextPnl = getPositionPnl(objPosition, objSnapshot.futuresPrice);
                const bShouldSave = Number(objPosition.markPrice ?? NaN) !== objSnapshot.futuresPrice
                    || Number(objPosition.pnl ?? NaN) !== vNextPnl;
                if (bShouldSave) {
                    await saveRollingOptionsPtDePosition({
                        ...objPosition,
                        markPrice: objSnapshot.futuresPrice,
                        pnl: vNextPnl,
                        updatedAt: ""
                    });
                }
            }

            for (const objPosition of objOpenOptions) {
                const vProductSymbol = String(objPosition.metadata?.productSymbol || "").trim();
                const objCachedTicker = vProductSymbol ? getCachedOptionTicker(vProductSymbol) : null;
                const bHasLiveMark = Number.isFinite(Number(objCachedTicker?.markPrice));
                const vCurrentDelta = Math.abs(Number(objCachedTicker?.delta || objPosition.exitDelta || objPosition.entryDelta || 0.53));
                const vMarkPrice = bHasLiveMark
                    ? Number(objCachedTicker?.markPrice || 0)
                    : Number(objPosition.markPrice || objPosition.entryPrice || 0);
                const objMeta = (objPosition.metadata || {}) as Record<string, unknown>;
                const bPositivePnlSupport = isPositivePnlSupportPosition(objPosition);
                const vRuleColor = String(objMeta.ruleColor || "").trim().toUpperCase();
                const vAction = String(objPosition.action || "").trim().toUpperCase();
                const vRuleSet = Math.floor(Number((objMeta as any).ruleSet ?? 1)) === 2 ? 2 : 1;
                const objRuleConfig = vRuleSet === 2 ? objConfig2 : objConfig;
                const clamp01 = (pValue: number): number => Math.min(1, Math.max(0, pValue));
                const vConfiguredSl = bPositivePnlSupport
                    ? clamp01(Number(objMeta.configuredStopLossPct ?? (objUiState as any).positivePnlSlPct ?? 85) / 100)
                    : (vRuleColor === "R"
                        ? clamp01(Number(objRuleConfig.redStopLossPct ?? 0.90) > 1 ? Number(objRuleConfig.redStopLossPct) / 100 : Number(objRuleConfig.redStopLossPct ?? 0.90))
                        : clamp01(Number(objRuleConfig.greenStopLossPct ?? 0.90) > 1 ? Number(objRuleConfig.greenStopLossPct) / 100 : Number(objRuleConfig.greenStopLossPct ?? 0.90)));
                const vGreenTpRaw = Number(objRuleConfig.greenTakeProfitPct ?? 0.50);
                const vRedTpRaw = Number(objRuleConfig.redTakeProfitPct ?? 0.50);
                const vGreenTpMove = clamp01(vGreenTpRaw > 1 ? vGreenTpRaw / 100 : vGreenTpRaw);
                const vRedTpMove = clamp01(vRedTpRaw > 1 ? vRedTpRaw / 100 : vRedTpRaw);
                const vExistingSl = Number(objMeta.deltaStopLoss ?? objMeta.stopLossDelta ?? 0);
                const objNextMeta = { ...objMeta } as Record<string, unknown>;
                let bMetaChanged = false;

                const bTrailPositivePnlSlEnabled = bPositivePnlSupport
                    && Boolean(objMeta.positivePnlTrailSlEnabled ?? bPositivePnlTrailSlEnabled);
                if (((!bPositivePnlSupport && (vRuleColor === "G" || vRuleColor === "R")) || bTrailPositivePnlSlEnabled)
                    && (vAction === "BUY" || vAction === "SELL")) {
                    const bTrailSlEnabled = bPositivePnlSupport ? bTrailPositivePnlSlEnabled : (vRuleSet === 2
                        ? (vRuleColor === "G" ? bTrailGreenSl2Enabled : (vRuleColor === "R" ? bTrailRedSl2Enabled : false))
                        : (vRuleColor === "G" ? bTrailGreenSl1Enabled : (vRuleColor === "R" ? bTrailRedSl1Enabled : false)));
                    const bTrailTpEnabled = bPositivePnlSupport ? false : (vRuleSet === 2
                        ? (vRuleColor === "G" ? bTrailGreenTp2Enabled : (vRuleColor === "R" ? bTrailRedTp2Enabled : false))
                        : (vRuleColor === "G" ? bTrailGreenTp1Enabled : (vRuleColor === "R" ? bTrailRedTp1Enabled : false)));

                    const vEntryDelta = Math.abs(Number(objPosition.entryDelta || 0.53));

                    if (bTrailSlEnabled) {
                        const vPrevBest = Number(objNextMeta.trailBestDelta);
                        const vBestDelta = Number.isFinite(vPrevBest)
                            ? (vAction === "BUY" ? Math.max(vPrevBest, vCurrentDelta) : Math.min(vPrevBest, vCurrentDelta))
                            : (vAction === "BUY" ? Math.max(vEntryDelta, vCurrentDelta) : Math.min(vEntryDelta, vCurrentDelta));

                        const vStoredTrailGap = Number(objNextMeta.trailSlGap);
                        const vTrailSlGap = Number.isFinite(vStoredTrailGap) && vStoredTrailGap >= 0
                            ? vStoredTrailGap
                            : getDeltaTrailGap(vEntryDelta, Number.isFinite(vExistingSl) && vExistingSl > 0 ? vExistingSl : vConfiguredSl);
                        if (Number.isFinite(vTrailSlGap) && vTrailSlGap > 0) {
                            const vCandidate = getTrailedDeltaTarget(vAction, "stop-loss", vBestDelta, vTrailSlGap);
                            const vNextSl = vAction === "BUY"
                                ? (Number.isFinite(vExistingSl) && vExistingSl > 0 ? Math.max(vExistingSl, vCandidate) : vCandidate)
                                : (Number.isFinite(vExistingSl) && vExistingSl > 0 ? Math.min(vExistingSl, vCandidate) : vCandidate);
                            const vExistingStopLoss = Number(objNextMeta.deltaStopLoss ?? objNextMeta.stopLossDelta ?? 0);
                            if (!Number.isFinite(vExistingStopLoss) || Math.abs(vExistingStopLoss - vNextSl) > 1e-9) {
                                objNextMeta.deltaStopLoss = Number(vNextSl.toFixed(6));
                                objNextMeta.stopLossDelta = Number(vNextSl.toFixed(6));
                                bMetaChanged = true;
                            }
                            if (!Number.isFinite(vStoredTrailGap) || Math.abs(vStoredTrailGap - vTrailSlGap) > 1e-9) {
                                objNextMeta.trailSlGap = Number(vTrailSlGap.toFixed(6));
                                bMetaChanged = true;
                            }
                        }

                        const vExistingTrailBest = Number(objNextMeta.trailBestDelta);
                        if (!Number.isFinite(vExistingTrailBest) || Math.abs(vExistingTrailBest - vBestDelta) > 1e-9) {
                            objNextMeta.trailBestDelta = Number(vBestDelta.toFixed(6));
                            bMetaChanged = true;
                        }
                    }

                    const vConfiguredTp = vRuleColor === "G" ? vGreenTpMove : vRedTpMove;
                    if (bTrailTpEnabled && Number.isFinite(vConfiguredTp) && vConfiguredTp > 0) {
                        const vPrevTpBest = Number(objNextMeta.trailTpPeakDelta);
                        const vTpBestDelta = Number.isFinite(vPrevTpBest)
                            ? (vAction === "BUY" ? Math.max(vPrevTpBest, vCurrentDelta) : Math.min(vPrevTpBest, vCurrentDelta))
                            : (vAction === "BUY" ? Math.max(vEntryDelta, vCurrentDelta) : Math.min(vEntryDelta, vCurrentDelta));
                        const vExistingTp = Number(objMeta.deltaTakeProfit ?? objMeta.takeProfitDelta ?? 0);
                        const vStoredTpGap = Number(objNextMeta.trailTpGap);
                        const vTrailTpGap = Number.isFinite(vStoredTpGap) && vStoredTpGap >= 0
                            ? vStoredTpGap
                            : getDeltaTrailGap(vEntryDelta, Number.isFinite(vExistingTp) && vExistingTp > 0 ? vExistingTp : vConfiguredTp);
                        const vCandidate = getTrailedDeltaTarget(vAction, "take-profit", vTpBestDelta, vTrailTpGap);
                        const vNextTp = Number.isFinite(vExistingTp) && vExistingTp > 0
                            ? (vAction === "BUY" ? Math.max(vExistingTp, vCandidate) : Math.min(vExistingTp, vCandidate))
                            : vCandidate;

                        const vExistingTpBest = Number(objNextMeta.trailTpPeakDelta);
                        if (!Number.isFinite(vExistingTpBest) || Math.abs(vExistingTpBest - vTpBestDelta) > 1e-9) {
                            objNextMeta.trailTpPeakDelta = Number(vTpBestDelta.toFixed(6));
                            bMetaChanged = true;
                        }
                        const vExistingTakeProfit = Number(objNextMeta.deltaTakeProfit ?? objNextMeta.takeProfitDelta ?? 0);
                        if (!Number.isFinite(vExistingTakeProfit) || Math.abs(vExistingTakeProfit - vNextTp) > 1e-9) {
                            objNextMeta.deltaTakeProfit = Number(vNextTp.toFixed(6));
                            objNextMeta.takeProfitDelta = Number(vNextTp.toFixed(6));
                            bMetaChanged = true;
                        }
                        if (!Number.isFinite(vStoredTpGap) || Math.abs(vStoredTpGap - vTrailTpGap) > 1e-9) {
                            objNextMeta.trailTpGap = Number(vTrailTpGap.toFixed(6));
                            bMetaChanged = true;
                        }
                    }
                }

                const vNextPnl = bHasLiveMark ? getPositionPnl(objPosition, vMarkPrice) : Number(objPosition.pnl || 0);
                const bShouldSave = bMetaChanged
                    || Number(objPosition.markPrice ?? NaN) !== vMarkPrice
                    || Number(objPosition.exitDelta ?? NaN) !== vCurrentDelta
                    || Number(objPosition.pnl ?? NaN) !== vNextPnl;
                if (bShouldSave) {
                    await saveRollingOptionsPtDePosition({
                        ...objPosition,
                        markPrice: vMarkPrice,
                        exitDelta: vCurrentDelta,
                        pnl: vNextPnl,
                        metadata: objNextMeta,
                        updatedAt: ""
                    });
                }

                if (!objState.running) {
                    continue;
                }

                const objDecision = shouldTriggerOption({ ...objPosition, metadata: objNextMeta }, vCurrentDelta);
                if (objDecision.shouldAct && objDecision.reason) {
                    await this.handleOptionTrigger(pUserId, objConfig, objPosition, objDecision.reason);
                    break;
                }
            }

            await this.managePositivePnlSupports(pUserId, objUiState, objConfig);

            // Check and close replacement legs if original legs are both positive
            await this.closeReplacementWhenOriginalLegsPositive(pUserId, objConfig);
            await this.closeReplacementOnEmaMismatch(pUserId, objConfig);

            objState.cycleCount += 1;
            objState.consecutiveFailures = 0;
            objState.lastError = "";
            objState.lastCycleAt = new Date().toISOString();
            const vLastRenkoSignal = objRenkoSignals.at(-1);
            await this.syncRuntime(pUserId, objConfig, objState, {
                status: objState.running ? "running" : "stopped",
                autoTraderEnabled: objState.running,
                lastSpotPrice: objSnapshot.spotPrice,
                lastFuturesPrice: objSnapshot.futuresPrice,
                lastSignal: vLastRenkoSignal
                    ? (vLastRenkoSignal === "R" ? "RED" : "GREEN")
                    : (objState.renko.lastColor === "R" ? "RED" : (objState.renko.lastColor === "G" ? "GREEN" : "IDLE")),
                lastCycleAt: objState.lastCycleAt
            });
            return { status: "success", message: "Cycle completed." };
        }
        catch (objError) {
            const objConfig = await this.loadConfig(pUserId);
            objState.consecutiveFailures += 1;
            objState.lastError = objError instanceof Error ? objError.message : String(objError);
            objState.lastCycleAt = new Date().toISOString();
            await this.syncRuntime(pUserId, objConfig, objState, {
                status: objState.running ? "running" : "error",
                autoTraderEnabled: objState.running,
                lastError: objState.lastError,
                lastSignal: "ENGINE_ERROR",
                lastCycleAt: objState.lastCycleAt
            });
            await logRollingOptionsPtDeEvent({
                userId: pUserId,
                eventType: "engine_error",
                severity: "error",
                title: "Engine Error",
                message: objState.lastError,
                payload: {
                    reason: "engine_error"
                }
            });
            return { status: "danger", message: objState.lastError };
        }
        finally {
            objState.isBusy = false;
        }
    }

    public async emergencyStop(pUserId: string): Promise<{ status: string; message: string; }> {
        const objConfig = await this.loadConfig(pUserId);
        const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
        if (objOpenPositions.length > 0) {
            await this.closePositions(objOpenPositions, objConfig, "Emergency stop");
        }
        await this.stop(pUserId, "Emergency stop");
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "kill_switch",
            severity: "warning",
            title: "Kill Switch",
            message: "Emergency stop closed open paper positions and stopped the engine.",
            payload: {
                symbol: objConfig.symbol,
                qty: objOpenPositions.length,
                reason: "kill_switch"
            }
        });
        return { status: "success", message: "Emergency stop completed." };
    }

    public async reset(pUserId: string): Promise<{ status: string; message: string; }> {
        await this.stop(pUserId, "Reset");
        const objConfig = await this.loadConfig(pUserId);
        const objState = this.getOrCreateState(pUserId);
        objState.cycleCount = 0;
        objState.consecutiveFailures = 0;
        objState.lastError = "";
        objState.lastCycleAt = null;
        objState.renko.anchor = null;
        objState.renko.lastDir = 0;
        objState.renko.lastColor = "";
        objState.renko.historyKey = "";
        objState.renko.historySyncedAt = "";
        objState.renko.historyCandleCount = 0;
        const objBoxState = this.getOrCreateBoxState(pUserId);
        objBoxState.anchor = null;
        objBoxState.lastDir = 0;
        objBoxState.lastColor = "";
        objBoxState.lastPrice = null;
        objBoxState.historyKey = "";
        objBoxState.historySyncedAt = "";
        objBoxState.historyCandleCount = 0;
        objState.sourcePositiveCycleCountByPositionId.clear();
        await this.syncRuntime(pUserId, objConfig, objState, {
            status: "stopped",
            autoTraderEnabled: false,
            lastSignal: "RESET"
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "info",
            title: "Strategy Reset",
            message: "Rolling Options server state was reset.",
            payload: {
                symbol: objConfig.symbol,
                reason: "reset"
            }
        });
        return { status: "success", message: "Strategy state reset." };
    }

    public async setManualRenkoSignal(
        pUserId: string,
        pColorCode: "R" | "G"
    ): Promise<{ status: string; message: string; color: "R" | "G"; }> {
        const objState = this.getOrCreateState(pUserId);
        const objConfig = await this.loadConfig(pUserId);
        const vColorCode = pColorCode === "R" ? "R" : "G";

        objState.renko.lastColor = vColorCode;
        objState.renko.lastDir = vColorCode === "R" ? -1 : 1;
        objState.lastError = "";
        objState.lastCycleAt = new Date().toISOString();

        await this.syncRuntime(pUserId, objConfig, objState, {
            status: objState.running ? "running" : "stopped",
            autoTraderEnabled: objState.running,
            lastSignal: vColorCode === "R" ? "MANUAL_RED" : "MANUAL_GREEN",
            lastCycleAt: objState.lastCycleAt,
            lastError: ""
        });

        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "info",
            title: "Manual Renko Signal",
            message: `Manual Renko signal changed to ${vColorCode === "R" ? "RED" : "GREEN"}.`,
            payload: {
                symbol: objConfig.symbol,
                reason: vColorCode === "R" ? "manual_renko_red" : "manual_renko_green"
            }
        });

        if (objState.running) {
            if (vColorCode === "R") {
                await this.handleRenkoRedFlow(pUserId, objConfig);
            }
            else {
                await this.handleRenkoGreenFlow(pUserId, objConfig);
            }
        }

        return {
            status: "success",
            message: `Manual Renko signal set to ${vColorCode === "R" ? "RED" : "GREEN"}.`,
            color: vColorCode
        };
    }

    public async applyBoxMovingPrice(
        pUserId: string,
        pMovingPrice: number
    ): Promise<{ status: "success" | "warning"; message: string; }> {
        const vMovingPrice = Number(pMovingPrice);
        if (!Number.isFinite(vMovingPrice) || vMovingPrice <= 0) {
            return { status: "warning", message: "Enter a valid Box Moving Price." };
        }

        const objConfig = await this.loadConfig(pUserId);
        const objUiState = ((objConfig as any).__uiState || {}) as Record<string, unknown>;
        if (!Boolean((objUiState as any).boxConditionEnabled)) {
            return { status: "warning", message: "Enable Box Conditions before updating Moving Price." };
        }

        const objState = this.getOrCreateState(pUserId);
        const objBoxConfig = await this.syncBoxFromHistoricalCandles(pUserId, objConfig, objState, objUiState);
        const objBoxState = this.getOrCreateBoxState(pUserId);
        const vPreviousBoxColor = String(objBoxState.lastColor || "").trim().toUpperCase();
        const objSnapshot: RollingOptionsPtDeMarketSnapshot = {
            symbol: objBoxConfig.symbol,
            contractName: objBoxConfig.contractName,
            spotPrice: vMovingPrice,
            futuresPrice: vMovingPrice,
            bestBidPrice: vMovingPrice,
            bestAskPrice: vMovingPrice,
            priceSource: "simulated",
            ts: new Date().toISOString()
        };
        const arrBoxSignals = this.updateBoxState(objBoxState, objSnapshot, objBoxConfig);
        const vLastBoxSignal = arrBoxSignals.at(-1);
        let vClosedCount = 0;

        if (Boolean((objUiState as any).boxColorChangeCloseEnabled)
            && vLastBoxSignal
            && (vPreviousBoxColor === "R" || vPreviousBoxColor === "G")
            && vPreviousBoxColor !== vLastBoxSignal) {
            const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
            const arrTargets = arrOpenPositions.filter((objPosition) => {
                const objMeta = (objPosition.metadata || {}) as Record<string, unknown>;
                const vRuleColor = String(objMeta.ruleColor || "").trim().toUpperCase();
                return objPosition.status === "OPEN"
                    && objPosition.instrumentType === "OPTION"
                    && !isPositivePnlSupportPosition(objPosition)
                    && !this.isReplacementOptionPosition(objPosition)
                    && vRuleColor === vPreviousBoxColor;
            });
            if (arrTargets.length > 0) {
                const arrClosed = await this.closePositions(
                    arrTargets,
                    objConfig,
                    `Box Moving Price changed color from ${vPreviousBoxColor} to ${vLastBoxSignal}`
                );
                vClosedCount = arrClosed.length;
                await this.reEnterClosedOptionPositions(
                    pUserId,
                    arrClosed,
                    `Box Moving Price changed color from ${vPreviousBoxColor} to ${vLastBoxSignal}`
                );
            }
        }
        if (vLastBoxSignal) {
            await this.handleBoxColorChangeOpen(
                pUserId,
                objConfig,
                objUiState,
                vPreviousBoxColor,
                vLastBoxSignal
            );
        }

        await this.syncRuntime(pUserId, objConfig, objState, {
            lastSignal: vLastBoxSignal ? `BOX_${vLastBoxSignal}` : "BOX_NO_CHANGE",
            lastCycleAt: new Date().toISOString()
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "info",
            title: "Box Moving Price Updated",
            message: vLastBoxSignal
                ? `Moving Price generated ${arrBoxSignals.length} box shift(s) and Box ${vLastBoxSignal}.`
                : "Moving Price remained between the Box anchors.",
            payload: {
                price: vMovingPrice,
                boxColor: vLastBoxSignal || objBoxState.lastColor || "",
                shifts: arrBoxSignals.length,
                closedCount: vClosedCount,
                reason: "box_moving_price"
            }
        });
        return {
            status: "success",
            message: vLastBoxSignal
                ? `Box moved ${arrBoxSignals.length} point(s) to ${vLastBoxSignal}; closed ${vClosedCount} eligible leg(s).`
                : "Moving Price is between the Box anchors; no Box change."
        };
    }

    public async setManualBoxSignal(
        pUserId: string,
        pColorCode: "R" | "G",
        pReferencePrice?: number | null
    ): Promise<{ status: "success" | "warning"; message: string; }> {
        const objConfig = await this.loadConfig(pUserId);
        const objUiState = ((objConfig as any).__uiState || {}) as Record<string, unknown>;
        if (!Boolean((objUiState as any).boxConditionEnabled)) {
            return { status: "warning", message: "Enable Box Conditions before toggling the Box signal." };
        }

        const objState = this.getOrCreateState(pUserId);
        await this.syncBoxFromHistoricalCandles(pUserId, objConfig, objState, objUiState);
        const objBoxState = this.getOrCreateBoxState(pUserId);
        const vPreviousBoxColor = String(objBoxState.lastColor || "").trim().toUpperCase();
        const vReferencePriceRaw = Number(pReferencePrice);
        const vReferencePrice = Number.isFinite(vReferencePriceRaw) && vReferencePriceRaw > 0
            ? vReferencePriceRaw
            : Number(objBoxState.lastPrice);
        if (!Number.isFinite(vReferencePrice) || vReferencePrice <= 0) {
            return { status: "warning", message: "Enter a Moving Price or wait for a Box From price." };
        }

        const vColorCode: "R" | "G" = pColorCode === "G" ? "G" : "R";
        const vBoxPoints = Math.max(1, Number((objUiState as any).boxConditionPoints || 10));
        objBoxState.lastPrice = vReferencePrice;
        objBoxState.lastColor = vColorCode;
        objBoxState.lastDir = vColorCode === "G" ? 1 : -1;
        objBoxState.anchor = vColorCode === "G"
            ? vReferencePrice - vBoxPoints
            : vReferencePrice;

        let vClosedCount = 0;
        if (Boolean((objUiState as any).boxColorChangeCloseEnabled)
            && (vPreviousBoxColor === "R" || vPreviousBoxColor === "G")
            && vPreviousBoxColor !== vColorCode) {
            const arrOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
            const arrTargets = arrOpenPositions.filter((objPosition) => {
                const objMeta = (objPosition.metadata || {}) as Record<string, unknown>;
                const vRuleColor = String(objMeta.ruleColor || "").trim().toUpperCase();
                return objPosition.status === "OPEN"
                    && objPosition.instrumentType === "OPTION"
                    && !isPositivePnlSupportPosition(objPosition)
                    && !this.isReplacementOptionPosition(objPosition)
                    && vRuleColor === vPreviousBoxColor;
            });
            if (arrTargets.length > 0) {
                const arrClosed = await this.closePositions(
                    arrTargets,
                    objConfig,
                    `Manual Box signal changed from ${vPreviousBoxColor} to ${vColorCode}`
                );
                vClosedCount = arrClosed.length;
                await this.reEnterClosedOptionPositions(
                    pUserId,
                    arrClosed,
                    `Manual Box signal changed from ${vPreviousBoxColor} to ${vColorCode}`
                );
            }
        }
        await this.handleBoxColorChangeOpen(
            pUserId,
            objConfig,
            objUiState,
            vPreviousBoxColor,
            vColorCode
        );

        await this.syncRuntime(pUserId, objConfig, objState, {
            lastSignal: `MANUAL_BOX_${vColorCode}`,
            lastCycleAt: new Date().toISOString()
        });
        await logRollingOptionsPtDeEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "info",
            title: "Manual Box Signal",
            message: `Manual Box signal changed to ${vColorCode === "G" ? "GREEN" : "RED"}.`,
            payload: {
                price: vReferencePrice,
                boxColor: vColorCode,
                lowerAnchor: objBoxState.anchor,
                upperAnchor: Number(objBoxState.anchor) + vBoxPoints,
                closedCount: vClosedCount,
                reason: "manual_box_signal"
            }
        });
        return {
            status: "success",
            message: `Box set to ${vColorCode}; closed ${vClosedCount} eligible leg(s).`
        };
    }

    public async getCounts(pUserId: string): Promise<{ open: number; closed: number; }> {
        const objOpen = await listRollingOptionsPtDeOpenPositions(pUserId);
        const objClosed = await listRollingOptionsPtDeClosedPositions(pUserId);
        return { open: objOpen.length, closed: objClosed.length };
    }
}
