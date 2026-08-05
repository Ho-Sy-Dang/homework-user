// js/scripts.js

document.addEventListener("DOMContentLoaded", () => {
    const userName = getUserName();
    const onIndexPage = window.location.pathname.endsWith("index.html") || window.location.pathname.endsWith("/");

    // Chưa đăng nhập và không ở trang login -> đuổi về login
    // (script này được nhúng từ pages/*.html, nên index.html nằm lùi ra 1 cấp)
    if (!userName && !onIndexPage) {
        window.location.href = "../index.html";
        return;
    }

    // Đã đăng nhập và đang ở trang login -> vào thẳng Homeworks
    // (script này được nhúng từ index.html ở gốc User, Homeworks.html nằm trong pages/)
    if (userName && onIndexPage) {
        window.location.href = "pages/Homeworks.html";
        return;
    }

    updateNameDisplays();

    // Ở các trang sau khi login, luôn kiểm tra xem có thông báo mới không
    if (!onIndexPage) {
        checkNotifications();
    }
});

function updateNameDisplays() {
    const userName = getUserName();
    if (userName) {
        document.querySelectorAll(".display-user-name").forEach(el => {
            el.innerText = userName;
        });
    }
}

function handleLogout() {
    // Xóa ở CẢ 2 nơi vì không chắc lúc đăng nhập đã lưu ở localStorage hay
    // sessionStorage (tùy Remember me lúc đó bật hay tắt). Không cần xóa gì
    // khác - vì studentId giờ được TÍNH LẠI từ tên mỗi lần đăng nhập (xem
    // phần "DANH TÍNH HỌC SINH" bên dưới), không còn cái gì để "quên" cả.
    localStorage.removeItem("userName");
    sessionStorage.removeItem("userName");
    // handleLogout được gọi từ pages/*.html, index.html nằm lùi ra 1 cấp
    window.location.href = "../index.html";
}

//=========================================================
// PHIÊN ĐĂNG NHẬP (userName) - tôn trọng đúng tùy chọn "Remember me"
//
// - Remember me BẬT -> lưu vào localStorage: lần sau mở lại trình duyệt
//   (kể cả tắt máy, qua nhiều ngày/tuần/tháng) vẫn tự động vào thẳng
//   Homeworks, không giới hạn thời gian.
// - Remember me TẮT -> lưu vào sessionStorage: chỉ tồn tại trong phiên làm
//   việc hiện tại, đóng tab/trình duyệt là bị "quên" ngay. Quan trọng với
//   máy tính dùng chung (phòng máy, máy ở lớp...) để không tự động đăng
//   nhập nhầm vào tài khoản của người dùng trước.
//
// Lưu ý: trên 1 trình duyệt, "Remember me" chỉ nhớ được ĐÚNG 1 người đăng
// nhập gần nhất (giống mọi web khác). Nếu nhiều người dùng chung 1 máy,
// người dùng xong nên bấm Logout để người sau đăng nhập sạch.
//=========================================================

function getUserName() {
    return localStorage.getItem("userName") || sessionStorage.getItem("userName") || "";
}

function setUserName(name, remember) {
    if (remember) {
        localStorage.setItem("userName", name);
        sessionStorage.removeItem("userName");
    } else {
        sessionStorage.setItem("userName", name);
        localStorage.removeItem("userName");
    }
}

// Cập nhật tên hiện tại (vd sau khi Admin duyệt đổi tên) - giữ nguyên hình
// thức lưu trữ đang dùng (localStorage/sessionStorage), không đổi trạng
// thái Remember me của người dùng.
function updateStoredUserName(newName) {
    if (localStorage.getItem("userName") !== null) {
        localStorage.setItem("userName", newName);
    } else {
        sessionStorage.setItem("userName", newName);
    }
}

//=========================================================
// DANH TÍNH HỌC SINH (studentId)
//
// studentId được TÍNH THẲNG TỪ TÊN đăng nhập (không random, không lưu
// riêng theo từng máy nữa) -> CÙNG 1 TÊN, dù đăng nhập từ máy nào, trình
// duyệt nào, lúc nào, luôn cho ra ĐÚNG 1 ID -> luôn về đúng 1 tài khoản
// (tài khoản mang tên đó đầu tiên), không còn phân biệt "cùng máy" hay
// "khác máy" nữa.
//
// Đánh đổi: vì không có mật khẩu, hệ thống không thể phân biệt được 2 học
// sinh THẬT SỰ KHÁC NHAU nhưng trùng CHÍNH XÁC cùng 1 tên - trường hợp đó
// 2 em sẽ dùng chung 1 tài khoản. Nếu lớp có trùng tên, nên đăng nhập bằng
// tên đầy đủ để phân biệt (vd "Ronaldo A", "Ronaldo B").
//=========================================================

function normalizeNameKey(name) {
    return (name || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function getStudentId() {
    return "name_" + normalizeNameKey(getUserName());
}

//=========================================================
// DI CƯ DỮ LIỆU CŨ - chỉ chạy 1 lần cho mỗi tên/mỗi trình duyệt.
//
// Xử lý 2 trường hợp dữ liệu bị "treo" ở ID cũ, không tự thấy được nữa
// sau khi đổi sang cơ chế tính ID theo tên ở trên:
//   1) Tài khoản tạo TRƯỚC bản cập nhật này (ID cũ là random, lưu theo
//      từng máy trong localStorage).
//   2) Vừa được Admin duyệt đổi tên (tên mới -> ID mới khác ID cũ).
//=========================================================

async function migrateLegacyStudentData(name) {
    if (typeof db === "undefined") return;

    const nameKey = normalizeNameKey(name);
    const migratedFlag = "migrated_" + nameKey;
    if (localStorage.getItem(migratedFlag)) return; // đã di cư rồi, không lặp lại

    const newId = getStudentId();

    // ID kiểu cũ, gán riêng theo từng máy (localStorage) ở các bản trước:
    // - "studentId_<tên>": bản ngay trước bản này (theo tên nhưng vẫn random)
    // - "studentId"      : bản đầu tiên (1 ID random dùng chung cho cả máy)
    const legacyId = localStorage.getItem("studentId_" + nameKey) || localStorage.getItem("studentId");

    if (legacyId && legacyId !== newId) {
        await migrateStudentAccount(legacyId, newId);
    }

    // Dọn sạch các key kiểu cũ, không dùng tới nữa
    localStorage.removeItem("studentId_" + nameKey);
    localStorage.removeItem("studentId");
    localStorage.setItem(migratedFlag, "1");
}

// Chuyển toàn bộ dữ liệu Firestore của 1 học sinh từ ID CŨ sang ID MỚI:
// hồ sơ, bài tập đã giao (assignments), thông báo, yêu cầu đổi tên.
// Dùng chung cho cả việc di cư dữ liệu cũ VÀ việc đổi tên (đổi tên = đổi
// ID vì ID được tính từ tên).
async function migrateStudentAccount(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;

    try {
        // 1) Hồ sơ học sinh (tên, lớp học...)
        const oldDoc = await db.collection("students").doc(oldId).get();
        if (oldDoc.exists) {
            await db.collection("students").doc(newId).set(oldDoc.data(), { merge: true });
        }

        // 2) Bài tập đã giao (assignments) - chỉ cần trỏ lại field studentId,
        // không cần đổi ID document.
        const assignSnap = await db.collection("assignments").where("studentId", "==", oldId).get();
        if (!assignSnap.empty) {
            const batch = db.batch();
            assignSnap.forEach(doc => batch.update(doc.ref, { studentId: newId }));
            await batch.commit();
        }

        // 3) Thông báo & yêu cầu đổi tên còn tồn đọng (nếu có)
        await copyStudentSubcollection(oldId, newId, "notifications");
        await copyStudentSubcollection(oldId, newId, "nameChangeRequests");

    } catch (error) {
        console.error("Lỗi khi di cư dữ liệu học sinh:", error);
    }
}

async function copyStudentSubcollection(oldId, newId, subName) {
    const snap = await db.collection("students").doc(oldId).collection(subName).get();
    if (snap.empty) return;

    const batch = db.batch();
    snap.forEach(doc => {
        const ref = db.collection("students").doc(newId).collection(subName).doc(doc.id);
        batch.set(ref, doc.data());
    });
    await batch.commit();
}

//=========================================================
// FIRESTORE - đồng bộ hồ sơ học sinh để Admin quản lý ở SMS
//=========================================================

// Gọi khi đăng nhập lần đầu (chỉ set tên, KHÔNG set className -
// className do Admin gán qua SMS > Classes)
async function syncStudentToFirestore(name) {
    if (typeof db === "undefined") return;

    try {
        await migrateLegacyStudentData(name);

        const studentId = getStudentId();
        await db.collection("students").doc(studentId).set({
            name: name,
            lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error("Không thể đồng bộ học sinh lên Firestore:", error);
    }
}

//=========================================================
// THÔNG BÁO (class được gán / đổi tên được duyệt)
//=========================================================

async function checkNotifications() {
    if (typeof db === "undefined") return;
    const studentId = getStudentId();

    try {
        const snap = await db
            .collection("students").doc(studentId)
            .collection("notifications")
            .where("read", "==", false)
            .get();

        if (snap.empty) return;

        // Hiện lần lượt từng thông báo chưa đọc
        for (const doc of snap.docs) {
            const noti = doc.data();
            await showNotificationPopup(noti);
            await db
                .collection("students").doc(studentId)
                .collection("notifications").doc(doc.id)
                .update({ read: true });
        }
    } catch (error) {
        console.error("Lỗi khi kiểm tra thông báo:", error);
    }
}

async function showNotificationPopup(noti) {
    let message = "";

    if (noti.type === "class_assigned") {
        message = `🏫 Bạn đã được thêm vào lớp <b>${escapeHtmlUser(noti.className)}</b>`;
    } else if (noti.type === "name_change_result") {
        message = `✅ Tên của bạn đã được đổi từ <b>${escapeHtmlUser(noti.oldName)}</b> thành <b>${escapeHtmlUser(noti.newName)}</b>`;

        // Đổi tên = đổi luôn studentId (vì ID được tính từ tên) -> phải
        // chuyển dữ liệu (lớp học/bài tập/lịch sử) từ ID tên cũ sang ID
        // tên mới, để không bị coi là "học sinh mới".
        const oldId = "name_" + normalizeNameKey(noti.oldName);
        const newId = "name_" + normalizeNameKey(noti.newName);
        await migrateStudentAccount(oldId, newId);

        updateStoredUserName(noti.newName);
        updateNameDisplays();
    } else {
        return;
    }

    const wrap = document.createElement("div");
    wrap.className = "app-notification";
    wrap.innerHTML = `
        <span>${message}</span>
        <button class="noti-close">&times;</button>
    `;

    document.body.appendChild(wrap);

    requestAnimationFrame(() => wrap.classList.add("show"));

    wrap.querySelector(".noti-close").addEventListener("click", () => {
        wrap.classList.remove("show");
        setTimeout(() => wrap.remove(), 300);
    });

    setTimeout(() => {
        wrap.classList.remove("show");
        setTimeout(() => wrap.remove(), 300);
    }, 7000);
}

function escapeHtmlUser(str) {
    const div = document.createElement("div");
    div.innerText = str == null ? "" : str;
    return div.innerHTML;
}
