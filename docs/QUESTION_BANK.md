# Question bank and readable light theme

The original 50 questions, their options, correct indices, explanations, difficulty labels and `os-question-001`–`os-question-050` keys are preserved byte-for-byte as data. Ten checked-in JSON files in `backend/data/expanded/` contain 45 additional authored records each; the loader combines these static records with the originals. There is no external question service or runtime content generation.

| Existing topic | Easy | Medium | Hard | Total |
| --- | ---: | ---: | ---: | ---: |
| Operating System Basics | 15 | 25 | 10 | 50 |
| Process Management | 15 | 25 | 10 | 50 |
| CPU Scheduling | 15 | 25 | 10 | 50 |
| Concurrency & Synchronization | 15 | 25 | 10 | 50 |
| Deadlocks | 15 | 25 | 10 | 50 |
| Memory Management | 15 | 25 | 10 | 50 |
| Virtual Memory | 15 | 25 | 10 | 50 |
| File Systems | 15 | 25 | 10 | 50 |
| I/O Management | 15 | 25 | 10 | 50 |
| Protection & Security | 15 | 25 | 10 | 50 |
| **Total** | **150** | **250** | **100** | **500** |

Every new question has an explicit permanent key, its topic and subtopic, four distinct options, one correct answer index and an explanation. Correct options occur 10–15 times per letter in each topic. Preserve keys when editing. Topics include conceptual definitions, practical failure scenarios, scheduling traces, memory and page-table arithmetic, replacement traces, resource-safety checks, storage calculations and protection boundaries. Assumptions such as units, arrival order, initial frames, overhead, direction, preemption and persistence guarantees are stated where relevant.

## Source and calculation review

Questions and explanations are original instructional wording, not copied textbook exercises. Reference material for reviewing the concepts includes the authors' [Operating Systems: Three Easy Pieces](https://pages.cs.wisc.edu/~remzi/OSTEP/), especially scheduling, address translation, paging policies, locks, files and storage; the normative POSIX specifications for [fork](https://pubs.opengroup.org/onlinepubs/9799919799/functions/fork.html), [exec](https://pubs.opengroup.org/onlinepubs/9799919799/functions/exec.html) and [open](https://pubs.opengroup.org/onlinepubs/9799919799/functions/open.html).

`backend/tests/questionBank.test.js` calculates expected numerical answers independently of the answer strings. It uses arithmetic formulas, explicit scheduling simulation, FIFO/LRU replacement simulation, a resource-safety algorithm, permission masks, and disk movement calculations. Checks include the retained original numerical questions. This is executable numerical verification and editorial review, not a claim of independent human subject-matter certification of all 500 items.

`npm run validate:questions --prefix backend` checks the topic list, exact totals, difficulty mix, all four options, answer indices, stable keys, normalized duplicate stems and number-substitution templates. Token-set similarity flags possible paraphrases for review; there are no remaining candidates at the documented 0.72 threshold. Text similarity is only a review aid, not a proof of semantic uniqueness.

## Applying the expansion safely

No schema migration is needed for this expansion on an installation already running migrations 001–003. After reviewing the configured target, run from the project root:

```sh
npm run validate:questions --prefix backend
npm run seed --prefix backend
```

Normal seeding inserts missing records only and preserves keyed database edits, UUIDs, credentials, timestamps, saved results, answers and existing question positions. It appends missing topic memberships, making the new items available in topic quizzes and the server's personalised selection pool. Existing custom content and extra memberships remain; consequently an installation with additional operator-created records may contain more than the 500 source-bank questions.

The checked-in `backend/data/mock-question-keys.json` freezes the original balanced selection: five questions per topic, 50 total. **Existing mock memberships and settings are left untouched**, even if an operator has customized them. For a fresh installation only, the mock is created with that manifest and a 50-minute limit. Expanded topic pools retain all 50 questions; each new topic attempt randomly assigns up to 20 of them. Adoption of unkeyed legacy records continues to use the original fixed positions, rather than shifted positions in the expanded bank.

Completed attempts keep their original question snapshots and version fingerprints. Expanding a topic creates a new current question set without rewriting any past result. The leaderboard's **Question set** selector preserves access to eligible earlier versions, including the original five-question topic quizzes. Scores from different versions remain separate. The API accepts an optional validated `version` query parameter; it never trusts client-supplied eligibility or scores.

To start the configured local app, use separate terminals:

```sh
npm run dev --prefix backend
```

```sh
npm run dev --prefix frontend
```

With backend PORT=5001 and the existing Vite proxy configuration, open [http://localhost:5173](http://localhost:5173). Seeding is a deliberate content update, not a requirement for ordinary startup. Do not use `db:init` on an existing database.

## Theme

`frontend/src/theme.json` is the single source for semantic color values consumed by Tailwind. The light theme uses soft off-white canvas, white panels, navy primary text, readable slate secondary text, deep teal controls, green success, red errors and amber warnings. Shared control/panel classes live in `index.css`. Primary reading text is at least 16px, question headings are 18px, controls have visible keyboard focus and a minimum 44px height, and question navigation uses 44px targets. Answer selection has a checkmark; review statuses and timer warnings include text.

`frontend/src/tests/theme.test.js` calculates WCAG contrast ratios for normal-text theme pairs (at least 4.5:1) and control/focus boundaries (at least 3:1). This does not replace a full assistive-technology/accessibility audit.

## Verification safety

The backend integration suite starts a disposable local PostgreSQL cluster and tests both the old bank and expansion. It checks preservation of original IDs, edited content, credentials, results, reviews, memberships, custom mock settings and historical rankings; repeat/concurrent seeds; fresh 500-question installs; and the balanced 50-question mock. It never connects to the configured Supabase database. The browser preview likewise uses its own disposable database and a separate 127.0.0.1 cookie host, so test account activity does not replace localhost's signed-in student session.

Verified for this change: **103 backend tests**, **15 frontend tests**, question validation, syntax checks, `git diff --check`, and the Vite production build passed. The combined answer-position totals are exactly **125 A / 125 B / 125 C / 125 D**, without a repeating placement cycle in the authored additions. Browser inspection covered the disposable student flow on 1280px desktop and 390px mobile; additional 320px checks confirmed no horizontal overflow in attempts and progress, and verified the non-wrapping Incorrect review badge. Login/register, selection, submission, results/review, progress, recommendations, generated practice and leaderboard screens were inspected. A complete screen-reader and assistive-technology audit remains unverified. No migrations, seeding or destructive tests were run against the configured Supabase database for this expansion; no commit or push was made.

## Random topic attempts

Topic cards show “20 random questions · 50-question pool” for the normal bank. Server sampling uses cryptographic random draws and partial Fisher–Yates without replacement. The selected IDs, order and grading content are saved before the start response. Repeated assignment reads do not draw again. Pools smaller than 20 use all available questions; empty pools cannot start. The mock and personalised selection rules are unchanged.

The format and source-pool fingerprint are recorded alongside the selected questions in the existing JSON snapshot. Every exact ordered selection has its own ranking fingerprint; new samples and the old full-pool format never share a cohort. The Question set selector exposes saved selections. This preserves comparability at the cost of sparse rankings for independently drawn topic selections. No migration, seed or data rewrite is required.

The topic-sampling change is verified with the disposable PostgreSQL suite (including full-pool historical and pending assignments, stable owner-only assignment reads, selection counts, scoring, unanswered reviews, learning, ownership, retry safety and ranking isolation), frontend component tests and the production build. These checks do not access Supabase. A fresh browser/device check of this specific interaction remains a manual check.
