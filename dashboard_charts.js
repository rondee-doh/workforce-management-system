(() => {
  // Helper to retrieve stored entries from localStorage or global variables
  function getStoredEntries() {
    const tryKeys = ['workEntries','entries','timeEntries','fteEntries','storedEntries'];
    for (const k of tryKeys) {
      try {
        const v = JSON.parse(localStorage.getItem(k));
        if (Array.isArray(v) && v.length) return v;
      } catch(e) {}
    }
    // global arrays fallbacks
    if (Array.isArray(window.entries) && window.entries.length) return window.entries;
    if (Array.isArray(window.workEntries) && window.workEntries.length) return window.workEntries;
    return [];
  }

  // Convert a date-like value to a Date with no time
  function toDateOnly(d) {
    const dt = new Date(d);
    if (isNaN(dt)) return null;
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  // Determine if a date string is between two dates inclusive
  function inBetween(entryDate, start, end) {
    const e = toDateOnly(entryDate);
    if (!e) return false;
    const s = start ? toDateOnly(start) : null;
    const en = end ? toDateOnly(end) : null;
    if (s && e < s) return false;
    if (en && e > en) return false;
    return true;
  }

  // Gather unique employee names from stored entries
  function getEmployeeNames() {
    const entries = getStoredEntries();
    const names = [];
    for (const e of entries) {
      const name = e.employeeName || e.EmployeeName || e.employee || e.Employee;
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
    return names.sort();
  }

  // Aggregate hours by task group for a given employee and date range
  function aggregateForEmployee(employee, startDate, endDate) {
    const raw = getStoredEntries();
    const map = {};
    for (const e of raw) {
      const name = e.employeeName || e.EmployeeName || e.employee || e.Employee;
      if (employee && name !== employee) continue;
      if (!inBetween(e.logDate || e.date || e.LogDate, startDate, endDate)) continue;
      const tg = (e.taskGroup || e.TaskGroup || e.group || 'Unspecified').trim();
      let hrs;
      // compute hours
      if (typeof e.hoursWorked === 'number' && isFinite(e.hoursWorked)) {
        hrs = Math.max(0, e.hoursWorked);
      } else {
        // derive from startTime/endTime
        const st = parseTime(e.startTime);
        const et = parseTime(e.endTime);
        if (!st || !et) continue;
        let diff = (et - st) / (1000 * 60 * 60);
        if (diff < 0) diff += 24;
        hrs = Math.max(0, diff);
      }
      map[tg] = (map[tg] || 0) + hrs;
    }
    // sort descending
    return Object.entries(map).sort((a,b) => b[1] - a[1]);
  }

  // Aggregate hours by task group across all employees for a time range label (daily/weekly/monthly)
  function aggregateForAll(range) {
    const raw = getStoredEntries();
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let from;
    switch (range) {
      case 'daily':
        from = startOfDay;
        break;
      case 'weekly':
        from = new Date(startOfDay);
        from.setDate(from.getDate() - 6);
        break;
      case 'monthly':
        from = new Date(startOfDay);
        from.setDate(from.getDate() - 29);
        break;
      default:
        from = null;
    }
    const map = {};
    for (const e of raw) {
      const entryDate = e.logDate || e.date || e.LogDate;
      if (range !== 'all' && !inBetween(entryDate, from, startOfDay)) continue;
      const tg = (e.taskGroup || e.TaskGroup || e.group || 'Unspecified').trim();
      let hrs;
      if (typeof e.hoursWorked === 'number' && isFinite(e.hoursWorked)) {
        hrs = Math.max(0, e.hoursWorked);
      } else {
        const st = parseTime(e.startTime);
        const et = parseTime(e.endTime);
        if (!st || !et) continue;
        let diff = (et - st) / (1000 * 60 * 60);
        if (diff < 0) diff += 24;
        hrs = Math.max(0, diff);
      }
      map[tg] = (map[tg] || 0) + hrs;
    }
    return Object.entries(map).sort((a,b) => b[1] - a[1]);
  }

  // Parse times like "HH:MM" or "HH:MM AM/PM"
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
    const d = new Date();
    d.setHours(h,m,0,0);
    return d;
  }

  // Create a doughnut chart on a canvas with given data
  function renderDonut(canvas, data) {
    const ctx = canvas.getContext('2d');
    // destroy previous chart if exists
    if (canvas._chart) {
      canvas._chart.destroy();
      canvas._chart = null;
    }
    if (!data.length) {
      // hide chart if no data
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = 'block';
    const labels = data.map(d => d[0]);
    const values = data.map(d => +d[1].toFixed(2));
    const bg = labels.map((_, i) => `hsl(${(i*67)%360} 65% 60% / 0.9)`);
    const border = labels.map((_, i) => `hsl(${(i*67)%360} 65% 35% / 1)`);
    const dataset = {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bg,
        borderColor: border,
        borderWidth: 1
      }]
    };
    canvas._chart = new Chart(ctx, {
      type: 'doughnut',
      data: dataset,
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                const total = values.reduce((a,b) => a+b, 0) || 1;
                const v = ctx.parsed;
                const pct = ((v / total)*100).toFixed(1);
                return `${ctx.label}: ${v.toFixed(2)} hrs (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Build dashboard section into the page
  function initDashboard() {
    // Ensure Chart.js is loaded; rely on existing global Chart
    if (typeof Chart === 'undefined') return;
    // Insert section only once
    if (document.getElementById('employee-dashboard')) return;
    const reportsSection = document.querySelector('.reports-section');
    const parent = reportsSection ? reportsSection.parentNode : document.body;

    // Create container
    const wrapper = document.createElement('div');
    wrapper.id = 'dashboard-section';
    wrapper.style.marginTop = '2rem';

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Dashboard';
    wrapper.appendChild(title);

    // Employee donut section
    const empSection = document.createElement('div');
    empSection.id = 'employee-donut-section';
    empSection.style.marginTop = '1rem';
    const empTitle = document.createElement('h3');
    empTitle.textContent = 'Employee Task Group Distribution';
    empSection.appendChild(empTitle);
    // employee select
    const empLabel = document.createElement('label');
    empLabel.textContent = 'Employee: ';
    empSection.appendChild(empLabel);
    const empSelect = document.createElement('select');
    empSelect.id = 'employeeSelect';
    empLabel.appendChild(empSelect);
    // date inputs
    const startLabel = document.createElement('label');
    startLabel.textContent = ' Start Date: ';
    empSection.appendChild(startLabel);
    const empStart = document.createElement('input');
    empStart.type = 'date';
    empStart.id = 'empStartDate';
    startLabel.appendChild(empStart);
    const endLabel = document.createElement('label');
    endLabel.textContent = ' End Date: ';
    empSection.appendChild(endLabel);
    const empEnd = document.createElement('input');
    empEnd.type = 'date';
    empEnd.id = 'empEndDate';
    endLabel.appendChild(empEnd);
    // canvas
    const empCanvas = document.createElement('canvas');
    empCanvas.id = 'employeeDonut';
    empCanvas.width = 400;
    empCanvas.height = 300;
    empSection.appendChild(empCanvas);
    wrapper.appendChild(empSection);

    // All employees donut section
    const allSection = document.createElement('div');
    allSection.id = 'all-donut-section';
    allSection.style.marginTop = '1rem';
    const allTitle = document.createElement('h3');
    allTitle.textContent = 'All Employees Task Group Distribution';
    allSection.appendChild(allTitle);
    const allLabel = document.createElement('label');
    allLabel.textContent = 'Range: ';
    allSection.appendChild(allLabel);
    const rangeSelect = document.createElement('select');
    rangeSelect.id = 'allRangeSelect';
    ['daily','weekly','monthly'].forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val === 'daily' ? 'Today' : val === 'weekly' ? 'Last 7 days' : 'Last 30 days';
      rangeSelect.appendChild(opt);
    });
    allLabel.appendChild(rangeSelect);
    const allCanvas = document.createElement('canvas');
    allCanvas.id = 'allDonut';
    allCanvas.width = 400;
    allCanvas.height = 300;
    allSection.appendChild(allCanvas);
    wrapper.appendChild(allSection);

    // Logs tracker section
    const logsSec = document.createElement('div');
    logsSec.id = 'logs-section';
    logsSec.style.marginTop = '1rem';
    const logsTitle = document.createElement('h3');
    logsTitle.textContent = 'Logs Tracker';
    logsSec.appendChild(logsTitle);
    const table = document.createElement('table');
    table.id = 'logsTable';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Timestamp','Location','Map'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      th.style.borderBottom = '1px solid #ccc';
      th.style.padding = '4px 8px';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    logsSec.appendChild(table);
    wrapper.appendChild(logsSec);

    // Insert wrapper after reportsSection if available
    if (reportsSection) {
      parent.insertBefore(wrapper, reportsSection.nextSibling);
    } else {
      document.body.appendChild(wrapper);
    }

    // Populate employee select
    function populateEmployees() {
      const select = document.getElementById('employeeSelect');
      // clear existing
      while (select.firstChild) select.removeChild(select.firstChild);
      const optDefault = document.createElement('option');
      optDefault.value = '';
      optDefault.textContent = '--Select--';
      select.appendChild(optDefault);
      const names = getEmployeeNames();
      names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });
    }

    // Update employee donut chart
    function updateEmployeeChart() {
      const emp = empSelect.value || null;
      const start = empStart.value || null;
      const end = empEnd.value || null;
      const data = aggregateForEmployee(emp, start, end);
      renderDonut(empCanvas, data);
    }

    // Update all employees donut chart
    function updateAllChart() {
      const range = rangeSelect.value;
      const data = aggregateForAll(range);
      renderDonut(allCanvas, data);
    }

    // Update logs table
    function updateLogsTable() {
      const logs = JSON.parse(localStorage.getItem('entryLogs') || '[]');
      const body = table.querySelector('tbody');
      while (body.firstChild) body.removeChild(body.firstChild);
      logs.forEach(log => {
        const row = document.createElement('tr');
        const tdTime = document.createElement('td');
        tdTime.textContent = new Date(log.date).toLocaleString();
        tdTime.style.padding = '4px 8px';
        const tdLoc = document.createElement('td');
        tdLoc.textContent = `${log.lat.toFixed(5)}, ${log.lon.toFixed(5)}`;
        tdLoc.style.padding = '4px 8px';
        const tdLink = document.createElement('td');
        const link = document.createElement('a');
        link.href = `https://www.google.com/maps?q=${log.lat},${log.lon}`;
        link.target = '_blank';
        link.textContent = 'View';
        tdLink.appendChild(link);
        tdLink.style.padding = '4px 8px';
        row.appendChild(tdTime);
        row.appendChild(tdLoc);
        row.appendChild(tdLink);
        body.appendChild(row);
      });
    }

    // Event listeners
    empSelect.addEventListener('change', updateEmployeeChart);
    empStart.addEventListener('change', updateEmployeeChart);
    empEnd.addEventListener('change', updateEmployeeChart);
    rangeSelect.addEventListener('change', updateAllChart);

    // Hook into Add Entry button to capture location logs
    const addBtn = document.getElementById('addEntryBtn') || document.querySelector('button#addEntryBtn') || document.querySelector('button[onclick="addEntry()"]');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((pos) => {
            const logs = JSON.parse(localStorage.getItem('entryLogs') || '[]');
            logs.push({date: new Date().toISOString(), lat: pos.coords.latitude, lon: pos.coords.longitude});
            localStorage.setItem('entryLogs', JSON.stringify(logs));
            updateLogsTable();
          });
        }
        // Delay updating charts to allow underlying data to update
        setTimeout(() => {
          populateEmployees();
          updateEmployeeChart();
          updateAllChart();
        }, 0);
      });
    }

    // Also update logs and charts when Generate Report button is clicked, in case entries changed
    const genBtn = Array.from(document.querySelectorAll('button, input[type="button"]')).find(b => /generate report/i.test(b.textContent || b.value || ''));
    if (genBtn) {
      genBtn.addEventListener('click', () => {
        setTimeout(() => {
          populateEmployees();
          updateEmployeeChart();
          updateAllChart();
          updateLogsTable();
        }, 0);
      });
    }

    // Initial population
    populateEmployees();
    updateEmployeeChart();
    updateAllChart();
    updateLogsTable();
  }

  // Wait for DOM and Chart library to initialize
  function start() {
    if (typeof Chart !== 'undefined') {
      initDashboard();
    } else {
      // Wait until Chart script loads; check every 100ms
      const intId = setInterval(() => {
        if (typeof Chart !== 'undefined') {
          clearInterval(intId);
          initDashboard();
        }
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
