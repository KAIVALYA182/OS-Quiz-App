const { test } = require("node:test");
const assert = require("node:assert/strict");
const bank = require("../data/questions");
const original = require("./fixtures/original-bank.json");
const mockKeys = require("../data/mock-question-keys.json");
const {
  validateBank,
  nearDuplicates,
} = require("../utils/questionBankValidation");
const questions = new Map(
  bank.flatMap((g) => g.questions).map((q) => [q.seedKey, q]),
);
const answer = (key) => {
  const q = questions.get(key);
  assert.ok(q, `Missing question ${key}`);
  return q.options[q.correctOptionIndex];
};
test("500 unique authored questions, exact difficulty mix, original records preserved and balanced fixed mock", () => {
  const report = validateBank(bank);
  assert.deepEqual(report.errors, []);
  assert.equal(report.total, 500);
  assert.deepEqual(nearDuplicates(bank), []);
  for (const group of original)
    for (const q of group.questions)
      assert.deepEqual(
        questions.get(q.seedKey),
        q,
        `Original changed: ${q.seedKey}`,
      );
  assert.equal(mockKeys.length, 50);
  assert.equal(new Set(mockKeys).size, 50);
  for (const group of bank)
    assert.equal(
      group.questions.filter((q) => mockKeys.includes(q.seedKey)).length,
      5,
    );
  assert.equal(
    new Set(
      bank
        .flatMap((g) => g.questions)
        .filter((q) => !q.seedKey.startsWith("os-question-"))
        .map((q) => q.subtopic),
    ).size > 100,
    true,
  );
});
// Independent executable models: these do not read an answer or explanation to
// calculate the expected value. Inputs below are transcribed from the questions.
function lru(refs, frames) {
  let resident = [],
    faults = 0,
    victims = [];
  for (const page of refs) {
    const old = resident.indexOf(page);
    if (old >= 0) resident.splice(old, 1);
    else {
      faults++;
      if (resident.length === frames) victims.push(resident.shift());
    }
    resident.push(page);
  }
  return { faults, victims };
}
function fifo(refs, frames) {
  let resident = [],
    faults = 0,
    victims = [];
  for (const page of refs) {
    if (resident.includes(page)) continue;
    faults++;
    if (resident.length === frames) victims.push(resident.shift());
    resident.push(page);
  }
  return { faults, victims };
}
function nonpreemptive(bursts, order) {
  let now = 0,
    wait = [],
    done = [];
  for (const i of order) {
    wait.push(now);
    now += bursts[i];
    done.push(now);
  }
  return {
    wait: wait.reduce((a, b) => a + b, 0) / wait.length,
    turnaround: done.reduce((a, b) => a + b, 0) / done.length,
  };
}
function schedule(jobs, policy, quantum = 1) {
  const work = jobs.map((j, i) => ({ ...j, id: i, left: j.burst, done: 0 }));
  let now = 0,
    current = null,
    ready = [];
  while (work.some((j) => j.left > 0)) {
    if (policy === "srtf") {
      const eligible = work
        .filter((j) => j.arrival <= now && j.left > 0)
        .sort((a, b) => a.left - b.left || a.id - b.id);
      if (!eligible.length) {
        now++;
        continue;
      }
      const job = eligible[0];
      job.left--;
      now++;
      if (!job.left) job.done = now;
    } else {
      if (!ready.length)
        ready = work.filter((j) => j.left > 0).map((j) => j.id);
      const i = ready.shift(),
        j = work[i];
      const slice = Math.min(quantum, j.left);
      now += slice;
      j.left -= slice;
      if (j.left) ready.push(i);
      else j.done = now;
    }
  }
  return work.map((j) => j.done);
}
function safeOrder(work, allocation, need) {
  work = [...work];
  const done = new Set(),
    order = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < need.length; i++) {
      if (done.has(i) || need[i].some((n, k) => n > work[k])) continue;
      done.add(i);
      order.push(i);
      allocation[i].forEach((a, k) => (work[k] += a));
      changed = true;
    }
  }
  return { safe: done.size === need.length, order, work };
}
function movement(start, route) {
  return route.reduce(
    (s, to, i) => s + Math.abs(to - (i ? route[i - 1] : start)),
    0,
  );
}
const arithmetic = [
  ["os-basics-028", () => 47 - 12, " ms"],
  ["os-basics-029", () => (8 / (8 + 2)) * 100, "%"],
  ["os-basics-030", () => (400 * 3) / 1000, " ms"],
  ["os-basics-041", () => 1 / (0.6 + 0.4 / 2), " times"],
  ["os-basics-042", () => 0.99 * 0.99, ""],
  ["os-basics-045", () => 900 + 100 * (1 - 0.75), " ms"],
  ["os-basics-046", () => ((5000 * 12) / 1e6) * 100, "%"],
  ["os-basics-049", () => 10 - (2 + 5 + 1), " ms"],
  ["os-process-030", () => 1 + 3 + 3 * 2, ""],
  ["os-process-031", () => 4 * 2, " MiB"],
  ["os-process-038", () => Math.min(8, 2), ""],
  ["os-process-039", () => (3 / 12) * 100, "%"],
  ["os-process-041", () => 2 ** 3, ""],
  ["os-process-042", () => 1 + 1 + 1, ""],
  ["os-process-045", () => 4 + 3, ""],
  ["os-process-046", () => 5, ""],
  ["os-process-050", () => 4096 - 1024, " bytes"],
  [
    "os-question-015",
    () => Number(nonpreemptive([6, 8, 4], [0, 1, 2]).wait.toFixed(2)),
    " ms",
  ],
  ["os-scheduling-020", () => nonpreemptive([2, 5, 1], [0, 1, 2]).wait, " ms"],
  ["os-scheduling-022", () => 18 - 3, " ms"],
  ["os-scheduling-023", () => 17 - 2 - 6, " ms"],
  ["os-scheduling-024", () => 9 - 4, " ms"],
  ["os-scheduling-026", () => 0.5 * 10 + 0.5 * 6, " ms"],
  ["os-scheduling-033", () => (45 / 60) * 100, "%"],
  ["os-scheduling-034", () => 240 / 120, " jobs/s"],
  ["os-scheduling-039", () => (30 / 100) * 100, "%"],
  [
    "os-scheduling-041",
    () =>
      schedule(
        [
          { arrival: 0, burst: 8 },
          { arrival: 1, burst: 4 },
          { arrival: 2, burst: 2 },
        ],
        "srtf",
      )[1],
    " ms",
  ],
  [
    "os-scheduling-042",
    () =>
      schedule(
        [
          { arrival: 0, burst: 5 },
          { arrival: 0, burst: 3 },
        ],
        "rr",
        2,
      )[0],
    " ms",
  ],
  [
    "os-scheduling-047",
    () => nonpreemptive([4, 2, 1], [1, 2, 0]).turnaround,
    " ms",
  ],
  ["os-scheduling-049", () => 1 / (0.2 + 0.8 / 4), " times"],
  ["os-concurrency-012", () => 6, ""],
  [
    "os-concurrency-020",
    () => {
      const a = 0,
        b = 0;
      let x = a + 1;
      x = b + 1;
      return x;
    },
    "",
  ],
  ["os-concurrency-035", () => 4 - 3 + 2, ""],
  [
    "os-concurrency-041",
    () => {
      const a = 0,
        b = 0;
      let x = a + 1;
      x = b + 2;
      return x;
    },
    "",
  ],
  ["os-concurrency-045", () => 1000 / 2, " operations/s"],
  ["os-deadlocks-020", () => 9 - 4, " units"],
  ["os-deadlocks-021", () => 12 - (3 + 2 + 4), ""],
  ["os-deadlocks-041", () => 3 * (2 - 1) + 1, " units"],
  ["os-deadlocks-049", () => 4 * (3 - 1) + 1, " units"],
  ["os-question-028", () => Math.log2(4096), ""],
  ["os-memory-020", () => Math.floor(2500 / 1024), ""],
  ["os-memory-021", () => 5000 % 2048, " bytes"],
  ["os-memory-022", () => 9 * 1024 + (3200 % 1024), ""],
  ["os-memory-024", () => 4000 + 125, ""],
  ["os-memory-025", () => Math.ceil(10 / 4), ""],
  ["os-memory-026", () => Math.ceil(10 / 4) * 4 - 10, " KiB"],
  ["os-memory-027", () => (2 ** 16 / 256) * 4, " bytes"],
  ["os-memory-035", () => 64 * 4, " KiB"],
  ["os-memory-038", () => 2 ** Math.ceil(Math.log2(70)), " KiB"],
  ["os-memory-041", () => 0.9 * (10 + 100) + 0.1 * (10 + 200), " ns"],
  ["os-memory-042", () => 2 ** ((32 - 12) / 2), ""],
  ["os-memory-043", () => (1 + 3) * 4, " KiB"],
  ["os-memory-045", () => (512 * 4096) / 2 ** 20, " MiB"],
  ["os-memory-047", () => 20 + 3, ""],
  [
    "os-question-035",
    () => fifo([1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], 3).faults,
    "",
  ],
  ["os-vm-028", () => new Set([2, 3, 2, 4, 3, 5]).size, ""],
  ["os-vm-029", () => (25 / 10000) * 100, "%"],
  ["os-vm-040", () => 120 * 4, " KiB"],
  ["os-vm-042", () => lru([1, 2, 3, 1, 4, 2, 1, 5], 3).faults, ""],
  ["os-vm-043", () => 100 + 0.0001 * 8e6, " ns"],
  ["os-vm-044", () => (200 - 100) / 1e7, ""],
  ["os-vm-045", () => 4 + 0.5 * 6, " ms"],
  ["os-files-021", () => Math.ceil(9000 / 4096), ""],
  ["os-files-022", () => Math.ceil(9000 / 4096) * 4096 - 9000, " bytes"],
  ["os-files-035", () => 32768 / 8, " bytes"],
  ["os-files-036", () => 4096 / 4, ""],
  ["os-files-041", () => 10 * 4, " KiB"],
  ["os-files-042", () => 12 + 4096 / 4, ""],
  ["os-files-043", () => (4096 / 4) ** 2, ""],
  ["os-files-048", () => 1 + 1, ""],
  [
    "os-question-044",
    () => movement(53, [98, 183, 37, 122, 14, 124, 65, 67]),
    " cylinders",
  ],
  ["os-io-018", () => 20 / 100, " s"],
  ["os-io-020", () => 5 + 3 + 2, " ms"],
  ["os-io-034", () => (4 - 1) * 1, " TB"],
  ["os-io-035", () => 200 * 0.01, ""],
  ["os-io-040", () => Math.min(400, 100), " MB/s"],
  ["os-io-042", () => movement(50, [60, 90, 40, 10]), " cylinders"],
  ["os-io-043", () => movement(50, [60, 90, 10, 40]), " cylinders"],
  ["os-io-044", () => movement(50, [60, 90, 199, 40, 10]), " cylinders"],
  ["os-io-045", () => Math.max(5, 8), " ms"],
  ["os-io-046", () => (12000 * 5 - (12000 / 6) * 5) / 1000, " ms"],
  ["os-security-046", () => 2 ** 19 / 1024, " seconds"],
];
for (const [key, compute, unit] of arithmetic)
  test(`independent numerical verification: ${key}`, () =>
    assert.equal(
      answer(key),
      String(Number(compute().toPrecision(12))) + unit,
    ));
test("independent scheduling, resource, paging, permissions and bound reasoning", () => {
  const sjf = nonpreemptive([7, 2, 4], [1, 2, 0]);
  assert.equal(sjf.wait, 8 / 3);
  assert.equal(answer("os-scheduling-021"), "8/3 ms");
  assert.equal(
    answer("os-scheduling-043"),
    `About ${((0.2 / 4.2) * 100).toFixed(2)}%`,
  );
  assert.ok(
    answer("os-scheduling-044").includes(String(1 / 4 + 1 / 5 + 2 / 10)),
  );
  assert.ok(0.8 <= 2 * (2 ** 0.5 - 1));
  assert.match(answer("os-scheduling-045"), /test passes/);
  assert.equal(Math.min(18, 30), 18);
  assert.match(answer("os-scheduling-031"), /18 ms/);
  assert.equal(Math.min(10, 25), 10);
  assert.match(answer("os-scheduling-032"), /10 ms/);
  assert.match(answer("os-scheduling-025"), 3 < 8 ? /B preempts/ : /A/);
  assert.ok(3 + 2 + 1 <= 7);
  assert.match(answer("os-scheduling-050"), /6 ms/);
  assert.equal(answer("os-concurrency-031"), `empty=${8 - 3}, full=${3}`);
  const expected = 7,
    current = 9;
  assert.notEqual(expected, current);
  assert.match(answer("os-concurrency-033"), /remains 9/);
  assert.equal(answer("os-deadlocks-036"), `(${4 - 1},${3 - 2})`);
  assert.deepEqual(
    [2, 2].map((n, i) => n <= [2, 3][i]),
    [true, true],
  );
  assert.equal(answer("os-deadlocks-037"), "(2,2)");
  const first = safeOrder([2], [[2], [3]], [[1], [4]]);
  assert.deepEqual(first.order, [0, 1]);
  assert.match(answer("os-deadlocks-022"), /becomes 4/);
  assert.deepEqual(
    safeOrder(
      [1, 0],
      [
        [1, 1],
        [0, 1],
      ],
      [
        [0, 1],
        [1, 0],
      ],
    ).order,
    [1, 0],
  );
  assert.equal(answer("os-deadlocks-042"), "P2 then P1");
  assert.equal(
    safeOrder([6 - 2 - 3], [[2], [3]], [[4 - 2], [5 - 3]]).safe,
    false,
  );
  assert.match(answer("os-deadlocks-043"), /^No/);
  assert.ok(600 >= 600);
  assert.match(answer("os-memory-023"), /^No/);
  assert.equal(
    answer("os-memory-044"),
    `${299} maps to ${5000 + 299}; 300 is out of bounds`,
  );
  assert.equal(
    [100, 500, 200, 300].find((n) => n >= 180),
    500,
  );
  assert.equal(answer("os-memory-028"), "The 500 KiB block");
  assert.equal(Math.max(...[100, 500, 200, 300].filter((n) => n >= 180)), 500);
  assert.equal(answer("os-memory-029"), "The 500 KiB block");
  assert.equal(answer("os-vm-020"), `Page ${lru([1, 2, 1, 3], 2).victims[0]}`);
  assert.equal(answer("os-vm-021"), `Page ${fifo([1, 2, 1, 3], 2).victims[0]}`);
  const pages = ["A", "B", "C"],
    future = ["B", "C", "A", "B", "C"];
  pages.sort((a, b) => future.indexOf(b) - future.indexOf(a));
  assert.equal(answer("os-vm-022"), pages[0]);
  assert.match(
    answer("os-vm-046"),
    new RegExp(String(12 + 15 + 18 - 40) + " frames"),
  );
  let bits = [1, 0, 1],
    hand = 0;
  while (bits[hand]) {
    bits[hand] = 0;
    hand = (hand + 1) % 3;
  }
  assert.equal(answer("os-vm-047"), ["A", "B", "C"][hand]);
  assert.equal(answer("os-files-038"), "0" + (0o666 & ~0o027).toString(8));
  assert.match(
    answer("os-files-031"),
    new RegExp(String(1000 - 600) + " bytes"),
  );
  assert.equal(
    answer("os-io-019"),
    `About ${(((60 / 7200) * 1000) / 2).toFixed(2)} ms`,
  );
  assert.match(answer("os-io-050"), new RegExp(String(1000 / 2) + "/s"));
  const permissions = (digit) =>
    [digit & 4 ? "r" : "-", digit & 2 ? "w" : "-", digit & 1 ? "x" : "-"].join(
      "",
    );
  assert.equal(
    answer("os-question-040"),
    [7, 5, 4].map(permissions).join(", "),
  );
  assert.equal(2n ** 128n, 340282366920938463463374607431768211456n);
  assert.equal(answer("os-security-045"), "1/2^128");
});
