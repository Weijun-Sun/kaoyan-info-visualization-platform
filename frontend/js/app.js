(function () {
  var charts = {};
  var chartText = "#c8d8f6";
  var muted = "#8ea4c7";
  var gridLine = "rgba(135,160,210,.14)";
  var palette = ["#3b82f6", "#22c55e", "#22d3ee", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#f97316"];

  function $(id) {
    return document.getElementById(id);
  }

  function value(v) {
    return v === null || v === undefined || Number.isNaN(v) ? "" : v;
  }

  function num(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function fetchJSON(url, ok, fail) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          ok(JSON.parse(xhr.responseText));
        } catch (err) {
          if (fail) fail(err);
        }
      } else if (fail) {
        fail(new Error(url + " " + xhr.status));
      }
    };
    xhr.onerror = function () {
      if (fail) fail(new Error("请求失败：" + url));
    };
    xhr.send();
  }

  function setApiState(text, isError) {
    var el = $("apiState");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "#fecaca" : "#22d3ee";
  }

  function initChart(id) {
    var el = $(id);
    if (!el || !window.echarts) return null;
    if (charts[id]) charts[id].dispose();
    charts[id] = window.echarts.init(el);
    return charts[id];
  }

  function axis(extra) {
    return Object.assign({
      axisLabel: { color: chartText },
      axisLine: { lineStyle: { color: "rgba(200,216,246,.28)" } },
      splitLine: { lineStyle: { color: gridLine } },
      nameTextStyle: { color: muted }
    }, extra || {});
  }

  function tooltipAxis() {
    return {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(8,17,31,.92)",
      borderColor: "rgba(135,160,210,.28)",
      textStyle: { color: "#edf4ff" }
    };
  }

  function renderMetrics(summary) {
    var items = [
      ["总记录数", summary["总记录数"], "清洗后的全部记录"],
      ["覆盖院校", summary["覆盖院校"], "用于横向比较"],
      ["专业数量", summary["专业数量"], "原始专业名称"],
      ["专业类别", summary["专业类别"], "归并后的信息类方向"],
      ["年份范围", summary["年份范围"], "时间覆盖"],
      ["初试中位数", summary["初试中位数"], "全局参考线"]
    ];
    $("metricGrid").innerHTML = items.map(function (item) {
      return '<div class="metric"><div class="label">' + item[0] + '</div><div class="value">' + value(item[1]) + '</div><div class="hint">' + item[2] + '</div></div>';
    }).join("");
  }

  function renderOptions(options) {
    var html = '<option value="">全部年份</option>';
    (options["年份"] || []).forEach(function (year) {
      html += '<option value="' + year + '">' + year + '</option>';
    });
    $("yearSelect").innerHTML = html;
  }

  function queryParams(exporting) {
    var params = [];
    if ($("yearSelect").value) params.push("year=" + encodeURIComponent($("yearSelect").value));
    if ($("schoolInput").value) params.push("school=" + encodeURIComponent($("schoolInput").value));
    if ($("keywordInput").value) params.push("keyword=" + encodeURIComponent($("keywordInput").value));
    if ($("minScoreInput").value) params.push("minScore=" + encodeURIComponent($("minScoreInput").value));
    if ($("maxScoreInput").value) params.push("maxScore=" + encodeURIComponent($("maxScoreInput").value));
    if (exporting) params.push("export=1");
    return params.join("&");
  }

  function renderTable(payload) {
    $("queryCount").textContent = "共 " + payload.total + " 条，展示前 " + payload.rows.length + " 条";
    if (!payload.rows.length) {
      $("resultBody").innerHTML = '<tr><td colspan="8">没有符合条件的数据</td></tr>';
      return;
    }
    $("resultBody").innerHTML = payload.rows.map(function (r) {
      return "<tr>" +
        "<td>" + value(r["院校"]) + "</td>" +
        "<td>" + value(r["年份"]) + "</td>" +
        "<td>" + value(r["院系"]) + "</td>" +
        "<td>" + value(r["专业"]) + "</td>" +
        "<td>" + value(r["初试成绩"]) + "</td>" +
        "<td>" + value(r["复试成绩"]) + "</td>" +
        "<td>" + value(r["总成绩"]) + "</td>" +
        "<td>" + value(r["是否录取"]) + "</td>" +
        "</tr>";
    }).join("");
  }

  function search() {
    fetchJSON("/api/search?" + queryParams(false), renderTable, function (err) {
      $("queryCount").textContent = "查询失败";
      setApiState(err.message, true);
    });
  }

  function drawGroupedBar(rows) {
    var chart = initChart("groupedBarChart");
    chart.setOption({
      color: palette,
      tooltip: tooltipAxis(),
      legend: { top: 0, textStyle: { color: chartText } },
      grid: { left: 52, right: 18, top: 52, bottom: 42 },
      xAxis: axis({ type: "category", data: rows.map(function (r) { return r["年份"]; }) }),
      yAxis: axis({ type: "value" }),
      series: [
        { name: "记录数", type: "bar", data: rows.map(function (r) { return r["记录数"]; }), barGap: 0 },
        { name: "院校数", type: "bar", data: rows.map(function (r) { return r["院校数"]; }) },
        { name: "专业数", type: "bar", data: rows.map(function (r) { return r["专业数"]; }) }
      ]
    });
  }

  function drawStackedBar(rows) {
    var chart = initChart("stackedBarChart");
    var bands = Object.keys(rows[0] || {}).filter(function (k) { return k !== "年份"; });
    chart.setOption({
      color: ["#172554", "#1e3a8a", "#1d4ed8", "#2563eb", "#0284c7", "#0891b2", "#16a34a", "#f59e0b", "#ef4444", "#a855f7"],
      tooltip: tooltipAxis(),
      legend: { type: "scroll", top: 0, textStyle: { color: chartText } },
      grid: { left: 52, right: 18, top: 58, bottom: 42 },
      xAxis: axis({ type: "category", data: rows.map(function (r) { return r["年份"]; }) }),
      yAxis: axis({ type: "value" }),
      series: bands.map(function (band) {
        return { name: band, type: "bar", stack: "分数段", emphasis: { focus: "series" }, data: rows.map(function (r) { return r[band] || 0; }) };
      })
    });
  }

  function drawDivergingBar(rows) {
    var chart = initChart("divergingBarChart");
    var bands = rows.map(function (r) { return r["分数段"]; });
    chart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          return params.map(function (p) { return p.marker + p.seriesName + "：" + Math.abs(p.value); }).join("<br>");
        }
      },
      legend: { top: 0, textStyle: { color: chartText } },
      grid: { left: 72, right: 26, top: 50, bottom: 34 },
      xAxis: axis({ type: "value", axisLabel: { color: chartText, formatter: function (v) { return Math.abs(v); } } }),
      yAxis: axis({ type: "category", data: bands }),
      series: [
        { name: "未录取", type: "bar", stack: "total", data: rows.map(function (r) { return -num(r["未录取数"]); }), itemStyle: { color: "#ef4444" } },
        { name: "录取", type: "bar", stack: "total", data: rows.map(function (r) { return num(r["录取数"]); }), itemStyle: { color: "#22c55e" } }
      ]
    });
  }

  function drawWaterfall(rows) {
    var chart = initChart("waterfallChart");
    var prev = 0;
    var helper = [];
    var plus = [];
    var minus = [];
    rows.forEach(function (r) {
      var change = num(r["变化量"]);
      if (change >= 0) {
        helper.push(prev);
        plus.push(change);
        minus.push("-");
      } else {
        helper.push(prev + change);
        plus.push("-");
        minus.push(-change);
      }
      prev = num(r["累计记录数"]);
    });
    chart.setOption({
      tooltip: tooltipAxis(),
      legend: { top: 0, textStyle: { color: chartText } },
      grid: { left: 58, right: 24, top: 50, bottom: 42 },
      xAxis: axis({ type: "category", data: rows.map(function (r) { return r["年份"]; }) }),
      yAxis: axis({ type: "value" }),
      series: [
        { name: "辅助", type: "bar", stack: "total", itemStyle: { color: "transparent" }, emphasis: { itemStyle: { color: "transparent" } }, data: helper },
        { name: "增加", type: "bar", stack: "total", data: plus, itemStyle: { color: "#22c55e" } },
        { name: "减少", type: "bar", stack: "total", data: minus, itemStyle: { color: "#ef4444" } }
      ]
    });
  }

  function drawBullet(rows) {
    var chart = initChart("bulletChart");
    var names = rows.map(function (r) { return r["院校"]; }).reverse();
    var target = 360;
    var maxScore = Math.max.apply(null, rows.map(function (r) { return num(r["初试中位数"]); }).concat([430]));
    maxScore = Math.ceil(Math.max(430, maxScore + 10) / 10) * 10;
    chart.setOption({
      tooltip: tooltipAxis(),
      legend: { top: 0, textStyle: { color: chartText } },
      grid: { left: 150, right: 40, top: 52, bottom: 34 },
      xAxis: axis({ type: "value", min: 0, max: maxScore, name: "初试中位数" }),
      yAxis: axis({ type: "category", data: names }),
      series: [
        { name: "低于360", type: "bar", stack: "bg", data: names.map(function () { return 360; }), silent: true, barWidth: 24, itemStyle: { color: "rgba(148,163,184,.30)" } },
        { name: "达标360-370", type: "bar", stack: "bg", data: names.map(function () { return 10; }), silent: true, itemStyle: { color: "rgba(59,130,246,.25)" } },
        { name: "优秀370+", type: "bar", stack: "bg", data: names.map(function () { return Math.max(maxScore - 370, 0); }), silent: true, itemStyle: { color: "rgba(34,197,94,.22)" } },
        {
          name: "实际分数",
          type: "bar",
          data: rows.map(function (r) { return num(r["初试中位数"]); }).reverse(),
          barWidth: 10,
          barGap: "-70%",
          z: 5,
          itemStyle: { color: "#3b82f6" },
          label: { show: true, position: "right", color: chartText },
          markLine: {
            symbol: "none",
            data: [{ xAxis: target }],
            label: { formatter: "360参考线", color: "#fecaca" },
            lineStyle: { color: "#ef4444", type: "dashed", width: 2 }
          }
        }
      ]
    });
  }

  function drawMultiLine(rows) {
    var chart = initChart("multiLineChart");
    var years = Array.from(new Set(rows.map(function (r) { return r["年份"]; }))).sort();
    var schools = Array.from(new Set(rows.map(function (r) { return r["院校"]; })));
    var values = rows.map(function (r) { return num(r["初试中位数"], null); }).filter(function (x) { return x !== null; });
    chart.setOption({
      color: palette,
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, type: "scroll", textStyle: { color: chartText } },
      grid: { left: 56, right: 28, top: 28, bottom: 78 },
      xAxis: axis({ type: "category", data: years }),
      yAxis: axis({ type: "value", min: Math.max(250, Math.floor(Math.min.apply(null, values) / 10) * 10 - 10) }),
      series: schools.map(function (school) {
        return {
          name: school,
          type: "line",
          smooth: false,
          symbolSize: 7,
          data: years.map(function (year) {
            var item = rows.find(function (r) { return r["院校"] === school && r["年份"] === year; });
            return item ? item["初试中位数"] : null;
          })
        };
      })
    });
  }

  function drawArea(rows) {
    var chart = initChart("areaChart");
    chart.setOption({
      tooltip: { trigger: "axis" },
      grid: { left: 54, right: 22, top: 28, bottom: 40 },
      xAxis: axis({ type: "category", boundaryGap: false, data: rows.map(function (r) { return r["年份"]; }) }),
      yAxis: axis({ type: "value" }),
      series: [{
        name: "记录数",
        type: "line",
        smooth: true,
        symbolSize: 7,
        data: rows.map(function (r) { return r["记录数"]; }),
        lineStyle: { width: 3, color: "#22d3ee" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(34,211,238,.55)" },
            { offset: 1, color: "rgba(34,211,238,.04)" }
          ])
        }
      }]
    });
  }

  function drawIntervalLine(rows) {
    var chart = initChart("intervalLineChart");
    var years = rows.map(function (r) { return r["年份"]; });
    var lower = rows.map(function (r) { return num(r["下四分位"]); });
    var range = rows.map(function (r) { return Math.max(num(r["上四分位"]) - num(r["下四分位"]), 0); });
    var median = rows.map(function (r) { return num(r["初试中位数"]); });
    chart.setOption({
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: chartText } },
      grid: { left: 54, right: 24, top: 50, bottom: 40 },
      xAxis: axis({ type: "category", boundaryGap: false, data: years }),
      yAxis: axis({ type: "value", min: 250 }),
      series: [
        { name: "下四分位", type: "line", stack: "区间", data: lower, lineStyle: { opacity: 0 }, symbol: "none", areaStyle: { opacity: 0 } },
        { name: "四分位区间", type: "line", stack: "区间", data: range, lineStyle: { opacity: 0 }, symbol: "none", areaStyle: { color: "rgba(59,130,246,.22)" } },
        { name: "初试中位数", type: "line", smooth: true, data: median, symbolSize: 7, lineStyle: { width: 3, color: "#f59e0b" } }
      ]
    });
  }

  function drawNestedDonut(data) {
    var chart = initChart("nestedDonutChart");
    chart.setOption({
      tooltip: { trigger: "item" },
      legend: { bottom: 0, type: "scroll", textStyle: { color: chartText } },
      series: [
        {
          name: "学位类型",
          type: "pie",
          selectedMode: "single",
          radius: [0, "36%"],
          label: { color: chartText },
          data: (data.inner || []).map(function (r) { return { name: r["学位类型"], value: r["记录数"] }; })
        },
        {
          name: "专业类别",
          type: "pie",
          radius: ["48%", "70%"],
          label: { color: chartText, formatter: "{b}\n{d}%" },
          data: (data.outer || []).map(function (r) { return { name: r["类别"], value: r["记录数"] }; })
        }
      ]
    });
  }

  function drawExplodedPie(rows) {
    var chart = initChart("explodedPieChart");
    var maxValue = Math.max.apply(null, rows.map(function (r) { return num(r["记录数"]); }));
    chart.setOption({
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: chartText } },
      series: [{
        name: "录取状态",
        type: "pie",
        radius: "68%",
        selectedOffset: 18,
        label: { color: chartText, formatter: "{b}: {d}%" },
        data: rows.map(function (r) {
          return { name: r["类别"], value: r["记录数"], selected: num(r["记录数"]) === maxValue };
        })
      }]
    });
  }

  function drawSunburst(data) {
    var chart = initChart("sunburstChart");
    chart.setOption({
      tooltip: { trigger: "item" },
      series: [{
        type: "sunburst",
        data: data || [],
        radius: [0, "92%"],
        sort: null,
        emphasis: { focus: "ancestor" },
        label: { color: chartText, rotate: "radial" },
        levels: [
          {},
          { r0: "15%", r: "38%", itemStyle: { borderWidth: 2 } },
          { r0: "38%", r: "68%", label: { rotate: "tangential" } },
          { r0: "68%", r: "92%", label: { rotate: "radial" } }
        ]
      }]
    });
  }

  function drawSankey(data) {
    var chart = initChart("sankeyChart");
    chart.setOption({
      tooltip: { trigger: "item", triggerOn: "mousemove" },
      series: [{
        type: "sankey",
        data: data.nodes || [],
        links: data.links || [],
        nodeWidth: 14,
        nodeGap: 8,
        draggable: false,
        label: { color: chartText },
        lineStyle: { color: "gradient", curveness: 0.45, opacity: 0.35 },
        emphasis: { focus: "adjacency" }
      }]
    });
  }

  function drawBubble(rows) {
    var chart = initChart("bubbleChart");
    var maxMajor = Math.max.apply(null, rows.map(function (r) { return num(r["专业数"], 1); }).concat([1]));
    chart.setOption({
      tooltip: {
        formatter: function (p) {
          var d = p.data;
          return d[3] + "<br>样本数：" + d[0] + "<br>初试中位数：" + d[1] + "<br>专业数：" + d[2];
        }
      },
      visualMap: {
        min: 1,
        max: maxMajor,
        dimension: 2,
        orient: "horizontal",
        right: 20,
        top: 8,
        textStyle: { color: chartText },
        inRange: { color: ["#60a5fa", "#22c55e", "#f59e0b", "#ef4444"] }
      },
      grid: { left: 70, right: 46, top: 58, bottom: 54 },
      xAxis: axis({ type: "log", min: 10, name: "样本数（对数轴）" }),
      yAxis: axis({ type: "value", min: 250, max: 430, name: "初试中位数" }),
      series: [{
        type: "scatter",
        data: rows.map(function (r) { return [r["样本数"], r["初试中位数"], r["专业数"], r["院校"]]; }),
        symbolSize: function (d) { return 10 + (d[2] || 1) / maxMajor * 42; },
        itemStyle: { opacity: 0.78, borderColor: "#dbeafe", borderWidth: 1 },
        label: {
          show: true,
          formatter: function (p) { return p.data[0] >= 600 || p.data[1] >= 375 ? p.data[3] : ""; },
          position: "right",
          color: chartText,
          fontSize: 11
        },
        markLine: { data: [{ yAxis: 360, name: "360参考线" }], lineStyle: { color: "#ef4444", type: "dashed" } }
      }]
    });
  }

  function drawMatrixHeatmap(data) {
    var chart = initChart("matrixHeatmapChart");
    var values = (data.values || []).filter(function (v) { return v[2] !== null; });
    var maxValue = Math.max.apply(null, values.map(function (v) { return v[2]; }).concat([430]));
    chart.setOption({
      tooltip: {
        position: "top",
        formatter: function (p) {
          return data.schools[p.data[1]] + "<br>" + data.categories[p.data[0]] + "：" + p.data[2];
        }
      },
      grid: { top: 24, left: 132, right: 30, bottom: 92 },
      xAxis: axis({ type: "category", data: data.categories || [], axisLabel: { color: chartText, rotate: 32 } }),
      yAxis: axis({ type: "category", data: data.schools || [] }),
      visualMap: { min: 250, max: maxValue, calculable: true, orient: "horizontal", left: "center", bottom: 12, textStyle: { color: chartText }, inRange: { color: ["#172554", "#2563eb", "#22d3ee", "#f59e0b", "#ef4444"] } },
      series: [{ type: "heatmap", data: data.values || [], label: { show: true, color: "#fff", fontSize: 10 }, emphasis: { itemStyle: { borderColor: "#fff", borderWidth: 1 } } }]
    });
  }

  function drawGeoHeat(rows) {
    var chart = initChart("geoHeatChart");
    var maxValue = Math.max.apply(null, rows.map(function (r) { return num(r["记录数"]); }).concat([1]));
    chart.setOption({
      tooltip: {
        formatter: function (p) {
          var d = p.data;
          return d[3] + "<br>记录数：" + d[2] + "<br>院校数：" + d[4] + "<br>初试中位数：" + value(d[5]);
        }
      },
      visualMap: { min: 0, max: maxValue, right: 10, top: 20, textStyle: { color: chartText }, inRange: { color: ["#1e3a8a", "#22d3ee", "#f59e0b", "#ef4444"] } },
      grid: { left: 54, right: 72, top: 26, bottom: 42 },
      xAxis: axis({ type: "value", min: 73, max: 135, name: "经度" }),
      yAxis: axis({ type: "value", min: 18, max: 54, name: "纬度" }),
      series: [{
        type: "scatter",
        data: rows.map(function (r) { return [r["经度"], r["纬度"], r["记录数"], r["省份"], r["院校数"], r["初试中位数"]]; }),
        symbolSize: function (d) { return 8 + Math.sqrt(d[2] || 1) * 0.9; },
        itemStyle: { opacity: 0.78, borderColor: "#dbeafe", borderWidth: 1 },
        label: { show: true, formatter: function (p) { return p.data[3]; }, color: chartText, fontSize: 10, position: "right" }
      }]
    });
  }

  function drawRadar(rows) {
    var chart = initChart("radarChart");
    var data = rows.slice(0, 6);
    var maxRecords = Math.max.apply(null, data.map(function (r) { return num(r["记录数"], 1); }));
    var maxSchools = Math.max.apply(null, data.map(function (r) { return num(r["覆盖院校数"], 1); }));
    var maxScore = Math.max.apply(null, data.map(function (r) { return num(r["初试中位数"], 1); }));
    chart.setOption({
      tooltip: {},
      legend: { bottom: 0, type: "scroll", textStyle: { color: chartText } },
      radar: {
        indicator: [
          { name: "热度", max: maxRecords },
          { name: "覆盖院校", max: maxSchools },
          { name: "初试中位数", max: maxScore },
          { name: "录取率", max: 100 }
        ],
        axisName: { color: chartText },
        splitLine: { lineStyle: { color: gridLine } },
        splitArea: { areaStyle: { color: ["rgba(59,130,246,.04)", "rgba(34,211,238,.04)"] } }
      },
      series: [{
        type: "radar",
        data: data.map(function (r) {
          return { name: r["专业类别"], value: [r["记录数"], r["覆盖院校数"], r["初试中位数"], r["录取率"]] };
        })
      }]
    });
  }

  function drawParallel(rows) {
    var chart = initChart("parallelChart");
    chart.setOption({
      tooltip: {
        formatter: function (p) {
          return p.data[5] + "<br>样本数：" + p.data[0] + "<br>专业数：" + p.data[1] + "<br>年份覆盖：" + p.data[2] + "<br>初试中位数：" + p.data[3] + "<br>录取率：" + p.data[4] + "%";
        }
      },
      parallelAxis: [
        { dim: 0, name: "样本数" },
        { dim: 1, name: "专业数" },
        { dim: 2, name: "年份覆盖" },
        { dim: 3, name: "初试中位数" },
        { dim: 4, name: "录取率" }
      ].map(function (item) { return Object.assign(item, { nameTextStyle: { color: chartText }, axisLabel: { color: chartText } }); }),
      parallel: { left: 70, right: 60, top: 46, bottom: 28, parallelAxisDefault: { type: "value", splitLine: { show: false }, axisLine: { lineStyle: { color: "rgba(200,216,246,.28)" } } } },
      series: [{
        type: "parallel",
        lineStyle: { width: 1.5, opacity: 0.38 },
        data: rows.map(function (r) { return [r["样本数"], r["专业数"], r["覆盖年份数"], r["初试中位数"], r["录取率"], r["院校"]]; })
      }]
    });
  }

  function drawTreemap(data) {
    var chart = initChart("treemapChart");
    chart.setOption({
      tooltip: { trigger: "item", formatter: "{b}: {c}" },
      series: [{
        type: "treemap",
        data: data || [],
        roam: false,
        breadcrumb: { show: false },
        label: { color: "#edf4ff", fontWeight: 700 },
        upperLabel: { show: true, color: "#edf4ff" },
        itemStyle: { borderColor: "#0b1220", borderWidth: 2, gapWidth: 2 }
      }]
    });
  }

  function drawWordCloud(rows) {
    var el = $("wordCloudPanel");
    var maxValue = Math.max.apply(null, rows.map(function (r) { return num(r["权重"]); }).concat([1]));
    el.innerHTML = rows.map(function (r, i) {
      var pct = num(r["权重"]) / maxValue;
      var size = 15 + pct * 26;
      var color = palette[i % palette.length];
      return '<span style="font-size:' + size.toFixed(1) + 'px;color:' + color + '">' + r["关键词"] + '</span>';
    }).join("");
  }

  function drawPointMap(rows) {
    var chart = initChart("pointMapChart");
    var maxRecords = Math.max.apply(null, rows.map(function (r) { return num(r["记录数"]); }).concat([1]));
    chart.setOption({
      tooltip: {
        formatter: function (p) {
          var d = p.data;
          return d[3] + "<br>省份：" + d[4] + "<br>记录数：" + d[2] + "<br>专业数：" + d[5] + "<br>初试中位数：" + value(d[6]);
        }
      },
      visualMap: { min: 0, max: maxRecords, dimension: 2, right: 18, top: 28, textStyle: { color: chartText }, inRange: { color: ["#60a5fa", "#22d3ee", "#f59e0b", "#ef4444"] } },
      grid: { left: 58, right: 86, top: 34, bottom: 46 },
      xAxis: axis({ type: "value", min: 73, max: 135, name: "经度" }),
      yAxis: axis({ type: "value", min: 18, max: 54, name: "纬度" }),
      series: [{
        type: "scatter",
        data: rows.map(function (r) { return [r["经度"], r["纬度"], r["记录数"], r["院校"], r["省份"], r["专业数"], r["初试中位数"]]; }),
        symbolSize: function (d) { return 7 + Math.sqrt(d[2] || 1) * 0.55; },
        itemStyle: { opacity: 0.82, borderColor: "#eff6ff", borderWidth: 1 },
        label: {
          show: true,
          formatter: function (p) { return p.data[2] >= 650 || p.data[6] >= 375 ? p.data[3] : ""; },
          position: "right",
          color: chartText,
          fontSize: 11
        }
      }]
    });
  }

  function renderAdvice(rows) {
    $("adviceList").innerHTML = rows.slice(0, 24).map(function (r) {
      return '<div class="advice-item"><div><strong>' + r["院校"] + '</strong><span>初试中位数 ' + value(r["初试中位数"]) + ' / 样本数 ' + value(r["样本数"]) + ' / 专业数 ' + value(r["专业数"]) + ' / 录取率 ' + value(r["录取率"]) + '%</span><br><span>' + value(r["建议"]) + '</span></div><div class="tag">' + value(r["择校难度"]) + '</div></div>';
    }).join("");
  }

  function renderDashboard(data) {
    renderMetrics(data.summary || {});
    drawGroupedBar(data.yearStats || []);
    drawStackedBar(data.stackedScore || []);
    drawDivergingBar(data.admissionBand || []);
    drawWaterfall(data.waterfall || []);
    drawBullet(data.bullet || []);
    drawMultiLine(data.trendSchools || []);
    drawArea(data.yearStats || []);
    drawIntervalLine(data.intervalLine || []);
    drawNestedDonut(data.nestedDonut || {});
    drawExplodedPie(data.pie || []);
    drawSunburst(data.sunburst || []);
    drawSankey(data.sankey || {});
    drawBubble(data.schoolRank || []);
    drawMatrixHeatmap(data.matrixHeatmap || {});
    drawGeoHeat(data.provinceStats || []);
    drawRadar(data.majorCategory || []);
    drawParallel(data.parallel || []);
    drawTreemap(data.treemap || []);
    drawWordCloud(data.wordcloud || []);
    drawPointMap(data.pointMap || []);
    renderAdvice(data.recommendations || []);
  }

  function boot() {
    if (!window.echarts) {
      setApiState("ECharts 未加载", true);
      return;
    }
    $("searchBtn").onclick = search;
    $("refreshBtn").onclick = boot;
    $("exportBtn").onclick = function () {
      window.location.href = "/api/search?" + queryParams(true);
    };

    fetchJSON("/api/options", renderOptions, function (err) {
      setApiState(err.message, true);
    });
    fetchJSON("/api/dashboard", function (data) {
      renderDashboard(data);
      setApiState("已连接");
      search();
    }, function (err) {
      setApiState(err.message, true);
      $("metricGrid").innerHTML = '<div class="loading-card">后端接口加载失败：' + err.message + '</div>';
    });
  }

  window.addEventListener("resize", function () {
    Object.keys(charts).forEach(function (id) {
      charts[id].resize();
    });
  });

  boot();
})();
