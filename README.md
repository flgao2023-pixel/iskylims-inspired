# Genetic LIMS Demo

This project is a lightweight genetic workflow demo built with:

- HTML/CSS/JavaScript frontend
- Node.js + Express REST API backend
- SQLite relational database
- Python dataset downloader for a public genetic sample panel

## Setup

1. Install dependencies:

```bash
cd /Users/canwu/flgao/omscs/job/fullstack
npm install
```

2. Download the sample dataset:

```bash
python3 download_dataset.py
```

3. Start the server:

```bash
npm start
```

4. Open the UI in your browser:

```text
http://localhost:3000
```

Or view the live demo here:

https://flgao2023-pixel.github.io/iskylims-inspired/Genetic%20LIMS%20Demo.htm

## Notes

- The backend seeds the SQLite database from `data/samples.csv` if it exists.
- The frontend can register/update samples, search the sample catalog, track workflows, and view an analysis dashboard.
- The analysis module runs asynchronously in Python and notifies the frontend when results are ready.
- You can use REST APIs to drive the system; the demo does not include GraphQL yet.
