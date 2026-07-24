// js/Account.js

const displayClassEl = document.getElementById("display-class");
const pendingRequestBox = document.getElementById("pending-request-box");
const pendingRequestText = document.getElementById("pending-request-text");
const btnRequestName = document.getElementById("btn-request-name");
const newNameInput = document.getElementById("newNameInput");

let hasPendingRequest = false;

document.addEventListener("DOMContentLoaded", async () => {
    await loadAccountInfo();
    btnRequestName.addEventListener("click", requestNameChange);
});

async function loadAccountInfo() {
    if (typeof db === "undefined") return;

    const studentId = getStudentId();

    // 1. Lấy TẤT CẢ các lớp mà học sinh này đang tham gia
    //    (1 học sinh có thể được Admin thêm vào nhiều lớp cùng lúc)
    try {
        const snap = await db
            .collection("classes")
            .where("studentIds", "array-contains", studentId)
            .get();

        if (snap.empty) {
            displayClassEl.innerText = "Chưa được xếp lớp";
        } else {
            const classNames = snap.docs.map(d => d.data().name);
            displayClassEl.innerText = classNames.join(", ");
        }
    } catch (error) {
        console.error("Lỗi khi tải thông tin lớp:", error);
        displayClassEl.innerText = "⚠️ Lỗi tải dữ liệu lớp (mở Console F12 để xem chi tiết)";
    }

    // 2. Kiểm tra có yêu cầu đổi tên nào đang chờ duyệt không
    try {
        const snap = await db
            .collection("students").doc(studentId)
            .collection("nameChangeRequests")
            .where("status", "==", "pending")
            .get();

        if (!snap.empty) {
            const req = snap.docs[0].data();
            hasPendingRequest = true;
            pendingRequestText.innerText = `${req.oldName} → ${req.newName}`;
            pendingRequestBox.style.display = "block";
        }
    } catch (error) {
        console.error("Lỗi khi tải yêu cầu đổi tên:", error);
    }
}

async function requestNameChange() {
    if (typeof db === "undefined") return;

    if (hasPendingRequest) {
        alert("Bạn đang có 1 yêu cầu đổi tên chờ Admin duyệt rồi, vui lòng đợi!");
        return;
    }

    const newName = newNameInput.value.trim();
    if (newName === "") {
        alert("Vui lòng nhập tên mới!");
        return;
    }

    const oldName = localStorage.getItem("userName") || "";

    if (newName === oldName) {
        alert("Tên mới trùng với tên hiện tại!");
        return;
    }

    const studentId = getStudentId();

    btnRequestName.disabled = true;
    btnRequestName.innerText = "Đang gửi...";

    try {
        await db
            .collection("students").doc(studentId)
            .collection("nameChangeRequests")
            .add({
                oldName: oldName,
                newName: newName,
                status: "pending",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        hasPendingRequest = true;
        pendingRequestText.innerText = `${oldName} → ${newName}`;
        pendingRequestBox.style.display = "block";
        newNameInput.value = "";

        alert("Đã gửi yêu cầu đổi tên, vui lòng chờ Admin duyệt!");
    } catch (error) {
        console.error(error);
        alert("Có lỗi khi gửi yêu cầu, vui lòng thử lại!");
    } finally {
        btnRequestName.disabled = false;
        btnRequestName.innerText = "Gửi yêu cầu";
    }
}
