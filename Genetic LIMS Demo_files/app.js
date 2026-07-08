const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const samplesTableBody = document.querySelector('#samplesTable tbody');
const workflowTableBody = document.querySelector('#workflowTable tbody');
const workflowForm = document.getElementById('workflowForm');
const sampleForm = document.getElementById('sampleForm');
const runForm = document.getElementById('runForm');
const serviceForm = document.getElementById('serviceForm');
const submitServiceRequestButton = document.getElementById('submitServiceRequestButton');
const dashboardSamples = document.getElementById('dashboardSamples');
const dashboardWorkflows = document.getElementById('dashboardWorkflows');
const dashboardAnalysis = document.getElementById('dashboardAnalysis');
const dashboardPending = document.getElementById('dashboardPending');
const dashboardRuns = document.getElementById('dashboardRuns');
const dashboardRequests = document.getElementById('dashboardRequests');
const reportSamples = document.getElementById('reportSamples');
const reportRuns = document.getElementById('reportRuns');
const reportRequests = document.getElementById('reportRequests');
const reportTableBody = document.getElementById('reportTableBody');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');

let currentPage = 1;
let currentLimit = 10;
let currentSearch = '';
let currentTotal = 0;

async function fetchDashboard() {
  const response = await fetch('/api/dashboard');
  if (!response.ok) return;
  const data = await response.json();
  if (dashboardSamples) dashboardSamples.textContent = data.total_samples;
  if (dashboardWorkflows) dashboardWorkflows.textContent = data.total_workflows;
  if (dashboardAnalysis) dashboardAnalysis.textContent = data.analysis_jobs.length;
  if (dashboardPending) {
    const pending = data.analysis_jobs.filter(job => job.status === 'running').length;
    dashboardPending.textContent = pending;
  }
  if (dashboardRuns) dashboardRuns.textContent = data.total_runs || 0;
  if (dashboardRequests) dashboardRequests.textContent = data.total_service_requests || 0;
}

async function fetchSamples(query = '', page = 1, limit = currentLimit) {
  currentSearch = query;
  currentPage = page;
  currentLimit = limit;
  const url = `/api/samples?search=${encodeURIComponent(query)}&page=${page}&limit=${limit}`;
  const response = await fetch(url);
  const data = await response.json();
  renderSamples(data.samples || []);
  updatePagination(data.page || 1, data.limit || limit, data.total || 0);
}

function updatePagination(page, limit, total) {
  currentPage = page;
  currentLimit = limit;
  currentTotal = total;
  if (pageInfo) pageInfo.textContent = `Page ${page} / ${Math.max(1, Math.ceil(total / limit))} (${total} samples)`;
  if (prevPageBtn) prevPageBtn.disabled = page <= 1;
  if (nextPageBtn) nextPageBtn.disabled = page * limit >= total;
}

function attachSampleActions() {
  document.querySelectorAll('.action-button').forEach(button => {
    const action = button.getAttribute('data-action');
    const sampleId = button.getAttribute('data-sample-id');
    button.addEventListener('click', () => {
      if (action === 'edit') {
        loadSampleIntoForm(sampleId);
      } else if (action === 'delete') {
        deleteSample(sampleId);
      }
    });
  });
}

async function loadSampleIntoForm(sampleId) {
  try {
    const resp = await fetch(`/api/samples/${encodeURIComponent(sampleId)}`);
    if (!resp.ok) {
      alert('Unable to load sample for editing.');
      return;
    }
    const sample = await resp.json();
    document.getElementById('sampleId').value = sample.sample_id;
    document.getElementById('samplePopulation').value = sample.population || '';
    document.getElementById('sampleSuperpopulation').value = sample.superpopulation || '';
    document.getElementById('sampleGender').value = sample.gender || '';
    document.getElementById('sampleProject').value = sample.project || '';
    document.getElementById('sampleSource').value = sample.source || '';
    document.getElementById('sampleCollectionDate').value = sample.collection_date || '';
    document.getElementById('sampleStatus').value = sample.sample_status || '';
    document.getElementById('sampleId').focus();
  } catch (e) {
    alert(`Unable to load sample: ${e.message}`);
  }
}

async function deleteSample(sampleId) {
  if (!confirm(`Delete sample ${sampleId}? This also removes its workflows.`)) return;
  try {
    const resp = await fetch(`/api/samples/${encodeURIComponent(sampleId)}`, { method: 'DELETE' });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      alert(`Delete failed: ${err.error || resp.statusText}`);
      return;
    }
    fetchSamples();
    fetchWorkflows();
    fetchDashboard();
  } catch (e) {
    alert(`Delete error: ${e.message}`);
  }
}

async function fetchWorkflows() {
  const response = await fetch('/api/workflows');
  const workflows = await response.json();
  renderWorkflows(workflows);
}

async function fetchRuns() {
  const response = await fetch('/api/runs');
  const runs = await response.json();
  renderRuns(runs);
}

function renderRuns(runs) {
  const runsTableBody = document.querySelector('#runsTable tbody');
  if (!runs || runs.length === 0) {
    runsTableBody.innerHTML = '<tr><td colspan="5">No runs recorded yet.</td></tr>';
    return;
  }
  runsTableBody.innerHTML = runs.map(run => `
    <tr>
      <td>${run.run_name}</td>
      <td>${run.project || '-'}</td>
      <td>${run.run_date || '-'}</td>
      <td>${run.status || '-'}</td>
      <td>${new Date(run.created_at).toLocaleString()}</td>
    </tr>
  `).join('');
}

async function fetchServiceRequests() {
  try {
    const response = await fetch('/api/service-requests');
    const text = await response.text();
    if (!response.ok) {
      renderServiceRequests([], `Unable to load requests: ${response.status} ${response.statusText}`);
      return;
    }
    let requests;
    try {
      requests = JSON.parse(text);
    } catch (parseError) {
      renderServiceRequests([], `Invalid JSON response from service-requests endpoint`);
      return;
    }
    renderServiceRequests(requests);
  } catch (e) {
    renderServiceRequests([], `Fetch error: ${e.message}`);
  }
}

function renderServiceRequests(requests, errorMessage) {
  const serviceTableBody = document.querySelector('#serviceTable tbody');
  if (!serviceTableBody) return;

  if (errorMessage) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = errorMessage;
    row.appendChild(cell);
    serviceTableBody.innerHTML = '';
    serviceTableBody.appendChild(row);
    return;
  }

  if (!requests || requests.length === 0) {
    serviceTableBody.innerHTML = '<tr><td colspan="5">No service requests recorded yet.</td></tr>';
    return;
  }

  serviceTableBody.innerHTML = requests.map(entry => `
    <tr>
      <td>${entry.requester}</td>
      <td>${entry.category}</td>
      <td>${entry.priority}</td>
      <td>${entry.status}</td>
      <td>${new Date(entry.created_at).toLocaleString()}</td>
    </tr>
  `).join('');
}

function appendServiceRequestRow(entry) {
  const serviceTableBody = document.querySelector('#serviceTable tbody');
  if (!serviceTableBody || !entry) return;

  const firstPlaceholder = serviceTableBody.querySelector('td[colspan="5"]');
  if (firstPlaceholder) {
    serviceTableBody.innerHTML = '';
  }

  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${entry.requester}</td>
    <td>${entry.category}</td>
    <td>${entry.priority}</td>
    <td>${entry.status}</td>
    <td>${new Date(entry.created_at).toLocaleString()}</td>
  `;

  serviceTableBody.insertAdjacentElement('afterbegin', row);
}

async function fetchReports() {
  const resp = await fetch('/api/reports/summary');
  if (!resp.ok) return;
  const data = await resp.json();
  if (reportSamples) reportSamples.textContent = data.total_samples || 0;
  if (reportRuns) reportRuns.textContent = data.total_runs || 0;
  if (reportRequests) reportRequests.textContent = data.total_requests || 0;

  if (reportTableBody) {
    const rows = [];
    rows.push(`<tr><td>Samples by status</td><td>${data.sample_status_counts.map(item => `${item.status || 'unknown'}: ${item.count}`).join(', ') || 'none'}</td></tr>`);
    rows.push(`<tr><td>Runs by status</td><td>${data.run_status_counts.map(item => `${item.status || 'unknown'}: ${item.count}`).join(', ') || 'none'}</td></tr>`);
    rows.push(`<tr><td>Requests by status</td><td>${data.request_status_counts.map(item => `${item.status || 'unknown'}: ${item.count}`).join(', ') || 'none'}</td></tr>`);
    rows.push(`<tr><td>Top projects</td><td>${data.top_projects.map(item => `${item.project || 'unknown'}: ${item.count}`).join(', ') || 'none'}</td></tr>`);
    reportTableBody.innerHTML = rows.join('');
  }
}

function renderSamples(samples) {
  if (!samples.length) {
    samplesTableBody.innerHTML = '<tr><td colspan="7">No samples found. Download dataset and restart server.</td></tr>';
    return;
  }

  samplesTableBody.innerHTML = samples.map(sample => `
    <tr>
      <td>${sample.sample_id}</td>
      <td>${sample.population || '-'}</td>
      <td>${sample.superpopulation || '-'}</td>
      <td>${sample.gender || '-'}</td>
      <td>${sample.project || '-'}</td>
      <td>${sample.sample_status || '-'}</td>
      <td>
        <button class="action-button" data-action="edit" data-sample-id="${sample.sample_id}">Edit</button>
        <button class="action-button delete" data-action="delete" data-sample-id="${sample.sample_id}">Delete</button>
      </td>
    </tr>
  `).join('');

  attachSampleActions();
}

function renderWorkflows(workflows) {
  if (!workflows.length) {
    workflowTableBody.innerHTML = '<tr><td colspan="5">No workflow events recorded yet.</td></tr>';
    return;
  }

  workflowTableBody.innerHTML = workflows.map(event => `
    <tr>
      <td>${event.id}</td>
      <td>${event.sample_id}</td>
      <td>${event.step}</td>
      <td>${event.status}</td>
      <td>${new Date(event.created_at).toLocaleString()}</td>
    </tr>
  `).join('');
}

searchButton.addEventListener('click', () => {
  fetchSamples(searchInput.value.trim(), 1);
});

searchInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    fetchSamples(searchInput.value.trim(), 1);
  }
});

if (prevPageBtn) prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) fetchSamples(currentSearch, currentPage - 1, currentLimit);
});

if (nextPageBtn) nextPageBtn.addEventListener('click', () => {
  if (currentPage * currentLimit < currentTotal) fetchSamples(currentSearch, currentPage + 1, currentLimit);
});

workflowForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const sample_id = document.getElementById('workflowSampleId').value.trim();
  const step = document.getElementById('workflowStep').value.trim();
  const status = document.getElementById('workflowStatus').value;

  if (!sample_id || !step || !status) {
    alert('Please complete all workflow fields.');
    return;
  }

  const response = await fetch('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sample_id, step, status })
  });

  if (!response.ok) {
    const error = await response.json();
    alert(`Unable to save workflow: ${error.error || response.statusText}`);
    return;
  }

  workflowForm.reset();
  fetchWorkflows();
  fetchDashboard();
});

if (sampleForm) {
  sampleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const sample_id = document.getElementById('sampleId').value.trim();
    const population = document.getElementById('samplePopulation').value.trim();
    const superpopulation = document.getElementById('sampleSuperpopulation').value.trim();
    const gender = document.getElementById('sampleGender').value;
    const project = document.getElementById('sampleProject').value.trim();
    const source = document.getElementById('sampleSource').value.trim();
    const collection_date = document.getElementById('sampleCollectionDate').value;
    const sample_status = document.getElementById('sampleStatus').value;

    if (!sample_id) {
      alert('Sample ID is required.');
      return;
    }

    const response = await fetch('/api/samples/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample_id, population, superpopulation, gender, project, source, collection_date, sample_status })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Unable to register sample: ${error.error || response.statusText}`);
      return;
    }

    sampleForm.reset();
    fetchSamples();
    fetchDashboard();
    alert('Sample registered/updated successfully.');
  });
}

if (runForm) {
  runForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const run_name = document.getElementById('runName').value.trim();
    const project = document.getElementById('runProject').value.trim();
    const run_date = document.getElementById('runDate').value;
    const status = document.getElementById('runStatus').value;
    const sample_sheet = document.getElementById('runSampleSheet').value.trim();

    if (!run_name || !status) {
      alert('Run name and status are required.');
      return;
    }

    const resp = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_name, project, run_date, status, sample_sheet })
    });

    if (!resp.ok) {
      const err = await resp.json();
      alert(`Unable to create run: ${err.error || resp.statusText}`);
      return;
    }

    runForm.reset();
    fetchRuns();
    fetchDashboard();
  });
}

async function submitServiceRequest() {
  const requester = document.getElementById('serviceRequester').value.trim();
  const category = document.getElementById('serviceCategory').value;
  const priority = document.getElementById('servicePriority').value;
  const status = document.getElementById('serviceStatus').value;
  const description = document.getElementById('serviceDescription').value.trim();

  if (!requester || !category || !priority || !status || !description) {
    alert('Please fill in all service request fields.');
    return;
  }

  const resp = await fetch('/api/service-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requester, category, priority, status, description })
  });

  if (!resp.ok) {
    const text = await resp.text();
    let message = resp.statusText;
    try {
      const err = JSON.parse(text);
      message = err.error || text || message;
    } catch (parseError) {
      message = text || message;
    }
    alert(`Unable to submit request: ${message}`);
    return;
  }

  const responseData = await resp.json();
  serviceForm.reset();
  appendServiceRequestRow(responseData);
  fetchDashboard();
  fetchReports();
}

if (serviceForm) {
  serviceForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitServiceRequest();
  });
}

if (submitServiceRequestButton) {
  submitServiceRequestButton.addEventListener('click', async (event) => {
    event.preventDefault();
    await submitServiceRequest();
  });
}

fetchSamples();
fetchWorkflows();
fetchRuns();
fetchServiceRequests();
fetchDashboard();
fetchReports();

// --- Analysis UI: start job, poll status, show results ---
const startBtn = document.getElementById && document.getElementById('startAnalysis');
const analysisStatus = document.getElementById && document.getElementById('analysisStatus');
const analysisResult = document.getElementById && document.getElementById('analysisResult');
const analysisImage = document.getElementById && document.getElementById('analysisImage');
const analysisSummary = document.getElementById && document.getElementById('analysisSummary');

let currentJob = null;
let pollInterval = null;

async function startAnalysis() {
  if (!startBtn) return;
  startBtn.disabled = true;
  if (analysisStatus) analysisStatus.textContent = 'Starting analysis...';

  try {
    const resp = await fetch('/api/analysis/start', { method: 'POST' });
    const data = await resp.json();
    if (resp.ok && data.jobId) {
      currentJob = data.jobId;
      if (analysisStatus) analysisStatus.textContent = `Job started: ${currentJob}`;
      pollInterval = setInterval(() => pollStatus(currentJob), 2000);
    } else {
      if (analysisStatus) analysisStatus.textContent = `Start failed: ${data.error || 'unknown'}`;
      startBtn.disabled = false;
    }
  } catch (e) {
    if (analysisStatus) analysisStatus.textContent = `Start error: ${e.message}`;
    startBtn.disabled = false;
  }
}

async function pollStatus(jobId) {
  try {
    const resp = await fetch(`/api/analysis/status?jobId=${encodeURIComponent(jobId)}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (analysisStatus) analysisStatus.textContent = `Status error: ${err.error || resp.statusText}`;
      clearInterval(pollInterval);
      if (startBtn) startBtn.disabled = false;
      return;
    }
    const info = await resp.json();
    if (analysisStatus) analysisStatus.textContent = `Job ${info.jobId}: ${info.status}`;
    if (info.status === 'done') {
      clearInterval(pollInterval);
      if (startBtn) startBtn.disabled = false;
      await showResult(info.jobId);
    } else if (info.status === 'error') {
      clearInterval(pollInterval);
      if (startBtn) startBtn.disabled = false;
      if (analysisStatus) analysisStatus.textContent = `Job ${info.jobId} failed`;
    }
  } catch (e) {
    if (analysisStatus) analysisStatus.textContent = `Poll error: ${e.message}`;
    clearInterval(pollInterval);
    if (startBtn) startBtn.disabled = false;
  }
}

async function showResult(jobId) {
  if (analysisResult) analysisResult.style.display = 'block';

  // fetch summary JSON first
  try {
    const sresp = await fetch(`/api/analysis/result?jobId=${encodeURIComponent(jobId)}&type=summary`);
    if (sresp.ok) {
      const json = await sresp.json();
      if (analysisSummary) analysisSummary.textContent = JSON.stringify(json, null, 2);
    } else {
      if (analysisSummary) analysisSummary.textContent = 'Summary not available.';
    }
  } catch (e) {
    if (analysisSummary) analysisSummary.textContent = `Summary fetch error: ${e.message}`;
  }

  // set image src (may 404 if plotting unavailable)
  if (analysisImage) {
    analysisImage.src = `/api/analysis/result?jobId=${encodeURIComponent(jobId)}`;
    analysisImage.onload = () => { analysisImage.style.display = 'block'; };
    analysisImage.onerror = () => { analysisImage.style.display = 'none'; };
  }

  try { alert('Analysis complete — results available.'); } catch (e) {}
}

if (startBtn) startBtn.addEventListener('click', startAnalysis);
