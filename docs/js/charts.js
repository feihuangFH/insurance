// Shared chart helpers for Insurance Explained.
// Plot and d3 come from Quarto's OJS runtime and are passed in by the caller.

export const colours = {
  "Insurance": "#0f766e",
  "All groups CPI": "#7b8794",
  "Insurance and financial services": "#3b5b8c",
  muted: "#c5ccd5",
  rule: "#9aa5b4",
  text: "#3d4a60"
};

export const labels = {
  "Insurance": "Insurance",
  "All groups CPI": "All-groups CPI",
  "Insurance and financial services": "Insurance and financial services group",
  "Food and non-alcoholic beverages": "Food and non-alcoholic beverages",
  "Alcohol and tobacco": "Alcohol and tobacco",
  "Clothing and footwear": "Clothing and footwear",
  "Housing": "Housing",
  "Furnishings, household equipment and services": "Furnishings, household equipment and services",
  "Health": "Health",
  "Transport": "Transport",
  "Communication": "Communication",
  "Recreation and culture": "Recreation and culture",
  "Education": "Education"
};

// Events that change measured insurance prices for reasons other than insurance costs.
export const events = [
  {date: new Date("2000-07-01"), label: "GST introduced, July 2000"}
];

export const fmt = v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

export function periodName(p) {
  // Typed CSV parsing turns monthly periods ("2026-09") into dates; quarterly ones stay strings.
  if (p instanceof Date) {
    return p.toLocaleString("en-AU", {month: "short", year: "numeric", timeZone: "UTC"});
  }
  if (p.includes("-Q")) {
    const [y, q] = p.split("-Q");
    return `${["Mar", "Jun", "Sep", "Dec"][q - 1]} qtr ${y}`;
  }
  const [y, m] = p.split("-");
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-AU", {month: "short", year: "numeric", timeZone: "UTC"});
}

// Rows for the selected series from `start`, with the plotted value in `v`.
export function prepare(rows, {measure, start, series}) {
  // Never start before the shortest selected series begins (insurance starts in 1989).
  const firsts = series.map(s => Math.min(...rows.filter(d => d.series === s).map(d => +d.date)));
  const from = new Date(Math.max(+start, ...firsts.filter(Number.isFinite)));
  const inRange = rows.filter(d => series.includes(d.series) && d.date >= from);
  if (measure === "cumulative") {
    const first = new Map();
    for (const d of inRange) if (!first.has(d.series) || d.date < first.get(d.series).date) first.set(d.series, d);
    // Rebase each series to the latest start date they share, so lines begin together.
    const common = new Date(Math.max(...[...first.values()].map(d => +d.date)));
    const base = new Map(inRange.filter(d => +d.date === +common).map(d => [d.series, d.index]));
    return inRange.filter(d => d.date >= common && base.has(d.series))
      .map(d => ({...d, v: Math.round(1000 * (d.index / base.get(d.series) - 1)) / 10}));
  }
  const key = measure === "annual" ? "annual_change" : "period_change";
  return inRange.filter(d => d[key] !== null && d[key] !== "").map(d => ({...d, v: d[key]}));
}

export function yLabel(measure, freq, data) {
  if (measure === "annual") return "% change on a year earlier";
  if (measure === "period") return freq === "monthly" ? "% change on previous month" : "% change on previous quarter";
  const first = data.length ? data.reduce((a, b) => (a.date < b.date ? a : b)) : null;
  return first ? `% change since ${periodName(first.period)}` : "% change";
}

export function trendChart(Plot, d3, data, {measure, freq, width, series}) {
  const wide = Array.from(d3.group(data, d => +d.date), ([, g]) => {
    const row = {date: g[0].date, period: g[0].period};
    for (const d of g) row[d.series] = d.v;
    return row;
  }).filter(r => series.every(s => r[s] !== undefined)).sort((a, b) => a.date - b.date);

  const [x0, x1] = d3.extent(data, d => d.date);
  const shown = freq === "quarterly" ? events.filter(e => e.date >= x0 && e.date <= x1) : [];
  const yMax = d3.max(data, d => d.v);

  return Plot.plot({
    width,
    height: width < 600 ? 300 : 400,
    marginLeft: 48,
    marginRight: 16,
    marginTop: 28,
    style: {fontFamily: "Inter, system-ui, sans-serif", fontSize: "12px", color: colours.text},
    x: {type: "utc", label: null},
    y: {label: yLabel(measure, freq, data), grid: true, tickFormat: d => `${d}%`},
    marks: [
      Plot.ruleY([0], {stroke: colours.rule}),
      ...shown.map(e => {
        // Put the label on whichever side of the line has more room.
        const right = (e.date - x0) / (x1 - x0) > 0.5;
        return [
          Plot.ruleX([e.date], {stroke: "#c9a74a", strokeDasharray: "3,3"}),
          Plot.text([e], {x: "date", y: yMax, text: "label", textAnchor: right ? "end" : "start", dx: right ? -5 : 5, dy: -4, fill: "#8a6a10", fontSize: 11})
        ];
      }),
      ...series.map(s => Plot.lineY(data.filter(d => d.series === s), {
        x: "date", y: "v", stroke: colours[s], strokeWidth: s === "Insurance" ? 2.5 : 2,
        strokeDasharray: s === "Insurance and financial services" ? "5,3" : null,
        curve: "linear"
      })),
      Plot.ruleX(wide, Plot.pointerX({x: "date", stroke: "#b7c0cc"})),
      Plot.dot(data, Plot.pointerX({x: "date", y: "v", fill: d => colours[d.series], r: 3.5})),
      Plot.tip(wide, Plot.pointerX({
        x: "date",
        y: d => d3.max(series, s => d[s]),
        title: d => [periodName(d.period), ...series.map(s => `${labels[s]}: ${fmt(d[s])}`)].join("\n")
      }))
    ],
    ariaLabel: `Line chart of ${series.map(s => labels[s]).join(", ")}, ${yLabel(measure, freq, data)}`
  });
}

// Price change over `years` to the latest quarter, for each series.
export function changeOver(rows, years) {
  const bySeries = new Map();
  for (const d of rows) {
    if (!bySeries.has(d.series)) bySeries.set(d.series, new Map());
    bySeries.get(d.series).set(d.period, d);
  }
  const out = [];
  for (const [series, m] of bySeries) {
    const periods = [...m.keys()].sort();
    const last = periods[periods.length - 1];
    const [y, q] = last.split("-Q");
    const base = m.get(`${+y - years}-Q${q}`);
    if (!base) continue;
    out.push({series, label: labels[series] ?? series, from: base.period, to: last,
              v: Math.round(1000 * (m.get(last).index / base.index - 1)) / 10});
  }
  return out;
}

// Breaks a long label into lines of at most n characters, at word boundaries.
function wrapLabel(text, n) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > n) { lines.push(line); line = word; }
    else line = line ? line + " " + word : word;
  }
  lines.push(line);
  return lines.join("\n");
}

export function categoryChart(Plot, data, {width}) {
  const narrow = width < 600;
  const cpi = data.find(d => d.series === "All groups CPI");
  const bars = data.filter(d => d.series !== "All groups CPI");
  const valueLabel = (rows, options) => [
    Plot.text(rows.filter(d => d.v >= 0), {y: "label", x: "v", text: d => fmt(d.v), textAnchor: "start", dx: 5, ...options}),
    Plot.text(rows.filter(d => d.v < 0), {y: "label", x: "v", text: d => fmt(d.v), textAnchor: "end", dx: -5, ...options})
  ];
  const ins = bars.filter(d => d.series === "Insurance");
  const rest = bars.filter(d => d.series !== "Insurance");
  return Plot.plot({
    width,
    height: (narrow ? 40 : 34) * bars.length + 60,
    marginLeft: narrow ? 130 : 300,
    marginRight: 56,
    marginTop: 34,
    style: {fontFamily: "Inter, system-ui, sans-serif", fontSize: narrow ? "11px" : "12.5px", color: colours.text},
    x: {label: null, grid: true, tickFormat: d => `${d}%`},
    y: {label: null, domain: bars.slice().sort((a, b) => b.v - a.v).map(d => d.label), tickSize: 0, tickFormat: d => narrow ? wrapLabel(d, 20) : d},
    marks: [
      Plot.barX(rest, {y: "label", x: "v", fill: colours.muted, insetTop: 5, insetBottom: 5}),
      Plot.barX(ins, {y: "label", x: "v", fill: colours.Insurance, insetTop: 5, insetBottom: 5}),
      ...valueLabel(rest, {fill: colours.text}),
      ...valueLabel(ins, {fill: colours.Insurance, fontWeight: 600}),
      Plot.ruleX([0], {stroke: colours.rule}),
      Plot.ruleX([cpi.v], {stroke: "#12233f", strokeDasharray: "4,3"}),
      Plot.text([cpi], {x: "v", frameAnchor: "top", text: d => `All-groups CPI ${fmt(d.v)}`, dy: -18, textAnchor: "middle", fill: "#12233f", fontSize: 11})
    ],
    ariaLabel: "Bar chart comparing price changes for insurance and the 11 CPI groups"
  });
}
