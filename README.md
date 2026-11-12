# Course Tracker (local)

Single-page study planner. Paste a course syllabus, train or revise it in one block with no
percentage cap, and take short multiple-choice quizzes that move a confidence score.

## Requirements

- Node.js 18 or newer (tested on Node 24.22.1)
- Any modern browser
- **No npm packages.** `npm install` is a no-op; `server.js` uses only Node's built-in `http` and `fs`.

## Run it

```powershell
cd "C:\DEV\Coarse - Project 2"
npm install      # optional, installs nothing
npm start        # or: node server.js
```

Then open <http://localhost:4321>. Set a different port with `PORT=5000 npm start`.

On Windows you can also just double-click **`run.cmd`**: it starts the server if it is not
already listening on 4321 and opens the page.

## Deploy (Vercel)

- Production: <https://course-tracker-gold.vercel.app> - project `course-tracker`, connected to the
  GitHub repo, so pushing to `main` redeploys it.
- `vercel.json` + `build.js` publish only the browser files in `dist/`; the Node `server.js` is not
  used on Vercel. The project's framework preset is `other`
  (`vercel project update course-tracker --framework other`), which stops Vercel from using
  `server.js` as a root entrypoint.
- `api/backup.js` is a serverless stub returning 501: Vercel has no writable disk. The UI hides
  **Save backup** and **Code** whenever the host is not `localhost`/`127.0.0.1`.
- Storage is per origin. The local site keeps its own ticks; the Vercel site seeds the same
  131-item course at 0% on first visit (guarded by `ct-seeded-v1` in `localStorage`).

## The code is served from the app too

Everything lives in this folder and is reachable at the same origin:

- <http://localhost:4321/code> - list of every project file with links, sizes and timestamps
- <http://localhost:4321/api/files> - the same list as JSON
- <http://localhost:4321/api/code.zip> - the whole project (code + data + backups) as one zip

The **Code** link in the header opens that page. The folder itself is
`C:\DEV\Coarse - Project 2`; no file is needed from anywhere else - no CDN, no npm package,
no outside service.

## Saving your data to disk

Course data lives in the browser (`localStorage`). **Save backup** (top right) posts it to the
local server, which writes `backup\course-data-<timestamp>.json` next to `server.js`. That
file is a full copy of every course, its items and ticks, so it survives clearing site data.

API: `POST /api/backup` with the JSON body; it validates the JSON and returns
`{ ok: true, file: "backup\\..." }`. Invalid bodies get a 400.

## Where data lives

Courses are stored in the browser's `localStorage` under the key `ct-db-v1`, for the origin
`http://localhost:4321`. That means:

- Data survives reloads and restarts of `server.js`.
- Data is per browser and per origin. `http://localhost:4321` and `http://127.0.0.1:4321`
  are different stores, and a different port means a different store.
- Clearing site data deletes the courses.

## How the original artifact was made to run locally

`index.html` is a claude.ai artifact. It calls two host APIs that only exist inside the artifact viewer:

| Original call | What it did | Local replacement (in `index.html`) |
| --- | --- | --- |
| `claude.use('db')` | hosted document database (`add`, `doc().update()`, `doc().delete()`, `onSnapshot`) | `localStorage` store with the same API, plus cross-tab sync |
| `claude.use('sample')` | Claude inference for lessons and quizzes | offline generator that builds lessons and quizzes from the pasted syllabus text |

The shim is a `window.claude` polyfill guarded by `if (window.claude ...) return;`, so the same
file still behaves normally if you paste it back into the artifact viewer.

## Limits of offline mode

- Lessons are a study scaffold: topic order, where each topic sits in the syllabus, a worked-case
  prompt, and common mistakes. They are not AI-written explanations.
- Quizzes are drawn from the order and coverage of your syllabus (recognition, ordering,
  negative and first/last questions), so they test recall of the scope rather than deep reasoning.
- Want real generated lessons? Swap `sample` for an API call; the page only expects
  `sample(prompt) -> { text }` and `sample.json(prompt) -> array`.

## How completion is measured

The DevOps course is tracked against the **portal item list**, not a guessed figure.

- The desk shows **Portal progress**: `n of 131 items done · x% · QA sessions excluded`, with a bar.
- Tick a session (or a note/add-on) and the bar, the table's **Completed** column and
  `x% covered` all update from `completed / 131`.
- Each module has **Mark module done / Clear module** for bulk updates.
- **Clear module** asks first (`Yes, clear N ticks` / `Keep`) before it unticks anything.
- **Train** is revision mode for this course: the block contains only the items you have ticked, in
  order, with no 40% step limit. A cleared module drops out of the next block, and clearing or
  unticking anything discards the lesson in flight so the trainer starts from your current marks.
- Courses you add yourself (no item list) still train from their progress slider to 100%.
- QA recordings, "none" placeholders and the "No Class" entry are excluded from both the list
  and the denominator.
- Courses without an item list (any course you add yourself) still get the **Progress** slider
  in the desk header instead.

## Perfect planning

**Perfect planning** appears in the desk header and as **Perfect plan** in each table row. It is a
deterministic route map, generated from three local sources and the current ticks:

- the brochure syllabus (`devops-syllabus.txt`) - what the full 14-module course promises;
- the 131 portal items (`devops-sessions.json`) - the exact steps and what counts as 100%;
- your current marks - which steps are already done.

What the panel gives you:

- **Exact route**: every portal item numbered once in dependency order (cloud -> Linux -> Git ->
  Jenkins -> Docker -> Kubernetes -> career). Notes are moved next to the module they revise.
- **Next exact step**: the first unticked item, with its module, type and study estimate.
- **Pace and projection**: choose 5/8/10/15/20/25 hours per week; the week-by-week route and finish
  date are recomputed. The pace is stored in `localStorage` (`ct-plan-hours`).
- **Week-by-week route**: every remaining step placed into a week, with a recall drill and a
  pass/fail milestone when a stage finishes.
- **Full-syllabus gap map**: the portal stops at Session 63, so the brochure's unrecorded and partly
  covered modules (Azure, Terraform, AWS depth, MCP, Ansible/New Relic, security tools, Linux depth,
  Kubernetes depth) are listed with their exact missing topics, study hours and a checkpoint. This
  is the difference between ticking 131 items and being interview-ready.
- **Best-results protocol**: the learn -> do -> recall -> space loop, day 1/3/7/21 reviews, portfolio
  artifacts, mock-interview cadence, and the minimum viable lane when time is short.
- **Copy route map**: copies the whole plan as plain text (the full route, weeks, gaps and sources).

Estimates are study heuristics, not video lengths: 90 min per recorded class, 45 min for
interaction/live sessions, 60-120 min for builds, 45 min for interview material, 20-45 min for
reference notes. Courses without a portal list get a syllabus-based route, with the first
`progress%` of topics treated as covered (the same model as **Train**).

## Loaded course

- **DevOps with Multi Cloud (AWS + Azure)** - Frontlines Edutech
  - Scope: the 14-module brochure syllabus (`devops-syllabus.txt`)
  - Progress items: 131 portal items from `portal-course-list.txt`, grouped as
    Cloud & AWS setup 4, Linux 6, Git/GitHub/Bitbucket 6, Jenkins & CI/CD 20,
    Docker 36, Kubernetes 35, Notes 13, Add-on sessions 11.

If you clear site data, re-add the course with **+ Add course** (name above, paste
`devops-syllabus.txt` into the scope field). The item list would then need re-importing -
`devops-sessions.json` holds it in the shape the app uses.

## Files

- `index.html` - the whole app (UI, logic, local runtime shim)
- `server.js` - static file server plus `POST /api/backup`
- `run.cmd` - Windows launcher: start the server if needed, then open the page
- `package.json` - start script, declares Node >= 18
- `backup\` - timestamped JSON snapshots written by **Save backup**
- `devops-syllabus.txt` - source text for the seeded DevOps course scope
- `portal-course-list.txt` - the portal item list exactly as provided (QA/placeholder entries included)
- `devops-sessions.json` - that list parsed into `{label, module}` items, QA and "none" removed
