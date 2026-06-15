(function () {
  var charts = {};
  var lastQuery = "";
  var chartText = "#c8d8f6";
  var gridLine = "rgba(135,160,210,.14)";

  function $(id) {
    return document.getElementById(id);
  }

  function value(v) {
    return v === null || v === undefined || Number.isNaN(v) ? "" : v;
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

  function renderMetrics(summary) {
    var items = [
      ["总记录数", summary["总记录数"], "清洗后的全部记录"],
      ["覆盖院校", summary["覆盖院校"], "可用于横向比较"],
      ["专业数量", summary["专业数量"], "信息类专业/方向"],
      ["年份范围", summary["年份范围"], "时间覆盖"],
      ["初试中位数", summary["初试中位数"], "全局参考线"],
      ["录取记录数", summary["录取记录数"], "含录取状态记录"]
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
    lastQuery = params.join("&");
    return lastQuery;
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

  function axis() {
    return {
      axisLabel: { color: chartText },
      axisLine: { lineStyle: { color: "rgba(200,216,246,.28)" } },
      splitLine: { lineStyle: { color: gridLine } }
    };
  }

  function drawYear(rows) {
    var chart = initChart("yearChart");
    chart.setOption({
      tooltip: { trigger: "axis" },
      legend: { textStyle: { color: chartText } },
      grid: { left: 54, right: 22, top: 48, bottom: 36 },
      xAxis: Object.assign({ type: "category", data: rows.map(function (r) { return r["年份"]; }) }, axis()),
      yAxis: Object.assign({ type: "value" }, axis()),
      series: [
        { name: "记录数", type: "bar", data: rows.map(function (r) { return r["记录数"]; }), itemStyle: { color: "#3b82f6" } },
        { name: "院校数", type: "line", smooth: true, data: rows.map(function (r) { return r["院校数"]; }), itemStyle: { color: "#22c55e" } },
        { name: "专业数", type: "line", smooth: true, data: rows.map(function (r) { return r["专业数"]; }), itemStyle: { color: "#22d3ee" } },
        { name: "初试中位数", type: "line", smooth: true, yAxisIndex: 0, data: rows.map(function (r) { return r["初试中位数"]; }), itemStyle: { color: "#f59e0b" } }
      ]
    });
  }

  function drawScoreBand(rows) {
    var chart = initChart("scoreBandChart");
    chart.setOption({
      tooltip: { trigger: "axis" },
      grid: { left: 72, right: 26, top: 20, bottom: 38 },
      xAxis: Object.assign({ type: "category", data: rows.map(function (r) { return r["分数段"]; }), axisLabel: { color: chartText, rotate: 28 } }, axis()),
      yAxis: Object.assign({ type: "value" }, axis()),
      series: [{ name: "记录数", type: "bar", data: rows.map(function (r) { return r["记录数"]; }), itemStyle: { color: "#22d3ee", borderRadius: [8, 8, 0, 0] } }]
    });
  }

  function drawBubble(rows) {
    var chart = initChart("bubbleChart");
    var maxMajor = Math.max.apply(null, rows.map(function (r) { return r["专业数"] || 1; }));
    chart.setOption({
      tooltip: {
        formatter: function (p) {
          var d = p.data;
          return d[3] + "<br>样本数：" + d[0] + "<br>初试中位数：" + d[1] + "<br>专业数：" + d[2];
        }
      },
      grid: { left: 64, right: 28, top: 28, bottom: 48 },
      xAxis: Object.assign({ type: "value", name: "样本数", min: 0 }, axis()),
      yAxis: Object.assign({ type: "value", name: "初试中位数", min: 250 }, axis()),
      series: [{
        type: "scatter",
        data: rows.map(function (r) { return [r["样本数"], r["初试中位数"], r["专业数"], r["院校"]]; }),
        symbolSize: function (d) { return 12 + (d[2] || 1) / maxMajor * 42; },
        itemStyle: { color: "rgba(59,130,246,.72)", borderColor: "#22d3ee", borderWidth: 1 },
        markLine: { data: [{ yAxis: 360, name: "360参考线" }], lineStyle: { color: "#ef4444", type: "dashed" } }
      }]
    });
  }

  function drawSchool(rows) {
    var chart = initChart("schoolChart");
    var names = rows.map(function (r) { return r["院校"]; }).reverse();
    chart.setOption({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { textStyle: { color: chartText } },
      grid: { left: 116, right: 26, top: 44, bottom: 26 },
      xAxis: Object.assign({ type: "value" }, axis()),
      yAxis: Object.assign({ type: "category", data: names }, axis()),
      series: [
        { name: "记录数", type: "bar", data: rows.map(function (r) { return r["记录数"]; }).reverse(), itemStyle: { color: "#3b82f6" } },
        { name: "专业数", type: "bar", data: rows.map(function (r) { return r["专业数"]; }).reverse(), itemStyle: { color: "#22c55e" } }
      ]
    });
  }

  function drawRadar(rows) {
    var chart = initChart("radarChart");
    var data = rows.slice(0, 6);
    var maxRecords = Math.max.apply(null, data.map(function (r) { return r["记录数"] || 1; }));
    var maxSchools = Math.max.apply(null, data.map(function (r) { return r["覆盖院校数"] || 1; }));
    var maxScore = Math.max.apply(null, data.map(function (r) { return r["初试中位数"] || 1; }));
    chart.setOption({
      tooltip: {},
      legend: { bottom: 0, textStyle: { color: chartText } },
      radar: {
        indicator: [
          { name: "热度", max: maxRecords },
          { name: "覆盖院校", max: maxSchools },
          { name: "初试中位数", max: maxScore },
          { name: "均分", max: maxScore }
        ],
        axisName: { color: chartText },
        splitLine: { lineStyle: { color: gridLine } },
        splitArea: { areaStyle: { color: ["rgba(59,130,246,.04)", "rgba(34,211,238,.04)"] } }
      },
      series: [{
        type: "radar",
        data: data.map(function (r) {
          return { name: r["专业"], value: [r["记录数"], r["覆盖院校数"], r["初试中位数"], r["初试均分"]] };
        })
      }]
    });
  }

  function drawHeatmap(rows) {
    var chart = initChart("heatmapChart");
    var years = rows.map(function (r) { return String(r["年份"]); });
    var bands = Object.keys(rows[0] || {}).filter(function (k) { return k !== "年份"; });
    var values = [];
    rows.forEach(function (row, y) {
      bands.forEach(function (band, x) {
        values.push([x, y, row[band] || 0]);
      });
    });
    var maxValue = Math.max.apply(null, values.map(function (v) { return v[2]; }).concat([1]));
    chart.setOption({
      tooltip: { position: "top" },
      grid: { top: 24, left: 58, right: 24, bottom: 82 },
      xAxis: Object.assign({ type: "category", data: bands, axisLabel: { color: chartText, rotate: 30 } }, axis()),
      yAxis: Object.assign({ type: "category", data: years }, axis()),
      visualMap: { min: 0, max: maxValue, calculable: true, orient: "horizontal", left: "center", bottom: 8, textStyle: { color: chartText }, inRange: { color: ["#0b1220", "#1d4ed8", "#22d3ee", "#f59e0b"] } },
      series: [{ type: "heatmap", data: values, label: { show: true, color: "#fff" } }]
    });
  }

  function drawProvince(rows) {
    var chart = initChart("provinceChart");
    var top = rows.slice(0, 12);
    chart.setOption({
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: chartText } },
      series: [{
        type: "pie",
        radius: ["42%", "68%"],
        center: ["50%", "45%"],
        data: top.map(function (r) { return { name: r["省份"], value: r["记录数"] }; }),
        label: { color: chartText }
      }]
    });
  }

  function drawAdmit(rows) {
    var chart = initChart("admitChart");
    chart.setOption({
      tooltip: { trigger: "axis" },
      grid: { left: 54, right: 32, top: 36, bottom: 42 },
      xAxis: Object.assign({ type: "category", data: rows.map(function (r) { return r["分数段"]; }) }, axis()),
      yAxis: Object.assign({ type: "value", name: "录取率%" }, axis()),
      series: [{ type: "line", smooth: true, areaStyle: { color: "rgba(34,197,94,.16)" }, data: rows.map(function (r) { return r["录取率"]; }), itemStyle: { color: "#22c55e" } }]
    });
  }

  function drawTrend(rows) {
    var chart = initChart("trendChart");
    var years = Array.from(new Set(rows.map(function (r) { return r["年份"]; }))).sort();
    var schools = Array.from(new Set(rows.map(function (r) { return r["院校"]; })));
    chart.setOption({
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, type: "scroll", textStyle: { color: chartText } },
      grid: { left: 56, right: 28, top: 26, bottom: 78 },
      xAxis: Object.assign({ type: "category", data: years }, axis()),
      yAxis: Object.assign({ type: "value", min: 250 }, axis()),
      series: schools.map(function (school) {
        return {
          name: school,
          type: "line",
          smooth: true,
          data: years.map(function (year) {
            var item = rows.find(function (r) { return r["院校"] === school && r["年份"] === year; });
            return item ? item["初试中位数"] : null;
          })
        };
      })
    });
  }

  function renderAdvice(rows) {
    $("adviceList").innerHTML = rows.slice(0, 18).map(function (r) {
      return '<div class="advice-item"><div><strong>' + r["院校"] + '</strong><span>初试中位数 ' + value(r["初试中位数"]) + ' / 样本数 ' + value(r["样本数"]) + ' / 专业数 ' + value(r["专业数"]) + '</span><br><span>' + value(r["建议"]) + '</span></div><div class="tag">' + value(r["择校难度"]) + '</div></div>';
    }).join("");
  }

  function renderDashboard(data) {
    renderMetrics(data.summary || {});
    drawYear(data.yearStats || []);
    drawScoreBand(data.scoreBand || []);
    drawBubble(data.schoolRank || []);
    drawSchool(data.schoolRank || []);
    drawRadar(data.majorRank || []);
    drawHeatmap(data.heatmap || []);
    drawProvince(data.provinceStats || []);
    drawAdmit(data.admissionBand || []);
    drawTrend(data.trendSchools || []);
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
