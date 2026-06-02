import { getAccountById } from "../../storage/accounts-store";
import { loadRollingOptionsPtDeProfile } from "../../storage/rolling-options-strangle-profile-store";
import { saveRollingOptionsEvent, type RollingOptionsPtDeEventRecord } from "../../storage/rolling-options-pt-de-event-store";

export const gRollingOptionsTelegramEventTypes = [
    "engine_started",
    "engine_stopped",
    "engine_error",
    "strategy_executed",
    "renko_change_detected",
    "future_opened",
    "future_closed",
    "option_opened",
    "option_closed",
    "sl_triggered",
    "tp_triggered",
    "reentry_opened",
    "extra_future_added",
    "kill_switch",
    "manual_action"
] as const;

export type RollingOptionsTelegramEventType = (typeof gRollingOptionsTelegramEventTypes)[number];

function normalizeSelectedEventTypes(pValue: unknown): string[] {
    if (!Array.isArray(pValue)) {
        return [];
    }
    return pValue
        .map((vItem) => String(vItem || "").trim())
        .map((vItem) => vItem === "renko_red_detected" ? "renko_change_detected" : vItem)
        .filter(Boolean);
}

async function shouldSendTelegram(pUserId: string, pEventType: string): Promise<boolean> {
    const objProfile = await loadRollingOptionsPtDeProfile(pUserId);
    const objUiState = objProfile?.uiState || {};
    const bEnabled = Boolean(objUiState.telegramAlertsEnabled);
    const objSelectedTypes = normalizeSelectedEventTypes(objUiState.telegramAlertTypes);
    if (!bEnabled || objSelectedTypes.length === 0) {
        return false;
    }
    return objSelectedTypes.includes(pEventType);
}

async function sendTelegramForEvent(pUserId: string, pEvent: Omit<RollingOptionsPtDeEventRecord, "eventId" | "createdAt">): Promise<void> {
    const vBotToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!vBotToken) {
        return;
    }

    const objAccount = await getAccountById(pUserId);
    const vTelegramChatId = String(objAccount?.telegramChatId || "").trim();
    if (!vTelegramChatId) {
        return;
    }

    if (!(await shouldSendTelegram(pUserId, pEvent.eventType))) {
        return;
    }

    const objLines = [
        "Rolling Option Strangle Demo",
        `Time: ${new Date().toLocaleString("en-IN")}`,
        "",
        pEvent.title,
        pEvent.message
    ];

    const vSymbol = String(pEvent.payload.symbol || "").trim();
    const vContractName = String(pEvent.payload.contractName || "").trim();
    const vQty = Number(pEvent.payload.qty || 0);
    const vReason = String(pEvent.payload.reason || "").trim();

    if (vSymbol) {
        objLines.push(`Symbol: ${vSymbol}`);
    }
    if (vContractName) {
        objLines.push(`Contract: ${vContractName}`);
    }
    if (Number.isFinite(vQty) && vQty > 0) {
        objLines.push(`Qty: ${vQty}`);
    }
    if (vReason) {
        objLines.push(`Reason: ${vReason}`);
    }

    try {
        await fetch(`https://api.telegram.org/bot${encodeURIComponent(vBotToken)}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: vTelegramChatId,
                text: objLines.join("\n")
            })
        });
    }
    catch (_objError) {
    }
}

export async function logRollingOptionsPtDeEvent(
    pEvent: Omit<RollingOptionsPtDeEventRecord, "eventId" | "createdAt" | "strategyCode">
): Promise<RollingOptionsPtDeEventRecord> {
    const objEvent = await saveRollingOptionsEvent({
        ...pEvent,
        strategyCode: "rolling-options-strangle"
    });

    await sendTelegramForEvent(pEvent.userId, {
        ...pEvent,
        strategyCode: "rolling-options-strangle"
    });

    return objEvent;
}
