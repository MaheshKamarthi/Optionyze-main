(function () {
    const ids = {
        symbol: document.getElementById("ddlCoveredCallSymbol"),
        lotSize: document.getElementById("txtCoveredCallLotSize"),
        manualFutQty: document.getElementById("txtManualFutQty"),
        manualFutOrderType: document.getElementById("ddlManualFutOrderType"),
        manualFutAction: document.getElementById("ddlManualFutAction"),
        futuresEnabled: document.getElementById("chkRollingDemoFuturesEnabled"),
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
        renkoFeedEnabled: document.querySelector(".rolling-demo-switch input"),
        renkoFeedPts: document.getElementById("txtRenkoFeedPts"),
        renkoFeedPriceSrc: document.getElementById("ddlRenkoFeedPriceSrc"),
        demoBalance: document.getElementById("txtRollingDemoDemoBalance"),
        optionsPnl: document.getElementById("txtRollingDemoOptionsPnl"),
        totalPnl: document.getElementById("txtRollingDemoTotalPnl"),
        totalCharges: document.getElementById("txtRollingDemoTotalCharges"),
        closedFromDate: document.getElementById("txtClsFromDate"),
        closedToDate: document.getElementById("txtClsToDate"),
        renkoFeedMeta: document.querySelector(".rolling-demo-feed-meta"),
        renkoFeedBadge: document.querySelector(".rolling-demo-switch")?.nextElementSibling,
        oneLotValue: document.getElementById("rollingDemoOneLotValue"),
        totalMarginValue: document.getElementById("rollingDemoTotalMarginValue"),
        blockedMarginValue: document.getElementById("rollingDemoBlockedMarginValue"),
        healthValue: document.getElementById("rollingDemoHealthValue"),
        engineStatus: document.getElementById("rollingDemoEngineStatus"),
        pageStatus: document.getElementById("rollingDemoPageStatus"),
        openCount: document.getElementById("rollingDemoOpenCount"),
        autoTraderButton: document.getElementById("btnRollingDemoAutoTrader"),
        lastSignal: document.getElementById("rollingDemoLastSignal"),
        openPositionsBody: document.getElementById("rollingDemoOpenPositionsBody"),
        closedPositionsBody: document.getElementById("rollingDemoClosedPositionsBody"),
        refreshOpenPositionsButton: document.getElementById("btnRollingDemoRefreshOpenPositions"),
        clearClosedFiltersButton: document.getElementById("btnRollingDemoClearClosedFilters"),
        placeFutureButton: document.getElementById("btnRollingDemoPlaceFuture"),
        execStrategyButton: document.getElementById("btnRollingDemoExecStrategy"),
        updateGreenRulesButton: document.getElementById("btnRollingDemoUpdateGreenRules"),
        updateGreenRulesButton2: document.getElementById("btnRollingDemoUpdateGreenRules2"),
        updateRedRulesButton: document.getElementById("btnRollingDemoUpdateRedRules"),
        updateRedRulesButton2: document.getElementById("btnRollingDemoUpdateRedRules2"),
        openOptionButton: document.getElementById("btnRollingDemoOpenOption"),
        openOptionButton2: document.getElementById("btnRollingDemoOpenOption2"),
        exitOptionButton: document.getElementById("btnRollingDemoExitOption"),
        exitOptionButton2: document.getElementById("btnRollingDemoExitOption2"),
        clearOpenPositionsButton: document.getElementById("btnRollingDemoClearOpenPositions"),
        killSwitchButton: document.getElementById("btnRollingDemoKillSwitch"),
        clearClosedPositionsButton: document.getElementById("btnRollingDemoClearClosedPositions"),
        telegramAlertsEnabled: document.getElementById("chkRollingDemoTelegramAlertsEnabled"),
        telegramEventCheckboxes: Array.from(document.querySelectorAll(".rolling-demo-telegram-event")),
        eventLog: document.getElementById("rollingDemoEventLog"),
        refreshEventsButton: document.getElementById("btnRollingDemoRefreshEvents"),
        clearEventsButton: document.getElementById("btnRollingDemoClearEvents")
    };

    const symbolConfig = {
        BTC: { contractName: "BTCUSD", lotSize: "0.001" },
        ETH: { contractName: "ETHUSD", lotSize: "0.01" }
    };

    const apiBase = String(document.body?.dataset?.rollingApiBase || "/api/rollingoptions-pt-de");

    let gIsApplyingState = false;
    let gSaveTimer = null;
    let gPreviousOpenPositionLtps = new Map();
    let gLatestRuntimeState = null;
    let gLatestOpenPositions = [];
    let gLatestClosedPositions = [];
    let gHasLoadedProfile = false;

    function getSelectedConfig() {
        const selectedSymbol = String(ids.symbol?.value || "BTC").trim().toUpperCase();
        return symbolConfig[selectedSymbol] || symbolConfig.BTC;
    }

    function formatDateInputValue(dateValue) {
        if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
            return "";
        }

        const year = String(dateValue.getFullYear());
        const month = String(dateValue.getMonth() + 1).padStart(2, "0");
        const day = String(dateValue.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function getLastFridayOfMonth(yearValue, monthIndex) {
        const dateValue = new Date(yearValue, monthIndex + 1, 0);
        while (dateValue.getDay() !== 5) {
            dateValue.setDate(dateValue.getDate() - 1);
        }
        return dateValue;
    }

    function resolveExpiryDateByMode(expiryMode) {
        const modeValue = String(expiryMode || "").trim();
        const currentDate = new Date();
        const currentDayOfWeek = currentDate.getDay();

        if (modeValue === "1") {
            currentDate.setDate(currentDate.getDate() + 1);
            return currentDate;
        }
        if (modeValue === "2") {
            currentDate.setDate(currentDate.getDate() + 2);
            return currentDate;
        }
        if (modeValue === "4") {
            const daysToThisFriday = (5 - currentDayOfWeek + 7) % 7;
            const daysToWeeklyFriday = currentDayOfWeek >= 2 ? (daysToThisFriday + 7) : daysToThisFriday;
            currentDate.setDate(currentDate.getDate() + daysToWeeklyFriday);
            return currentDate;
        }
        if (modeValue === "5") {
            const daysToThisFriday = (5 - currentDayOfWeek + 7) % 7;
            const daysToBiWeeklyFriday = currentDayOfWeek >= 2 ? (daysToThisFriday + 14) : (daysToThisFriday + 7);
            currentDate.setDate(currentDate.getDate() + daysToBiWeeklyFriday);
            return currentDate;
        }
        if (modeValue === "6") {
            const lastFridayOfMonth = getLastFridayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
            const lastFridayOfNextMonth = getLastFridayOfMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);
            return currentDate.getDate() > 15 ? lastFridayOfNextMonth : lastFridayOfMonth;
        }

        return currentDate;
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

    function applyExpiryModeDefaults() {
        const applyFor = function (modeField, dateField) {
            if (!modeField || !dateField) {
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

    function updateTotalPnlMetric(rows = gLatestOpenPositions) {
        if (!ids.totalPnl) {
            return;
        }
        const vOptionsPnl = parseNumberInput(ids.optionsPnl, 0);
        const vGross = (Number.isFinite(vOptionsPnl) ? vOptionsPnl : 0);
        const vCharges = parseNumberInput(ids.totalCharges, 0);
        const vNet = vGross + (Number.isFinite(vCharges) ? vCharges : 0);
        ids.totalPnl.value = Number.isFinite(vNet) ? vNet.toFixed(3) : "0.000";
    }

    function updateTotalChargesMetric(rows = gLatestClosedPositions) {
        if (!ids.totalCharges) {
            return;
        }
        const vCharges = Array.isArray(rows) ? sumCharges(rows) : 0;
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

    function formatDisplayDateTime(dateValue) {
        const parsedDate = dateValue ? new Date(dateValue) : null;
        if (!(parsedDate instanceof Date) || Number.isNaN(parsedDate.getTime())) {
            return "-";
        }

        return parsedDate.toLocaleString("en-IN", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });
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
            action1: String(ids.action1?.value || "sell"),
            legSide1: String(ids.legSide1?.value || "ce"),
            expiryMode1: String(ids.expiryMode1?.value || "1"),
            expiryDate1: String(ids.expiryDate1?.value || ""),
            manualOptQty1: parseNumberInput(ids.manualOptQty1, 1),
            reDelta1: parseNumberInput(ids.reDelta1, 0.53),
            redTpPct: parseNumberInput(ids.redTpPct, 15),
            redSlPct: parseNumberInput(ids.redSlPct, 85),
            reEnter1: Boolean(ids.reEnter1?.checked),
            action2: String(ids.action2?.value || "none"),
            legSide2: String(ids.legSide2?.value || "pe"),
            expiryMode2: String(ids.expiryMode2?.value || "1"),
            expiryDate2: String(ids.expiryDate2?.value || ""),
            manualOptQty2: parseNumberInput(ids.manualOptQty2, 1),
            reEnter2: Boolean(ids.reEnter2?.checked),
            greenOptQty2: parseNumberInput(ids.greenOptQty2, 1),
            greenReDelta2: parseNumberInput(ids.greenReDelta2, 0.53),
            greenTpPct2: parseNumberInput(ids.greenTpPct2, 15),
            greenSlPct2: parseNumberInput(ids.greenSlPct2, 85),
            redOptQty2: parseNumberInput(ids.redOptQty2, 1),
            redReDelta2: parseNumberInput(ids.redReDelta2, 0.53),
            redTpPct2: parseNumberInput(ids.redTpPct2, 15),
            redSlPct2: parseNumberInput(ids.redSlPct2, 85),
            redOptQty: parseNumberInput(ids.redOptQty, 1),
            greenOptQty: parseNumberInput(ids.greenOptQty, 1),
            greenReDelta: parseNumberInput(ids.greenReDelta, 0.53),
            greenTpPct: parseNumberInput(ids.greenTpPct, 15),
            greenSlPct: parseNumberInput(ids.greenSlPct, 85),
            trailGreenTp1Enabled: Boolean(ids.trailGreenTp1Enabled?.checked),
            trailGreenSl1Enabled: Boolean(ids.trailGreenSl1Enabled?.checked),
            trailRedTp1Enabled: Boolean(ids.trailRedTp1Enabled?.checked),
            trailRedSl1Enabled: Boolean(ids.trailRedSl1Enabled?.checked),
            renkoFeedEnabled: Boolean(ids.renkoFeedEnabled?.checked),
            renkoFeedPts: parseNumberInput(ids.renkoFeedPts, 10),
            renkoFeedPriceSrc: String(ids.renkoFeedPriceSrc?.value || "spot_price"),
            demoBalance: parseNumberInput(ids.demoBalance, 10000),
            telegramAlertsEnabled: Boolean(ids.telegramAlertsEnabled?.checked),
            trailGreenTp2Enabled: Boolean(ids.trailGreenTp2Enabled?.checked),
            trailGreenSl2Enabled: Boolean(ids.trailGreenSl2Enabled?.checked),
            trailRedTp2Enabled: Boolean(ids.trailRedTp2Enabled?.checked),
            trailRedSl2Enabled: Boolean(ids.trailRedSl2Enabled?.checked),
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

        setFieldValue("symbol", uiState.symbol);
        setFieldValue("manualFutQty", uiState.manualFutQty);
        setFieldValue("manualFutOrderType", uiState.manualFutOrderType);
        setFieldValue("manualFutAction", uiState.manualFutAction);
        setFieldValue("futuresEnabled", uiState.futuresEnabled ?? true);
        setFieldValue("action1", uiState.action1);
        setFieldValue("legSide1", uiState.legSide1);
        setFieldValue("expiryMode1", uiState.expiryMode1);
        setFieldValue("expiryDate1", uiState.expiryDate1);
        setFieldValue("manualOptQty1", uiState.manualOptQty1);
        setFieldValue("reDelta1", uiState.reDelta1);
        setFieldValue("redTpPct", uiState.redTpPct ?? (Number.isFinite(Number(uiState.deltaTp1)) ? (Number(uiState.deltaTp1) <= 2 ? Number(uiState.deltaTp1) * 100 : Number(uiState.deltaTp1)) : ""));
        setFieldValue("redSlPct", uiState.redSlPct ?? (Number.isFinite(Number(uiState.deltaSl1)) ? (Number(uiState.deltaSl1) <= 2 ? Number(uiState.deltaSl1) * 100 : Number(uiState.deltaSl1)) : ""));
        setFieldValue("reEnter1", uiState.reEnter1);
        setFieldValue("action2", uiState.action2 ?? "none");
        setFieldValue("legSide2", uiState.legSide2 ?? "pe");
        setFieldValue("expiryMode2", uiState.expiryMode2 ?? "1");
        setFieldValue("expiryDate2", uiState.expiryDate2);
        setFieldValue("manualOptQty2", uiState.manualOptQty2 ?? 1);
        setFieldValue("reEnter2", uiState.reEnter2);
        setFieldValue("greenOptQty2", uiState.greenOptQty2 ?? 1);
        setFieldValue("greenReDelta2", uiState.greenReDelta2 ?? 0.53);
        setFieldValue("greenTpPct2", uiState.greenTpPct2 ?? 15);
        setFieldValue("greenSlPct2", uiState.greenSlPct2 ?? 85);
        setFieldValue("redOptQty2", uiState.redOptQty2 ?? 1);
        setFieldValue("redReDelta2", uiState.redReDelta2 ?? 0.53);
        setFieldValue("redTpPct2", uiState.redTpPct2 ?? 15);
        setFieldValue("redSlPct2", uiState.redSlPct2 ?? 85);
        setFieldValue("redOptQty", uiState.redOptQty ?? uiState.redOptQtyPct);
        setFieldValue("greenOptQty", uiState.greenOptQty ?? uiState.greenOptQtyPct);
        setFieldValue("greenReDelta", uiState.greenReDelta);
        setFieldValue("greenTpPct", uiState.greenTpPct ?? (Number.isFinite(Number(uiState.greenTpDelta)) ? Number(uiState.greenTpDelta) * 100 : ""));
        setFieldValue("greenSlPct", uiState.greenSlPct ?? (Number.isFinite(Number(uiState.greenSlDelta)) ? Number(uiState.greenSlDelta) * 100 : ""));
        setFieldValue("trailGreenTp1Enabled", uiState.trailGreenTp1Enabled ?? true);
        setFieldValue("trailGreenSl1Enabled", uiState.trailGreenSl1Enabled ?? true);
        setFieldValue("trailRedTp1Enabled", uiState.trailRedTp1Enabled ?? true);
        setFieldValue("trailRedSl1Enabled", uiState.trailRedSl1Enabled ?? true);
        setFieldValue("renkoFeedEnabled", uiState.renkoFeedEnabled);
        setFieldValue("renkoFeedPts", uiState.renkoFeedPts);
        setFieldValue("renkoFeedPriceSrc", uiState.renkoFeedPriceSrc);
        setFieldValue("demoBalance", uiState.demoBalance);
        setFieldValue("optionsPnl", uiState.optionsPnl);
        setFieldValue("telegramAlertsEnabled", uiState.telegramAlertsEnabled);
        setFieldValue("trailGreenTp2Enabled", uiState.trailGreenTp2Enabled ?? true);
        setFieldValue("trailGreenSl2Enabled", uiState.trailGreenSl2Enabled ?? true);
        setFieldValue("trailRedTp2Enabled", uiState.trailRedTp2Enabled ?? true);
        setFieldValue("trailRedSl2Enabled", uiState.trailRedSl2Enabled ?? true);
        setFieldValue("closedFromDate", uiState.closedFromDate);
        setFieldValue("closedToDate", uiState.closedToDate);
        const objSelectedTelegramTypes = Array.isArray(uiState.telegramAlertTypes)
            ? uiState.telegramAlertTypes.map(function (vType) { return String(vType || "").trim(); })
            : [];
        ids.telegramEventCheckboxes.forEach(function (objCheckbox) {
            objCheckbox.checked = objSelectedTelegramTypes.includes(String(objCheckbox.value || "").trim());
        });

        applySymbolDefaults();
        applyExpiryModeDefaults();
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
        const optionsPnl = Number(runtimeState?.optionsPnl);

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

        if (ids.optionsPnl) {
            ids.optionsPnl.value = Number.isFinite(optionsPnl) ? optionsPnl.toFixed(3) : "0.000";
        }
        updateTotalChargesMetric(gLatestClosedPositions);
        updateTotalPnlMetric(gLatestOpenPositions);

        updateOneLotMetric(runtimeState);
    }

    function renderOpenPositions(rows) {
        if (!ids.openPositionsBody) {
            return;
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            gLatestOpenPositions = [];
            gPreviousOpenPositionLtps = new Map();
            ids.openPositionsBody.innerHTML = "<tr><td colspan=\"17\" class=\"rolling-demo-empty\">No open paper positions found for this user.</td></tr>";
            updateTotalMarginMetric([]);
            updateBalanceMetrics([]);
            updateTotalChargesMetric(gLatestClosedPositions);
            updateTotalPnlMetric([]);
            return;
        }

        gLatestOpenPositions = rows;
        const nextLtps = new Map();
        const openRowsHtml = rows.map(function (row) {
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
            const positionId = String(row.positionId || "");
            const ltpBlinkClass = getLtpBlinkClass(positionId, row.markPrice);
            const currentLtp = Number(row.markPrice);
            if (positionId && Number.isFinite(currentLtp)) {
                nextLtps.set(positionId, currentLtp);
            }
            return `
                <tr>
                    <td>${escapeHtml(formatNumericValue(row.entryDelta, 2))}</td>
                    <td>${escapeHtml(formatNumericValue(currentDelta, 2))}</td>
                    <td>${escapeHtml(formatNumericValue(tpDelta, 2))}</td>
                    <td>${escapeHtml(formatNumericValue(slDelta, 2))}</td>
                    <td>${escapeHtml(row.contractName || row.symbol || "-")}</td>
                    <td>${escapeHtml(tradeType || "-")}</td>
                    <td>${escapeHtml(formatNumericValue(row.lotSize, 3))}</td>
                    <td>${escapeHtml(formatNumericValue(row.qty, 0))}</td>
                    <td>${escapeHtml(formatNumericValue(buyPrice, 2))}</td>
                    <td>${escapeHtml(formatNumericValue(sellPrice, 2))}</td>
                    <td class="${ltpBlinkClass}">${escapeHtml(formatNumericValue(row.markPrice, 2))}</td>
                    <td>${escapeHtml(formatChargeNegative(row.charges, 3))}</td>
                    <td>${escapeHtml(formatNumericValue(row.pnl, 3))}</td>
                    <td>${escapeHtml(formatDisplayDateTime(row.openedAt))}</td>
                    <td>${escapeHtml(formatDisplayDateTime(row.closedAt))}</td>
                    <td>${escapeHtml(row.status || "-")}</td>
                    <td>
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
                    </td>
                </tr>
            `;
        }).join("");
        const totalCharges = sumCharges(rows);
        const totalPnl = sumNumeric(rows, "pnl");
        ids.openPositionsBody.innerHTML = `${openRowsHtml}
            <tr class="rolling-demo-total-row">
                <td colspan="11">Total</td>
                <td class="rolling-demo-total-value">${escapeHtml(formatChargeNegative(totalCharges, 3))}</td>
                <td class="rolling-demo-total-value">${escapeHtml(formatNumericValue(totalPnl, 3))}</td>
                <td colspan="4">-</td>
            </tr>
        `;
        gPreviousOpenPositionLtps = nextLtps;
        updateTotalMarginMetric(rows);
        updateBalanceMetrics(rows);
        updateTotalChargesMetric(gLatestClosedPositions);
        updateTotalPnlMetric(rows);
    }

    function renderClosedPositions(rows) {
        if (!ids.closedPositionsBody) {
            return;
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            gLatestClosedPositions = [];
            ids.closedPositionsBody.innerHTML = "<tr><td colspan=\"12\" class=\"rolling-demo-empty\">No closed paper positions found for this user.</td></tr>";
            updateTotalChargesMetric([]);
            updateTotalPnlMetric(gLatestOpenPositions);
            return;
        }

        gLatestClosedPositions = rows;
        const closedRowsHtml = rows.map(function (row) {
            const tradeType = String(row.action || "-");
            const currentDelta = String(row.instrumentType || "").toUpperCase() === "OPTION"
                ? (row.exitDelta ?? row.entryDelta)
                : null;
            return `
                <tr>
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
                </tr>
            `;
        }).join("");
        const totalCharges = sumCharges(rows);
        const totalPnl = sumNumeric(rows, "pnl");
        ids.closedPositionsBody.innerHTML = `${closedRowsHtml}
            <tr class="rolling-demo-total-row">
                <td colspan="10">Total</td>
                <td class="rolling-demo-total-value">${escapeHtml(formatChargeNegative(totalCharges, 3))}</td>
                <td class="rolling-demo-total-value">${escapeHtml(formatNumericValue(totalPnl, 3))}</td>
            </tr>
        `;
        updateTotalChargesMetric(rows);
        updateTotalPnlMetric(gLatestOpenPositions);
    }

    function renderEvents(rows) {
        if (!ids.eventLog) {
            return;
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            ids.eventLog.innerHTML = "<div class=\"rolling-demo-event-empty\">No server activity has been logged yet.</div>";
            return;
        }

        ids.eventLog.innerHTML = rows.map(function (row) {
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

    async function saveProfile() {
        const objResponse = await fetch(`${apiBase}/profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ uiState: getUiState() })
        });

        if (!objResponse.ok) {
            throw new Error("Unable to save Rolling Options profile.");
        }
    }

    async function flushProfileSave() {
        if (gIsApplyingState) {
            return;
        }

        if (gSaveTimer) {
            clearTimeout(gSaveTimer);
            gSaveTimer = null;
        }

        await saveProfile();
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
            void saveProfile();
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
    }

    async function loadStatus() {
        const objResponse = await fetch(`${apiBase}/status`, {
            credentials: "same-origin"
        });
        if (!objResponse.ok) {
            throw new Error("Unable to load Rolling Options status.");
        }

        const objPayload = await objResponse.json().catch(() => ({}));
        applyRuntimeStatus(objPayload?.data || {});
    }

    async function loadOpenPositions() {
        const objResponse = await fetch(`${apiBase}/open-positions`, {
            credentials: "same-origin"
        });
        if (!objResponse.ok) {
            throw new Error("Unable to load open paper positions.");
        }

        const objPayload = await objResponse.json().catch(() => ({}));
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

    async function loadServerPanels() {
        await Promise.all([
            loadStatus(),
            loadOpenPositions(),
            loadClosedPositions(),
            loadEvents()
        ]);
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
            await postJson(url, payload);
            await loadServerPanels();
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
        updateRenkoFeedVisualState();
        queueProfileSave();
        void kickRenkoCycleIfNeeded().then(function () {
            return loadServerPanels();
        }).catch(function () { return undefined; });
    });

    ids.futuresEnabled?.addEventListener("change", function () {
        updateFuturesEnabledVisualState();
        queueProfileSave();
    });

    ids.demoBalance?.addEventListener("input", function () {
        updateBalanceMetrics(gLatestOpenPositions);
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
        void kickRenkoCycleIfNeeded().then(function () {
            return loadServerPanels();
        }).catch(function () { return undefined; });
    });
    ids.renkoFeedPriceSrc?.addEventListener("change", function () {
        void kickRenkoCycleIfNeeded().then(function () {
            return loadServerPanels();
        }).catch(function () { return undefined; });
    });

    ids.lastSignal?.addEventListener("click", function () {
        void toggleManualRenkoSignal();
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
        void runServerAction(`${apiBase}/manual/exit`, {
            instrumentType: "ALL"
        });
    });

    ids.killSwitchButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/manual/exit`, {
            instrumentType: "ALL"
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
        void loadClosedPositions();
    });

    ids.clearClosedPositionsButton?.addEventListener("click", function () {
        void runServerAction(`${apiBase}/closed-positions/clear`);
    });

    [
        ids.manualFutQty,
        ids.manualFutOrderType,
        ids.manualFutAction,
        ids.futuresEnabled,
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
        ids.renkoFeedPts,
        ids.renkoFeedPriceSrc,
        ids.demoBalance,
        ids.closedFromDate,
        ids.closedToDate
    ].forEach(function (objField) {
        objField?.addEventListener("change", queueProfileSave);
        if (objField instanceof HTMLInputElement && objField.type !== "checkbox") {
            objField.addEventListener("input", queueProfileSave);
        }
    });

    ids.telegramAlertsEnabled?.addEventListener("change", queueProfileSave);
    ids.telegramEventCheckboxes.forEach(function (objCheckbox) {
        objCheckbox.addEventListener("change", queueProfileSave);
    });

    ids.closedFromDate?.addEventListener("change", function () {
        void loadClosedPositions().catch(function (objError) {
            console.error(objError);
            setStatus(objError instanceof Error ? objError.message : "Unable to load closed positions.", "danger");
        });
    });
    ids.closedToDate?.addEventListener("change", function () {
        void loadClosedPositions().catch(function (objError) {
            console.error(objError);
            setStatus(objError instanceof Error ? objError.message : "Unable to load closed positions.", "danger");
        });
    });

    loadProfile().then(function () {
        gHasLoadedProfile = true;
        queueProfileSave();
        return loadServerPanels();
    }).catch(function (objError) {
        console.error(objError);
        setStatus(objError instanceof Error ? objError.message : "Unable to load Rolling Options profile.", "danger");
        applySymbolDefaults();
        applyExpiryModeDefaults();
        updateRenkoFeedVisualState();
    });

    setInterval(function () {
        void kickRenkoCycleIfNeeded().then(function () {
            return Promise.all([loadStatus(), loadOpenPositions(), loadClosedPositions(), loadEvents()]);
        }).catch(function (objError) {
            console.error(objError);
            setStatus(objError instanceof Error ? objError.message : "Unable to refresh Rolling Options data.", "danger");
        });
    }, 15000);
})();
