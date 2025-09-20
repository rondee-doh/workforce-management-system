(() => {
  /*
   * Dashboard and Logs Tracker Script
   *
   * This script injects a dashboard into the application that
   * summarizes hours worked by task group for an individual employee
   * or across all employees, using Chart.js doughnut charts.  It
   * exposes two buttons on the page—“Logs Tracker” and “Dashboard”—
   * which toggle the visibility of the logs table and the dashboard
   * respectively.  A “Generate Chart” button in each chart section
   * triggers the computation and rendering of the donut chart based
   * on the selected employee and date range.
   */

  // -----------------------------------------------------------------------------
  // Data retrieval helpers
  //
  // Retrieve stored entries from localStorage or from globally available arrays
  // used by the rest of the application.  Different keys are tried to remain
  // compatible with earlier versions of the app.
  function getStoredEntries() {
    const tryKeys = ['workEntries', 'entries', 'timeEntries', 'fteEntries', 'storedEntries'];
    for (const k of tryKeys) {
      try {
        const v = JSON.parse(localStorage.getItem(k));
        if (Array.isArray(v) && v.length) return v;
      } catch (e) {}
    }
    // fallback to any global arrays if present
    if (Array.isArray(window.entries) && window.entries.length) return window.entries;
    if (Array.isArray(window.workEntries) && window.workEntries.length) return window.workEntries;
    return [];
  }

  // Convert a date-like value into a Date object at midnight (local time).  If
  // the input is invalid, returns null.  This is used to compare dates
  // independently of time.
  function toDateOnly(d) {
    const dt = new Date(d);
    if (isNaN(dt)) return null;
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  // Determine whether an entry date falls within the inclusive range defined by
  // start and end dates.  If either boundary is null/undefined, it is treated
  // as open-ended.  Returns true if the date matches, false otherwise.
  function inBetween(entryDate, start, end) {
    const e = toDateOnly(entryDate);
    if (!e) return false;
    const s = start ? toDateOnly(start) : null;
    const en = end ? toDateOnly(end) : null;
    if (s && e < s) return false;
    if (en && e > en) return false;
    return true;
  }

  // A static fallback list of employee names used if no names are found in
  // storage or on the page.  This list mirrors the options in the main
  // employee dropdown of index.html.  Having this fallback ensures the
  // dashboard always has something to show even before any entries are
  // added and if DOM queries fail for some reason.
  const DEFAULT_EMPLOYEE_NAMES = [
    'DR. ARLENE S. SY',
    'MR. ALLEN JAY P. GONDA',
    'MR. NEIL IRVING QUERUBIN',
    'MS. MICHELLE M. YGAR',
    'MR. REY V. ROLLON',
    'MR. NEREO VILLAFLORES',
    'MS. NADIA CZARINA MAE CORTUNA',
    'MS. GENECA JANEL GENETA-HALUM',
    'MS. EUNICE TADALAN-QUIBOLOY',
    'MS. JULIE CHRISTINE BANDIOLA',
    'MS. MARIA LANY ROSE BRIONES',
    'MS. MARY AUBREY FINEZA',
    'MR. RAFH L. MARASIGAN',
    'MR. LAWRENCE EDWARD MANEJA',
    'MS. AYCA P. HERNANDEZ',
    'MS.DANA TWAIN SOLANO',
    'MR. KEVIN JOHN DANDOY',
    'MR. ROMMEL L. CALANO',
    'MR. ERMIL D. SADOL',
    'MR. MARK RAVEN JAY G. DULAY',
    'MS. LYNNE DENISE TIQUIS',
    'ENGR. MARK JUDE GUERRERO',
    'MR. JUN JUN ESGUERRA III',
    'MS. JEDY ARA TURGA',
    'MS. MARY SHIELL PANGANIBAN',
    'MS. CAROL CALLO',
    'MS. ARMI A. CABITAC',
    'MR. ALDRIN VALBUENA',
    'MS. MARIA MAGNA HERNANDEZ-TRIA',
    'MR. JAN LESTER O. EDJAN',
    'MR. ARDENNES ESAR',
    'MR. JAY REYES'
  ];

  // Gather a sorted list of unique employee names from the stored entries
  // and from the main form.  If none are found, falls back to the
  // DEFAULT_EMPLOYEE_NAMES array defined above.  This function ensures
  // duplicates are removed and results are sorted alphabetically.
  function getEmployeeNames() {
    const entries = getStoredEntries();
    const names = [];
    // Collect names from stored entries (if any)
    for (const e of entries) {
      const name = e.employeeName || e.EmployeeName || e.employee || e.Employee;
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
    // Also collect names from the main form's employee select dropdown
    try {
      const formSelect = document.querySelector(
        'select[id="employeeName"], select[name="employeeName"], select[id*="employeeName"]'
      );
      if (formSelect) {
        for (const opt of formSelect.options) {
          const text = (opt.textContent || '').trim();
          // Skip placeholder options like "Select Employee" or empty values
          if (
            text &&
            text.toLowerCase().indexOf('select') === -1 &&
            !names.includes(text)
          ) {
            names.push(text);
          }
        }
      }
    } catch (err) {
      // Fail silently if DOM access errors occur
    }
    // If no names found, use the default list
    if (names.length === 0) {
      DEFAULT_EMPLOYEE_NAMES.forEach((n) => {
        if (!names.includes(n)) names.push(n);
      });
    }
    return names.sort();
  }

  // Parse a time string such as "HH:MM" or "HH:MM AM/PM" into a Date object on
  // the current day.  Returns null if parsing fails.  Handles 12‑hour and
  // 24‑hour formats.
  function parseTime(t) {
    if (!t) return null;
    const s = String(t).trim();
    const ampm = s.match(/am|pm/i);
    let [h, m] = s.replace(/am|pm/i, '').trim().split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    if (ampm) {
      const ap = ampm[0].toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
    }
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

  // Compute total hours worked by task group for a given employee between
  // startDate and endDate.  If employee is null or empty, all employees are
  // considered.  The returned data is an array of [taskGroup, hours] tuples
  // sorted descending by hours.
  function aggregateForEmployee(employee, startDate, endDate) {
    const raw = getStoredEntries();
    const map = {};
    for (const e of raw) {
      const name = e.employeeName || e.EmployeeName || e.employee || e.Employee;
      if (employee && name !== employee) continue;
      if (!inBetween(e.logDate || e.date || e.LogDate, startDate, endDate)) continue;
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
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  // Compute total hours worked by task group across all employees for a given
  // range label.  The range can be "daily", "weekly", "monthly" or "all".
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
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  // Render a doughnut chart into the given canvas element with the provided data
  // using Chart.js.  If the data array is empty, the canvas is hidden.
  function renderDonut(canvas, data) {
    const ctx = canvas.getContext('2d');
    // destroy previous chart if exists
    if (canvas._chart) {
      canvas._chart.destroy();
      canvas._chart = null;
    }
    if (!data.length) {
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = 'block';
    const labels = data.map(d => d[0]);
    const values = data.map(d => +d[1].toFixed(2));
    const bg = labels.map((_, i) => `hsl(${(i * 67) % 360} 65% 60% / 0.9)`);
    const border = labels.map((_, i) => `hsl(${(i * 67) % 360} 65% 35% / 1)`);
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
              label: function (ctx) {
                const total = values.reduce((a, b) => a + b, 0) || 1;
                const v = ctx.parsed;
                const pct = ((v / total) * 100).toFixed(1);
                return `${ctx.label}: ${v.toFixed(2)} hrs (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Render a pie chart (full circle) using Chart.js
  function renderPie(canvas, data) {
    const ctx = canvas.getContext('2d');
    // destroy previous chart if exists
    if (canvas._chart) {
      canvas._chart.destroy();
      canvas._chart = null;
    }
    if (!data.length) {
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = 'block';
    const labels = data.map(d => d[0]);
    const values = data.map(d => +d[1].toFixed(2));
    const bg = labels.map((_, i) => `hsl(${(i * 67) % 360} 65% 60% / 0.9)`);
    const border = labels.map((_, i) => `hsl(${(i * 67) % 360} 65% 35% / 1)`);
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
      type: 'pie',
      data: dataset,
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const total = values.reduce((a, b) => a + b, 0) || 1;
                const v = ctx.parsed;
                const pct = ((v / total) * 100).toFixed(1);
                return `${ctx.label}: ${v.toFixed(2)} hrs (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Global state to track whether the dashboard has been initialised
  let dashboardInitialized = false;

  // Populate the employee select list in the dashboard
  function populateEmployees() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;
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

  // Update the employee donut chart based on current selections
  function updateEmployeeChart() {
    const empSelect = document.getElementById('employeeSelect');
    const empStart = document.getElementById('empStartDate');
    const empEnd = document.getElementById('empEndDate');
    const empCanvas = document.getElementById('employeeDonut');
    if (!empSelect || !empCanvas) return;
    const emp = empSelect.value || null;
    const start = empStart && empStart.value ? empStart.value : null;
    const end = empEnd && empEnd.value ? empEnd.value : null;
    const data = aggregateForEmployee(emp, start, end);
    // Render as pie chart instead of doughnut for employee distribution
    renderPie(empCanvas, data);
  }

  // Update the all employees donut chart based on current range selection
  function updateAllChart() {
    const rangeSelect = document.getElementById('allRangeSelect');
    const allCanvas = document.getElementById('allDonut');
    if (!rangeSelect || !allCanvas) return;
    const range = rangeSelect.value;
    const data = aggregateForAll(range);
    renderDonut(allCanvas, data);
  }

  // Update the logs table from localStorage.  Creates rows for each entry in
  // 'entryLogs', showing timestamp, latitude/longitude, and a link to Google
  // Maps.  Called whenever entries are added or when the logs tracker is
  // displayed.
  function updateLogsTable() {
    const table = document.getElementById('logsTable');
    if (!table) return;
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

  // Initialise the dashboard section.  Creates the necessary DOM elements
  // (employee and all employees charts and logs table) and inserts them
  // immediately after the reports section.  The dashboard and logs are hidden
  // by default; toggling them is handled by other functions.
  function initDashboard() {
    // Avoid creating duplicate dashboard sections.  If a wrapper with the
    // expected ID already exists, mark the dashboard as initialised and
    // return early.  This guards against multiple invocations when the
    // user repeatedly toggles the dashboard or if Chart.js loads late.
    const existingWrapper = document.getElementById('dashboard-section');
    if (existingWrapper) {
      dashboardInitialized = true;
      return;
    }
    if (dashboardInitialized) return;
    dashboardInitialized = true;

    // Ensure Chart.js is loaded before proceeding
    if (typeof Chart === 'undefined') return;

    const reportsSection = document.querySelector('.reports-section');
    const parent = reportsSection ? reportsSection.parentNode : document.body;

    // Create wrapper for the entire dashboard section
    const wrapper = document.createElement('div');
    wrapper.id = 'dashboard-section';
    wrapper.style.marginTop = '2rem';
    wrapper.style.display = 'none'; // hidden until toggled

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Dashboard';
    wrapper.appendChild(title);

    // ------------------ Employee chart section ------------------
    const empSection = document.createElement('div');
    empSection.id = 'employee-donut-section';
    empSection.style.marginTop = '1rem';
    const empTitle = document.createElement('h3');
    empTitle.textContent = 'Employee Task Group Distribution';
    empSection.appendChild(empTitle);
    // Employee select dropdown
    const empLabel = document.createElement('label');
    empLabel.textContent = 'Employee: ';
    empSection.appendChild(empLabel);
    const empSelect = document.createElement('select');
    empSelect.id = 'employeeSelect';
    empLabel.appendChild(empSelect);
    // Start date input
    const startLabel = document.createElement('label');
    startLabel.textContent = ' Start Date: ';
    empSection.appendChild(startLabel);
    const empStart = document.createElement('input');
    empStart.type = 'date';
    empStart.id = 'empStartDate';
    startLabel.appendChild(empStart);
    // End date input
    const endLabel = document.createElement('label');
    endLabel.textContent = ' End Date: ';
    empSection.appendChild(endLabel);
    const empEnd = document.createElement('input');
    empEnd.type = 'date';
    empEnd.id = 'empEndDate';
    endLabel.appendChild(empEnd);
    // Canvas for the chart
    const empCanvas = document.createElement('canvas');
    empCanvas.id = 'employeeDonut';
    empCanvas.width = 400;
    empCanvas.height = 300;
    empSection.appendChild(empCanvas);
    // Generate chart button
    const empGenBtn = document.createElement('button');
    empGenBtn.id = 'generateEmployeeChartBtn';
    empGenBtn.textContent = 'Generate Chart';
    empGenBtn.className = 'btn btn-secondary';
    empSection.appendChild(empGenBtn);
    wrapper.appendChild(empSection);

    // ------------------ All employees chart section ------------------
    const allSection = document.createElement('div');
    allSection.id = 'all-donut-section';
    allSection.style.marginTop = '1rem';
    const allTitle = document.createElement('h3');
    allTitle.textContent = 'All Employees Task Group Distribution';
    allSection.appendChild(allTitle);
    // Range select
    const allLabel = document.createElement('label');
    allLabel.textContent = 'Range: ';
    allSection.appendChild(allLabel);
    const rangeSelect = document.createElement('select');
    rangeSelect.id = 'allRangeSelect';
    const rangeOptions = [
      { value: 'daily', text: 'Today' },
      { value: 'weekly', text: 'Last 7 days' },
      { value: 'monthly', text: 'Last 30 days' }
    ];
    rangeOptions.forEach(optData => {
      const opt = document.createElement('option');
      opt.value = optData.value;
      opt.textContent = optData.text;
      rangeSelect.appendChild(opt);
    });
    allLabel.appendChild(rangeSelect);
    // Canvas for all employees chart
    const allCanvas = document.createElement('canvas');
    allCanvas.id = 'allDonut';
    allCanvas.width = 400;
    allCanvas.height = 300;
    allSection.appendChild(allCanvas);
    // Generate chart button
    const allGenBtn = document.createElement('button');
    allGenBtn.id = 'generateAllChartBtn';
    allGenBtn.textContent = 'Generate Chart';
    allGenBtn.className = 'btn btn-secondary';
    allSection.appendChild(allGenBtn);
    wrapper.appendChild(allSection);

    // ------------------ Logs tracker section ------------------
    const logsSec = document.createElement('div');
    logsSec.id = 'logs-section';
    logsSec.style.marginTop = '1rem';
    logsSec.style.display = 'none'; // hidden by default
    const logsTitle = document.createElement('h3');
    logsTitle.textContent = 'Logs Tracker';
    logsSec.appendChild(logsTitle);
    const table = document.createElement('table');
    table.id = 'logsTable';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Timestamp', 'Location', 'Map'].forEach(text => {
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

    // Insert the wrapper into the DOM after the reports section, if present
    if (reportsSection) {
      parent.insertBefore(wrapper, reportsSection.nextSibling);
    } else {
      document.body.appendChild(wrapper);
    }

    // Populate employee list now and again when necessary
    populateEmployees();

    // Attach event listeners to the generate buttons
    empGenBtn.addEventListener('click', updateEmployeeChart);
    allGenBtn.addEventListener('click', updateAllChart);
  }

  // Toggle the visibility of the dashboard section.  If the dashboard has not
  // yet been created, it is initialised on first toggle.  Otherwise, its
  // display property is toggled between 'none' and 'block'.
  function toggleDashboard() {
    // If not initialised, create it first
    if (!dashboardInitialized) {
      initDashboard();
    }
    const wrapper = document.getElementById('dashboard-section');
    if (wrapper) {
      wrapper.style.display = (wrapper.style.display === 'none' || wrapper.style.display === '') ? 'block' : 'none';
    }
  }

  // Toggle the visibility of the logs section.  If the dashboard has not yet
  // been created, initialise it first.  When showing the logs, refresh the
  // table contents.
  function toggleLogs() {
    if (!dashboardInitialized) {
      initDashboard();
    }
    const logsSec = document.getElementById('logs-section');
    if (logsSec) {
      const currentlyHidden = logsSec.style.display === 'none' || logsSec.style.display === '';
      logsSec.style.display = currentlyHidden ? 'block' : 'none';
      if (currentlyHidden) {
        updateLogsTable();
      }
    }
  }

  // Hook into Add Entry and Generate Report buttons to refresh employee list,
  // update charts (if visible) and update logs.  Also record the user's
  // geolocation when adding an entry.
  function attachIntegrationHooks() {
    // Add entry button: record location and update employees/charts/logs
    const addBtn = document.getElementById('addEntryBtn') || document.querySelector('button#addEntryBtn') || document.querySelector('button[onclick="addEntry()"]');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        // capture geolocation
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((pos) => {
            const logs = JSON.parse(localStorage.getItem('entryLogs') || '[]');
            logs.push({ date: new Date().toISOString(), lat: pos.coords.latitude, lon: pos.coords.longitude });
            localStorage.setItem('entryLogs', JSON.stringify(logs));
          });
        }
        // After entry is added, refresh employee names and charts/logs if visible
        setTimeout(() => {
          populateEmployees();
          // Only update charts if dashboard is visible
          const wrapper = document.getElementById('dashboard-section');
          if (wrapper && wrapper.style.display !== 'none') {
            updateEmployeeChart();
            updateAllChart();
          }
          // Update logs table if logs section is visible
          const logsSec = document.getElementById('logs-section');
          if (logsSec && logsSec.style.display !== 'none') {
            updateLogsTable();
          }
        }, 0);
      });
    }
    // Generate report button: refresh employee list and charts and logs after a report
    const genBtnCandidates = Array.from(document.querySelectorAll('button, input[type="button"]'));
    const genBtn = genBtnCandidates.find(b => /generate report/i.test(b.textContent || b.value || ''));
    if (genBtn) {
      genBtn.addEventListener('click', () => {
        setTimeout(() => {
          populateEmployees();
          const wrapper = document.getElementById('dashboard-section');
          if (wrapper && wrapper.style.display !== 'none') {
            updateEmployeeChart();
            updateAllChart();
          }
          const logsSec = document.getElementById('logs-section');
          if (logsSec && logsSec.style.display !== 'none') {
            updateLogsTable();
          }
        }, 0);
      });
    }
  }

  // Attach event listeners to the Dashboard and Logs Tracker buttons once the
  // DOM is ready and Chart.js is available.  If Chart.js has not yet loaded,
  // we poll until it becomes available.
  function start() {
    function attach() {
      // Set up integration hooks on Add Entry/Generate Report
      attachIntegrationHooks();
      // Attach toggles to new buttons
      const dashBtn = document.getElementById('dashboardBtn');
      if (dashBtn) dashBtn.addEventListener('click', toggleDashboard);
      const logsBtn = document.getElementById('logsTrackerBtn');
      if (logsBtn) logsBtn.addEventListener('click', toggleLogs);
    }
    if (typeof Chart !== 'undefined') {
      attach();
    } else {
      // Poll for Chart.js availability
      const intId = setInterval(() => {
        if (typeof Chart !== 'undefined') {
          clearInterval(intId);
          attach();
        }
      }, 100);
    }
  }

  // Kick off when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();