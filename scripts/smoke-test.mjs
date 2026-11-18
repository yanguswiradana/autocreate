const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3001";

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore non-json
  }
  return { status: res.status, json, text };
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`SMOKE FAIL: ${msg}`);
  }
}

async function main() {
  console.log(`[1/5] Checking ${BASE}/api/health...`);
  const health = await req("/api/health");
  assert(health.status === 200 && health.json?.ok === true, `health=${health.status}`);
  console.log("  ✓ Health OK");

  console.log("[2/5] Testing /api/chat-intent (clarify, new series, URL memory)...");
  const c1 = await req("/api/chat-intent", {
    method: "POST",
    body: JSON.stringify({ message: "halo", mock: false, step: "idle" }),
  });
  assert(c1.status === 200 && c1.json?.intent === "clarify", `c1=${c1.status}`);

  const c2 = await req("/api/chat-intent", {
    method: "POST",
    body: JSON.stringify({
      message: "buatkan checklist persiapan mudik 3 slide rasio 1:1",
      mock: true,
      step: "idle",
    }),
  });
  assert(
    c2.status === 200 &&
      c2.json?.suggestedSeries === "checklist" &&
      c2.json?.suggestedAspectRatio === "1:1" &&
      c2.json?.suggestedSlides === 3,
    `c2=${JSON.stringify(c2.json)}`
  );
  console.log("  ✓ Chat Intent OK");

  console.log("[3/5] Creating render job (checklist, 1:1, carousel+poster, wikimedia)...");
  const jobCreate = await req("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      topic: "Checklist Persiapan Kerja Remote",
      preset: "clean_paper",
      series: "checklist",
      aspectRatio: "1:1",
      language: "id",
      outputs: ["carousel", "poster"],
      options: { slides: 3, mock: true, visualProvider: "wikimedia" },
    }),
  });
  assert(jobCreate.status === 202 && jobCreate.json?.job?.id, `create=${jobCreate.status}`);
  const jobId = jobCreate.json.job.id;
  console.log(`  ✓ Job #${jobId} queued`);

  let folderName = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const check = await req(`/api/jobs/${jobId}`);
    if (check.json?.job?.status === "completed") {
      folderName = check.json.job.folder_name || check.json.job.manifest?.jobId;
      console.log(`  ✓ Job #${jobId} completed (${folderName})`);
      break;
    }
    if (check.json?.job?.status === "failed") {
      throw new Error(`Job #${jobId} failed: ${check.json.job.error_message}`);
    }
  }
  assert(folderName, `Job #${jobId} timed out`);

  console.log("[4/5] Testing blueprint fetch + Edit Teks & Re-render...");
  const bpRes = await req(`/outputs/${encodeURIComponent(folderName)}/blueprint.json`);
  assert(bpRes.status === 200 && Array.isArray(bpRes.json?.scenes), `bp=${bpRes.status}`);
  const editedBp = {
    ...bpRes.json,
    hookTitle: `${bpRes.json.hookTitle} (Edited)`,
  };
  const rr = await req(`/api/jobs/${jobId}/rerender`, {
    method: "POST",
    body: JSON.stringify({
      outputs: ["carousel", "poster"],
      blueprint: editedBp,
    }),
  });
  assert(rr.status === 200 && rr.json?.ok === true, `rerender=${rr.status} ${rr.text}`);
  console.log("  ✓ Edit Teks & Re-render OK");

  console.log("[5/5] Cleaning up test job...");
  const del = await req(`/api/jobs/${jobId}`, { method: "DELETE" });
  assert(del.status === 200, `delete=${del.status}`);
  console.log("  ✓ Cleanup OK\nALL SMOKE TESTS PASSED!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
