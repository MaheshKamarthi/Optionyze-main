import crypto from "node:crypto";
import type { Request, Response } from "express";
const DeltaRestClient = require("delta-rest-client");
import type { RollingOptionsStrangleLiveService } from "../../strategies/rolling-options-strangle-live/service";
import { getAccountById } from "../../storage/accounts-store";
import { getDeltaApiProfile } from "../../storage/delta-api-profile-store";
import {
    getDefaultRollingOptionsStrangleLiveProfile,
    loadRollingOptionsStrangleLiveProfile,
    saveRollingOptionsStrangleLiveProfile,
    type RollingOptionsStrangleLiveConnectionStatus
} from "../../storage/rolling-options-strangle-live-profile-store";
import {
    loadRollingOptionsStrangleLiveRuntime,
    saveRollingOptionsStrangleLiveRuntime
} from "../../storage/rolling-options-strangle-live-runtime-store";
import {
    deleteRollingOptionsStrangleLiveImportedPosition,
    listRollingOptionsStrangleLiveImportedPositions,
    replaceRollingOptionsStrangleLiveImportedPositions,
    type RollingOptionsStrangleLiveImportedPositionRecord,
    type RollingOptionsStrangleLivePositionMetadata
} from "../../storage/rolling-options-strangle-live-position-store";
import {
    clearRollingOptionsEventsByStrategy,
    listRollingOptionsEventsByStrategy
} from "../../storage/rolling-options-pt-de-event-store";
import { gRollingOptionsTelegramEventTypes, logRollingOptionsStrangleLiveEvent } from "../../strategies/rolling-options-strangle-live/event-logger";
import { findBestLiveOptionContract, getLiveMarketSnapshot, getLiveOptionTicker } from "../../strategies/rolling-options-pt-de/market-data";
import { buildConfigFromUiState } from "../../strategies/rolling-options-pt-de/engine";

const RE_DELTA_TOLERANCE = 0.05;

interface DeltaWalletBalanceRow {
    asset_symbol?: string;
    symbol?: string;
    available_balance?: number | string | null;
    balance?: number | string | null;
    wallet_balance?: number | string | null;
    total_margin?: number | string | null;
    total_margin_inr?: number | string | null;
    available_balance_inr?: number | string | null;
    balance_inr?: number | string | null;
    wallet_balance_inr?: number | string | null;
    blocked_margin_inr?: number | string | null;
    blocked_margin?: number | string | null;
    position_margin?: number | string | null;
    order_margin?: number | string | null;
    [key: string]: unknown;
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
    [key: string]: unknown;
}

interface DeltaOrderHistoryRow {
    id?: number | string | null;
    state?: string | null;
    size?: number | string | null;
    side?: string | null;
    average_fill_price?: number | string | null;
    paid_commission?: number | string | null;
    created_at?: string | number | null;
    updated_at?: string | number | null;
    product_symbol?: string | null;
    order_id?: string | number | null;
    product?: {
        contract_value?: number | string | null;
        [key: string]: unknown;
    } | null;
    meta_data?: {
        pnl?: number | string | null;
        cashflow?: number | string | null;
        order_type?: string;
        order_price?: number | string | null;
        [key: string]: unknown;
    } | null;
    [key: string]: unknown;
}

function getAccountId(req: Request): string {
    return String(req.authAccount?.accountId || "").trim();
}

function getErrorMessage(pError: unknown, pFallback: string): string {
    if (pError instanceof Error && pError.message) {
        return pError.message;
    }

    if (pError && typeof pError === "object") {
        const objError = pError as { message?: unknown; error?: unknown; response?: { data?: { message?: unknown } } };
        const vMessage = String(objError.message || objError.error || objError.response?.data?.message || "").trim();
        if (vMessage) {
            return vMessage;
        }
    }

    return pFallback;
}

function getDeltaErrorPayload(pError: unknown): { error?: { code?: string; context?: { client_ip?: string } } } | null {
    const vRawData = (pError as { response?: { data?: unknown } } | null)?.response?.data;
    if (!vRawData) {
        return null;
    }

    if (typeof vRawData === "string") {
        try {
            return JSON.parse(vRawData);
        }
        catch (_objError) {
            return null;
        }
    }

    if (typeof vRawData === "object") {
        return vRawData as { error?: { code?: string; context?: { client_ip?: string } } };
    }

    return null;
}

async function getOutboundPublicIp(): Promise<string> {
    const arrUrls = [
        "https://api.ipify.org?format=json",
        "https://ifconfig.me/all.json",
        "https://checkip.amazonaws.com/"
    ];

    for (const vUrl of arrUrls) {
        try {
            const objResponse = await fetch(vUrl, { method: "GET" });
            if (!objResponse.ok) {
                continue;
            }

            const vText = String(await objResponse.text() || "").trim();
            if (!vText) {
                continue;
            }

            if (vText.startsWith("{")) {
                const objParsed = JSON.parse(vText);
                const vIp = String(objParsed.ip || objParsed.ip_addr || "").trim();
                if (vIp) {
                    return vIp;
                }
                continue;
            }

            return vText;
        }
        catch (_objError) {
        }
    }

    return "";
}

async function getFriendlyDeltaConnectionError(pError: unknown): Promise<{
    state: RollingOptionsStrangleLiveConnectionStatus["state"];
    message: string;
    outboundIp: string;
}> {
    const vRawMessage = getErrorMessage(pError, "Error testing Delta connection.");
    const vNormalized = vRawMessage.toLowerCase();
    const objDeltaPayload = getDeltaErrorPayload(pError);
    const vDeltaCode = String(objDeltaPayload?.error?.code || "").trim();
    const vDeltaClientIp = String(objDeltaPayload?.error?.context?.client_ip || "").trim();
    const vOutboundIp = vDeltaClientIp || await getOutboundPublicIp();

    if (vDeltaCode === "ip_not_whitelisted_for_api_key") {
        return {
            state: "auth_failed",
            message: vOutboundIp
                ? `Delta rejected this API because IP ${vOutboundIp} is not whitelisted. Please add this IP in Delta Exchange and retry.`
                : "Delta rejected this API because the current server IP is not whitelisted in Delta Exchange.",
            outboundIp: vOutboundIp
        };
    }

    if (vNormalized.includes("unauthorized") || vNormalized.includes("forbidden") || vNormalized.includes("ip")) {
        return {
            state: "auth_failed",
            message: vOutboundIp
                ? `Delta authentication failed. If you use IP whitelisting, whitelist server IP ${vOutboundIp} in Delta Exchange.`
                : "Delta authentication failed. Check the API key, secret, permissions, and IP whitelist.",
            outboundIp: vOutboundIp
        };
    }

    if (vNormalized.includes("rate limit")) {
        return {
            state: "rate_limited",
            message: "Delta API rate limit was hit. Connection is temporarily degraded.",
            outboundIp: vOutboundIp
        };
    }

    if (vNormalized.includes("fetch failed") || vNormalized.includes("network") || vNormalized.includes("timeout")) {
        return {
            state: "disconnected",
            message: "Delta connection is currently unreachable. The live runner should avoid fresh execution until connectivity recovers.",
            outboundIp: vOutboundIp
        };
    }

    return {
        state: "warning",
        message: vRawMessage,
        outboundIp: vOutboundIp
    };
}

async function sendTelegramConnectionAlert(
    pUserId: string,
    pProfileName: string,
    pStatus: RollingOptionsStrangleLiveConnectionStatus
): Promise<void> {
    const vBotToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!vBotToken) {
        return;
    }

    const objAccount = await getAccountById(pUserId);
    const vTelegramChatId = String(objAccount?.telegramChatId || "").trim();
    if (!vTelegramChatId) {
        return;
    }

    const arrLines = [
        "Rolling Options - Live",
        "Delta API connection warning",
        `API Name: ${pProfileName || "-"}`,
        `Status: ${pStatus.state}`,
        `Message: ${pStatus.message || "-"}`,
        `Last Checked: ${pStatus.lastCheckedAt || "-"}`
    ];
    if (pStatus.outboundIp) {
        arrLines.push(`Whitelist this server IP in Delta: ${pStatus.outboundIp}`);
    }

    try {
        await fetch(`https://api.telegram.org/bot${encodeURIComponent(vBotToken)}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: vTelegramChatId,
                text: arrLines.join("\n")
            })
        });
    }
    catch (_objError) {
    }
}

async function readLiveProfile(pUserId: string) {
    return await loadRollingOptionsStrangleLiveProfile(pUserId) || getDefaultRollingOptionsStrangleLiveProfile(pUserId);
}

async function syncLiveRuntimeProfileSelection(pUserId: string, pSelectedApiProfileId: string) {
    const objExisting = await loadRollingOptionsStrangleLiveRuntime(pUserId);
    return saveRollingOptionsStrangleLiveRuntime({
        userId: pUserId,
        status: objExisting?.status || "idle",
        autoTraderEnabled: objExisting?.autoTraderEnabled || false,
        selectedApiProfileId: String(pSelectedApiProfileId || "").trim(),
        currentSymbol: objExisting?.currentSymbol || "",
        currentContractName: objExisting?.currentContractName || "",
        currentExpiryMode: objExisting?.currentExpiryMode || "",
        currentExpiryDate: objExisting?.currentExpiryDate || "",
        renkoEnabled: objExisting?.renkoEnabled || false,
        renkoPoints: objExisting?.renkoPoints || 0,
        renkoSource: objExisting?.renkoSource || "",
        lastSpotPrice: objExisting?.lastSpotPrice ?? null,
        lastFuturesPrice: objExisting?.lastFuturesPrice ?? null,
        lastSignal: objExisting?.lastSignal || "IDLE",
        lastCycleAt: objExisting?.lastCycleAt || "",
        lastError: objExisting?.lastError || "",
        state: objExisting?.state || {},
        updatedAt: ""
    });
}

async function getDeltaClientForAccountId(pAccountId: string, pProfileId: string) {
    const vAccountId = String(pAccountId || "").trim();
    if (!vAccountId) {
        throw new Error("Please sign in to continue.");
    }

    const objProfile = await getDeltaApiProfile(vAccountId, pProfileId);
    if (!objProfile) {
        throw new Error("Delta API profile not found.");
    }

    const objClient = await new DeltaRestClient(objProfile.apiKey, objProfile.apiSecret);
    return {
        client: objClient,
        profile: objProfile
    };
}

async function resolveProfileId(req: Request): Promise<string> {
    const vQueryProfileId = String(req.query?.profileId || req.body?.profileId || "").trim();
    if (vQueryProfileId) {
        return vQueryProfileId;
    }

    const objProfile = await readLiveProfile(getAccountId(req));
    return String(objProfile.selectedApiProfileId || "").trim();
}

async function getDeltaClientForProfile(req: Request, pProfileId: string) {
    return getDeltaClientForAccountId(getAccountId(req), pProfileId);
}

function parseDeltaPayload(pRaw: unknown): Record<string, unknown> {
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

function readResponsePayload(pResponse: { data?: unknown; body?: unknown } | unknown): Record<string, unknown> {
    const objResponse = (pResponse || {}) as { data?: unknown; body?: unknown };
    return parseDeltaPayload(objResponse.data ?? objResponse.body ?? {});
}

function toFiniteNumber(pValue: unknown, pFallback = 0): number {
    const vNumber = Number(pValue);
    return Number.isFinite(vNumber) ? vNumber : pFallback;
}

function pickUsdBalanceRow(pRows: DeltaWalletBalanceRow[]): DeltaWalletBalanceRow | null {
    const arrPriority = ["USD", "USDT"];
    for (const vAsset of arrPriority) {
        const objRow = pRows.find((pRow) => String(pRow.asset_symbol || pRow.symbol || "").trim().toUpperCase() === vAsset) || null;
        if (objRow) {
            return objRow;
        }
    }

    return pRows[0] || null;
}

function getAvailableBalanceUsd(pRow: DeltaWalletBalanceRow | null): number {
    if (!pRow) {
        return 0;
    }

    return toFiniteNumber(
        pRow.available_balance ?? pRow.wallet_balance ?? pRow.balance,
        0
    );
}

function getTotalBalanceUsd(pRow: DeltaWalletBalanceRow | null): number {
    if (!pRow) {
        return 0;
    }

    return toFiniteNumber(
        pRow.total_margin ?? pRow.balance ?? pRow.wallet_balance,
        Number.NaN
    ) || Math.max(0, getAvailableBalanceUsd(pRow) + getBlockedMarginUsd(pRow));
}

function getBlockedMarginUsd(pRow: DeltaWalletBalanceRow | null): number {
    if (!pRow) {
        return 0;
    }

    const vExplicitBlocked = toFiniteNumber(
        pRow.blocked_margin ?? pRow.position_margin ?? pRow.order_margin,
        Number.NaN
    );
    if (Number.isFinite(vExplicitBlocked)) {
        return vExplicitBlocked;
    }

    const vBalance = toFiniteNumber(pRow.balance ?? pRow.wallet_balance, 0);
    const vAvailable = getAvailableBalanceUsd(pRow);
    return Math.max(0, vBalance - vAvailable);
}

function isFutureContractSymbol(pValue: unknown): boolean {
    const vSymbol = String(pValue || "").trim().toUpperCase();
    return Boolean(vSymbol) && !vSymbol.startsWith("C-") && !vSymbol.startsWith("P-");
}

function getSelectedFuturePositionValue(
    pRows: DeltaPositionRow[],
    pSelectedSymbol: string,
    pLivePrice: number
): number {
    const vSymbol = String(pSelectedSymbol || "").trim().toUpperCase();
    const vFallbackLotSize = getLotSizeForSymbol(vSymbol);
    return pRows.reduce((pSum, pRow) => {
        const vContractSymbol = String(pRow.product_symbol || pRow.symbol || "").trim().toUpperCase();
        if (!isFutureContractSymbol(vContractSymbol) || !vContractSymbol.startsWith(vSymbol)) {
            return pSum;
        }

        const vQty = Math.abs(toFiniteNumber(pRow.net_size ?? pRow.size, 0));
        if (!(vQty > 0)) {
            return pSum;
        }

        const vMarkPrice = toFiniteNumber(pRow.mark_price, Number.NaN);
        const vEntryPrice = toFiniteNumber(pRow.entry_price, Number.NaN);
        const vPrice = Number.isFinite(vMarkPrice) && vMarkPrice > 0
            ? vMarkPrice
            : (Number.isFinite(pLivePrice) && pLivePrice > 0 ? pLivePrice : vEntryPrice);
        if (!(Number.isFinite(vPrice) && vPrice > 0)) {
            return pSum;
        }

        return pSum + (vQty * vFallbackLotSize * vPrice);
    }, 0);
}

function mapLivePosition(pRow: DeltaPositionRow, pIndex: number) {
    const vNetSize = toFiniteNumber(pRow.net_size ?? pRow.size, 0);
    const vSide = vNetSize < 0 ? "SELL" : "BUY";

    return {
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
        openedAt: new Date().toISOString()
    };
}

function toEpochMicros(pDateValue: string, pEndOfMinute = false): number | null {
    const vValue = String(pDateValue || "").trim();
    if (!vValue) {
        return null;
    }

    const objDate = new Date(vValue);
    if (Number.isNaN(objDate.getTime())) {
        const arrParts = vValue.split(/[T\s-:]/);
        if (arrParts.length >= 5) {
            const vYear = parseInt(arrParts[0], 10);
            const vMonth = parseInt(arrParts[1], 10) - 1;
            const vDay = parseInt(arrParts[2], 10);
            const vHour = parseInt(arrParts[3], 10) || 0;
            const vMin = parseInt(arrParts[4], 10) || 0;
            const vSec = pEndOfMinute ? 59 : (parseInt(arrParts[5], 10) || 0);
            const vMs = pEndOfMinute ? 999 : 0;
            return new Date(vYear, vMonth, vDay, vHour, vMin, vSec, vMs).getTime() * 1000;
        }
        return null;
    }

    if (pEndOfMinute) {
        objDate.setSeconds(59, 999);
    }

    return objDate.getTime() * 1000;
}

function formatOrderType(pValue: unknown): string {
    const vValue = String(pValue || "").trim();
    if (!vValue) {
        return "-";
    }
    return vValue.replaceAll("_", " ");
}

function mapLiveClosedPosition(pRow: DeltaOrderHistoryRow, pIndex: number) {
    const vSide = String(pRow.side || "").trim().toUpperCase();
    const vPrice = toFiniteNumber(pRow.average_fill_price, 0);
    const vQty = Math.abs(toFiniteNumber(pRow.size, 0));
    const vCommission = toFiniteNumber(pRow.paid_commission, 0);
    const vCreatedAt = String(pRow.created_at || pRow.updated_at || "").trim();
    const vUpdatedAt = String(pRow.updated_at || pRow.created_at || "").trim();
    const vPnl = toFiniteNumber(pRow.meta_data?.pnl, Number.NaN);
    const objMeta = (pRow.meta_data && typeof pRow.meta_data === "object") ? pRow.meta_data as Record<string, unknown> : {};
    const vEntryDelta = toFiniteNumber(
        objMeta.entry_delta ?? objMeta.entryDelta ?? objMeta.delta_entry ?? objMeta.delta,
        Number.NaN
    );
    const vCurrentDelta = toFiniteNumber(
        objMeta.current_delta ?? objMeta.currentDelta ?? objMeta.exit_delta ?? objMeta.exitDelta ?? objMeta.delta,
        Number.NaN
    );

    return {
        rowId: String(pRow.id ?? pRow.order_id ?? `fill-${pIndex}`),
        orderId: String(pRow.order_id || ""),
        symbol: String(pRow.product_symbol || "-"),
        side: vSide || "-",
        qty: vQty,
        buyPrice: vSide === "BUY" ? vPrice : null,
        sellPrice: vSide === "SELL" ? vPrice : null,
        price: vPrice,
        charges: vCommission,
        pnl: Number.isFinite(vPnl) ? vPnl : null,
        entryDelta: Number.isFinite(vEntryDelta) ? Math.abs(vEntryDelta) : null,
        currentDelta: Number.isFinite(vCurrentDelta) ? Math.abs(vCurrentDelta) : null,
        startAt: vCreatedAt,
        endAt: vUpdatedAt,
        orderType: formatOrderType(pRow.meta_data?.order_type)
    };
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
        redTpPct: 15,
        redSlPct: 85,
        greenOptQty: 1,
        greenReDelta: 0.53,
        greenTpPct: 15,
        greenSlPct: 85,
        trailGreenTp1Enabled: true,
        trailGreenSl1Enabled: true,
        trailRedTp1Enabled: true,
        trailRedSl1Enabled: true,
        greenOptQty2: 1,
        greenReDelta2: 0.53,
        greenTpPct2: 15,
        greenSlPct2: 85,
        redOptQty2: 1,
        redReDelta2: 0.53,
        redTpPct2: 15,
        redSlPct2: 85,
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
        negativePnlHedgeQty: 10,
        negativePnlHedgeExpiryMode: "1",
        negativePnlHedgeDelta: 0.53,
        negativePnlRecoveryTarget: 0,
        closedFromDate: "",
        closedToDate: "",
        telegramAlertsEnabled: false,
        telegramAlertTypes: [...gRollingOptionsTelegramEventTypes]
    };
}

function normalizeLiveNumber(pValue: unknown, pFallback: number): number {
    const vNumber = Number(pValue);
    return Number.isFinite(vNumber) ? vNumber : pFallback;
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

function getLiveRuleMetadataForColor(
    pUiState: Record<string, unknown>,
    pColorCode: "R" | "G",
    pReason: string,
    pEntryDelta: number,
    pSide: string,
    pRuleSet: 1 | 2 = 1
): RollingOptionsStrangleLivePositionMetadata {
    const objConfig = buildLiveRuleConfigFromUiState(pUiState, pRuleSet);
    const clamp01 = (pValue: number): number => Math.min(1, Math.max(0, pValue));
    const vEntryDelta = Math.abs(Number(pEntryDelta || 0.53));
    const vSide = String(pSide || "").trim().toUpperCase();
    const vIsBuy = vSide === "BUY";
    const vTpMove = clamp01(Number((pColorCode === "G" ? objConfig.greenTakeProfitPct : objConfig.redTakeProfitPct) ?? 15) / 100);
    const vSlMove = clamp01(Number((pColorCode === "G" ? objConfig.greenStopLossPct : objConfig.redStopLossPct) ?? 85) / 100);
    const vTakeProfitDelta = vIsBuy
        ? clamp01(vEntryDelta + vTpMove)
        : clamp01(vEntryDelta - vTpMove);
    const vRawStopLoss = vIsBuy ? (vEntryDelta - vSlMove) : (vEntryDelta + vSlMove);
    const vStopLossDelta = (!vIsBuy && vRawStopLoss > 1) ? vSlMove : clamp01(vRawStopLoss);

    if (pColorCode === "G") {
        return {
            ruleColor: "G",
            takeProfitDelta: vTakeProfitDelta,
            stopLossDelta: vStopLossDelta,
            reEntryDelta: Number(objConfig.greenReDelta ?? objConfig.reDelta ?? 0.53),
            openedReason: pReason,
            trailBestDelta: vEntryDelta,
            trailTpPeakDelta: vEntryDelta
        };
    }

    return {
        ruleColor: "R",
        takeProfitDelta: vTakeProfitDelta,
        stopLossDelta: vStopLossDelta,
        reEntryDelta: Number(objConfig.redReDelta ?? objConfig.reDelta ?? 0.53),
        openedReason: pReason,
        trailBestDelta: vEntryDelta,
        trailTpPeakDelta: vEntryDelta
    };
}

const gLiveStrategyCode = "rolling-options-strangle-live";

async function appendTrackedLivePositions(
    pUserId: string,
    pPositions: RollingOptionsStrangleLiveImportedPositionRecord[]
): Promise<RollingOptionsStrangleLiveImportedPositionRecord[]> {
    const arrExisting = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
    return replaceRollingOptionsStrangleLiveImportedPositions(pUserId, [...arrExisting, ...pPositions]);
}

async function removeTrackedLivePositions(
    pUserId: string,
    pPredicate: (pPosition: RollingOptionsStrangleLiveImportedPositionRecord) => boolean
): Promise<RollingOptionsStrangleLiveImportedPositionRecord[]> {
    const arrExisting = await listRollingOptionsStrangleLiveImportedPositions(pUserId);
    return replaceRollingOptionsStrangleLiveImportedPositions(pUserId, arrExisting.filter((objRow) => !pPredicate(objRow)));
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

export function renderRollingOptionsLivePage(req: Request, res: Response): void {
    res.render("rolling-options-strangle-live", {
        pageTitle: "Rolling Option Strangle - Live | Optionyze",
        currentAccount: req.authAccount,
        rollingTelegramEventTypes: gRollingOptionsTelegramEventTypes
    });
}

export async function getRollingOptionsStrangleLiveProfile(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const objProfile = await readLiveProfile(vUserId);
    res.json({
        status: "success",
        data: {
            ...objProfile,
            uiState: getMergedLiveUiState(objProfile)
        }
    });
}

export async function saveRollingOptionsStrangleLiveProfileController(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const objExisting = await readLiveProfile(vUserId);
    const vSelectedApiProfileId = String(req.body?.selectedApiProfileId || "").trim();
    const objIncomingUiState = req.body?.uiState && typeof req.body.uiState === "object"
        ? req.body.uiState as Record<string, unknown>
        : {};
    const objSaved = await saveRollingOptionsStrangleLiveProfile({
        ...objExisting,
        userId: vUserId,
        selectedApiProfileId: vSelectedApiProfileId || String(objExisting.selectedApiProfileId || "").trim(),
        uiState: normalizeLiveUiState({
            ...getMergedLiveUiState(objExisting),
            ...objIncomingUiState
        })
    });
    await syncLiveRuntimeProfileSelection(vUserId, objSaved.selectedApiProfileId);
    res.json({
        status: "success",
        message: "Live profile saved.",
        data: {
            ...objSaved,
            uiState: getMergedLiveUiState(objSaved)
        }
    });
}

export async function getRollingOptionsStrangleLiveConnectionStatus(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const objProfile = await readLiveProfile(vUserId);
    res.json({
        status: "success",
        data: {
            selectedApiProfileId: objProfile.selectedApiProfileId,
            connectionStatus: objProfile.connectionStatus
        }
    });
}

export async function getRollingOptionsStrangleLiveRuntimeStatus(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const objRuntime = await loadRollingOptionsStrangleLiveRuntime(vUserId);
    res.json({
        status: "success",
        data: objRuntime || {
            userId: vUserId,
            status: "idle",
            autoTraderEnabled: false,
            selectedApiProfileId: String((await readLiveProfile(vUserId)).selectedApiProfileId || "").trim(),
            currentSymbol: "",
            currentContractName: "",
            currentExpiryMode: "",
            currentExpiryDate: "",
            renkoEnabled: false,
            renkoPoints: 0,
            renkoSource: "",
            lastSpotPrice: null,
            lastFuturesPrice: null,
            lastSignal: "IDLE",
            lastCycleAt: "",
            lastError: "",
            state: {},
            updatedAt: ""
        }
    });
}

export async function enableRollingOptionsStrangleLiveAutoTrader(req: Request, res: Response, pService: RollingOptionsStrangleLiveService): Promise<void> {
    const vUserId = getAccountId(req);
    const objProfile = await readLiveProfile(vUserId);
    const vSelectedApiProfileId = String(objProfile.selectedApiProfileId || "").trim();
    if (!vSelectedApiProfileId) {
        res.status(400).json({ status: "warning", message: "Select an API profile before enabling live auto trader." });
        return;
    }

    const objCheck = await performRollingOptionsStrangleLiveConnectionCheck(vUserId, vSelectedApiProfileId);
    if (objCheck.profile.connectionStatus.state !== "connected") {
        res.status(400).json({
            status: "warning",
            message: objCheck.profile.connectionStatus.message || "Delta connection is not healthy.",
            data: objCheck.profile
        });
        return;
    }

    const objRuntime = await pService.startUser(vUserId);
    await logRollingOptionsStrangleLiveEvent({
        userId: vUserId,
        eventType: "engine_started",
        severity: "success",
        title: "Live Auto Trader Started",
        message: "Server-side live auto trader started.",
        payload: {
            symbol: objRuntime.currentSymbol || "",
            reason: "engine_started"
        }
    });
    res.json({
        status: "success",
        message: "Live auto trader enabled.",
        data: objRuntime
    });
}

export async function disableRollingOptionsStrangleLiveAutoTrader(req: Request, res: Response, pService: RollingOptionsStrangleLiveService): Promise<void> {
    const vUserId = getAccountId(req);
    const objRuntime = await pService.stopUser(vUserId);
    await logRollingOptionsStrangleLiveEvent({
        userId: vUserId,
        eventType: "engine_stopped",
        severity: "info",
        title: "Live Auto Trader Stopped",
        message: "Server-side live auto trader stopped.",
        payload: {
            symbol: objRuntime.currentSymbol || "",
            reason: "engine_stopped"
        }
    });
    res.json({
        status: "success",
        message: "Live auto trader disabled.",
        data: objRuntime
    });
}

export async function executeRollingOptionsStrangleLiveStrategy(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleLiveService
): Promise<void> {
    const vUserId = getAccountId(req);
    const objProfile = await readLiveProfile(vUserId);
    const vSelectedApiProfileId = String(objProfile.selectedApiProfileId || "").trim();
    if (!vSelectedApiProfileId) {
        res.status(400).json({ status: "warning", message: "Select an API profile before executing the live strategy." });
        return;
    }

    const objCheck = await performRollingOptionsStrangleLiveConnectionCheck(vUserId, vSelectedApiProfileId);
    if (objCheck.profile.connectionStatus.state !== "connected") {
        res.status(400).json({
            status: "warning",
            message: objCheck.profile.connectionStatus.message || "Delta connection is not healthy.",
            data: objCheck.profile
        });
        return;
    }

    const vRenkoColor = String(req.body?.renkoColor || "").trim().toUpperCase() === "G" ? "G" : "R";
    const objResult = await pService.executeStrategy(vUserId, vRenkoColor);
    const [objRuntime, arrPositions] = await Promise.all([
        loadRollingOptionsStrangleLiveRuntime(vUserId),
        listRollingOptionsStrangleLiveImportedPositions(vUserId)
    ]);

    res.json({
        status: objResult.status,
        message: objResult.message,
        data: {
            runtime: objRuntime,
            trackedOpenPositions: arrPositions
        }
    });
}

export async function runRollingOptionsStrangleLiveStrategyCycle(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleLiveService
): Promise<void> {
    const vUserId = getAccountId(req);
    const objProfile = await readLiveProfile(vUserId);
    const vSelectedApiProfileId = String(objProfile.selectedApiProfileId || "").trim();
    if (!vSelectedApiProfileId) {
        res.status(400).json({ status: "warning", message: "Select an API profile before running a live cycle." });
        return;
    }

    const objCheck = await performRollingOptionsStrangleLiveConnectionCheck(vUserId, vSelectedApiProfileId);
    if (objCheck.profile.connectionStatus.state !== "connected") {
        res.status(400).json({
            status: "warning",
            message: objCheck.profile.connectionStatus.message || "Delta connection is not healthy.",
            data: objCheck.profile
        });
        return;
    }

    const objResult = await pService.runCycle(vUserId);
    const [objRuntime, arrPositions] = await Promise.all([
        loadRollingOptionsStrangleLiveRuntime(vUserId),
        listRollingOptionsStrangleLiveImportedPositions(vUserId)
    ]);

    res.json({
        status: objResult.status,
        message: objResult.message,
        data: {
            runtime: objRuntime,
            trackedOpenPositions: arrPositions
        }
    });
}

export async function executeRollingOptionsStrangleLiveKillSwitch(req: Request, res: Response, pService: RollingOptionsStrangleLiveService): Promise<void> {
    const vUserId = getAccountId(req);
    const objProfile = await readLiveProfile(vUserId);
    const vSelectedApiProfileId = String(objProfile.selectedApiProfileId || "").trim();
    if (!vSelectedApiProfileId) {
        res.status(400).json({ status: "warning", message: "Select an API profile before using the live kill switch." });
        return;
    }

    const objCheck = await performRollingOptionsStrangleLiveConnectionCheck(vUserId, vSelectedApiProfileId);
    if (objCheck.profile.connectionStatus.state !== "connected") {
        res.status(400).json({
            status: "warning",
            message: objCheck.profile.connectionStatus.message || "Delta connection is not healthy.",
            data: objCheck.profile
        });
        return;
    }

    try {
        const objResult = await pService.emergencyStopUser(vUserId);
        res.json({
            status: "success",
            message: objResult.closedPositions.length > 0
                ? `Kill switch closed ${objResult.closedPositions.length} live position${objResult.closedPositions.length === 1 ? "" : "s"} and stopped auto trader.`
                : "Kill switch stopped auto trader. No saved imported live positions were open.",
            data: {
                runtime: objResult.runtime,
                closedPositions: objResult.closedPositions
            }
        });
    }
    catch (objError) {
        await logRollingOptionsStrangleLiveEvent({
            userId: vUserId,
            eventType: "engine_error",
            severity: "error",
            title: "Kill Switch Failed",
            message: getErrorMessage(objError, "Unable to complete live kill switch."),
            payload: {
                reason: "kill_switch_error"
            }
        });
        res.status(500).json({
            status: "danger",
            message: getErrorMessage(objError, "Unable to complete live kill switch.")
        });
    }
}

export async function executeRollingOptionsStrangleLiveManualFuture(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const objProfile = await readLiveProfile(vUserId);
    const objUiState = getMergedLiveUiState(objProfile);
    const vSelectedApiProfileId = String(objProfile.selectedApiProfileId || "").trim();
    if (!vSelectedApiProfileId) {
        res.status(400).json({ status: "warning", message: "Select an API profile before placing live future orders." });
        return;
    }

    const objCheck = await performRollingOptionsStrangleLiveConnectionCheck(vUserId, vSelectedApiProfileId);
    if (objCheck.profile.connectionStatus.state !== "connected") {
        res.status(400).json({
            status: "warning",
            message: objCheck.profile.connectionStatus.message || "Delta connection is not healthy.",
            data: objCheck.profile
        });
        return;
    }

    if (!Boolean(objUiState.futuresEnabled ?? true)) {
        res.status(400).json({
            status: "warning",
            message: "Futures are disabled (FUT Enabled is OFF)."
        });
        return;
    }

    const vAction = String(req.body?.action || "").trim().toUpperCase();
    const vSide = vAction === "SELL" ? "sell" : (vAction === "BUY" ? "buy" : "");
    const vSymbol = String(req.body?.symbol || "BTC").trim().toUpperCase();
    const vQty = Math.max(1, Math.floor(Number(req.body?.qty || 1)));
    const vOrderType = String(req.body?.orderType || "market_order").trim() === "limit_order"
        ? "limit_order"
        : "market_order";

    if (!vSide) {
        res.status(400).json({ status: "warning", message: "Future action must be BUY or SELL." });
        return;
    }

    try {
        const { client, profile } = await getDeltaClientForAccountId(vUserId, vSelectedApiProfileId);
        const vProductSymbol = getContractNameForSymbol(vSymbol);
        const objSnapshot = await getLiveMarketSnapshot({
            symbol: vSymbol,
            contractName: vProductSymbol,
            lotSize: getLotSizeForSymbol(vSymbol),
            futureQty: vQty,
            futureOrderType: vOrderType,
            action: vSide,
            legSide: "ce",
            expiryMode: "1",
            expiryDate: "",
            optionQty: 1,
            redOptionQtyPct: 100,
            greenOptionQtyPct: 100,
            newDelta: 0.53,
            reDelta: 0.53,
            deltaTakeProfit: 0.15,
            deltaStopLoss: 0.85,
            reEnter: false,
            addOneLotFuture: false,
            renkoEnabled: false,
            renkoStepPoints: 10,
            renkoPriceSource: "spot_price",
            loopSeconds: 8
        });

        const objOrderPayload: Record<string, unknown> = {
            product_symbol: vProductSymbol,
            size: vQty,
            side: vSide,
            order_type: vOrderType,
            time_in_force: "gtc",
            post_only: false,
            reduce_only: false
        };
        if (vOrderType === "limit_order") {
            objOrderPayload.limit_price = String(objSnapshot.futuresPrice);
        }

        const objResponse = await client.apis.Orders.placeOrder({
            order: objOrderPayload
        });
        const objPayload = readResponsePayload(objResponse);
        await logRollingOptionsStrangleLiveEvent({
            userId: vUserId,
            eventType: "future_opened",
            severity: "success",
            title: `${vAction} Future Order Placed`,
            message: `${vAction} future live order placed using ${profile.referenceName}.`,
            payload: {
                symbol: vSymbol,
                contractName: vProductSymbol,
                qty: vQty,
                reason: "manual_future"
            }
        });
        const arrTrackedPositions = await appendTrackedLivePositions(vUserId, [{
            userId: vUserId,
            importId: crypto.randomUUID(),
            contractName: vProductSymbol,
            side: vAction,
            qty: vQty,
            entryPrice: Number(objSnapshot.futuresPrice || 0),
            markPrice: Number(objSnapshot.futuresPrice || 0),
            entryDelta: null,
            currentDelta: null,
            charges: 0,
            pnl: 0,
            margin: 0,
            liquidationPrice: 0,
            openedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }]);

        res.json({
            status: "success",
            message: `${vAction} future live order placed using ${profile.referenceName}.`,
            data: {
                order: objPayload.result || objPayload,
                request: objOrderPayload,
                trackedOpenPositions: arrTrackedPositions,
                snapshot: {
                    productSymbol: vProductSymbol,
                    futuresPrice: objSnapshot.futuresPrice,
                    spotPrice: objSnapshot.spotPrice
                }
            }
        });
    }
    catch (objError) {
        await logRollingOptionsStrangleLiveEvent({
            userId: vUserId,
            eventType: "engine_error",
            severity: "error",
            title: "Future Order Failed",
            message: getErrorMessage(objError, "Unable to place live future order."),
            payload: {
                symbol: vSymbol,
                qty: vQty,
                reason: "manual_future_error"
            }
        });
        res.status(500).json({
            status: "danger",
            message: getErrorMessage(objError, "Unable to place live future order.")
        });
    }
}

export async function executeRollingOptionsStrangleLiveManualOption(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const objProfile = await readLiveProfile(vUserId);
    const vSelectedApiProfileId = String(objProfile.selectedApiProfileId || "").trim();
    if (!vSelectedApiProfileId) {
        res.status(400).json({ status: "warning", message: "Select an API profile before placing live option orders." });
        return;
    }

    const objCheck = await performRollingOptionsStrangleLiveConnectionCheck(vUserId, vSelectedApiProfileId);
    if (objCheck.profile.connectionStatus.state !== "connected") {
        res.status(400).json({
            status: "warning",
            message: objCheck.profile.connectionStatus.message || "Delta connection is not healthy.",
            data: objCheck.profile
        });
        return;
    }

    const vOperation = String(req.body?.operation || "open").trim().toLowerCase() === "exit" ? "exit" : "open";
    const vRuleSet: 1 | 2 = String(req.body?.ruleSet || "").trim() === "2" ? 2 : 1;
    const objProfileState = await readLiveProfile(vUserId);
    const objUiState = getMergedLiveUiState(objProfileState);
    const vAction = String(
        req.body?.action
        || (vRuleSet === 2 ? objUiState.action2 : objUiState.action1)
        || ""
    ).trim().toLowerCase();
    const vSymbol = String(req.body?.symbol || objUiState.symbol || "BTC").trim().toUpperCase();
    const vLegSide = String(
        req.body?.legSide
        || (vRuleSet === 2 ? objUiState.legSide2 : objUiState.legSide1)
        || (vRuleSet === 2 ? "pe" : "ce")
    ).trim().toLowerCase();
    const vExpiryMode = String(
        req.body?.expiryMode
        || (vRuleSet === 2 ? objUiState.expiryMode2 : objUiState.expiryMode1)
        || "1"
    ).trim() as "1" | "2" | "4" | "5" | "6" | "7";
    const vExpiryDate = String(
        req.body?.expiryDate
        || (vRuleSet === 2 ? objUiState.expiryDate2 : objUiState.expiryDate1)
        || ""
    ).trim();
    const vQty = Math.max(1, Math.floor(Number(
        req.body?.qty
        || (vRuleSet === 2 ? objUiState.manualOptQty2 : objUiState.manualOptQty1)
        || 1
    )));
    const vTargetDelta = Math.max(0, Number(
        req.body?.targetDelta
        || (vRuleSet === 2
            ? (String(req.body?.renkoColor || "").trim().toUpperCase() === "G"
                ? objUiState.greenReDelta2
                : objUiState.redReDelta2)
            : (String(req.body?.renkoColor || "").trim().toUpperCase() === "G"
                ? objUiState.greenReDelta
                : objUiState.reRedDelta))
        || 0.53
    ));
    const vReason = String(req.body?.reason || "").trim();
    const vSourceImportId = String(req.body?.sourceImportId || "").trim();

    if (vAction !== "buy" && vAction !== "sell") {
        res.status(400).json({ status: "warning", message: "Select a valid option action before placing a live option order." });
        return;
    }
    if (!vExpiryDate) {
        res.status(400).json({ status: "warning", message: "Select an expiry date before placing a live option order." });
        return;
    }

    const arrOptionSides: Array<"CE" | "PE"> = vLegSide === "both"
        ? ["CE", "PE"]
        : [vLegSide === "pe" ? "PE" : "CE"];
    try {
        const { client, profile } = await getDeltaClientForAccountId(vUserId, vSelectedApiProfileId);
        const arrOrders: Array<Record<string, unknown>> = [];
        const arrContracts: Array<Record<string, unknown>> = [];
        if (vOperation === "exit") {
            const arrTrackedTargets = (await listRollingOptionsStrangleLiveImportedPositions(vUserId)).filter((objRow) => {
                const vContractName = String(objRow.contractName || "").trim();
                const vStoredRuleSet = Number(objRow.metadata?.ruleSet) === 2 ? 2 : 1;
                const vStoredSide = String(objRow.side || "").trim().toUpperCase();
                const vOptionSide = getOptionSideFromContractName(vContractName);
                return Boolean(vContractName)
                    && (vContractName.toUpperCase().startsWith("C-") || vContractName.toUpperCase().startsWith("P-"))
                    && vStoredRuleSet === vRuleSet
                    && vStoredSide === vAction.toUpperCase()
                    && arrOptionSides.includes(vOptionSide as "CE" | "PE")
                    && vContractName.toUpperCase().includes(vSymbol);
            });

            if (!arrTrackedTargets.length) {
                res.status(400).json({
                    status: "warning",
                    message: `No tracked live option positions were found for Rule Set ${vRuleSet} and the selected leg filter.`
                });
                return;
            }

            for (const objTrackedPosition of arrTrackedTargets) {
                const objOrderPayload: Record<string, unknown> = {
                    product_symbol: objTrackedPosition.contractName,
                    size: Math.max(1, Math.floor(Number(objTrackedPosition.qty || 0))),
                    side: String(objTrackedPosition.side || "").trim().toUpperCase() === "SELL" ? "buy" : "sell",
                    order_type: "market_order",
                    time_in_force: "gtc",
                    post_only: false,
                    reduce_only: true
                };
                const objResponse = await client.apis.Orders.placeOrder({
                    order: objOrderPayload
                });
                const objPayload = readResponsePayload(objResponse);
                arrOrders.push({
                    order: objPayload.result || objPayload,
                    request: objOrderPayload
                });
                arrContracts.push({
                    contractSymbol: objTrackedPosition.contractName,
                    optionSide: getOptionSideFromContractName(objTrackedPosition.contractName),
                    strike: null,
                    delta: objTrackedPosition.currentDelta ?? objTrackedPosition.entryDelta,
                    markPrice: objTrackedPosition.markPrice,
                    requestedExpiryDate: "",
                    resolvedExpiryDate: "",
                    usedNextDayExpiryFallback: false
                });
            }

            const objClosedImportIds = new Set(
                arrTrackedTargets
                    .map((objRow) => String(objRow.importId || "").trim())
                    .filter(Boolean)
            );
            const arrTrackedPositions = await removeTrackedLivePositions(vUserId, (objRow) => {
                return objClosedImportIds.has(String(objRow.importId || "").trim());
            });

            await logRollingOptionsStrangleLiveEvent({
                userId: vUserId,
                eventType: "option_closed",
                severity: "success",
                title: "Manual Option Exit Placed",
                message: `Exit option live order${arrOrders.length === 1 ? "" : "s"} placed using ${profile.referenceName}.`,
                payload: {
                    symbol: vSymbol,
                    qty: arrTrackedTargets.reduce((pSum, objRow) => pSum + Math.max(0, Number(objRow.qty || 0)), 0),
                    reason: "manual_option_exit",
                    ruleSet: vRuleSet
                }
            });

            res.json({
                status: "success",
                message: `Exit option live order${arrOrders.length === 1 ? "" : "s"} placed using ${profile.referenceName}.`,
                data: {
                    operation: vOperation,
                    action: vAction,
                    qty: arrTrackedTargets.reduce((pSum, objRow) => pSum + Math.max(0, Number(objRow.qty || 0)), 0),
                    orders: arrOrders,
                    contracts: arrContracts,
                    trackedOpenPositions: arrTrackedPositions
                }
            });
            return;
        }

        const objConfig = {
            symbol: vSymbol,
            contractName: getContractNameForSymbol(vSymbol),
            lotSize: getLotSizeForSymbol(vSymbol),
            futureQty: 1,
            futureOrderType: "market_order" as const,
            action: vAction === "buy" ? "buy" as const : "sell" as const,
            legSide: vLegSide === "both" ? "both" as const : (vLegSide === "pe" ? "pe" as const : "ce" as const),
            expiryMode: ["1", "2", "4", "5", "6", "7"].includes(vExpiryMode) ? vExpiryMode : "1",
            expiryDate: vExpiryDate,
            optionQty: vQty,
            redOptionQtyPct: 100,
            greenOptionQtyPct: 100,
            newDelta: vTargetDelta,
            reDelta: vTargetDelta,
            deltaTakeProfit: 0.15,
            deltaStopLoss: 0.85,
            reEnter: false,
            addOneLotFuture: false,
            renkoEnabled: false,
            renkoStepPoints: 10,
            renkoPriceSource: "spot_price" as const,
            loopSeconds: 8
        };
        const objRuntime = await loadRollingOptionsStrangleLiveRuntime(vUserId);
        const vRuleColor: "R" | "G" = String(objRuntime?.state?.renkoLastColor || "").trim().toUpperCase() === "G" ? "G" : "R";
        const objRuleConfig = buildLiveRuleConfigFromUiState(objUiState, vRuleSet);
        const vReEntryDelta = Number.isFinite(vTargetDelta) && vTargetDelta > 0
            ? vTargetDelta
            : (vRuleColor === "G"
                ? Number(objRuleConfig.greenReDelta ?? objRuleConfig.reDelta ?? 0.53)
                : Number(objRuleConfig.redReDelta ?? objRuleConfig.reDelta ?? 0.53));

        for (const vOptionSide of arrOptionSides) {
            const objContract = await findBestLiveOptionContract(
                objConfig,
                vOptionSide,
                vReEntryDelta,
                false,
                RE_DELTA_TOLERANCE
            );
            if (!objContract) {
                throw new Error(`No live ${vOptionSide} contract was found for ${vSymbol} within +/- ${RE_DELTA_TOLERANCE.toFixed(2)} of Re D ${vReEntryDelta.toFixed(2)}.`);
            }

            const objOrderPayload: Record<string, unknown> = {
                product_symbol: objContract.contractSymbol,
                size: vQty,
                side: vAction,
                order_type: "market_order",
                time_in_force: "gtc",
                post_only: false,
                reduce_only: false
            };

            const objResponse = await client.apis.Orders.placeOrder({
                order: objOrderPayload
            });
            const objPayload = readResponsePayload(objResponse);

            arrOrders.push({
                order: objPayload.result || objPayload,
                request: objOrderPayload
            });
            arrContracts.push({
                contractSymbol: objContract.contractSymbol,
                optionSide: objContract.optionSide,
                strike: objContract.strike,
                delta: objContract.delta,
                markPrice: objContract.markPrice,
                requestedExpiryDate: objContract.requestedExpiryDate,
                resolvedExpiryDate: objContract.expiryDate,
                usedNextDayExpiryFallback: objContract.usedNextDayFallback
            });
        }

        await logRollingOptionsStrangleLiveEvent({
            userId: vUserId,
            eventType: "option_opened",
            severity: "success",
            title: "Manual Option Opened",
            message: `Open option live order${arrOrders.length === 1 ? "" : "s"} placed using ${profile.referenceName}.`,
            payload: {
                symbol: vSymbol,
                qty: vQty,
                reason: "manual_option_open",
                ruleSet: vRuleSet
            }
        });
        let arrTrackedPositions = await listRollingOptionsStrangleLiveImportedPositions(vUserId);
        if (vOperation === "open") {
            arrTrackedPositions = await appendTrackedLivePositions(vUserId, arrContracts.map((objContract) => {
                const objRow: RollingOptionsStrangleLiveImportedPositionRecord = {
                    userId: vUserId,
                    importId: crypto.randomUUID(),
                    contractName: String(objContract.contractSymbol || "").trim(),
                    side: vAction.toUpperCase(),
                    qty: vQty,
                    entryPrice: Number(objContract.markPrice || 0),
                    markPrice: Number(objContract.markPrice || 0),
                    entryDelta: Number.isFinite(Number(objContract.delta)) ? Math.abs(Number(objContract.delta)) : null,
                    currentDelta: Number.isFinite(Number(objContract.delta)) ? Math.abs(Number(objContract.delta)) : null,
                    charges: 0,
                    pnl: 0,
                    margin: 0,
                    liquidationPrice: 0,
                    metadata: {
                        ...getLiveRuleMetadataForColor(
                            objUiState,
                            vRuleColor,
                            "manual_option_open",
                            Number.isFinite(Number(objContract.delta)) ? Math.abs(Number(objContract.delta)) : 0.53,
                            vAction.toUpperCase(),
                            vRuleSet
                        ),
                        ruleSet: vRuleSet,
                        reEnter: Boolean(vRuleSet === 2 ? objUiState.reEnter2 : objUiState.reEnter1),
                        reason: vReason || "manual_option_open",
                        negativePnlAdjustment: vReason === "negative_pnl_auto_adjustment",
                        sourceImportId: vSourceImportId
                    },
                    openedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                return objRow;
            }));
        }
        res.json({
            status: "success",
            message: `Open option live order${arrOrders.length === 1 ? "" : "s"} placed using ${profile.referenceName}.`,
            data: {
                operation: vOperation,
                action: vAction,
                qty: vQty,
                orders: arrOrders,
                contracts: arrContracts,
                trackedOpenPositions: arrTrackedPositions
            }
        });
    }
    catch (objError) {
        await logRollingOptionsStrangleLiveEvent({
            userId: vUserId,
            eventType: "engine_error",
            severity: "error",
            title: "Option Order Failed",
            message: getErrorMessage(objError, "Unable to place live option order."),
            payload: {
                symbol: vSymbol,
                qty: vQty,
                reason: "manual_option_error"
            }
        });
        res.status(500).json({
            status: "danger",
            message: getErrorMessage(objError, "Unable to place live option order.")
        });
    }
}

export async function closeRollingOptionsStrangleLiveImportedOpenPosition(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleLiveService
): Promise<void> {
    const vUserId = getAccountId(req);
    const objProfile = await readLiveProfile(vUserId);
    const vSelectedApiProfileId = String(objProfile.selectedApiProfileId || "").trim();
    if (!vSelectedApiProfileId) {
        res.status(400).json({ status: "warning", message: "Select an API profile before closing live positions." });
        return;
    }

    const objCheck = await performRollingOptionsStrangleLiveConnectionCheck(vUserId, vSelectedApiProfileId);
    if (objCheck.profile.connectionStatus.state !== "connected") {
        res.status(400).json({
            status: "warning",
            message: objCheck.profile.connectionStatus.message || "Delta connection is not healthy.",
            data: objCheck.profile
        });
        return;
    }

    const vContractName = String(req.body?.contractName || "").trim();
    const vSide = String(req.body?.side || "").trim().toUpperCase();
    const vQty = Math.max(1, Math.floor(Number(req.body?.qty || 0)));
    const vImportId = String(req.body?.importId || "").trim();
    if (!vContractName) {
        res.status(400).json({ status: "warning", message: "Contract name is required to close an imported live position." });
        return;
    }
    if (vSide !== "BUY" && vSide !== "SELL") {
        res.status(400).json({ status: "warning", message: "Imported live position side must be BUY or SELL." });
        return;
    }
    if (!(vQty > 0)) {
        res.status(400).json({ status: "warning", message: "Imported live position quantity must be greater than zero." });
        return;
    }

    try {
        const { client, profile } = await getDeltaClientForAccountId(vUserId, vSelectedApiProfileId);
        const vCloseSide = vSide === "BUY" ? "sell" : "buy";
        const objOrderPayload: Record<string, unknown> = {
            product_symbol: vContractName,
            size: vQty,
            side: vCloseSide,
            order_type: "market_order",
            time_in_force: "gtc",
            post_only: false,
            reduce_only: true
        };
        const objResponse = await client.apis.Orders.placeOrder({
            order: objOrderPayload
        });
        const objPayload = readResponsePayload(objResponse);
        const arrTrackedBeforeClose = await listRollingOptionsStrangleLiveImportedPositions(vUserId);
        const objClosedTrackedPosition = arrTrackedBeforeClose.find((objRow) => {
            return vImportId
                ? String(objRow.importId || "").trim() === vImportId
                : String(objRow.contractName || "").trim() === vContractName && String(objRow.side || "").trim().toUpperCase() === vSide;
        }) || {
            userId: vUserId,
            importId: vImportId || crypto.randomUUID(),
            contractName: vContractName,
            side: vSide,
            qty: vQty,
            entryPrice: 0,
            markPrice: 0,
            entryDelta: null,
            currentDelta: null,
            charges: 0,
            pnl: 0,
            margin: 0,
            liquidationPrice: 0,
            openedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        } satisfies RollingOptionsStrangleLiveImportedPositionRecord;

        if (vImportId) {
            await deleteRollingOptionsStrangleLiveImportedPosition(vUserId, vImportId);
        }
        const vIsOptionContract = vContractName.toUpperCase().startsWith("C-") || vContractName.toUpperCase().startsWith("P-");
        if (vIsOptionContract) {
            await pService.reEnterClosedOptionPositions(vUserId, [objClosedTrackedPosition], "Manual row close");
        }
        await logRollingOptionsStrangleLiveEvent({
            userId: vUserId,
            eventType: "option_closed",
            severity: "warning",
            title: "Imported Position Closed",
            message: `Close order placed on Delta Exchange for ${vContractName} using ${profile.referenceName}.`,
            payload: {
                contractName: vContractName,
                qty: vQty,
                reason: "manual_imported_position_close"
            }
        });
        res.json({
            status: "success",
            message: `Close order placed on Delta Exchange for ${vContractName} using ${profile.referenceName}.`,
            data: {
                order: objPayload.result || objPayload,
                request: objOrderPayload
            }
        });
    }
    catch (objError) {
        await logRollingOptionsStrangleLiveEvent({
            userId: vUserId,
            eventType: "engine_error",
            severity: "error",
            title: "Imported Position Close Failed",
            message: getErrorMessage(objError, "Unable to close imported live position on Delta Exchange."),
            payload: {
                contractName: vContractName,
                qty: vQty,
                reason: "manual_imported_position_close_error"
            }
        });
        res.status(500).json({
            status: "danger",
            message: getErrorMessage(objError, "Unable to close imported live position on Delta Exchange.")
        });
    }
}

export async function getRollingOptionsStrangleLiveOpenPositions(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const arrPositions = await listRollingOptionsStrangleLiveImportedPositions(vUserId);
    res.json({
        status: "success",
        data: arrPositions
    });
}

export async function reconcileRollingOptionsStrangleLiveOpenPositions(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleLiveService
): Promise<void> {
    const vUserId = getAccountId(req);
    const objProfile = await readLiveProfile(vUserId);
    const vSelectedApiProfileId = String(objProfile.selectedApiProfileId || "").trim();
    if (!vSelectedApiProfileId) {
        res.status(400).json({ status: "warning", message: "Select an API profile before reconciling live positions." });
        return;
    }

    const objCheck = await performRollingOptionsStrangleLiveConnectionCheck(vUserId, vSelectedApiProfileId);
    if (objCheck.profile.connectionStatus.state !== "connected") {
        res.status(400).json({
            status: "warning",
            message: objCheck.profile.connectionStatus.message || "Delta connection is not healthy.",
            data: objCheck.profile
        });
        return;
    }

    const arrPositions = await pService.reconcileUserPositions(vUserId, String(req.body?.symbol || req.query?.symbol || "").trim().toUpperCase());
    res.json({
        status: "success",
        message: `Reconciled ${arrPositions.length} live position${arrPositions.length === 1 ? "" : "s"} with Delta Exchange.`,
        data: arrPositions
    });
}

export async function setRollingOptionsStrangleLiveManualRenkoSignal(
    req: Request,
    res: Response,
    pService: RollingOptionsStrangleLiveService
): Promise<void> {
    const vUserId = getAccountId(req);
    const vColor = String(req.body?.color || "").trim().toUpperCase() === "G" ? "G" : "R";
    const objRuntime = await pService.setManualRenkoSignal(vUserId, vColor);
    res.json({
        status: "success",
        message: `Renko box changed to ${vColor}.`,
        data: objRuntime
    });
}

export async function getRollingOptionsStrangleLiveEvents(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const arrEvents = await listRollingOptionsEventsByStrategy(vUserId, gLiveStrategyCode, 100);
    res.json({
        status: "success",
        data: arrEvents
    });
}

export async function updateRollingOptionsStrangleLiveRuleSettings(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const vColor: "R" | "G" = String(req.body?.color || "").trim().toUpperCase() === "G" ? "G" : "R";
    const vRuleSet: 1 | 2 = String(req.body?.ruleSet || "").trim() === "2" ? 2 : 1;
    const objProfile = await loadRollingOptionsStrangleLiveProfile(vUserId);
    const objUiState = getMergedLiveUiState(objProfile);
    const arrPositions = await listRollingOptionsStrangleLiveImportedPositions(vUserId);
    let vUpdated = 0;
    let vLastTakeProfitDelta = 0;
    let vLastStopLossDelta = 0;
    let vLastReEntryDelta = 0;
    let vUpdatedQty = 0;
    const arrUpdated = arrPositions.map((objRow) => {
        const vContractName = String(objRow.contractName || "").trim();
        const bIsOption = vContractName.toUpperCase().startsWith("C-") || vContractName.toUpperCase().startsWith("P-");
        if (!bIsOption) {
            return objRow;
        }
        const vRuleColor = String(objRow.metadata?.ruleColor || "").trim().toUpperCase() === "G" ? "G" : "R";
        const vStoredRuleSet = Number(objRow.metadata?.ruleSet) === 2 ? 2 : 1;
        if (vRuleColor !== vColor) {
            return objRow;
        }
        if (vStoredRuleSet !== vRuleSet) {
            return objRow;
        }

        const vEntryDelta = Math.abs(Number(objRow.entryDelta ?? objRow.currentDelta ?? 0.53));
        const vSide = String(objRow.side || "").trim().toUpperCase();
        const objNewMeta = getLiveRuleMetadataForColor(objUiState, vColor, "manual_rule_update", vEntryDelta, vSide, vRuleSet);
        const objNewMetaValues = objNewMeta as Record<string, unknown>;
        vLastTakeProfitDelta = Number(objNewMetaValues.takeProfitDelta ?? objNewMetaValues.deltaTakeProfit ?? 0);
        vLastStopLossDelta = Number(objNewMetaValues.stopLossDelta ?? objNewMetaValues.deltaStopLoss ?? 0);
        vLastReEntryDelta = Number(objNewMetaValues.reEntryDelta ?? 0);
        vUpdated += 1;
        vUpdatedQty += Math.max(0, Number(objRow.qty || 0));
        return {
            ...objRow,
            metadata: {
                ...(objRow.metadata || {}),
                ...objNewMeta
            }
        };
    });

    await replaceRollingOptionsStrangleLiveImportedPositions(vUserId, arrUpdated);
    const vActionLabel = `Action ${vRuleSet}`;
    const vColorLabel = vColor === "G" ? "Green" : "Red";
    const vMessage = vUpdated > 0
        ? `${vActionLabel} ${vColorLabel} live rule settings applied to ${vUpdated} open option position${vUpdated === 1 ? "" : "s"}. Total qty ${vUpdatedQty}. TP/SL target deltas were recalculated from each leg entry delta; Re-entry delta is ${vLastReEntryDelta}. Trailing TP/SL memory was reset to the new settings. Last recalculated TP delta: ${vLastTakeProfitDelta.toFixed(4)}, SL delta: ${vLastStopLossDelta.toFixed(4)}.`
        : `${vActionLabel} ${vColorLabel} live rule settings saved, but no matching open option positions were found to reset.`;
    res.json({
        status: "success",
        message: vMessage,
        data: {
            updated: vUpdated,
            trackedOpenPositions: arrUpdated
        }
    });
}

export async function clearRollingOptionsStrangleLiveEventsController(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const vDeletedCount = await clearRollingOptionsEventsByStrategy(vUserId, gLiveStrategyCode);
    res.json({
        status: "success",
        message: `Cleared ${vDeletedCount} live activity log event${vDeletedCount === 1 ? "" : "s"}.`
    });
}

export async function saveRollingOptionsStrangleLiveOpenPositions(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const arrIncoming = Array.isArray(req.body?.positions) ? req.body.positions as Array<Record<string, unknown>> : [];
    const arrSaved = await replaceRollingOptionsStrangleLiveImportedPositions(vUserId, arrIncoming.map((objRow) => ({
        userId: vUserId,
        importId: String(objRow.importId || "").trim(),
        contractName: String(objRow.contractName || "").trim(),
        side: String(objRow.side || "").trim().toUpperCase(),
        qty: Number(objRow.qty || 0),
        entryPrice: Number(objRow.entryPrice || 0),
        markPrice: Number(objRow.markPrice || 0),
        entryDelta: objRow.entryDelta === null || objRow.entryDelta === undefined ? null : Number(objRow.entryDelta),
        currentDelta: objRow.currentDelta === null || objRow.currentDelta === undefined ? null : Number(objRow.currentDelta),
        charges: Number(objRow.charges || 0),
        pnl: Number(objRow.pnl || 0),
        margin: Number(objRow.margin || 0),
        liquidationPrice: Number(objRow.liquidationPrice || 0),
        metadata: objRow.metadata && typeof objRow.metadata === "object" ? objRow.metadata as RollingOptionsStrangleLivePositionMetadata : undefined,
        openedAt: String(objRow.openedAt || "").trim(),
        updatedAt: ""
    }) satisfies RollingOptionsStrangleLiveImportedPositionRecord));
    await logRollingOptionsStrangleLiveEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "info",
        title: "Imported Live Positions Updated",
        message: arrSaved.length
            ? `Saved ${arrSaved.length} imported live position${arrSaved.length === 1 ? "" : "s"} in the open grid.`
            : "Cleared imported live positions from the open grid.",
        payload: {
            qty: arrSaved.length,
            reason: "imported_positions_saved"
        }
    });

    res.json({
        status: "success",
        message: "Imported open positions saved.",
        data: arrSaved
    });
}

export async function deleteRollingOptionsStrangleLiveOpenPosition(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const vImportId = String(req.body?.importId || "").trim();
    if (!vImportId) {
        res.status(400).json({ status: "warning", message: "Import position id is required." });
        return;
    }

    await deleteRollingOptionsStrangleLiveImportedPosition(vUserId, vImportId);
    await logRollingOptionsStrangleLiveEvent({
        userId: vUserId,
        eventType: "manual_action",
        severity: "info",
        title: "Imported Position Removed",
        message: "Imported open position removed from the live page only. No Delta Exchange order was placed.",
        payload: {
            qty: 1,
            reason: "imported_position_removed"
        }
    });
    res.json({
        status: "success",
        message: "Imported open position removed from the live page.",
        data: { importId: vImportId }
    });
}

export async function performRollingOptionsStrangleLiveConnectionCheck(
    pUserId: string,
    pProfileId = ""
): Promise<{
    profile: Awaited<ReturnType<typeof readLiveProfile>>;
    summary: {
        currency: string;
        availableBalance: number;
        blockedMargin: number;
    } | null;
}> {
    const objProfile = await readLiveProfile(pUserId);
    const vProfileId = String(pProfileId || objProfile.selectedApiProfileId || "").trim();
    const vNow = new Date().toISOString();

    if (!vProfileId) {
        const objStatus: RollingOptionsStrangleLiveConnectionStatus = {
            ...objProfile.connectionStatus,
            state: "not_selected",
            message: "Select an API profile to start live connection checks.",
            lastCheckedAt: vNow
        };
        return {
            profile: await saveRollingOptionsStrangleLiveProfile({
                ...objProfile,
                userId: pUserId,
                selectedApiProfileId: "",
                connectionStatus: objStatus
            }),
            summary: null
        };
    }

    try {
        const { client, profile } = await getDeltaClientForAccountId(pUserId, vProfileId);
        const objResponse = await client.apis.Wallet.getBalances();
        const objPayload = readResponsePayload(objResponse);
        const arrRows = Array.isArray(objPayload.result) ? objPayload.result as DeltaWalletBalanceRow[] : [];
        const objUsdRow = pickUsdBalanceRow(arrRows);
        const vOutboundIp = await getOutboundPublicIp();
        const objStatus: RollingOptionsStrangleLiveConnectionStatus = {
            ...objProfile.connectionStatus,
            state: "connected",
            message: `Connected to Delta API profile ${profile.referenceName}.`,
            outboundIp: vOutboundIp,
            lastCheckedAt: vNow,
            lastSuccessAt: vNow,
            consecutiveFailures: 0
        };
        return {
            profile: await saveRollingOptionsStrangleLiveProfile({
                ...objProfile,
                userId: pUserId,
                selectedApiProfileId: vProfileId,
                connectionStatus: objStatus
            }),
            summary: {
                currency: String(objUsdRow?.asset_symbol || objUsdRow?.symbol || "USD").toUpperCase(),
                availableBalance: Number(getAvailableBalanceUsd(objUsdRow).toFixed(2)),
                blockedMargin: Number(getBlockedMarginUsd(objUsdRow).toFixed(2))
            }
        };
    }
    catch (objError) {
        const objFriendly = await getFriendlyDeltaConnectionError(objError);
        const vFailures = Number(objProfile.connectionStatus?.consecutiveFailures || 0) + 1;
        const objStatus: RollingOptionsStrangleLiveConnectionStatus = {
            ...objProfile.connectionStatus,
            state: objFriendly.state,
            message: objFriendly.message,
            outboundIp: objFriendly.outboundIp,
            lastCheckedAt: vNow,
            consecutiveFailures: vFailures
        };
        const objSaved = await saveRollingOptionsStrangleLiveProfile({
            ...objProfile,
            userId: pUserId,
            selectedApiProfileId: vProfileId,
            connectionStatus: objStatus
        });

        const vPreviousAlertKey = `${objProfile.connectionStatus?.alertState || ""}|${objProfile.connectionStatus?.alertMessage || ""}`;
        const vCurrentAlertKey = `${objStatus.state}|${objStatus.message}`;
        const vLastAlertAt = String(objProfile.connectionStatus?.alertSentAt || "").trim();
        const vCanResend = !vLastAlertAt || ((Date.now() - new Date(vLastAlertAt).getTime()) > (30 * 60 * 1000));

        if (vCurrentAlertKey !== vPreviousAlertKey || vCanResend) {
            const objDeltaProfile = await getDeltaApiProfile(pUserId, vProfileId);
            await sendTelegramConnectionAlert(pUserId, String(objDeltaProfile?.referenceName || ""), objStatus);
            return {
                profile: await saveRollingOptionsStrangleLiveProfile({
                    ...objSaved,
                    connectionStatus: {
                        ...objStatus,
                        alertState: objStatus.state,
                        alertMessage: objStatus.message,
                        alertSentAt: vNow
                    }
                }),
                summary: null
            };
        }

        return {
            profile: objSaved,
            summary: null
        };
    }
}

export async function checkRollingOptionsStrangleLiveConnection(req: Request, res: Response): Promise<void> {
    const vUserId = getAccountId(req);
    const objResult = await performRollingOptionsStrangleLiveConnectionCheck(vUserId, String(req.body?.profileId || "").trim());
    res.json({
        status: objResult.profile.connectionStatus.state === "connected" ? "success" : "warning",
        data: {
            ...objResult.profile,
            summary: objResult.summary
        }
    });
}

export async function getRollingOptionsStrangleLiveAccountSummary(req: Request, res: Response): Promise<void> {
    const vProfileId = await resolveProfileId(req);
    if (!vProfileId) {
        res.status(400).json({ status: "warning", message: "API profile is required." });
        return;
    }

    try {
        const vUserId = getAccountId(req);
        const objProfileState = await readLiveProfile(vUserId);
        const objUiState = getMergedLiveUiState(objProfileState);
        const vRequestedSymbol = String(req.query?.symbol || req.body?.symbol || "").trim().toUpperCase();
        const vSelectedSymbol = vRequestedSymbol || (String(objUiState.symbol || "BTC").trim().toUpperCase() || "BTC");
        const vLotSize = getLotSizeForSymbol(vSelectedSymbol);
        const { client, profile } = await getDeltaClientForProfile(req, vProfileId);
        const objMarketConfig = {
            symbol: vSelectedSymbol,
            contractName: getContractNameForSymbol(vSelectedSymbol),
            lotSize: vLotSize,
            futureQty: 1,
            futureOrderType: "market_order" as const,
            action: "sell" as const,
            legSide: "ce" as const,
            expiryMode: "1" as const,
            expiryDate: String(objUiState.expiryDate1 || ""),
            optionQty: 1,
            redOptionQtyPct: 100,
            greenOptionQtyPct: 100,
            newDelta: Number(objUiState.newDelta1 || 0.53),
            reDelta: Number(objUiState.reRedDelta || 0.53),
            deltaTakeProfit: Number(objUiState.redTpDelta || 0.15),
            deltaStopLoss: Number(objUiState.redSlDelta || 0.85),
            reEnter: Boolean(objUiState.reEnter1),
            addOneLotFuture: Boolean(objUiState.addOneLotFuture),
            renkoEnabled: false,
            renkoStepPoints: 10,
            renkoPriceSource: "spot_price" as const,
            loopSeconds: 8
        };
        const objPositionsApi = client.apis?.Positions as {
            getMarginedPositions?: (pParams: Record<string, unknown>) => Promise<unknown>;
            getPositions?: (pParams: Record<string, unknown>) => Promise<unknown>;
        } | undefined;
        const [objWalletResult, objMarketResult, objPositionsResult] = await Promise.allSettled([
            client.apis.Wallet.getBalances(),
            getLiveMarketSnapshot(objMarketConfig),
            typeof objPositionsApi?.getMarginedPositions === "function"
                ? objPositionsApi.getMarginedPositions({})
                : (typeof objPositionsApi?.getPositions === "function"
                    ? objPositionsApi.getPositions({
                        underlying_asset_symbol: vSelectedSymbol
                    }).catch(async () => objPositionsApi.getPositions!({
                        underlying_asset_symbol: getContractNameForSymbol(vSelectedSymbol)
                    }))
                    : Promise.resolve(null))
        ]);
        if (objWalletResult.status !== "fulfilled") {
            throw objWalletResult.reason;
        }
        const objWalletResponse = objWalletResult.value;
        const objMarketSnapshot = objMarketResult.status === "fulfilled" ? objMarketResult.value : null;
        const objPositionsResponse = objPositionsResult.status === "fulfilled" ? objPositionsResult.value : null;

        const objPayload = readResponsePayload(objWalletResponse);
        const arrRows = Array.isArray(objPayload.result) ? objPayload.result as DeltaWalletBalanceRow[] : [];
        const objUsdRow = pickUsdBalanceRow(arrRows);
        const vAvailableBalance = getAvailableBalanceUsd(objUsdRow);
        const vBlockedMargin = getBlockedMarginUsd(objUsdRow);
        const vTotalBalance = getTotalBalanceUsd(objUsdRow);
        const objPositionsPayload = readResponsePayload(objPositionsResponse || {});
        const arrPositions = Array.isArray(objPositionsPayload.result)
            ? objPositionsPayload.result as DeltaPositionRow[]
            : (objPositionsPayload.result ? [objPositionsPayload.result as DeltaPositionRow] : []);
        const vLivePrice = Number(objMarketSnapshot?.futuresPrice || 0);
        const vOneLotValue = Number.isFinite(vLivePrice) && vLivePrice > 0 ? vLivePrice * vLotSize : Number.NaN;
        const vSelectedFuturePositionValue = getSelectedFuturePositionValue(arrPositions, vSelectedSymbol, vLivePrice);
        const vHealthPct = vTotalBalance > 0 && vBlockedMargin >= 0
            ? Number(((vBlockedMargin / vTotalBalance) * 100).toFixed(2))
            : Number.NaN;

        res.json({
            status: "success",
            data: {
                profileId: profile.profileId,
                profileName: profile.referenceName,
                selectedSymbol: vSelectedSymbol,
                lotSize: vLotSize,
                currency: String(objUsdRow?.asset_symbol || objUsdRow?.symbol || "USD").toUpperCase(),
                availableBalance: Number(vAvailableBalance.toFixed(2)),
                blockedMargin: Number(vBlockedMargin.toFixed(2)),
                totalBalance: Number(vTotalBalance.toFixed(2)),
                healthPct: Number.isFinite(vHealthPct) ? vHealthPct : null,
                oneLotValue: Number.isFinite(vOneLotValue) ? Number(vOneLotValue.toFixed(2)) : null,
                livePrice: Number.isFinite(vLivePrice) ? Number(vLivePrice.toFixed(2)) : null,
                selectedFuturePositionValue: Number.isFinite(vSelectedFuturePositionValue) ? Number(vSelectedFuturePositionValue.toFixed(2)) : null,
                balances: arrRows
            }
        });
    }
    catch (objError) {
        res.status(500).json({
            status: "danger",
            message: objError instanceof Error ? objError.message : "Unable to fetch Delta wallet balance."
        });
    }
}

export async function getRollingOptionsStrangleLiveImportableOpenPositions(req: Request, res: Response): Promise<void> {
    const vProfileId = await resolveProfileId(req);
    if (!vProfileId) {
        res.status(400).json({ status: "warning", message: "API profile is required." });
        return;
    }

    try {
        const { client, profile } = await getDeltaClientForProfile(req, vProfileId);
        const objPositionsApi = client.apis?.Positions as {
            getMarginedPositions?: (pParams: Record<string, unknown>) => Promise<unknown>;
            getPositions?: (pParams: Record<string, unknown>) => Promise<unknown>;
        };
        if (typeof objPositionsApi?.getMarginedPositions !== "function" && typeof objPositionsApi?.getPositions !== "function") {
            throw new Error("Delta positions API is not available in the installed client.");
        }
        const objResponse = typeof objPositionsApi?.getMarginedPositions === "function"
            ? await objPositionsApi.getMarginedPositions({})
            : await objPositionsApi.getPositions!({
                underlying_asset_symbol: String((await readLiveProfile(getAccountId(req))).uiState?.symbol || "BTC").trim().toUpperCase() || "BTC"
            });
        const objPayload = readResponsePayload(objResponse);
        const arrRows = Array.isArray(objPayload.result) ? objPayload.result as DeltaPositionRow[] : [];
        const arrPositions = arrRows
            .map(mapLivePosition)
            .filter((objRow) => objRow.qty > 0);
        const arrOptionContracts = arrPositions
            .filter((objRow) => String(objRow.contractName || "").trim().toUpperCase().startsWith("C-") || String(objRow.contractName || "").trim().toUpperCase().startsWith("P-"))
            .map((objRow) => String(objRow.contractName || "").trim())
            .filter(Boolean);
        const objTickerByContract = new Map<string, Awaited<ReturnType<typeof getLiveOptionTicker>>>();
        await Promise.all(arrOptionContracts.map(async (pContractName) => {
            objTickerByContract.set(pContractName, await getLiveOptionTicker(pContractName));
        }));
        const arrEnrichedPositions = arrPositions.map((objRow) => {
            const objTicker = objTickerByContract.get(String(objRow.contractName || "").trim()) || null;
            const vDelta = objTicker && Number.isFinite(Number(objTicker.delta))
                ? Math.abs(Number(objTicker.delta))
                : null;
            if (vDelta === null) {
                return objRow;
            }
            return {
                ...objRow,
                entryDelta: vDelta,
                currentDelta: vDelta
            };
        });

        res.json({
            status: "success",
            data: {
                profileId: profile.profileId,
                profileName: profile.referenceName,
                positions: arrEnrichedPositions
            }
        });
    }
    catch (objError) {
        res.status(500).json({
            status: "danger",
            message: objError instanceof Error ? objError.message : "Unable to fetch Delta open positions."
        });
    }
}

export async function getRollingOptionsStrangleLiveClosedPositions(req: Request, res: Response): Promise<void> {
    const vProfileId = await resolveProfileId(req);
    if (!vProfileId) {
        res.status(400).json({ status: "warning", message: "API profile is required." });
        return;
    }

    try {
        const { client, profile } = await getDeltaClientForProfile(req, vProfileId);
        const vPageSize = 100;
        const arrRows: DeltaOrderHistoryRow[] = [];
        let vAfterCursor = "";
        let vSafetyCounter = 0;
        const vStartTime = toEpochMicros(String(req.query?.fromDate || ""));
        const vEndTime = toEpochMicros(String(req.query?.toDate || ""), true);

        while (vSafetyCounter < 100) {
            const objParams: Record<string, string | number> = {
                page_size: vPageSize
            };
            if (vStartTime) {
                objParams.start_time = vStartTime;
            }
            if (vEndTime) {
                objParams.end_time = vEndTime;
            }
            if (vAfterCursor) {
                objParams.after = vAfterCursor;
            }

            const objResponse = await client.apis.TradeHistory.getOrderHistory(objParams);
            const objPayload = readResponsePayload(objResponse);
            const arrPageRows = Array.isArray(objPayload.result) ? objPayload.result as DeltaOrderHistoryRow[] : [];
            arrRows.push(...arrPageRows);

            const vNextAfter = String((objPayload.meta as { after?: unknown } | undefined)?.after || "").trim();
            vSafetyCounter += 1;
            if (!vNextAfter || vNextAfter === vAfterCursor || arrPageRows.length < vPageSize) {
                break;
            }
            vAfterCursor = vNextAfter;
        }

        const arrClosedPositions = arrRows
            .filter((objRow) => String(objRow.state || "").trim().toLowerCase() === "closed")
            .map(mapLiveClosedPosition);

        res.json({
            status: "success",
            data: {
                profileId: profile.profileId,
                profileName: profile.referenceName,
                totalCount: arrClosedPositions.length,
                positions: arrClosedPositions
            }
        });
    }
    catch (objError) {
        res.status(500).json({
            status: "danger",
            message: objError instanceof Error ? objError.message : "Unable to fetch Delta closed positions."
        });
    }
}
