(() => {
  function loadChartJS(callback) {
    if (typeof Chart !== 'undefined') { callback(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    script.onload = callback;
    document.head.appendChild(script);
  }
  function initTaskGroupPieChart() {
    // Avoid duplicate container
    if (document.getElementById('task-group-pie-wrap')) return;
    // create container
    const wrap = document.createElement('div');
    wrap.id = 'task-group-pie-wrap';
    wrap.style.marginTop = '1rem';
    const controlsDiv = document.createElement('div');
    controlsDiv.style.display = 'flex';
    controlsDiv.style.alignItems = 'center';
    controlsDiv.style.gap = '.75rem';
    controlsDiv.style.flexWrap = 'wrap';
    const title = document.createElement('h3');
    title.textContent = 'Task Group Share of Hours';
    title.style.margin = '0';
    controlsDiv.appendChild(title);
    const label = document.createElement('label');
    label.htmlFor = 'tgPieRange';
    label.style.fontWeight = '600';
    label.textContent = 'Range:';
    controlsDiv.appendChild(label);
    const select = document.createElement('select');
    select.id = 'tgPieRange';
    const opts = [
      {value:'daily', text:'Today'},
      {value:'weekly', text:'Last 7 days'},
      {value:'monthly', text:'Last 30 days'},
      {value:'all', text:'All time'},
    ];
    opts.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.text;
      if (opt.value === 'monthly') o.selected = true;
      select.appendChild(o);
    });
    controlsDiv.appendChild(select);
    wrap.appendChild(controlsDiv);
    const canvas = document.createElement('canvas');
    canvas.id = 'taskGroupPie';
    canvas.width = 560;
    canvas.height = 360;
    canvas.style.maxWidth = '100%';
    wrap.appendChild(canvas);
    const emptyP = document.createElement('p');
    emptyP.id = 'tgPieEmpty';
    emptyP.style.display = 'none';
    emptyP.style.margin = '.5rem 0 0';
    emptyP.style.color = '#666';
    emptyP.textContent = 'No data found for the selected range.';
    wrap.appendChild(emptyP);
    document.body.appendChild(wrap);

    // data functions
    function getStoredEntries() {
      const tryKeys = ['workEntries','entries','timeEntries','fteEntries','storedEntries'];
      for (const k of tryKeys) {
        try {
          const v = JSON.parse(localStorage.getItem(k));
          if (Array.isArray(v) && v.length) return v;
        } catch(e){}
      }
      if (Array.isArray(window.entries) && window.entries.length) return window.entries;
      if (Array.isArray(window.workEntries) && window.workEntries.length) return window.workEntries;
      return [];
    }
    function toDateOnly(d) {
      const dt = new Date(d);
      if (isNaN(dt)) return null;
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }
    function inRange(entryDate, range) {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      let from;
      switch(range) {
        case 'daily': from = start; break;
        case 'weekly':
          from = new Date(start);
          from.setDate(from.getDate() - 6);
          break;
        case 'monthly':
          from = new Date(start);
          from.setDate(from.getDate() - 29);
          break;
        default:
          return true;
      }
      const e = toDateOnly(entryDate);
      return e && e >= from && e <= start;
    }
    function parseTime(t) {
      if (!t) return null;
      const s = String(t).trim();
      const ampm = s.match(/am|pm/i);
      let [h,m] = s.replace(/am|pm/i,'').trim().split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      if (ampm) {
        const ap = ampm[0].toLowerCase();
        if (ap === 'pm' && h < 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
      }
      const d = new Date(); d.setHours(h,m,0,0);
      return d;
    }
    function hoursFor(entry) {
      if (typeof entry.hoursWorked === 'number' && isFinite(entry.hoursWorked)) {
        return Math.max(0, entry.hoursWorked);
      }
      const st = parseTime(entry.startTime);
      const et = parseTime(entry.endTime);
      if (!st || !et) return 0;
      let diff = (et - st) / (1000 * 60 * 60);
      if (diff < 0) diff += 24;
      return Math.max(0, diff);
    }
    function aggregateByTaskGroup(range) {
      const raw = getStoredEntries();
      const filtered = raw.filter(e => inRange(e.logDate || e.date || e.LogDate, range));
      const map = {};
      filtered.forEach(e => {
        const tg = (e.taskGroup || e.TaskGroup || e.group || 'Unspecified').trim();
        const hrs = hoursFor(e);
        map[tg] = (map[tg] || 0) + hrs;
      });
      return Object.entries(map).sort((a,b) => b[1] - a[1]);
    }
    let pieChart;
    function renderPie(range) {
      const data = aggregateByTaskGroup(range);
      if (!data.length) {
        canvas.style.display = 'none';
        emptyP.style.display = 'block';
        if (pieChart) { pieChart.destroy(); pieChart = null; }
        return;
      }
      canvas.style.display = 'block';
      emptyP.style.display = 'none';
      const labels = data.map(d => d[0]);
      const values = data.map(d => +d[1].toFixed(2));
      const bg = labels.map((_, i) => `hsl(${(i*57)%360} 70% 60% / 0.9)`);
      const border = labels.map((_, i) => `hsl(${(i*57)%360} 70% 35% / 1)`);
      const ds = {
        labels,
        datasets: [{
          data: values,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1
        }]
      };
      if (pieChart) pieChart.destroy();
      pieChart = new Chart(canvas.getContext('2d'), {
        type: 'pie',
        data: ds,
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'right' },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  const total = values.reduce((a,b)=>a+b,0) || 1;
                  const v = ctx.parsed;
                  const pct = ((v/total)*100).toFixed(1);
                  return `${ctx.label}: ${v.toFixed(2)} hrs (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }
    select.addEventListener('change', () => renderPie(select.value));
    const genBtn = Array.from(document.querySelectorAll('button, input[type="button"]'))
      .find(b => /generate report/i.test(b.textContent || b.value || ''));
    if (genBtn) {
      genBtn.addEventListener('click', () => {
        setTimeout(() => renderPie(select.value), 0);
      });
    }
    renderPie(select.value);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadChartJS(initTaskGroupPieChart));
  } else {
    loadChartJS(initTaskGroupPieChart);
  }
})();