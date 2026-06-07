(function () {
    const PAYOFF_SL_ALL_LEGS_KEY = "__all_legs__";

    function readBooleanPreference(storageKey) {
        try {
            return window.localStorage.getItem(storageKey) === "1";
        }
        catch (_objError) {
            return false;
        }
    }

    function writeBooleanPreference(storageKey, value) {
        try {
            window.localStorage.setItem(storageKey, value ? "1" : "0");
        }
        catch (_objError) {
        }
    }

    function isRenkoChangeEvent(row) {
        const eventType = String(row?.eventType || "").trim().toLowerCase();
        const title = String(row?.title || "").trim().toLowerCase();
        return eventType === "renko_change_detected" || title === "renko change detected";
    }

    function isRenkoSkippedEvent(row) {
        const title = String(row?.title || "").trim().toLowerCase();
        return title === "renko green skipped" || title === "renko red skipped";
    }

    function getVisibleEvents(rows, options) {
        const arrRows = Array.isArray(rows) ? rows : [];
        const objOptions = options && typeof options === "object" ? options : {};
        const bHideRenkoEvents = Boolean(objOptions.hideRenkoEvents);
        const bHideRenkoSkippedEvents = Boolean(objOptions.hideRenkoSkippedEvents);

        return arrRows.filter(function (row) {
            if (bHideRenkoEvents && isRenkoChangeEvent(row)) {
                return false;
            }
            if (bHideRenkoSkippedEvents && isRenkoSkippedEvent(row)) {
                return false;
            }
            return true;
        });
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
            currentDate.setDate(currentDate.getDate() + (currentDayOfWeek >= 2 ? daysToThisFriday + 7 : daysToThisFriday));
            return currentDate;
        }
        if (modeValue === "5") {
            const daysToThisFriday = (5 - currentDayOfWeek + 7) % 7;
            currentDate.setDate(currentDate.getDate() + (currentDayOfWeek >= 2 ? daysToThisFriday + 14 : daysToThisFriday + 7));
            return currentDate;
        }
        if (modeValue === "6") {
            const lastFridayOfMonth = getLastFridayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
            const lastFridayOfNextMonth = getLastFridayOfMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);
            return currentDate.getDate() > 15 ? lastFridayOfNextMonth : lastFridayOfMonth;
        }

        return currentDate;
    }

    function formatDateTime(value) {
        const objDate = value ? new Date(value) : null;
        if (!(objDate instanceof Date) || Number.isNaN(objDate.getTime())) {
            return "-";
        }

        return objDate.toLocaleString("en-IN", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });
    }

    function normalizePayoffSlCheckpointPrices(values, legacyValue) {
        const arrRaw = Array.isArray(values)
            ? values
            : (Number.isFinite(Number(legacyValue)) ? [Number(legacyValue)] : []);

        return arrRaw
            .map(function (value) { return Number(value); })
            .filter(function (value) { return Number.isFinite(value); });
    }

    function normalizePayoffSlSelectedLegKey(value) {
        const normalized = String(value || "").trim();
        return normalized || PAYOFF_SL_ALL_LEGS_KEY;
    }

    function normalizePayoffProjectionDays(value) {
        const normalized = Number(value);
        return Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
    }

    function normalizePayoffSlCheckpoints(checkpoints, legacyValues) {
        const arrRaw = Array.isArray(checkpoints)
            ? checkpoints
            : [];
        const arrNormalized = arrRaw.map(function (checkpoint) {
            const objCheckpoint = checkpoint && typeof checkpoint === "object"
                ? checkpoint
                : null;
            const price = Number(objCheckpoint?.price);
            if (!Number.isFinite(price)) {
                return null;
            }
            return {
                legKey: normalizePayoffSlSelectedLegKey(objCheckpoint?.legKey),
                price
            };
        }).filter(Boolean);

        if (arrNormalized.length > 0) {
            return arrNormalized
                .filter(function (checkpoint, index, values) {
                    return values.findIndex(function (candidate) {
                        return candidate.legKey === checkpoint.legKey && Math.abs(candidate.price - checkpoint.price) < 0.01;
                    }) === index;
                })
                .sort(function (left, right) {
                    if (left.legKey === right.legKey) {
                        return left.price - right.price;
                    }
                    return left.legKey.localeCompare(right.legKey);
                });
        }

        return normalizePayoffSlCheckpointPrices(legacyValues)
            .map(function (price) {
                return {
                    legKey: PAYOFF_SL_ALL_LEGS_KEY,
                    price
                };
            });
    }

    window.OptionyzeRollingStrangleShared = {
        PAYOFF_SL_ALL_LEGS_KEY,
        readBooleanPreference,
        writeBooleanPreference,
        isRenkoChangeEvent,
        isRenkoSkippedEvent,
        getVisibleEvents,
        formatDateInputValue,
        resolveExpiryDateByMode,
        formatDateTime,
        normalizePayoffSlCheckpointPrices,
        normalizePayoffSlSelectedLegKey,
        normalizePayoffProjectionDays,
        normalizePayoffSlCheckpoints
    };
})();
