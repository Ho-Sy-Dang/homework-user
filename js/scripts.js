// js/scripts.js

document.addEventListener("DOMContentLoaded", () => {
    const userName = localStorage.getItem("userName");
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
    const userName = localStorage.getItem("userName");
    if (userName) {
        document.querySelectorAll(".display-user-name").forEach(el => {
            el.innerText = userName;
        });
    }
}

function handleLogout() {
    localStorage.removeItem("userName");
    // handleLogout được gọi từ pages/*.html, index.html nằm lùi ra 1 cấp
    window.location.href = "../index.html";
}

//=========================================================
// FIRESTORE - đồng bộ hồ sơ học sinh để Admin quản lý ở SMS
//=========================================================

// Mỗi trình duyệt/thiết bị được gán 1 studentId cố định,
// để mỗi lần đăng nhập lại sẽ luôn trỏ về đúng 1 document.
function getStudentId() {
    let id = localStorage.getItem("studentId");
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : "stu_" + Date.now() + "_" + Math.random().toString(16).slice(2));
        localStorage.setItem("studentId", id);
    }
    return id;
}

// Gọi khi đăng nhập lần đầu (chỉ set tên, KHÔNG set className -
// className do Admin gán qua SMS > Classes)
async function syncStudentToFirestore(name) {
    if (typeof db === "undefined") return;
    const studentId = getStudentId();

    try {
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
            showNotificationPopup(noti);
            await db
                .collection("students").doc(studentId)
                .collection("notifications").doc(doc.id)
                .update({ read: true });
        }
    } catch (error) {
        console.error("Lỗi khi kiểm tra thông báo:", error);
    }
}

function showNotificationPopup(noti) {
    let message = "";

    if (noti.type === "class_assigned") {
        message = `🏫 Bạn đã được thêm vào lớp <b>${escapeHtmlUser(noti.className)}</b>`;
    } else if (noti.type === "name_change_result") {
        message = `✅ Tên của bạn đã được đổi từ <b>${escapeHtmlUser(noti.oldName)}</b> thành <b>${escapeHtmlUser(noti.newName)}</b>`;
        // Cập nhật lại tên hiển thị ngay lập tức
        localStorage.setItem("userName", noti.newName);
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
