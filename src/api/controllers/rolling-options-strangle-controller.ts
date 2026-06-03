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
        renkoFeedPriceSrc: "spot_price",
        demoBalance: 10000,
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
    const vExpiryMode = String(objUiState.expiryMode1 || "1");
    return {
        ...objUiState,
        expiryDate1: resolveExpiryDateByMode(vExpiryMode)
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
        state: {},
        updatedAt: ""
    };
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
    pDelta: number
): Promise<{
    contractName: string;
    strike: number;
    expiryDate: string;
    entryPrice: number;
    entryDelta: number;
    metadata: Record<string, unknown>;
}> {
    const objConfig = buildConfigFromUiState(pUiState);
    const objSnapshot = await getLiveOrFallbackMarketSnapshot(pUiState);
    const vFallbackStrike = Math.round(objSnapshot.spotPrice / 100) * 100;

    try {
        const objLiveContract = await findBestLiveOptionContract(objConfig, pOptionSide, pDelta);
        if (objLiveContract?.contractSymbol) {
            ensureLiveTickerSymbols([objLiveContract.contractSymbol]);
        }
        if (objLiveContract) {
            return {
                contractName: objLiveContract.contractSymbol,
                strike: objLiveContract.strike,
                expiryDate: objLiveContract.expiryDate,
                entryPrice: objLiveContract.markPrice,
                entryDelta: Math.abs(objLiveContract.delta),
                metadata: {
                    entrySpotPrice: objSnapshot.spotPrice,
                    productSymbol: objLiveContract.contractSymbol,
                    productDelta: objLiveContract.delta,
                    productGamma: objLiveContract.gamma,
                    productTheta: objLiveContract.theta,
                    productVega: objLiveContract.vega,
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

    return {
        contractName: `${objConfig.contractName} ${pOptionSide}`,
        strike: vFallbackStrike,
        expiryDate: objConfig.expiryDate,
        entryPrice: getSimulatedOptionPrice(objConfig.symbol, pDelta),
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
): Promise<{ exitPrice: number; exitDelta: number | null; }> {
    if (pPosition.instrumentType === "FUTURE") {
        if (pUiState) {
            const objSnapshot = await getLiveOrFallbackMarketSnapshot(pUiState);
            return {
                exitPrice: objSnapshot.futuresPrice,
                exitDelta: null
            };
        }

        return {
            exitPrice: getSimulatedFuturePrice(pPosition.symbol),
            exitDelta: null
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
                    exitDelta: Math.abs(Number(objLiveTicker.delta || pPosition.exitDelta || pPosition.entryDelta || 0.53))
                };
            }
        }
        catch (_objError) {
        }
    }

    return {
        exitPrice: getSimulatedOptionPrice(pPosition.symbol, pPosition.exitDelta ?? pPosition.entryDelta ?? 0.53),
        exitDelta: pPosition.exitDelta ?? pPosition.entryDelta ?? 0.53
    };
}

async function refreshOpenPositionMarks(
    pUserId: string,
    pPositions?: RollingOptionsPtDePositionRecord[]
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

        objUpdatedPositions.push(await saveRollingOptionsPtDePosition({
            ...objPosition,
            markPrice: vMarkPrice,
            exitDelta: vExitDelta,
            pnl: getPositionPnl(objPosition, vMarkPrice),
            updatedAt: ""
        }));
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
        updatedAt: "",
        ...pOverrides
    };

    return saveRollingOptionsPtDeRuntime(objNextRuntime);
}

async function closeOpenPositionsByInstrument(
    pUserId: string,
    pInstrumentType: "OPTION" | "FUTURE" | "ALL",
    pReason: string
): Promise<RollingOptionsPtDePositionRecord[]> {
    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
    const objUiState = await getMergedUiState(pUserId);
    const objSnapshot = await getLiveOrFallbackMarketSnapshot(objUiState);
    const objTargetPositions = objOpenPositions.filter((objPosition) => {
        return pInstrumentType === "ALL" || objPosition.instrumentType === pInstrumentType;
    });

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
        const objClosed = await saveRollingOptionsPtDePosition({
            ...objPosition,
            status: "CLOSED",
            exitPrice: vExitPrice,
            markPrice: vExitPrice,
            exitDelta: objQuote.exitDelta,
            charges: Number((Number(objPosition.charges || 0) + vExitCharges).toFixed(4)),
            pnl: vPnl,
            closedReason: pReason,
            closedAt: new Date().toISOString(),
            updatedAt: ""
        });
        objClosedPositions.push(objClosed);
    }

    if (objClosedPositions.length > 0) {
        await applyClosedOptionPnlToProfile(pUserId, objClosedPositions);
    }

    return objClosedPositions;
}

async function closeOpenPositionById(
    pUserId: string,
    pPositionId: string,
    pReason: string
): Promise<RollingOptionsPtDePositionRecord | null> {
    const vPositionId = String(pPositionId || "").trim();
    if (!vPositionId) {
        return null;
    }

    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(pUserId);
    const objPosition = objOpenPositions.find((objRow) => objRow.positionId === vPositionId) || null;
    if (!objPosition) {
        return null;
    }

    const objUiState = await getMergedUiState(pUserId);
    const objSnapshot = await getLiveOrFallbackMarketSnapshot(objUiState);
    const objQuote = await getLiveOrFallbackExitPrice(objPosition, objUiState);
    const vExitPrice = objQuote.exitPrice;
    const vExitCharges = estimatePositionCharges(
        objPosition.instrumentType,
        objPosition.qty,
        objPosition.lotSize,
        vExitPrice,
        objPosition.instrumentType === "OPTION" ? objSnapshot.spotPrice : undefined
    );
    const objClosedPosition = await saveRollingOptionsPtDePosition({
        ...objPosition,
        status: "CLOSED",
        exitPrice: vExitPrice,
        markPrice: vExitPrice,
        exitDelta: objQuote.exitDelta,
        charges: Number((Number(objPosition.charges || 0) + vExitCharges).toFixed(4)),
        pnl: getPositionPnl(objPosition, vExitPrice),
        closedReason: pReason,
        closedAt: new Date().toISOString(),
        updatedAt: ""
    });

    await applyClosedOptionPnlToProfile(pUserId, [objClosedPosition]);
    return objClosedPosition;
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

    res.json({
        status: "success",
        data: {
            userId: vUserId,
            uiState: {
                ...getDefaultUiState(),
                ...(objProfile?.uiState || {})
            },
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

    const objSaved = await saveRollingOptionsPtDeProfile(objProfile);
    res.json({ status: "success", data: objSaved });
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
    const objRows = await refreshOpenPositionMarks(vUserId);

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

export async function closeRollingOptionsStrangleOpenPositionController(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vPositionId = String(req.body?.positionId || "").trim();

    if (!vPositionId) {
        res.status(400).json({ status: "error", message: "Position id is required." });
        return;
    }

    const objClosedPosition = await closeOpenPositionById(vUserId, vPositionId, "Manual row close");
    if (!objClosedPosition) {
        res.status(404).json({ status: "error", message: "Open position not found." });
        return;
    }

    await logRollingOptionsPtDeEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "info",
        title: "Open Position Closed",
        message: "Open paper position was manually closed.",
        payload: {
            positionId: vPositionId,
            contractName: objClosedPosition.contractName,
            symbol: objClosedPosition.symbol,
            qty: objClosedPosition.qty,
            reason: "manual_open_position_close"
        }
    });

    res.json({
        status: "success",
        data: {
            position: objClosedPosition
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

export async function executeRollingOptionsStrangleManualOption(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const objUiState = await getMergedUiState(vUserId);
    const vSymbol = String(objUiState.symbol || "BTC").trim().toUpperCase() || "BTC";
    const vLotSize = getLotSizeForSymbol(vSymbol);
    const vExpiryDate = String(objUiState.expiryDate1 || "");
    const vDelta = 0.53;
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
    if (vAction1 !== "NONE") {
        const vLegSide1 = String(objUiState.legSide1 || "ce").trim().toUpperCase();
        const vQty1 = Math.max(1, Math.floor(normalizeNumber(objUiState.manualOptQty1, 1)));
        const vSides1: Array<"CE" | "PE"> = vLegSide1 === "BOTH" ? ["CE", "PE"] : [vLegSide1 === "PE" ? "PE" : "CE"];
        const arrPlanned1: Array<{ side: "CE" | "PE"; quote: Awaited<ReturnType<typeof getLiveOrFallbackOptionQuote>>; }> = [];
        for (const vOptionSide of vSides1) {
            arrPlanned1.push({ side: vOptionSide, quote: await getLiveOrFallbackOptionQuote(objUiState, vOptionSide, vDelta) });
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
    if (vAction2 !== "NONE") {
        const vLegSide2 = String(objUiState.legSide2 || "pe").trim().toUpperCase();
        const vQty2 = Math.max(1, Math.floor(normalizeNumber(objUiState.manualOptQty2, 1)));
        const vSides2: Array<"CE" | "PE"> = vLegSide2 === "BOTH" ? ["CE", "PE"] : [vLegSide2 === "PE" ? "PE" : "CE"];
        const arrPlanned2: Array<{ side: "CE" | "PE"; quote: Awaited<ReturnType<typeof getLiveOrFallbackOptionQuote>>; }> = [];
        for (const vOptionSide of vSides2) {
            arrPlanned2.push({
                side: vOptionSide,
                quote: await getLiveOrFallbackOptionQuote({
                    ...(objUiState || {}),
                    expiryMode1: objUiState.expiryMode2,
                    expiryDate1: objUiState.expiryDate2
                } as Record<string, unknown>, vOptionSide, vDelta)
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
            return innerSum + calculatePaperNotional(objLegPlan.qty, vLotSize, objPlanned.quote.entryPrice);
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
    const vGreenTpPct2 = Math.max(0, Math.min(100, normalizeNumber((objUiState as any).greenTpPct2, 15)));
    const vGreenSlPct2 = Math.max(0, Math.min(100, normalizeNumber((objUiState as any).greenSlPct2, 85)));
    const vGreenTpDelta2 = Number((vGreenTpPct2 / 100).toFixed(4));
    const vGreenSlDelta2 = Number((vGreenSlPct2 / 100).toFixed(4));

    for (const objLegPlan of objLegPlans) {
        const vLegGreenTpDelta = objLegPlan.ruleSet === 2 ? vGreenTpDelta2 : vGreenTpDelta;
        const vLegGreenSlDelta = objLegPlan.ruleSet === 2 ? vGreenSlDelta2 : vGreenSlDelta;
        const vLegGreenReDelta = objLegPlan.ruleSet === 2
            ? normalizeNumber((objUiState as any).greenReDelta2, 0.53)
            : normalizeNumber(objUiState.greenReDelta, 0.53);

        for (const objPlanned of objLegPlan.planned) {
            const vOptionSide = objPlanned.side;
            const objQuote = objPlanned.quote;
            const vBaseDelta = Math.abs(Number(objQuote.entryDelta || 0.53));
            const vTpMove = Math.min(1, Math.max(0, vLegGreenTpDelta));
            const vSlMove = Math.min(1, Math.max(0, vLegGreenSlDelta));
            const vTakeProfitDelta = objLegPlan.action === "BUY"
                ? Math.min(1, Math.max(0, vBaseDelta + vTpMove))
                : Math.min(1, Math.max(0, vBaseDelta - vTpMove));
            const vStopLossDelta = objLegPlan.action === "BUY"
                ? Math.min(1, Math.max(0, vBaseDelta - vSlMove))
                : ((vBaseDelta + vSlMove) > 1 ? Math.min(1, Math.max(0, vLegGreenSlDelta)) : Math.min(1, Math.max(0, vBaseDelta + vSlMove)));
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
                entryPrice: objQuote.entryPrice,
                exitPrice: null,
                markPrice: objQuote.entryPrice,
                entryDelta: objQuote.entryDelta,
                exitDelta: objQuote.entryDelta,
                charges: estimatePositionCharges("OPTION", objLegPlan.qty, vLotSize, objQuote.entryPrice, Number(objQuote.metadata?.entrySpotPrice || objSnapshot.spotPrice || 0)),
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
                    reEntryDelta: vLegGreenReDelta,
                    reEnter: objLegPlan.reEnter,
                    ruleColor: "G",
                    ...objQuote.metadata
                }
            };

            objSavedPositions.push(await saveRollingOptionsPtDePosition(objPosition));
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

export async function updateRollingOptionsStrangleRuleSettings(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vColor = String(req.body?.color || "").trim().toUpperCase() === "G" ? "G" : "R";
    const vRuleSet = String(req.body?.ruleSet || "").trim();
    const vRuleSetNumber = vRuleSet === "2" ? 2 : 1;
    const objUiState = await getMergedUiState(vUserId);
    const objConfig = buildConfigFromUiState(objUiState);

    const clampPct = (pValue: unknown, pFallback: number): number => {
        const vNum = normalizeNumber(pValue, pFallback);
        return Math.max(0, Math.min(100, vNum));
    };

    const vTakeProfitPct = vColor === "G"
        ? (vRuleSetNumber === 2 ? clampPct((objUiState as any).greenTpPct2, 15) : Number(objConfig.greenTakeProfitPct ?? 15))
        : (vRuleSetNumber === 2 ? clampPct((objUiState as any).redTpPct2, 15) : Number(objConfig.redTakeProfitPct ?? 15));
    const vStopLossPct = vColor === "G"
        ? (vRuleSetNumber === 2 ? clampPct((objUiState as any).greenSlPct2, 85) : Number(objConfig.greenStopLossPct ?? 85))
        : (vRuleSetNumber === 2 ? clampPct((objUiState as any).redSlPct2, 85) : Number(objConfig.redStopLossPct ?? 85));
    const vTakeProfitDelta = Number((Math.min(100, Math.max(0, vTakeProfitPct)) / 100).toFixed(4));
    const vStopLossDelta = Number((Math.min(100, Math.max(0, vStopLossPct)) / 100).toFixed(4));
    const vReEntryDelta = vColor === "G"
        ? (vRuleSetNumber === 2 ? normalizeNumber((objUiState as any).greenReDelta2, 0.53) : Number(objConfig.greenReDelta ?? objConfig.reDelta ?? 0.53))
        : (vRuleSetNumber === 2 ? normalizeNumber((objUiState as any).redReDelta2, 0.53) : Number(objConfig.redReDelta ?? objConfig.reDelta ?? 0.53));

    const objOpenPositions = await listRollingOptionsPtDeOpenPositions(vUserId);
    let vUpdated = 0;

    for (const objPosition of objOpenPositions) {
        if (objPosition.instrumentType !== "OPTION" || objPosition.status !== "OPEN") {
            continue;
        }
        const vRuleColor = String(objPosition.metadata?.ruleColor || "").trim().toUpperCase();
        if (vRuleColor !== vColor) {
            continue;
        }
        const vPositionRuleSet = Math.max(1, Math.min(2, Math.floor(Number((objPosition.metadata as any)?.ruleSet ?? 1))));
        if (vPositionRuleSet !== vRuleSetNumber) {
            continue;
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
                reEntryDelta: vReEntryDelta
            },
            updatedAt: ""
        });
        vUpdated += 1;
    }

    await logRollingOptionsPtDeEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "info",
        title: `Rule Settings Updated (${vColor === "G" ? "Green" : "Red"} ${vRuleSetNumber})`,
        message: `Updated ${vUpdated} open option position(s) with the latest rule settings.`,
        payload: {
            qty: vUpdated,
            reason: vColor === "G" ? "update_green_rules" : "update_red_rules",
            ruleColor: vColor,
            ruleSet: vRuleSetNumber,
            stopLossDelta: vStopLossDelta,
            takeProfitDelta: vTakeProfitDelta,
            reEntryDelta: vReEntryDelta
        }
    });

    res.json({
        status: "success",
        data: {
            updatedCount: vUpdated
        }
    });
}

export async function exitRollingOptionsStrangleManualPositions(req: Request, res: Response): Promise<void> {
    const vUserId = getUserIdFromReq(req);
    const vInstrumentParam = String(req.body?.instrumentType || "ALL").trim().toUpperCase();
    const vInstrumentType = vInstrumentParam === "OPTION" || vInstrumentParam === "FUTURE"
        ? vInstrumentParam
        : "ALL";
    const objClosedPositions = await closeOpenPositionsByInstrument(
        vUserId,
        vInstrumentType,
        `Manual exit ${vInstrumentType.toLowerCase()}`
    );
    const objRuntime = await updateRuntimeFromUiState(vUserId, {
        status: "stopped",
        lastSignal: `MANUAL_EXIT_${vInstrumentType}`,
        lastCycleAt: new Date().toISOString(),
        lastError: ""
    });
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
