(function () {
    const ids = {
        apiProfile: document.getElementById("ddlRollingStrangleLiveApiProfile"),
        checkConnectionButton: document.getElementById("btnRollingStrangleLiveCheckConnection"),
        connectionStatus: document.getElementById("rollingStrangleLiveConnectionStatus"),
        connectionStateValue: document.getElementById("rollingStrangleLiveConnectionStateValue"),
        lastCheckedValue: document.getElementById("rollingStrangleLiveLastCheckedValue"),
        whitelistIpValue: document.getElementById("rollingStrangleLiveWhitelistIpValue"),
        copyWhitelistIpButton: document.getElementById("btnRollingStrangleLiveCopyWhitelistIp"),
        symbol: document.getElementById("ddlRollingStrangleLiveSymbol"),
        lotSize: document.getElementById("txtRollingStrangleLiveLotSize"),
        futQty: document.getElementById("txtRollingStrangleLiveFutQty"),
        futureOrderType: document.getElementById("ddlRollingStrangleLiveOrderType"),
        futuresEnabled: document.getElementById("chkRollingStrangleLiveFuturesEnabled"),
        replacementBlockSameLegEnabled: document.getElementById("chkRollingStrangleLiveReplacementBlockSameLeg"),
        replacementImmediateTriggerGuardEnabled: document.getElementById("chkRollingStrangleLiveReplacementImmediateGuard"),
        replacementUseRenkoColorEnabled: document.getElementById("chkRollingStrangleLiveReplacementUseRenkoColor"),
        replacementWaitForRenkoPointEnabled: document.getElementById("chkRollingStrangleLiveReplacementWaitForRenkoPoint"),
        replacementCloseOrphanEnabled: document.getElementById("chkRollingStrangleLiveReplacementCloseOrphan"),
        replacementCloseWhenOriginalPositiveEnabled: document.getElementById("chkRollingStrangleLiveReplacementCloseOriginalPositive"),
        replacementUseEmaTrendEnabled: document.getElementById("chkRollingStrangleLiveReplacementUseEmaTrend"),
        replacementCloseEmaMismatchEnabled: document.getElementById("chkRollingStrangleLiveReplacementCloseEmaMismatch"),
        boxColorChangeCloseEnabled: document.getElementById("chkRollingStrangleLiveBoxColorClose"),
        emaEnabled: document.getElementById("chkRollingStrangleLiveEma"),
        emaSignalEnabled: document.getElementById("chkRollingStrangleLiveEmaSignal"),
        emaRenkoConfirmEnabled: document.getElementById("chkRollingStrangleLiveEmaRenkoConfirm"),
        emaTimeframe: document.getElementById("ddlRollingStrangleLiveEmaTimeframe"),
        emaSource: document.getElementById("ddlRollingStrangleLiveEmaSource"),
        emaPeriod: document.getElementById("txtRollingStrangleLiveEmaPeriod"),
        oneLotValue: document.getElementById("rollingStrangleLiveOneLotValue"),
        totalMarginValue: document.getElementById("rollingStrangleLiveTotalMarginValue"),
        blockedMarginValue: document.getElementById("rollingStrangleLiveBlockedMarginValue"),
        availableBalanceValue: document.getElementById("rollingStrangleLiveAvailableBalanceValue"),
        healthValue: document.getElementById("rollingStrangleLiveHealthValue"),
        openPnlValue: document.getElementById("rollingStrangleLiveOpenPnlValue"),
        targetOpenPnl: document.getElementById("txtRollingStrangleLiveTargetOpenPnl"),
        optionsPnlValue: document.getElementById("rollingStrangleLiveOptionsPnlValue"),
        totalChargesValue: document.getElementById("rollingStrangleLiveTotalChargesValue"),
        totalPnlValue: document.getElementById("rollingStrangleLiveTotalPnlValue"),
        profileLabel: document.getElementById("rollingStrangleLiveProfileLabel"),
        openCount: document.getElementById("rollingStrangleLiveOpenCount"),
        openRenkoSignal: document.getElementById("rollingStrangleLiveOpenRenkoSignal"),
        engineStatus: document.getElementById("rollingStrangleLiveEngineStatus"),
        pageStatus: document.getElementById("rollingStrangleLivePageStatus"),
        importStatus: document.getElementById("rollingStrangleLiveImportStatus"),
        autoTraderButton: document.getElementById("btnRollingStrangleLiveAutoTrader"),
        manualFutAction: document.getElementById("ddlRollingStrangleLiveFutAction"),
        placeFutureButton: document.getElementById("btnRollingStrangleLivePlaceFuture"),
        execStrategyButton: document.getElementById("btnRollingStrangleLiveExecStrategy"),
        openOptionButton: document.getElementById("btnRollingStrangleLiveOpenOption"),
        exitOptionButton: document.getElementById("btnRollingStrangleLiveExitOption"),
        optionAction: document.getElementById("ddlRollingStrangleLiveAction1"),
        optionLegSide: document.getElementById("ddlRollingStrangleLiveLegSide1"),
        optionExpiryMode: document.getElementById("ddlRollingStrangleLiveExpiryMode1"),
        optionExpiryDate: document.getElementById("txtRollingStrangleLiveExpiry1"),
        optionQty: document.getElementById("txtRollingStrangleLiveOptQty1"),
        optionReEnter: document.getElementById("chkRollingStrangleLiveReEnter1"),
        optionAction2: document.getElementById("ddlRollingStrangleLiveAction2"),
        optionLegSide2: document.getElementById("ddlRollingStrangleLiveLegSide2"),
        optionExpiryMode2: document.getElementById("ddlRollingStrangleLiveExpiryMode2"),
        optionExpiryDate2: document.getElementById("txtRollingStrangleLiveExpiry2"),
        optionQty2: document.getElementById("txtRollingStrangleLiveOptQty2"),
        optionReEnter2: document.getElementById("chkRollingStrangleLiveReEnter2"),
        redOptQty: document.getElementById("txtRollingStrangleLiveRedOptQty"),
        reRedDelta: document.getElementById("txtRollingStrangleLiveReRedD"),
        redTpPct: document.getElementById("txtRollingStrangleLiveRedTp"),
        redSlPct: document.getElementById("txtRollingStrangleLiveRedSl"),
        greenOptQty: document.getElementById("txtRollingStrangleLiveGreenOptQty"),
        greenReDelta: document.getElementById("txtRollingStrangleLiveReGreenD"),
        greenTpPct: document.getElementById("txtRollingStrangleLiveGreenTp"),
        greenSlPct: document.getElementById("txtRollingStrangleLiveGreenSl"),
        trailGreenTp1Enabled: document.getElementById("chkRollingStrangleLiveTrailGreenTp1Enabled"),
        trailGreenSl1Enabled: document.getElementById("chkRollingStrangleLiveTrailGreenSl1Enabled"),
        trailRedTp1Enabled: document.getElementById("chkRollingStrangleLiveTrailRedTp1Enabled"),
        trailRedSl1Enabled: document.getElementById("chkRollingStrangleLiveTrailRedSl1Enabled"),
        greenOptQty2: document.getElementById("txtRollingStrangleLiveGreenOptQty2"),
        greenReDelta2: document.getElementById("txtRollingStrangleLiveReGreenD2"),
        greenTpPct2: document.getElementById("txtRollingStrangleLiveGreenTp2"),
        greenSlPct2: document.getElementById("txtRollingStrangleLiveGreenSl2"),
        trailGreenTp2Enabled: document.getElementById("chkRollingStrangleLiveTrailGreenTp2Enabled"),
        trailGreenSl2Enabled: document.getElementById("chkRollingStrangleLiveTrailGreenSl2Enabled"),
        redOptQty2: document.getElementById("txtRollingStrangleLiveRedOptQty2"),
        redReDelta2: document.getElementById("txtRollingStrangleLiveReRedD2"),
        redTpPct2: document.getElementById("txtRollingStrangleLiveRedTp2"),
        redSlPct2: document.getElementById("txtRollingStrangleLiveRedSl2"),
        trailRedTp2Enabled: document.getElementById("chkRollingStrangleLiveTrailRedTp2Enabled"),
        trailRedSl2Enabled: document.getElementById("chkRollingStrangleLiveTrailRedSl2Enabled"),
        negativePnlHedgeEnabled: document.getElementById("chkRollingStrangleLiveNegativePnlHedgeEnabled"),
        negativePnlPlaceOrders: document.getElementById("chkRollingStrangleLiveNegativePnlPlaceOrders"),
        negativePnlAction3: document.getElementById("ddlRollingStrangleLiveNegativePnlAction3"),
        negativePnlHedgeQty: document.getElementById("txtRollingStrangleLiveNegativePnlHedgeQty"),
        negativePnlMaxLegs: document.getElementById("txtRollingStrangleLiveNegativePnlMaxLegs"),
        negativePnlHedgeExpiryMode: document.getElementById("ddlRollingStrangleLiveNegativePnlHedgeExpiryMode"),
        negativePnlHedgeDelta: document.getElementById("txtRollingStrangleLiveNegativePnlHedgeDelta"),
        negativePnlTpPct: document.getElementById("txtRollingStrangleLiveNegativePnlTp"),
        negativePnlSlPct: document.getElementById("txtRollingStrangleLiveNegativePnlSl"),
        negativePnlRecoveryTarget: document.getElementById("txtRollingStrangleLiveNegativePnlRecoveryTarget"),
        positivePnlTriggerAmount: document.getElementById("txtRollingStrangleLivePositivePnlTriggerAmount"),
        positivePnlTrailSlEnabled: document.getElementById("chkRollingStrangleLivePositivePnlTrailSl"),
        closeSupportLegOnSourceClose: document.getElementById("chkRollingStrangleLiveCloseSupportOnSourceClose"),
        positivePnlExpiryDate: document.getElementById("txtRollingStrangleLivePositivePnlExpiryDate"),
        positivePnlExpiryRefreshTime: document.getElementById("txtRollingStrangleLivePositivePnlRefreshTime"),
        positivePnlAdverseRenkoCloseEnabled: document.getElementById("chkRollingStrangleLivePositivePnlAdverseRenkoClose"),
        positivePnlMarketPrice: document.getElementById("txtRollingStrangleLivePositivePnlMarketPrice"),
        openPositivePnlButton: document.getElementById("btnRollingStrangleLiveOpenPositivePnl"),
        updateGreenRulesButton: document.getElementById("btnRollingStrangleLiveUpdateGreenRules"),
        updateGreenRulesButton2: document.getElementById("btnRollingStrangleLiveUpdateGreenRules2"),
        addOneLotFuture: document.getElementById("chkRollingStrangleLiveAddOneLotFuture"),
        renkoValue: document.getElementById("txtRollingStrangleLiveRenkoValue"),
        renkoManualPrice: document.getElementById("txtRollingStrangleLiveRenkoManualPrice"),
        renkoTimeframe: document.getElementById("ddlRollingStrangleLiveRenkoTimeframe"),
        renkoPriceSrc: document.getElementById("ddlRollingStrangleLiveRenkoPriceSrc"),
        renkoFeedEnabled: document.getElementById("chkRollingStrangleLiveRenkoFeed"),
        renkoFeedStatus: document.getElementById("rollingStrangleLiveRenkoFeedStatus"),
        renkoFromPrice: document.getElementById("rollingStrangleLiveRenkoFromPrice"),
        renkoAnchor: document.getElementById("rollingStrangleLiveRenkoAnchor"),
        emaIndicator: document.getElementById("rollingStrangleLiveEmaIndicator"),
        renkoBoxButton: document.getElementById("btnRollingStrangleLiveRenkoBox"),
        boxConditionPoints: document.getElementById("txtRollingStrangleLiveBoxPoints"),
        boxConditionEnabled: document.getElementById("chkRollingStrangleLiveBoxConditionsEnabled"),
        boxConditionMovingPrice: document.getElementById("txtRollingStrangleLiveBoxMovingPrice"),
        updateBoxMovingPriceButton: document.getElementById("btnRollingStrangleLiveUpdateBoxMovingPrice"),
        boxConditionSignal: document.getElementById("rollingStrangleLiveBoxSignal"),
        boxConditionFromPrice: document.getElementById("rollingStrangleLiveBoxFromPrice"),
        boxConditionUpperAnchor: document.getElementById("rollingStrangleLiveBoxUpperAnchor"),
        boxConditionLowerAnchor: document.getElementById("rollingStrangleLiveBoxLowerAnchor"),
        updateRedRulesButton: document.getElementById("btnRollingStrangleLiveUpdateRedRules"),
        updateRedRulesButton2: document.getElementById("btnRollingStrangleLiveUpdateRedRules2"),
        updateNegativePnlButton: document.getElementById("btnRollingStrangleLiveUpdateNegativePnl"),
        importButton: document.getElementById("btnRollingStrangleLiveImportPositions"),
        refreshOpenPositionsButton: document.getElementById("btnRollingStrangleLiveRefreshOpenPositions"),
        killSwitchButton: document.getElementById("btnRollingStrangleLiveKillSwitch"),
        closeAllLegsOnAnyClose: document.getElementById("chkRollingStrangleLiveCloseAllLegsOnAnyClose"),
        skipRenkoEntryNoOpenOptions: document.getElementById("chkRollingStrangleLiveSkipRenkoEntryNoOpenOptions"),
        openOptionButton2: document.getElementById("btnRollingStrangleLiveOpenOption2"),
        exitOptionButton2: document.getElementById("btnRollingStrangleLiveExitOption2"),
        openPositionsBody: document.getElementById("rollingStrangleLiveOpenPositionsBody"),
        payoffGraph: document.getElementById("rollingStrangleLiveOpenPayoffGraph"),
        closedFromDate: document.getElementById("txtRollingStrangleLiveClosedFromDate"),
        closedToDate: document.getElementById("txtRollingStrangleLiveClosedToDate"),
        clearClosedFiltersButton: document.getElementById("btnRollingStrangleLiveClearClosedFilters"),
        refreshClosedPositionsButton: document.getElementById("btnRollingStrangleLiveRefreshClosedPositions"),
        closedPositionsBody: document.getElementById("rollingStrangleLiveClosedPositionsBody"),
        closedPrevPageButton: document.getElementById("btnRollingStrangleLiveClosedPrevPage"),
        closedNextPageButton: document.getElementById("btnRollingStrangleLiveClosedNextPage"),
        closedPageInfo: document.getElementById("rollingStrangleLiveClosedPositionsPageInfo"),
        closedPageNumbers: document.getElementById("rollingStrangleLiveClosedPageNumbers"),
        hideRenkoEvents: document.getElementById("chkRollingStrangleLiveHideRenkoEvents"),
        hideRenkoGreenSkippedEvents: document.getElementById("chkRollingStrangleLiveHideRenkoGreenSkippedEvents"),
        refreshEventsButton: document.getElementById("btnRollingStrangleLiveRefreshEvents"),
        clearEventsButton: document.getElementById("btnRollingStrangleLiveClearEvents"),
        eventLog: document.getElementById("rollingStrangleLiveEventLog"),
        telegramEventCheckboxes: Array.from(document.querySelectorAll(".rolling-demo-telegram-event")),
        importOverlay: document.getElementById("rollingStrangleLiveImportOverlay"),
        importModal: document.getElementById("rollingStrangleLiveImportModal"),
        importList: document.getElementById("rollingStrangleLiveImportList"),
        closeImportModalButton: document.getElementById("btnRollingStrangleLiveCloseImportModal"),
        applyImportedPositionsButton: document.getElementById("btnRollingStrangleLiveApplyImportedPositions")
    };

    const symbolConfig = {
        BTC: { contractName: "BTCUSD", lotSize: 0.001 },
        ETH: { contractName: "ETHUSD", lotSize: 0.01 }
    };
    const shared = window.OptionyzeRollingStrangleShared || {};
    const PAYOFF_SL_ALL_LEGS_KEY = String(shared.PAYOFF_SL_ALL_LEGS_KEY || "__all_legs__");

    let gImportablePositions = [];
    let gDisplayedPositions = [];
    let gSelectedApiProfileId = "";
    let gConnectionState = "not_selected";
    let gConnectionPollTimer = null;
    let gRuntimeStatus = "idle";
    let gAutoTraderEnabled = false;
    let gIsApplyingState = false;
    let gSaveTimer = null;
    let gProfileSavePromise = Promise.resolve();
    let gRenkoKickTimer = null;
    let gPreviousOpenPositionLtps = new Map();
    let gLatestRuntimeState = null;
    let gClosedPositions = [];
    let gClosedPositionsPage = 1;
    let gLatestEvents = [];
    let gPayoffSlCheckpoints = [];
    let gPayoffSlSelectedLegKey = PAYOFF_SL_ALL_LEGS_KEY;
    let gPayoffProjectionDays = 0;
    let gPayoffCustomSpotPrice = NaN;
    let gPreviousMarketPrice = NaN;
    let gRenkoManualPriceResetToken = 0;
    let gNegativePnlAdjustmentOrderInFlight = false;
    const gNegativePnlAdjustedSourceKeys = new Set();
    const gClosedPositionsPageSize = 10;
    const gFutureBrokeragePct = 0.05;
    const gOptionBrokeragePct = 0.01;
    const gBrokerageGstMultiplier = 1.18;
    const gHideRenkoEventsStorageKey = "optionyze:rolling-options-strangle-live:hide-renko-events";
    const gHideRenkoGreenSkippedEventsStorageKey = "optionyze:rolling-options-strangle-live:hide-renko-green-skipped-events";

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

    function formatDateInputValue(dateValue) {
        return typeof shared.formatDateInputValue === "function"
            ? shared.formatDateInputValue(dateValue)
            : "";
    }

    function resolveExpiryDateByMode(expiryMode) {
        return typeof shared.resolveExpiryDateByMode === "function"
            ? shared.resolveExpiryDateByMode(expiryMode)
            : new Date();
    }

    function refreshPositivePnlExpiryAtConfiguredTime() {
        const vRefreshTime = String(ids.positivePnlExpiryRefreshTime?.value || "").trim();
        const vMode = String(ids.negativePnlHedgeExpiryMode?.value || "1").trim();
        if (!/^\d{2}:\d{2}$/.test(vRefreshTime) || vMode === "source") {
            return;
        }
        const objNow = new Date();
        const vNowTime = `${String(objNow.getHours()).padStart(2, "0")}:${String(objNow.getMinutes()).padStart(2, "0")}`;
        if (vNowTime < vRefreshTime) {
            return;
        }
        const vResolvedDate = normalizeExpiryDateValue(resolveExpiryDateByMode(vMode));
        if (vResolvedDate && ids.positivePnlExpiryDate?.value !== vResolvedDate) {
            ids.positivePnlExpiryDate.value = vResolvedDate;
            queueProfileSave();
        }
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
        const vSymbol = String(ids.symbol?.value || "BTC").trim().toUpperCase();
        return symbolConfig[vSymbol] || symbolConfig.BTC;
    }

    function normalizeSymbolValue(value) {
        const vSymbol = String(value || "").trim().toUpperCase();
        if (vSymbol === "ETH" || vSymbol === "ETHUSD") {
            return "ETH";
        }
        return "BTC";
    }

    function fmt(value, fractionDigits) {
        const vNumber = Number(value);
        if (!Number.isFinite(vNumber)) {
            return "-";
        }
        return vNumber.toFixed(fractionDigits);
    }

    function fmtUsd(value) {
        const vNumber = Number(value);
        if (!Number.isFinite(vNumber)) {
            return "-";
        }
        return `${vNumber.toFixed(2)} USD`;
    }

    function getLtpBlinkClass(positionId, markPrice) {
        const currentLtp = Number(markPrice);
        if (!positionId || !Number.isFinite(currentLtp)) {
            return "";
        }
        const previousLtp = gPreviousOpenPositionLtps.get(positionId);
        if (!Number.isFinite(previousLtp)) {
            return "";
        }
        if (currentLtp > previousLtp) {
            return "rolling-demo-ltp-up";
        }
        if (currentLtp < previousLtp) {
            return "rolling-demo-ltp-down";
        }
        return "";
    }

    function sumNumeric(rows, key) {
        return (Array.isArray(rows) ? rows : []).reduce(function (sum, row) {
            const value = Number(row && row[key]);
            return Number.isFinite(value) ? sum + value : sum;
        }, 0);
    }

    function getLotSizeForContract(contractName) {
        const value = String(contractName || "").trim().toUpperCase();
        return value.includes("ETH") ? 0.01 : 0.001;
    }

    function estimateOpenPositionCharges(row) {
        const contractName = String(row?.contractName || "").trim();
        const lotSize = Math.max(0, getLotSizeForContract(contractName));
        const qty = Math.max(0, Number(row?.qty || 0));
        const entryPrice = Math.max(0, Number(row?.entryPrice || 0));
        if (!(lotSize > 0) || !(qty > 0) || !(entryPrice > 0)) {
            return 0;
        }
        const notional = qty * lotSize * entryPrice;
        const brokeragePct = isOptionContract(contractName) ? gOptionBrokeragePct : gFutureBrokeragePct;
        return Number((((notional * brokeragePct) / 100) * gBrokerageGstMultiplier).toFixed(4));
    }

    function calculateOpenPositionPnl(row) {
        const side = String(row?.side || "").trim().toUpperCase();
        const lotSize = Math.max(0, getLotSizeForContract(row?.contractName || ""));
        const qty = Math.max(0, Number(row?.qty || 0));
        const entryPrice = Number(row?.entryPrice || 0);
        const markPrice = Number(row?.markPrice || 0);
        if (!(lotSize > 0) || !(qty > 0) || !Number.isFinite(entryPrice) || !Number.isFinite(markPrice)) {
            return 0;
        }
        const signedMove = side === "BUY"
            ? (markPrice - entryPrice)
            : (entryPrice - markPrice);
        return Number((signedMove * qty * lotSize).toFixed(2));
    }

    function isOptionContract(contractName) {
        const value = String(contractName || "").trim().toUpperCase();
        return value.startsWith("C-") || value.startsWith("P-");
    }

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
                ? String(row?.metadata?.sourceImportId || "").trim()
                : "";
        }).filter(Boolean));
        const sourceOptionRows = (Array.isArray(rows) ? rows : []).filter(function (row) {
            return isOptionContract(String(row?.contractName || ""))
                && !Boolean(row?.metadata?.negativePnlAdjustment);
        });
        if (sourceOptionRows.length < 2) {
            return [];
        }
        const hasPositiveSourceOption = (Array.isArray(rows) ? rows : []).some(function (row) {
            const contractName = String(row?.contractName || "");
            const pnl = Number.isFinite(Number(row?.pnl)) ? Number(row.pnl) : calculateOpenPositionPnl(row);
            return isOptionContract(contractName)
                && !Boolean(row?.metadata?.negativePnlAdjustment)
                && Number.isFinite(pnl)
                && pnl > 0;
        });
        if (!hasPositiveSourceOption) {
            return [];
        }

        const negativeCandidates = (Array.isArray(rows) ? rows : []).filter(function (row) {
            const contractName = String(row?.contractName || "");
            const importId = String(row?.importId || row?.contractName || "").trim();
            const pnl = Number.isFinite(Number(row?.pnl)) ? Number(row.pnl) : calculateOpenPositionPnl(row);
            const markPrice = Number(row?.markPrice);
            return isOptionContract(contractName)
                && !Boolean(row?.metadata?.negativePnlAdjustment)
                && !adjustedSourceKeys.has(importId)
                && Number.isFinite(pnl)
                && pnl < 0
                && Number.isFinite(markPrice)
                && markPrice >= 0;
        });
        const targetOptionSide = negativeCandidates.reduce(function (selectedSide, row) {
            const rowSide = getNegativePnlOptionSide(row);
            const rowLoss = Math.abs(Number.isFinite(Number(row?.pnl)) ? Number(row.pnl) : calculateOpenPositionPnl(row));
            const selectedRow = negativeCandidates.find(function (candidate) {
                return getNegativePnlOptionSide(candidate) === selectedSide;
            });
            const selectedLoss = selectedRow
                ? Math.abs(Number.isFinite(Number(selectedRow?.pnl)) ? Number(selectedRow.pnl) : calculateOpenPositionPnl(selectedRow))
                : 0;
            return rowSide && rowLoss > selectedLoss ? rowSide : selectedSide;
        }, "");

        return negativeCandidates.filter(function (row) {
            return getNegativePnlOptionSide(row) === targetOptionSide;
        }).slice(0, remainingLegSlots).map(function (row, index) {
            const side = action3;
            const importId = String(row?.importId || row?.contractName || index);
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
                importId: `negative-pnl-preview:${importId}`,
                side,
                action: side,
                qty: hedgeQty,
                entryPrice: Number(row.markPrice),
                entryDelta: hedgeDelta,
                currentDelta: hedgeDelta,
                expiryDate: hedgeExpiryDate,
                pnl: 0,
                openedAt: "",
                metadata: {
                    ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
                    negativePnlOptionLegPreview: true,
                    negativePnlOptionLegAdjustment: true,
                    actionSlot: 3,
                    actionLabel: "Action 3",
                    sourceImportId: importId,
                    ruleSet: Math.max(1, Math.min(2, Math.floor(Number(row?.metadata?.ruleSet ?? 1)))),
                    hedgeExpiryMode,
                    hedgeTargetDelta: hedgeDelta,
                    manualHedgeQty: hedgeQty,
                    maxHedgeQty: hedgeQty,
                    maxLegs,
                    remainingLegSlots,
                    sourceLossAmount: Math.abs(Number.isFinite(Number(row?.pnl)) ? Number(row.pnl) : calculateOpenPositionPnl(row)),
                    orderAction: side.toLowerCase(),
                    orderLegSide: String(row.contractName || "").trim().toUpperCase().startsWith("P-") ? "pe" : "ce",
                    orderExpiryDate: hedgeExpiryDate,
                    orderQty: hedgeQty,
                    orderTargetDelta: hedgeDelta,
                    displayContractName: previewContractName,
                    requestedExpiryDate: hedgeExpiryDate,
                    resolvedExpiryDate: hedgeExpiryDate
                }
            };
        });
    }

    function withNegativePnlOptionLegPreviews(rows) {
        return Array.isArray(rows) ? rows : [];
    }

    function refreshNegativePnlHedgePreview() {
        queueProfileSave();
        if (Array.isArray(gDisplayedPositions) && gDisplayedPositions.length) {
            renderOpenPositions(gDisplayedPositions);
        }
    }

    function shouldPlaceNegativePnlAdjustmentOrders() {
        return Boolean(ids.negativePnlHedgeEnabled?.checked)
            && Boolean(ids.negativePnlPlaceOrders?.checked)
            && canUseLiveActions();
    }

    async function placeNegativePnlAdjustmentOrders(adjustmentRows) {
        if (gNegativePnlAdjustmentOrderInFlight || !shouldPlaceNegativePnlAdjustmentOrders()) {
            return;
        }

        const maxLegs = Math.max(1, Math.floor(parseNumberInput(ids.negativePnlMaxLegs, 1)));
        const openAdjustmentCount = (Array.isArray(gDisplayedPositions) ? gDisplayedPositions : []).filter(function (row) {
            return Boolean(row?.metadata?.negativePnlAdjustment);
        }).length;
        const remainingLegSlots = Math.max(0, maxLegs - openAdjustmentCount);
        const arrRows = (Array.isArray(adjustmentRows) ? adjustmentRows : []).filter(function (row) {
            const sourceKey = String(row?.metadata?.sourceImportId || "").trim();
            return sourceKey && !gNegativePnlAdjustedSourceKeys.has(sourceKey);
        }).slice(0, remainingLegSlots);
        const sourceOptionRows = (Array.isArray(gDisplayedPositions) ? gDisplayedPositions : []).filter(function (row) {
            return isOptionContract(String(row?.contractName || ""))
                && !Boolean(row?.metadata?.negativePnlAdjustment);
        });
        if (sourceOptionRows.length < 2) {
            return;
        }
        const hasPositiveSourceOption = (Array.isArray(gDisplayedPositions) ? gDisplayedPositions : []).some(function (row) {
            const contractName = String(row?.contractName || "");
            const pnl = Number.isFinite(Number(row?.pnl)) ? Number(row.pnl) : calculateOpenPositionPnl(row);
            return isOptionContract(contractName)
                && !Boolean(row?.metadata?.negativePnlAdjustment)
                && Number.isFinite(pnl)
                && pnl > 0;
        });
        if (!hasPositiveSourceOption) {
            return;
        }
        if (!arrRows.length) {
            return;
        }

        gNegativePnlAdjustmentOrderInFlight = true;
        try {
            await flushProfileSave();
            for (const row of arrRows) {
                const sourceKey = String(row?.metadata?.sourceImportId || "").trim();
                const objMeta = row?.metadata || {};
                const vExpiryDate = String(objMeta.orderExpiryDate || row.expiryDate || "").trim();
                if (!sourceKey || !vExpiryDate) {
                    continue;
                }

                gNegativePnlAdjustedSourceKeys.add(sourceKey);
                let objResult = null;
                try {
                    objResult = await postJson("/api/rollingoptions-strangle-live/manual/option", {
                        operation: "open",
                        action: String(objMeta.orderAction || ids.negativePnlAction3?.value || "buy").trim().toLowerCase() === "sell" ? "sell" : "buy",
                        actionSlot: 3,
                        symbol: String(ids.symbol?.value || "BTC").trim().toUpperCase(),
                        legSide: String(objMeta.orderLegSide || "ce").trim().toLowerCase(),
                        expiryMode: String(objMeta.hedgeExpiryMode || ids.negativePnlHedgeExpiryMode?.value || "1"),
                        expiryDate: vExpiryDate,
                        qty: Math.max(1, Math.floor(Number(objMeta.orderQty || row.qty || 1))),
                        targetDelta: Math.max(0, Number(objMeta.orderTargetDelta || ids.negativePnlHedgeDelta?.value || 0.53)),
                        ruleSet: Number(objMeta.ruleSet || 1) === 2 ? 2 : 1,
                        reason: "negative_pnl_auto_adjustment",
                        sourceImportId: sourceKey
                    });
                }
                catch (objError) {
                    gNegativePnlAdjustedSourceKeys.delete(sourceKey);
                    throw objError;
                }
                const arrTracked = Array.isArray(objResult?.data?.trackedOpenPositions)
                    ? objResult.data.trackedOpenPositions
                    : null;
                if (arrTracked) {
                    renderOpenPositions(arrTracked);
                }
                setStatus(ids.pageStatus, objResult?.message || "Negative PnL adjustment live order placed.", "success");
            }
            await Promise.all([
                reconcileOpenPositionsSilently().catch(function () { return undefined; }),
                loadAccountSummary().catch(function () { return undefined; }),
                loadEvents().catch(function () { return undefined; })
            ]);
        }
        catch (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to place negative PnL adjustment order.", "danger");
        }
        finally {
            gNegativePnlAdjustmentOrderInFlight = false;
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    }

    function setStatus(target, message, tone) {
        if (!target) {
            return;
        }

        target.textContent = String(message || "").trim();
        target.className = "rolling-strangle-live-status";
        if (!message) {
            return;
        }

        target.classList.add("show");
        if (tone) {
            target.classList.add(tone);
        }
    }

    function formatDateTime(value) {
        return typeof shared.formatDateTime === "function"
            ? shared.formatDateTime(value)
            : "-";
    }

    function normalizeConfiguredDelta(value, fallbackValue) {
        const parsedValue = Number(value);
        if (!Number.isFinite(parsedValue)) {
            return fallbackValue;
        }
        return Math.min(1, Math.max(0, parsedValue > 1 ? parsedValue / 100 : parsedValue));
    }

    function parseNumberInput(field, fallbackValue) {
        const rawValue = field?.value;
        if (rawValue === null || rawValue === undefined || rawValue === "") {
            return fallbackValue;
        }

        const parsedValue = Number(rawValue);
        return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
    }

    function applySymbolDefaults() {
        const objConfig = getSelectedConfig();
        if (ids.lotSize) {
            ids.lotSize.value = String(objConfig.lotSize);
        }
        if (ids.oneLotValue) {
            ids.oneLotValue.textContent = "-";
        }
    }

    function applyExpiryModeDefaults(force, expiryModeField, expiryDateField) {
        if (!expiryModeField || !expiryDateField) {
            return;
        }

        if (!force && String(expiryDateField.value || "").trim()) {
            return;
        }

        const resolvedDate = resolveExpiryDateByMode(expiryModeField.value);
        const formattedDate = formatDateInputValue(resolvedDate);
        if (formattedDate) {
            expiryDateField.value = formattedDate;
        }
    }

    function getUiState() {
        return {
            symbol: normalizeSymbolValue(ids.symbol?.value || "BTC"),
            manualFutQty: parseNumberInput(ids.futQty, 1),
            manualFutOrderType: String(ids.futureOrderType?.value || "market_order"),
            manualFutAction: String(ids.manualFutAction?.value || "SELL"),
            futuresEnabled: Boolean(ids.futuresEnabled?.checked),
            replacementBlockSameLegEnabled: Boolean(ids.replacementBlockSameLegEnabled?.checked),
            replacementImmediateTriggerGuardEnabled: Boolean(ids.replacementImmediateTriggerGuardEnabled?.checked),
            replacementUseRenkoColorEnabled: Boolean(ids.replacementUseRenkoColorEnabled?.checked),
            replacementWaitForRenkoPointEnabled: Boolean(ids.replacementWaitForRenkoPointEnabled?.checked),
            replacementCloseOrphanEnabled: Boolean(ids.replacementCloseOrphanEnabled?.checked),
            replacementCloseWhenOriginalPositiveEnabled: Boolean(ids.replacementCloseWhenOriginalPositiveEnabled?.checked),
            replacementUseEmaTrendEnabled: Boolean(ids.replacementUseEmaTrendEnabled?.checked),
            replacementCloseEmaMismatchEnabled: Boolean(ids.replacementCloseEmaMismatchEnabled?.checked),
            boxColorChangeCloseEnabled: Boolean(ids.boxColorChangeCloseEnabled?.checked),
            emaEnabled: Boolean(ids.emaEnabled?.checked),
            emaSignalEnabled: Boolean(ids.emaSignalEnabled?.checked),
            emaRenkoConfirmEnabled: Boolean(ids.emaRenkoConfirmEnabled?.checked),
            emaTimeframe: String(ids.emaTimeframe?.value || "1m"),
            emaSource: String(ids.emaSource?.value || "candles"),
            emaPeriod: parseNumberInput(ids.emaPeriod, 20),
            action1: String(ids.optionAction?.value || "sell"),
            legSide1: String(ids.optionLegSide?.value || "ce"),
            expiryMode1: String(ids.optionExpiryMode?.value || "1"),
            expiryDate1: String(ids.optionExpiryDate?.value || ""),
            manualOptQty1: parseNumberInput(ids.optionQty, 1),
            reEnter1: Boolean(ids.optionReEnter?.checked),
            action2: String(ids.optionAction2?.value || "none"),
            legSide2: String(ids.optionLegSide2?.value || "pe"),
            expiryMode2: String(ids.optionExpiryMode2?.value || "1"),
            expiryDate2: String(ids.optionExpiryDate2?.value || ""),
            manualOptQty2: parseNumberInput(ids.optionQty2, 1),
            reEnter2: Boolean(ids.optionReEnter2?.checked),
            redOptQty: parseNumberInput(ids.redOptQty, 1),
            reRedDelta: parseNumberInput(ids.reRedDelta, 0.53),
            redTpPct: parseNumberInput(ids.redTpPct, 0.50),
            redSlPct: parseNumberInput(ids.redSlPct, 0.90),
            greenOptQty: parseNumberInput(ids.greenOptQty, 1),
            greenReDelta: parseNumberInput(ids.greenReDelta, 0.53),
            greenTpPct: parseNumberInput(ids.greenTpPct, 0.50),
            greenSlPct: parseNumberInput(ids.greenSlPct, 0.90),
            trailGreenTp1Enabled: Boolean(ids.trailGreenTp1Enabled?.checked),
            trailGreenSl1Enabled: Boolean(ids.trailGreenSl1Enabled?.checked),
            trailRedTp1Enabled: Boolean(ids.trailRedTp1Enabled?.checked),
            trailRedSl1Enabled: Boolean(ids.trailRedSl1Enabled?.checked),
            greenOptQty2: parseNumberInput(ids.greenOptQty2, 1),
            greenReDelta2: parseNumberInput(ids.greenReDelta2, 0.53),
            greenTpPct2: parseNumberInput(ids.greenTpPct2, 0.50),
            greenSlPct2: parseNumberInput(ids.greenSlPct2, 0.90),
            trailGreenTp2Enabled: Boolean(ids.trailGreenTp2Enabled?.checked),
            trailGreenSl2Enabled: Boolean(ids.trailGreenSl2Enabled?.checked),
            redOptQty2: parseNumberInput(ids.redOptQty2, 1),
            redReDelta2: parseNumberInput(ids.redReDelta2, 0.53),
            redTpPct2: parseNumberInput(ids.redTpPct2, 0.50),
            redSlPct2: parseNumberInput(ids.redSlPct2, 0.90),
            trailRedTp2Enabled: Boolean(ids.trailRedTp2Enabled?.checked),
            trailRedSl2Enabled: Boolean(ids.trailRedSl2Enabled?.checked),
            negativePnlHedgeEnabled: Boolean(ids.negativePnlHedgeEnabled?.checked),
            negativePnlPlaceOrders: Boolean(ids.negativePnlPlaceOrders?.checked),
            negativePnlAction3: String(ids.negativePnlAction3?.value || "buy"),
            negativePnlHedgeQty: parseNumberInput(ids.negativePnlHedgeQty, 10),
            negativePnlMaxLegs: parseNumberInput(ids.negativePnlMaxLegs, 1),
            negativePnlHedgeExpiryMode: String(ids.negativePnlHedgeExpiryMode?.value || "1"),
            negativePnlHedgeDelta: parseNumberInput(ids.negativePnlHedgeDelta, 0.53),
            negativePnlTpPct: parseNumberInput(ids.negativePnlTpPct, 15),
            negativePnlSlPct: parseNumberInput(ids.negativePnlSlPct, 85),
            negativePnlRecoveryTarget: parseNumberInput(ids.negativePnlRecoveryTarget, 0),
            positivePnlSupportEnabled: Boolean(ids.negativePnlHedgeEnabled?.checked),
            positivePnlSupportAction: String(ids.negativePnlAction3?.value || "buy"),
            positivePnlSupportQty: parseNumberInput(ids.negativePnlHedgeQty, 10),
            positivePnlMaxLegs: parseNumberInput(ids.negativePnlMaxLegs, 1),
            positivePnlTriggerAmount: Math.min(0, parseNumberInput(ids.positivePnlTriggerAmount, 0)),
            positivePnlExpiryMode: String(ids.negativePnlHedgeExpiryMode?.value || "1"),
            positivePnlTargetDelta: parseNumberInput(ids.negativePnlHedgeDelta, 0.53),
            positivePnlTpPct: parseNumberInput(ids.negativePnlTpPct, 15),
            positivePnlSlPct: parseNumberInput(ids.negativePnlSlPct, 85),
            positivePnlTrailSlEnabled: Boolean(ids.positivePnlTrailSlEnabled?.checked),
            closeSupportLegOnSourceClose: Boolean(ids.closeSupportLegOnSourceClose?.checked),
            positivePnlExpiryDate: String(ids.positivePnlExpiryDate?.value || ""),
            positivePnlExpiryRefreshTime: String(ids.positivePnlExpiryRefreshTime?.value || ""),
            positivePnlAdverseRenkoCloseEnabled: Boolean(ids.positivePnlAdverseRenkoCloseEnabled?.checked),
            addOneLotFuture: Boolean(ids.addOneLotFuture?.checked),
            renkoFeedPts: parseNumberInput(ids.renkoValue, 10),
            renkoFeedManualPrice: Number(ids.renkoManualPrice?.value) > 0
                ? Number(ids.renkoManualPrice.value)
                : null,
            renkoManualPriceResetToken: gRenkoManualPriceResetToken,
            renkoFeedTimeframe: String(ids.renkoTimeframe?.value || "1m"),
            renkoFeedPriceSrc: String(ids.renkoPriceSrc?.value || "mark_price"),
            renkoFeedEnabled: Boolean(ids.renkoFeedEnabled?.checked),
            boxConditionPoints: parseNumberInput(ids.boxConditionPoints, 10),
            boxConditionEnabled: Boolean(ids.boxConditionEnabled?.checked),
            boxConditionMovingPrice: Number(ids.boxConditionMovingPrice?.value) > 0
                ? Number(ids.boxConditionMovingPrice.value)
                : null,
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
            closedFromDate: String(ids.closedFromDate?.value || ""),
            closedToDate: String(ids.closedToDate?.value || ""),
            telegramAlertsEnabled: ids.telegramEventCheckboxes.some(function (objCheckbox) { return objCheckbox.checked; }),
            telegramAlertTypes: ids.telegramEventCheckboxes
                .filter(function (objCheckbox) { return objCheckbox.checked; })
                .map(function (objCheckbox) { return String(objCheckbox.value || "").trim(); })
                .filter(Boolean)
        };
    }

    function setFieldValue(field, value) {
        if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement) && !(field instanceof HTMLTextAreaElement)) {
            return;
        }

        if (field instanceof HTMLInputElement && field.type === "checkbox") {
            field.checked = Boolean(value);
            return;
        }

        field.value = String(value ?? "");
    }

    function applyUiState(uiState) {
        gIsApplyingState = true;
        gPayoffSlCheckpoints = normalizePayoffSlCheckpoints(uiState?.payoffSlCheckpoints, uiState?.payoffSlCheckpointPrices ?? uiState?.payoffSlCheckpointPrice);
        gPayoffSlSelectedLegKey = normalizePayoffSlSelectedLegKey(uiState?.payoffSlSelectedLegKey);
        gPayoffProjectionDays = normalizePayoffProjectionDays(uiState?.payoffProjectionDays);
        gPayoffCustomSpotPrice = normalizePayoffCustomSpotPrice(uiState?.payoffCustomSpotPrice);

        setFieldValue(ids.symbol, normalizeSymbolValue(uiState.symbol));
        setFieldValue(ids.futQty, uiState.manualFutQty);
        setFieldValue(ids.futureOrderType, uiState.manualFutOrderType);
        setFieldValue(ids.manualFutAction, uiState.manualFutAction ?? "SELL");
        setFieldValue(ids.futuresEnabled, uiState.futuresEnabled ?? true);
        setFieldValue(ids.replacementBlockSameLegEnabled, uiState.replacementBlockSameLegEnabled ?? true);
        setFieldValue(ids.replacementImmediateTriggerGuardEnabled, uiState.replacementImmediateTriggerGuardEnabled ?? true);
        setFieldValue(ids.replacementUseRenkoColorEnabled, uiState.replacementUseRenkoColorEnabled ?? true);
        setFieldValue(ids.replacementWaitForRenkoPointEnabled, uiState.replacementWaitForRenkoPointEnabled ?? false);
        setFieldValue(ids.replacementCloseOrphanEnabled, uiState.replacementCloseOrphanEnabled ?? true);
        setFieldValue(ids.replacementCloseWhenOriginalPositiveEnabled, uiState.replacementCloseWhenOriginalPositiveEnabled ?? true);
        setFieldValue(ids.replacementUseEmaTrendEnabled, uiState.replacementUseEmaTrendEnabled ?? true);
        setFieldValue(ids.replacementCloseEmaMismatchEnabled, uiState.replacementCloseEmaMismatchEnabled ?? false);
        setFieldValue(ids.boxColorChangeCloseEnabled, uiState.boxColorChangeCloseEnabled ?? false);
        setFieldValue(ids.emaEnabled, uiState.emaEnabled ?? false);
        setFieldValue(ids.emaSignalEnabled, uiState.emaSignalEnabled ?? false);
        setFieldValue(ids.emaRenkoConfirmEnabled, uiState.emaRenkoConfirmEnabled ?? false);
        setFieldValue(ids.emaTimeframe, uiState.emaTimeframe ?? "1m");
        setFieldValue(ids.emaSource, uiState.emaSource ?? "candles");
        setFieldValue(ids.emaPeriod, uiState.emaPeriod ?? 20);
        setFieldValue(ids.optionAction, uiState.action1);
        setFieldValue(ids.optionLegSide, uiState.legSide1);
        setFieldValue(ids.optionExpiryMode, uiState.expiryMode1);
        setFieldValue(ids.optionExpiryDate, uiState.expiryDate1);
        setFieldValue(ids.optionQty, uiState.manualOptQty1);
        setFieldValue(ids.optionReEnter, uiState.reEnter1);
        setFieldValue(ids.optionAction2, uiState.action2 ?? "none");
        setFieldValue(ids.optionLegSide2, uiState.legSide2 ?? "pe");
        setFieldValue(ids.optionExpiryMode2, uiState.expiryMode2 ?? "1");
        setFieldValue(ids.optionExpiryDate2, uiState.expiryDate2);
        setFieldValue(ids.optionQty2, uiState.manualOptQty2 ?? 1);
        setFieldValue(ids.optionReEnter2, uiState.reEnter2);
        const vManualFutQty = Math.max(1, Math.floor(Number(uiState.manualFutQty || 1)));
        const vRedOptQtyLegacyPct = Number(uiState.redOptQtyPct ?? uiState.autoOptQtyPct ?? 0);
        const vRedOptQty = Number.isFinite(Number(uiState.redOptQty))
            ? Math.max(0, Math.floor(Number(uiState.redOptQty)))
            : (Number.isFinite(vRedOptQtyLegacyPct)
                ? Math.max(0, Math.round(vManualFutQty * vRedOptQtyLegacyPct / 100))
                : 1);
        setFieldValue(ids.redOptQty, vRedOptQty);
        setFieldValue(ids.reRedDelta, uiState.reRedDelta);
        const vRedTpLegacy = Number(uiState.redTpDelta ?? uiState.deltaTp1 ?? 0);
        const vRedSlLegacy = Number(uiState.redSlDelta ?? uiState.deltaSl1 ?? 0);
        const vRedTpPct = normalizeConfiguredDelta(uiState.redTpPct ?? vRedTpLegacy, 0.50);
        const vRedSlPct = normalizeConfiguredDelta(uiState.redSlPct ?? vRedSlLegacy, 0.90);
        setFieldValue(ids.redTpPct, vRedTpPct);
        setFieldValue(ids.redSlPct, vRedSlPct);
        const vGreenOptQtyLegacyPct = Number(uiState.greenOptQtyPct ?? 0);
        const vGreenOptQty = Number.isFinite(Number(uiState.greenOptQty))
            ? Math.max(0, Math.floor(Number(uiState.greenOptQty)))
            : (Number.isFinite(vGreenOptQtyLegacyPct)
                ? Math.max(0, Math.round(vManualFutQty * vGreenOptQtyLegacyPct / 100))
                : 1);
        setFieldValue(ids.greenOptQty, vGreenOptQty);
        setFieldValue(ids.greenReDelta, uiState.greenReDelta);
        const vGreenTpLegacy = Number(uiState.greenTpDelta ?? uiState.deltaTp1 ?? 0);
        const vGreenSlLegacy = Number(uiState.greenSlDelta ?? uiState.deltaSl1 ?? 0);
        const vGreenTpPct = normalizeConfiguredDelta(uiState.greenTpPct ?? vGreenTpLegacy, 0.50);
        const vGreenSlPct = normalizeConfiguredDelta(uiState.greenSlPct ?? vGreenSlLegacy, 0.90);
        setFieldValue(ids.greenTpPct, vGreenTpPct);
        setFieldValue(ids.greenSlPct, vGreenSlPct);
        setFieldValue(ids.trailGreenTp1Enabled, uiState.trailGreenTp1Enabled ?? true);
        setFieldValue(ids.trailGreenSl1Enabled, uiState.trailGreenSl1Enabled ?? true);
        setFieldValue(ids.trailRedTp1Enabled, uiState.trailRedTp1Enabled ?? true);
        setFieldValue(ids.trailRedSl1Enabled, uiState.trailRedSl1Enabled ?? true);
        setFieldValue(ids.greenOptQty2, uiState.greenOptQty2 ?? 1);
        setFieldValue(ids.greenReDelta2, uiState.greenReDelta2 ?? 0.53);
        setFieldValue(ids.greenTpPct2, normalizeConfiguredDelta(uiState.greenTpPct2, 0.50));
        setFieldValue(ids.greenSlPct2, normalizeConfiguredDelta(uiState.greenSlPct2, 0.90));
        setFieldValue(ids.trailGreenTp2Enabled, uiState.trailGreenTp2Enabled ?? true);
        setFieldValue(ids.trailGreenSl2Enabled, uiState.trailGreenSl2Enabled ?? true);
        setFieldValue(ids.redOptQty2, uiState.redOptQty2 ?? 1);
        setFieldValue(ids.redReDelta2, uiState.redReDelta2 ?? 0.53);
        setFieldValue(ids.redTpPct2, normalizeConfiguredDelta(uiState.redTpPct2, 0.50));
        setFieldValue(ids.redSlPct2, normalizeConfiguredDelta(uiState.redSlPct2, 0.90));
        setFieldValue(ids.trailRedTp2Enabled, uiState.trailRedTp2Enabled ?? true);
        setFieldValue(ids.trailRedSl2Enabled, uiState.trailRedSl2Enabled ?? true);
        setFieldValue(ids.negativePnlHedgeEnabled, uiState.negativePnlHedgeEnabled ?? true);
        setFieldValue(ids.negativePnlPlaceOrders, uiState.negativePnlPlaceOrders ?? false);
        setFieldValue(ids.negativePnlAction3, uiState.negativePnlAction3 ?? "buy");
        setFieldValue(ids.negativePnlHedgeQty, uiState.negativePnlHedgeQty ?? 10);
        setFieldValue(ids.negativePnlMaxLegs, uiState.negativePnlMaxLegs ?? 1);
        setFieldValue(ids.negativePnlHedgeExpiryMode, uiState.negativePnlHedgeExpiryMode ?? "1");
        setFieldValue(ids.negativePnlHedgeDelta, uiState.negativePnlHedgeDelta ?? 0.53);
        setFieldValue(ids.negativePnlTpPct, uiState.negativePnlTpPct ?? 15);
        setFieldValue(ids.negativePnlSlPct, uiState.negativePnlSlPct ?? 85);
        setFieldValue(ids.negativePnlRecoveryTarget, uiState.negativePnlRecoveryTarget ?? 0);
        setFieldValue(ids.negativePnlHedgeEnabled, uiState.positivePnlSupportEnabled ?? false);
        setFieldValue(ids.negativePnlAction3, uiState.positivePnlSupportAction ?? uiState.negativePnlAction3 ?? "buy");
        setFieldValue(ids.negativePnlHedgeQty, uiState.positivePnlSupportQty ?? uiState.negativePnlHedgeQty ?? 10);
        setFieldValue(ids.negativePnlMaxLegs, uiState.positivePnlMaxLegs ?? uiState.negativePnlMaxLegs ?? 1);
        setFieldValue(ids.positivePnlTriggerAmount, uiState.positivePnlTriggerAmount ?? 0);
        setFieldValue(ids.negativePnlHedgeExpiryMode, uiState.positivePnlExpiryMode ?? uiState.negativePnlHedgeExpiryMode ?? "1");
        setFieldValue(ids.negativePnlHedgeDelta, uiState.positivePnlTargetDelta ?? uiState.negativePnlHedgeDelta ?? 0.53);
        setFieldValue(ids.negativePnlTpPct, uiState.positivePnlTpPct ?? uiState.negativePnlTpPct ?? 15);
        setFieldValue(ids.negativePnlSlPct, uiState.positivePnlSlPct ?? uiState.negativePnlSlPct ?? 85);
        setFieldValue(ids.positivePnlTrailSlEnabled, uiState.positivePnlTrailSlEnabled ?? false);
        setFieldValue(ids.closeSupportLegOnSourceClose, uiState.closeSupportLegOnSourceClose ?? false);
        setFieldValue(ids.positivePnlExpiryDate, uiState.positivePnlExpiryDate ?? "");
        setFieldValue(ids.positivePnlExpiryRefreshTime, uiState.positivePnlExpiryRefreshTime ?? "");
        setFieldValue(ids.positivePnlAdverseRenkoCloseEnabled, uiState.positivePnlAdverseRenkoCloseEnabled ?? false);
        setFieldValue(ids.addOneLotFuture, uiState.addOneLotFuture);
        setFieldValue(ids.renkoValue, uiState.renkoFeedPts);
        setFieldValue(ids.renkoManualPrice, Number(uiState.renkoFeedManualPrice) > 0 ? uiState.renkoFeedManualPrice : "");
        gRenkoManualPriceResetToken = Number(uiState.renkoManualPriceResetToken) || 0;
        setFieldValue(ids.renkoTimeframe, uiState.renkoFeedTimeframe ?? "1m");
        setFieldValue(ids.renkoPriceSrc, uiState.renkoFeedPriceSrc ?? "mark_price");
        setFieldValue(ids.renkoFeedEnabled, uiState.renkoFeedEnabled ?? true);
        setFieldValue(ids.boxConditionPoints, uiState.boxConditionPoints ?? 10);
        setFieldValue(ids.boxConditionEnabled, uiState.boxConditionEnabled ?? false);
        setFieldValue(ids.boxConditionMovingPrice, Number(uiState.boxConditionMovingPrice) > 0 ? uiState.boxConditionMovingPrice : "");
        setFieldValue(ids.targetOpenPnl, uiState.targetOpenPnl ?? 0);
        setFieldValue(ids.closeAllLegsOnAnyClose, uiState.closeAllLegsOnAnyClose ?? false);
        setFieldValue(ids.skipRenkoEntryNoOpenOptions, uiState.skipRenkoEntryNoOpenOptions ?? false);
        setFieldValue(ids.closedFromDate, uiState.closedFromDate);
        setFieldValue(ids.closedToDate, uiState.closedToDate);
        const arrSelectedTelegramTypes = Array.isArray(uiState.telegramAlertTypes)
            ? uiState.telegramAlertTypes.map(function (vType) { return String(vType || "").trim(); })
            : [];
        ids.telegramEventCheckboxes.forEach(function (objCheckbox) {
            objCheckbox.checked = arrSelectedTelegramTypes.includes(String(objCheckbox.value || "").trim());
        });

        applySymbolDefaults();
        applyExpiryModeDefaults(false, ids.optionExpiryMode, ids.optionExpiryDate);
        applyExpiryModeDefaults(false, ids.optionExpiryMode2, ids.optionExpiryDate2);
        gIsApplyingState = false;
    }

    async function saveLiveProfileNow(payload) {
        const vProfileIdSource = payload && Object.prototype.hasOwnProperty.call(payload, "selectedApiProfileId")
            ? payload.selectedApiProfileId
            : ids.apiProfile?.value;
        const vProfileId = String(vProfileIdSource || "").trim();
        gSelectedApiProfileId = vProfileId;
        await postJson("/api/rollingoptions-strangle-live/profile", {
            selectedApiProfileId: vProfileId,
            uiState: (payload && payload.uiState) || getUiState()
        });
    }

    function enqueueProfileSave(payload) {
        const nextPayload = payload || {};
        gProfileSavePromise = gProfileSavePromise.then(function () {
            return saveLiveProfileNow(nextPayload);
        });
        return gProfileSavePromise;
    }

    async function flushProfileSave() {
        if (gIsApplyingState) {
            return;
        }
        if (gSaveTimer) {
            clearTimeout(gSaveTimer);
            gSaveTimer = null;
        }
        await enqueueProfileSave({ uiState: getUiState() });
    }

    async function updateRuleSettings(colorCode, ruleSet) {
        const vColor = String(colorCode || "").trim().toUpperCase() === "G" ? "G" : "R";
        const vRuleSet = Number(ruleSet) === 2 ? 2 : 1;
        await flushProfileSave();
        const objResult = await postJson("/api/rollingoptions-strangle-live/rules/update", {
            color: vColor,
            ruleSet: vRuleSet
        });
        const arrTracked = Array.isArray(objResult?.data?.trackedOpenPositions) ? objResult.data.trackedOpenPositions : null;
        if (arrTracked) {
            renderOpenPositions(arrTracked);
        }
        return objResult;
    }

    function queueProfileSave() {
        if (gIsApplyingState) {
            return;
        }

        if (gSaveTimer) {
            clearTimeout(gSaveTimer);
        }

        gSaveTimer = setTimeout(function () {
            gSaveTimer = null;
            void enqueueProfileSave({ uiState: getUiState() }).catch(function (_objError) {
            });
        }, 400);
    }

    async function getJson(url) {
        const objResponse = await fetch(url, { credentials: "same-origin" });
        const objResult = await objResponse.json().catch(function () { return {}; });
        if (!objResponse.ok) {
            throw new Error(String(objResult?.message || "Request failed."));
        }
        return objResult;
    }

    async function postJson(url, payload) {
        const objResponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload || {})
        });
        const objResult = await objResponse.json().catch(function () { return {}; });
        if (!objResponse.ok) {
            throw new Error(String(objResult?.message || "Request failed."));
        }
        return objResult;
    }

    function canUseLiveActions() {
        return gConnectionState === "connected";
    }

    function setButtonsEnabled() {
        if (ids.autoTraderButton instanceof HTMLButtonElement) {
            ids.autoTraderButton.disabled = !gSelectedApiProfileId || gConnectionState !== "connected";
        }
        [
            ids.placeFutureButton,
            ids.openOptionButton,
            ids.exitOptionButton,
            ids.openPositivePnlButton,
            ids.importButton,
            ids.refreshOpenPositionsButton,
            ids.refreshClosedPositionsButton
        ].forEach(function (objButton) {
            if (!(objButton instanceof HTMLButtonElement)) {
                return;
            }
            objButton.disabled = !canUseLiveActions();
        });

        [
            ids.execStrategyButton
        ].forEach(function (objButton) {
            if (!(objButton instanceof HTMLButtonElement)) {
                return;
            }
            objButton.disabled = !canUseLiveActions() || !gAutoTraderEnabled;
        });

        if (ids.killSwitchButton instanceof HTMLButtonElement) {
            ids.killSwitchButton.disabled = !gSelectedApiProfileId;
        }

        if (ids.copyWhitelistIpButton instanceof HTMLButtonElement) {
            const vIp = String(ids.whitelistIpValue?.textContent || "").trim();
            ids.copyWhitelistIpButton.disabled = !vIp || vIp === "-";
        }
    }

    function applyConnectionStatus(connectionStatus) {
        const objStatus = connectionStatus || {};
        gConnectionState = String(objStatus.state || "not_selected").trim() || "not_selected";

        if (ids.connectionStateValue) {
            ids.connectionStateValue.textContent = gConnectionState.replaceAll("_", " ").toUpperCase();
        }
        if (ids.lastCheckedValue) {
            ids.lastCheckedValue.textContent = formatDateTime(objStatus.lastCheckedAt);
        }
        if (ids.whitelistIpValue) {
            ids.whitelistIpValue.textContent = String(objStatus.outboundIp || "-");
        }

        const vTone = gConnectionState === "connected"
            ? "success"
            : (gConnectionState === "not_selected" || gConnectionState === "checking"
                ? "warning"
                : "danger");
        setStatus(ids.connectionStatus, objStatus.message || "", vTone);
        setButtonsEnabled();
    }

    function applyRuntimeStatus(runtime) {
        const objRuntime = runtime || {};
        gLatestRuntimeState = objRuntime;
        gRuntimeStatus = String(objRuntime.status || "idle").trim() || "idle";
        gAutoTraderEnabled = Boolean(objRuntime.autoTraderEnabled);
        const vRenkoRaw = String(objRuntime?.state?.renkoLastColor || "").trim().toUpperCase();
        const vRenkoColor = vRenkoRaw === "G" ? "G" : (vRenkoRaw === "R" ? "R" : "");

        if (ids.engineStatus) {
            ids.engineStatus.textContent = gRuntimeStatus.charAt(0).toUpperCase() + gRuntimeStatus.slice(1);
        }
        if (ids.renkoBoxButton instanceof HTMLButtonElement) {
            ids.renkoBoxButton.textContent = vRenkoColor || "-";
            ids.renkoBoxButton.classList.remove("idle", "green", "red", "renko-red", "renko-green");
            ids.renkoBoxButton.classList.add(
                vRenkoColor === "G" ? "green" : (vRenkoColor === "R" ? "red" : "idle")
            );
            ids.renkoBoxButton.title = vRenkoColor
                ? `Current Renko signal: ${vRenkoColor === "G" ? "Green" : "Red"}. Click to toggle.`
                : "Current Renko signal. Click to toggle.";
        }
        if (ids.renkoFeedStatus) {
            const bFeedEnabled = Boolean(ids.renkoFeedEnabled?.checked);
            ids.renkoFeedStatus.textContent = bFeedEnabled ? "ON" : "OFF";
            ids.renkoFeedStatus.className = `rolling-demo-badge ${bFeedEnabled ? "success" : "secondary"}`;
        }
        if (ids.renkoFromPrice) {
            const vFromPriceRaw = objRuntime?.state?.renkoCalculationPrice;
            const vFromPrice = Number(vFromPriceRaw);
            ids.renkoFromPrice.textContent = `From: ${
                vFromPriceRaw !== null && vFromPriceRaw !== undefined && Number.isFinite(vFromPrice)
                    ? fmt(vFromPrice, 2)
                    : "--"
            }`;
        }
        if (ids.renkoAnchor) {
            const vAnchor = Number(objRuntime?.state?.renkoAnchor);
            ids.renkoAnchor.textContent = `Anchor: ${Number.isFinite(vAnchor) ? fmt(vAnchor, 2) : "--"}`;
        }
        const bBoxEnabled = Boolean(objRuntime?.state?.boxConditionEnabled ?? ids.boxConditionEnabled?.checked);
        const vBoxRaw = bBoxEnabled ? String(objRuntime?.state?.boxLastColor || "").trim().toUpperCase() : "";
        const vBoxFromRaw = objRuntime?.state?.boxCalculationPrice;
        const vBoxLowerRaw = objRuntime?.state?.boxLowerAnchor;
        const vBoxUpperRaw = objRuntime?.state?.boxUpperAnchor;
        const vBoxFrom = Number(vBoxFromRaw);
        const vBoxLower = Number(vBoxLowerRaw);
        const vBoxUpper = Number(vBoxUpperRaw);
        const bBoxInside = bBoxEnabled
            && vBoxFromRaw !== null && vBoxFromRaw !== undefined
            && vBoxLowerRaw !== null && vBoxLowerRaw !== undefined
            && vBoxUpperRaw !== null && vBoxUpperRaw !== undefined
            && Number.isFinite(vBoxFrom)
            && Number.isFinite(vBoxLower)
            && Number.isFinite(vBoxUpper)
            && vBoxFrom >= vBoxLower
            && vBoxFrom <= vBoxUpper;
        const vBoxColor = bBoxInside
            ? "N"
            : (vBoxRaw === "G" ? "G" : (vBoxRaw === "R" ? "R" : ""));
        if (ids.boxConditionSignal) {
            ids.boxConditionSignal.textContent = vBoxColor || "-";
            ids.boxConditionSignal.classList.remove("idle", "green", "red");
            ids.boxConditionSignal.classList.add(vBoxColor === "G" ? "green" : (vBoxColor === "R" ? "red" : "idle"));
        }
        const setBoxValue = function (objElement, label, rawValue) {
            if (!objElement) return;
            const vValue = Number(rawValue);
            objElement.textContent = `${label}: ${rawValue !== null && rawValue !== undefined && Number.isFinite(vValue) ? fmt(vValue, 2) : "--"}`;
        };
        setBoxValue(ids.boxConditionFromPrice, "From", objRuntime?.state?.boxCalculationPrice);
        setBoxValue(ids.boxConditionLowerAnchor, "Lower", objRuntime?.state?.boxLowerAnchor);
        setBoxValue(ids.boxConditionUpperAnchor, "Upper", objRuntime?.state?.boxUpperAnchor);
        if (ids.emaIndicator) {
            const vTrend = String(objRuntime?.state?.emaTrend || "FLAT").toUpperCase();
            const bEmaEnabled = Boolean(ids.emaEnabled?.checked);
            const bEmaSignalEnabled = Boolean(objRuntime?.state?.emaSignalEnabled ?? ids.emaSignalEnabled?.checked);
            ids.emaIndicator.textContent = bEmaEnabled
                ? `EMA: ${vTrend}${bEmaSignalEnabled ? " / SIGNAL" : ""}`
                : "EMA: OFF";
        }
        if (ids.openRenkoSignal) {
            ids.openRenkoSignal.textContent = vRenkoColor || "-";
            ids.openRenkoSignal.classList.remove("idle", "green", "red");
            ids.openRenkoSignal.classList.add(
                vRenkoColor === "G" ? "green" : (vRenkoColor === "R" ? "red" : "idle")
            );
            ids.openRenkoSignal.title = vRenkoColor
                ? `Current Renko signal: ${vRenkoColor === "G" ? "Green" : "Red"}`
                : "Current Renko signal";
        }
        if (ids.positivePnlMarketPrice instanceof HTMLInputElement) {
            const vMarketPrice = Number(objRuntime.lastSpotPrice ?? objRuntime.lastFuturesPrice);
            ids.positivePnlMarketPrice.classList.remove("market-up", "market-down");
            if (Number.isFinite(vMarketPrice) && Number.isFinite(gPreviousMarketPrice)) {
                if (vMarketPrice > gPreviousMarketPrice) {
                    ids.positivePnlMarketPrice.classList.add("market-up");
                } else if (vMarketPrice < gPreviousMarketPrice) {
                    ids.positivePnlMarketPrice.classList.add("market-down");
                }
            }
            ids.positivePnlMarketPrice.value = Number.isFinite(vMarketPrice) ? fmt(vMarketPrice, 2) : "-";
            if (Number.isFinite(vMarketPrice)) {
                gPreviousMarketPrice = vMarketPrice;
            }
        }
        if (ids.autoTraderButton instanceof HTMLButtonElement) {
            ids.autoTraderButton.textContent = gAutoTraderEnabled ? "Auto Trader - ON" : "Auto Trader - OFF";
            ids.autoTraderButton.classList.toggle("success", gAutoTraderEnabled);
            ids.autoTraderButton.classList.toggle("warn", !gAutoTraderEnabled);
        }
        setButtonsEnabled();
        renderPayoffGraph(gDisplayedPositions);
    }

    async function loadApiProfiles() {
        const objResult = await getJson("/api/account/delta-api-profiles");
        const arrProfiles = Array.isArray(objResult?.data) ? objResult.data : [];
        if (!ids.apiProfile) {
            return;
        }

        ids.apiProfile.innerHTML = "<option value=\"\">Select API profile</option>" + arrProfiles.map(function (objProfile) {
            return `<option value="${escapeHtml(objProfile.profileId)}">${escapeHtml(objProfile.referenceName || objProfile.apiKey || "API Profile")}</option>`;
        }).join("");

        if (!arrProfiles.length) {
            setStatus(ids.pageStatus, "No Delta API profiles found. Add one in Delta API Settings before using this page.", "warning");
        }
    }

    async function loadLiveProfile() {
        const objResult = await getJson("/api/rollingoptions-strangle-live/profile");
        const objData = objResult?.data || {};
        gSelectedApiProfileId = String(objData.selectedApiProfileId || "").trim();
        if (ids.apiProfile) {
            ids.apiProfile.value = gSelectedApiProfileId;
        }
        applyUiState(objData.uiState || {});
        applyConnectionStatus(objData.connectionStatus || {});
    }

    async function loadConnectionStatus() {
        const objResult = await getJson("/api/rollingoptions-strangle-live/connection/status");
        const objData = objResult?.data || {};
        if (objData.selectedApiProfileId) {
            gSelectedApiProfileId = String(objData.selectedApiProfileId || "").trim();
            if (ids.apiProfile) {
                ids.apiProfile.value = gSelectedApiProfileId;
            }
        }
        applyConnectionStatus(objData.connectionStatus || {});
    }

    async function loadRuntimeStatus() {
        const objResult = await getJson("/api/rollingoptions-strangle-live/runtime");
        applyRuntimeStatus(objResult?.data || {});
    }

    async function checkConnection() {
        const vProfileId = String(ids.apiProfile?.value || "").trim();
        gSelectedApiProfileId = vProfileId;
        const objResult = await postJson("/api/rollingoptions-strangle-live/connection/check", {
            profileId: vProfileId
        });
        const objData = objResult?.data || {};
        applyConnectionStatus(objData.connectionStatus || {});
        if (objData.selectedApiProfileId) {
            gSelectedApiProfileId = String(objData.selectedApiProfileId || "").trim();
        }
        return objResult;
    }

    async function toggleAutoTrader() {
        const vUrl = gAutoTraderEnabled
            ? "/api/rollingoptions-strangle-live/auto-trader/stop"
            : "/api/rollingoptions-strangle-live/auto-trader/start";
        const objResult = await postJson(vUrl, {});
        applyRuntimeStatus(objResult?.data || {});
        return objResult;
    }

    async function kickRenkoCycleIfNeeded() {
        const vRenkoPts = Math.max(0, Math.floor(Number(ids.renkoValue?.value || 0)));
        const shouldKickRenkoCycle = vRenkoPts > 0
            && !Boolean(gAutoTraderEnabled)
            && canUseLiveActions();
        if (!shouldKickRenkoCycle) {
            return null;
        }

        await flushProfileSave();
        const objResult = await postJson("/api/rollingoptions-strangle-live/strategy/cycle", {});
        if (objResult?.data?.runtime) {
            applyRuntimeStatus(objResult.data.runtime);
        }
        return objResult;
    }

    function getCurrentRenkoColor() {
        return String(ids.renkoBoxButton?.textContent || "").trim().toUpperCase() === "G" ? "G" : "R";
    }

    async function executeStrategy() {
        await checkConnection();
        if (!canUseLiveActions()) {
            throw new Error("Delta connection is not healthy enough to execute the live strategy.");
        }

        await flushProfileSave();
        const objResult = await postJson("/api/rollingoptions-strangle-live/strategy/execute", {
            renkoColor: getCurrentRenkoColor()
        });
        if (objResult?.data?.runtime) {
            applyRuntimeStatus(objResult.data.runtime);
        }
        return objResult;
    }

    async function toggleRenkoBox() {
        const vCurrentColor = String(ids.renkoBoxButton?.textContent || "R").trim().toUpperCase() === "G" ? "G" : "R";
        const vNextColor = vCurrentColor === "R" ? "G" : "R";
        const objResult = await postJson("/api/rollingoptions-strangle-live/renko/signal", {
            color: vNextColor
        });
        applyRuntimeStatus(objResult?.data || {});
        return objResult;
    }

    async function copyWhitelistIp() {
        const vIp = String(ids.whitelistIpValue?.textContent || "").trim();
        if (!vIp || vIp === "-") {
            throw new Error("Whitelist IP is not available yet. Run connection check first.");
        }

        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(vIp);
            return vIp;
        }

        const objInput = document.createElement("input");
        objInput.value = vIp;
        document.body.appendChild(objInput);
        objInput.select();
        objInput.setSelectionRange(0, objInput.value.length);
        const bCopied = document.execCommand("copy");
        document.body.removeChild(objInput);
        if (!bCopied) {
            throw new Error("Unable to copy whitelist IP.");
        }

        return vIp;
    }

    async function placeManualFuture(action) {
        const vAction = String(action || "").trim().toUpperCase();
        if (vAction !== "BUY" && vAction !== "SELL") {
            throw new Error("Future action must be BUY or SELL.");
        }

        await checkConnection();
        if (!canUseLiveActions()) {
            throw new Error("Delta connection is not healthy enough to place a live future order.");
        }

        const vQty = Math.max(1, Math.floor(Number(ids.futQty?.value || 1)));
        const vOrderType = String(ids.futureOrderType?.value || "market_order").trim() === "limit_order"
            ? "limit_order"
            : "market_order";
        const vSymbol = String(ids.symbol?.value || "BTC").trim().toUpperCase();

        return postJson("/api/rollingoptions-strangle-live/manual/future", {
            action: vAction,
            symbol: vSymbol,
            qty: vQty,
            orderType: vOrderType
        });
    }

    async function placeManualOption(operation, ruleSet) {
        const vOperation = String(operation || "").trim().toLowerCase() === "exit" ? "exit" : "open";
        const vRuleSet = Number(ruleSet) === 2 ? 2 : 1;
        await checkConnection();
        if (!canUseLiveActions()) {
            throw new Error("Delta connection is not healthy enough to place a live option order.");
        }

        const vAction = String(vRuleSet === 2 ? (ids.optionAction2?.value || "") : (ids.optionAction?.value || "")).trim().toLowerCase();
        const vQty = Math.max(1, Math.floor(Number(vRuleSet === 2 ? (ids.optionQty2?.value || 1) : (ids.optionQty?.value || 1))));
        const vExpiryDate = String(vRuleSet === 2 ? (ids.optionExpiryDate2?.value || "") : (ids.optionExpiryDate?.value || "")).trim();
        const vLegSide = String(vRuleSet === 2 ? (ids.optionLegSide2?.value || "pe") : (ids.optionLegSide?.value || "ce")).trim().toLowerCase();
        const vExpiryMode = String(vRuleSet === 2 ? (ids.optionExpiryMode2?.value || "1") : (ids.optionExpiryMode?.value || "1")).trim();
        const vRenkoColor = getCurrentRenkoColor();
        const vTargetDeltaRaw = vRenkoColor === "G"
            ? Number(vRuleSet === 2 ? (ids.greenReDelta2?.value || 0.53) : (ids.greenReDelta?.value || 0.53))
            : Number(vRuleSet === 2 ? (ids.redReDelta2?.value || 0.53) : (ids.reRedDelta?.value || 0.53));
        const vTargetDelta = Math.max(0, vTargetDeltaRaw);
        const vSymbol = String(ids.symbol?.value || "BTC").trim().toUpperCase();

        if (vAction !== "buy" && vAction !== "sell") {
            throw new Error("Select Buy or Sell in the option row before placing a live option order.");
        }
        if (!vExpiryDate) {
            throw new Error("Select an expiry date in the option row before placing a live option order.");
        }

        return postJson("/api/rollingoptions-strangle-live/manual/option", {
            operation: vOperation,
            action: vAction,
            symbol: vSymbol,
            legSide: vLegSide,
            expiryMode: vExpiryMode,
            expiryDate: vExpiryDate,
            qty: vQty,
            targetDelta: vTargetDelta,
            ruleSet: vRuleSet
        });
    }

    async function closeImportedOpenPosition(row) {
        const objRow = row || {};
        const vImportId = String(objRow.importId || "").trim();
        const vContractName = String(objRow.contractName || "").trim();
        const vSide = String(objRow.side || "").trim().toUpperCase();
        const vQty = Math.max(1, Math.floor(Number(objRow.qty || 0)));
        if (!vImportId || !vContractName || !vSide || !(vQty > 0)) {
            throw new Error("Imported live position details are incomplete.");
        }

        await checkConnection();
        if (!canUseLiveActions()) {
            throw new Error("Delta connection is not healthy enough to close this live position.");
        }

        return postJson("/api/rollingoptions-strangle-live/open-positions/close", {
            importId: vImportId,
            contractName: vContractName,
            side: vSide,
            qty: vQty
        });
    }

    function startConnectionPolling() {
        if (gConnectionPollTimer) {
            clearInterval(gConnectionPollTimer);
        }

        gConnectionPollTimer = setInterval(function () {
            if (!gSelectedApiProfileId) {
                return;
            }
            void Promise.all([
                loadConnectionStatus(),
                loadRuntimeStatus()
            ]).then(function () {
                if (!gAutoTraderEnabled) {
                    return Promise.all([
                        loadAccountSummary().catch(function () { return undefined; }),
                        kickRenkoCycleIfNeeded().catch(function () { return undefined; }),
                        reconcileOpenPositionsSilently().catch(function () { return undefined; }),
                        loadClosedPositions(true).catch(function () { return undefined; })
                    ]);
                }
                return Promise.all([
                    reconcileOpenPositionsSilently().catch(function () { return undefined; }),
                    loadAccountSummary().catch(function () { return undefined; }),
                    loadEvents().catch(function () { return undefined; }),
                    loadClosedPositions(true).catch(function () { return undefined; })
                ]);
            }).catch(function (objError) {
                setStatus(ids.connectionStatus, objError instanceof Error ? objError.message : "Unable to load Delta connection status.", "danger");
            });
        }, 30000);
    }

    async function loadAccountSummary(symbolOverride) {
        if (!canUseLiveActions()) {
            if (ids.totalMarginValue) {
                ids.totalMarginValue.textContent = "-";
            }
            if (ids.blockedMarginValue) {
                ids.blockedMarginValue.textContent = "-";
            }
            if (ids.availableBalanceValue) {
                ids.availableBalanceValue.textContent = "-";
            }
            if (ids.healthValue) {
                ids.healthValue.textContent = "-";
                ids.healthValue.style.color = "";
            }
            if (ids.oneLotValue) {
                ids.oneLotValue.textContent = "-";
            }
            if (ids.profileLabel) {
                ids.profileLabel.textContent = "-";
            }
            return;
        }

        const vSymbol = String(symbolOverride || ids.symbol?.value || "").trim().toUpperCase();
        const objSearch = new URLSearchParams();
        if (vSymbol) {
            objSearch.set("symbol", vSymbol);
        }
        const objResult = await getJson(`/api/rollingoptions-strangle-live/account-summary${objSearch.toString() ? `?${objSearch.toString()}` : ""}`);
        const objData = objResult?.data || {};

        if (ids.totalMarginValue) {
            const vTotalMargin = Number(objData.selectedFuturePositionValue);
            ids.totalMarginValue.textContent = Number.isFinite(vTotalMargin) && vTotalMargin > 0
                ? fmtUsd(vTotalMargin)
                : "-";
        }
        if (ids.blockedMarginValue) {
            ids.blockedMarginValue.textContent = fmtUsd(objData.blockedMargin);
        }
        if (ids.availableBalanceValue) {
            ids.availableBalanceValue.textContent = fmtUsd(objData.availableBalance);
        }
        if (ids.oneLotValue) {
            ids.oneLotValue.textContent = Number.isFinite(Number(objData.oneLotValue))
                ? fmtUsd(objData.oneLotValue)
                : "-";
        }
        if (ids.healthValue) {
            const vHealthPct = Number(objData.healthPct);
            ids.healthValue.textContent = Number.isFinite(vHealthPct)
                ? `${fmt(objData.healthPct, 2)}%`
                : "-";
            if (Number.isFinite(vHealthPct)) {
                ids.healthValue.style.color = vHealthPct <= 100
                    ? "#198754"
                    : (vHealthPct <= 150 ? "#fd7e14" : "#dc3545");
            }
            else {
                ids.healthValue.style.color = "";
            }
        }
        if (ids.profileLabel) {
            ids.profileLabel.textContent = String(objData.profileName || "-");
        }
    }

    function renderOpenPositions(rows) {
        const arrRows = Array.isArray(rows) ? rows : [];
        gDisplayedPositions = arrRows;

        if (!ids.openPositionsBody) {
            return;
        }

        if (!arrRows.length) {
            gPreviousOpenPositionLtps = new Map();
            ids.openPositionsBody.innerHTML = "<tr><td colspan=\"16\" class=\"rolling-demo-empty\">No imported live positions are currently shown.</td></tr>";
            if (ids.openCount) {
                ids.openCount.textContent = "0";
            }
            if (ids.openPnlValue) {
                ids.openPnlValue.textContent = "0.000";
            }
            renderPayoffGraph([]);
            return;
        }

        const nextLtps = new Map();
        const arrDisplayRows = withNegativePnlOptionLegPreviews(arrRows);
        const arrAdjustmentRows = arrDisplayRows.filter(isSuggestedNegativePnlLeg);
        const openRowsHtml = arrDisplayRows.map(function (row) {
            const bPreviewLeg = isSuggestedNegativePnlLeg(row);
            const vSide = String(row.side || "-").trim().toUpperCase();
            const vContractName = String(bPreviewLeg ? (row.metadata?.displayContractName || row.contractName || "-") : (row.contractName || "-"));
            const vLotSize = getLotSizeForContract(vContractName);
            const vImportId = String(row.importId || vContractName || "");
            const vEntryDelta = Number.isFinite(Number(row.entryDelta)) ? fmt(row.entryDelta, 2) : "-";
            const vCurrentDelta = Number.isFinite(Number(row.currentDelta)) ? fmt(row.currentDelta, 2) : "-";
            const objMeta = row && typeof row === "object" ? (row.metadata || {}) : {};
            const vTpDeltaRaw = Number(objMeta.takeProfitDelta ?? objMeta.deltaTakeProfit);
            const vSlDeltaRaw = Number(objMeta.stopLossDelta ?? objMeta.deltaStopLoss);
            const vTpDelta = Number.isFinite(vTpDeltaRaw) && vTpDeltaRaw > 0 ? fmt(vTpDeltaRaw, 2) : "-";
            const vSlDelta = Number.isFinite(vSlDeltaRaw) && vSlDeltaRaw > 0 ? fmt(vSlDeltaRaw, 2) : "-";
            const vCharges = estimateOpenPositionCharges(row);
            const vPnl = Number.isFinite(Number(row?.pnl)) ? Number(row.pnl) : calculateOpenPositionPnl(row);
            const vLtpBlinkClass = getLtpBlinkClass(vImportId, row.markPrice);
            const vCurrentLtp = Number(row.markPrice);
            if (!bPreviewLeg && vImportId && Number.isFinite(vCurrentLtp)) {
                nextLtps.set(vImportId, vCurrentLtp);
            }
            return `
                <tr${bPreviewLeg ? " class=\"rolling-demo-suggested-leg-row\"" : ""}>
                    <td>${escapeHtml(vEntryDelta)}</td>
                    <td>${escapeHtml(vCurrentDelta)}</td>
                    <td>${escapeHtml(vTpDelta)}</td>
                    <td>${escapeHtml(vSlDelta)}</td>
                    <td>${escapeHtml(vContractName)}</td>
                    <td>${escapeHtml(vSide || "-")}</td>
                    <td>${escapeHtml(fmt(vLotSize, 3))}</td>
                    <td>${escapeHtml(fmt(row.qty, 0))}</td>
                    <td>${escapeHtml(vSide === "BUY" ? fmt(row.entryPrice, 2) : "-")}</td>
                    <td>${escapeHtml(vSide === "SELL" ? fmt(row.entryPrice, 2) : "-")}</td>
                    <td class="${vLtpBlinkClass}">${escapeHtml(fmt(row.markPrice, 2))}</td>
                    <td>${escapeHtml(fmt(vCharges, 3))}</td>
                    <td>${escapeHtml(fmt(vPnl, 2))}</td>
                    <td>${escapeHtml(formatDateTime(row.openedAt))}</td>
                    <td>${bPreviewLeg ? escapeHtml(`ADJUSTMENT ${row.expiryDate || ""}`.trim()) : "OPEN"}</td>
                    <td>
                        ${bPreviewLeg ? `<span class="rolling-demo-suggested-leg-note">${ids.negativePnlPlaceOrders?.checked ? "Placing" : "Live adj"} ${escapeHtml(row.metadata?.manualHedgeQty || row.qty)}</span>` : `
                        <button class="rolling-demo-icon-btn primary rolling-strangle-live-close-open-position" type="button" data-import-id="${escapeHtml(vImportId)}" title="Close this open position" aria-label="Close this open position">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m6 6 12 12" />
                                <path d="M18 6 6 18" />
                            </svg>
                        </button>
                        <button class="rolling-demo-icon-btn warn rolling-strangle-live-delete-open-position" type="button" data-import-id="${escapeHtml(vImportId)}" title="Delete this open position permanently" aria-label="Delete this open position permanently">
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
        const totalCharges = arrRows.reduce(function (sum, row) {
            return sum + estimateOpenPositionCharges(row);
        }, 0);
        const totalPnl = arrRows.reduce(function (sum, row) {
            return sum + (Number.isFinite(Number(row?.pnl)) ? Number(row.pnl) : calculateOpenPositionPnl(row));
        }, 0);
        ids.openPositionsBody.innerHTML = `${openRowsHtml}
            <tr class="rolling-demo-total-row">
                <td colspan="11">Total</td>
                <td class="rolling-demo-total-value">${escapeHtml(fmt(totalCharges, 3))}</td>
                <td class="rolling-demo-total-value">${escapeHtml(fmt(totalPnl, 3))}</td>
                <td colspan="3">-</td>
            </tr>
        `;
        gPreviousOpenPositionLtps = nextLtps;

        if (ids.openCount) {
            ids.openCount.textContent = String(arrRows.length);
        }
        if (ids.openPnlValue) {
            ids.openPnlValue.textContent = fmt(totalPnl, 3);
        }
        renderPayoffGraph(arrDisplayRows);
    }

    function renderPayoffGraph(rows) {
        if (!ids.payoffGraph || !window.OptionyzePayoffGraph) {
            return;
        }

        const arrRows = (Array.isArray(rows) ? rows : []).map(function (row) {
            return {
                ...row,
                charges: estimateOpenPositionCharges(row),
                expiryDate: String(row?.expiryDate || row?.metadata?.resolvedExpiryDate || row?.metadata?.requestedExpiryDate || ""),
                instrumentType: isOptionContract(row?.contractName) ? "OPTION" : "FUTURE",
                action: String(row?.side || row?.action || "").trim().toUpperCase() || "BUY"
            };
        });

        window.OptionyzePayoffGraph.render(ids.payoffGraph, arrRows, {
            variant: "delta",
            title: "Open Position Payoff",
            subtitle: "Delta-style projected payoff view with time decay across the imported live option and future legs.",
            currentPriceLabel: "Spot",
            referencePrice: Number(gLatestRuntimeState?.lastSpotPrice ?? gLatestRuntimeState?.lastFuturesPrice ?? NaN),
            customSpotPrice: gPayoffCustomSpotPrice,
            slCheckpoints: gPayoffSlCheckpoints,
            selectedSlLegKey: gPayoffSlSelectedLegKey,
            projectionDays: gPayoffProjectionDays,
            onSlCheckpointChange: function (checkpoints) {
                gPayoffSlCheckpoints = normalizePayoffSlCheckpoints(checkpoints);
                queueProfileSave();
                renderPayoffGraph(gDisplayedPositions);
            },
            onSlSelectedLegChange: function (legKey) {
                gPayoffSlSelectedLegKey = normalizePayoffSlSelectedLegKey(legKey);
                queueProfileSave();
                renderPayoffGraph(gDisplayedPositions);
            },
            onProjectionDaysChange: function (days) {
                gPayoffProjectionDays = normalizePayoffProjectionDays(days);
                queueProfileSave();
                renderPayoffGraph(gDisplayedPositions);
            },
            onCustomSpotPriceChange: function (spotPrice) {
                gPayoffCustomSpotPrice = normalizePayoffCustomSpotPrice(spotPrice);
                queueProfileSave();
                renderPayoffGraph(gDisplayedPositions);
            },
            emptyMessage: "Payoff graph appears when open legs are available."
        });
    }

    function renderClosedPositions(rows) {
        const arrRows = Array.isArray(rows) ? rows : [];
        const vTotalRows = arrRows.length;
        const vTotalPages = Math.max(1, Math.ceil(vTotalRows / gClosedPositionsPageSize));
        gClosedPositionsPage = Math.min(Math.max(1, gClosedPositionsPage), vTotalPages);
        const vStartIndex = (gClosedPositionsPage - 1) * gClosedPositionsPageSize;
        const arrPageRows = arrRows.slice(vStartIndex, vStartIndex + gClosedPositionsPageSize);
        if (!ids.closedPositionsBody) {
            return;
        }

        if (!arrRows.length) {
            ids.closedPositionsBody.innerHTML = "<tr><td colspan=\"12\" class=\"rolling-demo-empty\">No Delta order history found for the selected date range.</td></tr>";
            if (ids.optionsPnlValue) {
                ids.optionsPnlValue.textContent = "-";
            }
            if (ids.totalChargesValue) {
                ids.totalChargesValue.textContent = "-";
            }
            if (ids.totalPnlValue) {
                ids.totalPnlValue.textContent = "-";
            }
            if (ids.closedPageInfo) {
                ids.closedPageInfo.textContent = "Page 0 of 0";
            }
            if (ids.closedPrevPageButton instanceof HTMLButtonElement) {
                ids.closedPrevPageButton.disabled = true;
            }
            if (ids.closedNextPageButton instanceof HTMLButtonElement) {
                ids.closedNextPageButton.disabled = true;
            }
            if (ids.closedPageNumbers) {
                ids.closedPageNumbers.innerHTML = "";
            }
            return;
        }

        const closedRowsHtml = arrPageRows.map(function (row) {
            const vContractName = String(row.symbol || "-");
            const vEntryDelta = Number(row && row.entryDelta);
            const vCurrentDelta = Number(row && row.currentDelta);
            return `
                <tr>
                    <td>${escapeHtml(formatDateTime(row.startAt))}</td>
                    <td>${escapeHtml(formatDateTime(row.endAt))}</td>
                    <td>${escapeHtml(Number.isFinite(vEntryDelta) ? fmt(vEntryDelta, 2) : "-")}</td>
                    <td>${escapeHtml(Number.isFinite(vCurrentDelta) ? fmt(vCurrentDelta, 2) : "-")}</td>
                    <td>${escapeHtml(vContractName)}</td>
                    <td>${escapeHtml(row.side || row.orderType || "-")}</td>
                    <td>${escapeHtml(fmt(getLotSizeForContract(vContractName), 3))}</td>
                    <td>${escapeHtml(fmt(row.qty, 0))}</td>
                    <td>${escapeHtml(row.buyPrice === null ? "-" : fmt(row.buyPrice, 2))}</td>
                    <td>${escapeHtml(row.sellPrice === null ? "-" : fmt(row.sellPrice, 2))}</td>
                    <td>${escapeHtml(fmt(row.charges, 3))}</td>
                    <td>${escapeHtml(row.pnl === null ? "-" : fmt(row.pnl, 3))}</td>
                </tr>
            `;
        }).join("");
        const totalCharges = sumNumeric(arrRows, "charges");
        const totalPnl = arrRows.some(function (row) { return Number.isFinite(Number(row && row.pnl)); })
            ? sumNumeric(arrRows, "pnl")
            : null;
        const totalOptionPnl = arrRows.reduce(function (sum, row) {
            const contractName = String(row && row.symbol || "").trim();
            if (!isOptionContract(contractName)) {
                return sum;
            }
            const value = Number(row && row.pnl);
            return Number.isFinite(value) ? sum + value : sum;
        }, 0);
        if (ids.optionsPnlValue) {
            ids.optionsPnlValue.textContent = fmt(totalOptionPnl, 3);
        }
        if (ids.totalChargesValue) {
            ids.totalChargesValue.textContent = fmt(totalCharges, 3);
        }
        if (ids.totalPnlValue) {
            const vNetPnl = (totalPnl === null ? 0 : totalPnl) - totalCharges;
            ids.totalPnlValue.textContent = fmt(vNetPnl, 3);
        }
        ids.closedPositionsBody.innerHTML = `${closedRowsHtml}
            <tr class="rolling-demo-total-row">
                <td colspan="10">Total</td>
                <td class="rolling-demo-total-value">${escapeHtml(fmt(totalCharges, 3))}</td>
                <td class="rolling-demo-total-value">${escapeHtml(totalPnl === null ? "-" : fmt(totalPnl, 3))}</td>
            </tr>
        `;
        if (ids.closedPageInfo) {
            ids.closedPageInfo.textContent = `Page ${gClosedPositionsPage} of ${vTotalPages} | ${vTotalRows} records`;
        }
        if (ids.closedPrevPageButton instanceof HTMLButtonElement) {
            ids.closedPrevPageButton.disabled = gClosedPositionsPage <= 1;
        }
        if (ids.closedNextPageButton instanceof HTMLButtonElement) {
            ids.closedNextPageButton.disabled = gClosedPositionsPage >= vTotalPages;
        }
        if (ids.closedPageNumbers) {
            const vStartPage = Math.max(1, gClosedPositionsPage - 2);
            const vEndPage = Math.min(vTotalPages, vStartPage + 4);
            const vNormalizedStartPage = Math.max(1, vEndPage - 4);
            let vHtml = "";
            for (let vPage = vNormalizedStartPage; vPage <= vEndPage; vPage += 1) {
                vHtml += `<button class="rolling-demo-icon-btn ${vPage === gClosedPositionsPage ? "primary" : "warn"} rolling-strangle-live-closed-page-btn" type="button" data-page="${vPage}" title="Go to closed-positions page ${vPage}" aria-label="Go to closed-positions page ${vPage}">${escapeHtml(String(vPage))}</button>`;
            }
            ids.closedPageNumbers.innerHTML = vHtml;
        }
    }

    function renderEvents(rows) {
        if (!ids.eventLog) {
            return;
        }

        gLatestEvents = Array.isArray(rows) ? rows : [];
        const arrRows = getVisibleEvents(gLatestEvents);
        if (!arrRows.length) {
            ids.eventLog.innerHTML = "<div class=\"rolling-demo-event-empty\">No live activity has been logged yet.</div>";
            return;
        }

        ids.eventLog.innerHTML = arrRows.map(function (row) {
            const vSeverity = String(row.severity || "info").trim();
            return `
                <div class="rolling-demo-event-item ${escapeHtml(vSeverity)}">
                    <div class="rolling-demo-event-head">
                        <div class="rolling-demo-event-title">${escapeHtml(row.title || row.eventType || "Event")}</div>
                        <div class="rolling-demo-event-time">${escapeHtml(formatDateTime(row.createdAt))}</div>
                    </div>
                    <div class="rolling-demo-event-message">${escapeHtml(row.message || "")}</div>
                </div>
            `;
        }).join("");
    }

    function openImportModal() {
        ids.importOverlay?.classList.add("show");
        ids.importModal?.classList.add("show");
    }

    function closeImportModal() {
        ids.importOverlay?.classList.remove("show");
        ids.importModal?.classList.remove("show");
    }

    function renderImportablePositions(rows) {
        const arrRows = Array.isArray(rows) ? rows : [];
        gImportablePositions = arrRows;

        if (!ids.importList) {
            return;
        }

        if (!arrRows.length) {
            ids.importList.innerHTML = "<div class=\"rolling-demo-event-empty\">No open live positions were returned for the selected API profile.</div>";
            return;
        }

        ids.importList.innerHTML = arrRows.map(function (row, index) {
            return `
                <label class="rolling-strangle-live-import-item" for="rolling-strangle-live-import-${index}">
                    <input type="checkbox" id="rolling-strangle-live-import-${index}" value="${escapeHtml(row.importId)}" />
                    <div>
                        <div class="rolling-strangle-live-import-head">
                            <div class="rolling-strangle-live-import-title">${escapeHtml(row.contractName || "-")}</div>
                            <div>${escapeHtml(row.side || "-")}</div>
                        </div>
                        <div class="rolling-strangle-live-import-metrics">
                            <div>Qty: <strong>${escapeHtml(fmt(row.qty, 0))}</strong></div>
                            <div>Entry: <strong>${escapeHtml(fmt(row.entryPrice, 2))}</strong></div>
                            <div>Mark: <strong>${escapeHtml(fmt(row.markPrice, 2))}</strong></div>
                            <div>Margin: <strong>${escapeHtml(fmtUsd(row.margin))}</strong></div>
                            <div>PnL: <strong>${escapeHtml(fmtUsd(row.pnl))}</strong></div>
                            <div>Liq: <strong>${escapeHtml(fmt(row.liquidationPrice, 2))}</strong></div>
                        </div>
                    </div>
                </label>
            `;
        }).join("");
    }

    async function loadImportablePositions() {
        if (!canUseLiveActions()) {
            setStatus(ids.importStatus, "Delta connection is not healthy. Fix the API connection before loading live positions.", "warning");
            openImportModal();
            renderImportablePositions([]);
            return;
        }

        openImportModal();
        setStatus(ids.importStatus, "Loading open positions from Delta Exchange...", "");
        const objResult = await getJson("/api/rollingoptions-strangle-live/open-positions/importable");
        const arrPositions = Array.isArray(objResult?.data?.positions) ? objResult.data.positions : [];
        renderImportablePositions(arrPositions);
        setStatus(ids.importStatus, `Loaded ${arrPositions.length} open position${arrPositions.length === 1 ? "" : "s"} from Delta Exchange.`, "success");
    }

    async function refreshImportablePositionsSilently() {
        if (!canUseLiveActions()) {
            gImportablePositions = [];
            return [];
        }

        const objResult = await getJson("/api/rollingoptions-strangle-live/open-positions/importable");
        const arrPositions = Array.isArray(objResult?.data?.positions) ? objResult.data.positions : [];
        gImportablePositions = arrPositions;
        return arrPositions;
    }

    async function loadSavedOpenPositions() {
        const objResult = await getJson("/api/rollingoptions-strangle-live/open-positions");
        const arrPositions = Array.isArray(objResult?.data) ? objResult.data : [];
        renderOpenPositions(arrPositions);
        return arrPositions;
    }

    async function reconcileOpenPositionsSilently() {
        if (!canUseLiveActions()) {
            return [];
        }
        const objResult = await reconcileOpenPositions();
        const arrPositions = Array.isArray(objResult?.data) ? objResult.data : [];
        renderOpenPositions(arrPositions);
        return arrPositions;
    }

    async function saveOpenPositions(rows) {
        const arrRows = Array.isArray(rows) ? rows : [];
        const objResult = await postJson("/api/rollingoptions-strangle-live/open-positions", {
            positions: arrRows
        });
        const arrSaved = Array.isArray(objResult?.data) ? objResult.data : [];
        renderOpenPositions(arrSaved);
        return arrSaved;
    }

    async function deleteSavedOpenPosition(importId) {
        return postJson("/api/rollingoptions-strangle-live/open-positions/delete", {
            importId: String(importId || "").trim()
        });
    }

    async function reconcileOpenPositions() {
        return postJson("/api/rollingoptions-strangle-live/open-positions/reconcile", {
            symbol: String(ids.symbol?.value || "BTC").trim().toUpperCase()
        });
    }

    async function runKillSwitch() {
        await checkConnection();
        if (!canUseLiveActions()) {
            throw new Error("Delta connection is not healthy enough to execute the live kill switch.");
        }
        return postJson("/api/rollingoptions-strangle-live/kill-switch", {});
    }

    async function loadClosedPositions(preservePage) {
        const shouldPreservePage = Boolean(preservePage);
        if (!canUseLiveActions()) {
            gClosedPositions = [];
            gClosedPositionsPage = 1;
            renderClosedPositions([]);
            return;
        }

        const objSearch = new URLSearchParams();
        if (ids.closedFromDate?.value) {
            objSearch.set("fromDate", ids.closedFromDate.value);
        }
        if (ids.closedToDate?.value) {
            objSearch.set("toDate", ids.closedToDate.value);
        }

        const vQuery = objSearch.toString();
        const objResult = await getJson(`/api/rollingoptions-strangle-live/closed-positions${vQuery ? `?${vQuery}` : ""}`);
        gClosedPositions = Array.isArray(objResult?.data?.positions) ? objResult.data.positions : [];
        if (!shouldPreservePage) {
            gClosedPositionsPage = 1;
        }
        renderClosedPositions(gClosedPositions);
    }

    async function loadEvents() {
        const objResult = await getJson("/api/rollingoptions-strangle-live/events");
        renderEvents(Array.isArray(objResult?.data) ? objResult.data : []);
    }

    function applyImportedPositions() {
        const arrCheckedIds = Array.from(document.querySelectorAll(".rolling-strangle-live-import-list input[type='checkbox']:checked"))
            .map(function (objNode) {
                return String(objNode instanceof HTMLInputElement ? objNode.value : "").trim();
            })
            .filter(Boolean);

        const arrSelected = gImportablePositions.filter(function (row) {
            return arrCheckedIds.includes(String(row.importId || "").trim());
        });

        void saveOpenPositions(arrSelected).then(function (arrSaved) {
            setStatus(ids.pageStatus, arrSaved.length
                ? `Imported ${arrSaved.length} live position${arrSaved.length === 1 ? "" : "s"} into the open grid.`
                : "No positions were selected for import.", arrSaved.length ? "success" : "warning");
            void loadEvents().catch(function () { return undefined; });
            closeImportModal();
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to save imported open positions.", "danger");
        });
    }

    ids.symbol?.addEventListener("change", function () {
        applySymbolDefaults();
        const vSymbol = String(ids.symbol?.value || "BTC").trim().toUpperCase();
        void enqueueProfileSave({
            uiState: getUiState()
        }).then(function () {
            return loadAccountSummary(vSymbol).catch(function () {
                return undefined;
            });
        }).then(function () {
            return checkConnection();
        }).then(function () {
            if (!canUseLiveActions()) {
                return;
            }
            return loadAccountSummary(vSymbol);
        }).catch(function (_objError) {
        });
    });
    ids.futQty?.addEventListener("input", queueProfileSave);
    ids.futureOrderType?.addEventListener("change", queueProfileSave);
    ids.manualFutAction?.addEventListener("change", queueProfileSave);
    ids.futuresEnabled?.addEventListener("change", queueProfileSave);
    ids.optionAction?.addEventListener("change", queueProfileSave);
    ids.optionLegSide?.addEventListener("change", queueProfileSave);
    ids.optionExpiryMode?.addEventListener("change", function () {
        applyExpiryModeDefaults(true, ids.optionExpiryMode, ids.optionExpiryDate);
        queueProfileSave();
    });
    ids.optionExpiryDate?.addEventListener("change", queueProfileSave);
    ids.optionQty?.addEventListener("input", queueProfileSave);
    ids.optionReEnter?.addEventListener("change", queueProfileSave);
    ids.optionAction2?.addEventListener("change", queueProfileSave);
    ids.optionLegSide2?.addEventListener("change", queueProfileSave);
    ids.optionExpiryMode2?.addEventListener("change", function () {
        applyExpiryModeDefaults(true, ids.optionExpiryMode2, ids.optionExpiryDate2);
        queueProfileSave();
    });
    ids.optionExpiryDate2?.addEventListener("change", queueProfileSave);
    ids.optionQty2?.addEventListener("input", queueProfileSave);
    ids.optionReEnter2?.addEventListener("change", queueProfileSave);
    ids.redOptQty?.addEventListener("input", queueProfileSave);
    ids.reRedDelta?.addEventListener("input", queueProfileSave);
    ids.redTpPct?.addEventListener("input", queueProfileSave);
    ids.redSlPct?.addEventListener("input", queueProfileSave);
    ids.greenOptQty?.addEventListener("input", queueProfileSave);
    ids.greenReDelta?.addEventListener("input", queueProfileSave);
    ids.greenTpPct?.addEventListener("input", queueProfileSave);
    ids.greenSlPct?.addEventListener("input", queueProfileSave);
    ids.trailGreenTp1Enabled?.addEventListener("change", queueProfileSave);
    ids.trailGreenSl1Enabled?.addEventListener("change", queueProfileSave);
    ids.trailRedTp1Enabled?.addEventListener("change", queueProfileSave);
    ids.trailRedSl1Enabled?.addEventListener("change", queueProfileSave);
    ids.greenOptQty2?.addEventListener("input", queueProfileSave);
    ids.greenReDelta2?.addEventListener("input", queueProfileSave);
    ids.greenTpPct2?.addEventListener("input", queueProfileSave);
    ids.greenSlPct2?.addEventListener("input", queueProfileSave);
    ids.trailGreenTp2Enabled?.addEventListener("change", queueProfileSave);
    ids.trailGreenSl2Enabled?.addEventListener("change", queueProfileSave);
    ids.redOptQty2?.addEventListener("input", queueProfileSave);
    ids.redReDelta2?.addEventListener("input", queueProfileSave);
    ids.redTpPct2?.addEventListener("input", queueProfileSave);
    ids.redSlPct2?.addEventListener("input", queueProfileSave);
    ids.trailRedTp2Enabled?.addEventListener("change", queueProfileSave);
    ids.trailRedSl2Enabled?.addEventListener("change", queueProfileSave);
    ids.replacementBlockSameLegEnabled?.addEventListener("change", queueProfileSave);
    ids.replacementImmediateTriggerGuardEnabled?.addEventListener("change", queueProfileSave);
    ids.replacementUseRenkoColorEnabled?.addEventListener("change", queueProfileSave);
    ids.replacementWaitForRenkoPointEnabled?.addEventListener("change", queueProfileSave);
    ids.replacementCloseOrphanEnabled?.addEventListener("change", queueProfileSave);
    ids.replacementCloseWhenOriginalPositiveEnabled?.addEventListener("change", queueProfileSave);
    ids.replacementUseEmaTrendEnabled?.addEventListener("change", queueProfileSave);
    ids.replacementCloseEmaMismatchEnabled?.addEventListener("change", queueProfileSave);
    ids.emaEnabled?.addEventListener("change", queueProfileSave);
    ids.emaSignalEnabled?.addEventListener("change", queueProfileSave);
    ids.emaRenkoConfirmEnabled?.addEventListener("change", queueProfileSave);
    ids.emaTimeframe?.addEventListener("change", queueProfileSave);
    ids.emaSource?.addEventListener("change", queueProfileSave);
    ids.emaPeriod?.addEventListener("input", queueProfileSave);
    ids.negativePnlHedgeEnabled?.addEventListener("change", refreshNegativePnlHedgePreview);
    ids.negativePnlPlaceOrders?.addEventListener("change", refreshNegativePnlHedgePreview);
    ids.negativePnlAction3?.addEventListener("change", refreshNegativePnlHedgePreview);
    ids.negativePnlHedgeQty?.addEventListener("input", refreshNegativePnlHedgePreview);
    ids.negativePnlMaxLegs?.addEventListener("input", refreshNegativePnlHedgePreview);
    ids.negativePnlHedgeExpiryMode?.addEventListener("change", refreshNegativePnlHedgePreview);
    ids.negativePnlHedgeDelta?.addEventListener("input", refreshNegativePnlHedgePreview);
    ids.negativePnlTpPct?.addEventListener("input", refreshNegativePnlHedgePreview);
    ids.negativePnlSlPct?.addEventListener("input", refreshNegativePnlHedgePreview);
    ids.negativePnlRecoveryTarget?.addEventListener("input", refreshNegativePnlHedgePreview);
    ids.positivePnlTriggerAmount?.addEventListener("input", queueProfileSave);
    ids.positivePnlTrailSlEnabled?.addEventListener("change", queueProfileSave);
    ids.closeSupportLegOnSourceClose?.addEventListener("change", queueProfileSave);
    ids.positivePnlExpiryDate?.addEventListener("change", queueProfileSave);
    ids.positivePnlExpiryRefreshTime?.addEventListener("change", queueProfileSave);
    ids.positivePnlAdverseRenkoCloseEnabled?.addEventListener("change", queueProfileSave);
    ids.addOneLotFuture?.addEventListener("change", queueProfileSave);
    ids.targetOpenPnl?.addEventListener("input", queueProfileSave);
    ids.closeAllLegsOnAnyClose?.addEventListener("change", queueProfileSave);
    ids.skipRenkoEntryNoOpenOptions?.addEventListener("change", queueProfileSave);
    ids.renkoValue?.addEventListener("input", function () {
        queueProfileSave();
        if (gRenkoKickTimer) {
            clearTimeout(gRenkoKickTimer);
        }
        gRenkoKickTimer = setTimeout(function () {
            gRenkoKickTimer = null;
            void kickRenkoCycleIfNeeded().catch(function () { return undefined; });
        }, 600);
    });
    ids.renkoPriceSrc?.addEventListener("change", function () {
        queueProfileSave();
        void kickRenkoCycleIfNeeded().catch(function () { return undefined; });
    });
    ids.apiProfile?.addEventListener("change", function () {
        void enqueueProfileSave({
            selectedApiProfileId: String(ids.apiProfile?.value || "").trim(),
            uiState: getUiState()
        }).then(function () {
            return checkConnection();
        }).then(function () {
            if (!canUseLiveActions()) {
                renderClosedPositions([]);
                renderOpenPositions([]);
                return;
            }
            return Promise.all([
                loadAccountSummary(),
                reconcileOpenPositionsSilently().catch(function () { return undefined; }),
                loadClosedPositions(false)
            ]);
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to load live account data.", "danger");
        });
    });
    ids.checkConnectionButton?.addEventListener("click", function () {
        void checkConnection().then(function () {
            if (!canUseLiveActions()) {
                renderClosedPositions([]);
                renderOpenPositions([]);
                return;
            }
            return Promise.all([
                loadAccountSummary(),
                reconcileOpenPositionsSilently().catch(function () { return undefined; }),
                loadClosedPositions(false)
            ]);
        }).catch(function (objError) {
            setStatus(ids.connectionStatus, objError instanceof Error ? objError.message : "Unable to check Delta connection.", "danger");
        });
    });
    ids.autoTraderButton?.addEventListener("click", function () {
        void checkConnection().then(function () {
            if (!canUseLiveActions()) {
                throw new Error("Delta connection is not healthy enough to change live auto trader state.");
            }
            return toggleAutoTrader();
        }).then(function () {
            return Promise.all([loadRuntimeStatus(), loadAccountSummary(), loadClosedPositions(false)]);
        }).then(function () {
            setStatus(ids.pageStatus, gAutoTraderEnabled ? "Live auto trader enabled." : "Live auto trader disabled.", "success");
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to change live auto trader state.", "danger");
        });
    });
    ids.placeFutureButton?.addEventListener("click", function () {
        const vAction = String(ids.manualFutAction?.value || "SELL").trim().toUpperCase() === "BUY" ? "BUY" : "SELL";
        void placeManualFuture(vAction).then(function (objResult) {
            const objData = objResult?.data || {};
            const objOrder = objData.order || {};
            const arrTracked = Array.isArray(objData.trackedOpenPositions) ? objData.trackedOpenPositions : null;
            const vOrderId = String(objOrder.id || objOrder.order_id || "").trim();
            const vMessage = objResult?.message || "Future live order placed.";
            if (arrTracked) {
                renderOpenPositions(arrTracked);
            }
            setStatus(ids.pageStatus, vOrderId ? `${vMessage} Order ID: ${vOrderId}` : vMessage, "success");
            return Promise.all([loadAccountSummary(), loadConnectionStatus(), loadClosedPositions(true).catch(function () { return undefined; }), loadEvents().catch(function () { return undefined; })]);
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to place FUT order.", "danger");
        });
    });
    ids.openOptionButton?.addEventListener("click", function () {
        void placeManualOption("open", 1).then(function (objResult) {
            const arrContracts = Array.isArray(objResult?.data?.contracts) ? objResult.data.contracts : [];
            const arrTracked = Array.isArray(objResult?.data?.trackedOpenPositions) ? objResult.data.trackedOpenPositions : null;
            const vContracts = arrContracts.map(function (objRow) {
                return String(objRow?.contractSymbol || "").trim();
            }).filter(Boolean).join(", ");
            const vMessage = objResult?.message || "Open option live order placed.";
            if (arrTracked) {
                renderOpenPositions(arrTracked);
            }
            setStatus(ids.pageStatus, vContracts ? `${vMessage} ${vContracts}` : vMessage, "success");
            return Promise.all([loadAccountSummary(), loadConnectionStatus(), loadClosedPositions(true).catch(function () { return undefined; }), loadEvents().catch(function () { return undefined; })]);
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to place OPEN OPTION order.", "danger");
        });
    });
    ids.openOptionButton2?.addEventListener("click", function () {
        void placeManualOption("open", 2).then(function (objResult) {
            const arrContracts = Array.isArray(objResult?.data?.contracts) ? objResult.data.contracts : [];
            const arrTracked = Array.isArray(objResult?.data?.trackedOpenPositions) ? objResult.data.trackedOpenPositions : null;
            const vContracts = arrContracts.map(function (objRow) {
                return String(objRow?.contractSymbol || "").trim();
            }).filter(Boolean).join(", ");
            const vMessage = objResult?.message || "Open option 2 live order placed.";
            if (arrTracked) {
                renderOpenPositions(arrTracked);
            }
            setStatus(ids.pageStatus, vContracts ? `${vMessage} ${vContracts}` : vMessage, "success");
            return Promise.all([loadAccountSummary(), loadConnectionStatus(), loadClosedPositions(true).catch(function () { return undefined; }), loadEvents().catch(function () { return undefined; })]);
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to place OPEN OPTION 2 order.", "danger");
        });
    });
    ids.exitOptionButton?.addEventListener("click", function () {
        void placeManualOption("exit", 1).then(function (objResult) {
            const arrContracts = Array.isArray(objResult?.data?.contracts) ? objResult.data.contracts : [];
            const arrTracked = Array.isArray(objResult?.data?.trackedOpenPositions) ? objResult.data.trackedOpenPositions : null;
            const vContracts = arrContracts.map(function (objRow) {
                return String(objRow?.contractSymbol || "").trim();
            }).filter(Boolean).join(", ");
            const vMessage = objResult?.message || "Exit option live order placed.";
            if (arrTracked) {
                renderOpenPositions(arrTracked);
            }
            setStatus(ids.pageStatus, vContracts ? `${vMessage} ${vContracts}` : vMessage, "success");
            return Promise.all([loadAccountSummary(), loadConnectionStatus(), loadClosedPositions(true).catch(function () { return undefined; }), loadEvents().catch(function () { return undefined; })]);
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to place EXIT OPTION order.", "danger");
        });
    });
    ids.exitOptionButton2?.addEventListener("click", function () {
        void placeManualOption("exit", 2).then(function (objResult) {
            const arrContracts = Array.isArray(objResult?.data?.contracts) ? objResult.data.contracts : [];
            const arrTracked = Array.isArray(objResult?.data?.trackedOpenPositions) ? objResult.data.trackedOpenPositions : null;
            const vContracts = arrContracts.map(function (objRow) {
                return String(objRow?.contractSymbol || "").trim();
            }).filter(Boolean).join(", ");
            const vMessage = objResult?.message || "Exit option 2 live order placed.";
            if (arrTracked) {
                renderOpenPositions(arrTracked);
            }
            setStatus(ids.pageStatus, vContracts ? `${vMessage} ${vContracts}` : vMessage, "success");
            return Promise.all([loadAccountSummary(), loadConnectionStatus(), loadClosedPositions(true).catch(function () { return undefined; }), loadEvents().catch(function () { return undefined; })]);
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to place EXIT OPTION 2 order.", "danger");
        });
    });
    ids.importButton?.addEventListener("click", function () {
        void loadImportablePositions().catch(function (objError) {
            setStatus(ids.importStatus, objError instanceof Error ? objError.message : "Unable to load open positions.", "danger");
        });
    });
    ids.refreshOpenPositionsButton?.addEventListener("click", function () {
        void reconcileOpenPositions().then(function (objResult) {
            const arrPositions = Array.isArray(objResult?.data) ? objResult.data : [];
            renderOpenPositions(arrPositions);
            void loadEvents().catch(function () { return undefined; });
            setStatus(ids.pageStatus, objResult?.message || "Open positions reconciled with Delta Exchange.", "success");
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to refresh open positions.", "danger");
        });
    });
    ids.refreshClosedPositionsButton?.addEventListener("click", function () {
        void loadClosedPositions(false).then(function () {
            setStatus(ids.pageStatus, "Closed-position history refreshed.", "success");
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to load closed positions.", "danger");
        });
    });
    ids.closedPrevPageButton?.addEventListener("click", function () {
        if (gClosedPositionsPage <= 1) {
            return;
        }
        gClosedPositionsPage -= 1;
        renderClosedPositions(gClosedPositions);
    });
    ids.closedNextPageButton?.addEventListener("click", function () {
        const vTotalPages = Math.max(1, Math.ceil(gClosedPositions.length / gClosedPositionsPageSize));
        if (gClosedPositionsPage >= vTotalPages) {
            return;
        }
        gClosedPositionsPage += 1;
        renderClosedPositions(gClosedPositions);
    });
    ids.closedPageNumbers?.addEventListener("click", function (objEvent) {
        const objTarget = objEvent.target instanceof Element
            ? objEvent.target.closest(".rolling-strangle-live-closed-page-btn")
            : null;
        if (!(objTarget instanceof HTMLButtonElement)) {
            return;
        }
        const vPage = Number(objTarget.dataset.page || 0);
        if (!Number.isFinite(vPage) || vPage <= 0) {
            return;
        }
        gClosedPositionsPage = vPage;
        renderClosedPositions(gClosedPositions);
    });
    ids.clearClosedFiltersButton?.addEventListener("click", function () {
        if (ids.closedFromDate) {
            ids.closedFromDate.value = "";
        }
        if (ids.closedToDate) {
            ids.closedToDate.value = "";
        }
        queueProfileSave();
        void loadClosedPositions(false).then(function () {
            setStatus(ids.pageStatus, "Closed-position filters cleared.", "success");
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to clear closed-position filters.", "danger");
        });
    });
    ids.closedFromDate?.addEventListener("change", function () {
        queueProfileSave();
        void loadClosedPositions(false).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to filter closed positions.", "danger");
        });
    });
    ids.closedToDate?.addEventListener("change", function () {
        queueProfileSave();
        void loadClosedPositions(false).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to filter closed positions.", "danger");
        });
    });
    ids.refreshEventsButton?.addEventListener("click", function () {
        void loadEvents().catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to refresh activity log.", "danger");
        });
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
        void postJson("/api/rollingoptions-strangle-live/events/clear", {}).then(function (objResult) {
            renderEvents([]);
            setStatus(ids.pageStatus, objResult?.message || "Live activity log cleared.", "success");
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to clear activity log.", "danger");
        });
    });
    ids.renkoBoxButton?.addEventListener("click", function () {
        void toggleRenkoBox().then(function (objResult) {
            setStatus(ids.pageStatus, objResult?.message || "Renko box color toggled.", "success");
            return loadEvents().catch(function () { return undefined; });
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to toggle Renko box.", "danger");
        });
    });
    ids.updateBoxMovingPriceButton?.addEventListener("click", function () {
        const vPrice = Number(ids.boxConditionMovingPrice?.value);
        if (!ids.boxConditionEnabled?.checked || !Number.isFinite(vPrice) || vPrice <= 0) {
            setStatus(ids.pageStatus, "Enable Box Conditions and enter a valid Moving Price.", "warning");
            return;
        }
        void flushProfileSave()
            .then(function () {
                return postJson("/api/rollingoptions-strangle-live/box/moving-price", { price: vPrice });
            })
            .then(function (objResult) {
                applyRuntimeStatus(objResult?.data || {});
                setStatus(ids.pageStatus, objResult?.message || "Box Moving Price updated.", objResult?.status || "success");
            })
            .catch(function (objError) {
                setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to update Box Moving Price.", "danger");
            });
    });
    ids.boxConditionSignal?.addEventListener("click", function () {
        if (!ids.boxConditionEnabled?.checked) {
            setStatus(ids.pageStatus, "Enable Box Conditions before toggling the Box signal.", "warning");
            return;
        }
        const vCurrent = String(gLatestRuntimeState?.state?.boxLastColor || "").trim().toUpperCase();
        const vColor = vCurrent === "R" ? "G" : "R";
        void postJson("/api/rollingoptions-strangle-live/box/signal", { color: vColor })
            .then(function (objResult) {
                applyRuntimeStatus(objResult?.data || {});
                setStatus(ids.pageStatus, objResult?.message || `Box changed to ${vColor}.`, objResult?.status || "success");
            })
            .catch(function (objError) {
                setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to toggle Box signal.", "danger");
            });
    });
    ids.renkoFeedEnabled?.addEventListener("change", function () {
        queueProfileSave();
        if (ids.renkoFeedStatus) {
            ids.renkoFeedStatus.textContent = ids.renkoFeedEnabled.checked ? "ON" : "OFF";
            ids.renkoFeedStatus.className = `rolling-demo-badge ${ids.renkoFeedEnabled.checked ? "success" : "secondary"}`;
        }
    });
    ids.renkoManualPrice?.addEventListener("change", function () {
        gRenkoManualPriceResetToken = Date.now();
        queueProfileSave();
    });
    ids.renkoTimeframe?.addEventListener("change", queueProfileSave);
    ids.boxConditionEnabled?.addEventListener("change", queueProfileSave);
    ids.boxConditionPoints?.addEventListener("change", queueProfileSave);
    ids.boxConditionPoints?.addEventListener("input", queueProfileSave);
    ids.boxConditionMovingPrice?.addEventListener("change", queueProfileSave);
    ids.boxConditionMovingPrice?.addEventListener("input", queueProfileSave);
    ids.boxColorChangeCloseEnabled?.addEventListener("change", queueProfileSave);
    ids.updateGreenRulesButton?.addEventListener("click", function () {
        void updateRuleSettings("G", 1).then(function (objResult) {
            setStatus(ids.pageStatus, objResult?.message || "Updated Green rule settings for open options.", "success");
            return loadEvents().catch(function () { return undefined; });
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to update Green rule settings.", "danger");
        });
    });
    ids.updateGreenRulesButton2?.addEventListener("click", function () {
        void updateRuleSettings("G", 2).then(function (objResult) {
            setStatus(ids.pageStatus, objResult?.message || "Updated Green rule 2 settings for open options.", "success");
            return loadEvents().catch(function () { return undefined; });
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to update Green rule 2 settings.", "danger");
        });
    });
    ids.updateRedRulesButton?.addEventListener("click", function () {
        void updateRuleSettings("R", 1).then(function (objResult) {
            setStatus(ids.pageStatus, objResult?.message || "Updated Red rule settings for open options.", "success");
            return loadEvents().catch(function () { return undefined; });
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to update Red rule settings.", "danger");
        });
    });
    ids.updateRedRulesButton2?.addEventListener("click", function () {
        void updateRuleSettings("R", 2).then(function (objResult) {
            setStatus(ids.pageStatus, objResult?.message || "Updated Red rule 2 settings for open options.", "success");
            return loadEvents().catch(function () { return undefined; });
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to update Red rule 2 settings.", "danger");
        });
    });
    ids.updateNegativePnlButton?.addEventListener("click", function () {
        void flushProfileSave().then(function () {
            return postJson("/api/rollingoptions-strangle-live/negative-pnl/settings/update", {});
        }).then(function (objResult) {
            const arrTracked = Array.isArray(objResult?.data?.trackedOpenPositions)
                ? objResult.data.trackedOpenPositions
                : null;
            if (arrTracked) {
                renderOpenPositions(arrTracked);
            }
            setStatus(ids.pageStatus, objResult?.message || "Updated negative PnL option leg settings.", "success");
            return loadEvents().catch(function () { return undefined; });
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to update negative PnL option leg settings.", "danger");
        });
    });
    ids.openPositivePnlButton?.addEventListener("click", function () {
        void flushProfileSave().then(function () {
            return postJson("/api/rollingoptions-strangle-live/positive-pnl/open", {});
        }).then(function (objResult) {
            setStatus(ids.pageStatus, objResult?.message || "Positive PnL support cycle completed.", "success");
            return loadOpenPositions();
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to open Positive PnL support.", "danger");
        });
    });
    ids.copyWhitelistIpButton?.addEventListener("click", function () {
        void copyWhitelistIp().then(function (vIp) {
            setStatus(ids.pageStatus, `Whitelist IP copied: ${vIp}`, "success");
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to copy whitelist IP.", "warning");
        });
    });
    ids.importOverlay?.addEventListener("click", closeImportModal);
    ids.closeImportModalButton?.addEventListener("click", closeImportModal);
    ids.applyImportedPositionsButton?.addEventListener("click", applyImportedPositions);
    ids.telegramEventCheckboxes.forEach(function (objCheckbox) {
        objCheckbox.addEventListener("change", queueProfileSave);
    });
    ids.openPositionsBody?.addEventListener("click", function (event) {
        const objTarget = event.target instanceof Element ? event.target : null;
        const objCloseButton = objTarget ? objTarget.closest(".rolling-strangle-live-close-open-position") : null;
        if (objCloseButton instanceof HTMLButtonElement) {
            const vImportId = String(objCloseButton.dataset.importId || "").trim();
            const objRow = gDisplayedPositions.find(function (row) {
                return String(row?.importId || "").trim() === vImportId;
            });
            if (!objRow) {
                setStatus(ids.pageStatus, "Unable to find the selected imported live position.", "danger");
                return;
            }

            const bConfirmed = window.confirm(`Close ${objRow.contractName || "this position"} on Delta Exchange now?`);
            if (!bConfirmed) {
                return;
            }

            void closeImportedOpenPosition(objRow).then(function (objResult) {
                const objData = objResult?.data || {};
                const objOrder = objData.order || {};
                const vOrderId = String(objOrder.id || objOrder.order_id || "").trim();
                const vMessage = objResult?.message || "Live close order placed on Delta Exchange.";
                setStatus(ids.pageStatus, vOrderId ? `${vMessage} Order ID: ${vOrderId}` : vMessage, "success");
                const arrRemaining = gDisplayedPositions.filter(function (row) {
                    return String(row?.importId || "").trim() !== vImportId;
                });
                renderOpenPositions(arrRemaining);
                return Promise.all([
                    reconcileOpenPositionsSilently().catch(function () { return undefined; }),
                    loadAccountSummary(),
                    loadConnectionStatus(),
                    loadClosedPositions(true).catch(function () { return undefined; }),
                    refreshImportablePositionsSilently().catch(function () { return undefined; }),
                    loadEvents().catch(function () { return undefined; })
                ]);
            }).catch(function (objError) {
                setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to close imported live position.", "danger");
            });
            return;
        }

        const objDeleteButton = objTarget ? objTarget.closest(".rolling-strangle-live-delete-open-position") : null;
        if (objDeleteButton instanceof HTMLButtonElement) {
            const vImportId = String(objDeleteButton.dataset.importId || "").trim();
            const arrRemaining = gDisplayedPositions.filter(function (row) {
                return String(row?.importId || "").trim() !== vImportId;
            });
            void deleteSavedOpenPosition(vImportId).then(function () {
                renderOpenPositions(arrRemaining);
                void loadEvents().catch(function () { return undefined; });
                setStatus(ids.pageStatus, "Position removed from the Open Positions section only. No Delta Exchange order was placed.", "success");
            }).catch(function (objError) {
                setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to remove imported open position.", "danger");
            });
        }
    });

    ids.execStrategyButton?.addEventListener("click", function () {
        void executeStrategy().then(function (objResult) {
            const objData = objResult?.data || {};
            const arrTracked = Array.isArray(objData.trackedOpenPositions) ? objData.trackedOpenPositions : null;
            if (arrTracked) {
                renderOpenPositions(arrTracked);
            }
            setStatus(ids.pageStatus, objResult?.message || "Live strategy executed.", "success");
            return Promise.all([
                loadRuntimeStatus(),
                reconcileOpenPositionsSilently().catch(function () { return undefined; }),
                loadAccountSummary().catch(function () { return undefined; }),
                loadConnectionStatus(),
                loadEvents().catch(function () { return undefined; }),
                loadClosedPositions(true).catch(function () { return undefined; })
            ]);
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to execute live strategy.", "danger");
        });
    });
    ids.killSwitchButton?.addEventListener("click", function () {
        const bConfirmed = window.confirm("Kill switch will stop auto trader and place reduce-only market close orders for all saved live open positions. Continue?");
        if (!bConfirmed) {
            return;
        }

        void runKillSwitch().then(function (objResult) {
            const objData = objResult?.data || {};
            if (objData.runtime) {
                applyRuntimeStatus(objData.runtime);
            }
            renderOpenPositions([]);
            setStatus(ids.pageStatus, objResult?.message || "Live kill switch completed.", "success");
            return Promise.all([
                loadRuntimeStatus(),
                loadAccountSummary().catch(function () { return undefined; }),
                loadConnectionStatus(),
                loadEvents().catch(function () { return undefined; }),
                loadClosedPositions(true).catch(function () { return undefined; })
            ]);
        }).catch(function (objError) {
            setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to execute live kill switch.", "danger");
        });
    });

    applySymbolDefaults();
    applyExpiryModeDefaults(true);
    setButtonsEnabled();
    if (ids.engineStatus) {
        ids.engineStatus.textContent = "Idle";
    }

    void loadApiProfiles().then(function () {
        return loadLiveProfile();
    }).then(function () {
        return loadRuntimeStatus();
    }).then(function () {
        return loadSavedOpenPositions().catch(function () { return []; });
    }).then(function () {
        return loadEvents().catch(function () { return []; });
    }).then(function () {
        if (!gSelectedApiProfileId) {
            return;
        }
        return checkConnection().then(function () {
            if (!canUseLiveActions()) {
                return;
            }
            return Promise.all([
                loadAccountSummary(),
                reconcileOpenPositionsSilently().catch(function () { return undefined; }),
                loadClosedPositions(false),
                loadEvents()
            ]);
        });
    }).catch(function (objError) {
        setStatus(ids.pageStatus, objError instanceof Error ? objError.message : "Unable to load Delta API profiles.", "danger");
    });

    startConnectionPolling();
    refreshPositivePnlExpiryAtConfiguredTime();
    setInterval(refreshPositivePnlExpiryAtConfiguredTime, 60000);
})();
