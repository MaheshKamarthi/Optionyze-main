import crypto from "node:crypto";
const DeltaRestClient = require("delta-rest-client");
import { RunnerManager } from "../../runners/runner-manager";
import { getDeltaApiProfile } from "../../storage/delta-api-profile-store";
import {
    listRollingOptionsStrangleLiveImportedPositions,
    replaceRollingOptionsStrangleLiveImportedPositions,
    type RollingOptionsStrangleLiveImportedPositionRecord,
    type RollingOptionsStrangleLivePositionMetadata
} from "../../storage/rolling-options-strangle-live-position-store";
import {
    loadRollingOptionsStrangleLiveProfile,
    saveRollingOptionsStrangleLiveProfile
} from "../../storage/rolling-options-strangle-live-profile-store";
import {
    listRollingOptionsStrangleLiveRuntime,
    loadRollingOptionsStrangleLiveRuntime,
    saveRollingOptionsStrangleLiveRuntime,
    type RollingOptionsStrangleLiveRuntimeRecord
} from "../../storage/rolling-options-strangle-live-runtime-store";
import { runWithPostgresAdvisoryLock } from "../../storage/postgres";
import { calculateDeltaStylePnl } from "../../lib/delta-style-pnl";
import { buildConfigFromUiState, updateRenkoState } from "../rolling-options-pt-de/engine";
import {
    ensureLiveTickerSymbolsForOwner,
    findBestLiveOptionContract,
    getLiveTickerFeedStats,
    getLiveTickerSymbolsForOwner,
    getLiveMarketSnapshot,
    getLiveOptionTicker,
    releaseLiveTickerSymbolsForOwner
} from "../rolling-options-pt-de/market-data";
import { logRollingOptionsStrangleLiveEvent } from "./event-logger";
import type { RollingOptionsPtDeConfig, RollingOptionsPtDeEngineState, RollingOptionsPtDeMarketSnapshot } from "../rolling-options-pt-de/types";

interface EnrichedImportedPosition extends RollingOptionsStrangleLiveImportedPositionRecord {
    currentDelta: number | null;
    isOption: boolean;
}

interface DeltaPositionRow {
    product_symbol?: string;
    symbol?: string;
    size?: number | string | null;
    net_size?: number | string | null;
    entry_price?: number | string | null;
    mark_price?: number | string | null;
    liquidation_price?: number | string | null;
    realized_pnl?: number | string | null;
    unrealized_pnl?: number | string | null;
    margin?: number | string | null;
    product_id?: number | string | null;
}

interface DeltaActiveOrderRow {
    id?: number | string | null;
    state?: string | null;
    size?: number | string | null;
    unfilled_size?: number | string | null;
    product_symbol?: string | null;
    [key: string]: unknown;
}

const gFutureLimitRetryDelayMs = 5000;
const gFutureLimitRetryCount = 5;

function isOptionContract(pContractName: string): boolean {
    const vContractName = String(pContractName || "").trim().toUpperCase();
    return vContractName.startsWith("C-") || vContractName.startsWith("P-");
}

function isNegativePnlAdjustmentPosition(pPosition: RollingOptionsStrangleLiveImportedPositionRecord): boolean {
    return Boolean(pPosition.metadata?.negativePnlAdjustment);
}

function getLotSizeForContractName(pContractName: string): number {
    const vContractName = String(pContractName || "").trim().toUpperCase();
    return vContractName.includes("ETH") ? 0.01 : 0.001;
}

function calculateImportedPnl(pPosition: RollingOptionsStrangleLiveImportedPositionRecord, pMarkPrice: number): number {
    return calculateDeltaStylePnl(
        pPosition.side,
        Number(pPosition.qty || 0),
        getLotSizeForContractName(pPosition.contractName),
        Number(pPosition.entryPrice || 0),
        Number(pMarkPrice || 0),
        Number(pPosition.pnl || 0)
    );
}

function shouldTriggerImportedOption(
    pSide: string,
    pCurrentDelta: number,
    pTakeProfitDelta: number,
    pStopLossDelta: number
): { shouldAct: boolean; reason: "" | "sl" | "tp"; } {
    const vSide = String(pSide || "").trim().toUpperCase();
    const vAbsDelta = Math.abs(Number(pCurrentDelta || 0));
    const vDeltaTp = Number(pTakeProfitDelta || 0);
    const vDeltaSl = Number(pStopLossDelta || 0);
    const bHasTp = Number.isFinite(vDeltaTp) && vDeltaTp > 0;
    const bHasSl = Number.isFinite(vDeltaSl) && vDeltaSl > 0;

    if (!Number.isFinite(vAbsDelta) || (!bHasTp && !bHasSl)) {
        return { shouldAct: false, reason: "" };
    }

    if (vSide === "SELL") {
        if (bHasSl && vAbsDelta >= vDeltaSl) {
            return { shouldAct: true, reason: "sl" };
        }
        if (bHasTp && vAbsDelta <= vDeltaTp) {
            return { shouldAct: true, reason: "tp" };
        }
        return { shouldAct: false, reason: "" };
    }

    if (bHasSl && vAbsDelta <= vDeltaSl) {
        return { shouldAct: true, reason: "sl" };
    }
    if (bHasTp && vAbsDelta >= vDeltaTp) {
        return { shouldAct: true, reason: "tp" };
    }
    return { shouldAct: false, reason: "" };
}

function toFiniteNumber(pValue: unknown, pFallback = 0): number {
    const vNumber = Number(pValue);
    return Number.isFinite(vNumber) ? vNumber : pFallback;
}

function sleep(pDurationMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, pDurationMs));
}

function normalizeLiveNumber(pValue: unknown, pFallback: number): number {
    const vNumber = Number(pValue);
    return Number.isFinite(vNumber) ? vNumber : pFallback;
}

function getContractNameForSymbol(pSymbol: string): string {
    return String(pSymbol || "").trim().toUpperCase() === "ETH" ? "ETHUSD" : "BTCUSD";
}

function getLotSizeForSymbol(pSymbol: string): number {
    return String(pSymbol || "").trim().toUpperCase() === "ETH" ? 0.01 : 0.001;
}

function formatIsoDate(pDateValue: Date): string {
    const vYear = String(pDateValue.getFullYear());
    const vMonth = String(pDateValue.getMonth() + 1).padStart(2, "0");
    const vDay = String(pDateValue.getDate()).padStart(2, "0");
    return `${vYear}-${vMonth}-${vDay}`;
}

function resolveLiveExpiryDateByMode(pExpiryMode: string): string {
    const vMode = String(pExpiryMode || "1").trim();
    const objDate = new Date();
    const vDayOfWeek = objDate.getDay();

    if (vMode === "1") {
        objDate.setDate(objDate.getDate() + 1);
        return formatIsoDate(objDate);
    }
    if (vMode === "2") {
        objDate.setDate(objDate.getDate() + 2);
        return formatIsoDate(objDate);
    }
    if (vMode === "4") {
        const vDaysToFriday = (5 - vDayOfWeek + 7) % 7;
        objDate.setDate(objDate.getDate() + (vDayOfWeek >= 2 ? vDaysToFriday + 7 : vDaysToFriday));
        return formatIsoDate(objDate);
    }
    if (vMode === "5") {
        const vDaysToFriday = (5 - vDayOfWeek + 7) % 7;
        objDate.setDate(objDate.getDate() + (vDayOfWeek >= 2 ? vDaysToFriday + 14 : vDaysToFriday + 7));
        return formatIsoDate(objDate);
    }
    if (vMode === "6") {
        const getLastFridayOfMonth = (pYear: number, pMonthIndex: number): Date => {
            const objLastDay = new Date(pYear, pMonthIndex + 1, 0);
            while (objLastDay.getDay() !== 5) {
                objLastDay.setDate(objLastDay.getDate() - 1);
            }
            return objLastDay;
        };
        const objLastFriday = getLastFridayOfMonth(objDate.getFullYear(), objDate.getMonth());
        const objNextLastFriday = getLastFridayOfMonth(objDate.getFullYear(), objDate.getMonth() + 1);
        return formatIsoDate(objDate.getDate() > 15 ? objNextLastFriday : objLastFriday);
    }
    if (vMode === "7") {
        const getLastFridayOfMonth = (pYear: number, pMonthIndex: number): Date => {
            const objLastDay = new Date(pYear, pMonthIndex + 1, 0);
            while (objLastDay.getDay() !== 5) {
                objLastDay.setDate(objLastDay.getDate() - 1);
            }
            return objLastDay;
        };
        const objNextLastFriday = getLastFridayOfMonth(objDate.getFullYear(), objDate.getMonth() + 1);
        const objThirdMonthLastFriday = getLastFridayOfMonth(objDate.getFullYear(), objDate.getMonth() + 2);
        const vMsPerDay = 24 * 60 * 60 * 1000;
        const vDaysToCandidate = Math.floor((objNextLastFriday.getTime() - objDate.getTime()) / vMsPerDay);
        return formatIsoDate(vDaysToCandidate <= 30 ? objThirdMonthLastFriday : objNextLastFriday);
    }

    return formatIsoDate(objDate);
}

function getDefaultLiveUiState(): Record<string, unknown> {
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
        reEnter1: false,
        action2: "none",
        legSide2: "pe",
        expiryMode2: "1",
        expiryDate2: "",
        manualOptQty2: 1,
        reEnter2: false,
        redOptQty: 1,
        reRedDelta: 0.53,
        redTpPct: 0.50,
        redSlPct: 0.90,
        greenOptQty: 1,
        greenReDelta: 0.53,
        greenTpPct: 0.50,
        greenSlPct: 0.90,
        trailGreenTp1Enabled: true,
        trailGreenSl1Enabled: true,
        trailRedTp1Enabled: true,
        trailRedSl1Enabled: true,
        greenOptQty2: 1,
        greenReDelta2: 0.53,
        greenTpPct2: 0.50,
        greenSlPct2: 0.90,
        redOptQty2: 1,
        redReDelta2: 0.53,
        redTpPct2: 0.50,
        redSlPct2: 0.90,
        trailGreenTp2Enabled: true,
        trailGreenSl2Enabled: true,
        trailRedTp2Enabled: true,
        trailRedSl2Enabled: true,
        addOneLotFuture: false,
        renkoFeedPts: 10,
        renkoFeedPriceSrc: "mark_price",
        targetOpenPnl: 0,
        negativePnlHedgeEnabled: true,
        negativePnlPlaceOrders: false,
        negativePnlAction3: "buy",
        negativePnlHedgeQty: 10,
        negativePnlMaxLegs: 1,
        negativePnlTpPct: 15,
        negativePnlSlPct: 85,
        negativePnlHedgeExpiryMode: "1",
        negativePnlHedgeDelta: 0.53,
        negativePnlRecoveryTarget: 0,
        closedFromDate: "",
        closedToDate: "",
        telegramAlertsEnabled: false,
        telegramAlertTypes: []
    };
}

function sanitizeLiveUiState(pUiState?: Record<string, unknown> | null): Record<string, unknown> {
    const objUiState = pUiState && typeof pUiState === "object" ? pUiState : {};
    const {
        reDelta1: _legacyReDelta1,
        deltaTp1: _legacyDeltaTp1,
        deltaSl1: _legacyDeltaSl1,
        ...objSanitized
    } = objUiState;
    return objSanitized;
}

function normalizeLiveUiState(pUiState?: Record<string, unknown> | null): Record<string, unknown> {
    const objUiState = pUiState && typeof pUiState === "object" ? { ...pUiState } : {};
    const vManualFutQty = Math.max(1, Math.floor(normalizeLiveNumber(objUiState.manualFutQty, 1)));
    const vLegacyRedPct = normalizeLiveNumber(objUiState.redOptQtyPct ?? objUiState.autoOptQtyPct, NaN);
    if (!Number.isFinite(Number(objUiState.redOptQty))) {
        objUiState.redOptQty = Number.isFinite(vLegacyRedPct)
            ? Math.max(0, Math.round(vManualFutQty * vLegacyRedPct / 100))
            : 1;
    }
    const vLegacyGreenPct = normalizeLiveNumber(objUiState.greenOptQtyPct, NaN);
    if (!Number.isFinite(Number(objUiState.greenOptQty))) {
        objUiState.greenOptQty = Number.isFinite(vLegacyGreenPct)
            ? Math.max(0, Math.round(vManualFutQty * vLegacyGreenPct / 100))
            : 1;
    }
    if (!Number.isFinite(Number(objUiState.reRedDelta))) {
        objUiState.reRedDelta = normalizeLiveNumber(objUiState.reDelta1, 0.53);
    }
    const vRedTpLegacy = normalizeLiveNumber(objUiState.redTpDelta ?? objUiState.deltaTp1, 0.15);
    const vRedSlLegacy = normalizeLiveNumber(objUiState.redSlDelta ?? objUiState.deltaSl1, 0.85);
    if (!Number.isFinite(Number(objUiState.redTpPct))) {
        objUiState.redTpPct = vRedTpLegacy <= 2 ? (vRedTpLegacy * 100) : vRedTpLegacy;
    }
    if (!Number.isFinite(Number(objUiState.redSlPct))) {
        objUiState.redSlPct = vRedSlLegacy <= 2 ? (vRedSlLegacy * 100) : vRedSlLegacy;
    }
    if (!Number.isFinite(Number(objUiState.greenReDelta))) {
        objUiState.greenReDelta = normalizeLiveNumber(objUiState.reDelta1, 0.53);
    }
    if (!Number.isFinite(Number(objUiState.greenReDelta2))) {
        objUiState.greenReDelta2 = normalizeLiveNumber(objUiState.greenReDelta, 0.53);
    }
    if (!Number.isFinite(Number(objUiState.newDelta1))) {
        objUiState.newDelta1 = normalizeLiveNumber(objUiState.greenReDelta, 0.53);
    }
    const vGreenTpLegacy = normalizeLiveNumber(objUiState.greenTpDelta ?? objUiState.deltaTp1, 0.15);
    const vGreenSlLegacy = normalizeLiveNumber(objUiState.greenSlDelta ?? objUiState.deltaSl1, 0.85);
    if (!Number.isFinite(Number(objUiState.greenTpPct))) {
        objUiState.greenTpPct = vGreenTpLegacy <= 2 ? (vGreenTpLegacy * 100) : vGreenTpLegacy;
    }
    if (!Number.isFinite(Number(objUiState.greenSlPct))) {
        objUiState.greenSlPct = vGreenSlLegacy <= 2 ? (vGreenSlLegacy * 100) : vGreenSlLegacy;
    }
    if (!Number.isFinite(Number(objUiState.greenTpPct2))) {
        objUiState.greenTpPct2 = normalizeLiveNumber(objUiState.greenTpPct, 15);
    }
    if (!Number.isFinite(Number(objUiState.greenSlPct2))) {
        objUiState.greenSlPct2 = normalizeLiveNumber(objUiState.greenSlPct, 85);
    }
    if (!Number.isFinite(Number(objUiState.redReDelta2))) {
        objUiState.redReDelta2 = normalizeLiveNumber(objUiState.reRedDelta, 0.53);
    }
    if (!Number.isFinite(Number(objUiState.redTpPct2))) {
        objUiState.redTpPct2 = normalizeLiveNumber(objUiState.redTpPct, 15);
    }
    if (!Number.isFinite(Number(objUiState.redSlPct2))) {
        objUiState.redSlPct2 = normalizeLiveNumber(objUiState.redSlPct, 85);
    }
    return sanitizeLiveUiState(objUiState);
}

function getMergedLiveUiState(pProfile?: { uiState?: Record<string, unknown> | null } | null): Record<string, unknown> {
    const objUiState = normalizeLiveUiState({
        ...getDefaultLiveUiState(),
        ...(pProfile?.uiState || {})
    });
    return {
        ...objUiState,
        expiryDate1: String(objUiState.expiryDate1 || "").trim() || resolveLiveExpiryDateByMode(String(objUiState.expiryMode1 || "1"))
    };
}

function buildLiveRuleConfigFromUiState(pUiState: Record<string, unknown>, pRuleSet: 1 | 2) {
    const objState = { ...(pUiState || {}) } as Record<string, unknown>;
    if (pRuleSet === 2) {
        objState.action1 = objState.action2;
        objState.legSide1 = objState.legSide2;
        objState.expiryMode1 = objState.expiryMode2;
        objState.expiryDate1 = objState.expiryDate2;
        objState.manualOptQty1 = objState.manualOptQty2;
        objState.reEnter1 = objState.reEnter2;
        objState.greenOptQty = objState.greenOptQty2;
        objState.greenReDelta = objState.greenReDelta2;
        objState.greenTpPct = objState.greenTpPct2;
        objState.greenSlPct = objState.greenSlPct2;
        objState.redOptQty = objState.redOptQty2;
        objState.reRedDelta = objState.redReDelta2;
        objState.redTpPct = objState.redTpPct2;
        objState.redSlPct = objState.redSlPct2;
    }
    return buildConfigFromUiState(objState);
}

function getLiveOptionDeltaTargetsFromPct(
    pEntryDelta: number,
    pSide: string,
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

function getOptionSideFromContractName(pContractName: string): "" | "CE" | "PE" {
    const vContractName = String(pContractName || "").trim().toUpperCase();
    if (vContractName.startsWith("C-")) {
        return "CE";
    }
    if (vContractName.startsWith("P-")) {
        return "PE";
    }
    return "";
}

async function getLiveOrFallbackOptionQuote(
    pUiState: Record<string, unknown>,
    pOptionSide: "CE" | "PE",
    pTargetDelta: number,
    pReDeltaTolerance: number
): Promise<{
    contractName: string;
    markPrice: number;
    entryPrice: number;
    bestBid: number | null;
    bestAsk: number | null;
    entryDelta: number;
    metadata: Record<string, unknown>;
    strike: number;
    expiryDate: string;
    contractSymbol: string;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    usedNextDayFallback: boolean;
}> {
    const objConfig = buildConfigFromUiState(pUiState);
    const objContract = await findBestLiveOptionContract(
        objConfig,
        pOptionSide,
        pTargetDelta,
        false,
        pReDeltaTolerance
    );
    const vMarkPrice = Number(objContract?.markPrice || 0);
    const vBestBid = objContract?.bestBid ?? null;
    const vBestAsk = objContract?.bestAsk ?? null;
    const vEntryPrice = (pUiState as any).negativePnlAction3 === "sell" && vBestBid ? vBestBid : (vBestAsk || vMarkPrice);
    const vEntryDelta = objContract ? Math.abs(objContract.delta) : pTargetDelta;
    return {
        contractName: objContract?.contractSymbol || `${objConfig.contractName} ${pOptionSide}`,
        markPrice: vMarkPrice,
        entryPrice: vEntryPrice,
        bestBid: vBestBid,
        bestAsk: vBestAsk,
        entryDelta: vEntryDelta,
        metadata: {},
        strike: objContract?.strike || Math.round((objConfig as any).spotPrice || 50000),
        expiryDate: objContract?.expiryDate || "",
        contractSymbol: objContract?.contractSymbol || "",
        delta: objContract?.delta || pTargetDelta,
        gamma: objContract?.gamma || 0,
        theta: objContract?.theta || 0,
        vega: objContract?.vega || 0,
        usedNextDayFallback: Boolean(objContract?.usedNextDayFallback)
    };
}

function createPositionBase(pUserId: string): Partial<RollingOptionsStrangleLiveImportedPositionRecord> {
    return {
        userId: pUserId,
        importId: crypto.randomUUID(),
        charges: 0,
        pnl: 0,
        margin: 0,
        liquidationPrice: 0,
        openedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

const RE_DELTA_TOLERANCE = 0.05;

export class RollingOptionsStrangleLiveService {
    private readonly stateByUserId = new Map<string, RollingOptionsPtDeEngineState>();
    private readonly lastErrorLogByUserId = new Map<string, { message: string; loggedAtMs: number }>();

    public constructor(private readonly runnerManager: RunnerManager) {}

    private shouldLogCycleError(pUserId: string, pMessage: string): boolean {
        const vUserId = String(pUserId || "").trim();
        const vMessage = String(pMessage || "").trim() || "Live cycle failed.";
        const vNowMs = Date.now();
        const objPrevious = this.lastErrorLogByUserId.get(vUserId);
        if (!objPrevious) {
            this.lastErrorLogByUserId.set(vUserId, { message: vMessage, loggedAtMs: vNowMs });
            return true;
        }

        const bMessageChanged = objPrevious.message !== vMessage;
        const bCooldownElapsed = (vNowMs - objPrevious.loggedAtMs) >= (5 * 60 * 1000);
        if (bMessageChanged || bCooldownElapsed) {
            this.lastErrorLogByUserId.set(vUserId, { message: vMessage, loggedAtMs: vNowMs });
            return true;
        }

        return false;
    }

    private getTickerOwnerId(pUserId: string): string {
        return `rolling-options-strangle-live:${String(pUserId || "").trim()}`;
    }

    private refreshTickerScope(pUserId: string, pSymbols: string[]): void {
        ensureLiveTickerSymbolsForOwner(this.getTickerOwnerId(pUserId), pSymbols);
    }

    private releaseTickerScope(pUserId: string): void {
        releaseLiveTickerSymbolsForOwner(this.getTickerOwnerId(pUserId));
    }

    private async getDeltaClient(pUserId: string): Promise<{ client: any; profileId: string; }> {
        const objProfile = await loadRollingOptionsStrangleLiveProfile(pUserId);
        const vProfileId = String(objProfile?.selectedApiProfileId || "").trim();
        if (!vProfileId) {
            throw new Error("Select an API profile before running the live auto trader.");
        }

        const objDeltaProfile = await getDeltaApiProfile(pUserId, vProfileId);
        if (!objDeltaProfile) {
            throw new Error("Selected Delta API profile was not found.");
        }

        return {
            client: await new DeltaRestClient(objDeltaProfile.apiKey, objDeltaProfile.apiSecret),
            profileId: vProfileId
        };
    }

    private async persistImportedPositions(
        pUserId: string,
        pPositions: RollingOptionsStrangleLiveImportedPositionRecord[]
    ): Promise<RollingOptionsStrangleLiveImportedPositionRecord[]> {
        return replaceRollingOptionsStrangleLiveImportedPositions(pUserId, pPositions);
    }

    private parseDeltaPayload(pRaw: unknown): Record<string, unknown> {
        if (!pRaw) {
            return {};
        }
        if (typeof pRaw === "string") {
            try {
                return JSON.parse(pRaw) as Record<string, unknown>;
            }
            catch (_objError) {
                return {};
            }
        }
        if (Buffer.isBuffer(pRaw)) {
            try {
                return JSON.parse(pRaw.toString("utf8")) as Record<string, unknown>;
            }
            catch (_objError) {
                return {};
            }
        }
        if (typeof pRaw === "object") {
            return pRaw as Record<string, unknown>;
        }
        return {};
    }

    private readResponsePayload(pResponse: { data?: unknown; body?: unknown } | unknown): Record<string, unknown> {
        const objResponse = (pResponse || {}) as { data?: unknown; body?: unknown };
        return this.parseDeltaPayload(objResponse.data ?? objResponse.body ?? {});
    }

    private getOrderId(pPayload: Record<string, unknown>): string {
        const objResult = (pPayload.result && typeof pPayload.result === "object")
            ? pPayload.result as Record<string, unknown>
            : {};
        return String(objResult.id || objResult.order_id || "").trim();
    }

    private async findActiveFutureOrderById(
        pClient: any,
        pContractName: string,
        pOrderId: string
    ): Promise<DeltaActiveOrderRow | null> {
        if (!pOrderId || typeof pClient?.apis?.Orders?.getOrders !== "function") {
            return null;
        }

        const objResponse = await pClient.apis.Orders.getOrders({
            product_symbol: pContractName,
            state: "open",
            page_size: 100
        });
        const objPayload = this.readResponsePayload(objResponse);
        const arrRows = Array.isArray(objPayload.result) ? objPayload.result as DeltaActiveOrderRow[] : [];
        return arrRows.find((objRow) => String(objRow.id || "").trim() === pOrderId) || null;
    }

    private async repriceOrReplaceLimitFutureOrder(
        pClient: any,
        pContractName: string,
        pOrderId: string,
        pSide: "buy" | "sell",
        pQty: number,
        pNextPrice: string
    ): Promise<string> {
        if (typeof pClient?.apis?.Orders?.editOrder === "function") {
            const objResponse = await pClient.apis.Orders.editOrder({
                order: {
                    id: Number.isFinite(Number(pOrderId)) ? Number(pOrderId) : pOrderId,
                    product_symbol: pContractName,
                    size: pQty,
                    limit_price: pNextPrice
                }
            });
            const objPayload = this.readResponsePayload(objResponse);
            return this.getOrderId(objPayload) || pOrderId;
        }

        if (typeof pClient?.apis?.Orders?.cancelOrder === "function") {
            await pClient.apis.Orders.cancelOrder({
                order: {
                    id: Number.isFinite(Number(pOrderId)) ? Number(pOrderId) : pOrderId,
                    product_symbol: pContractName
                }
            });
            const objResponse = await pClient.apis.Orders.placeOrder({
                order: {
                    product_symbol: pContractName,
                    size: pQty,
                    side: pSide,
                    order_type: "limit_order",
                    limit_price: pNextPrice,
                    time_in_force: "gtc",
                    post_only: false,
                    reduce_only: false
                }
            });
            const objPayload = this.readResponsePayload(objResponse);
            return this.getOrderId(objPayload);
        }

        throw new Error("Delta client does not support safe limit-order repricing.");
    }

    private async placeManagedFutureEntryOrder(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pQty: number
    ): Promise<{ entryPrice: number; entryTs: string; orderTypeUsed: "limit_order" | "market_order"; }> {
        const { client } = await this.getDeltaClient(pUserId);
        const vQty = Math.max(1, Math.floor(Number(pQty || 1)));
        const vSide = this.getFutureEntrySide(pConfig);
        let objSnapshot = await this.getMarketSnapshot(pConfig);
        const objOrderPayload: Record<string, unknown> = {
            product_symbol: pConfig.contractName,
            size: vQty,
            side: vSide,
            order_type: pConfig.futureOrderType,
            time_in_force: "gtc",
            post_only: false,
            reduce_only: false
        };

        if (pConfig.futureOrderType !== "limit_order") {
            await client.apis.Orders.placeOrder({
                order: objOrderPayload
            });
            return {
                entryPrice: Number(objSnapshot.futuresPrice || 0),
                entryTs: String(objSnapshot.ts || new Date().toISOString()),
                orderTypeUsed: "market_order"
            };
        }

        objOrderPayload.limit_price = String(objSnapshot.futuresPrice);
        let objResponse = await client.apis.Orders.placeOrder({
            order: objOrderPayload
        });
        let objPayload = this.readResponsePayload(objResponse);
        let vOrderId = this.getOrderId(objPayload);

        for (let vAttempt = 0; vAttempt < gFutureLimitRetryCount; vAttempt += 1) {
            await sleep(gFutureLimitRetryDelayMs);
            const objActiveOrder = await this.findActiveFutureOrderById(client, pConfig.contractName, vOrderId);
            if (!objActiveOrder) {
                return {
                    entryPrice: Number(objSnapshot.futuresPrice || 0),
                    entryTs: String(objSnapshot.ts || new Date().toISOString()),
                    orderTypeUsed: "limit_order"
                };
            }

            const vUnfilledSize = Math.max(0, Math.floor(Number(objActiveOrder.unfilled_size ?? objActiveOrder.size ?? vQty)));
            if (!(vUnfilledSize > 0)) {
                return {
                    entryPrice: Number(objSnapshot.futuresPrice || 0),
                    entryTs: String(objSnapshot.ts || new Date().toISOString()),
                    orderTypeUsed: "limit_order"
                };
            }

            if (vAttempt === (gFutureLimitRetryCount - 1)) {
                break;
            }

            objSnapshot = await this.getMarketSnapshot(pConfig);
            vOrderId = await this.repriceOrReplaceLimitFutureOrder(
                client,
                pConfig.contractName,
                vOrderId,
                vSide,
                vQty,
                String(objSnapshot.futuresPrice)
            );
        }

        const objActiveOrder = await this.findActiveFutureOrderById(client, pConfig.contractName, vOrderId);
        const vRemainingSize = Math.max(0, Math.floor(Number(objActiveOrder?.unfilled_size ?? objActiveOrder?.size ?? vQty)));
        if (objActiveOrder) {
            if (typeof client?.apis?.Orders?.cancelOrder !== "function") {
                throw new Error("Unable to cancel unfilled future limit order safely.");
            }
            await client.apis.Orders.cancelOrder({
                order: {
                    id: Number.isFinite(Number(vOrderId)) ? Number(vOrderId) : vOrderId,
                    product_symbol: pConfig.contractName
                }
            });
        }

        objSnapshot = await this.getMarketSnapshot(pConfig);
        await client.apis.Orders.placeOrder({
            order: {
                product_symbol: pConfig.contractName,
                size: Math.max(1, vRemainingSize || vQty),
                side: vSide,
                order_type: "market_order",
                time_in_force: "gtc",
                post_only: false,
                reduce_only: false
            }
        });
        return {
            entryPrice: Number(objSnapshot.futuresPrice || 0),
            entryTs: String(objSnapshot.ts || new Date().toISOString()),
            orderTypeUsed: "market_order"
        };
    }

    private mapLivePosition(pUserId: string, pRow: DeltaPositionRow, pIndex: number): RollingOptionsStrangleLiveImportedPositionRecord {
        const vNetSize = toFiniteNumber(pRow.net_size ?? pRow.size, 0);
        const vSide = vNetSize < 0 ? "SELL" : "BUY";
        return {
            userId: pUserId,
            importId: String(pRow.product_id ?? pRow.product_symbol ?? pRow.symbol ?? `position-${pIndex}`),
            contractName: String(pRow.product_symbol || pRow.symbol || "Unknown"),
            side: vSide,
            qty: Math.abs(vNetSize),
            entryPrice: toFiniteNumber(pRow.entry_price, 0),
            markPrice: toFiniteNumber(pRow.mark_price, 0),
            entryDelta: null,
            currentDelta: null,
            charges: 0,
            pnl: Number((toFiniteNumber(pRow.realized_pnl, 0) + toFiniteNumber(pRow.unrealized_pnl, 0)).toFixed(2)),
            margin: toFiniteNumber(pRow.margin, 0),
            liquidationPrice: toFiniteNumber(pRow.liquidation_price, 0),
            openedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    private async fetchCurrentDeltaPositions(pUserId: string, pSymbol: string): Promise<RollingOptionsStrangleLiveImportedPositionRecord[]> {
        const { client } = await this.getDeltaClient(pUserId);
        const objResponse = typeof (client.apis?.Positions as { getMarginedPositions?: unknown } | undefined)?.getMarginedPositions === "function"
            ? await (client.apis.Positions as { getMarginedPositions: (pParams: Record<string, unknown>) => Promise<unknown> }).getMarginedPositions({})
            : await (client.apis.Positions as { getPositions: (pParams: Record<string, unknown>) => Promise<unknown> }).getPositions({
                underlying_asset_symbol: pSymbol
            });
        const objPayload = this.readResponsePayload(objResponse);
        const arrRows = Array.isArray(objPayload.result) ? objPayload.result as DeltaPositionRow[] : [];
        return arrRows
            .map((objRow, vIndex) => this.mapLivePosition(pUserId, objRow, vIndex))
            .filter((objRow) => objRow.qty > 0);
    }

    public async reconcileUserPositions(pUserId: string, pSymbol?: string): Promise<RollingOptionsStrangleLiveImportedPositionRecord[]> {
        const objConfig = await this.loadConfig(pUserId);
        const vSymbol = String(pSymbol || objConfig.symbol || "").trim().toUpperCase() || objConfig.symbol;
        const objState = this.getOrCreateState(pUserId);
        const arrSaved = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
        const arrLive = await this.fetchCurrentDeltaPositions(pUserId, vSymbol);
        const objSavedByContract = new Map(arrSaved.map((objRow) => [String(objRow.contractName || "").trim(), objRow]));

        const objLiveByContract = new Map(arrLive.map((objRow) => [String(objRow.contractName || "").trim(), objRow]));
        const vRemovedCount = arrSaved.filter((objRow) => !objLiveByContract.has(String(objRow.contractName || "").trim())).length;
        const vAddedCount = arrLive.filter((objRow) => !objSavedByContract.has(String(objRow.contractName || "").trim())).length;
        const vQtyMismatchCount = arrSaved.reduce((pSum, objRow) => {
            const objLiveRow = objLiveByContract.get(String(objRow.contractName || "").trim()) || null;
            if (!objLiveRow) {
                return pSum;
            }
            const vSavedQty = Math.max(0, Number(objRow.qty || 0));
            const vLiveQty = Math.max(0, Number(objLiveRow.qty || 0));
            const vSavedSide = String(objRow.side || "").trim().toUpperCase();
            const vLiveSide = String(objLiveRow.side || "").trim().toUpperCase();
            if (vSavedSide !== vLiveSide) {
                return pSum + 1;
            }
            if (Number.isFinite(vSavedQty) && Number.isFinite(vLiveQty) && vSavedQty !== vLiveQty) {
                return pSum + 1;
            }
            return pSum;
        }, 0);
        objState.positionMismatchDetected = (vRemovedCount + vAddedCount + vQtyMismatchCount) > 0;

        const arrOptionContracts = arrLive
            .filter((objRow) => isOptionContract(objRow.contractName))
            .map((objRow) => String(objRow.contractName || "").trim())
            .filter(Boolean);
        const objTickerByContract = new Map<string, Awaited<ReturnType<typeof getLiveOptionTicker>>>();
        await Promise.all(arrOptionContracts.map(async (pContractName) => {
            objTickerByContract.set(pContractName, await getLiveOptionTicker(pContractName));
        }));

        const arrReconciled = arrLive.map((objLiveRow): RollingOptionsStrangleLiveImportedPositionRecord => {
            const objSavedRow = objSavedByContract.get(String(objLiveRow.contractName || "").trim()) || null;
            const objTicker = isOptionContract(objLiveRow.contractName)
                ? (objTickerByContract.get(String(objLiveRow.contractName || "").trim()) || null)
                : null;
            const vLiveDelta = objTicker && Number.isFinite(Number(objTicker.delta))
                ? Math.abs(Number(objTicker.delta))
                : null;

            return {
                ...objLiveRow,
                entryDelta: objSavedRow?.entryDelta ?? (vLiveDelta === null ? objLiveRow.entryDelta : vLiveDelta),
                currentDelta: objSavedRow?.currentDelta ?? (vLiveDelta === null ? objLiveRow.currentDelta : vLiveDelta),
                charges: objSavedRow?.charges ?? objLiveRow.charges,
                metadata: objSavedRow?.metadata ?? objLiveRow.metadata,
                openedAt: objSavedRow?.openedAt || objLiveRow.openedAt
            };
        });

        await this.persistImportedPositions(pUserId, arrReconciled);

        if (vRemovedCount > 0 || vAddedCount > 0) {
            await logRollingOptionsStrangleLiveEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "warning",
                title: "Live Positions Reconciled",
                message: [
                    vAddedCount > 0 ? `Added ${vAddedCount} Delta position${vAddedCount === 1 ? "" : "s"} into the saved grid.` : "",
                    vRemovedCount > 0 ? `Removed ${vRemovedCount} saved position${vRemovedCount === 1 ? "" : "s"} that no longer exist on Delta Exchange.` : ""
                ].filter(Boolean).join(" "),
                payload: {
                    symbol: vSymbol,
                    qty: vAddedCount + vRemovedCount,
                    reason: "reconcile_sync_positions"
                }
            });
        }

        return arrReconciled;
    }

    private meetsEntryDeltaRule(
        pAction: "buy" | "sell",
        pDelta: number,
        pTargetDelta: number
    ): boolean {
        const vAbsDelta = Math.abs(Number(pDelta || 0));
        const vTargetDelta = Math.abs(Number(pTargetDelta || 0));
        if (!Number.isFinite(vAbsDelta) || !(vTargetDelta > 0)) {
            return false;
        }

        if (pAction === "sell") {
            return vAbsDelta <= vTargetDelta;
        }
        return vAbsDelta >= vTargetDelta;
    }

    private getRuleValues(
        pConfig: RollingOptionsPtDeConfig,
        pColorCode: "R" | "G"
    ): {
        colorCode: "R" | "G";
        reDelta: number;
        tpMove: number;
        slMove: number;
    } {
        const clamp01 = (pValue: number): number => Math.min(1, Math.max(0, pValue));
        if (pColorCode === "G") {
            return {
                colorCode: "G",
                reDelta: Number(pConfig.greenReDelta ?? pConfig.reDelta ?? 0.53),
                tpMove: clamp01(Number(pConfig.greenTakeProfitPct ?? 0.50) > 1 ? Number(pConfig.greenTakeProfitPct) / 100 : Number(pConfig.greenTakeProfitPct ?? 0.50)),
                slMove: clamp01(Number(pConfig.greenStopLossPct ?? 0.90) > 1 ? Number(pConfig.greenStopLossPct) / 100 : Number(pConfig.greenStopLossPct ?? 0.90))
            };
        }

        return {
            colorCode: "R",
            reDelta: Number(pConfig.redReDelta ?? pConfig.reDelta ?? 0.53),
            tpMove: clamp01(Number(pConfig.redTakeProfitPct ?? 0.50) > 1 ? Number(pConfig.redTakeProfitPct) / 100 : Number(pConfig.redTakeProfitPct ?? 0.50)),
            slMove: clamp01(Number(pConfig.redStopLossPct ?? 0.90) > 1 ? Number(pConfig.redStopLossPct) / 100 : Number(pConfig.redStopLossPct ?? 0.90))
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
        pOpenPositions: RollingOptionsStrangleLiveImportedPositionRecord[],
        pPreviousSpotPrice: number,
        pCurrentSpotPrice: number
    ): Promise<{ triggered: boolean; signal: string; message: string; }> {
        const arrOpenPositions = Array.isArray(pOpenPositions) ? pOpenPositions.filter(Boolean) : [];
        if (arrOpenPositions.length <= 0) {
            return { triggered: false, signal: "", message: "" };
        }

        const vAllLegsKey = "__all_legs__";
        const objProfile = await loadRollingOptionsStrangleLiveProfile(pUserId);
        const objUiState = ((pConfig as RollingOptionsPtDeConfig & { __uiState?: Record<string, unknown>; }).__uiState
            || await this.loadUiState(pUserId)) as Record<string, unknown>;
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
                const vImportId = String((pPosition as any)?.importId || "").trim();
                return arrTriggeredCheckpoints.some((pCheckpoint) => pCheckpoint.legKey === vImportId);
            });
        const arrTargetImportIds = arrTargetPositions
            .map((pPosition) => String((pPosition as any)?.importId || "").trim())
            .filter(Boolean);

        const objNextUiState = {
            ...(objProfile?.uiState || {}),
            ...objUiState,
            payoffSlCheckpointPrices: arrRemainingCheckpoints
                .filter((pCheckpoint) => pCheckpoint.legKey === vAllLegsKey)
                .map((pCheckpoint) => pCheckpoint.price),
            payoffSlCheckpoints: arrRemainingCheckpoints
        } as Record<string, unknown>;
        await saveRollingOptionsStrangleLiveProfile({
            userId: pUserId,
            selectedApiProfileId: String(objProfile?.selectedApiProfileId || ""),
            uiState: objNextUiState,
            connectionStatus: objProfile?.connectionStatus as any,
            updatedAt: objProfile?.updatedAt || ""
        });
        (pConfig as RollingOptionsPtDeConfig & { __uiState?: Record<string, unknown>; }).__uiState = objNextUiState;

        if (arrTargetPositions.length <= 0) {
            return { triggered: false, signal: "", message: "" };
        }

        for (const objPosition of arrTargetPositions) {
            await this.closeImportedPositionOnDelta(pUserId, objPosition);
        }
        const arrRemainingOpenPositions = arrOpenPositions.filter((pPosition) => {
            const vImportId = String((pPosition as any)?.importId || "").trim();
            return !arrTargetImportIds.includes(vImportId);
        });
        await this.persistImportedPositions(pUserId, arrRemainingOpenPositions);
        if (!arrTriggeredCheckpoints.some((pCheckpoint) => pCheckpoint.legKey === vAllLegsKey)) {
            await this.reEnterClosedOptionPositions(pUserId, arrTargetPositions, "Payoff graph exit point");
        }

        const vCheckpointLabel = arrTriggeredCheckpoints
            .map((pCheckpoint) => `${pCheckpoint.legKey === vAllLegsKey ? "All legs" : pCheckpoint.legKey} @ ${pCheckpoint.price.toFixed(2)}`)
            .join(", ");
        await logRollingOptionsStrangleLiveEvent({
            userId: pUserId,
            eventType: "manual_action",
            severity: "warning",
            title: "Payoff Exit Point Triggered",
            message: `Closed ${arrTargetPositions.length} live position(s) after spot crossed payoff exit point(s).`,
            payload: {
                symbol: pConfig.symbol,
                qty: arrTargetPositions.length,
                reason: "payoff_graph_exit_point_triggered",
                previousSpotPrice: pPreviousSpotPrice,
                currentSpotPrice: pCurrentSpotPrice,
                checkpoints: arrTriggeredCheckpoints,
                remainingCheckpoints: arrRemainingCheckpoints,
                targetImportIds: arrTargetImportIds
            }
        });
        return {
            triggered: true,
            signal: "PAYOFF_EXIT_POINT_TRIGGERED",
            message: `Live cycle completed with payoff exit point close at ${vCheckpointLabel}.`
        };
    }

    private computeOptionThresholds(
        pRuleValues: { tpMove: number; slMove: number; },
        pPositionSide: "BUY" | "SELL",
        pEntryDelta: number
    ): { takeProfitDelta: number; stopLossDelta: number; } {
        const clamp01 = (pValue: number): number => Math.min(1, Math.max(0, pValue));
        const vTakeProfitDelta = clamp01(Number(pRuleValues.tpMove || 0));
        const vStopLossDelta = clamp01(Number(pRuleValues.slMove || 0));
        return { takeProfitDelta: vTakeProfitDelta, stopLossDelta: vStopLossDelta };
    }

    private buildOptionMetadata(
        pConfig: RollingOptionsPtDeConfig,
        pColorCode: "R" | "G",
        pReason: string,
        pEntryDelta: number,
        pPositionSide: "BUY" | "SELL"
    ): RollingOptionsStrangleLivePositionMetadata {
        const objRuleValues = this.getRuleValues(pConfig, pColorCode);
        const objThresholds = this.computeOptionThresholds(objRuleValues, pPositionSide, pEntryDelta);
        const vEntryDelta = Math.abs(Number(pEntryDelta || 0.53));
        return {
            ruleColor: objRuleValues.colorCode,
            ruleSet: Number((pConfig as RollingOptionsPtDeConfig & { ruleSet?: number; }).ruleSet) === 2 ? 2 : 1,
            takeProfitDelta: objThresholds.takeProfitDelta,
            stopLossDelta: objThresholds.stopLossDelta,
            reEntryDelta: objRuleValues.reDelta,
            reEnter: Boolean(pConfig.reEnter),
            openedReason: pReason,
            trailBestDelta: vEntryDelta,
            trailSlGap: Number(Math.abs(objThresholds.stopLossDelta - vEntryDelta).toFixed(6)),
            trailTpPeakDelta: vEntryDelta
        };
    }

    private async loadUiState(pUserId: string): Promise<Record<string, unknown>> {
        const objProfile = await loadRollingOptionsStrangleLiveProfile(pUserId);
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
            reEnter1: false,
            redOptQty: 1,
            reRedDelta: 0.53,
            redTpPct: 0.50,
            redSlPct: 0.90,
            greenOptQty: 1,
            greenReDelta: 0.53,
            greenTpPct: 0.50,
            greenSlPct: 0.90,
            trailGreenTp1Enabled: true,
            trailGreenSl1Enabled: true,
            trailRedTp1Enabled: true,
            trailRedSl1Enabled: true,
            addOneLotFuture: false,
            renkoFeedEnabled: true,
            renkoFeedPts: 10,
            renkoFeedPriceSrc: "mark_price",
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
            trailGreenTp2Enabled: true,
            trailGreenSl2Enabled: true,
            trailRedTp2Enabled: true,
            trailRedSl2Enabled: true,
            closeAllLegsOnAnyClose: false,
            skipRenkoEntryNoOpenOptions: false,
            ...(objProfile?.uiState || {})
        } as Record<string, unknown>;
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
            objState.reRedDelta = (pUiState as any).redReDelta2;
            objState.redTpPct = (pUiState as any).redTpPct2;
            objState.redSlPct = (pUiState as any).redSlPct2;
        }

        const objConfig = buildConfigFromUiState(objState);
        (objConfig as RollingOptionsPtDeConfig & { futuresEnabled?: boolean; ruleSet?: number; }).futuresEnabled = Boolean((pUiState as any).futuresEnabled ?? true);
        (objConfig as RollingOptionsPtDeConfig & { futuresEnabled?: boolean; ruleSet?: number; }).ruleSet = pRuleSet;
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
            manualCloseBlocksOptionEntry: false,
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
        const vUserId = String(pUserId || "").trim();
        let objState = this.stateByUserId.get(vUserId);
        if (!objState) {
            objState = this.createInitialState(vUserId);
            this.stateByUserId.set(vUserId, objState);
        }
        return objState;
    }

    public async hydrate(): Promise<void> {
        const arrRuntimeRows = await listRollingOptionsStrangleLiveRuntime();
        for (const objRuntime of arrRuntimeRows) {
            if (!objRuntime.autoTraderEnabled || objRuntime.status !== "running") {
                continue;
            }

            const objState = this.getOrCreateState(objRuntime.userId);
            objState.running = true;
            objState.cycleCount = Number(objRuntime.state?.cycleCount || 0);
            objState.consecutiveFailures = Number(objRuntime.state?.consecutiveFailures || 0);
            objState.lastError = String(objRuntime.lastError || "");
            objState.lastCycleAt = objRuntime.lastCycleAt || null;
            objState.renko.anchor = Number.isFinite(Number(objRuntime.state?.renkoAnchor))
                ? Number(objRuntime.state?.renkoAnchor)
                : null;
            objState.renko.lastDir = Number(objRuntime.state?.renkoLastDir || 0) as -1 | 0 | 1;
            objState.renko.lastColor = String(objRuntime.state?.renkoLastColor || "") as "" | "R" | "G";
            objState.market.lastSpotPrice = objRuntime.lastSpotPrice;
            objState.market.lastFuturesPrice = objRuntime.lastFuturesPrice;
            objState.market.lastSource = String(objRuntime.state?.marketSource || "public") === "simulated" ? "simulated" : "public";
            const objConfig = await this.loadConfig(objRuntime.userId);
            this.armTimer(objState, objConfig.loopSeconds);
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
        const objConfig = this.buildRuleSetConfig(objUiState, 1);
        (objConfig as RollingOptionsPtDeConfig & { __uiState?: Record<string, unknown>; }).__uiState = objUiState;
        return objConfig;
    }

    private async getMarketSnapshot(pConfig: RollingOptionsPtDeConfig): Promise<RollingOptionsPtDeMarketSnapshot> {
        return getLiveMarketSnapshot(pConfig);
    }

    private async refreshImportedPositions(
        pConfig: RollingOptionsPtDeConfig,
        pSnapshot: RollingOptionsPtDeMarketSnapshot,
        pPositions: RollingOptionsStrangleLiveImportedPositionRecord[]
    ): Promise<EnrichedImportedPosition[]> {
        const arrOptionContracts = pPositions
            .filter((objPosition) => isOptionContract(objPosition.contractName))
            .map((objPosition) => String(objPosition.contractName || "").trim())
            .filter(Boolean);
        const objTickerByContract = new Map<string, Awaited<ReturnType<typeof getLiveOptionTicker>>>();
        await Promise.all(arrOptionContracts.map(async (pContractName) => {
            objTickerByContract.set(pContractName, await getLiveOptionTicker(pContractName));
        }));

        const arrEnriched: EnrichedImportedPosition[] = [];
        for (const objPosition of pPositions) {
            const bIsOption = isOptionContract(objPosition.contractName);
            if (!bIsOption) {
                const vMarkPrice = pSnapshot.futuresPrice;
                arrEnriched.push({
                    ...objPosition,
                    markPrice: vMarkPrice,
                    pnl: calculateImportedPnl(objPosition, vMarkPrice),
                    updatedAt: new Date().toISOString(),
                    currentDelta: null,
                    isOption: false
                });
                continue;
            }

            const objTicker = objTickerByContract.get(String(objPosition.contractName || "").trim()) || null;
            const bHasLiveMark = Number.isFinite(Number(objTicker?.markPrice));
            const vMarkPrice = bHasLiveMark
                ? Number(objTicker?.markPrice || 0)
                : Number(objPosition.markPrice || objPosition.entryPrice || 0);
            const vCurrentDelta = objTicker?.delta === null || objTicker?.delta === undefined
                ? null
                : Math.abs(Number(objTicker.delta));
            arrEnriched.push({
                ...objPosition,
                markPrice: vMarkPrice,
                entryDelta: objPosition.entryDelta ?? (Number.isFinite(Number(vCurrentDelta)) ? Number(vCurrentDelta) : null),
                pnl: bHasLiveMark ? calculateImportedPnl(objPosition, vMarkPrice) : Number(objPosition.pnl || 0),
                updatedAt: new Date().toISOString(),
                currentDelta: Number.isFinite(Number(vCurrentDelta)) ? Number(vCurrentDelta) : null,
                isOption: true
            });
        }
        return arrEnriched;
    }

    private async appendImportedPosition(
        pUserId: string,
        pPosition: RollingOptionsStrangleLiveImportedPositionRecord
    ): Promise<void> {
        const arrExisting = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
        await this.persistImportedPositions(pUserId, [...arrExisting, pPosition]);
    }

    private getFutureEntrySide(pConfig: RollingOptionsPtDeConfig): "buy" | "sell" {
        return pConfig.action === "sell" ? "buy" : "sell";
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
        pConfig: RollingOptionsPtDeConfig,
        pColorCode: "R" | "G",
        pFutureQtyForLegacyPct: number
    ): number {
        const vColorCode: "R" | "G" = pColorCode === "G" ? "G" : "R";
        const vExplicitQty = vColorCode === "G"
            ? Number(pConfig.greenOptionQty)
            : Number(pConfig.redOptionQty);
        if (Number.isFinite(vExplicitQty)) {
            return Math.max(0, Math.floor(vExplicitQty));
        }

        const vPct = vColorCode === "G"
            ? Number(pConfig.greenOptionQtyPct)
            : Number(pConfig.redOptionQtyPct);
        return this.getRenkoOptionQty(pFutureQtyForLegacyPct, vPct);
    }

    private async openGreenRenkoFutureEntry(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pPositions: RollingOptionsStrangleLiveImportedPositionRecord[],
        pReason: string
    ): Promise<number> {
        const bFuturesEnabled = Boolean((pConfig as RollingOptionsPtDeConfig & { futuresEnabled?: boolean; }).futuresEnabled ?? true);
        if (!bFuturesEnabled) {
            return 0;
        }
        const arrFutures = pPositions.filter((objRow) => !isOptionContract(objRow.contractName));
        const arrOptions = pPositions.filter((objRow) => isOptionContract(objRow.contractName));

        if (arrOptions.length > 0 || arrFutures.length > 0) {
            return 0;
        }

        await this.openInitialFutureEntry(
            pUserId,
            pConfig,
            Math.max(1, Math.floor(Number(pConfig.futureQty || 1))),
            pReason
        );
        return Math.max(1, Math.floor(Number(pConfig.futureQty || 1)));
    }

    private async openInitialFutureEntry(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pQty: number,
        pReason: string
    ): Promise<RollingOptionsStrangleLiveImportedPositionRecord> {
        const vQty = Math.max(1, Math.floor(Number(pQty || 1)));
        const vSide = this.getFutureEntrySide(pConfig);
        const objPlacedOrder = await this.placeManagedFutureEntryOrder(pUserId, pConfig, vQty);

        const objTrackedPosition: RollingOptionsStrangleLiveImportedPositionRecord = {
            userId: pUserId,
            importId: crypto.randomUUID(),
            contractName: pConfig.contractName,
            side: vSide.toUpperCase(),
            qty: vQty,
            entryPrice: Number(objPlacedOrder.entryPrice || 0),
            markPrice: Number(objPlacedOrder.entryPrice || 0),
            entryDelta: null,
            currentDelta: null,
            charges: 0,
            pnl: 0,
            margin: 0,
            liquidationPrice: 0,
            openedAt: objPlacedOrder.entryTs,
            updatedAt: objPlacedOrder.entryTs
        };
        await this.appendImportedPosition(pUserId, objTrackedPosition);
        await logRollingOptionsStrangleLiveEvent({
            userId: pUserId,
            eventType: pReason === "SL add one future" ? "extra_future_added" : "future_opened",
            severity: pReason === "SL add one future" ? "warning" : "success",
            title: pReason === "SL add one future" ? "Extra Future Added" : "Future Opened",
            message: `${objTrackedPosition.side} future live order placed from the server runner.`,
            payload: {
                symbol: pConfig.symbol,
                contractName: pConfig.contractName,
                qty: objTrackedPosition.qty,
                reason: pReason,
                orderType: objPlacedOrder.orderTypeUsed
            }
        });
        return objTrackedPosition;
    }

    private async openFutureAddition(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pSnapshot: RollingOptionsPtDeMarketSnapshot
    ): Promise<void> {
        const vExistingFutureQty = (await listRollingOptionsStrangleLiveImportedPositions(pUserId))
            .filter((objRow) => !isOptionContract(objRow.contractName))
            .reduce((pSum, objRow) => pSum + Math.max(0, Number(objRow.qty || 0)), 0);
        if (vExistingFutureQty > 0) {
            return;
        }

        const { client } = await this.getDeltaClient(pUserId);
        const vSide = pConfig.action === "sell" ? "buy" : "sell";
        await client.apis.Orders.placeOrder({
            order: {
                product_symbol: pConfig.contractName,
                size: 1,
                side: vSide,
                order_type: "market_order",
                time_in_force: "gtc",
                post_only: false,
                reduce_only: false
            }
        });

        await this.appendImportedPosition(pUserId, {
            userId: pUserId,
            importId: crypto.randomUUID(),
            contractName: pConfig.contractName,
            side: vSide.toUpperCase(),
            qty: 1,
            entryPrice: Number(pSnapshot.futuresPrice || 0),
            markPrice: Number(pSnapshot.futuresPrice || 0),
            entryDelta: null,
            currentDelta: null,
            charges: 0,
            pnl: 0,
            margin: 0,
            liquidationPrice: 0,
            openedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        await logRollingOptionsStrangleLiveEvent({
            userId: pUserId,
            eventType: "extra_future_added",
            severity: "warning",
            title: "Extra Future Added",
            message: "Added one more future lot after SL as configured.",
            payload: {
                symbol: pConfig.symbol,
                contractName: pConfig.contractName,
                qty: 1,
                reason: "sl_add_one_future"
            }
        });
    }

    private getOptionEntryPriceForAction(
        pQuote: { markPrice?: number; bestBid?: number | null; bestAsk?: number | null; },
        pAction: string
    ): number {
        const vAction = String(pAction || "").trim().toLowerCase();
        const vBid = Number(pQuote.bestBid);
        const vAsk = Number(pQuote.bestAsk);
        const vFallback = Number(pQuote.markPrice || 0);
        if (vAction === "sell" && Number.isFinite(vBid) && vBid > 0) {
            return vBid;
        }
        if (vAction === "buy" && Number.isFinite(vAsk) && vAsk > 0) {
            return vAsk;
        }
        return vFallback;
    }

    private async openOptionEntries(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pQty: number,
        pTargetDelta: number,
        pReason: string,
        pColorCode: "R" | "G" = "R",
        pUseReEntryDelta = false,
        pRuleSet: 1 | 2 = 1,
        pAllowedOptionSides?: Array<"CE" | "PE">
    ): Promise<RollingOptionsStrangleLiveImportedPositionRecord[]> {
        if (!(Number(pQty) > 0)) {
            return [];
        }

        const { client } = await this.getDeltaClient(pUserId);
        const vPositionSide = pConfig.action === "buy" ? "BUY" : "SELL";
        const arrOptionSides: Array<"CE" | "PE"> = (Array.isArray(pAllowedOptionSides) && pAllowedOptionSides.length > 0)
            ? pAllowedOptionSides
            : (pConfig.legSide === "both"
                ? ["CE", "PE"]
                : [pConfig.legSide === "pe" ? "PE" : "CE"]);
        const arrCreated: RollingOptionsStrangleLiveImportedPositionRecord[] = [];
        const objRuleValues = this.getRuleValues(pConfig, pColorCode);
        const arrResolvedEntries: Array<{
            contractSymbol: string;
            markPrice: number;
            entryPrice: number;
            bestBid: number | null;
            bestAsk: number | null;
            delta: number;
            metadata: RollingOptionsStrangleLivePositionMetadata;
        }> = [];

        for (const vOptionSide of arrOptionSides) {
            const objContract = await findBestLiveOptionContract(
                pConfig,
                vOptionSide,
                pTargetDelta,
                false,
                pUseReEntryDelta ? RE_DELTA_TOLERANCE : undefined
            );
            if (!objContract?.contractSymbol) {
                return [];
            }
            const vEntryDelta = Number.isFinite(Number(objContract.delta)) ? Math.abs(Number(objContract.delta)) : 0.53;
            const objThresholds = this.computeOptionThresholds(objRuleValues, vPositionSide, vEntryDelta);
            if (shouldTriggerImportedOption(vPositionSide, Math.abs(objContract.delta), objThresholds.takeProfitDelta, objThresholds.stopLossDelta).shouldAct) {
                continue;
            }

            arrResolvedEntries.push({
                contractSymbol: objContract.contractSymbol,
                markPrice: Number(objContract.markPrice || 0),
                entryPrice: this.getOptionEntryPriceForAction(objContract, pConfig.action),
                bestBid: objContract.bestBid,
                bestAsk: objContract.bestAsk,
                delta: Number.isFinite(Number(objContract.delta)) ? Math.abs(Number(objContract.delta)) : 0.53,
                metadata: {
                    ...this.buildOptionMetadata(pConfig, pColorCode, pReason, vEntryDelta, vPositionSide),
                    ruleSet: pRuleSet,
                    productMarkPrice: Number(objContract.markPrice || 0),
                    productBestBid: objContract.bestBid,
                    productBestAsk: objContract.bestAsk
                }
            });
        }

        for (const objEntry of arrResolvedEntries) {
            await client.apis.Orders.placeOrder({
                order: {
                    product_symbol: objEntry.contractSymbol,
                    size: pQty,
                    side: pConfig.action,
                    order_type: "market_order",
                    time_in_force: "gtc",
                    post_only: false,
                    reduce_only: false
                }
            });

            arrCreated.push({
                userId: pUserId,
                importId: crypto.randomUUID(),
                contractName: objEntry.contractSymbol,
                side: vPositionSide,
                qty: pQty,
                entryPrice: objEntry.entryPrice,
                markPrice: objEntry.markPrice,
                entryDelta: objEntry.delta,
                currentDelta: objEntry.delta,
                charges: 0,
                pnl: 0,
                margin: 0,
                liquidationPrice: 0,
                metadata: objEntry.metadata,
                openedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        if (arrCreated.length > 0) {
            const arrExisting = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
            await this.persistImportedPositions(pUserId, [...arrExisting, ...arrCreated]);
            await logRollingOptionsStrangleLiveEvent({
                userId: pUserId,
                eventType: pReason.toLowerCase().includes("replacement") || pReason.toLowerCase().includes("re-entry") ? "reentry_opened" : "option_opened",
                severity: "success",
                title: pReason.toLowerCase().includes("replacement") || pReason.toLowerCase().includes("re-entry") ? "Replacement Option Opened" : "Option Opened",
                message: `Opened ${arrCreated.length} live option leg${arrCreated.length === 1 ? "" : "s"} from the server runner.`,
                payload: {
                    symbol: pConfig.symbol,
                    qty: pQty,
                    reason: pReason
                }
            });
        }

        return arrCreated;
    }

    private async handleRenkoOptionEntry(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pPositions: RollingOptionsStrangleLiveImportedPositionRecord[],
        pColorCode: "R" | "G"
    ): Promise<number> {
        const objState = this.getOrCreateState(pUserId);
        const bFuturesEnabled = Boolean((pConfig as RollingOptionsPtDeConfig & { futuresEnabled?: boolean; }).futuresEnabled ?? true);
        if (pColorCode === "R" && objState.manualCloseBlocksOptionEntry) {
            return 0;
        }
        if (pColorCode === "G") {
            await this.openGreenRenkoFutureEntry(
                pUserId,
                pConfig,
                pPositions,
                "Renko GREEN future entry"
            );
        }

        const objUiState = ((pConfig as RollingOptionsPtDeConfig & { __uiState?: Record<string, unknown>; }).__uiState || await this.loadUiState(pUserId)) as Record<string, unknown>;
        const objConfig1 = this.buildRuleSetConfig(objUiState, 1);
        const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
        const bAction1Enabled = String(objUiState.action1 || "sell").trim().toLowerCase() !== "none";
        const bAction2Enabled = String(objUiState.action2 || "none").trim().toLowerCase() !== "none";
        const arrFutures = pPositions.filter((objRow) => !isOptionContract(objRow.contractName));
        const arrOpenOptions = pPositions.filter((objRow) => isOptionContract(objRow.contractName));
        const arrOpenOptions1 = arrOpenOptions.filter((objRow) => Number(objRow.metadata?.ruleSet) !== 2);
        const arrOpenOptions2 = arrOpenOptions.filter((objRow) => Number(objRow.metadata?.ruleSet) === 2);
        const bSkipRenkoEntryNoOpenOptions = Boolean((objUiState as any).skipRenkoEntryNoOpenOptions);

        if (bSkipRenkoEntryNoOpenOptions && arrOpenOptions.length <= 0) {
            return 0;
        }

        if (bFuturesEnabled && arrFutures.length <= 0) {
            return 0;
        }

        const vTotalFutureQty = arrFutures.reduce((pSum, objRow) => pSum + Math.max(0, Number(objRow.qty || 0)), 0);
        const readRuleSetQty = (pRuleSet: 1 | 2): number => {
            if (pRuleSet !== 2) {
                return 0;
            }
            const vRaw = pColorCode === "G"
                ? Number((objUiState as any).greenOptQty2)
                : Number((objUiState as any).redOptQty2);
            return Number.isFinite(vRaw) ? Math.max(0, Math.floor(vRaw)) : 0;
        };
        const computeQty = (pRuleConfig: RollingOptionsPtDeConfig, pRuleSet: 1 | 2): number => {
            if (pRuleSet === 2) {
                return readRuleSetQty(2);
            }
            const vBaseQty = bFuturesEnabled
                ? vTotalFutureQty
                : Math.max(1, Math.floor(Number(pRuleConfig.futureQty || 1)));
            return this.getConfiguredOptionQty(pRuleConfig, pColorCode, vBaseQty);
        };

        let vOpenedCount = 0;
        if (bAction1Enabled && arrOpenOptions1.length === 0) {
            const vOptionQty1 = computeQty(objConfig1, 1);
            if (vOptionQty1 > 0) {
                const objRuleValues1 = this.getRuleValues(objConfig1, pColorCode);
                const arrCreated1 = await this.openOptionEntries(
                    pUserId,
                    objConfig1,
                    vOptionQty1,
                    objRuleValues1.reDelta,
                    pColorCode === "R" ? "Renko RED option entry (Action 1)" : "Renko GREEN option entry (Action 1)",
                    pColorCode,
                    true,
                    1
                );
                vOpenedCount += arrCreated1.length;
            }
        }
        if (bAction2Enabled && arrOpenOptions2.length === 0) {
            const vOptionQty2 = computeQty(objConfig2, 2);
            if (vOptionQty2 > 0) {
                const objRuleValues2 = this.getRuleValues(objConfig2, pColorCode);
                const arrCreated2 = await this.openOptionEntries(
                    pUserId,
                    objConfig2,
                    vOptionQty2,
                    objRuleValues2.reDelta,
                    pColorCode === "R" ? "Renko RED option entry (Action 2)" : "Renko GREEN option entry (Action 2)",
                    pColorCode,
                    true,
                    2
                );
                vOpenedCount += arrCreated2.length;
            }
        }
        return vOpenedCount;
    }

    private async closeImportedPositionOnDelta(
        pUserId: string,
        pPosition: RollingOptionsStrangleLiveImportedPositionRecord
    ): Promise<void> {
        const { client } = await this.getDeltaClient(pUserId);
        await client.apis.Orders.placeOrder({
            order: {
                product_symbol: pPosition.contractName,
                size: Math.max(1, Math.floor(Number(pPosition.qty || 0))),
                side: String(pPosition.side || "").trim().toUpperCase() === "BUY" ? "sell" : "buy",
                order_type: "market_order",
                time_in_force: "gtc",
                post_only: false,
                reduce_only: true
            }
        });
    }

    public async reEnterClosedOptionPositions(
        pUserId: string,
        pClosedPositions: RollingOptionsStrangleLiveImportedPositionRecord[],
        pReason: string
    ): Promise<RollingOptionsStrangleLiveImportedPositionRecord[]> {
        const arrClosedOptions = (Array.isArray(pClosedPositions) ? pClosedPositions : [])
            .filter((objPosition) => isOptionContract(objPosition?.contractName || ""))
            .filter((objPosition) => !isNegativePnlAdjustmentPosition(objPosition));
        if (arrClosedOptions.length <= 0 || Boolean(this.getOrCreateState(pUserId).positionMismatchDetected)) {
            return [];
        }

        const objProfile = await loadRollingOptionsStrangleLiveProfile(pUserId);
        const objUiState = getMergedLiveUiState(objProfile);
        const objConfig1 = this.buildRuleSetConfig(objUiState, 1);
        const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
        const bFuturesEnabled = Boolean((objConfig1 as RollingOptionsPtDeConfig & { futuresEnabled?: boolean; }).futuresEnabled ?? true);
        const vCurrentRenkoColor = String(this.getOrCreateState(pUserId).renko.lastColor || "").trim().toUpperCase();
        const arrCreatedPositions: RollingOptionsStrangleLiveImportedPositionRecord[] = [];
        const objSnapshot = await getLiveMarketSnapshot(objConfig1);
        const vLotSize = getLotSizeForSymbol(objConfig1.symbol);
        const vNow = objSnapshot.ts;

        for (const objClosedOption of arrClosedOptions) {
            const vRuleSet: 1 | 2 = Number(objClosedOption.metadata?.ruleSet) === 2 ? 2 : 1;
            const vStoredRuleColor = String(objClosedOption.metadata?.ruleColor || "").trim().toUpperCase();
            const vActiveRuleColor: "R" | "G" = objConfig1.renkoEnabled
                ? (vCurrentRenkoColor === "G" ? "G" : "R")
                : (vStoredRuleColor === "G" ? "G" : "R");
            const vOptionSide: "CE" | "PE" = String(objClosedOption.contractName || "").trim().toUpperCase().startsWith("P-") ? "PE" : "CE";
            const arrCurrentPositions = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
            const bSameLegAlreadyOpen = arrCurrentPositions.some((objRow) => {
                return isOptionContract(objRow.contractName)
                    && !isNegativePnlAdjustmentPosition(objRow)
                    && Number(objRow.metadata?.ruleSet) === vRuleSet
                    && (String(objRow.contractName || "").trim().toUpperCase().startsWith("P-") ? "PE" : "CE") === vOptionSide;
            });
            if (bSameLegAlreadyOpen) {
                continue;
            }

            // Use Action 3 settings for replacement legs
            const vReEntryQty = Math.max(0, Math.floor(normalizeLiveNumber((objUiState as any).negativePnlHedgeQty, 1)));
            if (!(vReEntryQty > 0)) {
                continue;
            }

            const vAction: "buy" | "sell" = String((objUiState as any).negativePnlAction3 || "buy").trim().toLowerCase() === "sell"
                ? "sell"
                : "buy";
            const vTargetDelta = Math.max(0, normalizeLiveNumber((objUiState as any).negativePnlHedgeDelta, 0.53));
            const vExpiryMode = String((objUiState as any).negativePnlHedgeExpiryMode || "1").trim() || "1";
            const vExpiryDate = String(objUiState.expiryDate1 || "").trim();

            const objQuoteUiState = {
                ...objUiState,
                expiryMode1: vExpiryMode === "source" ? String((objClosedOption.metadata as any)?.expiryMode || objUiState.expiryMode1 || "1") : vExpiryMode,
                expiryDate1: vExpiryMode === "source"
                    ? (vExpiryDate || String((objClosedOption.metadata as any)?.expiryDate || objUiState.expiryDate1 || ""))
                    : vExpiryDate
            };
            const objQuote = await getLiveOrFallbackOptionQuote(objQuoteUiState, vOptionSide, vTargetDelta, RE_DELTA_TOLERANCE);
            if (!objQuote.contractSymbol) {
                continue;
            }
            const vEntryPrice = this.getOptionEntryPriceForAction(objQuote, vAction);
            const vEntryDelta = Number.isFinite(Number(objQuote.entryDelta)) ? Math.abs(Number(objQuote.entryDelta)) : vTargetDelta;
            const vConfiguredTpPct = Math.min(100, Math.max(0, normalizeLiveNumber((objUiState as any).negativePnlTpPct, 15)));
            const vConfiguredSlPct = Math.min(100, Math.max(0, normalizeLiveNumber((objUiState as any).negativePnlSlPct, 85)));
            const objDeltaTargets = getLiveOptionDeltaTargetsFromPct(vEntryDelta, vAction.toUpperCase(), vConfiguredTpPct, vConfiguredSlPct);
            const vTakeProfitDelta = objDeltaTargets.takeProfitDelta;
            const vStopLossDelta = objDeltaTargets.stopLossDelta;

            // Place the actual order
            const { client } = await this.getDeltaClient(pUserId);
            await client.apis.Orders.placeOrder({
                order: {
                    product_symbol: objQuote.contractSymbol,
                    size: vReEntryQty,
                    side: vAction,
                    order_type: "market_order",
                    time_in_force: "gtc",
                    post_only: false,
                    reduce_only: false
                }
            });

            const objPosition: RollingOptionsStrangleLiveImportedPositionRecord = {
                ...createPositionBase(pUserId),
                contractName: objQuote.contractSymbol,
                side: vAction.toUpperCase() as "BUY" | "SELL",
                qty: vReEntryQty,
                entryPrice: vEntryPrice,
                markPrice: objQuote.markPrice,
                entryDelta: vEntryDelta,
                currentDelta: vEntryDelta,
                metadata: {
                    ...(objQuote.metadata || {}),
                    takeProfitDelta: vTakeProfitDelta,
                    stopLossDelta: vStopLossDelta,
                    reEntryDelta: vTargetDelta,
                    reEnter: false,
                    ruleColor: vOptionSide === "PE" ? "R" : "G",
                    ruleSet: vRuleSet,
                    openedReason: `${pReason} replacement option`,
                    productMarkPrice: objQuote.markPrice,
                    productBestBid: objQuote.bestBid,
                    productBestAsk: objQuote.bestAsk,
                    expiryMode: vExpiryMode,
                    requestedExpiryDate: vExpiryDate,
                    resolvedExpiryDate: objQuote.expiryDate,
                    usedNextDayFallback: objQuote.usedNextDayFallback
                }
            } as RollingOptionsStrangleLiveImportedPositionRecord;

            // Persist the position
            const arrExisting = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
            const arrNewPositions = [...arrExisting, objPosition];
            await this.persistImportedPositions(pUserId, arrNewPositions);

            // Log the event
            await logRollingOptionsStrangleLiveEvent({
                userId: pUserId,
                eventType: "reentry_opened",
                severity: "success",
                title: "Replacement Option Opened",
                message: `Opened replacement live option leg from the server runner using Action 3 settings.`,
                payload: {
                    symbol: objConfig1.symbol,
                    qty: vReEntryQty,
                    reason: `${pReason} replacement option`
                }
            });

            arrCreatedPositions.push(objPosition);
        }

        await this.closeOrphanReplacementOptionPositions(pUserId);
        return arrCreatedPositions;
    }

    private isReplacementOptionPosition(pPosition: RollingOptionsStrangleLiveImportedPositionRecord): boolean {
        if (!isOptionContract(pPosition.contractName)) {
            return false;
        }
        const objMeta = pPosition.metadata || {};
        const vReason = `${objMeta.openedReason || ""} ${objMeta.reason || ""}`.toLowerCase();
        return vReason.includes("replacement") || vReason.includes("re-entry") || vReason.includes("reentry");
    }

    private async closeOrphanReplacementOptionPositions(pUserId: string): Promise<RollingOptionsStrangleLiveImportedPositionRecord[]> {
        const arrOpenPositions = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
        const arrReplacementOptions = arrOpenPositions.filter((objPosition) => this.isReplacementOptionPosition(objPosition));
        if (arrReplacementOptions.length <= 0 || arrOpenPositions.some((objPosition) => !this.isReplacementOptionPosition(objPosition))) {
            return [];
        }

        for (const objReplacement of arrReplacementOptions) {
            await this.closeImportedPositionOnDelta(pUserId, objReplacement);
        }
        await this.persistImportedPositions(pUserId, []);
        await logRollingOptionsStrangleLiveEvent({
            userId: pUserId,
            eventType: "option_closed",
            severity: "warning",
            title: "Replacement Option Closed",
            message: `Closed ${arrReplacementOptions.length} replacement live option leg${arrReplacementOptions.length === 1 ? "" : "s"} because all other legs are closed.`,
            payload: {
                qty: arrReplacementOptions.length,
                reason: "orphan_replacement_option_closed"
            }
        });
        return arrReplacementOptions;
    }

    private async handleOptionTrigger(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pPosition: EnrichedImportedPosition,
        pReason: "sl" | "tp",
        pSnapshot: RollingOptionsPtDeMarketSnapshot
    ): Promise<void> {
        const objUiState = ((pConfig as RollingOptionsPtDeConfig & { __uiState?: Record<string, unknown>; }).__uiState || await this.loadUiState(pUserId)) as Record<string, unknown>;
        const objConfig1 = this.buildRuleSetConfig(objUiState, 1);
        const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
        const vTriggeredRuleSet: 1 | 2 = Number(pPosition.metadata?.ruleSet) === 2 ? 2 : 1;
        const objTriggeredConfig = vTriggeredRuleSet === 2 ? objConfig2 : objConfig1;
        const bFuturesEnabled = Boolean((objConfig1 as RollingOptionsPtDeConfig & { futuresEnabled?: boolean; }).futuresEnabled ?? true);
        await this.closeImportedPositionOnDelta(pUserId, pPosition);
        const arrRemaining = (await listRollingOptionsStrangleLiveImportedPositions(pUserId))
            .filter((objRow) => objRow.importId !== pPosition.importId);
        await this.persistImportedPositions(pUserId, arrRemaining);
        await logRollingOptionsStrangleLiveEvent({
            userId: pUserId,
            eventType: pReason === "sl" ? "sl_triggered" : "tp_triggered",
            severity: pReason === "sl" ? "warning" : "info",
            title: pReason === "sl" ? "SL Triggered" : "TP Triggered",
            message: `Closed live position ${pPosition.contractName} from the server runner.`,
            payload: {
                symbol: objTriggeredConfig.symbol,
                contractName: pPosition.contractName,
                qty: pPosition.qty,
                reason: pReason,
                ruleSet: vTriggeredRuleSet
            }
        });

        if (Boolean(this.getOrCreateState(pUserId).positionMismatchDetected)) {
            return;
        }

        if (Boolean((objUiState as any).closeAllLegsOnAnyClose) && !isNegativePnlAdjustmentPosition(pPosition) && Number(pPosition.pnl || 0) < 0) {
            const arrCloseAllTargets = arrRemaining.filter((objPosition) => !isNegativePnlAdjustmentPosition(objPosition));
            const arrProtectedPositions = arrRemaining.filter(isNegativePnlAdjustmentPosition);
            const arrClosedPositions = [pPosition, ...arrCloseAllTargets];
            for (const objRemainingPosition of arrCloseAllTargets) {
                await this.closeImportedPositionOnDelta(pUserId, objRemainingPosition);
            }
            await this.persistImportedPositions(pUserId, arrProtectedPositions);
            await logRollingOptionsStrangleLiveEvent({
                userId: pUserId,
                eventType: "manual_action",
                severity: "warning",
                title: "Close All Legs Triggered",
                message: "Closed all remaining live legs because Close all on negative options is enabled.",
                payload: {
                    symbol: objTriggeredConfig.symbol,
                    qty: arrCloseAllTargets.length,
                    reason: "close_all_legs_on_negative_option"
                }
            });
            await this.reEnterClosedOptionPositions(pUserId, arrClosedPositions, `${pReason === "sl" ? "SL" : "TP"} close all`);
            return;
        }

        const vCurrentRenkoColor = String(this.getOrCreateState(pUserId).renko.lastColor || "").trim().toUpperCase();
        const vStoredRuleColor = String(pPosition.metadata?.ruleColor || "").trim().toUpperCase();
        const vActiveRuleColor: "R" | "G" = objConfig1.renkoEnabled
            ? (vCurrentRenkoColor === "G" ? "G" : "R")
            : (vStoredRuleColor === "G" ? "G" : "R");
        let arrNextPositions = arrRemaining;

        if (bFuturesEnabled && vActiveRuleColor === "R" && pReason === "sl" && objConfig1.addOneLotFuture) {
            await this.openFutureAddition(pUserId, objConfig1, pSnapshot);
            arrNextPositions = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
        }

        await this.reEnterClosedOptionPositions(pUserId, [pPosition], pReason === "sl" ? "SL" : "TP");
    }

    private async buildRuntimeRecord(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState,
        pOverrides: Partial<RollingOptionsStrangleLiveRuntimeRecord> = {}
    ): Promise<RollingOptionsStrangleLiveRuntimeRecord> {
        const arrImported = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
        const arrWatchedSymbols = getLiveTickerSymbolsForOwner(this.getTickerOwnerId(pUserId));
        const objFeedStats = getLiveTickerFeedStats();
        const vLastSignal = pOverrides.lastSignal
            || (pState.renko.lastColor === "R" ? "RED" : (pState.renko.lastColor === "G" ? "GREEN" : "IDLE"));
        return {
            userId: pUserId,
            status: pOverrides.status || (pState.running ? "running" : "stopped"),
            autoTraderEnabled: pOverrides.autoTraderEnabled ?? pState.running,
            selectedApiProfileId: pOverrides.selectedApiProfileId || String((await loadRollingOptionsStrangleLiveProfile(pUserId))?.selectedApiProfileId || ""),
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
                marketSource: pState.market.lastSource,
                marketDataOwnerId: this.getTickerOwnerId(pUserId),
                marketDataConnectionState: objFeedStats.connectionState,
                marketDataOwnerCount: objFeedStats.ownerCount,
                marketDataDesiredSymbolCount: objFeedStats.desiredSymbolCount,
                marketDataCachedTickerCount: objFeedStats.cachedTickerCount,
                marketDataWatchedSymbols: arrWatchedSymbols,
                importedOpenPositions: arrImported.length,
                importedOptionPositions: arrImported.filter((objRow) => String(objRow.contractName || "").toUpperCase().startsWith("C-") || String(objRow.contractName || "").toUpperCase().startsWith("P-")).length,
                importedFuturePositions: arrImported.filter((objRow) => !(String(objRow.contractName || "").toUpperCase().startsWith("C-") || String(objRow.contractName || "").toUpperCase().startsWith("P-"))).length
            },
            updatedAt: ""
        };
    }

    private async syncRuntime(
        pUserId: string,
        pConfig: RollingOptionsPtDeConfig,
        pState: RollingOptionsPtDeEngineState,
        pOverrides: Partial<RollingOptionsStrangleLiveRuntimeRecord> = {}
    ): Promise<RollingOptionsStrangleLiveRuntimeRecord> {
        const objRuntime = await this.buildRuntimeRecord(pUserId, pConfig, pState, pOverrides);
        await this.runnerManager.setState({
            userId: pUserId,
            strategyType: "rolling-options-strangle-live",
            status: objRuntime.status === "running" ? "running" : (objRuntime.status === "error" ? "error" : "stopped"),
            updatedAt: new Date().toISOString(),
            message: objRuntime.lastError || objRuntime.lastSignal || "Rolling Options LT Live",
            state: objRuntime.state
        });
        return saveRollingOptionsStrangleLiveRuntime(objRuntime);
    }

    public async startUser(pUserId: string): Promise<RollingOptionsStrangleLiveRuntimeRecord> {
        const objConfig = await this.loadConfig(pUserId);
        const objProfile = await loadRollingOptionsStrangleLiveProfile(pUserId);
        const objState = this.getOrCreateState(pUserId);
        objState.running = true;
        objState.manualCloseBlocksOptionEntry = false;
        objState.lastError = "";
        this.armTimer(objState, objConfig.loopSeconds);
        await this.runCycle(pUserId);
        return this.syncRuntime(pUserId, objConfig, objState, {
            status: "running",
            autoTraderEnabled: true,
            selectedApiProfileId: String(objProfile?.selectedApiProfileId || "")
        });
    }

    public async stopUser(pUserId: string): Promise<RollingOptionsStrangleLiveRuntimeRecord> {
        const objConfig = await this.loadConfig(pUserId);
        const objProfile = await loadRollingOptionsStrangleLiveProfile(pUserId);
        const objState = this.getOrCreateState(pUserId);
        objState.running = false;
        if (objState.timerRef) {
            clearInterval(objState.timerRef);
            objState.timerRef = null;
        }
        this.releaseTickerScope(pUserId);
        return this.syncRuntime(pUserId, objConfig, objState, {
            status: "stopped",
            autoTraderEnabled: false,
            selectedApiProfileId: String(objProfile?.selectedApiProfileId || "")
        });
    }

    public blockOptionEntryFromManualClose(pUserId: string): void {
        const objState = this.getOrCreateState(pUserId);
        objState.manualCloseBlocksOptionEntry = true;
    }

    public async emergencyStopUser(pUserId: string): Promise<{
        runtime: RollingOptionsStrangleLiveRuntimeRecord;
        closedPositions: RollingOptionsStrangleLiveImportedPositionRecord[];
    }> {
        const arrOpenPositions = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
        const objConfig = await this.loadConfig(pUserId);
        const arrClosedPositions: RollingOptionsStrangleLiveImportedPositionRecord[] = [];

        for (const objPosition of arrOpenPositions) {
            await this.closeImportedPositionOnDelta(pUserId, objPosition);
            arrClosedPositions.push(objPosition);
        }

        await this.persistImportedPositions(pUserId, []);
        const objRuntime = await this.stopUser(pUserId);

        await logRollingOptionsStrangleLiveEvent({
            userId: pUserId,
            eventType: "kill_switch",
            severity: "warning",
            title: "Kill Switch Executed",
            message: arrClosedPositions.length > 0
                ? `Kill switch closed ${arrClosedPositions.length} live position${arrClosedPositions.length === 1 ? "" : "s"} and stopped the live runner.`
                : "Kill switch stopped the live runner. No saved imported live positions were open.",
            payload: {
                symbol: objConfig.symbol,
                qty: arrClosedPositions.length,
                reason: "kill_switch"
            }
        });

        return {
            runtime: objRuntime,
            closedPositions: arrClosedPositions
        };
    }

    public async setManualRenkoSignal(
        pUserId: string,
        pColorCode: "R" | "G"
    ): Promise<RollingOptionsStrangleLiveRuntimeRecord> {
        const objState = this.getOrCreateState(pUserId);
        const objConfig = await this.loadConfig(pUserId);
        const vColorCode = pColorCode === "G" ? "G" : "R";

        objState.renko.lastColor = vColorCode;
        objState.renko.lastDir = vColorCode === "R" ? -1 : 1;
        objState.lastError = "";
        objState.lastCycleAt = new Date().toISOString();

        await logRollingOptionsStrangleLiveEvent({
            userId: pUserId,
            eventType: "renko_change_detected",
            severity: "info",
            title: "Renko Change Detected",
            message: `Manual Renko signal changed to ${vColorCode === "R" ? "RED" : "GREEN"}.`,
            payload: {
                symbol: objConfig.symbol,
                reason: vColorCode === "R" ? "manual_renko_red" : "manual_renko_green",
                renkoColor: vColorCode
            }
        });

        const objRuntime = await this.syncRuntime(pUserId, objConfig, objState, {
            status: objState.running ? "running" : "stopped",
            autoTraderEnabled: objState.running,
            lastSignal: vColorCode === "R" ? "MANUAL_RED" : "MANUAL_GREEN",
            lastCycleAt: objState.lastCycleAt,
            lastError: ""
        });

        if (!objState.running) {
            return objRuntime;
        }

        await this.runCycle(pUserId);
        return await loadRollingOptionsStrangleLiveRuntime(pUserId) || objRuntime;
    }

    public async executeStrategy(
        pUserId: string,
        pRenkoColorCode?: "R" | "G"
    ): Promise<{ status: string; message: string; }> {
        const objState = this.getOrCreateState(pUserId);
        const objConfig = await this.loadConfig(pUserId);
        const objUiState = ((objConfig as RollingOptionsPtDeConfig & { __uiState?: Record<string, unknown>; }).__uiState || {}) as Record<string, unknown>;
        const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
        const bAction1Enabled = String(objUiState.action1 || "sell").trim().toLowerCase() !== "none";
        const bAction2Enabled = String(objUiState.action2 || "none").trim().toLowerCase() !== "none";
        const bFuturesEnabled = Boolean((objConfig as RollingOptionsPtDeConfig & { futuresEnabled?: boolean; }).futuresEnabled ?? true);
        objState.manualCloseBlocksOptionEntry = false;
        const vRenkoColor = pRenkoColorCode === "G"
            ? "G"
            : ((pRenkoColorCode === "R" ? "R" : objState.renko.lastColor) === "G" ? "G" : "R");
        const vRuleColor: "R" | "G" = objConfig.renkoEnabled && vRenkoColor === "G" ? "G" : "R";

        objState.renko.lastColor = vRenkoColor;
        objState.renko.lastDir = vRenkoColor === "R" ? -1 : 1;
        objState.lastError = "";

        const arrExistingPositions = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
        const arrExistingFutures = arrExistingPositions.filter((objRow) => !isOptionContract(objRow.contractName));
        const arrExistingOptions = arrExistingPositions.filter((objRow) => isOptionContract(objRow.contractName));
        const bHadTrackedOptions = arrExistingOptions.length > 0;
        const bHasRuleSet1 = arrExistingOptions.some((objRow) => Number(objRow.metadata?.ruleSet) !== 2);
        const bHasRuleSet2 = arrExistingOptions.some((objRow) => Number(objRow.metadata?.ruleSet) === 2);
        let bOpenedFuture = false;
        let vOpenedOptionCount = 0;

        if (bFuturesEnabled && arrExistingFutures.length <= 0) {
            await this.openInitialFutureEntry(
                pUserId,
                objConfig,
                Math.max(1, Math.floor(Number(objConfig.futureQty || 1))),
                "Strategy initial future"
            );
            bOpenedFuture = true;
        }

        const arrUpdatedPositions = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
        const vTotalFutureQty = arrUpdatedPositions
            .filter((objRow) => !isOptionContract(objRow.contractName))
            .reduce((pSum, objRow) => pSum + Math.max(0, Number(objRow.qty || 0)), 0);

        if ((bFuturesEnabled ? vTotalFutureQty > 0 : true)) {
            const vQtyBase = bFuturesEnabled ? vTotalFutureQty : Math.max(1, Math.floor(Number(objConfig.futureQty || 1)));

            if (bAction1Enabled && !bHasRuleSet1) {
                const objRuleValues1 = this.getRuleValues(objConfig, vRuleColor);
                const vOptionQty1 = this.getConfiguredOptionQty(objConfig, vRuleColor, vQtyBase);
                if (vOptionQty1 > 0) {
                    const arrCreated1 = await this.openOptionEntries(
                        pUserId,
                        objConfig,
                        vOptionQty1,
                        objRuleValues1.reDelta,
                        "Strategy initial option entry (Action 1)",
                        vRuleColor,
                        true,
                        1
                    );
                    vOpenedOptionCount += arrCreated1.length;
                }
            }

            if (bAction2Enabled && !bHasRuleSet2) {
                const objRuleValues2 = this.getRuleValues(objConfig2, vRuleColor);
                const vOptionQty2 = this.getConfiguredOptionQty(objConfig2, vRuleColor, vQtyBase);
                if (vOptionQty2 > 0) {
                    const arrCreated2 = await this.openOptionEntries(
                        pUserId,
                        objConfig2,
                        vOptionQty2,
                        objRuleValues2.reDelta,
                        "Strategy initial option entry (Action 2)",
                        vRuleColor,
                        true,
                        2
                    );
                    vOpenedOptionCount += arrCreated2.length;
                }
            }
        }

        objState.lastCycleAt = new Date().toISOString();
        await this.syncRuntime(pUserId, objConfig, objState, {
            status: objState.running ? "running" : "stopped",
            autoTraderEnabled: objState.running,
            lastSignal: vRuleColor === "R" ? "EXEC_STRATEGY_RED" : "EXEC_STRATEGY_GREEN",
            lastCycleAt: objState.lastCycleAt,
            lastError: ""
        });
        await logRollingOptionsStrangleLiveEvent({
            userId: pUserId,
            eventType: "strategy_executed",
            severity: "success",
            title: "Strategy Executed",
            message: bOpenedFuture || vOpenedOptionCount > 0
                ? "Initial live strategy entry executed."
                : "Live strategy execution skipped because tracked positions already exist.",
            payload: {
                symbol: objConfig.symbol,
                reason: "strategy_execute",
                renkoColor: vRenkoColor,
                openedFuture: bOpenedFuture,
                openedOptionCount: vOpenedOptionCount
            }
        });

        return {
            status: bOpenedFuture || vOpenedOptionCount > 0 ? "success" : "warning",
            message: bOpenedFuture || vOpenedOptionCount > 0
                ? `Live strategy executed using ${vRuleColor === "R" ? "RED" : "GREEN"} Renko sizing.`
                : (bHadTrackedOptions
                    ? "Strategy execution skipped because option positions are already tracked."
                    : "No option entry was placed from the current Renko state.")
        };
    }

    public async runCycle(pUserId: string): Promise<{ status: string; message: string; }> {
        return runWithPostgresAdvisoryLock(
            `rolling-options-strangle-live:cycle:${pUserId}`,
            () => this.runCycleWithProcessLock(pUserId),
            () => ({ status: "warning", message: "Live cycle already in progress on another server instance." })
        );
    }

    private async runCycleWithProcessLock(pUserId: string): Promise<{ status: string; message: string; }> {
        const objState = this.getOrCreateState(pUserId);
        if (objState.isBusy) {
            return { status: "warning", message: "Live cycle already in progress." };
        }

        objState.isBusy = true;
        try {
            const objConfig = await this.loadConfig(pUserId);
            const objProfile = await loadRollingOptionsStrangleLiveProfile(pUserId);
            let arrCurrentPositions = await this.reconcileUserPositions(pUserId, objConfig.symbol);
            const objUiState = ((objConfig as RollingOptionsPtDeConfig & { __uiState?: Record<string, unknown>; }).__uiState || {}) as Record<string, unknown>;
            const objConfig2 = this.buildRuleSetConfig(objUiState, 2);
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
            const bMismatchDetected = Boolean(objState.positionMismatchDetected);
            const vPreviousSpotPrice = Number(objState.market.lastSpotPrice ?? NaN);
            this.refreshTickerScope(pUserId, [
                objConfig.contractName,
                ...arrCurrentPositions
                    .filter((objRow) => isOptionContract(objRow.contractName))
                    .map((objRow) => String(objRow.contractName || "").trim())
                    .filter(Boolean)
            ]);
            const objSnapshot = await this.getMarketSnapshot(objConfig);
            objState.market.lastSpotPrice = objSnapshot.spotPrice;
            objState.market.lastFuturesPrice = objSnapshot.futuresPrice;
            objState.market.lastSource = objSnapshot.priceSource;
            const objPayoffSlTrigger = await this.handlePayoffSlCheckpointTrigger(
                pUserId,
                objConfig,
                arrCurrentPositions,
                vPreviousSpotPrice,
                objSnapshot.spotPrice
            );
            if (objPayoffSlTrigger.triggered) {
                objState.cycleCount += 1;
                objState.consecutiveFailures = 0;
                objState.lastError = "";
                objState.lastCycleAt = objSnapshot.ts;
                this.lastErrorLogByUserId.delete(pUserId);
                await this.syncRuntime(pUserId, objConfig, objState, {
                    status: objState.running ? "running" : "paused",
                    autoTraderEnabled: objState.running,
                    selectedApiProfileId: String(objProfile?.selectedApiProfileId || ""),
                    lastSpotPrice: objSnapshot.spotPrice,
                    lastFuturesPrice: objSnapshot.futuresPrice,
                    lastCycleAt: objSnapshot.ts,
                    lastSignal: objPayoffSlTrigger.signal
                });
                return {
                    status: "success",
                    message: objPayoffSlTrigger.message
                };
            }
            const vMismatchSignal = bMismatchDetected ? "POSITION_MISMATCH" : "";
            let vPreviousRenkoColor = String(objState.renko.lastColor || "").trim().toUpperCase() === "G" ? "G" : "R";
            if (String(objState.renko.lastColor || "").trim().toUpperCase() !== "G" && String(objState.renko.lastColor || "").trim().toUpperCase() !== "R") {
                vPreviousRenkoColor = "";
            }
            const arrRenkoSignals = objConfig.renkoEnabled
                ? updateRenkoState(objState, objSnapshot, objConfig)
                : [];

            if (!bMismatchDetected && arrRenkoSignals.length > 0) {
                const vLastRenkoSignal = arrRenkoSignals.at(-1) === "G" ? "G" : "R";
                if ((vPreviousRenkoColor === "R" || vPreviousRenkoColor === "G")
                    && vPreviousRenkoColor !== vLastRenkoSignal) {
                    const arrRenkoCloseTargets = arrCurrentPositions.filter((objRow) => {
                        const objMeta = (objRow.metadata || {}) as Record<string, unknown>;
                        const vRuleColor = String(objMeta.ruleColor || "").trim().toUpperCase();
                        const vRuleSet: 1 | 2 = Number(objMeta.ruleSet) === 2 ? 2 : 1;
                        return isOptionContract(objRow.contractName)
                            && vRuleColor === vPreviousRenkoColor
                            && isRenkoColorTrailTpEnabled(vRuleColor, vRuleSet);
                    });
                    if (arrRenkoCloseTargets.length > 0) {
                        for (const objPosition of arrRenkoCloseTargets) {
                            await this.closeImportedPositionOnDelta(pUserId, objPosition);
                        }
                        const arrClosedImportIds = arrRenkoCloseTargets
                            .map((objRow) => String(objRow.importId || "").trim())
                            .filter(Boolean);
                        const arrRemainingPositions = arrCurrentPositions.filter((objRow) => {
                            return !arrClosedImportIds.includes(String(objRow.importId || "").trim());
                        });
                        await this.persistImportedPositions(pUserId, arrRemainingPositions);
                        await logRollingOptionsStrangleLiveEvent({
                            userId: pUserId,
                            eventType: "option_closed",
                            severity: "info",
                            title: "Renko Color Close",
                            message: `Closed ${arrRenkoCloseTargets.length} live option leg(s) because Renko changed from ${vPreviousRenkoColor} to ${vLastRenkoSignal}.`,
                            payload: {
                                symbol: objConfig.symbol,
                                qty: arrRenkoCloseTargets.length,
                                reason: "renko_color_change_close",
                                previousRenkoColor: vPreviousRenkoColor,
                                renkoColor: vLastRenkoSignal
                            }
                        });
                        await this.reEnterClosedOptionPositions(
                            pUserId,
                            arrRenkoCloseTargets,
                            `Renko color changed from ${vPreviousRenkoColor} to ${vLastRenkoSignal}`
                        );
                        arrCurrentPositions = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
                    }
                }
            }

            for (const vRenkoSignal of arrRenkoSignals) {
                if (!objState.running) {
                    break;
                }
                const bRenkoColorChanged = vPreviousRenkoColor !== vRenkoSignal;
                if (bRenkoColorChanged) {
                    await logRollingOptionsStrangleLiveEvent({
                        userId: pUserId,
                        eventType: "renko_change_detected",
                        severity: "info",
                        title: "Renko Change Detected",
                        message: vPreviousRenkoColor
                            ? `Renko changed from ${vPreviousRenkoColor === "R" ? "RED" : "GREEN"} to ${vRenkoSignal === "R" ? "RED" : "GREEN"}.`
                            : `Renko changed to ${vRenkoSignal === "R" ? "RED" : "GREEN"}.`,
                        payload: {
                            symbol: objConfig.symbol,
                            reason: vRenkoSignal === "R" ? "renko_red_brick" : "renko_green_brick",
                            renkoColor: vRenkoSignal,
                            previousRenkoColor: vPreviousRenkoColor || ""
                        }
                    });
                    vPreviousRenkoColor = vRenkoSignal;
                }
                if (vRenkoSignal === "G" && !bRenkoColorChanged) {
                    continue;
                }
                if (bMismatchDetected) {
                    continue;
                }
                const arrPositionsBeforeEntry = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
                await this.handleRenkoOptionEntry(pUserId, objConfig, arrPositionsBeforeEntry, vRenkoSignal);
            }

            if (objState.running && !bMismatchDetected) {
                const arrPositionsBeforeFallbackEntry = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
                const vTotalFutureQty = arrPositionsBeforeFallbackEntry
                    .filter((objRow) => !isOptionContract(objRow.contractName))
                    .reduce((pSum, objRow) => pSum + Math.max(0, Number(objRow.qty || 0)), 0);
                const arrOpenOptions = arrPositionsBeforeFallbackEntry.filter((objRow) => isOptionContract(objRow.contractName));
                const bHasRuleSet1 = arrOpenOptions.some((objRow) => Number(objRow.metadata?.ruleSet) !== 2);
                const bHasRuleSet2 = arrOpenOptions.some((objRow) => Number(objRow.metadata?.ruleSet) === 2);
                if (vTotalFutureQty > 0 && !objState.manualCloseBlocksOptionEntry) {
                    const vRenkoColor = String(objState.renko.lastColor || "").trim().toUpperCase() === "G" ? "G" : "R";
                    const vRuleColor: "R" | "G" = objConfig.renkoEnabled && vRenkoColor === "G" ? "G" : "R";
                    if (String(objUiState.action1 || "sell").trim().toLowerCase() !== "none" && !bHasRuleSet1) {
                        const objRuleValues1 = this.getRuleValues(objConfig, vRuleColor);
                        const vOptionQty1 = this.getConfiguredOptionQty(objConfig, vRuleColor, vTotalFutureQty);
                        if (vOptionQty1 > 0) {
                            await this.openOptionEntries(
                                pUserId,
                                objConfig,
                                vOptionQty1,
                                objRuleValues1.reDelta,
                                "Renko fallback option entry (Action 1)",
                                vRuleColor,
                                true,
                                1
                            );
                        }
                    }
                    if (String(objUiState.action2 || "none").trim().toLowerCase() !== "none" && !bHasRuleSet2) {
                        const objRuleValues2 = this.getRuleValues(objConfig2, vRuleColor);
                        const vOptionQty2 = this.getConfiguredOptionQty(objConfig2, vRuleColor, vTotalFutureQty);
                        if (vOptionQty2 > 0) {
                            await this.openOptionEntries(
                            pUserId,
                                objConfig2,
                                vOptionQty2,
                                objRuleValues2.reDelta,
                                "Renko fallback option entry (Action 2)",
                                vRuleColor,
                                true,
                                2
                            );
                        }
                    }
                }
            }

            const arrRefreshedPositions = await this.refreshImportedPositions(
                objConfig,
                objSnapshot,
                await listRollingOptionsStrangleLiveImportedPositions(pUserId)
            );

            const clamp01 = (pValue: number): number => Math.min(1, Math.max(0, pValue));
            const bTrailGreenSl1Enabled = Boolean((objUiState as any).trailGreenSl1Enabled ?? true);
            const bTrailRedSl1Enabled = Boolean((objUiState as any).trailRedSl1Enabled ?? true);
            const bTrailGreenSl2Enabled = Boolean((objUiState as any).trailGreenSl2Enabled ?? true);
            const bTrailRedSl2Enabled = Boolean((objUiState as any).trailRedSl2Enabled ?? true);
            for (const objPosition of arrRefreshedPositions) {
                if (!objPosition.isOption || !Number.isFinite(Number(objPosition.currentDelta))) {
                    continue;
                }
                const objMeta = (objPosition.metadata || {}) as Record<string, unknown>;
                const vRuleColor = String(objMeta.ruleColor || "").trim().toUpperCase() === "G" ? "G" : "R";
                const vRuleSet: 1 | 2 = Number(objMeta.ruleSet) === 2 ? 2 : 1;
                const objRuleConfig = vRuleSet === 2 ? objConfig2 : objConfig;
                const vSide = String(objPosition.side || "").trim().toUpperCase() === "BUY" ? "BUY" : "SELL";
                const vEntryDelta = Math.abs(Number(objPosition.entryDelta ?? objPosition.currentDelta ?? 0.53));
                const vCurrentDelta = Math.abs(Number(objPosition.currentDelta ?? 0.53));
                const vConfiguredSl = vRuleColor === "G"
                    ? clamp01(Number(objRuleConfig.greenStopLossPct ?? 0.90) > 1 ? Number(objRuleConfig.greenStopLossPct) / 100 : Number(objRuleConfig.greenStopLossPct ?? 0.90))
                    : clamp01(Number(objRuleConfig.redStopLossPct ?? 0.90) > 1 ? Number(objRuleConfig.redStopLossPct) / 100 : Number(objRuleConfig.redStopLossPct ?? 0.90));
                const vTpMove = vRuleColor === "G"
                    ? clamp01(Number(objRuleConfig.greenTakeProfitPct ?? 0.50) > 1 ? Number(objRuleConfig.greenTakeProfitPct) / 100 : Number(objRuleConfig.greenTakeProfitPct ?? 0.50))
                    : clamp01(Number(objRuleConfig.redTakeProfitPct ?? 0.50) > 1 ? Number(objRuleConfig.redTakeProfitPct) / 100 : Number(objRuleConfig.redTakeProfitPct ?? 0.50));
                const objNextMeta = { ...objMeta } as Record<string, unknown>;
                const objInitial = this.computeOptionThresholds({ tpMove: vTpMove, slMove: vConfiguredSl }, vSide, vEntryDelta);

                if (!Number.isFinite(Number(objNextMeta.takeProfitDelta)) || !(Number(objNextMeta.takeProfitDelta) > 0)) {
                    objNextMeta.takeProfitDelta = Number(objInitial.takeProfitDelta.toFixed(6));
                }
                if (!Number.isFinite(Number(objNextMeta.stopLossDelta)) || !(Number(objNextMeta.stopLossDelta) > 0)) {
                    objNextMeta.stopLossDelta = Number(objInitial.stopLossDelta.toFixed(6));
                }

                const bTrailSlEnabled = vRuleSet === 2
                    ? (vRuleColor === "G" ? bTrailGreenSl2Enabled : bTrailRedSl2Enabled)
                    : (vRuleColor === "G" ? bTrailGreenSl1Enabled : bTrailRedSl1Enabled);
                const bTrailTpEnabled = vRuleSet === 2
                    ? (vRuleColor === "G" ? bTrailGreenTp2Enabled : bTrailRedTp2Enabled)
                    : (vRuleColor === "G" ? bTrailGreenTp1Enabled : bTrailRedTp1Enabled);

                if (bTrailSlEnabled) {
                    const vPrevBest = Number(objNextMeta.trailBestDelta);
                    const vBestDelta = Number.isFinite(vPrevBest)
                        ? (vSide === "BUY" ? Math.max(vPrevBest, vCurrentDelta) : Math.min(vPrevBest, vCurrentDelta))
                        : (vSide === "BUY" ? Math.max(vEntryDelta, vCurrentDelta) : Math.min(vEntryDelta, vCurrentDelta));
                    const vStoredSl = Number(objNextMeta.stopLossDelta);
                    const vStoredTrailGap = Number(objNextMeta.trailSlGap);
                    const vTrailSlGap = Number.isFinite(vStoredTrailGap) && vStoredTrailGap >= 0
                        ? vStoredTrailGap
                        : Math.abs((Number.isFinite(vStoredSl) && vStoredSl > 0 ? vStoredSl : vConfiguredSl) - vEntryDelta);
                    const vCandidate = clamp01(vSide === "BUY"
                        ? vBestDelta - vTrailSlGap
                        : vBestDelta + vTrailSlGap);
                    const vNextSl = vSide === "BUY"
                        ? (Number.isFinite(vStoredSl) && vStoredSl > 0 ? Math.max(vStoredSl, vCandidate) : vCandidate)
                        : (Number.isFinite(vStoredSl) && vStoredSl > 0 ? Math.min(vStoredSl, vCandidate) : vCandidate);
                    objNextMeta.stopLossDelta = Number(vNextSl.toFixed(6));
                    objNextMeta.trailBestDelta = Number(vBestDelta.toFixed(6));
                    objNextMeta.trailSlGap = Number(vTrailSlGap.toFixed(6));
                }

                if (bTrailTpEnabled && Number.isFinite(vTpMove) && vTpMove > 0) {
                    const vPrevPeak = Number(objNextMeta.trailTpPeakDelta);
                    const vPeakDelta = Number.isFinite(vPrevPeak)
                        ? (vSide === "BUY" ? Math.max(vPrevPeak, vCurrentDelta) : Math.min(vPrevPeak, vCurrentDelta))
                        : (vSide === "BUY" ? Math.max(vEntryDelta, vCurrentDelta) : Math.min(vEntryDelta, vCurrentDelta));
                    const vStoredTp = Number(objNextMeta.takeProfitDelta);
                    const vCandidate = vSide === "BUY"
                        ? clamp01(vPeakDelta + vTpMove)
                        : clamp01(vPeakDelta - vTpMove);
                    const vNextTp = Number.isFinite(vStoredTp) && vStoredTp > 0
                        ? (vSide === "BUY" ? Math.max(vStoredTp, vCandidate) : Math.min(vStoredTp, vCandidate))
                        : vCandidate;
                    objNextMeta.trailTpPeakDelta = Number(vPeakDelta.toFixed(6));
                    objNextMeta.takeProfitDelta = Number(vNextTp.toFixed(6));
                }

                objNextMeta.ruleColor = vRuleColor;
                objNextMeta.ruleSet = vRuleSet;
                objNextMeta.reEnter = Boolean(objRuleConfig.reEnter);
                objNextMeta.trailBestDelta = Number(Number(objNextMeta.trailBestDelta ?? vEntryDelta).toFixed(6));
                objNextMeta.trailTpPeakDelta = Number(Number(objNextMeta.trailTpPeakDelta ?? vEntryDelta).toFixed(6));
                objPosition.metadata = objNextMeta as any;
            }

            await this.persistImportedPositions(pUserId, arrRefreshedPositions.map((objRow) => ({
                userId: objRow.userId,
                importId: objRow.importId,
                contractName: objRow.contractName,
                side: objRow.side,
                qty: objRow.qty,
                entryPrice: objRow.entryPrice,
                markPrice: objRow.markPrice,
                entryDelta: objRow.entryDelta,
                currentDelta: objRow.currentDelta,
                charges: objRow.charges,
                pnl: objRow.pnl,
                margin: objRow.margin,
                liquidationPrice: objRow.liquidationPrice,
                metadata: objRow.metadata,
                openedAt: objRow.openedAt,
                updatedAt: objRow.updatedAt
            })));

            let vTriggerSignal = "";
            for (const objPosition of arrRefreshedPositions) {
                if (!objState.running || !objPosition.isOption || !Number.isFinite(Number(objPosition.currentDelta))) {
                    continue;
                }

                const vStoredTakeProfitDelta = Number(objPosition.metadata?.takeProfitDelta);
                const vStoredStopLossDelta = Number(objPosition.metadata?.stopLossDelta);
                const vRuleColor = String(objPosition.metadata?.ruleColor || "").trim().toUpperCase() === "G" ? "G" : "R";
                const vRuleSet: 1 | 2 = Number(objPosition.metadata?.ruleSet) === 2 ? 2 : 1;
                const objRuleConfig = vRuleSet === 2 ? objConfig2 : objConfig;
                const vSide = String(objPosition.side || "").trim().toUpperCase() === "BUY" ? "BUY" : "SELL";
                const vEntryDelta = Math.abs(Number(objPosition.entryDelta ?? objPosition.currentDelta ?? 0.53));
                const vTpMove = vRuleColor === "G"
                    ? clamp01(Number(objRuleConfig.greenTakeProfitPct ?? 0.50) > 1 ? Number(objRuleConfig.greenTakeProfitPct) / 100 : Number(objRuleConfig.greenTakeProfitPct ?? 0.50))
                    : clamp01(Number(objRuleConfig.redTakeProfitPct ?? 0.50) > 1 ? Number(objRuleConfig.redTakeProfitPct) / 100 : Number(objRuleConfig.redTakeProfitPct ?? 0.50));
                const vSlMove = vRuleColor === "G"
                    ? clamp01(Number(objRuleConfig.greenStopLossPct ?? 0.90) > 1 ? Number(objRuleConfig.greenStopLossPct) / 100 : Number(objRuleConfig.greenStopLossPct ?? 0.90))
                    : clamp01(Number(objRuleConfig.redStopLossPct ?? 0.90) > 1 ? Number(objRuleConfig.redStopLossPct) / 100 : Number(objRuleConfig.redStopLossPct ?? 0.90));
                const objFallbackThresholds = this.computeOptionThresholds({ tpMove: vTpMove, slMove: vSlMove }, vSide, vEntryDelta);
                const objDecision = shouldTriggerImportedOption(
                    objPosition.side,
                    Number(objPosition.currentDelta),
                    Number.isFinite(vStoredTakeProfitDelta) ? vStoredTakeProfitDelta : objFallbackThresholds.takeProfitDelta,
                    Number.isFinite(vStoredStopLossDelta) ? vStoredStopLossDelta : objFallbackThresholds.stopLossDelta
                );
                if (objDecision.shouldAct && objDecision.reason) {
                    await this.handleOptionTrigger(pUserId, objConfig, objPosition, objDecision.reason, objSnapshot);
                    vTriggerSignal = objDecision.reason === "sl" ? "SL_TRIGGERED" : "TP_TRIGGERED";
                    break;
                }
            }

            objState.cycleCount += 1;
            objState.consecutiveFailures = 0;
            objState.lastError = "";
            objState.lastCycleAt = objSnapshot.ts;
            this.lastErrorLogByUserId.delete(pUserId);

            await this.syncRuntime(pUserId, objConfig, objState, {
                status: objState.running ? "running" : "paused",
                autoTraderEnabled: objState.running,
                selectedApiProfileId: String(objProfile?.selectedApiProfileId || ""),
                lastSpotPrice: objSnapshot.spotPrice,
                lastFuturesPrice: objSnapshot.futuresPrice,
                lastCycleAt: objSnapshot.ts,
                lastSignal: vTriggerSignal || vMismatchSignal || (arrRenkoSignals.at(-1)
                    ? (arrRenkoSignals.at(-1) === "R" ? "RED" : "GREEN")
                    : (objState.renko.lastColor === "R" ? "RED" : (objState.renko.lastColor === "G" ? "GREEN" : "IDLE")))
            });

            return {
                status: "success",
                message: vTriggerSignal
                    ? `Live cycle completed with ${vTriggerSignal === "SL_TRIGGERED" ? "SL" : "TP"} execution.`
                    : (arrRenkoSignals.length
                        ? `Live cycle completed with Renko ${arrRenkoSignals.at(-1) === "R" ? "RED" : "GREEN"} signal.`
                        : "Live cycle completed.")
            };
        }
        catch (objError) {
            const objConfig = await this.loadConfig(pUserId);
            const objProfile = await loadRollingOptionsStrangleLiveProfile(pUserId);
            objState.consecutiveFailures += 1;
            objState.lastError = objError instanceof Error ? objError.message : "Live cycle failed.";
            await this.syncRuntime(pUserId, objConfig, objState, {
                status: "error",
                autoTraderEnabled: objState.running,
                selectedApiProfileId: String(objProfile?.selectedApiProfileId || ""),
                lastError: objState.lastError
            });
            if (this.shouldLogCycleError(pUserId, objState.lastError)) {
                await logRollingOptionsStrangleLiveEvent({
                    userId: pUserId,
                    eventType: "engine_error",
                    severity: "error",
                    title: "Live Runner Error",
                    message: objState.lastError,
                    payload: {
                        symbol: objConfig.symbol,
                        reason: "engine_error"
                    }
                });
            }
            return {
                status: "danger",
                message: objState.lastError
            };
        }
        finally {
            objState.isBusy = false;
        }
    }
}
