(function () {
  var summaryCards = document.getElementById('summaryCards');
  var summaryMini = document.getElementById('summaryMini');
  var yearSelect = document.getElementById('yearSelect');
  var schoolInput = document.getElementById('schoolInput');
  var keywordInput = document.getElementById('keywordInput');
  var searchBtn = document.getElementById('searchBtn');
  var exportBtn = document.getElementById('exportBtn');
  var resultBody = document.getElementById('resultBody');
  var statusBanner = document.getElementById('statusBanner');
  var charts = {};
  var initialData = readInitialData();

  function val(x) { return x === null || x === undefined ? '' : x; }

  function readInitialData() {
    var el = document.getElementById('initialData');
    if (!el) return null;
    var raw = el.textContent || el.innerText || '';
    raw = raw.replace(/^\s+|\s+$/g, '');
    if (!raw || raw.indexOf('SERVER_INITIAL_DATA') >= 0) return null;
    try { return JSON.parse(raw); }
    catch (e) {
      setTimeout(function () {
        setStatus('服务端预加载数据解析失败，正在尝试通过接口加载。', 'error');
      }, 0);
      return null;
    }
  }

  function setStatus(text, kind) {
    if (!statusBanner) return;
    statusBanner.textContent = text;
    statusBanner.style.borderColor = kind === 'error' ? 'rgba(248, 113, 113, 0.5)' : 'rgba(56, 189, 248, 0.35)';
    statusBanner.style.color = kind === 'error' ? '#fecaca' : '#cde4ff';
  }

  function fetchJSON(url, cb, fail) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { cb(JSON.parse(xhr.responseText)); }
        catch (e) { if (fail) fail(e); }
      } else if (fail) {
        fail(new Error(url + ' ' + xhr.status));
      }
    };
    xhr.onerror = function () { if (fail) fail(new Error('网络请求失败: ' + url)); };
    xhr.send();
  }

  function initChart(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    if (typeof window.echarts === 'undefined') {
      setStatus('加载失败：ECharts 图表库没有加载成功。', 'error');
      return null;
    }
    el.innerHTML = '';
    var chart = window.echarts.init(el);
    charts[id] = chart;
    return chart;
  }

  function metricCard(label, value, hint) {
    return '<div class="metric"><div class="k">' + label + '</div><div class="v">' + val(value) + '</div><div class="hint">' + (hint || '') + '</div></div>';
  }

  function miniCard(label, value) {
    return '<div class="mini-card"><div class="k">' + label + '</div><div class="v">' + val(value) + '</div></div>';
  }

  function fillSummary(summary) {
    summaryCards.innerHTML = [
      metricCard('总记录数', summary.records, '统一清洗后的全部数据'),
      metricCard('覆盖院校', summary.schools, '参与对比的学校数量'),
      metricCard('专业数量', summary.majors, '信息类专业/方向'),
      metricCard('年份范围', summary.years, '2020-2026'),
      metricCard('初试中位数', summary.score_median, '全局择校参考线')
    ].join('');
    summaryMini.innerHTML = [
      miniCard('记录', summary.records),
      miniCard('院校', summary.schools),
      miniCard('专业', summary.majors),
      miniCard('中位数', summary.score_median)
    ].join('');
  }

  function fillTable(rows) {
    if (!rows || !rows.length) {
      resultBody.innerHTML = '<tr><td colspan="8">暂无数据</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html += '<tr>' +
        '<td>' + val(r['院校']) + '</td>' +
        '<td>' + val(r['年份']) + '</td>' +
        '<td>' + val(r['院系']) + '</td>' +
        '<td>' + val(r['专业']) + '</td>' +
        '<td>' + val(r['初试成绩']) + '</td>' +
        '<td>' + val(r['复试成绩']) + '</td>' +
        '<td>' + val(r['总成绩']) + '</td>' +
        '<td>' + val(r['是否录取']) + '</td>' +
        '</tr>';
    }
    resultBody.innerHTML = html;
  }

  function drawYear(rows) {
    var chart = initChart('yearChart');
    if (!chart) return;
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#c9d8f6' } },
      grid: { left: 44, right: 24, top: 46, bottom: 36 },
      xAxis: { type: 'category', data: rows.map(function (r) { return String(r['年份']); }), axisLabel: { color: '#9eb3d8' } },
      yAxis: { type: 'value', axisLabel: { color: '#9eb3d8' }, splitLine: { lineStyle: { color: 'rgba(140,165,210,.12)' } } },
      series: [
        { name: '记录数', type: 'bar', barWidth: 18, data: rows.map(function (r) { return r['记录数'] || 0; }), itemStyle: { color: '#3b82f6' } },
        { name: '院校数', type: 'line', smooth: true, data: rows.map(function (r) { return r['院校数'] || 0; }), itemStyle: { color: '#14b8a6' } },
        { name: '初试中位数', type: 'line', smooth: true, data: rows.map(function (r) { return r['初试中位数']; }), itemStyle: { color: '#f59e0b' } }
      ]
    });
  }

  function drawScoreBand(rows) {
    var chart = initChart('scoreBandChart');
    if (!chart) return;
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 70, right: 28, top: 22, bottom: 28 },
      xAxis: { type: 'value', axisLabel: { color: '#9eb3d8' }, splitLine: { lineStyle: { color: 'rgba(140,165,210,.12)' } } },
      yAxis: { type: 'category', data: rows.map(function (r) { return r['分数段']; }), axisLabel: { color: '#dce6ff' } },
      series: [{ type: 'bar', data: rows.map(function (r) { return r['记录数'] || 0; }), itemStyle: { color: '#7c3aed', borderRadius: [0, 8, 8, 0] }, label: { show: true, position: 'right', color: '#fff' } }]
    });
  }

  function drawBubble(rows) {
    var chart = initChart('bubbleChart');
    if (!chart) return;
    var maxMajor = 1;
    for (var i = 0; i < rows.length; i++) maxMajor = Math.max(maxMajor, rows[i]['专业数'] || 1);
    chart.setOption({
      tooltip: { formatter: function (p) { var d = p.data; return d[3] + '<br/>样本数: ' + d[0] + '<br/>初试中位数: ' + d[1] + '<br/>专业数: ' + d[2]; } },
      grid: { left: 58, right: 30, top: 36, bottom: 42 },
      xAxis: { type: 'value', name: '样本数', axisLabel: { color: '#9eb3d8' }, splitLine: { lineStyle: { color: 'rgba(140,165,210,.12)' } } },
      yAxis: { type: 'value', name: '初试中位数', min: 300, axisLabel: { color: '#9eb3d8' }, splitLine: { lineStyle: { color: 'rgba(140,165,210,.12)' } } },
      series: [{ type: 'scatter', symbolSize: function (d) { return 10 + d[2] / maxMajor * 28; }, data: rows.map(function (r) { return [r['样本数'] || 0, r['初试中位数'] || 0, r['专业数'] || 0, r['院校']]; }), itemStyle: { color: '#38bdf8' } }]
    });
  }

  function drawTopSchool(rows) {
    var chart = initChart('topSchoolChart');
    if (!chart) return;
    chart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { textStyle: { color: '#c9d8f6' } },
      grid: { left: 110, right: 20, top: 40, bottom: 26 },
      xAxis: { type: 'value', axisLabel: { color: '#9eb3d8' }, splitLine: { lineStyle: { color: 'rgba(140,165,210,.12)' } } },
      yAxis: { type: 'category', data: rows.map(function (r) { return r['院校']; }).reverse(), axisLabel: { color: '#dce6ff' } },
      series: [
        { name: '记录数', type: 'bar', data: rows.map(function (r) { return r['记录数'] || 0; }).reverse(), itemStyle: { color: '#3b82f6' } },
        { name: '专业数', type: 'bar', data: rows.map(function (r) { return r['专业数'] || 0; }).reverse(), itemStyle: { color: '#14b8a6' } }
      ]
    });
  }

  function drawMajor(rows) {
    var chart = initChart('majorChart');
    if (!chart) return;
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 118, right: 20, top: 20, bottom: 26 },
      xAxis: { type: 'value', axisLabel: { color: '#9eb3d8' }, splitLine: { lineStyle: { color: 'rgba(140,165,210,.12)' } } },
      yAxis: { type: 'category', data: rows.map(function (r) { return r['专业']; }).reverse(), axisLabel: { color: '#dce6ff' } },
      series: [{ type: 'bar', data: rows.map(function (r) { return r['初试中位数'] || 0; }).reverse(), itemStyle: { color: '#f59e0b' } }]
    });
  }

  function drawHeatmap(rows) {
    var chart = initChart('heatmapChart');
    if (!chart || !rows.length) return;
    var years = rows.map(function (r) { return String(r['年份']); });
    var fields = [];
    for (var k in rows[0]) if (k !== '年份') fields.push(k);
    var data = [];
    for (var i = 0; i < rows.length; i++) for (var j = 0; j < fields.length; j++) data.push([j, i, Number(rows[i][fields[j]] || 0)]);
    var maxValue = 1;
    for (var n = 0; n < data.length; n++) maxValue = Math.max(maxValue, data[n][2]);
    chart.setOption({
      tooltip: { position: 'top' },
      grid: { height: '68%', top: 24, left: 58, right: 18 },
      xAxis: { type: 'category', data: fields, axisLabel: { color: '#9eb3d8', rotate: 25 } },
      yAxis: { type: 'category', data: years, axisLabel: { color: '#dce6ff' } },
      visualMap: { min: 0, max: maxValue, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, textStyle: { color: '#c9d8f6' }, inRange: { color: ['#0f172a', '#1d4ed8', '#38bdf8', '#f59e0b'] } },
      series: [{ type: 'heatmap', data: data, label: { show: true, color: '#fff' } }]
    });
  }

  function renderDashboard(data) {
    fillSummary(data.summary || {});
    try { drawYear(data.year_stats || []); } catch (e) { console.error('year chart', e); }
    try { drawScoreBand(data.score_band || []); } catch (e) { console.error('score chart', e); }
    try { drawBubble(data.competition || []); } catch (e) { console.error('bubble chart', e); }
    try { drawTopSchool(data.top_schools || []); } catch (e) { console.error('top school chart', e); }
    try { drawMajor(data.major_rank || []); } catch (e) { console.error('major chart', e); }
    try { drawHeatmap(data.year_heatmap || []); } catch (e) { console.error('heatmap chart', e); }
    setStatus('数据已加载完成。已接入后端接口 /api/dashboard 与 /api/search。');
  }

  function applyOptions(opt) {
    if (!yearSelect || !opt || !opt.years) return;
    var html = '<option value="">全部年份</option>';
    for (var i = 0; i < opt.years.length; i++) html += '<option value="' + opt.years[i] + '">' + opt.years[i] + '</option>';
    yearSelect.innerHTML = html;
  }

  function loadOptions(next) {
    if (initialData && initialData.options) applyOptions(initialData.options);
    fetchJSON('/api/options', function (opt) {
      applyOptions(opt);
      if (next) next();
    }, function (err) {
      if (initialData && initialData.options) {
        if (next) next();
      } else {
        setStatus('加载年份选项失败: ' + err.message, 'error');
      }
    });
  }

  function searchData(exportMode) {
    var params = [];
    if (yearSelect.value) params.push('year=' + encodeURIComponent(yearSelect.value));
    if (schoolInput.value) params.push('school=' + encodeURIComponent(schoolInput.value));
    if (keywordInput.value) params.push('keyword=' + encodeURIComponent(keywordInput.value));
    if (exportMode) {
      params.push('export=1');
      window.location.href = '/api/search?' + params.join('&');
      return;
    }
    fetchJSON('/api/search?' + params.join('&'), fillTable, function (err) { setStatus('查询失败: ' + err.message, 'error'); });
  }

  function boot() {
    setStatus('正在连接后端并加载数据...');
    if (searchBtn) searchBtn.onclick = function () { searchData(false); };
    if (exportBtn) exportBtn.onclick = function () { searchData(true); };
    if (initialData) {
      if (initialData.options) applyOptions(initialData.options);
      if (initialData.dashboard) renderDashboard(initialData.dashboard);
      if (initialData.rows) fillTable(initialData.rows);
      setStatus('服务端预加载数据已显示，正在同步本地后端接口...');
    }
    loadOptions(function () {
      fetchJSON('/api/dashboard', function (data) {
        renderDashboard(data);
        if (!initialData || !initialData.rows) searchData(false);
      }, function (err) { setStatus('加载数据看板失败: ' + err.message, 'error'); });
    });
  }

  window.onresize = function () {
    for (var key in charts) charts[key].resize();
  };

  boot();
})();
