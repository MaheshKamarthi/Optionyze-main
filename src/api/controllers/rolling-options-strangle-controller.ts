import crypto from "node:crypto";
import type { Request, Response } from "express";
import {
    buildConfigFromUiState,
    estimatePositionCharges,
    getPositionPnl,
    resolveExpiryDateByMode,
} from "../../strategies/rolling-options-pt-de/engine";
import { applyClosedOptionPnlToProfile, syncOptionsPnlWithClosedPositions } from "../../strategies/rolling-options-strangle/options-pnl";
import {
    ensureLiveTickerSymbols,
    findBestLiveOptionContract,
    getLiveMarketSnapshot,
    getLiveOptionTicker
} from "../../strategies/rolling-options-pt-de/market-data";
import {
    clearRollingOptionsPtDeClosedPositions,
    deleteRollingOptionsPtDeOpenPosition,
    listRollingOptionsPtDeClosedPositions,
    listRollingOptionsPtDeOpenPositions,
    saveRollingOptionsPtDePosition,
    type RollingOptionsPtDePositionRecord
} from "../../storage/rolling-options-strangle-position-store";
import { clearRollingOptionsEventsByStrategy, listRollingOptionsEventsByStrategy } from "../../storage/rolling-options-pt-de-event-store";
import {
    loadRollingOptionsPtDeProfile,
    saveRollingOptionsPtDeProfile,
    type RollingOptionsPtDeProfileRecord
} from "../../storage/rolling-options-strangle-profile-store";
import {
    loadRollingOptionsPtDeRuntime,
    saveRollingOptionsPtDeRuntime,
    type RollingOptionsPtDeRuntimeRecord
} from "../../storage/rolling-options-strangle-runtime-store";
import type { RollingOptionsStrangleService } from "../../strategies/rolling-options-strangle/service";
import { gRollingOptionsTelegramEventTypes, logRollingOptionsPtDeEvent } from "../../strategies/rolling-options-strangle/event-logger";

const gStrategyCode = "rolling-options-strangle";
const RE_DELTA_TOLERANCE = 0.05;

function getUserIdFromReq(pReq: Request): string {
    const vUserId = String(pReq.authAccount?.accountId || pReq.body?.userId || pReq.query?.userId || "demo-paper").trim();
    return vUserId || "demo-paper";
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
        greenTpPct2: 15,
        greenSlPct2: 85,
        redOptQty2: 1,
        redReDelta2: 0.53,
        redTpPct2: 15,
        redSlPct2: 85,
        redOptQty: 1,
        redTpPct: 15,
        redSlPct: 85,
        greenOptQty: 1,
        greenReDelta: 0.53,
        greenTpDelta: 0.15,
        greenSlDelta: 0.85,
        greenTpPct: 15,
        greenSlPct: 85,
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
        renkoFeedTimeframe: "1m",
        renkoFeedPriceSrc: "spot_price",
        emaEnabled: false,
        emaSignalEnabled: false,
        emaRenkoConfirmEnabled: false,
        emaTimeframe: "1m",
        emaPeriod: 20,
        tradingViewEmaEnabled: false,
        tradingViewEmaSide: "both",
        demoBalance: 10000,
        closeAllLegsOnAnyClose: false,
        skipRenkoEntryNoOpenOptions: false,
        positivePnlSupportEnabled: true,
        positivePnlSupportAction: "buy",
        positivePnlSupportQty: 10,
        positivePnlMaxLegs: 1,
        positivePnlTriggerAmount: 0,
        positivePnlTpPct: 15,
        positivePnlSlPct: 85,
        positivePnlExpiryMode: "1",
        positivePnlTargetDelta: 0.53,
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

function getContractNameForSymbol(pSymbol: string): string {
    const vSymbol = String(pSymbol || "").trim().toUpperCase();
    if (vSymbol === "ETH") {
        return "ETHUSD";
    }
    return "BTCUSD";
}

function getLotSizeForSymbol(pSymbol: string): number {
    const vSymbol = String(pSymbol || "").trim().toUpperCase();
    return vSymbol === "ETH" ? 0.01 : 0.001;
}

function normalizeNumber(pValue: unknown, pFallback: number): number {
    const vNumber = Number(pValue);
    return Number.isFinite(vNumber) ? vNumber : pFallback;
}

function normalizeEmaTimeframe(pValue: unknown): "1m" | "5m" | "15m" | "1h" {
    const vValue = String(pValue || "").trim().toLowerCase();
    if (vValue === "5m" || vValue === "15m" || vValue === "1h") {
        return vValue;
    }
    return "1m";
}

function normalizeRenkoTimeframe(pValue: unknown): "5s" | "1m" | "5m" | "15m" | "1h" {
    const vValue = String(pValue || "").trim().toLowerCase();
    if (vValue === "5s") {
        return "5s";
    }
    return normalizeEmaTimeframe(vValue);
}

function normalizeEmaPeriod(pValue: unknown): number {
    const vValue = Math.floor(Number(pValue || 0));
    return Number.isFinite(vValue) ? Math.min(500, Math.max(1, vValue)) : 20;
}

function calculatePaperNotional(pQty: number, pLotSize: number, pPrice: number): number {
    const vQty = Math.max(0, Number(pQty || 0));
    const vLotSize = Math.max(0, Number(pLotSize || 0));
    const vPrice = Math.max(0, Number(pPrice || 0));
    if (!(vQty > 0) || !(vLotSize > 0) || !(vPrice > 0)) {
        return 0;
    }
    return vQty * vLotSize * vPrice;
}

function calculateBlockedMargin(pPositions: RollingOptionsPtDePositionRecord[]): number {
    const arrPositions = Array.isArray(pPositions) ? pPositions : [];
    return arrPositions.reduce((sum, objRow) => {
        if (!objRow || objRow.status !== "OPEN") {
            return sum;
        }
        const vPrice = Number(objRow.entryPrice ?? objRow.markPrice ?? 0);
        return sum + calculatePaperNotional(Number(objRow.qty || 0), Number(objRow.lotSize || 0), vPrice);
    }, 0);
}

async function getMergedUiState(pUserId: string): Promise<Record<string, unknown>> {
    const objProfile = await loadRollingOptionsPtDeProfile(pUserId);
    const objSavedUiState = (objProfile?.uiState || {}) as Record<string, unknown>;
    const objUiState = {
        ...getDefaultUiState(),
        ...objSavedUiState
    };
    const getMigratedValue = (pPositiveKey: string, pLegacyKey: string, pFallback: unknown): unknown => {
        if (objSavedUiState[pPositiveKey] !== undefined) {
            return objSavedUiState[pPositiveKey];
        }
        if (objSavedUiState[pLegacyKey] !== undefined) {
            return objSavedUiState[pLegacyKey];
        }
        return objUiState[pPositiveKey] ?? pFallback;
    };
    objUiState.positivePnlSupportEnabled = Boolean(getMigratedValue("positivePnlSupportEnabled", "negativePnlHedgeEnabled", true));
    objUiState.positivePnlSupportAction = String(getMigratedValue("positivePnlSupportAction", "negativePnlAction3", "buy")).trim().toLowerCase() === "sell" ? "sell" : "buy";
    objUiState.positivePnlSupportQty = getMigratedValue("positivePnlSupportQty", "negativePnlHedgeQty", 10);
    objUiState.positivePnlMaxLegs = getMigratedValue("positivePnlMaxLegs", "negativePnlMaxLegs", 1);
    objUiState.positivePnlTriggerAmount = Math.min(0, normalizeNumber(objUiState.positivePnlTriggerAmount, 0));
    objUiState.positivePnlTpPct = getMigratedValue("positivePnlTpPct", "negativePnlTpPct", 15);
    objUiState.positivePnlSlPct = getMigratedValue("positivePnlSlPct", "negativePnlSlPct", 85);
    objUiState.positivePnlExpiryMode = getMigratedValue("positivePnlExpiryMode", "negativePnlHedgeExpiryMode", "1");
    objUiState.positivePnlTargetDelta = getMigratedValue("positivePnlTargetDelta", "negativePnlHedgeDelta", 0.53);
    objUiState.positivePnlAdverseRenkoCloseEnabled = Boolean(getMigratedValue(
        "positivePnlAdverseRenkoCloseEnabled",
        "negativePnlRenkoCloseOnly",
        false
    ));
    objUiState.positivePnlSupportQty = Math.max(0, Math.floor(normalizeNumber(objUiState.positivePnlSupportQty, 10)));
    objUiState.positivePnlMaxLegs = Math.max(1, Math.floor(normalizeNumber(objUiState.positivePnlMaxLegs, 1)));
    objUiState.positivePnlTriggerAmount = Math.min(0, normalizeNumber(objUiState.positivePnlTriggerAmount, 0));
    objUiState.positivePnlTpPct = Math.min(100, Math.max(0, normalizeNumber(objUiState.positivePnlTpPct, 15)));
    objUiState.positivePnlSlPct = Math.min(100, Math.max(0, normalizeNumber(objUiState.positivePnlSlPct, 85)));
    objUiState.positivePnlTargetDelta = Math.max(0, normalizeNumber(objUiState.positivePnlTargetDelta, 0.53));
    const vPositivePnlExpiryMode = String(objUiState.positivePnlExpiryMode || "1").trim();
    objUiState.positivePnlExpiryMode = ["source", "1", "2", "4", "5", "6", "7"].includes(vPositivePnlExpiryMode)
        ? vPositivePnlExpiryMode
        : "1";
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
    objUiState.emaEnabled = Boolean((objUiState as any).emaEnabled);
    objUiState.emaSignalEnabled = Boolean((objUiState as any).emaSignalEnabled);
    objUiState.emaRenkoConfirmEnabled = Boolean((objUiState as any).emaRenkoConfirmEnabled);
    objUiState.renkoFeedTimeframe = normalizeRenkoTimeframe((objUiState as any).renkoFeedTimeframe);
    objUiState.emaTimeframe = normalizeEmaTimeframe((objUiState as any).emaTimeframe);
    objUiState.emaPeriod = normalizeEmaPeriod((objUiState as any).emaPeriod);
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

async function getDefaultRuntimeState(pUserId: string): Promise<RollingOptionsPtDeRuntimeRecord> {
    const objUiState = await getMergedUiState(pUserId);
    const vSymbol = String(objUiState.symbol || "BTC").trim().toUpperCase() || "BTC";

    return {
        userId: pUserId,
        status: "idle",
        autoTraderEnabled: false,
        currentSymbol: vSymbol,
        currentContractName: getContractNameForSymbol(vSymbol),
        currentExpiryMode: String(objUiState.expiryMode1 || "1"),
        currentExpiryDate: String(objUiState.expiryDate1 || ""),
        renkoEnabled: Boolean(objUiState.renkoFeedEnabled ?? true),
        renkoPoints: Number(objUiState.renkoFeedPts || 10),
        renkoSource: String(objUiState.renkoFeedPriceSrc || "spot_price"),
        lastSpotPrice: null,
        lastFuturesPrice: null,
        lastSignal: "IDLE",
        lastCycleAt: "",
        lastError: "",
        state: {
            tradingViewEmaEnabled: Boolean(objUiState.tradingViewEmaEnabled),
            tradingViewEmaSide: normalizeTradingViewEmaSide(objUiState.tradingViewEmaSide),
            tradingViewEmaTrend: "FLAT",
            renkoTimeframe: normalizeRenkoTimeframe(objUiState.renkoFeedTimeframe),
            renkoHistoryKey: "",
            renkoHistorySyncedAt: "",
            renkoHistoryCandleCount: 0,
            emaEnabled: Boolean(objUiState.emaEnabled),
            emaSignalEnabled: Boolean(objUiState.emaSignalEnabled),
            emaRenkoConfirmEnabled: Boolean(objUiState.emaRenkoConfirmEnabled),
            emaTimeframe: normalizeEmaTimeframe(objUiState.emaTimeframe),
            emaPeriod: normalizeEmaPeriod(objUiState.emaPeriod),
            emaTrend: "FLAT",
            emaSignalTrend: "FLAT",
            emaValue: null,
            emaClose: null,
            emaCandleCount: 0,
            emaCalculatedAt: "",
            emaError: ""
        },
        updatedAt: ""
    };
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

async function loadEffectiveRuntimeState(pUserId: string): Promise<RollingOptionsPtDeRuntimeRecord> {
    return await loadRollingOptionsPtDeRuntime(pUserId) || await getDefaultRuntimeState(pUserId);
}

function getBaseSpotPriceForSymbol(pSymbol: string): number {
    return String(pSymbol || "").trim().toUpperCase() === "ETH" ? 3200 : 64000;
}

function getSimulatedSpotPrice(pSymbol: string): number {
    const vBase = getBaseSpotPriceForSymbol(pSymbol);
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

function getOptionEntryPriceForAction(
    pQuote: { entryPrice?: number; bestBid?: number | null; bestAsk?: number | null; },
    pAction: string
): number {
    const vAction = String(pAction || "").trim().toUpperCase();
    const vBid = Number(pQuote.bestBid);
    const vAsk = Number(pQuote.bestAsk);
    const vFallback = Number(pQuote.entryPrice || 0);
    if (vAction === "SELL" && Number.isFinite(vBid) && vBid > 0) {
        return vBid;
    }
    if (vAction === "BUY" && Number.isFinite(vAsk) && vAsk > 0) {
        return vAsk;
    }
    return vFallback;
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
                    usedNextDayExpiryFallback: Boolean(objLiveContract.usedNextDayFallback),
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

async function getLiveOrFallbackExitPrice(
    pPosition: RollingOptionsPtDePositionRecord,
    pUiState?: Record<string, unknown>
): Promise<{ exitPrice: number; exitDelta: number | null; hasLivePrice: boolean; }> {
    if (pPosition.instrumentType === "FUTURE") {
        if (pUiState) {
            const objSnapshot = await getLiveOrFallbackMarketSnapshot(pUiState);
            return {
                exitPrice: objSnapshot.futuresPrice,
                exitDelta: null,
                hasLivePrice: true
            };
        }

        return {
            exitPrice: getSimulatedFuturePrice(pPosition.symbol),
            exitDelta: null,
            hasLivePrice: false
        };
    }

    const vProductSymbol = String(pPosition.metadata?.productSymbol || "").trim();
    if (vProductSymbol) {
        try {
            ensureLiveTickerSymbols([vProductSymbol]);
            const objLiveTicker = await getLiveOptionTicker(vProductSymbol);
            if (objLiveTicker?.markPrice) {
                return {
                    exitPrice: objLiveTicker.markPrice,
                    exitDelta: Math.abs(Number(objLiveTicker.delta || pPosition.exitDelta || pPosition.entryDelta || 0.53)),
                    hasLivePrice: true
                };
            }
        }
        catch (_objError) {
        }
    }

    return {
        exitPrice: Number.isFinite(Number(pPosition.markPrice))
            ? Number(pPosition.markPrice)
            : Number(pPosition.entryPrice || 0),
        exitDelta: pPosition.exitDelta ?? pPosition.entryDelta ?? null,
        hasLivePrice: false
    };
}

async function refreshOpenPositionMarks(
    pUserId: string,
    pPositions?: RollingOptionsPtDePositionRecord[],
    pPersist = true
): Promise<RollingOptionsPtDePositionRecord[]> {
    const objOpenPositions = pPositions || await listRollingOptionsPtDeOpenPositions(pUserId);
    if (objOpenPositions.length === 0) {
        return objOpenPositions;
    }

    const objUiState = await getMergedUiState(pUserId);
    const objSnapshot = await getLiveOrFallbackMarketSnapshot(objUiState);
    const objUpdatedPositions: RollingOptionsPtDePositionRecord[] = [];

    for (const objPosition of objOpenPositions) {
        const objQuote = await getLiveOrFallbackExitPrice(objPosition, objUiState);
        const vMarkPrice = objPosition.instrumentType === "FUTURE"
            ? objSnapshot.futuresPrice
            : objQuote.exitPrice;
        const vExitDelta = objPosition.instrumentType === "OPTION"
            ? objQuote.exitDelta
            : objPosition.exitDelta;
        const vNextPnl = objPosition.instrumentType === "OPTION" && !objQuote.hasLivePrice
            ? Number(objPosition.pnl || 0)
            : getPositionPnl(objPosition, vMarkPrice);

        const objUpdatedPosition: RollingOptionsPtDePositionRecord = {
            ...objPosition,
            markPrice: vMarkPrice,
            exitDelta: vExitDelta,
            pnl: vNextPnl,
            updatedAt: ""
        };

        if (pPersist) {
            objUpdatedPositions.push(await saveRollingOptionsPtDePosition(objUpdatedPosition));
            continue;
        }

        objUpdatedPositions.push({
            ...objPosition,
            markPrice: vMarkPrice,
            exitDelta: vExitDelta,
            pnl: getPositionPnl(objPosition, vMarkPrice)
        });
    }

    return objUpdatedPositions.sort((objA, objB) => String(objB.openedAt).localeCompare(String(objA.openedAt)));
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

function getLinkedLeaderPositionId(pPosition: RollingOptionsPtDePositionRecord): string {
    return String((pPosition.metadata as any)?.linkedLeaderPositionId || "").trim();
}

function isPositivePnlSupportPosition(pPosition: RollingOptionsPtDePositionRecord): boolean {
    return Boolean((pPosition.metadata as any)?.positivePnlSupport || (pPosition.metadata as any)?.negativePnlAdjustment);
}

function getNegativePnlOptionSide(pPosition: RollingOptionsPtDePositionRecord): "CE" | "PE" | "" {
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

function getOptionDeltaTargetsFromPct(
    pEntryDelta: number,
    pAction: "BUY" | "SELL",
    pTakeProfitPct: number,
    pStopLossPct: number
): { takeProfitDelta: number; stopLossDelta: number; } {
    const clamp01 = (pValue: number): number => Math.min(1, Math.max(0, pValue));
    const vEntryDelta = Math.abs(Number.isFinite(Number(pEntryDelta)) ? Number(pEntryDelta) : 0.53);
    const vTakeProfitMove = clamp01(pTakeProfitPct / 100);
    const vStopLossMove = clamp01(pStopLossPct / 100);
    const vTakeProfitDelta = pAction === "BUY"
        ? clamp01(vEntryDelta + vTakeProfitMove)
        : clamp01(vEntryDelta - vTakeProfitMove);
    const vRawStopLoss = pAction === "BUY" ? (vEntryDelta - vStopLossMove) : (vEntryDelta + vStopLossMove);
    const vStopLossDelta = pAction === "SELL" && vRawStopLoss > 1 ? vStopLossMove : clamp01(vRawStopLoss);
    return {
        takeProfitDelta: vTakeProfitDelta,
        stopLossDelta: vStopLossDelta
    };
}

function getLinkedPositionLabel(pPosition: RollingOptionsPtDePositionRecord): string {
    const vAction = String(pPosition.action || "").trim().toUpperCase();
    const vSide = String(pPosition.optionSide || "").trim().toUpperCase();
    const vContract = String(pPosition.contractName || pPosition.symbol || "").trim();
    return [vAction, vSide, vContract].filter(Boolean).join(" ") || pPosition.positionId;
}

function collectLinkedFollowerPositions(
    pOpenPositions: RollingOptionsPtDePositionRecord[],
    pLeaderPositions: RollingOptionsPtDePositionRecord[]
): RollingOptionsPtDePositionRecord[] {
    const objById = new Map<string, RollingOptionsPtDePositionRecord>();
    const arrQueue = [...pLeaderPositions];

    for (const objPosition of pLeaderPositions) {
        if (objPosition?.positionId) {
            objById.set(objPosition.positionId, objPosition);
        }
    }

    while (arrQueue.length > 0) {
        const objLeader = arrQueue.shift();
        const vLeaderId = String(objLeader?.positionId || "").trim();
        if (!vLeaderId) {
            continue;
        }

        for (const objPosition of pOpenPositions) {
            const vPositionId = String(objPosition.positionId || "").trim();
            if (!vPositionId || objById.has(vPositionId)) {
                continue;
            }
            if (getLinkedLeaderPositionId(objPosition) !== vLeaderId) {
                continue;
            }
            objById.set(vPositionId, objPosition);
            arrQueue.push(objPosition);
        }
    }

    return Array.from(objById.values());
}

function wouldCreateLinkedPositionCycle(
    pOpenPositions: RollingOptionsPtDePositionRecord[],
    pFollowerId: string,
    pLeaderId: string
): boolean {
    const objById = new Map(pOpenPositions.map((objPosition) => [String(objPosition.positionId || "").trim(), objPosition]));
    const objVisited = new Set<string>();
    let vCurrentId = pLeaderId;

    while (vCurrentId) {
        if (vCurrentId === pFollowerId) {
            return true;
        }
        if (objVisited.has(vCurrentId)) {
            return true;
        }
        objVisited.add(vCurrentId);
        const objCurrent = objById.get(vCurrentId);
        vCurrentId = objCurrent ? getLinkedLeaderPositionId(objCurrent) : "";
    }

    return false;
}

async function updateRuntimeFromUiState(
    pUserId: string,
    pOverrides: Partial<RollingOptionsPtDeRuntimeRecord> = {}
): Promise<RollingOptionsPtDeRuntimeRecord> {
    const objRuntime = await loadEffectiveRuntimeState(pUserId);
    const objUiState = await getMergedUiState(pUserId);
    const vSymbol = String(objUiState.symbol || objRuntime.currentSymbol || "BTC").trim().toUpperCase() || "BTC";
    const objNextRuntime: RollingOptionsPtDeRuntimeRecord = {
        ...objRuntime,
        currentSymbol: vSymbol,
        currentContractName: getContractNameForSymbol(vSymbol),
        currentExpiryMode: String(objUiState.expiryMode1 || objRuntime.currentExpiryMode || "1"),
        currentExpiryDate: String(objUiState.expiryDate1 || objRuntime.currentExpiryDate || ""),
        renkoEnabled: Boolean(objUiState.renkoFeedEnabled ?? objRuntime.renkoEnabled),
        renkoPoints: Number(objUiState.renkoFeedPts || objRuntime.renkoPoints || 10),
        renkoSource: String(objUiState.renkoFeedPriceSrc || objRuntime.renkoSource || "spot_price"),
        state: {
            ...(objRuntime.state || {}),
            tradingViewEmaEnabled: Boolean(objUiState.tradingViewEmaEnabled),
            tradingViewEmaSide: normalizeTradingViewEmaSide(objUiState.tradingViewEmaSide),
            tradingViewEmaTrend: normalizeTradingViewEmaTrend((objRuntime.state as any)?.tradingViewEmaTrend),
            renkoTimeframe: normalizeRenkoTimeframe(objUiState.renkoFeedTimeframe),
            renkoHistoryKey: String((objRuntime.state as any)?.renkoHistoryKey || ""),
            renkoHistorySyncedAt: String((objRuntime.state as any)?.renkoHistorySyncedAt || ""),
            renkoHistoryCandleCount: Math.max(0, Math.floor(Number((objRuntime.state as any)?.renkoHistoryCandleCount || 0))),
            emaEnabled: Boolean(objUiState.emaEnabled),
            emaSignalEnabled: Boolean(objUiState.emaSignalEnabled),
            emaRenkoConfirmEnabled: Boolean(objUiState.emaRenkoConfirmEnabled),
            emaTimeframe: normalizeEmaTimeframe(objUiState.emaTimeframe),
            emaPeriod: normalizeEmaPeriod(objUiState.emaPeriod),
            emaTrend: normalizeTradingViewEmaTrend((objRuntime.state as any)?.emaTrend),
            emaSignalTrend: normalizeTradingViewEmaTrend((objRuntime.state as any)?.emaSignalTrend),
            emaValue: (objRuntime.state as any)?.emaValue ?? null,
            emaClose: (objRuntime.state as any)?.emaClose ?? null,
            emaCandleCount: Math.max(0, Math.floor(Number((objRuntime.state as any)?.emaCandleCount || 0))),
            emaCalculatedAt: String((objRuntime.state as any)?.emaCalculatedAt || ""),
            emaError: String((objRuntime.state as any)?.emaError || "")
        },
        updatedAt: "",
        ...pOverrides
    };

    return saveRollingOptionsPtDeRuntime(objNextRuntime);
}

async function closeOpenPositionsByInstrument(
    pUserId: string,
    pInstrumentType: "OPTION" | "FUTURE" | "ALL",
    pReason: string,
    pRuleSet: 1 | 2 | null = null,
    pExcludeNegativePnlAdjustments = false
): Promise<RollingOptionsPtDePositionRecord[]> {
    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
    const objUiState = await getMergedUiState(pUserId);
    const objSnapshot = await getLiveOrFallbackMarketSnapshot(objUiState);
    const objDirectTargetPositions = objOpenPositions.filter((objPosition) => {
        if (pExcludeNegativePnlAdjustments && isPositivePnlSupportPosition(objPosition)) {
            return false;
        }
        if (!(pInstrumentType === "ALL" || objPosition.instrumentType === pInstrumentType)) {
            return false;
        }
        if (pRuleSet === null) {
            return true;
        }
        if (objPosition.instrumentType !== "OPTION") {
            return true;
        }
        const vRuleSet = Math.max(1, Math.min(2, Math.floor(Number((objPosition.metadata as any)?.ruleSet ?? 1))));
        return vRuleSet === pRuleSet;
    });
    const objTargetPositions = collectLinkedFollowerPositions(objOpenPositions, objDirectTargetPositions)
        .filter((objPosition) => !pExcludeNegativePnlAdjustments || !isPositivePnlSupportPosition(objPosition));
    const objDirectPositionIds = new Set(objDirectTargetPositions.map((objPosition) => objPosition.positionId));

    const objClosedPositions: RollingOptionsPtDePositionRecord[] = [];

    for (const objPosition of objTargetPositions) {
        const objQuote = await getLiveOrFallbackExitPrice(objPosition, objUiState);
        const vExitPrice = objQuote.exitPrice;
        const vExitCharges = estimatePositionCharges(
            objPosition.instrumentType,
            objPosition.qty,
            objPosition.lotSize,
            vExitPrice,
            objPosition.instrumentType === "OPTION" ? objSnapshot.spotPrice : undefined
        );
        const vPnl = getPositionPnl(objPosition, vExitPrice);
        const bLinkedFollowerClose = !objDirectPositionIds.has(objPosition.positionId);
        const objClosed = await saveRollingOptionsPtDePosition({
            ...objPosition,
            status: "CLOSED",
            exitPrice: vExitPrice,
            markPrice: vExitPrice,
            exitDelta: objQuote.exitDelta,
            charges: Number((Number(objPosition.charges || 0) + vExitCharges).toFixed(4)),
            pnl: vPnl,
            closedReason: bLinkedFollowerClose ? `${pReason} linked follower` : pReason,
            closedAt: new Date().toISOString(),
            metadata: {
                ...(objPosition.metadata || {}),
                linkedClosedByLink: bLinkedFollowerClose
            },
            updatedAt: ""
        });
        objClosedPositions.push(objClosed);
    }

    if (objClosedPositions.length > 0) {
        await applyClosedOptionPnlToProfile(pUserId, objClosedPositions);
    }

    return objClosedPositions;
}

async function closeOpenPositionsById(
    pUserId: string,
    pPositionId: string,
    pReason: string
): Promise<RollingOptionsPtDePositionRecord[]> {
    const vPositionId = String(pPositionId || "").trim();
    if (!vPositionId) {
        return [];
    }

    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
    const objPosition = objOpenPositions.find((objRow) => objRow.positionId === vPositionId) || null;
    if (!objPosition) {
        return [];
    }

    const objTargetPositions = collectLinkedFollowerPositions(objOpenPositions, [objPosition]);
    const objDirectPositionIds = new Set([vPositionId]);
    const objUiState = await getMergedUiState(pUserId);
    const objSnapshot = await getLiveOrFallbackMarketSnapshot(objUiState);
    const objClosedPositions: RollingOptionsPtDePositionRecord[] = [];

    for (const objTargetPosition of objTargetPositions) {
        const objQuote = await getLiveOrFallbackExitPrice(objTargetPosition, objUiState);
        const vExitPrice = objQuote.exitPrice;
        const vExitCharges = estimatePositionCharges(
            objTargetPosition.instrumentType,
            objTargetPosition.qty,
            objTargetPosition.lotSize,
            vExitPrice,
            objTargetPosition.instrumentType === "OPTION" ? objSnapshot.spotPrice : undefined
        );
        const bLinkedFollowerClose = !objDirectPositionIds.has(objTargetPosition.positionId);
        objClosedPositions.push(await saveRollingOptionsPtDePosition({
            ...objTargetPosition,
            status: "CLOSED",
            exitPrice: vExitPrice,
            markPrice: vExitPrice,
            exitDelta: objQuote.exitDelta,
            charges: Number((Number(objTargetPosition.charges || 0) + vExitCharges).toFixed(4)),
            pnl: getPositionPnl(objTargetPosition, vExitPrice),
            closedReason: bLinkedFollowerClose ? `${pReason} linked follower` : pReason,
            closedAt: new Date().toISOString(),
            metadata: {
                ...(objTargetPosition.metadata || {}),
                linkedClosedByLink: bLinkedFollowerClose
            },
            updatedAt: ""
        }));
    }

    await applyClosedOptionPnlToProfile(pUserId, objClosedPositions);
    return objClosedPositions;
}

function shouldCloseAllLegsOnNegativeClosedOption(
    pClosedPositions: RollingOptionsPtDePositionRecord[]
): boolean {
    return pClosedPositions.some((objPosition) => {
        return objPosition.instrumentType === "OPTION"
            && !isPositivePnlSupportPosition(objPosition)
            && Number(objPosition.pnl || 0) < 0;
    });
}

export function renderRollingOptionsStranglePage(req: Request, res: Response): void {
    res.render("rolling-options-strangle", {
        pageTitle: "Rolling Option Strangle Demo | Optionyze",
        currentAccount: req.authAccount,
        rollingTelegramEventTypes: gRollingOptionsTelegramEventTypes
    });
}

export async function getRollingOptionsStrangleProfile(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objProfile = await loadRollingOptionsPtDeProfile(vUserId);
    const objUiState = await getMergedUiState(vUserId);

    res.json({
        status: "success",
        data: {
            userId: vUserId,
            uiState: objUiState,
            updatedAt: objProfile?.updatedAt || ""
        }
    });
}

export async function saveRollingOptionsStrangleProfileController(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objExisting = await loadRollingOptionsPtDeProfile(vUserId);

    const objProfile: RollingOptionsPtDeProfileRecord = {
        userId: vUserId,
        uiState: {
            ...getDefaultUiState(),
            ...(objExisting?.uiState || {}),
            ...((req.body?.uiState || {}) as Record<string, unknown>)
        },
        updatedAt: ""
    };

    await saveRollingOptionsPtDeProfile(objProfile);
    const objNormalizedUiState = await getMergedUiState(vUserId);
    const objSaved = await saveRollingOptionsPtDeProfile({
        userId: vUserId,
        uiState: objNormalizedUiState,
        updatedAt: ""
    });
    res.json({
        status: "success",
        data: {
            ...objSaved,
            uiState: objNormalizedUiState
        }
    });
}

export async function getRollingOptionsStrangleStatus(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objRuntime = await loadRollingOptionsPtDeRuntime(vUserId);
    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
    const objClosedPositions = await listRollingOptionsPtDeClosedPositions(vUserId);
    const objStatus = objRuntime || await getDefaultRuntimeState(vUserId);
    const vOptionsPnl = objClosedPositions.reduce((sum, objRow) => {
        if (objRow.instrumentType !== "OPTION") {
            return sum;
        }
        const vPnl = Number(objRow.pnl || 0);
        return sum + (Number.isFinite(vPnl) ? vPnl : 0);
    }, 0);

    res.json({
        status: "success",
        data: {
            ...objStatus,
            optionsPnl: Number((Number.isFinite(vOptionsPnl) ? vOptionsPnl : 0).toFixed(3)),
            counts: {
                openPositions: objOpenPositions.length,
                closedPositions: objClosedPositions.length
            }
        }
    });
}

export async function getRollingOptionsStrangleOpenPositions(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objUiState = await getMergedUiState(vUserId);
    const bFuturesEnabled = Boolean(objUiState.futuresEnabled ?? true);
    if (bFuturesEnabled) {
        const pService = (req as any).__rollingOptionsStrangleService as RollingOptionsStrangleService | undefined;
        if (pService) {
            await pService.ensureFutureForOpenOptions(vUserId, "Open Positions auto future");
        }
    }
    const objRows = await refreshOpenPositionMarks(vUserId, undefined, false);

    res.json({
        status: "success",
        data: objRows
    });
}

export async function deleteRollingOptionsStrangleOpenPositionController(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vPositionId = String(req.body?.positionId || "").trim();

    if (!vPositionId) {
        res.status(400).json({ status: "error", message: "Position id is required." });
        return;
    }

    const bDeleted = await deleteRollingOptionsPtDeOpenPosition(vUserId, vPositionId);
    if (!bDeleted) {
        res.status(404).json({ status: "error", message: "Open position not found." });
        return;
    }

    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
    for (const objPosition of objOpenPositions) {
        if (getLinkedLeaderPositionId(objPosition) !== vPositionId) {
            continue;
        }
        await saveRollingOptionsPtDePosition({
            ...objPosition,
            metadata: {
                ...(objPosition.metadata || {}),
                linkedLeaderPositionId: ""
            },
            updatedAt: ""
        });
    }

    await logRollingOptionsPtDeEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "warning",
        title: "Open Position Deleted",
        message: "Open paper position was permanently deleted.",
        payload: {
            positionId: vPositionId,
            reason: "manual_open_position_delete"
        }
    });

    res.json({
        status: "success",
        data: {
            positionId: vPositionId,
            deleted: true
        }
    });
}

export async function closeRollingOptionsStrangleOpenPositionController(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleService
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vPositionId = String(req.body?.positionId || "").trim();

    if (!vPositionId) {
        res.status(400).json({ status: "error", message: "Position id is required." });
        return;
    }

    const objClosedPositions = await closeOpenPositionsById(vUserId, vPositionId, "Manual row close");
    if (objClosedPositions.length <= 0) {
        res.status(404).json({ status: "error", message: "Open position not found." });
        return;
    }
    const objClosedPosition = objClosedPositions[0];

    const objUiState = await getMergedUiState(vUserId);
    let objReEntryClosedPositions = objClosedPositions;
    if (
        Boolean((objUiState as any).closeAllLegsOnAnyClose)
        && shouldCloseAllLegsOnNegativeClosedOption(objClosedPositions)
    ) {
        const objCloseAllPositions = await closeOpenPositionsByInstrument(vUserId, "ALL", "Close all legs switch", null, true);
        objReEntryClosedPositions = [...objClosedPositions, ...objCloseAllPositions];
    }
    await pService.reEnterClosedOptionPositions(vUserId, objReEntryClosedPositions, "Manual row close");

    await logRollingOptionsPtDeEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "info",
        title: "Open Position Closed",
        message: `Closed ${objClosedPositions.length} open paper position(s).`,
        payload: {
            positionId: vPositionId,
            contractName: objClosedPosition.contractName,
            symbol: objClosedPosition.symbol,
            qty: objClosedPositions.length,
            reason: "manual_open_position_close"
        }
    });

    res.json({
        status: "success",
        data: {
            position: objClosedPosition,
            positions: objClosedPositions
        }
    });
}

export async function updateRollingOptionsStrangleOpenPositionLinkController(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vFollowerId = String(req.body?.followerPositionId || "").trim();
    const vLeaderId = String(req.body?.leaderPositionId || "").trim();

    if (!vFollowerId) {
        res.status(400).json({ status: "error", message: "Follower position id is required." });
        return;
    }
    if (vFollowerId === vLeaderId) {
        res.status(400).json({ status: "error", message: "A leg cannot follow itself." });
        return;
    }

    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
    const objFollower = objOpenPositions.find((objPosition) => objPosition.positionId === vFollowerId) || null;
    if (!objFollower) {
        res.status(404).json({ status: "error", message: "Follower open position not found." });
        return;
    }

    let objLeader: RollingOptionsPtDePositionRecord | null = null;
    if (vLeaderId) {
        objLeader = objOpenPositions.find((objPosition) => objPosition.positionId === vLeaderId) || null;
        if (!objLeader) {
            res.status(404).json({ status: "error", message: "Leader open position not found." });
            return;
        }
        if (wouldCreateLinkedPositionCycle(objOpenPositions, vFollowerId, vLeaderId)) {
            res.status(400).json({ status: "error", message: "This link would create a circular follow chain." });
            return;
        }
    }

    const objSaved = await saveRollingOptionsPtDePosition({
        ...objFollower,
        metadata: {
            ...(objFollower.metadata || {}),
            linkedLeaderPositionId: vLeaderId
        },
        updatedAt: ""
    });

    await logRollingOptionsPtDeEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "info",
        title: vLeaderId ? "Position Link Created" : "Position Link Removed",
        message: vLeaderId
            ? `${getLinkedPositionLabel(objSaved)} now follows ${getLinkedPositionLabel(objLeader as RollingOptionsPtDePositionRecord)}.`
            : `${getLinkedPositionLabel(objSaved)} no longer follows another leg.`,
        payload: {
            followerPositionId: vFollowerId,
            leaderPositionId: vLeaderId,
            reason: vLeaderId ? "open_position_link_create" : "open_position_link_remove"
        }
    });

    res.json({
        status: "success",
        data: {
            position: objSaved
        }
    });
}

export async function getRollingOptionsStrangleClosedPositions(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vFromDate = String(req.query?.fromDate || "").trim();
    const vToDate = String(req.query?.toDate || "").trim();
    const objRows = await listRollingOptionsPtDeClosedPositions(vUserId, {
        fromDate: vFromDate,
        toDate: vToDate
    });

    res.json({
        status: "success",
        data: objRows
    });
}

export async function getRollingOptionsStrangleEvents(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objRows = await listRollingOptionsEventsByStrategy(vUserId, gStrategyCode, 100);
    res.json({
        status: "success",
        data: objRows
    });
}

export async function toggleRollingOptionsStrangleAutoTrader(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleService
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objRuntime = await loadEffectiveRuntimeState(vUserId);
    const objResult = objRuntime.autoTraderEnabled
        ? await pService.stop(vUserId)
        : await pService.start(vUserId);
    const objSaved = await loadEffectiveRuntimeState(vUserId);
    res.json({ status: objResult.status, message: objResult.message, data: objSaved });
}

export async function executeRollingOptionsStrangleManualFuture(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objUiState = await getMergedUiState(vUserId);
    const bFuturesEnabled = Boolean(objUiState.futuresEnabled ?? true);
    if (!bFuturesEnabled) {
        await logRollingOptionsPtDeEvent({
            userId: vUserId,
            eventType: "manual_action",
            severity: "info",
            title: "Futures Disabled",
            message: "Skipped manual future entry because FUT Enabled is OFF.",
            payload: {
                reason: "futures_disabled",
                symbol: String(objUiState.symbol || "")
            }
        });
        res.json({ status: "warning", message: "Futures are disabled (FUT Enabled is OFF)." });
        return;
    }
    const vSymbol = String(objUiState.symbol || "BTC").trim().toUpperCase() || "BTC";
    const vAction = String(req.body?.action || "SELL").trim().toUpperCase() === "BUY" ? "BUY" : "SELL";
    const vQty = Math.max(1, Math.floor(normalizeNumber(objUiState.manualFutQty, 1)));
    const vLotSize = getLotSizeForSymbol(vSymbol);
    const objSnapshot = await getLiveOrFallbackMarketSnapshot(objUiState);
    const vEntryPrice = objSnapshot.futuresPrice;
    const vNow = objSnapshot.ts;

    const vDemoBalance = Math.max(0, normalizeNumber(objUiState.demoBalance, 0));
    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
    const objOpenFutures = objOpenPositions.filter((objRow) => objRow.instrumentType === "FUTURE" && objRow.status === "OPEN");
    if (objOpenFutures.length > 0) {
        await logRollingOptionsPtDeEvent({
            userId: vUserId,
            eventType: "manual_action",
            severity: "info",
            title: "Future Already Open",
            message: "Skipped manual future entry because a future position is already open.",
            payload: {
                symbol: vSymbol,
                reason: "future_already_open",
                openFutures: objOpenFutures.length
            }
        });
        const objRuntime = await updateRuntimeFromUiState(vUserId, {
            status: "running",
            lastFuturesPrice: objSnapshot.futuresPrice,
            lastSpotPrice: objSnapshot.spotPrice,
            lastSignal: "MANUAL_FUT_ALREADY_OPEN",
            lastCycleAt: vNow,
            lastError: ""
        });
        res.json({ status: "warning", message: "A future position is already open.", data: { position: objOpenFutures[0], runtime: objRuntime } });
        return;
    }
    const vBlockedMargin = calculateBlockedMargin(objOpenPositions);
    const vAdditionalMargin = calculatePaperNotional(vQty, vLotSize, vEntryPrice);
    if (!(vDemoBalance > 0) || vBlockedMargin + vAdditionalMargin > vDemoBalance) {
        await logRollingOptionsPtDeEvent({
            userId: vUserId,
            eventType: "manual_action",
            severity: "warning",
            title: "Insufficient Demo Balance",
            message: "Skipped manual future entry because demo balance is insufficient.",
            payload: {
                symbol: vSymbol,
                reason: "insufficient_demo_balance",
                requiredMargin: vBlockedMargin + vAdditionalMargin,
                blockedMargin: vBlockedMargin,
                demoBalance: vDemoBalance,
                additionalMargin: vAdditionalMargin
            }
        });
        res.status(400).json({ status: "error", message: "Insufficient demo balance." });
        return;
    }

    const objPosition: RollingOptionsPtDePositionRecord = {
        ...createPositionBase(vUserId),
        status: "OPEN",
        symbol: vSymbol,
        contractName: `${getContractNameForSymbol(vSymbol)} FUT`,
        instrumentType: "FUTURE",
        optionSide: "",
        action: vAction,
        strike: null,
        expiryDate: String(objUiState.expiryDate1 || ""),
        qty: vQty,
        lotSize: vLotSize,
        entryPrice: vEntryPrice,
        exitPrice: null,
        markPrice: vEntryPrice,
        entryDelta: null,
        exitDelta: null,
        charges: estimatePositionCharges("FUTURE", vQty, vLotSize, vEntryPrice),
        pnl: 0,
        openedReason: `Manual ${vAction} FUT`,
        closedReason: "",
        openedAt: vNow,
        closedAt: "",
        metadata: {
            orderType: String(objUiState.manualFutOrderType || "market_order"),
            source: objSnapshot.priceSource === "public" ? "demo-manual-future-live" : "demo-manual-future-simulated"
        }
    };

    const objSavedPosition = await saveRollingOptionsPtDePosition(objPosition);
    const objRuntime = await updateRuntimeFromUiState(vUserId, {
        status: "running",
        currentSymbol: vSymbol,
        currentContractName: getContractNameForSymbol(vSymbol),
        lastFuturesPrice: vEntryPrice,
        lastSpotPrice: objSnapshot.spotPrice,
        lastSignal: `MANUAL_${vAction}_FUT`,
        lastCycleAt: vNow,
        lastError: ""
    });
    await logRollingOptionsPtDeEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "info",
        title: `Manual ${vAction} Future`,
        message: `${vAction} future paper position opened.`,
        payload: {
            symbol: vSymbol,
            contractName: objPosition.contractName,
            qty: vQty,
            reason: "manual_future"
        }
    });

    res.json({ status: "success", data: { position: objSavedPosition, runtime: objRuntime } });
}

export async function executeRollingOptionsStrangleManualOption(
    req: Request,
    res: Response
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objUiState = await getMergedUiState(vUserId);
    const vRequestedRuleSet = String(req.body?.ruleSet || "").trim();
    const vRuleSetFilter: 1 | 2 | null = vRequestedRuleSet === "2" ? 2 : (vRequestedRuleSet === "1" ? 1 : null);
    const vSymbol = String(objUiState.symbol || "BTC").trim().toUpperCase() || "BTC";
    const vLotSize = getLotSizeForSymbol(vSymbol);
    const vExpiryDate = String(objUiState.expiryDate1 || "");
    const objSnapshot = await getLiveOrFallbackMarketSnapshot(objUiState);
    const vNow = objSnapshot.ts;
    const objSavedPositions: RollingOptionsPtDePositionRecord[] = [];
    const objLegPlans: Array<{
        action: "BUY" | "SELL";
        legSideLabel: string;
        expiryMode: string;
        expiryDate: string;
        ruleSet: 1 | 2;
        qty: number;
        reEnter: boolean;
        planned: Array<{ side: "CE" | "PE"; quote: Awaited<ReturnType<typeof getLiveOrFallbackOptionQuote>>; }>;
    }> = [];

    const vAction1 = String(objUiState.action1 || "sell").trim().toUpperCase();
    if ((vRuleSetFilter === null || vRuleSetFilter === 1) && vAction1 !== "NONE") {
        const vLegSide1 = String(objUiState.legSide1 || "ce").trim().toUpperCase();
        const vQty1 = Math.max(1, Math.floor(normalizeNumber(objUiState.manualOptQty1, 1)));
        const vTargetDelta1 = normalizeNumber(objUiState.greenReDelta, 0.53);
        const vSides1: Array<"CE" | "PE"> = vLegSide1 === "BOTH" ? ["CE", "PE"] : [vLegSide1 === "PE" ? "PE" : "CE"];
        const arrPlanned1: Array<{ side: "CE" | "PE"; quote: Awaited<ReturnType<typeof getLiveOrFallbackOptionQuote>>; }> = [];
        for (const vOptionSide of vSides1) {
            arrPlanned1.push({
                side: vOptionSide,
                quote: await getLiveOrFallbackOptionQuote(objUiState, vOptionSide, vTargetDelta1, RE_DELTA_TOLERANCE)
            });
        }
        objLegPlans.push({
            action: vAction1 === "BUY" ? "BUY" : "SELL",
            legSideLabel: vLegSide1,
            expiryMode: String(objUiState.expiryMode1 || "1"),
            expiryDate: String(objUiState.expiryDate1 || ""),
            ruleSet: 1,
            qty: vQty1,
            reEnter: Boolean(objUiState.reEnter1),
            planned: arrPlanned1
        });
    }

    const vAction2 = String(objUiState.action2 || "none").trim().toUpperCase();
    if ((vRuleSetFilter === null || vRuleSetFilter === 2) && vAction2 !== "NONE") {
        const vLegSide2 = String(objUiState.legSide2 || "pe").trim().toUpperCase();
        const vQty2 = Math.max(1, Math.floor(normalizeNumber(objUiState.manualOptQty2, 1)));
        const vTargetDelta2 = normalizeNumber((objUiState as any).greenReDelta2, 0.53);
        const vSides2: Array<"CE" | "PE"> = vLegSide2 === "BOTH" ? ["CE", "PE"] : [vLegSide2 === "PE" ? "PE" : "CE"];
        const arrPlanned2: Array<{ side: "CE" | "PE"; quote: Awaited<ReturnType<typeof getLiveOrFallbackOptionQuote>>; }> = [];
        for (const vOptionSide of vSides2) {
            arrPlanned2.push({
                side: vOptionSide,
                quote: await getLiveOrFallbackOptionQuote({
                    ...(objUiState || {}),
                    expiryMode1: objUiState.expiryMode2,
                    expiryDate1: objUiState.expiryDate2
                } as Record<string, unknown>, vOptionSide, vTargetDelta2, RE_DELTA_TOLERANCE)
            });
        }
        objLegPlans.push({
            action: vAction2 === "BUY" ? "BUY" : "SELL",
            legSideLabel: vLegSide2,
            expiryMode: String(objUiState.expiryMode2 || "1"),
            expiryDate: String(objUiState.expiryDate2 || ""),
            ruleSet: 2,
            qty: vQty2,
            reEnter: Boolean(objUiState.reEnter2),
            planned: arrPlanned2
        });
    }

    if (objLegPlans.length <= 0) {
        res.status(400).json({ status: "error", message: "No option action selected." });
        return;
    }

    const vDemoBalance = Math.max(0, normalizeNumber(objUiState.demoBalance, 0));
    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
    const vBlockedMargin = calculateBlockedMargin(objOpenPositions);
    const vAdditionalMargin = objLegPlans.reduce((sum, objLegPlan) => {
        return sum + objLegPlan.planned.reduce((innerSum, objPlanned) => {
            return innerSum + calculatePaperNotional(objLegPlan.qty, vLotSize, getOptionEntryPriceForAction(objPlanned.quote, objLegPlan.action));
        }, 0);
    }, 0);
    if (!(vDemoBalance > 0) || vBlockedMargin + vAdditionalMargin > vDemoBalance) {
        await logRollingOptionsPtDeEvent({
            userId: vUserId,
            eventType: "manual_action",
            severity: "warning",
            title: "Insufficient Demo Balance",
            message: "Skipped manual option entry because demo balance is insufficient.",
            payload: {
                symbol: vSymbol,
                reason: "insufficient_demo_balance",
                requiredMargin: vBlockedMargin + vAdditionalMargin,
                blockedMargin: vBlockedMargin,
                demoBalance: vDemoBalance,
                additionalMargin: vAdditionalMargin
            }
        });
        res.status(400).json({ status: "error", message: "Insufficient demo balance." });
        return;
    }

    const vGreenTpPctLegacy = Number(objUiState.greenTpDelta);
    const vGreenSlPctLegacy = Number(objUiState.greenSlDelta);
    const vGreenTpPct = Math.max(0, Math.min(100, normalizeNumber(
        objUiState.greenTpPct,
        Number.isFinite(vGreenTpPctLegacy) ? (vGreenTpPctLegacy <= 2 ? vGreenTpPctLegacy * 100 : vGreenTpPctLegacy) : 15
    )));
    const vGreenSlPct = Math.max(0, Math.min(100, normalizeNumber(
        objUiState.greenSlPct,
        Number.isFinite(vGreenSlPctLegacy) ? (vGreenSlPctLegacy <= 2 ? vGreenSlPctLegacy * 100 : vGreenSlPctLegacy) : 85
    )));
    const vGreenTpDelta = Number((vGreenTpPct / 100).toFixed(4));
    const vGreenSlDelta = Number((vGreenSlPct / 100).toFixed(4));
    const vRedTpPctLegacy = Number((objUiState as Record<string, unknown>).redTpDelta ?? objUiState.deltaTp1);
    const vRedSlPctLegacy = Number((objUiState as Record<string, unknown>).redSlDelta ?? objUiState.deltaSl1);
    const vRedTpPct = Math.max(0, Math.min(100, normalizeNumber(
        objUiState.redTpPct,
        Number.isFinite(vRedTpPctLegacy) ? (vRedTpPctLegacy <= 2 ? vRedTpPctLegacy * 100 : vRedTpPctLegacy) : 15
    )));
    const vRedSlPct = Math.max(0, Math.min(100, normalizeNumber(
        objUiState.redSlPct,
        Number.isFinite(vRedSlPctLegacy) ? (vRedSlPctLegacy <= 2 ? vRedSlPctLegacy * 100 : vRedSlPctLegacy) : 85
    )));
    const vRedTpDelta = Number((vRedTpPct / 100).toFixed(4));
    const vRedSlDelta = Number((vRedSlPct / 100).toFixed(4));
    const vGreenTpPct2 = Math.max(0, Math.min(100, normalizeNumber((objUiState as any).greenTpPct2, 15)));
    const vGreenSlPct2 = Math.max(0, Math.min(100, normalizeNumber((objUiState as any).greenSlPct2, 85)));
    const vGreenTpDelta2 = Number((vGreenTpPct2 / 100).toFixed(4));
    const vGreenSlDelta2 = Number((vGreenSlPct2 / 100).toFixed(4));
    const vRedTpPct2 = Math.max(0, Math.min(100, normalizeNumber((objUiState as any).redTpPct2, 15)));
    const vRedSlPct2 = Math.max(0, Math.min(100, normalizeNumber((objUiState as any).redSlPct2, 85)));
    const vRedTpDelta2 = Number((vRedTpPct2 / 100).toFixed(4));
    const vRedSlDelta2 = Number((vRedSlPct2 / 100).toFixed(4));

    for (const objLegPlan of objLegPlans) {
        const vLegGreenTpDelta = objLegPlan.ruleSet === 2 ? vGreenTpDelta2 : vGreenTpDelta;
        const vLegGreenSlDelta = objLegPlan.ruleSet === 2 ? vGreenSlDelta2 : vGreenSlDelta;
        const vLegRedTpDelta = objLegPlan.ruleSet === 2 ? vRedTpDelta2 : vRedTpDelta;
        const vLegRedSlDelta = objLegPlan.ruleSet === 2 ? vRedSlDelta2 : vRedSlDelta;
        const vLegGreenReDelta = objLegPlan.ruleSet === 2
            ? normalizeNumber((objUiState as any).greenReDelta2, 0.53)
            : normalizeNumber(objUiState.greenReDelta, 0.53);
        const vLegRedReDelta = objLegPlan.ruleSet === 2
            ? normalizeNumber((objUiState as any).redReDelta2, 0.53)
            : normalizeNumber(objUiState.reDelta1, 0.53);

        for (const objPlanned of objLegPlan.planned) {
            const vOptionSide = objPlanned.side;
            const objQuote = objPlanned.quote;
            const vEntryPrice = getOptionEntryPriceForAction(objQuote, objLegPlan.action);
            const vRuleColor: "G" | "R" = vOptionSide === "PE" ? "R" : "G";
            const vLegTpDelta = vRuleColor === "R" ? vLegRedTpDelta : vLegGreenTpDelta;
            const vLegSlDelta = vRuleColor === "R" ? vLegRedSlDelta : vLegGreenSlDelta;
            const vLegReDelta = vRuleColor === "R" ? vLegRedReDelta : vLegGreenReDelta;
            const vLegTpPct = Number((vLegTpDelta * 100).toFixed(4));
            const vLegSlPct = Number((vLegSlDelta * 100).toFixed(4));
            const vBaseDelta = Math.abs(Number(objQuote.entryDelta || 0.53));
            const vTpMove = Math.min(1, Math.max(0, vLegTpDelta));
            const vSlMove = Math.min(1, Math.max(0, vLegSlDelta));
            const vTakeProfitDelta = objLegPlan.action === "BUY"
                ? Math.min(1, Math.max(0, vBaseDelta + vTpMove))
                : Math.min(1, Math.max(0, vBaseDelta - vTpMove));
            const vStopLossDelta = objLegPlan.action === "BUY"
                ? Math.min(1, Math.max(0, vBaseDelta - vSlMove))
                : ((vBaseDelta + vSlMove) > 1 ? Math.min(1, Math.max(0, vLegSlDelta)) : Math.min(1, Math.max(0, vBaseDelta + vSlMove)));
            const objPosition: RollingOptionsPtDePositionRecord = {
                ...createPositionBase(vUserId),
                status: "OPEN",
                symbol: vSymbol,
                contractName: objQuote.contractName,
                instrumentType: "OPTION",
                optionSide: vOptionSide,
                action: objLegPlan.action,
                strike: objQuote.strike,
                expiryDate: objQuote.expiryDate || objLegPlan.expiryDate || vExpiryDate,
                qty: objLegPlan.qty,
                lotSize: vLotSize,
                entryPrice: vEntryPrice,
                exitPrice: null,
                markPrice: objQuote.entryPrice,
                entryDelta: objQuote.entryDelta,
                exitDelta: objQuote.entryDelta,
                charges: estimatePositionCharges("OPTION", objLegPlan.qty, vLotSize, vEntryPrice, Number(objQuote.metadata?.entrySpotPrice || objSnapshot.spotPrice || 0)),
                pnl: 0,
                openedReason: `Manual ${objLegPlan.action} ${vOptionSide}`,
                closedReason: "",
                openedAt: vNow,
                closedAt: "",
                metadata: {
                    expiryMode: objLegPlan.expiryMode,
                    ruleSet: objLegPlan.ruleSet,
                    deltaTakeProfit: vTakeProfitDelta,
                    deltaStopLoss: vStopLossDelta,
                    takeProfitDelta: vTakeProfitDelta,
                    stopLossDelta: vStopLossDelta,
                    configuredTakeProfitPct: vLegTpPct,
                    configuredStopLossPct: vLegSlPct,
                    reEntryDelta: vLegReDelta,
                    reEnter: objLegPlan.reEnter,
                    ruleColor: vRuleColor,
                    ...objQuote.metadata
                }
            };

            objSavedPositions.push(await saveRollingOptionsPtDePosition(objPosition));
        }
    }

    if (Boolean(objUiState.futuresEnabled ?? true)) {
        const pService = (req as any).__rollingOptionsStrangleService as RollingOptionsStrangleService | undefined;
        if (pService) {
            await pService.ensureFutureForOpenOptions(vUserId, "Manual option auto future");
        }
    }

    const objRuntime = await updateRuntimeFromUiState(vUserId, {
        status: "running",
        currentSymbol: vSymbol,
        currentContractName: getContractNameForSymbol(vSymbol),
        lastSpotPrice: objSnapshot.spotPrice,
        lastFuturesPrice: objSnapshot.futuresPrice,
        lastSignal: `MANUAL_OPEN_OPTION_${objLegPlans.length > 1 ? "MULTI" : (objLegPlans[0].legSideLabel === "BOTH" ? "BOTH" : objLegPlans[0].legSideLabel)}`,
        lastCycleAt: vNow,
        lastError: ""
    });
    const objFallbackPositions = objSavedPositions.filter((objRow) => Boolean(objRow.metadata?.usedNextDayExpiryFallback));
    if (objFallbackPositions.length > 0) {
        const objFirstFallback = objFallbackPositions[0];
        await logRollingOptionsPtDeEvent({
            userId: vUserId,
            eventType: "manual_action",
            severity: "info",
            title: "Next-Day Expiry Fallback Used",
            message: `Manual option entry used next-day expiry fallback for ${objFallbackPositions.length} leg(s).`,
            payload: {
                symbol: vSymbol,
                qty: objFallbackPositions.length,
                reason: "manual_next_day_expiry_fallback",
                requestedExpiryDate: String(objFirstFallback.metadata?.requestedExpiryDate || vExpiryDate),
                resolvedExpiryDate: String(objFirstFallback.metadata?.resolvedExpiryDate || objFirstFallback.expiryDate || vExpiryDate)
            }
        });
    }
    await logRollingOptionsPtDeEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "info",
        title: "Manual Option Open",
        message: `Opened ${objSavedPositions.length} manual option paper leg(s).`,
        payload: {
            symbol: vSymbol,
            qty: objSavedPositions.reduce((sum, objRow) => sum + Math.max(0, Number(objRow.qty || 0)), 0),
            reason: "manual_option_open"
        }
    });

    res.json({ status: "success", data: { positions: objSavedPositions, runtime: objRuntime } });
}

export async function executeRollingOptionsStrangleNegativePnlAdjustment(
    req: Request,
    res: Response
): Promise<void> {
    void req;
    res.status(409).json({
        status: "warning",
        message: "Support is opened only by the server engine after total open original-position PnL stays at or below the trigger amount for two consecutive cycles.",
        data: { positions: [] }
    });
    return;

    /*
     * Browser-managed support opening was removed. The server strategy owns the
     * persisted two-cycle trigger and rearm state.
     *
    const vUserId = getUserIdFromReq(req);
    const objUiState = await getMergedUiState(vUserId);
    const vSymbol = String(objUiState.symbol || "BTC").trim().toUpperCase() || "BTC";
    const vLotSize = getLotSizeForSymbol(vSymbol);
    const objSnapshot = await getLiveOrFallbackMarketSnapshot(objUiState);
    const vNow = objSnapshot.ts;
    const arrIncoming: Array<Record<string, unknown>> = Array.isArray(req.body?.adjustments)
        ? req.body.adjustments
        : [];
    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
    const objClosedPositions = await listRollingOptionsPtDeClosedPositions(vUserId);
    const objSourceOptionPositions = objOpenPositions.filter((objPosition) => {
        return objPosition.status === "OPEN"
            && objPosition.instrumentType === "OPTION"
            && !isPositivePnlSupportPosition(objPosition);
    });
    if (objSourceOptionPositions.length < 2) {
        res.status(200).json({
            status: "warning",
            message: "No negative PnL adjustment opened because at least two normal option legs must be open.",
            data: { positions: [] }
        });
        return;
    }
    const bHasPositiveSourceOption = objOpenPositions.some((objPosition) => {
        return objPosition.status === "OPEN"
            && objPosition.instrumentType === "OPTION"
            && !isPositivePnlSupportPosition(objPosition)
            && Number(objPosition.pnl || 0) > 0;
    });
    if (!bHasPositiveSourceOption) {
        res.status(200).json({
            status: "warning",
            message: "No negative PnL adjustment opened because no positive option leg is currently open.",
            data: { positions: [] }
        });
        return;
    }
    const objOpenById = new Map(objOpenPositions.map((objPosition) => [String(objPosition.positionId || "").trim(), objPosition]));
    const objAlreadyAdjustedSourceIds = new Set(objOpenPositions
        .filter((objPosition) => Boolean((objPosition.metadata as any)?.negativePnlAdjustment))
        .map((objPosition) => String((objPosition.metadata as any)?.sourcePositionId || "").trim())
        .filter(Boolean));
    const vMaxLegs = Math.max(1, Math.floor(normalizeNumber((objUiState as any).negativePnlMaxLegs, 1)));
    let vRemainingLegSlots = Math.max(0, vMaxLegs - objOpenPositions.filter(isPositivePnlSupportPosition).length);
    if (!(vRemainingLegSlots > 0)) {
        res.status(200).json({
            status: "warning",
            message: "No negative PnL adjustment opened because Max Legs limit is reached.",
            data: { positions: [] }
        });
        return;
    }
    const objClosedAdjustmentPnlBySource = new Map<string, number>();
    const objSavedPositions: RollingOptionsPtDePositionRecord[] = [];

    for (const objClosed of objClosedPositions) {
        if (!Boolean((objClosed.metadata as any)?.negativePnlAdjustment)) {
            continue;
        }
        const vSourcePositionId = String((objClosed.metadata as any)?.sourcePositionId || "").trim();
        if (!vSourcePositionId) {
            continue;
        }
        const vPnl = Number(objClosed.pnl || 0);
        objClosedAdjustmentPnlBySource.set(
            vSourcePositionId,
            (objClosedAdjustmentPnlBySource.get(vSourcePositionId) || 0) + (Number.isFinite(vPnl) ? vPnl : 0)
        );
    }

    const vActiveAdjustmentSide = objOpenPositions
        .filter(isPositivePnlSupportPosition)
        .map(getNegativePnlOptionSide)
        .find((vSide) => vSide === "CE" || vSide === "PE") || "";
    const objIncomingCandidates = arrIncoming.map((objIncoming) => {
        const vSourcePositionId = String(objIncoming?.sourcePositionId || "").trim();
        const objSourcePosition = objOpenById.get(vSourcePositionId);
        return { incoming: objIncoming, sourcePositionId: vSourcePositionId, sourcePosition: objSourcePosition };
    }).filter((objCandidate) => {
        if (!objCandidate.sourcePositionId || objAlreadyAdjustedSourceIds.has(objCandidate.sourcePositionId)) {
            return false;
        }
        if (!objCandidate.sourcePosition || objCandidate.sourcePosition.instrumentType !== "OPTION") {
            return false;
        }
        const vSourcePnl = Number(objCandidate.sourcePosition.pnl || 0);
        if (!(Number.isFinite(vSourcePnl) && vSourcePnl < 0)) {
            return false;
        }
        const vRecoveryTarget = Number.isFinite(Number((objUiState as any).negativePnlRecoveryTarget))
            ? Number((objUiState as any).negativePnlRecoveryTarget)
            : 0;
        if ((vSourcePnl + (objClosedAdjustmentPnlBySource.get(objCandidate.sourcePositionId) || 0)) >= vRecoveryTarget) {
            return false;
        }
        return Boolean(getNegativePnlOptionSide(objCandidate.sourcePosition));
    });
    const vTargetOptionSide = vActiveAdjustmentSide || objIncomingCandidates.reduce<"CE" | "PE" | "">((vSelectedSide, objCandidate) => {
        const vSourceSide = getNegativePnlOptionSide(objCandidate.sourcePosition as RollingOptionsPtDePositionRecord);
        const vSourceLoss = Math.abs(Number(objCandidate.sourcePosition?.pnl || 0));
        const objSelectedSource = objIncomingCandidates.find((objSelectedCandidate) => getNegativePnlOptionSide(objSelectedCandidate.sourcePosition as RollingOptionsPtDePositionRecord) === vSelectedSide);
        const vSelectedLoss = Math.abs(Number(objSelectedSource?.sourcePosition?.pnl || 0));
        return vSourceSide && vSourceLoss > vSelectedLoss ? vSourceSide : vSelectedSide;
    }, "");

    for (const objIncoming of arrIncoming) {
        const vSourcePositionId = String(objIncoming?.sourcePositionId || "").trim();
        if (!vSourcePositionId || objAlreadyAdjustedSourceIds.has(vSourcePositionId)) {
            continue;
        }

        const objSourcePosition = objOpenById.get(vSourcePositionId);
        if (!objSourcePosition || objSourcePosition.instrumentType !== "OPTION") {
            continue;
        }

        const vSourcePnl = Number(objSourcePosition.pnl || 0);
        if (!(Number.isFinite(vSourcePnl) && vSourcePnl < 0)) {
            continue;
        }
        const vRecoveryTarget = Number.isFinite(Number((objUiState as any).negativePnlRecoveryTarget))
            ? Number((objUiState as any).negativePnlRecoveryTarget)
            : 0;
        if ((vSourcePnl + (objClosedAdjustmentPnlBySource.get(vSourcePositionId) || 0)) >= vRecoveryTarget) {
            continue;
        }

        const vAction = String(objIncoming?.action || (objUiState as any).negativePnlAction3 || "BUY").trim().toUpperCase() === "SELL" ? "SELL" : "BUY";
        const vOptionSide: "CE" | "PE" = String(objIncoming?.optionSide || objSourcePosition.optionSide || "CE").trim().toUpperCase() === "PE" ? "PE" : "CE";
        if (!vTargetOptionSide || vOptionSide !== vTargetOptionSide) {
            continue;
        }
        if (vRemainingLegSlots <= 0) {
            break;
        }
        const vQty = Math.max(1, Math.floor(normalizeNumber(objIncoming?.qty, 1)));
        const vTargetDelta = Math.max(0, normalizeNumber(objIncoming?.targetDelta, 0.53));
        const vExpiryMode = String(objIncoming?.expiryMode || "1").trim() || "1";
        const vExpiryDate = String(objIncoming?.expiryDate || "").trim();
        const objQuoteUiState = {
            ...objUiState,
            expiryMode1: vExpiryMode === "source" ? String((objSourcePosition.metadata as any)?.expiryMode || objUiState.expiryMode1 || "1") : vExpiryMode,
            expiryDate1: vExpiryMode === "source"
                ? (vExpiryDate || String(objSourcePosition.expiryDate || objUiState.expiryDate1 || ""))
                : vExpiryDate
        };
        const objQuote = await getLiveOrFallbackOptionQuote(objQuoteUiState, vOptionSide, vTargetDelta, RE_DELTA_TOLERANCE);
        const vEntryPrice = getOptionEntryPriceForAction(objQuote, vAction);
        const vEntryDelta = Number.isFinite(Number(objQuote.entryDelta)) ? Math.abs(Number(objQuote.entryDelta)) : vTargetDelta;
        const vConfiguredTpPct = Math.min(100, Math.max(0, normalizeNumber((objUiState as any).negativePnlTpPct, 15)));
        const vConfiguredSlPct = Math.min(100, Math.max(0, normalizeNumber((objUiState as any).negativePnlSlPct, 85)));
        const objDeltaTargets = getOptionDeltaTargetsFromPct(vEntryDelta, vAction, vConfiguredTpPct, vConfiguredSlPct);
        const vTakeProfitDelta = objDeltaTargets.takeProfitDelta;
        const vStopLossDelta = objDeltaTargets.stopLossDelta;

        const objPosition: RollingOptionsPtDePositionRecord = {
            ...createPositionBase(vUserId),
            status: "OPEN",
            symbol: vSymbol,
            contractName: objQuote.contractName,
            instrumentType: "OPTION",
            optionSide: vOptionSide,
            action: vAction,
            strike: objQuote.strike,
            expiryDate: objQuote.expiryDate || vExpiryDate || objSourcePosition.expiryDate,
            qty: vQty,
            lotSize: vLotSize,
            entryPrice: vEntryPrice,
            exitPrice: null,
            markPrice: objQuote.entryPrice,
            entryDelta: vEntryDelta,
            exitDelta: vEntryDelta,
            charges: estimatePositionCharges("OPTION", vQty, vLotSize, vEntryPrice, Number(objQuote.metadata?.entrySpotPrice || objSnapshot.spotPrice || 0)),
            pnl: 0,
            openedReason: `Negative PnL adjustment for ${objSourcePosition.contractName || objSourcePosition.positionId}`,
            closedReason: "",
            openedAt: vNow,
            closedAt: "",
            metadata: {
                ...(objQuote.metadata || {}),
                negativePnlAdjustment: true,
                actionSlot: 3,
                actionLabel: "Action 3",
                sourcePositionId: vSourcePositionId,
                sourceContractName: objSourcePosition.contractName,
                sourceLossAmount: Math.abs(vSourcePnl),
                adjustmentGroupId: `negative-pnl:${vSourcePositionId}`,
                expiryMode: vExpiryMode,
                ruleSet: Math.max(1, Math.min(2, Math.floor(Number((objSourcePosition.metadata as any)?.ruleSet ?? 1)))),
                deltaTakeProfit: vTakeProfitDelta,
                deltaStopLoss: vStopLossDelta,
                takeProfitDelta: vTakeProfitDelta,
                stopLossDelta: vStopLossDelta,
                configuredTakeProfitPct: vConfiguredTpPct,
                configuredStopLossPct: vConfiguredSlPct,
                reEntryDelta: vTargetDelta,
                reEnter: false,
                ruleColor: vOptionSide === "PE" ? "R" : "G",
                reason: "negative_pnl_auto_adjustment"
            }
        };

        objSavedPositions.push(await saveRollingOptionsPtDePosition(objPosition));
        objAlreadyAdjustedSourceIds.add(vSourcePositionId);
        vRemainingLegSlots -= 1;
    }

    if (objSavedPositions.length <= 0) {
        res.status(200).json({
            status: "warning",
            message: "No negative PnL adjustment paper legs were opened.",
            data: { positions: [] }
        });
        return;
    }

    const objRuntime = await updateRuntimeFromUiState(vUserId, {
        status: "running",
        currentSymbol: vSymbol,
        currentContractName: getContractNameForSymbol(vSymbol),
        lastSpotPrice: objSnapshot.spotPrice,
        lastFuturesPrice: objSnapshot.futuresPrice,
        lastSignal: "NEGATIVE_PNL_ADJUSTMENT",
        lastCycleAt: vNow,
        lastError: ""
    });

    await logRollingOptionsPtDeEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "warning",
        title: "Negative PnL Adjustment Opened",
        message: `Opened ${objSavedPositions.length} negative PnL adjustment paper leg(s).`,
        payload: {
            symbol: vSymbol,
            qty: objSavedPositions.reduce((sum, objRow) => sum + Math.max(0, Number(objRow.qty || 0)), 0),
            reason: "negative_pnl_auto_adjustment"
        }
    });

    res.json({
        status: "success",
        message: `Opened ${objSavedPositions.length} negative PnL adjustment paper leg(s).`,
        data: { positions: objSavedPositions, runtime: objRuntime }
    });
    */
}

export async function updateRollingOptionsStrangleNegativePnlSettings(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objUiState = await getMergedUiState(vUserId);
    const vTakeProfitPct = Math.min(100, Math.max(0, normalizeNumber((objUiState as any).positivePnlTpPct, 15)));
    const vStopLossPct = Math.min(100, Math.max(0, normalizeNumber((objUiState as any).positivePnlSlPct, 85)));
    const vReEntryDelta = Math.max(0, normalizeNumber((objUiState as any).positivePnlTargetDelta, 0.53));
    const vTriggerAmount = Math.min(0, normalizeNumber((objUiState as any).positivePnlTriggerAmount, 0));
    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
    let vUpdated = 0;
    let vLastTakeProfitDelta = 0;
    let vLastStopLossDelta = 0;

    for (const objPosition of objOpenPositions) {
        if (objPosition.status !== "OPEN" || objPosition.instrumentType !== "OPTION" || !isPositivePnlSupportPosition(objPosition)) {
            continue;
        }
        const vEntryDelta = Math.abs(Number(objPosition.entryDelta || objPosition.exitDelta || vReEntryDelta || 0.53));
        const vAction = String(objPosition.action || "").trim().toUpperCase() === "SELL" ? "SELL" : "BUY";
        const objDeltaTargets = getOptionDeltaTargetsFromPct(vEntryDelta, vAction, vTakeProfitPct, vStopLossPct);
        vLastTakeProfitDelta = objDeltaTargets.takeProfitDelta;
        vLastStopLossDelta = objDeltaTargets.stopLossDelta;
        await saveRollingOptionsPtDePosition({
            ...objPosition,
            metadata: {
                ...(objPosition.metadata || {}),
                deltaTakeProfit: objDeltaTargets.takeProfitDelta,
                deltaStopLoss: objDeltaTargets.stopLossDelta,
                takeProfitDelta: objDeltaTargets.takeProfitDelta,
                stopLossDelta: objDeltaTargets.stopLossDelta,
                configuredTakeProfitPct: vTakeProfitPct,
                configuredStopLossPct: vStopLossPct,
                reEntryDelta: vReEntryDelta,
                trailBestDelta: vEntryDelta,
                trailTpPeakDelta: vEntryDelta
            },
            updatedAt: ""
        });
        vUpdated += 1;
    }

    res.json({
        status: "success",
        message: vUpdated > 0
            ? `Positive PnL support settings applied to ${vUpdated} open Action 3 leg${vUpdated === 1 ? "" : "s"}. Trigger amount ${vTriggerAmount}, TP move ${vTakeProfitPct}% and SL move ${vStopLossPct}% were recalculated. Last TP delta: ${vLastTakeProfitDelta.toFixed(4)}, SL delta: ${vLastStopLossDelta.toFixed(4)}.`
            : `Positive PnL support settings saved. Trigger amount ${vTriggerAmount}. No open Positive PnL support legs were found to update. TP move ${vTakeProfitPct}%, SL move ${vStopLossPct}%.`,
        data: {
            updated: vUpdated
        }
    });
}

export async function updateRollingOptionsStrangleRuleSettings(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vColor = String(req.body?.color || "").trim().toUpperCase() === "G" ? "G" : "R";
    const vRuleSet = String(req.body?.ruleSet || "").trim();
    const vRuleSetNumber = vRuleSet === "2" ? 2 : 1;
    const objUiState = await getMergedUiState(vUserId);

    const clampPct = (pValue: unknown, pFallback: number): number => {
        const vNum = normalizeNumber(pValue, pFallback);
        return Math.max(0, Math.min(100, vNum));
    };
    const normalizeLegacyPct = (pValue: unknown, pFallback: number): number => {
        const vNum = normalizeNumber(pValue, pFallback);
        return vNum <= 2 ? vNum * 100 : vNum;
    };
    const vGreenTpPct1 = clampPct(objUiState.greenTpPct, normalizeLegacyPct(objUiState.greenTpDelta, 15));
    const vGreenSlPct1 = clampPct(objUiState.greenSlPct, normalizeLegacyPct(objUiState.greenSlDelta, 85));
    const vRedTpPct1 = clampPct(objUiState.redTpPct, normalizeLegacyPct((objUiState as Record<string, unknown>).redTpDelta ?? objUiState.deltaTp1, 15));
    const vRedSlPct1 = clampPct(objUiState.redSlPct, normalizeLegacyPct((objUiState as Record<string, unknown>).redSlDelta ?? objUiState.deltaSl1, 85));
    const vGreenReDelta1 = normalizeNumber(objUiState.greenReDelta, normalizeNumber(objUiState.reDelta1, 0.53));
    const vRedReDelta1 = normalizeNumber((objUiState as Record<string, unknown>).redReDelta, normalizeNumber(objUiState.reRedDelta ?? objUiState.reDelta1, 0.53));

    const vTakeProfitPct = vColor === "G"
        ? (vRuleSetNumber === 2 ? clampPct((objUiState as any).greenTpPct2, 15) : vGreenTpPct1)
        : (vRuleSetNumber === 2 ? clampPct((objUiState as any).redTpPct2, 15) : vRedTpPct1);
    const vStopLossPct = vColor === "G"
        ? (vRuleSetNumber === 2 ? clampPct((objUiState as any).greenSlPct2, 85) : vGreenSlPct1)
        : (vRuleSetNumber === 2 ? clampPct((objUiState as any).redSlPct2, 85) : vRedSlPct1);
    const vTakeProfitDelta = Number((Math.min(100, Math.max(0, vTakeProfitPct)) / 100).toFixed(4));
    const vStopLossDelta = Number((Math.min(100, Math.max(0, vStopLossPct)) / 100).toFixed(4));
    const vReEntryDelta = vColor === "G"
        ? (vRuleSetNumber === 2 ? normalizeNumber((objUiState as any).greenReDelta2, 0.53) : vGreenReDelta1)
        : (vRuleSetNumber === 2 ? normalizeNumber((objUiState as any).redReDelta2, 0.53) : vRedReDelta1);

    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
    let vUpdated = 0;
    let vLastPositionTakeProfitDelta = 0;
    let vLastPositionStopLossDelta = 0;
    let vUpdatedQty = 0;
    let vUpdatedLots = 0;
    const objLotSizes = new Set<string>();
    let vOpenOptionCount = 0;
    let vRuleSetMatchCount = 0;
    let vLegacyMissingColorMatchCount = 0;
    let vLegacyManualSideColorMatchCount = 0;

    for (const objPosition of objOpenPositions) {
        if (objPosition.instrumentType !== "OPTION" || objPosition.status !== "OPEN") {
            continue;
        }
        vOpenOptionCount += 1;
        const vPositionRuleSet = Math.max(1, Math.min(2, Math.floor(Number((objPosition.metadata as any)?.ruleSet ?? 1))));
        if (vPositionRuleSet !== vRuleSetNumber) {
            continue;
        }
        vRuleSetMatchCount += 1;
        const vRuleColor = String(objPosition.metadata?.ruleColor || "").trim().toUpperCase();
        const bLegacyMissingGreenColorMatch = !vRuleColor && vColor === "G" && vRuleSetNumber === 1;
        const vPositionSideColor = String(objPosition.optionSide || "").trim().toUpperCase() === "PE" ? "R" : "G";
        const bLegacyManualSideColorMatch = String(objPosition.openedReason || "").trim().toUpperCase().startsWith("MANUAL")
            && vPositionSideColor === vColor
            && vRuleColor !== vColor;
        if (vRuleColor !== vColor && !bLegacyMissingGreenColorMatch && !bLegacyManualSideColorMatch) {
            continue;
        }
        if (bLegacyMissingGreenColorMatch) {
            vLegacyMissingColorMatchCount += 1;
        }
        if (bLegacyManualSideColorMatch) {
            vLegacyManualSideColorMatchCount += 1;
        }

        const vEntryDelta = Math.abs(Number(objPosition.entryDelta || 0.53));
        const vTpMove = Math.min(1, Math.max(0, vTakeProfitDelta));
        const vSlMove = Math.min(1, Math.max(0, vStopLossDelta));
        const vIsBuy = String(objPosition.action || "").trim().toUpperCase() === "BUY";
        const vPositionTakeProfitDelta = vIsBuy
            ? Math.min(1, Math.max(0, vEntryDelta + vTpMove))
            : Math.min(1, Math.max(0, vEntryDelta - vTpMove));
        const vRawStopLoss = vIsBuy ? (vEntryDelta - vSlMove) : (vEntryDelta + vSlMove);
        const vAbsoluteStopLoss = Math.min(1, Math.max(0, vStopLossDelta));
        const vPositionStopLossDelta = (!vIsBuy && vRawStopLoss > 1) ? vAbsoluteStopLoss : Math.min(1, Math.max(0, vRawStopLoss));
        vLastPositionTakeProfitDelta = vPositionTakeProfitDelta;
        vLastPositionStopLossDelta = vPositionStopLossDelta;

        await saveRollingOptionsPtDePosition({
            ...objPosition,
            metadata: {
                ...(objPosition.metadata || {}),
                ruleColor: vColor,
                ruleSet: vPositionRuleSet,
                deltaTakeProfit: vPositionTakeProfitDelta,
                deltaStopLoss: vPositionStopLossDelta,
                takeProfitDelta: vPositionTakeProfitDelta,
                stopLossDelta: vPositionStopLossDelta,
                configuredTakeProfitPct: vTakeProfitPct,
                configuredStopLossPct: vStopLossPct,
                reEntryDelta: vReEntryDelta,
                trailBestDelta: vEntryDelta,
                trailTpPeakDelta: vEntryDelta
            },
            updatedAt: ""
        });
        vUpdated += 1;
        vUpdatedQty += Math.max(0, Number(objPosition.qty || 0));
        vUpdatedLots += Math.max(0, Number(objPosition.qty || 0)) * Math.max(0, Number(objPosition.lotSize || 0));
        objLotSizes.add(String(objPosition.lotSize || 0));
    }
    const vActionLabel = `Action ${vRuleSetNumber}`;
    const vColorLabel = vColor === "G" ? "Green" : "Red";
    const vLotSizeLabel = Array.from(objLotSizes).filter(Boolean).join(", ") || "0";
    const vSizeMessage = `Total qty ${vUpdatedQty}, lot size ${vLotSizeLabel}, total lots ${Number(vUpdatedLots.toFixed(8))}.`;
    const vConfiguredQty = Math.max(0, Math.floor(normalizeNumber(
        vColor === "G"
            ? (vRuleSetNumber === 2 ? (objUiState as any).greenOptQty2 : objUiState.greenOptQty)
            : (vRuleSetNumber === 2 ? (objUiState as any).redOptQty2 : objUiState.redOptQty),
        0
    )));
    const vConfiguredLotSize = getLotSizeForSymbol(String(objUiState.symbol || "BTC").trim().toUpperCase() || "BTC");
    const vConfiguredLots = Number((vConfiguredQty * vConfiguredLotSize).toFixed(8));
    const vSavedSettingsMessage = `Saved settings: configured qty ${vConfiguredQty}, lot size ${vConfiguredLotSize}, total lots ${vConfiguredLots}, TP move ${vTakeProfitPct}%, SL move ${vStopLossPct}%, Re-entry delta ${vReEntryDelta}.`;
    const vLegacyMessage = vLegacyMissingColorMatchCount > 0
        ? ` ${vLegacyMissingColorMatchCount} legacy Action 1 position${vLegacyMissingColorMatchCount === 1 ? "" : "s"} had no rule color saved, so they were treated as Green and repaired.`
        : "";
    const vLegacySideMessage = vLegacyManualSideColorMatchCount > 0
        ? ` ${vLegacyManualSideColorMatchCount} legacy manual ${vColorLabel} position${vLegacyManualSideColorMatchCount === 1 ? "" : "s"} had the wrong rule color saved for the option side, so they were repaired.`
        : "";
    const vMessage = vUpdated > 0
        ? `${vActionLabel} ${vColorLabel} rule settings applied to ${vUpdated} open option position${vUpdated === 1 ? "" : "s"}. ${vSizeMessage} TP move ${vTakeProfitPct}% and SL move ${vStopLossPct}% were recalculated from each leg entry delta; Re-entry delta is ${vReEntryDelta}. Trailing TP/SL memory was reset to the new settings. Last recalculated TP delta: ${vLastPositionTakeProfitDelta.toFixed(4)}, SL delta: ${vLastPositionStopLossDelta.toFixed(4)}.${vLegacyMessage}${vLegacySideMessage}`
        : `${vActionLabel} ${vColorLabel} rule settings saved and verified before trade. ${vSavedSettingsMessage} No existing open legs were reset because checked ${vOpenOptionCount} open option position${vOpenOptionCount === 1 ? "" : "s"}; ${vRuleSetMatchCount} matched ${vActionLabel}, and no matching ${vActionLabel} ${vColorLabel} open legs were active.`;

    res.json({
        status: "success",
        message: vMessage,
        data: {
            updatedCount: vUpdated
        }
    });
}

export async function exitRollingOptionsStrangleManualPositions(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleService
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objUiState = await getMergedUiState(vUserId);
    const vInstrumentParam = String(req.body?.instrumentType || "ALL").trim().toUpperCase();
    const vInstrumentType = vInstrumentParam === "OPTION" || vInstrumentParam === "FUTURE"
        ? vInstrumentParam
        : "ALL";
    const bKillSwitch = Boolean(req.body?.killSwitch);
    const vRequestedRuleSet = String(req.body?.ruleSet || "").trim();
    const vRuleSetFilter: 1 | 2 | null = vRequestedRuleSet === "2" ? 2 : (vRequestedRuleSet === "1" ? 1 : null);
    if (bKillSwitch && vInstrumentType === "ALL") {
        await pService.stop(vUserId, "Kill switch");
    }
    const objClosedPositions = await closeOpenPositionsByInstrument(
        vUserId,
        vInstrumentType,
        `Manual exit ${vInstrumentType.toLowerCase()}`,
        vRuleSetFilter
    );
    if (
        vInstrumentType !== "ALL"
        && objClosedPositions.length > 0
        && Boolean((objUiState as any).closeAllLegsOnAnyClose)
        && shouldCloseAllLegsOnNegativeClosedOption(objClosedPositions)
    ) {
        const objCloseAllPositions = await closeOpenPositionsByInstrument(vUserId, "ALL", "Close all legs switch", null, true);
        if (!bKillSwitch) {
            await pService.reEnterClosedOptionPositions(
                vUserId,
                [...objClosedPositions, ...objCloseAllPositions],
                `Manual exit ${vInstrumentType.toLowerCase()} close all`
            );
        }
    }
    else if (!bKillSwitch && vInstrumentType !== "ALL") {
        await pService.reEnterClosedOptionPositions(vUserId, objClosedPositions, `Manual exit ${vInstrumentType.toLowerCase()}`);
    }
    const objRuntimeOverrides: Partial<RollingOptionsPtDeRuntimeRecord> = {
        status: "stopped",
        autoTraderEnabled: bKillSwitch && vInstrumentType === "ALL" ? false : undefined,
        lastSignal: `MANUAL_EXIT_${vInstrumentType}`,
        lastCycleAt: new Date().toISOString(),
        lastError: ""
    };
    if (objRuntimeOverrides.autoTraderEnabled === undefined) {
        delete (objRuntimeOverrides as any).autoTraderEnabled;
    }
    const objRuntime = await updateRuntimeFromUiState(vUserId, objRuntimeOverrides);
    await logRollingOptionsPtDeEvent({
        userId: vUserId,
        eventType: vInstrumentType === "ALL" ? "kill_switch" : "manual_action",
        severity: vInstrumentType === "ALL" ? "warning" : "info",
        title: vInstrumentType === "ALL" ? "Kill Switch Executed" : `Manual Exit ${vInstrumentType}`,
        message: `Closed ${objClosedPositions.length} ${vInstrumentType.toLowerCase()} paper position(s).`,
        payload: {
            qty: objClosedPositions.length,
            reason: `manual_exit_${vInstrumentType.toLowerCase()}`
        }
    });

    res.json({
        status: "success",
        data: {
            closedCount: objClosedPositions.length,
            positions: objClosedPositions,
            runtime: objRuntime
        }
    });
}

export async function runRollingOptionsStrangleStrategyExecution(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleService
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objResult = await pService.executeStrategy(vUserId);
    const objRuntime = await loadEffectiveRuntimeState(vUserId);
    res.json({ status: objResult.status, message: objResult.message, data: objRuntime });
}

export async function runRollingOptionsStrangleStrategyCycle(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleService
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objResult = await pService.runCycle(vUserId);
    const objRuntime = await loadEffectiveRuntimeState(vUserId);
    res.json({ status: objResult.status, message: objResult.message, data: objRuntime });
}

export async function refreshRollingOptionsStrangleEmaIndicator(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleService
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objResult = await pService.refreshStandaloneEmaIndicator(vUserId);
    const objRuntime = await loadEffectiveRuntimeState(vUserId);
    res.json({ status: objResult.status, message: objResult.message, data: objRuntime });
}

export async function openRollingOptionsStranglePositivePnlSupport(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleService
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objResult = await pService.openPositivePnlSupportManually(vUserId);
    const objRuntime = await loadEffectiveRuntimeState(vUserId);
    res.json({
        status: objResult.status,
        message: objResult.message,
        data: {
            ...objRuntime,
            openedCount: objResult.openedCount
        }
    });
}

export async function setRollingOptionsStrangleManualRenkoSignal(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleService
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vColorCode = String(req.body?.color || "").trim().toUpperCase() === "R" ? "R" : "G";
    const objResult = await pService.setManualRenkoSignal(vUserId, vColorCode);
    const objRuntime = await loadEffectiveRuntimeState(vUserId);
    res.json({ status: objResult.status, message: objResult.message, data: objRuntime });
}

export async function setRollingOptionsStrangleTradingViewEmaTrend(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleService
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vRawTrend = req.body?.trend ?? req.body?.signal ?? req.body?.message ?? req.body?.action;
    const vTrend = normalizeTradingViewEmaTrend(vRawTrend);
    const objResult = await pService.setTradingViewEmaTrend(vUserId, vTrend, {
        ...(req.body && typeof req.body === "object" ? req.body : {}),
        query: req.query
    });
    const objRuntime = await loadEffectiveRuntimeState(vUserId);
    res.json({ status: objResult.status, message: objResult.message, data: objRuntime });
}

export async function resetRollingOptionsStrangleStrategy(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleService
): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objResult = await pService.reset(vUserId);
    const objRuntime = await loadEffectiveRuntimeState(vUserId);
    res.json({ status: objResult.status, message: objResult.message, data: objRuntime });
}

export async function clearRollingOptionsStrangleClosedPositionsController(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vDeletedCount = await clearRollingOptionsPtDeClosedPositions(vUserId);
    await syncOptionsPnlWithClosedPositions(vUserId);
    await logRollingOptionsPtDeEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "warning",
        title: "Closed Positions Cleared",
        message: `Deleted ${vDeletedCount} closed paper position(s).`,
        payload: {
            qty: vDeletedCount,
            reason: "clear_closed_positions"
        }
    });
    res.json({
        status: "success",
        message: `Cleared ${vDeletedCount} closed paper position(s).`,
        data: {
            deletedCount: vDeletedCount
        }
    });
}

export async function clearRollingOptionsStrangleEventsController(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vDeletedCount = await clearRollingOptionsEventsByStrategy(vUserId, gStrategyCode);
    res.json({
        status: "success",
        message: `Cleared ${vDeletedCount} activity log event(s).`,
        data: {
            deletedCount: vDeletedCount
        }
    });
}
