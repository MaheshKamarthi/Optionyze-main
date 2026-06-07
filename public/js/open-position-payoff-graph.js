(function (globalScope) {

    function toNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function guessLotSize(row) {
        const text = `${String(row?.contractName || "")} ${String(row?.symbol || "")}`.toUpperCase();
        return text.includes("ETH") ? 0.01 : 0.001;
    }

    function parseOptionDescriptor(row) {
        const optionSideRaw = String(row?.optionSide || "").trim().toUpperCase();
        const strikeRaw = toNumber(row?.strike);
        if ((optionSideRaw === "CE" || optionSideRaw === "PE") && Number.isFinite(strikeRaw)) {
            return {
                optionSide: optionSideRaw,
                strike: strikeRaw
            };
        }

        const contractName = String(row?.contractName || "").trim().toUpperCase();
        if (!contractName) {
            return null;
        }

        const segments = contractName.split(/[-\s]+/).filter(Boolean);
        const sideToken = segments[0] === "P" || segments.includes("PE")
            ? "PE"
            : ((segments[0] === "C" || segments.includes("CE")) ? "CE" : "");
        if (!sideToken) {
            return null;
        }

        const strikeToken = segments.find(function (segment, index) {
            return index > 0 && Number.isFinite(Number(segment));
        });
        const strike = toNumber(strikeToken);
        if (!Number.isFinite(strike)) {
            return null;
        }

        return {
            optionSide: sideToken,
            strike
        };
    }

    function toIsoDateString(dateValue) {
        if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
            return "";
        }
        const year = String(dateValue.getUTCFullYear());
        const month = String(dateValue.getUTCMonth() + 1).padStart(2, "0");
        const day = String(dateValue.getUTCDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function parseExpiryDateValue(value) {
        const text = String(value || "").trim();
        if (!text) {
            return "";
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            return text;
        }

        let match = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
        if (match) {
            return `${match[3]}-${match[2]}-${match[1]}`;
        }
        match = text.match(/^(\d{2})(\d{2})(\d{2})$/);
        if (match) {
            return `20${match[3]}-${match[2]}-${match[1]}`;
        }
        match = text.match(/^(\d{2})[-/](\d{2})[-/](\d{2})$/);
        if (match) {
            return `20${match[3]}-${match[2]}-${match[1]}`;
        }

        const dateValue = new Date(text);
        return toIsoDateString(dateValue);
    }

    function parseExpiryDateFromContractName(contractName) {
        const text = String(contractName || "").trim().toUpperCase();
        if (!text) {
            return "";
        }
        const segments = text.split(/[-_\s]+/).filter(Boolean).reverse();
        for (const segment of segments) {
            const parsed = parseExpiryDateValue(segment);
            if (parsed) {
                return parsed;
            }
        }
        return "";
    }

    function resolveExpiryDate(row) {
        const directValue = parseExpiryDateValue(row?.expiryDate);
        if (directValue) {
            return directValue;
        }
        const metadataResolved = parseExpiryDateValue(row?.metadata?.resolvedExpiryDate);
        if (metadataResolved) {
            return metadataResolved;
        }
        const metadataValue = parseExpiryDateValue(row?.metadata?.expiryDate || row?.metadata?.requestedExpiryDate);
        if (metadataValue) {
            return metadataValue;
        }
        return parseExpiryDateFromContractName(row?.contractName || row?.symbol || "");
    }

    function detectInstrumentType(row) {
        const instrumentType = String(row?.instrumentType || "").trim().toUpperCase();
        if (instrumentType === "OPTION" || instrumentType === "FUTURE") {
            return instrumentType;
        }
        return parseOptionDescriptor(row) ? "OPTION" : "FUTURE";
    }

    function buildLegKey(row, index) {
        const candidates = [
            row?.legKey,
            row?.positionId,
            row?.importId,
            row?.id
        ].map(function (value) {
            return String(value || "").trim();
        }).filter(Boolean);

        if (candidates.length) {
            return candidates[0];
        }

        const contractName = String(row?.contractName || row?.symbol || "").trim();
        const action = String(row?.action || row?.side || "").trim().toUpperCase() || "BUY";
        return `${contractName || "LEG"}:${action}:${index + 1}`;
    }

    function buildLegLabel(row, instrumentType, action, index) {
        const contractName = String(row?.contractName || row?.symbol || "").trim();
        if (contractName) {
            return `${action} ${contractName}`;
        }
        return `${action} ${instrumentType === "OPTION" ? "Option" : "Future"} ${index + 1}`;
    }

    function normalizeRows(rows) {
        return (Array.isArray(rows) ? rows : []).map(function (row, index) {
            const instrumentType = detectInstrumentType(row);
            const optionDescriptor = instrumentType === "OPTION" ? parseOptionDescriptor(row) : null;
            const actionRaw = String(row?.action || row?.side || "").trim().toUpperCase();
            const action = actionRaw === "SELL" ? "SELL" : "BUY";
            const qty = Math.max(0, toNumber(row?.qty));
            const lotSize = Math.max(0, toNumber(row?.lotSize));
            const entryPrice = toNumber(row?.entryPrice);
            const markPrice = toNumber(row?.markPrice);
            const charges = Math.abs(toNumber(row?.charges));

            if (!(qty > 0) || !(Number.isFinite(entryPrice) && entryPrice >= 0)) {
                return null;
            }

            return {
                instrumentType,
                action,
                qty,
                lotSize: lotSize > 0 ? lotSize : guessLotSize(row),
                entryPrice,
                strike: optionDescriptor?.strike ?? NaN,
                optionSide: optionDescriptor?.optionSide ?? "",
                charges: Number.isFinite(charges) ? charges : 0,
                markPrice,
                referencePrice: toNumber(row?.metadata?.entrySpotPrice),
                expiryDate: resolveExpiryDate(row),
                contractName: String(row?.contractName || row?.symbol || "").trim(),
                legKey: buildLegKey(row, index),
                legLabel: buildLegLabel(row, instrumentType, action, index)
            };
        }).filter(function (row) {
            if (!row || !(row.lotSize > 0)) {
                return false;
            }
            if (row.instrumentType === "OPTION") {
                return (row.optionSide === "CE" || row.optionSide === "PE") && Number.isFinite(row.strike);
            }
            return true;
        });
    }

    function getReferencePrice(rows, explicitReferencePrice) {
        const explicit = toNumber(explicitReferencePrice);
        if (Number.isFinite(explicit) && explicit > 0) {
            return explicit;
        }

        const anchors = rows.flatMap(function (row) {
            const values = [];
            if (Number.isFinite(row.referencePrice) && row.referencePrice > 0) {
                values.push(row.referencePrice);
            }
            if (Number.isFinite(row.strike) && row.strike > 0) {
                values.push(row.strike);
            }
            if (row.instrumentType === "FUTURE" && Number.isFinite(row.entryPrice) && row.entryPrice > 0) {
                values.push(row.entryPrice);
            }
            return values;
        });
        if (!anchors.length) {
            return NaN;
        }
        return anchors.reduce(function (sum, value) {
            return sum + value;
        }, 0) / anchors.length;
    }

    function getPriceRange(rows, referencePrice) {
        const anchors = rows.flatMap(function (row) {
            const values = [];
            if (Number.isFinite(row.strike) && row.strike > 0) {
                values.push(row.strike);
            }
            if (Number.isFinite(row.referencePrice) && row.referencePrice > 0) {
                values.push(row.referencePrice);
            }
            if (row.instrumentType === "FUTURE" && Number.isFinite(row.entryPrice) && row.entryPrice > 0) {
                values.push(row.entryPrice);
            }
            return values;
        }).filter(function (value) {
            return Number.isFinite(value) && value > 0;
        });

        const fallbackReference = Number.isFinite(referencePrice) && referencePrice > 0 ? referencePrice : (anchors[0] || 100);
        const minAnchor = anchors.length ? Math.min.apply(null, anchors) : fallbackReference;
        const maxAnchor = anchors.length ? Math.max.apply(null, anchors) : fallbackReference;
        const span = Math.max((maxAnchor - minAnchor), fallbackReference * 0.2, 50);
        const minPrice = Math.max(0, Math.min(minAnchor, fallbackReference) - span * 0.6);
        const maxPrice = Math.max(maxAnchor, fallbackReference) + span * 0.6;
        return {
            minPrice,
            maxPrice: Math.max(minPrice + 1, maxPrice)
        };
    }

    function getIntrinsicValue(optionSide, strike, price) {
        return optionSide === "PE"
            ? Math.max(strike - price, 0)
            : Math.max(price - strike, 0);
    }

    function normalCdf(value) {
        const sign = value < 0 ? -1 : 1;
        const absValue = Math.abs(value) / Math.sqrt(2);
        const t = 1 / (1 + 0.3275911 * absValue);
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-(absValue * absValue));
        return 0.5 * (1 + sign * erf);
    }

    function priceOptionBlackScholes(optionSide, spot, strike, timeYears, volatility, rate) {
        const safeSpot = Number(spot);
        const safeStrike = Number(strike);
        const safeTime = Math.max(0, Number(timeYears || 0));
        const safeVolatility = Math.max(0.0001, Number(volatility || 0));
        const safeRate = Number.isFinite(Number(rate)) ? Number(rate) : 0;
        const intrinsic = getIntrinsicValue(optionSide, safeStrike, safeSpot);

        if (!(safeSpot > 0) || !(safeStrike > 0) || !(safeTime > 0)) {
            return intrinsic;
        }

        const denominator = safeVolatility * Math.sqrt(safeTime);
        if (!(denominator > 0)) {
            return intrinsic;
        }

        const d1 = (Math.log(safeSpot / safeStrike) + (safeRate + ((safeVolatility * safeVolatility) / 2)) * safeTime) / denominator;
        const d2 = d1 - denominator;
        if (optionSide === "PE") {
            return Math.max(0, (safeStrike * Math.exp(-safeRate * safeTime) * normalCdf(-d2)) - (safeSpot * normalCdf(-d1)));
        }
        return Math.max(0, (safeSpot * normalCdf(d1)) - (safeStrike * Math.exp(-safeRate * safeTime) * normalCdf(d2)));
    }

    function estimateImpliedVolatility(optionSide, spot, strike, timeYears, marketPrice) {
        const targetPrice = Number(marketPrice);
        const intrinsic = getIntrinsicValue(optionSide, strike, spot);
        if (!(spot > 0) || !(strike > 0) || !(timeYears > 0) || !(targetPrice >= 0)) {
            return NaN;
        }

        const adjustedTarget = Math.max(targetPrice, intrinsic + 0.0001);
        let low = 0.0001;
        let high = 5;
        let highPrice = priceOptionBlackScholes(optionSide, spot, strike, timeYears, high, 0);
        while (highPrice < adjustedTarget && high < 12) {
            high *= 1.5;
            highPrice = priceOptionBlackScholes(optionSide, spot, strike, timeYears, high, 0);
        }

        for (let index = 0; index < 72; index += 1) {
            const mid = (low + high) / 2;
            const midPrice = priceOptionBlackScholes(optionSide, spot, strike, timeYears, mid, 0);
            if (Math.abs(midPrice - adjustedTarget) < 0.0001) {
                return mid;
            }
            if (midPrice > adjustedTarget) {
                high = mid;
            }
            else {
                low = mid;
            }
        }
        return (low + high) / 2;
    }

    function getRemainingTimeYears(expiryDate, nowMs) {
        const parsed = parseExpiryDateValue(expiryDate);
        if (!parsed) {
            return 0;
        }
        const expiryMs = Date.parse(`${parsed}T23:59:59.999Z`);
        if (!Number.isFinite(expiryMs)) {
            return 0;
        }
        return Math.max(0, (expiryMs - nowMs) / (365 * 24 * 60 * 60 * 1000));
    }

    function buildLegPricingContext(row, referencePrice, projectionDays, nowMs) {
        if (row.instrumentType !== "OPTION") {
            return null;
        }

        const currentSpot = Number(referencePrice);
        const remainingTimeYears = getRemainingTimeYears(row.expiryDate, nowMs);
        const projectedTimeYears = Math.max(0, remainingTimeYears - (Math.max(0, projectionDays) / 365));
        const currentOptionPrice = Number.isFinite(row.markPrice) && row.markPrice >= 0
            ? row.markPrice
            : row.entryPrice;
        const intrinsicNow = getIntrinsicValue(row.optionSide, row.strike, currentSpot);
        const impliedVolatility = remainingTimeYears > 0
            ? estimateImpliedVolatility(
                row.optionSide,
                currentSpot,
                row.strike,
                remainingTimeYears,
                Math.max(currentOptionPrice, intrinsicNow + 0.0001)
            )
            : NaN;

        return {
            currentSpot,
            currentOptionPrice,
            remainingTimeYears,
            projectedTimeYears,
            impliedVolatility
        };
    }

    function priceProjectedOption(row, price, pricingContext) {
        const intrinsic = getIntrinsicValue(row.optionSide, row.strike, price);
        if (!pricingContext) {
            return intrinsic;
        }
        if (!(pricingContext.projectedTimeYears > 0) || !Number.isFinite(pricingContext.impliedVolatility)) {
            return intrinsic;
        }
        return priceOptionBlackScholes(
            row.optionSide,
            price,
            row.strike,
            pricingContext.projectedTimeYears,
            pricingContext.impliedVolatility,
            0
        );
    }

    function calculateLegPayoff(row, price, pricingContext) {
        const direction = row.action === "SELL" ? -1 : 1;
        const multiplier = row.qty * row.lotSize;

        if (row.instrumentType === "FUTURE") {
            return direction * (price - row.entryPrice) * multiplier;
        }

        const optionPrice = priceProjectedOption(row, price, pricingContext);
        return (direction > 0 ? (optionPrice - row.entryPrice) : (row.entryPrice - optionPrice)) * multiplier;
    }

    function buildPayoffSeries(rows, referencePrice, modelOptions) {
        const priceRange = getPriceRange(rows, referencePrice);
        const pointCount = 121;
        const step = (priceRange.maxPrice - priceRange.minPrice) / (pointCount - 1);
        const projectionDays = Math.max(0, Number(modelOptions?.projectionDays || 0));
        const nowMs = Number(modelOptions?.nowMs || Date.now());
        const pricingContextByLegKey = new Map(rows.map(function (row) {
            return [row.legKey, buildLegPricingContext(row, referencePrice, projectionDays, nowMs)];
        }));
        const legSeries = rows.map(function (row) {
            const points = [];
            const pricingContext = pricingContextByLegKey.get(row.legKey) || null;
            for (let index = 0; index < pointCount; index += 1) {
                const price = priceRange.minPrice + (step * index);
                points.push({
                    price,
                    pnl: calculateLegPayoff(row, price, pricingContext) - Math.abs(Number(row.charges || 0))
                });
            }
            return {
                legKey: row.legKey,
                legLabel: row.legLabel,
                contractName: row.contractName,
                action: row.action,
                instrumentType: row.instrumentType,
                points
            };
        });
        const points = [];

        for (let index = 0; index < pointCount; index += 1) {
            const price = priceRange.minPrice + (step * index);
            const pnl = legSeries.reduce(function (sum, series) {
                const point = series.points[index];
                return sum + (Number.isFinite(point?.pnl) ? point.pnl : 0);
            }, 0);
            points.push({
                price,
                pnl
            });
        }

        return {
            points,
            legSeries,
            minPrice: priceRange.minPrice,
            maxPrice: priceRange.maxPrice,
            pricingContextByLegKey
        };
    }

    function interpolateZeroCrossing(leftPoint, rightPoint) {
        const slope = rightPoint.pnl - leftPoint.pnl;
        if (!Number.isFinite(slope) || Math.abs(slope) < 1e-9) {
            return leftPoint.price;
        }
        return leftPoint.price + ((0 - leftPoint.pnl) * (rightPoint.price - leftPoint.price) / slope);
    }

    function getLossSegments(points) {
        if (!Array.isArray(points) || !points.length) {
            return [];
        }

        const segments = [];
        let activeStart = null;

        for (let index = 0; index < points.length - 1; index += 1) {
            const currentPoint = points[index];
            const nextPoint = points[index + 1];

            if (currentPoint.pnl < 0 && nextPoint.pnl >= 0) {
                segments.push({
                    start: activeStart,
                    end: interpolateZeroCrossing(currentPoint, nextPoint)
                });
                activeStart = null;
            }
            else if (currentPoint.pnl >= 0 && nextPoint.pnl < 0) {
                activeStart = interpolateZeroCrossing(currentPoint, nextPoint);
            }
        }

        if (points[0].pnl < 0) {
            if (segments.length > 0) {
                segments[0].start = null;
            }
            else {
                segments.push({
                    start: null,
                    end: null
                });
            }
        }

        if (points[points.length - 1].pnl < 0) {
            const lastSegment = segments[segments.length - 1];
            if (!lastSegment || lastSegment.end !== null) {
                segments.push({
                    start: activeStart,
                    end: null
                });
            }
        }

        return segments;
    }

    function getBreakEvenPrices(points) {
        const breakEvens = [];
        for (let index = 0; index < points.length - 1; index += 1) {
            const currentPoint = points[index];
            const nextPoint = points[index + 1];
            if (currentPoint.pnl === 0) {
                breakEvens.push(currentPoint.price);
            }
            if ((currentPoint.pnl < 0 && nextPoint.pnl > 0) || (currentPoint.pnl > 0 && nextPoint.pnl < 0)) {
                breakEvens.push(interpolateZeroCrossing(currentPoint, nextPoint));
            }
        }
        return breakEvens.filter(function (value, index, values) {
            return values.findIndex(function (candidate) {
                return Math.abs(candidate - value) < 1e-4;
            }) === index;
        });
    }

    function getStrikeMarkers(rows) {
        return rows
            .filter(function (row) {
                return row.instrumentType === "OPTION" && Number.isFinite(row.strike);
            })
            .map(function (row) {
                return {
                    strike: row.strike,
                    label: `${row.optionSide} ${formatPrice(row.strike)}`
                };
            })
            .filter(function (marker, index, markers) {
                return markers.findIndex(function (candidate) {
                    return candidate.label === marker.label;
                }) === index;
            })
            .sort(function (left, right) {
                return left.strike - right.strike;
            });
    }

    function buildAreaPath(points, baselineY, mapX, mapY) {
        if (!points.length) {
            return "";
        }

        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];
        const linePath = points.map(function (point) {
            return `L ${mapX(point.price).toFixed(2)} ${mapY(point.pnl).toFixed(2)}`;
        }).join(" ");

        return `M ${mapX(firstPoint.price).toFixed(2)} ${baselineY.toFixed(2)} ${linePath} L ${mapX(lastPoint.price).toFixed(2)} ${baselineY.toFixed(2)} Z`;
    }

    function findNearestPoint(points, price) {
        if (!Array.isArray(points) || !points.length || !Number.isFinite(price)) {
            return null;
        }

        return points.reduce(function (bestPoint, currentPoint) {
            if (!bestPoint) {
                return currentPoint;
            }
            return Math.abs(currentPoint.price - price) < Math.abs(bestPoint.price - price)
                ? currentPoint
                : bestPoint;
        }, null);
    }

    function formatPrice(value) {
        if (!Number.isFinite(value)) {
            return "-";
        }
        if (Math.abs(value) >= 1000) {
            return value.toFixed(0);
        }
        return value.toFixed(2);
    }

    function formatPnl(value) {
        if (!Number.isFinite(value)) {
            return "-";
        }
        return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
    }

    function formatDayCount(value) {
        if (!Number.isFinite(value)) {
            return "-";
        }
        if (Math.abs(value) < 0.05) {
            return "0d";
        }
        return value >= 10 ? `${value.toFixed(0)}d` : `${value.toFixed(1)}d`;
    }

    function getLegStrokeColor(index) {
        const colors = [
            "#60a5fa",
            "#f472b6",
            "#f59e0b",
            "#a78bfa",
            "#34d399",
            "#fb7185"
        ];
        return colors[index % colors.length];
    }

    function normalizeSlCheckpointState(checkpoints, legacyPrices, fallbackLegKey) {
        const defaultLegKey = String(fallbackLegKey || "__all_legs__");
        const arrRaw = Array.isArray(checkpoints)
            ? checkpoints
            : [];
        const arrNormalized = arrRaw.map(function (checkpoint) {
            const objCheckpoint = checkpoint && typeof checkpoint === "object"
                ? checkpoint
                : null;
            const price = toNumber(objCheckpoint?.price);
            if (!Number.isFinite(price)) {
                return null;
            }
            return {
                legKey: String(objCheckpoint?.legKey || defaultLegKey).trim() || defaultLegKey,
                price
            };
        }).filter(Boolean);

        if (arrNormalized.length > 0) {
            return arrNormalized;
        }

        return (Array.isArray(legacyPrices) ? legacyPrices : [])
            .map(function (price) { return toNumber(price); })
            .filter(function (price) { return Number.isFinite(price); })
            .map(function (price) {
                return {
                    legKey: defaultLegKey,
                    price
                };
            });
    }

    function describeLossSegments(segments) {
        if (!segments.length) {
            return "No loss in the plotted range.";
        }

        if (segments.length === 1) {
            const segment = segments[0];
            if (segment.start === null && segment.end === null) {
                return "Loss across the plotted range.";
            }
            if (segment.start === null) {
                return `Loss starts below ${formatPrice(segment.end)}.`;
            }
            if (segment.end === null) {
                return `Loss starts above ${formatPrice(segment.start)}.`;
            }
            return `Loss starts between ${formatPrice(segment.start)} and ${formatPrice(segment.end)}.`;
        }

        const segmentLabels = segments.map(function (segment) {
            if (segment.start === null && segment.end !== null) {
                return `below ${formatPrice(segment.end)}`;
            }
            if (segment.start !== null && segment.end === null) {
                return `above ${formatPrice(segment.start)}`;
            }
            return `between ${formatPrice(segment.start)} and ${formatPrice(segment.end)}`;
        });
        return `Loss zones: ${segmentLabels.join(", ")}.`;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    }

    function bindHover(container, graphConfig) {
        const chart = container.querySelector(".rolling-demo-payoff-chart");
        const svg = container.querySelector(".rolling-demo-payoff-svg");
        const tooltip = container.querySelector(".rolling-demo-payoff-tooltip");
        const hoverGroup = container.querySelector(".rolling-demo-payoff-hover");
        const hoverLine = container.querySelector(".rolling-demo-payoff-hover-line");
        const hoverDot = container.querySelector(".rolling-demo-payoff-hover-dot");
        const hoverPrice = container.querySelector(".rolling-demo-payoff-tooltip-price");
        const hoverPnl = container.querySelector(".rolling-demo-payoff-tooltip-pnl");
        const hoverPanelPrice = container.querySelector(".rolling-demo-payoff-hover-price-value");
        const hoverPanelPnl = container.querySelector(".rolling-demo-payoff-hover-pnl-value");
        if (!(chart instanceof HTMLElement) || !(svg instanceof SVGElement) || !(tooltip instanceof HTMLElement)
            || !(hoverGroup instanceof SVGGElement) || !(hoverLine instanceof SVGLineElement)
            || !(hoverDot instanceof SVGCircleElement) || !(hoverPrice instanceof HTMLElement)
            || !(hoverPnl instanceof HTMLElement)) {
            return;
        }

        const points = graphConfig.points;
        const pointStep = points.length > 1 ? (points[1].price - points[0].price) : 1;

        function hideHover() {
            tooltip.hidden = true;
            hoverGroup.setAttribute("display", "none");
        }

        function updateHover(clientX, clientY) {
            const rect = svg.getBoundingClientRect();
            if (!(rect.width > 0 && rect.height > 0)) {
                hideHover();
                return;
            }

            const xInViewBox = ((clientX - rect.left) / rect.width) * graphConfig.width;
            const clampedX = clamp(xInViewBox, graphConfig.paddingLeft, graphConfig.width - graphConfig.paddingRight);
            const hoveredPrice = graphConfig.minPrice
                + ((clampedX - graphConfig.paddingLeft) / (graphConfig.width - graphConfig.paddingLeft - graphConfig.paddingRight))
                * (graphConfig.maxPrice - graphConfig.minPrice);
            const pointIndex = clamp(Math.round((hoveredPrice - graphConfig.minPrice) / pointStep), 0, points.length - 1);
            const point = points[pointIndex];
            const pointX = graphConfig.mapX(point.price);
            const pointY = graphConfig.mapY(point.pnl);

            hoverGroup.setAttribute("display", "");
            hoverLine.setAttribute("x1", pointX.toFixed(2));
            hoverLine.setAttribute("x2", pointX.toFixed(2));
            hoverLine.setAttribute("y1", String(graphConfig.paddingTop));
            hoverLine.setAttribute("y2", String(graphConfig.height - graphConfig.paddingBottom));
            hoverDot.setAttribute("cx", pointX.toFixed(2));
            hoverDot.setAttribute("cy", pointY.toFixed(2));
            hoverPrice.textContent = `Spot: ${formatPrice(point.price)}`;
            hoverPnl.textContent = `Payoff: ${formatPnl(point.pnl)}`;
            hoverPnl.classList.toggle("negative", point.pnl < 0);
            if (hoverPanelPrice instanceof HTMLElement) {
                hoverPanelPrice.textContent = formatPrice(point.price);
            }
            if (hoverPanelPnl instanceof HTMLElement) {
                hoverPanelPnl.textContent = formatPnl(point.pnl);
                hoverPanelPnl.classList.toggle("negative", point.pnl < 0);
            }
            tooltip.hidden = false;

            const chartRect = chart.getBoundingClientRect();
            const tooltipLeft = clamp(clientX - chartRect.left + 12, 8, Math.max(8, chartRect.width - tooltip.offsetWidth - 8));
            const tooltipTop = clamp(clientY - chartRect.top - tooltip.offsetHeight - 12, 8, Math.max(8, chartRect.height - tooltip.offsetHeight - 8));
            tooltip.style.left = `${tooltipLeft}px`;
            tooltip.style.top = `${tooltipTop}px`;
        }

        chart.addEventListener("mouseleave", hideHover);
        chart.addEventListener("mousemove", function (event) {
            updateHover(event.clientX, event.clientY);
        });
        chart.addEventListener("touchstart", function (event) {
            if (event.touches[0]) {
                updateHover(event.touches[0].clientX, event.touches[0].clientY);
            }
        }, { passive: true });
        chart.addEventListener("touchmove", function (event) {
            if (event.touches[0]) {
                updateHover(event.touches[0].clientX, event.touches[0].clientY);
            }
        }, { passive: true });
        chart.addEventListener("touchend", hideHover, { passive: true });
    }

    function bindSlCheckpoint(container, graphConfig) {
        const chart = container.querySelector(".rolling-demo-payoff-chart");
        const clearButton = container.querySelector(".rolling-demo-payoff-sl-clear");
        const removeButtons = Array.from(container.querySelectorAll(".rolling-demo-payoff-sl-remove"));
        const selectorButtons = Array.from(container.querySelectorAll(".rolling-demo-payoff-leg-selector-btn"));
        if (!(chart instanceof HTMLElement) || typeof graphConfig?.onSlCheckpointChange !== "function") {
            return;
        }

        function resolvePriceFromClientX(clientX) {
            const rect = chart.getBoundingClientRect();
            if (!(rect.width > 0)) {
                return null;
            }
            const xInViewBox = ((clientX - rect.left) / rect.width) * graphConfig.width;
            const clampedX = clamp(xInViewBox, graphConfig.paddingLeft, graphConfig.width - graphConfig.paddingRight);
            const price = graphConfig.minPrice
                + ((clampedX - graphConfig.paddingLeft) / (graphConfig.width - graphConfig.paddingLeft - graphConfig.paddingRight))
                * (graphConfig.maxPrice - graphConfig.minPrice);
            return Number(price.toFixed(2));
        }

        chart.addEventListener("click", function (event) {
            const vPrice = resolvePriceFromClientX(event.clientX);
            if (!Number.isFinite(vPrice)) {
                return;
            }
            const arrNextCheckpoints = Array.isArray(graphConfig.slCheckpoints)
                ? [...graphConfig.slCheckpoints]
                : [];
            arrNextCheckpoints.push({
                legKey: String(graphConfig.selectedSlLegKey || "__all_legs__"),
                price: vPrice
            });
            graphConfig.onSlCheckpointChange(arrNextCheckpoints);
        });

        if (clearButton instanceof HTMLButtonElement) {
            clearButton.addEventListener("click", function () {
                graphConfig.onSlCheckpointChange([]);
            });
        }

        removeButtons.forEach(function (button) {
            if (!(button instanceof HTMLButtonElement)) {
                return;
            }
            button.addEventListener("click", function () {
                const vIndex = Number(button.dataset.slIndex);
                if (!Number.isInteger(vIndex) || vIndex < 0) {
                    return;
                }
                const arrNextCheckpoints = (Array.isArray(graphConfig.slCheckpoints) ? graphConfig.slCheckpoints : [])
                    .filter(function (_value, index) {
                        return index !== vIndex;
                    });
                graphConfig.onSlCheckpointChange(arrNextCheckpoints);
            });
        });

        selectorButtons.forEach(function (button) {
            if (!(button instanceof HTMLButtonElement) || typeof graphConfig?.onSlSelectedLegChange !== "function") {
                return;
            }
            button.addEventListener("click", function () {
                graphConfig.onSlSelectedLegChange(String(button.dataset.legKey || "__all_legs__"));
            });
        });
    }

    function bindProjectionControls(container, graphConfig) {
        const rangeInput = container.querySelector(".rolling-demo-payoff-projection-range");
        const presetButtons = Array.from(container.querySelectorAll(".rolling-demo-payoff-projection-preset"));
        if (!(rangeInput instanceof HTMLInputElement) || typeof graphConfig?.onProjectionDaysChange !== "function") {
            return;
        }

        const scale = Math.max(1, Number(graphConfig.projectionScale || 4));
        rangeInput.addEventListener("input", function () {
            const nextDays = Number(rangeInput.value) / scale;
            graphConfig.onProjectionDaysChange(nextDays);
        });

        presetButtons.forEach(function (button) {
            if (!(button instanceof HTMLButtonElement)) {
                return;
            }
            button.addEventListener("click", function () {
                const nextDays = Number(button.dataset.projectionDays);
                if (!Number.isFinite(nextDays)) {
                    return;
                }
                graphConfig.onProjectionDaysChange(nextDays);
            });
        });
    }

    function render(container, rows, options) {
        if (!(container instanceof HTMLElement)) {
            return;
        }

        const normalizedRows = normalizeRows(rows);
        if (!normalizedRows.length) {
            container.innerHTML = `<div class="rolling-demo-payoff-empty">${escapeHtml(options?.emptyMessage || "Payoff graph appears when open legs are available.")}</div>`;
            return;
        }

        const referencePrice = getReferencePrice(normalizedRows, options?.referencePrice);
        const projectionScale = 4;
        const maxProjectionDays = normalizedRows.reduce(function (bestValue, row) {
            if (row.instrumentType !== "OPTION") {
                return bestValue;
            }
            return Math.max(bestValue, getRemainingTimeYears(row.expiryDate, Date.now()) * 365);
        }, 0);
        const projectionDays = clamp(
            Math.max(0, Number(options?.projectionDays || 0)),
            0,
            Math.max(0, maxProjectionDays)
        );
        const series = buildPayoffSeries(normalizedRows, referencePrice, {
            projectionDays,
            nowMs: Date.now()
        });
        const points = series.points;
        const vAllLegsKey = String(options?.allLegsKey || "__all_legs__");
        const losses = getLossSegments(points);
        const breakEvens = getBreakEvenPrices(points);
        const strikeMarkers = getStrikeMarkers(normalizedRows);
        const currentPoint = findNearestPoint(points, referencePrice);
        const yValues = points
            .map(function (point) { return point.pnl; })
            .concat(series.legSeries.flatMap(function (entry) {
                return entry.points.map(function (point) { return point.pnl; });
            }))
            .concat(0);
        const yMin = Math.min.apply(null, yValues);
        const yMax = Math.max.apply(null, yValues);
        const ySpan = Math.max(yMax - yMin, 1);
        const yPadding = ySpan * 0.12;
        const graphMinY = yMin - yPadding;
        const graphMaxY = yMax + yPadding;
        const width = 720;
        const height = 280;
        const paddingLeft = 48;
        const paddingRight = 16;
        const paddingTop = 22;
        const paddingBottom = 34;
        const innerWidth = width - paddingLeft - paddingRight;
        const innerHeight = height - paddingTop - paddingBottom;
        const mapX = function (price) {
            return paddingLeft + ((price - series.minPrice) / (series.maxPrice - series.minPrice)) * innerWidth;
        };
        const mapY = function (pnl) {
            return paddingTop + ((graphMaxY - pnl) / (graphMaxY - graphMinY)) * innerHeight;
        };
        const legSeries = series.legSeries.map(function (entry, index) {
            const color = getLegStrokeColor(index);
            return {
                ...entry,
                color,
                polylinePoints: entry.points.map(function (point) {
                    return `${mapX(point.price).toFixed(2)},${mapY(point.pnl).toFixed(2)}`;
                }).join(" ")
            };
        });
        const legSeriesMap = new Map(legSeries.map(function (entry) {
            return [entry.legKey, entry];
        }));
        const polylinePoints = points.map(function (point) {
            return `${mapX(point.price).toFixed(2)},${mapY(point.pnl).toFixed(2)}`;
        }).join(" ");
        const zeroLineY = mapY(0);
        const referenceLineX = Number.isFinite(referencePrice) ? mapX(referencePrice) : null;
        const areaPath = buildAreaPath(points, zeroLineY, mapX, mapY);
        const currentPnlText = currentPoint ? formatPnl(currentPoint.pnl) : "-";
        const title = String(options?.title || "Open Position Payoff");
        const subtitle = String(options?.subtitle || "Combined expiry payoff for the current open legs.");
        const projectionLabel = maxProjectionDays <= 0
            ? "No option expiry data"
            : (projectionDays <= 0.01
                ? "Today"
                : (projectionDays >= (maxProjectionDays - 0.01)
                    ? `Expiry (${formatDayCount(maxProjectionDays)})`
                    : `${formatDayCount(projectionDays)} forward`));
        const curveModeLabel = projectionDays >= (maxProjectionDays - 0.01) && maxProjectionDays > 0
            ? "Expiry curve"
            : (projectionDays <= 0.01 ? "Current premium curve" : "Projected premium curve");
        const currentPriceLabel = String(options?.currentPriceLabel || "Current spot");
        const breakEvenSummary = breakEvens.length ? breakEvens.map(formatPrice).join(" / ") : "None in range";
        const chartId = `payoff-${String(container.id || "graph").replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}`;
        const maxProfit = Math.max.apply(null, points.map(function (point) { return point.pnl; }));
        const maxLoss = Math.min.apply(null, points.map(function (point) { return point.pnl; }));
        const rangeSummary = `${formatPrice(series.minPrice)} - ${formatPrice(series.maxPrice)}`;
        const strikeSummary = strikeMarkers.length
            ? strikeMarkers.map(function (marker) { return marker.label; }).join(" | ")
            : "No strike markers";
        const bDeltaVariant = String(options?.variant || "").trim().toLowerCase() === "delta";
        const arrSlCheckpoints = normalizeSlCheckpointState(
            options?.slCheckpoints,
            Array.isArray(options?.slCheckpointPrices)
                ? options.slCheckpointPrices
                : (Number.isFinite(toNumber(options?.slCheckpointPrice)) ? [options.slCheckpointPrice] : []),
            vAllLegsKey
        ).map(function (checkpoint) {
            return {
                legKey: String(checkpoint.legKey || vAllLegsKey).trim() || vAllLegsKey,
                price: clamp(checkpoint.price, series.minPrice, series.maxPrice)
            };
        }).filter(function (checkpoint, index, checkpoints) {
            return checkpoints.findIndex(function (candidate) {
                return candidate.legKey === checkpoint.legKey && Math.abs(candidate.price - checkpoint.price) < 0.01;
            }) === index;
        }).sort(function (left, right) {
            if (left.legKey === right.legKey) {
                return left.price - right.price;
            }
            return left.legKey.localeCompare(right.legKey);
        });
        const arrLegOptions = [{
            legKey: vAllLegsKey,
            legLabel: "All legs",
            color: "#7cfc9a"
        }].concat(legSeries.map(function (entry) {
            return {
                legKey: entry.legKey,
                legLabel: entry.legLabel,
                color: entry.color
            };
        }));
        const arrValidLegKeys = arrLegOptions.map(function (entry) { return entry.legKey; });
        const vSelectedSlLegKey = arrValidLegKeys.includes(String(options?.selectedSlLegKey || ""))
            ? String(options?.selectedSlLegKey)
            : vAllLegsKey;
        const arrSlCheckpointRows = arrSlCheckpoints.map(function (checkpoint) {
            const objLegSeries = checkpoint.legKey === vAllLegsKey
                ? null
                : (legSeriesMap.get(checkpoint.legKey) || null);
            const targetPoints = objLegSeries?.points || points;
            const point = findNearestPoint(targetPoints, checkpoint.price);
            return {
                ...checkpoint,
                point,
                legLabel: objLegSeries?.legLabel || "All legs",
                color: objLegSeries?.color || "#f87171",
                x: mapX(checkpoint.price),
                y: point ? mapY(point.pnl) : zeroLineY,
                pnlText: point ? formatPnl(point.pnl) : "-",
                priceText: formatPrice(checkpoint.price)
            };
        });
        const vSlCheckpointSummary = arrSlCheckpointRows.length
            ? arrSlCheckpointRows.map(function (row) { return `${row.legLabel}: ${row.priceText}`; }).join(" | ")
            : "Not set";
        const bCanEditSlCheckpoint = typeof options?.onSlCheckpointChange === "function";
        const bCanSelectSlLeg = typeof options?.onSlSelectedLegChange === "function";

        if (bDeltaVariant) {
            container.innerHTML = `
                <div class="rolling-demo-payoff-panel rolling-demo-payoff-panel-delta">
                    <div class="rolling-demo-payoff-topbar">
                        <div>
                            <div class="rolling-demo-payoff-title">${escapeHtml(title)}</div>
                            <div class="rolling-demo-payoff-subtitle">${escapeHtml(subtitle)}</div>
                        </div>
                        <div class="rolling-demo-payoff-badges">
                            <span class="rolling-demo-payoff-badge neutral">${escapeHtml(curveModeLabel)}</span>
                            <span class="rolling-demo-payoff-badge success">${escapeHtml(currentPriceLabel)} ${escapeHtml(formatPrice(referencePrice))}</span>
                        </div>
                    </div>
                    <div class="rolling-demo-payoff-summary-grid">
                        <div class="rolling-demo-payoff-summary-card">
                            <div class="rolling-demo-payoff-summary-label">Max Profit</div>
                            <div class="rolling-demo-payoff-summary-value positive">${escapeHtml(formatPnl(maxProfit))}</div>
                        </div>
                        <div class="rolling-demo-payoff-summary-card">
                            <div class="rolling-demo-payoff-summary-label">Max Loss</div>
                            <div class="rolling-demo-payoff-summary-value ${maxLoss < 0 ? "negative" : ""}">${escapeHtml(formatPnl(maxLoss))}</div>
                        </div>
                        <div class="rolling-demo-payoff-summary-card">
                            <div class="rolling-demo-payoff-summary-label">Break-even</div>
                            <div class="rolling-demo-payoff-summary-value">${escapeHtml(breakEvenSummary)}</div>
                        </div>
                        <div class="rolling-demo-payoff-summary-card">
                            <div class="rolling-demo-payoff-summary-label">${escapeHtml(currentPriceLabel)}</div>
                            <div class="rolling-demo-payoff-summary-value">${escapeHtml(formatPrice(referencePrice))}</div>
                        </div>
                    </div>
                    <div class="rolling-demo-payoff-workspace">
                        <div class="rolling-demo-payoff-chart-shell">
                            <div class="rolling-demo-payoff-chart">
                                <svg class="rolling-demo-payoff-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
                                    <defs>
                                        <clipPath id="${chartId}-profit">
                                            <rect x="0" y="0" width="${width}" height="${Math.max(0, zeroLineY)}"></rect>
                                        </clipPath>
                                        <clipPath id="${chartId}-loss">
                                            <rect x="0" y="${Math.max(0, zeroLineY)}" width="${width}" height="${Math.max(0, height - zeroLineY)}"></rect>
                                        </clipPath>
                                    </defs>
                                    <path class="rolling-demo-payoff-area-profit" d="${areaPath}" clip-path="url(#${chartId}-profit)"></path>
                                    <path class="rolling-demo-payoff-area-loss" d="${areaPath}" clip-path="url(#${chartId}-loss)"></path>
                                    <line class="rolling-demo-payoff-axis" x1="${paddingLeft}" y1="${zeroLineY.toFixed(2)}" x2="${(width - paddingRight)}" y2="${zeroLineY.toFixed(2)}"></line>
                                    <line class="rolling-demo-payoff-axis" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${(height - paddingBottom)}"></line>
                                    ${strikeMarkers.map(function (marker, index) {
                                        const x = mapX(marker.strike);
                                        const labelY = paddingTop + 12 + ((index % 2) * 14);
                                        return `
                                            <line class="rolling-demo-payoff-strike" x1="${x.toFixed(2)}" y1="${paddingTop}" x2="${x.toFixed(2)}" y2="${(height - paddingBottom)}"></line>
                                            <text class="rolling-demo-payoff-strike-label" x="${x.toFixed(2)}" y="${labelY}">${escapeHtml(marker.label)}</text>
                                        `;
                                    }).join("")}
                                    ${breakEvens.map(function (breakEven) {
                                        const x = mapX(breakEven);
                                        return `
                                            <line class="rolling-demo-payoff-breakeven" x1="${x.toFixed(2)}" y1="${paddingTop}" x2="${x.toFixed(2)}" y2="${(height - paddingBottom)}"></line>
                                            <text class="rolling-demo-payoff-breakeven-label" x="${x.toFixed(2)}" y="${(height - 8)}">${escapeHtml(formatPrice(breakEven))}</text>
                                        `;
                                    }).join("")}
                                    ${arrSlCheckpointRows.map(function (row, index) {
                                        const vLabelY = paddingTop + 28 + ((index % 3) * 16);
                                        return `
                                            <line class="rolling-demo-payoff-sl" x1="${row.x.toFixed(2)}" y1="${paddingTop}" x2="${row.x.toFixed(2)}" y2="${(height - paddingBottom)}"></line>
                                            <circle class="rolling-demo-payoff-sl-dot" cx="${row.x.toFixed(2)}" cy="${row.y.toFixed(2)}" r="4" style="fill:${escapeHtml(row.color)};stroke:${escapeHtml(row.color)};"></circle>
                                            <text class="rolling-demo-payoff-sl-label" x="${row.x.toFixed(2)}" y="${vLabelY}">${escapeHtml(`${row.legLabel} SL ${row.priceText}`)}</text>
                                        `;
                                    }).join("")}
                                    ${referenceLineX === null ? "" : `<line class="rolling-demo-payoff-current" x1="${referenceLineX.toFixed(2)}" y1="${paddingTop}" x2="${referenceLineX.toFixed(2)}" y2="${(height - paddingBottom)}"></line>`}
                                    ${legSeries.map(function (entry) {
                                        return `<polyline class="rolling-demo-payoff-leg-line" points="${entry.polylinePoints}" style="stroke:${escapeHtml(entry.color)};"></polyline>`;
                                    }).join("")}
                                    <polyline class="rolling-demo-payoff-line-backdrop" points="${polylinePoints}"></polyline>
                                    <polyline class="rolling-demo-payoff-line" points="${polylinePoints}"></polyline>
                                    ${referenceLineX === null || !currentPoint ? "" : `<circle class="rolling-demo-payoff-current-dot" cx="${referenceLineX.toFixed(2)}" cy="${mapY(currentPoint.pnl).toFixed(2)}" r="4"></circle>`}
                                    <g class="rolling-demo-payoff-hover" display="none">
                                        <line class="rolling-demo-payoff-hover-line"></line>
                                        <circle class="rolling-demo-payoff-hover-dot" r="4"></circle>
                                    </g>
                                    <text class="rolling-demo-payoff-label" x="${paddingLeft}" y="${(height - 6)}">${escapeHtml(formatPrice(series.minPrice))}</text>
                                    <text class="rolling-demo-payoff-label" x="${(width - paddingRight)}" y="${(height - 6)}" text-anchor="end">${escapeHtml(formatPrice(series.maxPrice))}</text>
                                    <text class="rolling-demo-payoff-label" x="${paddingLeft - 8}" y="${(zeroLineY - 6).toFixed(2)}" text-anchor="end">0</text>
                                    ${referenceLineX === null ? "" : `<text class="rolling-demo-payoff-label" x="${referenceLineX.toFixed(2)}" y="${paddingTop - 6}" text-anchor="middle">${escapeHtml(formatPrice(referencePrice))}</text>`}
                                </svg>
                                <div class="rolling-demo-payoff-tooltip" hidden>
                                    <div class="rolling-demo-payoff-tooltip-price"></div>
                                    <div class="rolling-demo-payoff-tooltip-pnl"></div>
                                </div>
                            </div>
                            <div class="rolling-demo-payoff-sidecard rolling-demo-payoff-chart-footer">
                                <div class="rolling-demo-payoff-sidecard-title">Time Decay</div>
                                <div class="rolling-demo-payoff-hover-panel">
                                    <div class="rolling-demo-payoff-hover-row">
                                        <span>Projection</span>
                                        <strong>${escapeHtml(projectionLabel)}</strong>
                                    </div>
                                    <div class="rolling-demo-payoff-hover-row">
                                        <span>Max horizon</span>
                                        <strong>${escapeHtml(formatDayCount(maxProjectionDays))}</strong>
                                    </div>
                                </div>
                                <div class="rolling-demo-payoff-projection-controls">
                                    <input
                                        type="range"
                                        class="rolling-demo-payoff-projection-range"
                                        min="0"
                                        max="${Math.max(0, Math.round(maxProjectionDays * projectionScale))}"
                                        step="1"
                                        value="${Math.round(projectionDays * projectionScale)}"
                                        ${typeof options?.onProjectionDaysChange === "function" && maxProjectionDays > 0 ? "" : "disabled"}
                                    >
                                    <div class="rolling-demo-payoff-projection-actions">
                                        <button type="button" class="rolling-demo-payoff-projection-preset${projectionDays <= 0.01 ? " active" : ""}" data-projection-days="0"${typeof options?.onProjectionDaysChange === "function" && maxProjectionDays > 0 ? "" : " disabled"}>Now</button>
                                        <button type="button" class="rolling-demo-payoff-projection-preset${projectionDays >= (maxProjectionDays - 0.01) && maxProjectionDays > 0 ? " active" : ""}" data-projection-days="${Math.max(0, maxProjectionDays).toFixed(2)}"${typeof options?.onProjectionDaysChange === "function" && maxProjectionDays > 0 ? "" : " disabled"}>Expiry</button>
                                    </div>
                                </div>
                                <div class="rolling-demo-payoff-sl-help">${escapeHtml(maxProjectionDays > 0 ? "Move the slider from Now to Expiry to model theta decay for buy and sell option legs using each leg's current premium and expiry." : "Expiry-aware decay becomes available when the open option legs include expiry data.")}</div>
                            </div>
                        </div>
                        <div class="rolling-demo-payoff-sidepanel">
                            <div class="rolling-demo-payoff-sidecard">
                                <div class="rolling-demo-payoff-sidecard-title">Legend</div>
                                <div class="rolling-demo-payoff-legend">
                                    <div class="rolling-demo-payoff-legend-item"><span class="rolling-demo-payoff-legend-swatch curve"></span><span>Total payoff</span></div>
                                    ${legSeries.map(function (entry) {
                                        return `<div class="rolling-demo-payoff-legend-item"><span class="rolling-demo-payoff-legend-swatch leg" style="background:${escapeHtml(entry.color)};"></span><span>${escapeHtml(entry.legLabel)}</span></div>`;
                                    }).join("")}
                                    <div class="rolling-demo-payoff-legend-item"><span class="rolling-demo-payoff-legend-swatch spot"></span><span>${escapeHtml(currentPriceLabel)}</span></div>
                                    <div class="rolling-demo-payoff-legend-item"><span class="rolling-demo-payoff-legend-swatch breakeven"></span><span>Break-even</span></div>
                                    <div class="rolling-demo-payoff-legend-item"><span class="rolling-demo-payoff-legend-swatch sl"></span><span>Exit point</span></div>
                                    <div class="rolling-demo-payoff-legend-item"><span class="rolling-demo-payoff-legend-swatch strike"></span><span>Strike</span></div>
                                </div>
                            </div>
                            <div class="rolling-demo-payoff-sidecard">
                                <div class="rolling-demo-payoff-sidecard-title">Hover</div>
                                <div class="rolling-demo-payoff-hover-panel">
                                    <div class="rolling-demo-payoff-hover-row">
                                        <span>Price</span>
                                        <strong class="rolling-demo-payoff-hover-price-value">${escapeHtml(formatPrice(currentPoint ? currentPoint.price : referencePrice))}</strong>
                                    </div>
                                    <div class="rolling-demo-payoff-hover-row">
                                        <span>P&amp;L</span>
                                        <strong class="rolling-demo-payoff-hover-pnl-value ${currentPoint && currentPoint.pnl < 0 ? "negative" : ""}">${escapeHtml(currentPnlText)}</strong>
                                    </div>
                                    <div class="rolling-demo-payoff-hover-row">
                                        <span>Range</span>
                                        <strong>${escapeHtml(rangeSummary)}</strong>
                                    </div>
                                </div>
                            </div>
                            <div class="rolling-demo-payoff-sidecard">
                                <div class="rolling-demo-payoff-sidecard-title">Exit Point</div>
                                <div class="rolling-demo-payoff-hover-panel">
                                    <div class="rolling-demo-payoff-hover-row">
                                        <span>Target leg</span>
                                        <strong>${escapeHtml((arrLegOptions.find(function (entry) { return entry.legKey === vSelectedSlLegKey; }) || arrLegOptions[0]).legLabel)}</strong>
                                    </div>
                                    <div class="rolling-demo-payoff-hover-row">
                                        <span>Count</span>
                                        <strong class="rolling-demo-payoff-sl-value">${escapeHtml(String(arrSlCheckpointRows.length))}</strong>
                                    </div>
                                    <div class="rolling-demo-payoff-hover-row">
                                        <span>Prices</span>
                                        <strong>${escapeHtml(vSlCheckpointSummary)}</strong>
                                    </div>
                                </div>
                                ${arrLegOptions.length > 1 ? `
                                    <div class="rolling-demo-payoff-leg-selector">
                                        ${arrLegOptions.map(function (entry) {
                                            return `
                                                <button
                                                    type="button"
                                                    class="rolling-demo-payoff-leg-selector-btn${entry.legKey === vSelectedSlLegKey ? " active" : ""}"
                                                    data-leg-key="${escapeHtml(entry.legKey)}"
                                                    ${bCanSelectSlLeg ? "" : "disabled"}
                                                    style="${entry.legKey === vAllLegsKey ? "" : `--payoff-leg-color:${escapeHtml(entry.color)};`}"
                                                >${escapeHtml(entry.legLabel)}</button>
                                            `;
                                        }).join("")}
                                    </div>
                                ` : ""}
                                ${arrSlCheckpointRows.length ? `
                                    <div class="rolling-demo-payoff-sl-list">
                                        ${arrSlCheckpointRows.map(function (row, index) {
                                            return `
                                                <div class="rolling-demo-payoff-sl-item">
                                                    <div class="rolling-demo-payoff-sl-item-text">
                                                        <strong>${escapeHtml(`${row.legLabel} @ ${row.priceText}`)}</strong>
                                                        <span class="${row.point && row.point.pnl < 0 ? "negative" : ""}">${escapeHtml(row.pnlText)}</span>
                                                    </div>
                                                    ${!bCanEditSlCheckpoint ? "" : `<button type="button" class="rolling-demo-payoff-sl-remove" data-sl-index="${index}" aria-label="Remove exit point ${escapeHtml(row.priceText)}">x</button>`}
                                                </div>
                                            `;
                                        }).join("")}
                                    </div>
                                ` : ""}
                                <div class="rolling-demo-payoff-sl-help">${escapeHtml(bCanEditSlCheckpoint ? "Select All legs or a specific leg, then click the chart to add an exit point for that curve." : "Exit points are display only in this view.")}</div>
                                ${!bCanEditSlCheckpoint ? "" : `<button type="button" class="rolling-demo-payoff-sl-clear"${arrSlCheckpointRows.length ? "" : " disabled"}>Clear All Exit Points</button>`}
                            </div>
                            <div class="rolling-demo-payoff-sidecard">
                                <div class="rolling-demo-payoff-sidecard-title">Structure</div>
                                <div class="rolling-demo-payoff-loss">${escapeHtml(describeLossSegments(losses))}</div>
                                <div class="rolling-demo-payoff-strike-summary">${escapeHtml(strikeSummary)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            bindHover(container, {
                points,
                minPrice: series.minPrice,
                maxPrice: series.maxPrice,
                width,
                height,
                paddingLeft,
                paddingRight,
                paddingTop,
                paddingBottom,
                mapX,
                mapY
            });
            bindSlCheckpoint(container, {
                minPrice: series.minPrice,
                maxPrice: series.maxPrice,
                width,
                paddingLeft,
                paddingRight,
                slCheckpoints: arrSlCheckpoints,
                selectedSlLegKey: vSelectedSlLegKey,
                onSlCheckpointChange: options?.onSlCheckpointChange,
                onSlSelectedLegChange: options?.onSlSelectedLegChange
            });
            bindProjectionControls(container, {
                projectionScale,
                onProjectionDaysChange: options?.onProjectionDaysChange
            });
            return;
        }

        container.innerHTML = `
            <div class="rolling-demo-payoff-panel">
                <div class="rolling-demo-payoff-head">
                    <div>
                        <div class="rolling-demo-payoff-title">${escapeHtml(title)}</div>
                        <div class="rolling-demo-payoff-subtitle">${escapeHtml(subtitle)}</div>
                    </div>
                    <div class="rolling-demo-payoff-metrics">
                        <div class="rolling-demo-payoff-chip">${escapeHtml(currentPriceLabel)}: ${escapeHtml(formatPrice(referencePrice))}</div>
                        <div class="rolling-demo-payoff-chip">Current payoff: ${escapeHtml(currentPnlText)}</div>
                        <div class="rolling-demo-payoff-chip">Break-even: ${escapeHtml(breakEvenSummary)}</div>
                    </div>
                </div>
                <div class="rolling-demo-payoff-loss">${escapeHtml(describeLossSegments(losses))}</div>
                <div class="rolling-demo-payoff-chart">
                    <svg class="rolling-demo-payoff-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
                        <defs>
                            <clipPath id="${chartId}-profit">
                                <rect x="0" y="0" width="${width}" height="${Math.max(0, zeroLineY)}"></rect>
                            </clipPath>
                            <clipPath id="${chartId}-loss">
                                <rect x="0" y="${Math.max(0, zeroLineY)}" width="${width}" height="${Math.max(0, height - zeroLineY)}"></rect>
                            </clipPath>
                        </defs>
                        <path class="rolling-demo-payoff-area-profit" d="${areaPath}" clip-path="url(#${chartId}-profit)"></path>
                        <path class="rolling-demo-payoff-area-loss" d="${areaPath}" clip-path="url(#${chartId}-loss)"></path>
                        <line class="rolling-demo-payoff-axis" x1="${paddingLeft}" y1="${zeroLineY.toFixed(2)}" x2="${(width - paddingRight)}" y2="${zeroLineY.toFixed(2)}"></line>
                        <line class="rolling-demo-payoff-axis" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${(height - paddingBottom)}"></line>
                        ${strikeMarkers.map(function (marker, index) {
                            const x = mapX(marker.strike);
                            const labelY = paddingTop + 12 + ((index % 2) * 14);
                            return `
                                <line class="rolling-demo-payoff-strike" x1="${x.toFixed(2)}" y1="${paddingTop}" x2="${x.toFixed(2)}" y2="${(height - paddingBottom)}"></line>
                                <text class="rolling-demo-payoff-strike-label" x="${x.toFixed(2)}" y="${labelY}">${escapeHtml(marker.label)}</text>
                            `;
                        }).join("")}
                        ${breakEvens.map(function (breakEven) {
                            const x = mapX(breakEven);
                            return `
                                <line class="rolling-demo-payoff-breakeven" x1="${x.toFixed(2)}" y1="${paddingTop}" x2="${x.toFixed(2)}" y2="${(height - paddingBottom)}"></line>
                                <text class="rolling-demo-payoff-breakeven-label" x="${x.toFixed(2)}" y="${(height - 8)}">${escapeHtml(formatPrice(breakEven))}</text>
                            `;
                        }).join("")}
                        ${arrSlCheckpointRows.map(function (row, index) {
                            const vLabelY = paddingTop + 28 + ((index % 3) * 16);
                            return `
                                <line class="rolling-demo-payoff-sl" x1="${row.x.toFixed(2)}" y1="${paddingTop}" x2="${row.x.toFixed(2)}" y2="${(height - paddingBottom)}"></line>
                                <circle class="rolling-demo-payoff-sl-dot" cx="${row.x.toFixed(2)}" cy="${row.y.toFixed(2)}" r="4" style="fill:${escapeHtml(row.color)};stroke:${escapeHtml(row.color)};"></circle>
                                <text class="rolling-demo-payoff-sl-label" x="${row.x.toFixed(2)}" y="${vLabelY}">${escapeHtml(`${row.legLabel} SL ${row.priceText}`)}</text>
                            `;
                        }).join("")}
                        ${referenceLineX === null ? "" : `<line class="rolling-demo-payoff-current" x1="${referenceLineX.toFixed(2)}" y1="${paddingTop}" x2="${referenceLineX.toFixed(2)}" y2="${(height - paddingBottom)}"></line>`}
                        ${legSeries.map(function (entry) {
                            return `<polyline class="rolling-demo-payoff-leg-line" points="${entry.polylinePoints}" style="stroke:${escapeHtml(entry.color)};"></polyline>`;
                        }).join("")}
                        <polyline class="rolling-demo-payoff-line-backdrop" points="${polylinePoints}"></polyline>
                        <polyline class="rolling-demo-payoff-line" points="${polylinePoints}"></polyline>
                        ${referenceLineX === null || !currentPoint ? "" : `<circle class="rolling-demo-payoff-current-dot" cx="${referenceLineX.toFixed(2)}" cy="${mapY(currentPoint.pnl).toFixed(2)}" r="4"></circle>`}
                        <g class="rolling-demo-payoff-hover" display="none">
                            <line class="rolling-demo-payoff-hover-line"></line>
                            <circle class="rolling-demo-payoff-hover-dot" r="4"></circle>
                        </g>
                        <text class="rolling-demo-payoff-label" x="${paddingLeft}" y="${(height - 6)}">${escapeHtml(formatPrice(series.minPrice))}</text>
                        <text class="rolling-demo-payoff-label" x="${(width - paddingRight)}" y="${(height - 6)}" text-anchor="end">${escapeHtml(formatPrice(series.maxPrice))}</text>
                        <text class="rolling-demo-payoff-label" x="${paddingLeft - 8}" y="${(zeroLineY - 6).toFixed(2)}" text-anchor="end">0</text>
                        ${referenceLineX === null ? "" : `<text class="rolling-demo-payoff-label" x="${referenceLineX.toFixed(2)}" y="${paddingTop - 6}" text-anchor="middle">${escapeHtml(formatPrice(referencePrice))}</text>`}
                    </svg>
                    <div class="rolling-demo-payoff-tooltip" hidden>
                        <div class="rolling-demo-payoff-tooltip-price"></div>
                        <div class="rolling-demo-payoff-tooltip-pnl"></div>
                    </div>
                </div>
            </div>
        `;

        bindHover(container, {
            points,
            minPrice: series.minPrice,
            maxPrice: series.maxPrice,
            width,
            height,
            paddingLeft,
            paddingRight,
            paddingTop,
            paddingBottom,
            mapX,
            mapY
        });
        bindSlCheckpoint(container, {
            minPrice: series.minPrice,
            maxPrice: series.maxPrice,
            width,
            paddingLeft,
            paddingRight,
            slCheckpoints: arrSlCheckpoints,
            selectedSlLegKey: vSelectedSlLegKey,
            onSlCheckpointChange: options?.onSlCheckpointChange,
            onSlSelectedLegChange: options?.onSlSelectedLegChange
        });
    }

    globalScope.OptionyzePayoffGraph = {
        render
    };
})(window);
