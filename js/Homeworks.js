// js/Homeworks.js

/*====================================================
    KIẾN TRÚC ĐỒNG BỘ

    - "assignments": chỉ lưu tham chiếu nhẹ { studentId, homeworkId, status,
      score, partResults, assignedAt, submittedAt }. KHÔNG copy nội dung bài
      (parts/category/mode/name) vào đây nữa.
    - Nội dung thật của bài (category, mode, parts, fillIn...) luôn được đọc
      TRỰC TIẾP (real-time) từ "homeworks/{homeworkId}" thông qua onSnapshot.

    => Bất cứ khi nào Admin Tạo bài mới rồi giao, hoặc Sửa/Update một bài đã
    giao, phía User sẽ tự động thấy thay đổi ngay lập tức, không cần tải lại
    trang.
====================================================*/

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

const hwReadingWorkspace = document.getElementById("hw-reading-workspace");
const hwReadingSharedWorkspace = document.getElementById("hw-reading-shared-workspace");
const hwListeningWorkspace = document.getElementById("hw-listening-workspace");

const hwAudioCard = document.getElementById("hw-audio-card");
const paneTask = document.getElementById("pane-task");
const paneQuestion = document.getElementById("pane-question");
const paneReading = document.getElementById("pane-reading");
const paneExam = document.getElementById("pane-exam");

const hwAnswerSection = document.getElementById("hw-answer-section");
const hwAnswerTitle = document.getElementById("hw-answer-title");
const hwAnswerList = document.getElementById("hw-answer-list");

const hwFillinSection = document.getElementById("hw-fillin-section");
const hwFillinList = document.getElementById("hw-fillin-list");

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

let myAssignments = [];        // [{id, studentId, homeworkId, status, score, partResults, assignedAt}]
let homeworksCache = {};       // homeworkId -> dữ liệu bài tập mới nhất (real-time)
let homeworkUnsubscribers = {}; // homeworkId -> hàm hủy theo dõi (unsubscribe)
let assignmentsUnsubscribe = null;

let activeAssignment = null;   // assignment đang làm/xem
let activeHomework = null;     // dữ liệu bài tập (category/mode/parts...) tương ứng
let activeParts = [];          // danh sách các part có nội dung (đã lọc bỏ part rỗng)
let currentPartIndex = 0;      // index trong activeParts

// studentAnswers[partIndex] = ["A", null, "C", ...] - đáp án trắc nghiệm/điền (Listening)
let studentAnswers = {};

// fillAnswers[partIndex] = ["...", "...", ...] - đáp án Fill in the blanks (Reading)
let fillAnswers = {};

const ANSWER_OPTIONS = ["A", "B", "C", "D"];

// Chữ cái tương ứng với vị trí lựa chọn: 0 -> A, 1 -> B, 2 -> C, ...
function letterFor(index) {
    return String.fromCharCode(65 + index);
}

// Chuẩn hóa 1 câu hỏi trong đáp án về format { correct, optionsCount }
// (tương thích ngược với dữ liệu cũ - chỉ là chuỗi "A"/"B"/... hoặc null)
function normalizeAnswerItem(a) {
    if (a && typeof a === "object" && "optionsCount" in a) return a;
    if (typeof a === "string" || a === null || a === undefined) {
        return { correct: a || null, optionsCount: 4 };
    }
    return { correct: null, optionsCount: 4 };
}

// Chuẩn hóa 1 câu điền từ về format { correctText }
function normalizeFillItem(a) {
    if (a && typeof a === "object" && "correctText" in a) return a;
    return { correctText: "" };
}

//=========================
// LISTENING: Player nghe (chỉ để nghe, không upload)
//=========================

function renderAudioPlayer(container, src) {
    container.innerHTML = "";

    if (!src) {
        const empty = document.createElement("div");
        empty.className = "hw-pane-empty";
        empty.innerText = "Chưa có file nghe";
        container.appendChild(empty);
        return;
    }

    container.innerHTML = `
        <div class="audio-player">
            <button type="button" class="audio-play-btn">▶️</button>
            <button type="button" class="audio-skip-btn" data-skip="-10">⏪ 10s</button>
            <input type="range" class="audio-seek" min="0" max="100" value="0" step="0.1">
            <span class="audio-time">0:00 / 0:00</span>
            <button type="button" class="audio-skip-btn" data-skip="10">10s ⏩</button>
            <audio class="audio-element" preload="metadata"></audio>
        </div>
    `;

    setupAudioPlayer(container, src);
}

function formatAudioTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

function setupAudioPlayer(container, src) {
    const audio = container.querySelector(".audio-element");
    const playBtn = container.querySelector(".audio-play-btn");
    const seek = container.querySelector(".audio-seek");
    const timeLabel = container.querySelector(".audio-time");
    const skipBtns = container.querySelectorAll(".audio-skip-btn");

    let isSeeking = false;

    audio.src = src;

    audio.addEventListener("loadedmetadata", function () {
        seek.max = audio.duration || 0;
        timeLabel.innerText = `${formatAudioTime(audio.currentTime)} / ${formatAudioTime(audio.duration)}`;
    });

    audio.addEventListener("timeupdate", function () {
        if (!isSeeking) seek.value = audio.currentTime;
        timeLabel.innerText = `${formatAudioTime(audio.currentTime)} / ${formatAudioTime(audio.duration)}`;
    });

    audio.addEventListener("ended", function () {
        playBtn.innerText = "▶️";
    });

    playBtn.addEventListener("click", function () {
        if (audio.paused) {
            audio.play();
            playBtn.innerText = "⏸️";
        } else {
            audio.pause();
            playBtn.innerText = "▶️";
        }
    });

    seek.addEventListener("mousedown", () => isSeeking = true);
    seek.addEventListener("touchstart", () => isSeeking = true);
    seek.addEventListener("mouseup", () => { isSeeking = false; audio.currentTime = parseFloat(seek.value); });
    seek.addEventListener("touchend", () => { isSeeking = false; audio.currentTime = parseFloat(seek.value); });
    seek.addEventListener("input", function () {
        if (isSeeking) timeLabel.innerText = `${formatAudioTime(seek.value)} / ${formatAudioTime(audio.duration)}`;
    });

    skipBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            const delta = parseFloat(btn.dataset.skip);
            const maxTime = isFinite(audio.duration) ? audio.duration : Infinity;
            audio.currentTime = Math.min(Math.max(0, audio.currentTime + delta), maxTime);
        });
    });
}

//=========================
// Load danh sách bài tập được giao (real-time)
//=========================

function loadAssignments() {
    if (typeof db === "undefined") {
        hwLoading.style.display = "none";
        hwEmpty.style.display = "block";
        return;
    }

    const studentId = getStudentId();

    assignmentsUnsubscribe = db
        .collection("assignments")
        .where("studentId", "==", studentId)
        .onSnapshot(function (snap) {

            myAssignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Sắp xếp bài mới giao lên trước (nếu có trường assignedAt)
            myAssignments.sort((a, b) => {
                const ta = a.assignedAt && a.assignedAt.toMillis ? a.assignedAt.toMillis() : 0;
                const tb = b.assignedAt && b.assignedAt.toMillis ? b.assignedAt.toMillis() : 0;
                return tb - ta;
            });

            hwLoading.style.display = "none";

            syncHomeworkListeners();
            renderAssignmentList();

        }, function (error) {
            console.error("Lỗi khi tải bài tập:", error);
            hwLoading.style.display = "none";
            hwEmpty.style.display = "block";
        });
}

// Gắn/hủy theo dõi real-time cho từng "homeworks/{id}" tương ứng với các bài
// đang được giao, để nội dung LUÔN đồng bộ tức thì khi Admin sửa/update.
function syncHomeworkListeners() {

    const neededIds = new Set(myAssignments.map(a => a.homeworkId).filter(Boolean));

    // Hủy theo dõi các bài không còn được giao nữa
    Object.keys(homeworkUnsubscribers).forEach(function (id) {
        if (!neededIds.has(id)) {
            homeworkUnsubscribers[id]();
            delete homeworkUnsubscribers[id];
            delete homeworksCache[id];
        }
    });

    // Gắn theo dõi mới cho các bài chưa có listener
    neededIds.forEach(function (id) {
        if (homeworkUnsubscribers[id]) return;

        homeworkUnsubscribers[id] = db.collection("homeworks").doc(id)
            .onSnapshot(function (doc) {

                homeworksCache[id] = doc.exists ? doc.data() : null;
                renderAssignmentList();

                // Nếu học sinh đang làm ĐÚNG bài này, đồng bộ lại nội dung ngay
                // (không xóa các đáp án đã chọn) để khớp với thay đổi mới nhất của Admin.
                if (activeAssignment && activeAssignment.homeworkId === id &&
                    hwDoingArea.classList.contains("active") && homeworksCache[id]) {
                    refreshActiveHomeworkContent();
                }

            }, function (error) {
                console.error("Lỗi khi theo dõi bài tập:", error);
            });
    });
}

function renderAssignmentList() {
    hwCards.innerHTML = "";

    const visible = myAssignments.filter(function (a) {
        const hw = homeworksCache[a.homeworkId];
        return hw !== null; // chỉ ẩn nếu bài đã bị Admin xóa hẳn
    });

    if (visible.length === 0) {
        hwEmpty.style.display = "block";
        return;
    }

    hwEmpty.style.display = "none";

    visible.forEach(function (a) {
        const hw = homeworksCache[a.homeworkId];

        // Bài tập chưa tải xong dữ liệu (vừa được giao, listener chưa kịp trả về)
        if (hw === undefined) {
            const loadingCard = document.createElement("div");
            loadingCard.className = "hw-card hw-card-loading";
            loadingCard.innerHTML = `<p>⏳ Đang tải bài tập...</p>`;
            hwCards.appendChild(loadingCard);
            return;
        }

        const category = hw.category === "listening" ? "listening" : "reading";
        const mode = hw.mode === "shared" ? "shared" : "private";
        const partsCount = countFilledParts(hw.parts, mode, category);
        const isDone = a.status === "done";

        const scoreText = (isDone && a.score && a.score.total > 0)
            ? ` · 🏆 ${a.score.correct}/${a.score.total} điểm`
            : (isDone ? " · ✅ Đã hoàn thành" : "");

        const categoryLabel = category === "listening" ? "🎧 Listening" : "📖 Reading";

        const card = document.createElement("div");
        card.className = "hw-card";
        card.innerHTML = `
            <div class="hw-card-row">
                <div class="hw-card-info">
                    <h3>${category === "listening" ? "🎧" : "📖"} ${escapeHw(hw.name || "Bài tập")}</h3>
                    <p class="hw-card-category">${categoryLabel}</p>
                    <p>Gồm ${partsCount} Part${partsCount > 1 ? "s" : ""}${scoreText}</p>
                </div>
                ${isDone ? `<button class="btn-delete-hw" title="Xóa bài tập">🗑️</button>` : ""}
            </div>
        `;

        card.addEventListener("click", () => {
            if (isDone && a.score) {
                showPersistedResults(a, hw);
            } else {
                startHomework(a, hw);
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
    const ok = confirm(`Xóa bài tập khỏi danh sách của bạn?`);
    if (!ok) return; // không xóa nếu người dùng chọn Cancel

    try {
        await db.collection("assignments").doc(assignment.id).delete();
        // onSnapshot ở loadAssignments() sẽ tự cập nhật lại danh sách,
        // nhưng vẫn lọc thủ công ở đây để giao diện phản hồi ngay tức thì.
        myAssignments = myAssignments.filter(a => a.id !== assignment.id);
        renderAssignmentList();
    } catch (error) {
        console.error("Lỗi khi xóa bài tập:", error);
        alert("Có lỗi khi xóa bài tập, vui lòng thử lại!");
    }
}

// Đếm số Part có nội dung, tùy theo (mode, category) của bài
function countFilledParts(parts, mode, category) {
    if (!parts) return 0;
    let count = 0;
    for (let i = 1; i <= 5; i++) {
        const p = parts[i];
        if (!p) continue;

        if (category === "listening") {
            if (p.audio || p.prompt) count++;
        } else if (mode === "shared") {
            if (p.task) count++;
        } else {
            if (p.question || p.reading) count++;
        }
    }
    return count;
}

//=========================
// Chuẩn bị dữ liệu bài làm (dùng chung cho lần đầu làm bài và Làm lại)
//=========================

function beginQuiz(assignment, hw) {
    activeAssignment = assignment;
    activeHomework = hw;

    const category = hw.category === "listening" ? "listening" : "reading";
    const mode = hw.mode === "shared" ? "shared" : "private";

    // Chỉ lấy những part có nội dung, tùy theo cấu trúc (mode, category) của bài
    activeParts = [];
    for (let i = 1; i <= 5; i++) {
        const p = hw.parts ? hw.parts[i] : null;
        if (!p) continue;

        if (category === "listening") {
            if (p.audio || p.prompt) activeParts.push(p);
        } else if (mode === "shared") {
            if (p.task) activeParts.push(p);
        } else {
            if (p.question || p.reading) activeParts.push(p);
        }
    }

    if (activeParts.length === 0) {
        alert("Bài tập này chưa có nội dung.");
        return false;
    }

    studentAnswers = {};
    fillAnswers = {};
    currentPartIndex = 0;
    return true;
}

//=========================
// Bắt đầu làm bài
//=========================

function startHomework(assignment, hw) {
    if (!beginQuiz(assignment, hw)) return;

    hwListArea.style.display = "none";
    hwResultArea.classList.remove("active");
    hwDoingArea.classList.add("active");
    hwTitle.innerText = hw.name || "Bài tập";

    renderPart();
}

// Khi Admin sửa bài ngay lúc học sinh đang làm dở: cập nhật lại nội dung
// (activeParts) từ dữ liệu mới nhất, cố gắng giữ nguyên các đáp án đã chọn.
function refreshActiveHomeworkContent() {
    const hw = homeworksCache[activeAssignment.homeworkId];
    if (!hw) return;

    activeHomework = hw;

    const category = hw.category === "listening" ? "listening" : "reading";
    const mode = hw.mode === "shared" ? "shared" : "private";

    const newParts = [];
    for (let i = 1; i <= 5; i++) {
        const p = hw.parts ? hw.parts[i] : null;
        if (!p) continue;

        if (category === "listening") {
            if (p.audio || p.prompt) newParts.push(p);
        } else if (mode === "shared") {
            if (p.task) newParts.push(p);
        } else {
            if (p.question || p.reading) newParts.push(p);
        }
    }

    if (newParts.length === 0) return;

    activeParts = newParts;
    hwTitle.innerText = hw.name || "Bài tập";

    if (currentPartIndex >= activeParts.length) {
        currentPartIndex = activeParts.length - 1;
    }

    renderPart();
}

function renderPart() {
    const part = activeParts[currentPartIndex];
    const category = activeHomework.category === "listening" ? "listening" : "reading";
    const mode = activeHomework.mode === "shared" ? "shared" : "private";

    hwPartIndicator.innerText = `Part ${currentPartIndex + 1} / ${activeParts.length}`;

    if (category === "listening") {

        hwReadingWorkspace.style.display = "none";
        hwReadingSharedWorkspace.style.display = "none";
        hwListeningWorkspace.style.display = "block";

        renderAudioPlayer(hwAudioCard, part.audio || null);
        renderPaneContent(paneTask, part.prompt);

    } else if (mode === "shared") {

        // Chung -> Reading: chỉ 1 khối "Đề Bài" duy nhất
        hwReadingWorkspace.style.display = "none";
        hwListeningWorkspace.style.display = "none";
        hwReadingSharedWorkspace.style.display = "block";

        renderPaneContent(paneExam, part.task);

    } else {

        // Riêng -> Reading: 2 khối Reading + Question tách biệt
        hwReadingWorkspace.style.display = "grid";
        hwReadingSharedWorkspace.style.display = "none";
        hwListeningWorkspace.style.display = "none";

        renderPaneContent(paneQuestion, part.question);
        renderPaneContent(paneReading, part.reading);
    }

    renderAnswerSection(part);
    renderFillInSection(part);

    btnHwBack.style.display = currentPartIndex === 0 ? "none" : "inline-block";

    if (currentPartIndex === activeParts.length - 1) {
        btnHwNext.style.display = "none";
        btnHwDone.style.display = "inline-block";
    } else {
        btnHwNext.style.display = "inline-block";
        btnHwDone.style.display = "none";
    }
}

// Question/Reading/Đề Bài giờ có thể là: null, chuỗi url ảnh (dữ liệu cũ), hoặc object
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
// Khu vực chọn đáp án A/B/C/D (hoặc điền từ) cho Part hiện tại
//=========================

function renderAnswerSection(part) {
    const answerKeyRaw = part.answers || [];

    if (answerKeyRaw.length === 0) {
        hwAnswerSection.style.display = "none";
        return;
    }

    hwAnswerSection.style.display = "block";

    hwAnswerTitle.innerText = part.questionType === "fill" ? "✏️ Điền đáp án" : "📝 Chọn đáp án";

    if (!studentAnswers[currentPartIndex]) {
        studentAnswers[currentPartIndex] = new Array(answerKeyRaw.length).fill(null);
    }

    if (part.questionType === "fill") {
        renderFillAnswerSection(answerKeyRaw);
    } else {
        renderChoiceAnswerSection(answerKeyRaw);
    }
}

function renderChoiceAnswerSection(answerKeyRaw) {
    const answerKey = answerKeyRaw.map(normalizeAnswerItem);

    hwAnswerList.innerHTML = "";

    const selectedAnswers = studentAnswers[currentPartIndex];

    answerKey.forEach(function (item, qIndex) {

        const optionsCount = item.optionsCount || 4;

        const options = [];
        for (let i = 0; i < optionsCount; i++) options.push(letterFor(i));

        const row = document.createElement("div");
        row.className = "hw-answer-row";

        const selected = selectedAnswers[qIndex];

        row.innerHTML = `
            <span class="hw-answer-label">Câu ${qIndex + 1}</span>
            <div class="hw-answer-options">
                ${options.map(v => `<button type="button" class="hw-opt-btn${selected === v ? " selected" : ""}" data-value="${v}">${v}</button>`).join("")}
            </div>
        `;

        row.querySelectorAll(".hw-opt-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                studentAnswers[currentPartIndex][qIndex] = btn.dataset.value;
                renderChoiceAnswerSection(answerKeyRaw);
            });
        });

        hwAnswerList.appendChild(row);
    });
}

// Điền từ vào chỗ trống (Listening Part 2/5) - mỗi câu là 1 ô nhập chữ tự do
function renderFillAnswerSection(answerKeyRaw) {

    hwAnswerList.innerHTML = "";

    const selectedAnswers = studentAnswers[currentPartIndex];

    answerKeyRaw.forEach(function (_item, qIndex) {

        const row = document.createElement("div");
        row.className = "hw-answer-row hw-fill-row";

        row.innerHTML = `
            <span class="hw-answer-label">Câu ${qIndex + 1}</span>
            <input type="text" class="hw-fill-input" placeholder="Nhập đáp án...">
        `;

        const input = row.querySelector(".hw-fill-input");
        input.value = selectedAnswers[qIndex] || "";

        input.addEventListener("input", function () {
            studentAnswers[currentPartIndex][qIndex] = input.value;
        });

        hwAnswerList.appendChild(row);
    });
}

//=========================
// Fill in the blanks (chỉ Reading - Riêng và Chung) - ĐỒNG BỘ với cấu hình
// Admin đã bật/tắt cho từng Part ở trang Add. Đây là phần THÊM VÀO, không
// thay thế phần trắc nghiệm phía trên.
//=========================

function renderFillInSection(part) {
    const fillIn = part.fillIn;

    if (!fillIn || !fillIn.enabled || !Array.isArray(fillIn.answers) || fillIn.answers.length === 0) {
        hwFillinSection.style.display = "none";
        return;
    }

    hwFillinSection.style.display = "block";

    if (!fillAnswers[currentPartIndex]) {
        fillAnswers[currentPartIndex] = new Array(fillIn.answers.length).fill("");
    }

    const given = fillAnswers[currentPartIndex];
    hwFillinList.innerHTML = "";

    fillIn.answers.forEach(function (_item, qIndex) {

        const row = document.createElement("div");
        row.className = "hw-answer-row hw-fill-row";

        row.innerHTML = `
            <span class="hw-answer-label">Chỗ trống ${qIndex + 1}</span>
            <input type="text" class="hw-fill-input" placeholder="Nhập đáp án...">
        `;

        const input = row.querySelector(".hw-fill-input");
        input.value = given[qIndex] || "";

        input.addEventListener("input", function () {
            fillAnswers[currentPartIndex][qIndex] = input.value;
        });

        hwFillinList.appendChild(row);
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
        const answerKeyRaw = part.answers || [];
        const total = answerKeyRaw.length;
        const given = studentAnswers[idx] || [];

        let correct = 0;

        if (part.questionType === "fill") {
            for (let q = 0; q < total; q++) {
                const item = normalizeFillItem(answerKeyRaw[q]);
                const correctText = (item.correctText || "").trim().toLowerCase();
                const givenText = (given[q] || "").trim().toLowerCase();
                if (correctText && givenText && givenText === correctText) correct++;
            }
        } else {
            for (let q = 0; q < total; q++) {
                const item = normalizeAnswerItem(answerKeyRaw[q]);
                if (item.correct && given[q] && given[q] === item.correct) correct++;
            }
        }

        // Cộng thêm điểm Fill in the blanks (Reading) nếu Admin đã bật cho Part này
        let fillTotal = 0;
        let fillCorrect = 0;

        if (part.fillIn && part.fillIn.enabled && Array.isArray(part.fillIn.answers)) {
            const fillKey = part.fillIn.answers;
            fillTotal = fillKey.length;
            const givenFill = fillAnswers[idx] || [];

            for (let q = 0; q < fillTotal; q++) {
                const item = normalizeFillItem(fillKey[q]);
                const correctText = (item.correctText || "").trim().toLowerCase();
                const givenText = (givenFill[q] || "").trim().toLowerCase();
                if (correctText && givenText && givenText === correctText) fillCorrect++;
            }
        }

        return { part: idx + 1, correct: correct + fillCorrect, total: total + fillTotal };
    });

    const totalCorrect = partResults.reduce((s, r) => s + r.correct, 0);
    const totalQuestions = partResults.reduce((s, r) => s + r.total, 0);

    return { partResults, totalCorrect, totalQuestions };
}

//=========================
// Đếm số câu chưa trả lời (để cảnh báo trước khi nộp bài)
//=========================

function countUnanswered() {
    let count = 0;

    activeParts.forEach((part, idx) => {

        const total = (part.answers || []).length;
        const given = studentAnswers[idx] || [];
        for (let q = 0; q < total; q++) {
            if (!given[q]) count++;
        }

        if (part.fillIn && part.fillIn.enabled) {
            const fillTotal = (part.fillIn.answers || []).length;
            const givenFill = fillAnswers[idx] || [];
            for (let q = 0; q < fillTotal; q++) {
                if (!givenFill[q] || !givenFill[q].trim()) count++;
            }
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
        const ok = confirm(`Bạn còn ${unanswered} câu chưa trả lời. Vẫn muốn nộp bài?`);
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

    resultTitle.innerText = (activeHomework && activeHomework.name) || "Bài tập";

    if (results.totalQuestions === 0) {
        resultScore.innerText = "Bài này chưa có câu hỏi để chấm điểm.";
    } else {
        const percent = Math.round((results.totalCorrect / results.totalQuestions) * 100);
        resultScore.innerText = `${results.totalCorrect} / ${results.totalQuestions} câu đúng (${percent}%)`;
    }

    hwResultDetail.style.display = "none";
    btnViewDetail.innerText = "Xem chi tiết";

    renderResultDetail(results.partResults);
}

// Xem lại kết quả đã lưu (khi bấm vào bài đã hoàn thành trong danh sách)
function showPersistedResults(assignment, hw) {
    activeAssignment = assignment;
    activeHomework = hw;

    hwListArea.style.display = "none";
    hwDoingArea.classList.remove("active");
    hwResultArea.classList.add("active");

    resultTitle.innerText = (hw && hw.name) || "Bài tập";

    const score = assignment.score || { correct: 0, total: 0 };

    if (!score.total) {
        resultScore.innerText = "Bài này chưa có câu hỏi để chấm điểm.";
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
    if (!activeAssignment || !activeHomework || !beginQuiz(activeAssignment, activeHomework)) return;

    hwResultArea.classList.remove("active");
    hwDoingArea.classList.add("active");
    hwTitle.innerText = (activeHomework && activeHomework.name) || "Bài tập";

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
    div.innerText = str == null ? "" : str;
    return div.innerHTML;
}

//=========================
// Khởi động
//=========================

document.addEventListener("DOMContentLoaded", loadAssignments);
