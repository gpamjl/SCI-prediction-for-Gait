const DB_NAME = "sci-ambulation-prediction";
const DB_VERSION = 1;
const STORE = "cases";
const ZOOM_STORAGE_KEY = "sci-ambulation-zoom";
const ZOOM_MIN = 0.9;
const ZOOM_MAX = 1.3;
const ZOOM_STEP = 0.1;

const fields = [
  "caseId",
  "staffName",
  "timingPreset",
  "injuryDays",
  "nli",
  "ais",
  "age",
  "l3MotorR",
  "l3MotorL",
  "s1MotorR",
  "s1MotorL",
  "l3TouchR",
  "l3TouchL",
  "s1TouchR",
  "s1TouchL",
];

const state = {
  db: null,
  cases: [],
  currentCaseId: "",
  currentResult: null,
};

const $ = (id) => document.getElementById(id);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "caseId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(mode = "readonly") {
  return state.db.transaction(STORE, mode).objectStore(STORE);
}

function getAllCases() {
  return new Promise((resolve, reject) => {
    const request = transaction().getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function saveCase(record) {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteCase(caseId) {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").delete(caseId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function numberValue(id) {
  const value = $(id).value;
  return value === "" ? null : Number(value);
}

function bestOf(left, right) {
  const values = [left, right].filter((value) => Number.isFinite(value));
  return values.length ? Math.max(...values) : null;
}

function clampInputs() {
  [
    ["l3MotorR", 0, 5],
    ["l3MotorL", 0, 5],
    ["s1MotorR", 0, 5],
    ["s1MotorL", 0, 5],
    ["l3TouchR", 0, 2],
    ["l3TouchL", 0, 2],
    ["s1TouchR", 0, 2],
    ["s1TouchL", 0, 2],
  ].forEach(([id, min, max]) => {
    const el = $(id);
    if (el.value === "") return;
    const value = Math.max(min, Math.min(max, Math.round(Number(el.value))));
    el.value = Number.isFinite(value) ? String(value) : "";
  });
}

function calculateFromForm() {
  const age = numberValue("age");
  const l3Motor = bestOf(numberValue("l3MotorR"), numberValue("l3MotorL"));
  const s1Motor = bestOf(numberValue("s1MotorR"), numberValue("s1MotorL"));
  const l3Touch = bestOf(numberValue("l3TouchR"), numberValue("l3TouchL"));
  const s1Touch = bestOf(numberValue("s1TouchR"), numberValue("s1TouchL"));

  $("l3MotorBest").textContent = l3Motor ?? "-";
  $("s1MotorBest").textContent = s1Motor ?? "-";
  $("l3TouchBest").textContent = l3Touch ?? "-";
  $("s1TouchBest").textContent = s1Touch ?? "-";

  if (![age, l3Motor, s1Motor, l3Touch, s1Touch].every(Number.isFinite)) {
    return null;
  }

  const ageScore = age >= 65 ? -10 : 0;
  const score = ageScore + 2 * l3Motor + 2 * s1Motor + 5 * l3Touch + 5 * s1Touch;
  const logit = -3.273 + 0.267 * score;
  const probability = Math.exp(logit) / (1 + Math.exp(logit));
  const category = categoryFor(probability);
  const proposal = proposalFor(probability);

  return {
    ageScore,
    score,
    logit,
    probability,
    category,
    proposal,
    best: { l3Motor, s1Motor, l3Touch, s1Touch },
  };
}

function categoryFor(probability) {
  if (probability >= 0.7) return "高確率";
  if (probability >= 0.3) return "中等度";
  return "低確率";
}

function proposalFor(probability) {
  const percent = probability * 100;
  if (percent <= 30) {
    return {
      band: "0-30%",
      colorClass: "band-red",
      short: "代償ADL・状態変化評価",
      text: "代償動作によるADL獲得を考慮、下肢機能の変化を評価し状態に合わせた介入計画",
    };
  }
  if (percent <= 50) {
    return {
      band: "31-50%",
      colorClass: "band-yellow",
      short: "回復介入・車いす併用ADL",
      text: "下肢機能の回復を目指した介入（下肢筋力強化、補装具を使用した立位・歩行練習）、車いすを併用したADL獲得を考慮",
    };
  }
  if (percent <= 70) {
    return {
      band: "51-70%",
      colorClass: "band-green",
      short: "補装具下で積極的立位・歩行",
      text: "補装具を使用した積極的な立位・歩行練習、車いすを併用したADL獲得を考慮",
    };
  }
  return {
    band: "71-100%",
    colorClass: "band-blue",
    short: "歩行・ADL自立を目指す",
    text: "積極的な立位・歩行練習（必要に応じて補装具使用）、歩行・ADL自立を目指す",
  };
}

function categoryClass(category) {
  if (category === "高確率") return "high";
  if (category === "中等度") return "mid";
  if (category === "低確率") return "low";
  return "";
}

function colorForCategory(category) {
  if (category === "高確率") return "#168457";
  if (category === "中等度") return "#b7791f";
  if (category === "低確率") return "#c2413d";
  return "#61706b";
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 1000) / 10}%` : "--%";
}

function defaultFormulaLines() {
  return {
    score: "score = -10 x Age65 + 2 x L3 Motor + 2 x S1 Motor + 5 x L3 LT + 5 x S1 LT",
    probability: "P = exp(-3.273 + 0.267 x score) / (1 + exp(-3.273 + 0.267 x score))",
  };
}

function formulaLinesFor(result) {
  if (!result) return defaultFormulaLines();
  const age65 = result.ageScore === -10 ? 1 : 0;
  const { l3Motor, s1Motor, l3Touch, s1Touch } = result.best;
  return {
    score: `score = -10 x ${age65} + 2 x ${l3Motor} + 2 x ${s1Motor} + 5 x ${l3Touch} + 5 x ${s1Touch} = ${result.score}`,
    probability: `P = exp(-3.273 + 0.267 x ${result.score}) / (1 + exp(-3.273 + 0.267 x ${result.score})) = ${formatPercent(result.probability)}`,
  };
}

function updateFormulaDisplay(result) {
  const lines = formulaLinesFor(result);
  $("scoreFormulaText").textContent = lines.score;
  $("probabilityFormulaText").textContent = lines.probability;
}

function setBandColor(element, colorClass) {
  element.classList.remove("band-red", "band-yellow", "band-green", "band-blue");
  if (colorClass) element.classList.add(colorClass);
}

function updateResult() {
  clampInputs();
  state.currentResult = calculateFromForm();
  const result = state.currentResult;
  const badge = $("categoryBadge");
  const probabilityBlock = document.querySelector(".probability-block");
  const proposalCard = document.querySelector(".result-panel .proposal-card");
  badge.className = "badge";
  setBandColor(probabilityBlock, "");
  setBandColor(proposalCard, "");

  if (!result) {
    badge.textContent = "未入力";
    $("probabilityText").textContent = "--%";
    $("scoreText").textContent = "-";
    $("logitText").textContent = "-";
    $("ageScoreText").textContent = "-";
    $("proposalBand").textContent = "未入力";
    $("proposalText").textContent = "確率を計算すると、歩行再建への提案が表示されます。";
    updateFormulaDisplay(null);
    drawCurve($("curveCanvas"), null);
    updateReport();
    return;
  }

  badge.textContent = result.category;
  badge.classList.add(categoryClass(result.category));
  $("probabilityText").textContent = formatPercent(result.probability);
  $("scoreText").textContent = result.score;
  $("logitText").textContent = result.logit.toFixed(3);
  $("ageScoreText").textContent = result.ageScore;
  $("proposalBand").textContent = result.proposal.band;
  $("proposalText").textContent = result.proposal.text;
  setBandColor(probabilityBlock, result.proposal.colorClass);
  setBandColor(proposalCard, result.proposal.colorClass);
  updateFormulaDisplay(result);
  drawCurve($("curveCanvas"), result);
  updateReport();
}

function collectFormRecord() {
  const result = calculateFromForm();
  if (!result) return null;
  const record = {};
  fields.forEach((id) => {
    record[id] = $(id).value;
  });
  record.caseId = record.caseId.trim();
  record.updatedAt = new Date().toISOString();
  record.result = result;
  return record;
}

function timingValidationMessage() {
  if ($("timingPreset").value !== "days") return "";
  const days = Number($("injuryDays").value);
  if (!Number.isFinite(days)) return "受傷からの日数を入力してください";
  if (days < 0 || days > 15) return "受傷からの日数は0-15日の範囲で入力してください";
  return "";
}

function fillForm(record) {
  fields.forEach((id) => {
    $(id).value = record?.[id] ?? "";
  });
  if (!record?.timingPreset) $("timingPreset").value = "72h";
  state.currentCaseId = record?.caseId ?? "";
  updateTimingInput();
  updateResult();
  showView("inputView");
}

function clearForm() {
  fields.forEach((id) => {
    $(id).value = "";
  });
  $("timingPreset").value = "72h";
  updateTimingInput();
  state.currentCaseId = "";
  updateResult();
}

async function refreshCases() {
  state.cases = (await getAllCases()).sort((a, b) =>
    String(a.caseId).localeCompare(String(b.caseId), "ja"),
  );
  renderCaseList();
  updateReport();
}

function renderCaseList() {
  const query = $("caseSearch").value.trim().toLowerCase();
  const filteredCases = state.cases.filter((item) => item.caseId.toLowerCase().includes(query));
  const cases = filteredCases.slice(0, 10);
  const body = $("caseListBody");
  body.innerHTML = "";

  cases.forEach((item) => {
    const tr = document.createElement("tr");
    const cls = categoryClass(item.result.category);
    tr.innerHTML = `
      <td>${escapeHtml(item.caseId)}</td>
      <td>${escapeHtml(item.staffName || "-")}</td>
      <td>${escapeHtml(item.age)}</td>
      <td>${item.result.score}</td>
      <td>${formatPercent(item.result.probability)}</td>
      <td><span class="badge ${cls}">${item.result.category}</span></td>
      <td>${escapeHtml(item.result.proposal?.short || proposalFor(item.result.probability).short)}</td>
      <td>${escapeHtml(timingLabel(item))}</td>
      <td>${escapeHtml(item.nli || "-")}</td>
      <td>${escapeHtml(item.ais || "-")}</td>
      <td><button class="secondary-button" type="button" data-edit="${escapeHtml(item.caseId)}">編集</button></td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const record = state.cases.find((item) => item.caseId === button.dataset.edit);
      fillForm(record);
    });
  });

  const counts = countCategories(state.cases);
  $("totalCount").textContent = state.cases.length;
  $("highCount").textContent = counts["高確率"] || 0;
  $("midCount").textContent = counts["中等度"] || 0;
  $("lowCount").textContent = counts["低確率"] || 0;
  drawCaseBars($("caseBarCanvas"), cases);
}

function updateTimingInput() {
  const isDirectDays = $("timingPreset").value === "days";
  $("injuryDaysLabel").classList.toggle("is-hidden", !isDirectDays);
  if (!isDirectDays) $("injuryDays").value = "";
}

function timingLabel(record) {
  const preset = record?.timingPreset || "";
  if (preset === "24h") return "24時間以内";
  if (preset === "48h") return "48時間以内";
  if (preset === "72h") return "72時間以内";
  if (preset === "days") return record?.injuryDays ? `${record.injuryDays}日` : "日数未入力";
  return record?.examDate || "-";
}

function countCategories(records) {
  return records.reduce((acc, record) => {
    acc[record.result.category] = (acc[record.result.category] || 0) + 1;
    return acc;
  }, {});
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewId);
  });
  if (viewId === "reportView") updateReport();
}

function predictionProbability(score) {
  const logit = -3.273 + 0.267 * score;
  return Math.exp(logit) / (1 + Math.exp(logit));
}

function drawCurve(canvas, result) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const pad = { left: 92, right: 28, top: 26, bottom: 58 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xFor = (score) => pad.left + ((score + 10) / 50) * plotW;
  const yFor = (probability) => pad.top + (1 - probability) * plotH;

  ctx.strokeStyle = "#d8e1de";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#61706b";
  ctx.font = "14px sans-serif";
  for (let p = 0; p <= 1; p += 0.25) {
    const y = yFor(p);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(p * 100)}%`, 46, y + 5);
  }
  for (let s = -10; s <= 40; s += 10) {
    const x = xFor(s);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.fillText(String(s), x - 8, height - 24);
  }

  ctx.strokeStyle = "#1c7c68";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let score = -10; score <= 40; score += 1) {
    const x = xFor(score);
    const y = yFor(predictionProbability(score));
    if (score === -10) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = "#17221f";
  ctx.font = "16px sans-serif";
  ctx.fillText("Prediction rule score", width / 2 - 78, height - 10);
  ctx.save();
  ctx.translate(18, height / 2 + 94);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("歩行自立確率", 0, 0);
  ctx.restore();

  if (!result) return;

  const color = colorForCategory(result.category);
  const x = xFor(result.score);
  const y = yFor(result.probability);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, height - pad.bottom);
  ctx.moveTo(pad.left, y);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#17221f";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(formatPercent(result.probability), Math.min(x + 12, width - 118), Math.max(y - 12, 28));
}

function drawCaseBars(canvas, records) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const pad = { left: 58, right: 24, top: 28, bottom: 76 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  ctx.strokeStyle = "#d8e1de";
  ctx.fillStyle = "#61706b";
  ctx.font = "14px sans-serif";
  for (let p = 0; p <= 1; p += 0.25) {
    const y = pad.top + (1 - p) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(p * 100)}%`, 12, y + 5);
  }

  if (!records.length) {
    ctx.fillStyle = "#61706b";
    ctx.font = "18px sans-serif";
    ctx.fillText("保存症例がありません", pad.left, pad.top + 40);
    return;
  }

  const gap = 8;
  const barW = Math.max(16, (plotW - gap * (records.length - 1)) / records.length);
  records.forEach((record, index) => {
    const x = pad.left + index * (barW + gap);
    const h = record.result.probability * plotH;
    const y = pad.top + plotH - h;
    ctx.fillStyle = colorForCategory(record.result.category);
    ctx.fillRect(x, y, barW, h);
    ctx.fillStyle = "#17221f";
    ctx.save();
    ctx.translate(x + barW / 2 - 4, height - 16);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(caseGraphLabel(record).slice(0, 22), 0, 0);
    ctx.restore();
  });
}

function caseGraphLabel(record) {
  const nli = record.nli ? ` / ${record.nli}` : "";
  return `${record.caseId}${nli}`;
}

function updateReport() {
  const result = state.currentResult;
  const caseId = $("caseId").value.trim() || "未保存症例";
  $("reportTitle").textContent = `${caseId} 症例レポート`;
  $("reportDate").textContent = new Date().toLocaleDateString("ja-JP");

  const rows = [
    ["症例ID", caseId],
    ["担当者名", $("staffName").value || "-"],
    ["受傷からの日数", timingLabel({ timingPreset: $("timingPreset").value, injuryDays: $("injuryDays").value })],
    ["ISNCSCI NLI", $("nli").value || "-"],
    ["ASIA impairment scale", $("ais").value || "-"],
    ["年齢", $("age").value || "-"],
    ["L3 Motor 右/左/採用", `${$("l3MotorR").value || "-"} / ${$("l3MotorL").value || "-"} / ${$("l3MotorBest").textContent}`],
    ["S1 Motor 右/左/採用", `${$("s1MotorR").value || "-"} / ${$("s1MotorL").value || "-"} / ${$("s1MotorBest").textContent}`],
    ["L3 Light touch 右/左/採用", `${$("l3TouchR").value || "-"} / ${$("l3TouchL").value || "-"} / ${$("l3TouchBest").textContent}`],
    ["S1 Light touch 右/左/採用", `${$("s1TouchR").value || "-"} / ${$("s1TouchL").value || "-"} / ${$("s1TouchBest").textContent}`],
  ];

  $("reportInputTable").innerHTML = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  const badge = $("reportBadge");
  const reportResult = document.querySelector(".report-result");
  const reportProposal = document.querySelector(".report-proposal");
  badge.className = "badge";
  setBandColor(reportResult, "");
  setBandColor(reportProposal, "");
  if (result) {
    const lines = formulaLinesFor(result);
    badge.textContent = result.category;
    badge.classList.add(categoryClass(result.category));
    $("reportProbability").textContent = formatPercent(result.probability);
    $("reportScore").textContent = `Prediction score: ${result.score}`;
    $("reportProposalBand").textContent = result.proposal.band;
    $("reportProposalText").textContent = result.proposal.text;
    $("reportScoreFormulaText").textContent = lines.score;
    $("reportProbabilityFormulaText").textContent = lines.probability;
    setBandColor(reportResult, result.proposal.colorClass);
    setBandColor(reportProposal, result.proposal.colorClass);
  } else {
    const lines = defaultFormulaLines();
    badge.textContent = "未入力";
    $("reportProbability").textContent = "--%";
    $("reportScore").textContent = "Prediction score: -";
    $("reportProposalBand").textContent = "未入力";
    $("reportProposalText").textContent = "確率を計算すると、歩行再建への提案が表示されます。";
    $("reportScoreFormulaText").textContent = lines.score;
    $("reportProbabilityFormulaText").textContent = lines.probability;
  }
  drawCurve($("reportCanvas"), result);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function applyZoom(zoom) {
  const safeZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(zoom) || 1));
  document.body.style.setProperty("--app-font-size", `${Math.round(16 * safeZoom)}px`);
  localStorage.setItem(ZOOM_STORAGE_KEY, String(safeZoom));
  $("zoomOutBtn").disabled = safeZoom <= ZOOM_MIN;
  $("zoomInBtn").disabled = safeZoom >= ZOOM_MAX;
}

function currentZoom() {
  return Number(localStorage.getItem(ZOOM_STORAGE_KEY)) || 1;
}

function changeZoom(delta) {
  const nextZoom = Math.round((currentZoom() + delta) * 10) / 10;
  applyZoom(nextZoom);
  showToast(`表示倍率 ${Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom)) * 100)}%`);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(state.cases, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sci-ambulation-cases-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importJson(file) {
  const text = await file.text();
  const records = JSON.parse(text);
  if (!Array.isArray(records)) throw new Error("Invalid JSON");
  for (const record of records) {
    if (record.caseId && record.result) {
      await saveCase(record);
    }
  }
  await refreshCases();
  showToast("データを読み込みました");
}

function attachEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  });

  fields.forEach((id) => {
    $(id).addEventListener("input", updateResult);
  });
  $("timingPreset").addEventListener("change", () => {
    updateTimingInput();
    updateResult();
  });

  $("caseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const timingMessage = timingValidationMessage();
    if (timingMessage) {
      showToast(timingMessage);
      return;
    }
    const record = collectFormRecord();
    if (!record || !record.caseId) {
      showToast("症例IDと必須評価項目を入力してください");
      return;
    }
    await saveCase(record);
    state.currentCaseId = record.caseId;
    await refreshCases();
    showToast("保存しました");
  });

  $("newCaseBtn").addEventListener("click", clearForm);

  $("deleteCaseBtn").addEventListener("click", async () => {
    const caseId = $("caseId").value.trim();
    if (!caseId) return;
    if (!confirm(`${caseId} を削除しますか？`)) return;
    await deleteCase(caseId);
    await refreshCases();
    clearForm();
    showToast("削除しました");
  });

  $("caseSearch").addEventListener("input", renderCaseList);
  $("printBtn").addEventListener("click", () => window.print());
  $("zoomOutBtn").addEventListener("click", () => changeZoom(-ZOOM_STEP));
  $("zoomInBtn").addEventListener("click", () => changeZoom(ZOOM_STEP));
  $("exportJsonBtn").addEventListener("click", downloadJson);
  $("importJsonInput").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      await importJson(file);
    } catch {
      showToast("読み込みに失敗しました");
    } finally {
      event.target.value = "";
    }
  });
}

async function seedIfEmpty() {
  const existing = await getAllCases();
  if (existing.length) return;
  const samples = [
    {
      caseId: "SAMPLE-001",
      staffName: "サンプル担当",
      timingPreset: "72h",
      injuryDays: "",
      nli: "T12",
      ais: "C",
      age: "45",
      l3MotorR: "3",
      l3MotorL: "3",
      s1MotorR: "2",
      s1MotorL: "2",
      l3TouchR: "2",
      l3TouchL: "2",
      s1TouchR: "1",
      s1TouchL: "1",
    },
    {
      caseId: "SAMPLE-002",
      staffName: "サンプル担当",
      timingPreset: "days",
      injuryDays: "5",
      nli: "C5",
      ais: "B",
      age: "70",
      l3MotorR: "2",
      l3MotorL: "2",
      s1MotorR: "1",
      s1MotorL: "1",
      l3TouchR: "1",
      l3TouchL: "1",
      s1TouchR: "1",
      s1TouchL: "1",
    },
  ];
  for (const sample of samples) {
    fields.forEach((id) => {
      if ($(id)) $(id).value = sample[id] || "";
    });
    await saveCase({ ...sample, updatedAt: new Date().toISOString(), result: calculateFromForm() });
  }
}

async function init() {
  state.db = await openDatabase();
  attachEvents();
  applyZoom(currentZoom());
  clearForm();
  await seedIfEmpty();
  await refreshCases();
  const first = state.cases[0];
  if (first) fillForm(first);
}

init().catch(() => {
  showToast("初期化に失敗しました");
});
