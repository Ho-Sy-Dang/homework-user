// js/Homeworks.js

//=========================
// DOM
//=========================

const hwLoading = document.getElementById("hw-loading");
const hwCards = document.getElementById("hw-cards");
const hwEmpty = document.getElementById("hw-empty");
const hwListArea = document.getElementById("hw-list-area");

const hwDoingArea = document.getElementById("hw-doing-area");
const hwTitle = document.getElementById("hw-title");
const hwPartIndicator = document.getElementById("hw-part-indicator");
const paneQuestion = document.getElementById("pane-question");
const paneReading = document.getElementById("pane-reading");

const hwAnswerSection = document.getElementById("hw-answer-section");
const hwAnswerList = document.getElementById("hw-answer-list");

const btnHwBack = document.getElementById("btn-hw-back");
const btnHwNext = document.getElementById("btn-hw-next");
const btnHwDone = document.getElementById("btn-hw-done");
const btnHwExit = document.getElementById("btn-hw-exit");

const hwResultArea = document.getElementById("hw-result-area");
const resultTitle = document.getElementById("result-title");
const resultScore = document.getElementById("result-score");
const btnViewDetail = document.getElementById("btn-view-detail");
const btnRetry = document.getElementById("btn-retry");
const btnResultClose = document.getElementById("btn-result-close");
const hwResultDetail = document.getElementById("hw-result-detail");

//=========================
// State
//=========================

let myAssignments = [];
let activeAssignment = null;
let activeParts = [];   // danh sách các part có nội dung (đã lọc bỏ part rỗng)
let currentPartIndex = 0; // index trong activeParts

// studentAnswers[partIndex] = ["A", null, "C", ...] - đáp án học sinh chọn cho part đó
let studentAnswers = {};

const ANSWER_OPTIONS = ["A", "B", "C", "D"];

//=========================
// Load danh sách bài tập được giao
//=========================

async function loadAssignments() {
    if (typeof db === "undefined") {
        hwLoading.style.display = "none";
        hwEmpty.style.display = "block";
        return;
    }

    const studentId = getStudentId();

    try {
        const snap = await db
            .collection("assignments")
            .where("studentId", "==", studentId)
            .get();

        myAssignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Sắp xếp bài mới giao lên trước (nếu có trường assignedAt)
        myAssignments.sort((a, b) => {
            const ta = a.assignedAt && a.assignedAt.toMillis ? a.assignedAt.toMillis() : 0;
            const tb = b.assignedAt && b.assignedAt.toMillis ? b.assignedAt.toMillis() : 0;
            return tb - ta;
        });

    } catch (error) {
        console.error("Lỗi khi tải bài tập:", error);
        myAssignments = [];
    }

    hwLoading.style.display = "none";
    renderAssignmentList();
}

function renderAssignmentList() {
    hwCards.innerHTML = "";

    if (myAssignments.length === 0) {
        hwEmpty.style.display = "block";
        return;
    }

    hwEmpty.style.display = "none";

    myAssignments.forEach(a => {
        const partsCount = countFilledParts(a.parts);
        const isDone = a.status === "done";

        const scoreText = (isDone && a.score && a.score.total > 0)
            ? ` · 🏆 ${a.score.correct}/${a.score.total} điểm`
            : (isDone ? " · ✅ Đã hoàn thành" : "");

        const card = document.createElement("div");
        card.className = "hw-card";
        card.innerHTML = `
            <div class="hw-card-row">
                <div class="hw-card-info">
                    <h3>📖 ${escapeHw(a.homeworkName || "Bài tập")}</h3>
                    <p>Gồm ${partsCount} Part${partsCount > 1 ? "s" : ""}${scoreText}</p>
                </div>
                ${isDone ? `<button class="btn-delete-hw" title="Xóa bài tập">🗑️</button>` : ""}
            </div>
        `;

        card.addEventListener("click", () => {
            if (isDone && a.score) {
                showPersistedResults(a);
            } else {
                startHomework(a);
            }
        });

        if (isDone) {
            card.querySelector(".btn-delete-hw").addEventListener("click", (e) => {
                e.stopPropagation(); // không mở bài tập khi bấm nút xóa
                deleteAssignment(a);
            });
        }

        hwCards.appendChild(card);
    });
}

//=========================
// Xóa bài tập đã hoàn thành khỏi danh sách
//=========================

async function deleteAssignment(assignment) {
    const ok = confirm(`Xóa bài tập "${assignment.homeworkName || "Bài tập"}" khỏi danh sách của bạn?`);
    if (!ok) return; // không xóa nếu người dùng chọn Cancel

    try {
        await db.collection("assignments").doc(assignment.id).delete();
        myAssignments = myAssignments.filter(a => a.id !== assignment.id);
        renderAssignmentList();
    } catch (error) {
        console.error("Lỗi khi xóa bài tập:", error);
        alert("Có lỗi khi xóa bài tập, vui lòng thử lại!");
    }
}

function countFilledParts(parts) {
    if (!parts) return 0;
    let count = 0;
    for (let i = 1; i <= 5; i++) {
        const p = parts[i];
        if (p && (p.question || p.reading)) count++;
    }
    return count;
}

//=========================
// Chuẩn bị dữ liệu bài làm (dùng chung cho lần đầu làm bài và Làm lại)
//=========================

function beginQuiz(assignment) {
    activeAssignment = assignment;

    // Chỉ lấy những part có nội dung (question hoặc reading)
    activeParts = [];
    for (let i = 1; i <= 5; i++) {
        const p = assignment.parts ? assignment.parts[i] : null;
        if (p && (p.question || p.reading)) {
            activeParts.push(p);
        }
    }

    if (activeParts.length === 0) {
        alert("Bài tập này chưa có nội dung.");
        return false;
    }

    studentAnswers = {};
    currentPartIndex = 0;
    return true;
}

//=========================
// Bắt đầu làm bài
//=========================

function startHomework(assignment) {
    if (!beginQuiz(assignment)) return;

    hwListArea.style.display = "none";
    hwResultArea.classList.remove("active");
    hwDoingArea.classList.add("active");
    hwTitle.innerText = assignment.homeworkName || "Bài tập";

    renderPart();
}

function renderPart() {
    const part = activeParts[currentPartIndex];

    hwPartIndicator.innerText = `Part ${currentPartIndex + 1} / ${activeParts.length}`;

    renderPaneContent(paneQuestion, part.question);
    renderPaneContent(paneReading, part.reading);
    renderAnswerSection(part);

    btnHwBack.style.display = currentPartIndex === 0 ? "none" : "inline-block";

    if (currentPartIndex === activeParts.length - 1) {
        btnHwNext.style.display = "none";
        btnHwDone.style.display = "inline-block";
    } else {
        btnHwNext.style.display = "inline-block";
        btnHwDone.style.display = "none";
    }
}

// Question/Reading giờ có thể là: null, chuỗi url ảnh (dữ liệu cũ), hoặc object
// { type: "image", value: url } / { type: "text", content: "..." } (dữ liệu mới)
function renderPaneContent(container, fieldData) {
    container.innerHTML = "";

    if (!fieldData) {
        const empty = document.createElement("div");
        empty.className = "hw-pane-empty";
        empty.innerText = "Không có nội dung";
        container.appendChild(empty);
        return;
    }

    // Dữ liệu cũ: fieldData là 1 chuỗi url ảnh
    if (typeof fieldData === "string") {
        const img = document.createElement("img");
        img.src = fieldData;
        container.appendChild(img);
        return;
    }

    if (fieldData.type === "text") {
        // Nội dung dài (cô copy từ Word) -> hiển thị dạng chữ, có thanh cuộn riêng
        const textBox = document.createElement("div");
        textBox.className = "hw-pane-text";
        textBox.innerText = fieldData.content || "";
        container.appendChild(textBox);
        return;
    }

    // fieldData.type === "image"
    if (fieldData.value) {
        const img = document.createElement("img");
        img.src = fieldData.value;
        container.appendChild(img);
    } else {
        const empty = document.createElement("div");
        empty.className = "hw-pane-empty";
        empty.innerText = "Không có nội dung";
        container.appendChild(empty);
    }
}

//=========================
// Khu vực chọn đáp án A/B/C/D cho Part hiện tại
//=========================

function renderAnswerSection(part) {
    const answerKey = part.answers || [];

    if (answerKey.length === 0) {
        hwAnswerSection.style.display = "none";
        return;
    }

    hwAnswerSection.style.display = "block";

    if (!studentAnswers[currentPartIndex]) {
        studentAnswers[currentPartIndex] = new Array(answerKey.length).fill(null);
    }

    hwAnswerList.innerHTML = "";

    const selectedAnswers = studentAnswers[currentPartIndex];

    answerKey.forEach(function (_correctAnswer, qIndex) {

        const row = document.createElement("div");
        row.className = "hw-answer-row";

        const selected = selectedAnswers[qIndex];

        row.innerHTML = `
            <span class="hw-answer-label">Câu ${qIndex + 1}</span>
            <div class="hw-answer-options">
                ${ANSWER_OPTIONS.map(v => `<button type="button" class="hw-opt-btn${selected === v ? " selected" : ""}" data-value="${v}">${v}</button>`).join("")}
            </div>
        `;

        row.querySelectorAll(".hw-opt-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                studentAnswers[currentPartIndex][qIndex] = btn.dataset.value;
                renderAnswerSection(part);
            });
        });

        hwAnswerList.appendChild(row);
    });
}

btnHwNext.addEventListener("click", () => {
    if (currentPartIndex < activeParts.length - 1) {
        currentPartIndex++;
        renderPart();
    }
});

btnHwBack.addEventListener("click", () => {
    if (currentPartIndex > 0) {
        currentPartIndex--;
        renderPart();
    }
});

//=========================
// Thoát giữa bài (không nộp bài)
//=========================

btnHwExit.addEventListener("click", () => {
    const ok = confirm("Thoát bài làm? Các đáp án đang chọn sẽ không được lưu.");
    if (!ok) return;

    hwDoingArea.classList.remove("active");
    hwListArea.style.display = "block";
    renderAssignmentList();
});

//=========================
// Chấm điểm
//=========================

function computeResults() {
    const partResults = activeParts.map((part, idx) => {
        const answerKey = part.answers || [];
        const total = answerKey.length;
        const given = studentAnswers[idx] || [];

        let correct = 0;
        for (let q = 0; q < total; q++) {
            if (answerKey[q] && given[q] && given[q] === answerKey[q]) correct++;
        }

        return { part: idx + 1, correct, total };
    });

    const totalCorrect = partResults.reduce((s, r) => s + r.correct, 0);
    const totalQuestions = partResults.reduce((s, r) => s + r.total, 0);

    return { partResults, totalCorrect, totalQuestions };
}

//=========================
// Đếm số câu chưa chọn đáp án (để cảnh báo trước khi nộp bài)
//=========================

function countUnanswered() {
    let count = 0;
    activeParts.forEach((part, idx) => {
        const total = (part.answers || []).length;
        const given = studentAnswers[idx] || [];
        for (let q = 0; q < total; q++) {
            if (!given[q]) count++;
        }
    });
    return count;
}

//=========================
// Submit
//=========================

btnHwDone.addEventListener("click", async () => {
    const unanswered = countUnanswered();

    if (unanswered > 0) {
        const ok = confirm(`Bạn còn ${unanswered} câu chưa chọn đáp án. Vẫn muốn nộp bài?`);
        if (!ok) return;
    }

    const results = computeResults();

    try {
        if (typeof db !== "undefined" && activeAssignment) {
            await db.collection("assignments").doc(activeAssignment.id).update({
                status: "done",
                score: { correct: results.totalCorrect, total: results.totalQuestions },
                partResults: results.partResults,
                submittedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            activeAssignment.status = "done";
            activeAssignment.score = { correct: results.totalCorrect, total: results.totalQuestions };
            activeAssignment.partResults = results.partResults;
        }
    } catch (error) {
        console.error(error);
    }

    showResults(results);
});

//=========================
// Màn hình kết quả
//=========================

function renderResultDetail(partResults) {
    hwResultDetail.innerHTML = `
        <div class="hw-detail-box">
            ${partResults.map(r => `
                <div class="hw-detail-row">
                    <span>PART ${r.part}</span>
                    <span>${r.correct}/${r.total}</span>
                </div>
            `).join("")}
        </div>
    `;
}

function showResults(results) {
    hwDoingArea.classList.remove("active");
    hwResultArea.classList.add("active");

    resultTitle.innerText = activeAssignment.homeworkName || "Bài tập";

    if (results.totalQuestions === 0) {
        resultScore.innerText = "Bài này chưa có câu hỏi trắc nghiệm để chấm điểm.";
    } else {
        const percent = Math.round((results.totalCorrect / results.totalQuestions) * 100);
        resultScore.innerText = `${results.totalCorrect} / ${results.totalQuestions} câu đúng (${percent}%)`;
    }

    hwResultDetail.style.display = "none";
    btnViewDetail.innerText = "Xem chi tiết";

    renderResultDetail(results.partResults);
}

// Xem lại kết quả đã lưu (khi bấm vào bài đã hoàn thành trong danh sách)
function showPersistedResults(assignment) {
    activeAssignment = assignment;

    hwListArea.style.display = "none";
    hwDoingArea.classList.remove("active");
    hwResultArea.classList.add("active");

    resultTitle.innerText = assignment.homeworkName || "Bài tập";

    const score = assignment.score || { correct: 0, total: 0 };

    if (!score.total) {
        resultScore.innerText = "Bài này chưa có câu hỏi trắc nghiệm để chấm điểm.";
    } else {
        const percent = Math.round((score.correct / score.total) * 100);
        resultScore.innerText = `${score.correct} / ${score.total} câu đúng (${percent}%)`;
    }

    hwResultDetail.style.display = "none";
    btnViewDetail.innerText = "Xem chi tiết";

    renderResultDetail(assignment.partResults || []);
}

btnViewDetail.addEventListener("click", () => {
    const showing = hwResultDetail.style.display !== "none";
    hwResultDetail.style.display = showing ? "none" : "block";
    btnViewDetail.innerText = showing ? "Xem chi tiết" : "Ẩn chi tiết";
});

//=========================
// Làm lại
//=========================

btnRetry.addEventListener("click", () => {
    if (!activeAssignment || !beginQuiz(activeAssignment)) return;

    hwResultArea.classList.remove("active");
    hwDoingArea.classList.add("active");
    hwTitle.innerText = activeAssignment.homeworkName || "Bài tập";

    renderPart();
});

//=========================
// Quay lại danh sách (từ màn hình kết quả)
//=========================

btnResultClose.addEventListener("click", () => {
    hwResultArea.classList.remove("active");
    hwListArea.style.display = "block";
    renderAssignmentList();
});

function escapeHw(str) {
    const div = document.createElement("div");
    div.innerText = str;
    return div.innerHTML;
}

//=========================
// Khởi động
//=========================

document.addEventListener("DOMContentLoaded", loadAssignments);
