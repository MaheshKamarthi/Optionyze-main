(function () {
    const ids = {
        symbol: document.getElementById("ddlCoveredCallSymbol"),
        lotSize: document.getElementById("txtCoveredCallLotSize"),
        manualFutQty: document.getElementById("txtManualFutQty"),
        manualFutOrderType: document.getElementById("ddlManualFutOrderType"),
        manualFutAction: document.getElementById("ddlManualFutAction"),
        futuresEnabled: document.getElementById("chkRollingDemoFuturesEnabled"),
        replacementBlockSameLegEnabled: document.getElementById("chkRollingDemoReplacementBlockSameLeg"),
        replacementImmediateTriggerGuardEnabled: document.getElementById("chkRollingDemoReplacementImmediateGuard"),
        replacementCloseOrphanEnabled: document.getElementById("chkRollingDemoReplacementCloseOrphan"),
        replacementCloseWhenOriginalPositiveEnabled: document.getElementById("chkRollingDemoReplacementCloseOriginalPositive"),
        replacementCloseEmaMismatchEnabled: document.getElementById("chkRollingDemoReplacementCloseEmaMismatch"),
        boxColorChangeOpenEnabled: document.getElementById("chkRollingDemoBoxColorChangeOpen"),
        boxColorChangeCloseEnabled: document.getElementById("chkRollingDemoBoxColorClose"),
        closeSupportLegOnSourceClose: document.getElementById("chkRollingDemoCloseSupportOnSourceClose"),
        replacementUseRenkoColorEnabled: document.getElementById("chkRollingDemoReplacementUseRenkoColor"),
        replacementWaitForRenkoPointEnabled: document.getElementById("chkRollingDemoReplacementWaitForRenkoPoint"),
        replacementUseEmaTrendEnabled: document.getElementById("chkRollingDemoReplacementUseEmaTrend"),
        action1: document.getElementById("ddlActionCoveredCall1"),
        legSide1: document.getElementById("ddlLegSideCoveredCall1"),
        expiryMode1: document.getElementById("ddlExpiryModeCoveredCall1"),
        expiryDate1: document.getElementById("txtExpiryCoveredCall1"),
        manualOptQty1: document.getElementById("txtManualOptQtyCoveredCall1"),
        reDelta1: document.getElementById("txtReDeltaCoveredCall1"),
        redTpPct: document.getElementById("txtDeltaTPCoveredCall1"),
        redSlPct: document.getElementById("txtDeltaSLCoveredCall1"),
        reEnter1: document.getElementById("chkReLegCoveredCall1"),
        action2: document.getElementById("ddlActionCoveredCall2"),
        legSide2: document.getElementById("ddlLegSideCoveredCall2"),
        expiryMode2: document.getElementById("ddlExpiryModeCoveredCall2"),
        expiryDate2: document.getElementById("txtExpiryCoveredCall2"),
        manualOptQty2: document.getElementById("txtManualOptQtyCoveredCall2"),
        reEnter2: document.getElementById("chkReLegCoveredCall2"),
        redOptQty: document.getElementById("txtRedOptQtyCoveredCall"),
        greenOptQty: document.getElementById("txtGreenOptQtyCoveredCall"),
        greenReDelta: document.getElementById("txtReGreenDCoveredCall"),
        greenTpPct: document.getElementById("txtReGreenTPCoveredCall"),
        greenSlPct: document.getElementById("txtReGreenSLCoveredCall"),
        trailGreenTp1Enabled: document.getElementById("chkRollingDemoTrailGreenTp1Enabled"),
        trailGreenSl1Enabled: document.getElementById("chkRollingDemoTrailGreenSl1Enabled"),
        trailRedTp1Enabled: document.getElementById("chkRollingDemoTrailRedTp1Enabled"),
        trailRedSl1Enabled: document.getElementById("chkRollingDemoTrailRedSl1Enabled"),
        greenOptQty2: document.getElementById("txtGreenOptQtyCoveredCall2"),
        greenReDelta2: document.getElementById("txtReGreenDCoveredCall2"),
        greenTpPct2: document.getElementById("txtReGreenTPCoveredCall2"),
        greenSlPct2: document.getElementById("txtReGreenSLCoveredCall2"),
        redOptQty2: document.getElementById("txtRedOptQtyCoveredCall2"),
        redReDelta2: document.getElementById("txtReRedDCoveredCall2"),
        redTpPct2: document.getElementById("txtRedTPCoveredCall2"),
        redSlPct2: document.getElementById("txtRedSLCoveredCall2"),
        trailGreenTp2Enabled: document.getElementById("chkRollingDemoTrailGreenTp2Enabled"),
        trailGreenSl2Enabled: document.getElementById("chkRollingDemoTrailGreenSl2Enabled"),
        trailRedTp2Enabled: document.getElementById("chkRollingDemoTrailRedTp2Enabled"),
        trailRedSl2Enabled: document.getElementById("chkRollingDemoTrailRedSl2Enabled"),
        positivePnlSupportEnabled: document.getElementById("chkRollingDemoPositivePnlSupportEnabled"),
        positivePnlSupportAction: document.getElementById("ddlRollingDemoPositivePnlSupportAction"),
        positivePnlSupportQty: document.getElementById("txtRollingDemoPositivePnlSupportQty"),
        positivePnlMaxLegs: document.getElementById("txtRollingDemoPositivePnlMaxLegs"),
        positivePnlTriggerAmount: document.getElementById("txtRollingDemoPositivePnlTriggerAmount"),
        positivePnlMarketPrice: document.getElementById("txtRollingDemoPositivePnlMarketPrice"),
        positivePnlExpiryMode: document.getElementById("ddlRollingDemoPositivePnlExpiryMode"),
        positivePnlExpiryDate: document.getElementById("txtRollingDemoPositivePnlExpiryDate"),
        positivePnlTestRefreshTime: document.getElementById("txtRollingDemoPositivePnlTestRefreshTime"),
        positivePnlTargetDelta: document.getElementById("txtRollingDemoPositivePnlTargetDelta"),
        positivePnlTpPct: document.getElementById("txtRollingDemoPositivePnlTp"),
        positivePnlSlPct: document.getElementById("txtRollingDemoPositivePnlSl"),
        positivePnlTrailSlEnabled: document.getElementById("chkRollingDemoPositivePnlTrailSl"),
        positivePnlAdverseRenkoCloseEnabled: document.getElementById("chkRollingDemoPositivePnlAdverseRenkoClose"),
        renkoFeedEnabled: document.getElementById("chkRollingDemoRenkoFeed"),
        renkoFeedPts: document.getElementById("txtRenkoFeedPts"),
        renkoFeedManualPrice: document.getElementById("txtRenkoFeedManualPrice"),
        renkoFeedTimeframe: document.getElementById("ddlRenkoFeedTimeframe"),
        renkoFeedPriceSrc: document.getElementById("ddlRenkoFeedPriceSrc"),
        updateRenkoButton: document.getElementById("btnRollingDemoUpdateRenko"),
        emaEnabled: document.getElementById("chkRollingDemoEma"),
        emaSignalEnabled: document.getElementById("chkRollingDemoEmaSignal"),
        emaRenkoConfirmEnabled: document.getElementById("chkRollingDemoEmaRenkoConfirm"),
        emaTimeframe: document.getElementById("ddlRollingDemoEmaTimeframe"),
        emaSource: document.getElementById("ddlRollingDemoEmaSource"),
        emaPeriod: document.getElementById("txtRollingDemoEmaPeriod"),
        emaManualValue: document.getElementById("txtRollingDemoEmaManualValue"),
        emaIndicator: document.getElementById("rollingDemoEmaIndicator"),
        tradingViewEmaEnabled: document.getElementById("chkRollingDemoTradingViewEma"),
        tradingViewEmaSide: document.getElementById("ddlRollingDemoTradingViewEmaSide"),
        tradingViewEmaTrend: document.getElementById("rollingDemoTradingViewEmaTrend"),
        demoBalance: document.getElementById("txtRollingDemoDemoBalance"),
        targetOpenPnl: document.getElementById("txtRollingDemoTargetOpenPnl"),
        optionsPnl: document.getElementById("txtRollingDemoOptionsPnl"),
        totalPnl: document.getElementById("txtRollingDemoTotalPnl"),
        netTotalPnl: document.getElementById("txtRollingDemoNetTotalPnl"),
        totalCharges: document.getElementById("txtRollingDemoTotalCharges"),
        closedFromDate: document.getElementById("txtClsFromDate"),
        closedToDate: document.getElementById("txtClsToDate"),
        renkoFeedMeta: document.querySelector(".rolling-demo-feed-meta"),
        renkoSaveMessage: document.getElementById("rollingDemoRenkoSaveMessage"),
        ruleSettingsMessages: document.getElementById("rollingDemoRuleSettingsMessages"),
        renkoFeedBadge: document.getElementById("rollingDemoRenkoFeedStatus"),
        oneLotValue: document.getElementById("rollingDemoOneLotValue"),
        totalMarginValue: document.getElementById("rollingDemoTotalMarginValue"),
        blockedMarginValue: document.getElementById("rollingDemoBlockedMarginValue"),
        healthValue: document.getElementById("rollingDemoHealthValue"),
        openPnlValue: document.getElementById("rollingDemoOpenPnlValue"),
        engineStatus: document.getElementById("rollingDemoEngineStatus"),
        pageStatus: document.getElementById("rollingDemoPageStatus"),
        openCount: document.getElementById("rollingDemoOpenCount"),
        autoTraderButton: document.getElementById("btnRollingDemoAutoTrader"),
        lastSignal: document.getElementById("rollingDemoLastSignal"),
        renkoFromPrice: document.getElementById("rollingDemoRenkoFromPrice"),
        renkoAnchor: document.getElementById("rollingDemoRenkoAnchor"),
        boxConditionPoints: document.getElementById("txtRollingDemoBoxPoints"),
        boxConditionEnabled: document.getElementById("chkRollingDemoBoxConditionsEnabled"),
        boxConditionMovingPrice: document.getElementById("txtRollingDemoBoxMovingPrice"),
        boxConditionAnchorPrice: document.getElementById("txtRollingDemoBoxAnchorPrice"),
        updateBoxMovingPriceButton: document.getElementById("btnRollingDemoUpdateBoxMovingPrice"),
        boxConditionSignal: document.getElementById("rollingDemoBoxSignal"),
        boxConditionFromPrice: document.getElementById("rollingDemoBoxFromPrice"),
        boxConditionUpperAnchor: document.getElementById("rollingDemoBoxUpperAnchor"),
        boxConditionLowerAnchor: document.getElementById("rollingDemoBoxLowerAnchor"),
        openPositionsBody: document.getElementById("rollingDemoOpenPositionsBody"),
        payoffGraph: document.getElementById("rollingDemoOpenPayoffGraph"),
        tempClosedPositionsBody: document.getElementById("rollingDemoTempClosedPositionsBody"),
        closedPositionsBody: document.getElementById("rollingDemoClosedPositionsBody"),
        refreshOpenPositionsButton: document.getElementById("btnRollingDemoRefreshOpenPositions"),
        clearClosedFiltersButton: document.getElementById("btnRollingDemoClearClosedFilters"),
        placeFutureButton: document.getElementById("btnRollingDemoPlaceFuture"),
        execStrategyButton: document.getElementById("btnRollingDemoExecStrategy"),
        updateGreenRulesButton: document.getElementById("btnRollingDemoUpdateGreenRules"),
        updateGreenRulesButton2: document.getElementById("btnRollingDemoUpdateGreenRules2"),
        updateRedRulesButton: document.getElementById("btnRollingDemoUpdateRedRules"),
        updateRedRulesButton2: document.getElementById("btnRollingDemoUpdateRedRules2"),
        updatePositivePnlButton: document.getElementById("btnRollingDemoUpdatePositivePnl"),
        openPositivePnlButton: document.getElementById("btnRollingDemoOpenPositivePnl"),
        openOptionButton: document.getElementById("btnRollingDemoOpenOption"),
        openOptionButton2: document.getElementById("btnRollingDemoOpenOption2"),
        exitOptionButton: document.getElementById("btnRollingDemoExitOption"),
        exitOptionButton2: document.getElementById("btnRollingDemoExitOption2"),
        clearOpenPositionsButton: document.getElementById("btnRollingDemoClearOpenPositions"),
        killSwitchButton: document.getElementById("btnRollingDemoKillSwitch"),
        closeAllLegsOnAnyClose: document.getElementById("chkRollingDemoCloseAllLegsOnAnyClose"),
        skipRenkoEntryNoOpenOptions: document.getElementById("chkRollingDemoSkipRenkoEntryNoOpenOptions"),
        clearTempClosedPositionsButton: document.getElementById("btnRollingDemoClearTempClosedPositions"),
        clearClosedPositionsButton: document.getElementById("btnRollingDemoClearClosedPositions"),
        telegramAlertsEnabled: document.getElementById("chkRollingDemoTelegramAlertsEnabled"),
        telegramEventCheckboxes: Array.from(document.querySelectorAll(".rolling-demo-telegram-event")),
        eventLog: document.getElementById("rollingDemoEventLog"),
        hideRenkoEvents: document.getElementById("chkRollingDemoHideRenkoEvents"),
        hideRenkoGreenSkippedEvents: document.getElementById("chkRollingDemoHideRenkoGreenSkippedEvents"),
        refreshEventsButton: document.getElementById("btnRollingDemoRefreshEvents"),
        clearEventsButton: document.getElementById("btnRollingDemoClearEvents")
    };

    const symbolConfig = {
        BTC: { contractName: "BTCUSD", lotSize: "0.001" },
        ETH: { contractName: "ETHUSD", lotSize: "0.01" }
    };

    const apiBase = String(document.body?.dataset?.rollingApiBase || "/api/rollingoptions-pt-de");
    const shared = window.OptionyzeRollingStrangleShared || {};
    const PAYOFF_SL_ALL_LEGS_KEY = String(shared.PAYOFF_SL_ALL_LEGS_KEY || "__all_legs__");

    let gIsApplyingState = false;
    let gSaveTimer = null;
    let gProfileRevision = 0;
    let gConfirmedProfileRevision = 0;
    let gRenkoSaveNoticePending = false;
    let gProfileSaveChain = Promise.resolve();
    let gPreviousOpenPositionLtps = new Map();
    let gPreviousMarketPricesBySymbol = new Map();
    let gLatestRuntimeState = null;
    let gLatestOpenPositions = [];
    let gLatestTempClosedPositions = [];
    let gLatestClosedPositions = [];
    let gHasLoadedProfile = false;
    let gNegativePnlAdjustmentOrderInFlight = false;
    const gNegativePnlAdjustedSourceKeys = new Set();
    let gTargetOpenPnlTriggered = false;
    let gLatestEvents = [];
    let gPayoffSlCheckpoints = [];
    let gPayoffSlSelectedLegKey = PAYOFF_SL_ALL_LEGS_KEY;
    let gPayoffProjectionDays = 0;
    let gPayoffCustomSpotPrice = NaN;
    let gRenkoManualPriceResetToken = 0;
    const gHideRenkoEventsStorageKey = "optionyze:rolling-options-strangle:hide-renko-events";
    const gHideRenkoGreenSkippedEventsStorageKey = "optionyze:rolling-options-strangle:hide-renko-green-skipped-events";

    function readBooleanPreference(storageKey) {
        return typeof shared.readBooleanPreference === "function"
            ? shared.readBooleanPreference(storageKey)
            : false;
    }

    function writeBooleanPreference(storageKey, value) {
        if (typeof shared.writeBooleanPreference === "function") {
            shared.writeBooleanPreference(storageKey, value);
        }
    }

    function getVisibleEvents(rows) {
        return typeof shared.getVisibleEvents === "function"
            ? shared.getVisibleEvents(rows, {
                hideRenkoEvents: ids.hideRenkoEvents?.checked,
                hideRenkoSkippedEvents: ids.hideRenkoGreenSkippedEvents?.checked
            })
            : (Array.isArray(rows) ? rows : []);
    }
    let gLastTargetOpenPnl = null;
    let gIsClosedPositionsVisible = false;
    let gIsEventLogVisible = false;
    let gLastExpiryRefreshDay = formatDateInputValue(new Date());
    let gLastPositivePnlTestRefreshKey = "";
    let gRenkoLiveRefreshInFlight = false;
    const gStatusRefreshMs = 45000;
    const gRenkoLiveRefreshMs = 5000;
    const gEmaRefreshMs = 30000;
    const gOpenPositionsRefreshMs = 30000;
    const gClosedPositionsRefreshMs = 90000;
    const gEventsRefreshMs = 90000;

    function normalizePayoffSlCheckpointPrices(values, legacyValue) {
        return typeof shared.normalizePayoffSlCheckpointPrices === "function"
            ? shared.normalizePayoffSlCheckpointPrices(values, legacyValue)
            : [];
    }

    function normalizePayoffSlCheckpoints(values, legacyValue) {
        return typeof shared.normalizePayoffSlCheckpoints === "function"
            ? shared.normalizePayoffSlCheckpoints(values, legacyValue)
            : normalizePayoffSlCheckpointPrices(
                Array.isArray(legacyValue) ? legacyValue : undefined,
                Array.isArray(legacyValue) ? undefined : legacyValue
            ).map(function (price) {
                return {
                    legKey: PAYOFF_SL_ALL_LEGS_KEY,
                    price
                };
            });
    }

    function normalizePayoffSlSelectedLegKey(value) {
        return typeof shared.normalizePayoffSlSelectedLegKey === "function"
            ? shared.normalizePayoffSlSelectedLegKey(value)
            : PAYOFF_SL_ALL_LEGS_KEY;
    }

    function normalizePayoffProjectionDays(value) {
        return typeof shared.normalizePayoffProjectionDays === "function"
            ? shared.normalizePayoffProjectionDays(value)
            : 0;
    }

    function normalizePayoffCustomSpotPrice(value) {
        return typeof shared.normalizePayoffCustomSpotPrice === "function"
            ? shared.normalizePayoffCustomSpotPrice(value)
            : NaN;
    }

    function getSelectedConfig() {
        const selectedSymbol = String(ids.symbol?.value || "BTC").trim().toUpperCase();
        return symbolConfig[selectedSymbol] || symbolConfig.BTC;
    }

    function formatDateInputValue(dateValue) {
        return typeof shared.formatDateInputValue === "function"
            ? shared.formatDateInputValue(dateValue)
            : "";
    }

    function resolveExpiryDateByMode(expiryMode, referenceDate) {
        return typeof shared.resolveExpiryDateByMode === "function"
            ? shared.resolveExpiryDateByMode(expiryMode, referenceDate)
            : new Date();
    }

    function normalizeExpiryDateValue(value) {
        if (value instanceof Date) {
            return formatDateInputValue(value);
        }

        const rawValue = String(value || "").trim();
        if (!rawValue) {
            return "";
        }

        const isoMatch = rawValue.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
        if (isoMatch) {
            return isoMatch[1];
        }

        const parsedDate = new Date(rawValue);
        if (!Number.isNaN(parsedDate.getTime())) {
            return formatDateInputValue(parsedDate);
        }

        return "";
    }

    function resolveExpiryDateValue(expiryMode) {
        return normalizeExpiryDateValue(resolveExpiryDateByMode(expiryMode));
    }

    function getSourceExpiryDate(row) {
        const metadata = row && typeof row === "object" && row.metadata && typeof row.metadata === "object"
            ? row.metadata
            : {};
        const directExpiry = normalizeExpiryDateValue(
            row?.expiryDate || metadata.resolvedExpiryDate || metadata.requestedExpiryDate || metadata.orderExpiryDate
        );
        if (directExpiry) {
            return directExpiry;
        }

        return parseExpiryDateFromContractName(row?.contractName || row?.symbol || metadata.sourceContractName || "");
    }

    function parseExpiryDateFromContractName(contractName) {
        const value = String(contractName || "").trim().toUpperCase();
        if (!value) {
            return "";
        }

        const isoMatch = value.match(/\b(20\d{2})[-_]?(\d{2})[-_]?(\d{2})\b/);
        if (isoMatch) {
            return normalizeExpiryDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
        }

        const monthNames = {
            JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
            JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
        };
        const namedMonthMatch = value.match(/\b(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2,4})\b/);
        if (namedMonthMatch) {
            const year = normalizeExpiryYear(namedMonthMatch[3]);
            return normalizeExpiryDateParts(year, monthNames[namedMonthMatch[2]], Number(namedMonthMatch[1]));
        }

        const compactTokens = value.split(/[^A-Z0-9]+/).reverse();
        for (const token of compactTokens) {
            const compactMatch = token.match(/^(\d{2})(\d{2})(\d{2})$/);
            if (compactMatch) {
                const parsed = normalizeExpiryDateParts(
                    normalizeExpiryYear(compactMatch[3]),
                    Number(compactMatch[2]),
                    Number(compactMatch[1])
                );
                if (parsed) {
                    return parsed;
                }
            }
        }

        return "";
    }

    function normalizeExpiryYear(value) {
        const year = Number(value);
        if (!Number.isFinite(year)) {
            return 0;
        }
        return year < 100 ? 2000 + year : year;
    }

    function normalizeExpiryDateParts(year, month, day) {
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
            return "";
        }

        const dateValue = new Date(year, month - 1, day);
        if (
            dateValue.getFullYear() !== year
            || dateValue.getMonth() !== month - 1
            || dateValue.getDate() !== day
        ) {
            return "";
        }

        return formatDateInputValue(dateValue);
    }

    function formatDisplayDateTime(dateValue) {
        return typeof shared.formatDateTime === "function"
            ? shared.formatDateTime(dateValue)
            : "-";
    }

    function applySymbolDefaults() {
        const selectedConfig = getSelectedConfig();

        if (ids.lotSize) {
            ids.lotSize.value = selectedConfig.lotSize;
        }

        if (ids.renkoFeedMeta) {
            ids.renkoFeedMeta.textContent = `Symbol: ${selectedConfig.contractName} | Renko state is driven from the server cycle using the selected price source and point size.`;
        }
    }

    function applyExpiryModeDefaults(dailyOnly) {
        const applyFor = function (modeField, dateField) {
            if (!modeField || !dateField) {
                return;
            }
            const modeValue = String(modeField.value || "").trim();
            if (dailyOnly && modeValue !== "1" && modeValue !== "2") {
                return;
            }
            const resolvedDate = resolveExpiryDateByMode(modeField.value);
            const formattedDate = formatDateInputValue(resolvedDate);
            if (formattedDate) {
                dateField.value = formattedDate;
            }
        };
        applyFor(ids.expiryMode1, ids.expiryDate1);
        applyFor(ids.expiryMode2, ids.expiryDate2);
    }

    function refreshDailyExpiryDatesIfNeeded() {
        const now = new Date();
        refreshPositivePnlExpiryAtTestTime(now);
        const currentDay = formatDateInputValue(now);
        if (!currentDay || currentDay === gLastExpiryRefreshDay) {
            return;
        }
        gLastExpiryRefreshDay = currentDay;
        applyExpiryModeDefaults(true);
        if (applyPositivePnlExpiryModeDefault(true, true) && gHasLoadedProfile) {
            queueProfileSave();
        }
    }

    function refreshPositivePnlExpiryAtTestTime(now) {
        if (!ids.positivePnlTestRefreshTime) {
            return;
        }

        const testTime = String(ids.positivePnlTestRefreshTime.value || "").trim();
        if (!/^\d{2}:\d{2}$/.test(testTime)) {
            return;
        }

        const arrTimeParts = testTime.split(":").map(function (part) { return Number(part); });
        const testMinutes = (arrTimeParts[0] * 60) + arrTimeParts[1];
        const currentMinutes = (now.getHours() * 60) + now.getMinutes();
        if (currentMinutes < testMinutes) {
            return;
        }

        const currentDay = formatDateInputValue(now);
        const triggerKey = `${currentDay} ${testTime}`;
        if (!currentDay || triggerKey === gLastPositivePnlTestRefreshKey) {
            return;
        }

        gLastPositivePnlTestRefreshKey = triggerKey;
        if (applyPositivePnlExpiryModeDefault(true, true, now) && gHasLoadedProfile) {
            queueProfileSave();
        }
    }

    function applyPositivePnlExpiryModeDefault(force, dailyOnly, referenceDate) {
        if (!ids.positivePnlExpiryMode || !ids.positivePnlExpiryDate) {
            return false;
        }

        const modeValue = String(ids.positivePnlExpiryMode.value || "").trim();
        if (dailyOnly && modeValue !== "1" && modeValue !== "2") {
            return false;
        }

        if (modeValue === "source") {
            const wasChanged = ids.positivePnlExpiryDate.value !== "" || !ids.positivePnlExpiryDate.disabled;
            ids.positivePnlExpiryDate.value = "";
            ids.positivePnlExpiryDate.disabled = true;
            return wasChanged;
        }

        const wasDisabled = ids.positivePnlExpiryDate.disabled;
        ids.positivePnlExpiryDate.disabled = false;
        if (!force && String(ids.positivePnlExpiryDate.value || "").trim()) {
            return wasDisabled;
        }

        const resolvedDate = resolveExpiryDateByMode(modeValue, referenceDate);
        const formattedDate = formatDateInputValue(resolvedDate);
        if (!formattedDate) {
            return wasDisabled;
        }

        const wasChanged = ids.positivePnlExpiryDate.value !== formattedDate || wasDisabled;
        ids.positivePnlExpiryDate.value = formattedDate;
        return wasChanged;
    }

    function updateRenkoFeedVisualState() {
        const isEnabled = Boolean(ids.renkoFeedEnabled?.checked);
        if (ids.renkoFeedBadge) {
            ids.renkoFeedBadge.textContent = isEnabled ? "ON" : "OFF";
            ids.renkoFeedBadge.classList.toggle("success", isEnabled);
            ids.renkoFeedBadge.classList.toggle("secondary", !isEnabled);
        }
    }

    function applyRenkoSignalBox(colorCode) {
        if (!ids.lastSignal) {
            return;
        }

        const normalized = String(colorCode || "").trim().toUpperCase();
        ids.lastSignal.classList.remove("idle", "green", "red");

        if (normalized === "G") {
            ids.lastSignal.classList.add("green");
            ids.lastSignal.textContent = "G";
            ids.lastSignal.title = "Current Renko box: Green. Click to toggle.";
            return;
        }

        if (normalized === "R") {
            ids.lastSignal.classList.add("red");
            ids.lastSignal.textContent = "R";
            ids.lastSignal.title = "Current Renko box: Red. Click to toggle.";
            return;
        }

        ids.lastSignal.classList.add("idle");
        ids.lastSignal.textContent = "-";
        ids.lastSignal.title = "Current Renko box color. Click to toggle.";
    }

    function updateOneLotMetric(runtimeState = gLatestRuntimeState) {
        if (!ids.oneLotValue) {
            return;
        }

        const selectedSymbol = String(ids.symbol?.value || "BTC").trim().toUpperCase();
        const runtimeSymbol = String(runtimeState?.currentSymbol || "").trim().toUpperCase();
        const selectedLotSize = Number(getSelectedConfig().lotSize || 0);
        const referencePrice = runtimeSymbol === selectedSymbol
            ? Number(runtimeState?.lastSpotPrice ?? runtimeState?.lastFuturesPrice ?? NaN)
            : NaN;

        if (!Number.isFinite(selectedLotSize) || selectedLotSize <= 0 || !Number.isFinite(referencePrice) || referencePrice <= 0) {
            ids.oneLotValue.textContent = "-";
            return;
        }

        ids.oneLotValue.textContent = formatNumericValue(referencePrice * selectedLotSize, 3);
    }

    function updatePositivePnlMarketPrice(runtimeState = gLatestRuntimeState) {
        if (!ids.positivePnlMarketPrice) {
            return;
        }

        const selectedSymbol = String(ids.symbol?.value || "BTC").trim().toUpperCase();
        const runtimeSymbol = String(runtimeState?.currentSymbol || runtimeState?.symbol || selectedSymbol).trim().toUpperCase();
        const marketPrice = runtimeSymbol === selectedSymbol
            ? Number(runtimeState?.lastSpotPrice ?? runtimeState?.lastFuturesPrice ?? NaN)
            : NaN;

        ids.positivePnlMarketPrice.classList.remove("market-up", "market-down");
        ids.positivePnlMarketPrice.value = Number.isFinite(marketPrice) && marketPrice > 0
            ? formatNumericValue(marketPrice, 2)
            : "-";

        if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
            return;
        }

        const previousMarketPrice = Number(gPreviousMarketPricesBySymbol.get(selectedSymbol));
        if (Number.isFinite(previousMarketPrice) && previousMarketPrice > 0) {
            if (marketPrice > previousMarketPrice) {
                ids.positivePnlMarketPrice.classList.add("market-up");
            }
            else if (marketPrice < previousMarketPrice) {
                ids.positivePnlMarketPrice.classList.add("market-down");
            }
        }
        gPreviousMarketPricesBySymbol.set(selectedSymbol, marketPrice);
    }

    function updateTotalMarginMetric(rows = gLatestOpenPositions) {
        if (!ids.totalMarginValue) {
            return;
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            ids.totalMarginValue.textContent = "-";
            return;
        }

        const totalMargin = rows
            .filter(function (row) {
                return String(row?.instrumentType || "").toUpperCase() === "FUTURE";
            })
            .reduce(function (sum, row) {
                const rate = Number(row?.entryPrice ?? 0);
                const lotSize = Number(row?.lotSize || 0);
                const qty = Number(row?.qty || 0);
                if (!Number.isFinite(rate) || !Number.isFinite(lotSize) || !Number.isFinite(qty)) {
                    return sum;
                }
                return sum + (rate * lotSize * qty);
            }, 0);

        ids.totalMarginValue.textContent = totalMargin > 0
            ? formatNumericValue(totalMargin, 3)
            : "-";
    }

    function updateTotalPnlMetric() {
        if (!ids.totalPnl) {
            return;
        }
        const vOpenPnl = sumNumeric(gLatestOpenPositions, "pnl");
        const vClosedPnl = sumNumeric(gLatestClosedPositions, "pnl");
        const vTotalPnl = (Number.isFinite(vOpenPnl) ? vOpenPnl : 0)
            + (Number.isFinite(vClosedPnl) ? vClosedPnl : 0);
        ids.totalPnl.value = Number.isFinite(vTotalPnl) ? vTotalPnl.toFixed(3) : "0.000";
    }

    function updateNetTotalPnlMetric() {
        if (!ids.netTotalPnl) {
            return;
        }
        const vTotalPnl = parseNumberInput(ids.totalPnl, 0);
        const vTotalCharges = parseNumberInput(ids.totalCharges, 0);
        const vNet = (Number.isFinite(vTotalPnl) ? vTotalPnl : 0)
            + (Number.isFinite(vTotalCharges) ? vTotalCharges : 0);
        ids.netTotalPnl.value = Number.isFinite(vNet) ? vNet.toFixed(3) : "0.000";
        ids.netTotalPnl.classList.toggle("pnl-positive", Number.isFinite(vNet) && vNet > 0);
        ids.netTotalPnl.classList.toggle("pnl-negative", Number.isFinite(vNet) && vNet < 0);
    }

    function updateOptionsPnlMetric(rows = gLatestClosedPositions) {
        if (!ids.optionsPnl) {
            return;
        }
        const vClosedPnl = Array.isArray(rows) ? sumNumeric(rows, "pnl") : 0;
        ids.optionsPnl.value = Number.isFinite(vClosedPnl) ? vClosedPnl.toFixed(3) : "0.000";
    }

    function getNetTotalPnlValue() {
        const vTotalPnl = parseNumberInput(ids.totalPnl, 0);
        const vTotalCharges = parseNumberInput(ids.totalCharges, 0);
        const vNet = (Number.isFinite(vTotalPnl) ? vTotalPnl : 0)
            + (Number.isFinite(vTotalCharges) ? vTotalCharges : 0);
        return Number.isFinite(vNet) ? vNet : 0;
    }

    function updateOpenPnlMetric(rows = gLatestOpenPositions, openCountOverride = null) {
        const openRows = Array.isArray(rows) ? rows : [];
        const openCount = Number.isFinite(Number(openCountOverride)) ? Number(openCountOverride) : openRows.length;
        const vUnrealized = sumNumeric(openRows, "pnl");
        const vOpenPositionsPnl = Number.isFinite(vUnrealized) ? vUnrealized : 0;
        const vTempClosedPnl = sumNumeric(gLatestTempClosedPositions, "pnl");
        const vOpenCharges = sumCharges(openRows);
        const vTempClosedCharges = sumCharges(gLatestTempClosedPositions);
        const vOpenPnl = vOpenPositionsPnl
            + (Number.isFinite(vTempClosedPnl) ? vTempClosedPnl : 0)
            - ((Number.isFinite(vOpenCharges) ? vOpenCharges : 0) * 2)
            - (Number.isFinite(vTempClosedCharges) ? vTempClosedCharges : 0);
        if (ids.openPnlValue) {
            ids.openPnlValue.textContent = formatNumericValue(vOpenPnl, 3);
        }
        checkTargetOpenPnl(vOpenPositionsPnl, openCount);
    }

    function getTargetOpenPnlValue() {
        if (!ids.targetOpenPnl) {
            return null;
        }

        const vTarget = parseNumberInput(ids.targetOpenPnl, 0);
        if (!Number.isFinite(vTarget) || vTarget === 0) {
            return null;
        }
        return vTarget;
    }

    function checkTargetOpenPnl(openPnl, openCount) {
        void openPnl;
        void openCount;
        gLastTargetOpenPnl = getTargetOpenPnlValue();
        gTargetOpenPnlTriggered = false;
    }

    function updateTotalChargesMetric() {
        if (!ids.totalCharges) {
            return;
        }
        const vOpenCharges = sumCharges(gLatestOpenPositions);
        const vClosedCharges = sumCharges(gLatestClosedPositions);
        const vCharges = (vOpenCharges * 2) + vClosedCharges;
        ids.totalCharges.value = Number.isFinite(vCharges) ? (-Math.abs(vCharges)).toFixed(3) : "0.000";
    }

    function updateBalanceMetrics(rows = gLatestOpenPositions) {
        const demoBalance = parseNumberInput(ids.demoBalance, 0);
        if (!Number.isFinite(demoBalance) || demoBalance <= 0) {
            if (ids.blockedMarginValue) {
                ids.blockedMarginValue.textContent = "-";
            }
            if (ids.healthValue) {
                ids.healthValue.textContent = "-";
                ids.healthValue.style.color = "";
            }
            return;
        }

        const blockedMargin = Array.isArray(rows)
            ? rows.reduce(function (sum, row) {
                const rate = Number(row?.entryPrice ?? row?.markPrice ?? 0);
                const lotSize = Number(row?.lotSize || 0);
                const qty = Number(row?.qty || 0);
                if (!Number.isFinite(rate) || !Number.isFinite(lotSize) || !Number.isFinite(qty)) {
                    return sum;
                }
                return sum + (rate * lotSize * qty);
            }, 0)
            : 0;

        if (ids.blockedMarginValue) {
            ids.blockedMarginValue.textContent = blockedMargin > 0
                ? formatNumericValue(blockedMargin, 3)
                : "-";
        }

        if (ids.healthValue) {
            const healthPct = (blockedMargin / demoBalance) * 100;
            ids.healthValue.textContent = Number.isFinite(healthPct)
                ? `${formatNumericValue(healthPct, 2)}%`
                : "-";
            ids.healthValue.style.color = Number.isFinite(healthPct)
                ? (healthPct <= 100 ? "#198754" : (healthPct <= 150 ? "#fd7e14" : "#dc3545"))
                : "";
        }
    }

    function formatNumericValue(value, fractionDigits) {
        if (value === null || value === undefined || value === "") {
            return "-";
        }

        const parsedValue = Number(value);
        if (Number.isNaN(parsedValue)) {
            return "-";
        }

        return parsedValue.toFixed(fractionDigits);
    }

    function normalizeConfiguredDelta(value, fallbackValue) {
        const parsedValue = Number(value);
        if (!Number.isFinite(parsedValue)) {
            return fallbackValue;
        }
        return Math.min(1, Math.max(0, parsedValue > 1 ? parsedValue / 100 : parsedValue));
    }

    function formatDeltaWithConfiguredPct(deltaValue, configuredPctValue, fractionDigits) {
        const vDeltaText = formatNumericValue(deltaValue, fractionDigits);
        const vConfiguredPct = Number(configuredPctValue);
        if (!Number.isFinite(vConfiguredPct)) {
            return vDeltaText;
        }

        return `${vDeltaText} / ${formatNumericValue(normalizeConfiguredDelta(vConfiguredPct, 0), 2)}`;
    }

    function parseNumberInput(field, fallbackValue) {
        const rawValue = field?.value;
        if (rawValue === null || rawValue === undefined || rawValue === "") {
            return fallbackValue;
        }

        const parsedValue = Number(rawValue);
        return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    }

    function setStatus(message, tone) {
        if (!ids.pageStatus) {
            return;
        }

        const vMessage = String(message || "").trim();
        ids.pageStatus.textContent = vMessage;
        ids.pageStatus.className = "rolling-live-status";
        if (!vMessage) {
            return;
        }

        ids.pageStatus.classList.add("show");
        if (tone) {
            ids.pageStatus.classList.add(tone);
        }
    }

    function setRenkoSaveMessage(message, tone) {
        if (!ids.renkoSaveMessage) {
            return;
        }
        const vMessage = String(message || "").trim();
        const vTone = String(tone || "").trim();
        ids.renkoSaveMessage.innerHTML = `
            <div class="rolling-demo-rule-message-title">Delta Renko server confirmation</div>
            <div class="rolling-demo-rule-message-item${vTone ? ` ${escapeHtml(vTone)}` : ""}">${escapeHtml(vMessage || "No Renko settings confirmation yet.")}</div>
        `;
    }

    function appendRuleSettingsMessage(message) {
        if (!ids.ruleSettingsMessages) {
            return;
        }
        const vMessage = String(message || "").trim();
        if (!vMessage) {
            return;
        }
        const objEmpty = ids.ruleSettingsMessages.querySelector(".rolling-demo-rule-message-empty");
        if (objEmpty) {
            objEmpty.remove();
        }
        const objItem = document.createElement("div");
        objItem.className = "rolling-demo-rule-message-item";
        const objTime = document.createElement("div");
        objTime.className = "rolling-demo-rule-message-time";
        objTime.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const objText = document.createElement("div");
        objText.className = "rolling-demo-rule-message-text";
        objText.textContent = vMessage;
        objItem.append(objTime, objText);
        const objTitle = ids.ruleSettingsMessages.querySelector(".rolling-demo-rule-message-title");
        if (objTitle?.nextSibling) {
            ids.ruleSettingsMessages.insertBefore(objItem, objTitle.nextSibling);
        }
        else {
            ids.ruleSettingsMessages.appendChild(objItem);
        }
        ids.ruleSettingsMessages.querySelectorAll(".rolling-demo-rule-message-item").forEach(function (objRow, vIndex) {
            if (vIndex >= 4) {
                objRow.remove();
            }
        });
    }

    function sumNumeric(rows, key) {
        return rows.reduce(function (sum, row) {
            const value = Number(row?.[key] || 0);
            return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
    }

    function sumCharges(rows) {
        return rows.reduce(function (sum, row) {
            const value = Number(row?.charges || 0);
            if (!Number.isFinite(value)) {
                return sum;
            }
            return sum + Math.abs(value);
        }, 0);
    }

    function formatChargeNegative(value, fractionDigits) {
        const parsed = Number(value || 0);
        const normalized = Number.isFinite(parsed) ? (-Math.abs(parsed)) : 0;
        return formatNumericValue(normalized, fractionDigits);
    }

    function getLtpBlinkClass(positionId, markPrice) {
        const currentLtp = Number(markPrice);
        const previousLtp = gPreviousOpenPositionLtps.get(positionId);

        if (!positionId || Number.isNaN(currentLtp)) {
            return "";
        }

        gPreviousOpenPositionLtps.set(positionId, currentLtp);

        if (!Number.isFinite(previousLtp) || previousLtp === currentLtp) {
            return "";
        }

        return currentLtp > previousLtp ? "rolling-demo-ltp-up" : "rolling-demo-ltp-down";
    }

    function getUiState() {
        return {
            symbol: String(ids.symbol?.value || "BTC"),
            manualFutQty: parseNumberInput(ids.manualFutQty, 1),
            manualFutOrderType: String(ids.manualFutOrderType?.value || "market_order"),
            manualFutAction: String(ids.manualFutAction?.value || "SELL"),
            futuresEnabled: ids.futuresEnabled ? Boolean(ids.futuresEnabled.checked) : true,
            replacementBlockSameLegEnabled: ids.replacementBlockSameLegEnabled ? Boolean(ids.replacementBlockSameLegEnabled.checked) : true,
            replacementImmediateTriggerGuardEnabled: ids.replacementImmediateTriggerGuardEnabled ? Boolean(ids.replacementImmediateTriggerGuardEnabled.checked) : true,
            replacementCloseOrphanEnabled: ids.replacementCloseOrphanEnabled ? Boolean(ids.replacementCloseOrphanEnabled.checked) : true,
            replacementCloseWhenOriginalPositiveEnabled: ids.replacementCloseWhenOriginalPositiveEnabled ? Boolean(ids.replacementCloseWhenOriginalPositiveEnabled.checked) : true,
            replacementCloseEmaMismatchEnabled: ids.replacementCloseEmaMismatchEnabled ? Boolean(ids.replacementCloseEmaMismatchEnabled.checked) : false,
            boxColorChangeOpenEnabled: Boolean(ids.boxColorChangeOpenEnabled?.checked),
            boxColorChangeCloseEnabled: Boolean(ids.boxColorChangeCloseEnabled?.checked),
            closeSupportLegOnSourceClose: ids.closeSupportLegOnSourceClose ? Boolean(ids.closeSupportLegOnSourceClose.checked) : false,
            replacementUseRenkoColorEnabled: ids.replacementUseRenkoColorEnabled ? Boolean(ids.replacementUseRenkoColorEnabled.checked) : true,
            replacementWaitForRenkoPointEnabled: ids.replacementWaitForRenkoPointEnabled ? Boolean(ids.replacementWaitForRenkoPointEnabled.checked) : false,
            replacementUseEmaTrendEnabled: ids.replacementUseEmaTrendEnabled ? Boolean(ids.replacementUseEmaTrendEnabled.checked) : true,
            action1: String(ids.action1?.value || "sell"),
            legSide1: String(ids.legSide1?.value || "ce"),
            expiryMode1: String(ids.expiryMode1?.value || "1"),
            expiryDate1: String(ids.expiryDate1?.value || ""),
            manualOptQty1: parseNumberInput(ids.manualOptQty1, 1),
            reDelta1: parseNumberInput(ids.reDelta1, 0.53),
            redTpPct: parseNumberInput(ids.redTpPct, 0.50),
            redSlPct: parseNumberInput(ids.redSlPct, 0.90),
            reEnter1: Boolean(ids.reEnter1?.checked),
            action2: String(ids.action2?.value || "none"),
            legSide2: String(ids.legSide2?.value || "pe"),
            expiryMode2: String(ids.expiryMode2?.value || "1"),
            expiryDate2: String(ids.expiryDate2?.value || ""),
            manualOptQty2: parseNumberInput(ids.manualOptQty2, 1),
            reEnter2: Boolean(ids.reEnter2?.checked),
            greenOptQty2: parseNumberInput(ids.greenOptQty2, 1),
            greenReDelta2: parseNumberInput(ids.greenReDelta2, 0.53),
            greenTpPct2: parseNumberInput(ids.greenTpPct2, 0.50),
            greenSlPct2: parseNumberInput(ids.greenSlPct2, 0.90),
            redOptQty2: parseNumberInput(ids.redOptQty2, 1),
            redReDelta2: parseNumberInput(ids.redReDelta2, 0.53),
            redTpPct2: parseNumberInput(ids.redTpPct2, 0.50),
            redSlPct2: parseNumberInput(ids.redSlPct2, 0.90),
            redOptQty: parseNumberInput(ids.redOptQty, 1),
            greenOptQty: parseNumberInput(ids.greenOptQty, 1),
            greenReDelta: parseNumberInput(ids.greenReDelta, 0.53),
            greenTpPct: parseNumberInput(ids.greenTpPct, 0.50),
            greenSlPct: parseNumberInput(ids.greenSlPct, 0.90),
            trailGreenTp1Enabled: Boolean(ids.trailGreenTp1Enabled?.checked),
            trailGreenSl1Enabled: Boolean(ids.trailGreenSl1Enabled?.checked),
            trailRedTp1Enabled: Boolean(ids.trailRedTp1Enabled?.checked),
            trailRedSl1Enabled: Boolean(ids.trailRedSl1Enabled?.checked),
            renkoFeedEnabled: Boolean(ids.renkoFeedEnabled?.checked),
            renkoFeedPts: parseNumberInput(ids.renkoFeedPts, 10),
            renkoFeedManualPrice: Number(ids.renkoFeedManualPrice?.value) > 0
                ? Number(ids.renkoFeedManualPrice.value)
                : null,
            renkoManualPriceResetToken: gRenkoManualPriceResetToken,
            renkoFeedTimeframe: String(ids.renkoFeedTimeframe?.value || "1m"),
            renkoFeedPriceSrc: String(ids.renkoFeedPriceSrc?.value || "spot_price"),
            emaEnabled: Boolean(ids.emaEnabled?.checked),
            emaSignalEnabled: Boolean(ids.emaSignalEnabled?.checked),
            emaRenkoConfirmEnabled: Boolean(ids.emaRenkoConfirmEnabled?.checked),
            emaTimeframe: String(ids.emaTimeframe?.value || "1m"),
            emaSource: String(ids.emaSource?.value || "candles"),
            emaPeriod: parseNumberInput(ids.emaPeriod, 20),
            emaManualValue: Number(ids.emaManualValue?.value) > 0 ? Number(ids.emaManualValue.value) : null,
            tradingViewEmaEnabled: Boolean(ids.tradingViewEmaEnabled?.checked),
            tradingViewEmaSide: String(ids.tradingViewEmaSide?.value || "both"),
            demoBalance: parseNumberInput(ids.demoBalance, 10000),
            targetOpenPnl: parseNumberInput(ids.targetOpenPnl, 0),
            payoffSlCheckpointPrices: normalizePayoffSlCheckpoints(gPayoffSlCheckpoints)
                .filter(function (checkpoint) {
                    return checkpoint.legKey === PAYOFF_SL_ALL_LEGS_KEY;
                })
                .map(function (checkpoint) { return checkpoint.price; }),
            payoffSlCheckpoints: normalizePayoffSlCheckpoints(gPayoffSlCheckpoints),
            payoffSlSelectedLegKey: normalizePayoffSlSelectedLegKey(gPayoffSlSelectedLegKey),
            payoffProjectionDays: normalizePayoffProjectionDays(gPayoffProjectionDays),
            payoffCustomSpotPrice: Number.isFinite(normalizePayoffCustomSpotPrice(gPayoffCustomSpotPrice))
                ? normalizePayoffCustomSpotPrice(gPayoffCustomSpotPrice)
                : null,
            closeAllLegsOnAnyClose: Boolean(ids.closeAllLegsOnAnyClose?.checked),
            skipRenkoEntryNoOpenOptions: Boolean(ids.skipRenkoEntryNoOpenOptions?.checked),
            telegramAlertsEnabled: Boolean(ids.telegramAlertsEnabled?.checked),
            trailGreenTp2Enabled: Boolean(ids.trailGreenTp2Enabled?.checked),
            trailGreenSl2Enabled: Boolean(ids.trailGreenSl2Enabled?.checked),
            trailRedTp2Enabled: Boolean(ids.trailRedTp2Enabled?.checked),
            trailRedSl2Enabled: Boolean(ids.trailRedSl2Enabled?.checked),
            positivePnlSupportEnabled: Boolean(ids.positivePnlSupportEnabled?.checked),
            positivePnlSupportAction: String(ids.positivePnlSupportAction?.value || "buy").trim().toLowerCase() === "sell" ? "sell" : "buy",
            positivePnlSupportQty: parseNumberInput(ids.positivePnlSupportQty, 10),
            positivePnlMaxLegs: parseNumberInput(ids.positivePnlMaxLegs, 1),
            positivePnlTriggerAmount: Math.min(0, parseNumberInput(ids.positivePnlTriggerAmount, 0)),
            positivePnlExpiryMode: String(ids.positivePnlExpiryMode?.value || "1"),
            positivePnlExpiryDate: String(ids.positivePnlExpiryDate?.value || ""),
            positivePnlExpiryRefreshTime: String(ids.positivePnlTestRefreshTime?.value || ""),
            positivePnlTargetDelta: parseNumberInput(ids.positivePnlTargetDelta, 0.53),
            positivePnlTpPct: parseNumberInput(ids.positivePnlTpPct, 15),
            positivePnlSlPct: parseNumberInput(ids.positivePnlSlPct, 85),
            positivePnlTrailSlEnabled: Boolean(ids.positivePnlTrailSlEnabled?.checked),
            positivePnlAdverseRenkoCloseEnabled: Boolean(ids.positivePnlAdverseRenkoCloseEnabled?.checked),
            boxConditionPoints: parseNumberInput(ids.boxConditionPoints, 10),
            boxConditionEnabled: Boolean(ids.boxConditionEnabled?.checked),
            boxConditionMovingPrice: Number(ids.boxConditionMovingPrice?.value) > 0
                ? Number(ids.boxConditionMovingPrice.value)
                : null,
            telegramAlertTypes: ids.telegramEventCheckboxes
                .filter(function (objCheckbox) { return objCheckbox.checked; })
                .map(function (objCheckbox) { return String(objCheckbox.value || "").trim(); })
                .filter(Boolean),
            closedFromDate: String(ids.closedFromDate?.value || ""),
            closedToDate: String(ids.closedToDate?.value || "")
        };
    }

    function setFieldValue(fieldId, value) {
        const objField = ids[fieldId];
        if (!objField) {
            return;
        }

        if (objField.type === "checkbox") {
            objField.checked = Boolean(value);
            return;
        }

        objField.value = String(value ?? "");
    }

    function applyUiState(uiState) {
        gIsApplyingState = true;
        gPayoffSlCheckpoints = normalizePayoffSlCheckpoints(uiState?.payoffSlCheckpoints, uiState?.payoffSlCheckpointPrices ?? uiState?.payoffSlCheckpointPrice);
        gPayoffSlSelectedLegKey = normalizePayoffSlSelectedLegKey(uiState?.payoffSlSelectedLegKey);
        gPayoffProjectionDays = normalizePayoffProjectionDays(uiState?.payoffProjectionDays);
        gPayoffCustomSpotPrice = normalizePayoffCustomSpotPrice(uiState?.payoffCustomSpotPrice);
        gRenkoManualPriceResetToken = Number(uiState?.renkoManualPriceResetToken) || 0;

        setFieldValue("symbol", uiState.symbol);
        setFieldValue("manualFutQty", uiState.manualFutQty);
        setFieldValue("manualFutOrderType", uiState.manualFutOrderType);
        setFieldValue("manualFutAction", uiState.manualFutAction);
        setFieldValue("futuresEnabled", uiState.futuresEnabled ?? true);
        setFieldValue("replacementBlockSameLegEnabled", uiState.replacementBlockSameLegEnabled ?? true);
        setFieldValue("replacementImmediateTriggerGuardEnabled", uiState.replacementImmediateTriggerGuardEnabled ?? true);
        setFieldValue("replacementCloseOrphanEnabled", uiState.replacementCloseOrphanEnabled ?? true);
        setFieldValue("replacementCloseWhenOriginalPositiveEnabled", uiState.replacementCloseWhenOriginalPositiveEnabled ?? true);
        setFieldValue("replacementCloseEmaMismatchEnabled", uiState.replacementCloseEmaMismatchEnabled ?? false);
        setFieldValue("boxColorChangeOpenEnabled", uiState.boxColorChangeOpenEnabled ?? false);
        setFieldValue("boxColorChangeCloseEnabled", uiState.boxColorChangeCloseEnabled ?? false);
        setFieldValue("closeSupportLegOnSourceClose", uiState.closeSupportLegOnSourceClose ?? false);
        setFieldValue("replacementUseRenkoColorEnabled", uiState.replacementUseRenkoColorEnabled ?? true);
        setFieldValue("replacementWaitForRenkoPointEnabled", uiState.replacementWaitForRenkoPointEnabled ?? false);
        setFieldValue("replacementUseEmaTrendEnabled", uiState.replacementUseEmaTrendEnabled ?? true);
        setFieldValue("action1", uiState.action1);
        setFieldValue("legSide1", uiState.legSide1);
        setFieldValue("expiryMode1", uiState.expiryMode1);
        setFieldValue("expiryDate1", uiState.expiryDate1);
        setFieldValue("manualOptQty1", uiState.manualOptQty1);
        setFieldValue("reDelta1", uiState.reDelta1);
        setFieldValue("redTpPct", normalizeConfiguredDelta(uiState.redTpPct ?? uiState.deltaTp1, 0.50));
        setFieldValue("redSlPct", normalizeConfiguredDelta(uiState.redSlPct ?? uiState.deltaSl1, 0.90));
        setFieldValue("reEnter1", uiState.reEnter1);
        setFieldValue("action2", uiState.action2 ?? "none");
        setFieldValue("legSide2", uiState.legSide2 ?? "pe");
        setFieldValue("expiryMode2", uiState.expiryMode2 ?? "1");
        setFieldValue("expiryDate2", uiState.expiryDate2);
        setFieldValue("manualOptQty2", uiState.manualOptQty2 ?? 1);
        setFieldValue("reEnter2", uiState.reEnter2);
        setFieldValue("greenOptQty2", uiState.greenOptQty2 ?? 1);
        setFieldValue("greenReDelta2", uiState.greenReDelta2 ?? 0.53);
        setFieldValue("greenTpPct2", normalizeConfiguredDelta(uiState.greenTpPct2, 0.50));
        setFieldValue("greenSlPct2", normalizeConfiguredDelta(uiState.greenSlPct2, 0.90));
        setFieldValue("redOptQty2", uiState.redOptQty2 ?? 1);
        setFieldValue("redReDelta2", uiState.redReDelta2 ?? 0.53);
        setFieldValue("redTpPct2", normalizeConfiguredDelta(uiState.redTpPct2, 0.50));
        setFieldValue("redSlPct2", normalizeConfiguredDelta(uiState.redSlPct2, 0.90));
        setFieldValue("redOptQty", uiState.redOptQty ?? uiState.redOptQtyPct);
        setFieldValue("greenOptQty", uiState.greenOptQty ?? uiState.greenOptQtyPct);
        setFieldValue("greenReDelta", uiState.greenReDelta);
        setFieldValue("greenTpPct", normalizeConfiguredDelta(uiState.greenTpPct ?? uiState.greenTpDelta, 0.50));
        setFieldValue("greenSlPct", normalizeConfiguredDelta(uiState.greenSlPct ?? uiState.greenSlDelta, 0.90));
        setFieldValue("trailGreenTp1Enabled", uiState.trailGreenTp1Enabled ?? true);
        setFieldValue("trailGreenSl1Enabled", uiState.trailGreenSl1Enabled ?? true);
        setFieldValue("trailRedTp1Enabled", uiState.trailRedTp1Enabled ?? true);
        setFieldValue("trailRedSl1Enabled", uiState.trailRedSl1Enabled ?? true);
        setFieldValue("renkoFeedEnabled", uiState.renkoFeedEnabled);
        setFieldValue("renkoFeedPts", uiState.renkoFeedPts);
        setFieldValue("renkoFeedManualPrice", Number(uiState.renkoFeedManualPrice) > 0 ? uiState.renkoFeedManualPrice : "");
        setFieldValue("renkoFeedTimeframe", uiState.renkoFeedTimeframe ?? "1m");
        setFieldValue("renkoFeedPriceSrc", uiState.renkoFeedPriceSrc);
        setFieldValue("emaEnabled", uiState.emaEnabled ?? false);
        setFieldValue("emaSignalEnabled", uiState.emaSignalEnabled ?? false);
        setFieldValue("emaRenkoConfirmEnabled", uiState.emaRenkoConfirmEnabled ?? false);
        setFieldValue("emaTimeframe", uiState.emaTimeframe ?? "1m");
        setFieldValue("emaSource", uiState.emaSource ?? "candles");
        setFieldValue("emaPeriod", uiState.emaPeriod ?? 20);
        setFieldValue("emaManualValue", Number(uiState.emaManualValue) > 0 ? uiState.emaManualValue : "");
        setFieldValue("tradingViewEmaEnabled", uiState.tradingViewEmaEnabled ?? false);
        setFieldValue("tradingViewEmaSide", uiState.tradingViewEmaSide ?? "both");
        setFieldValue("demoBalance", uiState.demoBalance);
        setFieldValue("targetOpenPnl", uiState.targetOpenPnl ?? 0);
        setFieldValue("closeAllLegsOnAnyClose", uiState.closeAllLegsOnAnyClose ?? false);
        setFieldValue("skipRenkoEntryNoOpenOptions", uiState.skipRenkoEntryNoOpenOptions ?? false);
        setFieldValue("optionsPnl", uiState.optionsPnl);
        setFieldValue("telegramAlertsEnabled", uiState.telegramAlertsEnabled);
        setFieldValue("trailGreenTp2Enabled", uiState.trailGreenTp2Enabled ?? true);
        setFieldValue("trailGreenSl2Enabled", uiState.trailGreenSl2Enabled ?? true);
        setFieldValue("trailRedTp2Enabled", uiState.trailRedTp2Enabled ?? true);
        setFieldValue("trailRedSl2Enabled", uiState.trailRedSl2Enabled ?? true);
        setFieldValue("positivePnlSupportEnabled", uiState.positivePnlSupportEnabled ?? uiState.negativePnlHedgeEnabled ?? true);
        setFieldValue("positivePnlSupportAction", uiState.positivePnlSupportAction ?? "buy");
        setFieldValue("positivePnlSupportQty", uiState.positivePnlSupportQty ?? uiState.negativePnlHedgeQty ?? 10);
        setFieldValue("positivePnlMaxLegs", uiState.positivePnlMaxLegs ?? uiState.negativePnlMaxLegs ?? 1);
        setFieldValue("positivePnlTriggerAmount", uiState.positivePnlTriggerAmount ?? 0);
        setFieldValue("positivePnlExpiryMode", uiState.positivePnlExpiryMode ?? uiState.negativePnlHedgeExpiryMode ?? "1");
        setFieldValue("positivePnlExpiryDate", uiState.positivePnlExpiryDate ?? "");
        setFieldValue("positivePnlTestRefreshTime", uiState.positivePnlExpiryRefreshTime ?? "");
        setFieldValue("positivePnlTargetDelta", uiState.positivePnlTargetDelta ?? uiState.negativePnlHedgeDelta ?? 0.53);
        setFieldValue("positivePnlTpPct", uiState.positivePnlTpPct ?? uiState.negativePnlTpPct ?? 15);
        setFieldValue("positivePnlSlPct", uiState.positivePnlSlPct ?? uiState.negativePnlSlPct ?? 85);
        setFieldValue("positivePnlTrailSlEnabled", uiState.positivePnlTrailSlEnabled ?? false);
        setFieldValue("positivePnlAdverseRenkoCloseEnabled", uiState.positivePnlAdverseRenkoCloseEnabled ?? uiState.negativePnlRenkoCloseOnly ?? false);
        setFieldValue("boxConditionPoints", uiState.boxConditionPoints ?? 10);
        setFieldValue("boxConditionEnabled", uiState.boxConditionEnabled ?? false);
        setFieldValue("boxConditionMovingPrice", Number(uiState.boxConditionMovingPrice) > 0 ? uiState.boxConditionMovingPrice : "");
        setFieldValue("closedFromDate", uiState.closedFromDate);
        setFieldValue("closedToDate", uiState.closedToDate);
        const objSelectedTelegramTypes = Array.isArray(uiState.telegramAlertTypes)
            ? uiState.telegramAlertTypes.map(function (vType) { return String(vType || "").trim(); })
            : [];
        ids.telegramEventCheckboxes.forEach(function (objCheckbox) {
            objCheckbox.checked = objSelectedTelegramTypes.includes(String(objCheckbox.value || "").trim());
        });

        applySymbolDefaults();
        applyExpiryModeDefaults(true);
        applyPositivePnlExpiryModeDefault(false);
        updateRenkoFeedVisualState();
        updateFuturesEnabledVisualState();

        gIsApplyingState = false;
    }

    function updateFuturesEnabledVisualState() {
        const bEnabled = ids.futuresEnabled ? Boolean(ids.futuresEnabled.checked) : true;
        if (ids.placeFutureButton) {
            ids.placeFutureButton.disabled = !bEnabled;
        }
    }

    function applyRuntimeStatus(runtimeState) {
        gLatestRuntimeState = runtimeState || null;
        const statusText = String(runtimeState?.status || "idle").trim() || "idle";
        const autoTraderEnabled = Boolean(runtimeState?.autoTraderEnabled);
        const lastSignal = String(runtimeState?.lastSignal || "-").trim() || "-";
        const openCount = Number(runtimeState?.counts?.openPositions || 0);
        const renkoColor = String(runtimeState?.state?.renkoLastColor || "").trim().toUpperCase();
        const renkoCalculationPriceRaw = runtimeState?.state?.renkoCalculationPrice;
        const renkoCalculationPrice = Number(renkoCalculationPriceRaw);
        const renkoAnchorRaw = runtimeState?.state?.renkoAnchor;
        const renkoAnchor = Number(renkoAnchorRaw);
        const tradingViewEmaEnabled = Boolean(runtimeState?.state?.tradingViewEmaEnabled ?? ids.tradingViewEmaEnabled?.checked);
        const tradingViewEmaSideRaw = String(runtimeState?.state?.tradingViewEmaSide || ids.tradingViewEmaSide?.value || "BOTH").trim().toUpperCase();
        const tradingViewEmaSide = tradingViewEmaSideRaw === "UP" || tradingViewEmaSideRaw === "DOWN" ? tradingViewEmaSideRaw : "BOTH";
        const tradingViewEmaTrendRaw = String(runtimeState?.state?.tradingViewEmaTrend || "FLAT").trim().toUpperCase();
        const tradingViewEmaTrend = tradingViewEmaTrendRaw === "UP" || tradingViewEmaTrendRaw === "DOWN" ? tradingViewEmaTrendRaw : "FLAT";
        const emaEnabled = Boolean(runtimeState?.state?.emaEnabled ?? ids.emaEnabled?.checked);
        const emaSignalEnabled = Boolean(runtimeState?.state?.emaSignalEnabled ?? ids.emaSignalEnabled?.checked);
        const emaRenkoConfirmEnabled = Boolean(runtimeState?.state?.emaRenkoConfirmEnabled ?? ids.emaRenkoConfirmEnabled?.checked);
        const emaTimeframe = String(runtimeState?.state?.emaTimeframe || ids.emaTimeframe?.value || "1m");
        const emaSourceRaw = String(runtimeState?.state?.emaSource || ids.emaSource?.value || "candles").trim().toLowerCase();
        const emaSourceLabel = emaSourceRaw === "renko" ? "Renko" : emaTimeframe;
        const emaPeriod = Number(runtimeState?.state?.emaPeriod || ids.emaPeriod?.value || 20);
        const emaValue = Number(runtimeState?.state?.emaValue);
        const emaTrendRaw = String(runtimeState?.state?.emaTrend || "FLAT").trim().toUpperCase();
        const emaTrend = emaTrendRaw === "UP" || emaTrendRaw === "DOWN" ? emaTrendRaw : "FLAT";
        const emaError = String(runtimeState?.state?.emaError || "").trim();
        if (ids.engineStatus) {
            ids.engineStatus.textContent = statusText.charAt(0).toUpperCase() + statusText.slice(1);
        }

        if (ids.openCount) {
            ids.openCount.textContent = String(openCount);
        }

        if (ids.autoTraderButton) {
            ids.autoTraderButton.textContent = autoTraderEnabled ? "Auto Trader - ON" : "Auto Trader - OFF";
            ids.autoTraderButton.classList.toggle("success", autoTraderEnabled);
            ids.autoTraderButton.classList.toggle("warn", !autoTraderEnabled);
        }

        if (ids.lastSignal) {
            applyRenkoSignalBox(renkoColor);
            ids.lastSignal.dataset.lastSignalText = lastSignal;
        }
        if (ids.renkoFromPrice) {
            ids.renkoFromPrice.textContent = renkoCalculationPriceRaw !== null
                && renkoCalculationPriceRaw !== undefined
                && Number.isFinite(renkoCalculationPrice)
                ? `From: ${formatNumericValue(renkoCalculationPrice, 2)}`
                : "From: --";
        }
        if (ids.renkoAnchor) {
            ids.renkoAnchor.textContent = renkoAnchorRaw !== null
                && renkoAnchorRaw !== undefined
                && Number.isFinite(renkoAnchor)
                ? `Anchor: ${formatNumericValue(renkoAnchor, 2)}`
                : "Anchor: --";
        }
        const boxEnabled = Boolean(runtimeState?.state?.boxConditionEnabled ?? ids.boxConditionEnabled?.checked);
        const boxColorRaw = boxEnabled
            ? String(runtimeState?.state?.boxLastColor || "").trim().toUpperCase()
            : "";
        const boxColor = boxColorRaw === "G" ? "G" : (boxColorRaw === "R" ? "R" : "");
        if (ids.boxConditionSignal) {
            ids.boxConditionSignal.textContent = boxColor || "-";
            ids.boxConditionSignal.classList.remove("idle", "green", "red");
            ids.boxConditionSignal.classList.add(boxColor === "G" ? "green" : (boxColor === "R" ? "red" : "idle"));
        }
        if (ids.boxConditionFromPrice) {
            const boxPriceRaw = boxEnabled ? runtimeState?.state?.boxCalculationPrice : null;
            const boxPrice = Number(boxPriceRaw);
            ids.boxConditionFromPrice.textContent = boxPriceRaw !== null
                && boxPriceRaw !== undefined
                && Number.isFinite(boxPrice)
                ? `From: ${formatNumericValue(boxPrice, 2)}`
                : "From: --";
        }
        if (ids.boxConditionUpperAnchor) {
            const boxUpperRaw = boxEnabled ? runtimeState?.state?.boxUpperAnchor : null;
            const boxUpper = Number(boxUpperRaw);
            ids.boxConditionUpperAnchor.textContent = boxUpperRaw !== null
                && boxUpperRaw !== undefined
                && Number.isFinite(boxUpper)
                ? `Upper: ${formatNumericValue(boxUpper, 2)}`
                : "Upper: --";
        }
        if (ids.boxConditionLowerAnchor) {
            const boxLowerRaw = boxEnabled ? runtimeState?.state?.boxLowerAnchor : null;
            const boxLower = Number(boxLowerRaw);
            ids.boxConditionLowerAnchor.textContent = boxLowerRaw !== null
                && boxLowerRaw !== undefined
                && Number.isFinite(boxLower)
                ? `Lower: ${formatNumericValue(boxLower, 2)}`
                : "Lower: --";
            if (ids.boxConditionAnchorPrice
                && document.activeElement !== ids.boxConditionAnchorPrice
                && boxLowerRaw !== null
                && boxLowerRaw !== undefined
                && Number.isFinite(boxLower)) {
                ids.boxConditionAnchorPrice.value = String(boxLower);
            }
        }

        if (ids.tradingViewEmaTrend) {
            ids.tradingViewEmaTrend.textContent = tradingViewEmaEnabled
                ? `TV EMA: ${tradingViewEmaTrend} / ${tradingViewEmaSide}`
                : "TV EMA: OFF";
            ids.tradingViewEmaTrend.classList.toggle("success", tradingViewEmaEnabled && tradingViewEmaTrend === "UP");
            ids.tradingViewEmaTrend.classList.toggle("danger", tradingViewEmaEnabled && tradingViewEmaTrend === "DOWN");
            ids.tradingViewEmaTrend.classList.toggle("secondary", !tradingViewEmaEnabled || tradingViewEmaTrend === "FLAT");
        }

        if (ids.emaIndicator) {
            ids.emaIndicator.textContent = emaEnabled
                ? (Number.isFinite(emaValue)
                    ? `EMA ${emaPeriod} ${emaSourceLabel}: ${emaTrend} ${formatNumericValue(emaValue, 2)}`
                    : (emaError ? `EMA: ${emaError}` : `EMA ${emaPeriod} ${emaSourceLabel}: WAIT`))
                : "EMA: OFF";
            if (emaEnabled && emaSignalEnabled && Number.isFinite(emaValue)) {
                ids.emaIndicator.textContent += " / SIGNAL";
            }
            if (emaEnabled && emaRenkoConfirmEnabled && Number.isFinite(emaValue)) {
                ids.emaIndicator.textContent += " / CONFIRM";
            }
            ids.emaIndicator.classList.toggle("success", emaEnabled && Number.isFinite(emaValue) && emaTrend === "UP");
            ids.emaIndicator.classList.toggle("danger", emaEnabled && ((Number.isFinite(emaValue) && emaTrend === "DOWN") || (Boolean(emaError) && !Number.isFinite(emaValue))));
            ids.emaIndicator.classList.toggle("secondary", !emaEnabled || (Number.isFinite(emaValue) && emaTrend === "FLAT") || (!Number.isFinite(emaValue) && !emaError));
        }

        updateOptionsPnlMetric(gLatestClosedPositions);
        updateTotalChargesMetric();
        updateTotalPnlMetric();
        updateNetTotalPnlMetric();
        updateOpenPnlMetric(gLatestOpenPositions, openCount);

        updateOneLotMetric(runtimeState);
        updatePositivePnlMarketPrice(runtimeState);
        renderPayoffGraph(gLatestOpenPositions);
    }

    function renderPayoffGraph(rows) {
        if (!ids.payoffGraph || !window.OptionyzePayoffGraph) {
            return;
        }

        window.OptionyzePayoffGraph.render(ids.payoffGraph, rows, {
            variant: "delta",
            title: "Open Position Payoff",
            subtitle: "Delta-style projected payoff view with time decay across the current open option and future legs.",
            currentPriceLabel: "Spot",
            referencePrice: Number(gLatestRuntimeState?.lastSpotPrice ?? gLatestRuntimeState?.lastFuturesPrice ?? NaN),
            customSpotPrice: gPayoffCustomSpotPrice,
            slCheckpoints: gPayoffSlCheckpoints,
            selectedSlLegKey: gPayoffSlSelectedLegKey,
            projectionDays: gPayoffProjectionDays,
            onSlCheckpointChange: function (checkpoints) {
                gPayoffSlCheckpoints = normalizePayoffSlCheckpoints(checkpoints);
                queueProfileSave();
                renderPayoffGraph(gLatestOpenPositions);
            },
            onSlSelectedLegChange: function (legKey) {
                gPayoffSlSelectedLegKey = normalizePayoffSlSelectedLegKey(legKey);
                queueProfileSave();
                renderPayoffGraph(gLatestOpenPositions);
            },
            onProjectionDaysChange: function (days) {
                gPayoffProjectionDays = normalizePayoffProjectionDays(days);
                queueProfileSave();
                renderPayoffGraph(gLatestOpenPositions);
            },
            onCustomSpotPriceChange: function (spotPrice) {
                gPayoffCustomSpotPrice = normalizePayoffCustomSpotPrice(spotPrice);
                queueProfileSave();
                renderPayoffGraph(gLatestOpenPositions);
            },
            emptyMessage: "Payoff graph appears when open legs are available."
        });
    }

    /*
    function isSuggestedNegativePnlLeg(row) {
        return Boolean(row?.metadata?.negativePnlOptionLegPreview);
    }

    function getNegativePnlOptionSide(row) {
        const directSide = String(row?.optionSide || row?.metadata?.optionSide || "").trim().toUpperCase();
        if (directSide === "PE" || directSide === "CE") {
            return directSide;
        }

        const contractName = String(row?.contractName || row?.symbol || "").trim().toUpperCase();
        if (contractName.startsWith("P-")) {
            return "PE";
        }
        if (contractName.startsWith("C-")) {
            return "CE";
        }
        return "";
    }

    function getNegativePnlOptionLegPreviews(rows) {
        if (!ids.negativePnlHedgeEnabled?.checked) {
            return [];
        }

        const manualHedgeQty = Math.max(0, Math.floor(parseNumberInput(ids.negativePnlHedgeQty, 10)));
        if (!(manualHedgeQty > 0)) {
            return [];
        }
        const maxLegs = Math.max(1, Math.floor(parseNumberInput(ids.negativePnlMaxLegs, 1)));
        const openAdjustmentCount = (Array.isArray(rows) ? rows : []).filter(function (row) {
            return Boolean(row?.metadata?.negativePnlAdjustment);
        }).length;
        const remainingLegSlots = Math.max(0, maxLegs - openAdjustmentCount);
        if (!(remainingLegSlots > 0)) {
            return [];
        }

        const hedgeExpiryMode = String(ids.negativePnlHedgeExpiryMode?.value || "1");
        const hedgeDelta = Math.max(0, parseNumberInput(ids.negativePnlHedgeDelta, 0.53));
        const action3 = String(ids.negativePnlAction3?.value || "buy").trim().toLowerCase() === "sell" ? "SELL" : "BUY";
        const resolvedHedgeExpiry = hedgeExpiryMode === "source"
            ? ""
            : resolveExpiryDateValue(hedgeExpiryMode);

        const adjustedSourceKeys = new Set((Array.isArray(rows) ? rows : []).map(function (row) {
            return row?.metadata?.negativePnlAdjustment
                ? String(row?.metadata?.sourcePositionId || "").trim()
                : "";
        }).filter(Boolean));
        const sourceOptionRows = (Array.isArray(rows) ? rows : []).filter(function (row) {
            return String(row?.instrumentType || "").trim().toUpperCase() === "OPTION"
                && !Boolean(row?.metadata?.negativePnlAdjustment);
        });
        if (sourceOptionRows.length < 2) {
            return [];
        }
        const hasPositiveSourceOption = (Array.isArray(rows) ? rows : []).some(function (row) {
            const instrumentType = String(row?.instrumentType || "").trim().toUpperCase();
            const pnl = Number(row?.pnl);
            return instrumentType === "OPTION"
                && !Boolean(row?.metadata?.negativePnlAdjustment)
                && Number.isFinite(pnl)
                && pnl > 0;
        });
        if (!hasPositiveSourceOption) {
            return [];
        }

        const negativeCandidates = (Array.isArray(rows) ? rows : []).filter(function (row) {
            const instrumentType = String(row?.instrumentType || "").trim().toUpperCase();
            const positionId = String(row?.positionId || "").trim();
            const pnl = Number(row?.pnl);
            const markPrice = Number(row?.markPrice);
            return instrumentType === "OPTION"
                && !Boolean(row?.metadata?.negativePnlAdjustment)
                && !adjustedSourceKeys.has(positionId)
                && !gNegativePnlAdjustedSourceKeys.has(positionId)
                && Number.isFinite(pnl)
                && pnl < 0
                && Number.isFinite(markPrice)
                && markPrice >= 0;
        });
        const targetOptionSide = negativeCandidates.reduce(function (selectedSide, row) {
            const rowSide = getNegativePnlOptionSide(row);
            const rowLoss = Math.abs(Number(row?.pnl || 0));
            const selectedRow = negativeCandidates.find(function (candidate) {
                return getNegativePnlOptionSide(candidate) === selectedSide;
            });
            const selectedLoss = Math.abs(Number(selectedRow?.pnl || 0));
            return rowSide && rowLoss > selectedLoss ? rowSide : selectedSide;
        }, "");

        return negativeCandidates.filter(function (row) {
            return getNegativePnlOptionSide(row) === targetOptionSide;
        }).slice(0, remainingLegSlots).map(function (row, index) {
            const action = action3;
            const positionId = String(row?.positionId || row?.contractName || row?.symbol || index);
            const hedgeExpiryDate = hedgeExpiryMode === "source"
                ? getSourceExpiryDate(row)
                : resolvedHedgeExpiry;
            const contractName = String(row.contractName || row.symbol || "").trim();
            const previewContractName = hedgeExpiryDate
                ? `${contractName || "Hedge Option"} | EXP ${hedgeExpiryDate}`
                : (contractName || "Hedge Option");
            const hedgeQty = manualHedgeQty;
            return {
                ...row,
                positionId: `negative-pnl-preview:${positionId}`,
                action,
                side: action,
                qty: hedgeQty,
                entryPrice: Number(row.markPrice),
                entryDelta: hedgeDelta,
                exitDelta: hedgeDelta,
                expiryDate: hedgeExpiryDate,
                charges: 0,
                pnl: 0,
                openedAt: "",
                closedAt: "",
                status: hedgeExpiryDate ? `ADJUSTMENT ${hedgeExpiryDate}` : "ADJUSTMENT",
                metadata: {
                    ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
                    negativePnlOptionLegPreview: true,
                    negativePnlOptionLegAdjustment: true,
                    actionSlot: 3,
                    actionLabel: "Action 3",
                    sourcePositionId: positionId,
                    hedgeExpiryMode,
                    hedgeTargetDelta: hedgeDelta,
                    manualHedgeQty: hedgeQty,
                    maxHedgeQty: hedgeQty,
                    maxLegs,
                    remainingLegSlots,
                    sourceLossAmount: Math.abs(Number(row.pnl || 0)),
                    displayContractName: previewContractName,
                    requestedExpiryDate: hedgeExpiryDate,
                    resolvedExpiryDate: hedgeExpiryDate
                }
            };
        });
    }

    function withNegativePnlOptionLegPreviews(rows) {
        const arrRows = Array.isArray(rows) ? rows : [];
        return arrRows.concat(getNegativePnlOptionLegPreviews(arrRows));
    }

    function refreshNegativePnlHedgePreview() {
        queueProfileSave();
        if (Array.isArray(gLatestOpenPositions) && gLatestOpenPositions.length) {
            renderOpenPositions(gLatestOpenPositions);
        }
    }

    async function placeNegativePnlAdjustmentOrders(adjustmentRows) {
        if (gNegativePnlAdjustmentOrderInFlight) {
            return;
        }

        const maxLegs = Math.max(1, Math.floor(parseNumberInput(ids.negativePnlMaxLegs, 1)));
        const openAdjustmentCount = (Array.isArray(gLatestOpenPositions) ? gLatestOpenPositions : []).filter(function (row) {
            return Boolean(row?.metadata?.negativePnlAdjustment);
        }).length;
        const remainingLegSlots = Math.max(0, maxLegs - openAdjustmentCount);
        const rowsToPlace = (Array.isArray(adjustmentRows) ? adjustmentRows : []).filter(function (row) {
            const sourcePositionId = String(row?.metadata?.sourcePositionId || "").trim();
            return sourcePositionId && !gNegativePnlAdjustedSourceKeys.has(sourcePositionId);
        }).slice(0, remainingLegSlots);
        const sourceOptionRows = (Array.isArray(gLatestOpenPositions) ? gLatestOpenPositions : []).filter(function (row) {
            return String(row?.instrumentType || "").trim().toUpperCase() === "OPTION"
                && !Boolean(row?.metadata?.negativePnlAdjustment);
        });
        if (sourceOptionRows.length < 2) {
            return;
        }
        const hasPositiveSourceOption = (Array.isArray(gLatestOpenPositions) ? gLatestOpenPositions : []).some(function (row) {
            const instrumentType = String(row?.instrumentType || "").trim().toUpperCase();
            const pnl = Number(row?.pnl);
            return instrumentType === "OPTION"
                && !Boolean(row?.metadata?.negativePnlAdjustment)
                && Number.isFinite(pnl)
                && pnl > 0;
        });
        if (!hasPositiveSourceOption) {
            return;
        }
        if (!rowsToPlace.length) {
            return;
        }

        gNegativePnlAdjustmentOrderInFlight = true;
        rowsToPlace.forEach(function (row) {
            const sourcePositionId = String(row?.metadata?.sourcePositionId || "").trim();
            if (sourcePositionId) {
                gNegativePnlAdjustedSourceKeys.add(sourcePositionId);
            }
        });

        try {
            await flushProfileSave();
            const objResult = await postJson(`${apiBase}/manual/negative-pnl-adjustment`, {
                adjustments: rowsToPlace.map(function (row) {
                    return {
                        sourcePositionId: String(row?.metadata?.sourcePositionId || "").trim(),
                        action: String(row?.action || row?.side || ids.negativePnlAction3?.value || "BUY").trim().toUpperCase() === "SELL" ? "SELL" : "BUY",
                        actionSlot: 3,
                        optionSide: String(row?.optionSide || "").trim().toUpperCase(),
                        expiryMode: String(row?.metadata?.hedgeExpiryMode || ids.negativePnlHedgeExpiryMode?.value || "1"),
                        expiryDate: String(row?.expiryDate || row?.metadata?.resolvedExpiryDate || row?.metadata?.requestedExpiryDate || ""),
                        qty: Math.max(1, Math.floor(Number(row?.metadata?.manualHedgeQty || row?.metadata?.autoCalculatedHedgeQty || row?.qty || 1))),
                        targetDelta: Math.max(0, Number(row?.metadata?.hedgeTargetDelta || ids.negativePnlHedgeDelta?.value || 0.53))
                    };
                })
            });
            await loadServerPanels();
            setStatus(objResult?.message || "Negative PnL adjustment paper leg opened.", "success");
        }
        catch (objError) {
            rowsToPlace.forEach(function (row) {
                const sourcePositionId = String(row?.metadata?.sourcePositionId || "").trim();
                if (sourcePositionId) {
                    gNegativePnlAdjustedSourceKeys.delete(sourcePositionId);
                }
            });
            setStatus(objError instanceof Error ? objError.message : "Unable to open negative PnL adjustment paper leg.", "danger");
        }
        finally {
            gNegativePnlAdjustmentOrderInFlight = false;
        }
    }
    */

    function refreshPositivePnlSupportSettings() {
        queueProfileSave();
    }

    function getPositionOpenComment(row) {
        const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
        return String(row?.openedReason || metadata.openedReason || metadata.reason || metadata.source || "-").trim() || "-";
    }

    function renderOpenPositions(rows) {
        if (!ids.openPositionsBody) {
            return;
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            gLatestOpenPositions = [];
            gPreviousOpenPositionLtps = new Map();
            ids.openPositionsBody.innerHTML = "<tr><td colspan=\"18\" class=\"rolling-demo-empty\">No open paper positions found for this user.</td></tr>";
            if (ids.openCount) {
                ids.openCount.textContent = "0";
            }
            updateTotalMarginMetric([]);
            updateBalanceMetrics([]);
            updateTotalChargesMetric();
            updateTotalPnlMetric();
            updateNetTotalPnlMetric();
            updateOpenPnlMetric([], 0);
            renderPayoffGraph([]);
            return;
        }

        gLatestOpenPositions = rows;
        const displayRows = rows;
        if (ids.openCount) {
            ids.openCount.textContent = String(rows.length);
        }
        updateOpenPnlMetric(rows, rows.length);
        const nextLtps = new Map();
        const openRowsHtml = displayRows.map(function (row) {
            const isPreviewLeg = false;
            const tradeType = String(row.action || "-");
            const buyPrice = String(row.action || "").toUpperCase() === "BUY" ? row.entryPrice : null;
            const sellPrice = String(row.action || "").toUpperCase() === "SELL" ? row.entryPrice : null;
            const currentDelta = String(row.instrumentType || "").toUpperCase() === "OPTION"
                ? (row.exitDelta ?? row.entryDelta)
                : null;
            const tpDelta = row.metadata && typeof row.metadata === "object"
                ? (row.metadata.deltaTakeProfit ?? row.metadata.takeProfitDelta)
                : null;
            const slDelta = row.metadata && typeof row.metadata === "object"
                ? (row.metadata.deltaStopLoss ?? row.metadata.stopLossDelta)
                : null;
            const configuredTpPct = row.metadata && typeof row.metadata === "object"
                ? row.metadata.configuredTakeProfitPct
                : null;
            const configuredSlPct = row.metadata && typeof row.metadata === "object"
                ? row.metadata.configuredStopLossPct
                : null;
            const positionId = String(row.positionId || "");
            const ltpBlinkClass = getLtpBlinkClass(positionId, row.markPrice);
            const currentLtp = Number(row.markPrice);
            const vRowPnl = Number(row.pnl || 0);
            const pnlClass = Number.isFinite(vRowPnl) && vRowPnl > 0
                ? "rolling-demo-pnl-positive"
                : (Number.isFinite(vRowPnl) && vRowPnl < 0 ? "rolling-demo-pnl-negative" : "");
            const rowMetadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
            const rowClasses = [];
            if (isPreviewLeg) {
                rowClasses.push("rolling-demo-suggested-leg-row");
            }
            if (rowMetadata.positivePnlSupport) {
                rowClasses.push("rolling-demo-support-leg-row");
            }
            else if (rowMetadata.negativePnlAdjustment) {
                rowClasses.push("rolling-demo-adjustment-leg-row");
            }
            if (!isPreviewLeg && positionId && Number.isFinite(currentLtp)) {
                nextLtps.set(positionId, currentLtp);
            }
            return `
                <tr${rowClasses.length > 0 ? ` class="${rowClasses.join(" ")}"` : ""}>
                    <td>${escapeHtml(formatNumericValue(row.entryDelta, 2))}</td>
                    <td>${escapeHtml(formatNumericValue(currentDelta, 2))}</td>
                    <td>${escapeHtml(formatDeltaWithConfiguredPct(tpDelta, configuredTpPct, 2))}</td>
                    <td>${escapeHtml(formatDeltaWithConfiguredPct(slDelta, configuredSlPct, 2))}</td>
                    <td>${escapeHtml(isPreviewLeg ? (row.metadata?.displayContractName || row.contractName || row.symbol || "-") : (row.contractName || row.symbol || "-"))}</td>
                    <td>${escapeHtml(tradeType || "-")}</td>
                    <td>${escapeHtml(formatNumericValue(row.lotSize, 3))}</td>
                    <td>${escapeHtml(formatNumericValue(row.qty, 0))}</td>
                    <td>${escapeHtml(formatNumericValue(buyPrice, 2))}</td>
                    <td>${escapeHtml(formatNumericValue(sellPrice, 2))}</td>
                    <td class="${ltpBlinkClass}">${escapeHtml(formatNumericValue(row.markPrice, 2))}</td>
                    <td>${escapeHtml(formatChargeNegative(row.charges, 3))}</td>
                    <td${pnlClass ? ` class="${pnlClass}"` : ""}>${escapeHtml(formatNumericValue(row.pnl, 3))}</td>
                    <td>${escapeHtml(formatDisplayDateTime(row.openedAt))}</td>
                    <td>${escapeHtml(formatDisplayDateTime(row.closedAt))}</td>
                    <td>${escapeHtml(row.status || "-")}</td>
                    <td>${escapeHtml(isPreviewLeg ? `Manual adjustment qty ${row.metadata?.manualHedgeQty || row.qty}` : getPositionOpenComment(row))}</td>
                    <td>
                        ${isPreviewLeg ? `<span class="rolling-demo-suggested-leg-note">Placing paper adjustment</span>` : `
                        <button class="rolling-demo-icon-btn primary rolling-demo-close-open-position" type="button" data-position-id="${escapeHtml(positionId)}" title="Close this open position" aria-label="Close this open position">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m6 6 12 12" />
                                <path d="M18 6 6 18" />
                            </svg>
                        </button>
                        <button class="rolling-demo-icon-btn warn rolling-demo-delete-open-position" type="button" data-position-id="${escapeHtml(positionId)}" title="Delete this open position permanently" aria-label="Delete this open position permanently">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                            </svg>
                        </button>
                        `}
                    </td>
                </tr>
            `;
        }).join("");
        const totalCharges = sumCharges(rows);
        const totalPnl = sumNumeric(rows, "pnl");
        const totalPnlClass = Number.isFinite(totalPnl) && totalPnl > 0
            ? " rolling-demo-pnl-positive"
            : (Number.isFinite(totalPnl) && totalPnl < 0 ? " rolling-demo-pnl-negative" : "");
        ids.openPositionsBody.innerHTML = `${openRowsHtml}
            <tr class="rolling-demo-total-row">
                <td colspan="11">Total</td>
                <td class="rolling-demo-total-value">${escapeHtml(formatChargeNegative(totalCharges, 3))}</td>
                <td class="rolling-demo-total-value${totalPnlClass}">${escapeHtml(formatNumericValue(totalPnl, 3))}</td>
                <td colspan="5">-</td>
            </tr>
        `;
        gPreviousOpenPositionLtps = nextLtps;
        updateTotalMarginMetric(rows);
        updateBalanceMetrics(rows);
        updateTotalChargesMetric();
        updateTotalPnlMetric();
        updateNetTotalPnlMetric();
        updateOpenPnlMetric(rows, rows.length);
        renderPayoffGraph(displayRows);
    }

    function renderClosedPositionRows(pBody, rows, pEmptyText) {
        if (!pBody) {
            return { totalCharges: 0, totalPnl: 0 };
        }
        if (!Array.isArray(rows) || rows.length === 0) {
            pBody.innerHTML = `<tr><td colspan="13" class="rolling-demo-empty">${escapeHtml(pEmptyText)}</td></tr>`;
            return { totalCharges: 0, totalPnl: 0 };
        }

        const closedRowsHtml = rows.map(function (row) {
            const tradeType = String(row.action || "-");
            const currentDelta = String(row.instrumentType || "").toUpperCase() === "OPTION"
                ? (row.exitDelta ?? row.entryDelta)
                : null;
            const rowMetadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
            const rowClass = rowMetadata.positivePnlSupport ? " class=\"rolling-demo-support-leg-row\"" : "";
            return `
                <tr${rowClass}>
                    <td>${escapeHtml(formatNumericValue(row.entryDelta, 2))}</td>
                    <td>${escapeHtml(formatNumericValue(currentDelta, 2))}</td>
                    <td>${escapeHtml(formatDisplayDateTime(row.openedAt))}</td>
                    <td>${escapeHtml(formatDisplayDateTime(row.closedAt))}</td>
                    <td>${escapeHtml(row.contractName || row.symbol || "-")}</td>
                    <td>${escapeHtml(tradeType || "-")}</td>
                    <td>${escapeHtml(formatNumericValue(row.lotSize, 3))}</td>
                    <td>${escapeHtml(formatNumericValue(row.qty, 0))}</td>
                    <td>${escapeHtml(formatNumericValue(row.entryPrice, 2))}</td>
                    <td>${escapeHtml(formatNumericValue(row.exitPrice, 2))}</td>
                    <td>${escapeHtml(formatChargeNegative(row.charges, 3))}</td>
                    <td>${escapeHtml(formatNumericValue(row.pnl, 3))}</td>
                    <td>${escapeHtml(row.closedReason || "-")}</td>
                </tr>
            `;
        }).join("");
        const totalCharges = sumCharges(rows);
        const totalPnl = sumNumeric(rows, "pnl");
        pBody.innerHTML = `${closedRowsHtml}
            <tr class="rolling-demo-total-row">
                <td colspan="10">Total</td>
                <td class="rolling-demo-total-value">${escapeHtml(formatChargeNegative(totalCharges, 3))}</td>
                <td class="rolling-demo-total-value">${escapeHtml(formatNumericValue(totalPnl, 3))}</td>
                <td>-</td>
            </tr>
        `;
        return { totalCharges, totalPnl };
    }

    function renderTempClosedPositions(rows) {
        gLatestTempClosedPositions = Array.isArray(rows) ? rows : [];
        renderClosedPositionRows(ids.tempClosedPositionsBody, gLatestTempClosedPositions, "No temp closed paper positions found for this user.");
    }

    function renderClosedPositions(rows) {
        if (!ids.closedPositionsBody) {
            return;
        }

        gLatestClosedPositions = Array.isArray(rows) ? rows : [];
        renderClosedPositionRows(ids.closedPositionsBody, gLatestClosedPositions, "No closed paper positions found for this user.");
        updateOptionsPnlMetric(gLatestClosedPositions);
        updateTotalChargesMetric();
        updateTotalPnlMetric();
        updateNetTotalPnlMetric();
        updateOpenPnlMetric(gLatestOpenPositions, Array.isArray(gLatestOpenPositions) ? gLatestOpenPositions.length : 0);
    }

    function renderEvents(rows) {
        if (!ids.eventLog) {
            return;
        }

        gLatestEvents = Array.isArray(rows) ? rows : [];
        const arrRows = getVisibleEvents(gLatestEvents);
        if (!arrRows.length) {
            ids.eventLog.innerHTML = "<div class=\"rolling-demo-event-empty\">No server activity has been logged yet.</div>";
            return;
        }

        ids.eventLog.innerHTML = arrRows.map(function (row) {
            const vSeverity = String(row.severity || "info").trim();
            return `
                <div class="rolling-demo-event-item ${escapeHtml(vSeverity)}">
                    <div class="rolling-demo-event-head">
                        <div class="rolling-demo-event-title">${escapeHtml(row.title || row.eventType || "Event")}</div>
                        <div class="rolling-demo-event-time">${escapeHtml(formatDisplayDateTime(row.createdAt))}</div>
                    </div>
                    <div class="rolling-demo-event-message">${escapeHtml(row.message || "")}</div>
                </div>
            `;
        }).join("");
    }

    async function saveProfile(uiState, revision) {
        const objResponse = await fetch(`${apiBase}/profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ uiState })
        });

        const objPayload = await objResponse.json().catch(() => ({}));
        if (!objResponse.ok) {
            throw new Error(String(objPayload?.message || "Unable to save Rolling Options profile."));
        }
        const objSavedUiState = objPayload?.data?.uiState;
        if (!objSavedUiState || typeof objSavedUiState !== "object") {
            throw new Error("Server saved the profile but did not return synchronized settings.");
        }
        gConfirmedProfileRevision = Math.max(gConfirmedProfileRevision, revision);
        if (gRenkoSaveNoticePending && revision === gProfileRevision) {
            gRenkoSaveNoticePending = false;
            const vRenkoMessage = String(objPayload?.message || "Renko settings updated on server.");
            setStatus(vRenkoMessage, "success");
            setRenkoSaveMessage(vRenkoMessage, "success");
        }
        return objSavedUiState;
    }

    function enqueueProfileSave(revision) {
        const objUiState = getUiState();
        const objSave = async function () {
            try {
                return await saveProfile(objUiState, revision);
            }
            catch (objError) {
                console.error(objError);
                if (revision === gProfileRevision) {
                    setStatus(objError instanceof Error ? objError.message : "Unable to synchronize settings with the server.", "danger");
                    await loadProfile().then(function () {
                        gConfirmedProfileRevision = Math.max(gConfirmedProfileRevision, revision);
                    }).catch(function (objReloadError) {
                        console.error(objReloadError);
                    });
                }
                throw objError;
            }
        };
        gProfileSaveChain = gProfileSaveChain.catch(function () {
            return undefined;
        }).then(objSave);
        return gProfileSaveChain;
    }

    async function flushProfileSave() {
        if (gIsApplyingState) {
            return;
        }

        if (gSaveTimer) {
            clearTimeout(gSaveTimer);
            gSaveTimer = null;
        }

        await gProfileSaveChain.catch(function () {
            return undefined;
        });
        if (gConfirmedProfileRevision >= gProfileRevision) {
            return;
        }
        await enqueueProfileSave(gProfileRevision);
    }

    function queueProfileSave() {
        if (gIsApplyingState) {
            return;
        }

        gProfileRevision += 1;
        const vRevision = gProfileRevision;
        if (gSaveTimer) {
            clearTimeout(gSaveTimer);
        }

        gSaveTimer = setTimeout(function () {
            gSaveTimer = null;
            void enqueueProfileSave(vRevision).catch(function () {
                return undefined;
            });
        }, 400);
    }

    async function loadProfile() {
        const objResponse = await fetch(`${apiBase}/profile`, {
            credentials: "same-origin"
        });
        if (!objResponse.ok) {
            throw new Error("Unable to load Rolling Options profile.");
        }
        const objPayload = await objResponse.json().catch(() => ({}));
        const objUiState = objPayload && objPayload.data && objPayload.data.uiState
            ? objPayload.data.uiState
            : {};
        applyUiState(objUiState);
        return objUiState;
    }

    async function syncExpiryDatesFromProfile() {
        if (gConfirmedProfileRevision < gProfileRevision) {
            return;
        }
        const arrSyncedFields = [
            { dateField: ids.expiryDate1, modeField: ids.expiryMode1, stateKey: "expiryDate1" },
            { dateField: ids.expiryDate2, modeField: ids.expiryMode2, stateKey: "expiryDate2" },
            { dateField: ids.positivePnlExpiryDate, modeField: ids.positivePnlExpiryMode, stateKey: "positivePnlExpiryDate" }
        ];
        if (arrSyncedFields.some(function (objField) {
            return document.activeElement === objField.dateField || document.activeElement === objField.modeField;
        })) {
            return;
        }

        const objResponse = await fetch(`${apiBase}/profile`, {
            credentials: "same-origin"
        });
        if (!objResponse.ok) {
            throw new Error("Unable to refresh expiry dates.");
        }

        const objPayload = await objResponse.json().catch(() => ({}));
        const objUiState = objPayload && objPayload.data && objPayload.data.uiState
            ? objPayload.data.uiState
            : {};
        arrSyncedFields.forEach(function (objField) {
            const serverExpiryDate = String(objUiState[objField.stateKey] || "").trim();
            if (objField.dateField && /^\d{4}-\d{2}-\d{2}$/.test(serverExpiryDate) && objField.dateField.value !== serverExpiryDate) {
                objField.dateField.value = serverExpiryDate;
            }
        });
    }

    async function loadStatus() {
        const objResponse = await fetch(`${apiBase}/status`, {
            credentials: "same-origin"
        });
        if (!objResponse.ok) {
            throw new Error("Unable to load Rolling Options status.");
        }

        const objPayload = await objResponse.json().catch(() => ({}));
        const objRuntimeState = objPayload?.data || {};
        applyRuntimeStatus(objRuntimeState);
        return objRuntimeState;
    }

    async function loadOpenPositions() {
        const objResponse = await fetch(`${apiBase}/open-positions`, {
            credentials: "same-origin"
        });
        if (!objResponse.ok) {
            throw new Error("Unable to load open paper positions.");
        }

        const objPayload = await objResponse.json().catch(() => ({}));
        const objMarket = objPayload?.market && typeof objPayload.market === "object"
            ? objPayload.market
            : null;
        if (objMarket) {
            updatePositivePnlMarketPrice({
                currentSymbol: objMarket.symbol,
                lastSpotPrice: objMarket.spotPrice,
                lastFuturesPrice: objMarket.futuresPrice
            });
        }
        renderOpenPositions(Array.isArray(objPayload?.data) ? objPayload.data : []);
    }

    async function loadClosedPositions() {
        const objSearch = new URLSearchParams();
        if (ids.closedFromDate?.value) {
            objSearch.set("fromDate", ids.closedFromDate.value);
        }
        if (ids.closedToDate?.value) {
            objSearch.set("toDate", ids.closedToDate.value);
        }

        const vQueryString = objSearch.toString();
        const objResponse = await fetch(`${apiBase}/closed-positions${vQueryString ? `?${vQueryString}` : ""}`, {
            credentials: "same-origin"
        });
        if (!objResponse.ok) {
            throw new Error("Unable to load closed paper positions.");
        }

        const objPayload = await objResponse.json().catch(() => ({}));
        renderClosedPositions(Array.isArray(objPayload?.data) ? objPayload.data : []);
    }

    async function loadTempClosedPositions() {
        const objSearch = new URLSearchParams();
        if (ids.closedFromDate?.value) {
            objSearch.set("fromDate", ids.closedFromDate.value);
        }
        if (ids.closedToDate?.value) {
            objSearch.set("toDate", ids.closedToDate.value);
        }

        const vQueryString = objSearch.toString();
        const objResponse = await fetch(`${apiBase}/temp-closed-positions${vQueryString ? `?${vQueryString}` : ""}`, {
            credentials: "same-origin"
        });
        if (!objResponse.ok) {
            throw new Error("Unable to load temp closed paper positions.");
        }

        const objPayload = await objResponse.json().catch(() => ({}));
        renderTempClosedPositions(Array.isArray(objPayload?.data) ? objPayload.data : []);
    }

    async function loadEvents() {
        const objResponse = await fetch(`${apiBase}/events`, {
            credentials: "same-origin"
        });
        if (!objResponse.ok) {
            throw new Error("Unable to load activity log.");
        }

        const objPayload = await objResponse.json().catch(() => ({}));
        renderEvents(Array.isArray(objPayload?.data) ? objPayload.data : []);
    }

    async function refreshEmaIndicator() {
        if (!ids.emaEnabled?.checked) {
            return loadStatus();
        }
        await flushProfileSave();
        const objResult = await postJson(`${apiBase}/ema/refresh`, {});
        const objRuntimeState = objResult?.data || {};
        applyRuntimeStatus(objRuntimeState);
        return objRuntimeState;
    }

    async function loadServerPanels() {
        await Promise.all([
            loadStatus(),
            loadOpenPositions(),
            loadTempClosedPositions(),
            loadClosedPositions(),
            loadEvents()
        ]);
    }

    async function loadLivePanels() {
        await Promise.all([
            loadStatus(),
            loadOpenPositions()
        ]);
    }

    function hasTrackedOpenPositions() {
        return Array.isArray(gLatestOpenPositions) && gLatestOpenPositions.length > 0;
    }

    function canAutoRefreshEvents() {
        return Boolean(ids.eventLog)
            && gIsEventLogVisible
            && document.visibilityState === "visible";
    }

    function canAutoRefreshClosedPositions() {
        return Boolean(ids.tempClosedPositionsBody || ids.closedPositionsBody)
            && gIsClosedPositionsVisible
            && document.visibilityState === "visible";
    }

    async function postJson(url, payload) {
        const objResponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload || {})
        });

        const objResult = await objResponse.json().catch(function () {
            return {};
        });

        if (!objResponse.ok) {
            throw new Error(String(objResult?.message || `Request failed (${objResponse.status}) for ${url}`));
        }

        return objResult;
    }

    async function runServerAction(url, payload) {
        setStatus("", "");
        try {
            await flushProfileSave();
            const objResult = await postJson(url, payload);
            await loadServerPanels();
            if (objResult?.message) {
                setStatus(objResult.message, "success");
                if (String(url || "").includes("/rules/update")) {
                    appendRuleSettingsMessage(objResult.message);
                }
            }
        }
        catch (objError) {
            console.error(objError);
            setStatus(objError instanceof Error ? objError.message : "Request failed.", "danger");
        }
    }

    async function kickRenkoCycleIfNeeded() {
        const shouldKickRenkoCycle = Boolean(ids.renkoFeedEnabled?.checked)
            && !Boolean(gLatestRuntimeState?.autoTraderEnabled);
        if (!shouldKickRenkoCycle) {
            return;
        }

        await flushProfileSave();
        await postJson(`${apiBase}/strategy/cycle`, {});
    }

    async function deleteOpenPosition(positionId) {
        const normalizedPositionId = String(positionId || "").trim();
        if (!normalizedPositionId) {
            return;
        }

        await runServerAction(`${apiBase}/open-positions/delete`, {
            positionId: normalizedPositionId
        });
    }

    async function closeOpenPosition(positionId) {
        const normalizedPositionId = String(positionId || "").trim();
        if (!normalizedPositionId) {
            return;
        }

        await runServerAction(`${apiBase}/open-positions/close`, {
            positionId: normalizedPositionId
        });
    }

    async function toggleManualRenkoSignal() {
        if (!ids.renkoFeedEnabled?.checked) {
            return;
        }

        const currentColor = String(gLatestRuntimeState?.state?.renkoLastColor || "").trim().toUpperCase();
        const nextColor = currentColor === "R" ? "G" : "R";
        await runServerAction(`${apiBase}/renko/signal`, {
            color: nextColor
        });
    }

    ids.symbol?.addEventListener("change", function () {
        applySymbolDefaults();
        updateOneLotMetric();
        updatePositivePnlMarketPrice();
        queueProfileSave();
    });

    ids.expiryMode1?.addEventListener("change", function () {
        applyExpiryModeDefaults();
        if (gHasLoadedProfile) {
            queueProfileSave();
        }
    });

    ids.expiryMode2?.addEventListener("change", function () {
        applyExpiryModeDefaults();
        if (gHasLoadedProfile) {
            queueProfileSave();
        }
    });

    ids.renkoFeedEnabled?.addEventListener("change", function () {
        gRenkoSaveNoticePending = true;
        updateRenkoFeedVisualState();
        queueProfileSave();
        void kickRenkoCycleIfNeeded().then(function () {
            return loadLivePanels();
        }).catch(function () { return undefined; });
    });

    ids.futuresEnabled?.addEventListener("change", function () {
        updateFuturesEnabledVisualState();
        queueProfileSave();
    });

    ids.demoBalance?.addEventListener("input", function () {
        updateBalanceMetrics(gLatestOpenPositions);
    });
    ids.targetOpenPnl?.addEventListener("input", function () {
        gTargetOpenPnlTriggered = false;
    });

    ids.trailGreenTp1Enabled?.addEventListener("change", function () {
        queueProfileSave();
    });
    ids.trailGreenSl1Enabled?.addEventListener("change", function () {
        queueProfileSave();
    });
    ids.trailRedTp1Enabled?.addEventListener("change", function () {
        queueProfileSave();
    });
    ids.trailRedSl1Enabled?.addEventListener("change", function () {
        queueProfileSave();
    });

    ids.trailGreenTp2Enabled?.addEventListener("change", function () {
        queueProfileSave();
    });
    ids.trailGreenSl2Enabled?.addEventListener("change", function () {
        queueProfileSave();
    });
    ids.trailRedTp2Enabled?.addEventListener("change", function () {
        queueProfileSave();
    });
    ids.trailRedSl2Enabled?.addEventListener("change", function () {
        queueProfileSave();
    });

    ids.renkoFeedPts?.addEventListener("change", function () {
        gRenkoSaveNoticePending = true;
        queueProfileSave();
        void kickRenkoCycleIfNeeded().then(function () {
            return loadLivePanels();
        }).catch(function () { return undefined; });
    });
    ids.renkoFeedManualPrice?.addEventListener("change", function () {
        gRenkoSaveNoticePending = true;
        queueProfileSave();
        void kickRenkoCycleIfNeeded().then(function () {
            return loadLivePanels();
        }).catch(function () { return undefined; });
    });
    ids.renkoFeedTimeframe?.addEventListener("change", function () {
        gRenkoSaveNoticePending = true;
        queueProfileSave();
        void kickRenkoCycleIfNeeded().then(function () {
            return loadLivePanels();
        }).catch(function () { return undefined; });
    });
    ids.renkoFeedPriceSrc?.addEventListener("change", function () {
        gRenkoSaveNoticePending = true;
        queueProfileSave();
        void kickRenkoCycleIfNeeded().then(function () {
            return loadLivePanels();
        }).catch(function () { return undefined; });
    });
    ids.updateRenkoButton?.addEventListener("click", async function () {
        const objButton = ids.updateRenkoButton;
        if (objButton) {
            objButton.disabled = true;
        }
        gRenkoManualPriceResetToken = Date.now();
        gRenkoSaveNoticePending = true;
        queueProfileSave();
        try {
            await flushProfileSave();
            if (ids.renkoFeedEnabled?.checked) {
                await postJson(`${apiBase}/strategy/cycle`, {});
            }
            await loadLivePanels();
        }
        catch (objError) {
            const vMessage = objError instanceof Error ? objError.message : "Unable to update Renko settings.";
            setStatus(vMessage, "danger");
            setRenkoSaveMessage(vMessage, "danger");
        }
        finally {
            if (objButton) {
                objButton.disabled = false;
            }
        }
    });

    ids.lastSignal?.addEventListener("click", function () {
        void toggleManualRenkoSignal();
    });
    ids.updateBoxMovingPriceButton?.addEventListener("click", function () {
        const vMovingPrice = Number(ids.boxConditionMovingPrice?.value);
        const vAnchorPrice = Number(ids.boxConditionAnchorPrice?.value);
        const bHasMovingPrice = Number.isFinite(vMovingPrice) && vMovingPrice > 0;
        const bHasAnchorPrice = Number.isFinite(vAnchorPrice) && vAnchorPrice > 0;
        if (!ids.boxConditionEnabled?.checked || (!bHasMovingPrice && !bHasAnchorPrice)) {
            setStatus("Enable Box Conditions and enter a valid Moving Price or Anchor Price.", "warning");
            return;
        }
        void runServerAction(`${apiBase}/box/moving-price`, {
            price: bHasMovingPrice ? vMovingPrice : null,
            anchorPrice: bHasAnchorPrice ? vAnchorPrice : null
        });
    });
    function triggerBoxAnchorColor(anchorKey, color) {
        if (!ids.boxConditionEnabled?.checked) {
            setStatus("Enable Box Conditions before selecting a Box anchor.", "warning");
            return;
        }
        const vAnchor = Number(gLatestRuntimeState?.state?.[anchorKey]);
        if (!Number.isFinite(vAnchor) || vAnchor <= 0) {
            setStatus("The selected Box anchor is not available yet.", "warning");
            return;
        }
        void runServerAction(`${apiBase}/box/signal`, {
            color: color,
            price: null
        });
    }
    function bindBoxAnchorControl(element, anchorKey) {
        element?.addEventListener("click", function () {
            triggerBoxAnchorColor(anchorKey, anchorKey === "boxUpperAnchor" ? "G" : "R");
        });
        element?.addEventListener("keydown", function (event) {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            triggerBoxAnchorColor(anchorKey, anchorKey === "boxUpperAnchor" ? "G" : "R");
        });
    }
    bindBoxAnchorControl(ids.boxConditionLowerAnchor, "boxLowerAnchor");
    bindBoxAnchorControl(ids.boxConditionUpperAnchor, "boxUpperAnchor");
    ids.boxConditionSignal?.addEventListener("click", function () {
        if (!ids.boxConditionEnabled?.checked) {
            setStatus("Enable Box Conditions before toggling the Box signal.", "warning");
            return;
        }
        const vCurrentColor = String(gLatestRuntimeState?.state?.boxLastColor || "").trim().toUpperCase();
        const vNextColor = vCurrentColor === "R" ? "G" : "R";
        const vMovingPrice = Number(ids.boxConditionMovingPrice?.value);
        void runServerAction(`${apiBase}/box/signal`, {
            color: vNextColor,
            price: Number.isFinite(vMovingPrice) && vMovingPrice > 0 ? vMovingPrice : null
        });
    });

    ids.refreshOpenPositionsButton?.addEventListener("click", function () {
        void Promise.all([loadStatus(), loadOpenPositions()]);
    });

    ids.openPositionsBody?.addEventListener("click", function (objEvent) {
        const objTarget = objEvent.target instanceof Element ? objEvent.target : null;
        const objCloseButton = objTarget?.closest(".rolling-demo-close-open-position");
        if (objCloseButton instanceof HTMLButtonElement) {
            const vClosePositionId = String(objCloseButton.dataset.positionId || "").trim();
            if (vClosePositionId) {
                void closeOpenPosition(vClosePositionId);
            }
            return;
        }

        const objButton = objTarget?.closest(".rolling-demo-delete-open-position");
        if (!(objButton instanceof HTMLButtonElement)) {
            return;
        }

        const vPositionId = String(objButton.dataset.positionId || "").trim();
        if (!vPositionId) {
            return;
        }

        void deleteOpenPosition(vPositionId);
    });

    ids.refreshEventsButton?.addEventListener("click", function () {
        void loadEvents();
    });
    if (ids.hideRenkoEvents instanceof HTMLInputElement) {
        ids.hideRenkoEvents.checked = readBooleanPreference(gHideRenkoEventsStorageKey);
        ids.hideRenkoEvents.addEventListener("change", function () {
            writeBooleanPreference(gHideRenkoEventsStorageKey, ids.hideRenkoEvents.checked);
            renderEvents(gLatestEvents);
        });
    }
    if (ids.hideRenkoGreenSkippedEvents instanceof HTMLInputElement) {
        ids.hideRenkoGreenSkippedEvents.checked = readBooleanPreference(gHideRenkoGreenSkippedEventsStorageKey);
        ids.hideRenkoGreenSkippedEvents.addEventListener("change", function () {
            writeBooleanPreference(gHideRenkoGreenSkippedEventsStorageKey, ids.hideRenkoGreenSkippedEvents.checked);
            renderEvents(gLatestEvents);
        });
    }

    ids.clearEventsButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/events/clear`);
    });

    ids.autoTraderButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/auto-trader`);
    });

    ids.placeFutureButton?.addEventListener("click", function () {
        const vAction = String(ids.manualFutAction?.value || "SELL").trim().toUpperCase();
        void runServerAction(`${apiBase}/manual/future`, {
            action: vAction === "BUY" ? "BUY" : "SELL"
        });
    });

    ids.openOptionButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/manual/option`, { ruleSet: 1 });
    });
    ids.openOptionButton2?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/manual/option`, { ruleSet: 2 });
    });

    ids.execStrategyButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/strategy/execute`);
    });

    ids.updateGreenRulesButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/rules/update`, {
            color: "G",
            ruleSet: 1
        });
    });
    ids.updateGreenRulesButton2?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/rules/update`, {
            color: "G",
            ruleSet: 2
        });
    });

    ids.updateRedRulesButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/rules/update`, {
            color: "R",
            ruleSet: 1
        });
    });
    ids.updateRedRulesButton2?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/rules/update`, {
            color: "R",
            ruleSet: 2
        });
    });
    ids.updatePositivePnlButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/positive-pnl/settings/update`, {});
    });
    ids.openPositivePnlButton?.addEventListener("click", function () {
        queueProfileSave();
        void flushProfileSave().then(function () {
            return runServerAction(`${apiBase}/manual/positive-pnl-support`, {});
        });
    });

    ids.exitOptionButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/manual/exit`, {
            instrumentType: "OPTION",
            ruleSet: 1
        });
    });
    ids.exitOptionButton2?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/manual/exit`, {
            instrumentType: "OPTION",
            ruleSet: 2
        });
    });

    ids.exitFutureButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/manual/exit`, {
            instrumentType: "FUTURE"
        });
    });

    ids.clearOpenPositionsButton?.addEventListener("click", function () {
        if (ids.skipRenkoEntryNoOpenOptions) {
            ids.skipRenkoEntryNoOpenOptions.checked = true;
        }
        queueProfileSave();
        void runServerAction(`${apiBase}/manual/exit`, {
            instrumentType: "ALL"
        });
    });

    ids.killSwitchButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/manual/exit`, {
            instrumentType: "ALL",
            killSwitch: true
        });
    });

    ids.clearClosedFiltersButton?.addEventListener("click", function () {
        if (ids.closedFromDate) {
            ids.closedFromDate.value = "";
        }
        if (ids.closedToDate) {
            ids.closedToDate.value = "";
        }
        queueProfileSave();
        void Promise.all([loadTempClosedPositions(), loadClosedPositions()]);
    });

    ids.clearTempClosedPositionsButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/temp-closed-positions/clear`);
    });

    ids.clearClosedPositionsButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/closed-positions/clear`);
    });

    [
        ids.manualFutQty,
        ids.manualFutOrderType,
        ids.manualFutAction,
        ids.futuresEnabled,
        ids.replacementBlockSameLegEnabled,
        ids.replacementImmediateTriggerGuardEnabled,
        ids.replacementCloseOrphanEnabled,
        ids.replacementCloseWhenOriginalPositiveEnabled,
        ids.replacementCloseEmaMismatchEnabled,
        ids.boxColorChangeOpenEnabled,
        ids.boxColorChangeCloseEnabled,
        ids.closeSupportLegOnSourceClose,
        ids.replacementUseRenkoColorEnabled,
        ids.replacementWaitForRenkoPointEnabled,
        ids.replacementUseEmaTrendEnabled,
        ids.action1,
        ids.legSide1,
        ids.expiryDate1,
        ids.manualOptQty1,
        ids.reDelta1,
        ids.redTpPct,
        ids.redSlPct,
        ids.reEnter1,
        ids.action2,
        ids.legSide2,
        ids.expiryMode2,
        ids.expiryDate2,
        ids.manualOptQty2,
        ids.reEnter2,
        ids.greenOptQty2,
        ids.greenReDelta2,
        ids.greenTpPct2,
        ids.greenSlPct2,
        ids.redOptQty2,
        ids.redReDelta2,
        ids.redTpPct2,
        ids.redSlPct2,
        ids.redOptQty,
        ids.greenOptQty,
        ids.greenReDelta,
        ids.greenTpPct,
        ids.greenSlPct,
        ids.emaEnabled,
        ids.emaSignalEnabled,
        ids.emaRenkoConfirmEnabled,
        ids.emaTimeframe,
        ids.emaSource,
        ids.emaPeriod,
        ids.emaManualValue,
        ids.tradingViewEmaEnabled,
        ids.tradingViewEmaSide,
        ids.demoBalance,
        ids.closeAllLegsOnAnyClose,
        ids.skipRenkoEntryNoOpenOptions,
        ids.targetOpenPnl,
        ids.boxConditionPoints,
        ids.boxConditionEnabled,
        ids.boxConditionMovingPrice,
        ids.closedFromDate,
        ids.closedToDate
    ].forEach(function (objField) {
        objField?.addEventListener("change", queueProfileSave);
        if (objField instanceof HTMLInputElement && objField.type !== "checkbox") {
            objField.addEventListener("input", queueProfileSave);
        }
    });

    [ids.positivePnlSupportQty, ids.positivePnlMaxLegs, ids.positivePnlTriggerAmount, ids.positivePnlExpiryDate, ids.positivePnlTargetDelta, ids.positivePnlTpPct, ids.positivePnlSlPct].forEach(function (objField) {
        objField?.addEventListener("input", refreshPositivePnlSupportSettings);
    });
    ids.positivePnlExpiryMode?.addEventListener("change", function () {
        applyPositivePnlExpiryModeDefault(true);
        refreshPositivePnlSupportSettings();
    });
    ids.positivePnlTestRefreshTime?.addEventListener("input", function () {
        gLastPositivePnlTestRefreshKey = "";
        refreshPositivePnlSupportSettings();
    });
    [ids.positivePnlSupportEnabled, ids.positivePnlSupportAction, ids.positivePnlExpiryMode, ids.positivePnlExpiryDate, ids.positivePnlTrailSlEnabled, ids.positivePnlAdverseRenkoCloseEnabled].forEach(function (objField) {
        objField?.addEventListener("change", refreshPositivePnlSupportSettings);
    });

    ids.telegramAlertsEnabled?.addEventListener("change", queueProfileSave);
    ids.telegramEventCheckboxes.forEach(function (objCheckbox) {
        objCheckbox.addEventListener("change", queueProfileSave);
    });

    ids.closedFromDate?.addEventListener("change", function () {
        void Promise.all([loadTempClosedPositions(), loadClosedPositions()]).catch(function (objError) {
            console.error(objError);
            setStatus(objError instanceof Error ? objError.message : "Unable to load closed-position tables.", "danger");
        });
    });
    ids.closedToDate?.addEventListener("change", function () {
        void Promise.all([loadTempClosedPositions(), loadClosedPositions()]).catch(function (objError) {
            console.error(objError);
            setStatus(objError instanceof Error ? objError.message : "Unable to load closed-position tables.", "danger");
        });
    });

    loadProfile().then(function () {
        gHasLoadedProfile = true;
        return loadServerPanels();
    }).catch(function (objError) {
        console.error(objError);
        setStatus(objError instanceof Error ? objError.message : "Unable to load Rolling Options profile.", "danger");
        applySymbolDefaults();
        applyExpiryModeDefaults();
        applyPositivePnlExpiryModeDefault(false);
        updateRenkoFeedVisualState();
    });

    if (ids.eventLog) {
        if ("IntersectionObserver" in window) {
            const objEventObserver = new IntersectionObserver(function (entries) {
                const bVisible = entries.some(function (entry) {
                    return entry.isIntersecting && entry.intersectionRatio > 0;
                });
                const bBecameVisible = bVisible && !gIsEventLogVisible;
                gIsEventLogVisible = bVisible;
                if (bBecameVisible && document.visibilityState === "visible") {
                    void loadEvents().catch(function () { return undefined; });
                }
            }, {
                threshold: 0.1
            });
            objEventObserver.observe(ids.eventLog);
        }
        else {
            gIsEventLogVisible = true;
        }
    }

    if (ids.tempClosedPositionsBody || ids.closedPositionsBody) {
        if ("IntersectionObserver" in window) {
            const objClosedObserver = new IntersectionObserver(function (entries) {
                const bVisible = entries.some(function (entry) {
                    return entry.isIntersecting && entry.intersectionRatio > 0;
                });
                const bBecameVisible = bVisible && !gIsClosedPositionsVisible;
                gIsClosedPositionsVisible = bVisible;
                if (bBecameVisible && document.visibilityState === "visible") {
                    void Promise.all([loadTempClosedPositions(), loadClosedPositions()]).catch(function () { return undefined; });
                }
            }, {
                threshold: 0.1
            });
            if (ids.tempClosedPositionsBody) {
                objClosedObserver.observe(ids.tempClosedPositionsBody);
            }
            if (ids.closedPositionsBody) {
                objClosedObserver.observe(ids.closedPositionsBody);
            }
        }
        else {
            gIsClosedPositionsVisible = true;
        }
    }

    setInterval(function () {
        refreshDailyExpiryDatesIfNeeded();
        void kickRenkoCycleIfNeeded().then(function () {
            return syncExpiryDatesFromProfile();
        }).then(function () {
            return loadStatus();
        }).then(function (objRuntimeState) {
            const vOpenCount = Number(objRuntimeState?.counts?.openPositions || 0);
            if (vOpenCount > 0 && !hasTrackedOpenPositions()) {
                return loadOpenPositions();
            }
            return undefined;
        }).catch(function (objError) {
            console.error(objError);
            setStatus(objError instanceof Error ? objError.message : "Unable to refresh Rolling Options data.", "danger");
        });
    }, gStatusRefreshMs);

    setInterval(function () {
        if (document.visibilityState !== "visible"
            || !ids.renkoFeedEnabled?.checked
            || gRenkoLiveRefreshInFlight) {
            return;
        }

        gRenkoLiveRefreshInFlight = true;
        void kickRenkoCycleIfNeeded().then(function () {
            return loadStatus();
        }).catch(function (objError) {
            console.error(objError);
        }).finally(function () {
            gRenkoLiveRefreshInFlight = false;
        });
    }, gRenkoLiveRefreshMs);

    setInterval(function () {
        if (document.visibilityState !== "visible") {
            return;
        }
        void refreshEmaIndicator().catch(function (objError) {
            console.error(objError);
        });
    }, gEmaRefreshMs);

    setInterval(function () {
        if (!hasTrackedOpenPositions()) {
            return;
        }
        void loadOpenPositions().catch(function (objError) {
            console.error(objError);
            setStatus(objError instanceof Error ? objError.message : "Unable to refresh open positions.", "danger");
        });
    }, gOpenPositionsRefreshMs);

    setInterval(function () {
        if (!canAutoRefreshEvents()) {
            return;
        }
        void loadEvents().catch(function (objError) {
            console.error(objError);
            setStatus(objError instanceof Error ? objError.message : "Unable to refresh activity log.", "danger");
        });
    }, gEventsRefreshMs);

    setInterval(function () {
        if (!canAutoRefreshClosedPositions()) {
            return;
        }
        void Promise.all([loadTempClosedPositions(), loadClosedPositions()]).catch(function (objError) {
            console.error(objError);
            setStatus(objError instanceof Error ? objError.message : "Unable to refresh closed-position tables.", "danger");
        });
    }, gClosedPositionsRefreshMs);
})();
