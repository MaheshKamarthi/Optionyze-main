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

    function detectInstrumentType(row) {
        const instrumentType = String(row?.instrumentType || "").trim().toUpperCase();
        if (instrumentType === "OPTION" || instrumentType === "FUTURE") {
            return instrumentType;
        }
        return parseOptionDescriptor(row) ? "OPTION" : "FUTURE";
    }

    function normalizeRows(rows) {
        return (Array.isArray(rows) ? rows : []).map(function (row) {
            const instrumentType = detectInstrumentType(row);
            const optionDescriptor = instrumentType === "OPTION" ? parseOptionDescriptor(row) : null;
            const actionRaw = String(row?.action || row?.side || "").trim().toUpperCase();
            const action = actionRaw === "SELL" ? "SELL" : "BUY";
            const qty = Math.max(0, toNumber(row?.qty));
            const lotSize = Math.max(0, toNumber(row?.lotSize));
            const entryPrice = toNumber(row?.entryPrice);
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
                referencePrice: toNumber(row?.metadata?.entrySpotPrice),
                contractName: String(row?.contractName || row?.symbol || "").trim()
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

    function calculateLegPayoff(row, price) {
        const direction = row.action === "SELL" ? -1 : 1;
        const multiplier = row.qty * row.lotSize;

        if (row.instrumentType === "FUTURE") {
            return direction * (price - row.entryPrice) * multiplier;
        }

        const intrinsic = row.optionSide === "PE"
            ? Math.max(row.strike - price, 0)
            : Math.max(price - row.strike, 0);
        return (direction > 0 ? (intrinsic - row.entryPrice) : (row.entryPrice - intrinsic)) * multiplier;
    }

    function buildPayoffSeries(rows, referencePrice) {
        const priceRange = getPriceRange(rows, referencePrice);
        const totalCharges = rows.reduce(function (sum, row) {
            return sum + Math.abs(Number(row.charges || 0));
        }, 0);
        const points = [];
        const pointCount = 121;
        const step = (priceRange.maxPrice - priceRange.minPrice) / (pointCount - 1);

        for (let index = 0; index < pointCount; index += 1) {
            const price = priceRange.minPrice + (step * index);
            const pnlBeforeCharges = rows.reduce(function (sum, row) {
                return sum + calculateLegPayoff(row, price);
            }, 0);
            points.push({
                price,
                pnl: pnlBeforeCharges - totalCharges
            });
        }

        return {
            points,
            totalCharges,
            minPrice: priceRange.minPrice,
            maxPrice: priceRange.maxPrice
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
        const series = buildPayoffSeries(normalizedRows, referencePrice);
        const points = series.points;
        const losses = getLossSegments(points);
        const breakEvens = getBreakEvenPrices(points);
        const strikeMarkers = getStrikeMarkers(normalizedRows);
        const currentPoint = findNearestPoint(points, referencePrice);
        const yValues = points.map(function (point) { return point.pnl; }).concat(0);
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
        const polylinePoints = points.map(function (point) {
            return `${mapX(point.price).toFixed(2)},${mapY(point.pnl).toFixed(2)}`;
        }).join(" ");
        const zeroLineY = mapY(0);
        const referenceLineX = Number.isFinite(referencePrice) ? mapX(referencePrice) : null;
        const areaPath = buildAreaPath(points, zeroLineY, mapX, mapY);
        const currentPnlText = currentPoint ? formatPnl(currentPoint.pnl) : "-";
        const title = String(options?.title || "Open Position Payoff");
        const subtitle = String(options?.subtitle || "Combined expiry payoff for the current open legs.");
        const currentPriceLabel = String(options?.currentPriceLabel || "Current spot");
        const breakEvenSummary = breakEvens.length ? breakEvens.map(formatPrice).join(" / ") : "None in range";
        const chartId = `payoff-${String(container.id || "graph").replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}`;

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
                        ${referenceLineX === null ? "" : `<line class="rolling-demo-payoff-current" x1="${referenceLineX.toFixed(2)}" y1="${paddingTop}" x2="${referenceLineX.toFixed(2)}" y2="${(height - paddingBottom)}"></line>`}
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
    }

    globalScope.OptionyzePayoffGraph = {
        render
    };
})(window);
