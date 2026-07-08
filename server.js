const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const dataPath = path.join(__dirname, 'data');
const dbFile = path.join(dataPath, 'lims.db');
const sampleCsv = path.join(dataPath, 'samples.csv');
const analysisPath = path.join(dataPath, 'analysis');
const jobsFile = path.join(analysisPath, 'jobs.json');

if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}
if (!fs.existsSync(analysisPath)) {
  fs.mkdirSync(analysisPath, { recursive: true });
}

let jobs = {};
if (fs.existsSync(jobsFile)) {
  try { jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8') || '{}'); } catch (e) { jobs = {}; }
}

function persistJobs() {
  try { fs.writeFileSync(jobsFile, JSON.stringify(jobs, null, 2)); } catch (e) { console.error('Failed to persist jobs', e); }
}

function createDatabase() {
  const db = new sqlite3.Database(dbFile);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS samples (
      sample_id TEXT PRIMARY KEY,
      population TEXT,
      superpopulation TEXT,
      gender TEXT,
      project TEXT,
      source TEXT,
      collection_date TEXT,
      sample_status TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id TEXT,
      step TEXT,
      status TEXT,
      created_at TEXT,
      FOREIGN KEY(sample_id) REFERENCES samples(sample_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_name TEXT,
      sample_sheet TEXT,
      status TEXT,
      run_date TEXT,
      project TEXT,
      created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS service_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester TEXT,
      category TEXT,
      priority TEXT,
      description TEXT,
      status TEXT,
      created_at TEXT
    )`);
  });
  return db;
}

function ensureSampleColumns(db) {
  db.all("PRAGMA table_info(samples)", (err, rows) => {
    if (err || !rows) return;
    const existing = rows.map(r => r.name);
    const missing = ['project', 'source', 'collection_date', 'sample_status'].filter(col => !existing.includes(col));
    missing.forEach(col => {
      db.run(`ALTER TABLE samples ADD COLUMN ${col} TEXT`);
    });
  });
}

function seedSamples(db) {
  if (!fs.existsSync(sampleCsv)) return;

  db.get('SELECT COUNT(*) AS count FROM samples', (err, row) => {
    if (err) {
      console.error('Seed error:', err.message);
      return;
    }

    if (row.count > 0) {
      return;
    }

    const content = fs.readFileSync(sampleCsv, 'utf8').trim();
    const lines = content.split(/\r?\n/);
    const header = lines.shift().split(',').map(h => h.trim().toLowerCase());
    const insert = db.prepare('INSERT OR IGNORE INTO samples (sample_id, population, superpopulation, gender) VALUES (?, ?, ?, ?)');

    lines.forEach((line) => {
      const values = line.split(',').map(v => v.trim());
      const record = {
        sample_id: values[0] || '',
        population: values[1] || '',
        superpopulation: values[2] || '',
        gender: values[3] || ''
      };
      insert.run(record.sample_id, record.population, record.superpopulation, record.gender);
    });

    insert.finalize(() => {
      console.log(`Seeded ${lines.length} samples into the database.`);
    });
  });
}

function seedRuns(db) {
  db.get('SELECT COUNT(*) AS count FROM runs', (err, row) => {
    if (err) {
      console.error('Run seed error:', err.message);
      return;
    }
    if (row.count > 0) return;

    const now = new Date().toISOString();
    const runs = [
      { run_name: 'Wetlab Run 2026-07-A', sample_sheet: 'HG00096, HG00100, HG00101', status: 'recorded', run_date: '2026-07-05', project: '1000 Genomes', created_at: now },
      { run_name: 'Demux Run 2026-07-B', sample_sheet: 'HG00200, HG00203', status: 'running', run_date: '2026-07-06', project: 'Cancer Panel', created_at: now },
      { run_name: 'Completed Sequencing Run', sample_sheet: 'HG00300, HG00305', status: 'completed', run_date: '2026-07-01', project: 'Clinical Seq', created_at: now }
    ];

    const insert = db.prepare('INSERT INTO runs (run_name, sample_sheet, status, run_date, project, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    runs.forEach(run => insert.run(run.run_name, run.sample_sheet, run.status, run.run_date, run.project, run.created_at));
    insert.finalize(() => console.log('Seeded default runs into the database.'));
  });
}

function seedServiceRequests(db) {
  db.get('SELECT COUNT(*) AS count FROM service_requests', (err, row) => {
    if (err) {
      console.error('Service request seed error:', err.message);
      return;
    }
    if (row.count > 0) return;

    const now = new Date().toISOString();
    const requests = [
      { requester: 'Dr. Lee', category: 'service request', priority: 'high', description: 'Need sample sheet generation and run validation for the next wetlab batch.', status: 'open', created_at: now },
      { requester: 'Bioinformatics', category: 'IT support', priority: 'medium', description: 'Help set up demultiplexing parameters for the sequencer outputs.', status: 'in progress', created_at: now },
      { requester: 'Lab Manager', category: 'consulting request', priority: 'low', description: 'Review workflow status dashboard and report generation.', status: 'resolved', created_at: now }
    ];

    const insert = db.prepare('INSERT INTO service_requests (requester, category, priority, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    requests.forEach(req => insert.run(req.requester, req.category, req.priority, req.description, req.status, req.created_at));
    insert.finalize(() => console.log('Seeded default service requests into the database.'));
  });
}

const db = createDatabase();
ensureSampleColumns(db);
seedSamples(db);
seedRuns(db);
seedServiceRequests(db);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/samples', (req, res) => {
  const search = req.query.search ? `%${req.query.search}%` : '%';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const countQuery = `SELECT COUNT(*) AS total FROM samples
     WHERE sample_id LIKE ? OR population LIKE ? OR superpopulation LIKE ? OR project LIKE ? OR source LIKE ?`;
  const selectQuery = `SELECT sample_id, population, superpopulation, gender, project, source, collection_date, sample_status FROM samples
     WHERE sample_id LIKE ? OR population LIKE ? OR superpopulation LIKE ? OR project LIKE ? OR source LIKE ?
     ORDER BY sample_id LIMIT ? OFFSET ?`;

  db.get(countQuery, [search, search, search, search, search], (countErr, countRow) => {
    if (countErr) return res.status(500).json({ error: countErr.message });
    db.all(selectQuery, [search, search, search, search, search, limit, offset], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ samples: rows, total: countRow.total, page, limit });
    });
  });
});

app.get('/api/samples/:sample_id', (req, res) => {
  const sampleId = req.params.sample_id;
  db.get(
    `SELECT sample_id, population, superpopulation, gender, project, source, collection_date, sample_status FROM samples WHERE sample_id = ?`,
    [sampleId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Sample not found' });
      res.json(row);
    }
  );
});

app.delete('/api/samples/:sample_id', (req, res) => {
  const sampleId = req.params.sample_id;
  db.run('DELETE FROM workflows WHERE sample_id = ?', [sampleId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM samples WHERE sample_id = ?', [sampleId], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Sample not found' });
      }
      res.json({ sample_id: sampleId });
    });
  });
});

app.post('/api/samples/register', (req, res) => {
  const { sample_id, population, superpopulation, gender, project, source, collection_date, sample_status } = req.body;
  if (!sample_id) {
    return res.status(400).json({ error: 'sample_id is required' });
  }

  db.run(
    `INSERT INTO samples (sample_id, population, superpopulation, gender, project, source, collection_date, sample_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sample_id) DO UPDATE SET
       population = excluded.population,
       superpopulation = excluded.superpopulation,
       gender = excluded.gender,
       project = excluded.project,
       source = excluded.source,
       collection_date = excluded.collection_date,
       sample_status = excluded.sample_status`,
    [sample_id, population || '', superpopulation || '', gender || '', project || '', source || '', collection_date || '', sample_status || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ sample_id, population, superpopulation, gender, project, source, collection_date, sample_status });
    }
  );
});

app.get('/api/dashboard', (req, res) => {
  db.serialize(() => {
    db.get('SELECT COUNT(*) AS total_samples FROM samples', (err, totalRow) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT COUNT(*) AS total_workflows FROM workflows', (err2, workflowRow) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.all('SELECT sample_status, COUNT(*) AS count FROM samples GROUP BY sample_status', (err3, statusRows) => {
          if (err3) return res.status(500).json({ error: err3.message });
          db.all('SELECT superpopulation, COUNT(*) AS count FROM samples GROUP BY superpopulation', (err4, popRows) => {
            if (err4) return res.status(500).json({ error: err4.message });
            db.get('SELECT COUNT(*) AS total_runs FROM runs', (err5, runRow) => {
              if (err5) return res.status(500).json({ error: err5.message });
              db.get('SELECT COUNT(*) AS total_requests FROM service_requests', (err6, requestRow) => {
                if (err6) return res.status(500).json({ error: err6.message });
                res.json({
                  total_samples: totalRow.total_samples,
                  total_workflows: workflowRow.total_workflows,
                  total_runs: runRow.total_runs,
                  total_service_requests: requestRow.total_requests,
                  sample_status_counts: statusRows,
                  superpopulation_counts: popRows,
                  analysis_jobs: Object.keys(jobs).map(jobId => ({ jobId, ...jobs[jobId] }))
                });
              });
            });
          });
        });
      });
    });
  });
});

// Start an asynchronous analysis job (runs Python script in background)
app.post('/api/analysis/start', (req, res) => {
  if (!fs.existsSync(sampleCsv)) return res.status(400).json({ error: 'Dataset not available. Run the downloader first.' });

  const jobId = `job-${Date.now()}-${Math.floor(Math.random()*10000)}`;
  const outDir = path.join(analysisPath, jobId);
  fs.mkdirSync(outDir, { recursive: true });

  jobs[jobId] = { status: 'running', started_at: new Date().toISOString(), outDir: outDir };
  persistJobs();

  // spawn the python analysis script; it will write results to outDir
  const py = spawn('python3', ['analysis.py', '--input', sampleCsv, '--out', outDir], {
    cwd: __dirname,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  py.stdout.on('data', (d) => console.log(`[analysis ${jobId}]`, d.toString().trim()));
  py.stderr.on('data', (d) => console.error(`[analysis ${jobId} err]`, d.toString().trim()));

  py.on('exit', (code) => {
    jobs[jobId].status = code === 0 ? 'done' : 'error';
    jobs[jobId].finished_at = new Date().toISOString();
    jobs[jobId].exit_code = code;
    persistJobs();
  });

  res.json({ jobId });
});

app.get('/api/analysis/status', (req, res) => {
  const jobId = req.query.jobId;
  if (!jobId || !jobs[jobId]) return res.status(404).json({ error: 'job not found' });
  const info = { jobId, status: jobs[jobId].status, started_at: jobs[jobId].started_at, finished_at: jobs[jobId].finished_at };
  res.json(info);
});

app.get('/api/analysis/result', (req, res) => {
  const jobId = req.query.jobId;
  if (!jobId || !jobs[jobId]) return res.status(404).json({ error: 'job not found' });
  const outDir = jobs[jobId].outDir;
  const summary = path.join(outDir, 'summary.json');
  const imageFiles = [
    path.join(outDir, 'plot.png'),
    path.join(outDir, 'plot_1.png'),
    path.join(outDir, 'plot_2.png'),
    path.join(outDir, 'plot_3.png'),
    path.join(outDir, 'plot_superpopulation.png'),
    path.join(outDir, 'plot_gender.png'),
    path.join(outDir, 'plot_population.png')
  ];

  const type = req.query.type;
  if (type === 'summary') {
    if (fs.existsSync(summary)) return res.sendFile(summary);
    return res.status(404).json({ error: 'summary not available yet' });
  }

  for (const imagePath of imageFiles) {
    if (fs.existsSync(imagePath)) {
      return res.sendFile(imagePath);
    }
  }

  res.status(404).json({ error: 'chart not available yet' });
});

app.get('/api/workflows', (req, res) => {
  db.all(
    `SELECT id, sample_id, step, status, created_at FROM workflows ORDER BY created_at DESC LIMIT 100`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

app.post('/api/workflows', (req, res) => {
  const { sample_id, step, status } = req.body;
  if (!sample_id || !step || !status) {
    return res.status(400).json({ error: 'sample_id, step, and status are required' });
  }

  const createdAt = new Date().toISOString();
  db.run(
    `INSERT INTO workflows (sample_id, step, status, created_at) VALUES (?, ?, ?, ?)` ,
    [sample_id, step, status, createdAt],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, sample_id, step, status, created_at: createdAt });
    }
  );
});

app.get('/api/runs', (req, res) => {
  db.all(
    `SELECT id, run_name, status, run_date, project, created_at FROM runs ORDER BY created_at DESC LIMIT 100`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/runs', (req, res) => {
  const { run_name, sample_sheet, status, run_date, project } = req.body;
  if (!run_name || !status) {
    return res.status(400).json({ error: 'run_name and status are required' });
  }

  const createdAt = new Date().toISOString();
  db.run(
    `INSERT INTO runs (run_name, sample_sheet, status, run_date, project, created_at) VALUES (?, ?, ?, ?, ?, ?)` ,
    [run_name, sample_sheet || '', status, run_date || '', project || '', createdAt],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, run_name, sample_sheet, status, run_date, project, created_at: createdAt });
    }
  );
});

app.get('/api/service-requests', (req, res) => {
  db.all(
    `SELECT id, requester, category, priority, status, description, created_at FROM service_requests ORDER BY created_at DESC LIMIT 100`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/service-requests', (req, res) => {
  const { requester, category, priority, description, status } = req.body;
  if (!requester || !category || !priority || !description || !status) {
    return res.status(400).json({ error: 'requester, category, priority, description, and status are required' });
  }

  const createdAt = new Date().toISOString();
  db.run(
    `INSERT INTO service_requests (requester, category, priority, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)` ,
    [requester, category, priority, description, status, createdAt],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, requester, category, priority, description, status, created_at: createdAt });
    }
  );
});

app.get('/api/reports/summary', (req, res) => {
  db.serialize(() => {
    db.get('SELECT COUNT(*) AS total_samples FROM samples', (err, sampleRow) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT COUNT(*) AS total_runs FROM runs', (err2, runRow) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.get('SELECT COUNT(*) AS total_requests FROM service_requests', (err3, requestRow) => {
          if (err3) return res.status(500).json({ error: err3.message });
          db.all('SELECT status, COUNT(*) AS count FROM samples GROUP BY status', (err4, sampleStatusRows) => {
            if (err4) return res.status(500).json({ error: err4.message });
            db.all('SELECT status, COUNT(*) AS count FROM runs GROUP BY status', (err5, runStatusRows) => {
              if (err5) return res.status(500).json({ error: err5.message });
              db.all('SELECT status, COUNT(*) AS count FROM service_requests GROUP BY status', (err6, requestStatusRows) => {
                if (err6) return res.status(500).json({ error: err6.message });
                db.all('SELECT project, COUNT(*) AS count FROM samples GROUP BY project ORDER BY count DESC LIMIT 5', (err7, projectRows) => {
                  if (err7) return res.status(500).json({ error: err7.message });
                  res.json({
                    total_samples: sampleRow.total_samples,
                    total_runs: runRow.total_runs,
                    total_requests: requestRow.total_requests,
                    sample_status_counts: sampleStatusRows,
                    run_status_counts: runStatusRows,
                    request_status_counts: requestStatusRows,
                    top_projects: projectRows
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Genetic LIMS demo running at http://localhost:${PORT}`);
});
